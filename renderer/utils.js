// ============================================================
// Fonctions utilitaires génériques
// ============================================================
// Petites fonctions pures, sans état, utilisées par (presque) tous les
// autres modules : normalisation d'URL, échappement HTML, conversion
// d'URL de fichier en chemin système, détection des fichiers médias.
//
// Dépend de (doit être chargé après) :
//   - settings (dom-state.js)
//   - api (dom-state.js)
// ============================================================

// ============================================================
// Simple Browser — logique principale (renderer process)
// ============================================================

const api = window.browserAPI;

// Ouvre un fichier téléchargé : les vidéos/audios passent par le lecteur
// intégré (main.js détecte l'extension), les autres fichiers via l'appli
// par défaut du système.
const MEDIA_EXTENSIONS = ['mp4','webm','ogg','mov','m4v','avi','mkv','flv','wmv','mp3','wav','aac','flac','m4a'];
function openDownloadFile(path) {
  const ext = (path.split('.').pop() || '').toLowerCase();
  if (MEDIA_EXTENSIONS.includes(ext)) api.openMedia(path);
  else api.openPath(path);
}
const BASE_DIR = location.href.substring(0, location.href.lastIndexOf('/') + 1);
const WEBVIEW_PRELOAD = BASE_DIR + 'webview-preload.js';


// ============================================================
// Utilitaires URL
// ============================================================
function looksLikeUrl(input) {
  const t = input.trim();
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(t)) return true; // tout schéma explicite : http://, https://, file://, ftp://...
  if (/^[\w-]+(\.[\w-]+)+(:\d+)?(\/\S*)?$/i.test(t)) return true;
  if (/^localhost(:\d+)?/i.test(t)) return true;
  return false;
}
function normalizeUrl(input) {
  const t = input.trim();
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(t)) return t; // déjà un schéma complet -> on ne touche à rien
  if (looksLikeUrl(t)) return /^https?:\/\//i.test(t) ? t : `https://${t}`;
  return `${settings.searchEngine}${encodeURIComponent(t)}`;
}
function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str || '';
  return div.innerHTML;
}
function hostOf(url) {
  try { return new URL(url).host; } catch { return ''; }
}


// Convertit une URL "file://" (renvoyée par la boîte de dialogue) en chemin
// système classique, pour être cohérent avec le chemin que reçoit déjà
// api.openMedia() côté téléchargements (voir openDownloadFile plus haut).
function fileUrlToPath(fileUrl) {
  if (!/^file:\/\//i.test(fileUrl)) return fileUrl; // déjà un chemin classique
  try {
    let p = decodeURIComponent(new URL(fileUrl).pathname);
    if (/^\/[a-zA-Z]:\//.test(p)) p = p.slice(1); // Windows : "/C:/..." -> "C:/..."
    return p;
  } catch (e) {
    return fileUrl;
  }
}
