#!/usr/bin/env node
// In-process FIGlet renderer — no system `figlet` binary required.
// Parses .flf/.tlf, lists drawable glyphs, and concatenates them (full-width).

const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

const REQUIRED_CODES = (() => {
  const codes = [];
  for (let c = 32; c <= 126; c++) codes.push(c);
  codes.push(196, 214, 220, 228, 246, 252, 223);
  return codes;
})();

function parseCodeTag(line) {
  const m = String(line)
    .trim()
    .match(/^(-)?(0x[0-9a-fA-F]+|0[0-7]+|[0-9]+)(?:\s|$)/);
  if (!m) return null;
  const sign = m[1] ? -1 : 1;
  const tok = m[2];
  let n;
  if (/^0x/i.test(tok)) n = parseInt(tok, 16);
  else if (tok.length > 1 && tok.startsWith("0") && /^[0-7]+$/.test(tok)) {
    n = parseInt(tok, 8);
  } else n = parseInt(tok, 10);
  if (Number.isNaN(n)) return null;
  return sign * n;
}

function stripEndmark(line) {
  if (!line.length) return line;
  const end = line[line.length - 1];
  let i = line.length - 1;
  while (i >= 0 && line[i] === end) i--;
  return line.slice(0, i + 1);
}

function glyphInk(rows, hardblank) {
  return rows.join("\n").split(hardblank).join(" ");
}

function glyphHasInk(rows, hardblank) {
  return /[^\s]/.test(glyphInk(rows, hardblank));
}

function glyphIsIdentity(rows, hardblank, code) {
  if (code < 32) return false;
  try {
    const collapsed = glyphInk(rows, hardblank).replace(/\s+/g, "");
    return collapsed === String.fromCodePoint(code);
  } catch {
    return false;
  }
}

function isDrawableGlyph(rows, hardblank, code) {
  return glyphHasInk(rows, hardblank) && !glyphIsIdentity(rows, hardblank, code);
}

function readGlyph(body, idx, height) {
  if (idx + height > body.length) return { rows: null, next: body.length };
  return { rows: body.slice(idx, idx + height), next: idx + height };
}

function parseFont(src) {
  const lines = String(src)
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .split("\n");
  const header = lines[0] || "";
  if (!/^[ft]lf2/.test(header)) {
    throw new Error("Not a FIGlet/TOIlet font (missing flf2a/tlf2a header)");
  }

  const hardblank = header[5];
  const parts = header.split(/\s+/);
  const height = parseInt(parts[1], 10);
  const numComments = parseInt(parts[5] || "0", 10);
  if (!height || Number.isNaN(numComments)) {
    throw new Error("Could not parse font header");
  }

  const body = lines.slice(1 + numComments);
  const glyphs = new Map();
  let idx = 0;

  const store = (code, rows) => {
    if (!rows) return;
    glyphs.set(
      code,
      rows.map((row) => stripEndmark(row)),
    );
  };

  for (const code of REQUIRED_CODES) {
    const { rows, next } = readGlyph(body, idx, height);
    idx = next;
    if (!rows) break;
    store(code, rows);
  }

  while (idx < body.length) {
    while (idx < body.length && body[idx].trim() === "") idx++;
    if (idx >= body.length) break;
    const code = parseCodeTag(body[idx]);
    if (code === null) break;
    idx++;
    const { rows, next } = readGlyph(body, idx, height);
    idx = next;
    if (!rows) break;
    if (code >= 32 && code <= 0x10ffff) store(code, rows);
  }

  return { height, hardblank, glyphs };
}

function loadFont(fontPath) {
  return parseFont(fs.readFileSync(fontPath, "utf8"));
}

function drawableCodes(font) {
  const codes = [];
  for (const [code, rows] of font.glyphs) {
    if (isDrawableGlyph(rows, font.hardblank, code)) codes.push(code);
  }
  return codes.sort((a, b) => a - b);
}

function listDefinedChars(fontPath) {
  return drawableCodes(loadFont(fontPath));
}

function classifyCode(code) {
  if (code >= 65 && code <= 90) return "upper";
  if (code >= 97 && code <= 122) return "lower";
  if (code >= 48 && code <= 57) return "digit";
  if (code <= 126) return "punct";
  return "extra";
}

function specimenText(codes) {
  const groups = { upper: [], lower: [], digit: [], punct: [], extra: [] };
  for (const c of codes) {
    groups[classifyCode(c)].push(String.fromCodePoint(c));
  }
  return ["upper", "lower", "digit", "punct", "extra"]
    .map((k) => groups[k].join(""))
    .filter(Boolean)
    .join("\n");
}

function formatCharset(codes) {
  if (codes.length === 0) return "";
  const isRangeable = (c) =>
    (c >= 48 && c <= 57) || (c >= 65 && c <= 90) || (c >= 97 && c <= 122);
  const parts = [];
  let i = 0;
  while (i < codes.length) {
    if (isRangeable(codes[i])) {
      let j = i + 1;
      while (
        j < codes.length &&
        codes[j] === codes[j - 1] + 1 &&
        isRangeable(codes[j])
      ) {
        j++;
      }
      if (j - i >= 3) {
        parts.push(
          `${String.fromCodePoint(codes[i])}–${String.fromCodePoint(codes[j - 1])}`,
        );
      } else {
        parts.push(
          codes
            .slice(i, j)
            .map((c) => String.fromCodePoint(c))
            .join(""),
        );
      }
      i = j;
    } else {
      let j = i + 1;
      while (j < codes.length && !isRangeable(codes[j])) j++;
      parts.push(
        codes
          .slice(i, j)
          .map((c) => String.fromCodePoint(c))
          .join(""),
      );
      i = j;
    }
  }
  return parts.join(" ");
}

function glyphWidth(rows) {
  let w = 0;
  for (const row of rows) if (row.length > w) w = row.length;
  return w;
}

function glyphFor(font, code) {
  if (font.glyphs.has(code)) return font.glyphs.get(code);
  if (font.glyphs.has(32)) return font.glyphs.get(32);
  return Array(font.height).fill(" ");
}

function concatGlyphs(font, glyphList) {
  const lines = Array.from({ length: font.height }, () => "");
  for (const rows of glyphList) {
    const width = glyphWidth(rows);
    for (let i = 0; i < font.height; i++) {
      const row = (rows[i] || "").padEnd(width, " ");
      lines[i] += row.split(font.hardblank).join(" ");
    }
  }
  return lines.map((l) => l.replace(/\s+$/, ""));
}

function alignLines(lines, width, align) {
  if (!width || align === "left") return lines;
  return lines.map((line) => {
    const pad = Math.max(0, width - line.length);
    if (align === "center") {
      const left = Math.floor(pad / 2);
      return " ".repeat(left) + line;
    }
    if (align === "right") return " ".repeat(pad) + line;
    return line;
  });
}

function renderText(font, text, opts = {}) {
  const width = opts.width || 0;
  const align = opts.align || "left";
  const paragraphs = String(text).split("\n");
  const blocks = [];

  for (const para of paragraphs) {
    const codes = [];
    for (const ch of para) codes.push(ch.codePointAt(0));

    let rowGlyphs = [];
    let rowWidth = 0;

    const flush = () => {
      if (!rowGlyphs.length) return;
      blocks.push(alignLines(concatGlyphs(font, rowGlyphs), width, align).join("\n"));
      rowGlyphs = [];
      rowWidth = 0;
    };

    for (const code of codes) {
      const g = glyphFor(font, code);
      const w = glyphWidth(g);
      if (width && rowGlyphs.length && rowWidth + w > width) flush();
      rowGlyphs.push(g);
      rowWidth += w;
    }
    flush();
  }

  return blocks.join("\n").replace(/\s+$/, "");
}

function parseFigletArgs(args) {
  let width;
  let align = "left";
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "-w" || a === "--width") width = parseInt(args[++i], 10);
    else if (a === "-c") align = "center";
    else if (a === "-r" || a === "-R") align = "right";
    else if (a === "-l") align = "left";
  }
  return { width, align };
}

// ---------------------------------------------------------------------------
// Render: system figlet → npm `figlet` → local concatenator
// ---------------------------------------------------------------------------

let systemFigletAvailable; // undefined = not checked yet
let npmFigletModule; // undefined = not loaded, null = missing
let fallbackNoticeShown = false;

function detectSystemFiglet() {
  if (systemFigletAvailable !== undefined) return systemFigletAvailable;
  const result = spawnSync("figlet", ["-v"], { encoding: "utf8" });
  const missing =
    result.error &&
    (result.error.code === "ENOENT" || result.error.code === "EACCES");
  systemFigletAvailable = !missing;
  return systemFigletAvailable;
}

function loadNpmFiglet() {
  if (npmFigletModule !== undefined) return npmFigletModule;
  try {
    npmFigletModule = require("figlet");
  } catch (err) {
    if (err.code === "MODULE_NOT_FOUND") npmFigletModule = null;
    else throw err;
  }
  return npmFigletModule;
}

function warnFallback(message) {
  if (fallbackNoticeShown) return;
  fallbackNoticeShown = true;
  process.stderr.write(`⚠ ${message}\n`);
}

function renderViaSystemFiglet(fontSource, fontName, text, width, figletArgs) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "figlet-"));
  const file = path.join(tmp, `${fontName}.flf`);
  try {
    fs.writeFileSync(file, fontSource, "utf8");
    const args = ["-d", tmp, "-f", fontName];
    if (width) args.push("-w", String(width));
    if (figletArgs && figletArgs.length) args.push(...figletArgs);
    args.push(text);
    const result = spawnSync("figlet", args, {
      encoding: "utf8",
      maxBuffer: 16 * 1024 * 1024,
    });
    if (result.error && result.error.code === "ENOENT") {
      return { ok: false, reason: "ENOENT" };
    }
    if (result.status !== 0) {
      const detail = (result.stderr || result.error?.message || "").trim();
      return {
        ok: false,
        reason: "error",
        message: detail || `figlet exited ${result.status}`,
      };
    }
    return { ok: true, output: (result.stdout || "").replace(/\s+$/, "") };
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

function headerHardblank(fontSource) {
  const header = String(fontSource).split("\n")[0] || "";
  if (!/^[ft]lf2/.test(header) || header.length < 6) return "";
  return header[5];
}

/** Replace remaining hardblanks with spaces (FIGlet output rule). Uses split, not regex, so "$" is safe. */
function revealHardblanks(output, hardblank) {
  if (!hardblank || hardblank === " ") return output;
  return String(output).split(hardblank).join(" ");
}

function renderViaNpmFiglet(fontSource, fontName, text, width) {
  const figlet = loadNpmFiglet();
  if (!figlet) {
    const err = new Error(
      'figlet is not in PATH, and the Node.js "figlet" package is not installed.\n' +
        "  Install the system binary:  brew install figlet\n" +
        "  Or install the fallback:    npm install",
    );
    err.code = "FIGLET_UNAVAILABLE";
    throw err;
  }
  const id = `local:${fontName}:${fontSource.length}:${fontSource.charCodeAt(Math.min(200, fontSource.length - 1)) || 0}`;
  figlet.parseFont(id, fontSource);
  return figlet
    .textSync(text, {
      font: id,
      width: width || 80,
      whitespaceBreak: true,
    })
    .replace(/\s+$/, "");
}

/**
 * Render `text` with a FIGlet font.
 * Prefers the system `figlet` binary; falls back to the npm `figlet`
 * package; last resort is the local concatenating renderer.
 *
 * @param {string} text
 * @param {{ fontPath?: string, fontSource?: string, fontName?: string, width?: number, align?: string, figletArgs?: string[] }} opts
 */
function renderFont(text, opts = {}) {
  const fontPath = opts.fontPath;
  const fontSource =
    opts.fontSource != null
      ? opts.fontSource
      : fontPath
        ? fs.readFileSync(fontPath, "utf8")
        : null;
  if (fontSource == null) {
    throw new Error("renderFont: provide fontPath or fontSource");
  }
  const fontName =
    opts.fontName ||
    (fontPath
      ? path.basename(fontPath).replace(/\.[ft]lf$/, "")
      : "preview");
  const extra = parseFigletArgs(opts.figletArgs || []);
  const width = extra.width || opts.width || 80;
  const align = extra.align || opts.align || "left";
  // Safe filename for a temp .flf (system figlet -f cannot have spaces)
  const tmpName = fontName.replace(/[^\w.-]+/g, "_") || "preview";

  const hb = headerHardblank(fontSource);
  const finish = (out) => revealHardblanks(out, hb);
  // Classic figlet reads the hardblank as a single byte, so Unicode
  // hardblanks (e.g. □ after a relocate) would be rejected as "Not a
  // FIGlet 2 font file". Skip the binary and use the Node parser.
  const systemCanRead =
    !hb || (hb.length === 1 && hb.charCodeAt(0) < 128);

  if (detectSystemFiglet() && systemCanRead) {
    const sys = renderViaSystemFiglet(
      fontSource,
      tmpName,
      text,
      width,
      opts.figletArgs || [],
    );
    if (sys.ok) return finish(sys.output);
    if (sys.reason === "ENOENT") {
      warnFallback(
        "figlet not found in PATH; using the Node.js figlet package as fallback.",
      );
    } else {
      warnFallback(
        `figlet failed (${sys.message}); using the Node.js figlet package as fallback.`,
      );
    }
  } else if (!detectSystemFiglet()) {
    warnFallback(
      "figlet not found in PATH; using the Node.js figlet package as fallback.",
    );
  }

  try {
    return finish(renderViaNpmFiglet(fontSource, tmpName, text, width));
  } catch (err) {
    if (err.code === "FIGLET_UNAVAILABLE") throw err;
    warnFallback(
      `Node.js figlet could not render this font (${err.message}); using built-in renderer.`,
    );
    const font = parseFont(fontSource);
    return finish(renderText(font, text, { width, align }));
  }
}

module.exports = {
  parseFont,
  loadFont,
  drawableCodes,
  listDefinedChars,
  specimenText,
  formatCharset,
  renderText,
  renderFont,
  parseFigletArgs,
  parseCodeTag,
  stripEndmark,
  detectSystemFiglet,
  REQUIRED_CODES,
};
