'use strict';
// Background queue that fills in name / cover / genres from the Steam Store
// for games that are missing them. Throttled by steam.js (store rate limits),
// so adding 200 games at once no longer triggers HTTP 429 errors.

const data = require('./data');
const steam = require('./steam');

const RETRY_AFTER = 7 * 24 * 60 * 60 * 1000;
const queue = [];
const queued = new Set();
let working = false;
let onChange = () => {};

function configure({ changed }) { if (changed) onChange = changed; }

function needsDetails(g, force) {
  if (!g) return false;
  if (force) return true;
  const noName = !g.name || /^App \d+$/.test(g.name);
  const noGenres = !g.genreLocked && !g.genrePrimary && !g.genreSecondary;
  const recentlyTried = g.detailsTriedAt && Date.now() - g.detailsTriedAt < RETRY_AFTER;
  // Old generic cover URLs break for recent games: ask the store once for the real one.
  const coverUnchecked = !g.coverCheckedAt && steam.isGenericHeader(g.coverUrl, g.appid);
  return ((noName || noGenres) && !recentlyTried) || coverUnchecked;
}

function enqueue(appids, { force = false } = {}) {
  for (const raw of appids || []) {
    const id = Number(raw);
    if (!id || queued.has(id)) continue;
    if (!needsDetails(data.getGame(id), force)) continue;
    queued.add(id);
    queue.push(id);
  }
  run();
}

async function run() {
  if (working) return;
  working = true;
  try {
    while (queue.length) {
      const id = queue.shift();
      queued.delete(id);
      const g = data.getGame(id);
      if (!g) continue;
      const det = await steam.getAppDetails(id);
      const patch = { detailsTriedAt: Date.now(), coverCheckedAt: Date.now() };
      if (det) {
        if (!g.name || /^App \d+$/.test(g.name)) patch.name = det.name;
        if (det.coverUrl && steam.isGenericHeader(g.coverUrl, id)) patch.coverUrl = det.coverUrl;
        if (det.background) patch.heroUrl = det.background;
        if (det.description) patch.description = det.description;
        // Never overwrite genres the user set by hand.
        if (!g.genreLocked && !g.genrePrimary && !g.genreSecondary) {
          patch.genrePrimary = det.genres[0] || '';
          patch.genreSecondary = det.genres[1] || '';
        }
      }
      data.patchGame(id, patch);
      onChange([id]);
    }
  } finally {
    working = false;
  }
}

function pending() { return queue.length; }

/** Fix one cover right now (called when an image fails to load in the UI). */
async function fixCover(appid) {
  const id = Number(appid);
  const g = data.getGame(id);
  if (!g) return '';
  if (g.coverFixedAt && Date.now() - g.coverFixedAt < 24 * 3600 * 1000) return g.coverUrl || '';
  const det = await steam.getAppDetails(id);
  const patch = { coverFixedAt: Date.now(), coverCheckedAt: Date.now() };
  if (det && det.coverUrl) patch.coverUrl = det.coverUrl;
  if (det && det.background) patch.heroUrl = det.background;
  data.patchGame(id, patch);
  return patch.coverUrl || '';
}

module.exports = { configure, enqueue, pending, fixCover };
