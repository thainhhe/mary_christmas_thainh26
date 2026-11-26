import * as THREE from 'three';
import { $ } from './state.js';
import { t, onLang } from './i18n.js';
import { makeGlow, terrainHeight } from './textures.js';
import { bulbSet } from './env.js';
import { createPerson } from './avatars.js';
import { TAROT, TAROT_SPOT, tarotWorld } from './tarotlayout.js';
import { DECK, cardName, cardMeaning } from './tarotdata.js';
import { track } from './analytics.js';

/**
 * A little tarot caravan (mobile home) next to the snowman: purple body with gold trim, a serving hatch with a striped awning,
 * a crystal ball and candles on the counter, and Madame Stella inside. Stand in front of the hatch and a button opens a
 * three-card reading (past / present / future). Just for fun: nothing is stored or sent anywhere.
 */
const std = (color, rough = 0.8, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: rough, ...extra });

function canvasTex(w, h) {
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return { canvas, ctx: canvas.getContext('2d'), tex };
}

/* ============================================================ Scenery ============================================================ */
export function buildTarot(scene) {
  const updaters = [];
  const root = new THREE.Group();
  root.position.set(TAROT.x, terrainHeight(TAROT.x, TAROT.z), TAROT.z);
  root.rotation.y = TAROT.ry;
  scene.add(root);

  const body = std('#4b3a86', 0.75), trim = std('#d9a640', 0.35, { metalness: 0.6 }), cream = std('#efe3c8', 0.8), dark = std('#1c1830', 0.7), snow = std('#eef4ff', 0.9), wood = std('#6a4425', 0.85);
  const box = (w, h, d, mat, x, y, z) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(x, y, z); root.add(m); return m; };
  const L = 4.6, D = 2.2, Y0 = 0.55, Y1 = 2.65, T = 0.1, MID = (Y0 + Y1) / 2;
  const HX0 = -0.45, HX1 = 1.35, HY0 = 1.3, HY1 = 2.25; // the serving hatch
  const ZF = D / 2 - T / 2;

  /* ---------- Walls: hollow, so Madame Stella can be seen through the hatch ---------- */
  box(L, T, D, wood, 0, Y0, 0);                                                    // floor
  box(L, Y1 - Y0, T, body, 0, MID, -D / 2 + T / 2);                                // back wall
  for (const sx of [-1, 1]) box(T, Y1 - Y0, D, body, sx * (L / 2 - T / 2), MID, 0); // ends
  box(L, T, D, dark, 0, Y1, 0);                                                    // ceiling
  box(HX0 + L / 2, Y1 - Y0, T, body, (-L / 2 + HX0) / 2, MID, ZF);                 // front: left of the hatch
  box(L / 2 - HX1, Y1 - Y0, T, body, (HX1 + L / 2) / 2, MID, ZF);                  // right of the hatch
  box(HX1 - HX0, HY0 - Y0, T, body, (HX0 + HX1) / 2, (Y0 + HY0) / 2, ZF);          // below
  box(HX1 - HX0, Y1 - HY1, T, body, (HX0 + HX1) / 2, (HY1 + Y1) / 2, ZF);          // above
  box(L + 0.04, 0.16, D + 0.04, cream, 0, 1.0, 0);                                  // painted stripe round the body
  box(L + 0.04, 0.06, D + 0.04, trim, 0, 0.88, 0);
  // gold frame round the hatch
  const fz = D / 2 + 0.02;
  box(HX1 - HX0 + 0.2, 0.09, 0.08, trim, (HX0 + HX1) / 2, HY1 + 0.04, fz);
  box(HX1 - HX0 + 0.2, 0.09, 0.08, trim, (HX0 + HX1) / 2, HY0 - 0.04, fz);
  for (const x of [HX0 - 0.05, HX1 + 0.05]) box(0.09, HY1 - HY0 + 0.18, 0.08, trim, x, (HY0 + HY1) / 2, fz);

  /* ---------- Inside: warm violet glow, curtains, a little table ---------- */
  const glowBack = new THREE.Mesh(new THREE.PlaneGeometry(L - 0.4, Y1 - Y0 - 0.2), new THREE.MeshBasicMaterial({ color: new THREE.Color(1.3, 0.8, 1.9), toneMapped: false }));
  glowBack.position.set(0, MID, -D / 2 + T + 0.01); root.add(glowBack);
  const curtain = std('#7a2f5a', 0.9);
  for (const x of [HX0 + 0.1, HX1 - 0.1]) box(0.2, HY1 - Y0 - 0.1, 0.06, curtain, x, (HY1 + Y0) / 2, D / 2 - 0.12);
  const ig = makeGlow(new THREE.Color(1.6, 1.0, 2.0), 3.2, 3.2, 0.5); ig.position.set((HX0 + HX1) / 2, 1.9, 0.2); root.add(ig);
  updaters.push((time) => { ig.material.opacity = 0.42 + 0.1 * Math.sin(time * 2.1); });

  const seer = createPerson({ shirt: '#5b2a8a', hat: '#7a2f9a', name: '', npc: true });
  seer.userData.label.visible = false; seer.scale.setScalar(1.05); seer.position.set((HX0 + HX1) / 2, Y0 + 0.05, 0.1); root.add(seer);
  updaters.push((time) => { seer.position.y = Y0 + 0.05 + Math.max(0, Math.sin(time * 1.4)) * 0.03; });

  /* ---------- Door, steps, wheels, hitch ---------- */
  const door = box(0.92, 1.7, 0.06, wood, -1.45, Y0 + 0.93, D / 2 + 0.03);
  const doorWin = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 0.4), new THREE.MeshBasicMaterial({ color: new THREE.Color(2.2, 1.5, 0.8), toneMapped: false })); doorWin.position.set(0, 0.45, 0.035); door.add(doorWin);
  box(0.06, 0.1, 0.1, trim, -1.12, Y0 + 0.9, D / 2 + 0.09);
  box(1.0, 0.26, 0.5, wood, -1.45, 0.13, D / 2 + 0.36); box(1.0, 0.04, 0.5, snow, -1.45, 0.28, D / 2 + 0.36);
  for (const sz of [-1, 1]) {
    const wg = new THREE.CylinderGeometry(0.46, 0.46, 0.22, 20); wg.rotateX(Math.PI / 2);
    const wheel = new THREE.Mesh(wg, dark); wheel.position.set(0.3, 0.46, sz * (D / 2 + 0.06)); root.add(wheel);
    const hg = new THREE.CylinderGeometry(0.2, 0.2, 0.26, 12); hg.rotateX(Math.PI / 2);
    const hub = new THREE.Mesh(hg, trim); hub.position.copy(wheel.position); root.add(hub);
    box(1.15, 0.1, 0.3, dark, 0.3, 0.98, sz * (D / 2 + 0.06)); // wheel arch
  }
  box(1.2, 0.09, 0.09, dark, -L / 2 - 0.6, 0.7, 0);           // tow bar
  box(0.09, 0.09, 0.8, dark, -L / 2 - 1.15, 0.7, 0);
  const jg = new THREE.CylinderGeometry(0.1, 0.1, 0.5, 8); const jw = new THREE.Mesh(jg, dark); jw.position.set(-L / 2 - 1.15, 0.35, 0); root.add(jw);

  /* ---------- Rounded roof with snow + lights ---------- */
  const rg = new THREE.CylinderGeometry(1.15, 1.15, L + 0.2, 20); rg.rotateZ(Math.PI / 2); rg.scale(1, 0.3, 1);
  const roof = new THREE.Mesh(rg, std('#3a2c6e', 0.7)); roof.position.y = Y1; root.add(roof);
  const sg = new THREE.CylinderGeometry(1.12, 1.12, L - 0.3, 20); sg.rotateZ(Math.PI / 2); sg.scale(1, 0.3, 1);
  const roofSnow = new THREE.Mesh(sg, snow); roofSnow.position.y = Y1 + 0.09; root.add(roofSnow);

  /* ---------- Awning over the hatch ---------- */
  const st = canvasTex(128, 32);
  for (let i = 0; i < 8; i++) { st.ctx.fillStyle = i % 2 ? '#e9c46a' : '#6a3fa8'; st.ctx.fillRect(i * 16, 0, 16, 32); }
  st.tex.wrapS = THREE.RepeatWrapping;
  const awn = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.06, 0.95), std('#ffffff', 0.8, { map: st.tex }));
  awn.position.set((HX0 + HX1) / 2, 2.48, D / 2 + 0.42); awn.rotation.x = 0.36; root.add(awn);
  const awnSnow = new THREE.Mesh(new THREE.BoxGeometry(2.3, 0.08, 0.85), snow); awnSnow.position.set((HX0 + HX1) / 2, 2.54, D / 2 + 0.42); awnSnow.rotation.x = 0.36; root.add(awnSnow);

  /* ---------- Counter: crystal ball, candles, a fan of cards ---------- */
  box(2.0, 0.08, 0.6, wood, (HX0 + HX1) / 2, HY0, D / 2 + 0.26);
  const ballX = 0.15, ballZ = D / 2 + 0.3;
  const ballBase = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.17, 0.07, 14), trim); ballBase.position.set(ballX, HY0 + 0.07, ballZ); root.add(ballBase);
  const ball = new THREE.Mesh(new THREE.SphereGeometry(0.2, 18, 14), new THREE.MeshStandardMaterial({ color: '#b9a4ff', emissive: new THREE.Color(0.7, 0.4, 1.4), emissiveIntensity: 1, roughness: 0.15, transparent: true, opacity: 0.88 }));
  ball.position.set(ballX, HY0 + 0.29, ballZ); root.add(ball);
  const bg = makeGlow(new THREE.Color(1.2, 0.7, 2.2), 1.6, 1.6, 0.6); bg.position.copy(ball.position); root.add(bg);
  updaters.push((time) => { bg.material.opacity = 0.5 + 0.2 * Math.sin(time * 2.6); });
  const flameMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 2, 0.8), toneMapped: false });
  for (const cx of [-0.3, 0.95]) {
    const can = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.05, 0.22, 8), cream); can.position.set(cx, HY0 + 0.15, ballZ); root.add(can);
    const fl = new THREE.Mesh(new THREE.SphereGeometry(0.04, 6, 5), flameMat); fl.position.set(cx, HY0 + 0.3, ballZ); root.add(fl);
    const fg = makeGlow(new THREE.Color(1.6, 0.9, 0.35), 0.9, 0.9, 0.5); fg.position.copy(fl.position); root.add(fg);
  }
  for (let i = 0; i < 3; i++) { // tarot cards fanned on the counter
    const card = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.01, 0.32), std(i === 1 ? '#f4e6c0' : '#2a1c5a', 0.6, { emissive: i === 1 ? '#000000' : '#d9a640', emissiveIntensity: i === 1 ? 0 : 0.15 }));
    card.position.set(0.62 + i * 0.17, HY0 + 0.05, ballZ + 0.02); card.rotation.y = (i - 1) * 0.35; root.add(card);
  }

  /* ---------- Painted stars + moon on the body ---------- */
  const deco = canvasTex(128, 256), dc = deco.ctx;
  dc.fillStyle = '#ffd98a'; dc.strokeStyle = '#ffd98a';
  const star4 = (x, y, r) => { dc.beginPath(); for (let i = 0; i < 8; i++) { const a = (i * Math.PI) / 4, rr = i % 2 ? r * 0.38 : r; dc.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); } dc.closePath(); dc.fill(); };
  dc.beginPath(); dc.arc(64, 80, 40, 0, Math.PI * 2); dc.fill(); dc.globalCompositeOperation = 'destination-out'; dc.beginPath(); dc.arc(82, 70, 36, 0, Math.PI * 2); dc.fill(); dc.globalCompositeOperation = 'source-over'; // crescent
  star4(34, 180, 16); star4(90, 150, 10); star4(70, 215, 12); star4(24, 120, 8);
  deco.tex.needsUpdate = true;
  const decoMat = new THREE.MeshBasicMaterial({ map: deco.tex, transparent: true, toneMapped: false, color: new THREE.Color(1.15, 1.05, 0.85) });
  const dcl = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 1.2), decoMat); dcl.position.set(1.95, 1.75, D / 2 + 0.01); root.add(dcl);
  for (const sx of [-1, 1]) { const m = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 1.4), decoMat); m.position.set(sx * (L / 2 + 0.01), 1.75, 0); m.rotation.y = sx * Math.PI / 2; root.add(m); }

  /* ---------- Sign on the roof ---------- */
  {
    const sg2 = canvasTex(360, 120), c = sg2.ctx;
    c.fillStyle = '#2a1a5a'; c.fillRect(0, 0, 360, 120); c.strokeStyle = '#ffd98a'; c.lineWidth = 6; c.strokeRect(8, 8, 344, 104);
    c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillStyle = '#ffe9b8'; c.font = '800 54px "Times New Roman", Times, serif'; c.fillText('✦ TAROT ✦', 180, 50);
    c.fillStyle = '#d9c4ff'; c.font = '600 20px "Times New Roman", Times, serif'; c.fillText('Madame Stella · bói bài', 180, 94);
    const plank = new THREE.Mesh(new THREE.PlaneGeometry(2.3, 0.77), new THREE.MeshStandardMaterial({ map: sg2.tex, emissive: '#ffffff', emissiveMap: sg2.tex, emissiveIntensity: 0.7 }));
    plank.position.set(0.1, 3.62, 0.55); root.add(plank);
    for (const px of [-0.85, 1.05]) box(0.07, 0.65, 0.07, wood, px, 3.2, 0.5);
    const gl = makeGlow(new THREE.Color(1.3, 0.8, 2.0), 4, 2.4, 0.5); gl.position.set(0.1, 3.62, 0.95); root.add(gl);
  }

  /* ---------- String lights along the roof and the awning ---------- */
  {
    const pts = [];
    for (let i = 0; i <= 16; i++) { const k = i / 16; pts.push(new THREE.Vector3(-L / 2 + 0.1 + k * (L - 0.2), Y1 - 0.02 - 0.22 * Math.sin(k * Math.PI), D / 2 + 0.07)); }
    for (let i = 0; i <= 7; i++) { const k = i / 7; pts.push(new THREE.Vector3((HX0 + HX1) / 2 - 1.1 + k * 2.2, 2.2 - 0.04 * Math.sin(k * Math.PI), D / 2 + 0.82)); }
    const palette = [new THREE.Color(2.2, 0.6, 2.6), new THREE.Color(3, 2.2, 0.7), new THREE.Color(0.8, 1.4, 3), new THREE.Color(3, 0.8, 1.8)];
    const bulbs = bulbSet(pts, (i) => palette[i % palette.length], 0.06, (i) => i * 0.8);
    root.add(bulbs.mesh);
    let f = 0; updaters.push((time) => { if ((f++ % 3) === 0) bulbs.update(time, 1.5, 2.2); });
  }

  const pool = new THREE.Mesh(new THREE.PlaneGeometry(9, 9), new THREE.MeshBasicMaterial({ color: new THREE.Color(1.1, 0.6, 1.8), transparent: true, opacity: 0.2, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, fog: false }));
  pool.rotation.x = -Math.PI / 2; pool.position.set(0.3, 0.07, 2.2); root.add(pool); // violet light on the snow in front

  return { update(time) { for (const u of updaters) u(time); } };
}

/* ============================================================ Reading ============================================================ */
const DECK_SHOWN = 10; // cards laid out face down; the three you pick come from the whole 78-card deck
const shuffle = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0; [a[i], a[j]] = [a[j], a[i]]; } return a; };

/** A short reading of the three cards together: many Major Arcana, or a suit that shows up twice, or a mix. */
function overall(picks) {
  const majors = picks.filter((c) => c.kind === 'm').length;
  if (majors >= 2) return t(majors === 3 ? 'tr.sum.m3' : 'tr.sum.m2');
  const counts = {};
  for (const c of picks) if (c.kind !== 'm') counts[c.kind] = (counts[c.kind] || 0) + 1;
  const top = Object.entries(counts).find(([, k]) => k >= 2);
  return t(top ? `tr.sum.${top[0]}` : 'tr.sum.mix');
}

export function initTarot({ getPlayer }) {
  const dlg = $('dlg-tarot'), body = $('tr-body'), btn = $('tarot-btn');
  const [sx, sz] = tarotWorld(TAROT_SPOT.lx, TAROT_SPOT.lz);
  let near = false, stage = 'intro', deck = [], picks = [], boxEls = [];

  const h = (tag, props = {}, ...kids) => { const el = document.createElement(tag); for (const [k, v] of Object.entries(props)) { if (k === 'class') el.className = v; else if (k === 'text') el.textContent = v; else if (k.startsWith('on')) el.addEventListener(k.slice(2), v); else el.setAttribute(k, v); } el.append(...kids.flat().filter((c) => c != null)); return el; };
  const img = (c) => h('img', { class: 'timg', src: c.img, alt: cardName(c.id), draggable: 'false' });

  function renderIntro() {
    stage = 'intro';
    body.replaceChildren(h('div', { class: 'tr-intro' }, h('div', { class: 'gbig', text: '🔮' }), h('b', { text: t('tr.title') }), h('p', { text: t('tr.intro') }),
      h('button', { type: 'button', class: 'primary', text: t('tr.shuffle'), onclick: () => { track('tarot_shuffle'); renderPick(); } })));
  }
  function renderPick() {
    stage = 'pick'; picks = []; deck = shuffle(DECK.slice()).slice(0, DECK_SHOWN);
    boxEls = [0, 1, 2].map(() => h('div', { class: 'tbox' }));
    const slots = boxEls.map((b, i) => h('div', { class: 'tr-slot' }, b, h('small', { text: t(`tr.p${i + 1}`) })));
    const step = h('p', { class: 'tr-step', text: t('tr.pick', { pos: t('tr.p1') }) });
    const deckEl = h('div', { class: 'tr-deck' }, deck.map((c) => h('button', { type: 'button', class: 'tcard', 'aria-label': t('tr.card'), onclick: (e) => pickCard(e.currentTarget, c, step) }, h('span', { text: '✦' }))));
    body.replaceChildren(step, h('div', { class: 'tr-spread' }, slots), deckEl, h('p', { class: 'dim tr-note', text: t('tr.note') }));
  }
  function pickCard(el, card, step) {
    if (picks.length >= 3) return;
    const k = picks.length; picks.push(card);
    el.disabled = true; el.style.visibility = 'hidden';
    boxEls[k].replaceChildren(img(card)); boxEls[k].classList.add('on');
    if (picks.length < 3) step.textContent = t('tr.pick', { pos: t(`tr.p${picks.length + 1}`) });
    else { step.textContent = '✦ ✦ ✦'; setTimeout(() => { if (dlg.open && stage === 'pick') { track('tarot_read'); renderResult(); } }, 1400); }
  }
  function renderResult() {
    stage = 'result';
    const msg = t(`tr.end.${1 + (picks.reduce((a, c) => a + c.id.charCodeAt(1) + c.id.charCodeAt(2), 0) % 4)}`);
    const spread = h('div', { class: 'tr-spread' }, picks.map((c, i) => h('div', { class: 'tr-slot' }, h('div', { class: 'tbox on' }, img(c)), h('small', { text: t(`tr.p${i + 1}`) }))));
    const list = h('ul', { class: 'tr-read' }, picks.map((c, i) => h('li', {}, h('b', { text: `${t(`tr.p${i + 1}`)} · ${cardName(c.id)}` }), h('span', { text: cardMeaning(c.id) }))));
    body.replaceChildren(spread, list, h('div', { class: 'tr-sum' }, h('b', { text: t('tr.sumtitle') }), h('span', { text: overall(picks) })),
      h('p', { class: 'tr-end', text: msg }), h('p', { class: 'dim tr-note', text: t('tr.note') }), h('p', { class: 'dim tr-note', text: t('tr.credit') }),
      h('button', { type: 'button', class: 'primary wide', text: t('tr.again'), onclick: () => { track('tarot_again'); renderPick(); } }), h('button', { type: 'button', class: 'link wide', text: t('close'), onclick: () => dlg.close() }));
  }
  function refresh() { btn.textContent = `🔮 ${t('tr.btn')}`; $('tr-title').textContent = `🔮 ${t('tr.title')}`; if (dlg.open) { if (stage === 'intro') renderIntro(); else if (stage === 'pick') renderPick(); else renderResult(); } }

  btn.addEventListener('click', () => { track('tarot_open'); refresh(); renderIntro(); if (!dlg.open) dlg.showModal(); });
  $('tr-close').addEventListener('click', () => dlg.close());
  onLang(refresh);
  refresh();

  return {
    /** Call every frame: shows the button while the player stands in front of the caravan's hatch. */
    update() {
      const p = getPlayer();
      const was = near;
      near = !!p && !document.querySelector('dialog[open]') && Math.hypot(p.x - sx, p.z - sz) < (was ? 3.1 : 2.6);
      btn.hidden = !near;
    },
  };
}
