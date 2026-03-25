#!/usr/bin/env node
// watch.js
// Watches for .flf/.tlf font file changes, regenerates Examples.md,
// and renders the changed font to the console (clearing previous output).

const fs = require("fs");
const path = require("path");
const { execSync, spawnSync } = require("child_process");

const ROOT = path.resolve(__dirname, "..");
const EXAMPLES = path.join(ROOT, "Examples.md");
const GENERATE = path.join(__dirname, "generate_examples.sh");

// ANSI helpers
const ESC = "\x1b";
const CLEAR_LINE = `${ESC}[2K\r`;
const MOVE_UP = (n) => `${ESC}[${n}A`;
const RESET = `${ESC}[0m`;
const BOLD = `${ESC}[1m`;
const CYAN = `${ESC}[36m`;
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

function renderFont(fontPath) {
  const fontFile = path.basename(fontPath);
  const fontName = fontFile.replace(/\.[ft]lf$/, "");

  const result = spawnSync("figlet", ["-d", ROOT, "-f", fontName, fontName], {
    encoding: "utf8",
  });

  const rendered = result.stdout || "";
  const lines = rendered.split("\n");

  const output = [
    `${BOLD}${CYAN}▶ ${fontFile}${RESET}`,
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

function regenerate(changedPath) {
  try {
    execSync(`bash "${GENERATE}"`, { stdio: "pipe" });
    renderFont(changedPath);
  } catch (err) {
    clearPreviousOutput();
    const msg = `${YELLOW}⚠ Error regenerating: ${err.message}${RESET}\n`;
    process.stdout.write(msg);
    lastOutputLines = 1;
  }
}

// Watch for font file changes
const watchers = new Map();

function watchFont(filePath) {
  if (watchers.has(filePath)) return;
  const w = fs.watch(filePath, (event) => {
    if (event === "change") {
      regenerate(filePath);
    }
    if (event === "rename") {
      w.close();
      watchers.delete(filePath);
    }
  });
  watchers.set(filePath, w);
}

function scanAndWatch() {
  const entries = fs.readdirSync(ROOT);
  for (const entry of entries) {
    if (/\.[ft]lf$/.test(entry)) {
      watchFont(path.join(ROOT, entry));
    }
  }
}

// Watch the root directory for new font files being added
const dirWatcher = fs.watch(ROOT, (event, filename) => {
  if (filename && /\.[ft]lf$/.test(filename)) {
    const full = path.join(ROOT, filename);
    if (fs.existsSync(full)) {
      watchFont(full);
      regenerate(full);
    }
  }
});

scanAndWatch();

const count = watchers.size;
process.stdout.write(
  `${BOLD}figlet-fonts watcher${RESET}\n` +
    `${DIM}Watching ${count} fonts in ${ROOT}${RESET}\n` +
    `${DIM}Edit any .flf or .tlf file to see it rendered here...${RESET}\n\n`,
);
lastOutputLines = 4;

process.on("SIGINT", () => {
  dirWatcher.close();
  for (const w of watchers.values()) w.close();
  process.stdout.write(`\n${DIM}Watcher stopped.${RESET}\n`);
  process.exit(0);
});
