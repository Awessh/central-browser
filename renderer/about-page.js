// ============================================================
// À propos — onglet dédié (browser://about)
// ============================================================
// Page complète : version actuelle de l'application, recherche de mise à
// jour, et lancement de l'installation si une mise à jour a été
// téléchargée.
//
// Dépend de (doit être chargé après) :
//   - dom-state.js
//   - utils.js
//   - tabs.js
//   - internal-page-stub.js
// ============================================================

const ABOUT_PAGE_TEMPLATE = `
  <style>
    /* Styles propres à browser://about — les feuilles styles.css /
       styles-extra.css ne définissent rien pour cette page, donc tout est
       scopé ici plutôt que d'ajouter des classes globales à l'aveugle. */
    .about-card { max-width: 520px; }
    .about-app-row { display: flex; align-items: center; gap: 16px; margin-bottom: 20px; }
    .about-app-icon { font-size: 40px; opacity: 0.85; }
    .about-app-name { margin: 0 0 4px 0; }
    .about-app-version { opacity: 0.7; font-size: 13px; }
    .about-update-row { display: flex; align-items: center; gap: 14px; flex-wrap: wrap; margin-bottom: 8px; }
    .about-check-btn { width: auto; }
    .about-check-btn:disabled { opacity: 0.6; cursor: default; }
    .about-update-status { font-size: 13px; opacity: 0.85; }
    .about-install-btn {
      margin-top: 14px; border: none; border-radius: 6px; padding: 9px 16px;
      cursor: pointer; font-size: 13px; background: #2f7de1; color: #fff;
    }
    .about-install-btn:hover { background: #2569c4; }
    .about-install-btn.hidden { display: none; }
  </style>
  <div class="spage-wrap">
    <div class="hpage-header">
      <h1><i class="fa-solid fa-circle-info"></i> À propos</h1>
    </div>

    <div class="settings-section about-card">
      <div class="about-app-row">
        <i class="fa-solid fa-window-maximize about-app-icon"></i>
        <div>
          <h3 class="about-app-name">Central Browser</h3>
          <div class="about-app-version">Version <span id="about-version">…</span></div>
        </div>
      </div>

      <div class="about-update-row">
        <button id="about-check-btn" class="settings-nav-btn about-check-btn" type="button">
          <i class="fa-solid fa-arrows-rotate"></i> Rechercher des mises à jour
        </button>
        <div id="about-update-status" class="about-update-status">Statut inconnu.</div>
      </div>

      <button id="about-install-btn" class="about-install-btn hidden" type="button">
        <i class="fa-solid fa-rotate-right"></i> Redémarrer et installer la mise à jour
      </button>
    </div>
  </div>
`;

function findAboutTab() {
  return tabs.find((t) => t.isInternal && t.internalType === 'about');
}

function openAboutTab() {
  const existing = findAboutTab();
  if (existing) { switchTab(existing.id); refreshAboutPage(existing.webview); return existing; }
  return createAboutTab();
}

function createAboutTab() {
  tabCounter += 1;
  const id = `tab-${tabCounter}`;

  const tabEl = document.createElement('div');
  tabEl.className = 'tab';
  tabEl.dataset.id = id;
  tabEl.innerHTML = `
    <div class="favicon"><i class="fa-solid fa-circle-info"></i></div>
    <div class="title">À propos</div>
    <button class="close-tab" title="Fermer">&#10005;</button>
  `;
  tabEl.addEventListener('click', (e) => {
    if (e.target.closest('.close-tab')) return;
    switchTab(id);
  });
  tabEl.querySelector('.close-tab').addEventListener('click', () => closeTab(id));
  tabsEl.appendChild(tabEl);

  const page = document.createElement('div');
  page.className = 'internal-page about-page';
  page.innerHTML = ABOUT_PAGE_TEMPLATE;
  makeInternalWebviewStub(page);
  page.getURL = () => 'browser://about';
  webviewsEl.appendChild(page);

  const tab = {
    id, webview: page, tabEl,
    title: 'À propos', url: 'browser://about',
    isInternal: true, internalType: 'about',
  };
  tabs.push(tab);

  wireAboutPage(page);
  switchTab(id);
  refreshAboutPage(page);
  return tab;
}

function wireAboutPage(page) {
  page.querySelector('#about-check-btn').addEventListener('click', async () => {
    const status = await api.checkForUpdates();
    renderUpdateStatus(page, status);
  });

  page.querySelector('#about-install-btn').addEventListener('click', () => {
    api.installUpdate();
  });

  page.__internalRefresh = () => refreshAboutPage(page);
}

async function refreshAboutPage(page) {
  if (!page) return;
  const version = await api.getAppVersion();
  page.querySelector('#about-version').textContent = version || '—';

  const status = await api.getUpdateStatus();
  renderUpdateStatus(page, status);
}

// Traduit le statut brut envoyé par le processus principal en texte lisible
// et affiche/masque le bouton d'installation selon le cas.
function renderUpdateStatus(page, status) {
  if (!page || !status) return;
  const statusEl = page.querySelector('#about-update-status');
  const installBtn = page.querySelector('#about-install-btn');
  const checkBtn = page.querySelector('#about-check-btn');
  if (!statusEl) return;

  installBtn.classList.add('hidden');
  checkBtn.disabled = false;

  switch (status.state) {
    case 'checking':
      checkBtn.disabled = true;
      statusEl.innerHTML = '<i class="fa-solid fa-arrows-rotate fa-spin"></i> Recherche d\u2019une mise à jour…';
      break;
    case 'downloading':
      checkBtn.disabled = true;
      statusEl.innerHTML = status.info?.percent
        ? `<i class="fa-solid fa-arrows-rotate fa-spin"></i> Téléchargement de la version ${escapeHtml(status.version || '')}… (${status.info.percent}%)`
        : `<i class="fa-solid fa-arrows-rotate fa-spin"></i> Mise à jour ${escapeHtml(status.version || '')} disponible, téléchargement…`;
      break;
    case 'downloaded':
      statusEl.innerHTML = `<i class="fa-solid fa-circle-check"></i> Mise à jour ${escapeHtml(status.version || '')} prête à être installée.`;
      installBtn.classList.remove('hidden');
      break;
    case 'not-available':
      statusEl.innerHTML = '<i class="fa-solid fa-circle-check"></i> Vous utilisez la dernière version.';
      break;
    case 'error':
      statusEl.innerHTML = `<i class="fa-solid fa-triangle-exclamation"></i> Échec de la vérification${status.info?.message ? ` : ${escapeHtml(status.info.message)}` : ''}.`;
      break;
    case 'unsupported':
      statusEl.innerHTML = 'Les mises à jour automatiques ne sont pas disponibles dans cette version (mode développement).';
      checkBtn.disabled = true;
      break;
    default:
      statusEl.textContent = 'Statut inconnu.';
  }
}

// Le processus principal pousse les changements de statut (recherche en
// cours, téléchargement, terminé...) : on met à jour la page si elle est
// ouverte, sans que l'utilisateur ait besoin de la rafraîchir.
if (api.onUpdateStatus) {
  api.onUpdateStatus((status) => {
    const tab = findAboutTab();
    if (tab) renderUpdateStatus(tab.webview, status);
  });
}
