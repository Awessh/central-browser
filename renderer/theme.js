// ============================================================
// Thème (clair / sombre / système)
// ============================================================
// Applique la classe de thème sur <body> (theme-light / theme-dark) et,
// en mode "système", suit les changements de préférence du système
// d'exploitation en direct.
//
// Dépend de (doit être chargé après) :
//   - dom-state.js (variable `settings`)
// ============================================================

let __systemThemeMedia = null;

function applyTheme(theme) {
  const mode = theme || 'system';
  document.body.classList.remove('theme-light', 'theme-dark');

  if (mode === 'dark') {
    document.body.classList.add('theme-dark');
  } else if (mode === 'light') {
    document.body.classList.add('theme-light');
  } else {
    const prefersDark = !!(window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
    document.body.classList.add(prefersDark ? 'theme-dark' : 'theme-light');
  }

  watchSystemTheme();
}

// Si l'utilisateur est en mode "système", on réapplique le thème dès que
// l'OS bascule clair/sombre (ex : changement automatique jour/nuit).
function watchSystemTheme() {
  if (!window.matchMedia || __systemThemeMedia) return;
  __systemThemeMedia = window.matchMedia('(prefers-color-scheme: dark)');
  __systemThemeMedia.addEventListener('change', () => {
    if ((settings.theme || 'system') === 'system') applyTheme('system');
  });
}
