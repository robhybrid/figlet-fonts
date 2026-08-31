#!/usr/bin/env node
// watch.js
// Live-preview a font + its .chars mapping. Dry-run by default (does not
// write the -b variant until you press W or pass --write).
//
// Usage:
//   node scripts/watch.js [font.flf|.chars] [options]
//
// Options:
//   -h, --help     Show this help
//   --write        Auto-write <font>-b.flf on each save
//   -a             Start in all-chars render mode
//
// Keys: (N)ame  (A)ll chars  (S)ample  (E)nter text  (W)rite -b font

const fs = require("fs");
const path = require("path");
const readline = require("readline");
const {
  applyMapping,
  fontFromChars,
  defaultOutputFont,
  defaultCharsPath,
} = require("./font-chars");
const {
  loadFont,
  parseFont,
  drawableCodes,
  specimenText,
  renderFont,
} = require("./figlet-render");

const ROOT = path.resolve(__dirname, "..");
const DEFAULT_SAMPLE = "Mr. Jock, TV quiz PhD, bags few lynx.";
const ALL_CHARS =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZ\nabcdefghijklmnopqrstuvwxyz\n0123456789\n!@#$%^&*()-_=+[]{}|;':\",./<>?";

const HELP = `
watch.js — live font + .chars preview (dry-run)

Usage:
  node scripts/watch.js [font.flf | font.chars] [options]
  npm start -- Broadway.flf

Watches the source font and its sibling .chars file. On save, applies the
mapping in memory and previews it. Does not write <font>-b.flf unless you
press W or pass --write.

Options:
  -h, --help     Show this help
  --write        Write the -b variant on every save (old auto-save behavior)
  -a             Start in all-chars mode

Keys:
  N    Render font name (default)
  A    Render every drawable glyph
  S    Render sample pangram
  E    Enter custom sample text
  W    Write the current mapping to <font>-b.flf
  Ctrl+C  Quit
`;

const args = process.argv.slice(2);
if (args.includes("-h") || args.includes("--help")) {
  console.log(HELP);
  process.exit(0);
}

const writeOnSave = args.includes("--write");
let renderMode = args.includes("-a") ? "A" : "N";
let customSample = DEFAULT_SAMPLE;
let lastFontPath = null;
let lastBuilt = null; // in-memory mapped font from last preview

let focusFont = null;
for (const a of args) {
  if (a.startsWith("-")) continue;
  const resolved = path.resolve(a);
  if (/\.chars$/i.test(a)) {
    focusFont = fontFromChars(resolved);
  } else if (/\.[ft]lf$/i.test(a)) {
    focusFont = resolved;
  } else {
    console.error(`Unknown argument: ${a}\n${HELP}`);
    process.exit(1);
  }
}

const ESC = "\x1b";
const RESET = `${ESC}[0m`;
const BOLD = `${ESC}[1m`;
const CYAN = `${ESC}[36m`;
const MAGENTA = `${ESC}[35m`;
const YELLOW = `${ESC}[33m`;
const GREEN = `${ESC}[32m`;
const DIM = `${ESC}[2m`;
const BLUE = `${ESC}[34m`;

function debounce(fn, ms) {
  let t;
  return (...a) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...a), ms);
  };
}

function clearPreviousOutput() {
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

function getRenderText(fontName, font) {
  switch (renderMode) {
    case "N":
      return fontName;
    case "A":
      return font ? specimenText(drawableCodes(font)) : ALL_CHARS;
    case "S":
      return DEFAULT_SAMPLE;
    case "E":
      return customSample;
  }
}

function termWidth() {
  return process.stdout.columns || 80;
}

function charsForFont(fontPath) {
  return defaultCharsPath(fontPath);
}

function mapIfChars(fontPath) {
  const charsPath = charsForFont(fontPath);
  if (!fs.existsSync(charsPath)) return null;
  return applyMapping(fontPath, charsPath);
}

function renderMapped(fontPath, label, color, status) {
  const fontFile = path.basename(fontPath);
  const fontName = fontFile.replace(/\.[ft]lf$/, "");
  const width = termWidth();
  const charsPath = charsForFont(fontPath);

  let rendered = "";
  let note = "";
  lastBuilt = null;

  try {
    const built = fs.existsSync(charsPath) ? mapIfChars(fontPath) : null;
    let fontSource;
    if (built && built.mapping.size) {
      fontSource = built.text;
      lastBuilt = built;
      note = `  ${DIM}${path.basename(charsPath)} → ${path.basename(built.dest)}${RESET}`;
      if (built.relocate && !built.relocate.declined) {
        note += `  ${YELLOW}hardblank "${built.relocate.from}" → "${built.relocate.to}"${RESET}`;
      }
      if (built.errors && built.errors.length) {
        note += `  ${YELLOW}(${built.errors.length} mapping warning${built.errors.length > 1 ? "s" : ""})${RESET}`;
      }
    } else if (built && built.errors && built.errors.length) {
      note = `  ${YELLOW}mapping errors in ${path.basename(charsPath)}${RESET}`;
    }

    const font = fontSource ? parseFont(fontSource) : loadFont(fontPath);
    const text = getRenderText(fontName, font) || fontName;
    rendered = renderFont(text, { fontPath, fontSource, width });
  } catch (err) {
    rendered = `${YELLOW}⚠ ${err.message}${RESET}`;
  }

  const lines = rendered.split("\n");
  const sep = `${DIM}${"─".repeat(width)}${RESET}`;
  const dry = writeOnSave ? "auto-write" : "dry-run";
  const modeLine = `${DIM}Mode: ${RESET}${BOLD}${modeLabel()}${RESET}  ${DIM}(N)ame (A)ll (S)ample (E)nter (W)rite   [${dry}]${RESET}`;

  const output = [
    `${BOLD}${color}▶ ${label || fontFile}${RESET}${note}`,
    sep,
    ...lines,
    sep,
    `${GREEN}${status || "✓"}${RESET}  ${DIM}${new Date().toLocaleTimeString()}${RESET}`,
    modeLine,
    "",
  ];

  clearPreviousOutput();
  process.stdout.write(output.join("\n"));
}

function onSourceChange(fontPath) {
  lastFontPath = fontPath;
  const extra = writeOnSave ? maybeWrite(fontPath) : null;
  const status = extra || `✓ preview ${path.basename(fontPath)}`;
  renderMapped(fontPath, path.basename(fontPath), CYAN, status);
}

function onCharsChange(charsPath) {
  const inputFont = fontFromChars(charsPath);
  lastFontPath = inputFont;
  if (!fs.existsSync(inputFont)) {
    clearPreviousOutput();
    process.stdout.write(
      `${YELLOW}⚠ Input font not found: ${inputFont}${RESET}\n`,
    );
    return;
  }
  const extra = writeOnSave ? maybeWrite(inputFont) : null;
  const status =
    extra ||
    `✓ dry-run ${path.basename(charsPath)}  (W to write ${path.basename(defaultOutputFont(inputFont))})`;
  renderMapped(
    inputFont,
    path.basename(inputFont),
    MAGENTA,
    status,
  );
}

function maybeWrite(fontPath) {
  const built = mapIfChars(fontPath);
  if (!built || !built.mapping.size) return "✓ no mapping changes to write";
  fs.writeFileSync(built.dest, built.text, "utf8");
  lastBuilt = built;
  return `✓ wrote ${path.basename(built.dest)}`;
}

function writeNow() {
  if (!lastFontPath) {
    process.stdout.write(`${YELLOW}No font loaded yet.${RESET}\n`);
    return;
  }
  const status = maybeWrite(lastFontPath);
  renderMapped(lastFontPath, path.basename(lastFontPath), GREEN, status);
}

function rerender() {
  if (!lastFontPath) return;
  renderMapped(
    lastFontPath,
    path.basename(lastFontPath),
    CYAN,
    `✓ Mode: ${modeLabel()}`,
  );
}

function promptEnterText() {
  if (process.stdin.isTTY) process.stdin.setRawMode(false);
  clearPreviousOutput();
  process.stdout.write(`\n${BLUE}Enter sample text: ${RESET}`);

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
    if (lastFontPath) rerender();
    else process.stdout.write(`${GREEN}Sample set. Waiting for a file change...${RESET}\n`);
  });
}

function setupKeyboard() {
  if (!process.stdin.isTTY) return;
  process.stdin.setRawMode(true);
  process.stdin.resume();
  process.stdin.setEncoding("utf8");
  process.stdin.on("data", (key) => {
    if (key === "\u0003") {
      process.emit("SIGINT");
      return;
    }
    const k = key.toLowerCase();
    if (k === "n") {
      renderMode = "N";
      rerender();
    } else if (k === "a") {
      renderMode = "A";
      rerender();
    } else if (k === "s") {
      renderMode = "S";
      rerender();
    } else if (k === "e") {
      promptEnterText();
    } else if (k === "w") {
      writeNow();
    }
  });
}

const fontWatchers = new Map();
const charsWatchers = new Map();

function watchPath(filePath, map, onChange) {
  if (map.has(filePath) || !fs.existsSync(filePath)) return;
  const fire = debounce(() => onChange(filePath), 80);
  const start = () => {
    try {
      const w = fs.watch(filePath, (event) => {
        if (event === "rename") {
          w.close();
          map.delete(filePath);
          setTimeout(() => {
            if (fs.existsSync(filePath)) {
              start();
              fire();
            }
          }, 50);
          return;
        }
        fire();
      });
      map.set(filePath, w);
    } catch {
      /* file vanished */
    }
  };
  start();
}

function matchesFocus(filename) {
  if (!focusFont) return true;
  const base = path.basename(focusFont).replace(/\.[ft]lf$/i, "");
  const stem = filename.replace(/\.(flf|tlf|chars)$/i, "");
  return stem === base;
}

function scanAndWatch() {
  if (focusFont) {
    watchPath(focusFont, fontWatchers, onSourceChange);
    watchPath(charsForFont(focusFont), charsWatchers, onCharsChange);
    return;
  }
  for (const entry of fs.readdirSync(ROOT)) {
    const full = path.join(ROOT, entry);
    if (/\.[ft]lf$/.test(entry)) watchPath(full, fontWatchers, onSourceChange);
    if (/\.chars$/.test(entry)) watchPath(full, charsWatchers, onCharsChange);
  }
}

const dirWatcher = fs.watch(ROOT, (event, filename) => {
  if (!filename || !matchesFocus(filename)) return;
  const full = path.join(ROOT, filename);
  if (!fs.existsSync(full)) return;
  if (/\.[ft]lf$/.test(filename)) {
    watchPath(full, fontWatchers, onSourceChange);
    onSourceChange(full);
  }
  if (/\.chars$/.test(filename)) {
    watchPath(full, charsWatchers, onCharsChange);
    onCharsChange(full);
  }
});

scanAndWatch();
setupKeyboard();

const fontCount = fontWatchers.size;
const charsCount = charsWatchers.size;
const focusLabel = focusFont
  ? path.basename(focusFont)
  : `${fontCount} fonts + ${charsCount} .chars files`;

process.stdout.write(
  `${BOLD}figlet-fonts watcher${RESET}  ${DIM}[${writeOnSave ? "auto-write" : "dry-run"}]${RESET}\n` +
    `${DIM}Watching ${focusLabel} in ${ROOT}${RESET}\n` +
    `${DIM}• Edit the .flf/.tlf or .chars file → live preview${RESET}\n` +
    `${DIM}• Keys: (N)ame  (A)ll chars  (S)ample  (E)nter text  (W)rite -b${RESET}\n` +
    `${DIM}• ${writeOnSave ? "Auto-writing -b on save." : "Dry-run: nothing written until you press W."}${RESET}\n\n`,
);

if (focusFont && fs.existsSync(focusFont)) {
  onSourceChange(focusFont);
} else if (charsWatchers.size && !focusFont) {
  const firstChars = [...charsWatchers.keys()][0];
  if (firstChars) onCharsChange(firstChars);
}

process.on("SIGINT", () => {
  dirWatcher.close();
  for (const w of fontWatchers.values()) w.close();
  for (const w of charsWatchers.values()) w.close();
  if (process.stdin.isTTY) process.stdin.setRawMode(false);
  process.stdout.write(`\n${DIM}Watcher stopped.${RESET}\n`);
  process.exit(0);
});
