import * as THREE from 'three';
import { mulberry, terrainHeight, makeGlow } from './textures.js';
import { CLEAR, bulbSet } from './env.js';

/** A ring of snowy houses + streets + street lamps around the plaza, so the wide view reads as a small town. */
export function buildTown(scene) {
  const rnd = mulberry(99);
  const dm = new THREE.Object3D();

  /* ---- Houses ---- */
  const spots = [];
  const free = (x, z, minGap) => !CLEAR.some(([cx, cz, cr]) => Math.hypot(x - cx, z - cz) < cr + 2) && spots.every((s) => Math.hypot(s.x - x, s.z - z) > minGap);
  for (const [radius, gap] of [[40.5, 6.4], [47, 7], [53.5, 7.6]]) {
    const n = Math.round((Math.PI * 2 * radius) / gap);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + rnd() * 0.12, r = radius + (rnd() - 0.5) * 1.6;
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      if (!free(x, z, 5)) continue;
      spots.push({ x, z, w: 3 + rnd() * 1.4, d: 2.6 + rnd() * 0.8, h: 2 + rnd() * 1.2, ry: Math.atan2(-x, -z) + (rnd() - 0.5) * 0.4 });
    }
  }
  const N = spots.length;
  const bodyMat = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.9 });
  const roofMat = new THREE.MeshStandardMaterial({ color: '#e9f0ff', roughness: 0.85 });
  const bodies = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), bodyMat, N);
  const roofGeo = new THREE.ConeGeometry(1, 1, 4); roofGeo.rotateY(Math.PI / 4);
  const roofs = new THREE.InstancedMesh(roofGeo, roofMat, N);
  const chimneys = new THREE.InstancedMesh(new THREE.BoxGeometry(0.4, 0.9, 0.4), new THREE.MeshStandardMaterial({ color: '#40322d', roughness: 0.9 }), N);
  const winGeo = new THREE.PlaneGeometry(0.55, 0.55);
  const winMat = new THREE.MeshBasicMaterial({ color: '#ffffff', toneMapped: false });
  const wins = new THREE.InstancedMesh(winGeo, winMat, N * 2);
  const walls = ['#7a3b2e', '#8a5a34', '#c98f5a', '#5d6f8a', '#a64a4a', '#d8c7a3', '#4f7a63'].map((c) => new THREE.Color(c));
  const lit = new THREE.Color(2.6, 1.7, 0.7), dim = new THREE.Color(0.25, 0.28, 0.4), tmp = new THREE.Color();
  const world = new THREE.Matrix4(), root = new THREE.Matrix4(), one = new THREE.Vector3();
  const hs = []; // per-house data so a house can shrink away when it blocks the camera

  /* ---- Christmas lights on the houses (Dyker Heights style): roof edges, roof ridges, a star, a lit fir in some yards ---- */
  const lightPts = [], lightLook = [], starPts = [], yardTrees = [];
  const LIGHT_STYLES = [
    [new THREE.Color(3, 0.5, 0.55), new THREE.Color(0.6, 2.4, 0.9), new THREE.Color(0.8, 1.5, 3), new THREE.Color(3, 2.3, 0.6), new THREE.Color(3, 0.9, 1.8)], // multicolour
    [new THREE.Color(3, 2.2, 1.0)],                                                                                                                          // warm white
    [new THREE.Color(3, 0.4, 0.45), new THREE.Color(0.5, 2.4, 0.8)],                                                                                          // red / green
    [new THREE.Color(1.1, 1.8, 3), new THREE.Color(3, 3, 3)],                                                                                                 // icy blue / white
  ];
  function addHouseLights(s, rh, pos, quat) {
    const style = (rnd() * LIGHT_STYLES.length) | 0, y = s.h - 0.02;
    const hx = s.w * 0.566, hz = s.d * 0.601, apexY = s.h + 0.55 + rh / 2;
    const P = (x, yy, z) => new THREE.Vector3(x, yy, z).applyQuaternion(quat).add(pos);
    const push = (p, k) => { lightPts.push(p); lightLook.push([style, k]); };
    let k = 0;
    const nF = Math.max(3, Math.round((hx * 2) / 0.7)), nS = Math.max(2, Math.round((hz * 2) / 0.7));
    for (let q = 0; q <= nF; q++) push(P(-hx + (q * 2 * hx) / nF, y, hz), k++);                    // front roof edge
    for (const sx of [-1, 1]) for (let q = 1; q < nS; q++) push(P(sx * hx, y, hz - (q * 2 * hz) / nS), k++); // the two side edges
    for (const [cx, cz] of [[-hx, hz], [hx, hz], [-hx, -hz], [hx, -hz]]) for (let q = 1; q <= 3; q++) { const f = q / 4; push(P(cx * (1 - f), y + (apexY - y) * f, cz * (1 - f)), k++); } // ridges up to the tip
    if (rnd() < 0.45) starPts.push(P(0, apexY + 0.18, 0));
    if (rnd() < 0.35) yardTrees.push(P(s.w * (rnd() < 0.5 ? -0.3 : 0.3), 0, s.d / 2 + 1.1));
  }
  spots.forEach((s, i) => {
    const y = terrainHeight(s.x, s.z);
    const pos = new THREE.Vector3(s.x, y, s.z), quat = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, s.ry, 0));
    const parts = [];
    const put = (mesh, idx, p, scale) => parts.push({ mesh, idx, m: new THREE.Matrix4().compose(p, new THREE.Quaternion(), scale) });
    hs.push({ pos, quat, parts, center: new THREE.Vector3(s.x, y + s.h / 2 + 1, s.z), f: 1, applied: 1 });
    put(bodies, i, new THREE.Vector3(0, s.h / 2, 0), new THREE.Vector3(s.w, s.h, s.d));
    const rh = 1.1 + rnd() * 0.3; // roof height
    put(roofs, i, new THREE.Vector3(0, s.h + 0.55, 0), new THREE.Vector3(s.w * 0.8, rh, s.d * 0.85));
    addHouseLights(s, rh, pos, quat);
    put(chimneys, i, new THREE.Vector3(s.w * 0.28, s.h + 0.9, -s.d * 0.15), new THREE.Vector3(1, 1, 1));
    for (const [k, wx] of [[0, -0.27], [1, 0.27]]) put(wins, i * 2 + k, new THREE.Vector3(s.w * wx, s.h * 0.58, s.d / 2 + 0.02), new THREE.Vector3(1, 1, 1));
    bodies.setColorAt(i, tmp.copy(walls[(rnd() * walls.length) | 0]));
    for (let k = 0; k < 2; k++) wins.setColorAt(i * 2 + k, rnd() < 0.78 ? tmp.copy(lit).multiplyScalar(0.7 + rnd() * 0.6) : dim);
  });
  function writeHouse(h, f) {
    root.compose(h.pos, h.quat, one.set(f, f, f));
    for (const p of h.parts) p.mesh.setMatrixAt(p.idx, world.multiplyMatrices(root, p.m));
  }
  hs.forEach((h) => writeHouse(h, 1));
  scene.add(bodies, roofs, chimneys, wins);

  // lit yard firs: a small cone + a spiral of bulbs
  if (yardTrees.length) {
    const yt = new THREE.InstancedMesh(new THREE.ConeGeometry(0.5, 1.7, 6), new THREE.MeshStandardMaterial({ color: '#17402d', roughness: 0.9 }), yardTrees.length);
    yardTrees.forEach((p, i) => {
      const y0 = terrainHeight(p.x, p.z);
      dm.position.set(p.x, y0 + 0.85, p.z); dm.rotation.set(0, 0, 0); dm.scale.setScalar(1); dm.updateMatrix(); yt.setMatrixAt(i, dm.matrix);
      for (let k = 0; k < 6; k++) { const a = k * 2.4 + i, h = 0.15 + (k / 6) * 1.4, rad = 0.46 * (1 - h / 1.8); lightPts.push(new THREE.Vector3(p.x + Math.cos(a) * rad, y0 + h, p.z + Math.sin(a) * rad)); lightLook.push([0, k]); }
    });
    scene.add(yt);
  }
  const houseBulbs = bulbSet(lightPts, (i) => { const [st, k] = lightLook[i], c = LIGHT_STYLES[st]; return c[k % c.length]; }, 0.075, (i) => i * 1.7, [5, 3]);
  scene.add(houseBulbs.mesh);
  if (starPts.length) {
    const stars = new THREE.InstancedMesh(new THREE.OctahedronGeometry(0.2), new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 2.2, 0.6), toneMapped: false }), starPts.length);
    starPts.forEach((p, i) => { dm.position.copy(p); dm.rotation.set(0, i, 0); dm.scale.set(1, 1.4, 1); dm.updateMatrix(); stars.setMatrixAt(i, dm.matrix); });
    scene.add(stars);
  }

  /* ---- Street lamps along the ring road ---- */
  const LAMPS = 30, heads = [], poles = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.06, 0.09, 3, 6), new THREE.MeshStandardMaterial({ color: '#171c28', roughness: 0.6, metalness: 0.5 }), LAMPS);
  for (let i = 0; i < LAMPS; i++) {
    const a = (i / LAMPS) * Math.PI * 2 + 0.08, x = Math.cos(a) * 35.2, z = Math.sin(a) * 35.2, y = terrainHeight(x, z);
    dm.position.set(x, y + 1.5, z); dm.rotation.set(0, 0, 0); dm.scale.setScalar(1); dm.updateMatrix();
    poles.setMatrixAt(i, dm.matrix);
    heads.push(new THREE.Vector3(x, y + 3.1, z));
  }
  scene.add(poles);
  const lampBulbs = bulbSet(heads, () => new THREE.Color(1.0, 0.72, 0.38), 0.17);
  scene.add(lampBulbs.mesh);
  heads.forEach((p, i) => { if (i % 2 === 0) { const g = makeGlow(new THREE.Color(1.1, 0.7, 0.3), 3.2, 3.2, 0.35); g.position.copy(p); scene.add(g); } });

  let lightFrame = 0;
  return {
    update(t) { lampBulbs.update(t, 2.2, 1.4); if ((lightFrame++ & 3) === 0) houseBulbs.update(t, 1.5, 2.0); }, // house lights twinkle at ~15 fps (thousands of bulbs)
    houses: N,
  };
}
