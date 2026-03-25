#!/usr/bin/env node
// watch.js
// Watches .flf/.tlf fonts and .chars mapping files.
//
// Interactive render modes (press key while running):
//   N  — render font Name (default)
//   A  — render All characters (abcdefghijklmnopqrstuvwxyz 0-9)
//   S  — render Sample text (pangram)
//   E  — Enter custom sample text
//
// • Font change   → preview + delta Examples.md update
// • .chars change → apply mapping, instant preview, delta update

const fs = require("fs");
const path = require("path");
const readline = require("readline");
const { execSync, spawnSync } = require("child_process");
const { cmdApply, fontFromChars, defaultOutputFont } = require("./font-chars");

const ROOT = path.resolve(__dirname, "..");
const EXAMPLES = path.join(ROOT, "Examples.md");

const DEFAULT_SAMPLE = "Mr. Jock, TV quiz PhD, bags few lynx.";
const ALL_CHARS =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZ\nabcdefghijklmnopqrstuvwxyz\n0123456789\n!@#$%^&*()-_=+[]{}|;':\",./<>?";

// Render state
let renderMode = "N"; // N | A | S | E
let customSample = DEFAULT_SAMPLE;
let lastFontPath = null;

// ANSI helpers
const ESC = "\x1b";
const CLEAR_LINE = `${ESC}[2K\r`;
const MOVE_UP = (n) => `${ESC}[${n}A`;
const RESET = `${ESC}[0m`;
const BOLD = `${ESC}[1m`;
const CYAN = `${ESC}[36m`;
const MAGENTA = `${ESC}[35m`;
const YELLOW = `${ESC}[33m`;
const GREEN = `${ESC}[32m`;
const DIM = `${ESC}[2m`;
const BLUE = `${ESC}[34m`;

let lastOutputLines = 0;

function clearPreviousOutput() {
  // Clear entire screen and move cursor to top-left
  process.stdout.write(`${ESC}[2J${ESC}[H`);
}

function modeLabel() {
  switch (renderMode) {
    case "N":
      return `[N] Name`;
    case "A":
      return `[A] All chars`;
    case "S":
      return `[S] Sample`;
    case "E":
      return `[E] "${customSample.slice(0, 30)}${customSample.length > 30 ? "…" : ""}"`;
  }
}

function getRenderText(fontName) {
  switch (renderMode) {
    case "N":
      return fontName;
    case "A":
      return ALL_CHARS;
    case "S":
      return DEFAULT_SAMPLE;
    case "E":
      return customSample;
  }
}

// ---------------------------------------------------------------------------
// Render a font preview to stdout
// ---------------------------------------------------------------------------

function renderFontPreview(fontPath, label, color, status) {
  const fontFile = path.basename(fontPath);
  const fontName = fontFile.replace(/\.[ft]lf$/, "");
  const text = getRenderText(fontName);

  const result = spawnSync("figlet", ["-d", ROOT, "-f", fontName, text], {
    encoding: "utf8",
  });

  const rendered = (result.stdout || "").replace(/\s+$/, "");
  const lines = rendered.split("\n");

  const modeLine = `${DIM}Mode: ${RESET}${BOLD}${modeLabel()}${RESET}  ${DIM}(N)ame (A)ll (S)ample (E)nter${RESET}`;

  const output = [
    `${BOLD}${color}▶ ${label || fontFile}${RESET}`,
    `${DIM}${"─".repeat(60)}${RESET}`,
    ...lines,
    `${DIM}${"─".repeat(60)}${RESET}`,
    `${GREEN}${status || "✓"}${RESET}  ${DIM}${new Date().toLocaleTimeString()}${RESET}`,
    modeLine,
    "",
  ];

  clearPreviousOutput();
  process.stdout.write(output.join("\n"));
  lastOutputLines = output.length;
}

// ---------------------------------------------------------------------------
// Delta update Examples.md
// ---------------------------------------------------------------------------

function renderFontToMd(fontPath) {
  const fontFile = path.basename(fontPath);
  const fontName = fontFile.replace(/\.[ft]lf$/, "");

  const result = spawnSync("figlet", ["-d", ROOT, "-f", fontName, fontName], {
    encoding: "utf8",
  });

  const rendered = result.stdout || "";
  return `${fontFile}\n\`\`\`\n${rendered}\`\`\`\n\n\n`;
}

function deltaUpdateExamples(fontPath) {
  if (!fs.existsSync(EXAMPLES)) return false;

  const fontFile = path.basename(fontPath);
  const content = fs.readFileSync(EXAMPLES, "utf8");

  const escaped = fontFile.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const sectionRe = new RegExp(
    `${escaped}\\n\`\`\`\\n[\\s\\S]*?\`\`\`\\n\\n\\n`,
    "g",
  );

  if (!sectionRe.test(content)) return false;

  const newSection = renderFontToMd(fontPath);
  const updated = content.replace(sectionRe, newSection);
  if (updated === content) return false;

  fs.writeFileSync(EXAMPLES, updated, "utf8");
  return true;
}

function fullRegenerate() {
  const GENERATE = path.join(__dirname, "generate_examples.sh");
  execSync(`bash "${GENERATE}"`, { stdio: "pipe" });
}

// ---------------------------------------------------------------------------
// Font / .chars change handlers
// ---------------------------------------------------------------------------

function onFontChange(fontPath) {
  lastFontPath = fontPath;
  try {
    const updated = deltaUpdateExamples(fontPath);
    if (!updated) fullRegenerate();
    const status = updated
      ? "✓ Examples.md updated (delta)"
      : "✓ Examples.md regenerated (full)";
    renderFontPreview(fontPath, path.basename(fontPath), CYAN, status);
  } catch (err) {
    clearPreviousOutput();
    process.stdout.write(`${YELLOW}⚠ Error: ${err.message}${RESET}\n`);
    lastOutputLines = 1;
  }
}

function onCharsChange(charsPath) {
  const inputFont = fontFromChars(charsPath);
  const outputFont = defaultOutputFont(inputFont);
  const charsName = path.basename(charsPath);
  const inputName = path.basename(inputFont);
  const outputName = path.basename(outputFont);
  lastFontPath = outputFont;

  try {
    if (!fs.existsSync(inputFont))
      throw new Error(`Input font not found: ${inputFont}`);

    // 1. Apply mapping
    cmdApply(inputFont, charsPath, outputFont);

    // 2. Instant preview
    renderFontPreview(
      outputFont,
      `${outputName}  ${DIM}(${charsName} → ${inputName})${RESET}`,
      MAGENTA,
      "⟳ Updating Examples.md...",
    );

    // 3. Delta update
    const updated = deltaUpdateExamples(outputFont);
    if (!updated) fullRegenerate();
    const status = updated
      ? "✓ Examples.md updated (delta)"
      : "✓ Examples.md regenerated (full)";

    // 4. Final render
    renderFontPreview(
      outputFont,
      `${outputName}  ${DIM}(${charsName} → ${inputName})${RESET}`,
      MAGENTA,
      status,
    );
  } catch (err) {
    clearPreviousOutput();
    process.stdout.write(
      `${YELLOW}⚠ Error applying ${charsName}: ${err.message}${RESET}\n`,
    );
    lastOutputLines = 1;
  }
}

// ---------------------------------------------------------------------------
// Interactive keyboard input
// ---------------------------------------------------------------------------

function promptEnterText() {
  // Temporarily disable raw mode to get a normal readline prompt
  if (process.stdin.isTTY) process.stdin.setRawMode(false);

  clearPreviousOutput();
  process.stdout.write(`\n${BLUE}Enter sample text: ${RESET}`);
  lastOutputLines = 0;

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  rl.question("", (answer) => {
    rl.close();
    customSample = answer.trim() || DEFAULT_SAMPLE;
    renderMode = "E";
    if (process.stdin.isTTY) {
      process.stdin.setRawMode(true);
      process.stdin.resume();
    }
    // Re-render last font with new text
    if (lastFontPath) {
      renderFontPreview(
        lastFontPath,
        path.basename(lastFontPath),
        CYAN,
        `✓ Mode: ${modeLabel()}`,
      );
    } else {
      process.stdout.write(
        `${GREEN}Sample set. Waiting for font change...${RESET}\n`,
      );
      lastOutputLines = 1;
    }
  });
}

function setupKeyboard() {
  if (!process.stdin.isTTY) return; // non-interactive (piped, CI, etc.)

  process.stdin.setRawMode(true);
  process.stdin.resume();
  process.stdin.setEncoding("utf8");

  process.stdin.on("data", (key) => {
    // Ctrl+C
    if (key === "\u0003") {
      process.emit("SIGINT");
      return;
    }

    const k = key.toLowerCase();

    if (k === "n") {
      renderMode = "N";
      if (lastFontPath)
        renderFontPreview(
          lastFontPath,
          path.basename(lastFontPath),
          CYAN,
          `✓ Mode: ${modeLabel()}`,
        );
    } else if (k === "a") {
      renderMode = "A";
      if (lastFontPath)
        renderFontPreview(
          lastFontPath,
          path.basename(lastFontPath),
          CYAN,
          `✓ Mode: ${modeLabel()}`,
        );
    } else if (k === "s") {
      renderMode = "S";
      if (lastFontPath)
        renderFontPreview(
          lastFontPath,
          path.basename(lastFontPath),
          CYAN,
          `✓ Mode: ${modeLabel()}`,
        );
    } else if (k === "e") {
      promptEnterText();
    }
  });
}

// ---------------------------------------------------------------------------
// File watchers
// ---------------------------------------------------------------------------

const fontWatchers = new Map();
const charsWatchers = new Map();

function watchFont(filePath) {
  if (fontWatchers.has(filePath)) return;
  const w = fs.watch(filePath, (event) => {
    if (event === "change") onFontChange(filePath);
    if (event === "rename") {
      w.close();
      fontWatchers.delete(filePath);
    }
  });
  fontWatchers.set(filePath, w);
}

function watchChars(filePath) {
  if (charsWatchers.has(filePath)) return;
  const w = fs.watch(filePath, (event) => {
    if (event === "change") onCharsChange(filePath);
    if (event === "rename") {
      w.close();
      charsWatchers.delete(filePath);
    }
  });
  charsWatchers.set(filePath, w);
}

function scanAndWatch() {
  const entries = fs.readdirSync(ROOT);
  for (const entry of entries) {
    const full = path.join(ROOT, entry);
    if (/\.[ft]lf$/.test(entry)) watchFont(full);
    if (/\.chars$/.test(entry)) watchChars(full);
  }
}

const dirWatcher = fs.watch(ROOT, (event, filename) => {
  if (!filename) return;
  const full = path.join(ROOT, filename);
  if (!fs.existsSync(full)) return;
  if (/\.[ft]lf$/.test(filename)) {
    watchFont(full);
    onFontChange(full);
  }
  if (/\.chars$/.test(filename)) {
    watchChars(full);
    onCharsChange(full);
  }
});

scanAndWatch();
setupKeyboard();

const fontCount = fontWatchers.size;
const charsCount = charsWatchers.size;

process.stdout.write(
  `${BOLD}figlet-fonts watcher${RESET}\n` +
    `${DIM}Watching ${fontCount} fonts + ${charsCount} .chars files in ${ROOT}${RESET}\n` +
    `${DIM}• Edit .flf/.tlf or .chars → auto-preview + Examples.md update${RESET}\n` +
    `${DIM}• Keys: (N)ame  (A)ll chars  (S)ample  (E)nter text${RESET}\n` +
    `${DIM}• Default sample: "${DEFAULT_SAMPLE}"${RESET}\n\n`,
);
lastOutputLines = 6;

process.on("SIGINT", () => {
  dirWatcher.close();
  for (const w of fontWatchers.values()) w.close();
  for (const w of charsWatchers.values()) w.close();
  if (process.stdin.isTTY) process.stdin.setRawMode(false);
  process.stdout.write(`\n${DIM}Watcher stopped.${RESET}\n`);
  process.exit(0);
});
