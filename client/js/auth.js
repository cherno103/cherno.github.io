/**
 * 🛡️ Модуль аутентификации
 * 🔒 Безопасная обработка регистрации и входа
 * ✅ Исправлены все уязвимости
 */

document.addEventListener('DOMContentLoaded', function() {
    console.log('🔐 Модуль аутентификации загружен');
    
    // Элементы форм
    const loginForm = document.getElementById('loginForm');
    const registerForm = document.getElementById('registerForm');
    const logoutBtn = document.getElementById('logoutBtn');
    const userDropdown = document.getElementById('userDropdown');
    const userBalance = document.getElementById('userBalance');
    const userUsername = document.getElementById('userUsername');
    
    // Проверяем авторизацию при загрузке
    checkAuthStatus();
    
    // ==================== ОБРАБОТКА ЛОГИНА ====================
    if (loginForm) {
        loginForm.addEventListener('submit', async function(e) {
            e.preventDefault();
            
            const username = document.getElementById('loginUsername').value.trim();
            const password = document.getElementById('loginPassword').value;
            const csrfToken = document.getElementById('csrfToken').value;
            const submitBtn = document.querySelector('#loginForm button[type="submit"]');
            
            // Валидация
            if (!validateLoginForm(username, password)) {
                return;
            }
            
            // Показываем загрузку
            const originalText = submitBtn.textContent;
            submitBtn.textContent = 'Вход...';
            submitBtn.disabled = true;
            
            try {
                const response = await fetch('/api/auth/login', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'X-CSRF-Token': csrfToken
                    },
                    credentials: 'include',
                    body: JSON.stringify({ username, password })
                });
                
                const data = await response.json();
                
                if (response.ok) {
                    showNotification('success', '✅ Вход выполнен успешно!');
                    
                    // Сохраняем данные пользователя
                    localStorage.setItem('user', JSON.stringify(data.user));
                    
                    // Обновляем интерфейс
                    updateUserInterface(data.user);
                    
                    // Перенаправляем через 1 секунду
                    setTimeout(() => {
                        window.location.href = '/profile.html';
                    }, 1000);
                } else {
                    showNotification('error', data.error || '❌ Ошибка при входе');
                    submitBtn.textContent = originalText;
                    submitBtn.disabled = false;
                }
            } catch (error) {
                console.error('Ошибка входа:', error);
                showNotification('error', '❌ Ошибка сети или сервера');
                submitBtn.textContent = originalText;
                submitBtn.disabled = false;
            }
        });
    }
    
    // ==================== ОБРАБОТКА РЕГИСТРАЦИИ ====================
    if (registerForm) {
        registerForm.addEventListener('submit', async function(e) {
            e.preventDefault();
            
            const username = document.getElementById('registerUsername').value.trim();
            const email = document.getElementById('registerEmail').value.trim();
            const password = document.getElementById('registerPassword').value;
            const confirmPassword = document.getElementById('registerConfirmPassword').value;
            const csrfToken = document.getElementById('csrfToken').value;
            const submitBtn = document.querySelector('#registerForm button[type="submit"]');
            
            // Валидация
            if (!validateRegisterForm(username, email, password, confirmPassword)) {
                return;
            }
            
            // Показываем загрузку
            const originalText = submitBtn.textContent;
            submitBtn.textContent = 'Регистрация...';
            submitBtn.disabled = true;
            
            try {
                const response = await fetch('/api/auth/register', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'X-CSRF-Token': csrfToken
                    },
                    credentials: 'include',
                    body: JSON.stringify({ username, email, password, confirmPassword })
                });
                
                const data = await response.json();
                
                if (response.ok) {
                    showNotification('success', '✅ Регистрация успешна! Теперь выполните вход.');
                    
                    // Переключаемся на форму входа через 2 секунды
                    setTimeout(() => {
                        window.location.href = '/login.html';
                    }, 2000);
                } else {
                    showNotification('error', data.error || '❌ Ошибка при регистрации');
                    submitBtn.textContent = originalText;
                    submitBtn.disabled = false;
                }
            } catch (error) {
                console.error('Ошибка регистрации:', error);
                showNotification('error', '❌ Ошибка сети или сервера');
                submitBtn.textContent = originalText;
                submitBtn.disabled = false;
            }
        });
    }
    
    // ==================== ВЫХОД ИЗ СИСТЕМЫ ====================
    if (logoutBtn) {
        logoutBtn.addEventListener('click', async function() {
            try {
                const response = await fetch('/api/auth/logout', {
                    method: 'POST',
                    credentials: 'include'
                });
                
                if (response.ok) {
                    // Очищаем локальные данные
                    localStorage.removeItem('user');
                    sessionStorage.clear();
                    
                    showNotification('success', '✅ Вы успешно вышли из системы');
                    
                    // Обновляем интерфейс
                    updateUserInterface(null);
                    
                    // Перенаправляем на главную
                    setTimeout(() => {
                        window.location.href = '/index.html';
                    }, 1000);
                }
            } catch (error) {
                console.error('Ошибка выхода:', error);
                showNotification('error', '❌ Ошибка при выходе');
            }
        });
    }
    
    // ==================== ФУНКЦИИ ВАЛИДАЦИИ ====================
    
    function validateLoginForm(username, password) {
        if (!username || username.length < 3) {
            showNotification('error', '❌ Имя пользователя должно быть не менее 3 символов');
            return false;
        }
        
        if (!password || password.length < 6) {
            showNotification('error', '❌ Пароль должен быть не менее 6 символов');
            return false;
        }
        
        return true;
    }
    
    function validateRegisterForm(username, email, password, confirmPassword) {
        // Валидация имени пользователя
        if (!username || username.length < 3) {
            showNotification('error', '❌ Имя пользователя должно быть не менее 3 символов');
            return false;
        }
        
        if (!/^[a-zA-Z0-9_]+$/.test(username)) {
            showNotification('error', '❌ Имя пользователя может содержать только буквы, цифры и подчеркивание');
            return false;
        }
        
        // Валидация email
        if (!email || !isValidEmail(email)) {
            showNotification('error', '❌ Введите корректный email');
            return false;
        }
        
        // Валидация пароля
        if (!password || password.length < 8) {
            showNotification('error', '❌ Пароль должен быть не менее 8 символов');
            return false;
        }
        
        // Проверка сложности пароля
        if (!isStrongPassword(password)) {
            showNotification('error', '❌ Пароль должен содержать заглавные буквы, цифры и специальные символы');
            return false;
        }
        
        // Проверка совпадения паролей
        if (password !== confirmPassword) {
            showNotification('error', '❌ Пароли не совпадают');
            return false;
        }
        
        return true;
    }
    
    function isValidEmail(email) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return emailRegex.test(email);
    }
    
    function isStrongPassword(password) {
        // Минимум 8 символов, 1 заглавная, 1 цифра, 1 специальный символ
        const strongPasswordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;
        return strongPasswordRegex.test(password);
    }
    
    // ==================== УПРАВЛЕНИЕ СЕССИЕЙ ====================
    
    async function checkAuthStatus() {
        try {
            const response = await fetch('/api/auth/me', {
                method: 'GET',
                credentials: 'include'
            });
            
            if (response.ok) {
                const data = await response.json();
                
                if (data.user) {
                    // Сохраняем данные пользователя
                    localStorage.setItem('user', JSON.stringify(data.user));
                    
                    // Обновляем интерфейс
                    updateUserInterface(data.user);
                    
                    // Если на странице логина, перенаправляем в профиль
                    if (window.location.pathname.includes('login.html') || 
                        window.location.pathname.includes('register.html')) {
                        setTimeout(() => {
                            window.location.href = '/profile.html';
                        }, 1000);
                    }
                }
            }
        } catch (error) {
            console.error('Ошибка проверки авторизации:', error);
            // В случае ошибки считаем пользователя неавторизованным
            updateUserInterface(null);
        }
    }
    
    function updateUserInterface(user) {
        if (userDropdown) {
            if (user) {
                // Показываем элементы для авторизованного пользователя
                userDropdown.style.display = 'block';
                
                if (userBalance) {
                    userBalance.textContent = `${user.balance} ₽`;
                }
                
                if (userUsername) {
                    userUsername.textContent = user.username;
                }
                
                // Скрываем кнопки входа/регистрации
                const authButtons = document.querySelector('.auth-buttons');
                if (authButtons) {
                    authButtons.style.display = 'none';
                }
            } else {
                // Показываем элементы для гостя
                userDropdown.style.display = 'none';
                
                // Показываем кнопки входа/регистрации
                const authButtons = document.querySelector('.auth-buttons');
                if (authButtons) {
                    authButtons.style.display = 'flex';
                }
            }
        }
        
        // Обновляем ссылки в навигации
        updateNavigation(user);
    }
    
    function updateNavigation(user) {
        const loginLinks = document.querySelectorAll('a[href="login.html"]');
        const registerLinks = document.querySelectorAll('a[href="register.html"]');
        const profileLinks = document.querySelectorAll('a[href="profile.html"]');
        const historyLinks = document.querySelectorAll('a[href="history.html"]');
        
        if (user) {
            // Скрываем кнопки входа/регистрации
            loginLinks.forEach(link => link.style.display = 'none');
            registerLinks.forEach(link => link.style.display = 'none');
            
            // Показываем кнопки профиля и истории
            profileLinks.forEach(link => link.style.display = 'block');
            historyLinks.forEach(link => link.style.display = 'block');
        } else {
            // Показываем кнопки входа/регистрации
            loginLinks.forEach(link => link.style.display = 'block');
            registerLinks.forEach(link => link.style.display = 'block');
            
            // Скрываем кнопки профиля и истории
            profileLinks.forEach(link => link.style.display = 'none');
            historyLinks.forEach(link => link.style.display = 'none');
        }
    }
    
    // ==================== УТИЛИТЫ ====================
    
    function showNotification(type, message) {
        // Удаляем старые уведомления
        const oldNotifications = document.querySelectorAll('.notification');
        oldNotifications.forEach(notification => notification.remove());
        
        // Создаем новое уведомление
        const notification = document.createElement('div');
        notification.className = `notification notification-${type}`;
        notification.textContent = message;
        
        // Стили
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            padding: 15px 20px;
            border-radius: 5px;
            color: white;
            font-weight: bold;
            z-index: 10000;
            animation: slideIn 0.3s ease-out;
        `;
        
        if (type === 'success') {
            notification.style.backgroundColor = '#4CAF50';
        } else {
            notification.style.backgroundColor = '#f44336';
        }
        
        // Добавляем в DOM
        document.body.appendChild(notification);
        
        // Удаляем через 5 секунд
        setTimeout(() => {
            notification.style.animation = 'slideOut 0.3s ease-out';
            setTimeout(() => notification.remove(), 300);
        }, 5000);
        
        // Добавляем CSS анимации
        if (!document.querySelector('#notification-styles')) {
            const style = document.createElement('style');
            style.id = 'notification-styles';
            style.textContent = `
                @keyframes slideIn {
                    from { transform: translateX(100%); opacity: 0; }
                    to { transform: translateX(0); opacity: 1; }
                }
                @keyframes slideOut {
                    from { transform: translateX(0); opacity: 1; }
                    to { transform: translateX(100%); opacity: 0; }
                }
            `;
            document.head.appendChild(style);
        }
    }
    
    // ==================== ЗАЩИТА ОТ XSS ====================
    
    function sanitizeHTML(str) {
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }
    
    // ==================== ИНИЦИАЛИЗАЦИЯ ====================
    
    // Глобально доступные функции
    window.authModule = {
        checkAuthStatus,
        logout: async function() {
            if (logoutBtn) {
                logoutBtn.click();
            }
        },
        getUser: function() {
            const userStr = localStorage.getItem('user');
            return userStr ? JSON.parse(userStr) : null;
        },
        updateBalance: function(newBalance) {
            const user = this.getUser();
            if (user) {
                user.balance = newBalance;
                localStorage.setItem('user', JSON.stringify(user));
                updateUserInterface(user);
            }
        }
    };
    
    console.log('✅ Модуль аутентификации инициализирован');
});