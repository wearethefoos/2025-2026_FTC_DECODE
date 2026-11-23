// The BIOBUZZ field around the robot, from the manual's numbers: 144 in. square of 24 in. foam tiles inside a
// polycarbonate perimeter, the HIVE structure in the middle (two bi-stable HIVES, two CELLS each, the AprilTag
// cluster under every CELL), four FLOWERS on the walls (top opening, backstop, retrieval opening, ring), the blue
// LOADING ZONE and GARDEN tape, and the scoring elements: yellow POLLEN, red and blue NECTAR, all holed balls.
import * as THREE from 'three';
import {BALL, FIELD, FLOWER, FLOWERS, HIVE, hiveCell} from './robot.js';

const V3 = THREE.Vector3;
export const COL = {
  bg: '#eef0f2',
  tile: '#c9cdd2',
  seam: '#b4b9bf',
  blue: '#2563c9',
  red: '#d2423a',
  pollen: '#f2c21b',
  petal: '#b98ad8',
};

const TILE_VERT = /* glsl */ `varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`;
const TILE_FRAG = /* glsl */ `uniform vec3 uT; uniform vec3 uS; uniform vec3 uBg; uniform vec3 uBlue; uniform vec3 uRed; uniform float uHalf; uniform float uTile; varying vec3 vW;
  void main(){
    vec2 p = vW.xz;
    float inside = step(abs(p.x), uHalf) * step(abs(p.y), uHalf);
    // tile seams and the interlocking teeth, a faint foam speckle
    vec2 q = mod(p + uHalf, uTile);
    float seam = 1.0 - smoothstep(0.0, 0.004, min(min(q.x, uTile - q.x), min(q.y, uTile - q.y)));
    float tooth = step(0.5, fract((p.x + p.y) * 18.0));
    float n = fract(sin(dot(floor(p * 220.0), vec2(12.9898, 78.233))) * 43758.5453);
    vec3 col = mix(uT, uS, seam * (0.65 + 0.35 * tooth)) * (0.985 + 0.03 * n);
    // blue LOADING ZONE (23 x 11 in.) and GARDEN (23 x 2 in.) at the middle of the blue wall: 2 in. tape outlines
    vec2 lz = vec2(uHalf - 0.1397, 0.0);
    vec2 d = abs(p - lz) - vec2(0.1397, 0.292);
    float box = max(d.x, d.y);
    float tape = step(-0.0508, box) * step(box, 0.0);
    vec2 g = abs(p - vec2(uHalf - 0.2794 - 0.0254 - 0.0127, 0.0)) - vec2(0.0254, 0.292);
    float garden = step(max(g.x, g.y), 0.0);
    col = mix(col, uBlue, max(tape, garden * 0.9) * 0.92);
    // the red ones, mirrored
    vec2 dr = abs(p - vec2(-lz.x, 0.0)) - vec2(0.1397, 0.292);
    float boxr = max(dr.x, dr.y);
    float taper = step(-0.0508, boxr) * step(boxr, 0.0);
    vec2 gr = abs(p - vec2(-(uHalf - 0.2794 - 0.0254 - 0.0127), 0.0)) - vec2(0.0254, 0.292);
    col = mix(col, uRed, max(taper, step(max(gr.x, gr.y), 0.0) * 0.9) * 0.92);
    col = mix(uBg, col, inside);
    float fade = smoothstep(3.2, 7.5, length(p));
    gl_FragColor = vec4(mix(col, uBg, fade), 1.0);
  }`;

const std = (color, rough = 0.5, metal = 0.0, extra = {}) => new THREE.MeshStandardMaterial({color, roughness: rough, metalness: metal, envMapIntensity: 0.5, ...extra});

/** a holed ball's material: a shader on top of the standard one darkens a pattern of round holes */
export function ballMaterial(color) {
  const m = std(color, 0.55, 0.0);
  m.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vObj;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvObj = normalize(position);');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vObj;')
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        {
          // holes on a lat-long grid, thinned toward the poles
          vec3 n = vObj;
          float lat = asin(clamp(n.y, -1.0, 1.0));
          float lon = atan(n.z, n.x);
          float rows = 6.0;
          float r = floor((lat / 3.14159 + 0.5) * rows);
          float latC = ((r + 0.5) / rows - 0.5) * 3.14159;
          float per = max(1.0, floor(10.0 * cos(latC) + 0.5));
          float lonC = (floor((lon / 6.28318 + 0.5) * per) + 0.5) / per * 6.28318 - 3.14159;
          vec3 c = vec3(cos(latC) * cos(lonC), sin(latC), cos(latC) * sin(lonC));
          float d = acos(clamp(dot(n, c), -1.0, 1.0));
          float hole = 1.0 - smoothstep(0.13, 0.155, d);
          diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * 0.28, hole);
        }`,
      );
  };
  m.customProgramCacheKey = () => `ball-${color}`;
  return m;
}

export function buildField() {
  const root = new THREE.Group();
  const H = FIELD.half;
  const shadowy = (m) => {
    m.castShadow = true;
    m.receiveShadow = true;
    return m;
  };
  // ---------------------------------------------------------- tiles
  const tileMat = new THREE.ShaderMaterial({
    vertexShader: TILE_VERT,
    fragmentShader: TILE_FRAG,
    uniforms: {
      uT: {value: new THREE.Color(COL.tile)},
      uS: {value: new THREE.Color(COL.seam)},
      uBg: {value: new THREE.Color(COL.bg)},
      uBlue: {value: new THREE.Color(COL.blue)},
      uRed: {value: new THREE.Color(COL.red)},
      uHalf: {value: H},
      uTile: {value: FIELD.tile},
    },
    toneMapped: false,
  });
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), tileMat);
  ground.rotation.x = -Math.PI / 2;
  root.add(ground);

  // ---------------------------------------------------------- the perimeter: clear panels, aluminium rails and posts
  const wallMat = new THREE.MeshPhysicalMaterial({color: '#dfe8ef', roughness: 0.15, metalness: 0, transparent: true, opacity: 0.22, depthWrite: false, side: THREE.DoubleSide});
  const railMat = std('#c3c8ce', 0.4, 0.6);
  const walls = new THREE.Group();
  for (let side = 0; side < 4; side++) {
    const g = new THREE.Group();
    g.rotation.y = (side * Math.PI) / 2;
    const panel = new THREE.Mesh(new THREE.PlaneGeometry(2 * H, FIELD.wallH), wallMat);
    panel.position.set(0, FIELD.wallH / 2, -H - 0.005);
    panel.renderOrder = 3;
    g.add(panel);
    const top = shadowy(new THREE.Mesh(new THREE.BoxGeometry(2 * H + 0.04, 0.025, 0.025), railMat));
    top.position.set(0, FIELD.wallH, -H - 0.0125);
    g.add(top);
    const bot = shadowy(new THREE.Mesh(new THREE.BoxGeometry(2 * H + 0.04, 0.025, 0.025), railMat));
    bot.position.set(0, 0.0125, -H - 0.0125);
    g.add(bot);
    for (let i = 0; i <= 6; i++) {
      const p = shadowy(new THREE.Mesh(new THREE.BoxGeometry(0.025, FIELD.wallH, 0.025), railMat));
      p.position.set(-H + (i * 2 * H) / 6, FIELD.wallH / 2, -H - 0.0125);
      g.add(p);
    }
    walls.add(g);
  }
  root.add(walls);

  // ---------------------------------------------------------- the HIVE structure
  const frameMat = std('#b9bfc6', 0.4, 0.6);
  const hiveRoot = new THREE.Group();
  root.add(hiveRoot);
  {
    const W = HIVE.frameW / 2;
    const D = HIVE.frameD / 2;
    const tube = (a, b, r = 0.016) => {
      const va = new V3(...a);
      const vb = new V3(...b);
      const len = va.distanceTo(vb);
      const m = shadowy(new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, 16), frameMat));
      m.position.copy(va).add(vb).multiplyScalar(0.5);
      m.quaternion.setFromUnitVectors(new V3(0, 1, 0), vb.clone().sub(va).normalize());
      hiveRoot.add(m);
    };
    // the base rectangle, A-frame legs up to the pivot rail at each end and the middle
    for (const z of [-D, D]) tube([-W, 0.02, z], [W, 0.02, z]);
    for (const x of [-W, 0, W]) {
      tube([x, 0.02, -D], [x, 0.02, D]);
      tube([x, 0.02, -D], [x, HIVE.pivotY, 0]);
      tube([x, 0.02, D], [x, HIVE.pivotY, 0]);
    }
    tube([-W, HIVE.pivotY + 0.02, 0], [W, HIVE.pivotY + 0.02, 0], 0.018);
  }
  // each HIVE: a rocker about x at the pivot with its two CELLS
  const hives = {};
  const tagTex = (() => {
    const c = document.createElement('canvas');
    c.width = c.height = 256;
    const x = c.getContext('2d');
    x.fillStyle = '#fff';
    x.fillRect(0, 0, 256, 256);
    // four 36h11-style markers (decorative stand-ins, not real tag codes) in a 2 x 2 cluster
    let s = 7;
    const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    for (let q = 0; q < 4; q++) {
      const ox = 14 + (q % 2) * 122;
      const oy = 14 + Math.floor(q / 2) * 122;
      x.fillStyle = '#000';
      x.fillRect(ox, oy, 106, 106);
      x.fillStyle = '#fff';
      for (let i = 0; i < 6; i++) for (let j = 0; j < 6; j++) if (rnd() > 0.5) x.fillRect(ox + 17 + i * 12, oy + 17 + j * 12, 12, 12);
    }
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  })();
  for (const [side, hx] of [['blue', HIVE.blueX], ['red', HIVE.redX]]) {
    const col = side === 'blue' ? COL.blue : COL.red;
    const wallM = new THREE.MeshPhysicalMaterial({color: col, roughness: 0.35, transparent: true, opacity: 0.38, depthWrite: false, side: THREE.DoubleSide});
    const rimM = std(col, 0.45, 0.1);
    const rocker = new THREE.Group();
    rocker.position.set(hx, HIVE.pivotY, 0);
    hiveRoot.add(rocker);
    // the rocker arms: two printed-looking plates from the hub out to each CELL
    const hub = shadowy(new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, HIVE.cellW + 0.04, 24).rotateZ(Math.PI / 2), frameMat));
    rocker.add(hub);
    const cells = {};
    for (const k of [1, -1]) {
      const cg = new THREE.Group();
      hiveRoot.add(cg);
      const W = HIVE.cellW / 2;
      const L = HIVE.cellL / 2;
      const Dp = HIVE.cellDepth;
      const wall = (w, h, x, y, z, ry = 0) => {
        const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), wallM);
        m.position.set(x, y, z);
        m.rotation.y = ry;
        m.renderOrder = 4;
        cg.add(m);
      };
      wall(2 * W, Dp, 0, -Dp / 2, L);
      wall(2 * W, Dp, 0, -Dp / 2, -L);
      wall(2 * L, Dp, W, -Dp / 2, 0, Math.PI / 2);
      wall(2 * L, Dp, -W, -Dp / 2, 0, Math.PI / 2);
      const floor = shadowy(new THREE.Mesh(new THREE.BoxGeometry(2 * W, 0.008, 2 * L), rimM));
      floor.position.y = -Dp;
      cg.add(floor);
      // the rim, a frame of square tube
      for (const [w, d, x, z] of [[2 * W + 0.02, 0.02, 0, L], [2 * W + 0.02, 0.02, 0, -L], [0.02, 2 * L, W, 0], [0.02, 2 * L, -W, 0]]) {
        const r = shadowy(new THREE.Mesh(new THREE.BoxGeometry(w, 0.02, d), rimM));
        r.position.set(x, -0.005, z);
        cg.add(r);
      }
      // the AprilTag cluster on the underside, facing down
      const tag = new THREE.Mesh(new THREE.PlaneGeometry(0.19, 0.19), new THREE.MeshBasicMaterial({map: tagTex, toneMapped: false}));
      tag.rotation.x = Math.PI / 2;
      tag.position.y = -Dp - 0.0045;
      cg.add(tag);
      // the arm from the hub
      const arm = shadowy(new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.03, HIVE.cellGap / 2), frameMat));
      arm.position.set(W + 0.02, 0, (k * HIVE.cellGap) / 4);
      rocker.add(arm);
      const arm2 = arm.clone();
      arm2.position.x = -W - 0.02;
      rocker.add(arm2);
      cells[k] = cg;
    }
    hives[side] = {rocker, cells, hx};
  }
  const setHive = (side, alpha) => {
    const h = hives[side];
    h.rocker.rotation.x = -alpha;
    for (const k of [1, -1]) {
      const c = hiveCell(h.hx, alpha, k);
      h.cells[k].position.set(c.x, c.y, c.z);
      h.cells[k].rotation.x = c.tilt;
    }
  };
  setHive('red', -HIVE.tilt);
  setHive('blue', HIVE.tilt);

  // ---------------------------------------------------------- FLOWERS
  const tubeMat = new THREE.MeshPhysicalMaterial({color: '#e8f0f6', roughness: 0.1, transparent: true, opacity: 0.3, depthWrite: false, side: THREE.DoubleSide});
  const petalMat = std(COL.petal, 0.55);
  const stemMat = std('#6aa35a', 0.6);
  for (const f of FLOWERS) {
    const g = new THREE.Group();
    g.position.set(f.x, 0, f.z);
    // turn so local +x points out of the wall into the field
    g.rotation.y = f.x > 0 ? Math.PI : 0;
    root.add(g);
    const r = FLOWER.topD / 2 + 0.004;
    const tube = new THREE.Mesh(new THREE.CylinderGeometry(r, r, FLOWER.topY - FLOWER.slotH, 40, 1, true), tubeMat);
    tube.position.y = (FLOWER.topY + FLOWER.slotH) / 2;
    tube.renderOrder = 5;
    g.add(tube);
    // two stems behind the retrieval opening carry the tube; the ring sits on the tiles
    for (const s of [-1, 1]) {
      const p = shadowy(new THREE.Mesh(new THREE.BoxGeometry(0.012, FLOWER.slotH, 0.012), stemMat));
      p.position.set(-r * 0.75, FLOWER.slotH / 2, s * r * 0.65);
      g.add(p);
    }
    const ring = shadowy(new THREE.Mesh(new THREE.TorusGeometry(BALL.pollen.d / 2 + 0.008, 0.008, 10, 40).rotateX(Math.PI / 2), stemMat));
    ring.position.y = FLOWER.ringH / 2;
    g.add(ring);
    const lip = shadowy(new THREE.Mesh(new THREE.TorusGeometry(r, 0.005, 10, 40).rotateX(Math.PI / 2), stemMat));
    lip.position.y = FLOWER.slotH;
    g.add(lip);
    // the top: a petal crown around the 4 in. opening, the backstop on the wall side
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const p = shadowy(new THREE.Mesh(new THREE.SphereGeometry(1, 16, 10), petalMat));
      p.scale.set(0.05, 0.006, 0.026);
      p.position.set(Math.cos(a) * (r + 0.04), FLOWER.topY - 0.004, Math.sin(a) * (r + 0.04));
      p.rotation.y = -a;
      p.rotation.z = 0.2;
      g.add(p);
    }
    const crown = shadowy(new THREE.Mesh(new THREE.TorusGeometry(r + 0.004, 0.007, 10, 40).rotateX(Math.PI / 2), stemMat));
    crown.position.y = FLOWER.topY;
    g.add(crown);
    const back = shadowy(new THREE.Mesh(new THREE.CylinderGeometry(r + 0.01, r + 0.01, FLOWER.backstop, 40, 1, true, Math.PI, Math.PI), std('#6aa35a', 0.6, 0, {side: THREE.DoubleSide})));
    back.position.y = FLOWER.topY + FLOWER.backstop / 2;
    g.add(back);
    // the bracket to the wall
    const br = shadowy(new THREE.Mesh(new THREE.BoxGeometry(FLOWER.off - r + 0.01, 0.03, 0.05), stemMat));
    br.position.set(-(FLOWER.off + r) / 2 + 0.002, FLOWER.topY - 0.1, 0);
    g.add(br);
  }

  // ---------------------------------------------------------- the balls (meshes; the routine places them)
  const ballGeo = {pollen: new THREE.SphereGeometry(BALL.pollen.d / 2, 40, 24), nectar: new THREE.SphereGeometry(BALL.nectar.d / 2, 40, 24)};
  const ballMats = {yellow: ballMaterial(COL.pollen), blue: ballMaterial(COL.blue), red: ballMaterial(COL.red)};
  const makeBall = (kind, color) => {
    const m = shadowy(new THREE.Mesh(ballGeo[kind], ballMats[color]));
    root.add(m);
    return m;
  };
  // a few staged elements that the routine never touches, so the field reads as a match in progress
  const staged = [];
  const put = (kind, color, x, z) => {
    const m = makeBall(kind, color);
    m.position.set(x, BALL[kind].d / 2, z);
    m.rotation.set(x * 7, z * 5, 0);
    staged.push(m);
  };
  // red FLOWERS keep their 4 POLLEN, the red GARDEN its 4, the blue GARDEN its 4, 5 NECTAR in each LOADING ZONE
  for (const f of FLOWERS.filter((q) => q.side === 'red'))
    for (let i = 0; i < 4; i++) {
      const m = makeBall('pollen', 'yellow');
      m.position.set(f.x, 0.004 + BALL.pollen.d * (i + 0.5), f.z);
      staged.push(m);
    }
  for (const sx of [-1, 1]) for (let i = 0; i < 4; i++) put('pollen', 'yellow', sx * (H - 0.317), -0.2 + i * 0.13);
  // the red HIVE's CELL that is up holds its 3 NECTAR
  {
    const c = hiveCell(HIVE.redX, -HIVE.tilt, -1);
    for (let i = 0; i < 3; i++) {
      const m = makeBall('nectar', 'red');
      m.position.set(c.x - 0.12 + i * 0.12, c.y - HIVE.cellDepth + BALL.nectar.d / 2 + 0.01, c.z);
      staged.push(m);
    }
  }
  return {root, ground, tileMat, setHive, makeBall, hives, staged};
}
