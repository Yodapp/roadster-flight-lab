// Grok-versionen · stylised 2026 Roadster built from lofted geometry (no external models), with cockpit and yoke.
import * as THREE from 'three';

const RED = 0xc0101e;
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

/** Loft superellipse cross-sections along x. f(x) → {yb, yt, w, n}. */
function loft(xs, f, segs = 28) {
  const pos = [], idx = [], ring = segs;
  for (const x of xs) {
    const {yb, yt, w, n = 3.2} = f(x), yc = (yb + yt) / 2, h = (yt - yb) / 2;
    for (let j = 0; j < ring; j++) {
      const a = j / ring * Math.PI * 2, c = Math.cos(a), s = Math.sin(a);
      pos.push(x, yc + h * Math.sign(s) * Math.abs(s) ** (2 / n), w * Math.sign(c) * Math.abs(c) ** (2 / n));
    }
  }
  for (let i = 0; i < xs.length - 1; i++) for (let j = 0; j < ring; j++) {
    const a = i * ring + j, b = i * ring + (j + 1) % ring, c = a + ring, d = b + ring; idx.push(a, c, b, b, c, d);
  }
  // caps
  for (const [i, flip] of [[0, true], [xs.length - 1, false]]) {
    const {yb, yt} = f(xs[i]); const ci = pos.length / 3; pos.push(xs[i], (yb + yt) / 2, 0);
    for (let j = 0; j < ring; j++) { const a = i * ring + j, b = i * ring + (j + 1) % ring; flip ? idx.push(ci, a, b) : idx.push(ci, b, a); }
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals(); return g;
}

function wheel() {
  const g = new THREE.Group(), r = .36, w = .27;
  const tyre = new THREE.Mesh(new THREE.TorusGeometry(r - .07, .085, 12, 32), new THREE.MeshStandardMaterial({color: 0x0c0c0e, roughness: .85}));
  tyre.scale.z = 1.6; g.add(tyre);
  const rimMat = new THREE.MeshStandardMaterial({color: 0x2a2d33, metalness: 1, roughness: .25});
  const disc = new THREE.Mesh(new THREE.CylinderGeometry(r - .1, r - .1, w * .7, 24), new THREE.MeshStandardMaterial({color: 0x15171b, metalness: .6, roughness: .5}));
  disc.rotation.x = Math.PI / 2; g.add(disc);
  for (let i = 0; i < 5; i++) { const sp = new THREE.Mesh(new THREE.BoxGeometry(.06, r * 1.15, .04), rimMat); sp.rotation.z = i / 5 * Math.PI * 2; sp.position.z = w * .36; g.add(sp); }
  const cal = new THREE.Mesh(new THREE.BoxGeometry(.18, .1, .06), new THREE.MeshStandardMaterial({color: 0xd01020, roughness: .4})); cal.position.set(.12, .12, w * .25); g.add(cal);
  g.userData.spin = g; return g;
}

export const DRIVER = new THREE.Vector3(-0.45, 0.46, -0.36); // eye point (left-hand drive), body frame

export function makeRoadster() {
  const car = new THREE.Group(); car.name = 'roadster';
  const body = new THREE.Group(); car.add(body);
  const paint = new THREE.MeshPhysicalMaterial({color: RED, metalness: .6, roughness: .32, clearcoat: 1, clearcoatRoughness: .06});
  const black = new THREE.MeshStandardMaterial({color: 0x08090b, metalness: .4, roughness: .45});
  const xs = []; for (let i = 0; i <= 72; i++) xs.push(-2.2 + 4.4 * i / 72);
  const arch = x => Math.max(smooth(.5, .2, Math.abs(x - 1.4)), smooth(.5, .2, Math.abs(x + 1.4)));
  const shell = loft(xs, x => {
    const nose = smooth(1.55, 2.2, x), tail = smooth(-1.7, -2.2, x);
    const yt = .14 - .26 * nose ** 1.4 - .08 * tail + .05 * smooth(-.4, -1.6, x) * (1 - tail) + .04 * Math.max(smooth(.9, 1.4, x) * smooth(2, 1.4, x), smooth(-.9, -1.4, x) * smooth(-2, -1.4, x));
    const yb = -.42 + .06 * nose + .05 * tail + .26 * arch(x);
    return {yb, yt, w: .97 - .2 * nose ** 1.6 - .06 * tail, n: 3.4};
  });
  const shellMesh = new THREE.Mesh(shell, paint); body.add(shellMesh);
  // wheel-well liners
  for (const sx of [1.4, -1.4]) { const liner = new THREE.Mesh(new THREE.CylinderGeometry(.44, .44, 1.9, 24, 1, true, 0, Math.PI), new THREE.MeshStandardMaterial({color: 0x050506, side: THREE.BackSide})); liner.rotation.x = Math.PI / 2; liner.rotation.y = 0; liner.position.set(sx, -.26, 0); body.add(liner); }
  // skirts and diffuser
  const skirt = new THREE.Mesh(new THREE.BoxGeometry(1.9, .08, 1.96), black); skirt.position.set(0, -.4, 0); body.add(skirt);
  const diff = new THREE.Mesh(new THREE.BoxGeometry(.4, .12, 1.6), black); diff.position.set(-2.05, -.33, 0); body.add(diff);
  // canopy (tinted glass) and roof frame
  const glass = new THREE.MeshPhysicalMaterial({color: 0x0a1018, metalness: .1, roughness: .04, transparent: true, opacity: .42, side: THREE.DoubleSide, clearcoat: 1, depthWrite: false});
  const cxs = []; for (let i = 0; i <= 40; i++) cxs.push(-1.45 + 2.35 * i / 40);
  const canopy = new THREE.Mesh(loft(cxs, x => {
    const f = smooth(.9, -.1, x), r = smooth(-1.45, -.7, x);
    return {yb: .02, yt: .1 + .48 * Math.min(f, r) ** .7, w: .5 + .2 * Math.min(f, r) ** .5, n: 2.6};
  }, 24), glass); canopy.renderOrder = 2; body.add(canopy); car.userData.canopy = canopy;
  const frameMat = new THREE.MeshStandardMaterial({color: 0x050608, roughness: .5});
  const pillar = (x, y, z, rx, l) => { const m = new THREE.Mesh(new THREE.BoxGeometry(.05, l, .05), frameMat); m.position.set(x, y, z); m.rotation.z = rx; body.add(m); return m; };
  pillar(.48, .3, -.6, .95, .62); pillar(.48, .3, .6, .95, .62);
  const header = new THREE.Mesh(new THREE.BoxGeometry(.06, .05, 1.1), frameMat); header.position.set(.2, .5, 0); body.add(header); car.userData.cockpitHide = [header];
  // lights
  const white = new THREE.MeshBasicMaterial({color: new THREE.Color(4, 4, 4.4)}), red = new THREE.MeshBasicMaterial({color: new THREE.Color(5, .1, .15)});
  const head = new THREE.Mesh(new THREE.BoxGeometry(.04, .03, 1.3), white); head.position.set(2.08, -.06, 0); body.add(head);
  for (const z of [-.62, .62]) { const h = new THREE.Mesh(new THREE.BoxGeometry(.05, .05, .3), white); h.position.set(2.0, -.04, z); h.rotation.y = z > 0 ? .4 : -.4; body.add(h); }
  const tail = new THREE.Mesh(new THREE.BoxGeometry(.04, .045, 1.65), red); tail.position.set(-2.19, .02, 0); body.add(tail);
  car.userData.tailMat = red;
  // interior: seats, dash, screen, yoke
  const trim = new THREE.MeshStandardMaterial({color: 0x15161a, roughness: .7});
  for (const z of [-.36, .36]) {
    const seat = new THREE.Mesh(new THREE.BoxGeometry(.5, .1, .46), trim); seat.position.set(-.45, .02, z); body.add(seat);
    const back = new THREE.Mesh(new THREE.BoxGeometry(.1, .5, .46), trim); back.position.set(-.72, .25, z); back.rotation.z = -.25; body.add(back);
  }
  const dash = new THREE.Mesh(new THREE.BoxGeometry(.32, .12, 1.5), new THREE.MeshStandardMaterial({color: 0x0d0e11, roughness: .6})); dash.position.set(.42, .16, 0); body.add(dash);
  const scr = document.createElement('canvas'); scr.width = 256; scr.height = 128; const screenTex = new THREE.CanvasTexture(scr); screenTex.colorSpace = THREE.SRGBColorSpace;
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(.34, .17), new THREE.MeshBasicMaterial({map: screenTex, toneMapped: false}));
  screen.position.set(.3, .27, -.05); screen.rotation.y = -Math.PI / 2; screen.rotation.x = 0; screen.rotateX(-.35); body.add(screen);
  car.userData.screen = {canvas: scr, tex: screenTex};
  const yokeMount = new THREE.Group(); yokeMount.position.set(.12, .24, DRIVER.z); body.add(yokeMount);
  const yoke = new THREE.Group(); yokeMount.add(yoke);
  const yokeMat = new THREE.MeshStandardMaterial({color: 0x1b1c20, roughness: .45, metalness: .2});
  const rim = new THREE.Mesh(new THREE.TorusGeometry(.17, .022, 10, 28, Math.PI), yokeMat); rim.rotation.z = Math.PI; rim.rotation.y = Math.PI / 2; yoke.add(rim);
  for (const s of [-1, 1]) { const grip = new THREE.Mesh(new THREE.CapsuleGeometry(.026, .14, 4, 8), yokeMat); grip.position.set(0, .03, s * .17); yoke.add(grip); }
  const hub = new THREE.Mesh(new THREE.BoxGeometry(.04, .1, .16), yokeMat); hub.position.set(0, -.07, 0); yoke.add(hub);
  const col = new THREE.Mesh(new THREE.CylinderGeometry(.03, .03, .25, 8), yokeMat); col.rotation.z = Math.PI / 2 - .5; col.position.set(.12, -.1, 0); yoke.add(col);
  yokeMount.rotation.z = .5; // raked toward the driver
  car.userData.yoke = yoke;
  // wheels (origin at CG; ground at y = -0.62)
  car.userData.wheels = [];
  for (const [x, z] of [[1.4, .86], [1.4, -.86], [-1.4, .86], [-1.4, -.86]]) {
    const w = wheel(); w.position.set(x, -.26, z); if (z < 0) w.rotation.y = Math.PI; car.add(w); car.userData.wheels.push(w);
  }
  // nozzles: positions & exhaust directions (body frame)
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  const N = {
    rear: [-.6, -.2, .2, .6].map(z => [V(-2.22, -.2, z), V(-1, 0, 0)]),
    lift: [[1.05, .55], [1.05, -.55], [-1.0, .55], [-1.0, -.55]].map(([x, z]) => [V(x, -.43, z), V(0, -1, 0)]),
    rollP: [[V(.2, .05, .99), V(0, 1, 0)], [V(.2, -.4, -.99), V(0, -1, 0)]], rollN: [[V(.2, .05, -.99), V(0, 1, 0)], [V(.2, -.4, .99), V(0, -1, 0)]],
    pitchP: [[V(1.9, -.35, 0), V(0, -1, 0)], [V(-1.95, .12, 0), V(0, 1, 0)]], pitchN: [[V(1.9, -.02, 0), V(0, 1, 0)], [V(-1.95, -.35, 0), V(0, -1, 0)]],
    yawP: [[V(1.9, -.15, .8), V(0, 0, 1)], [V(-1.95, -.1, -.9), V(0, 0, -1)]], yawN: [[V(1.9, -.15, -.8), V(0, 0, -1)], [V(-1.95, -.1, .9), V(0, 0, 1)]],
  };
  const nozMat = new THREE.MeshStandardMaterial({color: 0x3a3e45, metalness: 1, roughness: .3});
  for (const [p, d] of [...N.rear, ...N.lift]) {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(.05, .08, .1, 12, 1, true), nozMat);
    m.quaternion.setFromUnitVectors(V(0, -1, 0), d); m.position.copy(p); car.add(m);
  }
  car.userData.nozzles = N;
  car.traverse(o => { if (o.isMesh && o.material !== glass) { o.castShadow = true; } });
  canopy.castShadow = false; screen.castShadow = false; head.castShadow = false;
  // headlight beam
  const beam = new THREE.SpotLight(0xe8f0ff, 60, 70, .5, .55, 1.4); beam.position.set(2, .0, 0); beam.target.position.set(14, -1.2, 0);
  car.add(beam, beam.target); car.userData.beam = beam;
  car.userData.interior = [yoke, screen, dash];
  return car;
}

export function drawScreen(car, d) {
  const {canvas, tex} = car.userData.screen, g = canvas.getContext('2d'), W = canvas.width, H = canvas.height;
  g.fillStyle = '#05070b'; g.fillRect(0, 0, W, H);
  g.fillStyle = '#e8eef6'; g.font = '700 54px system-ui,sans-serif'; g.textAlign = 'left'; g.fillText(String(Math.round(d.kmh)), 14, 62);
  g.font = '18px system-ui,sans-serif'; g.fillStyle = '#8b96a5'; g.fillText('km/h', 16, 86);
  g.textAlign = 'right'; g.fillStyle = d.air < .2 ? '#ff5d5d' : '#7cc4ff'; g.font = '700 30px system-ui,sans-serif'; g.fillText(Math.round(d.kg) + ' kg', W - 12, 44);
  g.font = '16px system-ui,sans-serif'; g.fillStyle = '#8b96a5'; g.fillText(Math.round(d.bar) + ' bar', W - 12, 66);
  g.fillStyle = '#1b2230'; g.fillRect(14, 100, W - 28, 12); g.fillStyle = d.air < .2 ? '#ff5d5d' : '#3ccf91'; g.fillRect(14, 100, (W - 28) * d.air, 12);
  tex.needsUpdate = true;
}

// ---------- stylised other vehicles (no logos) ----------
export function makeVehicle(name, W, H, L) {
  const g = new THREE.Group();
  const paint = c => new THREE.MeshPhysicalMaterial({color: c, metalness: .5, roughness: .35, clearcoat: .7});
  const glassM = new THREE.MeshPhysicalMaterial({color: 0x0a0e14, metalness: .3, roughness: .08, clearcoat: 1});
  const white = new THREE.MeshBasicMaterial({color: new THREE.Color(3, 3, 3.3)}), red = new THREE.MeshBasicMaterial({color: new THREE.Color(4, .1, .1)});
  const zs = []; for (let i = 0; i <= 40; i++) zs.push(-L / 2 + L * i / 40);
  const add = m => { m.castShadow = true; m.receiveShadow = true; g.add(m); return m; };
  const along = geo => { geo.rotateY(-Math.PI / 2); return geo; }; // loft is along x; vehicles stand along z
  if (name === 'Semi') {
    const cab = add(new THREE.Mesh(along(loft(zs.filter(z => z > L / 2 - 2.6), z => ({yb: .5, yt: H - .25 * smooth(L / 2 - .8, L / 2, z), w: W / 2, n: 4}))), paint(0xe9ecef)));
    const trailer = add(new THREE.Mesh(new THREE.BoxGeometry(W, H - .9, L - 3), paint(0xd8dce2))); trailer.position.set(0, .9 + (H - .9) / 2 - .2, -1.5);
    const ws = add(new THREE.Mesh(new THREE.BoxGeometry(W * .9, .9, .05), glassM)); ws.position.set(0, H - .9, L / 2 - .45); ws.rotation.x = -.35;
    for (const z of [L / 2 - .8, -1, -2.6]) for (const s of [-1, 1]) { const w = add(new THREE.Mesh(new THREE.CylinderGeometry(.5, .5, .4, 20), new THREE.MeshStandardMaterial({color: 0x111214, roughness: .9}))); w.rotation.z = Math.PI / 2; w.position.set(s * (W / 2 - .15), .5, z); }
    const hl = new THREE.Mesh(new THREE.BoxGeometry(W * .8, .06, .04), white); hl.position.set(0, .9, L / 2 + .01); g.add(hl);
    void cab;
  } else {
    const truck = name === 'Cybertruck';
    const col = {Cybercab: 0xc9a227, Cybertruck: 0xb9bec6, 'Model Y': 0x1c2e4a, 'Model 3': 0x5a5f66}[name] ?? 0x888888;
    const mat = truck ? new THREE.MeshStandardMaterial({color: col, metalness: 1, roughness: .35}) : paint(col);
    const lower = add(new THREE.Mesh(along(loft(zs, z => {
      const f = z / (L / 2), nose = smooth(.75, 1, f), rear = smooth(-.8, -1, f);
      return {yb: .25 + .05 * nose, yt: (truck ? .95 + .05 * f : .85) - .18 * nose - .08 * rear, w: W / 2 - .04 - .1 * nose, n: truck ? 8 : 3.2};
    })), mat));
    const top = truck
      ? new THREE.Mesh(along(loft(zs, z => { const f = (z / (L / 2) + 1) / 2, ridge = .62; const h = f < ridge ? f / ridge : 1 - (f - ridge) / (1 - ridge) * .45; return {yb: .85, yt: .9 + (H - .9) * Math.max(.05, h), w: W / 2 - .05, n: 8}; })), mat)
      : new THREE.Mesh(along(loft(zs.filter(z => Math.abs(z) < L * .34), z => { const f = z / (L * .34); return {yb: .8, yt: .8 + (H - .8) * Math.max(.1, 1 - f * f) ** .5, w: W / 2 - .18, n: 2.8}; })), glassM);
    if (!truck) top.position.z = -L * .05; add(top);
    for (const z of [L * .32, -L * .32]) for (const s of [-1, 1]) { const w = add(new THREE.Mesh(new THREE.CylinderGeometry(.36, .36, .26, 20), new THREE.MeshStandardMaterial({color: 0x101113, roughness: .9}))); w.rotation.z = Math.PI / 2; w.position.set(s * (W / 2 - .12), .36, z); }
    const hl = new THREE.Mesh(new THREE.BoxGeometry(W * .82, .035, .03), white); hl.position.set(0, .72, L / 2 - .02); g.add(hl);
    const tl = new THREE.Mesh(new THREE.BoxGeometry(W * .86, .05, .03), red); tl.position.set(0, .8, -L / 2 + .02); g.add(tl);
    void lower;
  }
  return g;
}
