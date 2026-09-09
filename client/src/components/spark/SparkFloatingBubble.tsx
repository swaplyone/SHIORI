import React, { useState } from 'react';
import { useSpark } from '../../context/SparkContext';

export const SparkFloatingBubble: React.FC = () => {
  const { openSpark, heySparkEnabled, isWakeListening, wakeListeningPaused, isIOS } = useSpark();
  const [isHovered, setIsHovered] = useState(false);

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

  return (
    <div
      className="fixed bottom-6 right-6 z-40 flex items-center gap-2 select-none group"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Expanded Hover Pill / Tooltip */}
      <div
        className={`hidden sm:flex items-center gap-2 px-3 py-1.5 bg-eink-surface border-2 border-eink-text text-eink-text rounded-full text-xs font-technical shadow-eink-sm transition-all duration-200 pointer-events-none ${
          isHovered ? 'opacity-100 translate-x-0' : 'opacity-0 translate-x-2 pointer-events-none'
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
        className={`relative w-12 h-12 rounded-full flex items-center justify-center transition-all duration-300 shadow-2xl active:scale-90 cursor-pointer ${
          heySparkEnabled && isWakeListening
            ? 'bg-eink-text text-eink-bg border-2 border-eink-text shadow-eink-md hover:scale-110'
            : 'bg-eink-surface hover:bg-eink-surfaceHover text-eink-text border-2 border-eink-text shadow-eink-sm hover:scale-110'
        }`}
        title={getTooltipText()}
        aria-label="Open Spark Companion"
      >
        {/* Animated Wake Ring when actively listening for "Hey Spark" */}
        {heySparkEnabled && isWakeListening && (
          <span className="absolute -inset-1 rounded-full border border-eink-text/40 animate-ping opacity-60 pointer-events-none" />
        )}

        {/* Central Icon */}
        <div className="flex flex-col items-center justify-center">
          <span className="text-base font-bold leading-none">✦</span>
          <span className="text-[8px] font-mono font-bold tracking-tighter leading-none mt-0.5 uppercase">
            {heySparkEnabled && isWakeListening ? 'LIVE' : 'SPARK'}
          </span>
        </div>

        {/* Active Listening Indicator Dot */}
        {heySparkEnabled && (
          <span
            className={`absolute top-0 right-0 w-3 h-3 rounded-full border-2 border-eink-bg ${
              isWakeListening ? 'bg-emerald-500 animate-pulse' : 'bg-amber-400'
            }`}
          />
        )}
      </button>
    </div>
  );
};
