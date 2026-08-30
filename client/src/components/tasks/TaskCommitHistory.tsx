import React, { useState, useEffect } from 'react';
import {
  GitCommit,
  GitBranch,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  ChevronDown,
  ChevronUp,
  FileCode,
  User,
  Clock,
  ExternalLink,
  Sparkles
} from 'lucide-react';
import { TaskCommit } from '../../types';
import { useAuth } from '../../context/AuthContext';

interface TaskCommitHistoryProps {
  taskId: string;
  taskCode: string;
  initialCommits?: TaskCommit[];
}

export const TaskCommitHistory: React.FC<TaskCommitHistoryProps> = ({
  taskId,
  taskCode,
  initialCommits
}) => {
  const { token } = useAuth();
  const [commits, setCommits] = useState<TaskCommit[]>(initialCommits || []);
  const [loading, setLoading] = useState(!initialCommits || initialCommits.length === 0);
  const [expandedCommitId, setExpandedCommitId] = useState<string | null>(null);

  const fetchCommits = async () => {
    if (!taskId || !token) return;
    try {
      setLoading(true);
      const res = await fetch(`/api/tasks/${taskId}/commits`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setCommits(data.commits || []);
      }
    } catch (err) {
      console.error('Failed to load task commits:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCommits();

    const handleRefresh = () => fetchCommits();
    window.addEventListener('shiori-refresh', handleRefresh);
    return () => window.removeEventListener('shiori-refresh', handleRefresh);
  }, [taskId, token]);

  const toggleExpand = (commitId: string) => {
    setExpandedCommitId(expandedCommitId === commitId ? null : commitId);
  };

  const formatDate = (dateStr: string) => {
    try {
      const d = new Date(dateStr);
      return d.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric'
      }) + ' · ' + d.toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit'
      });
    } catch {
      return dateStr || 'Recently';
    }
  };

  return (
    <div className="space-y-3 font-sans select-none">
      <div className="flex items-center justify-between border-b border-eink-border pb-2">
        <div className="flex items-center gap-2">
          <GitCommit className="w-3.5 h-3.5 text-eink-text" />
          <h4 className="font-technical font-bold text-xs uppercase tracking-wider text-eink-text">
            COMMIT HISTORY
          </h4>
          <span className="text-[10px] font-mono bg-eink-surface border border-eink-border px-1.5 py-0.2 rounded font-bold text-eink-textMuted">
            {commits.length}
          </span>
        </div>
      </div>

      {loading && commits.length === 0 ? (
        <div className="p-4 bg-eink-surface/50 border border-eink-border rounded-sm text-center text-xs font-technical text-eink-textMuted animate-pulse">
          Scanning commit history for {taskCode}...
        </div>
      ) : commits.length === 0 ? (
        <div className="p-4 bg-eink-surface/30 border border-eink-border border-dashed rounded-sm text-center space-y-1">
          <p className="font-technical font-bold text-xs text-eink-text">
            No commits linked to this task yet.
          </p>
          <p className="text-[11px] text-eink-textMuted font-mono">
            Include <span className="font-bold text-eink-text underline">{taskCode}</span> in your Git commit message to automatically link commits.
          </p>
        </div>
      ) : (
        <div className="relative pl-3 border-l-2 border-eink-border space-y-3 pt-1">
          {commits.map((commit, idx) => {
            const isExpanded = expandedCommitId === commit.id;
            const shortSha = (commit.commit_sha || '').slice(0, 7) || 'commit';
            const isFailed = commit.status === 'failed' || commit.tests_status === 'failed' || commit.error_count > 0;
            const isWarning = commit.status === 'warning' || (commit.warnings && commit.warnings.length > 0);

            return (
              <div key={commit.id || idx} className="relative group">
                {/* Timeline node dot */}
                <div
                  className={`absolute -left-[19px] top-2 w-2.5 h-2.5 rounded-full border-2 border-eink-bg transition-transform group-hover:scale-125 ${
                    isFailed
                      ? 'bg-rose-600'
                      : isWarning
                      ? 'bg-amber-500'
                      : 'bg-eink-text'
                  }`}
                />

                {/* Commit card */}
                <div className="bg-eink-surface/60 hover:bg-eink-surface border border-eink-border rounded-sm p-3 space-y-2 transition-colors">
                  {/* Top line: Message & Short SHA */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="space-y-0.5 min-w-0">
                      <p className="font-technical font-bold text-xs text-eink-text truncate">
                        {commit.commit_message}
                      </p>
                      <div className="flex items-center gap-2 text-[10px] font-mono text-eink-textMuted">
                        <span className="bg-eink-bg px-1 py-0.2 border border-eink-border rounded font-bold text-eink-text">
                          {shortSha}
                        </span>
                        <span>·</span>
                        <span>{formatDate(commit.committed_at)}</span>
                      </div>
                    </div>

                    <button
                      onClick={() => toggleExpand(commit.id)}
                      className="text-eink-textMuted hover:text-eink-text p-1 text-[10px] font-mono flex items-center gap-0.5 cursor-pointer shrink-0"
                    >
                      <span>{isExpanded ? 'LESS' : 'DETAILS'}</span>
                      {isExpanded ? (
                        <ChevronUp className="w-3 h-3" />
                      ) : (
                        <ChevronDown className="w-3 h-3" />
                      )}
                    </button>
                  </div>

                  {/* Middle specs: Author, files, diff, status */}
                  <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-eink-border/40 text-[11px] font-technical text-eink-textSecondary">
                    <div className="flex items-center gap-3">
                      <span className="flex items-center gap-1 font-medium">
                        <User className="w-3 h-3 text-eink-textMuted" />
                        <span>{commit.author || 'Developer'}</span>
                      </span>

                      <span className="flex items-center gap-1 font-mono text-[10px]">
                        <FileCode className="w-3 h-3 text-eink-textMuted" />
                        <span>{commit.files_changed || 1} files</span>
                      </span>

                      {(commit.insertions > 0 || commit.deletions > 0) && (
                        <span className="font-mono text-[10px]">
                          <span className="text-emerald-700 font-bold">+{commit.insertions}</span>
                          {' / '}
                          <span className="text-rose-700 font-bold">-{commit.deletions}</span>
                        </span>
                      )}
                    </div>

                    {/* Status Badge */}
                    <div className="flex items-center gap-1.5 font-mono text-[10px] font-bold">
                      {isFailed ? (
                        <span className="flex items-center gap-1 text-rose-700 bg-rose-50 border border-rose-200 px-1.5 py-0.2 rounded">
                          <XCircle className="w-2.5 h-2.5" />
                          <span>
                            {commit.error_count > 0 ? `${commit.error_count} ERRORS` : 'FAILED'}
                          </span>
                        </span>
                      ) : isWarning ? (
                        <span className="flex items-center gap-1 text-amber-700 bg-amber-50 border border-amber-200 px-1.5 py-0.2 rounded">
                          <AlertTriangle className="w-2.5 h-2.5" />
                          <span>WARNINGS</span>
                        </span>
                      ) : (
                        <span className="flex items-center gap-1 text-emerald-700 bg-emerald-50 border border-emerald-200 px-1.5 py-0.2 rounded">
                          <CheckCircle2 className="w-2.5 h-2.5" />
                          <span>TESTS PASSED</span>
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Expanded Details Drawer */}
                  {isExpanded && (
                    <div className="mt-2 pt-2 border-t border-eink-border space-y-2 text-[11px] font-mono bg-eink-bg p-2.5 rounded-sm animate-fade-in">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[10px]">
                        <div>
                          <span className="text-eink-textMuted uppercase block">FULL COMMIT SHA</span>
                          <span className="text-eink-text select-all font-mono break-all">
                            {commit.commit_sha}
                          </span>
                        </div>
                        <div>
                          <span className="text-eink-textMuted uppercase block">BRANCH</span>
                          <span className="text-eink-text font-bold">
                            {commit.branch || 'main'}
                          </span>
                        </div>
                      </div>

                      {commit.ai_source && (
                        <div>
                          <span className="text-eink-textMuted uppercase block text-[9px]">AI ASSISTANT</span>
                          <span className="text-eink-text flex items-center gap-1">
                            <Sparkles className="w-2.5 h-2.5 text-eink-textMuted" />
                            <span>{commit.ai_source}</span>
                          </span>
                        </div>
                      )}

                      {commit.error_details && (
                        <div className="bg-rose-50 border border-rose-200 p-2 rounded text-[10px] text-rose-800 space-y-1">
                          <span className="font-bold block uppercase">ERROR DETAILS:</span>
                          <pre className="whitespace-pre-wrap font-mono">{commit.error_details}</pre>
                        </div>
                      )}

                      {commit.warnings && (
                        <div className="bg-amber-50 border border-amber-200 p-2 rounded text-[10px] text-amber-800 space-y-1">
                          <span className="font-bold block uppercase">WARNING DETAILS:</span>
                          <pre className="whitespace-pre-wrap font-mono">{commit.warnings}</pre>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
