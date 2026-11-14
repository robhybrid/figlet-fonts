import type { ScreenBuffer } from './buffer.js';
import type { Color } from './colors.js';

export type BorderStyle = 'none' | 'single' | 'double' | 'rounded' | 'heavy';

export interface BorderChars {
  tl: string;
  tr: string;
  bl: string;
  br: string;
  h: string;
  v: string;
}

export const BORDERS: Record<Exclude<BorderStyle, 'none'>, BorderChars> = {
  single: { tl: '┌', tr: '┐', bl: '└', br: '┘', h: '─', v: '│' },
  double: { tl: '╔', tr: '╗', bl: '╚', br: '╝', h: '═', v: '║' },
  rounded: { tl: '╭', tr: '╮', bl: '╰', br: '╯', h: '─', v: '│' },
  heavy: { tl: '┏', tr: '┓', bl: '┗', br: '┛', h: '━', v: '┃' },
};

export interface DrawBorderOptions {
  style?: BorderStyle;
  fg?: Color;
  bg?: Color;
  title?: string;
  titleFg?: Color;
}

/** Draw a box border into the buffer. Returns inner content rect. */
export function drawBorder(
  buf: ScreenBuffer,
  x: number,
  y: number,
  w: number,
  h: number,
  opts: DrawBorderOptions = {},
): { x: number; y: number; w: number; h: number } {
  const style = opts.style ?? 'single';
  if (style === 'none' || w < 2 || h < 2) {
    return { x, y, w, h };
  }

  const b = BORDERS[style];
  const styleOpts = { fg: opts.fg, bg: opts.bg };

  buf.set(x, y, b.tl, styleOpts);
  buf.set(x + w - 1, y, b.tr, styleOpts);
  buf.set(x, y + h - 1, b.bl, styleOpts);
  buf.set(x + w - 1, y + h - 1, b.br, styleOpts);

  for (let col = x + 1; col < x + w - 1; col++) {
    buf.set(col, y, b.h, styleOpts);
    buf.set(col, y + h - 1, b.h, styleOpts);
  }
  for (let row = y + 1; row < y + h - 1; row++) {
    buf.set(x, row, b.v, styleOpts);
    buf.set(x + w - 1, row, b.v, styleOpts);
  }

  if (opts.title && w > 4) {
    const max = w - 4;
    const title = opts.title.length > max ? opts.title.slice(0, max - 1) + '…' : opts.title;
    const label = ` ${title} `;
    buf.write(x + 1, y, label, {
      fg: opts.titleFg ?? opts.fg,
      bg: opts.bg,
      bold: true,
    });
  }

  return { x: x + 1, y: y + 1, w: w - 2, h: h - 2 };
}
