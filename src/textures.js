import * as THREE from 'three';
import { SQUARE } from '../shared/walk.js';

export function glowTexture(stops, size = 128) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  stops.forEach(([o, col]) => gr.addColorStop(o, col));
  g.fillStyle = gr;
  g.fillRect(0, 0, size, size);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export const softTex = glowTexture([[0, 'rgba(255,255,255,1)'], [0.3, 'rgba(255,255,255,.55)'], [1, 'rgba(255,255,255,0)']]);
export const flakeTex = glowTexture([[0, 'rgba(255,255,255,1)'], [0.45, 'rgba(255,255,255,.9)'], [1, 'rgba(255,255,255,0)']]);
export const discTex = glowTexture([[0, '#fff'], [0.92, '#fff'], [1, 'rgba(255,255,255,0)']]);

/** Additive glow sprite. Colour can exceed 1 to push it into bloom. */
export function makeGlow(color, scaleX, scaleY = scaleX, opacity = 1, map = softTex) {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({
    map, color, opacity, transparent: true, depthWrite: false,
    blending: THREE.AdditiveBlending, toneMapped: false, fog: false,
  }));
  s.scale.set(scaleX, scaleY, 1);
  return s;
}

export function mulberry(a) {
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const smooth = (a, b, x) => {
  const t = Math.min(Math.max((x - a) / (b - a), 0), 1);
  return t * t * (3 - 2 * t);
};
const hash = (x, y) => { const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return s - Math.floor(s); };
export function vnoise(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const l = (a, b, t) => a + (b - a) * t;
  return l(l(hash(xi, yi), hash(xi + 1, yi), u), l(hash(xi, yi + 1), hash(xi + 1, yi + 1), u), v);
}

export function terrainHeight(x, z) {
  const d = Math.hypot(x, z);
  const hill = 20 * Math.exp(-(((x - 6) ** 2) / (2 * 13 * 13) + ((z + 62) ** 2) / (2 * 14 * 14))); // ski slope, far behind the tree
  const flat = smooth(SQUARE.radius + 1, SQUARE.radius + 10, Math.hypot(x - SQUARE.x, z - SQUARE.z)); // level ground under the Christmas market, easing into the hills
  return flat * (smooth(38, 82, d) * (2 + 9 * vnoise(x * 0.045 + 10, z * 0.045)) + 0.1 * vnoise(x * 0.6, z * 0.6) * smooth(8, 20, d) + hill);
}
