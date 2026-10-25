// Código compartilhado entre o servidor (Node) e o navegador.
// O mapa é gerado a partir de uma semente, então os dois lados enxergam exatamente o mesmo mundo.
(function (root, factory) {
  const m = factory();
  if (typeof module === 'object' && module.exports) module.exports = m;
  else root.SH = m;
})(typeof self !== 'undefined' ? self : this, function () {
  const W = 4200;
  const TICK = 30;
  const MAX_PLAYERS = 50;
  const SPEED = 240, BOT_SPEED = 215, DOWNED_SPEED = 70;

  const MODES = {
    solo: { n: 'Solo', size: 1 },
    duo: { n: 'Dupla', size: 2 },
    trio: { n: 'Trio', size: 3 },
    squad: { n: 'Squad', size: 4 },
    quinteto: { n: 'Quinteto', size: 5 }
  };

  const WEAP = {
    pistola: { n: 'Pistola', dmg: 17, rate: 3.2, spread: .05, spd: 950, range: 620, mag: 12, rel: 1.1, pel: 1, tier: 0, ideal: 280, w: 5 },
    smg: { n: 'Submetralhadora', dmg: 10, rate: 10, spread: .13, spd: 900, range: 520, mag: 30, rel: 1.6, pel: 1, tier: 1, ideal: 210, w: 3 },
    escopeta: { n: 'Escopeta', dmg: 10, rate: 1.1, spread: .3, spd: 850, range: 360, mag: 5, rel: 2, pel: 8, tier: 2, ideal: 130, w: 2.5 },
    fuzil: { n: 'Fuzil', dmg: 23, rate: 5, spread: .045, spd: 1150, range: 820, mag: 25, rel: 2, pel: 1, tier: 3, ideal: 340, w: 2.5 },
    sniper: { n: 'Sniper', dmg: 92, rate: .75, spread: .006, spd: 1900, range: 1300, mag: 4, rel: 2.6, pel: 1, tier: 4, ideal: 520, w: 1 }
  };
  const WK = Object.keys(WEAP);
  const RAR = [
    { n: 'Comum', c: '#cfd6d1', m: 1 },
    { n: 'Raro', c: '#4aa8ff', m: 1.12 },
    { n: 'Épico', c: '#b56cff', m: 1.25 },
    { n: 'Lendário', c: '#ffb02e', m: 1.4 }
  ];

  // Fases da tempestade: espera (w), fechamento (s), raio final (r), dano por segundo (d)
  const PH = [
    { w: 60, s: 40, r: 1500, d: 1 },
    { w: 45, s: 30, r: 900, d: 2 },
    { w: 35, s: 25, r: 500, d: 4 },
    { w: 25, s: 20, r: 250, d: 7 },
    { w: 20, s: 15, r: 80, d: 10 },
    { w: 15, s: 15, r: 0, d: 15 }
  ];

  const clamp = (v, a, b) => v < a ? a : v > b ? b : v;

  function rng(seed) {
    let a = seed >>> 0;
    return function () {
      a = a + 0x6D2B79F5 | 0;
      let t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }

  function genWorld(seed) {
    const r = rng(seed), R = (a, b) => a + r() * (b - a), pick = a => a[Math.floor(r() * a.length)];
    const GC = 160, GN = Math.ceil(W / GC), grid = [];
    for (let i = 0; i < GN * GN; i++) grid.push([]);
    const w = { W, GC, GN, grid, stamp: 0, trees: [], rocks: [], houses: [], bushes: [], chests: [], decor: [] };
    const add = (o, x0, y0, x1, y1) => {
      for (let i = Math.max(0, x0 / GC | 0); i <= Math.min(GN - 1, x1 / GC | 0); i++)
        for (let j = Math.max(0, y0 / GC | 0); j <= Math.min(GN - 1, y1 / GC | 0); j++) grid[i * GN + j].push(o);
    };
    const free = (x, y, pad) => {
      for (const h of w.houses) if (x > h.x - pad && x < h.x + h.w + pad && y > h.y - pad && y < h.y + h.h + pad) return false;
      for (const o of query(w, x - pad - 40, y - pad - 40, x + pad + 40, y + pad + 40))
        if (o.k === 'c' && Math.hypot(o.x - x, o.y - y) < o.r + pad) return false;
      return true;
    };
    for (let i = 0, t = 0; i < 40 && t < 800; t++) {
      const hw = R(140, 220), hh = R(120, 170), x = R(150, W - 150 - hw), y = R(150, W - 150 - hh);
      if (w.houses.some(o => x < o.x + o.w + 120 && x + hw > o.x - 120 && y < o.y + o.h + 120 && y + hh > o.y - 120)) continue;
      const o = { k: 'r', x, y, w: hw, h: hh, roof: pick(['#a8483c', '#3f6f8f', '#7a5a3a', '#6b7a46']) };
      w.houses.push(o); add(o, x, y, x + hw, y + hh); i++;
      const side = Math.floor(R(0, 4));
      w.chests.push({
        x: side === 0 ? x - 34 : side === 1 ? x + hw + 34 : x + hw / 2,
        y: side < 2 ? y + hh / 2 : side === 2 ? y - 34 : y + hh + 34, rare: 1
      });
    }
    for (let i = 0, t = 0; i < 450 && t < 6000; t++) {
      const rr = R(22, 38), x = R(60, W - 60), y = R(60, W - 60);
      if (!free(x, y, rr + 26)) continue;
      const o = { k: 'c', x, y, r: rr, sh: R(.85, 1.1) }; w.trees.push(o); add(o, x - rr, y - rr, x + rr, y + rr); i++;
    }
    for (let i = 0, t = 0; i < 150 && t < 3000; t++) {
      const rr = R(18, 34), x = R(60, W - 60), y = R(60, W - 60);
      if (!free(x, y, rr + 24)) continue;
      const o = { k: 'c', x, y, r: rr, rock: 1 }; w.rocks.push(o); add(o, x - rr, y - rr, x + rr, y + rr); i++;
    }
    for (let i = 0, t = 0; i < 220 && t < 3000; t++) {
      const rr = R(30, 46), x = R(60, W - 60), y = R(60, W - 60);
      if (!free(x, y, rr)) continue; w.bushes.push({ x, y, r: rr }); i++;
    }
    for (let i = 0, t = 0; i < 55 && t < 1500; t++) {
      const x = R(100, W - 100), y = R(100, W - 100);
      if (!free(x, y, 40)) continue; w.chests.push({ x, y, rare: 0 }); i++;
    }
    for (let i = 0; i < 850; i++) w.decor.push({ x: R(0, W), y: R(0, W), r: R(20, 90), c: r() < .5 ? '#5f9c4b' : '#7bb359' });
    for (let i = 0; i < 260; i++) w.decor.push({ x: R(0, W), y: R(0, W), r: R(3, 6), c: pick(['#f2e96b', '#f5f5f0', '#e87a9b']), fl: 1 });
    // pontos livres para itens no chão (o servidor sorteia o conteúdo)
    w.spots = [];
    for (let i = 0, t = 0; i < 140 && t < 2500; t++) {
      const x = R(80, W - 80), y = R(80, W - 80);
      if (free(x, y, 24)) { w.spots.push({ x, y }); i++; }
    }
    return w;
  }

  function query(w, x0, y0, x1, y1) {
    const { GC, GN, grid } = w; w.stamp++;
    const out = [], s = w.stamp;
    for (let i = Math.max(0, x0 / GC | 0); i <= Math.min(GN - 1, x1 / GC | 0); i++)
      for (let j = Math.max(0, y0 / GC | 0); j <= Math.min(GN - 1, y1 / GC | 0); j++)
        for (const o of grid[i * GN + j]) if (o._s !== s) { o._s = s; out.push(o); }
    return out;
  }
  function blocked(o, x, y) {
    return o.k === 'c' ? (x - o.x) ** 2 + (y - o.y) ** 2 < o.r * o.r : x > o.x && x < o.x + o.w && y > o.y && y < o.y + o.h;
  }
  function los(w, ax, ay, bx, by) {
    const obs = query(w, Math.min(ax, bx), Math.min(ay, by), Math.max(ax, bx), Math.max(ay, by));
    if (!obs.length) return true;
    const n = Math.ceil(Math.hypot(bx - ax, by - ay) / 18);
    for (let i = 1; i < n; i++) {
      const x = ax + (bx - ax) * i / n, y = ay + (by - ay) * i / n;
      for (const o of obs) if (blocked(o, x, y)) return false;
    }
    return true;
  }
  function resolve(w, e) {
    for (const o of query(w, e.x - 60, e.y - 60, e.x + 60, e.y + 60)) {
      if (o.k === 'c') {
        const dx = e.x - o.x, dy = e.y - o.y, d = Math.hypot(dx, dy), m = o.r + e.r;
        if (d < m) { if (d < .01) { e.x += m; continue; } e.x = o.x + dx / d * m; e.y = o.y + dy / d * m; }
      } else {
        const cx = clamp(e.x, o.x, o.x + o.w), cy = clamp(e.y, o.y, o.y + o.h), dx = e.x - cx, dy = e.y - cy, d = Math.hypot(dx, dy);
        if (d < e.r) {
          if (d > .01) { e.x = cx + dx / d * e.r; e.y = cy + dy / d * e.r; }
          else {
            const l = e.x - o.x, rr = o.x + o.w - e.x, t = e.y - o.y, b = o.y + o.h - e.y, m = Math.min(l, rr, t, b);
            if (m === l) e.x = o.x - e.r; else if (m === rr) e.x = o.x + o.w + e.r; else if (m === t) e.y = o.y - e.r; else e.y = o.y + o.h + e.r;
          }
        }
      }
    }
    e.x = clamp(e.x, e.r, W - e.r); e.y = clamp(e.y, e.r, W - e.r);
  }
  // Movimento usado pelo servidor e pela previsão do cliente (precisa ser idêntico nos dois)
  function speedOf(e) {
    if (e.downed) return DOWNED_SPEED;
    let sp = e.bot ? BOT_SPEED : SPEED;
    if (e.healT > 0) sp *= .5;
    if (e.para > 0) sp *= 1.3;
    return sp;
  }
  function moveEnt(w, e, mx, my, dt) {
    const l = Math.hypot(mx, my);
    e.moving = l > .1;
    if (!e.moving) return;
    if (l > 1) { mx /= l; my /= l; }
    const sp = speedOf(e);
    e.x += mx * sp * dt; e.y += my * sp * dt;
    resolve(w, e);
  }
  function inBush(w, x, y) {
    for (const b of w.bushes) if ((b.x - x) ** 2 + (b.y - y) ** 2 < b.r * b.r) return true;
    return false;
  }

  return { W, TICK, MAX_PLAYERS, SPEED, BOT_SPEED, MODES, WEAP, WK, RAR, PH, clamp, rng, genWorld, query, blocked, los, resolve, moveEnt, speedOf, inBush };
});
