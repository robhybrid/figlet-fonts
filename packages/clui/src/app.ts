import type { ScreenBuffer } from './buffer.js';
import type { KeyEvent, MouseEvent } from './input.js';
import { Screen } from './screen.js';
import { resolveTheme, type Theme, type ThemeMode } from './theme.js';

export interface AppOptions {
  theme?: ThemeMode | 'auto' | Theme;
  mouse?: boolean;
  title?: string;
}

export type FrameHandler = (ctx: AppContext) => void;
export type KeyHandler = (e: KeyEvent, ctx: AppContext) => void | boolean;
export type MouseHandler = (e: MouseEvent, ctx: AppContext) => void | boolean;

export interface AppContext {
  buf: ScreenBuffer;
  cols: number;
  rows: number;
  theme: Theme;
  app: App;
}

/**
 * High-level application shell: theme, render loop, key/mouse dispatch.
 */
export class App {
  readonly screen: Screen;
  theme: Theme;
  private frame: FrameHandler | null = null;
  private keyHandlers: KeyHandler[] = [];
  private mouseHandlers: MouseHandler[] = [];
  private quitKeys = new Set(['q', 'escape']);

  constructor(opts: AppOptions = {}) {
    if (opts.theme && typeof opts.theme === 'object' && 'mode' in opts.theme) {
      this.theme = opts.theme;
    } else {
      this.theme = resolveTheme((opts.theme as ThemeMode | 'auto') ?? 'auto');
    }
    this.screen = new Screen({
      theme: this.theme,
      mouse: opts.mouse !== false,
    });
  }

  setThemeMode(mode: ThemeMode | 'auto'): void {
    this.theme = resolveTheme(mode);
    this.screen.setTheme(this.theme);
    this.screen.requestRender();
  }

  toggleTheme(): void {
    this.setThemeMode(this.theme.mode === 'dark' ? 'light' : 'dark');
  }

  onFrame(handler: FrameHandler): this {
    this.frame = handler;
    return this;
  }

  onKey(handler: KeyHandler): this {
    this.keyHandlers.push(handler);
    return this;
  }

  onMouse(handler: MouseHandler): this {
    this.mouseHandlers.push(handler);
    return this;
  }

  /** Keys that quit the app (default: q, escape). Ctrl+C always quits. */
  setQuitKeys(keys: string[]): this {
    this.quitKeys = new Set(keys.map((k) => k.toLowerCase()));
    return this;
  }

  start(): void {
    this.screen.onKey((e) => {
      if (e.ctrl && e.name === 'c') {
        this.stop();
        process.exit(0);
      }
      if (!e.ctrl && !e.meta && this.quitKeys.has(String(e.name).toLowerCase())) {
        this.stop();
        process.exit(0);
      }
      const ctx = this.ctx();
      for (const h of this.keyHandlers) {
        if (h(e, ctx) === true) break;
      }
      this.screen.requestRender();
    });

    this.screen.onMouse((e) => {
      const ctx = this.ctx();
      for (const h of this.mouseHandlers) {
        if (h(e, ctx) === true) break;
      }
      this.screen.requestRender();
    });

    this.screen.start((buf, cols, rows) => {
      if (this.frame) {
        this.frame({ buf, cols, rows, theme: this.theme, app: this });
      }
    });
  }

  stop(): void {
    this.screen.stop();
  }

  rerender(): void {
    this.screen.requestRender();
  }

  private ctx(): AppContext {
    const { cols, rows } = this.screen.size();
    return {
      buf: this.screen.buffer,
      cols,
      rows,
      theme: this.theme,
      app: this,
    };
  }
}
