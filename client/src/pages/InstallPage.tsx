import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Download, Share2, PlusSquare, Smartphone, Monitor, CheckCircle2, ArrowUpRight } from 'lucide-react';
import { isStandaloneMode, isIosDevice, getDeferredInstallPrompt, clearDeferredInstallPrompt } from '../utils/pwa';
import { useAuth } from '../context/AuthContext';
import { useMorphBar } from '../context/MorphBarContext';

export const InstallPage: React.FC = () => {
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();
  const { setIsBarVisible } = useMorphBar();

  const [deferredPrompt, setDeferredPrompt] = useState<any>(() => getDeferredInstallPrompt());
  const [isInstalled, setIsInstalled] = useState<boolean>(false);
  const [installError, setInstallError] = useState<string | null>(null);
  const isIos = isIosDevice();

  useEffect(() => {
    // Hide floating MorphBar on dedicated installation gateway
    setIsBarVisible(false);

    // If already running inside installed standalone PWA, navigate into app
    if (isStandaloneMode()) {
      if (isAuthenticated) {
        navigate('/home', { replace: true });
      } else {
        navigate('/login', { replace: true });
      }
      return;
    }

    const handlePrompt = () => {
      setDeferredPrompt(getDeferredInstallPrompt());
    };

    const handleInstalled = () => {
      setIsInstalled(true);
      clearDeferredInstallPrompt();
    };

    window.addEventListener('shiori:beforeinstallprompt', handlePrompt);
    window.addEventListener('shiori:appinstalled', handleInstalled);
    window.addEventListener('appinstalled', handleInstalled);

    return () => {
      window.removeEventListener('shiori:beforeinstallprompt', handlePrompt);
      window.removeEventListener('shiori:appinstalled', handleInstalled);
      window.removeEventListener('appinstalled', handleInstalled);
      setIsBarVisible(true);
    };
  }, [navigate, isAuthenticated, setIsBarVisible]);

  const handleInstallClick = async () => {
    const promptEvent = deferredPrompt || getDeferredInstallPrompt();

    if (promptEvent) {
      try {
        await promptEvent.prompt();
        const { outcome } = await promptEvent.userChoice;
        if (outcome === 'accepted') {
          setIsInstalled(true);
          clearDeferredInstallPrompt();
          setDeferredPrompt(null);
        }
      } catch (err) {
        console.error('Install prompt error:', err);
      }
    } else if (isIos) {
      // iOS users follow native Share -> Add to Home Screen steps
    } else {
      // Fallback instruction
      setInstallError('Please use your browser menu (⋮ or ⊕ in address bar) to Install Shiori.');
    }
  };

  return (
    <div className="relative w-full min-h-screen bg-[#EBE9E1] text-[#111111] font-sans select-none overflow-x-hidden flex flex-col justify-between p-6 sm:p-10 md:p-14">
      {/* 1. Subtle Paper Grain Texture Overlay */}
      <div
        className="fixed inset-0 pointer-events-none opacity-[0.035] mix-blend-multiply"
        style={{
          backgroundImage: `radial-gradient(#111111 1px, transparent 1px)`,
          backgroundSize: '16px 16px'
        }}
      />

      {/* TOP: Header */}
      <header className="relative z-10 w-full flex items-center justify-between text-[11px] font-mono tracking-widest text-[#74726A] uppercase">
        <div className="flex items-center gap-2">
          <span>栞</span>
          <span>·</span>
          <span className="font-abask font-bold text-xs tracking-wider">SHIORI</span>
        </div>
        <span className="text-[10px] tracking-widest text-[#74726A]">A SwaplyOne product</span>
      </header>

      {/* CENTER: Main Installation Card */}
      <main className="relative z-10 w-full max-w-lg mx-auto my-auto py-8">
        <div className="bg-[#DFDDD3]/80 border-2 border-[#111111] p-6 sm:p-8 rounded-sm shadow-eink-card space-y-6 text-center">
          {/* Logo & Identity */}
          <div className="flex flex-col items-center justify-center space-y-2">
            <div className="w-14 h-14 bg-transparent flex items-center justify-center">
              <img
                src="/logo.png"
                alt="SHIORI"
                className="w-full h-full object-contain select-none"
              />
            </div>
            <h2 className="font-abask font-bold text-lg tracking-[0.2em] text-[#111111] uppercase">
              SHIORI
            </h2>
          </div>

          {/* Heading & Explanatory Copy */}
          <div className="space-y-2">
            <h1 className="font-abask font-normal text-2xl sm:text-3xl tracking-tight text-[#111111] uppercase">
              Made for your home screen.
            </h1>
            <p className="text-xs sm:text-sm text-[#42413C] font-sans leading-relaxed max-w-md mx-auto">
              Add Shiori to your home screen for the full app experience.
            </p>
          </div>

          {/* Installed State */}
          {isInstalled ? (
            <div className="p-4 bg-[#EBE9E1] border border-[#111111] rounded-sm space-y-2 text-left font-mono text-xs animate-fade-in">
              <div className="flex items-center gap-2 text-[#111111] font-bold">
                <CheckCircle2 className="w-4 h-4" />
                <span>SHIORI ADDED</span>
              </div>
              <p className="text-[#555550] text-[11px] font-sans">
                Open Shiori from your home screen or app launcher to access your workspace.
              </p>
            </div>
          ) : (
            <div className="space-y-4 pt-2">
              {/* Primary Action Button */}
              {(!isIos || deferredPrompt) && (
                <button
                  onClick={handleInstallClick}
                  className="w-full py-3 px-6 bg-[#111111] hover:bg-[#000000] text-[#EBE9E1] text-xs sm:text-sm font-abask font-bold tracking-[0.18em] uppercase rounded-sm flex items-center justify-center gap-2 shadow-eink-sm hover:opacity-95 active:scale-[0.99] cursor-pointer transition-all"
                >
                  <Download className="w-4 h-4" />
                  <span>ADD SHIORI</span>
                </button>
              )}

              {/* iOS Safari Instructions */}
              {isIos && (
                <div className="p-4 bg-[#F5F4EE] border border-[#B8B7B1] rounded-sm text-left space-y-3 font-mono text-xs">
                  <div className="flex items-center gap-2 font-bold text-[#111111] uppercase text-[11px] tracking-wider border-b border-[#B8B7B1]/60 pb-1.5">
                    <Smartphone className="w-3.5 h-3.5" />
                    <span>How to Add on iOS</span>
                  </div>
                  <ol className="space-y-2 text-[11px] text-[#4A4A4A] font-sans">
                    <li className="flex items-center gap-2">
                      <span className="w-4 h-4 bg-[#111111] text-[#F5F4EE] rounded-[2px] flex items-center justify-center font-mono text-[9px] font-bold shrink-0">1</span>
                      <span>Tap the <strong>Share</strong> button in Safari toolbar</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <span className="w-4 h-4 bg-[#111111] text-[#F5F4EE] rounded-[2px] flex items-center justify-center font-mono text-[9px] font-bold shrink-0">2</span>
                      <span>Scroll and tap <strong>Add to Home Screen</strong></span>
                    </li>
                    <li className="flex items-center gap-2">
                      <span className="w-4 h-4 bg-[#111111] text-[#F5F4EE] rounded-[2px] flex items-center justify-center font-mono text-[9px] font-bold shrink-0">3</span>
                      <span>Open <strong>Shiori</strong> from your home screen</span>
                    </li>
                  </ol>
                </div>
              )}

              {/* Desktop Browser Instructions (when prompt is not native) */}
              {!isIos && !deferredPrompt && (
                <div className="p-3.5 bg-[#F5F4EE] border border-[#B8B7B1] rounded-sm text-left space-y-2 font-mono text-xs">
                  <div className="flex items-center gap-2 font-bold text-[#111111] uppercase text-[11px] tracking-wider">
                    <Monitor className="w-3.5 h-3.5" />
                    <span>Desktop Installation</span>
                  </div>
                  <p className="text-[11px] text-[#555550] font-sans leading-relaxed">
                    Click the <strong>Install</strong> icon in your browser address bar (top right) or select <strong>Install Shiori</strong> from the browser menu.
                  </p>
                </div>
              )}

              {installError && (
                <p className="text-[11px] text-[#777770] font-mono">{installError}</p>
              )}
            </div>
          )}
        </div>
      </main>

      {/* BOTTOM: Minimal Editorial Footer */}
      <footer className="relative z-10 w-full flex flex-col sm:flex-row items-center justify-between gap-1 text-[10px] font-mono text-[#999990] tracking-widest uppercase">
        <span className="font-semibold text-eink-text/50">A SWAPLYONE PRODUCT</span>
        <span>ELECTRONIC PAPER · QUIET WORKSPACE</span>
      </footer>
    </div>
  );
};
