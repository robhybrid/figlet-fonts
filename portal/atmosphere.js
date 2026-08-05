/* Animated ASCII field behind the portal */
(function () {
  const canvas = document.getElementById("field");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  const glyphs = "░▒▓█╱╲╳·+*#@".split("");
  let w = 0;
  let h = 0;
  let cols = 0;
  let rows = 0;
  let grid = [];
  let raf = 0;
  let t = 0;

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    w = window.innerWidth;
    h = window.innerHeight;
    canvas.width = Math.floor(w * dpr);
    canvas.height = Math.floor(h * dpr);
    canvas.style.width = w + "px";
    canvas.style.height = h + "px";
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    cols = Math.ceil(w / 16);
    rows = Math.ceil(h / 18);
    grid = Array.from({ length: cols * rows }, () => ({
      g: glyphs[(Math.random() * glyphs.length) | 0],
      phase: Math.random() * Math.PI * 2,
      speed: 0.4 + Math.random() * 1.2,
    }));
  }

  function frame() {
    t += 0.016;
    ctx.clearRect(0, 0, w, h);
    ctx.font = "13px 'IBM Plex Mono', monospace";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const cell = grid[y * cols + x];
        const n = 0.5 + 0.5 * Math.sin(t * cell.speed + cell.phase + x * 0.08 + y * 0.05);
        if (n < 0.62) continue;
        const amber = n > 0.88;
        ctx.fillStyle = amber
          ? `rgba(255,179,71,${0.08 + (n - 0.88) * 0.9})`
          : `rgba(61,255,168,${0.04 + (n - 0.62) * 0.35})`;
        ctx.fillText(cell.g, x * 16 + 8, y * 18 + 9);
      }
    }
    raf = requestAnimationFrame(frame);
  }

  window.addEventListener("resize", resize);
  resize();
  raf = requestAnimationFrame(frame);

  window.PortalAtmosphere = {
    pause() {
      cancelAnimationFrame(raf);
    },
    resume() {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(frame);
    },
  };
})();
