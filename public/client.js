// Cliente do Última Ilha: login, lobby, rede, previsão de movimento e desenho.
(() => {
  const $ = s => document.querySelector(s);
  const { W, WEAP, WK, RAR, MODES, clamp } = SH;
  const TAU = Math.PI * 2, STEP = 1 / SH.TICK;
  const cv = $('#c'), ctx = cv.getContext('2d'), mm = $('#mm'), mx = mm.getContext('2d');
  let vw = 0, vh = 0, DPR = 1, SC = 1;
  function resize() { DPR = Math.min(window.devicePixelRatio || 1, 2); vw = innerWidth; vh = innerHeight; cv.width = Math.round(vw * DPR); cv.height = Math.round(vh * DPR); SC = Math.sqrt(vw * vh) / 850; }
  addEventListener('resize', resize); resize();

  const store = {
    get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { v === null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch (e) { } }
  };
  const fmtT = s => { s = Math.max(0, Math.ceil(s)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const COLORS = ['#e86f5a', '#9be85a', '#e8c35a', '#c45ae8', '#e85a9b', '#8a8fe8', '#e8935a', '#6ee85a', '#e86fd0', '#d9e85a'];

  let toastT = 0;
  function toast(t) { const el = $('#toast'); el.textContent = t; el.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(() => el.classList.remove('show'), 3200); }
  function screen(name) {
    $('#login').hidden = name !== 'login'; $('#lobby').hidden = name !== 'lobby';
    $('#hud').hidden = name !== 'game'; if (name !== 'game') $('#result').hidden = true;
  }

  // ---------- conexão ----------
  let cfg = { googleClientId: '', dev: false }, ws = null, authed = false, user = null, stats = null, party = null, queue = null, retry = 0, kicked = false;
  let M = null; // partida atual

  function connect(cred) {
    if (ws) { try { ws.close(); } catch (e) { } }
    kicked = false;
    ws = new WebSocket((location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/ws');
    ws.onopen = () => ws.send(JSON.stringify(Object.assign({ t: 'hello' }, cred)));
    ws.onmessage = ev => { let m; try { m = JSON.parse(ev.data); } catch (e) { return; } onMsg(m); };
    ws.onclose = () => {
      if (kicked) return;
      const s = store.get('ui-session');
      if (authed && s) { $('#conn').hidden = false; setTimeout(() => connect({ session: s }), Math.min(5000, 800 * ++retry)); }
      else if (!authed) { screen('login'); }
    };
  }
  const send = o => { if (ws && ws.readyState === 1) ws.send(JSON.stringify(o)); };

  function onMsg(m) {
    switch (m.t) {
      case 'auth':
        if (!m.ok) { authed = false; store.set('ui-session', null); $('#loginMsg').textContent = m.msg; screen('login'); return; }
        authed = true; retry = 0; $('#conn').hidden = true;
        store.set('ui-session', m.session); user = m.user; stats = m.stats;
        renderMe(); if (!M) screen('lobby');
        break;
      case 'party': party = m; if (!m.queued) queue = null; renderParty(); break;
      case 'queue': queue = m; renderQueue(); break;
      case 'stats': stats = m.stats; renderMe(); break;
      case 'error': toast(m.msg); break;
      case 'kick': kicked = true; authed = false; toast(m.msg); screen('login'); break;
      case 'lobby': endMatch(); break;
      case 'm': startMatch(m); break;
      default: if (M) matchMsg(m);
    }
  }

  // ---------- login ----------
  async function boot() {
    try { cfg = await (await fetch('/config', { cache: 'no-store' })).json(); } catch (e) { }
    const s = store.get('ui-session');
    if (s) connect({ session: s }); else screen('login');
    if (cfg.dev) { $('#devForm').hidden = false; if (!cfg.googleClientId) $('#loginMsg').textContent = 'Modo de teste: entre só com um apelido.'; }
    if (cfg.googleClientId) {
      const init = () => {
        if (!(window.google && google.accounts && google.accounts.id)) return setTimeout(init, 200);
        google.accounts.id.initialize({ client_id: cfg.googleClientId, callback: r => connect({ token: r.credential }), ux_mode: 'popup' });
        google.accounts.id.renderButton($('#gbtn'), { theme: 'filled_black', size: 'large', shape: 'pill', text: 'signin_with', locale: 'pt-BR' });
      };
      init();
    } else if (!cfg.dev) $('#loginMsg').textContent = 'O login com Google ainda não foi configurado neste servidor.';
  }
  $('#devForm').addEventListener('submit', e => { e.preventDefault(); const n = $('#devName').value.trim(); if (n) connect({ dev: n }); });
  $('#logout').addEventListener('click', () => {
    store.set('ui-session', null); authed = false; kicked = true; if (ws) ws.close();
    try { google.accounts.id.disableAutoSelect(); } catch (e) { }
    screen('login');
  });

  // ---------- lobby ----------
  function avatar(pic, cls) { return pic ? `<img src="${esc(pic)}" alt="" referrerpolicy="no-referrer" class="${cls || ''}">` : `<span class="ph ${cls || ''}"></span>`; }
  function renderMe() {
    if (!user) return;
    $('#meName').textContent = user.name;
    const a = $('#meAvatar'); if (user.pic) { a.src = user.pic; a.referrerPolicy = 'no-referrer'; } else a.removeAttribute('src');
    if (stats) $('#meStats').textContent = `${stats.matches} partidas · ${stats.wins} vitórias · ${stats.kills} abates`;
  }
  function renderParty() {
    if (!party || !user) return;
    const leader = party.leader === user.id;
    $('#partyCode').textContent = party.code;
    $('#members').innerHTML = party.members.map(p => `<li>${avatar(p.pic)}<span class="nm">${esc(p.name)}${p.id === user.id ? ' (você)' : ''}</span>
      ${p.id === party.leader ? '<span class="tag">Líder</span>' : ''}${!p.online ? '<span class="off">offline</span>' : p.inMatch ? '<span class="off">em partida</span>' : ''}
      ${leader && p.id !== user.id && !party.queued ? `<button class="btn ghost kick" data-kick="${esc(p.id)}">Remover</button>` : ''}</li>`).join('');
    $('#leaveParty').hidden = party.members.length < 2;
    const n = party.members.length;
    $('#modes').innerHTML = Object.entries(MODES).map(([k, v]) => `<button class="btn ${party.mode === k ? 'on' : ''}" data-mode="${k}" ${!leader || party.queued || n > v.size ? 'disabled' : ''}>
      <b>${v.n}</b><span>${v.size === 1 ? '1 pessoa' : v.size + ' por time'}</span></button>`).join('');
    const size = MODES[party.mode].size;
    $('#modeHint').textContent = !leader ? 'Só o líder do grupo escolhe o modo e inicia a partida.'
      : n > size ? `Seu grupo tem ${n} pessoas: escolha um modo com time maior.`
        : size > n ? 'As vagas do seu time são completadas com outros jogadores ou bots.' : 'Time completo. Partidas de até 50 jogadores, completadas com bots.';
    const pb = $('#playBtn');
    if (party.queued) { pb.textContent = 'Cancelar busca'; pb.disabled = false; }
    else { pb.textContent = leader ? 'Jogar' : 'Aguardando o líder'; pb.disabled = !leader || n > size; }
    renderQueue();
  }
  function renderQueue() {
    const q = $('#queueInfo');
    if (!party || !party.queued) { q.hidden = true; return; }
    q.hidden = false;
    q.textContent = queue ? `Procurando partida · ${queue.humans} de ${queue.max} jogadores · começa em ${fmtT(queue.secs)} (bots completam o resto)` : 'Procurando partida…';
  }
  $('#members').addEventListener('click', e => { const b = e.target.closest('[data-kick]'); if (b) send({ t: 'party.kick', id: b.dataset.kick }); });
  $('#modes').addEventListener('click', e => { const b = e.target.closest('[data-mode]'); if (b && !b.disabled) send({ t: 'party.mode', mode: b.dataset.mode }); });
  $('#joinForm').addEventListener('submit', e => { e.preventDefault(); const c = $('#joinCode').value.trim(); if (c) { send({ t: 'party.join', code: c }); $('#joinCode').value = ''; } });
  $('#leaveParty').addEventListener('click', () => send({ t: 'party.leave' }));
  $('#playBtn').addEventListener('click', () => { initAudio(); send({ t: party && party.queued ? 'unqueue' : 'queue' }); });
  $('#copyCode').addEventListener('click', () => {
    const c = party ? party.code : '';
    navigator.clipboard.writeText(c).then(() => toast('Código copiado. Mande para seus amigos.'), () => toast('Código do grupo: ' + c));
  });

  // ---------- áudio ----------
  let AC = null;
  function initAudio() { try { AC = AC || new (window.AudioContext || window.webkitAudioContext)(); AC.resume(); } catch (e) { AC = null; } }
  function beep(f, d, type = 'square', v = .04) {
    if (!AC) return; const o = AC.createOscillator(), g = AC.createGain(); o.type = type; o.frequency.value = f; g.gain.value = v;
    g.gain.exponentialRampToValueAtTime(.0001, AC.currentTime + d); o.connect(g).connect(AC.destination); o.start(); o.stop(AC.currentTime + d);
  }

  // ---------- partida ----------
  function startMatch(m) {
    const items = new Map(); for (const a of m.items) items.set(a[0], unpackItem(a));
    M = {
      id: m.id, me: m.me, team: m.team, names: m.names, mode: m.mode, world: SH.genWorld(m.seed), items, chests: new Set(m.chests),
      plane: m.plane, planeT: 0, snaps: [], bullets: [], fx: [], feed: [], pred: { x: 0, y: 0, r: 17, bot: false }, pending: [], seq: 0,
      me$: null, zone: [W / 2, W / 2, W * .75, W / 2, W / 2, 0, 3, 0], alive: 0, tl: m.totalTeams, cam: { x: W / 2, y: W / 2, z: .45 },
      msgT: 0, lastAck: 0, result: null, nearW: null, nearDown: null, rev: false, inputAcc: 0, lastSnap: 0, ping: 0
    };
    screen('game'); $('#result').hidden = true; $('#feed').innerHTML = ''; $('#leaveMatch').hidden = true;
    $('#jump').hidden = false; $('#bottom').hidden = true;
    msg(isTouch ? 'Toque na tela para saltar do avião' : 'Espaço ou clique para saltar do avião', 3);
  }
  function endMatch() { M = null; screen(authed ? 'lobby' : 'login'); renderParty(); }
  const unpackItem = a => ({ id: a[0], x: a[1], y: a[2], k: a[3], w: a[4] >= 0 ? { t: WK[a[4]], r: a[5] } : null, n: a[6] });

  function matchMsg(m) {
    switch (m.t) {
      case 's': onSnap(m); break;
      case 'ia': for (const a of m.it) M.items.set(a[0], unpackItem(a)); break;
      case 'ir': for (const id of m.ids) M.items.delete(id); break;
      case 'co': M.chests.add(m.i); beepNear(M.world.chests[m.i], 880, .12, 'sine'); break;
      case 'f': {
        const mine = m.ids.some(id => id === M.me || (M.names[id] && M.names[id][1] === M.team));
        M.feed.unshift({ t: m.s, me: mine, ttl: 6 }); M.feed = M.feed.slice(0, 5); renderFeed(); break;
      }
      case 'd': M.fx.push({ x: m.x, y: m.y, t: .7, txt: m.n }); beep(660, .04, 'triangle', .03); break;
      case 'x': for (let i = 0; i < 14; i++) M.fx.push({ x: m.x, y: m.y, vx: (Math.random() - .5) * 240, vy: (Math.random() - .5) * 240, t: .6, p: 1, c: colorOf(m.id) }); break;
      case 'r': showResult(m); break;
    }
  }
  function beepNear(p, f, d, type) { if (!p || !M.me$) return; if (Math.hypot(p.x - M.pred.x, p.y - M.pred.y) < 500) beep(f, d, type, .04); }
  function renderFeed() { $('#feed').innerHTML = M.feed.map(f => `<div class="${f.me ? 'me' : ''}">${esc(f.t)}</div>`).join(''); }

  function onSnap(s) {
    const now = performance.now();
    if (M.lastSnap) M.ping = M.ping * .9 + (now - M.lastSnap) * .1;
    M.lastSnap = now;
    const ents = new Map(); for (const e of s.e) ents.set(e[0], e);
    M.snaps.push({ t: now, e: ents }); if (M.snaps.length > 30) M.snaps.shift();
    const me = s.me, wasLanded = M.me$ && M.me$.ld;
    M.me$ = me; M.zone = s.z; M.planeT = s.pl; M.alive = s.al; M.tl = s.tl;
    // reconciliação: parte da posição oficial e reaplica as entradas que o servidor ainda não processou
    const p = M.pred; p.downed = !!me.dn; p.healT = me.hl; p.para = me.pa;
    p.x = me.x; p.y = me.y;
    M.pending = M.pending.filter(i => i.s > s.ack);
    if (me.ld && me.al) for (const i of M.pending) SH.moveEnt(M.world, p, i.mx, i.my, STEP);
    if (me.ld && !wasLanded) { $('#jump').hidden = true; $('#bottom').hidden = false; msg('Abra baús e pegue armas!'); M.cam.x = p.x; M.cam.y = p.y; }
    if (!me.al && !M.result) { $('#bottom').hidden = true; $('#leaveMatch').hidden = false; }
    let mine = false;
    for (const b of s.b) {
      M.bullets.push({ x: b[0], y: b[1], vx: b[2], vy: b[3], life: b[4], c: RAR[b[5]].c });
      if (Math.hypot(b[0] - p.x, b[1] - p.y) < 40) mine = true;
      else if (Math.hypot(b[0] - p.x, b[1] - p.y) < 700 && Math.random() < .3) beep(160, .05, 'square', .01);
    }
    if (mine) beep(200, .07, 'square', .03);
  }

  function showResult(r) {
    M.result = r;
    $('#resT').textContent = r.win ? 'Vitória! Último time de pé' : 'Seu time foi eliminado';
    $('#resP').textContent = r.win ? 'A ilha é de vocês.' : `Vocês ficaram em #${r.rank} de ${r.totalTeams} times. Pousar perto de casas ajuda: os baús de lá têm armas melhores.`;
    $('#resRank').textContent = '#' + r.rank; $('#resKills').textContent = r.kills; $('#resTeamKills').textContent = r.teamKills;
    $('#bottom').hidden = true;
    setTimeout(() => { if (M && M.result === r) $('#result').hidden = false; }, r.win ? 500 : 1200);
  }
  $('#resLobby').addEventListener('click', () => { send({ t: 'leaveMatch' }); endMatch(); });
  $('#leaveMatch').addEventListener('click', () => { send({ t: 'leaveMatch' }); endMatch(); });
  $('#resWatch').addEventListener('click', () => { $('#result').hidden = true; $('#leaveMatch').hidden = false; });

  let msgT = 0;
  function msg(t, d = 2.4) { const el = $('#msg'); el.textContent = t; el.classList.add('show'); clearTimeout(msgT); msgT = setTimeout(() => el.classList.remove('show'), d * 1000); }

  // ---------- entrada ----------
  const keys = {}; const mouse = { x: 0, y: 0, down: false };
  let isTouch = matchMedia('(pointer:coarse)').matches;
  const stL = { id: null, ox: 0, oy: 0, x: 0, y: 0 }, stR = { id: null, ox: 0, oy: 0, x: 0, y: 0 };
  const typing = () => document.activeElement && document.activeElement.tagName === 'INPUT';
  addEventListener('keydown', e => {
    if (typing()) return;
    if (M && ['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
    if (keys[e.code]) return; keys[e.code] = true; if (M) onKey(e.code);
  });
  addEventListener('keyup', e => { keys[e.code] = false; if (M && e.code === 'KeyF') setRev(false); });
  addEventListener('blur', () => { for (const k in keys) keys[k] = false; mouse.down = false; if (M) setRev(false); });
  cv.addEventListener('mousemove', e => { mouse.x = e.clientX; mouse.y = e.clientY; });
  cv.addEventListener('mousedown', e => { if (e.button === 0) { mouse.down = true; initAudio(); if (M && M.me$ && !M.me$.ld) action('jump'); } });
  addEventListener('mouseup', () => mouse.down = false);
  cv.addEventListener('contextmenu', e => e.preventDefault());
  cv.addEventListener('touchstart', e => {
    if (!M) return; e.preventDefault(); isTouch = true; initAudio();
    if (M.me$ && !M.me$.ld) { action('jump'); return; }
    for (const t of e.changedTouches) { const s = t.clientX < vw / 2 ? stL : stR; if (s.id === null) { s.id = t.identifier; s.ox = s.x = t.clientX; s.oy = s.y = t.clientY; } }
  }, { passive: false });
  cv.addEventListener('touchmove', e => { e.preventDefault(); for (const t of e.changedTouches) for (const s of [stL, stR]) if (s.id === t.identifier) { s.x = t.clientX; s.y = t.clientY; } }, { passive: false });
  const tEnd = e => { for (const t of e.changedTouches) for (const s of [stL, stR]) if (s.id === t.identifier) s.id = null; };
  cv.addEventListener('touchend', tEnd); cv.addEventListener('touchcancel', tEnd);

  function action(k, extra) { send(Object.assign({ t: 'a', k }, extra)); }
  function setRev(on) { if (!M || M.rev === on) return; M.rev = on; action('rev', { on: on ? 1 : 0 }); }
  function onKey(c) {
    if (c === 'Space' && M.me$ && !M.me$.ld) action('jump');
    if (c === 'KeyQ') action('swap'); if (c === 'Digit1') action('w0'); if (c === 'Digit2') action('w1');
    if (c === 'KeyR') action('reload'); if (c === 'KeyH') action('heal'); if (c === 'KeyE') action('pick');
    if (c === 'KeyF') setRev(true);
  }
  const bind = (id, down, up) => { const b = $(id); b.addEventListener('pointerdown', e => { e.preventDefault(); down(); }); if (up) { b.addEventListener('pointerup', up); b.addEventListener('pointerleave', up); b.addEventListener('pointercancel', up); } };
  bind('#bSwap', () => action('swap')); bind('#bReload', () => action('reload')); bind('#bHeal', () => action('heal'));
  bind('#bPick', () => action('pick')); bind('#jump', () => action('jump')); bind('#bRev', () => setRev(true), () => setRev(false));

  function sampleInput() {
    const me = M.me$; if (!me || !me.ld || !me.al) return;
    const p = M.pred;
    let mvx = (keys.KeyD || keys.ArrowRight ? 1 : 0) - (keys.KeyA || keys.ArrowLeft ? 1 : 0), mvy = (keys.KeyS || keys.ArrowDown ? 1 : 0) - (keys.KeyW || keys.ArrowUp ? 1 : 0);
    if (stL.id !== null) { mvx = (stL.x - stL.ox) / 55; mvy = (stL.y - stL.oy) / 55; }
    const l = Math.hypot(mvx, mvy); if (l > 1) { mvx /= l; mvy /= l; }
    let fire = false;
    if (stR.id !== null) { const dx = stR.x - stR.ox, dy = stR.y - stR.oy; if (Math.hypot(dx, dy) > 14) { M.ang = Math.atan2(dy, dx); fire = Math.hypot(dx, dy) > 30; } }
    else if (!isTouch) { const z = M.cam.z; M.ang = Math.atan2(M.cam.y + (mouse.y - vh / 2) / z - p.y, M.cam.x + (mouse.x - vw / 2) / z - p.x); fire = mouse.down; }
    const i = { s: ++M.seq, mx: Math.round(mvx * 100) / 100, my: Math.round(mvy * 100) / 100, a: Math.round((M.ang || 0) * 1000) / 1000, f: fire ? 1 : 0 };
    send(Object.assign({ t: 'i' }, i));
    M.pending.push(i); if (M.pending.length > 90) M.pending.shift();
    SH.moveEnt(M.world, p, i.mx, i.my, STEP);
  }

  // ---------- interpolação ----------
  function lerpAng(a, b, t) { let d = b - a; while (d > Math.PI) d -= TAU; while (d < -Math.PI) d += TAU; return a + d * t; }
  function viewEnts() {
    const S = M.snaps; if (!S.length) return [];
    const rt = performance.now() - 110;
    let a = S[S.length - 1], b = a;
    for (let i = S.length - 1; i > 0; i--) if (S[i - 1].t <= rt) { a = S[i - 1]; b = S[i]; break; }
    const t = b === a ? 1 : clamp((rt - a.t) / (b.t - a.t), 0, 1);
    const out = [];
    for (const [id, eb] of b.e) {
      const ea = a.e.get(id) || eb;
      out.push({ id, x: ea[1] + (eb[1] - ea[1]) * t, y: ea[2] + (eb[2] - ea[2]) * t, ang: lerpAng(ea[3] / 100, eb[3] / 100, t), hp: eb[4], sh: eb[5], f: eb[6], wt: eb[7], wr: eb[8], rev: eb[9] / 40 });
    }
    return out;
  }
  const colorOf = id => id === (M && M.me) ? '#ffc23a' : (M && M.names[id] && M.names[id][1] === M.team) ? '#6fe0ff' : COLORS[id % COLORS.length];

  // ---------- desenho ----------
  const menuWorld = SH.genWorld(7);
  let menuT = 0;
  function drawWorld(w, cam, items, chests, time) {
    const z = cam.z, x0 = cam.x - vw / 2 / z, y0 = cam.y - vh / 2 / z, x1 = cam.x + vw / 2 / z, y1 = cam.y + vh / 2 / z;
    const inV = (x, y, m) => x > x0 - m && x < x1 + m && y > y0 - m && y < y1 + m;
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0); ctx.fillStyle = '#1a5a6b'; ctx.fillRect(0, 0, vw, vh);
    ctx.translate(vw / 2, vh / 2); ctx.scale(z, z); ctx.translate(-cam.x, -cam.y);
    ctx.fillStyle = '#e6d39a'; ctx.beginPath(); ctx.roundRect(-60, -60, W + 120, W + 120, 90); ctx.fill();
    ctx.fillStyle = '#6aa84f'; ctx.beginPath(); ctx.roundRect(0, 0, W, W, 60); ctx.fill();
    for (const d of w.decor) if (inV(d.x, d.y, d.r)) { ctx.fillStyle = d.c; ctx.globalAlpha = d.fl ? 1 : .35; ctx.beginPath(); ctx.arc(d.x, d.y, d.r, 0, TAU); ctx.fill(); }
    ctx.globalAlpha = 1;
    for (const h of w.houses) if (inV(h.x + h.w / 2, h.y + h.h / 2, 200)) { ctx.fillStyle = 'rgba(0,0,0,.18)'; ctx.fillRect(h.x + 8, h.y + 10, h.w, h.h); }
    w.chests.forEach((ch, i) => {
      if (!inV(ch.x, ch.y, 30)) return; const open = chests && chests.has(i);
      ctx.fillStyle = open ? '#6b4a2b' : '#a8722f'; ctx.fillRect(ch.x - 16, ch.y - 11, 32, 22);
      ctx.fillStyle = open ? '#3a2a18' : (ch.rare ? '#ffc23a' : '#e8c26a'); ctx.fillRect(ch.x - 16, ch.y - 3, 32, 4); ctx.fillRect(ch.x - 3, ch.y - 6, 6, 8);
      if (!open) { ctx.strokeStyle = 'rgba(255,220,120,' + (.4 + .3 * Math.sin(time * 4)) + ')'; ctx.lineWidth = 2; ctx.strokeRect(ch.x - 19, ch.y - 14, 38, 28); }
    });
    if (items) for (const it of items.values()) {
      if (!inV(it.x, it.y, 20)) continue;
      if (it.k === 'w') {
        const col = RAR[it.w.r].c; ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.beginPath(); ctx.arc(it.x, it.y, 15, 0, TAU); ctx.fill(); ctx.strokeStyle = col; ctx.lineWidth = 2.5; ctx.stroke();
        ctx.fillStyle = col; ctx.save(); ctx.translate(it.x, it.y); ctx.rotate(-.5); const L = it.w.t === 'sniper' ? 22 : it.w.t === 'pistola' ? 10 : 17; ctx.fillRect(-L / 2, -3, L, 6); ctx.restore();
      } else if (it.k === 'ammo') { ctx.fillStyle = '#c9b44a'; ctx.fillRect(it.x - 9, it.y - 7, 18, 14); ctx.fillStyle = '#6b5a12'; ctx.fillRect(it.x - 9, it.y - 1, 18, 2); }
      else if (it.k === 'med') { ctx.fillStyle = '#fff'; ctx.fillRect(it.x - 10, it.y - 10, 20, 20); ctx.fillStyle = '#e04545'; ctx.fillRect(it.x - 2.5, it.y - 7, 5, 14); ctx.fillRect(it.x - 7, it.y - 2.5, 14, 5); }
      else { ctx.fillStyle = '#47b8f2'; ctx.beginPath(); ctx.arc(it.x, it.y, 9, 0, TAU); ctx.fill(); ctx.fillStyle = '#bfe8ff'; ctx.fillRect(it.x - 3, it.y - 15, 6, 7); }
    }
    for (const r of w.rocks) if (inV(r.x, r.y, r.r)) { ctx.fillStyle = '#8d9496'; ctx.beginPath(); ctx.arc(r.x, r.y, r.r, 0, TAU); ctx.fill(); ctx.fillStyle = '#a9b0b2'; ctx.beginPath(); ctx.arc(r.x - r.r * .25, r.y - r.r * .25, r.r * .55, 0, TAU); ctx.fill(); }
    return inV;
  }
  function drawCanopy(w, inV, px, py) {
    for (const t of w.trees) if (inV(t.x, t.y, t.r * 1.6)) {
      ctx.fillStyle = 'rgba(0,0,0,.2)'; ctx.beginPath(); ctx.arc(t.x + 8, t.y + 10, t.r * 1.25, 0, TAU); ctx.fill();
      ctx.fillStyle = '#2f6b2c'; ctx.beginPath(); ctx.arc(t.x, t.y, t.r * 1.25 * t.sh, 0, TAU); ctx.fill();
      ctx.fillStyle = '#3f8a37'; ctx.beginPath(); ctx.arc(t.x - t.r * .25, t.y - t.r * .3, t.r * .75, 0, TAU); ctx.fill();
    }
    for (const b of w.bushes) if (inV(b.x, b.y, b.r)) {
      const inside = (b.x - px) ** 2 + (b.y - py) ** 2 < b.r * b.r; ctx.globalAlpha = inside ? .45 : .92; ctx.fillStyle = '#4f9a3e';
      ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, TAU); ctx.arc(b.x + b.r * .5, b.y - b.r * .3, b.r * .6, 0, TAU); ctx.fill(); ctx.globalAlpha = 1;
    }
    for (const h of w.houses) if (inV(h.x + h.w / 2, h.y + h.h / 2, 200)) {
      ctx.fillStyle = h.roof; ctx.fillRect(h.x, h.y, h.w, h.h); ctx.fillStyle = 'rgba(0,0,0,.18)'; ctx.fillRect(h.x, h.y + h.h / 2, h.w, h.h / 2);
      ctx.strokeStyle = 'rgba(0,0,0,.3)'; ctx.lineWidth = 3; ctx.strokeRect(h.x, h.y, h.w, h.h);
    }
  }

  function drawMatch(dt) {
    const me = M.me$, z = M.zone, p = M.pred, pl = M.plane;
    const planeX = pl.ax + (pl.bx - pl.ax) * M.planeT, planeY = pl.ay + (pl.by - pl.ay) * M.planeT;
    const ents = viewEnts();
    let tx = planeX, ty = planeY, tz = SC * .42;
    if (me && me.ld) {
      tz = SC;
      if (me.al) { tx = p.x; ty = p.y; }
      else { const v = ents.find(e => e.id === me.v); if (v) { tx = v.x; ty = v.y; } else { tx = M.cam.x; ty = M.cam.y; } }
    }
    const c = M.cam, follow = me && me.ld && me.al ? .35 : .12;
    c.x += (tx - c.x) * follow; c.y += (ty - c.y) * follow; c.z += (tz - c.z) * .06;
    const inV = drawWorld(M.world, c, M.items, M.chests, performance.now() / 1000);

    for (const e of ents) {
      if (!inV(e.x, e.y, 40)) continue;
      const isMe = e.id === M.me && me && me.al;
      const x = isMe ? p.x : e.x, y = isMe ? p.y : e.y, ang = isMe ? (M.ang || e.ang) : e.ang;
      const name = M.names[e.id] || ['?', -1, 0], mate = name[1] === M.team, downed = e.f & 1, para = e.f & 2;
      const pr = para ? 1.5 : 1, R0 = downed ? 13 : 17;
      if ((e.f & 32) && !mate) ctx.globalAlpha = .55;
      ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.beginPath(); ctx.arc(x + 4, y + 5, R0, 0, TAU); ctx.fill();
      if (e.wt >= 0 && !para && !downed) {
        ctx.save(); ctx.translate(x, y); ctx.rotate(ang); ctx.fillStyle = '#2b2f33'; const t = WK[e.wt], L = t === 'sniper' ? 34 : t === 'pistola' ? 20 : 28;
        ctx.fillRect(8, -3.5, L, 7); ctx.fillStyle = RAR[e.wr].c; ctx.fillRect(8, -3.5, 6, 7); ctx.restore();
      }
      ctx.fillStyle = (e.f & 8) ? '#fff' : colorOf(e.id); ctx.beginPath(); ctx.arc(x, y, R0 * pr, 0, TAU); ctx.fill();
      ctx.strokeStyle = mate ? '#ffffff' : 'rgba(0,0,0,.35)'; ctx.lineWidth = mate ? 2.5 : 2; ctx.stroke();
      ctx.fillStyle = 'rgba(0,0,0,.35)'; ctx.beginPath(); ctx.arc(x + Math.cos(ang) * 7, y + Math.sin(ang) * 7, 4, 0, TAU); ctx.fill();
      if (para) { ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x, y - 30 * pr, 26 * pr, Math.PI, TAU); ctx.stroke(); ctx.fillStyle = 'rgba(255,90,70,.75)'; ctx.fill(); }
      if (downed) {
        ctx.strokeStyle = '#ff5c5c'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(x, y, R0 + 6, 0, TAU); ctx.stroke();
        if (e.rev > 0) { ctx.strokeStyle = '#5fd26f'; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(x, y, R0 + 11, -Math.PI / 2, -Math.PI / 2 + TAU * clamp(e.rev, 0, 1)); ctx.stroke(); }
      }
      if (e.f & 4) { ctx.strokeStyle = '#5fd26f'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(x, y, R0 + 6, -Math.PI / 2, Math.PI); ctx.stroke(); }
      if (!isMe) {
        ctx.fillStyle = 'rgba(0,0,0,.5)'; ctx.fillRect(x - 20, y - R0 - 12, 40, 5);
        ctx.fillStyle = downed ? '#ff5c5c' : '#5fd26f'; ctx.fillRect(x - 20, y - R0 - 12, 40 * clamp(e.hp / 100, 0, 1), 5);
        if (e.sh > 0 && !downed) { ctx.fillStyle = '#47b8f2'; ctx.fillRect(x - 20, y - R0 - 17, 40 * e.sh / 100, 3); }
        ctx.fillStyle = mate ? '#6fe0ff' : 'rgba(255,255,255,.85)'; ctx.font = '600 11px "Chakra Petch",sans-serif'; ctx.textAlign = 'center'; ctx.fillText(name[0], x, y - R0 - 20);
      }
      ctx.globalAlpha = 1;
    }
    // balas (somente visual; quem decide o acerto é o servidor)
    ctx.lineCap = 'round';
    for (let i = M.bullets.length - 1; i >= 0; i--) {
      const b = M.bullets[i]; const nx = b.x + b.vx * dt, ny = b.y + b.vy * dt; b.life -= dt;
      let dead = b.life <= 0;
      if (!dead) for (const o of SH.query(M.world, Math.min(b.x, nx), Math.min(b.y, ny), Math.max(b.x, nx), Math.max(b.y, ny))) if (SH.blocked(o, nx, ny)) { dead = true; break; }
      b.x = nx; b.y = ny;
      if (dead) { M.bullets.splice(i, 1); continue; }
      ctx.strokeStyle = b.c; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(b.x, b.y); ctx.lineTo(b.x - b.vx * .018, b.y - b.vy * .018); ctx.stroke();
    }
    drawCanopy(M.world, inV, p.x, p.y);
    for (let i = M.fx.length - 1; i >= 0; i--) {
      const f = M.fx[i]; f.t -= dt; if (f.t <= 0) { M.fx.splice(i, 1); continue; }
      ctx.globalAlpha = clamp(f.t / .5, 0, 1);
      if (f.txt !== undefined) { f.y -= 30 * dt; ctx.fillStyle = '#fff'; ctx.font = '700 15px "Chakra Petch",sans-serif'; ctx.textAlign = 'center'; ctx.fillText(f.txt, f.x, f.y); }
      else { f.x += f.vx * dt; f.y += f.vy * dt; ctx.fillStyle = f.c; ctx.fillRect(f.x - 2, f.y - 2, 4, 4); }
    }
    ctx.globalAlpha = 1;
    // tempestade
    const zz = c.z, x0 = c.x - vw / 2 / zz, y0 = c.y - vh / 2 / zz;
    ctx.beginPath(); ctx.rect(x0 - 20, y0 - 20, vw / zz + 40, vh / zz + 40); ctx.arc(z[0], z[1], Math.max(.5, z[2]), 0, TAU);
    ctx.fillStyle = 'rgba(130,50,230,.3)'; ctx.fill('evenodd');
    ctx.strokeStyle = '#b67cff'; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(z[0], z[1], Math.max(.5, z[2]), 0, TAU); ctx.stroke();
    if (z[6] === 0) { ctx.setLineDash([18, 14]); ctx.strokeStyle = 'rgba(255,255,255,.7)'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(z[3], z[4], Math.max(.5, z[5]), 0, TAU); ctx.stroke(); ctx.setLineDash([]); }
    // avião
    if (M.planeT < 1) {
      ctx.save(); ctx.translate(planeX, planeY); ctx.rotate(pl.ang); ctx.fillStyle = 'rgba(0,0,0,.2)'; ctx.fillRect(-10, 32, 80, 16);
      ctx.fillStyle = '#eef1f3'; ctx.beginPath(); ctx.roundRect(-45, -9, 90, 18, 9); ctx.fill(); ctx.fillRect(-12, -55, 22, 110); ctx.fillRect(-44, -22, 12, 44);
      ctx.fillStyle = '#ffc23a'; ctx.fillRect(30, -6, 10, 12); ctx.restore();
      if (me && !me.ld) { ctx.setLineDash([30, 20]); ctx.strokeStyle = 'rgba(255,255,255,.4)'; ctx.lineWidth = 6; ctx.beginPath(); ctx.moveTo(planeX, planeY); ctx.lineTo(pl.bx, pl.by); ctx.stroke(); ctx.setLineDash([]); }
    }
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    for (const s of [stL, stR]) if (s.id !== null) {
      ctx.strokeStyle = 'rgba(255,255,255,.35)'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(s.ox, s.oy, 55, 0, TAU); ctx.stroke();
      const dx = s.x - s.ox, dy = s.y - s.oy, l = Math.min(55, Math.hypot(dx, dy)), a = Math.atan2(dy, dx);
      ctx.fillStyle = s === stR ? 'rgba(255,92,92,.55)' : 'rgba(255,255,255,.45)'; ctx.beginPath(); ctx.arc(s.ox + Math.cos(a) * l, s.oy + Math.sin(a) * l, 24, 0, TAU); ctx.fill();
    }
    if (me && me.al && (me.hp < 35 || me.dn)) { ctx.fillStyle = `rgba(255,40,40,${.12 + .08 * Math.sin(performance.now() / 160)})`; ctx.fillRect(0, 0, vw, vh); }
    M.ents = ents;
  }

  function drawMini() {
    const s = 240 / W; mx.setTransform(1, 0, 0, 1, 0, 0); mx.fillStyle = '#1a5a6b'; mx.fillRect(0, 0, 248, 248); mx.fillStyle = '#6aa84f'; mx.fillRect(4, 4, 240, 240);
    mx.setTransform(s, 0, 0, s, 4, 4);
    mx.fillStyle = '#8a6a52'; for (const h of M.world.houses) mx.fillRect(h.x, h.y, h.w, h.h);
    const z = M.zone;
    mx.beginPath(); mx.rect(0, 0, W, W); mx.arc(z[0], z[1], Math.max(1, z[2]), 0, TAU); mx.fillStyle = 'rgba(130,50,230,.45)'; mx.fill('evenodd');
    if (z[6] === 0) { mx.strokeStyle = '#fff'; mx.lineWidth = 18; mx.beginPath(); mx.arc(z[3], z[4], Math.max(1, z[5]), 0, TAU); mx.stroke(); }
    const pl = M.plane;
    if (M.planeT < 1) { mx.strokeStyle = 'rgba(255,255,255,.6)'; mx.lineWidth = 14; mx.beginPath(); mx.moveTo(pl.ax, pl.ay); mx.lineTo(pl.bx, pl.by); mx.stroke(); mx.fillStyle = '#fff'; mx.beginPath(); mx.arc(pl.ax + (pl.bx - pl.ax) * M.planeT, pl.ay + (pl.by - pl.ay) * M.planeT, 50, 0, TAU); mx.fill(); }
    for (const e of M.ents || []) {
      const n = M.names[e.id]; if (!n || n[1] !== M.team || e.id === M.me) continue;
      mx.fillStyle = '#6fe0ff'; mx.beginPath(); mx.arc(e.x, e.y, 50, 0, TAU); mx.fill();
    }
    if (M.me$ && M.me$.ld && M.me$.al) { mx.fillStyle = '#ffc23a'; mx.beginPath(); mx.arc(M.pred.x, M.pred.y, 60, 0, TAU); mx.fill(); mx.strokeStyle = '#1b1404'; mx.lineWidth = 14; mx.stroke(); }
  }

  function hud() {
    const me = M.me$; if (!me) return;
    $('#alive').textContent = M.alive; $('#teamsLeft').textContent = M.tl; $('#kills').textContent = me.k;
    $('#ping').textContent = M.lastSnap && performance.now() - M.lastSnap > 1500 ? 'conexão instável' : '';
    const z = M.zone, zc = $('#zoneChip');
    if (z[6] === 3 && !me.ld) { $('#zoneLbl').textContent = 'Salto'; $('#zoneT').textContent = fmtT((1 - M.planeT) * M.plane.dur); zc.classList.add('warn'); }
    else if (z[6] === 3) { $('#zoneLbl').textContent = 'Zona fecha em'; $('#zoneT').textContent = fmtT((1 - M.planeT) * M.plane.dur + SH.PH[0].w); zc.classList.remove('warn'); }
    else if (z[6] === 0) { $('#zoneLbl').textContent = 'Zona fecha em'; $('#zoneT').textContent = fmtT(z[7]); zc.classList.toggle('warn', z[7] < 10); }
    else if (z[6] === 1) { $('#zoneLbl').textContent = 'Fechando'; $('#zoneT').textContent = fmtT(z[7]); zc.classList.add('warn'); }
    else { $('#zoneLbl').textContent = 'Zona'; $('#zoneT').textContent = 'final'; }
    $('#hpb i').style.width = clamp(me.hp, 0, 100) + '%'; $('#hpb').classList.toggle('down', !!me.dn); $('#shb i').style.width = me.sh + '%';
    for (let i = 0; i < 2; i++) {
      const w = me.w[i], el = $('#s' + i); el.classList.toggle('on', i === me.cur);
      el.innerHTML = w ? `<span style="color:${RAR[w[1]].c}">${WEAP[WK[w[0]]].n}</span><b>${i === me.cur && me.rl ? '···' : w[2]}<small> / ${me.am}</small></b>` : '<span style="color:var(--muted)">vazio</span>';
    }
    $('#bHeal').innerHTML = `Curar (${me.md})<kbd>H</kbd>`;
    // arma no chão por perto (com as duas mãos ocupadas) e companheiro caído por perto
    M.nearW = null; M.nearDown = null;
    if (me.al && !me.dn) {
      if (me.w[0] && me.w[1]) { let bd = 45 * 45; for (const it of M.items.values()) { if (it.k !== 'w') continue; const d = (it.x - M.pred.x) ** 2 + (it.y - M.pred.y) ** 2; if (d < bd) { bd = d; M.nearW = it; } } }
      for (const e of M.ents || []) { const n = M.names[e.id]; if (e.id !== M.me && n && n[1] === M.team && (e.f & 1) && Math.hypot(e.x - M.pred.x, e.y - M.pred.y) < 55) M.nearDown = e; }
    }
    const b = $('#bPick'); if (M.nearW) { b.hidden = false; b.innerHTML = `Pegar ${WEAP[M.nearW.w.t].n} ${RAR[M.nearW.w.r].n.toLowerCase()}<kbd>E</kbd>`; } else b.hidden = true;
    $('#bRev').hidden = !M.nearDown;
    if (!M.nearDown && M.rev) setRev(false);
    // painel do time
    if (MODES[M.mode].size > 1) {
      const vis = new Map((M.ents || []).map(e => [e.id, e]));
      $('#mates').innerHTML = M.names.map((n, id) => [n, id]).filter(([n, id]) => n[1] === M.team && id !== M.me).map(([n, id]) => {
        const e = vis.get(id); const dead = !e; const down = e && (e.f & 1);
        return `<div class="mate ${dead ? 'dead' : down ? 'down' : ''}"><div class="n"><span>${esc(n[0])}${n[2] ? ' (bot)' : ''}</span><span>${dead ? 'fora' : down ? 'caído' : ''}</span></div><div class="hb"><i style="width:${dead ? 0 : clamp(e.hp, 0, 100)}%"></i></div></div>`;
      }).join('');
    } else $('#mates').innerHTML = '';
    for (const f of M.feed) f.ttl -= .1;
    if (M.feed.length && M.feed[M.feed.length - 1].ttl < 0) { M.feed.pop(); renderFeed(); }
  }

  // ---------- laço principal ----------
  let last = performance.now(), hudT = 0, mmT = 0;
  function loop(now) {
    const dt = Math.min(.05, (now - last) / 1000); last = now;
    if (M) {
      M.inputAcc += dt;
      let n = 0; while (M.inputAcc >= STEP && n < 4) { M.inputAcc -= STEP; sampleInput(); n++; }
      if (M.inputAcc > STEP) M.inputAcc = 0;
      drawMatch(dt);
      hudT -= dt; if (hudT <= 0) { hudT = .1; hud(); }
      mmT -= dt; if (mmT <= 0) { mmT = .2; drawMini(); }
    } else {
      menuT += dt * 12;
      const inV = drawWorld(menuWorld, { x: 900 + menuT % 2400, y: 1400 + Math.sin(menuT / 300) * 400, z: SC * .8 }, null, null, now / 1000);
      drawCanopy(menuWorld, inV, -999, -999);
      ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    }
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);
  boot();
})();
