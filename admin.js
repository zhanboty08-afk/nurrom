/**
 * NURROOM Furniture Store — Senior React Admin Dashboard
 * Specialized for Tables & Chairs (Столы и Стулья)
 * Built with React 18, Bootstrap 5.3, Bootstrap Icons & HTM
 */

(function () {
  'use strict';

  const { useState, useEffect, useMemo, useCallback, useRef } = React;
  const html = window.htm.bind(React.createElement);

  // --------------------------------------------------------------------------
  // Constants & Utilities
  // --------------------------------------------------------------------------
  const STATUSES = ['Новый', 'Подтверждён', 'В доставке', 'Выполнен', 'Отменён'];

  const STATUS_CONFIG = {
    'Новый': {
      color: 'warning',
      badgeClass: 'bg-warning-subtle text-warning-emphasis border border-warning-subtle',
      borderClass: 'status-новый',
      icon: 'bi-record-circle',
      next: 'Подтверждён',
      nextLabel: 'Подтвердить заказ',
      nextIcon: 'bi-check2',
      nextBtnClass: 'btn-warning'
    },
    'Подтверждён': {
      color: 'info',
      badgeClass: 'bg-info-subtle text-info-emphasis border border-info-subtle',
      borderClass: 'status-подтверждён',
      icon: 'bi-check2-circle',
      next: 'В доставке',
      nextLabel: 'Передать в доставку',
      nextIcon: 'bi-truck',
      nextBtnClass: 'btn-info'
    },
    'В доставке': {
      color: 'primary',
      badgeClass: 'bg-primary-subtle text-primary-emphasis border border-primary-subtle',
      borderClass: 'status-в-доставке',
      icon: 'bi-truck',
      next: 'Выполнен',
      nextLabel: 'Заказ доставлен',
      nextIcon: 'bi-check2-all',
      nextBtnClass: 'btn-primary'
    },
    'Выполнен': {
      color: 'success',
      badgeClass: 'bg-success-subtle text-success-emphasis border border-success-subtle',
      borderClass: 'status-выполнен',
      icon: 'bi-check2-all',
      next: null
    },
    'Отменён': {
      color: 'secondary',
      badgeClass: 'bg-secondary-subtle text-secondary-emphasis border border-secondary-subtle',
      borderClass: 'status-отменён',
      icon: 'bi-slash-circle',
      next: null
    }
  };

  const imageExtensions = new Map([
    ['image/jpeg', 'jpg'],
    ['image/png', 'png'],
    ['image/webp', 'webp']
  ]);
  const maxImageBytes = 5 * 1024 * 1024;
  const optionalProductColumns = ['dimensions', 'availability', 'gallery'];
  const extendedProductColumns = [
    'length_cm',
    'width_cm',
    'height_cm',
    'seat_height_cm',
    'seats',
    'shape',
    'extendable',
    'warranty_months',
    'delivery_time'
  ];

  function safeImageURL(value) {
    try {
      const url = new URL(String(value || ''));
      return url.protocol === 'https:' && !url.username && !url.password ? url.href : null;
    } catch {
      return null;
    }
  }

  function formatDate(dateStr) {
    if (!dateStr) return '';
    try {
      const date = new Date(dateStr);
      if (isNaN(date.getTime())) return String(dateStr);

      const now = new Date();
      const isToday = date.toDateString() === now.toDateString();
      const yesterday = new Date(now);
      yesterday.setDate(now.getDate() - 1);
      const isYesterday = date.toDateString() === yesterday.toDateString();

      const timeStr = date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });

      if (isToday) return `Сегодня в ${timeStr}`;
      if (isYesterday) return `Вчера в ${timeStr}`;

      return date.toLocaleDateString('ru-RU', {
        day: 'numeric',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch {
      return String(dateStr);
    }
  }

  function cleanPhone(phone) {
    return String(phone || '').replace(/\D/g, '');
  }

  function isChairItem(name = '', category = '') {
    const text = `${name} ${category}`.toLowerCase();
    return text.includes('стул') || text.includes('кресло') || text.includes('табурет');
  }

  function isTableItem(name = '', category = '') {
    const text = `${name} ${category}`.toLowerCase();
    return text.includes('стол') || text.includes('парта') || text.includes('консоль');
  }

  // --------------------------------------------------------------------------
  // Custom Furniture Icon Components (User's Outline Chair & Table)
  // --------------------------------------------------------------------------
  function ChairIcon({ size = '1.15em', className = '', style = {} }) {
    return html`
      <span
        class="icon-furniture icon-chair ${className}"
        style=${{ width: size, height: size, ...style }}
        aria-hidden="true"
        title="Стул"
      ></span>
    `;
  }

  function TableIcon({ size = '1.15em', className = '', style = {} }) {
    return html`
      <span
        class="icon-furniture icon-table ${className}"
        style=${{ width: size, height: size, ...style }}
        aria-hidden="true"
        title="Стол"
      ></span>
    `;
  }

  function FurnitureIcon({ type, size = '1.15em', className = '', style = {} }) {
    if (type === 'chair') {
      return html`<${ChairIcon} size=${size} className=${className} style=${style} />`;
    }
    if (type === 'table') {
      return html`<${TableIcon} size=${size} className=${className} style=${style} />`;
    }
    return html`<i class="bi bi-box-seam ${className}" style=${style}></i>`;
  }

  function getItemTypeInfo(item, matchedProduct) {
    const name = item?.name || matchedProduct?.name || '';
    const category = matchedProduct?.category || '';
    if (isChairItem(name, category)) {
      return {
        type: 'chair',
        label: 'Стул',
        pillClass: 'type-pill-chair'
      };
    }
    if (isTableItem(name, category)) {
      return {
        type: 'table',
        label: 'Стол',
        pillClass: 'type-pill-table'
      };
    }
    return {
      type: 'furniture',
      label: category || 'Мебель',
      pillClass: 'bg-light text-dark border'
    };
  }

  function isAdmin(session) {
    return session?.user?.app_metadata?.role === 'admin';
  }

  function withTimeout(promise, timeoutMs, message) {
    let timer;
    return Promise.race([
      promise,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(message)), timeoutMs);
      })
    ]).finally(() => clearTimeout(timer));
  }

  function authErrorMessage(error) {
    const message = String(error?.message || error || 'Неизвестная ошибка');
    if (/email_not_confirmed|email not confirmed/i.test(message)) {
      return 'Сначала подтвердите адрес почты по ссылке из письма-приглашения.';
    }
    if (/invalid login credentials|invalid_credentials/i.test(message)) {
      return 'Почта или пароль не совпадают. Проверьте данные и раскладку клавиатуры.';
    }
    return `Не удалось войти: ${message}`;
  }

  async function supportsColumns(columns) {
    try {
      const { error } = await db.from('products').select(columns.join(',')).limit(0);
      return !error;
    } catch {
      return false;
    }
  }

  async function supportsOptionalProductColumns() {
    return supportsColumns(optionalProductColumns);
  }

  async function supportsExtendedProductColumns() {
    return supportsColumns(extendedProductColumns);
  }

  // --------------------------------------------------------------------------
  // Sub-Component: Toast Notification
  // --------------------------------------------------------------------------
  function ToastNotification({ toast, onDismiss }) {
    if (!toast) return null;
    return html`
      <div class="custom-toast" role="alert">
        <i class="bi ${toast.type === 'error' ? 'bi-exclamation-triangle-fill text-danger' : 'bi-check-circle-fill text-success'} fs-5"></i>
        <span>${toast.message}</span>
        <button
          type="button"
          class="btn-close btn-close-white ms-2"
          aria-label="Закрыть"
          onClick=${onDismiss}
        ></button>
      </div>
    `;
  }

  // --------------------------------------------------------------------------
  // Sub-Component: Login View
  // --------------------------------------------------------------------------
  function LoginView({ onLogin, error, loading }) {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);

    const handleSubmit = (e) => {
      e.preventDefault();
      onLogin(email, password);
    };

    return html`
      <div class="container d-flex align-items-center justify-content-center min-vh-100 py-5">
        <div class="card border-0 shadow-lg" style=${{ maxWidth: '440px', width: '100%', borderRadius: '20px' }}>
          <div class="card-body p-4 p-md-5">
            <div class="text-center mb-4">
              <a href="index.html" class="logo-brand d-inline-block mb-2 fs-3">
                NURROOM<span>.</span>
              </a>
              <div class="badge bg-dark-subtle text-dark text-uppercase tracking-wider px-3 py-2 rounded-pill font-mono" style=${{ fontSize: '0.72rem' }}>
                Панель управления
              </div>
              <h2 class="h4 mt-3 mb-1 fw-bold">Вход для администратора</h2>
              <p class="text-muted small mb-0">Управление заказами и каталогом столов и стульев</p>
            </div>

            ${error && html`
              <div class="alert alert-danger d-flex align-items-center small py-2 px-3 mb-4 rounded-3" role="alert">
                <i class="bi bi-shield-exclamation me-2 fs-5"></i>
                <div>${error}</div>
              </div>
            `}

            <form onSubmit=${handleSubmit}>
              <div class="mb-3">
                <label class="form-label small fw-semibold text-muted mb-1">Email администратора</label>
                <div class="input-group">
                  <span class="input-group-text bg-light border-end-0 text-muted"><i class="bi bi-envelope"></i></span>
                  <input
                    type="email"
                    class="form-control border-start-0 ps-0"
                    placeholder="admin@nurroom.kz"
                    value=${email}
                    onInput=${(e) => setEmail(e.target.value)}
                    required
                    autocomplete="username"
                  />
                </div>
              </div>

              <div class="mb-4">
                <label class="form-label small fw-semibold text-muted mb-1">Пароль</label>
                <div class="input-group">
                  <span class="input-group-text bg-light border-end-0 text-muted"><i class="bi bi-key"></i></span>
                  <input
                    type=${showPassword ? 'text' : 'password'}
                    class="form-control border-start-0 border-end-0 ps-0"
                    placeholder="••••••••"
                    value=${password}
                    onInput=${(e) => setPassword(e.target.value)}
                    required
                    autocomplete="current-password"
                  />
                  <button
                    type="button"
                    class="btn btn-outline-secondary border-start-0 bg-light"
                    onClick=${() => setShowPassword(!showPassword)}
                    tabIndex="-1"
                  >
                    <i class="bi ${showPassword ? 'bi-eye-slash' : 'bi-eye'}"></i>
                  </button>
                </div>
              </div>

              <button
                type="submit"
                class="btn btn-dark w-100 py-2 fw-semibold rounded-pill shadow-sm"
                disabled=${loading}
              >
                ${loading ? html`
                  <span class="spinner-border spinner-border-sm me-2" role="status"></span>
                  Проверка входа...
                ` : 'Войти в панель →'}
              </button>
            </form>

            <div class="text-center mt-4 pt-3 border-top">
              <a href="index.html" class="text-decoration-none small text-muted">
                <i class="bi bi-arrow-left me-1"></i> Вернуться на витрину магазина
              </a>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  // --------------------------------------------------------------------------
  // Sub-Component: Header / Navbar
  // --------------------------------------------------------------------------
  function AdminNavbar({ activeTab, setActiveTab, ordersCount, newOrdersCount, userEmail, onLogout, onRefresh, isRefreshing }) {
    return html`
      <nav class="admin-navbar sticky-top py-2 px-3 px-lg-4 mb-4">
        <div class="container-fluid d-flex flex-wrap align-items-center justify-content-between gap-3">
          <div class="d-flex align-items-center gap-3">
            <a href="index.html" class="logo-brand">
              NURROOM<span>.</span>
            </a>
            <span class="d-none d-sm-inline-block text-muted opacity-50">|</span>
            <span class="badge bg-secondary-subtle text-secondary-emphasis d-none d-sm-inline-block font-mono" style=${{ fontSize: '0.75rem' }}>
              ADMIN
            </span>
          </div>

          <div class="d-flex align-items-center gap-1 bg-light p-1 rounded-pill border">
            <button
              type="button"
              class="btn btn-sm nav-pill-custom ${activeTab === 'orders' ? 'active' : ''}"
              onClick=${() => setActiveTab('orders')}
            >
              <i class="bi bi-inboxes me-1.5"></i>
              Заказы
              ${newOrdersCount > 0 && html`
                <span class="badge bg-warning text-dark ms-1.5 rounded-pill" style=${{ fontSize: '0.72rem' }}>
                  +${newOrdersCount}
                </span>
              `}
            </button>

            <button
              type="button"
              class="btn btn-sm nav-pill-custom ${activeTab === 'catalog' ? 'active' : ''}"
              onClick=${() => setActiveTab('catalog')}
            >
              <i class="bi bi-collection me-1.5"></i>
              Каталог
            </button>

            <button
              type="button"
              class="btn btn-sm nav-pill-custom ${activeTab === 'summary' ? 'active' : ''}"
              onClick=${() => setActiveTab('summary')}
            >
              <i class="bi bi-bar-chart-line me-1.5"></i>
              Сводка
            </button>
          </div>

          <div class="d-flex align-items-center gap-2">
            <button
              type="button"
              class="btn btn-sm btn-outline-secondary rounded-pill px-3"
              onClick=${onRefresh}
              title="Обновить данные"
              disabled=${isRefreshing}
            >
              <i class="bi bi-arrow-clockwise ${isRefreshing ? 'd-inline-block spin-anim' : ''} me-1"></i>
              <span class="d-none d-md-inline">Обновить</span>
            </button>

            <a
              href="index.html"
              target="_blank"
              class="btn btn-sm btn-outline-secondary rounded-pill px-3 d-none d-md-inline-flex align-items-center gap-1.5"
              title="Открыть магазин в новой вкладке"
            >
              <i class="bi bi-arrow-up-right"></i>
              <span>В магазин ↗</span>
            </a>

            <div class="dropdown">
              <button
                class="btn btn-sm btn-light border rounded-pill px-3 dropdown-toggle d-flex align-items-center gap-2"
                type="button"
                data-bs-toggle="dropdown"
                aria-expanded="false"
              >
                <i class="bi bi-shield-check text-muted"></i>
                <span class="d-none d-lg-inline small text-truncate" style=${{ maxWidth: '140px' }}>
                  ${userEmail || 'Администратор'}
                </span>
              </button>
              <ul class="dropdown-menu dropdown-menu-end shadow-sm border-0 rounded-3 mt-1">
                <li><h6 class="dropdown-header small">Авторизован как:</h6></li>
                <li><div class="dropdown-item-text small fw-bold text-truncate">${userEmail}</div></li>
                <li><hr class="dropdown-divider" /></li>
                <li>
                  <a class="dropdown-item small" href="index.html" target="_blank">
                    <i class="bi bi-box-arrow-up-right me-2 text-muted"></i>Перейти в магазин
                  </a>
                </li>
                <li>
                  <button class="dropdown-item small text-danger" type="button" onClick=${onLogout}>
                    <i class="bi bi-box-arrow-right me-2"></i>Выйти из аккаунта
                  </button>
                </li>
              </ul>
            </div>
          </div>
        </div>
      </nav>
    `;
  }

  // --------------------------------------------------------------------------
  // Sub-Component: KPI Metrics Banner
  // --------------------------------------------------------------------------
  function KpiBanner({ orders, products, onStatusFilterClick }) {
    const stats = useMemo(() => {
      let newOrders = 0;
      let activeOrders = 0;
      let completedOrders = 0;
      let totalRevenue = 0;
      let totalChairs = 0;
      let totalTables = 0;

      orders.forEach((order) => {
        if (order.status === 'Новый') newOrders++;
        else if (order.status === 'Подтверждён' || order.status === 'В доставке') activeOrders++;
        else if (order.status === 'Выполнен') completedOrders++;

        if (order.status !== 'Отменён') {
          totalRevenue += Number(order.total) || 0;
        }

        const items = Array.isArray(order.items) ? order.items : [];
        items.forEach((item) => {
          const qty = Number(item.qty) || 1;
          const matchedProd = products.find((p) => String(p.id) === String(item.id));
          const name = item.name || matchedProd?.name || '';
          const cat = matchedProd?.category || '';

          if (isChairItem(name, cat)) totalChairs += qty;
          else if (isTableItem(name, cat)) totalTables += qty;
          else totalChairs += qty; // fallback
        });
      });

      return {
        newOrders,
        activeOrders,
        completedOrders,
        totalRevenue,
        totalChairs,
        totalTables,
        totalOrders: orders.length
      };
    }, [orders, products]);

    return html`
      <div class="row g-3 mb-4">
        <div class="col-6 col-lg-3">
          <div
            class="kpi-card cursor-pointer h-100"
            onClick=${() => onStatusFilterClick('Новый')}
            role="button"
            title="Показать новые заказы"
          >
            <div class="d-flex align-items-center justify-content-between mb-2">
              <span class="kpi-label">Новые заказы</span>
              <div class="kpi-icon-wrap bg-warning-subtle text-warning">
                <i class="bi bi-inbox"></i>
              </div>
            </div>
            <div class="d-flex align-items-baseline gap-2">
              <span class="kpi-value">${stats.newOrders}</span>
              ${stats.newOrders > 0 && html`
                <span class="pulse-badge small text-warning fw-semibold">
                  <span class="pulse-dot"></span> требуются действия
                </span>
              `}
            </div>
          </div>
        </div>

        <div class="col-6 col-lg-3">
          <div
            class="kpi-card cursor-pointer h-100"
            onClick=${() => onStatusFilterClick('Подтверждён')}
            role="button"
            title="Показать заказы в работе"
          >
            <div class="d-flex align-items-center justify-content-between mb-2">
              <span class="kpi-label">В обработке</span>
              <div class="kpi-icon-wrap bg-info-subtle text-info">
                <i class="bi bi-clock-history"></i>
              </div>
            </div>
            <div class="d-flex align-items-baseline gap-2">
              <span class="kpi-value">${stats.activeOrders}</span>
              <span class="text-muted small">заказов</span>
            </div>
          </div>
        </div>

        <div class="col-6 col-lg-3">
          <div class="kpi-card h-100">
            <div class="d-flex align-items-center justify-content-between mb-2">
              <span class="kpi-label">Выручка</span>
              <div class="kpi-icon-wrap bg-success-subtle text-success">
                <i class="bi bi-credit-card-2-front"></i>
              </div>
            </div>
            <div class="kpi-value text-truncate" title=${money(stats.totalRevenue)}>
              ${money(stats.totalRevenue)}
            </div>
            <div class="text-muted small">без отменённых</div>
          </div>
        </div>

        <div class="col-6 col-lg-3">
          <div class="kpi-card h-100">
            <div class="d-flex align-items-center justify-content-between mb-2">
              <span class="kpi-label">Столы и стулья</span>
              <div class="kpi-icon-wrap bg-dark-subtle text-dark">
                <i class="bi bi-layers"></i>
              </div>
            </div>
            <div class="d-flex align-items-center gap-3">
              <div class="d-flex align-items-center">
                <${ChairIcon} size="1.35em" className="text-dark me-1.5" />
                <div>
                  <span class="fw-bold fs-5 text-dark">${stats.totalChairs}</span>
                  <span class="text-muted small ms-1">стульев</span>
                </div>
              </div>
              <div class="border-start ps-3 d-flex align-items-center">
                <${TableIcon} size="1.35em" className="text-dark me-1.5" />
                <div>
                  <span class="fw-bold fs-5 text-dark">${stats.totalTables}</span>
                  <span class="text-muted small ms-1">столов</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  // --------------------------------------------------------------------------
  // Sub-Component: Order Visual Card (Key Feature)
  // --------------------------------------------------------------------------
  function OrderCard({ order, products, onStatusChange, onNotify }) {
    const statusCfg = STATUS_CONFIG[order.status] || STATUS_CONFIG['Новый'];
    const items = Array.isArray(order.items) ? order.items : [];
    const customer = order.customer || {};
    const orderNumber = order.order_number || order.number || 'БЕЗ НОМЕРА';

    // Copy order number to clipboard
    const [copied, setCopied] = useState(false);
    const copyOrderNumber = () => {
      navigator.clipboard?.writeText(orderNumber);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      onNotify('Номер заказа скопирован в буфер обмена');
    };

    // Prepare WhatsApp Message
    const rawPhone = cleanPhone(customer.phone);
    const whatsappLink = useMemo(() => {
      if (rawPhone.length < 10) return null;
      const itemListText = items
        .map((item, i) => `${i + 1}. ${item.name} — ${item.qty} шт. (${money(item.price * item.qty)})`)
        .join('\n');
      const text = [
        `Здравствуйте, ${customer.name || 'клиент'}! 👋`,
        `Интернет-магазин мебели NURROOM. Согласование заказа № *${orderNumber}*:`,
        '',
        '📦 *Товары в заказе:*',
        itemListText,
        '',
        `💰 *Сумма к оплате:* ${money(order.total)}`,
        `📍 *Адрес доставки:* ${customer.address || 'уточняется'}`,
        '',
        'Подскажите, всё ли верно? Готовы подтвердить и передать в доставку!'
      ].join('\n');
      return `https://wa.me/${rawPhone}?text=${encodeURIComponent(text)}`;
    }, [customer, items, orderNumber, order.total, rawPhone]);

    return html`
      <article class="order-card ${statusCfg.borderClass} p-3 p-md-4 mb-3">
        <!-- Top bar: ID, Date, Status Badge & Quick Progression -->
        <div class="d-flex flex-wrap align-items-center justify-content-between gap-3 pb-3 border-bottom mb-3">
          <div class="d-flex flex-wrap align-items-center gap-2">
            <span class="font-mono fw-bold fs-5 text-dark">
              ${orderNumber}
            </span>
            <button
              type="button"
              class="btn btn-sm btn-light border py-0 px-2 rounded-2 text-muted"
              title="Скопировать номер заказа"
              onClick=${copyOrderNumber}
            >
              <i class="bi ${copied ? 'bi-check2 text-success' : 'bi-copy'}"></i>
              <span class="small ms-1">${copied ? 'Скопировано' : 'Копия'}</span>
            </button>
            <span class="badge bg-light text-muted border font-mono small">
              <i class="bi bi-clock me-1"></i>${formatDate(order.created_at)}
            </span>
          </div>

          <div class="d-flex align-items-center gap-2">
            <!-- Status Badge -->
            <span class="badge ${statusCfg.badgeClass} rounded-pill px-3 py-2 fs-6 fw-semibold">
              <i class="bi ${statusCfg.icon} me-1.5"></i>${order.status}
            </span>

            <!-- Next Status Quick Action Button -->
            ${statusCfg.next && html`
              <button
                type="button"
                class="btn btn-sm ${statusCfg.nextBtnClass} rounded-pill px-3 py-1.5 fw-semibold d-inline-flex align-items-center gap-1 shadow-sm"
                onClick=${() => onStatusChange(order.id, statusCfg.next)}
                title=${`Быстрый перевод в статус «${statusCfg.next}»`}
              >
                <i class="bi ${statusCfg.nextIcon}"></i>
                <span class="d-none d-sm-inline">${statusCfg.nextLabel}</span>
              </button>
            `}

            <!-- Status Selector Dropdown -->
            <div class="dropdown">
              <button
                class="btn btn-sm btn-light border rounded-pill px-2.5 py-1.5"
                type="button"
                data-bs-toggle="dropdown"
                aria-expanded="false"
                title="Сменить статус вручную"
              >
                <i class="bi bi-three-dots-vertical"></i>
              </button>
              <ul class="dropdown-menu dropdown-menu-end shadow-sm border-0 rounded-3">
                <li><h6 class="dropdown-header small">Установить статус:</h6></li>
                ${STATUSES.map((st) => html`
                  <li key=${st}>
                    <button
                      type="button"
                      class="dropdown-item small d-flex align-items-center justify-content-between ${st === order.status ? 'active' : ''}"
                      onClick=${() => onStatusChange(order.id, st)}
                    >
                      <span>${st}</span>
                      ${st === order.status && html`<i class="bi bi-check2 ms-2"></i>`}
                    </button>
                  </li>
                `)}
              </ul>
            </div>
          </div>
        </div>

        <!-- Middle: Visual Showcase of Chairs & Tables in this order -->
        <div class="mb-3">
          <div class="small fw-semibold text-muted text-uppercase tracking-wider mb-2">
            Состав заказа (${items.reduce((s, it) => s + (Number(it.qty) || 1), 0)} шт.):
          </div>

          <div class="row g-2">
            ${items.map((item, idx) => {
              const matchedProd = products.find((p) => String(p.id) === String(item.id)) || {};
              const typeInfo = getItemTypeInfo(item, matchedProd);
              const photoUrl = safeImageURL(matchedProd.image) || safeImageURL(item.image);
              const color = matchedProd.color;
              const material = matchedProd.material;
              const dimensions = matchedProd.dimensions;

              return html`
                <div class="col-12 col-md-6 col-xl-4" key=${item.id || idx}>
                  <div class="order-item-box h-100">
                    <!-- Photo Thumbnail with Quantity Badge Overlay -->
                    <div class="order-thumb-container">
                      ${photoUrl ? html`
                        <img
                          src=${photoUrl}
                          alt=${item.name}
                          class="order-item-thumb"
                          loading="lazy"
                        />
                      ` : html`
                        <div class="order-item-thumb d-flex align-items-center justify-content-center text-secondary bg-light">
                          ${typeInfo.type === 'chair' ? html`<${ChairIcon} size="34px" />` : typeInfo.type === 'table' ? html`<${TableIcon} size="34px" />` : html`<i class="bi bi-box-seam fs-3"></i>`}
                        </div>
                      `}
                      <span class="order-item-qty-badge" title="Количество штук">
                        × ${item.qty}
                      </span>
                    </div>

                    <!-- Item Metadata & Specs -->
                    <div class="order-item-details">
                      <div class="d-flex flex-wrap align-items-center gap-1.5 mb-1">
                        <span class="type-pill ${typeInfo.pillClass}">
                          <${FurnitureIcon} type=${typeInfo.type} size="1.05em" /> ${typeInfo.label}
                        </span>
                        ${matchedProd.badge && html`
                          <span class="order-item-badge badge bg-light text-muted border px-1.5 py-0.5" style=${{ fontSize: '0.65rem' }}>
                            ${matchedProd.badge}
                          </span>
                        `}
                      </div>

                      <div class="order-item-name fw-bold text-dark small" title=${item.name}>
                        ${item.name}
                      </div>

                      <!-- Specs chips (color, material, size) -->
                      <div class="order-item-specs d-flex flex-wrap gap-1 my-1">
                        ${color && html`
                          <span class="spec-chip" title="Цвет / Отделка">
                            <span class="text-muted small me-1">Цвет:</span>${color}
                          </span>
                        `}
                        ${material && html`
                          <span class="spec-chip" title="Материал">
                            <span class="text-muted small me-1">Мат:</span>${material}
                          </span>
                        `}
                        ${dimensions && html`
                          <span class="spec-chip" title="Габариты">
                            <span class="text-muted small me-1">Разм:</span>${dimensions}
                          </span>
                        `}
                      </div>

                      <div class="small text-muted font-mono">
                        ${money(item.price)} × ${item.qty} = <strong class="text-dark">${money(item.price * item.qty)}</strong>
                      </div>
                    </div>
                  </div>
                </div>
              `;
            })}
          </div>
        </div>

        <!-- Customer Comment Warning Banner (if provided) -->
        ${customer.comment && html`
          <div class="alert alert-warning py-2 px-3 rounded-3 small mb-3 border-warning-subtle d-flex align-items-start gap-2">
            <i class="bi bi-chat-left-text fs-5 text-warning flex-shrink-0 mt-0.5"></i>
            <div>
              <strong class="text-dark">Комментарий клиента:</strong>
              <span class="text-secondary ms-1">«${customer.comment}»</span>
            </div>
          </div>
        `}

        <!-- Bottom bar: Customer Info, Total Amount, WhatsApp Action -->
        <div class="d-flex flex-wrap align-items-center justify-content-between gap-3 pt-3 border-top bg-light-subtle rounded-bottom p-2 mt-2">
          <!-- Customer Details -->
          <div class="d-flex flex-wrap align-items-center gap-3 text-secondary small">
            <div>
              <i class="bi bi-person text-muted me-1"></i>
              <strong class="text-dark">${customer.name || 'Имя не указано'}</strong>
            </div>

            ${customer.phone && html`
              <div class="d-flex align-items-center gap-1.5">
                <i class="bi bi-telephone text-muted"></i>
                <a href=${`tel:${customer.phone}`} class="text-decoration-none text-dark fw-semibold font-mono">
                  ${customer.phone}
                </a>
                ${whatsappLink && html`
                  <a
                    href=${whatsappLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    class="btn btn-sm btn-whatsapp rounded-pill px-2.5 py-0.5 small d-inline-flex align-items-center gap-1 ms-1"
                    title="Написать клиенту в WhatsApp с готовым составом заказа"
                  >
                    <i class="bi bi-whatsapp"></i>
                    <span class="d-none d-sm-inline" style=${{ fontSize: '0.75rem' }}>WhatsApp</span>
                  </a>
                `}
              </div>
            `}

            ${customer.address && html`
              <div class="text-truncate" style=${{ maxWidth: '320px' }} title=${customer.address}>
                <i class="bi bi-geo-alt text-muted me-1"></i>
                <span>${customer.address}</span>
              </div>
            `}
          </div>

          <!-- Total Price -->
          <div class="text-end ms-auto">
            <span class="small text-muted me-2">Итого к оплате:</span>
            <span class="fw-bold fs-4 text-dark font-mono">
              ${money(order.total)}
            </span>
          </div>
        </div>
      </article>
    `;
  }

  // --------------------------------------------------------------------------
  // Sub-Component: Orders Tab (List, Filters, Search)
  // --------------------------------------------------------------------------
  function OrdersTab({ orders, products, onStatusChange, onNotify, onRefresh, isRefreshing, onExportCSV, activeFilterStatus, setActiveFilterStatus }) {
    const [searchQuery, setSearchQuery] = useState('');
    const [typeFilter, setTypeFilter] = useState('all'); // all, chairs, tables
    const [sortMode, setSortMode] = useState('date_desc'); // date_desc, date_asc, total_desc, total_asc

    // Filtered & Sorted Orders
    const filteredOrders = useMemo(() => {
      const q = searchQuery.trim().toLowerCase();

      return orders
        .filter((order) => {
          // Status filter
          if (activeFilterStatus !== 'all' && order.status !== activeFilterStatus) {
            return false;
          }

          // Type filter (has chairs or has tables)
          if (typeFilter !== 'all') {
            const items = Array.isArray(order.items) ? order.items : [];
            const hasChairs = items.some((it) => {
              const mp = products.find((p) => String(p.id) === String(it.id));
              return isChairItem(it.name, mp?.category);
            });
            const hasTables = items.some((it) => {
              const mp = products.find((p) => String(p.id) === String(it.id));
              return isTableItem(it.name, mp?.category);
            });

            if (typeFilter === 'chairs' && !hasChairs) return false;
            if (typeFilter === 'tables' && !hasTables) return false;
          }

          // Search query match
          if (q) {
            const num = String(order.order_number || order.number || '').toLowerCase();
            const cName = String(order.customer?.name || '').toLowerCase();
            const cPhone = String(order.customer?.phone || '').toLowerCase();
            const cAddr = String(order.customer?.address || '').toLowerCase();
            const cComment = String(order.customer?.comment || '').toLowerCase();
            const itemNames = (order.items || []).map((it) => it.name).join(' ').toLowerCase();

            const fullText = `${num} ${cName} ${cPhone} ${cAddr} ${cComment} ${itemNames}`;
            if (!fullText.includes(q)) return false;
          }

          return true;
        })
        .sort((a, b) => {
          if (sortMode === 'date_desc') {
            return new Date(b.created_at || 0) - new Date(a.created_at || 0);
          }
          if (sortMode === 'date_asc') {
            return new Date(a.created_at || 0) - new Date(b.created_at || 0);
          }
          if (sortMode === 'total_desc') {
            return (b.total || 0) - (a.total || 0);
          }
          if (sortMode === 'total_asc') {
            return (a.total || 0) - (b.total || 0);
          }
          return 0;
        });
    }, [orders, products, activeFilterStatus, typeFilter, searchQuery, sortMode]);

    // Counts per status
    const statusCounts = useMemo(() => {
      const counts = { all: orders.length };
      STATUSES.forEach((st) => { counts[st] = 0; });
      orders.forEach((o) => {
        if (counts[o.status] !== undefined) counts[o.status]++;
      });
      return counts;
    }, [orders]);

    return html`
      <div>
        <!-- Toolbar & Filters -->
        <div class="card border-0 shadow-sm rounded-4 p-3 mb-4">
          <!-- Top Row: Search & Actions -->
          <div class="row g-2 align-items-center mb-3">
            <div class="col-12 col-md-6 col-lg-5">
              <div class="input-group">
                <span class="input-group-text bg-light border-end-0 text-muted">
                  <i class="bi bi-search"></i>
                </span>
                <input
                  type="search"
                  class="form-control border-start-0 ps-0"
                  placeholder="Поиск по номеру, имени, телефону, товару..."
                  value=${searchQuery}
                  onInput=${(e) => setSearchQuery(e.target.value)}
                />
                ${searchQuery && html`
                  <button
                    class="btn btn-outline-secondary border-start-0 bg-light"
                    type="button"
                    onClick=${() => setSearchQuery('')}
                  >
                    ×
                  </button>
                `}
              </div>
            </div>

            <div class="col-6 col-md-3 col-lg-3">
              <select
                class="form-select"
                value=${typeFilter}
                onChange=${(e) => setTypeFilter(e.target.value)}
                aria-label="Фильтр по типу мебели"
              >
                <option value="all">Вся мебель (столы и стулья)</option>
                <option value="chairs">Только стулья</option>
                <option value="tables">Только столы</option>
              </select>
            </div>

            <div class="col-6 col-md-3 col-lg-2">
              <select
                class="form-select"
                value=${sortMode}
                onChange=${(e) => setSortMode(e.target.value)}
                aria-label="Сортировка"
              >
                <option value="date_desc">Сначала новые</option>
                <option value="date_asc">Сначала старые</option>
                <option value="total_desc">Сумма: по убыванию</option>
                <option value="total_asc">Сумма: по возрастанию</option>
              </select>
            </div>

            <div class="col-12 col-lg-2 d-flex justify-content-end gap-2">
              <button
                type="button"
                class="btn btn-outline-secondary w-100 rounded-pill small"
                onClick=${onExportCSV}
                title="Скачать все заказы в формате CSV"
              >
                <i class="bi bi-file-earmark-arrow-down me-1"></i> CSV
              </button>
            </div>
          </div>

          <!-- Bottom Row: Status Filter Pills -->
          <div class="d-flex flex-wrap gap-1.5 align-items-center">
            <span class="small text-muted me-2 fw-semibold">Статус:</span>
            <button
              type="button"
              class="filter-btn-pill ${activeFilterStatus === 'all' ? 'active' : ''}"
              onClick=${() => setActiveFilterStatus('all')}
            >
              Все (${statusCounts.all || 0})
            </button>

            ${STATUSES.map((st) => {
              const count = statusCounts[st] || 0;
              const isNew = st === 'Новый' && count > 0;
              return html`
                <button
                  key=${st}
                  type="button"
                  class="filter-btn-pill ${activeFilterStatus === st ? 'active' : ''}"
                  onClick=${() => setActiveFilterStatus(st)}
                >
                  ${isNew && html`<span class="pulse-dot me-1"></span>`}
                  ${st} (${count})
                </button>
              `;
            })}
          </div>
        </div>

        <!-- Orders List -->
        <div>
          ${filteredOrders.length > 0 ? html`
            <div class="d-flex align-items-center justify-content-between mb-2 px-1">
              <div class="small text-muted">
                Найдено заказов: <strong>${filteredOrders.length}</strong>
              </div>
              <div class="small text-muted font-mono">
                Автообновление: каждые 30 сек
              </div>
            </div>

            ${filteredOrders.map((order) => html`
              <${OrderCard}
                key=${order.id}
                order=${order}
                products=${products}
                onStatusChange=${onStatusChange}
                onNotify=${onNotify}
              />
            `)}
          ` : html`
            <div class="card border-0 shadow-sm rounded-4 p-5 text-center my-4">
              <div class="mb-3 text-muted">
                <i class="bi bi-inbox fs-1"></i>
              </div>
              <h5 class="fw-bold mb-1">Заказы не найдены</h5>
              <p class="text-muted small mb-3">
                ${searchQuery || activeFilterStatus !== 'all' || typeFilter !== 'all'
                  ? 'По выбранным фильтрам или поисковому запросу ничего нет. Попробуйте сбросить фильтры.'
                  : 'Новых заказов пока нет. Как только клиент оформит заказ, он появится здесь автоматически.'}
              </p>
              ${(searchQuery || activeFilterStatus !== 'all' || typeFilter !== 'all') && html`
                <div>
                  <button
                    type="button"
                    class="btn btn-sm btn-outline-dark rounded-pill px-4"
                    onClick=${() => {
                      setSearchQuery('');
                      setActiveFilterStatus('all');
                      setTypeFilter('all');
                    }}
                  >
                    Сбросить фильтры
                  </button>
                </div>
              `}
            </div>
          `}
        </div>
      </div>
    `;
  }

  // --------------------------------------------------------------------------
  // Sub-Component: Catalog Tab (Chairs & Tables Management)
  // --------------------------------------------------------------------------
  function CatalogTab({ products, onAddProduct, onEditProduct, onDeleteProduct }) {
    const [searchQuery, setSearchQuery] = useState('');
    const [categoryFilter, setCategoryFilter] = useState('all');
    const [availabilityFilter, setAvailabilityFilter] = useState('all');

    const filteredProducts = useMemo(() => {
      const q = searchQuery.trim().toLowerCase();
      return products.filter((prod) => {
        if (categoryFilter !== 'all' && prod.category !== categoryFilter) return false;
        if (availabilityFilter !== 'all' && (prod.availability || 'Уточнить') !== availabilityFilter) return false;

        if (q) {
          const name = String(prod.name || '').toLowerCase();
          const mat = String(prod.material || '').toLowerCase();
          const col = String(prod.color || '').toLowerCase();
          const dim = String(prod.dimensions || '').toLowerCase();
          const cat = String(prod.category || '').toLowerCase();
          if (!`${name} ${mat} ${col} ${dim} ${cat}`.includes(q)) return false;
        }
        return true;
      });
    }, [products, categoryFilter, availabilityFilter, searchQuery]);

    const categories = useMemo(() => {
      return [...new Set(products.map((p) => p.category).filter(Boolean))];
    }, [products]);

    return html`
      <div>
        <!-- Catalog Header & Toolbar -->
        <div class="card border-0 shadow-sm rounded-4 p-3 mb-4">
          <div class="d-flex flex-wrap align-items-center justify-content-between gap-3 mb-3">
            <div>
              <h4 class="fw-bold mb-0">Каталог: Столы и стулья</h4>
              <p class="text-muted small mb-0">
                Всего позиций: ${products.length} (изменения сразу отображаются на сайте)
              </p>
            </div>
            <button
              type="button"
              class="btn btn-dark rounded-pill px-4 fw-semibold shadow-sm d-inline-flex align-items-center gap-1.5"
              onClick=${onAddProduct}
            >
              <i class="bi bi-plus-lg"></i>
              <span>Добавить товар</span>
            </button>
          </div>

          <!-- Filters Row -->
          <div class="row g-2 align-items-center">
            <div class="col-12 col-md-5">
              <div class="input-group">
                <span class="input-group-text bg-light border-end-0 text-muted"><i class="bi bi-search"></i></span>
                <input
                  type="search"
                  class="form-control border-start-0 ps-0"
                  placeholder="Поиск по названию, материалу, цвету..."
                  value=${searchQuery}
                  onInput=${(e) => setSearchQuery(e.target.value)}
                />
              </div>
            </div>

            <div class="col-6 col-md-4">
              <select
                class="form-select"
                value=${categoryFilter}
                onChange=${(e) => setCategoryFilter(e.target.value)}
              >
                <option value="all">Все категории (${products.length})</option>
                ${categories.map((c) => html`
                  <option key=${c} value=${c}>${c}</option>
                `)}
              </select>
            </div>

            <div class="col-6 col-md-3">
              <select
                class="form-select"
                value=${availabilityFilter}
                onChange=${(e) => setAvailabilityFilter(e.target.value)}
              >
                <option value="all">Любое наличие</option>
                <option value="В наличии">В наличии</option>
                <option value="Под заказ">Под заказ</option>
                <option value="Уточнить">Уточнить</option>
                <option value="Нет в наличии">Нет в наличии</option>
              </select>
            </div>
          </div>
        </div>

        <!-- Products Grid -->
        <div class="row g-3">
          ${filteredProducts.length > 0 ? filteredProducts.map((prod) => {
            const photoUrl = safeImageURL(prod.image);
            const isChair = isChairItem(prod.name, prod.category);
            const isTable = isTableItem(prod.name, prod.category);

            return html`
              <div class="col-12 col-sm-6 col-lg-4 col-xl-3" key=${prod.id}>
                <div class="product-admin-card">
                  <!-- Photo Thumbnail -->
                  <div class="product-admin-thumb-wrap">
                    ${photoUrl ? html`
                      <img src=${photoUrl} alt=${prod.name} loading="lazy" />
                    ` : html`
                      <div class="d-flex align-items-center justify-content-center h-100 text-secondary bg-light">
                        ${isChair ? html`<${ChairIcon} size="46px" />` : isTable ? html`<${TableIcon} size="46px" />` : html`<i class="bi bi-image fs-1 text-muted"></i>`}
                      </div>
                    `}
                    ${prod.badge && html`
                      <span class="badge bg-dark position-absolute top-0 start-0 m-2 px-2 py-1" style=${{ fontSize: '0.7rem' }}>
                        ${prod.badge}
                      </span>
                    `}
                  </div>

                  <!-- Details -->
                  <div class="p-3 d-flex flex-column flex-grow-1">
                    <div class="d-flex align-items-center justify-content-between gap-1 mb-1">
                      <span class="badge ${isChair ? 'type-pill-chair' : isTable ? 'type-pill-table' : 'bg-light text-dark'} small">
                        <${FurnitureIcon} type=${isChair ? 'chair' : isTable ? 'table' : 'furniture'} size="0.95em" className="me-1" />
                        ${prod.category || (isChair ? 'Стулья' : isTable ? 'Столы' : 'Мебель')}
                      </span>
                      <span class="small text-muted font-mono">
                        ID: ${prod.id}
                      </span>
                    </div>

                    <h5 class="fw-bold mb-1 text-truncate" title=${prod.name}>
                      ${prod.name}
                    </h5>

                    <!-- Specs -->
                    <div class="small text-muted mb-2">
                      ${[prod.material, prod.color, prod.dimensions].filter(Boolean).join(' · ') || 'Характеристики уточняются'}
                    </div>

                    <div class="mt-auto pt-2 border-top d-flex align-items-center justify-content-between">
                      <div>
                        <div class="fw-bold fs-5 font-mono text-dark">
                          ${money(prod.price)}
                        </div>
                        ${prod.old_price ? html`
                          <div class="text-muted small text-decoration-line-through font-mono">
                            ${money(prod.old_price)}
                          </div>
                        ` : null}
                      </div>

                      <div class="d-flex gap-1">
                        <button
                          type="button"
                          class="btn btn-sm btn-outline-secondary rounded-pill px-2.5"
                          title="Редактировать товар"
                          onClick=${() => onEditProduct(prod)}
                        >
                          <i class="bi bi-pencil-square"></i>
                        </button>
                        <button
                          type="button"
                          class="btn btn-sm btn-outline-danger rounded-pill px-2.5"
                          title="Удалить товар"
                          onClick=${() => onDeleteProduct(prod.id, prod.name)}
                        >
                          <i class="bi bi-trash3"></i>
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            `;
          }) : html`
            <div class="col-12">
              <div class="card border-0 shadow-sm rounded-4 p-5 text-center my-3">
                <i class="bi bi-search fs-1 text-muted mb-2"></i>
                <h5 class="fw-bold">Товары не найдены</h5>
                <p class="text-muted small mb-0">Попробуйте изменить параметры поиска или фильтрации.</p>
              </div>
            </div>
          `}
        </div>
      </div>
    `;
  }

  // --------------------------------------------------------------------------
  // Sub-Component: Summary & Analytics Tab
  // --------------------------------------------------------------------------
  function SummaryTab({ orders, products }) {
    const stats = useMemo(() => {
      let revenue = 0;
      let completedRevenue = 0;
      let chairCount = 0;
      let tableCount = 0;
      const statusMap = {};
      STATUSES.forEach((st) => { statusMap[st] = 0; });

      orders.forEach((o) => {
        statusMap[o.status] = (statusMap[o.status] || 0) + 1;
        if (o.status !== 'Отменён') revenue += Number(o.total) || 0;
        if (o.status === 'Выполнен') completedRevenue += Number(o.total) || 0;

        (o.items || []).forEach((it) => {
          const qty = Number(it.qty) || 1;
          const mp = products.find((p) => String(p.id) === String(it.id));
          if (isChairItem(it.name, mp?.category)) chairCount += qty;
          else if (isTableItem(it.name, mp?.category)) tableCount += qty;
          else chairCount += qty;
        });
      });

      const avgOrder = orders.length > 0 ? Math.round(revenue / orders.length) : 0;
      const totalFurniture = chairCount + tableCount;
      const chairPercent = totalFurniture > 0 ? Math.round((chairCount / totalFurniture) * 100) : 50;

      return {
        revenue,
        completedRevenue,
        chairCount,
        tableCount,
        avgOrder,
        totalFurniture,
        chairPercent,
        statusMap
      };
    }, [orders, products]);

    return html`
      <div class="row g-4">
        <!-- Sales Split: Chairs vs Tables -->
        <div class="col-12 col-lg-6">
          <div class="card border-0 shadow-sm rounded-4 p-4 h-100">
            <h5 class="fw-bold mb-3 d-flex align-items-center gap-2">
              <i class="bi bi-pie-chart text-primary"></i>
              Распределение продаж: Столы и Стулья
            </h5>

            <div class="mb-4">
              <div class="d-flex justify-content-between small text-muted mb-1">
                <span class="d-flex align-items-center"><${ChairIcon} size="1.25em" className="me-1.5 text-warning" /> Стулья: <strong>${stats.chairCount} шт.</strong> (${stats.chairPercent}%)</span>
                <span class="d-flex align-items-center"><${TableIcon} size="1.25em" className="me-1.5 text-primary" /> Столы: <strong>${stats.tableCount} шт.</strong> (${100 - stats.chairPercent}%)</span>
              </div>
              <div class="progress" style=${{ height: '14px', borderRadius: '8px' }}>
                <div
                  class="progress-bar bg-warning"
                  role="progressbar"
                  style=${{ width: `${stats.chairPercent}%` }}
                  title="Стулья"
                ></div>
                <div
                  class="progress-bar bg-primary"
                  role="progressbar"
                  style=${{ width: `${100 - stats.chairPercent}%` }}
                  title="Столы"
                ></div>
              </div>
            </div>

            <div class="row g-3">
              <div class="col-6">
                <div class="p-3 bg-light rounded-3 text-center">
                  <div class="furniture-icon-frame">
                    <img src="assets/chair.png" alt="Стулья" />
                  </div>
                  <div class="fw-bold fs-4">${stats.chairCount} шт.</div>
                  <div class="small text-muted">Стульев заказано</div>
                </div>
              </div>
              <div class="col-6">
                <div class="p-3 bg-light rounded-3 text-center">
                  <div class="furniture-icon-frame">
                    <img src="assets/table.png" alt="Столы" />
                  </div>
                  <div class="fw-bold fs-4">${stats.tableCount} шт.</div>
                  <div class="small text-muted">Столов заказано</div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Orders by Status Breakdown -->
        <div class="col-12 col-lg-6">
          <div class="card border-0 shadow-sm rounded-4 p-4 h-100">
            <h5 class="fw-bold mb-3 d-flex align-items-center gap-2">
              <i class="bi bi-funnel text-warning"></i>
              Воронка статусов заказов
            </h5>

            <div class="d-flex flex-column gap-2.5">
              ${STATUSES.map((st) => {
                const count = stats.statusMap[st] || 0;
                const percent = orders.length > 0 ? Math.round((count / orders.length) * 100) : 0;
                const cfg = STATUS_CONFIG[st];

                return html`
                  <div key=${st} class="p-2 border rounded-3 bg-light-subtle">
                    <div class="d-flex justify-content-between align-items-center mb-1">
                      <span class="small fw-semibold">
                        <i class="bi ${cfg.icon} text-${cfg.color} me-1"></i> ${st}
                      </span>
                      <span class="font-mono small">
                        <strong>${count}</strong> заказов (${percent}%)
                      </span>
                    </div>
                    <div class="progress" style=${{ height: '6px' }}>
                      <div
                        class="progress-bar bg-${cfg.color}"
                        role="progressbar"
                        style=${{ width: `${percent}%` }}
                      ></div>
                    </div>
                  </div>
                `;
              })}
            </div>
          </div>
        </div>

        <!-- Quick Financial Summary -->
        <div class="col-12">
          <div class="card border-0 shadow-sm rounded-4 p-4">
            <h5 class="fw-bold mb-3 d-flex align-items-center gap-2">
              <i class="bi bi-credit-card-2-front text-success"></i>
              Финансовые показатели
            </h5>

            <div class="row g-3 text-center">
              <div class="col-12 col-sm-4">
                <div class="p-3 border rounded-3">
                  <div class="text-muted small">Общая выручка</div>
                  <div class="fs-4 fw-bold font-mono text-dark">${money(stats.revenue)}</div>
                  <div class="text-muted small">активные + выполненные</div>
                </div>
              </div>

              <div class="col-12 col-sm-4">
                <div class="p-3 border rounded-3">
                  <div class="text-muted small">Успешно доставлено</div>
                  <div class="fs-4 fw-bold font-mono text-success">${money(stats.completedRevenue)}</div>
                  <div class="text-muted small">статус «Выполнен»</div>
                </div>
              </div>

              <div class="col-12 col-sm-4">
                <div class="p-3 border rounded-3">
                  <div class="text-muted small">Средний чек заказа</div>
                  <div class="fs-4 fw-bold font-mono text-primary">${money(stats.avgOrder)}</div>
                  <div class="text-muted small">на один заказ</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  // --------------------------------------------------------------------------
  // Sub-Component: Product Add/Edit Modal
  // --------------------------------------------------------------------------
  function ProductModal({ isOpen, product, onClose, onSave }) {
    if (!isOpen) return null;

    const [form, setForm] = useState({
      id: product?.id || '',
      name: product?.name || '',
      category: product?.category || 'Стулья',
      price: product?.price || '',
      old_price: product?.old_price || '',
      material: product?.material || '',
      color: product?.color || '',
      dimensions: product?.dimensions || '',
      availability: product?.availability || 'В наличии',
      description: product?.description || '',
      badge: product?.badge || '',
      image_url: product?.image || '',
      gallery_urls: Array.isArray(product?.gallery) ? product.gallery.join('\n') : '',
      length_cm: product?.length_cm ?? '',
      width_cm: product?.width_cm ?? '',
      height_cm: product?.height_cm ?? '',
      seat_height_cm: product?.seat_height_cm ?? '',
      seats: product?.seats ?? '',
      shape: product?.shape || '',
      extendable: Boolean(product?.extendable),
      warranty_months: product?.warranty_months ?? '',
      delivery_time: product?.delivery_time || ''
    });

    const [photoFile, setPhotoFile] = useState(null);
    const [previewUrl, setPreviewUrl] = useState(product?.image || '');
    const [submitting, setSubmitting] = useState(false);
    const [errorMsg, setErrorMsg] = useState('');

    const handleFileChange = (e) => {
      const file = e.target.files[0];
      if (!file) return;
      if (!imageExtensions.has(file.type)) {
        setErrorMsg('Загрузите фото в формате JPG, PNG или WebP.');
        return;
      }
      if (file.size > maxImageBytes) {
        setErrorMsg('Размер фото не должен превышать 5 МБ.');
        return;
      }
      setPhotoFile(file);
      setPreviewUrl(URL.createObjectURL(file));
      setErrorMsg('');
    };

    const handleImageUrlChange = (e) => {
      const url = e.target.value.trim();
      setForm({ ...form, image_url: url });
      if (!photoFile) {
        setPreviewUrl(safeImageURL(url) || '');
      }
    };

    const handleSubmit = async (e) => {
      e.preventDefault();
      setSubmitting(true);
      setErrorMsg('');
      try {
        await onSave({
          ...form,
          photoFile
        });
        onClose();
      } catch (err) {
        setErrorMsg(err.message || String(err));
      } finally {
        setSubmitting(false);
      }
    };

    return html`
      <div class="modal fade show d-block" tabindex="-1" style=${{ background: 'rgba(0,0,0,0.55)', zIndex: 1055 }} role="dialog">
        <div class="modal-dialog modal-dialog-centered modal-lg">
          <div class="modal-content">
            <div class="modal-header">
              <h5 class="modal-title fw-bold">
                ${product ? `Редактирование: ${product.name}` : 'Добавить товар в каталог'}
              </h5>
              <button type="button" class="btn-close" aria-label="Закрыть" onClick=${onClose} disabled=${submitting}></button>
            </div>

            <form onSubmit=${handleSubmit}>
              <div class="modal-body p-4">
                ${errorMsg && html`
                  <div class="alert alert-danger py-2 small mb-3">${errorMsg}</div>
                `}

                <div class="row g-3">
                  <!-- Name -->
                  <div class="col-12 col-md-8">
                    <label class="form-label small fw-semibold">Название товара *</label>
                    <input
                      type="text"
                      class="form-control"
                      placeholder="Например, Стул NORD или Стол OAK"
                      value=${form.name}
                      onInput=${(e) => setForm({ ...form, name: e.target.value })}
                      required
                      maxlength="120"
                    />
                  </div>

                  <!-- Category -->
                  <div class="col-12 col-md-4">
                    <label class="form-label small fw-semibold">Категория *</label>
                    <select
                      class="form-select"
                      value=${form.category}
                      onChange=${(e) => setForm({ ...form, category: e.target.value })}
                      required
                    >
                      <option value="Стулья">Стулья</option>
                      <option value="Столы">Столы</option>
                    </select>
                  </div>

                  <!-- Price & Old Price -->
                  <div class="col-6 col-md-4">
                    <label class="form-label small fw-semibold">Цена, ₸ *</label>
                    <input
                      type="number"
                      class="form-control font-mono"
                      placeholder="24900"
                      min="1"
                      value=${form.price}
                      onInput=${(e) => setForm({ ...form, price: e.target.value })}
                      required
                    />
                  </div>

                  <div class="col-6 col-md-4">
                    <label class="form-label small fw-semibold">Старая цена, ₸</label>
                    <input
                      type="number"
                      class="form-control font-mono"
                      placeholder="28900"
                      min="1"
                      value=${form.old_price}
                      onInput=${(e) => setForm({ ...form, old_price: e.target.value })}
                    />
                  </div>

                  <!-- Availability -->
                  <div class="col-12 col-md-4">
                    <label class="form-label small fw-semibold">Наличие</label>
                    <select
                      class="form-select"
                      value=${form.availability}
                      onChange=${(e) => setForm({ ...form, availability: e.target.value })}
                    >
                      <option value="В наличии">В наличии</option>
                      <option value="Под заказ">Под заказ</option>
                      <option value="Уточнить">Уточнить</option>
                      <option value="Нет в наличии">Нет в наличии</option>
                    </select>
                  </div>

                  <!-- Specs: Material, Color, Dimensions -->
                  <div class="col-12 col-md-4">
                    <label class="form-label small fw-semibold">Материал</label>
                    <input
                      type="text"
                      class="form-control"
                      placeholder="Массив дуба, металл"
                      value=${form.material}
                      onInput=${(e) => setForm({ ...form, material: e.target.value })}
                    />
                  </div>

                  <div class="col-12 col-md-4">
                    <label class="form-label small fw-semibold">Цвет / Отделка</label>
                    <input
                      type="text"
                      class="form-control"
                      placeholder="Натуральный дуб / бежевый"
                      value=${form.color}
                      onInput=${(e) => setForm({ ...form, color: e.target.value })}
                    />
                  </div>

                  <div class="col-12 col-md-4">
                    <label class="form-label small fw-semibold">Размеры (текст)</label>
                    <input
                      type="text"
                      class="form-control"
                      placeholder="120 × 80 × 75 см"
                      value=${form.dimensions}
                      onInput=${(e) => setForm({ ...form, dimensions: e.target.value })}
                    />
                  </div>

                  <!-- Structured numeric dimensions & specs -->
                  <div class="col-4 col-md-3">
                    <label class="form-label small fw-semibold">Длина, см</label>
                    <input
                      type="number"
                      class="form-control font-mono"
                      placeholder="140"
                      min="20"
                      max="400"
                      value=${form.length_cm}
                      onInput=${(e) => setForm({ ...form, length_cm: e.target.value })}
                    />
                  </div>
                  <div class="col-4 col-md-3">
                    <label class="form-label small fw-semibold">Ширина, см</label>
                    <input
                      type="number"
                      class="form-control font-mono"
                      placeholder="80"
                      min="20"
                      max="300"
                      value=${form.width_cm}
                      onInput=${(e) => setForm({ ...form, width_cm: e.target.value })}
                    />
                  </div>
                  <div class="col-4 col-md-3">
                    <label class="form-label small fw-semibold">Высота, см</label>
                    <input
                      type="number"
                      class="form-control font-mono"
                      placeholder="75"
                      min="30"
                      max="150"
                      value=${form.height_cm}
                      onInput=${(e) => setForm({ ...form, height_cm: e.target.value })}
                    />
                  </div>
                  <div class="col-6 col-md-3">
                    <label class="form-label small fw-semibold">
                      ${form.category === 'Столы' ? 'Мест (персон)' : 'Высота сиденья, см'}
                    </label>
                    ${form.category === 'Столы' ? html`
                      <input
                        type="number"
                        class="form-control font-mono"
                        placeholder="6"
                        min="1"
                        max="16"
                        value=${form.seats}
                        onInput=${(e) => setForm({ ...form, seats: e.target.value })}
                      />
                    ` : html`
                      <input
                        type="number"
                        class="form-control font-mono"
                        placeholder="46"
                        min="30"
                        max="90"
                        value=${form.seat_height_cm}
                        onInput=${(e) => setForm({ ...form, seat_height_cm: e.target.value })}
                      />
                    `}
                  </div>

                  <div class="col-6 col-md-4">
                    <label class="form-label small fw-semibold">Форма</label>
                    <select
                      class="form-select"
                      value=${form.shape}
                      onChange=${(e) => setForm({ ...form, shape: e.target.value })}
                    >
                      <option value="">Не указана</option>
                      <option value="Прямоугольный">Прямоугольный</option>
                      <option value="Круглый">Круглый</option>
                      <option value="Овальный">Овальный</option>
                      <option value="Квадратный">Квадратный</option>
                    </select>
                  </div>
                  <div class="col-6 col-md-4">
                    <label class="form-label small fw-semibold">Срок поставки</label>
                    <input
                      type="text"
                      class="form-control"
                      placeholder="1–3 дня / 14 дней"
                      value=${form.delivery_time}
                      onInput=${(e) => setForm({ ...form, delivery_time: e.target.value })}
                    />
                  </div>
                  <div class="col-6 col-md-4">
                    <label class="form-label small fw-semibold">Гарантия, мес.</label>
                    <input
                      type="number"
                      class="form-control font-mono"
                      placeholder="12"
                      min="1"
                      max="120"
                      value=${form.warranty_months}
                      onInput=${(e) => setForm({ ...form, warranty_months: e.target.value })}
                    />
                  </div>

                  <!-- Badge -->
                  <div class="col-12">
                    <label class="form-label small fw-semibold">Маркетинговая метка</label>
                    <input
                      type="text"
                      class="form-control"
                      placeholder="Хит продаж, Новинка, Скидка"
                      value=${form.badge}
                      onInput=${(e) => setForm({ ...form, badge: e.target.value })}
                    />
                  </div>

                  <!-- Main Image -->
                  <div class="col-12 col-md-8">
                    <label class="form-label small fw-semibold">Ссылка на главное фото (HTTPS)</label>
                    <input
                      type="url"
                      class="form-control font-mono small mb-2"
                      placeholder="https://images.unsplash.com/photo-..."
                      value=${form.image_url}
                      onInput=${handleImageUrlChange}
                    />
                    <label class="form-label small fw-semibold text-muted">Или загрузите файл с устройства:</label>
                    <input
                      type="file"
                      class="form-control small"
                      accept="image/jpeg,image/png,image/webp"
                      onChange=${handleFileChange}
                    />
                  </div>

                  <!-- Image Preview -->
                  <div class="col-12 col-md-4 d-flex flex-column align-items-center justify-content-center">
                    <div class="border rounded-3 p-1 bg-light text-center w-100" style=${{ height: '130px' }}>
                      ${previewUrl ? html`
                        <img
                          src=${previewUrl}
                          alt="Предпросмотр"
                          style=${{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '6px' }}
                        />
                      ` : html`
                        <div class="d-flex flex-column align-items-center justify-content-center h-100 text-muted small">
                          <i class="bi bi-image fs-2"></i>
                          <span>Предпросмотр фото</span>
                        </div>
                      `}
                    </div>
                  </div>

                  <!-- Additional Gallery Photos -->
                  <div class="col-12">
                    <label class="form-label small fw-semibold">Дополнительные фото (HTTPS-ссылки, по одной на строку)</label>
                    <textarea
                      class="form-control font-mono small"
                      rows="2"
                      placeholder="https://example.com/photo-2.jpg"
                      value=${form.gallery_urls}
                      onInput=${(e) => setForm({ ...form, gallery_urls: e.target.value })}
                    ></textarea>
                  </div>

                  <!-- Description -->
                  <div class="col-12">
                    <label class="form-label small fw-semibold">Описание товара</label>
                    <textarea
                      class="form-control"
                      rows="2"
                      placeholder="Подробное описание характеристик, каркаса, обивки..."
                      value=${form.description}
                      onInput=${(e) => setForm({ ...form, description: e.target.value })}
                    ></textarea>
                  </div>
                </div>
              </div>

              <div class="modal-footer">
                <button type="button" class="btn btn-outline-secondary rounded-pill px-4" onClick=${onClose} disabled=${submitting}>
                  Отмена
                </button>
                <button type="submit" class="btn btn-dark rounded-pill px-4 fw-semibold" disabled=${submitting}>
                  ${submitting ? html`
                    <span class="spinner-border spinner-border-sm me-2"></span> Сохранение...
                  ` : 'Сохранить товар'}
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    `;
  }

  // --------------------------------------------------------------------------
  // Main Root Application
  // --------------------------------------------------------------------------
  function AdminApp() {
    const [session, setSession] = useState(null);
    const [authLoading, setAuthLoading] = useState(true);
    const [authError, setAuthError] = useState('');

    const [products, setProducts] = useState([]);
    const [orders, setOrders] = useState([]);
    const [dataErrors, setDataErrors] = useState({ products: '', orders: '' });
    const [isRefreshing, setIsRefreshing] = useState(false);

    const [activeTab, setActiveTab] = useState('orders'); // orders, catalog, summary
    const [activeFilterStatus, setActiveFilterStatus] = useState('all');

    const [toast, setToast] = useState(null);
    const [productModal, setProductModal] = useState({ isOpen: false, product: null });

    const toastTimerRef = useRef(null);

    const showToast = useCallback((message, type = 'success') => {
      clearTimeout(toastTimerRef.current);
      setToast({ message, type });
      toastTimerRef.current = setTimeout(() => setToast(null), 3500);
    }, []);

    // 1. Check Session on Boot
    const checkSession = useCallback(async () => {
      setAuthLoading(true);
      try {
        const { data, error } = await withTimeout(
          db.auth.getSession(),
          17000,
          'Проверка сессии заняла больше 17 секунд. Обновите страницу и попробуйте снова.'
        );
        if (error) throw error;
        if (data?.session) {
          if (isAdmin(data.session)) {
            setSession(data.session);
          } else {
            await db.auth.signOut();
            setAuthError('У аккаунта нет роли администратора. Обратитесь к руководству магазина.');
          }
        }
      } catch (err) {
        setAuthError(`Не удалось проверить сессию: ${err.message || err}`);
      } finally {
        setAuthLoading(false);
      }
    }, []);

    // 2. Load Products & Orders
    const loadProducts = useCallback(async () => {
      try {
        const { data, error } = await db.from('products').select('*').order('id');
        if (error) throw error;
        setProducts(data || []);
        setDataErrors((current) => ({ ...current, products: '' }));
        return true;
      } catch (err) {
        console.error('Ошибка загрузки каталога:', err);
        const message = err?.message || String(err);
        setDataErrors((current) => ({ ...current, products: message }));
        return false;
      }
    }, []);

    const loadOrders = useCallback(async (quiet = false) => {
      if (!quiet) setIsRefreshing(true);
      try {
        const { data, error } = await db.from('orders')
          .select('id,order_number,created_at,customer,items,total,status')
          .order('created_at', { ascending: false });
        if (error) throw error;
        setOrders(data || []);
        setDataErrors((current) => ({ ...current, orders: '' }));
        return true;
      } catch (err) {
        console.error('Ошибка загрузки заказов:', err);
        const message = err?.message || String(err);
        setDataErrors((current) => ({ ...current, orders: message }));
        return false;
      } finally {
        if (!quiet) setIsRefreshing(false);
      }
    }, []);

    const refreshAll = useCallback(async () => {
      setIsRefreshing(true);
      try {
        const results = await Promise.all([loadProducts(), loadOrders(true)]);
        if (results.every(Boolean)) {
          showToast('Данные успешно обновлены');
        } else {
          showToast('Не удалось загрузить все данные. Подробности показаны над панелью.', 'error');
        }
      } finally {
        setIsRefreshing(false);
      }
    }, [loadProducts, loadOrders, showToast]);

    // Initial boot & Auto-refresh (30 seconds)
    useEffect(() => {
      checkSession();
    }, [checkSession]);

    useEffect(() => {
      window.adminAppMounted = true;
    }, []);

    useEffect(() => {
      if (session) {
        refreshAll();
        const interval = setInterval(() => {
          loadOrders(true);
        }, 30000);
        return () => clearInterval(interval);
      }
    }, [session, refreshAll, loadOrders]);

    // 3. Auth Actions
    const handleLogin = async (email, password) => {
      setAuthLoading(true);
      setAuthError('');
      try {
        const { data, error } = await withTimeout(
          db.auth.signInWithPassword({
            email: email.trim(),
            password
          }),
          17000,
          'Вход занял больше 17 секунд. Проверьте соединение и попробуйте снова.'
        );
        if (error) throw error;
        if (!isAdmin(data.session)) {
          await db.auth.signOut();
          setAuthError('У этого аккаунта нет прав администратора магазина.');
          return;
        }
        setSession(data.session);
        showToast('Добро пожаловать в панель управления NURROOM!');
      } catch (err) {
        setAuthError(authErrorMessage(err));
      } finally {
        setAuthLoading(false);
      }
    };

    const handleLogout = async () => {
      try {
        await db.auth.signOut();
        setSession(null);
        showToast('Сессия завершена');
      } catch (err) {
        showToast(`Ошибка выхода: ${err.message}`, 'error');
      }
    };

    // 4. Order Status Update
    const handleOrderStatusChange = async (orderId, newStatus) => {
      try {
        // Optimistic update
        setOrders((prev) =>
          prev.map((o) => (o.id === orderId ? { ...o, status: newStatus } : o))
        );
        const { error } = await db.from('orders').update({ status: newStatus }).eq('id', orderId);
        if (error) throw error;
        showToast(`Статус заказа изменён на «${newStatus}»`);
      } catch (err) {
        showToast(`Не удалось обновить статус: ${err.message || err}`, 'error');
        loadOrders(true);
      }
    };

    // 5. CSV Export
    const handleExportCSV = () => {
      const quote = (v) => {
        let text = String(v ?? '');
        if (/^[\s\u0000-\u001f]*[=+\-@]/.test(text)) text = `'${text}`;
        return `"${text.replace(/"/g, '""')}"`;
      };
      const rows = [
        ['Номер', 'Дата', 'Имя', 'Телефон', 'Адрес', 'Комментарий', 'Состав заказа', 'Сумма', 'Статус'],
        ...orders.map((o) => [
          o.order_number || o.number,
          o.created_at,
          o.customer?.name,
          o.customer?.phone,
          o.customer?.address,
          o.customer?.comment,
          (o.items || []).map((it) => `${it.name} x${it.qty}`).join('; '),
          o.total,
          o.status
        ])
      ];
      const link = document.createElement('a');
      link.href = URL.createObjectURL(
        new Blob(['\ufeff' + rows.map((r) => r.map(quote).join(',')).join('\n')], { type: 'text/csv;charset=utf-8;' })
      );
      link.download = `nurroom-orders-${new Date().toISOString().slice(0, 10)}.csv`;
      link.click();
      URL.revokeObjectURL(link.href);
      showToast('Таблица заказов скачана (CSV)');
    };

    // 6. Product Actions
    const handleDeleteProduct = async (id, name) => {
      if (!confirm(`Удалить товар «${name}» из каталога?`)) return;
      try {
        const { error } = await db.from('products').delete().eq('id', id);
        if (error) throw error;
        showToast(`Товар «${name}» удалён`);
        loadProducts();
      } catch (err) {
        showToast(`Не удалось удалить товар: ${err.message}`, 'error');
      }
    };

    const handleSaveProduct = async (formData) => {
      const price = Number(formData.price);
      const oldPrice = formData.old_price ? Number(formData.old_price) : null;

      if (!Number.isSafeInteger(price) || price < 1) {
        throw new Error('Укажите корректную цену товара.');
      }

      const [saveOptionalFields, saveExtendedFields] = await Promise.all([
        supportsOptionalProductColumns(),
        supportsExtendedProductColumns()
      ]);
      let image = formData.image_url.trim() || (formData.id && products.find((p) => String(p.id) === String(formData.id))?.image) || '';

      // Upload file to Supabase Storage if provided
      if (formData.photoFile) {
        const file = formData.photoFile;
        const ext = imageExtensions.get(file.type);
        if (!ext) throw new Error('Загрузите фото в формате JPG, PNG или WebP.');
        if (file.size > maxImageBytes) throw new Error('Размер фото не должен превышать 5 МБ.');

        const path = `${crypto.randomUUID()}.${ext}`;
        const { error: uploadError } = await db.storage
          .from('product-images')
          .upload(path, file, { upsert: false, contentType: file.type });
        if (uploadError) throw new Error(`Не удалось загрузить фото: ${uploadError.message}`);
        image = db.storage.from('product-images').getPublicUrl(path).data.publicUrl;
      }

      image = safeImageURL(image);
      if (!image) throw new Error('Укажите безопасную HTTPS-ссылку на фото или выберите файл.');

      let gallery = [];
      if (saveOptionalFields && formData.gallery_urls) {
        gallery = formData.gallery_urls
          .split(/\r?\n/)
          .map((u) => u.trim())
          .filter(Boolean)
          .map(safeImageURL)
          .filter(Boolean);
      }

      const row = {
        name: formData.name.trim(),
        category: formData.category.trim(),
        price,
        old_price: oldPrice,
        material: formData.material.trim(),
        color: formData.color.trim(),
        description: formData.description.trim(),
        badge: formData.badge.trim(),
        image
      };

      if (saveOptionalFields) {
        Object.assign(row, {
          dimensions: formData.dimensions.trim(),
          availability: formData.availability,
          gallery
        });
      }

      if (saveExtendedFields) {
        const toIntOrNull = (val) => {
          const n = Number(val);
          return val !== '' && val !== null && val !== undefined && Number.isFinite(n) && n > 0 ? Math.round(n) : null;
        };
        Object.assign(row, {
          length_cm: toIntOrNull(formData.length_cm),
          width_cm: toIntOrNull(formData.width_cm),
          height_cm: toIntOrNull(formData.height_cm),
          seat_height_cm: toIntOrNull(formData.seat_height_cm),
          seats: toIntOrNull(formData.seats),
          shape: String(formData.shape || '').trim(),
          extendable: Boolean(formData.extendable),
          warranty_months: toIntOrNull(formData.warranty_months),
          delivery_time: String(formData.delivery_time || '').trim()
        });
      }

      const res = formData.id
        ? await db.from('products').update(row).eq('id', formData.id)
        : await db.from('products').insert(row);

      if (res.error) throw new Error(res.error.message);

      showToast(formData.id ? 'Товар успешно обновлён' : 'Товар добавлен в каталог');
      loadProducts();
    };

    // New orders count
    const newOrdersCount = useMemo(() => {
      return orders.filter((o) => o.status === 'Новый').length;
    }, [orders]);

    // Render Loading on boot
    if (authLoading && !session) {
      return html`
        <div class="d-flex align-items-center justify-content-center vh-100">
          <div class="text-center">
            <div class="spinner-border text-dark mb-3" role="status">
              <span class="visually-hidden">Загрузка...</span>
            </div>
            <div class="text-muted small">Проверка сессии администратора...</div>
          </div>
        </div>
      `;
    }

    // Render Login if not authorized
    if (!session) {
      return html`
        <div>
          <${LoginView}
            onLogin=${handleLogin}
            error=${authError}
            loading=${authLoading}
          />
          <${ToastNotification} toast=${toast} onDismiss=${() => setToast(null)} />
        </div>
      `;
    }

    // Main Dashboard View
    return html`
      <div>
        <${AdminNavbar}
          activeTab=${activeTab}
          setActiveTab=${setActiveTab}
          ordersCount=${orders.length}
          newOrdersCount=${newOrdersCount}
          userEmail=${session.user?.email}
          onLogout=${handleLogout}
          onRefresh=${refreshAll}
          isRefreshing=${isRefreshing}
        />

        <main class="container-fluid px-3 px-lg-4 pb-5">
          ${(dataErrors.products || dataErrors.orders) && html`
            <div class="alert alert-danger d-flex flex-column flex-sm-row align-items-sm-center justify-content-between gap-3" role="alert">
              <div>
                <div class="fw-semibold">Не удалось загрузить часть данных</div>
                ${dataErrors.products && html`<div class="small mt-1">Каталог: ${dataErrors.products}</div>`}
                ${dataErrors.orders && html`<div class="small mt-1">Заказы: ${dataErrors.orders}</div>`}
              </div>
              <button type="button" class="btn btn-sm btn-outline-danger flex-shrink-0" onClick=${refreshAll} disabled=${isRefreshing}>
                ${isRefreshing ? 'Повторяем…' : 'Повторить загрузку'}
              </button>
            </div>
          `}

          <!-- KPI Metrics Row -->
          <${KpiBanner}
            orders=${orders}
            products=${products}
            onStatusFilterClick=${(st) => {
              setActiveTab('orders');
              setActiveFilterStatus(st);
            }}
          />

          <!-- Active Tab View -->
          ${activeTab === 'orders' && html`
            <${OrdersTab}
              orders=${orders}
              products=${products}
              onStatusChange=${handleOrderStatusChange}
              onNotify=${showToast}
              onRefresh=${() => loadOrders()}
              isRefreshing=${isRefreshing}
              onExportCSV=${handleExportCSV}
              activeFilterStatus=${activeFilterStatus}
              setActiveFilterStatus=${setActiveFilterStatus}
            />
          `}

          ${activeTab === 'catalog' && html`
            <${CatalogTab}
              products=${products}
              onAddProduct=${() => setProductModal({ isOpen: true, product: null })}
              onEditProduct=${(p) => setProductModal({ isOpen: true, product: p })}
              onDeleteProduct=${handleDeleteProduct}
            />
          `}

          ${activeTab === 'summary' && html`
            <${SummaryTab}
              orders=${orders}
              products=${products}
            />
          `}
        </main>

        <!-- Product Add / Edit Modal -->
        <${ProductModal}
          isOpen=${productModal.isOpen}
          product=${productModal.product}
          onClose=${() => setProductModal({ isOpen: false, product: null })}
          onSave=${handleSaveProduct}
        />

        <!-- Global Toast Alert -->
        <${ToastNotification} toast=${toast} onDismiss=${() => setToast(null)} />
      </div>
    `;
  }

  // Mount React App
  const root = ReactDOM.createRoot(document.getElementById('root'));
  root.render(html`<${AdminApp} />`);
})();
