// ============================================================
// Recherche dans la page (Ctrl+F)
// ============================================================
// Ouverture/fermeture de la barre de recherche et navigation entre résultats.
//
// Dépend de (doit être chargé après) :
//   - dom-state.js
//   - tabs.js
// ============================================================


// ============================================================
// Recherche dans la page
// ============================================================
findBtn.addEventListener('click', () => { findBar.classList.remove('hidden'); findInput.focus(); });
findClose.addEventListener('click', closeFindBar);
function closeFindBar() {
  findBar.classList.add('hidden');
  findResults.textContent = '0/0';
  getActiveTab()?.webview.stopFindInPage('clearSelection');
}
findInput.addEventListener('keydown', (e) => {
  const tab = getActiveTab();
  if (!tab) return;
  if (e.key === 'Enter') tab.webview.findInPage(findInput.value, { forward: !e.shiftKey });
  else if (e.key === 'Escape') closeFindBar();
});
findNext.addEventListener('click', () => {
  const tab = getActiveTab();
  if (tab && findInput.value) tab.webview.findInPage(findInput.value, { forward: true, findNext: true });
});
findPrev.addEventListener('click', () => {
  const tab = getActiveTab();
  if (tab && findInput.value) tab.webview.findInPage(findInput.value, { forward: false, findNext: true });
});

