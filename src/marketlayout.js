import { SQUARE, AVENUE } from '../shared/walk.js';

/**
 * Layout of the Christmas market (a Bavarian "Weihnachtsmarkt" village square, in the spirit of Leavenworth) at the end of
 * the south-west avenue. Shared by the scenery (market.js), the walking collisions (avatars.js) and the clear zones (env.js).
 *
 * Local frame: the square's centre is the origin, +z points at the tree (the avenue arrives from +z), +x is to the right when
 * you stand at the entrance and look into the square. Buildings turn their +z face towards the middle of the square.
 */
export const MARKET = { x: SQUARE.x, z: SQUARE.z, ry: Math.atan2(-SQUARE.x, -SQUARE.z), radius: SQUARE.radius };

/** local -> world (x, z) */
export function marketWorld(lx, lz) {
  const c = Math.cos(MARKET.ry), s = Math.sin(MARKET.ry);
  return [MARKET.x + lx * c + lz * s, MARKET.z - lx * s + lz * c];
}

/** Timber-framed buildings around the square. h = height of the walls (the roof comes on top). */
export const BUILDINGS = [
  { id: 'clock', x: 0,    z: -9.6, w: 4.8, d: 4.8, h: 11.5 }, // clock tower with the countdown board and the star
  { id: 'east',  x: 9.6,  z: -4.0, w: 6.2, d: 5.2, h: 6.4 },  // wish board
  { id: 'west',  x: -9.6, z: -4.0, w: 6.2, d: 5.2, h: 6.8 },  // chalkboard leaderboard
  { id: 'ne',    x: 9.0,  z: 6.6,  w: 4.6, d: 4.2, h: 4.6 },  // gingerbread shop
  { id: 'nw',    x: -9.0, z: 6.6,  w: 4.6, d: 4.2, h: 4.8 },  // mulled-wine house
];
export const STALLS = [[-5.0, -8.0], [5.0, -8.0], [-8.0, 1.4], [8.0, 1.4], [-4.8, 4.6], [4.8, 4.6]];
export const SLEIGHS = [[-3.6, -2.8, 0.5], [3.6, -2.8, -0.5]];           // x, z, heading
export const NUTCRACKERS = [[-3.3, 7.4], [3.3, 7.4]];
export const GATE = { z: 9.6, halfWidth: 3.3 };                           // the welcome arch at the entrance
export const PYRAMID = { x: 0, z: 0.2 };                                  // the turning Christmas pyramid in the middle

/** Solid things you cannot walk through, local [x, z, radius] */
const LOCAL_OBSTACLES = [
  ...BUILDINGS.map((b) => [b.x, b.z, Math.max(b.w, b.d) / 2 + 0.5]),
  ...STALLS.map(([x, z]) => [x, z, 1.3]),
  [PYRAMID.x, PYRAMID.z, 1.7],
  ...SLEIGHS.map(([x, z]) => [x, z, 1.5]),
  ...NUTCRACKERS.map(([x, z]) => [x, z, 0.7]),
  [-GATE.halfWidth, GATE.z, 0.45], [GATE.halfWidth, GATE.z, 0.45],
];
export const MARKET_OBSTACLES = LOCAL_OBSTACLES.map(([x, z, r]) => [...marketWorld(x, z), r]);

/** Spots (world x, z, radius) where houses, trees and the forest must keep out: the square and the avenue leading to it. */
export const MARKET_CLEAR = [
  [MARKET.x, MARKET.z, 17],
  ...[38, 42, 46].map((r) => [AVENUE.x * r, AVENUE.z * r, 4.5]),
];
