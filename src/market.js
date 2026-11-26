import * as THREE from 'three';
import { makeGlow, softTex, terrainHeight, mulberry } from './textures.js';
import { bulbSet } from './env.js';
import { MARKET, BUILDINGS, STALLS, STALL_GAMES, SLEIGHS, NUTCRACKERS, TREES, GATE, PYRAMID, LOCAL_OBSTACLES } from './marketlayout.js';
import { createPerson } from './avatars.js';
import { SHIRTS, HATS } from './state.js';
import { t } from './i18n.js';
import { now } from './clock.js';

/**
 * A Bavarian-style Christmas market (Weihnachtsmarkt) at the end of the south-west avenue, in the spirit of Leavenworth:
 * timber-framed houses with snowy roofs, a clock tower with a star, wooden stalls, a turning Christmas pyramid,
 * nutcrackers and strings of lights. Three of the boards are live: the clock tower's countdown to Christmas, the wish
 * board (latest wishes from the tree) and a chalkboard with the leaderboard.
 */
const std = (color, rough = 0.8, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: rough, ...extra });
const GOLD = new THREE.Color(3, 2.2, 0.6);

function canvasTex(w, h) {
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return { canvas, ctx: canvas.getContext('2d'), tex };
}
function wrapText(ctx, text, x, y, maxW, lineH, maxLines) {
  const words = String(text).split(' ');
  let line = '', n = 0;
  for (const w of words) {
    const test = line ? `${line} ${w}` : w;
    if (ctx.measureText(test).width > maxW && line) {
      ctx.fillText(line, x, y + n * lineH);
      if (++n >= maxLines) return n;
      line = w;
    } else line = test;
  }
  ctx.fillText(line, x, y + n * lineH);
  return n + 1;
}

/* ---------- Shared textures ---------- */
function woodTexture() {
  const c = canvasTex(128, 128), g = c.ctx;
  g.fillStyle = '#7d5532'; g.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 6; i++) { g.fillStyle = i % 2 ? 'rgba(0,0,0,.14)' : 'rgba(255,220,170,.07)'; g.fillRect(i * 21.3, 0, 21.3, 128); g.fillStyle = 'rgba(0,0,0,.35)'; g.fillRect(i * 21.3, 0, 1.5, 128); }
  for (let i = 0; i < 140; i++) { g.fillStyle = `rgba(40,20,5,${0.05 + Math.random() * 0.1})`; g.fillRect(Math.random() * 128, Math.random() * 128, 1, 4 + Math.random() * 14); }
  c.tex.wrapS = c.tex.wrapT = THREE.RepeatWrapping;
  return c.tex;
}
function stripeTexture() { // red / white awning
  const c = canvasTex(128, 32), g = c.ctx;
  for (let i = 0; i < 8; i++) { g.fillStyle = i % 2 ? '#f6f0e6' : '#c8283c'; g.fillRect(i * 16, 0, 16, 32); }
  c.tex.wrapS = THREE.RepeatWrapping;
  return c.tex;
}

/** Plaster wall with dark timber framing, shuttered windows, flower boxes: diffuse + a separate emissive (lit windows). */
function makeFacade(rnd, W, H, { wall, shutter, rows, cols, door = true, icing = false }) {
  const a = canvasTex(W, H), e = canvasTex(W, H), c = a.ctx, ce = e.ctx;
  c.fillStyle = wall; c.fillRect(0, 0, W, H);
  for (let i = 0; i < 900; i++) { c.fillStyle = `rgba(${rnd() < 0.5 ? '255,250,235' : '60,40,20'},${0.03 + rnd() * 0.05})`; c.fillRect(rnd() * W, rnd() * H, 1 + rnd() * 3, 1 + rnd() * 3); }
  ce.fillStyle = '#000'; ce.fillRect(0, 0, W, H);
  const fh = H / rows, pw = W / cols, TIMBER = '#47301f';
  c.fillStyle = TIMBER; c.strokeStyle = TIMBER;
  for (let r = 0; r <= rows; r++) c.fillRect(0, Math.min(H - 8, Math.max(0, r * fh - 4)), W, 8);
  for (let i = 0; i <= cols; i++) c.fillRect(Math.min(W - 8, Math.max(0, i * pw - 4)), 0, 8, H);
  c.lineWidth = 6;
  for (let r = 0; r < rows; r++) for (let i = 0; i < cols; i++) {
    if (rnd() < 0.45) { c.beginPath(); if (rnd() < 0.5) { c.moveTo(i * pw, r * fh + fh); c.lineTo(i * pw + pw * 0.4, r * fh + fh * 0.45); } else { c.moveTo(i * pw + pw, r * fh + fh); c.lineTo(i * pw + pw * 0.6, r * fh + fh * 0.45); } c.stroke(); }
  }
  for (let r = 0; r < rows; r++) for (let i = 0; i < cols; i++) {
    const px = i * pw, py = r * fh, ground = r === rows - 1;
    if (ground && door && i === Math.floor(cols / 2)) { // wooden door with a warm lit window above
      const dw = pw * 0.5, dh = fh * 0.78, dx = px + (pw - dw) / 2, dy = py + fh - dh;
      c.fillStyle = '#4b2e1a'; c.fillRect(dx, dy, dw, dh); c.fillStyle = '#2f1c10'; c.fillRect(dx + dw * 0.1, dy + dh * 0.1, dw * 0.8, dh * 0.8);
      c.fillStyle = '#d9b36a'; c.fillRect(dx + dw * 0.78, dy + dh * 0.5, 6, 6);
      ce.fillStyle = 'rgba(255,200,120,.75)'; ce.fillRect(dx + dw * 0.2, dy + dh * 0.14, dw * 0.6, dh * 0.2);
      continue;
    }
    const ww = pw * 0.4, wh = fh * 0.44, wx = px + (pw - ww) / 2, wy = py + fh * 0.2;
    c.fillStyle = shutter; c.fillRect(wx - ww * 0.42, wy, ww * 0.38, wh); c.fillRect(wx + ww * 1.04, wy, ww * 0.38, wh);
    c.fillStyle = '#efe6d2'; c.fillRect(wx - 3, wy - 3, ww + 6, wh + 6);
    c.fillStyle = '#2a2018'; c.fillRect(wx, wy, ww, wh);
    ce.fillStyle = rnd() < 0.85 ? `rgba(255,${190 + Math.floor(rnd() * 40)},${110 + Math.floor(rnd() * 40)},.95)` : 'rgba(120,150,190,.5)'; ce.fillRect(wx, wy, ww, wh);
    c.fillStyle = '#efe6d2'; c.fillRect(wx + ww / 2 - 1.5, wy, 3, wh); c.fillRect(wx, wy + wh / 2 - 1.5, ww, 3);
    ce.fillStyle = '#000'; ce.fillRect(wx + ww / 2 - 1.5, wy, 3, wh); ce.fillRect(wx, wy + wh / 2 - 1.5, ww, 3);
    c.fillStyle = '#5a3a22'; c.fillRect(wx - 5, wy + wh + 3, ww + 10, 10);
    c.fillStyle = '#f4f8ff'; c.fillRect(wx - 5, wy + wh, ww + 10, 5);
    for (let k = 0; k < 4; k++) { c.fillStyle = rnd() < 0.5 ? '#c8283c' : '#2f8f4e'; c.fillRect(wx + k * (ww / 3.4), wy + wh - 3, 5, 5); }
  }
  if (icing) { // gingerbread: white icing scallops along the top and under each floor
    c.fillStyle = '#fffaf0';
    for (let r = 0; r <= rows; r++) for (let x = 0; x < W; x += 26) { c.beginPath(); c.arc(x + 13, Math.max(8, r * fh), 12, 0, Math.PI); c.fill(); }
  }
  const sn = c.createLinearGradient(0, H * 0.9, 0, H); sn.addColorStop(0, 'rgba(240,246,255,0)'); sn.addColorStop(1, 'rgba(240,246,255,.85)');
  c.fillStyle = sn; c.fillRect(0, H * 0.9, W, H * 0.1);
  return { map: a.tex, emissive: e.tex };
}

export function buildMarket(scene) {
  const rnd = mulberry(1224);
  const updaters = [];
  const WOOD = woodTexture(), STRIPE = stripeTexture();
  const wood = std('#ffffff', 0.8, { map: WOOD }), darkWood = std('#5a3b22', 0.85, { map: WOOD }), snow = std('#eef4ff', 0.9);
  const tile = std('#6a2a22', 0.8), copper = std('#2f6b63', 0.6, { metalness: 0.3 });
  const root = new THREE.Group();
  root.position.set(MARKET.x, terrainHeight(MARKET.x, MARKET.z), MARKET.z);
  root.rotation.y = MARKET.ry;
  scene.add(root);
  const lights = []; // string-light bulbs in the market's local frame

  const faceCenter = (x, z) => Math.atan2(-x, -z);
  const bpt = (b, lx, y, lz) => { const ry = faceCenter(b.x, b.z), c = Math.cos(ry), s = Math.sin(ry); return new THREE.Vector3(b.x + lx * c + lz * s, y, b.z - lx * s + lz * c); };
  const bmap = Object.fromEntries(BUILDINGS.map((b) => [b.id, b]));

  /* ---------- Ground: cobbles, a warm ring, snow at the edge ---------- */
  {
    const R = MARKET.radius + 1.0, S = 1024, u = S / (2 * R), g = canvasTex(S, S), c = g.ctx; // u = canvas pixels per world unit
    c.fillStyle = '#2b2733'; c.fillRect(0, 0, S, S);
    const tileC = document.createElement('canvas'); tileC.width = tileC.height = 32; const tg = tileC.getContext('2d');
    tg.fillStyle = '#2b2733'; tg.fillRect(0, 0, 32, 32);
    for (let r = 0; r < 4; r++) for (let q = -1; q < 3; q++) { tg.fillStyle = `hsl(${28 + Math.round(rnd() * 10)},${10 + Math.round(rnd() * 8)}%,${34 + Math.round(rnd() * 14)}%)`; tg.beginPath(); tg.roundRect(q * 16 + (r % 2 ? 8 : 0) + 1, r * 8 + 1, 14, 6, 2); tg.fill(); }
    c.fillStyle = c.createPattern(tileC, 'repeat'); c.fillRect(0, 0, S, S);
    c.strokeStyle = 'rgba(255,214,150,.35)'; c.lineWidth = 0.3 * u; c.beginPath(); c.arc(S / 2, S / 2, 4.3 * u, 0, Math.PI * 2); c.stroke(); // ring round the pyramid
    c.beginPath(); c.arc(S / 2, S / 2, 9.8 * u, 0, Math.PI * 2); c.lineWidth = 0.12 * u; c.stroke();                                          // path between the firs and the stalls
    c.beginPath(); c.arc(S / 2, S / 2, 15.6 * u, 0, Math.PI * 2); c.stroke();                                                                   // path in front of the houses
    for (let i = 0; i < 70; i++) { // snow drifts creeping in from the edge
      const a = rnd() * Math.PI * 2, r = (19.6 + rnd() * 3.4) * u, x = S / 2 + Math.cos(a) * r, y = S / 2 + Math.sin(a) * r, rr = (0.9 + rnd() * 1.7) * u;
      const gr = c.createRadialGradient(x, y, 0, x, y, rr); gr.addColorStop(0, 'rgba(240,246,255,.9)'); gr.addColorStop(1, 'rgba(240,246,255,0)'); c.fillStyle = gr; c.fillRect(x - rr, y - rr, rr * 2, rr * 2);
    }
    const geo = new THREE.CircleGeometry(R, 96); geo.rotateX(-Math.PI / 2);
    const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: g.tex, roughness: 0.75, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 }));
    mesh.position.y = 0.12; mesh.renderOrder = 2; root.add(mesh);
    const pool = (x, z, size, col, op) => { // soft warm light on the stones, in place of real lights (cheaper)
      const m = new THREE.Mesh(new THREE.PlaneGeometry(size, size), new THREE.MeshBasicMaterial({ map: softTex, color: col, transparent: true, opacity: op, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, fog: false }));
      m.rotation.x = -Math.PI / 2; m.position.set(x, 0.2, z); m.renderOrder = 3; root.add(m);
    };
    const amber = new THREE.Color(1.7, 0.95, 0.35);
    pool(PYRAMID.x, PYRAMID.z, 10, amber, 0.55);
    for (const [x, z] of STALLS) { const a = faceCenter(x, z); pool(x + Math.sin(a) * 0.8, z + Math.cos(a) * 0.8, 5, amber, 0.4); } // in front of each stall
    pool(0, 17, 9, new THREE.Color(1.5, 1.1, 0.5), 0.35);
  }

  /* ---------- Roofs ---------- */
  /** Gable roof (plaster gable ends + tile slabs with a snow layer). Returns the roof group; y = top of the walls. */
  function gableRoof(w, d, rh, plaster) {
    const g = new THREE.Group(), hw = w / 2, ov = 0.55, th = 0.16, L = Math.hypot(hw, rh);
    const tri = new THREE.Shape(); tri.moveTo(-hw, 0); tri.lineTo(hw, 0); tri.lineTo(0, rh);
    const gable = new THREE.Mesh(new THREE.ExtrudeGeometry(tri, { depth: d, bevelEnabled: false }), plaster); gable.position.z = -d / 2; g.add(gable);
    for (const sgn of [1, -1]) {
      const dir = new THREE.Vector2(sgn * hw, -rh).divideScalar(L), nrm = new THREE.Vector2(sgn * rh, hw).divideScalar(L);
      const len = L + ov, cx = (sgn * hw) / 2 + (dir.x * ov) / 2, cy = rh / 2 + (dir.y * ov) / 2, rot = Math.atan2(dir.y, dir.x);
      const slab = new THREE.Mesh(new THREE.BoxGeometry(len, th, d + 2 * ov), tile);
      slab.position.set(cx + (nrm.x * th) / 2, cy + (nrm.y * th) / 2, 0); slab.rotation.z = rot; g.add(slab);
      const cover = new THREE.Mesh(new THREE.BoxGeometry(len - 0.5, 0.14, d + 2 * ov - 0.3), snow);
      cover.position.set(cx + nrm.x * (th + 0.07) - dir.x * 0.18, cy + nrm.y * (th + 0.07) - dir.y * 0.18, 0); cover.rotation.z = rot; g.add(cover);
    }
    const ridge = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.22, d + 2 * ov), snow); ridge.position.y = rh + 0.12; g.add(ridge);
    return g;
  }

  /* ---------- Houses ---------- */
  const looks = {
    east: { wall: '#e6d3a6', shutter: '#2f6f4e', rows: 2, cols: 3 },
    west: { wall: '#c9d8e6', shutter: '#9c2b3a', rows: 2, cols: 3 },
    ne:   { wall: '#e8b8a0', shutter: '#6b3a8a', rows: 2, cols: 2, icing: true },
    nw:   { wall: '#d6e0b8', shutter: '#b34a2a', rows: 2, cols: 2 },
    clock:{ wall: '#e1cfa2', shutter: '#2f4f7a', rows: 4, cols: 2 },
    inn:  { wall: '#e9dcc0', shutter: '#7a2f2f', rows: 2, cols: 3 },
    cafe: { wall: '#cfd9ea', shutter: '#3a6a5a', rows: 2, cols: 3 },
    toy:  { wall: '#f0d3a8', shutter: '#2f6fb0', rows: 2, cols: 2, icing: true },
    bakery: { wall: '#ecc9c0', shutter: '#8a5a2a', rows: 2, cols: 2 },
  };
  const group = {};
  function house(b) {
    const look = looks[b.id], g = new THREE.Group();
    g.position.set(b.x, 0, b.z); g.rotation.y = faceCenter(b.x, b.z);
    group[b.id] = g;
    const W = 256, H = Math.round((256 * b.h) / b.w);
    const { map, emissive } = makeFacade(rnd, W, H, { ...look, door: true });
    const side = std('#ffffff', 0.85, { map, emissive: '#ffffff', emissiveMap: emissive, emissiveIntensity: 1.0 });
    const cap = std('#3a2a22', 0.9);
    const body = new THREE.Mesh(new THREE.BoxGeometry(b.w, b.h, b.d), [side, side, cap, cap, side, side]);
    body.position.y = b.h / 2; g.add(body);
    if (b.id !== 'clock') {
      const plaster = std(look.wall, 0.9);
      const rh = b.w * 0.5, roof = gableRoof(b.w, b.d, rh, plaster); roof.position.y = b.h; g.add(roof);
      for (const sz of [1, -1]) { // timber on the gable ends: a post + a beam + a round attic window
        const post = new THREE.Mesh(new THREE.BoxGeometry(0.16, rh * 0.95, 0.08), darkWood); post.position.set(0, b.h + rh * 0.47, sz * (b.d / 2 + 0.05)); g.add(post);
        const beam = new THREE.Mesh(new THREE.BoxGeometry(b.w * 0.92, 0.16, 0.08), darkWood); beam.position.set(0, b.h + 0.1, sz * (b.d / 2 + 0.05)); g.add(beam);
        const win = new THREE.Mesh(new THREE.CircleGeometry(0.34, 16), new THREE.MeshBasicMaterial({ color: new THREE.Color(2.2, 1.5, 0.7), toneMapped: false })); win.position.set(0, b.h + rh * 0.4, sz * (b.d / 2 + 0.07)); win.rotation.y = sz > 0 ? 0 : Math.PI; g.add(win);
      }
      const chim = new THREE.Mesh(new THREE.BoxGeometry(0.6, 1.5, 0.6), std('#4a3d3a', 0.9)); chim.position.set(b.w * 0.26, b.h + rh * 0.62, -b.d * 0.18); g.add(chim);
      const chimSnow = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.14, 0.72), snow); chimSnow.position.set(b.w * 0.26, b.h + rh * 0.62 + 0.78, -b.d * 0.18); g.add(chimSnow);
    }
    root.add(g);
    return g;
  }
  for (const b of BUILDINGS) house(b);

  /* ---------- Boards: wooden frame + a painted / chalked canvas ---------- */
  const boards = [];
  function board(w, h, px, glowCol) {
    const c = canvasTex(px, Math.round((px * h) / w));
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: c.tex, roughness: 0.8, emissive: '#ffffff', emissiveMap: c.tex, emissiveIntensity: 0.5 }));
    const frame = new THREE.Mesh(new THREE.BoxGeometry(w + 0.34, h + 0.34, 0.14), wood); frame.position.z = -0.08; mesh.add(frame);
    for (const sx of [-1, 1]) { // a lantern on each side
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 0.45), std('#1c1c22', 0.6, { metalness: 0.5 })); post.position.set(sx * (w / 2 + 0.3), h / 2 - 0.1, 0.2); mesh.add(post);
      const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 6), new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 1.9, 0.8), toneMapped: false })); lamp.position.set(sx * (w / 2 + 0.3), h / 2 - 0.25, 0.42); mesh.add(lamp);
      const gl = makeGlow(glowCol, 1.5, 1.5, 0.6); gl.position.copy(lamp.position); mesh.add(gl);
    }
    const b = { ...c, w, h, mesh };
    boards.push(b);
    return b;
  }
  const mountBoard = (houseId, bd, y) => { const b = bmap[houseId]; bd.mesh.position.set(0, y, b.d / 2 + 0.12); group[houseId].add(bd.mesh); };
  const warm = new THREE.Color(1.4, 0.8, 0.3);

  /* --- live: wishes (parchment) --- */
  const sWish = board(4.0, 3.0, 400, warm);
  let wishes = [], wishKey = '';
  function drawWish(index) {
    const w = wishes.length ? wishes[index % wishes.length] : null;
    const key = `${index}|${w ? w.id ?? w.wish : ''}|${wishes.length}|${t('mk.wishes')}`;
    if (key === wishKey) return;
    wishKey = key;
    const { ctx, canvas, tex } = sWish, cw = canvas.width, ch = canvas.height;
    const bg = ctx.createLinearGradient(0, 0, 0, ch); bg.addColorStop(0, '#ecdcb4'); bg.addColorStop(1, '#d9c28f'); ctx.fillStyle = bg; ctx.fillRect(0, 0, cw, ch);
    ctx.strokeStyle = '#7d5532'; ctx.lineWidth = 8; ctx.strokeRect(10, 10, cw - 20, ch - 20);
    ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = '#8a2432'; ctx.font = '800 25px "Times New Roman", Times, serif'; ctx.fillText(t('mk.wishes'), cw / 2, 56);
    ctx.fillStyle = '#8a2432'; ctx.fillText('❄ ✦ ❄', cw / 2, 84);
    if (!w) { ctx.fillStyle = '#7d5532'; ctx.font = '700 80px "Times New Roman", Times, serif'; ctx.fillText('✨', cw / 2, ch / 2 + 20); }
    else {
      ctx.fillStyle = '#3a2414'; ctx.font = 'italic 600 33px "Times New Roman", Times, serif';
      const lines = wrapText(ctx, `“${w.wish}”`, cw / 2, 140, cw - 80, 42, 6);
      ctx.fillStyle = '#8a2432'; ctx.font = 'italic 700 28px "Times New Roman", Times, serif';
      ctx.fillText(`— ${w.name || t('w.anon')}`, cw / 2, Math.min(ch - 36, 140 + lines * 42 + 30));
    }
    tex.needsUpdate = true;
  }
  mountBoard('east', sWish, 3.6);

  /* --- live: leaderboard (chalkboard) --- */
  const sBoard = board(4.0, 3.2, 400, new THREE.Color(1.2, 1.2, 0.9));
  let boardRows = [];
  function drawBoard() {
    const { ctx, canvas, tex } = sBoard, cw = canvas.width, ch = canvas.height;
    ctx.fillStyle = '#1c3a2f'; ctx.fillRect(0, 0, cw, ch);
    for (let i = 0; i < 200; i++) { ctx.fillStyle = `rgba(255,255,255,${0.012 + Math.random() * 0.02})`; ctx.fillRect(Math.random() * cw, Math.random() * ch, 40 + Math.random() * 90, 3 + Math.random() * 9); } // chalk dust
    ctx.strokeStyle = 'rgba(255,255,255,.55)'; ctx.lineWidth = 4; ctx.strokeRect(14, 14, cw - 28, ch - 28);
    ctx.textBaseline = 'alphabetic'; ctx.fillStyle = '#fff3c4'; ctx.textAlign = 'center'; ctx.font = '800 34px "Times New Roman", Times, serif'; ctx.fillText(`★ ${t('sb.title')} ★`, cw / 2, 64);
    if (!boardRows.length) { ctx.fillStyle = 'rgba(255,255,255,.75)'; ctx.font = 'italic 600 27px "Times New Roman", Times, serif'; ctx.fillText(t('sb.empty'), cw / 2, ch / 2 + 10); }
    boardRows.slice(0, 5).forEach((r, i) => {
      ctx.fillStyle = ['#ffd98a', '#ffffff', '#f0b98a', '#f4f4f4', '#f4f4f4'][i]; ctx.font = '700 30px "Times New Roman", Times, serif';
      ctx.textAlign = 'left'; ctx.fillText(`${i + 1}. ${String(r.name).slice(0, 12)}`, 38, 122 + i * 52);
      ctx.textAlign = 'right'; ctx.fillText(String(r.points), cw - 38, 122 + i * 52);
    });
    tex.needsUpdate = true;
  }
  mountBoard('west', sBoard, 3.6);

  /* --- shop signs (static) --- */
  function sign(houseId, text, sub, y, w, bg, fg) {
    const s = board(w, 0.95, 380, new THREE.Color(1.3, 0.8, 0.4)), { ctx, canvas, tex } = s;
    ctx.fillStyle = bg; ctx.fillRect(0, 0, canvas.width, canvas.height); ctx.strokeStyle = fg; ctx.lineWidth = 6; ctx.strokeRect(8, 8, canvas.width - 16, canvas.height - 16);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = fg; ctx.font = '800 50px "Times New Roman", Times, serif'; ctx.fillText(text, canvas.width / 2, canvas.height * 0.4);
    ctx.font = '600 20px "Times New Roman", Times, serif'; ctx.fillText(sub, canvas.width / 2, canvas.height * 0.78); tex.needsUpdate = true;
    mountBoard(houseId, s, y);
  }
  sign('ne', 'LEBKUCHEN', '★ gingerbread · bánh gừng ★', bmap.ne.h - 0.9, 3.4, '#5a2a1e', '#ffe9c4');
  sign('nw', 'GLÜHWEIN', '★ mulled wine · rượu nóng ★', bmap.nw.h - 0.9, 3.4, '#4a1d2a', '#ffd9a0');
  sign('inn', 'GASTHAUS', '★ inn · quán trọ ★', bmap.inn.h - 1.0, 3.8, '#3a2a1a', '#ffe0a8');
  sign('cafe', 'KAFFEEHAUS', '★ coffee & cocoa · cà phê, ca cao ★', bmap.cafe.h - 1.0, 3.8, '#2c3a30', '#f2e6c8');
  sign('toy', 'SPIELWAREN', '★ toys · đồ chơi ★', bmap.toy.h - 0.9, 3.5, '#1f3a5a', '#ffe9c4');
  sign('bakery', 'BÄCKEREI', '★ bakery · tiệm bánh ★', bmap.bakery.h - 0.9, 3.5, '#5a3a1e', '#fff0d0');

  /* ---------- Clock tower ---------- */
  const star = new THREE.Group();
  let clockFace, countBoard;
  {
    const b = bmap.clock, g = group.clock;
    const cornice = new THREE.Mesh(new THREE.BoxGeometry(b.w + 0.6, 0.3, b.d + 0.6), darkWood); cornice.position.y = b.h + 0.15; g.add(cornice);
    const corniceSnow = new THREE.Mesh(new THREE.BoxGeometry(b.w + 0.7, 0.1, b.d + 0.7), snow); corniceSnow.position.y = b.h + 0.34; g.add(corniceSnow);
    const bw = b.w * 0.74, bh = 2.8, belfry = new THREE.Mesh(new THREE.BoxGeometry(bw, bh, bw), darkWood); belfry.position.y = b.h + 0.3 + bh / 2; g.add(belfry);
    const archMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.4, 1.6, 0.7), toneMapped: false });
    for (let k = 0; k < 4; k++) { const arch = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 1.7), archMat); const ang = (k * Math.PI) / 2; arch.position.set(Math.sin(ang) * (bw / 2 + 0.03), b.h + 0.3 + bh / 2, Math.cos(ang) * (bw / 2 + 0.03)); arch.rotation.y = ang; g.add(arch); }
    const spireY = b.h + 0.3 + bh;
    const spireGeo = new THREE.ConeGeometry(b.w * 0.62, 6.0, 4); spireGeo.rotateY(Math.PI / 4);
    const spire = new THREE.Mesh(spireGeo, copper); spire.position.y = spireY + 3.0; g.add(spire);
    const capGeo = new THREE.ConeGeometry(b.w * 0.6, 5.7, 4); capGeo.rotateY(Math.PI / 4);
    const cap = new THREE.Mesh(capGeo, snow); cap.position.y = spireY + 3.12; g.add(cap);
    // the star on top
    const sh = new THREE.Shape(), R = 0.95, r = 0.42;
    for (let i = 0; i < 10; i++) { const rr = i % 2 ? r : R, an = (i * Math.PI) / 5 + Math.PI / 2; (i ? sh.lineTo : sh.moveTo).call(sh, Math.cos(an) * rr, Math.sin(an) * rr); }
    const starMesh = new THREE.Mesh(new THREE.ExtrudeGeometry(sh, { depth: 0.22, bevelEnabled: false }), new THREE.MeshBasicMaterial({ color: GOLD, toneMapped: false })); starMesh.position.z = -0.11;
    star.add(starMesh); star.position.y = spireY + 6.0 + 0.8; g.add(star);
    const sg = makeGlow(new THREE.Color(1.8, 1.3, 0.4), 6, 6, 0.6); sg.position.copy(star.position); g.add(sg);
    updaters.push((time) => { sg.material.opacity = 0.55 + 0.12 * Math.sin(time * 2); });
    // clock face (live time) + countdown board
    clockFace = canvasTex(256, 256);
    const face = new THREE.Mesh(new THREE.CircleGeometry(1.35, 48), new THREE.MeshStandardMaterial({ map: clockFace.tex, roughness: 0.6, emissive: '#ffffff', emissiveMap: clockFace.tex, emissiveIntensity: 0.55 }));
    face.position.set(0, b.h - 2.2, b.d / 2 + 0.08); g.add(face);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(1.4, 0.12, 8, 48), new THREE.MeshStandardMaterial({ color: '#d9a640', roughness: 0.35, metalness: 0.7 })); ring.position.copy(face.position); g.add(ring);
    countBoard = board(3.5, 2.0, 350, warm);
    mountBoard('clock', countBoard, 5.0);
    const lampA = makeGlow(new THREE.Color(1.4, 0.9, 0.4), 4.5, 4.5, 0.4); lampA.position.set(0, b.h - 2.2, b.d / 2 + 0.9); g.add(lampA);
  }
  let clockKey = '', countKey = '';
  function drawClock(n) {
    const key = `${n.getHours()}:${n.getMinutes()}:${n.getSeconds()}`;
    if (key === clockKey) return; clockKey = key;
    const { ctx, tex } = clockFace, S = 256, C = S / 2;
    ctx.clearRect(0, 0, S, S);
    ctx.fillStyle = '#f7efd8'; ctx.beginPath(); ctx.arc(C, C, C, 0, 6.28); ctx.fill();
    ctx.strokeStyle = '#3a2414'; ctx.fillStyle = '#3a2414';
    for (let i = 0; i < 12; i++) { const a = (i * Math.PI) / 6, long = i % 3 === 0; ctx.lineWidth = long ? 8 : 4; ctx.beginPath(); ctx.moveTo(C + Math.sin(a) * (C - 12), C - Math.cos(a) * (C - 12)); ctx.lineTo(C + Math.sin(a) * (C - (long ? 34 : 24)), C - Math.cos(a) * (C - (long ? 34 : 24))); ctx.stroke(); }
    const h = n.getHours() % 12, m = n.getMinutes(), s = n.getSeconds();
    const hand = (ang, len, lw, col) => { ctx.strokeStyle = col; ctx.lineWidth = lw; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(C, C); ctx.lineTo(C + Math.sin(ang) * len, C - Math.cos(ang) * len); ctx.stroke(); };
    hand(((h + m / 60) * Math.PI) / 6, C * 0.5, 10, '#2a1a0e'); hand(((m + s / 60) * Math.PI) / 30, C * 0.74, 7, '#2a1a0e'); hand((s * Math.PI) / 30, C * 0.8, 3, '#b3202f');
    ctx.fillStyle = '#b3202f'; ctx.beginPath(); ctx.arc(C, C, 9, 0, 6.28); ctx.fill();
    tex.needsUpdate = true;
  }
  function drawCount(n) {
    const y = n.getFullYear(), start = new Date(y, 11, 25), end = new Date(y, 11, 26), merry = n >= start && n < end;
    let rows;
    if (!merry) {
      const target = n < start ? start : new Date(y + 1, 11, 25);
      let s = Math.floor((target - n) / 1000);
      const d = Math.floor(s / 86400); s %= 86400; const h = Math.floor(s / 3600); s %= 3600; const m = Math.floor(s / 60); s %= 60;
      rows = [[d, 'u.d'], [h, 'u.h'], [m, 'u.m'], [s, 'u.s']];
    }
    const key = merry ? `m${t('merry')}` : rows.map((r) => r[0]).join(':') + t('u.d');
    if (key === countKey) return; countKey = key;
    const { ctx, canvas, tex } = countBoard, cw = canvas.width, ch = canvas.height;
    const bg = ctx.createLinearGradient(0, 0, 0, ch); bg.addColorStop(0, '#4a2c18'); bg.addColorStop(1, '#2e190d'); ctx.fillStyle = bg; ctx.fillRect(0, 0, cw, ch);
    ctx.strokeStyle = '#d9a640'; ctx.lineWidth = 5; ctx.strokeRect(10, 10, cw - 20, ch - 20);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    if (merry) { ctx.fillStyle = '#ffe9a8'; ctx.font = '800 34px "Times New Roman", Times, serif'; wrapText(ctx, t('merry'), cw / 2, ch * 0.38, cw - 60, 44, 3); tex.needsUpdate = true; return; }
    ctx.fillStyle = '#e8c070'; ctx.font = '700 17px "Times New Roman", Times, serif'; ctx.fillText(t('cd.title'), cw / 2, 36);
    rows.forEach(([v, l], i) => {
      const cx = 52 + i * 82;
      ctx.fillStyle = '#ffe9a8'; ctx.font = '800 46px "Times New Roman", Times, serif'; ctx.fillText(String(v).padStart(2, '0'), cx, 108);
      ctx.fillStyle = '#e8c070'; ctx.font = '700 15px "Times New Roman", Times, serif'; ctx.fillText(t(l), cx, 152);
    });
    tex.needsUpdate = true;
  }

  /* ---------- Stalls ---------- */
  const GAME_SIGNS = { // [title, subtitle, background, text colour] for the stalls that have a mini-game
    rings: ['RINGWURF', '★ ném vòng · ring toss ★', '#4a1d2a', '#ffe0a8'],
    balloons: ['BALLONS', '★ bắn bóng · balloon pop ★', '#1f3a5a', '#ffe9c4'],
    snow: ['SCHNEEBALL', '★ ném tuyết · snowballs ★', '#2c3a30', '#f2e6c8'],
    fishing: ['ANGELN', '★ câu quà · gift fishing ★', '#3a2a1a', '#ffe0a8'],
    catch: ['GESCHENKE', '★ hứng quà · catch gifts ★', '#4a2c18', '#ffe9a8'],
    whack: ['SCHNEEMANN', '★ đập người tuyết · whack ★', '#1f3a4a', '#e8f4ff'],
    memory: ['MEMORY', '★ lật thẻ · card match ★', '#4a1d2a', '#ffd9a0'],
    archery: ['BOGEN', '★ bắn cung · archery ★', '#2c3a30', '#f2e6c8'],
    cups: ['HÜTCHEN', '★ quà ở đâu · find the gift ★', '#5a2a1e', '#ffe9c4'],
    plinko: ['KUGELBAHN', '★ thả bi · plinko ★', '#2a2a4a', '#ffe0a8'],
    bells: ['GLOCKEN', '★ gõ chuông · bell rhythm ★', '#3a2a1a', '#fff0c8'],
    tower: ['TURMBAU', '★ xếp bánh · gingerbread tower ★', '#5a3a1e', '#fff0d0'],
  };
  const keepers = []; // one stallholder per stall
  {
    const roofMat = std('#ffffff', 0.8, { map: STRIPE });
    const goodsCols = ['#c8283c', '#2f8f4e', '#e8b84a', '#4a7fd0', '#a855f7'];
    STALLS.forEach(([x, z], si) => {
      const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = faceCenter(x, z);
      for (const px of [-1.05, 1.05]) for (const pz of [-0.7, 0.75]) { const p = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 2.3, 6), darkWood); p.position.set(px, 1.15, pz); g.add(p); }
      const counter = new THREE.Mesh(new THREE.BoxGeometry(2.3, 0.95, 0.7), wood); counter.position.set(0, 0.5, 0.5); g.add(counter);
      const back = new THREE.Mesh(new THREE.BoxGeometry(2.3, 2.1, 0.1), darkWood); back.position.set(0, 1.1, -0.72); g.add(back);
      for (const sgn of [1, -1]) { // striped awning, two slopes + snow
        const awn = new THREE.Mesh(new THREE.BoxGeometry(2.7, 0.07, 1.2), roofMat); awn.position.set(0, 2.45, sgn * 0.5); awn.rotation.x = -sgn * 0.3; g.add(awn);
        const sn = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.1, 1.1), snow); sn.position.set(0, 2.52 + 0.02, sgn * 0.5); sn.rotation.x = -sgn * 0.3; g.add(sn);
      }
      for (let k = 0; k < 6; k++) { // goods on the counter
        const col = goodsCols[(si + k) % goodsCols.length];
        const m = k % 2 ? new THREE.Mesh(new THREE.SphereGeometry(0.13, 8, 6), std(col, 0.3, { metalness: 0.3, emissive: col, emissiveIntensity: 0.25 })) : new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.18, 0.22), std(col, 0.6, { emissive: col, emissiveIntensity: 0.2 }));
        m.position.set(-0.85 + k * 0.34, 1.07, 0.52); g.add(m);
      }
      for (const lx of [-1.05, 1.05]) { // hanging lanterns
        const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.11, 8, 6), new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 1.9, 0.8), toneMapped: false })); lamp.position.set(lx, 2.05, 0.9); g.add(lamp);
        const gl = makeGlow(new THREE.Color(1.5, 0.85, 0.3), 1.8, 1.8, 0.6); gl.position.copy(lamp.position); g.add(gl);
      }
      if (STALL_GAMES[si]) { // a game stall: a lit sign on two posts above the awning
        const [title, sub, bg, fg] = GAME_SIGNS[STALL_GAMES[si]], sg = canvasTex(360, 120), sc = sg.ctx;
        sc.fillStyle = bg; sc.fillRect(0, 0, 360, 120); sc.strokeStyle = fg; sc.lineWidth = 6; sc.strokeRect(8, 8, 344, 104);
        sc.textAlign = 'center'; sc.textBaseline = 'middle'; sc.fillStyle = fg; const fit = (str, size, weight) => { let n = size; sc.font = weight + ' ' + n + 'px "Times New Roman", Times, serif'; while (sc.measureText(str).width > 326 && n > 12) { n -= 1; sc.font = weight + ' ' + n + 'px "Times New Roman", Times, serif'; } }; // shrink long names to fit the plank
        fit(title, 46, 800); sc.fillText(title, 180, 50); fit(sub, 20, 600); sc.fillText(sub, 180, 92);
        const plank = new THREE.Mesh(new THREE.PlaneGeometry(2.5, 0.83), new THREE.MeshStandardMaterial({ map: sg.tex, emissive: '#ffffff', emissiveMap: sg.tex, emissiveIntensity: 0.65 })); plank.position.set(0, 3.25, 0.5); g.add(plank);
        for (const px of [-1.05, 1.05]) { const post = new THREE.Mesh(new THREE.BoxGeometry(0.07, 1.2, 0.07), darkWood); post.position.set(px, 2.95, 0.46); g.add(post); }
        const gl = makeGlow(new THREE.Color(1.6, 1.0, 0.4), 3.4, 2.0, 0.5); gl.position.set(0, 3.25, 0.9); g.add(gl);
      }
      // the stallholder: stands behind the counter, facing the customers
      const keeper = createPerson({ shirt: SHIRTS[(si * 3 + 1) % SHIRTS.length], hat: HATS[(si * 5 + 2) % HATS.length], name: '', npc: true });
      keeper.userData.label.visible = false; keeper.position.set(0, 0.1, -0.2); g.add(keeper);
      keepers.push({ g: keeper, phase: rnd() * 6.28 });
      root.add(g);
    });
  }

  /* ---------- The Christmas pyramid ---------- */
  {
    const g = new THREE.Group(); g.position.set(PYRAMID.x, 0.1, PYRAMID.z); root.add(g);
    const base = new THREE.Mesh(new THREE.CylinderGeometry(1.55, 1.7, 0.4, 20), darkWood); base.position.y = 0.2; g.add(base);
    const figs = [];
    const figCols = ['#c8283c', '#2f8f4e', '#e8b84a', '#4a7fd0', '#f6f0e6', '#a855f7'];
    for (let k = 0; k < 3; k++) {
      const y0 = 0.4 + k * 1.05, rad = 1.4 - k * 0.38;
      const disc = new THREE.Mesh(new THREE.CylinderGeometry(rad, rad, 0.1, 20), wood); disc.position.y = y0 + 0.05; g.add(disc);
      for (let i = 0; i < 4; i++) { const a = (i * Math.PI) / 2 + Math.PI / 4, p = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.95, 6), darkWood); p.position.set(Math.cos(a) * (rad - 0.1), y0 + 0.55, Math.sin(a) * (rad - 0.1)); g.add(p); }
      const ring = new THREE.Group(); ring.position.y = y0 + 0.1; g.add(ring); figs.push({ ring, dir: k % 2 ? -1 : 1 });
      const n = 7 - k;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2, col = figCols[(i + k) % figCols.length];
        const body = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.34, 8), std(col, 0.6, { emissive: col, emissiveIntensity: 0.25 })); body.position.set(Math.cos(a) * (rad - 0.45), 0.17, Math.sin(a) * (rad - 0.45));
        const head = new THREE.Mesh(new THREE.SphereGeometry(0.075, 8, 6), std('#ffd9b5', 0.6)); head.position.set(body.position.x, 0.4, body.position.z);
        ring.add(body, head);
      }
    }
    const topY = 0.4 + 3 * 1.05;
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 1.2, 6), darkWood); pole.position.y = topY + 0.5; g.add(pole);
    const prop = new THREE.Group(); prop.position.y = topY + 0.95; g.add(prop);
    for (let i = 0; i < 4; i++) { const bl = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.02, 0.2), std(i % 2 ? '#c8283c' : '#f6f0e6', 0.6)); bl.rotation.y = (i * Math.PI) / 2; bl.position.set(Math.cos((i * Math.PI) / 2) * 0.5, 0, -Math.sin((i * Math.PI) / 2) * 0.5); bl.rotation.set(0.25, (i * Math.PI) / 2, 0); prop.add(bl); }
    const topStar = new THREE.Mesh(new THREE.OctahedronGeometry(0.16), new THREE.MeshBasicMaterial({ color: GOLD, toneMapped: false })); topStar.position.y = topY + 1.2; g.add(topStar);
    const glow = makeGlow(new THREE.Color(1.8, 1.1, 0.4), 4.2, 4.2, 0.5); glow.position.y = 1.6; g.add(glow);
    for (let i = 0; i < 8; i++) { // candles round the base
      const a = (i / 8) * Math.PI * 2, can = new THREE.Mesh(new THREE.SphereGeometry(0.06, 6, 5), new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 2, 0.8), toneMapped: false })); can.position.set(Math.cos(a) * 1.4, 0.5, Math.sin(a) * 1.4); g.add(can);
    }
    updaters.push((time, dt) => { figs.forEach((f) => { f.ring.rotation.y += dt * 0.35 * f.dir; }); prop.rotation.y += dt * 2.2; topStar.rotation.y += dt; glow.material.opacity = 0.45 + 0.1 * Math.sin(time * 3); });
  }

  /* ---------- Nutcrackers ---------- */
  {
    const red = std('#b3202f', 0.5, { emissive: '#3a0a10', emissiveIntensity: 0.5 }), black = std('#1a1a22', 0.5), skin = std('#f1c9a0', 0.6), white = std('#f6f0e6', 0.8), goldM = std('#d9a640', 0.3, { metalness: 0.7 });
    NUTCRACKERS.forEach(([x, z]) => {
      const g = new THREE.Group(); g.position.set(x, 0.1, z); g.rotation.y = faceCenter(x, z);
      for (const lx of [-0.16, 0.16]) { const leg = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.7, 0.26), white); leg.position.set(lx, 0.55, 0); g.add(leg); const boot = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.2, 0.34), black); boot.position.set(lx, 0.1, 0.03); g.add(boot); }
      const coat = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.95, 0.4), red); coat.position.y = 1.4; g.add(coat);
      const belt = new THREE.Mesh(new THREE.BoxGeometry(0.66, 0.1, 0.44), goldM); belt.position.y = 1.1; g.add(belt);
      for (let k = 0; k < 3; k++) { const bt = new THREE.Mesh(new THREE.SphereGeometry(0.04, 6, 5), goldM); bt.position.set(0, 1.5 + k * 0.17, 0.21); g.add(bt); }
      for (const sx of [-1, 1]) { const arm = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.7, 0.2), red); arm.position.set(sx * 0.4, 1.4, 0); g.add(arm); const hand = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 6), white); hand.position.set(sx * 0.4, 1.0, 0); g.add(hand); }
      const head = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.44, 0.38), skin); head.position.y = 2.1; g.add(head);
      const jaw = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.12, 0.3), skin); jaw.position.set(0, 1.84, 0.02); g.add(jaw);
      const must = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.09, 0.08), white); must.position.set(0, 2.04, 0.2); g.add(must);
      for (const ex of [-0.1, 0.1]) { const eye = new THREE.Mesh(new THREE.SphereGeometry(0.035, 6, 5), black); eye.position.set(ex, 2.2, 0.2); g.add(eye); }
      const hat = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.24, 0.55, 12), black); hat.position.y = 2.6; g.add(hat);
      const band = new THREE.Mesh(new THREE.CylinderGeometry(0.245, 0.245, 0.08, 12), goldM); band.position.y = 2.42; g.add(band);
      const plume = new THREE.Mesh(new THREE.SphereGeometry(0.08, 6, 5), std('#c8283c', 0.6)); plume.position.set(0, 2.92, 0); g.add(plume);
      root.add(g);
    });
  }

  /* ---------- Parked sleighs ---------- */
  {
    const red = std('#b3202f', 0.45, { emissive: '#3a0a10', emissiveIntensity: 0.5 }), goldM = std('#d9a640', 0.3, { metalness: 0.7 });
    SLEIGHS.forEach(([x, z, hd]) => {
      const g = new THREE.Group(); g.position.set(x, 0.12, z); g.rotation.y = hd;
      const body = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.45, 0.85), red); body.position.y = 0.5; g.add(body);
      const front = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.45, 0.85), red); front.position.set(1.0, 0.72, 0); front.rotation.z = 0.5; g.add(front);
      const back = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.7, 0.85), red); back.position.set(-0.92, 0.85, 0); g.add(back);
      for (const rz of [-0.36, 0.36]) { const run = new THREE.Mesh(new THREE.BoxGeometry(2.3, 0.07, 0.07), goldM); run.position.set(0.1, 0.12, rz); g.add(run); const curl = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.035, 5, 8, Math.PI / 1.4), goldM); curl.position.set(1.28, 0.3, rz); curl.rotation.z = -0.4; g.add(curl); }
      [['#2f8f4e', 0.42, -0.35, 0.95], ['#4a7fd0', 0.34, 0.15, 1.0], ['#e8b84a', 0.3, -0.1, 1.28]].forEach(([c, s, px, py], gi) => {
        const box = new THREE.Mesh(new THREE.BoxGeometry(s, s * 0.9, s), std(c, 0.6, { emissive: c, emissiveIntensity: 0.15 })); box.position.set(px, py - 0.12, (gi - 1) * 0.12); g.add(box);
        const rib = new THREE.Mesh(new THREE.BoxGeometry(s * 1.04, s * 0.2, s * 1.04), std('#f6f0e6', 0.7)); rib.position.copy(box.position); g.add(rib);
      });
      const snowTop = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.06, 0.9), snow); snowTop.position.y = 0.76; g.add(snowTop);
      root.add(g);
    });
  }

  /* ---------- Welcome arch ---------- */
  {
    const g = new THREE.Group(); g.position.set(0, 0, GATE.z); root.add(g);
    for (const sx of [-1, 1]) { const post = new THREE.Mesh(new THREE.BoxGeometry(0.4, 3.6, 0.4), wood); post.position.set(sx * GATE.halfWidth, 1.8, 0); g.add(post); const sn = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.12, 0.48), snow); sn.position.set(sx * GATE.halfWidth, 3.66, 0); g.add(sn); }
    const beam = new THREE.Mesh(new THREE.BoxGeometry(GATE.halfWidth * 2 + 0.8, 0.5, 0.45), wood); beam.position.y = 3.6; g.add(beam);
    const snB = new THREE.Mesh(new THREE.BoxGeometry(GATE.halfWidth * 2 + 0.9, 0.12, 0.5), snow); snB.position.y = 3.91; g.add(snB);
    const sg = canvasTex(512, 96), c = sg.ctx; c.fillStyle = '#4a2c18'; c.fillRect(0, 0, 512, 96); c.strokeStyle = '#d9a640'; c.lineWidth = 5; c.strokeRect(6, 6, 500, 84);
    c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillStyle = '#ffe9a8'; c.font = '800 38px "Times New Roman", Times, serif'; c.fillText('WEIHNACHTSMARKT', 256, 40); c.fillStyle = '#e8c070'; c.font = '600 19px "Times New Roman", Times, serif'; c.fillText('★ Chợ Noel · Christmas Market ★', 256, 76);
    const plank = new THREE.Mesh(new THREE.PlaneGeometry(GATE.halfWidth * 1.9, GATE.halfWidth * 1.9 * 96 / 512), new THREE.MeshStandardMaterial({ map: sg.tex, emissive: '#ffffff', emissiveMap: sg.tex, emissiveIntensity: 0.55 })); plank.position.set(0, 3.6, 0.25); g.add(plank);
    const mini = new THREE.Mesh(new THREE.OctahedronGeometry(0.28), new THREE.MeshBasicMaterial({ color: GOLD, toneMapped: false })); mini.position.y = 4.35; g.add(mini);
    const gl = makeGlow(new THREE.Color(1.6, 1.0, 0.4), 4, 2.2, 0.5); gl.position.set(0, 3.6, 0.6); g.add(gl);
    updaters.push((time, dt) => { mini.rotation.y += dt * 1.2; });
  }

  /* ---------- Lit firs between the pyramid and the stalls ---------- */
  {
    const fir = std('#17402d', 0.9), cap = std('#eef4ff', 0.9), trunk = std('#3b2a1e', 0.9);
    TREES.forEach(([x, z], ti) => {
      const g = new THREE.Group(); g.position.set(x, 0.1, z); root.add(g);
      const tr = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 0.5, 6), trunk); tr.position.y = 0.25; g.add(tr);
      [[0.95, 1.5, 0.9], [0.72, 1.3, 1.65], [0.48, 1.1, 2.3]].forEach(([r, h, y]) => { const c = new THREE.Mesh(new THREE.ConeGeometry(r, h, 8), fir); c.position.y = y; g.add(c); const s = new THREE.Mesh(new THREE.ConeGeometry(r * 0.62, h * 0.5, 8), cap); s.position.y = y + h * 0.22; g.add(s); });
      const tip = new THREE.Mesh(new THREE.OctahedronGeometry(0.16), new THREE.MeshBasicMaterial({ color: GOLD, toneMapped: false })); tip.position.y = 3.15; g.add(tip);
      const gl = makeGlow(new THREE.Color(1.5, 0.95, 0.4), 3.4, 3.4, 0.35); gl.position.y = 1.7; g.add(gl);
      for (let k = 0; k < 14; k++) { const h = 0.7 + (k / 14) * 2.2, a = k * 2.4 + ti, rad = 0.95 * (1 - (h - 0.7) / 2.6) + 0.06; lights.push(new THREE.Vector3(x + Math.cos(a) * rad, 0.1 + h, z + Math.sin(a) * rad)); }
    });
  }

  /* ---------- Strings of lights ---------- */
  {
    const cornerNear = (b, other, y) => { const pts = [-1, 1].map((sx) => bpt(b, (sx * b.w) / 2, y, b.d / 2)); return pts.sort((p, q) => p.distanceTo(other) - q.distanceTo(other))[0]; };
    const centre = (b) => new THREE.Vector3(b.x, 0, b.z);
    const eave = (b) => (b.id === 'clock' ? b.h + 0.3 : b.h);
    const post = (sx) => new THREE.Vector3(sx * GATE.halfWidth, 3.6, GATE.z);
    const link = (a, b) => [cornerNear(a, centre(b), eave(a)), cornerNear(b, centre(a), eave(b))];
    // the houses in a ring from the north-west round to the north-east; the way in from the gate stays open
    const ring = ['nw', 'bakery', 'west', 'cafe', 'clock', 'inn', 'east', 'toy', 'ne'].map((id) => bmap[id]);
    const pairs = [
      ...ring.slice(1).map((b, i) => link(ring[i], b)),
      [cornerNear(bmap.ne, post(1), bmap.ne.h), post(1)],
      [cornerNear(bmap.nw, post(-1), bmap.nw.h), post(-1)],
      [post(-1), post(1)],
    ];
    for (const [a, b] of pairs) {
      const n = Math.max(8, Math.round(a.distanceTo(b) / 0.55));
      for (let i = 0; i <= n; i++) { const k = i / n, p = a.clone().lerp(b, k); p.y -= 1.1 * 4 * k * (1 - k); lights.push(p); }
    }
    const palette = [new THREE.Color(3, 2.2, 1.0), new THREE.Color(3, 0.5, 0.5), new THREE.Color(0.7, 2.4, 0.9), new THREE.Color(3, 1.7, 0.4), new THREE.Color(0.8, 1.6, 3)];
    const bulbs = bulbSet(lights, (i) => palette[i % palette.length], 0.07, (i) => i * 0.9);
    root.add(bulbs.mesh);
    let f = 0; updaters.push((time) => { if ((f++ % 3) === 0) bulbs.update(time, 1.5, 2.4); });
  }

  /* ---------- People: a stallholder at every stall + 5 villagers strolling round the square ---------- */
  {
    updaters.push((time) => keepers.forEach((k) => { k.g.position.y = 0.1 + Math.max(0, Math.sin(time * 1.6 + k.phase)) * 0.03; }));

    const LIMIT = MARKET.radius - 2.5, MARGIN = 0.9, WALKERS = 5;
    const blocked = (x, z, m) => Math.hypot(x, z) > LIMIT || LOCAL_OBSTACLES.some(([ox, oz, or]) => Math.hypot(x - ox, z - oz) < or + m);
    const pickSpot = () => { for (let i = 0; i < 60; i++) { const a = rnd() * Math.PI * 2, r = 2 + rnd() * (LIMIT - 2), x = Math.cos(a) * r, z = Math.sin(a) * r; if (!blocked(x, z, MARGIN + 0.3)) return [x, z]; } return [0, 5]; };
    const walkers = Array.from({ length: WALKERS }, (_, i) => {
      const p = createPerson({ shirt: SHIRTS[(i * 2 + 4) % SHIRTS.length], hat: HATS[(i * 3 + 1) % HATS.length], name: '', npc: true });
      const [x, z] = pickSpot(), [tx, tz] = pickSpot();
      p.userData.label.visible = false; p.position.set(x, 0.1, z); root.add(p);
      return { g: p, tx, tz, wait: rnd() * 3, speed: 1.0 + rnd() * 0.6, phase: rnd() * 6.28, stuck: 0 };
    });
    updaters.push((time, dt) => {
      dt = Math.min(dt, 0.1);
      for (const w of walkers) {
        const p = w.g.position;
        if (w.wait > 0) { w.wait -= dt; p.y = 0.1 + Math.max(0, Math.sin(time * 1.6 + w.phase)) * 0.03; continue; } // stops to look at the stalls
        const dx = w.tx - p.x, dz = w.tz - p.z, d = Math.hypot(dx, dz);
        if (d < 0.3 || w.stuck > 1.5) { [w.tx, w.tz] = pickSpot(); w.wait = 1.5 + rnd() * 4; w.stuck = 0; continue; }
        const step = w.speed * dt, bx = p.x, bz = p.z;
        p.x += (dx / d) * step; p.z += (dz / d) * step;
        for (const [ox, oz, or] of LOCAL_OBSTACLES) { // slide round the stalls, trees and houses
          const ex = p.x - ox, ez = p.z - oz, ed = Math.hypot(ex, ez), rr = or + 0.5;
          if (ed < rr) { const m = rr / (ed || 1); p.x = ox + ex * m; p.z = oz + ez * m; }
        }
        w.stuck = Math.hypot(p.x - bx, p.z - bz) < step * 0.3 ? w.stuck + dt : 0;
        const want = Math.atan2(dx, dz), diff = Math.atan2(Math.sin(want - w.g.rotation.y), Math.cos(want - w.g.rotation.y));
        w.g.rotation.y += diff * Math.min(1, dt * 8);
        p.y = 0.1 + Math.abs(Math.sin(time * 7 + w.phase)) * 0.05;
      }
    });
  }

  /* ---------- Per-frame ---------- */
  const redrawAll = () => { clockKey = ''; countKey = ''; wishKey = ''; const n = now(); drawClock(n); drawCount(n); drawWish(0); drawBoard(); };
  redrawAll();
  let lastWishSlot = -1;
  updaters.push((time, dt) => {
    const n = now(); drawClock(n); drawCount(n);
    const slot = Math.floor(time / 6);
    if (slot !== lastWishSlot) { lastWishSlot = slot; drawWish(slot); }
    star.rotation.y += dt * 0.6;
  });

  return {
    update(time, dt) { for (const u of updaters) u(time, dt); },
    setWishes(list) { wishes = list.slice(-12); wishKey = ''; drawWish(lastWishSlot < 0 ? 0 : lastWishSlot); },
    setBoard(rows) { boardRows = rows; drawBoard(); },
    redraw: redrawAll,
  };
}
