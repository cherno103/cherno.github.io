const crypto = require('crypto');
const winston = require('winston');

const logger = winston.createLogger({
    level: 'info',
    format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
    ),
    transports: [
        new winston.transports.File({ filename: 'logs/security.log' }),
        new winston.transports.Console()
    ]
});

// Middleware для защиты от NoSQL инъекций
const noSqlInjectionProtection = (req, res, next) => {
    const check = (obj) => {
        for (const key in obj) {
            if (typeof obj[key] === 'string') {
                // Проверка на операторы MongoDB
                const dangerousPatterns = [
                    /\$where/i,
                    /\$ne/i,
                    /\$gt/i,
                    /\$lt/i,
                    /\$gte/i,
                    /\$lte/i,
                    /\$regex/i,
                    /\$exists/i,
                    /\$in/i,
                    /\$nin/i,
                    /\$or/i,
                    /\$and/i,
                    /\$not/i,
                    /\$nor/i
                ];
                
                for (const pattern of dangerousPatterns) {
                    if (pattern.test(obj[key])) {
                        logger.warn('NoSQL injection attempt detected', {
                            ip: req.ip,
                            path: req.path,
                            key,
                            value: obj[key]
                        });
                        throw new Error('Invalid input');
                    }
                }
            } else if (typeof obj[key] === 'object' && obj[key] !== null) {
                check(obj[key]);
            }
        }
    };
    
    try {
        if (req.body) check(req.body);
        if (req.query) check(req.query);
        if (req.params) check(req.params);
        next();
    } catch (error) {
        res.status(400).json({ error: 'Invalid input' });
    }
};

// Middleware для защиты от массового присвоения
const massAssignmentProtection = (allowedFields = []) => {
    return (req, res, next) => {
        if (req.body) {
            const filteredBody = {};
            allowedFields.forEach(field => {
                if (req.body[field] !== undefined) {
                    filteredBody[field] = req.body[field];
                }
            });
            req.body = filteredBody;
        }
        next();
    };
};

// Middleware для защиты от переполнения буфера
const bufferOverflowProtection = (limit = '10kb') => {
    return (req, res, next) => {
        let data = '';
        req.setEncoding('utf8');
        
        req.on('data', (chunk) => {
            data += chunk;
            
            // Проверка размера
            if (Buffer.byteLength(data, 'utf8') > parseLimit(limit)) {
                req.destroy();
                res.status(413).json({ error: 'Request too large' });
            }
        });
        
        req.on('end', () => {
            if (data) {
                try {
                    req.body = JSON.parse(data);
                } catch (e) {
                    // Не JSON, оставляем как есть
                    req.body = data;
                }
            }
            next();
        });
    };
};

function parseLimit(limit) {
    const units = {
        'b': 1,
        'kb': 1024,
        'mb': 1024 * 1024,
        'gb': 1024 * 1024 * 1024
    };
    
    const match = limit.match(/^(\d+)([a-z]+)$/i);
    if (!match) return 10 * 1024; // 10KB по умолчанию
    
    const value = parseInt(match[1]);
    const unit = match[2].toLowerCase();
    
    return value * (units[unit] || 1024);
}

module.exports = {
    noSqlInjectionProtection,
    massAssignmentProtection,
    bufferOverflowProtection
};