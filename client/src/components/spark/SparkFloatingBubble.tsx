import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useSpark } from '../../context/SparkContext';

export const SparkFloatingBubble: React.FC = () => {
  const { openSpark, heySparkEnabled, isWakeListening, wakeListeningPaused, isIOS } = useSpark();
  const [isHovered, setIsHovered] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const getTooltipText = () => {
    if (wakeListeningPaused && isIOS) {
      return 'iPhone paused wake. Tap to talk';
    }
    if (heySparkEnabled && isWakeListening) {
      return 'Listening for "Hey Spark"';
    }
    if (heySparkEnabled) {
      return 'Wake active · Tap to talk';
    }
    return 'Tap to talk (Ctrl+J)';
  };

  const bubbleContent = (
    <div
      className="fixed z-50 flex items-center gap-2 select-none group pointer-events-auto transition-all duration-200"
      style={{
        position: 'fixed',
        right: 'max(1.5rem, env(safe-area-inset-right, 1.5rem))',
        bottom: 'max(1.5rem, env(safe-area-inset-bottom, 1.5rem))',
        zIndex: 50,
      }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Expanded Hover Pill / Tooltip */}
      <div
        className={`hidden sm:flex items-center gap-2 px-3 py-1.5 bg-eink-surface border-2 border-eink-text text-eink-text rounded-full text-xs font-technical shadow-eink-sm transition-opacity duration-200 pointer-events-none ${
          isHovered ? 'opacity-100' : 'opacity-0'
        }`}
      >
        <span className="font-bold">✦ SPARK</span>
        <span className="text-[10px] text-eink-textSecondary font-mono">
          {getTooltipText()}
        </span>
      </div>

      {/* Main Floating Bubble */}
      <button
        onClick={() => openSpark()}
        className={`relative w-13 h-13 sm:w-12 sm:h-12 rounded-full flex items-center justify-center transition-all duration-200 shadow-2xl active:scale-95 cursor-pointer ${
          heySparkEnabled && isWakeListening
            ? 'bg-eink-text text-eink-bg border-2 border-eink-text shadow-eink-md ring-4 ring-eink-text/15'
            : 'bg-eink-surface hover:bg-eink-surfaceHover text-eink-text border-2 border-eink-text shadow-eink-card'
        }`}
        title={getTooltipText()}
        aria-label="Open Spark Companion"
      >
        {/* Wake active subtle ring */}
        {heySparkEnabled && isWakeListening && (
          <span className="absolute -inset-1.5 rounded-full border border-eink-text/40 animate-pulse pointer-events-none" />
        )}

        {/* Central Icon */}
        <div className="flex flex-col items-center justify-center">
          <span className="text-lg sm:text-base font-bold leading-none">✦</span>
          <span className="text-[8px] font-mono font-bold tracking-tighter leading-none mt-0.5 uppercase">
            {heySparkEnabled && isWakeListening ? 'LIVE' : 'SPARK'}
          </span>
        </div>

        {/* Active Listening Indicator Dot */}
        {heySparkEnabled && (
          <span
            className={`absolute top-0 right-0 w-3.5 h-3.5 sm:w-3 sm:h-3 rounded-full border-2 border-eink-bg ${
              isWakeListening ? 'bg-emerald-500 animate-pulse' : 'bg-amber-400'
            }`}
          />
        )}
      </button>
    </div>
  );

  if (!mounted || typeof document === 'undefined') {
    return null;
  }

  // Mount directly into document.body via React Portal to guarantee true fixed positioning relative to viewport
  return createPortal(bubbleContent, document.body);
};
