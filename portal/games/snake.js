/* Neon Serpent — classic snake */
window.PortalGames = window.PortalGames || {};

window.PortalGames.snake = function createSnake(root, api) {
  const SIZE = 20;
  const CELL = 20;
  const canvas = document.createElement("canvas");
  canvas.width = SIZE * CELL;
  canvas.height = SIZE * CELL;
  root.appendChild(canvas);
  const ctx = canvas.getContext("2d");

  let snake = [{ x: 10, y: 10 }];
  let dir = { x: 1, y: 0 };
  let pending = null;
  let food = spawnFood();
  let score = 0;
  let alive = true;
  let started = false;
  let raf = 0;
  let last = 0;
  const STEP = 110;

  function spawnFood() {
    while (true) {
      const spot = {
        x: Math.floor(Math.random() * SIZE),
        y: Math.floor(Math.random() * SIZE),
      };
      if (!snake.some((s) => s.x === spot.x && s.y === spot.y)) return spot;
    }
  }

  function draw() {
    ctx.fillStyle = "#05070a";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // soft grid
    ctx.strokeStyle = "rgba(255,179,71,0.06)";
    ctx.lineWidth = 1;
    for (let i = 0; i <= SIZE; i++) {
      ctx.beginPath();
      ctx.moveTo(i * CELL + 0.5, 0);
      ctx.lineTo(i * CELL + 0.5, canvas.height);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, i * CELL + 0.5);
      ctx.lineTo(canvas.width, i * CELL + 0.5);
      ctx.stroke();
    }

    ctx.fillStyle = "#ffb347";
    ctx.shadowColor = "rgba(255,179,71,0.55)";
    ctx.shadowBlur = 10;
    ctx.fillRect(food.x * CELL + 3, food.y * CELL + 3, CELL - 6, CELL - 6);
    ctx.shadowBlur = 0;

    snake.forEach((seg, i) => {
      const t = i / Math.max(snake.length - 1, 1);
      ctx.fillStyle = i === 0 ? "#3dffa8" : `rgba(61,255,168,${0.95 - t * 0.45})`;
      ctx.fillRect(seg.x * CELL + 2, seg.y * CELL + 2, CELL - 4, CELL - 4);
    });

    if (!started) {
      banner("Press arrow / WASD");
    } else if (!alive) {
      banner("Game over · Restart");
    }
  }

  function banner(text) {
    ctx.fillStyle = "rgba(0,0,0,0.55)";
    ctx.fillRect(0, canvas.height / 2 - 22, canvas.width, 44);
    ctx.fillStyle = "#ffd28a";
    ctx.font = "600 14px 'IBM Plex Mono', monospace";
    ctx.textAlign = "center";
    ctx.fillText(text, canvas.width / 2, canvas.height / 2 + 5);
  }

  function tick() {
    if (!alive || !started) return;
    if (pending) {
      // prevent instant reverse
      if (pending.x !== -dir.x || pending.y !== -dir.y) dir = pending;
      pending = null;
    }
    const head = { x: snake[0].x + dir.x, y: snake[0].y + dir.y };
    if (
      head.x < 0 ||
      head.y < 0 ||
      head.x >= SIZE ||
      head.y >= SIZE ||
      snake.some((s) => s.x === head.x && s.y === head.y)
    ) {
      alive = false;
      api.setStatus("Serpent crashed. Hit Restart.");
      api.saveBest(score);
      draw();
      return;
    }
    snake.unshift(head);
    if (head.x === food.x && head.y === food.y) {
      score += 10;
      api.setScore(score);
      food = spawnFood();
    } else {
      snake.pop();
    }
  }

  function loop(ts) {
    raf = requestAnimationFrame(loop);
    if (!last) last = ts;
    if (ts - last >= STEP) {
      tick();
      last = ts;
      draw();
    }
  }

  function setDir(nx, ny) {
    if (!started && alive) {
      started = true;
      api.setStatus("");
    }
    pending = { x: nx, y: ny };
  }

  function onKey(e) {
    const map = {
      ArrowUp: [0, -1],
      ArrowDown: [0, 1],
      ArrowLeft: [-1, 0],
      ArrowRight: [1, 0],
      w: [0, -1],
      s: [0, 1],
      a: [-1, 0],
      d: [1, 0],
      W: [0, -1],
      S: [0, 1],
      A: [-1, 0],
      D: [1, 0],
    };
    const v = map[e.key];
    if (!v) return;
    e.preventDefault();
    setDir(v[0], v[1]);
  }

  // swipe
  let sx = 0;
  let sy = 0;
  function onTouchStart(e) {
    const t = e.changedTouches[0];
    sx = t.clientX;
    sy = t.clientY;
  }
  function onTouchEnd(e) {
    const t = e.changedTouches[0];
    const dx = t.clientX - sx;
    const dy = t.clientY - sy;
    if (Math.abs(dx) < 18 && Math.abs(dy) < 18) return;
    if (Math.abs(dx) > Math.abs(dy)) setDir(dx > 0 ? 1 : -1, 0);
    else setDir(0, dy > 0 ? 1 : -1);
  }

  window.addEventListener("keydown", onKey);
  canvas.addEventListener("touchstart", onTouchStart, { passive: true });
  canvas.addEventListener("touchend", onTouchEnd, { passive: true });
  api.setScore(0);
  api.setStatus("Arrow keys or WASD to start.");
  draw();
  raf = requestAnimationFrame(loop);

  return {
    destroy() {
      cancelAnimationFrame(raf);
      window.removeEventListener("keydown", onKey);
    },
  };
};

window.PortalGames.previewSnake = function (canvas) {
  const ctx = canvas.getContext("2d");
  const w = canvas.width;
  const h = canvas.height;
  let t = 0;
  let id = 0;
  const path = [
    [2, 5], [3, 5], [4, 5], [5, 5], [6, 5], [7, 5], [8, 5], [8, 4], [8, 3], [9, 3], [10, 3],
  ];
  function frame() {
    t += 0.04;
    ctx.fillStyle = "#05070a";
    ctx.fillRect(0, 0, w, h);
    const cell = 16;
    const ox = 40;
    const oy = 40;
    path.forEach((p, i) => {
      const wave = Math.sin(t + i * 0.35) * 2;
      ctx.fillStyle = i === path.length - 1 ? "#3dffa8" : `rgba(61,255,168,${0.4 + i / path.length * 0.5})`;
      ctx.fillRect(ox + p[0] * cell, oy + p[1] * cell + wave, cell - 3, cell - 3);
    });
    ctx.fillStyle = "#ffb347";
    ctx.fillRect(ox + 13 * cell, oy + 3 * cell + Math.sin(t * 2) * 3, cell - 4, cell - 4);
    id = requestAnimationFrame(frame);
  }
  id = requestAnimationFrame(frame);
  return () => cancelAnimationFrame(id);
};
