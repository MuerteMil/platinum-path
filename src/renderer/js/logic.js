// Pure library logic (filters, sorting, stats). No DOM access, so it can be tested in Node.
(function (root) {
  'use strict';

  function pct(u, t) {
    const total = Math.max(0, Number(t) || 0);
    const unlocked = Math.max(0, Number(u) || 0);
    if (total <= 0) return 0;
    return Math.max(0, Math.min(100, (unlocked / total) * 100));
  }

  function hasValue(v) { return v != null && String(v).trim() !== '' && Number.isFinite(Number(v)); }

  /** Manual hours (if > 0) win over Steam hours. */
  function effectiveHours(g) {
    const mh = g && g.manualHours;
    if (hasValue(mh) && Number(mh) > 0) return Number(mh);
    return Number(g && g.hours) || 0;
  }

  function isDone(g) {
    return (Number(g.achTotal) || 0) > 0 && (Number(g.achUnlocked) || 0) >= (Number(g.achTotal) || 0);
  }

  function remaining(g) { return Math.max(0, (Number(g.achTotal) || 0) - (Number(g.achUnlocked) || 0)); }

  /** Close to 100%: ≥ 80 % or ≤ 3 achievements left (and already started). */
  function isAlmost(g) {
    if (isDone(g) || !(Number(g.achTotal) > 0) || !(Number(g.achUnlocked) > 0)) return false;
    return pct(g.achUnlocked, g.achTotal) >= 80 || remaining(g) <= 3;
  }

  /** Manual difficulty wins; otherwise the estimate from achievement rarity. */
  function effectiveDifficulty(g) {
    if (hasValue(g && g.difficulty)) return { value: Number(g.difficulty), estimated: false };
    if (hasValue(g && g.estDifficulty)) return { value: Number(g.estDifficulty), estimated: true };
    return { value: null, estimated: false };
  }

  /** Hours to 100%: manual value wins, then HowLongToBeat. */
  function hltbHours(g) {
    if (hasValue(g && g.hltbManual) && Number(g.hltbManual) > 0) return Number(g.hltbManual);
    const h = g && g.hltb && g.hltb.comp100;
    return Number(h) > 0 ? Number(h) : null;
  }
  function hltbLeft(g) {
    const h = hltbHours(g);
    if (h == null || isDone(g)) return null;
    return Math.max(0, Math.round((h - effectiveHours(g)) * 10) / 10);
  }
  function collectionsOf(g) { return Array.isArray(g && g.collections) ? g.collections : []; }
  function allCollections(list) {
    const set = new Set();
    for (const g of list) for (const c of collectionsOf(g)) set.add(c);
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'es', { sensitivity: 'base' }));
  }

  function completedYear(g) {
    const sec = Number(g.completedAtSec) || 0;
    return sec ? new Date(sec * 1000).getFullYear() : null;
  }

  function diffBucket(d) {
    if (!hasValue(d)) return null;
    const n = Number(d);
    if (n <= 3) return '1-3';
    if (n <= 6) return '4-6';
    if (n <= 8) return '7-8';
    return '9-10';
  }

  function progBucket(p) {
    const n = Number(p);
    if (!Number.isFinite(n)) return null;
    if (n >= 100) return '100';
    if (n >= 75) return '75-99';
    if (n >= 50) return '50-75';
    if (n >= 25) return '25-50';
    return '0-25';
  }

  function gameGenres(g) {
    const out = [];
    for (const s of [g && g.genrePrimary, g && g.genreSecondary]) {
      if (!s) continue;
      String(s).split(/[•·,/|]/g).map(x => x.trim()).filter(Boolean).forEach(t => out.push(t));
    }
    return Array.from(new Set(out));
  }

  function allGenres(list) {
    const set = new Set();
    for (const g of list) for (const t of gameGenres(g)) set.add(t);
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'es', { sensitivity: 'base' }));
  }

  function emptyFilters() {
    return {
      minRating: null, maxRating: null, onlyRated: false, onlyNotes: false,
      diffRanges: [], minHours: null, maxHours: null, progRanges: [], genre: null,
      hideNoAch: false, collection: null
    };
  }

  function activeFilterCount(f) {
    if (!f) return 0;
    let n = 0;
    if (f.minRating != null || f.maxRating != null) n++;
    if (f.onlyRated) n++;
    if (f.onlyNotes) n++;
    if (f.diffRanges && f.diffRanges.length) n++;
    if (f.minHours != null || f.maxHours != null) n++;
    if (f.progRanges && f.progRanges.length) n++;
    if (f.genre) n++;
    if (f.hideNoAch) n++;
    if (f.collection) n++;
    return n;
  }

  function matchesMode(g, mode, year) {
    switch (mode) {
      case 'all': return true;
      case 'done': return isDone(g);
      case 'todo': return !isDone(g);
      case 'almost': return isAlmost(g);
      case 'year': { const y = completedYear(g); return isDone(g) && y != null && String(y) === String(year); }
      default: return (g.status || '') === mode; // in_progress | possible_100 | paused
    }
  }

  /**
   * @param {object[]} library
   * @param {{term?:string, mode?:string, year?:any, filters?:object, sort?:string}} q
   */
  function query(library, q) {
    const term = String(q.term || '').trim().toLowerCase();
    const f = q.filters || emptyFilters();
    let list = library.filter(g => {
      if (term && !String(g.name || '').toLowerCase().includes(term)) return false;
      if (!matchesMode(g, q.mode || 'all', q.year)) return false;
      if (f.onlyNotes && !String(g.notes || '').trim()) return false;
      if (f.onlyRated && !hasValue(g.rating)) return false;
      if (f.minRating != null && !(hasValue(g.rating) && Number(g.rating) >= f.minRating)) return false;
      if (f.maxRating != null && !(hasValue(g.rating) && Number(g.rating) <= f.maxRating)) return false;
      const h = effectiveHours(g);
      if (f.minHours != null && h < f.minHours) return false;
      if (f.maxHours != null && h > f.maxHours) return false;
      if (f.diffRanges && f.diffRanges.length) {
        const b = diffBucket(effectiveDifficulty(g).value);
        if (!b || !f.diffRanges.includes(b)) return false;
      }
      if (f.progRanges && f.progRanges.length) {
        if (!(Number(g.achTotal) > 0)) return false;
        if (!f.progRanges.includes(progBucket(pct(g.achUnlocked, g.achTotal)))) return false;
      }
      if (f.genre && !gameGenres(g).includes(f.genre)) return false;
      if (f.hideNoAch && !(Number(g.achTotal) > 0)) return false;
      if (f.collection && !collectionsOf(g).includes(f.collection)) return false;
      if (q.collection && !collectionsOf(g).includes(q.collection)) return false;
      return true;
    });

    const [key, dir] = String(q.sort || 'name-asc').split('-');
    const mul = dir === 'desc' ? -1 : 1;
    const byName = (a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'es', { sensitivity: 'base' });
    // Games without the sorted value always go last (instead of disappearing).
    const val = {
      hours: g => { const h = effectiveHours(g); return h > 0 ? h : null; },
      pct: g => (Number(g.achTotal) > 0 ? pct(g.achUnlocked, g.achTotal) : null),
      rating: g => (hasValue(g.rating) ? Number(g.rating) : null),
      diff: g => effectiveDifficulty(g).value,
      remaining: g => (Number(g.achTotal) > 0 && !isDone(g) ? remaining(g) : null),
      played: g => (Number(g.lastPlayedSec) > 0 ? Number(g.lastPlayedSec) : null),
      added: g => (Number(g.createdAt) > 0 ? Number(g.createdAt) : null),
      priority: g => (hasValue(g.priority) ? Number(g.priority) : null),
      hltb: g => hltbHours(g)
    }[key];

    list.sort((a, b) => {
      if (!val) return byName(a, b) * mul;
      const va = val(a), vb = val(b);
      if (va == null && vb == null) return byName(a, b);
      if (va == null) return 1;
      if (vb == null) return -1;
      return (va - vb) * mul || byName(a, b);
    });
    return list;
  }

  function summary(list) {
    const count = list.length;
    const hours = list.reduce((a, g) => a + effectiveHours(g), 0);
    const totalAch = list.reduce((a, g) => a + (Number(g.achTotal) || 0), 0);
    const unlockedAch = list.reduce((a, g) => a + Math.min(Number(g.achUnlocked) || 0, Number(g.achTotal) || 0), 0);
    const p = totalAch > 0 ? (unlockedAch / totalAch) * 100 : 0;
    const completed = list.filter(isDone).length;
    return { count, hours, totalAch, unlockedAch, p, completed };
  }

  function completedInYear(library, year) {
    return library.filter(g => isDone(g) && completedYear(g) === year).length;
  }

  // ---------- statistics ----------
  function dayKey(d) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  /**
   * @param {{t:number,pct:number|null,name:string,game:string,appid:number}[]} unlocks
   * @param {object[]} library
   * @param {Date} now
   */
  function buildStats(unlocks, library, now) {
    now = now || new Date();
    // Monthly unlocks, last 12 months (oldest first)
    const months = [];
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      months.push({ key: `${d.getFullYear()}-${d.getMonth()}`, year: d.getFullYear(), month: d.getMonth(), count: 0 });
    }
    const monthIndex = new Map(months.map((m, i) => [m.key, i]));
    const perDay = new Map();
    for (const u of unlocks) {
      const d = new Date(u.t * 1000);
      const mi = monthIndex.get(`${d.getFullYear()}-${d.getMonth()}`);
      if (mi != null) months[mi].count++;
      const k = dayKey(d);
      perDay.set(k, (perDay.get(k) || 0) + 1);
    }

    // Heatmap: 53 weeks ending today, weeks start on Monday
    const end = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const start = new Date(end);
    start.setDate(start.getDate() - 52 * 7 - ((end.getDay() + 6) % 7));
    const days = [];
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const k = dayKey(d);
      days.push({ key: k, count: perDay.get(k) || 0, weekday: (d.getDay() + 6) % 7 });
    }

    // Streaks (consecutive days with at least one unlock)
    const sortedDays = Array.from(perDay.keys()).sort();
    let longest = 0, run = 0, prev = null;
    for (const k of sortedDays) {
      const d = new Date(k + 'T00:00:00');
      if (prev && (d - prev) / 86400000 === 1) run++; else run = 1;
      longest = Math.max(longest, run);
      prev = d;
    }
    let current = 0;
    const cursor = new Date(end);
    if (!perDay.has(dayKey(cursor))) cursor.setDate(cursor.getDate() - 1); // today may still be empty
    while (perDay.has(dayKey(cursor))) { current++; cursor.setDate(cursor.getDate() - 1); }

    // Completions per year
    const perYear = {};
    for (const g of library) {
      if (!isDone(g)) continue;
      const y = completedYear(g);
      if (y) perYear[y] = (perYear[y] || 0) + 1;
    }
    const years = Object.keys(perYear).map(Number).sort((a, b) => a - b).map(y => ({ year: y, count: perYear[y] }));

    // 100% games per month, last 12 months (which games, not just how many)
    const monthsDone = months.map(m => ({ year: m.year, month: m.month, key: m.key, games: [] }));
    const doneIndex = new Map(monthsDone.map((m, i) => [m.key, i]));
    for (const g of library) {
      if (!isDone(g) || !Number(g.completedAtSec)) continue;
      const d = new Date(Number(g.completedAtSec) * 1000);
      const i = doneIndex.get(`${d.getFullYear()}-${d.getMonth()}`);
      if (i != null) monthsDone[i].games.push({ appid: g.appid, name: g.name || `App ${g.appid}`, completedAtSec: Number(g.completedAtSec), coverUrl: g.coverUrl || '' });
    }
    for (const m of monthsDone) m.games.sort((a, b) => b.completedAtSec - a.completedAtSec);

    // Rarest achievements: only the rarest one of each game
    const bestPerGame = new Map();
    for (const u of unlocks) {
      if (u.pct == null) continue;
      const cur = bestPerGame.get(u.appid);
      if (!cur || u.pct < cur.pct) bestPerGame.set(u.appid, u);
    }
    const rarest = Array.from(bestPerGame.values()).sort((a, b) => a.pct - b.pct).slice(0, 8);
    const thisYear = unlocks.filter(u => new Date(u.t * 1000).getFullYear() === now.getFullYear()).length;

    return { months, monthsDone, days, maxDay: Math.max(0, ...days.map(d => d.count)), streak: { current, longest }, years, rarest, total: unlocks.length, thisYear };
  }

  // ---------- recap (month / year summary) ----------
  /** Periods that have something to show, newest first. */
  function recapPeriods(unlocks, library) {
    const months = new Map();
    const add = (sec) => {
      if (!sec) return;
      const d = new Date(sec * 1000);
      months.set(`${d.getFullYear()}-${d.getMonth()}`, { year: d.getFullYear(), month: d.getMonth() });
    };
    for (const u of unlocks) add(u.t);
    for (const g of library) if (isDone(g)) add(Number(g.completedAtSec) || 0);
    const list = Array.from(months.values()).sort((a, b) => (b.year - a.year) || (b.month - a.month));
    const years = Array.from(new Set(list.map(m => m.year))).sort((a, b) => b - a);
    return { months: list, years };
  }

  /**
   * Summary of a month (month 0–11) or a whole year (month null).
   * @param {{t:number,pct:number|null,name:string,game:string,appid:number,icon?:string}[]} unlocks
   */
  function buildRecap(unlocks, library, { year, month = null }) {
    const isYear = month == null;
    const start = isYear ? new Date(year, 0, 1) : new Date(year, month, 1);
    const end = isYear ? new Date(year + 1, 0, 1) : new Date(year, month + 1, 1);
    const prevStart = isYear ? new Date(year - 1, 0, 1) : new Date(year, month - 1, 1);
    const s0 = start.getTime() / 1000, s1 = end.getTime() / 1000, sp = prevStart.getTime() / 1000;
    const inRange = unlocks.filter(u => u.t >= s0 && u.t < s1);
    const prevTotal = unlocks.filter(u => u.t >= sp && u.t < s0).length;
    const byId = new Map(library.map(g => [Number(g.appid), g]));

    // Units for the chart: days of the month, or months of the year.
    const units = isYear ? 12 : new Date(year, month + 1, 0).getDate();
    const perUnit = new Array(units).fill(0);
    const perDay = new Map();
    const perGame = new Map();
    for (const u of inRange) {
      const d = new Date(u.t * 1000);
      perUnit[isYear ? d.getMonth() : d.getDate() - 1]++;
      const k = dayKey(d);
      perDay.set(k, (perDay.get(k) || 0) + 1);
      perGame.set(Number(u.appid), (perGame.get(Number(u.appid)) || 0) + 1);
    }

    let bestDay = null;
    for (const [key, count] of perDay) if (!bestDay || count > bestDay.count) bestDay = { key, count };

    let streak = 0, run = 0, prev = null;
    for (const k of Array.from(perDay.keys()).sort()) {
      const d = new Date(k + 'T00:00:00');
      run = prev && Math.round((d - prev) / 86400000) === 1 ? run + 1 : 1;
      streak = Math.max(streak, run);
      prev = d;
    }

    const completed = library
      .filter(g => isDone(g) && Number(g.completedAtSec) >= s0 && Number(g.completedAtSec) < s1)
      .map(g => ({ appid: Number(g.appid), name: g.name || `App ${g.appid}`, coverUrl: g.coverUrl || '', completedAtSec: Number(g.completedAtSec) }))
      .sort((a, b) => a.completedAtSec - b.completedAtSec);

    const rarestPerGame = new Map();
    for (const u of inRange) {
      if (u.pct == null) continue;
      const cur = rarestPerGame.get(u.appid);
      if (!cur || u.pct < cur.pct) rarestPerGame.set(u.appid, u);
    }
    const rarest = Array.from(rarestPerGame.values()).sort((a, b) => a.pct - b.pct).slice(0, 3)
      .map(u => ({ appid: Number(u.appid), name: u.name, game: u.game, pct: u.pct, icon: u.icon || '' }));

    const topGames = Array.from(perGame.entries()).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([appid, count]) => {
      const g = byId.get(appid) || {};
      const u = inRange.find(x => Number(x.appid) === appid) || {};
      const total = Number(g.achTotal) || 0;
      return { appid, name: g.name || u.game || `App ${appid}`, coverUrl: g.coverUrl || '', count, pct: total ? pct(g.achUnlocked, total) : null };
    });

    let bestMonth = null;
    if (isYear) perUnit.forEach((count, m) => { if (count && (!bestMonth || count > bestMonth.count)) bestMonth = { month: m, count }; });

    return {
      year, month, isYear,
      total: inRange.length, prevTotal,
      games: perGame.size, activeDays: perDay.size, streak, bestDay, bestMonth,
      completed, rarest, topGames, perUnit
    };
  }

  const api = {
    pct, hasValue, effectiveHours, hltbHours, hltbLeft, collectionsOf, allCollections, isDone, isAlmost, remaining, effectiveDifficulty, completedYear,
    diffBucket, progBucket, gameGenres, allGenres, emptyFilters, activeFilterCount, query, summary,
    completedInYear, buildStats, dayKey, recapPeriods, buildRecap
  };
  root.PP = root.PP || {};
  root.PP.logic = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
