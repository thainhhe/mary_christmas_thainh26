// Anonymous, cookie-free usage stats (page views + a few app events). The server never stores IPs; see server/analytics.
// Not sent from localhost unless the URL has ?track (so development does not pollute the numbers).
import { bus } from './state.js';

const EVENTS = new Set(['join', 'wish', 'gift', 'chat', 'photo', 'video_start', 'video_done', 'share', 'santa_join', 'mission_claim', 'lang_switch', 'feedback_open', 'feedback_sent', 'tarot_open', 'tarot_shuffle', 'tarot_read', 'tarot_again']);
const q = new URLSearchParams(location.search);
const local = ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname);
const enabled = !local || q.has('track');

function post(body) {
  try {
    const data = JSON.stringify(body);
    if (navigator.sendBeacon && navigator.sendBeacon('/api/a', new Blob([data], { type: 'application/json' }))) return;
    fetch('/api/a', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: data, keepalive: true }).catch(() => {});
  } catch { /* analytics must never break the app */ }
}

/** Count an app event, e.g. track('video_start'). Unknown names are ignored. */
export function track(name) {
  if (enabled && EVENTS.has(name)) post({ t: 'ev', e: name });
}

export function initAnalytics() {
  if (!enabled) return;
  // ?utm_source= or ?ref= lets you tell campaign links apart (e.g. https://…/?ref=tiktok-bio)
  post({ t: 'pv', p: location.pathname, r: document.referrer, s: q.get('utm_source') || q.get('ref') || '' });
  for (const name of ['wish', 'gift', 'chat', 'photo']) bus.on(name, () => track(name)); // already emitted by the app on success
}
