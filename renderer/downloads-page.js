// ============================================================
// Téléchargements — onglet dédié (browser://downloads, Ctrl+J)
// ============================================================
// Page complète dans un vrai onglet, avec recherche, filtres et actions par ligne.
//
// Dépend de (doit être chargé après) :
//   - dom-state.js
//   - utils.js
//   - tabs.js
//   - internal-page-stub.js
//   - downloads.js (formatBytes/formatSpeed/formatTimeRemaining)
// ============================================================

// ============================================================
// Téléchargements — onglet dédié (façon Chrome, Ctrl+J)
// Le panneau latéral ci-dessus est conservé tel quel (bouton
// rapide de la barre d'outils, menu ☰). Ctrl+J ouvre désormais
// une véritable page dans un nouvel onglet plutôt que le panneau.
// ============================================================


const DOWNLOADS_PAGE_TEMPLATE = `
  <div class="dlpage-wrap">
    <div class="dlpage-header">
      <h1><i class="fa-solid fa-download"></i> Téléchargements</h1>
      <div class="dlpage-toolbar">
        <div class="dlpage-search-box">
          <i class="fa-solid fa-magnifying-glass"></i>
          <input type="text" class="dlpage-search" placeholder="Rechercher dans les téléchargements" />
        </div>
        <select class="dlpage-filter">
          <option value="all">Toutes les périodes</option>
          <option value="today">Aujourd'hui</option>
          <option value="yesterday">Hier</option>
          <option value="week">Cette semaine</option>
          <option value="older">Plus ancien</option>
        </select>
        <button class="dlpage-clear-btn"><i class="fa-solid fa-trash"></i> Effacer l'historique</button>
      </div>
    </div>
    <div class="dlpage-list"></div>
  </div>
`;


function findDownloadsTab() {
  return tabs.find((t) => t.isInternal && t.internalType === 'downloads');
}

function openDownloadsTab() {
  const existing = findDownloadsTab();
  if (existing) { switchTab(existing.id); refreshDownloadsPage(existing.webview); return existing; }
  return createDownloadsTab();
}

function createDownloadsTab() {

  tabCounter += 1;
  const id = `tab-${tabCounter}`;

  const tabEl = document.createElement('div');
  tabEl.className = 'tab';
  tabEl.dataset.id = id;
  tabEl.innerHTML = `
    <div class="favicon"><i class="fa-solid fa-download"></i></div>
    <div class="title">Téléchargements</div>
    <button class="close-tab" title="Fermer">&#10005;</button>
  `;
  tabEl.addEventListener('click', (e) => {
    if (e.target.closest('.close-tab')) return;
    switchTab(id);
  });
  tabEl.querySelector('.close-tab').addEventListener('click', () => closeTab(id));
  tabsEl.appendChild(tabEl);

  const page = document.createElement('div');
  page.className = 'internal-page downloads-page';
  page.innerHTML = DOWNLOADS_PAGE_TEMPLATE;
  makeInternalWebviewStub(page);
  webviewsEl.appendChild(page);

  const tab = {
    id, webview: page, tabEl,
    title: 'Téléchargements', url: 'browser://downloads',
    isInternal: true, internalType: 'downloads',
  };
  tabs.push(tab);

  wireDownloadsPage(page);
  switchTab(id);
  refreshDownloadsPage(page);
  return tab;
}

function wireDownloadsPage(page) {
  page.querySelector('.dlpage-search').addEventListener('input', () => applyDownloadsPageFilters(page));
  page.querySelector('.dlpage-filter').addEventListener('change', () => applyDownloadsPageFilters(page));
  page.querySelector('.dlpage-clear-btn').addEventListener('click', async () => {
    await api.clearDownloads();
    refreshDownloadsPage(page);
  });
  page.__internalRefresh = () => refreshDownloadsPage(page);
}

async function refreshDownloadsPage(page) {
  if (!page) return;
  page.__allDownloads = await api.getDownloads();
  applyDownloadsPageFilters(page);
}

function groupDownloadsByDate(list) {
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const startOfYesterday = startOfToday - 86400000;
  const startOfWeek = startOfToday - 6 * 86400000;

  const groups = { "Aujourd'hui": [], 'Hier': [], 'Cette semaine': [], 'Plus ancien': [] };
  list.forEach((d) => {
    const t = d.startedAt || 0;
    if (t >= startOfToday) groups["Aujourd'hui"].push(d);
    else if (t >= startOfYesterday) groups['Hier'].push(d);
    else if (t >= startOfWeek) groups['Cette semaine'].push(d);
    else groups['Plus ancien'].push(d);
  });
  return groups;
}

function applyDownloadsPageFilters(page) {
  const search = page.querySelector('.dlpage-search').value.trim().toLowerCase();
  const filter = page.querySelector('.dlpage-filter').value;
  let list = page.__allDownloads || [];
  if (search) {
    list = list.filter((d) => (d.filename || '').toLowerCase().includes(search) || (d.url || '').toLowerCase().includes(search));
  }
  const groups = groupDownloadsByDate(list);
  const order = filter === 'all'
    ? ["Aujourd'hui", 'Hier', 'Cette semaine', 'Plus ancien']
    : { today: ["Aujourd'hui"], yesterday: ['Hier'], week: ['Cette semaine'], older: ['Plus ancien'] }[filter];

  const listEl = page.querySelector('.dlpage-list');
  listEl.innerHTML = '';
  let any = false;
  order.forEach((label) => {
    const items = groups[label];
    if (!items || items.length === 0) return;
    any = true;
    const groupLabel = document.createElement('div');
    groupLabel.className = 'dlpage-group-label';
    groupLabel.textContent = label;
    listEl.appendChild(groupLabel);
    items.forEach((d) => listEl.appendChild(pageDownloadRow(d)));
  });
  if (!any) listEl.innerHTML = '<div class="dlpage-empty">Aucun résultat.</div>';
}

function pageDownloadRow(d) {
  const el = document.createElement('div');
  el.className = `dlpage-row ${d.state}`;
  el.dataset.id = d.id;

  const total = d.totalBytes || 1;
  const received = d.receivedBytes || 0;
  const pct = Math.min(100, Math.round((received / total) * 100));
  const dateStr = d.startedAt ? new Date(d.startedAt).toLocaleString('fr-FR') : '';

  let statusDescription = '';
  if (d.state === 'progressing') {
    const speedStr = formatSpeed(d.speed);
    const timeStr = formatTimeRemaining(d.estimatedTime);
    statusDescription = `${formatBytes(received)} / ${formatBytes(d.totalBytes)} (${pct}%) ${speedStr ? '• ' + speedStr : ''} ${timeStr ? '• ' + timeStr : ''}`;
  } else if (d.state === 'completed') {
    statusDescription = `${formatBytes(d.totalBytes)} • ${dateStr}`;
  } else if (d.state === 'cancelled') {
    statusDescription = `Annulé • ${dateStr}`;
  } else if (d.state === 'interrupted') {
    statusDescription = `Interrompu / Erreur • ${dateStr}`;
  } else if (d.state === 'paused') {
    statusDescription = `En pause • ${pct}%`;
  }

  el.innerHTML = `
    <div class="dlpage-icon"><i class="fa-solid fa-file-arrow-down"></i></div>
    <div class="dlpage-info">
      <div class="dlpage-name" title="${escapeHtml(d.filename)}">${escapeHtml(d.filename)}</div>
      <div class="dlpage-meta">${statusDescription}</div>
      ${d.state === 'progressing' || d.state === 'paused' ? `<div class="dlpage-progress"><div class="dlpage-progress-fill" style="width:${pct}%"></div></div>` : ''}
      <div class="dlpage-actions">
        ${d.state === 'completed' ? '<button data-open>Ouvrir</button>' : ''}
        ${d.state === 'completed' || d.state === 'cancelled' || d.state === 'interrupted' ? '<button data-show>Afficher dans le dossier</button>' : ''}
        ${d.state === 'progressing' ? '<button data-action="pause">Pause</button>' : ''}
        ${d.state === 'paused' ? '<button data-action="resume">Reprendre</button>' : ''}
        ${d.state === 'progressing' || d.state === 'paused' ? '<button data-action="cancel">Annuler</button>' : ''}
        <button data-remove class="dlpage-remove" title="Supprimer de l'historique"><i class="fa-solid fa-trash"></i></button>
      </div>
    </div>
  `;

  if (el.querySelector('[data-open]')) el.querySelector('[data-open]').addEventListener('click', () => openDownloadFile(d.path));
  if (el.querySelector('[data-show]')) el.querySelector('[data-show]').addEventListener('click', () => api.showInFolder(d.path));
  const pauseBtn = el.querySelector('[data-action="pause"]');
  if (pauseBtn) pauseBtn.addEventListener('click', () => api.pauseDownload(d.id));
  const resumeBtn = el.querySelector('[data-action="resume"]');
  if (resumeBtn) resumeBtn.addEventListener('click', () => api.resumeDownload(d.id));
  const cancelBtn = el.querySelector('[data-action="cancel"]');
  if (cancelBtn) cancelBtn.addEventListener('click', () => api.cancelDownload(d.id));
  el.querySelector('[data-remove]').addEventListener('click', async () => {
    await api.removeDownload(d.id);
    const dlTab = findDownloadsTab();
    if (dlTab) refreshDownloadsPage(dlTab.webview);
  });

  return el;
}
