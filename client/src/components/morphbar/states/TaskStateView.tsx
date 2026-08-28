import React from 'react';
import { useNavigate } from 'react-router-dom';
import { CheckSquare, ArrowUpRight, Activity } from 'lucide-react';

export const TaskCollapsedView: React.FC<{ data?: any }> = ({ data }) => {
  return (
    <div className="flex items-center justify-between w-full px-3 py-1 text-xs font-technical text-eink-text select-none">
      <div className="flex items-center gap-2 truncate">
        <Activity className="w-3.5 h-3.5 text-eink-text shrink-0" />
        <span className="font-bold uppercase text-[11px] shrink-0">✓ TASK ACTIVITY</span>
        <span className="text-eink-textSecondary truncate text-[11px]">
          {data?.title || 'Finish authentication'}
        </span>
      </div>
      <span className="text-[10px] bg-eink-bg px-1.5 py-0.2 border border-eink-border rounded font-bold ml-2 shrink-0">
        {data?.taskCode || 'TASK-042'}
      </span>
    </div>
  );
};

export const TaskExpandedView: React.FC<{ data?: any; onClose: () => void }> = ({ data, onClose }) => {
  const navigate = useNavigate();

  return (
    <div className="space-y-4 font-technical text-xs">
      <div className="p-3.5 bg-eink-surface border border-eink-border rounded-sm space-y-2">
        <span className="text-[10px] text-eink-textMuted uppercase font-bold block">
          DEVELOPMENT EVIDENCE DETECTED
        </span>
        <h4 className="font-bold text-sm text-eink-text">{data?.title || 'Finish authentication'}</h4>
        <div className="flex items-center gap-2 text-[11px] text-eink-textSecondary">
          <span>Latest commit: <code className="font-mono font-bold text-eink-text">{data?.latestCommit || 'a83f21c'}</code></span>
          <span>•</span>
          <span>{data?.timeAgo || '8 minutes ago'}</span>
        </div>
      </div>

      <div className="p-2.5 bg-eink-bg border border-eink-border rounded-sm text-[11px] text-eink-text">
        ✓ Git commits and CI checks have been associated with development evidence.
      </div>

      <div className="flex justify-end gap-2 pt-1">
        <button
          onClick={() => {
            navigate('/tasks');
            onClose();
          }}
          className="px-4 py-1.5 bg-eink-text text-eink-bg font-bold rounded-sm shadow-eink-sm flex items-center gap-1.5"
        >
          <span>VIEW TASK DETAILS</span>
          <ArrowUpRight className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
};
