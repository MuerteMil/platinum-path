'use strict';
// Drives the real UI against the simulated Steam API and saves screenshots.
const fs = require('fs');
const path = require('path');

const OUT = process.env.PP_SHOTS || '/tmp/pp-shots';
const SCENARIO = process.env.PP_SCENARIO || 'fresh';
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const log = (...a) => fs.appendFileSync(path.join(OUT, 'log.txt'), a.join(' ') + '\n');

async function run({ win, app, calls }) {
  fs.mkdirSync(OUT, { recursive: true });
  const wc = win.webContents;
  wc.on('console-message', (e) => {
    const lvl = e.level, msg = e.message;
    if (lvl === 'error' || lvl === 'warning' || /error/i.test(String(msg))) log('CONSOLE', lvl, msg);
  });
  wc.on('render-process-gone', (_e, d) => log('RENDERER GONE', JSON.stringify(d)));
  await new Promise(r => wc.once('did-finish-load', r));
  win.setSize(1440, 920);
  await sleep(1200);
  const js = (code) => wc.executeJavaScript(`(async()=>{${code}})()`).catch(err => { log('JS ERROR', err.message, code.slice(0, 90)); });
  const shot = async (name) => {
    await sleep(600);
    const img = await wc.capturePage();
    fs.writeFileSync(path.join(OUT, `${SCENARIO}-${name}.png`), img.toPNG());
    log('shot', name);
  };
  const waitFor = async (code, ms = 20000) => {
    const end = Date.now() + ms;
    while (Date.now() < end) { if (await js(code)) return true; await sleep(250); }
    log('TIMEOUT', code); return false;
  };
  const click = (sel) => js(`document.querySelector(${JSON.stringify(sel)}).click()`);

  try {
    if (SCENARIO === 'fresh') {
      // First-run setup assistant
      await waitFor(`return document.getElementById('wizardModal').open`);
      await shot('00a-wizard-key');
      await js(`document.getElementById('wizardKey').value='short'; document.getElementById('wizardNext').click();`);
      await sleep(400);
      log('wizard bad key', await js(`return document.getElementById('wizardError').textContent`));
      await js(`document.getElementById('wizardKey').value='${'A'.repeat(32)}'; document.getElementById('wizardNext').click();`);
      await waitFor(`return !document.querySelector('[data-wstep="profile"]').hidden`);
      await js(`document.getElementById('wizardProfile').value='muertemil'; document.getElementById('wizardNext').click();`);
      await waitFor(`return document.querySelector('#wizardCheck .wResult')`, 15000);
      await shot('00b-wizard-check');
      log('wizard check', await js(`return document.getElementById('wizardCheck').textContent.replace(/\\s+/g,' ').trim()`));
      await click('#wizardNext');
      await waitFor(`return document.getElementById('addModal').open`);
      await waitFor(`return document.querySelectorAll('#ownedList .ownedCard').length > 0`);
      await js(`const a=document.getElementById('selectAllOwned'); a.checked=true; a.dispatchEvent(new Event('change'));`);
      await click('#addCheckedBtn');
      await waitFor(`return PP.state.library.filter(g=>g.achTotal>0).length >= 7 && !PP.state.syncing`, 40000);
      await sleep(6000); // enrichment (covers/genres) + now playing poll
      await waitFor(`return !!PP.state.nowPlaying`, 10000);
      await shot('01-library');
      log('covers', await js(`return [...document.querySelectorAll('.card')].map(c=>c.querySelector('.title').textContent+':'+(c.querySelector('.cover').classList.contains('noCover')?'placeholder':(c.querySelector('img').naturalWidth>0?'ok':'loading'))).join(' | ')`));

      // Sheet for Hades
      await click('.card[data-appid="1145360"]');
      await waitFor(`return document.querySelectorAll('#achievementsList .achRow').length > 5`);
      await sleep(3500); // HLTB lookup (rate limited)
      await shot('02-sheet');
      log('hltb hades', await js(`return JSON.stringify(PP.gameById(1145360).hltb)`));
      // tags
      await js(`const r=document.querySelector('#achievementsList .achRow.locked'); r.querySelector('[data-ach-act="tags"]').click();`);
      await sleep(200);
      await js(`document.querySelector('#achievementsList .achRow.locked .achTagPicker [data-tag="online"]').click()`);
      await sleep(400);
      await js(`document.querySelector('#achievementsList .achRow.locked .achTagPicker [data-tag="missable"]').click()`);
      await sleep(400);
      await shot('03-sheet-tags');
      // My data: collections
      await click('[data-sheettab="data"]');
      await js(`const i=document.getElementById('collectionInput'); i.value='Steam Deck'; i.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true})); i.value='Favoritos'; i.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}));`);
      await shot('04-sheet-mydata');
      await click('#saveGameBtn');
      await sleep(800);
      await js(`await window.api.updateGame({appid:504230, collections:['Steam Deck']}); await PP.refreshLibrary(); PP.render();`);
      log('missableLeft hades', await js(`return PP.gameById(1145360).missableLeft`));

      await click('#collectionNav [data-collection="Steam Deck"]');
      await shot('05-collection');

      await click('[data-mode="all"]');
      await click('[data-viewmode="list"]');
      await shot('06-list');
      await click('#listView th[data-sort="pct"]');
      await sleep(300);
      log('list order pct', await js(`return [...document.querySelectorAll('#listView tbody tr .lName b')].map(e=>e.textContent).join('|')`));
      await click('[data-viewmode="grid"]');

      await click('[data-view="showcase"]');
      await waitFor(`return document.querySelectorAll('.trophy').length > 0`);
      await shot('07-showcase');
      const showcase = require('../src/main/showcase');
      const png = await showcase.renderImage({ texts: { locale: 'es-ES', title: 'Vitrina de platinos', summary: 'Tus juegos al 100%', hours: 'horas', days: 'días', achievements: 'logros', rarest: 'Más raro' }, accent: '#C832A0' });
      fs.writeFileSync(path.join(OUT, `${SCENARIO}-08-showcase-export.png`), png);
      log('export bytes', png.length);

      await click('[data-view="stats"]');
      await waitFor(`return document.querySelector('#statsBody .kpis')`);
      await shot('09-stats');

      await click('[data-view="recap"]');
      await waitFor(`return document.querySelector('#recapView .showcaseHead')`);
      await shot('09b-recap-month');
      await js(`document.querySelector('[data-recap-scope="year"]').click()`);
      await sleep(600);
      await shot('09c-recap-year');
      const recapMod = require('../src/main/recap');
      const rdata = await js(`const res = await window.api.stats(); return PP.logic.buildRecap(res.unlocks, PP.state.library, { year: new Date().getFullYear(), month: null })`);
      const rpng = await recapMod.renderImage({ recap: rdata, texts: { locale: 'es-ES', heading: 'Mi año en logros', period: String(new Date().getFullYear()), tagline: 'Seguimiento de logros de Steam', unlocked: 'logros desbloqueados', completed: 'juegos al 100%', games: 'juegos con progreso', activeDays: 'días con logros', streak: 'mejor racha (días)', delta: '{d}% vs año anterior', chartYear: 'Logros por mes', monthsShort: 'ene,feb,mar,abr,may,jun,jul,ago,sep,oct,nov,dic', completedTitle: 'Juegos que completaste', andMore: 'y {n} más', topTitle: 'Donde más avanzaste', topCount: '{n} logros', rarestTitle: 'Tus logros más raros' }, accent: '#C832A0', steamName: 'MuerteMil' });
      fs.writeFileSync(path.join(OUT, `${SCENARIO}-09d-recap-export.png`), rpng);
      log('recap export bytes', rpng.length);

      // Unsaved changes guard in the game sheet
      await click('[data-mode="all"]');
      await click('.card[data-appid="1145360"]');
      await waitFor(`return document.getElementById('editModal').open`);
      await click('[data-sheettab="data"]');
      await js(`document.getElementById('editRating').value='77'`);
      await js(`document.querySelector('#editForm .modalFoot button[value="cancel"]').click()`);
      await sleep(400);
      log('unsaved guard', await js(`return document.getElementById('confirmModal').open && document.getElementById('editModal').open`));
      await js(`document.getElementById('confirmOk').click()`);
      await sleep(400);
      log('closed after discard', await js(`return !document.getElementById('editModal').open && PP.gameById(1145360).rating == null`));

      await click('[data-mode="all"]');
      await js(`PP.celebrate([{appid:504230,name:'Celeste'}])`);
      await sleep(900);
      await shot('10-celebrate');
      await js(`document.querySelector('[data-celebrate-close]').click()`);

      await click('#addGamesBtn');
      await sleep(500);
      await js(`const h=document.getElementById('ownedOnlyStats'); h.checked=false; h.dispatchEvent(new Event('change'));`);
      await sleep(300);
      await js(`document.querySelector('[data-ignore="1"]').click()`);
      await sleep(400);
      log('ignored after click', await js(`return JSON.stringify((await window.api.ignoredGames()).appids)`));
      await js(`const h=document.getElementById('ownedShowIgnored'); h.checked=true; h.dispatchEvent(new Event('change'));`);
      await shot('11-add-ignored');
      await js(`document.getElementById('addModal').close()`);

      await js(`await window.api.hltbAll()`);
      await sleep(12000);
      await js(`await PP.refreshLibrary(); PP.render();`);
      log('hltb all', await js(`return PP.state.library.map(g=>g.name+':'+(g.hltb&&g.hltb.comp100)).join(' | ')`));

      win.setSize(1000, 760);
      await sleep(600);
      await shot('12-narrow');
      win.setSize(1440, 920);
      await click('#settingsBtn');
      await sleep(500);
      await shot('13-settings');
    }
    if (SCENARIO === 'migrate') {
      await waitFor(`return PP.state.library.length > 0`);
      await sleep(5000);
      await waitFor(`return !PP.state.syncing`, 30000);
      await sleep(4000);
      await shot('01-migrated');
      log('migrated', await js(`return JSON.stringify(PP.state.library.map(g=>[g.name,g.notes,g.manualHours,g.genrePrimary,g.status,g.achUnlocked,g.achTotal]))`));
      await click('.card[data-appid="504230"]');
      await waitFor(`return document.querySelectorAll('#achievementsList .achRow').length > 0`);
      await shot('02-migrated-sheet');
    }
  } catch (err) {
    log('E2E FAILED', err.stack);
  }
  log('done');
  app.quit();
}

module.exports = { run };
