// ============================================================
// Page de démarrage personnalisée (onglet Accueil)
// ============================================================
// Grille d'applications, horloge, barre de recherche (texte + image).
//
// Dépend de (doit être chargé après) :
//   - dom-state.js
//   - utils.js
//   - tabs.js
//   - internal-page-stub.js
//   - app-menu.js (handleAppAction)
// ============================================================


// ============================================================
// Page de démarrage personnalisée (onglet "Accueil")
// ============================================================
// Onglet spécial affiché au lancement du navigateur et via le bouton
// "Page d'accueil" (maison) de la barre d'outils — distinct du bouton
// "Nouvel onglet" (+) qui continue d'ouvrir la page d'accueil configurée
// dans les paramètres (Google par défaut).

// Recherche d'images : chaque moteur a sa propre URL dédiée aux images.
// On la fait correspondre à l'URL de recherche texte choisie dans les
// paramètres ; à défaut de correspondance connue, on retombe sur une
// recherche texte classique avec le même moteur.
const IMAGE_SEARCH_ENGINES = {
  'https://www.google.com/search?q=': 'https://www.google.com/search?tbm=isch&q=',
  'https://www.bing.com/search?q=': 'https://www.bing.com/images/search?q=',
  'https://duckduckgo.com/?q=': 'https://duckduckgo.com/?iax=images&ia=images&q=',
};
function imageSearchUrl(query) {
  const base = IMAGE_SEARCH_ENGINES[settings.searchEngine] || settings.searchEngine;
  return `${base}${encodeURIComponent(query)}`;
}

const START_APPS = [
  { action: 'lecteur-video', icon: 'medias/images/lecteur_v.png', label: 'Lecteur vidéo' },
  { action: 'lecteur-audio', icon: 'medias/images/lecteur_audio.png', label: 'Lecteur audio' },
  { action: 'gestion-pdf', icon: 'medias/images/lecteur_pdf.png', label: 'Gestionnaire PDF' },
  { action: 'transfert-fichiers', icon: 'medias/images/transfert_fichiers.svg', label: 'Transfert de fichiers' }, 
];

const START_PAGE_TEMPLATE = `
  <div class="start-page-inner">
    <div class="start-hero">
      <div class="start-clock"></div>
      <p class="start-subtitle">Que voulez-vous faire aujourd'hui ?</p>
    </div>

    <div class="start-widgets-grid">
      <div class="start-widget start-widget-calendar">
        <div class="widget-header">
          <span class="widget-title"><i class="fa-solid fa-calendar-days"></i> Calendrier</span>
          <div class="widget-cal-nav">
            <button class="widget-cal-prev" type="button" title="Mois précédent"><i class="fa-solid fa-chevron-left"></i></button>
            <span class="widget-cal-label"></span>
            <button class="widget-cal-next" type="button" title="Mois suivant"><i class="fa-solid fa-chevron-right"></i></button>
          </div>
        </div>
        <div class="widget-cal-grid"></div>
      </div>

      <div class="start-widget start-widget-weather">
        <div class="widget-header">
          <span class="widget-title"><i class="fa-solid fa-cloud-sun"></i> Météo</span>
          <button class="widget-weather-refresh" type="button" title="Actualiser"><i class="fa-solid fa-rotate"></i></button>
        </div>
        <div class="widget-weather-body">
          <div class="widget-weather-loading"><i class="fa-solid fa-spinner fa-spin"></i> Chargement…</div>
        </div>
      </div>

      <div class="start-widget start-widget-bookmarks">
        <div class="widget-header">
          <span class="widget-title"><i class="fa-solid fa-star"></i> Favoris</span>
        </div>
        <div class="widget-bookmarks-list"></div>
      </div>
    </div>

    <div class="start-apps-grid">
      ${START_APPS.map((a) => `
        <button class="start-app" data-action="${a.action}">
          <img src="${a.icon}" alt="${escapeHtml(a.label)}">
          <span>${escapeHtml(a.label)}</span>
        </button>
      `).join('')}
    </div>

    <form class="start-search-form">
      <div class="start-search-bar">
        <i class="fa-solid fa-magnifying-glass start-search-icon"></i>
        <input type="text" class="start-search-input" placeholder="Rechercher sur le web" autocomplete="off" />
        <button type="button" class="start-image-search-btn" title="Recherche par image"><i class="fa-solid fa-image"></i></button>
        <button type="submit" class="start-search-submit" title="Rechercher"><i class="fa-solid fa-arrow-right"></i></button>
      </div>
    </form>
  </div>
`;

// ============================================================
// Widget Calendrier — mini calendrier du mois en cours, navigable,
// entièrement local (aucune donnée externe ni permission requise)
// ============================================================
const CAL_MONTH_LABELS_FR = [
  'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
  'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre',
];
const CAL_WEEKDAY_LABELS_FR = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];

function buildCalendarGridHTML(year, month) {
  const today = new Date();
  const isCurrentMonth = today.getFullYear() === year && today.getMonth() === month;
  const firstOfMonth = new Date(year, month, 1);
  // getDay() = 0 (dimanche) .. 6 (samedi) -> on décale pour démarrer la semaine un lundi.
  const startOffset = (firstOfMonth.getDay() + 6) % 7;
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  let html = '<div class="widget-cal-weekdays">'
    + CAL_WEEKDAY_LABELS_FR.map((d) => `<span>${d}</span>`).join('')
    + '</div><div class="widget-cal-days">';
  for (let i = 0; i < startOffset; i++) html += '<span class="widget-cal-day empty"></span>';
  for (let d = 1; d <= daysInMonth; d++) {
    const isToday = isCurrentMonth && d === today.getDate();
    html += `<span class="widget-cal-day${isToday ? ' today' : ''}">${d}</span>`;
  }
  html += '</div>';
  return html;
}

function paintCalendarWidget(page) {
  const { year, month } = page.__calState;
  const labelEl = page.querySelector('.widget-cal-label');
  const gridEl = page.querySelector('.widget-cal-grid');
  if (labelEl) labelEl.textContent = `${CAL_MONTH_LABELS_FR[month]} ${year}`;
  if (gridEl) gridEl.innerHTML = buildCalendarGridHTML(year, month);
}

function wireCalendarWidget(page) {
  const now = new Date();
  page.__calState = { year: now.getFullYear(), month: now.getMonth() };
  paintCalendarWidget(page);
  page.querySelector('.widget-cal-prev').addEventListener('click', () => {
    const st = page.__calState;
    st.month -= 1;
    if (st.month < 0) { st.month = 11; st.year -= 1; }
    paintCalendarWidget(page);
  });
  page.querySelector('.widget-cal-next').addEventListener('click', () => {
    const st = page.__calState;
    st.month += 1;
    if (st.month > 11) { st.month = 0; st.year += 1; }
    paintCalendarWidget(page);
  });
}

// ============================================================
// Widget Météo — géolocalisation par IP (sans permission navigateur, plus
// fiable dans Electron) + prévisions Open-Meteo (API publique, sans clé).
// Mise en cache 15 min en mémoire, partagée entre les onglets "Accueil".
// ============================================================
let __weatherCache = null; // { data, fetchedAt }
const WEATHER_CACHE_MS = 15 * 60 * 1000;

const WMO_WEATHER_CODES = {
  0: { label: 'Ciel dégagé', icon: 'fa-sun' },
  1: { label: 'Plutôt dégagé', icon: 'fa-cloud-sun' },
  2: { label: 'Partiellement nuageux', icon: 'fa-cloud-sun' },
  3: { label: 'Couvert', icon: 'fa-cloud' },
  45: { label: 'Brouillard', icon: 'fa-smog' },
  48: { label: 'Brouillard givrant', icon: 'fa-smog' },
  51: { label: 'Bruine légère', icon: 'fa-cloud-rain' },
  53: { label: 'Bruine', icon: 'fa-cloud-rain' },
  55: { label: 'Bruine forte', icon: 'fa-cloud-rain' },
  56: { label: 'Bruine verglaçante', icon: 'fa-cloud-rain' },
  57: { label: 'Bruine verglaçante forte', icon: 'fa-cloud-rain' },
  61: { label: 'Pluie légère', icon: 'fa-cloud-rain' },
  63: { label: 'Pluie', icon: 'fa-cloud-showers-heavy' },
  65: { label: 'Pluie forte', icon: 'fa-cloud-showers-heavy' },
  66: { label: 'Pluie verglaçante', icon: 'fa-cloud-showers-heavy' },
  67: { label: 'Pluie verglaçante forte', icon: 'fa-cloud-showers-heavy' },
  71: { label: 'Neige légère', icon: 'fa-snowflake' },
  73: { label: 'Neige', icon: 'fa-snowflake' },
  75: { label: 'Neige forte', icon: 'fa-snowflake' },
  77: { label: 'Neige en grains', icon: 'fa-snowflake' },
  80: { label: 'Averses légères', icon: 'fa-cloud-showers-heavy' },
  81: { label: 'Averses', icon: 'fa-cloud-showers-heavy' },
  82: { label: 'Averses violentes', icon: 'fa-cloud-showers-heavy' },
  85: { label: 'Averses de neige', icon: 'fa-snowflake' },
  86: { label: 'Averses de neige fortes', icon: 'fa-snowflake' },
  95: { label: 'Orage', icon: 'fa-bolt' },
  96: { label: 'Orage avec grêle', icon: 'fa-cloud-bolt' },
  99: { label: 'Orage violent avec grêle', icon: 'fa-cloud-bolt' },
};
function describeWeatherCode(code) {
  return WMO_WEATHER_CODES[code] || { label: 'Conditions inconnues', icon: 'fa-cloud' };
}

async function fetchWeatherData() {
  if (__weatherCache && (Date.now() - __weatherCache.fetchedAt) < WEATHER_CACHE_MS) {
    return __weatherCache.data;
  }
  const geoRes = await fetch('https://ipapi.co/json/');
  if (!geoRes.ok) throw new Error('geo-fetch-failed');
  const geo = await geoRes.json();
  if (!geo || typeof geo.latitude !== 'number' || typeof geo.longitude !== 'number') {
    throw new Error('geo-data-missing');
  }
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${geo.latitude}&longitude=${geo.longitude}`
    + '&current_weather=true&daily=temperature_2m_max,temperature_2m_min&timezone=auto';
  const wRes = await fetch(url);
  if (!wRes.ok) throw new Error('weather-fetch-failed');
  const w = await wRes.json();
  const data = {
    city: geo.city || geo.region || 'Position actuelle',
    temp: Math.round(w.current_weather.temperature),
    code: w.current_weather.weathercode,
    max: w.daily?.temperature_2m_max?.[0] != null ? Math.round(w.daily.temperature_2m_max[0]) : null,
    min: w.daily?.temperature_2m_min?.[0] != null ? Math.round(w.daily.temperature_2m_min[0]) : null,
  };
  __weatherCache = { data, fetchedAt: Date.now() };
  return data;
}

async function renderWeatherWidget(page, forceRefresh = false) {
  const body = page.querySelector('.widget-weather-body');
  if (!body) return;
  if (forceRefresh) __weatherCache = null;
  body.innerHTML = '<div class="widget-weather-loading"><i class="fa-solid fa-spinner fa-spin"></i> Chargement…</div>';
  try {
    const data = await fetchWeatherData();
    const info = describeWeatherCode(data.code);
    body.innerHTML = `
      <div class="widget-weather-main">
        <i class="fa-solid ${info.icon} widget-weather-icon"></i>
        <div class="widget-weather-temp">${data.temp}°</div>
      </div>
      <div class="widget-weather-desc">${escapeHtml(info.label)}</div>
      <div class="widget-weather-city"><i class="fa-solid fa-location-dot"></i> ${escapeHtml(data.city)}</div>
      ${data.max !== null ? `<div class="widget-weather-minmax">Max ${data.max}° · Min ${data.min}°</div>` : ''}
    `;
  } catch (err) {
    body.innerHTML = `
      <div class="widget-weather-error">
        <i class="fa-solid fa-cloud-slash"></i>
        <span>Météo indisponible pour l'instant</span>
        <button class="widget-weather-retry" type="button">Réessayer</button>
      </div>
    `;
    body.querySelector('.widget-weather-retry')?.addEventListener('click', () => renderWeatherWidget(page, true));
  }
}

// ============================================================
// Widget Favoris — accès rapide aux favoris déjà enregistrés (barre/étoile)
// ============================================================
function renderBookmarksWidget(page) {
  const listEl = page.querySelector('.widget-bookmarks-list');
  if (!listEl) return;
  if (!bookmarks.length) {
    listEl.innerHTML = `
      <div class="widget-bookmarks-empty">
        <i class="fa-regular fa-star"></i>
        <span>Aucun favori pour le moment</span>
      </div>`;
    return;
  }
  const items = bookmarks.slice(0, 5);
  listEl.innerHTML = items.map((b) => `
    <button class="widget-bookmark-item" data-url="${escapeHtml(b.url)}" type="button" title="${escapeHtml(b.url)}">
      <i class="fa-solid fa-star"></i>
      <span>${escapeHtml(b.title || b.url)}</span>
    </button>
  `).join('') + `
    <button class="widget-bookmarks-viewall" type="button">
      Voir tous les favoris <i class="fa-solid fa-arrow-right"></i>
    </button>`;
  listEl.querySelectorAll('.widget-bookmark-item').forEach((btn) => {
    btn.addEventListener('click', () => createTab(btn.dataset.url));
  });
  listEl.querySelector('.widget-bookmarks-viewall').addEventListener('click', () => {
    openPanel('bookmarks-panel');
    renderBookmarksPanel();
  });
}

// Appelé depuis bookmarks.js après ajout/suppression, pour que tout onglet
// "Accueil" déjà ouvert reflète immédiatement le nouvel état des favoris.
function refreshStartBookmarksWidgets() {
  tabs.filter((t) => t.isInternal && t.internalType === 'start').forEach((t) => renderBookmarksWidget(t.webview));
}

function wireStartPage(page) {
  page.querySelectorAll('.start-app').forEach((btn) => {
    btn.addEventListener('click', () => handleAppAction(btn.dataset.action));
  });

  const form = page.querySelector('.start-search-form');
  const input = page.querySelector('.start-search-input');
  const imageBtn = page.querySelector('.start-image-search-btn');

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const q = input.value.trim();
    if (!q) return;
    createTab(normalizeUrl(q));
  });

  imageBtn.addEventListener('click', () => {
    const q = input.value.trim();
    if (!q) { input.focus(); return; }
    createTab(imageSearchUrl(q));
  });

  updateStartClock(page);
  page.__clockTimer = setInterval(() => updateStartClock(page), 30000);

  wireCalendarWidget(page);
  renderWeatherWidget(page);
  renderBookmarksWidget(page);
  page.querySelector('.widget-weather-refresh').addEventListener('click', () => renderWeatherWidget(page, true));
}

function updateStartClock(page) {
  const el = page.querySelector('.start-clock');
  if (!el) return;
  const now = new Date();
  el.textContent = now.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}

function findStartTab() {
  return tabs.find((t) => t.isInternal && t.internalType === 'start');
}

function openStartTab() {
  const existing = findStartTab();
  if (existing) { switchTab(existing.id); return existing; }
  return createStartTab();
}

function createStartTab(activate = true) {

  tabCounter += 1;
  const id = `tab-${tabCounter}`;

  const tabEl = document.createElement('div');
  tabEl.className = 'tab';
  tabEl.dataset.id = id;
  tabEl.innerHTML = `
    <div class="favicon"><i class="fa-solid fa-house"></i></div>
    <div class="title">Accueil</div>
    <button class="close-tab" title="Fermer">&#10005;</button>
  `;
  tabEl.addEventListener('click', (e) => {
    if (e.target.closest('.close-tab')) return;
    switchTab(id);
  });
  tabEl.querySelector('.close-tab').addEventListener('click', () => closeTab(id));
  tabsEl.appendChild(tabEl);

  const page = document.createElement('div');
  page.className = 'internal-page start-page';
  page.innerHTML = START_PAGE_TEMPLATE;
  makeInternalWebviewStub(page);
  page.getURL = () => 'browser://start';
  webviewsEl.appendChild(page);

  const tab = {
    id, webview: page, tabEl,
    title: 'Accueil', url: 'browser://start',
    isInternal: true, internalType: 'start',
    isNewTabState: true,
  };
  tabs.push(tab);

  wireStartPage(page);
  if (activate) switchTab(id);
  return tab;
}
