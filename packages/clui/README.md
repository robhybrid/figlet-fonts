# CLUI

**CLUI** (Command Line UI) is a TypeScript/Node terminal UI framework: full-window rendering, tiled layouts, borders, scrollbars, mouse + keyboard interaction, and light/dark themes.

This package lives in the `figlet-fonts` repo as an early dependency home for the CLUI project. Existing font install/preview scripts are unchanged.

## Requirements

| Item | Notes |
|------|--------|
| Node.js | ≥ 18 |
| Shell | bash or zsh (any interactive login is fine) |
| TTY | Interactive stdin/stdout (not a pipe) |
| `TERM` | Prefer `xterm-256color`, `xterm-256color` (VS Code), or `screen-256color`. Needs CSI support, 256-color (or truecolor), and UTF-8 for box-drawing. |
| Mouse | SGR mouse tracking (`CSI ?1000/1002/1006 h`). Works in VS Code integrated terminal, iTerm2, Windows Terminal, GNOME Terminal, etc. |
| Theme auto-detect | Uses `CLUI_THEME` / `CLUI_COLOR_SCHEME`, then `COLORFGBG`, then light heuristics; defaults to **dark**. |

**VS Code terminal:** set `"terminal.integrated.mouseEvents": true` (default) so click/scroll reach the app. Resize is handled via Node's `stdout` `resize` event.

## Quick start — file browser demo

```bash
# from repo root
npm install --prefix packages/clui
npm run clui:demo

# or from this package
cd packages/clui
npm install
npm run demo
```

### Demo controls

| Input | Action |
|-------|--------|
| ↑ / ↓ | Move selection in the file list |
| Enter | Open directory / focus file |
| Backspace | Go up one directory |
| Tab | Toggle focus list ↔ preview |
| PageUp / PageDown | Page the focused pane |
| Mouse click | Select list item or focus preview |
| Mouse drag | Visual line select in preview |
| Mouse wheel | Scroll focused pane |
| `t` | Toggle light / dark theme |
| `q` / Esc / Ctrl+C | Quit |

Override theme: `CLUI_THEME=light npm run demo`

## API sketch

```ts
import {
  App,
  row, col, drawBorder,
  renderList, moveSelection,
  resolveTheme,
} from '@clui/core';

const app = new App({ theme: 'auto', mouse: true });

app.onFrame(({ buf, cols, rows, theme }) => {
  const [left, right] = row({ x: 0, y: 0, w: cols, h: rows }, [
    { size: '30%' },
    { size: '*' },
  ]);
  const inner = drawBorder(buf, left!.x, left!.y, left!.w, left!.h, {
    style: 'rounded',
    fg: theme.borderFocus,
    title: 'Files',
  });
  // renderList(buf, inner, listState, { theme });
  void right;
  void inner;
});

app.onKey((e) => {
  if (e.name === 'down') { /* moveSelection(...) */ }
});

app.onMouse((e) => {
  if (e.type === 'down') { /* hit-test rects */ }
});

app.start();
```

### Modules

| Module | Role |
|--------|------|
| `Screen` / `App` | TTY lifecycle, alt screen, resize, render loop |
| `ScreenBuffer` | Double-buffered cells + differential ANSI flush |
| `layout` (`row` / `col` / `split`) | Flexible tiled splits (`*`, `%`, fixed) |
| `drawBorder` | `single` \| `double` \| `rounded` \| `heavy` \| `none` |
| `renderList` / `renderTextBlock` | Scrollable list & text with scrollbars |
| `InputParser` | Arrow keys, chords, SGR mouse |
| `theme` | Light/dark + `COLORFGBG` / env auto-detect |

## Scripts

| Script | Description |
|--------|-------------|
| `npm run build` | Compile TypeScript → `dist/` |
| `npm run demo` | Build + run file browser |
| `npm run typecheck` | `tsc --noEmit` |

## Deferred (post-MVP)

- Widget focus manager / form inputs
- Horizontal split drag-to-resize
- Copy-to-clipboard for mouse selections
- Windows ConPTY-specific testing
- Published npm release workflow

## License

MIT
