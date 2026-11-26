import * as THREE from 'three';
import { terrainHeight } from './textures.js';
import { FERRIS, FERRIS_PAD, U as FERRIS_U } from './ferrislayout.js';
import { MARKET } from './marketlayout.js';
import { AVENUE } from '../shared/walk.js';

/**
 * "Follow" camera for joined players: behind and a little above the avatar.
 *  - Near the tree (the plaza) the usual far orbit camera is used.
 *  - Walking out past ENTER_R switches (smoothly) to the follow camera; coming back inside EXIT_R returns to the far camera.
 *    Two different radii so the view does not flicker back and forth at the boundary.
 *  - The camera button overrides the automatic choice until the player crosses a radius again.
 *
 * Third view, "area": on a landmark's pad (the Ferris wheel's boarding platform) the camera takes a wide shot of the whole landmark
 * with the avatar small in front of it (the follow camera is too close to look up at a 23-unit wheel and the far camera never
 * reaches that far from the tree). Arriving on the pad switches to it by itself, leaving switches back; the camera button flips
 * between "area" and "follow" while on the pad. Add a landmark: one entry in AREA_VIEWS.
 * Fourth view, "rail": a higher, farther follow camera for the lit avenue to the market, from the first arch of lights to the
 * market gate (so the glowing road and the square at its end are in the picture). The market itself gets the "area" overview.
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
const FOLLOW = { behind: BEHIND, up: UP, min: MIN_D, max: MAX_D };
const RAIL = { behind: 13, up: 6.5, min: 7, max: 22 }; // the lit avenue: farther back and higher, so the arches ahead and the market at the end show
const BLEND_S = 0.8;       // seconds for the transition
const SWING = 1.8;         // how fast the camera swings back behind a walking avatar (1/s)
const SWING_AFTER_DRAG = 1200; // ms to leave the camera alone after the player dragged it
const TREE = new THREE.Vector3(0, 3, 0); // what the far camera looks at (main.js: controls.target)
const LEAN = 0.55, LEAN_R = 19;           // the far camera leans towards a joined player: up to LEAN * LEAN_R units off the tree

/** Wide shots. test(): is the player on the landmark's spot (wasIn = a little more room to leave, so it does not flicker). */
const AREA_VIEWS = [{
  id: 'ferris',
  test: (x, z, wasIn) => Math.hypot(x - FERRIS_PAD.x, z - FERRIS_PAD.z) < FERRIS_PAD.radius + (wasIn ? 1.4 : 0.2),
  x: FERRIS.x, z: FERRIS.z, dir: [-FERRIS_U.x, -FERRIS_U.z], // look at the wheel from the plaza side
  ty: 9.5, cy: 5,       // look-at height (a bit below the hub so the base shows) and camera height: a slight look UP at the wheel
  w: 24, h: 26,         // what must fit in the picture: the wheel (scaled) and its legs
  dMin: 22, dMax: 30,   // camera distance from the wheel (the tree stands 42 behind the wheel: do not go through it)
}, {
  id: 'market',
  test: (x, z, wasIn) => Math.hypot(x - MARKET.x, z - MARKET.z) < MARKET.radius + (wasIn ? 0.5 : -1),
  x: MARKET.x, z: MARKET.z, dir: [Math.sin(MARKET.ry), Math.cos(MARKET.ry)], // from the square's centre towards the gate and the tree
  ty: 3, cy: 19,        // look-at height (stall roofs) and a high camera back on the avenue: the whole square, the pyramid and the clock tower
  w: 44, h: 20,         // the square is 44 across
  dMin: 36, dMax: 38,   // far enough back that the avatar is already in the picture when it passes the gate
  polar: [0.12 * Math.PI, 0.41 * Math.PI], // never lower than ~16 degrees above the horizon: the houses round the square stay below the camera
  span: 0.9,            // swing +-0.9 rad round the gate side only (the forest and houses stand behind the clock tower)
}, {
  id: 'avenue',
  rail: true,           // the lit avenue: a high, long follow camera instead of a fixed shot
  test: (x, z, wasIn) => {
    const along = x * AVENUE.x + z * AVENUE.z, across = Math.abs(x * AVENUE.z - z * AVENUE.x); // along the avenue / distance from its centre line
    return along > (wasIn ? 20.5 : 22.5) && across < (wasIn ? 6.2 : 4.6) && along < AVENUE.r1 + 4; // from the first arch of lights (r = 24)
  },
}];
const AREA_POLAR = Math.PI * 0.58; // the camera may sit a little BELOW the look-at point here (the usual limit is 0.49 pi)
const ease = (k) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2);
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const smooth = (a, b, x) => { const k = Math.min(Math.max((x - a) / (b - a), 0), 1); return k * k * (3 - 2 * k); };
/** How far the far camera's look-at point slides from the tree towards a player standing r units from it. */
const leanFor = (r) => LEAN * LEAN_R * smooth(4, LEAN_R, r);

export function createFollowCam({ camera, controls, local, isBusy }) {
  let auto = 'orbit';            // what the position alone says: 'orbit' | 'follow' | 'area' (with hysteresis)
  let override = null;           // the player's choice from the camera button: null | 'orbit' | 'follow' | 'area'
  let lastMode = 'orbit', goalMode = 'follow'; // the mode last announced / the one the camera is heading to while controlled
  let areaId = null, area = null; // the landmark the player stands on, and its current wide shot
  let prof = FOLLOW;             // the follow camera's numbers for the current goal ('follow' or 'rail')
  let blend = 0;                 // 0 = far orbit camera, 1 = follow camera
  let controlled = false;        // true while this module owns the camera (blend > 0 or about to be)
  let settled = false;           // blend == 1 and the player is steering the camera with OrbitControls
  let lastWant = false;
  let dragging = false, lastDrag = -1e9;
  const farMin = controls.minDistance, farMax = controls.maxDistance, farPolar = controls.maxPolarAngle; // the far camera's limits (main.js)
  let returning = false;         // the follow -> far transition has been planned
  const saved = { pos: new THREE.Vector3(), target: new THREE.Vector3() };
  const orbitOffset = new THREE.Vector3();     // the far camera relative to its target (fixed while following)
  const goalOffset = new THREE.Vector3();      // the goal camera relative to its look-at point (live while settled)
  const goalTarget = new THREE.Vector3();      // the goal look-at point: the avatar's chest (follow) or the landmark (area)
  const chest = new THREE.Vector3(), tmp = new THREE.Vector3(), tgt = new THREE.Vector3();
  const listeners = [];
  const emit = (want, byUser, mode) => listeners.forEach((f) => f(want, byUser, mode));
  const freeLimits = () => { controls.minDistance = 0; controls.maxDistance = 1000; controls.minPolarAngle = 0; controls.maxPolarAngle = Math.PI; controls.minAzimuthAngle = -Infinity; controls.maxAzimuthAngle = Infinity; }; // while a transition moves the camera by hand

  controls.addEventListener('start', () => { dragging = true; lastDrag = performance.now(); });
  controls.addEventListener('end', () => { dragging = false; lastDrag = performance.now(); });

  const currentMode = () => override ?? auto;
  const setChest = (g) => chest.set(g.position.x, terrainHeight(g.position.x, g.position.z) + TARGET_H, g.position.z); // the ground rises near the ski slope

  /** where the goal camera should be for this mode (the avatar's side for 'follow', the wide shot for 'area') */
  function setGoal(mode) {
    goalMode = mode;
    if (mode === 'area' && area) {
      const vf = (camera.fov * Math.PI) / 180, tanV = Math.tan(vf / 2), tanH = tanV * camera.aspect;
      const D = Math.min(area.dMax, Math.max(area.dMin, 1.12 * Math.max(area.h / 2 / tanV, area.w / 2 / tanH))); // far enough to fit it all, but not through the tree
      goalOffset.set(area.dir[0] * D, area.cy - area.ty, area.dir[1] * D);
      const dist = Math.hypot(D, goalOffset.y); // the real camera distance (it also has the height)
      area.cur = { min: D * 0.35, max: Math.max(D * 1.1, dist * 1.08), az: Math.atan2(area.dir[0], area.dir[1]) };
    } else {
      goalMode = mode === 'rail' ? 'rail' : 'follow';
      prof = goalMode === 'rail' ? RAIL : FOLLOW;
      const ry = local.g ? local.g.rotation.y : 0; // the avatar faces (sin ry, cos ry): put the camera on the opposite side
      goalOffset.set(-Math.sin(ry) * prof.behind, prof.up, -Math.cos(ry) * prof.behind);
    }
  }
  function begin(mode) {
    controlled = true; settled = false;
    saved.pos.copy(camera.position); saved.target.copy(controls.target);
    orbitOffset.copy(saved.pos).sub(saved.target);
    controls.autoRotate = false; returning = false;
    setGoal(mode);
  }
  /** follow <-> area while already controlling the camera: fly from wherever it is now */
  function retarget(mode) {
    saved.target.copy(controls.target); orbitOffset.copy(camera.position).sub(controls.target);
    blend = 0; settled = false; returning = false;
    setGoal(mode);
  }
  function end() {
    controlled = false; settled = false; blend = 0; returning = false;
    controls.enabled = true;
    controls.minDistance = farMin; controls.maxDistance = farMax - Math.hypot(saved.target.x - TREE.x, saved.target.z - TREE.z);
    controls.minPolarAngle = 0; controls.maxPolarAngle = farPolar; controls.minAzimuthAngle = -Infinity; controls.maxAzimuthAngle = Infinity;
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
    if (lastWant && stay) { lastWant = false; lastMode = 'orbit'; emit(false, false, 'orbit'); }
  }

  function update(dt, moved = 0) {
    const g = local.g;
    if (g && !isBusy()) controls.autoRotate = false; // a slowly spinning camera makes "forward" drift while you steer
    if (!g || isBusy()) { if (controlled) end(); return; }
    const r = Math.hypot(g.position.x, g.position.z), prev = auto;
    const onArea = AREA_VIEWS.find((a) => a.test(g.position.x, g.position.z, a.id === areaId)) ?? null;
    const prevAreaId = areaId;
    areaId = onArea?.id ?? null; area = onArea ?? area; // (keep the last one while leaving: the way back still needs its numbers)
    if (areaId !== prevAreaId) override = null; // stepping on / off a landmark: the automatic choice again (a manual wide shot ends when you leave)
    if (onArea && !onArea.manual) auto = onArea.rail ? 'rail' : 'area';
    else if (auto === 'area' || auto === 'rail') auto = r >= EXIT_R ? 'follow' : 'orbit'; // (reached only after a landmark view ended)
    else if (auto === 'orbit' && r >= ENTER_R) auto = 'follow';
    else if (auto === 'follow' && r < EXIT_R) auto = 'orbit';
    if (auto !== prev) override = null; // crossing a radius or stepping on / off a pad hands control back to the automatic choice
    const mode = currentMode(), want = mode !== 'orbit';
    if (mode !== lastMode) { lastMode = mode; lastWant = want; emit(want, auto === prev, mode); }
    if (want && !controlled) begin(mode);
    if (!controlled) { leanFar(g, r, dt); return; }
    if (want) { returning = false; if (mode !== goalMode) retarget(mode); }
    else if (!returning) { returning = true; planReturn(g); }

    const goal = want ? 1 : 0;
    blend += Math.sign(goal - blend) * Math.min(Math.abs(goal - blend), dt / BLEND_S);
    if (!want && blend <= 0) { end(); return; }
    setChest(g);
    if (goalMode === 'area' && area) goalTarget.set(area.x, area.ty, area.z); else goalTarget.copy(chest);

    if (blend >= 1 && want && goalMode === 'area') {
      /* settled on the wide shot: the look-at point stays on the landmark and the player orbits / zooms around it */
      if (!settled) {
        settled = true; controls.enabled = true;
        controls.minDistance = area.cur.min; controls.maxDistance = area.cur.max;
        controls.minPolarAngle = area.polar?.[0] ?? 0; controls.maxPolarAngle = area.polar?.[1] ?? AREA_POLAR;
        const span = area.span ?? 1.15;
        controls.minAzimuthAngle = Math.max(-Math.PI, area.cur.az - span); controls.maxAzimuthAngle = Math.min(Math.PI, area.cur.az + span); // stay on the plaza side of the landmark (houses and forest behind it)
      }
      controls.target.copy(goalTarget);
      goalOffset.copy(camera.position).sub(controls.target); // remember where the player put it
    } else if (blend >= 1 && want) {
      /* settled: the player steers with OrbitControls; we only keep the target on the avatar and the camera behind it */
      if (!settled) { settled = true; controls.enabled = true; controls.minDistance = prof.min; controls.maxDistance = prof.max; controls.minPolarAngle = 0; controls.maxPolarAngle = farPolar; controls.minAzimuthAngle = -Infinity; controls.maxAzimuthAngle = Infinity; }
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
      const pr = Math.hypot(chest.x, chest.z), lim = pr < 33 && goalMode !== 'rail' ? MAX_CAM_R : pr + prof.behind + 4;
      const cr = Math.hypot(camera.position.x, camera.position.z);
      if (cr > lim) { camera.position.x *= lim / cr; camera.position.z *= lim / cr; }
      goalOffset.copy(camera.position).sub(chest); // remember where the player put it, for the way back
    } else {
      /* transition: blend the far camera and the goal camera (target and offset separately) */
      if (settled || controls.enabled) { settled = false; controls.enabled = false; freeLimits(); }
      const k = ease(blend);
      tgt.lerpVectors(saved.target, goalTarget, k);
      tmp.lerpVectors(orbitOffset, goalOffset, k);
      controls.target.copy(tgt);
      camera.position.copy(tgt).add(tmp);
    }
  }

  /** Hand the camera to someone else (the Ferris wheel ride) WITHOUT moving it; when they are done, update() flies it back behind the avatar. */
  function release() {
    if (!controlled) return;
    controlled = false; settled = false; blend = 0; returning = false;
    controls.enabled = true; freeLimits();
  }

  return {
    update,
    exitNow,
    release,
    /** The camera button: flip the current view; the choice lasts until the player crosses a radius or a pad again.
     *  On a landmark's pad it flips wide shot <-> behind the avatar; elsewhere far view <-> behind the avatar. */
    toggle() {
      const m = currentMode();
      const here = AREA_VIEWS.find((a) => a.id === areaId), special = here?.rail ? 'rail' : 'area'; // this spot's own view
      override = areaId ? (m === special ? 'follow' : special) : (m === 'follow' ? 'orbit' : 'follow');
      return override !== 'orbit';
    },
    onChange(fn) { listeners.push(fn); },
    get controlled() { return controlled; },
    get wanted() { return lastWant; },
    get blend() { return blend; },
    get settled() { return settled; },
  };
}
