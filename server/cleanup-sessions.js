const sqlite3 = require('sqlite3').verbose();
const winston = require('winston');
const fs = require('fs');

// Настройка логгера
const logger = winston.createLogger({
    level: 'info',
    format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
    ),
    transports: [
        new winston.transports.File({ filename: 'logs/cleanup.log' }),
        new winston.transports.Console({
            format: winston.format.combine(
                winston.format.colorize(),
                winston.format.simple()
            )
        })
    ]
});

// Создаем папку для логов если её нет
if (!fs.existsSync('logs')) {
    fs.mkdirSync('logs', { recursive: true });
}

const db = new sqlite3.Database('./database.db', (err) => {
    if (err) {
        logger.error('Database connection error:', err);
        process.exit(1);
    }
    logger.info('Database connected for cleanup');
});

function cleanupSessions() {
    const now = new Date().toISOString();
    
    // Время для различных типов очистки
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const twoWeeksAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
    
    let totalCleaned = 0;
    
    // Начинаем транзакцию
    db.serialize(() => {
        db.run('BEGIN TRANSACTION');
        
        // 1. Удаляем сессии старше 30 дней
        db.run('DELETE FROM sessions WHERE last_activity < ?', [thirtyDaysAgo], function(err) {
            if (err) {
                logger.error('Error cleaning old sessions:', err);
            } else {
                const sessionsCleaned = this.changes;
                totalCleaned += sessionsCleaned;
                logger.info(`Cleaned ${sessionsCleaned} sessions older than 30 days`);
            }
        });
        
        // 2. Удаляем неактивные сессии старше 2 недель
        db.run('DELETE FROM sessions WHERE last_activity < ? AND is_revoked = 0', [twoWeeksAgo], function(err) {
            if (err) {
                logger.error('Error cleaning inactive sessions:', err);
            } else {
                const inactiveCleaned = this.changes;
                totalCleaned += inactiveCleaned;
                logger.info(`Cleaned ${inactiveCleaned} inactive sessions older than 2 weeks`);
            }
        });
        
        // 3. Удаляем отозванные сессии старше 7 дней
        db.run('DELETE FROM sessions WHERE is_revoked = 1 AND last_activity < ?', [sevenDaysAgo], function(err) {
            if (err) {
                logger.error('Error cleaning revoked sessions:', err);
            } else {
                const revokedCleaned = this.changes;
                totalCleaned += revokedCleaned;
                logger.info(`Cleaned ${revokedCleaned} revoked sessions older than 7 days`);
            }
        });
        
        // 4. Удаляем просроченные токены сброса пароля
        db.run('DELETE FROM password_reset_tokens WHERE expires_at < ?', [now], function(err) {
            if (err) {
                logger.error('Error cleaning expired password reset tokens:', err);
            } else {
                const tokensCleaned = this.changes;
                logger.info(`Cleaned ${tokensCleaned} expired password reset tokens`);
            }
        });
        
        // 5. Удаляем просроченные токены подтверждения email
        db.run('DELETE FROM email_confirmation_tokens WHERE expires_at < ?', [now], function(err) {
            if (err) {
                logger.error('Error cleaning expired email confirmation tokens:', err);
            } else {
                const emailTokensCleaned = this.changes;
                logger.info(`Cleaned ${emailTokensCleaned} expired email confirmation tokens`);
            }
        });
        
        // 6. Удаляем старые логи безопасности (информационные логи старше 90 дней)
        db.run('DELETE FROM security_logs WHERE created_at < ? AND severity = "info"', [ninetyDaysAgo], function(err) {
            if (err) {
                logger.error('Error cleaning old security logs:', err);
            } else {
                const logsCleaned = this.changes;
                logger.info(`Cleaned ${logsCleaned} old info security logs`);
            }
        });
        
        // 7. Удаляем старые варнинги (старше 180 дней)
        const oneEightyDaysAgo = new Date(Date.now() - 180 * 24 * 60 * 60 * 1000).toISOString();
        db.run('DELETE FROM security_logs WHERE created_at < ? AND severity = "warn"', [oneEightyDaysAgo], function(err) {
            if (err) {
                logger.error('Error cleaning old warning logs:', err);
            } else {
                const warningLogsCleaned = this.changes;
                logger.info(`Cleaned ${warningLogsCleaned} old warning logs`);
            }
        });
        
        // 8. Архивация старых покупок (помечаем как архивные)
        const oneYearAgo = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString();
        db.run('UPDATE purchases SET status = "archived" WHERE status = "completed" AND created_at < ?', [oneYearAgo], function(err) {
            if (err) {
                logger.error('Error archiving old purchases:', err);
            } else {
                const purchasesArchived = this.changes;
                logger.info(`Archived ${purchasesArchived} old completed purchases`);
            }
        });
        
        // 9. Очистка истории паролей (оставляем только последние 5 для каждого пользователя)
        db.run(`
            DELETE FROM password_history 
            WHERE id IN (
                SELECT ph.id 
                FROM password_history ph
                WHERE ph.changed_at < (
                    SELECT ph2.changed_at 
                    FROM password_history ph2 
                    WHERE ph2.user_id = ph.user_id 
                    ORDER BY ph2.changed_at DESC 
                    LIMIT 1 OFFSET 4
                )
            )
        `, function(err) {
            if (err) {
                logger.error('Error cleaning password history:', err);
            } else {
                const passwordHistoryCleaned = this.changes;
                logger.info(`Cleaned ${passwordHistoryCleaned} old password history entries`);
            }
        });
        
        // 10. Оптимизация базы данных
        db.run('VACUUM', function(err) {
            if (err) {
                logger.error('Error vacuuming database:', err);
            } else {
                logger.info('Database vacuum completed');
            }
        });
        
        // 11. Анализ базы данных для лучшей производительности
        db.run('ANALYZE', function(err) {
            if (err) {
                logger.error('Error analyzing database:', err);
            } else {
                logger.info('Database analysis completed');
            }
        });
        
        // Завершаем транзакцию
        db.run('COMMIT', (err) => {
            if (err) {
                logger.error('Transaction commit error:', err);
                db.run('ROLLBACK');
                process.exit(1);
            }
            
            // Получаем статистику по базе данных
            db.serialize(() => {
                db.get('SELECT COUNT(*) as total_sessions FROM sessions', (err, row) => {
                    if (!err && row) {
                        logger.info(`Total sessions in database: ${row.total_sessions}`);
                    }
                });
                
                db.get('SELECT COUNT(*) as total_users FROM users', (err, row) => {
                    if (!err && row) {
                        logger.info(`Total users in database: ${row.total_users}`);
                    }
                });
                
                db.get('SELECT COUNT(*) as total_purchases FROM purchases', (err, row) => {
                    if (!err && row) {
                        logger.info(`Total purchases in database: ${row.total_purchases}`);
                    }
                });
                
                // Закрываем соединение после небольшой задержки
                setTimeout(() => {
                    db.close((err) => {
                        if (err) {
                            logger.error('Error closing database:', err);
                            process.exit(1);
                        }
                        logger.info(`Cleanup completed successfully. Total cleaned: ${totalCleaned} sessions`);
                        logger.info('Database connection closed');
                        process.exit(0);
                    });
                }, 1000);
            });
        });
    });
}

// Обработка сигналов завершения
process.on('SIGINT', () => {
    logger.info('Received SIGINT, shutting down gracefully');
    db.close();
    process.exit(0);
});

process.on('SIGTERM', () => {
    logger.info('Received SIGTERM, shutting down gracefully');
    db.close();
    process.exit(0);
});

// Запуск очистки
cleanupSessions();