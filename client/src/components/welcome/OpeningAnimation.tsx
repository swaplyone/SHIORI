import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  Square,
  Code,
  CheckCircle2,
  RotateCcw,
  UserPlus,
  LogIn,
  Sun,
  Moon,
  X
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useMorphBar } from '../../context/MorphBarContext';
import { EInkTheme } from '../../types';

import { WorkstationSvg } from './WorkstationSvg';

export const OpeningAnimation: React.FC<{ onComplete?: () => void }> = ({ onComplete }) => {
  const { user, setTheme, isAuthenticated } = useAuth();
  const { setIsBarVisible } = useMorphBar();
  const navigate = useNavigate();

  // Initialize theme from user profile or document attribute or default to dark
  const [currentTheme, setCurrentTheme] = useState<EInkTheme>(() => {
    if (user?.theme) return user.theme;
    const docTheme = document.documentElement.getAttribute('data-theme') as EInkTheme;
    if (docTheme) return docTheme;
    const saved = localStorage.getItem('shiori_theme') as EInkTheme;
    return saved || 'dark';
  });

  const [showAuthModal, setShowAuthModal] = useState<boolean>(false);
  const [inkFlash, setInkFlash] = useState<boolean>(false);

  const isDark = currentTheme === 'dark';

  const triggerInkRefresh = () => {
    setInkFlash(true);
    setTimeout(() => setInkFlash(false), 120);
  };

  const toggleTheme = () => {
    const nextTheme: EInkTheme = isDark ? 'light' : 'dark';
    setCurrentTheme(nextTheme);
    localStorage.setItem('shiori_theme', nextTheme);
    document.documentElement.setAttribute('data-theme', nextTheme);
    if (nextTheme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    if (setTheme) {
      setTheme(nextTheme);
    }
    triggerInkRefresh();
  };

  useEffect(() => {
    setIsBarVisible(false);
    return () => {
      setIsBarVisible(true);
    };
  }, [setIsBarVisible]);

  const handleEnterClick = () => {
    triggerInkRefresh();
    if (isAuthenticated) {
      navigate('/home');
      if (onComplete) onComplete();
    } else {
      setShowAuthModal(true);
    }
  };

  return (
    <div
      className={`min-h-screen transition-colors duration-300 flex items-center justify-center p-4 sm:p-8 md:p-12 font-sans select-none overflow-x-hidden relative ${
        isDark ? 'bg-[#000000] text-white' : 'bg-[#FFFFFF] text-[#111111]'
      }`}
    >
      {/* Subtle E-Ink Screen Flash Waveform */}
      {inkFlash && (
        <div
          className={`absolute inset-0 pointer-events-none z-50 transition-opacity duration-75 ${
            isDark ? 'bg-white/20' : 'bg-black/20'
          }`}
        />
      )}

      {/* Top Header Controls: Theme Switcher Toggle */}
      <div className="absolute top-6 right-6 sm:top-8 sm:right-8 flex items-center gap-3 z-20">
        <button
          onClick={toggleTheme}
          title={isDark ? 'Switch to Light Theme' : 'Switch to Dark Theme'}
          className={`px-3 py-1.5 rounded-sm border font-technical text-xs flex items-center gap-2 transition-all cursor-pointer ${
            isDark
              ? 'border-white/20 hover:border-white/60 bg-white/5 text-white/90 hover:text-white'
              : 'border-black/20 hover:border-black/60 bg-black/5 text-black/90 hover:text-black'
          }`}
        >
          {isDark ? (
            <>
              <Sun className="w-3.5 h-3.5 text-yellow-400" />
              <span className="text-[11px] tracking-wider uppercase">LIGHT MODE</span>
            </>
          ) : (
            <>
              <Moon className="w-3.5 h-3.5 text-slate-700" />
              <span className="text-[11px] tracking-wider uppercase">DARK MODE</span>
            </>
          )}
        </button>
      </div>

      {/* Main Split Grid Container */}
      <div className="w-full max-w-6xl grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-center">
        {/* Left Column: Pure Isometric Vector SVG Workstation Line Art */}
        <div className="lg:col-span-7 flex items-center justify-center p-2 sm:p-4">
          <div className="relative w-full max-w-lg lg:max-w-xl aspect-4/3 flex items-center justify-center transition-all duration-300">
            <WorkstationSvg isDark={isDark} />
          </div>
        </div>

        {/* Right Column: Technical Typography, Features & Action */}
        <div className="lg:col-span-5 flex flex-col justify-center px-4 sm:px-8 max-w-md mx-auto lg:max-w-none w-full">
          {/* Header Branding */}
          <div className="text-center lg:text-left space-y-3 mb-8">
            <h1
              className={`font-technical text-3xl sm:text-4xl lg:text-5xl font-bold tracking-[0.35em] uppercase ${
                isDark ? 'text-white' : 'text-[#111111]'
              }`}
            >
              S H I O R I
            </h1>

            {/* Thin divider with centered dot */}
            <div className="flex items-center justify-center lg:justify-start gap-3 my-2 w-full">
              <div
                className={`h-[1px] flex-1 max-w-[120px] lg:max-w-[160px] ${
                  isDark ? 'bg-white/25' : 'bg-black/25'
                }`}
              />
              <span
                className={`w-1.5 h-1.5 rounded-full inline-block ${
                  isDark ? 'bg-white' : 'bg-black'
                }`}
              />
              <div
                className={`h-[1px] flex-1 max-w-[120px] lg:max-w-[160px] ${
                  isDark ? 'bg-white/25' : 'bg-black/25'
                }`}
              />
            </div>

            {/* Sub-tagline */}
            <p
              className={`font-technical text-xs sm:text-sm tracking-[0.25em] uppercase ${
                isDark ? 'text-white/80' : 'text-black/80'
              }`}
            >
              W O R K . &nbsp; R E M E M B E R E D .
            </p>
          </div>

          {/* Feature List with Subtle Horizontal Separators */}
          <div className="space-y-4 font-technical">
            {/* Feature 1: Plan Your Work */}
            <div className="flex items-start gap-4 group">
              <div className={`mt-0.5 shrink-0 ${isDark ? 'text-white/90' : 'text-black/90'}`}>
                <Square className="w-5 h-5 stroke-[1.5]" />
              </div>
              <div className="space-y-0.5 flex-1">
                <h3
                  className={`font-bold text-xs tracking-wider uppercase ${
                    isDark ? 'text-white' : 'text-[#111111]'
                  }`}
                >
                  PLAN YOUR WORK
                </h3>
                <p
                  className={`font-sans text-xs leading-relaxed ${
                    isDark ? 'text-white/60' : 'text-black/60'
                  }`}
                >
                  Write your tasks. Stay focused.
                </p>
              </div>
            </div>

            <div className={`h-[1px] w-full ${isDark ? 'bg-white/10' : 'bg-black/10'}`} />

            {/* Feature 2: Connect GitHub */}
            <div className="flex items-start gap-4 group">
              <div className={`mt-0.5 shrink-0 ${isDark ? 'text-white/90' : 'text-black/90'}`}>
                <Code className="w-5 h-5 stroke-[1.5]" />
              </div>
              <div className="space-y-0.5 flex-1">
                <h3
                  className={`font-bold text-xs tracking-wider uppercase ${
                    isDark ? 'text-white' : 'text-[#111111]'
                  }`}
                >
                  CONNECT GITHUB
                </h3>
                <p
                  className={`font-sans text-xs leading-relaxed ${
                    isDark ? 'text-white/60' : 'text-black/60'
                  }`}
                >
                  Link your repository.
                </p>
              </div>
            </div>

            <div className={`h-[1px] w-full ${isDark ? 'bg-white/10' : 'bg-black/10'}`} />

            {/* Feature 3: Verify & Remember */}
            <div className="flex items-start gap-4 group">
              <div className={`mt-0.5 shrink-0 ${isDark ? 'text-white/90' : 'text-black/90'}`}>
                <CheckCircle2 className="w-5 h-5 stroke-[1.5]" />
              </div>
              <div className="space-y-0.5 flex-1">
                <h3
                  className={`font-bold text-xs tracking-wider uppercase ${
                    isDark ? 'text-white' : 'text-[#111111]'
                  }`}
                >
                  VERIFY & REMEMBER
                </h3>
                <p
                  className={`font-sans text-xs leading-relaxed ${
                    isDark ? 'text-white/60' : 'text-black/60'
                  }`}
                >
                  Your work. Verified by Git.
                </p>
              </div>
            </div>

            <div className={`h-[1px] w-full ${isDark ? 'bg-white/10' : 'bg-black/10'}`} />

            {/* Feature 4: Recover Anytime */}
            <div className="flex items-start gap-4 group">
              <div className={`mt-0.5 shrink-0 ${isDark ? 'text-white/90' : 'text-black/90'}`}>
                <RotateCcw className="w-5 h-5 stroke-[1.5]" />
              </div>
              <div className="space-y-0.5 flex-1">
                <h3
                  className={`font-bold text-xs tracking-wider uppercase ${
                    isDark ? 'text-white' : 'text-[#111111]'
                  }`}
                >
                  RECOVER ANYTIME
                </h3>
                <p
                  className={`font-sans text-xs leading-relaxed ${
                    isDark ? 'text-white/60' : 'text-black/60'
                  }`}
                >
                  Go back. Restore. Continue.
                </p>
              </div>
            </div>
          </div>

          {/* Action Button: ENTER SHIORI */}
          <div className="mt-10">
            <button
              onClick={handleEnterClick}
              className={`w-full py-3.5 px-6 border font-technical font-bold text-xs tracking-[0.25em] uppercase transition-all duration-200 flex items-center justify-center gap-3 group shadow-lg cursor-pointer ${
                isDark
                  ? 'border-white/80 hover:border-white bg-transparent hover:bg-white text-white hover:text-black hover:shadow-white/10'
                  : 'border-black/80 hover:border-black bg-transparent hover:bg-black text-black hover:text-white hover:shadow-black/10'
              }`}
            >
              <span>ENTER SHIORI</span>
              <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1.5" />
            </button>
          </div>
        </div>
      </div>

      {/* Interactive Auth Modal when clicking ENTER SHIORI */}
      {showAuthModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fade-in font-technical">
          <div
            className={`w-full max-w-sm border p-6 rounded-sm space-y-6 shadow-2xl relative ${
              isDark
                ? 'bg-[#0a0a0a] border-white/30 text-white'
                : 'bg-[#ffffff] border-black/30 text-[#111111]'
            }`}
          >
            {/* Close button */}
            <button
              onClick={() => setShowAuthModal(false)}
              className={`absolute top-4 right-4 transition-colors ${
                isDark ? 'text-white/50 hover:text-white' : 'text-black/50 hover:text-black'
              }`}
            >
              <X className="w-4 h-4" />
            </button>

            <div
              className={`space-y-1 text-center border-b pb-4 ${
                isDark ? 'border-white/15' : 'border-black/15'
              }`}
            >
              <h2 className="text-sm font-bold tracking-widest uppercase">
                SHIORI WORKSPACE
              </h2>
              <p
                className={`text-[11px] font-sans ${
                  isDark ? 'text-white/60' : 'text-black/60'
                }`}
              >
                Select an option to enter your development workspace
              </p>
            </div>

            <div className="space-y-3">
              <button
                onClick={() => {
                  setShowAuthModal(false);
                  navigate('/login');
                }}
                className={`w-full py-3 px-4 font-bold text-xs tracking-wider uppercase rounded-sm flex items-center justify-between transition-all shadow-md ${
                  isDark
                    ? 'bg-white text-black hover:bg-white/90'
                    : 'bg-black text-white hover:bg-black/90'
                }`}
              >
                <div className="flex items-center gap-2">
                  <LogIn className="w-4 h-4" />
                  <span>SIGN IN TO WORKSPACE</span>
                </div>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>

              <button
                onClick={() => {
                  setShowAuthModal(false);
                  navigate('/register');
                }}
                className={`w-full py-3 px-4 bg-transparent border font-bold text-xs tracking-wider uppercase rounded-sm flex items-center justify-between transition-all ${
                  isDark
                    ? 'border-white/30 hover:border-white text-white hover:bg-white/5'
                    : 'border-black/30 hover:border-black text-black hover:bg-black/5'
                }`}
              >
                <div className="flex items-center gap-2">
                  <UserPlus className="w-4 h-4" />
                  <span>CREATE NEW ACCOUNT</span>
                </div>
                <span
                  className={`text-[10px] font-mono ${
                    isDark ? 'text-white/50' : 'text-black/50'
                  }`}
                >
                  FREE
                </span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
