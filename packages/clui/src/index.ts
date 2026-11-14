/** CLUI — Command Line UI framework */

export { ansi, ESC, CSI } from './ansi.js';
export { Palette, isRgb, type Color } from './colors.js';
export {
  darkTheme,
  lightTheme,
  detectThemeMode,
  resolveTheme,
  type Theme,
  type ThemeMode,
} from './theme.js';
export { ScreenBuffer, emptyCell, type Cell } from './buffer.js';
export {
  drawBorder,
  BORDERS,
  type BorderStyle,
  type BorderChars,
  type DrawBorderOptions,
} from './border.js';
export {
  split,
  row,
  col,
  inset,
  contains,
  type Rect,
  type SizeSpec,
  type LayoutChild,
  type SplitDirection,
} from './layout.js';
export {
  InputParser,
  type KeyEvent,
  type KeyName,
  type MouseEvent,
  type MouseButton,
} from './input.js';
export { Screen, fillBackground, type ScreenOptions, type RenderFn } from './screen.js';
export { App, type AppOptions, type AppContext, type FrameHandler, type KeyHandler, type MouseHandler } from './app.js';

export {
  drawVScrollbar,
  drawHScrollbar,
  clampScroll,
  ensureVisible,
  type ScrollState,
  type ScrollbarStyle,
} from './widgets/scroll.js';
export {
  renderList,
  moveSelection,
  selectAt,
  listIndexAt,
  type ListItem,
  type ListViewState,
  type ListRenderOptions,
} from './widgets/list.js';
export {
  layoutText,
  renderTextBlock,
  type TextBlockOptions,
} from './widgets/text.js';
