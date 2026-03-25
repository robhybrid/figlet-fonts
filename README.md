    ┏━╸╻┏━╸╻  ┏━╸╺┳╸   ┏━╸┏━┓┏┓╻╺┳╸┏━┓
    ┣╸ ┃┃╺┓┃  ┣╸  ┃    ┣╸ ┃ ┃┃┗┫ ┃ ┗━┓
    ╹  ╹┗━┛┗━╸┗━╸ ╹    ╹  ┗━┛╹ ╹ ╹ ┗━┛

A curated collection of **436** ASCII art fonts for [figlet](http://www.figlet.org/) and [toilet](http://caca.zoy.org/wiki/toilet) — 395 `.flf` + 41 `.tlf` files.

Install fonts to `/usr/share/figlet/` or `/usr/share/figlet/fonts/`.

View all examples at [Examples.md](Examples.md).

## Sources & Attribution

| Source                                                                  | Fonts | Notes                                                                                                                                                                                                                                                                                                                |
| ----------------------------------------------------------------------- | ----: | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [xero/figlet-fonts](https://github.com/xero/figlet-fonts)               |  ~370 | Original upstream collection                                                                                                                                                                                                                                                                                         |
| [patorjk/figlet.js](https://github.com/patorjk/figlet.js)               |    39 | ANSI Compact, Babyface Lame/Leet, BlurVision ASCII, Classy, Coder Mini, Cosmike2, DiamFont, Font Font, Future, RubiFont, Shaded Blocky, Terrace, Tmplr, Upside Down Text, Wavescape + 24 toilet `.tlf` fonts (ASCII/Mono/Big grids, Circle, Emboss, Future variants, Letter, Pagga, Rebel, Small variants, WideTerm) |
| [figlet 2.2.5](https://github.com/cmatsuoka/figlet)                     |     2 | `l4me`, `nvscript`                                                                                                                                                                                                                                                                                                   |
| [cszach/figlet-fonts](https://github.com/cszach/figlet-fonts)           |     2 | `3x5-b`, `4Max-b` (bold variants)                                                                                                                                                                                                                                                                                    |
| [unlessgames/figlet-fonts](https://github.com/unlessgames/figlet-fonts) |     3 | `terminus`, `terminus_dots`, `wideterm` — merged via [xero PR #31](https://github.com/xero/figlet-fonts/pull/31)                                                                                                                                                                                                     |

## Regenerating Examples

```bash
bash scripts/generate_examples.sh
```

Override paths if needed:

```bash
bash scripts/generate_examples.sh --font-dir /path/to/fonts --output /path/to/Examples.md
```

A [GitHub Actions workflow](.github/workflows/regenerate-examples.yml) automatically regenerates `Examples.md` whenever fonts or the script change.
