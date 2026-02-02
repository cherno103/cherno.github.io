const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const slowDown = require('express-slow-down');
const { body, validationResult } = require('express-validator');
const sqlite3 = require('sqlite3').verbose();
const { v4: uuidv4 } = require('uuid');
const cookieParser = require('cookie-parser');
const csrf = require('csurf');
const crypto = require('crypto');
const winston = require('winston');
const NodeCache = require('node-cache');
const mongoSanitize = require('express-mongo-sanitize');
const hpp = require('hpp');
const compression = require('compression');
const path = require('path');
const fs = require('fs');

// Импорт конфигурации безопасности
const securityConfig = require('./security-config');

const app = express();

// Валидация переменных окружения
securityConfig.validateEnv();

// Настройка логгера
const logger = winston.createLogger({
    level: 'info',
    format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
    ),
    transports: [
        new winston.transports.File({ filename: 'logs/error.log', level: 'error' }),
        new winston.transports.File({ filename: 'logs/combined.log' }),
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
    fs.mkdirSync('logs');
}

// Генерация nonce для CSP
const generateNonce = () => crypto.randomBytes(16).toString('base64');

// Middleware для установки nonce
let nonceMiddleware = null;
nonceMiddleware = (req, res, next) => {
    const nonce = generateNonce();
    res.locals.nonce = nonce;
    req.nonce = nonce;
    next();
};

app.use(nonceMiddleware);

// Конфигурация безопасности
const SECRET_KEY = process.env.JWT_SECRET;
const PEPPER = process.env.PEPPER || '';
const SALT_ROUNDS = 12;
const SESSION_SECRET = process.env.SESSION_SECRET;

// Кэширование
const cache = new NodeCache({ stdTTL: 300, checkperiod: 120 });

// Настройка безопасности
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: (req, res) => {
                const nonce = res.locals.nonce || req.nonce;
                return ["'self'", `'nonce-${nonce}'`, "cdnjs.cloudflare.com"];
            },
            styleSrc: (req, res) => {
                const nonce = res.locals.nonce || req.nonce;
                return ["'self'", `'nonce-${nonce}'`, "cdnjs.cloudflare.com"];
            },
            fontSrc: ["'self'", "cdnjs.cloudflare.com"],
            imgSrc: ["'self'", "data:", "https:"],
            connectSrc: ["'self'", 
                process.env.NODE_ENV === 'production' 
                    ? process.env.API_BASE_URL || "https://api.yourdomain.com"
                    : "http://localhost:3000",
                "https://unitpay.money"
            ],
            frameAncestors: ["'none'"],
            formAction: ["'self'", "https://unitpay.money"],
            objectSrc: ["'none'"],
            baseUri: ["'self'"],
            upgradeInsecureRequests: []
        }
    },
    hsts: {
        maxAge: 31536000,
        includeSubDomains: true,
        preload: true
    },
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
    frameguard: { action: 'deny' },
    noSniff: true,
    ieNoOpen: true,
    xssFilter: true
}));

// Принудительный HTTPS в продакшене
if (process.env.NODE_ENV === 'production') {
    app.use((req, res, next) => {
        if (req.headers['x-forwarded-proto'] !== 'https' && req.hostname !== 'localhost') {
            return res.redirect(`https://${req.headers.host}${req.url}`);
        }
        next();
    });
}

// Защита от HTTP параметр загрязнения
app.use(hpp());

// Защита от NoSQL инъекций
app.use(mongoSanitize());

// Сжатие ответов
app.use(compression());

// Rate limiting
const authLimiter = rateLimit({
    ...securityConfig.rateLimitConfig.auth,
    handler: (req, res) => {
        logger.warn('Rate limit exceeded', {
            ip: req.ip,
            email: req.body.email,
            path: req.path
        });
        res.status(429).json({ 
            error: 'Слишком много попыток. Пожалуйста, подождите 15 минут.',
            retryAfter: 900
        });
    }
});

const apiLimiter = rateLimit(securityConfig.rateLimitConfig.api);
const paymentLimiter = rateLimit(securityConfig.rateLimitConfig.payment);

// Slow down для защиты от DoS
const speedLimiter = slowDown({
    windowMs: 15 * 60 * 1000,
    delayAfter: 50,
    delayMs: 500
});

app.use(speedLimiter);

app.use(express.json({ limit: '10kb' }));
app.use(cookieParser());

// Настройка CORS
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
};

app.use(cors(corsOptions));

// Инициализация базы данных
const db = new sqlite3.Database('./database.db', (err) => {
    if (err) {
        logger.error('Database connection error:', err);
        process.exit(1);
    }
    
    // Настройка параметров БД
    db.run('PRAGMA foreign_keys = ON');
    db.run(`PRAGMA journal_mode = ${securityConfig.databaseConfig.journalMode}`);
    db.run(`PRAGMA synchronous = ${securityConfig.databaseConfig.synchronous}`);
    db.run(`PRAGMA cache_size = ${securityConfig.databaseConfig.cacheSize}`);
    
    console.log('✅ База данных подключена');
});

// Создание таблиц и индексов
const initializeDatabase = () => {
    db.serialize(() => {
        // Пользователи
        db.run(`CREATE TABLE IF NOT EXISTS users (
            id TEXT PRIMARY KEY,
            email TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            nickname TEXT NOT NULL,
            game_nickname TEXT,
            game_server TEXT DEFAULT 'main',
            total_spent INTEGER DEFAULT 0,
            purchases_count INTEGER DEFAULT 0,
            last_purchase TEXT,
            email_confirmed BOOLEAN DEFAULT 0,
            confirmation_token TEXT,
            confirmation_expiry TEXT,
            password_changed_at TEXT,
            failed_login_attempts INTEGER DEFAULT 0,
            locked_until TEXT,
            two_factor_enabled BOOLEAN DEFAULT 0,
            two_factor_secret TEXT,
            notifications TEXT DEFAULT '{}',
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            last_login TEXT,
            last_ip TEXT
        )`);

        // Сессии
        db.run(`CREATE TABLE IF NOT EXISTS sessions (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL,
            session_token TEXT NOT NULL,
            created_at TEXT NOT NULL,
            last_activity TEXT NOT NULL,
            expires_at TEXT NOT NULL,
            ip_address TEXT,
            user_agent TEXT,
            is_revoked BOOLEAN DEFAULT 0,
            FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
        )`);

        // Покупки
        db.run(`CREATE TABLE IF NOT EXISTS purchases (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL,
            product_id TEXT NOT NULL,
            product_name TEXT NOT NULL,
            price INTEGER NOT NULL,
            status TEXT DEFAULT 'pending',
            payment_method TEXT,
            payment_id TEXT,
            payment_details TEXT,
            receipt_email TEXT,
            unitpay_id TEXT,
            unitpay_signature TEXT,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            completed_at TEXT,
            FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
        )`);

        // Товары
        db.run(`CREATE TABLE IF NOT EXISTS products (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            description TEXT,
            category TEXT NOT NULL,
            price INTEGER NOT NULL,
            features TEXT,
            badge TEXT,
            color TEXT,
            stock INTEGER DEFAULT -1,
            is_active BOOLEAN DEFAULT 1,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        )`);

        // Логи безопасности
        db.run(`CREATE TABLE IF NOT EXISTS security_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id TEXT,
            event_type TEXT NOT NULL,
            ip_address TEXT,
            user_agent TEXT,
            details TEXT,
            severity TEXT DEFAULT 'info',
            created_at TEXT NOT NULL,
            FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE SET NULL
        )`);

        // Токены сброса пароля
        db.run(`CREATE TABLE IF NOT EXISTS password_reset_tokens (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL,
            token TEXT NOT NULL,
            expires_at TEXT NOT NULL,
            used BOOLEAN DEFAULT 0,
            created_at TEXT NOT NULL,
            FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
        )`);

        // Индексы
        db.run('CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)');
        db.run('CREATE INDEX IF NOT EXISTS idx_users_game_nickname ON users(game_nickname)');
        db.run('CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id)');
        db.run('CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions(session_token)');
        db.run('CREATE INDEX IF NOT EXISTS idx_purchases_user_id ON purchases(user_id)');
        db.run('CREATE INDEX IF NOT EXISTS idx_purchases_status ON purchases(status)');
        db.run('CREATE INDEX IF NOT EXISTS idx_purchases_created_at ON purchases(created_at)');
        db.run('CREATE INDEX IF NOT EXISTS idx_products_category ON products(category)');
        db.run('CREATE INDEX IF NOT EXISTS idx_security_logs_event_type ON security_logs(event_type)');
        db.run('CREATE INDEX IF NOT EXISTS idx_security_logs_created_at ON security_logs(created_at)');
        db.run('CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_token ON password_reset_tokens(token)');
        db.run('CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_expires ON password_reset_tokens(expires_at)');
    });
};

initializeDatabase();

// CSRF защита
const csrfProtection = csrf({ 
    cookie: { 
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        secret: process.env.SESSION_SECRET || 'fallback-secret-change-in-production'
    }
});

// Хеширование пароля с перцем
async function hashPassword(password) {
    const saltedPassword = password + PEPPER;
    return await bcrypt.hash(saltedPassword, SALT_ROUNDS);
}

// Проверка пароля с защитой от timing-атак
async function verifyPassword(password, hash) {
    const saltedPassword = password + PEPPER;
    
    try {
        // Измеряем время начала
        const start = Date.now();
        
        // Проверяем пароль
        const isValid = await bcrypt.compare(saltedPassword, hash);
        
        // Добавляем случайную задержку от 100 до 300 мс
        const randomDelay = Math.floor(Math.random() * 200) + 100;
        const elapsed = Date.now() - start;
        
        if (elapsed < randomDelay) {
            await new Promise(resolve => setTimeout(resolve, randomDelay - elapsed));
        }
        
        return isValid;
    } catch (error) {
        // В случае ошибки также добавляем задержку
        const randomDelay = Math.floor(Math.random() * 200) + 100;
        await new Promise(resolve => setTimeout(resolve, randomDelay));
        return false;
    }
}

// Валидация пароля
function validatePassword(password) {
    const minLength = securityConfig.passwordPolicy.minLength;
    const errors = [];
    
    if (password.length < minLength) {
        errors.push(`Пароль должен содержать минимум ${minLength} символов`);
    }
    if (securityConfig.passwordPolicy.requireUppercase && !/[A-Z]/.test(password)) {
        errors.push('Пароль должен содержать хотя бы одну заглавную букву');
    }
    if (securityConfig.passwordPolicy.requireLowercase && !/[a-z]/.test(password)) {
        errors.push('Пароль должен содержать хотя бы одну строчную букву');
    }
    if (securityConfig.passwordPolicy.requireNumbers && !/\d/.test(password)) {
        errors.push('Пароль должен содержать хотя бы одну цифру');
    }
    if (securityConfig.passwordPolicy.requireSpecialChars && !/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) {
        errors.push('Пароль должен содержать хотя бы один специальный символ');
    }
    
    return {
        valid: errors.length === 0,
        errors
    };
}

// Генерация JWT токена
function generateToken(userId, type = 'access') {
    const expiresIn = type === 'access' 
        ? securityConfig.jwtConfig.accessTokenExpiry 
        : securityConfig.jwtConfig.refreshTokenExpiry;
    
    return jwt.sign(
        { 
            userId, 
            type,
            jti: uuidv4()
        },
        SECRET_KEY,
        { 
            expiresIn,
            issuer: securityConfig.jwtConfig.issuer,
            audience: securityConfig.jwtConfig.audience
        }
    );
}

// Валидация Minecraft ника
function validateMinecraftUsername(username) {
    if (!username) return false;
    if (username.length < 3 || username.length > 16) return false;
    
    // Поддержка Unicode букв (для поддержки ников на разных языках)
    const regex = /^[\p{L}\p{N}_]+$/u;
    return regex.test(username);
}

// Логирование событий безопасности
function logSecurityEvent(userId, eventType, ip, userAgent, details = {}, severity = 'info') {
    const stmt = db.prepare(`
        INSERT INTO security_logs (user_id, event_type, ip_address, user_agent, details, severity, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
        userId,
        eventType,
        ip,
        userAgent,
        JSON.stringify(details),
        severity,
        new Date().toISOString()
    );
    stmt.finalize();
    
    logger.log(severity, eventType, {
        userId,
        ip,
        userAgent,
        details
    });
}

// Middleware проверки JWT
function authenticateToken(req, res, next) {
    const token = req.cookies.access_token;
    
    if (!token) {
        return res.status(401).json({ error: 'Требуется авторизация' });
    }

    jwt.verify(token, SECRET_KEY, (err, user) => {
        if (err) {
            if (err.name === 'TokenExpiredError') {
                return res.status(401).json({ error: 'Срок действия токена истек' });
            }
            logSecurityEvent(null, 'INVALID_TOKEN', req.ip, req.headers['user-agent'], { error: err.message }, 'warn');
            return res.status(403).json({ error: 'Недействительный токен' });
        }
        
        // Проверка типа токена
        if (user.type !== 'access') {
            return res.status(403).json({ error: 'Неверный тип токена' });
        }
        
        req.user = user;
        next();
    });
}

// Middleware проверки блокировки аккаунта
async function checkAccountLock(userId) {
    return new Promise((resolve, reject) => {
        db.get(
            'SELECT locked_until FROM users WHERE id = ?',
            [userId],
            (err, user) => {
                if (err) return reject(err);
                
                if (user && user.locked_until) {
                    const lockUntil = new Date(user.locked_until);
                    if (lockUntil > new Date()) {
                        return resolve(true);
                    }
                }
                resolve(false);
            }
        );
    });
}

// Middleware для обновления активности сессии
async function updateSessionActivity(req, res, next) {
    if (req.user) {
        db.run(
            'UPDATE sessions SET last_activity = ? WHERE user_id = ? AND is_revoked = 0',
            [new Date().toISOString(), req.user.userId]
        );
    }
    next();
}

// API endpoints

// Регистрация
app.post('/api/auth/register', authLimiter, csrfProtection, [
    body('email').isEmail().normalizeEmail().trim(),
    body('password').custom((value) => {
        const validation = validatePassword(value);
        if (!validation.valid) {
            throw new Error(validation.errors.join(', '));
        }
        return true;
    }),
    body('gameNickname').custom(value => {
        if (value && !validateMinecraftUsername(value)) {
            throw new Error('Некорректный игровой никнейм (3-16 символов, только буквы, цифры и подчеркивания)');
        }
        return true;
    })
], async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        logSecurityEvent(null, 'REGISTER_VALIDATION_ERROR', req.ip, req.headers['user-agent'], { errors: errors.array() });
        return res.status(400).json({ errors: errors.array() });
    }

    const { email, password, gameNickname } = req.body;
    
    try {
        // Проверка существования пользователя
        db.get('SELECT id FROM users WHERE email = ?', [email], async (err, row) => {
            if (err) {
                logSecurityEvent(null, 'REGISTER_ERROR', req.ip, req.headers['user-agent'], { email, error: err.message }, 'error');
                return res.status(500).json({ error: 'Ошибка сервера' });
            }
            
            if (row) {
                logSecurityEvent(null, 'REGISTER_DUPLICATE_EMAIL', req.ip, req.headers['user-agent'], { email });
                return res.status(409).json({ error: 'Пользователь с таким email уже существует' });
            }

            // Хеширование пароля
            const passwordHash = await hashPassword(password);
            const userId = uuidv4();
            const confirmationToken = uuidv4();
            const confirmationExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
            const now = new Date().toISOString();
            
            const stmt = db.prepare(`
                INSERT INTO users (id, email, password_hash, nickname, game_nickname, 
                                   confirmation_token, confirmation_expiry, password_changed_at, 
                                   created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `);
            
            stmt.run(
                userId,
                email,
                passwordHash,
                email.split('@')[0],
                gameNickname || '',
                confirmationToken,
                confirmationExpiry,
                now,
                now,
                now,
                function(err) {
                    if (err) {
                        logSecurityEvent(null, 'REGISTER_ERROR', req.ip, req.headers['user-agent'], { email, error: err.message }, 'error');
                        return res.status(500).json({ error: 'Ошибка сервера' });
                    }
                    stmt.finalize();

                    // Создание сессии
                    const sessionId = uuidv4();
                    const sessionToken = uuidv4();
                    const sessionStmt = db.prepare(`
                        INSERT INTO sessions (id, user_id, session_token, created_at, last_activity, 
                                              expires_at, ip_address, user_agent)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                    `);
                    
                    const sessionExpiry = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
                    sessionStmt.run(
                        sessionId,
                        userId,
                        sessionToken,
                        now,
                        now,
                        sessionExpiry,
                        req.ip,
                        req.headers['user-agent'],
                        function(err) {
                            if (err) {
                                logSecurityEvent(userId, 'SESSION_CREATION_ERROR', req.ip, req.headers['user-agent'], { error: err.message }, 'error');
                                // Продолжаем, так как пользователь создан, но сессия не создана
                            } else {
                                sessionStmt.finalize();
                            }

                            // Генерация токенов
                            const accessToken = generateToken(userId, 'access');
                            const refreshToken = generateToken(userId, 'refresh');
                            
                            // Установка HTTP-only cookies
                            res.cookie('access_token', accessToken, {
                                httpOnly: true,
                                secure: process.env.NODE_ENV === 'production',
                                sameSite: 'strict',
                                maxAge: 3600000
                            });
                            
                            res.cookie('refresh_token', refreshToken, {
                                httpOnly: true,
                                secure: process.env.NODE_ENV === 'production',
                                sameSite: 'strict',
                                maxAge: 7 * 24 * 3600000
                            });

                            // Установка CSRF токена
                            const csrfToken = req.csrfToken();
                            res.cookie('XSRF-TOKEN', csrfToken, {
                                secure: process.env.NODE_ENV === 'production',
                                sameSite: 'strict'
                            });

                            logSecurityEvent(userId, 'REGISTER_SUCCESS', req.ip, req.headers['user-agent'], { email });
                            
                            res.status(201).json({ 
                                message: 'Регистрация успешна. Проверьте вашу почту для подтверждения.',
                                userId,
                                requiresEmailConfirmation: true
                            });
                        }
                    );
                }
            );
        });
    } catch (error) {
        logSecurityEvent(null, 'REGISTER_ERROR', req.ip, req.headers['user-agent'], { email, error: error.message }, 'error');
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

// Вход
app.post('/api/auth/login', authLimiter, csrfProtection, [
    body('email').isEmail().normalizeEmail().trim(),
    body('password').notEmpty()
], async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }

    const { email, password } = req.body;
    
    try {
        db.get('SELECT id, password_hash, failed_login_attempts, locked_until FROM users WHERE email = ?', 
            [email], async (err, user) => {
            if (err) {
                logSecurityEvent(null, 'LOGIN_ERROR', req.ip, req.headers['user-agent'], { email, error: err.message }, 'error');
                return res.status(500).json({ error: 'Ошибка сервера' });
            }
            
            // Фиксированная задержка для предотвращения timing-атак
            await new Promise(resolve => setTimeout(resolve, 250));
            
            if (!user) {
                logSecurityEvent(null, 'LOGIN_FAILED', req.ip, req.headers['user-agent'], { email, reason: 'User not found' }, 'warn');
                return res.status(401).json({ error: 'Неверный email или пароль' });
            }

            // Проверка блокировки аккаунта
            if (user.locked_until) {
                const lockUntil = new Date(user.locked_until);
                if (lockUntil > new Date()) {
                    const minutesLeft = Math.ceil((lockUntil - new Date()) / (60 * 1000));
                    return res.status(423).json({ 
                        error: `Аккаунт заблокирован. Попробуйте через ${minutesLeft} минут.`,
                        lockedUntil: user.locked_until
                    });
                }
            }

            const isValid = await verifyPassword(password, user.password_hash);
            
            if (!isValid) {
                // Увеличиваем счетчик неудачных попыток
                const newAttempts = (user.failed_login_attempts || 0) + 1;
                let lockedUntil = null;
                
                // Блокировка после 5 неудачных попыток на 30 минут
                if (newAttempts >= 5) {
                    lockedUntil = new Date(Date.now() + 30 * 60 * 1000).toISOString();
                }
                
                db.run(
                    'UPDATE users SET failed_login_attempts = ?, locked_until = ? WHERE id = ?',
                    [newAttempts, lockedUntil, user.id]
                );
                
                logSecurityEvent(user.id, 'LOGIN_FAILED', req.ip, req.headers['user-agent'], { 
                    email, 
                    reason: 'Invalid password',
                    attempts: newAttempts 
                }, 'warn');
                
                return res.status(401).json({ error: 'Неверный email или пароль' });
            }

            // Сброс счетчика неудачных попыток
            db.run(
                'UPDATE users SET failed_login_attempts = 0, locked_until = NULL, last_login = ?, last_ip = ? WHERE id = ?',
                [new Date().toISOString(), req.ip, user.id]
            );

            // Создание сессии
            const sessionId = uuidv4();
            const sessionToken = uuidv4();
            const sessionStmt = db.prepare(`
                INSERT INTO sessions (id, user_id, session_token, created_at, last_activity, 
                                      expires_at, ip_address, user_agent)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            `);
            
            const now = new Date().toISOString();
            const sessionExpiry = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
            sessionStmt.run(
                sessionId,
                user.id,
                sessionToken,
                now,
                now,
                sessionExpiry,
                req.ip,
                req.headers['user-agent']
            );
            sessionStmt.finalize();

            // Генерация токенов
            const accessToken = generateToken(user.id, 'access');
            const refreshToken = generateToken(user.id, 'refresh');
            
            // Установка HTTP-only cookies
            res.cookie('access_token', accessToken, {
                httpOnly: true,
                secure: process.env.NODE_ENV === 'production',
                sameSite: 'strict',
                maxAge: 3600000
            });
            
            res.cookie('refresh_token', refreshToken, {
                httpOnly: true,
                secure: process.env.NODE_ENV === 'production',
                sameSite: 'strict',
                maxAge: 7 * 24 * 3600000
            });

            // Установка CSRF токена
            const csrfToken = req.csrfToken();
            res.cookie('XSRF-TOKEN', csrfToken, {
                secure: process.env.NODE_ENV === 'production',
                sameSite: 'strict'
            });

            logSecurityEvent(user.id, 'LOGIN_SUCCESS', req.ip, req.headers['user-agent'], { email });
            
            res.json({ 
                message: 'Вход выполнен успешно',
                requires2FA: false
            });
        });
    } catch (error) {
        logSecurityEvent(null, 'LOGIN_ERROR', req.ip, req.headers['user-agent'], { email, error: error.message }, 'error');
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

// Выход
app.post('/api/auth/logout', authenticateToken, csrfProtection, async (req, res) => {
    const token = req.cookies.access_token;
    const refreshToken = req.cookies.refresh_token;
    
    if (token || refreshToken) {
        // Отзываем сессии пользователя
        db.run(
            'UPDATE sessions SET is_revoked = 1 WHERE user_id = ?',
            [req.user.userId],
            (err) => {
                if (err) {
                    logger.error('Error revoking sessions:', err);
                }
            }
        );
        
        res.clearCookie('access_token');
        res.clearCookie('refresh_token');
        res.clearCookie('XSRF-TOKEN');
        
        logSecurityEvent(req.user.userId, 'LOGOUT', req.ip, req.headers['user-agent']);
    }
    
    res.json({ message: 'Выход выполнен успешно' });
});

// Профиль пользователя
app.get('/api/user/profile', authenticateToken, updateSessionActivity, csrfProtection, (req, res) => {
    db.get(`
        SELECT id, email, nickname, game_nickname, game_server, 
               total_spent, purchases_count, last_purchase, 
               email_confirmed, two_factor_enabled, created_at,
               last_login, last_ip
        FROM users 
        WHERE id = ?
    `, [req.user.userId], (err, user) => {
        if (err) {
            logSecurityEvent(req.user.userId, 'PROFILE_FETCH_ERROR', req.ip, req.headers['user-agent'], { error: err.message }, 'error');
            return res.status(500).json({ error: 'Ошибка сервера' });
        }
        
        if (!user) {
            return res.status(404).json({ error: 'Пользователь не найден' });
        }

        // Маскируем email для безопасности
        const emailParts = user.email.split('@');
        const maskedEmail = emailParts[0].substring(0, 3) + '***@' + emailParts[1];
        user.email = maskedEmail;

        res.json(user);
    });
});

// Обновление профиля
app.put('/api/user/profile', authenticateToken, updateSessionActivity, csrfProtection, [
    body('gameNickname').custom(value => {
        if (value && !validateMinecraftUsername(value)) {
            throw new Error('Некорректный игровой никнейм');
        }
        return true;
    }),
    body('gameServer').isIn(['main', 'hard', 'creative', 'minigames'])
], (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }

    const { gameNickname, gameServer } = req.body;
    
    db.run(`
        UPDATE users 
        SET game_nickname = ?, game_server = ?, updated_at = ?
        WHERE id = ?
    `, [gameNickname || '', gameServer || 'main', new Date().toISOString(), req.user.userId], function(err) {
        if (err) {
            logSecurityEvent(req.user.userId, 'PROFILE_UPDATE_ERROR', req.ip, req.headers['user-agent'], { error: err.message }, 'error');
            return res.status(500).json({ error: 'Ошибка обновления профиля' });
        }
        
        logSecurityEvent(req.user.userId, 'PROFILE_UPDATED', req.ip, req.headers['user-agent'], { gameNickname, gameServer });
        res.json({ message: 'Профиль обновлен' });
    });
});

// Покупка товара
app.post('/api/shop/purchase', authenticateToken, updateSessionActivity, paymentLimiter, csrfProtection, [
    body('productId').notEmpty().trim(),
    body('email').isEmail().normalizeEmail().trim(),
    body('paymentMethod').isIn(['card', 'sbp']),
    body('selectedBank').optional().isString().trim()
], async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }

    const { productId, email, paymentMethod, selectedBank } = req.body;
    const userId = req.user.userId;

    // Валидация email на сервере (дополнительная проверка)
    if (!email.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)) {
        return res.status(400).json({ error: 'Некорректный email' });
    }

    // Проверка цены на сервере
    db.get('SELECT id, name, price, stock FROM products WHERE id = ? AND is_active = 1', [productId], async (err, product) => {
        if (err) {
            logSecurityEvent(userId, 'PURCHASE_ERROR', req.ip, req.headers['user-agent'], { productId, error: err.message }, 'error');
            return res.status(500).json({ error: 'Ошибка сервера' });
        }
        
        if (!product) {
            return res.status(404).json({ error: 'Товар не найден' });
        }

        // Проверка наличия товара
        if (product.stock === 0) {
            return res.status(400).json({ error: 'Товар временно отсутствует' });
        }

        // Проверка игрового аккаунта
        db.get('SELECT game_nickname FROM users WHERE id = ?', [userId], async (err, user) => {
            if (err) {
                return res.status(500).json({ error: 'Ошибка сервера' });
            }

            if (!user.game_nickname) {
                return res.status(400).json({ error: 'Необходимо привязать игровой аккаунт' });
            }

            const purchaseId = uuidv4();
            const now = new Date().toISOString();
            
            // Создание покупки в транзакции
            db.serialize(() => {
                db.run('BEGIN TRANSACTION');
                
                const stmt = db.prepare(`
                    INSERT INTO purchases (id, user_id, product_id, product_name, price, 
                                           status, payment_method, receipt_email, created_at, updated_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                `);
                
                stmt.run(
                    purchaseId,
                    userId,
                    productId,
                    product.name,
                    product.price,
                    'pending',
                    paymentMethod,
                    email,
                    now,
                    now
                );
                stmt.finalize();

                // Уменьшение количества товара (если stock > 0)
                if (product.stock > 0) {
                    db.run(
                        'UPDATE products SET stock = stock - 1, updated_at = ? WHERE id = ?',
                        [now, productId]
                    );
                }
                
                db.run('COMMIT', (err) => {
                    if (err) {
                        db.run('ROLLBACK');
                        logSecurityEvent(userId, 'PURCHASE_TRANSACTION_ERROR', req.ip, req.headers['user-agent'], { productId, error: err.message }, 'error');
                        return res.status(500).json({ error: 'Ошибка при оформлении покупки' });
                    }

                    logSecurityEvent(userId, 'PURCHASE_CREATED', req.ip, req.headers['user-agent'], {
                        productId,
                        price: product.price,
                        paymentMethod,
                        purchaseId
                    });

                    // Интеграция с платежной системой UnitPay
                    const unitpayPublicKey = process.env.UNITPAY_PUBLIC_KEY;
                    const unitpaySecretKey = process.env.UNITPAY_SECRET_KEY;
                    
                    if (!unitpayPublicKey || !unitpaySecretKey) {
                        logger.error('UnitPay keys not configured');
                        return res.status(500).json({ error: 'Платежная система не настроена' });
                    }

                    // Генерация подписи для UnitPay
                    const signatureParams = {
                        account: userId,
                        currency: 'RUB',
                        desc: `Покупка: ${product.name}`,
                        sum: product.price,
                        secretKey: unitpaySecretKey
                    };
                    
                    const signatureString = Object.values(signatureParams).join('{up}');
                    const signature = crypto.createHash('sha256').update(signatureString).digest('hex');

                    const paymentUrl = `https://unitpay.money/pay/${unitpayPublicKey}?` + 
                        `sum=${product.price}&` +
                        `account=${userId}&` +
                        `desc=${encodeURIComponent(`Покупка: ${product.name}`)}&` +
                        `currency=RUB&` +
                        `signature=${signature}&` +
                        `projectId=${purchaseId}`;

                    // Сохраняем данные платежа
                    db.run(
                        'UPDATE purchases SET unitpay_id = ?, unitpay_signature = ? WHERE id = ?',
                        [signature, signature, purchaseId]
                    );

                    logger.info('Payment initiated', {
                        userId,
                        purchaseId,
                        product: product.name,
                        amount: product.price
                    });
                    
                    res.json({
                        message: 'Платеж инициирован',
                        purchaseId,
                        price: product.price,
                        requiresPayment: true,
                        paymentUrl,
                        paymentMethod: 'unitpay'
                    });
                });
            });
        });
    });
});

// История покупок с кэшированием
app.get('/api/user/history', authenticateToken, updateSessionActivity, csrfProtection, (req, res) => {
    const { page = 1, limit = 10, status } = req.query;
    const offset = (page - 1) * limit;
    
    // Ключ кэша
    const cacheKey = `history_${req.user.userId}_${page}_${limit}_${status || 'all'}`;
    const cachedData = cache.get(cacheKey);
    
    if (cachedData) {
        return res.json(cachedData);
    }
    
    let query = `
        SELECT id, product_name, price, status, payment_method, created_at
        FROM purchases 
        WHERE user_id = ?
    `;
    const params = [req.user.userId];
    
    if (status && status !== 'all') {
        query += ' AND status = ?';
        params.push(status);
    }
    
    query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
    params.push(parseInt(limit), offset);
    
    db.all(query, params, (err, purchases) => {
        if (err) {
            logSecurityEvent(req.user.userId, 'HISTORY_FETCH_ERROR', req.ip, req.headers['user-agent'], { error: err.message }, 'error');
            return res.status(500).json({ error: 'Ошибка сервера' });
        }
        
        db.get('SELECT COUNT(*) as total FROM purchases WHERE user_id = ?' + 
               (status && status !== 'all' ? ' AND status = ?' : ''), 
               status && status !== 'all' ? [req.user.userId, status] : [req.user.userId], 
               (err, countResult) => {
            if (err) {
                return res.status(500).json({ error: 'Ошибка сервера' });
            }
            
            const result = {
                purchases,
                pagination: {
                    page: parseInt(page),
                    limit: parseInt(limit),
                    total: countResult.total,
                    pages: Math.ceil(countResult.total / limit)
                }
            };
            
            // Кэшируем на 60 секунд
            cache.set(cacheKey, result, 60);
            
            res.json(result);
        });
    });
});

// Список товаров с кэшированием
app.get('/api/shop/products', apiLimiter, (req, res) => {
    const { category } = req.query;
    
    const cacheKey = `products_${category || 'all'}`;
    const cachedData = cache.get(cacheKey);
    
    if (cachedData) {
        return res.json(cachedData);
    }
    
    let query = 'SELECT * FROM products WHERE is_active = 1';
    const params = [];
    
    if (category && category !== 'all') {
        // Валидация категории
        const validCategories = ['ranks', 'currency', 'kits', 'other'];
        if (validCategories.includes(category)) {
            query += ' AND category = ?';
            params.push(category);
        }
    }
    
    db.all(query, params, (err, products) => {
        if (err) {
            return res.status(500).json({ error: 'Ошибка сервера' });
        }
        
        // Кэшируем на 5 минут
        cache.set(cacheKey, products, 300);
        
        res.json(products);
    });
});

// Вебхук для обработки платежей UnitPay
app.post('/api/payments/webhook', [
    body('method').isIn(['check', 'pay', 'error', 'refund']),
    body('params.account').notEmpty(),
    body('params.orderSum').notEmpty(),
    body('params.orderCurrency').isIn(['RUB']),
    body('params.signature').notEmpty()
], (req, res) => {
    const { method, params } = req.body;
    
    // Проверка подписи
    const signatureString = Object.values({
        account: params.account,
        orderSum: params.orderSum,
        orderCurrency: params.orderCurrency,
        secretKey: process.env.UNITPAY_SECRET_KEY
    }).join('{up}');
    
    const calculatedSignature = crypto.createHash('sha256').update(signatureString).digest('hex');
    
    if (calculatedSignature !== params.signature) {
        logger.warn('Invalid webhook signature', { ip: req.ip, params });
        return res.status(400).json({ error: { message: 'Invalid signature' } });
    }
    
    const userId = params.account;
    const purchaseId = params.projectId || params.purchaseId;
    
    switch (method) {
        case 'check':
            // Проверка существования заказа
            db.get('SELECT id FROM purchases WHERE id = ? AND user_id = ?', [purchaseId, userId], (err, purchase) => {
                if (err || !purchase) {
                    return res.json({ error: { message: 'Order not found' } });
                }
                res.json({ result: { message: 'Check successful' } });
            });
            break;
            
        case 'pay':
            // Подтверждение платежа
            db.serialize(() => {
                db.run('BEGIN TRANSACTION');
                
                db.run(
                    'UPDATE purchases SET status = ?, completed_at = ?, updated_at = ? WHERE id = ? AND user_id = ?',
                    ['completed', new Date().toISOString(), new Date().toISOString(), purchaseId, userId],
                    function(err) {
                        if (err) {
                            db.run('ROLLBACK');
                            logger.error('Error updating purchase status:', err);
                            return res.json({ error: { message: 'Database error' } });
                        }
                        
                        if (this.changes === 0) {
                            db.run('ROLLBACK');
                            return res.json({ error: { message: 'Order not found' } });
                        }
                        
                        // Обновление статистики пользователя
                        db.get('SELECT price FROM purchases WHERE id = ?', [purchaseId], (err, purchase) => {
                            if (!err && purchase) {
                                db.run(`
                                    UPDATE users 
                                    SET total_spent = total_spent + ?, 
                                        purchases_count = purchases_count + 1,
                                        last_purchase = ?,
                                        updated_at = ?
                                    WHERE id = ?
                                `, [purchase.price, new Date().toISOString(), new Date().toISOString(), userId]);
                            }
                        });
                        
                        db.run('COMMIT', (err) => {
                            if (err) {
                                db.run('ROLLBACK');
                                logger.error('Transaction commit error:', err);
                                return res.json({ error: { message: 'Database error' } });
                            }
                            
                            logger.info('Payment confirmed', { userId, purchaseId });
                            res.json({ result: { message: 'Payment successful' } });
                        });
                    }
                );
            });
            break;
            
        default:
            res.json({ error: { message: 'Unknown method' } });
    }
});

// Статистика сервера
app.get('/api/server/stats', apiLimiter, (req, res) => {
    const cacheKey = 'server_stats';
    const cachedData = cache.get(cacheKey);
    
    if (cachedData) {
        return res.json(cachedData);
    }
    
    // В реальном приложении получать из мониторинга сервера
    const stats = {
        onlinePlayers: Math.floor(Math.random() * 200) + 1000,
        totalPlayers: Math.floor(Math.random() * 5000) + 25000,
        serverUptime: '99.9%',
        daysRunning: 365 + Math.floor(Math.random() * 100),
        totalRevenue: Math.floor(Math.random() * 1000000) + 5000000,
        todayPurchases: Math.floor(Math.random() * 50) + 20
    };
    
    cache.set(cacheKey, stats, 30); // Кэшируем на 30 секунд
    
    res.json(stats);
});

// Health check с проверкой БД
app.get('/api/health', (req, res) => {
    db.get('SELECT COUNT(*) as count FROM users', (err, result) => {
        const dbStatus = err ? 'error' : 'ok';
        
        const health = { 
            status: 'OK',
            timestamp: new Date().toISOString(),
            uptime: process.uptime(),
            database: dbStatus,
            memory: process.memoryUsage(),
            version: process.version
        };
        
        if (err) {
            health.databaseError = err.message;
            logger.error('Health check failed:', err);
        }
        
        res.json(health);
    });
});

// Генерация CSRF токена
app.get('/api/csrf-token', csrfProtection, (req, res) => {
    const nonce = req.nonce || res.locals.nonce;
    res.json({ 
        csrfToken: req.csrfToken(),
        nonce: nonce 
    });
});

// Очистка старых сессий (запускается по расписанию)
app.post('/api/admin/cleanup-sessions', authenticateToken, (req, res) => {
    // Проверка прав администратора
    if (req.user.userId !== 'admin-id') {
        return res.status(403).json({ error: 'Недостаточно прав' });
    }
    
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    
    db.run('DELETE FROM sessions WHERE last_activity < ?', [thirtyDaysAgo], function(err) {
        if (err) {
            logger.error('Error cleaning sessions:', err);
            return res.status(500).json({ error: 'Ошибка очистки' });
        }
        
        logger.info(`Cleaned ${this.changes} old sessions`);
        res.json({ 
            message: `Очищено ${this.changes} сессий`,
            cleaned: this.changes 
        });
    });
});

// Статические файлы с правильным CSP
app.use(express.static(path.join(__dirname, '../client'), {
    setHeaders: (res, filePath) => {
        // Устанавливаем правильные заголовки безопасности для статических файлов
        if (filePath.endsWith('.html')) {
            const nonce = generateNonce();
            res.setHeader('Content-Security-Policy', 
                `default-src 'self'; ` +
                `script-src 'self' 'nonce-${nonce}' https://cdnjs.cloudflare.com; ` +
                `style-src 'self' 'nonce-${nonce}' https://cdnjs.cloudflare.com; ` +
                `font-src 'self' https://cdnjs.cloudflare.com; ` +
                `img-src 'self' data: https:; ` +
                `connect-src 'self' ${process.env.NODE_ENV === 'production' ? process.env.API_BASE_URL || 'https://api.yourdomain.com' : 'http://localhost:3000'} https://unitpay.money; ` +
                `frame-ancestors 'none'; ` +
                `form-action 'self' https://unitpay.money; ` +
                `object-src 'none'; ` +
                `base-uri 'self';`
            );
            
            // Добавляем nonce в локальные переменные для использования в шаблоне
            res.locals.nonce = nonce;
        }
    }
}));

// Обработка ошибок
app.use((err, req, res, next) => {
    if (err.code === 'EBADCSRFTOKEN') {
        logSecurityEvent(req.user?.userId, 'CSRF_FAILED', req.ip, req.headers['user-agent'], {}, 'warn');
        return res.status(403).json({ error: 'Недопустимый CSRF токен' });
    }
    
    logger.error('Unhandled error:', {
        error: err.message,
        stack: err.stack,
        url: req.url,
        ip: req.ip,
        userId: req.user?.userId
    });
    
    // Не раскрываем детали ошибки в продакшене
    const errorMessage = process.env.NODE_ENV === 'production' 
        ? 'Внутренняя ошибка сервера' 
        : err.message;
    
    res.status(500).json({ error: errorMessage });
});

// 404 обработчик
app.use('*', (req, res) => {
    res.status(404).json({ error: 'Ресурс не найден' });
});

const PORT = process.env.PORT || 3000;

// Проверка доступности порта
const server = app.listen(PORT, () => {
    console.log(`✅ Сервер запущен на порту ${PORT}`);
    console.log(`📊 Режим: ${process.env.NODE_ENV || 'development'}`);
    console.log(`🔒 Безопасность: ${process.env.NODE_ENV === 'production' ? 'PRODUCTION' : 'DEVELOPMENT'}`);
    
    // Запуск фоновых задач
    startBackgroundTasks();
});

// Запуск фоновых задач
function startBackgroundTasks() {
    // Очистка сессий каждые 24 часа
    setInterval(() => {
        const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
        db.run('DELETE FROM sessions WHERE last_activity < ?', [thirtyDaysAgo], (err) => {
            if (!err) {
                logger.info('Auto-cleaned old sessions');
            }
        });
    }, 24 * 60 * 60 * 1000);
    
    // Очистка просроченных токенов сброса пароля
    setInterval(() => {
        const now = new Date().toISOString();
        db.run('DELETE FROM password_reset_tokens WHERE expires_at < ?', [now], (err) => {
            if (!err) {
                logger.info('Auto-cleaned expired password reset tokens');
            }
        });
    }, 60 * 60 * 1000); // Каждый час
}

// Обработка graceful shutdown
async function gracefulShutdown(signal) {
    logger.info(`${signal} received, shutting down gracefully`);
    
    server.close(async () => {
        logger.info('Server closed');
        
        // Закрываем соединение с БД
        db.close((err) => {
            if (err) {
                logger.error('Error closing database:', err);
                process.exit(1);
            }
            logger.info('Database closed');
            process.exit(0);
        });
    });
    
    // Таймаут для принудительного завершения
    setTimeout(() => {
        logger.error('Forced shutdown after timeout');
        process.exit(1);
    }, 10000);
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Обработка необработанных промисов
process.on('unhandledRejection', (reason, promise) => {
    logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

// Обработка необработанных исключений
process.on('uncaughtException', (error) => {
    logger.error('Uncaught Exception:', error);
    process.exit(1);
});

module.exports = app;