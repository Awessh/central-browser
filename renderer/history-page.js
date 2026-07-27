// ============================================================
// Historique — onglet dédié (browser://history, Ctrl+H)
// ============================================================
// Page complète dans un vrai onglet, avec recherche, filtres et suppression ciblée.
//
// Dépend de (doit être chargé après) :
//   - dom-state.js
//   - utils.js
//   - tabs.js
//   - internal-page-stub.js
//   - history.js (groupHistory)
// ============================================================

// ============================================================
// Historique — onglet dédié (façon Chrome, Ctrl+H)
// Le panneau latéral ci-dessus est conservé tel quel (menu ☰).
// Ctrl+H ouvre désormais une véritable page dans un nouvel onglet.
// ============================================================

const HISTORY_PAGE_TEMPLATE = `
  <div class="hpage-wrap">
    <div class="hpage-header">
      <h1><i class="fa-solid fa-clock-rotate-left"></i> Historique de navigation</h1>
      <div class="hpage-toolbar">
        <div class="hpage-search-box">
          <i class="fa-solid fa-magnifying-glass"></i>
          <input type="text" class="hpage-search" placeholder="Rechercher dans l'historique" />
        </div>
        <select class="hpage-filter">
          <option value="all">Toutes les périodes</option>
          <option value="today">Aujourd'hui</option>
          <option value="yesterday">Hier</option>
          <option value="week">Cette semaine</option>
          <option value="older">Plus ancien</option>
        </select>
        <button class="hpage-clear-btn secondary" data-clear="period"><i class="fa-solid fa-eraser"></i> Effacer cette période</button>
        <button class="hpage-clear-btn" data-clear="all"><i class="fa-solid fa-trash"></i> Tout effacer</button>
      </div>
    </div>
    <div class="hpage-list"></div>
  </div>
`;

function findHistoryTab() {
  return tabs.find((t) => t.isInternal && t.internalType === 'history');
}

function openHistoryTab() {
  const existing = findHistoryTab();
  if (existing) { switchTab(existing.id); refreshHistoryPage(existing.webview); return existing; }
  return createHistoryTab();
}

function createHistoryTab() {

  tabCounter += 1;
  const id = `tab-${tabCounter}`;

  const tabEl = document.createElement('div');
  tabEl.className = 'tab';
  tabEl.dataset.id = id;
  tabEl.innerHTML = `
    <div class="favicon"><i class="fa-solid fa-clock-rotate-left"></i></div>
    <div class="title">Historique</div>
    <button class="close-tab" title="Fermer">&#10005;</button>
  `;
  tabEl.addEventListener('click', (e) => {
    if (e.target.closest('.close-tab')) return;
    switchTab(id);
  });
  tabEl.querySelector('.close-tab').addEventListener('click', () => closeTab(id));
  tabsEl.appendChild(tabEl);

  const page = document.createElement('div');
  page.className = 'internal-page history-page';
  page.innerHTML = HISTORY_PAGE_TEMPLATE;
  makeInternalWebviewStub(page);
  webviewsEl.appendChild(page);

  const tab = {
    id, webview: page, tabEl,
    title: 'Historique', url: 'browser://history',
    isInternal: true, internalType: 'history',
  };
  tabs.push(tab);

  wireHistoryPage(page);
  switchTab(id);
  refreshHistoryPage(page);
  return tab;
}

function wireHistoryPage(page) {
  page.querySelector('.hpage-search').addEventListener('input', () => applyHistoryPageFilters(page));
  page.querySelector('.hpage-filter').addEventListener('change', () => applyHistoryPageFilters(page));

  page.querySelector('[data-clear="all"]').addEventListener('click', async () => {
    await api.clearHistory();
    refreshHistoryPage(page);
  });

  page.querySelector('[data-clear="period"]').addEventListener('click', async () => {
    const filter = page.querySelector('.hpage-filter').value;
    const all = page.__allHistory || [];
    if (filter === 'all') { await api.clearHistory(); refreshHistoryPage(page); return; }
    const groups = groupHistory(all);
    const labels = { today: ["Aujourd'hui"], yesterday: ['Hier'], week: ['Cette semaine'], older: ['Plus ancien'] }[filter];
    const idsToRemove = labels.flatMap((label) => (groups[label] || []).map((h) => h.id)).filter(Boolean);
    if (idsToRemove.length) await api.removeHistoryItems(idsToRemove);
    refreshHistoryPage(page);
  });

  page.__internalRefresh = () => refreshHistoryPage(page);
}

async function refreshHistoryPage(page) {
  if (!page) return;
  const data = await api.getAllData();
  page.__allHistory = data.history;
  applyHistoryPageFilters(page);
}

function applyHistoryPageFilters(page) {
  const search = page.querySelector('.hpage-search').value.trim().toLowerCase();
  const filter = page.querySelector('.hpage-filter').value;
  let list = page.__allHistory || [];
  if (search) {
    list = list.filter((h) => (h.title || '').toLowerCase().includes(search) || h.url.toLowerCase().includes(search));
  }
  const groups = groupHistory(list);
  const order = filter === 'all'
    ? ["Aujourd'hui", 'Hier', 'Cette semaine', 'Plus ancien']
    : { today: ["Aujourd'hui"], yesterday: ['Hier'], week: ['Cette semaine'], older: ['Plus ancien'] }[filter];

  page.querySelector('[data-clear="period"]').classList.toggle('hidden', filter === 'all');

  const listEl = page.querySelector('.hpage-list');
  listEl.innerHTML = '';
  let any = false;
  order.forEach((label) => {
    const items = groups[label];
    if (!items || items.length === 0) return;
    any = true;
    const groupLabel = document.createElement('div');
    groupLabel.className = 'hpage-group-label';
    groupLabel.textContent = label;
    listEl.appendChild(groupLabel);
    items.forEach((h) => listEl.appendChild(pageHistoryRow(h, page)));
  });
  if (!any) listEl.innerHTML = '<div class="hpage-empty">Aucun résultat.</div>';
}

function pageHistoryRow(h, page) {
  const el = document.createElement('div');
  el.className = 'hpage-row';
  const date = new Date(h.time).toLocaleString('fr-FR');
  el.innerHTML = `
    <div class="hpage-icon"><i class="fa-regular fa-file-lines"></i></div>
    <div class="hpage-info">
      <div class="hpage-title" title="${escapeHtml(h.title || h.url)}">${escapeHtml(h.title || h.url)}</div>
      <div class="hpage-meta">${escapeHtml(h.url)} — ${date}</div>
    </div>
    <button class="hpage-remove" title="Supprimer cet élément"><i class="fa-solid fa-xmark"></i></button>
  `;
  el.querySelector('.hpage-info').addEventListener('click', () => openUrlSmart(h.url));
  el.querySelector('.hpage-remove').addEventListener('click', async () => {
    if (h.id) await api.removeHistoryItem(h.id);
    refreshHistoryPage(page);
  });
  return el;
}

