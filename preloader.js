// ============================================================================
// PRELOADER — Central Browser
// L'animation d'intro est strictement séquentielle : le globe (1s), puis
// le "C" (1s, juste après), puis le texte vectorisé lettre par lettre
// (à la fin du "C"), soit environ 3200ms au total — entièrement gérée en
// CSS (voir preloader.css). Ce script se contente de :
//   1) attendre la fin de cette animation,
//   2) patienter encore 2s (le logo reste affiché, statique),
//   3) faire disparaître le preloader en fondu et le retirer du DOM pour
//      révéler l'onglet d'accueil.
// Chargé en tout premier dans index.html, avant les autres scripts, afin que
// l'écran de démarrage s'affiche immédiatement sans dépendre du reste de
// l'app (qui continue de s'initialiser normalement derrière).
// ============================================================================
(function () {
  var ANIMATION_DURATION_MS = 3200; // durée totale de la chorégraphie CSS
  var HOLD_AFTER_ANIMATION_MS = 4000; // pause demandée avant disparition
  var FADE_OUT_MS = 600; // doit correspondre à la transition de #preloader dans preloader.css

  function initPreloader() {
    var preloader = document.getElementById('preloader');
    if (!preloader) return;

    var totalDelay = ANIMATION_DURATION_MS + HOLD_AFTER_ANIMATION_MS;

    window.setTimeout(function hidePreloader() {
      preloader.classList.add('preloader-hidden');

      // Retire complètement l'élément du DOM une fois le fondu terminé
      // (libère les ressources et laisse l'onglet d'accueil interagir
      // normalement avec la souris/clavier).
      window.setTimeout(function removePreloader() {
        if (preloader && preloader.parentNode) {
          preloader.parentNode.removeChild(preloader);
        }
      }, FADE_OUT_MS + 50);
    }, totalDelay);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initPreloader);
  } else {
    initPreloader();
  }
})();
