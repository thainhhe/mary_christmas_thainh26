// Storage for the analytics counters. Three back-ends behind one interface:
//   redis  – Upstash Redis over its REST API (Vercel: Marketplace > Upstash Redis, env vars are injected automatically)
//   file   – data/analytics.json (local `npm start`)
//   none   – Vercel without a store connected: nothing is persisted (the /stats page says so)
//
// Interface:
//   record({ day, incr: { field: n }, uv })  add counters to a day (+ one unique-visitor hash)
//   read(days)                                -> [{ day, fields, uv }]
//   hit(key, windowSec)                       -> count within the window (rate limiting)
//   del(key)
// Node-only modules (fs, path, url) are imported lazily so this file also bundles for Cloudflare Workers,
// where only the redis/none/Durable-Object back-ends are used.
const KEEP_DAYS_FILE = 120;
const TTL_SEC = 400 * 86400;
const FB_KEY = 'noel:fb';
const FB_KEEP = 1000;

/** items: newest first. Returns the newest `limit` since `since` plus the rating distribution of everything since then. */
export function summarizeFeedback(all, since, limit) {
  const inRange = all.filter((x) => x.t >= since);
  const byRating = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0 };
  for (const x of inRange) byRating[x.r] = (byRating[x.r] || 0) + 1;
  return { total: inRange.length, byRating, items: inRange.slice(0, limit) };
}

/* ---------- tiny in-memory counter with expiry (rate limits for file/none back-ends) ---------- */
function memoryLimiter() {
  const m = new Map();
  setInterval(() => { const now = Date.now(); for (const [k, v] of m) if (v.until < now) m.delete(k); }, 60_000).unref?.();
  return {
    async hit(key, windowSec) {
      const now = Date.now();
      let v = m.get(key);
      if (!v || v.until < now) v = { n: 0, until: now + windowSec * 1000 };
      v.n++; m.set(key, v);
      return v.n;
    },
    async del(key) { m.delete(key); },
  };
}

/* ---------- Upstash Redis (REST) ---------- */
function redisStore(url, token) {
  const base = url.replace(/\/+$/, '');
  async function pipeline(cmds) {
    const r = await fetch(`${base}/pipeline`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(cmds) });
    if (!r.ok) throw new Error(`redis http ${r.status}`);
    const out = await r.json();
    return out.map((o) => { if (o.error) throw new Error(`redis: ${o.error}`); return o.result; });
  }
  const hKey = (day) => `noel:a:${day}`;
  const uKey = (day) => `noel:a:uv:${day}`;
  return {
    kind: 'redis',
    async record({ day, incr, uv }) {
      const cmds = Object.entries(incr).map(([f, n]) => ['HINCRBY', hKey(day), f, String(n)]);
      cmds.push(['EXPIRE', hKey(day), String(TTL_SEC)]);
      if (uv) { cmds.push(['PFADD', uKey(day), uv]); cmds.push(['EXPIRE', uKey(day), String(TTL_SEC)]); }
      await pipeline(cmds);
    },
    async read(days) {
      if (!days.length) return [];
      const cmds = [];
      for (const d of days) { cmds.push(['HGETALL', hKey(d)]); cmds.push(['PFCOUNT', uKey(d)]); }
      const res = await pipeline(cmds);
      return days.map((day, i) => {
        const flat = res[i * 2] || [], fields = {};
        for (let j = 0; j + 1 < flat.length; j += 2) fields[flat[j]] = Number(flat[j + 1]) || 0;
        return { day, fields, uv: Number(res[i * 2 + 1]) || 0 };
      });
    },
    async addFeedback(item) { await pipeline([['LPUSH', FB_KEY, JSON.stringify(item)], ['LTRIM', FB_KEY, '0', String(FB_KEEP - 1)]]); },
    async readFeedback(since, limit) {
      const [raw] = await pipeline([['LRANGE', FB_KEY, '0', String(FB_KEEP - 1)]]);
      return summarizeFeedback((raw || []).map((x) => { try { return JSON.parse(x); } catch { return null; } }).filter(Boolean), since, limit);
    },
    async hit(key, windowSec) {
      const k = `noel:rl:${key}`;
      const res = await pipeline([['SET', k, '0', 'EX', String(windowSec), 'NX'], ['INCR', k]]);
      return Number(res[1]) || 1;
    },
    async del(key) { await pipeline([['DEL', `noel:rl:${key}`]]); },
  };
}

/* ---------- JSON file ---------- */
function fileStore() {
  let db = null, timer = 0, chain = Promise.resolve(), fs = null, path = null, file = '';
  const sets = new Map(); // day -> Set of visitor hashes
  const limiter = memoryLimiter();
  async function load() {
    if (db) return db;
    fs = (await import('node:fs/promises')).default;
    path = (await import('node:path')).default;
    const { fileURLToPath } = await import('node:url');
    file = path.join(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..'), 'data', 'analytics.json');
    try { db = JSON.parse(await fs.readFile(file, 'utf8')); } catch { db = { days: {} }; }
    db.days ??= {};
    db.feedback ??= [];
    for (const [day, r] of Object.entries(db.days)) sets.set(day, new Set(r.u || []));
    return db;
  }
  function save() {
    clearTimeout(timer);
    timer = setTimeout(() => {
      chain = chain.then(async () => {
        for (const [day, s] of sets) if (db.days[day]) db.days[day].u = [...s];
        const keep = Object.keys(db.days).sort().slice(-KEEP_DAYS_FILE);
        for (const d of Object.keys(db.days)) if (!keep.includes(d)) { delete db.days[d]; sets.delete(d); }
        await fs.mkdir(path.dirname(file), { recursive: true });
        const tmp = `${file}.${process.pid}.tmp`;
        await fs.writeFile(tmp, JSON.stringify(db));
        await fs.rename(tmp, file);
      }).catch((e) => console.error('analytics write failed:', e));
    }, 400);
    timer.unref?.();
  }
  const flush = async () => { clearTimeout(timer); if (db) { for (const [day, s] of sets) if (db.days[day]) db.days[day].u = [...s]; await fs.mkdir(path.dirname(file), { recursive: true }); await fs.writeFile(file, JSON.stringify(db)); } };
  for (const sig of ['SIGINT', 'SIGTERM']) process.once(sig, () => { flush().finally(() => process.exit(0)); });
  return {
    kind: 'file',
    ...limiter,
    async record({ day, incr, uv }) {
      const d = await load();
      const rec = (d.days[day] ??= { f: {}, u: [] });
      for (const [k, n] of Object.entries(incr)) rec.f[k] = (rec.f[k] || 0) + n;
      if (uv) { let s = sets.get(day); if (!s) { s = new Set(); sets.set(day, s); } s.add(uv); }
      save();
    },
    async read(days) {
      const d = await load();
      return days.map((day) => ({ day, fields: { ...(d.days[day]?.f || {}) }, uv: sets.get(day)?.size || 0 }));
    },
    async addFeedback(item) { const d = await load(); d.feedback.unshift(item); if (d.feedback.length > FB_KEEP) d.feedback.length = FB_KEEP; save(); },
    async readFeedback(since, limit) { const d = await load(); return summarizeFeedback(d.feedback, since, limit); },
  };
}

/* ---------- nothing connected ---------- */
function noneStore() {
  const fb = [];
  return { kind: 'none', ...memoryLimiter(), async record() {}, async read(days) { return days.map((day) => ({ day, fields: {}, uv: 0 })); },
    async addFeedback(item) { fb.unshift(item); if (fb.length > 200) fb.length = 200; }, async readFeedback(since, limit) { return summarizeFeedback(fb, since, limit); } };
}

let cached = null;
export function getStore() {
  if (cached) return cached;
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  if (url && token) cached = redisStore(url, token);
  else if (process.env.VERCEL) cached = noneStore();
  else cached = fileStore();
  return cached;
}
/** Lets a host (the Cloudflare Worker) plug in its own back-end. */
export const setStore = (s) => { cached = s; };
export const redisToken = () => process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || '';
