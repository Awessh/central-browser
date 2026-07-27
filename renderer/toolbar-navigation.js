// ============================================================
// Barre d'outils : navigation (précédent/suivant/rechargement...)
// ============================================================
// Boutons précédent/suivant/recharger/accueil/nouvel onglet, barre
// d'adresse, et ouverture d'un fichier local (Ctrl+O).
//
// Dépend de (doit être chargé après) :
//   - dom-state.js
//   - utils.js
//   - tabs.js
//   - openStartTab (start-page.js)
// ============================================================


async function openLocalFile() {
  const url = await api.openFileDialog();
  if (!url) return;

  // Vidéo/audio : on ouvre le lecteur intégré plutôt que de charger le
  // fichier dans un onglet du navigateur.
  const ext = (url.split('.').pop() || '').toLowerCase().split('?')[0].split('#')[0];
  if (MEDIA_EXTENSIONS.includes(ext)) {
    api.openMedia(fileUrlToPath(url));
    return;
  }

  const tab = getActiveTab();
  if (tab) tab.webview.loadURL(url); else createTab(url);
}

// ============================================================
// Barre d'outils : navigation
// ============================================================
function updateNavButtons() {
  const tab = getActiveTab();
  if (!tab) return;
  backBtn.disabled = !tab.webview.canGoBack();
  forwardBtn.disabled = !tab.webview.canGoForward();
}

backBtn.addEventListener('click', () => getActiveTab()?.webview.goBack());
forwardBtn.addEventListener('click', () => getActiveTab()?.webview.goForward());
reloadBtn.addEventListener('click', () => {
  const tab = getActiveTab();
  if (!tab) return;
  tab.webview.isLoading() ? tab.webview.stop() : tab.webview.reload();
});
homeBtn.addEventListener('click', () => openStartTab());
newTabBtn.addEventListener('click', () => createTab(settings.homepage));

addressBar.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    const tab = getActiveTab();
    if (tab) tab.webview.loadURL(normalizeUrl(addressBar.value));
  }
});
addressBar.addEventListener('focus', () => addressBar.select());

