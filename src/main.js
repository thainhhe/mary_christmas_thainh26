import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { buildEnvironment } from './env.js';
import { buildTree, TIERS, WISH_COLORS } from './tree.js';
import { buildWorld2 } from './world2.js';
import { buildTown } from './town.js';
import { buildRoads, ROADS } from './roads.js';
import { createWishers } from './wishers.js';
import { createRecorder } from './recorder.js';
import { createFollowCam } from './followcam.js';
import { buildMarket } from './market.js';
import { buildTrailOfLights } from './lights.js';
import { MARKET } from './marketlayout.js';
import { LocalPlayer, Crowd, buildNPCs } from './avatars.js';
import { createSanta, createGifts, createFireworks } from './sky.js';
import { say, updateBubbles } from './bubbles.js';
import * as net from './net.js';
import * as sound from './audio.js';
import { $, me, store, bus, toast } from './state.js';
import { t, apply, onLang } from './i18n.js';
import { now, params, activeEvent, santaSlot, santaSlotAge } from './clock.js';
import { initUI } from './ui.js';
import { initMinigames } from './minigames.js';
import { buildTarot, initTarot } from './tarot.js';
import { TAROT } from './tarotlayout.js';
import { initAnalytics } from './analytics.js';

const STORAGE_KEY = 'noel.ornaments.v2';
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
apply();
initAnalytics();

/* ---------- Renderer / post-processing ---------- */
const canvas = $('scene');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.95;

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2('#0d1d44', 0.008);
const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 600);
camera.position.set(0, 14, 30); // wide and slightly raised: reads as a small town

const controls = new OrbitControls(camera, canvas);
controls.target.set(0, 3, 0);
controls.enableDamping = true;
controls.enablePan = false;
controls.minDistance = 6;
controls.maxDistance = 33; // everything (houses, cinema, ferris, forest) stands beyond this, so nothing can ever block the camera
controls.maxPolarAngle = Math.PI * 0.49;
controls.autoRotate = !reduceMotion;
controls.autoRotateSpeed = 0.35;

const rt = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4 });
const composer = new EffectComposer(renderer, rt);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.4, 0.55, 1.0);
composer.addPass(bloom);
composer.addPass(new OutputPass());

scene.add(new THREE.HemisphereLight('#8aa6f0', '#22305e', 0.6));
const moonLight = new THREE.DirectionalLight('#aac4ff', 0.75);
moonLight.position.set(-30, 40, -40);
scene.add(moonLight);
const fill = new THREE.DirectionalLight("#c8d6ff", 0.9); // lights the front of the ski slope + cinema
fill.position.set(10, 25, 40);
scene.add(fill);
const warm = new THREE.PointLight('#ffc27a', 16, 20, 2);
warm.position.set(0, 3.2, 0);
scene.add(warm);

const envMap = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;

/* ---------- World ---------- */
const env = buildEnvironment(scene);
const tree = buildTree(scene, envMap);
const world2 = buildWorld2(scene);
const tarotCaravan = buildTarot(scene); // the tarot caravan next to the blue-scarf snowman
const market = buildMarket(scene); // the Christmas market at the end of the south-west avenue
const trail = buildTrailOfLights(scene); // the lit avenue leading to it
const town = buildTown(scene);
const roads = buildRoads(scene);
const npcs = buildNPCs(scene);
const local = new LocalPlayer(scene);
const crowd = new Crowd(scene);
const wishers = createWishers(scene); // everyone who hung a wish walks around town
const fireworks = createFireworks(scene);
const gifts = createGifts(scene, fireworks);
const santa = createSanta(scene, camera);

/* ---------- Wishes ---------- */
const ornaments = [];
const groups = [];
const ids = new Set();
let online = false;

function addOrnament(o, animate = false) {
  if (o.id) { if (ids.has(o.id)) return null; ids.add(o.id); }
  ornaments.push(o);
  const g = tree.addWish(o, animate);
  groups.push(g);
  world2.setWishes(ornaments); market.setWishes(ornaments);
  wishers.add(o, animate);
  npcs.setVisibleCount(Math.max(0, 8 - wishers.size)); // real wishers replace the filler NPCs
  return g;
}
const randomPlacement = () => ({ tier: (Math.random() * (TIERS.length - 1)) | 0, angle: Math.random() * Math.PI * 2, t: 0.1 + Math.random() * 0.8 });
const saveLocal = () => store.set(STORAGE_KEY, ornaments);
function loadLocal() {
  const raw = store.get(STORAGE_KEY, null);
  if (Array.isArray(raw) && raw.length) { raw.forEach((o) => addOrnament(o)); return; }
  const s = (name, wish, c) => ({ name, wish, color: WISH_COLORS[c], ...randomPlacement() });
  [s('Mai Anh', 'Chúc cả nhà một mùa Noel thật ấm áp! 🎄', 0), s('Hiếu', 'Năm mới bình an, nhiều niềm vui.', 1)].forEach((o) => addOrnament(o));
}

/* ---------- Picking + tooltip ---------- */
const tip = $('tip');
const ray = new THREE.Raycaster();
const ndc = new THREE.Vector2();
let activeGroup = null, activeOff = 0, hovered = null, down = null;
const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

function setRay(ev) {
  const r = canvas.getBoundingClientRect();
  ndc.set(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1);
  ray.setFromCamera(ndc, camera);
}
function pickWish() {
  const hit = ray.intersectObjects([...tree.wishBalls, ...tree.occluders], false)[0];
  return hit && hit.object.userData.group ? hit.object.userData.group : null;
}
function pickWisher() {
  const hit = ray.intersectObjects(wishers.hitboxes(), false)[0];
  return hit ? hit.object.userData.group : null;
}
function pickGift() {
  const hit = ray.intersectObjects(gifts.hitboxes(), false)[0];
  return hit ? hit.object.userData.giftId : null;
}
function pickBoard() { // the leaderboard sign (the tree in front of it blocks the tap, like it blocks the view)
  const hit = ray.intersectObjects([world2.boardHit, ...tree.occluders], false)[0];
  return !!hit && hit.object === world2.boardHit;
}
function showTip(target) { // an ornament group, or a wishing character
  activeGroup = target;
  if (!target) { tip.hidden = true; return; }
  let name, wish;
  if (target.userData.wisher) { const e = target.userData.wisher; name = e.name; wish = wishers.latestWish(e).wish; activeOff = 2.9; }
  else { ({ name, wish } = target.userData.o); activeOff = 0; }
  const b = document.createElement('b'); b.textContent = name || t('w.anon');
  const s = document.createElement('span'); s.textContent = wish;
  tip.replaceChildren(b, s);
  tip.hidden = false;
  placeTip();
}
const tmpV = new THREE.Vector3();
function placeTip() {
  if (!activeGroup) return;
  activeGroup.getWorldPosition(tmpV);
  tmpV.y += activeOff;
  tmpV.project(camera);
  const x = (tmpV.x * 0.5 + 0.5) * innerWidth, y = (-tmpV.y * 0.5 + 0.5) * innerHeight;
  tip.style.left = `${Math.min(Math.max(x, 140), innerWidth - 140)}px`;
  tip.style.top = `${Math.max(y, 110)}px`;
}
canvas.addEventListener('pointerdown', (e) => { down = { x: e.clientX, y: e.clientY }; });
canvas.addEventListener('pointerup', (e) => {
  if (!down || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 6) return;
  setRay(e);
  const gid = pickGift();
  if (gid) { // a gift is picked up by WALKING over it: a tap only sends the player there
    if (!local.active) { toast(t('toast.giftjoin'), 3500); return; }
    const gp = gifts.posOf(gid);
    if (gp) local.setTarget(gp.x, gp.z);
    return;
  }
  const person = pickWisher();
  if (person) { showTip(person); return; }
  const w = pickWish();
  if (w) { showTip(w); return; }
  if (pickBoard()) { showTip(null); ui.openBoard(); return; }
  showTip(null);
  if (local.active) {
    const p = new THREE.Vector3();
    if (ray.ray.intersectPlane(groundPlane, p)) local.setTarget(p.x, p.z);
  }
});
canvas.addEventListener('pointermove', (e) => {
  if (e.pointerType !== 'mouse') return;
  setRay(e);
  hovered = pickWish();
  canvas.style.cursor = hovered || pickGift() || pickWisher() || pickBoard() ? 'pointer' : 'grab';
});

/* ---------- Camera fly-to ---------- */
let fly = null;
let followCam = null; // camera behind the avatar when far from the tree (created below, once the recorder exists)
function flyToOrnament(group) {
  followCam?.exitNow(true); // the fly-to moves the far orbit camera: leave the follow camera first
  const off = camera.position.clone().sub(controls.target);
  const cur = Math.atan2(off.x, off.z);
  let d = Math.PI / 2 - group.userData.o.angle - cur;
  d = Math.atan2(Math.sin(d), Math.cos(d));
  fly = { start: performance.now(), base: off, d };
  controls.autoRotate = false;
  setTimeout(() => { controls.autoRotate = !reduceMotion; }, 6000);
}
function focusWish(g) { flyToOrnament(g); setTimeout(() => showTip(g), 750); }

/* ---------- UI wiring ---------- */
const ui = initUI({
  wishColors: WISH_COLORS,
  getWishes: () => groups,
  focusWish,
  record: (opts) => { followCam?.exitNow(); recorder.start(opts); },
  recSupported: () => recorder.supported,
  setBoard: (rows) => { world2.setBoard(rows); market.setBoard(rows); },
  capture() {
    composer.render();
    const c = document.createElement('canvas');
    c.width = canvas.width; c.height = canvas.height;
    c.getContext('2d').drawImage(canvas, 0, 0);
    return c;
  },
  join(info) {
    if (net.isOpen()) net.send({ type: 'join', ...info });
    else { spawnMe({ ...info, x: 7, z: 0 }); }
  },
  async hang(draft) {
    let o;
    if (online) {
      try { o = await net.api('/api/wishes', { ...draft, cid: me.cid }); } catch (e) {
        toast(e.status === 429 ? t('toast.fast') : t('toast.conn'));
        return false;
      }
    } else o = { ...draft, ...randomPlacement() };
    const g = addOrnament(o, true) || groups.find((x) => x.userData.o.id === o.id);
    if (!online) saveLocal();
    bus.emit('wish');
    if (o.points) { toast(t('toast.wish', { n: o.points })); ui.loadBoard(); }
    sound.chime();
    if (g) { flyToOrnament(g); setTimeout(() => showTip(g), 700); }
    return true;
  },
});
ui.setPresence(null);
const tarot = initTarot({ getPlayer: () => local.g?.position }); // the Tarot button at the caravan
const minigames = initMinigames({ getPlayer: () => local.g?.position }); // the Play button at the market stalls

/* ---------- Video recording (vertical 9:16) ---------- */
let recSize = null; // while recording, the renderer is resized to the video size
const recorder = createRecorder({
  glCanvas: canvas, camera, controls, santa, fireworks,
  setRecSize(size) { recSize = size; resize(); },
  onDone: (blob, ext) => ui.showVideoResult(blob, ext),
  onEnd: () => $('sound').setAttribute('aria-pressed', String(sound.isOn())),
});
followCam = createFollowCam({ camera, controls, local, isBusy: () => recorder.active });
const viewBtn = $('view-btn');
followCam.onChange((on, byUser) => {
  viewBtn.setAttribute('aria-pressed', String(on));
  if (on && !byUser && !store.get('noel.followTip', false)) { store.set('noel.followTip', true); toast(t('toast.follow'), 5000); } // explain it once
});
viewBtn.addEventListener('click', () => followCam.toggle());
$('rec-stop').addEventListener('click', () => recorder.stop(recorder.phase !== 'record')); // before it starts: cancel; after: finish early
addEventListener('keydown', (e) => { if (e.key === 'Escape' && recorder.active) recorder.stop(recorder.phase !== 'record'); });

function spawnMe(p) {
  const first = !me.joined;
  me.joined = true;
  local.spawn({ ...p, name: me.name });
  if (me.by) wishers.setHidden(me.by); // your own avatar stands in for your wishing character
  $('join-btn').hidden = true;
  $('view-btn').hidden = false; // the camera button (follow / far view) only makes sense with an avatar
  stick.hidden = !(touchUI || params.has("stick"));
  ui.updateChatState();
  if (first) toast(t('toast.join', { name: me.name }));
}

/* ---------- Network ---------- */
net.on('open', () => { online = true; });
net.on('close', () => { online = false; me.ready = false; ui.setPresence(null); crowd.clear(); });
net.on('welcome', (m) => {
  me.pid = m.pid; me.by = m.by;
  if (me.joined && me.by) wishers.setHidden(me.by);
  ui.setPresence({ online: m.online, today: m.today });
  crowd.clear();
  m.players.forEach((p) => { if (p.id !== me.pid) crowd.add(p); });
  m.gifts.forEach((g) => gifts.add(g));
  ui.setHistory(m.chat);
  if (me.joined) net.send({ type: 'join', name: me.name, shirt: me.shirt, hat: me.hat }); // re-join after reconnect
});
net.on('online', (m) => ui.setPresence({ online: m.online, today: m.today }));
net.on('join', ({ player: p }) => {
  if (p.id === me.pid) { me.ready = true; spawnMe(p); } else crowd.add(p);
});
net.on('move', (m) => crowd.move(m.id, m.x, m.z));
net.on('leave', (m) => crowd.remove(m.id));
net.on('chat', (m) => {
  ui.addChat(m);
  const anchor = m.id === me.pid ? local.g : crowd.get(m.id);
  if (anchor) say(anchor, m.text, { y: 3.0 });
});
net.on('wish', (m) => { if (addOrnament(m.wish, true)) { /* animates in */ } });
net.on('gift', (m) => { gifts.add(m.gift); toast(t('toast.gift')); });
net.on('giftgone', (m) => {
  gifts.remove(m.id, true);
  if (m.by && m.by !== me.name) toast(t('toast.taken', { name: m.by }), 1800);
});
net.on('claimed', (m) => { toast(t('toast.got', { n: m.points })); bus.emit('gift'); ui.loadBoard(); sound.chime(); });
net.on('error', (m) => {
  if (m.code === 'chat_fast') toast(t('toast.chatfast'));
  else if (m.code === 'not_joined' && me.joined) { me.ready = false; net.send({ type: 'join', name: me.name, shirt: me.shirt, hat: me.hat }); } // server lost our player: join again
});

(async function boot() {
  try {
    const { wishes } = await net.api('/api/wishes');
    wishes.forEach((o) => addOrnament(o));
    online = true;
    net.connect(() => ({ cid: me.cid }));
    ui.loadBoard();
    setInterval(ui.loadBoard, 60000);
  } catch {
    online = false;
    loadLocal();
  }
})();

/* ---------- Sound ---------- */
$('sound').addEventListener('click', () => {
  if (sound.isOn()) sound.stop(); else sound.start();
  $('sound').setAttribute('aria-pressed', String(sound.isOn()));
});

/* ---------- Countdown ---------- */
const cd = $('countdown');
function tickCountdown() {
  const n = now(), y = n.getFullYear();
  const start = new Date(y, 11, 25), end = new Date(y, 11, 26);
  if (n >= start && n < end) { cd.innerHTML = `<span class="merry">${t('merry')}</span>`; return; }
  const target = n < start ? start : new Date(y + 1, 11, 25);
  let s = Math.floor((target - n) / 1000);
  const d = Math.floor(s / 86400); s %= 86400;
  const h = Math.floor(s / 3600); s %= 3600;
  const m = Math.floor(s / 60); s %= 60;
  const cell = (v, l) => `<div class="u"><b>${String(v).padStart(2, '0')}</b><small>${t(l)}</small></div>`;
  cd.innerHTML = [cell(d, 'u.d'), cell(h, 'u.h'), cell(m, 'u.m'), cell(s, 'u.s')].join('<span class="sep">:</span>');
}
tickCountdown();
setInterval(tickCountdown, 1000);
onLang(() => { tickCountdown(); npcs.relabel(); world2.redraw(); market.redraw(); });

/* ---------- Scheduled events: Santa every 7 min, carol / quiet hour, fireworks at midnight ---------- */
let quiet = false, lastEvent = null, lastSantaKey = '', fwDone = '';
function tickEvents() {
  const n = now();
  const slot = santaSlot(); // a new slot every 7 minutes (see clock.js)
  if (santaSlotAge() < 5000 && slot !== lastSantaKey && !santa.active) { lastSantaKey = slot; santa.start(); toast(t('toast.santa'), 4500); }
  if (n.getMonth() === 11 && n.getDate() === 25 && n.getHours() === 0 && n.getMinutes() === 0 && fwDone !== String(n.getFullYear())) {
    fwDone = String(n.getFullYear()); fireworks.startShow(75); toast(t('toast.fw'), 4500);
  }
  const ev = activeEvent();
  quiet = ev === 'quiet';
  world2.setMode(ev === 'carol' ? 'carol' : null);
  if (ev !== lastEvent) {
    if (ev === 'carol') toast(t('toast.carol'), 4000);
    if (ev === 'quiet') toast(t('toast.quiet'), 4000);
    lastEvent = ev;
  }
}
tickEvents();
setInterval(tickEvents, 1000);
if (params.has('santa')) setTimeout(() => { santa.start(); toast(t('toast.santa'), 4500); }, 2500);
if (params.has('fireworks')) setTimeout(() => fireworks.startShow(30), 2500);

/* ---------- Minimap ---------- */
const mm = $('minimap'), mctx = mm.getContext('2d');
const POIS = [[-9.4, -2.2, '#ff9a4d', 'o'], [44, 3, '#8ab4ff', 's'], [6, -56, '#ffffff', 't'], [-32, -27, '#ec6ba8', 'o'], [13.5, 6.5, '#ff6b6b', 's'], [MARKET.x, MARKET.z, '#ffd166', 's'], [TAROT.x, TAROT.z, '#c77dff', 's'], [0, 0, '#3fd17c', 'tree']];
function drawMinimap() {
  const S = mm.width, C = S / 2, R = 78, sc = C / R; // the Christmas market's far edge is ~86 out; its middle (63) must stay on the map
  const off = camera.position.clone().sub(controls.target); off.y = 0;
  const f = off.lengthSq() ? off.negate().normalize() : new THREE.Vector3(0, 0, -1);
  const rx = -f.z, rz = f.x;
  const P = (x, z) => [C + (x * rx + z * rz) * sc, C - (x * f.x + z * f.z) * sc];
  mctx.clearRect(0, 0, S, S);
  mctx.save();
  mctx.beginPath(); mctx.arc(C, C, C - 2, 0, 6.28); mctx.clip();
  const g = mctx.createRadialGradient(C, C, 10, C, C, C); g.addColorStop(0, '#26407a'); g.addColorStop(1, '#0c1736');
  mctx.fillStyle = g; mctx.fillRect(0, 0, S, S);
  mctx.strokeStyle = 'rgba(190,215,255,.25)'; mctx.lineWidth = 2;
  mctx.beginPath(); mctx.arc(...P(0, 0), 15 * sc, 0, 6.28); mctx.stroke();
  // streets
  mctx.strokeStyle = 'rgba(205,214,238,.45)'; mctx.lineWidth = 5;
  for (const r of [ROADS.plazaRing.r, ROADS.outerRing.r, ROADS.mainRing.r]) { mctx.beginPath(); mctx.arc(...P(0, 0), r * sc, 0, 6.28); mctx.stroke(); }
  mctx.lineWidth = 4;
  for (let k = 0; k < 8; k++) { const an = (k * Math.PI) / 4; mctx.beginPath(); mctx.moveTo(...P(Math.cos(an) * ROADS.outerRing.r, Math.sin(an) * ROADS.outerRing.r)); mctx.lineTo(...P(Math.cos(an) * ROADS.mainRing.r, Math.sin(an) * ROADS.mainRing.r)); mctx.stroke(); }
  for (const [x, z, col, kind] of POIS) {
    const [px, py] = P(x, z);
    mctx.fillStyle = col;
    if (kind === 'tree') { mctx.beginPath(); mctx.moveTo(px, py - 14); mctx.lineTo(px + 11, py + 10); mctx.lineTo(px - 11, py + 10); mctx.fill(); }
    else if (kind === 't') { mctx.beginPath(); mctx.moveTo(px, py - 10); mctx.lineTo(px + 10, py + 8); mctx.lineTo(px - 10, py + 8); mctx.fill(); }
    else if (kind === 's') mctx.fillRect(px - 7, py - 7, 14, 14);
    else { mctx.beginPath(); mctx.arc(px, py, 7, 0, 6.28); mctx.fill(); }
  }
  mctx.fillStyle = '#ffd166';
  for (const gp of gifts.positions()) { const [px, py] = P(gp.x, gp.z); mctx.fillRect(px - 5, py - 5, 10, 10); }
  mctx.fillStyle = 'rgba(180,200,235,.55)';
  for (const e of wishers.entries()) { if (!e.g.visible) continue; const [px, py] = P(e.g.position.x, e.g.position.z); mctx.fillStyle = e.color; mctx.beginPath(); mctx.arc(px, py, 4.5, 0, 6.28); mctx.fill(); }
  mctx.fillStyle = 'rgba(180,200,235,.55)';
  for (const n of npcs.list) { if (!n.g.visible) continue; const [px, py] = P(n.g.position.x, n.g.position.z); mctx.beginPath(); mctx.arc(px, py, 4, 0, 6.28); mctx.fill(); }
  mctx.fillStyle = '#ffffff';
  for (const e of crowd.map.values()) { const [px, py] = P(e.g.position.x, e.g.position.z); mctx.beginPath(); mctx.arc(px, py, 6, 0, 6.28); mctx.fill(); }
  if (local.g) {
    const [px, py] = P(local.g.position.x, local.g.position.z);
    mctx.fillStyle = '#34d27b'; mctx.strokeStyle = '#fff'; mctx.lineWidth = 3;
    mctx.beginPath(); mctx.arc(px, py, 8, 0, 6.28); mctx.fill(); mctx.stroke();
  }
  mctx.restore();
}

/* ---------- Graphics quality (low / mid / high) ---------- */
const touchUI = matchMedia('(pointer: coarse)').matches;
const QUALITY = {
  low: { pr: 1, samples: 0, bloom: false, snow: 0.2, bokeh: 0, trees: 0.35, glitter: false },
  mid: { pr: 1.25, samples: 2, bloom: true, snow: 0.5, bokeh: 0.5, trees: 0.65, glitter: true },
  high: { pr: 1.75, samples: 4, bloom: true, snow: 1, bokeh: 1, trees: 1, glitter: true },
};
let quality = store.get('noel.quality', null);
if (!QUALITY[quality]) quality = touchUI || innerWidth < 820 ? 'mid' : 'high';
let autoQuality = !store.get('noel.quality.manual', false) && !params.has('noauto');

function applyQuality(name, manual = false) {
  quality = name;
  const q = QUALITY[name];
  bloom.enabled = q.bloom;
  env.setQuality(q);
  for (const target of [composer.renderTarget1, composer.renderTarget2]) { target.samples = q.samples; target.dispose(); }
  if (manual) { autoQuality = false; store.set('noel.quality.manual', true); }
  store.set('noel.quality', name);
  document.querySelectorAll('#q-seg button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.q === name)));
  resize();
}
document.querySelectorAll('#q-seg button').forEach((b) => b.addEventListener('click', () => applyQuality(b.dataset.q, true)));

// If the device struggles, step quality down once or twice (unless the user picked a level themselves).
let perfSum = 0, perfN = 0;
const perfFrom = performance.now() + 3500;
function watchPerf(raw) {
  if (!autoQuality || quality === 'low' || performance.now() < perfFrom || raw > 0.25) return;
  perfSum += raw; perfN++;
  if (perfN < 90) return;
  const avg = perfSum / perfN;
  perfSum = perfN = 0;
  if (avg > 1 / 24) { applyQuality(quality === 'high' ? 'mid' : 'low'); toast(t('toast.q')); }
}

/* ---------- Auto-hide UI when idle ---------- */
const IDLE_MS = 6000;
let idleTimer = 0;
function goIdle() {
  const busy = document.querySelector('dialog[open]') || !$('menu').hidden || !$('chat').hidden || /^(INPUT|TEXTAREA)$/.test(document.activeElement?.tagName ?? '');
  if (busy) { idleTimer = setTimeout(goIdle, IDLE_MS); return; }
  document.body.classList.add('idle');
}
function wake() {
  document.body.classList.remove('idle');
  clearTimeout(idleTimer);
  if (!params.has('noidle')) idleTimer = setTimeout(goIdle, IDLE_MS);
}
for (const ev of ['pointermove', 'pointerdown', 'keydown', 'wheel', 'touchstart']) addEventListener(ev, wake, { passive: true });
wake();

/* ---------- On-screen joystick (touch devices) ---------- */
const stick = $('stick'), knob = stick.firstElementChild, STICK_R = 42;
let stickId = null;
function stickMove(e) {
  const r = stick.getBoundingClientRect();
  let dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2);
  const l = Math.hypot(dx, dy);
  if (l > STICK_R) { dx *= STICK_R / l; dy *= STICK_R / l; }
  knob.style.transform = `translate(${dx}px, ${dy}px)`;
  local.joy.x = dx / STICK_R; local.joy.y = dy / STICK_R;
}
function stickEnd(e) {
  if (e.pointerId !== stickId) return;
  stickId = null; local.joy.x = local.joy.y = 0; knob.style.transform = '';
}
stick.addEventListener('pointerdown', (e) => { stickId = e.pointerId; stick.setPointerCapture(e.pointerId); stickMove(e); });
stick.addEventListener('pointermove', (e) => { if (e.pointerId === stickId) stickMove(e); });
stick.addEventListener('pointerup', stickEnd);
stick.addEventListener('pointercancel', stickEnd);
if (params.has('stick')) stick.hidden = false;

/* ---------- Resize + loop ---------- */
function resize() {
  const w = recSize ? recSize.w : innerWidth, h = recSize ? recSize.h : innerHeight;
  const pr = recSize ? 1 : Math.min(devicePixelRatio, QUALITY[quality].pr);
  renderer.setPixelRatio(pr);
  renderer.setSize(w, h, false);
  composer.setPixelRatio(pr);
  composer.setSize(w, h);
  bloom.resolution.set(w / 2, h / 2);
  camera.aspect = w / h;
  // Portrait: widen the lens so the town still fits across a narrow screen without backing into the forest.
  const portrait = camera.aspect < 1;
  camera.fov = portrait ? Math.min(72, Math.max(50, THREE.MathUtils.radToDeg(2 * Math.atan(18 / camera.aspect / 2 / 26)))) : 50;
  camera.updateProjectionMatrix();
}
addEventListener('resize', resize);
applyQuality(quality);

window.__noel = { camera, controls, santa, fireworks, gifts, local, crowd, scene, recorder, followCam };
if (params.has('rec')) { // test: ?rec=SECONDS,style  (add &fw for fireworks)
  const [secs = '4', style = 'orbit'] = params.get('rec').split(',');
  setTimeout(() => recorder.start({ seconds: +secs, style, res: '720', music: params.has('music'), fireworks: params.has('fw'), santa: false, caption: 'Quây quần quanh cây thông', days: true }), 3000);
}
let freeCam = false;
// Debug helpers: ?cam=x,y,z,tx,ty,tz  (fixed camera)  ·  ?demo (spawn a local avatar)
if (params.has('cam')) {
  const [x, y, z, tx, ty, tz] = params.get('cam').split(',').map(Number);
  controls.minDistance = 0; controls.maxDistance = 1000; controls.maxPolarAngle = Math.PI;
  camera.position.set(x, y, z); controls.target.set(tx, ty, tz); controls.autoRotate = false; controls.update();
  freeCam = true;
}
if (params.has('zoom')) { camera.position.set(0, 4, Number(params.get('zoom'))); controls.update(); } // test: push the camera out and let the clamp lift it
if (params.has('open')) params.get('open').split(',').forEach((id, i) => setTimeout(() => $(id)?.click(), 1500 + i * 700)); // e.g. ?open=menu-btn,menu-board
if (params.has('demo')) { me.name = 'Tester'; spawnMe({ x: 6, z: 5, shirt: me.shirt, hat: me.hat }); }

const clock = new THREE.Clock();
/* ---------- Gifts: walk over one to pick it up ---------- */
const PICKUP_R = 1.3, claimAsked = new Map();
function pickUpGifts() {
  if (!local.g || !net.isOpen()) return;
  const p = local.g.position, t = performance.now();
  for (const g of gifts.list()) {
    if (!g.landed || Math.hypot(g.x - p.x, g.z - p.z) > PICKUP_R) continue;
    if (t - (claimAsked.get(g.id) ?? -1e9) < 2500) continue; // already asked: wait for the answer
    claimAsked.set(g.id, t);
    net.send({ type: 'claim', id: g.id });
  }
}

let lastSend = 0, wasMoving = false, mmT = 0, marketWelcomed = false;
renderer.setAnimationLoop(() => {
  const rawDt = clock.getDelta(), dt = Math.min(rawDt, 0.05), time = clock.elapsedTime;
  watchPerf(rawDt);
  if (fly) {
    const k = Math.min((performance.now() - fly.start) / 900, 1);
    const e = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
    const ang = fly.d * e, cs = Math.cos(ang), sn = Math.sin(ang);
    camera.position.set(controls.target.x + fly.base.x * cs + fly.base.z * sn, camera.position.y, controls.target.z - fly.base.x * sn + fly.base.z * cs);
    if (k >= 1) fly = null;
  }
  recorder.update(); // moves the camera while recording
  const moved = local.update(dt, camera);
  pickUpGifts();
  followCam.update(dt, moved); // after the avatar moved, so the camera does not lag a frame behind
  if (!recorder.active) controls.update();
  if (moved > 0) bus.emit('walk', moved);
  if (!marketWelcomed && local.g && Math.hypot(local.g.position.x - MARKET.x, local.g.position.z - MARKET.z) < MARKET.radius - 1) { marketWelcomed = true; toast(t('toast.market'), 5000); } // once per visit
  const t0 = performance.now();
  if ((moved > 0 || wasMoving) && t0 - lastSend > 100 && local.g) {
    lastSend = t0;
    net.send({ type: 'move', x: local.g.position.x, z: local.g.position.z });
  }
  wasMoving = moved > 0;

  if (!reduceMotion) env.update(time, dt);
  world2.update(time, dt);
  market.update(time, dt);
  minigames.update();
  tarot.update();
  tarotCaravan.update(time);
  trail.update(time);
  town.update(time);
  roads.update(time);
  npcs.update(time, dt, quiet);
  crowd.update(dt, time);
  wishers.update(dt, time);
  santa.update(dt);
  gifts.update(time);
  fireworks.update(dt);
  tree.update(time, dt, hovered);
  warm.intensity = 16 + (reduceMotion ? 0 : Math.sin(time * 3.1));
  placeTip();
  updateBubbles(camera);
  if (time - mmT > 0.1) { mmT = time; drawMinimap(); }
  composer.render();
  recorder.frame();
});
