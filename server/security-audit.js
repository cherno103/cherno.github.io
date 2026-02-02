const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const winston = require('winston');
const { exec } = require('child_process');
const util = require('util');

const execPromise = util.promisify(exec);

const logger = winston.createLogger({
    level: 'info',
    format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
    ),
    transports: [
        new winston.transports.File({ filename: 'logs/security-audit.log' }),
        new winston.transports.Console({
            format: winston.format.combine(
                winston.format.colorize(),
                winston.format.simple()
            )
        })
    ]
});

class SecurityAudit {
    constructor() {
        this.auditResults = [];
        this.startTime = Date.now();
        this.config = {
            criticalScore: 10,
            highScore: 7,
            mediumScore: 4,
            lowScore: 1
        };
    }

    async runFullAudit() {
        console.log('🔍 Запуск комплексной проверки безопасности...\n');
        
        try {
            await this.checkEnvironmentVariables();
            await this.checkFilePermissions();
            await this.checkDatabaseSecurity();
            await this.checkDependencies();
            await this.checkCodeQuality();
            await this.checkNetworkSecurity();
            await this.checkAuthentication();
            await this.checkSessionManagement();
            
            this.generateReport();
        } catch (error) {
            console.error('❌ Ошибка при выполнении аудита:', error);
            process.exit(1);
        }
    }

    async checkEnvironmentVariables() {
        console.log('📝 Проверка переменных окружения...');
        
        const requiredEnvVars = [
            'JWT_SECRET',
            'PEPPER',
            'SESSION_SECRET',
            'UNITPAY_SECRET_KEY'
        ];

        const missing = requiredEnvVars.filter(key => !process.env[key]);
        
        if (missing.length > 0) {
            this.addAuditResult({
                severity: 'CRITICAL',
                category: 'Environment',
                issue: `Отсутствуют обязательные переменные окружения: ${missing.join(', ')}`,
                recommendation: 'Заполните все переменные в .env файле',
                score: this.config.criticalScore
            });
        }

        // Проверка на значения по умолчанию
        const defaultValues = [
            { key: 'JWT_SECRET', value: 'your-super-secret-jwt-key-change-this' },
            { key: 'PEPPER', value: 'your-pepper-string-for-password-hashing-change-this' },
            { key: 'SESSION_SECRET', value: 'your-session-secret-key-change-this' }
        ];

        defaultValues.forEach(({ key, value }) => {
            if (process.env[key] === value) {
                this.addAuditResult({
                    severity: 'CRITICAL',
                    category: 'Environment',
                    issue: `Переменная ${key} имеет значение по умолчанию`,
                    recommendation: 'Замените значение на уникальное секретное',
                    score: this.config.criticalScore
                });
            }
        });

        // Проверка силы JWT секрета
        if (process.env.JWT_SECRET && process.env.JWT_SECRET.length < 32) {
            this.addAuditResult({
                severity: 'HIGH',
                category: 'Environment',
                issue: 'JWT_SECRET слишком короткий (меньше 32 символов)',
                recommendation: 'Используйте минимум 32 символа',
                score: this.config.highScore
            });
        }

        // Проверка PEPPER
        if (process.env.PEPPER && process.env.PEPPER.length < 16) {
            this.addAuditResult({
                severity: 'HIGH',
                category: 'Environment',
                issue: 'PEPPER слишком короткий (меньше 16 символов)',
                recommendation: 'Используйте минимум 16 символов',
                score: this.config.highScore
            });
        }
    }

    async checkFilePermissions() {
        console.log('📁 Проверка прав доступа к файлам...');
        
        const sensitiveFiles = [
            { path: '.env', maxPerm: 600 },
            { path: 'database.db', maxPerm: 640 },
            { path: 'logs/error.log', maxPerm: 640 },
            { path: 'logs/combined.log', maxPerm: 640 },
            { path: 'logs/security-audit.log', maxPerm: 640 }
        ];

        for (const { path: filePath, maxPerm } of sensitiveFiles) {
            try {
                if (fs.existsSync(filePath)) {
                    const stats = fs.statSync(filePath);
                    const mode = stats.mode.toString(8).slice(-3);
                    
                    if (parseInt(mode, 8) > maxPerm) {
                        this.addAuditResult({
                            severity: 'HIGH',
                            category: 'File Permissions',
                            issue: `Файл ${filePath} имеет слишком открытые права: ${mode}`,
                            recommendation: `Установите права ${maxPerm.toString(8)}: chmod ${maxPerm.toString(8)} ${filePath}`,
                            score: this.config.highScore
                        });
                    }
                }
            } catch (err) {
                // Файл может не существовать
            }
        }

        // Проверка наличия папок
        const requiredDirs = ['logs', 'backups'];
        requiredDirs.forEach(dir => {
            if (!fs.existsSync(dir)) {
                this.addAuditResult({
                    severity: 'MEDIUM',
                    category: 'File Structure',
                    issue: `Отсутствует папка: ${dir}`,
                    recommendation: `Создайте папку: mkdir ${dir}`,
                    score: this.config.mediumScore
                });
            }
        });
    }

    async checkDatabaseSecurity() {
        console.log('🗄️ Проверка безопасности базы данных...');
        
        const dbPath = './database.db';
        
        if (fs.existsSync(dbPath)) {
            try {
                const stats = fs.statSync(dbPath);
                const fileSizeMB = stats.size / (1024 * 1024);
                
                // Проверка размера базы данных
                if (fileSizeMB > 100) {
                    this.addAuditResult({
                        severity: 'MEDIUM',
                        category: 'Database',
                        issue: `База данных слишком большая: ${fileSizeMB.toFixed(2)}MB`,
                        recommendation: 'Рассмотрите архивацию старых данных',
                        score: this.config.mediumScore
                    });
                }
                
                // Проверка резервной копии
                const backupsExist = fs.existsSync('./backups') && 
                    fs.readdirSync('./backups').length > 0;
                
                if (!backupsExist) {
                    this.addAuditResult({
                        severity: 'MEDIUM',
                        category: 'Database',
                        issue: 'Отсутствуют резервные копии базы данных',
                        recommendation: 'Настройте автоматическое резервное копирование',
                        score: this.config.mediumScore
                    });
                }
                
                // Проверка подключения к БД
                const sqlite3 = require('sqlite3').verbose();
                const db = new sqlite3.Database(dbPath, sqlite3.OPEN_READONLY, (err) => {
                    if (err) {
                        this.addAuditResult({
                            severity: 'HIGH',
                            category: 'Database',
                            issue: 'Не удалось подключиться к базе данных',
                            recommendation: 'Проверьте целостность базы данных',
                            score: this.config.highScore
                        });
                    } else {
                        db.close();
                    }
                });
                
            } catch (error) {
                console.warn('Не удалось проверить базу данных:', error.message);
            }
        } else {
            this.addAuditResult({
                severity: 'MEDIUM',
                category: 'Database',
                issue: 'База данных не найдена',
                recommendation: 'Инициализируйте базу данных: npm run init-db',
                score: this.config.mediumScore
            });
        }
    }

    async checkDependencies() {
        console.log('📦 Проверка зависимостей...');
        
        try {
            const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
            const { dependencies } = packageJson;
            
            // Проверка уязвимых версий известных пакетов
            const vulnerablePackages = {
                'express': { min: '4.18.0', issue: 'Прототипное загрязнение' },
                'bcrypt': { min: '5.0.0', issue: 'Уязвимости в хешировании' },
                'jsonwebtoken': { min: '9.0.0', issue: 'Уязвимости в верификации токенов' }
            };
            
            for (const [pkg, info] of Object.entries(vulnerablePackages)) {
                if (dependencies[pkg]) {
                    const version = dependencies[pkg].replace(/[^\d.]/g, '');
                    const [major, minor, patch] = version.split('.').map(Number);
                    const [minMajor, minMinor, minPatch] = info.min.split('.').map(Number);
                    
                    if (major < minMajor || 
                        (major === minMajor && minor < minMinor) ||
                        (major === minMajor && minor === minMinor && patch < minPatch)) {
                        this.addAuditResult({
                            severity: 'HIGH',
                            category: 'Dependencies',
                            issue: `Уязвимая версия ${pkg}: ${dependencies[pkg]}`,
                            recommendation: `Обновите до версии ${info.min} или выше`,
                            score: this.config.highScore
                        });
                    }
                }
            }
            
            // Проверка наличия security-related пакетов
            const securityPackages = ['helmet', 'express-rate-limit', 'bcrypt', 'csurf'];
            const missingSecurity = securityPackages.filter(pkg => !dependencies[pkg]);
            
            if (missingSecurity.length > 0) {
                this.addAuditResult({
                    severity: 'MEDIUM',
                    category: 'Dependencies',
                    issue: `Отсутствуют пакеты безопасности: ${missingSecurity.join(', ')}`,
                    recommendation: 'Установите необходимые пакеты',
                    score: this.config.mediumScore
                });
            }
            
            // Проверка с помощью npm audit (если доступен)
            try {
                const { stdout } = await execPromise('npm audit --json');
                const auditResult = JSON.parse(stdout);
                
                if (auditResult.metadata && auditResult.metadata.vulnerabilities) {
                    const { critical, high, moderate } = auditResult.metadata.vulnerabilities;
                    
                    if (critical > 0) {
                        this.addAuditResult({
                            severity: 'CRITICAL',
                            category: 'Dependencies',
                            issue: `Найдены ${critical} критических уязвимостей в зависимостях`,
                            recommendation: 'Выполните: npm audit fix --force',
                            score: this.config.criticalScore
                        });
                    }
                    
                    if (high > 0) {
                        this.addAuditResult({
                            severity: 'HIGH',
                            category: 'Dependencies',
                            issue: `Найдены ${high} высокоуровневых уязвимостей в зависимостях`,
                            recommendation: 'Выполните: npm audit fix',
                            score: this.config.highScore
                        });
                    }
                }
            } catch (auditError) {
                // npm audit может не сработать в некоторых средах
                console.warn('Не удалось выполнить npm audit:', auditError.message);
            }
            
        } catch (error) {
            console.error('Ошибка при проверке зависимостей:', error);
        }
    }

    async checkCodeQuality() {
        console.log('💻 Проверка качества кода...');
        
        try {
            const serverCode = fs.readFileSync('server.js', 'utf8');
            
            // Проверка наличия console.log в продакшене
            if (process.env.NODE_ENV === 'production') {
                const consoleLogCount = (serverCode.match(/console\.(log|error|warn|info)/g) || []).length;
                if (consoleLogCount > 0) {
                    this.addAuditResult({
                        severity: 'LOW',
                        category: 'Code Quality',
                        issue: `Обнаружено ${consoleLogCount} console.* вызовов в продакшен коде`,
                        recommendation: 'Используйте логгер вместо console.*',
                        score: this.config.lowScore
                    });
                }
            }
            
            // Проверка на хардкод секретов
            const hardcodedSecrets = [
                'secret_key',
                'password',
                'api_key',
                'token',
                'jwt_secret'
            ];
            
            hardcodedSecrets.forEach(secret => {
                const regex = new RegExp(`${secret}\\s*=\\s*["'][^"']+["']`, 'gi');
                const matches = serverCode.match(regex);
                if (matches && matches.length > 0) {
                    this.addAuditResult({
                        severity: 'CRITICAL',
                        category: 'Code Quality',
                        issue: `Обнаружен хардкод секретов: ${matches[0].substring(0, 50)}...`,
                        recommendation: 'Используйте переменные окружения для хранения секретов',
                        score: this.config.criticalScore
                    });
                }
            });
            
            // Проверка на SQL инъекции
            const sqlInjectionPatterns = [
                /db\.run\([^)]*['"]SELECT.*\$\{.*\}.*['"]/,
                /db\.all\([^)]*['"]SELECT.*\$\{.*\}.*['"]/,
                /db\.get\([^)]*['"]SELECT.*\$\{.*\}.*['"]/
            ];
            
            sqlInjectionPatterns.forEach(pattern => {
                if (pattern.test(serverCode)) {
                    this.addAuditResult({
                        severity: 'CRITICAL',
                        category: 'Code Quality',
                        issue: 'Возможная SQL инъекция обнаружена в коде',
                        recommendation: 'Используйте параметризованные запросы',
                        score: this.config.criticalScore
                    });
                }
            });
            
        } catch (error) {
            console.error('Ошибка при проверке кода:', error);
        }
    }

    async checkNetworkSecurity() {
        console.log('🌐 Проверка сетевой безопасности...');
        
        // Проверка CORS настроек
        const corsConfig = `
        const corsOptions = {
            origin: (origin, callback) => {
                if (!origin) return callback(null, true);
                
                const allowedOrigins = process.env.ALLOWED_ORIGINS 
                    ? process.env.ALLOWED_ORIGINS.split(',') 
                    : ['http://localhost:3000', 'http://localhost:8080'];
                    
                if (allowedOrigins.includes(origin)) {
                    callback(null, true);
                } else {
                    logger.warn('CORS violation', { origin });
                    callback(new Error('Not allowed by CORS'));
                }
            },
            credentials: true,
            optionsSuccessStatus: 200
        };`;
        
        const serverCode = fs.readFileSync('server.js', 'utf8');
        if (!serverCode.includes('cors(corsOptions)')) {
            this.addAuditResult({
                severity: 'HIGH',
                category: 'Network Security',
                issue: 'CORS не настроен или настроен небезопасно',
                recommendation: 'Настройте строгие CORS политики',
                score: this.config.highScore
            });
        }
        
        // Проверка HTTPS в продакшене
        if (process.env.NODE_ENV === 'production') {
            if (!serverCode.includes('req.headers[\'x-forwarded-proto\'] !== \'https\'')) {
                this.addAuditResult({
                    severity: 'HIGH',
                    category: 'Network Security',
                    issue: 'Отсутствует принудительный HTTPS редирект',
                    recommendation: 'Добавьте middleware для редиректа HTTP → HTTPS',
                    score: this.config.highScore
                });
            }
        }
    }

    async checkAuthentication() {
        console.log('🔐 Проверка аутентификации...');
        
        const serverCode = fs.readFileSync('server.js', 'utf8');
        
        // Проверка JWT верификации
        if (!serverCode.includes('jwt.verify')) {
            this.addAuditResult({
                severity: 'CRITICAL',
                category: 'Authentication',
                issue: 'Отсутствует проверка JWT токенов',
                recommendation: 'Добавьте middleware для проверки JWT',
                score: this.config.criticalScore
            });
        }
        
        // Проверка защиты паролей
        if (!serverCode.includes('bcrypt.hash') || !serverCode.includes('bcrypt.compare')) {
            this.addAuditResult({
                severity: 'CRITICAL',
                category: 'Authentication',
                issue: 'Пароли не хешируются безопасным способом',
                recommendation: 'Используйте bcrypt для хеширования паролей',
                score: this.config.criticalScore
            });
        }
        
        // Проверка rate limiting для аутентификации
        if (!serverCode.includes('authLimiter')) {
            this.addAuditResult({
                severity: 'MEDIUM',
                category: 'Authentication',
                issue: 'Отсутствует rate limiting для аутентификации',
                recommendation: 'Добавьте rate limiting для login/register endpoints',
                score: this.config.mediumScore
            });
        }
    }

    async checkSessionManagement() {
        console.log('🔄 Проверка управления сессиями...');
        
        const serverCode = fs.readFileSync('server.js', 'utf8');
        
        // Проверка CSRF защиты
        if (!serverCode.includes('csrfProtection')) {
            this.addAuditResult({
                severity: 'HIGH',
                category: 'Session Management',
                issue: 'Отсутствует CSRF защита',
                recommendation: 'Добавьте csurf middleware',
                score: this.config.highScore
            });
        }
        
        // Проверка безопасных кук
        const secureCookiePattern = /secure:\s*process\.env\.NODE_ENV\s*===\s*['"]production['"]/;
        if (!secureCookiePattern.test(serverCode)) {
            this.addAuditResult({
                severity: 'MEDIUM',
                category: 'Session Management',
                issue: 'Куки могут быть небезопасно настроены',
                recommendation: 'Используйте secure: true в продакшене',
                score: this.config.mediumScore
            });
        }
        
        // Проверка очистки сессий
        if (!serverCode.includes('cleanup-sessions')) {
            this.addAuditResult({
                severity: 'LOW',
                category: 'Session Management',
                issue: 'Отсутствует очистка старых сессий',
                recommendation: 'Добавьте регулярную очистку истекших сессий',
                score: this.config.lowScore
            });
        }
    }

    addAuditResult(result) {
        this.auditResults.push({
            ...result,
            timestamp: new Date().toISOString()
        });
    }

    generateReport() {
        const endTime = Date.now();
        const duration = ((endTime - this.startTime) / 1000).toFixed(2);
        
        console.log('\n' + '='.repeat(60));
        console.log('📊 ОТЧЕТ ПО БЕЗОПАСНОСТИ');
        console.log('='.repeat(60));
        console.log(`Время выполнения: ${duration} секунд`);
        console.log(`Всего проверок: ${this.auditResults.length}`);
        console.log('='.repeat(60) + '\n');
        
        // Группировка по уровню серьезности
        const critical = this.auditResults.filter(r => r.severity === 'CRITICAL');
        const high = this.auditResults.filter(r => r.severity === 'HIGH');
        const medium = this.auditResults.filter(r => r.severity === 'MEDIUM');
        const low = this.auditResults.filter(r => r.severity === 'LOW');
        
        // Расчет общего скора
        const totalScore = this.auditResults.reduce((sum, r) => sum + r.score, 0);
        const maxPossibleScore = (critical.length * this.config.criticalScore) +
                                (high.length * this.config.highScore) +
                                (medium.length * this.config.mediumScore) +
                                (low.length * this.config.lowScore);
        
        const securityScore = maxPossibleScore > 0 ? 
            Math.max(0, 100 - (totalScore / maxPossibleScore * 100)) : 100;
        
        console.log(`🔴 КРИТИЧЕСКИЕ: ${critical.length}`);
        critical.forEach((issue, i) => {
            console.log(`   ${i + 1}. ${issue.issue}`);
            console.log(`      📍 Категория: ${issue.category}`);
            console.log(`      💡 Рекомендация: ${issue.recommendation}`);
            console.log();
        });
        
        console.log(`🟠 ВЫСОКИЕ: ${high.length}`);
        high.forEach((issue, i) => {
            console.log(`   ${i + 1}. ${issue.issue}`);
            console.log(`      📍 Категория: ${issue.category}`);
            console.log(`      💡 Рекомендация: ${issue.recommendation}`);
            console.log();
        });
        
        console.log(`🟡 СРЕДНИЕ: ${medium.length}`);
        medium.forEach((issue, i) => {
            console.log(`   ${i + 1}. ${issue.issue}`);
            console.log(`      📍 Категория: ${issue.category}`);
            console.log(`      💡 Рекомендация: ${issue.recommendation}`);
            console.log();
        });
        
        console.log(`🟢 НИЗКИЕ: ${low.length}`);
        low.forEach((issue, i) => {
            console.log(`   ${i + 1}. ${issue.issue}`);
            console.log(`      📍 Категория: ${issue.category}`);
            console.log(`      💡 Рекомендация: ${issue.recommendation}`);
            console.log();
        });
        
        console.log('='.repeat(60));
        console.log('📈 ОБЩАЯ ОЦЕНКА БЕЗОПАСНОСТИ');
        console.log('='.repeat(60));
        console.log(`Оценка безопасности: ${securityScore.toFixed(1)}/100`);
        
        if (securityScore >= 90) {
            console.log('✅ Отличный уровень безопасности!');
        } else if (securityScore >= 70) {
            console.log('⚠️  Средний уровень безопасности. Рекомендуется улучшить.');
        } else if (securityScore >= 50) {
            console.log('⚠️  Низкий уровень безопасности. Требуются срочные меры.');
        } else {
            console.log('🚨 Критический уровень безопасности! Немедленно примите меры!');
        }
        
        if (critical.length > 0) {
            console.log('🚨 Обнаружены критические проблемы!');
        }
        
        console.log('='.repeat(60));
        
        // Сохраняем отчет в файл
        const report = {
            timestamp: new Date().toISOString(),
            environment: process.env.NODE_ENV || 'development',
            duration: `${duration}s`,
            securityScore,
            summary: {
                critical: critical.length,
                high: high.length,
                medium: medium.length,
                low: low.length,
                total: this.auditResults.length
            },
            results: this.auditResults,
            recommendations: {
                immediate: critical.map(c => c.recommendation),
                highPriority: high.map(h => h.recommendation),
                mediumPriority: medium.map(m => m.recommendation)
            }
        };
        
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const reportFile = `security-audit-${timestamp}.json`;
        
        fs.writeFileSync(
            reportFile,
            JSON.stringify(report, null, 2)
        );
        
        console.log(`📄 Отчет сохранен в файл: ${reportFile}`);
        
        // Также пишем в лог
        logger.info('Security audit completed', report);
        
        // Возвращаем код завершения
        if (critical.length > 0) {
            process.exit(1);
        } else if (high.length > 0) {
            process.exit(0);
        } else {
            console.log('✅ Аудит безопасности пройден успешно!');
            process.exit(0);
        }
    }
}

// Запуск аудита если файл вызван напрямую
if (require.main === module) {
    const audit = new SecurityAudit();
    audit.runFullAudit().catch(console.error);
}

module.exports = SecurityAudit;