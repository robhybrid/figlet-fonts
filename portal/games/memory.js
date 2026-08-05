/* Glyph Match — memory pairs */
window.PortalGames = window.PortalGames || {};

window.PortalGames.memory = function createMemory(root, api) {
  const PAIR = ["⌬", "◈", "▣", "◎", "⬢", "✦", "◐", "◑"];
  const deck = [...PAIR, ...PAIR]
    .map((g, i) => ({ id: i, glyph: g, flipped: false, matched: false }))
    .sort(() => Math.random() - 0.5);

  const board = document.createElement("div");
  board.className = "memory-board";
  root.appendChild(board);

  let open = [];
  let lock = false;
  let moves = 0;
  let matched = 0;
  const started = performance.now();

  function render() {
    board.innerHTML = "";
    deck.forEach((card, idx) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "memory-card";
      if (card.flipped || card.matched) btn.classList.add("is-flipped");
      if (card.matched) btn.classList.add("is-matched");
      btn.textContent = card.flipped || card.matched ? card.glyph : "·";
      btn.disabled = card.matched || lock;
      btn.setAttribute("aria-label", card.flipped || card.matched ? card.glyph : "Hidden glyph");
      btn.addEventListener("click", () => flip(idx));
      board.appendChild(btn);
    });
  }

  function flip(idx) {
    const card = deck[idx];
    if (lock || card.flipped || card.matched) return;
    card.flipped = true;
    open.push(idx);
    render();

    if (open.length < 2) return;

    moves += 1;
    api.setScore(moves);
    const [a, b] = open;
    if (deck[a].glyph === deck[b].glyph) {
      deck[a].matched = true;
      deck[b].matched = true;
      open = [];
      matched += 1;
      if (matched === PAIR.length) {
        const secs = ((performance.now() - started) / 1000).toFixed(1);
        // lower moves is better — invert for "best" storage as high score of efficiency
        const efficiency = Math.max(1, Math.round(1000 / moves));
        api.saveBest(efficiency);
        api.setStatus(`Cleared in ${moves} moves · ${secs}s`);
      }
      render();
    } else {
      lock = true;
      setTimeout(() => {
        deck[a].flipped = false;
        deck[b].flipped = false;
        open = [];
        lock = false;
        render();
      }, 520);
    }
  }

  api.setScore(0);
  api.setStatus("Flip two tiles. Match the glyphs.");
  // For memory, score = moves (lower better). Best stores efficiency.
  render();

  return {
    destroy() {
      board.remove();
    },
  };
};

window.PortalGames.previewMemory = function (canvas) {
  const ctx = canvas.getContext("2d");
  const w = canvas.width;
  const h = canvas.height;
  const glyphs = ["⌬", "◈", "▣", "◎", "⬢", "✦"];
  let t = 0;
  let id = 0;
  function frame() {
    t += 0.025;
    ctx.fillStyle = "#05070a";
    ctx.fillRect(0, 0, w, h);
    const size = 48;
    const gap = 10;
    const cols = 4;
    const rows = 2;
    const ox = (w - cols * (size + gap) + gap) / 2;
    const oy = (h - rows * (size + gap) + gap) / 2;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const i = r * cols + c;
        const pulse = 0.5 + 0.5 * Math.sin(t * 2 + i);
        const x = ox + c * (size + gap);
        const y = oy + r * (size + gap);
        ctx.strokeStyle = `rgba(61,255,168,${0.25 + pulse * 0.45})`;
        ctx.strokeRect(x + 0.5, y + 0.5, size, size);
        ctx.fillStyle = pulse > 0.55 ? "#3dffa8" : "rgba(255,210,138,0.35)";
        ctx.font = "22px 'IBM Plex Mono', monospace";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(pulse > 0.55 ? glyphs[i % glyphs.length] : "·", x + size / 2, y + size / 2 + 1);
      }
    }
    id = requestAnimationFrame(frame);
  }
  id = requestAnimationFrame(frame);
  return () => cancelAnimationFrame(id);
};
