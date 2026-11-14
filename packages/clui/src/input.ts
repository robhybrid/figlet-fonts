import { EventEmitter } from 'node:events';

export type KeyName =
  | 'up'
  | 'down'
  | 'left'
  | 'right'
  | 'enter'
  | 'escape'
  | 'tab'
  | 'backspace'
  | 'delete'
  | 'home'
  | 'end'
  | 'pageup'
  | 'pagedown'
  | 'space'
  | string;

export interface KeyEvent {
  name: KeyName;
  ctrl: boolean;
  meta: boolean;
  shift: boolean;
  raw: string;
  char?: string;
}

export type MouseButton = 'left' | 'middle' | 'right' | 'wheelup' | 'wheeldown' | 'none';

export interface MouseEvent {
  type: 'down' | 'up' | 'move' | 'drag' | 'wheel';
  button: MouseButton;
  x: number; // 0-based
  y: number; // 0-based
  ctrl: boolean;
  meta: boolean;
  shift: boolean;
  raw: string;
}

export interface InputEvents {
  key: [KeyEvent];
  mouse: [MouseEvent];
  data: [string];
}

const KEY_MAP: Record<string, KeyName> = {
  '\x1b[A': 'up',
  '\x1bOA': 'up',
  '\x1b[B': 'down',
  '\x1bOB': 'down',
  '\x1b[C': 'right',
  '\x1bOC': 'right',
  '\x1b[D': 'left',
  '\x1bOD': 'left',
  '\x1b[H': 'home',
  '\x1b[1~': 'home',
  '\x1b[F': 'end',
  '\x1b[4~': 'end',
  '\x1b[5~': 'pageup',
  '\x1b[6~': 'pagedown',
  '\x1b[3~': 'delete',
  '\x7f': 'backspace',
  '\x08': 'backspace',
  '\r': 'enter',
  '\n': 'enter',
  '\t': 'tab',
  '\x1b': 'escape',
  ' ': 'space',
};

function parseSgrMouse(seq: string): MouseEvent | null {
  // CSI < Cb ; Cx ; Cy M/m
  const m = seq.match(/^\x1b\[<(\d+);(\d+);(\d+)([Mm])$/);
  if (!m) return null;
  const cb = Number(m[1]);
  const x = Number(m[2]) - 1;
  const y = Number(m[3]) - 1;
  const isRelease = m[4] === 'm';
  const ctrl = (cb & 16) !== 0;
  const meta = (cb & 8) !== 0;
  const shift = (cb & 4) !== 0;
  const btnBits = cb & 64 ? cb : cb & 3;
  let button: MouseButton = 'none';
  let type: MouseEvent['type'] = isRelease ? 'up' : 'down';

  if (cb & 64) {
    type = 'wheel';
    button = (cb & 1) === 0 ? 'wheelup' : 'wheeldown';
  } else if ((cb & 32) !== 0) {
    type = 'drag';
    button = (cb & 3) === 0 ? 'left' : (cb & 3) === 1 ? 'middle' : (cb & 3) === 2 ? 'right' : 'none';
  } else {
    button =
      btnBits === 0 ? 'left' : btnBits === 1 ? 'middle' : btnBits === 2 ? 'right' : 'none';
  }

  return { type, button, x, y, ctrl, meta, shift, raw: seq };
}

function parseKey(raw: string): KeyEvent {
  if (KEY_MAP[raw]) {
    return {
      name: KEY_MAP[raw]!,
      ctrl: false,
      meta: raw.startsWith('\x1b') && raw.length === 2 && raw !== '\x1b',
      shift: false,
      raw,
    };
  }

  // Ctrl+letter
  if (raw.length === 1) {
    const code = raw.charCodeAt(0);
    if (code >= 1 && code <= 26) {
      const letter = String.fromCharCode(code + 96);
      return {
        name: letter,
        ctrl: true,
        meta: false,
        shift: false,
        raw,
        char: letter,
      };
    }
    return {
      name: raw,
      ctrl: false,
      meta: false,
      shift: false,
      raw,
      char: raw,
    };
  }

  // Alt+key (ESC + char)
  if (raw.startsWith('\x1b') && raw.length === 2) {
    return {
      name: raw[1]!,
      ctrl: false,
      meta: true,
      shift: false,
      raw,
      char: raw[1],
    };
  }

  // Shift+arrow etc. CSI 1;2A
  const shiftArrow = raw.match(/^\x1b\[1;2([ABCD])$/);
  if (shiftArrow) {
    const map: Record<string, KeyName> = { A: 'up', B: 'down', C: 'right', D: 'left' };
    return {
      name: map[shiftArrow[1]!]!,
      ctrl: false,
      meta: false,
      shift: true,
      raw,
    };
  }

  return { name: raw, ctrl: false, meta: false, shift: false, raw };
}

/**
 * Parses raw stdin bytes into key/mouse events.
 * Expects the TTY already in raw mode with SGR mouse enabled.
 */
export class InputParser extends EventEmitter {
  private buf = '';

  override on<K extends keyof InputEvents>(event: K, listener: (...args: InputEvents[K]) => void): this {
    return super.on(event, listener as (...args: unknown[]) => void);
  }

  override emit<K extends keyof InputEvents>(event: K, ...args: InputEvents[K]): boolean {
    return super.emit(event, ...args);
  }

  feed(chunk: string | Buffer): void {
    this.buf += typeof chunk === 'string' ? chunk : chunk.toString('utf8');
    this.consume();
  }

  private consume(): void {
    while (this.buf.length > 0) {
      // SGR mouse
      if (this.buf.startsWith('\x1b[<')) {
        const end = this.buf.search(/[Mm]/);
        if (end === -1) return; // incomplete
        const seq = this.buf.slice(0, end + 1);
        this.buf = this.buf.slice(end + 1);
        const mouse = parseSgrMouse(seq);
        if (mouse) this.emit('mouse', mouse);
        continue;
      }

      // CSI / SS3 sequences
      if (this.buf.startsWith('\x1b[')) {
        const m = this.buf.match(/^\x1b\[[0-9;?]*[ -/]*[@-~]/);
        if (!m) {
          if (this.buf.length > 32) {
            // give up on malformed
            this.buf = this.buf.slice(1);
            continue;
          }
          return;
        }
        const seq = m[0]!;
        this.buf = this.buf.slice(seq.length);
        this.emit('key', parseKey(seq));
        continue;
      }

      if (this.buf.startsWith('\x1bO')) {
        if (this.buf.length < 3) return;
        const seq = this.buf.slice(0, 3);
        this.buf = this.buf.slice(3);
        this.emit('key', parseKey(seq));
        continue;
      }

      // Lone ESC or ESC+char
      if (this.buf[0] === '\x1b') {
        if (this.buf.length === 1) return; // wait for more / timeout handled by flushEsc
        // If next is not a known introducer, treat as meta+char or escape
        const next = this.buf[1]!;
        if (next === '[' || next === 'O') return;
        if (this.buf.length >= 2) {
          const seq = this.buf.slice(0, 2);
          this.buf = this.buf.slice(2);
          this.emit('key', parseKey(seq));
          continue;
        }
      }

      const ch = this.buf[0]!;
      this.buf = this.buf.slice(1);
      this.emit('key', parseKey(ch));
    }
  }

  /** Force-flush a pending lone ESC (call after short idle). */
  flushEsc(): void {
    if (this.buf === '\x1b') {
      this.buf = '';
      this.emit('key', parseKey('\x1b'));
    }
  }
}
