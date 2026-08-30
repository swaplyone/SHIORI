import React, { useState, useEffect, useMemo } from 'react';
import { X, Plus, GitBranch, Github, Users, Calendar, Repeat, Bell, Tag, Sparkles, Check } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { TaskStatus, TaskPriority, Task } from '../../types';
import { AiDeveloperHandoffModal } from './AiDeveloperHandoffModal';
import { parseNaturalLanguageTask, ParsedTaskInput } from '../../utils/nlpTaskParser';
import { reminderManager } from '../../utils/reminderManager';

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
  const [recurrenceRule, setRecurrenceRule] = useState('');
  const [reminderPreset, setReminderPreset] = useState('');
  const [tags, setTags] = useState('');
  const [assigneeId, setAssigneeId] = useState('');
  const [loading, setLoading] = useState(false);
  const [createdTask, setCreatedTask] = useState<Task | null>(null);

  // Natural Language Parser
  const parsedNlp: ParsedTaskInput = useMemo(() => {
    return parseNaturalLanguageTask(title);
  }, [title]);

  const applyNlpInterpretation = () => {
    if (!parsedNlp.hasParsedData) return;
    setTitle(parsedNlp.title);
    if (parsedNlp.dueDate) setDueDate(parsedNlp.dueDate);
    if (parsedNlp.priority) setPriority(parsedNlp.priority);
    if (parsedNlp.recurrenceRule) setRecurrenceRule(parsedNlp.recurrenceRule);
    if (parsedNlp.tags.length > 0) setTags(parsedNlp.tags.join(', '));
  };

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

  if (!isOpen && !createdTask) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !githubRepo || !token) return;

    let reminderDate: Date | null = null;
    const now = new Date();
    if (reminderPreset === '15m') reminderDate = new Date(now.getTime() + 15 * 60 * 1000);
    else if (reminderPreset === 'today_evening') {
      reminderDate = new Date();
      reminderDate.setHours(18, 0, 0, 0);
    } else if (reminderPreset === 'tomorrow_morning') {
      reminderDate = new Date();
      reminderDate.setDate(reminderDate.getDate() + 1);
      reminderDate.setHours(9, 0, 0, 0);
    }

    if (reminderDate) {
      await reminderManager.requestPermission();
    }

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
          due_at: parsedNlp.dueAt || null,
          reminder_at: reminderDate ? reminderDate.toISOString() : null,
          recurrence_rule: recurrenceRule || null,
          tags: tags.trim() || null,
          githubRepo,
          githubBranch: githubBranch.trim() || 'main',
          assigneeId: assigneeId || null
        })
      });

      if (res.ok) {
        const data = await res.json();
        setTitle('');
        setDescription('');
        setTags('');
        setRecurrenceRule('');
        setReminderPreset('');
        setGithubBranch('main');
        window.dispatchEvent(new Event('shiori-refresh'));
        onTaskCreated();
        if (data.task) {
          if (reminderDate) {
            reminderManager.scheduleReminder({
              taskId: data.task.id,
              taskCode: data.task.task_code,
              taskTitle: data.task.title,
              reminderAt: reminderDate.toISOString(),
            });
          }
          setCreatedTask(data.task);
        } else {
          onClose();
        }
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleCloseHandoff = () => {
    setCreatedTask(null);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 select-none font-sans">
      <div className="fixed inset-0 bg-black/40 backdrop-blur-[1px]" onClick={onClose} />

      <div className="relative w-full max-w-lg bg-eink-bg border border-eink-border shadow-2xl rounded-sm p-6 z-10 space-y-4 font-technical max-h-[90vh] overflow-y-auto">
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
          {/* Title (Required) & NLP Chips */}
          <div className="space-y-1.5">
            <label className="block text-[11px] font-technical font-bold text-eink-textMuted uppercase">
              TODO TITLE *
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Finish compiler tests tomorrow 8pm #career high"
              className="w-full px-3 py-2 bg-eink-surface border border-eink-border rounded-sm text-xs text-eink-text outline-none font-sans"
              required
              autoFocus
            />

            {/* Smart NLP Interpretation Preview */}
            {parsedNlp.hasParsedData && (
              <div className="p-2 bg-eink-surface border border-eink-border rounded-sm flex items-center justify-between gap-2 text-[11px] font-technical animate-fade-in">
                <div className="flex flex-wrap items-center gap-1.5 min-w-0">
                  <span className="text-eink-textMuted flex items-center gap-1">
                    <Sparkles className="w-3 h-3" />
                    <span>INTERPRETED:</span>
                  </span>
                  {parsedNlp.dueDate && (
                    <span className="px-1.5 py-0.2 bg-eink-bg border border-eink-border rounded text-eink-text">
                      📅 {parsedNlp.dueDate}
                    </span>
                  )}
                  {parsedNlp.priority !== 'MEDIUM' && (
                    <span className="px-1.5 py-0.2 bg-eink-bg border border-eink-border rounded text-eink-text font-bold">
                      ⚡ {parsedNlp.priority}
                    </span>
                  )}
                  {parsedNlp.recurrenceRule && (
                    <span className="px-1.5 py-0.2 bg-eink-bg border border-eink-border rounded text-eink-text">
                      ↻ {parsedNlp.recurrenceRule}
                    </span>
                  )}
                  {parsedNlp.tags.map((t) => (
                    <span key={t} className="px-1.5 py-0.2 bg-eink-bg border border-eink-border rounded text-eink-text">
                      #{t}
                    </span>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={applyNlpInterpretation}
                  className="px-2 py-0.5 bg-eink-text text-eink-bg rounded-sm font-bold text-[10px] shrink-0 hover:opacity-90 active:scale-95"
                >
                  APPLY
                </button>
              </div>
            )}
          </div>

          {/* Repository & Branch */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-technical font-bold text-eink-textMuted uppercase mb-1">
                REPOSITORY *
              </label>
              <select
                value={githubRepo}
                onChange={(e) => {
                  setGithubRepo(e.target.value);
                  const selected = repositories.find((r) => r.name === e.target.value);
                  if (selected) setGithubBranch(selected.defaultBranch || 'main');
                }}
                className="w-full px-2.5 py-2 bg-eink-surface border border-eink-border rounded-sm text-xs font-technical text-eink-text outline-none"
              >
                {repositories.length === 0 && <option value="SHIORI">SHIORI (Default)</option>}
                {repositories.map((repo) => (
                  <option key={repo.id || repo.name} value={repo.name}>
                    {repo.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-technical font-bold text-eink-textMuted uppercase mb-1">
                BRANCH
              </label>
              <input
                type="text"
                value={githubBranch}
                onChange={(e) => setGithubBranch(e.target.value)}
                placeholder="main"
                className="w-full px-2.5 py-2 bg-eink-surface border border-eink-border rounded-sm text-xs font-technical text-eink-text outline-none font-mono"
                required
              />
            </div>
          </div>

          {/* Priority & Recurrence & Reminder */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-[10px] font-technical text-eink-textMuted uppercase mb-1">
                PRIORITY
              </label>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value as TaskPriority)}
                className="w-full px-2 py-1.5 bg-eink-surface border border-eink-border rounded-sm text-xs font-technical outline-none text-eink-text font-bold"
              >
                <option value="LOW">LOW</option>
                <option value="MEDIUM">MEDIUM</option>
                <option value="HIGH">HIGH</option>
                <option value="URGENT">URGENT</option>
              </select>
            </div>

            <div>
              <label className="block text-[10px] font-technical text-eink-textMuted uppercase mb-1 flex items-center gap-1">
                <Repeat className="w-2.5 h-2.5" />
                <span>RECURRING</span>
              </label>
              <select
                value={recurrenceRule}
                onChange={(e) => setRecurrenceRule(e.target.value)}
                className="w-full px-2 py-1.5 bg-eink-surface border border-eink-border rounded-sm text-xs font-technical outline-none text-eink-text"
              >
                <option value="">None (One-time)</option>
                <option value="Daily">↻ Every day</option>
                <option value="Weekdays">↻ Weekdays</option>
                <option value="Weekly">↻ Every week</option>
                <option value="Monthly">↻ Every month</option>
              </select>
            </div>

            <div>
              <label className="block text-[10px] font-technical text-eink-textMuted uppercase mb-1 flex items-center gap-1">
                <Bell className="w-2.5 h-2.5" />
                <span>REMINDER</span>
              </label>
              <select
                value={reminderPreset}
                onChange={(e) => setReminderPreset(e.target.value)}
                className="w-full px-2 py-1.5 bg-eink-surface border border-eink-border rounded-sm text-xs font-technical outline-none text-eink-text"
              >
                <option value="">No reminder</option>
                <option value="15m">In 15 minutes</option>
                <option value="today_evening">Today · 6:00 PM</option>
                <option value="tomorrow_morning">Tomorrow · 9:00 AM</option>
              </select>
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
                <option value="TODO">○ TODO</option>
                <option value="IN_PROGRESS">◐ IN PROGRESS</option>
                <option value="DONE">✓ DONE</option>
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

          {/* Tags */}
          <div>
            <label className="block text-[10px] font-technical text-eink-textMuted uppercase mb-1">
              TAGS (COMMA SEPARATED)
            </label>
            <input
              type="text"
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              placeholder="college, career, compiler"
              className="w-full px-2.5 py-1.5 bg-eink-surface border border-eink-border rounded-sm text-xs font-technical outline-none text-eink-text"
            />
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

      <AiDeveloperHandoffModal
        isOpen={Boolean(createdTask)}
        task={createdTask}
        onClose={handleCloseHandoff}
      />
    </div>
  );
};
