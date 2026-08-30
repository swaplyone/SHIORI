import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, Check } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useMorphBar } from '../../context/MorphBarContext';

export const OpeningAnimation: React.FC<{ onComplete?: () => void }> = ({ onComplete }) => {
  const { isAuthenticated } = useAuth();
  const { setIsBarVisible } = useMorphBar();
  const navigate = useNavigate();

  // Animation Sequence Stages:
  // 0 (0.0s): Blank warm paper
  // 1 (0.3s): Fine ink baseline appears
  // 2 (0.5s - 1.5s): Progressive e-ink waveform / line drawing of Japanese desk scene
  // 3 (1.5s): Desk complete
  // 4 (2.0s): SHIORI identity appears
  // 5 (2.3s): "Work. Remembered." tagline appears
  // 6 (2.5s): Micro task "□ Fix authentication" appears
  // 7 (2.8s): Micro git activity "✓ 8f42c1" resolves into "✓ Fix authentication"
  // 8 (3.0s): Settle into calm static state with "OPEN SHIORI →"
  const [animStage, setAnimStage] = useState<number>(0);
  const [inkFlash, setInkFlash] = useState<boolean>(false);
  const [isEntering, setIsEntering] = useState<boolean>(false);

  const triggerInkRefresh = () => {
    setInkFlash(true);
    setTimeout(() => setInkFlash(false), 90);
  };

  useEffect(() => {
    // Keep floating MorphBar hidden on the quiet welcome page
    setIsBarVisible(false);

    // Sequence timing
    const t1 = setTimeout(() => setAnimStage(1), 300);
    const t2 = setTimeout(() => {
      setAnimStage(2);
      triggerInkRefresh();
    }, 500);
    const t3 = setTimeout(() => setAnimStage(3), 1500);
    const t4 = setTimeout(() => setAnimStage(4), 2000);
    const t5 = setTimeout(() => setAnimStage(5), 2300);
    const t6 = setTimeout(() => setAnimStage(6), 2500);
    const t7 = setTimeout(() => {
      setAnimStage(7);
      triggerInkRefresh();
    }, 2850);
    const t8 = setTimeout(() => setAnimStage(8), 3100);

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
    };
  }, [setIsBarVisible]);

  const handleOpenShiori = () => {
    if (isEntering) return;
    setIsEntering(true);
    triggerInkRefresh();

    setTimeout(() => {
      if (isAuthenticated) {
        navigate('/home');
      } else {
        navigate('/login');
      }
      if (onComplete) onComplete();
    }, 140);
  };

  return (
    <div className="relative w-full min-h-screen bg-[#F5F4EE] text-[#111111] font-sans select-none overflow-hidden flex flex-col justify-between p-6 sm:p-10 md:p-14">
      {/* Subtle E-Ink Screen Flash Waveform on refreshes */}
      {inkFlash && (
        <div className="fixed inset-0 bg-[#111111]/12 pointer-events-none z-50 transition-opacity duration-75" />
      )}

      {/* Subtle paper grain texture overlay */}
      <div
        className="fixed inset-0 pointer-events-none opacity-[0.035] mix-blend-multiply"
        style={{
          backgroundImage: `radial-gradient(#111111 1px, transparent 1px)`,
          backgroundSize: '16px 16px'
        }}
      />

      {/* TOP: Subtle Japanese Editorial Header Tag */}
      <header className="relative z-10 w-full flex items-center justify-between text-[11px] font-mono tracking-widest text-[#777770] uppercase">
        <div className="flex items-center gap-2">
          <span>栞</span>
          <span>·</span>
          <span>SHIORI</span>
        </div>
        <span className="text-[10px] tracking-widest text-[#999990]">A SwaplyOne product</span>
      </header>

      {/* CENTER: Main Cohesive Full-Screen Editorial Composition */}
      <main className="relative z-10 w-full max-w-6xl mx-auto my-auto flex flex-col lg:flex-row items-center justify-center lg:justify-between gap-10 lg:gap-16 py-4">
        {/* Left / Center-Left: Delicate Japanese Workspace Line-Art Artwork */}
        <div className="w-full max-w-md sm:max-w-lg lg:max-w-xl flex items-center justify-center relative">
          {/* Initial Baseline Guide during 0.3s–0.5s */}
          {animStage >= 1 && (
            <div
              className={`absolute bottom-6 left-10 right-10 h-[1px] bg-[#111111]/15 transition-all duration-700 ${
                animStage >= 2 ? 'opacity-0 scale-x-105' : 'opacity-100 scale-x-100'
              }`}
            />
          )}

          {/* Line-Art Illustration with Progressive E-Ink Refresh Waveform Reveal */}
          <div
            className={`relative w-full aspect-4/3 flex items-center justify-center transition-all duration-700 ease-out ${
              animStage >= 2 ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-3'
            }`}
          >
            <img
              src="/exact-desk-light.png"
              alt="SHIORI Quiet Workspace Illustration"
              className={`w-full h-full object-contain mix-blend-multiply select-none pointer-events-none transition-all duration-500 ${
                animStage === 2 ? 'opacity-80' : 'opacity-100'
              }`}
            />
          </div>
        </div>

        {/* Right / Center-Right: Editorial Typography & Minimal Entrance Interaction */}
        <div className="w-full max-w-sm lg:max-w-md flex flex-col items-center lg:items-start text-center lg:text-left space-y-6">
          {/* SHIORI Single-Line Title */}
          <div
            className={`transition-all duration-500 ease-out ${
              animStage >= 4 ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2'
            }`}
          >
            <h1 className="font-mono text-3xl sm:text-4xl md:text-5xl font-bold tracking-[0.28em] uppercase text-[#111111] whitespace-nowrap leading-none">
              SHIORI
            </h1>
          </div>

          {/* Tagline: Work. Remembered. */}
          <div
            className={`transition-all duration-500 ease-out ${
              animStage >= 5 ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2'
            }`}
          >
            <p className="font-serif italic text-sm sm:text-base tracking-widest text-[#555550]">
              Work. Remembered.
            </p>
          </div>

          {/* Micro Task Demonstration: TODO → Git activity → verified work */}
          <div
            className={`min-h-[28px] flex items-center transition-all duration-500 ease-out ${
              animStage >= 6 ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2'
            }`}
          >
            {animStage === 6 && (
              <div className="flex items-center gap-2 text-xs font-mono text-[#666660] animate-fade-in">
                <span className="w-3 h-3 border border-[#666660] inline-block rounded-[1px]" />
                <span>Fix authentication</span>
              </div>
            )}

            {animStage >= 7 && (
              <div className="flex items-center gap-2 text-xs font-mono text-[#111111] animate-fade-in">
                <span className="w-3.5 h-3.5 bg-[#111111] text-[#F5F4EE] rounded-[1px] flex items-center justify-center text-[10px]">
                  <Check className="w-2.5 h-2.5 stroke-[2.5]" />
                </span>
                <span className="font-semibold">Fix authentication</span>
                <span className="text-[10px] text-[#777770] font-mono tracking-tight">· 8f42c1</span>
              </div>
            )}
          </div>

          {/* Minimal Printed Entrance Control: OPEN SHIORI → */}
          <div
            className={`pt-3 transition-all duration-700 ease-out ${
              animStage >= 8 ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-3 pointer-events-none'
            }`}
          >
            <button
              onClick={handleOpenShiori}
              disabled={isEntering}
              className="group relative inline-flex items-center gap-3 py-2 text-xs sm:text-sm font-mono tracking-[0.22em] uppercase font-bold text-[#111111] hover:text-[#000000] cursor-pointer transition-all duration-150"
            >
              <span className="border-b border-[#111111]/40 group-hover:border-[#111111] pb-0.5 transition-colors">
                OPEN SHIORI
              </span>
              <ArrowRight className="w-3.5 h-3.5 transition-transform duration-200 group-hover:translate-x-1.5" />
            </button>
          </div>
        </div>
      </main>

      {/* BOTTOM: Minimal Editorial Footer */}
      <footer className="relative z-10 w-full flex items-center justify-between text-[10px] font-mono text-[#999990] tracking-widest uppercase">
        <span>Quiet Workspace</span>
        <span>Electronic Paper</span>
      </footer>
    </div>
  );
};
