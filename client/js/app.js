// Основной файл приложения с улучшенной безопасностью

// 1. Определение базового URL API
const getApiBaseUrl = () => {
    // Определяем по текущему хосту
    const hostname = window.location.hostname;
    const protocol = window.location.protocol;
    
    if (hostname === 'localhost' || hostname === '127.0.0.1') {
        return 'http://localhost:3000';
    } else if (hostname.includes('yourdomain.com')) {
        return 'https://api.yourdomain.com';
    } else {
        // Fallback для разработки
        return window.location.origin;
    }
};

const API_BASE_URL = getApiBaseUrl();

let csrfToken = '';
let nonce = '';

// Инициализация приложения
document.addEventListener('DOMContentLoaded', async () => {
    try {
        // Получение CSRF токена и nonce
        await getCsrfToken();
        
        // Настройка общих обработчиков
        setupCopyIp();
        setupUserMenu();
        setupSecurityHeaders();
        
        // Проверка аутентификации
        await checkAuth();
        
        // Настройка обработчиков безопасности
        setupSecurityMonitors();
        
        // Добавление метрик производительности
        setupPerformanceMonitoring();
    } catch (error) {
        console.error('Ошибка инициализации приложения:', error);
        showNotification('Ошибка загрузки приложения', 'error');
    }
});

// Получение CSRF токена и nonce
async function getCsrfToken() {
    try {
        const response = await fetch(`${API_BASE_URL}/api/csrf-token`, {
            method: 'GET',
            credentials: 'include',
            headers: {
                'X-Requested-With': 'XMLHttpRequest'
            }
        });
        
        if (response.ok) {
            const data = await response.json();
            csrfToken = data.csrfToken;
            nonce = data.nonce;
            
            // Добавляем nonce ко всем script тегам
            document.querySelectorAll('script[data-nonce]').forEach(script => {
                script.setAttribute('nonce', nonce);
            });
        }
    } catch (error) {
        console.error('Ошибка при получении CSRF токена:', error);
    }
}

// Проверка аутентификации
async function checkAuth() {
    try {
        const response = await safeFetch(`${API_BASE_URL}/api/user/profile`);
        
        if (response) {
            const user = response;
            updateUIForLoggedInUser(user);
            return true;
        } else {
            updateUIForLoggedOutUser();
            return false;
        }
    } catch (error) {
        console.error('Ошибка при проверке аутентификации:', error);
        updateUIForLoggedOutUser();
        return false;
    }
}

// Обновление UI для авторизованного пользователя
function updateUIForLoggedInUser(user) {
    const userBtnText = document.getElementById('userBtnText');
    const userDropdown = document.getElementById('userDropdown');
    const userMenuBtn = document.getElementById('userMenuBtn');
    const logoutLink = document.getElementById('logoutLink');
    
    if (userBtnText) {
        userBtnText.textContent = user.nickname || 'Профиль';
    }
    
    if (userMenuBtn && userDropdown) {
        userMenuBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            userDropdown.classList.toggle('show');
        });
    }
    
    if (logoutLink) {
        logoutLink.addEventListener('click', async (e) => {
            e.preventDefault();
            await logout();
        });
    }
    
    // Закрытие dropdown при клике вне его
    document.addEventListener('click', (e) => {
        if (userMenuBtn && userDropdown && !userMenuBtn.contains(e.target) && !userDropdown.contains(e.target)) {
            userDropdown.classList.remove('show');
        }
    });
}

// Обновление UI для неавторизованного пользователя
function updateUIForLoggedOutUser() {
    const userBtnText = document.getElementById('userBtnText');
    const userMenuBtn = document.getElementById('userMenuBtn');
    const userDropdown = document.getElementById('userDropdown');
    
    if (userBtnText) {
        userBtnText.textContent = 'Войти';
    }
    
    if (userMenuBtn) {
        userMenuBtn.addEventListener('click', () => {
            window.location.href = 'login.html';
        });
    }
    
    if (userDropdown) {
        userDropdown.style.display = 'none';
    }
}

// Выход из системы
async function logout() {
    try {
        const response = await safeFetch(`${API_BASE_URL}/api/auth/logout`, {
            method: 'POST'
        });
        
        if (response) {
            window.location.href = 'index.html';
        }
    } catch (error) {
        console.error('Ошибка при выходе:', error);
        showNotification('Ошибка при выходе из системы', 'error');
    }
}

// Копирование IP сервера
function setupCopyIp() {
    const copyIpBtn = document.getElementById('copyIp');
    if (copyIpBtn) {
        copyIpBtn.addEventListener('click', () => {
            const ip = 'play.myserver.com';
            navigator.clipboard.writeText(ip).then(() => {
                const originalText = copyIpBtn.innerHTML;
                copyIpBtn.innerHTML = '<i class="fas fa-check"></i> <span>Скопировано!</span>';
                
                setTimeout(() => {
                    copyIpBtn.innerHTML = originalText;
                }, 2000);
            }).catch(err => {
                console.error('Ошибка при копировании:', err);
                showNotification('Не удалось скопировать IP', 'error');
            });
        });
    }
}

// Настройка меню пользователя
function setupUserMenu() {
    const userMenuBtn = document.getElementById('userMenuBtn');
    const userDropdown = document.getElementById('userDropdown');
    
    if (userMenuBtn && userDropdown) {
        userMenuBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            userDropdown.classList.toggle('show');
        });
        
        // Закрытие при клике вне меню
        document.addEventListener('click', (e) => {
            if (!userMenuBtn.contains(e.target) && !userDropdown.contains(e.target)) {
                userDropdown.classList.remove('show');
            }
        });
    }
}

// Настройка заголовков безопасности
function setupSecurityHeaders() {
    // Отключаем контекстное меню на важных элементах
    document.querySelectorAll('.no-context-menu').forEach(el => {
        el.addEventListener('contextmenu', (e) => e.preventDefault());
    });
    
    // Защита от копирования важных данных
    document.querySelectorAll('.no-copy').forEach(el => {
        el.addEventListener('copy', (e) => e.preventDefault());
        el.addEventListener('cut', (e) => e.preventDefault());
        el.addEventListener('paste', (e) => e.preventDefault());
    });
}

// Настройка мониторов безопасности
function setupSecurityMonitors() {
    // Мониторинг изменений в DOM (защита от инъекций)
    const observer = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
            if (mutation.type === 'childList') {
                mutation.addedNodes.forEach((node) => {
                    if (node.nodeType === 1 && node.matches('script')) {
                        console.warn('Обнаружена попытка вставки скрипта:', node);
                        node.remove();
                    }
                });
            }
        });
    });
    
    observer.observe(document.body, {
        childList: true,
        subtree: true
    });
    
    // Защита от вставки вредоносного HTML
    document.addEventListener('paste', (e) => {
        const clipboardData = e.clipboardData || window.clipboardData;
        const pastedData = clipboardData.getData('text/html');
        
        if (pastedData && /<script/i.test(pastedData)) {
            e.preventDefault();
            showNotification('Вставка скриптов запрещена', 'warning');
        }
    });
}

// Настройка мониторинга производительности
function setupPerformanceMonitoring() {
    // Измерение времени загрузки страницы
    window.addEventListener('load', () => {
        const timing = performance.timing;
        const loadTime = timing.loadEventEnd - timing.navigationStart;
        
        if (loadTime > 3000) {
            console.warn(`Время загрузки страницы: ${loadTime}ms`);
        }
    });
    
    // Мониторинг ошибок JavaScript
    window.addEventListener('error', (e) => {
        console.error('JavaScript ошибка:', e.error);
        // Здесь можно отправить ошибку на сервер для логирования
    });
    
    // Мониторинг необработанных промисов
    window.addEventListener('unhandledrejection', (e) => {
        console.error('Необработанный промис:', e.reason);
    });
}

// Безопасное обновление контента
function safeUpdateContent(element, content) {
    if (typeof content === 'string') {
        // Используем textContent вместо innerHTML для безопасности
        element.textContent = content;
    } else if (content instanceof Node) {
        element.innerHTML = '';
        element.appendChild(content);
    }
}

// Генератор ID для запросов
function generateRequestId() {
    return 'req_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
}

// Защищенный запрос к API
async function safeFetch(url, options = {}) {
    const defaultOptions = {
        credentials: 'include',
        headers: {
            'Content-Type': 'application/json',
            'X-XSRF-TOKEN': csrfToken,
            'X-Requested-With': 'XMLHttpRequest',
            'X-Request-ID': generateRequestId()
        }
    };
    
    const mergedOptions = { ...defaultOptions, ...options };
    
    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 30000);
        
        mergedOptions.signal = controller.signal;
        
        const response = await fetch(url, mergedOptions);
        clearTimeout(timeoutId);
        
        // Обработка статусов
        if (!response.ok) {
            switch (response.status) {
                case 400:
                    const errorData = await response.json().catch(() => ({}));
                    throw new Error(errorData.error || 'Неверный запрос');
                case 401:
                    // Редирект на страницу логина с возвратом
                    sessionStorage.setItem('returnUrl', window.location.href);
                    window.location.href = 'login.html';
                    throw new Error('Требуется авторизация');
                case 403:
                    throw new Error('Доступ запрещен');
                case 404:
                    throw new Error('Ресурс не найден');
                case 429:
                    const retryAfter = response.headers.get('Retry-After') || 900;
                    throw new Error(`Слишком много запросов. Попробуйте через ${retryAfter} секунд.`);
                case 500:
                    throw new Error('Внутренняя ошибка сервера');
                default:
                    throw new Error(`HTTP ошибка ${response.status}`);
            }
        }
        
        return await response.json();
    } catch (error) {
        if (error.name === 'AbortError') {
            showNotification('Превышено время ожидания ответа от сервера', 'error');
        } else if (error.name === 'TypeError' && error.message.includes('fetch')) {
            showNotification('Ошибка соединения с сервером', 'error');
        } else {
            showNotification(error.message, 'error');
        }
        
        console.error('Fetch error:', { url, error: error.message });
        return null;
    }
}

// Показать уведомление с защитой от XSS
function showNotification(message, type = 'success') {
    // Проверяем сообщение на наличие опасного контента
    if (/<script|javascript:|on\w+=/i.test(message)) {
        console.error('Попытка XSS в уведомлении:', message);
        message = 'Небезопасное уведомление';
    }
    
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    
    // Создаем элементы безопасно
    const content = document.createElement('div');
    content.className = 'notification-content';
    
    const icon = document.createElement('i');
    icon.className = type === 'success' ? 'fas fa-check-circle' : 'fas fa-exclamation-circle';
    
    const text = document.createElement('span');
    text.textContent = message;
    
    content.appendChild(icon);
    content.appendChild(text);
    
    const closeBtn = document.createElement('button');
    closeBtn.className = 'notification-close';
    closeBtn.innerHTML = '&times;';
    closeBtn.addEventListener('click', () => {
        notification.remove();
    });
    
    notification.appendChild(content);
    notification.appendChild(closeBtn);
    
    document.body.appendChild(notification);
    
    // Стили для уведомления
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: ${type === 'success' ? '#d4edda' : '#f8d7da'};
        color: ${type === 'success' ? '#155724' : '#721c24'};
        padding: 15px 20px;
        border-radius: 6px;
        display: flex;
        align-items: center;
        gap: 10px;
        z-index: 10000;
        animation: slideIn 0.3s ease;
        max-width: 400px;
        word-break: break-word;
    `;
    
    setTimeout(() => {
        if (notification.parentNode) {
            notification.style.animation = 'slideOut 0.3s ease';
            setTimeout(() => {
                notification.remove();
            }, 300);
        }
    }, 5000);
}

// Добавление стилей для анимаций уведомлений
const style = document.createElement('style');
style.textContent = `
    @keyframes slideIn {
        from {
            transform: translateX(100%);
            opacity: 0;
        }
        to {
            transform: translateX(0);
            opacity: 1;
        }
    }
    
    @keyframes slideOut {
        from {
            transform: translateX(0);
            opacity: 1;
        }
        to {
            transform: translateX(100%);
            opacity: 0;
        }
    }
    
    .notification-close {
        background: none;
        border: none;
        font-size: 20px;
        cursor: pointer;
        color: inherit;
        padding: 0;
        margin-left: 10px;
    }
    
    .notification-success {
        border-left: 4px solid #28a745;
    }
    
    .notification-error {
        border-left: 4px solid #dc3545;
    }
    
    .notification-warning {
        border-left: 4px solid #ffc107;
        background: #fff3cd !important;
        color: #856404 !important;
    }
    
    .notification-info {
        border-left: 4px solid #17a2b8;
        background: #d1ecf1 !important;
        color: #0c5460 !important;
    }
`;
document.head.appendChild(style);

// Экспорт функций для использования в других файлах
window.App = {
    API_BASE_URL,
    getCsrfToken: () => csrfToken,
    safeFetch,
    showNotification,
    safeUpdateContent,
    checkAuth
};