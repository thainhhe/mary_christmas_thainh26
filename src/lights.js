import * as THREE from 'three';
import { bulbSet } from './env.js';
import { makeGlow, terrainHeight } from './textures.js';
import { AVENUE } from '../shared/walk.js';

/**
 * "Trail of lights": the avenue to the Christmas market becomes a glowing walk: arches of coloured bulbs over the road,
 * lantern posts and little lit fir trees along both sides, with a colour wave running towards the market.
 */
export function buildTrailOfLights(scene) {
  const dir = new THREE.Vector3(AVENUE.x, 0, AVENUE.z), perp = new THREE.Vector3(-AVENUE.z, 0, AVENUE.x);
  const at = (r, side = 0, up = 0) => { // a point on the avenue: r along it, side across it, up above the ground
    const p = dir.clone().multiplyScalar(r).addScaledVector(perp, side);
    p.y = terrainHeight(p.x, p.z) + up;
    return p;
  };
  const palette = [new THREE.Color(3, 0.5, 0.55), new THREE.Color(3, 2.3, 0.6), new THREE.Color(0.6, 2.4, 0.9), new THREE.Color(0.8, 1.5, 3), new THREE.Color(3, 0.9, 1.8)];
  const pts = [], cols = [];
  const add = (p, c) => { pts.push(p); cols.push(c); };

  /* arches over the road */
  const ARCH_R = 2.6, ARCHES = [24, 27.5, 31, 34.5, 38];
  ARCHES.forEach((r, ai) => {
    const n = 18;
    for (let j = 0; j <= n; j++) { const th = (j / n) * Math.PI; add(at(r, Math.cos(th) * ARCH_R, Math.sin(th) * ARCH_R + 0.15), palette[(j + ai) % palette.length]); }
  });

  /* lantern posts + little fir trees along both sides */
  const POSTS = [], TREES = [];
  for (let r = 22.5; r <= 39.5; r += 3.5) for (const sd of [-1, 1]) POSTS.push([r, sd * 3.0]);
  for (let r = 24.5; r <= 40.5; r += 3.5) for (const sd of [-1, 1]) TREES.push([r, sd * 3.9]);
  const poleGeo = new THREE.CylinderGeometry(0.05, 0.07, 2.4, 6), poleMat = new THREE.MeshStandardMaterial({ color: '#1c1c24', roughness: 0.6, metalness: 0.5 });
  const poles = new THREE.InstancedMesh(poleGeo, poleMat, POSTS.length), dm = new THREE.Object3D();
  POSTS.forEach(([r, sd], i) => {
    const p = at(r, sd, 1.2); dm.position.copy(p); dm.rotation.set(0, 0, 0); dm.scale.setScalar(1); dm.updateMatrix(); poles.setMatrixAt(i, dm.matrix);
    const head = at(r, sd, 2.55); add(head, new THREE.Color(3, 2.1, 0.9));
    if (i % 2 === 0) { const gl = makeGlow(new THREE.Color(1.5, 0.9, 0.4), 3.0, 3.0, 0.4); gl.position.copy(head); scene.add(gl); }
  });
  scene.add(poles);
  const treeMat = new THREE.MeshStandardMaterial({ color: '#17402d', roughness: 0.9 });
  const trees = new THREE.InstancedMesh(new THREE.ConeGeometry(0.62, 2.0, 7), treeMat, TREES.length);
  const snowCap = new THREE.InstancedMesh(new THREE.ConeGeometry(0.4, 0.9, 7), new THREE.MeshStandardMaterial({ color: '#eef4ff', roughness: 0.9 }), TREES.length);
  TREES.forEach(([r, sd], i) => {
    const base = at(r, sd, 1.0); dm.position.copy(base); dm.updateMatrix(); trees.setMatrixAt(i, dm.matrix);
    dm.position.set(base.x, base.y + 0.72, base.z); dm.updateMatrix(); snowCap.setMatrixAt(i, dm.matrix);
    for (let k = 0; k < 7; k++) { const a = k * 2.4, h = 0.1 + (k / 7) * 1.7, rad = 0.58 * (1 - h / 2.1); add(base.clone().add(new THREE.Vector3(Math.cos(a) * rad, h - 1.0, Math.sin(a) * rad)), palette[(k + i) % palette.length]); }
  });
  scene.add(trees, snowCap);

  const bulbs = bulbSet(pts, (i) => cols[i], 0.06, (i) => i * 0.32, [8, 6]); // smooth phase ramp = a wave that runs along the trail
  scene.add(bulbs.mesh);
  let f = 0;
  return { update(t) { if ((f++ & 1) === 0) bulbs.update(t, 1.4, 2.6); } };
}
