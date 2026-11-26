import { FERRIS, FERRIS_PAD } from '../shared/walk.js';

/**
 * Where the Ferris wheel's boarding pad is. Pure data (no three.js): shared by the scenery + ride (ferris.js) and the walking
 * collisions (avatars.js). The walkable disc of the pad itself lives in shared/walk.js so both servers know it too.
 *
 * Frame: u points from the tree out to the wheel, v is the sideways direction.
 */
const d = Math.hypot(FERRIS.x, FERRIS.z);
export const U = { x: FERRIS.x / d, z: FERRIS.z / d };
export const V = { x: -U.z, z: U.x };
export { FERRIS, FERRIS_PAD };

const at = (a, b) => [FERRIS_PAD.x + U.x * a + V.x * b, FERRIS_PAD.z + U.z * a + V.z * b]; // a along u, b along v, from the pad's centre

/** where a rider stands to board: the Ride button shows within a few steps of it */
export const BOARD = { x: at(2.2, 0)[0], z: at(2.2, 0)[1] };
export const KIOSK = at(0.9, 3.0);   // ticket booth
export const SIGN = at(0.9, -3.0);   // lit sign post

/** Solid parts, world [x, z, radius] */
export const FERRIS_OBSTACLES = [[...KIOSK, 1.0], [...SIGN, 0.45]];
