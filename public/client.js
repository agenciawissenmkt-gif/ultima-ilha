// Cliente do Última Ilha (3D): login, lobby, rede, previsão de movimento, câmera em terceira pessoa e desenho com three.js.
(() => {
  const $ = s => document.querySelector(s);
  const { W, N, WEAP, WK, RAR, MODES, SCOPES, clamp } = SH;
  const TAU = Math.PI * 2, STEP = 1 / SH.TICK;
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { v === null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch (e) { } }
  };
  const fmtT = s => { s = Math.max(0, Math.ceil(s)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const isTouch = matchMedia('(pointer:coarse)').matches || 'ontouchstart' in window;

  // ---------- configurações ----------
  const SENS = [['geral', 'Geral (sem mirar)'], ['ponto', 'Ponto vermelho'], ['x2', 'Mira 2x'], ['x4', 'Mira 4x'], ['x8', 'Sniper (8x)']];
  let conf = { sens: { geral: 50, ponto: 45, x2: 40, x4: 35, x8: 30 }, graf: isTouch ? 'baixo' : 'medio', adsHold: false, assist: true, look: { s: 'soldado', c: 0 } };
  try { const c = JSON.parse(store.get('ui-conf') || 'null'); if (c && c.sens) conf = Object.assign(conf, c, { sens: Object.assign(conf.sens, c.sens) }); } catch (e) { }
  function renderSettings() {
    $('#sensList').innerHTML = SENS.map(([k, n]) => `<label for="s_${k}">${n}<output id="o_${k}">${conf.sens[k]}</output><input type="range" id="s_${k}" min="1" max="100" value="${conf.sens[k]}" data-k="${k}"></label>`).join('');
    $('#graf').value = conf.graf; $('#adsHold').checked = conf.adsHold; $('#assist').checked = conf.assist;
  }
  $('#sensList').addEventListener('input', e => { const k = e.target.dataset.k; if (!k) return; conf.sens[k] = +e.target.value; $('#o_' + k).textContent = e.target.value; });
  function openSettings() { if (document.pointerLockElement) document.exitPointerLock(); renderSettings(); $('#settings').hidden = false; }
  document.querySelectorAll('[data-open-settings]').forEach(b => b.addEventListener('click', openSettings));
  $('#closeSettings').addEventListener('click', () => {
    conf.graf = $('#graf').value; conf.adsHold = $('#adsHold').checked; conf.assist = $('#assist').checked; store.set('ui-conf', JSON.stringify(conf));
    $('#settings').hidden = true; applyGraphics();
  });

  // ---------- três: cena (detalhes em gfx.js) ----------
  const cv = $('#c');
  const GX = GFX.create(cv, conf);
  const { renderer, scene, camera } = GX;
  let vw = innerWidth, vh = innerHeight;
  function applyGraphics() { GX.applyGraphics(conf); vw = innerWidth; vh = innerHeight; }
  addEventListener('resize', () => { GX.resize(); vw = innerWidth; vh = innerHeight; });
  const box = new THREE.BoxGeometry(1, 1, 1);
  const lam = c => new THREE.MeshStandardMaterial({ color: c, roughness: .8 });
  const buildWorld = w => GX.buildWorld(w);
  const makeItem = it => GX.makeItem(it);

  // ---------- conexão ----------
  let cfg = { googleClientId: '', dev: false }, ws = null, authed = false, user = null, stats = null, party = null, queue = null, retry = 0, kicked = false;
  let M = null;
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
      else if (!authed) screen('login');
    };
  }
  const send = o => { if (ws && ws.readyState === 1) ws.send(JSON.stringify(o)); };
  let toastT = 0;
  function toast(t) { const el = $('#toast'); el.textContent = t; el.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(() => el.classList.remove('show'), 3200); }
  function screen(name) {
    $('#login').hidden = name !== 'login'; $('#lobby').hidden = name !== 'lobby'; $('#hud').hidden = name !== 'game';
    if (name !== 'game') { $('#result').hidden = true; $('#bigmap').hidden = true; if (document.pointerLockElement) document.exitPointerLock(); }
  }
  function onMsg(m) {
    switch (m.t) {
      case 'auth':
        if (!m.ok) { authed = false; store.set('ui-session', null); $('#loginMsg').textContent = m.msg; screen('login'); return; }
        authed = true; retry = 0; $('#conn').hidden = true;
        store.set('ui-session', m.session); user = m.user; stats = m.stats; if (m.look) { conf.look = m.look; store.set('ui-conf', JSON.stringify(conf)); } renderMe(); renderLook(); if (!M) screen('lobby');
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

  // ---------- visual do personagem (skin e calça) ----------
  const preview = GX.makePreview($('#preview'));
  function renderLook() {
    const L = conf.look || { s: 'soldado', c: 0 };
    $('#skins').innerHTML = Object.entries(SH.SKINS).map(([k, n]) => `<button class="btn ${L.s === k ? 'on' : ''}" data-skin="${k}">${n}</button>`).join('');
    $('#pants').innerHTML = SH.PANTS.map((c, i) => `<button class="sw ${L.c === i ? 'on' : ''}" data-pants="${i}" style="background:#${c.toString(16).padStart(6, '0')}" aria-label="Calça ${i + 1}"></button>`).join('');
    preview.set(L);
  }
  function setLook(L) { conf.look = L; store.set('ui-conf', JSON.stringify(conf)); send({ t: 'skin', s: L.s, c: L.c }); renderLook(); }
  $('#skins').addEventListener('click', e => { const b = e.target.closest('[data-skin]'); if (b) setLook({ s: b.dataset.skin, c: (conf.look || {}).c | 0 }); });
  $('#pants').addEventListener('click', e => { const b = e.target.closest('[data-pants]'); if (b) setLook({ s: (conf.look || {}).s || 'soldado', c: +b.dataset.pants }); });
  renderLook();

  // ---------- lobby ----------
  function avatar(pic) { return pic ? `<img src="${esc(pic)}" alt="" referrerpolicy="no-referrer">` : '<span class="ph"></span>'; }
  function renderMe() {
    if (!user) return;
    $('#meName').textContent = user.name;
    const a = $('#meAvatar'); if (user.pic) { a.src = user.pic; a.referrerPolicy = 'no-referrer'; } else a.removeAttribute('src');
    if (stats) $('#meStats').textContent = `${stats.matches} partidas · ${stats.wins} vitórias · ${stats.kills} abates`;
  }
  function renderParty() {
    if (!party || !user) return;
    const leader = party.leader === user.id, n = party.members.length;
    $('#partyCode').textContent = party.code;
    $('#members').innerHTML = party.members.map(p => `<li>${avatar(p.pic)}<span class="nm">${esc(p.name)}${p.id === user.id ? ' (você)' : ''}</span>
      ${p.id === party.leader ? '<span class="tag">Líder</span>' : ''}${!p.online ? '<span class="off">offline</span>' : p.inMatch ? '<span class="off">em partida</span>' : ''}
      ${leader && p.id !== user.id && !party.queued ? `<button class="btn ghost kick" data-kick="${esc(p.id)}">Remover</button>` : ''}</li>`).join('');
    $('#leaveParty').hidden = n < 2;
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
  let AC = null, noise = null;
  function initAudio() {
    try {
      AC = AC || new (window.AudioContext || window.webkitAudioContext)(); AC.resume();
      if (!noise) { noise = AC.createBuffer(1, AC.sampleRate * .3, AC.sampleRate); const d = noise.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 3); }
    } catch (e) { AC = null; }
  }
  function shot(vol, freq) {
    if (!AC || !noise || vol < .01) return;
    const s = AC.createBufferSource(), f = AC.createBiquadFilter(), g = AC.createGain();
    s.buffer = noise; f.type = 'lowpass'; f.frequency.value = freq; g.gain.value = vol;
    s.connect(f).connect(g).connect(AC.destination); s.start();
  }
  function beep(fq, d, v = .04) {
    if (!AC) return; const o = AC.createOscillator(), g = AC.createGain(); o.type = 'triangle'; o.frequency.value = fq; g.gain.value = v;
    g.gain.exponentialRampToValueAtTime(.0001, AC.currentTime + d); o.connect(g).connect(AC.destination); o.start(); o.stop(AC.currentTime + d);
  }

  // ---------- partida ----------
  const unpackItem = a => ({ id: a[0], x: a[1], y: a[2], z: a[3], k: a[4], w: a[5] >= 0 ? { t: WK[a[5]], r: a[6] } : null, n: a[7] });
  function startMatch(m) {
    if (M) cleanupMatch();
    const world = SH.genWorld(m.seed);
    buildWorld(world);
    const items = new Map();
    for (const a of m.items) { const it = unpackItem(a); it.mesh = makeItem(it); items.set(it.id, it); }
    M = {
      id: m.id, me: m.me, team: m.team, names: m.names, mode: m.mode, world, items, chests: new Set(m.chests),
      plane: m.plane, planeT: 0, snaps: [], tracers: [], feed: [], chars: new Map(),
      pred: { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, onG: false, fly: 0, crouch: false }, pending: [], seq: 0,
      me$: null, zone: [W / 2, W / 2, W * .75, W / 2, W / 2, 0, 3, 0], alive: 0, tl: m.totalTeams,
      yaw: 0, pitch: -.15, ads: false, crouch: false, jumpQ: false, inputAcc: 0, lastSnap: 0, result: null, nearW: null, nearDown: null, rev: false,
      camPos: new THREE.Vector3(W / 2, 300, W / 2), shake: 0
    };
    for (const i of m.chests) GX.setChestOpen(i);
    M.planeMesh = makePlane(); M.storm = makeStorm();
    screen('game'); $('#result').hidden = true; $('#feed').innerHTML = ''; $('#leaveMatch').hidden = true;
    $('#jump').hidden = false; $('#bottom').hidden = true; $('#touch').hidden = !isTouch;
    drawMinimapBase();
    msg(isTouch ? 'Toque em SALTAR para pular do avião' : 'Aperte Espaço para saltar do avião', 3);
  }
  function cleanupMatch() {
    if (!M) return;
    for (const ch of M.chars.values()) scene.remove(ch);
    for (const it of M.items.values()) scene.remove(it.mesh);
    for (const t of M.tracers) scene.remove(t.line);
    scene.remove(M.planeMesh, M.storm);
  }
  function endMatch() { cleanupMatch(); M = null; screen(authed ? 'lobby' : 'login'); renderParty(); setupMenuScene(); }
  function makePlane() {
    const g = new THREE.Group(), m = lam(0xeef1f3);
    const f = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.6, 16, 10), m); f.rotation.x = Math.PI / 2;
    const wg = new THREE.Mesh(box, m); wg.scale.set(22, .3, 3);
    const tl = new THREE.Mesh(box, lam(0xffc23a)); tl.scale.set(.3, 3, 2.5); tl.position.set(0, 2, 7);
    g.add(f, wg, tl); scene.add(g); return g;
  }
  function makeStorm() {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 1, 96, 1, true), new THREE.MeshBasicMaterial({ color: 0x9b4dff, transparent: true, opacity: .2, side: THREE.DoubleSide, depthWrite: false, fog: false }));
    scene.add(m); return m;
  }

  function matchMsg(m) {
    switch (m.t) {
      case 's': onSnap(m); break;
      case 'ia': for (const a of m.it) { const it = unpackItem(a); const old = M.items.get(it.id); if (old) scene.remove(old.mesh); it.mesh = makeItem(it); M.items.set(it.id, it); } break;
      case 'ir': for (const id of m.ids) { const it = M.items.get(id); if (it) { scene.remove(it.mesh); M.items.delete(id); } } break;
      case 'co': M.chests.add(m.i); GX.setChestOpen(m.i); break;
      case 'f': {
        const mine = m.ids.some(id => id === M.me || (M.names[id] && M.names[id][1] === M.team));
        M.feed.unshift({ t: m.s, me: mine, ttl: 6 }); M.feed = M.feed.slice(0, 5); renderFeed(); break;
      }
      case 'd': {
        const hm = $('#hitmark'), dn = $('#dmgnum');
        hm.classList.toggle('head', !!m.h); dn.classList.toggle('head', !!m.h); dn.textContent = m.n;
        hm.classList.add('on'); dn.classList.add('on'); setTimeout(() => { hm.classList.remove('on'); dn.classList.remove('on'); }, 120);
        beep(m.h ? 1100 : 760, .05, .04); break;
      }
      case 'hit': {
        if (!M.me$) break;
        const a = Math.atan2(-(m.x - M.pred.x), -(m.z - M.pred.z)) - M.yaw;
        const el = $('#dmgdir'); el.style.transform = `rotate(${-a}rad)`; el.classList.add('on'); setTimeout(() => el.classList.remove('on'), 80);
        M.shake = .15; break;
      }
      case 'x': break;
      case 'r': showResult(m); break;
    }
  }
  function renderFeed() { $('#feed').innerHTML = M.feed.map(f => `<div class="${f.me ? 'me' : ''}">${esc(f.t)}</div>`).join(''); }

  function onSnap(s) {
    const now = performance.now();
    M.lastSnap = now;
    const ents = new Map(); for (const e of s.e) ents.set(e[0], e);
    M.snaps.push({ t: now, e: ents }); if (M.snaps.length > 30) M.snaps.shift();
    const me = s.me, wasLanded = M.me$ && M.me$.ld;
    M.me$ = me; M.zone = s.z; M.planeT = s.pl; M.alive = s.al; M.tl = s.tl;
    // reconciliação com o servidor
    const p = M.pred;
    Object.assign(p, { x: me.x, y: me.y, z: me.z, vx: me.vx, vy: me.vy, vz: me.vz, onG: !!me.og, fly: me.fl, crouch: !!me.cr, prone: !!me.pr, slideT: me.st, sdx: me.sdx, sdz: me.sdz, prevC: !!me.pc, wasSprint: !!me.ws, downed: !!me.dn, healT: me.hl });
    M.pending = M.pending.filter(i => i.s > s.ack);
    if (me.ld && me.al) for (const i of M.pending) SH.step(M.world, p, i, STEP);
    if (me.ld && !wasLanded) { $('#jump').hidden = true; $('#bottom').hidden = false; msg('Desça perto das casas: os baús têm armas melhores'); }
    if (!me.al && !M.result) { $('#bottom').hidden = true; $('#leaveMatch').hidden = false; M.ads = false; }
    if (me.dn) M.ads = false;
    // traçantes e sons de tiro
    for (const t of s.tr) {
      const mine = t[7] === M.me;
      addTracer(t, mine);
      const d = Math.hypot(t[0] - p.x, t[2] - p.z);
      if (mine) { recoil(); GX.kick(); shot(.35, 2400); } else shot(Math.max(0, .25 - d / 500), d < 60 ? 2000 : 900);
      if (d < 150) { const o = mine ? muzzle() : [t[0], t[1], t[2]]; GX.muzzle(o[0], o[1], o[2], mine); }
    }
  }
  function addTracer(t, mine) {
    const g = new THREE.BufferGeometry();
    const o = mine && M.me$ ? muzzle() : [t[0], t[1], t[2]];
    g.setAttribute('position', new THREE.Float32BufferAttribute([o[0], o[1], o[2], t[3], t[4], t[5]], 3));
    const line = new THREE.Line(g, new THREE.LineBasicMaterial({ color: new THREE.Color(RAR[t[6]].c).lerp(new THREE.Color(0xfff3b0), .5), transparent: true, opacity: .9 }));
    scene.add(line); M.tracers.push({ line, life: .09 });
  }
  function muzzle() {
    const p = M.pred, eye = (p.crouch || p.downed) ? SH.EYE_C : SH.EYE, r = [Math.cos(M.yaw), -Math.sin(M.yaw)], d = SH.dirOf(M.yaw, M.pitch);
    return [p.x + r[0] * .22 + d[0] * .9, p.y + eye - .2 + d[1] * .9, p.z + r[1] * .22 + d[2] * .9];
  }
  const RECOIL = { pistola: .012, smg: .006, escopeta: .035, fuzil: .009, sniper: .05 };
  function recoil() {
    const me = M.me$, w = me && me.w[me.cur]; if (!w) return;
    const k = RECOIL[WK[w[0]]] * (M.ads ? .55 : 1) * (M.crouch ? .75 : 1);
    M.pitch = clamp(M.pitch + k, -1.45, 1.45); M.yaw += (Math.random() - .5) * k * .5;
  }

  function showResult(r) {
    M.result = r;
    $('#resT').textContent = r.win ? 'Booyah! Último time de pé' : 'Seu time foi eliminado';
    $('#resP').textContent = r.win ? 'A ilha é de vocês.' : `Vocês ficaram em #${r.rank} de ${r.totalTeams} times.`;
    $('#resRank').textContent = '#' + r.rank; $('#resKills').textContent = r.kills; $('#resTeamKills').textContent = r.teamKills;
    $('#bottom').hidden = true;
    setTimeout(() => { if (M && M.result === r) { if (document.pointerLockElement) document.exitPointerLock(); $('#result').hidden = false; } }, r.win ? 600 : 1200);
  }
  $('#resLobby').addEventListener('click', () => { send({ t: 'leaveMatch' }); endMatch(); });
  $('#leaveMatch').addEventListener('click', () => { send({ t: 'leaveMatch' }); endMatch(); });
  $('#resWatch').addEventListener('click', () => { $('#result').hidden = true; $('#leaveMatch').hidden = false; });
  let msgT = 0;
  function msg(t, d = 2.6) { const el = $('#msg'); el.textContent = t; el.classList.add('show'); clearTimeout(msgT); msgT = setTimeout(() => el.classList.remove('show'), d * 1000); }

  // ---------- entrada ----------
  const keys = {}; let mouseDown = false, adsHeld = false;
  const typing = () => document.activeElement && ['INPUT', 'SELECT'].includes(document.activeElement.tagName);
  const scopeNow = () => {
    const me = M && M.me$; if (!me || !M.ads) return 'hip';
    const w = me.w[me.cur]; return w ? SH.scopeFor(WK[w[0]], me.sc) : 'ponto';
  };
  const SENS_KEY = { hip: 'geral', ponto: 'ponto', x2: 'x2', x4: 'x4', x8: 'x8' };
  function look(dx, dy, base) {
    if (!M) return;
    const sc = scopeNow(), k = base * (conf.sens[SENS_KEY[sc]] / 50) * (SCOPES[sc].fov / 70) ** .9 * (M.stick ? .6 : 1);
    M.yaw -= dx * k; M.pitch = clamp(M.pitch - dy * k, -1.45, 1.45);
  }
  addEventListener('keydown', e => {
    if (typing()) return;
    if (M && ['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(e.code)) e.preventDefault();
    if (keys[e.code]) return; keys[e.code] = true; if (M) onKey(e.code);
  });
  addEventListener('keyup', e => { keys[e.code] = false; if (M && e.code === 'KeyF') setRev(false); });
  addEventListener('blur', () => { for (const k in keys) keys[k] = false; mouseDown = false; if (M) setRev(false); });
  cv.addEventListener('click', () => {
    if (!M || isTouch) return; initAudio();
    if (!document.pointerLockElement && $('#settings').hidden && $('#bigmap').hidden && $('#result').hidden) cv.requestPointerLock && cv.requestPointerLock();
  });
  document.addEventListener('pointerlockchange', () => { if (M) $('#lockHint').hidden = !!document.pointerLockElement || isTouch; });
  document.addEventListener('mousemove', e => { if (M && document.pointerLockElement === cv) look(e.movementX, e.movementY, .0022); });
  cv.addEventListener('mousedown', e => {
    if (!M || document.pointerLockElement !== cv) return;
    if (e.button === 0) { mouseDown = true; if (M.me$ && !M.me$.ld) action('jump'); }
    if (e.button === 2) { if (conf.adsHold) { adsHeld = true; M.ads = true; } else M.ads = !M.ads; }
  });
  addEventListener('mouseup', e => { if (e.button === 0) mouseDown = false; if (e.button === 2 && conf.adsHold && M) { adsHeld = false; M.ads = false; } });
  cv.addEventListener('contextmenu', e => e.preventDefault());
  function action(k, extra) { send(Object.assign({ t: 'a', k }, extra)); }
  function setRev(on) { if (!M || M.rev === on) return; M.rev = on; action('rev', { on: on ? 1 : 0 }); }
  function onKey(c) {
    if (c === 'Space') { if (M.me$ && !M.me$.ld) action('jump'); else if (M.crouch || M.prone) { M.crouch = M.prone = false; } else M.jumpQ = true; }
    if (c === 'KeyC') { M.crouch = !M.crouch; M.prone = false; }
    if (c === 'KeyZ') { M.prone = !M.prone; M.crouch = false; }
    if (c === 'Digit3') action('w2');
    if (c === 'KeyQ') action('swap'); if (c === 'Digit1') action('w0'); if (c === 'Digit2') action('w1');
    if (c === 'KeyR') action('reload'); if (c === 'KeyH') action('heal'); if (c === 'KeyE') action('pick');
    if (c === 'KeyF') setRev(true);
    if (c === 'KeyM') toggleMap();
  }
  const bind = (id, down, up) => { const b = $(id); b.addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); down(); }); if (up) { b.addEventListener('pointerup', up); b.addEventListener('pointercancel', up); } };
  bind('#bSwap', () => action('swap')); bind('#bReload', () => action('reload')); bind('#bHeal', () => action('heal'));
  bind('#bPick', () => action('pick')); bind('#jump', () => { initAudio(); action('jump'); }); bind('#bRev', () => setRev(true), () => setRev(false));

  // toque: joystick à esquerda, arrastar à direita para olhar, botões estilo Free Fire
  const joy = { id: null, ox: 0, oy: 0, x: 0, y: 0 }, lk = { id: null, x: 0, y: 0 };
  let touchFire = false;
  cv.addEventListener('touchstart', e => {
    if (!M) return; e.preventDefault(); initAudio();
    for (const t of e.changedTouches) {
      if (t.clientX < vw * .42 && joy.id === null) { joy.id = t.identifier; joy.ox = joy.x = t.clientX; joy.oy = joy.y = t.clientY; }
      else if (lk.id === null) { lk.id = t.identifier; lk.x = t.clientX; lk.y = t.clientY; }
    }
  }, { passive: false });
  cv.addEventListener('touchmove', e => {
    e.preventDefault();
    for (const t of e.changedTouches) {
      if (t.identifier === joy.id) { joy.x = t.clientX; joy.y = t.clientY; }
      if (t.identifier === lk.id) { look(t.clientX - lk.x, t.clientY - lk.y, .0045); lk.x = t.clientX; lk.y = t.clientY; }
    }
  }, { passive: false });
  const tEnd = e => { for (const t of e.changedTouches) { if (t.identifier === joy.id) joy.id = null; if (t.identifier === lk.id) lk.id = null; } };
  cv.addEventListener('touchend', tEnd); cv.addEventListener('touchcancel', tEnd);
  for (const id of ['#tFire', '#tFire2']) {
    const b = $(id); let px = 0, py = 0;
    b.addEventListener('pointerdown', e => { e.preventDefault(); b.setPointerCapture(e.pointerId); px = e.clientX; py = e.clientY; touchFire = true; b.classList.add('on'); });
    b.addEventListener('pointermove', e => { if (!touchFire) return; look(e.clientX - px, e.clientY - py, .0045); px = e.clientX; py = e.clientY; });
    const up = () => { touchFire = false; b.classList.remove('on'); };
    b.addEventListener('pointerup', up); b.addEventListener('pointercancel', up);
  }
  bind('#tAds', () => { M.ads = !M.ads; });
  bind('#tJump', () => { if (M.me$ && !M.me$.ld) action('jump'); else M.jumpQ = true; });
  bind('#tCrouch', () => { M.crouch = !M.crouch; M.prone = false; });
  bind('#tProne', () => { M.prone = !M.prone; M.crouch = false; });
  bind('#tSprint', () => { M.sprintLock = !M.sprintLock; });
  bind('#bCrouch', () => { M.crouch = !M.crouch; M.prone = false; });
  bind('#bProne', () => { M.prone = !M.prone; M.crouch = false; });
  for (let k = 0; k < 3; k++) bind('#s' + k, () => action('w' + k));

  // assistência de mira: gruda no inimigo perto da mira e, atirando, puxa do peito para a cabeça
  function aimAssist(fire, me) {
    M.stick = false;
    if (!conf.assist || !me.al || me.dn || M.pred.fly || !(fire || M.ads)) { M.pull = 0; M.assistId = -1; return; }
    const w = me.w[me.cur]; const range = w ? WEAP[WK[w[0]]].range : 2.5;
    const cp = camera.position, sc = scopeNow(), cone = (M.ads ? .1 : .14) * (SCOPES[sc].fov / 70) + .02;
    const fwd = SH.dirOf(M.yaw, M.pitch);
    let best = null, ba = cone;
    for (const e of M.ents || []) {
      const n = M.names[e.id]; if (!n || n[1] === M.team || e.id === M.me || (e.f & 2)) continue;
      const k = (e.f & 256) ? .26 : (e.f & (1 | 16)) ? .62 : 1;
      const cx = e.x, cy = e.y + 1.2 * k, cz = e.z, dx = cx - cp.x, dy = cy - cp.y, dz = cz - cp.z, d = Math.hypot(dx, dy, dz);
      if (d > range || d < .5) continue;
      const a = Math.acos(clamp((dx * fwd[0] + dy * fwd[1] + dz * fwd[2]) / d, -1, 1));
      if (a < ba && SH.rayHit(M.world, cp.x, cp.y, cp.z, dx / d, dy / d, dz / d, d) >= d - .6) { ba = a; best = { e, k, d }; }
    }
    if (!best) { M.pull = 0; M.assistId = -1; return; }
    if (best.e.id !== M.assistId) { M.assistId = best.e.id; M.pull = 0; }
    M.pull = fire ? Math.min(1, (M.pull || 0) + STEP * 2.2) : Math.max(0, (M.pull || 0) - STEP * 2);
    const e = best.e, ty = e.y + (1.2 + (1.62 - 1.2) * M.pull) * best.k;
    const dx = e.x - cp.x, dy = ty - cp.y, dz = e.z - cp.z, h = Math.hypot(dx, dz);
    const tYaw = Math.atan2(-dx, -dz), tPitch = Math.atan2(dy, h);
    let dyaw = tYaw - M.yaw; while (dyaw > Math.PI) dyaw -= TAU; while (dyaw < -Math.PI) dyaw += TAU;
    const str = (M.ads ? .2 : .14) * (fire ? 1.3 : 1);
    M.yaw += dyaw * str; M.pitch = clamp(M.pitch + (tPitch - M.pitch) * str, -1.45, 1.45);
    M.stick = true;
  }

  function sampleInput() {
    const me = M.me$; if (!me || !me.ld || !me.al) { M.jumpQ = false; return; }
    let mx = (keys.KeyD || keys.ArrowRight ? 1 : 0) - (keys.KeyA || keys.ArrowLeft ? 1 : 0), mz = (keys.KeyW || keys.ArrowUp ? 1 : 0) - (keys.KeyS || keys.ArrowDown ? 1 : 0);
    let sprint = !!(keys.ShiftLeft || keys.ShiftRight || keys.ControlLeft || keys.ControlRight);
    if (joy.id !== null) {
      mx = (joy.x - joy.ox) / 50; mz = -(joy.y - joy.oy) / 50; const l = Math.hypot(mx, mz);
      if (l > 1) { mx /= l; mz /= l; } sprint = (l > 1.15 || M.sprintLock) && mz > .6;
    }
    if (me.dn) M.ads = false;
    if (M.sprintLock && joy.id === null && mz > .5) sprint = true;
    const fire = (mouseDown && document.pointerLockElement === cv) || touchFire;
    aimAssist(fire, me);
    // a mira (centro da tela) define para onde o tiro vai: calcula o ponto que a câmera enxerga e o ângulo a partir dos olhos
    let ay = M.yaw, ap = M.pitch;
    if (fire || M.ads) {
      const d = SH.dirOf(M.yaw, M.pitch), cp = camera.position;
      let t = SH.rayHit(M.world, cp.x, cp.y, cp.z, d[0], d[1], d[2], 400);
      const tx = cp.x + d[0] * t, ty = cp.y + d[1] * t, tz = cp.z + d[2] * t;
      const ex = M.pred.x, ey = M.pred.y + SH.eyeOf(Object.assign({}, M.pred, { downed: !!me.dn })), ez = M.pred.z;
      const dx = tx - ex, dy = ty - ey, dz = tz - ez, h = Math.hypot(dx, dz);
      if (h > 2) { ay = Math.atan2(-dx, -dz); ap = Math.atan2(dy, h); }
    }
    const i = {
      s: ++M.seq, mx: Math.round(mx * 100) / 100, mz: Math.round(mz * 100) / 100, yaw: Math.round(M.yaw * 1e4) / 1e4, ay: Math.round(ay * 1e4) / 1e4, pitch: Math.round(ap * 1e4) / 1e4,
      j: M.jumpQ ? 1 : 0, c: M.crouch ? 1 : 0, p: M.prone ? 1 : 0, h: me.cur === 2 ? 1 : 0, sp: sprint ? 1 : 0, ads: M.ads ? 1 : 0, f: fire ? 1 : 0
    };
    M.jumpQ = false;
    send(Object.assign({ t: 'i' }, i));
    M.pending.push(i); if (M.pending.length > 90) M.pending.shift();
    SH.step(M.world, M.pred, i, STEP);
  }

  // ---------- interpolação ----------
  function lerpAng(a, b, t) { let d = b - a; while (d > Math.PI) d -= TAU; while (d < -Math.PI) d += TAU; return a + d * t; }
  function viewEnts() {
    const S = M.snaps; if (!S.length) return [];
    const rt = performance.now() - 110;
    let a = S[S.length - 1], b = a;
    for (let i = S.length - 1; i > 0; i--) if (S[i - 1].t <= rt) { a = S[i - 1]; b = S[i]; break; }
    const t = b === a ? 1 : clamp((rt - a.t) / (b.t - a.t), 0, 1), out = [];
    for (const [id, eb] of b.e) {
      const ea = a.e.get(id) || eb, L = (i) => (ea[i] + (eb[i] - ea[i]) * t) / 100;
      out.push({ id, x: L(1), y: L(2), z: L(3), yaw: lerpAng(ea[4] / 1000, eb[4] / 1000, t), pitch: (ea[5] + (eb[5] - ea[5]) * t) / 1000, hp: eb[6], sh: eb[7], f: eb[8], wt: eb[9], wr: eb[10], rev: eb[11] / 40 });
    }
    return out;
  }

  // ---------- câmera ----------
  const tmpV = new THREE.Vector3();
  function updateCamera(dt, ents) {
    const me = M.me$, p = M.pred;
    let fov = 70, fp = false;
    if (!me || !me.ld) {
      const pl = M.plane, px = pl.ax + (pl.bx - pl.ax) * M.planeT, pz = pl.az + (pl.bz - pl.az) * M.planeT;
      const d = SH.dirOf(M.yaw, M.pitch);
      camera.position.set(px - d[0] * 40, SH.PLANE_Y + 8 - d[1] * 40, pz - d[2] * 40);
      camera.rotation.set(M.pitch, M.yaw, 0);
    } else {
      let fx = p.x, fy = p.y, fz = p.z, eye = (p.crouch || p.downed) ? SH.EYE_C : SH.EYE;
      if (!me.al) { const v = ents.find(e => e.id === me.v); if (v) { fx = v.x; fy = v.y; fz = v.z; eye = SH.EYE; } }
      const sc = me.al ? scopeNow() : 'hip'; fov = SCOPES[sc].fov; fp = sc !== 'hip';
      const ex = fx, ey = fy + eye, ez = fz;
      if (fp) camera.position.set(ex, ey, ez);
      else {
        const flying = p.fly && me.al, dist = flying ? 9 : sc !== 'hip' ? 1.5 : 3.3, side = flying ? 0 : sc !== 'hip' ? .5 : .62, up = flying ? 2.5 : .32;
        const d = SH.dirOf(M.yaw, M.pitch), rx = Math.cos(M.yaw), rz = -Math.sin(M.yaw);
        const sx = ex + rx * side, sy = ey + up, sz = ez + rz * side;
        const t = Math.min(dist, SH.rayHit(M.world, sx, sy, sz, -d[0], -d[1], -d[2], dist) - .25);
        camera.position.set(sx - d[0] * t, sy - d[1] * t, sz - d[2] * t);
        const g = SH.height(M.world, camera.position.x, camera.position.z) + .3; if (camera.position.y < g) camera.position.y = g;
      }
      // balanço leve da câmera ao andar (sem mirar)
      M.bobT = (M.bobT || 0) + (p.moving && p.onG && me.al ? dt * (sc === 'hip' ? 9 : 6) : 0);
      const bob = p.moving && p.onG ? Math.sin(M.bobT) * (sc === 'hip' ? .03 : .006) : 0;
      if (!p.fly) camera.position.y += bob;
      camera.rotation.set(M.pitch + (M.shake > 0 ? (Math.random() - .5) * M.shake * .1 : 0), M.yaw, bob * (sc === 'hip' ? .15 : .3));
      M.shake = Math.max(0, M.shake - dt);
    }
    if (Math.abs(camera.fov - fov) > .05) { camera.fov += (fov - camera.fov) * Math.min(1, dt * 14); camera.updateProjectionMatrix(); }
    return fp;
  }

  // ---------- desenho da partida ----------
  function drawMatch(dt) {
    const me = M.me$, ents = viewEnts(), seen = new Set();
    const fp = updateCamera(dt, ents);
    const p = M.pred;
    for (const e of ents) {
      seen.add(e.id);
      let ch = M.chars.get(e.id);
      const n = M.names[e.id] || ['?', -1, 0], mate = n[1] === M.team, isMe = e.id === M.me;
      if (!ch) { ch = GX.makeChar(e.id, isMe ? 'me' : mate ? 'mate' : 'enemy', mate && !isMe ? n[0] : '', { s: n[3], c: n[4] }); M.chars.set(e.id, ch); }
      const s = isMe && me && me.al ? Object.assign({}, e, { x: p.x, y: p.y, z: p.z, yaw: M.yaw, pitch: M.pitch, f: (e.f & ~(16 | 128 | 2 | 64 | 256 | 512)) | (p.crouch ? 16 : 0) | (p.moving ? 128 : 0) | (p.fly === 1 ? 2 : 0) | (p.fly === 2 ? 64 : 0) | (p.prone ? 256 : 0) | (p.slideT > 0 ? 512 : 0), onG: p.onG, air: !p.onG && !p.fly }) : e;
      s.ground = SH.height(M.world, s.x, s.z);
      GX.poseChar(ch, s, dt);
      ch.visible = !(isMe && fp);
    }
    for (const [id, ch] of M.chars) if (!seen.has(id)) ch.visible = false;
    // itens giram devagar
    const tt = performance.now() / 1000;
    for (const it of M.items.values()) { const m = it.mesh; if (Math.abs(m.position.x - camera.position.x) > 160 || Math.abs(m.position.z - camera.position.z) > 160) { m.visible = false; continue; } m.visible = true; m.userData.spin.rotation.y = tt; m.position.y = it.y + .4 + Math.sin(tt * 2 + it.id) * .06; }
    for (let i = M.tracers.length - 1; i >= 0; i--) { const t = M.tracers[i]; t.life -= dt; if (t.life <= 0) { scene.remove(t.line); t.line.geometry.dispose(); M.tracers.splice(i, 1); } }
    // avião e tempestade
    const pl = M.plane;
    M.planeMesh.visible = M.planeT < 1;
    M.planeMesh.position.set(pl.ax + (pl.bx - pl.ax) * M.planeT, SH.PLANE_Y, pl.az + (pl.bz - pl.az) * M.planeT);
    M.planeMesh.rotation.y = Math.atan2(-(pl.bx - pl.ax), -(pl.bz - pl.az));
    const z = M.zone; M.storm.position.set(z[0], 300, z[1]); M.storm.scale.set(Math.max(.5, z[2]), 1400, Math.max(.5, z[2]));
    // HUD de mira
    const sc = me && me.al ? scopeNow() : 'hip';
    $('#scope').hidden = !(sc === 'x4' || sc === 'x8');
    $('#scopeName').textContent = SCOPES[sc].n;
    const cross = $('#cross'); cross.classList.toggle('hidden', !me || !me.ld || !me.al || sc !== 'hip' || !!p.fly);
    const w = me && me.w[me.cur];
    if (w) { const wd = WEAP[WK[w[0]]]; let sp = M.ads ? wd.ads : wd.hip; if (!p.onG) sp *= 2.5; else if (p.moving && !M.ads) sp *= 1.4; const px = Math.max(3, Math.tan(sp) / Math.tan(camera.fov * Math.PI / 360) * vh / 2); cross.style.setProperty('--g', px.toFixed(1) + 'px'); }
    // arma em primeira pessoa ao mirar com ponto vermelho ou 2x
    const wt = w ? WK[w[0]] : null;
    GX.setViewModel(me && me.al && fp && (sc === 'ponto' || sc === 'x2') ? wt : null, sc);
    GX.frame(p.x || camera.position.x, p.z || camera.position.z, dt);
    GX.render();
  }

  // ---------- mapas ----------
  let mmBase = null;
  function drawMinimapBase() {
    const c = document.createElement('canvas'); c.width = c.height = 256; const g = c.getContext('2d'), img = g.createImageData(256, 256), w = M.world;
    for (let j = 0; j < 256; j++) for (let i = 0; i < 256; i++) {
      const h = SH.height(w, i / 256 * W, j / 256 * W), k = (j * 256 + i) * 4;
      let r, gg, b;
      if (h < 0) { r = 26; gg = 90; b = 107; } else if (h < 1.3) { r = 216; gg = 198; b = 144; }
      else { const s = Math.min(1, h / 70); r = 106 - s * 40; gg = 168 - s * 70; b = 79 - s * 30; }
      img.data[k] = r; img.data[k + 1] = gg; img.data[k + 2] = b; img.data[k + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    g.fillStyle = '#8a5a3a'; for (const h of w.houses) g.fillRect((h.x - h.w / 2) / W * 256, (h.z - h.d / 2) / W * 256, Math.max(2, h.w / W * 256), Math.max(2, h.d / W * 256));
    mmBase = c;
  }
  function drawMap(cvs, full) {
    if (!mmBase || !M) return;
    const S = cvs.width, g = cvs.getContext('2d'), k = S / W; g.setTransform(1, 0, 0, 1, 0, 0);
    g.imageSmoothingEnabled = true; g.drawImage(mmBase, 0, 0, S, S);
    const z = M.zone;
    g.beginPath(); g.rect(0, 0, S, S); g.arc(z[0] * k, z[1] * k, Math.max(.5, z[2] * k), 0, TAU); g.fillStyle = 'rgba(130,50,230,.4)'; g.fill('evenodd');
    if (z[6] === 0) { g.strokeStyle = '#fff'; g.lineWidth = full ? 2 : 1.5; g.beginPath(); g.arc(z[3] * k, z[4] * k, Math.max(.5, z[5] * k), 0, TAU); g.stroke(); }
    const pl = M.plane;
    if (M.planeT < 1) { g.setLineDash([6, 5]); g.strokeStyle = 'rgba(255,255,255,.85)'; g.lineWidth = 2; g.beginPath(); g.moveTo(pl.ax * k, pl.az * k); g.lineTo(pl.bx * k, pl.bz * k); g.stroke(); g.setLineDash([]); g.fillStyle = '#fff'; g.beginPath(); g.arc((pl.ax + (pl.bx - pl.ax) * M.planeT) * k, (pl.az + (pl.bz - pl.az) * M.planeT) * k, full ? 6 : 4, 0, TAU); g.fill(); }
    for (const e of M.ents || []) { const n = M.names[e.id]; if (!n || n[1] !== M.team || e.id === M.me) continue; g.fillStyle = '#37c6ff'; g.beginPath(); g.arc(e.x * k, e.z * k, full ? 5 : 4, 0, TAU); g.fill(); }
    if (M.me$ && M.me$.ld && M.me$.al) {
      const x = M.pred.x * k, y = M.pred.z * k, a = M.yaw, s = full ? 10 : 8;
      g.save(); g.translate(x, y); g.rotate(-a); g.fillStyle = '#ffc23a'; g.strokeStyle = '#1b1404'; g.lineWidth = 2;
      g.beginPath(); g.moveTo(0, -s); g.lineTo(s * .6, s * .7); g.lineTo(0, s * .35); g.lineTo(-s * .6, s * .7); g.closePath(); g.fill(); g.stroke(); g.restore();
    }
  }
  function toggleMap() { const b = $('#bigmap'); b.hidden = !b.hidden; if (!b.hidden) { if (document.pointerLockElement) document.exitPointerLock(); drawMap($('#bm'), true); } }
  $('#mm').addEventListener('click', toggleMap); $('#closeMap').addEventListener('click', toggleMap);

  function hud() {
    const me = M.me$; if (!me) return;
    $('#alive').textContent = M.alive; $('#kills').textContent = me.k;
    $('#ping').textContent = M.lastSnap && performance.now() - M.lastSnap > 1500 ? 'conexão instável' : '';
    const z = M.zone, zc = $('#zoneChip');
    if (z[6] === 3 && !me.ld) { $('#zoneLbl').textContent = 'Salto'; $('#zoneT').textContent = fmtT((1 - M.planeT) * M.plane.dur); zc.classList.add('warn'); }
    else if (z[6] === 3) { $('#zoneLbl').textContent = 'Zona fecha em'; $('#zoneT').textContent = fmtT((1 - M.planeT) * M.plane.dur + SH.PH[0].w); zc.classList.remove('warn'); }
    else if (z[6] === 0) { $('#zoneLbl').textContent = 'Zona fecha em'; $('#zoneT').textContent = fmtT(z[7]); zc.classList.toggle('warn', z[7] < 10); }
    else if (z[6] === 1) { $('#zoneLbl').textContent = 'Fechando'; $('#zoneT').textContent = fmtT(z[7]); zc.classList.add('warn'); }
    else { $('#zoneLbl').textContent = 'Zona'; $('#zoneT').textContent = 'final'; }
    const deg = ((-M.yaw * 180 / Math.PI) % 360 + 360) % 360, card = ['N', 'NE', 'L', 'SE', 'S', 'SO', 'O', 'NO'][Math.round(deg / 45) % 8];
    $('#compassTxt').textContent = `${card} ${Math.round(deg)}°`;
    $('#hpb i').style.width = clamp(me.hp, 0, 100) + '%'; $('#hpb').classList.toggle('down', !!me.dn); $('#shb i').style.width = me.sh + '%';
    for (let i = 0; i < 2; i++) {
      const w = me.w[i], el = $('#s' + i); el.classList.toggle('on', i === me.cur);
      el.innerHTML = `<em>${i + 1}</em>` + (w ? `<span style="color:${RAR[w[1]].c}">${WEAP[WK[w[0]]].n}${WEAP[WK[w[0]]].scope === 'livre' && me.sc ? ' · ' + me.sc + 'x' : ''}</span><b>${i === me.cur && me.rl ? '···' : w[2]}</b>` : '<span style="color:var(--muted)">vazio</span>');
    }
    $('#s2').classList.toggle('on', me.cur === 2); $('#s2').innerHTML = '<em>3</em><span>Mãos</span><b>✊</b>';
    const bagN = me.bag | 0;
    $('#bagInfo').innerHTML = `<b>${SH.BAG.n[bagN]}</b><span>Munição ${me.am}/${SH.BAG.ammo[bagN]}</span><span>Cura ${me.md}/${SH.BAG.meds[bagN]}</span>${me.sc ? `<span>Mira ${me.sc}x</span>` : ''}`;
    $('#bHeal').innerHTML = `Curar (${me.md})<kbd>H</kbd>`;
    M.nearW = null; M.nearDown = null;
    if (me.al && !me.dn && me.ld && !M.pred.fly) {
      { let bd = 2.6 * 2.6; for (const it of M.items.values()) { if (it.k !== 'w' || Math.abs(it.y - M.pred.y) > 2) continue; const d = (it.x - M.pred.x) ** 2 + (it.z - M.pred.z) ** 2; if (d < bd) { bd = d; M.nearW = it; } } }
      for (const e of M.ents || []) { const n = M.names[e.id]; if (e.id !== M.me && n && n[1] === M.team && (e.f & 1) && Math.hypot(e.x - M.pred.x, e.z - M.pred.z) < 2.2) M.nearDown = e; }
    }
    const b = $('#bPick'); if (M.nearW) { b.hidden = false; b.innerHTML = `PEGAR ${WEAP[M.nearW.w.t].n} <small>${RAR[M.nearW.w.r].n}</small><kbd>E</kbd>`; } else b.hidden = true;
    $('#tProne').classList.toggle('on', M.prone); $('#tSprint').classList.toggle('on', !!M.sprintLock);
    $('#bRev').hidden = !M.nearDown; if (!M.nearDown && M.rev) setRev(false);
    $('#tAds').classList.toggle('on', M.ads); $('#tCrouch').classList.toggle('on', M.crouch);
    if (MODES[M.mode].size > 1) {
      const vis = new Map((M.ents || []).map(e => [e.id, e]));
      $('#mates').innerHTML = M.names.map((n, id) => [n, id]).filter(([n, id]) => n[1] === M.team && id !== M.me).map(([n, id]) => {
        const e = vis.get(id), dead = !e, down = e && (e.f & 1);
        return `<div class="mate ${dead ? 'dead' : down ? 'down' : ''}"><div class="n"><span>${esc(n[0])}${n[2] ? ' (bot)' : ''}</span><span>${dead ? 'fora' : down ? 'caído' : ''}</span></div><div class="hb"><i style="width:${dead ? 0 : clamp(e.hp, 0, 100)}%"></i></div></div>`;
      }).join('');
    } else $('#mates').innerHTML = '';
    for (const f of M.feed) f.ttl -= .1;
    if (M.feed.length && M.feed[M.feed.length - 1].ttl < 0) { M.feed.pop(); renderFeed(); }
    $('#lockHint').hidden = isTouch || !!document.pointerLockElement || !$('#result').hidden || !$('#settings').hidden || !$('#bigmap').hidden;
  }

  // ---------- cena do menu ----------
  let menuT = 0;
  function setupMenuScene() { buildWorld(SH.genWorld(7)); }
  function drawMenu(dt) {
    menuT += dt * .05;
    camera.fov = 60; camera.updateProjectionMatrix();
    camera.position.set(W / 2 + Math.cos(menuT) * 300, 120, W / 2 + Math.sin(menuT) * 300);
    camera.lookAt(W / 2, 20, W / 2);
    GX.frame(camera.position.x, camera.position.z, dt);
    GX.render();
  }

  // ---------- laço principal ----------
  let last = performance.now(), hudT = 0, mmT = 0;
  function loop(now) {
    const dt = Math.min(.05, (now - last) / 1000); last = now;
    if (M) {
      M.inputAcc += dt;
      let n = 0; while (M.inputAcc >= STEP && n < 8) { M.inputAcc -= STEP; sampleInput(); n++; }
      if (M.inputAcc > STEP) M.inputAcc = 0;
      drawMatch(dt);
      M.ents = viewEnts();
      hudT -= dt; if (hudT <= 0) { hudT = .1; hud(); }
      mmT -= dt; if (mmT <= 0) { mmT = .25; drawMap($('#mm'), false); if (!$('#bigmap').hidden) drawMap($('#bm'), true); }
    } else { drawMenu(dt); if (!$('#lobby').hidden) preview.render(now / 1000); }
    requestAnimationFrame(loop);
  }
  // usado nos testes automáticos
  window.__look = (yaw, pitch) => { if (M) { M.yaw = yaw; M.pitch = pitch; } };
  window.__dbg = () => M && { mProne: M.prone, mCrouch: M.crouch, chute: M.chars.get(M.me) && M.chars.get(M.me).userData.chute.visible, p: M.pred, me: M.me$, yaw: M.yaw, pitch: M.pitch, pending: M.pending.length, planeT: M.planeT };
  setupMenuScene();
  requestAnimationFrame(loop);
  boot();
})();
