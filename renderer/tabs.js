// ============================================================
// Gestion des onglets (cœur du navigateur)
// ============================================================
// Création/fermeture/activation des onglets, écoute des événements du
// <webview> (navigation, favicon, titre, mots de passe...).
//
// Dépend de (doit être chargé après) :
//   - dom-state.js
//   - utils.js
//   - updateNavButtons/updateStarState (toolbar-navigation.js, bookmarks.js)
//   - findHistoryTab/refreshHistoryPage (history-page.js)
// ============================================================

// ============================================================
// Gestion des onglets
// ============================================================
function createTab(url, activate = true) {
  const target = url || settings.homepage || 'https://www.google.com';
  tabCounter += 1;
  const id = `tab-${tabCounter}`;

  const tabEl = document.createElement('div');
  tabEl.className = 'tab';
  tabEl.dataset.id = id;
  tabEl.draggable = true;
  tabEl.innerHTML = `
    <div class="favicon"></div>
    <div class="title">Nouvel onglet</div>
    <button class="close-tab" title="Fermer">&#10005;</button>
  `;
  tabEl.addEventListener('click', (e) => {
    if (e.target.closest('.close-tab')) return;
    switchTab(id);
  });
  tabEl.querySelector('.close-tab').addEventListener('click', () => closeTab(id));
  tabsEl.appendChild(tabEl);

  const webview = document.createElement('webview');
  webview.setAttribute('src', target);
  webview.setAttribute('allowpopups', 'true');
  webview.setAttribute('preload', WEBVIEW_PRELOAD);
  webview.setAttribute('partition', webviewPartition);
  webviewsEl.appendChild(webview);

  // isNewTabState : vrai tant qu'aucune navigation "utilisateur" n'a eu lieu
  // dans cet onglet (seul le chargement initial a eu lieu). La barre des
  // favoris n'est visible que dans cet état, comme un "nouvel onglet" Chrome.
  const tab = {
    id, webview, tabEl, title: 'Nouvel onglet', url: target, isNewTabState: true, navCount: 0,
    __thumbnail: null, // dernière miniature capturée (aperçu au survol, voir plus bas)
  };
  tabs.push(tab);
  attachWebviewEvents(tab);
  if (activate) switchTab(id);
  persistSessionNow();
  return tab;
}

function attachWebviewEvents(tab) {
  const { webview } = tab;

  webview.addEventListener('page-title-updated', (e) => {
    tab.title = e.title || tab.url;
    tab.tabEl.querySelector('.title').textContent = tab.title;
    if (tab.id === activeTabId) document.title = (isIncognito ? '(Privé) ' : '') + tab.title;
  });

  webview.addEventListener('did-navigate', (e) => {
    // La 1ère navigation correspond au chargement initial de l'onglet
    // (page d'accueil) : on reste en état "nouvel onglet". Toute navigation
    // suivante (site ouvert, recherche, favori, lien...) le fait quitter.
    tab.navCount += 1;
    if (tab.navCount > 1) tab.isNewTabState = false;
    onNavigate(tab, e.url);
  });
  webview.addEventListener('did-navigate-in-page', (e) => onNavigate(tab, e.url));

  webview.addEventListener('page-favicon-updated', (e) => {
    if (e.favicons && e.favicons.length) {
      tab.tabEl.querySelector('.favicon').style.background = `url(${e.favicons[0]}) center/contain no-repeat`;
    }
  });

  webview.addEventListener('did-start-loading', () => {
    if (tab.id === activeTabId) reloadBtn.innerHTML = '<i class="fa-solid fa-xmark"></i>';
  });
  webview.addEventListener('did-stop-loading', () => {
    if (tab.id === activeTabId) { reloadBtn.innerHTML = '<i class="fa-solid fa-arrow-rotate-right"></i>'; updateNavButtons(); }
  });

  // Échec de chargement (pas de connexion Internet, site introuvable,
  // serveur inaccessible...) : Chromium affiche par défaut une page vide et
  // silencieuse. On la remplace par un message clair, à la manière des
  // navigateurs grand public.
  webview.addEventListener('did-fail-load', (e) => {
    const { errorCode, errorDescription, validatedURL, isMainFrame } = e;
    if (!isMainFrame) return; // ignore les échecs de sous-ressources (images, scripts, pubs bloquées...)
    if (errorCode === -3) return; // ERR_ABORTED : navigation annulée (clic sur un lien, changement de page...), pas une vraie erreur
    showLoadErrorPage(tab, errorCode, errorDescription, validatedURL);
  });

  webview.addEventListener('found-in-page', (e) => {
    const { activeMatchOrdinal, matches } = e.result;
    findResults.textContent = `${activeMatchOrdinal}/${matches}`;
  });

  // Gestionnaire de mots de passe : réception d'identifiants détectés
  webview.addEventListener('ipc-message', (e) => {
    if (e.channel === 'credential-detected') {
      const { host, username, password } = e.args[0];
      if (!isIncognito && host && password) {
        api.savePassword({ host, username, password });
      }
    }
  });

  // Proposer le remplissage automatique au chargement d'une page
  webview.addEventListener('dom-ready', async () => {
    if (isIncognito) return;
    const host = hostOf(webview.getURL());
    if (!host) return;
    const creds = await api.getPasswordsForHost(host);
    if (creds && creds.length) {
      webview.send('autofill-credentials', creds[0]);
    }
  });
}

// Traduit les codes d'erreur réseau de Chromium (net::ERR_...) en message
// clair pour l'utilisateur. Retombe sur errorDescription si le code n'est
// pas reconnu.
function netErrorMessage(errorCode, errorDescription) {
  const messages = {
    '-2': "La page a été fermée avant la fin du chargement.",
    '-6': "Le fichier demandé n'a pas été trouvé.",
    '-21': "La connexion réseau a été interrompue pendant le chargement.",
    '-100': "La connexion au site a été fermée.",
    '-101': "La connexion a été réinitialisée.",
    '-102': "La connexion a été refusée par le serveur.",
    '-105': "Ce site n'a pas pu être trouvé : le nom de domaine est introuvable.",
    '-106': "Aucune connexion Internet. Vérifiez votre connexion réseau et réessayez.",
    '-107': "La connexion réseau a été interrompue.",
    '-108': "La connexion réseau a été perdue.",
    '-109': "L'adresse de ce site est inaccessible.",
    '-110': "Le délai de connexion au serveur proxy a été dépassé.",
    '-111': "La connexion au serveur proxy a été refusée.",
    '-113': "Aucune connexion réseau disponible.",
    '-118': "Le délai de connexion au serveur a été dépassé.",
    '-130': "Aucune connexion Internet.",
    '-137': "Le nom de domaine n'a pas pu être résolu.",
    '-200': "Le certificat de sécurité de ce site n'est pas valide.",
    '-201': "La connexion n'est pas sécurisée (certificat invalide).",
    '-501': "La connexion à ce site n'est pas totalement sécurisée.",
  };
  return messages[String(errorCode)]
    || (errorDescription ? `Une erreur est survenue : ${errorDescription}.` : 'Une erreur est survenue lors du chargement de la page.');
}

// Codes correspondant typiquement à une absence de connexion Internet (par
// opposition à un site en particulier qui serait en panne) : icône et titre
// légèrement différents pour le faire comprendre au premier coup d'œil.
const OFFLINE_ERROR_CODES = new Set([-21, -106, -109, -113, -130]);

// Remplace le contenu de la page (qui a échoué à charger) par un message
// d'erreur clair, avec un bouton pour réessayer.
//
// Important : on ne modifie PAS le document affiché par Chromium en cas
// d'échec (executeJavaScript() n'a aucun effet fiable sur sa page d'erreur
// interne — c'est ce qui causait la page grise sans message). On fait à la
// place une vraie navigation du <webview> vers une URL "data:" contenant
// notre page HTML : c'est la méthode standard, fiable à 100%, pour
// personnaliser une page d'erreur dans Electron.
function showLoadErrorPage(tab, errorCode, errorDescription, url) {
  const isOffline = OFFLINE_ERROR_CODES.has(errorCode);
  const icon = isOffline ? '📡' : '🌐';
  const title = isOffline ? 'Aucune connexion Internet' : "Impossible d'accéder à cette page";
  const message = netErrorMessage(errorCode, errorDescription);
  const safeUrl = escapeHtml(url || '');
  const failedUrl = url || tab.url || '';

  const html = `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="utf-8">
<title>${escapeHtml(title)}</title>
<style>
  html, body { height: 100%; margin: 0; background: #ffffff; }
  body {
    display: flex; align-items: center; justify-content: center;
    font-family: 'Segoe UI', Arial, sans-serif; color: #202124;
  }
  .error-box { max-width: 460px; text-align: center; padding: 32px; }
  .error-icon { font-size: 52px; margin-bottom: 16px; opacity: .8; }
  h1 { font-size: 20px; font-weight: 500; margin: 0 0 12px; }
  p { font-size: 14px; line-height: 1.5; color: #5f6368; margin: 0 0 6px; word-break: break-all; }
  .error-url { font-family: Consolas, 'Liberation Mono', Menlo, monospace; font-size: 13px; color: #80868b; }
  button {
    margin-top: 22px; padding: 9px 22px; border: 1px solid #dadce0; border-radius: 4px;
    background: #ffffff; color: #1a73e8; font-size: 14px; cursor: pointer;
  }
  button:hover { background: #f1f3f4; }
  .error-code { font-size: 12px; color: #9aa0a6; margin-top: 18px; }
</style>
</head>
<body>
  <div class="error-box">
    <div class="error-icon">${icon}</div>
    <h1>${escapeHtml(title)}</h1>
    <p>${escapeHtml(message)}</p>
    <p class="error-url">${safeUrl}</p>
    <button id="sb-retry-btn">Réessayer</button>
    <div class="error-code">Erreur réseau ${escapeHtml(String(errorCode))}${errorDescription ? ' — ' + escapeHtml(errorDescription) : ''}</div>
  </div>
  <script>
    document.getElementById('sb-retry-btn').addEventListener('click', () => {
      location.href = ${JSON.stringify(failedUrl)};
    });
  </script>
</body>
</html>`;

  // Marqueur consulté par onNavigate() : quand la navigation vers cette
  // data-URL se déclenchera, on affichera l'URL d'origine dans la barre
  // d'adresse (pas la data-URL) et on n'ajoutera rien à l'historique.
  tab.__errorPageFor = failedUrl;
  tab.title = title;
  if (tab.tabEl) {
    const titleEl = tab.tabEl.querySelector('.title');
    if (titleEl) titleEl.textContent = tab.title;
  }
  if (tab.id === activeTabId) document.title = (isIncognito ? '(Privé) ' : '') + tab.title;

  tab.webview.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));
}

function onNavigate(tab, url) {
  // Navigation vers notre propre page d'erreur (voir showLoadErrorPage) :
  // on affiche l'URL réellement demandée par l'utilisateur, pas la data-URL
  // technique, et on ne pollue pas l'historique de navigation avec.
  if (url && url.startsWith('data:text/html') && tab.__errorPageFor) {
    const failedUrl = tab.__errorPageFor;
    tab.url = failedUrl;
    if (tab.id === activeTabId) {
      addressBar.value = failedUrl;
      updateNavButtons();
      updateBookmarksBarVisibility();
      siteIcon.innerHTML = '<i class="fa-solid fa-triangle-exclamation"></i>';
    }
    return;
  }
  tab.__errorPageFor = null; // navigation réussie : on quitte l'état "page d'erreur"

  tab.url = url;
  if (tab.id === activeTabId) {
    addressBar.value = url;
    updateNavButtons();
    updateStarState();
    updateBookmarksBarVisibility();
    siteIcon.innerHTML = url.startsWith('https://') ? '<i class="fa-solid fa-lock"></i>' : '<i class="fa-solid fa-lock-open"></i>';
  }
  if (url && url !== 'about:blank' && !isIncognito) {
    api.addHistory({ url, title: tab.title });
    const hTab = findHistoryTab();
    if (hTab) refreshHistoryPage(hTab.webview);
  }
  persistSessionNow();
}

function switchTab(id) {
  // On capture une miniature de l'onglet qu'on quitte : c'est elle qui sera
  // utilisée pour son aperçu au survol tant qu'il n'est pas réactivé (le
  // <webview> d'un onglet inactif est display:none, donc pas capturable
  // "en direct" — exactement pourquoi Chrome utilise lui aussi un instantané
  // mis en cache, pas un flux live, pour ses aperçus d'onglets).
  const prevTab = getActiveTab();
  if (prevTab && prevTab.id !== id) captureTabThumbnail(prevTab);

  activeTabId = id;
  tabs.forEach((t) => {
    const active = t.id === id;
    t.tabEl.classList.toggle('active', active);
    t.webview.classList.toggle('active', active);
    if (active) { addressBar.value = t.url; document.title = (isIncognito ? '(Privé) ' : '') + t.title; }
  });
  updateNavButtons();
  updateStarState();
  updateZoomLabel();
  updateBookmarksBarVisibility();
}

// Barre des favoris : visible uniquement sur la page d'accueil (onglet
// "Accueil") et les nouveaux onglets encore vierges — masquée dès qu'un
// onglet affiche un site/contenu réel — ET seulement si le réglage
// Apparence > "Afficher la barre de favoris" est activé.
function updateBookmarksBarVisibility() {
  if (settings.showBookmarksBar === false) { bookmarksBar.classList.add('hidden'); return; }
  const tab = getActiveTab();
  bookmarksBar.classList.toggle('hidden', !(tab && tab.isNewTabState));
}

// ============================================================
// Réorganisation des onglets par cliquer-glisser
// ============================================================
// Repose sur l'API HTML5 Drag & Drop native (dragstart/dragover/dragend),
// pas de librairie externe. Principe : pendant le survol (dragover) d'un
// autre onglet, on déplace immédiatement l'élément DOM glissé à sa nouvelle
// position (avant ou après l'onglet survolé, selon la moitié de celui-ci
// où se trouve le curseur) -> l'utilisateur voit les onglets "s'écarter"
// en direct, comme dans Chrome/Edge/Firefox. Le tableau `tabs` (source de
// vérité pour l'ordre logique) n'est resynchronisé qu'une fois au drop, en
// le triant selon l'ordre final des éléments dans le DOM.
let __draggedTabEl = null;

function initTabDragAndDrop() {
  tabsEl.addEventListener('dragstart', (e) => {
    const tabEl = e.target.closest('.tab');
    if (!tabEl) return;
    __draggedTabEl = tabEl;
    // Nécessaire pour que certains navigateurs/OS autorisent le drag ;
    // la donnée elle-même n'est pas réutilisée (on travaille en mémoire).
    e.dataTransfer.effectAllowed = 'move';
    try { e.dataTransfer.setData('text/plain', tabEl.dataset.id); } catch { /* ignore */ }
    // Laisse le navigateur générer sa capture d'écran "fantôme" avant
    // qu'on applique le style semi-transparent, sinon celui-ci s'y retrouve.
    requestAnimationFrame(() => tabEl.classList.add('tab-dragging'));
  });

  tabsEl.addEventListener('dragover', (e) => {
    if (!__draggedTabEl) return;
    e.preventDefault(); // requis pour autoriser le drop
    const overEl = e.target.closest('.tab');
    if (!overEl || overEl === __draggedTabEl) return;
    const rect = overEl.getBoundingClientRect();
    const insertBefore = (e.clientX - rect.left) < rect.width / 2;
    const referenceEl = insertBefore ? overEl : overEl.nextSibling;
    if (referenceEl !== __draggedTabEl) tabsEl.insertBefore(__draggedTabEl, referenceEl);
  });

  // Permet aussi de déposer après le dernier onglet (zone vide à droite,
  // entre le dernier onglet et le bouton "+").
  tabsEl.addEventListener('dragover', (e) => {
    if (!__draggedTabEl || e.target.closest('.tab')) return;
    e.preventDefault();
    tabsEl.appendChild(__draggedTabEl);
  });

  tabsEl.addEventListener('drop', (e) => e.preventDefault());

  tabsEl.addEventListener('dragend', () => {
    if (!__draggedTabEl) return;
    __draggedTabEl.classList.remove('tab-dragging');
    __draggedTabEl = null;
    syncTabsOrderFromDom();
  });
}

// Retrie le tableau `tabs` pour qu'il reflète l'ordre visuel actuel des
// .tab dans le DOM (seule source de vérité pendant le glisser-déposer).
function syncTabsOrderFromDom() {
  const order = Array.from(tabsEl.children).map((el) => el.dataset.id);
  tabs.sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
  persistSessionNow();
}

initTabDragAndDrop();

// ============================================================
// Session (option de démarrage "Reprendre où vous en étiez")
// ============================================================
// Sauvegarde SYNCHRONE et IMMÉDIATE (pas d'anti-rebond, pas d'attente d'un
// événement de fermeture) à chaque changement de l'ensemble des onglets
// ouverts : création, fermeture, navigation. C'est volontairement plus
// "bavard" qu'un anti-rebond, mais ça élimine toute fenêtre de course —
// store.lastSession.urls sur le disque est TOUJOURS à jour, quelle que soit
// la façon dont le navigateur se ferme ensuite (bouton custom, Alt+F4,
// tâche tuée...). Le coût réel est négligeable : petite écriture JSON
// synchrone, déclenchée quelques fois par session, pas par frame.
function persistSessionNow() {
  if (isIncognito) return;
  try { api.saveSessionSync(currentSessionUrls()); } catch { /* ignore */ }
}

function currentSessionUrls() {
  return tabs
    .filter((t) => !t.isInternal && t.url && t.url !== 'about:blank')
    .map((t) => t.url);
}

// ============================================================
// Aperçu au survol d'un onglet
// ============================================================
// Délégation d'événements sur le conteneur des onglets : couvre aussi les
// onglets internes (paramètres, historique...) sans avoir à instrumenter
// chaque module qui crée un onglet.
let __hoverPreviewTimer = null;
let __hoverPreviewCurrentEl = null;

// Capture une miniature du contenu actuellement affiché par l'onglet et la
// met en cache sur celui-ci. Ne fait rien pour les onglets internes
// (Paramètres, Historique...), qui sont de simples <div> sans capturePage().
async function captureTabThumbnail(tab) {
  if (!tab || !tab.webview || typeof tab.webview.capturePage !== 'function') return;
  try {
    const image = await tab.webview.capturePage();
    if (image && !image.isEmpty()) tab.__thumbnail = image.toDataURL();
  } catch {
    // Capture indisponible (onglet en cours de fermeture, page pas encore
    // peinte...) : on garde la précédente miniature en cache, s'il y en a une.
  }
}

function applyThumbnailToPreview(thumbEl, tab) {
  if (tab.__thumbnail) {
    thumbEl.style.backgroundImage = `url("${tab.__thumbnail}")`;
    thumbEl.classList.remove('thp-thumb-empty');
    thumbEl.innerHTML = '';
  } else {
    thumbEl.style.backgroundImage = 'none';
    thumbEl.classList.add('thp-thumb-empty');
    thumbEl.innerHTML = `<i class="fa-solid ${tab.isInternal ? 'fa-gear' : 'fa-globe'}"></i>`;
  }
}

function showTabHoverPreview(tab, anchorEl) {
  const preview = document.getElementById('tab-hover-preview');
  if (!preview) return;
  preview.querySelector('.thp-title').textContent = tab.title || 'Nouvel onglet';
  preview.querySelector('.thp-url').textContent = tab.isInternal ? '' : (tab.url || '');
  preview.querySelector('.thp-url').classList.toggle('hidden', tab.isInternal);

  const rect = anchorEl.getBoundingClientRect();
  preview.classList.remove('hidden');
  const previewWidth = preview.offsetWidth || 220;
  const left = Math.min(Math.max(8, rect.left), window.innerWidth - previewWidth - 8);
  preview.style.left = `${left}px`;
  preview.style.top = `${rect.bottom + 6}px`;

  const thumbEl = preview.querySelector('.thp-thumb');
  applyThumbnailToPreview(thumbEl, tab);

  // Onglet actif sans miniature en cache (jamais quitté depuis sa création) :
  // il est actuellement visible à l'écran, donc capturable en direct.
  if (!tab.__thumbnail && tab.id === activeTabId) {
    captureTabThumbnail(tab).then(() => {
      const stillHovering = !preview.classList.contains('hidden')
        && __hoverPreviewCurrentEl && __hoverPreviewCurrentEl.dataset.id === tab.id;
      if (stillHovering) applyThumbnailToPreview(thumbEl, tab);
    });
  }
}

function hideTabHoverPreview() {
  document.getElementById('tab-hover-preview')?.classList.add('hidden');
}

tabsEl.addEventListener('mouseover', (e) => {
  const tabEl = e.target.closest('.tab');
  if (!tabEl || tabEl === __hoverPreviewCurrentEl) return;
  __hoverPreviewCurrentEl = tabEl;
  clearTimeout(__hoverPreviewTimer);
  if (settings.tabHoverPreview === false) return;
  __hoverPreviewTimer = setTimeout(() => {
    const t = tabs.find((x) => x.id === tabEl.dataset.id);
    if (t) showTabHoverPreview(t, tabEl);
  }, 450);
});
tabsEl.addEventListener('mouseout', (e) => {
  const tabEl = e.target.closest('.tab');
  if (!tabEl) return;
  const related = e.relatedTarget && e.relatedTarget.closest && e.relatedTarget.closest('.tab');
  if (related === tabEl) return;
  __hoverPreviewCurrentEl = null;
  clearTimeout(__hoverPreviewTimer);
  hideTabHoverPreview();
});



function closeTab(id) {
  const idx = tabs.findIndex((t) => t.id === id);
  if (idx === -1) return;
  const [tab] = tabs.splice(idx, 1);
  if (tab.webview.__clockTimer) clearInterval(tab.webview.__clockTimer);
  tab.tabEl.remove();
  tab.webview.remove();

  if (tabs.length === 0) { createTab(settings.homepage); return; }
  if (activeTabId === id) switchTab((tabs[idx] || tabs[idx - 1]).id);
  persistSessionNow();
}

function getActiveTab() { return tabs.find((t) => t.id === activeTabId); }

// Utilisé par l'historique/les favoris/les pages internes : si l'onglet actif
// est une page interne (téléchargements, historique...), on ne peut pas y
// charger une URL, donc on ouvre un nouvel onglet plutôt que de rester silencieux.
function openUrlSmart(url) {
  const tab = getActiveTab();
  if (!tab || tab.isInternal) createTab(url);
  else tab.webview.loadURL(url);
  closeAllPanels();
}

