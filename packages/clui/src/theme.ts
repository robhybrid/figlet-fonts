import { Palette, type Color } from './colors.js';

export type ThemeMode = 'light' | 'dark';

export interface Theme {
  mode: ThemeMode;
  fg: Color;
  bg: Color;
  muted: Color;
  accent: Color;
  border: Color;
  borderFocus: Color;
  selectionFg: Color;
  selectionBg: Color;
  scrollbar: Color;
  scrollbarTrack: Color;
  statusFg: Color;
  statusBg: Color;
  titleFg: Color;
  danger: Color;
}

export const darkTheme: Theme = {
  mode: 'dark',
  fg: Palette.brightWhite,
  bg: 235,
  muted: Palette.gray,
  accent: Palette.brightCyan,
  border: Palette.brightBlack,
  borderFocus: Palette.brightCyan,
  selectionFg: Palette.black,
  selectionBg: Palette.brightCyan,
  scrollbar: Palette.gray,
  scrollbarTrack: 237,
  statusFg: Palette.brightWhite,
  statusBg: 238,
  titleFg: Palette.brightYellow,
  danger: Palette.brightRed,
};

export const lightTheme: Theme = {
  mode: 'light',
  fg: Palette.black,
  bg: 255,
  muted: 243,
  accent: Palette.blue,
  border: 250,
  borderFocus: Palette.blue,
  selectionFg: Palette.white,
  selectionBg: Palette.blue,
  scrollbar: 245,
  scrollbarTrack: 253,
  statusFg: Palette.black,
  statusBg: 252,
  titleFg: Palette.blue,
  danger: Palette.red,
};

/**
 * Detect light vs dark terminal background.
 *
 * Order:
 * 1. Explicit override (`CLUI_THEME=light|dark`)
 * 2. `COLORFGBG` (common in xterm / VS Code when set)
 * 3. Heuristics from `TERM_PROGRAM` / `TERM`
 * 4. Default: dark
 */
export function detectThemeMode(env: NodeJS.ProcessEnv = process.env): ThemeMode {
  const override = (env.CLUI_THEME || env.CLUI_COLOR_SCHEME || '').toLowerCase();
  if (override === 'light' || override === 'dark') return override;

  const colorFgBg = env.COLORFGBG;
  if (colorFgBg) {
    const parts = colorFgBg.split(/[;:]/);
    const bg = Number(parts[parts.length - 1]);
    if (!Number.isNaN(bg)) {
      // Classic COLORFGBG: 0–7 dark-ish backgrounds → dark theme;
      // 15 / high values → light background.
      if (bg >= 0 && bg <= 7) return 'dark';
      if (bg >= 9) return 'light';
    }
  }

  // macOS Terminal / iTerm often leave COLORFGBG unset; prefer dark.
  const program = (env.TERM_PROGRAM || '').toLowerCase();
  if (program === 'apple_terminal') return 'light';
  if (program === 'vscode') {
    // VS Code does not expose theme reliably; COLORFGBG may be set via shell.
    // Fall through to dark default which matches most VS Code dark themes.
  }

  const term = (env.TERM || '').toLowerCase();
  if (term.includes('light')) return 'light';

  return 'dark';
}

export function resolveTheme(
  mode: ThemeMode | 'auto' = 'auto',
  env: NodeJS.ProcessEnv = process.env,
): Theme {
  const resolved = mode === 'auto' ? detectThemeMode(env) : mode;
  return resolved === 'light' ? { ...lightTheme } : { ...darkTheme };
}
