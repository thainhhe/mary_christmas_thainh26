import { $, store } from './state.js';
import { t, onLang } from './i18n.js';
import { STALLS, STALL_GAMES, marketWorld } from './marketlayout.js';
import * as sound from './audio.js';

/**
 * Mini-games at the Christmas market stalls. Walk up to a stall that has one and a "Play" button appears; it opens a small
 * 2D game in a dialog. Just for fun: scores and personal bests stay on this device (nothing is sent to the server).
 *
 * A game is a factory returning { score, over, extra(), down(x, y), move(x, y), up(x, y), update(dt), draw(g) }.
 * The canvas is a fixed 360 x 520 logical space; pointer events are mapped into it.
 */
import { W, H, TAU, rand, clamp, pick, nightSky, stars, text, emoji, makeFx } from './mgkit.js';
import { catchGifts, whackSnowman, memoryMatch, archery, cupGame, plinko, bellRhythm, stackTower } from './minigames2.js';

/* ============================================================ 1. Ring toss ============================================================ */
function ringToss() {
  const pegs = [];
  [[185, [80, 180, 280], 50], [262, [55, 135, 225, 305], 30], [340, [40, 110, 180, 250, 320], 10]].forEach(([y, xs, pts]) => xs.forEach((x) => pegs.push({ x, y, pts, rings: 0 })));
  const s = { score: 0, left: 10, aim: { x: W / 2, y: 260 }, flying: null, landed: [], endIn: -1, over: false, time: 0 };
  const fx = makeFx(), ORIGIN = { x: W / 2, y: H - 46 }, RING_COLORS = ['#e63946', '#ffd166', '#4aa3f0', '#2fa36b'];
  let ringNo = 0;
  const aimAt = (x, y) => { s.aim.x = clamp(x, 20, W - 20); s.aim.y = clamp(y, 150, 390); };
  const ringPath = (g, x, y, sc) => { g.beginPath(); g.ellipse(x, y, 20 * sc, 20 * sc * 0.45, 0, 0, TAU); };
  return {
    get score() { return s.score; }, get over() { return s.over; },
    extra: () => `🔴 ${s.left}`,
    down: aimAt, move: aimAt,
    up() {
      if (s.flying || s.left <= 0) return;
      s.left--;
      const a = rand(0, TAU), j = rand(0, 8); // a shaky hand
      s.flying = { t: 0, dur: 0.65, sx: ORIGIN.x, sy: ORIGIN.y, tx: s.aim.x + Math.cos(a) * j, ty: s.aim.y + Math.sin(a) * j * 0.6, col: RING_COLORS[ringNo++ % RING_COLORS.length] };
      sound.blip(520, 0.08, 0.4);
    },
    update(dt) {
      s.time += dt; fx.update(dt);
      const f = s.flying;
      if (f) {
        f.t += dt;
        if (f.t >= f.dur) {
          let hit = null, bd = 15;
          for (const p of pegs) { const d = Math.hypot(p.x - f.tx, p.y - f.ty); if (d < bd) { bd = d; hit = p; } }
          if (hit) { hit.rings++; hit.col = f.col; s.score += hit.pts; fx.msg(hit.x, hit.y - 28, `+${hit.pts}`); fx.burst(hit.x, hit.y, ['#ffd166', '#fff', f.col], 10); sound.blip(hit.pts >= 30 ? 1175 : 880, 0.18, 0.7); }
          else { s.landed.push({ x: f.tx, y: f.ty, col: f.col, life: 1.4 }); sound.blip(220, 0.1, 0.4); }
          s.flying = null;
          if (s.left <= 0) s.endIn = 0.8;
        }
      }
      for (let i = s.landed.length - 1; i >= 0; i--) { s.landed[i].life -= dt; if (s.landed[i].life <= 0) s.landed.splice(i, 1); }
      if (s.endIn >= 0 && (s.endIn -= dt) < 0) s.over = true;
    },
    draw(g) {
      nightSky(g); stars(g, s.time);
      const wall = g.createLinearGradient(0, 120, 0, 420); wall.addColorStop(0, '#4a2c18'); wall.addColorStop(1, '#2e190d'); // the board
      g.fillStyle = wall; g.beginPath(); g.roundRect(14, 128, W - 28, 290, 16); g.fill();
      g.strokeStyle = '#d9a640'; g.lineWidth = 3; g.stroke();
      for (let i = 0; i < 14; i++) { g.fillStyle = ['#ff6b6b', '#ffd166', '#6bd6ff', '#9bf59b'][i % 4]; g.beginPath(); g.arc(24 + i * 24.5, 120 + Math.sin(i * 0.9) * 5, 4, 0, TAU); g.fill(); } // string lights
      g.fillStyle = '#6a4425'; g.fillRect(0, 430, W, H - 430);
      for (const p of pegs) {
        g.fillStyle = '#00000055'; g.beginPath(); g.ellipse(p.x, p.y + 12, 15, 5.5, 0, 0, TAU); g.fill();
        g.fillStyle = p.pts >= 50 ? '#ffd166' : p.pts >= 30 ? '#ff8f6b' : '#e8dcc0'; g.fillRect(p.x - 3.5, p.y - 14, 7, 26);
        g.beginPath(); g.arc(p.x, p.y - 14, 4.5, 0, TAU); g.fill();
        text(g, String(p.pts), p.x, p.y + 28, { size: 11, color: '#f3e2bd' });
        for (let k = 0; k < p.rings; k++) { g.strokeStyle = p.col; g.lineWidth = 4; ringPath(g, p.x, p.y + 4 - k * 5, 0.62); g.stroke(); }
      }
      for (const r of s.landed) { g.globalAlpha = clamp(r.life, 0, 1); g.strokeStyle = r.col; g.lineWidth = 3; ringPath(g, r.x, r.y, 0.62); g.stroke(); }
      g.globalAlpha = 1;
      if (s.left > 0 && !s.flying) { // aiming mark
        g.strokeStyle = '#fff'; g.globalAlpha = 0.85; g.lineWidth = 2; g.setLineDash([5, 6]);
        g.beginPath(); g.moveTo(ORIGIN.x, ORIGIN.y - 20); g.lineTo(s.aim.x, s.aim.y); g.stroke(); g.setLineDash([]);
        g.beginPath(); g.arc(s.aim.x, s.aim.y, 15, 0, TAU); g.stroke();
        g.beginPath(); g.moveTo(s.aim.x - 22, s.aim.y); g.lineTo(s.aim.x - 9, s.aim.y); g.moveTo(s.aim.x + 9, s.aim.y); g.lineTo(s.aim.x + 22, s.aim.y); g.moveTo(s.aim.x, s.aim.y - 22); g.lineTo(s.aim.x, s.aim.y - 9); g.moveTo(s.aim.x, s.aim.y + 9); g.lineTo(s.aim.x, s.aim.y + 22); g.stroke();
        g.globalAlpha = 1;
      }
      const f = s.flying;
      if (f) {
        const k = f.t / f.dur, x = f.sx + (f.tx - f.sx) * k, y = f.sy + (f.ty - f.sy) * k - Math.sin(Math.PI * k) * 130, sc = 1 - 0.45 * k;
        g.strokeStyle = f.col; g.lineWidth = 5 * sc; ringPath(g, x, y, sc); g.stroke();
      } else if (s.left > 0) { g.strokeStyle = RING_COLORS[ringNo % RING_COLORS.length]; g.lineWidth = 5; ringPath(g, ORIGIN.x, ORIGIN.y, 1); g.stroke(); }
      fx.draw(g);
    },
  };
}

/* ============================================================ 2. Balloon pop ============================================================ */
function balloonPop() {
  const COLORS = ['#e63946', '#4aa3f0', '#2fa36b', '#ec6ba8', '#8b7cf6', '#f4a261'];
  const s = { score: 0, time: 30, elapsed: 0, balloons: [], spawn: 0, combo: 0, over: false, taps: [] };
  const fx = makeFx();
  const mult = () => 1 + Math.min(s.combo, 8) * 0.25;
  function spawn() {
    const gold = Math.random() < 0.1, r = gold ? 18 : rand(20, 34);
    s.balloons.push({ x: rand(r + 10, W - r - 10), y: H + r + 20, r, vy: rand(55, 100) * (gold ? 1.6 : 1), ph: rand(0, TAU), col: gold ? '#ffd24a' : pick(COLORS), gold, pts: gold ? 50 : Math.round(70 - r * 1.4) });
  }
  return {
    get score() { return s.score; }, get over() { return s.over; },
    extra: () => `⏱ ${Math.ceil(Math.max(0, s.time))}`,
    move() {}, up() {},
    down(x, y) {
      let hit = null, bd = 1e9;
      for (const b of s.balloons) { const d = Math.hypot(b.x - x, b.y - y); if (d <= b.r + 12 && d < bd) { bd = d; hit = b; } }
      s.taps.push({ x, y, life: 0.25 });
      if (!hit) { s.combo = 0; sound.blip(200, 0.06, 0.3); return; }
      s.balloons.splice(s.balloons.indexOf(hit), 1);
      s.combo++;
      const pts = Math.round(hit.pts * mult()); s.score += pts;
      fx.burst(hit.x, hit.y, [hit.col, '#fff'], 12); fx.msg(hit.x, hit.y - hit.r, `+${pts}`, hit.gold ? '#ffe38a' : '#fff');
      sound.blip(hit.gold ? 1320 : 700 + Math.min(s.combo, 8) * 60, 0.1, 0.6);
    },
    update(dt) {
      s.time -= dt; s.elapsed += dt; fx.update(dt);
      if (s.time <= 0) { s.over = true; return; }
      if ((s.spawn -= dt) <= 0) { spawn(); s.spawn = Math.max(0.4, 0.95 - s.elapsed * 0.014); }
      for (let i = s.balloons.length - 1; i >= 0; i--) { const b = s.balloons[i]; b.y -= b.vy * dt; b.ph += dt * 2; b.x += Math.sin(b.ph) * 18 * dt; if (b.y < -b.r - 40) s.balloons.splice(i, 1); }
      for (let i = s.taps.length - 1; i >= 0; i--) { s.taps[i].life -= dt; if (s.taps[i].life <= 0) s.taps.splice(i, 1); }
    },
    draw(g) {
      nightSky(g); stars(g, s.elapsed);
      g.fillStyle = '#e8f0ff'; g.beginPath(); g.moveTo(0, H); g.lineTo(0, H - 36); g.quadraticCurveTo(90, H - 56, 180, H - 38); g.quadraticCurveTo(270, H - 22, W, H - 46); g.lineTo(W, H); g.fill(); // snow
      for (const b of s.balloons) {
        g.strokeStyle = '#ffffff88'; g.lineWidth = 1.4; g.beginPath(); g.moveTo(b.x, b.y + b.r * 1.2); g.quadraticCurveTo(b.x + Math.sin(b.ph) * 8, b.y + b.r * 2.2, b.x, b.y + b.r * 3.2); g.stroke();
        g.fillStyle = b.col; g.beginPath(); g.ellipse(b.x, b.y, b.r * 0.86, b.r, 0, 0, TAU); g.fill();
        g.beginPath(); g.moveTo(b.x, b.y + b.r); g.lineTo(b.x - 5, b.y + b.r + 8); g.lineTo(b.x + 5, b.y + b.r + 8); g.fill();
        g.fillStyle = '#ffffff66'; g.beginPath(); g.ellipse(b.x - b.r * 0.32, b.y - b.r * 0.38, b.r * 0.18, b.r * 0.3, 0.5, 0, TAU); g.fill();
        if (b.gold) text(g, '★', b.x, b.y, { size: 16, color: '#fff7c4' });
      }
      for (const p of s.taps) { g.strokeStyle = '#fff'; g.globalAlpha = p.life * 3; g.lineWidth = 2; g.beginPath(); g.arc(p.x, p.y, 10 + (0.25 - p.life) * 60, 0, TAU); g.stroke(); }
      g.globalAlpha = 1;
      fx.draw(g);
      if (s.combo >= 2) text(g, `🔥 x${mult().toFixed(2).replace(/\.?0+$/, '')}`, W / 2, H - 22, { size: 22, color: '#ffd166' });
    },
  };
}

/* ============================================================ 3. Snowball toss ============================================================ */
function snowToss() {
  const LANES = [
    { y: 175, size: 34, speed: 135, dir: 1, pts: 50, n: 3 },
    { y: 262, size: 44, speed: 92, dir: -1, pts: 25, n: 3 },
    { y: 352, size: 54, speed: 60, dir: 1, pts: 10, n: 3 },
  ];
  const COLS = ['#c8283c', '#2f8f4e', '#4a7fd0', '#a855f7', '#e8b84a'];
  const s = { score: 0, left: 12, aim: null, flights: [], splats: [], cool: 0, endIn: -1, over: false, time: 0 };
  const fx = makeFx();
  LANES.forEach((l) => { const gap = (W + l.size * 2 + 40) / l.n; l.boxes = Array.from({ length: l.n }, (_, i) => ({ x: -l.size + i * gap, col: pick(COLS), alive: true, back: 0 })); l.span = W + l.size * 2 + 40; });
  const FLIGHT = 0.5, ORIGIN = { x: W / 2, y: H - 34 };
  return {
    get score() { return s.score; }, get over() { return s.over; },
    extra: () => `❄ ${s.left}`,
    move(x, y) { s.aim = { x, y }; },
    up() {},
    down(x, y) {
      s.aim = { x, y };
      if (s.cool > 0 || s.left <= 0) return;
      s.left--; s.cool = 0.22;
      s.flights.push({ t: 0, tx: clamp(x, 0, W), ty: clamp(y, 100, 400) });
      sound.blip(480, 0.07, 0.4);
    },
    update(dt) {
      s.time += dt; s.cool -= dt; fx.update(dt);
      for (const l of LANES) for (const b of l.boxes) {
        if (!b.alive) { if ((b.back -= dt) <= 0) { b.alive = true; b.x = l.dir > 0 ? -l.size : W + l.size; b.col = pick(COLS); } continue; }
        b.x += l.dir * l.speed * dt;
        if (l.dir > 0 && b.x > W + l.size + 20) b.x -= l.span; else if (l.dir < 0 && b.x < -l.size - 20) b.x += l.span;
      }
      for (let i = s.flights.length - 1; i >= 0; i--) {
        const f = s.flights[i]; f.t += dt;
        if (f.t < FLIGHT) continue;
        s.flights.splice(i, 1);
        let hit = null;
        for (const l of LANES) { if (Math.abs(f.ty - l.y) > l.size / 2 + 8) continue; for (const b of l.boxes) if (b.alive && Math.abs(f.tx - b.x) < l.size / 2 + 8) { hit = { l, b }; break; } if (hit) break; }
        if (hit) {
          hit.b.alive = false; hit.b.back = 1.3; s.score += hit.l.pts;
          fx.burst(hit.b.x, hit.l.y, [hit.b.col, '#ffd166', '#fff'], 16); fx.msg(hit.b.x, hit.l.y - hit.l.size / 2 - 6, `+${hit.l.pts}`);
          sound.blip(hit.l.pts >= 25 ? 1175 : 880, 0.16, 0.7);
        } else { s.splats.push({ x: f.tx, y: f.ty, life: 1.2 }); sound.blip(200, 0.08, 0.4); }
        if (s.left <= 0 && !s.flights.length) s.endIn = 0.8;
      }
      for (let i = s.splats.length - 1; i >= 0; i--) { s.splats[i].life -= dt; if (s.splats[i].life <= 0) s.splats.splice(i, 1); }
      if (s.endIn >= 0 && (s.endIn -= dt) < 0) s.over = true;
    },
    draw(g) {
      nightSky(g); stars(g, s.time);
      for (const l of LANES) {
        g.fillStyle = '#6a4425'; g.fillRect(0, l.y + l.size / 2 - 2, W, 9); g.fillStyle = '#8a5a30'; g.fillRect(0, l.y + l.size / 2 - 2, W, 3);
        text(g, `${l.pts}`, 18, l.y + l.size / 2 + 18, { size: 11, color: '#f3e2bd' });
        for (const b of l.boxes) {
          if (!b.alive) continue;
          const sz = l.size, x = b.x - sz / 2, y = l.y - sz / 2 + 2;
          g.fillStyle = b.col; g.fillRect(x, y, sz, sz - 4);
          g.fillStyle = '#ffffff40'; g.fillRect(x, y, sz, 5);
          g.fillStyle = '#ffe9a8'; g.fillRect(b.x - 3.5, y, 7, sz - 4); g.fillRect(x, l.y - 3, sz, 7);
          g.beginPath(); g.ellipse(b.x - 7, y - 3, 8, 5, -0.5, 0, TAU); g.ellipse(b.x + 7, y - 3, 8, 5, 0.5, 0, TAU); g.fill();
        }
      }
      g.fillStyle = '#e8f0ff'; g.fillRect(0, H - 52, W, 52);
      for (const p of s.splats) { g.globalAlpha = clamp(p.life, 0, 1) * 0.8; g.fillStyle = '#fff'; g.beginPath(); g.arc(p.x, p.y, 9, 0, TAU); g.arc(p.x + 8, p.y - 5, 4, 0, TAU); g.arc(p.x - 7, p.y + 6, 3.5, 0, TAU); g.fill(); }
      g.globalAlpha = 1;
      if (s.aim && s.left > 0) { g.strokeStyle = '#ffffffcc'; g.lineWidth = 2; g.beginPath(); g.arc(s.aim.x, s.aim.y, 14, 0, TAU); g.moveTo(s.aim.x - 20, s.aim.y); g.lineTo(s.aim.x + 20, s.aim.y); g.moveTo(s.aim.x, s.aim.y - 20); g.lineTo(s.aim.x, s.aim.y + 20); g.stroke(); }
      for (const f of s.flights) {
        const k = f.t / FLIGHT, x = ORIGIN.x + (f.tx - ORIGIN.x) * k, y = ORIGIN.y + (f.ty - ORIGIN.y) * k - Math.sin(Math.PI * k) * 60, r = 11 * (1 - 0.5 * k);
        g.fillStyle = '#fff'; g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill(); g.fillStyle = '#c8d8f5'; g.beginPath(); g.arc(x + r * 0.25, y + r * 0.3, r * 0.5, 0, TAU); g.fill();
      }
      if (s.left > 0) { g.fillStyle = '#fff'; g.beginPath(); g.arc(ORIGIN.x, ORIGIN.y, 11, 0, TAU); g.fill(); }
      fx.draw(g);
    },
  };
}

/* ============================================================ 4. Gift fishing ============================================================ */
function giftFishing() {
  const KINDS = [{ e: '🎁', v: 20 }, { e: '⭐', v: 50 }, { e: '🧦', v: 10 }, { e: '🍬', v: 15 }, { e: '🔔', v: 30 }];
  const WATER = 215, HOME = 70, BOTTOM = 490;
  const s = { score: 0, time: 40, elapsed: 0, hx: W / 2, aimX: W / 2, hy: HOME, state: 'idle', caught: null, items: [], over: false };
  const fx = makeFx();
  const newItem = (y, x = rand(30, W - 30)) => { const k = pick(KINDS); return { ...k, x, y, dir: Math.random() < 0.5 ? -1 : 1, speed: rand(28, 66), ph: rand(0, TAU) }; };
  for (let i = 0; i < 9; i++) s.items.push(newItem(WATER + 40 + i * 30));
  const aim = (x) => { if (s.state === 'idle') s.aimX = clamp(x, 24, W - 24); };
  return {
    get score() { return s.score; }, get over() { return s.over; },
    extra: () => `⏱ ${Math.ceil(Math.max(0, s.time))}`,
    move: aim, up() {},
    down(x) { if (s.state !== 'idle') return; s.aimX = clamp(x, 24, W - 24); s.state = 'drop'; sound.blip(420, 0.07, 0.4); },
    update(dt) {
      s.elapsed += dt; s.time -= dt; fx.update(dt);
      if (s.time <= 0) { s.over = true; return; }
      for (const it of s.items) { if (it === s.caught) continue; it.x += it.dir * it.speed * dt; it.ph += dt * 3; if (it.x < 22) { it.x = 22; it.dir = 1; } else if (it.x > W - 22) { it.x = W - 22; it.dir = -1; } }
      if (s.state === 'idle') s.hx += (s.aimX - s.hx) * Math.min(1, dt * 10);
      else if (s.state === 'drop') {
        s.hx += (s.aimX - s.hx) * Math.min(1, dt * 14);
        s.hy += 300 * dt;
        if (s.hy > WATER) for (const it of s.items) if (Math.abs(it.x - s.hx) < 26 && Math.abs(it.y - s.hy) < 24) { s.caught = it; s.state = 'reel'; sound.blip(660, 0.08, 0.5); break; }
        if (s.state === 'drop' && s.hy >= BOTTOM) s.state = 'reel';
      } else if (s.state === 'reel') {
        s.hy -= 330 * dt;
        if (s.caught) { s.caught.x = s.hx; s.caught.y = s.hy + 24; }
        if (s.hy <= HOME) {
          s.hy = HOME; s.state = 'idle';
          const c = s.caught;
          if (c) { s.score += c.v; fx.msg(s.hx, HOME + 50, `+${c.v}`); fx.burst(s.hx, HOME + 30, ['#ffd166', '#fff', '#7ee0ff'], 12); sound.blip(c.v >= 30 ? 1175 : 880, 0.18, 0.7); s.items.splice(s.items.indexOf(c), 1); s.items.push(newItem(rand(WATER + 40, BOTTOM - 20), Math.random() < 0.5 ? 20 : W - 20)); s.caught = null; }
        }
      }
    },
    draw(g) {
      nightSky(g, WATER + 40); stars(g, s.elapsed);
      g.fillStyle = '#e8f0ff'; g.fillRect(0, WATER - 22, W, 22); // ice rim
      const wat = g.createLinearGradient(0, WATER, 0, H); wat.addColorStop(0, '#2a78a8'); wat.addColorStop(1, '#0d2a52');
      g.fillStyle = wat; g.fillRect(0, WATER, W, H - WATER);
      g.strokeStyle = '#ffffff40'; g.lineWidth = 2; g.beginPath(); for (let x = 0; x <= W; x += 12) g.lineTo(x, WATER + Math.sin(x * 0.07 + s.elapsed * 2) * 3); g.stroke();
      g.fillStyle = '#6a4425'; g.fillRect(0, 26, W, 9); // the rail the hook slides on
      for (const it of s.items) emoji(g, it.e, it.x, it.y + Math.sin(it.ph) * 3, 34);
      g.fillStyle = '#d9a640'; g.fillRect(s.hx - 9, 22, 18, 17);
      g.strokeStyle = '#eef4ff'; g.lineWidth = 1.6; g.beginPath(); g.moveTo(s.hx, 39); g.lineTo(s.hx, s.hy); g.stroke();
      g.strokeStyle = '#cfd8e8'; g.lineWidth = 3.5; g.beginPath(); g.arc(s.hx - 6, s.hy + 4, 7, -0.5 * Math.PI, 0.9 * Math.PI); g.stroke();
      if (s.caught) emoji(g, s.caught.e, s.hx, s.hy + 26, 34);
      fx.draw(g);
    },
  };
}

const GAMES = {
  catch: { make: catchGifts, icon: '🎀' }, rings: { make: ringToss, icon: '🎯' }, balloons: { make: balloonPop, icon: '🎈' }, snow: { make: snowToss, icon: '☃️' },
  fishing: { make: giftFishing, icon: '🎣' }, whack: { make: whackSnowman, icon: '🔨' }, memory: { make: memoryMatch, icon: '🃏' }, archery: { make: archery, icon: '🏹' },
  cups: { make: cupGame, icon: '🎩' }, plinko: { make: plinko, icon: '🎱' }, bells: { make: bellRhythm, icon: '🔔' }, tower: { make: stackTower, icon: '🍪' },
};

/* ============================================================ Dialog + the Play button ============================================================ */
export function initMinigames({ getPlayer }) {
  const dlg = $('dlg-game'), cv = $('g-canvas'), g = cv.getContext('2d'), over = $('g-over');
  const stalls = Object.entries(STALL_GAMES).map(([i, id]) => { const [x, z] = marketWorld(...STALLS[i]); return { id, x, z }; });
  const btn = $('play-btn');
  let near = null, game = null, def = null, id = null, phase = 'intro', raf = 0, last = 0, time = 0;
  const bestOf = (gid) => store.get(`noel.mg.${gid}`, 0);

  function refreshText() {
    if (near) btn.textContent = `${GAMES[near.id].icon} ${t('mg.play', { game: t(`mg.${near.id}`) })}`;
    if (id && dlg.open) { $('g-title').textContent = `${def.icon} ${t(`mg.${id}`)}`; if (phase === 'intro') showIntro(); else if (phase === 'over') showOver(); }
  }
  const h = (tag, props = {}, ...kids) => { const el = document.createElement(tag); for (const [k, v] of Object.entries(props)) { if (k === 'class') el.className = v; else if (k === 'text') el.textContent = v; else if (k.startsWith('on')) el.addEventListener(k.slice(2), v); else el.setAttribute(k, v); } el.append(...kids.flat().filter((c) => c != null)); return el; };

  function showIntro() {
    over.hidden = false;
    over.replaceChildren(h('div', { class: 'gbig', text: def.icon }), h('b', { text: t(`mg.${id}`) }), h('p', { text: t(`mg.help.${id}`) }),
      h('button', { type: 'button', class: 'primary', text: t('mg.start'), onclick: start }));
  }
  function showOver() {
    over.hidden = false;
    const best = bestOf(id), fresh = game.score > 0 && game.score >= best && game.record;
    over.replaceChildren(h('div', { class: 'gbig', text: fresh ? '🏆' : def.icon }), h('b', { text: t('mg.over') }), h('p', { class: 'gscore', text: t('mg.result', { n: game.score }) }),
      fresh ? h('p', { class: 'ok', text: t('mg.record') }) : h('p', { class: 'dim', text: t('mg.bestis', { n: best }) }),
      h('button', { type: 'button', class: 'primary', text: t('mg.again'), onclick: start }), h('button', { type: 'button', class: 'link', text: t('close'), onclick: () => dlg.close() }));
  }
  function start() {
    game = def.make(); game.record = false; phase = 'play'; over.hidden = true; over.replaceChildren(); last = performance.now();
    loop();
  }
  function finish() {
    phase = 'over';
    const prev = bestOf(id);
    if (game.score > prev) { store.set(`noel.mg.${id}`, game.score); game.record = true; } else game.record = false;
    showOver();
    hud();
  }
  function hud() {
    $('g-score').textContent = `⭐ ${game ? game.score : 0}`;
    $('g-extra').textContent = game && phase === 'play' ? game.extra() : '';
    $('g-best').textContent = `🏅 ${t('mg.best')}: ${Math.max(bestOf(id), game && game.record ? game.score : 0)}`;
  }
  function loop() {
    cancelAnimationFrame(raf);
    const step = (now) => {
      if (!dlg.open) return;
      const dt = Math.min((now - last) / 1000, 0.05); last = now; time += dt;
      if (phase === 'play' && game) { game.update(dt); if (game.over) finish(); }
      if (game) game.draw(g); else { g.fillStyle = '#07122c'; g.fillRect(0, 0, W, H); }
      if (phase === 'play') hud();
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
  }

  /* pointer input, mapped into the 360 x 520 game space */
  const pos = (e) => { const r = cv.getBoundingClientRect(); return [((e.clientX - r.left) / r.width) * W, ((e.clientY - r.top) / r.height) * H]; };
  cv.addEventListener('pointerdown', (e) => { if (phase !== 'play') return; e.preventDefault(); cv.setPointerCapture?.(e.pointerId); game.down(...pos(e)); });
  cv.addEventListener('pointermove', (e) => { if (phase === 'play') game.move(...pos(e)); });
  cv.addEventListener('pointerup', (e) => { if (phase === 'play') game.up(...pos(e)); });
  cv.addEventListener('pointercancel', () => {});

  function open(gid) {
    id = gid; def = GAMES[gid]; game = null; phase = 'intro';
    $('g-title').textContent = `${def.icon} ${t(`mg.${gid}`)}`;
    hud(); showIntro();
    if (!dlg.open) dlg.showModal();
    loop();
  }
  dlg.addEventListener('close', () => { cancelAnimationFrame(raf); game = null; id = null; });
  $('g-close').addEventListener('click', () => dlg.close());
  btn.addEventListener('click', () => { if (near) open(near.id); });
  onLang(refreshText);

  return {
    /** Call every frame: shows the Play button while the player stands next to a stall that has a game. */
    update() {
      const p = getPlayer();
      let best = null;
      if (p && !document.querySelector('dialog[open]')) for (const s of stalls) { const d = Math.hypot(p.x - s.x, p.z - s.z); if (d < (near === s ? 3.7 : 3.1) && (!best || d < best.d)) best = { s, d }; }
      const was = near;
      near = best ? best.s : null;
      btn.hidden = !near;
      if (near !== was) refreshText();
    },
  };
}
