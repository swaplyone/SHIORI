import React, { useState, useEffect } from 'react';
import { X, Plus, GitBranch, Github, Users, Calendar } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { TaskStatus, TaskPriority } from '../../types';

interface TaskCreateModalProps {
  isOpen: boolean;
  initialStatus?: TaskStatus;
  initialRepo?: string;
  onClose: () => void;
  onTaskCreated: () => void;
}

export const TaskCreateModal: React.FC<TaskCreateModalProps> = ({
  isOpen,
  initialStatus = 'TODO',
  initialRepo,
  onClose,
  onTaskCreated,
}) => {
  const { token, user } = useAuth();
  const [repositories, setRepositories] = useState<any[]>([]);
  const [connections, setConnections] = useState<any[]>([]);
  const [githubRepo, setGithubRepo] = useState(initialRepo || 'swaply-one-compiler');
  const [githubBranch, setGithubBranch] = useState('main');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [status, setStatus] = useState<TaskStatus>(initialStatus);
  const [priority, setPriority] = useState<TaskPriority>('MEDIUM');
  const [dueDate, setDueDate] = useState('Tomorrow');
  const [assigneeId, setAssigneeId] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isOpen && token) {
      // 1. Fetch enabled user repositories
      fetch('/api/github/user-repositories', {
        headers: { Authorization: `Bearer ${token}` }
      })
        .then((res) => res.json())
        .then((data) => {
          const repos = data.repositories || [];
          setRepositories(repos);
          if (repos.length > 0 && !initialRepo) {
            setGithubRepo(repos[0].name);
            setGithubBranch(repos[0].defaultBranch || 'main');
          }
        })
        .catch((err) => console.error(err));

      // 2. Fetch connected friends
      fetch('/api/connections/list', {
        headers: { Authorization: `Bearer ${token}` }
      })
        .then((res) => res.json())
        .then((data) => {
          setConnections(data.connections || []);
        })
        .catch((err) => console.error(err));
    }
  }, [isOpen, token, initialRepo]);

  useEffect(() => {
    setStatus(initialStatus);
  }, [initialStatus]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !githubRepo || !token) return;

    setLoading(true);
    try {
      const res = await fetch('/api/tasks', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          projectId: 'default',
          title: title.trim(),
          description: description.trim() || null,
          status,
          priority,
          dueDate: dueDate.trim() || null,
          githubRepo,
          githubBranch: githubBranch.trim() || 'main',
          assigneeId: assigneeId || null
        })
      });

      if (res.ok) {
        setTitle('');
        setDescription('');
        setGithubBranch('main');
        window.dispatchEvent(new Event('shiori-refresh'));
        onTaskCreated();
        onClose();
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 select-none font-sans">
      <div className="fixed inset-0 bg-black/40 backdrop-blur-[1px]" onClick={onClose} />

      <div className="relative w-full max-w-lg bg-eink-bg border border-eink-border shadow-2xl rounded-sm p-6 z-10 space-y-4 font-technical">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-eink-border">
          <div className="flex items-center gap-2">
            <span className="w-5 h-5 bg-eink-text text-eink-bg rounded-sm flex items-center justify-center font-technical font-bold text-xs">
              +
            </span>
            <h3 className="font-bold text-sm text-eink-text uppercase tracking-wider">
              ADD TODO
            </h3>
          </div>
          <button onClick={onClose} className="p-1 text-eink-textMuted hover:text-eink-text">
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 text-xs font-sans">
          {/* Title (Required) */}
          <div>
            <label className="block text-[11px] font-technical font-bold text-eink-textMuted uppercase mb-1">
              TODO TITLE *
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Fix authentication & token expiration"
              className="w-full px-3 py-2 bg-eink-surface border border-eink-border rounded-sm text-xs text-eink-text outline-none font-sans"
              required
              autoFocus
            />
          </div>

          {/* Repository & Branch (Required) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-technical font-bold text-eink-textMuted uppercase mb-1 flex items-center gap-1">
                <Github className="w-3 h-3 text-eink-text" />
                <span>GITHUB REPOSITORY *</span>
              </label>
              <select
                value={githubRepo}
                onChange={(e) => {
                  setGithubRepo(e.target.value);
                  const found = repositories.find((r) => r.name === e.target.value);
                  if (found?.default_branch) setGithubBranch(found.default_branch);
                }}
                className="w-full px-2.5 py-2 bg-eink-surface border border-eink-border rounded-sm text-xs font-technical text-eink-text outline-none font-mono"
                required
              >
                {repositories.length > 0 ? (
                  repositories.map((r) => (
                    <option key={r.name} value={r.name}>
                      {r.name}
                    </option>
                  ))
                ) : (
                  <>
                    <option value="swaply-one-compiler">swaply-one-compiler</option>
                    <option value="shiori-web">shiori-web</option>
                    <option value="personal-website">personal-website</option>
                    <option value="ai-artisan-marketplace">ai-artisan-marketplace</option>
                  </>
                )}
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-technical font-bold text-eink-textMuted uppercase mb-1 flex items-center gap-1">
                <GitBranch className="w-3 h-3 text-eink-text" />
                <span>GITHUB BRANCH *</span>
              </label>
              <input
                type="text"
                value={githubBranch}
                onChange={(e) => setGithubBranch(e.target.value)}
                placeholder="main or feature/auth"
                className="w-full px-2.5 py-2 bg-eink-surface border border-eink-border rounded-sm text-xs font-technical text-eink-text outline-none font-mono"
                required
              />
            </div>
          </div>

          {/* Description (Optional) */}
          <div>
            <label className="block text-[11px] font-technical font-bold text-eink-textMuted uppercase mb-1">
              DESCRIPTION (OPTIONAL)
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Technical specifications, notes or steps..."
              rows={2}
              className="w-full px-3 py-2 bg-eink-surface border border-eink-border rounded-sm text-xs text-eink-text outline-none resize-none font-sans"
            />
          </div>

          {/* Grid: Status, Due Date, Assignee */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-[10px] font-technical text-eink-textMuted uppercase mb-1">
                STATUS
              </label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as TaskStatus)}
                className="w-full px-2 py-1.5 bg-eink-surface border border-eink-border rounded-sm text-xs font-technical outline-none text-eink-text"
              >
                <option value="TODO">○ PENDING</option>
                <option value="IN_PROGRESS">◐ IN PROGRESS</option>
                <option value="DONE">✓ COMPLETED</option>
              </select>
            </div>

            <div>
              <label className="block text-[10px] font-technical text-eink-textMuted uppercase mb-1">
                DUE DATE
              </label>
              <input
                type="text"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                placeholder="Tomorrow"
                className="w-full px-2 py-1.5 bg-eink-surface border border-eink-border rounded-sm text-xs font-technical outline-none text-eink-text"
              />
            </div>

            <div>
              <label className="block text-[10px] font-technical text-eink-textMuted uppercase mb-1">
                ASSIGN TO (FRIEND)
              </label>
              <select
                value={assigneeId}
                onChange={(e) => setAssigneeId(e.target.value)}
                className="w-full px-2 py-1.5 bg-eink-surface border border-eink-border rounded-sm text-xs font-technical outline-none text-eink-text"
              >
                <option value="">Self ({user?.name || 'You'})</option>
                {connections.map((c) => (
                  <option key={c.userId} value={c.userId}>
                    {c.name} ({c.shioriId})
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Submit Buttons */}
          <div className="pt-3 flex items-center justify-end gap-2 border-t border-eink-border">
            <button
              type="button"
              onClick={onClose}
              className="py-1.5 px-3 border border-eink-border text-xs font-technical text-eink-textSecondary hover:bg-eink-surface rounded-sm"
            >
              CANCEL
            </button>
            <button
              type="submit"
              disabled={loading || !title.trim()}
              className="py-1.5 px-4 bg-eink-text text-eink-bg text-xs font-technical font-bold rounded-sm shadow-eink-sm hover:opacity-90 disabled:opacity-50"
            >
              {loading ? 'ADDING...' : 'ADD TODO'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
