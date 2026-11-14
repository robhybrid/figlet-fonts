import type { ScreenBuffer } from '../buffer.js';
import type { Color } from '../colors.js';
import { contains, type Rect } from '../layout.js';
import type { Theme } from '../theme.js';
import { clampScroll, drawVScrollbar, ensureVisible } from './scroll.js';

export interface ListItem {
  id: string;
  label: string;
  meta?: string;
  selectable?: boolean;
}

export interface ListViewState {
  items: ListItem[];
  selected: number;
  offset: number;
  focused: boolean;
}

export interface ListRenderOptions {
  theme: Theme;
  showScrollbar?: boolean;
  highlightFg?: Color;
  highlightBg?: Color;
}

export function moveSelection(state: ListViewState, delta: number, viewH: number): void {
  if (state.items.length === 0) {
    state.selected = 0;
    state.offset = 0;
    return;
  }
  state.selected = Math.max(0, Math.min(state.items.length - 1, state.selected + delta));
  state.offset = ensureVisible(state.selected, state.offset, viewH);
  state.offset = clampScroll({
    offset: state.offset,
    contentLength: state.items.length,
    viewLength: viewH,
  });
}

export function selectAt(state: ListViewState, index: number, viewH: number): void {
  if (state.items.length === 0) return;
  state.selected = Math.max(0, Math.min(state.items.length - 1, index));
  state.offset = ensureVisible(state.selected, state.offset, viewH);
}

export function renderList(
  buf: ScreenBuffer,
  rect: Rect,
  state: ListViewState,
  opts: ListRenderOptions,
): Rect {
  const { theme } = opts;
  const showSb = opts.showScrollbar !== false;
  const sbW = showSb && state.items.length > rect.h ? 1 : 0;
  const content: Rect = { x: rect.x, y: rect.y, w: Math.max(0, rect.w - sbW), h: rect.h };

  buf.fillRect(rect.x, rect.y, rect.w, rect.h, { ch: ' ', bg: theme.bg, fg: theme.fg });

  const viewH = content.h;
  state.offset = clampScroll({
    offset: state.offset,
    contentLength: state.items.length,
    viewLength: viewH,
  });

  for (let i = 0; i < viewH; i++) {
    const idx = state.offset + i;
    const item = state.items[idx];
    if (!item) break;
    const selected = idx === state.selected && state.focused;
    const fg = selected ? (opts.highlightFg ?? theme.selectionFg) : theme.fg;
    const bg = selected ? (opts.highlightBg ?? theme.selectionBg) : theme.bg;
    const prefix = selected ? '› ' : '  ';
    let text = prefix + item.label;
    if (item.meta) {
      const room = content.w - text.length - item.meta.length - 1;
      if (room > 0) {
        text = text + ' '.repeat(room) + ' ' + item.meta;
      }
    }
    if (text.length > content.w) text = text.slice(0, Math.max(0, content.w - 1)) + '…';
    buf.fillRect(content.x, content.y + i, content.w, 1, { ch: ' ', fg, bg });
    buf.write(content.x, content.y + i, text.padEnd(content.w).slice(0, content.w), {
      fg,
      bg,
      bold: selected,
    });
  }

  if (sbW) {
    drawVScrollbar(
      buf,
      { x: rect.x, y: rect.y, w: rect.w, h: rect.h },
      {
        offset: state.offset,
        contentLength: state.items.length,
        viewLength: viewH,
      },
      { track: theme.scrollbarTrack, thumb: theme.scrollbar },
    );
  }

  return content;
}

/** Map a mouse click inside the list content rect to an item index. */
export function listIndexAt(
  content: Rect,
  state: ListViewState,
  x: number,
  y: number,
): number | null {
  if (!contains(content, x, y)) return null;
  const idx = state.offset + (y - content.y);
  if (idx < 0 || idx >= state.items.length) return null;
  return idx;
}
