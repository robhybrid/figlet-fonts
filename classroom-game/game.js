const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");

const overlay = document.getElementById("overlay");
const startBtn = document.getElementById("start-btn");
const hud = document.getElementById("hud");
const scoreEl = document.getElementById("score");
const streakEl = document.getElementById("streak");
const timerEl = document.getElementById("timer");
const alertEl = document.getElementById("alert");
const gameOverEl = document.getElementById("game-over");
const resultTitle = document.getElementById("result-title");
const resultMessage = document.getElementById("result-message");
const finalScoreEl = document.getElementById("final-score");
const retryBtn = document.getElementById("retry-btn");

const CLASS_DURATION = 120;
const WORKSHEET_GOAL = 100;
const WRITE_SPEED = 14;
const FOCUS_BONUS = 2;

const LESSON_LINES = [
  "Fundamentals of Paper Education — Unit 1",
  "1. Write your name and date at the top.",
  "2. Stay inside the margins. One line per answer.",
  "3. Pencil first. Pen only when the teacher says so.",
];

const LESSON_TIPS = [
  "Copy the three rules onto your worksheet.",
  "Use the margin. Do not write in the gutter.",
  "Print your name legibly at the top of the page.",
  "Number every answer. Skip no lines.",
  "Erase cleanly. Smudges cost points.",
];

const teacher = {
  state: "lecturing",
  timer: 0,
  turnProgress: 0,
  eyeGlow: 0,
};

const state = {
  playing: false,
  writing: false,
  worksheet: 0,
  focus: 0,
  bestFocus: 0,
  timeLeft: CLASS_DURATION,
  caught: false,
  won: false,
  shake: 0,
  writeGlow: 0,
  pencilScribble: 0,
  lessonTip: LESSON_TIPS[0],
  particles: [],
  classmates: [],
};

const keys = new Set();
let lastTime = 0;
let width = 0;
let height = 0;
let inputGraceUntil = 0;

function resize() {
  width = window.innerWidth;
  height = window.innerHeight;
  canvas.width = width * devicePixelRatio;
  canvas.height = height * devicePixelRatio;
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;
  ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
}

function randomBetween(min, max) {
  return min + Math.random() * (max - min);
}

function initClassmates() {
  state.classmates = [];
  const rows = 4;
  const cols = 5;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (r === 2 && c === 2) continue;
      state.classmates.push({
        row: r,
        col: c,
        headBob: Math.random() * Math.PI * 2,
        writing: Math.random() > 0.35,
        worksheet: randomBetween(10, 70),
        hairColor: `hsl(${randomBetween(20, 45)}, ${randomBetween(30, 60)}%, ${randomBetween(20, 45)}%)`,
        shirtColor: `hsl(${randomBetween(180, 260)}, ${randomBetween(25, 55)}%, ${randomBetween(35, 55)}%)`,
      });
    }
  }
}

function resetGame() {
  state.playing = true;
  state.writing = false;
  state.worksheet = 0;
  state.focus = 0;
  state.bestFocus = 0;
  state.timeLeft = CLASS_DURATION;
  state.caught = false;
  state.won = false;
  state.shake = 0;
  state.writeGlow = 0;
  state.pencilScribble = 0;
  state.lessonTip = LESSON_TIPS[Math.floor(Math.random() * LESSON_TIPS.length)];
  state.particles = [];
  teacher.state = "lecturing";
  teacher.timer = randomBetween(3, 6);
  teacher.turnProgress = 0;
  teacher.eyeGlow = 0;
  initClassmates();
  updateHud();
}

function formatTime(seconds) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function updateHud() {
  scoreEl.textContent = `${Math.floor(state.worksheet)}%`;
  streakEl.textContent = Math.floor(state.focus);
  timerEl.textContent = formatTime(state.timeLeft);
  alertEl.hidden = teacher.state !== "warning";
}

function spawnParticle(x, y, color) {
  state.particles.push({
    x,
    y,
    vx: randomBetween(-20, 20),
    vy: randomBetween(-30, -5),
    life: randomBetween(0.3, 0.7),
    color,
    size: randomBetween(1.5, 3.5),
  });
}

function updateParticles(dt) {
  state.particles = state.particles.filter((p) => {
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vy += 60 * dt;
    p.life -= dt;
    return p.life > 0;
  });
}

function updateTeacher(dt) {
  teacher.timer -= dt;

  if (teacher.state === "lecturing") {
    teacher.eyeGlow = Math.max(0, teacher.eyeGlow - dt * 2);
    if (teacher.timer <= 0) {
      teacher.state = "warning";
      teacher.timer = randomBetween(0.9, 1.5);
    }
  } else if (teacher.state === "warning") {
    teacher.eyeGlow = Math.min(1, teacher.eyeGlow + dt * 3);
    if (teacher.timer <= 0) {
      teacher.state = "checking";
      teacher.timer = randomBetween(2.5, 5);
      teacher.turnProgress = 0;
    }
  } else if (teacher.state === "checking") {
    teacher.turnProgress = Math.min(1, teacher.turnProgress + dt * 1.8);
    teacher.eyeGlow = 1;
    if (state.writing) {
      endGame(false);
      return;
    }
    if (teacher.timer <= 0) {
      teacher.state = "lecturing";
      teacher.timer = randomBetween(4, 8);
      teacher.turnProgress = 0;
      if (state.focus > state.bestFocus) state.bestFocus = state.focus;
      state.focus = 0;
      state.lessonTip = LESSON_TIPS[Math.floor(Math.random() * LESSON_TIPS.length)];
    }
  }

  updateHud();
}

function updateGameplay(dt) {
  state.timeLeft -= dt;

  if (state.worksheet >= WORKSHEET_GOAL) {
    endGame(true);
    return;
  }

  if (state.timeLeft <= 0) {
    state.timeLeft = 0;
    endGame(state.worksheet >= WORKSHEET_GOAL * 0.85);
    return;
  }

  if (state.writing && teacher.state !== "checking") {
    const multiplier = 1 + state.focus * 0.04;
    state.worksheet = Math.min(WORKSHEET_GOAL, state.worksheet + WRITE_SPEED * multiplier * dt);
    state.focus += dt * FOCUS_BONUS;
    state.writeGlow = Math.min(1, state.writeGlow + dt * 4);
    state.pencilScribble += dt * 12;

    if (Math.random() < dt * 10) {
      const desk = getPlayerDeskPos();
      spawnParticle(desk.x + randomBetween(-15, 15), desk.y - 8, "#2a2018");
    }
  } else {
    state.writeGlow = Math.max(0, state.writeGlow - dt * 5);
  }

  state.classmates.forEach((mate) => {
    if (teacher.state === "lecturing" && mate.writing) {
      mate.worksheet = Math.min(95, mate.worksheet + dt * randomBetween(2, 6));
    }
  });

  updateTeacher(dt);
  updateParticles(dt);
  updateHud();
}

function endGame(won) {
  state.playing = false;
  state.writing = false;
  state.won = won;
  state.caught = !won;
  document.body.classList.remove("playing");
  hud.hidden = true;

  if (won) {
    resultTitle.textContent = "Worksheet complete!";
    resultMessage.textContent = "You finished Unit 1 before the bell. Margins respected. Lines neat.";
    state.worksheet = Math.min(WORKSHEET_GOAL, state.worksheet + state.bestFocus * 0.5);
  } else if (state.writing || teacher.state === "checking") {
    resultTitle.textContent = "Not paying attention!";
    const messages = [
      "Mrs. Henderson caught you writing when you should have been listening.",
      "She asked you to look up. Your pencil kept moving.",
      "Patrol time means eyes up, pencil down.",
      "The margin is not for doodling during checks.",
    ];
    resultMessage.textContent = messages[Math.floor(Math.random() * messages.length)];
    state.shake = 0.5;
  } else {
    resultTitle.textContent = "Bell rings — incomplete!";
    resultMessage.textContent = "Your worksheet is not finished. Review the fundamentals and try again.";
  }

  finalScoreEl.textContent = `Worksheet: ${Math.floor(state.worksheet)}%`;
  gameOverEl.hidden = false;
}

function getLayout() {
  const boardH = height * 0.22;
  const floorTop = boardH + 20;
  const floorH = height - floorTop - 40;
  const deskW = Math.min(90, width * 0.11);
  const deskH = deskW * 0.55;
  const gapX = deskW * 0.35;
  const gapY = deskH * 0.9;
  const gridW = 5 * deskW + 4 * gapX;
  const startX = (width - gridW) / 2;
  const startY = floorTop + floorH * 0.18;

  return { boardH, floorTop, deskW, deskH, gapX, gapY, startX, startY };
}

function deskPos(row, col) {
  const L = getLayout();
  return {
    x: L.startX + col * (L.deskW + L.gapX) + L.deskW / 2,
    y: L.startY + row * (L.deskH + L.gapY) + L.deskH / 2,
    w: L.deskW,
    h: L.deskH,
  };
}

function getPlayerDeskPos() {
  return deskPos(2, 2);
}

function drawRoom() {
  const L = getLayout();

  const wallGrad = ctx.createLinearGradient(0, 0, 0, height);
  wallGrad.addColorStop(0, "#c8b898");
  wallGrad.addColorStop(0.35, "#b8a888");
  wallGrad.addColorStop(1, "#9a8868");
  ctx.fillStyle = wallGrad;
  ctx.fillRect(0, 0, width, height);

  ctx.fillStyle = "#6a5840";
  ctx.fillRect(0, L.floorTop, width, 12);

  ctx.fillStyle = "#7a6848";
  ctx.fillRect(0, L.floorTop + 12, width, height - L.floorTop - 12);

  for (let i = 0; i < 18; i++) {
    const x = (i / 18) * width + ((Date.now() / 50 + i * 17) % 40);
    ctx.fillStyle = "rgba(90, 70, 45, 0.08)";
    ctx.fillRect(x % width, L.floorTop + 20, 2, height - L.floorTop - 30);
  }

  drawChalkboard(L.boardH);
  drawTeacher(L.boardH);
  drawClock();
  drawWindow();
  drawLessonBanner();
}

function drawChalkboard(boardH) {
  const margin = width * 0.08;
  const bw = width - margin * 2;
  const bh = boardH - 16;
  const bx = margin;
  const by = 12;

  ctx.fillStyle = "#3a2818";
  ctx.fillRect(bx - 8, by - 8, bw + 16, bh + 16);

  ctx.fillStyle = "#1a3828";
  ctx.fillRect(bx, by, bw, bh);

  ctx.strokeStyle = "rgba(255,255,255,0.06)";
  ctx.lineWidth = 1;
  for (let i = 0; i < 8; i++) {
    ctx.beginPath();
    ctx.moveTo(bx, by + (bh / 8) * i);
    ctx.lineTo(bx + bw, by + (bh / 8) * i);
    ctx.stroke();
  }

  ctx.fillStyle = "rgba(255,255,255,0.85)";
  ctx.font = `600 ${Math.min(20, bw * 0.026)}px Georgia, serif`;
  ctx.textAlign = "left";
  LESSON_LINES.forEach((line, i) => {
    ctx.fillText(line, bx + 20, by + 32 + i * 30);
  });

  ctx.fillStyle = "#e8dcc8";
  ctx.fillRect(bx, by + bh - 6, bw, 6);

  ctx.fillStyle = "rgba(255,255,255,0.5)";
  ctx.font = `italic ${Math.min(14, bw * 0.018)}px Georgia, serif`;
  ctx.fillText("Today's medium: paper & pencil only.", bx + 20, by + bh - 14);
}

function drawLessonBanner() {
  if (!state.playing) return;

  const bw = Math.min(520, width * 0.88);
  const bx = (width - bw) / 2;
  const by = height - 52;

  ctx.fillStyle = "rgba(20, 16, 12, 0.82)";
  ctx.strokeStyle = "rgba(255, 220, 160, 0.14)";
  ctx.lineWidth = 1;
  roundRect(bx, by, bw, 36, 10);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = "#d8c8b0";
  ctx.font = "500 14px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(state.lessonTip, width / 2, by + 23);
}

function roundRect(x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function drawTeacher(boardH) {
  const cx = width / 2;
  const baseY = boardH + 8;
  const turn = teacher.turnProgress;
  const isChecking = teacher.state === "checking";

  ctx.save();
  ctx.translate(cx, baseY);

  ctx.fillStyle = "#2a2018";
  ctx.beginPath();
  ctx.ellipse(0, 55, 28, 10, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#4a3828";
  ctx.fillRect(-18, 10, 36, 48);

  ctx.fillStyle = "#d4a878";
  ctx.beginPath();
  ctx.arc(0, -8, 22, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#5a4030";
  ctx.beginPath();
  ctx.arc(0, -14, 22, Math.PI, Math.PI * 2);
  ctx.fill();
  ctx.fillRect(-22, -14, 44, 12);

  ctx.fillStyle = "#2a2018";
  ctx.fillRect(-24, 8, 48, 8);

  const eyeY = -6;
  const eyeOffset = 8 - turn * 14;

  ctx.fillStyle = "#fff";
  ctx.beginPath();
  ctx.ellipse(-eyeOffset, eyeY, 5, 4, 0, 0, Math.PI * 2);
  ctx.ellipse(eyeOffset, eyeY, 5, 4, 0, 0, Math.PI * 2);
  ctx.fill();

  const pupilSize = 2.5 + teacher.eyeGlow * 1.5;
  ctx.fillStyle = isChecking ? "#cc2222" : "#2a2018";
  ctx.beginPath();
  ctx.arc(-eyeOffset, eyeY, pupilSize, 0, Math.PI * 2);
  ctx.arc(eyeOffset, eyeY, pupilSize, 0, Math.PI * 2);
  ctx.fill();

  if (isChecking && teacher.eyeGlow > 0.5) {
    ctx.strokeStyle = `rgba(255, 60, 60, ${teacher.eyeGlow * 0.5})`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-eyeOffset - 8, eyeY - 10);
    ctx.lineTo(-eyeOffset + 8, eyeY + 10);
    ctx.moveTo(eyeOffset + 8, eyeY - 10);
    ctx.lineTo(eyeOffset - 8, eyeY + 10);
    ctx.stroke();
  }

  if (turn < 0.5) {
    ctx.strokeStyle = "#f5f0e8";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(18, 18);
    ctx.lineTo(34, -18);
    ctx.stroke();
    ctx.fillStyle = "#fff";
    ctx.fillRect(30, -26, 12, 16);
    ctx.strokeStyle = "#ccc";
    ctx.lineWidth = 0.8;
    for (let i = 0; i < 4; i++) {
      ctx.beginPath();
      ctx.moveTo(31, -24 + i * 4);
      ctx.lineTo(41, -24 + i * 4);
      ctx.stroke();
    }
  } else {
    ctx.fillStyle = "#f5f0e8";
    ctx.fillRect(-8, 22, 16, 22);
    ctx.strokeStyle = "#ccc";
    ctx.lineWidth = 0.8;
    for (let i = 0; i < 5; i++) {
      ctx.beginPath();
      ctx.moveTo(-6, 24 + i * 4);
      ctx.lineTo(6, 24 + i * 4);
      ctx.stroke();
    }
  }

  ctx.restore();

  if (teacher.state === "warning") {
    ctx.fillStyle = "rgba(210, 160, 60, 0.12)";
    ctx.fillRect(0, 0, width, height);
  }

  if (isChecking) {
    ctx.fillStyle = `rgba(160, 90, 30, ${0.06 + turn * 0.08})`;
    ctx.fillRect(0, 0, width, height);
  }
}

function drawClock() {
  const cx = width - 50;
  const cy = 50;
  ctx.fillStyle = "#f0e8d8";
  ctx.beginPath();
  ctx.arc(cx, cy, 28, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#3a2818";
  ctx.lineWidth = 3;
  ctx.stroke();

  const elapsed = CLASS_DURATION - state.timeLeft;
  const angle = (elapsed / CLASS_DURATION) * Math.PI * 2 - Math.PI / 2;
  ctx.strokeStyle = "#cc3333";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.lineTo(cx + Math.cos(angle) * 18, cy + Math.sin(angle) * 18);
  ctx.stroke();
}

function drawWindow() {
  const wx = 30;
  const wy = 40;
  const ww = 80;
  const wh = 100;

  ctx.fillStyle = "#87ceeb";
  ctx.fillRect(wx, wy, ww, wh);
  ctx.strokeStyle = "#f0e8d8";
  ctx.lineWidth = 5;
  ctx.strokeRect(wx, wy, ww, wh);
  ctx.beginPath();
  ctx.moveTo(wx + ww / 2, wy);
  ctx.lineTo(wx + ww / 2, wy + wh);
  ctx.moveTo(wx, wy + wh / 2);
  ctx.lineTo(wx + ww, wy + wh / 2);
  ctx.stroke();

  ctx.fillStyle = "rgba(255,255,255,0.35)";
  ctx.beginPath();
  ctx.arc(wx + 55, wy + 30, 18, 0, Math.PI * 2);
  ctx.fill();
}

function drawWorksheet(x, y, w, h, progress, isPlayer = false) {
  const pw = w * 0.55;
  const ph = h * 0.45;
  const px = x - pw * 0.15;
  const py = y - ph * 0.05;

  ctx.fillStyle = "#f5f0e8";
  ctx.fillRect(px, py, pw, ph);

  ctx.strokeStyle = "#d0c8b8";
  ctx.lineWidth = 0.8;
  const lineCount = 5;
  for (let i = 1; i <= lineCount; i++) {
    const ly = py + (ph / (lineCount + 1)) * i;
    ctx.beginPath();
    ctx.moveTo(px + 4, ly);
    ctx.lineTo(px + pw - 4, ly);
    ctx.stroke();
  }

  ctx.strokeStyle = "#e8a0a0";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(px + pw * 0.12, py + 2);
  ctx.lineTo(px + pw * 0.12, py + ph - 2);
  ctx.stroke();

  if (progress > 0) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(px + 2, py + 2, pw - 4, ph - 4);
    ctx.clip();

    ctx.strokeStyle = "#2a2018";
    ctx.lineWidth = 1.2;
    const filledLines = Math.ceil((progress / 100) * lineCount);
    for (let i = 0; i < filledLines; i++) {
      const ly = py + (ph / (lineCount + 1)) * (i + 1) - 3;
      ctx.beginPath();
      ctx.moveTo(px + pw * 0.16, ly);
      const scribbleLen = pw * 0.55 * Math.min(1, (progress - (i / lineCount) * 100) / (100 / lineCount));
      for (let sx = 0; sx < scribbleLen; sx += 4) {
        ctx.lineTo(px + pw * 0.16 + sx, ly + Math.sin(sx * 0.3 + state.pencilScribble) * 1.5);
      }
      ctx.stroke();
    }

    if (isPlayer && progress < 15) {
      ctx.fillStyle = "#2a2018";
      ctx.font = `600 ${Math.max(7, pw * 0.09)}px cursive, serif`;
      ctx.fillText("Name:", px + pw * 0.16, py + ph * 0.22);
    }

    ctx.restore();
  }
}

function drawDesk(x, y, w, h, worksheetProgress = 0, isPlayer = false) {
  ctx.fillStyle = isPlayer ? "#8a6848" : "#7a6040";
  ctx.fillRect(x - w / 2, y - h / 2, w, h);
  ctx.fillStyle = isPlayer ? "#6a5038" : "#5a4028";
  ctx.fillRect(x - w / 2 + 4, y - h / 2 + 4, w - 8, h * 0.35);

  drawWorksheet(x, y, w, h, worksheetProgress, isPlayer);
}

function drawPencil(x, y, deskW, glow) {
  ctx.save();
  ctx.translate(x + deskW * 0.08, y - deskW * 0.05);
  ctx.rotate(-0.4 + Math.sin(state.pencilScribble) * 0.08);

  ctx.fillStyle = "#f4d03f";
  ctx.fillRect(-3, -deskW * 0.2, 6, deskW * 0.35);
  ctx.fillStyle = "#e8b830";
  ctx.beginPath();
  ctx.moveTo(-3, -deskW * 0.2);
  ctx.lineTo(0, -deskW * 0.28);
  ctx.lineTo(3, -deskW * 0.2);
  ctx.fill();
  ctx.fillStyle = "#ffb6c1";
  ctx.fillRect(-3, deskW * 0.12, 6, deskW * 0.04);

  if (glow > 0) {
    ctx.shadowColor = "rgba(42, 32, 24, 0.4)";
    ctx.shadowBlur = 8 * glow;
  }

  ctx.restore();
}

function drawStudent(x, y, deskW, classmate, isPlayer = false) {
  const bob = Math.sin(Date.now() / 400 + (classmate?.headBob || 0)) * 2;
  const sy = y - deskW * 0.35 + bob;
  const lookingUp = isPlayer && teacher.state === "checking" && !state.writing;

  ctx.fillStyle = isPlayer ? "#5a7898" : classmate?.shirtColor || "#6a8090";
  ctx.beginPath();
  ctx.ellipse(x, sy + 18, deskW * 0.22, deskW * 0.14, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = isPlayer ? "#e8c8a0" : "#d4b898";
  ctx.beginPath();
  ctx.arc(x, sy, deskW * 0.16, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = isPlayer ? "#3a2818" : classmate?.hairColor || "#4a3020";
  ctx.beginPath();
  ctx.arc(x, sy - 4, deskW * 0.17, Math.PI, Math.PI * 2);
  ctx.fill();

  if (lookingUp) {
    ctx.fillStyle = "#fff";
    ctx.beginPath();
    ctx.ellipse(x - 5, sy - 4, 4, 3, 0, 0, Math.PI * 2);
    ctx.ellipse(x + 5, sy - 4, 4, 3, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  if (isPlayer && state.writeGlow > 0) {
    drawPencil(x, sy, deskW, state.writeGlow);
  } else if (classmate?.writing && teacher.state === "lecturing") {
    drawPencil(x, sy, deskW, 0.4);
  }
}

function drawClassroom() {
  drawRoom();

  state.classmates.forEach((mate) => {
    const d = deskPos(mate.row, mate.col);
    drawDesk(d.x, d.y, d.w, d.h, mate.worksheet);
    drawStudent(d.x, d.y, d.w, mate);
  });

  const player = getPlayerDeskPos();
  drawDesk(player.x, player.y, player.w, player.h, state.worksheet, true);
  drawStudent(player.x, player.y, player.w, { headBob: 0 }, true);

  state.particles.forEach((p) => {
    ctx.globalAlpha = p.life;
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  });
}

function render() {
  ctx.save();
  if (state.shake > 0) {
    state.shake -= 0.016;
    ctx.translate(randomBetween(-6, 6), randomBetween(-6, 6));
  }

  if (state.playing || !overlay.hidden) {
    drawClassroom();
  } else if (!gameOverEl.hidden) {
    drawClassroom();
    ctx.fillStyle = "rgba(0,0,0,0.35)";
    ctx.fillRect(0, 0, width, height);
  }

  ctx.restore();
}

function tick(now) {
  const dt = Math.min(0.05, (now - lastTime) / 1000 || 0);
  lastTime = now;

  if (state.playing) {
    updateGameplay(dt);
  }

  render();
  requestAnimationFrame(tick);
}

function startGame() {
  overlay.hidden = true;
  gameOverEl.hidden = true;
  hud.hidden = false;
  document.body.classList.add("playing");
  keys.clear();
  state.writing = false;
  inputGraceUntil = performance.now() + 500;
  resetGame();
}

function handleWriteStart(e) {
  if (e.cancelable) e.preventDefault();
  if (!state.playing || performance.now() < inputGraceUntil) return;
  state.writing = true;
}

function handleWriteEnd() {
  state.writing = false;
}

startBtn.addEventListener("click", (e) => {
  e.stopPropagation();
  startGame();
});

retryBtn.addEventListener("click", (e) => {
  e.stopPropagation();
  startGame();
});

window.addEventListener("keydown", (e) => {
  if (e.code === "Space") {
    e.preventDefault();
    if (!state.playing && !overlay.hidden) {
      startGame();
      return;
    }
    if (!state.playing) return;
    keys.add("Space");
    handleWriteStart(e);
  }
});

window.addEventListener("keyup", (e) => {
  if (e.code === "Space") {
    keys.delete("Space");
    handleWriteEnd();
  }
});

canvas.addEventListener("pointerdown", handleWriteStart);
canvas.addEventListener("pointerup", handleWriteEnd);
canvas.addEventListener("pointerleave", handleWriteEnd);
canvas.addEventListener("pointercancel", handleWriteEnd);

window.addEventListener("blur", handleWriteEnd);

window.addEventListener("resize", () => {
  resize();
  if (!state.playing && overlay.hidden === false) {
    initClassmates();
  }
});

resize();
initClassmates();
requestAnimationFrame(tick);
