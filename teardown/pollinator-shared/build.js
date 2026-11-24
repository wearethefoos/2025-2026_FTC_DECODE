// The Twin-Turret Pollinator built from code, in metres, in the robot frame (x left, y up, z forward). Every part is
// either a REV Robotics part (15 mm extrusion, HD Hex motors and UltraPlanetary gearboxes, Smart Robot Servos,
// Control Hub, Expansion Hub, 75 mm mecanum wheels, Through Bore Encoders, Color Sensor V3), a 3D-printed part
// (PETG-CF plates, turret rings and gears, pods, ramps; TPU tyres and intake flaps), or one of the two non-REV
// sensors the brief asks for: the Limelight 3A and two goBILDA odometry pods on a Pinpoint computer.
// update(state) poses it: the wheel angles, both turrets (yaw, hood pitch, flywheel angle), both intake rollers.
import * as THREE from 'three';
import {RoundedBoxGeometry} from 'three/addons/geometries/RoundedBoxGeometry.js';
import {BALL, R, nOff} from './robot.js';
import {BODY, FRONT, LIFT_ROLLER, ROLLER_Y} from './paths.js';
import {buildPlates} from './plates.js';

const V3 = THREE.Vector3;
export const CAT = {rev: 'REV', printed: 'PRINTED', tpu: 'PRINTED', cots: 'OTHER COTS', laser: 'LASER-CUT'};
export const CAT_COL = {rev: '#9aa3ad', printed: '#2f7fc1', tpu: '#1f5c8f', cots: '#3a9d63', laser: '#b9894f'};

export function makeMaterials() {
  const std = (color, rough, metal, extra = {}) => new THREE.MeshStandardMaterial({color, roughness: rough, metalness: metal, envMapIntensity: 0.55, ...extra});
  return {
    alu: std('#c4c9cf', 0.42, 0.55),
    aluDark: std('#8f969e', 0.45, 0.55),
    printed: std('#33669a', 0.62, 0.0),
    printedLight: std('#5d8fc2', 0.6, 0.0),
    printedDark: std('#4a515b', 0.6, 0.0),
    tpu: std('#2b2e33', 0.85, 0.0),
    motor: std('#202226', 0.5, 0.35),
    gearbox: std('#7c838b', 0.45, 0.5),
    servo: std('#232427', 0.55, 0.1),
    hub: std('#2c2f34', 0.6, 0.1),
    hubLabel: std('#d7dade', 0.6, 0.0),
    ll: std('#17181a', 0.5, 0.2),
    llLed: new THREE.MeshStandardMaterial({color: '#1a3d26', emissive: '#3dff8a', emissiveIntensity: 0.65, roughness: 0.4}),
    pod: std('#3a3d42', 0.5, 0.3),
    steel: std('#d9dde2', 0.35, 0.8),
    battery: std('#2f3237', 0.7, 0.0),
    sign: std('#2a64c9', 0.7, 0.0),
    rubber: std('#1d1e21', 0.9, 0.0),
    roller: std('#4a4d52', 0.7, 0.0),
    // the laser-cut body: faces and the darker cut edges
    body_ply: [std('#dcc39a', 0.78, 0.0), std('#5e3e24', 0.9, 0.0)],
    body_alu: [std('#c8cdd3', 0.38, 0.65), std('#8d949c', 0.45, 0.6)],
  };
}

// ------------------------------------------------------------ geometry helpers
const box = (w, h, d, r = 0.002) => new RoundedBoxGeometry(w, h, d, 2, Math.min(r, w / 2.2, h / 2.2, d / 2.2));
const cylX = (r, len, seg = 32) => new THREE.CylinderGeometry(r, r, len, seg).rotateZ(Math.PI / 2);
const cylY = (r, len, seg = 32) => new THREE.CylinderGeometry(r, r, len, seg);
const cylZ = (r, len, seg = 32) => new THREE.CylinderGeometry(r, r, len, seg).rotateX(Math.PI / 2);
/** a 15 mm REV extrusion along an axis, with its four slots */
function extrusion(len, axis, mats) {
  const g = new THREE.Group();
  const s = 0.015;
  const core = new THREE.Mesh(box(axis === 'x' ? len : s, axis === 'y' ? len : s, axis === 'z' ? len : s, 0.0012), mats.alu);
  g.add(core);
  // slot lines: thin dark strips on each face
  const sl = (w, h, d, x, y, z) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mats.aluDark);
    m.position.set(x, y, z);
    g.add(m);
  };
  const t = 0.0035;
  const e = s / 2 + 0.0002;
  if (axis === 'x') {
    sl(len * 0.999, t, 0.0006, 0, 0, e);
    sl(len * 0.999, t, 0.0006, 0, 0, -e);
    sl(len * 0.999, 0.0006, t, 0, e, 0);
    sl(len * 0.999, 0.0006, t, 0, -e, 0);
  } else if (axis === 'z') {
    sl(t, 0.0006, len * 0.999, 0, e, 0);
    sl(t, 0.0006, len * 0.999, 0, -e, 0);
    sl(0.0006, t, len * 0.999, e, 0, 0);
    sl(0.0006, t, len * 0.999, -e, 0, 0);
  } else {
    sl(t, len * 0.999, 0.0006, 0, 0, e);
    sl(t, len * 0.999, 0.0006, 0, 0, -e);
    sl(0.0006, len * 0.999, t, e, 0, 0);
    sl(0.0006, len * 0.999, t, -e, 0, 0);
  }
  return g;
}
/** a spur gear (printed), axis along y */
function gearGeo(teeth, module, width, holeR = 0) {
  const rp = (teeth * module) / 2;
  const ra = rp + module;
  const rr = rp - 1.25 * module;
  const sh = new THREE.Shape();
  for (let i = 0; i < teeth; i++) {
    const a0 = (i / teeth) * Math.PI * 2;
    const da = (Math.PI * 2) / teeth;
    const pts = [[rr, a0], [rr, a0 + da * 0.2], [ra, a0 + da * 0.36], [ra, a0 + da * 0.6], [rr, a0 + da * 0.76]];
    pts.forEach(([r, a], k) => (i === 0 && k === 0 ? sh.moveTo(r * Math.cos(a), r * Math.sin(a)) : sh.lineTo(r * Math.cos(a), r * Math.sin(a))));
  }
  sh.closePath();
  if (holeR) {
    const h = new THREE.Path();
    h.absarc(0, 0, holeR, 0, Math.PI * 2, true);
    sh.holes.push(h);
  }
  const g = new THREE.ExtrudeGeometry(sh, {depth: width, bevelEnabled: false, curveSegments: 3});
  g.rotateX(-Math.PI / 2);
  return g;
}
/** a flat ring, axis along y */
const ringGeo = (ro, ri, h, seg = 64) => {
  const sh = new THREE.Shape();
  sh.absarc(0, 0, ro, 0, Math.PI * 2, false);
  const hole = new THREE.Path();
  hole.absarc(0, 0, ri, 0, Math.PI * 2, true);
  sh.holes.push(hole);
  const g = new THREE.ExtrudeGeometry(sh, {depth: h, bevelEnabled: true, bevelThickness: 0.0008, bevelSize: 0.0008, bevelSegments: 1, curveSegments: seg});
  g.rotateX(-Math.PI / 2);
  return g;
};
/** a disc-shaped plate, axis along x */
const discX = (r, th, holes = []) => {
  const sh = new THREE.Shape();
  sh.absarc(0, 0, r, 0, Math.PI * 2, false);
  for (const [a, b, rr] of holes) {
    const h = new THREE.Path();
    h.absarc(a, b, rr, 0, Math.PI * 2, true);
    sh.holes.push(h);
  }
  const g = new THREE.ExtrudeGeometry(sh, {depth: th, bevelEnabled: true, bevelThickness: 0.0008, bevelSize: 0.0008, bevelSegments: 1, curveSegments: 40});
  g.translate(0, 0, -th / 2);
  g.rotateY(Math.PI / 2);
  return g;
};

// ------------------------------------------------------------ the robot
export function buildRobot() {
  const mats = makeMaterials();
  const root = new THREE.Group();
  const parts = []; // every mesh: {mesh, cat, base}
  const shells = []; // meshes the x-ray fades
  const add = (parent, geo, mat, cat, {x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, shell = false, name = ''} = {}) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.rotation.set(rx, ry, rz);
    m.castShadow = true;
    m.receiveShadow = true;
    m.userData = {cat, base: mat, shell, name};
    parent.add(m);
    parts.push(m);
    if (shell) shells.push(m);
    return m;
  };
  const addGroup = (parent, g, cat, opts = {}) => {
    g.traverse((o) => {
      if (o.isMesh) {
        o.castShadow = true;
        o.receiveShadow = true;
        o.userData = {cat, base: o.material, shell: !!opts.shell};
        parts.push(o);
        if (opts.shell) shells.push(o);
      }
    });
    parent.add(g);
    return g;
  };
  const HW = R.W / 2;
  const HL = R.L / 2;
  void HL;
  const FY = 0.053; // sign centre height on the side plates, over its four bolt holes
  const FRONT_M = FRONT;
  const HL_M = BODY.half / 1000;
  // the turrets sit on the deck's top face (a printed spacer makes up the difference on 3 mm aluminium)
  const DECK_Y = (BODY.deckBottom + 6) / 1000;

  // ---------------------------------------------------------- the laser-cut body (plates.js): plywood first, aluminium later
  const body = new THREE.Group();
  root.add(body);
  let bodyKey = '';
  const setBody = (key) => {
    if (key === bodyKey) return;
    bodyKey = key;
    for (const m of [...body.children]) {
      body.remove(m);
      m.geometry.dispose();
      parts.splice(parts.indexOf(m), 1);
      if (shells.includes(m)) shells.splice(shells.indexOf(m), 1);
    }
    const {plates} = buildPlates(key);
    for (const pl of plates) {
      const sh = new THREE.Shape(pl.poly.map(([u, v]) => new THREE.Vector2(u, v)));
      for (const h of pl.holes) {
        const path = new THREE.Path();
        if (h.circle) path.absarc(h.circle[0], h.circle[1], h.circle[2], 0, Math.PI * 2, true);
        else h.poly.forEach(([u, v], i) => (i ? path.lineTo(u, v) : path.moveTo(u, v)));
        sh.holes.push(path);
      }
      for (const sl of pl.slots) {
        const path = new THREE.Path();
        sl.poly.forEach(([u, v], i) => (i ? path.lineTo(u, v) : path.moveTo(u, v)));
        sh.holes.push(path);
      }
      const g = new THREE.ExtrudeGeometry(sh, {depth: pl.t, bevelEnabled: false, curveSegments: 24});
      g.translate(0, 0, -pl.t / 2);
      const M = new THREE.Matrix4().makeBasis(new V3(...pl.U), new V3(...pl.V), new V3(...pl.N)).setPosition(new V3(...pl.o));
      g.applyMatrix4(M);
      g.scale(0.001, 0.001, 0.001);
      add(body, g, mats[`body_${key}`], 'laser', {shell: pl.name !== 'belly', name: pl.name});
    }
  };
  setBody('ply');

  // ---------------------------------------------------------- the drive: 4 mecanum wheels, HD Hex + UltraPlanetary
  const wheels = [];
  const wheelGeo = {
    hub: cylX(0.024, 0.044, 28),
    plate: cylX(0.031, 0.004, 28),
    roller: new THREE.CapsuleGeometry(0.0085, 0.026, 3, 10),
  };
  const corners = [
    ['FL', 1, 1],
    ['FR', -1, 1],
    ['BL', 1, -1],
    ['BR', -1, -1],
  ];
  for (const [name, sx, sz] of corners) {
    const g = new THREE.Group();
    g.position.set(sx * R.wheelX, R.wheelR, sz * R.wheelZ);
    const spin = new THREE.Group();
    g.add(spin);
    add(spin, wheelGeo.hub, mats.aluDark, 'rev');
    for (const s of [-1, 1]) add(spin, wheelGeo.plate, mats.alu, 'rev', {x: s * 0.021});
    // 10 rollers at 45 deg; FL and BR one hand, FR and BL the other (an X seen from above)
    const hand = sx * sz > 0 ? 1 : -1;
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      const r = new THREE.Group();
      r.rotation.x = a;
      const m = add(r, wheelGeo.roller, mats.rubber, 'rev', {y: 0.0285});
      // along the rim, then tilted 45 deg about the radius
      m.rotation.order = 'YXZ';
      m.rotation.set(Math.PI / 2, hand * Math.PI / 4, 0);
      spin.add(r);
    }
    root.add(g);
    wheels.push({g, spin, sx});
    // the motor: HD Hex can + UltraPlanetary (2 cartridges), axle along x, pointing inward
    const mo = new THREE.Group();
    mo.position.set(sx * (R.wheelX - 0.03), R.wheelR, sz * R.wheelZ);
    add(mo, box(0.04, 0.04, 0.04, 0.003), mats.gearbox, 'rev', {x: -sx * 0.024});
    add(mo, box(0.036, 0.036, 0.04, 0.003), mats.gearbox, 'rev', {x: -sx * 0.044});
    add(mo, cylX(0.0185, 0.07, 28), mats.motor, 'rev', {x: -sx * 0.098});
    add(mo, cylX(0.012, 0.012, 20), mats.aluDark, 'rev', {x: -sx * 0.139});
    root.add(mo);
  }

  // ---------------------------------------------------------- electronics: Control Hub, Expansion Hub, battery, Pinpoint
  const hubGeo = box(0.03, 0.103, 0.143, 0.004);
  for (const [sx, name] of [[1, 'CONTROL HUB'], [-1, 'EXPANSION HUB']]) {
    // standing against the side rail, outboard of the lanes, between the wheels
    add(root, hubGeo, mats.hub, 'rev', {x: sx * 0.19, y: 0.122, z: -0.005, name});
    add(root, box(0.002, 0.03, 0.09, 0.0005), mats.hubLabel, 'rev', {x: sx * 0.174, y: 0.135, z: -0.005});
  }
  // the battery rides on the deck at the back, strapped through two slots: quick to swap
  add(root, box(0.15, 0.045, 0.048, 0.006), mats.battery, 'rev', {y: DECK_Y + 0.0225, z: -0.204, name: 'battery'});
  add(root, box(0.028, 0.008, 0.042, 0.002), mats.pod, 'cots', {x: -0.15, y: DECK_Y + 0.004, z: -0.165, name: 'pinpoint'});

  // ---------------------------------------------------------- odometry: two goBILDA pods (forward and strafe)
  const pods = [];
  for (const [x, z, dir] of [[0.09, 0.095, 'fwd'], [-0.11, 0.095, 'strafe']]) {
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    if (dir === 'strafe') g.rotation.y = Math.PI / 2;
    add(g, box(0.024, 0.04, 0.07, 0.003), mats.pod, 'cots', {y: 0.04, z: 0.01});
    const wh = new THREE.Group();
    wh.position.set(0, 0.016, -0.012);
    add(wh, cylX(0.016, 0.012, 24), mats.rubber, 'cots');
    add(wh, cylX(0.006, 0.016, 12), mats.steel, 'cots');
    g.add(wh);
    root.add(g);
    pods.push({g, wh, dir});
  }

  // ---------------------------------------------------------- the transfer: a lift in each tower, colour sensors at the ramp tops
  // Three TPU compliant wheels on one belt, behind the tower's rear wall, reach 10 mm through its window and roll the
  // ball up the turret axis; a Smart Robot Servo (continuous) drives the belt. Stalled, it holds the ball under the deck.
  const lifts = {};
  for (const key of ['pollen', 'nectar']) {
    const T = R.turret[key];
    const inner = BODY.towerInner[key] / 2;
    const zc = T.z - inner / 1000 - (BODY.liftWheelR - 10) / 1000;
    const g = new THREE.Group();
    g.position.set(T.x, 0, zc);
    root.add(g);
    const wheels = [];
    for (const y of BODY.liftZ) {
      const w = new THREE.Group();
      w.position.y = y / 1000;
      add(w, cylX(BODY.liftWheelR / 1000, 0.022, 24), mats.tpu, 'tpu', {name: `${key} lift wheel`});
      for (let i = 0; i < 6; i++) add(w, box(0.024, 0.003, 0.016, 0.0008), mats.printedDark, 'printed', {rx: (i / 6) * Math.PI});
      add(w, cylX(0.0045, 0.05, 8), mats.steel, 'rev');
      g.add(w);
      wheels.push(w);
    }
    // the belt linking them, and the printed bracket that carries the axles
    const y0 = BODY.liftZ[0] / 1000;
    const y1 = BODY.liftZ[BODY.liftZ.length - 1] / 1000;
    for (const sx_ of [-1, 1]) add(g, box(0.004, y1 - y0 + 0.016, 0.01, 0.002), mats.rubber, 'rev', {x: 0.016 + 0.004, y: (y0 + y1) / 2, z: sx_ * 0.008});
    add(g, box(0.006, y1 - y0 + 0.04, 0.03, 0.002), mats.printed, 'printed', {x: -0.018, y: (y0 + y1) / 2, z: -0.012});
    add(g, box(0.02, 0.04, 0.04, 0.003), mats.servo, 'rev', {x: 0.034, y: y0, z: -0.02, name: `${key} lift servo`});
    lifts[key] = wheels;
  }
  // a REV Color Sensor V3 under each ramp's top end: it counts balls and catches a red NECTAR before it is sorted
  for (const sz of [1, -1]) {
    const z = (BODY.sortZ + sz * (BODY.gap / 2 + 18)) / 1000;
    add(root, box(0.024, 0.008, 0.024, 0.002), mats.hub, 'rev', {y: (BODY.rampEnd - 10) / 1000, z, name: 'colour sensor'});
  }

  // ---------------------------------------------------------- the intakes: printed arms, TPU flap rollers, HD Hex each
  const intakes = {};
  for (const [side, sz] of [['front', 1], ['rear', -1]]) {
    const g = new THREE.Group();
    g.position.set(0, 0, sz * (HL - 0.01));
    const zr = sz * (R.intakeOut - 0.012);
    for (const sx of [-1, 1]) {
      // the arm plates
      const sh = new THREE.Shape();
      sh.moveTo(-0.012, 0.05);
      sh.lineTo(0.012, 0.075);
      sh.lineTo(R.intakeOut + 0.004, 0.105);
      sh.lineTo(R.intakeOut + 0.012, 0.075);
      sh.lineTo(R.intakeOut, 0.05);
      sh.closePath();
      const geo = new THREE.ExtrudeGeometry(sh, {depth: 0.006, bevelEnabled: false});
      geo.translate(0, 0, -0.003);
      geo.rotateY(sz > 0 ? -Math.PI / 2 : Math.PI / 2);
      add(g, geo, mats.printed, 'printed', {x: sx * 0.196});
    }
    // the roller: a REV 5 mm hex shaft with printed TPU flaps
    const roll = new THREE.Group();
    roll.position.set(0, ROLLER_Y, zr);
    add(roll, cylX(0.0045, 0.4, 8), mats.steel, 'rev');
    add(roll, cylX(0.01, 0.36, 16), mats.printed, 'printed');
    const flap = box(0.01, 0.03, 0.003, 0.001);
    for (let i = 0; i < 7; i++) {
      const x = -0.165 + (i * 0.33) / 6;
      for (let j = 0; j < 6; j++) {
        const f = new THREE.Group();
        f.position.x = x;
        f.rotation.x = (j / 6) * Math.PI * 2 + i * 0.4;
        add(f, flap, mats.tpu, 'tpu', {y: 0.025});
        roll.add(f);
      }
    }
    g.add(roll);
    // the printed lip the ball climbs, from the tiles to the plywood ramp
    {
      const lipPts = [[0.002, FRONT_M], [0.026, 0.268], [0.058, 0.24], [BODY.rampStart / 1000, HL_M]].map(([y, z]) => new V3(0, y, sz * z - g.position.z));
      const c = new THREE.CatmullRomCurve3(lipPts);
      const n = 24;
      const fl = [];
      const idx = [];
      for (let i = 0; i <= n; i++) {
        const q = c.getPoint(i / n);
        fl.push(-0.05, q.y - 0.003, q.z, 0.05, q.y - 0.003, q.z);
        if (i) idx.push(2 * i - 2, 2 * i - 1, 2 * i, 2 * i - 1, 2 * i + 1, 2 * i);
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(fl, 3));
      geo.setIndex(idx);
      geo.computeVertexNormals();
      const lm = add(g, geo, mats.printedLight, 'printed', {name: 'intake lip'});
      lm.material = mats.printedLight;
      lm.userData.base = mats.printedLight;
    }
    // the lift roller over the lip pushes each ball up onto the ramp; same motor, one belt
    const roll2 = new THREE.Group();
    roll2.position.set(0, LIFT_ROLLER.y, sz * LIFT_ROLLER.z - g.position.z);
    add(roll2, cylX(0.0045, 0.12, 8), mats.steel, 'rev');
    for (const x of [-0.03, 0, 0.03]) {
      add(roll2, cylX(0.022, 0.014, 20), mats.tpu, 'tpu', {x});
    }
    g.add(roll2);
    // the intake motor above the arm, belted down to the roller
    const mo = new THREE.Group();
    mo.position.set(0.12, 0.128, zr - sz * 0.01);
    add(mo, cylX(0.0185, 0.07, 24), mats.motor, 'rev', {x: -0.02});
    add(mo, box(0.04, 0.04, 0.04, 0.003), mats.gearbox, 'rev', {x: 0.035});
    g.add(mo);
    add(g, box(0.006, 0.06, 0.012, 0.002), mats.rubber, 'rev', {x: 0.172, y: 0.103, z: zr});
    root.add(g);
    intakes[side] = {g, roll, roll2};
  }

  // ---------------------------------------------------------- the Limelight 3A on a printed mast, pitched up
  const llG = new THREE.Group();
  llG.position.set(0, R.ll.y, R.ll.z);
  llG.rotation.x = -R.ll.pitch;
  add(llG, box(0.066, 0.05, 0.022, 0.004), mats.ll, 'cots', {name: 'limelight'});
  add(llG, cylZ(0.009, 0.006, 20), mats.steel, 'cots', {z: 0.012});
  for (const s of [-1, 1]) add(llG, box(0.014, 0.006, 0.003, 0.001), mats.llLed, 'cots', {x: s * 0.022, y: 0.012, z: 0.012});
  root.add(llG);
  add(root, box(0.04, R.ll.y - 0.075, 0.008, 0.002), mats.printed, 'printed', {y: (R.ll.y + 0.075) / 2 - 0.01, z: R.ll.z - 0.018});

  // ---------------------------------------------------------- robot signs (R401): blue, both sides
  {
    const c = document.createElement('canvas');
    c.width = 512;
    c.height = 200;
    const x = c.getContext('2d');
    x.fillStyle = '#2a64c9';
    x.fillRect(0, 0, 512, 200);
    x.fillStyle = '#fff';
    x.font = '700 150px Inter, sans-serif';
    x.textAlign = 'center';
    x.textBaseline = 'middle';
    x.fillText('00000', 256, 108);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    const mat = new THREE.MeshStandardMaterial({map: tex, roughness: 0.7});
    for (const sx of [-1, 1]) {
      const geo = new THREE.PlaneGeometry(6.5 * 0.0254, 2.5 * 0.0254);
      const m = add(root, geo, mat, 'printed', {x: sx * (HW + 0.0012), y: FY + 0.004, z: 0.0, ry: sx * Math.PI / 2});
      m.castShadow = false;
      void m;
    }
  }

  // ---------------------------------------------------------- the turrets
  const turrets = {};
  for (const key of ['pollen', 'nectar']) {
    const T = R.turret[key];
    const sx = Math.sign(T.x);
    const base = new THREE.Group();
    base.position.set(T.x, DECK_Y, T.z);
    root.add(base);
    // fixed: the printed bearing race (6 mm BBs between two printed rings) and the drive servo with its pinion
    const ri = BALL[key].d / 2 + 0.006;
    add(base, ringGeo(0.068, ri, 0.008), mats.printed, 'printed', {y: 0});
    const pinA = (sx > 0 ? -1 : 1) * 0;
    const pr = (T.pinT * T.module) / 2;
    const rr = (T.ringT * T.module) / 2;
    // the pinion sits back and outboard of the ring, inside the frame
    const pa = sx > 0 ? -Math.PI / 4 : -3 * Math.PI / 4;
    const px = Math.cos(pa) * (rr + pr);
    const pz = Math.sin(pa) * (rr + pr);
    void pinA;
    const pinion = new THREE.Group();
    pinion.position.set(px, 0.012, pz);
    add(pinion, gearGeo(T.pinT, T.module, 0.008, 0.003), mats.printedLight, 'printed');
    base.add(pinion);
    add(base, box(0.04, 0.036, 0.02, 0.003), mats.servo, 'rev', {x: px, y: -0.022, z: pz, name: 'turret servo'});
    // the Through Bore Encoder rides the ring on the deck, opposite the pinion, through its own 30T gear
    const encGear = new THREE.Group();
    {
      const ea = pa + Math.PI;
      encGear.position.set(Math.cos(ea) * (rr + pr), 0.012, Math.sin(ea) * (rr + pr));
      add(encGear, gearGeo(T.pinT, T.module, 0.008, 0.003), mats.printedLight, 'printed');
      base.add(encGear);
      add(base, box(0.04, 0.012, 0.04, 0.004), mats.hub, 'rev', {x: encGear.position.x, y: 0.028, z: encGear.position.z, name: 'through bore'});
    }

    // turning: the ring gear and everything above it
    const yawG = new THREE.Group();
    yawG.position.y = 0.008;
    base.add(yawG);
    add(yawG, gearGeo(T.ringT, T.module, 0.01, ri + 0.002), mats.printed, 'printed');
    add(yawG, ringGeo(0.056, ri, 0.016), mats.printedLight, 'printed', {y: 0.01, shell: true});
    // cheek plates: discs about the pod pivot, so the swept circle stays small
    const pivY = R.podY - DECK_Y - 0.008;
    for (const s of [-1, 1]) {
      // pocketed: the pivot bore and five lightening holes
      const holes = [[0, 0, 0.006], ...Array.from({length: 5}, (_, i) => [Math.cos((i / 5) * Math.PI * 2 + 0.6) * 0.05, Math.sin((i / 5) * Math.PI * 2 + 0.6) * 0.05, 0.016])];
      const g = discX(R.cheekR, 0.005, holes);
      add(yawG, g, mats.printed, 'printed', {x: s * T.cheek, y: pivY, shell: true, name: `${key} cheek`});
      // the post down to the ring
      add(yawG, box(0.005, pivY - 0.02, 0.03, 0.0015), mats.printed, 'printed', {x: s * T.cheek, y: (pivY + 0.02) / 2 - 0.004, z: 0});
    }
    // the flywheel motor behind, axis across, between the cheeks
    add(yawG, cylX(0.0185, 2 * T.motorHalf - 0.03, 28), mats.motor, 'rev', {y: pivY - 0.02, z: -R.motorBack, name: `${key} flywheel motor`});
    add(yawG, box(0.036, 0.036, 0.036, 0.003), mats.gearbox, 'rev', {x: sx * (T.motorHalf - 0.02), y: pivY - 0.02, z: -R.motorBack});
    // the feeder: a Smart Robot Servo with a TPU wheel pushing the ball up from the ring into the nip
    const feeder = new THREE.Group();
    feeder.position.set(0, 0.07, -0.042);
    add(feeder, cylX(0.016, 0.02, 20), mats.tpu, 'tpu');
    yawG.add(feeder);
    add(yawG, box(0.02, 0.04, 0.04, 0.003), mats.servo, 'rev', {x: -sx * 0.035, y: 0.07, z: -0.05, name: `${key} feeder`});

    // pitching: the pod with the two flywheels, the hood servo turns it
    const pod = new THREE.Group();
    pod.position.y = pivY;
    yawG.add(pod);
    const no = nOff(key);
    const fly = [];
    for (const [s, name] of [[-1, 'bottom'], [1, 'top']]) {
      const w = new THREE.Group();
      // n axis in the pod frame is +y; the launch line is +z
      w.position.set(0, s * no, 0);
      add(w, cylX(R.flyR, 2 * T.wheelHalf, 36), mats.tpu, 'tpu', {name: `${key} ${name} flywheel`});
      add(w, cylX(R.flyR * 0.72, 2 * T.wheelHalf + 0.004, 36), mats.printedLight, 'printed');
      for (let i = 0; i < 5; i++) add(w, box(2 * T.wheelHalf + 0.006, 0.004, R.flyR * 0.6, 0.001), mats.printed, 'printed', {rx: (i / 5) * Math.PI});
      add(w, cylX(0.004, 2 * T.cheek, 8), mats.steel, 'rev');
      pod.add(w);
      fly.push(w);
    }
    // the gears that make the top wheel 15 % slower (40T on the bottom, 47T on the top)
    // module chosen so the pitch circles meet: m (40 + 47) / 2 = 2 nOff
    const gm = (4 * no) / 87;
    const gb = gearGeo(40, gm, 0.003, R.flyR * 0.8);
    gb.rotateZ(Math.PI / 2);
    const gt = gearGeo(47, gm, 0.003, R.flyR * 0.95);
    gt.rotateZ(Math.PI / 2);
    const gBottom = add(fly[0], gb, mats.printedDark, 'printed', {x: -sx * (T.cheek - 0.008)});
    const gTop = add(fly[1], gt, mats.printedDark, 'printed', {x: -sx * (T.cheek - 0.008)});
    void gBottom;
    void gTop;
    // pod side plates
    for (const s of [-1, 1]) {
      const sh = new THREE.Shape();
      const a = no + R.flyR * 0.55;
      sh.moveTo(-0.022, -a);
      sh.lineTo(0.028, -a);
      sh.lineTo(0.028, a);
      sh.lineTo(-0.022, a);
      sh.closePath();
      const geo = new THREE.ExtrudeGeometry(sh, {depth: 0.004, bevelEnabled: false});
      geo.translate(0, 0, -0.002);
      geo.rotateY(-Math.PI / 2);
      add(pod, geo, mats.printedLight, 'printed', {x: s * (T.cheek - 0.0045), shell: true});
    }
    // the hood servo on the outer cheek
    add(yawG, box(0.02, 0.04, 0.04, 0.003), mats.servo, 'rev', {x: sx * (T.cheek + 0.013), y: pivY, z: 0.0, name: `${key} hood servo`});
    // a muzzle lip where the ball leaves
    turrets[key] = {base, yawG, pod, fly, feeder, pinion, encGear, key};
  }

  // ---------------------------------------------------------- the envelope discs (ENVELOPES display)
  const env = {};
  for (const key of ['pollen', 'nectar']) {
    const T = R.turret[key];
    const m = new THREE.Mesh(
      new THREE.RingGeometry(T.sweep - 0.002, T.sweep, 96).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({color: '#e4572e', transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide}),
    );
    const f = new THREE.Mesh(
      new THREE.CircleGeometry(T.sweep, 96).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({color: '#e4572e', transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide}),
    );
    m.position.set(T.x, R.podY + 0.11, T.z);
    f.position.copy(m.position);
    m.renderOrder = 8;
    f.renderOrder = 7;
    root.add(m, f);
    env[key] = {ring: m, fill: f};
  }

  // ---------------------------------------------------------- posing
  const catMats = Object.fromEntries(Object.entries(CAT_COL).map(([k, c]) => [k, new THREE.MeshStandardMaterial({color: c, roughness: 0.6, metalness: 0.1})]));
  const ghostCache = new Map();
  const ghostOf = (m) => {
    if (!ghostCache.has(m)) {
      const g = m.clone();
      g.transparent = true;
      g.opacity = 0.16;
      g.depthWrite = false;
      ghostCache.set(m, g);
    }
    return ghostCache.get(m);
  };
  let lastLook = '';
  const setLook = (parts_, xray) => {
    const key = `${parts_ ? 1 : 0}${xray ? 1 : 0}${bodyKey}`;
    if (key === lastLook) return;
    lastLook = key;
    for (const m of parts) {
      let mat = parts_ ? catMats[m.userData.cat] || m.userData.base : m.userData.base;
      if (xray && m.userData.shell) mat = Array.isArray(mat) ? mat.map(ghostOf) : ghostOf(mat);
      m.material = mat;
      m.castShadow = !(xray && m.userData.shell);
    }
  };
  const update = (st) => {
    root.position.set(st.pose.x, 0, st.pose.z);
    root.rotation.y = st.pose.psi;
    st.wheels.forEach((a, i) => (wheels[i].spin.rotation.x = a));
    for (const key of ['pollen', 'nectar']) {
      const t = turrets[key];
      const s = st.turret[key];
      t.yawG.rotation.y = s.yaw;
      // ring 60T, pinion 30T: the pinion turns twice as far, the other way
      t.pinion.rotation.y = -s.yaw * (R.turret[key].ringT / R.turret[key].pinT);
      t.encGear.rotation.y = -s.yaw * (R.turret[key].ringT / R.turret[key].pinT);
      for (const w of lifts[key]) w.rotation.x = st.lift?.[key] ?? 0;
      // pod pitch: launch line +z tilted up by the hood angle
      t.pod.rotation.x = -s.hood;
      t.fly[0].rotation.x = s.fly;
      t.fly[1].rotation.x = -s.fly * R.topRatio;
      t.feeder.rotation.x = s.feed ?? 0;
      env[key].ring.material.opacity = 0.9 * (st.envelope ?? 0);
      env[key].fill.material.opacity = 0.12 * (st.envelope ?? 0);
    }
    intakes.front.roll.rotation.x = st.roll.front;
    intakes.rear.roll.rotation.x = -st.roll.rear;
    intakes.front.roll2.rotation.x = st.roll.front * 0.8;
    intakes.rear.roll2.rotation.x = -st.roll.rear * 0.8;
    setBody(st.material ?? 'ply');
    for (const p of pods) p.wh.rotation.x = st.podSpin?.[p.dir] ?? 0;
    setLook(!!st.partsMode, (st.xray ?? 0) > 0.5);
  };
  return {root, update, turrets, intakes, parts, shells, mats, env, DECK_Y, setBody};
}

export const PART_NOTES = {
  // shown by the LABELS display, robot frame points
};
