import React, { useState, useEffect, useRef } from 'react';
import { useStore } from '@nanostores/react';
import {
  userProfileStore,
  isProfileOpen,
  is100ChatOpen,
  isProfileBackendSynced,
  saveUserProfile,
  resetUserProfile,
  loadUserProfile,
  exportProfileAsJson,
  importProfileFromJson,
  PERSPECTIVE_PRESETS,
  type UserProfile,
} from '~/stores/profile';
import {
  X,
  User,
  Sparkles,
  MessageSquare,
  Check,
  RotateCcw,
  Shield,
  Compass,
  Download,
  Upload,
  Cloud,
  Layers,
  Palette,
} from 'lucide-react';

const AVATAR_COLORS = [
  '#6366f1', // Indigo
  '#8b5cf6', // Violet
  '#ec4899', // Pink
  '#10b981', // Emerald
  '#06b6d4', // Cyan
  '#f59e0b', // Amber
  '#ef4444', // Rose
  '#3b82f6', // Blue
];

export const ProfileModal: React.FC = () => {
  const isOpen = useStore(isProfileOpen);
  const profile = useStore(userProfileStore);
  const isSynced = useStore(isProfileBackendSynced);

  const [name, setName] = useState('');
  const [role, setRole] = useState('');
  const [perspective, setPerspective] = useState('');
  const [preferences, setPreferences] = useState('');
  const [techStack, setTechStack] = useState('');
  const [avatarColor, setAvatarColor] = useState('#6366f1');
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [importNotice, setImportNotice] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadUserProfile();
  }, []);

  useEffect(() => {
    if (isOpen) {
      setName(profile.name || '');
      setRole(profile.role || '');
      setPerspective(profile.perspective || '');
      setPreferences(profile.preferences || '');
      setTechStack(profile.techStack || 'React, TypeScript, Tailwind, Node.js');
      setAvatarColor(profile.avatarColor || '#6366f1');
      setSavedSuccess(false);
      setImportNotice(null);
    }
  }, [isOpen, profile]);

  if (!isOpen) return null;

  const handleSave = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    saveUserProfile({
      name,
      role,
      perspective,
      preferences,
      techStack,
      avatarColor,
    });
    setSavedSuccess(true);
    setTimeout(() => setSavedSuccess(false), 2500);
  };

  const handleOpen100Chat = () => {
    saveUserProfile({
      name,
      role,
      perspective,
      preferences,
      techStack,
      avatarColor,
    });
    isProfileOpen.set(false);
    is100ChatOpen.set(true);
  };

  const applyPreset = (preset: typeof PERSPECTIVE_PRESETS[0]) => {
    setPerspective(preset.perspective);
    setRole(preset.role);
    setPreferences(preset.preferences);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      if (content) {
        const ok = importProfileFromJson(content);
        if (ok) {
          setImportNotice('Profile loaded successfully!');
          setTimeout(() => setImportNotice(null), 3000);
        } else {
          setImportNotice('Failed to parse JSON file.');
          setTimeout(() => setImportNotice(null), 3000);
        }
      }
    };
    reader.readAsText(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md animate-fadeIn">
      <div className="relative w-full max-w-2xl bg-[#0e0e20] border border-[#2d2d55] rounded-2xl shadow-2xl shadow-purple-950/40 overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-6 py-5 border-b border-[#202040] flex items-center justify-between bg-gradient-to-r from-[#141430] via-[#161638] to-[#121228]">
          <div className="flex items-center space-x-3">
            <div
              style={{ backgroundColor: avatarColor }}
              className="w-10 h-10 rounded-xl flex items-center justify-center text-white shadow-lg shadow-indigo-500/25 border border-white/20"
            >
              <User className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                Human Profile & AI Perspective
                <span className="text-[11px] font-medium bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 px-2 py-0.5 rounded-full">
                  Personalization
                </span>
                {isSynced && (
                  <span className="text-[10px] font-mono bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 px-2 py-0.5 rounded-full flex items-center gap-1">
                    <Cloud className="w-2.5 h-2.5" />
                    <span>HOST SYNCED</span>
                  </span>
                )}
              </h2>
              <p className="text-xs text-slate-400">
                Define your human context, worldview, and priorities so Hedes and the 100-Person Council understand you.
              </p>
            </div>
          </div>
          <button
            onClick={() => isProfileOpen.set(false)}
            className="p-2 text-slate-400 hover:text-white rounded-lg hover:bg-white/5 transition-colors cursor-pointer"
            title="Close modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1 custom-scrollbar">
          {/* Top Hero: 100-Personification Swarm Chat Launch Banner */}
          <div className="relative overflow-hidden rounded-xl p-5 border border-indigo-500/30 bg-gradient-to-r from-indigo-950/40 via-purple-950/30 to-[#12122b] shadow-lg shadow-indigo-900/20">
            <div className="flex items-start justify-between gap-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2 text-indigo-300 font-semibold text-sm">
                  <MessageSquare className="w-4 h-4 text-cyan-400" />
                  <span>100-Person Human Council Chat</span>
                  <span className="text-[10px] bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 px-1.5 py-0.2 rounded font-mono">
                    FULL-PAGE FORUM
                  </span>
                </div>
                <p className="text-xs text-slate-300 leading-relaxed">
                  Enter an interactive chamber where you can converse 1-on-1 with any of the 100 human archetypes (farmers, mechanics, lawyers, beggars, surgeons, students) or broadcast questions to the full Council for multi-perspective debate.
                </p>
              </div>
              <button
                type="button"
                onClick={handleOpen100Chat}
                className="shrink-0 px-4 py-2.5 rounded-xl bg-gradient-to-r from-cyan-500 to-indigo-600 hover:from-cyan-400 hover:to-indigo-500 text-white font-medium text-xs flex items-center gap-2 shadow-lg shadow-cyan-500/25 transition-all hover:scale-[1.02] active:scale-95 cursor-pointer"
              >
                <Sparkles className="w-4 h-4 text-yellow-300 animate-pulse" />
                <span>Open 100-Person Chat</span>
              </button>
            </div>
          </div>

          {/* Profile Form */}
          <form onSubmit={handleSave} className="space-y-5">
            {/* Live Identity Badge Preview & Avatar Theme */}
            <div className="flex items-center justify-between p-3.5 rounded-xl bg-[#14142b]/60 border border-[#252545]">
              <div className="flex items-center gap-3.5 min-w-0">
                <div
                  style={{ backgroundColor: avatarColor }}
                  className="w-12 h-12 rounded-full flex items-center justify-center font-bold text-white text-base shadow-inner border border-white/25 transition-colors"
                >
                  {profile.initials || 'DEV'}
                </div>
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-white truncate">
                    {name || 'Your Name'}
                  </div>
                  <div className="text-xs text-indigo-300 truncate">
                    {role || 'Your Professional Role'}
                  </div>
                  <div className="text-[11px] text-slate-400 truncate mt-0.5">
                    Live navigation badge preview
                  </div>
                </div>
              </div>

              {/* Avatar Color Picker */}
              <div className="flex items-center gap-1.5 shrink-0 pl-3 border-l border-[#252548]">
                <Palette className="w-3.5 h-3.5 text-slate-400 mr-1" />
                {AVATAR_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setAvatarColor(c)}
                    style={{ backgroundColor: c }}
                    className={`w-5 h-5 rounded-full border transition-all cursor-pointer ${
                      avatarColor === c ? 'scale-125 border-white ring-2 ring-indigo-400/50' : 'border-transparent hover:scale-110 opacity-70 hover:opacity-100'
                    }`}
                  />
                ))}
              </div>
            </div>

            {/* Name & Role Row */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                  <span>Your Full Name</span>
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Aditya Sharma"
                  className="w-full px-3.5 py-2.5 rounded-lg bg-[#14142b] border border-[#252548] text-white text-sm focus:outline-none focus:border-indigo-500 transition-colors"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                  <span>Professional Role / Title</span>
                </label>
                <input
                  type="text"
                  value={role}
                  onChange={(e) => setRole(e.target.value)}
                  placeholder="e.g. System Architect & Founder"
                  className="w-full px-3.5 py-2.5 rounded-lg bg-[#14142b] border border-[#252548] text-white text-sm focus:outline-none focus:border-indigo-500 transition-colors"
                />
              </div>
            </div>

            {/* Human Perspective & Worldview */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                  <Compass className="w-3.5 h-3.5 text-indigo-400" />
                  <span>Your Human Perspective & Worldview</span>
                </label>
                <span className="text-[11px] text-slate-400">Injected into AI system context</span>
              </div>
              <textarea
                value={perspective}
                onChange={(e) => setPerspective(e.target.value)}
                rows={3}
                placeholder="Describe your personal worldview, philosophy, and practical standards so the AI and Council understand your lived human perspective..."
                className="w-full px-3.5 py-2.5 rounded-lg bg-[#14142b] border border-[#252548] text-white text-xs font-sans leading-relaxed focus:outline-none focus:border-indigo-500 transition-colors resize-none custom-scrollbar"
              />

              {/* Quick Perspective Presets */}
              <div className="space-y-1.5 pt-1">
                <div className="text-[11px] text-slate-400 font-medium">Quick Human Perspective Presets:</div>
                <div className="flex flex-wrap gap-1.5">
                  {PERSPECTIVE_PRESETS.map((preset) => (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() => applyPreset(preset)}
                      className="text-[11px] px-2.5 py-1 rounded-md bg-[#191938] hover:bg-indigo-900/40 text-slate-300 hover:text-indigo-200 border border-[#2a2a50] transition-colors cursor-pointer"
                    >
                      {preset.title}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Technical Stack & Output Style Row */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                  <Layers className="w-3.5 h-3.5 text-indigo-400" />
                  <span>Primary Tech Stack</span>
                </label>
                <input
                  type="text"
                  value={techStack}
                  onChange={(e) => setTechStack(e.target.value)}
                  placeholder="e.g. React, TypeScript, Tailwind, Node.js"
                  className="w-full px-3.5 py-2 rounded-lg bg-[#14142b] border border-[#252548] text-white text-xs focus:outline-none focus:border-indigo-500 transition-colors"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                  <Shield className="w-3.5 h-3.5 text-indigo-400" />
                  <span>Technical Preferences</span>
                </label>
                <input
                  type="text"
                  value={preferences}
                  onChange={(e) => setPreferences(e.target.value)}
                  placeholder="e.g. Offline-first, dark theme, strict typing"
                  className="w-full px-3.5 py-2 rounded-lg bg-[#14142b] border border-[#252548] text-white text-xs focus:outline-none focus:border-indigo-500 transition-colors"
                />
              </div>
            </div>

            {/* Backup & Import notice */}
            {importNotice && (
              <div className="p-2 rounded-lg bg-indigo-500/10 border border-indigo-500/30 text-indigo-300 text-xs font-medium text-center">
                {importNotice}
              </div>
            )}

            {/* Actions Bar */}
            <div className="pt-3 flex items-center justify-between border-t border-[#202040]">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={resetUserProfile}
                  className="px-3 py-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-white/5 text-xs flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Reset</span>
                </button>

                <button
                  type="button"
                  onClick={exportProfileAsJson}
                  className="px-3 py-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-white/5 text-xs flex items-center gap-1.5 transition-colors cursor-pointer"
                  title="Export profile as JSON file"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Export</span>
                </button>

                <label className="px-3 py-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-white/5 text-xs flex items-center gap-1.5 transition-colors cursor-pointer">
                  <Upload className="w-3.5 h-3.5" />
                  <span>Import</span>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".json"
                    onChange={handleFileUpload}
                    className="hidden"
                  />
                </label>
              </div>

              <div className="flex items-center gap-3">
                {savedSuccess && (
                  <span className="text-xs text-emerald-400 flex items-center gap-1 animate-fadeIn">
                    <Check className="w-3.5 h-3.5" /> Saved & Synced
                  </span>
                )}
                <button
                  type="submit"
                  className="px-5 py-2 rounded-lg bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white font-medium text-xs shadow-lg shadow-indigo-600/30 transition-all active:scale-95 flex items-center gap-2 cursor-pointer"
                >
                  <span>Save Profile</span>
                </button>
              </div>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};
