// Grok-versionen · synthesized sound (WebAudio only, no samples): motor whine, fan hum, jet hiss, wind, impacts.
export function createAudio() {
  let ctx = null, master, nodes = null, enabled = true;
  try { enabled = localStorage.getItem('grok-game-sound') !== '0'; } catch {}
  function noiseBuffer(c) {
    const b = c.createBuffer(1, c.sampleRate * 2, c.sampleRate), d = b.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; return b;
  }
  function loopNoise(c, buf) { const s = c.createBufferSource(); s.buffer = buf; s.loop = true; s.start(); return s; }
  function init() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
    ctx = new AC(); master = ctx.createGain(); master.gain.value = enabled ? 0.7 : 0;
    const comp = ctx.createDynamicsCompressor(); master.connect(comp); comp.connect(ctx.destination);
    const nb = noiseBuffer(ctx);
    const mk = (type, f) => { const o = ctx.createOscillator(); o.type = type; o.frequency.value = f; o.start(); return o; };
    const gain = v => { const g = ctx.createGain(); g.gain.value = v; return g; };
    // motor: two detuned saws through lowpass
    const m1 = mk('sawtooth', 80), m2 = mk('square', 160), mf = ctx.createBiquadFilter(); mf.type = 'lowpass'; mf.frequency.value = 900;
    const mg = gain(0); m1.connect(mf); m2.connect(gain(.3)).connect(mf); mf.connect(mg).connect(master);
    // fan: band noise + hum
    const fn = loopNoise(ctx, nb), ff = ctx.createBiquadFilter(); ff.type = 'bandpass'; ff.frequency.value = 600; ff.Q.value = .8;
    const fh = mk('triangle', 110), fg = gain(0); fn.connect(ff).connect(fg); fh.connect(gain(.15)).connect(fg); fg.connect(master);
    // jets: bright hiss (high band) + roar (low)
    const jn = loopNoise(ctx, nb), jh = ctx.createBiquadFilter(); jh.type = 'highpass'; jh.frequency.value = 2500;
    const jl = ctx.createBiquadFilter(); jl.type = 'lowpass'; jl.frequency.value = 400; const jg = gain(0), jlg = gain(0);
    jn.connect(jh).connect(jg).connect(master); jn.connect(jl).connect(jlg).connect(master);
    // attitude puffs
    const an = loopNoise(ctx, nb), af = ctx.createBiquadFilter(); af.type = 'bandpass'; af.frequency.value = 3800; af.Q.value = 2; const ag = gain(0); an.connect(af).connect(ag).connect(master);
    // wind
    const wn = loopNoise(ctx, nb), wf = ctx.createBiquadFilter(); wf.type = 'lowpass'; wf.frequency.value = 500; const wg = gain(0); wn.connect(wf).connect(wg).connect(master);
    nodes = {m1, m2, mf, mg, ff, fg, fh, jg, jlg, jh, ag, wg, wf};
  }
  const ramp = (p, v, tc = .05) => p.setTargetAtTime(v, ctx.currentTime, tc);
  function update(s) {
    if (!nodes || !enabled) return;
    const n = nodes, sp = Math.abs(s.speed || 0);
    ramp(n.m1.frequency, 60 + sp * 22); ramp(n.m2.frequency, 120 + sp * 44); ramp(n.mf.frequency, 600 + sp * 120);
    ramp(n.mg.gain, s.grounded ? Math.min(.22, .02 + s.throttle * .14 + sp * .004) : .01);
    ramp(n.fg.gain, s.fan * .16); ramp(n.ff.frequency, 300 + s.fan * 900); ramp(n.fh.frequency, 60 + s.fan * 120);
    const jet = Math.min(1, s.rear + s.lift);
    ramp(n.jg.gain, jet * .5, .02); ramp(n.jlg.gain, jet * .9, .03); ramp(n.ag.gain, Math.min(1, s.att) * .18, .02);
    ramp(n.wg.gain, Math.min(.35, sp * sp * .0004)); ramp(n.wf.frequency, 300 + sp * 30);
  }
  function blip(freq = 880, dur = .12, type = 'sine', vol = .25, slide = 0) {
    if (!ctx || !enabled) return;
    const o = ctx.createOscillator(), g = ctx.createGain(), t0 = ctx.currentTime;
    o.type = type; o.frequency.setValueAtTime(freq, t0); if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq * slide), t0 + dur);
    g.gain.setValueAtTime(vol, t0); g.gain.exponentialRampToValueAtTime(.001, t0 + dur); o.connect(g).connect(master); o.start(t0); o.stop(t0 + dur + .02);
  }
  function thud(vol = .8) {
    if (!ctx || !enabled) return;
    blip(120, .35, 'sine', vol, .3);
    const s = ctx.createBufferSource(), b = ctx.createBuffer(1, ctx.sampleRate * .3, ctx.sampleRate), d = b.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 3);
    s.buffer = b; const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 900; const g = ctx.createGain(); g.gain.value = vol;
    s.connect(f).connect(g).connect(master); s.start();
  }
  function crash() { thud(1); setTimeout(() => thud(.6), 90); blip(300, .6, 'sawtooth', .2, .2); }
  function chime(ok = true) { (ok ? [523, 659, 784, 1047] : [392, 330, 262]).forEach((f, i) => setTimeout(() => blip(f, .25, 'triangle', .22), i * 110)); }
  function setEnabled(on) { enabled = on; try { localStorage.setItem('grok-game-sound', on ? '1' : '0'); } catch {} if (master) master.gain.value = on ? .7 : 0; }
  return {init, update, blip, thud, crash, chime, setEnabled, get enabled() { return enabled; }, get ctx() { return ctx; }};
}
export function buzz(pattern) { try { navigator.vibrate?.(pattern); } catch {} }
