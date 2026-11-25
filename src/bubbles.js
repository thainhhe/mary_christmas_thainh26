import * as THREE from 'three';

// Speech bubbles are DOM elements that follow a 3D anchor.
const layer = document.getElementById('bubbles');
const items = new Map(); // anchor -> {el, until, y}
const v = new THREE.Vector3();
let snap = [];
/** Current bubbles in normalised screen coordinates (0..1), independent of canvas size. */
export const bubbleSnapshot = () => snap;

export function say(anchor, text, { npc = false, ms = 5200, y = 3.0 } = {}) {
  const old = items.get(anchor);
  if (old) old.el.remove();
  const el = document.createElement('div');
  el.className = `bubble${npc ? ' npc' : ''}`;
  el.textContent = text;
  layer.append(el);
  items.set(anchor, { el, until: performance.now() + ms, y });
}

export function updateBubbles(camera) {
  const now = performance.now();
  const w = innerWidth, h = innerHeight;
  snap = [];
  for (const [anchor, it] of items) {
    if (now > it.until || !anchor.parent) { it.el.remove(); items.delete(anchor); continue; }
    anchor.getWorldPosition(v);
    v.y += it.y;
    v.project(camera);
    const hide = v.z > 1;
    snap.push({ nx: v.x * 0.5 + 0.5, ny: -v.y * 0.5 + 0.5, text: it.el.textContent, npc: it.el.classList.contains('npc'), hidden: hide });
    it.el.style.visibility = hide ? 'hidden' : 'visible';
    it.el.style.transform = `translate(${(v.x * 0.5 + 0.5) * w}px, ${(-v.y * 0.5 + 0.5) * h}px) translate(-50%, -100%)`;
  }
}
