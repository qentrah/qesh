import { createTheme } from '../termcn/providers/theme-provider';
// Background sampled from the user's reference. Syntax colors follow VS Code Dark+.
export const colors = {
  background: '#0e0d11', surface: '#141318', foreground: '#d4d4d4', muted: '#a09ca8',
  border: '#45414e', primary: '#9cdcfe', error: '#f48771', selection: '#264f78',
};
try {
  const configured = JSON.parse(process.env.QENTRAH_THEME || '{}');
  for (const key of Object.keys(colors) as (keyof typeof colors)[]) if (typeof configured[key] === 'string' && /^#[\da-f]{6}$/i.test(configured[key])) colors[key] = configured[key];
} catch {}
// Explicit RGB colors keep terminal output consistent across host terminal themes.
export const ansiPalette = [
  '#000000', '#cd3131', '#0dbc79', '#e5e510', '#2472c8', '#bc3fbc', '#11a8cd', '#e5e5e5',
  '#666666', '#f14c4c', '#23d18b', '#f5f543', '#3b8eea', '#d670d6', '#29b8db', '#ffffff',
];
export const qentrahTheme = createTheme({ name: 'Qentrah', colors: {
  background: colors.background, foreground: colors.foreground, primary: colors.primary,
  border: colors.border, mutedForeground: colors.muted, error: colors.error,
  accent: colors.primary, focusRing: colors.primary, selection: colors.selection,
} as ReturnType<typeof createTheme>['colors'] });
