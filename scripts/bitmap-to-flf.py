#!/usr/bin/env python3
"""Pack a 1-bit bitmap font into a FIGlet .flf using 2×2 block quadrants.

Uses U+2580–U+259F except the shade blocks U+2591–U+2593.
Empty 2×2 tiles become the hardblank so glyph width is preserved.
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

HARD = "$"
END = "@"

# 2×2 bits: UL UR / LL LR  →  block element (no U+2591–2593)
QUAD = {
    0b0000: HARD,
    0b1000: "▘",  # UL
    0b0100: "▝",  # UR
    0b0010: "▖",  # LL
    0b0001: "▗",  # LR
    0b1100: "▀",  # upper half
    0b0011: "▄",  # lower half
    0b1010: "▌",  # left half
    0b0101: "▐",  # right half
    0b1110: "▛",
    0b1101: "▜",
    0b1011: "▙",
    0b0111: "▟",
    0b1001: "▚",
    0b0110: "▞",
    0b1111: "█",
}

REQUIRED = list(range(32, 127)) + [196, 214, 220, 228, 246, 252, 223]


def pad_even(n: int) -> int:
    return n if n % 2 == 0 else n + 1


def pack_rows(pixels: list[list[int]]) -> list[str]:
    """pixels[y][x] is 0/1, origin top-left. Height/width may be odd (padded)."""
    h = pad_even(len(pixels))
    w = pad_even(max((len(r) for r in pixels), default=0))
    grid = [[0] * w for _ in range(h)]
    for y, row in enumerate(pixels):
        for x, bit in enumerate(row):
            if bit:
                grid[y][x] = 1
    out = []
    for y in range(0, h, 2):
        chars = []
        for x in range(0, w, 2):
            bits = (
                (grid[y][x] << 3)
                | (grid[y][x + 1] << 2)
                | (grid[y + 1][x] << 1)
                | grid[y + 1][x + 1]
            )
            chars.append(QUAD[bits])
        out.append("".join(chars) + END)
    if out:
        out[-1] += END
    return out


def parse_bdf(path: Path | str) -> dict:
    """Return {code: {dwidth, rows}} with rows as 0/1 grids, top-left origin."""
    text = Path(path).read_text(encoding="utf-8", errors="replace")
    ascent = descent = 0
    glyphs = {}
    i = 0
    lines = text.splitlines()
    while i < len(lines):
        line = lines[i]
        if line.startswith("FONT_ASCENT"):
            ascent = int(line.split()[1])
        elif line.startswith("FONT_DESCENT"):
            descent = int(line.split()[1])
        elif line.startswith("STARTCHAR"):
            enc = dwidth = None
            bbx = None
            bitmap = []
            i += 1
            while i < len(lines) and lines[i] != "ENDCHAR":
                p = lines[i]
                if p.startswith("ENCODING"):
                    enc = int(p.split()[1])
                elif p.startswith("DWIDTH"):
                    dwidth = int(p.split()[1])
                elif p.startswith("BBX"):
                    parts = p.split()
                    bbx = tuple(int(x) for x in parts[1:5])  # w h xoff yoff
                elif p == "BITMAP":
                    i += 1
                    while i < len(lines) and lines[i] != "ENDCHAR":
                        bitmap.append(lines[i].strip())
                        i += 1
                    continue
                i += 1
            if enc is not None and enc >= 0 and dwidth and bbx:
                bw, bh, xoff, yoff = bbx
                canvas_h = ascent + descent
                canvas_w = max(dwidth, xoff + bw, 1)
                rows = [[0] * canvas_w for _ in range(canvas_h)]
                # BDF yoff is bottom of bitmap relative to baseline.
                # Top of bitmap in canvas (row 0 = top / ascent):
                top = ascent - (yoff + bh)
                for by, hexrow in enumerate(bitmap):
                    if not hexrow:
                        continue
                    val = int(hexrow, 16)
                    bits = len(hexrow) * 4
                    for bx in range(bw):
                        if val & (1 << (bits - 1 - bx)):
                            x = xoff + bx
                            y = top + by
                            if 0 <= y < canvas_h and 0 <= x < canvas_w:
                                rows[y][x] = 1
                glyphs[enc] = {"dwidth": canvas_w, "rows": rows}
            continue
        i += 1
    return {"ascent": ascent, "descent": descent, "glyphs": glyphs}


def raster_ttf(path: Path, px: int) -> dict:
    from PIL import Image, ImageDraw, ImageFont

    font = ImageFont.truetype(str(path), size=px)
    ascent, descent = font.getmetrics()
    glyphs = {}
    for code in REQUIRED:
        ch = chr(code)
        try:
            mask = font.getmask(ch, mode="L")
            bbox = font.getbbox(ch)
            adv = font.getlength(ch)
        except Exception:
            continue
        adv_w = max(int(round(adv)), 1)
        canvas_h = ascent + descent
        canvas_w = adv_w
        im = Image.new("L", (max(canvas_w, 1), max(canvas_h, 1)), 0)
        draw = ImageDraw.Draw(im)
        # Draw with baseline at `ascent`.
        draw.text((0, 0), ch, font=font, fill=255, anchor="ls")
        # Some PIL builds ignore anchor; fall back to bbox offset.
        if im.getextrema()[1] == 0 and bbox:
            im = Image.new("L", (max(canvas_w, bbox[2] - bbox[0], 1), canvas_h), 0)
            ImageDraw.Draw(im).text((-bbox[0], -bbox[1]), ch, font=font, fill=255)
        data = list(im.getdata())
        w, h = im.size
        rows = []
        for y in range(h):
            rows.append([1 if data[y * w + x] >= 128 else 0 for x in range(w)])
        glyphs[code] = {"dwidth": w, "rows": rows}
    return {"ascent": ascent, "descent": descent, "glyphs": glyphs}


def empty_glyph(width: int, height: int) -> list[list[int]]:
    return [[0] * width for _ in range(height)]


def shift_grid(rows: list[list[int]], dx: int, dy: int) -> list[list[int]]:
    """Insert empty columns/rows so 1px stems land on even 2×2 tile boundaries."""
    if not rows:
        return rows
    h, w = len(rows), len(rows[0])
    out = [[0] * (w + dx) for _ in range(h + dy)]
    for y, row in enumerate(rows):
        for x, bit in enumerate(row):
            out[y + dy][x + dx] = bit
    return out


def write_flf(
    path: Path, comments: list[str], glyphs: dict, align: int = 1
) -> None:
    packed = {}
    max_len = 0
    fig_height = None
    if align:
        shifted = {}
        for code, g in glyphs.items():
            shifted[code] = {
                "dwidth": g["dwidth"] + align,
                "rows": shift_grid(g["rows"], align, align),
            }
        glyphs = shifted

    for code in REQUIRED:
        g = glyphs.get(code)
        rows = g["rows"] if g else None
        if not rows:
            # Match the font's typical cell so missing glyphs still have height.
            sample = next(iter(glyphs.values()))["rows"]
            rows = empty_glyph(max(2, g["dwidth"] if g else 4), len(sample))
        lines = pack_rows(rows)
        packed[code] = lines
        fig_height = len(lines)
        max_len = max(max_len, max(len(ln) for ln in lines))

    # Baseline in FIGlet = rows from top to baseline, roughly half/ascent pack.
    baseline = fig_height
    header = f"flf2a{HARD} {fig_height} {baseline} {max_len} -1 {len(comments)}"
    out = [header, *comments]
    for code in REQUIRED:
        out.extend(packed[code])
    path.write_text("\n".join(out) + "\n", encoding="utf-8")


def main() -> int:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("font", type=Path, help=".bdf or .ttf/.otf source")
    p.add_argument("-o", "--output", type=Path, required=True)
    p.add_argument("--px", type=int, default=16, help="TTF raster size (ignored for BDF)")
    p.add_argument(
        "--align",
        type=int,
        default=1,
        help="Shift glyph origin by N pixels so 2×2 tiles match stem edges",
    )
    p.add_argument("--comment", action="append", default=[], help="Extra header comment lines")
    args = p.parse_args()

    src = args.font
    if src.suffix.lower() == ".bdf":
        data = parse_bdf(src)
    else:
        data = raster_ttf(src, args.px)

    comments = args.comment or [
        f"Bitmap mosaic of {src.name} packed 2×2 into U+2580–259F quadrants.",
        "Empty tiles use the hardblank. Layout is full-width (no smushing).",
    ]
    write_flf(args.output, comments, data["glyphs"], align=args.align)
    print(f"Wrote {args.output}  ({len(REQUIRED)} glyphs)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
