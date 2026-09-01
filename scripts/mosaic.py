#!/usr/bin/env python3
"""Rasterize an outline font to 2×2 block-mosaic ASCII (figlet-style stdout).

TrueType/OpenType glyphs are hinted by FreeType onto a grid whose width is
`--aspect` of its height (default 0.6). Native bytecode is used when the font
has it (Denmark does); otherwise the auto-hinter. That pre-distorts letters so
they look correct in a monospace cell, which is taller than it is wide.

Uses U+2580–U+259F except shade blocks U+2591–U+2593.

Examples:
  python3 scripts/mosaic.py -f Denmark -s 12 Hello
  python3 scripts/mosaic.py -f Denmark -s 12 -p
  python3 scripts/mosaic.py -f Denmark -s 16 -p Hello
  python3 scripts/mosaic.py -f Denmark -s 12 --flf Denmark-12.flf
  python3 scripts/mosaic.py --list
"""

from __future__ import annotations

import argparse
import os
import shutil
import sys
from pathlib import Path

HARD = "$"

QUAD = {
    0b0000: " ",
    0b1000: "▘",
    0b0100: "▝",
    0b0010: "▖",
    0b0001: "▗",
    0b1100: "▀",
    0b0011: "▄",
    0b1010: "▌",
    0b0101: "▐",
    0b1110: "▛",
    0b1101: "▜",
    0b1011: "▙",
    0b0111: "▟",
    0b1001: "▚",
    0b0110: "▞",
    0b1111: "█",
}

REQUIRED = list(range(32, 127)) + [196, 214, 220, 228, 246, 252, 223]

FONT_EXTS = {".ttf", ".otf", ".ttc", ".woff", ".woff2"}
FONT_DIRS = [
    Path.home() / "Downloads",
    Path.home() / "Library/Fonts",
    Path("/Library/Fonts"),
    Path("/System/Library/Fonts/Supplemental"),
    Path("/System/Library/Fonts"),
]


def term_width(override: int | None = None) -> int:
    """Figlet-style wrap width: -w, else the tty, else 80."""
    if override and override > 0:
        return override
    columns = shutil.get_terminal_size(fallback=(80, 24)).columns
    return columns if columns > 0 else 80


def layout_glyphs(glyphs: list, width: int) -> str:
    """Concatenate glyph row-lists. None is a newline. Wrap like figlet -w."""
    lines_out: list[str] = []
    row: list[list[str]] = []
    row_w = 0

    def glyph_w(g: list[str]) -> int:
        return max((len(ln) for ln in g), default=0)

    def flush() -> None:
        nonlocal row, row_w
        if not row:
            return
        height = max(len(g) for g in row)
        for r in range(height):
            lines_out.append("".join(g[r] if r < len(g) else "" for g in row))
        row = []
        row_w = 0

    for g in glyphs:
        if g is None:
            if row:
                flush()
            elif lines_out:
                lines_out.append("")
            continue
        w = glyph_w(g)
        if width and row and row_w + w > width:
            flush()
        row.append(g)
        row_w += w
    flush()
    return trim_mosaic("\n".join(lines_out))


def pad_even(n: int) -> int:
    return n if n % 2 == 0 else n + 1


def crop_blank_rows(rows: list[list[int]], top: int, bot: int) -> list[list[int]]:
    if not rows:
        return rows
    w = len(rows[0])
    if top is None:
        return [[0] * w]
    return rows[top : bot + 1]


def ink_span(rows: list[list[int]]):
    top = next((i for i, r in enumerate(rows) if any(r)), None)
    bot = next((i for i, r in reversed(list(enumerate(rows))) if any(r)), None)
    return top, bot


def trim_mosaic(text: str) -> str:
    """Drop fully blank leading/trailing mosaic rows (excess leading)."""
    lines = text.split("\n")
    while lines and not lines[0].strip():
        lines.pop(0)
    while lines and not lines[-1].strip():
        lines.pop()
    return ("\n".join(lines) + "\n") if lines else "\n"


def pack_bitmap(pixels: list[list[int]], hardblank: bool = False) -> list[str]:
    empty = HARD if hardblank else " "
    h = pad_even(len(pixels))
    w = pad_even(max((len(r) for r in pixels), default=0))
    grid = [[0] * w for _ in range(h)]
    for y, row in enumerate(pixels):
        for x, bit in enumerate(row):
            if bit:
                grid[y][x] = 1
    lines = []
    for y in range(0, h, 2):
        chars = []
        for x in range(0, w, 2):
            bits = (
                (grid[y][x] << 3)
                | (grid[y][x + 1] << 2)
                | (grid[y + 1][x] << 1)
                | grid[y + 1][x + 1]
            )
            chars.append(empty if bits == 0 else QUAD[bits])
        lines.append("".join(chars))
    return lines


def _font_dirs() -> list[Path]:
    extra = os.environ.get("MOSAIC_FONT_PATH", "")
    dirs = [Path(p) for p in extra.split(os.pathsep) if p] + list(FONT_DIRS)
    return [d for d in dirs if d.exists()]


def _iter_font_files():
    for root in _font_dirs():
        if root.is_file():
            yield root
            continue
        for dirpath, dirnames, filenames in os.walk(root):
            # Don't walk huge trees inside Downloads beyond two extra levels
            rel = Path(dirpath).relative_to(root)
            if len(rel.parts) > 2:
                dirnames.clear()
                continue
            for name in filenames:
                p = Path(dirpath) / name
                if p.suffix.lower() in FONT_EXTS:
                    yield p


def _family_name(path: Path) -> str:
    try:
        from fontTools.ttLib import TTFont

        font = TTFont(str(path), fontNumber=0, lazy=True)
        names = []
        for rec in font["name"].names:
            if rec.nameID in (1, 4, 6):
                try:
                    names.append(rec.toUnicode())
                except Exception:
                    continue
        font.close()
        return " ".join(names)
    except Exception:
        return path.stem


def find_font(spec: str) -> Path:
    raw = Path(spec).expanduser()
    if raw.exists() and raw.is_file():
        return raw.resolve()
    needle = spec.strip().lower()
    matches = []
    for p in _iter_font_files():
        if needle in p.stem.lower() or needle in p.name.lower():
            matches.append(p)
            continue
        fam = _family_name(p).lower()
        if needle in fam:
            matches.append(p)
    if not matches:
        raise FileNotFoundError(
            f'No font matching "{spec}". Try a file path, or --list.'
        )
    # Prefer an exact family/file stem match, then shorter names.
    def score(p: Path) -> tuple:
        stem = p.stem.lower()
        exact = stem == needle or stem.replace(" ", "") == needle.replace(" ", "")
        return (0 if exact else 1, len(stem), str(p).lower())

    matches.sort(key=score)
    return matches[0]


def list_fonts() -> list[str]:
    seen = set()
    rows = []
    for p in _iter_font_files():
        key = str(p.resolve()).lower()
        if key in seen:
            continue
        seen.add(key)
        rows.append(f"{p.stem:40}  {p}")
    rows.sort(key=str.lower)
    return rows


def _ft26(value: int) -> int:
    """Round FreeType 26.6 to pixels."""
    return (value + (32 if value >= 0 else -32)) // 64


_FACE_CACHE: dict[tuple[str, int, int], object] = {}


def _freetype_face(font_path: Path, pixel_w: int, pixel_h: int):
    try:
        import freetype
    except ImportError as err:
        raise SystemExit("mosaic.py needs freetype-py (pip install freetype-py)") from err

    key = (str(font_path.resolve()), pixel_w, pixel_h)
    face = _FACE_CACHE.get(key)
    if face is None:
        face = freetype.Face(str(font_path))
        face.set_pixel_sizes(pixel_w, pixel_h)
        _FACE_CACHE[key] = face
    return face, freetype


def _bitmap_rows(bitmap) -> list[list[int]]:
    """Unpack a FreeType bitmap (mono or gray) to a 0/1 grid."""
    width, height, pitch = bitmap.width, bitmap.rows, bitmap.pitch
    raw = bitmap.buffer
    buf = bytes(raw) if not isinstance(raw, (bytes, bytearray)) else raw
    if height == 0 or width == 0 or not buf:
        return []

    rows: list[list[int]] = []
    abs_pitch = abs(pitch) or ((width + 7) // 8)
    mono = bitmap.pixel_mode == 1
    for y in range(height):
        start = (height - 1 - y) * abs_pitch if pitch < 0 else y * abs_pitch
        rowbytes = buf[start : start + abs_pitch]
        if mono:
            bits = []
            for x in range(width):
                byte = rowbytes[x >> 3] if (x >> 3) < len(rowbytes) else 0
                bits.append(1 if byte & (0x80 >> (x & 7)) else 0)
            rows.append(bits)
        else:
            rows.append(
                [1 if (rowbytes[x] if x < len(rowbytes) else 0) >= 128 else 0 for x in range(width)]
            )
    return rows


def raster_char(font_path: Path, ch: str, out_h: int, aspect: float, threshold: int = 128):
    """Hint `ch` onto an aspect-correct pixel grid (no post-scale)."""
    del threshold  # 1-bit TARGET_MONO; kept so callers stay compatible
    pix_h = max(1, out_h)
    pix_w = max(1, int(round(out_h / aspect)))
    face, freetype = _freetype_face(font_path, pix_w, pix_h)
    # Native TrueType bytecode when present; auto-hinter otherwise.
    # TARGET_MONO snaps stems to pixels — what the 2×2 mosaic actually needs.
    face.load_char(
        ch,
        freetype.FT_LOAD_RENDER | freetype.FT_LOAD_TARGET_MONO,
    )
    glyph = face.glyph
    ink = _bitmap_rows(glyph.bitmap)
    ink_h = len(ink)
    ink_w = len(ink[0]) if ink else 0

    asc = _ft26(face.size.ascender)
    desc = -_ft26(face.size.descender)
    canvas_h = max(pix_h, asc + desc, ink_h, 1)
    left = glyph.bitmap_left
    top = glyph.bitmap_top
    adv = max(_ft26(glyph.advance.x), 1)
    origin_x = max(0, -left)
    canvas_w = max(adv + origin_x, origin_x + left + ink_w, 1)

    rows = [[0] * canvas_w for _ in range(canvas_h)]
    y0 = asc - top
    x0 = origin_x + left
    for y, row in enumerate(ink):
        gy = y0 + y
        if gy < 0 or gy >= canvas_h:
            continue
        for x, bit in enumerate(row):
            if not bit:
                continue
            gx = x0 + x
            if 0 <= gx < canvas_w:
                rows[gy][gx] = 1
    return rows


def required_specimen() -> str:
    """Every glyph a generated .flf contains, grouped for a readable preview."""
    groups = {"upper": [], "lower": [], "digit": [], "punct": [], "extra": []}
    for code in REQUIRED:
        ch = chr(code)
        if 65 <= code <= 90:
            groups["upper"].append(ch)
        elif 97 <= code <= 122:
            groups["lower"].append(ch)
        elif 48 <= code <= 57:
            groups["digit"].append(ch)
        elif code <= 126:
            groups["punct"].append(ch)
        else:
            groups["extra"].append(ch)
    return "\n".join("".join(g) for g in groups.values() if g)


def mosaic_glyphs(font_path: Path, size: int, aspect: float) -> dict[int, list[str]]:
    """Pack every required glyph the way write_flf does (shared crop, hardblanks)."""
    out_h = pad_even(max(2, size))
    bitmaps = {code: raster_char(font_path, chr(code), out_h, aspect) for code in REQUIRED}
    tops, bots = [], []
    for rows in bitmaps.values():
        top, bot = ink_span(rows)
        if top is not None:
            tops.append(top)
            bots.append(bot)
    crop_top = min(tops) if tops else 0
    crop_bot = max(bots) if bots else out_h - 1
    crop_top -= crop_top % 2
    if (crop_bot - crop_top + 1) % 2:
        crop_bot = min(crop_bot + 1, out_h - 1)

    packed = {}
    for code in REQUIRED:
        rows = crop_blank_rows(bitmaps[code], crop_top, crop_bot)
        packed[code] = pack_bitmap(rows, hardblank=True)
    return packed


def compose_packed(packed: dict[int, list[str]], text: str, width: int = 80) -> str:
    """Assemble preview text from .flf-style packed glyphs (hardblanks → spaces)."""
    empty = packed.get(32) or packed[next(iter(packed))]
    fig_h = len(empty)
    blank = [" " * 1 for _ in range(fig_h)]

    def glyph(ch: str) -> list[str]:
        rows = packed.get(ord(ch), blank)
        return [ln.replace(HARD, " ") for ln in rows]

    glyphs: list = []
    for ch in text:
        if ch == "\n":
            glyphs.append(None)
        else:
            glyphs.append(glyph(ch))
    return layout_glyphs(glyphs, width)


def render_text(font_path: Path, text: str, size: int, aspect: float, width: int = 80) -> str:
    out_h = pad_even(max(2, size))
    glyphs = []
    for ch in text:
        if ch == "\n":
            glyphs.append(None)
            continue
        glyphs.append(pack_bitmap(raster_char(font_path, ch, out_h, aspect)))
    return layout_glyphs(glyphs, width)


def write_flf(font_path: Path, dest: Path, size: int, aspect: float, comments: list[str]) -> None:
    packed = mosaic_glyphs(font_path, size, aspect)
    max_len = 1
    fig_h = None
    body_glyphs = {}
    for code in REQUIRED:
        lines = [ln + "@" for ln in packed[code]]
        lines[-1] += "@"
        body_glyphs[code] = lines
        fig_h = len(lines)
        max_len = max(max_len, max(len(ln) for ln in lines))
    header = f"flf2a{HARD} {fig_h} {fig_h} {max_len} -1 {len(comments)}"
    body = [header, *comments]
    for code in REQUIRED:
        body.extend(body_glyphs[code])
    dest.write_text("\n".join(body) + "\n", encoding="utf-8")


def main() -> int:
    p = argparse.ArgumentParser(
        description="Render a system/outline font as 2×2 block mosaic (figlet-style)."
    )
    p.add_argument("text", nargs="*", help="Text to render (default: font name, or stdin)")
    p.add_argument("-f", "--font", default="Denmark", help="Font family, file name, or path")
    p.add_argument("-s", "--size", type=int, default=12, help="Raster height in pixels (default 12)")
    p.add_argument(
        "-a",
        "--aspect",
        type=float,
        default=0.6,
        help="Width/height of the design grid (default 0.6: squash height to 60%%)",
    )
    p.add_argument(
        "-p",
        "--preview",
        nargs="?",
        const="",
        default=None,
        metavar="TEXT",
        help="Preview on stdout. Default: every glyph a generated .flf contains. "
             "Pass TEXT to preview that string instead.",
    )
    p.add_argument(
        "-w",
        "--width",
        type=int,
        default=None,
        metavar="COLS",
        help="Wrap width in columns (default: terminal width, or 80)",
    )
    p.add_argument("--flf", type=Path, help="Write a FIGlet .flf instead of rendering text")
    p.add_argument("--list", action="store_true", help="List discoverable font files")
    args = p.parse_args()

    if args.list:
        for row in list_fonts():
            print(row)
        return 0

    try:
        font_path = find_font(args.font)
    except FileNotFoundError as err:
        print(err, file=sys.stderr)
        return 1

    width = term_width(args.width)

    if args.preview is not None:
        if args.preview:
            text = args.preview
        elif args.text:
            text = " ".join(args.text)
        else:
            text = required_specimen()
        packed = mosaic_glyphs(font_path, args.size, args.aspect)
        sys.stdout.write(compose_packed(packed, text, width))
        if not args.flf:
            return 0

    if args.flf:
        comments = [
            f"{args.flf.stem} — hinted outline raster at {args.size}px, aspect {args.aspect}.",
            f"Source: {font_path.name}",
            "FreeType native TrueType bytecode (TARGET_MONO) at non-square ppem so",
            "0.6em-wide letters stay undistorted in a monospace cell.",
            "2×2 pixels → U+2580–259F quadrants (no shade blocks ░▒▓). Layout -1.",
        ]
        write_flf(font_path, args.flf, args.size, args.aspect, comments)
        print(f"Wrote {args.flf} from {font_path}", file=sys.stderr)
        return 0

    if args.text:
        text = " ".join(args.text)
    elif not sys.stdin.isatty():
        text = sys.stdin.read().rstrip("\n")
    else:
        text = font_path.stem

    sys.stdout.write(render_text(font_path, text, args.size, args.aspect, width))
    return 0


if __name__ == "__main__":
    sys.exit(main())
