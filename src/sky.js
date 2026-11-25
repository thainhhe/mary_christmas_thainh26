import * as THREE from 'three';
import { makeGlow, flakeTex } from './textures.js';
import { cylinderBetween } from './env.js';

const std = (color, rough = 0.7, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: rough, ...extra });

/* ---------- Santa's sleigh ---------- */
/** Approximate local length of sleigh + reindeer team; used to size the whole thing on screen. */
const SPAN = 11;

const UNIT = {
  sphere: new THREE.SphereGeometry(1, 14, 10),
  cyl: new THREE.CylinderGeometry(1, 1, 1, 6),
  cone: new THREE.ConeGeometry(1, 1, 8),
  box: new THREE.BoxGeometry(1, 1, 1),
};
const Y_AXIS = new THREE.Vector3(0, 1, 0);
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const glowy = (c, k = 0.5) => ({ emissive: c, emissiveIntensity: k });
/** Ellipsoid (shared unit sphere scaled). */
const ell = (mat, sx, sy, sz, x = 0, y = 0, z = 0) => { const m = new THREE.Mesh(UNIT.sphere, mat); m.scale.set(sx, sy, sz); m.position.set(x, y, z); return m; };
const cube = (mat, sx, sy, sz, x = 0, y = 0, z = 0) => { const m = new THREE.Mesh(UNIT.box, mat); m.scale.set(sx, sy, sz); m.position.set(x, y, z); return m; };
/** Thin cylinder from a to b. */
const bar = (a, b, r, mat) => {
  const d = new THREE.Vector3().subVectors(b, a), m = new THREE.Mesh(UNIT.cyl, mat);
  m.position.copy(a).addScaledVector(d, 0.5); m.scale.set(r, d.length(), r); m.quaternion.setFromUnitVectors(Y_AXIS, d.normalize());
  return m;
};
const tube = (pts, r, mat) => new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 28, r, 6), mat);

function buildReindeer(M, rudolph) {
  const d = new THREE.Group(), legs = [];
  d.add(ell(M.brown, 0.62, 0.3, 0.27));
  d.add(ell(M.cream, 0.42, 0.2, 0.25, 0.08, -0.12, 0));
  d.add(bar(V(0.45, 0.1, 0), V(0.78, 0.5, 0), 0.14, M.brown));
  const head = new THREE.Group(); head.position.set(0.88, 0.58, 0); head.rotation.z = -0.2; d.add(head);
  head.add(ell(M.brown, 0.2, 0.16, 0.15), ell(M.brown2, 0.14, 0.1, 0.1, 0.17, -0.05, 0));
  if (rudolph) {
    head.add(ell(M.rNose, 0.07, 0.07, 0.07, 0.29, -0.03, 0));
    const gl = makeGlow('#ff4030', 1.1, 1.1, 0.95); gl.position.set(0.3, -0.03, 0); head.add(gl); d.userData.nose = gl;
  } else head.add(ell(M.dark, 0.045, 0.04, 0.045, 0.29, -0.03, 0));
  for (const s of [1, -1]) {
    head.add(ell(M.dark, 0.03, 0.035, 0.03, 0.1, 0.07, s * 0.11));
    const ear = new THREE.Mesh(UNIT.cone, M.brown); ear.scale.set(0.05, 0.2, 0.04); ear.position.set(-0.04, 0.17, s * 0.12); ear.rotation.x = s * 0.9; head.add(ear);
    head.add(bar(V(-0.03, 0.15, s * 0.07), V(-0.12, 0.52, s * 0.2), 0.022, M.antler));
    head.add(bar(V(-0.08, 0.34, s * 0.14), V(0.06, 0.5, s * 0.2), 0.018, M.antler));
    head.add(bar(V(-0.11, 0.46, s * 0.19), V(-0.28, 0.62, s * 0.26), 0.018, M.antler));
  }
  for (const [x, front] of [[0.4, true], [-0.4, false]]) for (const z of [-0.13, 0.13]) {
    const l = new THREE.Group(); l.position.set(x, -0.15, z);
    l.add(bar(V(0, 0, 0), V(0, -0.28, 0), 0.055, M.brown), bar(V(0, -0.28, 0), V(0, -0.55, 0), 0.04, M.brown), ell(M.dark, 0.05, 0.035, 0.05, 0, -0.57, 0));
    d.add(l); legs.push({ g: l, front });
  }
  d.add(ell(M.white, 0.08, 0.09, 0.08, -0.6, 0.1, 0));
  const harness = new THREE.Mesh(new THREE.TorusGeometry(0.29, 0.035, 6, 16), M.red); harness.rotation.y = Math.PI / 2; harness.position.x = 0.34; d.add(harness);
  d.add(ell(M.gold, 0.055, 0.055, 0.055, 0.34, -0.3, 0));
  d.userData.legs = legs;
  return d;
}

function buildSleigh() {
  const g = new THREE.Group();
  const M = {
    red: std('#d63a2f', 0.45, glowy('#5a0d0a', 0.6)),
    darkRed: std('#9c231c', 0.5, glowy('#3a0806', 0.5)),
    gold: std('#f2c14e', 0.25, { metalness: 0.85, emissive: '#6b4a08', emissiveIntensity: 0.5 }),
    white: std('#fbfdff', 0.9, glowy('#44505f', 0.5)),
    brown: std('#a8683a', 0.8, glowy('#2c1608', 0.5)),
    brown2: std('#7e4a28', 0.8, glowy('#1e0f06', 0.5)),
    cream: std('#f0dcc0', 0.85, glowy('#3a2f20', 0.5)),
    antler: std('#e2cfa8', 0.7, glowy('#3a2f1a', 0.4)),
    dark: std('#2a1c16', 0.7),
    skin: std('#ffc9a0', 0.7, glowy('#4a2a18', 0.5)),
    pink: std('#ff9a8a', 0.7),
    sack: std('#c79a62', 0.9, glowy('#3a2a14', 0.5)),
    rNose: new THREE.MeshBasicMaterial({ color: new THREE.Color(4, 0.3, 0.3), toneMapped: false }),
  };

  /* --- sleigh body: curved side profile extruded across --- */
  const prof = new THREE.Shape();
  prof.moveTo(-1.25, 0.25); prof.lineTo(0.8, 0.25);
  prof.quadraticCurveTo(1.4, 0.25, 1.55, 1.0);
  prof.quadraticCurveTo(1.2, 0.8, 0.85, 0.72);
  prof.lineTo(-1.0, 0.72);
  prof.quadraticCurveTo(-1.3, 0.85, -1.45, 1.3);
  prof.quadraticCurveTo(-1.6, 0.6, -1.25, 0.25);
  const bodyGeo = new THREE.ExtrudeGeometry(prof, { depth: 0.8, bevelEnabled: true, bevelThickness: 0.07, bevelSize: 0.06, bevelSegments: 2, curveSegments: 10 });
  bodyGeo.translate(0, 0, -0.4);
  g.add(new THREE.Mesh(bodyGeo, M.red));
  for (const z of [-0.47, 0.47]) {
    g.add(tube([V(-1.45, 1.3, z), V(-1.28, 0.9, z), V(-1.0, 0.74, z), V(0.8, 0.74, z), V(1.2, 0.83, z), V(1.55, 1.02, z)], 0.07, M.white));
    g.add(tube([V(-1.3, 0.3, z), V(0.8, 0.3, z), V(1.35, 0.34, z), V(1.55, 0.95, z)], 0.045, M.gold));
  }
  for (const z of [-0.36, 0.36]) {
    g.add(tube([V(-1.6, -0.02, z), V(-1.0, -0.14, z), V(0.6, -0.14, z), V(1.5, -0.12, z), V(2.05, 0.12, z), V(2.0, 0.55, z)], 0.06, M.gold));
    for (const x of [-0.8, 0.5]) g.add(bar(V(x, -0.12, z), V(x, 0.3, z), 0.045, M.gold));
  }
  g.add(ell(M.darkRed, 0.55, 0.2, 0.4, -0.2, 0.8, 0));

  /* --- gift boxes (sack + sleigh bed) --- */
  const gift = (c, s, x, y, z, ry) => {
    const b = new THREE.Group(), m = std(c, 0.6, glowy(c, 0.18));
    b.add(cube(m, s, s * 0.9, s), cube(M.white, s * 1.03, s * 0.92, s * 0.2), cube(M.white, s * 0.2, s * 0.92, s * 1.03), ell(M.gold, s * 0.16, s * 0.12, s * 0.16, 0, s * 0.5, 0));
    b.position.set(x, y, z); b.rotation.y = ry; return b;
  };
  g.add(ell(M.sack, 0.55, 0.62, 0.5, -1.05, 1.15, 0), ell(M.brown2, 0.2, 0.15, 0.2, -1.05, 1.72, 0));
  g.add(gift('#2e9e5b', 0.4, -1.05, 1.9, 0.1, 0.4), gift('#3b78d8', 0.33, -0.75, 1.55, 0.4, -0.3), gift('#8e5bd6', 0.3, -1.3, 1.55, -0.35, 0.5), gift('#e8c24a', 0.3, 0.85, 0.95, -0.1, 0.3));

  /* --- lantern on the prow --- */
  g.add(bar(V(1.5, 1.0, 0), V(1.5, 1.2, 0), 0.025, M.gold));
  g.add(ell(new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 2.2, 0.9), toneMapped: false }), 0.11, 0.11, 0.11, 1.5, 1.32, 0));
  const lamp = makeGlow('#ffd27a', 1.8, 1.8, 0.9); lamp.position.set(1.5, 1.32, 0); g.add(lamp);

  /* --- Santa --- */
  const santa = new THREE.Group(); santa.position.set(-0.2, 0.75, 0); g.add(santa);
  santa.add(ell(M.red, 0.36, 0.42, 0.34, 0, 0.45, 0));
  const belt = new THREE.Mesh(new THREE.TorusGeometry(0.35, 0.05, 6, 16), M.dark); belt.rotation.x = Math.PI / 2; belt.position.y = 0.32; santa.add(belt);
  santa.add(cube(M.gold, 0.05, 0.15, 0.17, 0.36, 0.32, 0));
  const head = new THREE.Group(); head.position.set(0.02, 1.12, 0); head.rotation.y = -0.7; santa.add(head);
  head.add(ell(M.skin, 0.26, 0.25, 0.25), ell(M.skin, 0.06, 0.06, 0.06, 0.26, -0.01, 0));
  for (const s of [1, -1]) {
    head.add(ell(M.pink, 0.07, 0.06, 0.04, 0.2, -0.04, s * 0.14), ell(M.dark, 0.03, 0.04, 0.03, 0.22, 0.07, s * 0.1), ell(M.white, 0.07, 0.025, 0.03, 0.2, 0.13, s * 0.1), ell(M.white, 0.1, 0.05, 0.08, 0.22, -0.07, s * 0.06));
  }
  head.add(ell(M.white, 0.22, 0.28, 0.3, 0.1, -0.2, 0), ell(M.white, 0.15, 0.15, 0.22, 0.2, -0.27, 0));
  const hat = new THREE.Group(); hat.position.y = 0.17; hat.rotation.z = 0.5; head.add(hat);
  const cone = new THREE.Mesh(UNIT.cone, M.red); cone.scale.set(0.27, 0.62, 0.27); cone.position.y = 0.3; hat.add(cone);
  const band = new THREE.Mesh(new THREE.TorusGeometry(0.255, 0.07, 6, 16), M.white); band.rotation.x = Math.PI / 2; hat.add(band);
  hat.add(ell(M.white, 0.09, 0.09, 0.09, 0, 0.64, 0));
  const arm = new THREE.Group(); arm.position.set(0.05, 0.62, 0.3); arm.rotation.x = 0.9; santa.add(arm);
  arm.add(bar(V(0, 0, 0), V(0, 0.45, 0), 0.09, M.red), ell(M.white, 0.1, 0.07, 0.1, 0, 0.45, 0), ell(M.white, 0.11, 0.11, 0.11, 0, 0.56, 0));
  santa.add(bar(V(0.05, 0.62, -0.3), V(0.5, 0.42, -0.26), 0.09, M.red), ell(M.white, 0.11, 0.11, 0.11, 0.52, 0.42, -0.26));

  /* --- reindeer team: 3 pairs + Rudolph in front --- */
  const team = [];
  const slots = [[3.1, -0.5], [3.1, 0.5], [4.8, -0.5], [4.8, 0.5], [6.5, -0.5], [6.5, 0.5], [8.5, 0]];
  slots.forEach(([x, z], i) => {
    const d = buildReindeer(M, i === 6);
    d.scale.setScalar(1.2); d.position.set(x + (i < 6 ? (i % 2 ? 0.15 : -0.15) : 0), 0.85, z);
    g.add(d, bar(V(1.5, 1.05, 0), V(x + 0.5, 1.0, z), 0.012, M.dark));
    team.push(d);
  });

  g.userData.animate = (t) => {
    team.forEach((d, i) => {
      const ph = t * 9 + i * 0.9;
      d.position.y = 0.85 + Math.abs(Math.sin(ph)) * 0.09; d.rotation.z = 0.08 + Math.sin(ph) * 0.05;
      d.userData.legs.forEach((l) => { l.g.rotation.z = Math.sin(ph + (l.front ? 0 : Math.PI * 0.7)) * 0.7; });
      if (d.userData.nose) d.userData.nose.scale.setScalar(1.1 + Math.sin(t * 5) * 0.25);
    });
    arm.rotation.x = 0.9 + Math.sin(t * 6) * 0.28;
  };
  return g;
}

/**
 * The flight path is computed from the camera so the sleigh always crosses the upper part of the
 * screen (a fixed world path ended up above the frame for the default camera).
 * start({ follow: true }) re-aims every frame (used while recording, when the camera keeps moving).
 */
export function createSanta(scene, camera) {
  const sleigh = buildSleigh();
  sleigh.scale.setScalar(3.4);
  sleigh.visible = false;
  scene.add(sleigh);
  const A = new THREE.Vector3(), B = new THREE.Vector3(), dir = new THREE.Vector3(1, 0, 0);
  const fwd = new THREE.Vector3(), cup = new THREE.Vector3(), right = new THREE.Vector3(), C = new THREE.Vector3();
  const DEPTH = 46, MIN_Y = 5;
  let follow = false;
  function aim() {
    camera.updateMatrixWorld();
    camera.getWorldDirection(fwd);
    cup.setFromMatrixColumn(camera.matrixWorld, 1);
    const th = Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2);
    const halfW = DEPTH * th * camera.aspect;
    // a point in front of the camera, ~30% of the way up the frame (below the countdown bar)
    C.copy(camera.position).addScaledVector(fwd, DEPTH).addScaledVector(cup, DEPTH * th * 0.3);
    if (C.y < MIN_Y) C.y = MIN_Y;
    right.set(-fwd.z, 0, fwd.x);
    if (right.lengthSq() < 1e-4) right.set(1, 0, 0); else right.normalize();
    // size so the whole team spans ~50% of the frame width (85% on a portrait screen / video)
    const sc = THREE.MathUtils.clamp((camera.aspect < 1 ? 0.85 : 0.5) * 2 * halfW / SPAN, 1, 5);
    sleigh.scale.setScalar(sc);
    C.addScaledVector(right, -3.9 * sc); // the team (not the sleigh) is what should be centred mid-flight
    const ext = halfW + SPAN * sc + 4; // long enough to enter/leave fully off-screen
    A.copy(C).addScaledVector(right, -ext); B.copy(C).addScaledVector(right, ext);
    dir.subVectors(B, A);
  }
  const DUR = 22;
  const N = 40, trail = [];
  for (let i = 0; i < N; i++) {
    const s = makeGlow(new THREE.Color().setHSL(0.1 - i * 0.002, 0.9, 0.6).multiplyScalar(2), 1, 1, 0);
    s.visible = false; scene.add(s); trail.push(s);
  }
  const hist = [];
  let t = -1, acc = 0;
  const light = new THREE.PointLight('#ffd9a0', 30, 30, 2); sleigh.add(light);
  const pos = (u) => new THREE.Vector3().lerpVectors(A, B, u).add(new THREE.Vector3(0, Math.sin(u * Math.PI) * 2 + Math.sin(u * 20) * 0.5, 0));
  return {
    get active() { return t >= 0; },
    start(opts = {}) { follow = !!opts.follow; aim(); t = 0; hist.length = 0; sleigh.visible = true; },
    update(dt) {
      if (t < 0) return;
      t += dt; acc += dt;
      if (follow) aim();
      const u = t / DUR;
      if (u >= 1) { t = -1; sleigh.visible = false; trail.forEach((s) => { s.visible = false; }); return; }
      const p = pos(u), q = pos(Math.min(u + 0.01, 1));
      sleigh.position.copy(p);
      sleigh.rotation.y = Math.atan2(-(dir.z), dir.x);
      sleigh.rotation.z = Math.atan2(q.y - p.y, Math.hypot(q.x - p.x, q.z - p.z)) * 0.6;
      sleigh.userData.animate(t);
      const sc = sleigh.scale.x;
      if (acc > 0.06) { acc = 0; hist.unshift(p.clone().addScaledVector(dir.clone().normalize(), -1.8 * sc)); if (hist.length > N) hist.pop(); }
      trail.forEach((s, i) => {
        const h = hist[i];
        s.visible = !!h;
        if (h) { s.position.copy(h).add(new THREE.Vector3(0, 0.2 * sc, 0)); const k = 1 - i / N; s.scale.setScalar((0.5 + 2.8 * k) * sc / 3.4); s.material.opacity = 0.75 * k * Math.min(1, t / 1.5); }
      });
    },
  };
}

/* ---------- Gifts that parachute down ---------- */
const stripe = (() => {
  const c = document.createElement('canvas'); c.width = 128; c.height = 8;
  const g = c.getContext('2d');
  for (let i = 0; i < 8; i++) { g.fillStyle = i % 2 ? '#ffffff' : '#d62839'; g.fillRect(i * 16, 0, 16, 8); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = THREE.RepeatWrapping; return t;
})();
const FALL_MS = 16000;

export function createGifts(scene, fireworks) {
  const items = new Map();
  const hitMat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false });
  return {
    add({ id, x, z, age = 0 }) {
      if (items.has(id)) return;
      const g = new THREE.Group();
      const chute = new THREE.Mesh(new THREE.SphereGeometry(1.4, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ map: stripe, roughness: 0.6, side: THREE.DoubleSide }));
      chute.position.y = 2.4;
      const pts = [];
      for (let i = 0; i < 6; i++) { const a = (i / 6) * 6.28; pts.push(new THREE.Vector3(Math.cos(a) * 1.4, 2.4, Math.sin(a) * 1.4), new THREE.Vector3(0, 0.55, 0)); }
      const strings = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: '#eef4ff' }));
      const box = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.55, 0.7), std('#e9a21b', 0.4));
      box.position.y = 0.3;
      const rib = std('#c0392b', 0.4);
      const r1 = new THREE.Mesh(new THREE.BoxGeometry(0.74, 0.58, 0.12), rib), r2 = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.58, 0.74), rib);
      r1.position.y = r2.position.y = 0.3;
      const glow = makeGlow(new THREE.Color(1.8, 1.3, 0.5), 3.2, 3.2, 0.6); glow.position.y = 0.4;
      const hit = new THREE.Mesh(new THREE.SphereGeometry(1.1, 8, 6), hitMat); hit.position.y = 0.6; hit.userData.giftId = id;
      g.add(chute, strings, box, r1, r2, glow, hit);
      g.position.set(x, 28, z);
      g.scale.setScalar(1.3);
      scene.add(g);
      items.set(id, { g, chute, strings, glow, hit, x, z, t0: performance.now() - age, ph: Math.random() * 6 });
    },
    remove(id, burst = true) {
      const it = items.get(id);
      if (!it) return;
      if (burst) fireworks.burst(it.g.position.x, it.g.position.y + 1, it.g.position.z, new THREE.Color(2.5, 1.8, 0.6), 50, 3.5);
      scene.remove(it.g);
      items.delete(id);
    },
    hitboxes() { return [...items.values()].map((i) => i.hit); },
    positions() { return [...items.values()].map((i) => ({ x: i.x, z: i.z })); },
    count: () => items.size,
    update(time) {
      const now = performance.now();
      for (const it of items.values()) {
        const k = Math.min((now - it.t0) / FALL_MS, 1), e = 1 - Math.pow(1 - k, 1.6);
        it.g.position.y = 28 * (1 - e);
        it.g.position.x = it.x + (1 - k) * Math.sin(time * 0.8 + it.ph) * 1.8;
        it.g.position.z = it.z + (1 - k) * Math.cos(time * 0.6 + it.ph) * 1.2;
        const landed = k >= 1;
        it.chute.visible = it.strings.visible = !landed;
        if (landed) { it.g.position.set(it.x, Math.abs(Math.sin(time * 2.4 + it.ph)) * 0.18, it.z); it.g.rotation.y += 0.01; }
        it.glow.material.opacity = 0.45 + 0.3 * Math.sin(time * 4 + it.ph);
      }
    },
  };
}

/* ---------- Fireworks ---------- */
export function createFireworks(scene) {
  const bursts = [];
  let show = null;
  function burst(x, y, z, color, n = 110, speed = 9) {
    if (bursts.length > 16) return;
    const pos = new Float32Array(n * 3), vel = [];
    for (let i = 0; i < n; i++) {
      pos.set([x, y, z], i * 3);
      const a = Math.random() * 6.28, b = Math.acos(2 * Math.random() - 1), s = speed * (0.55 + Math.random() * 0.45);
      vel.push(new THREE.Vector3(Math.sin(b) * Math.cos(a) * s, Math.cos(b) * s, Math.sin(b) * Math.sin(a) * s));
    }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const mat = new THREE.PointsMaterial({ color, size: 0.55, map: flakeTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, fog: false });
    const pts = new THREE.Points(geo, mat); pts.frustumCulled = false;
    scene.add(pts);
    bursts.push({ pts, geo, mat, vel, age: 0, life: 2.4 });
  }
  return {
    burst,
    startShow(seconds, ring = false) { show = { until: performance.now() + seconds * 1000, next: 0, ring }; },
    get running() { return !!show; },
    update(dt) {
      const nowMs = performance.now();
      if (show) {
        if (nowMs > show.until) show = null;
        else if (nowMs >= show.next) {
          show.next = nowMs + 350 + Math.random() * 500;
          const col = new THREE.Color().setHSL(Math.random(), 0.9, 0.6).multiplyScalar(2.6);
          if (show.ring) { const an = Math.random() * 6.283, rr = 34 + Math.random() * 26; burst(Math.sin(an) * rr, 18 + Math.random() * 16, Math.cos(an) * rr, col); }
          else burst((Math.random() - 0.5) * 55, 16 + Math.random() * 16, -22 - Math.random() * 26, col);
        }
      }
      for (let i = bursts.length - 1; i >= 0; i--) {
        const b = bursts[i];
        b.age += dt;
        const k = b.age / b.life;
        if (k >= 1) { scene.remove(b.pts); b.geo.dispose(); b.mat.dispose(); bursts.splice(i, 1); continue; }
        const a = b.geo.attributes.position;
        b.vel.forEach((v, j) => {
          v.y -= 4 * dt; v.multiplyScalar(1 - 0.7 * dt);
          a.setXYZ(j, a.getX(j) + v.x * dt, a.getY(j) + v.y * dt, a.getZ(j) + v.z * dt);
        });
        a.needsUpdate = true;
        b.mat.opacity = 1 - k * k;
      }
    },
  };
}
