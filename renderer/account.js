// ============================================================
// Compte Google (OAuth + synchronisation chiffrée)
// ============================================================
// Rafraîchissement de l'UI du menu compte, icône de profil, et
// connexion/déconnexion/synchronisation.
//
// Dépend de (doit être chargé après) :
//   - dom-state.js
//   - api.googleStatus / api.googleAuthStart / api.syncNow
// ============================================================


// ============================================================
// Compte Google — OAuth réel + synchronisation chiffrée (Drive appDataFolder)
// ============================================================
accountBtn.addEventListener('click', async () => {
  accountDropdown.classList.toggle('hidden');
  menuDropdown.classList.add('hidden');
  await refreshAccountUI();
});

async function refreshAccountUI() {
  const statusEl = document.getElementById('account-status');
  const connectBtn = document.getElementById('account-connect-btn');
  const disconnectBtn = document.getElementById('account-disconnect-btn');
  const syncQuick = document.getElementById('account-sync-quick');
  const syncLast = document.getElementById('account-sync-last');

  const s = await api.googleStatus();
  applyAccountButtonIcon(s);

  if (s.connected) {
    statusEl.textContent = `Connecté(e) : ${s.email || 'compte Google'}`;
    connectBtn.classList.add('hidden');
    disconnectBtn.classList.remove('hidden');
    if (s.hasSyncKey) {
      syncQuick.classList.remove('hidden');
      syncLast.textContent = s.lastSyncedAt
        ? `Dernière synchro : ${new Date(s.lastSyncedAt).toLocaleString('fr-FR')}`
        : 'Pas encore synchronisé.';
  } else {
      syncQuick.classList.add('hidden');
      syncLast.textContent = 'Préparation de la synchronisation automatique…';
    }
  } else {
    statusEl.textContent = 'Non connecté';
    connectBtn.classList.remove('hidden');
    disconnectBtn.classList.add('hidden');
    syncQuick.classList.add('hidden');
  }
}

// Affiche la vraie photo de profil Google dans le bouton "compte" de la
// barre d'outils une fois connecté ; retombe sur l'icône générique sinon
// (compte déconnecté, ou image indisponible/en erreur de chargement).
function applyAccountButtonIcon(s) {
  if (s && s.connected && s.picture) {
    accountBtn.innerHTML = `<img src="${s.picture}" alt="Photo de profil Google" class="account-avatar" referrerpolicy="no-referrer" onerror="this.replaceWith(Object.assign(document.createElement('i'), { className: 'fa-solid fa-circle-user' }))" />`;
  } else {
    accountBtn.innerHTML = '<i class="fa-solid fa-circle-user"></i>';
  }
}

document.getElementById('account-connect-btn').addEventListener('click', async () => {
  const statusEl = document.getElementById('account-status');
  statusEl.textContent = 'Ouverture de la fenêtre de connexion Google dans votre navigateur…';
  const res = await api.googleAuthStart();
  if (res.ok) {
    await refreshAccountUI();
  } else {
    statusEl.textContent = `Erreur : ${res.error}`;
  }
});
document.getElementById('account-disconnect-btn').addEventListener('click', async () => {
  await api.googleDisconnect();
  await refreshAccountUI();
});
document.getElementById('account-sync-now-btn').addEventListener('click', async () => {
  const syncLast = document.getElementById('account-sync-last');
  syncLast.textContent = 'Synchronisation en cours…';
  const res = await api.syncNow();
  syncLast.textContent = res.ok
    ? `Dernière synchro : ${new Date(res.lastSyncedAt).toLocaleString('fr-FR')}`
    : `Erreur de synchro : ${res.error}`;
});
if (api.onSyncStatus) {
  api.onSyncStatus((data) => {
    const syncLast = document.getElementById('account-sync-last');
    if (!syncLast) return;
    syncLast.textContent = data.ok
      ? `Dernière synchro : ${new Date(data.lastSyncedAt).toLocaleString('fr-FR')}`
      : `Erreur de synchro : ${data.error}`;
  });
}

