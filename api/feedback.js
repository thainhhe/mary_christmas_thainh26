// Vercel Node function: POST /api/feedback  (user feedback, shown in /stats)
import { feedback } from '../server/analytics/index.js';

export default function handler(req, res) {
  return feedback(req, res);
}
