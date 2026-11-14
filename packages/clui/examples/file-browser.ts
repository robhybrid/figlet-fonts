#!/usr/bin/env node
/**
 * CLUI file-browser demo
 *
 * Exercises: full-window render, resize, tiled layouts, borders, scrollbars,
 * mouse click/select, arrow-key selection, FG/BG themes (auto + toggle).
 *
 * Run from packages/clui:
 *   npm install && npm run demo
 *
 * Or from repo root:
 *   npm run clui:demo
 */

import fs from 'node:fs';
import path from 'node:path';
import {
  App,
  col,
  contains,
  drawBorder,
  listIndexAt,
  moveSelection,
  renderList,
  renderTextBlock,
  row,
  selectAt,
  type ListItem,
  type ListViewState,
  type Rect,
} from '../src/index.js';

interface Entry {
  name: string;
  fullPath: string;
  isDir: boolean;
  size: number;
  mtime: Date;
}

function listDir(dir: string): Entry[] {
  let names: string[];
  try {
    names = fs.readdirSync(dir);
  } catch (err) {
    return [];
  }
  const entries: Entry[] = [];
  for (const name of names) {
    if (name === '.git' && path.basename(dir) !== '.git') {
      // still show .git; no special skip beyond unreadable
    }
    const fullPath = path.join(dir, name);
    try {
      const st = fs.lstatSync(fullPath);
      entries.push({
        name,
        fullPath,
        isDir: st.isDirectory(),
        size: st.size,
        mtime: st.mtime,
      });
    } catch {
      /* skip unreadable */
    }
  }
  entries.sort((a, b) => {
    if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
  return entries;
}

function formatSize(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} K`;
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} M`;
  return `${(n / (1024 * 1024 * 1024)).toFixed(1)} G`;
}

function previewFile(filePath: string, maxBytes = 32_768): string {
  try {
    const st = fs.statSync(filePath);
    if (st.isDirectory()) return `(directory)\n${filePath}`;
    const fd = fs.openSync(filePath, 'r');
    const buf = Buffer.alloc(Math.min(maxBytes, st.size));
    const bytes = fs.readSync(fd, buf, 0, buf.length, 0);
    fs.closeSync(fd);
    const slice = buf.slice(0, bytes);
    // Heuristic: binary if many nulls / non-text
    let weird = 0;
    for (let i = 0; i < slice.length; i++) {
      const c = slice[i]!;
      if (c === 0) weird += 4;
      else if (c < 7 || (c > 14 && c < 32)) weird += 1;
    }
    if (weird > slice.length * 0.1) {
      return `(binary file, ${formatSize(st.size)})\n${filePath}`;
    }
    let text = slice.toString('utf8');
    if (st.size > maxBytes) text += `\n\n… truncated (${formatSize(st.size)} total)`;
    return text;
  } catch (err) {
    return `Unable to read:\n${filePath}\n\n${String(err)}`;
  }
}

function toItems(entries: Entry[]): ListItem[] {
  return entries.map((e) => ({
    id: e.fullPath,
    label: (e.isDir ? '[dir] ' : '      ') + e.name,
    meta: e.isDir ? 'dir' : formatSize(e.size),
  }));
}

// ── State ──────────────────────────────────────────────────────────
let cwd = process.cwd();
let entries = listDir(cwd);
const listState: ListViewState = {
  items: toItems(entries),
  selected: 0,
  offset: 0,
  focused: true,
};
let previewScroll = { offset: 0, contentLength: 0, viewLength: 0 };
let previewText = '';
let status = '↑↓ select · Enter open · Backspace up · Tab focus · t theme · q quit';
let focus: 'list' | 'preview' = 'list';
let listContentRect: Rect = { x: 0, y: 0, w: 0, h: 0 };
let previewContentRect: Rect = { x: 0, y: 0, w: 0, h: 0 };
let selectionAnchor: { x: number; y: number } | null = null;
let selectionEnd: { x: number; y: number } | null = null;

function refreshList(keepName?: string): void {
  entries = listDir(cwd);
  listState.items = toItems(entries);
  if (keepName) {
    const idx = entries.findIndex((e) => e.name === keepName);
    listState.selected = idx >= 0 ? idx : 0;
  } else {
    listState.selected = Math.min(listState.selected, Math.max(0, entries.length - 1));
  }
  listState.offset = 0;
  updatePreview();
}

function updatePreview(): void {
  const entry = entries[listState.selected];
  previewScroll.offset = 0;
  if (!entry) {
    previewText = '(empty directory)';
    return;
  }
  if (entry.isDir) {
    previewText = `Directory: ${entry.name}\n\nPath: ${entry.fullPath}\nModified: ${entry.mtime.toISOString()}\n\nPress Enter to open.`;
  } else {
    previewText = previewFile(entry.fullPath);
  }
}

function openSelected(): void {
  const entry = entries[listState.selected];
  if (!entry) return;
  if (entry.isDir) {
    cwd = entry.fullPath;
    refreshList();
    status = `Opened ${cwd}`;
  } else {
    status = `File: ${entry.name} (${formatSize(entry.size)})`;
    updatePreview();
  }
}

function goUp(): void {
  const parent = path.dirname(cwd);
  if (parent === cwd) {
    status = 'Already at filesystem root';
    return;
  }
  const left = path.basename(cwd);
  cwd = parent;
  refreshList(left);
  status = `Up to ${cwd}`;
}

updatePreview();

const app = new App({ theme: 'auto', mouse: true, title: 'CLUI File Browser' });

app.onFrame(({ buf, cols, rows, theme }) => {
  // Root layout: status bar + body
  const [body, statusBar] = col(
    { x: 0, y: 0, w: cols, h: rows },
    [{ size: '*' }, { size: 1 }],
  );

  // Body: sidebar list | preview
  const [side, main] = row(body!, [
    { size: '36%', min: 24 },
    { size: '*', min: 20 },
  ]);

  // Sidebar border + list
  buf.fillRect(side!.x, side!.y, side!.w, side!.h, { ch: ' ', bg: theme.bg });
  const sideInner = drawBorder(buf, side!.x, side!.y, side!.w, side!.h, {
    style: focus === 'list' ? 'rounded' : 'single',
    fg: focus === 'list' ? theme.borderFocus : theme.border,
    bg: theme.bg,
    title: path.basename(cwd) || cwd,
    titleFg: theme.titleFg,
  });
  listState.focused = focus === 'list';
  listContentRect = renderList(buf, sideInner, listState, {
    theme,
    showScrollbar: true,
  });

  // Preview pane
  buf.fillRect(main!.x, main!.y, main!.w, main!.h, { ch: ' ', bg: theme.bg });
  const entry = entries[listState.selected];
  const previewTitle = entry ? entry.name : 'Preview';
  const mainInner = drawBorder(buf, main!.x, main!.y, main!.w, main!.h, {
    style: focus === 'preview' ? 'rounded' : 'single',
    fg: focus === 'preview' ? theme.borderFocus : theme.border,
    bg: theme.bg,
    title: previewTitle,
    titleFg: theme.titleFg,
  });
  previewContentRect = mainInner;
  const previewLines = renderTextBlock(buf, mainInner, previewText, previewScroll, {
    fg: theme.fg,
    bg: theme.bg,
    wrap: true,
    showScrollbar: true,
    scrollbarTrack: theme.scrollbarTrack,
    scrollbarThumb: theme.scrollbar,
  });

  // Mouse drag selection highlight in the preview pane
  if (selectionAnchor && selectionEnd) {
    const y0 = Math.min(selectionAnchor.y, selectionEnd.y);
    const y1 = Math.max(selectionAnchor.y, selectionEnd.y);
    const contentW = Math.max(1, mainInner.w - (previewLines.length > mainInner.h ? 1 : 0));
    for (let y = y0; y <= y1; y++) {
      if (y < mainInner.y || y >= mainInner.y + mainInner.h) continue;
      const lineIdx = previewScroll.offset + (y - mainInner.y);
      const line = (previewLines[lineIdx] ?? '').padEnd(contentW).slice(0, contentW);
      buf.write(mainInner.x, y, line, {
        fg: theme.selectionFg,
        bg: theme.selectionBg,
      });
    }
  }

  // Status bar
  const themeTag = `[${theme.mode}]`;
  const left = ` ${cwd} `;
  const right = ` ${themeTag} ${status} `;
  buf.fillRect(statusBar!.x, statusBar!.y, statusBar!.w, 1, {
    ch: ' ',
    fg: theme.statusFg,
    bg: theme.statusBg,
  });
  const mid = Math.max(0, statusBar!.w - left.length - right.length);
  buf.write(statusBar!.x, statusBar!.y, (left + ' '.repeat(mid) + right).slice(0, statusBar!.w), {
    fg: theme.statusFg,
    bg: theme.statusBg,
  });
});

app.onKey((e) => {
  if (e.name === 'tab') {
    focus = focus === 'list' ? 'preview' : 'list';
    listState.focused = focus === 'list';
    status = `Focus: ${focus}`;
    return true;
  }
  if (e.name === 't' && !e.ctrl) {
    app.toggleTheme();
    status = `Theme: ${app.theme.mode}`;
    return true;
  }
  if (focus === 'list') {
    const viewH = Math.max(1, listContentRect.h);
    if (e.name === 'up') {
      moveSelection(listState, -1, viewH);
      updatePreview();
      return true;
    }
    if (e.name === 'down') {
      moveSelection(listState, 1, viewH);
      updatePreview();
      return true;
    }
    if (e.name === 'pageup') {
      moveSelection(listState, -viewH, viewH);
      updatePreview();
      return true;
    }
    if (e.name === 'pagedown') {
      moveSelection(listState, viewH, viewH);
      updatePreview();
      return true;
    }
    if (e.name === 'home') {
      selectAt(listState, 0, viewH);
      updatePreview();
      return true;
    }
    if (e.name === 'end') {
      selectAt(listState, listState.items.length - 1, viewH);
      updatePreview();
      return true;
    }
    if (e.name === 'enter') {
      openSelected();
      return true;
    }
    if (e.name === 'backspace') {
      goUp();
      return true;
    }
  } else {
    // preview scroll
    if (e.name === 'up') {
      previewScroll.offset = Math.max(0, previewScroll.offset - 1);
      return true;
    }
    if (e.name === 'down') {
      previewScroll.offset += 1;
      return true;
    }
    if (e.name === 'pageup') {
      previewScroll.offset = Math.max(0, previewScroll.offset - previewScroll.viewLength);
      return true;
    }
    if (e.name === 'pagedown') {
      previewScroll.offset += previewScroll.viewLength;
      return true;
    }
  }
  return false;
});

app.onMouse((e) => {
  if (e.type === 'wheel') {
    if (contains(listContentRect, e.x, e.y) || (focus === 'list' && contains(
      { x: 0, y: 0, w: listContentRect.x + listContentRect.w + 2, h: listContentRect.y + listContentRect.h + 2 },
      e.x,
      e.y,
    ))) {
      const viewH = Math.max(1, listContentRect.h);
      moveSelection(listState, e.button === 'wheelup' ? -1 : 1, viewH);
      updatePreview();
      focus = 'list';
      return true;
    }
    if (contains(previewContentRect, e.x, e.y)) {
      previewScroll.offset += e.button === 'wheelup' ? -3 : 3;
      focus = 'preview';
      return true;
    }
  }

  if (e.type === 'down' && e.button === 'left') {
    // Click in list
    const idx = listIndexAt(listContentRect, listState, e.x, e.y);
    if (idx !== null) {
      focus = 'list';
      selectAt(listState, idx, Math.max(1, listContentRect.h));
      updatePreview();
      status = `Selected ${entries[idx]?.name ?? ''}`;
      selectionAnchor = null;
      selectionEnd = null;
      return true;
    }
    if (contains(previewContentRect, e.x, e.y)) {
      focus = 'preview';
      selectionAnchor = { x: e.x, y: e.y };
      selectionEnd = { x: e.x, y: e.y };
      status = 'Selecting…';
      return true;
    }
  }

  if (e.type === 'drag' && selectionAnchor) {
    selectionEnd = { x: e.x, y: e.y };
    return true;
  }

  if (e.type === 'up' && e.button === 'left') {
    if (selectionAnchor && selectionEnd) {
      const lines = Math.abs(selectionEnd.y - selectionAnchor.y) + 1;
      status = `Selected ${lines} line(s) in preview (visual)`;
    }
    // keep selection visible until next click
    return true;
  }

  // Double-click open: treat second quick click as enter — simplified: click already selects;
  // Enter / double via rapid re-click on same item
  return false;
});

// Clean exit on signals
for (const sig of ['SIGINT', 'SIGTERM'] as const) {
  process.on(sig, () => {
    app.stop();
    process.exit(0);
  });
}

try {
  app.start();
} catch (err) {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
}
