import React from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  CheckSquare,
  FolderGit2,
  Building2,
  Users,
  Github,
  Activity,
  BookOpen,
  Settings,
  Bell,
  Search,
  PlusCircle,
  Link as LinkIcon
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

interface SidebarProps {
  onOpenSimulator: () => void;
  onOpenCommandPalette: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ onOpenSimulator, onOpenCommandPalette }) => {
  const { user } = useAuth();
  const location = useLocation();

  const mainNav = [
    { to: '/home', label: 'Home & Overview', icon: LayoutDashboard, badge: null },
    { to: '/todos', label: 'To-Do & Tasks', icon: CheckSquare, badge: '3' },
    { to: '/repositories', label: 'Repositories (Projects)', icon: FolderGit2, badge: null },
    { to: '/connections', label: 'Connections (ID)', icon: Users, badge: null },
    { to: '/github', label: 'GitHub & Webhooks', icon: Github, badge: user?.github_connected ? 'Connected' : 'Connect' },
    { to: '/journal', label: 'Daily Journal', icon: BookOpen, badge: null },
    { to: '/activity', label: 'Audit Activity', icon: Activity, badge: null },
    { to: '/settings', label: 'Settings', icon: Settings, badge: null },
  ];

  return (
    <aside className="w-64 h-screen bg-eink-surface border-r border-eink-border flex flex-col justify-between p-4 font-sans select-none">
      <div className="space-y-6">
        {/* Brand & Identity */}
        <div className="border-b border-eink-border pb-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <img
                src="/nav-logo.png"
                alt="SHIORI"
                className="w-7 h-7 object-contain bg-transparent border-0 shrink-0 select-none"
              />
              <div className="flex flex-col justify-center">
                <h1 className="font-abask font-bold text-base tracking-[0.16em] text-eink-text uppercase leading-none">
                  SHIORI
                </h1>
                <p className="text-[9px] text-eink-textMuted tracking-wider font-mono uppercase mt-0.5">
                  A SwaplyOne product
                </p>
              </div>
            </div>
            <span className="text-[9px] font-mono uppercase bg-eink-bg px-1.5 py-0.5 border border-eink-border rounded font-bold text-eink-text">
              E-INK
            </span>
          </div>

          {/* User & SHIORI ID & Points */}
          <div className="mt-3 p-2 bg-eink-bg border border-eink-border rounded-sm flex items-center justify-between text-xs font-technical">
            <div className="truncate">
              <span className="font-bold text-eink-text block truncate">{user?.name || 'Developer'}</span>
              <span className="text-[10px] text-eink-textMuted">{user?.shiori_id || 'SHI-3A91M'}</span>
            </div>
            <div className="text-right flex flex-col items-end">
              <span className="text-[11px] font-bold text-eink-text font-mono bg-eink-surface px-1.5 py-0.5 border border-eink-border rounded-sm">
                {user?.points ?? 120} PTS
              </span>
              <NavLink
                to="/connections"
                className="text-[9px] text-eink-textSecondary hover:text-eink-text underline mt-0.5"
              >
                SHARE ID
              </NavLink>
            </div>
          </div>
        </div>

        {/* Global Quick Search */}
        <div>
          <button
            onClick={onOpenCommandPalette}
            className="w-full flex items-center justify-between px-3 py-2 bg-eink-bg hover:bg-eink-surfaceHover border border-eink-border rounded-sm text-xs text-eink-textMuted font-technical transition-colors"
          >
            <div className="flex items-center gap-2">
              <Search className="w-3.5 h-3.5" />
              <span>Search tasks, PRs...</span>
            </div>
            <kbd className="text-[10px] bg-eink-surface border border-eink-border px-1.5 py-0.2 rounded font-mono">
              /
            </kbd>
          </button>
        </div>

        {/* Primary Navigation */}
        <nav className="space-y-1">
          <span className="text-[10px] font-technical text-eink-textMuted uppercase tracking-wider font-bold block px-2 mb-1.5">
            MAIN MENU
          </span>
          {mainNav.map((item) => {
            const Icon = item.icon;
            const isActive = location.pathname === item.to;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                className={`flex items-center justify-between px-3 py-2 text-xs font-technical rounded-sm transition-colors ${
                  isActive
                    ? 'bg-eink-text text-eink-bg font-bold shadow-eink-sm'
                    : 'text-eink-text hover:bg-eink-surfaceHover'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <Icon className={`w-4 h-4 ${isActive ? 'text-eink-bg' : 'text-eink-textSecondary'}`} />
                  <span>{item.label}</span>
                </div>
                {item.badge && (
                  <span
                    className={`text-[10px] px-1.5 py-0.2 rounded font-mono ${
                      isActive
                        ? 'bg-eink-bg text-eink-text'
                        : item.badge === 'Connected'
                        ? 'bg-eink-bg text-eink-text border border-eink-border'
                        : 'bg-eink-darkSurface text-eink-darkText'
                    }`}
                  >
                    {item.badge}
                  </span>
                )}
              </NavLink>
            );
          })}
        </nav>
      </div>

      {/* Bottom Footer & Simulator */}
      <div className="space-y-3 pt-4 border-t border-eink-border font-technical">
        <button
          onClick={onOpenSimulator}
          className="w-full flex items-center justify-between px-3 py-2 bg-eink-bg hover:bg-eink-surfaceHover border border-eink-border rounded-sm text-xs text-eink-text font-bold transition-colors"
        >
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-eink-text animate-pulse" />
            <span>Dev Simulator</span>
          </div>
          <span className="text-[10px] text-eink-textMuted">TEST CI</span>
        </button>

        <div className="text-[10px] text-eink-textMuted flex items-center justify-between">
          <span>v1.0.0 PWA</span>
          <span>PLAN • BUILD • VERIFY</span>
        </div>
      </div>
    </aside>
  );
};
