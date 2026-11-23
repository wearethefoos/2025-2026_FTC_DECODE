// The Twin-Turret Pollinator's numbers and math: no three.js in here. Metres, seconds, radians unless a name says so.
//
// Field facts come from the 2026-2027 FTC BIOBUZZ Competition Manual (§9, §10, R102-R105, R503, G407, G418). The
// robot is ours: every dimension below is a design number, and every gauge on the page reads from these functions.
//
// World frame: origin at the field centre on the tile surface, y up, x toward the blue wall, z toward the audience.
// Robot frame: +z forward, +x to the robot's left, y up. Heading psi turns the robot about +y; forward in the world is
// (sin psi, cos psi) in (x, z).

export const IN = 0.0254;
export const G = 9.81;
export const RHO = 1.2;
export const D2R = Math.PI / 180;

// ------------------------------------------------------------ the game (manual §9)
export const FIELD = {
  half: 72 * IN, // 144 in. inside the perimeter
  tile: 24 * IN,
  wallH: 12 * IN,
};
export const BALL = {
  // POLLEN: ~2.8 in. yellow polyethylene ball with holes; NECTAR: ~3.6 in., red or blue. The manual gives no weight:
  // the masses here are our estimates for a holed ball of that size and are marked as such on the page.
  pollen: {d: 2.8 * IN, m: 0.03, cd: 0.5, name: 'POLLEN'},
  nectar: {d: 3.6 * IN, m: 0.05, cd: 0.5, name: 'NECTAR'},
};
export const HOLD_MAX = 4; // G407
export const HIVE = {
  frameW: 49.46 * IN,
  frameD: 38.95 * IN,
  pivotY: 43.95 * IN,
  cellGap: 18.8 * IN, // the two CELLS of one HIVE, centre to centre
  cellW: 20 * IN,
  cellL: 14 * IN,
  cellDepth: 12 * IN,
  tilt: 25 * D2R, // our model of the bi-stable rocker: each stable state is +-25 deg
  // the blue HIVE sits on the blue half of the shared frame
  blueX: 0.31,
  redX: -0.31,
};
export const FLOWER = {
  topY: 21.5 * IN, // top opening centre above the tiles
  topD: 4 * IN,
  backstop: 1.25 * IN,
  slotH: 3.55 * IN, // retrieval opening at the bottom
  ringH: 0.4 * IN,
  off: 0.075, // tube axis from the inside of the wall
};
// two blue FLOWERS on the blue wall (our layout; the manual puts the 4 FLOWERS on the perimeter wall)
export const FLOWERS = [
  {x: FIELD.half - FLOWER.off, z: -0.95, side: 'blue'},
  {x: FIELD.half - FLOWER.off, z: 0.95, side: 'blue'},
  {x: -(FIELD.half - FLOWER.off), z: -0.95, side: 'red'},
  {x: -(FIELD.half - FLOWER.off), z: 0.95, side: 'red'},
];

// ------------------------------------------------------------ the robot (our design)
export const R = {
  L: 18 * IN, // starting volume 18 x 18 x 18 in. (R102)
  W: 18 * IN,
  H: 18 * IN,
  // both intakes swing out 3 in. at the start and stay out: 18 + 2 x 3 = 24 in., the R105 limit, exactly
  intakeOut: 3 * IN,
  frameY: 0.045, // underside of the 15 mm extrusion frame
  // drive: four REV HD Hex motors on UltraPlanetary 4:1 + 3:1, 75 mm mecanum wheels
  wheelR: 0.0375,
  driveRatio: 12,
  motorFree: 6000, // rpm, HD Hex
  wheelX: 0.172,
  wheelZ: 0.158,
  // turrets: the two swept circles never meet, so neither turret needs to know where the other one points. sweep is
  // the plan-view radius of everything that turns with the turret, worst case over the hood range (podSweep below)
  turret: {
    pollen: {x: 0.11, z: -0.035, ringT: 60, pinT: 30, module: 0.002, cheek: 0.058, wheelHalf: 0.028, motorHalf: 0.056},
    nectar: {x: -0.114, z: -0.035, ringT: 60, pinT: 30, module: 0.002, cheek: 0.062, wheelHalf: 0.034, motorHalf: 0.056},
  },
  yawLimit: 170 * D2R, // cable carrier, either way from forward
  servoRpm: 71, // REV Smart Robot Servo, continuous mode, no load at 6 V (0.14 s / 60 deg)
  podY: 0.33, // flywheel pod pivot above the tiles
  exitR: 0.075, // pod pivot to the ball's exit, along the launch line
  // dual flywheel: the bottom wheel on the motor, the top wheel geared 40:47 off it, turning the other way, so the top
  // surface runs 15 % slower and the ball leaves with a little backspin
  flyR: 0.032, // 64 mm printed hubs with TPU tyres
  topRatio: 40 / 47,
  eta: 0.82, // ball centre speed / mean wheel surface speed, a compressed TPU tyre on a holed ball
  flyFree: 3100, // HD Hex on a 3:1 UltraPlanetary (2.89:1 actual), then 30T:20T HTD belt up, rpm
  hood: [42 * D2R, 62 * D2R], // pod pitch range
  squeeze: 0.006, // ball compression between the wheels
  cheekR: 0.078, // the turret's cheek plates are discs this big about the pivot
  motorBack: 0.06, // flywheel motor axis behind the turret axis
  // Limelight 3A at the front, pitched up to see the tag cluster under the CELL
  ll: {z: 0.205, y: 0.29, pitch: 32 * D2R, hfov: 54.5 * D2R, vfov: 42 * D2R, range: 3.4},
};
/** how far the flywheel centres sit off the launch line */
export const nOff = (key) => BALL[key].d / 2 + R.flyR - R.squeeze / 2;
/** the plan-view radius swept by turret key: wheels at the worst hood angle, cheek discs, the motor behind */
export function podSweep(key) {
  const T = R.turret[key];
  let m = 0;
  for (let a = R.hood[0]; a <= R.hood[1] + 1e-9; a += 0.5 * D2R) m = Math.max(m, Math.hypot(nOff(key) * Math.sin(a) + R.flyR, T.wheelHalf));
  m = Math.max(m, Math.hypot(R.cheekR, T.cheek + 0.004), Math.hypot(R.motorBack + 0.018, T.motorHalf));
  return m + 0.002;
}
for (const k of ['pollen', 'nectar']) R.turret[k].sweep = podSweep(k);
export const TOP_SPEED = ((R.motorFree / R.driveRatio) * 2 * Math.PI * R.wheelR) / 60; // m/s, free

/** clearance between the two swept circles: it must stay positive for every pair of angles */
export const turretGap = () => R.turret.pollen.x - R.turret.nectar.x - R.turret.pollen.sweep - R.turret.nectar.sweep;
/** room between each swept circle and the side of the starting box */
export const sideRoom = (k) => R.W / 2 - Math.abs(R.turret[k].x) - R.turret[k].sweep;
export const turretRate = () => (R.servoRpm * (R.turret.pollen.pinT / R.turret.pollen.ringT) * 360) / 60; // deg/s

// ------------------------------------------------------------ frames
export const fwd = (psi) => [Math.sin(psi), Math.cos(psi)];
/** robot-frame point (x left, y, z forward) to world */
export const toWorld = (pose, p) => {
  const s = Math.sin(pose.psi);
  const c = Math.cos(pose.psi);
  return [pose.x + p[0] * c + p[2] * s, p[1], pose.z - p[0] * s + p[2] * c];
};
export const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));

// ------------------------------------------------------------ the HIVE
/** the rocker angle for a state: +1 has the audience-side CELL up */
export const hiveCell = (hx, alpha, k) => {
  // CELL k = +1 audience side, -1 far side. The rocker arm puts the CELL rim centre at +-gap/2 from the pivot, then
  // the rocker turns by alpha (raising the audience end). Each CELL is mounted so it is level when alpha = k * tilt.
  const r = HIVE.cellGap / 2;
  const a = alpha * k;
  return {
    x: hx,
    y: HIVE.pivotY + r * Math.sin(a),
    z: k * r * Math.cos(a),
    // the CELL's own tilt from level, as a right-handed turn about +x (the rocker's alpha turns the other way)
    tilt: k * HIVE.tilt - alpha,
  };
};
/** the target for a shot: the rim centre of the CELL facing up */
export const cellTarget = (hx, up) => {
  const c = hiveCell(hx, up * HIVE.tilt, up);
  return [c.x, c.y - 0.02, c.z];
};
export const TAGS = {38: 'BLUE CELL · AUDIENCE', 42: 'BLUE CELL · FAR'};

// ------------------------------------------------------------ ballistics
/**
 * Flies a ball from p (world) with velocity v (world), backspin w (rad/s) about the horizontal axis across its
 * path. Gravity, quadratic drag, Magnus lift (C_L = 1.2 S, capped). Stops when stop(p, v, t) says so or at tMax.
 * Returns samples every dt (s): flat [x, y, z, ...] and the time of each.
 */
export function fly(ball, p, v, w, {dt = 1 / 240, tMax = 2, stop} = {}) {
  const r = ball.d / 2;
  const A = Math.PI * r * r;
  const kd = (0.5 * RHO * ball.cd * A) / ball.m;
  const kl = (0.5 * RHO * A) / ball.m;
  let [x, y, z] = p;
  let [vx, vy, vz] = v;
  const out = [x, y, z];
  const sub = 4;
  const h = dt / sub;
  let t = 0;
  for (; t < tMax; ) {
    for (let i = 0; i < sub; i++) {
      const sp = Math.hypot(vx, vy, vz) || 1e-6;
      // spin axis: horizontal, across the path (forward x up), so backspin lifts
      const hx = vx;
      const hz = vz;
      const hl = Math.hypot(hx, hz) || 1e-6;
      const ax_ = -hz / hl; // forward x up = (-hz, 0, hx) / |h|
      const az_ = hx / hl;
      const S = (r * w) / sp;
      const cl = Math.min(0.3, 1.2 * S);
      // lift = cl * kl * |v|^2 * (axis x v_hat)
      const lx = ax_;
      const lz = az_;
      // axis x v = (ay*vz - az*vy, az*vx - ax*vz, ax*vy - ay*vx) with ay = 0
      const mx = -lz * vy;
      const my = lz * vx - lx * vz;
      const mz = lx * vy;
      const ml = Math.hypot(mx, my, mz) || 1;
      const L = cl * kl * sp * sp;
      const axx = -kd * sp * vx + (L * mx) / ml;
      const ayy = -G - kd * sp * vy + (L * my) / ml;
      const azz = -kd * sp * vz + (L * mz) / ml;
      vx += axx * h;
      vy += ayy * h;
      vz += azz * h;
      x += vx * h;
      y += vy * h;
      z += vz * h;
    }
    t += dt;
    out.push(x, y, z);
    if (stop && stop([x, y, z], [vx, vy, vz], t)) break;
  }
  return {pts: out, dt, t, v: [vx, vy, vz]};
}

/** where a ball crosses height yT on the way down (horizontal x, z, the time), or null if it never does */
export function landing(ball, p, v, w, yT) {
  let prev = p;
  let hit = null;
  const res = fly(ball, p, v, w, {
    dt: 1 / 200,
    tMax: 2.2,
    stop: (q, u, t) => {
      if (u[1] < 0 && q[1] <= yT && prev[1] > yT) {
        const k = (prev[1] - yT) / (prev[1] - q[1]);
        hit = {x: prev[0] + (q[0] - prev[0]) * k, z: prev[2] + (q[2] - prev[2]) * k, t: t - (1 - k) / 200, vy: u[1]};
        return true;
      }
      prev = q;
      return q[1] < -0.1;
    },
  });
  void res;
  return hit;
}

/** the wheel speeds and the ball it makes: exit speed v (m/s) -> bottom/top rpm and backspin */
export const flywheelFor = (ball, v) => {
  const mean = v / R.eta; // mean surface speed of the two wheels
  const vb = (2 * mean) / (1 + R.topRatio);
  const vt = vb * R.topRatio;
  const w = (R.eta * (vb - vt)) / ball.d; // rad/s, the ball's backspin
  const rpm = (vb / R.flyR) * (60 / (2 * Math.PI));
  return {vb, vt, rpm, rpmTop: rpm * R.topRatio, w, spinRpm: (w * 60) / (2 * Math.PI)};
};
/** the pod pitch the turret picks for a horizontal distance: steep up close, flatter far out */
export const hoodFor = (d, place = false) => (place ? 64 * D2R : Math.max(R.hood[0], Math.min(R.hood[1] - 4 * D2R, (62 - 7 * (d - 0.9)) * D2R)));

/**
 * The aim solution for one turret: the world yaw and exit speed that put the ball through the target while the robot
 * moves with velocity vr (world m/s, x z) and turns at omega (rad/s). Newton on the miss at the target height, two
 * unknowns (yaw, speed), so the lead for drive-by shooting comes out of the same solve as the range.
 */
export function solveShot(ball, pose, vr, omega, key, target, opts = {}) {
  // the hood starts where the range puts it and steepens until a solution exists (driving at the target needs a
  // higher arc: the ball has less far to go but just as high to climb)
  let best = null;
  for (let k = 0; k < 6; k++) {
    const s = solveAt(ball, pose, vr, omega, key, target, opts, k * 3 * D2R);
    if (!best || s.err < best.err) best = s;
    if (s.err < 0.01 || s.hood >= R.hood[1]) break;
  }
  return best;
}

function solveAt(ball, pose, vr, omega, key, target, {place = false} = {}, extra = 0) {
  const T = R.turret[key];
  const piv = toWorld(pose, [T.x, R.podY, T.z]);
  // the turret pivot's own velocity: the robot's plus the turn
  const rx = piv[0] - pose.x;
  const rz = piv[2] - pose.z;
  const vpx = vr[0] + omega * rz;
  const vpz = vr[1] - omega * rx;
  const dx = target[0] - piv[0];
  const dz = target[2] - piv[2];
  const d = Math.hypot(dx, dz);
  const th = Math.min(R.hood[1], hoodFor(d, place) + extra);
  const launch = (yaw, v) => {
    const c = Math.cos(th);
    const s = Math.sin(th);
    const ux = Math.sin(yaw) * c;
    const uz = Math.cos(yaw) * c;
    const p = [piv[0] + ux * R.exitR, piv[1] + s * R.exitR, piv[2] + uz * R.exitR];
    const vel = [ux * v + vpx, s * v, uz * v + vpz];
    return {p, vel};
  };
  const fw = (v) => flywheelFor(ball, v).w;
  const miss = (yaw, v) => {
    const {p, vel} = launch(yaw, v);
    const h = landing(ball, p, vel, fw(v), target[1]);
    if (!h) return null;
    return {ex: h.x - target[0], ez: h.z - target[2], t: h.t, vy: h.vy};
  };
  // first guess: no drag, no motion
  let yaw = Math.atan2(dx, dz);
  const dy = target[1] - piv[1];
  const den = 2 * Math.cos(th) ** 2 * (d * Math.tan(th) - dy);
  let v = den > 0 ? Math.sqrt((G * d * d) / den) * 1.05 : 4;
  // lead the first guess by the robot's travel over the no-drag flight time: aim at target - v_r * t
  {
    const tf = d / Math.max(0.5, v * Math.cos(th));
    yaw = Math.atan2(dx - vpx * tf, dz - vpz * tf);
    const d2 = Math.hypot(dx - vpx * tf, dz - vpz * tf);
    const den2 = 2 * Math.cos(th) ** 2 * (d2 * Math.tan(th) - dy);
    if (den2 > 0) v = Math.sqrt((G * d2 * d2) / den2) * 1.05;
  }
  let m = null;
  for (let it = 0; it < 12; it++) {
    m = miss(yaw, v);
    if (!m) {
      v *= 1.15;
      continue;
    }
    if (Math.hypot(m.ex, m.ez) < 0.002) break;
    const e = 1e-3;
    const my = miss(yaw + e, v);
    const mv = miss(yaw, v + e * 10);
    if (!my || !mv) {
      v *= 1.05;
      continue;
    }
    // J = d(ex, ez)/d(yaw, v)
    const a = (my.ex - m.ex) / e;
    const b = (mv.ex - m.ex) / (e * 10);
    const c = (my.ez - m.ez) / e;
    const dd = (mv.ez - m.ez) / (e * 10);
    const det = a * dd - b * c;
    if (Math.abs(det) < 1e-9) break;
    const dyaw = (dd * m.ex - b * m.ez) / det;
    const dv = (-c * m.ex + a * m.ez) / det;
    yaw -= Math.max(-0.3, Math.min(0.3, dyaw));
    v -= Math.max(-1.5, Math.min(1.5, dv));
  }
  const still = Math.atan2(dx, dz);
  const fly_ = flywheelFor(ball, v);
  const {p, vel} = launch(yaw, v);
  return {
    yawWorld: yaw,
    yaw: wrap(yaw - pose.psi), // turret angle on the robot
    lead: wrap(yaw - still), // how far the drive-by solution turns away from pointing at the target
    hood: th,
    v,
    d,
    t: m?.t ?? 0,
    err: m ? Math.hypot(m.ex, m.ez) : 1,
    p,
    vel,
    ...fly_,
  };
}

// ------------------------------------------------------------ the drive
/** mecanum inverse kinematics: robot-frame velocity (vx left, vz forward, omega) -> wheel rad/s FL, FR, BL, BR */
export const mecanum = (vl, vf, om) => {
  const k = R.wheelX + R.wheelZ;
  // strafe left: FL back, FR forward, BL forward, BR back; omega CCW from above
  return [vf - vl - k * om, vf + vl + k * om, vf + vl - k * om, vf - vl + k * om].map((s) => s / R.wheelR);
};
/** wheel rad/s -> motor rpm */
export const motorRpm = (w) => (w * R.driveRatio * 60) / (2 * Math.PI);

// ------------------------------------------------------------ localization
/** does the Limelight see the tag cluster under the CELL? (centre of the cluster, its pitch up the camera's frame) */
export function llSees(pose, cell) {
  const cam = toWorld(pose, [0, R.ll.y, R.ll.z]);
  const tag = [cell.x, cell.y - HIVE.cellDepth, cell.z];
  const dx = tag[0] - cam[0];
  const dy = tag[1] - cam[1];
  const dz = tag[2] - cam[2];
  const hd = Math.hypot(dx, dz);
  const dist = Math.hypot(hd, dy);
  const bearing = wrap(Math.atan2(dx, dz) - pose.psi);
  const elev = Math.atan2(dy, hd) - R.ll.pitch;
  // the tags face straight down: seen from below only, and not too obliquely
  const look = dy / dist;
  return {seen: Math.abs(bearing) < R.ll.hfov / 2 && Math.abs(elev) < R.ll.vfov / 2 && dist < R.ll.range && look > 0.22, dist, bearing, elev};
}
