(() => {
  'use strict';

  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');

  const ui = {
    overlay: document.getElementById('overlay'),
    zenOverlay: document.getElementById('zen-overlay'),
    startBtn: document.getElementById('start-btn'),
    againBtn: document.getElementById('again-btn'),
    score: document.getElementById('score'),
    combo: document.getElementById('combo'),
    stressBar: document.getElementById('stress-bar'),
    stressPct: document.getElementById('stress-pct'),
    finalScore: document.getElementById('final-score'),
    kickHint: document.getElementById('kick-hint'),
  };

  let W = 0;
  let H = 0;
  let dpr = 1;
  let running = false;
  let zenMode = false;
  let lastTime = 0;
  let shake = 0;
  let score = 0;
  let combo = 1;
  let comboTimer = 0;
  let stress = 100;
  let spawnTimer = 0;
  let kickCount = 0;

  const MAX_ACTIVE = 6;
  const MAX_TOTAL = 24;

  const babies = [];
  const particles = [];
  const popups = [];
  const kicks = [];

  const BABY_COLORS = [
    { body: '#ffd8a8', cheek: '#ff8787' },
    { body: '#ffc9c9', cheek: '#ff6b6b' },
    { body: '#b2f2bb', cheek: '#69db7c' },
    { body: '#a5d8ff', cheek: '#4dabf7' },
    { body: '#eebefa', cheek: '#da77f2' },
    { body: '#fff3bf', cheek: '#ffd43b' },
  ];

  const KICK_WORDS = ['BOOT!', 'YEET!', 'OOF!', 'BYE!', 'WHEEE!', 'POW!', 'SPLAT!', 'PEACE!'];

  // ── Audio ──────────────────────────────────────────────
  let audioCtx = null;

  function ensureAudio() {
    if (!audioCtx) {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (audioCtx.state === 'suspended') audioCtx.resume();
  }

  function playKickSound(power) {
    if (!audioCtx) return;
    const t = audioCtx.currentTime;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.type = 'square';
    osc.frequency.setValueAtTime(180 + power * 0.3, t);
    osc.frequency.exponentialRampToValueAtTime(60, t + 0.12);
    gain.gain.setValueAtTime(0.08, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
    osc.start(t);
    osc.stop(t + 0.15);
  }

  function playSpawnSound() {
    if (!audioCtx) return;
    const t = audioCtx.currentTime;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.type = 'sine';
    osc.frequency.setValueAtTime(400, t);
    osc.frequency.exponentialRampToValueAtTime(600, t + 0.08);
    gain.gain.setValueAtTime(0.04, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
    osc.start(t);
    osc.stop(t + 0.1);
  }

  function playZenSound() {
    if (!audioCtx) return;
    const t = audioCtx.currentTime;
    [261.63, 329.63, 392.0, 523.25].forEach((freq, i) => {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.type = 'sine';
      osc.frequency.value = freq;
      const start = t + i * 0.12;
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(0.06, start + 0.05);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.6);
      osc.start(start);
      osc.stop(start + 0.6);
    });
  }

  // ── Resize ─────────────────────────────────────────────
  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = window.innerWidth;
    H = window.innerHeight;
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    canvas.style.width = W + 'px';
    canvas.style.height = H + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  window.addEventListener('resize', resize);
  resize();

  // ── Baby entity ────────────────────────────────────────
  function createBaby() {
    const scale = Math.min(W, H) / 400;
    const r = (28 + Math.random() * 14) * Math.max(0.85, Math.min(scale, 1.3));
    const margin = r + 20;
    const color = BABY_COLORS[Math.floor(Math.random() * BABY_COLORS.length)];
    const side = Math.floor(Math.random() * 4);
    let x, y, vx, vy;

    const speed = 1.2 + Math.random() * 1.8;
    if (side === 0) { x = margin; y = Math.random() * H; vx = speed; vy = (Math.random() - 0.5) * 2; }
    else if (side === 1) { x = W - margin; y = Math.random() * H; vx = -speed; vy = (Math.random() - 0.5) * 2; }
    else if (side === 2) { x = Math.random() * W; y = margin; vx = (Math.random() - 0.5) * 2; vy = speed; }
    else { x = Math.random() * W; y = H - margin; vx = (Math.random() - 0.5) * 2; vy = -speed; }

    return {
      x, y, vx, vy, r,
      color,
      wobble: Math.random() * Math.PI * 2,
      spin: 0,
      kicked: false,
      face: Math.random() > 0.5 ? 'happy' : 'surprised',
    };
  }

  function spawnBaby() {
    babies.push(createBaby());
    if (babies.length === 1) playSpawnSound();
  }

  // ── Particles & popups ─────────────────────────────────
  function burst(x, y, color, count = 12) {
    for (let i = 0; i < count; i++) {
      const angle = (Math.PI * 2 * i) / count + Math.random() * 0.5;
      const speed = 3 + Math.random() * 6;
      particles.push({
        x, y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 1,
        decay: 0.02 + Math.random() * 0.02,
        r: 3 + Math.random() * 5,
        color,
      });
    }
  }

  function popup(x, y, text, color = '#ffd43b') {
    popups.push({ x, y, text, color, life: 1, vy: -2.5 });
  }

  // ── Kick detection ─────────────────────────────────────
  function lineCircleHit(x1, y1, x2, y2, cx, cy, r) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const lenSq = dx * dx + dy * dy;
    if (lenSq === 0) {
      const d = Math.hypot(cx - x1, cy - y1);
      return d <= r ? { hit: true, t: 0 } : { hit: false };
    }
    let t = ((cx - x1) * dx + (cy - y1) * dy) / lenSq;
    t = Math.max(0, Math.min(1, t));
    const px = x1 + t * dx;
    const py = y1 + t * dy;
    const dist = Math.hypot(cx - px, cy - py);
    return dist <= r ? { hit: true, t, px, py } : { hit: false };
  }

  function processKick(x1, y1, x2, y2) {
    const len = Math.hypot(x2 - x1, y2 - y1);
    if (len < 18) return;

    const nx = (x2 - x1) / len;
    const ny = (y2 - y1) / len;
    const power = Math.min(len * 0.35, 28);

    kicks.push({ x1, y1, x2, y2, life: 1 });

    let hitAny = false;
    for (const baby of babies) {
      if (baby.kicked) continue;
      const hit = lineCircleHit(x1, y1, x2, y2, baby.x, baby.y, baby.r);
      if (!hit.hit) continue;

      hitAny = true;
      baby.kicked = true;
      baby.vx = nx * power * 1.4;
      baby.vy = ny * power * 1.4;
      baby.spin = (Math.random() > 0.5 ? 1 : -1) * (0.2 + power * 0.02);

      const pts = Math.round(50 * combo + power * 3);
      score += pts;
      kickCount++;

      comboTimer = 2.5;
      combo = Math.min(combo + 1, 20);

      stress = Math.max(0, stress - (3 + combo * 0.4));
      shake = Math.min(shake + power * 0.15, 12);

      burst(baby.x, baby.y, baby.color.body, 16);
      popup(baby.x, baby.y - baby.r, KICK_WORDS[Math.floor(Math.random() * KICK_WORDS.length)]);
      popup(baby.x, baby.y - baby.r - 24, `+${pts}`, '#94d82d');
      playKickSound(power);

      if (kickCount >= 3) ui.kickHint.classList.add('hidden');

      window.__babyBootMobile?.vibrate([12, 30, 18]);
    }

    if (!hitAny) {
      combo = 1;
      comboTimer = 0;
    }

    updateHUD();
  }

  // ── Input (Pointer Events — touch + mouse unified) ───
  let activePointer = null;
  let swipeTrail = [];

  function getCoords(e) {
    return { x: e.clientX, y: e.clientY };
  }

  function pointerDown(e) {
    if (!running || e.pointerType === 'mouse' && e.button !== 0) return;
    ensureAudio();
    activePointer = e.pointerId;
    canvas.setPointerCapture(e.pointerId);
    const { x, y } = getCoords(e);
    swipeTrail = [{ x, y }];
  }

  function pointerMove(e) {
    if (!running || activePointer !== e.pointerId || swipeTrail.length === 0) return;
    const { x, y } = getCoords(e);
    const prev = swipeTrail[swipeTrail.length - 1];
    const dist = Math.hypot(x - prev.x, y - prev.y);
    if (dist < 6) return;

    processKick(prev.x, prev.y, x, y);
    swipeTrail.push({ x, y });
    if (swipeTrail.length > 24) swipeTrail.shift();
  }

  function pointerUp(e) {
    if (activePointer !== e.pointerId) return;
    if (swipeTrail.length >= 1) {
      const { x, y } = getCoords(e);
      const prev = swipeTrail[swipeTrail.length - 1];
      if (Math.hypot(x - prev.x, y - prev.y) > 4) {
        processKick(prev.x, prev.y, x, y);
      } else if (swipeTrail.length === 1) {
        processKick(prev.x, prev.y, x + 40, y);
      }
    }
    activePointer = null;
    swipeTrail = [];
    try { canvas.releasePointerCapture(e.pointerId); } catch { /* ok */ }
  }

  canvas.addEventListener('pointerdown', pointerDown);
  canvas.addEventListener('pointermove', pointerMove);
  canvas.addEventListener('pointerup', pointerUp);
  canvas.addEventListener('pointercancel', pointerUp);
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());

  // ── Draw baby ──────────────────────────────────────────
  function drawBaby(b) {
    ctx.save();
    ctx.translate(b.x, b.y);
    ctx.rotate(b.spin);

    const wobble = Math.sin(b.wobble) * 0.08;
    ctx.scale(1 + wobble, 1 - wobble * 0.5);

    // Body
    ctx.beginPath();
    ctx.arc(0, 0, b.r, 0, Math.PI * 2);
    ctx.fillStyle = b.color.body;
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.12)';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Diaper
    ctx.beginPath();
    ctx.arc(0, b.r * 0.35, b.r * 0.72, 0, Math.PI);
    ctx.fillStyle = '#fff';
    ctx.fill();

    // Eyes
    const eyeY = -b.r * 0.15;
    const eyeX = b.r * 0.28;
    const eyeR = b.r * 0.13;

    if (b.kicked) {
      // X eyes when flying
      ctx.strokeStyle = '#333';
      ctx.lineWidth = 2.5;
      ctx.lineCap = 'round';
      [-1, 1].forEach((side) => {
        const ex = side * eyeX;
        ctx.beginPath();
        ctx.moveTo(ex - eyeR * 0.6, eyeY - eyeR * 0.6);
        ctx.lineTo(ex + eyeR * 0.6, eyeY + eyeR * 0.6);
        ctx.moveTo(ex + eyeR * 0.6, eyeY - eyeR * 0.6);
        ctx.lineTo(ex - eyeR * 0.6, eyeY + eyeR * 0.6);
        ctx.stroke();
      });
    } else {
      [-1, 1].forEach((side) => {
        ctx.beginPath();
        ctx.arc(side * eyeX, eyeY, eyeR, 0, Math.PI * 2);
        ctx.fillStyle = '#fff';
        ctx.fill();
        ctx.beginPath();
        ctx.arc(side * eyeX + side * 2, eyeY, eyeR * 0.55, 0, Math.PI * 2);
        ctx.fillStyle = '#222';
        ctx.fill();
      });

      // Mouth
      ctx.beginPath();
      if (b.face === 'happy') {
        ctx.arc(0, b.r * 0.12, b.r * 0.22, 0.1 * Math.PI, 0.9 * Math.PI);
      } else {
        ctx.arc(0, b.r * 0.35, b.r * 0.15, 1.1 * Math.PI, 1.9 * Math.PI);
      }
      ctx.strokeStyle = '#333';
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    // Cheeks
    [-1, 1].forEach((side) => {
      ctx.beginPath();
      ctx.arc(side * b.r * 0.55, b.r * 0.08, b.r * 0.14, 0, Math.PI * 2);
      ctx.fillStyle = b.color.cheek + '88';
      ctx.fill();
    });

    // Tuft of hair
    ctx.beginPath();
    ctx.arc(0, -b.r * 0.85, b.r * 0.18, 0, Math.PI * 2);
    ctx.fillStyle = '#8B6914';
    ctx.fill();

    ctx.restore();
  }

  // ── Background ─────────────────────────────────────────
  function drawBackground(t) {
    const grad = ctx.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, '#1a0a2e');
    grad.addColorStop(0.5, '#2d1b4e');
    grad.addColorStop(1, '#16213e');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);

    // Floating orbs
    for (let i = 0; i < 8; i++) {
      const ox = (Math.sin(t * 0.0003 + i * 1.7) * 0.5 + 0.5) * W;
      const oy = (Math.cos(t * 0.0004 + i * 2.3) * 0.5 + 0.5) * H;
      const or = 40 + i * 15;
      const g = ctx.createRadialGradient(ox, oy, 0, ox, oy, or);
      g.addColorStop(0, `rgba(255, 107, 107, ${0.04 + i * 0.005})`);
      g.addColorStop(1, 'rgba(255, 107, 107, 0)');
      ctx.fillStyle = g;
      ctx.fillRect(ox - or, oy - or, or * 2, or * 2);
    }
  }

  // ── HUD update ───────────────────────────────────────
  function updateHUD() {
    ui.score.textContent = score.toLocaleString();
    ui.combo.textContent = '×' + combo;
    ui.combo.classList.add('bump');
    setTimeout(() => ui.combo.classList.remove('bump'), 150);

    ui.stressBar.style.width = stress + '%';
    ui.stressPct.textContent = Math.round(stress) + '%';
    ui.stressBar.classList.toggle('low', stress < 30);
  }

  // ── Game loop ──────────────────────────────────────────
  function update(dt) {
    if (!running) return;

    spawnTimer -= dt;
    const active = babies.filter((b) => !b.kicked).length;
    const spawnInterval = Math.max(0.8, 2.0 - kickCount * 0.015);

    if (active < MAX_ACTIVE && babies.length < MAX_TOTAL && spawnTimer <= 0) {
      spawnBaby();
      spawnTimer = spawnInterval;
    }

    if (active < 2 && babies.length < MAX_TOTAL) {
      spawnTimer = Math.min(spawnTimer, 0.4);
    }

    comboTimer -= dt;
    if (comboTimer <= 0 && combo > 1) {
      combo = 1;
      updateHUD();
    }

    for (const baby of babies) {
      baby.wobble += dt * 4;
      if (baby.kicked) {
        baby.x += baby.vx;
        baby.y += baby.vy;
        baby.vy += 0.15;
        baby.spin += baby.spin > 0 ? 0.05 : -0.05;
      } else {
        baby.x += baby.vx;
        baby.y += baby.vy;
        if (baby.x - baby.r < 0) { baby.x = baby.r; baby.vx *= -1; }
        if (baby.x + baby.r > W) { baby.x = W - baby.r; baby.vx *= -1; }
        if (baby.y - baby.r < 60) { baby.y = baby.r + 60; baby.vy *= -1; }
        if (baby.y + baby.r > H) { baby.y = H - baby.r; baby.vy *= -1; }
      }
    }

    // Remove off-screen kicked babies
    for (let i = babies.length - 1; i >= 0; i--) {
      const b = babies[i];
      if (b.kicked && (b.x < -100 || b.x > W + 100 || b.y < -100 || b.y > H + 100)) {
        babies.splice(i, 1);
      }
    }

    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.12;
      p.life -= p.decay;
      if (p.life <= 0) particles.splice(i, 1);
    }

    for (let i = popups.length - 1; i >= 0; i--) {
      const p = popups[i];
      p.y += p.vy;
      p.life -= dt * 0.8;
      if (p.life <= 0) popups.splice(i, 1);
    }

    for (let i = kicks.length - 1; i >= 0; i--) {
      kicks[i].life -= dt * 3;
      if (kicks[i].life <= 0) kicks.splice(i, 1);
    }

    shake *= 0.85;

    if (stress <= 0 && !zenMode) {
      zenMode = true;
      stopGame();
      ui.finalScore.textContent = score.toLocaleString();
      ui.zenOverlay.classList.remove('hidden');
      playZenSound();
      window.__babyBootMobile?.vibrate([40, 60, 40, 60, 80]);
    }
  }

  function render() {
    ctx.save();
    if (shake > 0.5) {
      ctx.translate(
        (Math.random() - 0.5) * shake,
        (Math.random() - 0.5) * shake
      );
    }

    drawBackground(performance.now());

    for (const baby of babies) drawBaby(baby);

    for (const p of particles) {
      ctx.globalAlpha = p.life;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r * p.life, 0, Math.PI * 2);
      ctx.fillStyle = p.color;
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    for (const k of kicks) {
      ctx.globalAlpha = k.life * 0.7;
      ctx.strokeStyle = '#ffd43b';
      ctx.lineWidth = window.__babyBootMobile?.isMobile ? 6 : 4;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(k.x1, k.y1);
      ctx.lineTo(k.x2, k.y2);
      ctx.stroke();

      ctx.font = `${window.__babyBootMobile?.isMobile ? 28 : 24}px serif`;
      ctx.fillText('👟', k.x2 - 12, k.y2 + 8);
    }
    ctx.globalAlpha = 1;

    // Live swipe trail while finger is down
    if (swipeTrail.length > 1) {
      ctx.globalAlpha = 0.55;
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = window.__babyBootMobile?.isMobile ? 5 : 3;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.moveTo(swipeTrail[0].x, swipeTrail[0].y);
      for (let i = 1; i < swipeTrail.length; i++) {
        ctx.lineTo(swipeTrail[i].x, swipeTrail[i].y);
      }
      ctx.stroke();
      const last = swipeTrail[swipeTrail.length - 1];
      ctx.globalAlpha = 0.9;
      ctx.font = '28px serif';
      ctx.fillText('👟', last.x - 14, last.y + 10);
      ctx.globalAlpha = 1;
    }

    for (const p of popups) {
      ctx.globalAlpha = Math.min(1, p.life * 2);
      ctx.font = `800 ${16 + (1 - p.life) * 8}px system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillStyle = p.color;
      ctx.strokeStyle = 'rgba(0,0,0,0.4)';
      ctx.lineWidth = 3;
      ctx.strokeText(p.text, p.x, p.y);
      ctx.fillText(p.text, p.x, p.y);
    }
    ctx.globalAlpha = 1;

    ctx.restore();
  }

  function loop(now) {
    const dt = Math.min((now - lastTime) / 1000, 0.05);
    lastTime = now;
    update(dt);
    render();
    requestAnimationFrame(loop);
  }

  // ── Game state ─────────────────────────────────────────
  function resetGame() {
    babies.length = 0;
    particles.length = 0;
    popups.length = 0;
    kicks.length = 0;
    score = 0;
    combo = 1;
    comboTimer = 0;
    stress = 100;
    spawnTimer = 0.5;
    kickCount = 0;
    shake = 0;
    zenMode = false;
    updateHUD();
    ui.kickHint.classList.remove('hidden');
    spawnBaby();
    spawnBaby();
  }

  function startGame() {
    ensureAudio();
    resetGame();
    ui.overlay.classList.add('hidden');
    ui.zenOverlay.classList.add('hidden');
    running = true;
    window.__babyBootRunning = true;
    window.__babyBootMobile?.requestWakeLock();
  }

  function stopGame() {
    running = false;
    window.__babyBootRunning = false;
    window.__babyBootMobile?.releaseWakeLock();
  }

  let lastStartAt = 0;
  function safeStart() {
    const now = Date.now();
    if (now - lastStartAt < 400) return;
    lastStartAt = now;
    startGame();
  }

  ui.startBtn.addEventListener('click', safeStart);
  ui.againBtn.addEventListener('click', safeStart);

  window.addEventListener('orientationchange', () => setTimeout(resize, 100));

  updateHUD();
  requestAnimationFrame(loop);
})();
