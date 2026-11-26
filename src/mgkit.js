/** Shared drawing helpers and constants for the market mini-games (minigames.js, minigames2.js). */
export const W = 360, H = 520, TAU = Math.PI * 2;
export const rand = (a, b) => a + Math.random() * (b - a);
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const pick = (arr) => arr[(Math.random() * arr.length) | 0];
export const EMOJI_FONT = '"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';

/* ---------- Small drawing helpers ---------- */
export function nightSky(g, to = H) {
  const sky = g.createLinearGradient(0, 0, 0, to); sky.addColorStop(0, '#07122c'); sky.addColorStop(1, '#1b2f63');
  g.fillStyle = sky; g.fillRect(0, 0, W, H);
}
export const STARS = Array.from({ length: 36 }, () => [rand(0, W), rand(0, 200), rand(0.6, 1.6)]);
export function stars(g, time) {
  g.fillStyle = '#dbe7ff';
  for (const [x, y, r] of STARS) { g.globalAlpha = 0.35 + 0.35 * Math.sin(time * 1.3 + x); g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill(); }
  g.globalAlpha = 1;
}
export function text(g, str, x, y, { size = 16, color = '#fff', align = 'center', weight = 700 } = {}) {
  g.font = `${weight} ${size}px system-ui, sans-serif`; g.textAlign = align; g.textBaseline = 'middle'; g.fillStyle = color; g.fillText(str, x, y);
}
export function emoji(g, e, x, y, size) { g.font = `${size}px ${EMOJI_FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = '#fff'; g.fillText(e, x, y); }
/** Floating "+50" texts and confetti shared by the games. */
export function makeFx() {
  const parts = [], msgs = [];
  return {
    burst(x, y, cols, n = 14) { for (let i = 0; i < n; i++) { const a = rand(0, TAU), v = rand(60, 220); parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 60, life: rand(0.4, 0.9), max: 0.9, col: pick(cols), s: rand(2, 5) }); } },
    msg(x, y, str, color = '#ffe38a') { msgs.push({ x, y, str, color, life: 1 }); },
    update(dt) {
      for (let i = parts.length - 1; i >= 0; i--) { const p = parts[i]; p.life -= dt; if (p.life <= 0) { parts.splice(i, 1); continue; } p.vy += 420 * dt; p.x += p.vx * dt; p.y += p.vy * dt; }
      for (let i = msgs.length - 1; i >= 0; i--) { const m = msgs[i]; m.life -= dt * 0.9; m.y -= 34 * dt; if (m.life <= 0) msgs.splice(i, 1); }
    },
    draw(g) {
      for (const p of parts) { g.globalAlpha = clamp(p.life / p.max, 0, 1); g.fillStyle = p.col; g.fillRect(p.x - p.s / 2, p.y - p.s / 2, p.s, p.s); }
      for (const m of msgs) { g.globalAlpha = clamp(m.life, 0, 1); text(g, m.str, m.x, m.y, { size: 20, color: m.color }); }
      g.globalAlpha = 1;
    },
  };
}

