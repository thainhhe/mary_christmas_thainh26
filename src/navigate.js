import * as THREE from 'three';
import { $, toast } from './state.js';
import { t, onLang } from './i18n.js';
import { AVENUE } from '../shared/walk.js';
import { MARKET, marketWorld } from './marketlayout.js';
import { TAROT, TAROT_SPOT, tarotWorld } from './tarotlayout.js';
import { ROADS } from './roads.js';
import { FERRIS_POS } from './env.js';

/**
 * Village map + directions. The map button (under the menu button) opens a map with the three places worth visiting
 * (the Christmas tree, the market with its games, the tarot caravan). Tap a place to see the way on the map, then either
 * "Show me the way" (an arrow + distance on screen while you walk yourself) or "Take me there" (your avatar walks).
 */
const onAvenue = (r) => [AVENUE.x * r, AVENUE.z * r];
const END = { tree: [3.4, 3.4], market: marketWorld(0, 9), tarot: tarotWorld(TAROT_SPOT.lx, TAROT_SPOT.lz) };
export const AREAS = [
  { id: 'tree', icon: '🎄', name: 'wc.tree.t', at: [0, 0] },
  { id: 'market', icon: '🎪', name: 'wc.mk.t', at: [MARKET.x, MARKET.z] },
  { id: 'tarot', icon: '🔮', name: 'wc.tr.t', at: [TAROT.x, TAROT.z] },
];
const nameOf = (id) => t(`mp.short.${id}`); // short names for the on-screen chip

/** The points to walk through, in order, from where the player stands (they use the avenue and the market gate). */
export function areaRoute(id, p) {
  const along = p.x * AVENUE.x + p.z * AVENUE.z; // how far out along the avenue the player is
  const inMarket = Math.hypot(p.x - MARKET.x, p.z - MARKET.z) < MARKET.radius + 2;
  const route = [];
  if (id === 'market') {
    if (!inMarket) { if (along < 30) route.push(onAvenue(30)); route.push(marketWorld(0, 19)); }
    route.push(END.market);
  } else {
    if (inMarket) route.push(marketWorld(0, 19), onAvenue(30)); // out through the gate and back along the avenue first
    else if (Math.hypot(p.x, p.z) > 31) route.push(onAvenue(30));
    route.push(END[id]);
  }
  return route;
}
function routeLength(p, route) {
  let len = 0, x = p.x, z = p.z;
  for (const [rx, rz] of route) { len += Math.hypot(rx - x, rz - z); x = rx; z = rz; }
  return len;
}

export function initNav({ getPlayer, getCamera, isJoined, walk, openJoin }) {
  const dlg = $('dlg-map'), body = $('map-body'), btn = $('map-btn'), chip = $('nav-chip'), arrow = $('nav-arrow'), chipText = $('nav-text');
  let sel = null;        // area selected in the map
  let target = null;     // area we are showing directions to
  let timer = 0, lastText = '';
  let canvas = null, listEl = null, actionsEl = null;
  const fw = new THREE.Vector3();

  const h = (tag, props = {}, ...kids) => { const el = document.createElement(tag); for (const [k, v] of Object.entries(props)) { if (k === 'class') el.className = v; else if (k === 'text') el.textContent = v; else if (k.startsWith('on')) el.addEventListener(k.slice(2), v); else el.setAttribute(k, v); } el.append(...kids.flat().filter((c) => c != null)); return el; };

  /* camera heading on the ground: f = forward, r = right (same convention as the walking controls) */
  function heading() {
    const cam = getCamera(); cam.getWorldDirection(fw);
    let fx = fw.x, fz = fw.z; const l = Math.hypot(fx, fz);
    if (l < 0.05) { fx = 0; fz = -1; } else { fx /= l; fz /= l; }
    return { fx, fz, rx: -fz, rz: fx };
  }

  /* ---------- directions ---------- */
  function setTarget(id) { target = id; lastText = ''; chip.hidden = !id; }
  function guide(id) { setTarget(id); } // the chip on screen is the feedback
  function go(id) { // the avatar walks there by itself
    const p = getPlayer(); if (!p) return;
    setTarget(id); walk(areaRoute(id, p));
  }
  $('nav-stop').addEventListener('click', () => { setTarget(null); walk(null); });
  $('nav-walk').addEventListener('click', () => { if (target) go(target); });

  /* ---------- the map ---------- */
  const CS = 640, R = 78, CENTER = [-14, 14], K = CS / 2 / R; // canvas px, world radius shown, map centre, px per unit
  function draw() {
    if (!canvas) return;
    const g = canvas.getContext('2d'), { fx, fz, rx, rz } = heading();
    const P = (x, z) => { const dx = x - CENTER[0], dz = z - CENTER[1]; return [CS / 2 + (dx * rx + dz * rz) * K, CS / 2 - (dx * fx + dz * fz) * K]; };
    const circle = (x, z, r) => { const [px, py] = P(x, z); g.beginPath(); g.arc(px, py, r * K, 0, 6.2832); };
    g.clearRect(0, 0, CS, CS);
    g.save(); g.beginPath(); g.arc(CS / 2, CS / 2, CS / 2 - 3, 0, 6.2832); g.clip();
    const bg = g.createRadialGradient(CS / 2, CS / 2, 20, CS / 2, CS / 2, CS / 2); bg.addColorStop(0, '#1d3568'); bg.addColorStop(1, '#0a1330'); g.fillStyle = bg; g.fillRect(0, 0, CS, CS);
    circle(0, 0, 58); g.fillStyle = 'rgba(210,225,255,.10)'; g.fill(); // the cleared village ground
    // streets
    g.strokeStyle = 'rgba(205,214,238,.5)'; g.lineCap = 'butt';
    for (const [r, w] of [[ROADS.plazaRing.r, 3], [ROADS.outerRing.r, 5], [ROADS.mainRing.r, 5]]) { circle(0, 0, r); g.lineWidth = w; g.stroke(); }
    g.lineWidth = 5;
    for (let k = 0; k < 8; k++) { const a = (k * Math.PI) / 4, to = k === 3 ? 41 : k === 0 ? ROADS.cinemaStop : ROADS.mainRing.r; g.beginPath(); g.moveTo(...P(Math.cos(a) * ROADS.outerRing.r, Math.sin(a) * ROADS.outerRing.r)); g.lineTo(...P(Math.cos(a) * to, Math.sin(a) * to)); g.stroke(); }
    g.lineWidth = 3; for (let k = 0; k < 4; k++) { const a = (k * Math.PI) / 2; g.beginPath(); g.moveTo(...P(Math.cos(a) * ROADS.plazaRing.r, Math.sin(a) * ROADS.plazaRing.r)); g.lineTo(...P(Math.cos(a) * ROADS.outerRing.r, Math.sin(a) * ROADS.outerRing.r)); g.stroke(); }
    // houses (dots) and the market square
    g.fillStyle = 'rgba(190,140,100,.55)';
    for (const r of [40.5, 47, 53.5]) for (let i = 0; i < Math.round((6.2832 * r) / 6.5); i++) { const a = (i / Math.round((6.2832 * r) / 6.5)) * 6.2832, x = Math.cos(a) * r, z = Math.sin(a) * r; if (Math.hypot(x - MARKET.x, z - MARKET.z) < MARKET.radius + 3) continue; const [px, py] = P(x, z); g.beginPath(); g.arc(px, py, 3.2, 0, 6.2832); g.fill(); }
    circle(MARKET.x, MARKET.z, MARKET.radius); g.fillStyle = 'rgba(255,209,102,.16)'; g.fill(); g.strokeStyle = 'rgba(255,209,102,.7)'; g.lineWidth = 3; g.stroke();
    // other landmarks, faint
    g.font = '24px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.globalAlpha = 0.6;
    for (const [e, x, z] of [['🎬', 44, 3], ['🎡', FERRIS_POS.x, FERRIS_POS.z], ['⛷️', 6, -56], ['🔥', -11, -3]]) g.fillText(e, ...P(x, z));
    g.globalAlpha = 1;
    // route preview for the selected place
    const me = getPlayer();
    if (sel && me) {
      const route = areaRoute(sel, me), pts = [[me.x, me.z], ...route];
      g.strokeStyle = '#ffd166'; g.lineWidth = 6; g.setLineDash([14, 12]); g.lineJoin = 'round'; g.beginPath();
      pts.forEach(([x, z], i) => { const [px, py] = P(x, z); if (i) g.lineTo(px, py); else g.moveTo(px, py); }); g.stroke(); g.setLineDash([]);
    }
    // the three places
    for (const a of AREAS) {
      const [px, py] = P(...a.at), on = sel === a.id, r = on ? 30 : 25;
      g.beginPath(); g.arc(px, py, r, 0, 6.2832); g.fillStyle = on ? '#3a2a0a' : '#0e1a3a'; g.fill(); g.lineWidth = on ? 5 : 3; g.strokeStyle = on ? '#ffd166' : '#bed7ffaa'; g.stroke();
      g.globalAlpha = 1; g.font = `${on ? 30 : 25}px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif`; g.fillText(a.icon, px, py + 2);
    }
    // you
    if (me) {
      const [px, py] = P(me.x, me.z);
      g.beginPath(); g.arc(px, py, 13, 0, 6.2832); g.fillStyle = '#4aa3f0'; g.fill(); g.lineWidth = 4; g.strokeStyle = '#fff'; g.stroke();
      g.font = '700 22px system-ui, sans-serif'; g.fillStyle = '#fff'; g.strokeStyle = '#06102a'; g.lineWidth = 5; g.strokeText(t('mp.you'), px, py + 30); g.fillText(t('mp.you'), px, py + 30);
    }
    g.restore();
    // a small compass: where the camera is looking
    g.fillStyle = '#ffffffcc'; g.font = '700 22px system-ui, sans-serif'; g.textAlign = 'center'; g.fillText('▲', CS / 2, 26);
  }

  function renderList() {
    const me = getPlayer(), joined = isJoined();
    listEl.replaceChildren(...AREAS.map((a) => h('button', { type: 'button', class: `mp-row${sel === a.id ? ' sel' : ''}`, onclick: () => select(a.id) },
      h('span', { class: 'ic', text: a.icon }), h('b', { text: t(a.name) }),
      h('small', { text: me ? t('mp.dist', { n: Math.round(routeLength(me, areaRoute(a.id, me))) }) : '' }))));
    actionsEl.replaceChildren();
    if (!joined) {
      actionsEl.append(h('p', { class: 'dim', text: t('mp.needjoin') }), h('button', { type: 'button', class: 'primary wide', text: t('wc.join'), onclick: () => { dlg.close(); openJoin(); } }));
    } else if (!sel) actionsEl.append(h('p', { class: 'dim', text: t('mp.hint') }));
    else actionsEl.append(
      h('div', { class: 'mp-act' },
        h('button', { type: 'button', class: 'primary sm', text: t('mp.guide'), onclick: () => { dlg.close(); guide(sel); } }),
        h('button', { type: 'button', class: 'primary sm', text: t('mp.walk'), onclick: () => { dlg.close(); go(sel); } })),
      h('p', { class: 'dim mp-note', text: t('mp.explain') }));
  }
  function select(id) { sel = id; renderList(); draw(); }

  function render() {
    $('map-title').textContent = `🗺️ ${t('mp.title')}`;
    canvas = h('canvas', { class: 'mp-canvas', width: String(CS), height: String(CS), 'aria-label': t('mp.title') });
    listEl = h('div', { class: 'mp-list' }); actionsEl = h('div', { class: 'mp-actions' });
    canvas.addEventListener('click', (e) => { // tap a place on the map
      const r = canvas.getBoundingClientRect(), mx = ((e.clientX - r.left) / r.width) * CS, my = ((e.clientY - r.top) / r.height) * CS;
      const { fx, fz, rx, rz } = heading();
      let best = null, bd = 48;
      for (const a of AREAS) {
        const dx = a.at[0] - CENTER[0], dz = a.at[1] - CENTER[1];
        const d = Math.hypot(CS / 2 + (dx * rx + dz * rz) * K - mx, CS / 2 - (dx * fx + dz * fz) * K - my);
        if (d < bd) { bd = d; best = a.id; }
      }
      if (best) select(best);
    });
    body.replaceChildren(canvas, listEl, actionsEl);
    renderList(); draw();
  }

  function open() { if (document.querySelector('dialog[open]')) return; sel = target; render(); dlg.showModal(); clearInterval(timer); timer = setInterval(() => { if (!dlg.open) { clearInterval(timer); return; } draw(); }, 400); }
  btn.addEventListener('click', open);
  $('map-close').addEventListener('click', () => dlg.close());
  dlg.addEventListener('close', () => clearInterval(timer));
  onLang(() => { btn.setAttribute('aria-label', t('mp.title')); if (dlg.open) render(); if (target) lastText = ''; });
  btn.setAttribute('aria-label', t('mp.title'));

  return {
    go, guide, open,
    /** Call every frame: points the arrow at the next waypoint and shows how far is left. */
    update() {
      if (!target) return;
      const p = getPlayer(); if (!p) return;
      const route = areaRoute(target, p), end = route[route.length - 1];
      if (Math.hypot(p.x - end[0], p.z - end[1]) < 3.2) { toast(t('mp.arrived', { place: nameOf(target) }), 3500); setTarget(null); return; }
      const [nx, nz] = route[0], { fx, fz, rx, rz } = heading(), dx = nx - p.x, dz = nz - p.z;
      arrow.style.transform = `rotate(${(Math.atan2(dx * rx + dz * rz, dx * fx + dz * fz) * 180) / Math.PI}deg)`;
      const text = t('mp.chip', { place: nameOf(target), n: Math.round(routeLength(p, route)) });
      if (text !== lastText) { lastText = text; chipText.textContent = text; }
    },
  };
}
