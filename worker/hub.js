// The game server as ONE Durable Object (single global room): REST API + WebSocket hub.
// A port of server/index.js. Differences that come from the platform:
//  - state lives in the object's SQLite database (survives restarts) with a small in-memory cache on top,
//  - WebSockets use the Hibernation API: the object can be evicted from memory while players stay connected,
//    so everything per-connection that must survive is kept in the socket "attachment",
//  - the 5-second setInterval is replaced by a Durable Object alarm that only runs while someone is connected,
//  - Workers run in UTC: day boundaries and the Secret Santa draw time use a fixed offset (TZ_OFFSET, default +7).
import { DurableObject } from 'cloudflare:workers';
import { createHash } from 'node:crypto';

const MAX_WISHES = 500;
const MAX_BODY = 4096;
const COOLDOWN_MS = 10_000;
const TIERS = 8; // must match tree.js (tiers that can hold ornaments)
const COLORS = new Set(['#ff4d6d', '#ffd166', '#4cc9f0', '#80ed99', '#c77dff', '#f1f5ff']);
const HEX = /^#[0-9a-f]{6}$/i;
const WALK_RADIUS = 32; // keep in sync with src/avatars.js
const GIFT_TTL_MS = 5 * 60_000;
const POINTS = { wish: 10, gift: 5 };
const WISH_POINTS_PER_DAY = 5;
const MAX_WS_MESSAGE = 2048;

// eslint-disable-next-line no-control-regex
const clean = (s, max) => String(s ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
const color = (v, fallback) => (HEX.test(String(v)) ? String(v).toLowerCase() : fallback);
// Public, non-reversible author id so clients can group one person's wishes (the raw cid stays private).
const authorId = (cid) => (cid ? createHash('sha256').update(`noel:${cid}`).digest('hex').slice(0, 10) : undefined);
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });

const SEED = [
  ['Mai Anh', 'Chúc cả nhà một mùa Noel thật ấm áp! 🎄', '#ff4d6d'],
  ['Hiếu', 'Năm mới bình an, nhiều niềm vui.', '#ffd166'],
  ['Linh', 'Mong ai cũng có người bên cạnh đêm Giáng sinh ❤️', '#4cc9f0'],
  ['Nam', 'Gửi tới bạn một cái ôm thật chặt ✨', '#80ed99'],
];

export class Hub extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.sql = ctx.storage.sql;
    this.tz = Number(env.TZ_OFFSET ?? 7);
    this.giftEvery = Number(env.GIFT_EVERY_MS) || 90_000;
    this.tick = Number(env.GIFT_TICK_MS) || 30_000;
    this.lastPost = new Map(); // ip -> time of last wish
    this.lastMove = new Map(); // pid -> time
    this.chatTimes = new Map(); // pid -> [times]
    this.extraGiftAt = 0;
    this.lastQuarter = '';
    this.visDay = ''; this.visSet = new Set();
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping', 'pong')); // keep-alive that never wakes the object
    ctx.blockConcurrencyWhile(async () => this.load());
    if (env.DEBUG_HUB) console.log('[hub] constructed (cold start or woke from hibernation)'); // diagnostics only
  }

  /* ---------- time helpers (fixed offset instead of the machine's local time) ---------- */
  dayKey(ms = Date.now()) { return new Date(ms + this.tz * 3600e3).toISOString().slice(0, 10); }
  localDate(ms = Date.now()) { return new Date(ms + this.tz * 3600e3); } // read it with the getUTC* methods

  /* ---------- storage ---------- */
  load() {
    const sql = this.sql;
    sql.exec(`CREATE TABLE IF NOT EXISTS wishes (id TEXT PRIMARY KEY, json TEXT NOT NULL)`);
    sql.exec(`CREATE TABLE IF NOT EXISTS scores (cid TEXT PRIMARY KEY, name TEXT NOT NULL, points INTEGER NOT NULL)`);
    sql.exec(`CREATE INDEX IF NOT EXISTS scores_points ON scores (points DESC)`);
    sql.exec(`CREATE TABLE IF NOT EXISTS visitors (day TEXT NOT NULL, cid TEXT NOT NULL, PRIMARY KEY (day, cid))`);
    sql.exec(`CREATE TABLE IF NOT EXISTS wishday (k TEXT PRIMARY KEY, n INTEGER NOT NULL)`);
    sql.exec(`CREATE TABLE IF NOT EXISTS santa_pool (cid TEXT PRIMARY KEY, name TEXT NOT NULL)`);
    sql.exec(`CREATE TABLE IF NOT EXISTS meta (k TEXT PRIMARY KEY, v TEXT NOT NULL)`);

    this.wishes = sql.exec('SELECT json FROM wishes ORDER BY rowid').toArray().map((r) => JSON.parse(r.json));
    if (!this.wishes.length && !this.getMeta('seeded')) { // first run: a few sample wishes
      for (const [name, wish, c] of SEED) this.storeWish(this.makeWish({ name, wish, color: c }));
      this.setMeta('seeded', 1);
    }
    this.chatLog = this.getMeta('chat') ?? [];
    const g = this.getMeta('gifts') ?? { list: [], lastAt: 0 };
    this.gifts = g.list; this.lastGiftAt = g.lastAt;
    const s = this.getMeta('santa') ?? { pairs: null, drawnAt: null };
    this.santa = s;
  }
  getMeta(k) { const r = this.sql.exec('SELECT v FROM meta WHERE k = ?', k).toArray()[0]; return r ? JSON.parse(r.v) : undefined; }
  setMeta(k, v) { this.sql.exec('INSERT INTO meta (k, v) VALUES (?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v', k, JSON.stringify(v)); }
  saveGifts() { this.setMeta('gifts', { list: this.gifts, lastAt: this.lastGiftAt }); }

  makeWish({ name, wish, color: c }, by) {
    return {
      id: crypto.randomUUID(), by, name: clean(name, 24), wish: clean(wish, 120),
      color: COLORS.has(c) ? c : '#ff4d6d',
      tier: Math.floor(Math.random() * TIERS), angle: Math.random() * Math.PI * 2, t: 0.1 + Math.random() * 0.8,
      createdAt: Date.now(),
    };
  }
  storeWish(w) {
    this.wishes ??= [];
    this.wishes.push(w);
    this.sql.exec('INSERT INTO wishes (id, json) VALUES (?, ?)', w.id, JSON.stringify(w));
    while (this.wishes.length > MAX_WISHES) { const old = this.wishes.shift(); this.sql.exec('DELETE FROM wishes WHERE id = ?', old.id); }
  }
  addScore(cid, name, pts) {
    const row = this.sql.exec('SELECT name, points FROM scores WHERE cid = ?', cid).toArray()[0];
    const nm = clean(name, 24) || row?.name || 'Khách';
    if (row) { this.sql.exec('UPDATE scores SET name = ?, points = points + ? WHERE cid = ?', nm, pts, cid); return row.points + pts; }
    this.sql.exec('INSERT INTO scores (cid, name, points) VALUES (?, ?, ?)', cid, nm, pts);
    return pts;
  }
  ensureDay() { // today's visitor set is cached in memory; reload it when the day rolls over (or after a cold start)
    const day = this.dayKey();
    if (this.visDay === day) return day;
    this.visDay = day;
    this.visSet = new Set(this.sql.exec('SELECT cid FROM visitors WHERE day = ?', day).toArray().map((r) => r.cid));
    this.sql.exec('DELETE FROM visitors WHERE day < ?', this.dayKey(Date.now() - 7 * 864e5));
    return day;
  }
  recordVisit(cid) {
    const day = this.ensureDay();
    if (!this.visSet.has(cid)) { this.visSet.add(cid); this.sql.exec('INSERT OR IGNORE INTO visitors (day, cid) VALUES (?, ?)', day, cid); }
  }
  todayCount() { this.ensureDay(); return this.visSet.size; }

  /* ---------- Secret Santa ---------- */
  santaDrawAt() {
    if (this.env.SANTA_DRAW_AT) return new Date(this.env.SANTA_DRAW_AT).getTime();
    const n = this.localDate();
    const y = n.getUTCMonth() === 11 && n.getUTCDate() > 25 ? n.getUTCFullYear() + 1 : n.getUTCFullYear();
    return Date.UTC(y, 11, 24, 20, 0, 0) - this.tz * 3600e3; // 20:00 on 24 Dec, local time
  }
  santaPool() { return this.sql.exec('SELECT cid, name FROM santa_pool ORDER BY rowid').toArray(); }
  maybeDraw() {
    const s = this.santa;
    if (s.pairs && s.drawnAt && Date.now() - s.drawnAt > 30 * 864e5) { this.sql.exec('DELETE FROM santa_pool'); this.santa = { pairs: null, drawnAt: null }; this.setMeta('santa', this.santa); }
    const pool = this.santaPool();
    if (this.santa.pairs || Date.now() < this.santaDrawAt() || pool.length < 3) return;
    const a = pool.map((p) => p.cid);
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
    const pairs = {};
    a.forEach((cid, i) => { pairs[cid] = a[(i + 1) % a.length]; }); // one ring: nobody draws themselves
    this.santa = { pairs, drawnAt: Date.now() };
    this.setMeta('santa', this.santa);
  }
  santaView(cid) {
    this.maybeDraw();
    const pool = this.santaPool(), pairs = this.santa.pairs;
    const rec = pairs?.[cid] ? pool.find((p) => p.cid === pairs[cid])?.name ?? null : null;
    return { count: pool.length, joined: pool.some((p) => p.cid === cid), drawAt: this.santaDrawAt(), drawn: !!pairs, recipient: rec };
  }

  /* ---------- WebSocket plumbing ---------- */
  live(except) { return this.ctx.getWebSockets().filter((w) => w !== except && w.readyState === 1); }
  send(ws, obj) { try { if (ws.readyState === 1) ws.send(JSON.stringify(obj)); } catch { /* socket went away */ } }
  broadcast(obj, except) { const frame = JSON.stringify(obj); for (const w of this.live(except)) { try { w.send(frame); } catch { /* ignore */ } } }
  broadcastOnline(except) { this.broadcast({ type: 'online', online: this.live(except).length, today: this.todayCount() }, except); }
  players(except) { return this.live(except).map((w) => w.deserializeAttachment()?.player).filter(Boolean); }

  spawnGift() {
    const a = Math.random() * Math.PI * 2, r = 5.5 + Math.random() * 7.5;
    const g = { id: crypto.randomUUID(), x: Math.cos(a) * r, z: Math.sin(a) * r, at: Date.now() };
    this.gifts.push(g); this.lastGiftAt = Date.now(); this.saveGifts();
    this.broadcast({ type: 'gift', gift: { ...g, age: 0 } });
  }
  async armAlarm() { if ((await this.ctx.storage.getAlarm()) == null) await this.ctx.storage.setAlarm(Date.now() + this.tick); }

  /** Replaces the setInterval of the Node server. Only keeps itself going while someone is connected. */
  async alarm() {
    const now = Date.now();
    const kept = this.gifts.filter((g) => now - g.at <= GIFT_TTL_MS);
    for (const g of this.gifts) if (!kept.includes(g)) this.broadcast({ type: 'giftgone', id: g.id });
    if (kept.length !== this.gifts.length) { this.gifts = kept; this.saveGifts(); }
    if (!this.live().length) return; // nobody here: stop ticking, the object can sleep
    const n = this.localDate(), q = `${this.dayKey(now)}-${n.getUTCHours()}-${n.getUTCMinutes()}`;
    if (n.getUTCMinutes() % 15 === 0 && q !== this.lastQuarter) { this.lastQuarter = q; this.spawnGift(); this.extraGiftAt = now + 4000; } // Santa flies over
    else if (this.extraGiftAt && now >= this.extraGiftAt) { this.extraGiftAt = 0; this.spawnGift(); }
    else if (this.gifts.length < 3 && now - this.lastGiftAt > this.giftEvery) this.spawnGift();
    await this.ctx.storage.setAlarm(this.extraGiftAt ? Math.min(this.extraGiftAt, now + this.tick) : now + this.tick);
  }

  /* ---------- HTTP (everything under /api plus the /ws upgrade) ---------- */
  async fetch(request) {
    const url = new URL(request.url), path = url.pathname, M = request.method;
    try {
      if (path === '/ws') {
        if (request.headers.get('Upgrade') !== 'websocket') return new Response('Expected WebSocket', { status: 426 });
        const pair = new WebSocketPair();
        const [client, server] = Object.values(pair);
        this.ctx.acceptWebSocket(server);
        server.serializeAttachment({ pid: `p${crypto.randomUUID().slice(0, 8)}`, cid: null, player: null });
        await this.armAlarm();
        return new Response(null, { status: 101, webSocket: client });
      }

      if (path === '/api/wishes' && M === 'GET') return json({ wishes: this.wishes });
      if (path === '/api/wishes' && M === 'POST') return await this.postWish(request);

      if (path === '/api/leaderboard' && M === 'GET') {
        const cid = clean(url.searchParams.get('cid'), 64);
        const top = this.sql.exec('SELECT name, points FROM scores ORDER BY points DESC, rowid ASC LIMIT 20').toArray();
        const mine = cid ? this.sql.exec('SELECT points FROM scores WHERE cid = ?', cid).toArray()[0] : null;
        const rank = mine ? this.sql.exec('SELECT COUNT(*) AS c FROM scores WHERE points > ?', mine.points).one().c + 1 : null;
        return json({ top, me: mine ? { rank, points: mine.points } : null });
      }

      if (path === '/api/santa' && M === 'GET') return json(this.santaView(clean(url.searchParams.get('cid'), 64)));
      if ((path === '/api/santa/join' || path === '/api/santa/leave') && M === 'POST') {
        const body = await this.readBody(request); if (body instanceof Response) return body;
        const cid = clean(body.cid, 64);
        if (path === '/api/santa/join') {
          const name = clean(body.name, 24);
          if (!cid || !name) return json({ error: 'bad_input' }, 400);
          this.maybeDraw();
          if (this.santa.pairs) return json({ error: 'drawn' }, 409);
          const exists = this.sql.exec('SELECT 1 FROM santa_pool WHERE cid = ?', cid).toArray().length;
          if (exists) this.sql.exec('UPDATE santa_pool SET name = ? WHERE cid = ?', name, cid);
          else if (this.sql.exec('SELECT COUNT(*) AS c FROM santa_pool').one().c < 200) this.sql.exec('INSERT INTO santa_pool (cid, name) VALUES (?, ?)', cid, name);
        } else {
          if (this.santa.pairs) return json({ error: 'drawn' }, 409);
          this.sql.exec('DELETE FROM santa_pool WHERE cid = ?', cid);
        }
        return json(this.santaView(cid));
      }

      return json({ error: 'not_found' }, 404);
    } catch (e) {
      console.error('hub error', e && e.stack || e);
      return json({ error: 'server_error' }, 500);
    }
  }

  async readBody(request) {
    const declared = Number(request.headers.get('content-length') || 0);
    if (declared > MAX_BODY) return json({ error: 'bad_body' }, 413); // a proper 413, unlike the Node server
    const text = await request.text();
    if (text.length > MAX_BODY) return json({ error: 'bad_body' }, 413);
    try { return JSON.parse(text) ?? {}; } catch { return json({ error: 'bad_body' }, 400); }
  }

  async postWish(request) {
    const ip = request.headers.get('cf-connecting-ip') || 'unknown';
    if (Date.now() - (this.lastPost.get(ip) ?? 0) < COOLDOWN_MS) return json({ error: 'too_fast' }, 429);
    const body = await this.readBody(request); if (body instanceof Response) return body;
    const w = this.makeWish(body, authorId(clean(body.cid, 64)));
    if (!w.wish) return json({ error: 'empty_wish' }, 400);
    this.lastPost.set(ip, Date.now());
    if (this.lastPost.size > 5000) for (const [k, v] of this.lastPost) if (Date.now() - v > COOLDOWN_MS) this.lastPost.delete(k);
    this.storeWish(w);
    this.broadcast({ type: 'wish', wish: w });
    const cid = clean(body.cid, 64);
    let points = 0;
    if (cid) {
      const day = this.dayKey(), k = `${day}:${cid}`;
      const n = (this.sql.exec('SELECT n FROM wishday WHERE k = ?', k).toArray()[0]?.n ?? 0) + 1;
      this.sql.exec('INSERT INTO wishday (k, n) VALUES (?, ?) ON CONFLICT(k) DO UPDATE SET n = excluded.n', k, n);
      this.sql.exec('DELETE FROM wishday WHERE substr(k, 1, 10) <> ?', day);
      if (n <= WISH_POINTS_PER_DAY) { this.addScore(cid, w.name, POINTS.wish); points = POINTS.wish; }
    }
    return json({ ...w, points }, 201);
  }

  /* ---------- WebSocket events (Hibernation API) ---------- */
  async webSocketMessage(ws, message) {
    if (typeof message !== 'string') return;
    if (message.length > MAX_WS_MESSAGE) { ws.close(1009, 'message too big'); return; }
    let m; try { m = JSON.parse(message); } catch { return; }
    if (!m || typeof m !== 'object') return;
    const att = ws.deserializeAttachment() ?? {};
    const save = () => ws.serializeAttachment(att);

    switch (m.type) {
      case 'hello': {
        att.cid = clean(m.cid, 64) || att.pid; save();
        this.recordVisit(att.cid);
        this.send(ws, {
          type: 'welcome', pid: att.pid, by: authorId(att.cid), online: this.live().length, today: this.todayCount(),
          players: this.players(), chat: this.chatLog.slice(-30),
          gifts: this.gifts.map((g) => ({ ...g, age: Date.now() - g.at })),
        });
        this.broadcastOnline();
        break;
      }
      case 'join': {
        if (!att.cid) return;
        const a = Math.random() * Math.PI * 2;
        att.player = {
          id: att.pid, name: clean(m.name, 24) || 'Khách', shirt: color(m.shirt, '#e63946'), hat: color(m.hat, '#d62839'),
          x: Math.cos(a) * 7, z: Math.sin(a) * 7,
        };
        save();
        this.broadcast({ type: 'join', player: att.player });
        break;
      }
      case 'move': {
        if (!att.player || Date.now() - (this.lastMove.get(att.pid) ?? 0) < 80) return;
        let x = Number(m.x), z = Number(m.z);
        if (!Number.isFinite(x) || !Number.isFinite(z)) return;
        const r = Math.hypot(x, z);
        if (r > WALK_RADIUS) { x *= WALK_RADIUS / r; z *= WALK_RADIUS / r; }
        this.lastMove.set(att.pid, Date.now());
        att.player.x = x; att.player.z = z; save();
        this.broadcast({ type: 'move', id: att.pid, x, z }, ws);
        break;
      }
      case 'chat': {
        if (!att.player) return this.send(ws, { type: 'error', code: 'not_joined' }); // tell the client instead of dropping silently
        const now = Date.now();
        const times = (this.chatTimes.get(att.pid) ?? []).filter((t) => now - t < 5000);
        if (times.length >= 3) { this.chatTimes.set(att.pid, times); return this.send(ws, { type: 'error', code: 'chat_fast' }); }
        const text = clean(m.text, 100);
        if (!text) return;
        times.push(now); this.chatTimes.set(att.pid, times);
        const msg = { type: 'chat', id: att.pid, name: att.player.name, text, t: now };
        this.chatLog.push(msg); if (this.chatLog.length > 50) this.chatLog.shift();
        this.setMeta('chat', this.chatLog);
        this.broadcast(msg);
        break;
      }
      case 'claim': {
        if (!att.cid) return;
        const i = this.gifts.findIndex((g) => g.id === m.id);
        if (i < 0) return;
        this.gifts.splice(i, 1); this.saveGifts();
        const total = this.addScore(att.cid, att.player?.name, POINTS.gift);
        this.send(ws, { type: 'claimed', id: m.id, points: POINTS.gift, total });
        this.broadcast({ type: 'giftgone', id: m.id, by: att.player?.name ?? null });
        break;
      }
      default:
    }
  }

  gone(ws) {
    const att = ws.deserializeAttachment();
    this.lastMove.delete(att?.pid); this.chatTimes.delete(att?.pid);
    if (att?.player) this.broadcast({ type: 'leave', id: att.pid }, ws);
    this.broadcastOnline(ws);
  }
  async webSocketClose(ws) { try { ws.close(1000, 'bye'); } catch { /* already closed */ } this.gone(ws); }
  async webSocketError(ws) { this.gone(ws); }
}
