// ============================================================
// Extensions — onglet dédié (browser://extensions)
// ============================================================
// Page complète : liste installée, activation/suppression, installation depuis un dossier, liens vers les stores.
//
// Dépend de (doit être chargé après) :
//   - dom-state.js
//   - utils.js
//   - tabs.js
//   - internal-page-stub.js
//   - extensions-widget.js
// ============================================================


// ============================================================
// Extensions — onglet complet (browser://extensions)
// ============================================================
const EXTENSIONS_PAGE_TEMPLATE = `
  <div class="spage-wrap">
    <div class="ext-page-header">
      <h1><i class="fa-solid fa-puzzle-piece"></i> Extensions</h1>
      <button class="ext-install-btn" id="ext-install-btn"><i class="fa-solid fa-folder-open"></i> Installer depuis un dossier</button>
    </div>

    <div class="ext-note">
      Chrome, Firefox, Edge... ne permettent d'installer leurs extensions que
      depuis leur propre navigateur. Ici, parcourez un store ci-dessous pour
      trouver l'extension souhaitée, téléchargez et décompressez son dossier,
      puis installez-la avec le bouton « Installer depuis un dossier » (le
      dossier doit contenir un fichier <code>manifest.json</code>).
    </div>

    <div class="settings-section">
      <h3>Mes extensions</h3>
      <div id="ext-installed-list"></div>
    </div>

    <div class="settings-section">
      <h3>Découvrir plus d'extensions</h3>
      <div class="ext-stores-grid" id="ext-stores-grid"></div>
    </div>
  </div>
`;

function findExtensionsTab() {
  return tabs.find((t) => t.isInternal && t.internalType === 'extensions');
}

function openExtensionsTab() {
  const existing = findExtensionsTab();
  if (existing) { switchTab(existing.id); refreshExtensionsPage(existing.webview); return existing; }
  return createExtensionsTab();
}

function createExtensionsTab() {
  tabCounter += 1;
  const id = `tab-${tabCounter}`;

  const tabEl = document.createElement('div');
  tabEl.className = 'tab';
  tabEl.dataset.id = id;
  tabEl.innerHTML = `
    <div class="favicon"><i class="fa-solid fa-puzzle-piece"></i></div>
    <div class="title">Extensions</div>
    <button class="close-tab" title="Fermer">&#10005;</button>
  `;
  tabEl.addEventListener('click', (e) => {
    if (e.target.closest('.close-tab')) return;
    switchTab(id);
  });
  tabEl.querySelector('.close-tab').addEventListener('click', () => closeTab(id));
  tabsEl.appendChild(tabEl);

  const page = document.createElement('div');
  page.className = 'internal-page extensions-page';
  page.innerHTML = EXTENSIONS_PAGE_TEMPLATE;
  makeInternalWebviewStub(page);
  page.getURL = () => 'browser://extensions';
  webviewsEl.appendChild(page);

  const tab = {
    id, webview: page, tabEl,
    title: 'Extensions', url: 'browser://extensions',
    isInternal: true, internalType: 'extensions',
  };
  tabs.push(tab);

  wireExtensionsPage(page);
  switchTab(id);
  refreshExtensionsPage(page);
  return tab;
}

function wireExtensionsPage(page) {
  page.querySelector('#ext-install-btn').addEventListener('click', () => {
    installExtensionFromFolder(() => refreshExtensionsPage(page));
  });

  const storesGrid = page.querySelector('#ext-stores-grid');
  EXTENSION_STORES.forEach((store) => {
    const card = document.createElement('button');
    card.className = 'ext-store-card';
    card.innerHTML = `
      <i class="${store.icon}"></i>
      <span>
        <div class="ext-store-name">${escapeHtml(store.name)}</div>
        <div class="ext-store-sub">${escapeHtml(store.sub)}</div>
      </span>
    `;
    card.addEventListener('click', () => createTab(store.url));
    storesGrid.appendChild(card);
  });

  page.__internalRefresh = () => refreshExtensionsPage(page);
}

async function refreshExtensionsPage(page) {
  if (!page) return;
  extensionsCache = await api.getExtensions();
  renderExtensionIcons();

  const listEl = page.querySelector('#ext-installed-list');
  listEl.innerHTML = '';
  if (extensionsCache.length === 0) {
    listEl.innerHTML = '<div class="ext-empty-state">Aucune extension installée pour le moment.</div>';
    return;
  }
  extensionsCache.forEach((ext) => {
    const card = document.createElement('div');
    card.className = 'ext-card';
    card.innerHTML = `
      ${ext.icon
        ? `<img class="ext-icon-lg" src="${ext.icon}" alt="" />`
        : '<span class="ext-icon-lg-fallback"><i class="fa-solid fa-puzzle-piece"></i></span>'}
      <div class="ext-info">
        <div class="ext-title-row">
          <span class="ext-name">${escapeHtml(ext.name)}</span>
          <span class="ext-version">${escapeHtml(ext.version || '')}</span>
        </div>
        ${ext.description ? `<div class="ext-desc">${escapeHtml(ext.description)}</div>` : ''}
        ${ext.loadError ? `<div class="ext-error">Erreur de chargement : ${escapeHtml(ext.loadError)}</div>` : ''}
      </div>
      <div class="ext-actions">
        <label class="ext-switch" title="${ext.enabled ? 'Désactiver' : 'Activer'}">
          <input type="checkbox" ${ext.enabled ? 'checked' : ''} />
          <span class="ext-switch-track"></span>
        </label>
        <button class="ext-remove-btn" title="Supprimer"><i class="fa-solid fa-trash"></i></button>
      </div>
    `;
    card.querySelector('input').addEventListener('change', async (e) => {
      await setExtensionEnabled(ext.id, e.target.checked);
    });
    card.querySelector('.ext-remove-btn').addEventListener('click', async () => {
      if (!confirm(`Supprimer l'extension « ${ext.name} » ?`)) return;
      await removeExtensionById(ext.id);
      refreshExtensionsPage(page);
    });
    listEl.appendChild(card);
  });
}
