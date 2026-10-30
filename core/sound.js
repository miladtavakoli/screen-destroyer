// Synthesized sound effects (Web Audio API) — no audio files needed.
(function () {
  'use strict';
  let ctx = null, master = null, noiseBuf = null, enabled = true;

  function ensure() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.8;
      // gentle limiter so overlapping explosions don't clip harshly
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -10; comp.ratio.value = 8;
      master.connect(comp).connect(ctx.destination);
      noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  function noise(dur, filterType, freq, q, gain, freqEnd, start) {
    const t = (start ?? ctx.currentTime);
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    src.playbackRate.value = 0.8 + Math.random() * 0.4;
    const f = ctx.createBiquadFilter();
    f.type = filterType; f.frequency.setValueAtTime(freq, t); f.Q.value = q;
    if (freqEnd) f.frequency.exponentialRampToValueAtTime(freqEnd, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(master);
    src.start(t, Math.random()); src.stop(t + dur + 0.05);
    return { src, g };
  }

  function tone(type, f0, f1, dur, gain, start) {
    const t = (start ?? ctx.currentTime);
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(master);
    o.start(t); o.stop(t + dur + 0.05);
  }

  const S = {
    unlock() { ensure(); },
    setEnabled(v) { enabled = v; },
    get enabled() { return enabled; },

    whoosh() {
      if (!enabled || !ensure()) return;
      noise(0.18, 'bandpass', 600, 1.5, 0.25, 2400);
    },
    dart() {
      if (!enabled || !ensure()) return;
      tone('triangle', 220, 70, 0.09, 0.7);
      noise(0.04, 'bandpass', 2500, 2, 0.5);
    },
    crack() {
      if (!enabled || !ensure()) return;
      const t = ctx.currentTime;
      noise(0.25, 'highpass', 2500, 0.7, 0.7, null, t);
      for (let i = 0; i < 6; i++) noise(0.03, 'bandpass', 3000 + Math.random() * 4000, 4, 0.5, null, t + Math.random() * 0.18);
      tone('sine', 140, 60, 0.12, 0.6, t);
    },
    gun() {
      if (!enabled || !ensure()) return;
      noise(0.14, 'lowpass', 4000, 0.8, 0.9, 300);
      tone('square', 160, 50, 0.07, 0.25);
    },
    fuse() {
      if (!enabled || !ensure()) return;
      noise(0.85, 'highpass', 5000, 1, 0.08);
    },
    explosion(big) {
      if (!enabled || !ensure()) return;
      const t = ctx.currentTime;
      noise(big ? 2.2 : 1.5, 'lowpass', 1400, 0.9, 1.0, 80, t);
      noise(0.25, 'bandpass', 1800, 0.6, 0.6, 300, t);
      tone('sine', 90, 28, big ? 1.2 : 0.8, 1.0, t);
    },
    crunch() {
      if (!enabled || !ensure()) return;
      noise(0.07, 'bandpass', 1800, 1.2, 0.8);
      noise(0.05, 'highpass', 4000, 1, 0.4, null, ctx.currentTime + 0.03);
    },
    goo() {
      if (!enabled || !ensure()) return;
      tone('sine', 300, 120, 0.18, 0.35);
      noise(0.15, 'lowpass', 600, 2, 0.3);
    },
    plop() {
      if (!enabled || !ensure()) return;
      const t = ctx.currentTime;
      for (let i = 0; i < 4; i++) tone('sine', 260 - i * 20, 90, 0.08, 0.5, t + i * 0.09);
    },
    sting() {
      if (!enabled || !ensure()) return;
      tone('square', 1400, 500, 0.12, 0.25);
      tone('sine', 900, 200, 0.3, 0.4);
    },
    baa() {
      if (!enabled || !ensure()) return;
      const t = ctx.currentTime, dur = 0.85;
      const o = ctx.createOscillator(); o.type = 'sawtooth';
      o.frequency.setValueAtTime(420, t); o.frequency.linearRampToValueAtTime(360, t + dur);
      const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 1300; f.Q.value = 1.5;
      const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.5, t + 0.06); g.gain.setValueAtTime(0.5, t + dur - 0.2);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      // the bleat wobble
      const lfo = ctx.createOscillator(); lfo.frequency.value = 11;
      const lg = ctx.createGain(); lg.gain.value = 0.25;
      const trem = ctx.createGain(); trem.gain.value = 0.75;
      lfo.connect(lg).connect(trem.gain);
      o.connect(f).connect(trem).connect(g).connect(master);
      o.start(t); lfo.start(t); o.stop(t + dur + 0.05); lfo.stop(t + dur + 0.05);
    },
    moo() {
      if (!enabled || !ensure()) return;
      const t = ctx.currentTime, dur = 1.4;
      const o = ctx.createOscillator(); o.type = 'sawtooth';
      o.frequency.setValueAtTime(115, t); o.frequency.linearRampToValueAtTime(140, t + 0.4);
      o.frequency.linearRampToValueAtTime(100, t + dur);
      const f = ctx.createBiquadFilter(); f.type = 'lowpass';
      f.frequency.setValueAtTime(350, t); f.frequency.linearRampToValueAtTime(900, t + 0.5); f.frequency.linearRampToValueAtTime(400, t + dur);
      const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.8, t + 0.15); g.gain.setValueAtTime(0.8, t + dur - 0.3);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(f).connect(g).connect(master); o.start(t); o.stop(t + dur + 0.05);
    },
    // one gallop beat (two hooves); `near` 0..1 makes it louder as the cow approaches
    hoof(near) {
      if (!enabled || !ensure()) return;
      const t = ctx.currentTime, v = 0.15 + 0.7 * near * near;
      for (const d of [0, 0.06]) {
        tone('sine', 110, 45, 0.09, v, t + d);
        noise(0.05, 'lowpass', 900, 1, v * 0.5, null, t + d);
      }
    },
    whistle(dur) {
      if (!enabled || !ensure()) return;
      tone('sine', 2200, 350, dur, 0.18);
    },
    nuke() {
      if (!enabled || !ensure()) return;
      const t = ctx.currentTime;
      noise(3.5, 'lowpass', 1600, 0.7, 1.0, 40, t);
      noise(5.0, 'lowpass', 220, 0.8, 0.9, 30, t + 0.1);
      tone('sine', 70, 18, 3.0, 1.0, t);
    },
    // continuous buzz for bees: level 0 = silent
    buzz(level) {
      if (!ensure()) return;
      if (!S._buzz) {
        const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = 215;
        const lfo = ctx.createOscillator(); lfo.frequency.value = 23;
        const lg = ctx.createGain(); lg.gain.value = 12;
        lfo.connect(lg).connect(o.frequency);
        const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 1100;
        const g = ctx.createGain(); g.gain.value = 0.0001;
        o.connect(f).connect(g).connect(master); o.start(); lfo.start();
        S._buzz = g;
      }
      const v = enabled ? Math.max(0.0001, Math.min(0.12, level * 0.04)) : 0.0001;
      S._buzz.gain.setTargetAtTime(v, ctx.currentTime, 0.08);
    },
    // continuous chainsaw motor: returns {set(speed 0..1), stop()}
    sawStart() {
      if (!enabled || !ensure()) return { set() {}, stop() {} };
      const t = ctx.currentTime;
      const o1 = ctx.createOscillator(); o1.type = 'sawtooth'; o1.frequency.value = 80;
      const o2 = ctx.createOscillator(); o2.type = 'square'; o2.frequency.value = 160;
      const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 1500;
      const am = ctx.createGain(); am.gain.value = 0.6;
      const lfo = ctx.createOscillator(); lfo.frequency.value = 32;
      const lg = ctx.createGain(); lg.gain.value = 0.35;
      lfo.connect(lg).connect(am.gain);
      const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.35, t + 0.1);
      o1.connect(f); o2.connect(f); f.connect(am).connect(g).connect(master);
      const src = ctx.createBufferSource(); src.buffer = noiseBuf; src.loop = true;
      const nf = ctx.createBiquadFilter(); nf.type = 'bandpass'; nf.frequency.value = 2500; nf.Q.value = 1;
      const ng = ctx.createGain(); ng.gain.value = 0.0001;
      src.connect(nf).connect(ng).connect(master);
      [o1, o2, lfo, src].forEach((n) => n.start(t));
      return {
        set(speed) {
          const now = ctx.currentTime;
          o1.frequency.setTargetAtTime(80 + speed * 70, now, 0.05);
          o2.frequency.setTargetAtTime(160 + speed * 140, now, 0.05);
          ng.gain.setTargetAtTime(0.0001 + speed * 0.35, now, 0.05);
        },
        stop() {
          const now = ctx.currentTime;
          g.gain.cancelScheduledValues(now); g.gain.setTargetAtTime(0.0001, now, 0.05);
          ng.gain.setTargetAtTime(0.0001, now, 0.05);
          [o1, o2, lfo, src].forEach((n) => n.stop(now + 0.3));
        },
      };
    },
    // continuous flame roar: returns stop()
    flameStart() {
      if (!enabled || !ensure()) return () => {};
      const src = ctx.createBufferSource();
      src.buffer = noiseBuf; src.loop = true;
      const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 450; f.Q.value = 0.6;
      const g = ctx.createGain(); g.gain.value = 0.0001;
      g.gain.exponentialRampToValueAtTime(0.5, ctx.currentTime + 0.08);
      src.connect(f).connect(g).connect(master);
      src.start();
      return () => {
        const t = ctx.currentTime;
        g.gain.cancelScheduledValues(t);
        g.gain.setValueAtTime(g.gain.value, t);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.15);
        src.stop(t + 0.2);
      };
    },
  };
  window.Sound = S;
})();
