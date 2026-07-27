// ============================================================
// Gestion des cookies
// ============================================================
// Panneau latéral listant les cookies groupés par domaine, suppression et blocage des cookies tiers.
//
// Dépend de (doit être chargé après) :
//   - dom-state.js
//   - utils.js
//   - settings-page.js (findSettingsTab)
// ============================================================


// ============================================================
// Gestion des cookies
// ============================================================
let allCookies = [];

async function renderCookiesPanel() {
  document.getElementById('block-third-party-cookies').checked = !!settings.blockThirdPartyCookies;
  allCookies = await api.getAllCookies();
  paintCookiesList(allCookies);
}

function groupCookiesByDomain(list) {
  const map = new Map();
  list.forEach((c) => {
    const key = c.domain.replace(/^\./, '');
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(c);
  });
  return map;
}

function paintCookiesList(list) {
  const listEl = document.getElementById('cookies-list');
  listEl.innerHTML = '';
  const groups = groupCookiesByDomain(list);
  if (groups.size === 0) { listEl.innerHTML = '<div class="cookie-row">Aucun cookie enregistré.</div>'; return; }

  [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0])).forEach(([domain, cookiesForDomain]) => {
    const el = document.createElement('div');
    el.className = 'cookie-row';
    el.innerHTML = `
      <div class="c-domain">${escapeHtml(domain)}</div>
      <div class="c-meta">${cookiesForDomain.length} cookie(s)</div>
      <div class="row-actions"><button data-remove-domain="${escapeHtml(domain)}">Supprimer pour ce domaine</button></div>
    `;
    el.querySelector('[data-remove-domain]').addEventListener('click', async () => {
      await api.removeCookiesForDomain(domain);
      renderCookiesPanel();
    });
    listEl.appendChild(el);
  });
}

document.getElementById('cookies-search').addEventListener('input', (e) => {
  const q = e.target.value.trim().toLowerCase();
  const filtered = allCookies.filter((c) => c.domain.toLowerCase().includes(q));
  paintCookiesList(filtered);
});

document.getElementById('cookies-clear-all-btn').addEventListener('click', async () => {
  await api.removeAllCookies();
  renderCookiesPanel();
});

async function setBlockThirdPartyCookies(value) {
  settings = await api.setSettings({ blockThirdPartyCookies: value });
  const cookiesPanelCheckbox = document.getElementById('block-third-party-cookies');
  if (cookiesPanelCheckbox) cookiesPanelCheckbox.checked = value;
  const settingsTab = findSettingsTab();
  if (settingsTab) {
    const cb = settingsTab.webview.querySelector('#settings-block-third-party');
    if (cb) cb.checked = value;
  }
}
document.getElementById('block-third-party-cookies').addEventListener('change', (e) => setBlockThirdPartyCookies(e.target.checked));

