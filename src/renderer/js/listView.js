(function (PP) {
  'use strict';
  const { t, $, escapeHtml, fmtNum } = PP;
  const L = PP.logic;

  // Columns: [key, i18n label, sort key or null, class]
  const COLS = [
    ['game', 'list.game', 'name', 'cGame'],
    ['progress', 'list.progress', 'pct', 'cProg'],
    ['ach', 'list.achievements', 'pct', 'cNum'],
    ['left', 'list.left', 'remaining', 'cNum'],
    ['hours', 'list.hours', 'hours', 'cNum'],
    ['hltb', 'list.hltb', 'hltb', 'cNum'],
    ['diff', 'list.difficulty', 'diff', 'cNum'],
    ['rating', 'list.rating', 'rating', 'cNum'],
    ['status', 'list.status', null, 'cStatus']
  ];
  const DEFAULT_DIR = { name: 'asc', pct: 'desc', remaining: 'asc', hours: 'desc', hltb: 'asc', diff: 'asc', rating: 'desc' };

  function cell(g, key) {
    const done = L.isDone(g);
    const has = Number(g.achTotal) > 0;
    const p = L.pct(g.achUnlocked, g.achTotal);
    switch (key) {
      case 'game': return `<div class="lGame"><div class="lThumb">${PP.coverImg(g)}</div><div class="lName"><b>${escapeHtml(g.name || `App ${g.appid}`)}</b>${L.collectionsOf(g).length ? `<span class="chipsInline">${L.collectionsOf(g).map(c => `<span class="miniChip">${escapeHtml(c)}</span>`).join('')}</span>` : ''}</div></div>`;
      case 'progress': return has ? `<div class="lProg"><div class="progress ${done ? 'full' : ''}"><i style="width:${p.toFixed(1)}%"></i></div><span>${p.toFixed(0)}%</span></div>` : `<span class="muted">${escapeHtml(g.noStats ? t('card.noAch') : '—')}</span>`;
      case 'ach': return has ? `${Number(g.achUnlocked) || 0}<span class="muted">/${Number(g.achTotal)}</span>` : '—';
      case 'left': return has ? (done ? '💎' : String(L.remaining(g))) : '—';
      case 'hours': return fmtNum(L.effectiveHours(g), 1);
      case 'hltb': {
        const h = L.hltbHours(g);
        if (h == null) return '<span class="muted">—</span>';
        const left = L.hltbLeft(g);
        return `${fmtNum(h, 0)} h${left ? `<div class="muted small">${escapeHtml(t('hltb.left', { h: fmtNum(left, 0) }))}</div>` : ''}`;
      }
      case 'diff': { const d = L.effectiveDifficulty(g); return d.value == null ? '—' : `${d.estimated ? '~' : ''}${d.value}`; }
      case 'rating': return L.hasValue(g.rating) ? String(Number(g.rating)) : '—';
      case 'status': {
        const parts = [];
        if (g.newAchAlert) parts.push(`<span class="badge warn">⚠</span>`);
        if (g.status) parts.push(`<span class="badge status-${escapeHtml(g.status)}">${escapeHtml(PP.statusLabel(g.status))}</span>`);
        else if (!done && L.isAlmost(g)) parts.push(`<span class="badge almost">${escapeHtml(t('card.almost'))}</span>`);
        return parts.join(' ');
      }
      default: return '';
    }
  }

  function renderList(list) {
    const [sortKey, dir] = PP.state.sort.split('-');
    const head = COLS.map(([key, label, sk, cls]) => {
      const active = sk && sk === sortKey && key !== 'ach';
      return `<th class="${cls} ${sk ? 'sortable' : ''} ${active ? 'active' : ''}" ${sk && key !== 'ach' ? `data-sort="${sk}"` : ''}>${escapeHtml(t(label))}${active ? (dir === 'desc' ? ' ↓' : ' ↑') : ''}</th>`;
    }).join('');
    const rows = list.map(g => `<tr class="${L.isDone(g) ? 'done' : ''}" data-appid="${Number(g.appid)}" tabindex="0">${COLS.map(([key, , , cls]) => `<td class="${cls}">${cell(g, key)}</td>`).join('')}</tr>`).join('');
    PP.setHTML($('listView'), `<table class="libTable"><thead><tr>${head}</tr></thead><tbody>${rows}</tbody></table>`);
  }

  function bind() {
    $('listView').addEventListener('click', (e) => {
      const th = e.target.closest('th[data-sort]');
      if (th) {
        const key = th.dataset.sort;
        const [cur, dir] = PP.state.sort.split('-');
        PP.state.sort = cur === key ? `${key}-${dir === 'asc' ? 'desc' : 'asc'}` : `${key}-${DEFAULT_DIR[key] || 'asc'}`;
        PP.savePrefs();
        PP.render();
        return;
      }
      const tr = e.target.closest('tr[data-appid]');
      if (tr) PP.openEditor(Number(tr.dataset.appid));
    });
    $('listView').addEventListener('keydown', (e) => {
      if (e.key !== 'Enter') return;
      const tr = e.target.closest('tr[data-appid]');
      if (tr) PP.openEditor(Number(tr.dataset.appid));
    });
  }

  Object.assign(PP, { renderList, bindList: bind });
})(window.PP);
