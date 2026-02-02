// Конфигурация безопасности для продакшена
module.exports = {
    // Проверка переменных окружения
    validateEnv: () => {
        if (process.env.NODE_ENV === 'production') {
            const required = ['JWT_SECRET', 'PEPPER', 'SESSION_SECRET', 'UNITPAY_SECRET_KEY'];
            const missing = required.filter(key => !process.env[key]);
            
            if (missing.length > 0) {
                console.error(`❌ CRITICAL: Missing required environment variables: ${missing.join(', ')}`);
                process.exit(1);
            }
            
            // Проверка на значения по умолчанию
            const defaultValues = {
                'JWT_SECRET': 'your-super-secret-jwt-key-change-this',
                'PEPPER': 'your-pepper-string-for-password-hashing-change-this',
                'SESSION_SECRET': 'your-session-secret-key-change-this'
            };
            
            for (const [key, defaultValue] of Object.entries(defaultValues)) {
                if (process.env[key] === defaultValue) {
                    console.error(`❌ CRITICAL: ${key} has default value! Change it in production.`);
                    process.exit(1);
                }
            }
            
            console.log('✅ Environment variables validated successfully');
        }
    },
    
    // Дополнительные настройки безопасности
    additionalSecurity: {
        // Заголовки безопасности
        securityHeaders: {
            'X-Content-Type-Options': 'nosniff',
            'X-Frame-Options': 'DENY',
            'X-XSS-Protection': '1; mode=block',
            'Referrer-Policy': 'strict-origin-when-cross-origin',
            'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
            'Cross-Origin-Opener-Policy': 'same-origin',
            'Cross-Origin-Resource-Policy': 'same-origin',
            'Cross-Origin-Embedder-Policy': 'require-corp'
        },
        
        // Защита от переполнения буфера
        requestLimits: {
            json: '10kb',
            urlencoded: '10kb',
            text: '10kb',
            raw: '10kb'
        },
        
        // Настройки сессии
        sessionConfig: {
            cookie: {
                maxAge: 30 * 24 * 60 * 60 * 1000, // 30 дней
                httpOnly: true,
                secure: process.env.NODE_ENV === 'production',
                sameSite: 'strict',
                domain: process.env.NODE_ENV === 'production' ? '.yourdomain.com' : 'localhost'
            },
            resave: false,
            saveUninitialized: false,
            name: '__Secure-sessionId',
            proxy: process.env.NODE_ENV === 'production',
            rolling: true
        }
    },
    
    // Конфигурация CSP
    cspConfig: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'", "'nonce-{{nonce}}'", "cdnjs.cloudflare.com"],
            styleSrc: ["'self'", "'nonce-{{nonce}}'", "cdnjs.cloudflare.com"],
            fontSrc: ["'self'", "cdnjs.cloudflare.com"],
            imgSrc: ["'self'", "data:", "https:"],
            connectSrc: ["'self'"],
            frameAncestors: ["'none'"],
            formAction: ["'self'", "https://unitpay.money"],
            objectSrc: ["'none'"],
            baseUri: ["'self'"],
            upgradeInsecureRequests: []
        }
    },
    
    // Конфигурация rate limiting
    rateLimitConfig: {
        auth: {
            windowMs: 15 * 60 * 1000,
            max: 10,
            skipSuccessfulRequests: true,
            keyGenerator: (req) => `${req.ip}-${req.body.email || 'unknown'}`
        },
        api: {
            windowMs: 15 * 60 * 1000,
            max: 200,
            skipFailedRequests: false
        },
        payment: {
            windowMs: 60 * 1000,
            max: 5,
            message: 'Too many payment attempts'
        }
    },
    
    // Параметры базы данных
    databaseConfig: {
        walMode: true,
        synchronous: 'NORMAL',
        journalMode: 'WAL',
        cacheSize: -2000,
        foreignKeys: true,
        busyTimeout: 5000
    },
    
    // Параметры паролей
    passwordPolicy: {
        minLength: 12,
        requireUppercase: true,
        requireLowercase: true,
        requireNumbers: true,
        requireSpecialChars: true,
        maxAgeDays: 90,
        historySize: 5,
        maxAttempts: 5,
        lockoutMinutes: 30
    },
    
    // JWT конфигурация
    jwtConfig: {
        accessTokenExpiry: '1h',
        refreshTokenExpiry: '7d',
        issuer: 'minecraft-donate-server',
        audience: 'minecraft-donate-client',
        algorithm: 'HS256'
    },
    
    // Настройки кэширования
    cacheConfig: {
        stdTTL: 300, // 5 минут
        checkperiod: 120,
        useClones: false,
        maxKeys: 1000
    },
    
    // Настройки логирования
    loggingConfig: {
        level: process.env.NODE_ENV === 'production' ? 'warn' : 'info',
        fileSize: 10485760, // 10MB
        maxFiles: 10,
        auditLogDays: 90,
        errorLogDays: 365
    },
    
    // Настройки резервного копирования
    backupConfig: {
        intervalHours: 24,
        retentionDays: 30,
        compression: true,
        encryption: true,
        maxBackupSize: 1024 * 1024 * 1024 // 1GB
    },
    
    // Валидация входных данных
    validationConfig: {
        maxEmailLength: 255,
        maxUsernameLength: 50,
        maxPasswordLength: 100,
        minGameNicknameLength: 3,
        maxGameNicknameLength: 16,
        allowedGameServers: ['main', 'hard', 'creative', 'minigames'],
        allowedProductCategories: ['ranks', 'currency', 'kits', 'other'],
        maxProductNameLength: 100,
        maxProductDescriptionLength: 1000,
        minProductPrice: 1,
        maxProductPrice: 1000000
    },
    
    // Настройки безопасности платежей
    paymentSecurityConfig: {
        minPaymentAmount: 10,
        maxPaymentAmount: 50000,
        allowedCurrencies: ['RUB'],
        allowedPaymentMethods: ['card', 'sbp'],
        webhookTimeout: 5000,
        signatureAlgorithm: 'sha256'
    },
    
    // Мониторинг и алерты
    monitoringConfig: {
        checkInterval: 60000, // 1 минута
        alertThresholds: {
            cpu: 80, // 80%
            memory: 80, // 80%
            disk: 90, // 90%
            responseTime: 1000, // 1 секунда
            errorRate: 1 // 1%
        },
        alertChannels: ['email', 'slack'],
        alertCooldown: 300000 // 5 минут
    },
    
    // Аналитика безопасности
    securityAnalyticsConfig: {
        trackFailedLogins: true,
        trackPasswordChanges: true,
        trackProfileUpdates: true,
        trackPurchases: true,
        trackAdminActions: true,
        retentionDays: 365,
        anonymizeIPs: true,
        maskEmails: true
    },
    
    // Генерация конфигурации для клиента
    getClientConfig: () => {
        return {
            apiBaseUrl: process.env.NODE_ENV === 'production' 
                ? 'https://api.yourdomain.com' 
                : 'http://localhost:3000',
            features: {
                twoFactor: false,
                emailConfirmation: true,
                passwordReset: true,
                socialLogin: false,
                notifications: true
            },
            ui: {
                theme: 'dark',
                language: 'ru',
                currency: 'RUB',
                timezone: 'Europe/Moscow'
            },
            limits: {
                maxFileSize: 5242880, // 5MB
                maxProductsPerPage: 20,
                maxHistoryPerPage: 50,
                maxUsernameLength: 50
            }
        };
    }
};