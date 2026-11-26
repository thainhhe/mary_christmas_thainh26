import * as THREE from 'three';
import { mulberry, terrainHeight } from './textures.js';
import { t } from './i18n.js';
import { say } from './bubbles.js';
import { WALK_RADIUS, clampWalk } from '../shared/walk.js';
import { MARKET_OBSTACLES } from './marketlayout.js';
import { TAROT_OBSTACLES } from './tarotlayout.js';

export { WALK_RADIUS }; // the plaza + meadow (NPCs and wishing characters stay in it; players may also go to the Christmas market, see clampWalk)
const TREE_CLEAR = 4.5; // keep avatars off the tree + presents
// Solid props on the ground: [x, z, radius]. Walkers are pushed out of them.
const OBSTACLES = [[-36, -22, 2.6], [22, -36, 2.6], [-14, 40, 2.6], [-12.2, -4, 2.2], [-7.2, -7.4, 2.2], [13.5, 6.5, 2.0], [9, 9.5, 0.9], [-9.4, -2.2, 1.1], ...MARKET_OBSTACLES, ...TAROT_OBSTACLES];
export function resolveObstacles(p) {
  const r = Math.hypot(p.x, p.z);
  if (r < TREE_CLEAR) { const m = TREE_CLEAR / (r || 1); p.x *= m; p.z *= m; }
  for (const [ox, oz, or] of OBSTACLES) {
    const dx = p.x - ox, dz = p.z - oz, d = Math.hypot(dx, dz);
    if (d < or) { const m = or / (d || 1); p.x = ox + dx * m; p.z = oz + dz * m; }
  }
}
export const randomWalkSpot = (minR = 5.5, maxR = 26) => { // stay mostly around the plaza
  const a = Math.random() * Math.PI * 2, r = minR + Math.pow(Math.random(), 0.85) * (maxR - minR);
  const p = { x: Math.cos(a) * r, z: Math.sin(a) * r };
  resolveObstacles(p);
  return p;
};

/* ---------- Model ---------- */
function labelTexture(name, npc) {
  const c = document.createElement('canvas');
  c.width = 320; c.height = 64;
  const g = c.getContext('2d');
  g.font = `${npc ? 'italic ' : ''}600 26px system-ui, sans-serif`;
  const tag = npc ? ` ${t('npc.tag')}` : ' ✦';
  const w = Math.min(g.measureText(name).width + (npc ? 92 : 64), 312);
  g.fillStyle = 'rgba(10,20,50,.8)';
  g.beginPath(); g.roundRect((320 - w) / 2, 8, w, 48, 24); g.fill();
  g.textBaseline = 'middle'; g.textAlign = 'left';
  const nameW = g.measureText(name).width;
  const x0 = (320 - nameW - g.measureText(tag).width) / 2;
  g.fillStyle = '#eef4ff'; g.fillText(name, x0, 33);
  g.font = '700 18px system-ui, sans-serif';
  g.fillStyle = npc ? '#9bb0d8' : '#f7b955';
  g.fillText(tag, x0 + nameW, 34);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function setLabel(person, name, npc = false) {
  const s = person.userData.label;
  s.material.map?.dispose();
  s.material.map = labelTexture(name, npc);
  s.material.needsUpdate = true;
}

export function createPerson({ shirt = '#e63946', hat = '#d62839', name = '', npc = false } = {}) {
  const g = new THREE.Group();
  const mat = (c, r = 0.7) => new THREE.MeshStandardMaterial({ color: c, roughness: r });
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.2, 0.42, 4, 10), mat(shirt));
  body.position.y = 0.52;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.17, 14, 12), mat('#ffd9b5', 0.6));
  head.position.y = 1.0;
  const cone = new THREE.Mesh(new THREE.ConeGeometry(0.17, 0.36, 12), mat(hat));
  cone.position.set(0, 1.27, -0.02); cone.rotation.x = -0.18;
  const brim = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.045, 8, 14), mat('#f5f8ff'));
  brim.rotation.x = Math.PI / 2; brim.position.y = 1.12;
  const bob = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 8), mat('#f5f8ff'));
  bob.position.set(0, 1.44, -0.08);
  const scarf = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.05, 8, 14), mat(hat));
  scarf.rotation.x = Math.PI / 2; scarf.position.y = 0.84;
  const eyeM = mat('#1b1b25');
  for (const x of [-0.06, 0.06]) { const e = new THREE.Mesh(new THREE.SphereGeometry(0.022, 6, 6), eyeM); e.position.set(x, 1.02, 0.15); g.add(e); }
  const label = new THREE.Sprite(new THREE.SpriteMaterial({ map: labelTexture(name, npc), depthWrite: false, toneMapped: false, fog: false, color: new THREE.Color(0.8, 0.8, 0.8) }));
  label.scale.set(1.6, 0.4, 1);
  label.position.y = 1.95;
  // Transparent layers are drawn in renderOrder: the road overlay (1) and the market floor (2) are transparent too, and a
  // label drawn before them gets painted over (cut off, or hidden) whenever a road lies behind it on screen. Draw it last.
  label.renderOrder = 10;
  g.add(body, head, cone, brim, bob, scarf, label);
  g.scale.setScalar(1.25);
  g.userData.label = label;
  g.userData.parts = { body, cone, scarf };
  return g;
}

const wrapAngle = (a) => Math.atan2(Math.sin(a), Math.cos(a));
function faceTo(g, ang, k) { g.rotation.y += wrapAngle(ang - g.rotation.y) * k; }

/* ---------- Local player ---------- */
export class LocalPlayer {
  constructor(scene) {
    this.scene = scene; this.g = null; this.target = null; this.keys = new Set(); this.phase = 0;
    this.joy = { x: 0, y: 0 }; // on-screen joystick, each axis -1..1
    this.stuck = 0; // consecutive frames spent pushing against an obstacle on the way to the target
    addEventListener('keydown', (e) => { if (!/^(INPUT|TEXTAREA)$/.test(e.target.tagName) && !document.querySelector('dialog[open]')) this.keys.add(e.code); }); // no walking while a dialog (or a mini-game) is open
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => this.keys.clear());
  }
  get active() { return !!this.g; }
  spawn(info) {
    this.despawn();
    this.g = createPerson(info);
    this.bob = 0;
    this.g.position.set(info.x ?? 7, terrainHeight(info.x ?? 7, info.z ?? 0), info.z ?? 0);
    this.scene.add(this.g);
  }
  despawn() { if (this.g) { this.scene.remove(this.g); this.g = null; } this.target = null; }
  recolor({ shirt, hat }) {
    if (!this.g) return;
    this.g.userData.parts.body.material.color.set(shirt);
    this.g.userData.parts.cone.material.color.set(hat);
    this.g.userData.parts.scarf.material.color.set(hat);
  }
  setTarget(x, z) {
    const goal = clampWalk(x, z);
    resolveObstacles(goal); // a click on the tree / campfire / bench: walk to the nearest free spot instead
    clampWalk(goal.x, goal.z, goal);
    this.target = goal; this.stuck = 0;
  }
  /** Returns the distance actually travelled this frame (pushed-back steps do not count). */
  update(dt, camera) {
    if (!this.g) return 0;
    const p = this.g.position;
    let dx = 0, dz = 0;
    const k = this.keys;
    const f = (k.has('KeyW') || k.has('ArrowUp') ? 1 : 0) - (k.has('KeyS') || k.has('ArrowDown') ? 1 : 0);
    const s = (k.has('KeyD') || k.has('ArrowRight') ? 1 : 0) - (k.has('KeyA') || k.has('ArrowLeft') ? 1 : 0);
    const jm = Math.hypot(this.joy.x, this.joy.y), jf = jm > 0.12 ? -this.joy.y : 0, js = jm > 0.12 ? this.joy.x : 0;
    const manual = !!(f || s || jm > 0.12);
    if (manual) {
      this.target = null;
      const fw = new THREE.Vector3(); camera.getWorldDirection(fw); fw.y = 0; fw.normalize();
      const rt = new THREE.Vector3(-fw.z, 0, fw.x);
      dx = fw.x * (f + jf) + rt.x * (s + js); dz = fw.z * (f + jf) + rt.z * (s + js);
      const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
    } else if (this.target) {
      dx = this.target.x - p.x; dz = this.target.z - p.z;
      const l = Math.hypot(dx, dz);
      if (l < 0.12) { this.target = null; dx = dz = 0; } else { dx /= l; dz /= l; }
    }
    let moved = 0;
    if (dx || dz) {
      const step = 3.6 * dt, bx = p.x, bz = p.z;
      p.x += dx * step; p.z += dz * step;
      clampWalk(p.x, p.z, p);
      resolveObstacles(p);
      clampWalk(p.x, p.z, p); // being pushed out of a building must not carry us outside the walkable area
      moved = Math.hypot(p.x - bx, p.z - bz);
      if (!manual && this.target) { // give up when an obstacle keeps pushing us back
        this.stuck = moved < step * 0.3 ? this.stuck + 1 : 0;
        if (this.stuck > 20) { this.target = null; this.stuck = 0; }
      }
      faceTo(this.g, Math.atan2(dx, dz), 0.25);
      this.phase += dt * 9;
      this.bob = Math.abs(Math.sin(this.phase)) * 0.06;
    } else this.bob *= 0.8;
    p.y = terrainHeight(p.x, p.z) + this.bob; // stand ON the ground: it rises up to ~2 units towards the ski slope
    return moved;
  }
}

/* ---------- Other players ---------- */
export class Crowd {
  constructor(scene) { this.scene = scene; this.map = new Map(); }
  add(p) {
    if (this.map.has(p.id)) return;
    const g = createPerson(p);
    g.position.set(p.x, terrainHeight(p.x, p.z), p.z);
    this.scene.add(g);
    this.map.set(p.id, { g, tx: p.x, tz: p.z, name: p.name, ph: Math.random() * 6, bob: 0 });
  }
  move(id, x, z) { const e = this.map.get(id); if (e) { e.tx = x; e.tz = z; } }
  remove(id) { const e = this.map.get(id); if (e) { this.scene.remove(e.g); this.map.delete(id); } }
  get(id) { return this.map.get(id)?.g; }
  clear() { for (const id of [...this.map.keys()]) this.remove(id); }
  update(dt, time) {
    for (const e of this.map.values()) {
      const p = e.g.position, dx = e.tx - p.x, dz = e.tz - p.z, d = Math.hypot(dx, dz);
      if (d > 0.03) {
        const step = Math.min(d, Math.max(3.6, d * 4) * dt);
        p.x += (dx / d) * step; p.z += (dz / d) * step;
        faceTo(e.g, Math.atan2(dx, dz), 0.25);
        e.bob = Math.abs(Math.sin(time * 9 + e.ph)) * 0.06;
      } else e.bob *= 0.8;
      p.y = terrainHeight(p.x, p.z) + e.bob;
    }
  }
}

/* ---------- NPCs ---------- */
const COATS = ['#e76f51', '#457b9d', '#c0392b', '#e9c46a', '#9b5de5', '#f28482', '#6d9dc5', '#2a9d8f'];
const HATS = ['#d62839', '#2a6fdb', '#2fa36b', '#f2a900', '#a855f7', '#e11d74'];

export function buildNPCs(scene) {
  const rnd = mulberry(21);
  const list = Array.from({ length: 8 }, (_, i) => {
    const g = createPerson({ shirt: i === 2 ? '#c0392b' : COATS[i], hat: HATS[i % HATS.length], name: t('npc.names')[i], npc: true });
    scene.add(g);
    return { g, i, standing: i % 3 === 0, R: 5.4 + rnd() * 4.5, a: rnd() * Math.PI * 2, w: (rnd() > 0.5 ? 1 : -1) * (0.035 + rnd() * 0.05), ph: rnd() * 6.28, next: 4 + rnd() * 14 };
  });
  return {
    list,
    setVisibleCount(n) { list.forEach((x, i) => { x.g.visible = i < n; }); },
    relabel() { list.forEach((n) => setLabel(n.g, t('npc.names')[n.i], true)); },
    update(time, dt, quiet) {
      const lines = t('npc.lines');
      for (const n of list) {
        if (!n.g.visible) continue;
        if (!n.standing) n.a += n.w * dt;
        const x = Math.cos(n.a) * n.R, z = Math.sin(n.a) * n.R;
        n.g.position.set(x, terrainHeight(x, z) + (n.standing ? Math.sin(time * 1.6 + n.ph) * 0.015 : Math.abs(Math.sin(time * 5 + n.ph)) * 0.05), z);
        if (n.standing) n.g.rotation.y = Math.atan2(-x, -z);
        else { const s = Math.sign(n.w); n.g.rotation.y = Math.atan2(-Math.sin(n.a) * s, Math.cos(n.a) * s); }
        n.next -= dt;
        if (n.next <= 0) {
          n.next = 10 + Math.random() * 18;
          if (!quiet) say(n.g, lines[(Math.random() * lines.length) | 0], { npc: true, ms: 4800 });
        }
      }
    },
  };
}
