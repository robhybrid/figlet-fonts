#!/usr/bin/env node
// preview.js
// Renders fonts to stdout using a sample phrase (or every drawable glyph).
// Shows the font file as-is — it does not apply a sibling .chars mapping.
// Use `npm run apply` or `npm start` for mapped previews.
//
// Usage:
//   node scripts/preview.js [options] [-- figlet-options]
//
// Options:
//   -t, --text <text>    Sample text (default: pangram)
//   -a, --all            Render every drawable glyph defined in each font
//   -f, --filter <glob>  Only show fonts matching pattern (e.g. "AMC*")
//   -n, --name           Also print font name before each sample
//   -w, --watch          Stay open; re-render when the font or .chars file changes
//   --no-color           Disable ANSI color
//   --                   Extra layout flags: -c (center) -r (right) -w N
//
// Examples:
//   node scripts/preview.js
//   node scripts/preview.js -t "Hello World"
//   node scripts/preview.js -t "Hello" -- -c
//   node scripts/preview.js -t "ABC" -f "Doom*"
//   node scripts/preview.js -a -f Broadway.flf
//   node scripts/preview.js -a -f "AMC Neko.flf" -w
//   node scripts/preview.js -- -w 120

const fs = require("fs");
const path = require("path");
const {
  loadFont,
  drawableCodes,
  listDefinedChars,
  specimenText,
  formatCharset,
  renderFont,
  parseFigletArgs,
  parseCodeTag,
} = require("./figlet-render");
const { defaultCharsPath } = require("./font-chars");

const ROOT = path.resolve(__dirname, "..");
const DEFAULT_TEXT = "Mr. Jock, TV quiz PhD, bags few lynx.";

const ESC = "\x1b";
const RESET = `${ESC}[0m`;
const BOLD = `${ESC}[1m`;
const CYAN = `${ESC}[36m`;
const DIM = `${ESC}[2m`;
const YELLOW = `${ESC}[33m`;
const GREEN = `${ESC}[32m`;

let sampleText = DEFAULT_TEXT;
let dumpAllChars = false;
let filterPatterns = [];
let showName = true;
let useColor = process.stdout.isTTY;
let watchMode = false;
let figletArgs = [];

const HELP = `
preview.js — render FIGlet fonts with a sample phrase

Usage:
  node scripts/preview.js [font.flf | glob] [options] [-- figlet-options]

Renders the font file as-is. A sibling .chars mapping is not applied
(use apply / npm start for that).

Options:
  -t, --text <text>    Sample text  (default: "${DEFAULT_TEXT}")
  -a, --all            Render every drawable glyph the font actually defines
                       (skips empty placeholders; includes Latin-1 / extra codes)
  -f, --filter <pat>   Only fonts whose filename matches pattern (* wildcards ok)
                       (a bare filename or glob also works: preview Broadway.flf)
  -w, --watch          Stay open and re-render when the font or .chars file changes
  --no-color           Disable ANSI color output
  -h, --help           Show this help

Layout options (after --):
  -c (center)  -r (right)  -w N (wrap width)

Examples:
  node scripts/preview.js
  node scripts/preview.js Broadway.flf
  node scripts/preview.js -a Broadway.flf -w
  node scripts/preview.js -t "Hello World"
  node scripts/preview.js "AMC*" -t "Test"
  node scripts/preview.js -- -c -w 160
`;

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
    filterPatterns.push(normalizeFilter(args[++i]));
  } else if (a === "-a" || a === "--all" || a === "--all-chars") {
    dumpAllChars = true;
  } else if (a === "-n" || a === "--name") {
    showName = true;
  } else if (a === "-w" || a === "--watch" || a === "-watch") {
    watchMode = true;
  } else if (a === "--no-color") {
    useColor = false;
  } else if (a === "-h" || a === "--help") {
    console.log(HELP);
    process.exit(0);
  } else if (!a.startsWith("-")) {
    filterPatterns.push(normalizeFilter(a));
  }
  i++;
}

function c(code, str) {
  return useColor ? `${code}${str}${RESET}` : str;
}

function normalizeFilter(raw) {
  if (raw == null || raw === "") return raw;
  let pat = path.basename(String(raw));
  if (/\.chars$/i.test(pat)) pat = pat.replace(/\.chars$/i, ".flf");
  if (!/[*?]/.test(pat) && !/\.[ft]lf$/i.test(pat)) pat += ".flf";
  return pat;
}

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

function listFilteredFonts() {
  const fonts = fs
    .readdirSync(ROOT)
    .filter((e) => /\.[ft]lf$/.test(e))
    .sort();
  if (!filterPatterns.length) return fonts;
  return fonts.filter((f) =>
    filterPatterns.some(
      (p) => matchGlob(p, f) || matchGlob(p.replace(/\.[ft]lf$/i, ".tlf"), f),
    ),
  );
}

function filterLabel() {
  return filterPatterns.join(", ");
}

function renderOnce(opts = {}) {
  const termWidth = process.stdout.columns || 80;
  const extra = parseFigletArgs(figletArgs);
  const width = extra.width || termWidth;
  const sep = c(DIM, "─".repeat(termWidth));
  const chunks = [];
  const filtered = listFilteredFonts();

  if (filtered.length === 0) {
    return {
      text:
        `${YELLOW}No fonts found${filterPatterns.length ? ` matching "${filterLabel()}"` : ""}${RESET}\n`,
      errors: 1,
      fonts: [],
    };
  }

  let errors = 0;

  for (const fontFile of filtered) {
    const fontPath = path.join(ROOT, fontFile);

    let font;
    try {
      font = loadFont(fontPath);
    } catch (err) {
      chunks.push(c(YELLOW, `⚠ Skipped ${fontFile}: ${err.message}\n`));
      errors++;
      continue;
    }

    let charset = null;
    let text = sampleText;
    if (dumpAllChars) {
      charset = drawableCodes(font);
      text = specimenText(charset);
      if (!text) {
        chunks.push(c(YELLOW, `⚠ Skipped ${fontFile}: no drawable glyphs\n`));
        errors++;
        continue;
      }
    }

    let rendered;
    try {
      rendered = renderFont(text, {
        fontPath,
        width,
        align: extra.align,
        figletArgs,
      });
    } catch (err) {
      chunks.push(c(YELLOW, `⚠ Skipped ${fontFile}: ${err.message}\n`));
      errors++;
      continue;
    }

    if (showName) {
      let label = `▶ ${fontFile}`;
      if (charset) {
        label += `  (${charset.length} chars: ${formatCharset(charset)})`;
      }
      chunks.push(c(BOLD + CYAN, label) + "\n");
    }
    chunks.push(sep + "\n");
    chunks.push(rendered + "\n");
    chunks.push(sep + "\n\n");
  }

  if (errors > 0 && !opts.quietErrors) {
    chunks.push(c(YELLOW, `\n⚠ ${errors} font(s) skipped due to errors\n`));
  }

  return { text: chunks.join(""), errors, fonts: filtered };
}

function debounce(fn, ms) {
  let t;
  return (...a) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...a), ms);
  };
}

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

function startWatch() {
  const fontWatchers = new Map();
  const charsWatchers = new Map();
  const redraw = debounce((reason) => {
    const { text, fonts } = renderOnce({ quietErrors: true });
    const names = fonts.join(", ") || filterLabel() || "fonts";
    const charsNote = fonts
      .map((f) => path.basename(defaultCharsPath(path.join(ROOT, f))))
      .filter((name, idx, arr) => arr.indexOf(name) === idx)
      .join(", ");
    process.stdout.write(`${ESC}[2J${ESC}[H`);
    process.stdout.write(text);
    process.stdout.write(
      c(
        DIM,
        `watching ${names}` +
          (charsNote ? `  +  ${charsNote}` : "") +
          (reason ? `  (${reason})` : "") +
          `  ${new Date().toLocaleTimeString()}  Ctrl+C to quit\n`,
      ),
    );
    attachWatches();
  }, 80);

  function attachWatches() {
    for (const fontFile of listFilteredFonts()) {
      const fontPath = path.join(ROOT, fontFile);
      watchPath(fontPath, fontWatchers, () =>
        redraw(path.basename(fontPath)),
      );
      watchPath(defaultCharsPath(fontPath), charsWatchers, (p) =>
        redraw(path.basename(p)),
      );
    }
  }

  const dirWatcher = fs.watch(ROOT, (event, filename) => {
    if (!filename) return;
    const isFont = /\.[ft]lf$/i.test(filename);
    const isChars = /\.chars$/i.test(filename);
    if (!isFont && !isChars) return;
    if (filterPatterns.length) {
      const stem = filename.replace(/\.(flf|tlf|chars)$/i, "");
      const candidates = [
        filename,
        `${stem}.flf`,
        `${stem}.tlf`,
        `${stem}.chars`,
      ];
      if (
        !filterPatterns.some((p) =>
          candidates.some((name) => matchGlob(p, name)),
        )
      ) {
        return;
      }
    }
    attachWatches();
    redraw(filename);
  });

  attachWatches();
  redraw("start");

  process.on("SIGINT", () => {
    dirWatcher.close();
    for (const w of fontWatchers.values()) w.close();
    for (const w of charsWatchers.values()) w.close();
    process.stdout.write(`\n${c(GREEN, "Watcher stopped.")}\n`);
    process.exit(0);
  });
}

if (require.main === module) {
  if (watchMode) {
    if (!process.stdout.isTTY) {
      console.error("preview --watch requires a terminal (stdout is not a TTY).");
      process.exit(1);
    }
    startWatch();
  } else {
    const { text, errors, fonts } = renderOnce();
    if (fonts.length === 0) {
      process.stderr.write(text);
      process.exit(1);
    }
    process.stdout.write(text);
    if (errors > 0) process.exitCode = 1;
  }
}

module.exports = {
  listDefinedChars,
  formatCharset,
  specimenText,
  parseCodeTag,
};
