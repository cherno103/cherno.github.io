// Валидация данных на клиенте

const Validation = {
    // Валидация email
    validateEmail: (email) => {
        const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return {
            valid: regex.test(email),
            error: !regex.test(email) ? 'Некорректный формат email' : null
        };
    },
    
    // Валидация пароля
    validatePassword: (password) => {
        const errors = [];
        
        if (password.length < 8) {
            errors.push('Минимум 8 символов');
        }
        if (!/[a-z]/.test(password)) {
            errors.push('Минимум одна строчная буква');
        }
        if (!/[A-Z]/.test(password)) {
            errors.push('Минимум одна заглавная буква');
        }
        if (!/\d/.test(password)) {
            errors.push('Минимум одна цифра');
        }
        if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) {
            errors.push('Минимум один специальный символ');
        }
        
        return {
            valid: errors.length === 0,
            errors: errors.length > 0 ? errors.join(', ') : null
        };
    },
    
    // Валидация Minecraft ника
    validateMinecraftUsername: (username) => {
        if (!username) {
            return { valid: true, error: null };
        }
        
        if (username.length < 3 || username.length > 16) {
            return {
                valid: false,
                error: 'Ник должен быть от 3 до 16 символов'
            };
        }
        
        // Разрешаем Unicode буквы, цифры и подчеркивания
        const regex = /^[\p{L}\p{N}_]+$/u;
        if (!regex.test(username)) {
            return {
                valid: false,
                error: 'Только буквы, цифры и подчеркивания'
            };
        }
        
        return { valid: true, error: null };
    },
    
    // Валидация суммы платежа
    validateAmount: (amount) => {
        const num = parseFloat(amount);
        if (isNaN(num) || num <= 0) {
            return { valid: false, error: 'Некорректная сумма' };
        }
        if (num > 100000) {
            return { valid: false, error: 'Сумма слишком большая' };
        }
        return { valid: true, error: null };
    },
    
    // Санитизация HTML (защита от XSS)
    sanitizeHTML: (str) => {
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    },
    
    // Валидация CSRF токена
    validateCsrfToken: (token) => {
        return token && token.length === 36; // UUID v4
    },
    
    // Проверка honeypot поля
    checkHoneypot: (fieldValue) => {
        return !fieldValue || fieldValue.trim() === '';
    },
    
    // Валидация банковских данных
    validateBankDetails: (bankId, details) => {
        const validBanks = ['sber', 'tinkoff', 'vtb', 'alpha', 'gazprom', 'raiffaisen'];
        if (!validBanks.includes(bankId)) {
            return { valid: false, error: 'Некорректный банк' };
        }
        
        // Дополнительные проверки для каждого банка
        switch (bankId) {
            case 'sber':
            case 'vtb':
                if (!details.phone || !/^\+7\d{10}$/.test(details.phone)) {
                    return { valid: false, error: 'Некорректный номер телефона' };
                }
                break;
            case 'tinkoff':
                if (!details.card || !/^\d{16}$/.test(details.card.replace(/\s/g, ''))) {
                    return { valid: false, error: 'Некорректный номер карты' };
                }
                break;
        }
        
        return { valid: true, error: null };
    }
};

// Автоматическая валидация форм
document.addEventListener('DOMContentLoaded', () => {
    // Валидация форм регистрации
    const registerForm = document.getElementById('registerFormEl');
    if (registerForm) {
        const emailInput = document.getElementById('registerEmail');
        const passwordInput = document.getElementById('registerPassword');
        const confirmInput = document.getElementById('registerConfirmPassword');
        const nicknameInput = document.getElementById('gameNickname');
        
        if (emailInput) {
            emailInput.addEventListener('blur', () => {
                const validation = Validation.validateEmail(emailInput.value);
                showFieldValidation(emailInput, validation);
            });
        }
        
        if (passwordInput) {
            passwordInput.addEventListener('blur', () => {
                const validation = Validation.validatePassword(passwordInput.value);
                showFieldValidation(passwordInput, validation);
            });
        }
        
        if (confirmInput && passwordInput) {
            confirmInput.addEventListener('blur', () => {
                const validation = {
                    valid: confirmInput.value === passwordInput.value,
                    error: confirmInput.value !== passwordInput.value ? 'Пароли не совпадают' : null
                };
                showFieldValidation(confirmInput, validation);
            });
        }
        
        if (nicknameInput) {
            nicknameInput.addEventListener('blur', () => {
                const validation = Validation.validateMinecraftUsername(nicknameInput.value);
                showFieldValidation(nicknameInput, validation);
            });
        }
    }
    
    // Валидация форм входа
    const loginForm = document.getElementById('loginFormEl');
    if (loginForm) {
        const emailInput = document.getElementById('loginEmail');
        if (emailInput) {
            emailInput.addEventListener('blur', () => {
                const validation = Validation.validateEmail(emailInput.value);
                showFieldValidation(emailInput, validation);
            });
        }
    }
    
    // Валидация форм покупки
    const purchaseForm = document.getElementById('purchaseForm');
    if (purchaseForm) {
        const emailInput = purchaseForm.querySelector('input[type="email"]');
        if (emailInput) {
            emailInput.addEventListener('blur', () => {
                const validation = Validation.validateEmail(emailInput.value);
                showFieldValidation(emailInput, validation);
            });
        }
    }
});

// Показать результат валидации поля
function showFieldValidation(input, validation) {
    // Удаляем предыдущие сообщения об ошибках
    const existingError = input.parentElement.querySelector('.validation-error');
    if (existingError) {
        existingError.remove();
    }
    
    // Удаляем предыдущие классы
    input.classList.remove('is-valid', 'is-invalid');
    
    if (validation.valid) {
        input.classList.add('is-valid');
    } else {
        input.classList.add('is-invalid');
        const errorDiv = document.createElement('div');
        errorDiv.className = 'validation-error text-danger mt-1 small';
        errorDiv.textContent = validation.error;
        input.parentElement.appendChild(errorDiv);
    }
}

// Добавление стилей для валидации
const style = document.createElement('style');
style.textContent = `
    .is-valid {
        border-color: #28a745 !important;
        background-image: url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' width='8' height='8' viewBox='0 0 8 8'%3e%3cpath fill='%2328a745' d='M2.3 6.73L.6 4.53c-.4-1.04.46-1.4 1.1-.8l1.1 1.4 3.4-3.8c.6-.63 1.6-.27 1.2.7l-4 4.6c-.43.5-.8.4-1.1.1z'/%3e%3c/svg%3e") !important;
        background-repeat: no-repeat;
        background-position: right calc(0.375em + 0.1875rem) center;
        background-size: calc(0.75em + 0.375rem) calc(0.75em + 0.375rem);
    }
    
    .is-invalid {
        border-color: #dc3545 !important;
        background-image: url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' fill='none' stroke='%23dc3545' viewBox='0 0 12 12'%3e%3ccircle cx='6' cy='6' r='4.5'/%3e%3cpath stroke-linejoin='round' d='M5.8 3.6h.4L6 6.5z'/%3e%3ccircle cx='6' cy='8.2' r='.6' fill='%23dc3545' stroke='none'/%3e%3c/svg%3e") !important;
        background-repeat: no-repeat;
        background-position: right calc(0.375em + 0.1875rem) center;
        background-size: calc(0.75em + 0.375rem) calc(0.75em + 0.375rem);
    }
    
    .validation-error {
        font-size: 0.875em;
        color: #dc3545;
    }
`;
document.head.appendChild(style);

// Экспорт для использования в других файлах
window.Validation = Validation;