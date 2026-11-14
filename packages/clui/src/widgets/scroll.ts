import type { ScreenBuffer } from '../buffer.js';
import type { Color } from '../colors.js';
import type { Rect } from '../layout.js';

export interface ScrollState {
  offset: number;
  contentLength: number;
  viewLength: number;
}

export function clampScroll(state: ScrollState): number {
  const max = Math.max(0, state.contentLength - state.viewLength);
  return Math.max(0, Math.min(max, state.offset));
}

export interface ScrollbarStyle {
  track?: Color;
  thumb?: Color;
}

/** Draw a vertical scrollbar on the right edge of `rect`. */
export function drawVScrollbar(
  buf: ScreenBuffer,
  rect: Rect,
  state: ScrollState,
  style: ScrollbarStyle = {},
): void {
  if (rect.w < 1 || rect.h < 1) return;
  const x = rect.x + rect.w - 1;
  const track = style.track ?? 237;
  const thumb = style.thumb ?? 244;

  for (let i = 0; i < rect.h; i++) {
    buf.set(x, rect.y + i, '│', { fg: track });
  }

  if (state.contentLength <= state.viewLength || rect.h < 1) return;

  const thumbSize = Math.max(1, Math.round((state.viewLength / state.contentLength) * rect.h));
  const maxOffset = state.contentLength - state.viewLength;
  const maxThumbTravel = Math.max(0, rect.h - thumbSize);
  const thumbPos =
    maxOffset <= 0
      ? 0
      : Math.round((clampScroll(state) / maxOffset) * maxThumbTravel);

  for (let i = 0; i < thumbSize; i++) {
    buf.set(x, rect.y + thumbPos + i, '█', { fg: thumb });
  }
}

/** Draw a horizontal scrollbar on the bottom edge of `rect`. */
export function drawHScrollbar(
  buf: ScreenBuffer,
  rect: Rect,
  state: ScrollState,
  style: ScrollbarStyle = {},
): void {
  if (rect.w < 1 || rect.h < 1) return;
  const y = rect.y + rect.h - 1;
  const track = style.track ?? 237;
  const thumb = style.thumb ?? 244;

  for (let i = 0; i < rect.w; i++) {
    buf.set(rect.x + i, y, '─', { fg: track });
  }

  if (state.contentLength <= state.viewLength || rect.w < 1) return;

  const thumbSize = Math.max(1, Math.round((state.viewLength / state.contentLength) * rect.w));
  const maxOffset = state.contentLength - state.viewLength;
  const maxThumbTravel = Math.max(0, rect.w - thumbSize);
  const thumbPos =
    maxOffset <= 0
      ? 0
      : Math.round((clampScroll(state) / maxOffset) * maxThumbTravel);

  for (let i = 0; i < thumbSize; i++) {
    buf.set(rect.x + thumbPos + i, y, '█', { fg: thumb });
  }
}

/** Ensure `index` is visible within a vertical scroll window. */
export function ensureVisible(
  index: number,
  offset: number,
  viewLength: number,
): number {
  if (index < offset) return index;
  if (index >= offset + viewLength) return index - viewLength + 1;
  return offset;
}
