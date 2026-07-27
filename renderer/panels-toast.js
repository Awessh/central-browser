// ============================================================
// Ouverture/fermeture communes des panneaux latéraux et du menu applications
// ============================================================
// Fonctions génériques réutilisées par tous les panneaux (historique, téléchargements, favoris, cookies).
//
// Dépend de (doit être chargé après) :
//   - dom-state.js
// ============================================================

// ============================================================
// Panneaux latéraux (ouverture / fermeture communes)
// ============================================================
function openPanel(panelId) {
  document.querySelectorAll('.side-panel').forEach((p) => p.classList.add('hidden'));
  document.getElementById(panelId).classList.remove('hidden');
  panelOverlay.classList.remove('hidden');
}
function closeAllPanels() {
  document.querySelectorAll('.side-panel').forEach((p) => p.classList.add('hidden'));
  panelOverlay.classList.add('hidden');
}
panelOverlay.addEventListener('click', closeAllPanels);
document.querySelectorAll('.panel-close').forEach((btn) => {
  btn.addEventListener('click', () => closeAllPanels());
});

// ============================================================
// Cartes d'affichage (ouverture / fermeture communes)
// ============================================================

let appToastTimer = null;

function openToast(){
  clearTimeout(appToastTimer);
  menuDiv.classList.remove('hidden');
  appToastTimer = setTimeout(() => {
    appMenu.classList.remove('hidden');
  }, 200);
}

function closeToast(){
  clearTimeout(appToastTimer);
  appMenu.classList.add('hidden');
  appToastTimer = setTimeout(() => {
    menuDiv.classList.add('hidden');
  }, 200);
}

// Cliquer sur le fond sombre (en dehors de la carte blanche) ferme aussi le
// panneau — filet de sécurité en plus du bouton "X".
menuDiv.addEventListener('click', (e) => {
  if (e.target === menuDiv) closeToast();
});
