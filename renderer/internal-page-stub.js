// ============================================================
// Stub d'API webview pour les pages internes
// ============================================================
// Donne à un simple <div> (page interne : historique, téléchargements,
// paramètres, extensions, accueil) la même interface que tab.webview,
// pour que le reste du code fonctionne sans distinction.
// ============================================================

// Donne au conteneur (une simple <div>, pas un <webview>) les mêmes
// méthodes que celles appelées ailleurs sur tab.webview, pour que le
// reste du code (navigation, zoom, recherche...) continue de fonctionner
// sans modification lorsqu'un onglet interne est actif.
function makeInternalWebviewStub(el) {
  el.canGoBack = () => false;
  el.canGoForward = () => false;
  el.goBack = () => {};
  el.goForward = () => {};
  el.isLoading = () => false;
  el.stop = () => {};
  el.reload = () => { if (el.__internalRefresh) el.__internalRefresh(); };
  el.loadURL = () => {};
  el.getURL = () => 'browser://downloads';
  el.setZoomLevel = () => {};
  el.getZoomLevel = () => 0;
  el.findInPage = () => {};
  el.stopFindInPage = () => {};
  el.executeJavaScript = async () => null;
  return el;
}

