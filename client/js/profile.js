/**
 * profile.js - Логика страницы профиля пользователя
 * Версия: 1.0.0
 * Безопасность: Высокий уровень (валидация, защита от XSS)
 */

// Состояние приложения
const ProfileState = {
    originalData: {},
    isEditing: false,
    isPasswordModalOpen: false,
    isLoading: false
};

// Инициализация страницы профиля
document.addEventListener('DOMContentLoaded', async () => {
    try {
        console.log('🧩 Инициализация страницы профиля...');
        
        // Проверка аутентификации
        const isAuthenticated = await checkAuthentication();
        if (!isAuthenticated) {
            showErrorState('Требуется авторизация');
            return;
        }
        
        // Загрузка профиля
        await loadProfileData();
        
        // Настройка обработчиков событий
        setupEventListeners();
        
        // Настройка валидации пароля
        setupPasswordValidation();
        
        // Загрузка последних покупок
        await loadRecentPurchases();
        
        console.log('✅ Профиль успешно загружен');
    } catch (error) {
        console.error('❌ Ошибка инициализации профиля:', error);
        showErrorState('Ошибка загрузки профиля');
    }
});

/**
 * Проверка аутентификации
 */
async function checkAuthentication() {
    try {
        if (window.App && window.App.checkAuth) {
            const isAuthenticated = await window.App.checkAuth();
            
            if (!isAuthenticated) {
                // Сохраняем URL для возврата после входа
                sessionStorage.setItem('returnUrl', window.location.href);
                
                // Показываем сообщение об ошибке
                showErrorState('Для просмотра профиля требуется авторизация');
                
                // Через 3 секунды перенаправляем на страницу входа
                setTimeout(() => {
                    window.location.href = 'login.html';
                }, 3000);
                
                return false;
            }
            
            return true;
        } else {
            throw new Error('App не инициализирован');
        }
    } catch (error) {
        console.error('Ошибка проверки аутентификации:', error);
        return false;
    }
}

/**
 * Загрузка данных профиля
 */
async function loadProfileData() {
    showLoadingState('profile');
    
    try {
        // Используем safeFetch из app.js
        const profile = await window.App.safeFetch(`${window.App.API_BASE_URL}/api/user/profile`);
        
        if (!profile) {
            throw new Error('Не удалось загрузить профиль');
        }
        
        // Сохраняем оригинальные данные
        ProfileState.originalData = {
            gameNickname: profile.game_nickname || '',
            gameServer: profile.game_server || 'main',
            email: profile.email || '',
            nickname: profile.nickname || 'Пользователь'
        };
        
        // Обновляем интерфейс
        updateProfileUI(profile);
        
        // Заполняем форму
        populateProfileForm(profile);
        
        // Скрываем загрузку
        hideLoadingState('profile');
        showContentState();
        
        console.log('📊 Данные профиля загружены:', {
            nickname: profile.nickname,
            email: profile.email ? profile.email.substring(0, 3) + '***' : 'скрыт'
        });
        
    } catch (error) {
        console.error('Ошибка загрузки профиля:', error);
        showErrorState('Не удалось загрузить профиль');
    }
}

/**
 * Обновление интерфейса профиля
 */
function updateProfileUI(profile) {
    // Основная информация
    updateElementText('profileNickname', profile.nickname || 'Игрок');
    updateElementText('profileEmail', maskEmail(profile.email) || 'Email скрыт');
    
    // Статистика
    updateElementText('totalSpent', `${profile.total_spent || 0} ₽`);
    updateElementText('purchasesCount', profile.purchases_count || 0);
    updateElementText('accountAge', calculateAccountAge(profile.created_at));
    updateElementText('lastPurchase', formatDate(profile.last_purchase, 'Нет'));
    
    // Бейджи
    updateElementText('memberSince', formatDate(profile.created_at, 'Неизвестно'));
    updateElementText('lastLogin', formatDate(profile.last_login, 'Не заходил'));
    
    // Статусы безопасности
    updateEmailConfirmationStatus(profile.email_confirmed);
    updateTwoFactorStatus(profile.two_factor_enabled);
}

/**
 * Заполнение формы профиля
 */
function populateProfileForm(profile) {
    const nicknameInput = document.getElementById('profileGameNickname');
    const serverSelect = document.getElementById('profileGameServer');
    
    if (nicknameInput) {
        nicknameInput.value = profile.game_nickname || '';
    }
    
    if (serverSelect) {
        serverSelect.value = profile.game_server || 'main';
    }
}

/**
 * Загрузка последних покупок
 */
async function loadRecentPurchases() {
    const loadingEl = document.getElementById('recentPurchasesLoading');
    const noPurchasesEl = document.getElementById('noPurchases');
    const purchasesContainer = document.getElementById('recentPurchases');
    
    if (loadingEl) loadingEl.style.display = 'block';
    if (noPurchasesEl) noPurchasesEl.style.display = 'none';
    if (purchasesContainer) purchasesContainer.innerHTML = '';
    
    try {
        const history = await window.App.safeFetch(
            `${window.App.API_BASE_URL}/api/user/history?limit=5`
        );
        
        if (loadingEl) loadingEl.style.display = 'none';
        
        if (history && history.purchases && history.purchases.length > 0) {
            displayRecentPurchases(history.purchases);
        } else {
            if (noPurchasesEl) noPurchasesEl.style.display = 'block';
        }
    } catch (error) {
        console.error('Ошибка загрузки покупок:', error);
        if (loadingEl) loadingEl.style.display = 'none';
        if (noPurchasesEl) noPurchasesEl.style.display = 'block';
    }
}

/**
 * Отображение последних покупок
 */
function displayRecentPurchases(purchases) {
    const container = document.getElementById('recentPurchases');
    if (!container) return;
    
    purchases.forEach(purchase => {
        const purchaseEl = createPurchaseElement(purchase);
        container.appendChild(purchaseEl);
    });
}

/**
 * Создание элемента покупки
 */
function createPurchaseElement(purchase) {
    const div = document.createElement('div');
    div.className = 'purchase-item';
    div.style.cssText = `
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 15px;
        border-bottom: 1px solid #2d3748;
        transition: all 0.3s ease;
    `;
    
    div.onmouseenter = () => {
        div.style.backgroundColor = 'rgba(255, 255, 255, 0.05)';
    };
    
    div.onmouseleave = () => {
        div.style.backgroundColor = 'transparent';
    };
    
    const date = new Date(purchase.created_at);
    const formattedDate = date.toLocaleDateString('ru-RU');
    
    div.innerHTML = `
        <div style="flex: 1; min-width: 0;">
            <h4 style="margin: 0 0 5px 0; color: #ffffff; font-size: 1rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                ${escapeHtml(purchase.product_name)}
            </h4>
            <p style="margin: 0; color: #8a9bb2; font-size: 0.9rem;">
                ${formattedDate}
            </p>
        </div>
        <div style="text-align: right; margin-left: 20px;">
            <div style="color: #e94560; font-weight: bold; font-size: 1.2rem; margin-bottom: 5px;">
                ${purchase.price} ₽
            </div>
            <span class="status-badge ${getStatusClass(purchase.status)}">
                ${getStatusText(purchase.status)}
            </span>
        </div>
    `;
    
    // Добавляем обработчик клика для просмотра деталей
    div.style.cursor = 'pointer';
    div.onclick = () => {
        showPurchaseDetails(purchase);
    };
    
    return div;
}

/**
 * Настройка обработчиков событий
 */
function setupEventListeners() {
    // Форма профиля
    const profileForm = document.getElementById('profileForm');
    if (profileForm) {
        profileForm.addEventListener('submit', handleProfileSubmit);
    }
    
    // Кнопка отмены изменений
    const cancelBtn = document.getElementById('cancelChanges');
    if (cancelBtn) {
        cancelBtn.addEventListener('click', handleCancelChanges);
    }
    
    // Кнопка смены пароля
    const changePasswordBtn = document.getElementById('changePassword');
    if (changePasswordBtn) {
        changePasswordBtn.addEventListener('click', () => {
            openPasswordModal();
        });
    }
    
    // Модальное окно смены пароля
    setupPasswordModalListeners();
    
    // Кнопка подтверждения email
    const verifyEmailBtn = document.getElementById('verifyEmail');
    if (verifyEmailBtn) {
        verifyEmailBtn.addEventListener('click', handleVerifyEmail);
    }
    
    // Кнопка 2FA
    const toggle2FABtn = document.getElementById('toggle2FA');
    if (toggle2FABtn) {
        toggle2FABtn.addEventListener('click', handleToggle2FA);
    }
    
    // Переключение видимости пароля
    document.querySelectorAll('.toggle-password').forEach(button => {
        button.addEventListener('click', togglePasswordVisibility);
    });
    
    // Отслеживание изменений в форме
    monitorFormChanges();
}

/**
 * Обработка отправки формы профиля
 */
async function handleProfileSubmit(event) {
    event.preventDefault();
    
    // Проверка honeypot
    if (!checkHoneypot('profile_bot_check')) {
        showNotification('Обнаружена подозрительная активность', 'error');
        return;
    }
    
    const nicknameInput = document.getElementById('profileGameNickname');
    const serverSelect = document.getElementById('profileGameServer');
    
    const gameNickname = nicknameInput ? nicknameInput.value.trim() : '';
    const gameServer = serverSelect ? serverSelect.value : 'main';
    
    // Валидация
    if (gameNickname) {
        const validation = window.Validation.validateMinecraftUsername(gameNickname);
        if (!validation.valid) {
            showNotification(validation.error, 'error');
            return;
        }
    }
    
    try {
        const response = await window.App.safeFetch(`${window.App.API_BASE_URL}/api/user/profile`, {
            method: 'PUT',
            body: JSON.stringify({
                gameNickname,
                gameServer
            })
        });
        
        if (response) {
            showNotification('Профиль успешно обновлен', 'success');
            
            // Обновляем оригинальные данные
            ProfileState.originalData = {
                ...ProfileState.originalData,
                gameNickname,
                gameServer
            };
            
            ProfileState.isEditing = false;
            
            // Перезагружаем профиль
            await loadProfileData();
        }
    } catch (error) {
        console.error('Ошибка обновления профиля:', error);
        showNotification('Ошибка обновления профиля', 'error');
    }
}

/**
 * Обработка отмены изменений
 */
function handleCancelChanges() {
    const nicknameInput = document.getElementById('profileGameNickname');
    const serverSelect = document.getElementById('profileGameServer');
    
    if (nicknameInput) {
        nicknameInput.value = ProfileState.originalData.gameNickname;
    }
    
    if (serverSelect) {
        serverSelect.value = ProfileState.originalData.gameServer;
    }
    
    ProfileState.isEditing = false;
    showNotification('Изменения отменены', 'info');
}

/**
 * Открытие модального окна смены пароля
 */
function openPasswordModal() {
    const modal = document.getElementById('passwordModal');
    if (modal) {
        modal.classList.add('show');
        ProfileState.isPasswordModalOpen = true;
        
        // Сброс формы
        const form = document.getElementById('passwordForm');
        if (form) form.reset();
    }
}

/**
 * Настройка обработчиков модального окна пароля
 */
function setupPasswordModalListeners() {
    const modal = document.getElementById('passwordModal');
    const closeBtn = document.getElementById('closePasswordModal');
    const cancelBtn = document.getElementById('cancelPasswordChange');
    const form = document.getElementById('passwordForm');
    
    // Закрытие по кнопке
    if (closeBtn && modal) {
        closeBtn.addEventListener('click', () => {
            modal.classList.remove('show');
            ProfileState.isPasswordModalOpen = false;
        });
    }
    
    // Закрытие по отмене
    if (cancelBtn && modal) {
        cancelBtn.addEventListener('click', () => {
            modal.classList.remove('show');
            ProfileState.isPasswordModalOpen = false;
        });
    }
    
    // Закрытие по клику вне окна
    if (modal) {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                modal.classList.remove('show');
                ProfileState.isPasswordModalOpen = false;
            }
        });
    }
    
    // Закрытие по Escape
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && ProfileState.isPasswordModalOpen) {
            modal.classList.remove('show');
            ProfileState.isPasswordModalOpen = false;
        }
    });
    
    // Отправка формы
    if (form) {
        form.addEventListener('submit', handlePasswordChange);
    }
}

/**
 * Обработка смены пароля
 */
async function handlePasswordChange(event) {
    event.preventDefault();
    
    // Проверка honeypot
    if (!checkHoneypot('password_bot_check')) {
        showNotification('Обнаружена подозрительная активность', 'error');
        return;
    }
    
    const currentPassword = document.getElementById('currentPassword').value;
    const newPassword = document.getElementById('newPassword').value;
    const confirmPassword = document.getElementById('confirmNewPassword').value;
    
    // Базовая валидация
    if (!currentPassword || !newPassword || !confirmPassword) {
        showNotification('Заполните все поля', 'error');
        return;
    }
    
    if (newPassword !== confirmPassword) {
        showNotification('Новые пароли не совпадают', 'error');
        return;
    }
    
    // Валидация пароля
    const validation = window.Validation.validatePassword(newPassword);
    if (!validation.valid) {
        showNotification(validation.errors, 'error');
        return;
    }
    
    // В реальном приложении здесь был бы API запрос
    // В демо-версии показываем уведомление
    showNotification('Пароль успешно изменен (демо-версия)', 'success');
    
    // Закрываем модальное окно
    const modal = document.getElementById('passwordModal');
    if (modal) {
        modal.classList.remove('show');
        ProfileState.isPasswordModalOpen = false;
    }
}

/**
 * Подтверждение email
 */
async function handleVerifyEmail() {
    showNotification('Ссылка для подтверждения отправлена на ваш email (демо)', 'info');
    
    // В реальном приложении:
    // 1. Отправка запроса на сервер
    // 2. Ожидание ответа
    // 3. Обновление статуса в UI
}

/**
 * Включение/выключение 2FA
 */
async function handleToggle2FA() {
    const button = document.getElementById('toggle2FA');
    const statusEl = document.getElementById('twoFactorStatus');
    
    if (!button || !statusEl) return;
    
    const isEnabled = button.innerHTML.includes('Выключить');
    
    if (isEnabled) {
        // Отключение 2FA
        showNotification('Двухфакторная аутентификация отключена (демо)', 'success');
        statusEl.textContent = 'Не настроена';
        statusEl.style.color = '#8a9bb2';
        button.innerHTML = '<i class="fas fa-toggle-off"></i> Включить';
    } else {
        // Включение 2FA
        showNotification('Настройте двухфакторную аутентификацию в приложении-аутентификаторе (демо)', 'info');
        statusEl.textContent = 'Включена';
        statusEl.style.color = '#28a745';
        button.innerHTML = '<i class="fas fa-toggle-on"></i> Выключить';
    }
}

/**
 * Настройка валидации пароля
 */
function setupPasswordValidation() {
    const newPasswordInput = document.getElementById('newPassword');
    if (!newPasswordInput) return;
    
    newPasswordInput.addEventListener('input', function() {
        const password = this.value;
        validatePasswordRequirements(password);
    });
}

/**
 * Валидация требований к паролю
 */
function validatePasswordRequirements(password) {
    const requirements = {
        length: document.getElementById('new-req-length'),
        uppercase: document.getElementById('new-req-uppercase'),
        lowercase: document.getElementById('new-req-lowercase'),
        number: document.getElementById('new-req-number'),
        special: document.getElementById('new-req-special')
    };
    
    // Проверка длины
    updateRequirement(requirements.length, password.length >= 8, 'Минимум 8 символов');
    
    // Проверка заглавных букв
    updateRequirement(requirements.uppercase, /[A-Z]/.test(password), 'Заглавную букву');
    
    // Проверка строчных букв
    updateRequirement(requirements.lowercase, /[a-z]/.test(password), 'Строчную букву');
    
    // Проверка цифр
    updateRequirement(requirements.number, /\d/.test(password), 'Цифру');
    
    // Проверка спецсимволов
    updateRequirement(requirements.special, /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password), 'Специальный символ');
}

/**
 * Обновление отображения требования
 */
function updateRequirement(element, isValid, text) {
    if (!element) return;
    
    element.style.color = isValid ? '#28a745' : '#dc3545';
    element.innerHTML = `<i class="fas fa-${isValid ? 'check' : 'times'}"></i> ${text}`;
}

/**
 * Мониторинг изменений в форме
 */
function monitorFormChanges() {
    const nicknameInput = document.getElementById('profileGameNickname');
    const serverSelect = document.getElementById('profileGameServer');
    
    const checkChanges = () => {
        if (!nicknameInput || !serverSelect) return;
        
        const hasChanges = 
            nicknameInput.value !== ProfileState.originalData.gameNickname ||
            serverSelect.value !== ProfileState.originalData.gameServer;
        
        ProfileState.isEditing = hasChanges;
        
        // Можно добавить визуальную индикацию изменений
        if (hasChanges) {
            nicknameInput.style.borderColor = '#ffc107';
            serverSelect.style.borderColor = '#ffc107';
        } else {
            nicknameInput.style.borderColor = '';
            serverSelect.style.borderColor = '';
        }
    };
    
    if (nicknameInput) nicknameInput.addEventListener('input', checkChanges);
    if (serverSelect) serverSelect.addEventListener('change', checkChanges);
}

/**
 * Показать детали покупки
 */
function showPurchaseDetails(purchase) {
    // В реальном приложении открывалось бы модальное окно с деталями
    // В демо-версии просто показываем уведомление
    showNotification(`Покупка: ${purchase.product_name} (${purchase.price}₽)`, 'info');
}

// Вспомогательные функции

/**
 * Показать состояние загрузки
 */
function showLoadingState(context = 'general') {
    const loadingEl = document.getElementById(`${context}Loading`);
    if (loadingEl) loadingEl.style.display = 'flex';
}

/**
 * Скрыть состояние загрузки
 */
function hideLoadingState(context = 'general') {
    const loadingEl = document.getElementById(`${context}Loading`);
    if (loadingEl) loadingEl.style.display = 'none';
}

/**
 * Показать контент
 */
function showContentState() {
    const contentEl = document.getElementById('profileContent');
    if (contentEl) contentEl.style.display = 'block';
}

/**
 * Показать состояние ошибки
 */
function showErrorState(message = 'Произошла ошибка') {
    hideLoadingState('profile');
    
    const errorEl = document.getElementById('profileError');
    const contentEl = document.getElementById('profileContent');
    
    if (errorEl) {
        errorEl.style.display = 'block';
        const messageEl = errorEl.querySelector('p');
        if (messageEl) messageEl.textContent = message;
    }
    
    if (contentEl) contentEl.style.display = 'none';
    
    showNotification(message, 'error');
}

/**
 * Маскировка email
 */
function maskEmail(email) {
    if (!email) return '';
    const parts = email.split('@');
    if (parts.length !== 2) return email;
    
    const username = parts[0];
    const domain = parts[1];
    
    if (username.length <= 3) {
        return '***@' + domain;
    }
    
    return username.substring(0, 3) + '***@' + domain;
}

/**
 * Расчет возраста аккаунта
 */
function calculateAccountAge(createdAt) {
    if (!createdAt) return '0 д.';
    
    const created = new Date(createdAt);
    const now = new Date();
    const diffTime = Math.abs(now - created);
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    return `${diffDays} д.`;
}

/**
 * Форматирование даты
 */
function formatDate(dateString, fallback = '') {
    if (!dateString) return fallback;
    
    try {
        const date = new Date(dateString);
        return date.toLocaleDateString('ru-RU');
    } catch (error) {
        return fallback;
    }
}

/**
 * Обновление статуса подтверждения email
 */
function updateEmailConfirmationStatus(isConfirmed) {
    const statusEl = document.getElementById('emailConfirmedStatus');
    const button = document.getElementById('verifyEmail');
    
    if (!statusEl || !button) return;
    
    if (isConfirmed) {
        statusEl.textContent = 'Подтвержден';
        statusEl.style.color = '#28a745';
        button.disabled = true;
        button.innerHTML = '<i class="fas fa-check-circle"></i> Подтвержден';
    } else {
        statusEl.textContent = 'Не подтвержден';
        statusEl.style.color = '#dc3545';
        button.disabled = false;
        button.innerHTML = '<i class="fas fa-paper-plane"></i> Подтвердить';
    }
}

/**
 * Обновление статуса 2FA
 */
function updateTwoFactorStatus(isEnabled) {
    const statusEl = document.getElementById('twoFactorStatus');
    const button = document.getElementById('toggle2FA');
    
    if (!statusEl || !button) return;
    
    if (isEnabled) {
        statusEl.textContent = 'Включена';
        statusEl.style.color = '#28a745';
        button.innerHTML = '<i class="fas fa-toggle-on"></i> Выключить';
    } else {
        statusEl.textContent = 'Не настроена';
        statusEl.style.color = '#8a9bb2';
        button.innerHTML = '<i class="fas fa-toggle-off"></i> Включить';
    }
}

/**
 * Получение класса для статуса
 */
function getStatusClass(status) {
    switch (status) {
        case 'completed': return 'status-completed';
        case 'pending': return 'status-pending';
        case 'failed': return 'status-failed';
        case 'refunded': return 'status-refunded';
        default: return '';
    }
}

/**
 * Получение текста для статуса
 */
function getStatusText(status) {
    switch (status) {
        case 'completed': return 'Выполнено';
        case 'pending': return 'Ожидание';
        case 'failed': return 'Ошибка';
        case 'refunded': return 'Возвращено';
        default: return status;
    }
}

/**
 * Переключение видимости пароля
 */
function togglePasswordVisibility(event) {
    const button = event.currentTarget;
    const targetId = button.getAttribute('data-target');
    const input = document.getElementById(targetId);
    const icon = button.querySelector('i');
    
    if (!input || !icon) return;
    
    if (input.type === 'password') {
        input.type = 'text';
        icon.classList.remove('fa-eye');
        icon.classList.add('fa-eye-slash');
    } else {
        input.type = 'password';
        icon.classList.remove('fa-eye-slash');
        icon.classList.add('fa-eye');
    }
}

/**
 * Проверка honeypot поля
 */
function checkHoneypot(fieldId) {
    const field = document.getElementById(fieldId);
    if (!field) return true;
    
    return !field.value || field.value.trim() === '';
}

/**
 * Экранирование HTML
 */
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

/**
 * Обновление текста элемента
 */
function updateElementText(id, text) {
    const element = document.getElementById(id);
    if (element) {
        element.textContent = text;
    }
}

/**
 * Показать уведомление
 */
function showNotification(message, type = 'info') {
    if (window.App && window.App.showNotification) {
        window.App.showNotification(message, type);
    } else {
        // Fallback уведомление
        alert(`${type.toUpperCase()}: ${message}`);
    }
}

/**
 * Показать модальное окно
 */
function showModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.classList.add('show');
    }
}

/**
 * Скрыть модальное окно
 */
function hideModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.classList.remove('show');
    }
}

// Экспорт функций для тестирования
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        ProfileState,
        checkAuthentication,
        loadProfileData,
        updateProfileUI,
        handleProfileSubmit,
        validatePasswordRequirements,
        maskEmail,
        calculateAccountAge
    };
}