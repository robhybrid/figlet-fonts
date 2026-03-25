#!/usr/bin/env node
// font-chars.js
// Extract unique drawing characters from a FIGlet font, or apply a
// character-replacement mapping back to the font.
//
// Usage:
//   node scripts/font-chars.js extract <font.flf> [--output <file.chars>]
//   node scripts/font-chars.js apply   <font.flf> <file.chars> [--output <font-out.flf>]

const fs = require("fs");
const path = require("path");

// ---------------------------------------------------------------------------
// FLF parser helpers
// ---------------------------------------------------------------------------

/**
 * Parse an FLF/TLF file into:
 *   { headerLine, commentLines, hardblank, height, glyphLines }
 *
 * glyphLines: array of raw lines from the file that belong to glyph bodies
 * (includes the trailing @ markers so we can reconstruct the file exactly).
 */
function parseFlf(src) {
  const lines = src.split("\n");
  // First line: "flf2a<hardblank> <height> ..."
  const header = lines[0];
  // hardblank is the character right after "flf2a" (or "tlf2a")
  const hardblank = header[5];
  // height is the first number after the hardblank+space
  const parts = header.split(" ");
  const height = parseInt(parts[1], 10);
  // number of comment lines
  const numComments = parseInt(parts[5] || "0", 10);

  const commentLines = lines.slice(1, 1 + numComments);
  const bodyLines = lines.slice(1 + numComments);

  return { header, commentLines, hardblank, height, bodyLines };
}

/**
 * Iterate over glyph body lines and call fn(lineContent, rawLine, index)
 * for every line that is part of a glyph body.
 * lineContent = the line with trailing @/@@ stripped.
 * The end-of-character marker (@@ or ending with @@) is preserved in rawLine.
 */
function forEachGlyphLine(bodyLines, fn) {
  for (let i = 0; i < bodyLines.length; i++) {
    const raw = bodyLines[i];
    // Glyph lines end in @ or @@; non-glyph lines (like extra codepoint
    // comments e.g. "0x1234  LATIN..." after extended chars) don't.
    if (!raw.endsWith("@")) continue;
    // Strip trailing @(s) to get the drawn content
    const content = raw.replace(/@+$/, "");
    fn(content, raw, i);
  }
}

// ---------------------------------------------------------------------------
// Extract command
// ---------------------------------------------------------------------------

function cmdExtract(fontPath, outputPath) {
  const src = fs.readFileSync(fontPath, "utf8");
  const { header, hardblank, bodyLines } = parseFlf(src);

  const charSet = new Set();

  forEachGlyphLine(bodyLines, (content) => {
    for (const ch of content) {
      // Skip hardblank (treated separately), plain space, and control chars
      if (ch === hardblank) {
        charSet.add(hardblank); // include hardblank so user can remap it
        continue;
      }
      if (ch === " ") continue;
      if (ch.charCodeAt(0) < 32) continue;
      charSet.add(ch);
    }
  });

  const sorted = [...charSet].sort();
  const fontName = path.basename(fontPath);

  const lines = [
    `# ${fontName} — drawing character map`,
    `# Edit the RIGHT side of each arrow (→) to replace characters in the font.`,
    `# • Left side  = original character (do not change)`,
    `# • Right side = replacement character(s) — can be multi-char or empty`,
    `# • Lines starting with # are ignored`,
    `# • The hardblank (${hardblank}) is the "unbreakable space" used inside glyphs`,
    `#`,
    `# Apply with: node scripts/font-chars.js apply "${fontName}" <this file>`,
    ``,
    ...sorted.map((ch) => `${ch} → ${ch}`),
    ``,
  ];

  const out = lines.join("\n");

  if (outputPath) {
    fs.writeFileSync(outputPath, out, "utf8");
    console.log(`Extracted ${sorted.length} characters → ${outputPath}`);
  } else {
    // Default: write next to the font file with .chars extension
    const defaultOut = fontPath.replace(/\.[ft]lf$/, "") + ".chars";
    fs.writeFileSync(defaultOut, out, "utf8");
    console.log(`Extracted ${sorted.length} characters → ${defaultOut}`);
  }
}

// ---------------------------------------------------------------------------
// Apply command
// ---------------------------------------------------------------------------

function cmdApply(fontPath, charsPath, outputPath) {
  const src = fs.readFileSync(fontPath, "utf8");
  const charsFile = fs.readFileSync(charsPath, "utf8");

  // Parse the mapping file
  const mapping = new Map();
  for (const line of charsFile.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    // Format: "X → Y"  (arrow is → U+2192, or plain ASCII ->)
    const arrowMatch = trimmed.match(/^(.+?)\s*(?:→|->)\s*(.*)$/u);
    if (!arrowMatch) continue;
    const from = arrowMatch[1];
    const to = arrowMatch[2];
    if (from !== to) {
      mapping.set(from, to);
    }
  }

  if (mapping.size === 0) {
    console.log("No changes to apply (all mappings are identity).");
    return;
  }

  console.log(`Applying ${mapping.size} replacements...`);
  for (const [from, to] of mapping) {
    const display = to === "" ? "(delete)" : `"${to}"`;
    console.log(`  "${from}" → ${display}`);
  }

  // Split src into lines and rebuild, only touching glyph body lines
  const { commentLines, header } = parseFlf(src);
  const headerEnd = 1 + commentLines.length;
  const allLines = src.split("\n");

  const result = allLines.map((raw, idx) => {
    // Leave header and comment lines untouched
    if (idx < headerEnd) return raw;
    // Only process lines that are glyph body lines (end in @)
    if (!raw.endsWith("@")) return raw;

    // Strip trailing @(s), apply mapping to content, restore @(s)
    const trailingAt = raw.match(/@+$/)[0];
    const content = raw.slice(0, raw.length - trailingAt.length);

    let newContent = content;
    for (const [from, to] of mapping) {
      // Replace all occurrences — escape special regex chars in `from`
      const escaped = from.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      newContent = newContent.replace(new RegExp(escaped, "gu"), to);
    }

    return newContent + trailingAt;
  });

  const dest = outputPath || fontPath;
  fs.writeFileSync(dest, result.join("\n"), "utf8");
  console.log(`Done → ${dest}`);
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

const args = process.argv.slice(2);
const cmd = args[0];

if (!cmd || cmd === "--help" || cmd === "-h") {
  console.log(`
font-chars.js — FIGlet font character extractor/replacer

  extract <font.flf> [--output <file.chars>]
    Extract unique drawing characters to a mapping file.
    Defaults to writing <font>.chars next to the font file.

  apply <font.flf> <file.chars> [--output <font-out.flf>]
    Apply character replacements from a mapping file back to the font.
    Edits in-place unless --output is given.
`);
  process.exit(0);
}

if (cmd === "extract") {
  const fontPath = path.resolve(args[1]);
  const outIdx = args.indexOf("--output");
  const outputPath = outIdx >= 0 ? path.resolve(args[outIdx + 1]) : null;
  if (!fontPath) {
    console.error("Usage: font-chars.js extract <font.flf> [--output <file>]");
    process.exit(1);
  }
  cmdExtract(fontPath, outputPath);
} else if (cmd === "apply") {
  const fontPath = path.resolve(args[1]);
  const charsPath = path.resolve(args[2]);
  const outIdx = args.indexOf("--output");
  const outputPath = outIdx >= 0 ? path.resolve(args[outIdx + 1]) : null;
  if (!fontPath || !charsPath) {
    console.error(
      "Usage: font-chars.js apply <font.flf> <file.chars> [--output <font-out.flf>]",
    );
    process.exit(1);
  }
  cmdApply(fontPath, charsPath, outputPath);
} else {
  console.error(`Unknown command: ${cmd}. Use extract or apply.`);
  process.exit(1);
}
