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
  function hammer(x, y) { glassCrack(x, y, 1); Sound.crack(); Host.vibrate(40); }
  function glassCrack(x, y, size) {
    const n = rint(9, 15), rays = [];
    const maxR = rnd(130, 230) * SC * size;
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

  // =====================================================================
  //  v1.2 tools: chainsaw, nuke, ants, roaches, bees, honey, sheep, cow
  // =====================================================================
  const EMOJI_FONT = '"Noto Color Emoji","Apple Color Emoji","Segoe UI Emoji","Samsung Color Emoji",sans-serif';
  function drawEmoji(ctx, e, x, y, size, flip, rot, alpha) {
    ctx.save();
    ctx.translate(x, y);
    if (rot) ctx.rotate(rot);
    if (flip) ctx.scale(-1, 1);
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = '#000'; // colour emoji inherit the fill alpha in Chrome
    ctx.globalAlpha = alpha === undefined ? 1 : Math.max(0, Math.min(1, alpha));
    ctx.font = `${Math.round(size)}px ${EMOJI_FONT}`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(e, 0, 0);
    ctx.restore();
  }

  // ---------- real photo sprites (Wikimedia Commons, see img/CREDITS.md) ----------
  const SPR = {};
  for (const n of ['ant', 'roach', 'bee', 'fly', 'chainsaw', 'missile', 'cow', 'sheep']) {
    const im = new Image(); im.src = `img/${n}.webp`; SPR[n] = im;
  }
  const ok = (n) => SPR[n].complete && SPR[n].naturalWidth > 0;
  const HAS_FILTER = 'filter' in fctx;
  const shadowCache = {};
  // soft dark silhouette of a sprite, used as a realistic contact/drop shadow
  function shadowOf(n) {
    if (shadowCache[n]) return shadowCache[n];
    const im = SPR[n], pad = Math.ceil(im.naturalWidth * 0.08);
    const c = document.createElement('canvas');
    c.width = im.naturalWidth + pad * 2; c.height = im.naturalHeight + pad * 2;
    const x = c.getContext('2d');
    if (HAS_FILTER) x.filter = `blur(${Math.max(2, pad / 3)}px)`;
    x.drawImage(im, pad, pad);
    x.filter = 'none';
    x.globalCompositeOperation = 'source-in'; x.fillStyle = '#000'; x.fillRect(0, 0, c.width, c.height);
    c.pad = pad;
    return (shadowCache[n] = c);
  }
  // draw a sprite of length `len` (px) centred at x,y, rotated so its head points along `rot`
  function drawSprite(ctx, n, x, y, len, rot, o) {
    if (!ok(n)) return;
    o = o || {};
    const im = SPR[n], k = len / im.naturalWidth, w = len, h = im.naturalHeight * k;
    const ax = o.ax ?? 0.5, ay = o.ay ?? 0.5;
    const sx = (o.flip ? -1 : 1) * (o.sx || 1), sy = o.sy || 1;
    if (o.shadow) {
      const sh = shadowOf(n), p = sh.pad * k;
      ctx.save();
      ctx.translate(x + o.shadow[0], y + o.shadow[1]); ctx.rotate(rot - (o.head || 0)); ctx.scale(sx, sy);
      ctx.globalAlpha = o.shadow[2];
      ctx.drawImage(sh, -ax * w - p, -ay * h - p, w + 2 * p, h + 2 * p);
      ctx.restore();
    }
    ctx.save();
    ctx.translate(x, y); ctx.rotate(rot - (o.head || 0)); ctx.scale(sx, sy);
    ctx.globalAlpha = o.alpha ?? 1;
    if (o.filter && HAS_FILTER) ctx.filter = o.filter;
    ctx.drawImage(im, -ax * w, -ay * h, w, h);
    ctx.restore();
  }
  function edgePoint() {
    switch (rint(0, 3)) {
      case 0: return { x: rnd(0, W), y: -25 };
      case 1: return { x: W + 25, y: rnd(0, H) };
      case 2: return { x: rnd(0, W), y: H + 25 };
      default: return { x: -25, y: rnd(0, H) };
    }
  }
  const angDiff = (a, b) => { let d = b - a; while (d > Math.PI) d -= TAU; while (d < -Math.PI) d += TAU; return d; };
  const offscreen = (x, y, m) => x < -m || y < -m || x > W + m || y > H + m;

  // ---------- CHAINSAW ----------
  let sawSound = null;
  function sawCut(x0, y0, x1, y1) {
    const len = Math.hypot(x1 - x0, y1 - y0);
    if (len < 1) return;
    const nx = -(y1 - y0) / len, ny = (x1 - x0) / len;
    const steps = Math.max(2, Math.ceil(len / (3 * SC)));
    const pts = [];
    for (let i = 0; i <= steps; i++) {
      const t = i / steps, j = rnd(-2.5, 2.5) * SC;
      pts.push([x0 + (x1 - x0) * t + nx * j, y0 + (y1 - y0) * t + ny * j]);
    }
    mctx.lineCap = 'round'; mctx.lineJoin = 'round';
    mctx.strokeStyle = 'rgba(255,255,255,0.55)'; mctx.lineWidth = 12 * SC; strokePts(mctx, pts);
    mctx.strokeStyle = 'rgba(25,20,18,0.95)'; mctx.lineWidth = 6.5 * SC; strokePts(mctx, pts);
    mctx.strokeStyle = 'rgba(0,0,0,1)'; mctx.lineWidth = 2.5 * SC; strokePts(mctx, pts);
    if (Math.random() < 0.25) {
      const side = Math.random() < 0.5 ? -1 : 1;
      const a = Math.atan2(ny * side, nx * side) + rnd(-0.6, 0.6);
      drawCrack(mctx, jaggedPath(x1, y1, a, rnd(10, 40) * SC, 5 * SC, 0.4), 0.7);
    }
    for (let i = 0; i < 4; i++) {
      addParticle({ k: 'spark', x: x1, y: y1, vx: rnd(-280, 280), vy: rnd(-300, 100), life: rnd(0.15, 0.4), age: 0, s: rnd(1, 2.2) });
    }
    if (Math.random() < 0.5) addParticle({ k: 'dust', x: x1, y: y1, vx: rnd(-60, 60), vy: rnd(-80, -10), life: rnd(0.5, 1), age: 0, s: rnd(4, 9) * SC });
  }
  function drawChainsaw(ctx, x, y, ang) {
    // photo: bar tip at (0, 0.2); body→tip direction ≈ −167.6°
    const j = 1.5 * SC;
    drawSprite(ctx, 'chainsaw', x + rnd(-j, j), y + rnd(-j, j), 210 * SC, ang + 2.925,
      { ax: 0, ay: 0.2, shadow: [10 * SC, 16 * SC, 0.3] });
  }

  // ---------- NUKE ----------
  const rockets = [], mushrooms = [];
  let whiteout = 0;
  function launchNuke(x, y) {
    const x0 = x + rnd(-120, 120) * SC;
    rockets.push({ x0, y0: -60 * SC, x1: x, y1: y, t: 0, dur: 1.1 });
    Sound.whistle(1.1);
  }
  function nukeExplode(x, y) {
    whiteout = 1;
    const R = 320 * SC;
    // huge scorch
    for (let i = 0; i < 14; i++) {
      const ox = x + rnd(-R, R) * 0.4, oy = y + rnd(-R, R) * 0.4, rr = R * rnd(0.4, 0.9);
      const g = mctx.createRadialGradient(ox, oy, 0, ox, oy, rr);
      g.addColorStop(0, 'rgba(8,5,3,0.6)'); g.addColorStop(0.6, 'rgba(45,25,10,0.3)'); g.addColorStop(1, 'rgba(45,25,10,0)');
      mctx.fillStyle = g; mctx.beginPath(); mctx.arc(ox, oy, rr, 0, TAU); mctx.fill();
    }
    mctx.fillStyle = 'rgba(3,2,1,0.95)';
    mctx.beginPath();
    for (let i = 0; i <= 36; i++) {
      const a = (i / 36) * TAU, rr = R * 0.28 * rnd(0.7, 1.3);
      i ? mctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr) : mctx.moveTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
    }
    mctx.fill();
    // cracks across the whole screen
    const far = Math.hypot(W, H);
    for (let i = 0; i < 26; i++) {
      const a = (i / 26) * TAU + rnd(-0.1, 0.1);
      const pts = jaggedPath(x + Math.cos(a) * R * 0.25, y + Math.sin(a) * R * 0.25, a, far * rnd(0.4, 1), 16 * SC, 0.2);
      drawCrack(mctx, pts, rnd(1.2, 2.4));
      for (let k = 0; k < 2; k++) {
        const p = pts[rint(2, pts.length - 1)];
        drawCrack(mctx, jaggedPath(p[0], p[1], a + rnd(-1.2, 1.2), rnd(30, 140) * SC, 9 * SC, 0.3), 0.8);
      }
    }
    mushrooms.push({ x, y, t: 0, life: 6 });
    rings.push({ x, y, R: far * 1.2, age: 0, life: 1.2 });
    flashes.push({ x, y, R: far, age: 0, life: 0.9 });
    for (let i = 0; i < 160; i++) {
      const a = rnd(0, TAU), sp = rnd(100, 900) * SC;
      addParticle({ k: 'fire', x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 80, life: rnd(0.5, 1.4), age: 0, s: rnd(14, 40) * SC });
    }
    for (let i = 0; i < 50; i++) {
      const a = rnd(0, TAU), sp = rnd(300, 1100) * SC;
      addParticle({ k: 'debris', x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 200, rot: rnd(0, TAU), vr: rnd(-15, 15), life: rnd(1, 2), age: 0, s: rnd(4, 11) * SC });
    }
    // anything alive on screen gets vaporised
    for (const arr of [ants, roaches]) { for (const b of arr) squash(b, true); arr.length = 0; }
    bees.length = 0;
    shake = Math.max(shake, 45);
    Sound.nuke(); Host.vibrate(1000);
  }
  function drawMissile(r) {
    const len = 200 * SC;
    // photo nose points left (head = π); exhaust glows behind the tail
    const tx = r.x - Math.cos(r.ang) * len * 0.5, ty = r.y - Math.sin(r.ang) * len * 0.5;
    fctx.save(); fctx.globalCompositeOperation = 'lighter';
    const fl = len * rnd(0.35, 0.5);
    const g = fctx.createRadialGradient(tx, ty, 0, tx, ty, fl);
    g.addColorStop(0, 'rgba(255,250,220,0.95)'); g.addColorStop(0.3, 'rgba(255,190,80,0.7)'); g.addColorStop(1, 'rgba(255,90,0,0)');
    fctx.fillStyle = g; fctx.translate(tx, ty); fctx.rotate(r.ang); fctx.scale(1.6, 0.45);
    fctx.beginPath(); fctx.arc(-fl * 0.35, 0, fl, 0, TAU); fctx.fill();
    fctx.restore();
    drawSprite(fctx, 'missile', r.x, r.y, len, r.ang, { head: Math.PI, shadow: [25 * SC, 45 * SC, 0.15] });
  }
  function drawMushroom(m) {
    const t = m.t, k = Math.min(1, t / 2.2), fade = t > m.life - 1.5 ? (m.life - t) / 1.5 : 1;
    const capY = m.y - 300 * SC * (1 - Math.pow(1 - k, 2));
    const capR = (60 + 110 * k) * SC;
    // stem
    const stemW = (24 + 30 * k) * SC;
    const g = fctx.createLinearGradient(0, capY, 0, m.y);
    g.addColorStop(0, `rgba(120,90,70,${0.85 * fade})`); g.addColorStop(1, `rgba(255,140,40,${0.8 * fade})`);
    fctx.fillStyle = g;
    fctx.beginPath();
    fctx.moveTo(m.x - stemW * 0.5, capY); fctx.quadraticCurveTo(m.x - stemW * 0.3, (capY + m.y) / 2, m.x - stemW, m.y);
    fctx.lineTo(m.x + stemW, m.y); fctx.quadraticCurveTo(m.x + stemW * 0.3, (capY + m.y) / 2, m.x + stemW * 0.5, capY);
    fctx.fill();
    // base ring of dust
    const bg = fctx.createRadialGradient(m.x, m.y, 0, m.x, m.y, capR * 1.6);
    bg.addColorStop(0, `rgba(140,110,90,${0.6 * fade})`); bg.addColorStop(1, 'rgba(140,110,90,0)');
    fctx.fillStyle = bg; fctx.beginPath(); fctx.ellipse(m.x, m.y, capR * 1.6, capR * 0.45, 0, 0, TAU); fctx.fill();
    // cap: a cluster of billows, hot core → grey edge
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * TAU + t * 0.4;
      const bx = m.x + Math.cos(a) * capR * 0.55, by = capY + Math.sin(a) * capR * 0.3;
      const r = capR * (0.55 + 0.1 * Math.sin(t * 2 + i));
      const cg = fctx.createRadialGradient(bx, by, 0, bx, by, r);
      const hot = Math.max(0, 1 - t / 3);
      cg.addColorStop(0, `rgba(255,${Math.round(120 + 100 * hot)},${Math.round(40 * hot)},${0.9 * fade})`);
      cg.addColorStop(0.5, `rgba(${Math.round(150 + 90 * hot)},${Math.round(90 + 40 * hot)},60,${0.75 * fade})`);
      cg.addColorStop(1, 'rgba(90,80,75,0)');
      fctx.fillStyle = cg; fctx.beginPath(); fctx.arc(bx, by, r, 0, TAU); fctx.fill();
    }
  }

  // ---------- HONEY ----------
  const honeySpots = [], drips = [];
  let lastHoney = null;
  function honeyBlob(x, y, r, gloss) {
    const g = mctx.createRadialGradient(x - r * 0.25, y - r * 0.3, r * 0.1, x, y, r);
    g.addColorStop(0, 'rgba(255,196,70,0.50)');
    g.addColorStop(0.7, 'rgba(214,128,14,0.62)');
    g.addColorStop(1, 'rgba(150,72,4,0.75)');
    mctx.fillStyle = g; mctx.beginPath(); mctx.arc(x, y, r, 0, TAU); mctx.fill();
    if (gloss) {
      const hg = mctx.createRadialGradient(x - r * 0.38, y - r * 0.42, 0, x - r * 0.38, y - r * 0.42, r * 0.45);
      hg.addColorStop(0, 'rgba(255,255,245,0.85)'); hg.addColorStop(1, 'rgba(255,255,245,0)');
      mctx.fillStyle = hg; mctx.beginPath(); mctx.arc(x - r * 0.38, y - r * 0.42, r * 0.45, 0, TAU); mctx.fill();
    }
  }
  function pourHoney(x, y) {
    if (lastHoney && Math.hypot(x - lastHoney.x, y - lastHoney.y) < 6 * SC) return;
    const r = rnd(9, 14) * SC;
    honeyBlob(x, y, r, true);
    if (Math.random() < 0.35 && drips.length < 60) {
      drips.push({ x: x + rnd(-r, r) * 0.5, y: y + r * 0.5, v: rnd(16, 34) * SC, len: rnd(40, 200) * SC, done: 0, r: rnd(3.5, 6) * SC, lastY: -1e9 });
    }
    honeySpots.push({ x, y });
    if (honeySpots.length > 80) honeySpots.shift();
    lastHoney = { x, y };
  }
  function updateDrips(dt) {
    for (let i = drips.length - 1; i >= 0; i--) {
      const d = drips[i];
      const step = d.v * dt; d.v = Math.max(d.v * Math.pow(0.65, dt), 5 * SC);
      d.y += step; d.done += step;
      // the stream thins out as it runs
      const r = d.r * (1 - 0.35 * d.done / d.len);
      if (d.y - d.lastY > r * 0.6) { honeyBlob(d.x, d.y, r, false); d.lastY = d.y; }
      if (d.done >= d.len) {
        honeyBlob(d.x, d.y + d.r * 0.5, d.r * 1.5, true); // drop collects at the end
        honeySpots.push({ x: d.x, y: d.y });
        drips.splice(i, 1);
      }
    }
  }
  function nearestHoney(x, y, maxD) {
    let best = null, bd = maxD;
    for (const h of honeySpots) { const d = Math.hypot(h.x - x, h.y - y); if (d < bd) { bd = d; best = h; } }
    return best;
  }

  // ---------- ANTS & ROACHES (walk on the glass) ----------
  const ants = [], roaches = [];
  function spawnAnts(tx, ty) {
    const e = edgePoint();
    for (let i = 0; i < 12; i++) {
      if (ants.length >= 160) break;
      ants.push({ k: 'ant', x: e.x + rnd(-8, 8), y: e.y + rnd(-8, 8), h: Math.atan2(ty - e.y, tx - e.x), sp: rnd(45, 65) * SC,
        tx: tx + rnd(-30, 30) * SC, ty: ty + rnd(-30, 30) * SC, t: -i * 0.25, life: rnd(20, 32), ph: rnd(0, TAU) });
    }
  }
  function spawnRoaches(tx, ty) {
    for (let i = 0; i < 2; i++) {
      if (roaches.length >= 25) break;
      const e = edgePoint();
      roaches.push({ k: 'roach', x: e.x, y: e.y, h: Math.atan2(ty - e.y, tx - e.x), sp: 0, tx, ty, t: -i * 0.4, life: rnd(20, 35), ph: 0, pause: 0, run: rnd(0.5, 1.2) });
    }
  }
  function steer(b, ang, turn, dt) {
    const d = angDiff(b.h, ang);
    b.h += Math.max(-turn * dt, Math.min(turn * dt, d));
  }
  function updateWalkers(arr, dt) {
    for (let i = arr.length - 1; i >= 0; i--) {
      const b = arr[i];
      b.t += dt;
      if (b.t < 0) continue;
      const leaving = b.t > b.life;
      let speed;
      if (b.k === 'ant') {
        speed = b.sp;
        const honey = !leaving && nearestHoney(b.x, b.y, 380 * SC);
        if (leaving) {
          const ex = b.x < W / 2 ? -40 : W + 40;
          steer(b, Math.atan2(0, ex - b.x), 3, dt);
        } else if (honey) {
          const d = Math.hypot(honey.x - b.x, honey.y - b.y);
          if (d < 12 * SC) { speed *= 0.15; b.h += rnd(-6, 6) * dt; } // eating
          else steer(b, Math.atan2(honey.y - b.y, honey.x - b.x), 4, dt);
        } else if (b.t < 4) {
          steer(b, Math.atan2(b.ty - b.y, b.tx - b.x), 3, dt);
        }
        b.h += rnd(-2.5, 2.5) * dt;
      } else { // roach: sprint / freeze, flee from fingers
        let flee = null;
        for (const p of pointers.values()) if (Math.hypot(p.x - b.x, p.y - b.y) < 150 * SC) flee = p;
        if (flee) { b.pause = 0; b.run = 0.6; steer(b, Math.atan2(b.y - flee.y, b.x - flee.x), 14, dt); }
        if (b.pause > 0) { b.pause -= dt; speed = 0; b.ph += dt * 2; }
        else {
          b.run -= dt;
          if (b.run <= 0) { b.pause = rnd(0.3, 1.4); b.run = rnd(0.4, 1.3); b.h += rnd(-1.5, 1.5); }
          speed = (flee ? 380 : 230) * SC;
          if (leaving) steer(b, Math.atan2(0, (b.x < W / 2 ? -60 : W + 60) - b.x), 5, dt);
          else if (b.t < 2) steer(b, Math.atan2(b.ty - b.y, b.tx - b.x), 5, dt);
          b.h += rnd(-3, 3) * dt;
        }
      }
      b.x += Math.cos(b.h) * speed * dt; b.y += Math.sin(b.h) * speed * dt;
      b.ph += speed * dt * (b.k === 'ant' ? 0.5 : 0.15);
      // stay on screen until it is time to leave
      if (!leaving) {
        const m = 15 * SC;
        if (b.x < m || b.x > W - m || b.y < m || b.y > H - m) steer(b, Math.atan2(H / 2 - b.y, W / 2 - b.x), 6, dt);
      } else if (offscreen(b.x, b.y, 60)) { arr.splice(i, 1); }
    }
  }
  // top-down photos; a small side-to-side sway at stride frequency sells the walk
  function drawAnt(ctx, b) {
    const sway = Math.sin(b.ph * 1.3) * 0.07;
    drawSprite(ctx, 'ant', b.x, b.y, 30 * SC, b.h + sway, { head: 0, shadow: [1.5 * SC, 2.5 * SC, 0.35] });
  }
  function drawRoach(ctx, b) {
    const sway = b.pause > 0 ? 0 : Math.sin(b.ph * 2) * 0.05;
    drawSprite(ctx, 'roach', b.x, b.y, 46 * SC, b.h + sway, { head: Math.PI, shadow: [2 * SC, 3 * SC, 0.4] });
  }
  function squash(b, quiet) {
    const big = b.k === 'roach';
    const len = (big ? 46 : 30) * SC;
    const r = len * 0.32;
    // body fluids first, then the flattened insect on top
    mctx.fillStyle = big ? 'rgba(170,160,95,0.55)' : 'rgba(60,45,25,0.45)';
    mctx.beginPath();
    for (let i = 0; i <= 18; i++) {
      const a = (i / 18) * TAU, rr = r * rnd(0.6, 1.5);
      i ? mctx.lineTo(b.x + Math.cos(a) * rr, b.y + Math.sin(a) * rr) : mctx.moveTo(b.x + Math.cos(a) * rr, b.y + Math.sin(a) * rr);
    }
    mctx.fill();
    drawSprite(mctx, big ? 'roach' : 'ant', b.x, b.y, len * 1.05, b.h + rnd(-0.3, 0.3),
      { head: big ? Math.PI : 0, sy: 1.25, sx: 0.92, filter: 'brightness(0.55) saturate(0.7) contrast(1.2)', alpha: 0.95 });
    mctx.fillStyle = big ? 'rgba(200,190,120,0.5)' : 'rgba(40,30,20,0.5)';
    for (let i = 0; i < 7; i++) {
      const a = rnd(0, TAU), d = r * rnd(1.1, 2.2);
      mctx.beginPath(); mctx.arc(b.x + Math.cos(a) * d, b.y + Math.sin(a) * d, rnd(0.8, 2.2) * SC, 0, TAU); mctx.fill();
    }
    if (!quiet) { Sound.crunch(); Host.vibrate(big ? 40 : 20); }
  }

  // ---------- BEES ----------
  const bees = [];
  let redFlash = 0, buzzOn = false;
  function spawnBees(tx, ty) {
    for (let i = 0; i < 3; i++) {
      if (bees.length >= 20) break;
      const e = edgePoint();
      bees.push({ x: e.x, y: e.y, vx: 0, vy: 0, tx: tx + rnd(-60, 60) * SC, ty: ty + rnd(-60, 60) * SC, retarget: rnd(1, 2), t: 0, life: rnd(22, 32), ph: rnd(0, TAU) });
    }
  }
  function updateBees(dt) {
    for (let i = bees.length - 1; i >= 0; i--) {
      const b = bees[i];
      b.t += dt; b.ph += dt;
      b.retarget -= dt;
      const leaving = b.t > b.life;
      if (leaving) { b.tx = b.x < W / 2 ? -100 : W + 100; b.ty = b.y - 100; }
      else if (b.retarget <= 0) {
        b.retarget = rnd(0.8, 2);
        const honey = honeySpots.length && honeySpots[rint(0, honeySpots.length - 1)];
        if (honey && Math.random() < 0.7) { b.tx = honey.x + rnd(-25, 25) * SC; b.ty = honey.y - rnd(10, 40) * SC; }
        else { b.tx = rnd(W * 0.1, W * 0.9); b.ty = rnd(H * 0.1, H * 0.8); }
      }
      const ax = (b.tx - b.x) * 2.2 + rnd(-900, 900) * SC, ay = (b.ty - b.y) * 2.2 + rnd(-900, 900) * SC;
      b.vx = (b.vx + ax * dt) * Math.pow(0.25, dt); b.vy = (b.vy + ay * dt) * Math.pow(0.25, dt);
      const sp = Math.hypot(b.vx, b.vy), max = 320 * SC;
      if (sp > max) { b.vx *= max / sp; b.vy *= max / sp; }
      b.x += b.vx * dt; b.y += b.vy * dt;
      if (leaving && offscreen(b.x, b.y, 50)) bees.splice(i, 1);
    }
    if (bees.length || buzzOn) { Sound.buzz(bees.length); buzzOn = bees.length > 0; }
  }
  // bee flies above the glass: big soft offset shadow, wing shimmer, heading follows velocity
  function drawBee(ctx, b, dead) {
    if (!dead) {
      const want = Math.atan2(b.vy, b.vx);
      b.rot = b.rot === undefined ? want : b.rot + angDiff(b.rot, want) * 0.15;
    }
    const lift = dead ? 2 : 16;
    const y = b.y + (dead ? 0 : Math.sin(b.ph * 7) * 2 * SC);
    drawSprite(ctx, 'bee', b.x, y, 44 * SC, b.rot, { head: 0, shadow: [lift * 0.6 * SC, lift * SC, dead ? 0.35 : 0.18] });
    if (!dead) {
      // motion-blurred wings: faint copies jittering a few degrees
      drawSprite(ctx, 'bee', b.x, y, 44 * SC, b.rot + rnd(-0.07, 0.07), { head: 0, alpha: 0.28 });
    }
  }
  function sting(b) {
    const x = b.x, y = b.y;
    const r = 30 * SC;
    // a raised, reddish welt on the glass with the stinger left in it
    const g = mctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, 'rgba(230,70,70,0.45)'); g.addColorStop(0.55, 'rgba(240,110,110,0.22)'); g.addColorStop(1, 'rgba(240,130,130,0)');
    mctx.fillStyle = g; mctx.beginPath(); mctx.arc(x, y, r, 0, TAU); mctx.fill();
    const hl = mctx.createRadialGradient(x - 5 * SC, y - 6 * SC, 0, x - 5 * SC, y - 6 * SC, 10 * SC);
    hl.addColorStop(0, 'rgba(255,255,255,0.35)'); hl.addColorStop(1, 'rgba(255,255,255,0)');
    mctx.fillStyle = hl; mctx.beginPath(); mctx.arc(x - 5 * SC, y - 6 * SC, 10 * SC, 0, TAU); mctx.fill();
    mctx.strokeStyle = '#2a1a10'; mctx.lineWidth = 1.2 * SC;
    mctx.beginPath(); mctx.moveTo(x, y); mctx.lineTo(x + 3 * SC, y - 4 * SC); mctx.stroke();
    redFlash = 1;
    addParticle({ k: 'deadbee', x, y, vx: rnd(-40, 40), vy: -60, rot: b.rot || 0, vr: rnd(-8, 8), life: 1.6, age: 0, s: 1, ph: 0 });
    shake = Math.max(shake, 8);
    Sound.sting(); Host.vibrate(150);
  }

  // ---------- SHEEP ----------
  const sheep = [];
  function spawnSheep(tx, ty) {
    const fromLeft = tx > W / 2;
    const w = 170 * SC, h = w * (SPR.sheep.naturalHeight || 500) / (SPR.sheep.naturalWidth || 640);
    sheep.push({ x: fromLeft ? -w : W + w, y: ty, tx, dir: fromLeft ? 1 : -1, state: 'in', t: 0, step: 0, w, h });
  }
  const flies = [];
  function poop(x, y) {
    const r = 6 * SC;
    const heap = [[0, 0], [-1.6, 0.2], [1.6, 0.1], [-0.8, -1.3], [0.8, -1.3], [0, -2.5], [-2.8, 0.6], [2.7, 0.5], [-1.9, -0.9]];
    for (const [hx, hy] of heap) {
      const px = x + hx * r * 1.1 + rnd(-1, 1), py = y + hy * r * 1.05 + rnd(-1, 1), rr = r * rnd(0.8, 1.1);
      // contact shadow, moist dark body, a little sheen
      mctx.fillStyle = 'rgba(0,0,0,0.25)'; mctx.beginPath(); mctx.ellipse(px + 1, py + rr * 0.6, rr * 1.05, rr * 0.45, 0, 0, TAU); mctx.fill();
      const g = mctx.createRadialGradient(px - rr * 0.35, py - rr * 0.4, rr * 0.05, px, py, rr);
      g.addColorStop(0, '#6b5238'); g.addColorStop(0.45, '#3e2c1a'); g.addColorStop(1, '#1d140b');
      mctx.fillStyle = g; mctx.beginPath(); mctx.ellipse(px, py, rr, rr * 0.9, rnd(-0.5, 0.5), 0, TAU); mctx.fill();
      const hg = mctx.createRadialGradient(px - rr * 0.35, py - rr * 0.45, 0, px - rr * 0.35, py - rr * 0.45, rr * 0.35);
      hg.addColorStop(0, 'rgba(255,240,215,0.55)'); hg.addColorStop(1, 'rgba(255,240,215,0)');
      mctx.fillStyle = hg; mctx.beginPath(); mctx.arc(px - rr * 0.35, py - rr * 0.45, rr * 0.35, 0, TAU); mctx.fill();
    }
    // a couple of house flies find it straight away
    for (let i = 0; i < 2; i++) flies.push({ cx: x, cy: y - 6 * SC, x: x + rnd(-200, 200) * SC, y: y - rnd(100, 250) * SC, vx: 0, vy: 0, t: 0, life: rnd(7, 10), land: 0 });
    Sound.plop(); Host.vibrate(30);
  }
  function updateSheep(dt) {
    for (let i = sheep.length - 1; i >= 0; i--) {
      const s = sheep[i];
      s.t += dt;
      if (s.state === 'in') {
        // ease into a stop instead of halting dead
        const left = Math.abs(s.tx - s.x), v = 85 * SC * Math.min(1, 0.25 + left / (60 * SC));
        s.x += s.dir * v * dt; s.step += dt * v / (85 * SC);
        if (left < 2 * SC) { s.state = 'stop'; s.t = 0; Sound.baa(); }
      } else if (s.state === 'stop') {
        if (s.t > 1.1 && !s.pooped) { s.pooped = true; poop(s.x - s.dir * s.w * 0.33, s.y + s.h * 0.4); }
        if (s.t > 2.3) { s.state = 'out'; s.t = 0; if (Math.random() < 0.5) Sound.baa(); }
      } else {
        const v = 90 * SC * Math.min(1, 0.3 + s.t * 1.2);
        s.x += s.dir * v * dt; s.step += dt * v / (85 * SC);
        if (offscreen(s.x, s.y, s.w)) sheep.splice(i, 1);
      }
    }
    for (let i = flies.length - 1; i >= 0; i--) {
      const f = flies[i]; f.t += dt;
      const leaving = f.t > f.life;
      if (f.land > 0) { f.land -= dt; if (f.land <= 0) { f.vx = rnd(-200, 200) * SC; f.vy = rnd(-200, -50) * SC; } continue; }
      const tx = leaving ? f.cx + 800 * SC : f.cx + Math.cos(f.t * 3.1) * 30 * SC, ty = leaving ? f.cy - 900 * SC : f.cy - 18 * SC + Math.sin(f.t * 4.3) * 16 * SC;
      f.vx = (f.vx + ((tx - f.x) * 6 + rnd(-1500, 1500) * SC) * dt) * Math.pow(0.15, dt);
      f.vy = (f.vy + ((ty - f.y) * 6 + rnd(-1500, 1500) * SC) * dt) * Math.pow(0.15, dt);
      f.x += f.vx * dt; f.y += f.vy * dt;
      if (!leaving && Math.random() < dt * 0.5 && Math.hypot(f.x - f.cx, f.y - f.cy) < 20 * SC) f.land = rnd(0.6, 1.5);
      if (leaving && offscreen(f.x, f.y, 40)) flies.splice(i, 1);
    }
  }
  // side-view photo, legs animated by shearing the lower strips: front and hind
  // legs swing in opposite phase, the body rises and falls with each step
  function drawSheep(s) {
    if (!ok('sheep')) return;
    const im = SPR.sheep, iw = im.naturalWidth, ih = im.naturalHeight;
    const w = s.w, h = s.h;
    const walking = s.state !== 'stop';
    const ph = s.step * 9;
    const bob = walking ? -Math.abs(Math.sin(ph)) * 2.5 * SC : 0;
    const swing = walking ? Math.sin(ph) * w * 0.045 : 0;
    // soft ground shadow
    const g = fctx.createRadialGradient(s.x, s.y + h * 0.48, 0, s.x, s.y + h * 0.48, w * 0.45);
    g.addColorStop(0, 'rgba(0,0,0,0.32)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    fctx.fillStyle = g; fctx.beginPath(); fctx.ellipse(s.x, s.y + h * 0.48, w * 0.45, h * 0.09, 0, 0, TAU); fctx.fill();
    fctx.save();
    fctx.translate(s.x, s.y + bob);
    if (s.dir > 0) fctx.scale(-1, 1); // photo faces left
    // a slight squat while doing its business
    if (s.state === 'stop' && s.t > 0.6 && s.t < 1.6) { fctx.translate(w * 0.3, h * 0.5); fctx.rotate(-0.03); fctx.translate(-w * 0.3, -h * 0.5); }
    const legTop = 0.6, N = 10;
    fctx.drawImage(im, 0, 0, iw, ih * legTop, -w / 2, -h / 2, w, h * legTop);
    for (let k = 0; k < N; k++) {
      const f0 = legTop + (1 - legTop) * k / N, f1 = legTop + (1 - legTop) * (k + 1) / N;
      const depth = (k + 0.5) / N;
      const sy0 = ih * f0, sh = ih * (f1 - f0) + 0.5, dy = -h / 2 + h * f0, dh = h * (f1 - f0) + 0.5;
      // image left half = front legs (head is on the left), right half = hind legs
      fctx.drawImage(im, 0, sy0, iw / 2, sh, -w / 2 + swing * depth, dy, w / 2, dh);
      fctx.drawImage(im, iw / 2, sy0, iw / 2, sh, swing * -depth, dy, w / 2, dh);
    }
    fctx.restore();
  }
  function drawFly(f) {
    const flying = f.land <= 0;
    drawSprite(fctx, 'fly', f.x + (flying ? rnd(-1, 1) : 0), f.y, 20 * SC, 0,
      { flip: f.vx > 0, shadow: flying ? [6 * SC, 14 * SC, 0.15] : [1, 2, 0.3] });
  }

  // ---------- COW (charges and headbutts the glass) ----------
  const cows = [];
  const COW_T = 0.85; // seconds to reach the glass
  function spawnCow(x, y) {
    cows.push({ x, y, t: 0, phase: 'charge', hoof: 0 });
    Sound.moo();
  }
  function cowSize() {
    const w = Math.min(W * 0.9, 430 * SC);
    return { w, h: w * (SPR.cow.naturalHeight || 592) / (SPR.cow.naturalWidth || 424) };
  }
  function updateCows(dt) {
    for (let i = cows.length - 1; i >= 0; i--) {
      const c = cows[i];
      c.t += dt;
      if (c.phase === 'charge') {
        c.hoof -= dt;
        if (c.hoof <= 0) { c.hoof = 0.16; Sound.hoof(c.t / COW_T); }
        if (c.t >= COW_T) {
          c.phase = 'hit'; c.t = 0;
          const { w, h } = cowSize();
          const L = c.x - w / 2, T = c.y - h / 2;
          for (const [hx, hy] of [[0.04, 0.06], [0.9, 0.03]]) {
            const px = L + hx * w, py = T + hy * h;
            glassCrack(px, py, 1.4);
            mctx.fillStyle = 'rgba(8,8,8,0.9)'; mctx.beginPath(); mctx.arc(px, py, 6 * SC, 0, TAU); mctx.fill();
          }
          // wet nose print on the glass
          const nx = L + 0.37 * w, ny = T + 0.56 * h, nr = w * 0.12;
          const g = mctx.createRadialGradient(nx, ny, nr * 0.2, nx, ny, nr);
          g.addColorStop(0, 'rgba(235,240,245,0.10)'); g.addColorStop(0.7, 'rgba(235,240,245,0.22)'); g.addColorStop(1, 'rgba(235,240,245,0)');
          mctx.fillStyle = g; mctx.beginPath(); mctx.ellipse(nx, ny, nr * 1.2, nr, 0, 0, TAU); mctx.fill();
          for (let k = 0; k < 4; k++) {
            mctx.strokeStyle = 'rgba(235,240,245,0.18)'; mctx.lineWidth = rnd(2, 4) * SC; mctx.lineCap = 'round';
            const sx = nx + rnd(-nr, nr) * 0.7; mctx.beginPath(); mctx.moveTo(sx, ny + nr * 0.5); mctx.lineTo(sx + rnd(-3, 3), ny + nr * 0.5 + rnd(20, 70) * SC); mctx.stroke();
          }
          for (let k = 0; k < 30; k++) addParticle({ k: 'dust', x: c.x + rnd(-w, w) * 0.5, y: T + h * rnd(0.85, 1.05), vx: rnd(-120, 120), vy: rnd(-80, 10), life: rnd(0.8, 1.6), age: 0, s: rnd(10, 22) * SC });
          shake = Math.max(shake, 30);
          Sound.crack(); Sound.explosion(false); Host.vibrate(350);
        }
      } else if (c.phase === 'hit' && c.t >= 0.9) {
        c.phase = 'leave'; c.t = 0; Sound.moo();
      } else if (c.phase === 'leave' && c.t >= 1.3) {
        cows.splice(i, 1);
      }
    }
  }
  function drawCow(c) {
    if (!ok('cow')) return;
    const { w } = cowSize();
    let s, x = c.x, y = c.y, alpha = 1, rot = 0;
    if (c.phase === 'charge') {
      const k = c.t / COW_T;
      s = 0.08 + 0.92 * Math.pow(k, 2.3);          // perspective: accelerates as it approaches
      y = c.y - (1 - k) * H * 0.18 + Math.abs(Math.sin(c.t * 15)) * -8 * SC * s; // gallop bob
      rot = Math.sin(c.t * 15) * 0.03;
      if (k > 0.55) {                               // zoom blur at full speed
        for (let i = 3; i >= 1; i--) drawSprite(fctx, 'cow', x, y, w * s * (1 - 0.05 * i), rot, { alpha: 0.18 });
      }
    } else if (c.phase === 'hit') {
      const k = c.t / 0.9;
      s = 1.03 - 0.12 * Math.min(1, k * 3);         // squash into the glass, then recoil
      rot = Math.sin(c.t * 18) * 0.04 * (1 - k);    // shakes its head
      x = c.x + Math.sin(c.t * 40) * 3 * SC * (1 - k);
    } else {
      const k = c.t / 1.3;
      s = 0.91 - 0.75 * k * k; alpha = 1 - k * k;   // backs off into the distance
      y = c.y - k * H * 0.15;
    }
    drawSprite(fctx, 'cow', x, y, w * s, rot, { alpha, sy: c.phase === 'hit' && c.t < 0.1 ? 0.97 : 1 });
  }

  // hit-test living things under a finger (works with any tool)
  function hitCreature(x, y) {
    for (let i = bees.length - 1; i >= 0; i--) {
      if (Math.hypot(bees[i].x - x, bees[i].y - y) < 24 * SC) { sting(bees[i]); bees.splice(i, 1); return true; }
    }
    let hit = false;
    for (const arr of [roaches, ants]) {
      const rad = (arr === roaches ? 26 : 16) * SC;
      for (let i = arr.length - 1; i >= 0; i--) {
        const b = arr[i];
        if (b.t >= 0 && Math.hypot(b.x - x, b.y - y) < rad) { squash(b); arr.splice(i, 1); hit = true; }
      }
    }
    return hit;
  }

  function updateNewStuff(dt) {
    updateDrips(dt);
    updateWalkers(ants, dt);
    updateWalkers(roaches, dt);
    updateBees(dt);
    updateSheep(dt);
    updateCows(dt);
    for (let i = rockets.length - 1; i >= 0; i--) {
      const r = rockets[i]; r.t += dt;
      const k = Math.min(1, r.t / r.dur), e = k * k;
      const x = r.x0 + (r.x1 - r.x0) * e, y = r.y0 + (r.y1 - r.y0) * e;
      r.ang = Math.atan2(r.y1 - r.y0, r.x1 - r.x0);
      r.x = x; r.y = y;
      addParticle({ k: 'smoke', x: x - Math.cos(r.ang) * 80 * SC, y: y - Math.sin(r.ang) * 80 * SC, vx: rnd(-20, 20), vy: rnd(-20, 20), life: rnd(0.8, 1.5), age: 0, s: rnd(6, 12) * SC });
      if (k >= 1) { rockets.splice(i, 1); nukeExplode(r.x1, r.y1); }
    }
    for (let i = mushrooms.length - 1; i >= 0; i--) { mushrooms[i].t += dt; if (mushrooms[i].t >= mushrooms[i].life) mushrooms.splice(i, 1); }
    whiteout = Math.max(0, whiteout - dt / 1.6);
    redFlash = Math.max(0, redFlash - dt / 0.6);
  }
  function drawNewStuff(now) {
    for (const m of mushrooms) drawMushroom(m);
    for (const b of ants) if (b.t >= 0) drawAnt(fctx, b);
    for (const b of roaches) if (b.t >= 0) drawRoach(fctx, b);
    for (const s of sheep) drawSheep(s);
    for (const f of flies) drawFly(f);
    for (const b of bees) drawBee(fctx, b);
    for (const c of cows) drawCow(c);
    for (const r of rockets) if (r.x !== undefined) drawMissile(r);
    for (const p of pointers.values()) if (tool === 'saw') drawChainsaw(fctx, p.x, p.y, p.ang ?? -Math.PI / 4);
  }
  function drawScreenFlashes() {
    if (whiteout > 0) { fctx.fillStyle = `rgba(255,252,235,${Math.min(1, whiteout * 1.3)})`; fctx.fillRect(0, 0, W, H); }
    if (redFlash > 0) {
      const g = fctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.2, W / 2, H / 2, Math.hypot(W, H) * 0.6);
      g.addColorStop(0, 'rgba(255,0,0,0)'); g.addColorStop(1, `rgba(220,0,0,${0.55 * redFlash})`);
      fctx.fillStyle = g; fctx.fillRect(0, 0, W, H);
    }
  }
  function clearNewStuff() {
    for (const a of [rockets, mushrooms, honeySpots, drips, ants, roaches, bees, sheep, flies, cows]) a.length = 0;
    whiteout = 0; redFlash = 0;
  }

  // ---------- input ----------
  let tool = 'dart';
  const pointers = new Map(); // id -> {x,y,lastShot,lx,ly,ang}
  let flameStop = null;

  fxC.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    Sound.unlock();
    try { fxC.setPointerCapture(e.pointerId); } catch (_) {}
    const x = e.clientX, y = e.clientY;
    pointers.set(e.pointerId, { x, y, lastShot: 0, lx: x, ly: y, ang: -Math.PI / 4 });
    // squash / get stung first — works with every tool
    if (tool !== 'saw' && tool !== 'flame' && hitCreature(x, y)) return;
    switch (tool) {
      case 'dart': throwDart(x, y); break;
      case 'hammer': hammer(x, y); break;
      case 'gun': bulletHole(x, y); pointers.get(e.pointerId).lastShot = performance.now(); break;
      case 'saw': if (!sawSound) sawSound = Sound.sawStart(); break;
      case 'bomb': placeBomb(x, y); break;
      case 'flame': lastBurn = null; if (!flameStop) flameStop = Sound.flameStart(); break;
      case 'nuke': launchNuke(x, y); break;
      case 'sheep': spawnSheep(x, y); break;
      case 'cow': spawnCow(x, y); break;
      case 'ant': spawnAnts(x, y); break;
      case 'roach': spawnRoaches(x, y); break;
      case 'bee': spawnBees(x, y); break;
      case 'honey': lastHoney = null; pourHoney(x, y); Sound.goo(); break;
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
    if (pointers.size === 0 && sawSound) { sawSound.stop(); sawSound = null; }
  }
  fxC.addEventListener('pointerup', endPointer);
  fxC.addEventListener('pointercancel', endPointer);
  fxC.addEventListener('contextmenu', (e) => e.preventDefault());

  // ---------- UI ----------
  const TOOLS = [
    { id: 'dart',   icon: '🎯', label: 'دارت',      cat: 'weapons' },
    { id: 'hammer', icon: '🔨', label: 'چکش',      cat: 'weapons' },
    { id: 'gun',    icon: '🔫', label: 'مسلسل',     cat: 'weapons' },
    { id: 'saw',    icon: '🪚', label: 'اره‌برقی',  cat: 'weapons' },
    { id: 'bomb',   icon: '💣', label: 'بمب',       cat: 'boom' },
    { id: 'flame',  icon: '🔥', label: 'شعله',      cat: 'boom' },
    { id: 'nuke',   icon: '☢️', label: 'موشک اتم',  cat: 'boom' },
    { id: 'sheep',  icon: '🐑', label: 'گوسفند',    cat: 'animals' },
    { id: 'cow',    icon: '🐄', label: 'گاو',       cat: 'animals' },
    { id: 'ant',    icon: '🐜', label: 'مورچه',     cat: 'bugs' },
    { id: 'roach',  icon: '🪳', label: 'سوسک',      cat: 'bugs' },
    { id: 'bee',    icon: '🐝', label: 'زنبور',     cat: 'bugs' },
    { id: 'honey',  icon: '🍯', label: 'عسل',       cat: 'bugs' },
  ];
  const toolbar = document.getElementById('toolbar');
  const btnShow = document.getElementById('btn-show');
  const toolsBox = document.getElementById('tools');
  let cat = 'weapons';
  function renderTools() {
    toolsBox.innerHTML = '';
    for (const t of TOOLS.filter((t) => t.cat === cat)) {
      const b = document.createElement('button');
      b.className = 'tool' + (t.id === tool ? ' active' : '');
      b.dataset.tool = t.id; b.title = t.label;
      b.innerHTML = `<span>${t.icon}</span><small>${t.label}</small>`;
      b.addEventListener('click', () => selectTool(t.id));
      toolsBox.appendChild(b);
    }
    document.querySelectorAll('.cat').forEach((c) => c.classList.toggle('active', c.dataset.cat === cat));
  }
  function selectTool(id) {
    const t = TOOLS.find((x) => x.id === id);
    if (!t) return;
    tool = id; cat = t.cat;
    renderTools();
  }
  document.querySelectorAll('.cat').forEach((c) => c.addEventListener('click', () => {
    cat = c.dataset.cat;
    // jump to the first tool of the category unless the current tool already lives there
    if ((TOOLS.find((x) => x.id === tool) || {}).cat !== cat) tool = TOOLS.find((x) => x.cat === cat).id;
    renderTools();
  }));
  renderTools();

  document.getElementById('btn-clear').addEventListener('click', clearAll);
  document.getElementById('btn-close').addEventListener('click', () => Host.close());
  const btnSound = document.getElementById('btn-sound');
  btnSound.addEventListener('click', () => {
    Sound.setEnabled(!Sound.enabled);
    if (!Sound.enabled) Sound.buzz(0);
    btnSound.firstElementChild.textContent = Sound.enabled ? '🔊' : '🔇';
  });
  document.getElementById('btn-hide').addEventListener('click', () => { toolbar.classList.add('hidden'); btnShow.hidden = false; });
  btnShow.addEventListener('click', () => { toolbar.classList.remove('hidden'); btnShow.hidden = true; });
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') Host.close();
    const i = '1234567890qwe'.indexOf(e.key.toLowerCase());
    if (i >= 0 && TOOLS[i]) selectTool(TOOLS[i].id);
    if (e.key === 'c' || e.key === 'C') clearAll();
  });

  function clearAll() {
    mctx.save(); mctx.setTransform(1, 0, 0, 1, 0, 0); mctx.clearRect(0, 0, marksC.width, marksC.height); mctx.restore();
    particles.length = 0; stuckDarts.length = 0; flyingDarts.length = 0; bombs.length = 0; rings.length = 0; flashes.length = 0;
    clearNewStuff();
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
      } else if (tool === 'saw') {
        const d = Math.hypot(p.x - p.lx, p.y - p.ly);
        if (d > 2) {
          p.ang = Math.atan2(p.y - p.ly, p.x - p.lx);
          sawCut(p.lx, p.ly, p.x, p.y);
          p.lx = p.x; p.ly = p.y;
          if (now - p.lastShot > 110) { p.lastShot = now; Host.vibrate(25); }
        }
        if (sawSound) sawSound.set(Math.min(1, d / (12 * SC)));
      } else if (tool === 'honey') {
        pourHoney(p.x, p.y);
      }
    }
    updateNewStuff(dt);

    // screen shake (on the whole stage so damage shakes too)
    shake *= Math.pow(0.002, dt);
    const stage = document.getElementById('stage');
    if (shake > 0.4) stage.style.transform = `translate(${rnd(-shake, shake)}px, ${rnd(-shake, shake)}px)`;
    else if (stage.style.transform) stage.style.transform = '';

    fctx.clearRect(0, 0, W, H);
    drawNewStuff(now);

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
        if (p.k === 'deadbee') { /* handled when drawn */ }
        else if (p.k === 'debris' || p.k === 'shard') { p.vy += 1100 * dt; p.rot += p.vr * dt; }
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
        case 'dust': {
          const r = p.s * (1 + t * 1.5);
          const g = fctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r);
          g.addColorStop(0, `rgba(190,180,165,${0.35 * (1 - t)})`); g.addColorStop(1, 'rgba(190,180,165,0)');
          fctx.fillStyle = g; fctx.beginPath(); fctx.arc(p.x, p.y, r, 0, TAU); fctx.fill();
          break;
        }
        case 'deadbee': {
          p.vy += 600 * dt; p.rot += p.vr * dt;
          drawBee(fctx, { x: p.x, y: p.y, rot: p.rot, ph: 0 }, true);
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

    drawScreenFlashes();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  // small API for tests / hosts
  window.Destroyer = {
    setTool: (t) => selectTool(t),
    tools: () => TOOLS.map((t) => t.id),
    creatures: () => ({ ants: ants.filter((b) => b.t > 0).map((b) => [b.x, b.y]), roaches: roaches.filter((b) => b.t > 0).map((b) => [b.x, b.y]), bees: bees.map((b) => [b.x, b.y]) }),
    clear: clearAll,
    explode: (x, y, big) => explode(x, y, !!big),
  };
})();
