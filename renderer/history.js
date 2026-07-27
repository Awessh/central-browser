// ============================================================
// Historique — panneau latéral (aperçu + vue complète)
// ============================================================
// Rendu de l'aperçu (menu ☰), puis vue complète groupée par période avec recherche/filtre.
//
// Dépend de (doit être chargé après) :
//   - dom-state.js
//   - utils.js
//   - tabs.js
// ============================================================


// ============================================================
// Historique — aperçu (barre) + vue complète groupée/filtrée
// ============================================================
let historyFullView = false;

function groupHistory(list) {
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const startOfYesterday = startOfToday - 86400000;
  const startOfWeek = startOfToday - 6 * 86400000;

  const groups = { "Aujourd'hui": [], 'Hier': [], 'Cette semaine': [], 'Plus ancien': [] };
  list.forEach((h) => {
    if (h.time >= startOfToday) groups["Aujourd'hui"].push(h);
    else if (h.time >= startOfYesterday) groups['Hier'].push(h);
    else if (h.time >= startOfWeek) groups['Cette semaine'].push(h);
    else groups['Plus ancien'].push(h);
  });
  return groups;
}

async function renderHistoryPreview() {
  historyFullView = false;
  document.querySelector('#history-panel .panel-toolbar').classList.add('hidden');
  const data = await api.getAllData();
  const listEl = document.getElementById('history-list');
  const recent = data.history.slice(0, 8);
  listEl.innerHTML = '';
  if (recent.length === 0) {
    listEl.innerHTML = '<div class="history-item">Aucun historique pour le moment.</div>';
  }
  recent.forEach((h) => listEl.appendChild(historyRow(h)));
  const cta = document.createElement('div');
  cta.className = 'cta-full-history';
  cta.textContent = 'Voir plus →';
  cta.addEventListener('click', renderHistoryFull);
  listEl.appendChild(cta);
}

async function renderHistoryFull() {
  historyFullView = true;
  document.querySelector('#history-panel .panel-toolbar').classList.remove('hidden');
  const data = await api.getAllData();
  applyHistoryFilters(data.history);
}

function applyHistoryFilters(fullHistory) {
  const search = document.getElementById('history-search').value.trim().toLowerCase();
  const filter = document.getElementById('history-filter').value;
  let list = fullHistory;
  if (search) {
    list = list.filter((h) => (h.title || '').toLowerCase().includes(search) || h.url.toLowerCase().includes(search));
  }
  const groups = groupHistory(list);
  const order = filter === 'all'
    ? ["Aujourd'hui", 'Hier', 'Cette semaine', 'Plus ancien']
    : { today: ["Aujourd'hui"], yesterday: ['Hier'], week: ['Cette semaine'], older: ['Plus ancien'] }[filter];

  const listEl = document.getElementById('history-list');
  listEl.innerHTML = '';
  let any = false;
  order.forEach((label) => {
    const items = groups[label];
    if (!items || items.length === 0) return;
    any = true;
    const groupLabel = document.createElement('div');
    groupLabel.className = 'history-group-label';
    groupLabel.textContent = label;
    listEl.appendChild(groupLabel);
    items.forEach((h) => listEl.appendChild(historyRow(h)));
  });
  if (!any) listEl.innerHTML = '<div class="history-item">Aucun résultat.</div>';
}

document.getElementById('history-search').addEventListener('input', async () => {
  if (!historyFullView) return;
  const data = await api.getAllData();
  applyHistoryFilters(data.history);
});
document.getElementById('history-filter').addEventListener('change', async () => {
  if (!historyFullView) return;
  const data = await api.getAllData();
  applyHistoryFilters(data.history);
});

function historyRow(h) {
  const el = document.createElement('div');
  el.className = 'history-item';
  const date = new Date(h.time).toLocaleString('fr-FR');
  el.innerHTML = `<div class="h-title">${escapeHtml(h.title || h.url)}</div><div class="h-url">${escapeHtml(h.url)} — ${date}</div>`;
  el.addEventListener('click', () => openUrlSmart(h.url));
  return el;
}

document.getElementById('history-clear-btn').addEventListener('click', async () => {
  await api.clearHistory();
  historyFullView ? renderHistoryFull() : renderHistoryPreview();
});

document.getElementById('history-all-btn')?.addEventListener('click', () => {
  openHistoryTab();
  document.querySelector('#history-panel').classList.add('hidden')
} );

