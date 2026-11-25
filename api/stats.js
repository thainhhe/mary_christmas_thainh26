// Vercel Node function behind /stats, /stats/login, /stats/logout, /stats/data/:range  (see vercel.json rewrites)
import { stats } from '../server/analytics/index.js';

export default function handler(req, res) {
  const q = new URL(req.url, 'http://x').searchParams;
  return stats(req, res, q.get('action') || 'page', q.get('range'));
}
