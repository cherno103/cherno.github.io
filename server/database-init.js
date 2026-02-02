const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcrypt');
const { v4: uuidv4 } = require('uuid');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');

// Проверка окружения
if (process.env.NODE_ENV === 'production' && (!process.env.PEPPER || process.env.PEPPER.includes('change-this'))) {
    console.error('❌ В продакшене нельзя использовать значения по умолчанию для PEPPER');
    process.exit(1);
}

const PEPPER = process.env.PEPPER || 'development-pepper-do-not-use-in-production';
const SALT_ROUNDS = 12;

async function hashPassword(password) {
    const saltedPassword = password + PEPPER;
    return await bcrypt.hash(saltedPassword, SALT_ROUNDS);
}

// Создаем директории если их нет
if (!fs.existsSync('./logs')) {
    fs.mkdirSync('./logs');
}

if (!fs.existsSync('./backups')) {
    fs.mkdirSync('./backups');
}

const db = new sqlite3.Database('./database.db', (err) => {
    if (err) {
        console.error('❌ Ошибка подключения к базе данных:', err.message);
        process.exit(1);
    }
    
    console.log('✅ Подключение к базе данных установлено');
});

// Включаем расширенные функции SQLite
db.serialize(() => {
    // Включаем WAL режим для лучшей производительности
    db.run('PRAGMA journal_mode = WAL');
    db.run('PRAGMA synchronous = NORMAL');
    db.run('PRAGMA foreign_keys = ON');
    db.run('PRAGMA cache_size = -2000');
    db.run('PRAGMA busy_timeout = 5000');
    db.run('PRAGMA temp_store = MEMORY');
});

async function initializeDatabase() {
    console.log('🔧 Инициализация базы данных...');
    
    try {
        // Создаем таблицы в транзакции
        db.run('BEGIN TRANSACTION');
        
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
            last_ip TEXT,
            CONSTRAINT email_format CHECK (email LIKE '%_@_%._%')
        )`);
        
        // История паролей
        db.run(`CREATE TABLE IF NOT EXISTS password_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id TEXT NOT NULL,
            password_hash TEXT NOT NULL,
            changed_at TEXT NOT NULL,
            FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
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
            revoked_at TEXT,
            FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
        )`);
        
        // Покупки
        db.run(`CREATE TABLE IF NOT EXISTS purchases (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL,
            product_id TEXT NOT NULL,
            product_name TEXT NOT NULL,
            price INTEGER NOT NULL CHECK (price > 0),
            status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'cancelled', 'failed', 'refunded')),
            payment_method TEXT CHECK (payment_method IN ('card', 'sbp', 'other')),
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
            category TEXT NOT NULL CHECK (category IN ('ranks', 'currency', 'kits', 'other')),
            price INTEGER NOT NULL CHECK (price > 0),
            features TEXT,
            badge TEXT,
            color TEXT,
            stock INTEGER DEFAULT -1 CHECK (stock >= -1),
            is_active BOOLEAN DEFAULT 1,
            sort_order INTEGER DEFAULT 0,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        )`);
        
        // Логи безопасности
        db.run(`CREATE TABLE IF NOT EXISTS security_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id TEXT,
            event_type TEXT NOT NULL CHECK (event_type IN (
                'LOGIN_SUCCESS', 'LOGIN_FAILED', 'LOGOUT', 'REGISTER', 
                'PASSWORD_CHANGE', 'PROFILE_UPDATE', 'PURCHASE', 
                'PASSWORD_RESET', 'EMAIL_CONFIRMATION', 'SESSION_CREATED',
                'SESSION_EXPIRED', 'SESSION_REVOKED', 'INVALID_TOKEN',
                'RATE_LIMIT_EXCEEDED', 'SQL_INJECTION_ATTEMPT', 'XSS_ATTEMPT',
                'CSRF_FAILED', 'BRUTE_FORCE_ATTEMPT', 'ADMIN_ACTION'
            )),
            ip_address TEXT,
            user_agent TEXT,
            details TEXT,
            severity TEXT DEFAULT 'info' CHECK (severity IN ('info', 'warn', 'error', 'critical')),
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
        
        // Подтверждение email
        db.run(`CREATE TABLE IF NOT EXISTS email_confirmation_tokens (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL,
            token TEXT NOT NULL,
            expires_at TEXT NOT NULL,
            confirmed BOOLEAN DEFAULT 0,
            created_at TEXT NOT NULL,
            FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
        )`);
        
        // Админские действия
       