'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const ach = require('../src/main/achLogic');
const L = require('../src/renderer/js/logic');

test('estimateDifficulty uses the rarest achievement', () => {
  assert.strictEqual(ach.estimateDifficulty([]), null);
  assert.strictEqual(ach.estimateDifficulty([80, 60]), 1);
  assert.strictEqual(ach.estimateDifficulty([80, 5]), 6);
  assert.strictEqual(ach.estimateDifficulty([80, 0.1]), 10);
});

test('mergeAchievements keeps user notes, detects unlocks and removed achievements', () => {
  const prev = {
    A: { achievementApiName: 'A', unlocked: false, userNote: 'go left', missable: true, displayName: 'A' },
    OLD: { achievementApiName: 'OLD', unlocked: true, displayName: 'Old' }
  };
  const schema = [{ apiName: 'A', displayName: 'Alpha' }, { apiName: 'B', displayName: 'Beta' }];
  const player = [{ apiname: 'A', achieved: 1, unlocktime: 1700000000 }, { apiname: 'B', achieved: 0, unlocktime: 0 }];
  const { list, changes } = ach.mergeAchievements({ appid: 10, prevList: prev, schema, player, globalPct: { A: 50, B: 2 }, nowIso: 'x', firstSync: false });
  assert.strictEqual(list.A.userNote, 'go left');
  assert.strictEqual(list.A.missable, true);
  assert.strictEqual(list.A.unlocked, true);
  assert.strictEqual(list.A.displayName, 'Alpha');
  assert.strictEqual(list.OLD.preservedLocalOnly, true);
  const types = changes.map(c => `${c.changeType}:${c.achievementApiName}`).sort();
  assert.deepStrictEqual(types, ['added:B', 'removed:OLD', 'unlocked:A']);
  const s = ach.summarize(list);
  assert.strictEqual(s.achTotal, 2);
  assert.strictEqual(s.achUnlocked, 1);
  assert.strictEqual(s.estDifficulty, 7);
});

test('first sync does not flood the history', () => {
  const { changes } = ach.mergeAchievements({ appid: 1, prevList: {}, schema: [{ apiName: 'A' }], player: [{ apiname: 'A', achieved: 1, unlocktime: 5 }], nowIso: 'x', firstSync: true });
  assert.strictEqual(changes.length, 0);
});

test('completionUpdate detects new achievements after a 100%', () => {
  const prev = { achTotal: 10, achUnlocked: 10, completedAtSec: 100 };
  const out = ach.completionUpdate(prev, { achTotal: 12, achUnlocked: 10, lastUnlockTimeSec: 100 }, 5000);
  assert.deepStrictEqual(out.newAchAlert, { at: 5000, added: 2 });
  const done = ach.completionUpdate({ achTotal: 12, achUnlocked: 11, newAchAlert: { added: 2 } }, { achTotal: 12, achUnlocked: 12, lastUnlockTimeSec: 200 }, 6000);
  assert.strictEqual(done.newAchAlert, null);
  assert.strictEqual(done.completedAtSec, 200);
  assert.strictEqual(done.justCompleted, true);
});

const lib = [
  { appid: 1, name: 'Celeste', achTotal: 32, achUnlocked: 32, hours: 40, completedAtSec: 1700000000, rating: 95 },
  { appid: 2, name: 'Hades', achTotal: 49, achUnlocked: 45, hours: 80, status: 'in_progress', estDifficulty: 6 },
  { appid: 3, name: 'Portal', achTotal: 0, achUnlocked: 0, hours: 0, notes: 'no achievements' },
  { appid: 4, name: 'Hollow Knight', achTotal: 63, achUnlocked: 10, hours: 20, difficulty: 9, priority: 1 }
];

test('query filters by mode, almost, difficulty and keeps games without values last', () => {
  assert.deepStrictEqual(L.query(lib, { mode: 'done' }).map(g => g.appid), [1]);
  assert.deepStrictEqual(L.query(lib, { mode: 'almost' }).map(g => g.appid), [2]);
  assert.deepStrictEqual(L.query(lib, { mode: 'in_progress' }).map(g => g.appid), [2]);
  assert.deepStrictEqual(L.query(lib, { filters: { ...L.emptyFilters(), diffRanges: ['9-10'] } }).map(g => g.appid), [4]);
  assert.deepStrictEqual(L.query(lib, { filters: { ...L.emptyFilters(), diffRanges: ['4-6'] } }).map(g => g.appid), [2]);
  assert.deepStrictEqual(L.query(lib, { sort: 'hours-desc' }).map(g => g.appid), [2, 1, 4, 3]);
  assert.deepStrictEqual(L.query(lib, { sort: 'hours-asc' }).map(g => g.appid), [4, 1, 2, 3]);
  assert.deepStrictEqual(L.query(lib, { sort: 'priority-asc' }).map(g => g.appid)[0], 4);
  assert.deepStrictEqual(L.query(lib, { sort: 'remaining-asc' }).map(g => g.appid).slice(0, 2), [2, 4]);
  assert.deepStrictEqual(L.query(lib, { term: 'hol' }).map(g => g.appid), [4]);
});

test('buildStats counts months, streaks and completions', () => {
  const now = new Date(2026, 9, 6, 12);
  const day = (d) => Math.floor(new Date(2026, 9, d, 10).getTime() / 1000);
  const unlocks = [{ t: day(4), pct: 3 }, { t: day(5), pct: 50 }, { t: day(6), pct: 20 }, { t: day(1), pct: 1 }];
  const s = L.buildStats(unlocks, lib, now);
  assert.strictEqual(s.months[11].count, 4);
  assert.strictEqual(s.streak.current, 3);
  assert.strictEqual(s.streak.longest, 3);
  assert.strictEqual(s.rarest[0].pct, 1);
  // one achievement per game in "rarest"
  const r2 = L.buildStats([{ appid: 1, t: day(4), pct: 1 }, { appid: 1, t: day(5), pct: 2 }, { appid: 2, t: day(5), pct: 3 }], lib, now).rarest;
  assert.deepStrictEqual(r2.map(r => r.pct), [1, 3]);
  // 100% per month lists the games
  const lib2 = [{ appid: 9, name: 'X', achTotal: 1, achUnlocked: 1, completedAtSec: day(3) }, { appid: 8, name: 'Old', achTotal: 1, achUnlocked: 1, completedAtSec: 1000 }];
  const md = L.buildStats([], lib2, now).monthsDone;
  assert.strictEqual(md[11].games[0].name, 'X');
  assert.strictEqual(md.reduce((a, m) => a + m.games.length, 0), 1);
  assert.strictEqual(s.days[s.days.length - 1].count, 1);
  assert.deepStrictEqual(s.years, [{ year: 2023, count: 1 }]);
});

test('data layer migrates a 1.2 library.json without losing anything', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pp-'));
  const old = {
    settings: { steamApiKey: 'ABC', steamId: '76561198000000000', language: 'spanish', syncMinutes: 1, themeAccent: '#3B82F6' },
    selectedAppIds: [10, 20],
    games: { 10: { appid: 10, name: 'G10', notes: 'my note', manualHours: 5, genreLocked: true, genrePrimary: 'RPG' } },
    achievements: { 10: { A: { achievementApiName: 'A', unlocked: true, unlockTimeSec: 5 } } },
    achievementChanges: [],
    lastSync: 123
  };
  fs.writeFileSync(path.join(dir, 'library.json'), JSON.stringify(old));
  delete require.cache[require.resolve('../src/main/data')];
  const data = require('../src/main/data');
  data.init({ userData: dir, safeStorage: null });
  assert.strictEqual(data.getGame(10).notes, 'my note');
  assert.ok(data.getGame(20)); // selected id without game object gets a stub
  assert.strictEqual(data.getApiKey(), 'ABC');
  assert.strictEqual(data.getSettings().syncMinutes, 30);
  assert.strictEqual(data.getAchGame(10).list.A.unlocked, true);
  data.flushAll();
  const saved = JSON.parse(fs.readFileSync(path.join(dir, 'library.json'), 'utf-8'));
  assert.strictEqual(saved.achievements, undefined);
  assert.strictEqual(saved.schemaVersion, 3);
  assert.ok(fs.readdirSync(dir).some(f => f.startsWith('library.backup-v2')));

  // Re-adding never overwrites
  assert.strictEqual(data.createGame(10, { name: 'X', notes: '' }), false);
  assert.strictEqual(data.getGame(10).notes, 'my note');

  // UI updates are validated
  data.updateGameFromUI(10, { rating: '150', difficulty: '7', manualHours: '0', status: 'hack', achTotal: 999 });
  const g = data.getGame(10);
  assert.strictEqual(g.rating, null);
  assert.strictEqual(g.difficulty, 7);
  assert.strictEqual(g.manualHours, null);
  assert.strictEqual(g.status, '');
  assert.notStrictEqual(g.achTotal, 999);

  // Export excludes the key; import restores games
  const payload = JSON.parse(JSON.stringify(data.exportPayload()));
  assert.strictEqual(JSON.stringify(payload).includes('ABC'), false);
  data.removeGame(10);
  assert.strictEqual(data.getGame(10), null);
  assert.strictEqual(data.getAchGame(10).list.A, undefined);
  const parsed = data.parseBackup(JSON.parse(JSON.stringify(payload)));
  assert.ok(parsed.ok);
  parsed.apply();
  assert.strictEqual(data.getGame(10).notes, 'my note');
  assert.strictEqual(data.getApiKey(), 'ABC');
  assert.strictEqual(data.getAchGame(10).list.A.unlocked, true);

  // Old v2 export format is accepted
  const v2 = data.parseBackup({ version: 2, data: old, achievements: old.achievements });
  assert.ok(v2.ok);
  assert.strictEqual(v2.summary.games, 1);
  assert.strictEqual(data.parseBackup({ foo: 1 }).ok, false);
});

test('HowLongToBeat matching prefers the Steam AppID, then the closest name', () => {
  const hltb = require('../src/main/hltb');
  assert.ok(hltb._similarity('Hollow Knight', 'Hollow Knight') === 1);
  assert.ok(hltb._similarity('Celeste™', 'Celeste') === 1);
  const res = [{ game_name: 'Hades II', profile_steam: 0 }, { game_name: 'Hades', profile_steam: 1145360 }];
  assert.strictEqual(hltb._pickBest(res, 'Hades', 1145360).game_name, 'Hades');
  assert.strictEqual(hltb._pickBest([{ game_name: 'Totally different' }], 'Hades', 1), null);
});

test('generic Steam header URLs are detected so they can be replaced', () => {
  const steam = require('../src/main/steam');
  assert.ok(steam.isGenericHeader('', 10));
  assert.ok(steam.isGenericHeader('https://cdn.cloudflare.steamstatic.com/steam/apps/10/header.jpg', 10));
  assert.ok(!steam.isGenericHeader('https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/10/0123456789abcdef0123456789abcdef/header.jpg?t=1', 10));
});

test('collections, achievement tags and ignored games are stored and validated', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pp-'));
  delete require.cache[require.resolve('../src/main/data')];
  const data = require('../src/main/data');
  data.init({ userData: dir, safeStorage: null });
  data.createGame(5, { name: 'G' });
  data.updateGameFromUI(5, { collections: ['Steam Deck', ' Steam Deck ', '', 'Co-op'], hltbManual: '40.25' });
  assert.deepStrictEqual(data.getGame(5).collections, ['Steam Deck', 'Co-op']);
  assert.strictEqual(data.getGame(5).hltbManual, 40.3);
  data.setAchGame(5, { meta: { schemaAt: 1 }, list: { A: { achievementApiName: 'A' } } });
  data.updateAchievementUserData(5, 'A', { tags: ['online', 'missable', 'hack'] });
  assert.deepStrictEqual(data.getAchGame(5).list.A.tags, ['online', 'missable']);
  assert.strictEqual(data.getAchGame(5).list.A.missable, true);
  data.setIgnored(99, true);
  assert.deepStrictEqual(data.getIgnored(), [99]);
  data.setIgnored(99, false);
  assert.deepStrictEqual(data.getIgnored(), []);
  const L2 = require('../src/renderer/js/logic');
  assert.strictEqual(L2.hltbHours({ hltbManual: 40, hltb: { comp100: 80 } }), 40);
  assert.strictEqual(L2.hltbLeft({ hltb: { comp100: 80 }, hours: 30, achTotal: 10, achUnlocked: 3 }), 50);
  assert.deepStrictEqual(L2.query([{ appid: 1, name: 'a', collections: ['X'] }, { appid: 2, name: 'b' }], { collection: 'X' }).map(g => g.appid), [1]);
});

test('a single isolated rare achievement lowers the estimate one step', () => {
  // 0.1% alone, next one at 6%: 9 instead of 10
  assert.strictEqual(ach.estimateDifficulty([0.1, 6, 10, 20, 40]), 9);
  // two hard ones close together: no discount
  assert.strictEqual(ach.estimateDifficulty([0.2, 0.5, 10, 20, 40]), 10);
  // small games keep the plain rarest value
  assert.strictEqual(ach.estimateDifficulty([0.1, 6, 10]), 10);
  // easy games are never touched
  assert.strictEqual(ach.estimateDifficulty([10, 60, 70, 80, 90]), 5);
});

test('recap summarises a month and a year', () => {
  const at = (y, m, d) => Math.floor(new Date(y, m, d, 12).getTime() / 1000);
  const lib3 = [
    { appid: 1, name: 'A', achTotal: 2, achUnlocked: 2, completedAtSec: at(2026, 9, 5) },
    { appid: 2, name: 'B', achTotal: 10, achUnlocked: 4 }
  ];
  const unlocks = [
    { appid: 1, t: at(2026, 9, 4), pct: 30, name: 'a1', game: 'A' },
    { appid: 1, t: at(2026, 9, 5), pct: 2, name: 'a2', game: 'A' },
    { appid: 2, t: at(2026, 9, 5), pct: 50, name: 'b1', game: 'B' },
    { appid: 2, t: at(2026, 9, 9), pct: 1, name: 'b2', game: 'B' },
    { appid: 2, t: at(2026, 8, 20), pct: 40, name: 'b0', game: 'B' }
  ];
  const r = L.buildRecap(unlocks, lib3, { year: 2026, month: 9 });
  assert.strictEqual(r.total, 4);
  assert.strictEqual(r.prevTotal, 1);
  assert.strictEqual(r.games, 2);
  assert.strictEqual(r.activeDays, 3);
  assert.strictEqual(r.streak, 2);
  assert.deepStrictEqual(r.bestDay, { key: '2026-10-05', count: 2 });
  assert.strictEqual(r.perUnit.length, 31);
  assert.strictEqual(r.perUnit[4], 2);
  assert.deepStrictEqual(r.completed.map(g => g.appid), [1]);
  assert.deepStrictEqual(r.rarest.map(a => a.name), ['b2', 'a2']);
  assert.strictEqual(r.topGames[0].count, 2);
  const y = L.buildRecap(unlocks, lib3, { year: 2026, month: null });
  assert.strictEqual(y.total, 5);
  assert.strictEqual(y.perUnit.length, 12);
  assert.deepStrictEqual(y.bestMonth, { month: 9, count: 4 });
  const periods = L.recapPeriods(unlocks, lib3);
  assert.deepStrictEqual(periods.years, [2026]);
  assert.deepStrictEqual(periods.months.map(m => m.month), [9, 8]);
});

test('a game refresh runs once at a time and notifies new achievements and 100%', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pp-'));
  delete require.cache[require.resolve('../src/main/data')];
  delete require.cache[require.resolve('../src/main/sync')];
  const data = require('../src/main/data');
  const steam = require('../src/main/steam');
  const sync = require('../src/main/sync');
  data.init({ userData: dir, safeStorage: null });
  data.setApiKey('0123456789ABCDEF0123456789ABCDEF');
  data.setSettings({ steamId: '76561198000000000' });
  data.createGame(7, { name: 'Seven', achTotal: 2, achUnlocked: 0 });
  data.setAchGame(7, { meta: { schemaAt: Date.now(), pctAt: Date.now(), lang: 'english' }, list: {
    A: { achievementApiName: 'A', displayName: 'A', unlocked: false },
    B: { achievementApiName: 'B', displayName: 'B', unlocked: false }
  } });
  const orig = { ...steam };
  let calls = 0;
  let achieved = { A: 1, B: 0 };
  steam.getPlayerAchievements = async () => { calls++; await new Promise(r => setTimeout(r, 30)); return { noStats: false, list: Object.entries(achieved).map(([k, v]) => ({ apiname: k, achieved: v, unlocktime: v ? 1700000000 : 0 })) }; };
  steam.getSchema = async () => [{ apiName: 'A', displayName: 'A' }, { apiName: 'B', displayName: 'B' }];
  steam.getGlobalPercentages = async () => null;
  steam.downloadFile = async () => false;
  const notes = [];
  sync.configure({ emitter: () => {}, notifier: (n) => notes.push(n) });
  try {
    const [r1, r2] = await Promise.all([sync.syncGame(7), sync.syncGame(7)]);
    assert.strictEqual(calls, 1);          // second call reused the first
    assert.strictEqual(r1, r2);
    assert.strictEqual(data.getChanges(7).filter(c => c.changeType === 'unlocked').length, 1);
    assert.deepStrictEqual(notes.map(n => n.kind), ['unlocked']);
    achieved = { A: 1, B: 1 };
    const r3 = await sync.syncGame(7);
    assert.strictEqual(r3.completed, true);
    assert.deepStrictEqual(notes.map(n => n.kind), ['unlocked', 'completed']);
    // quiet refresh (no notification) when asked
    achieved = { A: 1, B: 1 };
    await sync.syncGame(7, { notify: false });
    assert.strictEqual(notes.length, 2);
  } finally {
    Object.assign(steam, orig);
  }
});

test('achievement icons use Steam\'s current image host, with fallbacks', () => {
  const steam = require('../src/main/steam');
  const old = 'https://steamcdn-a.akamaihd.net/steamcommunity/public/images/apps/3812600/f1104a071ccbfd8ef6717b26462c53515ab7270e.jpg';
  assert.strictEqual(steam.normalizeIconUrl(old), 'https://shared.fastly.steamstatic.com/community_assets/images/apps/3812600/f1104a071ccbfd8ef6717b26462c53515ab7270e.jpg');
  // no gray icon: Steam returns the folder only
  assert.strictEqual(steam.normalizeIconUrl('https://steamcdn-a.akamaihd.net/steamcommunity/public/images/apps/367520/'), '');
  assert.strictEqual(steam.normalizeIconUrl(''), '');
  const c = steam.iconCandidates(old);
  assert.strictEqual(c[0], steam.normalizeIconUrl(old));
  assert.ok(c.includes(old));
  assert.strictEqual(c.length, 4);
  assert.deepStrictEqual(steam.iconCandidates('https://steamcdn-a.akamaihd.net/steamcommunity/public/images/apps/367520/'), []);
  assert.strictEqual(steam.normalizeIconUrl(steam.normalizeIconUrl(old)), steam.normalizeIconUrl(old));
});
