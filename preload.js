const { ipcRenderer, contextBridge, webUtils } = require('electron');

contextBridge.exposeInMainWorld('browserAPI', {
    // Onglets / nouvelles fenêtres
    onOpenInNewTab: (cb) => ipcRenderer.on('open-in-new-tab', (_e, url) => cb(url)),

    // Contrôles de fenêtre (barre de titre custom)
    windowMinimize: () => ipcRenderer.send('window:minimize'),
    windowMaximizeToggle: () => ipcRenderer.send('window:maximize-toggle'),
    windowClose: () => ipcRenderer.send('window:close'),
    isWindowMaximized: () => ipcRenderer.invoke('window:is-maximized'),
    isIncognito: () => ipcRenderer.invoke('window:is-incognito'),
    getWindowPartition: () => ipcRenderer.invoke('window:get-partition'),
    onMaximizedState: (cb) => ipcRenderer.on('window:maximized-state', (_e, val) => cb(val)),

    // Fenêtres / app
    newWindow: (url) => ipcRenderer.send('app:new-window', url),
    newIncognitoWindow: (url) => ipcRenderer.send('app:new-incognito-window', url),
    quitApp: () => ipcRenderer.send('app:quit'),
    print: () => ipcRenderer.send('app:print'),
    openFileDialog: () => ipcRenderer.invoke('app:open-file-dialog'),

    // Données
    getAllData: () => ipcRenderer.invoke('data:get-all'),
    addBookmark: (bm) => ipcRenderer.invoke('data:add-bookmark', bm),
    removeBookmark: (url) => ipcRenderer.invoke('data:remove-bookmark', url),
    addHistory: (entry) => ipcRenderer.invoke('data:add-history', entry),
    clearHistory: () => ipcRenderer.invoke('data:clear-history'),
    getSettings: () => ipcRenderer.invoke('data:get-settings'),
    setSettings: (partial) => ipcRenderer.invoke('data:set-settings', partial),
    chooseDownloadDir: () => ipcRenderer.invoke('data:choose-download-dir'),
    clearBrowsingData: (opts) => ipcRenderer.invoke('data:clear-browsing-data', opts),
    resetSettings: () => ipcRenderer.invoke('data:reset-settings'),

    // Session (option de démarrage "Reprendre où vous en étiez")
    saveSession: (urls) => ipcRenderer.invoke('data:save-session', urls),
    saveSessionSync: (urls) => ipcRenderer.sendSync('data:save-session-sync', urls),
    getLastSession: () => ipcRenderer.invoke('data:get-last-session'),

    // Mots de passe
    savePassword: (cred) => ipcRenderer.invoke('data:save-password', cred),
    getPasswordsForHost: (host) => ipcRenderer.invoke('data:get-passwords-for-host', host),
    getAllPasswords: () => ipcRenderer.invoke('data:get-all-passwords'),
    deletePassword: (id) => ipcRenderer.invoke('data:delete-password', id),
    revealPassword: (id) => ipcRenderer.invoke('data:reveal-password', id),
    updatePassword: (payload) => ipcRenderer.invoke('data:update-password', payload),
    copyToClipboard: (text) => ipcRenderer.invoke('app:copy-text', text),

    // Téléchargements
    getDownloads: () => ipcRenderer.invoke('data:get-downloads'),
    clearDownloads: () => ipcRenderer.invoke('data:clear-downloads'),
    removeDownload: (id) => ipcRenderer.invoke('data:remove-download', id),
    showInFolder: (p) => ipcRenderer.invoke('shell:show-in-folder', p),
    openPath: (p) => ipcRenderer.invoke('shell:open-path', p),
    pauseDownload: (id) => ipcRenderer.invoke('downloads:pause', id),
    resumeDownload: (id) => ipcRenderer.invoke('downloads:resume', id),
    cancelDownload: (id) => ipcRenderer.invoke('downloads:cancel', id),
    onDownloadUpdate: (callback) => ipcRenderer.on('downloads:update', (_e, entry) => callback(entry)),
    onOpenDownloadsPanel: (callback) => ipcRenderer.on('downloads:open-panel', () => callback()),
    onDownloadNotification: (callback) => ipcRenderer.on('downloads:notify', (_e, data) => callback(data)),

    // Historique
    removeHistoryItem: (id) => ipcRenderer.invoke('data:remove-history-item', id),
    removeHistoryItems: (ids) => ipcRenderer.invoke('data:remove-history-items', ids),

    // Compte Google (indicateur local)
    setGoogleAccount: (email) => ipcRenderer.invoke('data:set-google-account', email),

    // Compte Google — OAuth réel + synchronisation chiffrée via Drive (appDataFolder)
    googleSetCredentials: (creds) => ipcRenderer.invoke('google:set-credentials', creds),
    googleAuthStart: () => ipcRenderer.invoke('google:auth-start'),
    googleStatus: () => ipcRenderer.invoke('google:status'),
    googleDisconnect: () => ipcRenderer.invoke('google:disconnect'),
    syncNow: () => ipcRenderer.invoke('sync:now'),
    syncSetAuto: (enabled) => ipcRenderer.invoke('sync:set-auto', enabled),
    onSyncStatus: (cb) => ipcRenderer.on('sync:status', (_e, data) => cb(data)),

    // Communication avec le preload injecté dans les pages web (mots de passe détectés)
    onCredentialDetected: (cb) => ipcRenderer.on('credential-detected', (_e, data) => cb(data)),

    // Traduction de page
    translateChunk: (payload) => ipcRenderer.invoke('translate:chunk', payload),

    // Gestion des cookies
    getAllCookies: () => ipcRenderer.invoke('cookies:get-all'),
    removeCookie: (c) => ipcRenderer.invoke('cookies:remove', c),
    removeCookiesForDomain: (domain) => ipcRenderer.invoke('cookies:remove-domain', domain),
    removeAllCookies: () => ipcRenderer.invoke('cookies:remove-all'),

    // Extensions
    getExtensions: () => ipcRenderer.invoke('extensions:get-all'),
    installExtensionUnpacked: () => ipcRenderer.invoke('extensions:install-unpacked'),
    toggleExtension: (id, enabled) => ipcRenderer.invoke('extensions:toggle', { id, enabled }),
    removeExtension: (id) => ipcRenderer.invoke('extensions:remove', id),

    // Lecteur video et audio
    openVideoPlayer:()=>ipcRenderer.invoke("open-video-player"),
    openAudioPlayer:()=>ipcRenderer.invoke("open-audio-player"),
    openMedia:(file)=>ipcRenderer.invoke(
        "open-media",
        file
    ),

    onLoadVideo:(callback)=>{

        ipcRenderer.on("load-video",(event,file)=>{

            callback(file);

        });

    },

    onLoadAudio:(callback)=>{

        ipcRenderer.on("load-audio",(event,file)=>{

            callback(file);

        });

    },

    // Bouton "Ouvrir un fichier" à l'intérieur d'une fenêtre de lecteur
    chooseMediaFile:(type)=>ipcRenderer.invoke("player:choose-file", type),

    // Bouton "Charger un dossier" — sélectionne un dossier complet et
    // ajoute récursivement tous les fichiers média qu'il contient
    chooseMediaFolder:(type)=>ipcRenderer.invoke("player:choose-folder", type),

    // Glisser-déposer de fichiers ET/OU de dossiers dans la fenêtre du lecteur
    addMediaPaths:(type,paths)=>ipcRenderer.invoke("media:add-paths", { type, paths }),

    // Playlists, historique, reprise de lecture
    playMediaItem:(type,filePath)=>ipcRenderer.invoke("media:play-item", { type, filePath }),
    getMediaLibrary:()=>ipcRenderer.invoke("media:get-library"),
    addMediaFiles:(type,filePaths)=>ipcRenderer.invoke("media:add-files", { type, filePaths }),
    removeMediaItem:(type,id)=>ipcRenderer.invoke("media:remove-item", { type, id }),
    clearMediaPlaylist:(type)=>ipcRenderer.invoke("media:clear-playlist", type),
    reorderMediaPlaylist:(type,orderedIds)=>ipcRenderer.invoke("media:reorder", { type, orderedIds }),
    removeMediaHistoryItem:(id)=>ipcRenderer.invoke("media:remove-history-item", id),
    clearMediaHistory:()=>ipcRenderer.invoke("media:clear-history"),
    saveMediaPosition:(type,filePath,position,duration)=>ipcRenderer.invoke("media:save-position", { type, filePath, position, duration }),
    onThumbnailReady:(callback)=>ipcRenderer.on("media:thumbnail-ready",(event,data)=>callback(data)),

    // ------------------------------------------------------------
    // Gestionnaire PDF (module pdf-manager/)
    // ------------------------------------------------------------
    openPdfManager: (filePath) => ipcRenderer.invoke('open-pdf-manager', filePath),
    onPdfManagerOpenFile: (cb) => ipcRenderer.on('pdf-manager:open-file', (_e, filePath) => cb(filePath)),

    pdfCheckTools: (opts) => ipcRenderer.invoke('pdf:check-tools', opts),
    pdfChooseFiles: (opts) => ipcRenderer.invoke('pdf:choose-files', opts),
    pdfChooseSavePath: (opts) => ipcRenderer.invoke('pdf:choose-save-path', opts),
    pdfChooseFolder: () => ipcRenderer.invoke('pdf:choose-folder'),
    pdfGetInfo: (filePath) => ipcRenderer.invoke('pdf:get-info', filePath),

    pdfOrganize: (payload) => ipcRenderer.invoke('pdf:organize', payload),
    pdfMerge: (payload) => ipcRenderer.invoke('pdf:merge', payload),
    pdfSplit: (payload) => ipcRenderer.invoke('pdf:split', payload),
    pdfCompress: (payload) => ipcRenderer.invoke('pdf:compress', payload),
    pdfAddWatermark: (payload) => ipcRenderer.invoke('pdf:add-watermark', payload),
    pdfInsertBlankPages: (payload) => ipcRenderer.invoke('pdf:insert-blank-pages', payload),
    pdfConvert: (payload) => ipcRenderer.invoke('pdf:convert', payload),
    pdfOpenInApp: (filePath) => ipcRenderer.invoke('pdf:open-in-app', filePath),

    // ------------------------------------------------------------
    // Transfert de fichiers (module file-transfer/) — réseau local, façon Xender
    // ------------------------------------------------------------
    openFileTransfer: () => ipcRenderer.invoke('open-file-transfer'),

    // Chemin disque d'un fichier glissé-déposé (drag & drop natif)
    ftGetPathForFile: (file) => {
      try { return webUtils.getPathForFile(file); } catch { return file?.path || null; }
    },

    ftGetSelf: () => ipcRenderer.invoke('ft:get-self'),
    ftSetDeviceName: (name) => ipcRenderer.invoke('ft:set-device-name', name),
    ftSetEnabled: (enabled) => ipcRenderer.invoke('ft:set-enabled', enabled),

    ftGetPeers: () => ipcRenderer.invoke('ft:get-peers'),
    onFtPeersUpdate: (cb) => ipcRenderer.on('ft:peers-update', (_e, peers) => cb(peers)),
    ftConnectManual: (ip, port) => ipcRenderer.invoke('ft:connect-manual', { ip, port }),

    ftPairRequest: (peerId) => ipcRenderer.invoke('ft:pair-request', peerId),
    onFtPairIncoming: (cb) => ipcRenderer.on('ft:pair-incoming', (_e, data) => cb(data)),
    onFtPairRequestClosed: (cb) => ipcRenderer.on('ft:pair-request-closed', (_e, data) => cb(data)),
    onFtPairOutgoing: (cb) => ipcRenderer.on('ft:pair-outgoing', (_e, data) => cb(data)),
    onFtPairResult: (cb) => ipcRenderer.on('ft:pair-result', (_e, data) => cb(data)),
    ftRespondPair: (payload) => ipcRenderer.invoke('ft:respond-pair', payload),

    ftGetTrusted: () => ipcRenderer.invoke('ft:get-trusted'),
    ftRenameTrusted: (id, name) => ipcRenderer.invoke('ft:rename-trusted', { id, name }),
    ftSetAutoAccept: (id, autoAccept) => ipcRenderer.invoke('ft:set-auto-accept', { id, autoAccept }),
    ftRemoveTrusted: (id) => ipcRenderer.invoke('ft:remove-trusted', id),

    ftChooseFiles: () => ipcRenderer.invoke('ft:choose-files'),
    ftChooseFolder: () => ipcRenderer.invoke('ft:choose-folder'),
    ftSendFiles: (peerId, paths) => ipcRenderer.invoke('ft:send-files', { peerId, paths }),
    ftCancelSend: (batchId) => ipcRenderer.invoke('ft:cancel-send', batchId),
    onFtSendRequesting: (cb) => ipcRenderer.on('ft:send-requesting', (_e, data) => cb(data)),
    onFtSendProgress: (cb) => ipcRenderer.on('ft:send-progress', (_e, data) => cb(data)),
    onFtSendDeclined: (cb) => ipcRenderer.on('ft:send-declined', (_e, data) => cb(data)),
    onFtSendError: (cb) => ipcRenderer.on('ft:send-error', (_e, data) => cb(data)),
    onFtSendComplete: (cb) => ipcRenderer.on('ft:send-complete', (_e, data) => cb(data)),
    onFtSendCancelled: (cb) => ipcRenderer.on('ft:send-cancelled', (_e, data) => cb(data)),

    onFtTransferIncoming: (cb) => ipcRenderer.on('ft:transfer-incoming', (_e, data) => cb(data)),
    onFtTransferRequestClosed: (cb) => ipcRenderer.on('ft:transfer-request-closed', (_e, data) => cb(data)),
    ftRespondTransfer: (payload) => ipcRenderer.invoke('ft:respond-transfer', payload),
    onFtReceiveAutoAccepted: (cb) => ipcRenderer.on('ft:receive-auto-accepted', (_e, data) => cb(data)),
    onFtReceiveProgress: (cb) => ipcRenderer.on('ft:receive-progress', (_e, data) => cb(data)),
    onFtReceiveComplete: (cb) => ipcRenderer.on('ft:receive-complete', (_e, data) => cb(data)),

    ftGetHistory: () => ipcRenderer.invoke('ft:get-history'),
    ftClearHistory: () => ipcRenderer.invoke('ft:clear-history'),

    ftGetReceiveDir: () => ipcRenderer.invoke('ft:get-receive-dir'),
    ftChooseReceiveDir: () => ipcRenderer.invoke('ft:choose-receive-dir'),
    ftOpenReceiveDir: () => ipcRenderer.invoke('ft:open-receive-dir'),

    // ------------------------------------------------------------
    // Bloc-notes flottant : toujours accessible, glisser-déposer
    // (texte, liens, images, captures, vidéos), partagé entre fenêtres.
    // ------------------------------------------------------------
    // Chemin disque d'un fichier glissé-déposé (drag & drop natif) —
    // même utilité que ftGetPathForFile, exposé sous un nom générique.
    getPathForFile: (file) => {
      try { return webUtils.getPathForFile(file); } catch { return file?.path || null; }
    },
    notepadGetState: () => ipcRenderer.invoke('notepad:get-state'),
    notepadAddItem: (payload) => ipcRenderer.invoke('notepad:add-item', payload),
    notepadUpdateItem: (id, patch) => ipcRenderer.invoke('notepad:update-item', { id, patch }),
    notepadRemoveItem: (id) => ipcRenderer.invoke('notepad:remove-item', id),
    notepadClearAll: () => ipcRenderer.invoke('notepad:clear-all'),
    notepadSetUiState: (partial) => ipcRenderer.invoke('notepad:set-ui-state', partial),
    onNotepadUpdated: (cb) => ipcRenderer.on('notepad:updated', (_e, state) => cb(state)),

});