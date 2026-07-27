const api = window.browserAPI;

// ============================================================
// Utilitaires
// ============================================================
function formatBytes(bytes) {
    if (!bytes && bytes !== 0) return '';
    if (bytes < 1024) return `${bytes} o`;
    const units = ['Ko', 'Mo', 'Go', 'To'];
    let val = bytes / 1024;
    let i = 0;
    while (val >= 1024 && i < units.length - 1) { val /= 1024; i += 1; }
    return `${val.toFixed(val >= 10 ? 0 : 1)} ${units[i]}`;
}

function formatSpeed(bytesPerSec) {
    if (!bytesPerSec || bytesPerSec <= 0) return '';
    return `${formatBytes(bytesPerSec)}/s`;
}

function formatEta(remainingBytes, bytesPerSec) {
    if (!bytesPerSec || bytesPerSec <= 0) return '';
    const secs = Math.round(remainingBytes / bytesPerSec);
    if (secs < 60) return `${secs} s restantes`;
    const mins = Math.floor(secs / 60);
    const rem = secs % 60;
    return `${mins} min ${rem} s restantes`;
}

function formatDate(ts) {
    if (!ts) return '';
    const d = new Date(ts);
    const now = new Date();
    const sameDay = d.toDateString() === now.toDateString();
    const time = d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    if (sameDay) return `Aujourd'hui à ${time}`;
    return `${d.toLocaleDateString('fr-FR')} à ${time}`;
}

function platformIcon(platform) {
    if (platform === 'win32') return 'fa-brands fa-windows';
    if (platform === 'darwin') return 'fa-brands fa-apple';
    if (platform === 'linux') return 'fa-brands fa-linux';
    return 'fa-solid fa-desktop';
}

function el(html) {
    const wrap = document.createElement('div');
    wrap.innerHTML = html.trim();
    return wrap.firstElementChild;
}

function showToast(message, type = 'info') {
    const icon = type === 'success' ? 'fa-circle-check' : type === 'error' ? 'fa-circle-exclamation' : 'fa-circle-info';
    const toast = el(`<div class="toast ${type}"><i class="fa-solid ${icon}"></i><span>${message}</span></div>`);
    document.getElementById('toast-stack').appendChild(toast);
    setTimeout(() => { toast.style.opacity = '0'; toast.style.transition = 'opacity .3s'; setTimeout(() => toast.remove(), 300); }, 4200);
}

function openOverlay(id) { document.getElementById(id).classList.remove('hidden'); }
function closeOverlay(id) { document.getElementById(id).classList.add('hidden'); }

document.querySelectorAll('[data-close]').forEach((btn) => {
    btn.addEventListener('click', () => closeOverlay(btn.dataset.close));
});

// ============================================================
// État
// ============================================================
let selfInfo = { deviceId: '', deviceName: '' };
let peers = [];
let trusted = [];
let history_ = [];
const activeTransfers = new Map(); // batchId -> { direction, peerName, files, totalSize, done, status, currentFileName, sentOrReceived }
let pendingSendPaths = null; // fichiers choisis en attente de destinataire

// ============================================================
// Onglets
// ============================================================
document.querySelectorAll('.tab-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.tab-btn').forEach((b) => b.classList.remove('active'));
        document.querySelectorAll('.tab-panel').forEach((p) => p.classList.remove('active'));
        btn.classList.add('active');
        document.getElementById(`tab-${btn.dataset.tab}`).classList.add('active');
    });
});

function updateTransfersBadge() {
    const badge = document.getElementById('transfers-badge');
    const n = activeTransfers.size;
    badge.textContent = String(n);
    badge.classList.toggle('hidden', n === 0);
}

// ============================================================
// Mon appareil
// ============================================================
async function loadSelf() {
    selfInfo = await api.ftGetSelf();
    document.getElementById('self-name').textContent = selfInfo.deviceName;
    document.getElementById('settings-device-name').value = selfInfo.deviceName;
    document.getElementById('settings-enabled-toggle').checked = !!selfInfo.enabled;
    document.querySelector('#self-status .dot').className = `dot ${selfInfo.enabled ? 'dot-on' : 'dot-off'}`;
    document.querySelector('#self-status').lastChild.textContent = selfInfo.enabled ? ' Détectable sur le réseau' : ' Découverte désactivée';
}

document.getElementById('self-name-edit-btn').addEventListener('click', () => {
    const span = document.getElementById('self-name');
    const input = document.createElement('input');
    input.type = 'text';
    input.value = span.textContent;
    input.maxLength = 60;
    input.style.cssText = 'width:140px;font-size:13.5px;background:var(--bg-elevated);color:var(--text);border:1px solid var(--border);border-radius:6px;padding:3px 6px;';
    span.replaceWith(input);
    input.focus();
    input.select();
    const commit = async () => {
        const name = await api.ftSetDeviceName(input.value.trim() || selfInfo.deviceName);
        selfInfo.deviceName = name;
        const newSpan = document.createElement('span');
        newSpan.id = 'self-name';
        newSpan.textContent = name;
        input.replaceWith(newSpan);
        document.getElementById('settings-device-name').value = name;
    };
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') input.blur(); });
    input.addEventListener('blur', commit, { once: true });
});

// ============================================================
// Appareils découverts
// ============================================================
function deviceCard(peer, { forPicker = false } = {}) {
    const trustedTag = peer.trusted
        ? `<span class="trusted-tag"><i class="fa-solid fa-shield-halved"></i> Appairé${peer.autoAccept ? ' · auto' : ''}</span>`
        : '';
    if (forPicker) {
        const row = el(`
            <div class="picker-device-row" data-id="${peer.id}">
                <div class="device-avatar"><i class="${platformIcon(peer.platform)}"></i></div>
                <div class="device-meta">
                    <div class="device-name">${peer.name}</div>
                    <div class="device-sub">${peer.ip}${peer.trusted ? ' · appairé' : ''}</div>
                </div>
            </div>`);
        row.addEventListener('click', () => { closeOverlay('picker-overlay'); startSend(peer.id); });
        return row;
    }

    const card = el(`
        <div class="device-card" data-id="${peer.id}">
            <div class="device-card-top">
                <div class="device-avatar"><i class="${platformIcon(peer.platform)}"></i></div>
                <div class="device-meta">
                    <div class="device-name">${peer.name}</div>
                    <div class="device-sub"><span class="dot dot-on"></span> ${peer.ip}</div>
                </div>
            </div>
            ${trustedTag}
            <div class="device-actions">
                <button class="secondary-btn send-to-btn"><i class="fa-solid fa-paper-plane"></i> Envoyer</button>
                <button class="ghost-btn pair-btn">${peer.trusted ? '<i class="fa-solid fa-shield-halved"></i>' : '<i class="fa-solid fa-link"></i> Appairer'}</button>
            </div>
        </div>`);

    card.querySelector('.send-to-btn').addEventListener('click', async () => {
        const paths = await api.ftChooseFiles();
        if (paths && paths.length) startSend(peer.id, paths);
    });
    card.querySelector('.pair-btn').addEventListener('click', () => {
        if (!peer.trusted) requestPair(peer.id);
    });

    // Glisser-déposer directement sur une carte d'appareil = envoi direct
    card.addEventListener('dragover', (e) => { e.preventDefault(); card.classList.add('drag-over'); });
    card.addEventListener('dragleave', () => card.classList.remove('drag-over'));
    card.addEventListener('drop', (e) => {
        e.preventDefault();
        card.classList.remove('drag-over');
        const paths = filesFromDrop(e);
        if (paths.length) startSend(peer.id, paths);
    });

    return card;
}

function renderDevices() {
    const list = document.getElementById('devices-list');
    const empty = document.getElementById('devices-empty');
    list.innerHTML = '';
    if (!peers.length) { empty.classList.remove('hidden'); return; }
    empty.classList.add('hidden');
    peers.forEach((p) => list.appendChild(deviceCard(p)));
}

async function refreshPeers() {
    peers = await api.ftGetPeers();
    renderDevices();
}
api.onFtPeersUpdate((list) => { peers = list; renderDevices(); syncTrustedTagsInPeers(); });

function syncTrustedTagsInPeers() { /* trusted flag déjà inclus dans la charge utile des pairs */ }

// ============================================================
// Connexion manuelle par IP
// ============================================================
document.getElementById('manual-connect-btn').addEventListener('click', () => {
    document.getElementById('manual-error').classList.add('hidden');
    document.getElementById('manual-ip').value = '';
    document.getElementById('manual-port').value = '';
    openOverlay('manual-overlay');
});
document.getElementById('manual-connect-confirm-btn').addEventListener('click', async () => {
    const ip = document.getElementById('manual-ip').value.trim();
    const port = document.getElementById('manual-port').value.trim();
    const errEl = document.getElementById('manual-error');
    if (!ip || !port) { errEl.textContent = "Renseigne l'adresse IP et le port."; errEl.classList.remove('hidden'); return; }
    const result = await api.ftConnectManual(ip, port);
    if (!result.ok) { errEl.textContent = result.message || 'Connexion impossible.'; errEl.classList.remove('hidden'); return; }
    closeOverlay('manual-overlay');
    showToast(`Connecté à ${result.peer?.name || ip}`, 'success');
    refreshPeers();
});

// ============================================================
// Appairage
// ============================================================
async function requestPair(peerId) {
    const result = await api.ftPairRequest(peerId);
    if (result && result.message) showToast(result.message, 'error');
}

api.onFtPairOutgoing(({ peerName, code }) => {
    document.getElementById('pair-outgoing-name').textContent = peerName;
    document.getElementById('pair-outgoing-code').textContent = code;
    openOverlay('pair-outgoing-overlay');
});

api.onFtPairResult(({ accepted, reason, peerName }) => {
    closeOverlay('pair-outgoing-overlay');
    if (accepted) showToast(`Appairage accepté${peerName ? ' par ' + peerName : ''}.`, 'success');
    else if (reason === 'timeout') showToast('Demande d\'appairage expirée sans réponse.', 'error');
    else if (reason === 'unreachable') showToast("Impossible de joindre l'appareil.", 'error');
    else showToast('Appairage refusé.', 'error');
    refreshTrusted();
    refreshPeers();
});

let currentPairReqId = null;
api.onFtPairIncoming(({ reqId, fromName, code }) => {
    currentPairReqId = reqId;
    document.getElementById('pair-incoming-name').textContent = fromName;
    document.getElementById('pair-incoming-code').textContent = code;
    openOverlay('pair-incoming-overlay');
});
api.onFtPairRequestClosed(({ reqId }) => {
    if (currentPairReqId === reqId) { closeOverlay('pair-incoming-overlay'); currentPairReqId = null; }
});
document.getElementById('pair-incoming-accept').addEventListener('click', async () => {
    await api.ftRespondPair({ reqId: currentPairReqId, accepted: true });
    closeOverlay('pair-incoming-overlay');
    showToast('Appareil appairé.', 'success');
    refreshTrusted();
    refreshPeers();
});
document.getElementById('pair-incoming-decline').addEventListener('click', async () => {
    await api.ftRespondPair({ reqId: currentPairReqId, accepted: false });
    closeOverlay('pair-incoming-overlay');
});

// ============================================================
// Appareils de confiance (Paramètres)
// ============================================================
function trustedRow(d) {
    const row = el(`
        <div class="trusted-row" data-id="${d.id}">
            <div class="trusted-name">${d.name}</div>
            <label class="checkbox-row"><input type="checkbox" ${d.autoAccept ? 'checked' : ''}> Auto-accepter</label>
            <button class="trusted-remove-btn" title="Retirer"><i class="fa-solid fa-trash"></i></button>
        </div>`);
    row.querySelector('input[type="checkbox"]').addEventListener('change', (e) => {
        api.ftSetAutoAccept(d.id, e.target.checked);
    });
    row.querySelector('.trusted-remove-btn').addEventListener('click', async () => {
        await api.ftRemoveTrusted(d.id);
        refreshTrusted();
        refreshPeers();
    });
    return row;
}

async function refreshTrusted() {
    trusted = await api.ftGetTrusted();
    const list = document.getElementById('trusted-list');
    const empty = document.getElementById('trusted-empty');
    list.innerHTML = '';
    if (!trusted.length) { empty.classList.remove('hidden'); return; }
    empty.classList.add('hidden');
    trusted.forEach((d) => list.appendChild(trustedRow(d)));
}

// ============================================================
// Paramètres
// ============================================================
document.getElementById('settings-save-name-btn').addEventListener('click', async () => {
    const val = document.getElementById('settings-device-name').value;
    const name = await api.ftSetDeviceName(val);
    document.getElementById('self-name').textContent = name;
    showToast('Nom enregistré.', 'success');
});

document.getElementById('settings-choose-dir-btn').addEventListener('click', async () => {
    const dir = await api.ftChooseReceiveDir();
    document.getElementById('settings-receive-dir').value = dir;
});
document.getElementById('settings-open-dir-btn').addEventListener('click', () => api.ftOpenReceiveDir());

document.getElementById('settings-enabled-toggle').addEventListener('change', async (e) => {
    const enabled = await api.ftSetEnabled(e.target.checked);
    e.target.checked = enabled;
    loadSelf();
    if (!enabled) { peers = []; renderDevices(); }
});

async function loadSettings() {
    document.getElementById('settings-receive-dir').value = await api.ftGetReceiveDir();
}

// ============================================================
// Envoi de fichiers
// ============================================================
document.getElementById('send-files-btn').addEventListener('click', async () => {
    const paths = await api.ftChooseFiles();
    if (paths && paths.length) openPicker(paths);
});

function openPicker(paths) {
    pendingSendPaths = paths;
    document.getElementById('picker-summary').textContent =
        `${paths.length} élément${paths.length > 1 ? 's' : ''} sélectionné${paths.length > 1 ? 's' : ''} — choisis un appareil`;
    const list = document.getElementById('picker-devices');
    list.innerHTML = '';
    if (!peers.length) {
        list.appendChild(el('<div class="picker-device-empty">Aucun appareil détecté sur le réseau pour le moment.</div>'));
    } else {
        peers.forEach((p) => list.appendChild(deviceCard(p, { forPicker: true })));
    }
    openOverlay('picker-overlay');
}

function startSend(peerId, paths) {
    const finalPaths = paths || pendingSendPaths;
    pendingSendPaths = null;
    if (!finalPaths || !finalPaths.length) return;
    closeOverlay('picker-overlay');
    document.querySelector('.tab-btn[data-tab="transfers"]').click();
    api.ftSendFiles(peerId, finalPaths);
}

// ---- Progression de l'envoi ----
api.onFtSendRequesting(({ batchId, peerName, files, totalSize }) => {
    activeTransfers.set(batchId, {
        direction: 'sent', peerName, files, totalSize, done: 0, status: 'requesting', currentFileName: '', sent: 0,
    });
    renderTransfers();
});

api.onFtSendProgress(({ batchId, fileName, totalSent, totalSize, elapsedMs }) => {
    const t = activeTransfers.get(batchId);
    if (!t) return;
    t.status = 'sending';
    t.currentFileName = fileName;
    t.sent = totalSent;
    t.speed = elapsedMs > 0 ? (totalSent / (elapsedMs / 1000)) : 0;
    renderTransfers();
});

api.onFtSendComplete(({ batchId }) => {
    const t = activeTransfers.get(batchId);
    if (t) { t.status = 'completed'; renderTransfers(); setTimeout(() => { activeTransfers.delete(batchId); renderTransfers(); refreshHistory(); }, 2200); }
    showToast('Envoi terminé.', 'success');
});

api.onFtSendDeclined(({ batchId }) => {
    const t = activeTransfers.get(batchId);
    if (t) { t.status = 'declined'; renderTransfers(); setTimeout(() => { activeTransfers.delete(batchId); renderTransfers(); refreshHistory(); }, 3000); }
    showToast("L'autre appareil a refusé le transfert.", 'error');
});

api.onFtSendError(({ batchId, message }) => {
    const t = activeTransfers.get(batchId);
    if (t) { t.status = 'failed'; renderTransfers(); setTimeout(() => { activeTransfers.delete(batchId); renderTransfers(); refreshHistory(); }, 3000); }
    showToast(message || "Échec de l'envoi.", 'error');
});

api.onFtSendCancelled(({ batchId }) => {
    activeTransfers.delete(batchId);
    renderTransfers();
    refreshHistory();
});

// ---- Réception ----
api.onFtReceiveAutoAccepted(({ fromName, batchId, files, totalSize }) => {
    activeTransfers.set(batchId, {
        direction: 'received', peerName: fromName, files, totalSize, done: 0, status: 'receiving', currentFileName: '', received: 0,
    });
    renderTransfers();
    showToast(`Réception automatique depuis ${fromName}…`, 'info');
});

api.onFtReceiveProgress(({ batchId, fileName, totalReceived, totalSize }) => {
    const t = activeTransfers.get(batchId);
    if (!t) return;
    t.status = 'receiving';
    t.currentFileName = fileName;
    t.received = totalReceived;
    renderTransfers();
});

api.onFtReceiveComplete(({ batchId, status, fromName, dir }) => {
    const t = activeTransfers.get(batchId);
    if (t) {
        t.status = status;
        renderTransfers();
        setTimeout(() => { activeTransfers.delete(batchId); renderTransfers(); refreshHistory(); }, 2200);
    }
    if (status === 'completed') showToast(`Fichiers reçus de ${fromName}.`, 'success');
    void dir;
});

function transferCard(batchId, t) {
    const total = t.totalSize || 1;
    const progressBytes = t.direction === 'sent' ? (t.sent || 0) : (t.received || 0);
    const pct = Math.min(100, Math.round((progressBytes / total) * 100));
    const dirIcon = t.direction === 'sent' ? 'fa-arrow-up' : 'fa-arrow-down';
    const dirClass = t.direction === 'received' ? 'direction-received' : '';
    const statusLabels = {
        requesting: 'En attente de confirmation…', sending: 'Envoi en cours…', receiving: 'Réception en cours…',
        completed: 'Terminé', declined: 'Refusé', failed: 'Échec', cancelled: 'Annulé',
    };
    const isActive = t.status === 'sending' || t.status === 'receiving' || t.status === 'requesting';
    const card = el(`
        <div class="transfer-card" data-id="${batchId}">
            <div class="transfer-top">
                <div class="transfer-title">
                    <i class="fa-solid ${dirIcon} ${dirClass}"></i>
                    <span>${t.direction === 'sent' ? 'Vers' : 'Depuis'} ${t.peerName}</span>
                    <span class="transfer-file-name">${t.currentFileName ? '· ' + t.currentFileName : ''}</span>
                </div>
                ${isActive
                    ? '<button class="transfer-cancel" title="Annuler"><i class="fa-solid fa-xmark"></i></button>'
                    : `<span class="status-badge status-${t.status}">${statusLabels[t.status] || t.status}</span>`}
            </div>
            <div class="progress-track"><div class="progress-fill" style="width:${isActive ? pct : 100}%"></div></div>
            <div class="transfer-stats">
                <span>${isActive ? statusLabels[t.status] : ''} ${isActive ? pct + '%' : ''}</span>
                <span>${formatBytes(progressBytes)} / ${formatBytes(total)} ${t.speed ? '· ' + formatSpeed(t.speed) : ''}</span>
            </div>
        </div>`);
    const cancelBtn = card.querySelector('.transfer-cancel');
    if (cancelBtn) cancelBtn.addEventListener('click', () => api.ftCancelSend(batchId));
    return card;
}

function renderTransfers() {
    const list = document.getElementById('transfers-list');
    const empty = document.getElementById('transfers-empty');
    list.innerHTML = '';
    if (!activeTransfers.size) { empty.classList.remove('hidden'); updateTransfersBadge(); return; }
    empty.classList.add('hidden');
    [...activeTransfers.entries()].forEach(([id, t]) => list.appendChild(transferCard(id, t)));
    updateTransfersBadge();
}

// ============================================================
// Demande de transfert entrante
// ============================================================
let currentTransferReqId = null;
api.onFtTransferIncoming(({ reqId, fromName, files, totalSize }) => {
    currentTransferReqId = reqId;
    document.getElementById('transfer-incoming-name').textContent = fromName;
    document.getElementById('transfer-incoming-count').textContent =
        `${files.length} fichier${files.length > 1 ? 's' : ''}`;
    document.getElementById('transfer-incoming-total').textContent = `Taille totale : ${formatBytes(totalSize)}`;
    document.getElementById('transfer-incoming-always').checked = false;
    const list = document.getElementById('transfer-incoming-files');
    list.innerHTML = '';
    files.forEach((f) => list.appendChild(el(`<div class="file-list-row"><span>${f.name}</span><span>${formatBytes(f.size)}</span></div>`)));
    openOverlay('transfer-incoming-overlay');
    document.querySelector('.tab-btn[data-tab="devices"]').click();
});
api.onFtTransferRequestClosed(({ reqId }) => {
    if (currentTransferReqId === reqId) { closeOverlay('transfer-incoming-overlay'); currentTransferReqId = null; }
});
document.getElementById('transfer-incoming-accept').addEventListener('click', async () => {
    const alwaysAccept = document.getElementById('transfer-incoming-always').checked;
    await api.ftRespondTransfer({ reqId: currentTransferReqId, accepted: true, alwaysAccept });
    closeOverlay('transfer-incoming-overlay');
    document.querySelector('.tab-btn[data-tab="transfers"]').click();
    refreshTrusted();
});
document.getElementById('transfer-incoming-decline').addEventListener('click', async () => {
    await api.ftRespondTransfer({ reqId: currentTransferReqId, accepted: false });
    closeOverlay('transfer-incoming-overlay');
});

// ============================================================
// Historique
// ============================================================
function historyRow(h) {
    const isSent = h.direction === 'sent';
    const statusText = { completed: 'Terminé', declined: 'Refusé', failed: 'Échec', cancelled: 'Annulé' }[h.status] || h.status;
    const row = el(`
        <div class="history-row">
            <div class="history-icon ${h.direction}"><i class="fa-solid ${isSent ? 'fa-arrow-up' : 'fa-arrow-down'}"></i></div>
            <div class="history-main">
                <div class="history-title">${isSent ? 'Envoyé à' : 'Reçu de'} ${h.peerName} — ${h.files.length} fichier${h.files.length > 1 ? 's' : ''} (${formatBytes(h.totalSize)})</div>
                <div class="history-sub">${formatDate(h.finishedAt)} · ${statusText}</div>
            </div>
            ${h.direction === 'received' && h.status === 'completed' ? '<button class="history-open-btn"><i class="fa-solid fa-folder-open"></i> Ouvrir</button>' : ''}
        </div>`);
    const openBtn = row.querySelector('.history-open-btn');
    if (openBtn) openBtn.addEventListener('click', () => api.showInFolder(h.saveDir));
    return row;
}

async function refreshHistory() {
    history_ = await api.ftGetHistory();
    const list = document.getElementById('history-list');
    const empty = document.getElementById('history-empty');
    list.innerHTML = '';
    if (!history_.length) { empty.classList.remove('hidden'); return; }
    empty.classList.add('hidden');
    history_.forEach((h) => list.appendChild(historyRow(h)));
}

document.getElementById('clear-history-btn').addEventListener('click', async () => {
    await api.ftClearHistory();
    refreshHistory();
});

// ============================================================
// Glisser-déposer global (hors carte d'appareil précise)
// ============================================================
function filesFromDrop(e) {
    const paths = [];
    for (const file of e.dataTransfer.files) {
        const p = api.ftGetPathForFile(file);
        if (p) paths.push(p);
    }
    return paths;
}

let dragDepth = 0;
document.addEventListener('dragenter', (e) => {
    if (!e.dataTransfer.types.includes('Files')) return;
    dragDepth += 1;
    openOverlay('drop-overlay');
});
document.addEventListener('dragleave', () => {
    dragDepth = Math.max(0, dragDepth - 1);
    if (dragDepth === 0) closeOverlay('drop-overlay');
});
document.addEventListener('dragover', (e) => e.preventDefault());
document.addEventListener('drop', (e) => {
    e.preventDefault();
    dragDepth = 0;
    closeOverlay('drop-overlay');
    const paths = filesFromDrop(e);
    if (paths.length) openPicker(paths);
});

// ============================================================
// Initialisation
// ============================================================
(async function init() {
    await loadSelf();
    await refreshPeers();
    await refreshTrusted();
    await refreshHistory();
    await loadSettings();
    renderTransfers();
})();
