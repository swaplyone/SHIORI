import React from 'react';
import { useNavigate } from 'react-router-dom';
import { GitCommit, ExternalLink, ArrowUpRight, CheckCircle2 } from 'lucide-react';

export const GitHubCollapsedView: React.FC<{ data?: any }> = ({ data }) => {
  return (
    <div className="flex items-center justify-between w-full px-3 py-1 text-xs font-technical text-eink-text select-none">
      <div className="flex items-center gap-2 truncate">
        <GitCommit className="w-3.5 h-3.5 text-eink-text shrink-0" />
        <span className="font-bold uppercase tracking-wider text-[11px] shrink-0">↑ COMMIT</span>
        <span className="text-eink-textSecondary truncate text-[11px]">
          {data?.message || 'authentication'}
        </span>
      </div>
      <span className="text-[10px] bg-eink-bg px-1.5 py-0.2 border border-eink-border rounded font-bold ml-2 shrink-0">
        {data?.branchName || 'main'}
      </span>
    </div>
  );
};

export const GitHubExpandedView: React.FC<{ data?: any; onClose: () => void }> = ({ data, onClose }) => {
  const navigate = useNavigate();

  return (
    <div className="space-y-4 font-technical text-xs">
      <div className="flex items-center gap-2 text-eink-text">
        <span className="font-bold text-xs uppercase bg-eink-bg px-2 py-0.5 border border-eink-border rounded">
          ✓ COMMIT DETECTED
        </span>
        <span className="text-[11px] text-eink-textMuted">{data?.timeAgo || '2 minutes ago'}</span>
      </div>

      <div className="p-3.5 bg-eink-surface border border-eink-border rounded-sm space-y-2">
        <p className="font-bold text-sm text-eink-text leading-snug">
          {data?.message || 'feat: add JWT login and refresh token verification'}
        </p>
        <div className="flex flex-wrap items-center gap-2 text-[11px] text-eink-textSecondary">
          <span>branch: <strong className="text-eink-text">{data?.branchName || 'main'}</strong></span>
          <span>•</span>
          <span>hash: <code className="font-mono">{data?.commitHash || 'c92fa01'}</code></span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 text-[11px]">
        <div className="p-2.5 bg-eink-surface border border-eink-border rounded-sm">
          <span className="text-[10px] text-eink-textMuted uppercase block">FILES CHANGED</span>
          <span className="font-bold text-eink-text text-xs">{data?.filesChanged || 4} files</span>
        </div>
        <div className="p-2.5 bg-eink-surface border border-eink-border rounded-sm">
          <span className="text-[10px] text-eink-textMuted uppercase block">LINE DELTAS</span>
          <span className="font-bold text-eink-text text-xs">+127 / -31</span>
        </div>
      </div>

      <div className="flex justify-end gap-2 pt-2">
        <button
          onClick={() => {
            navigate('/github');
            onClose();
          }}
          className="px-4 py-1.5 bg-eink-text text-eink-bg font-bold rounded-sm shadow-eink-sm flex items-center gap-1.5"
        >
          <span>VIEW GITHUB HUB</span>
          <ArrowUpRight className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
};
