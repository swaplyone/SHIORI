import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Settings,
  Moon,
  Sun,
  Monitor,
  Shield,
  Bell,
  Github,
  Smartphone,
  Lock,
  User,
  AlertTriangle,
  Palette,
  Type,
  Sparkles,
  Check,
  CheckSquare,
  GitBranch,
  Calendar,
  Tag,
  Sliders,
  Eye,
  Layers,
  Mic,
  Radio,
  Play,
  Square,
  Volume2
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useSpark } from '../context/SparkContext';
import { EInkTheme, UIMode, MatteLevel, FontOption, JAPANESE_MATTE_PRESETS, JapaneseMattePreset } from '../types';
import { SPARK_VOICES, SparkVoice, STANDARD_VOICE_SAMPLE_TEXT } from '../types/spark-voices';
import { sparkTTSManager } from '../services/spark/SparkTTSProvider';
import { sparkAudioManager } from '../services/spark/SparkAudioManager';
import { fetchJson } from '../utils/api';



const FONT_OPTIONS: { id: FontOption; name: string; category: string; description: string; sample: string; cssFont: string }[] = [
  {
    id: 'geist',
    name: 'Geist Sans',
    category: 'System Clean',
    description: 'High legibility, engineered precision and crisp UI structure.',
    sample: 'The quick brown fox jumps over the lazy dog',
    cssFont: "'Geist', -apple-system, sans-serif"
  },
  {
    id: 'inter',
    name: 'Inter',
    category: 'Modern Minimal',
    description: 'Balanced, neutral grotesque designed for digital readability.',
    sample: 'The quick brown fox jumps over the lazy dog',
    cssFont: "'Inter', -apple-system, sans-serif"
  },
  {
    id: 'plex_sans',
    name: 'IBM Plex Sans',
    category: 'Technical Humanist',
    description: 'Distinctive industrial architecture with human warmth.',
    sample: 'The quick brown fox jumps over the lazy dog',
    cssFont: "'IBM Plex Sans', sans-serif"
  },
  {
    id: 'plex_mono',
    name: 'IBM Plex Mono',
    category: 'Typewriter Monospace',
    description: 'Crisp mechanical typewriter aesthetic for engineers.',
    sample: 'The quick brown fox jumps over the lazy dog',
    cssFont: "'IBM Plex Mono', monospace"
  },
  {
    id: 'serif',
    name: 'Instrument Serif',
    category: 'Editorial Serif',
    description: 'Literary bookprint elegance and refined editorial rhythm.',
    sample: 'The quick brown fox jumps over the lazy dog',
    cssFont: "'Instrument Serif', Georgia, serif"
  },
  {
    id: 'abask',
    name: 'Abask',
    category: 'Vintage Display',
    description: 'Authentic historical typography and Japanese craft spirit.',
    sample: 'The quick brown fox jumps over the lazy dog',
    cssFont: "'Abask', 'Instrument Serif', serif"
  },
  {
    id: 'qualli',
    name: 'Qualli',
    category: 'Modern Organic Display',
    description: 'Contemporary organic display typography with distinctive character.',
    sample: 'The quick brown fox jumps over the lazy dog',
    cssFont: "'Qualli', 'Instrument Serif', serif"
  },
  {
    id: 'archela',
    name: 'Archela',
    category: 'Sculptural Display Serif',
    description: 'Refined sculptural serif with classical proportions and modern sharpness.',
    sample: 'The quick brown fox jumps over the lazy dog',
    cssFont: "'Archela', 'Instrument Serif', serif"
  }
];

export const SettingsPage: React.FC = () => {
  const {
    user,
    settings,
    setTheme,
    uiMode,
    matteLevel,
    accentColor,
    fontFamily,
    setUIMode,
    setMatteLevel,
    setAccentColor,
    setFontFamily,
    updateSettings,
    token,
    logout
  } = useAuth();

  const {
    voiceAssistantEnabled,
    setVoiceAssistantEnabled,
    heySparkEnabled,
    setHeySparkEnabled,
    voiceResponsesEnabled,
    setVoiceResponsesEnabled,
    sparkVoice,
    setSparkVoice,
    micPermissionStatus,
    requestMicrophoneAccess,
    unlockIOSAudio,
    openSpark
  } = useSpark();

  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<'appearance' | 'spark' | 'privacy' | 'notifications' | 'account' | 'pwa'>('appearance');

  const [testingVoice, setTestingVoice] = useState<SparkVoice | null>(null);

  const handleTestVoice = (voiceId: SparkVoice) => {
    unlockIOSAudio();
    if (testingVoice === voiceId) {
      sparkTTSManager.stop();
      sparkAudioManager.stop();
      setTestingVoice(null);
      return;
    }

    sparkTTSManager.stop();
    sparkAudioManager.stop();
    setTestingVoice(voiceId);

    sparkTTSManager.speak(
      STANDARD_VOICE_SAMPLE_TEXT,
      voiceId,
      () => {
        setTestingVoice(voiceId);
      },
      () => {
        setTestingVoice(null);
      },
      () => {
        setTestingVoice(null);
      }
    );
  };

  const [name, setName] = useState(user?.name || 'Lijith');
  const [bio, setBio] = useState(user?.bio || 'Systems engineer & SwaplyOne architect');
  const [privacyTasks, setPrivacyTasks] = useState(settings?.privacy_tasks || 'friends');
  const [privacyGithub, setPrivacyGithub] = useState(settings?.privacy_github || 'workspace');
  const [privacyStats, setPrivacyStats] = useState(settings?.privacy_stats || 'private');
  const [customHex, setCustomHex] = useState(accentColor || '#2E5A36');
  const [savedNotice, setSavedNotice] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const handleDeleteAccount = async () => {
    setIsDeleting(true);
    try {
      const { ok } = await fetchJson('/api/auth/account', {
        method: 'DELETE'
      });

      if (ok) {
        logout();
        navigate('/register');
      } else {
        alert('Failed to delete account. Please try again.');
      }
    } catch (err) {
      console.error('Failed to delete account:', err);
    } finally {
      setIsDeleting(false);
    }
  };

  const handleCustomHexChange = (hex: string) => {
    setCustomHex(hex);
    if (/^#[0-9A-Fa-f]{6}$/.test(hex)) {
      setAccentColor(hex);
    }
  };

  const handleSaveSettings = async () => {
    if (!token) return;
    try {
      await fetch('/api/auth/settings', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          ui_mode: uiMode,
          matte_level: matteLevel,
          accent_color: accentColor,
          font_family: fontFamily,
          privacy_tasks: privacyTasks,
          privacy_github: privacyGithub,
          privacy_stats: privacyStats,
        })
      });

      await fetch('/api/auth/profile', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ name, bio })
      });

      updateSettings({
        ui_mode: uiMode,
        matte_level: matteLevel,
        accent_color: accentColor,
        font_family: fontFamily,
        privacy_tasks: privacyTasks as any,
        privacy_github: privacyGithub as any,
        privacy_stats: privacyStats as any,
      });

      setSavedNotice(true);
      setTimeout(() => setSavedNotice(false), 3000);
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="space-y-8 select-none font-sans max-w-4xl pb-16">
      {/* Header */}
      <div className="border-b border-eink-border pb-4 flex items-center justify-between">
        <div>
          <h1 className="font-technical text-xl font-bold tracking-tight text-eink-text uppercase">
            WORKSPACE SETTINGS
          </h1>
          <p className="text-xs text-eink-textSecondary font-technical">
            E-Ink appearance, UI modes, typography, privacy boundaries, and PWA configuration
          </p>
        </div>

        {savedNotice && (
          <span className="px-2.5 py-1 bg-eink-text text-eink-bg text-xs font-technical font-bold rounded-sm animate-fade-in">
            ✓ SETTINGS SAVED
          </span>
        )}
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap gap-2 font-technical text-xs border-b border-eink-border pb-2">
        {[
          { key: 'appearance', label: 'APPEARANCE & PERSONALIZATION' },
          { key: 'spark', label: '✦ SPARK COMPANION' },
          { key: 'privacy', label: 'PRIVACY' },
          { key: 'notifications', label: 'NOTIFICATIONS' },
          { key: 'account', label: 'ACCOUNT' },
          { key: 'pwa', label: 'PWA' },
        ].map((t) => (
          <button
            key={t.key}
            onClick={() => setActiveTab(t.key as any)}
            className={`px-3 py-1.5 rounded-sm transition-all cursor-pointer ${
              activeTab === t.key
                ? 'bg-eink-darkSurface text-eink-darkText font-bold shadow-eink-sm'
                : 'text-eink-text hover:bg-eink-surface'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* APPEARANCE & PERSONALIZATION TAB */}
      {activeTab === 'appearance' && (
        <div className="space-y-6 font-technical text-xs">
          {/* 1. UI MODE SELECTION */}
          <div className="p-5 sm:p-6 bg-eink-surface border border-eink-border rounded-sm space-y-4 shadow-eink-sm">
            <div className="flex items-center justify-between border-b border-eink-border pb-2.5">
              <div>
                <h3 className="font-bold text-sm text-eink-text uppercase flex items-center gap-2">
                  <Sliders className="w-4 h-4 text-eink-text" />
                  <span>UI MODE</span>
                </h3>
                <p className="text-[11px] text-eink-textSecondary font-sans mt-0.5">
                  Control visual mood without losing Shiori's core physical paper / E-ink identity.
                </p>
              </div>
              <span className="text-[10px] font-mono px-2 py-0.5 bg-eink-bg border border-eink-border rounded font-bold">
                ACTIVE: {uiMode === 'color_matte' ? 'COLOR MATTE' : 'E-INK MATTE'}
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
              {/* E-Ink Matte (Default) */}
              <div
                onClick={() => setUIMode('eink_matte')}
                className={`p-4 border rounded-sm cursor-pointer space-y-2 transition-all ${
                  uiMode === 'eink_matte'
                    ? 'border-2 border-eink-text bg-eink-bg shadow-eink-sm'
                    : 'border-eink-border bg-eink-surface hover:bg-eink-surfaceHover text-eink-text'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-bold text-xs flex items-center gap-1.5">
                    <span>E-INK MATTE</span>
                    <span className="text-[9px] bg-eink-text text-eink-bg px-1.5 py-0.2 rounded font-mono">DEFAULT</span>
                  </span>
                  {uiMode === 'eink_matte' && <span className="font-bold">✓</span>}
                </div>
                <p className="text-[11px] opacity-80 font-sans leading-relaxed">
                  The original calm, monochrome, paper-like Shiori experience. Pure E-ink minimalism, black borders, zero distractions.
                </p>
                <div className="pt-2 flex items-center gap-1 text-[10px] text-eink-textMuted font-mono">
                  <span className="w-2.5 h-2.5 rounded-full bg-[#111111] inline-block" />
                  <span>Monochrome paper aesthetic</span>
                </div>
              </div>

              {/* Color Matte */}
              <div
                onClick={() => setUIMode('color_matte')}
                className={`p-4 border rounded-sm cursor-pointer space-y-2 transition-all ${
                  uiMode === 'color_matte'
                    ? 'border-2 border-eink-text bg-eink-bg shadow-eink-sm'
                    : 'border-eink-border bg-eink-surface hover:bg-eink-surfaceHover text-eink-text'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-bold text-xs flex items-center gap-1.5">
                    <span>COLOR MATTE</span>
                    <span className="text-[9px] border border-eink-border px-1.5 py-0.2 rounded font-mono">PERSONALIZED</span>
                  </span>
                  {uiMode === 'color_matte' && <span className="font-bold">✓</span>}
                </div>
                <p className="text-[11px] opacity-80 font-sans leading-relaxed">
                  Restrained matte color accents for buttons, priorities, statuses, and tags while strictly preserving paper textures and black borders.
                </p>
                <div className="pt-2 flex items-center gap-1.5 text-[10px] font-mono">
                  <span
                    className="w-2.5 h-2.5 rounded-full border border-eink-border inline-block"
                    style={{ backgroundColor: accentColor || '#2E5A36' }}
                  />
                  <span className="text-eink-text font-bold">Accent: {accentColor || '#2E5A36'}</span>
                </div>
              </div>
            </div>
          </div>

          {/* 2. MATTE LEVEL SELECTION */}
          <div className="p-5 sm:p-6 bg-eink-surface border border-eink-border rounded-sm space-y-4 shadow-eink-sm">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-eink-border pb-2.5 gap-2">
              <div>
                <h3 className="font-bold text-sm text-eink-text uppercase flex items-center gap-2">
                  <Layers className="w-4 h-4 text-eink-text" />
                  <span>MATTE LEVEL · マットレベル</span>
                </h3>
                <p className="text-[11px] text-eink-textSecondary font-sans mt-0.5">
                  Adjust tactile paper tone and surface intensity across your workspace.
                </p>
              </div>
              <span className="text-[10px] font-mono px-2 py-0.5 bg-eink-bg border border-eink-border rounded font-bold uppercase">
                ACTIVE: {matteLevel.toUpperCase()}
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5 pt-1">
              {/* SOFT */}
              <div
                onClick={() => setMatteLevel('soft')}
                className={`p-4 border rounded-sm cursor-pointer space-y-3 transition-all flex flex-col justify-between matte-preview-card-soft ${
                  matteLevel === 'soft'
                    ? 'border-2 border-eink-text shadow-eink-sm'
                    : 'border-eink-border hover:border-eink-borderDark text-eink-text'
                }`}
              >
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-xs tracking-wide">SOFT</span>
                    {matteLevel === 'soft' ? (
                      <span className="text-[10px] font-mono font-bold bg-eink-text text-eink-bg px-1.5 py-0.2 rounded flex items-center gap-1">
                        <Check className="w-3 h-3 stroke-[3]" />
                        <span>ACTIVE</span>
                      </span>
                    ) : (
                      <span className="text-[9px] font-mono text-eink-textMuted uppercase border border-eink-border/60 px-1 py-0.2 rounded">
                        MINIMAL GRAIN
                      </span>
                    )}
                  </div>

                  {/* Microscopic Surface Zoom Window */}
                  <div className="w-full h-14 rounded-xs border border-eink-border matte-swatch-box-soft flex flex-col justify-end p-1.5 relative shadow-inner">
                    <span className="text-[8px] font-mono uppercase bg-eink-surface/90 border border-eink-border px-1 py-0.2 rounded text-eink-textSecondary self-start">
                      FINE STATIONERY
                    </span>
                  </div>

                  <p className="text-[11px] text-eink-textSecondary font-sans leading-relaxed">
                    Ultra-fine, almost imperceptible grain. Clean glare-free premium stationery surface with minimal microscopic variation.
                  </p>
                </div>
                <div className="pt-2 border-t border-eink-border/50 text-[10px] font-mono text-eink-textMuted flex items-center justify-between">
                  <span>Smooth Matte</span>
                  <span className="font-bold">{matteLevel === 'soft' ? 'SELECTED' : 'SELECT'}</span>
                </div>
              </div>

              {/* NATURAL */}
              <div
                onClick={() => setMatteLevel('natural')}
                className={`p-4 border rounded-sm cursor-pointer space-y-3 transition-all flex flex-col justify-between matte-preview-card-natural ${
                  matteLevel === 'natural'
                    ? 'border-2 border-eink-text shadow-eink-sm'
                    : 'border-eink-border hover:border-eink-borderDark text-eink-text'
                }`}
              >
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <span className="font-bold text-xs tracking-wide">NATURAL</span>
                      <span className="text-[9px] bg-eink-text text-eink-bg px-1.5 py-0.2 rounded font-mono font-bold">
                        RECOMMENDED
                      </span>
                    </div>
                    {matteLevel === 'natural' && (
                      <span className="text-[10px] font-mono font-bold bg-eink-text text-eink-bg px-1.5 py-0.2 rounded flex items-center gap-1">
                        <Check className="w-3 h-3 stroke-[3]" />
                        <span>ACTIVE</span>
                      </span>
                    )}
                  </div>

                  {/* Microscopic Surface Zoom Window */}
                  <div className="w-full h-14 rounded-xs border border-eink-border matte-swatch-box-natural flex flex-col justify-end p-1.5 relative shadow-inner">
                    <span className="text-[8px] font-mono uppercase bg-eink-surface/90 border border-eink-border px-1 py-0.2 rounded text-eink-textSecondary self-start">
                      JAPANESE WASHI FIBERS
                    </span>
                  </div>

                  <p className="text-[11px] text-eink-textSecondary font-sans leading-relaxed">
                    Perceptible fine-grain surface with subtle irregular paper pulp fibers. Authentic handmade Japanese washi paper texture.
                  </p>
                </div>
                <div className="pt-2 border-t border-eink-border/50 text-[10px] font-mono text-eink-textMuted flex items-center justify-between">
                  <span>Washi Micro-Fibers</span>
                  <span className="font-bold">{matteLevel === 'natural' ? 'SELECTED' : 'SELECT'}</span>
                </div>
              </div>

              {/* DEEP */}
              <div
                onClick={() => setMatteLevel('deep')}
                className={`p-4 border rounded-sm cursor-pointer space-y-3 transition-all flex flex-col justify-between matte-preview-card-deep ${
                  matteLevel === 'deep'
                    ? 'border-2 border-eink-text shadow-eink-sm'
                    : 'border-eink-border hover:border-eink-borderDark text-eink-text'
                }`}
              >
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-xs tracking-wide">DEEP</span>
                    {matteLevel === 'deep' ? (
                      <span className="text-[10px] font-mono font-bold bg-eink-text text-eink-bg px-1.5 py-0.2 rounded flex items-center gap-1">
                        <Check className="w-3 h-3 stroke-[3]" />
                        <span>ACTIVE</span>
                      </span>
                    ) : (
                      <span className="text-[9px] font-mono text-eink-textMuted uppercase border border-eink-border/60 px-1 py-0.2 rounded">
                        STRONG GRAIN
                      </span>
                    )}
                  </div>

                  {/* Microscopic Surface Zoom Window */}
                  <div className="w-full h-14 rounded-xs border border-eink-border matte-swatch-box-deep flex flex-col justify-end p-1.5 relative shadow-inner">
                    <span className="text-[8px] font-mono uppercase bg-eink-surface/90 border border-eink-border px-1 py-0.2 rounded text-eink-textSecondary self-start">
                      HEAVY UNCOATED TOOTH
                    </span>
                  </div>

                  <p className="text-[11px] text-eink-textSecondary font-sans leading-relaxed">
                    Clearly stronger micro-grain with prominent paper tooth and fiber matrix. Physical tactile paper surface without digital noise.
                  </p>
                </div>
                <div className="pt-2 border-t border-eink-border/50 text-[10px] font-mono text-eink-textMuted flex items-center justify-between">
                  <span>Heavy Tactile Paper</span>
                  <span className="font-bold">{matteLevel === 'deep' ? 'SELECTED' : 'SELECT'}</span>
                </div>
              </div>
            </div>
          </div>

          {/* 3. JAPANESE MATTE PRESETS */}
          <div className="p-5 sm:p-6 bg-eink-surface border border-eink-border rounded-sm space-y-4 shadow-eink-sm">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-eink-border pb-2.5 gap-2">
              <div>
                <h3 className="font-bold text-sm text-eink-text uppercase flex items-center gap-2">
                  <Palette className="w-4 h-4 text-eink-text" />
                  <span>JAPANESE MATTE PRESETS · 和風マット</span>
                </h3>
                <p className="text-[11px] text-eink-textSecondary font-sans mt-0.5">
                  Muted physical ink tones on matte paper: seal vermilion, deep indigo, pine green, warm tea, and plum blossom.
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span
                  className="w-3.5 h-3.5 rounded-xs border border-eink-border inline-block shadow-xs"
                  style={{ backgroundColor: accentColor }}
                />
                <span className="text-[10px] font-mono px-2 py-0.5 bg-eink-bg border border-eink-border rounded font-bold uppercase">
                  {uiMode === 'color_matte' ? `ACTIVE: ${accentColor}` : 'E-INK MONOCHROME'}
                </span>
              </div>
            </div>

            {/* Presets Grid */}
            <div className="space-y-2">
              <span className="text-[10px] uppercase font-bold text-eink-textMuted tracking-wider block font-technical">
                TRADITIONAL INK PRESETS (5)
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 pt-1">
                {JAPANESE_MATTE_PRESETS.map((preset) => {
                  const isSelected = accentColor?.toLowerCase() === preset.primary.toLowerCase();
                  return (
                    <div
                      key={preset.id}
                      onClick={() => {
                        setAccentColor(preset.primary);
                        setCustomHex(preset.primary);
                        if (uiMode !== 'color_matte') {
                          setUIMode('color_matte');
                        }
                      }}
                      className={`p-3.5 border rounded-sm cursor-pointer space-y-2.5 transition-all flex flex-col justify-between ${
                        isSelected && uiMode === 'color_matte'
                          ? 'border-2 border-eink-text bg-eink-bg shadow-eink-sm'
                          : 'border-eink-border bg-eink-surface hover:bg-eink-surfaceHover text-eink-text'
                      }`}
                    >
                      <div className="space-y-2">
                        {/* Swatches & Status */}
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-1.5">
                            <span
                              className="w-4 h-4 rounded-xs border border-black/20 shadow-xs inline-block"
                              style={{ backgroundColor: preset.primary }}
                              title={`Primary: ${preset.primary}`}
                            />
                            <span
                              className="w-4 h-4 rounded-xs border border-black/20 shadow-xs inline-block"
                              style={{ backgroundColor: preset.secondary }}
                              title={`Secondary: ${preset.secondary}`}
                            />
                          </div>
                          {isSelected && uiMode === 'color_matte' ? (
                            <span className="text-[10px] font-mono font-bold bg-eink-text text-eink-bg px-1.5 py-0.2 rounded flex items-center gap-1">
                              <Check className="w-3 h-3 stroke-[3]" />
                              <span>ACTIVE</span>
                            </span>
                          ) : (
                            <span className="text-[9px] font-mono text-eink-textMuted uppercase">
                              {preset.primary}
                            </span>
                          )}
                        </div>

                        {/* Title & Description */}
                        <div>
                          <div className="font-bold text-xs text-eink-text flex items-center gap-1.5">
                            <span>{preset.fullName}</span>
                          </div>
                          <p className="text-[11px] text-eink-textSecondary font-sans leading-snug mt-1">
                            {preset.description}
                          </p>
                        </div>
                      </div>

                      {/* Action Row */}
                      <div className="pt-2 border-t border-eink-border/50 flex items-center justify-between text-[10px] font-mono">
                        <span className="text-eink-textMuted">
                          Primary: <strong className="text-eink-text">{preset.primary}</strong>
                        </span>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setAccentColor(preset.primary);
                            setCustomHex(preset.primary);
                            if (uiMode !== 'color_matte') {
                              setUIMode('color_matte');
                            }
                          }}
                          className={`px-2.5 py-1 rounded-sm text-[10px] font-bold tracking-wider uppercase transition-all cursor-pointer ${
                            isSelected && uiMode === 'color_matte'
                              ? 'bg-eink-text text-eink-bg'
                              : 'border border-eink-border hover:bg-eink-surface text-eink-text'
                          }`}
                        >
                          {isSelected && uiMode === 'color_matte' ? 'SELECTED' : 'APPLY'}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Custom Hex Color Option */}
            <div className="pt-3 border-t border-eink-border flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <span className="text-[11px] font-bold text-eink-text uppercase block">
                  CUSTOM MATTE COLOR
                </span>
                <span className="text-[10px] text-eink-textSecondary font-sans">
                  Pick any custom hex code. Sufficient contrast and matte ink texture are automatically calculated.
                </span>
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={accentColor.startsWith('#') ? accentColor : '#A64032'}
                  onChange={(e) => {
                    setAccentColor(e.target.value);
                    setCustomHex(e.target.value);
                    if (uiMode !== 'color_matte') {
                      setUIMode('color_matte');
                    }
                  }}
                  className="w-8 h-8 rounded-sm border border-eink-border cursor-pointer bg-transparent p-0.5"
                  title="Pick custom color"
                />
                <input
                  type="text"
                  value={customHex}
                  onChange={(e) => {
                    handleCustomHexChange(e.target.value);
                    if (uiMode !== 'color_matte' && /^#[0-9A-Fa-f]{6}$/.test(e.target.value)) {
                      setUIMode('color_matte');
                    }
                  }}
                  placeholder="#A64032"
                  maxLength={7}
                  className="w-24 px-2.5 py-1.5 bg-eink-bg border border-eink-border rounded-sm text-xs font-mono text-eink-text uppercase outline-none"
                />
              </div>
            </div>
          </div>

          {/* 3. FONT SELECTION */}
          <div className="p-5 sm:p-6 bg-eink-surface border border-eink-border rounded-sm space-y-4 shadow-eink-sm">
            <div className="flex items-center justify-between border-b border-eink-border pb-2.5">
              <div>
                <h3 className="font-bold text-sm text-eink-text uppercase flex items-center gap-2">
                  <Type className="w-4 h-4 text-eink-text" />
                  <span>FONT SELECTION</span>
                </h3>
                <p className="text-[11px] text-eink-textSecondary font-sans mt-0.5">
                  Applied globally across tasks, navigation, modals, and settings while preserving existing weights and spacing.
                </p>
              </div>
              <span className="text-[10px] font-mono px-2 py-0.5 bg-eink-bg border border-eink-border rounded font-bold uppercase">
                ACTIVE: {fontFamily}
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
              {FONT_OPTIONS.map((f) => {
                const isSelected = fontFamily === f.id;
                return (
                  <div
                    key={f.id}
                    onClick={() => setFontFamily(f.id)}
                    className={`p-3.5 border rounded-sm cursor-pointer space-y-2 transition-all ${
                      isSelected
                        ? 'border-2 border-eink-text bg-eink-bg shadow-eink-sm'
                        : 'border-eink-border bg-eink-surface hover:bg-eink-surfaceHover text-eink-text'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="font-bold text-xs block">{f.name}</span>
                        <span className="text-[9px] text-eink-textMuted font-mono uppercase">{f.category}</span>
                      </div>
                      {isSelected && <span className="font-bold text-xs">✓</span>}
                    </div>

                    <div
                      className="p-2 bg-eink-surface/60 border border-eink-border/60 rounded-xs text-xs text-eink-text leading-tight truncate"
                      style={{ fontFamily: f.cssFont }}
                    >
                      Aa Bb Gg 123
                    </div>

                    <p className="text-[10px] text-eink-textSecondary font-sans leading-tight">
                      {f.description}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>

          {/* 4. BASE E-INK LIGHT / DARK PALETTE */}
          <div className="p-5 sm:p-6 bg-eink-surface border border-eink-border rounded-sm space-y-4 shadow-eink-sm">
            <div className="border-b border-eink-border pb-2.5">
              <h3 className="font-bold text-sm text-eink-text uppercase">BASE LIGHTING THEME</h3>
              <p className="text-[11px] text-eink-textSecondary font-sans mt-0.5">
                Physical reflective paper lighting balance (Daylight Warm vs Nighttime Charcoal vs Pure Monochrome).
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {/* E-Ink Light */}
              <div
                onClick={() => setTheme('light')}
                className={`p-3.5 border rounded-sm cursor-pointer space-y-1.5 transition-all ${
                  user?.theme === 'light' || !user?.theme
                    ? 'border-2 border-eink-text bg-[#F4F3EE] text-[#111111] shadow-eink-sm'
                    : 'border-eink-border bg-eink-bg text-eink-text'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-bold text-xs">E-INK LIGHT</span>
                  {(user?.theme === 'light' || !user?.theme) && <span>✓</span>}
                </div>
                <p className="text-[10px] opacity-80 font-sans">
                  Warm paper / digital notebook grayscale. Default aesthetic.
                </p>
                <div className="text-[9px] text-eink-textMuted font-mono">#F4F3EE</div>
              </div>

              {/* E-Ink Dark */}
              <div
                onClick={() => setTheme('dark')}
                className={`p-3.5 border rounded-sm cursor-pointer space-y-1.5 transition-all ${
                  user?.theme === 'dark'
                    ? 'border-2 border-eink-text bg-[#141414] text-[#EAE9E3] shadow-eink-sm'
                    : 'border-eink-border bg-eink-bg text-eink-text'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-bold text-xs">E-INK DARK</span>
                  {user?.theme === 'dark' && <span>✓</span>}
                </div>
                <p className="text-[10px] opacity-80 font-sans">
                  Graphite / charcoal dark grayscale for night workspaces.
                </p>
                <div className="text-[9px] opacity-60 font-mono">#141414</div>
              </div>

              {/* Pure Monochrome */}
              <div
                onClick={() => setTheme('monochrome')}
                className={`p-3.5 border rounded-sm cursor-pointer space-y-1.5 transition-all ${
                  user?.theme === 'monochrome'
                    ? 'border-2 border-black bg-white text-black shadow-eink-sm'
                    : 'border-eink-border bg-eink-bg text-eink-text'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-bold text-xs">PURE MONOCHROME</span>
                  {user?.theme === 'monochrome' && <span>✓</span>}
                </div>
                <p className="text-[10px] opacity-80 font-sans">
                  Strict stark 100% black and white contrast without tints.
                </p>
                <div className="text-[9px] opacity-60 font-mono">#FFFFFF / #000000</div>
              </div>
            </div>
          </div>

          {/* 5. LIVE INTERACTIVE PREVIEW */}
          <div className="p-5 sm:p-6 bg-eink-surface border-2 border-eink-text rounded-sm space-y-4 shadow-eink-card">
            <div className="flex items-center justify-between border-b border-eink-border pb-2.5">
              <div className="flex items-center gap-2">
                <Eye className="w-4 h-4 text-eink-text" />
                <h3 className="font-bold text-xs uppercase text-eink-text tracking-wider">
                  LIVE INTERACTIVE COMPONENT PREVIEW
                </h3>
              </div>
              <span className="text-[10px] text-eink-textSecondary font-mono">
                Updates instantly in real-time
              </span>
            </div>

            {/* Sample Task Card */}
            <div className="p-4 bg-eink-bg border border-eink-border rounded-sm space-y-3 shadow-eink-sm">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div className="flex items-center gap-2.5">
                  <button type="button" className="text-eink-text">
                    <CheckSquare className="w-4 h-4" />
                  </button>
                  <span className="font-bold text-[10px] bg-eink-surface px-1.5 py-0.2 border border-eink-border rounded font-mono">
                    SHR-0042
                  </span>
                  <span className="font-bold text-xs text-eink-text">
                    Optimize compiler pipeline & build performance
                  </span>
                </div>

                <div className="flex items-center gap-1.5 self-start sm:self-center">
                  {/* Priority Badge */}
                  <span
                    className={`text-[9px] font-mono font-bold px-2 py-0.5 border rounded ${
                      uiMode === 'color_matte'
                        ? 'accent-badge'
                        : 'bg-eink-darkSurface text-eink-darkText border-eink-darkSurface'
                    }`}
                  >
                    ⚡ URGENT
                  </span>
                  {/* Status Badge */}
                  <span className="text-[9px] font-mono px-2 py-0.5 bg-eink-surface border border-eink-border rounded text-eink-text font-bold">
                    IN PROGRESS
                  </span>
                </div>
              </div>

              {/* Task Meta details */}
              <div className="flex flex-wrap items-center gap-3 text-[11px] text-eink-textSecondary font-mono border-t border-eink-border/50 pt-2">
                <span className="flex items-center gap-1 text-eink-text">
                  <GitBranch className="w-3 h-3" />
                  <span>feature/compiler</span>
                </span>
                <span>•</span>
                <span className="flex items-center gap-1">
                  <Calendar className="w-3 h-3" />
                  <span>Due Tomorrow</span>
                </span>
                <span>•</span>
                <span className="flex items-center gap-1">
                  <Tag className="w-3 h-3" />
                  <span>#v2.4-release</span>
                </span>
              </div>
            </div>

            {/* Sample Action Buttons & Badges */}
            <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  className="px-4 py-2 bg-eink-text text-eink-bg font-bold rounded-sm text-xs shadow-eink-sm cursor-pointer"
                >
                  [ PRIMARY ACTION ]
                </button>
                <button
                  type="button"
                  className="px-4 py-2 bg-eink-surface border border-eink-border text-eink-text hover:bg-eink-surfaceHover font-bold rounded-sm text-xs cursor-pointer"
                >
                  [ SECONDARY ]
                </button>
              </div>

              <span className="text-[11px] text-eink-textSecondary font-mono">
                Mode: <strong>{uiMode === 'color_matte' ? 'Color Matte' : 'E-ink Matte'}</strong> · Matte: <strong className="uppercase">{matteLevel}</strong> · Font: <strong>{fontFamily}</strong>
              </span>
            </div>
          </div>
        </div>
      )}

      {/* SPARK COMPANION TAB */}
      {activeTab === 'spark' && (
        <div className="space-y-4 font-technical text-xs">
          {/* SPARK VOICE PACKS */}
          <div className="p-5 sm:p-6 bg-eink-surface border border-eink-border rounded-sm space-y-4 shadow-eink-sm">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-eink-border pb-2.5 gap-2">
              <div>
                <h3 className="font-bold text-sm text-eink-text uppercase flex items-center gap-2">
                  <Volume2 className="w-4 h-4 text-eink-text" />
                  <span>SPARK VOICE · 音声設定</span>
                </h3>
                <p className="text-[11px] text-eink-textSecondary font-sans mt-0.5">
                  Choose how Spark sounds. Selectable neural human voice packs with natural warmth and clarity.
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className="text-[10px] font-mono px-2 py-0.5 bg-eink-bg border border-eink-border rounded font-bold uppercase">
                  ACTIVE: {SPARK_VOICES.find(v => v.id === sparkVoice)?.name || 'BELLA'}
                </span>
              </div>
            </div>

            {/* Voice Cards Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
              {SPARK_VOICES.map((voice) => {
                const isSelected = sparkVoice === voice.id;
                const isTesting = testingVoice === voice.id;

                return (
                  <div
                    key={voice.id}
                    onClick={() => setSparkVoice(voice.id)}
                    className={`p-3.5 border rounded-sm cursor-pointer space-y-2.5 transition-all flex flex-col justify-between ${
                      isSelected
                        ? 'border-2 border-eink-text bg-eink-bg shadow-eink-sm'
                        : 'border-eink-border bg-eink-surface hover:bg-eink-surfaceHover text-eink-text'
                    }`}
                  >
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5">
                          <span className="font-bold text-xs">♫ {voice.name}</span>
                          {voice.id === 'af_bella' && (
                            <span className="text-[9px] bg-eink-text text-eink-bg px-1.5 py-0.2 rounded font-mono">
                              DEFAULT
                            </span>
                          )}
                        </div>
                        {isSelected && (
                          <span className="text-[10px] font-mono font-bold bg-eink-text text-eink-bg px-1.5 py-0.2 rounded flex items-center gap-1">
                            <Check className="w-3 h-3 stroke-[3]" />
                            <span>ACTIVE</span>
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] font-bold text-eink-text">
                        {voice.description}
                      </div>
                      <p className="text-[11px] text-eink-textSecondary font-sans leading-relaxed">
                        {voice.character}
                      </p>
                    </div>

                    <div className="pt-2 border-t border-eink-border/50 flex items-center justify-between gap-2">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleTestVoice(voice.id);
                        }}
                        className={`px-2.5 py-1 rounded-sm text-[10px] font-mono font-bold tracking-wider uppercase transition-all flex items-center gap-1 cursor-pointer ${
                          isTesting
                            ? 'bg-amber-600 text-white animate-pulse'
                            : 'border border-eink-border bg-eink-bg hover:bg-eink-surface text-eink-text'
                        }`}
                        title={isTesting ? 'Stop Audio Sample' : 'Test Voice Sample'}
                      >
                        {isTesting ? (
                          <>
                            <Square className="w-3 h-3 fill-current" />
                            <span>STOP</span>
                          </>
                        ) : (
                          <>
                            <Play className="w-3 h-3 fill-current" />
                            <span>TEST</span>
                          </>
                        )}
                      </button>

                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSparkVoice(voice.id);
                        }}
                        className={`px-2.5 py-1 rounded-sm text-[10px] font-mono font-bold tracking-wider uppercase transition-all cursor-pointer ${
                          isSelected
                            ? 'bg-eink-text text-eink-bg'
                            : 'border border-eink-border hover:bg-eink-surface text-eink-text'
                        }`}
                      >
                        {isSelected ? 'SELECTED' : 'SELECT'}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="p-6 bg-eink-surface border border-eink-border rounded-sm space-y-5">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold text-eink-text font-abask">✦ SPARK COMPANION</span>
                <span className="text-[10px] bg-eink-bg px-2 py-0.5 border border-eink-border rounded font-mono font-bold">
                  PROJECT COMPANION
                </span>
              </div>
              <p className="text-eink-textSecondary mt-1">
                Configure voice wake-word, spoken responses, microphone access, and natural language workspace awareness.
              </p>
            </div>

            <div className="space-y-4 pt-2 divide-y divide-eink-border/50">
              {/* 1. Voice Assistant Master Toggle */}
              <div className="pt-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <span className="font-bold text-eink-text text-sm block">Voice Assistant</span>
                  <span className="text-[11px] text-eink-textMuted block mt-0.5">
                    Enable Spark voice interactions, floating quick-talk bubble, and companion assistant features.
                  </span>
                </div>

                <button
                  type="button"
                  onClick={() => setVoiceAssistantEnabled(!voiceAssistantEnabled)}
                  className={`px-4 py-2 rounded-sm font-mono text-xs font-bold transition-all cursor-pointer ${
                    voiceAssistantEnabled
                      ? 'bg-eink-text text-eink-bg border-2 border-eink-text shadow-eink-sm'
                      : 'bg-eink-bg border border-eink-border text-eink-textSecondary hover:text-eink-text'
                  }`}
                >
                  {voiceAssistantEnabled ? 'ON' : 'OFF'}
                </button>
              </div>

              {/* 2. Wake Word Toggle */}
              <div className="pt-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-eink-text text-sm">Wake Word Mode</span>
                    {heySparkEnabled && (
                      <span className="flex items-center gap-1 text-[10px] text-eink-text font-mono font-bold bg-eink-bg px-2 py-0.5 border border-eink-border rounded">
                        <Radio className="w-3 h-3 animate-pulse text-eink-text" />
                        ACTIVE
                      </span>
                    )}
                  </div>
                  <span className="text-[11px] text-eink-textMuted block mt-0.5">
                    Listen for wake phrase while SHIORI is open in your browser or PWA.
                  </span>
                </div>

                <button
                  type="button"
                  onClick={() => setHeySparkEnabled(!heySparkEnabled)}
                  className={`px-4 py-2 rounded-sm font-mono text-xs font-bold transition-all cursor-pointer ${
                    heySparkEnabled
                      ? 'bg-eink-text text-eink-bg border-2 border-eink-text shadow-eink-sm'
                      : 'bg-eink-bg border border-eink-border text-eink-textSecondary hover:text-eink-text'
                  }`}
                >
                  {heySparkEnabled ? 'ON' : 'OFF'}
                </button>
              </div>

              {/* 3. Wake Phrase Information */}
              <div className="pt-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <span className="font-bold text-eink-text block">Wake Phrase</span>
                  <span className="text-[11px] text-eink-textMuted">
                    Primary wake trigger with Indian English phonetic normalization.
                  </span>
                </div>

                <div className="flex items-center gap-1.5">
                  <span className="px-2.5 py-1 bg-eink-bg border border-eink-border rounded font-mono font-bold text-xs text-eink-text">
                    HEY SPARK
                  </span>
                  <span className="text-[10px] text-eink-textMuted font-mono">
                    (also: "Hi Spark", "Hey Spock")
                  </span>
                </div>
              </div>

              {/* 4. Voice Responses Toggle */}
              <div className="pt-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <span className="font-bold text-eink-text text-sm block">Voice Responses (Speech Output)</span>
                  <span className="text-[11px] text-eink-textMuted block mt-0.5">
                    Speak direct answers, daily briefings, and focus completions via browser speech synthesis.
                  </span>
                </div>

                <button
                  type="button"
                  onClick={() => setVoiceResponsesEnabled(!voiceResponsesEnabled)}
                  className={`px-4 py-2 rounded-sm font-mono text-xs font-bold transition-all cursor-pointer ${
                    voiceResponsesEnabled
                      ? 'bg-eink-text text-eink-bg border-2 border-eink-text shadow-eink-sm'
                      : 'bg-eink-bg border border-eink-border text-eink-textSecondary hover:text-eink-text'
                  }`}
                >
                  {voiceResponsesEnabled ? 'ON' : 'OFF'}
                </button>
              </div>

              {/* 5. Microphone Permission Status */}
              <div className="pt-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-eink-text block">Microphone Permission</span>
                    <span
                      className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded border ${
                        micPermissionStatus === 'granted'
                          ? 'bg-emerald-500/10 border-emerald-500 text-emerald-700'
                          : 'bg-amber-500/10 border-amber-500 text-amber-700'
                      }`}
                    >
                      {micPermissionStatus === 'granted' ? 'GRANTED' : 'NOT GRANTED'}
                    </span>
                  </div>
                  <span className="text-[11px] text-eink-textMuted block mt-0.5">
                    Required for wake-word and microphone audio speech recognition.
                  </span>
                </div>

                <button
                  type="button"
                  onClick={async () => {
                    await requestMicrophoneAccess();
                  }}
                  className="px-3.5 py-1.5 bg-eink-bg hover:bg-eink-surface border border-eink-border rounded-sm font-bold text-eink-text flex items-center gap-1.5 shrink-0 transition-colors cursor-pointer"
                >
                  <Mic className="w-3.5 h-3.5" />
                  <span>{micPermissionStatus === 'granted' ? 'TEST MIC' : 'GRANT ACCESS'}</span>
                </button>
              </div>

              {/* 6. Manual Voice & Shortcut */}
              <div className="pt-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <span className="font-bold text-eink-text block">Manual Voice & Keyboard Shortcut</span>
                  <span className="text-[11px] text-eink-textMuted">
                    Tap the floating Spark bubble anytime or press <kbd className="px-1.5 py-0.5 border border-eink-border rounded bg-eink-bg font-mono">Ctrl+J</kbd> / <kbd className="px-1.5 py-0.5 border border-eink-border rounded bg-eink-bg font-mono">Alt+S</kbd>.
                  </span>
                </div>

                <button
                  type="button"
                  onClick={() => openSpark()}
                  className="px-3.5 py-1.5 bg-eink-text text-eink-bg font-bold rounded-sm text-xs flex items-center gap-1.5 shrink-0 shadow-eink-sm hover:opacity-90 transition-opacity cursor-pointer"
                >
                  <Mic className="w-3.5 h-3.5" />
                  <span>OPEN SPARK</span>
                </button>
              </div>

              {/* 7. Privacy Architecture Notice */}
              <div className="pt-3">
                <div className="p-3 bg-eink-bg border border-eink-border rounded-sm space-y-1">
                  <span className="font-bold text-eink-text block text-[11px]">🔒 Privacy & Scope Guarantee</span>
                  <p className="text-[10px] text-eink-textSecondary leading-relaxed">
                    Spark operates strictly within a whitelist of SHIORI tools (tasks, projects, focus timer, Git status). Wake-word recognition runs on-device through standard Web Speech API while SHIORI is open, and audio is never recorded, stored, or streamed to external servers.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* PRIVACY TAB */}
      {activeTab === 'privacy' && (
        <div className="space-y-4 font-technical text-xs">
          <div className="p-6 bg-eink-surface border border-eink-border rounded-sm space-y-5">
            <div>
              <h3 className="font-bold text-sm text-eink-text uppercase">VISIBILITY BOUNDARIES</h3>
              <p className="text-eink-textSecondary mt-1">
                Control who can see your development activity, task titles and stats.
              </p>
            </div>

            <div className="space-y-4 pt-2 divide-y divide-eink-border/50">
              <div className="pt-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <span className="font-bold text-eink-text block">GitHub Activity</span>
                  <span className="text-[11px] text-eink-textMuted">Commits, PRs and CI checks</span>
                </div>
                <select
                  value={privacyGithub}
                  onChange={(e) => setPrivacyGithub(e.target.value as any)}
                  className="px-3 py-1.5 bg-eink-bg border border-eink-border rounded text-eink-text outline-none"
                >
                  <option value="workspace">WORKSPACE</option>
                  <option value="friends">FRIENDS</option>
                  <option value="private">PRIVATE</option>
                </select>
              </div>

              <div className="pt-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <span className="font-bold text-eink-text block">Task Titles & Codes</span>
                  <span className="text-[11px] text-eink-textMuted">What you are currently working on</span>
                </div>
                <select
                  value={privacyTasks}
                  onChange={(e) => setPrivacyTasks(e.target.value as any)}
                  className="px-3 py-1.5 bg-eink-bg border border-eink-border rounded text-eink-text outline-none"
                >
                  <option value="friends">FRIENDS</option>
                  <option value="workspace">WORKSPACE</option>
                  <option value="private">PRIVATE</option>
                </select>
              </div>

              <div className="pt-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <span className="font-bold text-eink-text block">Productivity Statistics</span>
                  <span className="text-[11px] text-eink-textMuted">Completion velocity and weekly summaries</span>
                </div>
                <select
                  value={privacyStats}
                  onChange={(e) => setPrivacyStats(e.target.value as any)}
                  className="px-3 py-1.5 bg-eink-bg border border-eink-border rounded text-eink-text outline-none"
                >
                  <option value="private">PRIVATE</option>
                  <option value="friends">FRIENDS</option>
                  <option value="workspace">WORKSPACE</option>
                </select>
              </div>
            </div>

            <div className="pt-4 border-t border-eink-border flex justify-end">
              <button
                onClick={handleSaveSettings}
                className="px-4 py-2 bg-eink-text text-eink-bg font-bold rounded-sm shadow-eink-sm"
              >
                SAVE PRIVACY PREFERENCES
              </button>
            </div>
          </div>
        </div>
      )}

      {/* NOTIFICATIONS TAB */}
      {activeTab === 'notifications' && (
        <div className="space-y-4 font-technical text-xs">
          <div className="p-6 bg-eink-surface border border-eink-border rounded-sm space-y-4">
            <h3 className="font-bold text-sm text-eink-text uppercase">DEVELOPMENT NOTIFICATIONS</h3>
            
            <div className="space-y-3 pt-2">
              <label className="flex items-center justify-between p-3 bg-eink-bg border border-eink-border rounded-sm cursor-pointer">
                <div>
                  <span className="font-bold text-eink-text block">✕ BUILD FAILED Alert</span>
                  <span className="text-[11px] text-eink-textMuted">Notify when a linked branch fails CI tests</span>
                </div>
                <input type="checkbox" defaultChecked className="w-4 h-4 accent-eink-text" />
              </label>

              <label className="flex items-center justify-between p-3 bg-eink-bg border border-eink-border rounded-sm cursor-pointer">
                <div>
                  <span className="font-bold text-eink-text block">✓ BUILD RECOVERED Notice</span>
                  <span className="text-[11px] text-eink-textMuted">Notify when a subsequent commit fixes failing CI</span>
                </div>
                <input type="checkbox" defaultChecked className="w-4 h-4 accent-eink-text" />
              </label>

              <label className="flex items-center justify-between p-3 bg-eink-bg border border-eink-border rounded-sm cursor-pointer">
                <div>
                  <span className="font-bold text-eink-text block">→ PR Review & Comment Activity</span>
                  <span className="text-[11px] text-eink-textMuted">When collaborators mention you or comment on tasks</span>
                </div>
                <input type="checkbox" defaultChecked className="w-4 h-4 accent-eink-text" />
              </label>
            </div>
          </div>
        </div>
      )}

      {/* ACCOUNT TAB */}
      {activeTab === 'account' && (
        <div className="space-y-4 font-technical text-xs">
          <div className="p-6 bg-eink-surface border border-eink-border rounded-sm space-y-4">
            <h3 className="font-bold text-sm text-eink-text uppercase">DEVELOPER PROFILE</h3>

            <div className="space-y-3">
              <div>
                <label className="block text-[11px] text-eink-textMuted uppercase mb-1">Full Name</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full px-3 py-2 bg-eink-bg border border-eink-border rounded-sm text-xs font-sans"
                />
              </div>

              <div>
                <label className="block text-[11px] text-eink-textMuted uppercase mb-1">Technical Bio</label>
                <textarea
                  value={bio}
                  onChange={(e) => setBio(e.target.value)}
                  rows={2}
                  className="w-full px-3 py-2 bg-eink-bg border border-eink-border rounded-sm text-xs font-sans resize-none"
                />
              </div>
            </div>

            <div className="pt-2 flex justify-end">
              <button
                onClick={handleSaveSettings}
                className="px-4 py-2 bg-eink-text text-eink-bg font-bold rounded-sm shadow-eink-sm"
              >
                UPDATE PROFILE
              </button>
            </div>
          </div>

          {/* DANGER ZONE: DELETE ACCOUNT */}
          <div className="p-6 bg-eink-surface border-2 border-red-500/60 rounded-sm space-y-4">
            <div className="flex items-center gap-2 text-red-600">
              <span className="font-bold text-sm uppercase tracking-wider">DANGER ZONE</span>
            </div>

            <div className="space-y-1">
              <h4 className="font-bold text-xs text-eink-text uppercase">PERMANENTLY DELETE ACCOUNT</h4>
              <p className="text-[11px] text-eink-textSecondary font-sans leading-relaxed">
                Permanently delete your SHIORI developer profile, your connected workspaces, tasks, repository bindings, and collaborator sessions. This action is irreversible.
              </p>
            </div>

            {showDeleteConfirm ? (
              <div className="p-4 bg-eink-bg border border-red-500/50 rounded-sm space-y-3 animate-fade-in">
                <p className="text-xs font-bold text-red-600">
                  Are you absolutely sure? All your workspaces, projects, and task records will be permanently removed.
                </p>
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleDeleteAccount}
                    disabled={isDeleting}
                    className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white font-bold text-xs rounded-sm transition-colors shadow-sm"
                  >
                    {isDeleting ? 'DELETING ACCOUNT...' : 'YES, PERMANENTLY DELETE MY ACCOUNT'}
                  </button>
                  <button
                    onClick={() => setShowDeleteConfirm(false)}
                    disabled={isDeleting}
                    className="px-3 py-2 border border-eink-border text-eink-text hover:bg-eink-surface text-xs font-bold rounded-sm transition-colors"
                  >
                    CANCEL
                  </button>
                </div>
              </div>
            ) : (
              <div className="pt-1">
                <button
                  type="button"
                  onClick={() => setShowDeleteConfirm(true)}
                  className="px-4 py-2 border-2 border-red-500/60 text-red-600 hover:bg-red-500 hover:text-white font-bold text-xs rounded-sm transition-colors"
                >
                  DELETE ACCOUNT
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* PWA TAB */}
      {activeTab === 'pwa' && (
        <div className="space-y-4 font-technical text-xs">
          <div className="p-6 bg-eink-surface border border-eink-border rounded-sm space-y-4">
            <div className="flex items-center gap-3">
              <Smartphone className="w-6 h-6 text-eink-text" />
              <div>
                <h3 className="font-bold text-sm text-eink-text uppercase">PROGRESSIVE WEB APP</h3>
                <p className="text-[11px] text-eink-textMuted">Offline application shell & desktop/mobile installation</p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 text-xs">
              <div className="p-3 bg-eink-bg border border-eink-border rounded-sm">
                <span className="text-[10px] text-eink-textMuted uppercase block">SERVICE WORKER</span>
                <span className="font-bold text-eink-text">✓ REGISTERED</span>
              </div>
              <div className="p-3 bg-eink-bg border border-eink-border rounded-sm">
                <span className="text-[10px] text-eink-textMuted uppercase block">OFFLINE SHELL</span>
                <span className="font-bold text-eink-text">✓ CACHED (v1)</span>
              </div>
              <div className="p-3 bg-eink-bg border border-eink-border rounded-sm">
                <span className="text-[10px] text-eink-textMuted uppercase block">MANIFEST</span>
                <span className="font-bold text-eink-text">✓ VALID</span>
              </div>
            </div>

            <p className="text-[11px] text-eink-textSecondary leading-relaxed pt-2">
              SHIORI is configured with a standalone display mode and background sync. You can install this app directly on macOS, Windows, Linux, Android, and iOS devices.
            </p>
          </div>
        </div>
      )}
    </div>
  );
};
