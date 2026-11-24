// The body layout and where a ball travels inside it, robot frame (x left, y up, z forward). The laser-cut plates
// (plates.js), the 3D model (build.js) and the routine (routine.js) all read these numbers, so the plates, the
// animation and the cut files cannot disagree.
//
// A ball's trip: an intake pulls it up the printed lip and over the bulkhead onto a plywood ramp, which runs gently
// downhill to the SORTER in the middle of the robot. The sorter is a channel whose two walls stand 80 mm apart:
// POLLEN (71 mm) drops between them and rolls left (+x) along the channel floor to the pollen tower; NECTAR (91 mm)
// cannot fit, rides the two wall tops like rails and rolls right (-x) into the nectar tower. Each tower is a
// vertical lift on its turret's axis: three TPU wheels on one belt, one servo, carry the ball up through the deck
// into the turret's hollow ring. No actuator decides where a ball goes; its size does.
import {BALL, R} from './robot.js';

const MM = 0.001;
// ------------------------------------------------------------ layout, millimetres
export const BODY = {
  half: 228.6, // 18 in. / 2
  bottom: 8, // side plates start 8 mm above the tiles
  bellyTop: 22,
  deckBottom: 170,
  sideTop: 196,
  bulkheadZ: 218.6, // outer face of the bulkhead legs
  // the drive motors' cans run under the ramps: their tops are at y 56 over z 139.5-176.5
  motorTop: 56,
  motorZ: [139.5, 176.5],
  // ramps: a guide each side, the floor between them
  rampHalf: 51, // inner faces of the ramp walls
  rampStart: 74, // floor top at the front edge of the body
  rampEnd: 64, // floor top where it meets the sorter wall
  rampWall: 48, // guide height above the floor
  // the sorter channel, along x, centred on the turrets' z
  sortZ: -35,
  gap: 80, // between the channel walls: POLLEN 71 drops in, NECTAR 91 rides on top
  railY0: 64, // rail top at x = 0
  railSlope: 0.03, // rails fall toward -x (NECTAR rolls right)
  chanX: [-64, 64], // channel floor from the nectar tower wall to the pollen tower
  floorY: [36, 32], // channel floor top at chanX[0], chanX[1]: falls toward +x (POLLEN rolls left)
  // towers on the turret axes
  towerInner: {pollen: 80, nectar: 100},
  liftWheelR: 25,
  liftZ: [56, 98, 140], // lift wheel heights: the top one clears the deck
};
export const railY = (x) => BODY.railY0 + BODY.railSlope * x;
export const floorY = (x) => BODY.floorY[0] + ((x - BODY.chanX[0]) * (BODY.floorY[1] - BODY.floorY[0])) / (BODY.chanX[1] - BODY.chanX[0]);
// a NECTAR on the two rails: its centre sits this far above the rail tops
export const SINK = Math.sqrt((BALL.nectar.d * 500) ** 2 - (BODY.gap / 2) ** 2);

export const FRONT = R.L / 2 + R.intakeOut;
export const ROLLER_Y = 0.05; // TPU flaps reach 0.042 m: the whole roller fits the FLOWER's 3.55 in. retrieval opening
export const LIFT_ROLLER = {z: 0.247, y: 0.176}; // the second intake roller lifts the ball over the lip onto the ramp

const r = (kind) => (BALL[kind].d / 2) * 1000;
const P = (x, y, z) => [x * MM, y * MM, z * MM];
const towerX = (key) => R.turret[key].x * 1000;
/** the front edge of the sorter wall a ramp meets */
const rampEndZ = (sz) => (sz > 0 ? BODY.sortZ + BODY.gap / 2 + 6 : BODY.sortZ - BODY.gap / 2 - 6);
/** intake mouth -> lip -> over the bulkhead -> down the ramp -> the sorter's landing point */
export const intakePath = (side, kind) => {
  const sz = side === 'front' ? 1 : -1;
  const k = r(kind);
  return [
    P(0, k, sz * FRONT * 1000),
    P(0, 26 + k, sz * 268),
    P(0, 58 + k, sz * 240),
    P(0, BODY.rampStart + k, sz * BODY.half),
    P(0, BODY.rampEnd + k, rampEndZ(sz)),
    landing(kind),
  ];
};
/** where a ball comes to rest on the sorter: NECTAR on the rails, POLLEN in the channel */
export const landing = (kind) => (kind === 'nectar' ? P(0, railY(0) + SINK, BODY.sortZ) : P(0, floorY(0) + r('pollen'), BODY.sortZ));
/** sorter -> tower base */
export const sortPath = (kind) =>
  kind === 'nectar'
    ? [landing('nectar'), P(BODY.chanX[0], railY(BODY.chanX[0]) + SINK, BODY.sortZ), P(towerX('nectar'), BODY.bellyTop + r('nectar'), BODY.sortZ)]
    : [landing('pollen'), P(BODY.chanX[1], floorY(BODY.chanX[1]) + r('pollen'), BODY.sortZ), P(towerX('pollen'), BODY.bellyTop + r('pollen'), BODY.sortZ)];
/** the two places a ball waits in its lane: 0 at the top of the lift, held under the deck with its top already in the
 * bore; 1 at the bottom of the tower */
export const SLOT0_Y = 150;
export const slot = (key, i) => (i === 0 ? P(towerX(key), SLOT0_Y, BODY.sortZ) : P(towerX(key), BODY.bellyTop + r(key), BODY.sortZ));
export const liftPath = (key) => [slot(key, 1), slot(key, 0)];
