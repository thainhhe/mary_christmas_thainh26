// Noel server: REST + WebSocket, state kept in data/*.json (no database).
// Production: `npm run build && npm start` serves dist/ and the API on one port.
import http from 'node:http';
import fs from 'node:fs/promises';
import { createReadStream, existsSync } from 'node:fs';
import path from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import { collect, feedback, stats } from './analytics/index.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATA_DIR = path.join(ROOT, 'data');
const WISHES_FILE = path.join(DATA_DIR, 'wishes.json');
const STATE_FILE = path.join(DATA_DIR, 'state.json');
const DIST = path.join(ROOT, 'dist');
const PORT = Number(process.env.PORT) || 3000;

const MAX_WISHES = 500;
const MAX_BODY = 4096;
const COOLDOWN_MS = 10_000;
const TIERS = 8; // must match tree.js (tiers that can hold ornaments)
const COLORS = new Set(['#ff4d6d', '#ffd166', '#4cc9f0', '#80ed99', '#c77dff', '#f1f5ff']);
const HEX = /^#[0-9a-f]{6}$/i;
const WALK_RADIUS = 32; // keep in sync with src/avatars.js
const GIFT_EVERY_MS = Number(process.env.GIFT_EVERY_MS) || 90_000;
const GIFT_TTL_MS = 5 * 60_000;
const POINTS = { wish: 10, gift: 5 };
const WISH_POINTS_PER_DAY = 5; // wishes per day that still earn points

/* ---------- JSON persistence (serialised + atomic per file) ---------- */
const chains = new Map();
function writeJSON(file, data) {
  const prev = chains.get(file) ?? Promise.resolve();
  const next = prev.then(async () => {
    await fs.mkdir(path.dirname(file), { recursive: true });
    const tmp = `${file}.${process.pid}.tmp`;
    await fs.writeFile(tmp, JSON.stringify(data, null, 2));
    await fs.rename(tmp, file);
  }).catch((e) => console.error('write failed:', file, e));
  chains.set(file, next);
  return next;
}
async function readJSON(file, fallback) {
  try { return JSON.parse(await fs.readFile(file, 'utf8')); } catch (e) {
    if (e.code !== 'ENOENT') console.error(`${path.basename(file)} unreadable, using defaults:`, e.message);
    return fallback;
  }
}

/* ---------- Helpers ---------- */
// eslint-disable-next-line no-control-regex
const clean = (s, max) => String(s ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
const pad = (n) => String(n).padStart(2, '0');
const dayKey = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const color = (v, fallback) => (HEX.test(String(v)) ? String(v).toLowerCase() : fallback);

/* ---------- State ---------- */
let wishes = [];
let state = { scores: {}, visitors: {}, wishDay: {}, santa: { pool: [], pairs: null, drawnAt: null } };
let saveTimer = 0;
const touchState = () => { clearTimeout(saveTimer); saveTimer = setTimeout(() => writeJSON(STATE_FILE, state), 500); };

// Public, non-reversible author id so clients can group one person's wishes (the raw cid stays private).
const authorId = (cid) => (cid ? createHash('sha256').update(`noel:${cid}`).digest('hex').slice(0, 10) : undefined);

function makeWish({ name, wish, color: c }, by) {
  return {
    id: randomUUID(), by, name: clean(name, 24), wish: clean(wish, 120),
    color: COLORS.has(c) ? c : '#ff4d6d',
    tier: Math.floor(Math.random() * TIERS), angle: Math.random() * Math.PI * 2, t: 0.1 + Math.random() * 0.8,
    createdAt: Date.now(),
  };
}
function addScore(cid, name, pts) {
  const s = (state.scores[cid] ??= { name: '', points: 0 });
  s.name = clean(name, 24) || s.name || 'Khách';
  s.points += pts;
  touchState();
  return s.points;
}
function recordVisit(cid) {
  const key = dayKey();
  const list = (state.visitors[key] ??= []);
  if (!list.includes(cid)) { list.push(cid); touchState(); }
  for (const k of Object.keys(state.visitors)) if (k < dayKey(new Date(Date.now() - 7 * 864e5))) delete state.visitors[k];
}
const todayCount = () => (state.visitors[dayKey()] ?? []).length;

/* ---------- Secret Santa ---------- */
function santaDrawAt() {
  if (process.env.SANTA_DRAW_AT) return new Date(process.env.SANTA_DRAW_AT).getTime();
  const n = new Date();
  const y = n.getMonth() === 11 && n.getDate() > 25 ? n.getFullYear() + 1 : n.getFullYear();
  return new Date(y, 11, 24, 20, 0, 0).getTime();
}
function maybeDraw() {
  const s = state.santa;
  if (s.pairs && s.drawnAt && Date.now() - s.drawnAt > 30 * 864e5) { s.pool = []; s.pairs = null; s.drawnAt = null; touchState(); }
  if (s.pairs || Date.now() < santaDrawAt() || s.pool.length < 3) return;
  const a = s.pool.map((p) => p.cid);
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  s.pairs = {};
  a.forEach((cid, i) => { s.pairs[cid] = a[(i + 1) % a.length]; }); // one ring: nobody draws themselves
  s.drawnAt = Date.now();
  touchState();
}
function santaView(cid) {
  maybeDraw();
  const s = state.santa;
  const rec = s.pairs?.[cid] ? s.pool.find((p) => p.cid === s.pairs[cid])?.name ?? null : null;
  return { count: s.pool.length, joined: s.pool.some((p) => p.cid === cid), drawAt: santaDrawAt(), drawn: !!s.pairs, recipient: rec };
}

/* ---------- WebSocket hub ---------- */
const conns = new Set();
let pidSeq = 0;
const gifts = [];
let lastGiftAt = 0, lastQuarter = '';
const chatLog = [];

const send = (ws, obj) => { if (ws.readyState === 1) ws.send(JSON.stringify(obj)); };
function broadcast(obj, except) {
  const frame = JSON.stringify(obj);
  for (const ws of conns) if (ws !== except && ws.readyState === 1) ws.send(frame);
}
const broadcastOnline = () => broadcast({ type: 'online', online: conns.size, today: todayCount() });
const playersList = () => [...conns].filter((w) => w.player).map((w) => w.player);

function spawnGift() {
  const a = Math.random() * Math.PI * 2, r = 5.5 + Math.random() * 7.5;
  const g = { id: randomUUID(), x: Math.cos(a) * r, z: Math.sin(a) * r, at: Date.now() };
  gifts.push(g);
  lastGiftAt = Date.now();
  broadcast({ type: 'gift', gift: { ...g, age: 0 } });
}
setInterval(() => {
  for (let i = gifts.length - 1; i >= 0; i--) if (Date.now() - gifts[i].at > GIFT_TTL_MS) { broadcast({ type: 'giftgone', id: gifts[i].id }); gifts.splice(i, 1); }
  if (!conns.size) return;
  const n = new Date(), q = `${dayKey(n)}-${n.getHours()}-${n.getMinutes()}`;
  if (n.getMinutes() % 15 === 0 && q !== lastQuarter) { lastQuarter = q; spawnGift(); setTimeout(spawnGift, 4000); } // Santa flies over
  else if (gifts.length < 3 && Date.now() - lastGiftAt > GIFT_EVERY_MS) spawnGift();
}, 5000).unref();

const wss = new WebSocketServer({ noServer: true, maxPayload: 2048 });
wss.on('connection', (ws) => {
  ws.pid = `p${++pidSeq}`; ws.cid = null; ws.player = null; ws.alive = true; ws.chatTimes = []; ws.lastMove = 0;
  conns.add(ws);
  ws.on('pong', () => { ws.alive = true; });
  ws.on('message', (buf) => { let m; try { m = JSON.parse(buf.toString()); } catch { return; } if (m && typeof m === 'object') handle(ws, m); });
  ws.on('close', () => { conns.delete(ws); if (ws.player) broadcast({ type: 'leave', id: ws.pid }); broadcastOnline(); });
  ws.on('error', () => ws.close());
});
setInterval(() => { for (const ws of conns) { if (!ws.alive) { ws.terminate(); continue; } ws.alive = false; ws.ping(); } }, 30_000).unref();

function handle(ws, m) {
  switch (m.type) {
    case 'hello': {
      ws.cid = clean(m.cid, 64) || ws.pid;
      recordVisit(ws.cid);
      send(ws, {
        type: 'welcome', pid: ws.pid, by: authorId(ws.cid), online: conns.size, today: todayCount(), players: playersList(), chat: chatLog.slice(-30),
        gifts: gifts.map((g) => ({ ...g, age: Date.now() - g.at })),
      });
      broadcastOnline();
      break;
    }
    case 'join': {
      if (!ws.cid) return;
      const a = Math.random() * Math.PI * 2;
      ws.player = {
        id: ws.pid, name: clean(m.name, 24) || 'Khách', shirt: color(m.shirt, '#e63946'), hat: color(m.hat, '#d62839'),
        x: Math.cos(a) * 7, z: Math.sin(a) * 7,
      };
      broadcast({ type: 'join', player: ws.player });
      break;
    }
    case 'move': {
      if (!ws.player || Date.now() - ws.lastMove < 80) return;
      let x = Number(m.x), z = Number(m.z);
      if (!Number.isFinite(x) || !Number.isFinite(z)) return;
      const r = Math.hypot(x, z);
      if (r > WALK_RADIUS) { x *= WALK_RADIUS / r; z *= WALK_RADIUS / r; }
      ws.lastMove = Date.now();
      ws.player.x = x; ws.player.z = z;
      broadcast({ type: 'move', id: ws.pid, x, z }, ws);
      break;
    }
    case 'chat': {
      if (!ws.player) return send(ws, { type: 'error', code: 'not_joined' });
      const now = Date.now();
      ws.chatTimes = ws.chatTimes.filter((t) => now - t < 5000);
      if (ws.chatTimes.length >= 3) return send(ws, { type: 'error', code: 'chat_fast' });
      const text = clean(m.text, 100);
      if (!text) return;
      ws.chatTimes.push(now);
      const msg = { type: 'chat', id: ws.pid, name: ws.player.name, text, t: now };
      chatLog.push(msg); if (chatLog.length > 50) chatLog.shift();
      broadcast(msg);
      break;
    }
    case 'claim': {
      if (!ws.cid) return;
      const i = gifts.findIndex((g) => g.id === m.id);
      if (i < 0) return;
      gifts.splice(i, 1);
      const total = addScore(ws.cid, ws.player?.name, POINTS.gift);
      send(ws, { type: 'claimed', id: m.id, points: POINTS.gift, total });
      broadcast({ type: 'giftgone', id: m.id, by: ws.player?.name ?? null });
      break;
    }
    default:
  }
}

/* ---------- HTTP ---------- */
const json = (res, code, body) => {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(body));
};
function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_BODY) { reject(Object.assign(new Error('too large'), { code: 413 })); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}
async function bodyJSON(req, res) {
  try { return JSON.parse(await readBody(req)) ?? {}; } catch (e) { json(res, e.code === 413 ? 413 : 400, { error: 'bad_body' }); return null; }
}

const lastPost = new Map();
setInterval(() => { const cut = Date.now() - COOLDOWN_MS; for (const [k, v] of lastPost) if (v < cut) lastPost.delete(k); }, 60_000).unref();

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json' };
async function serveStatic(req, res, pathname) {
  if (!existsSync(DIST)) { res.writeHead(404); res.end('dist/ not built. Run: npm run build'); return; }
  let file = path.join(DIST, path.normalize(decodeURIComponent(pathname)));
  if (!file.startsWith(DIST)) { res.writeHead(403); res.end(); return; }
  try { if ((await fs.stat(file)).isDirectory()) file = path.join(file, 'index.html'); } catch { file = path.join(DIST, 'index.html'); }
  if (!existsSync(file)) file = path.join(DIST, 'index.html');
  res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': file.includes(`${path.sep}assets${path.sep}`) ? 'public, max-age=31536000, immutable' : 'no-cache' });
  createReadStream(file).pipe(res);
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://x');
    const { pathname } = url;
    const M = req.method;

    if (pathname === '/api/wishes' && M === 'GET') return json(res, 200, { wishes });
    if (pathname === '/api/wishes' && M === 'POST') {
      const ip = req.socket.remoteAddress || 'unknown'; // behind a proxy, read X-Forwarded-For here
      if (Date.now() - (lastPost.get(ip) ?? 0) < COOLDOWN_MS) return json(res, 429, { error: 'too_fast' });
      const body = await bodyJSON(req, res); if (!body) return;
      const w = makeWish(body, authorId(clean(body.cid, 64)));
      if (!w.wish) return json(res, 400, { error: 'empty_wish' });
      lastPost.set(ip, Date.now());
      wishes.push(w);
      if (wishes.length > MAX_WISHES) wishes = wishes.slice(-MAX_WISHES);
      await writeJSON(WISHES_FILE, wishes);
      broadcast({ type: 'wish', wish: w });
      const cid = clean(body.cid, 64);
      let points = 0;
      if (cid) {
        const k = `${dayKey()}:${cid}`;
        state.wishDay[k] = (state.wishDay[k] ?? 0) + 1;
        for (const key of Object.keys(state.wishDay)) if (!key.startsWith(dayKey())) delete state.wishDay[key];
        if (state.wishDay[k] <= WISH_POINTS_PER_DAY) { addScore(cid, w.name, POINTS.wish); points = POINTS.wish; }
      }
      return json(res, 201, { ...w, points });
    }

    if (pathname === '/api/leaderboard' && M === 'GET') {
      const cid = clean(url.searchParams.get('cid'), 64);
      const all = Object.entries(state.scores).map(([id, s]) => ({ id, name: s.name, points: s.points })).sort((a, b) => b.points - a.points);
      const idx = all.findIndex((r) => r.id === cid);
      return json(res, 200, { top: all.slice(0, 20).map(({ name, points }) => ({ name, points })), me: idx < 0 ? null : { rank: idx + 1, points: all[idx].points } });
    }

    if (pathname === '/api/santa' && M === 'GET') return json(res, 200, santaView(clean(url.searchParams.get('cid'), 64)));
    if (pathname === '/api/santa/join' && M === 'POST') {
      const body = await bodyJSON(req, res); if (!body) return;
      const cid = clean(body.cid, 64), name = clean(body.name, 24);
      if (!cid || !name) return json(res, 400, { error: 'bad_input' });
      maybeDraw();
      if (state.santa.pairs) return json(res, 409, { error: 'drawn' });
      const pool = state.santa.pool, i = pool.findIndex((p) => p.cid === cid);
      if (i >= 0) pool[i].name = name; else if (pool.length < 200) pool.push({ cid, name });
      touchState();
      return json(res, 200, santaView(cid));
    }
    if (pathname === '/api/santa/leave' && M === 'POST') {
      const body = await bodyJSON(req, res); if (!body) return;
      const cid = clean(body.cid, 64);
      if (state.santa.pairs) return json(res, 409, { error: 'drawn' });
      state.santa.pool = state.santa.pool.filter((p) => p.cid !== cid);
      touchState();
      return json(res, 200, santaView(cid));
    }

    // Analytics: POST /api/a collects; /stats (login-protected) is the report. Same handlers as the Vercel functions in api/.
    if (pathname === '/api/a') return collect(req, res);
    if (pathname === '/api/feedback') return feedback(req, res);
    if (pathname === '/stats' || pathname.startsWith('/stats/')) {
      const [, , action = 'page', arg] = pathname.split('/'); // /stats | /stats/login | /stats/data/30
      return stats(req, res, action || 'page', arg);
    }

    if (pathname.startsWith('/api/')) return json(res, 404, { error: 'not_found' });
    if (M !== 'GET' && M !== 'HEAD') { res.writeHead(405); return res.end(); }
    return serveStatic(req, res, pathname);
  } catch (e) {
    console.error(e);
    if (!res.headersSent) json(res, 500, { error: 'server_error' }); else res.end();
  }
});

server.on('upgrade', (req, socket, head) => {
  if (new URL(req.url, 'http://x').pathname !== '/ws') { socket.destroy(); return; }
  wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req));
});

async function seedWishes() {
  const raw = await readJSON(WISHES_FILE, null);
  if (Array.isArray(raw)) return raw;
  const seed = [
    ['Mai Anh', 'Chúc cả nhà một mùa Noel thật ấm áp! 🎄', '#ff4d6d'],
    ['Hiếu', 'Năm mới bình an, nhiều niềm vui.', '#ffd166'],
    ['Linh', 'Mong ai cũng có người bên cạnh đêm Giáng sinh ❤️', '#4cc9f0'],
    ['Nam', 'Gửi tới bạn một cái ôm thật chặt ✨', '#80ed99'],
  ].map(([name, wish, c]) => makeWish({ name, wish, color: c }));
  await writeJSON(WISHES_FILE, seed);
  return seed;
}

wishes = await seedWishes();
state = { ...state, ...(await readJSON(STATE_FILE, {})) };
state.santa = { pool: [], pairs: null, drawnAt: null, ...state.santa };
server.listen(PORT, () => console.log(`Noel server on http://localhost:${PORT}  (${wishes.length} wishes)`));

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, async () => { clearTimeout(saveTimer); await writeJSON(STATE_FILE, state); process.exit(0); });
}
