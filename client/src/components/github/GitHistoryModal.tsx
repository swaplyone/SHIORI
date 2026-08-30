import React, { useState, useEffect } from 'react';
import {
  X,
  GitCommit,
  GitBranch,
  Calendar,
  User,
  FileText,
  Plus,
  Minus,
  ArrowRight,
  Code
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

interface GitHistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  repoName?: string;
  branchName?: string;
}

export const GitHistoryModal: React.FC<GitHistoryModalProps> = ({
  isOpen,
  onClose,
  repoName = 'SHIORI',
  branchName = 'main'
}) => {
  const { token } = useAuth();
  const [commits, setCommits] = useState<any[]>([]);
  const [selectedCommit, setSelectedCommit] = useState<any | null>(null);
  const [commitDetail, setCommitDetail] = useState<any | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!isOpen || !token) return;
    setLoading(true);
    fetch(`/api/github/history?repo=${encodeURIComponent(repoName)}&branch=${encodeURIComponent(branchName)}`, {
      headers: { Authorization: `Bearer ${token}` }
    })
      .then((res) => res.json())
      .then((data) => {
        setCommits(data.commits || []);
        if (data.commits && data.commits.length > 0) {
          setSelectedCommit(data.commits[0]);
        }
      })
      .catch((err) => console.error(err))
      .finally(() => setLoading(false));
  }, [isOpen, repoName, branchName, token]);

  // Load commit detail & diff
  useEffect(() => {
    if (!selectedCommit || !token) return;
    fetch(`/api/github/commit/${selectedCommit.hash}`, {
      headers: { Authorization: `Bearer ${token}` }
    })
      .then((res) => res.json())
      .then((data) => {
        setCommitDetail(data.commit || null);
      })
      .catch((err) => console.error(err));
  }, [selectedCommit, token]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-eink-text/40 backdrop-blur-[1px] flex items-center justify-center p-4 font-sans select-none animate-fade-in">
      <div className="bg-eink-bg border-2 border-eink-text w-full max-w-4xl max-h-[90vh] flex flex-col rounded-sm shadow-2xl overflow-hidden font-technical">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-eink-border bg-eink-surface">
          <div className="flex items-center gap-2">
            <GitCommit className="w-4 h-4 text-eink-text" />
            <span className="font-bold text-sm uppercase text-eink-text tracking-wider">
              GIT REPOSITORY HISTORY
            </span>
            <span className="text-[10px] bg-eink-bg px-2 py-0.5 border border-eink-border rounded font-mono font-bold">
              {repoName}
            </span>
            <span className="text-[10px] text-eink-textMuted font-mono">
              branch: {branchName}
            </span>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-eink-textMuted hover:text-eink-text rounded hover:bg-eink-surfaceHover transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Main Body */}
        <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
          {/* Left Column: Commits List */}
          <div className="w-full md:w-80 border-r border-eink-border bg-eink-surface/50 p-3 overflow-y-auto space-y-2">
            <span className="text-[10px] uppercase font-bold text-eink-textMuted block mb-2 tracking-wider">
              COMMITS ({commits.length})
            </span>

            {commits.map((c) => {
              const isSelected = selectedCommit?.hash === c.hash;
              return (
                <div
                  key={c.hash}
                  onClick={() => setSelectedCommit(c)}
                  className={`p-3 border rounded-sm cursor-pointer transition-all ${
                    isSelected
                      ? 'bg-eink-text text-eink-bg font-bold border-eink-text shadow-eink-sm'
                      : 'bg-eink-bg text-eink-text hover:bg-eink-surfaceHover border-eink-border'
                  }`}
                >
                  <div className="flex items-center justify-between text-xs font-mono">
                    <span className="font-bold">⎇ {c.hash}</span>
                    <span className={`text-[10px] ${isSelected ? 'text-eink-bg/80' : 'text-eink-textMuted'}`}>
                      {c.date}
                    </span>
                  </div>
                  <h4 className={`text-xs truncate mt-1 ${isSelected ? 'text-eink-bg' : 'text-eink-text font-bold'}`}>
                    {c.message}
                  </h4>
                  <div className="flex items-center justify-between text-[10px] mt-1.5 font-mono">
                    <span className={isSelected ? 'text-eink-bg/80' : 'text-eink-textSecondary'}>{c.author}</span>
                    <span className="flex items-center gap-1.5">
                      <span className={isSelected ? 'text-eink-bg' : 'text-eink-text font-bold'}>+{c.additions}</span>
                      <span className={isSelected ? 'text-eink-bg/70' : 'text-eink-textMuted'}>-{c.deletions}</span>
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Right Column: Commit Diff & File Changes */}
          <div className="flex-1 flex flex-col bg-eink-bg p-4 overflow-y-auto space-y-4">
            {selectedCommit && (
              <>
                {/* Commit info header */}
                <div className="p-3 bg-eink-surface border border-eink-border rounded-sm space-y-2 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="font-mono font-bold text-sm text-eink-text">COMMIT {selectedCommit.hash}</span>
                    <span className="text-[10px] text-eink-textMuted font-mono">{selectedCommit.date}</span>
                  </div>
                  <p className="font-bold text-sm text-eink-text">{selectedCommit.message}</p>
                  <div className="flex items-center gap-4 text-[11px] text-eink-textSecondary font-mono border-t border-eink-border pt-2">
                    <span>Author: <strong className="text-eink-text">{selectedCommit.author}</strong></span>
                    <span>+{selectedCommit.additions} additions</span>
                    <span>-{selectedCommit.deletions} deletions</span>
                  </div>
                </div>

                {/* Diff Chunks */}
                <div className="space-y-3">
                  <span className="text-[10px] uppercase font-bold text-eink-textMuted tracking-wider block">
                    CHANGED FILES & CODE DIFF
                  </span>

                  {commitDetail?.files?.map((f: any) => (
                    <div key={f.filename} className="border border-eink-border rounded-sm overflow-hidden text-xs font-mono">
                      <div className="bg-eink-surface p-2 border-b border-eink-border flex items-center justify-between">
                        <span className="font-bold text-eink-text">{f.filename}</span>
                        <div className="flex items-center gap-2 text-[10px]">
                          <span className="font-bold text-eink-text">+{f.additions}</span>
                          <span className="text-eink-textMuted">-{f.deletions}</span>
                        </div>
                      </div>
                      <pre className="p-3 bg-eink-bg text-eink-text whitespace-pre overflow-x-auto text-[11px] leading-relaxed">
                        {f.diff}
                      </pre>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="p-3 border-t border-eink-border bg-eink-surface flex items-center justify-between text-[11px] text-eink-textMuted">
          <span>Git history connected to development tasks</span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 border border-eink-border hover:bg-eink-bg text-eink-text font-bold rounded-sm transition-colors"
          >
            CLOSE
          </button>
        </div>
      </div>
    </div>
  );
};
