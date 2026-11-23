// The Twin-Turret Pollinator film: the robot (build.js) on the BIOBUZZ field (field.js, stage.js) under the console
// (console.js), playing the routine (routine.js). The operator walks the views and display modes while the robot
// drive-by shoots, tips the HIVE, works the FLOWER from both ends, collects the spill with the rear intake and sweeps
// both turrets past each other. A pure function of t.
import * as THREE from 'three';
import {runSim} from 'teardown-kit/runtime.js';
import {createConsole, DISPLAY} from './console.js';
import {FRONT} from './paths.js';
import {BALL, HIVE, R, cellTarget, hiveCell, toWorld, turretGap, D2R} from './robot.js';
import {BALLS, DURATION, SHOTS, PICKS, arcAt, ballAt, flowerPos, flyAngle, heldAt, intakeOn, locAt, locHistory, poseAt, rockerAt, rollerAngle, scoreAt, tipTime, turretAt, upCellAt, velAt, wheelAngles} from './routine.js';
import {createStage} from './stage.js';

export {DURATION};
// the routine's chapters: the buttons in ROUTINE jump here
export const SEQ_AT = {driveby: 1.5, flower: 5.6, spill: 16.4, sweep: 22.5};
export const SCRIPT = [
  {t: 0, view: 'hero'},
  {t: 1.0, display: 'arcs'},
  {t: 1.5, seq: 'driveby'},
  {t: 1.9, view: 'chase'},
  {t: 2.3, display: 'aim'},
  {t: 4.3, view: 'field'},
  {t: 5.6, seq: 'flower'},
  {t: 6.4, view: 'top'},
  {t: 7.9, display: 'aim'},
  {t: 8.4, view: 'intake'},
  {t: 9.0, display: 'xray'},
  {t: 11.9, display: 'xray'},
  {t: 12.3, view: 'turrets'},
  {t: 13.0, display: 'labels'},
  {t: 15.9, display: 'labels'},
  {t: 16.4, seq: 'spill'},
  {t: 16.8, view: 'chase'},
  {t: 22.5, seq: 'sweep'},
  {t: 22.8, view: 'top'},
  {t: 23.1, display: 'envelopes'},
  {t: 23.5, display: 'arcs'},
  {t: 26.5, display: 'envelopes'},
  {t: 26.7, view: 'hero'},
  {t: 27.1, display: 'parts'},
];
export const DEFAULTS = {duration: DURATION, fps: 60, theme: 'light', hud: {enabled: false, title: 'pollinator', subtitle: ''}, director: {enabled: false}, watermark: ''};
const smoother = (x) => {
  const u = Math.min(1, Math.max(0, x));
  return u * u * u * (u * (u * 6 - 15) + 10);
};
const ss = (a, b, t) => smoother((t - a) / (b - a));

// ------------------------------------------------------------ the display toggles at film time t
export const seqAt = (t) => SCRIPT.filter((x) => x.seq && x.t <= t).pop()?.seq ?? 'driveby';
export const displayAt = (t) => {
  const out = Object.fromEntries(DISPLAY.map((k) => [k, 0]));
  for (const e of SCRIPT) if (e.display && e.t <= t) out[e.display] = out[e.display] ? 0 : 1;
  return out;
};
const lastFlip = (key, t) => SCRIPT.filter((e) => e.display === key && e.t <= t).pop()?.t ?? -9;
export const easedDisplay = (key, t, dur = 0.6) => {
  const on = displayAt(t)[key];
  const k = ss(lastFlip(key, t), lastFlip(key, t) + dur, t);
  return on ? k : 1 - k;
};

// ------------------------------------------------------------ views: functions of the robot's pose and seconds on
const W = (pose, p) => toWorld(pose, p);
export const VIEW_FN = {
  hero: (p, u) => {
    // from the open field side: away from the HIVE, through the robot
    const c = W(p, [0, 0.21, 0]);
    return {tx: c[0], ty: c[1], tz: c[2], az: Math.atan2(p.x - 0.3, p.z) / D2R + 14 + 3 * u, el: 21, d: 1.55, sx: 0, sy: -30};
  },
  chase: (p, u) => {
    // behind the robot's shoulder, the HIVE ahead in frame
    const up = hiveCell(HIVE.blueX, HIVE.tilt, 1);
    const c = [p.x * 0.8 + up.x * 0.2, 0.36, p.z * 0.8 + up.z * 0.2];
    const toward = Math.atan2(up.x - p.x, up.z - p.z) / D2R;
    return {tx: c[0], ty: c[1], tz: c[2], az: toward + 180 + 16 + 1.5 * u, el: 24, d: 2.2, sx: 0, sy: -24};
  },
  top: (p, u) => {
    const c = W(p, [0, 0.2, -0.02]);
    return {tx: c[0], ty: c[1], tz: c[2], az: p.psi / D2R + 180 + 0.8 * u, el: 80, d: 1.45, sx: 0, sy: -36};
  },
  turrets: (p, u) => {
    const c = W(p, [0, 0.37, 0.0]);
    return {tx: c[0], ty: c[1], tz: c[2], az: p.psi / D2R + 38 + 2 * u, el: 17, d: 1.0, sx: 0, sy: -30};
  },
  intake: (p, u) => {
    const c = W(p, [0, 0.1, FRONT - 0.06]);
    // from the robot's right and a little behind: the field side when it faces the blue wall
    return {tx: c[0], ty: c[1], tz: c[2], az: p.psi / D2R - 100 + 1.5 * u, el: 14, d: 1.0, sx: 0, sy: -40};
  },
  field: (p, u) => ({tx: 0.55, ty: 0.25, tz: 0.05, az: 58 + 1.2 * u, el: 36, d: 5.3, sx: 0, sy: -30}),
};
const VIEWS = SCRIPT.filter((e) => e.view).map((e) => [e.t, e.view]);
const blend = (a, b, k) => {
  const o = {};
  for (const key in b) o[key] = key === 'az' ? a.az + ((((b.az - a.az + 540) % 360) - 180) * k) : a[key] + (b[key] - a[key]) * k;
  const swing = Math.min(1, Math.abs(((b.az - a.az + 540) % 360) - 180) / 90);
  o.d += Math.max(0, Math.max(a.d, b.d) + 0.4 * swing - o.d) * Math.sin(Math.PI * k);
  return o;
};
export const camAt = (t) => {
  const p = poseAt(t);
  let i = 0;
  while (i < VIEWS.length - 1 && VIEWS[i + 1][0] <= t) i++;
  const cur = VIEW_FN[VIEWS[i][1]](p, t - VIEWS[i][0]);
  if (i > 0) {
    const k = ss(VIEWS[i][0], VIEWS[i][0] + 1.5, t);
    if (k < 1) return blend(VIEW_FN[VIEWS[i - 1][1]](p, t - VIEWS[i - 1][0]), cur, k);
  }
  return cur;
};
export const viewAt = (t) => VIEWS.filter(([a]) => a <= t).pop();

// ------------------------------------------------------------ the operator's pointer
const REST = [[860, 470], [760, 420], [940, 520], [820, 380]];
export function makeCursor(ui) {
  const EV = SCRIPT.filter((e) => e.t > 0).flatMap((e) => {
    const out = [];
    if (e.seq) out.push({t: e.t, spot: ui.spots[e.seq]});
    if (e.view) out.push({t: e.t, spot: ui.spots[e.view]});
    if (e.display) out.push({t: e.t, spot: ui.spots[e.display]});
    return out;
  });
  const WP = [[0, 900, 600]];
  EV.forEach((e, i) => {
    WP.push([e.t - 0.16, ...e.spot], [e.t + 0.22, ...e.spot]);
    WP.push([e.t + 1.3, ...REST[i % REST.length]]);
  });
  WP.sort((a, b) => a[0] - b[0]);
  return (t) => {
    let i = 0;
    while (i < WP.length - 2 && t > WP[i + 1][0]) i++;
    const [t0, x0, y0] = WP[i];
    const [t1, x1, y1] = WP[i + 1];
    const k = ss(t0, t1, t);
    const len = Math.hypot(x1 - x0, y1 - y0);
    const bow = Math.sin(Math.PI * k) * Math.min(24, len * 0.07);
    let press = false;
    let ring = 0;
    let rx = 0;
    let ry = 0;
    for (const e of EV) {
      if (t >= e.t - 0.07 && t < e.t + 0.09) press = true;
      if (t >= e.t && t < e.t + 0.55) {
        ring = 1 - (t - e.t) / 0.55;
        [rx, ry] = e.spot;
      }
    }
    return {x: x0 + (x1 - x0) * k + (len ? (-(y1 - y0) / len) * bow : 0), y: y0 + (y1 - y0) * k + (len ? ((x1 - x0) / len) * bow : 0), press, ring, ringX: rx, ringY: ry};
  };
}

// ------------------------------------------------------------ the labels: robot-frame points
const TP = R.turret.pollen;
const TN = R.turret.nectar;
const PARTS = [
  {name: 'LIMELIGHT 3A', sub: 'PITCHED 32° UP AT THE CELL TAGS', at: () => [0, R.ll.y, R.ll.z]},
  {name: 'POLLEN TURRET', sub: '71 MM BALLS · ±170°', at: () => [TP.x, R.podY + 0.07, TP.z]},
  {name: 'NECTAR TURRET', sub: '91 MM BALLS · ±170°', at: () => [TN.x, R.podY + 0.07, TN.z]},
  {name: 'DUAL FLYWHEELS', sub: '40:47 GEARED · TOP 15% SLOWER', at: () => [TN.x, R.podY, TN.z + 0.03]},
  {name: 'HOOD SERVO', sub: 'SMART ROBOT SERVO · 42–62°', at: () => [TP.x + TP.cheek + 0.013, R.podY, TP.z]},
  {name: 'TURRET DRIVE', sub: '30T PINION → 60T PRINTED RING', at: () => [TP.x + 0.064, 0.18, TP.z - 0.064]},
  {name: 'FLYWHEEL MOTOR', sub: 'HD HEX · 3:1 · 30:20 BELT', at: () => [TN.x, R.podY - 0.03, TN.z - R.motorBack]},
  {name: 'FRONT INTAKE', sub: 'TPU FLAPS · FITS THE 3.55 IN. SLOT', at: () => [0.1, 0.05, FRONT - 0.02]},
  {name: 'SORTER', sub: 'COLOR SENSOR V3 + DIVERTER', at: () => [0, 0.09, 0.07]},
  {name: 'ODOMETRY PODS', sub: '2 × GOBILDA · PINPOINT', at: () => [0.088, 0.03, -0.07]},
  {name: 'MECANUM DRIVE', sub: 'HD HEX 12:1 · 75 MM · 1.96 M/S', at: () => [R.wheelX + 0.02, R.wheelR, R.wheelZ]},
  {name: 'CONTROL HUB', sub: 'REV · + EXPANSION HUB', at: () => [0.19, 0.15, 0.0]},
];
export function makeLabels(st) {
  return (pose, o) => {
    if (o < 0.02) return [];
    const pts = PARTS.map((p) => {
      const q = toWorld(pose, p.at());
      return {p, at: st.project(q[0], q[1], q[2])};
    }).filter((x) => x.at && x.at[0] > 330 && x.at[0] < 1290 && x.at[1] > 130 && x.at[1] < 735);
    const L = pts.filter((x) => x.at[0] < 800).sort((a, b) => a.at[1] - b.at[1]);
    const Rr = pts.filter((x) => x.at[0] >= 800).sort((a, b) => a.at[1] - b.at[1]);
    const out = [];
    const stack = (col, x, w) => {
      let y = 140;
      for (const c of col.slice(0, 7)) {
        y = Math.max(y, Math.min(700, c.at[1] - 10));
        out.push({name: c.p.name, sub: c.p.sub, at: c.at, label: [x, y], w, o});
        y += 34;
      }
    };
    stack(L, 336, 180);
    stack(Rr, 1100, 180);
    return out;
  };
}

// ------------------------------------------------------------ the phase line and the state chip
const PHASES = [
  [0, 'HOLDING 2 POLLEN + 2 NECTAR · TURRETS ALREADY ON THE CELL'],
  [1.5, 'DRIVE-BY · STRAFING AT 0.7 M/S, TURRETS LEAD THE CELL'],
  [2.6, 'POLLEN AWAY · 4.7 M/S, 100 RPM BACKSPIN'],
  [3.2, 'NECTAR AWAY'],
  [4.0, 'POLLEN AWAY · THE CELL HOLDS 6'],
  [4.95, 'HIVE TIP · +20 · THE FAR CELL COMES UP'],
  [5.6, 'TURN TO THE FLOWER · TURRETS COUNTER-ROTATE'],
  [8.6, 'FRONT INTAKE INTO THE RETRIEVAL OPENING'],
  [9.05, 'POLLEN OUT OF THE BOTTOM · COLOR SENSOR → POLLEN LANE'],
  [10.65, 'SECOND POLLEN OUT · 4 HELD, THE G407 LIMIT'],
  [12.4, 'BOTH TURRETS SWING TO THE FLOWER TOP · LOB MODE'],
  [13.8, 'POLLEN PLACED THROUGH THE 4 IN. TOP'],
  [15.3, 'NECTAR ON TOP · TOP-MOST NECTAR OWNS THE FLOWER'],
  [16.4, 'REVERSE INTO THE SPILL · REAR INTAKE LEADS'],
  [18.6, 'SHOOTING OVER THE BACK · 122° TURRET YAW'],
  [19.4, 'REAR INTAKE PICKS UP A SPILLED POLLEN'],
  [20.55, 'COLLECT, SORT, SHOOT · WHILE DRIVING'],
  [22.5, 'CLEARANCE CHECK · BOTH TURRETS SWEEP ±170°'],
  [26.4, 'TURRETS HOME'],
];
export const TICKS = Object.values(SEQ_AT);
export const phaseAt = (t) => PHASES.filter(([a]) => a <= t).pop()[1];
const CHAPTER = [
  [0, 'START', 'DRIVE-BY'],
  [5.6, 'DRIVE-BY', 'FLOWER'],
  [16.4, 'FLOWER', 'SPILL'],
  [22.5, 'SPILL', 'SWEEP'],
];
const chapterAt = (t) => CHAPTER.filter(([a]) => a <= t).pop();
export function stateChip(t) {
  const firing = SHOTS.find((s) => t >= s.t - 0.2 && t < s.t + 0.25);
  if (firing) return [firing.place ? `Placing ${firing.kind}` : `Firing ${firing.kind}`, firing.place ? 'LOB INTO THE FLOWER TOP' : `DRIVE-BY · LEAD ${((Math.abs(firing.sol.lead) * 180) / Math.PI).toFixed(1)}°`, 'fire'];
  const tip = tipTime();
  if (t > tip && t < tip + 1.2) return ['HIVE tipping', 'TARGET SWITCHES CELLS', 'fire'];
  const p = turretAt('pollen', t).mode;
  if (p === 'sweep') return ['Clearance sweep', 'NO KEEP-OUT ZONES NEEDED', 'idle'];
  if (p === 'home') return ['Turrets home', 'SAFE TO LIFT', 'idle'];
  if (p === 'place') return ['Aiming at the FLOWER', 'TOP OPENING · 4 IN.', 'track'];
  const up = upCellAt(t);
  return ['Tracking the CELL', `TAGS ${up === 1 ? '38–41' : '42–45'} · SELF-AIM`, 'track'];
}

// ------------------------------------------------------------ the full frame state at routine time t
export function frameState(t, disp) {
  const pose = poseAt(t);
  const wheels = wheelAngles(t);
  const tu = {};
  for (const key of ['pollen', 'nectar']) {
    const s = turretAt(key, t);
    const feeding = SHOTS.some((x) => x.key === key && t > x.t - 0.2 && t < x.t + 0.05);
    tu[key] = {yaw: s.yaw, hood: s.hood, fly: flyAngle(key, t), feed: feeding ? t * 30 : 0, mode: s.mode, rpm: s.rpm, sol: s.sol};
  }
  // which way the sorter's diverter points: toward the lane of the ball crossing it
  let divert = 0;
  const balls = BALLS.map((b) => {
    const r = ballAt(b, t);
    if (r.sort) divert = b.kind === 'pollen' ? 1 : -1;
    return r;
  });
  // odometry pod wheels: the mecanum wheels' mean forward and strafe roll
  const fwd = (R.wheelR * (wheels[0] + wheels[1] + wheels[2] + wheels[3])) / 4;
  const str = (R.wheelR * (-wheels[0] + wheels[1] + wheels[2] - wheels[3])) / 4;
  const held = heldAt(t);
  // overlays
  const arcs = {};
  const aims = {};
  let marker = null;
  for (const key of ['pollen', 'nectar']) {
    const s = tu[key];
    const live = (s.mode === 'track' && (held[key] > 0 || SHOTS.some((x) => x.key === key && x.t > t && x.t - t < 1))) || s.mode === 'place';
    if (disp.arcs > 0.01 && live) {
      const a = arcAt(key, t);
      arcs[key] = a.pts;
      marker = a.target;
    }
    if (disp.aim > 0.01 && (s.mode === 'track' || s.mode === 'place')) {
      const T = R.turret[key];
      const from = toWorld(pose, [T.x, R.podY, T.z]);
      const tg = s.mode === 'place' ? [flowerPos.x, 0.546, flowerPos.z] : cellTarget(HIVE.blueX, upCellAt(t));
      const dd = Math.hypot(tg[0] - from[0], tg[2] - from[2]);
      const yw = pose.psi + s.yaw;
      aims[key] = {from, to: [tg[0], from[1], tg[2]], along: [from[0] + Math.sin(yw) * dd, from[1], from[2] + Math.cos(yw) * dd]};
    }
  }
  const loc = locAt(t);
  let ll = null;
  if (loc.seen) {
    const cell = hiveCell(HIVE.blueX, rockerAt(t), upCellAt(t));
    ll = {from: toWorld(pose, [0, R.ll.y, R.ll.z]), to: [cell.x, cell.y - HIVE.cellDepth, cell.z], a: 0.9};
  }
  return {
    pose,
    held,
    tu,
    loc,
    scene: {
      robot: {
        pose,
        wheels,
        turret: tu,
        roll: {front: rollerAngle('front', t), rear: rollerAngle('rear', t)},
        divert,
        podSpin: {fwd: fwd / 0.016, strafe: str / 0.016},
        envelope: disp.envelopes,
        xray: disp.xray,
        partsMode: disp.parts > 0.5,
      },
      rocker: rockerAt(t),
      ballList: BALLS,
      balls,
      arcs,
      arcAlpha: disp.arcs,
      aims,
      aimAlpha: disp.aim,
      marker,
      ll,
    },
  };
}

export function makeConsoleFrame(ui, st) {
  const labels = makeLabels(st);
  return (t, s) => {
    const f = s.f;
    const [, from, to] = chapterAt(t);
    const tur = {};
    for (const key of ['pollen', 'nectar']) {
      const T = R.turret[key];
      tur[key] = {...f.tu[key], x: T.x, z: T.z, sweep: T.sweep, held: f.held[key]};
    }
    ui.update({
      state: stateChip(t),
      turret: tur,
      loc: f.loc,
      locHist: locHistory(t),
      held: f.held,
      score: scoreAt(t),
      gap: turretGap(),
      seq: s.seq,
      view: s.view,
      display: s.display,
      paused: s.paused ?? false,
      from,
      to,
      phase: phaseAt(t),
      tau: t,
      dur: DURATION,
      ticks: TICKS,
      speed: s.speed ?? 1,
      speedK: s.speedK ?? 0.47,
      callouts: labels(f.pose, s.labels),
      cursor: s.cursor,
    });
  };
}

export function makeFilm() {
  return async ({cfg, canvas, capture}) => {
    const st = createStage({canvas});
    // a capture config can ask for the light tier: {"quality": "low"}
    if (cfg.quality === 'low') st.setQuality({samples: 2, ao: false, shadow: 2048});
    const resize = () => st.resize(1600, 900, capture ? devicePixelRatio || 1 : Math.min(devicePixelRatio || 1, 2));
    resize();
    const ui = createConsole(document.getElementById('app'));
    const cursorAt = makeCursor(ui);
    const consoleFrame = makeConsoleFrame(ui, st);
    window.PS = st;
    return {
      resize,
      render(t) {
        const disp = displayAt(t);
        const eased = Object.fromEntries(DISPLAY.map((k) => [k, easedDisplay(k, t)]));
        const f = frameState(t, eased);
        const cam = camAt(t);
        st.frame(f.scene, {...cam, az: cam.az * D2R, el: cam.el * D2R});
        const [vt0, view] = viewAt(t);
        consoleFrame(t, {f, seq: seqAt(t), view, display: disp, labels: eased.labels * ss(vt0 + 0.9, vt0 + 1.5, t), cursor: cursorAt(t)});
        return {};
      },
    };
  };
}

export const run = () => runSim(DEFAULTS, makeFilm());
void THREE;
void BALL;
void velAt;
void PICKS;
void intakeOn;
