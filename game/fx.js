// Grok-versionen · particles (cold-gas condensation, dust, sparks), jet cores, speed lines.
import * as THREE from 'three';

class Particles {
  constructor(cap, {additive = false} = {}) {
    this.cap = cap; this.n = 0; this.next = 0;
    this.pos = new Float32Array(cap * 3); this.vel = new Float32Array(cap * 3); this.col = new Float32Array(cap * 3);
    this.life = new Float32Array(cap); this.max = new Float32Array(cap); this.size = new Float32Array(cap); this.grow = new Float32Array(cap);
    this.alpha = new Float32Array(cap); this.a0 = new Float32Array(cap); this.drag = new Float32Array(cap); this.buoy = new Float32Array(cap); this.sz = new Float32Array(cap);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aCol', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aSize', new THREE.BufferAttribute(this.sz, 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aAlpha', new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    this.mat = new THREE.ShaderMaterial({uniforms: {uScale: {value: 600}}, transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      vertexShader: 'attribute vec3 aCol;attribute float aSize;attribute float aAlpha;uniform float uScale;varying vec3 c;varying float a;void main(){c=aCol;vec4 mv=modelViewMatrix*vec4(position,1.);a=aAlpha*smoothstep(1.2,7.,-mv.z);gl_PointSize=min(400.,aSize*uScale/max(.1,-mv.z));gl_Position=projectionMatrix*mv;}',
      fragmentShader: 'varying vec3 c;varying float a;void main(){float d=length(gl_PointCoord-.5)*2.;float k=a*smoothstep(1.,.15,d);if(k<.004)discard;gl_FragColor=vec4(c,k);}'});
    this.points = new THREE.Points(g, this.mat); this.points.frustumCulled = false;
  }
  emit(p, v, {life = 1, size = .5, grow = 2, color = [1, 1, 1], alpha = .5, drag = 2, buoy = 0}) {
    const i = this.next; this.next = (this.next + 1) % this.cap;
    this.pos.set(p, i * 3); this.vel.set(v, i * 3); this.col.set(color, i * 3);
    this.life[i] = this.max[i] = life; this.size[i] = size; this.grow[i] = grow; this.a0[i] = alpha; this.drag[i] = drag; this.buoy[i] = buoy;
  }
  update(dt) {
    for (let i = 0; i < this.cap; i++) {
      if (this.life[i] <= 0) { this.alpha[i] = 0; continue; }
      this.life[i] -= dt; const k = Math.max(0, this.life[i] / this.max[i]), age = 1 - k, d = Math.exp(-this.drag[i] * dt);
      const j = i * 3;
      this.vel[j] *= d; this.vel[j + 1] = this.vel[j + 1] * d + this.buoy[i] * dt; this.vel[j + 2] *= d;
      this.pos[j] += this.vel[j] * dt; this.pos[j + 1] += this.vel[j + 1] * dt; this.pos[j + 2] += this.vel[j + 2] * dt;
      if (this.pos[j + 1] < .05) { this.pos[j + 1] = .05; this.vel[j + 1] = Math.abs(this.vel[j + 1]) * .2; this.vel[j] *= 1.02; this.vel[j + 2] *= 1.02; }
      this.sz[i] = this.size[i] * (1 + this.grow[i] * age);
      this.alpha[i] = this.a0[i] * Math.min(1, age * 8) * k * k;
    }
    const a = this.points.geometry.attributes; a.position.needsUpdate = a.aCol.needsUpdate = a.aSize.needsUpdate = a.aAlpha.needsUpdate = true;
  }
  clear() { this.life.fill(0); this.alpha.fill(0); }
}

function coreTex() {
  const c = document.createElement('canvas'); c.width = 64; c.height = 256; const g = c.getContext('2d');
  const gr = g.createLinearGradient(0, 0, 0, 256); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(.3, 'rgba(210,230,255,.7)'); gr.addColorStop(1, 'rgba(180,210,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 256);
  const r = g.createLinearGradient(0, 0, 64, 0); r.addColorStop(0, 'rgba(0,0,0,1)'); r.addColorStop(.5, 'rgba(0,0,0,0)'); r.addColorStop(1, 'rgba(0,0,0,1)');
  g.globalCompositeOperation = 'destination-out'; g.fillStyle = r; g.fillRect(0, 0, 64, 256);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

export function createFX(scene, car, {cap = 2600} = {}) {
  const vapor = new Particles(cap), sparks = new Particles(400, {additive: true});
  scene.add(vapor.points, sparks.points);
  const tex = coreTex(), cores = [];
  const N = car.userData.nozzles;
  for (const [group, list] of Object.entries(N)) for (const [p, d] of list) {
    const big = group === 'rear' || group === 'lift', len = big ? 2.6 : 1.1, r = big ? .32 : .14;
    const geo = new THREE.ConeGeometry(r, len, 16, 1, true); geo.translate(0, -len / 2, 0); geo.rotateX(Math.PI);
    const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({map: tex, color: new THREE.Color(1.6, 1.8, 2.2), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, opacity: 0}));
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d); m.position.copy(p); m.visible = false; car.add(m);
    cores.push({group, mesh: m, p, d, big});
  }
  const wp = new THREE.Vector3(), wd = new THREE.Vector3(), q = new THREE.Quaternion(), tmp = new THREE.Vector3();
  let budget = 1;
  function nozzleLevels(th) {
    return {rear: th.rear, lift: th.lift,
      rollP: th.rollSign > 0 ? th.roll : 0, rollN: th.rollSign < 0 ? th.roll : 0,
      pitchP: th.pitchSign > 0 ? th.pitch : 0, pitchN: th.pitchSign < 0 ? th.pitch : 0,
      yawP: th.yawSign > 0 ? th.yaw : 0, yawN: th.yawSign < 0 ? th.yaw : 0};
  }
  function update(dt, st, carVel, t) {
    car.getWorldQuaternion(q); car.updateMatrixWorld();
    const lv = nozzleLevels(st.thrust);
    for (const c of cores) {
      const k = Math.min(1, lv[c.group] || 0), on = k > .03; c.mesh.visible = on; if (!on) continue;
      const fl = 1 + .12 * Math.sin(t * 60 + c.p.x * 9 + c.p.z * 17);
      c.mesh.material.opacity = .25 + .6 * k; c.mesh.scale.set(.7 + .3 * k, (.5 + .5 * k) * fl, .7 + .3 * k);
      const rate = (c.big ? 120 : 50) * k * budget * dt;
      for (let e = 0; e < rate || (e < 1 && Math.random() < rate); e++) {
        wp.copy(c.p).applyMatrix4(car.matrixWorld); wd.copy(c.d).applyQuaternion(q);
        const sp = (c.big ? 26 : 12) * (.7 + Math.random() * .6), j = c.big ? 3 : 1.5;
        vapor.emit([wp.x + wd.x * .3, wp.y + wd.y * .3, wp.z + wd.z * .3], [carVel.x * .6 + wd.x * sp + (Math.random() - .5) * j, carVel.y * .6 + wd.y * sp + (Math.random() - .5) * j, carVel.z * .6 + wd.z * sp + (Math.random() - .5) * j],
          {life: c.big ? .55 + Math.random() * .5 : .4, size: c.big ? .4 : .22, grow: c.big ? 3.2 : 2.5, alpha: c.big ? .13 : .14, drag: 2.4, buoy: .6, color: [.8, .84, .9]});
      }
    }
    // ground dust when the lift jets blast near the ground
    const alt = st.pos[1] - .62;
    if (st.thrust.lift > .05 && alt < 7) {
      const k = (1 - alt / 7) * st.thrust.lift, nd = 45 * k * budget * dt;
      for (let e = 0; e < nd; e++) { const a = Math.random() * Math.PI * 2, sp = 10 + Math.random() * 10;
        vapor.emit([st.pos[0] + Math.cos(a) * 1.5, .15, st.pos[2] + Math.sin(a) * 1.5], [Math.cos(a) * sp, Math.random() * 2, Math.sin(a) * sp], {life: 1.1, size: .7, grow: 3, alpha: .1, drag: 1.6, buoy: .4, color: [.5, .46, .4]}); }
    }
    // tyre smoke on wheelspin / hard braking
    if ((st.slip || st.braking) && st.mode === 'ground' && Math.abs(st.speed) > 1) {
      tmp.set(-1.4, -.6, 0).applyMatrix4(car.matrixWorld);
      for (let e = 0; e < 40 * budget * dt; e++) vapor.emit([tmp.x, .2, tmp.z + (Math.random() - .5) * 1.8], [(Math.random() - .5), Math.random(), (Math.random() - .5)], {life: 1.5, size: .6, grow: 3, alpha: .2, drag: 1, buoy: .5, color: [.8, .8, .82]});
    }
    vapor.update(dt); sparks.update(dt);
  }
  function burst(p, n = 160) {
    for (let i = 0; i < n; i++) { const a = Math.random() * Math.PI * 2, e = Math.random() * 1.2, s = 6 + Math.random() * 14;
      sparks.emit([p[0], p[1], p[2]], [Math.cos(a) * Math.cos(e) * s, Math.sin(e) * s + 3, Math.sin(a) * Math.cos(e) * s], {life: .5 + Math.random() * .8, size: .12, grow: 0, alpha: 1, drag: 1, buoy: -9, color: [1, .55, .15]}); }
    for (let i = 0; i < n / 2; i++) vapor.emit([p[0], p[1], p[2]], [(Math.random() - .5) * 8, Math.random() * 4, (Math.random() - .5) * 8], {life: 2.5, size: 1, grow: 4, alpha: .35, drag: 1.2, buoy: 1, color: [.35, .33, .32]});
  }
  function puff(p, n = 60, color = [.6, .56, .5]) {
    for (let i = 0; i < n; i++) { const a = Math.random() * Math.PI * 2, s = 3 + Math.random() * 6; vapor.emit([p[0] + Math.cos(a), .2, p[2] + Math.sin(a)], [Math.cos(a) * s, Math.random() * 1.5, Math.sin(a) * s], {life: 1.4, size: .7, grow: 3, alpha: .25, drag: 2, buoy: .3, color}); }
  }
  return {update, burst, puff, clear() { vapor.clear(); sparks.clear(); }, setBudget(b) { budget = b; }, setScale(s) { vapor.mat.uniforms.uScale.value = s; sparks.mat.uniforms.uScale.value = s; }};
}

/** 2D speed-line overlay. */
export function createSpeedLines(canvas) {
  const g = canvas.getContext('2d'); const lines = Array.from({length: 70}, () => ({a: Math.random() * Math.PI * 2, r: Math.random(), s: .5 + Math.random()}));
  return function draw(intensity, dt) {
    const W = canvas.width = canvas.clientWidth * Math.min(1.5, devicePixelRatio), H = canvas.height = canvas.clientHeight * Math.min(1.5, devicePixelRatio);
    g.clearRect(0, 0, W, H); if (intensity < .03) return;
    const cx = W / 2, cy = H * .45, R = Math.hypot(W, H) / 2;
    g.lineCap = 'round';
    for (const l of lines) {
      l.r += dt * l.s * (1.5 + intensity * 3); if (l.r > 1) { l.r = .25 + Math.random() * .2; l.a = Math.random() * Math.PI * 2; }
      const r0 = R * l.r, r1 = r0 + R * .12 * intensity * l.s;
      g.strokeStyle = `rgba(230,240,255,${.25 * intensity * l.r})`; g.lineWidth = 1 + 2 * l.r;
      g.beginPath(); g.moveTo(cx + Math.cos(l.a) * r0, cy + Math.sin(l.a) * r0); g.lineTo(cx + Math.cos(l.a) * r1, cy + Math.sin(l.a) * r1); g.stroke();
    }
  };
}
