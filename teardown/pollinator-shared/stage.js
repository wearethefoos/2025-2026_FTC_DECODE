// The Pollinator's stage: a pale studio around the BIOBUZZ field, soft sun shadows that follow the camera's target,
// GTAO kept off the tiles, and the overlays drawn in 3D: the predicted arc of each turret's next shot, the aim lines
// (where the turret points against where the target is), the landing marker in the CELL.
// frame(state, cam) poses the robot, the HIVE and every ball and draws one frame.
import * as THREE from 'three';
import {EffectComposer} from 'three/addons/postprocessing/EffectComposer.js';
import {GTAOPass} from 'three/addons/postprocessing/GTAOPass.js';
import {OutputPass} from 'three/addons/postprocessing/OutputPass.js';
import {Pass} from 'three/addons/postprocessing/Pass.js';
import {RenderPass} from 'three/addons/postprocessing/RenderPass.js';
import {buildRobot} from './build.js';
import {buildField, COL} from './field.js';

const V3 = THREE.Vector3;
export const ARC_COL = {pollen: '#d69e00', nectar: '#2563c9'};

export function createStage({canvas}) {
  const renderer = new THREE.WebGLRenderer({canvas, antialias: false, preserveDrawingBuffer: true, powerPreference: 'high-performance'});
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.VSMShadowMap;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(COL.bg);
  scene.fog = new THREE.Fog(COL.bg, 7, 16);
  const camera = new THREE.PerspectiveCamera(30, 16 / 9, 0.02, 60);
  const composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(4, 4, {type: THREE.HalfFloatType, samples: 8}));
  composer.addPass(new RenderPass(scene, camera));
  const gtao = new GTAOPass(scene, camera, 4, 4);
  gtao.output = GTAOPass.OUTPUT.Default;
  gtao.blendIntensity = 0.75;
  gtao.updateGtaoMaterial({radius: 0.035, distanceExponent: 1.4, thickness: 0.4, scale: 1.0, samples: 16, distanceFallOff: 1.0, screenSpaceRadius: false});
  gtao.updatePdMaterial({lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, rings: 2, samples: 16});
  class Toggle extends Pass {
    constructor(fn) {
      super();
      this.needsSwap = false;
      this.fn = fn;
    }
    render() {
      this.fn();
    }
  }
  const overlays = [];
  const vis = (v) => () => {
    field.ground.visible = v;
    shade.visible = v;
    for (const o of overlays) o.visible = v && o.userData.on;
  };
  composer.addPass(new Toggle(vis(false)));
  composer.addPass(gtao);
  composer.addPass(new Toggle(vis(true)));
  composer.addPass(new OutputPass());

  {
    const env = new THREE.Scene();
    env.background = new THREE.Color('#e7eaee');
    const panel = (w, h, pos, k) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({color: new THREE.Color(1, 1, 1).multiplyScalar(k), side: THREE.DoubleSide}));
      m.position.copy(pos);
      m.lookAt(0, 0, 0);
      env.add(m);
    };
    panel(12, 12, new V3(0, 14, 2), 2.3);
    panel(3, 14, new V3(-12, 4, 6), 2.6);
    panel(3, 14, new V3(12, 4, -4), 1.8);
    panel(18, 2, new V3(0, 2, 14), 1.4);
    const g = new THREE.Mesh(new THREE.CircleGeometry(40, 32), new THREE.MeshBasicMaterial({color: '#c9ced4', side: THREE.DoubleSide}));
    g.rotation.x = -Math.PI / 2;
    g.position.y = -2;
    env.add(g);
    const pm = new THREE.PMREMGenerator(renderer);
    scene.environment = pm.fromScene(env, 0.02).texture;
    scene.environmentIntensity = 0.9;
    pm.dispose();
  }
  const SUN_DIR = new V3(-0.4, 0.84, 0.36).normalize();
  const sun = new THREE.DirectionalLight('#fffaf2', 2.2);
  sun.castShadow = true;
  const EXT = 1.5;
  Object.assign(sun.shadow.camera, {left: -EXT, right: EXT, top: EXT, bottom: -EXT, near: 0.5, far: 20});
  sun.shadow.mapSize.set(4096, 4096);
  sun.shadow.radius = 8;
  sun.shadow.blurSamples = 16;
  sun.shadow.bias = -0.0003;
  sun.shadow.normalBias = 0.0015;
  scene.add(sun, sun.target);
  scene.add(new THREE.HemisphereLight('#fbfcff', '#c3c8ce', 0.7));

  const field = buildField();
  scene.add(field.root);
  const shade = new THREE.Mesh(
    new THREE.PlaneGeometry(40, 40),
    new THREE.ShadowMaterial({color: '#3d4652', opacity: 0.26, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -8}),
  );
  shade.rotation.x = -Math.PI / 2;
  shade.receiveShadow = true;
  scene.add(shade);
  const robot = buildRobot();
  scene.add(robot.root);

  // ---------------------------------------------------------- the balls
  const balls = [];
  const ensureBalls = (list) => {
    while (balls.length < list.length) {
      const b = list[balls.length];
      balls.push(field.makeBall(b.kind, b.color));
    }
  };

  // ---------------------------------------------------------- overlays: arcs, aim lines, the landing marker
  const overlay = (o) => {
    o.userData.on = false;
    o.visible = false;
    o.renderOrder = 9;
    overlays.push(o);
    scene.add(o);
    return o;
  };
  const arcs = {};
  const aims = {};
  for (const key of ['pollen', 'nectar']) {
    const N = 160;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 3), 3));
    g.setDrawRange(0, 0);
    const mat = new THREE.PointsMaterial({color: ARC_COL[key], size: 5, sizeAttenuation: false, transparent: true, opacity: 0.95, depthTest: true, depthWrite: false});
    arcs[key] = overlay(new THREE.Points(g, mat));
    arcs[key].userData.N = N;
    // the aim: a line along the turret's yaw, and a dashed one straight at the target
    const lg = new THREE.BufferGeometry();
    lg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(12), 3));
    const lm = new THREE.LineDashedMaterial({color: ARC_COL[key], dashSize: 0.03, gapSize: 0.02, transparent: true, opacity: 0.9, depthWrite: false});
    aims[key] = overlay(new THREE.LineSegments(lg, lm));
  }
  const marker = overlay(new THREE.Mesh(new THREE.RingGeometry(0.03, 0.04, 40).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({color: '#e4572e', transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide})));
  // the Limelight's view: a thin cone toward the tag cluster when it has a fix
  const llLine = overlay(new THREE.LineSegments(new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3)), new THREE.LineBasicMaterial({color: '#2f9d5c', transparent: true, opacity: 0.9})));

  const size = {w: 1600, h: 900};
  const resize = (w, h, pr) => {
    size.w = w;
    size.h = h;
    renderer.setPixelRatio(pr);
    renderer.setSize(w, h, false);
    composer.setPixelRatio(pr);
    composer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  };
  const tmp = new V3();
  const right = new V3().crossVectors(new V3(0, 1, 0), SUN_DIR).normalize();
  const upL = new V3().crossVectors(SUN_DIR, right);
  let texel = (2 * EXT) / sun.shadow.mapSize.x;

  // cam: {tx, ty, tz, az, el, d, sx, sy} world target, radians, metres
  const frame = (st, cam) => {
    robot.update(st.robot);
    field.setHive('blue', st.rocker);
    ensureBalls(st.ballList);
    st.balls.forEach((b, i) => {
      const m = balls[i];
      m.visible = b.vis;
      m.position.set(b.p[0], b.p[1], b.p[2]);
      // backspin in flight: about the horizontal axis across the path; a roll otherwise
      if (b.spin !== undefined && b.dir !== undefined) {
        m.rotation.set(0, 0, 0);
        m.rotateY(b.dir);
        m.rotateX(-b.spin);
      } else if (b.roll !== undefined) m.rotation.set(b.roll, 0.4 * i, 0);
    });
    // overlays
    for (const key of ['pollen', 'nectar']) {
      const a = st.arcs?.[key];
      const o = arcs[key];
      o.userData.on = !!a;
      if (a) {
        const pos = o.geometry.attributes.position;
        const n = Math.min(o.userData.N, Math.floor(a.length / 3));
        // every 3rd sample: a dotted arc
        for (let i = 0; i < n; i++) pos.setXYZ(i, a[i * 3], a[i * 3 + 1], a[i * 3 + 2]);
        pos.needsUpdate = true;
        o.geometry.setDrawRange(0, n);
        o.material.opacity = st.arcAlpha ?? 1;
      }
      const l = st.aims?.[key];
      aims[key].userData.on = !!l;
      if (l) {
        const pos = aims[key].geometry.attributes.position;
        pos.setXYZ(0, ...l.from);
        pos.setXYZ(1, ...l.along);
        pos.setXYZ(2, ...l.from);
        pos.setXYZ(3, ...l.to);
        pos.needsUpdate = true;
        aims[key].computeLineDistances();
        aims[key].material.opacity = st.aimAlpha ?? 1;
      }
    }
    marker.userData.on = !!st.marker;
    if (st.marker) {
      marker.position.set(...st.marker);
      marker.material.opacity = 0.9 * (st.arcAlpha ?? 1);
    }
    llLine.userData.on = !!st.ll;
    if (st.ll) {
      const pos = llLine.geometry.attributes.position;
      pos.setXYZ(0, ...st.ll.from);
      pos.setXYZ(1, ...st.ll.to);
      pos.needsUpdate = true;
      llLine.material.opacity = st.ll.a;
    }
    // camera
    const tx = cam.tx;
    const ty = cam.ty;
    const tz = cam.tz;
    camera.position.set(tx + cam.d * Math.cos(cam.el) * Math.sin(cam.az), ty + cam.d * Math.sin(cam.el), tz + cam.d * Math.cos(cam.el) * Math.cos(cam.az));
    camera.lookAt(tx, ty, tz);
    camera.setViewOffset(size.w, size.h, -(cam.sx ?? 0), -(cam.sy ?? 0), size.w, size.h);
    camera.updateMatrixWorld();
    // the sun follows the target, snapped to whole shadow texels so the shadows do not shimmer
    tmp.set(tx, 0, tz);
    const rr = Math.round(tmp.dot(right) / texel) * texel;
    const uu = Math.round(tmp.dot(upL) / texel) * texel;
    sun.target.position.copy(right).multiplyScalar(rr).addScaledVector(upL, uu).addScaledVector(SUN_DIR, tmp.dot(SUN_DIR));
    sun.position.copy(sun.target.position).addScaledVector(SUN_DIR, 8);
    sun.target.updateMatrixWorld();
    // the scene pass draws before the toggles run: set this frame's overlays now, not last frame's
    for (const o of overlays) o.visible = o.userData.on;
    composer.render();
  };
  const pv = new V3();
  const project = (x, y, z) => {
    pv.set(x, y, z).project(camera);
    if (pv.z > 1) return null;
    return [(pv.x * 0.5 + 0.5) * size.w, (-pv.y * 0.5 + 0.5) * size.h];
  };
  const setQuality = ({samples, ao, shadow}) => {
    if (samples !== undefined)
      for (const t of [composer.renderTarget1, composer.renderTarget2]) {
        t.samples = samples;
        t.dispose();
      }
    if (ao !== undefined) gtao.enabled = ao;
    if (shadow !== undefined) {
      sun.shadow.mapSize.set(shadow, shadow);
      sun.shadow.map?.dispose();
      sun.shadow.map = null;
      texel = (2 * EXT) / shadow;
    }
  };
  return {renderer, scene, camera, composer, gtao, sun, robot, field, resize, frame, project, size, setQuality};
}
