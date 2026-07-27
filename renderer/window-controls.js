// ============================================================
// Barre de titre personnalisée
// ============================================================
// Boutons minimiser / agrandir / fermer de la fenêtre, et double-clic
// sur la barre d'onglets pour agrandir/restaurer.
//
// Dépend de (doit être chargé après) :
//   - api, winMin/winMax/winClose (dom-state.js)
// ============================================================

// ============================================================
// Barre de titre custom (contrôles de fenêtre)
// ============================================================

winMin.addEventListener('click', () => api.windowMinimize());
winMax.addEventListener('click', () => api.windowMaximizeToggle());
winClose.addEventListener('click', () => api.windowClose());
api.onMaximizedState((isMax) => {
  winMax.innerHTML = isMax ? '<i class="fa-regular fa-window-restore"></i>' : '<i class="fa-regular fa-window-maximize"></i>';
  winMax.title = isMax ? 'Restaurer' : 'Agrandir';
});
document.getElementById('tabbar').addEventListener('dblclick', (e) => {
  if (e.target.closest('.tab') || e.target.closest('button')) return;
  api.windowMaximizeToggle();
});

