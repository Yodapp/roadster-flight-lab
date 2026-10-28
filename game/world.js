// Grok-versionen · night test site (inspired by the McGregor demo at night): sky, floodlights, crowd, ramp, strip, row, pad.
import * as THREE from 'three';
import {RAMP} from './sim.js';
import {SITE, ROW, rowBoxes} from './levels.js';
import {makeVehicle} from './car.js';

function canvasTex(w, h, draw, repeat) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat, repeat); }
  return t;
}
const glowTex = canvasTex(128, 128, (g, w, h) => { const r = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2); r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(.25, 'rgba(255,255,255,.5)'); r.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = r; g.fillRect(0, 0, w, h); });

export function envMap(renderer) {
  // Night environment for reflections: dark dome, warm horizon glow and a ring of floodlight panels.
  const s = new THREE.Scene();
  const dome = new THREE.Mesh(new THREE.SphereGeometry(50, 32, 16), new THREE.ShaderMaterial({side: THREE.BackSide, vertexShader: 'varying vec3 p;void main(){p=normalize(position);gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
    fragmentShader: 'varying vec3 p;void main(){float h=p.y;vec3 c=mix(vec3(.05,.04,.05),vec3(.02,.03,.07),smoothstep(-.1,.6,h));c+=vec3(.35,.22,.18)*exp(-abs(h)*14.)*.6;gl_FragColor=vec4(c,1.);}'}));
  s.add(dome);
  for (let i = 0; i < 10; i++) {
    const a = i / 10 * Math.PI * 2, m = new THREE.Mesh(new THREE.PlaneGeometry(5, 2.5), new THREE.MeshBasicMaterial({color: new THREE.Color(9, 8.6, 8), side: THREE.DoubleSide}));
    m.position.set(Math.cos(a) * 40, 14 + (i % 3) * 3, Math.sin(a) * 40); m.lookAt(0, 0, 0); s.add(m);
  }
  const strip = new THREE.Mesh(new THREE.PlaneGeometry(60, 1.2), new THREE.MeshBasicMaterial({color: new THREE.Color(2, 2.2, 3)})); strip.position.set(0, 30, 0); strip.rotation.x = Math.PI / 2; s.add(strip);
  const pm = new THREE.PMREMGenerator(renderer), rt = pm.fromScene(s, .02); pm.dispose();
  return rt.texture;
}

export function buildWorld(scene, {quality = 1} = {}) {
  const W = new THREE.Group(); scene.add(W);
  const updaters = [];
  scene.background = new THREE.Color(0x05070d);
  scene.fog = new THREE.FogExp2(0x0a0d18, .0062);
  // sky dome + stars
  const sky = new THREE.Mesh(new THREE.SphereGeometry(900, 32, 16), new THREE.ShaderMaterial({side: THREE.BackSide, depthWrite: false, fog: false,
    vertexShader: 'varying vec3 p;void main(){p=normalize(position);gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
    fragmentShader: 'varying vec3 p;void main(){float h=max(p.y,0.);vec3 c=mix(vec3(.10,.07,.11),vec3(.012,.018,.045),pow(h,.45));c+=vec3(.28,.14,.10)*exp(-h*18.)*.55;gl_FragColor=vec4(c,1.);}'}));
  sky.renderOrder = -10; W.add(sky);
  { const n = 1800, p = new Float32Array(n * 3), sz = new Float32Array(n);
    for (let i = 0; i < n; i++) { const u = Math.random(), v = Math.random() * .92 + .06, th = u * Math.PI * 2, ph = Math.acos(1 - v); p.set([Math.cos(th) * Math.sin(ph) * 850, Math.cos(ph) * 850, Math.sin(th) * Math.sin(ph) * 850], i * 3); sz[i] = Math.random(); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(p, 3)); g.setAttribute('aS', new THREE.BufferAttribute(sz, 1));
    const m = new THREE.ShaderMaterial({uniforms: {uT: {value: 0}}, transparent: true, depthWrite: false, fog: false, blending: THREE.AdditiveBlending,
      vertexShader: 'attribute float aS;uniform float uT;varying float a;void main(){a=.35+.65*fract(aS*7.3)*(.7+.3*sin(uT*2.+aS*90.));gl_PointSize=1.+aS*2.2;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
      fragmentShader: 'varying float a;void main(){vec2 d=gl_PointCoord-.5;gl_FragColor=vec4(vec3(.85,.9,1.),a*smoothstep(.5,.1,length(d)));}'});
    W.add(new THREE.Points(g, m)); updaters.push(t => { m.uniforms.uT.value = t; }); }
  // ground: asphalt with subtle aggregate and seams
  const asphalt = canvasTex(512, 512, (g, w, h) => {
    g.fillStyle = '#2a2c30'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 26000; i++) { const v = 30 + Math.random() * 40 | 0; g.fillStyle = `rgba(${v},${v},${v + 3},${Math.random() * .5})`; g.fillRect(Math.random() * w, Math.random() * h, 1.5, 1.5); }
    g.strokeStyle = 'rgba(0,0,0,.35)'; g.lineWidth = 2; g.beginPath(); g.moveTo(0, h / 2); g.lineTo(w, h / 2 + 8); g.stroke();
  }, 70);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(700, 700), new THREE.MeshStandardMaterial({map: asphalt, roughness: .78, metalness: .05, color: 0x9aa0a8}));
  ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; W.add(ground);
  const paintMat = new THREE.MeshStandardMaterial({color: 0xe8e8e2, roughness: .6, emissive: 0x111111});
  const yellow = new THREE.MeshStandardMaterial({color: 0xffc928, roughness: .6, emissive: 0x2a1c00});
  const flat = (w, l, mat, x, z, rot = 0) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, l), mat); m.rotation.x = -Math.PI / 2; m.rotation.z = rot; m.position.set(x, .012, z); m.receiveShadow = true; W.add(m); return m; };
  // light pools (cheap fake bounce under floodlights)
  const pool = (x, z, r, c = 0xfff1dc, o = .16) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(r * 2, r * 2), new THREE.MeshBasicMaterial({map: glowTex, color: c, transparent: true, opacity: o, depthWrite: false, blending: THREE.AdditiveBlending})); m.rotation.x = -Math.PI / 2; m.position.set(x, .02, z); W.add(m); };

  // ---------- drag strip ----------
  const dz = SITE.drag.z;
  for (let x = -20; x < 260; x += 6) { flat(3, .18, paintMat, x, dz + 2.6); flat(3, .18, paintMat, x, dz - 2.6); }
  flat(.3, 5.4, paintMat, SITE.drag.x0 + 2.2, dz);
  for (let x = 10; x <= 100; x += 10) flat(.15, 1.2, yellow, SITE.drag.x0 + 2.2 + x, dz + 3.4);
  // christmas tree
  const tree = new THREE.Group(); tree.position.set(5.5, 0, dz - 3.6); W.add(tree);
  const pole = new THREE.Mesh(new THREE.BoxGeometry(.25, 3.6, .25), new THREE.MeshStandardMaterial({color: 0x1a1d22, metalness: .6, roughness: .4})); pole.position.y = 1.8; tree.add(pole);
  const bulbs = [];
  for (let i = 0; i < 5; i++) { const m = new THREE.Mesh(new THREE.SphereGeometry(.16, 16, 8), new THREE.MeshBasicMaterial({color: 0x222222})); m.position.set(-.18, 3.3 - i * .42, 0); tree.add(m); bulbs.push(m); }
  // ---------- loop ramp ----------
  const ramp = new THREE.Group(); ramp.position.set(RAMP.x0, 0, RAMP.z0); W.add(ramp);
  const R = RAMP.R, Wd = RAMP.width, n = 110, phiEnd = RAMP.endAngle;
  { const pos = [], uv = [], idx = [];
    const ring = (i, r, z) => { const p = phiEnd * i / n; return [r * Math.sin(p), R - r * Math.cos(p), z]; };
    // inner (driving) surface at radius R, outer surface at R + .3, plus side faces
    const layers = [[R, -Wd / 2], [R, Wd / 2], [R + .3, Wd / 2], [R + .3, -Wd / 2]];
    for (let i = 0; i <= n; i++) for (const [r, z] of layers) { pos.push(...ring(i, r, z)); uv.push(i / n * 6, z > 0 ? 1 : 0); }
    for (let i = 0; i < n; i++) for (let k = 0; k < 4; k++) { const a = i * 4 + k, b = i * 4 + (k + 1) % 4, c = a + 4, d = b + 4; idx.push(a, b, c, b, d, c); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals();
    const deckTex = canvasTex(256, 64, (c, w, h) => { c.fillStyle = '#9aa3ad'; c.fillRect(0, 0, w, h); c.fillStyle = 'rgba(0,0,0,.18)'; for (let x = 0; x < w; x += 16) c.fillRect(x, 0, 2, h); c.fillStyle = '#e0313f'; c.fillRect(0, 0, w, 5); c.fillRect(0, h - 5, w, 5); });
    deckTex.wrapS = THREE.RepeatWrapping;
    const deck = new THREE.Mesh(g, new THREE.MeshStandardMaterial({map: deckTex, metalness: .35, roughness: .45, side: THREE.DoubleSide}));
    deck.castShadow = deck.receiveShadow = true; ramp.add(deck);
    // LED edge strips
    const pts = []; for (let i = 0; i <= n; i++) pts.push(new THREE.Vector3(...ring(i, R - .02, 0)));
    const curve = new THREE.CatmullRomCurve3(pts);
    const led = new THREE.MeshBasicMaterial({color: new THREE.Color(.6, 2.2, 3.2)});
    for (const z of [-Wd / 2 - .05, Wd / 2 + .05]) { const t = new THREE.Mesh(new THREE.TubeGeometry(curve, 160, .045, 6), led); t.position.z = z; ramp.add(t); }
    // scaffolding outside the deck on both sides
    const steel = new THREE.MeshStandardMaterial({color: 0x4a5059, metalness: .85, roughness: .35});
    for (let i = 6; i <= n; i += 7) {
      const p = ring(i, R + .3, 0); if (p[1] < .8) continue;
      for (const s of [-1, 1]) {
        const col = new THREE.Mesh(new THREE.CylinderGeometry(.1, .12, p[1], 8), steel); col.position.set(p[0], p[1] / 2, s * (Wd / 2 + .7)); col.castShadow = true; ramp.add(col);
        const arm = new THREE.Mesh(new THREE.BoxGeometry(.12, .12, .75), steel); arm.position.set(p[0], p[1], s * (Wd / 2 + .35)); ramp.add(arm);
      }
    }
    for (let y = 3; y < 20; y += 4) for (const s of [-1, 1]) { const b = new THREE.Mesh(new THREE.BoxGeometry(R * 1.05, .08, .08), steel); b.position.set(R * .5, y, s * (Wd / 2 + .7)); ramp.add(b); }
  }
  // landing zone
  flat(14, 7, new THREE.MeshStandardMaterial({color: 0x30343b, roughness: .7}), -9, RAMP.z0);
  for (const x of [-16, -2]) flat(.2, 7, yellow, x, RAMP.z0);
  flat(5, .25, yellow, -9, RAMP.z0, Math.PI / 4); flat(5, .25, yellow, -9, RAMP.z0, -Math.PI / 4);
  for (let x = -70; x < -18; x += 5) flat(2.2, .15, paintMat, x, RAMP.z0);
  // ---------- kickflip row ----------
  const kz = SITE.kick.z;
  for (const [i, b] of rowBoxes().entries()) {
    const [name, w, h, l] = ROW[i], v = makeVehicle(name, w, h, l); v.position.set((b.min[0] + b.max[0]) / 2, 0, kz); W.add(v);
  }
  flat(.35, 7, yellow, SITE.kick.marker, kz);
  for (let x = -90; x < 80; x += 5) { flat(2.2, .15, paintMat, x, kz - 3.6); flat(2.2, .15, paintMat, x, kz + 3.6); }
  // ---------- hop pad ----------
  const pad = new THREE.Mesh(new THREE.CircleGeometry(SITE.hop.padR, 64), new THREE.MeshStandardMaterial({color: 0x23272e, roughness: .5, metalness: .3}));
  pad.rotation.x = -Math.PI / 2; pad.position.set(SITE.hop.x, .015, SITE.hop.z); pad.receiveShadow = true; W.add(pad);
  const ringMat = new THREE.MeshBasicMaterial({color: new THREE.Color(3, 2.2, .3)});
  const ring = new THREE.Mesh(new THREE.RingGeometry(SITE.hop.padR - .25, SITE.hop.padR, 64), ringMat); ring.rotation.x = -Math.PI / 2; ring.position.set(SITE.hop.x, .03, SITE.hop.z); W.add(ring);
  const holo = new THREE.Mesh(new THREE.TorusGeometry(3.2, .03, 6, 64), new THREE.MeshBasicMaterial({color: new THREE.Color(.5, 2.5, 3), transparent: true, opacity: .6})); holo.rotation.x = Math.PI / 2; holo.position.set(SITE.hop.x, 4 + .62, SITE.hop.z); W.add(holo);
  updaters.push(t => { holo.material.opacity = .35 + .25 * Math.sin(t * 3); });
  for (const s of [-1, 1]) { const p = new THREE.Mesh(new THREE.CylinderGeometry(.06, .06, 6, 8), new THREE.MeshStandardMaterial({color: 0xdddddd})); p.position.set(SITE.hop.x + s * 6, 3, SITE.hop.z - 5); W.add(p);
    const mk = new THREE.Mesh(new THREE.BoxGeometry(.6, .06, .06), ringMat); mk.position.set(SITE.hop.x + s * 6, 4, SITE.hop.z - 5); W.add(mk); }

  // ---------- floodlight towers, volumetric cones and real spotlights ----------
  const towerMat = new THREE.MeshStandardMaterial({color: 0x30343a, metalness: .7, roughness: .5});
  const lamp = new THREE.MeshBasicMaterial({color: new THREE.Color(6, 5.6, 5)});
  const coneTex = canvasTex(64, 256, (g, w, h) => { const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, 'rgba(255,245,230,.55)'); gr.addColorStop(1, 'rgba(255,245,230,0)'); g.fillStyle = gr; g.fillRect(0, 0, w, h); });
  const towers = [[-30, -62], [40, -62], [-34, 20], [26, -18], [-24, 66], [36, 66], [-18, 112], [24, 112], [90, -60], [150, -24]];
  for (const [x, z] of towers) {
    const h = 22, t = new THREE.Group(); t.position.set(x, 0, z); W.add(t);
    const p = new THREE.Mesh(new THREE.CylinderGeometry(.25, .4, h, 8), towerMat); p.position.y = h / 2; t.add(p);
    const head = new THREE.Group(); head.position.y = h; t.add(head);
    for (let i = 0; i < 6; i++) { const l = new THREE.Mesh(new THREE.PlaneGeometry(.9, .6), lamp); l.position.set((i % 3 - 1) * 1.05, Math.floor(i / 3) * .7, 0); head.add(l); }
    const target = new THREE.Vector3(x * .35, 0, z > 100 ? SITE.hop.z : z > 40 ? SITE.kick.z : z < -40 ? SITE.drag.z : 0);
    head.lookAt(target.x, target.y + 40, target.z); head.children.forEach(c => { c.lookAt(target); });
    const flare = new THREE.Sprite(new THREE.SpriteMaterial({map: glowTex, color: 0xfff3e0, transparent: true, opacity: .55, depthWrite: false, blending: THREE.AdditiveBlending, fog: false})); flare.scale.set(9, 9, 1); flare.position.y = h + .35; t.add(flare);
    const dist = Math.hypot(target.x - x, h, target.z - z);
    const cone = new THREE.Mesh(new THREE.ConeGeometry(dist * .32, dist, 24, 1, true), new THREE.MeshBasicMaterial({map: coneTex, transparent: true, opacity: .1, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false}));
    cone.geometry.translate(0, -dist / 2, 0); cone.position.set(x, h, z);
    cone.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), new THREE.Vector3(target.x - x, -h, target.z - z).normalize()); W.add(cone);
    pool(target.x + (x - target.x) * .25, target.z + (z - target.z) * .25, 26, 0xfff1dc, .07);
  }
  const spots = [];
  for (const [x, z, tx, tz] of [[-26, -60, 10, SITE.drag.z], [-30, 18, -4, 0], [26, 66, 6, SITE.kick.z], [20, 110, 0, SITE.hop.z]]) {
    const s = new THREE.SpotLight(0xfff0dc, 3600, 160, .62, .7, 1.6); s.position.set(x, 22, z); s.target.position.set(tx, 0, tz); W.add(s, s.target); spots.push(s);
  }
  const moon = new THREE.DirectionalLight(0xbfd2ff, .55); moon.position.set(-40, 60, 30); moon.castShadow = true;
  moon.shadow.mapSize.set(2048, 2048); Object.assign(moon.shadow.camera, {left: -30, right: 30, top: 30, bottom: -30, near: 1, far: 160}); moon.shadow.bias = -.0005; moon.shadow.normalBias = .03;
  W.add(moon, moon.target);
  W.add(new THREE.HemisphereLight(0x2a3550, 0x0c0a08, .55));
  // ---------- stands with crowd and phone lights ----------
  const standMat = new THREE.MeshStandardMaterial({color: 0x23262c, roughness: .8});
  const crowdGeo = new THREE.CapsuleGeometry(.22, .5, 2, 6), crowdMat = new THREE.MeshStandardMaterial({color: 0x3a3f4a, roughness: .9});
  const stands = [[-60, -10, Math.PI / 2, 70], [60, 30, -Math.PI / 2, 60], [-55, 88, Math.PI / 2, 40]];
  const people = []; const phones = [];
  for (const [x, z, rot, len] of stands) {
    const st = new THREE.Group(); st.position.set(x, 0, z); st.rotation.y = rot; W.add(st);
    for (let r = 0; r < 6; r++) { const step = new THREE.Mesh(new THREE.BoxGeometry(len, .5, 1.2), standMat); step.position.set(0, .25 + r * .5, r * 1.2); step.receiveShadow = true; st.add(step);
      for (let i = 0; i < len / .7; i++) if (Math.random() < .8) { const v = new THREE.Vector3(-len / 2 + i * .7 + Math.random() * .2, .5 + r * .5 + .45, r * 1.2); st.localToWorld(v); people.push(v); if (Math.random() < .14) phones.push(v.clone().add(new THREE.Vector3(0, .5, 0))); } }
    const roofLed = new THREE.Mesh(new THREE.BoxGeometry(len, .12, .12), new THREE.MeshBasicMaterial({color: new THREE.Color(2.5, .25, .35)})); roofLed.position.set(0, 4.2, 7.5); st.add(roofLed);
  }
  const crowd = new THREE.InstancedMesh(crowdGeo, crowdMat, people.length), mtx = new THREE.Matrix4(), col = new THREE.Color();
  people.forEach((p, i) => { mtx.makeTranslation(p.x, p.y, p.z); crowd.setMatrixAt(i, mtx); crowd.setColorAt(i, col.setHSL(Math.random(), .25, .18 + Math.random() * .2)); });
  W.add(crowd);
  { const g = new THREE.BufferGeometry().setFromPoints(phones), ph = new Float32Array(phones.length).map(() => Math.random()); g.setAttribute('aS', new THREE.BufferAttribute(ph, 1));
    const m = new THREE.ShaderMaterial({uniforms: {uT: {value: 0}}, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      vertexShader: 'attribute float aS;uniform float uT;varying float a;void main(){vec4 mv=modelViewMatrix*vec4(position,1.);a=step(.25,fract(aS*13.+uT*.05*aS));gl_PointSize=min(14.,260./-mv.z);gl_Position=projectionMatrix*mv;}',
      fragmentShader: 'varying float a;void main(){float d=length(gl_PointCoord-.5);gl_FragColor=vec4(1.,.97,.9,a*smoothstep(.5,0.,d));}'});
    W.add(new THREE.Points(g, m)); updaters.push(t => { m.uniforms.uT.value = t; }); }
  // hangar/tent with light strips
  for (const [x, z, w, d] of [[70, -100, 40, 20], [-90, 40, 24, 36]]) {
    const b = new THREE.Mesh(new THREE.BoxGeometry(w, 10, d), new THREE.MeshStandardMaterial({color: 0x1b1e24, roughness: .7})); b.position.set(x, 5, z); W.add(b);
    const s = new THREE.Mesh(new THREE.BoxGeometry(w * .9, .25, .1), new THREE.MeshBasicMaterial({color: new THREE.Color(2.4, 2.4, 2.6)})); s.position.set(x, 8, z + d / 2 + .06); W.add(s);
  }
  // jersey barriers with reflective stripes
  const barMat = new THREE.MeshStandardMaterial({color: 0x9b9d9f, roughness: .9}), refl = new THREE.MeshStandardMaterial({color: 0xff3030, emissive: 0x550000, roughness: .3});
  const barrier = new THREE.InstancedMesh(new THREE.BoxGeometry(3, .8, .5), barMat, 120), stripe = new THREE.InstancedMesh(new THREE.BoxGeometry(2.9, .1, .52), refl, 120);
  let bi = 0; const place = (x, z, ry = 0) => { if (bi >= 120) return; mtx.makeRotationY(ry).setPosition(x, .4, z); barrier.setMatrixAt(bi, mtx); mtx.makeRotationY(ry).setPosition(x, .6, z); stripe.setMatrixAt(bi, mtx); bi++; };
  for (let x = -18; x < 160; x += 3.4) { place(x, SITE.drag.z - 8); place(x, SITE.drag.z + 9); }
  for (let x = -60; x < 40; x += 3.4) place(x, SITE.kick.z - 9);
  barrier.count = stripe.count = bi; barrier.receiveShadow = true; W.add(barrier, stripe);
  // horizon silhouettes (trees) for depth
  const hill = new THREE.Mesh(new THREE.CylinderGeometry(520, 520, 18, 64, 1, true), new THREE.MeshBasicMaterial({color: 0x07080c, side: THREE.BackSide, fog: false})); hill.position.y = 3; W.add(hill);

  return {group: W, moon, spots, tree: {group: tree, bulbs}, update: t => updaters.forEach(f => f(t)), setShadowRes(n) { moon.shadow.mapSize.set(n, n); moon.shadow.map?.dispose(); moon.shadow.map = null; }};
}
