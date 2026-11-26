import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { makeGlow, discTex, softTex, flakeTex, mulberry, smooth, vnoise, terrainHeight } from './textures.js';
import { MARKET_CLEAR } from './marketlayout.js';

const dummy = new THREE.Object3D();

export function cylinderBetween(a, b, radius, mat) {
  const dir = new THREE.Vector3().subVectors(b, a);
  const m = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, dir.length(), 6), mat);
  m.position.copy(a).addScaledVector(dir, 0.5);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
  return m;
}

/** Instanced emissive bulbs that can twinkle. phaseFn(i) offsets each bulb's twinkle (default: pseudo-random; a smooth ramp makes a chasing wave). */
export function bulbSet(positions, colorFn, radius = 0.06, phaseFn = (i) => i * 1.7, segments = [8, 6]) {
  const mesh = new THREE.InstancedMesh(new THREE.SphereGeometry(radius, ...segments), new THREE.MeshBasicMaterial({ toneMapped: false }), positions.length);
  const cols = positions.map((_, i) => colorFn(i));
  positions.forEach((p, i) => {
    dummy.position.copy(p); dummy.scale.setScalar(1); dummy.rotation.set(0, 0, 0); dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
    mesh.setColorAt(i, cols[i]);
  });
  const tmp = new THREE.Color();
  return {
    mesh,
    update(t, gain = 1.6, speed = 2) {
      for (let i = 0; i < cols.length; i++) {
        const tw = 0.45 + 0.9 * (0.5 + 0.5 * Math.sin(t * speed + phaseFn(i)));
        mesh.setColorAt(i, tmp.copy(cols[i]).multiplyScalar(tw * gain));
      }
      mesh.instanceColor.needsUpdate = true;
    },
  };
}

// Landmark layout shared with town.js: [x, z, clearRadius]
export const FERRIS_POS = new THREE.Vector3(-32, 0, -27);
export const CABIN_POS = [[22, -36, 0.5], [-36, -22, -0.9], [-14, 40, 3.1]];
export const CLEAR = [
  [FERRIS_POS.x, FERRIS_POS.z, 15], ...CABIN_POS.map(([x, z]) => [x, z, 4]),
  [44, 3, 17], [6, -60, 18], [14, -52, 7], [-11, -3, 5], [22, -38, 4], // cinema, ski run, lift, campfire, lift hut
  ...MARKET_CLEAR, // the Christmas market and the avenue to it
];

export function buildEnvironment(scene) {
  const updaters = [];
  const rnd = mulberry(5);

  /* ---- Sky, stars, moon ---- */
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(300, 32, 16),
    new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false,
      vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }',
      fragmentShader: 'varying vec3 vP; void main(){ float h = clamp(vP.y,0.,1.); vec3 top = vec3(.002,.006,.026); vec3 hor = vec3(.018,.045,.14); gl_FragColor = vec4(mix(hor, top, pow(h,.5)), 1.); }',
    }),
  );
  scene.add(sky);

  const starPos = new Float32Array(900 * 3);
  for (let i = 0; i < 900; i++) {
    const a = rnd() * Math.PI * 2, y = 0.06 + rnd() * 0.94, r = Math.sqrt(1 - y * y);
    starPos.set([Math.cos(a) * r * 280, y * 280, Math.sin(a) * r * 280], i * 3);
  }
  const starGeo = new THREE.BufferGeometry();
  starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
  scene.add(new THREE.Points(starGeo, new THREE.PointsMaterial({ color: new THREE.Color(1.6, 1.7, 2), size: 3, sizeAttenuation: false, map: flakeTex, transparent: true, depthWrite: false, fog: false, toneMapped: false })));

  const moonHalo = makeGlow(new THREE.Color(0.5, 0.65, 1.1), 90, 90, 0.8);
  const moon = makeGlow(new THREE.Color(2.2, 2.3, 2.6), 11, 11, 1, discTex);
  moonHalo.position.set(-90, 75, -170); moon.position.copy(moonHalo.position);
  scene.add(moonHalo, moon);

  /* ---- Ground ---- */
  const gg = new THREE.PlaneGeometry(260, 260, 240, 240);
  gg.rotateX(-Math.PI / 2);
  const gp = gg.attributes.position, gcol = new Float32Array(gp.count * 3);
  const white = new THREE.Color('#ffffff'), near = new THREE.Color('#c3d3ef'), far = new THREE.Color('#6a82bd'), c = new THREE.Color();
  for (let i = 0; i < gp.count; i++) {
    const x = gp.getX(i), z = gp.getZ(i);
    gp.setY(i, terrainHeight(x, z));
    c.copy(near).lerp(far, smooth(10, 60, Math.hypot(x, z))).lerp(white, smooth(1, 5, gp.getY(i)) * 0.95).multiplyScalar(0.9 + 0.14 * vnoise(x * 0.3, z * 0.3));
    gcol.set([c.r, c.g, c.b], i * 3);
  }
  gg.setAttribute('color', new THREE.BufferAttribute(gcol, 3));
  gg.computeVertexNormals();
  scene.add(new THREE.Mesh(gg, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 })));

  // Warm light pool under the tree + sparkling snow
  const poolMesh = new THREE.Mesh(new THREE.PlaneGeometry(30, 30), new THREE.MeshBasicMaterial({
    map: softTex, color: new THREE.Color(1.0, 0.62, 0.3), transparent: true, opacity: 0.3,
    depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false,
  }));
  poolMesh.rotation.x = -Math.PI / 2; poolMesh.position.y = 0.05;
  scene.add(poolMesh);

  const gl = new Float32Array(800 * 3);
  for (let i = 0; i < 800; i++) { const a = rnd() * 6.28, r = Math.sqrt(rnd()) * 24; gl.set([Math.cos(a) * r, 0.04, Math.sin(a) * r], i * 3); }
  const glGeo = new THREE.BufferGeometry();
  glGeo.setAttribute('position', new THREE.BufferAttribute(gl, 3));
  const glitter = new THREE.Points(glGeo, new THREE.PointsMaterial({ color: new THREE.Color(1.6, 1.7, 2), size: 0.06, map: flakeTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
  scene.add(glitter);
  updaters.push((t) => { glitter.material.opacity = 0.55 + 0.35 * Math.sin(t * 1.3); });

  /* ---- Forest ---- */
  const green = new THREE.Color('#11504a'), snowC = new THREE.Color('#e4edff'), cc = new THREE.Color();
  const parts = [];
  for (let k = 0; k < 4; k++) {
    const r = 1.35 - k * 0.27, h = 1.9, y = 0.9 + k * 0.95;
    const g = new THREE.ConeGeometry(r, h, 9);
    g.translate(0, y + h / 2, 0);
    const p = g.attributes.position, col = new Float32Array(p.count * 3);
    for (let i = 0; i < p.count; i++) {
      const f = (p.getY(i) - y) / h;
      cc.copy(green).lerp(snowC, smooth(0.02, 0.45, f) * 0.95);
      col.set([cc.r, cc.g, cc.b], i * 3);
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    parts.push(g);
  }
  const trunkG = new THREE.CylinderGeometry(0.18, 0.25, 1.2, 6); trunkG.translate(0, 0.6, 0);
  const tc = new Float32Array(trunkG.attributes.position.count * 3); cc.set('#3b2a1e');
  for (let i = 0; i < tc.length; i += 3) tc.set([cc.r, cc.g, cc.b], i);
  trunkG.setAttribute('color', new THREE.BufferAttribute(tc, 3));
  parts.push(trunkG);
  const firGeo = mergeGeometries(parts);

  const FERRIS = FERRIS_POS, CABINS = CABIN_POS, keepClear = CLEAR;
  const firs = [];
  while (firs.length < 800) {
    const a = rnd() * 6.28, r = 58 + Math.pow(rnd(), 0.8) * 60; // plaza + meadow + town form a clearing (r < ~56); forest all around it
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (keepClear.some(([cx, cz, cr]) => Math.hypot(x - cx, z - cz) < cr)) continue;
    firs.push({ x, z, s: 1.2 + rnd() * 1.5, ry: rnd() * 6.28 });
  }
  const forest = new THREE.InstancedMesh(firGeo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 }), firs.length);
  firs.forEach((f, i) => {
    dummy.position.set(f.x, terrainHeight(f.x, f.z) - 0.2, f.z);
    dummy.rotation.set(0, f.ry, 0); dummy.scale.setScalar(f.s); dummy.updateMatrix();
    forest.setMatrixAt(i, dummy.matrix);
  });
  scene.add(forest);

  /* ---- Cabins ---- */
  const winCol = new THREE.Color(2.6, 1.7, 0.7);
  CABINS.forEach(([x, z, ry]) => {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(3.2, 2.1, 2.6), new THREE.MeshStandardMaterial({ color: '#5b3328', roughness: 0.9 }));
    body.position.y = 1.05;
    const roof = new THREE.Mesh(new THREE.ConeGeometry(2.7, 1.5, 4), new THREE.MeshStandardMaterial({ color: '#e6eeff', roughness: 0.8 }));
    roof.rotation.y = Math.PI / 4; roof.scale.set(1.05, 1, 0.9); roof.position.y = 2.85;
    const chim = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.9, 0.4), new THREE.MeshStandardMaterial({ color: '#40322d' }));
    chim.position.set(0.9, 3.1, 0.3);
    g.add(body, roof, chim);
    for (const wx of [-0.8, 0.8]) {
      const w = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.7), new THREE.MeshBasicMaterial({ color: winCol, toneMapped: false }));
      w.position.set(wx, 1.2, 1.31); g.add(w);
      const gw = makeGlow(new THREE.Color(1.2, 0.7, 0.25), 2.6, 2.6, 0.6); gw.position.set(wx, 1.2, 1.7); g.add(gw);
    }
    g.position.set(x, terrainHeight(x, z), z); g.rotation.y = Math.atan2(-x, -z); // face the plaza
    scene.add(g);
  });

  /* ---- Lamp posts + string lights ---- */
  const LR = 9.5, lampAngles = [0.4, 1.45, 2.5, 3.55, 4.6, 5.65];
  const poleMat = new THREE.MeshStandardMaterial({ color: '#171c28', roughness: 0.6, metalness: 0.5 });
  const lampTops = [];
  lampAngles.forEach((a) => {
    const x = Math.cos(a) * LR, z = Math.sin(a) * LR;
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.11, 3.4, 8), poleMat); pole.position.set(x, 1.7, z);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 10), new THREE.MeshBasicMaterial({ color: new THREE.Color(1.8, 1.4, 0.8), toneMapped: false })); head.position.set(x, 3.55, z);
    const gl2 = makeGlow(new THREE.Color(1.3, 0.8, 0.35), 2.6, 2.6, 0.4); gl2.position.copy(head.position);
    const wreath = new THREE.Mesh(new THREE.TorusGeometry(0.27, 0.06, 8, 16), new THREE.MeshStandardMaterial({ color: '#17663a', roughness: 0.8 })); wreath.position.set(x, 2.5, z); wreath.rotation.y = -a + Math.PI / 2;
    const bow = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 6), new THREE.MeshStandardMaterial({ color: '#d62839' })); bow.position.set(x, 2.25, z);
    const lp = new THREE.Mesh(new THREE.PlaneGeometry(9, 9), new THREE.MeshBasicMaterial({ map: softTex, color: new THREE.Color(1, 0.65, 0.3), transparent: true, opacity: 0.14, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
    lp.rotation.x = -Math.PI / 2; lp.position.set(x, 0.06, z);
    scene.add(pole, head, gl2, wreath, bow, lp);
    lampTops.push(a);
  });
  const stringPts = [];
  lampAngles.forEach((a, i) => {
    const b = lampAngles[(i + 1) % lampAngles.length] + (i === lampAngles.length - 1 ? Math.PI * 2 : 0);
    for (let j = 1; j < 16; j++) {
      const u = j / 16, ang = a + (b - a) * u;
      stringPts.push(new THREE.Vector3(Math.cos(ang) * LR, 3.45 - 0.7 * Math.sin(u * Math.PI), Math.sin(ang) * LR));
    }
  });
  const pastel = ['#ffe3a3', '#ff8fa3', '#8fd3ff', '#b8ffb0', '#ffd166'].map((h) => new THREE.Color(h));
  const lampBulbs = bulbSet(stringPts, (i) => pastel[i % 5], 0.07);
  scene.add(lampBulbs.mesh);
  updaters.push((t) => lampBulbs.update(t, 1.7, 2.4));

  /* ---- Snowmen ---- */
  const snowMat = new THREE.MeshStandardMaterial({ color: '#f4f8ff', roughness: 0.8 });
  const dark = new THREE.MeshStandardMaterial({ color: '#15151c', roughness: 0.6 });
  function snowman(x, z, scale, color) {
    const g = new THREE.Group();
    [[0.7, 0.7], [0.5, 1.65], [0.36, 2.35]].forEach(([r, y]) => { const s = new THREE.Mesh(new THREE.SphereGeometry(r, 16, 12), snowMat); s.position.y = y; g.add(s); });
    const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 0.05, 14), dark); brim.position.y = 2.65;
    const topH = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.27, 0.4, 14), dark); topH.position.y = 2.88;
    const nose = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.4, 8), new THREE.MeshStandardMaterial({ color: '#ff8c1a' })); nose.rotation.x = Math.PI / 2; nose.position.set(0, 2.35, 0.4);
    const scarf = new THREE.Mesh(new THREE.TorusGeometry(0.34, 0.09, 8, 18), new THREE.MeshStandardMaterial({ color })); scarf.rotation.x = Math.PI / 2; scarf.position.y = 2.05;
    g.add(brim, topH, nose, scarf);
    for (const ex of [-0.12, 0.12]) { const e = new THREE.Mesh(new THREE.SphereGeometry(0.04, 6, 6), dark); e.position.set(ex, 2.45, 0.32); g.add(e); }
    for (const s of [-1, 1]) g.add(cylinderBetween(new THREE.Vector3(s * 0.45, 1.7, 0), new THREE.Vector3(s * 1.2, 2.1, 0), 0.03, new THREE.MeshStandardMaterial({ color: '#4a2f1d' })));
    g.position.set(x, 0, z); g.scale.setScalar(scale); g.rotation.y = Math.atan2(-x, -z);
    scene.add(g);
  }
  snowman(-8, 4.5, 0.85, '#d62839'); snowman(8.5, 3.2, 1.0, '#2a9d8f'); snowman(5.5, -8, 0.8, '#4361ee');

  /* ---- Ferris wheel ---- */
  {
    const root = new THREE.Group();
    root.position.set(FERRIS.x, terrainHeight(FERRIS.x, FERRIS.z), FERRIS.z);
    root.rotation.y = Math.atan2(-FERRIS.x, -FERRIS.z);
    root.scale.setScalar(1.3); // far away, so make it big
    const R = 8, cy = 9.5;
    const metal = new THREE.MeshStandardMaterial({ color: '#dfe8ff', roughness: 0.4, metalness: 0.6 });
    const wheel = new THREE.Group(); wheel.position.y = cy; root.add(wheel);
    for (const z of [-0.6, 0.6]) {
      const rim = new THREE.Mesh(new THREE.TorusGeometry(R, 0.09, 8, 72), metal); rim.position.z = z; wheel.add(rim);
      const rim2 = new THREE.Mesh(new THREE.TorusGeometry(R * 0.55, 0.06, 8, 48), metal); rim2.position.z = z; wheel.add(rim2);
    }
    const N = 14, bulbP = [];
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2, tip = new THREE.Vector3(Math.cos(a) * R, Math.sin(a) * R, 0);
      for (const z of [-0.6, 0.6]) wheel.add(cylinderBetween(new THREE.Vector3(0, 0, z), tip.clone().setZ(z), 0.04, metal));
    }
    for (let i = 0; i < 72; i++) { const a = (i / 72) * Math.PI * 2; bulbP.push(new THREE.Vector3(Math.cos(a) * R, Math.sin(a) * R, i % 2 ? 0.6 : -0.6)); }
    const wb = bulbSet(bulbP, (i) => new THREE.Color().setHSL(i / 72, 0.9, 0.6).multiplyScalar(1.4), 0.1);
    wheel.add(wb.mesh);
    const hub = new THREE.Mesh(new THREE.SphereGeometry(0.5, 12, 10), metal); wheel.add(hub);
    const pivots = [];
    const gcols = ['#e63946', '#f4a261', '#ffd166', '#80ed99', '#4cc9f0', '#c77dff'];
    for (let i = 0; i < N; i++) {
      const a = (i / N) * Math.PI * 2;
      const pv = new THREE.Group(); pv.position.set(Math.cos(a) * R, Math.sin(a) * R, 0);
      const car = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.95, 1.1), new THREE.MeshStandardMaterial({ color: gcols[i % 6], roughness: 0.5 }));
      car.position.y = -0.8;
      const lid = new THREE.Mesh(new THREE.ConeGeometry(0.95, 0.4, 4), new THREE.MeshStandardMaterial({ color: '#f1f5ff' }));
      lid.rotation.y = Math.PI / 4; lid.position.y = -0.1;
      const win = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.4), new THREE.MeshBasicMaterial({ color: winCol, toneMapped: false })); win.position.set(0, -0.75, 0.56);
      pv.add(car, lid, win); wheel.add(pv); pivots.push(pv);
    }
    for (const s of [-1, 1]) for (const z of [-0.6, 0.6]) root.add(cylinderBetween(new THREE.Vector3(0, cy, z), new THREE.Vector3(s * 4.5, 0, z * 3), 0.14, metal));
    scene.add(root);
    updaters.push((t, dt) => {
      wheel.rotation.z += dt * 0.07;
      pivots.forEach((p) => { p.rotation.z = -wheel.rotation.z; });
      wb.update(t, 1.5, 3);
    });
  }

  /* ---- Snowfall ---- */
  const snowLayers = [];
  function snowLayer(n, size, opacity, box, fall) {
    const [bx, by] = box;
    const layer = { n, active: n, geo: null };
    snowLayers.push(layer);
    const pos = new Float32Array(n * 3), sway = new Float32Array(n);
    for (let i = 0; i < n; i++) { pos.set([(rnd() - 0.5) * bx, rnd() * by, (rnd() - 0.5) * bx], i * 3); sway[i] = rnd() * 6.28; }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const pts = new THREE.Points(g, new THREE.PointsMaterial({ color: 0xffffff, size, map: flakeTex, transparent: true, opacity, depthWrite: false, fog: false }));
    pts.frustumCulled = false;
    layer.geo = g;
    scene.add(pts);
    updaters.push((t, dt) => {
      const a = g.attributes.position;
      for (let i = 0; i < layer.active; i++) {
        let y = a.getY(i) - dt * fall * (0.7 + (i % 5) * 0.15);
        if (y < 0) y += by;
        a.setY(i, y);
        a.setX(i, a.getX(i) + Math.sin(t * 0.7 + sway[i]) * dt * 0.25);
      }
      a.needsUpdate = true;
    });
  }
  snowLayer(2600, 0.075, 0.9, [60, 28], 0.9);
  snowLayer(140, 0.45, 0.3, [36, 16], 0.6);

  return {
    update(t, dt) { for (const u of updaters) u(t, dt); },
    /** q: { snow, bokeh, trees, glitter } — fractions 0..1 (glitter boolean). Cheap runtime quality switch. */
    setQuality(q) {
      [q.snow, q.bokeh].forEach((f, i) => {
        const l = snowLayers[i];
        l.active = Math.max(0, Math.round(l.n * f));
        l.geo.setDrawRange(0, l.active);
      });
      forest.count = Math.max(1, Math.round(firs.length * q.trees));
      glitter.visible = q.glitter;
    },
  };
}
