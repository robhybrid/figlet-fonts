import { ansi } from './ansi.js';
import { ScreenBuffer } from './buffer.js';
import type { Color } from './colors.js';
import { InputParser, type KeyEvent, type MouseEvent } from './input.js';
import type { Theme } from './theme.js';

export interface ScreenOptions {
  stdout?: NodeJS.WriteStream;
  stdin?: NodeJS.ReadStream;
  theme?: Theme;
  mouse?: boolean;
  altScreen?: boolean;
}

export type RenderFn = (buf: ScreenBuffer, cols: number, rows: number) => void;

/**
 * Owns the TTY lifecycle: raw mode, alternate screen, mouse tracking,
 * resize handling, and the double-buffered render loop.
 */
export class Screen {
  readonly stdout: NodeJS.WriteStream;
  readonly stdin: NodeJS.ReadStream;
  readonly input = new InputParser();
  readonly buffer: ScreenBuffer;

  private theme: Theme | undefined;
  private mouseEnabled: boolean;
  private altScreen: boolean;
  private running = false;
  private escTimer: ReturnType<typeof setTimeout> | null = null;
  private onData: ((chunk: Buffer) => void) | null = null;
  private onResize: (() => void) | null = null;
  private renderFn: RenderFn | null = null;
  private needsFull = true;

  constructor(opts: ScreenOptions = {}) {
    this.stdout = opts.stdout ?? process.stdout;
    this.stdin = opts.stdin ?? process.stdin;
    this.theme = opts.theme;
    this.mouseEnabled = opts.mouse !== false;
    this.altScreen = opts.altScreen !== false;
    const { cols, rows } = this.size();
    this.buffer = new ScreenBuffer(cols, rows, this.theme?.bg ?? 'default');
  }

  size(): { cols: number; rows: number } {
    return {
      cols: this.stdout.columns || 80,
      rows: this.stdout.rows || 24,
    };
  }

  setTheme(theme: Theme): void {
    this.theme = theme;
    this.needsFull = true;
  }

  getTheme(): Theme | undefined {
    return this.theme;
  }

  start(render: RenderFn): void {
    if (this.running) return;
    if (!this.stdin.isTTY || !this.stdout.isTTY) {
      throw new Error(
        'CLUI requires an interactive TTY (stdin/stdout). Try a real terminal (bash/zsh, VS Code terminal).',
      );
    }

    this.renderFn = render;
    this.running = true;

    this.stdin.setRawMode(true);
    this.stdin.resume();
    this.stdin.setEncoding('utf8');

    let boot = '';
    if (this.altScreen) boot += ansi.altScreenOn;
    boot += ansi.hideCursor + ansi.clearScreen + ansi.home;
    if (this.mouseEnabled) boot += ansi.mouseOn;
    this.stdout.write(boot);

    this.onData = (chunk: Buffer) => {
      const s = chunk.toString('utf8');
      // Ctrl+C
      if (s === '\x03') {
        this.stop();
        process.exit(0);
      }
      this.input.feed(s);
      if (this.escTimer) clearTimeout(this.escTimer);
      this.escTimer = setTimeout(() => this.input.flushEsc(), 30);
    };
    this.stdin.on('data', this.onData);

    this.onResize = () => {
      const { cols, rows } = this.size();
      this.buffer.resize(cols, rows, this.theme?.bg ?? 'default');
      this.needsFull = true;
      this.paint();
    };
    this.stdout.on('resize', this.onResize);

    this.paint();
  }

  paint(): void {
    if (!this.running || !this.renderFn) return;
    const { cols, rows } = this.size();
    if (cols !== this.buffer.width || rows !== this.buffer.height) {
      this.buffer.resize(cols, rows, this.theme?.bg ?? 'default');
      this.needsFull = true;
    }
    this.buffer.clear(this.theme?.bg ?? 'default');
    this.renderFn(this.buffer, cols, rows);
    this.buffer.flush(this.stdout, this.needsFull);
    this.needsFull = false;
  }

  requestRender(): void {
    this.paint();
  }

  onKey(handler: (e: KeyEvent) => void): void {
    this.input.on('key', handler);
  }

  onMouse(handler: (e: MouseEvent) => void): void {
    this.input.on('mouse', handler);
  }

  stop(): void {
    if (!this.running) return;
    this.running = false;

    if (this.onData) this.stdin.off('data', this.onData);
    if (this.onResize) this.stdout.off('resize', this.onResize);
    if (this.escTimer) clearTimeout(this.escTimer);

    try {
      if (this.stdin.isTTY) this.stdin.setRawMode(false);
    } catch {
      /* ignore */
    }

    let shutdown = '';
    if (this.mouseEnabled) shutdown += ansi.mouseOff;
    shutdown += ansi.showCursor;
    if (this.altScreen) shutdown += ansi.altScreenOff;
    else shutdown += ansi.reset + '\n';
    this.stdout.write(shutdown);
  }
}

export function fillBackground(buf: ScreenBuffer, bg: Color): void {
  buf.clear(bg);
}
