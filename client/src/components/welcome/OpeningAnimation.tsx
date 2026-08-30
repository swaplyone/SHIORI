import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  Square,
  Code,
  CheckCircle2,
  RotateCcw,
  UserPlus,
  LogIn,
  X
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useMorphBar } from '../../context/MorphBarContext';

export const OpeningAnimation: React.FC<{ onComplete?: () => void }> = ({ onComplete }) => {
  const { demoLogin, isAuthenticated } = useAuth();
  const { setIsBarVisible, setBarPosition } = useMorphBar();
  const navigate = useNavigate();

  const [showAuthModal, setShowAuthModal] = useState<boolean>(false);
  const [inkFlash, setInkFlash] = useState<boolean>(false);

  const triggerInkRefresh = () => {
    setInkFlash(true);
    setTimeout(() => setInkFlash(false), 120);
  };

  const handleEnterClick = () => {
    triggerInkRefresh();
    if (isAuthenticated) {
      navigate('/home');
      if (onComplete) onComplete();
    } else {
      setShowAuthModal(true);
    }
  };

  const handleQuickDemo = async () => {
    await demoLogin();
    navigate('/home');
    if (onComplete) onComplete();
  };

  return (
    <div className="min-h-screen bg-[#000000] text-white flex items-center justify-center p-4 sm:p-8 md:p-12 font-sans select-none overflow-x-hidden relative">
      {/* Subtle E-Ink Screen Flash Waveform */}
      {inkFlash && (
        <div className="absolute inset-0 bg-white/20 pointer-events-none z-50 transition-opacity duration-75" />
      )}

      {/* Main Split Grid Container */}
      <div className="w-full max-w-6xl grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-center">
        {/* Left Column: Isometric Wireframe Workstation Line Art */}
        <div className="lg:col-span-7 flex items-center justify-center p-2 sm:p-4">
          <div className="relative w-full max-w-lg lg:max-w-xl aspect-4/3 flex items-center justify-center">
            <img
              src="/welcome-desk.jpg"
              alt="SHIORI Developer Workstation"
              className="w-full h-full object-contain filter contrast-125 brightness-110 drop-shadow-[0_0_25px_rgba(255,255,255,0.05)] select-none pointer-events-none"
            />
          </div>
        </div>

        {/* Right Column: Technical Typography, Features & Action */}
        <div className="lg:col-span-5 flex flex-col justify-center px-4 sm:px-8 max-w-md mx-auto lg:max-w-none w-full">
          {/* Header Branding */}
          <div className="text-center lg:text-left space-y-3 mb-8">
            <h1 className="font-technical text-3xl sm:text-4xl lg:text-5xl font-bold tracking-[0.35em] text-white uppercase">
              S H I O R I
            </h1>

            {/* Thin divider with centered dot */}
            <div className="flex items-center justify-center lg:justify-start gap-3 my-2 w-full">
              <div className="h-[1px] bg-white/25 flex-1 max-w-[120px] lg:max-w-[160px]" />
              <span className="w-1.5 h-1.5 rounded-full bg-white inline-block" />
              <div className="h-[1px] bg-white/25 flex-1 max-w-[120px] lg:max-w-[160px]" />
            </div>

            {/* Sub-tagline */}
            <p className="font-technical text-xs sm:text-sm tracking-[0.25em] text-white/80 uppercase">
              W O R K . &nbsp; R E M E M B E R E D .
            </p>
          </div>

          {/* Feature List with Subtle Horizontal Separators */}
          <div className="space-y-4 font-technical">
            {/* Feature 1: Plan Your Work */}
            <div className="flex items-start gap-4 group">
              <div className="mt-0.5 shrink-0 text-white/90">
                <Square className="w-5 h-5 stroke-[1.5]" />
              </div>
              <div className="space-y-0.5 flex-1">
                <h3 className="font-bold text-xs tracking-wider text-white uppercase">
                  PLAN YOUR WORK
                </h3>
                <p className="font-sans text-xs text-white/60 leading-relaxed">
                  Write your tasks. Stay focused.
                </p>
              </div>
            </div>

            <div className="h-[1px] bg-white/10 w-full" />

            {/* Feature 2: Connect GitHub */}
            <div className="flex items-start gap-4 group">
              <div className="mt-0.5 shrink-0 text-white/90">
                <Code className="w-5 h-5 stroke-[1.5]" />
              </div>
              <div className="space-y-0.5 flex-1">
                <h3 className="font-bold text-xs tracking-wider text-white uppercase">
                  CONNECT GITHUB
                </h3>
                <p className="font-sans text-xs text-white/60 leading-relaxed">
                  Link your repository.
                </p>
              </div>
            </div>

            <div className="h-[1px] bg-white/10 w-full" />

            {/* Feature 3: Verify & Remember */}
            <div className="flex items-start gap-4 group">
              <div className="mt-0.5 shrink-0 text-white/90">
                <CheckCircle2 className="w-5 h-5 stroke-[1.5]" />
              </div>
              <div className="space-y-0.5 flex-1">
                <h3 className="font-bold text-xs tracking-wider text-white uppercase">
                  VERIFY & REMEMBER
                </h3>
                <p className="font-sans text-xs text-white/60 leading-relaxed">
                  Your work. Verified by Git.
                </p>
              </div>
            </div>

            <div className="h-[1px] bg-white/10 w-full" />

            {/* Feature 4: Recover Anytime */}
            <div className="flex items-start gap-4 group">
              <div className="mt-0.5 shrink-0 text-white/90">
                <RotateCcw className="w-5 h-5 stroke-[1.5]" />
              </div>
              <div className="space-y-0.5 flex-1">
                <h3 className="font-bold text-xs tracking-wider text-white uppercase">
                  RECOVER ANYTIME
                </h3>
                <p className="font-sans text-xs text-white/60 leading-relaxed">
                  Go back. Restore. Continue.
                </p>
              </div>
            </div>
          </div>

          {/* Action Button: ENTER SHIORI */}
          <div className="mt-10">
            <button
              onClick={handleEnterClick}
              className="w-full py-3.5 px-6 border border-white/80 hover:border-white bg-transparent hover:bg-white text-white hover:text-black font-technical font-bold text-xs tracking-[0.25em] uppercase transition-all duration-200 flex items-center justify-center gap-3 group shadow-lg hover:shadow-white/10 cursor-pointer"
            >
              <span>ENTER SHIORI</span>
              <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1.5" />
            </button>
          </div>
        </div>
      </div>

      {/* Interactive Auth Modal when clicking ENTER SHIORI */}
      {showAuthModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fade-in font-technical">
          <div className="w-full max-w-sm bg-[#0a0a0a] border border-white/30 p-6 rounded-sm space-y-6 shadow-2xl relative">
            {/* Close button */}
            <button
              onClick={() => setShowAuthModal(false)}
              className="absolute top-4 right-4 text-white/50 hover:text-white transition-colors"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="space-y-1 text-center border-b border-white/15 pb-4">
              <h2 className="text-sm font-bold tracking-widest uppercase text-white">
                SHIORI WORKSPACE
              </h2>
              <p className="text-[11px] text-white/60 font-sans">
                Select an option to enter your development workspace
              </p>
            </div>

            <div className="space-y-3">
              <button
                onClick={() => {
                  setShowAuthModal(false);
                  navigate('/login');
                }}
                className="w-full py-3 px-4 bg-white text-black font-bold text-xs tracking-wider uppercase rounded-sm flex items-center justify-between hover:bg-white/90 transition-all shadow-md"
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
                className="w-full py-3 px-4 bg-transparent border border-white/30 hover:border-white text-white font-bold text-xs tracking-wider uppercase rounded-sm flex items-center justify-between transition-all hover:bg-white/5"
              >
                <div className="flex items-center gap-2">
                  <UserPlus className="w-4 h-4" />
                  <span>CREATE NEW ACCOUNT</span>
                </div>
                <span className="text-[10px] text-white/50 font-mono">FREE</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
