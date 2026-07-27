// Preload injecté dans CHAQUE page web visitée (onglets normaux).
// Rôle : détection de formulaires de connexion pour proposer
// l'enregistrement du mot de passe, et remplissage automatique
// des identifiants déjà enregistrés pour ce site.
// Aucune donnée n'est envoyée ailleurs qu'au processus principal
// de l'app, sur la machine de l'utilisateur.

const { ipcRenderer } = require('electron');

function findPasswordForm() {
  const pwField = document.querySelector('input[type="password"]');
  if (!pwField) return null;
  const form = pwField.closest('form');
  const userField = (form || document).querySelector(
    'input[type="email"], input[type="text"][autocomplete*="user" i], input[name*="user" i], input[name*="email" i], input[type="text"]'
  );
  return { form, pwField, userField };
}

window.addEventListener('submit', (e) => {
  const found = findPasswordForm();
  if (!found || !found.pwField.value) return;
  ipcRenderer.sendToHost('credential-detected', {
    host: window.location.host,
    username: found.userField ? found.userField.value : '',
    password: found.pwField.value,
  });
}, true);

// Remplissage automatique quand l'hôte nous transmet des identifiants enregistrés
ipcRenderer.on('autofill-credentials', (_event, { username, password }) => {
  const tryFill = () => {
    const found = findPasswordForm();
    if (!found) return false;
    if (found.userField) {
      found.userField.value = username;
      found.userField.dispatchEvent(new Event('input', { bubbles: true }));
    }
    found.pwField.value = password;
    found.pwField.dispatchEvent(new Event('input', { bubbles: true }));
    return true;
  };
  if (!tryFill()) {
    // Le formulaire peut apparaître après le chargement (SPA) : on réessaie brièvement
    let attempts = 0;
    const interval = setInterval(() => {
      attempts += 1;
      if (tryFill() || attempts > 10) clearInterval(interval);
    }, 400);
  }
});
