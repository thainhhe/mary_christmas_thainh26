import * as THREE from 'three';
import { terrainHeight } from './textures.js';

/**
 * "Follow" camera for joined players: behind and a little above the avatar.
 *  - Near the tree (the plaza) the usual far orbit camera is used.
 *  - Walking out past ENTER_R switches (smoothly) to the follow camera; coming back inside EXIT_R returns to the far camera.
 *    Two different radii so the view does not flicker back and forth at the boundary.
 *  - The camera button overrides the automatic choice until the player crosses a radius again.
 *
 * It reuses OrbitControls (drag = orbit around the avatar, pinch / wheel = zoom within MIN_D..MAX_D); only the target moves
 * to the avatar. While it moves, the camera is translated with the target (OrbitControls alone would keep the old position),
 * and when the avatar walks the camera swings back behind it unless the player has just dragged.
 */
export const ENTER_R = 22;
export const EXIT_R = 19;
const MAX_CAM_R = 35;      // the first houses stand at r=38: keep the camera in front of them
const BEHIND = 5.2, UP = 2.4, TARGET_H = 1.3; // camera offset from the look-at point, and the look-at height (about the avatar's chest)
const MIN_D = 3, MAX_D = 9;
const BLEND_S = 0.8;       // seconds for the transition
const SWING = 1.8;         // how fast the camera swings back behind a walking avatar (1/s)
const SWING_AFTER_DRAG = 1200; // ms to leave the camera alone after the player dragged it
const TREE = new THREE.Vector3(0, 3, 0); // what the far camera looks at (main.js: controls.target)
const LEAN = 0.55, LEAN_R = 19;           // the far camera leans towards a joined player: up to LEAN * LEAN_R units off the tree

const ease = (k) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2);
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const smooth = (a, b, x) => { const k = Math.min(Math.max((x - a) / (b - a), 0), 1); return k * k * (3 - 2 * k); };
/** How far the far camera's look-at point slides from the tree towards a player standing r units from it. */
const leanFor = (r) => LEAN * LEAN_R * smooth(4, LEAN_R, r);

export function createFollowCam({ camera, controls, local, isBusy }) {
  let auto = 'orbit';            // what the position alone says: 'orbit' | 'follow' (with hysteresis)
  let override = null;           // the player's choice from the camera button: null | 'orbit' | 'follow'
  let blend = 0;                 // 0 = far orbit camera, 1 = follow camera
  let controlled = false;        // true while this module owns the camera (blend > 0 or about to be)
  let settled = false;           // blend == 1 and the player is steering the camera with OrbitControls
  let lastWant = false;
  let dragging = false, lastDrag = -1e9;
  const farMin = controls.minDistance, farMax = controls.maxDistance; // the far camera's zoom limits (main.js)
  let returning = false;         // the follow -> far transition has been planned
  const saved = { pos: new THREE.Vector3(), target: new THREE.Vector3() };
  const orbitOffset = new THREE.Vector3();     // the far camera relative to its target (fixed while following)
  const followOffset = new THREE.Vector3();    // the follow camera relative to the avatar's chest (live while settled)
  const chest = new THREE.Vector3(), tmp = new THREE.Vector3(), tgt = new THREE.Vector3();
  const listeners = [];
  const emit = (want, byUser) => listeners.forEach((f) => f(want, byUser));

  controls.addEventListener('start', () => { dragging = true; lastDrag = performance.now(); });
  controls.addEventListener('end', () => { dragging = false; lastDrag = performance.now(); });

  const wantFollow = () => (override ?? auto) === 'follow';
  const setChest = (g) => chest.set(g.position.x, terrainHeight(g.position.x, g.position.z) + TARGET_H, g.position.z); // the ground rises near the ski slope

  function begin() {
    controlled = true; settled = false;
    saved.pos.copy(camera.position); saved.target.copy(controls.target);
    orbitOffset.copy(saved.pos).sub(saved.target);
    controls.autoRotate = false; returning = false;
    const ry = local.g ? local.g.rotation.y : 0; // the avatar faces (sin ry, cos ry): put the camera on the opposite side
    followOffset.set(-Math.sin(ry) * BEHIND, UP, -Math.cos(ry) * BEHIND);
  }
  function end() {
    controlled = false; settled = false; blend = 0; returning = false;
    controls.enabled = true;
    controls.minDistance = farMin; controls.maxDistance = farMax - Math.hypot(saved.target.x - TREE.x, saved.target.z - TREE.z);
    controls.target.copy(saved.target); camera.position.copy(saved.pos);
    controls.update();
  }
  /**
   * Where the far camera goes when the player comes back: ON THE PLAYER'S SIDE of the tree, so the avatar stands between
   * the camera and the tree, in view and walking the same way "forward" means for the controls. (The old position was
   * wherever the player had left the far camera, often the opposite side: the avatar ended up behind the camera.)
   */
  function planReturn(g) {
    const px = g.position.x, pz = g.position.z, r = Math.hypot(px, pz), prevH = Math.hypot(orbitOffset.x, orbitOffset.z);
    let ux, uz;
    if (r > 4) { ux = px / r; uz = pz / r; } else if (prevH > 0.01) { ux = orbitOffset.x / prevH; uz = orbitOffset.z / prevH; } else { ux = 0; uz = 1; }
    const m = leanFor(r), maxD = farMax - m;
    saved.target.set(TREE.x + ux * m, TREE.y, TREE.z + uz * m);
    const h = Math.min(Math.max(prevH, 16), maxD * 0.94), v = Math.min(Math.max(orbitOffset.y, 6), maxD * 0.34); // keep the zoom the player had, within the limits
    orbitOffset.set(ux * h, v, uz * h);
    saved.pos.copy(saved.target).add(orbitOffset);
  }
  /** Far camera + a joined player: keep the avatar in the picture (the look-at point slides a little towards it). */
  function leanFar(g, r, dt) {
    if (controls.maxDistance > 100) return; // the ?cam debug camera
    const m = leanFor(r), ux = r > 1e-3 ? g.position.x / r : 0, uz = r > 1e-3 ? g.position.z / r : 0;
    const k = 1 - Math.exp(-3 * dt);
    const dx = (TREE.x + ux * m - controls.target.x) * k, dz = (TREE.z + uz * m - controls.target.z) * k;
    controls.target.x += dx; controls.target.z += dz; camera.position.x += dx; camera.position.z += dz; // the camera moves with its target
    controls.maxDistance = farMax - Math.hypot(controls.target.x - TREE.x, controls.target.z - TREE.z); // never further than 33 from the tree: nothing blocks it
  }
  /** Give the camera back to the far orbit camera right now. stay = keep it until the player crosses a radius again. */
  function exitNow(stay = false) {
    if (stay) override = 'orbit';
    if (controlled) end();
    if (lastWant && stay) { lastWant = false; emit(false, false); }
  }

  function update(dt, moved = 0) {
    const g = local.g;
    if (g && !isBusy()) controls.autoRotate = false; // a slowly spinning camera makes "forward" drift while you steer
    if (!g || isBusy()) { if (controlled) end(); return; }
    const r = Math.hypot(g.position.x, g.position.z), prev = auto;
    if (auto === 'orbit' && r >= ENTER_R) auto = 'follow';
    else if (auto === 'follow' && r < EXIT_R) auto = 'orbit';
    if (auto !== prev) override = null; // crossing a radius hands control back to the automatic choice
    const want = wantFollow();
    if (want !== lastWant) { lastWant = want; emit(want, auto === prev); }
    if (want && !controlled) begin();
    if (!controlled) { leanFar(g, r, dt); return; }
    if (want) returning = false;
    else if (!returning) { returning = true; planReturn(g); }

    const goal = want ? 1 : 0;
    blend += Math.sign(goal - blend) * Math.min(Math.abs(goal - blend), dt / BLEND_S);
    if (!want && blend <= 0) { end(); return; }
    setChest(g);

    if (blend >= 1 && want) {
      /* settled: the player steers with OrbitControls; we only keep the target on the avatar and the camera behind it */
      if (!settled) { settled = true; controls.enabled = true; controls.minDistance = MIN_D; controls.maxDistance = MAX_D; }
      tmp.subVectors(chest, controls.target); // move the camera together with its target
      camera.position.add(tmp); controls.target.copy(chest);
      if (moved > 0 && !dragging && performance.now() - lastDrag > SWING_AFTER_DRAG) {
        const ox = camera.position.x - chest.x, oz = camera.position.z - chest.z, rad = Math.hypot(ox, oz);
        if (rad > 0.01) {
          const cur = Math.atan2(ox, oz), want2 = wrap(g.rotation.y + Math.PI);
          const a = cur + wrap(want2 - cur) * (1 - Math.exp(-SWING * dt));
          camera.position.x = chest.x + Math.sin(a) * rad; camera.position.z = chest.z + Math.cos(a) * rad;
        }
      }
      // keep the camera in front of the houses (r=38+) while the player is on the plaza side; out on the avenue / in the
      // Square the player is already past them (those spots are cleared of houses), so let the camera follow
      const pr = Math.hypot(chest.x, chest.z), lim = pr < 33 ? MAX_CAM_R : pr + BEHIND + 4;
      const cr = Math.hypot(camera.position.x, camera.position.z);
      if (cr > lim) { camera.position.x *= lim / cr; camera.position.z *= lim / cr; }
      followOffset.copy(camera.position).sub(chest); // remember where the player put it, for the way back
    } else {
      /* transition: blend the far camera and the follow camera (target and offset separately) */
      if (settled || controls.enabled) { settled = false; controls.enabled = false; controls.minDistance = 0; controls.maxDistance = 1000; }
      const k = ease(blend);
      tgt.lerpVectors(saved.target, chest, k);
      tmp.lerpVectors(orbitOffset, followOffset, k);
      controls.target.copy(tgt);
      camera.position.copy(tgt).add(tmp);
    }
  }

  return {
    update,
    exitNow,
    /** The camera button: flip the current view; the choice lasts until the player crosses a radius again. */
    toggle() { override = wantFollow() ? 'orbit' : 'follow'; return override === 'follow'; },
    onChange(fn) { listeners.push(fn); },
    get controlled() { return controlled; },
    get wanted() { return lastWant; },
    get blend() { return blend; },
    get settled() { return settled; },
  };
}
