// ============================================================
// Extensions — icônes épinglées et menu flottant
// ============================================================
// Chargement des extensions, icônes épinglées dans la barre d'adresse,
// menu déroulant de gestion rapide (activer/désactiver/installer).
//
// Dépend de (doit être chargé après) :
//   - dom-state.js
//   - utils.js
//   - openExtensionsTab/refreshExtensionsPage (extensions-page.js)
// ============================================================

// ============================================================
// Extensions — icônes épinglées + menu flottant + gestion
// ============================================================
async function loadExtensions() {
  extensionsCache = await api.getExtensions();
  renderExtensionIcons();
  return extensionsCache;
}

function extensionIconMarkup(ext) {
  return ext.icon
    ? `<img src="${ext.icon}" alt="" />`
    : '<i class="fa-solid fa-puzzle-piece"></i>';
}

// Jusqu'à 3 extensions activées apparaissent directement dans la barre
// d'adresse (comme les extensions épinglées de Chrome) ; au-delà, elles ne
// sont visibles que dans le menu flottant du bouton Extensions.
function renderExtensionIcons() {
  extensionIconsEl.innerHTML = '';
  const enabled = extensionsCache.filter((e) => e.enabled);
  enabled.slice(0, 3).forEach((ext) => {
    const btn = document.createElement('button');
    btn.className = 'ext-icon-btn';
    btn.title = ext.name;
    btn.innerHTML = extensionIconMarkup(ext);
    btn.addEventListener('click', (e) => { e.stopPropagation(); toggleExtensionsDropdown(); });
    extensionIconsEl.appendChild(btn);
  });
}

function renderExtensionsDropdown() {
  extensionsDropdownList.innerHTML = '';
  extensionsDropdownEmpty.classList.toggle('hidden', extensionsCache.length > 0);
  extensionsCache.forEach((ext) => {
    const row = document.createElement('div');
    row.className = 'ext-dropdown-item';
    row.innerHTML = `
      <span class="ext-icon-fallback" style="${ext.icon ? 'display:none' : ''}"><i class="fa-solid fa-puzzle-piece"></i></span>
      ${ext.icon ? `<img class="ext-icon" src="${ext.icon}" alt="" />` : ''}
      <span class="ext-name">${escapeHtml(ext.name)}</span>
      <label class="ext-switch" title="${ext.enabled ? 'Désactiver' : 'Activer'}">
        <input type="checkbox" ${ext.enabled ? 'checked' : ''} />
        <span class="ext-switch-track"></span>
      </label>
    `;
    row.querySelector('input').addEventListener('change', async (e) => {
      e.stopPropagation();
      await setExtensionEnabled(ext.id, e.target.checked);
    });
    extensionsDropdownList.appendChild(row);
  });
}

function toggleExtensionsDropdown() {
  const willOpen = extensionsDropdown.classList.contains('hidden');
  menuDropdown.classList.add('hidden');
  accountDropdown.classList.add('hidden');
  if (willOpen) renderExtensionsDropdown();
  extensionsDropdown.classList.toggle('hidden', !willOpen);
}

extensionsBtn.addEventListener('click', (e) => { e.stopPropagation(); toggleExtensionsDropdown(); });
extensionsViewAllBtn.addEventListener('click', () => {
  extensionsDropdown.classList.add('hidden');
  openExtensionsTab();
});

async function setExtensionEnabled(id, enabled) {
  const res = await api.toggleExtension(id, enabled);
  if (res.extensions) extensionsCache = res.extensions;
  renderExtensionIcons();
  renderExtensionsDropdown();
  const extTab = findExtensionsTab();
  if (extTab) refreshExtensionsPage(extTab.webview);
  if (!res.ok && res.error) alert(`Impossible d'activer l'extension : ${res.error}`);
}

async function removeExtensionById(id) {
  extensionsCache = await api.removeExtension(id);
  renderExtensionIcons();
  renderExtensionsDropdown();
  const extTab = findExtensionsTab();
  if (extTab) refreshExtensionsPage(extTab.webview);
}

async function installExtensionFromFolder(onDone) {
  const res = await api.installExtensionUnpacked();
  if (res.canceled) return;
  if (!res.ok) { alert(res.error || "Échec de l'installation de l'extension."); return; }
  extensionsCache = res.extensions;
  renderExtensionIcons();
  renderExtensionsDropdown();
  if (onDone) onDone();
}

