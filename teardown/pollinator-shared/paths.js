// Where a ball travels inside the robot, robot frame (x left, y up, z forward), shared by the geometry that guides it
// and the routine that moves it. The ramps rise from the intake mouths over the drive motors (their cans run under the
// centre line at y 0.019-0.056) to the sorter bowl; a lane each side climbs into its turret's hollow ring.
import {BALL, R} from './robot.js';

export const FRONT = R.L / 2 + R.intakeOut;
export const ROLLER_Y = 0.05; // TPU flaps reach 0.042 m: the whole roller fits the FLOWER's 3.55 in. retrieval opening
// the ramp floor, front half (z mirrored for the rear)
export const RAMP_FLOOR = [
  [0, 0.0, FRONT],
  [0, 0.034, R.L / 2 - 0.01],
  [0, 0.066, 0.158],
  [0, 0.074, 0.06],
];
export const SORT_Y = 0.078; // sorter bowl floor
export const LANE = (key) => {
  const T = R.turret[key];
  const sx = Math.sign(T.x);
  return [
    [0, SORT_Y + BALL[key].d / 2, 0.05],
    [sx * 0.065, 0.16, 0.03],
    [T.x, 0.205, T.z + 0.015],
  ];
};
