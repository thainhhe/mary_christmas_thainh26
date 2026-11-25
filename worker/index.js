// Cloudflare Worker entry: static site (assets) + game API/WebSocket (Hub Durable Object) + analytics (/api/a, /stats).
import { collect, feedback, stats } from '../server/analytics/index.js';
import { setStore } from '../server/analytics/store.js';
import { Hub } from './hub.js';
import { Analytics, doStore } from './analytics-do.js';
import { runNodeHandler } from './node-shim.js';

export { Hub, Analytics }; // Durable Object classes must be exported from the entry module

export default {
  async fetch(request, env) {
    const { pathname: p } = new URL(request.url);

    // analytics: page views / events, and the login-protected report
    if (p === '/api/a') { setStore(doStore(env)); return runNodeHandler(request, collect); }
    if (p === '/api/feedback') { setStore(doStore(env)); return runNodeHandler(request, feedback); }
    if (p === '/stats' || p.startsWith('/stats/')) {
      setStore(doStore(env));
      const [, , action = 'page', arg] = p.split('/'); // /stats | /stats/login | /stats/data/30
      return runNodeHandler(request, (req, res) => stats(req, res, action || 'page', arg));
    }

    // the game: one global room = one Durable Object
    if (p === '/ws' || p.startsWith('/api/')) return env.HUB.get(env.HUB.idFromName('main')).fetch(request);

    return env.ASSETS.fetch(request); // anything else is the built site
  },
};
