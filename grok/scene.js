// Grok fork: three.js stunt theatre. Loaded lazily so the verdict renders first.
import * as THREE from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {RoomEnvironment} from 'three/addons/environments/RoomEnvironment.js';
import {CG_HEIGHT} from './timeline.js';

const RED = 0xb3121f;

function canvasTexture(draw, w = 256, h = 256) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

function label(text, sub = '') {
  const tex = canvasTexture((g, w, h) => {
    g.fillStyle = 'rgba(10,12,16,.78)'; g.beginPath(); g.roundRect(4, 4, w - 8, h - 8, 18); g.fill();
    g.fillStyle = '#fff'; g.font = '600 44px system-ui, sans-serif'; g.textAlign = 'center'; g.fillText(text, w / 2, sub ? 62 : 80);
    if (sub) { g.fillStyle = '#9aa4b2'; g.font = '32px system-ui, sans-serif'; g.fillText(sub, w / 2, 106); }
  }, 512, 128);
  const s = new THREE.Sprite(new THREE.SpriteMaterial({map: tex, depthTest: false, transparent: true}));
  s.scale.set(3.2, 0.8, 1); s.renderOrder = 10; return s;
}

// ---------- vehicles ----------
function wheel(r = 0.36, w = 0.28) {
  const g = new THREE.Group();
  const tyre = new THREE.Mesh(new THREE.CylinderGeometry(r, r, w, 28), new THREE.MeshStandardMaterial({color: 0x111214, roughness: .9}));
  tyre.rotation.x = Math.PI / 2; g.add(tyre);
  const rim = new THREE.Mesh(new THREE.CylinderGeometry(r * .66, r * .66, w + .02, 10), new THREE.MeshStandardMaterial({color: 0x9aa0a8, metalness: .9, roughness: .3}));
  rim.rotation.x = Math.PI / 2; g.add(rim); return g;
}

function profileBody(points, width, material, bevel = 0.06) {
  const shape = new THREE.Shape(points.map(([x, y]) => new THREE.Vector2(x, y)));
  const geo = new THREE.ExtrudeGeometry(shape, {depth: width - 2 * bevel, bevelEnabled: true, bevelSize: bevel, bevelThickness: bevel, bevelSegments: 3, curveSegments: 12});
  geo.translate(0, 0, -(width - 2 * bevel) / 2); geo.computeVertexNormals();
  return new THREE.Mesh(geo, material);
}

/** Stylised 2026 Roadster: low wedge, canopy, light bars and 10 nozzles. Origin at CG, nose +x. */
export function makeRoadster() {
  const car = new THREE.Group();
  const paint = new THREE.MeshPhysicalMaterial({color: RED, metalness: .55, roughness: .28, clearcoat: 1, clearcoatRoughness: .08});
  const glass = new THREE.MeshPhysicalMaterial({color: 0x0b0f16, metalness: .2, roughness: .05, transmission: 0, clearcoat: 1});
  const L = 4.3, W = 1.95, base = -0.42;
  const body = profileBody([[-2.15, base], [2.15, base], [2.2, -0.2], [2.05, -0.02], [1.2, 0.12], [-1.6, 0.18], [-2.18, 0.08], [-2.2, -0.15]], W, paint);
  car.add(body);
  const canopy = profileBody([[-1.15, 0.1], [0.75, 0.1], [0.05, 0.52], [-0.75, 0.55], [-1.3, 0.28]], W * .72, glass, .08);
  canopy.position.x = -0.1; car.add(canopy);
  const strip = new THREE.MeshBasicMaterial({color: 0xffffff});
  const front = new THREE.Mesh(new THREE.BoxGeometry(.03, .035, W * .86), strip); front.position.set(2.18, -0.13, 0); car.add(front);
  const tail = new THREE.Mesh(new THREE.BoxGeometry(.03, .05, W * .9), new THREE.MeshBasicMaterial({color: 0xff2030})); tail.position.set(-2.21, -0.04, 0); car.add(tail);
  const under = new THREE.Mesh(new THREE.BoxGeometry(L * .92, .06, W * .9), new THREE.MeshStandardMaterial({color: 0x1a1c20, roughness: .8}));
  under.position.y = base + .02; car.add(under);
  for (const [x, z] of [[1.42, .86], [1.42, -.86], [-1.38, .86], [-1.38, -.86]]) { const w = wheel(x > 0 ? .34 : .37); w.position.set(x, base - .02, z); car.add(w); }
  // Nozzles: 4 rear, 4 underbody (lift / landing), 2 nose-side (roll & yaw), as in Anders' model.
  const nozMat = new THREE.MeshStandardMaterial({color: 0x30343a, metalness: .9, roughness: .35});
  const nozzles = {rear: [], under: [], sideL: [], sideR: []};
  const addNozzle = (group, pos, dir) => {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(.05, .085, .12, 14, 1, true), nozMat);
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, -1, 0), dir.clone().normalize());
    m.quaternion.copy(q); m.position.copy(pos); car.add(m); nozzles[group].push({pos, dir: dir.clone().normalize()});
  };
  for (const z of [-.6, -.2, .2, .6]) addNozzle('rear', new THREE.Vector3(-2.24, -0.22, z), new THREE.Vector3(-1, 0, 0));
  for (const [x, z] of [[1.1, .55], [1.1, -.55], [-1.0, .55], [-1.0, -.55]]) addNozzle('under', new THREE.Vector3(x, base - .02, z), new THREE.Vector3(0, -1, 0));
  addNozzle('sideL', new THREE.Vector3(1.6, -0.15, W / 2 + .02), new THREE.Vector3(0, -.35, 1));
  addNozzle('sideR', new THREE.Vector3(1.6, -0.15, -W / 2 - .02), new THREE.Vector3(0, -.35, -1));
  car.traverse(o => { if (o.isMesh) { o.castShadow = true; } });
  return {car, nozzles};
}

function simpleVehicle({name, len, wid, hgt, color, cab = .55, kind = 'car'}) {
  const g = new THREE.Group();
  const mat = new THREE.MeshPhysicalMaterial({color, metalness: .5, roughness: .35, clearcoat: .6});
  const dark = new THREE.MeshStandardMaterial({color: 0x101318, roughness: .2, metalness: .3});
  if (kind === 'cybertruck') {
    const b = profileBody([[-len / 2, .35], [len / 2, .35], [len / 2, .95], [len * .12, hgt], [-len / 2, 1.15]], wid, new THREE.MeshStandardMaterial({color: 0xb9bec6, metalness: 1, roughness: .38}), .03);
    g.add(b);
  } else if (kind === 'semi') {
    const cabBox = profileBody([[-.2, .7], [2.6, .7], [2.6, 2.3], [2.2, hgt], [.2, hgt]], wid, mat, .08); cabBox.position.x = len / 2 - 2.6; g.add(cabBox);
    const chassis = new THREE.Mesh(new THREE.BoxGeometry(len - 2.6, .45, wid * .7), dark); chassis.position.set(-1.3, .85, 0); g.add(chassis);
    const ws = new THREE.Mesh(new THREE.BoxGeometry(.05, .9, wid * .86), dark); ws.position.set(len / 2 - .2, hgt - .75, 0); ws.rotation.z = .25; g.add(ws);
  } else {
    const b = profileBody([[-len / 2, .3], [len / 2, .3], [len / 2 + .02, .62], [len * .25, .85], [-len / 2, .95]], wid, mat, .07); g.add(b);
    const c = profileBody([[-len * .3, .85], [len * .2, .85], [-len * .02, hgt], [-len * .26, hgt - .03], [-len * .42, .9]], wid * .82, dark, .06); g.add(c);
  }
  const nW = kind === 'semi' ? 3 : 2, xs = kind === 'semi' ? [len / 2 - 1.2, -len / 2 + 1.6, -len / 2 + .5] : [len * .33, -len * .33];
  for (const x of xs.slice(0, nW)) for (const z of [wid / 2 - .15, -wid / 2 + .15]) { const w = wheel(kind === 'semi' ? .5 : .36, .3); w.position.set(x, kind === 'semi' ? .5 : .36, z); g.add(w); }
  g.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  const l = label(name); l.position.set(0, hgt + 1.0, 0); g.add(l);
  return g;
}

export const ROW = [
  {name: 'Cybercab', len: 4.2, wid: 1.95, hgt: 1.45, color: 0xc9ccd2},
  {name: 'Cybertruck', len: 5.68, wid: 2.2, hgt: 1.79, kind: 'cybertruck'},
  {name: 'Semi', len: 7.0, wid: 2.55, hgt: 4.0, color: 0xe9ecef, kind: 'semi'},
  {name: 'Model Y', len: 4.8, wid: 1.92, hgt: 1.62, color: 0x1c2e4a},
  {name: 'Model 3', len: 4.72, wid: 1.85, hgt: 1.44, color: 0x5a5f66},
];

// ---------- plumes ----------
function plumeTexture() {
  return canvasTexture((g, w, h) => {
    const grd = g.createLinearGradient(0, 0, 0, h);
    grd.addColorStop(0, 'rgba(255,255,255,1)'); grd.addColorStop(.25, 'rgba(220,235,255,.75)'); grd.addColorStop(1, 'rgba(200,220,255,0)');
    g.fillStyle = grd; g.fillRect(0, 0, w, h);
    const r = g.createLinearGradient(0, 0, w, 0); r.addColorStop(0, 'rgba(0,0,0,1)'); r.addColorStop(.5, 'rgba(0,0,0,0)'); r.addColorStop(1, 'rgba(0,0,0,1)');
    g.globalCompositeOperation = 'destination-out'; g.fillStyle = r; g.fillRect(0, 0, w, h);
  }, 64, 256);
}

class Plumes {
  constructor(car, nozzles) {
    this.car = car; this.items = [];
    const tex = plumeTexture();
    for (const [group, list] of Object.entries(nozzles)) for (const n of list) {
      const len = group === 'rear' ? 3.2 : group === 'under' ? 2.6 : 1.8;
      const geo = new THREE.ConeGeometry(.42, len, 20, 1, true); geo.translate(0, -len / 2, 0); geo.rotateX(Math.PI); // apex at nozzle, opens along +y
      const mat = new THREE.MeshBasicMaterial({map: tex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, opacity: 0});
      const m = new THREE.Mesh(geo, mat);
      m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), n.dir); m.position.copy(n.pos); m.visible = false; car.add(m);
      this.items.push({group, mesh: m, n, len});
    }
    // Condensation particles (cold expanding air makes white fog).
    const N = 900; this.N = N;
    const pg = new THREE.BufferGeometry();
    this.pos = new Float32Array(N * 3); this.vel = new Float32Array(N * 3); this.life = new Float32Array(N).fill(0);
    pg.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    const sprite = canvasTexture((g, w, h) => { const r = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2); r.addColorStop(0, 'rgba(255,255,255,.9)'); r.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = r; g.fillRect(0, 0, w, h); }, 64, 64);
    this.points = new THREE.Points(pg, new THREE.PointsMaterial({size: .55, map: sprite, transparent: true, depthWrite: false, opacity: .55, color: 0xe8f0ff}));
    this.points.frustumCulled = false; this.next = 0;
  }
  update(thrust, dt) {
    const t = performance.now() * .02;
    const wp = new THREE.Vector3(), wd = new THREE.Vector3(), q = new THREE.Quaternion();
    this.car.getWorldQuaternion(q);
    for (const it of this.items) {
      const k = thrust[it.group] || 0, on = k > .02;
      it.mesh.visible = on;
      if (!on) continue;
      it.mesh.material.opacity = .35 + .45 * k;
      const flick = 1 + .08 * Math.sin(t + it.n.pos.x * 7 + it.n.pos.z * 13);
      it.mesh.scale.set(.6 + .4 * k, (.4 + .6 * k) * flick, .6 + .4 * k);
      const emit = Math.ceil(70 * k * dt * 60 / 10);
      for (let e = 0; e < emit; e++) {
        const i = this.next = (this.next + 1) % this.N;
        wp.copy(it.n.pos).applyMatrix4(this.car.matrixWorld);
        wd.copy(it.n.dir).applyQuaternion(q);
        const sp = 14 + Math.random() * 10;
        this.pos.set([wp.x, wp.y, wp.z], i * 3);
        this.vel.set([wd.x * sp + (Math.random() - .5) * 3, wd.y * sp + (Math.random() - .5) * 3, wd.z * sp + (Math.random() - .5) * 3], i * 3);
        this.life[i] = .55 + Math.random() * .4;
      }
    }
    for (let i = 0; i < this.N; i++) {
      if (this.life[i] <= 0) { this.pos[i * 3 + 1] = -999; continue; }
      this.life[i] -= dt; const drag = Math.exp(-3.2 * dt);
      for (let a = 0; a < 3; a++) { this.vel[i * 3 + a] *= drag; this.pos[i * 3 + a] += this.vel[i * 3 + a] * dt; }
      this.vel[i * 3 + 1] += .8 * dt;
      if (this.pos[i * 3 + 1] < .05) { this.pos[i * 3 + 1] = .05; this.vel[i * 3 + 1] = Math.abs(this.vel[i * 3 + 1]) * .3; }
    }
    this.points.geometry.attributes.position.needsUpdate = true;
  }
  reset() { this.life.fill(0); }
}

// ---------- props ----------
function rampProps(geo) {
  const g = new THREE.Group(), R = geo.radius, phiR = geo.releaseAngle;
  const mat = new THREE.MeshStandardMaterial({color: 0xc3cad3, metalness: .15, roughness: .6, side: THREE.DoubleSide});
  const pts = []; const n = 80;
  for (let i = 0; i <= n; i++) { const p = phiR * 1.02 * i / n; pts.push(new THREE.Vector3(R * Math.sin(p), R * (1 - Math.cos(p)), 0)); }
  const curve = new THREE.CatmullRomCurve3(pts);
  // Deck as a ribbon following the arc
  const W = 3.4, pos = [], idx = [];
  for (let i = 0; i <= n; i++) { const p = pts[i]; pos.push(p.x, p.y, -W / 2, p.x, p.y, W / 2); if (i < n) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); } }
  const deck = new THREE.BufferGeometry(); deck.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); deck.setIndex(idx); deck.computeVertexNormals();
  const deckMesh = new THREE.Mesh(deck, mat); deckMesh.receiveShadow = true; deckMesh.castShadow = true; g.add(deckMesh);
  // Side rails and truss
  const steel = new THREE.MeshStandardMaterial({color: 0x3a3f47, metalness: .8, roughness: .4});
  for (const z of [-W / 2 - .05, W / 2 + .05]) { const rail = new THREE.Mesh(new THREE.TubeGeometry(curve, 120, .08, 6), steel); rail.position.z = z; g.add(rail); }
  for (let i = 4; i <= n; i += 6) { const p = pts[i]; if (p.y < 1) continue;
    for (const z of [-W / 2, W / 2]) { const leg = new THREE.Mesh(new THREE.CylinderGeometry(.09, .09, p.y, 6), steel); leg.position.set(p.x, p.y / 2, z); leg.castShadow = true; g.add(leg); } }
  const l = label('Ramp', `${(R * (1 - Math.cos(phiR))).toFixed(0)} m`); l.position.set(R * .55, R * 2.2 + 1, 0); g.add(l);
  return g;
}

function kickflipProps(geo) {
  // Five vehicles side by side across the track (row orientation is our assumption). No ramp (Car and Driver).
  const g = new THREE.Group();
  const total = ROW.reduce((s, v) => s + v.wid, 0) + .8 * (ROW.length - 1);
  let x = geo.rowMid - total / 2;
  for (const v of ROW) { const m = simpleVehicle(v); m.rotation.y = Math.PI / 2; m.position.set(x + v.wid / 2, 0, 0); g.add(m); x += v.wid + .8; }
  const mark = new THREE.Mesh(new THREE.PlaneGeometry(.3, 6), new THREE.MeshBasicMaterial({color: 0xffd23f}));
  mark.rotation.x = -Math.PI / 2; mark.position.set(geo.liftoffX, .02, 0); g.add(mark);
  return g;
}

function launchProps() {
  const g = new THREE.Group();
  const lineMat = new THREE.MeshBasicMaterial({color: 0xffffff});
  for (const [x, txt] of [[0, 'START'], [10.9, '60 mph · 0,81 s']]) {
    const line = new THREE.Mesh(new THREE.PlaneGeometry(.25, 6), lineMat); line.rotation.x = -Math.PI / 2; line.position.set(x + 2.15, .02, 0); g.add(line);
    const l = label(txt); l.position.set(x + 2.15, 2.6, -3.4); g.add(l);
  }
  for (let x = -10; x < 120; x += 6) { const d = new THREE.Mesh(new THREE.PlaneGeometry(3, .15), lineMat); d.rotation.x = -Math.PI / 2; d.position.set(x, .015, 3.1); g.add(d); }
  return g;
}

function hopProps() {
  const g = new THREE.Group();
  const pad = new THREE.Mesh(new THREE.CircleGeometry(4, 48), new THREE.MeshStandardMaterial({color: 0x2b3038, roughness: .7}));
  pad.rotation.x = -Math.PI / 2; pad.position.y = .01; pad.receiveShadow = true; g.add(pad);
  const ring = new THREE.Mesh(new THREE.RingGeometry(3.7, 3.9, 48), new THREE.MeshBasicMaterial({color: 0xffd23f})); ring.rotation.x = -Math.PI / 2; ring.position.y = .02; g.add(ring);
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(.05, .05, 8, 8), new THREE.MeshStandardMaterial({color: 0xffffff}));
  pole.position.set(-3, 4, -3.5); g.add(pole);
  for (let h = 1; h <= 7; h++) { const t = new THREE.Mesh(new THREE.BoxGeometry(.4, .04, .04), new THREE.MeshBasicMaterial({color: h % 5 ? 0xbbbbbb : 0xffd23f})); t.position.set(-3, h, -3.5); g.add(t); }
  const l = label('7 m'); l.scale.set(1.6, .4, 1); l.position.set(-3, 7.6, -3.5); g.add(l);
  return g;
}

// ---------- theatre ----------
export function createTheatre(canvas, {onFrame} = {}) {
  const renderer = new THREE.WebGLRenderer({canvas, antialias: true, powerPreference: 'high-performance'});
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture; scene.environmentIntensity = 0.55;
  scene.background = new THREE.Color(0x9fb4c8); scene.fog = new THREE.Fog(0x9fb4c8, 60, 220);
  const camera = new THREE.PerspectiveCamera(45, 1, .1, 600);
  const controls = new OrbitControls(camera, canvas); controls.enableDamping = true; controls.maxPolarAngle = Math.PI * .495; controls.minDistance = 4; controls.maxDistance = 90;
  scene.add(new THREE.HemisphereLight(0xdfe9f5, 0x8a6f4f, 1.1));
  const sun = new THREE.DirectionalLight(0xffffff, 2.4); sun.position.set(-30, 50, 25); sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024); Object.assign(sun.shadow.camera, {left: -30, right: 30, top: 30, bottom: -30, near: 1, far: 140}); scene.add(sun, sun.target);
  // Texas-ish desert test ground with a subtle grid
  const groundTex = canvasTexture((g, w, h) => {
    g.fillStyle = '#b79d78'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 1400; i++) { g.fillStyle = `rgba(${90 + Math.random() * 60},${70 + Math.random() * 40},${50},${Math.random() * .12})`; g.fillRect(Math.random() * w, Math.random() * h, 2, 2); }
    g.strokeStyle = 'rgba(60,45,30,.18)'; g.lineWidth = 2; g.strokeRect(0, 0, w, h);
  });
  groundTex.wrapS = groundTex.wrapT = THREE.RepeatWrapping; groundTex.repeat.set(80, 80);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), new THREE.MeshStandardMaterial({map: groundTex, roughness: 1}));
  ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);
  const pad = new THREE.Mesh(new THREE.PlaneGeometry(160, 10), new THREE.MeshStandardMaterial({color: 0x34383f, roughness: .85}));
  pad.rotation.x = -Math.PI / 2; pad.position.set(30, .005, 0); pad.receiveShadow = true; scene.add(pad);

  const {car, nozzles} = makeRoadster(); scene.add(car);
  const plumes = new Plumes(car, nozzles); scene.add(plumes.points);
  let props = null, tl = null, t = 0, playing = false, rate = 1, camMode = 'follow', last = performance.now(), visible = true;
  const prevTarget = new THREE.Vector3();

  const FOLLOW = {ramp: [-14, 6, 22], kickflip: [-5, 3.5, 15], hop: [9, 3.5, 11], launch: [-4, 2.2, 10]};
  const OVERVIEW = {ramp: [[-26, 14, 34], [2, 9, 0]], kickflip: [[2, 9, 36], [6, 3, 0]], hop: [[11, 4, 13], [0, 2.5, 0]], launch: [[6, 5, 26], [10, 1, 0]]};
  function frameCamera(id, mode = camMode) {
    if (mode === 'follow' && tl) {
      const s = tl.sample(0), tg = new THREE.Vector3(s.x, Math.max(1, s.y), 0), off = FOLLOW[id] || FOLLOW.hop;
      controls.target.copy(tg); camera.position.set(tg.x + off[0], tg.y + off[1], tg.z + off[2]);
    } else { const [p, tg] = OVERVIEW[id] || OVERVIEW.hop; camera.position.set(...p); controls.target.set(...tg); }
    prevTarget.copy(controls.target); controls.update();
  }
  function setTimeline(timeline, {keepCamera = false} = {}) {
    if (props) scene.remove(props);
    tl = timeline;
    props = tl.id === 'ramp' ? rampProps(tl.geometry) : tl.id === 'kickflip' ? kickflipProps(tl.geometry) : tl.id === 'launch' ? launchProps() : hopProps();
    scene.add(props); t = 0; plumes.reset();
    if (!keepCamera) frameCamera(tl.id);
    apply(0, 0);
  }
  const e = new THREE.Euler(0, 0, 0, 'YZX');
  function apply(time, dt) {
    if (!tl) return;
    const s = tl.sample(time);
    car.position.set(s.x, s.y, s.z); e.set(s.roll, s.yaw, s.pitch, 'YZX'); car.quaternion.setFromEuler(e);
    car.updateMatrixWorld(true);
    plumes.update(s.thrust, dt);
    if (camMode === 'follow') {
      const target = new THREE.Vector3(s.x, Math.max(1, s.y), 0), delta = target.clone().sub(prevTarget);
      camera.position.add(delta); controls.target.add(delta); prevTarget.copy(controls.target);
    }
    sun.position.set(car.position.x - 30, 50, 25); sun.target.position.copy(car.position);
    onFrame?.({...s, height: s.y - CG_HEIGHT, t: time, duration: tl.duration});
  }
  function resize() {
    const w = canvas.clientWidth, h = canvas.clientHeight; if (!w || !h) return;
    renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
  }
  new ResizeObserver(resize).observe(canvas); resize();
  new IntersectionObserver(([en]) => { visible = en.isIntersecting; }, {threshold: .05}).observe(canvas);
  function loop(now) {
    requestAnimationFrame(loop);
    const dt = Math.min(.05, (now - last) / 1000); last = now;
    if (!visible) return;
    if (playing && tl) { t += dt * rate; if (t >= tl.duration) { t = tl.duration; playing = false; onEnd?.(); } }
    apply(t, playing ? dt * rate : dt * .3);
    controls.update(); renderer.render(scene, camera);
  }
  let onEnd = null;
  requestAnimationFrame(loop);
  return {
    setTimeline, play() { if (tl && t >= tl.duration) t = 0; playing = true; }, pause() { playing = false; },
    restart() { t = 0; plumes.reset(); playing = true; }, seek(x) { t = x; }, get time() { return t; }, get playing() { return playing; },
    setRate(r) { rate = r; }, setCamera(m) { camMode = m; if (tl) frameCamera(tl.id, m); },
    onEnd(fn) { onEnd = fn; }, renderer,
  };
}
