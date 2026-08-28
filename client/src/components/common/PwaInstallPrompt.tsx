import React, { useState, useEffect } from 'react';
import { Download, X } from 'lucide-react';

export const PwaInstallPrompt: React.FC = () => {
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [showPrompt, setShowPrompt] = useState<boolean>(false);

  useEffect(() => {
    const isDismissed = localStorage.getItem('shiori_pwa_dismissed');
    if (isDismissed) return;

    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setShowPrompt(true);
    };

    window.addEventListener('beforeinstallprompt', handler);

    return () => {
      window.removeEventListener('beforeinstallprompt', handler);
    };
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) {
      alert('To install SHIORI, tap your browser menu and choose "Add to Home Screen" or "Install App".');
      setShowPrompt(false);
      return;
    }

    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      setShowPrompt(false);
    }
    setDeferredPrompt(null);
  };

  const handleDismiss = () => {
    localStorage.setItem('shiori_pwa_dismissed', 'true');
    setShowPrompt(false);
  };

  if (!showPrompt) return null;

  return (
    <div className="fixed bottom-16 md:bottom-6 right-4 md:right-6 z-40 max-w-sm w-[calc(100vw-2rem)] bg-eink-bg border border-eink-border shadow-2xl p-4 rounded-sm font-sans select-none animate-fade-in">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-6 h-6 bg-eink-text text-eink-bg flex items-center justify-center font-technical font-bold text-xs rounded-sm">
            S
          </div>
          <h4 className="font-technical font-bold text-sm text-eink-text">SHIORI PWA</h4>
        </div>
        <button
          onClick={handleDismiss}
          className="text-eink-textMuted hover:text-eink-text p-0.5"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="mt-2.5 text-xs text-eink-textSecondary space-y-1">
        <p className="font-medium text-eink-text">Install SHIORI on this device?</p>
        <p className="text-[11px] text-eink-textMuted">
          A focused workspace for your development work with offline support and instant launcher access.
        </p>
      </div>

      <div className="mt-3.5 flex items-center gap-2">
        <button
          onClick={handleInstall}
          className="flex-1 py-1.5 px-3 bg-eink-darkSurface text-eink-darkText text-xs font-technical font-bold rounded-sm flex items-center justify-center gap-1.5 shadow-eink-sm"
        >
          <Download className="w-3.5 h-3.5" />
          <span>INSTALL</span>
        </button>
        <button
          onClick={handleDismiss}
          className="py-1.5 px-3 border border-eink-border text-xs font-technical text-eink-textSecondary hover:bg-eink-surface rounded-sm"
        >
          NOT NOW
        </button>
      </div>
    </div>
  );
};
