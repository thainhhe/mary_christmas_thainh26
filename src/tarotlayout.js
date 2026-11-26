/**
 * Where the tarot caravan stands: just outside the paved path round the plaza, a few steps from the snowman with the blue
 * scarf (5.5, -8). Pure data (no three.js), shared by the scenery (tarot.js) and the walking collisions (avatars.js).
 *
 * Local frame: the caravan's centre is the origin, +x runs along its length, +z is the serving-hatch side and faces the tree.
 */
const A = (-41 * Math.PI) / 180, R = 14.8;
export const TAROT = { x: Math.cos(A) * R, z: Math.sin(A) * R };
TAROT.ry = Math.atan2(-TAROT.x, -TAROT.z);

/** local -> world (x, z) */
export function tarotWorld(lx, lz) {
  const c = Math.cos(TAROT.ry), s = Math.sin(TAROT.ry);
  return [TAROT.x + lx * c + lz * s, TAROT.z - lx * s + lz * c];
}

/** where a customer stands, in front of the hatch */
export const TAROT_SPOT = { lx: 0.45, lz: 2.5 };

/** Solid parts, world [x, z, radius]: five circles along the body and one for the tow hitch. */
export const TAROT_OBSTACLES = [
  ...[-2.1, -1.05, 0, 1.05, 2.1].map((lx) => [...tarotWorld(lx, 0.2), 1.45]),
  [...tarotWorld(-3.3, 0), 0.5],
];
