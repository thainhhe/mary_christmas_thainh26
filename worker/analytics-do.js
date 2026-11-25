// Analytics counters in their own Durable Object (SQLite), plus the store adapter the shared analytics code talks to.
// Writes are buffered in memory and flushed in one batch every few seconds: a page view touches ~8 counters, and
// the free plan only includes 100k written rows a day, so batching keeps a traffic spike from using it all up
// (and from starving the game's own writes).
import { DurableObject } from 'cloudflare:workers';

const FLUSH_MS = 3000;
const KEEP_DAYS = 400;

export class Analytics extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.sql = ctx.storage.sql;
    this.counts = new Map(); // "day\0field" -> n   (not yet written)
    this.uv = new Map(); // day -> Set of visitor hashes (not yet written)
    this.limits = new Map(); // key -> { n, until }  (rate limits live in memory only)
    this.alarmSet = false;
    ctx.blockConcurrencyWhile(async () => {
      this.sql.exec(`CREATE TABLE IF NOT EXISTS an_counts (day TEXT NOT NULL, field TEXT NOT NULL, n INTEGER NOT NULL, PRIMARY KEY (day, field))`);
      this.sql.exec(`CREATE TABLE IF NOT EXISTS an_uv (day TEXT NOT NULL, h TEXT NOT NULL, PRIMARY KEY (day, h))`);
      this.sql.exec(`CREATE TABLE IF NOT EXISTS feedback (id INTEGER PRIMARY KEY AUTOINCREMENT, t INTEGER NOT NULL, r INTEGER NOT NULL, text TEXT NOT NULL, contact TEXT NOT NULL, lang TEXT NOT NULL, dev TEXT NOT NULL, src TEXT NOT NULL)`);
    });
  }

  async record({ day, incr, uv }) {
    for (const [f, n] of Object.entries(incr)) { const k = `${day}\0${f}`; this.counts.set(k, (this.counts.get(k) || 0) + n); }
    if (uv) { let s = this.uv.get(day); if (!s) this.uv.set(day, (s = new Set())); s.add(uv); }
    if (!this.alarmSet) { this.alarmSet = true; if ((await this.ctx.storage.getAlarm()) == null) await this.ctx.storage.setAlarm(Date.now() + FLUSH_MS); }
  }

  async alarm() { this.alarmSet = false; this.flush(); }

  flush() {
    if (!this.counts.size && !this.uv.size) return;
    const counts = [...this.counts], uv = [...this.uv];
    this.counts = new Map(); this.uv = new Map();
    this.ctx.storage.transactionSync(() => {
      for (const [k, n] of counts) {
        const [day, field] = k.split('\0');
        this.sql.exec('INSERT INTO an_counts (day, field, n) VALUES (?, ?, ?) ON CONFLICT(day, field) DO UPDATE SET n = n + excluded.n', day, field, n);
      }
      for (const [day, set] of uv) for (const h of set) this.sql.exec('INSERT OR IGNORE INTO an_uv (day, h) VALUES (?, ?)', day, h);
      const cut = new Date(Date.now() - KEEP_DAYS * 864e5).toISOString().slice(0, 10);
      this.sql.exec('DELETE FROM an_counts WHERE day < ?', cut);
      this.sql.exec('DELETE FROM an_uv WHERE day < ?', cut);
    });
  }

  async read(days) {
    this.flush(); // include what is still buffered
    if (!days.length) return [];
    const ph = days.map(() => '?').join(',');
    const rows = this.sql.exec(`SELECT day, field, n FROM an_counts WHERE day IN (${ph})`, ...days).toArray();
    const uvs = this.sql.exec(`SELECT day, COUNT(*) AS c FROM an_uv WHERE day IN (${ph}) GROUP BY day`, ...days).toArray();
    const byDay = new Map(days.map((d) => [d, { day: d, fields: {}, uv: 0 }]));
    for (const r of rows) byDay.get(r.day).fields[r.field] = r.n;
    for (const r of uvs) byDay.get(r.day).uv = r.c;
    return days.map((d) => byDay.get(d));
  }

  // Feedback is rare (rate limited per IP), so it is written straight away, not batched.
  async addFeedback(x) {
    this.sql.exec('INSERT INTO feedback (t, r, text, contact, lang, dev, src) VALUES (?, ?, ?, ?, ?, ?, ?)', x.t, x.r, x.text, x.contact, x.lang, x.dev, x.from);
    this.sql.exec('DELETE FROM feedback WHERE id <= (SELECT MAX(id) - 2000 FROM feedback)');
  }
  async readFeedback(since, limit) {
    const items = this.sql.exec('SELECT t, r, text, contact, lang, dev, src AS "from" FROM feedback WHERE t >= ? ORDER BY id DESC LIMIT ?', since, limit).toArray();
    const byRating = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0 };
    let total = 0;
    for (const r of this.sql.exec('SELECT r, COUNT(*) AS c FROM feedback WHERE t >= ? GROUP BY r', since).toArray()) { byRating[r.r] = r.c; total += r.c; }
    return { total, byRating, items };
  }

  async hit(key, windowSec) {
    const now = Date.now();
    let v = this.limits.get(key);
    if (!v || v.until < now) v = { n: 0, until: now + windowSec * 1000 };
    v.n++; this.limits.set(key, v);
    if (this.limits.size > 20000) for (const [k, x] of this.limits) if (x.until < now) this.limits.delete(k);
    return v.n;
  }
  async del(key) { this.limits.delete(key); }
}

/** Adapter with the same interface as the other stores in server/analytics/store.js. */
export function doStore(env) {
  const stub = () => env.ANALYTICS.get(env.ANALYTICS.idFromName('main'));
  return {
    kind: 'cloudflare',
    record: (x) => stub().record(x),
    read: (days) => stub().read(days),
    hit: (key, windowSec) => stub().hit(key, windowSec),
    del: (key) => stub().del(key),
    addFeedback: (x) => stub().addFeedback(x),
    readFeedback: (since, limit) => stub().readFeedback(since, limit),
  };
}
