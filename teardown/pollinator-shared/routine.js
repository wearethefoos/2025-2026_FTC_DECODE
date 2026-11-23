// The routine the film and the live page both play: one clock tau drives the robot's path, both turrets, both
// intakes, every ball and the HIVE. Everything here is tabulated at load (aim solutions, wheel angles, the
// localization error) so frame(tau) only reads and interpolates: a pure function of time.
//
// Blue alliance. The robot carries 2 POLLEN + 2 NECTAR (4, the G407 limit), drive-by shoots 3 of them into the
// upward blue CELL, the HIVE tips, it pulls 2 POLLEN out of a FLOWER's bottom with the front intake, places a POLLEN
// and then its NECTAR into the same FLOWER's top (top-most NECTAR owns it), reverses through the spill collecting 2
// POLLEN with the rear intake while shooting into the CELL that is now up, and ends with both turrets sweeping their
// full range past each other.
import {FRONT, LANE, RAMP_FLOOR, SORT_Y} from './paths.js';
import {BALL, FIELD, FLOWER, FLOWERS, HIVE, R, cellTarget, fly, hiveCell, landing, llSees, mecanum, motorRpm, solveShot, toWorld, wrap, D2R, G} from './robot.js';

const smoother = (x) => {
  const u = Math.min(1, Math.max(0, x));
  return u * u * u * (u * (u * 6 - 15) + 10);
};
const ss = (a, b, t) => smoother((t - a) / (b - a));
const lerp = (a, b, k) => a + (b - a) * k;
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));

export const DURATION = 29;
const HX = HIVE.blueX;
const FL = FLOWERS[0];
// where the robot sits to pull from the FLOWER: the front intake's mouth just inside the retrieval opening
const AT_FLOWER = {x: FL.x - 0.058 - FRONT + 0.015, z: FL.z, psi: Math.PI / 2};
// where two of the spilled POLLEN come to rest; the reverse path is built so the rear intake runs over them
export const SPILL_REST = [
  [0.64, 0.8],
  [0.34, 0.9],
  [0.06, 0.66],
  [-0.14, 0.82],
  [0.2, 1.22],
  [1.02, 1.3],
];
const atRear = (q, psi) => ({x: q[0] + Math.sin(psi) * FRONT * 0.98, z: q[1] + Math.cos(psi) * FRONT * 0.98, psi});

// ------------------------------------------------------------ the path
// legs: [t0, t1, from, to, via?]. A leg follows a trapezoid speed profile along a straight line or a quadratic
// curve through via; heading eases from one to the other over the leg.
const P0 = {x: 1.3, z: 1.25, psi: -Math.PI / 2};
const P1 = {x: 1.3, z: -1.02, psi: -Math.PI / 2};
const W1 = atRear(SPILL_REST[0], Math.PI / 2);
const W2 = atRear(SPILL_REST[1], Math.PI / 2);
const W3 = {x: W2.x + 0.02, z: W2.z + 0.06, psi: Math.PI / 2 - 8 * D2R};
const LEGS = [
  [1.5, 5.5, P0, P1],
  [5.6, 8.6, P1, AT_FLOWER, {x: 1.3, z: -0.99}],
  [12.6, 13.0, AT_FLOWER, {...AT_FLOWER, x: AT_FLOWER.x - 0.05}],
  [16.4, 19.4, {...AT_FLOWER, x: AT_FLOWER.x - 0.05}, W1, {x: 1.12, z: 0.35}],
  [19.4, 20.9, W1, W2],
  [20.9, 21.8, W2, W3],
];
const trap = (u, a = 0.22) => {
  // normalised distance for a trapezoid speed profile, accel fraction a each end
  const u_ = clamp(u, 0, 1);
  const vm = 1 / (1 - a);
  if (u_ < a) return (0.5 * vm * u_ * u_) / a;
  if (u_ > 1 - a) return 1 - (0.5 * vm * (1 - u_) ** 2) / a;
  return vm * (u_ - a / 2);
};
export function poseAt(t) {
  let p = P0;
  for (const [t0, t1, a, b, via] of LEGS) {
    if (t < t0) break;
    if (t >= t1) {
      p = b;
      continue;
    }
    const s = trap((t - t0) / (t1 - t0));
    let x;
    let z;
    if (via) {
      x = (1 - s) ** 2 * a.x + 2 * (1 - s) * s * via.x + s * s * b.x;
      z = (1 - s) ** 2 * a.z + 2 * (1 - s) * s * via.z + s * s * b.z;
    } else {
      x = lerp(a.x, b.x, s);
      z = lerp(a.z, b.z, s);
    }
    const h = smoother((t - t0) / (t1 - t0));
    return {x, z, psi: a.psi + wrap(b.psi - a.psi) * h};
  }
  return {...p};
}
/** world velocity (x, z), yaw rate */
export function velAt(t) {
  const e = 1 / 120;
  const a = poseAt(t - e);
  const b = poseAt(t + e);
  return {vx: (b.x - a.x) / (2 * e), vz: (b.z - a.z) / (2 * e), om: wrap(b.psi - a.psi) / (2 * e)};
}

// ------------------------------------------------------------ the HIVE: one tip
const tipState = {t: 1e9};
/** the blue rocker angle: +tilt (audience CELL up) until the tip, then over to -tilt with a damped settle */
export const rockerAt = (t) => {
  const k = t - tipState.t;
  if (k <= 0) return HIVE.tilt;
  const s = ss(0, 0.9, k);
  const settle = Math.exp(-k * 4) * Math.sin(k * 14) * 0.08 * ss(0.5, 0.9, k);
  return HIVE.tilt * (1 - 2 * s) + settle * HIVE.tilt;
};
export const upCellAt = (t) => (t < tipState.t + 0.45 ? 1 : -1);
export const tipTime = () => tipState.t;

// ------------------------------------------------------------ ball paths inside the robot (robot frame: x left, z fwd)
const Y = (kind) => BALL[kind].d / 2;
const lane = (key) => (key === 'pollen' ? 1 : -1);
const T_ = (key) => R.turret[key];
const PATHS = {
  front: (k) => [...RAMP_FLOOR.map(([x, y, z]) => [x, y + Y(k), z]), [0, SORT_Y + Y(k), 0.05]],
  rear: (k) => [...RAMP_FLOOR.map(([x, y, z]) => [x, y + Y(k), -z]), [0, SORT_Y + Y(k), 0.05]],
  // the sorter, the colour sensor under it, then a lane each side up into the turret's hollow ring
  lane: (key) => LANE(key),
};
// up to two balls queue in a lane: slot 0 inside the turret ring, slot 1 behind it
const slot = (key, i) => (i === 0 ? [T_(key).x, 0.222, T_(key).z] : LANE(key)[1]);
const polyAt = (pts, u) => {
  const L = [0];
  for (let i = 1; i < pts.length; i++) L.push(L[i - 1] + Math.hypot(...pts[i].map((v, j) => v - pts[i - 1][j])));
  const s = clamp(u, 0, 1) * L[L.length - 1];
  let i = 1;
  while (i < pts.length - 1 && L[i] < s) i++;
  const k = (s - L[i - 1]) / (L[i] - L[i - 1] || 1);
  return pts[i - 1].map((v, j) => lerp(v, pts[i][j], k));
};

// ------------------------------------------------------------ the balls
// a ball's story: a list of segments, each {t0, t1, kind, ...}; posAt walks them
export const BALLS = [];
const ball = (kind, color, segs) => {
  const b = {id: BALLS.length, kind, color, segs};
  BALLS.push(b);
  return b;
};
const cellSlot = (i, kind) => {
  // a 4 x 3 grid on the CELL floor, cell frame: x across, y down from the rim, z along
  const gx = [-0.18, -0.06, 0.06, 0.18][i % 4];
  const gz = [-0.1, 0.02, 0.12][Math.floor(i / 4) % 3];
  return [gx, -HIVE.cellDepth + BALL[kind].d / 2 + 0.01 + Math.floor(i / 12) * 0.09, gz];
};
/** a point in CELL k's frame to world at time t */
export const cellToWorld = (k, q, t) => {
  const c = hiveCell(HX, rockerAt(t), k);
  // the CELL turns by its tilt about x through its rim centre
  const a = c.tilt;
  const ca = Math.cos(a);
  const sa = Math.sin(a);
  return [c.x + q[0], c.y + q[1] * ca - q[2] * sa, c.z + q[1] * sa + q[2] * ca];
};
const worldToCell = (k, p, t) => {
  const c = hiveCell(HX, rockerAt(t), k);
  const a = -c.tilt;
  const dy = p[1] - c.y;
  const dz = p[2] - c.z;
  return [p[0] - c.x, dy * Math.cos(a) - dz * Math.sin(a), dy * Math.sin(a) + dz * Math.cos(a)];
};

// the staged NECTAR: 3 in the upward blue CELL (§10.3.1)
const cellCount = {1: 0, '-1': 0};
const inCell = {1: [], '-1': []};
for (let i = 0; i < 3; i++) {
  const b = ball('nectar', 'blue', [{t0: -1, t1: 1e9, type: 'cell', k: 1, q: cellSlot(i, 'nectar'), from: null}]);
  inCell[1].push(b);
  cellCount[1]++;
}
// the FLOWER's 4 POLLEN, bottom first
const flowerStack = [];
for (let i = 0; i < 4; i++) {
  const seg = {t0: -1, t1: 1e9, type: 'flower', f: 0, tin: -1};
  flowerStack.push({b: ball('pollen', 'yellow', [seg]), s: seg});
}

// the robot's own: 2 POLLEN in the pollen lane, 2 NECTAR in the nectar lane at the start
const carried = {
  pollen: [ball('pollen', 'yellow', [{t0: -1, t1: 1e9, type: 'robot', q: slot('pollen', 0)}]), ball('pollen', 'yellow', [{t0: -1, t1: 1e9, type: 'robot', q: slot('pollen', 1)}])],
  nectar: [ball('nectar', 'blue', [{t0: -1, t1: 1e9, type: 'robot', q: slot('nectar', 0)}]), ball('nectar', 'blue', [{t0: -1, t1: 1e9, type: 'robot', q: slot('nectar', 1)}])],
};
const endSeg = (b, t) => {
  const s = b.segs[b.segs.length - 1];
  s.t1 = t;
  return s;
};
// the queue behind a fired ball moves up one slot
const advance = (key, t) => {
  const q = carried[key];
  if (q[0]) {
    endSeg(q[0], t);
    q[0].segs.push({t0: t, t1: t + 0.3, type: 'rpath', pts: [slot(key, 1), slot(key, 0)]}, {t0: t + 0.3, t1: 1e9, type: 'robot', q: slot(key, 0)});
  }
};

// ------------------------------------------------------------ the events
export const SHOTS = []; // {t, key, kind, target: 'cell'|'flower', sol, ball}
export const PICKS = []; // {t, side: 'front'|'rear', ball}
const FIRE_FEED = 0.16; // slot 0 into the pod before release

function fire(t, key, {place = false} = {}) {
  const b = carried[key].shift();
  const kind = key;
  const pose = poseAt(t);
  const v = velAt(t);
  const up = upCellAt(t);
  const tgt = place ? [FL.x, FLOWER.topY, FL.z] : cellTarget(HX, up);
  const sol = solveShot(BALL[kind], pose, [v.vx, v.vz], v.om, key, tgt, {place});
  endSeg(b, t - FIRE_FEED);
  const T = T_(key);
  b.segs.push({t0: t - FIRE_FEED, t1: t, type: 'feed', key, from: slot(key, 0), to: [T.x, R.podY, T.z]});
  // the flight: from the exit to where it drops through the target's plane
  let prev = sol.p;
  const tgY = tgt[1];
  const res = fly(BALL[kind], sol.p, sol.vel, sol.w, {
    dt: 1 / 240,
    tMax: 2,
    stop: (q, u) => {
      const done = u[1] < 0 && q[1] <= tgY && prev[1] > tgY;
      prev = q;
      return done;
    },
  });
  const tl = t + res.t;
  b.segs.push({t0: t, t1: tl, type: 'flight', pts: res.pts, dt: res.dt, w: sol.w, dir: Math.atan2(sol.vel[0], sol.vel[2])});
  if (place) {
    const seg = {t0: tl, t1: 1e9, type: 'flower', f: 0, tin: tl};
    b.segs.push(seg);
    flowerStack.push({b, s: seg});
  } else {
    const n = cellCount[up]++;
    const end = res.pts.slice(-3);
    b.segs.push({t0: tl, t1: tl + 0.32, type: 'drop', k: up, fromW: end, q: cellSlot(n, kind)});
    b.segs.push({t0: tl + 0.32, t1: 1e9, type: 'cell', k: up, q: cellSlot(n, kind)});
    inCell[up].push(b);
  }
  SHOTS.push({t, key, kind, place, sol, ball: b, land: tl, up});
  advance(key, t);
  return tl;
}
function pick(t, side, kind, b, {fromFlower = false} = {}) {
  // the ball is at the intake mouth at t; it rides the intake, the sorter turns it to its lane, it queues
  const key = kind;
  const qi = carried[key].length;
  const path = PATHS[side](kind);
  const ride = 0.55;
  const toLane = 0.4;
  endSeg(b, t - (fromFlower ? 0.35 : 0));
  if (fromFlower) {
    // pulled horizontally out of the retrieval opening into the mouth
    b.segs.push({t0: t - 0.35, t1: t, type: 'pull', f: 0, to: path[0]});
  }
  b.segs.push({t0: t, t1: t + ride, type: 'rpath', pts: path});
  const lanePts = [...PATHS.lane(key)];
  const dest = slot(key, qi === 0 ? 0 : 1);
  if (qi > 0) lanePts.splice(2, 1, dest);
  else lanePts[2] = dest;
  b.segs.push({t0: t + ride, t1: t + ride + toLane, type: 'rpath', pts: lanePts, sort: true});
  b.segs.push({t0: t + ride + toLane, t1: 1e9, type: 'robot', q: dest});
  carried[key].push(b);
  PICKS.push({t, side, ball: b, sorted: t + ride});
}

// drive-by #1 into the audience CELL
let lastLand = 0;
lastLand = Math.max(lastLand, fire(2.6, 'pollen'));
lastLand = Math.max(lastLand, fire(3.2, 'nectar'));
lastLand = Math.max(lastLand, fire(4.0, 'pollen'));
// the third lands: the CELL holds 6 and goes over
tipState.t = lastLand + 0.42;
// the spill: everything in the audience CELL leaves once it has turned far enough
{
  const order = [...inCell[1]];
  // our two POLLEN go to the first two rest points, so the rear intake finds them
  order.sort((a, b) => (a.kind === b.kind ? 0 : a.kind === 'pollen' ? -1 : 1));
  order.forEach((b, i) => {
    const ts = tipState.t + 0.34 + i * 0.07;
    const s = endSeg(b, ts);
    void s;
    b.segs.push({t0: ts, t1: ts + 0.75, type: 'spill', k: 1, q: b.segs[b.segs.length - 1].q, rest: SPILL_REST[i], kind: b.kind});
    b.segs.push({t0: ts + 0.75, t1: 1e9, type: 'world', p: [SPILL_REST[i][0], BALL[b.kind].d / 2, SPILL_REST[i][1]]});
  });
  inCell[1] = [];
}
// the FLOWER: the front intake pulls two POLLEN out of the bottom
pick(9.4, 'front', 'pollen', flowerStack[0].b, {fromFlower: true});
pick(11.0, 'front', 'pollen', flowerStack[1].b, {fromFlower: true});
// then the turrets place one POLLEN and the NECTAR into the top: the NECTAR goes last, so it is top-most
fire(13.8, 'pollen', {place: true});
fire(15.3, 'nectar', {place: true});
// reverse through the spill: the rear intake collects, the pollen turret keeps shooting into the CELL now up
fire(18.6, 'pollen');
{
  const spilled = BALLS.filter((b) => b.segs.some((s) => s.type === 'spill') && b.kind === 'pollen');
  pick(19.4, 'rear', 'pollen', spilled[0]);
  pick(20.9, 'rear', 'pollen', spilled[1]);
}
fire(20.55, 'pollen');
fire(21.95, 'pollen');

// ------------------------------------------------------------ the turrets
// modes: track (the live solution on the CELL that is up), place (the FLOWER top), sweep (the clearance check), home
const MODES = {
  pollen: [[0, 'track'], [12.4, 'place'], [14.6, 'track'], [22.5, 'sweep'], [26.4, 'home']],
  nectar: [[0, 'track'], [12.4, 'place'], [16.0, 'track'], [22.5, 'sweep'], [26.4, 'home']],
};
const SWEEP = [22.5, 26.4];
const sweepYaw = (key, t) => {
  const u = (t - SWEEP[0]) / (SWEEP[1] - SWEEP[0]);
  // out to one stop, across to the other, back to zero; the two turrets go opposite ways
  const a = Math.sin(u * Math.PI * 2) * R.yawLimit * ss(0, 0.12, u) * (1 - ss(0.88, 1, u));
  return key === 'pollen' ? a : -a;
};
// the aim solutions, tabulated at 20 Hz with a warm start
const HZ = 20;
const N = Math.ceil(DURATION * HZ) + 2;
const TAB = {pollen: [], nectar: []};
for (const key of ['pollen', 'nectar']) {
  for (let i = 0; i < N; i++) {
    const t = i / HZ;
    const pose = poseAt(t);
    const v = velAt(t);
    const modeNow = MODES[key].filter(([a]) => a <= t).pop()[1];
    const place = modeNow === 'place';
    const tgt = place ? [FL.x, FLOWER.topY, FL.z] : cellTarget(HX, upCellAt(t));
    const s = solveShot(BALL[key], pose, [v.vx, v.vz], v.om, key, tgt, {place});
    TAB[key].push({yaw: s.yaw, hood: s.hood, rpm: s.rpm, rpmTop: s.rpmTop, v: s.v, spin: s.spinRpm, w: s.w, tf: s.t, lead: s.lead, d: s.d, err: s.err, px: s.p[0], py: s.p[1], pz: s.p[2], vx: s.vel[0], vy: s.vel[1], vz: s.vel[2], tx: tgt[0], ty: tgt[1], tz: tgt[2]});
  }
}
const tab = (key, t) => {
  const u = clamp(t * HZ, 0, N - 1.001);
  const i = Math.floor(u);
  const k = u - i;
  const a = TAB[key][i];
  const b = TAB[key][i + 1];
  const o = {};
  for (const f in a) o[f] = f === 'yaw' || f === 'lead' ? a[f] + wrap(b[f] - a[f]) * k : lerp(a[f], b[f], k);
  return o;
};
const modeOut = (key, mode, t) => {
  if (mode === 'track' || mode === 'place') {
    const s = tab(key, t);
    return {yaw: s.yaw, hood: s.hood, rpm: s.rpm};
  }
  if (mode === 'sweep') return {yaw: sweepYaw(key, t), hood: 50 * D2R, rpm: 0};
  return {yaw: 0, hood: R.hood[0], rpm: 0};
};
/** the predicted flight of the shot this turret would take now (for the ARCS display): flat xyz samples */
export function arcAt(key, t) {
  const s = tab(key, t);
  const tgY = s.ty;
  let prev = [s.px, s.py, s.pz];
  const res = fly(BALL[key], prev, [s.vx, s.vy, s.vz], s.w, {
    dt: 1 / 120,
    tMax: 1.6,
    stop: (q, u) => {
      const done = u[1] < 0 && q[1] <= tgY;
      prev = q;
      return done;
    },
  });
  return {pts: res.pts, target: [s.tx, s.ty, s.tz]};
}
/** a turret at t: yaw on the robot, hood pitch, flywheel rpm, the mode and the solution numbers */
export function turretAt(key, t) {
  const M = MODES[key];
  let i = 0;
  while (i < M.length - 1 && M[i + 1][0] <= t) i++;
  const cur = modeOut(key, M[i][1], t);
  let o = cur;
  if (i > 0) {
    const k = ss(M[i][0], M[i][0] + 0.5, t);
    if (k < 1) {
      const p = modeOut(key, M[i - 1][1], t);
      o = {yaw: p.yaw + wrap(cur.yaw - p.yaw) * k, hood: lerp(p.hood, cur.hood, k), rpm: lerp(p.rpm, cur.rpm, k)};
    }
  }
  // spin down when the lane is empty and nothing is coming
  const held = heldAt(t)[key];
  const due = SHOTS.some((s) => s.key === key && s.t > t && s.t - t < 1.4);
  const spin = held > 0 || due || M[i][1] === 'place' ? 1 : 0.15;
  return {...o, yaw: clamp(wrap(o.yaw), -R.yawLimit, R.yawLimit), rpm: o.rpm * spin, mode: M[i][1], sol: tab(key, t)};
}

// ------------------------------------------------------------ what the robot holds
export function heldAt(t) {
  const out = {pollen: 0, nectar: 0};
  for (const b of BALLS) {
    const s = b.segs.find((x) => x.t0 <= t && t < x.t1);
    if (s && (s.type === 'robot' || s.type === 'rpath' || s.type === 'feed')) out[b.kind]++;
  }
  return out;
}

// ------------------------------------------------------------ tables integrated at load: wheels, flywheels, rollers
const DT = 1 / 240;
const NT = Math.ceil((DURATION + 1) / DT);
const WHEEL = [new Float32Array(NT), new Float32Array(NT), new Float32Array(NT), new Float32Array(NT)];
const FLY = {pollen: new Float32Array(NT), nectar: new Float32Array(NT)};
const ROLL = {front: new Float32Array(NT), rear: new Float32Array(NT)};
export const intakeOn = (side, t) => PICKS.some((p) => p.side === side && t > p.t - 0.8 && t < p.t + 0.6);
for (let i = 1; i < NT; i++) {
  const t = (i - 0.5) * DT;
  const p = poseAt(t);
  const v = velAt(t);
  // world -> robot frame velocity (x left, z forward)
  const s = Math.sin(p.psi);
  const c = Math.cos(p.psi);
  const vf = v.vx * s + v.vz * c;
  const vl = v.vx * c - v.vz * s;
  const w = mecanum(vl, vf, v.om);
  for (let j = 0; j < 4; j++) WHEEL[j][i] = WHEEL[j][i - 1] + w[j] * DT;
  for (const key of ['pollen', 'nectar']) FLY[key][i] = FLY[key][i - 1] + ((turretAt(key, t).rpm * 2 * Math.PI) / 60) * DT;
  for (const side of ['front', 'rear']) ROLL[side][i] = ROLL[side][i - 1] + (intakeOn(side, t) ? 28 : 0) * DT;
}
const look = (A, t) => {
  const u = clamp(t / DT, 0, NT - 1.001);
  const i = Math.floor(u);
  return A[i] + (A[i + 1] - A[i]) * (u - i);
};
export const wheelAngles = (t) => WHEEL.map((A) => look(A, t));
export const flyAngle = (key, t) => look(FLY[key], t);
export const rollerAngle = (side, t) => look(ROLL[side], t);
export const wheelRpm = (t) => {
  const p = poseAt(t);
  const v = velAt(t);
  const s = Math.sin(p.psi);
  const c = Math.cos(p.psi);
  return mecanum(v.vx * c - v.vz * s, v.vx * s + v.vz * c, v.om).map(motorRpm);
};

// ------------------------------------------------------------ localization: Pinpoint dead reckoning + Limelight fixes
// The Pinpoint integrates the two pods; its error grows with distance and turning (a scale error of 0.6 % and
// 0.25 deg of heading per turn, plus a little wander). Whenever the Limelight sees the tag cluster under the CELL
// that is up, MegaTag pulls the fused pose back with a 0.12 s time constant.
const LOC = [];
{
  let ex = 0;
  let ez = 0;
  let eh = 0;
  let seenFor = 0;
  for (let i = 0; i <= N; i++) {
    const t = i / HZ;
    const dt = 1 / HZ;
    const p = poseAt(t);
    const v = velAt(t);
    const sp = Math.hypot(v.vx, v.vz);
    const wob = Math.sin(t * 1.7) * 0.6 + Math.sin(t * 3.1 + 1) * 0.4;
    ex += (v.vx * 0.006 + wob * sp * 0.004) * dt;
    ez += (v.vz * 0.006 - wob * sp * 0.003) * dt;
    eh += (v.om * 0.0044 / (2 * Math.PI)) * 2 * Math.PI * dt * 0.25 + wob * 0.00002;
    const up = upCellAt(t);
    const cell = hiveCell(HX, rockerAt(t), up);
    const ll = llSees(p, cell);
    // a tipping HIVE gives no fix: the tags are moving
    const steady = Math.abs(t - tipState.t - 0.45) > 0.6;
    if (ll.seen && steady) {
      seenFor += dt;
      const k = Math.exp(-dt / 0.12);
      ex *= k;
      ez *= k;
      eh *= k;
    } else seenFor = 0;
    LOC.push({ex, ez, eh, seen: ll.seen && steady, tag: up === 1 ? 38 : 42, dist: ll.dist, seenFor});
  }
}
export function locAt(t) {
  const i = clamp(Math.round(t * HZ), 0, LOC.length - 1);
  const p = poseAt(t);
  const l = LOC[i];
  return {...l, est: {x: p.x + l.ex, z: p.z + l.ez, psi: p.psi + l.eh}, errMm: Math.hypot(l.ex, l.ez) * 1000};
}
export const locHistory = (t, span = 6, n = 60) => {
  const out = [];
  for (let i = 0; i < n; i++) {
    const tt = t - span + (span * i) / (n - 1);
    if (tt < 0) out.push(null);
    else out.push(locAt(tt));
  }
  return out;
};

// ------------------------------------------------------------ where every ball is
const flowerY = (seg, kind, t) => {
  // stacked on the ones below it that are still in (or still dropping out of) the tube
  let y = 0.004;
  for (const {b: o, s} of flowerStack) {
    if (s === seg) break;
    if (s.tin > t) continue;
    const gone = s.t1 < 1e8 ? ss(s.t1, s.t1 + 0.22, t) : 0;
    y += BALL[o.kind].d * (1 - gone);
  }
  return y + BALL[kind].d / 2;
};
export function ballAt(b, t) {
  const s = b.segs.find((x) => x.t0 <= t && t < x.t1) || b.segs[b.segs.length - 1];
  const pose = poseAt(t);
  const spinOf = (seg) => (seg.type === 'flight' ? seg.w * (t - seg.t0) : 0);
  switch (s.type) {
    case 'robot':
      return {p: toWorld(pose, s.q), vis: true};
    case 'rpath': {
      const q = polyAt(s.pts, ss(s.t0, s.t1, t));
      return {p: toWorld(pose, q), vis: true, roll: (t - s.t0) * 20, sort: s.sort};
    }
    case 'feed': {
      const q = polyAt([s.from, s.to], ss(s.t0, s.t1, t));
      return {p: toWorld(pose, q), vis: true};
    }
    case 'flight': {
      const u = clamp((t - s.t0) / s.dt, 0, s.pts.length / 3 - 1.001);
      const i = Math.floor(u);
      const k = u - i;
      const P = s.pts;
      return {p: [lerp(P[i * 3], P[i * 3 + 3], k), lerp(P[i * 3 + 1], P[i * 3 + 4], k), lerp(P[i * 3 + 2], P[i * 3 + 5], k)], vis: true, spin: spinOf(s), dir: s.dir, flying: true};
    }
    case 'drop': {
      const q0 = worldToCell(s.k, s.fromW, s.t0);
      const k = ss(s.t0, s.t1, t);
      const q = [lerp(q0[0], s.q[0], k), lerp(q0[1], s.q[1], Math.min(1, k * 1.3)), lerp(q0[2], s.q[2], k)];
      return {p: cellToWorld(s.k, q, t), vis: true};
    }
    case 'cell':
      return {p: cellToWorld(s.k, s.q, t), vis: true};
    case 'spill': {
      const a = cellToWorld(s.k, s.q, s.t0);
      const r = BALL[s.kind].d / 2;
      const k = (t - s.t0) / (s.t1 - s.t0);
      // a fall to the tiles, a bounce, a roll to rest
      const kk = Math.min(1, k / 0.55);
      const x = lerp(a[0], s.rest[0], smoother(k));
      const z = lerp(a[2], s.rest[1], smoother(k));
      let y = k < 0.55 ? lerp(a[1], r, kk * kk) : r + Math.sin(((k - 0.55) / 0.45) * Math.PI) * 0.06 * (1 - k);
      y = Math.max(r, y);
      return {p: [x, y, z], vis: true, spin: k * 9};
    }
    case 'world':
      return {p: s.p, vis: true};
    case 'flower': {
      const top = FLOWER.topY;
      const target = flowerY(s, b.kind, t);
      const y = s.tin < 0 ? target : Math.max(target, top - 0.5 * G * (t - s.tin) ** 2);
      return {p: [FL.x, y, FL.z], vis: true};
    }
    case 'pull': {
      const fs = b.segs[b.segs.indexOf(s) - 1];
      const y0 = flowerY(fs, b.kind, s.t0);
      const a = [FL.x, y0, FL.z];
      const m = toWorld(pose, s.to);
      const k = ss(s.t0, s.t1, t);
      return {p: [lerp(a[0], m[0], k), lerp(a[1], m[1], k), lerp(a[2], m[2], k)], vis: true, roll: k * 6};
    }
  }
  return {p: [0, -1, 0], vis: false};
}

// ------------------------------------------------------------ the score the console keeps
export function scoreAt(t) {
  let cell = 0;
  let flower = 0;
  let tips = t >= tipState.t + 0.9 ? 1 : 0;
  for (const b of BALLS) {
    const s = b.segs.find((x) => x.t0 <= t && t < x.t1);
    if (!s) continue;
    if (s.type === 'cell' && s.k === upCellAt(t)) cell++;
    if (s.type === 'flower' && (s.tin < 0 || t > s.tin + 0.3)) flower++;
  }
  // FLOWER ownership: the top-most NECTAR in it is ours once ours lands
  const nectarIn = SHOTS.find((s) => s.place && s.kind === 'nectar');
  const owned = nectarIn && t > nectarIn.land + 0.3;
  return {cell, flower, owned, tips, points: tips * 20 + (owned ? flower * 2 : 0)};
}
export const flowerPos = FL;
export const DEBUG = {LEGS, AT_FLOWER, W1, W2, MODES, SWEEP};
void FIELD;
