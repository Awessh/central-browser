const {
  app, BrowserWindow, Menu, ipcMain, session, dialog, shell, webContents, safeStorage, clipboard,
} = require('electron');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const http = require('http');
const https = require('https');
const { spawn } = require('child_process');
const { fileURLToPath, pathToFileURL, URL } = require('url');

// Binaire FFmpeg embarqué (via ffmpeg-static) — utilisé pour convertir les
// formats non lus nativement par Chromium (MKV, AVI, FLV, WMV, ...) et pour
// générer les miniatures de la playlist vidéo.
let ffmpegPath = null;
try {
  ffmpegPath = require('ffmpeg-static');
  // En build packagé, ffmpeg-static est extrait de l'asar (voir asarUnpack).
  if (ffmpegPath && ffmpegPath.includes('app.asar') && !ffmpegPath.includes('app.asar.unpacked')) {
    ffmpegPath = ffmpegPath.replace('app.asar', 'app.asar.unpacked');
  }
} catch {
  ffmpegPath = null; // FFmpeg indisponible : la conversion sera simplement désactivée
}

// Bibliothèque pdf-lib — utilisée par le module Gestionnaire PDF (fusion,
// scission, organisation, filigrane/texte, compression de repli). Ajoutée
// aux dépendances de package.json : lance `npm install` si elle manque.
let pdfLib = null;
try {
  pdfLib = require('pdf-lib');
} catch {
  pdfLib = null; // Le Gestionnaire PDF affichera un message d'installation
}
function ensurePdfLib() {
  if (!pdfLib) {
    throw new Error(
      "Le module 'pdf-lib' est introuvable. À la racine du projet, lance `npm install` " +
      "(il a été ajouté à package.json) puis relance l'application.",
    );
  }
  return pdfLib;
}

// Bibliothèque "sharp" — ré-encodage d'images natif, chargé en mémoire dans
// le process Electron (aucun exécutable externe lancé). Contrairement à
// Ghostscript, ce module n'est jamais vu par Smart App Control : ce n'est
// pas un programme séparé qu'on spawn, mais du code qui tourne à l'intérieur
// de l'application elle-même. C'est le moteur de compression prioritaire ;
// Ghostscript reste disponible en repli/complément si présent sur le poste.
let sharpLib = null;
try {
  sharpLib = require('sharp');
} catch {
  sharpLib = null; // sharp absent : on retombera sur pdf-lib seul (gain plus modeste)
}

// Mises à jour automatiques (electron-updater) — vérifie, télécharge et
// installe les nouvelles versions publiées sur GitHub Releases. Absent en
// développement (`npm start`) : on ne l'active que sur une build packagée.
let autoUpdater = null;
try {
  autoUpdater = require('electron-updater').autoUpdater;
} catch {
  autoUpdater = null; // module absent : les mises à jour resteront manuelles
}

// Module Transfert de fichiers (module séparé, comme players/ et pdf-manager/) —
// aucune dépendance npm supplémentaire, uniquement des modules natifs de Node.
const { initFileTransfer } = require('./file-transfer/file-transfer-main');


// ------------------------------------------------------------
// Stockage local (bookmarks, historique, mots de passe, réglages)
// ------------------------------------------------------------
const DATA_PATH = path.join(app.getPath('userData'), 'browser-data.json');

const DEFAULT_STORE = {
  bookmarks: [],
  history: [],
  passwords: [],   // { id, host, username, password, updatedAt }
  downloads: [],   // { id, filename, path, url, state, startedAt }
  extensions: [],  // { id, name, version, description, icon, path, enabled, storeUrl, addedAt }
  media: {
    videoPlaylist: [], // { id, path, title, addedAt, duration, thumbnail }
    audioPlaylist: [], // { id, path, title, addedAt, duration }
    history: [],        // { id, path, type: 'video'|'audio', title, lastPlayedAt, position, duration }
  },
  lastSession: {
    urls: [], // URLs des onglets ouverts lors de la dernière fermeture (option "Reprendre où vous en étiez")
  },
  // Bloc-notes flottant : toujours accessible par-dessus les onglets, dans
  // n'importe quelle fenêtre. Les notes (texte, liens, images, vidéos,
  // fichiers) sont partagées entre toutes les fenêtres ouvertes.
  notepad: {
    items: [],          // { id, type: 'text'|'link'|'image'|'video'|'file', content, title, filePath, remoteUrl, addedAt }
    collapsed: true,     // replié (bulle) / déplié (panneau ouvert)
    position: null,      // { left, top } en pixels une fois déplacé par l'utilisateur (sinon position par défaut en bas à droite)
    size: null,           // { width, height } une fois redimensionné par l'utilisateur
  },
  settings: {
    homepage: 'https://www.google.com',
    searchEngine: 'https://www.google.com/search?q=',
    downloadDir: app.getPath('downloads'),
    googleAccount: null,           // { email }
    blockThirdPartyCookies: false, // gestion des cookies
    startupAction: 'newtab',       // 'newtab' | 'resume' | 'homepage' — action au démarrage du navigateur
    theme: 'system',               // 'system' | 'light' | 'dark'
    showBookmarksBar: true,        // afficher/masquer la barre de favoris
    tabHoverPreview: true,         // aperçu au survol d'un onglet
    floatingNotepadEnabled: true,  // activer/désactiver le bloc-notes flottant
    askWhereToSave: false,         // toujours demander où enregistrer les fichiers téléchargés
    translation: {
      provider: 'mymemory',          // 'mymemory' | 'google' — nécessite une clé API Google Cloud Translation
      email: '',                   // optionnel, augmente le quota MyMemory x10 (utilisé seulement si provider = 'mymemory')
      googleApiKey: '',            // requis pour provider = 'google' (console.cloud.google.com > Cloud Translation API)
      defaultTarget: 'fr',
    },
    // OAuth Google réel (Authorization Code + PKCE, flux "application installée")
    google: {
      clientId: '1040577776485-h42m8s7mg1juvjhk3qm4kdak14ngmpln.apps.googleusercontent.com',       // à renseigner : ID client OAuth "Application de bureau" (Google Cloud Console)
      clientSecret: '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',   // fourni par Google pour ce type de client (non confidentiel pour une appli installée)
      tokensEnc: null,    // jeton d'accès/rafraîchissement, chiffrés via safeStorage (liés à cette machine/ce compte OS)
    },
    // Synchronisation chiffrée de bout en bout via le dossier privé appDataFolder de Google Drive
    sync: {
      enabled: false,          // synchronisation automatique périodique
      salt: '',                // sel PBKDF2 (non secret), partagé via l'enveloppe distante
      wrappedKey: '',          // clé de chiffrement dérivée de la phrase de sync, enveloppée via safeStorage (confort local)
      lastSyncedAt: null,
      autoIntervalMinutes: 15,
    },
  },
};

function loadStore() {
  try {
    const raw = fs.readFileSync(DATA_PATH, 'utf-8');
    const parsed = JSON.parse(raw);
    const mergedSettings = { ...DEFAULT_STORE.settings, ...(parsed.settings || {}) };
    mergedSettings.google = { ...DEFAULT_STORE.settings.google, ...(parsed.settings || {}).google };
    mergedSettings.sync = { ...DEFAULT_STORE.settings.sync, ...(parsed.settings || {}).sync };
    mergedSettings.translation = { ...DEFAULT_STORE.settings.translation, ...(parsed.settings || {}).translation };
    const mergedMedia = {
      ...DEFAULT_STORE.media,
      ...(parsed.media || {}),
    };
    const mergedLastSession = { ...DEFAULT_STORE.lastSession, ...(parsed.lastSession || {}) };
    const mergedNotepad = {
      ...DEFAULT_STORE.notepad,
      ...(parsed.notepad || {}),
      items: Array.isArray((parsed.notepad || {}).items) ? parsed.notepad.items : [],
    };
    return {
      ...DEFAULT_STORE,
      ...parsed,
      settings: mergedSettings,
      media: mergedMedia,
      lastSession: mergedLastSession,
      notepad: mergedNotepad,
    };
  } catch {
    return JSON.parse(JSON.stringify(DEFAULT_STORE));
  }
}

let store = loadStore();
function persistStore() {
  fs.writeFileSync(DATA_PATH, JSON.stringify(store, null, 2), 'utf-8');
}

const fileTransfer = initFileTransfer({
  app, ipcMain, BrowserWindow, dialog, shell,
  preloadPath: path.join(__dirname, 'preload.js'),
});

// ------------------------------------------------------------
// Bloc-notes flottant : dossier local pour les images téléchargées
// depuis une page web (glisser une image d'une page ne fournit qu'une
// URL, pas un fichier -> on en fait une copie locale pour que la note
// reste consultable même hors-ligne ou si l'image disparaît du web).
// Les fichiers glissés depuis l'explorateur (déjà sur le disque) ne sont
// eux jamais dupliqués : on garde simplement leur chemin d'origine.
// ------------------------------------------------------------
const NOTEPAD_FILES_DIR = path.join(app.getPath('userData'), 'notepad-files');

function downloadToNotepadFile(url, redirectsLeft = 5) {
  return new Promise((resolve, reject) => {
    let parsed;
    try { parsed = new URL(url); } catch (e) { reject(e); return; }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      reject(new Error('Protocole non supporté')); return;
    }
    const mod = parsed.protocol === 'https:' ? https : http;
    const req = mod.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location && redirectsLeft > 0) {
        res.resume();
        const nextUrl = new URL(res.headers.location, url).toString();
        downloadToNotepadFile(nextUrl, redirectsLeft - 1).then(resolve, reject);
        return;
      }
      if (res.statusCode !== 200) { res.resume(); reject(new Error(`HTTP ${res.statusCode}`)); return; }
      try { fs.mkdirSync(NOTEPAD_FILES_DIR, { recursive: true }); } catch {}
      let ext = path.extname(parsed.pathname).split('?')[0];
      if (!/^\.[a-zA-Z0-9]{1,6}$/.test(ext)) {
        const ct = String(res.headers['content-type'] || '');
        ext = ct.includes('png') ? '.png' : ct.includes('gif') ? '.gif' : ct.includes('webp') ? '.webp' : '.jpg';
      }
      const destPath = path.join(NOTEPAD_FILES_DIR, `img-${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`);
      const fileStream = fs.createWriteStream(destPath);
      res.pipe(fileStream);
      fileStream.on('finish', () => fileStream.close(() => resolve(destPath)));
      fileStream.on('error', (err) => { fs.unlink(destPath, () => {}); reject(err); });
    });
    req.on('error', reject);
    req.setTimeout(15000, () => req.destroy(new Error('Délai dépassé')));
  });
}

function broadcastNotepadState() {
  const payload = { ...store.notepad, enabled: store.settings.floatingNotepadEnabled !== false };
  BrowserWindow.getAllWindows().forEach((w) => {
    if (!w.isDestroyed()) w.webContents.send('notepad:updated', payload);
  });
}

ipcMain.handle('notepad:get-state', () => ({
  ...store.notepad,
  enabled: store.settings.floatingNotepadEnabled !== false,
}));

ipcMain.handle('notepad:add-item', async (_e, payload = {}) => {
  const item = {
    id: `note-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    type: payload.type || 'text',
    content: payload.content || '',
    title: payload.title || '',
    filePath: null,
    remoteUrl: null,
    addedAt: Date.now(),
  };

  if (payload.srcPath) {
    // Fichier déjà sur le disque (glissé depuis l'explorateur de fichiers) :
    // on garde simplement son chemin, sans copie.
    item.filePath = payload.srcPath;
    item.title = item.title || path.basename(payload.srcPath);
  } else if (payload.type === 'image' && payload.remoteUrl) {
    // Image glissée depuis une page web : on tente une copie locale.
    try {
      item.filePath = await downloadToNotepadFile(payload.remoteUrl);
    } catch {
      item.remoteUrl = payload.remoteUrl; // repli : on garde juste l'URL distante
    }
  } else if (payload.remoteUrl) {
    item.remoteUrl = payload.remoteUrl;
  }

  store.notepad.items.unshift(item);
  if (store.notepad.items.length > 300) store.notepad.items.length = 300;
  persistStore();
  broadcastNotepadState();
  return item;
});

ipcMain.handle('notepad:update-item', (_e, { id, patch } = {}) => {
  const idx = store.notepad.items.findIndex((it) => it.id === id);
  if (idx !== -1) {
    store.notepad.items[idx] = { ...store.notepad.items[idx], ...patch };
    persistStore();
    broadcastNotepadState();
  }
  return store.notepad.items;
});

ipcMain.handle('notepad:remove-item', (_e, id) => {
  store.notepad.items = store.notepad.items.filter((it) => it.id !== id);
  persistStore();
  broadcastNotepadState();
  return store.notepad.items;
});

ipcMain.handle('notepad:clear-all', () => {
  store.notepad.items = [];
  persistStore();
  broadcastNotepadState();
  return store.notepad.items;
});

ipcMain.handle('notepad:set-ui-state', (_e, partial = {}) => {
  store.notepad = { ...store.notepad, ...partial, items: store.notepad.items };
  persistStore();
  broadcastNotepadState();
  return store.notepad;
});

let windows = [];

let activeDownloadItems = new Map();

// ------------------------------------------------------------
// Création de fenêtre
// ------------------------------------------------------------
function createWindow({ incognito = false, initialUrl = null } = {}) {
  const partition = incognito
    ? `incognito-${Date.now()}-${Math.random().toString(36).slice(2)}`
    : 'persist:main';

  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 760,
    minHeight: 460,
    frame: false,
    backgroundColor: incognito ? '#2b2a3d' : '#ffffff',
    icon: path.join(__dirname, 'build', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      webviewTag: true,
      sandbox: false,
      partition,
    },
  });

  win.isIncognito = incognito;
  win.partitionName = partition;
  Menu.setApplicationMenu(null);

  const sess = session.fromPartition(partition);
  attachDownloadHandler(sess, win);
  attachPrivacyControls(sess);

  const query = {};
  if (incognito) query.incognito = '1';
  if (initialUrl) query.initialUrl = initialUrl;
  win.loadFile('index.html', { query });

  win.on('maximize', () => win.webContents.send('window:maximized-state', true));
  win.on('unmaximize', () => win.webContents.send('window:maximized-state', false));
  win.on('closed', () => { windows = windows.filter((w) => w !== win); });

  windows.push(win);
  return win;
}

// ------------------------------------------------------------
// Téléchargements
// ------------------------------------------------------------
function attachDownloadHandler(sess, win) {
  sess.on('will-download', (_event, item) => {
    const id = `dl-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const targetDir = store.settings.downloadDir || app.getPath('downloads');
    try { fs.mkdirSync(targetDir, { recursive: true }); } catch {}
    const savePath = path.join(targetDir, item.getFilename());

    if (store.settings.askWhereToSave) {
      // Électron affiche lui-même une boîte de dialogue "Enregistrer sous"
      // avant de démarrer le téléchargement (aucun setSavePath() manuel).
      item.setSaveDialogOptions({ defaultPath: savePath });
    } else {
    item.setSavePath(savePath);
    }

    const entry = {
      id, 
      filename: item.getFilename(), 
      path: savePath, 
      url: item.getURL(),
      state: 'progressing', 
      receivedBytes: 0, 
      totalBytes: item.getTotalBytes(), 
      startedAt: Date.now(),
      speed: 0,
      estimatedTime: 0
    };

    activeDownloadItems.set(id, item);
    store.downloads.unshift(entry);
    persistStore();

    // 1. Ouverture automatique du panneau téléchargements et envoi au renderer
    win.webContents.send('downloads:update', entry);
    win.webContents.send('downloads:open-panel');

    let lastReceivedBytes = 0;
    let lastTime = Date.now();

    item.on('updated', (_e, state) => {
      const now = Date.now();
      const interval = (now - lastTime) / 1000; // en secondes
      const bytesReceivedSince = item.getReceivedBytes() - lastReceivedBytes;
      
      entry.state = state; // 'progressing' ou 'interrupted'
      entry.receivedBytes = item.getReceivedBytes();
      entry.totalBytes = item.getTotalBytes();
      entry.path = item.getSavePath() || entry.path; // chemin réel si choisi via la boîte "Enregistrer sous"
      
      if (interval > 0.3) {
        entry.speed = bytesReceivedSince / interval; // octets par seconde
        const remainingBytes = entry.totalBytes - entry.receivedBytes;
        entry.estimatedTime = entry.speed > 0 ? remainingBytes / entry.speed : 0;
        lastReceivedBytes = item.getReceivedBytes();
        lastTime = now;
      }

      win.webContents.send('downloads:update', entry);
      updateAppBadge(win);
    });

    item.once('done', (_e, state) => {
      entry.state = state; // 'completed', 'cancelled', 'interrupted'
      entry.receivedBytes = item.getReceivedBytes();
      entry.path = item.getSavePath() || entry.path;
      entry.speed = 0;
      entry.estimatedTime = 0;
      activeDownloadItems.delete(id);
      persistStore();

      win.webContents.send('downloads:update', entry);
      updateAppBadge(win);

      // Notification de fin de téléchargement
      if (state === 'completed') {
        win.webContents.send('downloads:notify', {
          title: 'Téléchargement terminé',
          body: entry.filename
        });
      }
    });
  });
}

// Gestion du badge sur l'icône de la fenêtre
function updateAppBadge(win) {
  const ongoing = store.downloads.filter(d => d.state === 'progressing').length;
  if (app.dock && typeof app.dock.setBadge === 'function') {
    app.dock.setBadge(ongoing > 0 ? `${ongoing}` : '');
  }
}

// ------------------------------------------------------------
// Gestion des cookies : blocage des cookies tiers (approximation
// standard : un cookie est "tiers" si son domaine ne correspond
// pas au domaine du site affiché dans l'onglet).
// ------------------------------------------------------------
function isThirdPartyRequest(details) {
  try {
    const reqHost = new URL(details.url).hostname;
    const wc = webContents.fromId(details.webContentsId);
    if (!wc) return false;
    const topHost = new URL(wc.getURL()).hostname;
    if (!topHost || !reqHost) return false;
    return reqHost !== topHost && !reqHost.endsWith(`.${topHost}`) && !topHost.endsWith(`.${reqHost}`);
  } catch { return false; }
}

function attachPrivacyControls(sess) {
  sess.webRequest.onBeforeSendHeaders((details, callback) => {
    if (store.settings.blockThirdPartyCookies && details.resourceType !== 'mainFrame' && isThirdPartyRequest(details)) {
      const headers = { ...details.requestHeaders };
      Object.keys(headers).forEach((k) => { if (k.toLowerCase() === 'cookie') delete headers[k]; });
      return callback({ requestHeaders: headers });
    }
    callback({ requestHeaders: details.requestHeaders });
  });

  sess.webRequest.onHeadersReceived((details, callback) => {
    if (store.settings.blockThirdPartyCookies && details.resourceType !== 'mainFrame' && isThirdPartyRequest(details)) {
      const headers = { ...details.responseHeaders };
      Object.keys(headers).forEach((k) => { if (k.toLowerCase() === 'set-cookie') delete headers[k]; });
      return callback({ responseHeaders: headers });
    }
    callback({ responseHeaders: details.responseHeaders });
  });
}

// ------------------------------------------------------------
// Visionneuse PDF premium (moteur pdf.js de Mozilla, embarqué)
// ------------------------------------------------------------
const PDFJS_VIEWER = path.join(__dirname, 'pdfjs', 'web', 'viewer.html');
const MAX_INLINE_PDF_BYTES = 45 * 1024 * 1024; // au-delà, on laisse Chromium gérer nativement

function isPdfUrl(url) {
  try {
    const clean = url.split('?')[0].split('#')[0];
    return clean.toLowerCase().endsWith('.pdf');
  } catch { return false; }
}

async function openPdfInViewer(contents, url) {
  try {
    let bytes;
    if (url.startsWith('file://')) {
      bytes = fs.readFileSync(fileURLToPath(url));
    } else {
      const res = await fetch(url);
      bytes = Buffer.from(await res.arrayBuffer());
    }
    if (bytes.length > MAX_INLINE_PDF_BYTES || !fs.existsSync(PDFJS_VIEWER)) {
      contents.loadURL(url);
      return;
    }
    const dataUri = `data:application/pdf;base64,${bytes.toString('base64')}`;
    const viewerUrl = `file://${PDFJS_VIEWER}?file=${encodeURIComponent(dataUri)}`;
    contents.loadURL(viewerUrl);
  } catch {
    contents.loadURL(url); // en cas d'échec, on retombe sur le comportement normal
  }
}

// ------------------------------------------------------------
// Menu contextuel (clic droit) sur le contenu web des onglets
// ------------------------------------------------------------

function hostWindowOf(contents) {
  return BrowserWindow.fromWebContents(contents.hostWebContents || contents) || windows[0];
}

// Propose un nom de fichier lisible à partir d'une URL (image, etc.)
function guessFilename(url, fallback = 'fichier') {
  try {
    if (url.startsWith('data:')) return fallback;
    const clean = decodeURIComponent(new URL(url).pathname.split('/').pop() || '');
    return clean && /\.[a-z0-9]{2,5}$/i.test(clean) ? clean : `${fallback}.png`;
  } catch { return fallback; }
}

async function fetchUrlBytes(url) {
  if (url.startsWith('data:')) {
    const base64 = url.split(',')[1] || '';
    return Buffer.from(base64, 'base64');
  }
  const res = await fetch(url);
  return Buffer.from(await res.arrayBuffer());
}

async function saveUrlAs(win, url, fallbackName) {
  try {
    const filename = guessFilename(url, fallbackName);
    const res = await dialog.showSaveDialog(win, {
      defaultPath: path.join(store.settings.downloadDir || app.getPath('downloads'), filename),
    });
    if (res.canceled || !res.filePath) return;
    const bytes = await fetchUrlBytes(url);
    fs.writeFileSync(res.filePath, bytes);
  } catch (err) {
    dialog.showErrorBox('Erreur', `Impossible d'enregistrer le fichier : ${err.message}`);
  }
}

async function savePageAs(win, contents) {
  try {
    const suggestedName = (contents.getTitle() || 'page').replace(/[\\/:*?"<>|]/g, '_');
    const res = await dialog.showSaveDialog(win, {
      defaultPath: path.join(store.settings.downloadDir || app.getPath('downloads'), `${suggestedName}.html`),
      filters: [{ name: 'Page web complète', extensions: ['html'] }],
    });
    if (res.canceled || !res.filePath) return;
    await contents.savePage(res.filePath, 'HTMLComplete');
  } catch (err) {
    dialog.showErrorBox('Erreur', `Impossible d'enregistrer la page : ${err.message}`);
  }
}

function attachContextMenu(contents) {
  contents.on('context-menu', (_event, params) => {
    const win = hostWindowOf(contents);
    const template = [];

    const hasLink = !!params.linkURL;
    const isImage = params.mediaType === 'image';
    const hasSelection = !!(params.selectionText && params.selectionText.trim());
    const isEditable = !!params.isEditable;

    // ---- Lien ----
    if (hasLink) {
      template.push(
        { label: 'Ouvrir le lien dans un nouvel onglet', click: () => win?.webContents.send('open-in-new-tab', params.linkURL) },
        { label: 'Ouvrir le lien dans une nouvelle fenêtre', click: () => createWindow({ incognito: false, initialUrl: params.linkURL }) },
        { label: 'Ouvrir le lien en navigation privée', click: () => createWindow({ incognito: true, initialUrl: params.linkURL }) },
        { type: 'separator' },
        { label: 'Copier l\'adresse du lien', click: () => clipboard.writeText(params.linkURL) },
      );
    }

    // ---- Image ----
    if (isImage) {
      if (template.length) template.push({ type: 'separator' });
      template.push(
        { label: 'Ouvrir l\'image dans un nouvel onglet', click: () => win?.webContents.send('open-in-new-tab', params.srcURL) },
        { label: 'Enregistrer l\'image sous...', click: () => saveUrlAs(win, params.srcURL, 'image') },
        { label: 'Copier l\'image', click: () => contents.copyImageAt(params.x, params.y) },
        { label: 'Copier l\'adresse de l\'image', click: () => clipboard.writeText(params.srcURL) },
      );
    }

    // ---- Texte sélectionné ----
    if (hasSelection && !isEditable) {
      if (template.length) template.push({ type: 'separator' });
      const trimmed = params.selectionText.trim();
      const shortText = trimmed.length > 30 ? `${trimmed.slice(0, 30)}…` : trimmed;
      template.push(
        { label: 'Copier', click: () => contents.copy() },
        {
          label: `Rechercher sur le web : « ${shortText} »`,
          click: () => {
            const engine = store.settings.searchEngine || 'https://www.google.com/search?q=';
            win?.webContents.send('open-in-new-tab', `${engine}${encodeURIComponent(trimmed)}`);
          },
        },
      );
    }

    // ---- Champ éditable ----
    if (isEditable) {
      if (template.length) template.push({ type: 'separator' });
      const f = params.editFlags || {};
      template.push(
        { label: 'Annuler', enabled: !!f.canUndo, click: () => contents.undo() },
        { label: 'Rétablir', enabled: !!f.canRedo, click: () => contents.redo() },
        { type: 'separator' },
        { label: 'Couper', enabled: !!f.canCut, click: () => contents.cut() },
        { label: 'Copier', enabled: !!f.canCopy, click: () => contents.copy() },
        { label: 'Coller', enabled: !!f.canPaste, click: () => contents.paste() },
        { label: 'Sélectionner tout', enabled: !!f.canSelectAll, click: () => contents.selectAll() },
      );
    }

    // ---- Page (rien de spécifique sous le curseur) ----
    if (!hasLink && !isImage && !hasSelection && !isEditable) {
      template.push(
        { label: 'Précédent', enabled: contents.canGoBack(), click: () => contents.goBack() },
        { label: 'Suivant', enabled: contents.canGoForward(), click: () => contents.goForward() },
        { label: 'Actualiser', click: () => contents.reload() },
        { type: 'separator' },
        { label: 'Enregistrer la page sous...', click: () => savePageAs(win, contents) },
        { label: 'Imprimer...', click: () => contents.print() },
        { type: 'separator' },
        { label: 'Copier l\'adresse de la page', click: () => clipboard.writeText(params.pageURL) },
      );
    }

    // ---- Toujours en bas ----
    template.push(
      { type: 'separator' },
      { label: 'Inspecter l\'élément', click: () => contents.inspectElement(params.x, params.y) },
    );

    Menu.buildFromTemplate(template).popup({ window: win });
  });
}

// ------------------------------------------------------------
// Lecteur vidéo et audio
// ------------------------------------------------------------
let videoPlayerWindow = null;
let audioPlayerWindow = null;
let currentVideoFile = null;
let currentAudioFile = null;

const VIDEO_EXTENSIONS = [".mp4",".webm",".ogg",".mov",".m4v",".avi",".mkv",".flv",".wmv"];
const AUDIO_EXTENSIONS = [".mp3",".wav",".aac",".flac",".m4a",".ogg"];

// Formats non lus nativement par Chromium : on les fait passer par FFmpeg
// (remuxage rapide sans ré-encodage, avec repli sur un ré-encodage complet).
const NEEDS_CONVERSION_EXT = ["mkv","avi","flv","wmv"];

const MEDIA_CACHE_DIR = path.join(app.getPath('userData'), 'media-cache');
const THUMBS_DIR = path.join(app.getPath('userData'), 'thumbnails');

// Scanne récursivement un dossier et retourne tous les fichiers média qui y
// sont trouvés (sous-dossiers compris), filtrés selon le type demandé
// (vidéo ou audio) et triés par nom de fichier.
function collectMediaFilesFromFolder(folderPath, type){

    const exts = type === "audio" ? AUDIO_EXTENSIONS : VIDEO_EXTENSIONS;
    const results = [];

    function walk(dir){

        let entries;
        try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }

        for (const entry of entries) {

            const full = path.join(dir, entry.name);

            if (entry.isDirectory()) {
                walk(full);
            } else if (entry.isFile()) {
                const ext = path.extname(entry.name).toLowerCase();
                if (exts.includes(ext)) results.push(full);
            }

        }

    }

    walk(folderPath);

    results.sort((a, b) => path.basename(a).localeCompare(path.basename(b), undefined, { numeric: true, sensitivity: "base" }));

    return results;

}

function ensureDir(p){ try{ fs.mkdirSync(p, { recursive:true }); }catch{} }

function hashPath(p){ return crypto.createHash('md5').update(p).digest('hex'); }

function needsConversion(filePath){
    const ext = path.extname(filePath).toLowerCase().replace('.', '');
    return NEEDS_CONVERSION_EXT.includes(ext);
}

function runFfmpeg(args){
    return new Promise((resolve, reject) => {
        if (!ffmpegPath) { reject(new Error('FFmpeg indisponible')); return; }
        const proc = spawn(ffmpegPath, args);
        let stderr = '';
        proc.stderr.on('data', (d) => { stderr += d.toString(); });
        proc.on('error', reject);
        proc.on('close', (code) => {
            if (code === 0) resolve(); else reject(new Error(stderr.slice(-800)));
        });
    });
}

// Retourne une URL file:// directement lisible par la balise <video>.
// Convertit à la volée (et met en cache) les formats non supportés nativement.
async function resolvePlayableUrl(filePath){

    if (!needsConversion(filePath) || !ffmpegPath) {
        return pathToFileURL(filePath).href;
    }

    ensureDir(MEDIA_CACHE_DIR);
    const outputPath = path.join(MEDIA_CACHE_DIR, hashPath(filePath) + '.mp4');

    if (fs.existsSync(outputPath) && fs.statSync(outputPath).size > 0) {
        return pathToFileURL(outputPath).href;
    }

    try {
        // 1) Remuxage rapide, sans ré-encodage (fonctionne si les flux internes
        //    sont déjà H.264/AAC, ce qui est fréquent dans les MKV/AVI/FLV).
        await runFfmpeg(['-y', '-i', filePath, '-c', 'copy', '-movflags', '+faststart', outputPath]);
    } catch {
        try { fs.unlinkSync(outputPath); } catch {}
        // 2) Repli : ré-encodage complet (plus lent, mais couvre WMV/VC-1/DivX...).
        await runFfmpeg(['-y', '-i', filePath, '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23', '-c:a', 'aac', '-movflags', '+faststart', outputPath]);
    }

    return pathToFileURL(outputPath).href;
}

async function generateThumbnail(filePath){

    if (!ffmpegPath) return null;

    ensureDir(THUMBS_DIR);
    const outputPath = path.join(THUMBS_DIR, hashPath(filePath) + '.jpg');

    if (fs.existsSync(outputPath) && fs.statSync(outputPath).size > 0) {
        return pathToFileURL(outputPath).href;
    }

    try {
        await runFfmpeg(['-y', '-ss', '00:00:01', '-i', filePath, '-frames:v', '1', '-vf', 'scale=200:-1', outputPath]);
    } catch {
        try {
            await runFfmpeg(['-y', '-ss', '00:00:00', '-i', filePath, '-frames:v', '1', '-vf', 'scale=200:-1', outputPath]);
        } catch {
            return null;
        }
    }

    if (fs.existsSync(outputPath) && fs.statSync(outputPath).size > 0) {
        return pathToFileURL(outputPath).href;
    }
    return null;
}

function playlistKey(type){ return type === 'audio' ? 'audioPlaylist' : 'videoPlaylist'; }

// Ajoute (ou retrouve) un fichier dans la playlist correspondante, et lance
// en arrière-plan la génération de sa miniature (vidéo uniquement).
function addToPlaylist(type, filePath){

    const key = playlistKey(type);
    const list = store.media[key];

    let entry = list.find((it) => it.path === filePath);
    if (entry) return entry;

    entry = {
        id: crypto.randomUUID(),
        path: filePath,
        title: path.basename(filePath),
        addedAt: Date.now(),
        thumbnail: null,
    };

    list.push(entry);
    persistStore();

    if (type === 'video') {
        generateThumbnail(filePath).then((thumb) => {
            if (!thumb) return;
            entry.thumbnail = thumb;
            persistStore();
            if (videoPlayerWindow && !videoPlayerWindow.isDestroyed()) {
                videoPlayerWindow.webContents.send('media:thumbnail-ready', { id: entry.id, thumbnail: thumb });
            }
        }).catch(() => {});
    }

    return entry;
}

// Ajoute/actualise une entrée d'historique (une seule ligne par fichier,
// remontée en tête de liste à chaque lecture) — sert aussi à la reprise
// automatique de lecture.
function addHistoryEntry(type, filePath, { position = 0, duration = 0 } = {}){

    const list = store.media.history;
    let entry = list.find((it) => it.path === filePath);

    if (entry) list.splice(list.indexOf(entry), 1);
    else entry = { id: crypto.randomUUID(), path: filePath, title: path.basename(filePath) };

    list.unshift(entry);

    entry.type = type;
    entry.lastPlayedAt = Date.now();
    if (typeof position === 'number') entry.position = position;
    if (duration) entry.duration = duration;

    if (list.length > 300) list.length = 300;

    persistStore();
    return entry;
}

function getResumePosition(filePath){
    const entry = store.media.history.find((it) => it.path === filePath);
    if (!entry || !entry.position || !entry.duration) return 0;
    // Pas de reprise si on est tout au début ou déjà proche de la fin
    if (entry.position < 5 || entry.position > entry.duration - 8) return 0;
    return entry.position;
}

function createVideoPlayerWindow(filePath){

    if (filePath) {
        currentVideoFile = filePath;
        addToPlaylist("video", filePath);
    }

    if(videoPlayerWindow){

        if (filePath) {
            if (videoPlayerWindow.webContents.isLoading()) {
                videoPlayerWindow.webContents.once("did-finish-load", () => {
                    videoPlayerWindow.webContents.send("load-video", filePath);
                });
            } else {
                videoPlayerWindow.webContents.send("load-video", filePath);
            }
        }

        videoPlayerWindow.focus();

        return;

    }

    videoPlayerWindow = new BrowserWindow({

        width:1300,

        height:760,

        minWidth:820,

        minHeight:520,

        autoHideMenuBar:true,

        webPreferences:{

            preload:path.join(__dirname,'preload.js'),

            contextIsolation:true,

            nodeIntegration:false
        }

    });

    videoPlayerWindow.loadFile("players/video/video-player.html").then(()=>{

        if (filePath && videoPlayerWindow) {
            videoPlayerWindow.webContents.send("load-video", filePath);
        }

    });

    videoPlayerWindow.on("closed",()=>{

        videoPlayerWindow=null;

    });

}

function createAudioPlayerWindow(filePath){

    if (filePath) {
        currentAudioFile = filePath;
        addToPlaylist("audio", filePath);
    }

    if(audioPlayerWindow){

        if (filePath) {
            if (audioPlayerWindow.webContents.isLoading()) {
                audioPlayerWindow.webContents.once("did-finish-load", () => {
                    audioPlayerWindow.webContents.send("load-audio", filePath);
                });
            } else {
                audioPlayerWindow.webContents.send("load-audio", filePath);
            }
        }

        audioPlayerWindow.focus();

        return;

    }

    audioPlayerWindow = new BrowserWindow({

        width:640,

        height:680,

        minWidth:460,

        minHeight:480,

        autoHideMenuBar:true,

        webPreferences:{

            preload:path.join(__dirname,'preload.js'),

            contextIsolation:true,

            nodeIntegration:false

        }

    });

    audioPlayerWindow.loadFile("players/audio/audio-player.html").then(()=>{

        if (filePath && audioPlayerWindow) {
            audioPlayerWindow.webContents.send("load-audio", filePath);
        }

    });

    audioPlayerWindow.on("closed",()=>{

        audioPlayerWindow=null;

    });

}

// ------------------------------------------------------------
// IPC — Lecteur video/audio
// ------------------------------------------------------------

ipcMain.handle("open-video-player",()=>{

    createVideoPlayerWindow();

});

ipcMain.handle("open-audio-player",()=>{

    createAudioPlayerWindow();

});

// Bouton "Ouvrir un fichier" dans la fenêtre du lecteur — sélection possible
// de plusieurs fichiers à la fois, tous ajoutés à la playlist.
ipcMain.handle("player:choose-file", async (event, type) => {

    const win = BrowserWindow.fromWebContents(event.sender);

    const filters = type === "audio"
        ? [{ name: "Fichiers audio", extensions: ["mp3","wav","aac","flac","m4a","ogg"] }]
        : [{ name: "Fichiers vidéo", extensions: ["mp4","webm","ogg","mov","m4v","avi","mkv","flv","wmv"] }];

    const res = await dialog.showOpenDialog(win, {
        properties: ["openFile", "multiSelections"],
        filters: [...filters, { name: "Tous les fichiers", extensions: ["*"] }],
    });

    if (res.canceled || !res.filePaths.length) return null;

    res.filePaths.forEach((p) => addToPlaylist(type, p));

    return { paths: res.filePaths };

});

// Bouton "Charger un dossier" dans la fenêtre du lecteur — scanne
// récursivement le dossier choisi et ajoute tous les fichiers média
// trouvés à la playlist.
ipcMain.handle("player:choose-folder", async (event, type) => {

    const win = BrowserWindow.fromWebContents(event.sender);

    const res = await dialog.showOpenDialog(win, {
        properties: ["openDirectory"],
    });

    if (res.canceled || !res.filePaths.length) return null;

    const added = collectMediaFilesFromFolder(res.filePaths[0], type);

    added.forEach((p) => addToPlaylist(type, p));

    return { paths: added };

});

// Glisser-déposer dans la fenêtre du lecteur : les éléments déposés peuvent
// être des fichiers isolés ET/OU des dossiers complets. Les dossiers sont
// scannés récursivement pour n'en garder que les fichiers média du type
// courant (vidéo ou audio).
ipcMain.handle("media:add-paths", (event, { type, paths }) => {

    const added = [];

    (paths || []).forEach((p) => {

        let stat;
        try { stat = fs.statSync(p); } catch { return; }

        if (stat.isDirectory()) {
            added.push(...collectMediaFilesFromFolder(p, type));
        } else if (stat.isFile()) {
            added.push(p);
        }

    });

    added.forEach((p) => addToPlaylist(type, p));

    return { playlist: store.media[playlistKey(type)], added };

});

// Point d'entrée unique pour "lire ce fichier" : ajoute à la playlist,
// résout l'URL lisible (avec conversion FFmpeg si besoin) et renvoie la
// position de reprise éventuelle. Utilisé par la playlist, le glisser-
// déposer, Suivant/Précédent, et l'ouverture de fichier.
ipcMain.handle("media:play-item", async (event, { type, filePath }) => {

    if (type === "audio") currentAudioFile = filePath;
    else currentVideoFile = filePath;

    const entry = addToPlaylist(type, filePath);
    const resumeAt = getResumePosition(filePath);

    try {

        const url = type === "video"
            ? await resolvePlayableUrl(filePath)
            : pathToFileURL(filePath).href;

        return { path: filePath, url, resumeAt, title: entry.title };

    } catch (err) {

        return { error: "conversion-failed", message: String((err && err.message) || err) };

    }

});

ipcMain.handle("media:get-library", () => store.media);

ipcMain.handle("media:add-files", (event, { type, filePaths }) => {
    (filePaths || []).forEach((p) => addToPlaylist(type, p));
    return store.media[playlistKey(type)];
});

ipcMain.handle("media:remove-item", (event, { type, id }) => {
    const key = playlistKey(type);
    store.media[key] = store.media[key].filter((it) => it.id !== id);
    persistStore();
    return store.media[key];
});

ipcMain.handle("media:clear-playlist", (event, type) => {
    store.media[playlistKey(type)] = [];
    persistStore();
    return [];
});

ipcMain.handle("media:reorder", (event, { type, orderedIds }) => {
    const key = playlistKey(type);
    const map = new Map(store.media[key].map((it) => [it.id, it]));
    store.media[key] = orderedIds.map((id) => map.get(id)).filter(Boolean);
    persistStore();
    return store.media[key];
});

ipcMain.handle("media:remove-history-item", (event, id) => {
    store.media.history = store.media.history.filter((it) => it.id !== id);
    persistStore();
    return store.media.history;
});

ipcMain.handle("media:clear-history", () => {
    store.media.history = [];
    persistStore();
    return [];
});

// Sauvegarde périodique de la position de lecture (reprise automatique).
ipcMain.handle("media:save-position", (event, { type, filePath, position, duration }) => {
    addHistoryEntry(type, filePath, { position, duration });
    return true;
});

ipcMain.handle("open-media", async (event, filePath) => {

    const extension = path.extname(filePath).toLowerCase();

    if(VIDEO_EXTENSIONS.includes(extension)){

        createVideoPlayerWindow(filePath);
        return;

    }

    if(AUDIO_EXTENSIONS.includes(extension)){

        createAudioPlayerWindow(filePath);

    }

});

// ------------------------------------------------------------
// Gestionnaire PDF (module séparé, comme players/) :
// Organiser, Fusionner, Compresser, Scinder, Modifier, Convertir
// ------------------------------------------------------------
let pdfManagerWindow = null;

function createPdfManagerWindow(filePath) {

    if (pdfManagerWindow) {
        pdfManagerWindow.focus();
        if (filePath) pdfManagerWindow.webContents.send('pdf-manager:open-file', filePath);
        return;
    }

    pdfManagerWindow = new BrowserWindow({
        width: 1200,
        height: 780,
        minWidth: 880,
        minHeight: 560,
        autoHideMenuBar: true,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false,
        },
    });

    pdfManagerWindow.loadFile('pdf-manager/pdf-manager.html').then(() => {
        if (filePath && pdfManagerWindow) pdfManagerWindow.webContents.send('pdf-manager:open-file', filePath);
    });

    pdfManagerWindow.on('closed', () => { pdfManagerWindow = null; });
}

// Lance un binaire externe (LibreOffice, Ghostscript) et attend sa fin.
// Sur Windows, shell:true n'est activé QUE pour une commande "nue" cherchée
// dans le PATH (ex : "gswin64c") — jamais pour un chemin complet, car le shell
// Windows coupe la commande au premier espace (ex : "C:\Program Files\...")
// et provoque l'erreur "'C:\Program' n'est pas reconnu...". Un chemin complet
// se lance très bien nativement, sans shell, espaces compris.
function needsWindowsShell(bin) {
    return process.platform === 'win32' && !bin.includes('\\') && !bin.includes('/');
}

// Une seule tentative de lancement. viaCmdWrapper=true encadre toute la ligne
// de commande de guillemets supplémentaires (astuce cmd.exe /s) — utile en
// dernier recours quand l'appel direct échoue avec un chemin contenant des
// espaces (ex : "C:\Program Files\gs\...").
function spawnAttempt(bin, args, opts, viaCmdWrapper) {
    return new Promise((resolve, reject) => {
        let proc;
        try {
            if (viaCmdWrapper) {
                const quote = (s) => `"${String(s).replace(/"/g, '\\"')}"`;
                const fullCmd = `"${quote(bin)} ${args.map(quote).join(' ')}"`;
                proc = spawn('cmd.exe', ['/d', '/s', '/c', fullCmd], opts);
            } else {
                proc = spawn(bin, args, { shell: needsWindowsShell(bin), ...opts });
            }
        } catch (err) { reject(err); return; }
        let stderr = '';
        proc.stderr?.on('data', (d) => { stderr += d.toString(); });
        proc.on('error', reject);
        proc.on('close', (code) => {
            if (code === 0) resolve(); else reject(new Error(stderr.slice(-1000) || `Code de sortie ${code}`));
        });
    });
}

// Lance un binaire externe (LibreOffice, Ghostscript) et attend sa fin.
// Si l'appel direct échoue (ex : "spawn UNKNOWN", fréquent sur certains PC
// Windows avec un chemin contenant des espaces), on retente automatiquement
// via un cmd.exe encadré de guillemets, plus tolérant dans ces cas-là.
async function runProcess(bin, args, opts = {}) {
    const fullOpts = { timeout: 180000, ...opts };
    try {
        await spawnAttempt(bin, args, fullOpts, false);
    } catch (firstErr) {
        if (process.platform !== 'win32') throw new Error(describeSpawnError(firstErr, bin));
        try {
            await spawnAttempt(bin, args, fullOpts, true);
        } catch (secondErr) {
            throw new Error(describeSpawnError(secondErr, bin));
        }
    }
}

function describeSpawnError(err, bin) {
    if (err && err.code === 'ENOENT') {
        return `Impossible de lancer "${bin}" : programme introuvable. Vérifie qu'il est bien installé, puis clique sur "Revérifier".`;
    }
    return `Impossible de lancer "${bin}" (${err?.code || err?.message || 'erreur inconnue'}). Vérifie l'installation du programme, puis clique sur "Revérifier".`;
}

// ---- Détection des outils externes optionnels (mis en cache) ----
let cachedSofficePath; // undefined = pas encore cherché, null = introuvable
let cachedGsPath;
let cachedWordAvailable; // undefined = pas encore cherché ; Windows + Word installé (COM) uniquement
let cachedExcelAvailable;

function trySpawnSyncVersion(bin, args) {
    try {
        const { spawnSync } = require('child_process');
        const res = spawnSync(bin, args, { timeout: 8000, windowsHide: true, shell: needsWindowsShell(bin) });
        return !!(res && !res.error && res.status === 0);
    } catch { return false; }
}

// Vérifie qu'un ProgID COM (ex : 'Word.Application') est enregistré dans le
// registre Windows — rapide, ne lance pas l'application. Windows uniquement :
// Word/Excel n'ont pas d'automation COM sur macOS/Linux (LibreOffice reste le
// repli multiplateforme dans ces cas).
function isComProgIdRegistered(progId) {
    if (process.platform !== 'win32') return false;
    try {
        const { spawnSync } = require('child_process');
        const res = spawnSync('reg.exe', ['query', `HKCR\\${progId}`], { timeout: 5000 });
        return !!(res && !res.error && res.status === 0);
    } catch { return false; }
}

function isWordAvailable() {
    if (cachedWordAvailable === undefined) cachedWordAvailable = isComProgIdRegistered('Word.Application');
    return cachedWordAvailable;
}

function isExcelAvailable() {
    if (cachedExcelAvailable === undefined) cachedExcelAvailable = isComProgIdRegistered('Excel.Application');
    return cachedExcelAvailable;
}

// Lance un script PowerShell temporaire pilotant Word/Excel par COM Automation.
async function runOfficeComScript(scriptBody, args) {
    const tmpDir = fs.mkdtempSync(path.join(app.getPath('temp'), 'office-com-'));
    const scriptPath = path.join(tmpDir, 'convert.ps1');
    fs.writeFileSync(scriptPath, scriptBody, 'utf8');
    try {
        await runProcess('powershell.exe', [
            '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass',
            '-File', scriptPath, ...args,
        ]);
    } finally {
        try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* ignore */ }
    }
}

// Word -> PDF (via Microsoft Word, COM Automation)
async function wordToPdfCom(inputPath, outputPath) {
    const script = `
param([string]$InputPath, [string]$OutputPath)
$ErrorActionPreference = "Stop"
$word = New-Object -ComObject Word.Application
$word.Visible = $false
try {
    $doc = $word.Documents.Open($InputPath)
    $doc.SaveAs([ref]$OutputPath, [ref]17) # wdFormatPDF
    $doc.Close()
} finally {
    $word.Quit()
}
`;
    await runOfficeComScript(script, [inputPath, outputPath]);
}

// PDF -> Word (Word sait ouvrir/reflow un PDF nativement depuis Word 2013)
async function pdfToWordCom(inputPath, outputPath) {
    const script = `
param([string]$InputPath, [string]$OutputPath)
$ErrorActionPreference = "Stop"
$word = New-Object -ComObject Word.Application
$word.Visible = $false
try {
    $doc = $word.Documents.Open($InputPath)
    $doc.SaveAs([ref]$OutputPath, [ref]16) # wdFormatDocumentDefault (.docx)
    $doc.Close()
} finally {
    $word.Quit()
}
`;
    await runOfficeComScript(script, [inputPath, outputPath]);
}

// Excel -> PDF (via Microsoft Excel, COM Automation)
async function excelToPdfCom(inputPath, outputPath) {
    const script = `
param([string]$InputPath, [string]$OutputPath)
$ErrorActionPreference = "Stop"
$excel = New-Object -ComObject Excel.Application
$excel.Visible = $false
$excel.DisplayAlerts = $false
try {
    $wb = $excel.Workbooks.Open($InputPath)
    $wb.ExportAsFixedFormat(0, $OutputPath) # xlTypePDF
    $wb.Close($false)
} finally {
    $excel.Quit()
}
`;
    await runOfficeComScript(script, [inputPath, outputPath]);
}

function locateSoffice() {
    if (cachedSofficePath !== undefined) return cachedSofficePath;

    const candidates = [];
    if (process.platform === 'win32') {
        candidates.push('soffice.exe', 'soffice');
        for (const base of [process.env['ProgramFiles'], process.env['ProgramFiles(x86)']].filter(Boolean)) {
            candidates.push(path.join(base, 'LibreOffice', 'program', 'soffice.exe'));
        }
    } else if (process.platform === 'darwin') {
        candidates.push('/Applications/LibreOffice.app/Contents/MacOS/soffice', 'soffice');
    } else {
        candidates.push('soffice', 'libreoffice', '/usr/bin/soffice', '/usr/bin/libreoffice');
    }

    for (const c of candidates) {
        const isPath = c.includes(path.sep);
        if (isPath && !fs.existsSync(c)) continue;
        if (trySpawnSyncVersion(c, ['--version'])) { cachedSofficePath = c; return c; }
    }
    cachedSofficePath = null;
    return null;
}

function locateGhostscript() {
    if (cachedGsPath !== undefined) return cachedGsPath;

    const candidates = process.platform === 'win32' ? ['gswin64c', 'gswin32c'] : ['gs'];
    for (const c of candidates) {
        if (trySpawnSyncVersion(c, ['-v'])) { cachedGsPath = c; return c; }
    }

    if (process.platform === 'win32') {
        for (const base of [process.env['ProgramFiles'], process.env['ProgramFiles(x86)']].filter(Boolean)) {
            const gsDir = path.join(base, 'gs');
            if (!fs.existsSync(gsDir)) continue;
            try {
                for (const version of fs.readdirSync(gsDir)) {
                    for (const exeName of ['gswin64c.exe', 'gswin32c.exe']) {
                        const exe = path.join(gsDir, version, 'bin', exeName);
                        if (fs.existsSync(exe)) { cachedGsPath = exe; return exe; }
                    }
                }
            } catch { /* ignore */ }
        }
    }
    cachedGsPath = null;
    return null;
}

// Convertit un fichier via LibreOffice headless (docx/xlsx/html <-> pdf).
// Renvoie le chemin du fichier produit, dans un dossier temporaire à nettoyer.
async function sofficeConvert(inputPath, targetExt) {
    const bin = locateSoffice();
    if (!bin) {
        throw new Error(
            "LibreOffice est introuvable sur ce PC. Installe-le gratuitement depuis " +
            "https://www.libreoffice.org/download puis réessaie (nécessaire pour les " +
            "conversions Word/Excel/HTML).",
        );
    }

    const tmpDir = fs.mkdtempSync(path.join(app.getPath('temp'), 'pdf-manager-'));
    try {
        await runProcess(bin, ['--headless', '--norestore', '--convert-to', targetExt, '--outdir', tmpDir, inputPath]);

        const base = path.basename(inputPath, path.extname(inputPath));
        let produced = path.join(tmpDir, `${base}.${targetExt}`);

        if (!fs.existsSync(produced)) {
            const match = fs.readdirSync(tmpDir).find((f) => f.toLowerCase().endsWith(`.${targetExt}`));
            if (!match) throw new Error("La conversion LibreOffice n'a produit aucun fichier de sortie.");
            produced = path.join(tmpDir, match);
        }

        return { producedPath: produced, tmpDir };
    } catch (err) {
        try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* ignore */ }
        throw err;
    }
}

// Conversion HTML -> PDF via le moteur natif d'Electron (aucune dépendance
// externe, meilleur rendu CSS que LibreOffice pour du contenu web).
async function convertHtmlToPdfNative(inputPath, outputPath) {
    const win = new BrowserWindow({ show: false, webPreferences: { offscreen: true } });
    try {
        await win.loadFile(inputPath);
        const data = await win.webContents.printToPDF({ printBackground: true, pageSize: 'A4', preferCSSPageSize: true });
        fs.writeFileSync(outputPath, data);
    } finally {
        if (!win.isDestroyed()) win.destroy();
    }
}

// "1-3,5,7-9" -> [[0,1,2],[4],[6,7,8]] (indices base 0), avec validation.
function parsePageRanges(str, pageCount) {
    const parts = String(str || '').split(',').map((s) => s.trim()).filter(Boolean);
    if (!parts.length) throw new Error('Indique au moins une page ou une plage de pages (ex : 1-3,5).');
    return parts.map((part) => {
        const m = part.match(/^(\d+)(?:-(\d+))?$/);
        if (!m) throw new Error(`Plage invalide : "${part}"`);
        const start = parseInt(m[1], 10);
        const end = m[2] ? parseInt(m[2], 10) : start;
        if (start < 1 || end > pageCount || start > end) {
            throw new Error(`Plage hors limites (le document a ${pageCount} page(s)) : "${part}"`);
        }
        const idx = [];
        for (let i = start; i <= end; i += 1) idx.push(i - 1);
        return idx;
    });
}

function hexToRgb01(hex) {
    const clean = (hex || '#FF0000').replace('#', '');
    const r = parseInt(clean.substring(0, 2), 16) / 255;
    const g = parseInt(clean.substring(2, 4), 16) / 255;
    const b = parseInt(clean.substring(4, 6), 16) / 255;
    return [r || 0, g || 0, b || 0];
}

// ---- Organiser : réordonner / tourner / supprimer les pages ----
async function pdfOrganize({ filePath, pages, outputPath }) {
    const { PDFDocument, degrees } = ensurePdfLib();
    const srcDoc = await PDFDocument.load(fs.readFileSync(filePath), { ignoreEncryption: true });
    const outDoc = await PDFDocument.create();

    const kept = (pages || []).filter((p) => !p.deleted);
    if (!kept.length) throw new Error('Impossible de produire un PDF sans aucune page.');

    const copiedPages = await outDoc.copyPages(srcDoc, kept.map((p) => p.index));
    copiedPages.forEach((page, i) => {
        const rotateBy = kept[i].rotate || 0;
        if (rotateBy) {
            const current = page.getRotation().angle || 0;
            page.setRotation(degrees(((current + rotateBy) % 360 + 360) % 360));
        }
        outDoc.addPage(page);
    });

    fs.writeFileSync(outputPath, await outDoc.save());
    return { pageCount: outDoc.getPageCount() };
}

// ---- Fusionner plusieurs PDF (dans l'ordre fourni) ----
async function pdfMerge({ filePaths, outputPath }) {
    const { PDFDocument } = ensurePdfLib();
    if (!filePaths || filePaths.length < 2) throw new Error('Sélectionne au moins deux fichiers PDF à fusionner.');

    const outDoc = await PDFDocument.create();
    for (const fp of filePaths) {
        const doc = await PDFDocument.load(fs.readFileSync(fp), { ignoreEncryption: true });
        const copied = await outDoc.copyPages(doc, doc.getPageIndices());
        copied.forEach((p) => outDoc.addPage(p));
    }

    fs.writeFileSync(outputPath, await outDoc.save());
    return { pageCount: outDoc.getPageCount() };
}

// ---- Scinder un PDF (plages personnalisées, toutes les N pages, ou une page par fichier) ----
async function pdfSplit({ filePath, mode, ranges, everyN, outputDir }) {
    const { PDFDocument } = ensurePdfLib();
    const srcDoc = await PDFDocument.load(fs.readFileSync(filePath), { ignoreEncryption: true });
    const pageCount = srcDoc.getPageCount();
    const base = path.basename(filePath, path.extname(filePath));
    ensureDir(outputDir);

    let groups;
    if (mode === 'ranges') {
        groups = parsePageRanges(ranges, pageCount);
    } else if (mode === 'every') {
        const n = Math.max(1, parseInt(everyN, 10) || 1);
        groups = [];
        for (let i = 0; i < pageCount; i += n) {
            const g = [];
            for (let j = i; j < Math.min(i + n, pageCount); j += 1) g.push(j);
            groups.push(g);
        }
    } else {
        groups = Array.from({ length: pageCount }, (_, i) => [i]);
    }

    const outFiles = [];
    for (let gi = 0; gi < groups.length; gi += 1) {
        const outDoc = await PDFDocument.create();
        const copied = await outDoc.copyPages(srcDoc, groups[gi]);
        copied.forEach((p) => outDoc.addPage(p));
        const outPath = path.join(outputDir, `${base}_partie${gi + 1}.pdf`);
        fs.writeFileSync(outPath, await outDoc.save());
        outFiles.push(outPath);
    }
    return { files: outFiles };
}

// ---- Compresser : ré-encodage des images JPEG intégrées en natif (sharp),
// directement dans le process Electron. Aucun exécutable externe n'est
// lancé : ce moteur fonctionne donc identiquement que Smart App Control
// (Windows 11) soit actif ou non. Renvoie null si sharp est absent ou si
// aucune image compressible n'a été trouvée, pour laisser la place au repli.
async function pdfCompressNative({ filePath, level, outputPath }) {
    if (!sharpLib) return null;

    const { PDFDocument, PDFName, PDFRawStream } = ensurePdfLib();
    const doc = await PDFDocument.load(fs.readFileSync(filePath), { ignoreEncryption: true, updateMetadata: false });

    const qualityMap = { low: 40, medium: 65, high: 80 };
    const maxDimMap = { low: 1000, medium: 1500, high: 2200 };
    const quality = qualityMap[level] || 65;
    const maxDim = maxDimMap[level] || 1500;

    let touched = 0;
    for (const [, obj] of doc.context.enumerateIndirectObjects()) {
        if (!(obj instanceof PDFRawStream)) continue;
        const dict = obj.dict;
        const subtype = dict.get(PDFName.of('Subtype'));
        if (!subtype || subtype.toString() !== '/Image') continue;

        const filter = dict.get(PDFName.of('Filter'));
        const filterStr = filter ? filter.toString() : '';
        // On ne retouche que les images déjà en JPEG (DCTDecode) : leurs octets
        // bruts sont un JPEG valide qu'on peut redécoder/recompresser tel quel.
        // Les autres encodages (bitmaps FlateDecode, etc.) sont laissés intacts
        // pour ne jamais risquer de corrompre une image mal interprétée.
        if (!filterStr.includes('DCTDecode')) continue;

        try {
            const raw = Buffer.from(obj.contents);
            const meta = await sharpLib(raw).metadata();
            let pipeline = sharpLib(raw).jpeg({ quality, mozjpeg: true });
            if (meta.width > maxDim || meta.height > maxDim) {
                pipeline = pipeline.resize({ width: maxDim, height: maxDim, fit: 'inside', withoutEnlargement: true });
            }
            const newBuf = await pipeline.toBuffer();
            if (newBuf.length >= raw.length) continue; // pas de gain : on garde l'original

            obj.contents = newBuf;
            dict.set(PDFName.of('Length'), doc.context.obj(newBuf.length));
            if (meta.width > maxDim || meta.height > maxDim) {
                const newMeta = await sharpLib(newBuf).metadata();
                dict.set(PDFName.of('Width'), doc.context.obj(newMeta.width));
                dict.set(PDFName.of('Height'), doc.context.obj(newMeta.height));
            }
            touched += 1;
        } catch {
            // Image illisible par sharp (colorspace exotique, JPEG corrompu…) :
            // on la laisse inchangée plutôt que de risquer un PDF cassé.
        }
    }

    if (touched === 0) return null; // rien à compresser : laisse le repli s'en charger

    const before = fs.statSync(filePath).size;
    fs.writeFileSync(outputPath, await doc.save({ useObjectStreams: true }));
    const after = fs.statSync(outputPath).size;
    return { engine: 'sharp', before, after };
}

// ---- Compresser : sharp (natif, prioritaire) → Ghostscript (si présent,
// souvent plus poussé) → pdf-lib seul (repli minimal, toujours disponible).
async function pdfCompress({ filePath, level, outputPath }) {
    const before = fs.statSync(filePath).size;

    const native = await pdfCompressNative({ filePath, level, outputPath });
    if (native) return native;

    const gsBin = locateGhostscript();
    if (gsBin) {
        const settingMap = { low: '/screen', medium: '/ebook', high: '/printer' };
        await runProcess(gsBin, [
            '-sDEVICE=pdfwrite', '-dCompatibilityLevel=1.4',
            `-dPDFSETTINGS=${settingMap[level] || '/ebook'}`,
            '-dNOPAUSE', '-dQUIET', '-dBATCH',
            `-sOutputFile=${outputPath}`, filePath,
        ]);
        const after = fs.statSync(outputPath).size;
        return { engine: 'ghostscript', before, after };
    }

    // Dernier repli, sans dépendance externe : pdf-lib ne réencode pas les
    // images, mais réécrit le fichier avec des flux compressés et purge les
    // objets inutilisés — gain modeste, garanti quoi qu'il arrive.
    const { PDFDocument } = ensurePdfLib();
    const doc = await PDFDocument.load(fs.readFileSync(filePath), { ignoreEncryption: true, updateMetadata: false });
    fs.writeFileSync(outputPath, await doc.save({ useObjectStreams: true }));
    const after = fs.statSync(outputPath).size;
    return {
        engine: 'pdf-lib',
        before,
        after,
        warning: !sharpLib
            ? "Le module 'sharp' est introuvable : compression d'images limitée. Lance " +
              "`npm install sharp` à la racine du projet puis relance l'application."
            : "Aucune image JPEG compressible détectée dans ce PDF : seule la structure a été optimisée.",
    };
}

// ---- Modifier : filigrane / texte libre ----
async function pdfAddWatermark({ filePath, text, opacity, fontSize, color, rotationDeg, position, pagesSpec, outputPath }) {
    const { PDFDocument, rgb, degrees, StandardFonts } = ensurePdfLib();
    if (!text || !text.trim()) throw new Error('Indique le texte du filigrane.');

    const doc = await PDFDocument.load(fs.readFileSync(filePath), { ignoreEncryption: true });
    const font = await doc.embedFont(StandardFonts.HelveticaBold);
    const pageCount = doc.getPageCount();
    const targetIndices = pagesSpec && pagesSpec.trim()
        ? parsePageRanges(pagesSpec, pageCount).flat()
        : doc.getPageIndices();
    const [r, g, b] = hexToRgb01(color);
    const size = fontSize || 40;

    targetIndices.forEach((idx) => {
        const page = doc.getPage(idx);
        const { width, height } = page.getSize();
        const textWidth = font.widthOfTextAtSize(text, size);
        let x;
        let y;
        switch (position) {
            case 'top-left': x = 24; y = height - size - 16; break;
            case 'top-right': x = width - textWidth - 24; y = height - size - 16; break;
            case 'bottom-left': x = 24; y = 24; break;
            case 'bottom-right': x = width - textWidth - 24; y = 24; break;
            default: x = (width - textWidth) / 2; y = height / 2;
        }
        page.drawText(text, {
            x, y, size, font, color: rgb(r, g, b),
            opacity: typeof opacity === 'number' ? opacity : 0.35,
            rotate: degrees(rotationDeg || 0),
        });
    });

    fs.writeFileSync(outputPath, await doc.save());
    return { pageCount };
}

// ---- Modifier : insertion de pages blanches ----
async function pdfInsertBlankPages({ filePath, afterPage, count, outputPath }) {
    const { PDFDocument } = ensurePdfLib();
    const doc = await PDFDocument.load(fs.readFileSync(filePath), { ignoreEncryption: true });
    const pageCount = doc.getPageCount();
    const insertAt = Math.min(Math.max(0, afterPage || 0), pageCount);
    const n = Math.max(1, parseInt(count, 10) || 1);

    const refPage = pageCount ? doc.getPage(Math.max(0, insertAt - 1)) : null;
    const size = refPage ? refPage.getSize() : { width: 595.28, height: 841.89 }; // A4 par défaut

    for (let i = 0; i < n; i += 1) doc.insertPage(insertAt + i, [size.width, size.height]);

    fs.writeFileSync(outputPath, await doc.save());
    return { pageCount: doc.getPageCount() };
}

// ---- Conversion (Word/Excel/HTML <-> PDF) ----
// Priorité à Microsoft Office (COM, Windows) s'il est installé — sinon repli
// automatique sur LibreOffice. PDF -> Excel et PDF -> HTML n'ont pas
// d'équivalent fiable côté Office COM : LibreOffice reste utilisé dans ces cas.
async function copyProducedFile(producedPath, tmpDir, outputPath) {
    try {
        fs.copyFileSync(producedPath, outputPath);
    } finally {
        try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* ignore */ }
    }
}

async function pdfConvertFile({ filePath, targetFormat, outputPath }) {
    const srcExt = path.extname(filePath).slice(1).toLowerCase();

    // HTML -> PDF : moteur natif Electron, aucune dépendance externe.
    if (targetFormat === 'pdf' && ['html', 'htm'].includes(srcExt)) {
        await convertHtmlToPdfNative(filePath, outputPath);
        return { outputPath, engine: 'electron' };
    }

    // Word -> PDF
    if (targetFormat === 'pdf' && ['docx', 'doc'].includes(srcExt)) {
        if (isWordAvailable()) {
            await wordToPdfCom(filePath, outputPath);
            return { outputPath, engine: 'word' };
        }
        const { producedPath, tmpDir } = await sofficeConvert(filePath, 'pdf');
        await copyProducedFile(producedPath, tmpDir, outputPath);
        return { outputPath, engine: 'libreoffice' };
    }

    // Excel -> PDF
    if (targetFormat === 'pdf' && ['xlsx', 'xls'].includes(srcExt)) {
        if (isExcelAvailable()) {
            await excelToPdfCom(filePath, outputPath);
            return { outputPath, engine: 'excel' };
        }
        const { producedPath, tmpDir } = await sofficeConvert(filePath, 'pdf');
        await copyProducedFile(producedPath, tmpDir, outputPath);
        return { outputPath, engine: 'libreoffice' };
    }

    // PDF -> Word (Word 2013+ sait ouvrir/reflow un PDF nativement)
    if (targetFormat === 'docx' && srcExt === 'pdf') {
        if (isWordAvailable()) {
            await pdfToWordCom(filePath, outputPath);
            return { outputPath, engine: 'word' };
        }
        const { producedPath, tmpDir } = await sofficeConvert(filePath, 'docx');
        await copyProducedFile(producedPath, tmpDir, outputPath);
        return { outputPath, engine: 'libreoffice' };
    }

    // PDF -> Excel, PDF -> HTML : uniquement via LibreOffice.
    const { producedPath, tmpDir } = await sofficeConvert(filePath, targetFormat);
    await copyProducedFile(producedPath, tmpDir, outputPath);
    return { outputPath, engine: 'libreoffice' };
}

// ------------------------------------------------------------
// IPC — Gestionnaire PDF
// ------------------------------------------------------------
ipcMain.handle('open-pdf-manager', (event, filePath) => { createPdfManagerWindow(filePath); });

ipcMain.handle('pdf:check-tools', (event, { forceRefresh = false } = {}) => {
    if (forceRefresh) {
        cachedSofficePath = undefined;
        cachedGsPath = undefined;
        cachedWordAvailable = undefined;
        cachedExcelAvailable = undefined;
    }
    return {
    pdfLib: !!pdfLib,
    sharp: !!sharpLib,
    ghostscript: !!locateGhostscript(),
    libreoffice: !!locateSoffice(),
        word: isWordAvailable(),
        excel: isExcelAvailable(),
    };
});

ipcMain.handle('pdf:choose-files', async (event, { multiple = false, extensions = ['pdf'], title } = {}) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    const res = await dialog.showOpenDialog(win, {
        title,
        properties: multiple ? ['openFile', 'multiSelections'] : ['openFile'],
        filters: [{ name: 'Fichiers pris en charge', extensions }, { name: 'Tous les fichiers', extensions: ['*'] }],
    });
    if (res.canceled || !res.filePaths.length) return null;
    return res.filePaths;
});

ipcMain.handle('pdf:choose-save-path', async (event, { defaultName = 'document.pdf', extensions = ['pdf'] } = {}) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    const res = await dialog.showSaveDialog(win, {
        defaultPath: path.join(store.settings.downloadDir || app.getPath('downloads'), defaultName),
        filters: [{ name: 'Fichier', extensions }],
    });
    if (res.canceled || !res.filePath) return null;
    return res.filePath;
});

ipcMain.handle('pdf:choose-folder', async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    const res = await dialog.showOpenDialog(win, { properties: ['openDirectory'] });
    if (res.canceled || !res.filePaths.length) return null;
    return res.filePaths[0];
});

ipcMain.handle('pdf:get-info', async (event, filePath) => {
    try {
        const { PDFDocument } = ensurePdfLib();
        const doc = await PDFDocument.load(fs.readFileSync(filePath), { ignoreEncryption: true });
        const pages = doc.getPages().map((p, i) => ({ index: i, width: p.getWidth(), height: p.getHeight(), rotation: p.getRotation().angle }));
        return { ok: true, pageCount: doc.getPageCount(), pages, fileSize: fs.statSync(filePath).size };
    } catch (err) {
        return { ok: false, error: err.message };
    }
});

ipcMain.handle('pdf:organize', async (event, payload) => {
    try { return { ok: true, ...(await pdfOrganize(payload)) }; }
    catch (err) { return { ok: false, error: err.message }; }
});

ipcMain.handle('pdf:merge', async (event, payload) => {
    try { return { ok: true, ...(await pdfMerge(payload)) }; }
    catch (err) { return { ok: false, error: err.message }; }
});

ipcMain.handle('pdf:split', async (event, payload) => {
    try { return { ok: true, ...(await pdfSplit(payload)) }; }
    catch (err) { return { ok: false, error: err.message }; }
});

ipcMain.handle('pdf:compress', async (event, payload) => {
    try { return { ok: true, ...(await pdfCompress(payload)) }; }
    catch (err) { return { ok: false, error: err.message }; }
});

ipcMain.handle('pdf:add-watermark', async (event, payload) => {
    try { return { ok: true, ...(await pdfAddWatermark(payload)) }; }
    catch (err) { return { ok: false, error: err.message }; }
});

ipcMain.handle('pdf:insert-blank-pages', async (event, payload) => {
    try { return { ok: true, ...(await pdfInsertBlankPages(payload)) }; }
    catch (err) { return { ok: false, error: err.message }; }
});

ipcMain.handle('pdf:convert', async (event, payload) => {
    try { return { ok: true, ...(await pdfConvertFile(payload)) }; }
    catch (err) { return { ok: false, error: err.message }; }
});

// Ouvre un fichier PDF produit par le Gestionnaire PDF dans un nouvel onglet
// du navigateur principal, pour profiter de la visionneuse pdf.js embarquée
// (plutôt que de l'ouvrir avec l'application PDF par défaut du système).
ipcMain.handle('pdf:open-in-app', (event, filePath) => {
    const targetWin = windows.find((w) => !w.isDestroyed());
    if (!targetWin) return false;
    if (targetWin.isMinimized()) targetWin.restore();
    targetWin.show();
    targetWin.focus();
    targetWin.webContents.send('open-in-new-tab', pathToFileURL(filePath).href);
    return true;
});

// ------------------------------------------------------------
// IPC — fenêtre
// ------------------------------------------------------------
ipcMain.on('window:minimize', (e) => BrowserWindow.fromWebContents(e.sender)?.minimize());
ipcMain.on('window:maximize-toggle', (e) => {
  const win = BrowserWindow.fromWebContents(e.sender);
  if (!win) return;
  win.isMaximized() ? win.unmaximize() : win.maximize();
});
ipcMain.on('window:close', (e) => BrowserWindow.fromWebContents(e.sender)?.close());
ipcMain.handle('window:is-maximized', (e) => BrowserWindow.fromWebContents(e.sender)?.isMaximized() ?? false);
ipcMain.handle('window:is-incognito', (e) => BrowserWindow.fromWebContents(e.sender)?.isIncognito ?? false);
ipcMain.handle('window:get-partition', (e) => BrowserWindow.fromWebContents(e.sender)?.partitionName ?? 'persist:main');

ipcMain.on('app:new-window', (_e, url) => createWindow({ incognito: false, initialUrl: url || null }));
ipcMain.on('app:new-incognito-window', (_e, url) => createWindow({ incognito: true, initialUrl: url || null }));
ipcMain.on('app:quit', () => app.quit());
ipcMain.on('app:print', (e) => BrowserWindow.fromWebContents(e.sender)?.webContents.print());
ipcMain.handle('app:copy-text', (_e, text) => { clipboard.writeText(typeof text === 'string' ? text : ''); return true; });
ipcMain.handle('app:open-file-dialog', async (e) => {
  const win = BrowserWindow.fromWebContents(e.sender);
  const res = await dialog.showOpenDialog(win, {
    properties: ['openFile'],
    filters: [
      { name: 'Documents PDF', extensions: ['pdf'] },
      { name: 'Tous les fichiers', extensions: ['*'] },
    ],
  });
  if (res.canceled || !res.filePaths.length) return null;
  return pathToFileURL(res.filePaths[0]).href;
});

// ------------------------------------------------------------
// IPC — données
// ------------------------------------------------------------
ipcMain.handle('data:get-all', () => store);

ipcMain.handle('data:add-bookmark', (_e, bm) => {
  if (!store.bookmarks.some((b) => b.url === bm.url)) store.bookmarks.unshift({ ...bm, addedAt: Date.now() });
  persistStore();
  return store.bookmarks;
});
ipcMain.handle('data:remove-bookmark', (_e, url) => {
  store.bookmarks = store.bookmarks.filter((b) => b.url !== url);
  persistStore();
  return store.bookmarks;
});

ipcMain.handle('data:add-history', (_e, entry) => {
  const id = `h-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  store.history.unshift({ ...entry, id, time: Date.now() });
  store.history = store.history.slice(0, 2000);
  persistStore();
  return true;
});
ipcMain.handle('data:clear-history', () => { store.history = []; persistStore(); return true; });
ipcMain.handle('data:remove-history-item', (_e, id) => {
  store.history = store.history.filter((h) => h.id !== id);
  persistStore();
  return store.history;
});
ipcMain.handle('data:remove-history-items', (_e, ids) => {
  const idSet = new Set(ids);
  store.history = store.history.filter((h) => !idSet.has(h.id));
  persistStore();
  return store.history;
});

ipcMain.handle('data:get-settings', () => store.settings);
ipcMain.handle('data:set-settings', (_e, partial) => {
  store.settings = { ...store.settings, ...partial };
  persistStore();
  // Le bloc-notes flottant doit s'activer/se désactiver immédiatement dans
  // toutes les fenêtres ouvertes, pas seulement celle où le réglage a été changé.
  if (Object.prototype.hasOwnProperty.call(partial, 'floatingNotepadEnabled')) {
    broadcastNotepadState();
  }
  return store.settings;
});
ipcMain.handle('data:choose-download-dir', async (e) => {
  const win = BrowserWindow.fromWebContents(e.sender);
  const res = await dialog.showOpenDialog(win, { properties: ['openDirectory'] });
  if (res.canceled || !res.filePaths.length) return null;
  store.settings.downloadDir = res.filePaths[0];
  persistStore();
  return store.settings.downloadDir;
});

ipcMain.handle('data:clear-browsing-data', async (e, { history: h, cookies, cache }) => {
  const win = BrowserWindow.fromWebContents(e.sender);
  const sess = session.fromPartition(win?.partitionName || 'persist:main');
  if (h) { store.history = []; persistStore(); }
  if (cache) await sess.clearCache();
  if (cookies) await sess.clearStorageData({ storages: ['cookies'] });
  return true;
});

// Réinitialisation des paramètres : on revient aux valeurs par défaut, en
// préservant volontairement le compte Google / la synchronisation chiffrée
// (des identifiants perdus par mégarde seraient trop destructifs pour un
// simple bouton "Réinitialiser les paramètres").
ipcMain.handle('data:reset-settings', () => {
  const preserved = {
    google: store.settings.google,
    googleAccount: store.settings.googleAccount,
    sync: store.settings.sync,
  };
  store.settings = { ...JSON.parse(JSON.stringify(DEFAULT_STORE.settings)), ...preserved };
  persistStore();
  return store.settings;
});

// Session (onglets ouverts) : utilisée par l'option de démarrage
// "Reprendre où vous en étiez". Le renderer pousse la liste des URLs à
// chaque changement d'onglets (création/fermeture/navigation).
ipcMain.handle('data:save-session', (_e, urls) => {
  store.lastSession = { urls: Array.isArray(urls) ? urls.filter((u) => typeof u === 'string') : [] };
  persistStore();
  return true;
});
// Variante SYNCHRONE de ce qui précède, utilisée uniquement au moment de la
// fermeture de la fenêtre (événement DOM "beforeunload" du renderer, voir
// tabs.js). C'est la méthode standard et fiable d'Electron pour ce cas :
// ipcRenderer.sendSync() bloque le renderer jusqu'à la fin du traitement
// dans le process principal, donc la sauvegarde est garantie *avant* que la
// fenêtre ne se ferme réellement — contrairement à un simple anti-rebond ou
// à un aller-retour asynchrone, qui peuvent ne jamais aboutir à temps.
ipcMain.on('data:save-session-sync', (e, urls) => {
  store.lastSession = { urls: Array.isArray(urls) ? urls.filter((u) => typeof u === 'string') : [] };
  persistStore();
  e.returnValue = true;
});
ipcMain.handle('data:get-last-session', () => store.lastSession || { urls: [] });

// Mots de passe (chiffrés via safeStorage, lié au compte OS de l'utilisateur)
function encryptPassword(plain) {
  if (safeStorage.isEncryptionAvailable()) return safeStorage.encryptString(plain).toString('base64');
  return Buffer.from(plain).toString('base64');
}
function decryptPassword(cipherB64) {
  try {
    const buf = Buffer.from(cipherB64, 'base64');
    if (safeStorage.isEncryptionAvailable()) return safeStorage.decryptString(buf);
    return buf.toString('utf-8');
  } catch { return ''; }
}

ipcMain.handle('data:save-password', (_e, { host, username, password }) => {
  const existing = store.passwords.find((p) => p.host === host && p.username === username);
  const enc = encryptPassword(password);
  if (existing) { existing.password = enc; existing.updatedAt = Date.now(); }
  else store.passwords.unshift({ id: `pw-${Date.now()}-${Math.random().toString(36).slice(2)}`, host, username, password: enc, updatedAt: Date.now() });
  persistStore();
  return true;
});
ipcMain.handle('data:get-passwords-for-host', (_e, host) => store.passwords
  .filter((p) => p.host === host)
  .map((p) => ({ id: p.id, host: p.host, username: p.username, password: decryptPassword(p.password) })));
ipcMain.handle('data:get-all-passwords', () => store.passwords
  .map((p) => ({ id: p.id, host: p.host, username: p.username, updatedAt: p.updatedAt })));
ipcMain.handle('data:delete-password', (_e, id) => {
  store.passwords = store.passwords.filter((p) => p.id !== id);
  persistStore();
  return true;
});
// Déchiffrement à la demande d'une seule entrée (révéler / copier) — on évite
// volontairement de renvoyer les mots de passe en clair dans data:get-all-passwords.
ipcMain.handle('data:reveal-password', (_e, id) => {
  const entry = store.passwords.find((p) => p.id === id);
  if (!entry) return null;
  return decryptPassword(entry.password);
});
// Modification d'une entrée existante (identifiant et/ou mot de passe), en
// conservant le même id — data:save-password ferait un upsert sur host+username
// et créerait donc un doublon si on renomme l'identifiant.
ipcMain.handle('data:update-password', (_e, { id, username, password }) => {
  const entry = store.passwords.find((p) => p.id === id);
  if (!entry) return false;
  if (typeof username === 'string' && username.trim()) entry.username = username.trim();
  if (typeof password === 'string' && password) entry.password = encryptPassword(password);
  entry.updatedAt = Date.now();
  persistStore();
  return true;
});

ipcMain.handle('data:get-downloads', () => store.downloads);
ipcMain.handle('data:clear-downloads', () => { store.downloads = []; persistStore(); return true; });
ipcMain.handle('data:remove-download', (_e, id) => {
  store.downloads = store.downloads.filter((d) => d.id !== id);
  persistStore();
  return store.downloads;
});
ipcMain.handle('shell:show-in-folder', (_e, filePath) => shell.showItemInFolder(filePath));
ipcMain.handle('shell:open-path', (_e, filePath) => shell.openPath(filePath));

ipcMain.handle('data:set-google-account', (_e, email) => {
  store.settings.googleAccount = email ? { email } : null;
  persistStore();
  return store.settings.googleAccount;
});

// ------------------------------------------------------------
// IPC — traduction de page
// ------------------------------------------------------------
async function translateWithMyMemory(text, source, target) {
  const params = new URLSearchParams({ q: text.slice(0, 490), langpair: `${source}|${target}` });
  if (store.settings.translation.email) params.set('de', store.settings.translation.email);
  const res = await fetch(`https://api.mymemory.translated.net/get?${params}`);
  const data = await res.json();
  if (data.responseStatus !== 200 && data.responseStatus !== '200') throw new Error(data.responseDetails || 'Échec traduction');
  return data.responseData.translatedText;
}

async function translateWithGoogle(text, source, target) {
  const key = store.settings.translation.googleApiKey;
  if (!key) throw new Error('Clé API Google manquante');
  const res = await fetch(`https://translation.googleapis.com/language/translate/v2?key=${key}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ q: text, source: source === 'auto' ? undefined : source, target, format: 'text' }),
  });
  const data = await res.json();
  if (data.error) throw new Error(data.error.message);
  return data.data.translations[0].translatedText;
}

ipcMain.handle('translate:chunk', async (_e, { text, source, target }) => {
  try {
    const provider = store.settings.translation.provider;
    const useGoogle = provider === 'google' && !!store.settings.translation.googleApiKey;
    const translated = useGoogle
      ? await translateWithGoogle(text, source || 'auto', target)
      : await translateWithMyMemory(text, source === 'auto' ? 'en' : (source || 'en'), target);
    return { ok: true, text: translated, provider: useGoogle ? 'google' : 'mymemory' };
  } catch (err) {
    return { ok: false, error: err.message, text };
  }
});

// ------------------------------------------------------------
// IPC — gestion des cookies
// ------------------------------------------------------------
ipcMain.handle('cookies:get-all', async (e) => {
  const win = BrowserWindow.fromWebContents(e.sender);
  const sess = session.fromPartition(win?.partitionName || 'persist:main');
  return sess.cookies.get({});
});
ipcMain.handle('cookies:remove', async (e, { domain, path: p, name }) => {
  const win = BrowserWindow.fromWebContents(e.sender);
  const sess = session.fromPartition(win?.partitionName || 'persist:main');
  const url = `http${domain?.startsWith('.') ? '' : ''}s://${domain.replace(/^\./, '')}${p || '/'}`;
  await sess.cookies.remove(url, name).catch(() => {});
  return true;
});
ipcMain.handle('cookies:remove-domain', async (e, domain) => {
  const win = BrowserWindow.fromWebContents(e.sender);
  const sess = session.fromPartition(win?.partitionName || 'persist:main');
  const cookies = await sess.cookies.get({ domain });
  for (const c of cookies) {
    const url = `https://${c.domain.replace(/^\./, '')}${c.path}`;
    await sess.cookies.remove(url, c.name).catch(() => {});
  }
  return true;
});
ipcMain.handle('cookies:remove-all', async (e) => {
  const win = BrowserWindow.fromWebContents(e.sender);
  const sess = session.fromPartition(win?.partitionName || 'persist:main');
  await sess.clearStorageData({ storages: ['cookies'] });
  return true;
});

// ------------------------------------------------------------
// Extensions
// ------------------------------------------------------------
// Electron ne peut pas installer une extension directement depuis le Chrome
// Web Store, Mozilla Add-ons, etc. (ces stores ne distribuent leurs paquets
// qu'à leur propre navigateur). Ce qu'expose l'API Electron, c'est le
// chargement d'une extension "non empaquetée" (un dossier contenant un
// manifest.json), comme le fait le mode développeur de Chrome. On propose
// donc : (1) parcourir les stores dans un onglet pour trouver/télécharger
// une extension, puis (2) l'installer ici depuis le dossier extrait.
// Les extensions ne sont chargées que sur la session principale persistante
// (jamais en navigation privée), comme le fait Chrome par défaut.
const EXTENSIONS_SESSION_PARTITION = 'persist:main';
let extensionsBooted = false;

function extensionsSession() {
  return session.fromPartition(EXTENSIONS_SESSION_PARTITION);
}

function pickExtensionIcon(dir, manifest) {
  try {
    let iconRel = null;
    if (manifest.icons && typeof manifest.icons === 'object') {
      const sizes = Object.keys(manifest.icons).map((n) => parseInt(n, 10)).filter((n) => !Number.isNaN(n)).sort((a, b) => b - a);
      if (sizes.length) iconRel = manifest.icons[String(sizes[0])];
    }
    if (!iconRel) {
      const action = manifest.action || manifest.browser_action || {};
      if (action.default_icon) {
        iconRel = typeof action.default_icon === 'string' ? action.default_icon : Object.values(action.default_icon)[0];
      }
    }
    if (!iconRel) return null;
    const abs = path.join(dir, iconRel);
    if (!fs.existsSync(abs)) return null;
    return pathToFileURL(abs).href;
  } catch { return null; }
}

async function loadExtensionEntry(entry) {
  try {
    const sess = extensionsSession();
    const ext = await sess.loadExtension(entry.path, { allowFileAccess: true });
    return { ok: true, id: ext.id };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

function unloadExtensionEntry(entry) {
  try {
    const sess = extensionsSession();
    if (sess.getExtension(entry.id)) sess.removeExtension(entry.id);
    return true;
  } catch { return false; }
}

// Charge au démarrage toutes les extensions marquées "activées" — Electron
// ne persiste pas les extensions chargées d'une exécution à l'autre.
async function bootExtensions() {
  if (extensionsBooted) return;
  extensionsBooted = true;
  for (const entry of store.extensions) {
    if (!entry.enabled) continue;
    if (!entry.path || !fs.existsSync(path.join(entry.path, 'manifest.json'))) continue;
    const res = await loadExtensionEntry(entry);
    if (!res.ok) entry.loadError = res.error;
    else { entry.id = res.id; delete entry.loadError; }
  }
  persistStore();
}

function serializeExtensions() {
  const sess = extensionsSession();
  const loadedIds = new Set(sess.getAllExtensions().map((e) => e.id));
  return store.extensions.map((entry) => ({ ...entry, loaded: loadedIds.has(entry.id) }));
}

ipcMain.handle('extensions:get-all', () => serializeExtensions());

ipcMain.handle('extensions:install-unpacked', async (e) => {
  const win = BrowserWindow.fromWebContents(e.sender);
  const res = await dialog.showOpenDialog(win, {
    title: "Sélectionner le dossier de l'extension (contenant manifest.json)",
    properties: ['openDirectory'],
  });
  if (res.canceled || !res.filePaths.length) return { ok: false, canceled: true };

  const dir = res.filePaths[0];
  const manifestPath = path.join(dir, 'manifest.json');
  if (!fs.existsSync(manifestPath)) {
    return { ok: false, error: "Aucun fichier manifest.json trouvé dans ce dossier. Sélectionnez le dossier extrait de l'extension (celui qui contient directement manifest.json)." };
  }

  let manifest;
  try { manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8')); } catch {
    return { ok: false, error: 'manifest.json invalide.' };
  }

  if (store.extensions.some((x) => x.path === dir)) {
    return { ok: false, error: 'Cette extension est déjà installée.' };
  }

  const entry = {
    id: null,
    name: manifest.name || path.basename(dir),
    version: manifest.version || '',
    description: manifest.description || '',
    icon: pickExtensionIcon(dir, manifest),
    path: dir,
    enabled: true,
    storeUrl: null,
    addedAt: Date.now(),
  };

  const loadRes = await loadExtensionEntry(entry);
  if (!loadRes.ok) return { ok: false, error: `Échec du chargement : ${loadRes.error}` };
  entry.id = loadRes.id;

  store.extensions.push(entry);
  persistStore();
  return { ok: true, extension: entry, extensions: serializeExtensions() };
});

ipcMain.handle('extensions:toggle', async (_e, { id, enabled }) => {
  const entry = store.extensions.find((x) => x.id === id);
  if (!entry) return { ok: false, error: 'Extension introuvable.' };
  entry.enabled = !!enabled;
  if (entry.enabled) {
    const res = await loadExtensionEntry(entry);
    if (!res.ok) { entry.enabled = false; entry.loadError = res.error; persistStore(); return { ok: false, error: res.error, extensions: serializeExtensions() }; }
    entry.id = res.id;
    delete entry.loadError;
  } else {
    unloadExtensionEntry(entry);
  }
  persistStore();
  return { ok: true, extensions: serializeExtensions() };
});

ipcMain.handle('extensions:remove', (_e, id) => {
  const entry = store.extensions.find((x) => x.id === id);
  if (entry) unloadExtensionEntry(entry);
  store.extensions = store.extensions.filter((x) => x.id !== id);
  persistStore();
  return serializeExtensions();
});

// ------------------------------------------------------------
// Compte Google — OAuth 2.0 réel (Authorization Code + PKCE,
// flux "application installée" avec redirection en boucle locale)
// ------------------------------------------------------------
//
// IMPORTANT : pour fonctionner, l'utilisateur doit créer son propre
// identifiant client OAuth sur https://console.cloud.google.com/
// (type "Application de bureau"), l'ajouter comme URI de redirection
// autorisée n'est pas nécessaire pour ce type de client (Google
// accepte automatiquement les redirections http://127.0.0.1:*), puis
// renseigner le Client ID (et le Client Secret fourni par Google)
// dans Paramètres > Compte. Aucune clé n'est embarquée dans le code :
// il ne serait pas possible d'y stocker un secret de façon sûre.
//
// Portée demandée : "openid email" (identité) +
// "drive.appdata" (accès exclusif à un dossier privé de l'app dans
// Drive, invisible dans le Drive de l'utilisateur et inaccessible à
// toute autre application).

const GOOGLE_SCOPES = ['openid', 'email', 'profile', 'https://www.googleapis.com/auth/drive.appdata'].join(' ');
const DRIVE_SYNC_FILENAME = 'browser-sync-data.enc.json';

function base64url(buf) {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function decodeJwtPayload(jwt) {
  try {
    const payload = jwt.split('.')[1];
    return JSON.parse(Buffer.from(payload.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf-8'));
  } catch { return {}; }
}

function saveGoogleTokens(tokens) {
  const json = JSON.stringify(tokens);
  store.settings.google.tokensEnc = safeStorage.isEncryptionAvailable()
    ? safeStorage.encryptString(json).toString('base64')
    : Buffer.from(json).toString('base64');
  if (tokens.email) store.settings.googleAccount = { email: tokens.email, picture: tokens.picture || (store.settings.googleAccount && store.settings.googleAccount.picture) || null };
  persistStore();
}

function loadGoogleTokens() {
  const enc = store.settings.google.tokensEnc;
  if (!enc) return null;
  try {
    const buf = Buffer.from(enc, 'base64');
    const json = safeStorage.isEncryptionAvailable() ? safeStorage.decryptString(buf) : buf.toString('utf-8');
    return JSON.parse(json);
  } catch { return null; }
}

// Démarre le flux OAuth : ouvre le navigateur système sur la vraie page
// de consentement Google, reçoit le code d'autorisation via un petit
// serveur HTTP local temporaire (127.0.0.1, port éphémère), puis échange
// ce code contre des jetons d'accès/rafraîchissement.
function startGoogleAuth() {
  return new Promise((resolve, reject) => {
    const { clientId, clientSecret } = store.settings.google;
    if (!clientId) {
      reject(new Error("Aucun Client ID Google configuré. Renseignez-le dans Paramètres > Compte."));
      return;
    }

    const verifier = base64url(crypto.randomBytes(32));
    const challenge = base64url(crypto.createHash('sha256').update(verifier).digest());
    const state = base64url(crypto.randomBytes(16));
    let settled = false;

    const server = http.createServer(async (req, res) => {
      let reqUrl;
      try { reqUrl = new URL(req.url, 'http://127.0.0.1'); } catch { res.writeHead(400); res.end(); return; }
      if (reqUrl.pathname !== '/callback') { res.writeHead(404); res.end(); return; }

      const code = reqUrl.searchParams.get('code');
      const returnedState = reqUrl.searchParams.get('state');
      const err = reqUrl.searchParams.get('error');

      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      if (err || returnedState !== state || !code) {
        res.end('<html><body style="font-family:sans-serif"><h2>Connexion annulée ou invalide.</h2><p>Vous pouvez fermer cette fenêtre.</p></body></html>');
        finish(new Error(err ? `Autorisation refusée : ${err}` : 'Réponse OAuth invalide (state ou code manquant).'));
        return;
      }
      res.end('<html><body style="font-family:sans-serif"><h2>Connexion réussie ✅</h2><p>Vous pouvez fermer cette fenêtre et revenir à l\'application.</p></body></html>');

      try {
        const port = server.address().port;
        const redirectUri = `http://127.0.0.1:${port}/callback`;
        const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            code,
            client_id: clientId,
            client_secret: clientSecret || '',
            redirect_uri: redirectUri,
            grant_type: 'authorization_code',
            code_verifier: verifier,
          }),
        });
        const tokenData = await tokenRes.json();
        if (tokenData.error) { finish(new Error(tokenData.error_description || tokenData.error)); return; }

        const idInfo = tokenData.id_token ? decodeJwtPayload(tokenData.id_token) : {};
        const tokens = {
          access_token: tokenData.access_token,
          refresh_token: tokenData.refresh_token || null, // fourni uniquement lors du 1er consentement (prompt=consent)
          expiry: Date.now() + (tokenData.expires_in || 0) * 1000,
          scope: tokenData.scope,
          email: idInfo.email || null,
          picture: idInfo.picture || null, // photo de profil Google (nécessite le scope "profile")
          sub: idInfo.sub || null, // identifiant Google stable, utilisé pour dériver la clé de sync automatiquement
        };
        saveGoogleTokens(tokens);
        finish(null, tokens);
      } catch (e) {
        finish(e);
      }
    });

    function finish(error, tokens) {
      if (settled) return;
      settled = true;
      setTimeout(() => server.close(), 300);
      if (error) reject(error); else resolve(tokens);
    }

    server.on('error', (e) => finish(e));

    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      const redirectUri = `http://127.0.0.1:${port}/callback`;
      const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
      authUrl.searchParams.set('client_id', clientId);
      authUrl.searchParams.set('redirect_uri', redirectUri);
      authUrl.searchParams.set('response_type', 'code');
      authUrl.searchParams.set('scope', GOOGLE_SCOPES);
      authUrl.searchParams.set('access_type', 'offline');
      authUrl.searchParams.set('prompt', 'consent');
      authUrl.searchParams.set('code_challenge', challenge);
      authUrl.searchParams.set('code_challenge_method', 'S256');
      authUrl.searchParams.set('state', state);
      shell.openExternal(authUrl.toString());

      // Sécurité : abandonne si personne ne termine la connexion dans le navigateur.
      setTimeout(() => finish(new Error('Délai de connexion dépassé.')), 5 * 60 * 1000);
    });
  });
}

async function getValidAccessToken() {
  let tokens = loadGoogleTokens();
  if (!tokens) throw new Error('Non connecté à Google.');
  if (Date.now() < tokens.expiry - 30000) return tokens.access_token;
  if (!tokens.refresh_token) throw new Error('Session Google expirée, reconnectez-vous.');

  const { clientId, clientSecret } = store.settings.google;
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret || '',
      refresh_token: tokens.refresh_token,
      grant_type: 'refresh_token',
    }),
  });
  const data = await res.json();
  if (data.error) throw new Error(data.error_description || data.error);
  tokens = { ...tokens, access_token: data.access_token, expiry: Date.now() + data.expires_in * 1000 };
  saveGoogleTokens(tokens);
  return tokens.access_token;
}

function disconnectGoogle() {
  store.settings.google.tokensEnc = null;
  store.settings.googleAccount = null;
  store.settings.sync.enabled = false;
  store.settings.sync.wrappedKey = '';
  store.settings.sync.salt = '';
  store.settings.sync.lastSyncedAt = null;
  persistStore();
  stopAutoSync();
}

// ------------------------------------------------------------
// Google Drive — fichier unique dans appDataFolder (dossier privé
// invisible dans le Drive normal de l'utilisateur, réservé à l'app)
// ------------------------------------------------------------
async function driveFindSyncFile(accessToken) {
  const url = new URL('https://www.googleapis.com/drive/v3/files');
  url.searchParams.set('spaces', 'appDataFolder');
  url.searchParams.set('q', `name = '${DRIVE_SYNC_FILENAME}'`);
  url.searchParams.set('fields', 'files(id,name,modifiedTime)');
  const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  const data = await res.json();
  if (data.error) throw new Error(data.error.message);
  return (data.files && data.files[0]) || null;
}

async function driveDownloadFile(accessToken, fileId) {
  const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`Échec du téléchargement depuis Drive (HTTP ${res.status})`);
  return res.json();
}

async function driveUploadFile(accessToken, existingFileId, jsonBody) {
  const boundary = `sync_${crypto.randomBytes(8).toString('hex')}`;
  const metadata = existingFileId ? { name: DRIVE_SYNC_FILENAME } : { name: DRIVE_SYNC_FILENAME, parents: ['appDataFolder'] };
  const body =
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n` +
    `--${boundary}\r\nContent-Type: application/json\r\n\r\n${JSON.stringify(jsonBody)}\r\n` +
    `--${boundary}--`;

  const url = existingFileId
    ? `https://www.googleapis.com/upload/drive/v3/files/${existingFileId}?uploadType=multipart`
    : 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart';

  const res = await fetch(url, {
    method: existingFileId ? 'PATCH' : 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': `multipart/related; boundary=${boundary}` },
    body,
  });
  const data = await res.json();
  if (data.error) throw new Error(data.error.message);
  return data;
}

// ------------------------------------------------------------
// Chiffrement de bout en bout (AES-256-GCM, clé dérivée par PBKDF2
// d'une phrase de synchronisation choisie par l'utilisateur). Le sel
// n'est pas secret ; il est stocké dans l'enveloppe distante afin que
// tout nouvel appareil puisse dériver la même clé à partir de la même
// phrase. Rien n'est jamais envoyé à Google en clair.
// ------------------------------------------------------------
function deriveSyncKey(passphrase, saltB64) {
  return crypto.pbkdf2Sync(passphrase, Buffer.from(saltB64, 'base64'), 200000, 32, 'sha256');
}

function encryptPayload(obj, key) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(Buffer.from(JSON.stringify(obj), 'utf-8')), cipher.final()]);
  return { iv: iv.toString('base64'), authTag: cipher.getAuthTag().toString('base64'), ciphertext: ciphertext.toString('base64') };
}

function decryptPayload(envelope, key) {
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(envelope.iv, 'base64'));
  decipher.setAuthTag(Buffer.from(envelope.authTag, 'base64'));
  const plaintext = Buffer.concat([decipher.update(Buffer.from(envelope.ciphertext, 'base64')), decipher.final()]);
  return JSON.parse(plaintext.toString('utf-8'));
}

// Conserve la clé dérivée localement (enveloppée via safeStorage, liée
// à cette machine/ce compte OS) pour éviter de retaper la phrase à
// chaque synchronisation sur cet appareil. Elle reste nécessaire en
// clair pour configurer un *nouvel* appareil.
function wrapAndStoreSyncKey(key, saltB64) {
  const b64key = key.toString('base64');
  store.settings.sync.wrappedKey = safeStorage.isEncryptionAvailable()
    ? safeStorage.encryptString(b64key).toString('base64')
    : Buffer.from(b64key).toString('base64');
  store.settings.sync.salt = saltB64;
  persistStore();
}

function unwrapSyncKey() {
  const wrapped = store.settings.sync.wrappedKey;
  if (!wrapped) return null;
  try {
    const buf = Buffer.from(wrapped, 'base64');
    const b64key = safeStorage.isEncryptionAvailable() ? safeStorage.decryptString(buf) : buf.toString('utf-8');
    return Buffer.from(b64key, 'base64');
  } catch { return null; }
}

// Dérive et enveloppe automatiquement la clé de synchronisation à partir de
// l'identifiant Google stable du compte (sub), sans aucune saisie de
// l'utilisateur. Comme ce même identifiant est renvoyé par Google sur
// n'importe quel appareil connecté au même compte, tous les appareils
// dérivent indépendamment la même clé (à condition d'utiliser le même sel :
// on récupère celui déjà présent sur Drive s'il existe, sinon on en crée un
// nouveau qui sera repris automatiquement par les appareils suivants).
async function ensureSyncKey(sub) {
  if (store.settings.sync.wrappedKey) return true;
  if (!sub) return false;
  try {
    const accessToken = await getValidAccessToken();
    const remoteMeta = await driveFindSyncFile(accessToken);
    if (remoteMeta) {
      const remoteEnvelope = await driveDownloadFile(accessToken, remoteMeta.id);
      wrapAndStoreSyncKey(deriveSyncKey(sub, remoteEnvelope.salt), remoteEnvelope.salt);
    } else {
      const salt = crypto.randomBytes(16).toString('base64');
      wrapAndStoreSyncKey(deriveSyncKey(sub, salt), salt);
    }
    return true;
  } catch {
    return false; // réessayé automatiquement à la prochaine synchro
  }
}

function cookieToUrl(c) {
  return `http${c.secure ? 's' : ''}://${c.domain.replace(/^\./, '')}${c.path || '/'}`;
}

// Fusionne deux listes par clé unique, en gardant l'élément le plus
// récent (utile pour combiner l'état local et l'état distant sans
// jamais perdre silencieusement de données lors d'une synchro multi-appareils).
function mergeById(localArr, remoteArr, keyFn, tsFn) {
  const map = new Map();
  for (const item of remoteArr || []) map.set(keyFn(item), item);
  for (const item of localArr || []) {
    const k = keyFn(item);
    const existing = map.get(k);
    if (!existing || (tsFn(item) || 0) >= (tsFn(existing) || 0)) map.set(k, item);
  }
  return Array.from(map.values());
}

function mergeSnapshots(local, remote) {
  if (!remote) return local;
  return {
    bookmarks: mergeById(local.bookmarks, remote.bookmarks, (b) => b.url, (b) => b.addedAt || 0),
    history: mergeById(local.history, remote.history, (h) => h.id, (h) => h.time || 0)
      .sort((a, b) => (b.time || 0) - (a.time || 0)).slice(0, 2000),
    downloadsHistory: mergeById(local.downloadsHistory, remote.downloadsHistory, (d) => d.id, (d) => d.startedAt || 0),
    passwords: mergeById(local.passwords, remote.passwords, (p) => `${p.host}|${p.username}`, (p) => p.updatedAt || 0),
    cookies: mergeById(local.cookies, remote.cookies, (c) => `${c.domain}|${c.path}|${c.name}`, (c) => c.expirationDate || 0),
    updatedAt: Date.now(),
  };
}

async function applyMergedSnapshot(merged, sess) {
  store.bookmarks = merged.bookmarks;
  store.history = merged.history;

  // On ne resynchronise jamais les fichiers téléchargés eux-mêmes, seulement
  // leur entrée d'historique — et jamais un téléchargement en cours localement.
  const activeIds = new Set(store.downloads.filter((d) => d.state === 'progressing').map((d) => d.id));
  const activeEntries = store.downloads.filter((d) => activeIds.has(d.id));
  const mergedDownloads = merged.downloadsHistory.filter((d) => !activeIds.has(d.id));
  store.downloads = [...activeEntries, ...mergedDownloads];

  store.passwords = merged.passwords.map((p) => ({
    id: p.id || `pw-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    host: p.host,
    username: p.username,
    password: encryptPassword(p.password), // ré-encapsulé via safeStorage local après réception
    updatedAt: p.updatedAt,
  }));
  persistStore();

  if (sess) {
    for (const c of merged.cookies) {
      try {
        await sess.cookies.set({
          url: c.url || cookieToUrl(c),
          name: c.name,
          value: c.value,
          domain: c.domain,
          path: c.path,
          secure: c.secure,
          httpOnly: c.httpOnly,
          sameSite: c.sameSite,
          expirationDate: c.expirationDate,
        });
      } catch { /* cookie invalide/expiré : on l'ignore */ }
    }
  }
}

// Point d'entrée principal de la synchronisation : construit l'état
// local (mots de passe déchiffrés temporairement en mémoire pour être
// placés dans l'enveloppe chiffrée globale), le fusionne avec l'état
// distant existant, applique le résultat localement, puis renvoie le
// tout, chiffré, vers le dossier privé appDataFolder de Drive.
async function performSync(win) {
  try {
    let key = unwrapSyncKey();
    if (!key) {
      const tokens = loadGoogleTokens();
      await ensureSyncKey(tokens?.sub);
      key = unwrapSyncKey();
      if (!key) throw new Error('Connectez-vous à votre compte Google pour activer la synchronisation.');
    }

    const accessToken = await getValidAccessToken();
    const sess = session.fromPartition('persist:main'); // jamais la navigation privée
    const localCookies = await sess.cookies.get({});

    const localSnapshot = {
      bookmarks: store.bookmarks,
      history: store.history,
      downloadsHistory: store.downloads.map(({ id, filename, url, state, startedAt }) => ({ id, filename, url, state, startedAt })),
      passwords: store.passwords.map((p) => ({ id: p.id, host: p.host, username: p.username, password: decryptPassword(p.password), updatedAt: p.updatedAt })),
      cookies: localCookies.map((c) => ({
        url: cookieToUrl(c), name: c.name, value: c.value, domain: c.domain, path: c.path,
        secure: c.secure, httpOnly: c.httpOnly, sameSite: c.sameSite, expirationDate: c.expirationDate,
      })),
      updatedAt: Date.now(),
    };

    const remoteMeta = await driveFindSyncFile(accessToken);
    let merged = localSnapshot;
    if (remoteMeta) {
      const remoteEnvelope = await driveDownloadFile(accessToken, remoteMeta.id);
      const remoteSnapshot = decryptPayload(remoteEnvelope, key);
      merged = mergeSnapshots(localSnapshot, remoteSnapshot);
    }

    await applyMergedSnapshot(merged, sess);

    const envelope = { ...encryptPayload(merged, key), salt: store.settings.sync.salt, version: 1 };
    await driveUploadFile(accessToken, remoteMeta ? remoteMeta.id : null, envelope);

    store.settings.sync.lastSyncedAt = Date.now();
    persistStore();
    win?.webContents.send('sync:status', { ok: true, lastSyncedAt: store.settings.sync.lastSyncedAt });
    return { ok: true, lastSyncedAt: store.settings.sync.lastSyncedAt };
  } catch (e) {
    win?.webContents.send('sync:status', { ok: false, error: e.message });
    return { ok: false, error: e.message };
  }
}

let autoSyncTimer = null;
function startAutoSync() {
  stopAutoSync();
  const minutes = store.settings.sync.autoIntervalMinutes || 15;
  autoSyncTimer = setInterval(() => {
    if (store.settings.sync.enabled) performSync(windows[0]);
  }, minutes * 60 * 1000);
}
function stopAutoSync() {
  if (autoSyncTimer) { clearInterval(autoSyncTimer); autoSyncTimer = null; }
}

// ------------------------------------------------------------
// IPC — compte Google / synchronisation chiffrée
// ------------------------------------------------------------
ipcMain.handle('google:set-credentials', (_e, { clientId, clientSecret }) => {
  store.settings.google.clientId = (clientId || '').trim();
  store.settings.google.clientSecret = (clientSecret || '').trim();
  persistStore();
  return true;
});

ipcMain.handle('google:auth-start', async () => {
  try {
    const tokens = await startGoogleAuth();
    // Connexion réussie -> tout se synchronise automatiquement, sans réglage
    // supplémentaire : on dérive la clé, on active la synchro en arrière-plan
    // et on lance une première synchronisation immédiate.
    store.settings.sync.enabled = true;
    persistStore();
    await ensureSyncKey(tokens.sub);
    const win = BrowserWindow.getFocusedWindow() || windows[0];
    performSync(win);
    startAutoSync();
    return { ok: true, email: tokens.email };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

ipcMain.handle('google:status', () => {
  const tokens = loadGoogleTokens();
  // Filet de sécurité pour les comptes déjà connectés avant l'automatisation
  // de la synchro (ou si une précédente tentative de dérivation a échoué,
  // ex. pas de réseau) : on retente en tâche de fond à chaque consultation
  // du statut, sans rien demander à l'utilisateur.
  if (tokens && !store.settings.sync.wrappedKey) {
    store.settings.sync.enabled = true;
    persistStore();
    ensureSyncKey(tokens.sub).then((ok) => {
      if (ok) { performSync(BrowserWindow.getFocusedWindow() || windows[0]); startAutoSync(); }
    });
  }
  return {
    connected: !!tokens,
    email: (tokens && tokens.email) || (store.settings.googleAccount && store.settings.googleAccount.email) || null,
    picture: (tokens && tokens.picture) || (store.settings.googleAccount && store.settings.googleAccount.picture) || null,
    hasClientId: !!store.settings.google.clientId,
    hasSyncKey: !!store.settings.sync.wrappedKey,
    autoSyncEnabled: !!store.settings.sync.enabled,
    lastSyncedAt: store.settings.sync.lastSyncedAt,
  };
});

ipcMain.handle('google:disconnect', () => { disconnectGoogle(); return true; });

ipcMain.handle('sync:now', async (e) => performSync(BrowserWindow.fromWebContents(e.sender)));

ipcMain.handle('sync:set-auto', (_e, enabled) => {
  store.settings.sync.enabled = !!enabled;
  persistStore();
  if (enabled) startAutoSync(); else stopAutoSync();
  return true;
});


// IPC — Contrôles de téléchargement (Pause, Reprise, Annulation)
ipcMain.handle('downloads:pause', (_e, id) => {
  const item = activeDownloadItems.get(id);
  if (item && !item.isPaused()) { item.pause(); return true; }
  return false;
});

ipcMain.handle('downloads:resume', (_e, id) => {
  const item = activeDownloadItems.get(id);
  if (item && item.isPaused()) { item.resume(); return true; }
  return false;
});

ipcMain.handle('downloads:cancel', (_e, id) => {
  const item = activeDownloadItems.get(id);
  if (item) { item.cancel(); activeDownloadItems.delete(id); return true; }
  return false;
});

// ------------------------------------------------------------
// Cycle de vie de l'app
// ------------------------------------------------------------
// ------------------------------------------------------------
// Mises à jour automatiques (GitHub Releases)
// ------------------------------------------------------------
// Vérifie s'il existe une nouvelle version publiée, la télécharge en
// arrière-plan, puis propose à l'utilisateur de redémarrer pour l'installer
// (ou l'installe automatiquement à la prochaine fermeture s'il ignore).
function setupAutoUpdater() {
    if (!autoUpdater || !app.isPackaged) return; // pas de mise à jour en dev (npm start)

    // Dépôt de mise à jour PRIVÉ : l'API GitHub exige une authentification
    // pour lister/télécharger les Releases d'un dépôt privé. Ce jeton est
    // donc embarqué dans l'app distribuée (aucune autre solution pour un
    // dépôt privé consulté par des utilisateurs externes).
    // SÉCURITÉ : utilise impérativement un jeton "fine-grained" GitHub
    // (Settings -> Developer settings -> Fine-grained tokens) limité à :
    //   - CE dépôt uniquement (pas "tous les dépôts")
    //   - Permission "Contents" en LECTURE SEULE, rien d'autre
    // Un jeton avec des droits plus larges ne doit jamais être utilisé ici :
    // il peut en théorie être extrait par un utilisateur qui décompresse
    // l'app (fichier .asar).
    if (!process.env.GH_TOKEN) {
        process.env.GH_TOKEN = 'REMPLACE_PAR_TON_JETON_LECTURE_SEULE_FINE_GRAINED';
    }

    autoUpdater.autoDownload = true;
    autoUpdater.autoInstallOnAppQuit = true;

    autoUpdater.on('update-downloaded', (info) => {
        dialog.showMessageBox({
            type: 'info',
            title: 'Mise à jour disponible',
            message: `Central Browser ${info.version} a été téléchargée.`,
            detail: "Elle sera installée automatiquement à la prochaine fermeture de l'application, ou tu peux redémarrer maintenant pour l'appliquer tout de suite.",
            buttons: ['Redémarrer maintenant', 'Plus tard'],
            defaultId: 0,
            cancelId: 1,
        }).then(({ response }) => {
            if (response === 0) autoUpdater.quitAndInstall();
        });
    });

    autoUpdater.on('error', (err) => {
        console.error('Mise à jour automatique : erreur ->', err?.message || err);
    });

    autoUpdater.checkForUpdates().catch((err) => {
        console.error('Mise à jour automatique : vérification impossible ->', err?.message || err);
    });
}

app.whenReady().then(() => {
  if (store.settings.sync.enabled && store.settings.sync.wrappedKey) startAutoSync();

  app.on('web-contents-created', (_event, contents) => {
    if (contents.getType() === 'webview') {
      contents.setWindowOpenHandler(({ url }) => {
        const win = BrowserWindow.fromWebContents(contents.hostWebContents || contents);
        (win || windows[0])?.webContents.send('open-in-new-tab', url);
        return { action: 'deny' };
      });

      // Interception centralisée : toute navigation vers un .pdf passe
      // par la visionneuse pdf.js embarquée plutôt que par le comportement par défaut.
      contents.on('will-navigate', (event, url) => {
        if (isPdfUrl(url)) {
          event.preventDefault();
          openPdfInViewer(contents, url);
        }
      });

      attachContextMenu(contents);
    }
  });

  createWindow({ incognito: false });
  bootExtensions();
  fileTransfer.startDiscovery();
  setTimeout(setupAutoUpdater, 3000); // laisse l'UI se charger avant de vérifier
});

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('before-quit', () => stopAutoSync());
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow({ incognito: false }); });