// Servidor do Última Ilha: entrega o site, faz o login com Google, monta grupos, procura partidas e roda as partidas.
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { WebSocketServer } = require('ws');
const { OAuth2Client } = require('google-auth-library');
const SH = require('../public/shared.js');
const { Match } = require('./match.js');

const PORT = +process.env.PORT || 3000;
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '';
const DEV_LOGIN = process.env.DEV_LOGIN === '1'; // login por apelido, sem Google (para testes)
const LOBBY_WAIT = +process.env.LOBBY_WAIT || 25; // segundos esperando jogadores antes de completar com bots
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
const PUBLIC = path.join(__dirname, '..', 'public');
const google = new OAuth2Client(GOOGLE_CLIENT_ID);
const zlib = require('zlib');
const gz = new Map();
function gzipCache(file, data) {
  const key = file + ':' + data.length;
  if (!gz.has(key)) gz.set(key, zlib.gzipSync(data, { level: 9 }));
  return gz.get(key);
}

if (!GOOGLE_CLIENT_ID && !DEV_LOGIN) console.warn('[aviso] GOOGLE_CLIENT_ID não definido: ninguém vai conseguir entrar.');

// ---------- estatísticas salvas em arquivo ----------
fs.mkdirSync(DATA_DIR, { recursive: true });
const STATS_FILE = path.join(DATA_DIR, 'stats.json');
let stats = {};
try { stats = JSON.parse(fs.readFileSync(STATS_FILE, 'utf8')); } catch (e) { stats = {}; }
let saveTimer = null;
function saveStats() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => fs.writeFile(STATS_FILE, JSON.stringify(stats), () => {}), 2000);
}
const statOf = id => stats[id] || (stats[id] = { matches: 0, wins: 0, kills: 0 });

// ---------- site ----------
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.json': 'application/json' };
const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  if (url.pathname === '/health') { res.writeHead(200); res.end('ok'); return; }
  if (url.pathname === '/config') {
    res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
    res.end(JSON.stringify({ googleClientId: GOOGLE_CLIENT_ID, dev: DEV_LOGIN })); return;
  }
  let p = decodeURIComponent(url.pathname); if (p === '/') p = '/index.html';
  const file = path.normalize(path.join(PUBLIC, p));
  if (!file.startsWith(PUBLIC)) { res.writeHead(403); res.end(); return; }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); res.end('não encontrado'); return; }
    const ext = path.extname(file), headers = { 'content-type': MIME[ext] || 'application/octet-stream', 'cache-control': file.includes('vendor') ? 'public, max-age=604800' : 'no-cache' };
    // arquivos de texto vão compactados (o three.js cai de 600 KB para 150 KB)
    if (/gzip/.test(req.headers['accept-encoding'] || '') && ['.js', '.css', '.html', '.json', '.svg'].includes(ext)) {
      headers['content-encoding'] = 'gzip'; headers.vary = 'Accept-Encoding';
      res.writeHead(200, headers); res.end(gzipCache(file, data)); return;
    }
    res.writeHead(200, headers); res.end(data);
  });
});

// ---------- estado ----------
const users = new Map();    // userId -> { id, name, pic, conn, party, match }
const sessions = new Map(); // token -> { userId, exp }
const parties = new Map();  // code -> { code, leader, members:[userId], mode, queued }
const matches = new Map();  // id -> Match
const SESSION_DAYS = 7;

function newCode() {
  const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let c; do { c = ''; for (let i = 0; i < 5; i++) c += A[crypto.randomInt(A.length)]; } while (parties.has(c));
  return c;
}
function publicUser(u) { return { id: u.id, name: u.name, pic: u.pic, online: !!u.conn, inMatch: !!u.match }; }
function sendParty(party) {
  const msg = { t: 'party', code: party.code, leader: party.leader, mode: party.mode, queued: party.queued, members: party.members.map(id => publicUser(users.get(id))) };
  for (const id of party.members) { const u = users.get(id); if (u && u.conn) u.conn.send(msg); }
}
function createParty(u) {
  const party = { code: newCode(), leader: u.id, members: [u.id], mode: 'squad', queued: false };
  parties.set(party.code, party); u.party = party.code; return party;
}
function leaveParty(u, silent) {
  const party = parties.get(u.party); if (!party) return;
  if (party.queued) unqueue(party);
  party.members = party.members.filter(id => id !== u.id);
  u.party = null;
  if (!party.members.length) parties.delete(party.code);
  else { if (party.leader === u.id) party.leader = party.members[0]; sendParty(party); }
  if (!silent) sendParty(createParty(u));
}

// ---------- fila de partidas ----------
const pending = {}; // mode -> { teams: [[{party, users}]], startAt }
function teamFill(team) { return team.reduce((s, p) => s + p.users.length, 0); }
function enqueue(party) {
  const mode = party.mode, size = SH.MODES[mode].size, maxTeams = Math.floor(SH.MAX_PLAYERS / size);
  const members = party.members.map(id => users.get(id)).filter(u => u && u.conn && !u.match);
  if (members.length !== party.members.length) return 'Todos do grupo precisam estar online e fora de partida.';
  if (members.length > size) return `Seu grupo tem ${members.length} pessoas. Escolha um modo com time maior.`;
  let pm = pending[mode];
  if (!pm) pm = pending[mode] = { teams: [], startAt: Date.now() + LOBBY_WAIT * 1000 };
  // times incompletos recebem jogadores de outros grupos (preenchimento automático)
  let team = pm.teams.find(t => teamFill(t) + members.length <= size);
  if (!team) {
    if (pm.teams.length >= maxTeams) { startMatch(mode); return enqueue(party); }
    team = []; pm.teams.push(team);
  }
  team.push({ party: party.code, users: members.map(u => u.id) });
  party.queued = true; sendParty(party); queueStatus(mode);
  if (pm.teams.length >= maxTeams && pm.teams.every(t => teamFill(t) >= size)) startMatch(mode);
  return null;
}
function unqueue(party) {
  const pm = pending[party.mode]; party.queued = false;
  if (pm) {
    for (const t of pm.teams) { const i = t.findIndex(x => x.party === party.code); if (i >= 0) t.splice(i, 1); }
    pm.teams = pm.teams.filter(t => t.length);
    if (!pm.teams.length) delete pending[party.mode]; else queueStatus(party.mode);
  }
  sendParty(party);
}
function queueStatus(mode) {
  const pm = pending[mode]; if (!pm) return;
  const n = pm.teams.reduce((s, t) => s + teamFill(t), 0);
  const msg = { t: 'queue', mode, humans: n, max: SH.MAX_PLAYERS, secs: Math.max(0, Math.ceil((pm.startAt - Date.now()) / 1000)) };
  for (const t of pm.teams) for (const p of t) for (const id of p.users) { const u = users.get(id); if (u && u.conn) u.conn.send(msg); }
}
function startMatch(mode) {
  const pm = pending[mode]; if (!pm) return; delete pending[mode];
  const groups = pm.teams.map(t => t.flatMap(p => p.users).map(id => users.get(id)).filter(Boolean).map(u => ({ id: u.id, name: u.name })));
  const m = new Match(mode, groups.filter(g => g.length), { onResult });
  matches.set(m.id, m);
  for (const t of pm.teams) for (const p of t) {
    const party = parties.get(p.party); if (party) party.queued = false;
    for (const id of p.users) { const u = users.get(id); if (!u) continue; u.match = m.id; if (u.conn) m.attach(u.id, u.conn); }
    if (party) sendParty(party);
  }
  console.log(`[partida ${m.id}] ${SH.MODES[mode].n} com ${groups.flat().length} pessoas e ${m.ents.length} personagens`);
}
function onResult(userId, res) {
  const s = statOf(userId); s.matches++; s.kills += res.kills; if (res.win) s.wins++; saveStats();
  const u = users.get(userId); if (u && u.conn) u.conn.send({ t: 'stats', stats: s });
}

setInterval(() => {
  const now = Date.now();
  for (const mode of Object.keys(pending)) { if (now >= pending[mode].startAt) startMatch(mode); else queueStatus(mode); }
  for (const [code, s] of sessions) if (s.exp < now) sessions.delete(code);
}, 1000);

// laço da simulação: 30 passos por segundo
let lastStep = Date.now(), acc = 0;
setInterval(() => {
  const now = Date.now(); acc += Math.min(250, now - lastStep); lastStep = now;
  const stepMs = 1000 / SH.TICK;
  while (acc >= stepMs) {
    acc -= stepMs;
    for (const [id, m] of matches) {
      if (!m.step()) {
        matches.delete(id);
        for (const u of users.values()) if (u.match === id) { u.match = null; if (u.conn) u.conn.send({ t: 'lobby' }); }
      }
    }
  }
}, 1000 / SH.TICK / 2);

// ---------- conexões ----------
const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 8 * 1024 });
wss.on('connection', ws => {
  const conn = {
    ws, user: null, msgs: 0,
    send(o) { if (ws.readyState === 1) ws.send(JSON.stringify(o)); }
  };
  const rate = setInterval(() => { conn.msgs = 0; }, 1000);
  ws.on('message', async raw => {
    if (++conn.msgs > 150) { ws.close(4008, 'muitas mensagens'); return; }
    let m; try { m = JSON.parse(raw); } catch (e) { return; }
    if (!m || typeof m.t !== 'string') return;
    if (!conn.user) { if (m.t === 'hello') await hello(conn, m); return; }
    handle(conn.user, m);
  });
  ws.on('close', () => { clearInterval(rate); if (conn.user) bye(conn.user, conn); });
  ws.on('error', () => {});
});

async function hello(conn, m) {
  let profile = null;
  try {
    if (typeof m.session === 'string' && sessions.has(m.session)) {
      const s = sessions.get(m.session); const u = users.get(s.userId);
      if (u && s.exp > Date.now()) profile = { id: u.id, name: u.name, pic: u.pic };
    } else if (typeof m.token === 'string' && GOOGLE_CLIENT_ID) {
      const ticket = await google.verifyIdToken({ idToken: m.token, audience: GOOGLE_CLIENT_ID });
      const p = ticket.getPayload();
      if (!p || !p.sub) throw new Error('token sem usuário');
      profile = { id: 'g:' + p.sub, name: (p.given_name || p.name || 'Jogador').slice(0, 18), pic: p.picture || '' };
    } else if (DEV_LOGIN && typeof m.dev === 'string' && m.dev.trim()) {
      const n = m.dev.trim().slice(0, 18); profile = { id: 'dev:' + n.toLowerCase(), name: n, pic: '' };
    }
  } catch (e) { profile = null; }
  if (!profile) { conn.send({ t: 'auth', ok: false, msg: 'Não deu para confirmar sua conta Google. Entre de novo.' }); return; }

  let u = users.get(profile.id);
  if (!u) { u = { id: profile.id, name: profile.name, pic: profile.pic, conn: null, party: null, match: null }; users.set(u.id, u); }
  else { u.name = profile.name || u.name; u.pic = profile.pic || u.pic; }
  if (u.conn && u.conn !== conn) { u.conn.send({ t: 'kick', msg: 'Sua conta entrou em outro aparelho.' }); u.conn.ws.close(4001); bye(u, u.conn); }
  u.conn = conn; conn.user = u;
  let token = m.session && sessions.has(m.session) ? m.session : crypto.randomBytes(24).toString('hex');
  sessions.set(token, { userId: u.id, exp: Date.now() + SESSION_DAYS * 864e5 });
  conn.send({ t: 'auth', ok: true, session: token, user: { id: u.id, name: u.name, pic: u.pic }, stats: statOf(u.id), modes: SH.MODES });
  if (!u.party || !parties.has(u.party)) createParty(u);
  sendParty(parties.get(u.party));
  if (u.match && matches.has(u.match)) matches.get(u.match).attach(u.id, conn);
}

function bye(u, conn) {
  if (u.conn !== conn) return;
  u.conn = null;
  if (u.match && matches.has(u.match)) matches.get(u.match).detach(u.id);
  const party = parties.get(u.party);
  if (party) { if (party.queued) unqueue(party); sendParty(party); }
  // grupos não esperam quem saiu: depois de 2 minutos offline a pessoa sai do grupo
  setTimeout(() => { if (!u.conn && u.party) leaveParty(u, true); }, 120000);
}

function handle(u, m) {
  const party = parties.get(u.party);
  switch (m.t) {
    case 'i': case 'a':
      if (u.match && matches.has(u.match)) matches.get(u.match).input(u.id, m);
      break;
    case 'party.join': {
      const code = String(m.code || '').toUpperCase().trim();
      const target = parties.get(code);
      if (!target) return u.conn.send({ t: 'error', msg: 'Não achei um grupo com esse código.' });
      if (target === party) return;
      if (target.members.length >= 5) return u.conn.send({ t: 'error', msg: 'Esse grupo já está cheio (5 pessoas).' });
      if (target.queued) return u.conn.send({ t: 'error', msg: 'Esse grupo está procurando partida. Peça para cancelarem e tente de novo.' });
      if (u.match) return;
      leaveParty(u, true); target.members.push(u.id); u.party = target.code; sendParty(target);
      break;
    }
    case 'party.leave': if (party && party.members.length > 1 && !u.match) leaveParty(u); break;
    case 'party.kick': {
      if (!party || party.leader !== u.id || party.queued) return;
      const t = users.get(m.id); if (!t || t.party !== party.code || t.id === u.id) return;
      leaveParty(t);
      break;
    }
    case 'party.mode':
      if (party && party.leader === u.id && !party.queued && SH.MODES[m.mode]) { party.mode = m.mode; sendParty(party); }
      break;
    case 'queue': {
      if (!party || party.leader !== u.id || party.queued) return;
      const err = enqueue(party); if (err) u.conn.send({ t: 'error', msg: err });
      break;
    }
    case 'unqueue': if (party && party.queued) unqueue(party); break;
    case 'leaveMatch':
      if (u.match && matches.has(u.match)) matches.get(u.match).detach(u.id);
      u.match = null; u.conn.send({ t: 'lobby' }); if (party) sendParty(party);
      break;
  }
}

server.listen(PORT, () => console.log(`Última Ilha rodando na porta ${PORT}${DEV_LOGIN ? ' (login de teste ligado)' : ''}`));
