/**
 * history.js - Логика страницы истории покупок
 * Версия: 1.0.0
 * Безопасность: Высокий уровень (пагинация, фильтрация, защита данных)
 */

// Состояние приложения
const HistoryState = {
    currentPage: 1,
    currentStatus: 'all',
    currentDateFrom: null,
    currentDateTo: null,
    totalPages: 1,
    totalItems: 0,
    purchases: [],
    isLoading: false,
    sortBy: 'date',
    sortDirection: 'desc'
};

// Инициализация страницы истории
document.addEventListener('DOMContentLoaded', async () => {
    try {
        console.log('📋 Инициализация страницы истории...');
        
        // Проверка аутентификации
        const isAuthenticated = await checkAuthentication();
        if (!isAuthenticated) {
            showErrorState('Требуется авторизация');
            return;
        }
        
        // Настройка обработчиков событий
        setupEventListeners();
        
        // Настройка фильтров
        setupFilters();
        
        // Загрузка истории
        await loadHistory();
        
        console.log('✅ История успешно загружена');
    } catch (error) {
        console.error('❌ Ошибка инициализации истории:', error);
        showErrorState('Ошибка загрузки истории');
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
                showErrorState('Для просмотра истории требуется авторизация');
                
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
 * Загрузка истории покупок
 */
async function loadHistory() {
    showLoadingState();
    
    try {
        // Формируем URL с параметрами
        const params = new URLSearchParams({
            page: HistoryState.currentPage,
            limit: 10
        });
        
        if (HistoryState.currentStatus !== 'all') {
            params.append('status', HistoryState.currentStatus);
        }
        
        if (HistoryState.currentDateFrom) {
            params.append('dateFrom', HistoryState.currentDateFrom);
        }
        
        if (HistoryState.currentDateTo) {
            params.append('dateTo', HistoryState.currentDateTo);
        }
        
        // Используем safeFetch из app.js
        const response = await window.App.safeFetch(
            `${window.App.API_BASE_URL}/api/user/history?${params.toString()}`
        );
        
        if (!response || !response.purchases) {
            throw new Error('Неверный формат ответа');
        }
        
        // Сохраняем данные
        HistoryState.purchases = response.purchases;
        HistoryState.totalPages = response.pagination?.pages || 1;
        HistoryState.totalItems = response.pagination?.total || 0;
        
        // Обновляем интерфейс
        updateStatistics(response);
        displayPurchases(response.purchases);
        updatePagination(response.pagination);
        
        // Скрываем загрузку
        hideLoadingState();
        showContentState();
        
        console.log('📊 История загружена:', {
            page: HistoryState.currentPage,
            items: HistoryState.purchases.length,
            total: HistoryState.totalItems
        });
        
    } catch (error) {
        console.error('Ошибка загрузки истории:', error);
        showErrorState('Не удалось загрузить историю');
    }
}

/**
 * Обновление статистики
 */
function updateStatistics(data) {
    // Общее количество покупок
    updateElementText('totalPurchases', HistoryState.totalItems);
    
    // Общая сумма
    const totalAmount = calculateTotalAmount(data.purchases);
    updateElementText('totalAmount', `${totalAmount} ₽`);
    
    // Средний чек
    const avgPurchase = calculateAveragePurchase(data.purchases);
    updateElementText('avgPurchase', `${avgPurchase} ₽`);
    
    // Покупки за 30 дней
    const last30Days = calculateLast30Days(data.purchases);
    updateElementText('last30Days', last30Days);
}

/**
 * Расчет общей суммы
 */
function calculateTotalAmount(purchases) {
    if (!purchases || purchases.length === 0) return 0;
    
    return purchases.reduce((sum, purchase) => {
        return sum + (parseInt(purchase.price) || 0);
    }, 0);
}

/**
 * Расчет среднего чека
 */
function calculateAveragePurchase(purchases) {
    if (!purchases || purchases.length === 0) return 0;
    
    const total = calculateTotalAmount(purchases);
    return Math.round(total / purchases.length);
}

/**
 * Расчет покупок за 30 дней
 */
function calculateLast30Days(purchases) {
    if (!purchases) return 0;
    
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    return purchases.filter(purchase => {
        const purchaseDate = new Date(purchase.created_at);
        return purchaseDate >= thirtyDaysAgo;
    }).length;
}

/**
 * Отображение покупок в таблице
 */
function displayPurchases(purchases) {
    const tableBody = document.getElementById('purchasesTableBody');
    const noPurchasesEl = document.getElementById('noPurchases');
    
    if (!tableBody) return;
    
    // Очищаем таблицу
    tableBody.innerHTML = '';
    
    if (!purchases || purchases.length === 0) {
        if (noPurchasesEl) noPurchasesEl.style.display = 'block';
        return;
    }
    
    if (noPurchasesEl) noPurchasesEl.style.display = 'none';
    
    // Сортируем покупки
    const sortedPurchases = sortPurchases(purchases);
    
    // Добавляем строки
    sortedPurchases.forEach((purchase, index) => {
        const row = createPurchaseRow(purchase, index);
        tableBody.appendChild(row);
    });
}

/**
 * Создание строки таблицы для покупки
 */
function createPurchaseRow(purchase, index) {
    const row = document.createElement('tr');
    row.dataset.purchaseId = purchase.id;
    row.style.transition = 'all 0.3s ease';
    
    // Эффект при наведении
    row.onmouseenter = () => {
        row.style.backgroundColor = 'rgba(255, 255, 255, 0.05)';
    };
    
    row.onmouseleave = () => {
        row.style.backgroundColor = '';
    };
    
    // Форматируем дату
    const date = new Date(purchase.created_at);
    const formattedDate = date.toLocaleDateString('ru-RU');
    const formattedTime = date.toLocaleTimeString('ru-RU', { 
        hour: '2-digit', 
        minute: '2-digit' 
    });
    
    // Создаем ячейки
    row.innerHTML = `
        <td>
            <div style="font-weight: 500;">${formattedDate}</div>
            <small style="color: #8a9bb2; font-size: 0.85rem;">${formattedTime}</small>
        </td>
        <td>
            <div style="font-weight: 500; margin-bottom: 4px;">${escapeHtml(purchase.product_name)}</div>
            <small style="color: #8a9bb2; font-size: 0.85rem;">
                ID: ${purchase.id.substring(0, 8)}...
            </small>
        </td>
        <td>
            <div style="color: #e94560; font-weight: bold; font-size: 1.1rem;">
                ${purchase.price} ₽
            </div>
        </td>
        <td>
            ${createStatusBadge(purchase.status)}
        </td>
        <td>
            <div style="display: flex; align-items: center; gap: 8px;">
                ${createPaymentMethodIcon(purchase.payment_method)}
                <span>${getPaymentMethodText(purchase.payment_method)}</span>
            </div>
        </td>
        <td>
            <div style="display: flex; gap: 8px;">
                <button class="btn-action view-details" 
                        data-purchase-id="${purchase.id}"
                        title="Просмотреть детали"
                        aria-label="Просмотреть детали покупки">
                    <i class="fas fa-eye"></i>
                </button>
                ${purchase.status === 'completed' ? `
                    <button class="btn-action download-receipt" 
                            data-purchase-id="${purchase.id}"
                            title="Скачать чек"
                            aria-label="Скачать чек покупки">
                        <i class="fas fa-download"></i>
                    </button>
                ` : ''}
            </div>
        </td>
    `;
    
    return row;
}

/**
 * Создание бейджа статуса
 */
function createStatusBadge(status) {
    const className = getStatusClass(status);
    const text = getStatusText(status);
    
    return `<span class="status-badge ${className}">${text}</span>`;
}

/**
 * Создание иконки метода оплаты
 */
function createPaymentMethodIcon(method) {
    switch (method) {
        case 'card':
            return '<i class="fas fa-credit-card" style="color: #3498db;"></i>';
        case 'sbp':
            return '<i class="fas fa-mobile-alt" style="color: #2ecc71;"></i>';
        case 'paypal':
            return '<i class="fab fa-paypal" style="color: #003087;"></i>';
        default:
            return '<i class="fas fa-wallet" style="color: #8a9bb2;"></i>';
    }
}

/**
 * Получение текста метода оплаты
 */
function getPaymentMethodText(method) {
    switch (method) {
        case 'card': return 'Карта';
        case 'sbp': return 'СБП';
        case 'paypal': return 'PayPal';
        default: return method || 'Не указан';
    }
}

/**
 * Сортировка покупок
 */
function sortPurchases(purchases) {
    if (!purchases) return [];
    
    return [...purchases].sort((a, b) => {
        const dateA = new Date(a.created_at);
        const dateB = new Date(b.created_at);
        
        if (HistoryState.sortBy === 'date') {
            return HistoryState.sortDirection === 'desc' 
                ? dateB - dateA 
                : dateA - dateB;
        } else if (HistoryState.sortBy === 'price') {
            const priceA = parseInt(a.price) || 0;
            const priceB = parseInt(b.price) || 0;
            
            return HistoryState.sortDirection === 'desc' 
                ? priceB - priceA 
                : priceA - priceB;
        } else if (HistoryState.sortBy === 'name') {
            const nameA = a.product_name?.toLowerCase() || '';
            const nameB = b.product_name?.toLowerCase() || '';
            
            return HistoryState.sortDirection === 'desc' 
                ? nameB.localeCompare(nameA)
                : nameA.localeCompare(nameB);
        }
        
        return 0;
    });
}

/**
 * Обновление пагинации
 */
function updatePagination(pagination) {
    const paginationEl = document.getElementById('pagination');
    if (!paginationEl) return;
    
    const { page, pages } = pagination;
    HistoryState.currentPage = page;
    HistoryState.totalPages = pages;
    
    let html = '';
    
    // Кнопка "Назад"
    html += `
        <button class="pagination-btn ${page <= 1 ? 'disabled' : ''}" 
                ${page <= 1 ? 'disabled' : ''} 
                data-page="${page - 1}"
                aria-label="Предыдущая страница">
            <i class="fas fa-chevron-left"></i>
        </button>
    `;
    
    // Номера страниц
    const maxVisible = 5;
    let startPage = Math.max(1, page - Math.floor(maxVisible / 2));
    let endPage = Math.min(pages, startPage + maxVisible - 1);
    
    if (endPage - startPage + 1 < maxVisible) {
        startPage = Math.max(1, endPage - maxVisible + 1);
    }
    
    // Первая страница и многоточие
    if (startPage > 1) {
        html += `
            <button class="pagination-btn" data-page="1">1</button>
            ${startPage > 2 ? '<span class="pagination-ellipsis">...</span>' : ''}
        `;
    }
    
    // Основные страницы
    for (let i = startPage; i <= endPage; i++) {
        html += `
            <button class="pagination-btn ${i === page ? 'active' : ''}" 
                    data-page="${i}"
                    aria-label="Страница ${i}"
                    ${i === page ? 'aria-current="page"' : ''}>
                ${i}
            </button>
        `;
    }
    
    // Последняя страница и многоточие
    if (endPage < pages) {
        html += `
            ${endPage < pages - 1 ? '<span class="pagination-ellipsis">...</span>' : ''}
            <button class="pagination-btn" data-page="${pages}">${pages}</button>
        `;
    }
    
    // Кнопка "Вперед"
    html += `
        <button class="pagination-btn ${page >= pages ? 'disabled' : ''}" 
                ${page >= pages ? 'disabled' : ''} 
                data-page="${page + 1}"
                aria-label="Следующая страница">
            <i class="fas fa-chevron-right"></i>
        </button>
    `;
    
    paginationEl.innerHTML = html;
    
    // Добавляем обработчики
    setupPaginationListeners();
}

/**
 * Настройка обработчиков событий
 */
function setupEventListeners() {
    // Фильтры
    const applyFiltersBtn = document.getElementById('applyFilters');
    const resetFiltersBtn = document.getElementById('resetFilters');
    const statusFilter = document.getElementById('statusFilter');
    const dateFrom = document.getElementById('dateFrom');
    const dateTo = document.getElementById('dateTo');
    
    if (applyFiltersBtn) {
        applyFiltersBtn.addEventListener('click', applyFilters);
    }
    
    if (resetFiltersBtn) {
        resetFiltersBtn.addEventListener('click', resetFilters);
    }
    
    if (statusFilter) {
        statusFilter.addEventListener('change', (e) => {
            HistoryState.currentStatus = e.target.value;
        });
    }
    
    if (dateFrom) {
        dateFrom.addEventListener('change', (e) => {
            HistoryState.currentDateFrom = e.target.value || null;
        });
    }
    
    if (dateTo) {
        dateTo.addEventListener('change', (e) => {
            HistoryState.currentDateTo = e.target.value || null;
        });
    }
    
    // Сортировка по заголовкам таблицы
    setupTableSorting();
    
    // Экспорт данных
    setupExportListeners();
    
    // Закрытие модальных окон по Escape
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            closeAllModals();
        }
    });
}

/**
 * Настройка фильтров
 */
function setupFilters() {
    // Устанавливаем даты по умолчанию
    const dateFrom = document.getElementById('dateFrom');
    const dateTo = document.getElementById('dateTo');
    
    if (dateFrom) {
        // 30 дней назад
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        dateFrom.value = thirtyDaysAgo.toISOString().split('T')[0];
        dateFrom.max = new Date().toISOString().split('T')[0];
        
        HistoryState.currentDateFrom = dateFrom.value;
    }
    
    if (dateTo) {
        // Сегодня
        dateTo.value = new Date().toISOString().split('T')[0];
        dateTo.max = new Date().toISOString().split('T')[0];
        
        HistoryState.currentDateTo = dateTo.value;
    }
}

/**
 * Применение фильтров
 */
function applyFilters() {
    HistoryState.currentPage = 1; // Сбрасываем на первую страницу
    loadHistory();
    showNotification('Фильтры применены', 'success');
}

/**
 * Сброс фильтров
 */
function resetFilters() {
    HistoryState.currentStatus = 'all';
    HistoryState.currentDateFrom = null;
    HistoryState.currentDateTo = null;
    HistoryState.currentPage = 1;
    
    const statusFilter = document.getElementById('statusFilter');
    const dateFrom = document.getElementById('dateFrom');
    const dateTo = document.getElementById('dateTo');
    
    if (statusFilter) statusFilter.value = 'all';
    if (dateFrom) dateFrom.value = '';
    if (dateTo) dateTo.value = '';
    
    loadHistory();
    showNotification('Фильтры сброшены', 'info');
}

/**
 * Настройка сортировки таблицы
 */
function setupTableSorting() {
    // Получаем заголовки таблицы
    const headers = document.querySelectorAll('.history-table th');
    
    headers.forEach((header, index) => {
        if (index === 0 || index === 2) { // Дата и Цена
            header.style.cursor = 'pointer';
            header.setAttribute('role', 'button');
            header.setAttribute('tabindex', '0');
            
            header.addEventListener('click', () => {
                if (index === 0) {
                    // Сортировка по дате
                    if (HistoryState.sortBy === 'date') {
                        HistoryState.sortDirection = HistoryState.sortDirection === 'desc' ? 'asc' : 'desc';
                    } else {
                        HistoryState.sortBy = 'date';
                        HistoryState.sortDirection = 'desc';
                    }
                } else if (index === 2) {
                    // Сортировка по цене
                    if (HistoryState.sortBy === 'price') {
                        HistoryState.sortDirection = HistoryState.sortDirection === 'desc' ? 'asc' : 'desc';
                    } else {
                        HistoryState.sortBy = 'price';
                        HistoryState.sortDirection = 'desc';
                    }
                }
                
                loadHistory();
            });
            
            // Поддержка клавиатуры
            header.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    header.click();
                }
            });
        }
    });
}

/**
 * Настройка обработчиков пагинации
 */
function setupPaginationListeners() {
    const paginationEl = document.getElementById('pagination');
    if (!paginationEl) return;
    
    paginationEl.querySelectorAll('.pagination-btn:not(.disabled)').forEach(button => {
        button.addEventListener('click', () => {
            const page = parseInt(button.getAttribute('data-page'));
            if (page && page !== HistoryState.currentPage) {
                HistoryState.currentPage = page;
                loadHistory();
                
                // Прокрутка к верху таблицы
                const table = document.querySelector('.history-table');
                if (table) {
                    table.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }
            }
        });
        
        // Поддержка клавиатуры
        button.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                button.click();
            }
        });
    });
}

/**
 * Настройка экспорта данных
 */
function setupExportListeners() {
    // Экспорт по Ctrl+E
    document.addEventListener('keydown', (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key === 'e') {
            e.preventDefault();
            exportHistory();
        }
    });
    
    // Кнопка экспорта (если есть)
    const exportBtn = document.getElementById('exportHistory');
    if (exportBtn) {
        exportBtn.addEventListener('click', exportHistory);
    }
}

/**
 * Экспорт истории
 */
async function exportHistory() {
    try {
        showNotification('Подготовка данных для экспорта...', 'info');
        
        // Получаем все данные (без пагинации)
        const response = await window.App.safeFetch(
            `${window.App.API_BASE_URL}/api/user/history?limit=1000`
        );
        
        if (!response || !response.purchases) {
            throw new Error('Не удалось получить данные');
        }
        
        // Формируем CSV
        const csv = convertToCSV(response.purchases);
        
        // Создаем файл для скачивания
        downloadCSV(csv, `history_${new Date().toISOString().split('T')[0]}.csv`);
        
        showNotification('Экспорт завершен', 'success');
        
    } catch (error) {
        console.error('Ошибка экспорта:', error);
        showNotification('Ошибка экспорта данных', 'error');
    }
}

/**
 * Конвертация в CSV
 */
function convertToCSV(purchases) {
    const headers = ['Дата', 'Товар', 'Цена', 'Статус', 'Метод оплаты', 'ID'];
    
    const rows = purchases.map(purchase => {
        const date = new Date(purchase.created_at);
        const formattedDate = date.toLocaleDateString('ru-RU');
        
        return [
            formattedDate,
            `"${purchase.product_name?.replace(/"/g, '""')}"`,
            purchase.price,
            getStatusText(purchase.status),
            getPaymentMethodText(purchase.payment_method),
            purchase.id
        ].join(',');
    });
    
    return [headers.join(','), ...rows].join('\n');
}

/**
 * Скачивание CSV файла
 */
function downloadCSV(csv, filename) {
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    
    if (link.download !== undefined) {
        const url = URL.createObjectURL(blob);
        link.setAttribute('href', url);
        link.setAttribute('download', filename);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }
}

/**
 * Показать детали покупки
 */
function showPurchaseDetails(purchaseId) {
    const purchase = HistoryState.purchases.find(p => p.id === purchaseId);
    if (!purchase) return;
    
    // Открываем модальное окно с деталями
    const modal = document.getElementById('detailsModal');
    if (!modal) return;
    
    // Заполняем детали
    fillPurchaseDetails(purchase);
    
    // Показываем модальное окно
    modal.classList.add('show');
    
    // Блокируем прокрутку body
    document.body.style.overflow = 'hidden';
}

/**
 * Заполнение деталей покупки
 */
function fillPurchaseDetails(purchase) {
    const date = new Date(purchase.created_at);
    const formattedDate = date.toLocaleDateString('ru-RU');
    const formattedTime = date.toLocaleTimeString('ru-RU', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
    });
    
    // Основная информация
    updateElementText('detailProductName', purchase.product_name);
    updateElementText('detailPrice', `${purchase.price} ₽`);
    updateElementText('detailDate', `${formattedDate} ${formattedTime}`);
    
    // Информация об оплате
    updateElementText('detailPaymentMethod', getPaymentMethodText(purchase.payment_method));
    
    const statusElement = document.getElementById('detailStatus');
    if (statusElement) {
        statusElement.innerHTML = createStatusBadge(purchase.status);
    }
    
    updateElementText('detailTransactionId', purchase.id.substring(0, 12) + '...');
    
    // Информация о выдаче (демо)
    updateElementText('detailGameNickname', 'Player_' + Math.floor(Math.random() * 1000));
    
    const deliveryStatusElement = document.getElementById('detailDeliveryStatus');
    if (deliveryStatusElement) {
        deliveryStatusElement.innerHTML = createStatusBadge(
            purchase.status === 'completed' ? 'delivered' : 'pending'
        );
    }
    
    updateElementText('detailDeliveryDate', 
        purchase.status === 'completed' ? formattedDate : 'Ожидание выдачи'
    );
    
    // Настраиваем кнопки действий
    setupDetailActions(purchase);
}

/**
 * Настройка действий в модальном окне
 */
function setupDetailActions(purchase) {
    const actionsContainer = document.getElementById('detailsActions');
    if (!actionsContainer) return;
    
    actionsContainer.innerHTML = '';
    
    if (purchase.status === 'pending') {
        const cancelBtn = createActionButton(
            'Отменить покупку',
            'fas fa-times',
            'error',
            () => cancelPurchase(purchase.id)
        );
        actionsContainer.appendChild(cancelBtn);
    }
    
    if (purchase.status === 'failed') {
        const retryBtn = createActionButton(
            'Попробовать снова',
            'fas fa-redo',
            'warning',
            () => retryPurchase(purchase.id)
        );
        actionsContainer.appendChild(retryBtn);
    }
    
    if (purchase.status === 'completed') {
        const downloadBtn = document.getElementById('downloadReceipt');
        if (downloadBtn) {
            downloadBtn.style.display = 'inline-block';
            downloadBtn.onclick = () => downloadReceipt(purchase.id);
        }
    }
}

/**
 * Создание кнопки действия
 */
function createActionButton(text, icon, variant, onClick) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `btn-${variant}`;
    button.innerHTML = `<i class="${icon}"></i> ${text}`;
    button.addEventListener('click', onClick);
    return button;
}

/**
 * Отмена покупки
 */
async function cancelPurchase(purchaseId) {
    if (!confirm('Вы уверены, что хотите отменить покупку?')) return;
    
    try {
        showNotification('Отмена покупки...', 'info');
        
        // В реальном приложении здесь был бы API запрос
        // В демо-версии имитируем задержку
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        showNotification('Покупка отменена', 'success');
        closeDetailsModal();
        
        // Перезагружаем историю
        await loadHistory();
        
    } catch (error) {
        console.error('Ошибка отмены покупки:', error);
        showNotification('Ошибка отмены покупки', 'error');
    }
}

/**
 * Повтор покупки
 */
async function retryPurchase(purchaseId) {
    showNotification('Перенаправление на страницу оплаты...', 'info');
    
    // В демо-версии просто закрываем модальное окно
    setTimeout(() => {
        closeDetailsModal();
        showNotification('Оплата успешно завершена (демо)', 'success');
        
        // Перезагружаем историю через 2 секунды
        setTimeout(() => loadHistory(), 2000);
    }, 1500);
}

/**
 * Скачивание чека
 */
async function downloadReceipt(purchaseId) {
    showNotification('Подготовка чека...', 'info');
    
    try {
        // Имитация загрузки
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        // Создаем простой PDF (в демо - текстовый файл)
        const receiptContent = `
            ЧЕК ОБ ОПЛАТЕ
            ==============
            Дата: ${new Date().toLocaleDateString('ru-RU')}
            Время: ${new Date().toLocaleTimeString('ru-RU')}
            ID покупки: ${purchaseId.substring(0, 8)}...
            Товар: ${HistoryState.purchases.find(p => p.id === purchaseId)?.product_name}
            Сумма: ${HistoryState.purchases.find(p => p.id === purchaseId)?.price} ₽
            Статус: Оплачено
            
            Спасибо за покупку!
        `;
        
        const blob = new Blob([receiptContent], { type: 'text/plain' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `чек_${purchaseId.substring(0, 8)}.txt`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        
        showNotification('Чек успешно скачан', 'success');
        
    } catch (error) {
        console.error('Ошибка скачивания чека:', error);
        showNotification('Ошибка скачивания чека', 'error');
    }
}

/**
 * Закрытие модального окна деталей
 */
function closeDetailsModal() {
    const modal = document.getElementById('detailsModal');
    if (modal) {
        modal.classList.remove('show');
        document.body.style.overflow = '';
    }
}

/**
 * Закрытие всех модальных окон
 */
function closeAllModals() {
    const modals = document.querySelectorAll('.modal.show');
    modals.forEach(modal => {
        modal.classList.remove('show');
    });
    
    document.body.style.overflow = '';
}

// Вспомогательные функции

/**
 * Показать состояние загрузки
 */
function showLoadingState() {
    const loadingEl = document.getElementById('historyLoading');
    const contentEl = document.getElementById('historyContent');
    const errorEl = document.getElementById('historyError');
    
    if (loadingEl) loadingEl.style.display = 'flex';
    if (contentEl) contentEl.style.display = 'none';
    if (errorEl) errorEl.style.display = 'none';
    
    HistoryState.isLoading = true;
}

/**
 * Скрыть состояние загрузки
 */
function hideLoadingState() {
    const loadingEl = document.getElementById('historyLoading');
    if (loadingEl) loadingEl.style.display = 'none';
    
    HistoryState.isLoading = false;
}

/**
 * Показать контент
 */
function showContentState() {
    const contentEl = document.getElementById('historyContent');
    if (contentEl) contentEl.style.display = 'block';
}

/**
 * Показать состояние ошибки
 */
function showErrorState(message = 'Произошла ошибка') {
    hideLoadingState();
    
    const errorEl = document.getElementById('historyError');
    const contentEl = document.getElementById('historyContent');
    
    if (errorEl) {
        errorEl.style.display = 'block';
        const messageEl = errorEl.querySelector('p');
        if (messageEl) messageEl.textContent = message;
    }
    
    if (contentEl) contentEl.style.display = 'none';
    
    showNotification(message, 'error');
}

/**
 * Получение класса для статуса
 */
function getStatusClass(status) {
    switch (status) {
        case 'completed':
        case 'delivered':
            return 'status-completed';
        case 'pending':
            return 'status-pending';
        case 'failed':
        case 'cancelled':
            return 'status-failed';
        case 'refunded':
            return 'status-refunded';
        default:
            return '';
    }
}

/**
 * Получение текста для статуса
 */
function getStatusText(status) {
    switch (status) {
        case 'completed':
            return 'Выполнено';
        case 'delivered':
            return 'Выдано';
        case 'pending':
            return 'Ожидание';
        case 'failed':
            return 'Ошибка';
        case 'cancelled':
            return 'Отменено';
        case 'refunded':
            return 'Возвращено';
        default:
            return status;
    }
}

/**
 * Экранирование HTML
 */
function escapeHtml(text) {
    if (!text) return '';
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
        console.log(`${type.toUpperCase()}: ${message}`);
    }
}

// Обработчики для кнопок в таблице (делегирование событий)
document.addEventListener('click', (e) => {
    // Просмотр деталей
    if (e.target.closest('.view-details')) {
        const button = e.target.closest('.view-details');
        const purchaseId = button.getAttribute('data-purchase-id');
        showPurchaseDetails(purchaseId);
    }
    
    // Скачивание чека
    if (e.target.closest('.download-receipt')) {
        const button = e.target.closest('.download-receipt');
        const purchaseId = button.getAttribute('data-purchase-id');
        downloadReceipt(purchaseId);
    }
    
    // Закрытие модального окна деталей
    if (e.target.closest('#closeDetailsModal') || 
        e.target.closest('#closeDetails') ||
        (e.target.closest('#detailsModal') && e.target.id === 'detailsModal')) {
        closeDetailsModal();
    }
});

// Экспорт функций для тестирования
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        HistoryState,
        checkAuthentication,
        loadHistory,
        calculateTotalAmount,
        calculateAveragePurchase,
        convertToCSV,
        getStatusClass,
        getStatusText
    };
}