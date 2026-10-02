import { atom } from 'nanostores';

export type AppearancePreset = 'midnight' | 'ocean' | 'forest' | 'graphite' | 'amethyst' | 'ember' | 'rose' | 'teal';
export type AppearanceFont = 'inter' | 'system' | 'mono';
export type AppearanceWallpaper = 'none' | 'night-sky' | 'dark-forest' | 'blue-gradient' | 'custom';

export const wallpaperOptions: Record<Exclude<AppearanceWallpaper, 'none' | 'custom'>, { label: string; path: string; source: string }> = {
  'night-sky': { label: 'Night sky', path: '/wallpapers/night-sky.jpg', source: 'https://unsplash.com/photos/night-sky-full-of-stars-OQKQzw4o8cU' },
  'dark-forest': { label: 'Dark forest', path: '/wallpapers/dark-forest.jpg', source: 'https://unsplash.com/photos/a-dark-moody-forest-scene-with-dense-trees-6fewHoIecuo' },
  'blue-gradient': { label: 'Blue gradient', path: '/wallpapers/blue-gradient.jpg', source: 'https://unsplash.com/photos/dark-blue-abstract-gradient-background-OzfD79w8ptA' },
};

export type Appearance = {
  preset: AppearancePreset;
  background: string;
  surface: string;
  accent: string;
  text: string;
  muted: string;
  border: string;
  font: AppearanceFont;
  fontSize: number;
  wallpaper: AppearanceWallpaper;
  wallpaperData: string;
  wallpaperDim: number;
  panelOpacity: number;
};

type Palette = Pick<Appearance, 'background' | 'surface' | 'accent' | 'text' | 'muted' | 'border'>;

export const appearancePresets: Record<AppearancePreset, Palette> = {
  midnight: { background: '#080d1b', surface: '#10172a', accent: '#22d3ee', text: '#f1f5f9', muted: '#94a3b8', border: '#334155' },
  ocean: { background: '#071b27', surface: '#102c3a', accent: '#38bdf8', text: '#effaff', muted: '#a2c4d0', border: '#315268' },
  forest: { background: '#0b1917', surface: '#152b27', accent: '#34d399', text: '#effcf6', muted: '#9cbbb0', border: '#36554b' },
  graphite: { background: '#15171d', surface: '#242831', accent: '#a78bfa', text: '#f5f5f7', muted: '#a7abb8', border: '#414654' },
  amethyst: { background: '#140d20', surface: '#261932', accent: '#c084fc', text: '#faf5ff', muted: '#b9a6ca', border: '#544064' },
  ember: { background: '#1b1010', surface: '#302020', accent: '#fb923c', text: '#fff5ed', muted: '#ccb0a1', border: '#67433b' },
  rose: { background: '#1c101a', surface: '#2e1d2a', accent: '#f472b6', text: '#fff1f8', muted: '#c7a9bc', border: '#604258' },
  teal: { background: '#071a1b', surface: '#123032', accent: '#2dd4bf', text: '#edfffd', muted: '#a0c3c2', border: '#31575a' },
};

export const defaultAppearance: Appearance = {
  preset: 'midnight',
  ...appearancePresets.midnight,
  font: 'inter',
  fontSize: 16,
  wallpaper: 'none',
  wallpaperData: '',
  wallpaperDim: 45,
  panelOpacity: 45,
};

const storageKey = 'hedes_appearance_v1';
const hexColor = /^#[0-9a-f]{6}$/i;
const fonts: AppearanceFont[] = ['inter', 'system', 'mono'];
const wallpapers: AppearanceWallpaper[] = ['none', ...Object.keys(wallpaperOptions) as AppearanceWallpaper[], 'custom'];

export const appearance = atom<Appearance>(defaultAppearance);

export function normalizeAppearance(value: unknown): Appearance {
  if (!value || typeof value !== 'object') return defaultAppearance;
  const input = value as Partial<Appearance>;
  const preset = input.preset && Object.prototype.hasOwnProperty.call(appearancePresets, input.preset) ? input.preset : 'midnight';
  const palette = appearancePresets[preset];
  const color = (key: keyof typeof palette) =>
    typeof input[key] === 'string' && hexColor.test(input[key]) ? input[key] : palette[key];
  return {
    preset,
    background: color('background'),
    surface: color('surface'),
    accent: color('accent'),
    text: color('text'),
    muted: color('muted'),
    border: color('border'),
    font: input.font && fonts.includes(input.font) ? input.font : defaultAppearance.font,
    fontSize: typeof input.fontSize === 'number' && Number.isFinite(input.fontSize)
      ? Math.min(20, Math.max(13, Math.round(input.fontSize)))
      : defaultAppearance.fontSize,
    wallpaper: input.wallpaper && wallpapers.includes(input.wallpaper) ? input.wallpaper : 'none',
    wallpaperData: typeof input.wallpaperData === 'string' && /^data:image\/webp;base64,[a-z\d+/=]+$/i.test(input.wallpaperData) && input.wallpaperData.length < 1_500_000 ? input.wallpaperData : '',
    wallpaperDim: typeof input.wallpaperDim === 'number' && Number.isFinite(input.wallpaperDim)
      ? Math.min(80, Math.max(10, Math.round(input.wallpaperDim)))
      : defaultAppearance.wallpaperDim,
    panelOpacity: typeof input.panelOpacity === 'number' && Number.isFinite(input.panelOpacity)
      ? Math.min(85, Math.max(10, Math.round(input.panelOpacity)))
      : defaultAppearance.panelOpacity,
  };
}

export function applyAppearance(value: Appearance) {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  root.style.setProperty('--app-bg', value.background);
  root.style.setProperty('--app-surface', value.surface);
  root.style.setProperty('--app-accent', value.accent);
  root.style.setProperty('--app-text', value.text);
  root.style.setProperty('--app-muted', value.muted);
  root.style.setProperty('--app-border', value.border);
  root.style.setProperty('--app-font-size', `${value.fontSize}px`);
  root.dataset.appearanceFont = value.font;
  const wallpaper = value.wallpaper === 'custom' ? value.wallpaperData : value.wallpaper === 'none' ? '' : wallpaperOptions[value.wallpaper].path;
  root.dataset.wallpaper = wallpaper ? 'on' : 'off';
  root.style.setProperty('--app-wallpaper', wallpaper ? `url("${wallpaper}")` : 'none');
  root.style.setProperty('--app-wallpaper-dim', String(value.wallpaperDim / 100));
  root.style.setProperty('--app-panel-opacity', `${value.panelOpacity}%`);
}

export function loadAppearance() {
  if (typeof window === 'undefined') return;
  try {
    const saved = localStorage.getItem(storageKey);
    const value = normalizeAppearance(saved ? JSON.parse(saved) : defaultAppearance);
    appearance.set(value);
    applyAppearance(value);
  } catch {
    appearance.set(defaultAppearance);
    applyAppearance(defaultAppearance);
  }
  void fetch('/api/local/appearance').then(response => response.ok ? response.json() : null).then(data => {
    if (data?.appearance) {
      const value = normalizeAppearance(data.appearance);
      appearance.set(value); applyAppearance(value);
      localStorage.setItem(storageKey, JSON.stringify(value));
    } else {
      void fetch('/api/local/appearance', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(appearance.get()) });
    }
  }).catch(() => {});
}

let appearanceSaveTimer: ReturnType<typeof setTimeout> | undefined;

export function setAppearance(update: Partial<Appearance>): boolean {
  const value = normalizeAppearance({ ...appearance.get(), ...update });
  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem(storageKey, JSON.stringify(value));
    } catch {
      return false;
    }
  }
  appearance.set(value);
  applyAppearance(value);
  clearTimeout(appearanceSaveTimer);
  appearanceSaveTimer = setTimeout(() => {
    void fetch('/api/local/appearance', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(value) }).catch(() => {});
  }, 300);
  return true;
}

export function selectAppearancePreset(preset: AppearancePreset) {
  setAppearance({ preset, ...appearancePresets[preset] });
}
