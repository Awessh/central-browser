// ============================================================
// Transfert de fichiers en réseau local (façon Xender)
// ============================================================
// Module autonome (comme players/ ou pdf-manager/) : aucune dépendance
// npm supplémentaire, uniquement des modules natifs de Node.
//
// Principe :
//  - Découverte : chaque instance de l'appli diffuse (UDP broadcast) sa
//    présence toutes les 2s sur le port DISCOVERY_PORT, et écoute les
//    annonces des autres. Les appareils "vus" récemment forment la liste
//    des appareils disponibles (purge automatique après 8s de silence).
//  - Appairage : optionnel mais recommandé — envoie une demande HTTP avec
//    un code à 4 chiffres affiché des deux côtés (repère visuel, comme un
//    appairage Bluetooth). Une fois accepté, l'appareil est mémorisé
//    (nom personnalisable, option "toujours accepter automatiquement").
//  - Transfert : chaque instance héberge un petit serveur HTTP local.
//    L'envoi POST d'abord les métadonnées (liste de fichiers, taille) —
//    le destinataire accepte ou refuse — puis chaque fichier est streamé
//    en HTTP brut (pas de multipart, pas de base64 : vitesse maximale).
//
// Aucune donnée ne transite par Internet : tout se fait en HTTP/UDP en
// clair sur le réseau local, entre les deux appareils uniquement.
// ============================================================

const dgram = require('dgram');
const http = require('http');
const os = require('os');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DISCOVERY_PORT = 48521;
const ANNOUNCE_INTERVAL_MS = 2000;
const PEER_TIMEOUT_MS = 8000;
const PEER_PRUNE_INTERVAL_MS = 3000;
const PAIR_REQUEST_TIMEOUT_MS = 30000;
const TRANSFER_REQUEST_TIMEOUT_MS = 60000;
const PROGRESS_THROTTLE_MS = 180;
const HISTORY_LIMIT = 200;
const MAX_JSON_BODY = 5 * 1024 * 1024; // 5 Mo — largement suffisant pour une liste de fichiers

function initFileTransfer({ app, ipcMain, BrowserWindow, dialog, shell, preloadPath }) {
  const DATA_PATH = path.join(app.getPath('userData'), 'file-transfer-data.json');

  // ------------------------------------------------------------
  // Stockage local (identité de l'appareil, appareils de confiance, historique)
  // ------------------------------------------------------------
  const DEFAULT_STORE = {
    deviceId: crypto.randomUUID(),
    deviceName: (os.hostname() || 'Cet appareil').replace(/\.(local|lan)$/i, ''),
    enabled: true,
    receiveDir: path.join(app.getPath('downloads'), 'Transferts reçus'),
    trustedDevices: {}, // { [peerId]: { name, platform, autoAccept, pairedAt } }
    history: [],        // { id, direction, peerName, files:[{name,size}], totalSize, status, startedAt, finishedAt, saveDir? }
  };

  function loadStore() {
    try {
      const raw = fs.readFileSync(DATA_PATH, 'utf-8');
      const parsed = JSON.parse(raw);
      return {
        ...DEFAULT_STORE,
        ...parsed,
        trustedDevices: { ...(parsed.trustedDevices || {}) },
        history: Array.isArray(parsed.history) ? parsed.history : [],
      };
    } catch {
      return JSON.parse(JSON.stringify(DEFAULT_STORE));
    }
  }

  const store = loadStore();
  let persistTimer = null;
  function persistStore() {
    clearTimeout(persistTimer);
    persistTimer = setTimeout(() => {
      try { fs.writeFileSync(DATA_PATH, JSON.stringify(store, null, 2), 'utf-8'); } catch { /* best effort */ }
    }, 150);
  }

  function addHistory(entry) {
    store.history.unshift({
      id: crypto.randomUUID(),
      finishedAt: Date.now(),
      ...entry,
    });
    if (store.history.length > HISTORY_LIMIT) store.history.length = HISTORY_LIMIT;
    persistStore();
  }

  // ------------------------------------------------------------
  // Fenêtre dédiée
  // ------------------------------------------------------------
  let ftWindow = null;

  function createFileTransferWindow() {
    if (ftWindow && !ftWindow.isDestroyed()) {
      ftWindow.focus();
      return ftWindow;
    }
    ftWindow = new BrowserWindow({
      width: 1060,
      height: 700,
      minWidth: 780,
      minHeight: 540,
      autoHideMenuBar: true,
      webPreferences: {
        preload: preloadPath,
        contextIsolation: true,
        nodeIntegration: false,
      },
    });
    ftWindow.loadFile(path.join(__dirname, 'file-transfer.html'));
    ftWindow.on('closed', () => { ftWindow = null; });
    return ftWindow;
  }

  function sendToWindow(channel, payload) {
    if (ftWindow && !ftWindow.isDestroyed()) {
      ftWindow.webContents.send(channel, payload);
    }
  }

  // Ouvre (si besoin) la fenêtre puis lui envoie l'événement une fois
  // chargée — utilisé pour les demandes entrantes (appairage/transfert)
  // afin que l'utilisateur voie la boîte de dialogue même si la fenêtre
  // « Transfert de fichiers » n'était pas déjà ouverte.
  function notifyWindow(channel, payload) {
    if (ftWindow && !ftWindow.isDestroyed()) {
      ftWindow.focus();
      ftWindow.webContents.send(channel, payload);
      return;
    }
    const win = createFileTransferWindow();
    win.webContents.once('did-finish-load', () => win.webContents.send(channel, payload));
  }

  // ------------------------------------------------------------
  // Découverte réseau (UDP broadcast)
  // ------------------------------------------------------------
  const peers = new Map(); // id -> { id, name, platform, ip, httpPort, lastSeen }
  let udpSocket = null;
  let announceTimer = null;
  let pruneTimer = null;
  let httpServer = null;
  let httpPort = 0;
  let running = false;

  function getBroadcastAddresses() {
    const addrs = new Set(['255.255.255.255']);
    const ifaces = os.networkInterfaces();
    for (const list of Object.values(ifaces)) {
      for (const iface of list || []) {
        if (iface.family === 'IPv4' && !iface.internal && iface.netmask) {
          const ip = iface.address.split('.').map(Number);
          const mask = iface.netmask.split('.').map(Number);
          const bcast = ip.map((p, i) => (p | ((~mask[i]) & 255)) & 255);
          addrs.add(bcast.join('.'));
        }
      }
    }
    return [...addrs];
  }

  function broadcastAnnounce() {
    if (!udpSocket || !httpPort) return;
    const payload = Buffer.from(JSON.stringify({
      type: 'ft-announce',
      v: 1,
      id: store.deviceId,
      name: store.deviceName,
      platform: process.platform,
      httpPort,
      ts: Date.now(),
    }));
    for (const addr of getBroadcastAddresses()) {
      udpSocket.send(payload, DISCOVERY_PORT, addr, () => { /* best effort */ });
    }
  }

  function broadcastBye() {
    if (!udpSocket || !httpPort) return;
    const payload = Buffer.from(JSON.stringify({ type: 'ft-bye', id: store.deviceId }));
    for (const addr of getBroadcastAddresses()) {
      try { udpSocket.send(payload, DISCOVERY_PORT, addr, () => {}); } catch { /* ignore */ }
    }
  }

  function upsertPeer(info, ip) {
    if (info.id === store.deviceId) return; // s'ignorer soi-même
    const existing = peers.get(info.id);
    const wasNew = !existing;
    peers.set(info.id, {
      id: info.id,
      name: info.name || 'Appareil inconnu',
      platform: info.platform || 'unknown',
      ip,
      httpPort: info.httpPort,
      lastSeen: Date.now(),
    });
    if (wasNew || existing.name !== info.name || existing.ip !== ip) publishPeers();
  }

  function publishPeers() {
    sendToWindow('ft:peers-update', getPeerList());
  }

  function getPeerList() {
    return [...peers.values()]
      .map((p) => ({
        id: p.id,
        name: p.name,
        platform: p.platform,
        ip: p.ip,
        httpPort: p.httpPort,
        trusted: !!store.trustedDevices[p.id],
        autoAccept: !!store.trustedDevices[p.id]?.autoAccept,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  function pruneStalePeers() {
    const now = Date.now();
    let changed = false;
    for (const [id, p] of peers) {
      if (now - p.lastSeen > PEER_TIMEOUT_MS) { peers.delete(id); changed = true; }
    }
    if (changed) publishPeers();
  }

  // ------------------------------------------------------------
  // Utilitaires HTTP internes (requêtes JSON et réponses)
  // ------------------------------------------------------------
  function readJsonBody(req) {
    return new Promise((resolve, reject) => {
      let size = 0;
      const chunks = [];
      req.on('data', (chunk) => {
        size += chunk.length;
        if (size > MAX_JSON_BODY) { req.destroy(); reject(new Error('body too large')); return; }
        chunks.push(chunk);
      });
      req.on('end', () => {
        try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf-8') || '{}')); }
        catch (e) { reject(e); }
      });
      req.on('error', reject);
    });
  }

  function safeRespondJson(res, status, obj) {
    if (res.writableEnded || res.headersSent) return;
    try {
      res.writeHead(status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(obj));
    } catch { /* la connexion a peut-être déjà été fermée par le client */ }
  }

  function httpPostJson(host, port, pathName, bodyObj, timeoutMs) {
    const bodyStr = JSON.stringify(bodyObj);
    return new Promise((resolve, reject) => {
      const req = http.request({
        host, port, path: pathName, method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(bodyStr) },
      }, (res) => {
        let data = '';
        res.on('data', (c) => { data += c; });
        res.on('end', () => {
          try { resolve(JSON.parse(data || '{}')); } catch (e) { reject(e); }
        });
      });
      req.on('error', reject);
      if (timeoutMs) req.setTimeout(timeoutMs, () => req.destroy(new Error('Délai dépassé')));
      req.write(bodyStr);
      req.end();
    });
  }

  function httpGetJson(host, port, pathName, timeoutMs) {
    return new Promise((resolve, reject) => {
      const req = http.request({ host, port, path: pathName, method: 'GET' }, (res) => {
        let data = '';
        res.on('data', (c) => { data += c; });
        res.on('end', () => {
          try { resolve(JSON.parse(data || '{}')); } catch (e) { reject(e); }
        });
      });
      req.on('error', reject);
      if (timeoutMs) req.setTimeout(timeoutMs, () => req.destroy(new Error('Délai dépassé')));
      req.end();
    });
  }

  function httpPostFireAndForget(host, port, pathName, bodyObj) {
    try {
      const bodyStr = JSON.stringify(bodyObj || {});
      const req = http.request({
        host, port, path: pathName, method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(bodyStr) },
      });
      req.on('error', () => {});
      req.write(bodyStr);
      req.end();
    } catch { /* best effort */ }
  }

  // Empêche toute évasion du dossier de destination via un relPath malicieux
  function sanitizeRelPath(relPath) {
    const parts = String(relPath || '').split(/[\\/]+/)
      .filter((seg) => seg && seg !== '.' && seg !== '..' && !seg.includes(':'));
    return parts.length ? parts : ['fichier'];
  }

  function sanitizeFolderName(name) {
    return String(name || 'Appareil inconnu').replace(/[\\/:*?"<>|]+/g, '_').trim().slice(0, 80) || 'Appareil inconnu';
  }

  // ------------------------------------------------------------
  // Réception : demandes d'appairage en attente + transferts entrants
  // ------------------------------------------------------------
  const pendingPairRequests = new Map(); // reqId -> { res, timer, fromId, fromName }
  const incomingTransferRequests = new Map(); // reqId -> { res, timer, fromId, fromName, batchId, files, totalSize }
  const incomingBatches = new Map(); // batchId -> { fromName, dir, files, totalSize, receivedBytes, doneCount, startedAt }

  function handlePairRequest(req, res) {
    readJsonBody(req).then((body) => {
      const reqId = crypto.randomUUID();
      const timer = setTimeout(() => {
        pendingPairRequests.delete(reqId);
        safeRespondJson(res, 200, { accepted: false, reason: 'timeout' });
        sendToWindow('ft:pair-request-closed', { reqId });
      }, PAIR_REQUEST_TIMEOUT_MS);
      pendingPairRequests.set(reqId, { res, timer, fromId: body.fromId, fromName: body.fromName });
      notifyWindow('ft:pair-incoming', {
        reqId, fromId: body.fromId, fromName: body.fromName || 'Appareil inconnu',
        platform: body.platform, code: body.code,
      });
    }).catch(() => safeRespondJson(res, 400, { accepted: false, reason: 'bad-request' }));
  }

  function handleTransferRequest(req, res) {
    readJsonBody(req).then((body) => {
      const { fromId, fromName, batchId, files, totalSize } = body;
      if (!batchId || !Array.isArray(files) || !files.length) {
        safeRespondJson(res, 400, { accepted: false, reason: 'bad-request' });
        return;
      }
      const trusted = store.trustedDevices[fromId];
      if (trusted && trusted.autoAccept) {
        acceptIncomingBatch({ fromId, fromName, batchId, files, totalSize });
        safeRespondJson(res, 200, { accepted: true });
        sendToWindow('ft:receive-auto-accepted', { fromName, batchId, files, totalSize });
        return;
      }
      const reqId = crypto.randomUUID();
      const timer = setTimeout(() => {
        incomingTransferRequests.delete(reqId);
        safeRespondJson(res, 200, { accepted: false, reason: 'timeout' });
        sendToWindow('ft:transfer-request-closed', { reqId });
      }, TRANSFER_REQUEST_TIMEOUT_MS);
      incomingTransferRequests.set(reqId, { res, timer, fromId, fromName, batchId, files, totalSize });
      notifyWindow('ft:transfer-incoming', {
        reqId, fromId, fromName: fromName || 'Appareil inconnu', batchId, files, totalSize,
        alreadyTrusted: !!trusted,
      });
    }).catch(() => safeRespondJson(res, 400, { accepted: false, reason: 'bad-request' }));
  }

  function acceptIncomingBatch({ fromId, fromName, batchId, files, totalSize }) {
    const dir = path.join(store.receiveDir, sanitizeFolderName(fromName));
    fs.mkdirSync(dir, { recursive: true });
    incomingBatches.set(batchId, {
      fromId,
      fromName: fromName || 'Appareil inconnu',
      dir,
      files,
      totalSize: totalSize || files.reduce((s, f) => s + (f.size || 0), 0),
      receivedBytes: 0,
      doneCount: 0,
      cancelled: false,
      startedAt: Date.now(),
    });
  }

  function handleFileUpload(req, res, batchId, index) {
    const batch = incomingBatches.get(batchId);
    const meta = batch && batch.files[index];
    if (!batch || batch.cancelled || !meta) {
      res.writeHead(403); res.end(); req.resume(); return;
    }
    const relParts = sanitizeRelPath(meta.relPath || meta.name);
    const destPath = path.join(batch.dir, ...relParts);
    fs.mkdirSync(path.dirname(destPath), { recursive: true });

    let received = 0;
    let lastEmit = 0;
    const ws = fs.createWriteStream(destPath);

    req.on('data', (chunk) => {
      received += chunk.length;
      batch.receivedBytes += chunk.length;
      const now = Date.now();
      if (now - lastEmit > PROGRESS_THROTTLE_MS || received >= meta.size) {
        lastEmit = now;
        sendToWindow('ft:receive-progress', {
          batchId, index, fileName: meta.name, received, size: meta.size,
          totalReceived: batch.receivedBytes, totalSize: batch.totalSize,
        });
      }
    });
    req.on('aborted', () => {
      ws.destroy();
      try { fs.unlinkSync(destPath); } catch { /* ignore */ }
    });
    req.on('error', () => ws.destroy());

    req.pipe(ws);

    ws.on('finish', () => {
      safeRespondJson(res, 200, { ok: true });
      batch.doneCount += 1;
      if (batch.doneCount >= batch.files.length) finalizeIncomingBatch(batchId, 'completed');
    });
    ws.on('error', () => { try { res.writeHead(500); res.end(); } catch { /* ignore */ } });
  }

  function finalizeIncomingBatch(batchId, status) {
    const batch = incomingBatches.get(batchId);
    if (!batch) return;
    incomingBatches.delete(batchId);
    addHistory({
      direction: 'received',
      peerName: batch.fromName,
      files: batch.files.map((f) => ({ name: f.name, size: f.size })),
      totalSize: batch.totalSize,
      status,
      startedAt: batch.startedAt,
      saveDir: batch.dir,
    });
    sendToWindow('ft:receive-complete', { batchId, status, dir: batch.dir, fromName: batch.fromName });
  }

  function handleRemoteCancel(req, res, batchId) {
    const batch = incomingBatches.get(batchId);
    if (batch) {
      batch.cancelled = true;
      finalizeIncomingBatch(batchId, 'cancelled');
    }
    res.writeHead(200); res.end();
  }

  // ------------------------------------------------------------
  // Serveur HTTP (réception des demandes + des fichiers)
  // ------------------------------------------------------------
  function requestListener(req, res) {
    let u;
    try { u = new URL(req.url, 'http://localhost'); } catch { res.writeHead(400); res.end(); return; }
    const parts = u.pathname.split('/').filter(Boolean);

    if (parts[0] !== 'xfer') { res.writeHead(404); res.end(); return; }
    if (req.method === 'POST' && parts[1] === 'pair-request') return handlePairRequest(req, res);
    if (req.method === 'POST' && parts[1] === 'transfer-request') return handleTransferRequest(req, res);
    if (req.method === 'POST' && parts[1] === 'send' && parts.length === 4) {
      return handleFileUpload(req, res, parts[2], Number(parts[3]));
    }
    if (req.method === 'POST' && parts[1] === 'cancel' && parts.length === 3) {
      return handleRemoteCancel(req, res, parts[2]);
    }
    if (req.method === 'GET' && parts[1] === 'ping') {
      safeRespondJson(res, 200, { name: store.deviceName, id: store.deviceId });
      return;
    }
    res.writeHead(404); res.end();
  }

  // ------------------------------------------------------------
  // Démarrage / arrêt du service (découverte + serveur HTTP)
  // ------------------------------------------------------------
  function startDiscovery() {
    if (running || !store.enabled) return;
    running = true;

    httpServer = http.createServer(requestListener);
    httpServer.on('error', () => { /* port déjà utilisé, très improbable : on ignore */ });
    httpServer.listen(0, () => {
      httpPort = httpServer.address().port;

      udpSocket = dgram.createSocket({ type: 'udp4', reuseAddr: true });
      udpSocket.on('message', (msg, rinfo) => {
        try {
          const info = JSON.parse(msg.toString('utf-8'));
          if (info.type === 'ft-announce' && info.id) upsertPeer(info, rinfo.address);
          else if (info.type === 'ft-bye' && info.id) { if (peers.delete(info.id)) publishPeers(); }
        } catch { /* paquet non conforme, on ignore */ }
      });
      udpSocket.on('error', () => { /* réseau indisponible : la découverte est simplement inactive */ });
      udpSocket.bind(DISCOVERY_PORT, () => {
        try { udpSocket.setBroadcast(true); } catch { /* certains environnements le refusent */ }
        broadcastAnnounce();
        announceTimer = setInterval(broadcastAnnounce, ANNOUNCE_INTERVAL_MS);
        pruneTimer = setInterval(pruneStalePeers, PEER_PRUNE_INTERVAL_MS);
      });
    });
  }

  function stopDiscovery() {
    if (!running) return;
    running = false;
    broadcastBye();
    clearInterval(announceTimer);
    clearInterval(pruneTimer);
    peers.clear();
    try { udpSocket?.close(); } catch { /* ignore */ }
    try { httpServer?.close(); } catch { /* ignore */ }
    udpSocket = null;
    httpServer = null;
    httpPort = 0;
  }

  // ------------------------------------------------------------
  // Envoi de fichiers (côté expéditeur)
  // ------------------------------------------------------------
  const activeSends = new Map(); // batchId -> { cancelled, currentReq }

  function collectFiles(inputPaths) {
    const results = [];
    function walk(p, relParts) {
      let stat;
      try { stat = fs.statSync(p); } catch { return; }
      if (stat.isDirectory()) {
        const name = path.basename(p);
        for (const entry of fs.readdirSync(p)) walk(path.join(p, entry), [...relParts, name]);
      } else if (stat.isFile()) {
        const name = path.basename(p);
        results.push({
          absPath: p,
          name,
          size: stat.size,
          relPath: [...relParts, name].join('/'),
        });
      }
    }
    for (const p of inputPaths) walk(p, []);
    return results;
  }

  function uploadFile(peer, batchId, index, file, onProgress) {
    return new Promise((resolve, reject) => {
      const req = http.request({
        host: peer.ip,
        port: peer.httpPort,
        path: `/xfer/send/${batchId}/${index}`,
        method: 'POST',
        headers: { 'Content-Type': 'application/octet-stream', 'Content-Length': file.size },
      }, (res) => {
        res.resume();
        if (res.statusCode === 200) resolve(); else reject(new Error(`HTTP ${res.statusCode}`));
      });
      req.on('error', reject);
      const state = activeSends.get(batchId);
      if (state) state.currentReq = req;

      const rs = fs.createReadStream(file.absPath);
      rs.on('data', (chunk) => onProgress(chunk.length));
      rs.on('error', reject);
      rs.pipe(req);
    });
  }

  async function sendFilesToPeer(peerId, inputPaths) {
    const peer = peers.get(peerId);
    if (!peer) throw new Error("Cet appareil n'est plus disponible sur le réseau.");

    const files = collectFiles(inputPaths);
    if (!files.length) throw new Error('Aucun fichier à envoyer.');

    const batchId = crypto.randomUUID();
    const totalSize = files.reduce((s, f) => s + f.size, 0);
    const meta = files.map((f) => ({ name: f.name, relPath: f.relPath, size: f.size }));

    activeSends.set(batchId, { cancelled: false, currentReq: null });
    sendToWindow('ft:send-requesting', { batchId, peerId, peerName: peer.name, files: meta, totalSize });

    let result;
    try {
      result = await httpPostJson(peer.ip, peer.httpPort, '/xfer/transfer-request', {
        fromId: store.deviceId, fromName: store.deviceName, batchId, files: meta, totalSize,
      }, TRANSFER_REQUEST_TIMEOUT_MS + 5000);
    } catch {
      activeSends.delete(batchId);
      sendToWindow('ft:send-error', { batchId, message: "Impossible de joindre l'appareil (hors ligne ?)." });
      addHistory({ direction: 'sent', peerName: peer.name, files: meta, totalSize, status: 'failed', startedAt: Date.now() });
      return { ok: false };
    }

    if (!result.accepted) {
      activeSends.delete(batchId);
      sendToWindow('ft:send-declined', { batchId, reason: result.reason });
      addHistory({ direction: 'sent', peerName: peer.name, files: meta, totalSize, status: 'declined', startedAt: Date.now() });
      return { ok: false };
    }

    let totalSent = 0;
    let lastEmit = 0;
    let failed = false;
    const startedAt = Date.now();

    for (let i = 0; i < files.length; i += 1) {
      const state = activeSends.get(batchId);
      if (!state || state.cancelled) break;
      try {
        await uploadFile(peer, batchId, i, files[i], (delta) => {
          totalSent += delta;
          const now = Date.now();
          if (now - lastEmit > PROGRESS_THROTTLE_MS || totalSent === totalSize) {
            lastEmit = now;
            sendToWindow('ft:send-progress', {
              batchId, index: i, fileName: files[i].name, totalSent, totalSize,
              elapsedMs: now - startedAt,
            });
          }
        });
      } catch {
        failed = true;
        sendToWindow('ft:send-error', { batchId, message: `Échec de l'envoi de "${files[i].name}".` });
        break;
      }
    }

    const wasCancelled = !activeSends.has(batchId) ? false : activeSends.get(batchId).cancelled;
    activeSends.delete(batchId);

    const status = wasCancelled ? 'cancelled' : (failed ? 'failed' : 'completed');
    addHistory({ direction: 'sent', peerName: peer.name, files: meta, totalSize, status, startedAt });
    if (status === 'completed') sendToWindow('ft:send-complete', { batchId });
    return { ok: status === 'completed' };
  }

  function cancelSend(batchId) {
    const state = activeSends.get(batchId);
    if (!state) return false;
    state.cancelled = true;
    try { state.currentReq?.destroy(); } catch { /* ignore */ }
    sendToWindow('ft:send-cancelled', { batchId });
    return true;
  }

  // ------------------------------------------------------------
  // Appairage (côté demandeur)
  // ------------------------------------------------------------
  function saveTrustedDevice(peerId, patch) {
    const current = store.trustedDevices[peerId] || {};
    store.trustedDevices[peerId] = { pairedAt: Date.now(), autoAccept: false, ...current, ...patch };
    persistStore();
  }

  async function requestPairing(peerId) {
    const peer = peers.get(peerId);
    if (!peer) throw new Error("Cet appareil n'est plus disponible sur le réseau.");
    const code = String(Math.floor(1000 + Math.random() * 9000));
    sendToWindow('ft:pair-outgoing', { peerId, peerName: peer.name, code });
    let result;
    try {
      result = await httpPostJson(peer.ip, peer.httpPort, '/xfer/pair-request', {
        fromId: store.deviceId, fromName: store.deviceName, platform: process.platform, code,
      }, PAIR_REQUEST_TIMEOUT_MS + 5000);
    } catch {
      sendToWindow('ft:pair-result', { peerId, accepted: false, reason: 'unreachable' });
      return { accepted: false };
    }
    if (result.accepted) saveTrustedDevice(peerId, { name: peer.name, platform: peer.platform });
    sendToWindow('ft:pair-result', { peerId, accepted: result.accepted, reason: result.reason });
    return result;
  }

  // ------------------------------------------------------------
  // Connexion manuelle par adresse IP (repli si le broadcast est filtré
  // par le routeur/point d'accès — cas fréquent sur certains hotspots
  // mobiles ou réseaux d'entreprise avec isolation des clients)
  // ------------------------------------------------------------
  async function connectManually(ip, port) {
    const result = await httpGetJson(ip, Number(port), '/xfer/ping', 5000).catch(() => null);
    if (!result || !result.id) throw new Error("Impossible de joindre cet appareil à cette adresse.");
    upsertPeer({ id: result.id, name: result.name, platform: 'unknown', httpPort: Number(port) }, ip);
    return getPeerList().find((p) => p.id === result.id);
  }

  // ------------------------------------------------------------
  // IPC exposés au renderer
  // ------------------------------------------------------------
  ipcMain.handle('open-file-transfer', () => { createFileTransferWindow(); });

  ipcMain.handle('ft:get-self', () => ({
    deviceId: store.deviceId, deviceName: store.deviceName, enabled: store.enabled, httpPort,
  }));

  ipcMain.handle('ft:set-device-name', (_e, name) => {
    const clean = String(name || '').trim().slice(0, 60);
    if (clean) { store.deviceName = clean; persistStore(); broadcastAnnounce(); }
    return store.deviceName;
  });

  ipcMain.handle('ft:set-enabled', (_e, enabled) => {
    store.enabled = !!enabled;
    persistStore();
    if (store.enabled) startDiscovery(); else stopDiscovery();
    return store.enabled;
  });

  ipcMain.handle('ft:get-peers', () => getPeerList());

  ipcMain.handle('ft:connect-manual', async (_e, { ip, port }) => {
    try { return { ok: true, peer: await connectManually(ip, port) }; }
    catch (err) { return { ok: false, message: err.message }; }
  });

  ipcMain.handle('ft:pair-request', async (_e, peerId) => {
    try { return await requestPairing(peerId); }
    catch (err) { return { accepted: false, message: err.message }; }
  });

  ipcMain.handle('ft:respond-pair', (_e, { reqId, accepted, displayName }) => {
    const pending = pendingPairRequests.get(reqId);
    if (!pending) return false;
    clearTimeout(pending.timer);
    pendingPairRequests.delete(reqId);
    if (accepted) saveTrustedDevice(pending.fromId, { name: displayName || pending.fromName });
    safeRespondJson(pending.res, 200, { accepted, name: store.deviceName });
    return true;
  });

  ipcMain.handle('ft:get-trusted', () => (
    Object.entries(store.trustedDevices).map(([id, d]) => ({ id, ...d }))
  ));

  ipcMain.handle('ft:rename-trusted', (_e, { id, name }) => {
    if (store.trustedDevices[id] && name && name.trim()) {
      store.trustedDevices[id].name = name.trim().slice(0, 60);
      persistStore();
    }
    return true;
  });

  ipcMain.handle('ft:set-auto-accept', (_e, { id, autoAccept }) => {
    if (store.trustedDevices[id]) { store.trustedDevices[id].autoAccept = !!autoAccept; persistStore(); }
    return true;
  });

  ipcMain.handle('ft:remove-trusted', (_e, id) => {
    delete store.trustedDevices[id];
    persistStore();
    return true;
  });

  ipcMain.handle('ft:respond-transfer', (_e, { reqId, accepted, alwaysAccept }) => {
    const pending = incomingTransferRequests.get(reqId);
    if (!pending) return false;
    clearTimeout(pending.timer);
    incomingTransferRequests.delete(reqId);
    if (accepted) {
      acceptIncomingBatch(pending);
      if (alwaysAccept) saveTrustedDevice(pending.fromId, { name: pending.fromName, autoAccept: true });
    }
    safeRespondJson(pending.res, 200, { accepted });
    return true;
  });

  ipcMain.handle('ft:choose-files', async () => {
    const result = await dialog.showOpenDialog({ properties: ['openFile', 'multiSelections'] });
    return result.canceled ? [] : result.filePaths;
  });

  ipcMain.handle('ft:choose-folder', async () => {
    const result = await dialog.showOpenDialog({ properties: ['openDirectory'] });
    return result.canceled ? [] : result.filePaths;
  });

  ipcMain.handle('ft:send-files', (_e, { peerId, paths }) => sendFilesToPeer(peerId, paths || []));

  ipcMain.handle('ft:cancel-send', (_e, batchId) => cancelSend(batchId));

  ipcMain.handle('ft:get-history', () => store.history);
  ipcMain.handle('ft:clear-history', () => { store.history = []; persistStore(); return true; });

  ipcMain.handle('ft:get-receive-dir', () => store.receiveDir);
  ipcMain.handle('ft:choose-receive-dir', async () => {
    const result = await dialog.showOpenDialog({ properties: ['openDirectory', 'createDirectory'] });
    if (result.canceled || !result.filePaths[0]) return store.receiveDir;
    store.receiveDir = result.filePaths[0];
    persistStore();
    return store.receiveDir;
  });
  ipcMain.handle('ft:open-receive-dir', () => shell.openPath(store.receiveDir));

  app.on('before-quit', () => stopDiscovery());

  return { createFileTransferWindow, startDiscovery, stopDiscovery };
}

module.exports = { initFileTransfer };
