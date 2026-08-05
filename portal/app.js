(function () {
  const FONT_CANDIDATES = [
    "Doom.flf",
    "Slant.flf",
    "Standard.flf",
    "Big.flf",
    "ANSI Shadow.flf",
    "Block.flf",
    "Bloody.flf",
    "Cyberlarge.flf",
    "Speed.flf",
    "Sub-Zero.flf",
    "3D-ASCII.flf",
    "Larry 3D.flf",
    "Nancyj.flf",
    "Rectangles.flf",
    "Small.flf",
  ];

  const GAME_META = {
    snake: {
      title: "Neon Serpent",
      help: "Arrow keys or WASD. On touch: swipe to steer.",
      storageKey: "portal-best-snake",
      create: () => window.PortalGames.snake,
    },
    breakout: {
      title: "Brick Signal",
      help: "Move paddle with mouse or arrows. Space / tap to serve.",
      storageKey: "portal-best-breakout",
      create: () => window.PortalGames.breakout,
    },
    memory: {
      title: "Glyph Match",
      help: "Tap tiles to flip. Score is move count — lower is better. Best stores efficiency.",
      storageKey: "portal-best-memory",
      create: () => window.PortalGames.memory,
    },
  };

  const app = document.getElementById("app");
  const fontCache = new Map();
  let activeGame = null;
  let previewCleanups = [];

  function fontUrl(name) {
    // Portal is served from /portal/; fonts live at repo root.
    return `../${encodeURIComponent(name).replace(/%2F/g, "/")}`;
  }

  async function loadFont(name) {
    if (fontCache.has(name)) return fontCache.get(name);
    const res = await fetch(fontUrl(name));
    if (!res.ok) throw new Error(`Failed to load ${name}`);
    const text = await res.text();
    figlet.parseFont(name, text);
    fontCache.set(name, name);
    return name;
  }

  function renderFiglet(text, font) {
    return new Promise((resolve, reject) => {
      figlet.text(text, { font }, (err, data) => {
        if (err) reject(err);
        else resolve(data || "");
      });
    });
  }

  async function paintHeroFig() {
    const el = document.getElementById("hero-fig");
    if (!el) return;
    try {
      await loadFont("Doom.flf");
      const art = await renderFiglet("PORTAL", "Doom.flf");
      el.textContent = art;
    } catch {
      el.textContent = "PORTAL";
    }
  }

  function getBest(key) {
    return Number(localStorage.getItem(key) || 0);
  }

  function setBest(key, value) {
    const prev = getBest(key);
    if (value > prev) {
      localStorage.setItem(key, String(value));
      return value;
    }
    return prev;
  }

  function destroyGame() {
    if (activeGame && activeGame.destroy) activeGame.destroy();
    activeGame = null;
  }

  function stopPreviews() {
    previewCleanups.forEach((fn) => fn && fn());
    previewCleanups = [];
  }

  function startPreviews() {
    stopPreviews();
    document.querySelectorAll("[data-preview]").forEach((canvas) => {
      const kind = canvas.getAttribute("data-preview");
      if (kind === "snake" && window.PortalGames.previewSnake) {
        previewCleanups.push(window.PortalGames.previewSnake(canvas));
      }
      if (kind === "breakout" && window.PortalGames.previewBreakout) {
        previewCleanups.push(window.PortalGames.previewBreakout(canvas));
      }
      if (kind === "memory" && window.PortalGames.previewMemory) {
        previewCleanups.push(window.PortalGames.previewMemory(canvas));
      }
    });
  }

  function mountTemplate(id) {
    destroyGame();
    stopPreviews();
    const tpl = document.getElementById(id);
    app.innerHTML = "";
    app.appendChild(tpl.content.cloneNode(true));
  }

  function renderHub() {
    mountTemplate("tpl-hub");
    paintHeroFig();
    startPreviews();
  }

  function renderPlay(gameId) {
    const meta = GAME_META[gameId];
    if (!meta) {
      location.hash = "#/";
      return;
    }
    mountTemplate("tpl-play");
    document.getElementById("play-title").textContent = meta.title;
    document.getElementById("play-help").textContent = meta.help;
    const scoreEl = document.getElementById("score");
    const bestEl = document.getElementById("best");
    const statusEl = document.getElementById("play-status");
    bestEl.textContent = String(getBest(meta.storageKey));

    const api = {
      setScore(n) {
        scoreEl.textContent = String(n);
      },
      setStatus(msg) {
        statusEl.textContent = msg || "";
      },
      saveBest(n) {
        bestEl.textContent = String(setBest(meta.storageKey, n));
      },
    };

    const factory = meta.create();
    activeGame = factory(document.getElementById("game-root"), api);

    document.getElementById("btn-restart").addEventListener("click", () => {
      renderPlay(gameId);
    });
  }

  async function renderFonts() {
    mountTemplate("tpl-fonts");
    const select = document.getElementById("font-select");
    const input = document.getElementById("font-text");
    const preview = document.getElementById("font-preview");

    // Probe which fonts exist
    const available = [];
    await Promise.all(
      FONT_CANDIDATES.map(async (name) => {
        try {
          const res = await fetch(fontUrl(name), { method: "HEAD" });
          if (res.ok) available.push(name);
        } catch {
          /* skip */
        }
      })
    );

    // Fallback: try GET if HEAD blocked
    if (!available.length) {
      for (const name of FONT_CANDIDATES.slice(0, 6)) {
        try {
          await loadFont(name);
          available.push(name);
        } catch {
          /* skip */
        }
      }
    }

    available.sort((a, b) => a.localeCompare(b));
    select.innerHTML = available
      .map((n) => `<option value="${n}">${n.replace(/\.flf$/i, "")}</option>`)
      .join("");

    async function update() {
      const font = select.value || available[0];
      const text = (input.value || "PORTAL").slice(0, 24);
      if (!font) {
        preview.textContent = "No fonts found. Serve the repo root so ../Font.flf resolves.";
        return;
      }
      preview.textContent = "Rendering…";
      try {
        await loadFont(font);
        preview.textContent = await renderFiglet(text, font);
      } catch (err) {
        preview.textContent = String(err.message || err);
      }
    }

    select.addEventListener("change", update);
    input.addEventListener("input", () => {
      clearTimeout(input._t);
      input._t = setTimeout(update, 180);
    });
    await update();
  }

  function route() {
    const hash = location.hash.replace(/^#\/?/, "") || "";
    const [path, id] = hash.split("/");
    if (path === "play" && id) renderPlay(id);
    else if (path === "fonts") renderFonts();
    else renderHub();
  }

  window.addEventListener("hashchange", route);
  route();
})();
