# renderer/ — logique du processus renderer, découpée par responsabilité

Ce dossier remplace l'ancien fichier unique `renderer.js` (~2400 lignes).
Le code est identique à 100 % (aucune logique modifiée) : seul le découpage
en fichiers a changé, dans le même esprit que `players/audio/` et
`players/video/`.

## Pourquoi ce ne sont pas des modules ES

Ce sont volontairement des `<script>` classiques (pas de `import`/`export`),
qui partagent tous le même scope global — exactement comme le faisait
l'unique `renderer.js` d'origine. C'est le choix le plus sûr ici : l'appli
tourne avec `contextIsolation: true` et est packagée en `.asar` par
electron-builder, et je n'ai pas pu tester le rendu réel (pas d'affichage
disponible dans cet environnement). Passer aux modules ES aurait été plus
« propre » sur le papier, mais aurait introduit un risque de régression que
je ne pouvais pas vérifier. Cette approche garantit un comportement
strictement identique à avant.

**Conséquence : l'ordre des balises `<script>` dans `index.html` est important**
et reproduit l'ordre de dépendance entre modules (voir liste ci-dessous).
Si tu ajoutes un nouveau module, ajoute son `<script>` au bon endroit.

## Fichiers, dans l'ordre de chargement

| Fichier | Rôle |
|---|---|
| `dom-state.js` | État global + références DOM. Doit être chargé **en premier**. |
| `utils.js` | Fonctions pures (URL, HTML, chemins de fichiers). |
| `theme.js` | Thème clair/sombre/système (Paramètres > Apparence), appliqué sur `<body>`. |
| `window-controls.js` | Barre de titre custom (minimiser/agrandir/fermer). |
| `tabs.js` | Cœur : création/fermeture/activation des onglets, événements `<webview>`. |
| `toolbar-zoom.js` | Zoom + plein écran. |
| `toolbar-navigation.js` | Précédent/suivant/recharger/accueil, barre d'adresse, ouvrir un fichier. |
| `bookmarks.js` | Étoile, barre de favoris, panneau des favoris. |
| `find-in-page.js` | Recherche dans la page (Ctrl+F). |
| `translate.js` | Traducteur de page. |
| `app-menu.js` | Menu ☰ et lancement des apps internes (lecteurs, PDF, devtools). |
| `account.js` | Compte Google (OAuth + sync chiffrée). |
| `extensions-widget.js` | Icônes épinglées + menu flottant des extensions. |
| `panels-toast.js` | Ouverture/fermeture génériques des panneaux latéraux. |
| `history.js` | Historique — panneau latéral. |
| `history-page.js` | Historique — onglet dédié (`browser://history`). |
| `internal-page-stub.js` | Fait passer une page interne (div) pour un `<webview>`. |
| `downloads.js` | Téléchargements — panneau latéral + notifications. |
| `downloads-page.js` | Téléchargements — onglet dédié (`browser://downloads`). |
| `cookies.js` | Gestion des cookies. |
| `settings-page.js` | Paramètres — onglet dédié (`browser://settings`). |
| `extensions-page.js` | Extensions — onglet dédié (`browser://extensions`). |
| `start-page.js` | Page d'accueil personnalisée. |
| `keyboard-shortcuts.js` | Tous les raccourcis clavier. |
| `init.js` | Démarrage de l'appli. Doit être chargé **en dernier**. |

Chaque fichier a, en en-tête, un commentaire indiquant son rôle et les
autres modules dont il dépend.

## Ajouts — Paramètres (Général / Sécurité / Apparence / Téléchargements)

Nouveaux réglages dans `store.settings` (voir `main.js` > `DEFAULT_STORE`) :
`startupAction`, `theme`, `showBookmarksBar`, `tabHoverPreview`, `askWhereToSave`,
plus `store.lastSession.urls` (top-level, pas dans `settings`) pour l'option
"Reprendre où vous en étiez".

- **Démarrage** (`init.js`) : selon `startupAction`, ouvre un nouvel onglet,
  restaure les URLs de `lastSession`, ou ouvre la page d'accueil. Ignoré en
  navigation privée (toujours nouvel onglet).
- **Session** (`tabs.js` > `scheduleSessionSave`) : à chaque création/
  fermeture/navigation d'onglet, pousse (avec anti-rebond 800ms) la liste des
  URLs des onglets non-internes vers `data:save-session`.
- **Thème** (`theme.js`) : pose `theme-light`/`theme-dark` sur `<body>`,
  suit `prefers-color-scheme` en direct si `theme === 'system'`. Styles dans
  `styles-extra.css` (racine du projet, chargé après `styles.css` —
  ce dernier n'était pas disponible au moment de l'ajout, donc la palette
  sombre est une estimation à vérifier).
- **Aperçu au survol d'un onglet** (`tabs.js`) : délégation d'événements sur
  `#tabs`, couvre aussi les onglets internes sans les modifier individuellement.
- **Réinitialisation** (`data:reset-settings` dans `main.js`) : remet
  `store.settings` aux valeurs par défaut en préservant `google`/`googleAccount`/
  `sync` (pas de déconnexion surprise).
- **Suppression des données de navigation** : la section "Confidentialité" (3
  boutons séparés) a été remplacée par des cases à cocher + un seul bouton,
  toujours branché sur `data:clear-browsing-data`.
- **Téléchargements** : `askWhereToSave` fait utiliser `item.setSaveDialogOptions()`
  au lieu de `item.setSavePath()` dans `attachDownloadHandler` (main.js) —
  Électron affiche alors sa propre boîte "Enregistrer sous" à chaque téléchargement.

## Point relevé au passage (pas corrigé, pour ne rien changer sans te le dire)

Dans `downloads.js`, la fonction `renderDownloadsCountBadge()` est appelée
(dans le gestionnaire `api.onDownloadUpdate`) mais n'est définie nulle part
dans le code d'origine — c'était déjà le cas avant la découpe. Ça ne casse
rien de bloquant (juste une erreur silencieuse dans la console au moment
d'un téléchargement), mais dis-moi si tu veux que je l'ajoute ou que je
retire l'appel.
