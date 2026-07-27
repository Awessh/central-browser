// ============================================================
// Traducteur de page
// ============================================================
// Extraction du texte de la page, traduction par lots (API configurée
// dans les paramètres) et réinjection ; restauration du texte original.
//
// Dépend de (doit être chargé après) :
//   - dom-state.js
//   - tabs.js
//   - api.getSettings / api.translateChunk
// ============================================================

// ============================================================
// Traducteur de page
// ============================================================
const translatedTabs = new Set(); // ids d'onglets actuellement traduits

translateBtn.addEventListener('click', () => {
  translateDropdown.classList.toggle('hidden');
  menuDropdown.classList.add('hidden');
  accountDropdown.classList.add('hidden');
  const tab = getActiveTab();
  translateRevertBtn.classList.toggle('hidden', !(tab && translatedTabs.has(tab.id)));
  translateStatus.textContent = '';
});

function markActiveLangMenuItem(lang) {
  translateLangMenu.querySelectorAll('button').forEach((b) => b.classList.toggle('active', b.dataset.lang === lang));
  translateCurrentLabel.textContent = TRANSLATE_LANG_LABELS[lang] || lang;
}

translateSelectBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  translateLangMenu.classList.toggle('hidden');
});
translateCloseBtn.addEventListener('click', () => {
  translateDropdown.classList.add('hidden');
  translateLangMenu.classList.add('hidden');
});

const EXTRACT_SCRIPT = `(function(){
  window.__sbNodes = [];
  window.__sbOriginal = [];
  const skip = new Set(['SCRIPT','STYLE','NOSCRIPT','TEXTAREA','INPUT','IFRAME','CODE','PRE']);
  if (!document.body) return [];
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      if (!node.nodeValue || !node.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
      const parent = node.parentElement;
      if (!parent || skip.has(parent.tagName)) return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_ACCEPT;
    }
  });
  let n;
  while ((n = walker.nextNode())) {
    window.__sbNodes.push(n);
    window.__sbOriginal.push(n.nodeValue);
  }
  return window.__sbOriginal.slice();
})();`;

function injectionScript(translatedArray) {
  return `(function(translated){
    if (!window.__sbNodes) return false;
    for (let i = 0; i < window.__sbNodes.length; i++) {
      if (translated[i] !== undefined && translated[i] !== null) window.__sbNodes[i].nodeValue = translated[i];
    }
    return true;
  })(${JSON.stringify(translatedArray)});`;
}

const REVERT_SCRIPT = `(function(){
  if (!window.__sbNodes || !window.__sbOriginal) return false;
  for (let i = 0; i < window.__sbNodes.length; i++) window.__sbNodes[i].nodeValue = window.__sbOriginal[i];
  return true;
})();`;

async function runWithConcurrency(items, limit, worker) {
  const results = new Array(items.length);
  let cursor = 0;
  async function next() {
    while (cursor < items.length) {
      const i = cursor++;
      results[i] = await worker(items[i], i);
    }
  }
  await Promise.all(new Array(Math.min(limit, items.length)).fill(0).map(next));
  return results;
}

async function translatePage(tab, targetLang) {
  markActiveLangMenuItem(targetLang);
  translateStatus.textContent = 'Extraction du texte…';

  const s = await api.getSettings();
  const usingGoogleFallback = s.translation?.provider === 'google' && !s.translation?.googleApiKey;

  const originalTexts = await tab.webview.executeJavaScript(EXTRACT_SCRIPT);
  if (!originalTexts || originalTexts.length === 0) {
    translateStatus.textContent = 'Rien à traduire sur cette page.';
    return;
  }

  const sourceLang = 'auto';
  let failures = 0;
  translateStatus.textContent = `Traduction de ${originalTexts.length} segments…`;

  const translated = await runWithConcurrency(originalTexts, 6, async (text) => {
    if (text.length > 480) text = text.slice(0, 480); // limite du service gratuit
    const res = await api.translateChunk({ text, source: sourceLang, target: targetLang });
    if (!res.ok) failures += 1;
    return res.text;
  });

  await tab.webview.executeJavaScript(injectionScript(translated));
  translatedTabs.add(tab.id);
  translateRevertBtn.classList.remove('hidden');

  translateStatus.textContent = failures > 0
    ? `Traduit avec ${failures} segment(s) non traduits (quota du service gratuit probablement atteint).`
    : usingGoogleFallback
      ? 'Page traduite (clé API Google absente : service gratuit MyMemory utilisé à la place — configurez votre clé dans Paramètres).'
    : 'Page traduite.';
}

translateLangMenu.addEventListener('click', (e) => {
  const lang = e.target.closest('button')?.dataset.lang;
  const tab = getActiveTab();
  translateLangMenu.classList.add('hidden');
  if (!lang || !tab) return;
  translatePage(tab, lang);
});

translateRevertBtn.addEventListener('click', async () => {
  const tab = getActiveTab();
  if (!tab) return;
  await tab.webview.executeJavaScript(REVERT_SCRIPT);
  translatedTabs.delete(tab.id);
  translateRevertBtn.classList.add('hidden');
  translateStatus.textContent = 'Page originale restaurée.';
  translateLangMenu.querySelectorAll('button').forEach((b) => b.classList.remove('active'));
});

