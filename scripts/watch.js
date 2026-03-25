#!/usr/bin/env node
// watch.js
// Watches for .flf/.tlf font changes AND .chars mapping file changes.
//
// • Font change    → regenerates Examples.md, renders changed font to console
// • .chars change  → runs font-chars apply (input.flf → input-b.flf),
//                    then regenerates Examples.md, renders the output font

const fs = require("fs");
const path = require("path");
const { execSync, spawnSync } = require("child_process");
const { cmdApply, fontFromChars, defaultOutputFont } = require("./font-chars");

const ROOT = path.resolve(__dirname, "..");
const GENERATE = path.join(__dirname, "generate_examples.sh");

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

let lastOutputLines = 0;

function clearPreviousOutput() {
  if (lastOutputLines > 0) {
    process.stdout.write(MOVE_UP(lastOutputLines));
    for (let i = 0; i < lastOutputLines; i++) {
      process.stdout.write(CLEAR_LINE + (i < lastOutputLines - 1 ? "\n" : ""));
    }
    if (lastOutputLines > 1) {
      process.stdout.write(MOVE_UP(lastOutputLines - 1));
    }
  }
}

function renderFont(fontPath, label, color) {
  const fontFile = path.basename(fontPath);
  const fontName = fontFile.replace(/\.[ft]lf$/, "");

  const result = spawnSync("figlet", ["-d", ROOT, "-f", fontName, fontName], {
    encoding: "utf8",
  });

  const rendered = result.stdout || "";
  const lines = rendered.split("\n");

  const output = [
    `${BOLD}${color}▶ ${label || fontFile}${RESET}`,
    `${DIM}${"─".repeat(60)}${RESET}`,
    ...lines,
    `${DIM}${"─".repeat(60)}${RESET}`,
    `${GREEN}✓ Examples.md regenerated${RESET}  ${DIM}${new Date().toLocaleTimeString()}${RESET}`,
    "",
  ];

  clearPreviousOutput();
  process.stdout.write(output.join("\n"));
  lastOutputLines = output.length;
}

function regenerateExamples() {
  execSync(`bash "${GENERATE}"`, { stdio: "pipe" });
}

// ---------------------------------------------------------------------------
// Handle a changed font file
// ---------------------------------------------------------------------------

function onFontChange(fontPath) {
  try {
    regenerateExamples();
    renderFont(fontPath, path.basename(fontPath), CYAN);
  } catch (err) {
    clearPreviousOutput();
    process.stdout.write(`${YELLOW}⚠ Error: ${err.message}${RESET}\n`);
    lastOutputLines = 1;
  }
}

// ---------------------------------------------------------------------------
// Handle a changed .chars file
// ---------------------------------------------------------------------------

function onCharsChange(charsPath) {
  const inputFont = fontFromChars(charsPath);
  const outputFont = defaultOutputFont(inputFont);
  const charsName = path.basename(charsPath);
  const inputName = path.basename(inputFont);
  const outputName = path.basename(outputFont);

  clearPreviousOutput();
  const msg =
    `${BOLD}${MAGENTA}▶ ${charsName}${RESET}  ` +
    `${DIM}${inputName} → ${outputName}${RESET}\n`;
  process.stdout.write(msg);
  lastOutputLines = 1;

  try {
    if (!fs.existsSync(inputFont)) {
      throw new Error(`Input font not found: ${inputFont}`);
    }
    // Apply the mapping: input.flf + input.chars → input-b.flf
    cmdApply(inputFont, charsPath, outputFont);
    regenerateExamples();
    renderFont(outputFont, `${outputName} (from ${charsName})`, MAGENTA);
  } catch (err) {
    clearPreviousOutput();
    process.stdout.write(
      `${YELLOW}⚠ Error applying ${charsName}: ${err.message}${RESET}\n`,
    );
    lastOutputLines = 1;
  }
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

// Watch root for new files
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

const fontCount = fontWatchers.size;
const charsCount = charsWatchers.size;

process.stdout.write(
  `${BOLD}figlet-fonts watcher${RESET}\n` +
    `${DIM}Watching ${fontCount} fonts + ${charsCount} .chars files in ${ROOT}${RESET}\n` +
    `${DIM}• Edit any .flf/.tlf → regenerates Examples.md${RESET}\n` +
    `${DIM}• Edit any .chars   → applies mapping and regenerates${RESET}\n\n`,
);
lastOutputLines = 5;

process.on("SIGINT", () => {
  dirWatcher.close();
  for (const w of fontWatchers.values()) w.close();
  for (const w of charsWatchers.values()) w.close();
  process.stdout.write(`\n${DIM}Watcher stopped.${RESET}\n`);
  process.exit(0);
});
