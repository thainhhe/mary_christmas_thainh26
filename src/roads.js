import * as THREE from 'three';
import { terrainHeight, mulberry, makeGlow } from './textures.js';
import { bulbSet } from './env.js';

// Street plan (world units). Everything is painted into one texture, so junctions merge cleanly.
export const ROADS = {
  plazaRing: { r: 11.3, w: 1.8 },   // paved path just outside the lamp posts
  outerRing: { r: 19.5, w: 4.2 },   // the road around the tree plaza
  mainRing: { r: 35, w: 3.4 },      // main street, right in front of the houses
  spokeW: 2.6,                      // plaza ring -> outer ring, at the 4 compass directions
  avenueW: 2.8,                     // outer ring -> main street, every 45°
  cinemaStop: 26,                   // the east avenue ends where the cinema seats begin
  squareStop: 41,                   // the south-west avenue (k=3, 135 deg) goes on past the main street, all the way to the Christmas market
};

const SIZE = 84;           // the road layer covers ±42 units
const TEX = 2048;
const S = TEX / SIZE;      // texture pixels per world unit

function cobbleTile(rnd) {
  const tile = document.createElement('canvas');
  tile.width = tile.height = 48;
  const g = tile.getContext('2d');
  g.fillStyle = '#23263a'; g.fillRect(0, 0, 48, 48);
  for (let r = 0; r < 4; r++) {
    for (let c = -1; c < 4; c++) {
      const x = c * 12 + (r % 2 ? 6 : 0) + 1, y = r * 12 + 1;
      g.fillStyle = `hsl(228,${12 + Math.round(rnd() * 8)}%,${Math.round(40 + rnd() * 14)}%)`;
      g.beginPath(); g.roundRect(x, y, 10, 10, 3); g.fill();
      g.fillStyle = 'rgba(255,255,255,.10)'; g.fillRect(x + 1, y + 1, 8, 2); // little highlight on top of each stone
    }
  }
  return tile;
}

export function buildRoads(scene) {
  const rnd = mulberry(31);
  const cv = document.createElement('canvas');
  cv.width = cv.height = TEX;
  const g = cv.getContext('2d');
  const C = TEX / 2;

  const paths = [
    { ring: true, ...ROADS.plazaRing },
    { ring: true, ...ROADS.outerRing },
    { ring: true, ...ROADS.mainRing },
  ];
  for (let k = 0; k < 4; k++) paths.push({ a: (k * Math.PI) / 2, r0: ROADS.plazaRing.r, r1: ROADS.outerRing.r, w: ROADS.spokeW });
  for (let k = 0; k < 8; k++) {
    const a = (k * Math.PI) / 4;
    paths.push({ a, r0: ROADS.outerRing.r, r1: k === 0 ? ROADS.cinemaStop : k === 3 ? ROADS.squareStop : ROADS.mainRing.r, w: ROADS.avenueW });
  }

  const stroke = (extra, style, alpha = 1) => {
    g.strokeStyle = g.fillStyle = style; g.globalAlpha = alpha; g.lineCap = 'butt';
    for (const p of paths) {
      const w = (p.w + extra) * S;
      if (p.ring) {
        g.lineWidth = w;
        g.beginPath(); g.arc(C, C, p.r * S, 0, Math.PI * 2); g.stroke();
        continue;
      }
      // Straight roads are FILLED as a quad instead of stroked as a line: on iOS Safari a pattern-stroked line that is
      // exactly horizontal/vertical (the 4 spokes and 4 of the avenues) drew nothing, leaving black gaps in the road.
      const ca = Math.cos(p.a), sa = Math.sin(p.a), hx = (-sa * w) / 2, hy = (ca * w) / 2; // half-width, perpendicular to the road
      const x0 = C + ca * p.r0 * S, y0 = C + sa * p.r0 * S, x1 = C + ca * p.r1 * S, y1 = C + sa * p.r1 * S;
      g.beginPath();
      g.moveTo(x0 - hx, y0 - hy); g.lineTo(x1 - hx, y1 - hy); g.lineTo(x1 + hx, y1 + hy); g.lineTo(x0 + hx, y0 + hy);
      g.closePath(); g.fill();
    }
    g.globalAlpha = 1;
  };
  stroke(1.8, '#e8f0ff', 0.2);   // soft snow banks
  stroke(1.0, '#e8f0ff', 0.35);
  stroke(0.45, '#1b1e2e');       // curb
  stroke(0, g.createPattern(cobbleTile(rnd), 'repeat')); // cobblestones
  // dashed warm centre line on the two big ring roads
  g.setLineDash([S * 1.1, S * 1.5]); g.strokeStyle = '#d9b46a'; g.globalAlpha = 0.6; g.lineWidth = 0.12 * S;
  for (const r of [ROADS.outerRing.r, ROADS.mainRing.r]) { g.beginPath(); g.arc(C, C, r * S, 0, Math.PI * 2); g.stroke(); }
  g.setLineDash([]); g.globalAlpha = 1;

  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;

  // A plane that follows the terrain, floating just above the snow
  const geo = new THREE.PlaneGeometry(SIZE, SIZE, 168, 168);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) pos.setY(i, terrainHeight(pos.getX(i), pos.getZ(i)) + 0.1);
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({
    map: tex, transparent: true, roughness: 0.92, metalness: 0, depthWrite: false,
    emissive: '#8a93b8', emissiveMap: tex, emissiveIntensity: 0.22, // so the stones never go pitch black at night
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
  }));
  mesh.renderOrder = 1;
  scene.add(mesh);

  /* ---- Lamps along the outer ring road ---- */
  const N = 16, heads = [];
  const poles = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.06, 0.09, 3, 6), new THREE.MeshStandardMaterial({ color: '#171c28', roughness: 0.6, metalness: 0.5 }), N);
  const dm = new THREE.Object3D();
  for (let i = 0; i < N; i++) {
    const a = ((i + 0.5) / N) * Math.PI * 2, r = ROADS.outerRing.r + ROADS.outerRing.w / 2 + 0.7;
    const x = Math.cos(a) * r, z = Math.sin(a) * r, y = terrainHeight(x, z);
    dm.position.set(x, y + 1.5, z); dm.updateMatrix(); poles.setMatrixAt(i, dm.matrix);
    heads.push(new THREE.Vector3(x, y + 3.1, z));
  }
  scene.add(poles);
  const bulbs = bulbSet(heads, () => new THREE.Color(1.0, 0.72, 0.38), 0.17);
  scene.add(bulbs.mesh);
  heads.forEach((p, i) => { if (i % 2 === 0) { const gl = makeGlow(new THREE.Color(1.1, 0.7, 0.3), 3.2, 3.2, 0.35); gl.position.copy(p); scene.add(gl); } });

  return { update(t) { bulbs.update(t, 2.2, 1.4); } };
}
