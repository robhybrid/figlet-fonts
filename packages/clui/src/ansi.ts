/** ANSI / VT100 escape helpers used by the renderer and input layer. */

export const ESC = '\x1b';
export const CSI = `${ESC}[`;

export const ansi = {
  clearScreen: `${CSI}2J`,
  clearLine: `${CSI}2K`,
  home: `${CSI}H`,
  hideCursor: `${CSI}?25l`,
  showCursor: `${CSI}?25h`,
  altScreenOn: `${CSI}?1049h`,
  altScreenOff: `${CSI}?1049l`,
  mouseOn: `${CSI}?1000h${CSI}?1002h${CSI}?1006h`,
  mouseOff: `${CSI}?1000l${CSI}?1002l${CSI}?1006l`,
  bracketedPasteOn: `${CSI}?2004h`,
  bracketedPasteOff: `${CSI}?2004l`,
  reset: `${CSI}0m`,
  bold: `${CSI}1m`,
  dim: `${CSI}2m`,
  underline: `${CSI}4m`,
  inverse: `${CSI}7m`,

  move(row: number, col: number): string {
    return `${CSI}${row};${col}H`;
  },

  fg(n: number): string {
    return `${CSI}38;5;${n}m`;
  },

  bg(n: number): string {
    return `${CSI}48;5;${n}m`;
  },

  fgRgb(r: number, g: number, b: number): string {
    return `${CSI}38;2;${r};${g};${b}m`;
  },

  bgRgb(r: number, g: number, b: number): string {
    return `${CSI}48;2;${r};${g};${b}m`;
  },
} as const;
