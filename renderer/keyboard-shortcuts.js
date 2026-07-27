// ============================================================
// Raccourcis clavier globaux
// ============================================================
// Tous les raccourcis Ctrl+... et la navigation entre onglets avec Ctrl+Tab.
//
// Dépend de (doit être chargé après) :
//   - dom-state.js
//   - tabs.js
//   - toolbar-zoom.js
//   - panels-toast.js
//   - history-page.js
//   - downloads-page.js
//   - bookmarks.js
//   - settings-page.js
//   - cookies.js
// ============================================================


// ============================================================
// Raccourcis clavier
// ============================================================


document.addEventListener('keydown', (e) => {
  const ctrl = e.ctrlKey || e.metaKey;
  if (!ctrl) return;

  const k = e.key.toLowerCase();
  if (k === 't' && !e.shiftKey) { e.preventDefault(); createTab(settings.homepage); }
  else if (k === 'w') { e.preventDefault(); if (activeTabId) closeTab(activeTabId); }
  else if (k === 'l') { e.preventDefault(); addressBar.focus(); addressBar.select(); }
  else if (k === 'r') { e.preventDefault(); getActiveTab()?.webview.reload(); }
  else if (k === 'f') { e.preventDefault(); findBar.classList.remove('hidden'); findInput.focus(); }
  else if (k === 'n' && e.shiftKey) { e.preventDefault(); api.newIncognitoWindow(); }
  else if (k === 'n') { e.preventDefault(); api.newWindow(); }
  else if (k === 'o' && !e.shiftKey) { e.preventDefault(); openLocalFile(); }
  else if (k === 'j') { e.preventDefault(); openDownloadsTab(); }
  else if (k === 'o' && e.shiftKey) { e.preventDefault(); openPanel('bookmarks-panel'); renderBookmarksPanel(); }
  else if (k === 'p') { e.preventDefault(); api.print(); }
  else if (k === 's') { e.preventDefault(); openSettingsTab(); }
  else if (k === 'k') { e.preventDefault(); openPanel('cookies-panel'); renderCookiesPanel(); }
  else if (k === 'h') { e.preventDefault(); openHistoryTab(); }
  else if (k === 'b') { e.preventDefault(); openToast(); }
  else if (e.key === '+' || e.key === '=') { e.preventDefault(); zoomBy(0.5); }
  else if (e.key === '-') { e.preventDefault(); zoomBy(-0.5); }
  else if (e.key === '0') { e.preventDefault(); zoomReset(); }
  else if (e.key === 'Tab') {
    e.preventDefault();
    const idx = tabs.findIndex((t) => t.id === activeTabId);
    const nextIdx = e.shiftKey ? (idx - 1 + tabs.length) % tabs.length : (idx + 1) % tabs.length;
    switchTab(tabs[nextIdx].id);
  }
});
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeAllPanels(); });

if (api.onOpenInNewTab) api.onOpenInNewTab((url) => createTab(url));
