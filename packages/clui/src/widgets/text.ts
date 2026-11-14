import type { ScreenBuffer } from '../buffer.js';
import type { Color } from '../colors.js';
import type { Rect } from '../layout.js';
import { clampScroll, drawVScrollbar, type ScrollState } from './scroll.js';

export interface TextBlockOptions {
  fg?: Color;
  bg?: Color;
  wrap?: boolean;
  showScrollbar?: boolean;
  scrollbarTrack?: Color;
  scrollbarThumb?: Color;
}

function wrapLine(line: string, width: number): string[] {
  if (width <= 0) return [];
  if (line.length === 0) return [''];
  const out: string[] = [];
  for (let i = 0; i < line.length; i += width) {
    out.push(line.slice(i, i + width));
  }
  return out;
}

export function layoutText(text: string, width: number, wrap = true): string[] {
  const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  if (!wrap) {
    return lines.map((l) => (l.length > width ? l.slice(0, Math.max(0, width - 1)) + '…' : l));
  }
  const out: string[] = [];
  for (const line of lines) {
    out.push(...wrapLine(line, width));
  }
  return out;
}

export function renderTextBlock(
  buf: ScreenBuffer,
  rect: Rect,
  text: string,
  scroll: ScrollState,
  opts: TextBlockOptions = {},
): string[] {
  const wrap = opts.wrap !== false;
  const showSb = opts.showScrollbar !== false;
  const linesProbe = layoutText(text, Math.max(1, rect.w - (showSb ? 1 : 0)), wrap);
  const needSb = showSb && linesProbe.length > rect.h;
  const sbW = needSb ? 1 : 0;
  const contentW = Math.max(0, rect.w - sbW);
  const lines = layoutText(text, contentW, wrap);

  scroll.contentLength = lines.length;
  scroll.viewLength = rect.h;
  scroll.offset = clampScroll(scroll);

  buf.fillRect(rect.x, rect.y, rect.w, rect.h, {
    ch: ' ',
    fg: opts.fg,
    bg: opts.bg,
  });

  for (let i = 0; i < rect.h; i++) {
    const line = lines[scroll.offset + i];
    if (line === undefined) break;
    buf.write(rect.x, rect.y + i, line.padEnd(contentW).slice(0, contentW), {
      fg: opts.fg,
      bg: opts.bg,
    });
  }

  if (needSb) {
    drawVScrollbar(
      buf,
      rect,
      scroll,
      { track: opts.scrollbarTrack, thumb: opts.scrollbarThumb },
    );
  }

  return lines;
}
