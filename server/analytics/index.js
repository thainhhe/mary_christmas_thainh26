// Privacy-friendly analytics (in the spirit of Vercel Web Analytics):
//  - no cookies, no raw IPs stored: a visitor is sha256(daily-secret-salt + ip + user-agent), counted per day only,
//  - bots are filtered, event names are a fixed whitelist, every string is sanitised before it becomes a counter key.
// Framework-free: works with Node's http server and as a Vercel Node function (api/a.js, api/stats.js).
import { createHash } from 'node:crypto';
import { getStore } from './store.js';
import { COOKIE, clearCookie, isAuthed, isProd, makeCookie, secret, usingDefaultCredentials, verifyLogin } from './auth.js';
import { dashboardPage, loginPage } from './pages.js';

export const EVENTS = ['join', 'wish', 'gift', 'chat', 'photo', 'video_start', 'video_done', 'share', 'santa_join', 'mission_claim', 'lang_switch', 'feedback_open', 'feedback_sent', 'tarot_open', 'tarot_shuffle', 'tarot_read', 'tarot_again'];
const EVENT_SET = new Set(EVENTS);
const TZ_HOURS = Number(process.env.STATS_TZ_OFFSET ?? 7); // days roll over at midnight Vietnam time

/* ---------- helpers ---------- */
const dayOf = (ms) => new Date(ms + TZ_HOURS * 3600e3).toISOString().slice(0, 10);
const lastDays = (n, endMs = Date.now()) => Array.from({ length: n }, (_, i) => dayOf(endMs - (n - 1 - i) * 86400e3));
const sha = (s) => createHash('sha256').update(s).digest('hex');

function trustProxy() { return !!process.env.VERCEL || process.env.STATS_TRUST_PROXY === '1'; }
export function clientIp(req) {
  if (trustProxy()) {
    if (req.headers['cf-connecting-ip']) return String(req.headers['cf-connecting-ip']); // Cloudflare sets this itself
    const xff = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
    if (xff) return xff;
    if (req.headers['x-real-ip']) return String(req.headers['x-real-ip']);
  }
  return req.socket?.remoteAddress || 'unknown';
}

async function readJson(req, max = 2048) {
  let b = req.body;
  if (b === undefined || b === null) { // plain Node http: read the stream
    let size = 0; const chunks = [];
    for await (const c of req) { size += c.length; if (size > max) return null; chunks.push(c); }
    b = Buffer.concat(chunks).toString('utf8');
  }
  if (Buffer.isBuffer(b)) b = b.toString('utf8');
  if (typeof b === 'string') { if (b.length > max) return null; try { b = JSON.parse(b); } catch { return null; } }
  return b && typeof b === 'object' && !Array.isArray(b) ? b : null;
}

const send = (res, code, body, headers = {}) => {
  const isObj = body !== null && typeof body === 'object';
  res.writeHead(code, { 'Cache-Control': 'no-store', ...(isObj ? { 'Content-Type': 'application/json; charset=utf-8' } : {}), ...headers });
  res.end(body === undefined ? undefined : isObj ? JSON.stringify(body) : body);
};

/* ---------- user agent ---------- */
const BOT = /bot|crawl|spider|slurp|headless|lighthouse|pagespeed|preview|facebookexternalhit|embedly|curl|wget|python|node-fetch|undici|axios|go-http|java\/|monitor|uptime|phantom|selenium|puppeteer|playwright/i;
export function parseUA(ua) {
  const u = String(ua || '');
  const browser = /TikTok|musical_ly|BytedanceWebview/i.test(u) ? 'TikTok'
    : /FBAN|FBAV/i.test(u) ? 'Facebook' : /Instagram/i.test(u) ? 'Instagram' : /Zalo/i.test(u) ? 'Zalo'
      : /Edg\//.test(u) ? 'Edge' : /OPR\/|Opera/.test(u) ? 'Opera' : /SamsungBrowser/.test(u) ? 'Samsung Internet'
        : /Firefox|FxiOS/.test(u) ? 'Firefox' : /Chrome|CriOS/.test(u) ? 'Chrome' : /Safari/.test(u) ? 'Safari' : 'Khác';
  const os = /iPhone|iPad|iPod/.test(u) ? 'iOS' : /Android/.test(u) ? 'Android' : /Windows/.test(u) ? 'Windows'
    : /Mac OS X|Macintosh/.test(u) ? 'macOS' : /CrOS/.test(u) ? 'ChromeOS' : /Linux/.test(u) ? 'Linux' : 'Khác';
  const device = /iPad|Tablet/.test(u) || (/Android/.test(u) && !/Mobile/.test(u)) ? 'tablet' : /Mobi|iPhone|iPod|Android/.test(u) ? 'mobile' : 'desktop';
  return { browser, os, device };
}

/* ---------- sanitisers (counter keys must never be attacker-controlled free text) ---------- */
const ALIAS = { 'l.facebook.com': 'facebook.com', 'lm.facebook.com': 'facebook.com', 'm.facebook.com': 'facebook.com', 'l.instagram.com': 'instagram.com', 't.co': 'x.com', 'away.vk.com': 'vk.com' };
function source(payload, host) {
  const s = String(payload.s || '').toLowerCase();
  if (/^[a-z0-9_.-]{1,30}$/.test(s)) return s; // ?utm_source= / ?ref= (campaign links, e.g. ?ref=tiktok-bio)
  try {
    let h = new URL(String(payload.r || '')).hostname.toLowerCase().replace(/^www\./, '');
    if (!h || h === String(host || '').split(':')[0].replace(/^www\./, '')) return 'direct';
    h = ALIAS[h] || h;
    return /^[a-z0-9.-]{1,60}$/.test(h) ? h : 'other';
  } catch { return 'direct'; }
}
const cleanPath = (p) => { const s = String(p || '/').split(/[?#]/)[0]; return /^\/[\w\-./]{0,59}$/.test(s) ? s : '/'; };
function country(req) {
  const c = String(req.headers['x-vercel-ip-country'] || req.headers['cf-ipcountry'] || '').toUpperCase();
  return /^[A-Z]{2}$/.test(c) && c !== 'XX' && c !== 'T1' ? c : 'ZZ';
}

/* ---------- POST /api/a ---------- */
export async function collect(req, res) {
  try {
    if (req.method !== 'POST') return send(res, 405, undefined, { Allow: 'POST' });
    const body = await readJson(req);
    if (!body) return send(res, 204);
    const ua = String(req.headers['user-agent'] || '');
    if ((!ua || BOT.test(ua)) && process.env.STATS_ALLOW_BOTS !== '1') return send(res, 204); // bots are not visitors
    const kind = body.t === 'ev' ? 'ev' : body.t === 'pv' ? 'pv' : null;
    if (!kind || (kind === 'ev' && !EVENT_SET.has(body.e))) return send(res, 204);

    const store = getStore();
    const day = dayOf(Date.now());
    const salt = sha(`${secret() || 'noel'}|${day}`);
    const visitor = sha(`${salt}|${clientIp(req)}|${ua}`).slice(0, 16);

    if ((await store.hit(`ev:${visitor}:${Math.floor(Date.now() / 60000)}`, 90)) > 120) return send(res, 204); // flood guard
    const incr = {};
    if (kind === 'pv') {
      const { browser, os, device } = parseUA(ua);
      incr.pv = 1;
      incr[`ref:${source(body, req.headers.host)}`] = 1;
      incr[`ctry:${country(req)}`] = 1;
      incr[`dev:${device}`] = 1; incr[`br:${browser}`] = 1; incr[`os:${os}`] = 1;
      incr[`pg:${cleanPath(body.p)}`] = 1;
    } else incr[`ev:${body.e}`] = 1;
    await store.record({ day, incr, uv: visitor });
    return send(res, 204);
  } catch (e) {
    console.error('analytics collect failed:', e.message);
    return send(res, 204); // never break the page because of analytics
  }
}

/* ---------- POST /api/feedback ---------- */
const FB_FROM = new Set(['menu', 'wish', 'video']);
// eslint-disable-next-line no-control-regex
const cleanMultiline = (s, max) => String(s ?? '').replace(/\r/g, '').replace(/[\u0000-\u0009\u000b-\u001f\u007f]/g, ' ').replace(/[ \t]+/g, ' ').replace(/ ?\n ?/g, '\n').replace(/\n{3,}/g, '\n\n').trim().slice(0, max);
// eslint-disable-next-line no-control-regex
const cleanLine = (s, max) => String(s ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);

/** A rating (1-4, 4 = best) and/or free text, plus an optional contact. No name, no IP; only device type + language. */
export async function feedback(req, res) {
  try {
    if (req.method !== 'POST') return send(res, 405, undefined, { Allow: 'POST' });
    const origin = req.headers.origin, host = req.headers.host;
    if (origin && host) { try { if (new URL(origin).host !== host) return send(res, 403, { error: 'forbidden' }); } catch { return send(res, 403, { error: 'forbidden' }); } } // same-site only
    if (!/application\/json/i.test(String(req.headers['content-type'] || ''))) return send(res, 415, { error: 'bad_type' });
    const body = await readJson(req, 4096);
    if (!body) return send(res, 400, { error: 'bad_body' });
    if (body.website) return send(res, 200, { ok: true }); // honeypot filled in: a bot. Pretend it worked.
    const r = [1, 2, 3, 4].includes(Number(body.r)) ? Number(body.r) : 0;
    const text = cleanMultiline(body.text, 500), contact = cleanLine(body.contact, 100);
    if (!r && !text) return send(res, 400, { error: 'empty' });
    const store = getStore();
    if ((await store.hit(`fb:${sha(clientIp(req)).slice(0, 16)}`, 3600)) > 3) return send(res, 429, { error: 'too_many' }, { 'Retry-After': '3600' });
    await store.addFeedback({
      t: Date.now(), r, text, contact,
      lang: body.lang === 'en' ? 'en' : 'vi', dev: parseUA(req.headers['user-agent']).device, from: FB_FROM.has(body.from) ? body.from : 'menu',
    });
    return send(res, 200, { ok: true });
  } catch (e) {
    console.error('feedback failed:', e.message);
    return send(res, 500, { error: 'server_error' });
  }
}

/* ---------- /stats ---------- */
const PAGE_HEADERS = {
  'Content-Type': 'text/html; charset=utf-8',
  'X-Robots-Tag': 'noindex, nofollow',
  'X-Frame-Options': 'DENY',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'Content-Security-Policy': "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; img-src data:; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
};

const sumPrefix = (rows, prefix, top) => {
  const m = new Map();
  for (const r of rows) for (const [k, v] of Object.entries(r.fields)) if (k.startsWith(prefix)) m.set(k.slice(prefix.length), (m.get(k.slice(prefix.length)) || 0) + v);
  const list = [...m].map(([k, n]) => ({ k, n })).sort((a, b) => b.n - a.n);
  return top ? list.slice(0, top) : list;
};
const totals = (rows) => ({ pv: rows.reduce((s, r) => s + (r.fields.pv || 0), 0), uv: rows.reduce((s, r) => s + r.uv, 0), ev: sumPrefix(rows, 'ev:').reduce((s, e) => s + e.n, 0) });

async function buildReport(range) {
  const store = getStore();
  const days = lastDays(range);
  const prevDays = lastDays(range, Date.now() - range * 86400e3);
  const since = Date.parse(`${days[0]}T00:00:00Z`) - TZ_HOURS * 3600e3; // start of the first day in the range
  const [rows, prevRows, fb] = await Promise.all([store.read(days), store.read(prevDays), store.readFeedback(since, 50)]);
  const evMap = new Map(sumPrefix(rows, 'ev:').map((e) => [e.k, e.n]));
  return {
    fb,
    range, store: store.kind, tz: TZ_HOURS, generatedAt: Date.now(),
    series: rows.map((r) => ({ d: r.day, pv: r.fields.pv || 0, uv: r.uv })),
    totals: totals(rows), prev: totals(prevRows),
    ref: sumPrefix(rows, 'ref:', 10), ctry: sumPrefix(rows, 'ctry:', 10), dev: sumPrefix(rows, 'dev:'),
    br: sumPrefix(rows, 'br:', 10), os: sumPrefix(rows, 'os:', 10), pg: sumPrefix(rows, 'pg:', 10),
    ev: EVENTS.map((k) => ({ k, n: evMap.get(k) || 0 })),
  };
}

/** action: page | login | logout | data   (data takes the range as the 4th argument) */
export async function stats(req, res, action = 'page', rangeArg) {
  try {
    if (action === 'page') {
      if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, undefined, { Allow: 'GET, HEAD' });
      return send(res, 200, isAuthed(req) ? dashboardPage() : loginPage(), PAGE_HEADERS);
    }

    if (action === 'login') {
      if (req.method !== 'POST') return send(res, 405, undefined, { Allow: 'POST' });
      if (!secret()) return send(res, 503, { error: 'not_configured' });
      if (!/application\/json/i.test(String(req.headers['content-type'] || ''))) return send(res, 415, { error: 'bad_type' });
      const store = getStore();
      const ip = clientIp(req);
      const [perIp, global] = await Promise.all([store.hit(`login:${sha(ip).slice(0, 16)}`, 900), store.hit('login:all', 3600)]);
      if (perIp > 8 || global > 80) return send(res, 429, { error: 'too_many' }, { 'Retry-After': '900' });
      const body = await readJson(req, 1024);
      const u = typeof body?.u === 'string' ? body.u.slice(0, 100) : '', p = typeof body?.p === 'string' ? body.p.slice(0, 200) : '';
      const ok = await verifyLogin(u, p);
      if (!ok) { await new Promise((r) => setTimeout(r, 400)); return send(res, 401, { error: 'invalid' }); }
      await store.del(`login:${sha(ip).slice(0, 16)}`);
      if (usingDefaultCredentials() && isProd()) console.warn('[stats] using the DEFAULT credentials in production – set STATS_PASS_HASH');
      return send(res, 200, { ok: true }, { 'Set-Cookie': makeCookie(req) });
    }

    if (action === 'logout') {
      if (req.method !== 'POST') return send(res, 405, undefined, { Allow: 'POST' });
      return send(res, 200, { ok: true }, { 'Set-Cookie': clearCookie() });
    }

    if (action === 'data') {
      if (req.method !== 'GET') return send(res, 405, undefined, { Allow: 'GET' });
      if (!isAuthed(req)) return send(res, 401, { error: 'unauthorized' });
      const range = [7, 30, 90].includes(Number(rangeArg)) ? Number(rangeArg) : 7;
      return send(res, 200, await buildReport(range));
    }

    return send(res, 404, { error: 'not_found' });
  } catch (e) {
    console.error('stats failed:', e.message);
    return send(res, 500, { error: 'server_error' });
  }
}

export { COOKIE };
