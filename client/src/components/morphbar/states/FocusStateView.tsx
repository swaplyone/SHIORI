import React, { useState, useEffect } from 'react';
import { Play, Pause, RotateCcw, Square, Check, Sparkles } from 'lucide-react';
import { useMorphBar } from '../../../context/MorphBarContext';

export const FocusCollapsedView: React.FC = () => {
  const { focusTimer } = useMorphBar();

  const minutes = Math.floor(focusTimer.secondsRemaining / 60);
  const seconds = focusTimer.secondsRemaining % 60;
  const isDone = focusTimer.secondsRemaining === 0;
  const timerStr = isDone ? 'DONE' : `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;

  const progressPercent = Math.min(
    100,
    Math.max(0, ((focusTimer.totalSeconds - focusTimer.secondsRemaining) / focusTimer.totalSeconds) * 100)
  );

  return (
    <div className="relative w-full h-[42px] flex items-center justify-between select-none overflow-hidden rounded-full font-technical text-xs">
      {/* LAYER 1: Paper Background with Dark Ink Text */}
      <div className="absolute inset-0 bg-eink-bg flex items-center justify-between px-3.5 z-0">
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full bg-eink-text ${focusTimer.isPaused ? 'opacity-40' : 'animate-pulse'}`} />
          <span className="font-mono font-bold tracking-widest text-xs text-eink-text">
            {timerStr}
          </span>
        </div>
        <span className="text-[10px] uppercase font-bold tracking-wider text-eink-textSecondary">
          {isDone ? 'COMPLETED' : focusTimer.isPaused ? 'PAUSED' : 'FOCUS'}
        </span>
      </div>

      {/* LAYER 2: Black Ink Filling Container with White Inverted Text */}
      <div
        className="absolute top-0 left-0 bottom-0 bg-eink-text overflow-hidden transition-[width] duration-300 ease-out z-10"
        style={{ width: `${progressPercent}%` }}
      >
        {/* Subtle Organic Paper-Dither Ink Edge on the right border */}
        <div className="absolute top-0 right-0 bottom-0 w-1.5 bg-repeat-y opacity-30 pointer-events-none bg-eink-bg" />

        {/* Pinned Identical White Text matching Layer 1 exactly */}
        <div className="w-[240px] sm:w-[260px] h-[42px] flex items-center justify-between px-3.5 text-eink-bg">
          <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full bg-eink-bg ${focusTimer.isPaused ? 'opacity-40' : 'animate-pulse'}`} />
            <span className="font-mono font-bold tracking-widest text-xs text-eink-bg">
              {timerStr}
            </span>
          </div>
          <span className="text-[10px] uppercase font-bold tracking-wider text-eink-bg/90">
            {isDone ? 'COMPLETED' : focusTimer.isPaused ? 'PAUSED' : 'FOCUS'}
          </span>
        </div>
      </div>
    </div>
  );
};

export const FocusExpandedView: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const { focusTimer, pauseFocusTimer, resumeFocusTimer, stopFocusTimer, startFocusTimer, adjustFocusTimer, setFocusTimerDuration } = useMorphBar();

  const minutes = Math.floor(focusTimer.secondsRemaining / 60);
  const seconds = focusTimer.secondsRemaining % 60;
  const isDone = focusTimer.secondsRemaining === 0;
  const timerStr = isDone ? 'DONE' : `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  
  const progressPercent = Math.min(
    100,
    Math.max(0, ((focusTimer.totalSeconds - focusTimer.secondsRemaining) / focusTimer.totalSeconds) * 100)
  );

  const handleReset = () => {
    startFocusTimer(focusTimer.taskTitle, focusTimer.projectName, Math.round(focusTimer.totalSeconds / 60));
  };

  const DURATION_PRESETS = [5, 10, 15, 25, 30, 45, 60];

  return (
    <div className="space-y-4 text-center font-technical py-2">
      {/* Duration Preset Selector Pills */}
      <div className="flex flex-wrap items-center justify-center gap-1.5">
        <span className="text-[9px] text-eink-textMuted uppercase font-bold mr-1">SET TIMER:</span>
        {DURATION_PRESETS.map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setFocusTimerDuration(m)}
            className={`px-2 py-0.5 text-[10px] font-mono font-bold rounded-sm border cursor-pointer transition-all ${
              Math.round(focusTimer.totalSeconds / 60) === m
                ? 'bg-eink-darkSurface text-eink-darkText border-eink-darkSurface shadow-eink-sm'
                : 'bg-eink-surface text-eink-text border-eink-border hover:bg-eink-surfaceHover'
            }`}
          >
            {m}m
          </button>
        ))}
      </div>

      {/* Timer Display with Ink Progression Container */}
      <div className="space-y-2">
        <div className="relative w-full h-16 sm:h-20 bg-eink-surface border-2 border-eink-text rounded-sm overflow-hidden flex items-center justify-center">
          {/* Paper layer (unfilled) */}
          <div className="absolute inset-0 flex items-center justify-center z-0">
            <span className="text-4xl sm:text-5xl font-bold tracking-widest text-eink-text font-mono select-none">
              {timerStr}
            </span>
          </div>

          {/* Black Ink Layer (fills from left to right with inverse white text) */}
          <div
            className="absolute top-0 left-0 bottom-0 bg-eink-text overflow-hidden transition-[width] duration-300 ease-out z-10"
            style={{ width: `${progressPercent}%` }}
          >
            {/* Ink Leading Edge texture */}
            <div className="absolute top-0 right-0 bottom-0 w-2 bg-repeat-y opacity-25 bg-eink-bg" />

            <div className="w-full h-full min-w-[500px] flex items-center justify-center text-eink-bg">
              <span className="text-4xl sm:text-5xl font-bold tracking-widest text-eink-bg font-mono select-none">
                {timerStr}
              </span>
            </div>
          </div>
        </div>

        {/* Quick Adjusters & Ink Progress */}
        <div className="flex items-center justify-between text-[11px] text-eink-textSecondary font-mono px-1">
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => adjustFocusTimer(-5)}
              className="px-1.5 py-0.5 border border-eink-border text-[10px] rounded hover:bg-eink-surface text-eink-text cursor-pointer"
              title="Subtract 5m"
            >
              -5m
            </button>
            <button
              type="button"
              onClick={() => adjustFocusTimer(-1)}
              className="px-1.5 py-0.5 border border-eink-border text-[10px] rounded hover:bg-eink-surface text-eink-text cursor-pointer"
              title="Subtract 1m"
            >
              -1m
            </button>
            <button
              type="button"
              onClick={() => adjustFocusTimer(1)}
              className="px-1.5 py-0.5 border border-eink-border text-[10px] rounded hover:bg-eink-surface text-eink-text cursor-pointer"
              title="Add 1m"
            >
              +1m
            </button>
            <button
              type="button"
              onClick={() => adjustFocusTimer(5)}
              className="px-1.5 py-0.5 border border-eink-border text-[10px] rounded hover:bg-eink-surface text-eink-text cursor-pointer"
              title="Add 5m"
            >
              +5m
            </button>
          </div>
          <span>INK PROGRESS: {Math.round(progressPercent)}% • {focusTimer.isPaused ? 'PAUSED' : isDone ? 'SETTLED' : 'SPREADING'}</span>
        </div>
      </div>

      {/* Active Task Info */}
      <div className="p-3 bg-eink-surface border border-eink-border rounded-sm text-left text-xs space-y-1">
        <span className="text-[10px] text-eink-textMuted uppercase font-bold block">
          FOCUS OBJECTIVE • {focusTimer.projectName || 'SHIORI'}
        </span>
        <p className="font-bold text-eink-text text-sm truncate">{focusTimer.taskTitle}</p>
      </div>

      {/* Control Buttons */}
      <div className="flex items-center justify-center gap-2.5 pt-1">
        {focusTimer.isPaused ? (
          <button
            type="button"
            onClick={resumeFocusTimer}
            className="px-5 py-2 bg-eink-text text-eink-bg font-bold text-xs rounded-sm shadow-eink-sm flex items-center gap-1.5 hover:opacity-90 active:scale-[0.98] cursor-pointer"
          >
            <Play className="w-3.5 h-3.5" />
            <span>RESUME</span>
          </button>
        ) : (
          <button
            type="button"
            onClick={pauseFocusTimer}
            className="px-5 py-2 border border-eink-border bg-eink-surface hover:bg-eink-surfaceHover text-eink-text font-bold text-xs rounded-sm flex items-center gap-1.5 cursor-pointer"
          >
            <Pause className="w-3.5 h-3.5" />
            <span>PAUSE</span>
          </button>
        )}

        <button
          type="button"
          onClick={handleReset}
          className="px-4 py-2 border border-eink-border hover:bg-eink-surface text-xs font-bold text-eink-text rounded-sm flex items-center gap-1.5 cursor-pointer"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          <span>RESET</span>
        </button>

        <button
          type="button"
          onClick={() => {
            stopFocusTimer();
            onClose();
          }}
          className="px-4 py-2 border border-eink-border hover:bg-eink-surface text-xs text-eink-textSecondary hover:text-eink-text rounded-sm flex items-center gap-1.5 cursor-pointer"
        >
          <Square className="w-3 h-3" />
          <span>STOP</span>
        </button>
      </div>
    </div>
  );
};
