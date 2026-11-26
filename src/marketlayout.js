import { SQUARE, AVENUE } from '../shared/walk.js';

/**
 * Layout of the Christmas market (a Bavarian "Weihnachtsmarkt" village square, in the spirit of Leavenworth) at the end of
 * the south-west avenue. Shared by the scenery (market.js), the walking collisions (avatars.js) and the clear zones (env.js).
 *
 * Local frame: the square's centre is the origin, +z points at the tree (the avenue arrives from +z), +x is to the right when
 * you stand at the entrance and look into the square. Buildings turn their +z face towards the middle of the square.
 *
 * The square has a radius of 22: nine houses stand round the edge (r ~ 20), twelve stalls form a ring at r = 12.6 and
 * the Christmas pyramid is in the middle, with five lit firs and two sleighs in between.
 */
export const MARKET = { x: SQUARE.x, z: SQUARE.z, ry: Math.atan2(-SQUARE.x, -SQUARE.z), radius: SQUARE.radius };

/** local -> world (x, z) */
export function marketWorld(lx, lz) {
  const c = Math.cos(MARKET.ry), s = Math.sin(MARKET.ry);
  return [MARKET.x + lx * c + lz * s, MARKET.z - lx * s + lz * c];
}

/** Timber-framed buildings around the square. h = height of the walls (the roof comes on top). */
export const BUILDINGS = [
  { id: 'clock',  x: 0,     z: -19.0, w: 4.8, d: 4.8, h: 11.5 }, // clock tower with the countdown board and the star
  { id: 'east',   x: 17.6,  z: -8.3,  w: 6.2, d: 5.2, h: 6.4 },  // wish board
  { id: 'west',   x: -17.6, z: -8.3,  w: 6.2, d: 5.2, h: 6.8 },  // chalkboard leaderboard
  { id: 'ne',     x: 18.0,  z: 7.8,   w: 4.6, d: 4.2, h: 4.6 },  // gingerbread shop
  { id: 'nw',     x: -18.0, z: 7.8,   w: 4.6, d: 4.2, h: 4.8 },  // mulled-wine house
  { id: 'inn',    x: 10.8,  z: -16.0, w: 5.6, d: 4.8, h: 6.0 },  // inn (Gasthaus)
  { id: 'cafe',   x: -10.8, z: -16.0, w: 5.6, d: 4.8, h: 5.6 },  // coffee and cocoa house
  { id: 'toy',    x: 19.6,  z: 0.8,   w: 4.6, d: 4.2, h: 4.8 },  // toy shop
  { id: 'bakery', x: -19.6, z: 0.8,   w: 4.6, d: 4.2, h: 5.0 },  // bakery
];
// a ring of stalls at r = 12.6 (every 20-45 degrees, leaving the way in from the gate open)
export const STALLS = [0, 20, 45, 135, 160, 180, 200, 225, 250, 290, 315, 340].map((deg) => {
  const a = (deg * Math.PI) / 180;
  return [Math.cos(a) * 12.6, Math.sin(a) * 12.6];
});
// stalls (index into STALLS) that have a mini-game: all twelve. The four nearest the entrance (1-4) are the simplest ones.
export const STALL_GAMES = { 0: 'catch', 1: 'rings', 2: 'balloons', 3: 'snow', 4: 'fishing', 5: 'whack', 6: 'memory', 7: 'archery', 8: 'cups', 9: 'plinko', 10: 'bells', 11: 'tower' };
export const SLEIGHS = [[-7.0, -4.4, 0.5], [7.0, -4.4, -0.5]];            // x, z, heading
export const NUTCRACKERS = [[-3.6, 17.0], [3.6, 17.0], [-3.6, 10.2], [3.6, 10.2]];
export const TREES = [[7.4, 0], [-7.4, 0], [5.2, 5.2], [-5.2, 5.2], [0, -7.4]]; // little lit firs between the pyramid and the stalls
export const GATE = { z: 20.5, halfWidth: 3.3 };                          // the welcome arch at the entrance
export const PYRAMID = { x: 0, z: 0.2 };                                  // the turning Christmas pyramid in the middle

/** Solid things you cannot walk through, local [x, z, radius] */
export const LOCAL_OBSTACLES = [
  ...BUILDINGS.map((b) => [b.x, b.z, Math.max(b.w, b.d) / 2 + 0.5]),
  ...STALLS.map(([x, z]) => [x, z, 1.3]),
  [PYRAMID.x, PYRAMID.z, 1.7],
  ...SLEIGHS.map(([x, z]) => [x, z, 1.5]),
  ...NUTCRACKERS.map(([x, z]) => [x, z, 0.7]),
  ...TREES.map(([x, z]) => [x, z, 0.8]),
  [-GATE.halfWidth, GATE.z, 0.45], [GATE.halfWidth, GATE.z, 0.45],
];
export const MARKET_OBSTACLES = LOCAL_OBSTACLES.map(([x, z, r]) => [...marketWorld(x, z), r]);

/** Spots (world x, z, radius) where houses, trees and the forest must keep out: the square and the avenue leading to it. */
export const MARKET_CLEAR = [
  [MARKET.x, MARKET.z, MARKET.radius + 5],
  ...[38, 42].map((r) => [AVENUE.x * r, AVENUE.z * r, 4.5]),
];
