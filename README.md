    ┏━╸╻┏━╸╻  ┏━╸╺┳╸   ┏━╸┏━┓┏┓╻╺┳╸┏━┓
    ┣╸ ┃┃╺┓┃  ┣╸  ┃    ┣╸ ┃ ┃┃┗┫ ┃ ┗━┓
    ╹  ╹┗━┛┗━╸┗━╸ ╹    ╹  ┗━┛╹ ╹ ╹ ┗━┛

A curated collection of **437** ASCII art fonts for [figlet](http://www.figlet.org/) and [toilet](http://caca.zoy.org/wiki/toilet) — 395 `.flf` + 41 `.tlf` files, plus 39 `.flc` control/encoding files.

---

## Install

```bash
# Per-user install to ~/.figlet/ (no root required)
bash scripts/install.sh --user

# System-wide install
sudo bash scripts/install.sh

# Custom destination
bash scripts/install.sh --font-dir /usr/local/share/figlet
```

---

## Scripts

All scripts live in `scripts/` and are also wired to `npm run` shortcuts.

### `preview.js` — browse all fonts in the terminal

Renders every font with a sample phrase, respects terminal width, pipes cleanly.

```bash
node scripts/preview.js                        # all fonts, default sample text
node scripts/preview.js -t "Hello World"       # custom text
node scripts/preview.js -f "AMC*"              # filter by filename glob
node scripts/preview.js -- -c                  # pass figlet flags (centered)
node scripts/preview.js -t "ABC" -- -w 120     # custom text + custom width
node scripts/preview.js --no-color | less      # pipe-friendly (no ANSI)

# npm shortcut
npm run preview -- -t "Hello" -f "Doom*"
```

Options:

| Flag                  | Description                                                     |
| --------------------- | --------------------------------------------------------------- |
| `-t, --text <text>`   | Sample text (default: `Mr. Jock, TV quiz PhD, bags few lynx.`)  |
| `-f, --filter <glob>` | Filter fonts by filename (`*` and `?` wildcards)                |
| `--no-color`          | Disable ANSI color (auto-disabled when piping)                  |
| `--`                  | Pass remaining args directly to figlet (`-c`, `-r`, `-w`, etc.) |

---

### `watch.js` — live font editor with auto-preview

```bash
npm start
```

Watches all `.flf`/`.tlf` fonts and `.chars` mapping files. When any file changes, the terminal clears and the updated font is previewed instantly.

**Interactive keys:**

| Key | Mode                                                             |
| --- | ---------------------------------------------------------------- |
| `N` | Render font **N**ame (default)                                   |
| `A` | Render **A**ll characters (A–Z, a–z, 0–9, punctuation)           |
| `S` | Render **S**ample text (`Mr. Jock, TV quiz PhD, bags few lynx.`) |
| `E` | **E**nter custom sample text                                     |

Uses `process.stdout.columns` for terminal-width-aware rendering and separators.

---

### `font-chars.js` — extract and replace drawing characters

Extracts every unique drawing character from a font into a `.chars` mapping file. Edit the right side of any `→` line, then apply to produce a new font variant.

```bash
# Extract: amcaaa01.flf → amcaaa01.chars
node scripts/font-chars.js extract amcaaa01.flf

# Edit amcaaa01.chars (e.g. S → ▓, | → ┃)

# Apply: amcaaa01.flf + amcaaa01.chars → amcaaa01-b.flf
node scripts/font-chars.js apply amcaaa01.flf amcaaa01.chars

# Custom output path
node scripts/font-chars.js apply amcaaa01.flf amcaaa01.chars --output my-font.flf

# npm shortcuts
npm run extract -- amcaaa01.flf
npm run apply   -- amcaaa01.flf amcaaa01.chars
```

**Convention:** `FontName.flf` → `FontName.chars` → `FontName-b.flf`

`.chars` files are listed in `.gitignore` — they're local working files.

When `npm start` is running, saving a `.chars` file auto-applies and previews the result.

---

### `generate_examples.sh` — regenerate Examples.md

```bash
npm run generate
# or
bash scripts/generate_examples.sh
bash scripts/generate_examples.sh --font-dir /path/to/fonts --output /path/to/Examples.md
```

A [GitHub Actions workflow](.github/workflows/regenerate-examples.yml) runs this automatically on push when any font file changes.

---

## Sources & Attribution

| Source                                                                  | Fonts | Notes                                                                                                                                                                                                                                                                                                                |
| ----------------------------------------------------------------------- | ----: | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [xero/figlet-fonts](https://github.com/xero/figlet-fonts)               |  ~370 | Original upstream collection                                                                                                                                                                                                                                                                                         |
| [patorjk/figlet.js](https://github.com/patorjk/figlet.js)               |    39 | ANSI Compact, Babyface Lame/Leet, BlurVision ASCII, Classy, Coder Mini, Cosmike2, DiamFont, Font Font, Future, RubiFont, Shaded Blocky, Terrace, Tmplr, Upside Down Text, Wavescape + 24 toilet `.tlf` fonts (ASCII/Mono/Big grids, Circle, Emboss, Future variants, Letter, Pagga, Rebel, Small variants, WideTerm) |
| [figlet 2.2.5](https://github.com/cmatsuoka/figlet)                     |     2 | `l4me`, `nvscript`                                                                                                                                                                                                                                                                                                   |
| [cszach/figlet-fonts](https://github.com/cszach/figlet-fonts)           |     2 | `3x5-b`, `4Max-b` (bold variants), 39 `.flc` control files                                                                                                                                                                                                                                                           |
| [unlessgames/figlet-fonts](https://github.com/unlessgames/figlet-fonts) |     3 | `terminus`, `terminus_dots`, `wideterm` — merged via [xero PR #31](https://github.com/xero/figlet-fonts/pull/31)                                                                                                                                                                                                     |

View all font examples at [Examples.md](Examples.md).
