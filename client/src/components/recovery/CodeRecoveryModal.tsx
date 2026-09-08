import React, { useState, useEffect } from 'react';
import {
  X,
  RotateCcw,
  GitCommit,
  FileCode,
  Check,
  Copy,
  ArrowRight,
  ShieldCheck,
  Eye,
  Columns,
  History,
  FileText,
  Loader2
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

interface CodeRecoveryModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultRepo?: string;
  defaultFilePath?: string;
  taskId?: string;
}

interface FileVersion {
  commitSha: string;
  isCurrent: boolean;
  date: string;
  message: string;
  author: string;
  content: string;
  linesCount: number;
}

export const CodeRecoveryModal: React.FC<CodeRecoveryModalProps> = ({
  isOpen,
  onClose,
  defaultRepo = 'SHIORI',
  defaultFilePath = '',
  taskId
}) => {
  const { token } = useAuth();
  const [repo, setRepo] = useState(defaultRepo);
  const [filePath, setFilePath] = useState(defaultFilePath);
  const [availableFiles, setAvailableFiles] = useState<any[]>([]);
  const [versions, setVersions] = useState<FileVersion[]>([]);
  const [selectedVersion, setSelectedVersion] = useState<FileVersion | null>(null);
  const [viewMode, setViewMode] = useState<'view' | 'diff'>('view');
  const [isRestoring, setIsRestoring] = useState(false);
  const [restoreSuccess, setRestoreSuccess] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  // Sync repo when modal opens with new defaultRepo
  useEffect(() => {
    if (isOpen) {
      setRepo(defaultRepo || 'SHIORI');
      if (defaultFilePath) setFilePath(defaultFilePath);
    }
  }, [isOpen, defaultRepo, defaultFilePath]);

  // Load available files
  useEffect(() => {
    if (!isOpen || !token) return;
    fetch(`/api/recovery/files?repo=${encodeURIComponent(repo)}`, {
      headers: { Authorization: `Bearer ${token}` }
    })
      .then((res) => res.json())
      .then((data) => {
        const files = data.files || [];
        setAvailableFiles(files);
        if (files.length > 0) {
          // If current filePath is not among files, default to first file
          const exists = files.some((f: any) => f.path === filePath);
          if (!filePath || !exists) {
            setFilePath(files[0].path);
          }
        }
      })
      .catch((err) => console.error(err));
  }, [isOpen, repo, token]);

  // Load file version history
  useEffect(() => {
    if (!isOpen || !token || !filePath) return;
    setLoading(true);
    fetch(`/api/recovery/file-history?repo=${encodeURIComponent(repo)}&filePath=${encodeURIComponent(filePath)}`, {
      headers: { Authorization: `Bearer ${token}` }
    })
      .then((res) => res.json())
      .then((data) => {
        const list: FileVersion[] = data.versions || [];
        setVersions(list);
        if (list.length > 0) {
          setSelectedVersion(list[1] || list[0]); // Default to first historical commit if exists
        } else {
          setSelectedVersion(null);
        }
        setRestoreSuccess(null);
      })
      .catch((err) => console.error(err))
      .finally(() => setLoading(false));
  }, [isOpen, repo, filePath, token]);

  const handleCopyCode = () => {
    if (!selectedVersion?.content) return;
    navigator.clipboard.writeText(selectedVersion.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (!isOpen) return null;

  const currentVersion = versions.find((v) => v.isCurrent) || versions[0];

  const handleRestore = async () => {
    if (!selectedVersion || !token) return;
    setIsRestoring(true);
    try {
      const res = await fetch('/api/recovery/restore', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          repo,
          filePath,
          commitSha: selectedVersion.commitSha,
          taskId
        })
      });
      const data = await res.json();
      if (res.ok) {
        setRestoreSuccess(data.recoveryBranch || `recovery/${selectedVersion.commitSha}`);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsRestoring(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-eink-text/40 backdrop-blur-[1px] flex items-center justify-center p-4 font-sans select-none animate-fade-in">
      <div className="bg-eink-bg border-2 border-eink-text w-full max-w-4xl max-h-[90vh] flex flex-col rounded-sm shadow-2xl overflow-hidden font-technical">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-eink-border bg-eink-surface">
          <div className="flex items-center gap-2">
            <RotateCcw className="w-4 h-4 text-eink-text" />
            <span className="font-bold text-sm uppercase text-eink-text tracking-wider">
              CODE RECOVERY & VERSION HISTORY
            </span>
            <span className="text-[10px] bg-eink-bg px-2 py-0.5 border border-eink-border rounded font-mono font-bold">
              {repo}
            </span>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-eink-textMuted hover:text-eink-text rounded hover:bg-eink-surfaceHover transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Top File Selector Strip */}
        <div className="p-3 border-b border-eink-border bg-eink-bg flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2">
            <FileCode className="w-4 h-4 text-eink-textSecondary" />
            <span className="text-[10px] text-eink-textMuted uppercase font-bold">FILE:</span>
            <select
              value={filePath}
              onChange={(e) => setFilePath(e.target.value)}
              className="px-2.5 py-1 bg-eink-surface border border-eink-border rounded-sm text-eink-text font-mono text-xs outline-none"
            >
              {availableFiles.map((f) => (
                <option key={f.path} value={f.path}>
                  {f.path} ({f.versionsCount} versions)
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-1">
            <button
              onClick={() => setViewMode('view')}
              className={`px-2.5 py-1 border rounded-sm flex items-center gap-1.5 text-xs ${
                viewMode === 'view'
                  ? 'bg-eink-text text-eink-bg font-bold border-eink-text'
                  : 'bg-eink-surface text-eink-text border-eink-border'
              }`}
            >
              <Eye className="w-3.5 h-3.5" />
              <span>INSPECT</span>
            </button>
            <button
              onClick={() => setViewMode('diff')}
              className={`px-2.5 py-1 border rounded-sm flex items-center gap-1.5 text-xs ${
                viewMode === 'diff'
                  ? 'bg-eink-text text-eink-bg font-bold border-eink-text'
                  : 'bg-eink-surface text-eink-text border-eink-border'
              }`}
            >
              <Columns className="w-3.5 h-3.5" />
              <span>COMPARE DIFF</span>
            </button>
          </div>
        </div>

        {/* Main Body */}
        <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
          {/* Left Column: Version Timeline */}
          <div className="w-full md:w-72 border-r border-eink-border bg-eink-surface/50 p-3 overflow-y-auto space-y-2">
            <span className="text-[10px] uppercase font-bold text-eink-textMuted block mb-2 tracking-wider">
              AVAILABLE VERSIONS
            </span>

            {versions.map((ver, idx) => {
              const isSelected = selectedVersion?.commitSha === ver.commitSha;
              return (
                <div
                  key={ver.commitSha}
                  onClick={() => setSelectedVersion(ver)}
                  className={`p-2.5 border rounded-sm cursor-pointer transition-all ${
                    isSelected
                      ? 'bg-eink-text text-eink-bg font-bold border-eink-text shadow-eink-sm'
                      : 'bg-eink-bg text-eink-text hover:bg-eink-surfaceHover border-eink-border'
                  }`}
                >
                  <div className="flex items-center justify-between text-xs font-mono">
                    <span className="font-bold">
                      {ver.isCurrent ? '● CURRENT' : `⎇ ${ver.commitSha}`}
                    </span>
                    <span className={`text-[10px] ${isSelected ? 'text-eink-bg/80' : 'text-eink-textMuted'}`}>
                      {ver.date}
                    </span>
                  </div>
                  <p className={`text-[11px] truncate mt-1 ${isSelected ? 'text-eink-bg/90 font-normal' : 'text-eink-textSecondary'}`}>
                    {ver.message}
                  </p>
                  <div className="flex items-center justify-between text-[10px] text-eink-textMuted mt-1">
                    <span>{ver.author}</span>
                    <span>{ver.linesCount} lines</span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Right Column: Code Viewer / Diff */}
          <div className="flex-1 flex flex-col bg-eink-bg p-4 overflow-y-auto">
            {loading ? (
              <div className="flex-1 flex flex-col items-center justify-center p-8 text-center gap-3">
                <Loader2 className="w-6 h-6 animate-spin text-eink-text" />
                <span className="text-xs font-mono font-bold text-eink-textSecondary">
                  Fetching commit history & live file versions from GitHub...
                </span>
              </div>
            ) : selectedVersion ? (
              <div className="space-y-4 flex-1 flex flex-col">
                {/* Active version metadata header */}
                <div className="p-3 bg-eink-surface border border-eink-border rounded-sm flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
                  <div>
                    <span className="font-bold text-eink-text block">
                      {selectedVersion.isCurrent ? 'Current Working Version' : `Version: ${selectedVersion.commitSha}`}
                    </span>
                    <p className="text-[11px] text-eink-textSecondary">{selectedVersion.message}</p>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={handleCopyCode}
                      className={`px-3 py-1.5 border rounded-sm flex items-center gap-1.5 text-xs font-bold transition-all ${
                        copied
                          ? 'bg-eink-text text-eink-bg border-eink-text'
                          : 'bg-eink-surface border-eink-border hover:bg-eink-surfaceHover text-eink-text'
                      }`}
                    >
                      {copied ? <Check className="w-3.5 h-3.5 text-eink-bg" /> : <Copy className="w-3.5 h-3.5" />}
                      <span>{copied ? 'COPIED ✓' : 'COPY CODE'}</span>
                    </button>

                    {!selectedVersion.isCurrent && (
                      <button
                        onClick={handleRestore}
                        disabled={isRestoring}
                        className="px-4 py-1.5 bg-eink-text text-eink-bg font-bold rounded-sm flex items-center gap-1.5 shadow-eink-sm hover:opacity-90 active:scale-[0.99] disabled:opacity-50"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                        <span>{isRestoring ? 'PREPARING...' : 'SAFE RESTORE'}</span>
                      </button>
                    )}
                  </div>
                </div>

                {/* Safe Restore Alert / Confirmation */}
                {restoreSuccess && (
                  <div className="p-3 bg-eink-surface border-2 border-eink-text rounded-sm space-y-1 text-xs">
                    <div className="flex items-center gap-2 text-eink-text font-bold">
                      <ShieldCheck className="w-4 h-4 text-eink-text" />
                      <span>SAFE RESTORATION READY</span>
                    </div>
                    <p className="text-[11px] text-eink-textSecondary">
                      Created safe recovery branch: <strong className="font-mono text-eink-text">{restoreSuccess}</strong>.
                      Your current working tree remains preserved and uncorrupted.
                    </p>
                  </div>
                )}

                {/* Code Content Display */}
                <div className="flex-1 border border-eink-border rounded-sm bg-eink-surface/30 p-3 font-mono text-xs overflow-x-auto">
                  {viewMode === 'view' ? (
                    <pre className="text-eink-text whitespace-pre leading-relaxed font-mono">
                      {selectedVersion.content}
                    </pre>
                  ) : (
                    <div className="space-y-1">
                      <div className="text-[10px] text-eink-textMuted uppercase font-bold border-b border-eink-border pb-1">
                        COMPARING: CURRENT vs {selectedVersion.commitSha}
                      </div>
                      <pre className="text-eink-text whitespace-pre leading-relaxed font-mono">
                        {selectedVersion.content}
                      </pre>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center p-8 text-center gap-2 text-eink-textSecondary">
                <FileCode className="w-8 h-8 opacity-40 mb-1" />
                <span className="font-bold text-sm text-eink-text">No Versions Found</span>
                <span className="text-xs max-w-sm">Select another file or ensure the repository has commits on this path.</span>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="p-3 border-t border-eink-border bg-eink-surface flex items-center justify-between text-[11px] text-eink-textMuted">
          <span>Git is the single source of truth • Safe recovery never deletes current code</span>
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
