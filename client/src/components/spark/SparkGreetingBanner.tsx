import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Sparkles, X, ArrowRight, CheckCircle2, Clock, AlertTriangle, Play, Mic } from 'lucide-react';
import { useSpark } from '../../context/SparkContext';

export const SparkGreetingBanner: React.FC = () => {
  const {
    briefingData,
    hasSeenGreeting,
    dismissGreeting,
    heySparkEnabled,
    setHeySparkEnabled,
    openSpark
  } = useSpark();
  const navigate = useNavigate();
  const [showWakePrompt, setShowWakePrompt] = useState(!heySparkEnabled);

  if (hasSeenGreeting || !briefingData) return null;

  const { greeting, punchline, summarySentence, counts, recommendation } = briefingData;

  return (
    <div className="w-full max-w-7xl mx-auto px-3 sm:px-6 md:px-8 mb-6 select-none">
      <div className="bg-eink-surface border-2 border-eink-text p-4 rounded-sm shadow-eink-sm relative font-technical text-xs overflow-hidden">
        {/* Top Header */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="text-sm font-bold text-eink-text font-abask flex items-center gap-1.5">
              ✦ SPARK
            </span>
            <span className="text-[10px] text-eink-textMuted uppercase font-mono tracking-wider">
              DAILY BRIEFING
            </span>
          </div>

          <button
            onClick={dismissGreeting}
            className="p-1 text-eink-textMuted hover:text-eink-text rounded hover:bg-eink-surfaceHover transition-colors"
            title="Dismiss Briefing"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Greeting & Summary */}
        <div className="mt-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h3 className="text-sm font-bold text-eink-text">
              {greeting} <span className="font-normal text-eink-textSecondary">{punchline}</span>
            </h3>
            <p className="text-[11px] text-eink-textSecondary mt-0.5 font-mono">
              {summarySentence}
            </p>
          </div>

          {/* Metric Badges */}
          <div className="flex flex-wrap items-center gap-2 font-mono text-[11px]">
            {counts.running > 0 && (
              <div className="px-2.5 py-1 bg-eink-bg border border-eink-border rounded-sm flex items-center gap-1.5 font-bold">
                <Play className="w-3 h-3 text-eink-text" />
                <span>{String(counts.running).padStart(2, '0')} Running</span>
              </div>
            )}
            <div className="px-2.5 py-1 bg-eink-bg border border-eink-border rounded-sm flex items-center gap-1.5 font-bold">
              <Clock className="w-3 h-3 text-eink-textMuted" />
              <span>{String(counts.pending).padStart(2, '0')} Pending</span>
            </div>
            {counts.overdue > 0 && (
              <div className="px-2.5 py-1 bg-eink-text text-eink-bg rounded-sm flex items-center gap-1.5 font-bold">
                <AlertTriangle className="w-3 h-3 text-eink-bg" />
                <span>{String(counts.overdue).padStart(2, '0')} Overdue</span>
              </div>
            )}
            {counts.dueToday > 0 && (
              <div className="px-2.5 py-1 bg-eink-surfaceHover border border-eink-border rounded-sm flex items-center gap-1.5 font-bold">
                <span>{String(counts.dueToday).padStart(2, '0')} Due Today</span>
              </div>
            )}
          </div>
        </div>

        {/* Priority Recommendation Highlight */}
        {recommendation && (
          <div className="mt-3 p-2.5 bg-eink-bg border border-eink-border rounded-sm flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="text-[10px] uppercase font-bold text-eink-text px-1.5 py-0.5 bg-eink-surface border border-eink-border rounded">
                FOCUS
              </span>
              <span className="font-bold text-eink-text font-mono">
                {recommendation.taskCode}: {recommendation.title}
              </span>
              <span className="text-[10px] text-eink-textMuted">
                ({recommendation.priority} in {recommendation.projectName || 'Project'})
              </span>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={() => {
                  dismissGreeting();
                  navigate('/todos');
                }}
                className="px-3 py-1 bg-eink-text text-eink-bg font-bold rounded-sm text-xs shadow-eink-sm hover:opacity-90 transition-opacity flex items-center gap-1"
              >
                <span>VIEW TASKS</span>
                <ArrowRight className="w-3 h-3" />
              </button>

              <button
                onClick={() => openSpark()}
                className="px-3 py-1 bg-eink-surface hover:bg-eink-surfaceHover border border-eink-border text-eink-text font-bold rounded-sm text-xs transition-colors flex items-center gap-1"
              >
                <Mic className="w-3 h-3" />
                <span>TALK TO SPARK</span>
              </button>
            </div>
          </div>
        )}

        {/* Wake-word opt-in prompt if not yet set */}
        {!heySparkEnabled && showWakePrompt && (
          <div className="mt-2.5 pt-2 border-t border-eink-border/50 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-[11px] text-eink-textSecondary">
            <div className="flex items-center gap-1.5">
              <Mic className="w-3.5 h-3.5 text-eink-text shrink-0" />
              <span>Want Spark to listen for <strong>"Hey Spark"</strong> while SHIORI is open?</span>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  setHeySparkEnabled(true);
                  setShowWakePrompt(false);
                }}
                className="px-2.5 py-0.5 bg-eink-text text-eink-bg font-bold rounded-sm text-[10px] hover:opacity-90"
              >
                ENABLE WAKE WORD
              </button>
              <button
                onClick={() => setShowWakePrompt(false)}
                className="text-[10px] text-eink-textMuted hover:text-eink-text"
              >
                NOT NOW
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
