// Simulação de uma partida. O servidor é a autoridade: movimento, tiros, dano, bots e tempestade rodam aqui.
const SH = require('../public/shared.js');
const { W, WEAP, WK, RAR, PH, MAX_PLAYERS, clamp } = SH;

const BOT_NAMES = ['Zé Bala', 'Tchola', 'NinjaBR', 'Sapo', 'Kaique', 'Bia', 'Duda', 'Vovó Sniper', 'Pastel', 'Lagartixa', 'Mandioca',
  'Xerife', 'Juju', 'Tigrão', 'Capivara', 'Biscoito', 'Faísca', 'Ratatá', 'Cuscuz', 'Pipoca', 'Marreta', 'Tainá', 'Sombra', 'Coxinha',
  'Raio', 'Guaraná', 'Jacaré', 'Pitbull', 'Tatu', 'Brigadeiro', 'Paçoca', 'Pequi', 'Saci', 'Curupira', 'Boto', 'Mapinguari', 'Caju',
  'Açaí', 'Tapioca', 'Quindim', 'Jabuti', 'Tucano', 'Arara', 'Mico', 'Sucuri', 'Onça', 'Lobo-guará', 'Siri', 'Mandacaru', 'Ipê'];
const R = (a, b) => a + Math.random() * (b - a);
const TAU = Math.PI * 2;
const DT = 1 / SH.TICK;
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
    this.bullets = []; this.chestOpen = new Set(); this.conns = new Map(); // entId -> conexão
    this.userEnt = new Map(); // userId -> entidade
    this.tick = 0; this.time = 0; this.over = false; this.bulletOut = [];
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

    // Avião atravessa a ilha; times de bots saltam juntos
    const a = R(0, TAU), c = Math.cos(a), s = Math.sin(a), o = R(-600, 600);
    this.plane = { ax: W / 2 - c * W * .68 - s * o, ay: W / 2 - s * W * .68 + c * o, bx: W / 2 + c * W * .68 - s * o, by: W / 2 + s * W * .68 + c * o, t: 0, dur: 20, ang: a, x: 0, y: 0 };
    for (const t of this.teams) { const d = R(.08, .9); for (const m of t.members) if (m.bot) m.dropT = d + R(0, .03); }

    this.zone = { x: W / 2, y: W / 2, r: W * .75, ph: 0, state: 'wait', t: 0, tx: 0, ty: 0, tr: 0, fx: 0, fy: 0, fr: 0, started: false };
    this.nextZone();

    for (const sp of this.world.spots) {
      const q = Math.random();
      if (q < .35) this.addItem(sp.x, sp.y, 'w', { w: randWeapon() }, true);
      else if (q < .7) this.addItem(sp.x, sp.y, 'ammo', { n: Math.round(R(20, 40)) }, true);
      else if (q < .85) this.addItem(sp.x, sp.y, 'med', {}, true);
      else this.addItem(sp.x, sp.y, 'shield', {}, true);
    }
  }

  newTeam() { const t = { id: this.teams.length, members: [], elim: false, rank: 0 }; this.teams.push(t); return t; }
  addEnt(team, name, bot) {
    const e = {
      id: this.ents.length, team: team.id, name, bot, human: !bot, userId: null,
      x: 0, y: 0, r: 17, hp: 100, sh: 0, ang: 0, weapons: [{ t: 'pistola', r: 0, mag: 12 }, null], cur: 0, ammo: 36, meds: 0, kills: 0,
      alive: true, landed: false, para: 0, reloadT: 0, fireT: 0, healT: 0, moving: false, downed: false, knockedBy: null, revT: 0,
      wantRev: false, fire: false, dropT: 2, inputs: [], ack: 0, stormT: 0, hitT: 0, inBush: false,
      ai: { tx: 0, ty: 0, target: null, think: R(0, .3), react: 0, strafe: 1, strafeT: 0, stuck: 0 }
    };
    this.ents.push(e); team.members.push(e); return e;
  }
  addItem(x, y, k, extra, silent) {
    const it = Object.assign({ id: this.itemId++, x: Math.round(x), y: Math.round(y), k }, extra);
    this.items.set(it.id, it);
    if (!silent) this.broadcast({ t: 'ia', it: [this.packItem(it)] });
    return it;
  }
  removeItem(it) { this.items.delete(it.id); this.broadcast({ t: 'ir', ids: [it.id] }); }
  packItem(it) { return [it.id, it.x, it.y, it.k, it.w ? WK.indexOf(it.w.t) : -1, it.w ? it.w.r : 0, it.n || 0]; }

  nextZone() {
    const z = this.zone, p = PH[z.ph];
    const off = Math.random() * Math.max(0, z.r - p.r), a = R(0, TAU);
    z.tx = clamp(z.x + Math.cos(a) * off, p.r, W - p.r); z.ty = clamp(z.y + Math.sin(a) * off, p.r, W - p.r); z.tr = p.r;
    if (p.r === 0) { z.tx = z.x; z.ty = z.y; }
    z.state = 'wait'; z.t = p.w;
  }

  // ---------- conexões ----------
  attach(userId, conn) {
    const e = this.userEnt.get(userId); if (!e) return false;
    this.conns.set(e.id, conn); e.bot = false; e.inputs = [];
    const names = this.ents.map(o => [o.name, o.team, o.bot && !o.userId ? 1 : 0]);
    conn.send({
      t: 'm', id: this.id, seed: this.seed, mode: this.mode, me: e.id, team: e.team, names,
      plane: this.plane, items: [...this.items.values()].map(it => this.packItem(it)), chests: [...this.chestOpen],
      totalTeams: this.teams.length
    });
    const t = this.teams[e.team];
    if (t.elim) this.sendResult(e);
    return true;
  }
  detach(userId) {
    const e = this.userEnt.get(userId); if (!e) return;
    this.conns.delete(e.id);
    // sem dono, a IA assume o personagem até a pessoa voltar
    if (e.alive) { e.bot = true; e.fire = false; e.wantRev = false; e.inputs = []; }
  }
  humansConnected() { return this.conns.size; }
  broadcast(msg) { for (const c of this.conns.values()) c.send(msg); }
  sendTo(e, msg) { const c = this.conns.get(e.id); if (c) c.send(msg); }

  input(userId, m) {
    const e = this.userEnt.get(userId); if (!e || e.bot) return;
    if (m.t === 'i') {
      if (e.inputs.length > 12) e.inputs.shift();
      e.inputs.push({
        s: m.s | 0, mx: clamp(+m.mx || 0, -1, 1), my: clamp(+m.my || 0, -1, 1),
        a: Number.isFinite(+m.a) ? +m.a : 0, f: !!m.f
      });
      return;
    }
    if (m.t !== 'a' || !e.alive) return;
    switch (m.k) {
      case 'jump': if (!e.landed) this.land(e, this.plane.x, this.plane.y); break;
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
  land(e, x, y) { e.x = clamp(x, 60, W - 60); e.y = clamp(y, 60, W - 60); e.landed = true; e.para = 1.3; SH.resolve(this.world, e); }
  swap(e) { const o = 1 - e.cur; if (e.weapons[o]) { e.cur = o; e.reloadT = 0; } }
  startReload(e) {
    const w = e.weapons[e.cur];
    if (!w || e.downed || e.reloadT > 0 || e.ammo <= 0 || w.mag >= WEAP[w.t].mag) return;
    e.reloadT = WEAP[w.t].rel;
  }
  startHeal(e) { if (e.downed || e.meds <= 0 || e.hp >= 100 || e.healT > 0) return; e.healT = 1.6; e.reloadT = 0; }
  pickNear(e) {
    if (e.downed) return;
    let best = null, bd = 45 * 45;
    for (const it of this.items.values()) {
      if (it.k !== 'w') continue; const d = (it.x - e.x) ** 2 + (it.y - e.y) ** 2;
      if (d < bd) { bd = d; best = it; }
    }
    if (!best) return;
    const old = e.weapons[e.cur]; e.weapons[e.cur] = best.w; this.removeItem(best);
    if (old) this.addItem(e.x + R(-12, 12), e.y + R(-12, 12), 'w', { w: old });
  }

  fire(e) {
    const w = e.weapons[e.cur];
    if (!w || e.downed || e.reloadT > 0 || e.fireT > 0 || e.para > 0 || e.healT > 0) return;
    if (w.mag <= 0) { this.startReload(e); return; }
    const d = WEAP[w.t]; e.fireT += 1 / d.rate; w.mag--;
    for (let p = 0; p < d.pel; p++) {
      const a = e.ang + (Math.random() - .5) * 2 * d.spread * (e.moving ? 1.3 : 1);
      const b = {
        x: e.x + Math.cos(e.ang) * 22, y: e.y + Math.sin(e.ang) * 22, vx: Math.cos(a) * d.spd, vy: Math.sin(a) * d.spd,
        dmg: d.dmg * RAR[w.r].m * (e.bot && !e.userId ? .7 : 1), o: e, life: d.range / d.spd, r: w.r, wn: d.n
      };
      this.bullets.push(b);
      this.bulletOut.push(b);
    }
    if (w.mag === 0) this.startReload(e);
  }

  hurt(e, dmg, src, wn) {
    if (!e.alive || e.para > 0) return;
    if (src && src !== e && src.team === e.team) return; // sem fogo amigo
    let d = dmg;
    if (!e.downed && e.sh > 0) { const s = Math.min(e.sh, d); e.sh -= s; d -= s; }
    e.hp -= d; e.hitT = .15;
    if (e.bot && src && src !== e) e.ai.provoked = 4;
    if (src && src.human) this.sendTo(src, { t: 'd', x: Math.round(e.x), y: Math.round(e.y - 26), n: Math.round(dmg) });
    if (e.hp > 0) return;
    if (e.downed) { this.kill(e, src || e.knockedBy, wn); return; }
    const team = this.teams[e.team];
    const standing = team.members.filter(m => m !== e && m.alive && !m.downed);
    if (this.size > 1 && standing.length > 0) {
      e.downed = true; e.hp = 100; e.knockedBy = src; e.healT = 0; e.reloadT = 0; e.revT = 0; e.fire = false;
      this.feed(src ? `${src.name} derrubou ${e.name}` : `${e.name} caiu na tempestade`, [e, src]);
    } else this.kill(e, src, wn);
  }

  kill(e, src, wn) {
    if (!e.alive) return;
    e.alive = false; e.downed = false;
    if (src && src !== e && src.team !== e.team) src.kills++;
    this.feed(src && src !== e ? `${src.name} eliminou ${e.name}${wn ? ' (' + wn + ')' : ''}` : `${e.name} foi pego pela tempestade`, [e, src]);
    for (const w of e.weapons) if (w) this.addItem(e.x + R(-20, 20), e.y + R(-20, 20), 'w', { w });
    if (e.ammo > 0) this.addItem(e.x + R(-20, 20), e.y + R(-20, 20), 'ammo', { n: Math.max(15, e.ammo) });
    for (let i = 0; i < e.meds; i++) this.addItem(e.x + R(-24, 24), e.y + R(-24, 24), 'med', {});
    this.broadcast({ t: 'x', x: Math.round(e.x), y: Math.round(e.y), id: e.id });
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

  feed(text, involved) {
    const ids = involved.filter(Boolean).map(x => x.id);
    this.broadcast({ t: 'f', s: text, ids });
  }

  pickup(e) {
    if (e.downed) return;
    for (const it of this.items.values()) {
      if ((it.x - e.x) ** 2 + (it.y - e.y) ** 2 > 34 * 34) continue;
      if (it.k === 'ammo') { e.ammo += it.n; this.removeItem(it); }
      else if (it.k === 'med' && e.meds < 4) { e.meds++; this.removeItem(it); }
      else if (it.k === 'shield' && e.sh < 100) { e.sh = Math.min(100, e.sh + 50); this.removeItem(it); }
      else if (it.k === 'w') {
        const empty = e.weapons.indexOf(null);
        if (empty >= 0) { e.weapons[empty] = it.w; this.removeItem(it); if (e.human) e.cur = empty; }
        else if (e.bot && !e.userId) {
          const worst = score(e.weapons[0]) < score(e.weapons[1]) ? 0 : 1;
          if (score(it.w) > score(e.weapons[worst]) + .5) {
            const old = e.weapons[worst]; e.weapons[worst] = it.w; this.removeItem(it);
            this.addItem(it.x, it.y, 'w', { w: old });
          }
        }
      }
    }
    const ch = this.world.chests;
    for (let i = 0; i < ch.length; i++) {
      const c = ch[i];
      if (this.chestOpen.has(i) || (c.x - e.x) ** 2 + (c.y - e.y) ** 2 > 46 * 46) continue;
      this.chestOpen.add(i); this.broadcast({ t: 'co', i });
      const n = c.rare ? 2 : 1;
      for (let k = 0; k < n; k++) this.addItem(c.x + R(-26, 26), c.y + R(-26, 26), 'w', { w: randWeapon(c.rare ? 1 : 0) });
      this.addItem(c.x + R(-26, 26), c.y + R(-26, 26), 'ammo', { n: Math.round(R(25, 50)) });
      if (Math.random() < .6) this.addItem(c.x + R(-26, 26), c.y + R(-26, 26), Math.random() < .5 ? 'med' : 'shield', {});
    }
  }

  // ---------- bots ----------
  botThink(b) {
    const ai = b.ai, w = b.weapons[b.cur]; let best = null, bd = ai.provoked > 0 ? 640 : 460;
    for (const e of this.ents) {
      if (e.team === b.team || !e.alive || !e.landed || e.para > 0) continue;
      const d = Math.hypot(e.x - b.x, e.y - b.y) + (e.downed ? 150 : 0);
      if (d < bd && !(e.inBush && d > 150) && SH.los(this.world, b.x, b.y, e.x, e.y)) { bd = d; best = e; }
    }
    if (best !== ai.target) { ai.target = best; ai.react = R(.6, 1.2); }
    b.wantRev = false; ai.rev = null;
    if (best) {
      let bi = b.cur, bs = -9;
      b.weapons.forEach((x, i) => {
        if (!x) return; let s = score(x);
        if (x.t === 'escopeta' && bd < 170) s += 3; if (x.t === 'sniper' && bd < 200) s -= 3; if (x.mag === 0 && b.ammo === 0) s -= 10;
        if (s > bs) { bs = s; bi = i; }
      });
      if (bi !== b.cur) { b.cur = bi; b.reloadT = 0; }
      return;
    }
    // reanimar companheiro caído
    const mate = this.teams[b.team].members.find(m => m !== b && m.alive && m.downed && Math.hypot(m.x - b.x, m.y - b.y) < 700);
    if (mate) { ai.rev = mate; ai.tx = mate.x; ai.ty = mate.y; b.wantRev = Math.hypot(mate.x - b.x, mate.y - b.y) < 45; return; }
    if (b.hp < 70 && b.meds > 0) this.startHeal(b);
    else if (w && w.mag < WEAP[w.t].mag / 2) this.startReload(b);
    const z = this.zone, zr = Math.max(z.tr, 60);
    const outside = Math.hypot(b.x - z.x, b.y - z.y) > z.r - 30 || Math.hypot(b.x - z.tx, b.y - z.ty) > zr * .85;
    if (outside) { ai.tx = z.tx + R(-zr * .3, zr * .3); ai.ty = z.ty + R(-zr * .3, zr * .3); return; }
    if (Math.hypot(ai.tx - b.x, ai.ty - b.y) < 40 || ai.stuck > 1.2 || ai.tx === 0) {
      let g = null, gd = 650;
      const ch = this.world.chests;
      for (let i = 0; i < ch.length; i++) if (!this.chestOpen.has(i)) { const d = Math.hypot(ch[i].x - b.x, ch[i].y - b.y); if (d < gd) { gd = d; g = ch[i]; } }
      if (!g) {
        gd = 420;
        for (const it of this.items.values()) {
          if (it.k === 'w' && score(it.w) <= Math.min(score(b.weapons[0]), score(b.weapons[1]))) continue;
          const d = Math.hypot(it.x - b.x, it.y - b.y); if (d < gd) { gd = d; g = it; }
        }
      }
      if (g && ai.stuck <= 1.2) { ai.tx = g.x; ai.ty = g.y; }
      else { const a = R(0, TAU), r = R(0, zr * .7); ai.tx = z.tx + Math.cos(a) * r; ai.ty = z.ty + Math.sin(a) * r; }
      ai.stuck = 0;
    }
  }
  botUpdate(b, dt) {
    const ai = b.ai; ai.think -= dt; if (ai.provoked > 0) ai.provoked -= dt;
    if (ai.think <= 0) { ai.think = .25; this.botThink(b); }
    let mx = 0, my = 0; const t = ai.target; b.fire = false;
    if (b.downed) {
      const mate = this.teams[b.team].members.find(m => m !== b && m.alive && !m.downed);
      if (mate) { const dx = mate.x - b.x, dy = mate.y - b.y, d = Math.hypot(dx, dy); if (d > 40) { mx = dx / d; my = dy / d; } }
    } else if (t && t.alive) {
      const dx = t.x - b.x, dy = t.y - b.y, d = Math.hypot(dx, dy) || 1, w = b.weapons[b.cur], ideal = w ? WEAP[w.t].ideal : 250;
      ai.strafeT -= dt; if (ai.strafeT <= 0) { ai.strafeT = R(.6, 1.6); ai.strafe = Math.random() < .5 ? -1 : 1; }
      const f = d > ideal + 60 ? 1 : d < ideal - 60 ? -1 : 0;
      mx = dx / d * f + (-dy / d) * ai.strafe * .8; my = dy / d * f + (dx / d) * ai.strafe * .8;
      b.ang = Math.atan2(dy, dx) + (Math.random() - .5) * .36;
      ai.react -= dt; if (ai.react <= 0 && w && d < WEAP[w.t].range * .95) b.fire = true;
      const z = this.zone, zd = Math.hypot(b.x - z.x, b.y - z.y);
      if (zd > z.r - 30) { mx += (z.x - b.x) / zd * 1.5; my += (z.y - b.y) / zd * 1.5; }
    } else {
      const dx = ai.tx - b.x, dy = ai.ty - b.y, d = Math.hypot(dx, dy);
      if (d > (ai.rev ? 34 : 8)) { mx = dx / d; my = dy / d; b.ang = Math.atan2(dy, dx); }
    }
    const ox = b.x, oy = b.y;
    SH.moveEnt(this.world, b, mx, my, dt);
    if (b.moving && Math.hypot(b.x - ox, b.y - oy) < dt * 40) ai.stuck += dt; else ai.stuck = Math.max(0, ai.stuck - dt);
  }

  // ---------- passo da simulação ----------
  step() {
    const dt = DT; this.tick++; this.time += dt;
    const p = this.plane, z = this.zone;
    if (p.t < 1) {
      p.t = Math.min(1, p.t + dt / p.dur);
      p.x = p.ax + (p.bx - p.ax) * p.t; p.y = p.ay + (p.by - p.ay) * p.t;
      for (const e of this.ents) {
        if (e.landed) continue;
        if (e.bot && !e.userId && p.t >= e.dropT) { const a = p.ang + Math.PI / 2 * (Math.random() < .5 ? 1 : -1), o = R(0, 520); this.land(e, p.x + Math.cos(a) * o, p.y + Math.sin(a) * o); }
        else if (p.t >= 1) this.land(e, p.x + R(-80, 80), p.y + R(-80, 80));
        else if (e.userId && e.bot && p.t >= .5) this.land(e, p.x, p.y); // desconectado: salta sozinho
      }
      if (p.t >= 1) z.started = true;
    }
    if (z.started && !this.over) {
      z.t -= dt;
      if (z.state === 'wait' && z.t <= 0) { z.state = 'shrink'; z.t = PH[z.ph].s; z.fx = z.x; z.fy = z.y; z.fr = z.r; }
      if (z.state === 'shrink') {
        const k = 1 - Math.max(0, z.t) / PH[z.ph].s;
        z.x = z.fx + (z.tx - z.fx) * k; z.y = z.fy + (z.ty - z.fy) * k; z.r = z.fr + (z.tr - z.fr) * k;
        if (z.t <= 0) { if (z.ph < PH.length - 1) { z.ph++; this.nextZone(); } else z.state = 'end'; }
      }
    }
    const dps = PH[z.ph].d;

    for (const e of this.ents) {
      if (!e.alive) continue;
      if (!e.landed) { if (e.inputs.length) { e.ack = e.inputs[e.inputs.length - 1].s; e.inputs = []; } continue; }
      if (e.para > 0) e.para -= dt;
      if (e.bot) this.botUpdate(e, dt);
      else {
        // até 3 entradas por passo: evita acelerar o personagem enviando entradas extras
        let n = 0;
        while (e.inputs.length && n < 3) {
          const i = e.inputs.shift(); n++;
          SH.moveEnt(this.world, e, i.mx, i.my, dt);
          e.ang = i.a; e.fire = i.f; e.ack = i.s;
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
      e.inBush = SH.inBush(this.world, e.x, e.y);
      this.pickup(e);
      if (z.started && Math.hypot(e.x - z.x, e.y - z.y) > z.r) {
        e.stormT += dt; if (e.stormT >= .5) { e.stormT = 0; this.hurt(e, dps * .5 * (e.downed ? 2 : 1), null); }
      }
    }
    // caídos: sangram e podem ser reanimados
    for (const e of this.ents) {
      if (!e.alive || !e.downed) continue;
      const helper = this.teams[e.team].members.find(m => m !== e && m.alive && !m.downed && m.wantRev && Math.hypot(m.x - e.x, m.y - e.y) < 55);
      if (helper) {
        e.revT += dt;
        if (e.revT >= 4) { e.downed = false; e.hp = 30; e.revT = 0; e.knockedBy = null; this.feed(`${helper.name} reanimou ${e.name}`, [e, helper]); }
      } else {
        e.revT = 0; e.hp -= 4 * dt;
        if (e.hp <= 0) this.kill(e, e.knockedBy, null);
      }
    }
    // balas
    for (let i = this.bullets.length - 1; i >= 0; i--) {
      const b = this.bullets[i]; const nx = b.x + b.vx * dt, ny = b.y + b.vy * dt; let hit = false;
      const obs = SH.query(this.world, Math.min(b.x, nx), Math.min(b.y, ny), Math.max(b.x, nx), Math.max(b.y, ny));
      const steps = Math.max(1, Math.ceil(Math.hypot(nx - b.x, ny - b.y) / 12));
      let ex = nx, ey = ny;
      for (let s = 1; s <= steps && !hit; s++) {
        const x = b.x + (nx - b.x) * s / steps, y = b.y + (ny - b.y) * s / steps;
        for (const o of obs) if (SH.blocked(o, x, y)) { hit = true; ex = x; ey = y; break; }
      }
      const dx = ex - b.x, dy = ey - b.y, l2 = dx * dx + dy * dy || 1;
      let victim = null, vt = 2;
      for (const e of this.ents) {
        if (e === b.o || !e.alive || !e.landed || e.para > 0 || e.team === b.o.team) continue;
        let t = ((e.x - b.x) * dx + (e.y - b.y) * dy) / l2; t = clamp(t, 0, 1);
        if ((b.x + dx * t - e.x) ** 2 + (b.y + dy * t - e.y) ** 2 < (e.r + 2) ** 2 && t < vt) { vt = t; victim = e; }
      }
      if (victim) { this.hurt(victim, b.dmg, b.o, b.wn); hit = true; }
      b.x = nx; b.y = ny; b.life -= dt;
      if (hit || b.life <= 0) this.bullets.splice(i, 1);
    }
    if (this.tick % 2 === 0) this.sendSnapshots();
    if (this.over && this.time >= this.endAt) return false;
    if (!this.over && this.conns.size === 0 && this.ents.every(e => !e.userId || !e.alive || e.bot)) {
      // ninguém mais conectado: encerra para não gastar o servidor à toa
      if (!this.idleSince) this.idleSince = this.time;
      if (this.time - this.idleSince > 30) return false;
    } else this.idleSince = 0;
    return true;
  }

  sendSnapshots() {
    const z = this.zone;
    const zs = [Math.round(z.x), Math.round(z.y), Math.round(z.r), Math.round(z.tx), Math.round(z.ty), Math.round(z.tr), z.started ? (z.state === 'wait' ? 0 : z.state === 'shrink' ? 1 : 2) : 3, Math.round(z.t * 10) / 10];
    const alive = this.ents.reduce((s, e) => s + (e.alive ? 1 : 0), 0);
    const bl = this.bulletOut; this.bulletOut = [];
    for (const [id, conn] of this.conns) {
      const me = this.ents[id];
      // quem está morto acompanha um companheiro vivo
      let view = me;
      if (!me.alive) view = this.teams[me.team].members.find(m => m.alive) || me;
      const vx = view.landed ? view.x : this.plane.x, vy = view.landed ? view.y : this.plane.y;
      const list = [];
      for (const o of this.ents) {
        if (!o.alive || !o.landed) continue;
        const d = Math.hypot(o.x - vx, o.y - vy);
        const mate = o.team === me.team;
        if (!mate && (d > 1400 || (o.inBush && d > 150))) continue;
        const w = o.weapons[o.cur];
        const flags = (o.downed ? 1 : 0) | (o.para > 0 ? 2 : 0) | (o.healT > 0 ? 4 : 0) | (o.hitT > 0 ? 8 : 0) | (o.revT > 0 ? 16 : 0) | (o.inBush ? 32 : 0);
        list.push([o.id, Math.round(o.x), Math.round(o.y), Math.round(o.ang * 100), Math.round(o.hp), Math.round(o.sh), flags, w ? WK.indexOf(w.t) : -1, w ? w.r : 0, Math.round(o.revT * 10)]);
      }
      const bs = [];
      for (const b of bl) if (Math.abs(b.x - vx) < 1800 && Math.abs(b.y - vy) < 1800) bs.push([Math.round(b.x), Math.round(b.y), Math.round(b.vx), Math.round(b.vy), Math.round(b.life * 100) / 100, b.r]);
      conn.send({
        t: 's', tk: this.tick, ack: me.ack,
        me: {
          x: Math.round(me.x * 10) / 10, y: Math.round(me.y * 10) / 10, hp: Math.round(me.hp), sh: Math.round(me.sh), am: me.ammo, md: me.meds, cur: me.cur,
          w: me.weapons.map(w => w ? [WK.indexOf(w.t), w.r, w.mag] : 0), rl: me.reloadT > 0 ? 1 : 0, hl: Math.round(Math.max(0, me.healT) * 10) / 10,
          dn: me.downed ? 1 : 0, al: me.alive ? 1 : 0, ld: me.landed ? 1 : 0, pa: Math.round(Math.max(0, me.para) * 10) / 10, k: me.kills, v: view.id
        },
        e: list, b: bs, z: zs, pl: Math.round(this.plane.t * 1000) / 1000, al: alive, tl: this.teamsLeft
      });
    }
  }
}

module.exports = { Match };
