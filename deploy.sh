#!/bin/bash

# Скрипт развертывания Minecraft Donate Shop
# Версия: 2.0.0

set -e  # Завершить при ошибке

# Цвета для вывода
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Функции для вывода
print_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Проверка прав
check_root() {
    if [[ $EUID -eq 0 ]]; then
        print_warning "Скрипт запущен от root. Рекомендуется использовать обычного пользователя."
        read -p "Продолжить? (y/n): " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            exit 1
        fi
    fi
}

# Проверка зависимостей
check_dependencies() {
    print_info "Проверка зависимостей..."
    
    local missing_deps=()
    
    # Проверка Node.js
    if ! command -v node &> /dev/null; then
        missing_deps+=("Node.js")
    else
        NODE_VERSION=$(node -v | cut -d'v' -f2)
        REQUIRED_VERSION="16.0.0"
        if [[ "$(printf '%s\n' "$REQUIRED_VERSION" "$NODE_VERSION" | sort -V | head -n1)" != "$REQUIRED_VERSION" ]]; then
            print_error "Требуется Node.js версии $REQUIRED_VERSION или выше. Установлена: $NODE_VERSION"
            exit 1
        fi
    fi
    
    # Проверка npm
    if ! command -v npm &> /dev/null; then
        missing_deps+=("npm")
    fi
    
    # Проверка sqlite3
    if ! command -v sqlite3 &> /dev/null; then
        print_warning "sqlite3 не установлен. Установите: sudo apt-get install sqlite3"
    fi
    
    if [[ ${#missing_deps[@]} -gt 0 ]]; then
        print_error "Отсутствуют зависимости: ${missing_deps[*]}"
        print_info "Установите их перед продолжением."
        exit 1
    fi
    
    print_success "Все зависимости удовлетворены"
}

# Создание структуры проекта
create_project_structure() {
    print_info "Создание структуры проекта..."
    
    # Основные директории
    mkdir -p server/logs
    mkdir -p server/backups
    mkdir -p server/middleware
    mkdir -p client/css
    mkdir -p client/js
    
    print_success "Структура проекта создана"
}

# Настройка переменных окружения
setup_environment() {
    print_info "Настройка переменных окружения..."
    
    if [[ ! -f "server/.env" ]]; then
        if [[ -f "server/.env.example" ]]; then
            cp server/.env.example server/.env
            print_info "Создан файл .env из примера"
        else
            print_error "Файл .env.example не найден"
            exit 1
        fi
    fi
    
    # Генерация секретных ключей если они не установлены
    if grep -q "change-this" server/.env; then
        print_warning "В .env файле есть значения по умолчанию. Генерация новых ключей..."
        
        # Генерация JWT секрета
        JWT_SECRET=$(openssl rand -hex 32 2>/dev/null || echo "fallback-jwt-secret-$(date +%s)")
        sed -i "s|JWT_SECRET=.*|JWT_SECRET=$JWT_SECRET|" server/.env
        
        # Генерация PEPPER
        PEPPER=$(openssl rand -hex 32 2>/dev/null || echo "fallback-pepper-$(date +%s)")
        sed -i "s|PEPPER=.*|PEPPER=$PEPPER|" server/.env
        
        # Генерация SESSION_SECRET
        SESSION_SECRET=$(openssl rand -hex 32 2>/dev/null || echo "fallback-session-secret-$(date +%s)")
        sed -i "s|SESSION_SECRET=.*|SESSION_SECRET=$SESSION_SECRET|" server/.env
        
        print_success "Секретные ключи сгенерированы"
    else
        print_success "Переменные окружения уже настроены"
    fi
    
    # Установка прав на .env файл
    chmod 600 server/.env
    print_success "Права на .env файл установлены"
}

# Установка зависимостей
install_dependencies() {
    print_info "Установка зависимостей..."
    
    cd server
    
    # Проверка package.json
    if [[ ! -f "package.json" ]]; then
        print_error "package.json не найден"
        exit 1
    fi
    
    # Установка зависимостей
    if [[ "$NODE_ENV" == "production" ]]; then
        print_info "Установка production зависимостей..."
        npm ci --only=production
    else
        print_info "Установка всех зависимостей..."
        npm install
    fi
    
    cd ..
    
    print_success "Зависимости установлены"
}

# Инициализация базы данных
init_database() {
    print_info "Инициализация базы данных..."
    
    cd server
    
    if [[ -f "database.db" ]]; then
        print_warning "База данных уже существует. Создать резервную копию? (y/n): "
        read -n 1 -r
        echo
        if [[ $REPLY =~ ^[Yy]$ ]]; then
            TIMESTAMP=$(date +%Y%m%d_%H%M%S)
            cp database.db "database_backup_$TIMESTAMP.db"
            print_success "Резервная копия создана: database_backup_$TIMESTAMP.db"
        fi
    fi
    
    # Запуск инициализации БД
    if npm run init-db; then
        print_success "База данных инициализирована"
    else
        print_error "Ошибка при инициализации базы данных"
        exit 1
    fi
    
    cd ..
}

# Проверка безопасности
run_security_audit() {
    print_info "Запуск аудита безопасности..."
    
    cd server
    
    if npm run audit; then
        print_success "Аудит безопасности пройден"
    else
        print_warning "Аудит безопасности обнаружил проблемы. Проверьте отчет."
    fi
    
    cd ..
}

# Создание резервной копии
create_backup() {
    print_info "Создание резервной копии..."
    
    cd server
    
    if npm run backup; then
        print_success "Резервная копия создана"
    else
        print_warning "Не удалось создать резервную копию"
    fi
    
    cd ..
}

# Настройка systemd службы (для production)
setup_systemd_service() {
    if [[ "$NODE_ENV" != "production" ]]; then
        return
    fi
    
    print_info "Настройка systemd службы..."
    
    SERVICE_FILE="/etc/systemd/system/minecraft-donate.service"
    
    if [[ -f "$SERVICE_FILE" ]]; then
        print_warning "Служба уже существует. Перезаписать? (y/n): "
        read -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            return
        fi
    fi
    
    # Создание пользователя для службы
    if ! id -u minecraft-donate >/dev/null 2>&1; then
        sudo useradd -r -s /bin/false minecraft-donate
        print_success "Пользователь minecraft-donate создан"
    fi
    
    # Настройка прав
    sudo chown -R minecraft-donate:minecraft-donate "$(pwd)"
    sudo chmod 750 "$(pwd)"
    
    # Создание файла службы
    cat << EOF | sudo tee "$SERVICE_FILE" > /dev/null
[Unit]
Description=Minecraft Donate Shop
After=network.target

[Service]
Type=simple
User=minecraft-donate
Group=minecraft-donate
WorkingDirectory=$(pwd)/server
Environment=NODE_ENV=production
ExecStart=$(which node) server.js
Restart=always
RestartSec=10
StandardOutput=syslog
StandardError=syslog
SyslogIdentifier=minecraft-donate

# Security
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=$(pwd)/server/logs $(pwd)/server/backups

[Install]
WantedBy=multi-user.target
EOF
    
    # Перезагрузка systemd и запуск службы
    sudo systemctl daemon-reload
    sudo systemctl enable minecraft-donate
    sudo systemctl start minecraft-donate
    
    print_success "Systemd служба настроена и запущена"
}

# Настройка nginx (опционально)
setup_nginx() {
    if [[ "$SETUP_NGINX" != "true" ]]; then
        return
    fi
    
    print_info "Настройка nginx..."
    
    # Проверка установлен ли nginx
    if ! command -v nginx &> /dev/null; then
        print_error "nginx не установлен. Пропускаем настройку."
        return
    fi
    
    # Конфигурационный файл для nginx
    NGINX_CONF="/etc/nginx/sites-available/minecraft-donate"
    
    cat << EOF | sudo tee "$NGINX_CONF" > /dev/null
server {
    listen 80;
    server_name yourdomain.com www.yourdomain.com;
    
    # Redirect HTTP to HTTPS
    return 301 https://\$server_name\$request_uri;
}

server {
    listen 443 ssl http2;
    server_name yourdomain.com www.yourdomain.com;
    
    # SSL certificates
    ssl_certificate /etc/letsencrypt/live/yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/yourdomain.com/privkey.pem;
    
    # SSL settings
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE-RSA-AES256-GCM-SHA512:DHE-RSA-AES256-GCM-SHA512:ECDHE-RSA-AES256-GCM-SHA384:DHE-RSA-AES256-GCM-SHA384;
    ssl_prefer_server_ciphers off;
    ssl_session_cache shared:SSL:10m;
    ssl_session_timeout 10m;
    
    # Security headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;
    add_header Content-Security-Policy "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline';" always;
    
    # Static files
    location / {
        root $(pwd)/client;
        try_files \$uri \$uri/ /index.html;
        expires 1y;
        add_header Cache-Control "public, immutable";
    }
    
    # API proxy
    location /api/ {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
        
        # Security
        proxy_set_header X-Forwarded-Host \$host;
        proxy_set_header X-Forwarded-Server \$host;
        
        # Timeouts
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }
    
    # Дополнительная защита
    location ~ /\. {
        deny all;
    }
    
    location ~ /(config|database|logs|backups) {
        deny all;
    }
}
EOF
    
    # Активация конфигурации
    sudo ln -sf "$NGINX_CONF" /etc/nginx/sites-enabled/
    
    # Проверка конфигурации
    if sudo nginx -t; then
        sudo systemctl reload nginx
        print_success "nginx настроен и перезагружен"
    else
        print_error "Ошибка в конфигурации nginx"
    fi
}

# Установка SSL сертификата (опционально)
setup_ssl() {
    if [[ "$SETUP_SSL" != "true" ]]; then
        return
    fi
    
    print_info "Настройка SSL сертификата..."
    
    # Проверка установлен ли certbot
    if ! command -v certbot &> /dev/null; then
        print_warning "certbot не установлен. Установите: sudo apt-get install certbot python3-certbot-nginx"
        return
    fi
    
    # Получение сертификата
    if sudo certbot --nginx -d yourdomain.com -d www.yourdomain.com; then
        print_success "SSL сертификат получен и настроен"
    else
        print_error "Не удалось получить SSL сертификат"
    fi
}

# Настройка файрвола
setup_firewall() {
    if [[ "$SETUP_FIREWALL" != "true" ]]; then
        return
    fi
    
    print_info "Настройка файрвола..."
    
    # Проверка ufw
    if ! command -v ufw &> /dev/null; then
        print_warning "ufw не установлен. Пропускаем настройку файрвола."
        return
    fi
    
    # Настройка правил
    sudo ufw allow 22/tcp comment 'SSH'
    sudo ufw allow 80/tcp comment 'HTTP'
    sudo ufw allow 443/tcp comment 'HTTPS'
    sudo ufw --force enable
    
    print_success "Файрвол настроен"
}

# Финальная проверка
final_check() {
    print_info "Финальная проверка..."
    
    # Проверка запущенных процессов
    if [[ "$NODE_ENV" == "production" ]]; then
        if systemctl is-active --quiet minecraft-donate; then
            print_success "Служба minecraft-donate запущена"
        else
            print_error "Служба minecraft-donate не запущена"
        fi
    else
        # Проверка запущенного сервера в development
        if pgrep -f "node.*server.js" > /dev/null; then
            print_success "Сервер запущен"
        else
            print_warning "Сервер не запущен. Запустите: cd server && npm run dev"
        fi
    fi
    
    # Проверка доступа к базе данных
    if [[ -f "server/database.db" ]]; then
        if sqlite3 "server/database.db" "SELECT COUNT(*) FROM users;" > /dev/null 2>&1; then
            print_success "База данных доступна"
        else
            print_error "Проблемы с доступом к базе данных"
        fi
    fi
    
    # Проверка логов
    if [[ -f "server/logs/combined.log" ]]; then
        print_success "Логи создаются"
    fi
    
    print_success "Развертывание завершено!"
    
    # Вывод информации для доступа
    echo ""
    echo "=== ИНФОРМАЦИЯ ДЛЯ ДОСТУПА ==="
    echo "API сервер: http://localhost:3000"
    echo "Клиент: file://$(pwd)/client/index.html"
    echo ""
    
    if [[ "$NODE_ENV" == "production" ]]; then
        echo "=== PRODUCTION НАСТРОЙКИ ==="
        echo "Служба: minecraft-donate"
        echo "Управление: sudo systemctl [start|stop|restart|status] minecraft-donate"
        echo "Логи: sudo journalctl -u minecraft-donate -f"
        echo ""
    fi
    
    echo "=== СЛЕДУЮЩИЕ ШАГИ ==="
    echo "1. Настройте доменное имя в .env файле"
    echo "2. Настройте платежную систему UnitPay"
    echo "3. Протестируйте все функции"
    echo "4. Настройте мониторинг и алерты"
}

# Основная функция
main() {
    echo ""
    echo "========================================="
    echo "   Minecraft Donate Shop Deploy Script   "
    echo "   Version: 2.0.0                        "
    echo "========================================="
    echo ""
    
    # Определение режима
    if [[ -z "$NODE_ENV" ]]; then
        read -p "Режим развертывания (development/production) [development]: " DEPLOY_MODE
        DEPLOY_MODE=${DEPLOY_MODE:-development}
        export NODE_ENV="$DEPLOY_MODE"
    fi
    
    print_info "Режим развертывания: $NODE_ENV"
    
    # Вопросы для дополнительных настроек
    if [[ "$NODE_ENV" == "production" ]]; then
        read -p "Настроить nginx? (y/n) [n]: " -n 1 -r
        echo
        if [[ $REPLY =~ ^[Yy]$ ]]; then
            SETUP_NGINX="true"
        fi
        
        if [[ "$SETUP_NGINX" == "true" ]]; then
            read -p "Настроить SSL? (y/n) [y]: " -n 1 -r
            echo
            if [[ ! $REPLY =~ ^[Nn]$ ]]; then
                SETUP_SSL="true"
            fi
        fi
        
        read -p "Настроить файрвол? (y/n) [y]: " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Nn]$ ]]; then
            SETUP_FIREWALL="true"
        fi
    fi
    
    # Выполнение шагов
    check_root
    check_dependencies
    create_project_structure
    setup_environment
    install_dependencies
    init_database
    run_security_audit
    create_backup
    
    if [[ "$NODE_ENV" == "production" ]]; then
        setup_systemd_service
        setup_nginx
        setup_ssl
        setup_firewall
    fi
    
    final_check
}

# Обработка аргументов командной строки
while [[ $# -gt 0 ]]; do
    case $1 in
        --production)
            export NODE_ENV="production"
            shift
            ;;
        --development)
            export NODE_ENV="development"
            shift
            ;;
        --nginx)
            SETUP_NGINX="true"
            shift
            ;;
        --ssl)
            SETUP_SSL="true"
            shift
            ;;
        --firewall)
            SETUP_FIREWALL="true"
            shift
            ;;
        --help)
            echo "Использование: $0 [опции]"
            echo "Опции:"
            echo "  --production     Развертывание в production режиме"
            echo "  --development    Развертывание в development режиме"
            echo "  --nginx          Настроить nginx (только production)"
            echo "  --ssl            Настроить SSL (только с nginx)"
            echo "  --firewall       Настроить файрвол"
            echo "  --help           Показать эту справку"
            exit 0
            ;;
        *)
            print_error "Неизвестный аргумент: $1"
            echo "Используйте --help для справки"
            exit 1
            ;;
    esac
done

# Запуск основной функции
main