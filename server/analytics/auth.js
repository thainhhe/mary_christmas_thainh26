// Login for /stats. Everything is checked on the server:
//  - the password is only ever compared against a scrypt hash (never stored or sent to the browser),
//  - a successful login sets an HttpOnly, SameSite=Strict, signed session cookie (JavaScript cannot read it),
//  - failed/rapid attempts are rate limited per IP and globally.
import { createHash, createHmac, randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { redisToken } from './store.js';

const DEFAULT_USER = 'thainh26';
// scrypt hash of the default password. Replace with your own:  npm run stats:hash -- "new password"
// then set STATS_PASS_HASH (and optionally STATS_USER) in the environment.
const DEFAULT_HASH = 'scrypt$16384$fa2daf45dc2359762493faa40ad7ba4c$af3e1c6f44dff1a29f15d5457a2d5f7ec94456b8ed113480ab4e61d26a74ead5';

// Same password, cheaper cost (N=2048, ~4 ms CPU): Cloudflare Workers Free allows only 10 ms CPU per request.
// Used when STATS_LIGHT_KDF=1 (set in wrangler.jsonc).
const DEFAULT_HASH_LIGHT = 'scrypt$2048$3951a7a285e5f282b10d7aad072c7c28$d1bfae2cffe6f1537cd007b84f9f4c9bfb50400781ee01df8de84b303c1d6c76';

const SESSION_SEC = 12 * 3600;
export const COOKIE = 'stats_session';
export const isProd = () => !!process.env.VERCEL || process.env.NODE_ENV === 'production';

const sha = (s) => createHash('sha256').update(s).digest();
const user = () => process.env.STATS_USER || DEFAULT_USER;
const passHash = () => process.env.STATS_PASS_HASH || (process.env.STATS_LIGHT_KDF === '1' ? DEFAULT_HASH_LIGHT : DEFAULT_HASH);
export const usingDefaultCredentials = () => !process.env.STATS_PASS_HASH;

const scryptAsync = (pw, salt, len, opts) => new Promise((res, rej) => scrypt(pw, salt, len, opts, (e, k) => (e ? rej(e) : res(k))));
const SCRYPT = { r: 8, p: 1, maxmem: 64 * 1024 * 1024 };

export async function hashPassword(pw, saltHex = randomBytes(16).toString('hex'), N = 16384) {
  const key = await scryptAsync(pw, Buffer.from(saltHex, 'hex'), 32, { ...SCRYPT, N });
  return `scrypt$${N}$${saltHex}$${key.toString('hex')}`;
}
async function checkPassword(pw, stored) {
  const [alg, N, salt, hash] = String(stored).split('$');
  if (alg !== 'scrypt' || !N || !salt || !hash) return false;
  const key = await scryptAsync(pw, Buffer.from(salt, 'hex'), hash.length / 2, { ...SCRYPT, N: Number(N) });
  const want = Buffer.from(hash, 'hex');
  return key.length === want.length && timingSafeEqual(key, want);
}

/** Verifies both fields in constant time; the (slow) hash is always computed so timing does not reveal the user name. */
export async function verifyLogin(u, p) {
  const userOk = timingSafeEqual(sha(String(u)), sha(user()));
  const passOk = await checkPassword(String(p), passHash());
  return userOk && passOk;
}

/* ---------- signing secret ---------- */
let localSecret = null;
export function secret() {
  if (process.env.STATS_SECRET) return process.env.STATS_SECRET;
  const tok = redisToken();
  if (tok) return sha(`noel-stats|${tok}`).toString('hex'); // a secret the server already has, never exposed
  if (!isProd()) return (localSecret ??= randomBytes(32).toString('hex')); // local: sessions reset on restart
  return null; // production without any secret: refuse to create sessions
}

/* ---------- session cookie ---------- */
const bind = () => sha(`${user()}|${passHash()}`).toString('hex').slice(0, 16); // changing the password logs everyone out
const sign = (exp) => createHmac('sha256', secret()).update(`${exp}|${bind()}`).digest('base64url');

export function makeCookie(req) {
  const exp = Math.floor(Date.now() / 1000) + SESSION_SEC;
  const secure = req.headers['x-forwarded-proto'] === 'https' || isProd() ? '; Secure' : '';
  return `${COOKIE}=${exp}.${sign(exp)}; Path=/stats; HttpOnly; SameSite=Strict; Max-Age=${SESSION_SEC}${secure}`;
}
export const clearCookie = () => `${COOKIE}=; Path=/stats; HttpOnly; SameSite=Strict; Max-Age=0`;

export function isAuthed(req) {
  if (!secret()) return false;
  const raw = String(req.headers.cookie || '').split(';').map((s) => s.trim()).find((s) => s.startsWith(`${COOKIE}=`));
  if (!raw) return false;
  const [exp, sig] = raw.slice(COOKIE.length + 1).split('.');
  if (!exp || !sig || !/^\d+$/.test(exp) || Number(exp) < Date.now() / 1000) return false;
  const want = Buffer.from(sign(exp)), got = Buffer.from(sig);
  return want.length === got.length && timingSafeEqual(want, got);
}
