// Código compartilhado entre o servidor (Node) e o navegador.
// O mundo 3D (relevo, casas, árvores) é gerado a partir de uma semente: os dois lados enxergam o mesmo mapa.
// Convenções: x para leste, z para sul, y para cima. yaw 0 olha para -z; pitch positivo olha para cima.
(function (root, factory) {
  const m = factory();
  if (typeof module === 'object' && module.exports) module.exports = m;
  else root.SH = m;
})(typeof self !== 'undefined' ? self : this, function () {
  const W = 1000;            // lado do mapa em metros
  const N = 201;             // vértices do relevo por lado
  const STEP = W / (N - 1);  // 5 m entre vértices
  const TICK = 30;
  const MAX_PLAYERS = 50;
  const GRAV = 22, JUMP_V = 7.2;
  const HEIGHT = 1.8, HEIGHT_C = 1.2, RADIUS = 0.4;
  const EYE = 1.55, EYE_C = 1.05;
  const PLANE_Y = 260;
  const SEA = 0;

  const MODES = {
    solo: { n: 'Solo', size: 1 },
    duo: { n: 'Dupla', size: 2 },
    trio: { n: 'Trio', size: 3 },
    squad: { n: 'Squad', size: 4 },
    quinteto: { n: 'Quinteto', size: 5 }
  };

  // hip/ads: abertura do tiro em radianos (sem mira / mirando). scope: mira que a arma usa ao mirar.
  const WEAP = {
    pistola: { n: 'Pistola', dmg: 24, rate: 3.5, hip: .035, ads: .012, range: 120, mag: 12, rel: 1.2, pel: 1, tier: 0, ideal: 25, w: 5, scope: 'ponto', head: 1.8 },
    smg: { n: 'Submetralhadora', dmg: 15, rate: 11, hip: .055, ads: .025, range: 90, mag: 30, rel: 1.8, pel: 1, tier: 1, ideal: 18, w: 3, scope: 'livre', head: 1.6 },
    escopeta: { n: 'Escopeta', dmg: 12, rate: 1.1, hip: .11, ads: .085, range: 35, mag: 6, rel: 2.2, pel: 8, tier: 2, ideal: 8, w: 2.5, scope: 'ponto', head: 1.5 },
    fuzil: { n: 'Fuzil', dmg: 26, rate: 7, hip: .045, ads: .007, range: 300, mag: 30, rel: 2.1, pel: 1, tier: 3, ideal: 45, w: 2.5, scope: 'livre', head: 1.8 },
    sniper: { n: 'Sniper', dmg: 92, rate: .8, hip: .09, ads: .0006, range: 650, mag: 5, rel: 2.8, pel: 1, tier: 4, ideal: 120, w: 1, scope: 'x8', head: 2.2 }
  };
  const WK = Object.keys(WEAP);
  const RAR = [
    { n: 'Comum', c: '#cfd6d1', m: 1 },
    { n: 'Raro', c: '#4aa8ff', m: 1.12 },
    { n: 'Épico', c: '#b56cff', m: 1.25 },
    { n: 'Lendário', c: '#ffb02e', m: 1.4 }
  ];
  // Zoom (campo de visão) de cada mira
  const SCOPES = { hip: { n: 'Sem mira', fov: 70 }, ponto: { n: 'Ponto vermelho', fov: 55 }, x2: { n: 'Mira 2x', fov: 35 }, x4: { n: 'Mira 4x', fov: 18 }, x8: { n: 'Sniper 8x', fov: 9 } };
  // Qual mira a arma usa, considerando a mira que o jogador achou (0 nenhuma, 2 ou 4)
  function scopeFor(wt, found) {
    const s = WEAP[wt].scope;
    if (s === 'x8') return 'x8';
    if (s === 'livre') return found === 4 ? 'x4' : found === 2 ? 'x2' : 'ponto';
    return 'ponto';
  }

  // Tempestade: espera (w), fechamento (s), raio final (r), dano por segundo (d)
  const PH = [
    { w: 60, s: 40, r: 350, d: 1 },
    { w: 45, s: 30, r: 200, d: 2 },
    { w: 35, s: 25, r: 110, d: 4 },
    { w: 25, s: 20, r: 50, d: 7 },
    { w: 20, s: 15, r: 15, d: 10 },
    { w: 15, s: 15, r: 0, d: 15 }
  ];

  const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
  const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

  function rng(seed) {
    let a = seed >>> 0;
    return function () {
      a = a + 0x6D2B79F5 | 0;
      let t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }

  // ---------- geração do mundo ----------
  function genWorld(seed) {
    const r = rng(seed), R = (a, b) => a + r() * (b - a);
    const w = { seed, W, N, STEP, H: new Float32Array(N * N), boxes: [], cyl: [], houses: [], trees: [], rocks: [], chests: [], spots: [], GC: 16, stamp: 0 };
    w.GN = Math.ceil(W / w.GC); w.grid = []; for (let i = 0; i < w.GN * w.GN; i++) w.grid.push([]);

    // ruído suave
    const G = 66, lat = new Float32Array(G * G); for (let i = 0; i < lat.length; i++) lat[i] = r() * 2 - 1;
    const vn = (x, z) => {
      const xi = Math.floor(x), zi = Math.floor(z), fx = x - xi, fz = z - zi;
      const a = lat[(xi % G + G) % G * G + (zi % G + G) % G], b = lat[((xi + 1) % G + G) % G * G + (zi % G + G) % G];
      const c = lat[(xi % G + G) % G * G + ((zi + 1) % G + G) % G], d = lat[((xi + 1) % G + G) % G * G + ((zi + 1) % G + G) % G];
      const sx = fx * fx * (3 - 2 * fx), sz = fz * fz * (3 - 2 * fz);
      return (a + (b - a) * sx) * (1 - sz) + (c + (d - c) * sx) * sz;
    };
    const hills = [];
    for (let i = 0; i < 7; i++) {
      const a = R(0, Math.PI * 2), d = R(60, 330);
      hills.push({ x: W / 2 + Math.cos(a) * d, z: W / 2 + Math.sin(a) * d, amp: R(14, 46), rad: R(45, 110) });
    }
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const x = i * STEP, z = j * STEP;
      let h = 3 + vn(x / 70, z / 70) * 5 + vn(x / 23 + 9, z / 23 + 3) * 1.6;
      for (const hl of hills) { const dx = x - hl.x, dz = z - hl.z; h += hl.amp * Math.exp(-(dx * dx + dz * dz) / (2 * hl.rad * hl.rad)); }
      const d = Math.hypot(x - W / 2, z - W / 2);
      const e = smooth(400, 480, d);
      w.H[j * N + i] = h * (1 - e) + (-1.2) * e;
    }

    // casas em vilas
    const slopeAt = (x, z) => Math.abs(height(w, x + 6, z) - height(w, x - 6, z)) + Math.abs(height(w, x, z + 6) - height(w, x, z - 6));
    const towns = [];
    for (let t = 0; towns.length < 7 && t < 400; t++) {
      const x = R(120, W - 120), z = R(120, W - 120), h = height(w, x, z);
      if (Math.hypot(x - W / 2, z - W / 2) > 360 || h < 1.5 || h > 30 || slopeAt(x, z) > 6) continue;
      if (towns.some(o => Math.hypot(o.x - x, o.z - z) < 140)) continue;
      towns.push({ x, z, n: 4 + Math.floor(r() * 4) });
    }
    const tryHouse = (x, z) => {
      const hw = R(8, 13), hd = R(8, 12);
      if (Math.hypot(x - W / 2, z - W / 2) > 390) return false;
      if (w.houses.some(o => Math.abs(o.x - x) < (o.w + hw) / 2 + 7 && Math.abs(o.z - z) < (o.d + hd) / 2 + 7)) return false;
      const base = height(w, x, z);
      if (base < 1.2 || slopeAt(x, z) > 9) return false;
      addHouse(w, x, z, hw, hd, base, Math.floor(r() * 4), r);
      return true;
    };
    for (const t of towns) { let k = 0; for (let tries = 0; k < t.n && tries < 60; tries++) if (tryHouse(t.x + R(-55, 55), t.z + R(-55, 55))) k++; }
    for (let k = 0, tries = 0; k < 12 && tries < 300; tries++) if (tryHouse(R(100, W - 100), R(100, W - 100))) k++;

    const freeAt = (x, z, pad) => {
      for (const h of w.houses) if (Math.abs(h.x - x) < h.w / 2 + pad && Math.abs(h.z - z) < h.d / 2 + pad) return false;
      for (const o of queryPoint(w, x, z)) if (o.k === 'c' && Math.hypot(o.x - x, o.z - z) < o.r + pad) return false;
      return height(w, x, z) > .8;
    };
    for (let k = 0, t = 0; k < 650 && t < 9000; t++) {
      const x = R(30, W - 30), z = R(30, W - 30); if (!freeAt(x, z, 3)) continue;
      const y = height(w, x, z); if (y > 55) continue;
      const tr = { k: 'c', x, z, r: .35, y0: y - 1, y1: y + 7, s: R(.8, 1.3), tree: 1 };
      w.trees.push(tr); addCol(w, tr, x - 1, z - 1, x + 1, z + 1); k++;
    }
    for (let k = 0, t = 0; k < 170 && t < 4000; t++) {
      const x = R(30, W - 30), z = R(30, W - 30); if (!freeAt(x, z, 3)) continue;
      const rr = R(.8, 2.6), y = height(w, x, z);
      const ro = { k: 'c', x, z, r: rr, y0: y - 1, y1: y + rr * .9, rock: 1 };
      w.rocks.push(ro); addCol(w, ro, x - rr, z - rr, x + rr, z + rr); k++;
    }
    for (let k = 0, t = 0; k < 40 && t < 1500; t++) {
      const x = R(60, W - 60), z = R(60, W - 60); if (!freeAt(x, z, 3) || Math.hypot(x - W / 2, z - W / 2) > 400) continue;
      w.chests.push({ x, z, y: height(w, x, z), rare: 0 }); k++;
    }
    for (let k = 0, t = 0; k < 160 && t < 3000; t++) {
      const x = R(40, W - 40), z = R(40, W - 40); if (!freeAt(x, z, 2) || Math.hypot(x - W / 2, z - W / 2) > 410) continue;
      w.spots.push({ x, z, y: height(w, x, z) }); k++;
    }
    return w;
  }

  function addHouse(w, x, z, hw, hd, base, door, r) {
    const hs = { x, z, w: hw, d: hd, y: base, door, color: ['#d8c9a8', '#c9b28f', '#b8c4c8', '#d9b7a0', '#a9b79a'][Math.floor(r() * 5)], roof: ['#9b4a3a', '#4a5f7a', '#6b5a43', '#596b45'][Math.floor(r() * 4)] };
    w.houses.push(hs);
    // aplaina o terreno sob a casa
    const pad = 4, blend = 10;
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const vx = i * STEP, vz = j * STEP;
      const dx = Math.max(0, Math.abs(vx - x) - hw / 2 - pad), dz = Math.max(0, Math.abs(vz - z) - hd / 2 - pad), d = Math.hypot(dx, dz);
      if (d > blend) continue;
      const k = smooth(0, blend, d), idx = j * N + i; w.H[idx] = base * (1 - k) + w.H[idx] * k;
    }
    const T = .3, HH = 3.2, gap = 1.8, y0 = base - .5, y1 = base + HH;
    const x0 = x - hw / 2, x1 = x + hw / 2, z0 = z - hd / 2, z1 = z + hd / 2;
    const wall = (ax, az, bx, bz, ya, yb) => { const b = { k: 'b', x0: ax, x1: bx, z0: az, z1: bz, y0: ya, y1: yb, wall: 1, house: hs }; w.boxes.push(b); addCol(w, b, ax, az, bx, bz); };
    const side = (s) => {
      // s: 0 norte (z0), 1 sul (z1), 2 oeste (x0), 3 leste (x1)
      const horiz = s < 2, len = horiz ? hw : hd, c = horiz ? x : z;
      const segs = s === door ? [[-len / 2, -gap / 2], [gap / 2, len / 2]] : [[-len / 2, len / 2]];
      for (const [a, b] of segs) {
        if (horiz) { const zz = s === 0 ? z0 : z1 - T; wall(c + a, zz, c + b, zz + T, y0, y1); }
        else { const xx = s === 2 ? x0 : x1 - T; wall(xx, c + a, xx + T, c + b, y0, y1); }
      }
      if (s === door) {
        if (horiz) { const zz = s === 0 ? z0 : z1 - T; wall(c - gap / 2, zz, c + gap / 2, zz + T, base + 2.3, y1); }
        else { const xx = s === 2 ? x0 : x1 - T; wall(xx, c - gap / 2, xx + T, c + gap / 2, base + 2.3, y1); }
      }
    };
    for (let s = 0; s < 4; s++) side(s);
    const roof = { k: 'b', x0: x0 - .3, x1: x1 + .3, z0: z0 - .3, z1: z1 + .3, y0: y1, y1: y1 + .3, roof: 1, house: hs };
    w.boxes.push(roof); addCol(w, roof, roof.x0, roof.z0, roof.x1, roof.z1);
    w.chests.push({ x, z, y: base, rare: 1 });
    w.spots.push({ x: x - hw / 4, z: z + hd / 4, y: base }, { x: x + hw / 4, z: z - hd / 4, y: base });
  }

  function addCol(w, o, x0, z0, x1, z1) {
    const { GC, GN, grid } = w;
    for (let i = Math.max(0, x0 / GC | 0); i <= Math.min(GN - 1, x1 / GC | 0); i++)
      for (let j = Math.max(0, z0 / GC | 0); j <= Math.min(GN - 1, z1 / GC | 0); j++) grid[i * GN + j].push(o);
  }
  function queryPoint(w, x, z) {
    const i = clamp(x / w.GC | 0, 0, w.GN - 1), j = clamp(z / w.GC | 0, 0, w.GN - 1);
    return w.grid[i * w.GN + j];
  }
  function queryBox(w, x0, z0, x1, z1) {
    const { GC, GN, grid } = w; const s = ++w.stamp, out = [];
    for (let i = Math.max(0, x0 / GC | 0); i <= Math.min(GN - 1, x1 / GC | 0); i++)
      for (let j = Math.max(0, z0 / GC | 0); j <= Math.min(GN - 1, z1 / GC | 0); j++)
        for (const o of grid[i * GN + j]) if (o._s !== s) { o._s = s; out.push(o); }
    return out;
  }

  // ---------- relevo ----------
  function height(w, x, z) {
    const fx = clamp(x / STEP, 0, N - 1.001), fz = clamp(z / STEP, 0, N - 1.001);
    const i = fx | 0, j = fz | 0, tx = fx - i, tz = fz - j, H = w.H;
    const a = H[j * N + i], b = H[j * N + i + 1], c = H[(j + 1) * N + i], d = H[(j + 1) * N + i + 1];
    return (a + (b - a) * tx) * (1 - tz) + (c + (d - c) * tx) * tz;
  }
  // chão sob os pés: relevo, telhados e pedras (só se estiverem abaixo de quem está em cima)
  function groundAt(w, x, z, y) {
    let g = height(w, x, z);
    for (const o of queryPoint(w, x, z)) {
      if (o.k === 'b') { if (x > o.x0 && x < o.x1 && z > o.z0 && z < o.z1 && o.y1 <= y + .6 && o.y1 > g) g = o.y1; }
      else if (o.rock && (x - o.x) ** 2 + (z - o.z) ** 2 < o.r * o.r * .7 && o.y1 <= y + .6 && o.y1 > g) g = o.y1;
    }
    return g;
  }

  // ---------- movimento (servidor e previsão do cliente usam este mesmo código) ----------
  function collide(w, e) {
    const h = e.crouch ? HEIGHT_C : HEIGHT;
    for (let pass = 0; pass < 2; pass++) for (const o of queryBox(w, e.x - 2, e.z - 2, e.x + 2, e.z + 2)) {
      if (o.k === 'b') {
        if (e.y >= o.y1 - .05 || e.y + h <= o.y0) continue;
        const cx = clamp(e.x, o.x0, o.x1), cz = clamp(e.z, o.z0, o.z1), dx = e.x - cx, dz = e.z - cz, d = Math.hypot(dx, dz);
        if (d < RADIUS) {
          if (d > 1e-4) { e.x = cx + dx / d * RADIUS; e.z = cz + dz / d * RADIUS; }
          else {
            const l = e.x - o.x0, rr = o.x1 - e.x, t = e.z - o.z0, b = o.z1 - e.z, m = Math.min(l, rr, t, b);
            if (m === l) e.x = o.x0 - RADIUS; else if (m === rr) e.x = o.x1 + RADIUS; else if (m === t) e.z = o.z0 - RADIUS; else e.z = o.z1 + RADIUS;
          }
        }
      } else {
        if (e.y >= o.y1 - .05) continue;
        const dx = e.x - o.x, dz = e.z - o.z, d = Math.hypot(dx, dz), m = o.r + RADIUS;
        if (d < m) { if (d < 1e-4) { e.x += m; continue; } e.x = o.x + dx / d * m; e.z = o.z + dz / d * m; }
      }
    }
    e.x = clamp(e.x, 3, W - 3); e.z = clamp(e.z, 3, W - 3);
  }
  function speedOf(e, i) {
    if (e.downed) return 1.3;
    let s = e.crouch ? 2.6 : i.ads ? 3.6 : (i.sp && i.mz > .5 ? 7.4 : 5.4);
    if (e.healT > 0) s *= .5;
    return s;
  }
  // i: { mx (lado), mz (frente), yaw, j (pular), c (agachado), sp (correr), ads (mirando) }
  function step(w, e, i, dt) {
    e.yaw = i.yaw;
    const sy = Math.sin(i.yaw), cy = Math.cos(i.yaw);
    let mx = i.mx || 0, mz = i.mz || 0; const l = Math.hypot(mx, mz); if (l > 1) { mx /= l; mz /= l; }
    // direção no mundo: frente = (-sin, -cos), direita = (cos, -sin)
    let vx = -sy * mz + cy * mx, vz = -cy * mz - sy * mx;
    e.moving = l > .1;
    if (e.fly) {
      const sp = e.fly === 1 ? 24 : 11;
      e.x += vx * sp * dt; e.z += vz * sp * dt; e.y += (e.fly === 1 ? -45 : -11) * dt;
      e.x = clamp(e.x, 3, W - 3); e.z = clamp(e.z, 3, W - 3);
      const g = groundAt(w, e.x, e.z, e.y);
      if (e.fly === 1 && e.y - g < 55) e.fly = 2;
      if (e.y <= g) { e.y = g; e.fly = 0; e.vy = 0; e.onG = true; collide(w, e); }
      return;
    }
    e.crouch = !e.downed && !!i.c;
    const sp = speedOf(e, i);
    vx *= sp; vz *= sp;
    if (e.onG) { e.vx = vx; e.vz = vz; if (i.j && !e.downed && !e.crouch) { e.vy = JUMP_V; e.onG = false; } }
    else { const k = Math.min(1, dt * 2); e.vx += (vx - e.vx) * k; e.vz += (vz - e.vz) * k; }
    e.x += e.vx * dt; e.z += e.vz * dt;
    collide(w, e);
    e.vy -= GRAV * dt; e.y += e.vy * dt;
    const g = groundAt(w, e.x, e.z, e.y);
    if (e.y <= g || (e.onG && e.vy <= 0 && e.y - g < .7)) { e.y = g; e.vy = 0; e.onG = true; }
    else e.onG = false;
    // cabeça no teto
    if (e.vy > 0) for (const o of queryPoint(w, e.x, e.z)) if (o.k === 'b' && e.x > o.x0 && e.x < o.x1 && e.z > o.z0 && e.z < o.z1 && e.y + HEIGHT > o.y0 && e.y < o.y0) { e.y = o.y0 - HEIGHT; e.vy = 0; }
  }
  const eyeOf = e => (e.crouch || e.downed) ? EYE_C : EYE;
  function dirOf(yaw, pitch) { const cp = Math.cos(pitch); return [-Math.sin(yaw) * cp, Math.sin(pitch), -Math.cos(yaw) * cp]; }

  // ---------- raio (tiros e linha de visão) ----------
  // devolve a distância até o primeiro obstáculo (relevo, paredes, árvores, pedras) ou max
  function rayHit(w, ox, oy, oz, dx, dy, dz, max) {
    let best = max;
    // relevo: anda em passos e refina
    const stp = 1.5; let prev = 0;
    for (let t = stp; t <= best; t += stp) {
      const x = ox + dx * t, z = oz + dz * t, y = oy + dy * t;
      if (x < 0 || x > W || z < 0 || z > W) break;
      if (y < height(w, x, z)) {
        let a = prev, b = t;
        for (let k = 0; k < 6; k++) { const m = (a + b) / 2; if (oy + dy * m < height(w, ox + dx * m, oz + dz * m)) b = m; else a = m; }
        best = b; break;
      }
      prev = t;
    }
    // objetos nas células que o raio atravessa
    const s = ++w.stamp, n = Math.ceil(best / 4);
    for (let k = 0; k <= n; k++) {
      const t = Math.min(best, k * 4), x = ox + dx * t, z = oz + dz * t;
      if (x < 0 || x > W || z < 0 || z > W) continue;
      const i0 = clamp(x / w.GC | 0, 0, w.GN - 1), j0 = clamp(z / w.GC | 0, 0, w.GN - 1);
      for (let di = -1; di <= 1; di++) for (let dj = -1; dj <= 1; dj++) {
        const i = i0 + di, j = j0 + dj; if (i < 0 || j < 0 || i >= w.GN || j >= w.GN) continue;
        for (const o of w.grid[i * w.GN + j]) {
          if (o._s === s) continue; o._s = s;
          const t2 = o.k === 'b' ? rayBox(o, ox, oy, oz, dx, dy, dz) : rayCyl(o, ox, oy, oz, dx, dy, dz);
          if (t2 >= 0 && t2 < best) best = t2;
        }
      }
    }
    return best;
  }
  function rayBox(b, ox, oy, oz, dx, dy, dz) {
    let t0 = 0, t1 = 1e9;
    for (const [o, d, lo, hi] of [[ox, dx, b.x0, b.x1], [oy, dy, b.y0, b.y1], [oz, dz, b.z0, b.z1]]) {
      if (Math.abs(d) < 1e-9) { if (o < lo || o > hi) return -1; continue; }
      let a = (lo - o) / d, c = (hi - o) / d; if (a > c) { const tt = a; a = c; c = tt; }
      if (a > t0) t0 = a; if (c < t1) t1 = c; if (t0 > t1) return -1;
    }
    return t0;
  }
  function rayCyl(c, ox, oy, oz, dx, dy, dz) {
    const fx = ox - c.x, fz = oz - c.z, a = dx * dx + dz * dz; if (a < 1e-9) return -1;
    const b = 2 * (fx * dx + fz * dz), cc = fx * fx + fz * fz - c.r * c.r, disc = b * b - 4 * a * cc;
    if (disc < 0) return -1;
    const t = (-b - Math.sqrt(disc)) / (2 * a); if (t < 0) return -1;
    const y = oy + dy * t; return y >= c.y0 && y <= c.y1 ? t : -1;
  }
  // acerto em personagem: cabeça (esfera) e corpo (três esferas). devolve { t, head } ou null
  function rayPlayer(e, ox, oy, oz, dx, dy, dz) {
    const k = (e.crouch || e.downed) ? .62 : 1;
    let best = null;
    const test = (cy, r, head) => {
      const fx = ox - e.x, fy = oy - (e.y + cy * k), fz = oz - e.z;
      const b = fx * dx + fy * dy + fz * dz, c = fx * fx + fy * fy + fz * fz - r * r, disc = b * b - c;
      if (disc < 0) return; const t = -b - Math.sqrt(disc); if (t < 0) return;
      if (!best || t < best.t) best = { t, head };
    };
    if (e.downed) { test(.35, .5, false); return best; }
    test(1.62, .2, true); test(1.3, .38, false); test(.95, .38, false); test(.45, .36, false);
    return best;
  }

  return {
    W, N, STEP, TICK, MAX_PLAYERS, HEIGHT, HEIGHT_C, RADIUS, EYE, EYE_C, PLANE_Y, SEA, MODES, WEAP, WK, RAR, SCOPES, PH,
    clamp, rng, genWorld, height, groundAt, step, eyeOf, dirOf, rayHit, rayPlayer, queryBox, scopeFor
  };
});
