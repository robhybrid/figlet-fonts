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
//   node scripts/font-chars.js apply   <input.flf> <file.chars> [--output <output.flf>] [-y]
//   node scripts/font-chars.js resolve <file.chars>
//     → print the default output font path for a given .chars file

const fs = require("fs");
const path = require("path");
const readline = require("readline");
const {
  parseFont,
  drawableCodes,
  specimenText,
  formatCharset,
  renderFont,
} = require("./figlet-render");

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
      if (ch === hardblank) continue;
      if (ch.charCodeAt(0) < 32) continue;
      charSet.add(ch);
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
    `# • Right side = replacement character(s) — can be multi-char`,
    `# • Leave the right side unchanged, empty, or omit the line to pass through`,
    `# • Lines starting with # are ignored`,
    `# • The hardblank (${hardblank}) is omitted — it prints as a space and is never replaced`,
    `#`,
    `# Apply with:`,
    `#   node scripts/font-chars.js apply "${fontName}" <this file>`,
    `#   (previews, then asks before writing; pass -y to write immediately)`,
    `#   npm run apply -- "${fontName}" <this file>`,
    ``,
    ...sorted.map((ch) => `${ch} → ${ch}`),
    ``,
  ];

  const out = lines.join("\n");
  const dest = outputPath || defaultCharsPath(fontPath);
  fs.writeFileSync(dest, out, "utf8");
  console.log(`Extracted ${sorted.length} characters → ${dest}`);
  console.log(`Hardblank "${hardblank}" omitted (prints as space; not a drawing character).`);
  console.log(`Output font will be: ${defaultOut}`);
}

// ---------------------------------------------------------------------------
// Apply command
// ---------------------------------------------------------------------------

function parseMapping(charsFile, charsPath) {
  const mapping = new Map();
  const errors = [];
  const lines = charsFile.split(/\r?\n/);

  lines.forEach((line, idx) => {
    const n = idx + 1;
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) return;

    const good = trimmed.match(/^(.+?)\s*(?:→|->)\s*(.*)$/u);
    if (good) {
      const from = good[1];
      const to = good[2].trimEnd();
      // Identity or blank target = pass through (do not delete).
      if (!to || from === to) return;
      mapping.set(from, to);
      return;
    }

    if (/\s+->/.test(trimmed)) return;
    const bad = trimmed.match(/^(.{1,8})\s+(>|(?:=>))\s*(.*)$/);
    if (bad) {
      const from = bad[1];
      const to = (bad[3] || "").trimEnd();
      errors.push(
        `  line ${n}: invalid arrow "${bad[2]}" — use "→" or "->" instead\n` +
          `    got:      ${trimmed}\n` +
          `    expected: ${from} → ${to}`,
      );
    }
  });

  return { mapping, errors };
}

function formatMappingErrors(errors, charsPath) {
  if (!errors.length) return "";
  const where = charsPath ? path.basename(charsPath) : ".chars file";
  return `Invalid mapping in ${where} (skipped those lines):\n${errors.join("\n")}`;
}

function applyMappingToSource(src, mapping) {
  const { commentLines } = parseFlf(src);
  const headerEnd = 1 + commentLines.length;
  const allLines = src.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");

  return allLines
    .map((raw, idx) => {
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
    })
    .join("\n");
}

function collectGlyphChars(src) {
  const { hardblank, bodyLines } = parseFlf(src);
  const used = new Set();
  forEachGlyphLine(bodyLines, (content) => {
    for (const ch of content) {
      if (ch !== " " && ch !== hardblank) used.add(ch);
    }
  });
  return used;
}

function pickUnusedHardblank(src, mapping, oldHb) {
  const used = collectGlyphChars(src);
  used.add(oldHb);
  for (const [from, to] of mapping) {
    used.add(from);
    for (const ch of to) used.add(ch);
  }
  const candidates = ["□", "▢", "▯", "▫", "◦", "¤", "§", "µ"];
  for (const c of candidates) {
    if (!used.has(c)) return c;
  }
  return "□";
}

function relocateHardblankInSource(src, oldHb, newHb) {
  if (!oldHb || oldHb === newHb) return src;
  const lines = src.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
  const { commentLines } = parseFlf(src);
  const headerEnd = 1 + commentLines.length;
  if (lines[0] && lines[0].length > 5) {
    lines[0] = lines[0].slice(0, 5) + newHb + lines[0].slice(6);
  }
  for (let i = headerEnd; i < lines.length; i++) {
    const raw = lines[i];
    if (!raw.endsWith("@")) continue;
    const marks = raw.match(/@+$/)[0];
    const content = raw.slice(0, raw.length - marks.length);
    lines[i] = content.split(oldHb).join(newHb) + marks;
  }
  return lines.join("\n");
}

function applyMapping(fontPath, charsPath, outputPath, opts = {}) {
  const src = fs.readFileSync(fontPath, "utf8");
  const charsFile = fs.readFileSync(charsPath, "utf8");
  const { hardblank } = parseFlf(src);
  const { mapping, errors } = parseMapping(charsFile, charsPath);

  const cleaned = new Map();
  let skippedHardblankFrom = false;
  let hardblankUsedAsInk = false;
  for (const [from, to] of mapping) {
    if (from === hardblank) {
      skippedHardblankFrom = true;
      continue;
    }
    if (to.includes(hardblank)) hardblankUsedAsInk = true;
    cleaned.set(from, to);
  }

  if (cleaned.size === 0 && errors.length === 0 && !hardblankUsedAsInk) {
    return null;
  }

  let source = src;
  let relocate = null;
  const doRelocate = opts.relocateHardblank !== false;
  if (hardblankUsedAsInk && doRelocate) {
    const next = pickUnusedHardblank(src, cleaned, hardblank);
    source = relocateHardblankInSource(src, hardblank, next);
    relocate = { from: hardblank, to: next };
  } else if (hardblankUsedAsInk && !doRelocate) {
    relocate = { from: hardblank, to: hardblank, declined: true };
  }

  const dest = outputPath || defaultOutputFont(fontPath);
  const text = cleaned.size ? applyMappingToSource(source, cleaned) : source;
  return {
    dest,
    text,
    mapping: cleaned,
    errors,
    charsPath,
    hardblank,
    skippedHardblankFrom,
    relocate,
  };
}

function printMappingLog(built) {
  if (built.errors && built.errors.length) {
    console.error(formatMappingErrors(built.errors, built.charsPath));
  }
  if (built.skippedHardblankFrom) {
    console.error(
      `⚠ Skipped mapping the hardblank "${built.hardblank}" — it is an unbreakable space, not a drawing character.`,
    );
  }
  if (built.relocate && !built.relocate.declined) {
    console.error(
      `⚠ A replacement uses the hardblank "${built.relocate.from}" as drawing ink.\n` +
        `  That would print as a space, so the new font's hardblank will be "${built.relocate.to}" instead.`,
    );
  } else if (built.relocate && built.relocate.declined) {
    console.error(
      `⚠ A replacement uses the hardblank "${built.relocate.from}" as drawing ink.\n` +
        `  Hardblank was left as "${built.relocate.from}" — those replacements will print as spaces.`,
    );
  }
  if (built.mapping.size === 0) {
    console.log("No valid replacements to apply.");
    return;
  }
  console.log(
    `Applying ${built.mapping.size} replacement(s) from ${path.basename(built.charsPath || "mapping")}...`,
  );
  for (const [from, to] of built.mapping) {
    console.log(`  "${from}" → "${to}"`);
  }
}

function printApplyPreview(built) {
  const font = parseFont(built.text);
  const codes = drawableCodes(font);
  const specimen = specimenText(codes);
  const width = process.stdout.columns || 80;
  const rendered = specimen
    ? renderFont(specimen, {
        fontSource: built.text,
        fontName: path.basename(built.dest).replace(/\.[ft]lf$/, ""),
        width,
      })
    : "(no drawable glyphs)";

  console.log("");
  console.log(`Preview ${path.basename(built.dest)}  (${codes.length} chars: ${formatCharset(codes)})`);
  console.log("─".repeat(width));
  console.log(rendered);
  console.log("─".repeat(width));
}

function askYesNo(question) {
  return new Promise((resolve) => {
    if (!process.stdin.isTTY) {
      resolve(true);
      return;
    }
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    rl.question(question, (answer) => {
      rl.close();
      const a = answer.trim().toLowerCase();
      resolve(a === "" || a === "y" || a === "yes");
    });
  });
}

function askWrite(dest, relocate) {
  let q = `Write ${dest}? [Y/n] `;
  if (relocate && !relocate.declined) {
    q = `Write ${dest} (hardblank "${relocate.from}" → "${relocate.to}")? [Y/n] `;
  }
  return askYesNo(q);
}

// ---------------------------------------------------------------------------
// Apply command
// ---------------------------------------------------------------------------

function cmdApply(fontPath, charsPath, outputPath) {
  const built = applyMapping(fontPath, charsPath, outputPath);
  if (!built) {
    console.log("No changes to apply (all mappings are identity).");
    return;
  }

  printMappingLog(built);
  if (built.mapping.size === 0) return;

  fs.writeFileSync(built.dest, built.text, "utf8");
  console.log(`Done → ${built.dest}`);
  return built.dest;
}

async function cmdApplyCli(fontPath, charsPath, outputPath, opts = {}) {
  let built = applyMapping(fontPath, charsPath, outputPath);
  if (!built) {
    console.log("No changes to apply (all mappings are identity).");
    return;
  }

  if (built.relocate && !built.relocate.declined && process.stdin.isTTY && !opts.yes) {
    const ok = await askYesNo(
      `A replacement uses hardblank "${built.relocate.from}" as ink.\n` +
        `Relocate hardblank to "${built.relocate.to}" in the new font so it stays visible? [Y/n] `,
    );
    if (!ok) {
      built = applyMapping(fontPath, charsPath, outputPath, {
        relocateHardblank: false,
      });
    }
  }

  printMappingLog(built);
  if (built.mapping.size === 0 && !built.relocate) return;

  if (!opts.noPreview) {
    try {
      printApplyPreview(built);
    } catch (err) {
      console.error(`Preview failed: ${err.message}`);
    }
  }

  let shouldWrite = opts.yes;
  if (opts.noWrite) shouldWrite = false;
  else if (!shouldWrite) shouldWrite = await askWrite(built.dest, built.relocate);

  if (!shouldWrite) {
    console.log("Not written.");
    return;
  }

  fs.writeFileSync(built.dest, built.text, "utf8");
  console.log(`Done → ${built.dest}`);
  return built.dest;
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
  cmdApplyCli,
  applyMapping,
  formatMappingErrors,
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

  apply <input.flf> <file.chars> [options]
    Apply replacements, preview the result, then ask before writing.
    Default output: <input>-b.flf
      -n, --dry-run     Preview only (do not write)
      -y, --yes         Write without prompting
      --no-preview      Skip the glyph preview
      --output <file>   Custom output path

  Live dry-run (watches source font + .chars):
    npm start -- Broadway.flf

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
    const applyArgs = args.slice(1);
    if (applyArgs.includes("-h") || applyArgs.includes("--help")) {
      console.log(`
apply — preview a .chars mapping, then optionally write a variant font

Usage:
  node scripts/font-chars.js apply <input.flf> <file.chars> [options]
  npm run apply -- Broadway.flf Broadway.chars
  npm run apply -- Broadway.flf Broadway.chars --dry-run

Options:
  -h, --help           Show this help
  -n, --dry-run, --no-write
                       Preview only; do not write the output font
  -y, --yes            Write without prompting
  --no-preview         Skip the glyph preview
  --output <file.flf>  Output path (default: <input>-b.flf)

For a live dry-run that watches the font and .chars file:
  npm start -- Broadway.flf
`);
      process.exit(0);
    }
    const yes = applyArgs.includes("-y") || applyArgs.includes("--yes");
    const noWrite =
      applyArgs.includes("-n") ||
      applyArgs.includes("--no-write") ||
      applyArgs.includes("--dry-run");
    const noPreview = applyArgs.includes("--no-preview");
    const outIdx = applyArgs.indexOf("--output");
    const outputPath =
      outIdx >= 0 && applyArgs[outIdx + 1]
        ? path.resolve(applyArgs[outIdx + 1])
        : null;

    const positional = [];
    for (let i = 0; i < applyArgs.length; i++) {
      if (applyArgs[i] === "--output") {
        i++;
        continue;
      }
      if (applyArgs[i].startsWith("-")) continue;
      positional.push(applyArgs[i]);
    }
    if (!positional[0] || !positional[1]) {
      console.error("Usage: apply <input.flf> <file.chars> [--output file] [-y]");
      process.exit(1);
    }

    cmdApplyCli(
      path.resolve(positional[0]),
      path.resolve(positional[1]),
      outputPath,
      { yes, noWrite, noPreview },
    ).catch((err) => {
      console.error(err.code === "CHARS_MAPPING" ? err.message : `Error: ${err.message}`);
      process.exit(1);
    });
  } else if (cmd === "resolve") {
    cmdResolve(path.resolve(args[1]));
  } else {
    console.error(`Unknown command: ${cmd}. Use extract, apply, or resolve.`);
    process.exit(1);
  }
}
