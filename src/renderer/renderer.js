function applyTheme(accent){
  if(!accent) return;
  const root = document.documentElement;
  root.style.setProperty('--accent', accent);
  // Also expose RGB so CSS can use rgba(var(--accent-rgb), alpha) for soft glows/backgrounds
  try{
    let hex = String(accent).trim();
    if (hex.startsWith('#')) hex = hex.slice(1);
    if (hex.length === 3) hex = hex.split('').map(c=>c+c).join('');
    if (hex.length === 6){
      const r = parseInt(hex.slice(0,2),16);
      const g = parseInt(hex.slice(2,4),16);
      const b = parseInt(hex.slice(4,6),16);
      if ([r,g,b].every(n => Number.isFinite(n))) root.style.setProperty('--accent-rgb', `${r},${g},${b}`);
    }
  }catch{}
}
const THEME_PRESETS = ['#C832A0','#3B82F6','#22C55E','#F97316','#A855F7'];

const $ = (id) => document.getElementById(id);
function safeOn(el, ev, fn){ if (el) el.addEventListener(ev, fn); }


// -------------------- i18n (ES/EN) --------------------
const I18N_ES_TO_EN = {
  "Filtros":"Filters",
  "Nombre (A→Z)":"Name (A→Z)",
  "Nombre (Z→A)":"Name (Z→A)",
  "Horas (más→menos)":"Hours (high→low)",
  "Horas (menos→más)":"Hours (low→high)",
  "% logros (más→menos)":"% achievements (high→low)",
  "% logros (menos→más)":"% achievements (low→high)",
  "Puntuación (más→menos)":"Rating (high→low)",
  "Puntuación (menos→más)":"Rating (low→high)",
  "Dificultad (más→menos)":"Difficulty (high→low)",
  "Dificultad (menos→más)":"Difficulty (low→high)",
  "Ajustes":"Settings",
  "Añadir Juegos":"Add Games",
  "Sync ahora":"Sync now",
  "Sincronizando":"Syncing",
  "Sincronizando...":"Syncing...",
  "Sincronizando…":"Syncing…",
  "Click Aquí":"Click Here",
  "Exportar":"Export",
  "Importar":"Import",
  "Todos":"All",
  "En curso":"In progress",
  "Posibles 100%":"Possible 100%",
  "Parados":"Backlog",
  "Al 100%":"100% done",
  "Pendientes":"Pending",
  "Por Año":"By year",
  "Steam Web API Key (se guarda local)":"Steam Web API Key (stored locally)",
  "Click aquí":"Click Here",
  "Clic aquí":"Click Here",
  "Clic Aquí":"Click Here",
  "Necesaria para horas/logros. Tu perfil debe permitir ver juegos/logros.":"Needed for hours/achievements. Your profile must allow games/achievements visibility.",
  "SteamID64":"SteamID64",
  "Idioma":"Language",
  "Sync cada (min)":"Sync every (min)",
  "Color de la interfaz":"UI color",
  "Magenta (default)":"Magenta (default)",
  "Azul":"Blue",
  "Verde":"Green",
  "Naranja":"Orange",
  "Morado":"Purple",
  "Personalizado (HEX)":"Custom (HEX)",
  "Apóyame si te gusta el proyecto <3":"Support me if you like the project <3",
  "Donación":"Donate",
  "Cancelar":"Cancel",
  "Guardar":"Save",
  "¿No aparece (biblioteca compartida)? Añade por nombre o AppID:":"Not showing (shared library)? Add by name or AppID:",
  "Nombre o AppID (ej: Super Meat Boy o 40800)":"Name or AppID (e.g., Super Meat Boy or 40800)",
  "Buscar":"Search",
  "Buscar… (nombre)":"Search… (name)",
  "Filtrar por nombre…":"Filter by name…",
  "Horas":"Hours",
  "% Logros":"% Achievements",
  "juegos":"games",
  "horas":"hours",
  "logros":"achievements",
  "progreso global":"overall progress",
  "al 100%":"at 100%",
  "Último sync:":"Last sync:",
  "AppID detectado:":"AppID detected:",
  "Ej: Plataformas / Roguelike / Deckbuilder":"e.g., Platformer / Roguelike / Deckbuilder",
  "Ej: Acción / Indie":"e.g., Action / Indie",
  "Ej: pendiente DLC…":"e.g., DLC pending…",
  "Plataformas":"Platformer",
  "Plataformas de precisión":"Precision platformer",
  "Acción":"Action",
  "Aventura":"Adventure",
  "Estrategia":"Strategy",
  "Simulación":"Simulation",
  "Carreras":"Racing",
  "Recargar lista":"Reload list",
  "Seleccionar todo (según búsqueda)":"Select all (based on search)",
  "Marca los juegos que quieras añadir. Solo esos se sincronizan.":"Select the games you want to add. Only those will sync.",
  "Cerrar":"Close",
  "Añadir seleccionados":"Add selected",
  "Editar":"Edit",
  "Estado":"Status",
  "Sin estado":"No status",
  "Puntuación (1–100)":"Rating (1–100)",
  "Dificultad (manual 1–10)":"Difficulty (manual 1–10)",
  "Horas (manual)":"Hours (manual)",
  "Género principal":"Primary genre",
  "Género secundario (opcional)":"Secondary genre (optional)",
  "Notas":"Notes",
  "Eliminar":"Delete",
  "Puntuación":"Rating",
  "Solo con puntuación":"Only with rating",
  "Dificultad":"Difficulty",
  "1–3 (muy fácil)":"1–3 (very easy)",
  "4–6 (media)":"4–6 (medium)",
  "7–8 (difícil)":"7–8 (hard)",
  "9–10 (extrema)":"9–10 (extreme)",
  "Horas jugadas":"Hours played",
  "Progreso de logros":"Achievement progress",
  "Géneros":"Genres",
  "Cualquiera":"Any",
  "Solo con notas":"Only with notes",
  "Limpiar":"Clear",
  "Aplicar":"Apply",
  "Añadir AppID":"Add AppID",
  "Logros":"Achievements"
};
const I18N_EN_TO_ES = Object.fromEntries(Object.entries(I18N_ES_TO_EN).map(([es,en])=>[en,es]));

function getUILang(){
  // UI language is driven by the settings select, but fallback to stored value if needed
  const val = (language && language.value) ? language.value : null;
  return val || 'english';
}

function translateString(s, lang){
  if(!s) return s;
  const toEnglish = (lang === 'english');
  const exact = toEnglish ? I18N_ES_TO_EN[s] : I18N_EN_TO_ES[s];
  if(exact) return exact;

  // Dynamic patterns
  // "0 seleccionados" -> "0 selected"
  let m = s.match(/^(\d+)\s+seleccionados$/i);
  if(m){
    return toEnglish ? `${m[1]} selected` : `${m[1]} seleccionados`;
  }

  // Prefix replacements e.g. "Géneros: X" / "Genres: X"
  const esPrefixes = {"Géneros:":"Genres:","Logros":"Achievements","Puntuación":"Rating"};
  const enPrefixes = {"Genres:":"Géneros:","Achievements":"Logros","Rating":"Puntuación"};
  const prefixes = toEnglish ? esPrefixes : enPrefixes;
  for(const [from,to] of Object.entries(prefixes)){
    if(s.startsWith(from)){
      return to + s.slice(from.length);
    }
  }

  return s;
}


const GENRE_SUGGESTIONS_ES = [
  "Plataformas",
  "Plataformas de precisión",
  "Metroidvania",
  "Roguelike",
  "Roguelite",
  "Deckbuilder",
  "RPG",
  "Acción",
  "Aventura",
  "Puzzle",
  "Estrategia",
  "Soulslike",
  "FPS",
  "Simulación",
  "Carreras",
  "Indie",
  "Casual"
];

const GENRE_SUGGESTIONS_EN = [
  "Platformer",
  "Precision platformer",
  "Metroidvania",
  "Roguelike",
  "Roguelite",
  "Deckbuilder",
  "RPG",
  "Action",
  "Adventure",
  "Puzzle",
  "Strategy",
  "Soulslike",
  "FPS",
  "Simulation",
  "Racing",
  "Indie",
  "Casual"
];

function rebuildGenreSuggestions(lang){
  const dl = document.getElementById('genreSuggestions');
  if (!dl) return;
  const arr = (lang === 'english') ? GENRE_SUGGESTIONS_EN : GENRE_SUGGESTIONS_ES;
  dl.innerHTML = arr.map(v => `<option value="${v}"></option>`).join('');
}

function applyI18n(){
  const lang = getUILang();
  document.documentElement.lang = (lang === 'english') ? 'en' : 'es';

  // Update option labels for the language selector itself (keep values stable)
  try{
    const opts = language ? Array.from(language.querySelectorAll('option')) : [];
    for(const o of opts){
      if(o.value === 'english') o.textContent = (lang==='english') ? 'English' : 'English';
      if(o.value === 'spanish') o.textContent = (lang==='english') ? 'Spanish' : 'Español';
    }
  }catch(_){}

  // Translate safe UI elements by exact match only (prevents touching game titles)
  // Include <b> because modal titles are wrapped in <b> inside .modalHead
  const candidates = document.querySelectorAll('label,button,a,option,h1,h2,h3,span,small,p,div,b');
  for(const el of candidates){
    // If the element contains other elements (e.g. <label><input/> Text</label>),
    // translate only its text nodes so we don't destroy interactive children.
    if(el.children && el.children.length){
      for(const node of Array.from(el.childNodes || [])){
        if(node.nodeType !== Node.TEXT_NODE) continue;
        const raw = node.nodeValue || '';
        const trimmed = raw.trim();
        if(!trimmed) continue;
        const next = translateString(trimmed, lang);
        if(next !== trimmed){
          node.nodeValue = raw.replace(trimmed, next);
        }
      }
      continue;
    }

    const txt = (el.textContent || '').trim();
    if(!txt) continue;
    const next = translateString(txt, lang);
    if(next !== txt) el.textContent = next;
  }

  // Translate placeholders (input placeholders are common)
  const inputs = document.querySelectorAll('input[placeholder],textarea[placeholder]');
  for(const el of inputs){
    const ph = (el.getAttribute('placeholder') || '').trim();
    const next = translateString(ph, lang);
    if(next !== ph) el.setAttribute('placeholder', next);
  }

  rebuildGenreSuggestions(lang);
}

// Selected counter in the "Add Games" modal is updated dynamically, so translate it at the time we set it.
function setSelectedCount(n){
  try{
    if(!selectedCount) return;
    const base = `${Number(n)||0} seleccionados`;
    selectedCount.textContent = translateString(base, getUILang());
  }catch{}
}
// ------------------ end i18n ------------------

// Open external links in the system browser (safe in Electron).
document.addEventListener('click', async (e) => {
  const el = e.target.closest('[data-external-url]');
  if (!el) return;
  // Prevent default navigation for anchors; buttons don't need it.
  if (el.tagName === 'A') e.preventDefault();
  const url = el.getAttribute('data-external-url');
  try { await window.api?.openExternal?.(url); } catch {}
});


function updateStickyOffset(){
  const header = document.querySelector('header');
  const sticky = document.querySelector('.sticky-shell');
  const h = header ? header.offsetHeight : 0;
  const s = sticky ? sticky.offsetHeight : 0;
  document.documentElement.style.setProperty('--header-h', (h || 0) + 'px');
  document.documentElement.style.setProperty('--summary-h', (s || 0) + 'px');
}
window.addEventListener('resize', () => { updateStickyOffset(); });


const grid = $('grid');

function scrollToGamesTop(){
  try{
    if (!grid) return;
    const headerH = document.querySelector('header')?.offsetHeight || 0;
    const stickyH = document.querySelector('.sticky-shell')?.offsetHeight || 0;
    const y = grid.getBoundingClientRect().top + window.scrollY - headerH - stickyH - 8;
    window.scrollTo({ top: Math.max(0, y), behavior: 'smooth' });
  }catch{}
}

const stats = $('stats');
const q = $('q');
const sort = $('sort');
const sortDirBtn = $('sortDirBtn');
const filterBtn = $('filterBtn');
const filterModal = $('filterModal');
const filterMinScore = $('filterMinScore');
const filterMaxScore = $('filterMaxScore');
const filterMinHours = $('filterMinHours');
const filterMaxHours = $('filterMaxHours');
const filterGenreSelect = $('filterGenreSelect');
const clearFiltersBtn = $('clearFiltersBtn');
const filterDiff_1_3 = $('filterDiff_1_3');
const filterDiff_4_6 = $('filterDiff_4_6');
const filterDiff_7_8 = $('filterDiff_7_8');
const filterDiff_9_10 = $('filterDiff_9_10');
const filterProg_0_25 = $('filterProg_0_25');
const filterProg_25_50 = $('filterProg_25_50');
const filterProg_50_75 = $('filterProg_50_75');
const filterProg_75_99 = $('filterProg_75_99');
const filterProg_100 = $('filterProg_100');

const filterOnlyRated = $('filterOnlyRated');
const filterOnlyNotes = $('filterOnlyNotes');
const applyFiltersBtn = $('applyFiltersBtn');

const settingsBtn = $('settingsBtn');
const settingsModal = $('settingsModal');
const steamApiKey = $('steamApiKey');
const steamId = $('steamId');
const language = $('language');
const syncMinutes = $('syncMinutes');

safeOn(language, 'change', async () => {
  try{ await window.api.setSettings({ language: language.value }); }catch(_){}
  applyI18n();
  try{ await refreshLibrary(); }catch(_){}
});

const themeAccent = document.getElementById('themeAccent');
const themeAccentCustom = document.getElementById('themeAccentCustom');

const addFromSteamBtn = $('addFromSteamBtn');
const steamModal = $('steamModal');
const steamList = $('steamList');
const steamSearch = $('steamSearch');
const manualAddTerm = $('manualAddTerm');
const manualAddSearch = $('manualAddSearch');
const manualAddResults = $('manualAddResults');
const reloadOwnedBtn = $('reloadOwnedBtn');
const addCheckedBtn = $('addCheckedBtn');

const syncBtn = $('syncBtn');
const exportBtn = $('exportBtn');
const importBtn = $('importBtn');

const editModal = $('editModal');
const editAppid = $('editAppid');
const editStatus = $('editStatus');
const editRating = $('editRating');
const editDifficulty = $('editDifficulty');
const editGenrePrimary = $('editGenrePrimary');
const editGenreSecondary = $('editGenreSecondary');
const editNotes = $('editNotes');
const deleteGameBtn = document.getElementById('deleteGameBtn');
const editManualHours = document.getElementById('editManualHours');
const editGameTitle = document.getElementById('editGameTitle');
const editGameCover = document.getElementById('editGameCover');

const fAll = $('fAll');
const fInProgress = $('fInProgress');
const fPossible = $('fPossible');
const fPaused = $('fPaused');
const fDone = $('fDone');
const fTodo = $('fTodo');
const fYear = $('fYear');
const yearSelect = $('yearSelect');

let library = [];
let lastSync = 0;
let ownedCache = [];
let selectedToAdd = new Set();

let filterMode = 'all'; // all | in_progress | possible_100 | paused | done | todo | year
let selectedYear = null;

let filters = {
  minRating: null,
  maxRating: null,
  onlyRated: false,
  onlyNotes: false,
  diffRanges: new Set(),   // '1-3' | '4-6' | '7-8' | '9-10'
  minHours: null,
  maxHours: null,
  progRanges: new Set(),   // '0-25' | '25-50' | '50-75' | '75-99' | '100'
  genre: null              // single selected genre
};

function diffBucket(d){
  // Note: Number('') === 0, so empty difficulty would incorrectly fall into 1–3.
  // Treat empty/blank difficulty as missing.
  if (d == null) return null;
  if (typeof d === 'string' && d.trim() === '') return null;
  const n = Number(d);
  if (!Number.isFinite(n)) return null;
  if (n <= 3) return '1-3';
  if (n <= 6) return '4-6';
  if (n <= 8) return '7-8';
  return '9-10';
}
function progBucket(p){
  const n = Number(p);
  if (!Number.isFinite(n)) return null;
  if (n >= 100) return '100';
  if (n >= 75) return '75-99';
  if (n >= 50) return '50-75';
  if (n >= 25) return '25-50';
  return '0-25';
}
function gameGenres(g){
  const out = [];
  const push = (s) => {
    if (!s) return;
    String(s).split(/[•·,\/|]/g).map(x=>x.trim()).filter(Boolean).forEach(t=>out.push(t));
  };
  push(g?.genrePrimary);
  push(g?.genreSecondary);
  // Dedup
  return Array.from(new Set(out));
}
function allGenresFromLibrary(){
  const set = new Set();
  for (const g of library){
    for (const t of gameGenres(g)) set.add(t);
  }
  return Array.from(set).sort((a,b)=>a.localeCompare(b, 'es', { sensitivity:'base' }));
}
function populateGenreSelect(){
  if (!filterGenreSelect) return;
  const genres = allGenresFromLibrary();
  const current = filters.genre || '';
  filterGenreSelect.innerHTML = [
    `<option value="">${escapeHtml(translateString('Cualquiera', getUILang()))}</option>`,
    ...genres.map(name => `<option value="${escapeHtml(name)}">${escapeHtml(name)}</option>`)
  ].join('');
  filterGenreSelect.value = genres.includes(current) ? current : '';
}
function syncFilterUIFromState(){
  if (filterMinScore) filterMinScore.value = (filters.minRating ?? '') === null ? '' : String(filters.minRating ?? '');
  if (filterMaxScore) filterMaxScore.value = (filters.maxRating ?? '') === null ? '' : String(filters.maxRating ?? '');
  if (filterOnlyRated) filterOnlyRated.checked = !!filters.onlyRated;
  if (filterOnlyNotes) filterOnlyNotes.checked = !!filters.onlyNotes;
  if (filterMinHours) filterMinHours.value = (filters.minHours ?? '') === null ? '' : String(filters.minHours ?? '');
  if (filterMaxHours) filterMaxHours.value = (filters.maxHours ?? '') === null ? '' : String(filters.maxHours ?? '');

  const has = (set, v) => set && set.has(v);
  if (filterDiff_1_3) filterDiff_1_3.checked = has(filters.diffRanges,'1-3');
  if (filterDiff_4_6) filterDiff_4_6.checked = has(filters.diffRanges,'4-6');
  if (filterDiff_7_8) filterDiff_7_8.checked = has(filters.diffRanges,'7-8');
  if (filterDiff_9_10) filterDiff_9_10.checked = has(filters.diffRanges,'9-10');

  if (filterProg_0_25) filterProg_0_25.checked = has(filters.progRanges,'0-25');
  if (filterProg_25_50) filterProg_25_50.checked = has(filters.progRanges,'25-50');
  if (filterProg_50_75) filterProg_50_75.checked = has(filters.progRanges,'50-75');
  if (filterProg_75_99) filterProg_75_99.checked = has(filters.progRanges,'75-99');
  if (filterProg_100) filterProg_100.checked = has(filters.progRanges,'100');

  populateGenreSelect();
}
function readFiltersFromUI(){
  const ms = Number((filterMinScore?.value||'').trim());
  filters.minRating = (Number.isFinite(ms) && (filterMinScore?.value||'').trim() !== '') ? ms : null;
  const mx = Number((filterMaxScore?.value||'').trim());
  filters.maxRating = (Number.isFinite(mx) && (filterMaxScore?.value||'').trim() !== '') ? mx : null;

  filters.onlyRated = !!filterOnlyRated?.checked;
  filters.onlyNotes = !!filterOnlyNotes?.checked;

  const minh = Number((filterMinHours?.value||'').trim());
  filters.minHours = (Number.isFinite(minh) && (filterMinHours?.value||'').trim() !== '') ? minh : null;
  const maxh = Number((filterMaxHours?.value||'').trim());
  filters.maxHours = (Number.isFinite(maxh) && (filterMaxHours?.value||'').trim() !== '') ? maxh : null;

  const dr = new Set();
  if (filterDiff_1_3?.checked) dr.add('1-3');
  if (filterDiff_4_6?.checked) dr.add('4-6');
  if (filterDiff_7_8?.checked) dr.add('7-8');
  if (filterDiff_9_10?.checked) dr.add('9-10');
  filters.diffRanges = dr;

  const pr = new Set();
  if (filterProg_0_25?.checked) pr.add('0-25');
  if (filterProg_25_50?.checked) pr.add('25-50');
  if (filterProg_50_75?.checked) pr.add('50-75');
  if (filterProg_75_99?.checked) pr.add('75-99');
  if (filterProg_100?.checked) pr.add('100');
  filters.progRanges = pr;

  // Single genre selection
  const gsel = (filterGenreSelect?.value || '').trim();
  filters.genre = gsel ? gsel : null;
}
function clearAllFilters(){
  filters = {
    minRating: null, maxRating: null,
    onlyRated: false, onlyNotes: false,
    diffRanges: new Set(),
    minHours: null, maxHours: null,
    progRanges: new Set(),
    genre: null
  };
  syncFilterUIFromState();
}


function escapeHtml(str){
  return String(str ?? '').replace(/[&<>"']/g, s => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[s]));
}
function pct(u, t){
  const total = Math.max(0, Number(t)||0);
  const unlocked = Math.max(0, Number(u)||0);
  if (total <= 0) return 0;
  return Math.max(0, Math.min(100, (unlocked/total)*100));
}

// Hours to show/sort: prefer manualHours when provided (useful for non-owned games).
function effectiveHours(g){
  const mh = g && g.manualHours;
  // Treat manualHours <= 0 as "unset" so the app falls back to automatic Steam hours.
  // This lets users reset a previous manual value by entering 0.
  if (mh != null && mh !== '' && Number.isFinite(Number(mh)) && Number(mh) > 0) return Number(mh);
  return Number(g?.hours) || 0;
}
function isDone(g){
  return (Number(g.achTotal)||0) > 0 && (Number(g.achUnlocked)||0) >= (Number(g.achTotal)||0);
}
function gameCompletedYear(g){
  const sec = Number(g.completedAtSec)||0;
  if (!sec) return null;
  return new Date(sec*1000).getFullYear();
}
function formatDate(ts){
  if (!ts) return '—';
  try{
    const d = new Date(ts);
    return d.toLocaleString('es-ES', {year:'2-digit', month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit'});
  }catch{return '—'}
}
function statusLabel(code){
  if (!code) return '';
  const map = { in_progress:'En curso', possible_100:'Posibles 100%', paused:'Parados' };
  return map[code] || code.replaceAll('_',' ');
}

function resetAddGamesModal(){
  // Clear searches and temporary UI state so next open starts clean.
  if (steamSearch) steamSearch.value = '';
  if (manualAddTerm) manualAddTerm.value = '';
  if (manualAddResults) {
    manualAddResults.innerHTML = '';
    manualAddResults.style.gridTemplateColumns = '1fr';
  }

  // Reset selection state
  selectedToAdd = new Set();
  setSelectedCount(0);
  if (selectAllOwned) {
    selectAllOwned.checked = false;
    selectAllOwned.indeterminate = false;
  }

  // Re-render owned list with empty filter
  if (steamList && ownedCache && ownedCache.length) {
    renderOwnedList();
  }
}

async function enrichAppid(appid){
  try{
    const url = `https://store.steampowered.com/api/appdetails?appids=${appid}&l=english`;
    const res = await fetch(url);
    if (!res.ok) return;
    const j = await res.json();
    const data = j?.[String(appid)]?.data;
    if (!data) return;

    const name = data.name || '';
    const coverUrl = data.header_image || `https://cdn.cloudflare.steamstatic.com/steam/apps/${appid}/header.jpg`;
    const genres = (data.genres || []).map(g=>g.description).filter(Boolean);
    const description = data.short_description || '';
    const ordered = genres.filter(g=>g!=='Indie').concat(genres.filter(g=>g==='Indie'));
    const genrePrimary = ordered[0] || '';
    const genreSecondary = ordered[1] || '';

    await window.api.updateManual({
      appid,
      name,
      coverUrl,
      // only set genres if user hasn't locked them or they are empty (main side also guards on sync later)
      genrePrimary,
      genreSecondary
    });
  }catch{}
}

function computeStats(list){
  const count = list.length;
  const hours = list.reduce((a,g)=>a + effectiveHours(g), 0);
  const totalAch = list.reduce((a,g)=>a + (Number(g.achTotal)||0), 0);
  const unlockedAch = list.reduce((a,g)=>a + (Number(g.achUnlocked)||0), 0);
  const p = totalAch>0 ? (unlockedAch/totalAch)*100 : 0;
  const completed = list.filter(isDone).length;
  return {count, hours, totalAch, unlockedAch, p, completed};
}


function renderStats(list){
  const s = computeStats(list);
  const lang = getUILang();
  const t = (es, en) => (lang === 'english') ? en : es;

  stats.innerHTML = [
    `<div class="stat"><b>${s.count}</b> ${t('juegos','games')}</div>`,
    `<div class="stat"><b>${s.hours.toFixed(1)}</b> ${t('horas','hours')}</div>`,
    `<div class="stat"><b>${s.unlockedAch}</b>/<b>${s.totalAch}</b> ${t('logros','achievements')}</div>`,
    `<div class="stat"><b>${s.p.toFixed(1)}%</b> ${t('progreso global','overall progress')}</div>`,
    `<div class="stat"><b>${s.completed}</b>/<b>${s.count}</b> ${t('al 100%','at 100%')}</div>`,
    `<div class="stat">${t('Último sync:','Last sync:')} <b>${formatDate(lastSync)}</b></div>`
  ].join('');
}


function updateYearSelect(){
  if (!yearSelect) return;
  const years = Array.from(new Set(library.map(gameCompletedYear).filter(Boolean))).sort((a,b)=>b-a);
  if (!years.length){
    yearSelect.style.display = 'none';
    yearSelect.innerHTML = '';
    selectedYear = null;
    return;
  }
  yearSelect.innerHTML = years.map(y => `<option value="${y}">${y}</option>`).join('');
  if (!selectedYear) selectedYear = years[0];
  yearSelect.value = String(selectedYear);
}

function applyQueryAndSort(){
  const term = (q?.value || '').trim().toLowerCase();
  let list = library.slice();

  // Search term
  if (term) list = list.filter(g => (g.name||'').toLowerCase().includes(term));

  // Category filter (tabs)
  if (filterMode !== 'all'){
    list = list.filter(g => {
      const done = isDone(g);
      if (filterMode === 'done') return done;
      if (filterMode === 'todo') return !done;
      if (filterMode === 'year'){
        const y = gameCompletedYear(g);
        return done && y && String(y) === String(selectedYear);
      }
      return (g.status || '') === filterMode;
    });
  }

  // Advanced filters (modal)
  if (filters){
    if (filters.onlyNotes) list = list.filter(g => (g.notes||'').trim().length > 0);

    if (filters.onlyRated) list = list.filter(g => (g.rating != null && g.rating !== '' && Number.isFinite(Number(g.rating))));
    if (filters.minRating != null) list = list.filter(g => Number(g.rating) >= Number(filters.minRating));
    if (filters.maxRating != null) list = list.filter(g => Number(g.rating) <= Number(filters.maxRating));

    if (filters.minHours != null) list = list.filter(g => effectiveHours(g) >= Number(filters.minHours));
    if (filters.maxHours != null) list = list.filter(g => effectiveHours(g) <= Number(filters.maxHours));

    if (filters.diffRanges && filters.diffRanges.size){
      list = list.filter(g => {
        const b = diffBucket(g.difficulty);
        return b && filters.diffRanges.has(b);
      });
    }

    if (filters.progRanges && filters.progRanges.size){
      list = list.filter(g => {
        const hasAch = Number(g.achTotal) > 0;
        if (!hasAch) return false;
        const p = pct(g.achUnlocked, g.achTotal);
        const b = progBucket(p);
        return b && filters.progRanges.has(b);
      });
    }

    if (filters.genre){
      list = list.filter(g => {
        const gs = gameGenres(g);
        return gs.includes(filters.genre);
      });
    }
  }

  // Sorting
  const [key, dir] = (sort?.value || 'name-asc').split('-');
  const mul = dir === 'asc' ? 1 : -1;

  // When sorting by rating or difficulty, hide entries without that value
  if (key === 'rating'){
    list = list.filter(g => g.rating != null && String(g.rating).trim() !== '');
  }
  if (key === 'diff'){
    list = list.filter(g => g.difficulty != null && String(g.difficulty).trim() !== '');
  }
  // When sorting by hours, hide games with 0 hours so the first entries are truly the least played.
  if (key === 'hours'){
    list = list.filter(g => effectiveHours(g) > 0);
  }

  list.sort((a,b) => {
    if (key === 'name') return (a.name||'').localeCompare(b.name||'', 'es') * mul;
    if (key === 'hours') return (effectiveHours(a) - effectiveHours(b)) * mul;
    if (key === 'pct') return (pct(a.achUnlocked,a.achTotal) - pct(b.achUnlocked,b.achTotal)) * mul;
    if (key === 'rating') return (Number(a.rating) - Number(b.rating)) * mul;
    if (key === 'diff') return (Number(a.difficulty) - Number(b.difficulty)) * mul;
    return 0;
  });

  return list;
}

function cardHTML(g){
  const done = isDone(g);
  const p = pct(g.achUnlocked, g.achTotal);
  const diff = (g.difficulty != null && g.difficulty !== '') ? `${g.difficulty}/10` : '—';
  const cover = g.coverUrl ? `<img alt="Portada ${escapeHtml(g.name)}" src="${escapeHtml(g.coverUrl)}" loading="lazy" onerror="this.style.display='none'">` : '';
  const badgeText = (done ? '✅ 100%' : '') + ((done && g.status) ? ' · ' : '') + (g.status ? statusLabel(g.status) : '');

  return `
    <article class="card ${done ? 'done' : ''} ${g.status ? ('status-' + g.status) : ''}" data-appid="${g.appid}">
      <div class="cover">${cover}</div>
      <button class="editBtn" data-act="edit" title="Editar">✎</button>
      <div class="body">
        <div class="title">${escapeHtml(g.name || ('App ' + g.appid))}</div>

        <div class="meta">
          <div class="pill"><span class="k">Horas</span><b>${effectiveHours(g).toFixed(1)}</b></div>
          <div class="pill"><span class="k">Logros</span><b>${Number(g.achUnlocked)||0}</b> / ${Number(g.achTotal)||0}</div>
          <div class="pill"><span class="k">% Logros</span><b>${p.toFixed(0)}%</b></div>
          <div class="pill"><span class="k">Dificultad</span><b>${diff}</b></div>
          <div class="pill"><span class="k">Puntuación</span><b>${(g.rating!=null && g.rating!=='') ? g.rating : '—'}</b></div>
        </div>

        ${((g.genrePrimary || g.genreSecondary) || badgeText) ? `
          <div class="infoRow">
            ${(g.genrePrimary || g.genreSecondary) ? `<div class="muted">Géneros: ${escapeHtml([g.genrePrimary, g.genreSecondary].filter(Boolean).join(' · '))}</div>` : `<div></div>`}
            ${badgeText ? `<div class="badge">${escapeHtml(badgeText)}</div>` : ``}
          </div>
        ` : ''}

        ${g.notes ? `<div class="muted">${escapeHtml(g.notes)}</div>` : ''}
      </div>
    </article>
  `;
}

function render(){
  updateYearSelect();
  if (yearSelect) yearSelect.style.display = (filterMode === 'year') ? 'inline-block' : 'none';

  const list = applyQueryAndSort();
  renderStats(list);
  if (grid) grid.innerHTML = list.map(cardHTML).join('');
  applyI18n();
}

async function refreshLibrary(){
  const res = await window.api.listLibrary();
  library = res.games || [];
  lastSync = res.lastSync || 0;
  render();
}

async function openSettings(){
  const res = await window.api.getSettings();
  const s = res.settings || {};
  steamApiKey.value = s.steamApiKey || '';
  steamId.value = s.steamId || '';
  language.value = s.language || 'english';
  syncMinutes.value = String(s.syncMinutes ?? 5);
  applyI18n();

  // Theme (accent color)
  const current = (s.themeAccent || '#C832A0').toUpperCase();
  const isPreset = THEME_PRESETS.map(x=>x.toUpperCase()).includes(current);
  if (themeAccent){
    themeAccent.value = isPreset ? current : 'custom';
  }
  if (themeAccentCustom){
    themeAccentCustom.value = current;
    themeAccentCustom.style.display = (!isPreset && themeAccent && themeAccent.value==='custom') ? 'block' : 'none';
  }
  applyTheme(current);

  settingsModal.showModal();
}

safeOn($('settingsForm'), 'submit', async (e) => {
  e.preventDefault();
  await window.api.setSettings({
    steamApiKey: steamApiKey.value.trim(),
    steamId: steamId.value.trim(),
    language: language.value,
    syncMinutes: Number(syncMinutes.value) || 5,
    themeAccent: (themeAccent && themeAccent.value === 'custom')
      ? (themeAccentCustom?.value || '').trim() || '#C832A0'
      : (themeAccent?.value || '#C832A0')
  });
  applyTheme(((themeAccent && themeAccent.value === 'custom') ? (themeAccentCustom?.value || '').trim() : themeAccent?.value) || '#C832A0');
  settingsModal.close();
});

async function runManualSearch(){
  if (!manualAddResults) return;
  const termRaw = (manualAddTerm?.value || '').trim();
  manualAddResults.innerHTML = '';
  manualAddResults.style.gridTemplateColumns = '1fr';
  if (!termRaw) return;

  // If numeric => AppID direct
  if (/^\d+$/.test(termRaw)){
    const appid = Number(termRaw);
    const lang = getUILang();
    const t = (es, en) => (lang === 'english') ? en : es;
    manualAddResults.innerHTML = `<div class="muted">${t('AppID detectado:','AppID detected:')} <b>${appid}</b></div>
      <button class="btn primary" id="manualAddBtn" type="button">${t('Añadir AppID','Add AppID')}</button>`;
    const btn = $('manualAddBtn');
    safeOn(btn, 'click', async () => {
      await window.api.addSelected([appid]);
      await enrichAppid(appid);
      await refreshLibrary();
      steamModal.close();
    });
    return;
  }

  manualAddResults.innerHTML = `<div class="muted">Buscando en la tienda de Steam…</div>`;
  try{
    const url = `https://store.steampowered.com/api/storesearch/?term=${encodeURIComponent(termRaw)}&l=english&cc=US`;
    const res = await fetch(url);
    const j = await res.json();
    const items = (j?.items || []).slice(0, 8);
    if (!items.length){
      manualAddResults.innerHTML = `<div class="muted">No se encontraron resultados.</div>`;
      return;
    }
    manualAddResults.style.gridTemplateColumns = 'repeat(4, minmax(0, 1fr))';
    manualAddResults.innerHTML = items.map(it => {
      const cover = it.tiny_image || it.large_capsule_image || it.small_capsule_image || `https://cdn.cloudflare.steamstatic.com/steam/apps/${it.id}/header.jpg`;
      return `
        <div class="storeCard" data-manual-add="${it.id}" role="button" tabindex="0">
          <img class="storeCover" src="${cover}" alt="" loading="lazy" onerror="this.style.display='none'"/>
          <div class="storeName">${escapeHtml(it.name)}</div>
        </div>
      `;
    }).join('');

    Array.from(manualAddResults.querySelectorAll('[data-manual-add]')).forEach(card => {
      const act = async () => {
        const appid = Number(card.getAttribute('data-manual-add'));
        await window.api.addSelected([appid]);
        await enrichAppid(appid);
        await refreshLibrary();
        steamModal.close();
      };
      card.addEventListener('click', act);
      card.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') act(); });
    });
  }catch{
    manualAddResults.innerHTML = `<div class="muted">Error buscando en la tienda.</div>`;
  }
}

async function loadOwnedGames(){
  if (!steamList) return;
  steamList.innerHTML = `<div class="muted">Cargando desde Steam…</div>`;
  try{
    const res = await window.api.ownedGames();
    ownedCache = res.games || [];
    renderOwnedList();
  }catch{
    steamList.innerHTML = `<div class="muted">Error cargando lista. Revisa API key / SteamID / privacidad.</div>`;
  }
}

function updateSelectedCount(){
  const boxes = Array.from(steamList?.querySelectorAll('input[type="checkbox"][data-appid]') || []);
  const checked = boxes.filter(b=>b.checked).length;
  setSelectedCount(checked);
  if (selectAllOwned) {
    const allVisible = boxes.length>0 && checked === boxes.length;
    selectAllOwned.checked = allVisible;
    selectAllOwned.indeterminate = checked>0 && checked<boxes.length;
  }
}

function renderOwnedList(){
  const term = (steamSearch.value || '').toLowerCase().trim();
  const list = ownedCache.filter(g => !term || (g.name || '').toLowerCase().includes(term));
  list.sort((a,b)=> (a.name||'').localeCompare((b.name||''), 'es', { sensitivity:'base' }));

  steamList.innerHTML = list.map(g => {
    const cover = g.coverUrl || `https://cdn.cloudflare.steamstatic.com/steam/apps/${g.appid}/header.jpg`;
    return `
      <div class="ownedCard">
        <img src="${cover}" alt="" loading="lazy" onerror="this.style.display='none'"/>
        <div class="ownedMeta">
          <div class="ownedName">${escapeHtml(g.name || ('App ' + g.appid))}</div>
          <input type="checkbox" data-appid="${g.appid}" ${selectedToAdd.has(Number(g.appid)) ? 'checked' : ''}/>
        </div>
      </div>
    `;
  }).join('');

  Array.from(steamList.querySelectorAll('input[type="checkbox"][data-appid]')).forEach(b=>{
    b.addEventListener('change', ()=>{
      const id = Number(b.getAttribute('data-appid'));
      if (b.checked) selectedToAdd.add(id);
      else selectedToAdd.delete(id);
      updateSelectedCount();
    });
  });
  updateSelectedCount();
}


async function addChecked(){
  const appids = Array.from(selectedToAdd);
  if (!appids.length) return;
  await window.api.addSelected(appids);
  for (const id of appids.slice(0, 30)) { try{ await enrichAppid(id); }catch{} }
  selectedToAdd = new Set();
  await refreshLibrary();
  // Close the add-games modal after adding
  try{ steamModal && steamModal.close(); }catch{}
}

async function syncNow(){
  if (!syncBtn) return;
  syncBtn.textContent = (getUILang()==='english') ? 'Syncing…' : 'Sincronizando…';
  syncBtn.disabled = true;
  try{
    await window.api.syncNow();
    await refreshLibrary();
  }catch{}
  syncBtn.textContent = (getUILang()==='english') ? 'Sync now' : 'Sync ahora';
  syncBtn.disabled = false;
}

safeOn(grid, 'click', async (e) => {
  const btn = e.target.closest('button');
  const card = e.target.closest('.card');
  if (!card) return;

  // Only open editor via the pencil button
  if (!btn || btn.getAttribute('data-act') !== 'edit') return;

  const appid = Number(card.getAttribute('data-appid'));
  let g = library.find(x => Number(x.appid) === appid);
  if (!g) return;

  editAppid.value = String(appid);
  editStatus.value = g.status || '';
  editRating.value = (g.rating != null && g.rating !== '') ? String(g.rating) : '';
  editDifficulty.value = (g.difficulty != null && g.difficulty !== '') ? String(g.difficulty) : '';
  editGenrePrimary.value = g.genrePrimary || '';
  editGenreSecondary.value = g.genreSecondary || '';
  editNotes.value = g.notes || '';
  if (editManualHours) {
    const mh = g.manualHours;
    editManualHours.value = (mh != null && mh !== '' && Number.isFinite(Number(mh)) && Number(mh) > 0) ? String(mh) : '';
  }

  const titleEl = document.getElementById('editGameTitle');
  const subEl = document.getElementById('editGameSub');
  const coverEl = document.getElementById('editGameCover');

  const fallbackTitle = (g && g.name && String(g.name).trim()) ? g.name : '';
  if (editGameTitle) editGameTitle.textContent = (g.name && String(g.name).trim() && !/^App\s+\d+$/i.test(String(g.name))) ? g.name : 'Cargando…';
  
  if (editGameCover) {
    const src = (g.coverUrl && String(g.coverUrl).trim()) ? g.coverUrl : `https://cdn.cloudflare.steamstatic.com/steam/apps/${appid}/header.jpg`;
    editGameCover.src = src;
    
  }

  editModal.showModal();

  const needsEnrich = !g.name || String(g.name).trim().length === 0 || /^App\s+\d+$/i.test(String(g.name));
  if (needsEnrich) {
    const det = await enrichAppid(appid);
    if (det) {
      g = library.find(x => Number(x.appid) === appid) || g;
      if (editGameTitle && det.name) editGameTitle.textContent = det.name;
      if (editGameCover && det.coverUrl) editGameCover.src = det.coverUrl;
      if (!editGenrePrimary.value) editGenrePrimary.value = det.genrePrimary || '';
      if (!editGenreSecondary.value) editGenreSecondary.value = det.genreSecondary || '';
      if (editDescription && det.description != null) editDescription.textContent = det.description || '';
    }
  }
});



safeOn($('editForm'), 'submit', async (e) => {
  e.preventDefault();
  // Only save when the user explicitly clicks "Guardar"
  const submitter = e.submitter;
  if (!submitter || String(submitter.value || '') !== 'default') {
    editModal.close();
    return;
  }
  const appid = Number(editAppid.value);

  const d = Number((editDifficulty.value || '').trim());
  const r = Number((editRating.value || '').trim());

  await window.api.updateManual({
    appid,
    status: editStatus.value || '',
    rating: (Number.isFinite(r) && r >= 1 && r <= 100) ? Math.round(r) : null,
    difficulty: (Number.isFinite(d) && d >= 1 && d <= 10) ? Math.round(d) : null,
    genrePrimary: editGenrePrimary.value.trim(),
    genreSecondary: editGenreSecondary.value.trim(),
    genreLocked: true,
    // Entering 0 (or clearing) resets to automatic Steam hours
    manualHours: (() => {
      const raw = (editManualHours?.value ?? '').trim();
      if (!raw) return null;
      const n = Number(raw);
      if (!Number.isFinite(n) || n <= 0) return null;
      return n;
    })(),
    notes: editNotes.value.trim()
  });

  editModal.close();;
  await refreshLibrary();
});



function setFilter(mode){
  filterMode = mode;

  const btns = [
    ['all', fAll],
    ['in_progress', fInProgress],
    ['possible_100', fPossible],
    ['paused', fPaused],
    ['done', fDone],
    ['todo', fTodo],
    ['year', fYear],
  ];
  btns.forEach(([m, el]) => {
    if (!el) return;
    if (m === mode) el.classList.add('primary');
    else el.classList.remove('primary');
  });

  render();
  scrollToGamesTop();
}

safeOn(fAll, 'click', () => setFilter('all'));
safeOn(fInProgress, 'click', () => setFilter('in_progress'));
safeOn(fPossible, 'click', () => setFilter('possible_100'));
safeOn(fPaused, 'click', () => setFilter('paused'));
safeOn(fDone, 'click', () => setFilter('done'));
safeOn(fTodo, 'click', () => setFilter('todo'));
safeOn(fYear, 'click', () => setFilter('year'));
safeOn(yearSelect, 'change', () => { selectedYear = yearSelect.value; render(); });

safeOn(settingsBtn, 'click', openSettings);
safeOn(addFromSteamBtn, 'click', async () => { steamModal.showModal(); await loadOwnedGames(); });
safeOn(steamModal, 'close', resetAddGamesModal);
safeOn(reloadOwnedBtn, 'click', loadOwnedGames);
safeOn(steamSearch, 'input', renderOwnedList);
safeOn(manualAddSearch, 'click', runManualSearch);
safeOn(manualAddTerm, 'keydown', (e)=>{ if(e.key==='Enter'){ e.preventDefault(); runManualSearch(); } });
safeOn(addCheckedBtn, 'click', addChecked);
safeOn(syncBtn, 'click', syncNow);
safeOn(exportBtn, 'click', async () => { await window.api.exportBackup(); });
safeOn(importBtn, 'click', async () => { await window.api.importBackup(); await refreshLibrary(); });

safeOn(q, 'input', render);
safeOn(sort, 'change', render);

document.addEventListener('DOMContentLoaded', async () => {
  updateStickyOffset();
  setFilter('all');

  try{
    const res = await window.api.getSettings();
    const s = res.settings || {};
    if (typeof language !== 'undefined' && language) language.value = s.language || 'english';
    applyTheme((s.themeAccent || '#C832A0'));
  }catch(_){}

  await refreshLibrary();
  applyI18n();
});




safeOn(sort, 'change', () => { render(); });


themeAccent && themeAccent.addEventListener('change', ()=>{
  if (!themeAccentCustom) return;
  if (themeAccent.value==='custom'){
    themeAccentCustom.style.display='block';
    const v = (themeAccentCustom.value || '').trim();
    if (v) applyTheme(v);
  }else{
    themeAccentCustom.style.display='none';
    applyTheme(themeAccent.value);
  }
});

themeAccentCustom && themeAccentCustom.addEventListener('input', ()=>{
  if (themeAccent && themeAccent.value === 'custom'){
    const v = (themeAccentCustom.value || '').trim();
    if (v) applyTheme(v);
  }
});

safeOn(selectAllOwned, 'change', () => {
  const boxes = Array.from(steamList?.querySelectorAll('input[type="checkbox"][data-appid]') || []);
  boxes.forEach(b => {
    b.checked = !!selectAllOwned.checked;
    const id = Number(b.getAttribute('data-appid'));
    if (b.checked) selectedToAdd.add(id);
    else selectedToAdd.delete(id);
  });
  updateSelectedCount();
});


safeOn(filterBtn, 'click', () => { syncFilterUIFromState(); filterModal && filterModal.showModal(); });

safeOn(applyFiltersBtn, 'click', (e) => {
  e && e.preventDefault && e.preventDefault();
  readFiltersFromUI();
  filterModal && filterModal.close();
  render();
});
safeOn(clearFiltersBtn, 'click', (e) => {
  e && e.preventDefault && e.preventDefault();
  clearAllFilters();
  // Keep modal open so user sees it's cleared
  render();
});



safeOn(sortDirBtn, 'click', () => {
  if (!sort) return;
  const v = String(sort.value || '');
  const pairs = {
    'name-asc': 'name-desc', 'name-desc': 'name-asc',
    'hours-asc': 'hours-desc', 'hours-desc': 'hours-asc',
    'pct-asc': 'pct-desc', 'pct-desc': 'pct-asc',
        'rating-asc': 'rating-desc', 'rating-desc': 'rating-asc',
    'diff-asc': 'diff-desc', 'diff-desc': 'diff-asc'
  };
  sort.value = pairs[v] || v;
  render();
});


safeOn(deleteGameBtn, 'click', async (e) => {
  e && e.preventDefault && e.preventDefault();
  const appid = Number(editAppid.value);
  const g = library.find(x => Number(x.appid) === appid);
  await window.api.removeGame(appid);
  editModal.close();;
  await refreshLibrary();
});
