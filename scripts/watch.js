#!/usr/bin/env node
// watch.js
// Watches for .flf/.tlf font changes AND .chars mapping file changes.
//
// • Font change    → delta-updates Examples.md, renders changed font to console
// • .chars change  → applies mapping (input.flf → input-b.flf),
//                    immediately renders preview, then delta-updates Examples.md

const fs = require("fs");
const path = require("path");
const { execSync, spawnSync } = require("child_process");
const { cmdApply, fontFromChars, defaultOutputFont } = require("./font-chars");

const ROOT = path.resolve(__dirname, "..");
const EXAMPLES = path.join(ROOT, "Examples.md");

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

// ---------------------------------------------------------------------------
// Render a font preview to stdout (clears previous output first)
// ---------------------------------------------------------------------------

function renderFontPreview(fontPath, label, color, status) {
  const fontFile = path.basename(fontPath);
  const fontName = fontFile.replace(/\.[ft]lf$/, "");

  const result = spawnSync("figlet", ["-d", ROOT, "-f", fontName, fontName], {
    encoding: "utf8",
  });

  const rendered = (result.stdout || "").replace(/\s+$/, "");
  const lines = rendered.split("\n");

  const output = [
    `${BOLD}${color}▶ ${label || fontFile}${RESET}`,
    `${DIM}${"─".repeat(60)}${RESET}`,
    ...lines,
    `${DIM}${"─".repeat(60)}${RESET}`,
    `${GREEN}${status || "✓"}${RESET}  ${DIM}${new Date().toLocaleTimeString()}${RESET}`,
    "",
  ];

  clearPreviousOutput();
  process.stdout.write(output.join("\n"));
  lastOutputLines = output.length;
}

// ---------------------------------------------------------------------------
// Delta update: replace one font's section in Examples.md
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

  // Find the section for this font: starts with "FontFile\n```" and ends before the next font entry
  // Pattern: fontFile\n```\n...```\n\n\n
  const escaped = fontFile.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const sectionRe = new RegExp(
    `${escaped}\\n\`\`\`\\n[\\s\\S]*?\`\`\`\\n\\n\\n`,
    "g",
  );

  if (!sectionRe.test(content)) {
    // Font not yet in Examples.md — fall back to full regeneration
    return false;
  }

  const newSection = renderFontToMd(fontPath);
  const updated = content.replace(sectionRe, newSection);

  if (updated === content) return false; // nothing changed

  fs.writeFileSync(EXAMPLES, updated, "utf8");
  return true;
}

function fullRegenerate() {
  const GENERATE = path.join(__dirname, "generate_examples.sh");
  execSync(`bash "${GENERATE}"`, { stdio: "pipe" });
}

// ---------------------------------------------------------------------------
// Handle a changed font file
// ---------------------------------------------------------------------------

function onFontChange(fontPath) {
  try {
    const updated = deltaUpdateExamples(fontPath);
    const status = updated
      ? "✓ Examples.md updated (delta)"
      : "✓ Examples.md regenerated (full)";
    if (!updated) fullRegenerate();
    renderFontPreview(fontPath, path.basename(fontPath), CYAN, status);
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

  try {
    if (!fs.existsSync(inputFont)) {
      throw new Error(`Input font not found: ${inputFont}`);
    }

    // 1. Apply the mapping immediately
    cmdApply(inputFont, charsPath, outputFont);

    // 2. Render preview RIGHT NOW (before Examples.md update)
    renderFontPreview(
      outputFont,
      `${outputName}  ${DIM}(${charsName} → ${inputName})${RESET}`,
      MAGENTA,
      "⟳ Updating Examples.md...",
    );

    // 3. Delta-update Examples.md for the output font
    const updated = deltaUpdateExamples(outputFont);
    if (!updated) fullRegenerate();

    // 4. Re-render with final status
    const status = updated
      ? "✓ Examples.md updated (delta)"
      : "✓ Examples.md regenerated (full)";
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
    `${DIM}• Edit any .flf/.tlf  → preview + delta Examples.md update${RESET}\n` +
    `${DIM}• Edit any .chars     → apply mapping, instant preview, delta update${RESET}\n\n`,
);
lastOutputLines = 5;

process.on("SIGINT", () => {
  dirWatcher.close();
  for (const w of fontWatchers.values()) w.close();
  for (const w of charsWatchers.values()) w.close();
  process.stdout.write(`\n${DIM}Watcher stopped.${RESET}\n`);
  process.exit(0);
});
