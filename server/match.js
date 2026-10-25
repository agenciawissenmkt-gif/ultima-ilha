// Simulação de uma partida em 3D. O servidor é a autoridade: movimento, tiros, dano, bots e tempestade rodam aqui.
const SH = require('../public/shared.js');
const { W, WEAP, WK, RAR, PH, MAX_PLAYERS, PLANE_Y, clamp } = SH;

const BOT_NAMES = ['Zé Bala', 'Tchola', 'NinjaBR', 'Sapo', 'Kaique', 'Bia', 'Duda', 'Vovó Sniper', 'Pastel', 'Lagartixa', 'Mandioca',
  'Xerife', 'Juju', 'Tigrão', 'Capivara', 'Biscoito', 'Faísca', 'Ratatá', 'Cuscuz', 'Pipoca', 'Marreta', 'Tainá', 'Sombra', 'Coxinha',
  'Raio', 'Guaraná', 'Jacaré', 'Pitbull', 'Tatu', 'Brigadeiro', 'Paçoca', 'Pequi', 'Saci', 'Curupira', 'Boto', 'Mapinguari', 'Caju',
  'Açaí', 'Tapioca', 'Quindim', 'Jabuti', 'Tucano', 'Arara', 'Mico', 'Sucuri', 'Onça', 'Lobo-guará', 'Siri', 'Mandacaru', 'Ipê'];
const R = (a, b) => a + Math.random() * (b - a);
const TAU = Math.PI * 2;
const DT = 1 / SH.TICK;
const r2 = v => Math.round(v * 100) / 100;
let NEXT_ID = 1;

function randWeapon(minR = 0) {
  let tot = 0; for (const k of WK) tot += WEAP[k].w;
  let x = Math.random() * tot, t = 'pistola';
  for (const k of WK) { x -= WEAP[k].w; if (x <= 0) { t = k; break; } }
  const q = Math.random(); let r = q < .55 ? 0 : q < .83 ? 1 : q < .96 ? 2 : 3;
  r = Math.max(r, minR);
  return { t, r, mag: WEAP[t].mag };
}
const score = w => w ? WEAP[w.t].tier + w.r * .9 : -1;
const angDiff = (a, b) => { let d = b - a; while (d > Math.PI) d -= TAU; while (d < -Math.PI) d += TAU; return d; };

class Match {
  // groups: lista de times humanos; cada time é uma lista de usuários { id, name }
  constructor(mode, groups, hooks) {
    this.id = NEXT_ID++;
    this.mode = mode;
    this.size = SH.MODES[mode].size;
    this.hooks = hooks;
    this.seed = Math.floor(Math.random() * 1e9);
    this.world = SH.genWorld(this.seed);
    this.ents = []; this.teams = []; this.items = new Map(); this.itemId = 1;
    this.chestOpen = new Set(); this.conns = new Map(); this.userEnt = new Map();
    this.tick = 0; this.time = 0; this.over = false; this.tracers = [];
    this.maxTeams = Math.floor(MAX_PLAYERS / this.size);

    const names = BOT_NAMES.slice().sort(() => Math.random() - .5); let ni = 0;
    const botName = () => names[ni++ % names.length];
    for (const g of groups) {
      const team = this.newTeam();
      for (const u of g) { const e = this.addEnt(team, u.name, false); e.userId = u.id; this.userEnt.set(u.id, e); }
      while (team.members.length < this.size) this.addEnt(team, botName(), true);
    }
    while (this.teams.length < this.maxTeams) {
      const team = this.newTeam();
      for (let i = 0; i < this.size; i++) this.addEnt(team, botName(), true);
    }
    this.teamsLeft = this.teams.length;

    const a = R(0, TAU), c = Math.cos(a), s = Math.sin(a), o = R(-150, 150);
    this.plane = { ax: W / 2 - c * W * .62 - s * o, az: W / 2 - s * W * .62 + c * o, bx: W / 2 + c * W * .62 - s * o, bz: W / 2 + s * W * .62 + c * o, t: 0, dur: 24, x: 0, z: 0, y: PLANE_Y };
    for (const t of this.teams) { const d = R(.1, .85); for (const m of t.members) if (m.bot) m.dropT = d + R(0, .03); }

    this.zone = { x: W / 2, z: W / 2, r: W * .75, ph: 0, state: 'wait', t: 0, tx: 0, tz: 0, tr: 0, fx: 0, fz: 0, fr: 0, started: false };
    this.nextZone();

    for (const sp of this.world.spots) {
      const q = Math.random();
      const k = q < .33 ? 'w' : q < .6 ? 'ammo' : q < .73 ? 'med' : q < .85 ? 'shield' : q < .94 ? 'm2' : 'm4';
      this.addItem(sp.x, sp.y, sp.z, k, k === 'w' ? { w: randWeapon() } : k === 'ammo' ? { n: Math.round(R(25, 45)) } : {}, true);
    }
  }

  newTeam() { const t = { id: this.teams.length, members: [], elim: false, rank: 0 }; this.teams.push(t); return t; }
  addEnt(team, name, bot) {
    const e = {
      id: this.ents.length, team: team.id, name, bot, human: !bot, userId: null,
      x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, onG: false, fly: 0, crouch: false, ads: false, yaw: 0, pitch: 0,
      hp: 100, sh: 0, weapons: [{ t: 'pistola', r: 0, mag: 12 }, null], cur: 0, ammo: 48, meds: 0, scope: 0, kills: 0,
      alive: true, landed: false, reloadT: 0, fireT: 0, healT: 0, moving: false, downed: false, knockedBy: null, revT: 0,
      wantRev: false, fire: false, dropT: 2, inputs: [], ack: 0, stormT: 0, hitT: 0, last: { mx: 0, mz: 0, yaw: 0, j: 0, c: 0, sp: 0, ads: 0 },
      ai: { tx: 0, tz: 0, target: null, think: R(0, .3), react: 0, strafe: 1, strafeT: 0, stuck: 0, provoked: 0, err: .1 }
    };
    this.ents.push(e); team.members.push(e); return e;
  }
  addItem(x, y, z, k, extra, silent) {
    const it = Object.assign({ id: this.itemId++, x: r2(x), y: r2(y), z: r2(z), k }, extra);
    this.items.set(it.id, it);
    if (!silent) this.broadcast({ t: 'ia', it: [this.packItem(it)] });
    return it;
  }
  dropItem(e, k, extra) {
    const x = clamp(e.x + R(-1.2, 1.2), 3, W - 3), z = clamp(e.z + R(-1.2, 1.2), 3, W - 3);
    return this.addItem(x, SH.groundAt(this.world, x, z, e.y + .5), z, k, extra);
  }
  removeItem(it) { this.items.delete(it.id); this.broadcast({ t: 'ir', ids: [it.id] }); }
  packItem(it) { return [it.id, it.x, it.y, it.z, it.k, it.w ? WK.indexOf(it.w.t) : -1, it.w ? it.w.r : 0, it.n || 0]; }

  nextZone() {
    const z = this.zone, p = PH[z.ph];
    const off = Math.random() * Math.max(0, z.r - p.r), a = R(0, TAU);
    const lim = Math.min(W / 2, 420);
    z.tx = clamp(z.x + Math.cos(a) * off, W / 2 - lim, W / 2 + lim); z.tz = clamp(z.z + Math.sin(a) * off, W / 2 - lim, W / 2 + lim); z.tr = p.r;
    if (p.r === 0) { z.tx = z.x; z.tz = z.z; }
    z.state = 'wait'; z.t = p.w;
  }

  // ---------- conexões ----------
  attach(userId, conn) {
    const e = this.userEnt.get(userId); if (!e) return false;
    this.conns.set(e.id, conn); e.bot = false; e.inputs = [];
    conn.send({
      t: 'm', id: this.id, seed: this.seed, mode: this.mode, me: e.id, team: e.team,
      names: this.ents.map(o => [o.name, o.team, o.bot && !o.userId ? 1 : 0]),
      plane: this.plane, items: [...this.items.values()].map(it => this.packItem(it)), chests: [...this.chestOpen], totalTeams: this.teams.length
    });
    if (this.teams[e.team].elim) this.sendResult(e);
    return true;
  }
  detach(userId) {
    const e = this.userEnt.get(userId); if (!e) return;
    this.conns.delete(e.id);
    if (e.alive) { e.bot = true; e.fire = false; e.wantRev = false; e.inputs = []; e.ads = false; }
  }
  broadcast(msg) { for (const c of this.conns.values()) c.send(msg); }
  sendTo(e, msg) { const c = this.conns.get(e.id); if (c) c.send(msg); }

  input(userId, m) {
    const e = this.userEnt.get(userId); if (!e || e.bot) return;
    if (m.t === 'i') {
      if (e.inputs.length > 12) e.inputs.shift();
      const num = (v, a, b) => Number.isFinite(+v) ? clamp(+v, a, b) : 0;
      e.inputs.push({ s: m.s | 0, mx: num(m.mx, -1, 1), mz: num(m.mz, -1, 1), yaw: num(m.yaw, -1e4, 1e4), ay: num(m.ay === undefined ? m.yaw : m.ay, -1e4, 1e4), pitch: num(m.pitch, -1.5, 1.5), j: m.j ? 1 : 0, c: m.c ? 1 : 0, sp: m.sp ? 1 : 0, ads: m.ads ? 1 : 0, f: m.f ? 1 : 0 });
      return;
    }
    if (m.t !== 'a' || !e.alive) return;
    switch (m.k) {
      case 'jump': if (!e.landed) this.jumpOut(e); break;
      case 'swap': this.swap(e); break;
      case 'w0': e.cur = 0; e.reloadT = 0; break;
      case 'w1': if (e.weapons[1]) { e.cur = 1; e.reloadT = 0; } break;
      case 'reload': this.startReload(e); break;
      case 'heal': this.startHeal(e); break;
      case 'pick': this.pickNear(e); break;
      case 'rev': e.wantRev = !!m.on; break;
    }
  }

  // ---------- ações ----------
  jumpOut(e, x, z) {
    e.x = clamp(x === undefined ? this.plane.x : x, 10, W - 10); e.z = clamp(z === undefined ? this.plane.z : z, 10, W - 10);
    e.y = PLANE_Y - 4; e.fly = 1; e.landed = true; e.vx = e.vy = e.vz = 0; e.onG = false;
  }
  swap(e) { const o = 1 - e.cur; if (e.weapons[o]) { e.cur = o; e.reloadT = 0; } }
  startReload(e) {
    const w = e.weapons[e.cur];
    if (!w || e.downed || e.reloadT > 0 || e.ammo <= 0 || w.mag >= WEAP[w.t].mag) return;
    e.reloadT = WEAP[w.t].rel;
  }
  startHeal(e) { if (e.downed || e.fly || e.meds <= 0 || e.hp >= 100 || e.healT > 0) return; e.healT = 2.5; e.reloadT = 0; }
  pickNear(e) {
    if (e.downed || e.fly) return;
    let best = null, bd = 2.6 * 2.6;
    for (const it of this.items.values()) {
      if (it.k !== 'w' || Math.abs(it.y - e.y) > 2) continue; const d = (it.x - e.x) ** 2 + (it.z - e.z) ** 2;
      if (d < bd) { bd = d; best = it; }
    }
    if (!best) return;
    const old = e.weapons[e.cur]; e.weapons[e.cur] = best.w; this.removeItem(best);
    if (old) this.dropItem(e, 'w', { w: old });
  }

  fire(e) {
    const w = e.weapons[e.cur];
    if (!w || e.downed || e.fly || e.reloadT > 0 || e.fireT > 0 || e.healT > 0) return;
    if (w.mag <= 0) { this.startReload(e); return; }
    const d = WEAP[w.t]; e.fireT += 1 / d.rate; w.mag--;
    let spread = e.ads ? d.ads : d.hip;
    if (!e.onG) spread *= 2.5; else if (e.moving && !e.ads) spread *= 1.4;
    if (e.crouch && e.onG) spread *= .8;
    const ox = e.x, oy = e.y + SH.eyeOf(e), oz = e.z;
    for (let p = 0; p < d.pel; p++) {
      const a = Math.random() * TAU, m = Math.sqrt(Math.random()) * spread;
      const [dx, dy, dz] = SH.dirOf((e.bot || e.aimYaw === undefined ? e.yaw : e.aimYaw) + Math.cos(a) * m, e.pitch + Math.sin(a) * m);
      let t = SH.rayHit(this.world, ox, oy, oz, dx, dy, dz, d.range), victim = null, head = false;
      for (const o of this.ents) {
        if (o === e || !o.alive || !o.landed || o.fly === 1 || o.team === e.team) continue;
        if (Math.abs(o.x - ox) > t + 2 || Math.abs(o.z - oz) > t + 2) continue;
        const h = SH.rayPlayer(o, ox, oy, oz, dx, dy, dz);
        if (h && h.t < t) { t = h.t; victim = o; head = h.head; }
      }
      this.tracers.push([r2(ox), r2(oy - .25), r2(oz), r2(ox + dx * t), r2(oy + dy * t), r2(oz + dz * t), w.r, e.id]);
      if (victim) {
        const dmg = d.dmg * RAR[w.r].m * (head ? d.head : 1) * (e.bot && !e.userId ? .5 : 1);
        this.hurt(victim, dmg, e, d.n, head);
      }
    }
    if (w.mag === 0) this.startReload(e);
  }

  hurt(e, dmg, src, wn, head) {
    if (!e.alive || e.fly === 1) return;
    if (src && src !== e && src.team === e.team) return; // sem fogo amigo
    let d = dmg;
    if (!e.downed && e.sh > 0) { const s = Math.min(e.sh, d); e.sh -= s; d -= s; }
    e.hp -= d; e.hitT = .15;
    if (e.bot && src && src !== e) { e.ai.provoked = 5; if (!e.ai.target) { e.ai.target = src; e.ai.react = R(.3, .6); } }
    if (src && src.human) this.sendTo(src, { t: 'd', n: Math.round(dmg), h: head ? 1 : 0, id: e.id });
    if (e.human && src && src !== e) this.sendTo(e, { t: 'hit', x: r2(src.x), z: r2(src.z) });
    if (e.hp > 0) return;
    if (e.downed) { this.kill(e, src || e.knockedBy, wn); return; }
    const team = this.teams[e.team];
    const standing = team.members.filter(m => m !== e && m.alive && !m.downed);
    if (this.size > 1 && standing.length > 0) {
      e.downed = true; e.hp = 100; e.knockedBy = src; e.healT = 0; e.reloadT = 0; e.revT = 0; e.fire = false; e.ads = false;
      this.feed(src ? `${src.name} derrubou ${e.name}` : `${e.name} caiu na tempestade`, [e, src]);
    } else this.kill(e, src, wn);
  }

  kill(e, src, wn) {
    if (!e.alive) return;
    e.alive = false; e.downed = false;
    if (src && src !== e && src.team !== e.team) src.kills++;
    this.feed(src && src !== e ? `${src.name} eliminou ${e.name}${wn ? ' (' + wn + ')' : ''}` : `${e.name} foi pego pela tempestade`, [e, src]);
    for (const w of e.weapons) if (w) this.dropItem(e, 'w', { w });
    if (e.ammo > 0) this.dropItem(e, 'ammo', { n: Math.max(20, e.ammo) });
    for (let i = 0; i < e.meds; i++) this.dropItem(e, 'med', {});
    if (e.scope) this.dropItem(e, e.scope === 4 ? 'm4' : 'm2', {});
    this.broadcast({ t: 'x', id: e.id, x: r2(e.x), y: r2(e.y), z: r2(e.z) });
    this.checkTeam(this.teams[e.team]);
  }

  checkTeam(team) {
    if (team.elim) return;
    if (team.members.some(m => m.alive && !m.downed)) return;
    team.elim = true; team.rank = this.teamsLeft; this.teamsLeft--;
    for (const m of team.members) if (m.alive) this.kill(m, m.knockedBy, null);
    for (const m of team.members) if (m.human) this.sendResult(m);
    if (this.teamsLeft <= 1 && !this.over) {
      const winner = this.teams.find(t => !t.elim);
      this.over = true;
      if (winner) {
        winner.rank = 1;
        for (const m of winner.members) if (m.human) this.sendResult(m);
        this.feed(`Vitória do time de ${winner.members.map(m => m.name).slice(0, 3).join(', ')}`, []);
      }
      this.endAt = this.time + 8;
    }
  }

  sendResult(e) {
    const team = this.teams[e.team];
    const res = { t: 'r', win: team.rank === 1, rank: team.rank, totalTeams: this.teams.length, kills: e.kills, teamKills: team.members.reduce((s, m) => s + m.kills, 0), time: Math.round(this.time) };
    if (e.userId && !e.resultSent) { e.resultSent = true; this.hooks.onResult(e.userId, res); }
    this.sendTo(e, res);
  }

  feed(text, involved) { this.broadcast({ t: 'f', s: text, ids: involved.filter(Boolean).map(x => x.id) }); }

  pickup(e) {
    if (e.downed || e.fly) return;
    for (const it of this.items.values()) {
      if ((it.x - e.x) ** 2 + (it.z - e.z) ** 2 > 1.7 * 1.7 || Math.abs(it.y - e.y) > 1.6) continue;
      if (it.k === 'ammo') { e.ammo += it.n; this.removeItem(it); }
      else if (it.k === 'med' && e.meds < 4) { e.meds++; this.removeItem(it); }
      else if (it.k === 'shield' && e.sh < 100) { e.sh = Math.min(100, e.sh + 50); this.removeItem(it); }
      else if ((it.k === 'm2' || it.k === 'm4') && (it.k === 'm4' ? 4 : 2) > e.scope) {
        if (e.scope) this.dropItem(e, e.scope === 4 ? 'm4' : 'm2', {});
        e.scope = it.k === 'm4' ? 4 : 2; this.removeItem(it);
      }
      else if (it.k === 'w') {
        const empty = e.weapons.indexOf(null);
        if (empty >= 0) { e.weapons[empty] = it.w; this.removeItem(it); if (e.human) e.cur = empty; }
        else if (e.bot && !e.userId) {
          const worst = score(e.weapons[0]) < score(e.weapons[1]) ? 0 : 1;
          if (score(it.w) > score(e.weapons[worst]) + .5) {
            const old = e.weapons[worst]; e.weapons[worst] = it.w; this.removeItem(it);
            this.addItem(it.x, it.y, it.z, 'w', { w: old });
          }
        }
      }
    }
    const ch = this.world.chests;
    for (let i = 0; i < ch.length; i++) {
      const c = ch[i];
      if (this.chestOpen.has(i) || (c.x - e.x) ** 2 + (c.z - e.z) ** 2 > 2.2 * 2.2 || Math.abs(c.y - e.y) > 2) continue;
      this.chestOpen.add(i); this.broadcast({ t: 'co', i });
      const put = (k, extra) => { const x = c.x + R(-1.4, 1.4), z = c.z + R(-1.4, 1.4); this.addItem(x, SH.groundAt(this.world, x, z, c.y + 1), z, k, extra); };
      for (let k = 0; k < (c.rare ? 2 : 1); k++) put('w', { w: randWeapon(c.rare ? 1 : 0) });
      put('ammo', { n: Math.round(R(30, 60)) });
      const q = Math.random();
      if (q < .3) put('med', {}); else if (q < .55) put('shield', {}); else if (q < .7) put(Math.random() < .6 ? 'm2' : 'm4', {});
    }
  }

  // ---------- bots ----------
  canSee(a, b) {
    const ox = a.x, oy = a.y + SH.eyeOf(a), oz = a.z, tx = b.x, ty = b.y + (b.downed ? .4 : 1.2), tz = b.z;
    const dx = tx - ox, dy = ty - oy, dz = tz - oz, d = Math.hypot(dx, dy, dz) || 1;
    return SH.rayHit(this.world, ox, oy, oz, dx / d, dy / d, dz / d, d) >= d - .6;
  }
  botThink(b) {
    const ai = b.ai, w = b.weapons[b.cur];
    const range = ai.provoked > 0 ? 200 : 70;
    const cands = [];
    for (const e of this.ents) {
      if (e.team === b.team || !e.alive || !e.landed || e.fly === 1) continue;
      const d = Math.hypot(e.x - b.x, e.z - b.z);
      if (d < range && !(e.crouch && d > 90)) cands.push([d + (e.downed ? 30 : 0), e]);
    }
    cands.sort((a, c) => a[0] - c[0]);
    let best = null, bd = 0;
    for (const [d, e] of cands.slice(0, 3)) if (this.canSee(b, e)) { best = e; bd = d; break; }
    if (best !== ai.target) { ai.target = best; ai.react = R(1, 2); ai.err = .22; }
    b.wantRev = false; ai.rev = null;
    if (best) {
      let bi = b.cur, bs = -9;
      b.weapons.forEach((x, i) => {
        if (!x) return; let s = score(x);
        if (x.t === 'escopeta' && bd < 15) s += 3; if (x.t === 'sniper' && bd < 25) s -= 3; if (x.t === 'escopeta' && bd > 40) s -= 3;
        if (x.mag === 0 && b.ammo === 0) s -= 10;
        if (s > bs) { bs = s; bi = i; }
      });
      if (bi !== b.cur) { b.cur = bi; b.reloadT = 0; }
      return;
    }
    const mate = this.teams[b.team].members.find(m => m !== b && m.alive && m.downed && Math.hypot(m.x - b.x, m.z - b.z) < 150);
    if (mate) { ai.rev = mate; ai.tx = mate.x; ai.tz = mate.z; b.wantRev = Math.hypot(mate.x - b.x, mate.z - b.z) < 1.8; return; }
    if (b.hp < 70 && b.meds > 0) this.startHeal(b);
    else if (w && w.mag < WEAP[w.t].mag / 2) this.startReload(b);
    const z = this.zone, zr = Math.max(z.tr, 15);
    const outside = Math.hypot(b.x - z.x, b.z - z.z) > z.r - 8 || Math.hypot(b.x - z.tx, b.z - z.tz) > zr * .85;
    if (outside) { if (Math.hypot(ai.tx - z.tx, ai.tz - z.tz) > zr * .5) { ai.tx = z.tx + R(-zr * .3, zr * .3); ai.tz = z.tz + R(-zr * .3, zr * .3); } return; }
    if (Math.hypot(ai.tx - b.x, ai.tz - b.z) < 1.5 || ai.stuck > 1.5 || ai.tx === 0) {
      let g = null, gd = 140;
      const ch = this.world.chests;
      for (let i = 0; i < ch.length; i++) if (!this.chestOpen.has(i)) { const d = Math.hypot(ch[i].x - b.x, ch[i].z - b.z); if (d < gd) { gd = d; g = ch[i]; } }
      if (!g) {
        gd = 90;
        for (const it of this.items.values()) {
          if (it.k === 'w' && score(it.w) <= Math.min(score(b.weapons[0]), score(b.weapons[1]))) continue;
          const d = Math.hypot(it.x - b.x, it.z - b.z); if (d < gd) { gd = d; g = it; }
        }
      }
      if (g && ai.stuck <= 1.5) { ai.tx = g.x; ai.tz = g.z; }
      else { const a = R(0, TAU), r = R(0, zr * .7); ai.tx = z.tx + Math.cos(a) * r; ai.tz = z.tz + Math.sin(a) * r; }
      ai.stuck = 0;
    }
  }
  botInput(b, dt) {
    const ai = b.ai; ai.think -= dt; if (ai.provoked > 0) ai.provoked -= dt;
    if (ai.think <= 0) { ai.think = .25; this.botThink(b); }
    let wx = 0, wz = 0, yaw = b.yaw, pitch = 0, jump = 0, ads = 0, crouch = 0; const t = ai.target; b.fire = false;
    if (b.fly) {
      const dx = ai.tx - b.x, dz = ai.tz - b.z;
      if (ai.tx && Math.hypot(dx, dz) > 5) { wx = dx; wz = dz; yaw = Math.atan2(-dx, -dz); }
    } else if (b.downed) {
      const mate = this.teams[b.team].members.find(m => m !== b && m.alive && !m.downed);
      if (mate) { const dx = mate.x - b.x, dz = mate.z - b.z; if (Math.hypot(dx, dz) > 1.5) { wx = dx; wz = dz; yaw = Math.atan2(-dx, -dz); } }
    } else if (t && t.alive) {
      const dx = t.x - b.x, dz = t.z - b.z, d = Math.hypot(dx, dz) || 1, w = b.weapons[b.cur], ideal = w ? WEAP[w.t].ideal : 25;
      ai.strafeT -= dt; if (ai.strafeT <= 0) { ai.strafeT = R(.6, 1.8); ai.strafe = Math.random() < .5 ? -1 : 1; if (Math.random() < .15) jump = 1; }
      const f = d > ideal + 8 ? 1 : d < ideal - 8 ? -1 : 0;
      wx = dx / d * f + (-dz / d) * ai.strafe * .8; wz = dz / d * f + (dx / d) * ai.strafe * .8;
      const ty = t.y + (t.downed ? .4 : 1.2) - (b.y + SH.eyeOf(b));
      ai.err = Math.max(.03, ai.err - dt * .03);
      const e = ai.err * (1 + d / 60);
      yaw = Math.atan2(-dx, -dz) + (Math.random() - .5) * e; pitch = Math.atan2(ty, d) + (Math.random() - .5) * e;
      ads = w && d > 30 ? 1 : 0;
      ai.react -= dt; ai.burst = (ai.burst || R(0, 1.3)) + dt;
      if (ai.react <= 0 && w && d < WEAP[w.t].range * .9 && ai.burst % 1.3 < .7) b.fire = true;
      const z = this.zone, zd = Math.hypot(b.x - z.x, b.z - z.z);
      if (zd > z.r - 8) { wx += (z.x - b.x) / zd * 1.5; wz += (z.z - b.z) / zd * 1.5; }
    } else {
      const dx = ai.tx - b.x, dz = ai.tz - b.z, d = Math.hypot(dx, dz);
      if (d > (ai.rev ? 1.2 : .6)) { wx = dx; wz = dz; yaw = Math.atan2(-dx, -dz); }
      if (ai.stuck > .6) jump = 1;
    }
    // vetor no mundo -> controles relativos ao olhar
    const l = Math.hypot(wx, wz) || 1; wx /= l; wz /= l;
    const sy = Math.sin(yaw), cy = Math.cos(yaw);
    const mz = wx * -sy + wz * -cy, mx = wx * cy + wz * -sy;
    return { mx: Math.hypot(wx, wz) > .01 ? mx : 0, mz: Math.hypot(wx, wz) > .01 ? mz : 0, yaw, pitch, j: jump, c: crouch, sp: !t ? 1 : 0, ads };
  }

  // ---------- passo da simulação ----------
  step() {
    const dt = DT; this.tick++; this.time += dt;
    const p = this.plane, z = this.zone;
    if (p.t < 1) {
      p.t = Math.min(1, p.t + dt / p.dur);
      p.x = p.ax + (p.bx - p.ax) * p.t; p.z = p.az + (p.bz - p.az) * p.t;
      for (const e of this.ents) {
        if (e.landed) continue;
        if (e.bot && !e.userId && p.t >= e.dropT) {
          this.jumpOut(e);
          const a = R(0, TAU), o = R(20, 260); e.ai.tx = clamp(p.x + Math.cos(a) * o, 60, W - 60); e.ai.tz = clamp(p.z + Math.sin(a) * o, 60, W - 60);
        } else if (p.t >= 1 || (e.userId && e.bot && p.t >= .5)) this.jumpOut(e);
      }
      if (p.t >= 1) z.started = true;
    }
    if (z.started && !this.over) {
      z.t -= dt;
      if (z.state === 'wait' && z.t <= 0) { z.state = 'shrink'; z.t = PH[z.ph].s; z.fx = z.x; z.fz = z.z; z.fr = z.r; }
      if (z.state === 'shrink') {
        const k = 1 - Math.max(0, z.t) / PH[z.ph].s;
        z.x = z.fx + (z.tx - z.fx) * k; z.z = z.fz + (z.tz - z.fz) * k; z.r = z.fr + (z.tr - z.fr) * k;
        if (z.t <= 0) { if (z.ph < PH.length - 1) { z.ph++; this.nextZone(); } else z.state = 'end'; }
      }
    }
    const dps = PH[z.ph].d;

    for (const e of this.ents) {
      if (!e.alive) continue;
      if (!e.landed) { if (e.inputs.length) { e.ack = e.inputs[e.inputs.length - 1].s; e.inputs = []; } continue; }
      if (e.bot) {
        const i = this.botInput(e, dt);
        e.pitch = i.pitch; e.ads = !!i.ads && !e.fly; SH.step(this.world, e, i, dt);
      } else {
        let n = 0;
        while (e.inputs.length && n < 3) {
          const i = e.inputs.shift(); n++;
          SH.step(this.world, e, i, dt);
          e.pitch = i.pitch; e.aimYaw = i.ay; e.ads = !!i.ads && !e.fly && !e.downed; e.fire = !!i.f; e.ack = i.s; e.last = i;
        }
        if (!n) e.moving = false;
      }
      if (e.fireT > 0) e.fireT -= dt; else e.fireT = 0;
      if (e.fire && !e.downed) this.fire(e);
      if (e.hitT > 0) e.hitT -= dt;
      if (e.reloadT > 0) {
        e.reloadT -= dt;
        if (e.reloadT <= 0) { const w = e.weapons[e.cur]; if (w) { const n = Math.min(WEAP[w.t].mag - w.mag, e.ammo); w.mag += n; e.ammo -= n; } }
      }
      if (e.healT > 0) { e.healT -= dt; if (e.healT <= 0) { e.meds--; e.hp = Math.min(100, e.hp + 45); } }
      this.pickup(e);
      if (z.started && !e.fly && Math.hypot(e.x - z.x, e.z - z.z) > z.r) {
        e.stormT += dt; if (e.stormT >= .5) { e.stormT = 0; this.hurt(e, dps * .5 * (e.downed ? 2 : 1), null); }
      }
    }
    for (const e of this.ents) {
      if (!e.alive || !e.downed) continue;
      const helper = this.teams[e.team].members.find(m => m !== e && m.alive && !m.downed && m.wantRev && Math.hypot(m.x - e.x, m.z - e.z) < 2.2);
      if (helper) {
        e.revT += dt;
        if (e.revT >= 4) { e.downed = false; e.hp = 30; e.revT = 0; e.knockedBy = null; this.feed(`${helper.name} reanimou ${e.name}`, [e, helper]); }
      } else {
        e.revT = 0; e.hp -= 4 * dt;
        if (e.hp <= 0) this.kill(e, e.knockedBy, null);
      }
    }
    if (this.tick % 2 === 0) this.sendSnapshots();
    if (this.over && this.time >= this.endAt) return false;
    if (!this.over && this.conns.size === 0) {
      if (!this.idleSince) this.idleSince = this.time;
      if (this.time - this.idleSince > 30) return false;
    } else this.idleSince = 0;
    return true;
  }

  sendSnapshots() {
    const z = this.zone;
    const zs = [r2(z.x), r2(z.z), r2(z.r), r2(z.tx), r2(z.tz), r2(z.tr), z.started ? (z.state === 'wait' ? 0 : z.state === 'shrink' ? 1 : 2) : 3, Math.round(z.t * 10) / 10];
    const alive = this.ents.reduce((s, e) => s + (e.alive ? 1 : 0), 0);
    const tr = this.tracers; this.tracers = [];
    for (const [id, conn] of this.conns) {
      const me = this.ents[id];
      let view = me;
      if (!me.alive) view = this.teams[me.team].members.find(m => m.alive) || me;
      const vx = view.landed ? view.x : this.plane.x, vz = view.landed ? view.z : this.plane.z;
      const list = [];
      for (const o of this.ents) {
        if (!o.alive || !o.landed) continue;
        const mate = o.team === me.team;
        if (!mate && Math.hypot(o.x - vx, o.z - vz) > 520) continue;
        const w = o.weapons[o.cur];
        const flags = (o.downed ? 1 : 0) | (o.fly === 1 ? 2 : 0) | (o.healT > 0 ? 4 : 0) | (o.hitT > 0 ? 8 : 0) | (o.crouch ? 16 : 0) | (o.ads ? 32 : 0) | (o.fly === 2 ? 64 : 0) | (o.moving ? 128 : 0);
        list.push([o.id, Math.round(o.x * 100), Math.round(o.y * 100), Math.round(o.z * 100), Math.round(o.yaw * 1000), Math.round(o.pitch * 1000), Math.round(o.hp), Math.round(o.sh), flags, w ? WK.indexOf(w.t) : -1, w ? w.r : 0, Math.round(o.revT * 10)]);
      }
      const ts = [];
      for (const t of tr) if (Math.abs(t[0] - vx) < 600 && Math.abs(t[2] - vz) < 600) ts.push(t);
      conn.send({
        t: 's', tk: this.tick, ack: me.ack,
        me: {
          x: me.x, y: me.y, z: me.z, vx: me.vx, vy: me.vy, vz: me.vz, og: me.onG ? 1 : 0, fl: me.fly, cr: me.crouch ? 1 : 0,
          hp: Math.round(me.hp), sh: Math.round(me.sh), am: me.ammo, md: me.meds, sc: me.scope, cur: me.cur,
          w: me.weapons.map(w => w ? [WK.indexOf(w.t), w.r, w.mag] : 0), rl: me.reloadT > 0 ? 1 : 0, hl: Math.round(Math.max(0, me.healT) * 10) / 10,
          dn: me.downed ? 1 : 0, al: me.alive ? 1 : 0, ld: me.landed ? 1 : 0, k: me.kills, v: view.id
        },
        e: list, tr: ts, z: zs, pl: Math.round(this.plane.t * 1000) / 1000, al: alive, tl: this.teamsLeft
      });
    }
  }
}

module.exports = { Match };
