import * as THREE from 'three';
import { createPerson, setLabel, resolveObstacles, randomWalkSpot } from './avatars.js';
import { HATS } from './state.js';
import { say } from './bubbles.js';

const MAX_PEOPLE = 36;
const hash = (s) => { let h = 2166136261; for (const c of String(s)) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; };
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
export const authorKey = (o) => o.by || `n:${o.name || 'anon'}`;

/**
 * Everyone who hung a wish is a character wandering the town. One character per author;
 * they speak their wishes now and then and can be clicked to read them.
 */
export function createWishers(scene) {
  const people = new Map(); // key -> entry
  const hitMat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false });
  const hitGeo = new THREE.CylinderGeometry(0.55, 0.55, 2.2, 8);
  let hiddenKey = null;
  let nextTalk = 4;

  function spawn(o, animate) {
    const key = authorKey(o);
    let e = people.get(key);
    if (e) { // known author: just remember the new wish
      e.wishes.push(o);
      e.color = o.color;
      e.g.userData.parts.body.material.color.set(o.color);
      if (o.name && o.name !== e.name) { e.name = o.name; setLabel(e.g, e.name, false); }
      return e;
    }
    const name = o.name || '';
    const g = createPerson({ shirt: o.color, hat: HATS[hash(key) % HATS.length], name: name || '✦' });
    const start = animate ? { x: 6.5, z: 1 } : randomWalkSpot();
    g.position.set(start.x, 0, start.z);
    const hit = new THREE.Mesh(hitGeo, hitMat);
    hit.position.y = 0.95; hit.userData.group = g; // scaled with the person
    g.add(hit);
    scene.add(g);
    e = { key, g, hit, name, color: o.color, wishes: [o], target: randomWalkSpot(), wait: 0, speed: 1.1 + (hash(key) % 100) / 100, born: animate ? performance.now() : -1, ph: Math.random() * 6 };
    g.userData.wisher = e;
    if (animate) g.scale.setScalar(0.01);
    people.set(key, e);
    if (people.size > MAX_PEOPLE) { // drop the longest-gone author
      const oldest = [...people.values()].sort((a, b) => (a.wishes.at(-1).createdAt || 0) - (b.wishes.at(-1).createdAt || 0))[0];
      if (oldest && oldest !== e) remove(oldest.key);
    }
    return e;
  }
  function remove(key) {
    const e = people.get(key);
    if (!e) return;
    scene.remove(e.g);
    people.delete(key);
  }

  return {
    get size() { return people.size; },
    entries: () => [...people.values()],
    hitboxes: () => [...people.values()].filter((e) => e.g.visible).map((e) => e.hit),
    add(o, animate = false) {
      const e = spawn(o, animate);
      if (animate) {
        e.g.visible = e.key !== hiddenKey;
        if (e.g.visible) say(e.g, o.wish.slice(0, 90), { y: 3.0, ms: 6500 });
      }
    },
    /** The local player's own avatar stands in for their wishing character. */
    setHidden(key) {
      hiddenKey = key;
      for (const e of people.values()) e.g.visible = e.key !== key;
    },
    latestWish: (e) => e.wishes.at(-1),
    update(dt, time) {
      const now = performance.now();
      for (const e of people.values()) {
        if (!e.g.visible) continue;
        const g = e.g, p = g.position;
        if (e.born > 0) {
          const k = Math.min((now - e.born) / 700, 1);
          g.scale.setScalar(Math.max(1.25 * (1 - Math.pow(1 - k, 3)), 0.01));
          if (k >= 1) e.born = -1;
        }
        if (e.wait > 0) {
          e.wait -= dt;
          p.y *= 0.8;
          if (e.wait <= 0) e.target = randomWalkSpot();
          continue;
        }
        const dx = e.target.x - p.x, dz = e.target.z - p.z, d = Math.hypot(dx, dz);
        if (d < 0.2) { e.wait = 2 + Math.random() * 7; g.rotation.y = Math.atan2(-p.x, -p.z); continue; }
        const step = Math.min(d, e.speed * dt);
        p.x += (dx / d) * step; p.z += (dz / d) * step;
        resolveObstacles(p);
        g.rotation.y += wrap(Math.atan2(dx, dz) - g.rotation.y) * 0.15;
        p.y = Math.abs(Math.sin(time * 6 + e.ph)) * 0.05;
      }
      // One person speaks at a time, every few seconds, so the screen never fills with bubbles.
      nextTalk -= dt;
      if (nextTalk <= 0) {
        nextTalk = 3.5 + Math.random() * 3.5;
        const list = [...people.values()].filter((e) => e.g.visible);
        if (list.length) {
          const e = list[(Math.random() * list.length) | 0];
          say(e.g, e.wishes[(Math.random() * e.wishes.length) | 0].wish.slice(0, 90), { y: 3.0, ms: 5200 });
        }
      }
    },
  };
}
