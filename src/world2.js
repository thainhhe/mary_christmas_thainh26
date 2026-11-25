import * as THREE from 'three';
import { makeGlow, softTex, flakeTex, terrainHeight, mulberry } from './textures.js';
import { bulbSet, cylinderBetween } from './env.js';
import { t } from './i18n.js';

const std = (color, rough = 0.8, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: rough, ...extra });
const gy = terrainHeight;

function canvasTex(w, h) {
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return { canvas, ctx: canvas.getContext('2d'), tex };
}
function wrap(ctx, text, x, y, maxW, lineH, maxLines) {
  const words = text.split(' ');
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

const LYRICS = [
  'Jingle bells, jingle bells,', 'Jingle all the way!', 'Oh what fun it is to ride', 'In a one-horse open sleigh, hey!',
  'Jingle bells, jingle bells,', 'Jingle all the way!', 'Oh what fun it is to ride', 'In a one-horse open sleigh!',
];

export function buildWorld2(scene) {
  const rnd = mulberry(77);
  const updaters = [];

  /* ---- Benches ---- */
  const wood = std('#6b4426', 0.8), iron = std('#1a1d26', 0.5, { metalness: 0.6 }), snowM = std('#f2f7ff', 0.9);
  function bench(x, z) {
    const g = new THREE.Group();
    const seat = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.07, 0.5), wood); seat.position.y = 0.5;
    const back = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.5, 0.06), wood); back.position.set(0, 0.82, -0.25); back.rotation.x = 0.15;
    const sn = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.05, 0.44), snowM); sn.position.y = 0.56;
    const sb = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.04, 0.07), snowM); sb.position.set(0, 1.08, -0.28);
    g.add(seat, back, sn, sb);
    for (const lx of [-0.75, 0.75]) { const l = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.5, 0.5), iron); l.position.set(lx, 0.25, -0.05); g.add(l); }
    g.position.set(x, 0, z); g.rotation.y = Math.atan2(-x, -z);
    scene.add(g);
  }
  [0.55, 1.2, 2.3, 3.75, 4.1, 5.3].forEach((a) => bench(Math.cos(a) * 12.6, Math.sin(a) * 12.6));

  /* ---- Mini lit trees ---- */
  const miniPts = [];
  [[-12, 9], [-5, 15], [7.5, 14.5], [-3, -14.5], [8, -13.5], [-14, -11]].forEach(([x, z]) => {
    const g = new THREE.Group();
    [[1.1, 1.8, 0.6], [0.85, 1.5, 1.5], [0.6, 1.2, 2.3]].forEach(([r, h, y]) => {
      const c = new THREE.Mesh(new THREE.ConeGeometry(r, h, 10), std('#12603a', 0.85, { emissive: '#05281a' }));
      c.position.y = y + h / 2; g.add(c);
    });
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.14, 0.6, 6), std('#4a2f1d')); trunk.position.y = 0.3; g.add(trunk);
    g.position.set(x, 0, z); g.scale.setScalar(1.25);
    scene.add(g);
    for (let k = 0; k < 26; k++) {
      const tier = (rnd() * 3) | 0, [r, h, y] = [[1.1, 1.8, 0.6], [0.85, 1.5, 1.5], [0.6, 1.2, 2.3]][tier];
      const f = rnd() * 0.9, a = rnd() * 6.28, rr = r * (1 - f) + 0.04;
      miniPts.push(new THREE.Vector3(x + Math.cos(a) * rr * 1.25, (y + f * h) * 1.25, z + Math.sin(a) * rr * 1.25));
    }
    const star = makeGlow(new THREE.Color(2, 1.5, 0.6), 0.9, 0.9, 0.9); star.position.set(x, 3.7 * 1.25 - 0.5, z); scene.add(star);
  });
  const pal = ['#ffe3a3', '#ff8fa3', '#8fd3ff', '#b8ffb0', '#ffd166'].map((h) => new THREE.Color(h));
  const mini = bulbSet(miniPts, (i) => pal[i % 5], 0.05);
  scene.add(mini.mesh);
  updaters.push((time) => mini.update(time, 1.5, 2.6));

  /* ---- Campfire + teepee + leaderboard sign ---- */
  const camp = new THREE.Group();
  camp.position.set(-9.4, 0, -2.2);
  scene.add(camp);
  const tipi = new THREE.Mesh(new THREE.ConeGeometry(1.5, 3.2, 8, 1, true), std('#8a5a34', 0.9, { side: THREE.DoubleSide }));
  tipi.position.set(-2.8, 1.6, -1.8); tipi.rotation.y = 0.4;
  camp.add(tipi);
  for (const [rx, rz] of [[0.25, 0.1], [-0.2, 0.2]]) { const s = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.2, 5), wood); s.position.set(-2.8 + rx, 3.5, -1.8 + rz); s.rotation.z = rx * 2; camp.add(s); }
  const door = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 1.5), new THREE.MeshBasicMaterial({ color: new THREE.Color(1.6, 0.8, 0.3), toneMapped: false }));
  door.position.set(-2.8 + Math.sin(0.4 + 0.2) * 1.0, 0.8, -1.8 + Math.cos(0.4 + 0.2) * 1.0); door.rotation.y = 0.6; camp.add(door);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * 6.28, log = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.09, 0.9, 6), std('#4a2f1d'));
    log.position.set(Math.cos(a) * 0.35, 0.2, Math.sin(a) * 0.35); log.rotation.set(Math.sin(a) * 1.1, 0, -Math.cos(a) * 1.1);
    camp.add(log);
  }
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * 6.28, st = new THREE.Mesh(new THREE.DodecahedronGeometry(0.2, 0), std('#7a8294', 0.9));
    st.position.set(Math.cos(a) * 0.85, 0.1, Math.sin(a) * 0.85); camp.add(st);
  }
  const flameA = new THREE.Mesh(new THREE.ConeGeometry(0.3, 1.0, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 1.5, 0.4), toneMapped: false }));
  const flameB = new THREE.Mesh(new THREE.ConeGeometry(0.45, 0.75, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(2.2, 0.6, 0.12), toneMapped: false, transparent: true, opacity: 0.8 }));
  flameA.position.y = 0.7; flameB.position.y = 0.55;
  const fireGlow = makeGlow(new THREE.Color(1.8, 0.8, 0.3), 5.5, 5, 0.8); fireGlow.position.y = 1.0;
  const fireLight = new THREE.PointLight('#ff8a3d', 14, 14, 2); fireLight.position.y = 1.2;
  camp.add(flameA, flameB, fireGlow, fireLight);
  const embN = 40, embPos = new Float32Array(embN * 3), embSeed = Array.from({ length: embN }, () => rnd());
  const embGeo = new THREE.BufferGeometry(); embGeo.setAttribute('position', new THREE.BufferAttribute(embPos, 3));
  const embers = new THREE.Points(embGeo, new THREE.PointsMaterial({ color: new THREE.Color(3, 1.4, 0.4), size: 0.07, map: flakeTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
  embers.frustumCulled = false; camp.add(embers);
  updaters.push((time) => {
    const f = 1 + 0.2 * Math.sin(time * 13) + 0.12 * Math.sin(time * 23.7);
    flameA.scale.set(1, f, 1); flameB.scale.set(1 + 0.1 * Math.sin(time * 9), 1 + 0.15 * Math.sin(time * 17), 1);
    fireLight.intensity = 13 + 3 * Math.sin(time * 11) + 2 * Math.sin(time * 27); fireGlow.material.opacity = 0.7 + 0.15 * Math.sin(time * 15);
    for (let i = 0; i < embN; i++) {
      const k = (time * 0.4 + embSeed[i]) % 1;
      embPos.set([Math.sin(embSeed[i] * 40 + time) * 0.4 * k, 0.8 + k * 2.6, Math.cos(embSeed[i] * 30 + time) * 0.4 * k], i * 3);
    }
    embGeo.attributes.position.needsUpdate = true;
  });

  // Leaderboard sign (drawn from server data)
  const sign = new THREE.Group();
  sign.position.set(-7.2, 0, -7.4); sign.rotation.y = Math.atan2(7.2, 7.4);
  const board = canvasTex(512, 340);
  for (const x of [-1.4, 1.4]) { const p = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 2.4, 6), wood); p.position.set(x, 1.2, 0); sign.add(p); }
  const panel = new THREE.Mesh(new THREE.BoxGeometry(3.2, 2.0, 0.1), std('#2a1b10'));
  panel.position.y = 2.0;
  const face = new THREE.Mesh(new THREE.PlaneGeometry(3.0, 1.82), new THREE.MeshBasicMaterial({ map: board.tex, toneMapped: false, color: new THREE.Color(0.95, 0.95, 0.95) }));
  face.position.set(0, 2.0, 0.06);
  const roof = new THREE.Mesh(new THREE.BoxGeometry(3.5, 0.12, 0.5), snowM); roof.position.set(0, 3.08, 0);
  sign.add(panel, face, roof);
  // Invisible, generous tap target (bigger than the sign so a finger can hit it); main.js opens the leaderboard when it is tapped.
  const boardHit = new THREE.Mesh(new THREE.BoxGeometry(4.2, 3.2, 1.2), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }));
  boardHit.position.set(0, 1.9, 0.3);
  sign.add(boardHit);
  scene.add(sign);
  let boardRows = [];
  function drawBoard() {
    const { ctx } = board;
    const g = ctx.createLinearGradient(0, 0, 0, 340); g.addColorStop(0, '#1d2a52'); g.addColorStop(1, '#0d1530');
    ctx.fillStyle = g; ctx.fillRect(0, 0, 512, 340);
    ctx.strokeStyle = '#f7b955'; ctx.lineWidth = 6; ctx.strokeRect(8, 8, 496, 324);
    ctx.fillStyle = '#f7b955'; ctx.font = '800 44px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.fillText(`🏆 ${t('sb.title')}`, 256, 66);
    ctx.textAlign = 'left'; ctx.font = '600 34px system-ui, sans-serif';
    if (!boardRows.length) { ctx.fillStyle = '#9bb0d8'; ctx.textAlign = 'center'; ctx.fillText(t('sb.empty'), 256, 190); }
    boardRows.slice(0, 5).forEach((r, i) => {
      ctx.fillStyle = ['#ffd166', '#dfe6f2', '#e0a070', '#eef4ff', '#eef4ff'][i];
      ctx.textAlign = 'left'; ctx.fillText(`${i + 1}. ${String(r.name).slice(0, 14)}`, 36, 126 + i * 46);
      ctx.textAlign = 'right'; ctx.fillText(String(r.points), 478, 126 + i * 46);
    });
    board.tex.needsUpdate = true;
  }
  drawBoard();

  /* ---- Market cart + mailbox ---- */
  {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.9, 1.3), std('#b3202a', 0.6)); body.position.y = 0.85;
    const trim = new THREE.Mesh(new THREE.BoxGeometry(2.5, 0.1, 1.4), std('#f1d9a0')); trim.position.y = 1.32;
    g.add(body, trim);
    for (const [wx, wz] of [[-0.9, 0.75], [0.9, 0.75], [-0.9, -0.75], [0.9, -0.75]]) {
      const w = new THREE.Mesh(new THREE.TorusGeometry(0.38, 0.06, 6, 14), wood); w.position.set(wx, 0.4, wz); g.add(w);
    }
    for (let i = 0; i < 4; i++) {
      const b = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.4, 0.5), std(['#2a9d8f', '#f4a261', '#4361ee', '#e5e5e5'][i], 0.5)); b.position.set(-0.7 + i * 0.5, 1.55, (i % 2) * 0.2 - 0.1); g.add(b);
    }
    g.add(cylinderBetween(new THREE.Vector3(1.2, 0.9, 0.3), new THREE.Vector3(2.6, 0.5, 0.3), 0.05, wood), cylinderBetween(new THREE.Vector3(1.2, 0.9, -0.3), new THREE.Vector3(2.6, 0.5, -0.3), 0.05, wood));
    const lan = makeGlow(new THREE.Color(1.5, 0.9, 0.35), 2.4, 2.4, 0.7); lan.position.set(-1.3, 1.9, 0); g.add(lan);
    g.position.set(13.5, 0, 6.5); g.rotation.y = Math.atan2(-13.5, -6.5) + 0.3;
    scene.add(g);

    const mb = new THREE.Group();
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.45, 1.6, 12), std('#17663a', 0.6)); post.position.y = 0.8;
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.42, 12, 8, 0, 6.28, 0, 1.57), snowM); cap.position.y = 1.6;
    const slot = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.08, 0.1), std('#111')); slot.position.set(0, 1.25, 0.42);
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.13, 8, 6), new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 2, 1), toneMapped: false })); lamp.position.y = 1.95;
    const lg = makeGlow(new THREE.Color(1.2, 0.8, 0.35), 2.4, 2.4, 0.6); lg.position.y = 1.95;
    mb.add(post, cap, slot, lamp, lg); mb.position.set(9, 0, 9.5); mb.rotation.y = Math.atan2(-9, -9.5);
    scene.add(mb);
  }

  /* ---- Ski finish gate, hut, chairlift ---- */
  const GX = [-1, 13];
  {
    const gate = new THREE.Group();
    const redM = std('#c0392b', 0.5), whiteM = std('#f4f7ff', 0.5);
    const gz = -34;
    for (const x of GX) { const p = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 4.2, 8), redM); p.position.set(x, gy(x, gz) + 2.1, gz); gate.add(p); }
    const yAvg = (gy(GX[0], gz) + gy(GX[1], gz)) / 2;
    const ban = canvasTex(1024, 160);
    ban.ctx.fillStyle = '#1a1d2e'; ban.ctx.fillRect(0, 0, 1024, 160);
    ban.ctx.strokeStyle = '#f7b955'; ban.ctx.lineWidth = 10; ban.ctx.strokeRect(5, 5, 1014, 150);
    ban.ctx.fillStyle = '#f7d77a'; ban.ctx.font = '900 112px Georgia, serif'; ban.ctx.textAlign = 'center'; ban.ctx.textBaseline = 'middle';
    ban.ctx.fillText(t('fin.title'), 512, 88); ban.tex.needsUpdate = true;
    const banner = new THREE.Mesh(new THREE.PlaneGeometry(6, 0.95), new THREE.MeshBasicMaterial({ map: ban.tex, side: THREE.DoubleSide, toneMapped: false, color: new THREE.Color(0.9, 0.9, 0.9) }));
    banner.position.set((GX[0] + GX[1]) / 2, yAvg + 3.8, gz); gate.add(banner);
    const str = canvasTex(256, 16); for (let i = 0; i < 16; i++) { str.ctx.fillStyle = i % 2 ? '#fff' : '#c0392b'; str.ctx.fillRect(i * 16, 0, 16, 16); } str.tex.needsUpdate = true;
    const bar = new THREE.Mesh(new THREE.BoxGeometry(GX[1] - GX[0], 0.16, 0.16), new THREE.MeshStandardMaterial({ map: str.tex, roughness: 0.6 }));
    bar.position.set((GX[0] + GX[1]) / 2, yAvg + 1.1, gz); gate.add(bar);
    scene.add(gate);

    // Small lit hut at the lift's bottom station
    const hut = new THREE.Group();
    const hb = new THREE.Mesh(new THREE.BoxGeometry(2.4, 1.6, 2), std('#5b3328', 0.9)); hb.position.y = 0.8;
    const hr = new THREE.Mesh(new THREE.ConeGeometry(2.0, 1.1, 4), snowM); hr.rotation.y = Math.PI / 4; hr.position.y = 2.1; hr.scale.set(1.05, 1, 0.9);
    const hw = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.6), new THREE.MeshBasicMaterial({ color: new THREE.Color(2.6, 1.7, 0.7), toneMapped: false })); hw.position.set(0, 1.0, 1.01);
    const hg = makeGlow(new THREE.Color(1.2, 0.7, 0.25), 2.4, 2.4, 0.6); hg.position.set(0, 1.0, 1.5);
    hut.add(hb, hr, hw, hg); hut.position.set(22, gy(22, -38), -38); hut.rotation.y = -0.9;
    scene.add(hut);

    // Chairlift
    const B = new THREE.Vector2(16, -42), T = new THREE.Vector2(11, -66), N = 6;
    const tops = [];
    const red = std('#c0392b', 0.5, { metalness: 0.3 });
    for (let i = 0; i < N; i++) {
      const u = i / (N - 1), x = B.x + (T.x - B.x) * u, z = B.y + (T.y - B.y) * u, y = gy(x, z);
      const p = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.16, 7, 8), red); p.position.set(x, y + 3.5, z); scene.add(p);
      const arm = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.14, 0.14), red); arm.position.set(x, y + 7, z); scene.add(arm);
      tops.push(new THREE.Vector3(x, y + 7, z));
    }
    const cableMat = std('#1b1b22', 0.5);
    for (const off of [-1.0, 1.0]) for (let i = 0; i < N - 1; i++) scene.add(cylinderBetween(tops[i].clone().add(new THREE.Vector3(off, 0, 0)), tops[i + 1].clone().add(new THREE.Vector3(off, 0, 0)), 0.03, cableMat));
    const CH = 9;
    const chairs = new THREE.InstancedMesh(new THREE.BoxGeometry(0.6, 0.35, 0.45), std('#d8a21a', 0.5), CH * 2);
    scene.add(chairs);
    const along = (u) => {
      const f = Math.min(Math.max(u, 0), 0.9999) * (N - 1), i = Math.floor(f);
      return new THREE.Vector3().lerpVectors(tops[i], tops[i + 1], f - i);
    };
    const dummy = new THREE.Object3D();
    updaters.push((time) => {
      for (let i = 0; i < CH; i++) {
        const u = ((time * 0.022 + i / CH) % 1);
        for (const [side, k] of [[-1, u], [1, 1 - u]]) {
          const p = along(k);
          dummy.position.set(p.x + side, p.y - 1.1, p.z); dummy.rotation.set(0, 0, Math.sin(time * 1.3 + i) * 0.04); dummy.updateMatrix();
          chairs.setMatrixAt(i * 2 + (side > 0 ? 1 : 0), dummy.matrix);
        }
      }
      chairs.instanceMatrix.needsUpdate = true;
    });
  }

  /* ---- Open-air cinema ---- */
  const cin = new THREE.Group();
  const CX = 44, CZ = 3;
  cin.position.set(CX, gy(CX, CZ), CZ);
  cin.rotation.y = -Math.PI / 2;
  scene.add(cin);
  const scr = canvasTex(1024, 576);
  const frame = new THREE.Mesh(new THREE.BoxGeometry(12.8, 7.4, 0.3), std('#0f1220', 0.6)); frame.position.set(0, 7.5, -0.2);
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(12, 6.75), new THREE.MeshBasicMaterial({ map: scr.tex, toneMapped: false, color: new THREE.Color(1.15, 1.15, 1.15) }));
  screen.position.set(0, 7.5, 0);
  for (const x of [-6.8, 6.8]) { const p = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.2, 11.2, 8), std('#15182a', 0.5)); p.position.set(x, 5.6, -0.3); cin.add(p); }
  const lt = canvasTex(1024, 220);
  lt.ctx.textAlign = 'center'; lt.ctx.textBaseline = 'middle'; lt.ctx.font = '900 170px Impact, "Arial Black", system-ui, sans-serif';
  lt.ctx.shadowColor = 'rgba(160,190,255,.9)'; lt.ctx.shadowBlur = 24; lt.ctx.fillStyle = '#eef3ff';
  lt.ctx.fillText('NOEL CINEMA', 512, 112); lt.tex.needsUpdate = true;
  const letters = new THREE.Mesh(new THREE.PlaneGeometry(14, 3), new THREE.MeshBasicMaterial({ map: lt.tex, transparent: true, toneMapped: false, depthWrite: false, color: new THREE.Color(1.1, 1.1, 1.2) }));
  letters.position.set(0, 13.4, 0);
  // a flat plane parallel to the screen (a camera-facing sprite would be sliced by the screen when seen at an angle)
  const sGlow = new THREE.Mesh(new THREE.PlaneGeometry(22, 13), new THREE.MeshBasicMaterial({ map: softTex, color: new THREE.Color(0.25, 0.4, 0.8), transparent: true, opacity: 0.5, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
  sGlow.position.set(0, 7.5, 0.25);
  const sLight = new THREE.PointLight('#8ab4ff', 22, 24, 2); sLight.position.set(0, 6, 6);
  cin.add(frame, screen, letters, sGlow, sLight);

  const ROWS = 6, COLS = 9;
  const seatG = new THREE.BoxGeometry(0.8, 0.14, 0.7), backG = new THREE.BoxGeometry(0.8, 0.7, 0.12);
  const seats = new THREE.InstancedMesh(seatG, std('#ffffff', 0.7, { emissive: '#1c1c26' }), ROWS * COLS);
  const backs = new THREE.InstancedMesh(backG, std('#ffffff', 0.7, { emissive: '#1c1c26' }), ROWS * COLS);
  const dm = new THREE.Object3D(), cc = new THREE.Color();
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
    const lx = (c - (COLS - 1) / 2) * 1.35, lz = 5 + r * 1.9;
    const wx = CX - lz, wz = CZ + lx, ly = gy(wx, wz) - cin.position.y;
    const col = r % 2 ? '#2ea36d' : '#d9404c', i = r * COLS + c;
    dm.rotation.set(0, Math.PI, 0);
    dm.position.set(lx, ly + 0.45, lz); dm.updateMatrix(); seats.setMatrixAt(i, dm.matrix); seats.setColorAt(i, cc.set(col));
    dm.position.set(lx, ly + 0.85, lz + 0.3); dm.updateMatrix(); backs.setMatrixAt(i, dm.matrix); backs.setColorAt(i, cc.set(col));
  }
  cin.add(seats, backs);

  // Screen content: recent wishes, or sing-along lyrics during carol hour
  let wishes = [], mode = null, lastScreen = -1;
  const stars = Array.from({ length: 60 }, () => ({ x: rnd() * 1024, y: rnd() * 576, p: rnd() * 6 }));
  const flakes = Array.from({ length: 70 }, () => ({ x: rnd() * 1024, y: rnd() * 576, s: 20 + rnd() * 40, r: 1 + rnd() * 2.5 }));
  function drawScreen(time) {
    const { ctx } = scr;
    const g = ctx.createLinearGradient(0, 0, 0, 576); g.addColorStop(0, '#0a1230'); g.addColorStop(1, '#1b2a5a');
    ctx.fillStyle = g; ctx.fillRect(0, 0, 1024, 576);
    stars.forEach((s) => { ctx.fillStyle = `rgba(255,255,255,${0.3 + 0.5 * Math.abs(Math.sin(time + s.p))})`; ctx.fillRect(s.x, s.y, 2, 2); });
    // little tree
    const tx = 250, ty = 470;
    ctx.fillStyle = '#3b2a1e'; ctx.fillRect(tx - 14, ty, 28, 36);
    [[150, 160, 0], [118, 130, 70], [86, 110, 130]].forEach(([w, h, up], i) => { ctx.fillStyle = ['#1a7a46', '#1f8b50', '#27a05c'][i]; ctx.beginPath(); ctx.moveTo(tx - w, ty - up); ctx.lineTo(tx + w, ty - up); ctx.lineTo(tx, ty - up - h); ctx.closePath(); ctx.fill(); });
    ctx.fillStyle = '#ffd166'; ctx.beginPath(); ctx.arc(tx, ty - 290, 14 + 3 * Math.sin(time * 3), 0, 6.28); ctx.fill();
    for (let i = 0; i < 18; i++) { ctx.fillStyle = ['#ff4d6d', '#ffd166', '#4cc9f0', '#80ed99'][i % 4]; ctx.globalAlpha = 0.6 + 0.4 * Math.sin(time * 3 + i); ctx.beginPath(); ctx.arc(tx + Math.sin(i * 2.3) * (30 + (i % 6) * 18), ty - 20 - i * 14, 5, 0, 6.28); ctx.fill(); }
    ctx.globalAlpha = 1;
    // text
    ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'left';
    if (mode === 'carol') {
      const i = Math.floor(time / 3.2) % LYRICS.length;
      ctx.font = '700 26px system-ui, sans-serif'; ctx.fillStyle = '#f7b955'; ctx.fillText(`🎶 ${t('cin.carol')}`, 500, 120);
      [[-1, 'rgba(255,255,255,.35)', 30], [0, '#ffffff', 44], [1, 'rgba(255,255,255,.35)', 30]].forEach(([d, col, size], k) => {
        ctx.font = `700 ${size}px system-ui, sans-serif`; ctx.fillStyle = col;
        ctx.fillText(LYRICS[(i + d + LYRICS.length) % LYRICS.length], 500, 250 + k * 80);
      });
    } else if (wishes.length) {
      const w = wishes[Math.floor(time / 6) % wishes.length];
      ctx.font = '700 24px system-ui, sans-serif'; ctx.fillStyle = '#f7b955'; ctx.fillText(`✦ ${t('cin.title')}`, 500, 110);
      ctx.font = '600 38px system-ui, sans-serif'; ctx.fillStyle = '#ffffff';
      const n = wrap(ctx, w.wish, 500, 200, 480, 52, 5);
      ctx.font = '500 28px system-ui, sans-serif'; ctx.fillStyle = '#a9bfe0';
      ctx.fillText(`— ${t('cin.from', { name: w.name || t('w.anon') })}`, 500, 200 + n * 52 + 30);
    } else {
      ctx.font = '800 54px system-ui, sans-serif'; ctx.fillStyle = '#ffffff'; ctx.fillText(t('cin.title'), 500, 260);
      ctx.font = '500 30px system-ui, sans-serif'; ctx.fillStyle = '#a9bfe0'; ctx.fillText(t('cin.soon'), 500, 320);
    }
    ctx.fillStyle = 'rgba(255,255,255,.85)';
    flakes.forEach((f) => { f.y = (f.y + f.s * 0.25) % 576; ctx.beginPath(); ctx.arc(f.x + Math.sin(time + f.s) * 6, f.y, f.r, 0, 6.28); ctx.fill(); });
    scr.tex.needsUpdate = true;
  }
  updaters.push((time) => { if (time - lastScreen > 0.25) { lastScreen = time; drawScreen(time); } });

  return {
    update(time, dt) { for (const u of updaters) u(time, dt); },
    boardHit,
    setBoard(rows) { boardRows = rows; drawBoard(); },
    setWishes(list) { wishes = list.slice(-12); },
    setMode(m) { mode = m; },
    redraw() { drawBoard(); },
  };
}
