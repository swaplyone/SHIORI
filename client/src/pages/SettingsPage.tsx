import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Settings, Moon, Sun, Monitor, Shield, Bell, Github, Smartphone, Lock, User, AlertTriangle } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { EInkTheme } from '../types';
import { fetchJson } from '../utils/api';

export const SettingsPage: React.FC = () => {
  const { user, settings, setTheme, updateSettings, token, logout } = useAuth();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<'appearance' | 'privacy' | 'notifications' | 'account' | 'pwa'>('appearance');

  const [name, setName] = useState(user?.name || 'Lijith');
  const [bio, setBio] = useState(user?.bio || 'Systems engineer & SwaplyOne architect');
  const [privacyTasks, setPrivacyTasks] = useState(settings?.privacy_tasks || 'friends');
  const [privacyGithub, setPrivacyGithub] = useState(settings?.privacy_github || 'workspace');
  const [privacyStats, setPrivacyStats] = useState(settings?.privacy_stats || 'private');
  const [savedNotice, setSavedNotice] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const handleDeleteAccount = async () => {
    setIsDeleting(true);
    try {
      const { ok } = await fetchJson('/api/auth/account', {
        method: 'DELETE'
      });

      if (ok) {
        logout();
        navigate('/register');
      } else {
        alert('Failed to delete account. Please try again.');
      }
    } catch (err) {
      console.error('Failed to delete account:', err);
    } finally {
      setIsDeleting(false);
    }
  };

  const handleSaveSettings = async () => {
    if (!token) return;
    try {
      await fetch('/api/auth/settings', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          privacy_tasks: privacyTasks,
          privacy_github: privacyGithub,
          privacy_stats: privacyStats,
        })
      });

      await fetch('/api/auth/profile', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ name, bio })
      });

      updateSettings({
        privacy_tasks: privacyTasks as any,
        privacy_github: privacyGithub as any,
        privacy_stats: privacyStats as any,
      });

      setSavedNotice(true);
      setTimeout(() => setSavedNotice(false), 3000);
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="space-y-8 select-none font-sans max-w-4xl">
      {/* Header */}
      <div className="border-b border-eink-border pb-4 flex items-center justify-between">
        <div>
          <h1 className="font-technical text-xl font-bold tracking-tight text-eink-text uppercase">
            WORKSPACE SETTINGS
          </h1>
          <p className="text-xs text-eink-textSecondary font-technical">
            E-Ink appearance, privacy boundaries, GitHub integration and PWA configuration
          </p>
        </div>

        {savedNotice && (
          <span className="px-2.5 py-1 bg-eink-text text-eink-bg text-xs font-technical font-bold rounded-sm animate-fade-in">
            ✓ SETTINGS SAVED
          </span>
        )}
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap gap-2 font-technical text-xs border-b border-eink-border pb-2">
        {[
          { key: 'appearance', label: 'APPEARANCE' },
          { key: 'privacy', label: 'PRIVACY' },
          { key: 'notifications', label: 'NOTIFICATIONS' },
          { key: 'account', label: 'ACCOUNT' },
          { key: 'pwa', label: 'PWA' },
        ].map((t) => (
          <button
            key={t.key}
            onClick={() => setActiveTab(t.key as any)}
            className={`px-3 py-1.5 rounded-sm ${
              activeTab === t.key
                ? 'bg-eink-darkSurface text-eink-darkText font-bold'
                : 'text-eink-text hover:bg-eink-surface'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* APPEARANCE TAB */}
      {activeTab === 'appearance' && (
        <div className="space-y-6 font-technical text-xs">
          <div className="p-6 bg-eink-surface border border-eink-border rounded-sm space-y-4">
            <h3 className="font-bold text-sm text-eink-text uppercase">E-INK THEMES</h3>
            <p className="text-eink-textSecondary leading-relaxed">
              Designed to emulate reflective electronic paper displays, digital notebooks, and technical documentation.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2">
              {/* E-Ink Light */}
              <div
                onClick={() => setTheme('light')}
                className={`p-4 border rounded-sm cursor-pointer space-y-2 ${
                  user?.theme === 'light' || !user?.theme
                    ? 'border-2 border-eink-text bg-[#F4F3EE] text-[#111111]'
                    : 'border-eink-border bg-eink-bg text-eink-text'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-bold text-xs">E-INK LIGHT</span>
                  {(user?.theme === 'light' || !user?.theme) && <span>✓</span>}
                </div>
                <p className="text-[11px] opacity-80 font-sans">
                  Warm paper / digital notebook grayscale. Default aesthetic.
                </p>
                <div className="text-[10px] text-eink-textMuted">#F4F3EE</div>
              </div>

              {/* E-Ink Dark */}
              <div
                onClick={() => setTheme('dark')}
                className={`p-4 border rounded-sm cursor-pointer space-y-2 ${
                  user?.theme === 'dark'
                    ? 'border-2 border-eink-text bg-[#141414] text-[#EAE9E3]'
                    : 'border-eink-border bg-eink-bg text-eink-text'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-bold text-xs">E-INK DARK</span>
                  {user?.theme === 'dark' && <span>✓</span>}
                </div>
                <p className="text-[11px] opacity-80 font-sans">
                  Graphite / charcoal dark grayscale for night workspaces.
                </p>
                <div className="text-[10px] opacity-60">#141414</div>
              </div>

              {/* Pure Monochrome */}
              <div
                onClick={() => setTheme('monochrome')}
                className={`p-4 border rounded-sm cursor-pointer space-y-2 ${
                  user?.theme === 'monochrome'
                    ? 'border-2 border-black bg-white text-black'
                    : 'border-eink-border bg-eink-bg text-eink-text'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-bold text-xs">PURE MONOCHROME</span>
                  {user?.theme === 'monochrome' && <span>✓</span>}
                </div>
                <p className="text-[11px] opacity-80 font-sans">
                  Strict stark 100% black and white contrast without tints.
                </p>
                <div className="text-[10px] opacity-60">#FFFFFF / #000000</div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* PRIVACY TAB */}
      {activeTab === 'privacy' && (
        <div className="space-y-4 font-technical text-xs">
          <div className="p-6 bg-eink-surface border border-eink-border rounded-sm space-y-5">
            <div>
              <h3 className="font-bold text-sm text-eink-text uppercase">VISIBILITY BOUNDARIES</h3>
              <p className="text-eink-textSecondary mt-1">
                Control who can see your development activity, task titles and stats.
              </p>
            </div>

            <div className="space-y-4 pt-2 divide-y divide-eink-border/50">
              <div className="pt-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <span className="font-bold text-eink-text block">GitHub Activity</span>
                  <span className="text-[11px] text-eink-textMuted">Commits, PRs and CI checks</span>
                </div>
                <select
                  value={privacyGithub}
                  onChange={(e) => setPrivacyGithub(e.target.value as any)}
                  className="px-3 py-1.5 bg-eink-bg border border-eink-border rounded text-eink-text outline-none"
                >
                  <option value="workspace">WORKSPACE</option>
                  <option value="friends">FRIENDS</option>
                  <option value="private">PRIVATE</option>
                </select>
              </div>

              <div className="pt-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <span className="font-bold text-eink-text block">Task Titles & Codes</span>
                  <span className="text-[11px] text-eink-textMuted">What you are currently working on</span>
                </div>
                <select
                  value={privacyTasks}
                  onChange={(e) => setPrivacyTasks(e.target.value as any)}
                  className="px-3 py-1.5 bg-eink-bg border border-eink-border rounded text-eink-text outline-none"
                >
                  <option value="friends">FRIENDS</option>
                  <option value="workspace">WORKSPACE</option>
                  <option value="private">PRIVATE</option>
                </select>
              </div>

              <div className="pt-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <span className="font-bold text-eink-text block">Productivity Statistics</span>
                  <span className="text-[11px] text-eink-textMuted">Completion velocity and weekly summaries</span>
                </div>
                <select
                  value={privacyStats}
                  onChange={(e) => setPrivacyStats(e.target.value as any)}
                  className="px-3 py-1.5 bg-eink-bg border border-eink-border rounded text-eink-text outline-none"
                >
                  <option value="private">PRIVATE</option>
                  <option value="friends">FRIENDS</option>
                  <option value="workspace">WORKSPACE</option>
                </select>
              </div>
            </div>

            <div className="pt-4 border-t border-eink-border flex justify-end">
              <button
                onClick={handleSaveSettings}
                className="px-4 py-2 bg-eink-text text-eink-bg font-bold rounded-sm shadow-eink-sm"
              >
                SAVE PRIVACY PREFERENCES
              </button>
            </div>
          </div>
        </div>
      )}

      {/* NOTIFICATIONS TAB */}
      {activeTab === 'notifications' && (
        <div className="space-y-4 font-technical text-xs">
          <div className="p-6 bg-eink-surface border border-eink-border rounded-sm space-y-4">
            <h3 className="font-bold text-sm text-eink-text uppercase">DEVELOPMENT NOTIFICATIONS</h3>
            
            <div className="space-y-3 pt-2">
              <label className="flex items-center justify-between p-3 bg-eink-bg border border-eink-border rounded-sm cursor-pointer">
                <div>
                  <span className="font-bold text-eink-text block">✕ BUILD FAILED Alert</span>
                  <span className="text-[11px] text-eink-textMuted">Notify when a linked branch fails CI tests</span>
                </div>
                <input type="checkbox" defaultChecked className="w-4 h-4 accent-eink-text" />
              </label>

              <label className="flex items-center justify-between p-3 bg-eink-bg border border-eink-border rounded-sm cursor-pointer">
                <div>
                  <span className="font-bold text-eink-text block">✓ BUILD RECOVERED Notice</span>
                  <span className="text-[11px] text-eink-textMuted">Notify when a subsequent commit fixes failing CI</span>
                </div>
                <input type="checkbox" defaultChecked className="w-4 h-4 accent-eink-text" />
              </label>

              <label className="flex items-center justify-between p-3 bg-eink-bg border border-eink-border rounded-sm cursor-pointer">
                <div>
                  <span className="font-bold text-eink-text block">→ PR Review & Comment Activity</span>
                  <span className="text-[11px] text-eink-textMuted">When collaborators mention you or comment on tasks</span>
                </div>
                <input type="checkbox" defaultChecked className="w-4 h-4 accent-eink-text" />
              </label>
            </div>
          </div>
        </div>
      )}

      {/* ACCOUNT TAB */}
      {activeTab === 'account' && (
        <div className="space-y-4 font-technical text-xs">
          <div className="p-6 bg-eink-surface border border-eink-border rounded-sm space-y-4">
            <h3 className="font-bold text-sm text-eink-text uppercase">DEVELOPER PROFILE</h3>

            <div className="space-y-3">
              <div>
                <label className="block text-[11px] text-eink-textMuted uppercase mb-1">Full Name</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full px-3 py-2 bg-eink-bg border border-eink-border rounded-sm text-xs font-sans"
                />
              </div>

              <div>
                <label className="block text-[11px] text-eink-textMuted uppercase mb-1">Technical Bio</label>
                <textarea
                  value={bio}
                  onChange={(e) => setBio(e.target.value)}
                  rows={2}
                  className="w-full px-3 py-2 bg-eink-bg border border-eink-border rounded-sm text-xs font-sans resize-none"
                />
              </div>
            </div>

            <div className="pt-2 flex justify-end">
              <button
                onClick={handleSaveSettings}
                className="px-4 py-2 bg-eink-text text-eink-bg font-bold rounded-sm shadow-eink-sm"
              >
                UPDATE PROFILE
              </button>
            </div>
          </div>

          {/* DANGER ZONE: DELETE ACCOUNT */}
          <div className="p-6 bg-eink-surface border-2 border-red-500/60 rounded-sm space-y-4">
            <div className="flex items-center gap-2 text-red-600">
              <span className="font-bold text-sm uppercase tracking-wider">DANGER ZONE</span>
            </div>

            <div className="space-y-1">
              <h4 className="font-bold text-xs text-eink-text uppercase">PERMANENTLY DELETE ACCOUNT</h4>
              <p className="text-[11px] text-eink-textSecondary font-sans leading-relaxed">
                Permanently delete your SHIORI developer profile, your connected workspaces, tasks, repository bindings, and collaborator sessions. This action is irreversible.
              </p>
            </div>

            {showDeleteConfirm ? (
              <div className="p-4 bg-eink-bg border border-red-500/50 rounded-sm space-y-3 animate-fade-in">
                <p className="text-xs font-bold text-red-600">
                  Are you absolutely sure? All your workspaces, projects, and task records will be permanently removed.
                </p>
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleDeleteAccount}
                    disabled={isDeleting}
                    className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white font-bold text-xs rounded-sm transition-colors shadow-sm"
                  >
                    {isDeleting ? 'DELETING ACCOUNT...' : 'YES, PERMANENTLY DELETE MY ACCOUNT'}
                  </button>
                  <button
                    onClick={() => setShowDeleteConfirm(false)}
                    disabled={isDeleting}
                    className="px-3 py-2 border border-eink-border text-eink-text hover:bg-eink-surface text-xs font-bold rounded-sm transition-colors"
                  >
                    CANCEL
                  </button>
                </div>
              </div>
            ) : (
              <div className="pt-1">
                <button
                  type="button"
                  onClick={() => setShowDeleteConfirm(true)}
                  className="px-4 py-2 border-2 border-red-500/60 text-red-600 hover:bg-red-500 hover:text-white font-bold text-xs rounded-sm transition-colors"
                >
                  DELETE ACCOUNT
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* PWA TAB */}
      {activeTab === 'pwa' && (
        <div className="space-y-4 font-technical text-xs">
          <div className="p-6 bg-eink-surface border border-eink-border rounded-sm space-y-4">
            <div className="flex items-center gap-3">
              <Smartphone className="w-6 h-6 text-eink-text" />
              <div>
                <h3 className="font-bold text-sm text-eink-text uppercase">PROGRESSIVE WEB APP</h3>
                <p className="text-[11px] text-eink-textMuted">Offline application shell & desktop/mobile installation</p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 text-xs">
              <div className="p-3 bg-eink-bg border border-eink-border rounded-sm">
                <span className="text-[10px] text-eink-textMuted uppercase block">SERVICE WORKER</span>
                <span className="font-bold text-eink-text">✓ REGISTERED</span>
              </div>
              <div className="p-3 bg-eink-bg border border-eink-border rounded-sm">
                <span className="text-[10px] text-eink-textMuted uppercase block">OFFLINE SHELL</span>
                <span className="font-bold text-eink-text">✓ CACHED (v1)</span>
              </div>
              <div className="p-3 bg-eink-bg border border-eink-border rounded-sm">
                <span className="text-[10px] text-eink-textMuted uppercase block">MANIFEST</span>
                <span className="font-bold text-eink-text">✓ VALID</span>
              </div>
            </div>

            <p className="text-[11px] text-eink-textSecondary leading-relaxed pt-2">
              SHIORI is configured with a standalone display mode and background sync. You can install this app directly on macOS, Windows, Linux, Android, and iOS devices.
            </p>
          </div>
        </div>
      )}
    </div>
  );
};
