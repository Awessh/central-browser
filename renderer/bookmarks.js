// ============================================================
// Favoris (étoile, barre de favoris, panneau complet)
// ============================================================
// État de l'étoile dans la barre d'adresse, rendu de la barre de favoris,
// et rendu/filtrage du panneau latéral des favoris.
//
// Dépend de (doit être chargé après) :
//   - dom-state.js
//   - utils.js
//   - tabs.js
// ============================================================

// ============================================================
// Favoris
// ============================================================
function updateStarState() {
  const tab = getActiveTab();
  if (!tab) return;
  if (tab.isInternal) {
    starBtn.classList.remove('active');
    starBtn.innerHTML = '<i class="fa-regular fa-star"></i>';
    return;
  }
  const exists = bookmarks.some((b) => b.url === tab.url);
  starBtn.classList.toggle('active', exists);
  starBtn.innerHTML = exists ? '<i class="fa-solid fa-star"></i>' : '<i class="fa-regular fa-star"></i>';
}

starBtn.addEventListener('click', async () => {
  const tab = getActiveTab();
  if (!tab || tab.isInternal) return;
  const exists = bookmarks.some((b) => b.url === tab.url);
  if (exists) {
    bookmarks = await api.removeBookmark(tab.url);
  } else {
    bookmarks = await api.addBookmark({ url: tab.url, title: tab.title });
  }
  renderBookmarksBar();
  updateStarState();
  refreshStartBookmarksWidgets();
});

function renderBookmarksBar() {
  bookmarksBar.innerHTML = '';
  bookmarksBar.classList.toggle('empty', bookmarks.length === 0);
  bookmarks.forEach((b) => {
    const el = document.createElement('div');
    el.className = 'bookmark-item';
    el.innerHTML = `<span>${escapeHtml(b.title || b.url)}</span><button class="remove-bm">&#10005;</button>`;
    el.addEventListener('click', (e) => {
      if (e.target.closest('.remove-bm')) return;
      getActiveTab()?.webview.loadURL(b.url);
    });
    el.querySelector('.remove-bm').addEventListener('click', async () => {
      bookmarks = await api.removeBookmark(b.url);
      renderBookmarksBar();
      updateStarState();
      renderBookmarksPanel();
      refreshStartBookmarksWidgets();
    });
    bookmarksBar.appendChild(el);
  });
}

// ============================================================
// Favoris — panneau complet
// ============================================================
async function renderBookmarksPanel() {
  const data = await api.getAllData();
  bookmarks = data.bookmarks;
  paintBookmarksList(bookmarks);
}
function paintBookmarksList(list) {
  const listEl = document.getElementById('bookmarks-list');
  listEl.innerHTML = '';
  if (list.length === 0) { listEl.innerHTML = '<div class="bookmark-row">Aucun favori pour le moment.</div>'; return; }
  list.forEach((b) => {
    const el = document.createElement('div');
    el.className = 'bookmark-row';
    el.innerHTML = `
      <div class="b-title">${escapeHtml(b.title || b.url)}</div>
      <div class="b-url">${escapeHtml(b.url)}</div>
      <div class="row-actions"><button data-remove>Supprimer</button></div>
    `;
    el.addEventListener('click', (e) => {
      if (e.target.closest('[data-remove]')) return;
      openUrlSmart(b.url);
    });
    el.querySelector('[data-remove]').addEventListener('click', async () => {
      bookmarks = await api.removeBookmark(b.url);
      renderBookmarksBar();
      paintBookmarksList(bookmarks);
      updateStarState();
      refreshStartBookmarksWidgets();
    });
    listEl.appendChild(el);
  });
}
document.getElementById('bookmarks-search').addEventListener('input', (e) => {
  const q = e.target.value.trim().toLowerCase();
  const filtered = bookmarks.filter((b) => (b.title || '').toLowerCase().includes(q) || b.url.toLowerCase().includes(q));
  paintBookmarksList(filtered);
});

