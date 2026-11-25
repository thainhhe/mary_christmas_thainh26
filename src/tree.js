import * as THREE from 'three';
import { makeGlow, mulberry } from './textures.js';

/* ---- Geometry description ---- */
const TIER_COUNT = 9, SPACING = 0.85, H = 2.0, BASE_Y = 0.9;
export const TIERS = Array.from({ length: TIER_COUNT }, (_, i) => ({
  y: BASE_Y + i * SPACING,
  r: 3.1 - i * 0.3,
  h: H,
  vis: i === TIER_COUNT - 1 ? H * 0.9 : SPACING * 0.95, // part of the tier not hidden by the next one
}));
export const TREE_TOP = BASE_Y + (TIER_COUNT - 1) * SPACING + H;
export const WISH_COLORS = ['#ff4d6d', '#ffd166', '#4cc9f0', '#80ed99', '#c77dff', '#f1f5ff'];

// Must mirror the vertex displacement applied in foliage()
const wob = (a, f, i) => 1 + (0.06 * Math.sin(a * 12 + 1) + 0.03 * Math.sin(a * 5 + f * 4 + i)) * (1 - f * 0.6);
const droop = (a, f) => 0.2 * (0.5 + 0.5 * Math.sin(a * 12 + 1)) * Math.pow(1 - f, 3);

/** Point on the tree surface. t∈[0,1] is the position inside the visible band of the tier. */
export function surfacePoint(tier, angle, t, off = 0) {
  const T = TIERS[tier];
  const s = t * T.vis, f = s / T.h;
  const rad = T.r * (1 - f) * wob(angle, f, tier) + off;
  return new THREE.Vector3(Math.cos(angle) * rad, T.y + s - droop(angle, f), Math.sin(angle) * rad);
}

function foliage(T, i) {
  const g = new THREE.ConeGeometry(T.r, T.h, 56, 5, true);
  g.rotateY(i * 0.7);
  const pos = g.attributes.position;
  const col = new Float32Array(pos.count * 3);
  const lo = new THREE.Color('#3fb06c'), hi = new THREE.Color('#0f5a34'), c = new THREE.Color();
  for (let k = 0; k < pos.count; k++) {
    let x = pos.getX(k), y = pos.getY(k), z = pos.getZ(k);
    const f = (y + T.h / 2) / T.h;
    const a = Math.atan2(z, x);
    const w = wob(a, f, i);
    x *= w; z *= w;
    y -= droop(a, f);
    pos.setXYZ(k, x, y, z);
    c.copy(lo).lerp(hi, Math.pow(f, 0.55)).multiplyScalar(0.88 + 0.24 * Math.abs(Math.sin(a * 23 + f * 9)));
    col.set([c.r, c.g, c.b], k * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.computeVertexNormals();
  return g;
}

function starGeo(outer, inner) {
  const sh = new THREE.Shape();
  for (let k = 0; k < 10; k++) {
    const r = k % 2 ? inner : outer, a = Math.PI / 2 + (k * Math.PI) / 5;
    k ? sh.lineTo(Math.cos(a) * r, Math.sin(a) * r) : sh.moveTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  const g = new THREE.ExtrudeGeometry(sh, { depth: 0.05, bevelEnabled: true, bevelThickness: 0.02, bevelSize: 0.02, bevelSegments: 1 });
  g.translate(0, 0, -0.025);
  return g;
}

export function buildTree(scene, envMap) {
  const group = new THREE.Group();
  scene.add(group);
  const occluders = [];
  const rnd = mulberry(11);

  // Trunk + foliage
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.5, 1.4, 12), new THREE.MeshStandardMaterial({ color: '#4a2f1d', roughness: 0.9 }));
  trunk.position.y = 0.7;
  group.add(trunk);
  const leafMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, side: THREE.DoubleSide, emissive: '#0a3a20' });
  TIERS.forEach((T, i) => {
    const m = new THREE.Mesh(foliage(T, i), leafMat);
    m.position.y = T.y + T.h / 2;
    group.add(m);
    occluders.push(m);
  });

  // Decorations (balls / stars / diamonds)
  const palette = ['#ff4d6d', '#ffd166', '#4cc9f0', '#80ed99', '#c77dff', '#ff9e4d', '#f1f5ff'];
  const ornMat = new THREE.MeshStandardMaterial({ color: '#ffffff', metalness: 0.6, roughness: 0.2, envMap, envMapIntensity: 1.3 });
  const weights = TIERS.map((T) => T.r * T.vis);
  const wsum = weights.reduce((a, b) => a + b, 0);
  const pickTier = () => { let r = rnd() * wsum; for (let i = 0; i < weights.length; i++) { r -= weights[i]; if (r <= 0) return i; } return 0; };
  const dia = new THREE.OctahedronGeometry(0.13); dia.scale(1, 1.55, 1);
  const defs = [
    { geo: new THREE.SphereGeometry(0.15, 16, 12), n: 110, off: 0.06 },
    { geo: starGeo(0.22, 0.095), n: 60, off: 0.1 },
    { geo: dia, n: 50, off: 0.1 },
  ];
  const dummy = new THREE.Object3D(), tmpC = new THREE.Color();
  for (const d of defs) {
    const mesh = new THREE.InstancedMesh(d.geo, ornMat, d.n);
    for (let i = 0; i < d.n; i++) {
      const a = rnd() * Math.PI * 2;
      dummy.position.copy(surfacePoint(pickTier(), a, rnd() * 0.95, d.off));
      dummy.rotation.set(0, Math.PI / 2 - a, 0);
      dummy.rotateZ(rnd() * 6.28);
      dummy.scale.setScalar(0.8 + rnd() * 0.5);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
      mesh.setColorAt(i, tmpC.set(palette[(rnd() * palette.length) | 0]));
    }
    group.add(mesh);
  }

  // Twinkling bulbs: a string along every skirt + random scatter
  const bulbPos = [];
  TIERS.forEach((T, i) => {
    for (let j = 0; j < 40; j++) bulbPos.push(surfacePoint(i, (j / 40) * Math.PI * 2, 0, 0.07));
  });
  for (let k = 0; k < 420; k++) bulbPos.push(surfacePoint(pickTier(), rnd() * Math.PI * 2, rnd(), 0.07));
  const bulbs = new THREE.InstancedMesh(new THREE.SphereGeometry(0.05, 8, 6), new THREE.MeshBasicMaterial({ toneMapped: false }), bulbPos.length);
  const bulbCols = ['#ffe3a3', '#ffd166', '#ff8fa3', '#8fd3ff', '#b8ffb0'].map((h) => new THREE.Color(h));
  const base = [], phase = [], speed = [];
  bulbPos.forEach((p, i) => {
    dummy.position.copy(p); dummy.rotation.set(0, 0, 0); dummy.scale.setScalar(1); dummy.updateMatrix();
    bulbs.setMatrixAt(i, dummy.matrix);
    base.push(bulbCols[i < 360 ? (i % 2 ? 0 : (i >> 1) % 5) : (rnd() * 5) | 0]);
    phase.push(rnd() * 6.28); speed.push(1.2 + rnd() * 2.2);
  });
  group.add(bulbs);

  // Star topper + light column
  const star = new THREE.Mesh(starGeo(0.55, 0.24), new THREE.MeshStandardMaterial({ color: '#ffd166', emissive: '#ffb703', emissiveIntensity: 2.2, metalness: 0.3, roughness: 0.3 }));
  star.position.y = TREE_TOP + 0.2;
  star.scale.setScalar(1.2);
  group.add(star);
  const halo = makeGlow(new THREE.Color(1.6, 1.1, 0.5), 4, 4, 0.6);
  halo.position.copy(star.position);
  const beam = makeGlow(new THREE.Color(1.0, 0.75, 0.4), 5, 18, 0.12);
  beam.position.set(0, TREE_TOP + 7, 0);
  group.add(halo, beam);
  const starLight = new THREE.PointLight('#ffd9a0', 8, 10, 2);
  starLight.position.set(0, TREE_TOP - 0.5, 0.5);
  group.add(starLight);

  // Presents
  const giftCols = ['#d62839', '#2a9d8f', '#4361ee', '#f4a261', '#9b5de5', '#e5e5e5', '#ef476f'];
  for (let i = 0; i < 11; i++) {
    const a = (i / 11) * Math.PI * 2 + rnd() * 0.3, r = 3.0 + rnd() * 1.4;
    const w = 0.5 + rnd() * 0.6, h = 0.4 + rnd() * 0.55, d = 0.5 + rnd() * 0.6;
    const g = new THREE.Group();
    g.add(new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshStandardMaterial({ color: giftCols[i % giftCols.length], roughness: 0.5 })));
    const rib = new THREE.MeshStandardMaterial({ color: i % 2 ? '#ffe9a8' : '#ffffff', roughness: 0.4, metalness: 0.3 });
    g.add(new THREE.Mesh(new THREE.BoxGeometry(w + 0.02, h + 0.02, 0.1), rib), new THREE.Mesh(new THREE.BoxGeometry(0.1, h + 0.02, d + 0.02), rib));
    const bow = new THREE.Mesh(new THREE.SphereGeometry(0.11, 10, 8), rib);
    bow.position.y = h / 2 + 0.05; g.add(bow);
    g.position.set(Math.cos(a) * r, h / 2, Math.sin(a) * r);
    g.rotation.y = rnd() * 6.28;
    group.add(g);
  }

  /* ---- Wish ornaments (clickable) ---- */
  const wishGroup = new THREE.Group();
  group.add(wishGroup);
  const wishBalls = [];
  const ballGeo = new THREE.SphereGeometry(0.24, 24, 18);
  const capGeo = new THREE.CylinderGeometry(0.07, 0.07, 0.08, 10);
  const capMat = new THREE.MeshStandardMaterial({ color: '#d4af37', metalness: 0.9, roughness: 0.3 });

  function addWish(o, animate = false) {
    const g = new THREE.Group();
    const ball = new THREE.Mesh(ballGeo, new THREE.MeshStandardMaterial({
      color: o.color, metalness: 0.65, roughness: 0.18, envMap, envMapIntensity: 1.6, emissive: o.color, emissiveIntensity: 0.45,
    }));
    const cap = new THREE.Mesh(capGeo, capMat); cap.position.y = 0.27;
    const glow = makeGlow(new THREE.Color(o.color).multiplyScalar(1.3), 0.75, 0.75, 0.3);
    g.add(ball, cap, glow);
    g.position.copy(surfacePoint(o.tier, o.angle, o.t, 0.2));
    g.userData = { o, born: animate ? performance.now() : -1, hs: 1 };
    ball.userData.group = g;
    wishGroup.add(g);
    wishBalls.push(ball);
    if (animate) g.scale.setScalar(0.01);
    return g;
  }

  const tmp = new THREE.Color();
  function update(t, dt, hovered) {
    star.rotation.y += dt * 0.8;
    halo.material.opacity = 0.55 + 0.1 * Math.sin(t * 2);
    for (let i = 0; i < base.length; i++) {
      const tw = 0.25 + 1.75 * Math.pow(0.5 + 0.5 * Math.sin(t * speed[i] + phase[i]), 2);
      bulbs.setColorAt(i, tmp.copy(base[i]).multiplyScalar(tw * 1.1));
    }
    bulbs.instanceColor.needsUpdate = true;
    const now = performance.now();
    for (const g of wishGroup.children) {
      const u = g.userData;
      let k = 1;
      if (u.born > 0) { const p = Math.min((now - u.born) / 700, 1); k = 1 - Math.pow(1 - p, 3); if (p >= 1) u.born = -1; }
      u.hs += ((g === hovered ? 1.35 : 1) - u.hs) * 0.2;
      g.scale.setScalar(Math.max(k * u.hs, 0.01));
    }
  }

  return { group, occluders, wishBalls, addWish, update };
}
