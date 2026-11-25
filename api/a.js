// Vercel Node function: POST /api/a  (page views + app events)
import { collect } from '../server/analytics/index.js';

export default function handler(req, res) {
  return collect(req, res);
}
