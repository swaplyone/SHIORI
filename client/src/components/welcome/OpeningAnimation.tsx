import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  Check,
  GitCommit,
  CheckSquare,
  Sparkles,
  ShieldCheck,
  BookOpen
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useMorphBar } from '../../context/MorphBarContext';

export const OpeningAnimation: React.FC<{ onComplete?: () => void }> = ({ onComplete }) => {
  const { demoLogin } = useAuth();
  const { setBarPosition, setIsBarVisible, setIsExpanded } = useMorphBar();
  const navigate = useNavigate();

  // Sequence stages:
  // 0: Blank screen
  // 1: Notebook outline appears (0.3s)
  // 2: Notebook opens slightly (0.7s)
  // 3: Notebook fades into background (1.3s)
  // 4: Blinking cursor & typing 'SHIORI' (1.6s)
  // 5: Typing 'Work. Remembered.' (2.4s)
  // 6: E-ink screen refresh waveform (3.2s)
  // 7: Core demonstration: TODO -> GIT -> DONE (3.6s)
  // 8: Final calm welcome state with [ ENTER ] (5.5s)
  const [stage, setStage] = useState<number>(0);
  const [typedTitle, setTypedTitle] = useState<string>('');
  const [typedSubtitle, setTypedSubtitle] = useState<string>('');
  const [inkFlash, setInkFlash] = useState<boolean>(false);
  const [isEntering, setIsEntering] = useState<boolean>(false);

  const triggerInkRefresh = () => {
    setInkFlash(true);
    setTimeout(() => setInkFlash(false), 120);
  };

  useEffect(() => {
    // Hide floating MorphBar during welcome sequence
    setIsBarVisible(false);

    // 1. Closed notebook outline (0.3s)
    const t1 = setTimeout(() => {
      setStage(1);
    }, 300);

    // 2. Notebook opens slightly (0.7s)
    const t2 = setTimeout(() => {
      setStage(2);
    }, 750);

    // 3. Notebook fades into background (1.3s)
    const t3 = setTimeout(() => {
      setStage(3);
    }, 1300);

    // 4. Cursor & typing 'SHIORI' (1.6s)
    const t4 = setTimeout(() => {
      setStage(4);
      const title = 'SHIORI';
      let i = 0;
      const interval = setInterval(() => {
        if (i <= title.length) {
          setTypedTitle(title.slice(0, i));
          i++;
        } else {
          clearInterval(interval);
        }
      }, 70);
    }, 1600);

    // 5. Typing subtitle 'Work. Remembered.' (2.4s)
    const t5 = setTimeout(() => {
      setStage(5);
      const subtitle = 'Work. Remembered.';
      let j = 0;
      const subInterval = setInterval(() => {
        if (j <= subtitle.length) {
          setTypedSubtitle(subtitle.slice(0, j));
          j++;
        } else {
          clearInterval(subInterval);
        }
      }, 45);
    }, 2400);

    // 6. E-ink refresh effect (3.4s)
    const t6 = setTimeout(() => {
      setStage(6);
      triggerInkRefresh();
    }, 3400);

    // 7. Core demonstration: TODO -> GIT -> DONE (3.8s)
    const t7 = setTimeout(() => {
      setStage(7);
    }, 3800);

    // 8. Final welcome state with [ ENTER ] (5.6s)
    const t8 = setTimeout(() => {
      setStage(8);
      triggerInkRefresh();
    }, 5600);

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
      clearTimeout(t4);
      clearTimeout(t5);
      clearTimeout(t6);
      clearTimeout(t7);
      clearTimeout(t8);
      setIsBarVisible(true);
      setBarPosition('top');
    };
  }, [setIsBarVisible, setBarPosition]);

  const handleEnter = () => {
    triggerInkRefresh();
    setIsBarVisible(true);
    setBarPosition('top');
    setIsEntering(true);
  };

  const handleQuickDemo = async () => {
    await demoLogin();
    navigate('/home');
    if (onComplete) onComplete();
  };

  const handleSkip = () => {
    setStage(8);
    setTypedTitle('SHIORI');
    setTypedSubtitle('Work. Remembered.');
    triggerInkRefresh();
  };

  return (
    <div className="relative w-full min-h-screen bg-eink-bg text-eink-text flex flex-col items-center justify-center p-6 select-none font-sans overflow-hidden">
      {/* Subtle E-Ink Paper Texture */}
      <div className="absolute inset-0 bg-paper-texture opacity-3 pointer-events-none" />

      {/* Hardware-like subtle E-Ink Screen Flash Waveform */}
      {inkFlash && (
        <div className="absolute inset-0 bg-eink-text/10 pointer-events-none z-50 transition-opacity duration-75" />
      )}

      {/* Skip action in top right */}
      {stage < 8 && (
        <button
          onClick={handleSkip}
          className="absolute top-6 right-6 text-[10px] font-technical text-eink-textMuted hover:text-eink-text uppercase tracking-widest transition-colors"
        >
          [ SKIP INTRO ]
        </button>
      )}

      {/* Brand logo reference top center */}
      <div className="absolute top-8 left-8 flex items-center gap-2 font-technical text-xs text-eink-textMuted">
        <span className="font-bold tracking-widest text-[11px] text-eink-text uppercase">SHIORI</span>
        <span className="text-[9px] opacity-40">|</span>
        <span className="text-[10px]">A SwaplyOne product</span>
      </div>

      {/* MAIN ANIMATION CONTAINER */}
      <div className="relative w-full max-w-md flex flex-col items-center justify-center text-center min-h-[320px]">
        {/* 1. SUBTLE NOTEBOOK OPENING SILHOUETTE (Stage 1 to 3: ~1.2s total) */}
        {stage >= 1 && stage <= 3 && (
          <div
            className={`transition-all duration-500 ease-out flex flex-col items-center justify-center ${
              stage === 3 ? 'opacity-0 scale-105' : 'opacity-100 scale-100'
            }`}
          >
            <svg
              width="64"
              height="80"
              viewBox="0 0 64 80"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              className="text-eink-text stroke-current"
            >
              {/* Spine line */}
              <line x1="32" y1="12" x2="32" y2="68" strokeWidth="1.5" strokeLinecap="round" />

              {/* Left Cover */}
              <path
                d="M 32 12 C 26 12, 14 10, 10 12 L 10 68 C 14 66, 26 68, 32 68"
                strokeWidth="1.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />

              {/* Right Cover (opens slightly in stage 2) */}
              <path
                d={
                  stage === 1
                    ? 'M 32 12 C 38 12, 50 10, 54 12 L 54 68 C 50 66, 38 68, 32 68'
                    : 'M 32 12 C 39 10, 52 7, 56 10 L 56 66 C 52 63, 39 66, 32 68'
                }
                strokeWidth="1.2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="transition-all duration-500 ease-out"
              />

              {/* Inside page reveal line */}
              {stage >= 2 && (
                <path
                  d="M 32 16 C 36 14, 46 12, 50 14 L 50 64 C 46 62, 36 64, 32 65"
                  strokeWidth="0.8"
                  strokeDasharray="2 2"
                  className="animate-fade-in"
                />
              )}
            </svg>
            <span className="text-[9px] font-technical tracking-widest text-eink-textMuted uppercase mt-3">
              opening notebook
            </span>
          </div>
        )}

        {/* 2. TYPED LOGO & SUBTITLE (Stage 4+) */}
        {stage >= 4 && (
          <div className="space-y-3 animate-fade-in">
            {/* Title with blinking cursor */}
            <div className="flex items-center justify-center gap-1.5">
              <h1 className="font-technical text-3xl sm:text-4xl font-bold tracking-tight text-eink-text uppercase leading-none">
                {typedTitle}
              </h1>
              {stage < 8 && <span className="w-2 h-7 bg-eink-text inline-block animate-pulse" />}
            </div>

            {/* Subtitle */}
            <p className="font-sans text-xs sm:text-sm text-eink-textSecondary tracking-wide min-h-[20px]">
              {typedSubtitle}
            </p>
          </div>
        )}

        {/* 3. CORE SHIORI DEMONSTRATION (Stage 7) */}
        {stage === 7 && (
          <div className="mt-8 p-4 bg-eink-surface border border-eink-border rounded-sm font-technical text-xs space-y-2.5 w-full max-w-xs animate-fade-in shadow-eink-sm">
            <div className="flex items-center justify-between text-left border-b border-eink-border pb-1.5">
              <span className="text-[10px] text-eink-textMuted uppercase font-bold">TODO</span>
              <span className="font-bold text-eink-text">Fix authentication</span>
            </div>

            <div className="flex items-center justify-center text-eink-textMuted">
              <span className="text-xs">↓</span>
            </div>

            <div className="flex items-center justify-between text-left border-b border-eink-border pb-1.5">
              <span className="text-[10px] text-eink-textMuted uppercase font-bold">GIT</span>
              <span className="font-mono text-eink-text">fix authentication flow</span>
            </div>

            <div className="flex items-center justify-center text-eink-textMuted">
              <span className="text-xs">↓</span>
            </div>

            <div className="flex items-center justify-center gap-1.5 text-eink-text font-bold text-[11px] pt-0.5">
              <Check className="w-3.5 h-3.5" />
              <span>✓ AUTO COMPLETED</span>
            </div>
          </div>
        )}

        {/* 4. FINAL WELCOME STATE WITH [ ENTER ] (Stage 8) */}
        {stage === 8 && !isEntering && (
          <div className="mt-10 space-y-4 animate-fade-in">
            <button
              onClick={handleEnter}
              className="px-8 py-3 bg-eink-text text-eink-bg font-technical font-bold text-xs uppercase tracking-widest rounded-sm shadow-eink-card hover:opacity-90 active:scale-[0.98] transition-all"
            >
              [ ENTER ]
            </button>
          </div>
        )}

        {/* 5. ENTER TRANSITION: AWAKENED MORPH BAR CONTROLS */}
        {isEntering && (
          <div className="mt-8 p-5 bg-eink-surface border-2 border-eink-text rounded-sm w-full max-w-sm font-technical space-y-4 animate-fade-in shadow-2xl">
            <div className="border-b border-eink-border pb-2 flex items-center justify-between">
              <span className="text-xs font-bold text-eink-text uppercase tracking-wider">
                SHIORI WORKSPACE
              </span>
              <span className="text-[9px] bg-eink-bg px-1.5 py-0.2 border border-eink-border rounded font-mono font-bold">
                READY
              </span>
            </div>

            <div className="space-y-2">
              <button
                onClick={() => navigate('/login')}
                className="w-full py-2.5 px-4 bg-eink-text text-eink-bg font-bold text-xs rounded-sm flex items-center justify-between shadow-eink-sm hover:opacity-90 transition-opacity"
              >
                <span>SIGN IN TO WORKSPACE</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>

              <button
                onClick={() => navigate('/register')}
                className="w-full py-2.5 px-4 bg-eink-bg hover:bg-eink-surface border border-eink-border text-eink-text font-bold text-xs rounded-sm flex items-center justify-between transition-colors"
              >
                <span>CREATE ACCOUNT</span>
                <span className="text-[10px] text-eink-textMuted">SHIORI ID</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Footer calm reference */}
      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 font-technical text-[10px] text-eink-textMuted tracking-wider uppercase">
        Electronic Paper Visual Architecture • Plan. Build. Verify.
      </div>
    </div>
  );
};
