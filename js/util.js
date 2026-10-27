/* Shared helpers: randomness, math, formatting. No DOM access. */
(function (root) {
  const DS = (root.DS = root.DS || {});
  const U = (DS.util = {});

  // Overridable source of randomness (tests swap in a seeded generator).
  U.random = () => Math.random();

  U.seeded = function (seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };

  U.rand = (min, max) => min + (max - min) * U.random();
  U.randInt = (min, max) => Math.floor(U.rand(min, max + 1));
  U.chance = (p) => U.random() < p;
  U.pick = (arr) => arr[Math.floor(U.random() * arr.length)];
  U.clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  U.roundTo = (v, step) => Math.round(v / step) * step;
  U.sum = (arr, fn) => arr.reduce((acc, x) => acc + (fn ? fn(x) : x), 0);

  // Picks a key from a { key: weight } map.
  U.weighted = function (weights) {
    const entries = Object.entries(weights).filter(([, w]) => w > 0);
    const total = U.sum(entries, ([, w]) => w);
    let roll = U.random() * total;
    for (const [key, w] of entries) {
      roll -= w;
      if (roll <= 0) return key;
    }
    return entries.length ? entries[entries.length - 1][0] : null;
  };

  U.shuffle = function (arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(U.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };

  let uidCounter = 0;
  U.uid = (prefix) =>
    `${prefix || 'id'}_${Date.now().toString(36)}${(uidCounter++).toString(36)}${Math.floor(U.random() * 1e6).toString(36)}`;

  U.money = function (v, compact) {
    if (v === null || v === undefined || isNaN(v)) return '$0';
    const neg = v < 0;
    const abs = Math.abs(v);
    let s;
    if (compact && abs >= 1e6) s = '$' + (abs / 1e6).toFixed(abs >= 1e7 ? 1 : 2) + 'M';
    else if (compact && abs >= 1e4) s = '$' + (abs / 1e3).toFixed(1) + 'k';
    else s = '$' + Math.round(abs).toLocaleString('en-US');
    return neg ? '-' + s : s;
  };

  U.num = (v) => Math.round(v).toLocaleString('en-US');
  U.pct = (v, digits) => (v * 100).toFixed(digits === undefined ? 0 : digits) + '%';

  U.escape = (s) =>
    String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
})(typeof window !== 'undefined' ? window : globalThis);
