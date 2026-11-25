const handlers = new Map();
let ws = null, retry = 1000, helloFn = () => ({}), beat = 0, retryTimer = 0, lastRx = 0, started = false;

export function on(type, fn) {
  if (!handlers.has(type)) handlers.set(type, []);
  handlers.get(type).push(fn);
}
const emit = (type, msg) => handlers.get(type)?.forEach((f) => f(msg));

/** Returns true when the frame was handed to an open socket. */
export function send(obj) {
  if (!ws || ws.readyState !== 1) return false;
  ws.send(JSON.stringify(obj));
  return true;
}
export const isOpen = () => !!ws && ws.readyState === 1;

export function connect(hello) {
  helloFn = hello;
  started = true;
  open();
}
function open() {
  clearTimeout(retryTimer);
  if (ws && ws.readyState <= 1) return; // already connecting / open
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  let sock;
  try { sock = ws = new WebSocket(`${proto}://${location.host}/ws`); } catch { ws = null; return; }
  sock.onopen = () => {
    retry = 1000; lastRx = Date.now(); send({ type: 'hello', ...helloFn() }); emit('open', {});
    // Keep-alive so proxies do not drop an idle connection. On Cloudflare the object answers "pong" without waking up;
    // the Node server just ignores it. If nothing at all (not even a pong) arrives for a while, the socket is dead: replace it.
    clearInterval(beat);
    beat = setInterval(() => {
      if (sock !== ws) return;
      if (Date.now() - lastRx > 65000) reconnectNow();
      else if (sock.readyState === 1) sock.send('ping');
    }, 30000);
  };
  sock.onmessage = (e) => { lastRx = Date.now(); try { const m = JSON.parse(e.data); emit(m.type, m); } catch { /* ignore bad frame ("pong") */ } };
  sock.onclose = () => {
    if (sock !== ws) return; // an already replaced socket
    clearInterval(beat); ws = null; emit('close', {});
    retryTimer = setTimeout(open, retry); retry = Math.min(retry * 2, 15000);
  };
  sock.onerror = () => sock.close();
}

/** Drop the current socket without waiting for the (possibly never arriving) close event, and connect again right away. */
function reconnectNow() {
  const old = ws; ws = null; clearInterval(beat);
  if (old) { try { old.close(); } catch { /* ignore */ } }
  emit('close', {}); retry = 1000; open();
}

/**
 * Phones freeze the page in the background (lock screen, app switch) and the socket often dies silently while it still
 * claims to be open, so a chat message would vanish. On coming back to the page, check the socket really answers.
 */
function probe() {
  if (!started) return;
  if (!ws || ws.readyState > 1) { retry = 1000; open(); return; }
  if (ws.readyState !== 1) return;
  const sentAt = Date.now(), sock = ws;
  sock.send('ping');
  setTimeout(() => { if (sock === ws && lastRx < sentAt) reconnectNow(); }, 3000);
}
document.addEventListener('visibilitychange', () => { if (!document.hidden) probe(); });
addEventListener('pageshow', probe);
addEventListener('online', probe);

export async function api(path, body) {
  const r = await fetch(path, body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : undefined);
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(data.error || String(r.status)), { status: r.status, data });
  return data;
}
