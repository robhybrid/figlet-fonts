/* Brick Signal — breakout */
window.PortalGames = window.PortalGames || {};

window.PortalGames.breakout = function createBreakout(root, api) {
  const W = 480;
  const H = 360;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  root.appendChild(canvas);
  const ctx = canvas.getContext("2d");

  const paddle = { w: 84, h: 12, x: W / 2 - 42, y: H - 28, speed: 7 };
  const ball = { x: W / 2, y: H - 48, r: 6, vx: 3.2, vy: -3.6 };
  let bricks = [];
  let score = 0;
  let lives = 3;
  let running = false;
  let won = false;
  let lost = false;
  let raf = 0;
  let left = false;
  let right = false;

  function resetBricks() {
    bricks = [];
    const cols = 10;
    const rows = 5;
    const bw = 42;
    const bh = 14;
    const gap = 4;
    const ox = (W - cols * (bw + gap) + gap) / 2;
    const colors = ["#ff6b8a", "#ffb347", "#3dffa8", "#7ec8ff", "#d4a5ff"];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        bricks.push({
          x: ox + c * (bw + gap),
          y: 36 + r * (bh + gap),
          w: bw,
          h: bh,
          alive: true,
          color: colors[r],
          points: (rows - r) * 10,
        });
      }
    }
  }

  resetBricks();

  function draw() {
    ctx.fillStyle = "#05070a";
    ctx.fillRect(0, 0, W, H);

    bricks.forEach((b) => {
      if (!b.alive) return;
      ctx.fillStyle = b.color;
      ctx.shadowColor = b.color;
      ctx.shadowBlur = 8;
      ctx.fillRect(b.x, b.y, b.w, b.h);
      ctx.shadowBlur = 0;
    });

    ctx.fillStyle = "#ffd28a";
    ctx.fillRect(paddle.x, paddle.y, paddle.w, paddle.h);

    ctx.beginPath();
    ctx.fillStyle = "#3dffa8";
    ctx.shadowColor = "rgba(61,255,168,0.7)";
    ctx.shadowBlur = 12;
    ctx.arc(ball.x, ball.y, ball.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;

    ctx.fillStyle = "rgba(236,230,214,0.55)";
    ctx.font = "500 12px 'IBM Plex Mono', monospace";
    ctx.textAlign = "left";
    ctx.fillText(`Lives ${lives}`, 12, 18);

    if (!running && !won && !lost) {
      overlay("Click / Space to serve");
    } else if (won) {
      overlay("Grid cleared");
    } else if (lost) {
      overlay("Signal lost");
    }
  }

  function overlay(text) {
    ctx.fillStyle = "rgba(0,0,0,0.5)";
    ctx.fillRect(0, H / 2 - 24, W, 48);
    ctx.fillStyle = "#ffd28a";
    ctx.font = "600 14px 'IBM Plex Mono', monospace";
    ctx.textAlign = "center";
    ctx.fillText(text, W / 2, H / 2 + 5);
  }

  function serve() {
    if (won || lost) return;
    if (!running) {
      running = true;
      api.setStatus("");
      ball.vx = (Math.random() > 0.5 ? 1 : -1) * 3.2;
      ball.vy = -3.6;
    }
  }

  function update() {
    if (!running) return;

    if (left) paddle.x -= paddle.speed;
    if (right) paddle.x += paddle.speed;
    paddle.x = Math.max(0, Math.min(W - paddle.w, paddle.x));

    ball.x += ball.vx;
    ball.y += ball.vy;

    if (ball.x - ball.r <= 0 || ball.x + ball.r >= W) ball.vx *= -1;
    if (ball.y - ball.r <= 0) ball.vy *= -1;

    if (
      ball.y + ball.r >= paddle.y &&
      ball.y + ball.r <= paddle.y + paddle.h &&
      ball.x >= paddle.x &&
      ball.x <= paddle.x + paddle.w &&
      ball.vy > 0
    ) {
      const hit = (ball.x - (paddle.x + paddle.w / 2)) / (paddle.w / 2);
      ball.vx = hit * 4.2;
      ball.vy = -Math.abs(ball.vy);
    }

    bricks.forEach((b) => {
      if (!b.alive) return;
      if (
        ball.x + ball.r > b.x &&
        ball.x - ball.r < b.x + b.w &&
        ball.y + ball.r > b.y &&
        ball.y - ball.r < b.y + b.h
      ) {
        b.alive = false;
        ball.vy *= -1;
        score += b.points;
        api.setScore(score);
      }
    });

    if (bricks.every((b) => !b.alive)) {
      running = false;
      won = true;
      api.setStatus("All bricks cleared.");
      api.saveBest(score);
    }

    if (ball.y - ball.r > H) {
      lives -= 1;
      running = false;
      ball.x = paddle.x + paddle.w / 2;
      ball.y = paddle.y - 16;
      if (lives <= 0) {
        lost = true;
        api.setStatus("Out of lives. Restart to try again.");
        api.saveBest(score);
      } else {
        api.setStatus(`Ball lost · ${lives} left · Space to serve`);
      }
    }
  }

  function loop() {
    update();
    draw();
    raf = requestAnimationFrame(loop);
  }

  function onKeyDown(e) {
    if (e.key === "ArrowLeft" || e.key === "a" || e.key === "A") left = true;
    if (e.key === "ArrowRight" || e.key === "d" || e.key === "D") right = true;
    if (e.key === " " || e.key === "Enter") {
      e.preventDefault();
      serve();
    }
  }
  function onKeyUp(e) {
    if (e.key === "ArrowLeft" || e.key === "a" || e.key === "A") left = false;
    if (e.key === "ArrowRight" || e.key === "d" || e.key === "D") right = false;
  }

  function pointerX(e) {
    const rect = canvas.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    return ((clientX - rect.left) / rect.width) * W;
  }

  function onPointerMove(e) {
    paddle.x = pointerX(e) - paddle.w / 2;
    paddle.x = Math.max(0, Math.min(W - paddle.w, paddle.x));
    if (!running && !won && !lost) {
      ball.x = paddle.x + paddle.w / 2;
    }
  }

  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("keyup", onKeyUp);
  canvas.addEventListener("pointerdown", serve);
  canvas.addEventListener("pointermove", onPointerMove);
  api.setScore(0);
  api.setStatus("Move with mouse / arrows. Space to serve.");
  draw();
  raf = requestAnimationFrame(loop);

  return {
    destroy() {
      cancelAnimationFrame(raf);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    },
  };
};

window.PortalGames.previewBreakout = function (canvas) {
  const ctx = canvas.getContext("2d");
  const w = canvas.width;
  const h = canvas.height;
  let t = 0;
  let id = 0;
  function frame() {
    t += 0.03;
    ctx.fillStyle = "#05070a";
    ctx.fillRect(0, 0, w, h);
    const colors = ["#ff6b8a", "#ffb347", "#3dffa8", "#7ec8ff"];
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 8; c++) {
        ctx.fillStyle = colors[r];
        ctx.globalAlpha = 0.55 + ((c + r + Math.sin(t + c)) % 1) * 0.35;
        ctx.fillRect(28 + c * 34, 28 + r * 18, 30, 12);
      }
    }
    ctx.globalAlpha = 1;
    const px = w / 2 + Math.sin(t) * 60 - 36;
    ctx.fillStyle = "#ffd28a";
    ctx.fillRect(px, h - 36, 72, 10);
    ctx.beginPath();
    ctx.fillStyle = "#3dffa8";
    ctx.arc(w / 2 + Math.cos(t * 1.4) * 70, h / 2 + Math.sin(t * 1.7) * 40, 5, 0, Math.PI * 2);
    ctx.fill();
    id = requestAnimationFrame(frame);
  }
  id = requestAnimationFrame(frame);
  return () => cancelAnimationFrame(id);
};
