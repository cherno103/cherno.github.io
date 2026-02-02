const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const winston = require('winston');
const { exec } = require('child_process');
const util = require('util');
const zlib = require('zlib');
const { promisify } = require('util');

const execPromise = util.promisify(exec);
const gzip = promisify(zlib.gzip);
const gunzip = promisify(zlib.gunzip);

const logger = winston.createLogger({
    level: 'info',
    format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
    ),
    transports: [
        new winston.transports.File({ filename: 'logs/backup.log' }),
        new winston.transports.Console({
            format: winston.format.combine(
                winston.format.colorize(),
                winston.format.simple()
            )
        })
    ]
});

class DatabaseBackup {
    constructor() {
        this.backupDir = process.env.BACKUP_PATH || './backups';
        this.retentionDays = parseInt(process.env.BACKUP_RETENTION_DAYS) || 30;
        this.encryptionKey = process.env.BACKUP_ENCRYPTION_KEY;
        this.compressionLevel = parseInt(process.env.BACKUP_COMPRESSION_LEVEL) || 6;
        this.maxBackupSize = parseInt(process.env.MAX_BACKUP_SIZE) || 1024 * 1024 * 1024; // 1GB
        
        // Создаем папку для бэкапов если ее нет
        if (!fs.existsSync(this.backupDir)) {
            fs.mkdirSync(this.backupDir, { recursive: true });
            logger.info(`Created backup directory: ${this.backupDir}`);
        }
        
        // Проверяем доступное место на диске
        this.checkDiskSpace();
    }

    async checkDiskSpace() {
        try {
            const { stdout } = await execPromise('df -k .');
            const lines = stdout.trim().split('\n');
            if (lines.length > 1) {
                const parts = lines[1].split(/\s+/);
                const freeSpace = parseInt(parts[3]) * 1024; // Convert KB to bytes
                
                if (freeSpace < this.maxBackupSize * 2) {
                    logger.warn(`Low disk space: ${(freeSpace / 1024 / 1024).toFixed(2)}MB free`);
                    return false;
                }
            }
            return true;
        } catch (error) {
            logger.error('Error checking disk space:', error);
            return true; // Continue anyway
        }
    }

    async createBackup() {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const backupName = `backup-${timestamp}.db`;
        const backupPath = path.join(this.backupDir, backupName);
        const sourcePath = './database.db';

        return new Promise((resolve, reject) => {
            // Проверяем существование исходной базы
            if (!fs.existsSync(sourcePath)) {
                return reject(new Error('Source database not found'));
            }

            logger.info(`Creating backup: ${backupName}`);

            // Сначала делаем копию базы
            fs.copyFile(sourcePath, backupPath, async (err) => {
                if (err) {
                    logger.error('Backup copy failed:', err);
                    return reject(err);
                }

                try {
                    // Проверяем целостность базы
                    await this.verifyDatabaseIntegrity(backupPath);
                    
                    let finalBackupPath = backupPath;
                    
                    // Сжимаем бэкап
                    if (this.compressionLevel > 0) {
                        finalBackupPath = await this.compressBackup(backupPath);
                    }
                    
                    // Шифруем бэкап если есть ключ
                    if (this.encryptionKey) {
                        finalBackupPath = await this.encryptBackup(finalBackupPath);
                    }
                    
                    // Создаем контрольную сумму
                    const checksum = await this.calculateChecksum(finalBackupPath);
                    const checksumFile = finalBackupPath + '.sha256';
                    fs.writeFileSync(checksumFile, checksum);

                    // Очищаем старые бэкапы
                    await this.cleanupOldBackups();

                    const backupStats = fs.statSync(finalBackupPath);
                    
                    logger.info(`Backup created successfully: ${path.basename(finalBackupPath)} (${(backupStats.size / 1024 / 1024).toFixed(2)} MB)`);
                    
                    resolve({
                        name: path.basename(finalBackupPath),
                        path: finalBackupPath,
                        size: backupStats.size,
                        checksum,
                        timestamp: new Date().toISOString(),
                        compressed: this.compressionLevel > 0,
                        encrypted: !!this.encryptionKey
                    });
                } catch (error) {
                    // Удаляем временные файлы при ошибке
                    if (fs.existsSync(backupPath)) fs.unlinkSync(backupPath);
                    reject(error);
                }
            });
        });
    }

    async verifyDatabaseIntegrity(dbPath) {
        return new Promise((resolve, reject) => {
            const sqlite3 = require('sqlite3').verbose();
            const db = new sqlite3.Database(dbPath, sqlite3.OPEN_READONLY, (err) => {
                if (err) {
                    return reject(new Error('Invalid database file'));
                }
                
                // Проверяем целостность
                db.get('PRAGMA integrity_check', (err, result) => {
                    db.close();
                    
                    if (err) {
                        return reject(new Error('Database integrity check failed'));
                    }
                    
                    if (result && result.integrity_check === 'ok') {
                        resolve(true);
                    } else {
                        reject(new Error('Database corrupted'));
                    }
                });
            });
        });
    }

    async compressBackup(filePath) {
        const compressedPath = filePath + '.gz';
        
        try {
            const data = fs.readFileSync(filePath);
            const compressed = await gzip(data, { level: this.compressionLevel });
            fs.writeFileSync(compressedPath, compressed);
            
            // Удаляем оригинальный файл
            fs.unlinkSync(filePath);
            
            return compressedPath;
        } catch (error) {
            throw new Error(`Compression failed: ${error.message}`);
        }
    }

    async encryptBackup(filePath) {
        if (!this.encryptionKey) {
            throw new Error('Encryption key not configured');
        }

        return new Promise((resolve, reject) => {
            const algorithm = 'aes-256-gcm';
            const iv = crypto.randomBytes(16);
            const salt = crypto.randomBytes(64);
            
            // Генерируем ключ из пароля
            crypto.pbkdf2(this.encryptionKey, salt, 100000, 32, 'sha256', (err, key) => {
                if (err) return reject(err);
                
                const cipher = crypto.createCipheriv(algorithm, key, iv);
                const input = fs.createReadStream(filePath);
                const output = fs.createWriteStream(filePath + '.enc');
                
                // Записываем соль и IV в начало файла
                output.write(salt);
                output.write(iv);
                
                input.pipe(cipher).pipe(output);
                
                output.on('finish', () => {
                    // Удаляем оригинальный файл
                    fs.unlinkSync(filePath);
                    resolve(filePath + '.enc');
                });
                
                output.on('error', reject);
            });
        });
    }

    async calculateChecksum(filePath) {
        return new Promise((resolve, reject) => {
            const hash = crypto.createHash('sha256');
            const stream = fs.createReadStream(filePath);

            stream.on('data', data => hash.update(data));
            stream.on('end', () => resolve(hash.digest('hex')));
            stream.on('error', reject);
        });
    }

    async cleanupOldBackups() {
        try {
            const files = fs.readdirSync(this.backupDir);
            const now = Date.now();
            const retentionMs = this.retentionDays * 24 * 60 * 60 * 1000;

            let deletedCount = 0;
            let totalFreed = 0;

            for (const file of files) {
                if (file.startsWith('backup-')) {
                    const filePath = path.join(this.backupDir, file);
                    const stats = fs.statSync(filePath);
                    const age = now - stats.mtimeMs;

                    if (age > retentionMs) {
                        try {
                            const fileSize = stats.size;
                            fs.unlinkSync(filePath);
                            
                            // Удаляем файл контрольной суммы если существует
                            const checksumFile = filePath + '.sha256';
                            if (fs.existsSync(checksumFile)) {
                                fs.unlinkSync(checksumFile);
                            }

                            deletedCount++;
                            totalFreed += fileSize;
                            
                            logger.info(`Removed old backup: ${file} (${(fileSize / 1024 / 1024).toFixed(2)} MB)`);
                        } catch (err) {
                            logger.error(`Failed to remove old backup ${file}:`, err);
                        }
                    }
                }
            }

            if (deletedCount > 0) {
                logger.info(`Cleaned up ${deletedCount} old backups, freed ${(totalFreed / 1024 / 1024).toFixed(2)} MB`);
            }
        } catch (error) {
            logger.error('Error cleaning old backups:', error);
        }
    }

    async restoreBackup(backupName) {
        const backupPath = path.join(this.backupDir, backupName);
        
        if (!fs.existsSync(backupPath)) {
            throw new Error(`Backup not found: ${backupName}`);
        }

        // Проверяем контрольную сумму
        await this.verifyChecksum(backupPath);

        let restorePath = backupPath;
        
        // Расшифровываем если файл зашифрован
        if (backupPath.endsWith('.enc')) {
            restorePath = await this.decryptBackup(backupPath);
        }
        
        // Распаковываем если файл сжат
        if (restorePath.endsWith('.gz')) {
            restorePath = await this.decompressBackup(restorePath);
        }

        logger.info(`Restoring from backup: ${backupName}`);

        // Создаем резервную копию текущей базы
        const currentBackup = await this.createBackup();
        logger.info(`Created backup of current database: ${currentBackup.name}`);

        // Восстанавливаем базу
        fs.copyFileSync(restorePath, './database.db');

        // Удаляем временные файлы
        if (restorePath !== backupPath && fs.existsSync(restorePath)) {
            fs.unlinkSync(restorePath);
        }

        // Проверяем целостность восстановленной базы
        await this.verifyDatabaseIntegrity('./database.db');

        logger.info(`Database restored from: ${backupName}`);
        return {
            success: true,
            restoredFrom: backupName,
            previousBackup: currentBackup.name,
            timestamp: new Date().toISOString()
        };
    }

    async verifyChecksum(filePath) {
        const checksumFile = filePath + '.sha256';
        
        if (!fs.existsSync(checksumFile)) {
            logger.warn(`No checksum file found for: ${path.basename(filePath)}`);
            return true;
        }

        const expectedChecksum = fs.readFileSync(checksumFile, 'utf8').trim();
        const actualChecksum = await this.calculateChecksum(filePath);

        if (expectedChecksum !== actualChecksum) {
            throw new Error(`Checksum verification failed for: ${path.basename(filePath)}`);
        }

        return true;
    }

    async decryptBackup(encryptedPath) {
        if (!this.encryptionKey) {
            throw new Error('Encryption key not configured for decryption');
        }

        return new Promise((resolve, reject) => {
            const decryptedPath = encryptedPath.replace('.enc', '');
            const algorithm = 'aes-256-gcm';

            const input = fs.createReadStream(encryptedPath);
            const output = fs.createWriteStream(decryptedPath);

            // Читаем соль и IV из начала файла
            input.once('readable', () => {
                const salt = input.read(64);
                const iv = input.read(16);
                
                if (!salt || salt.length !== 64 || !iv || iv.length !== 16) {
                    return reject(new Error('Invalid encrypted file format'));
                }

                // Генерируем ключ из пароля
                crypto.pbkdf2(this.encryptionKey, salt, 100000, 32, 'sha256', (err, key) => {
                    if (err) return reject(err);
                    
                    const decipher = crypto.createDecipheriv(algorithm, key, iv);
                    input.pipe(decipher).pipe(output);

                    output.on('finish', () => resolve(decryptedPath));
                    output.on('error', reject);
                });
            });
        });
    }

    async decompressBackup(compressedPath) {
        const decompressedPath = compressedPath.replace('.gz', '');
        
        try {
            const compressed = fs.readFileSync(compressedPath);
            const decompressed = await gunzip(compressed);
            fs.writeFileSync(decompressedPath, decompressed);
            
            return decompressedPath;
        } catch (error) {
            throw new Error(`Decompression failed: ${error.message}`);
        }
    }

    getBackupList() {
        try {
            const files = fs.readdirSync(this.backupDir);
            const backups = [];

            for (const file of files) {
                if (file.startsWith('backup-')) {
                    const filePath = path.join(this.backupDir, file);
                    const stats = fs.statSync(filePath);
                    
                    backups.push({
                        name: file,
                        size: stats.size,
                        created: stats.mtime,
                        modified: stats.mtime,
                        path: filePath,
                        encrypted: file.endsWith('.enc'),
                        compressed: file.endsWith('.gz') || (file.endsWith('.enc') && file.includes('.gz')),
                        hasChecksum: fs.existsSync(filePath + '.sha256')
                    });
                }
            }

            return backups.sort((a, b) => new Date(b.created) - new Date(a.created));
        } catch (error) {
            logger.error('Error getting backup list:', error);
            return [];
        }
    }

    async getBackupInfo(backupName) {
        const backupPath = path.join(this.backupDir, backupName);
        
        if (!fs.existsSync(backupPath)) {
            return null;
        }

        const stats = fs.statSync(backupPath);
        let checksum = null;
        
        const checksumFile = backupPath + '.sha256';
        if (fs.existsSync(checksumFile)) {
            checksum = fs.readFileSync(checksumFile, 'utf8').trim();
        }

        return {
            name: backupName,
            path: backupPath,
            size: stats.size,
            created: stats.ctime,
            modified: stats.mtime,
            checksum,
            encrypted: backupPath.endsWith('.enc'),
            compressed: backupPath.endsWith('.gz') || (backupPath.endsWith('.enc') && backupPath.includes('.gz'))
        };
    }

    async backupToRemote(localBackupPath, remoteConfig) {
        // Заглушка для удаленного бэкапа
        // В реальном приложении здесь была бы интеграция с S3, FTP, etc.
        logger.info(`Backup would be sent to remote: ${localBackupPath}`);
        return { success: true, remotePath: 'remote/path/' + path.basename(localBackupPath) };
    }
}

// CLI интерфейс
if (require.main === module) {
    const backup = new DatabaseBackup();
    const command = process.argv[2];

    async function handleCommand() {
        try {
            switch (command) {
                case 'create':
                    const result = await backup.createBackup();
                    console.log('✅ Backup created:');
                    console.log(`   Name: ${result.name}`);
                    console.log(`   Size: ${(result.size / 1024 / 1024).toFixed(2)} MB`);
                    console.log(`   Checksum: ${result.checksum}`);
                    console.log(`   Timestamp: ${result.timestamp}`);
                    break;

                case 'list':
                    const backups = backup.getBackupList();
                    console.log('📦 Available backups:');
                    if (backups.length === 0) {
                        console.log('   No backups found');
                    } else {
                        backups.forEach((b, i) => {
                            const sizeMB = (b.size / 1024 / 1024).toFixed(2);
                            const flags = [];
                            if (b.encrypted) flags.push('🔒');
                            if (b.compressed) flags.push('🗜️');
                            if (b.hasChecksum) flags.push('✓');
                            
                            console.log(`${i + 1}. ${b.name} ${flags.join('')}`);
                            console.log(`   Size: ${sizeMB} MB | Created: ${b.created}`);
                        });
                        console.log(`\nTotal: ${backups.length} backup(s)`);
                    }
                    break;

                case 'info':
                    const backupName = process.argv[3];
                    if (!backupName) {
                        console.error('Usage: node backup-database.js info <backup-name>');
                        process.exit(1);
                    }
                    
                    const info = await backup.getBackupInfo(backupName);
                    if (!info) {
                        console.error(`Backup not found: ${backupName}`);
                        process.exit(1);
                    }
                    
                    console.log('📋 Backup info:');
                    console.log(`   Name: ${info.name}`);
                    console.log(`   Size: ${(info.size / 1024 / 1024).toFixed(2)} MB`);
                    console.log(`   Created: ${info.created}`);
                    console.log(`   Modified: ${info.modified}`);
                    console.log(`   Encrypted: ${info.encrypted ? 'Yes' : 'No'}`);
                    console.log(`   Compressed: ${info.compressed ? 'Yes' : 'No'}`);
                    console.log(`   Checksum: ${info.checksum || 'Not available'}`);
                    break;

                case 'restore':
                    const restoreName = process.argv[3];
                    if (!restoreName) {
                        console.error('Usage: node backup-database.js restore <backup-name>');
                        process.exit(1);
                    }
                    
                    const restoreResult = await backup.restoreBackup(restoreName);
                    console.log('✅ Database restored:');
                    console.log(`   From: ${restoreResult.restoredFrom}`);
                    console.log(`   Previous backup: ${restoreResult.previousBackup}`);
                    console.log(`   Timestamp: ${restoreResult.timestamp}`);
                    break;

                case 'verify':
                    const verifyName = process.argv[3] || 'latest';
                    let backupToVerify;
                    
                    if (verifyName === 'latest') {
                        const backups = backup.getBackupList();
                        if (backups.length === 0) {
                            console.error('No backups found');
                            process.exit(1);
                        }
                        backupToVerify = backups[0].name;
                    } else {
                        backupToVerify = verifyName;
                    }
                    
                    const verifyPath = path.join(backup.backupDir, backupToVerify);
                    if (!fs.existsSync(verifyPath)) {
                        console.error(`Backup not found: ${backupToVerify}`);
                        process.exit(1);
                    }
                    
                    try {
                        await backup.verifyChecksum(verifyPath);
                        console.log(`✅ Checksum verified for: ${backupToVerify}`);
                    } catch (error) {
                        console.error(`❌ Checksum verification failed: ${error.message}`);
                        process.exit(1);
                    }
                    break;

                case 'cleanup':
                    console.log('🧹 Cleaning up old backups...');
                    await backup.cleanupOldBackups();
                    console.log('✅ Cleanup completed');
                    break;

                default:
                    console.log('🔧 Database Backup Tool');
                    console.log('Usage:');
                    console.log('  node backup-database.js create           - Create new backup');
                    console.log('  node backup-database.js list             - List available backups');
                    console.log('  node backup-database.js info <name>      - Show backup info');
                    console.log('  node backup-database.js restore <name>   - Restore from backup');
                    console.log('  node backup-database.js verify [name]    - Verify backup checksum (default: latest)');
                    console.log('  node backup-database.js cleanup          - Clean up old backups');
                    console.log('\nExamples:');
                    console.log('  node backup-database.js create');
                    console.log('  node backup-database.js list');
                    console.log('  node backup-database.js restore backup-2024-01-15T12-30-00Z.db');
            }
        } catch (error) {
            console.error('❌ Error:', error.message);
            process.exit(1);
        }
    }

    handleCommand();
}

module.exports = DatabaseBackup;