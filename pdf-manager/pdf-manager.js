const api = window.browserAPI;

// ============================================================
// Utilitaires génériques
// ============================================================
function baseName(filePath) {
    const parts = filePath.split(/[\\/]/);
    return parts[parts.length - 1] || filePath;
}

function stripExt(name) {
    const idx = name.lastIndexOf('.');
    return idx > 0 ? name.slice(0, idx) : name;
}

function normalizeRotation(deg) {
    let d = deg % 360;
    if (d > 180) d -= 360;
    if (d <= -180) d += 360;
    return d;
}

function extOf(filePath) {
    const name = baseName(filePath);
    const idx = name.lastIndexOf('.');
    return idx > 0 ? name.slice(idx + 1).toLowerCase() : '';
}

function formatBytes(bytes) {
    if (!bytes && bytes !== 0) return '';
    if (bytes < 1024) return `${bytes} o`;
    const units = ['Ko', 'Mo', 'Go'];
    let val = bytes / 1024;
    let i = 0;
    while (val >= 1024 && i < units.length - 1) { val /= 1024; i += 1; }
    return `${val.toFixed(val >= 10 ? 0 : 1)} ${units[i]}`;
}

function setStatus(elId, type, html) {
    const el = document.getElementById(elId);
    if (!el) return;
    el.className = `status-msg ${type}`;
    const icon = { info: 'fa-circle-info', success: 'fa-circle-check', warning: 'fa-triangle-exclamation', error: 'fa-circle-xmark' }[type] || 'fa-circle-info';
    el.innerHTML = `<i class="fa-solid ${icon}"></i><div>${html}</div>`;
    el.classList.remove('hidden');
}

function clearStatus(elId) {
    const el = document.getElementById(elId);
    if (!el) return;
    el.classList.add('hidden');
    el.innerHTML = '';
}

function resultActionsHtml(outputPath) {
    return `
        <div class="status-actions">
            <button data-open-file="${encodeURIComponent(outputPath)}"><i class="fa-solid fa-file"></i> Ouvrir le fichier</button>
            <button data-open-folder="${encodeURIComponent(outputPath)}"><i class="fa-solid fa-folder-open"></i> Afficher dans le dossier</button>
        </div>
    `;
}

document.addEventListener('click', (e) => {
    const openFileBtn = e.target.closest('[data-open-file]');
    if (openFileBtn) {
        const filePath = decodeURIComponent(openFileBtn.dataset.openFile);
        if (extOf(filePath) === 'pdf') api.pdfOpenInApp(filePath); else api.openPath(filePath);
        return;
    }
    const openFolderBtn = e.target.closest('[data-open-folder]');
    if (openFolderBtn) { api.showInFolder(decodeURIComponent(openFolderBtn.dataset.openFolder)); }
});

// ============================================================
// Navigation entre outils (barre latérale)
// ============================================================
document.querySelectorAll('.tool-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.tool-btn').forEach((b) => b.classList.remove('active'));
        document.querySelectorAll('.panel').forEach((p) => p.classList.remove('active'));
        btn.classList.add('active');
        document.getElementById(`panel-${btn.dataset.tool}`).classList.add('active');
    });
});

// ============================================================
// Détection des outils externes (LibreOffice / Ghostscript)
// ============================================================
async function refreshToolsStatus(forceRefresh = false) {
    const status = await api.pdfCheckTools({ forceRefresh });
    const gsLine = document.getElementById('status-ghostscript');
    const officeLine = document.getElementById('status-office');
    const loLine = document.getElementById('status-libreoffice');

    const sharpLine = document.getElementById('status-sharp');
    if (sharpLine) {
        if (status.sharp) {
            sharpLine.className = 'tool-status-line ok';
            sharpLine.innerHTML = '<i class="fa-solid fa-circle-check"></i> Moteur de compression natif détecté (utilisé en priorité)';
        } else {
            sharpLine.className = 'tool-status-line missing';
            sharpLine.innerHTML = "<i class=\"fa-solid fa-triangle-exclamation\"></i> Moteur de compression natif absent — lance <code>npm install</code>";
        }
    }

    if (status.ghostscript) {
        gsLine.className = 'tool-status-line ok';
        gsLine.innerHTML = '<i class="fa-solid fa-circle-check"></i> Ghostscript détecté (moteur complémentaire, optionnel)';
    } else {
        gsLine.className = 'tool-status-line missing';
        gsLine.innerHTML = '<i class="fa-solid fa-circle-info"></i> Ghostscript absent (facultatif : le moteur natif suffit pour la compression)';
    }

    if (status.word || status.excel) {
        const parts = [status.word && 'Word', status.excel && 'Excel'].filter(Boolean).join(' + ');
        officeLine.className = 'tool-status-line ok';
        officeLine.innerHTML = `<i class="fa-solid fa-circle-check"></i> Microsoft ${parts} détecté (utilisé en priorité)`;
    } else {
        officeLine.className = 'tool-status-line missing';
        officeLine.innerHTML = '<i class="fa-solid fa-circle-info"></i> Microsoft Office non détecté (COM)';
    }

    if (status.libreoffice) {
        loLine.className = 'tool-status-line ok';
        loLine.innerHTML = '<i class="fa-solid fa-circle-check"></i> LibreOffice détecté'
            + (status.word && status.excel ? ' (repli, et utilisé pour PDF → Excel / PDF → HTML)' : '');
    } else {
        loLine.className = 'tool-status-line missing';
        loLine.innerHTML = (status.word && status.excel)
            ? '<i class="fa-solid fa-triangle-exclamation"></i> LibreOffice absent (PDF → Excel / PDF → HTML indisponibles)'
            : '<i class="fa-solid fa-triangle-exclamation"></i> LibreOffice absent (conversions Office indisponibles)';
    }

    if (!status.pdfLib) {
        setStatus('organize-status', 'error', "Le module <code>pdf-lib</code> n'est pas installé. Lance <code>npm install</code> à la racine du projet, puis relance l'application.");
    }
}
refreshToolsStatus();
document.getElementById('recheck-tools-btn').addEventListener('click', () => refreshToolsStatus(true));

// ============================================================
// Zones de dépôt génériques (glisser-déposer)
// ============================================================
function wireDropzone(zoneId, { multiple = false, extensions = ['pdf'] } = {}, onFiles) {
    const zone = document.getElementById(zoneId);
    if (!zone) return;
    zone.addEventListener('dragover', (e) => { e.preventDefault(); zone.classList.add('dragover'); });
    zone.addEventListener('dragleave', () => zone.classList.remove('dragover'));
    zone.addEventListener('drop', (e) => {
        e.preventDefault();
        zone.classList.remove('dragover');
        const files = Array.from(e.dataTransfer.files || []).map((f) => f.path).filter(Boolean);
        const filtered = files.filter((p) => extensions.includes(extOf(p)));
        if (!filtered.length) return;
        onFiles(multiple ? filtered : [filtered[0]]);
    });
}

// ============================================================
// ORGANISER
// ============================================================
const organizeState = { filePath: null, fileName: '', pages: [] };

function renderOrganizePages() {
    const list = document.getElementById('organize-page-list');
    list.innerHTML = organizeState.pages.map((p, i) => `
        <li class="page-item${p.deleted ? ' deleted' : ''}" draggable="true" data-i="${i}">
            <i class="fa-solid fa-grip-vertical drag-handle"></i>
            <span class="page-label">Page ${p.originalIndex + 1}</span>
            <span class="page-rotation">${p.rotate ? `${p.rotate > 0 ? '+' : ''}${p.rotate}°` : ''}</span>
            <div class="page-controls">
                <button data-act="rotate-left" title="Tourner à gauche"><i class="fa-solid fa-rotate-left"></i></button>
                <button data-act="rotate-right" title="Tourner à droite"><i class="fa-solid fa-rotate-right"></i></button>
                <button data-act="toggle-delete" class="danger" title="Supprimer / restaurer"><i class="fa-solid fa-trash-can"></i></button>
            </div>
        </li>
    `).join('');
}

async function loadOrganizeFile(filePath) {
    clearStatus('organize-status');
    const info = await api.pdfGetInfo(filePath);
    if (!info.ok) { setStatus('organize-status', 'error', info.error); return; }

    organizeState.filePath = filePath;
    organizeState.fileName = baseName(filePath);
    organizeState.pages = info.pages.map((p) => ({ originalIndex: p.index, rotate: 0, deleted: false }));

    document.getElementById('organize-file-chip').innerHTML =
        `<i class="fa-solid fa-file-pdf"></i> ${organizeState.fileName} <span class="file-chip-meta">${info.pageCount} page(s) · ${formatBytes(info.fileSize)}</span>`;

    document.getElementById('organize-dropzone').classList.add('hidden');
    document.getElementById('organize-workspace').classList.remove('hidden');
    renderOrganizePages();
}

document.getElementById('organize-choose-btn').addEventListener('click', async () => {
    const paths = await api.pdfChooseFiles({ multiple: false, extensions: ['pdf'] });
    if (paths && paths.length) loadOrganizeFile(paths[0]);
});
wireDropzone('organize-dropzone', { extensions: ['pdf'] }, (paths) => loadOrganizeFile(paths[0]));

document.getElementById('organize-page-list').addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-act]');
    if (!btn) return;
    const li = btn.closest('.page-item');
    const i = parseInt(li.dataset.i, 10);
    const page = organizeState.pages[i];
    if (btn.dataset.act === 'rotate-left') page.rotate = normalizeRotation(page.rotate - 90);
    if (btn.dataset.act === 'rotate-right') page.rotate = normalizeRotation(page.rotate + 90);
    if (btn.dataset.act === 'toggle-delete') page.deleted = !page.deleted;
    renderOrganizePages();
});

let dragSrcIndex = null;
document.getElementById('organize-page-list').addEventListener('dragstart', (e) => {
    const li = e.target.closest('.page-item');
    if (!li) return;
    dragSrcIndex = parseInt(li.dataset.i, 10);
    li.classList.add('dragging');
});
document.getElementById('organize-page-list').addEventListener('dragend', (e) => {
    e.target.closest('.page-item')?.classList.remove('dragging');
});
document.getElementById('organize-page-list').addEventListener('dragover', (e) => e.preventDefault());
document.getElementById('organize-page-list').addEventListener('drop', (e) => {
    e.preventDefault();
    const li = e.target.closest('.page-item');
    if (!li || dragSrcIndex === null) return;
    const targetIndex = parseInt(li.dataset.i, 10);
    if (targetIndex === dragSrcIndex) return;
    const [moved] = organizeState.pages.splice(dragSrcIndex, 1);
    organizeState.pages.splice(targetIndex, 0, moved);
    dragSrcIndex = null;
    renderOrganizePages();
});

document.getElementById('organize-reset-btn').addEventListener('click', () => {
    organizeState.filePath = null;
    organizeState.pages = [];
    document.getElementById('organize-workspace').classList.add('hidden');
    document.getElementById('organize-dropzone').classList.remove('hidden');
    clearStatus('organize-status');
});

document.getElementById('organize-save-btn').addEventListener('click', async () => {
    if (organizeState.pages.every((p) => p.deleted)) {
        setStatus('organize-status', 'error', 'Toutes les pages sont marquées comme supprimées : il ne resterait aucune page.');
        return;
    }
    const outputPath = await api.pdfChooseSavePath({
        defaultName: `${stripExt(organizeState.fileName)}_organise.pdf`,
        extensions: ['pdf'],
    });
    if (!outputPath) return;

    setStatus('organize-status', 'info', 'Traitement en cours…');
    const pagesPayload = organizeState.pages.map((p) => ({ index: p.originalIndex, rotate: p.rotate, deleted: p.deleted }));
    const res = await api.pdfOrganize({ filePath: organizeState.filePath, pages: pagesPayload, outputPath });
    if (!res.ok) { setStatus('organize-status', 'error', res.error); return; }
    setStatus('organize-status', 'success', `PDF enregistré (${res.pageCount} page(s)).${resultActionsHtml(outputPath)}`);
});

// ============================================================
// FUSIONNER
// ============================================================
const mergeState = { files: [] };

function renderMergeList() {
    const list = document.getElementById('merge-file-list');
    list.innerHTML = mergeState.files.map((f, i) => `
        <li class="file-list-item" draggable="true" data-i="${i}">
            <i class="fa-solid fa-grip-vertical drag-handle"></i>
            <i class="fa-solid fa-file-pdf"></i>
            <span class="file-name">${f.name}</span>
            <button data-remove="${i}" title="Retirer"><i class="fa-solid fa-xmark"></i></button>
        </li>
    `).join('');
    document.getElementById('merge-actions').classList.toggle('hidden', mergeState.files.length < 2);
}

function addMergeFiles(paths) {
    paths.forEach((p) => {
        if (!mergeState.files.some((f) => f.path === p)) mergeState.files.push({ path: p, name: baseName(p) });
    });
    clearStatus('merge-status');
    renderMergeList();
}

document.getElementById('merge-choose-btn').addEventListener('click', async () => {
    const paths = await api.pdfChooseFiles({ multiple: true, extensions: ['pdf'] });
    if (paths && paths.length) addMergeFiles(paths);
});
wireDropzone('merge-dropzone', { multiple: true, extensions: ['pdf'] }, addMergeFiles);

document.getElementById('merge-file-list').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-remove]');
    if (!btn) return;
    mergeState.files.splice(parseInt(btn.dataset.remove, 10), 1);
    renderMergeList();
});

let mergeDragSrc = null;
document.getElementById('merge-file-list').addEventListener('dragstart', (e) => {
    const li = e.target.closest('.file-list-item');
    if (!li) return;
    mergeDragSrc = parseInt(li.dataset.i, 10);
    li.classList.add('dragging');
});
document.getElementById('merge-file-list').addEventListener('dragend', (e) => {
    e.target.closest('.file-list-item')?.classList.remove('dragging');
});
document.getElementById('merge-file-list').addEventListener('dragover', (e) => e.preventDefault());
document.getElementById('merge-file-list').addEventListener('drop', (e) => {
    e.preventDefault();
    const li = e.target.closest('.file-list-item');
    if (!li || mergeDragSrc === null) return;
    const targetIndex = parseInt(li.dataset.i, 10);
    if (targetIndex === mergeDragSrc) return;
    const [moved] = mergeState.files.splice(mergeDragSrc, 1);
    mergeState.files.splice(targetIndex, 0, moved);
    mergeDragSrc = null;
    renderMergeList();
});

document.getElementById('merge-clear-btn').addEventListener('click', () => {
    mergeState.files = [];
    renderMergeList();
    clearStatus('merge-status');
});

document.getElementById('merge-run-btn').addEventListener('click', async () => {
    const outputPath = await api.pdfChooseSavePath({ defaultName: 'fusion.pdf', extensions: ['pdf'] });
    if (!outputPath) return;

    setStatus('merge-status', 'info', 'Fusion en cours…');
    const res = await api.pdfMerge({ filePaths: mergeState.files.map((f) => f.path), outputPath });
    if (!res.ok) { setStatus('merge-status', 'error', res.error); return; }
    setStatus('merge-status', 'success', `${mergeState.files.length} fichiers fusionnés en un PDF de ${res.pageCount} page(s).${resultActionsHtml(outputPath)}`);
});

// ============================================================
// COMPRESSER
// ============================================================
const compressState = { filePath: null, fileName: '', fileSize: 0 };

async function loadCompressFile(filePath) {
    clearStatus('compress-status');
    const info = await api.pdfGetInfo(filePath);
    if (!info.ok) { setStatus('compress-status', 'error', info.error); return; }

    compressState.filePath = filePath;
    compressState.fileName = baseName(filePath);
    compressState.fileSize = info.fileSize;

    document.getElementById('compress-file-chip').innerHTML =
        `<i class="fa-solid fa-file-pdf"></i> ${compressState.fileName} <span class="file-chip-meta">${formatBytes(info.fileSize)}</span>`;

    document.getElementById('compress-dropzone').classList.add('hidden');
    document.getElementById('compress-workspace').classList.remove('hidden');
}

document.getElementById('compress-choose-btn').addEventListener('click', async () => {
    const paths = await api.pdfChooseFiles({ multiple: false, extensions: ['pdf'] });
    if (paths && paths.length) loadCompressFile(paths[0]);
});
wireDropzone('compress-dropzone', { extensions: ['pdf'] }, (paths) => loadCompressFile(paths[0]));

document.getElementById('compress-reset-btn').addEventListener('click', () => {
    compressState.filePath = null;
    document.getElementById('compress-workspace').classList.add('hidden');
    document.getElementById('compress-dropzone').classList.remove('hidden');
    clearStatus('compress-status');
});

document.getElementById('compress-run-btn').addEventListener('click', async () => {
    const level = document.querySelector('input[name="compress-level"]:checked')?.value || 'medium';
    const outputPath = await api.pdfChooseSavePath({
        defaultName: `${stripExt(compressState.fileName)}_compresse.pdf`,
        extensions: ['pdf'],
    });
    if (!outputPath) return;

    setStatus('compress-status', 'info', 'Compression en cours…');
    const res = await api.pdfCompress({ filePath: compressState.filePath, level, outputPath });
    if (!res.ok) { setStatus('compress-status', 'error', res.error); return; }

    const ratio = res.before > 0 ? Math.round((1 - res.after / res.before) * 100) : 0;
    const sizeLine = `${formatBytes(res.before)} → ${formatBytes(res.after)} (${ratio > 0 ? `-${ratio}%` : 'aucun gain notable'})`;
    if (res.warning) {
        setStatus('compress-status', 'warning', `${sizeLine}<br>${res.warning}${resultActionsHtml(outputPath)}`);
    } else {
        setStatus('compress-status', 'success', `${sizeLine}${resultActionsHtml(outputPath)}`);
    }
});

// ============================================================
// SCINDER
// ============================================================
const splitState = { filePath: null, fileName: '', pageCount: 0 };

async function loadSplitFile(filePath) {
    clearStatus('split-status');
    document.getElementById('split-results').innerHTML = '';
    const info = await api.pdfGetInfo(filePath);
    if (!info.ok) { setStatus('split-status', 'error', info.error); return; }

    splitState.filePath = filePath;
    splitState.fileName = baseName(filePath);
    splitState.pageCount = info.pageCount;

    document.getElementById('split-file-chip').innerHTML =
        `<i class="fa-solid fa-file-pdf"></i> ${splitState.fileName} <span class="file-chip-meta">${info.pageCount} page(s)</span>`;

    document.getElementById('split-dropzone').classList.add('hidden');
    document.getElementById('split-workspace').classList.remove('hidden');
}

document.getElementById('split-choose-btn').addEventListener('click', async () => {
    const paths = await api.pdfChooseFiles({ multiple: false, extensions: ['pdf'] });
    if (paths && paths.length) loadSplitFile(paths[0]);
});
wireDropzone('split-dropzone', { extensions: ['pdf'] }, (paths) => loadSplitFile(paths[0]));

document.getElementById('split-mode').addEventListener('change', (e) => {
    document.getElementById('split-ranges-field').classList.toggle('hidden', e.target.value !== 'ranges');
    document.getElementById('split-every-field').classList.toggle('hidden', e.target.value !== 'every');
});

document.getElementById('split-reset-btn').addEventListener('click', () => {
    splitState.filePath = null;
    document.getElementById('split-workspace').classList.add('hidden');
    document.getElementById('split-dropzone').classList.remove('hidden');
    document.getElementById('split-results').innerHTML = '';
    clearStatus('split-status');
});

document.getElementById('split-run-btn').addEventListener('click', async () => {
    const mode = document.getElementById('split-mode').value;
    const ranges = document.getElementById('split-ranges-input').value;
    const everyN = document.getElementById('split-every-input').value;

    const outputDir = await api.pdfChooseFolder();
    if (!outputDir) return;

    setStatus('split-status', 'info', 'Scission en cours…');
    const res = await api.pdfSplit({ filePath: splitState.filePath, mode, ranges, everyN, outputDir });
    if (!res.ok) { setStatus('split-status', 'error', res.error); return; }

    setStatus('split-status', 'success', `${res.files.length} fichier(s) créé(s) dans le dossier choisi.`);
    document.getElementById('split-results').innerHTML = res.files.map((f) => `
        <li class="file-list-item">
            <i class="fa-solid fa-file-pdf"></i>
            <span class="file-name">${baseName(f)}</span>
            <button data-open-folder="${encodeURIComponent(f)}" title="Afficher dans le dossier"><i class="fa-solid fa-folder-open"></i></button>
        </li>
    `).join('');
});

// ============================================================
// MODIFIER
// ============================================================
const editState = { filePath: null, fileName: '', pageCount: 0 };

async function loadEditFile(filePath) {
    clearStatus('edit-status');
    const info = await api.pdfGetInfo(filePath);
    if (!info.ok) { setStatus('edit-status', 'error', info.error); return; }

    editState.filePath = filePath;
    editState.fileName = baseName(filePath);
    editState.pageCount = info.pageCount;

    document.getElementById('edit-file-chip').innerHTML =
        `<i class="fa-solid fa-file-pdf"></i> ${editState.fileName} <span class="file-chip-meta">${info.pageCount} page(s)</span>`;

    document.getElementById('edit-dropzone').classList.add('hidden');
    document.getElementById('edit-workspace').classList.remove('hidden');
}

document.getElementById('edit-choose-btn').addEventListener('click', async () => {
    const paths = await api.pdfChooseFiles({ multiple: false, extensions: ['pdf'] });
    if (paths && paths.length) loadEditFile(paths[0]);
});
wireDropzone('edit-dropzone', { extensions: ['pdf'] }, (paths) => loadEditFile(paths[0]));

document.querySelectorAll('.edit-tab-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.edit-tab-btn').forEach((b) => b.classList.remove('active'));
        document.querySelectorAll('.edit-tab-panel').forEach((p) => p.classList.remove('active'));
        btn.classList.add('active');
        document.getElementById(`edit-tab-${btn.dataset.editTab}`).classList.add('active');
    });
});

document.getElementById('wm-opacity').addEventListener('input', (e) => {
    document.getElementById('wm-opacity-val').textContent = e.target.value;
});

document.getElementById('edit-reset-btn').addEventListener('click', () => {
    editState.filePath = null;
    document.getElementById('edit-workspace').classList.add('hidden');
    document.getElementById('edit-dropzone').classList.remove('hidden');
    clearStatus('edit-status');
});

document.getElementById('wm-run-btn').addEventListener('click', async () => {
    const text = document.getElementById('wm-text').value.trim();
    if (!text) { setStatus('edit-status', 'error', 'Indique le texte du filigrane.'); return; }

    const outputPath = await api.pdfChooseSavePath({
        defaultName: `${stripExt(editState.fileName)}_filigrane.pdf`,
        extensions: ['pdf'],
    });
    if (!outputPath) return;

    setStatus('edit-status', 'info', 'Application du filigrane…');
    const res = await api.pdfAddWatermark({
        filePath: editState.filePath,
        text,
        fontSize: parseInt(document.getElementById('wm-size').value, 10) || 40,
        color: document.getElementById('wm-color').value,
        opacity: (parseInt(document.getElementById('wm-opacity').value, 10) || 35) / 100,
        rotationDeg: parseInt(document.getElementById('wm-rotation').value, 10) || 0,
        position: document.getElementById('wm-position').value,
        pagesSpec: document.getElementById('wm-pages').value.trim(),
        outputPath,
    });
    if (!res.ok) { setStatus('edit-status', 'error', res.error); return; }
    setStatus('edit-status', 'success', `Filigrane appliqué à ${res.pageCount} page(s).${resultActionsHtml(outputPath)}`);
});

document.getElementById('blank-run-btn').addEventListener('click', async () => {
    const outputPath = await api.pdfChooseSavePath({
        defaultName: `${stripExt(editState.fileName)}_pages.pdf`,
        extensions: ['pdf'],
    });
    if (!outputPath) return;

    setStatus('edit-status', 'info', 'Insertion des pages…');
    const res = await api.pdfInsertBlankPages({
        filePath: editState.filePath,
        afterPage: parseInt(document.getElementById('blank-after').value, 10) || 0,
        count: parseInt(document.getElementById('blank-count').value, 10) || 1,
        outputPath,
    });
    if (!res.ok) { setStatus('edit-status', 'error', res.error); return; }
    setStatus('edit-status', 'success', `Pages insérées. Le document compte maintenant ${res.pageCount} page(s).${resultActionsHtml(outputPath)}`);
});

// ============================================================
// CONVERTIR
// ============================================================
const convertState = { src: null, target: null, exts: [], filePath: null };

document.querySelectorAll('.convert-card').forEach((card) => {
    card.addEventListener('click', () => {
        document.querySelectorAll('.convert-card').forEach((c) => c.classList.remove('active'));
        card.classList.add('active');

        convertState.src = card.dataset.src;
        convertState.target = card.dataset.target;
        convertState.exts = card.dataset.exts.split(',');
        convertState.filePath = null;

        document.getElementById('convert-workspace').classList.remove('hidden');
        document.getElementById('convert-file-chip').classList.add('hidden');
        document.getElementById('convert-run-btn').disabled = true;
        clearStatus('convert-status');

        if (convertState.target === 'pdf' && ['docx', 'xlsx', 'html'].includes(convertState.src)) {
            const label = { docx: 'Word', xlsx: 'Excel', html: 'HTML' }[convertState.src];
            setStatus('convert-status', 'info', `Sélectionne un fichier ${label} à convertir en PDF.`);
        } else if (['docx', 'xlsx', 'html'].includes(convertState.target)) {
            const label = { docx: 'Word', xlsx: 'Excel', html: 'HTML' }[convertState.target];
            setStatus('convert-status', 'info', `Sélectionne un PDF à convertir en ${label}.`);
        }
    });
});

function loadConvertFile(filePath) {
    convertState.filePath = filePath;
    const chip = document.getElementById('convert-file-chip');
    chip.classList.remove('hidden');
    chip.innerHTML = `<i class="fa-solid fa-file"></i> ${baseName(filePath)}`;
    document.getElementById('convert-run-btn').disabled = false;
    clearStatus('convert-status');
}

document.getElementById('convert-choose-btn').addEventListener('click', async () => {
    if (!convertState.target) return;
    const paths = await api.pdfChooseFiles({ multiple: false, extensions: convertState.exts });
    if (paths && paths.length) loadConvertFile(paths[0]);
});

document.getElementById('convert-reset-btn').addEventListener('click', () => {
    convertState.src = null;
    convertState.target = null;
    convertState.filePath = null;
    document.querySelectorAll('.convert-card').forEach((c) => c.classList.remove('active'));
    document.getElementById('convert-workspace').classList.add('hidden');
    clearStatus('convert-status');
});

document.getElementById('convert-run-btn').addEventListener('click', async () => {
    if (!convertState.filePath || !convertState.target) return;

    const defaultName = `${stripExt(baseName(convertState.filePath))}.${convertState.target}`;
    const outputPath = await api.pdfChooseSavePath({ defaultName, extensions: [convertState.target] });
    if (!outputPath) return;

    setStatus('convert-status', 'info', 'Conversion en cours… cela peut prendre quelques instants.');
    const res = await api.pdfConvert({ filePath: convertState.filePath, targetFormat: convertState.target, outputPath });
    if (!res.ok) { setStatus('convert-status', 'error', res.error); return; }
    const engineLabel = { word: 'Microsoft Word', excel: 'Microsoft Excel', libreoffice: 'LibreOffice', electron: 'moteur intégré' }[res.engine] || '';
    setStatus('convert-status', 'success', `Conversion terminée${engineLabel ? ` (via ${engineLabel})` : ''}.${resultActionsHtml(outputPath)}`);
});

// ============================================================
// Ouverture directe d'un fichier PDF depuis le navigateur (menu ⋮)
// ============================================================
if (api.onPdfManagerOpenFile) {
    api.onPdfManagerOpenFile((filePath) => {
        if (!filePath) return;
        document.querySelector('.tool-btn[data-tool="organize"]').click();
        loadOrganizeFile(filePath);
    });
}
