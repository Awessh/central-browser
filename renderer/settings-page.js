// ============================================================
// Paramètres — onglet dédié (browser://settings, Ctrl+S)
// ============================================================
// Page complète : navigation, sécurité/compte Google, synchronisation,
// gestionnaire de mots de passe, apparence, téléchargements.
//
// Dépend de (doit être chargé après) :
//   - dom-state.js
//   - utils.js
//   - tabs.js
//   - internal-page-stub.js
//   - cookies.js (renderCookiesPanel/setBlockThirdPartyCookies)
//   - panels-toast.js
// ============================================================

// ============================================================
// Paramètres — onglet dédié (façon Chrome)
// Ctrl+S / menu ☰ ouvrent désormais une véritable page dans un
// nouvel onglet, plus de panneau latéral pour les paramètres.
// ============================================================

const SETTINGS_PAGE_TEMPLATE = `
  <div class="spage-wrap">
    <div class="hpage-header">
      <h1><i class="fa-solid fa-gear"></i> Paramètres</h1>
    </div>
    <div class="settings-layout">

      <nav class="settings-nav">
        <button class="settings-nav-btn active" data-panel="general" type="button">
          <i class="fa-solid fa-sliders"></i> Général
        </button>
        <button class="settings-nav-btn" data-panel="security" type="button">
          <i class="fa-solid fa-shield-halved"></i> Sécurité
        </button>
        <button class="settings-nav-btn" data-panel="passwords" type="button">
          <i class="fa-solid fa-key"></i> Gestionnaire de mots de passe
        </button>
        <button class="settings-nav-btn" data-panel="appearance" type="button">
          <i class="fa-solid fa-palette"></i> Apparence
        </button>
        <button class="settings-nav-btn" data-panel="downloads" type="button">
          <i class="fa-solid fa-download"></i> Téléchargements
        </button>
      </nav>

    <div id="settings-content">

        <!-- ============================================================
             Général
             ============================================================ -->
        <div class="settings-panel" data-panel="general">
      <div class="settings-section">
            <h3>Navigation</h3>
        <label class="settings-row">
          Page d'accueil
          <input id="settings-homepage" type="text" placeholder="https://..." />
        </label>
        <label class="settings-row">
          Moteur de recherche
          <select id="settings-search-engine">
            <option value="https://www.google.com/search?q=">Google</option>
            <option value="https://www.bing.com/search?q=">Bing</option>
            <option value="https://duckduckgo.com/?q=">DuckDuckGo</option>
          </select>
        </label>
          </div>

          <div class="settings-section">
            <h3>Au démarrage</h3>
            <label class="settings-row settings-row-radio">
              <input type="radio" name="settings-startup-action" id="settings-startup-newtab" value="newtab" style="flex:0;" />
              Ouvrir la page Nouvel onglet
            </label>
            <label class="settings-row settings-row-radio">
              <input type="radio" name="settings-startup-action" id="settings-startup-resume" value="resume" style="flex:0;" />
              Reprendre là où vous en étiez
            </label>
            <label class="settings-row settings-row-radio">
              <input type="radio" name="settings-startup-action" id="settings-startup-homepage" value="homepage" style="flex:0;" />
              Ouvrir une page spécifique (la page d'accueil ci-dessus)
            </label>
          </div>

          <div class="settings-section">
            <h3>Traduction</h3>
        <label class="settings-row">
              Service de traduction
              <select id="settings-translate-provider">
                <option value="mymemory">MyMemory (gratuit, ~5000 caractères/jour)</option>
                <option value="google">Google Cloud Translate (clé API requise)</option>
              </select>
            </label>
            <label class="settings-row">
              E-mail (MyMemory, x10 quota)
              <input id="settings-translate-email" type="email" placeholder="optionnel" />
            </label>
            <label class="settings-row">
              Clé API Google Cloud
              <input id="settings-translate-google-key" type="text" placeholder="optionnel" />
        </label>
      </div>

          <div class="settings-section">
            <h3>Réinitialisation</h3>
            <p class="settings-hint">
              Restaure la navigation, le démarrage, la traduction, la sécurité, l'apparence et les
              téléchargements à leurs valeurs par défaut. Votre compte Google, votre synchronisation,
              vos favoris et vos mots de passe enregistrés ne sont pas affectés.
            </p>
            <div class="settings-row">
              <button id="settings-reset-btn">Réinitialiser les paramètres</button>
              <span id="settings-reset-status"></span>
            </div>
          </div>
        </div>

        <!-- ============================================================
             Sécurité
             ============================================================ -->
        <div class="settings-panel hidden" data-panel="security">
      <div class="settings-section">
        <h3>Compte</h3>
        <div id="settings-account-status">Non connecté</div>
        <div class="settings-row">
          <button id="settings-google-connect-btn">Se connecter à Google</button>
          <button id="settings-google-disconnect-btn" class="hidden">Se déconnecter</button>
        </div>
      </div>

      <div class="settings-section">
        <h3>Synchronisation chiffrée (Google Drive)</h3>
        <p class="settings-hint">
          Historique de navigation, historique des téléchargements (pas les fichiers eux-mêmes),
          mots de passe enregistrés, favoris et cookies sont chiffrés sur cet appareil avant
          d'être envoyés dans un dossier privé de votre Drive (<span class="settings-code">appDataFolder</span>),
          invisible ailleurs et illisible par Google ou toute autre application.
        </p>
        <p class="settings-hint" id="settings-sync-auto-hint">
          Entièrement automatique : dès que vous êtes connecté(e), la clé de chiffrement est
          dérivée de votre compte Google et tout se synchronise, sans rien à saisir.
        </p>
        <label class="settings-row">
          <input type="checkbox" id="settings-sync-auto" style="flex:0;" />
          Synchroniser automatiquement en arrière-plan
        </label>
        <div class="settings-row">
          <button id="settings-sync-now-btn">Synchroniser maintenant</button>
          <span id="settings-sync-status"></span>
        </div>
      </div>

      <div class="settings-section">
        <h3>Traduction</h3>
        <label class="settings-row">
          Service de traduction
          <select id="settings-translate-provider">
            <option value="mymemory">MyMemory (gratuit, ~5000 caractères/jour)</option>
            <option value="google">Google Cloud Translate (clé API requise)</option>
          </select>
        </label>
        <label class="settings-row">
          E-mail (MyMemory, x10 quota)
          <input id="settings-translate-email" type="email" placeholder="optionnel" />
        </label>
        <label class="settings-row">
          Clé API Google Cloud
          <input id="settings-translate-google-key" type="text" placeholder="optionnel" />
        </label>
      </div>

      <div class="settings-section">
        <h3>Cookies</h3>
        <label class="settings-row">
          <input type="checkbox" id="settings-block-third-party" style="flex:0;" />
          Bloquer les cookies tiers
        </label>
        <button id="settings-manage-cookies-btn">Gérer les cookies</button>
      </div>

          <div class="settings-section">
            <h3>Supprimer les données de navigation</h3>
            <label class="settings-row settings-row-checkbox">
              <input type="checkbox" id="settings-clear-opt-history" checked style="flex:0;" />
              Historique de navigation
            </label>
            <label class="settings-row settings-row-checkbox">
              <input type="checkbox" id="settings-clear-opt-cookies" style="flex:0;" />
              Cookies et autres données de site
            </label>
            <label class="settings-row settings-row-checkbox">
              <input type="checkbox" id="settings-clear-opt-cache" style="flex:0;" />
              Images et fichiers en cache
            </label>
            <div class="settings-row">
              <button id="settings-clear-selected-btn">Effacer les données sélectionnées</button>
              <span id="settings-clear-status"></span>
            </div>
          </div>
        </div>

        <!-- ============================================================
             Gestionnaire de mots de passe
             ============================================================ -->
        <div class="settings-panel hidden" data-panel="passwords">
      <div class="settings-section">
            <div class="pw-manager-header">
        <h3>Mots de passe enregistrés</h3>
              <div class="pw-manager-search">
                <i class="fa-solid fa-magnifying-glass"></i>
                <input id="settings-passwords-search" type="text" placeholder="Rechercher un site ou un identifiant" autocomplete="off" />
              </div>
            </div>
            <p class="settings-hint">
              <i class="fa-solid fa-lock"></i>
              Chiffrés sur cet appareil. Un mot de passe n'est déchiffré que lorsque vous cliquez sur
              <span class="settings-code">Afficher</span> ou <span class="settings-code">Copier</span>.
            </p>
        <div id="settings-passwords-list"></div>
          </div>
      </div>

        <!-- ============================================================
             Apparence
             ============================================================ -->
        <div class="settings-panel hidden" data-panel="appearance">
      <div class="settings-section">
            <h3>Thème</h3>
            <label class="settings-row">
              Thème de l'application
              <select id="settings-theme">
                <option value="system">Système</option>
                <option value="light">Clair</option>
                <option value="dark">Sombre</option>
              </select>
            </label>
          </div>

          <div class="settings-section">
            <h3>Barre de favoris</h3>
            <label class="settings-row settings-row-checkbox">
              <input type="checkbox" id="settings-show-bookmarks-bar" style="flex:0;" />
              Afficher la barre de favoris
            </label>
          </div>

          <div class="settings-section">
            <h3>Onglets</h3>
            <label class="settings-row settings-row-checkbox">
              <input type="checkbox" id="settings-tab-hover-preview" style="flex:0;" />
              Afficher un aperçu au survol d'un onglet
            </label>
          </div>

          <div class="settings-section">
            <h3>Bloc-notes flottant</h3>
            <label class="settings-row settings-row-checkbox">
              <input type="checkbox" id="settings-floating-notepad" style="flex:0;" />
              Activer le bloc-notes flottant (toujours accessible, glisser-déposer texte/liens/images/vidéos)
            </label>
            <p class="settings-hint">
              Une petite bulle reste visible en bas de la fenêtre, quel que soit l'onglet
              ouvert. Tu peux y glisser du texte, un lien, une image, une capture d'écran
              ou une vidéo pour la garder de côté.
            </p>
          </div>
      </div>

        <!-- ============================================================
             Téléchargements
             ============================================================ -->
        <div class="settings-panel hidden" data-panel="downloads">
          <div class="settings-section">
            <h3>Téléchargements</h3>
            <label class="settings-row">
              Dossier de téléchargement
              <span id="settings-download-dir" class="settings-value"></span>
              <button id="settings-choose-dir-btn">Modifier</button>
            </label>
            <label class="settings-row settings-row-checkbox">
              <input type="checkbox" id="settings-ask-where-save" style="flex:0;" />
              Toujours demander où enregistrer les fichiers
            </label>
          </div>
        </div>

      </div>
    </div>
  </div>
`;

function findSettingsTab() {
  return tabs.find((t) => t.isInternal && t.internalType === 'settings');
}

function openSettingsTab() {
  const existing = findSettingsTab();
  if (existing) { switchTab(existing.id); refreshSettingsPage(existing.webview); return existing; }
  return createSettingsTab();
}

function createSettingsTab() {

  tabCounter += 1;
  const id = `tab-${tabCounter}`;

  const tabEl = document.createElement('div');
  tabEl.className = 'tab';
  tabEl.dataset.id = id;
  tabEl.innerHTML = `
    <div class="favicon"><i class="fa-solid fa-gear"></i></div>
    <div class="title">Paramètres</div>
    <button class="close-tab" title="Fermer">&#10005;</button>
  `;
  tabEl.addEventListener('click', (e) => {
    if (e.target.closest('.close-tab')) return;
    switchTab(id);
  });
  tabEl.querySelector('.close-tab').addEventListener('click', () => closeTab(id));
  tabsEl.appendChild(tabEl);

  const page = document.createElement('div');
  page.className = 'internal-page settings-page';
  page.innerHTML = SETTINGS_PAGE_TEMPLATE;
  makeInternalWebviewStub(page);
  page.getURL = () => 'browser://settings';
  webviewsEl.appendChild(page);

  const tab = {
    id, webview: page, tabEl,
    title: 'Paramètres', url: 'browser://settings',
    isInternal: true, internalType: 'settings',
  };
  tabs.push(tab);

  wireSettingsPage(page);
  switchTab(id);
  refreshSettingsPage(page);
  return tab;
}

function wireSettingsPage(page) {
  // ---- Navigation par onglets (barre latérale gauche) ----
  page.querySelectorAll('.settings-nav-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      page.querySelectorAll('.settings-nav-btn').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      const target = btn.dataset.panel;
      page.querySelectorAll('.settings-panel').forEach((p) => p.classList.toggle('hidden', p.dataset.panel !== target));
    });
  });

  page.querySelector('#settings-homepage').addEventListener('change', async (e) => {
    settings = await api.setSettings({ homepage: e.target.value.trim() || 'https://www.google.com' });
  });
  page.querySelector('#settings-search-engine').addEventListener('change', async (e) => {
    settings = await api.setSettings({ searchEngine: e.target.value });
  });
  page.querySelector('#settings-choose-dir-btn').addEventListener('click', async () => {
    const dir = await api.chooseDownloadDir();
    if (dir) page.querySelector('#settings-download-dir').textContent = dir;
  });

  // ---- Démarrage ----
  page.querySelectorAll('input[name="settings-startup-action"]').forEach((radio) => {
    radio.addEventListener('change', async (e) => {
      if (!e.target.checked) return;
      settings = await api.setSettings({ startupAction: e.target.value });
  });
  });

  // ---- Réinitialisation des paramètres ----
  page.querySelector('#settings-reset-btn').addEventListener('click', async () => {
    const statusEl = page.querySelector('#settings-reset-status');
    const ok = confirm(
      "Réinitialiser tous les paramètres (navigation, démarrage, traduction, sécurité, apparence, "
      + "téléchargements) à leurs valeurs par défaut ?\n\nVotre compte Google, votre synchronisation, "
      + "vos favoris et vos mots de passe enregistrés ne seront pas affectés."
    );
    if (!ok) return;
    statusEl.textContent = 'Réinitialisation…';
    settings = await api.resetSettings();
    applyTheme(settings.theme);
    updateBookmarksBarVisibility();
    await refreshSettingsPage(page);
    page.querySelector('#settings-reset-status').textContent = 'Paramètres réinitialisés ✅';
  });

  // ---- Supprimer les données de navigation ----
  page.querySelector('#settings-clear-selected-btn').addEventListener('click', async () => {
    const statusEl = page.querySelector('#settings-clear-status');
    const opts = {
      history: page.querySelector('#settings-clear-opt-history').checked,
      cookies: page.querySelector('#settings-clear-opt-cookies').checked,
      cache: page.querySelector('#settings-clear-opt-cache').checked,
    };
    if (!opts.history && !opts.cookies && !opts.cache) {
      statusEl.textContent = 'Sélectionnez au moins une donnée à effacer.';
      return;
    }
    statusEl.textContent = 'Suppression…';
    await api.clearBrowsingData(opts);
    statusEl.textContent = 'Données supprimées ✅';
  });

  page.querySelector('#settings-block-third-party').addEventListener('change', (e) => setBlockThirdPartyCookies(e.target.checked));
  page.querySelector('#settings-manage-cookies-btn').addEventListener('click', () => { openPanel('cookies-panel'); renderCookiesPanel(); });

  // ---- Apparence ----
  page.querySelector('#settings-theme').addEventListener('change', async (e) => {
    settings = await api.setSettings({ theme: e.target.value });
    applyTheme(settings.theme);
  });
  page.querySelector('#settings-show-bookmarks-bar').addEventListener('change', async (e) => {
    settings = await api.setSettings({ showBookmarksBar: e.target.checked });
    updateBookmarksBarVisibility();
  });
  page.querySelector('#settings-tab-hover-preview').addEventListener('change', async (e) => {
    settings = await api.setSettings({ tabHoverPreview: e.target.checked });
  });
  page.querySelector('#settings-floating-notepad').addEventListener('change', async (e) => {
    settings = await api.setSettings({ floatingNotepadEnabled: e.target.checked });
    // Le module floating-notepad.js écoute aussi le broadcast IPC 'notepad:updated'
    // (utile pour les autres fenêtres déjà ouvertes) ; on applique aussi
    // immédiatement ici pour un retour visuel instantané dans cet onglet.
    if (typeof applyFloatingNotepadEnabled === 'function') applyFloatingNotepadEnabled(e.target.checked);
  });

  // ---- Téléchargements ----
  page.querySelector('#settings-ask-where-save').addEventListener('change', async (e) => {
    settings = await api.setSettings({ askWhereToSave: e.target.checked });
  });

  // ---- Compte Google (OAuth réel) ----
  page.querySelector('#settings-google-connect-btn').addEventListener('click', async () => {
    const statusEl = page.querySelector('#settings-account-status');
    statusEl.textContent = 'Ouverture de la fenêtre de connexion Google dans votre navigateur…';
    const res = await api.googleAuthStart();
    statusEl.textContent = res.ok ? `Connecté(e) : ${res.email || 'compte Google'}` : `Erreur : ${res.error}`;
    await refreshSettingsPage(page);
  });
  page.querySelector('#settings-google-disconnect-btn').addEventListener('click', async () => {
    await api.googleDisconnect();
    await refreshSettingsPage(page);
  });

  // ---- Synchronisation chiffrée (automatique, aucune phrase à saisir) ----
  page.querySelector('#settings-sync-auto').addEventListener('change', async (e) => {
    await api.syncSetAuto(e.target.checked);
  });
  page.querySelector('#settings-sync-now-btn').addEventListener('click', async () => {
    const statusEl = page.querySelector('#settings-sync-status');
    statusEl.textContent = 'Synchronisation en cours…';
    const res = await api.syncNow();
    statusEl.textContent = res.ok
      ? `Synchronisé à ${new Date(res.lastSyncedAt).toLocaleTimeString('fr-FR')}`
      : `Erreur : ${res.error}`;
  });

  async function saveTranslationSettings() {
    const translation = {
      provider: page.querySelector('#settings-translate-provider').value,
      email: page.querySelector('#settings-translate-email').value.trim(),
      googleApiKey: page.querySelector('#settings-translate-google-key').value.trim(),
      defaultTarget: settings.translation?.defaultTarget || 'fr',
    };
    settings = await api.setSettings({ translation });
  }
  page.querySelector('#settings-translate-provider').addEventListener('change', saveTranslationSettings);
  page.querySelector('#settings-translate-email').addEventListener('change', saveTranslationSettings);
  page.querySelector('#settings-translate-google-key').addEventListener('change', saveTranslationSettings);

  // ---- Gestionnaire de mots de passe ----
  page.querySelector('#settings-passwords-search').addEventListener('input', (e) => {
    page.__pwFilter = e.target.value.trim().toLowerCase();
    paintPasswordsList(page);
  });

  page.__internalRefresh = () => refreshSettingsPage(page);
}

async function refreshSettingsPage(page) {
  if (!page) return;
  settings = await api.getSettings();
  page.querySelector('#settings-homepage').value = settings.homepage;
  page.querySelector('#settings-search-engine').value = settings.searchEngine;
  page.querySelector('#settings-download-dir').textContent = settings.downloadDir;

  const startupRadio = page.querySelector(
    `input[name="settings-startup-action"][value="${settings.startupAction || 'newtab'}"]`
  );
  if (startupRadio) startupRadio.checked = true;

  page.querySelector('#settings-theme').value = settings.theme || 'system';
  page.querySelector('#settings-show-bookmarks-bar').checked = settings.showBookmarksBar !== false;
  page.querySelector('#settings-tab-hover-preview').checked = settings.tabHoverPreview !== false;
  page.querySelector('#settings-floating-notepad').checked = settings.floatingNotepadEnabled !== false;
  page.querySelector('#settings-ask-where-save').checked = !!settings.askWhereToSave;

  const gStatus = await api.googleStatus();
  page.querySelector('#settings-account-status').textContent = gStatus.connected
    ? `Connecté(e) : ${gStatus.email || 'compte Google'}${gStatus.hasSyncKey ? ' · synchronisation active' : ' · préparation de la synchronisation…'}`
    : "Non connecté.";
  page.querySelector('#settings-google-connect-btn').classList.toggle('hidden', gStatus.connected);
  page.querySelector('#settings-google-disconnect-btn').classList.toggle('hidden', !gStatus.connected);

  page.querySelector('#settings-sync-auto').checked = !!gStatus.autoSyncEnabled;
  page.querySelector('#settings-sync-status').textContent = gStatus.lastSyncedAt
    ? `Dernière synchro : ${new Date(gStatus.lastSyncedAt).toLocaleString('fr-FR')}`
    : 'Jamais synchronisé.';

  page.querySelector('#settings-translate-provider').value = settings.translation?.provider || 'mymemory';
  page.querySelector('#settings-translate-email').value = settings.translation?.email || '';
  page.querySelector('#settings-translate-google-key').value = settings.translation?.googleApiKey || '';
  page.querySelector('#settings-block-third-party').checked = !!settings.blockThirdPartyCookies;

  await loadPasswordsList(page);
}

// ============================================================
// Gestionnaire de mots de passe — chargement, filtrage, rendu
// ============================================================
async function loadPasswordsList(page) {
  page.__pwCache = await api.getAllPasswords();
  paintPasswordsList(page);
}

// Retour visuel bref sur un bouton "copier" (coche verte 1s), faute de
// système de notification "toast" dans l'application.
function flashCopyFeedback(btn) {
  const original = btn.innerHTML;
  btn.innerHTML = '<i class="fa-solid fa-check"></i>';
  btn.classList.add('pw-copied');
  setTimeout(() => { btn.innerHTML = original; btn.classList.remove('pw-copied'); }, 1100);
}

// Palette d'avatars stable par site (dérivée du nom d'hôte, pas d'appel réseau).
const PW_AVATAR_COLORS = ['#1a73e8', '#d93025', '#188038', '#f9ab00', '#8430ce', '#12a4af', '#e8710a'];
function colorForHost(host) {
  let hash = 0;
  for (let i = 0; i < host.length; i++) hash = (hash * 31 + host.charCodeAt(i)) >>> 0;
  return PW_AVATAR_COLORS[hash % PW_AVATAR_COLORS.length];
}

function paintPasswordsList(page) {
  const pwEl = page.querySelector('#settings-passwords-list');
  const all = page.__pwCache || [];
  const q = page.__pwFilter || '';
  const filtered = q
    ? all.filter((p) => p.host.toLowerCase().includes(q) || p.username.toLowerCase().includes(q))
    : all;

  pwEl.innerHTML = '';
  if (all.length === 0) {
    pwEl.innerHTML = `
      <div class="pw-empty">
        <i class="fa-solid fa-key"></i>
        <span>Aucun mot de passe enregistré pour le moment.</span>
      </div>`;
    return;
  }
  if (filtered.length === 0) {
    pwEl.innerHTML = `<div class="pw-empty"><i class="fa-solid fa-magnifying-glass"></i><span>Aucun résultat pour « ${escapeHtml(q)} ».</span></div>`;
    return;
  }

  // Regroupement par site : plus lisible quand plusieurs comptes partagent un hôte.
  const groups = new Map();
  filtered.forEach((p) => {
    if (!groups.has(p.host)) groups.set(p.host, []);
    groups.get(p.host).push(p);
  });
  const sortedHosts = [...groups.keys()].sort((a, b) => a.localeCompare(b));

  sortedHosts.forEach((host) => {
    const group = document.createElement('div');
    group.className = 'pw-group';
    const groupEntries = groups.get(host);
    group.innerHTML = `<div class="pw-group-label">${escapeHtml(host)}${groupEntries.length > 1 ? ` <span>· ${groupEntries.length} comptes</span>` : ''}</div>`;
    groupEntries.forEach((p) => group.appendChild(buildPasswordCard(page, p)));
    pwEl.appendChild(group);
  });
}

function buildPasswordCard(page, p) {
  const card = document.createElement('div');
  card.className = 'pw-card';
  card.dataset.id = p.id;
  const initial = (p.host || '?').replace(/^www\./, '').charAt(0).toUpperCase();
  const updated = p.updatedAt ? new Date(p.updatedAt).toLocaleDateString('fr-FR') : '';

  card.innerHTML = `
    <div class="pw-avatar" style="background:${colorForHost(p.host)}">${escapeHtml(initial)}</div>
    <div class="pw-body">
      <div class="pw-view">
        <div class="pw-username" title="${escapeHtml(p.username)}">${escapeHtml(p.username) || '<em>(sans identifiant)</em>'}</div>
        <div class="pw-secret-row">
          <span class="pw-secret" data-revealed="false">••••••••••</span>
          <span class="pw-weak-badge hidden"><i class="fa-solid fa-triangle-exclamation"></i> court</span>
          <button class="pw-icon-btn pw-toggle" type="button" title="Afficher le mot de passe"><i class="fa-solid fa-eye"></i></button>
          <button class="pw-icon-btn pw-copy-user" type="button" title="Copier l'identifiant"><i class="fa-solid fa-user"></i></button>
          <button class="pw-icon-btn pw-copy-pass" type="button" title="Copier le mot de passe"><i class="fa-solid fa-copy"></i></button>
        </div>
        <div class="pw-meta">${updated ? `Modifié le ${updated}` : ''}</div>
      </div>
      <div class="pw-edit-form hidden">
        <input class="pw-edit-username" type="text" value="${escapeHtml(p.username)}" placeholder="Identifiant" autocomplete="off" />
        <input class="pw-edit-password" type="password" placeholder="Nouveau mot de passe (laisser vide pour ne pas changer)" autocomplete="new-password" />
        <div class="pw-edit-actions">
          <button class="pw-save" type="button">Enregistrer</button>
          <button class="pw-cancel" type="button">Annuler</button>
        </div>
      </div>
    </div>
    <div class="pw-actions">
      <button class="pw-icon-btn pw-edit" type="button" title="Modifier"><i class="fa-solid fa-pen"></i></button>
      <button class="pw-icon-btn pw-delete" type="button" title="Supprimer"><i class="fa-solid fa-trash"></i></button>
    </div>
  `;

  const secretEl = card.querySelector('.pw-secret');
  const weakBadge = card.querySelector('.pw-weak-badge');
  const toggleBtn = card.querySelector('.pw-toggle');
  toggleBtn.addEventListener('click', async () => {
    const revealed = secretEl.dataset.revealed === 'true';
    if (revealed) {
      secretEl.textContent = '••••••••••';
      secretEl.dataset.revealed = 'false';
      weakBadge.classList.add('hidden');
      toggleBtn.innerHTML = '<i class="fa-solid fa-eye"></i>';
      toggleBtn.title = 'Afficher le mot de passe';
      return;
    }
    const plain = await api.revealPassword(p.id);
    secretEl.textContent = plain || '(vide)';
    secretEl.dataset.revealed = 'true';
    weakBadge.classList.toggle('hidden', !plain || plain.length >= 8);
    toggleBtn.innerHTML = '<i class="fa-solid fa-eye-slash"></i>';
    toggleBtn.title = 'Masquer le mot de passe';
  });

  card.querySelector('.pw-copy-user').addEventListener('click', (e) => {
    api.copyToClipboard(p.username || '');
    flashCopyFeedback(e.currentTarget);
  });
  card.querySelector('.pw-copy-pass').addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    const plain = await api.revealPassword(p.id);
    await api.copyToClipboard(plain || '');
    flashCopyFeedback(btn);
  });

  card.querySelector('.pw-delete').addEventListener('click', async () => {
    const ok = confirm(`Supprimer le mot de passe enregistré pour ${p.host} (${p.username}) ?`);
    if (!ok) return;
    await api.deletePassword(p.id);
    await loadPasswordsList(page);
    });

  const viewEl = card.querySelector('.pw-view');
  const editForm = card.querySelector('.pw-edit-form');
  card.querySelector('.pw-edit').addEventListener('click', () => {
    viewEl.classList.add('hidden');
    editForm.classList.remove('hidden');
    editForm.querySelector('.pw-edit-username').focus();
  });
  card.querySelector('.pw-cancel').addEventListener('click', () => {
    editForm.classList.add('hidden');
    viewEl.classList.remove('hidden');
  });
  card.querySelector('.pw-save').addEventListener('click', async () => {
    const username = editForm.querySelector('.pw-edit-username').value.trim();
    const password = editForm.querySelector('.pw-edit-password').value;
    await api.updatePassword({ id: p.id, username, password });
    await loadPasswordsList(page);
  });

  return card;
}
