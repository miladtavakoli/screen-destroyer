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
