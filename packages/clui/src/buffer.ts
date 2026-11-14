import { ansi } from './ansi.js';
import { isRgb, type Color } from './colors.js';

export interface Cell {
  ch: string;
  fg: Color;
  bg: Color;
  bold: boolean;
  underline: boolean;
  inverse: boolean;
}

export function emptyCell(bg: Color = 'default'): Cell {
  return {
    ch: ' ',
    fg: 'default',
    bg,
    bold: false,
    underline: false,
    inverse: false,
  };
}

function styleKey(c: Cell): string {
  const fg =
    c.fg === null || c.fg === 'default'
      ? 'd'
      : isRgb(c.fg)
        ? `r${c.fg.r},${c.fg.g},${c.fg.b}`
        : String(c.fg);
  const bg =
    c.bg === null || c.bg === 'default'
      ? 'd'
      : isRgb(c.bg)
        ? `r${c.bg.r},${c.bg.g},${c.bg.b}`
        : String(c.bg);
  return `${fg}|${bg}|${c.bold ? 1 : 0}${c.underline ? 1 : 0}${c.inverse ? 1 : 0}`;
}

function styleSeq(c: Cell): string {
  let s = ansi.reset;
  if (c.bold) s += ansi.bold;
  if (c.underline) s += ansi.underline;
  if (c.inverse) s += ansi.inverse;
  if (c.fg !== null && c.fg !== 'default') {
    s += isRgb(c.fg) ? ansi.fgRgb(c.fg.r, c.fg.g, c.fg.b) : ansi.fg(c.fg);
  }
  if (c.bg !== null && c.bg !== 'default') {
    s += isRgb(c.bg) ? ansi.bgRgb(c.bg.r, c.bg.g, c.bg.b) : ansi.bg(c.bg);
  }
  return s;
}

function cellsEqual(a: Cell, b: Cell): boolean {
  return (
    a.ch === b.ch &&
    styleKey(a) === styleKey(b)
  );
}

/** Double-buffered cell grid with differential ANSI output. */
export class ScreenBuffer {
  width: number;
  height: number;
  private front: Cell[][];
  private back: Cell[][];
  private defaultBg: Color;

  constructor(width: number, height: number, defaultBg: Color = 'default') {
    this.width = Math.max(1, width);
    this.height = Math.max(1, height);
    this.defaultBg = defaultBg;
    this.front = this.alloc();
    this.back = this.alloc();
  }

  private alloc(): Cell[][] {
    const rows: Cell[][] = [];
    for (let y = 0; y < this.height; y++) {
      const row: Cell[] = [];
      for (let x = 0; x < this.width; x++) {
        row.push(emptyCell(this.defaultBg));
      }
      rows.push(row);
    }
    return rows;
  }

  resize(width: number, height: number, defaultBg?: Color): void {
    if (defaultBg !== undefined) this.defaultBg = defaultBg;
    this.width = Math.max(1, width);
    this.height = Math.max(1, height);
    this.front = this.alloc();
    this.back = this.alloc();
  }

  clear(bg?: Color): void {
    const fill = bg ?? this.defaultBg;
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        this.back[y]![x] = emptyCell(fill);
      }
    }
  }

  set(
    x: number,
    y: number,
    ch: string,
    opts: Partial<Omit<Cell, 'ch'>> = {},
  ): void {
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) return;
    const cell = this.back[y]![x]!;
    const glyph = ch.length ? [...ch][0]! : ' ';
    this.back[y]![x] = {
      ch: glyph,
      fg: opts.fg ?? cell.fg,
      bg: opts.bg ?? cell.bg,
      bold: opts.bold ?? false,
      underline: opts.underline ?? false,
      inverse: opts.inverse ?? false,
    };
  }

  write(
    x: number,
    y: number,
    text: string,
    opts: Partial<Omit<Cell, 'ch'>> = {},
  ): void {
    let cx = x;
    for (const ch of text) {
      if (ch === '\n') break;
      this.set(cx, y, ch, opts);
      cx += 1;
      if (cx >= this.width) break;
    }
  }

  fillRect(
    x: number,
    y: number,
    w: number,
    h: number,
    opts: Partial<Cell> = {},
  ): void {
    const ch = opts.ch ?? ' ';
    for (let row = y; row < y + h; row++) {
      for (let col = x; col < x + w; col++) {
        this.set(col, row, ch, opts);
      }
    }
  }

  /** Emit ANSI for changed cells; swap buffers. */
  flush(out: NodeJS.WritableStream = process.stdout, full = false): void {
    let outStr = '';
    let lastStyle = '';
    let lastX = -2;
    let lastY = -2;

    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        const next = this.back[y]![x]!;
        const prev = this.front[y]![x]!;
        if (!full && cellsEqual(next, prev)) continue;

        const sk = styleKey(next);
        const needMove = !(x === lastX + 1 && y === lastY);
        if (needMove) {
          outStr += ansi.move(y + 1, x + 1);
        }
        if (sk !== lastStyle) {
          outStr += styleSeq(next);
          lastStyle = sk;
        }
        outStr += next.ch;
        lastX = x;
        lastY = y;

        this.front[y]![x] = { ...next };
      }
    }

    if (outStr) {
      outStr += ansi.reset;
      out.write(outStr);
    }
  }
}
