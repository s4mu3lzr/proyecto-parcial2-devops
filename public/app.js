(() => {
  'use strict';

  const API_BASE = '';
  const INVALID_CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/;
  const NAME_ALLOWED_CHARACTERS = /^[\p{L}\p{N}\s.'’\-()_]+$/u;
  const DESCRIPTION_ALLOWED_CHARACTERS = /^[\p{L}\p{N}\s.,;:!?'"’“”()\-_/#+&@%]+$/u;

  const state = {
    items: [],
    filteredItems: [],
    page: 1,
    pageSize: 10,
    confirmAction: null,
    toastTimer: null
  };

  const $ = (selector) => document.querySelector(selector);
  const $$ = (selector) => Array.from(document.querySelectorAll(selector));
  const elements = {
    itemsBody: $('#items-table-body'),
    dashboardBody: $('#dashboard-items-body'),
    search: $('#search-input'),
    sort: $('#sort-select'),
    lengthFilter: $('#length-filter'),
    statusFilter: $('#status-filter'),
    pageSize: $('#page-size'),
    previousPage: $('#previous-page'),
    nextPage: $('#next-page'),
    modalBackdrop: $('#modal-backdrop'),
    itemModal: $('#item-modal'),
    detailModal: $('#detail-modal'),
    confirmModal: $('#confirm-modal'),
    toast: $('#toast-alert')
  };

  async function apiRequest(path, options = {}) {
    const response = await fetch(`${API_BASE}${path}`, {
      ...options,
      headers: {
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
        ...options.headers
      }
    });
    const raw = await response.text();
    let data = null;
    if (raw) {
      try {
        data = JSON.parse(raw);
      } catch {
        data = raw;
      }
    }
    if (!response.ok) {
      const message = data && typeof data === 'object'
        ? data.message || data.error
        : data;
      throw new Error(message || `La solicitud falló (${response.status}).`);
    }
    return data;
  }

  function unwrapList(payload) {
    if (Array.isArray(payload)) return payload;
    if (payload && Array.isArray(payload.items)) return payload.items;
    if (payload && Array.isArray(payload.data)) return payload.data;
    return [];
  }

  function normalizeItem(item) {
    if (!item || typeof item !== 'object') return null;
    return {
      ...item,
      id: item.id ?? item._id ?? item.itemId ?? '',
      name: String(item.name ?? ''),
      description: String(item.description ?? '')
    };
  }

  function showToast(message, type = 'success') {
    window.clearTimeout(state.toastTimer);
    $('#toast-message').textContent = message;
    elements.toast.className = `toast ${type}`;
    elements.toast.hidden = false;
    state.toastTimer = window.setTimeout(() => { elements.toast.hidden = true; }, 5000);
  }

  function setHealth(isHealthy, detail = '') {
    const status = $('#health-status');
    status.innerHTML = '';
    const dot = document.createElement('span');
    dot.className = `status-dot ${isHealthy ? 'connected' : 'disconnected'}`;
    status.append(dot, document.createTextNode(isHealthy ? 'En línea' : 'Sin conexión'));
    $('#health-detail').textContent = detail || (isHealthy ? 'API disponible' : 'No se pudo conectar con la API');
    $('#sidebar-health-dot').className = `connection-dot ${isHealthy ? 'connected' : 'disconnected'}`;
    $('#sidebar-health-label').textContent = isHealthy ? 'Conectada' : 'Sin conexión';
  }

  async function loadHealth() {
    try {
      const result = await apiRequest('/api/health');
      const healthy = !(result && typeof result === 'object' && (
        result.status === 'error' || result.status === 'unhealthy' || result.ok === false || result.healthy === false
      ));
      setHealth(healthy, result && typeof result === 'object'
        ? String(result.message || result.status || (healthy ? 'API disponible' : 'Servicio no disponible'))
        : 'API disponible');
    } catch (error) {
      setHealth(false, error.message);
    }
  }

  async function loadItems({ notify = false } = {}) {
    try {
      const payload = await apiRequest('/items');
      state.items = unwrapList(payload).map(normalizeItem).filter(Boolean);
      renderItems();
      if (notify) showToast('El catálogo se actualizó correctamente.');
    } catch (error) {
      state.items = [];
      renderItems();
      showToast(`No se pudieron cargar los ítems: ${error.message}`, 'error');
    }
  }

  async function loadMetrics() {
    const countNode = $('#items-count');
    const lastNode = $('#last-item-content');
    const outcomes = await Promise.allSettled([
      apiRequest('/items/count'),
      apiRequest('/items/last')
    ]);

    if (outcomes[0].status === 'fulfilled') {
      const payload = outcomes[0].value;
      const count = typeof payload === 'number'
        ? payload
        : payload && (payload.count ?? payload.total ?? payload.data);
      countNode.textContent = Number.isFinite(Number(count)) ? String(Number(count)) : '0';
    } else {
      countNode.textContent = '—';
      showToast(`No se pudo obtener el total: ${outcomes[0].reason.message}`, 'error');
    }

    if (outcomes[1].status === 'fulfilled') {
      const payload = outcomes[1].value;
      const item = normalizeItem(payload && (payload.item || payload.data || payload));
      lastNode.replaceChildren();
      if (!item || (!item.id && !item.name)) {
        appendText(lastNode, 'strong', 'Sin registros todavía');
        appendText(lastNode, 'span', 'El último ítem aparecerá aquí');
      } else {
        appendText(lastNode, 'strong', item.name || `Ítem #${item.id}`);
        appendText(lastNode, 'span', `ID ${item.id}${item.description ? ` · ${item.description}` : ''}`);
      }
    } else {
      lastNode.replaceChildren();
      appendText(lastNode, 'strong', 'No disponible');
      appendText(lastNode, 'span', outcomes[1].reason.message);
    }
  }

  function appendText(parent, tag, text, className = '') {
    const node = document.createElement(tag);
    if (className) node.className = className;
    node.textContent = text;
    parent.append(node);
    return node;
  }

  function itemInitial(name) {
    return Array.from(name.trim())[0] || '?';
  }

  function renderItems() {
    const query = elements.search.value.trim().toLocaleLowerCase();
    let items = state.items.filter((item) => {
      const matchesSearch = !query || [item.name, item.description, String(item.id)]
        .some((value) => value.toLocaleLowerCase().includes(query));
      const nameLength = item.name.length;
      const length = elements.lengthFilter.value;
      const matchesLength = length === 'all' ||
        (length === 'short' && nameLength >= 3 && nameLength <= 10) ||
        (length === 'medium' && nameLength >= 11 && nameLength <= 30) ||
        (length === 'long' && nameLength >= 31);
      const status = String(item.status ?? item.state ?? 'active').toLowerCase();
      const isInactive = ['inactive', 'disabled', 'inactivo', 'false', '0'].includes(status) || item.active === false;
      const matchesStatus = elements.statusFilter.value === 'all' ||
        (elements.statusFilter.value === 'active' && !isInactive) ||
        (elements.statusFilter.value === 'inactive' && isInactive);
      return matchesSearch && matchesLength && matchesStatus;
    });

    const sort = elements.sort.value;
    items.sort((a, b) => {
      if (sort === 'id-asc' || sort === 'id-desc') {
        const left = Number(a.id);
        const right = Number(b.id);
        const comparison = Number.isNaN(left) || Number.isNaN(right)
          ? String(a.id).localeCompare(String(b.id), undefined, { numeric: true })
          : left - right;
        return sort === 'id-asc' ? comparison : -comparison;
      }
      const comparison = a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
      return sort === 'name-asc' ? comparison : -comparison;
    });
    state.filteredItems = items;

    const pageCount = Math.max(1, Math.ceil(items.length / state.pageSize));
    state.page = Math.min(state.page, pageCount);
    const start = (state.page - 1) * state.pageSize;
    const visibleItems = items.slice(start, start + state.pageSize);
    elements.itemsBody.replaceChildren(...visibleItems.map((item) => createItemRow(item, false)));

    $('#results-summary').textContent = `${items.length} ${items.length === 1 ? 'ítem encontrado' : 'ítems encontrados'}`;
    $('#pagination-info').textContent = items.length
      ? `${start + 1}–${Math.min(start + state.pageSize, items.length)} de ${items.length}`
      : '0–0 de 0';
    elements.previousPage.disabled = state.page <= 1;
    elements.nextPage.disabled = state.page >= pageCount;
    $('#empty-state').hidden = items.length > 0;
    elements.itemsBody.closest('table').hidden = items.length === 0;

    const recent = [...state.items].slice(-5).reverse();
    elements.dashboardBody.replaceChildren(...recent.map((item) => createItemRow(item, true)));
    $('#dashboard-empty-state').hidden = state.items.length > 0;
    elements.dashboardBody.closest('table').hidden = state.items.length === 0;
  }

  function createItemRow(item, compact) {
    const row = document.createElement('tr');
    const nameCell = document.createElement('td');
    const itemCell = document.createElement('div');
    itemCell.className = 'item-cell';
    appendText(itemCell, 'span', itemInitial(item.name), 'item-avatar');
    const itemLabel = document.createElement('span');
    appendText(itemLabel, 'strong', item.name || 'Sin nombre');
    if (!compact) appendText(itemLabel, 'small', item.description || 'Sin descripción');
    itemCell.append(itemLabel);
    nameCell.append(itemCell);
    row.append(nameCell);

    const idCell = appendText(row, 'td', String(item.id), 'id-cell');
    idCell.title = String(item.id);
    if (compact) {
      appendText(row, 'td', item.description || 'Sin descripción', 'description-cell');
      const actions = document.createElement('td');
      actions.className = 'actions-heading';
      actions.append(createActionButton('Ver detalle', 'view', item, `dashboard-view-item-${item.id}`));
      row.append(actions);
      return row;
    }

    appendText(row, 'td', item.description || 'Sin descripción', 'description-cell');
    const statusCell = document.createElement('td');
    const statusValue = String(item.status ?? item.state ?? 'active').toLowerCase();
    const inactive = ['inactive', 'disabled', 'inactivo', 'false', '0'].includes(statusValue) || item.active === false;
    appendText(statusCell, 'span', inactive ? 'Inactivo' : 'Activo', `status-pill${inactive ? ' inactive' : ''}`);
    row.append(statusCell);
    const actionCell = document.createElement('td');
    actionCell.className = 'actions-heading';
    const actionGroup = document.createElement('div');
    actionGroup.className = 'row-actions';
    actionGroup.append(
      createActionButton('Ver detalle', 'view', item),
      createActionButton('Editar', 'edit', item),
      createActionButton('Eliminar', 'delete', item)
    );
    actionCell.append(actionGroup);
    row.append(actionCell);
    return row;
  }

  function createActionButton(label, action, item, testId = `${action}-item-${item.id}`) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `row-action${action === 'delete' ? ' delete' : ''}`;
    button.id = `action-${testId}`;
    button.dataset.testid = testId;
    button.dataset.action = action;
    button.dataset.id = String(item.id);
    button.setAttribute('aria-label', `${label}: ${item.name}`);
    button.title = label;
    button.textContent = { view: '◉', edit: '✎', delete: '⌫' }[action];
    return button;
  }

  function openModal(modal) {
    $$('.modal-backdrop .modal').forEach((node) => { node.hidden = true; });
    elements.modalBackdrop.hidden = false;
    modal.hidden = false;
    const focusable = modal.querySelector('input:not([type="hidden"]), textarea, button');
    if (focusable) focusable.focus();
  }

  function closeModal() {
    elements.modalBackdrop.hidden = true;
    $$('.modal-backdrop .modal').forEach((node) => { node.hidden = true; });
    state.confirmAction = null;
  }

  function openCreateModal() {
    $('#item-form').reset();
    $('#item-id').value = '';
    clearValidation();
    $('#modal-eyebrow').textContent = 'NUEVO REGISTRO';
    $('#modal-title').textContent = 'Crear ítem';
    $('#save-item-button').textContent = 'Guardar ítem';
    openModal(elements.itemModal);
  }

  async function openEditModal(id) {
    const localItem = state.items.find((item) => String(item.id) === String(id));
    try {
      const payload = await apiRequest(`/items/${encodeURIComponent(id)}`);
      const item = normalizeItem(payload && (payload.item || payload.data || payload)) || localItem;
      if (!item) throw new Error('El ítem solicitado no existe.');
      $('#item-form').reset();
      clearValidation();
      $('#item-id').value = item.id;
      $('#item-name').value = item.name;
      $('#item-description').value = item.description;
      $('#modal-eyebrow').textContent = `EDITAR REGISTRO · #${item.id}`;
      $('#modal-title').textContent = 'Editar ítem';
      $('#save-item-button').textContent = 'Guardar cambios';
      openModal(elements.itemModal);
    } catch (error) {
      showToast(`No se pudo abrir el ítem: ${error.message}`, 'error');
    }
  }

  async function openDetailModal(id) {
    try {
      const payload = await apiRequest(`/items/${encodeURIComponent(id)}`);
      const item = normalizeItem(payload && (payload.item || payload.lastItem || payload.data || payload));
      if (!item) throw new Error('El ítem solicitado no existe.');
      const detailBody = $('#detail-body');
      detailBody.replaceChildren();
      [
        ['Nombre', item.name || 'Sin nombre'],
        ['ID', String(item.id)],
        ['Descripción', item.description || 'Sin descripción'],
        ['Estado', String(item.status ?? item.state ?? (item.active === false ? 'Inactivo' : 'Activo'))]
      ].forEach(([label, value]) => {
        const property = document.createElement('div');
        property.className = 'detail-property';
        appendText(property, 'span', label);
        appendText(property, 'strong', value);
        detailBody.append(property);
      });
      openModal(elements.detailModal);
    } catch (error) {
      showToast(`No se pudo obtener el detalle: ${error.message}`, 'error');
    }
  }

  function validateField(input, errorNode, type) {
    const value = input.value.trim();
    let message = '';
    if (!value) message = 'Este campo es obligatorio.';
    else if (value.length < 3) message = 'Debe contener al menos 3 caracteres.';
    else if (value.length > 100) message = 'No puede superar los 100 caracteres.';
    else if (INVALID_CONTROL_CHARACTERS.test(value)) message = 'No se permiten caracteres de control.';
    else if (type === 'name' && !NAME_ALLOWED_CHARACTERS.test(value)) message = 'El nombre contiene caracteres no permitidos.';
    else if (type === 'description' && !DESCRIPTION_ALLOWED_CHARACTERS.test(value)) message = 'La descripción contiene caracteres no permitidos.';

    errorNode.textContent = message;
    input.closest('.form-field').classList.toggle('invalid', Boolean(message));
    input.setAttribute('aria-invalid', String(Boolean(message)));
    return !message;
  }

  function clearValidation() {
    ['item-name', 'item-description'].forEach((id) => {
      const input = $(`#${id}`);
      input.removeAttribute('aria-invalid');
      input.closest('.form-field').classList.remove('invalid');
    });
    $('#error-name').textContent = '';
    $('#error-description').textContent = '';
  }

  async function saveItem(event) {
    event.preventDefault();
    const validName = validateField($('#item-name'), $('#error-name'), 'name');
    const validDescription = validateField($('#item-description'), $('#error-description'), 'description');
    if (!validName || !validDescription) return;

    const id = $('#item-id').value;
    const body = {
      name: $('#item-name').value.trim(),
      description: $('#item-description').value.trim()
    };
    const button = $('#save-item-button');
    button.disabled = true;
    try {
      await apiRequest(id ? `/items/${encodeURIComponent(id)}` : '/items', {
        method: id ? 'PUT' : 'POST',
        body: JSON.stringify(body)
      });
      closeModal();
      showToast(id ? 'El ítem se actualizó correctamente.' : 'El ítem se creó correctamente.');
      await refreshAll();
    } catch (error) {
      showToast(`No se pudo guardar el ítem: ${error.message}`, 'error');
    } finally {
      button.disabled = false;
    }
  }

  function requestConfirmation({ title, message, confirmLabel, action, danger = true }) {
    $('#confirm-title').textContent = title;
    $('#confirm-message').textContent = message;
    const accept = $('#confirm-accept');
    accept.textContent = confirmLabel;
    accept.className = `button ${danger ? 'button-danger' : 'button-primary'}`;
    state.confirmAction = action;
    openModal(elements.confirmModal);
  }

  async function confirmAction() {
    const action = state.confirmAction;
    if (!action) return;
    const accept = $('#confirm-accept');
    accept.disabled = true;
    try {
      await action();
      closeModal();
      await refreshAll();
    } catch (error) {
      closeModal();
      showToast(`La operación no se completó: ${error.message}`, 'error');
    } finally {
      accept.disabled = false;
    }
  }

  async function deleteItem(id) {
    const item = state.items.find((entry) => String(entry.id) === String(id));
    requestConfirmation({
      title: 'Eliminar ítem',
      message: `¿Quieres eliminar “${item ? item.name : `#${id}`}”? Esta acción no se puede deshacer.`,
      confirmLabel: 'Eliminar ítem',
      action: async () => {
        await apiRequest(`/items/${encodeURIComponent(id)}`, { method: 'DELETE' });
        showToast('El ítem se eliminó correctamente.');
      }
    });
  }

  function parseBulkInput(raw) {
    const text = raw.trim();
    if (!text) throw new Error('Ingresa al menos un ítem para importar.');
    let items;
    if (text.startsWith('[') || text.startsWith('{')) {
      let parsed;
      try {
        parsed = JSON.parse(text);
      } catch {
        throw new Error('El JSON no es válido. Revisa comas, comillas y llaves.');
      }
      items = Array.isArray(parsed) ? parsed : [parsed];
    } else {
      items = text.split(/\r?\n/).filter((line) => line.trim()).map((line, index) => {
        const parts = line.split(',');
        if (parts.length < 2) throw new Error(`La línea ${index + 1} debe tener el formato Nombre, Descripción.`);
        return { name: parts.shift().trim(), description: parts.join(',').trim() };
      });
    }
    if (!items.length) throw new Error('No se encontraron ítems para importar.');
    const normalized = items.map((item, index) => {
      if (!item || typeof item !== 'object' || Array.isArray(item)) {
        throw new Error(`El elemento ${index + 1} debe ser un objeto con nombre y descripción.`);
      }
      const name = typeof item.name === 'string' ? item.name.trim() : '';
      const description = typeof item.description === 'string' ? item.description.trim() : '';
      if (name.length < 3 || name.length > 100 || !NAME_ALLOWED_CHARACTERS.test(name)) {
        throw new Error(`El nombre del elemento ${index + 1} debe tener entre 3 y 100 caracteres válidos.`);
      }
      if (description.length < 3 || description.length > 100 || !DESCRIPTION_ALLOWED_CHARACTERS.test(description)) {
        throw new Error(`La descripción del elemento ${index + 1} debe tener entre 3 y 100 caracteres válidos.`);
      }
      return { name, description };
    });
    return normalized;
  }

  async function submitBulk() {
    const errorNode = $('#bulk-error');
    errorNode.textContent = '';
    let items;
    try {
      items = parseBulkInput($('#bulk-input').value);
    } catch (error) {
      errorNode.textContent = error.message;
      return;
    }
    const button = $('#bulk-submit-button');
    button.disabled = true;
    try {
      await apiRequest('/items/bulk', { method: 'POST', body: JSON.stringify(items) });
      $('#bulk-input').value = '';
      showToast(`${items.length} ${items.length === 1 ? 'ítem importado' : 'ítems importados'} correctamente.`);
      await refreshAll();
    } catch (error) {
      showToast(`No se pudo completar la carga masiva: ${error.message}`, 'error');
    } finally {
      button.disabled = false;
    }
  }

  async function runTool(path, successMessage) {
    await apiRequest(path, { method: path === '/backup' ? 'POST' : 'DELETE' });
    showToast(successMessage);
  }

  async function refreshAll({ notify = false } = {}) {
    await Promise.all([loadHealth(), loadItems({ notify }), loadMetrics()]);
  }

  function changeView(view) {
    const titles = { dashboard: 'Dashboard', catalog: 'Catálogo / CRUD', bulk: 'Carga masiva', tools: 'Herramientas' };
    $$('.view-panel').forEach((panel) => {
      const active = panel.id === `${view}-view`;
      panel.hidden = !active;
      panel.classList.toggle('active', active);
    });
    $$('.nav-link').forEach((link) => {
      const active = link.dataset.view === view;
      link.classList.toggle('active', active);
      link.setAttribute('aria-current', active ? 'page' : 'false');
    });
    $('#page-title').textContent = titles[view] || titles.dashboard;
    if (view === 'catalog') renderItems();
  }

  function clearFilters() {
    elements.search.value = '';
    elements.sort.value = 'id-asc';
    elements.lengthFilter.value = 'all';
    elements.statusFilter.value = 'all';
    state.page = 1;
    renderItems();
  }

  function blockInvalidInput(input, type) {
    const allowed = type === 'name' ? NAME_ALLOWED_CHARACTERS : DESCRIPTION_ALLOWED_CHARACTERS;
    input.addEventListener('beforeinput', (event) => {
      if (!event.data || event.inputType.startsWith('delete')) return;
      if (INVALID_CONTROL_CHARACTERS.test(event.data) || !Array.from(event.data).every((character) => allowed.test(character))) {
        event.preventDefault();
      }
    });
    input.addEventListener('paste', (event) => {
      const pasted = event.clipboardData && event.clipboardData.getData('text');
      if (pasted && (!allowed.test(pasted) || INVALID_CONTROL_CHARACTERS.test(pasted))) event.preventDefault();
    });
  }

  function initialize() {
    $('#current-date').textContent = new Intl.DateTimeFormat('es', { dateStyle: 'medium' }).format(new Date());
    const savedTheme = localStorage.getItem('inventory-theme');
    if (savedTheme === 'dark') setTheme(true);

    $$('.nav-link').forEach((button) => button.addEventListener('click', () => changeView(button.dataset.view)));
    $('#dashboard-create-button').addEventListener('click', openCreateModal);
    $('#create-item-button').addEventListener('click', openCreateModal);
    $('#empty-create-button').addEventListener('click', openCreateModal);
    $('#dashboard-view-all').addEventListener('click', () => changeView('catalog'));
    $('#item-form').addEventListener('submit', saveItem);
    $('#modal-close').addEventListener('click', closeModal);
    $('#cancel-form-button').addEventListener('click', closeModal);
    $$('.close-modal-button').forEach((button) => button.addEventListener('click', closeModal));
    $('#confirm-cancel').addEventListener('click', closeModal);
    $('#confirm-accept').addEventListener('click', confirmAction);
    elements.modalBackdrop.addEventListener('click', (event) => {
      if (event.target === elements.modalBackdrop) closeModal();
    });
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && !elements.modalBackdrop.hidden) closeModal();
    });
    elements.itemsBody.addEventListener('click', (event) => {
      const button = event.target.closest('button[data-action]');
      if (!button) return;
      const { action, id } = button.dataset;
      if (action === 'view') openDetailModal(id);
      if (action === 'edit') openEditModal(id);
      if (action === 'delete') deleteItem(id);
    });

    [elements.search, elements.sort, elements.lengthFilter, elements.statusFilter].forEach((input) => {
      input.addEventListener(input === elements.search ? 'input' : 'change', () => {
        state.page = 1;
        renderItems();
      });
    });
    elements.pageSize.addEventListener('change', () => {
      state.pageSize = Number(elements.pageSize.value);
      state.page = 1;
      renderItems();
    });
    elements.previousPage.addEventListener('click', () => { state.page--; renderItems(); });
    elements.nextPage.addEventListener('click', () => { state.page++; renderItems(); });
    $('#clear-filters-button').addEventListener('click', clearFilters);
    $('#empty-clear-button').addEventListener('click', clearFilters);
    $('#bulk-submit-button').addEventListener('click', submitBulk);

    $('#backup-button').addEventListener('click', () => {
      requestConfirmation({
        title: 'Generar respaldo',
        message: 'Se generará un respaldo con los registros actuales del inventario.',
        confirmLabel: 'Generar respaldo',
        danger: false,
        action: () => runTool('/backup', 'El respaldo se generó correctamente.')
      });
    });
    $('#clear-items-button').addEventListener('click', () => {
      requestConfirmation({
        title: 'Limpiar registros',
        message: 'Se eliminarán los registros actuales. Esta acción no se puede deshacer.',
        confirmLabel: 'Limpiar registros',
        action: () => runTool('/items/clear', 'Los registros se limpiaron correctamente.')
      });
    });
    $('#truncate-items-button').addEventListener('click', () => {
      requestConfirmation({
        title: 'Truncar inventario',
        message: 'Se reiniciará el inventario de forma permanente. Esta acción no se puede deshacer.',
        confirmLabel: 'Truncar inventario',
        action: () => runTool('/items/truncate', 'El inventario se truncó correctamente.')
      });
    });

    $('#toggle-theme').addEventListener('click', () => setTheme(!document.body.classList.contains('dark-mode')));
    $('#refresh-button').addEventListener('click', () => refreshAll({ notify: true }));
    $('#toast-close').addEventListener('click', () => {
      window.clearTimeout(state.toastTimer);
      elements.toast.hidden = true;
    });
    blockInvalidInput($('#item-name'), 'name');
    blockInvalidInput($('#item-description'), 'description');
    $('#item-name').addEventListener('input', () => {
      if ($('#error-name').textContent) validateField($('#item-name'), $('#error-name'), 'name');
    });
    $('#item-description').addEventListener('input', () => {
      if ($('#error-description').textContent) validateField($('#item-description'), $('#error-description'), 'description');
    });
    refreshAll();
  }

  function setTheme(isDark) {
    document.body.classList.toggle('dark-mode', isDark);
    $('#theme-icon').textContent = isDark ? '☼' : '☾';
    $('#theme-label').textContent = isDark ? 'Modo claro' : 'Modo oscuro';
    $('#toggle-theme').setAttribute('aria-label', isDark ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro');
    localStorage.setItem('inventory-theme', isDark ? 'dark' : 'light');
  }

  initialize();
})();
