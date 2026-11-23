// The Twin-Turret Pollinator built from code, in metres, in the robot frame (x left, y up, z forward). Every part is
// either a REV Robotics part (15 mm extrusion, HD Hex motors and UltraPlanetary gearboxes, Smart Robot Servos,
// Control Hub, Expansion Hub, 75 mm mecanum wheels, Through Bore Encoders, Color Sensor V3), a 3D-printed part
// (PETG-CF plates, turret rings and gears, pods, ramps; TPU tyres and intake flaps), or one of the two non-REV
// sensors the brief asks for: the Limelight 3A and two goBILDA odometry pods on a Pinpoint computer.
// update(state) poses it: the wheel angles, both turrets (yaw, hood pitch, flywheel angle), both intake rollers.
import * as THREE from 'three';
import {RoundedBoxGeometry} from 'three/addons/geometries/RoundedBoxGeometry.js';
import {BALL, R, nOff} from './robot.js';
import {LANE, RAMP_FLOOR, ROLLER_Y, SORT_Y} from './paths.js';

const V3 = THREE.Vector3;
export const CAT = {rev: 'REV', printed: 'PRINTED', tpu: 'PRINTED', cots: 'OTHER COTS'};
export const CAT_COL = {rev: '#9aa3ad', printed: '#2f7fc1', tpu: '#1f5c8f', cots: '#3a9d63'};

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
  const FY = R.frameY + 0.0075; // extrusion centre height

  // ---------------------------------------------------------- the frame: REV 15 mm extrusion, printed corner gussets
  for (const sx of [-1, 1]) {
    const e = extrusion(R.L - 0.03, 'z', mats);
    e.position.set(sx * (HW - 0.0165), FY, 0);
    addGroup(root, e, 'rev');
  }
  for (const sz of [-1, 1]) {
    const e = extrusion(R.W - 0.063, 'x', mats);
    e.position.set(0, FY, sz * (HL - 0.03));
    addGroup(root, e, 'rev');
    // mid cross rails carry the battery tray and the sorter
    const m = extrusion(R.W - 0.063, 'x', mats);
    m.position.set(0, FY, sz * 0.105);
    addGroup(root, m, 'rev');
  }
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) add(root, box(0.03, 0.022, 0.03, 0.003), mats.printed, 'printed', {x: sx * (HW - 0.0165), y: FY, z: sz * (HL - 0.03)});
  // uprights to the turret deck
  const DECK_Y = 0.17;
  for (const sx of [-1, 1])
    for (const z of [-0.165, 0.095]) {
      const e = extrusion(DECK_Y - FY - 0.004, 'y', mats);
      e.position.set(sx * (HW - 0.0165), (FY + DECK_Y) / 2, z);
      addGroup(root, e, 'rev');
    }
  // the turret deck: a printed plate (4 tiles, bolted to the extrusion) with two holes for the turret rings
  {
    const sh = new THREE.Shape();
    const x0 = -HW + 0.008;
    const x1 = HW - 0.008;
    const z0 = -0.19;
    const z1 = 0.11;
    sh.moveTo(x0, z0);
    sh.lineTo(x1, z0);
    sh.lineTo(x1, z1);
    sh.lineTo(x0, z1);
    sh.closePath();
    for (const k of ['pollen', 'nectar']) {
      const T = R.turret[k];
      const h = new THREE.Path();
      h.absarc(T.x, T.z, 0.052, 0, Math.PI * 2, true);
      sh.holes.push(h);
    }
    const g = new THREE.ExtrudeGeometry(sh, {depth: 0.006, bevelEnabled: false, curveSegments: 48});
    // rotateX(+90) takes shape y to +z and the thickness downward
    g.rotateX(Math.PI / 2);
    add(root, g, mats.printed, 'printed', {y: DECK_Y, shell: true, name: 'deck'});
  }

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
    // printed bearing block on the frame rail
    add(root, box(0.012, 0.04, 0.03, 0.002), mats.printed, 'printed', {x: sx * (HW - 0.03), y: R.wheelR + 0.005, z: sz * R.wheelZ});
  }

  // ---------------------------------------------------------- electronics: Control Hub, Expansion Hub, battery, Pinpoint
  const hubGeo = box(0.03, 0.103, 0.143, 0.004);
  for (const [sx, name] of [[1, 'CONTROL HUB'], [-1, 'EXPANSION HUB']]) {
    // standing against the side rail, outboard of the lanes, between the wheels
    add(root, hubGeo, mats.hub, 'rev', {x: sx * 0.19, y: 0.122, z: -0.005, name});
    add(root, box(0.002, 0.03, 0.09, 0.0005), mats.hubLabel, 'rev', {x: sx * 0.174, y: 0.135, z: -0.005});
  }
  add(root, box(0.075, 0.045, 0.15, 0.006), mats.battery, 'rev', {y: 0.036, z: -0.005, name: 'battery'});
  add(root, box(0.028, 0.008, 0.042, 0.002), mats.pod, 'cots', {x: 0.06, y: DECK_Y + 0.007, z: -0.17, name: 'pinpoint'});

  // ---------------------------------------------------------- odometry: two goBILDA pods (forward and strafe)
  const pods = [];
  for (const [x, z, dir] of [[0.088, -0.07, 'fwd'], [-0.072, 0.075, 'strafe']]) {
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

  // ---------------------------------------------------------- the ball path: intake ramps, sorter, lanes
  // front and rear ramps: printed U-channels rising from the intake mouth over the drive motors to the sorter
  const ramp = (sz) => {
    const pts = RAMP_FLOOR.map(([x, y, z]) => new V3(x, y - 0.004, sz * z));
    const curve = new THREE.CatmullRomCurve3(pts);
    // a U channel: a floor strip and two side rails along the same curve
    const n = 48;
    const fl = [];
    const idx = [];
    for (let i = 0; i <= n; i++) {
      const p = curve.getPoint(i / n);
      fl.push(-0.05, p.y, p.z, 0.05, p.y, p.z);
      if (i) idx.push(2 * i - 2, 2 * i - 1, 2 * i, 2 * i - 1, 2 * i + 1, 2 * i);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(fl, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    const fm = add(root, g, mats.printedLight, 'printed', {shell: true, name: 'ramp'});
    fm.material = mats.printedLight;
    for (const s of [-1, 1]) {
      const c2 = new THREE.CatmullRomCurve3(pts.map((p) => new V3(s * 0.052, p.y + 0.03, p.z)));
      add(root, new THREE.TubeGeometry(c2, 40, 0.0035, 6, false), mats.printedLight, 'printed', {shell: true});
    }
  };
  ramp(1);
  ramp(-1);
  // the sorter: a printed bowl at the centre with the REV Color Sensor V3 under it, a servo-driven diverter flap
  add(root, cylY(0.055, 0.006, 40), mats.printedLight, 'printed', {y: SORT_Y - 0.007, z: 0.05, shell: true, name: 'sorter'});
  const colorSensor = add(root, box(0.024, 0.008, 0.024, 0.002), mats.hub, 'rev', {y: SORT_Y - 0.015, z: 0.05, name: 'color'});
  const diverter = new THREE.Group();
  diverter.position.set(0, SORT_Y + 0.035, 0.105);
  add(diverter, box(0.004, 0.06, 0.09, 0.0015), mats.printed, 'printed', {y: 0, z: -0.045});
  root.add(diverter);
  add(root, box(0.02, 0.04, 0.04, 0.003), mats.servo, 'rev', {y: 0.15, z: 0.12, name: 'diverter servo'});
  // the lanes: printed tubes from the sorter up into each turret's hollow ring
  for (const k of ['pollen', 'nectar']) {
    const T = R.turret[k];
    const sx = Math.sign(T.x);
    const pts = LANE(k).map((p) => new V3(...p));
    const c = new THREE.CatmullRomCurve3(pts);
    add(root, new THREE.TubeGeometry(c, 30, BALL[k].d / 2 + 0.006, 18, false), mats.printedLight, 'printed', {shell: true, name: `${k} lane`});
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
    // the intake motor above the arm, belted down to the roller
    const mo = new THREE.Group();
    mo.position.set(0.12, 0.128, zr - sz * 0.01);
    add(mo, cylX(0.0185, 0.07, 24), mats.motor, 'rev', {x: -0.02});
    add(mo, box(0.04, 0.04, 0.04, 0.003), mats.gearbox, 'rev', {x: 0.035});
    g.add(mo);
    add(g, box(0.006, 0.06, 0.012, 0.002), mats.rubber, 'rev', {x: 0.172, y: 0.103, z: zr});
    root.add(g);
    intakes[side] = {g, roll};
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
    // the Through Bore Encoder on the ring's axis, under the deck, offset beside the ball tube
    {
      const ea = pa + (sx > 0 ? -0.9 : 0.9);
      add(base, box(0.04, 0.012, 0.04, 0.004), mats.hub, 'rev', {x: Math.cos(ea) * 0.082, y: -0.012, z: Math.sin(ea) * 0.082, name: 'through bore'});
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
    turrets[key] = {base, yawG, pod, fly, feeder, pinion, key};
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
    const key = `${parts_ ? 1 : 0}${xray ? 1 : 0}`;
    if (key === lastLook) return;
    lastLook = key;
    for (const m of parts) {
      let mat = parts_ ? catMats[m.userData.cat] || m.userData.base : m.userData.base;
      if (xray && m.userData.shell) mat = ghostOf(mat);
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
    diverter.rotation.y = (st.divert ?? 0) * 0.5;
    for (const p of pods) p.wh.rotation.x = st.podSpin?.[p.dir] ?? 0;
    setLook(!!st.partsMode, (st.xray ?? 0) > 0.5);
  };
  void colorSensor;
  return {root, update, turrets, intakes, parts, shells, mats, env, DECK_Y};
}

export const PART_NOTES = {
  // shown by the LABELS display, robot frame points
};
