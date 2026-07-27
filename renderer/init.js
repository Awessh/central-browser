// ============================================================
// Démarrage de l'application
// ============================================================
// Doit être chargé EN DERNIER : initialise l'état (incognito, session,
// paramètres, favoris, extensions) puis ouvre l'onglet de démarrage.
//
// Dépend de (doit être chargé après) :
//   - tous les modules précédents
// ============================================================


// ============================================================
// Démarrage
// ============================================================
(async function init() {
  isIncognito = await api.isIncognito();
  webviewPartition = await api.getWindowPartition();
  if (isIncognito) {
    document.body.classList.add('incognito');
    incognitoBadge.classList.remove('hidden');
  }
  api.googleStatus().then(applyAccountButtonIcon);

  settings = await api.getSettings();
  applyTheme(settings.theme);
  const data = await api.getAllData();
  bookmarks = data.bookmarks;
  renderBookmarksBar();
  loadExtensions();

  const isMax = await api.isWindowMaximized();
  winMax.innerHTML = isMax ? '&#10064;' : '&#9633;';

  // Si cette fenêtre a été ouverte depuis un menu contextuel ("Ouvrir le
  // lien dans une nouvelle fenêtre" / "...en navigation privée"), on ouvre
  // directement cette URL. Sinon, un lancement normal du navigateur suit
  // l'action de démarrage choisie dans Paramètres > Général (nouvel onglet,
  // reprise de session, ou page d'accueil) — la navigation privée ignore
  // toujours "reprendre"/"page d'accueil" et ouvre un nouvel onglet.
  const initialUrl = new URLSearchParams(location.search).get('initialUrl');
  if (initialUrl) {
    createTab(initialUrl);
  } else if (!isIncognito && settings.startupAction === 'resume') {
    const lastSession = await api.getLastSession();
    const urls = (lastSession && lastSession.urls) || [];
    if (urls.length) urls.forEach((u, i) => createTab(u, i === 0));
  else createStartTab();
  } else if (!isIncognito && settings.startupAction === 'homepage') {
    createTab(settings.homepage);
  } else {
    createStartTab();
  }
})();