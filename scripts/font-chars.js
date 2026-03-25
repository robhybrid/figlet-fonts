#!/usr/bin/env node
// font-chars.js
// Extract unique drawing characters from a FIGlet font, or apply a
// character-replacement mapping to produce a new variant font.
//
// Convention:
//   Input font:  FontName.flf
//   Chars file:  FontName.chars   (named after the INPUT font)
//   Output font: FontName-b.flf   (default suffix is -b, override with --output)
//
// Usage:
//   node scripts/font-chars.js extract <input.flf> [--output <file.chars>]
//   node scripts/font-chars.js apply   <input.flf> <file.chars> [--output <output.flf>]
//   node scripts/font-chars.js resolve <file.chars>
//     → print the default output font path for a given .chars file

const fs = require("fs");
const path = require("path");

// ---------------------------------------------------------------------------
// Naming helpers
// ---------------------------------------------------------------------------

/** Given an input font path, return the default .chars path (same dir, same stem) */
function defaultCharsPath(fontPath) {
  const dir = path.dirname(fontPath);
  const stem = path.basename(fontPath).replace(/\.[ft]lf$/, "");
  return path.join(dir, stem + ".chars");
}

/** Given an input font path, return the default output font path (stem + -b) */
function defaultOutputFont(fontPath) {
  const dir = path.dirname(fontPath);
  const stem = path.basename(fontPath).replace(/\.[ft]lf$/, "");
  const ext = path.extname(fontPath); // .flf or .tlf
  return path.join(dir, stem + "-b" + ext);
}

/** Given a .chars file path, infer the input font path (same stem, .flf) */
function fontFromChars(charsPath) {
  const dir = path.dirname(charsPath);
  const stem = path.basename(charsPath, ".chars");
  // Try .flf first, then .tlf
  const flf = path.join(dir, stem + ".flf");
  const tlf = path.join(dir, stem + ".tlf");
  if (fs.existsSync(flf)) return flf;
  if (fs.existsSync(tlf)) return tlf;
  return flf; // fallback even if missing
}

// ---------------------------------------------------------------------------
// FLF parser helpers
// ---------------------------------------------------------------------------

function parseFlf(src) {
  // Normalize line endings (some fonts use \r\n)
  const lines = src.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
  const header = lines[0];
  const hardblank = header[5];
  const parts = header.split(" ");
  const numComments = parseInt(parts[5] || "0", 10);
  const commentLines = lines.slice(1, 1 + numComments);
  const bodyLines = lines.slice(1 + numComments);
  return { header, commentLines, hardblank, bodyLines };
}

function forEachGlyphLine(bodyLines, fn) {
  for (let i = 0; i < bodyLines.length; i++) {
    const raw = bodyLines[i];
    if (!raw.endsWith("@")) continue;
    const content = raw.replace(/@+$/, "");
    fn(content, raw, i);
  }
}

// ---------------------------------------------------------------------------
// Extract command
// ---------------------------------------------------------------------------

function cmdExtract(fontPath, outputPath) {
  const src = fs.readFileSync(fontPath, "utf8");
  const { hardblank, bodyLines } = parseFlf(src);

  const charSet = new Set();
  forEachGlyphLine(bodyLines, (content) => {
    for (const ch of content) {
      if (ch === " ") continue;
      if (ch.charCodeAt(0) < 32) continue;
      charSet.add(ch); // includes hardblank
    }
  });

  const sorted = [...charSet].sort();
  const fontName = path.basename(fontPath);
  const defaultOut = defaultOutputFont(fontPath);

  const lines = [
    `# ${fontName} — drawing character map`,
    `# Input font:  ${fontName}`,
    `# Output font: ${path.basename(defaultOut)} (default; override with --output)`,
    `#`,
    `# Edit the RIGHT side of each arrow (→) to replace characters in the font.`,
    `# • Left side  = original character (do not change)`,
    `# • Right side = replacement character(s) — can be multi-char or empty`,
    `# • Lines starting with # are ignored`,
    `# • The hardblank (${hardblank}) is the "unbreakable space" used inside glyphs`,
    `#`,
    `# Apply with:`,
    `#   node scripts/font-chars.js apply "${fontName}" <this file>`,
    `#   npm run apply -- "${fontName}" <this file>`,
    ``,
    ...sorted.map((ch) => `${ch} → ${ch}`),
    ``,
  ];

  const out = lines.join("\n");
  const dest = outputPath || defaultCharsPath(fontPath);
  fs.writeFileSync(dest, out, "utf8");
  console.log(`Extracted ${sorted.length} characters → ${dest}`);
  console.log(`Output font will be: ${defaultOut}`);
}

// ---------------------------------------------------------------------------
// Apply command
// ---------------------------------------------------------------------------

function cmdApply(fontPath, charsPath, outputPath) {
  const src = fs.readFileSync(fontPath, "utf8");
  const charsFile = fs.readFileSync(charsPath, "utf8");

  const mapping = new Map();
  for (const line of charsFile.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const arrowMatch = trimmed.match(/^(.+?)\s*(?:→|->)\s*(.*)$/u);
    if (!arrowMatch) continue;
    const from = arrowMatch[1];
    const to = arrowMatch[2];
    if (from !== to) mapping.set(from, to);
  }

  if (mapping.size === 0) {
    console.log("No changes to apply (all mappings are identity).");
    return;
  }

  console.log(
    `Applying ${mapping.size} replacement(s) from ${path.basename(charsPath)}...`,
  );
  for (const [from, to] of mapping) {
    const display = to === "" ? "(delete)" : `"${to}"`;
    console.log(`  "${from}" → ${display}`);
  }

  const { commentLines, header } = parseFlf(src);
  const headerEnd = 1 + commentLines.length;
  const allLines = src.split("\n");

  const result = allLines.map((raw, idx) => {
    if (idx < headerEnd) return raw;
    if (!raw.endsWith("@")) return raw;

    const trailingAt = raw.match(/@+$/)[0];
    const content = raw.slice(0, raw.length - trailingAt.length);

    let newContent = content;
    for (const [from, to] of mapping) {
      const escaped = from.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      newContent = newContent.replace(new RegExp(escaped, "gu"), to);
    }

    return newContent + trailingAt;
  });

  // Default output = input font stem + -b
  const dest = outputPath || defaultOutputFont(fontPath);
  fs.writeFileSync(dest, result.join("\n"), "utf8");
  console.log(`Done → ${dest}`);
  return dest;
}

// ---------------------------------------------------------------------------
// Resolve command (used by watcher to find the input font for a .chars file)
// ---------------------------------------------------------------------------

function cmdResolve(charsPath) {
  const fontPath = fontFromChars(charsPath);
  const outputPath = defaultOutputFont(fontPath);
  console.log(JSON.stringify({ fontPath, charsPath, outputPath }));
}

// ---------------------------------------------------------------------------
// Exports (for use by watch.js)
// ---------------------------------------------------------------------------

module.exports = {
  cmdExtract,
  cmdApply,
  cmdResolve,
  fontFromChars,
  defaultOutputFont,
  defaultCharsPath,
};

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

if (require.main === module) {
  const args = process.argv.slice(2);
  const cmd = args[0];

  if (!cmd || cmd === "--help" || cmd === "-h") {
    console.log(`
font-chars.js — FIGlet font character extractor/replacer

  extract <input.flf> [--output <file.chars>]
    Extract unique drawing characters to a mapping file.
    Default output: <input>.chars (same directory as font)

  apply <input.flf> <file.chars> [--output <output.flf>]
    Apply replacements and write a new font variant.
    Default output: <input>-b.flf (same directory as font)

  resolve <file.chars>
    Print the default input font and output font paths for a .chars file.

Convention:
  amcaaa01.flf  →  amcaaa01.chars  →  amcaaa01-b.flf
`);
    process.exit(0);
  }

  if (cmd === "extract") {
    const fontPath = path.resolve(args[1]);
    const outIdx = args.indexOf("--output");
    const outputPath = outIdx >= 0 ? path.resolve(args[outIdx + 1]) : null;
    cmdExtract(fontPath, outputPath);
  } else if (cmd === "apply") {
    const fontPath = path.resolve(args[1]);
    const charsPath = path.resolve(args[2]);
    const outIdx = args.indexOf("--output");
    const outputPath = outIdx >= 0 ? path.resolve(args[outIdx + 1]) : null;
    cmdApply(fontPath, charsPath, outputPath);
  } else if (cmd === "resolve") {
    cmdResolve(path.resolve(args[1]));
  } else {
    console.error(`Unknown command: ${cmd}. Use extract, apply, or resolve.`);
    process.exit(1);
  }
}
