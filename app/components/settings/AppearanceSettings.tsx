import React, { useState } from 'react';
import { useStore } from '@nanostores/react';
import { Check, RotateCcw, Type, Palette } from 'lucide-react';
import {
  appearance,
  appearancePresets,
  defaultAppearance,
  selectAppearancePreset,
  setAppearance,
  wallpaperOptions,
  type AppearanceFont,
  type AppearancePreset,
} from '~/stores/appearance';

const presetLabels: Record<AppearancePreset, string> = {
  midnight: 'Midnight',
  ocean: 'Ocean',
  forest: 'Forest',
  graphite: 'Graphite',
  amethyst: 'Amethyst',
  ember: 'Ember',
  rose: 'Rose',
  teal: 'Teal',
};

const fontLabels: Record<AppearanceFont, string> = {
  inter: 'Inter',
  system: 'System',
  mono: 'Monospace',
};

export const AppearanceSettings: React.FC = () => {
  const current = useStore(appearance);
  const [uploadError, setUploadError] = useState('');

  const uploadWallpaper = async (file?: File) => {
    if (!file) return;
    setUploadError('');
    if (!file.type.startsWith('image/')) {
      setUploadError('Choose an image file.');
      return;
    }
    try {
      const bitmap = await createImageBitmap(file);
      const scale = Math.min(1, 1600 / bitmap.width, 1000 / bitmap.height);
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(bitmap.width * scale);
      canvas.height = Math.round(bitmap.height * scale);
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Image processing is unavailable.');
      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      bitmap.close();
      const wallpaperData = canvas.toDataURL('image/webp', 0.72);
      if (wallpaperData.length >= 1_500_000) throw new Error('This image is too large to save. Try a smaller image.');
      if (!setAppearance({ wallpaper: 'custom', wallpaperData, wallpaperDim: current.wallpaper === 'none' ? 45 : current.wallpaperDim })) throw new Error('Could not save this image on this device.');
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : 'Could not open this image.');
    }
  };

  return (
    <div className="space-y-5 text-sm text-slate-300">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="flex items-center gap-2 text-base font-bold text-white"><Palette className="h-4 w-4 text-[var(--app-accent)]" />Appearance</h3>
          <p className="mt-1 text-xs text-slate-400">Changes appear immediately and are saved on this device.</p>
        </div>
        <button type="button" onClick={() => setAppearance(defaultAppearance)} className="flex items-center gap-2 rounded-xl border border-white/15 px-3 py-2 text-xs text-slate-300 transition hover:bg-white/5 hover:text-white">
          <RotateCcw className="h-3.5 w-3.5" /> Reset defaults
        </button>
      </div>

      <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
        <h4 className="font-semibold text-white">Color themes</h4>
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {(Object.keys(appearancePresets) as AppearancePreset[]).map((preset) => {
            const colors = appearancePresets[preset];
            const selected = current.preset === preset && (['background', 'surface', 'accent', 'text', 'muted', 'border'] as const).every((key) => current[key] === colors[key]);
            return (
              <button key={preset} type="button" onClick={() => selectAppearancePreset(preset)} aria-pressed={selected} className={`rounded-xl border p-2 text-left transition hover:border-white/40 ${selected ? 'border-[var(--app-accent)] bg-white/[0.06]' : 'border-white/10'}`}>
                <span className="flex h-12 items-center gap-2 rounded-lg px-3" style={{ backgroundColor: colors.background }}>
                  <span className="h-5 w-5 rounded-full border border-white/20" style={{ backgroundColor: colors.surface }} />
                  <span className="h-5 w-5 rounded-full" style={{ backgroundColor: colors.accent }} />
                </span>
                <span className="mt-2 flex items-center justify-between px-1 text-xs text-white">{presetLabels[preset]}{selected && <Check className="h-3.5 w-3.5" />}</span>
              </button>
            );
          })}
        </div>
      </section>

      <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
        <h4 className="font-semibold text-white">Custom colors</h4>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {([
            ['background', 'Background'],
            ['surface', 'Panels'],
            ['accent', 'Accent'],
            ['text', 'Text'],
            ['muted', 'Secondary text'],
            ['border', 'Borders'],
          ] as const).map(([key, label]) => (
            <label key={key} className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-black/15 p-2.5">
              <span className="text-xs font-medium text-slate-200">{label}</span>
              <span className="flex items-center gap-2">
                <span className="font-mono text-[11px] text-slate-400">{current[key].toUpperCase()}</span>
                <input type="color" aria-label={`${label} color`} value={current[key]} onChange={(event) => setAppearance({ [key]: event.target.value })} className="h-8 w-9 cursor-pointer rounded border-0 bg-transparent" />
              </span>
            </label>
          ))}
        </div>
      </section>

      <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
        <h4 className="font-semibold text-white">Background image</h4>
        <p className="mt-1 text-xs text-slate-400">Choose a bundled image or add your own. Images remain available offline.</p>
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <button type="button" onClick={() => setAppearance({ wallpaper: 'none' })} aria-pressed={current.wallpaper === 'none'} className={`flex h-28 flex-col justify-between rounded-xl border p-3 text-left text-xs transition ${current.wallpaper === 'none' ? 'border-[var(--app-accent)]' : 'border-white/10 hover:border-white/30'}`} style={{ backgroundColor: current.background }}>
            <span className="h-6 w-6 rounded-full border border-white/30" style={{ backgroundColor: current.surface }} />
            <span className="font-semibold text-white">Solid color</span>
          </button>
          {(Object.entries(wallpaperOptions) as [keyof typeof wallpaperOptions, typeof wallpaperOptions[keyof typeof wallpaperOptions]][]).map(([id, option]) => (
            <button key={id} type="button" onClick={() => setAppearance({ wallpaper: id, wallpaperDim: current.wallpaper === 'none' ? 45 : current.wallpaperDim })} aria-pressed={current.wallpaper === id} className={`flex h-28 items-end rounded-xl border bg-cover bg-center p-3 text-left text-xs transition ${current.wallpaper === id ? 'border-[var(--app-accent)]' : 'border-white/10 hover:border-white/30'}`} style={{ backgroundImage: `linear-gradient(transparent, rgba(0,0,0,.75)), url('${option.path}')` }}>
              <span className="font-semibold text-white">{option.label}</span>
            </button>
          ))}
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <label className="cursor-pointer rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-xs text-white transition hover:bg-white/10">
            Upload your image
            <input type="file" accept="image/*" className="sr-only" onChange={(event) => { void uploadWallpaper(event.target.files?.[0]); event.target.value = ''; }} />
          </label>
          {current.wallpaper === 'custom' && <span className="text-xs text-[var(--app-accent)]">Custom image selected</span>}
          {uploadError && <span role="alert" className="text-xs text-rose-300">{uploadError}</span>}
        </div>
        {current.wallpaper !== 'none' && (
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <label className="block space-y-2 text-xs text-slate-300">
              <span className="flex justify-between"><span>Image dimming</span><strong className="text-white">{current.wallpaperDim}%</strong></span>
              <input type="range" min="10" max="80" step="5" value={current.wallpaperDim} onChange={(event) => setAppearance({ wallpaperDim: Number(event.target.value) })} className="w-full accent-[var(--app-accent)]" />
            </label>
            <label className="block space-y-2 text-xs text-slate-300">
              <span className="flex justify-between"><span>Panel opacity</span><strong className="text-white">{current.panelOpacity}%</strong></span>
              <input type="range" min="10" max="85" step="5" value={current.panelOpacity} onChange={(event) => setAppearance({ panelOpacity: Number(event.target.value) })} className="w-full accent-[var(--app-accent)]" />
            </label>
          </div>
        )}
        {current.wallpaper !== 'none' && current.wallpaper !== 'custom' && <p className="mt-3 text-[11px] text-slate-400">Photo: <a href={wallpaperOptions[current.wallpaper].source} target="_blank" rel="noreferrer" className="underline hover:text-white">Unsplash source</a></p>}
      </section>

      <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
        <h4 className="flex items-center gap-2 font-semibold text-white"><Type className="h-4 w-4" />Typography</h4>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <label className="space-y-2 text-xs text-slate-300">
            <span>Font family</span>
            <select value={current.font} onChange={(event) => setAppearance({ font: event.target.value as AppearanceFont })} className="w-full rounded-xl border border-white/15 bg-[var(--app-surface)] px-3 py-2.5 text-sm text-[var(--app-text)] outline-none focus:border-[var(--app-accent)]">
              {(Object.keys(fontLabels) as AppearanceFont[]).map((font) => <option key={font} value={font}>{fontLabels[font]}</option>)}
            </select>
          </label>
          <label className="space-y-2 text-xs text-slate-300">
            <span className="flex justify-between"><span>App font size</span><strong className="text-white">{current.fontSize}px</strong></span>
            <input type="range" min="13" max="20" step="1" value={current.fontSize} onChange={(event) => setAppearance({ fontSize: Number(event.target.value) })} className="w-full accent-[var(--app-accent)]" />
            <span className="flex justify-between text-[11px] text-slate-500"><span>Compact</span><span>Comfortable</span></span>
          </label>
        </div>
      </section>

      <div className="rounded-2xl border border-white/10 bg-[var(--app-surface)] p-4 text-[var(--app-text)]">
        <div className="text-xs font-semibold text-[var(--app-accent)]">LIVE PREVIEW</div>
        <p className="mt-2 text-sm">Build something remarkable with Hedes Studio.</p>
        <p className="mt-1 text-xs opacity-70">Your chosen font, colors and size are applied across the app.</p>
      </div>
    </div>
  );
};
