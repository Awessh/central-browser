// ============================================================
// Téléchargements — panneau latéral + notifications
// ============================================================
// Formatage (taille/vitesse/temps restant), rendu du panneau, mise à
// jour en temps réel, notifications système et badge dynamique.
//
// Dépend de (doit être chargé après) :
//   - dom-state.js
//   - utils.js
//   - downloads-page.js (findDownloadsTab/refreshDownloadsPage)
// ============================================================

// ============================================================
// Téléchargements
// ============================================================
// Formatter les tailles de fichiers (Ko, Mo, Go)
function formatBytes(bytes) {
  if (!bytes || bytes === 0) return '0 o';
  const k = 1024;
  const sizes = ['o', 'Ko', 'Mo', 'Go', 'To'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

// Formatter la vitesse
function formatSpeed(bytesPerSec) {
  if (!bytesPerSec || bytesPerSec === 0) return '';
  return `${formatBytes(bytesPerSec)}/s`;
}

// Formatter le temps restant
function formatTimeRemaining(seconds) {
  if (!seconds || !isFinite(seconds) || seconds <= 0) return '';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  if (mins === 0) return `${secs} s restantes`;
  return `${mins} min ${secs} s restantes`;
}

async function renderDownloads() {
  const list = await api.getDownloads();
  paintDownloads(list);
  updateDownloadBadgeIcon(list);
}

function paintDownloads(list) {
  const listEl = document.getElementById('downloads-list');
  listEl.innerHTML = '';
  if (!list || list.length === 0) { listEl.innerHTML = '<div class="download-row">Aucun téléchargement.</div>'; return; }
  list.forEach((d) => listEl.appendChild(downloadRow(d)));
}

function downloadRow(d) {
  const el = document.createElement('div');
  el.className = `download-row ${d.state}`;
  el.dataset.id = d.id;

  const total = d.totalBytes || 1;
  const received = d.receivedBytes || 0;
  const pct = Math.min(100, Math.round((received / total) * 100));

  let statusDescription = '';
  if (d.state === 'progressing') {
    const speedStr = formatSpeed(d.speed);
    const timeStr = formatTimeRemaining(d.estimatedTime);
    statusDescription = `${formatBytes(received)} / ${formatBytes(d.totalBytes)} (${pct}%) ${speedStr ? '• ' + speedStr : ''} ${timeStr ? '• ' + timeStr : ''}`;
  } else if (d.state === 'completed') {
    statusDescription = `Terminé • ${formatBytes(d.totalBytes)}` ;
  } else if (d.state === 'cancelled') {
    statusDescription = 'Téléchargement annulé';
  } else if (d.state === 'interrupted') {
    statusDescription = 'Interrompu / Erreur';
  } else if (d.state === 'paused') {
    statusDescription = `En pause • ${pct}%`;
  }

  el.innerHTML = `
    <div class="d-header">
      <div class="d-name" title="${escapeHtml(d.filename)}">${escapeHtml(d.filename)}</div>
      <div class="d-actions-top">
        ${d.state === 'progressing' ? '<button class="dl-ctrl-btn" data-action="pause" title="Pause"><i class="fa-solid fa-pause"></i></button>' : ''}
        ${d.state === 'paused' ? '<button class="dl-ctrl-btn" data-action="resume" title="Reprendre"><i class="fa-solid fa-play"></i></button>' : ''}
        ${d.state === 'progressing' || d.state === 'paused' ? '<button class="dl-ctrl-btn" data-action="cancel" title="Annuler"><i class="fa-solid fa-xmark"></i></button>' : ''}
      </div>
    </div>
    <div class="d-progress"><div class="d-progress-fill" style="width:${pct}%"></div></div>
    <div class="d-status">${statusDescription}</div>
    <div class="row-actions">
      ${d.state === 'completed' ? '<button data-open>Ouvrir le fichier</button>' : ''}
      <button data-show>Afficher dans le dossier</button>
    </div>
  `;

  // Écouteurs d'événements pour les boutons de la carte
  if (el.querySelector('[data-open]')) {
    el.querySelector('[data-open]').addEventListener('click', () => openDownloadFile(d.path));
  }
  el.querySelector('[data-show]').addEventListener('click', () => api.showInFolder(d.path));

  const pauseBtn = el.querySelector('[data-action="pause"]');
  if (pauseBtn) pauseBtn.addEventListener('click', () => api.pauseDownload(d.id));

  const resumeBtn = el.querySelector('[data-action="resume"]');
  if (resumeBtn) resumeBtn.addEventListener('click', () => api.resumeDownload(d.id));

  const cancelBtn = el.querySelector('[data-action="cancel"]');
  if (cancelBtn) cancelBtn.addEventListener('click', () => api.cancelDownload(d.id));

  return el;
}

// Mise à jour en temps réel d'un téléchargement existant sans tout ré-enlaidir
api.onDownloadUpdate((entry) => {
  const listEl = document.getElementById('downloads-list');
  const existing = listEl.querySelector(`[data-id="${entry.id}"]`);
  const newRow = downloadRow(entry);
  if (existing) {
    existing.replaceWith(newRow);
  } else {
    // Si la liste affichait "Aucun téléchargement"
    if (listEl.querySelector('.download-row') && listEl.querySelector('.download-row').textContent.includes('Aucun')) {
      listEl.innerHTML = '';
    }
    listEl.prepend(newRow);
  }
  renderDownloadsCountBadge();

  const dlTab = findDownloadsTab();
  if (dlTab) refreshDownloadsPage(dlTab.webview);
});

// Ouverture automatique du panneau dès qu'un téléchargement démarre
api.onOpenDownloadsPanel(() => {
  openPanel('downloads-panel');
  renderDownloads();
});

// Notifications natives de fin de téléchargement (HTML5 Notification API)
api.onDownloadNotification(({ title, body }) => {
  if (Notification.permission === 'granted') {
    new Notification(title, { body });
  } else if (Notification.permission !== 'denied') {
    Notification.requestPermission().then(permission => {
      if (permission === 'granted') {
        new Notification(title, { body });
      }
    });
  }
});

// Badge de notification dynamique sur le bouton rapide de la barre d'outils
function updateDownloadBadgeIcon(list) {
  const ongoing = list.filter(d => d.state === 'progressing').length;
  // Vous pouvez ajouter un indicateur visuel sur l'icône de la barre d'outils si désiré
  downloadQuickBtn.style.color = ongoing > 0 ? '#1a73e8' : '';
}

document.getElementById('downloads-clear-btn').addEventListener('click', async () => {
  await api.clearDownloads();
  renderDownloads();
});

