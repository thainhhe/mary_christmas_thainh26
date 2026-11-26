// Where players may walk. Shared by the browser (src/avatars.js) and BOTH servers (server/index.js, worker/hub.js),
// so the three always agree. Pure data + maths: no browser or Node APIs here.
//
// The walkable area is the union of
//   1. the plaza + meadow: a disc of WALK_RADIUS around the tree,
//   2. the "Broadway" avenue: a corridor leaving the plaza towards the south-west,
//   3. the Christmas market: a disc at the end of that avenue.

export const WALK_RADIUS = 32; // the plaza + meadow, up to the main street

const AVENUE_ANGLE = (3 * Math.PI) / 4;                  // south-west (behind-left of the default camera); one of the 8 avenues in roads.js (x = cos a, z = sin a)
export const AVENUE = { x: Math.cos(AVENUE_ANGLE), z: Math.sin(AVENUE_ANGLE), r0: 28, r1: 52, halfWidth: 2.4 };
export const SQUARE = {
  x: AVENUE.x * AVENUE.r1, z: AVENUE.z * AVENUE.r1, // centre of the Christmas market (about 52 units from the tree)
  radius: 11.2,                                      // walkable disc
};

const set = (out, x, z) => { out.x = x; out.z = z; return out; };

/** Nearest allowed position to (x, z); (x, z) itself when it is already allowed. Writes into `out` and returns it. */
export function clampWalk(x, z, out = {}) {
  const r = Math.hypot(x, z);
  if (r <= WALK_RADIUS) return set(out, x, z);

  // the avenue is a segment through the origin, so the point on its centre line is just the clamped projection
  const t = Math.min(AVENUE.r1, Math.max(AVENUE.r0, x * AVENUE.x + z * AVENUE.z));
  const cx = AVENUE.x * t, cz = AVENUE.z * t, dc = Math.hypot(x - cx, z - cz);
  if (dc <= AVENUE.halfWidth) return set(out, x, z);

  const ds = Math.hypot(x - SQUARE.x, z - SQUARE.z);
  if (ds <= SQUARE.radius) return set(out, x, z);

  // outside everything: take the closest of the three edges
  let bx = x * (WALK_RADIUS / r), bz = z * (WALK_RADIUS / r), bd = r - WALK_RADIUS;
  const kc = AVENUE.halfWidth / dc;
  if (dc - AVENUE.halfWidth < bd) { bd = dc - AVENUE.halfWidth; bx = cx + (x - cx) * kc; bz = cz + (z - cz) * kc; }
  if (ds - SQUARE.radius < bd) { const ks = SQUARE.radius / ds; bx = SQUARE.x + (x - SQUARE.x) * ks; bz = SQUARE.z + (z - SQUARE.z) * ks; }
  return set(out, bx, bz);
}
