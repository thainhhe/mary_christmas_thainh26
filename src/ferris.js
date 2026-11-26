import * as THREE from 'three';
import { $ } from './state.js';
import { t, onLang } from './i18n.js';
import { makeGlow, terrainHeight } from './textures.js';
import { bulbSet } from './env.js';
import { FERRIS_PAD, BOARD, KIOSK, SIGN, U } from './ferrislayout.js';
import { track } from './analytics.js';

/**
 * The Ferris wheel is now rideable. A small boarding pad (a low wooden platform, a ticket booth and a lit sign) leads up to it
 * from the plaza; standing on the pad near the wheel shows a "Ride the Ferris wheel" button. The ride takes one full turn
 * (about 40 seconds): the avatar is hidden and the camera sits INSIDE a gondola looking out over the village; drag to look
 * around (OrbitControls is switched off for the ride, the look-around is done here); "Get off" brings the gondola down quickly.
 * Rides are only local (other players keep seeing the avatar on the pad).
 */
const RIDE_SPEED = 0.17;      // rad/s while riding (the idle wheel turns at 0.07)
const LAND_SPEED = 0.75;      // rad/s after "Get off"
const FLY_IN_S = 1.4;         // seconds the camera takes to settle into the gondola
const EYE = 0.35;             // eye height above the gondola's middle
const TAU = Math.PI * 2;
const std = (color, rough = 0.8, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: rough, ...extra });
const gy = terrainHeight;

/** The platform, ticket booth and sign. Returns an updater for the twinkling bulbs. */
export function buildFerrisPad(scene) {
  const g = new THREE.Group();
  const cx = FERRIS_PAD.x, cz = FERRIS_PAD.z, y0 = gy(cx, cz);
  const face = Math.atan2(-U.x, -U.z); // looking from the wheel towards the tree = the way riders arrive
  const snow = std('#f4f8ff', 0.9);

  const deck = new THREE.Mesh(new THREE.CylinderGeometry(3.9, 4.0, 0.16, 40), std('#6a4a33', 0.85));
  deck.position.set(cx, y0 + 0.08, cz);
  const top = new THREE.Mesh(new THREE.CylinderGeometry(3.3, 3.3, 0.02, 40), std('#8a6445', 0.9)); top.position.set(cx, y0 + 0.17, cz);
  g.add(deck, top);

  // a ring of warm and coloured bulbs round the platform's edge
  const N = 36, pts = [];
  for (let i = 0; i < N; i++) { const a = (i / N) * TAU; pts.push(new THREE.Vector3(cx + Math.cos(a) * 3.85, y0 + 0.3, cz + Math.sin(a) * 3.85)); }
  const cols = ['#ffd166', '#ff6b6b', '#8ee08e', '#6bc8ff'].map((c) => new THREE.Color(c).multiplyScalar(1.5));
  const bulbs = bulbSet(pts, (i) => cols[i % 4], 0.09);
  g.add(bulbs.mesh);

  // ticket booth, its window facing the middle of the pad
  const kiosk = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(1.9, 2.1, 1.5), std('#a82a35', 0.6, { emissive: '#2a0509', emissiveIntensity: 0.5 })); body.position.y = 1.05;
  const roof = new THREE.Mesh(new THREE.ConeGeometry(1.75, 0.95, 4), snow); roof.rotation.y = Math.PI / 4; roof.position.y = 2.55; roof.scale.set(1, 1, 0.82);
  const win = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 0.7), new THREE.MeshBasicMaterial({ color: new THREE.Color(2.6, 1.8, 0.8), toneMapped: false })); win.position.set(0, 1.25, 0.76);
  const counter = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.1, 0.4), std('#e8d7b8', 0.7)); counter.position.set(0, 0.85, 0.95);
  const glow = makeGlow(new THREE.Color(1.2, 0.75, 0.3), 2.6, 2.6, 0.55); glow.position.set(0, 1.25, 1.4);
  kiosk.add(body, roof, win, counter, glow);
  kiosk.position.set(KIOSK[0], y0 + 0.16, KIOSK[1]);
  kiosk.rotation.y = Math.atan2(cx - KIOSK[0], cz - KIOSK[1]);
  g.add(kiosk);

  // a lit sign on a post, facing the people walking up from the plaza
  const cv = document.createElement('canvas'); cv.width = 512; cv.height = 192;
  const c = cv.getContext('2d');
  c.fillStyle = '#1a1d2e'; c.fillRect(0, 0, 512, 192);
  c.strokeStyle = '#f7b955'; c.lineWidth = 8; c.strokeRect(6, 6, 500, 180);
  c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillStyle = '#f7d77a';
  let fs = 76; c.font = `900 ${fs}px "Times New Roman", Times, serif`;
  while (c.measureText(t('fw.sign')).width > 450 && fs > 30) { fs -= 4; c.font = `900 ${fs}px "Times New Roman", Times, serif`; } // fit the longer English text
  c.fillText(t('fw.sign'), 256, 84);
  c.font = '64px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif'; c.fillText('🎡', 256, 150);
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
  const sign = new THREE.Group();
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 2.6, 8), std('#3a2a1e', 0.8)); post.position.y = 1.3;
  const board = new THREE.Mesh(new THREE.PlaneGeometry(1.9, 0.72), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false, color: new THREE.Color(0.95, 0.95, 0.95), side: THREE.DoubleSide })); board.position.y = 2.7;
  const cap = new THREE.Mesh(new THREE.SphereGeometry(0.11, 10, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(2.2, 1.6, 0.6), toneMapped: false })); cap.position.y = 3.15;
  sign.add(post, board, cap);
  sign.position.set(SIGN[0], y0 + 0.16, SIGN[1]);
  sign.rotation.y = face;
  g.add(sign);

  scene.add(g);
  return { update: (time) => bulbs.update(time, 1.3, 2.4) };
}

export function initFerris({ ferris, camera, controls, local, followCam, getPlayer, isBlocked }) {
  const btn = $('ferris-btn'), hud = $('ferris-hud'), hudText = $('ferris-text'), downBtn = $('ferris-down');
  let near = false, phase = 'idle'; // 'idle' | 'in' (camera settling) | 'ride'
  let car = 0, acc = 0, landing = false, tIn = 0;
  const saved = { pos: new THREE.Vector3(), target: new THREE.Vector3(), min: 0, max: 1000, wasFollow: false };
  const P = new THREE.Vector3(), want = new THREE.Vector3(), tmp = new THREE.Vector3();
  const euler = new THREE.Euler(), qWant = new THREE.Quaternion();
  const look = { yaw: Math.atan2(U.x, U.z), pitch: -0.08 }; // starts looking from the wheel towards the tree and the plaza
  let drag = null;

  /** world position of the gondola's middle (the pivot hangs at the rim; the car is below it) */
  function carPos(i, out) { return ferris.pivots[i].localToWorld(out.set(0, -0.8, 0)); }

  function begin() {
    if (phase !== 'idle' || !local.g || isBlocked()) return;
    saved.pos.copy(camera.position); saved.target.copy(controls.target);
    saved.min = controls.minDistance; saved.max = controls.maxDistance; saved.wasFollow = followCam.wanted;
    followCam.release(); // hand the camera over without moving it
    local.route = null; local.target = null; local.keys?.clear();
    local.g.visible = false;
    ferris.root.updateMatrixWorld(true);
    let best = 1e9; // board the gondola that is lowest right now
    ferris.pivots.forEach((_, i) => { const y = carPos(i, tmp).y; if (y < best) { best = y; car = i; } });
    acc = 0; landing = false; tIn = 0; phase = 'in';
    ferris.riding = true;
    controls.enabled = false; controls.autoRotate = false; controls.minDistance = 0; controls.maxDistance = 1000;
    look.yaw = Math.atan2(U.x, U.z); look.pitch = -0.08; drag = null;
    btn.hidden = true; hud.hidden = false; downBtn.disabled = false; render();
    track('ferris_ride');
  }

  function end() {
    if (phase === 'idle') return;
    phase = 'idle'; ferris.riding = false;
    hud.hidden = true;
    if (local.g) local.g.visible = true;
    local.keys?.clear();
    controls.enabled = true;
    if (saved.wasFollow) { // the follow camera flies back behind the avatar by itself: give OrbitControls a target in front of the camera
      controls.minDistance = 0; controls.maxDistance = 1000;
      camera.getWorldDirection(tmp); controls.target.copy(camera.position).addScaledVector(tmp, 6);
    } else { camera.position.copy(saved.pos); controls.target.copy(saved.target); controls.minDistance = saved.min; controls.maxDistance = saved.max; controls.update(); }
  }

  function render() {
    btn.textContent = `🎡 ${t('fw.btn')}`;
    downBtn.textContent = t('fw.down');
    if (phase !== 'idle') hudText.textContent = landing ? t('fw.landing') : t('fw.hud', { n: Math.max(1, Math.ceil((TAU - acc) / RIDE_SPEED)) });
  }
  btn.addEventListener('click', begin);
  downBtn.addEventListener('click', () => { if (phase !== 'idle' && !landing) { landing = true; downBtn.disabled = true; render(); } });
  addEventListener('keydown', (e) => { if (e.key === 'Escape' && phase !== 'idle' && !landing) { landing = true; downBtn.disabled = true; render(); } });
  onLang(render);
  render();

  /* drag to look around (mouse or one finger) */
  const el = controls.domElement;
  el.addEventListener('pointerdown', (e) => { if (phase === 'ride' && !drag) drag = { id: e.pointerId, x: e.clientX, y: e.clientY }; });
  el.addEventListener('pointermove', (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    look.yaw += (e.clientX - drag.x) * 0.005; look.pitch = Math.max(-1.2, Math.min(1.0, look.pitch + (e.clientY - drag.y) * 0.005));
    drag.x = e.clientX; drag.y = e.clientY;
  });
  const drop = (e) => { if (drag && e.pointerId === drag.id) drag = null; };
  el.addEventListener('pointerup', drop); el.addEventListener('pointercancel', drop);

  return {
    get active() { return phase !== 'idle'; },
    /** leave at once (e.g. the player starts a video): the avatar reappears on the pad */
    stop: end,
    update(dt) {
      if (phase === 'idle') { // the boarding button
        const p = getPlayer();
        const was = near;
        near = !!p && !isBlocked() && Math.hypot(p.x - BOARD.x, p.z - BOARD.z) < (was ? 3.8 : 3.2);
        btn.hidden = !near;
        return;
      }
      if (!local.g) { end(); return; }
      /* turn the wheel: slow start, one full turn, slow stop */
      const remaining = TAU - acc;
      const base = landing ? LAND_SPEED : RIDE_SPEED;
      const speed = Math.max(0.05, Math.min(base, base * (0.25 + acc / 0.6), base * (0.2 + remaining / 0.7)));
      const step = Math.min(speed * dt, remaining);
      acc += step; ferris.wheel.rotation.z += step;
      ferris.pivots.forEach((p) => { p.rotation.z = -ferris.wheel.rotation.z; }); // keep the gondolas level even when the wheel's own update is off
      ferris.root.updateMatrixWorld(true);
      carPos(car, P);
      if (!landing) { const n = Math.max(1, Math.ceil((TAU - acc) / RIDE_SPEED)); if (hudText.dataset.n !== String(n)) { hudText.dataset.n = String(n); render(); } }
      if (acc >= TAU - 1e-4) { end(); return; }

      want.set(P.x, P.y + EYE, P.z);
      qWant.setFromEuler(euler.set(look.pitch, look.yaw, 0, 'YXZ'));
      if (phase === 'in') {
        tIn += dt;
        const k = 1 - Math.exp(-4 * dt);
        camera.position.lerp(want, k); camera.quaternion.slerp(qWant, k);
        if (tIn >= FLY_IN_S) phase = 'ride';
      } else { camera.position.copy(want); camera.quaternion.copy(qWant); } // inside the gondola, looking where the player dragged
    },
  };
}
