// ============================================================
// État global + références DOM
// ============================================================
// Doit être chargé EN PREMIER : déclare les variables d'état partagées
// (settings, bookmarks, tabs, activeTabId...) et récupère toutes les
// références aux éléments du DOM utilisées par les autres modules.
// ============================================================

let settings = {
  homepage: 'https://www.google.com',
  searchEngine: 'https://www.google.com/search?q=',
  startupAction: 'newtab',
  theme: 'system',
  showBookmarksBar: true,
  tabHoverPreview: true,
  askWhereToSave: false,
};
let bookmarks = [];
let isIncognito = false;
// Doit correspondre exactement à la partition de session de la BrowserWindow
// (voir main.js: session.fromPartition(partition) dans attachDownloadHandler),
// sinon les webviews utilisent une session isolée et 'will-download' ne se
// déclenche jamais côté process principal -> aucun téléchargement capturé.
let webviewPartition = 'persist:main';

// ---- Éléments DOM ----
const tabsEl = document.getElementById('tabs');
const webviewsEl = document.getElementById('webviews');
const addressBar = document.getElementById('address-bar');
const backBtn = document.getElementById('back-btn');
const forwardBtn = document.getElementById('forward-btn');
const reloadBtn = document.getElementById('reload-btn');
const homeBtn = document.getElementById('home-btn');
const newTabBtn = document.getElementById('new-tab-btn');
const starBtn = document.getElementById('star-btn');
const siteIcon = document.getElementById('site-icon');
const bookmarksBar = document.getElementById('bookmarks-bar');
const findBtn = document.getElementById('find-btn');
const findBar = document.getElementById('find-bar');
const findInput = document.getElementById('find-input');
const findResults = document.getElementById('find-results');
const findPrev = document.getElementById('find-prev');
const findNext = document.getElementById('find-next');
const findClose = document.getElementById('find-close');
const menuBtn = document.getElementById('menu-btn');
const menuDropdown = document.getElementById('menu-dropdown');
const accountBtn = document.getElementById('account-btn');
const accountDropdown = document.getElementById('account-dropdown');
const downloadQuickBtn = document.getElementById('download-quick-btn');
const panelOverlay = document.getElementById('panel-overlay');
const appMenuDiv = document.getElementById('app-menu-div');

const extensionIconsEl = document.getElementById('extension-icons');
const extensionsBtn = document.getElementById('extensions-btn');
const extensionsDropdown = document.getElementById('extensions-dropdown');
const extensionsDropdownList = document.getElementById('extensions-dropdown-list');
const extensionsDropdownEmpty = document.getElementById('extensions-dropdown-empty');
const extensionsViewAllBtn = document.getElementById('extensions-view-all-btn');
const EXTENSION_STORES = [
  { key: 'chrome', name: 'Chrome Web Store', sub: 'store.google.com', icon: 'fa-brands fa-chrome', url: 'https://chromewebstore.google.com/' },
  { key: 'firefox', name: 'Mozilla Add-ons', sub: 'addons.mozilla.org', icon: 'fa-brands fa-firefox', url: 'https://addons.mozilla.org/' },
  { key: 'edge', name: 'Microsoft Edge Add-ons', sub: 'microsoftedge.microsoft.com', icon: 'fa-brands fa-edge', url: 'https://microsoftedge.microsoft.com/addons' },
  { key: 'opera', name: 'Opera Add-ons', sub: 'addons.opera.com', icon: 'fa-brands fa-opera', url: 'https://addons.opera.com/' },
];
let extensionsCache = [];

const translateBtn = document.getElementById('translate-btn');
const translateDropdown = document.getElementById('translate-dropdown');
const translateSelectBtn = document.getElementById('translate-lang-select-btn');
const translateLangMenu = document.getElementById('translate-lang-menu');
const translateCurrentLabel = document.getElementById('translate-current-lang-label');
const translateCloseBtn = document.getElementById('translate-close-btn');
const translateStatus = document.getElementById('translate-status');
const translateRevertBtn = document.getElementById('translate-revert-btn');
const TRANSLATE_LANG_LABELS = { fr: 'Français', en: 'Anglais', es: 'Espagnol', pt: 'Portugais', ar: 'Arabe', de: 'Allemand' };

const winMin = document.getElementById('win-min');
const winMax = document.getElementById('win-max');
const winClose = document.getElementById('win-close');
const incognitoBadge = document.getElementById('incognito-badge');


const menuDiv = document.getElementById('app-menu-div');
const appMenu = menuDiv.querySelector('#app-menu');
const closeAppBtn = appMenu.querySelector('#close-app-btn');

let tabs = [];
let activeTabId = null;
let tabCounter = 0;

