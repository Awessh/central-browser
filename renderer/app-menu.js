// ============================================================
// Menu principal (☰) + lancement des applications internes
// ============================================================
// Ouverture du menu 3-points et dispatch de ses actions, plus le menu
// flottant des « applications » (lecteur vidéo/audio, PDF, devtools).
//
// Dépend de (doit être chargé après) :
//   - dom-state.js
//   - tabs.js
//   - toolbar-zoom.js
//   - panels-toast.js
//   - history.js
//   - downloads.js
//   - bookmarks.js
//   - cookies.js
//   - settings-page.js
//   - extensions-page.js
//   - about-page.js
// ============================================================

// ============================================================
// Menu principal (3 points)
// ============================================================
menuBtn.addEventListener('click', () => {
  menuDropdown.classList.toggle('hidden');
  accountDropdown.classList.add('hidden');
});
document.addEventListener('click', (e) => {
  if (!menuDropdown.contains(e.target) && e.target !== menuBtn) menuDropdown.classList.add('hidden');
  if (!accountDropdown.contains(e.target) && e.target !== accountBtn) accountDropdown.classList.add('hidden');
  if (!translateDropdown.contains(e.target) && e.target !== translateBtn) translateDropdown.classList.add('hidden');
  if (!translateSelectBtn.contains(e.target) && !translateLangMenu.contains(e.target)) translateLangMenu.classList.add('hidden');
  if (!extensionsDropdown.contains(e.target) && !e.target.closest('#extensions-btn') && !e.target.closest('.ext-icon-btn')) {
    extensionsDropdown.classList.add('hidden');
  }
});

menuDropdown.addEventListener('click', (e) => {
  const action = e.target.closest('button')?.dataset.action;
  if (!action) return;
  
  // Le zoom doit rester utilisable sans que le panneau se referme à chaque clic.
  const keepMenuOpen = action === 'zoom-in' || action === 'zoom-out';
  if (!keepMenuOpen) menuDropdown.classList.add('hidden');

  switch (action) {
    case 'new-tab': createTab(settings.homepage); break;
    case 'new-window': api.newWindow(); break;
    case 'new-incognito': api.newIncognitoWindow(); break;
    case 'open-file': openLocalFile(); break;
    case 'history': openPanel('history-panel'); renderHistoryPreview(); break;
    case 'downloads': openDownloadsTab(); break;
    case 'bookmarks': openPanel('bookmarks-panel'); renderBookmarksPanel(); break;
    case 'cookies': openPanel('cookies-panel'); renderCookiesPanel(); break;
    case 'zoom-in': zoomBy(0.5); break;
    case 'zoom-out': zoomBy(-0.5); break;
    case 'fullscreen': toggleAppFullscreen(); break;
    case 'print': api.print(); break;
    case 'settings': openSettingsTab(); break;
    case 'extensions': openExtensionsTab(); break;
    case 'about': openAboutTab(); break;
    case 'applications': openToast(); break; 
    case 'quit': api.quitApp(); break;
  }
});

// Lance une des applications internes du navigateur (lecteur vidéo/audio,
// gestionnaire PDF, devtools...). Utilisée à la fois par le menu flottant
// des applications (icône "Applications" du menu ☰) et par la grille
// d'applications de la page d'accueil personnalisée.
function handleAppAction(action) {
   switch (action){
    case 'lecteur-audio': api.openAudioPlayer(); break;
    case 'lecteur-video': api.openVideoPlayer(); break;
    case 'gestion-pdf': api.openPdfManager(); break;
    case 'transfert-fichiers': api.openFileTransfer(); break; 
    case 'close-apps': closeToast(); return; // ne pas relancer closeToast() une 2e fois plus bas
    case 'devtools': {
      const tab = getActiveTab();
      if (!tab || !tab.webview) break;
      if (tab.webview.isDevToolsOpened && tab.webview.isDevToolsOpened()) tab.webview.closeDevTools();
      else tab.webview.openDevTools();
      break;
    }
   }
   closeToast();
}

appMenuDiv.addEventListener('click', (e) => {
   const action = e.target.closest('button')?.dataset.action;
   if (!action) return;

   handleAppAction(action);

})

downloadQuickBtn.addEventListener('click', () => { openPanel('downloads-panel'); renderDownloads(); });

closeAppBtn.addEventListener('click', closeToast);
