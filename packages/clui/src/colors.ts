/** Named 256-color palette helpers and color value types. */

export type Color =
  | number // 0–255 indexed
  | { r: number; g: number; b: number }
  | 'default'
  | null;

export function isRgb(c: Color): c is { r: number; g: number; b: number } {
  return typeof c === 'object' && c !== null && 'r' in c;
}

/** Common 256-color indices for themes. */
export const Palette = {
  black: 0,
  red: 1,
  green: 2,
  yellow: 3,
  blue: 4,
  magenta: 5,
  cyan: 6,
  white: 7,
  brightBlack: 8,
  brightRed: 9,
  brightGreen: 10,
  brightYellow: 11,
  brightBlue: 12,
  brightMagenta: 13,
  brightCyan: 14,
  brightWhite: 15,
  gray: 244,
  darkGray: 238,
  lightGray: 250,
} as const;

export function clampByte(n: number): number {
  return Math.max(0, Math.min(255, Math.round(n)));
}
