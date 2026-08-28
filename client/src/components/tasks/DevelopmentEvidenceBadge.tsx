import React from 'react';
import { CIStatus } from '../../types';

interface DevelopmentEvidenceBadgeProps {
  ciStatus?: CIStatus;
  confidenceScore?: number;
  hasDiscrepancy?: boolean | number;
  compact?: boolean;
}

export const DevelopmentEvidenceBadge: React.FC<DevelopmentEvidenceBadgeProps> = ({
  ciStatus = 'UNKNOWN',
  confidenceScore = 0,
  hasDiscrepancy = false,
  compact = false,
}) => {
  const isFailed = ciStatus === 'FAILED';
  const isPassed = ciStatus === 'PASSED';
  const isRunning = ciStatus === 'RUNNING';

  let symbol = '○';
  let label = 'CI UNKNOWN';

  if (isFailed) {
    symbol = '✕';
    label = 'CI FAILED';
  } else if (isPassed) {
    symbol = '✓';
    label = 'CI PASSED';
  } else if (isRunning) {
    symbol = '◐';
    label = 'CI RUNNING';
  }

  if (compact) {
    return (
      <div className="flex items-center gap-1.5 font-technical text-[11px]">
        <span
          className={`px-1.5 py-0.2 rounded-sm border ${
            isFailed
              ? 'bg-eink-darkSurface text-eink-darkText border-eink-darkSurface font-bold'
              : isPassed
              ? 'bg-eink-surface text-eink-text border-eink-border font-medium'
              : 'bg-transparent text-eink-textMuted border-eink-border'
          }`}
        >
          {symbol} {ciStatus}
        </span>
        {Boolean(hasDiscrepancy) && (
          <span
            className="px-1 py-0.2 bg-eink-surface border border-eink-border text-[10px] text-eink-text font-bold rounded-sm"
            title="User marked complete, but latest CI failed"
          >
            DISCREPANCY
          </span>
        )}
      </div>
    );
  }

  return (
    <div className="p-3 bg-eink-surface border border-eink-border rounded-sm font-sans space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-technical font-bold text-eink-textMuted uppercase tracking-wider">
          DEVELOPMENT STATUS
        </span>
        <span
          className={`px-2 py-0.5 rounded text-xs font-technical font-bold border ${
            isFailed
              ? 'bg-eink-darkSurface text-eink-darkText border-eink-darkSurface'
              : isPassed
              ? 'bg-eink-bg text-eink-text border-eink-border'
              : 'bg-transparent text-eink-textSecondary border-eink-border'
          }`}
        >
          {symbol} {label}
        </span>
      </div>

      {confidenceScore > 0 && (
        <div>
          <div className="flex items-center justify-between text-[11px] font-technical mb-1">
            <span className="text-eink-textMuted">DEVELOPMENT CONFIDENCE</span>
            <span className="font-bold text-eink-text">{confidenceScore}%</span>
          </div>
          <div className="w-full bg-eink-bg h-2 border border-eink-border rounded-sm overflow-hidden p-0.5">
            <div
              className="bg-eink-text h-full rounded-sm transition-all duration-500"
              style={{ width: `${Math.min(100, Math.max(5, confidenceScore))}%` }}
            />
          </div>
          <p className="text-[10px] text-eink-textMuted font-technical mt-1">
            Based on linked commits, PR status & automated checks.
          </p>
        </div>
      )}

      {Boolean(hasDiscrepancy) && (
        <div className="p-2 bg-eink-bg border border-eink-border rounded-sm text-xs text-eink-text space-y-0.5">
          <p className="font-bold font-technical text-[11px]">SHIORI NOTICE</p>
          <p className="text-[11px] text-eink-textSecondary">
            Marked complete by user, but the latest development check is failing.
          </p>
        </div>
      )}
    </div>
  );
};
