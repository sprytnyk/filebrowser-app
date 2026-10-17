/**
 * Colors mirror FileBrowser Quantum's web UI (frontend/public/index.html and
 * frontend/src/css/_variables.css at v2.0.1-stable), so the app looks like the server it talks to.
 */

export const Colors = {
  light: {
    background: '#f5f5f5',
    altBackground: '#dddddd',
    surfacePrimary: '#ebebeb',
    surfaceSecondary: '#d3d3d3',
    textPrimary: '#546e7a',
    textSecondary: '#808080',
    text: '#263238',
    divider: '#d3d3d3',
    iconBackground: '#dddddd',
    primary: '#2196f3',
    primaryPressed: '#1e88e5',
    onPrimary: '#ffffff',
    danger: '#f44336',
    dangerPressed: '#be2626',
    warning: '#ff8c00',
    warningBackground: '#fff3e0',
    errorBackground: '#ffebee',
    /** Transfer directions: uploads (device to server) green, downloads (server to device) blue. */
    upload: '#43a047',
    uploadBackground: '#e8f5e9',
    download: '#1e88e5',
    downloadBackground: '#e3f2fd',
    overlay: 'rgba(0, 0, 0, 0.5)',
    selected: 'rgba(33, 150, 243, 0.16)',
    snackbar: '#323232',
    onSnackbar: 'rgba(255, 255, 255, 0.87)',
  },
  dark: {
    background: '#141d24',
    altBackground: '#283136',
    surfacePrimary: '#20292f',
    surfaceSecondary: '#3a4147',
    textPrimary: 'rgba(255, 255, 255, 0.87)',
    textSecondary: 'rgba(255, 255, 255, 0.6)',
    text: 'rgba(255, 255, 255, 0.87)',
    divider: 'rgba(255, 255, 255, 0.12)',
    iconBackground: '#1e1f20',
    primary: '#2196f3',
    primaryPressed: '#1e88e5',
    onPrimary: '#ffffff',
    danger: '#f44336',
    dangerPressed: '#be2626',
    warning: '#ffb74d',
    warningBackground: '#3e2c12',
    errorBackground: '#3b1d1d',
    upload: '#66bb6a',
    uploadBackground: '#1b3320',
    download: '#64b5f6',
    downloadBackground: '#13293d',
    overlay: 'rgba(0, 0, 0, 0.6)',
    selected: 'rgba(33, 150, 243, 0.24)',
    snackbar: '#3a4147',
    onSnackbar: 'rgba(255, 255, 255, 0.87)',
  },
} as const;

export type ThemeColors = { [K in keyof typeof Colors.light]: string };
export type ThemeColor = keyof ThemeColors;

/** File-type icon colors from upstream `--icon-*` variables. */
export const IconColors = {
  folder: '#2196f3',
  image: '#4caf50',
  video: '#ff6f00',
  audio: '#9b59b6',
  pdf: '#d23b4a',
  archive: '#a52a2a',
  code: '#1d99f3',
  text: '#808080',
  document: '#1d99f3',
  other: '#808080',
} as const;

export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 16,
  four: 24,
  five: 32,
  six: 64,
} as const;

/** Upstream `--borderRadius: 0.85rem`. */
export const Radius = {
  small: 6,
  medium: 13.6,
  pill: 999,
} as const;
