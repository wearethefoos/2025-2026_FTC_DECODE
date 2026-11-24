// The laser-cut body: every flat part of the frame as a 2D outline in its own (u, v) millimetres, placed in the robot
// frame by an origin and two unit axes. Plates join slot-and-tab: a tab on one plate's edge passes through the plate
// it meets, and the slot in that plate is cut from the tab's own 3D footprint, so slots line up by construction and
// follow the material: buildPlates('ply') for the first 6 mm birch-plywood iteration, buildPlates('alu') for the
// 3 mm 5052 aluminium one. build.js extrudes these for the 3D model; cutfiles.mjs writes them out as SVG and DXF.
import {R} from './robot.js';
import {BODY, floorY, railY} from './paths.js';

export const MATERIALS = {
  ply: {key: 'ply', t: 6, clear: 0.2, name: '6 mm birch plywood', laser: 'CO2 laser'},
  alu: {key: 'alu', t: 3, clear: 0.12, name: '3 mm 5052 aluminium', laser: 'fibre laser'},
};
// hole sizes the parts need, in one place so they can be matched to the hardware on the bench
export const BORE = {pollen: 38.5, nectar: 48.5};
export const HOLES = {
  m3: 1.65, // M3 clearance, radius
  axle: 5.25, // flanged bearing for the 5 mm hex wheel axle, radius: measure yours
  servoSpline: 6,
  encoder: 4,
};

const sub = (a, b) => a.map((v, i) => v - b[i]);
const add = (a, b) => a.map((v, i) => v + b[i]);
const mul = (a, k) => a.map((v) => v * k);
const dot = (a, b) => a.reduce((s, v, i) => s + v * b[i], 0);
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const unit = (a) => mul(a, 1 / Math.hypot(...a));
const area = (pts) => pts.reduce((s, p, i) => {
  const q = pts[(i + 1) % pts.length];
  return s + p[0] * q[1] - q[0] * p[1];
}, 0) / 2;

/** a rounded rectangle as a polygon */
export const roundRect = (u0, v0, u1, v1, r = 4, n = 5) => {
  const pts = [];
  const c = [[u1 - r, v0 + r, -Math.PI / 2], [u1 - r, v1 - r, 0], [u0 + r, v1 - r, Math.PI / 2], [u0 + r, v0 + r, Math.PI]];
  for (const [cu, cv, a0] of c) for (let i = 0; i <= n; i++) {
    const a = a0 + (i / n) * (Math.PI / 2);
    pts.push([cu + r * Math.cos(a), cv + r * Math.sin(a)]);
  }
  return pts;
};
const circle = (u, v, r) => ({circle: [u, v, r]});

/**
 * One plate. outline: [[u, v, edge?], ...], counter-clockwise or not (it is normalised); a vertex's edge spec
 * {into, at: [s0, s1]} puts tabs on the edge that starts at it, protruding outward through plate `into`, only
 * between s0 and s1 mm along the edge (default: the whole edge less the corners).
 */
function plate(name, o, U, V, outline, {holes = [], label = name, qty = 1, t} = {}) {
  return {name, label, qty, o, U: unit(U), V: unit(V), N: unit(cross(U, V)), outline, holes, t, tabs: [], slots: []};
}

/** expands the tab specs on a plate's outline into its final polygon, recording every tab */
function cutTabs(p, mats) {
  let pts = p.outline;
  let flipped = false;
  if (area(pts.map(([u, v]) => [u, v])) < 0) {
    flipped = true;
    // reverse, moving each edge spec to the vertex that now starts its edge
    const n = pts.length;
    pts = pts.map((_, i) => {
      const a = pts[n - 1 - i];
      const prev = pts[(2 * n - 2 - i) % n];
      return [a[0], a[1], prev[2]];
    });
  }
  const out = [];
  pts.forEach((a, i) => {
    const b = pts[(i + 1) % pts.length];
    out.push([a[0], a[1]]);
    const spec = a[2];
    if (!spec) return;
    const d = [b[0] - a[0], b[1] - a[1]];
    const L = Math.hypot(...d);
    const e = [d[0] / L, d[1] / L];
    const nrm = [e[1], -e[0]]; // outward for a counter-clockwise outline
    const depth = mats.t;
    const m = Math.min(L / 4, mats.t * 2 + 6);
    // at: one [s0, s1] range along the edge, or a list of them (to step around a hole in the mating plate)
    let ranges = !spec.at ? [[m, L - m]] : Array.isArray(spec.at[0]) ? spec.at : [spec.at];
    // a reversed outline walks the edge the other way: measure the ranges from its other end
    if (flipped && spec.at) ranges = ranges.map(([s0, s1]) => [L - s1, L - s0]);
    for (const [s0, s1] of ranges) {
      const span = s1 - s0;
      const n = Math.max(1, Math.min(6, Math.round(span / 70)));
      const len = Math.min(spec.len ?? 22, span / n * 0.6);
      for (let k = 0; k < n; k++) {
        const c = s0 + (span * (k + 0.5)) / n;
        const q0 = [a[0] + e[0] * (c - len / 2), a[1] + e[1] * (c - len / 2)];
        const q1 = [a[0] + e[0] * (c + len / 2), a[1] + e[1] * (c + len / 2)];
        out.push(q0, [q0[0] + nrm[0] * depth, q0[1] + nrm[1] * depth], [q1[0] + nrm[0] * depth, q1[1] + nrm[1] * depth], q1);
        p.tabs.push({into: spec.into, q0, q1, nrm, depth});
      }
    }
  });
  p.poly = out;
}

/** plate (u, v) -> robot frame mm */
export const toRobot = (p, u, v, w = 0) => add(add(add(p.o, mul(p.U, u)), mul(p.V, v)), mul(p.N, w));
const toPlate = (p, X) => {
  const d = sub(X, p.o);
  return [dot(d, p.U), dot(d, p.V)];
};
/** each tab's footprint, cut as a slot in the plate it passes through */
function cutSlots(plates, mats) {
  const by = Object.fromEntries(plates.map((p) => [p.name, p]));
  for (const p of plates)
    for (const tab of p.tabs) {
      const B = by[tab.into];
      if (!B) throw new Error(`${p.name}: no plate ${tab.into}`);
      // the tab's mid-depth line, either face of the tab plate
      const m0 = [tab.q0[0] + tab.nrm[0] * tab.depth * 0.5, tab.q0[1] + tab.nrm[1] * tab.depth * 0.5];
      const m1 = [tab.q1[0] + tab.nrm[0] * tab.depth * 0.5, tab.q1[1] + tab.nrm[1] * tab.depth * 0.5];
      const c = mats.clear / 2;
      const along = unit(sub(toRobot(p, ...m1), toRobot(p, ...m0)));
      const corner = (m, sa, sw) => toPlate(B, add(toRobot(p, m[0], m[1], sw * (p.t / 2 + c)), mul(along, sa * c)));
      B.slots.push({poly: [corner(m0, -1, -1), corner(m1, 1, -1), corner(m1, 1, 1), corner(m0, -1, 1)], from: p.name});
    }
}

// ------------------------------------------------------------ the body
export function buildPlates(key = 'ply') {
  const mats = MATERIALS[key];
  const T = mats.t;
  const H = BODY.half;
  const B = BODY;
  const Tp = R.turret.pollen;
  const Tn = R.turret.nectar;
  const px = Tp.x * 1000;
  const nx = Tn.x * 1000;
  const tz = Tp.z * 1000;
  const SI = H - T; // inner face of a side plate
  const plates = [];
  const tab = (into, at, len) => ({into, at, len});

  // ---------------------------------------------------------- side plates
  for (const [sx, nm] of [[1, 'side-left'], [-1, 'side-right']]) {
    const holes = [circle(B.motorZ[0] + 18.5, 37.5, HOLES.axle), circle(-(B.motorZ[0] + 18.5), 37.5, HOLES.axle)];
    // hub standoffs (Control Hub left, Expansion Hub right): match your hub's pattern
    for (const du of [-60, 60]) for (const dv of [-40, 40]) holes.push(circle(-5 + du, 122 + dv, HOLES.m3));
    // robot sign (R401) on the outside
    for (const du of [-75, 75]) for (const dv of [30, 84]) holes.push(circle(du, dv, HOLES.m3));
    holes.push({poly: roundRect(-140, 72, -88, 160, 10)}, {poly: roundRect(88, 72, 140, 160, 10)}, {poly: roundRect(-38, 104, 28, 160, 10)});
    plates.push(plate(nm, [sx * (H - T / 2), 0, 0], [0, 0, 1], [0, 1, 0], [[-H, B.bottom], [H, B.bottom], [H, B.sideTop], [-H, B.sideTop]], {holes, t: T}));
  }

  // ---------------------------------------------------------- the deck
  {
    const holes = [];
    for (const k of ['pollen', 'nectar']) {
      const Tk = R.turret[k];
      const cx = Tk.x * 1000;
      const cz = Tk.z * 1000;
      // the ball passes up through the deck here: a bore just bigger than the ball, inside the tower walls
      holes.push(circle(cx, cz, BORE[k]));
      // four bolts on the axes: the tower walls sit on the diagonals, between them
      for (let i = 0; i < 4; i++) holes.push(circle(cx + 61 * Math.cos((i * Math.PI) / 2), cz + 61 * Math.sin((i * Math.PI) / 2), HOLES.m3));
      // the yaw servo below the deck drives its pinion above it; the encoder's gear rides the ring on top
      const sxk = Math.sign(Tk.x);
      const pa = sxk > 0 ? -Math.PI / 4 : (-3 * Math.PI) / 4;
      const pu = cx + Math.cos(pa) * 90;
      const pv = cz + Math.sin(pa) * 90;
      holes.push(circle(pu, pv, HOLES.servoSpline), circle(pu - 24, pv, HOLES.m3), circle(pu + 24, pv, HOLES.m3));
      const ea = pa + Math.PI;
      const eu = cx + Math.cos(ea) * 90;
      const ev = cz + Math.sin(ea) * 90;
      holes.push(circle(eu, ev, HOLES.encoder), circle(eu - 16, ev, HOLES.m3), circle(eu + 16, ev, HOLES.m3));
    }
    // the Limelight mast's foot, the sorter access window, battery straps, the Pinpoint
    holes.push({poly: roundRect(-20, R.ll.z * 1000 - 18 - T / 2 - 0.1, 20, R.ll.z * 1000 - 18 + T / 2 + 0.1, 0.5, 1)});
    holes.push({poly: roundRect(-44, -76, 40, 6, 12)});
    for (const u of [-62, 62]) holes.push({poly: roundRect(u - 13, -206, u + 13, -202, 1.5, 2)});
    for (const du of [-12, 12]) for (const dv of [-12, 12]) holes.push(circle(-150 + du, -165 + dv, HOLES.m3));
    plates.push(plate('deck', [0, B.deckBottom + T / 2, 0], [1, 0, 0], [0, 0, 1], [[-SI, -H, tab('side-right')], [-SI, H], [SI, H, tab('side-left')], [SI, -H]], {holes, t: T}));
  }

  // ---------------------------------------------------------- the belly pan
  {
    const holes = [];
    for (const sx of [1, -1]) for (const sz of [1, -1]) holes.push({poly: roundRect(sx > 0 ? 148 : -201, sz > 0 ? 118 : -198, sx > 0 ? 201 : -148, sz > 0 ? 198 : -118, 8)});
    // odometry pods: forward at (90, 95), strafe at (-110, 95)
    holes.push({poly: roundRect(78, 58, 102, 132, 4)}, {poly: roundRect(-147, 83, -73, 107, 4)});
    for (const u of [-30, 30]) holes.push(circle(u, -130, 6)); // wiring pass-throughs
    plates.push(plate('belly', [0, B.bellyTop - T / 2, 0], [1, 0, 0], [0, 0, 1], [[-SI, -H, tab('side-right')], [-SI, H], [SI, H, tab('side-left')], [SI, -H]], {holes, t: T}));
  }

  // ---------------------------------------------------------- bulkhead legs (the ramps run between them)
  const RW = B.rampHalf + T; // ramp wall outer face
  for (const [sz, fb] of [[1, 'front'], [-1, 'rear']])
    for (const [sx, lr] of [[1, 'left'], [-1, 'right']]) {
      const holes = [circle(sx * 196, 60, HOLES.m3), circle(sx * 196, 120, HOLES.m3)];
      if (sx > 0) holes.push(circle(120, 113, HOLES.m3), circle(120, 143, HOLES.m3)); // intake motor bracket
      const a = sx * RW;
      const b = sx * SI;
      plates.push(
        plate(`bulkhead-${fb}-${lr}`, [0, 0, sz * (B.bulkheadZ - T / 2)], [1, 0, 0], [0, 1, 0],
          [[a, B.bellyTop, tab('belly')], [b, B.bellyTop, tab(`side-${lr}`)], [b, B.deckBottom, tab('deck')], [a, B.deckBottom, tab(`ramp-${fb}-${lr}`, [B.deckBottom - 108, B.deckBottom - B.bellyTop - 10])]],
          {holes, t: T}),
      );
    }

  // ---------------------------------------------------------- ramps: two guide walls and a floor each
  for (const [sz, fb] of [[1, 'front'], [-1, 'rear']]) {
    // the ramp ends at the sorter wall's outer face
    const zEnd = sz > 0 ? B.sortZ + B.gap / 2 + T : B.sortZ - B.gap / 2 - T;
    const fl = (z) => B.rampEnd + ((B.rampStart - B.rampEnd) * (z - zEnd)) / (sz * H - zEnd);
    const m0 = sz > 0 ? B.motorZ[0] - 4 : -B.motorZ[1] - 4;
    const m1 = sz > 0 ? B.motorZ[1] + 4 : -B.motorZ[0] + 4;
    const notchTop = B.motorTop + 4;
    for (const [sx, lr] of [[1, 'left'], [-1, 'right']]) {
      const edge = sz * H;
      const sorterTop = railY(sx * (B.rampHalf + T / 2)) - 4;
      // walk the profile from the sorter end along the bottom to the front edge, over the top and back
      const lo = Math.min(zEnd, edge);
      const hi = Math.max(zEnd, edge);
      const pts =
        sz > 0
          ? [
              [lo, B.bellyTop, tab('belly')],
              [m0, B.bellyTop],
              [m0, notchTop],
              [m1, notchTop],
              [m1, B.bellyTop, tab('belly')],
              [hi, B.bellyTop],
              [hi, fl(hi) + B.rampWall],
              [lo, fl(lo) + B.rampWall, tab(`sorter-${fb}`, [fl(lo) + B.rampWall - sorterTop, fl(lo) + B.rampWall - B.bellyTop - 4])],
            ]
          : [
              [lo, B.bellyTop, tab('belly')],
              [m0, B.bellyTop],
              [m0, notchTop],
              [m1, notchTop],
              [m1, B.bellyTop, tab('belly')],
              [hi, B.bellyTop, tab(`sorter-${fb}`, [4, sorterTop - B.bellyTop])],
              [hi, fl(hi) + B.rampWall],
              [lo, fl(lo) + B.rampWall],
            ];
      const holes = sx > 0 && sz > 0 ? [circle(200, 100, HOLES.m3)] : [];
      plates.push(plate(`ramp-${fb}-${lr}`, [sx * (B.rampHalf + T / 2), 0, 0], [0, 0, 1], [0, 1, 0], pts, {holes, t: T}));
    }
    // the floor: tilted, top surface on the ramp line, tabs into both walls
    const A = [0, fl(edge(sz)), sz * H];
    const Z = [0, B.rampEnd, zEnd];
    const U = unit(sub(Z, A));
    const V = [1, 0, 0];
    const N = unit(cross(U, V));
    const up = N[1] > 0 ? N : mul(N, -1);
    const o = add(A, mul(up, -T / 2));
    const L = Math.hypot(...sub(Z, A));
    const w = B.rampHalf;
    // tabs either side of the drive motors' notch in the walls
    const s0 = (H - B.motorZ[1] - 4) * (L / (H - Math.abs(zEnd)));
    const s1 = (H - B.motorZ[0] + 4) * (L / (H - Math.abs(zEnd)));
    const rg = [[6, s0 - 6], [s1 + 6, L - 6]];
    plates.push(plate(`ramp-floor-${fb}`, o, U, V, [[0, -w, tab(`ramp-${fb}-right`, rg)], [L, -w], [L, w, tab(`ramp-${fb}-left`, rg.map(([a, b]) => [L - b, L - a]))], [0, w]], {t: T}));
  }
  function edge(sz) {
    return sz * H;
  }

  // ---------------------------------------------------------- the sorter: two long walls, the channel floor
  const NI = -64; // the sorter walls stop at the nectar tower; NECTAR rolls off the rail ends into it
  const PO = Tp.x * 1000 + B.towerInner.pollen / 2; // pollen tower outer wall, inner face (x 150)
  const LW = PO + T + 10;
  for (const [sz, fb] of [[1, 'front'], [-1, 'rear']]) {
    const zc = B.sortZ + sz * (B.gap / 2 + T / 2);
    const ry = (x) => railY(x);
    const pts = [
      [NI, B.bellyTop, tab('belly')],
      [LW, B.bellyTop],
      [LW, B.deckBottom, tab('deck', [[4, 26], [LW - 64 - 26, LW - 64 - 4]])],
      [64, B.deckBottom],
      [64, ry(64)],
      [NI, ry(NI)],
    ];
    const holes = [];
    if (sz < 0) {
      // the lift wheels reach through this window into the pollen tower
      holes.push({poly: roundRect(px - 15, 40, px + 15, 165, 6)});
      for (const du of [-26, 26]) for (const dv of [45, 160]) holes.push(circle(px + du, dv, HOLES.m3));
    }
    plates.push(plate(`sorter-${fb}`, [0, 0, zc], [1, 0, 0], [0, 1, 0], pts, {holes, t: T, label: `sorter-${fb} (rails on top)`}));
  }
  {
    const x0 = NI;
    const x1 = 64;
    const A = [x0, floorY(x0), B.sortZ];
    const Z = [x1, floorY(x1), B.sortZ];
    const U = unit(sub(Z, A));
    const V = [0, 0, 1];
    const N = unit(cross(U, V));
    const up = N[1] > 0 ? N : mul(N, -1);
    const o = add(A, mul(up, -T / 2));
    const L = Math.hypot(...sub(Z, A));
    const w = B.gap / 2;
    plates.push(plate('channel-floor', o, U, V, [[0, -w, tab('sorter-rear')], [L, -w], [L, w, tab('sorter-front')], [0, w]], {t: T}));
  }

  // ---------------------------------------------------------- the towers
  // pollen: the two sorter walls are its sides; the outer wall closes it
  {
    const z0 = B.sortZ - B.gap / 2;
    const z1 = B.sortZ + B.gap / 2;
    plates.push(
      plate('pollen-tower-outer', [PO + T / 2, 0, 0], [0, 0, 1], [0, 1, 0],
        [[z0, B.bellyTop, tab('belly')], [z1, B.bellyTop, tab('sorter-front')], [z1, B.deckBottom, tab('deck')], [z0, B.deckBottom, tab('sorter-rear')]],
        {t: T}),
    );
  }
  // nectar: front, rear and outer walls
  {
    const inn = B.towerInner.nectar;
    const z0 = B.sortZ - inn / 2;
    const z1 = B.sortZ + inn / 2;
    const xi = -64; // inner face, channel side
    const xo = nx - inn / 2; // outer wall inner face (x -164)
    const zz0 = z0 - T - 4;
    const zz1 = z1 + T + 4;
    // the side toward the channel stays open: NECTAR rolls off the rail ends straight in
    plates.push(plate('nectar-outer', [xo - T / 2, 0, 0], [0, 0, 1], [0, 1, 0], [[zz0, B.bellyTop, tab('belly')], [zz1, B.bellyTop], [zz1, B.deckBottom, tab('deck')], [zz0, B.deckBottom]], {t: T}));
    for (const [sz, fb] of [[1, 'front'], [-1, 'rear']]) {
      const holes = [];
      if (sz < 0) {
        holes.push({poly: roundRect(nx - 15, 40, nx + 15, 165, 6)});
        for (const du of [-26, 26]) for (const dv of [45, 160]) holes.push(circle(nx + du, dv, HOLES.m3));
      }
      const zc = sz > 0 ? z1 + T / 2 : z0 - T / 2;
      plates.push(
        plate(`nectar-${fb}`, [0, 0, zc], [1, 0, 0], [0, 1, 0],
          [[xo, B.bellyTop, tab('belly')], [xi, B.bellyTop], [xi, B.deckBottom, tab('deck')], [xo, B.deckBottom, tab('nectar-outer')]],
          {holes, t: T}),
      );
    }
  }

  // ---------------------------------------------------------- drive motor plates: the UltraPlanetary face-mounts here
  for (const [sx, lr] of [[1, 'left'], [-1, 'right']])
    for (const [sz, fb] of [[1, 'front'], [-1, 'rear']]) {
      const zc = sz * (B.motorZ[0] + 18.5);
      const xc = sx * (R.wheelX * 1000 - 29);
      const holes = [circle(zc, 37.5, 7)];
      for (const du of [-12, 12]) for (const dv of [-12, 12]) holes.push(circle(zc + du, 37.5 + dv, HOLES.m3));
      plates.push(plate(`motor-${fb}-${lr}`, [xc, 0, 0], [0, 0, 1], [0, 1, 0], [[zc - 32, B.bellyTop, tab('belly')], [zc + 32, B.bellyTop], [zc + 32, 84], [zc - 32, 84]], {holes, t: T}));
    }

  for (const p of plates) cutTabs(p, mats);
  cutSlots(plates, mats);
  return {plates, mats};
}

/** a small comb to find the slot fit on your machine before cutting the body: slots from t - 0.1 to t + 0.4 */
export function fitComb(key = 'ply') {
  const {t} = MATERIALS[key];
  const W = 150;
  const out = [[0, 0], [W, 0], [W, 30], [0, 30]];
  const slots = [];
  const sizes = [-0.1, 0, 0.1, 0.2, 0.3, 0.4];
  sizes.forEach((d, i) => {
    const u = 15 + i * 24;
    const w = t + d;
    slots.push({poly: [[u - w / 2, 12], [u + w / 2, 12], [u + w / 2, 30], [u - w / 2, 30]], label: `${d >= 0 ? '+' : ''}${d.toFixed(1)}`, at: [u, 6]});
  });
  // the matching tab, cut from the same sheet
  const tabPart = [[0, 40], [40, 40], [40, 55], [27, 55], [27, 73], [13, 73], [13, 55], [0, 55]];
  return {name: `fit-comb-${key}`, outline: out, slots, tab: tabPart, t};
}
