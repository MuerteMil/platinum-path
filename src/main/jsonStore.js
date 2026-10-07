'use strict';
// Small JSON file store with atomic, debounced writes.
// Replaces electron-store: same file location/format (userData/<name>.json),
// but data lives in memory and is written at most once every `delay` ms,
// instead of rewriting the whole file on every single change.

const fs = require('fs');
const path = require('path');

class JsonStore {
  constructor(file, defaults = {}, { delay = 400 } = {}) {
    this.file = file;
    this.defaults = defaults;
    this.delay = delay;
    this.timer = null;
    this.data = this._load();
  }

  _load() {
    let raw = null;
    try {
      raw = fs.readFileSync(this.file, 'utf-8');
    } catch {
      return structuredClone(this.defaults);
    }
    try {
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('not an object');
      return { ...structuredClone(this.defaults), ...parsed };
    } catch (err) {
      // Never lose a damaged file silently: keep a copy next to it.
      const bad = `${this.file}.corrupt-${Date.now()}`;
      try { fs.copyFileSync(this.file, bad); } catch {}
      console.error('[store] could not parse %s (%s). Copy saved at %s', this.file, err.message, bad);
      return structuredClone(this.defaults);
    }
  }

  get(key) { return this.data[key]; }

  set(key, value) {
    this.data[key] = value;
    this.save();
  }

  replaceAll(next) {
    this.data = { ...structuredClone(this.defaults), ...(next || {}) };
    this.save();
  }

  /** Schedule a debounced write. */
  save() {
    if (this.timer) return;
    this.timer = setTimeout(() => { this.timer = null; this.flush(); }, this.delay);
  }

  /** Write now (atomic: temp file + rename). */
  flush() {
    if (this.timer) { clearTimeout(this.timer); this.timer = null; }
    const tmp = `${this.file}.tmp`;
    try {
      fs.mkdirSync(path.dirname(this.file), { recursive: true });
      fs.writeFileSync(tmp, JSON.stringify(this.data, null, '\t'), 'utf-8');
      fs.renameSync(tmp, this.file);
    } catch (err) {
      console.error('[store] write failed for %s: %s', this.file, err.message);
    }
  }
}

module.exports = { JsonStore };
