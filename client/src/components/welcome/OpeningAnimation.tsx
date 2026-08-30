import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, Check, Volume2, VolumeX } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useMorphBar } from '../../context/MorphBarContext';
import { useShioriWelcomeSound } from '../../hooks/useShioriWelcomeSound';
import { isStandaloneMode } from '../../utils/pwa';

export const OpeningAnimation: React.FC<{ onComplete?: () => void }> = ({ onComplete }) => {
  const { isAuthenticated } = useAuth();
  const { setIsBarVisible } = useMorphBar();
  const navigate = useNavigate();

  // Check prefers-reduced-motion
  const prefersReducedMotion = useMemo(() => {
    if (typeof window === 'undefined') return false;
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }, []);

  const { soundEnabled, toggleSound, playStageSound, playEntranceSound } = useShioriWelcomeSound({
    prefersReducedMotion,
  });

  // Animation Timeline States:
  // 0: Initial blank e-ink paper
  // 1 (0.0s - 0.4s): E-ink power-on waveform activation
  // 2 (0.4s - 1.5s): Progressive illustration ink drawing reveal
  // 3 (1.3s - 1.9s): Sequential character reveal for SHIORI
  // 4 (1.8s - 2.2s): Tagline ink settle
  // 5 (2.1s - 2.8s): Micro-task □ Fix authentication + Git commit appear
  // 6 (2.6s): Task auto-completes into ✓ Fix authentication with commit emphasis
  // 7 (2.7s - 3.2s): OPEN SHIORI reveals with ink-drawn underline
  // 8 (> 3.2s): Final static quiet state
  const [stage, setStage] = useState<number>(prefersReducedMotion ? 8 : 0);
  const [shioriCharCount, setShioriCharCount] = useState<number>(prefersReducedMotion ? 6 : 0);
  const [inkFlash, setInkFlash] = useState<boolean>(false);
  const [isEntering, setIsEntering] = useState<boolean>(false);
  const [entryPhase, setEntryPhase] = useState<'idle' | 'refreshing' | 'ghosting'>('idle');

  const fullShioriTitle = 'SHIORI';

  useEffect(() => {
    // Keep floating MorphBar hidden on the quiet welcome page
    setIsBarVisible(false);

    if (prefersReducedMotion) {
      setStage(8);
      setShioriCharCount(6);
      return () => setIsBarVisible(true);
    }

    // --- TIMELINE SEQUENCE ---
    // 0.0s: Start E-Ink power-on activation
    setStage(1);

    // 0.4s: Start progressive line-art ink drawing + soft paper rustle
    const tIllustration = setTimeout(() => {
      setStage(2);
      playStageSound(2);
    }, 400);

    // 1.3s - 1.9s: Sequential letter reveal for SHIORI + delicate ink/pencil stroke
    const tShioriStart = setTimeout(() => {
      setStage(3);
      playStageSound(3);
      for (let i = 1; i <= 6; i++) {
        setTimeout(() => {
          setShioriCharCount(i);
        }, (i - 1) * 105);
      }
    }, 1300);

    // 1.8s: Tagline reveals
    const tTagline = setTimeout(() => {
      setStage(4);
    }, 1800);

    // 2.1s: Micro task appears (□ Fix authentication · 8f42c1)
    const tTask = setTimeout(() => {
      setStage(5);
    }, 2100);

    // 2.6s: Task transitions into verified state + tactile ink settle click
    const tTaskVerified = setTimeout(() => {
      setStage(6);
      playStageSound(6);
      setInkFlash(true);
      setTimeout(() => setInkFlash(false), 90);
    }, 2600);

    // 2.7s: OPEN SHIORI reveals with drawn underline
    const tOpen = setTimeout(() => {
      setStage(7);
    }, 2750);

    // 3.2s: Complete stillness
    const tFinal = setTimeout(() => {
      setStage(8);
    }, 3200);

    return () => {
      clearTimeout(tIllustration);
      clearTimeout(tShioriStart);
      clearTimeout(tTagline);
      clearTimeout(tTask);
      clearTimeout(tTaskVerified);
      clearTimeout(tOpen);
      clearTimeout(tFinal);
      setIsBarVisible(true);
    };
  }, [setIsBarVisible, prefersReducedMotion, playStageSound]);

  // Handle Entrance Transition: 350-450ms physical e-ink waveform refresh + ghosting + page turn sound
  const handleOpenShiori = () => {
    if (isEntering) return;
    setIsEntering(true);
    setEntryPhase('refreshing');
    playEntranceSound();

    // 150ms: Refresh waveform
    setTimeout(() => {
      setEntryPhase('ghosting');
    }, 150);

    // 380ms: Route to application (or Install Gateway if in normal browser)
    setTimeout(() => {
      const isStandalone = isStandaloneMode();
      if (!isStandalone) {
        navigate('/install');
      } else if (isAuthenticated) {
        navigate('/home');
      } else {
        navigate('/login');
      }
      if (onComplete) onComplete();
    }, 380);
  };

  return (
    <div className="relative w-full min-h-screen bg-[#F5F4EE] text-[#111111] font-sans select-none overflow-hidden flex flex-col justify-between p-6 sm:p-10 md:p-14">
      {/* 1. Subtle Paper Grain Texture Overlay */}
      <div
        className="fixed inset-0 pointer-events-none opacity-[0.035] mix-blend-multiply"
        style={{
          backgroundImage: `radial-gradient(#111111 1px, transparent 1px)`,
          backgroundSize: '16px 16px'
        }}
      />

      {/* 2. E-Ink Power-On Activation Waveform (0.0s - 0.4s) */}
      {stage === 1 && (
        <div className="fixed inset-0 pointer-events-none z-50 overflow-hidden">
          <div className="w-full h-full bg-[#111111]/[0.06] animate-pulse" />
          <div className="absolute inset-0 bg-linear-to-b from-transparent via-[#111111]/[0.08] to-transparent h-16 w-full animate-[scan_0.4s_ease-out]" />
        </div>
      )}

      {/* 3. Micro In-Task E-Ink Flash */}
      {inkFlash && (
        <div className="fixed inset-0 bg-[#111111]/[0.08] pointer-events-none z-50 transition-opacity duration-75" />
      )}

      {/* 4. Full Page Entrance Transition Waveform (380ms E-Ink Refresh) */}
      {entryPhase === 'refreshing' && (
        <div className="fixed inset-0 bg-[#111111]/25 z-50 pointer-events-none transition-all duration-100" />
      )}
      {entryPhase === 'ghosting' && (
        <div className="fixed inset-0 bg-[#F5F4EE]/90 z-50 pointer-events-none backdrop-blur-[0.5px] transition-all duration-150" />
      )}

      {/* TOP: Subtle Japanese Editorial Header Tag + Sound Toggle */}
      <header
        className={`relative z-10 w-full flex items-center justify-between text-[11px] font-mono tracking-widest text-[#777770] uppercase transition-opacity duration-700 ${
          stage >= 2 ? 'opacity-100' : 'opacity-0'
        }`}
      >
        <div className="flex items-center gap-2">
          <span>栞</span>
          <span>·</span>
          <span>SHIORI</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="hidden sm:inline text-[10px] tracking-widest text-[#999990]">A SwaplyOne product</span>
          <button
            onClick={toggleSound}
            className="flex items-center gap-1.5 px-2 py-0.5 border border-[#B8B7B1]/60 hover:border-[#111111] bg-[#F5F4EE] hover:bg-[#EAE9E3] text-[#777770] hover:text-[#111111] rounded-xs transition-colors text-[9px] font-mono tracking-wider cursor-pointer"
            aria-label={soundEnabled ? "Disable welcome sound effects" : "Enable welcome sound effects"}
            title={soundEnabled ? "Sound ON (Click to mute)" : "Sound OFF (Click to unmute)"}
          >
            {soundEnabled ? <Volume2 className="w-3 h-3 text-[#111111]" /> : <VolumeX className="w-3 h-3 text-[#999990]" />}
            <span className="hidden sm:inline">{soundEnabled ? 'SOUND ON' : 'SOUND OFF'}</span>
          </button>
        </div>
      </header>

      {/* CENTER: Main Cohesive Full-Screen Composition */}
      <main className="relative z-10 w-full max-w-6xl mx-auto my-auto flex flex-col lg:flex-row items-center justify-center lg:justify-between gap-10 lg:gap-16 py-4">
        {/* Left / Center-Left: Japanese Desk Illustration (Progressive Ink Drawing Reveal 0.4s - 1.5s) */}
        <div className="w-full max-w-md sm:max-w-lg lg:max-w-xl flex items-center justify-center relative">
          <div className="relative w-full aspect-4/3 flex items-center justify-center overflow-hidden">
            {/* Progressive Ink Mask: Revealing bottom-to-top like physical ink drawing */}
            <div
              className="relative w-full h-full flex items-center justify-center transition-all duration-1000 ease-out"
              style={{
                clipPath:
                  stage === 0 || stage === 1
                    ? 'inset(100% 0% 0% 0%)'
                    : stage === 2
                    ? 'inset(0% 0% 0% 0%)'
                    : 'inset(0% 0% 0% 0%)',
                opacity: stage >= 2 ? 1 : 0
              }}
            >
              <img
                src="/exact-desk-light.png"
                alt="SHIORI Quiet Workspace Illustration"
                className={`w-full h-full object-contain mix-blend-multiply select-none pointer-events-none transition-all duration-700 ${
                  stage === 2 ? 'filter contrast-150 blur-[0.2px]' : 'filter contrast-100 blur-0'
                }`}
              />

              {/* Ink drawing line sweep during 0.4s - 1.5s */}
              {stage === 2 && (
                <div className="absolute inset-0 pointer-events-none bg-linear-to-b from-transparent via-[#111111]/[0.05] to-transparent animate-pulse" />
              )}
            </div>
          </div>
        </div>

        {/* Right / Center-Right: Editorial Typography, Micro-Task & Open Control */}
        <div className="w-full max-w-sm lg:max-w-md flex flex-col items-center lg:items-start text-center lg:text-left space-y-6">
          {/* SHIORI Single-Line Sequential Ink Reveal (1.3s - 1.9s) */}
          <div className="min-h-[48px] flex items-center">
            <h1
              className="font-mono text-3xl sm:text-4xl md:text-5xl font-bold tracking-[0.28em] uppercase text-[#111111] whitespace-nowrap leading-none transition-opacity duration-300"
              style={{ opacity: stage >= 3 ? 1 : 0 }}
            >
              {fullShioriTitle.slice(0, shioriCharCount)}
              {/* Invisible spacer to guarantee exact single-line width stability during reveal */}
              <span className="opacity-0">
                {fullShioriTitle.slice(shioriCharCount)}
              </span>
            </h1>
          </div>

          {/* Tagline: Work. Remembered. (1.8s - 2.2s) */}
          <div
            className={`transition-all duration-700 ease-out ${
              stage >= 4 ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2'
            }`}
          >
            <p className="font-serif italic text-sm sm:text-base tracking-widest text-[#555550]">
              Work. Remembered.
            </p>
          </div>

          {/* Micro Task & Git Demonstration (2.1s - 2.8s: TODO → Git → Verified) */}
          <div
            className={`min-h-[28px] flex items-center transition-all duration-500 ease-out ${
              stage >= 5 ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2'
            }`}
          >
            {stage === 5 && (
              <div className="flex items-center gap-2 text-xs font-mono text-[#666660] animate-fade-in">
                <span className="w-3 h-3 border border-[#666660] inline-block rounded-[1px]" />
                <span>Fix authentication</span>
                <span className="text-[10px] text-[#888880] font-mono">· 8f42c1</span>
              </div>
            )}

            {stage >= 6 && (
              <div className="flex items-center gap-2 text-xs font-mono text-[#111111] animate-fade-in">
                <span className="w-3.5 h-3.5 bg-[#111111] text-[#F5F4EE] rounded-[1px] flex items-center justify-center text-[10px]">
                  <Check className="w-2.5 h-2.5 stroke-[2.5]" />
                </span>
                <span className="font-semibold">Fix authentication</span>
                <span className="text-[10px] text-[#111111] font-mono font-bold tracking-tight bg-[#111111]/[0.08] px-1 py-0.2 rounded-xs">
                  · 8f42c1
                </span>
              </div>
            )}
          </div>

          {/* Minimal Printed Entrance Control: OPEN SHIORI → (2.7s - 3.2s) */}
          <div
            className={`pt-3 transition-all duration-700 ease-out ${
              stage >= 7 ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-3 pointer-events-none'
            }`}
          >
            <button
              onClick={handleOpenShiori}
              disabled={isEntering}
              className="group relative inline-flex items-center gap-3 py-2 text-xs sm:text-sm font-mono tracking-[0.22em] uppercase font-bold text-[#111111] hover:text-[#000000] cursor-pointer transition-all duration-150"
            >
              <span className="relative pb-0.5">
                OPEN SHIORI
                {/* Drawn ink-stroke underline */}
                <span
                  className={`absolute bottom-0 left-0 right-0 h-[1.5px] bg-[#111111] origin-left transition-transform duration-500 ease-out ${
                    stage >= 7 ? 'scale-x-100' : 'scale-x-0'
                  }`}
                />
              </span>
              <ArrowRight className="w-3.5 h-3.5 transition-transform duration-200 group-hover:translate-x-1" />
            </button>
          </div>
        </div>
      </main>

      {/* BOTTOM: Minimal Editorial Footer */}
      <footer
        className={`relative z-10 w-full flex items-center justify-between text-[10px] font-mono text-[#999990] tracking-widest uppercase transition-opacity duration-700 ${
          stage >= 2 ? 'opacity-100' : 'opacity-0'
        }`}
      >
        <span>Quiet Workspace</span>
        <span>Electronic Paper</span>
      </footer>
    </div>
  );
};
