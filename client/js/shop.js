// Логика магазина с улучшенной безопасностью

document.addEventListener('DOMContentLoaded', async function() {
    try {
        // Проверка аутентификации
        const isAuthenticated = await window.App.checkAuth();
        
        // Показать предупреждение если не авторизован
        const authWarning = document.getElementById('authWarning');
        if (authWarning && !isAuthenticated) {
            authWarning.style.display = 'block';
        }
        
        // Загрузка товаров
        await loadProducts();
        
        // Настройка фильтров
        setupFilters();
        
        // Настройка обработчиков событий
        setupEventHandlers();
        
        // Инициализация модального окна
        initPurchaseModal();
    } catch (error) {
        console.error('Ошибка инициализации магазина:', error);
        window.App.showNotification('Ошибка загрузки магазина', 'error');
    }
});

// Настройка фильтров
function setupFilters() {
    // Фильтрация по категориям
    const categoryTabs = document.querySelectorAll('.tab-btn');
    categoryTabs.forEach(tab => {
        tab.addEventListener('click', () => {
            categoryTabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            
            const category = tab.dataset.category;
            loadProducts(category);
        });
    });
    
    // Поиск товаров с debounce
    const searchInput = document.getElementById('searchProducts');
    if (searchInput) {
        searchInput.addEventListener('input', debounce(() => {
            loadProducts(getActiveCategory());
        }, 300));
    }
    
    // Сортировка товаров
    const sortSelect = document.getElementById('sortProducts');
    if (sortSelect) {
        sortSelect.addEventListener('change', () => {
            loadProducts(getActiveCategory());
        });
    }
}

// Настройка обработчиков событий
function setupEventHandlers() {
    // Защита от быстрых кликов
    document.addEventListener('click', (e) => {
        const buyBtn = e.target.closest('.buy-btn');
        const productCard = e.target.closest('.product-card');
        
        if (buyBtn || productCard) {
            const now = Date.now();
            const lastClick = window.lastProductClick || 0;
            
            if (now - lastClick < 1000) {
                e.preventDefault();
                e.stopPropagation();
                window.App.showNotification('Подождите немного перед следующим действием', 'warning');
                return;
            }
            
            window.lastProductClick = now;
            
            if (buyBtn) {
                e.preventDefault();
                const productId = buyBtn.dataset.productId;
                if (productId) {
                    openPurchaseModal(productId);
                }
            }
        }
    });
}

// Инициализация модального окна
function initPurchaseModal() {
    const modal = document.getElementById('purchaseModal');
    const closeModal = document.getElementById('closeModal');
    const cancelPurchase = document.getElementById('cancelPurchase');
    
    if (modal && closeModal) {
        closeModal.addEventListener('click', () => {
            modal.classList.remove('show');
        });
    }
    
    if (modal && cancelPurchase) {
        cancelPurchase.addEventListener('click', () => {
            modal.classList.remove('show');
        });
    }
    
    // Закрытие модального окна при клике вне его
    if (modal) {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                modal.classList.remove('show');
            }
        });
    }
}

// Получение активной категории
function getActiveCategory() {
    const activeTab = document.querySelector('.tab-btn.active');
    return activeTab ? activeTab.dataset.category : 'all';
}

// Загрузка товаров с кэшированием
async function loadProducts(category = 'all') {
    const productsContainer = document.getElementById('productsContainer');
    const productsLoading = document.getElementById('productsLoading');
    const noProducts = document.getElementById('noProducts');
    const searchInput = document.getElementById('searchProducts');
    const sortSelect = document.getElementById('sortProducts');
    
    if (!productsContainer) return;
    
    try {
        // Показать индикатор загрузки
        if (productsLoading) {
            productsLoading.style.display = 'block';
            productsLoading.classList.add('fade-in');
        }
        
        if (noProducts) {
            noProducts.style.display = 'none';
        }
        
        if (productsContainer) {
            productsContainer.innerHTML = '';
        }
        
        // Формирование URL
        let url = `${window.App.API_BASE_URL}/api/shop/products`;
        const params = [];
        
        if (category && category !== 'all') {
            url += '?category=' + encodeURIComponent(category);
        }
        
        const products = await window.App.safeFetch(url);
        if (!products) {
            if (noProducts) {
                noProducts.style.display = 'block';
                noProducts.classList.add('fade-in');
            }
            return;
        }
        
        // Фильтрация по поисковому запросу
        const searchTerm = searchInput ? searchInput.value.toLowerCase().trim() : '';
        let filteredProducts = products;
        
        if (searchTerm) {
            filteredProducts = products.filter(product => {
                const nameMatch = product.name.toLowerCase().includes(searchTerm);
                const descMatch = product.description ? product.description.toLowerCase().includes(searchTerm) : false;
                const categoryMatch = product.category ? product.category.toLowerCase().includes(searchTerm) : false;
                return nameMatch || descMatch || categoryMatch;
            });
        }
        
        // Сортировка
        const sortValue = sortSelect ? sortSelect.value : 'popular';
        filteredProducts = sortProducts(filteredProducts, sortValue);
        
        // Отображение товаров
        if (filteredProducts.length > 0) {
            displayProducts(filteredProducts);
        } else {
            if (noProducts) {
                noProducts.style.display = 'block';
                noProducts.classList.add('fade-in');
            }
        }
    } catch (error) {
        console.error('Ошибка при загрузке товаров:', error);
        window.App.showNotification('Ошибка загрузки товаров', 'error');
        
        if (noProducts) {
            noProducts.style.display = 'block';
            noProducts.textContent = 'Ошибка загрузки товаров. Пожалуйста, попробуйте позже.';
            noProducts.classList.add('fade-in');
        }
    } finally {
        if (productsLoading) {
            productsLoading.style.display = 'none';
        }
    }
}

// Сортировка товаров
function sortProducts(products, sortValue) {
    return [...products].sort((a, b) => {
        switch (sortValue) {
            case 'price-low':
                return a.price - b.price;
            case 'price-high':
                return b.price - a.price;
            case 'name-asc':
                return a.name.localeCompare(b.name);
            case 'name-desc':
                return b.name.localeCompare(a.name);
            case 'new':
                // Сортировка по дате создания (если есть)
                const dateA = a.created_at ? new Date(a.created_at) : new Date(0);
                const dateB = b.created_at ? new Date(b.created_at) : new Date(0);
                return dateB - dateA;
            default:
                // По популярности (по умолчанию) или рейтингу
                const ratingA = a.rating || 0;
                const ratingB = b.rating || 0;
                return ratingB - ratingA;
        }
    });
}

// Отображение товаров с защитой от XSS
function displayProducts(products) {
    const productsContainer = document.getElementById('productsContainer');
    if (!productsContainer) return;
    
    productsContainer.innerHTML = '';
    
    products.forEach(product => {
        const productCard = createProductCard(product);
        if (productCard) {
            productsContainer.appendChild(productCard);
        }
    });
    
    // Добавляем анимацию появления
    productsContainer.classList.add('fade-in');
}

// Создание карточки товара безопасно
function createProductCard(product) {
    if (!product || !product.id || !product.name) {
        console.error('Invalid product data:', product);
        return null;
    }
    
    const card = document.createElement('div');
    card.className = 'product-card slide-up';
    card.dataset.productId = product.id;
    
    // Создаем элементы безопасно
    if (product.badge) {
        const badge = document.createElement('div');
        badge.className = 'product-badge';
        badge.textContent = product.badge;
        card.appendChild(badge);
    }
    
    // Заголовок товара
    const header = document.createElement('div');
    header.className = 'product-header';
    header.style.backgroundColor = product.color || '#1a1a2e';
    
    const icon = document.createElement('div');
    icon.className = 'product-icon';
    
    const iconElement = document.createElement('i');
    iconElement.className = `fas fa-${getProductIcon(product.category)}`;
    icon.appendChild(iconElement);
    
    const title = document.createElement('h3');
    title.textContent = product.name;
    
    const price = document.createElement('div');
    price.className = 'product-price';
    price.textContent = `${product.price} ₽`;
    
    header.appendChild(icon);
    header.appendChild(title);
    header.appendChild(price);
    
    // Тело товара
    const body = document.createElement('div');
    body.className = 'product-body';
    
    if (product.description) {
        const description = document.createElement('p');
        description.textContent = product.description;
        description.style.cssText = 'color: #8a9bb2; margin-bottom: 20px; line-height: 1.6;';
        body.appendChild(description);
    }
    
    // Особенности товара
    if (product.features) {
        try {
            const features = typeof product.features === 'string' 
                ? JSON.parse(product.features) 
                : product.features;
            
            if (Array.isArray(features) && features.length > 0) {
                const featuresList = document.createElement('ul');
                featuresList.className = 'product-features';
                
                features.forEach(feature => {
                    if (typeof feature === 'string') {
                        const li = document.createElement('li');
                        
                        const checkIcon = document.createElement('i');
                        checkIcon.className = 'fas fa-check';
                        
                        const text = document.createTextNode(` ${feature}`);
                        
                        li.appendChild(checkIcon);
                        li.appendChild(text);
                        featuresList.appendChild(li);
                    }
                });
                
                if (featuresList.children.length > 0) {
                    body.appendChild(featuresList);
                }
            }
        } catch (e) {
            console.warn('Ошибка парсинга features для товара', product.id, ':', e);
        }
    }
    
    // Информация о наличии
    if (product.stock !== undefined && product.stock !== -1) {
        const stockInfo = document.createElement('div');
        stockInfo.className = 'product-stock';
        stockInfo.style.cssText = 'margin-top: 15px; padding: 8px 12px; background: rgba(255, 255, 255, 0.1); border-radius: 4px;';
        
        if (product.stock === 0) {
            stockInfo.textContent = 'Нет в наличии';
            stockInfo.style.color = '#dc3545';
        } else if (product.stock < 10) {
            stockInfo.textContent = `Осталось: ${product.stock} шт.`;
            stockInfo.style.color = '#ffc107';
        } else {
            stockInfo.textContent = 'В наличии';
            stockInfo.style.color = '#28a745';
        }
        
        body.appendChild(stockInfo);
    }
    
    // Кнопка покупки
    const actions = document.createElement('div');
    actions.className = 'product-actions';
    
    const buyButton = document.createElement('button');
    buyButton.className = 'btn-primary buy-btn';
    buyButton.dataset.productId = product.id;
    
    if (product.stock === 0) {
        buyButton.disabled = true;
        buyButton.textContent = 'Нет в наличии';
        buyButton.style.opacity = '0.6';
        buyButton.style.cursor = 'not-allowed';
    } else {
        const cartIcon = document.createElement('i');
        cartIcon.className = 'fas fa-shopping-cart';
        
        const buttonText = document.createTextNode(' Купить');
        
        buyButton.appendChild(cartIcon);
        buyButton.appendChild(buttonText);
    }
    
    actions.appendChild(buyButton);
    
    // Собираем карточку
    card.appendChild(header);
    card.appendChild(body);
    card.appendChild(actions);
    
    return card;
}

// Получение иконки для товара
function getProductIcon(category) {
    const icons = {
        'ranks': 'crown',
        'currency': 'coins',
        'kits': 'box-open',
        'other': 'gift'
    };
    return icons[category] || 'cube';
}

// Открытие модального окна покупки
async function openPurchaseModal(productId) {
    const modal = document.getElementById('purchaseModal');
    const closeModal = document.getElementById('closeModal');
    const cancelPurchase = document.getElementById('cancelPurchase');
    const purchaseForm = document.getElementById('purchaseForm');
    const paymentMethodSelect = document.getElementById('paymentMethod');
    const sbpBanks = document.getElementById('sbpBanks');
    
    if (!modal || !purchaseForm) {
        console.error('Modal elements not found');
        return;
    }
    
    try {
        // Загрузка данных товара
        const products = await window.App.safeFetch(`${window.App.API_BASE_URL}/api/shop/products`);
        if (!products) {
            window.App.showNotification('Ошибка загрузки данных товара', 'error');
            return;
        }
        
        const product = products.find(p => p.id === productId);
        if (!product) {
            window.App.showNotification('Товар не найден', 'error');
            return;
        }
        
        // Проверка наличия товара
        if (product.stock === 0) {
            window.App.showNotification('Товар временно отсутствует', 'warning');
            return;
        }
        
        // Заполнение данных товара безопасно
        const modalProductName = document.getElementById('modalProductName');
        const modalProductDesc = document.getElementById('modalProductDesc');
        const modalProductIcon = document.getElementById('modalProductIcon');
        const modalProductPrice = document.getElementById('modalProductPrice');
        
        if (modalProductName) modalProductName.textContent = product.name;
        if (modalProductDesc) modalProductDesc.textContent = product.description || '';
        
        if (modalProductIcon) {
            modalProductIcon.className = `fas fa-${getProductIcon(product.category)}`;
        }
        
        if (modalProductPrice) {
            modalProductPrice.textContent = `${product.price} ₽`;
        }
        
        // Загрузка данных пользователя
        const profile = await window.App.safeFetch(`${window.App.API_BASE_URL}/api/user/profile`);
        if (profile) {
            const modalUsername = document.getElementById('modalUsername');
            if (modalUsername) {
                modalUsername.value = profile.game_nickname || '';
            }
        }
        
        // Обработчики событий для выбора метода оплаты
        if (paymentMethodSelect) {
            paymentMethodSelect.addEventListener('change', () => {
                if (paymentMethodSelect.value === 'sbp') {
                    if (sbpBanks) {
                        sbpBanks.classList.add('show');
                        loadSbpBanks();
                    }
                } else {
                    if (sbpBanks) {
                        sbpBanks.classList.remove('show');
                    }
                }
            });
        }
        
        // Обработка формы
        purchaseForm.onsubmit = async (e) => {
            e.preventDefault();
            
            // Проверка honeypot
            const botCheck = document.getElementById('bot_check');
            if (botCheck && botCheck.value && botCheck.value.trim() !== '') {
                console.warn('Honeypot field filled');
                window.App.showNotification('Обнаружена подозрительная активность', 'error');
                return;
            }
            
            const emailInput = document.getElementById('email');
            const paymentMethod = paymentMethodSelect ? paymentMethodSelect.value : 'card';
            const selectedBank = document.getElementById('selected_bank') ? document.getElementById('selected_bank').value : '';
            
            if (!emailInput) {
                window.App.showNotification('Email не указан', 'error');
                return;
            }
            
            const email = emailInput.value.trim();
            
            // Валидация email
            if (!email) {
                window.App.showNotification('Введите email', 'error');
                return;
            }
            
            const emailValidation = window.Validation ? window.Validation.validateEmail(email) : { valid: true };
            if (!emailValidation.valid) {
                window.App.showNotification(emailValidation.error || 'Некорректный email', 'error');
                return;
            }
            
            // Проверка игрового ника
            const nicknameInput = document.getElementById('modalUsername');
            if (nicknameInput && !nicknameInput.value.trim()) {
                window.App.showNotification('Укажите игровой никнейм', 'error');
                return;
            }
            
            try {
                const response = await window.App.safeFetch(`${window.App.API_BASE_URL}/api/shop/purchase`, {
                    method: 'POST',
                    body: JSON.stringify({
                        productId,
                        email,
                        paymentMethod,
                        selectedBank: paymentMethod === 'sbp' ? selectedBank : undefined
                    })
                });
                
                if (response) {
                    window.App.showNotification('Покупка оформлена! Перенаправление на страницу оплаты...');
                    modal.classList.remove('show');
                    
                    if (response.paymentUrl) {
                        // Открываем платежную страницу в новом окне
                        setTimeout(() => {
                            const paymentWindow = window.open(response.paymentUrl, '_blank', 'noopener,noreferrer');
                            if (paymentWindow) {
                                // Мониторинг состояния платежа
                                checkPaymentStatus(response.purchaseId);
                            }
                        }, 1500);
                    }
                }
            } catch (error) {
                console.error('Ошибка при оформлении покупки:', error);
                window.App.showNotification('Ошибка оформления покупки', 'error');
            }
        };
        
        // Открытие модального окна
        modal.classList.add('show');
        
        // Сброс формы
        purchaseForm.reset();
        
        // Скрыть банки СБП по умолчанию
        if (sbpBanks && paymentMethodSelect && paymentMethodSelect.value !== 'sbp') {
            sbpBanks.classList.remove('show');
        }
        
    } catch (error) {
        console.error('Ошибка при открытии модального окна:', error);
        window.App.showNotification('Ошибка загрузки данных', 'error');
    }
}

// Проверка статуса платежа
async function checkPaymentStatus(purchaseId) {
    try {
        // Проверяем статус каждые 10 секунд в течение 5 минут
        let attempts = 0;
        const maxAttempts = 30; // 5 минут
        
        const checkInterval = setInterval(async () => {
            attempts++;
            
            try {
                const response = await window.App.safeFetch(`${window.App.API_BASE_URL}/api/user/history`);
                if (response && response.purchases) {
                    const purchase = response.purchases.find(p => p.id === purchaseId);
                    if (purchase && purchase.status === 'completed') {
                        clearInterval(checkInterval);
                        window.App.showNotification('Платеж успешно завершен!', 'success');
                        
                        // Обновляем историю покупок если мы на странице истории
                        if (window.location.pathname.includes('history.html')) {
                            window.location.reload();
                        }
                    }
                }
            } catch (error) {
                console.error('Ошибка проверки статуса платежа:', error);
            }
            
            if (attempts >= maxAttempts) {
                clearInterval(checkInterval);
                console.log('Превышено время ожидания подтверждения платежа');
            }
        }, 10000);
    } catch (error) {
        console.error('Ошибка при запуске проверки платежа:', error);
    }
}

// Загрузка списка банков для СБП
async function loadSbpBanks() {
    const banksContainer = document.getElementById('banksContainer');
    const selectedBankInput = document.getElementById('selected_bank');
    
    if (!banksContainer || !selectedBankInput) return;
    
    const banks = [
        { id: 'sber', name: 'Сбербанк', logo: '🏦' },
        { id: 'tinkoff', name: 'Тинькофф', logo: '💳' },
        { id: 'vtb', name: 'ВТБ', logo: '🏛️' },
        { id: 'alpha', name: 'Альфа-Банк', logo: '🔷' },
        { id: 'gazprom', name: 'Газпромбанк', logo: '⛽' },
        { id: 'raiffaisen', name: 'Райффайзен', logo: '🇦🇹' }
    ];
    
    banksContainer.innerHTML = '';
    
    banks.forEach(bank => {
        const bankItem = document.createElement('div');
        bankItem.className = 'bank-item';
        bankItem.dataset.bankId = bank.id;
        bankItem.title = bank.name;
        
        const logo = document.createElement('div');
        logo.className = 'bank-logo';
        logo.textContent = bank.logo;
        
        const name = document.createElement('div');
        name.className = 'bank-name';
        name.textContent = bank.name;
        
        bankItem.appendChild(logo);
        bankItem.appendChild(name);
        
        bankItem.addEventListener('click', () => {
            document.querySelectorAll('.bank-item').forEach(i => i.classList.remove('active'));
            bankItem.classList.add('active');
            selectedBankInput.value = bank.id;
        });
        
        banksContainer.appendChild(bankItem);
    });
}

// Debounce функция
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// Экспорт функций для отладки
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        loadProducts,
        setupFilters,
        openPurchaseModal,
        debounce
    };
}