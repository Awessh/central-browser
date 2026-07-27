// ============================================================
// Bloc-notes flottant
// ============================================================
// Toujours accessible par-dessus les onglets (bulle repliée + panneau
// déplié), quelle que soit la fenêtre ouverte. On peut y glisser du texte,
// des liens, des images, des captures d'écran ou des vidéos — ou coller
// depuis le presse-papiers (Ctrl+V) — ainsi qu'écrire des notes rapides.
// Les notes sont stockées côté processus principal (main.js) et
// synchronisées en direct entre toutes les fenêtres ouvertes.
//
// Dépend de (doit être chargé après) :
//   - dom-state.js
//   - utils.js (api, escapeHtml, looksLikeUrl)
//   - tabs.js (createTab, pour ouvrir un lien noté dans un nouvel onglet)
// ============================================================

const fnpBubble = document.getElementById('fnp-bubble');
const fnpBubbleCount = document.getElementById('fnp-bubble-count');
const fnpPanel = document.getElementById('fnp-panel');
const fnpHeader = document.getElementById('fnp-header');
const fnpClearBtn = document.getElementById('fnp-clear-btn');
const fnpCollapseBtn = document.getElementById('fnp-collapse-btn');
const fnpComposeInput = document.getElementById('fnp-compose-input');
const fnpComposeAddBtn = document.getElementById('fnp-compose-add-btn');
const fnpDropzone = document.getElementById('fnp-dropzone');
const fnpList = document.getElementById('fnp-list');
const fnpEmpty = document.getElementById('fnp-empty');
const fnpDragHint = document.getElementById('fnp-drag-hint');

let fnpState = { items: [], collapsed: true, position: null, size: null, enabled: true };

// ============================================================
// Rendu
// ============================================================
function fnpFormatDate(ts) {
  try {
    return new Date(ts).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  } catch { return ''; }
}

function fnpMediaSrc(item) {
  if (item.content && item.content.startsWith('data:')) return item.content;
  if (item.filePath) return 'file://' + item.filePath.replace(/\\/g, '/');
  if (item.remoteUrl) return item.remoteUrl;
  return '';
}

function fnpRenderItem(item) {
  const card = document.createElement('div');
  card.className = 'fnp-card';
  card.dataset.id = item.id;

  let bodyHtml = '';
  if (item.type === 'text') {
    bodyHtml = `<div class="fnp-card-text">${escapeHtml(item.content).replace(/\n/g, '<br>')}</div>`;
  } else if (item.type === 'image') {
    bodyHtml = `<img class="fnp-card-media" src="${fnpMediaSrc(item)}" alt="${escapeHtml(item.title || 'image')}" />`;
  } else if (item.type === 'video') {
    bodyHtml = `<video class="fnp-card-media" src="${fnpMediaSrc(item)}" controls muted></video>`;
  } else if (item.type === 'link') {
    bodyHtml = `<div class="fnp-card-link"><i class="fa-solid fa-link"></i> <span>${escapeHtml(item.title || item.content)}</span></div>`;
  } else {
    bodyHtml = `<div class="fnp-card-file"><i class="fa-regular fa-file"></i> <span>${escapeHtml(item.title || 'Fichier')}</span></div>`;
  }

  card.innerHTML = `
    ${bodyHtml}
    <div class="fnp-card-footer">
      <span class="fnp-card-date">${fnpFormatDate(item.addedAt)}</span>
      <div class="fnp-card-actions">
        ${item.type === 'link' ? '<button class="fnp-open" title="Ouvrir dans un nouvel onglet"><i class="fa-solid fa-up-right-from-square"></i></button>' : ''}
        ${item.type === 'file' && item.filePath ? '<button class="fnp-open" title="Ouvrir le fichier"><i class="fa-solid fa-folder-open"></i></button>' : ''}
        ${item.type === 'text' ? '<button class="fnp-copy" title="Copier le texte"><i class="fa-regular fa-copy"></i></button>' : ''}
        <button class="fnp-delete" title="Supprimer"><i class="fa-solid fa-xmark"></i></button>
      </div>
    </div>
  `;

  card.querySelector('.fnp-delete').addEventListener('click', () => api.notepadRemoveItem(item.id));
  const openBtn = card.querySelector('.fnp-open');
  if (openBtn) {
    openBtn.addEventListener('click', () => {
      if (item.type === 'link') createTab(item.content);
      else if (item.type === 'file' && item.filePath) api.openPath(item.filePath);
    });
  }
  const copyBtn = card.querySelector('.fnp-copy');
  if (copyBtn) copyBtn.addEventListener('click', () => api.copyToClipboard(item.content));

  return card;
}

function fnpRenderList() {
  fnpList.innerHTML = '';
  if (!fnpState.items.length) {
    fnpEmpty.classList.remove('hidden');
  } else {
    fnpEmpty.classList.add('hidden');
    fnpState.items.forEach((item) => fnpList.appendChild(fnpRenderItem(item)));
  }
  const count = fnpState.items.length;
  fnpBubbleCount.textContent = count > 99 ? '99+' : String(count);
  fnpBubbleCount.classList.toggle('hidden', count === 0);
}

function fnpApplyCollapsed() {
  fnpPanel.classList.toggle('hidden', fnpState.collapsed);
  fnpBubble.classList.toggle('hidden', !fnpState.collapsed);
}

function fnpApplyGeometry() {
  if (fnpState.position && typeof fnpState.position.left === 'number') {
    fnpPanel.style.left = `${fnpState.position.left}px`;
    fnpPanel.style.top = `${fnpState.position.top}px`;
    fnpPanel.style.right = 'auto';
    fnpPanel.style.bottom = 'auto';
  }
  if (fnpState.size && fnpState.size.width) {
    fnpPanel.style.width = `${fnpState.size.width}px`;
    fnpPanel.style.height = `${fnpState.size.height}px`;
  }
}

// Contrôle global l'affichage (bulle + panneau) selon le réglage
// Paramètres > Apparence > "Activer le bloc-notes flottant". Appelée à la
// fois par le broadcast IPC (autres fenêtres) et directement par
// settings-page.js dans la fenêtre où l'utilisateur a changé le réglage.
function applyFloatingNotepadEnabled(enabled) {
  fnpState.enabled = enabled !== false;
  if (!fnpState.enabled) {
    fnpBubble.classList.add('hidden');
    fnpPanel.classList.add('hidden');
  } else {
    fnpApplyCollapsed();
  }
}

function fnpApplyFullState(state) {
  fnpState = { ...fnpState, ...state, items: Array.isArray(state.items) ? state.items : fnpState.items };
  fnpRenderList();
  fnpApplyGeometry();
  applyFloatingNotepadEnabled(fnpState.enabled);
}

// ============================================================
// Ouverture / fermeture / composition
// ============================================================
fnpBubble.addEventListener('click', () => {
  fnpState.collapsed = false;
  fnpApplyCollapsed();
  api.notepadSetUiState({ collapsed: false });
});
fnpCollapseBtn.addEventListener('click', () => {
  fnpState.collapsed = true;
  fnpApplyCollapsed();
  api.notepadSetUiState({ collapsed: true });
});
fnpClearBtn.addEventListener('click', () => {
  if (!fnpState.items.length) return;
  if (window.confirm('Effacer toutes les notes du bloc-notes flottant ?')) api.notepadClearAll();
});

async function fnpAddQuickNote() {
  const text = fnpComposeInput.value.trim();
  if (!text) return;
  fnpComposeInput.value = '';
  await api.notepadAddItem({ type: 'text', content: text });
}
fnpComposeAddBtn.addEventListener('click', fnpAddQuickNote);
fnpComposeInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); fnpAddQuickNote(); }
});

// ============================================================
// Déplacement (glisser l'en-tête) et redimensionnement (coin, natif CSS)
// ============================================================
(function enableDrag() {
  let dragging = false;
  let startX = 0, startY = 0, startLeft = 0, startTop = 0;

  fnpHeader.addEventListener('mousedown', (e) => {
    if (e.target.closest('button')) return;
    dragging = true;
    const rect = fnpPanel.getBoundingClientRect();
    startX = e.clientX; startY = e.clientY;
    startLeft = rect.left; startTop = rect.top;
    e.preventDefault();
  });
  window.addEventListener('mousemove', (e) => {
    if (!dragging) return;
    let left = startLeft + (e.clientX - startX);
    let top = startTop + (e.clientY - startY);
    const maxLeft = window.innerWidth - fnpPanel.offsetWidth - 4;
    const maxTop = window.innerHeight - fnpPanel.offsetHeight - 4;
    left = Math.max(4, Math.min(left, Math.max(4, maxLeft)));
    top = Math.max(4, Math.min(top, Math.max(4, maxTop)));
    fnpState.position = { left, top };
    fnpApplyGeometry();
  });
  window.addEventListener('mouseup', () => {
    if (!dragging) return;
    dragging = false;
    api.notepadSetUiState({ position: fnpState.position });
  });

  // Persiste la taille choisie via la poignée native (CSS resize) une fois
  // que l'utilisateur relâche la souris sur le panneau.
  fnpPanel.addEventListener('mouseup', () => {
    const w = fnpPanel.offsetWidth, h = fnpPanel.offsetHeight;
    if (fnpState.size?.width !== w || fnpState.size?.height !== h) {
      fnpState.size = { width: w, height: h };
      api.notepadSetUiState({ size: fnpState.size });
    }
  });
})();

// ============================================================
// Glisser-déposer : texte, liens, images, captures, vidéos
// ============================================================
const FNP_IMAGE_EXT = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg', 'avif'];
const FNP_VIDEO_EXT = ['mp4', 'webm', 'mkv', 'avi', 'mov', 'flv', 'wmv', 'm4v', 'ogg'];

function fnpExtOf(pathOrUrl) {
  const clean = (pathOrUrl.split('?')[0].split('#')[0]) || '';
  const m = clean.match(/\.([a-zA-Z0-9]+)$/);
  return m ? m[1].toLowerCase() : '';
}

async function fnpHandleDrop(e) {
  e.preventDefault();
  fnpSetDragHint(false);

  // 1) Fichiers venant du système (explorateur, bureau, capture enregistrée...)
  if (e.dataTransfer.files && e.dataTransfer.files.length) {
    for (const file of e.dataTransfer.files) {
      const srcPath = api.getPathForFile(file);
      if (!srcPath) continue;
      const ext = fnpExtOf(srcPath);
      const type = FNP_IMAGE_EXT.includes(ext) ? 'image' : FNP_VIDEO_EXT.includes(ext) ? 'video' : 'file';
      await api.notepadAddItem({ type, srcPath, title: file.name });
    }
    if (fnpState.collapsed) fnpPulseBubble();
    return;
  }

  // 2) Contenu glissé depuis une page (webview) ou la barre d'adresse
  const html = e.dataTransfer.getData('text/html');
  const uriList = e.dataTransfer.getData('text/uri-list');
  const plain = e.dataTransfer.getData('text/plain');

  // Une image glissée depuis une page fournit souvent une balise <img>
  const imgMatch = html && html.match(/<img[^>]+src=["']([^"']+)["']/i);
  if (imgMatch) {
    const altMatch = html.match(/<img[^>]+alt=["']([^"']*)["']/i);
    await api.notepadAddItem({ type: 'image', remoteUrl: imgMatch[1], title: altMatch ? altMatch[1] : '' });
    if (fnpState.collapsed) fnpPulseBubble();
    return;
  }

  const url = (uriList || (looksLikeUrl(plain || '') ? plain : '') || '').trim();
  if (url) {
    const ext = fnpExtOf(url);
    if (FNP_IMAGE_EXT.includes(ext)) {
      await api.notepadAddItem({ type: 'image', remoteUrl: url });
    } else if (FNP_VIDEO_EXT.includes(ext)) {
      await api.notepadAddItem({ type: 'video', remoteUrl: url });
    } else {
      await api.notepadAddItem({ type: 'link', content: url, title: (plain && plain !== url) ? plain : url });
    }
    if (fnpState.collapsed) fnpPulseBubble();
    return;
  }

  // 3) Simple texte sélectionné/glissé
  if (plain && plain.trim()) {
    await api.notepadAddItem({ type: 'text', content: plain.trim() });
    if (fnpState.collapsed) fnpPulseBubble();
  }
}

let fnpDragDepth = 0;
function fnpSetDragHint(on) {
  fnpDragHint.classList.toggle('hidden', !on);
  fnpDropzone.classList.toggle('fnp-drag-over', on);
}
function fnpPulseBubble() {
  fnpBubble.classList.remove('fnp-pulse');
  // Forcer un reflow pour pouvoir rejouer l'animation plusieurs fois de suite.
  void fnpBubble.offsetWidth;
  fnpBubble.classList.add('fnp-pulse');
}

[fnpDropzone, fnpBubble].forEach((el) => {
  el.addEventListener('dragenter', (e) => { e.preventDefault(); fnpDragDepth += 1; fnpSetDragHint(true); });
  el.addEventListener('dragover', (e) => e.preventDefault());
  el.addEventListener('dragleave', () => { fnpDragDepth = Math.max(0, fnpDragDepth - 1); if (fnpDragDepth === 0) fnpSetDragHint(false); });
  el.addEventListener('drop', (e) => { fnpDragDepth = 0; fnpHandleDrop(e); });
});

// ============================================================
// Coller (Ctrl+V) : pratique pour les captures d'écran copiées
// ============================================================
fnpPanel.addEventListener('paste', async (e) => {
  if (document.activeElement === fnpComposeInput) return; // laisser le collage de texte normal dans le champ
  const items = e.clipboardData && e.clipboardData.items;
  if (!items) return;
  for (const it of items) {
    if (it.type && it.type.startsWith('image/')) {
      const blob = it.getAsFile();
      if (!blob) continue;
      const dataUrl = await new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.readAsDataURL(blob);
      });
      await api.notepadAddItem({ type: 'image', content: dataUrl, title: 'Capture collée' });
      return;
    }
  }
  const text = e.clipboardData.getData('text/plain');
  if (text && text.trim()) await api.notepadAddItem({ type: 'text', content: text.trim() });
});

// ============================================================
// Synchronisation multi-fenêtres + initialisation
// ============================================================
api.onNotepadUpdated((state) => fnpApplyFullState(state));

(async function initFloatingNotepad() {
  const state = await api.notepadGetState();
  fnpApplyFullState(state);
})();
