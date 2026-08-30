import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  CheckSquare,
  FolderGit2,
  Building2,
  Users,
  Github,
  BookOpen,
  Activity,
  Settings,
  Bell,
  Search,
  Terminal,
  Play,
  LogOut,
  Sparkles,
  Copy,
  Check,
  ArrowRight,
  RefreshCw,
  Home,
  ShieldCheck
} from 'lucide-react';
import { useMorphBar } from '../../../context/MorphBarContext';
import { useAuth } from '../../../context/AuthContext';
import { useNotifications } from '../../../context/NotificationContext';

export const IdleCollapsedView: React.FC = () => {
  const location = useLocation();
  const { isAuthenticated } = useAuth();
  const { unreadCount } = useNotifications();

  const getPageInfo = () => {
    switch (location.pathname) {
      case '/home':
      case '/dashboard':
        return { label: 'SHIORI HOME', icon: BookOpen };
      case '/todos':
      case '/tasks':
        return { label: 'MY TODOS', icon: CheckSquare };
      case '/repositories':
      case '/projects':
        return { label: 'REPOSITORIES', icon: FolderGit2 };
      case '/workspaces':
        return { label: 'WORKSPACES', icon: Building2 };
      case '/connections':
        return { label: 'CONNECTIONS', icon: Users };
      case '/github':
        return { label: 'GITHUB HUB', icon: Github };
      case '/journal':
        return { label: 'DAILY JOURNAL', icon: BookOpen };
      case '/activity':
        return { label: 'ACTIVITY AUDIT', icon: Activity };
      case '/notifications':
        return { label: 'NOTIFICATIONS', icon: Bell };
      case '/settings':
        return { label: 'SETTINGS', icon: Settings };
      case '/login':
        return { label: 'SIGN IN', icon: ShieldCheck };
      case '/register':
        return { label: 'REGISTER', icon: Sparkles };
      case '/':
      default:
        return { label: isAuthenticated ? 'WORKSPACE' : '', icon: Sparkles };
    }
  };

  const { label, icon: PageIcon } = getPageInfo();

  return (
    <div className="relative flex items-center justify-center w-full h-full px-3 text-eink-text select-none">
      {/* Centered Brand and Section Label */}
      <div className="flex items-center justify-center gap-2.5">
        <div className="flex items-center gap-2 shrink-0">
          <img
            src="/favicon-shiori.png"
            alt="SHIORI"
            width={24}
            height={24}
            className="w-6 h-6 max-w-[24px] max-h-[24px] object-contain shrink-0"
          />
          <span className="font-mono font-bold text-xs tracking-[0.18em] text-eink-text uppercase leading-none">
            SHIORI
          </span>
        </div>

        {label ? (
          <>
            <span className="h-3.5 w-[1.5px] bg-eink-border mx-1 shrink-0 opacity-60 rounded-full" />
            <div className="flex items-center gap-1.5 min-w-0">
              <PageIcon className="w-3.5 h-3.5 text-eink-textSecondary shrink-0" />
              <span className="font-mono text-xs font-bold text-eink-text uppercase tracking-wide truncate max-w-[140px] sm:max-w-[190px] leading-none">
                {label}
              </span>
            </div>
          </>
        ) : null}
      </div>

      {/* Unread badge if any */}
      {unreadCount > 0 && (
        <div className="absolute right-2.5 flex items-center gap-1">
          <span className="flex items-center gap-0.5 px-1.5 py-0.5 bg-eink-text text-eink-bg text-[9px] font-mono font-bold rounded">
            <Bell className="w-2.5 h-2.5" />
            {unreadCount}
          </span>
        </div>
      )}
    </div>
  );
};

export const NavigationExpandedView: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, isAuthenticated, logout, demoLogin } = useAuth();
  const { unreadCount, triggerEInkRefresh } = useNotifications();
  const { startFocusTimer } = useMorphBar();
  const [copiedId, setCopiedId] = useState(false);

  const navItems = [
    { to: '/home', label: 'SHIORI HOME', desc: 'Overview & today activity', icon: BookOpen },
    { to: '/todos', label: 'MY TODOS', desc: 'To-do tasks & GitHub evidence', icon: CheckSquare },
    { to: '/repositories', label: 'REPOSITORIES', desc: 'GitHub repos as projects', icon: FolderGit2 },
    { to: '/connections', label: 'CONNECTIONS', desc: 'SHIORI ID & two-sided OTP', icon: Users },
    { to: '/github', label: 'GITHUB HUB', desc: 'Webhook logs & CI pipeline', icon: Github },
    { to: '/journal', label: 'DAILY JOURNAL', desc: 'Time audit & velocity', icon: BookOpen },
    { to: '/activity', label: 'ACTIVITY AUDIT', desc: 'Real-time dev stream', icon: Activity },
    { to: '/notifications', label: 'NOTIFICATIONS', desc: 'Alerts & task verification', icon: Bell, badge: unreadCount },
    { to: '/settings', label: 'SETTINGS', desc: 'E-Ink theme & preferences', icon: Settings },
  ];

  const handleNav = (to: string) => {
    navigate(to);
    onClose();
  };

  const handleCopyId = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (user?.shiori_id) {
      navigator.clipboard.writeText(user.shiori_id);
      setCopiedId(true);
      setTimeout(() => setCopiedId(false), 2000);
    }
  };

  const openSearch = () => {
    onClose();
    window.dispatchEvent(new CustomEvent('shiori:open-command-palette'));
  };

  const openSimulator = () => {
    onClose();
    window.dispatchEvent(new CustomEvent('shiori:open-simulator'));
  };

  if (!isAuthenticated) {
    return (
      <div className="space-y-4 text-xs font-technical">
        <div className="p-3 bg-eink-surface border border-eink-border rounded-sm flex items-center justify-between">
          <div>
            <span className="text-[10px] text-eink-textMuted uppercase font-bold block">PLAN • BUILD • VERIFY</span>
            <p className="font-bold text-eink-text text-sm">SHIORI Workspace</p>
          </div>
          <button
            onClick={async () => {
              await demoLogin();
              navigate('/tasks');
              onClose();
            }}
            className="px-3.5 py-2 bg-eink-text text-eink-bg font-bold text-xs rounded-sm flex items-center gap-1.5 shadow-eink-sm hover:opacity-90 transition-opacity"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>1-CLICK DEMO</span>
          </button>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={() => handleNav('/')}
            className={`p-3 bg-eink-surface hover:bg-eink-surfaceHover border border-eink-border rounded-sm text-left transition-colors flex items-start gap-2.5 ${location.pathname === '/' ? 'ring-1 ring-eink-text' : ''}`}
          >
            <Home className="w-4 h-4 text-eink-text shrink-0 mt-0.5" />
            <div>
              <span className="font-bold text-eink-text block text-xs">Overview & Features</span>
              <span className="text-[10px] text-eink-textMuted block font-sans">Explore the defining concept</span>
            </div>
          </button>

          <button
            onClick={() => handleNav('/login')}
            className={`p-3 bg-eink-surface hover:bg-eink-surfaceHover border border-eink-border rounded-sm text-left transition-colors flex items-start gap-2.5 ${location.pathname === '/login' ? 'ring-1 ring-eink-text' : ''}`}
          >
            <ShieldCheck className="w-4 h-4 text-eink-text shrink-0 mt-0.5" />
            <div>
              <span className="font-bold text-eink-text block text-xs">Sign In</span>
              <span className="text-[10px] text-eink-textMuted block font-sans">Access your existing workspace</span>
            </div>
          </button>

          <button
            onClick={() => handleNav('/register')}
            className={`p-3 bg-eink-surface hover:bg-eink-surfaceHover border border-eink-border rounded-sm text-left transition-colors flex items-start gap-2.5 col-span-2 ${location.pathname === '/register' ? 'ring-1 ring-eink-text' : ''}`}
          >
            <ArrowRight className="w-4 h-4 text-eink-text shrink-0 mt-0.5" />
            <div>
              <span className="font-bold text-eink-text block text-xs">Create New Account</span>
              <span className="text-[10px] text-eink-textMuted block font-sans">Register with custom SHIORI ID & team workspace</span>
            </div>
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3.5 text-xs font-technical">
      {/* User Status Strip & Search */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
        {/* User Card */}
        <div className="flex-1 p-2 bg-eink-surface border border-eink-border rounded-sm flex items-center justify-between">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-7 h-7 bg-eink-text text-eink-bg rounded-sm flex items-center justify-center font-bold text-xs shrink-0">
              {user?.name ? user.name[0].toUpperCase() : 'S'}
            </div>
            <div className="min-w-0">
              <span className="font-bold text-eink-text block text-xs truncate">{user?.name || 'Developer'}</span>
              <span className="text-[10px] text-eink-textMuted font-mono block truncate">
                {user?.shiori_id || 'SHI-3A91M'}
              </span>
            </div>
          </div>
          <button
            onClick={handleCopyId}
            className="px-2 py-1 border border-eink-border hover:bg-eink-bg text-[10px] font-bold rounded flex items-center gap-1 text-eink-text shrink-0 transition-colors"
            title="Copy SHIORI ID"
          >
            {copiedId ? (
              <>
                <Check className="w-3 h-3 text-eink-text" />
                <span>COPIED</span>
              </>
            ) : (
              <>
                <Copy className="w-3 h-3 text-eink-textMuted" />
                <span>COPY ID</span>
              </>
            )}
          </button>
        </div>

        {/* Global Quick Search Button */}
        <button
          onClick={openSearch}
          className="px-3 py-2 bg-eink-surface hover:bg-eink-surfaceHover border border-eink-border rounded-sm flex items-center justify-between gap-3 text-left transition-colors sm:w-48"
        >
          <div className="flex items-center gap-1.5 text-eink-textMuted text-xs">
            <Search className="w-3.5 h-3.5" />
            <span>Search...</span>
          </div>
          <kbd className="text-[9px] bg-eink-bg border border-eink-border px-1.5 py-0.2 rounded font-mono text-eink-text">
            /
          </kbd>
        </button>
      </div>

      {/* Focus Session Quick Bar */}
      <div className="p-2.5 bg-eink-surface border border-eink-border rounded-sm flex items-center justify-between">
        <div>
          <span className="text-[9px] text-eink-textMuted uppercase font-bold block">POMODORO FOCUS SESSION</span>
          <p className="font-bold text-eink-text text-[11px]">Start 25-minute uninterrupted sprint</p>
        </div>
        <button
          onClick={() => {
            startFocusTimer('Finish compiler error diagnostic', 'SWAPLYONE COMPILER', 25);
            onClose();
          }}
          className="px-3 py-1.5 bg-eink-text text-eink-bg font-bold text-[11px] rounded-sm flex items-center gap-1.5 shadow-eink-sm hover:opacity-90 transition-opacity shrink-0"
        >
          <Play className="w-3 h-3" />
          <span>START FOCUS</span>
        </button>
      </div>

      {/* Primary Navigation Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5 max-h-[300px] overflow-y-auto pr-0.5">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = location.pathname === item.to;
          return (
            <button
              key={item.to}
              onClick={() => handleNav(item.to)}
              className={`p-2 border rounded-sm text-left transition-all flex items-start gap-2 group ${
                isActive
                  ? 'bg-eink-text text-eink-bg border-eink-text shadow-eink-sm'
                  : 'bg-eink-surface hover:bg-eink-surfaceHover border-eink-border text-eink-text'
              }`}
            >
              <Icon
                className={`w-4 h-4 shrink-0 mt-0.5 ${
                  isActive ? 'text-eink-bg' : 'text-eink-textSecondary group-hover:text-eink-text'
                }`}
              />
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-1">
                  <span className={`font-bold block text-[11px] truncate ${isActive ? 'text-eink-bg' : 'text-eink-text'}`}>
                    {item.label}
                  </span>
                  {item.badge ? (
                    <span
                      className={`text-[9px] px-1 py-0.2 rounded font-mono font-bold shrink-0 ${
                        isActive ? 'bg-eink-bg text-eink-text' : 'bg-eink-text text-eink-bg'
                      }`}
                    >
                      {item.badge}
                    </span>
                  ) : null}
                </div>
                <span
                  className={`text-[9px] block truncate font-sans ${
                    isActive ? 'text-eink-bg/80' : 'text-eink-textMuted'
                  }`}
                >
                  {item.desc}
                </span>
              </div>
            </button>
          );
        })}
      </div>

      {/* Bottom Tools & Logout Footer */}
      <div className="pt-2 border-t border-eink-border flex items-center justify-between text-[11px]">
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              triggerEInkRefresh();
            }}
            className="px-2.5 py-1 border border-eink-border hover:bg-eink-surface rounded text-eink-textSecondary hover:text-eink-text flex items-center gap-1.5 font-bold transition-colors"
            title="E-Ink Screen Refresh"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>REFRESH</span>
          </button>
        </div>

        <button
          onClick={() => {
            logout();
            onClose();
            navigate('/login');
          }}
          className="px-2.5 py-1 border border-eink-border hover:bg-eink-surface text-eink-text rounded flex items-center gap-1.5 font-bold transition-colors"
        >
          <LogOut className="w-3 h-3" />
          <span>SIGN OUT</span>
        </button>
      </div>
    </div>
  );
};
