#!/usr/bin/env node
// preview.js
// Renders all fonts to stdout using a sample phrase.
// Passes any extra figlet flags directly to figlet.
//
// Usage:
//   node scripts/preview.js [options] [-- figlet-options]
//
// Options:
//   -t, --text <text>    Sample text (default: pangram)
//   -f, --filter <glob>  Only show fonts matching pattern (e.g. "AMC*")
//   -n, --name           Also print font name before each sample
//   --no-color           Disable ANSI color
//   --                   Everything after -- is passed directly to figlet
//
// Examples:
//   node scripts/preview.js
//   node scripts/preview.js -t "Hello World"
//   node scripts/preview.js -t "Hello" -- -c        (centered)
//   node scripts/preview.js -t "ABC" -f "Doom*"
//   node scripts/preview.js -- -w 120

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const ROOT = path.resolve(__dirname, "..");
const DEFAULT_TEXT = "Mr. Jock, TV quiz PhD, bags few lynx.";

// ANSI
const ESC = "\x1b";
const RESET = `${ESC}[0m`;
const BOLD = `${ESC}[1m`;
const CYAN = `${ESC}[36m`;
const DIM = `${ESC}[2m`;
const YELLOW = `${ESC}[33m`;

// ---------------------------------------------------------------------------
// Argument parsing
// ---------------------------------------------------------------------------

let sampleText = DEFAULT_TEXT;
let filterPattern = null;
let showName = true;
let useColor = process.stdout.isTTY;
let figletArgs = [];

const args = process.argv.slice(2);
let i = 0;
while (i < args.length) {
  const a = args[i];
  if (a === "--") {
    figletArgs = args.slice(i + 1);
    break;
  } else if (a === "-t" || a === "--text") {
    sampleText = args[++i];
  } else if (a === "-f" || a === "--filter") {
    filterPattern = args[++i];
  } else if (a === "-n" || a === "--name") {
    showName = true;
  } else if (a === "--no-color") {
    useColor = false;
  } else if (a === "-h" || a === "--help") {
    console.log(`
preview.js — render all FIGlet fonts with a sample phrase

Usage:
  node scripts/preview.js [options] [-- figlet-options]

Options:
  -t, --text <text>    Sample text  (default: "${DEFAULT_TEXT}")
  -f, --filter <pat>   Only fonts whose filename matches pattern (* wildcards ok)
  --no-color           Disable ANSI color output
  -h, --help           Show this help

Figlet options (after --):
  Any flag supported by figlet, e.g. -c (center) -r (right) -w 120

Examples:
  node scripts/preview.js
  node scripts/preview.js -t "Hello World"
  node scripts/preview.js -f "AMC*" -t "Test"
  node scripts/preview.js -- -c -w 160
  node scripts/preview.js -t "ABC" -- -w 80
`);
    process.exit(0);
  }
  i++;
}

function c(code, str) {
  return useColor ? `${code}${str}${RESET}` : str;
}

// ---------------------------------------------------------------------------
// Glob-style pattern matching (supports * and ?)
// ---------------------------------------------------------------------------

function matchGlob(pattern, str) {
  const re = new RegExp(
    "^" +
      pattern
        .replace(/[.+^${}()|[\]\\]/g, "\\$&")
        .replace(/\*/g, ".*")
        .replace(/\?/g, ".") +
      "$",
    "i",
  );
  return re.test(str);
}

// ---------------------------------------------------------------------------
// Collect fonts
// ---------------------------------------------------------------------------

const width = process.stdout.columns || 80;
const sep = c(DIM, "─".repeat(width));

const entries = fs.readdirSync(ROOT).sort();
const fonts = entries.filter((e) => /\.[ft]lf$/.test(e));

const filtered = filterPattern
  ? fonts.filter((f) => matchGlob(filterPattern, f))
  : fonts;

if (filtered.length === 0) {
  console.error(
    `${YELLOW}No fonts found${filterPattern ? ` matching "${filterPattern}"` : ""}${RESET}`,
  );
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Render each font
// ---------------------------------------------------------------------------

let errors = 0;

for (const fontFile of filtered) {
  const fontName = fontFile.replace(/\.[ft]lf$/, "");

  const result = spawnSync(
    "figlet",
    [
      "-d",
      ROOT,
      "-f",
      fontName,
      "-w",
      String(width),
      ...figletArgs,
      sampleText,
    ],
    { encoding: "utf8" },
  );

  if (result.error || result.status !== 0) {
    process.stderr.write(
      c(
        YELLOW,
        `⚠ Skipped ${fontFile}: ${result.stderr || result.error?.message || "unknown error"}\n`,
      ),
    );
    errors++;
    continue;
  }

  const rendered = (result.stdout || "").replace(/\s+$/, "");

  if (showName) {
    process.stdout.write(c(BOLD + CYAN, `▶ ${fontFile}`) + "\n");
  }
  process.stdout.write(sep + "\n");
  process.stdout.write(rendered + "\n");
  process.stdout.write(sep + "\n\n");
}

if (errors > 0) {
  process.stderr.write(
    c(YELLOW, `\n⚠ ${errors} font(s) skipped due to errors\n`),
  );
}
