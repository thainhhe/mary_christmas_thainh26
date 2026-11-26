import { W, H, TAU, rand, clamp, pick, nightSky, stars, text, emoji, makeFx } from './mgkit.js';
import * as sound from './audio.js';

/**
 * The second set of market mini-games (the first four are in minigames.js). Same contract:
 * a factory returning { score, over, extra(), down(x, y), move(x, y), up(x, y), update(dt), draw(g) } on a 360 x 520 canvas.
 */
const shuffle = (arr) => { for (let i = arr.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0; [arr[i], arr[j]] = [arr[j], arr[i]]; } return arr; };
const snowGround = (g, top = H - 44) => { g.fillStyle = '#e8f0ff'; g.fillRect(0, top, W, H - top); g.fillStyle = '#c8d8f5'; g.fillRect(0, top, W, 4); };

/* ============================================================ Catch the gifts ============================================================ */
export function catchGifts() {
  const s = { score: 0, time: 30, elapsed: 0, bx: W / 2, tx: W / 2, items: [], spawn: 0.4, over: false };
  const fx = makeFx(), BY = H - 70;
  const KINDS = [{ e: '🎁', v: 10, w: 5 }, { e: '⭐', v: 25, w: 1.2 }, { e: '🍬', v: 15, w: 2.5 }, { coal: true, v: -15, w: 2.2 }];
  const total = KINDS.reduce((a, k) => a + k.w, 0);
  const kind = () => { let r = Math.random() * total; for (const k of KINDS) if ((r -= k.w) <= 0) return k; return KINDS[0]; };
  const aim = (x) => { s.tx = clamp(x, 50, W - 50); }; // the basket is ~94 wide: keep it on screen
  return {
    get score() { return s.score; }, get over() { return s.over; },
    extra: () => `⏱ ${Math.ceil(Math.max(0, s.time))}`,
    down: aim, move: aim, up() {},
    update(dt) {
      s.time -= dt; s.elapsed += dt; fx.update(dt);
      if (s.time <= 0) { s.over = true; return; }
      s.bx += (s.tx - s.bx) * Math.min(1, dt * 16);
      if ((s.spawn -= dt) <= 0) { s.items.push({ ...kind(), x: rand(24, W - 24), y: -24, vy: rand(130, 200) + s.elapsed * 3, rot: rand(0, TAU), spin: rand(-3, 3) }); s.spawn = Math.max(0.32, 0.72 - s.elapsed * 0.012); }
      for (let i = s.items.length - 1; i >= 0; i--) {
        const it = s.items[i]; it.y += it.vy * dt; it.rot += it.spin * dt;
        if (it.y > BY - 16 && it.y < BY + 14 && Math.abs(it.x - s.bx) < 44) {
          s.items.splice(i, 1);
          if (it.coal) { s.score = Math.max(0, s.score + it.v); fx.msg(it.x, BY - 30, `${it.v}`, '#ff8f8f'); fx.burst(it.x, BY, ['#333', '#777'], 8); sound.blip(160, 0.14, 0.5); }
          else { s.score += it.v; fx.msg(it.x, BY - 30, `+${it.v}`); fx.burst(it.x, BY - 10, ['#ffd166', '#fff'], 8); sound.blip(it.v >= 25 ? 1175 : 800, 0.1, 0.6); }
        } else if (it.y > H + 30) s.items.splice(i, 1);
      }
    },
    draw(g) {
      nightSky(g); stars(g, s.elapsed); snowGround(g);
      for (const it of s.items) {
        if (it.coal) { g.save(); g.translate(it.x, it.y); g.rotate(it.rot); g.fillStyle = '#25252d'; g.beginPath(); g.moveTo(-14, -6); g.lineTo(-5, -15); g.lineTo(9, -12); g.lineTo(15, 2); g.lineTo(6, 14); g.lineTo(-10, 11); g.closePath(); g.fill(); g.fillStyle = '#ffffff30'; g.fillRect(-4, -9, 7, 4); g.restore(); }
        else { g.save(); g.translate(it.x, it.y); g.rotate(Math.sin(it.rot) * 0.4); emoji(g, it.e, 0, 0, 34); g.restore(); }
      }
      const x = s.bx; // the basket
      g.fillStyle = '#b9803f'; g.beginPath(); g.moveTo(x - 44, BY - 14); g.lineTo(x + 44, BY - 14); g.lineTo(x + 32, BY + 32); g.lineTo(x - 32, BY + 32); g.closePath(); g.fill();
      g.strokeStyle = '#8a5a26'; g.lineWidth = 2;
      for (let i = 1; i < 4; i++) { g.beginPath(); g.moveTo(x - 44 + i * 4, BY - 14 + i * 11); g.lineTo(x + 44 - i * 4, BY - 14 + i * 11); g.stroke(); }
      g.fillStyle = '#d9a640'; g.fillRect(x - 47, BY - 19, 94, 8);
      fx.draw(g);
    },
  };
}

/* ============================================================ Whack-a-snowman ============================================================ */
export function whackSnowman() {
  const holes = [];
  for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) holes.push({ x: 70 + c * 110, y: 210 + r * 105, state: 'idle', t: 0, dur: 1, kind: 'good', hit: false });
  const s = { score: 0, time: 30, elapsed: 0, spawn: 0.5, over: false };
  const fx = makeFx();
  const RISE = 0.14;
  const lift = (h) => (h.state === 'rise' ? h.t / RISE : h.state === 'stay' ? 1 : h.state === 'fall' ? 1 - h.t / RISE : 0);
  return {
    get score() { return s.score; }, get over() { return s.over; },
    extra: () => `⏱ ${Math.ceil(Math.max(0, s.time))}`,
    move() {}, up() {},
    down(x, y) {
      for (const h of holes) {
        if (h.hit || (h.state !== 'rise' && h.state !== 'stay')) continue;
        if (Math.abs(x - h.x) > 48 || y < h.y - 84 || y > h.y + 16) continue;
        h.hit = true; h.state = 'fall'; h.t = RISE * 0.4;
        const v = h.kind === 'gold' ? 30 : h.kind === 'bad' ? -20 : 10;
        s.score = Math.max(0, s.score + v);
        fx.msg(h.x, h.y - 70, v > 0 ? `+${v}` : `${v}`, v > 0 ? '#ffe38a' : '#ff8f8f'); fx.burst(h.x, h.y - 40, v > 0 ? ['#fff', '#cfe3ff', '#ffd166'] : ['#2f8f4e', '#c8283c'], 12);
        sound.blip(v > 0 ? (v > 10 ? 1175 : 700) : 160, 0.12, 0.6);
        return;
      }
    },
    update(dt) {
      s.time -= dt; s.elapsed += dt; fx.update(dt);
      if (s.time <= 0) { s.over = true; return; }
      if ((s.spawn -= dt) <= 0) {
        const idle = holes.filter((h) => h.state === 'idle');
        if (idle.length) { const h = pick(idle), r = Math.random(); h.state = 'rise'; h.t = 0; h.hit = false; h.kind = r < 0.1 ? 'gold' : r < 0.24 ? 'bad' : 'good'; h.dur = Math.max(0.55, 1.2 - s.elapsed * 0.02) * (h.kind === 'gold' ? 0.8 : 1); }
        s.spawn = Math.max(0.36, 0.78 - s.elapsed * 0.014);
      }
      for (const h of holes) {
        if (h.state === 'idle') continue;
        h.t += dt;
        if (h.state === 'rise' && h.t >= RISE) { h.state = 'stay'; h.t = 0; }
        else if (h.state === 'stay' && h.t >= h.dur) { h.state = 'fall'; h.t = 0; }
        else if (h.state === 'fall' && h.t >= RISE) { h.state = 'idle'; h.t = 0; }
      }
    },
    draw(g) {
      nightSky(g); stars(g, s.elapsed); snowGround(g, 150);
      for (const h of holes) {
        g.fillStyle = '#161a2c'; g.beginPath(); g.ellipse(h.x, h.y + 8, 44, 14, 0, 0, TAU); g.fill();
        const k = lift(h);
        if (k > 0.01) {
          g.save(); g.beginPath(); g.rect(h.x - 60, h.y - 130, 120, 138); g.clip(); // only what is above the hole
          g.translate(h.x, h.y + 8 + (1 - k) * 90);
          if (h.kind === 'bad') { // a grumpy green troll
            g.fillStyle = '#2f8f4e'; g.beginPath(); g.arc(0, -34, 26, 0, TAU); g.fill();
            g.fillStyle = '#c8283c'; g.beginPath(); g.moveTo(-24, -48); g.lineTo(22, -52); g.lineTo(2, -86); g.closePath(); g.fill(); g.fillStyle = '#fff'; g.fillRect(-26, -54, 52, 8);
            g.fillStyle = '#fff'; g.beginPath(); g.arc(-9, -36, 5.5, 0, TAU); g.arc(9, -36, 5.5, 0, TAU); g.fill(); g.fillStyle = '#111'; g.beginPath(); g.arc(-9, -35, 2.4, 0, TAU); g.arc(9, -35, 2.4, 0, TAU); g.fill();
            g.strokeStyle = '#111'; g.lineWidth = 3; g.beginPath(); g.moveTo(-17, -46); g.lineTo(-4, -41); g.moveTo(17, -46); g.lineTo(4, -41); g.moveTo(-9, -22); g.quadraticCurveTo(0, -30, 9, -22); g.stroke();
          } else {
            const body = h.kind === 'gold' ? '#ffd86a' : '#f6faff';
            g.fillStyle = body; g.beginPath(); g.arc(0, -22, 26, 0, TAU); g.fill(); g.beginPath(); g.arc(0, -62, 18, 0, TAU); g.fill();
            g.fillStyle = '#15151c'; g.fillRect(-14, -88, 28, 13); g.fillRect(-20, -77, 40, 5);
            g.fillStyle = '#111'; g.beginPath(); g.arc(-6, -65, 2.4, 0, TAU); g.arc(6, -65, 2.4, 0, TAU); g.fill();
            g.fillStyle = '#ff8c1a'; g.beginPath(); g.moveTo(0, -62); g.lineTo(15, -58); g.lineTo(0, -56); g.fill();
            g.fillStyle = '#d62839'; g.fillRect(-17, -47, 34, 6);
            if (h.hit) { text(g, '✦ ✦', 0, -88, { size: 16, color: '#ffd166' }); }
          }
          g.restore();
        }
        g.fillStyle = '#f2f7ff'; g.beginPath(); g.ellipse(h.x, h.y + 14, 48, 11, 0, 0, Math.PI); g.fill(); // snow lip in front
      }
      fx.draw(g);
    },
  };
}

/* ============================================================ Memory match ============================================================ */
export function memoryMatch() {
  const FACES = ['🎄', '🎅', '⭐', '🔔', '🎁', '☃️', '🦌', '🍬'];
  const cards = shuffle([...FACES, ...FACES]).map((f, i) => ({ f, x: 24 + (i % 4) * 80, y: 68 + ((i / 4) | 0) * 100, w: 72, h: 92, flip: 1, target: 1, matched: false, glow: 0 }));
  const s = { score: 0, time: 60, elapsed: 0, phase: 'peek', t: 1.8, picks: [], lock: 0, over: false, endIn: -1, pairs: 0 };
  const fx = makeFx();
  return {
    get score() { return s.score; }, get over() { return s.over; },
    extra: () => (s.phase === 'peek' ? '👀' : `⏱ ${Math.ceil(Math.max(0, s.time))}`),
    move() {}, up() {},
    down(x, y) {
      if (s.phase !== 'play' || s.lock > 0 || s.endIn >= 0) return;
      const c = cards.find((k) => !k.matched && k.target === 0 && x >= k.x && x <= k.x + k.w && y >= k.y && y <= k.y + k.h);
      if (!c) return;
      c.target = 1; s.picks.push(c); sound.blip(600, 0.05, 0.4);
      if (s.picks.length === 2) {
        const [a, b] = s.picks;
        if (a.f === b.f) {
          s.picks = []; a.matched = b.matched = true; a.glow = b.glow = 1; s.pairs++; s.score += 100;
          fx.msg(a.x + a.w, a.y, '+100'); fx.burst(a.x + a.w / 2, a.y + a.h / 2, ['#ffd166', '#fff'], 8); fx.burst(b.x + b.w / 2, b.y + b.h / 2, ['#ffd166', '#fff'], 8);
          sound.blip(1047, 0.16, 0.7);
          if (s.pairs === FACES.length) { const bonus = Math.ceil(s.time) * 5; s.score += bonus; fx.msg(W / 2, 40, `+${bonus} ⏱`, '#8fe3a0'); s.endIn = 1.2; }
        } else s.lock = 0.8;
      }
    },
    update(dt) {
      s.elapsed += dt; fx.update(dt);
      if (s.phase === 'peek') { if ((s.t -= dt) <= 0) { s.phase = 'play'; cards.forEach((c) => { c.target = 0; }); } }
      else if (s.endIn < 0) { s.time -= dt; if (s.time <= 0) s.over = true; }
      if (s.lock > 0 && (s.lock -= dt) <= 0) { s.picks.forEach((c) => { c.target = 0; }); s.picks = []; }
      if (s.endIn >= 0 && (s.endIn -= dt) < 0) s.over = true;
      for (const c of cards) { c.flip += Math.sign(c.target - c.flip) * Math.min(Math.abs(c.target - c.flip), dt * 6); c.glow = Math.max(0, c.glow - dt); }
    },
    draw(g) {
      nightSky(g); stars(g, s.elapsed);
      for (const c of cards) {
        const sx = Math.abs(Math.cos(c.flip * Math.PI)), cx = c.x + c.w / 2, face = c.flip > 0.5;
        g.save(); g.translate(cx, c.y + c.h / 2); g.scale(Math.max(sx, 0.02), 1);
        g.fillStyle = face ? (c.matched ? '#fff6d6' : '#f8fbff') : '#9c2b3a'; g.beginPath(); g.roundRect(-c.w / 2, -c.h / 2, c.w, c.h, 10); g.fill();
        g.strokeStyle = face ? '#d9a640' : '#f0c8a0'; g.lineWidth = 3; g.stroke();
        if (face) emoji(g, c.f, 0, 2, 40);
        else { g.fillStyle = '#f0c8a0'; text(g, '❄', 0, 0, { size: 30, color: '#f0c8a0' }); }
        if (c.glow > 0) { g.strokeStyle = `rgba(255,220,120,${c.glow})`; g.lineWidth = 6; g.stroke(); }
        g.restore();
      }
      fx.draw(g);
    },
  };
}

/* ============================================================ Archery ============================================================ */
export function archery() {
  const CX = W / 2, CY = 215, RINGS = [[110, '#f1f1f1', 5], [85, '#2b2b34', 10], [55, '#3a7bd5', 20], [30, '#e63946', 30], [12, '#ffd166', 50]];
  const s = { score: 0, left: 6, t: 0, hold: false, energy: 1, amp: 78, arrows: [], flight: null, endIn: -1, over: false, x: CX, y: CY };
  const fx = makeFx();
  return {
    get score() { return s.score; }, get over() { return s.over; },
    extra: () => `🏹 ${s.left}`,
    move() {},
    down() { s.hold = true; },
    up() {
      if (!s.hold) return;
      s.hold = false;
      if (s.flight || s.left <= 0) return;
      s.left--;
      s.flight = { t: 0, dur: 0.28, tx: s.x + rand(-4, 4), ty: s.y + rand(-4, 4) };
      sound.blip(330, 0.08, 0.5);
    },
    update(dt) {
      s.t += dt; fx.update(dt);
      const steady = s.hold && s.energy > 0;
      s.energy = clamp(s.energy + (steady ? -0.5 : 0.35) * dt, 0, 1);
      s.amp += ((steady ? 17 : 80) - s.amp) * Math.min(1, dt * 7);
      s.x = CX + Math.sin(s.t * 1.9) * s.amp + Math.sin(s.t * 0.7 + 1) * s.amp * 0.45;
      s.y = CY + Math.cos(s.t * 1.5 + 0.5) * s.amp * 0.8 + Math.sin(s.t * 0.9) * s.amp * 0.3;
      const f = s.flight;
      if (f && (f.t += dt) >= f.dur) {
        const d = Math.hypot(f.tx - CX, f.ty - CY), ring = RINGS.slice().reverse().find((r) => d <= r[0]), pts = ring ? ring[2] : 0;
        s.score += pts; s.arrows.push({ x: f.tx, y: f.ty });
        fx.msg(f.tx, f.ty - 22, pts ? `+${pts}` : '✗', pts ? '#ffe38a' : '#ff8f8f'); if (pts) fx.burst(f.tx, f.ty, ['#fff', '#ffd166'], 8);
        sound.blip(pts >= 30 ? 1175 : pts ? 800 : 200, 0.14, 0.6);
        s.flight = null; if (s.left <= 0) s.endIn = 0.9;
      }
      if (s.endIn >= 0 && (s.endIn -= dt) < 0) s.over = true;
    },
    draw(g) {
      nightSky(g); stars(g, s.t); snowGround(g, H - 60);
      g.fillStyle = '#6a4425'; g.fillRect(CX - 5, CY + 100, 10, 190); g.beginPath(); g.moveTo(CX - 60, H - 56); g.lineTo(CX, CY + 230); g.lineTo(CX + 60, H - 56); g.lineWidth = 8; g.strokeStyle = '#6a4425'; g.stroke(); // stand
      for (const [r, col] of RINGS) { g.fillStyle = col; g.beginPath(); g.arc(CX, CY, r, 0, TAU); g.fill(); }
      g.strokeStyle = '#00000040'; g.lineWidth = 1; for (const [r] of RINGS) { g.beginPath(); g.arc(CX, CY, r, 0, TAU); g.stroke(); }
      for (const a of s.arrows) { g.strokeStyle = '#d9b27a'; g.lineWidth = 3; g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(a.x + 15, a.y + 22); g.stroke(); g.strokeStyle = '#e63946'; g.lineWidth = 4; g.beginPath(); g.moveTo(a.x + 12, a.y + 18); g.lineTo(a.x + 18, a.y + 27); g.stroke(); g.fillStyle = '#222'; g.beginPath(); g.arc(a.x, a.y, 2.2, 0, TAU); g.fill(); }
      const f = s.flight;
      if (f) { const k = f.t / f.dur, x = CX + (f.tx - CX) * k, y = H - 70 + (f.ty - (H - 70)) * k, sc = 1 - 0.7 * k; g.strokeStyle = '#d9b27a'; g.lineWidth = 4 * sc; g.beginPath(); g.moveTo(x, y); g.lineTo(x + 6 * sc, y + 40 * sc); g.stroke(); }
      if (s.left > 0 && !f) {
        const steady = s.hold && s.energy > 0;
        g.strokeStyle = steady ? '#9bf59b' : '#fff'; g.lineWidth = 2.2; g.beginPath(); g.arc(s.x, s.y, 14, 0, TAU);
        g.moveTo(s.x - 24, s.y); g.lineTo(s.x - 6, s.y); g.moveTo(s.x + 6, s.y); g.lineTo(s.x + 24, s.y); g.moveTo(s.x, s.y - 24); g.lineTo(s.x, s.y - 6); g.moveTo(s.x, s.y + 6); g.lineTo(s.x, s.y + 24); g.stroke();
      }
      g.fillStyle = '#ffffff30'; g.beginPath(); g.roundRect(60, H - 30, W - 120, 10, 5); g.fill(); // steadiness meter
      g.fillStyle = s.energy > 0.25 ? '#9bf59b' : '#ff8f8f'; g.beginPath(); g.roundRect(60, H - 30, (W - 120) * s.energy, 10, 5); g.fill();
      fx.draw(g);
    },
  };
}

/* ============================================================ Where is the gift? (cups) ============================================================ */
export function cupGame() {
  const XS = [70, 180, 290], Y = 330, ROUNDS = 8;
  const cups = [0, 1, 2].map((id) => ({ id, slot: id, x: XS[id], yoff: 0, lift: 0 }));
  const s = { score: 0, round: 0, phase: 'show', t: 0, gid: 0, left: 0, dur: 0.5, swap: null, picked: -1, ok: false, over: false };
  const fx = makeFx();
  function startRound() {
    s.round++; s.gid = (Math.random() * 3) | 0; s.phase = 'show'; s.t = 0; s.left = 3 + s.round; s.dur = Math.max(0.17, 0.52 - 0.045 * s.round); s.swap = null; s.picked = -1;
    cups.forEach((c) => { c.slot = c.id; c.x = XS[c.id]; c.yoff = 0; c.lift = 0; });
  }
  startRound();
  return {
    get score() { return s.score; }, get over() { return s.over; },
    extra: () => `🎩 ${s.round}/${ROUNDS}`,
    move() {}, up() {},
    down(x, y) {
      if (s.phase !== 'pick') return;
      const c = cups.find((k) => Math.abs(x - k.x) < 48 && y > Y - 70 && y < Y + 56);
      if (!c) return;
      s.picked = c.id; s.ok = c.id === s.gid; s.phase = 'reveal'; s.t = 0;
      if (s.ok) { const v = 10 + 5 * s.round; s.score += v; fx.msg(c.x, Y - 80, `+${v}`); fx.burst(c.x, Y, ['#ffd166', '#fff', '#e63946'], 14); sound.blip(1175, 0.2, 0.7); }
      else { fx.msg(c.x, Y - 80, '✗', '#ff8f8f'); sound.blip(180, 0.2, 0.5); }
    },
    update(dt) {
      fx.update(dt); s.t += dt;
      const gc = cups[s.gid];
      if (s.phase === 'show') {
        gc.lift = clamp(Math.min(s.t / 0.25, (1.3 - s.t) / 0.25), 0, 1);
        if (s.t > 1.3) { gc.lift = 0; s.phase = 'shuffle'; }
      } else if (s.phase === 'shuffle') {
        if (!s.swap) {
          if (s.left <= 0) { s.phase = 'pick'; return; }
          const a = (Math.random() * 3) | 0, b = (a + 1 + ((Math.random() * 2) | 0)) % 3;
          s.swap = { a, b, k: 0, ca: cups.find((c) => c.slot === a), cb: cups.find((c) => c.slot === b) }; s.left--;
        }
        const w = s.swap; w.k = Math.min(1, w.k + dt / s.dur);
        const e = w.k * w.k * (3 - 2 * w.k);
        w.ca.x = XS[w.a] + (XS[w.b] - XS[w.a]) * e; w.cb.x = XS[w.b] + (XS[w.a] - XS[w.b]) * e;
        w.ca.yoff = -Math.sin(Math.PI * w.k) * 34; w.cb.yoff = Math.sin(Math.PI * w.k) * 34;
        if (w.k >= 1) { w.ca.slot = w.b; w.cb.slot = w.a; w.ca.yoff = w.cb.yoff = 0; s.swap = null; }
      } else if (s.phase === 'reveal') {
        gc.lift = clamp(s.t / 0.25, 0, 1);
        if (s.t > 1.2) { if (s.round >= ROUNDS) s.over = true; else startRound(); }
      }
    },
    draw(g) {
      nightSky(g); stars(g, s.t * 3); snowGround(g, 410);
      g.fillStyle = '#6a4425'; g.fillRect(14, Y + 54, W - 28, 16); g.fillStyle = '#8a5a30'; g.fillRect(14, Y + 54, W - 28, 5); // table
      const gc = cups[s.gid];
      if (gc.lift > 0.02) emoji(g, '⭐', gc.x, Y + 28, 40);
      for (const c of cups) {
        const y = Y + c.yoff - c.lift * 74;
        g.fillStyle = (s.phase === 'reveal' && c.id === s.picked) ? (s.ok ? '#2fa36b' : '#7a2f2f') : '#c8283c';
        g.beginPath(); g.moveTo(c.x - 40, y + 50); g.lineTo(c.x + 36, y + 50); g.quadraticCurveTo(c.x + 14, y - 10, c.x + 22, y - 36); g.quadraticCurveTo(c.x - 16, y - 30, c.x - 40, y + 50); g.fill();
        g.fillStyle = '#fff'; g.beginPath(); g.roundRect(c.x - 46, y + 40, 90, 16, 8); g.fill();
        g.beginPath(); g.arc(c.x + 22, y - 38, 8, 0, TAU); g.fill();
      }
      const hint = s.phase === 'pick' ? '👆' : s.phase === 'show' ? '👀' : s.phase === 'shuffle' ? '🌀' : '';
      if (hint) emoji(g, hint, W / 2, 120, 44);
      fx.draw(g);
    },
  };
}

/* ============================================================ Plinko ============================================================ */
export function plinko() {
  const PEGS = [], BR = 8, PR = 5, SLOT_TOP = 452, SLOTS = [50, 20, 10, 5, 10, 20, 50], SW = (W - 28) / SLOTS.length;
  for (let r = 0; r < 8; r++) { const even = r % 2 === 0, n = even ? 7 : 6; for (let i = 0; i < n; i++) PEGS.push({ x: 14 + (even ? i + 0.5 : i + 1) * SW, y: 120 + r * 40 }); } // even rows over the slot centres, odd rows over the dividers
  const s = { score: 0, left: 8, balls: [], cool: 0, t: 0, endIn: -1, over: false, aimX: W / 2 };
  const fx = makeFx();
  return {
    get score() { return s.score; }, get over() { return s.over; },
    extra: () => `🎱 ${s.left}`,
    move(x) { s.aimX = clamp(x, 20, W - 20); },
    up() {},
    down(x) {
      s.aimX = clamp(x, 20, W - 20);
      if (s.cool > 0 || s.left <= 0) return;
      s.left--; s.cool = 0.35;
      s.balls.push({ x: s.aimX + rand(-2, 2), y: 52, vx: rand(-8, 8), vy: 0, done: 0, still: 0 });
      sound.blip(520, 0.06, 0.4);
    },
    update(dt) {
      s.t += dt; s.cool -= dt; fx.update(dt);
      for (let step = 0; step < 3; step++) {
        const h = dt / 3;
        for (const b of s.balls) {
          if (b.done) continue;
          b.vy += 900 * h; b.x += b.vx * h; b.y += b.vy * h;
          if (b.x < 14 + BR) { b.x = 14 + BR; b.vx = Math.abs(b.vx) * 0.6; } else if (b.x > W - 14 - BR) { b.x = W - 14 - BR; b.vx = -Math.abs(b.vx) * 0.6; }
          for (const p of PEGS) {
            const dx = b.x - p.x, dy = b.y - p.y, d = Math.hypot(dx, dy), min = BR + PR;
            if (d < min && d > 0.001) {
              const nx = dx / d, ny = dy / d; b.x = p.x + nx * min; b.y = p.y + ny * min;
              const vn = b.vx * nx + b.vy * ny;
              if (vn < 0) { b.vx -= 1.55 * vn * nx; b.vy -= 1.55 * vn * ny; b.vx += rand(-14, 14); }
            }
          }
          if (b.y < SLOT_TOP - 10 && Math.hypot(b.vx, b.vy) < 12) { if ((b.still += h) > 0.4) { b.vx += rand(-60, 60); b.still = 0; } } else b.still = 0;
          if (b.y >= SLOT_TOP + 8) {
            b.done = 1; const i = clamp(Math.floor((b.x - 14) / SW), 0, SLOTS.length - 1), v = SLOTS[i];
            s.score += v; fx.msg(14 + (i + 0.5) * SW, SLOT_TOP - 16, `+${v}`); fx.burst(b.x, SLOT_TOP, ['#ffd166', '#fff'], 8);
            sound.blip(v >= 50 ? 1319 : v >= 20 ? 988 : 660, 0.14, 0.6);
          }
        }
      }
      for (let i = s.balls.length - 1; i >= 0; i--) if (s.balls[i].done && (s.balls[i].done += dt) > 1.6) s.balls.splice(i, 1);
      if (s.left <= 0 && !s.balls.length && s.endIn < 0) s.endIn = 0.7;
      if (s.endIn >= 0 && (s.endIn -= dt) < 0) s.over = true;
    },
    draw(g) {
      nightSky(g); stars(g, s.t);
      g.fillStyle = '#2e190d'; g.beginPath(); g.roundRect(8, 78, W - 16, H - 90, 14); g.fill(); g.strokeStyle = '#d9a640'; g.lineWidth = 3; g.stroke();
      for (let i = 0; i < SLOTS.length; i++) { // slots
        const x = 14 + i * SW, v = SLOTS[i];
        g.fillStyle = v >= 50 ? '#ffd16688' : v >= 20 ? '#ff8f6b66' : '#ffffff22'; g.fillRect(x + 1, SLOT_TOP, SW - 2, H - SLOT_TOP - 16);
        g.fillStyle = '#d9a640'; g.fillRect(x - 1.5, SLOT_TOP - 10, 3, H - SLOT_TOP - 6);
        text(g, String(v), x + SW / 2, H - 34, { size: 14, color: '#fff3c4' });
      }
      g.fillStyle = '#f3e2bd'; for (const p of PEGS) { g.beginPath(); g.arc(p.x, p.y, PR, 0, TAU); g.fill(); }
      if (s.left > 0) { g.strokeStyle = '#ffffff99'; g.setLineDash([4, 6]); g.lineWidth = 2; g.beginPath(); g.moveTo(s.aimX, 60); g.lineTo(s.aimX, 100); g.stroke(); g.setLineDash([]); g.fillStyle = '#e63946'; g.beginPath(); g.arc(s.aimX, 52, BR, 0, TAU); g.fill(); }
      for (const b of s.balls) { g.globalAlpha = b.done ? clamp(1 - (b.done - 1) / 0.6, 0, 1) : 1; g.fillStyle = '#e63946'; g.beginPath(); g.arc(b.x, b.y, BR, 0, TAU); g.fill(); g.fillStyle = '#ffffff90'; g.beginPath(); g.arc(b.x - 2.5, b.y - 2.5, 2.6, 0, TAU); g.fill(); }
      g.globalAlpha = 1;
      fx.draw(g);
    },
  };
}

/* ============================================================ Bell rhythm ============================================================ */
export function bellRhythm() {
  const LANE_W = W / 3, HIT_Y = 430, SPEED = 230, NOTES = [659, 784, 988];
  const s = { score: 0, time: 30, t: 0, spawn: 0.8, bells: [], combo: 0, over: false, flash: [0, 0, 0] };
  const fx = makeFx();
  let last = -1;
  const press = (lane) => {
    s.flash[lane] = 0.18;
    let hit = null, bd = 48;
    for (const b of s.bells) if (b.lane === lane && !b.done) { const d = Math.abs(b.y - HIT_Y); if (d < bd) { bd = d; hit = b; } }
    if (!hit) { s.combo = 0; sound.blip(150, 0.06, 0.3); return; }
    hit.done = true; s.combo++;
    const perfect = bd < 16, pts = (perfect ? 30 : 15) + Math.min(s.combo, 10) * 2;
    s.score += pts; fx.msg(LANE_W * (lane + 0.5), HIT_Y - 40, perfect ? `PERFECT +${pts}` : `+${pts}`, perfect ? '#ffe38a' : '#fff'); fx.burst(LANE_W * (lane + 0.5), HIT_Y, ['#ffd166', '#fff'], perfect ? 12 : 6);
    sound.blip(NOTES[lane] * (perfect ? 1 : 0.5), 0.2, 0.8);
  };
  return {
    get score() { return s.score; }, get over() { return s.over; },
    extra: () => `⏱ ${Math.ceil(Math.max(0, s.time))}`,
    move() {}, up() {},
    down(x) { press(clamp(Math.floor(x / LANE_W), 0, 2)); },
    update(dt) {
      s.time -= dt; s.t += dt; fx.update(dt);
      if (s.time <= 0) { s.over = true; return; }
      if (s.time > 4 && (s.spawn -= dt) <= 0) {
        let lane = (Math.random() * 3) | 0; if (lane === last && Math.random() < 0.5) lane = (lane + 1) % 3; last = lane;
        s.bells.push({ lane, y: -30, done: false }); s.spawn = pick([0.45, 0.45, 0.6, 0.6, 0.3]);
      }
      for (let i = s.bells.length - 1; i >= 0; i--) {
        const b = s.bells[i]; b.y += SPEED * dt;
        if (!b.done && b.y > HIT_Y + 48) { b.done = true; b.missed = true; s.combo = 0; }
        if (b.y > H + 40) s.bells.splice(i, 1);
      }
      for (let i = 0; i < 3; i++) s.flash[i] = Math.max(0, s.flash[i] - dt);
    },
    draw(g) {
      nightSky(g); stars(g, s.t);
      for (let i = 0; i < 3; i++) {
        g.fillStyle = i % 2 ? '#ffffff0c' : '#ffffff18'; g.fillRect(i * LANE_W, 0, LANE_W, H);
        if (s.flash[i] > 0) { g.fillStyle = `rgba(255,220,130,${s.flash[i] * 1.8})`; g.fillRect(i * LANE_W, HIT_Y - 50, LANE_W, 100); }
      }
      g.strokeStyle = '#ffd166'; g.lineWidth = 3; g.beginPath(); g.moveTo(0, HIT_Y); g.lineTo(W, HIT_Y); g.stroke();
      for (let i = 0; i < 3; i++) { g.strokeStyle = '#ffd16699'; g.lineWidth = 3; g.beginPath(); g.arc(LANE_W * (i + 0.5), HIT_Y, 30, 0, TAU); g.stroke(); }
      for (const b of s.bells) { if (b.done && !b.missed) continue; g.globalAlpha = b.missed ? 0.35 : 1; emoji(g, '🔔', LANE_W * (b.lane + 0.5), b.y, 44); }
      g.globalAlpha = 1;
      if (s.combo >= 3) text(g, `🔥 x${s.combo}`, W / 2, 40, { size: 22, color: '#ffd166' });
      fx.draw(g);
    },
  };
}

/* ============================================================ Gingerbread tower ============================================================ */
export function stackTower() {
  const BH = 26, BASE_Y = H - 64, SHADES = ['#9a5a2a', '#b3703a', '#8a4a22', '#c4834a'];
  const stack = [{ x: 100, w: 160 }];
  const s = { score: 0, cur: null, pieces: [], cam: 0, over: false, endIn: -1, t: 0, perfects: 0, flash: 0 };
  const fx = makeFx();
  function nextBlock() {
    const top = stack[stack.length - 1], L = stack.length, fromLeft = L % 2 === 0;
    s.cur = { w: top.w, x: fromLeft ? 8 : W - 8 - top.w, dir: fromLeft ? 1 : -1, speed: Math.min(340, 150 + L * 9) };
  }
  nextBlock();
  return {
    get score() { return s.score; }, get over() { return s.over; },
    extra: () => `🍪 ${stack.length - 1}`,
    move() {}, up() {},
    down() {
      const c = s.cur; if (!c || s.endIn >= 0) return;
      const top = stack[stack.length - 1], L = stack.length, y = BASE_Y - L * BH;
      const ov = Math.min(c.x + c.w, top.x + top.w) - Math.max(c.x, top.x);
      if (ov <= 2) { s.pieces.push({ x: c.x, w: c.w, y, vy: 0, col: SHADES[L % 4] }); s.cur = null; s.endIn = 1.0; sound.blip(150, 0.2, 0.5); return; }
      let nx = Math.max(c.x, top.x), nw = ov;
      if (Math.abs(c.x - top.x) < 5) { nx = top.x; nw = top.w; s.score += 20; s.perfects++; s.flash = 0.35; fx.msg(W / 2, y - 14 + s.cam, 'PERFECT +20', '#ffe38a'); sound.blip(1319, 0.18, 0.7); }
      else {
        s.score += 10; sound.blip(700 + L * 12, 0.1, 0.6);
        const cutX = c.x < top.x ? c.x : top.x + top.w; s.pieces.push({ x: cutX, w: c.w - ov, y, vy: 0, col: SHADES[L % 4] });
      }
      stack.push({ x: nx, w: nw });
      nextBlock();
    },
    update(dt) {
      s.t += dt; fx.update(dt); s.flash = Math.max(0, s.flash - dt);
      const c = s.cur;
      if (c) { c.x += c.dir * c.speed * dt; if (c.x < 8) { c.x = 8; c.dir = 1; } else if (c.x + c.w > W - 8) { c.x = W - 8 - c.w; c.dir = -1; } }
      s.cam += (Math.max(0, (stack.length - 9) * BH) - s.cam) * Math.min(1, dt * 5);
      for (let i = s.pieces.length - 1; i >= 0; i--) { const p = s.pieces[i]; p.vy += 900 * dt; p.y += p.vy * dt; if (p.y > BASE_Y + s.cam + 200) s.pieces.splice(i, 1); }
      if (s.endIn >= 0 && (s.endIn -= dt) < 0) s.over = true;
    },
    draw(g) {
      nightSky(g); stars(g, s.t);
      g.save(); g.translate(0, s.cam);
      g.fillStyle = '#e8f0ff'; g.fillRect(0, BASE_Y + BH, W, 400);
      const block = (x, w, y, col) => {
        g.fillStyle = col; g.fillRect(x, y, w, BH - 2); g.fillStyle = '#ffffff55'; g.fillRect(x, y, w, 4);
        g.fillStyle = '#fffaf0'; for (let k = x + 6; k < x + w - 4; k += 14) { g.beginPath(); g.arc(k, y + BH - 3, 3.5, 0, Math.PI); g.fill(); }
      };
      stack.forEach((b, i) => block(b.x, b.w, BASE_Y - i * BH, SHADES[i % 4]));
      if (s.cur) block(s.cur.x, s.cur.w, BASE_Y - stack.length * BH, SHADES[stack.length % 4]);
      for (const p of s.pieces) block(p.x, p.w, p.y, p.col);
      if (s.flash > 0) { g.fillStyle = `rgba(255,230,140,${s.flash})`; const top = stack[stack.length - 1]; g.fillRect(top.x - 4, BASE_Y - (stack.length - 1) * BH - 4, top.w + 8, BH + 4); }
      g.restore();
      fx.draw(g);
      if (stack.length === 1 && s.cur) emoji(g, '👆', W / 2, 130, 30);
    },
  };
}
