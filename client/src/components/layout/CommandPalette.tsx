import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, X, CheckSquare, GitCommit, GitPullRequest, FolderGit2, User, ArrowRight } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectTask?: (taskId: string) => void;
}

export const CommandPalette: React.FC<CommandPaletteProps> = ({ isOpen, onClose, onSelectTask }) => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<{
    tasks: any[];
    commits: any[];
    prs: any[];
    projects: any[];
    friends: any[];
  }>({ tasks: [], commits: [], prs: [], projects: [], friends: [] });

  const inputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();
  const { token } = useAuth();

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 50);
    } else {
      setQuery('');
    }
  }, [isOpen]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.key === '/' && document.activeElement?.tagName !== 'INPUT' && document.activeElement?.tagName !== 'TEXTAREA') ||
          (e.key === 'k' && (e.metaKey || e.ctrlKey))) {
        e.preventDefault();
        if (!isOpen) {
          // Open
        }
      }
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Search query effect
  useEffect(() => {
    if (!query.trim() || !token) {
      setResults({ tasks: [], commits: [], prs: [], projects: [], friends: [] });
      return;
    }

    const searchApi = async () => {
      try {
        const q = query.toLowerCase();
        // Fetch tasks
        const resTasks = await fetch(`/api/tasks?search=${encodeURIComponent(query)}`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        const dataTasks = await resTasks.json();

        // Sample static matching for commits/prs/projects
        const matchedCommits = [
          { hash: 'a83f21c', message: 'fix: compiler error rendering', branch: 'feature/error-page', taskId: 'task-042-compiler' },
          { hash: '91bc832', message: 'feat: add error state diagnostic', branch: 'feature/error-page', taskId: 'task-042-compiler' },
          { hash: 'c92fa01', message: 'feat: add JWT login & auth token rotation', branch: 'feature/auth', taskId: 'task-039-auth' },
          { hash: 'b149ee0', message: 'feat: complete webhook HMAC validation', branch: 'main', taskId: 'task-018-gh' }
        ].filter(c => c.message.toLowerCase().includes(q) || c.hash.includes(q) || c.branch.includes(q));

        const matchedPRs = [
          { number: 31, title: 'Improve compiler error handling', state: 'OPEN', taskId: 'task-042-compiler' },
          { number: 42, title: 'Authentication API & Token Rotation', state: 'OPEN', taskId: 'task-039-auth' },
          { number: 28, title: 'Setup GitHub webhooks & signature verification', state: 'MERGED', taskId: 'task-018-gh' }
        ].filter(pr => pr.title.toLowerCase().includes(q) || String(pr.number).includes(q));

        // Fetch real projects
        let matchedProjects: any[] = [];
        try {
          const resProj = await fetch('/api/projects', {
            headers: { Authorization: `Bearer ${token}` }
          });
          if (resProj.ok) {
            const dataProj = await resProj.json();
            const projs = dataProj.projects || [];
            matchedProjects = projs
              .map((p: any) => ({ id: p.id, name: p.name, repo: p.github_repo_name || p.name }))
              .filter((p: any) => p.name.toLowerCase().includes(q) || p.repo.toLowerCase().includes(q));
          }
        } catch {
          // ignore
        }

        setResults({
          tasks: dataTasks.tasks || [],
          commits: matchedCommits,
          prs: matchedPRs,
          projects: matchedProjects,
          friends: []
        });
      } catch (err) {
        console.error('Search error:', err);
      }
    };

    const timer = setTimeout(searchApi, 150);
    return () => clearTimeout(timer);
  }, [query, token]);

  if (!isOpen) return null;

  const totalResults = results.tasks.length + results.commits.length + results.prs.length + results.projects.length + results.friends.length;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-20 px-4">
      <div className="fixed inset-0 bg-black/40 backdrop-blur-[2px]" onClick={onClose} />

      <div className="relative w-full max-w-2xl bg-eink-bg border border-eink-border shadow-2xl rounded-sm overflow-hidden z-10 font-sans">
        {/* Search Header */}
        <div className="p-4 border-b border-eink-border flex items-center gap-3 bg-eink-surface">
          <Search className="w-5 h-5 text-eink-textSecondary shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search tasks, commits, PRs, projects, friends... (e.g. authentication, TASK-042)"
            className="w-full bg-transparent text-eink-text placeholder:text-eink-textMuted font-technical text-sm outline-none"
          />
          {query && (
            <button onClick={() => setQuery('')} className="text-eink-textMuted hover:text-eink-text">
              <X className="w-4 h-4" />
            </button>
          )}
          <span className="text-[10px] font-technical text-eink-textMuted px-1.5 py-0.5 border border-eink-border rounded">
            ESC
          </span>
        </div>

        {/* Results Container */}
        <div className="max-h-[60vh] overflow-y-auto p-4 space-y-6 divide-y divide-eink-border/40">
          {!query && (
            <div className="py-8 text-center text-xs text-eink-textMuted font-technical space-y-1">
              <p>Type to search across your workspace and GitHub activity</p>
              <p className="text-[11px]">Shortcuts: Press <kbd className="border border-eink-border px-1 rounded">N</kbd> for new task, <kbd className="border border-eink-border px-1 rounded">G</kbd> for GitHub, <kbd className="border border-eink-border px-1 rounded">/</kbd> to search</p>
            </div>
          )}

          {query && totalResults === 0 && (
            <div className="py-8 text-center text-xs text-eink-textMuted font-technical">
              No matching records found for "{query}"
            </div>
          )}

          {/* TASKS */}
          {results.tasks.length > 0 && (
            <div className="pt-2">
              <h4 className="text-[11px] font-technical font-bold text-eink-textMuted uppercase mb-2 tracking-wider">
                TASKS ({results.tasks.length})
              </h4>
              <div className="space-y-1">
                {results.tasks.map((task) => (
                  <button
                    key={task.id}
                    onClick={() => {
                      if (onSelectTask) onSelectTask(task.id);
                      else navigate(`/tasks/${task.id}`);
                      onClose();
                    }}
                    className="w-full flex items-center justify-between p-2.5 hover:bg-eink-surface border border-transparent hover:border-eink-border rounded text-left transition-colors group"
                  >
                    <div className="flex items-center gap-3">
                      <CheckSquare className="w-4 h-4 text-eink-textSecondary shrink-0" />
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-technical text-xs font-bold text-eink-text">{task.task_code}</span>
                          <span className="text-xs font-medium text-eink-text truncate">{task.title}</span>
                        </div>
                        <p className="text-[11px] font-technical text-eink-textMuted">
                          {task.project_name || 'Project'} • {task.status} {task.github_ci_status ? `• CI ${task.github_ci_status}` : ''}
                        </p>
                      </div>
                    </div>
                    <ArrowRight className="w-3.5 h-3.5 opacity-0 group-hover:opacity-100 text-eink-text" />
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* COMMITS */}
          {results.commits.length > 0 && (
            <div className="pt-3">
              <h4 className="text-[11px] font-technical font-bold text-eink-textMuted uppercase mb-2 tracking-wider">
                COMMITS ({results.commits.length})
              </h4>
              <div className="space-y-1">
                {results.commits.map((commit, idx) => (
                  <button
                    key={idx}
                    onClick={() => {
                      navigate(`/github`);
                      onClose();
                    }}
                    className="w-full flex items-center justify-between p-2.5 hover:bg-eink-surface border border-transparent hover:border-eink-border rounded text-left transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <GitCommit className="w-4 h-4 text-eink-textSecondary shrink-0" />
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-technical text-xs font-bold bg-eink-surface px-1 border border-eink-border rounded">{commit.hash}</span>
                          <span className="text-xs text-eink-text truncate">{commit.message}</span>
                        </div>
                        <p className="text-[11px] font-technical text-eink-textMuted">{commit.branch}</p>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* PULL REQUESTS */}
          {results.prs.length > 0 && (
            <div className="pt-3">
              <h4 className="text-[11px] font-technical font-bold text-eink-textMuted uppercase mb-2 tracking-wider">
                PULL REQUESTS ({results.prs.length})
              </h4>
              <div className="space-y-1">
                {results.prs.map((pr, idx) => (
                  <button
                    key={idx}
                    onClick={() => {
                      navigate(`/github`);
                      onClose();
                    }}
                    className="w-full flex items-center justify-between p-2.5 hover:bg-eink-surface border border-transparent hover:border-eink-border rounded text-left transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <GitPullRequest className="w-4 h-4 text-eink-textSecondary shrink-0" />
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-technical text-xs font-bold">#{pr.number}</span>
                          <span className="text-xs text-eink-text truncate">{pr.title}</span>
                          <span className="text-[10px] font-technical border border-eink-border px-1 rounded">{pr.state}</span>
                        </div>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* PROJECTS */}
          {results.projects.length > 0 && (
            <div className="pt-3">
              <h4 className="text-[11px] font-technical font-bold text-eink-textMuted uppercase mb-2 tracking-wider">
                PROJECTS ({results.projects.length})
              </h4>
              <div className="space-y-1">
                {results.projects.map((proj) => (
                  <button
                    key={proj.id}
                    onClick={() => {
                      navigate(`/projects`);
                      onClose();
                    }}
                    className="w-full flex items-center justify-between p-2.5 hover:bg-eink-surface border border-transparent hover:border-eink-border rounded text-left transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <FolderGit2 className="w-4 h-4 text-eink-textSecondary shrink-0" />
                      <div>
                        <p className="text-xs font-bold text-eink-text">{proj.name}</p>
                        <p className="text-[11px] font-technical text-eink-textMuted">{proj.repo}</p>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* CONNECTIONS */}
          {results.friends.length > 0 && (
            <div className="pt-3">
              <h4 className="text-[11px] font-technical font-bold text-eink-textMuted uppercase mb-2 tracking-wider">
                CONNECTIONS ({results.friends.length})
              </h4>
              <div className="space-y-1">
                {results.friends.map((friend, idx) => (
                  <button
                    key={idx}
                    onClick={() => {
                      navigate(`/connections`);
                      onClose();
                    }}
                    className="w-full flex items-center justify-between p-2.5 hover:bg-eink-surface border border-transparent hover:border-eink-border rounded text-left transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <User className="w-4 h-4 text-eink-textSecondary shrink-0" />
                      <div>
                        <p className="text-xs font-bold text-eink-text">{friend.name}</p>
                        <p className="text-[11px] text-eink-textMuted">{friend.role} • Active: {friend.activeTask}</p>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
