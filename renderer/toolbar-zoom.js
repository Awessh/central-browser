// ============================================================
// Zoom de la page + plein écran
// ============================================================
// Zoom avant/arrière/reset (raccourcis + menu ☰) et bascule plein écran.
//
// Dépend de (doit être chargé après) :
//   - getActiveTab (tabs.js)
// ============================================================

// ============================================================
// Zoom (barre de raccourcis + menu ☰)
// ============================================================
// Electron/Chromium : zoomFactor = 1.2 ^ zoomLevel (niveau 0 = 100%)
function zoomLevelToPercent(level) {
  return Math.round(Math.pow(1.2, level || 0) * 100);
}
function updateZoomLabel() {
  const label = document.getElementById('zoom-level-label');
  if (!label) return;
  const tab = getActiveTab();
  const level = tab ? tab.webview.getZoomLevel() : 0;
  label.textContent = `${zoomLevelToPercent(level)}%`;
}
function zoomBy(delta) {
  const tab = getActiveTab();
  if (!tab) return;
  const next = Math.min(9, Math.max(-9, tab.webview.getZoomLevel() + delta));
  tab.webview.setZoomLevel(next);
  updateZoomLabel();
}
function zoomReset() {
  const tab = getActiveTab();
  if (!tab) return;
  tab.webview.setZoomLevel(0);
  updateZoomLabel();
}
function toggleAppFullscreen() {
  if (!document.fullscreenElement) {
    document.documentElement.requestFullscreen().catch(() => {});
  } else {
    document.exitFullscreen().catch(() => {});
  }
}
document.addEventListener('fullscreenchange', () => {
  const btn = document.querySelector('#zoom_div [data-action="fullscreen"] i');
  if (btn) btn.className = document.fullscreenElement ? 'fa-solid fa-compress' : 'fa-solid fa-expand';
});
