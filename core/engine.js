// Screen Destroyer — shared engine.
// Platform-independent: runs in Android WebView, Electron (Linux) or any browser.
// The page background is transparent, so whatever is underneath (the phone's
// screen, the Linux desktop, or a screenshot) shows through and gets "damaged".
(function () {
  'use strict';

  // ---------- host bridge (Android / Electron / browser) ----------
  const Host = {
    close() {
      if (window.AndroidHost && AndroidHost.close) return AndroidHost.close();
      if (window.electronHost && electronHost.close) return electronHost.close();
      window.close();
    },
    vibrate(ms) {
      if (window.AndroidHost && AndroidHost.vibrate) return AndroidHost.vibrate(ms | 0);
      if (navigator.vibrate) navigator.vibrate(ms);
    },
  };
  // Hosts can push a screenshot to use as background (Linux fallback mode).
  window.setBackground = function (url) {
    document.body.style.backgroundImage = url ? `url("${url}")` : '';
    document.body.classList.toggle('has-bg', !!url);
  };
  const qbg = new URLSearchParams(location.search).get('bg');
  if (qbg) window.setBackground(qbg);

  // ---------- canvases ----------
  const marksC = document.getElementById('marks');
  const fxC = document.getElementById('fx');
  const mctx = marksC.getContext('2d');
  const fctx = fxC.getContext('2d');
  let W = 0, H = 0, DPR = 1, SC = 1;

  function resize() {
    const nw = window.innerWidth, nh = window.innerHeight;
    const nd = Math.min(window.devicePixelRatio || 1, 2.5);
    // keep existing damage across rotations / resizes
    let keep = null;
    if (marksC.width > 0 && W > 0) {
      keep = document.createElement('canvas');
      keep.width = marksC.width; keep.height = marksC.height;
      keep.getContext('2d').drawImage(marksC, 0, 0);
    }
    W = nw; H = nh; DPR = nd;
    SC = Math.max(0.8, Math.min(1.6, Math.min(W, H) / 480));
    for (const c of [marksC, fxC]) { c.width = Math.round(W * DPR); c.height = Math.round(H * DPR); }
    mctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    fctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    if (keep) { mctx.save(); mctx.setTransform(1, 0, 0, 1, 0, 0); mctx.drawImage(keep, 0, 0); mctx.restore(); }
  }
  window.addEventListener('resize', resize);
  resize();

  // ---------- helpers ----------
  const rnd = (a, b) => a + Math.random() * (b - a);
  const rint = (a, b) => Math.floor(rnd(a, b + 1));
  const TAU = Math.PI * 2;
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

  function jaggedPath(x, y, ang, len, step, jitter) {
    const pts = [[x, y]];
    let cx = x, cy = y, a = ang, d = 0;
    while (d < len) {
      const s = step * rnd(0.6, 1.4);
      a += rnd(-jitter, jitter);
      cx += Math.cos(a) * s; cy += Math.sin(a) * s; d += s;
      pts.push([cx, cy]);
    }
    return pts;
  }
  function strokePts(ctx, pts) {
    ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
    ctx.stroke();
  }
  // a crack that reads on any background: dark shadow + bright edge
  function drawCrack(ctx, pts, width) {
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.strokeStyle = 'rgba(0,0,0,0.45)'; ctx.lineWidth = width * 2.4; strokePts(ctx, pts);
    ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.lineWidth = width; strokePts(ctx, pts);
  }

  // ---------- simulation state ----------
  const particles = [];   // fire, smoke, debris, sparks, shards
  const flyingDarts = [];
  const stuckDarts = [];  // wobbling, then committed to marks layer
  const bombs = [];
  const rings = [];
  const flashes = [];
  let shake = 0;

  function addParticle(p) { if (particles.length < 1600) particles.push(p); }

  // ---------- DART ----------
  const DART_COLORS = [['#e53935', '#ffeb3b'], ['#1e88e5', '#ffffff'], ['#43a047', '#111'], ['#8e24aa', '#ffca28'], ['#ff7043', '#263238']];
  function throwDart(tx, ty) {
    const from = { x: W * 0.5 + rnd(-W * 0.25, W * 0.25), y: H + 80 * SC };
    flyingDarts.push({
      x0: from.x, y0: from.y, x1: tx, y1: ty, t: 0, dur: 0.26,
      ang: rnd(-0.7, -0.25) + (tx < W / 2 ? 0.25 : -0.1), // tail direction
      colors: pick(DART_COLORS),
    });
    Sound.whoosh();
  }
  function drawDart(ctx, x, y, scale, ang, colors, wob) {
    // Seen from the thrower's side: tip in the screen, barrel + flights pointing back at us.
    const L = 62 * SC * scale;
    const a = ang + (wob || 0);
    const tx = x + Math.cos(a - Math.PI / 2) * L, ty = y + Math.sin(a - Math.PI / 2) * L;
    ctx.save();
    ctx.lineCap = 'round';
    // shadow on the "screen"
    ctx.strokeStyle = 'rgba(0,0,0,0.25)'; ctx.lineWidth = 4 * SC * scale;
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + (tx - x) * 0.6 + 10 * SC, y + (ty - y) * 0.15 + 8 * SC); ctx.stroke();
    // steel tip + barrel
    ctx.strokeStyle = '#cfd8dc'; ctx.lineWidth = 2 * SC * scale;
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + (tx - x) * 0.25, y + (ty - y) * 0.25); ctx.stroke();
    ctx.strokeStyle = '#455a64'; ctx.lineWidth = 5 * SC * scale;
    ctx.beginPath(); ctx.moveTo(x + (tx - x) * 0.25, y + (ty - y) * 0.25); ctx.lineTo(x + (tx - x) * 0.6, y + (ty - y) * 0.6); ctx.stroke();
    ctx.strokeStyle = colors[0]; ctx.lineWidth = 3 * SC * scale;
    ctx.beginPath(); ctx.moveTo(x + (tx - x) * 0.6, y + (ty - y) * 0.6); ctx.lineTo(tx, ty); ctx.stroke();
    // flights (3 vanes, seen slightly from behind)
    const fl = 21 * SC * scale;
    for (let i = 0; i < 3; i++) {
      const va = a + i * (TAU / 3) + 0.3;
      ctx.fillStyle = i === 1 ? colors[1] : colors[0];
      ctx.beginPath();
      ctx.moveTo(tx, ty);
      ctx.lineTo(tx + Math.cos(va) * fl, ty + Math.sin(va) * fl);
      ctx.lineTo(tx + Math.cos(va + 0.5) * fl * 0.6 - Math.cos(a - Math.PI / 2) * 8 * SC * scale,
                 ty + Math.sin(va + 0.5) * fl * 0.6 - Math.sin(a - Math.PI / 2) * 8 * SC * scale);
      ctx.closePath(); ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = 1; ctx.stroke();
    }
    ctx.restore();
  }
  function dartImpact(d) {
    const x = d.x1, y = d.y1;
    // small hole + hairline cracks
    mctx.fillStyle = 'rgba(0,0,0,0.75)';
    mctx.beginPath(); mctx.arc(x, y, 2.2 * SC, 0, TAU); mctx.fill();
    for (let i = 0, n = rint(3, 6); i < n; i++) {
      drawCrack(mctx, jaggedPath(x, y, rnd(0, TAU), rnd(8, 26) * SC, 4 * SC, 0.5), 0.6);
    }
    stuckDarts.push({ x, y, ang: d.ang, colors: d.colors, t: 0 });
    for (let i = 0; i < 6; i++) addParticle({ k: 'spark', x, y, vx: rnd(-120, 120), vy: rnd(-160, 40), life: rnd(0.15, 0.35), age: 0, s: rnd(1, 2) });
    Sound.dart(); Host.vibrate(18);
  }

  // ---------- HAMMER (glass crack) ----------
  function hammer(x, y) {
    const n = rint(9, 15), rays = [];
    const maxR = rnd(130, 230) * SC;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU + rnd(-0.18, 0.18);
      const pts = jaggedPath(x, y, a, maxR * rnd(0.45, 1), 9 * SC, 0.22);
      rays.push(pts);
      drawCrack(mctx, pts, rnd(0.8, 1.5));
      // branches
      if (Math.random() < 0.6) {
        const p = pts[rint(2, pts.length - 2)] || pts[1];
        drawCrack(mctx, jaggedPath(p[0], p[1], a + rnd(-0.9, 0.9), rnd(20, 60) * SC, 7 * SC, 0.3), 0.7);
      }
    }
    // concentric "spider web" rings between neighbouring rays
    for (const frac of [0.18, 0.35, 0.55]) {
      for (let i = 0; i < n; i++) {
        if (Math.random() < 0.3) continue;
        const r1 = rays[i], r2 = rays[(i + 1) % n];
        const p1 = r1[Math.min(r1.length - 1, Math.floor(r1.length * frac * rnd(0.8, 1.2)))];
        const p2 = r2[Math.min(r2.length - 1, Math.floor(r2.length * frac * rnd(0.8, 1.2)))];
        const mx = (p1[0] + p2[0]) / 2 + rnd(-4, 4) * SC, my = (p1[1] + p2[1]) / 2 + rnd(-4, 4) * SC;
        drawCrack(mctx, [p1, [mx, my], p2], 0.7);
      }
    }
    // crushed centre
    const g = mctx.createRadialGradient(x, y, 0, x, y, 16 * SC);
    g.addColorStop(0, 'rgba(255,255,255,0.85)'); g.addColorStop(0.5, 'rgba(220,235,255,0.35)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    mctx.fillStyle = g; mctx.beginPath(); mctx.arc(x, y, 16 * SC, 0, TAU); mctx.fill();
    for (let i = 0; i < 14; i++) {
      drawCrack(mctx, jaggedPath(x, y, rnd(0, TAU), rnd(4, 14) * SC, 3 * SC, 0.8), 0.5);
    }
    // flying glass shards
    for (let i = 0; i < 18; i++) {
      addParticle({ k: 'shard', x, y, vx: rnd(-260, 260), vy: rnd(-380, -40), rot: rnd(0, TAU), vr: rnd(-12, 12),
        life: rnd(0.6, 1.1), age: 0, s: rnd(2, 6) * SC });
    }
    shake = Math.max(shake, 6);
    Sound.crack(); Host.vibrate(40);
  }

  // ---------- GUN (bullet holes) ----------
  function bulletHole(x, y) {
    const r = rnd(3.5, 5) * SC;
    for (let i = 0, n = rint(5, 9); i < n; i++) {
      drawCrack(mctx, jaggedPath(x, y, rnd(0, TAU), rnd(10, 38) * SC, 5 * SC, 0.4), 0.7);
    }
    const g = mctx.createRadialGradient(x, y, r * 0.3, x, y, r * 2.6);
    g.addColorStop(0, 'rgba(255,255,255,0.0)'); g.addColorStop(0.45, 'rgba(255,255,255,0.55)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    mctx.fillStyle = g; mctx.beginPath(); mctx.arc(x, y, r * 2.6, 0, TAU); mctx.fill();
    mctx.fillStyle = '#0b0b0b'; mctx.beginPath(); mctx.arc(x, y, r, 0, TAU); mctx.fill();
    mctx.strokeStyle = 'rgba(90,90,90,0.9)'; mctx.lineWidth = 1.2; mctx.stroke();
    addParticle({ k: 'flash', x, y, life: 0.06, age: 0, s: rnd(14, 22) * SC });
    for (let i = 0; i < 5; i++) addParticle({ k: 'spark', x, y, vx: rnd(-200, 200), vy: rnd(-220, 60), life: rnd(0.1, 0.3), age: 0, s: rnd(1, 2.2) });
    shake = Math.max(shake, 3);
    Sound.gun(); Host.vibrate(14);
  }

  // ---------- BOMB ----------
  function placeBomb(x, y) {
    bombs.push({ x, y, t: 0, fuse: 0.9 });
    Sound.fuse();
  }
  function explode(x, y, big) {
    const R = (big ? 190 : 120) * SC * rnd(0.9, 1.1);
    // scorch mark (irregular blotch)
    mctx.save();
    for (let i = 0; i < 9; i++) {
      const ox = x + rnd(-R, R) * 0.35, oy = y + rnd(-R, R) * 0.35, rr = R * rnd(0.35, 0.8);
      const g = mctx.createRadialGradient(ox, oy, 0, ox, oy, rr);
      g.addColorStop(0, 'rgba(10,6,4,0.55)'); g.addColorStop(0.6, 'rgba(40,22,10,0.28)'); g.addColorStop(1, 'rgba(40,22,10,0)');
      mctx.fillStyle = g; mctx.beginPath(); mctx.arc(ox, oy, rr, 0, TAU); mctx.fill();
    }
    // black core with ragged edge
    mctx.fillStyle = 'rgba(5,3,2,0.92)';
    mctx.beginPath();
    const n = 28;
    for (let i = 0; i <= n; i++) {
      const a = (i / n) * TAU, rr = R * 0.22 * rnd(0.6, 1.35);
      const px = x + Math.cos(a) * rr, py = y + Math.sin(a) * rr;
      i ? mctx.lineTo(px, py) : mctx.moveTo(px, py);
    }
    mctx.fill();
    // glowing ember rim
    const eg = mctx.createRadialGradient(x, y, R * 0.12, x, y, R * 0.32);
    eg.addColorStop(0, 'rgba(255,120,20,0)'); eg.addColorStop(0.7, 'rgba(255,110,20,0.35)'); eg.addColorStop(1, 'rgba(255,90,10,0)');
    mctx.fillStyle = eg; mctx.beginPath(); mctx.arc(x, y, R * 0.32, 0, TAU); mctx.fill();
    mctx.restore();
    // big cracks
    for (let i = 0, k = rint(10, 16); i < k; i++) {
      const a = rnd(0, TAU);
      const pts = jaggedPath(x + Math.cos(a) * R * 0.18, y + Math.sin(a) * R * 0.18, a, R * rnd(0.6, 1.5), 12 * SC, 0.25);
      drawCrack(mctx, pts, rnd(1, 2));
      if (Math.random() < 0.5) {
        const p = pts[Math.floor(pts.length / 2)];
        drawCrack(mctx, jaggedPath(p[0], p[1], a + rnd(-1, 1), R * rnd(0.2, 0.5), 9 * SC, 0.3), 0.8);
      }
    }
    // effects
    flashes.push({ x, y, R: R * 2.2, age: 0, life: 0.35 });
    rings.push({ x, y, R: R * 2.4, age: 0, life: 0.45 });
    for (let i = 0; i < (big ? 90 : 60); i++) {
      const a = rnd(0, TAU), sp = rnd(60, 420) * SC;
      addParticle({ k: 'fire', x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 60, life: rnd(0.35, 0.9), age: 0, s: rnd(10, 28) * SC });
    }
    for (let i = 0; i < 30; i++) {
      const a = rnd(0, TAU), sp = rnd(20, 140) * SC;
      addParticle({ k: 'smoke', x: x + rnd(-20, 20), y: y + rnd(-20, 20), vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 50, life: rnd(1.4, 2.8), age: 0, s: rnd(18, 40) * SC });
    }
    for (let i = 0; i < 26; i++) {
      const a = rnd(0, TAU), sp = rnd(200, 700) * SC;
      addParticle({ k: 'debris', x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 150, rot: rnd(0, TAU), vr: rnd(-15, 15), life: rnd(0.8, 1.6), age: 0, s: rnd(3, 8) * SC });
    }
    for (let i = 0; i < 30; i++) {
      const a = rnd(0, TAU), sp = rnd(300, 900) * SC;
      addParticle({ k: 'spark', x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: rnd(0.2, 0.6), age: 0, s: rnd(1.2, 2.5) });
    }
    shake = Math.max(shake, big ? 26 : 18);
    Sound.explosion(big); Host.vibrate(big ? 400 : 250);
  }

  // ---------- FLAME ----------
  let lastBurn = null;
  function flameAt(x, y) {
    for (let i = 0; i < 4; i++) {
      addParticle({ k: 'fire', x: x + rnd(-6, 6) * SC, y: y + rnd(-6, 6) * SC, vx: rnd(-50, 50), vy: rnd(-220, -80), life: rnd(0.3, 0.7), age: 0, s: rnd(10, 22) * SC });
    }
    if (Math.random() < 0.35) addParticle({ k: 'smoke', x, y: y - 20 * SC, vx: rnd(-20, 20), vy: rnd(-90, -40), life: rnd(1, 2), age: 0, s: rnd(14, 26) * SC });
    // soot along the path
    if (!lastBurn || Math.hypot(x - lastBurn.x, y - lastBurn.y) > 6 * SC) {
      const rr = rnd(14, 26) * SC;
      const g = mctx.createRadialGradient(x, y, 0, x, y, rr);
      g.addColorStop(0, 'rgba(15,8,3,0.22)'); g.addColorStop(0.6, 'rgba(60,30,10,0.12)'); g.addColorStop(1, 'rgba(60,30,10,0)');
      mctx.fillStyle = g; mctx.beginPath(); mctx.arc(x, y, rr, 0, TAU); mctx.fill();
      if (Math.random() < 0.08) {
        mctx.fillStyle = 'rgba(255,140,40,0.25)';
        mctx.beginPath(); mctx.arc(x + rnd(-8, 8), y + rnd(-8, 8), rnd(1, 3) * SC, 0, TAU); mctx.fill();
      }
      lastBurn = { x, y };
    }
  }

  // ---------- input ----------
  let tool = 'dart';
  const pointers = new Map(); // id -> {x,y,lastShot}
  let flameStop = null;

  fxC.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    Sound.unlock();
    try { fxC.setPointerCapture(e.pointerId); } catch (_) {}
    const x = e.clientX, y = e.clientY;
    pointers.set(e.pointerId, { x, y, lastShot: 0 });
    switch (tool) {
      case 'dart': throwDart(x, y); break;
      case 'hammer': hammer(x, y); break;
      case 'gun': bulletHole(x, y); pointers.get(e.pointerId).lastShot = performance.now(); break;
      case 'bomb': placeBomb(x, y); break;
      case 'flame': lastBurn = null; if (!flameStop) flameStop = Sound.flameStart(); break;
    }
  });
  fxC.addEventListener('pointermove', (e) => {
    const p = pointers.get(e.pointerId);
    if (!p) return;
    p.x = e.clientX; p.y = e.clientY;
  });
  function endPointer(e) {
    pointers.delete(e.pointerId);
    if (pointers.size === 0 && flameStop) { flameStop(); flameStop = null; }
  }
  fxC.addEventListener('pointerup', endPointer);
  fxC.addEventListener('pointercancel', endPointer);
  fxC.addEventListener('contextmenu', (e) => e.preventDefault());

  // ---------- UI ----------
  const toolbar = document.getElementById('toolbar');
  const btnShow = document.getElementById('btn-show');
  document.querySelectorAll('.tool').forEach((b) => {
    b.addEventListener('click', () => {
      document.querySelectorAll('.tool').forEach((x) => x.classList.remove('active'));
      b.classList.add('active');
      tool = b.dataset.tool;
    });
  });
  document.getElementById('btn-clear').addEventListener('click', clearAll);
  document.getElementById('btn-close').addEventListener('click', () => Host.close());
  const btnSound = document.getElementById('btn-sound');
  btnSound.addEventListener('click', () => {
    Sound.setEnabled(!Sound.enabled);
    btnSound.firstElementChild.textContent = Sound.enabled ? '🔊' : '🔇';
  });
  document.getElementById('btn-hide').addEventListener('click', () => { toolbar.classList.add('hidden'); btnShow.hidden = false; });
  btnShow.addEventListener('click', () => { toolbar.classList.remove('hidden'); btnShow.hidden = true; });
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') Host.close();
    const map = { '1': 'dart', '2': 'hammer', '3': 'gun', '4': 'bomb', '5': 'flame' };
    if (map[e.key]) document.querySelector(`.tool[data-tool="${map[e.key]}"]`).click();
    if (e.key === 'c' || e.key === 'C') clearAll();
  });

  function clearAll() {
    mctx.save(); mctx.setTransform(1, 0, 0, 1, 0, 0); mctx.clearRect(0, 0, marksC.width, marksC.height); mctx.restore();
    particles.length = 0; stuckDarts.length = 0; flyingDarts.length = 0; bombs.length = 0; rings.length = 0; flashes.length = 0;
  }

  // ---------- main loop ----------
  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;

    // continuous tools
    for (const p of pointers.values()) {
      if (tool === 'gun' && now - p.lastShot > 85) {
        p.lastShot = now;
        bulletHole(p.x + rnd(-10, 10) * SC, p.y + rnd(-10, 10) * SC);
      } else if (tool === 'flame') {
        flameAt(p.x, p.y);
      }
    }

    // screen shake (on the whole stage so damage shakes too)
    shake *= Math.pow(0.002, dt);
    const stage = document.getElementById('stage');
    if (shake > 0.4) stage.style.transform = `translate(${rnd(-shake, shake)}px, ${rnd(-shake, shake)}px)`;
    else if (stage.style.transform) stage.style.transform = '';

    fctx.clearRect(0, 0, W, H);

    // bombs (fuse)
    for (let i = bombs.length - 1; i >= 0; i--) {
      const b = bombs[i];
      b.t += dt;
      if (b.t >= b.fuse) { bombs.splice(i, 1); explode(b.x, b.y, false); continue; }
      const pulse = 1 + Math.sin(b.t * 30) * 0.05 * (b.t / b.fuse) * 3;
      const r = 16 * SC * pulse;
      fctx.save();
      fctx.fillStyle = 'rgba(0,0,0,0.3)'; fctx.beginPath(); fctx.ellipse(b.x + 4, b.y + r * 0.9, r, r * 0.35, 0, 0, TAU); fctx.fill();
      const g = fctx.createRadialGradient(b.x - r * 0.35, b.y - r * 0.35, r * 0.1, b.x, b.y, r);
      g.addColorStop(0, '#666'); g.addColorStop(1, '#0d0d0d');
      fctx.fillStyle = g; fctx.beginPath(); fctx.arc(b.x, b.y, r, 0, TAU); fctx.fill();
      fctx.fillStyle = '#333'; fctx.fillRect(b.x - 4 * SC, b.y - r - 5 * SC, 8 * SC, 6 * SC);
      fctx.strokeStyle = '#a1887f'; fctx.lineWidth = 2 * SC;
      fctx.beginPath(); fctx.moveTo(b.x, b.y - r - 5 * SC); fctx.quadraticCurveTo(b.x + 8 * SC, b.y - r - 14 * SC, b.x + 12 * SC, b.y - r - 10 * SC); fctx.stroke();
      // red blink as fuse runs out
      if (Math.sin(b.t * (8 + b.t * 30)) > 0) {
        fctx.fillStyle = 'rgba(255,40,40,0.8)'; fctx.beginPath(); fctx.arc(b.x - r * 0.3, b.y - r * 0.3, 3 * SC, 0, TAU); fctx.fill();
      }
      fctx.restore();
      if (Math.random() < 0.9) addParticle({ k: 'spark', x: b.x + 12 * SC, y: b.y - r - 10 * SC, vx: rnd(-60, 60), vy: rnd(-90, 10), life: rnd(0.1, 0.3), age: 0, s: rnd(1, 2) });
    }

    // flying darts
    for (let i = flyingDarts.length - 1; i >= 0; i--) {
      const d = flyingDarts[i];
      d.t += dt;
      const k = Math.min(1, d.t / d.dur);
      const e = 1 - Math.pow(1 - k, 2);
      const x = d.x0 + (d.x1 - d.x0) * e;
      const y = d.y0 + (d.y1 - d.y0) * e - Math.sin(k * Math.PI) * 60 * SC;
      const scale = 3.2 - 2.2 * e; // big (close to us) → normal (on the screen)
      drawDart(fctx, x, y, scale, d.ang, d.colors, 0);
      if (k >= 1) { flyingDarts.splice(i, 1); dartImpact(d); }
    }

    // stuck darts wobble, then get baked into the damage layer
    for (let i = stuckDarts.length - 1; i >= 0; i--) {
      const s = stuckDarts[i];
      s.t += dt;
      const wob = Math.sin(s.t * 38) * 0.18 * Math.exp(-s.t * 6);
      if (s.t > 0.8) { drawDart(mctx, s.x, s.y, 1, s.ang, s.colors, 0); stuckDarts.splice(i, 1); }
      else drawDart(fctx, s.x, s.y, 1, s.ang, s.colors, wob);
    }

    // particles
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.age += dt;
      if (p.age >= p.life) { particles.splice(i, 1); continue; }
      const t = p.age / p.life;
      if (p.vx !== undefined) {
        p.x += p.vx * dt; p.y += p.vy * dt;
        if (p.k === 'debris' || p.k === 'shard') { p.vy += 1100 * dt; p.rot += p.vr * dt; }
        else if (p.k === 'spark') { p.vy += 500 * dt; p.vx *= 0.98; }
        else if (p.k === 'fire') { p.vx *= 0.92; p.vy = p.vy * 0.92 - 30 * dt * 60 * 0.1; }
        else if (p.k === 'smoke') { p.vx *= 0.97; p.vy = p.vy * 0.97 - 2; }
      }
      switch (p.k) {
        case 'fire': {
          fctx.globalCompositeOperation = 'lighter';
          const r = p.s * (1 - t * 0.6);
          const g = fctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r);
          const a = 1 - t;
          g.addColorStop(0, `rgba(255,${Math.round(240 - t * 120)},${Math.round(160 - t * 160)},${a})`);
          g.addColorStop(0.4, `rgba(255,${Math.round(140 - t * 80)},20,${a * 0.7})`);
          g.addColorStop(1, 'rgba(200,40,0,0)');
          fctx.fillStyle = g; fctx.beginPath(); fctx.arc(p.x, p.y, r, 0, TAU); fctx.fill();
          fctx.globalCompositeOperation = 'source-over';
          break;
        }
        case 'smoke': {
          const r = p.s * (1 + t * 1.8);
          const a = 0.35 * (1 - t) * Math.min(1, t * 6);
          const g = fctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r);
          g.addColorStop(0, `rgba(40,40,40,${a})`); g.addColorStop(1, 'rgba(40,40,40,0)');
          fctx.fillStyle = g; fctx.beginPath(); fctx.arc(p.x, p.y, r, 0, TAU); fctx.fill();
          break;
        }
        case 'debris': {
          fctx.save(); fctx.translate(p.x, p.y); fctx.rotate(p.rot);
          fctx.fillStyle = `rgba(30,22,18,${1 - t})`;
          fctx.fillRect(-p.s / 2, -p.s / 2, p.s, p.s * 0.6);
          fctx.restore();
          break;
        }
        case 'shard': {
          fctx.save(); fctx.translate(p.x, p.y); fctx.rotate(p.rot);
          fctx.fillStyle = `rgba(220,240,255,${0.75 * (1 - t)})`;
          fctx.strokeStyle = `rgba(255,255,255,${1 - t})`; fctx.lineWidth = 0.8;
          fctx.beginPath(); fctx.moveTo(0, -p.s); fctx.lineTo(p.s * 0.7, p.s * 0.5); fctx.lineTo(-p.s * 0.5, p.s * 0.7); fctx.closePath();
          fctx.fill(); fctx.stroke();
          fctx.restore();
          break;
        }
        case 'spark': {
          fctx.globalCompositeOperation = 'lighter';
          fctx.strokeStyle = `rgba(255,${Math.round(220 - t * 120)},90,${1 - t})`;
          fctx.lineWidth = p.s;
          fctx.beginPath(); fctx.moveTo(p.x, p.y); fctx.lineTo(p.x - p.vx * 0.02, p.y - p.vy * 0.02); fctx.stroke();
          fctx.globalCompositeOperation = 'source-over';
          break;
        }
        case 'flash': {
          fctx.globalCompositeOperation = 'lighter';
          const g = fctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.s);
          g.addColorStop(0, `rgba(255,250,200,${1 - t})`); g.addColorStop(0.5, `rgba(255,180,60,${0.7 * (1 - t)})`); g.addColorStop(1, 'rgba(255,120,0,0)');
          fctx.fillStyle = g; fctx.beginPath(); fctx.arc(p.x, p.y, p.s, 0, TAU); fctx.fill();
          fctx.globalCompositeOperation = 'source-over';
          break;
        }
      }
    }

    // explosion flashes + shockwaves
    for (let i = flashes.length - 1; i >= 0; i--) {
      const f = flashes[i]; f.age += dt;
      if (f.age >= f.life) { flashes.splice(i, 1); continue; }
      const t = f.age / f.life;
      fctx.globalCompositeOperation = 'lighter';
      const g = fctx.createRadialGradient(f.x, f.y, 0, f.x, f.y, f.R * (0.5 + t * 0.5));
      g.addColorStop(0, `rgba(255,255,230,${1 - t})`); g.addColorStop(0.3, `rgba(255,200,90,${0.8 * (1 - t)})`); g.addColorStop(1, 'rgba(255,90,0,0)');
      fctx.fillStyle = g; fctx.beginPath(); fctx.arc(f.x, f.y, f.R, 0, TAU); fctx.fill();
      fctx.globalCompositeOperation = 'source-over';
    }
    for (let i = rings.length - 1; i >= 0; i--) {
      const r = rings[i]; r.age += dt;
      if (r.age >= r.life) { rings.splice(i, 1); continue; }
      const t = r.age / r.life;
      fctx.strokeStyle = `rgba(255,255,255,${0.5 * (1 - t)})`;
      fctx.lineWidth = 10 * SC * (1 - t);
      fctx.beginPath(); fctx.arc(r.x, r.y, r.R * (1 - Math.pow(1 - t, 3)), 0, TAU); fctx.stroke();
    }

    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  // small API for tests / hosts
  window.Destroyer = {
    setTool(t) { const b = document.querySelector(`.tool[data-tool="${t}"]`); if (b) b.click(); },
    clear: clearAll,
    explode: (x, y, big) => explode(x, y, !!big),
  };
})();
