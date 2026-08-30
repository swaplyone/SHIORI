import React, { useState } from 'react';
import { NavLink } from 'react-router-dom';
import {
  Home,
  CheckSquare,
  FolderGit2,
  Activity,
  Menu,
  X,
  Building2,
  Users,
  Github,
  BookOpen,
  Bell,
  Settings,
  Terminal,
  LogOut
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useNotifications } from '../../context/NotificationContext';

interface MobileNavProps {
  onOpenSimulator: () => void;
  onOpenCommandPalette: () => void;
}

export const MobileNav: React.FC<MobileNavProps> = ({ onOpenSimulator, onOpenCommandPalette }) => {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const { user, logout } = useAuth();
  const { unreadCount } = useNotifications();

  return (
    <>
      {/* Top Mobile Bar */}
      <header className="md:hidden sticky top-0 z-30 bg-eink-bg border-b border-eink-border px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <img
            src="/nav-logo.png"
            alt="SHIORI"
            className="w-7 h-7 object-contain bg-transparent border-0 shrink-0 select-none"
          />
          <div className="flex flex-col justify-center">
            <h1 className="font-abask font-bold text-sm tracking-[0.18em] uppercase leading-none text-eink-text">SHIORI</h1>
            <p className="text-[8px] text-eink-textMuted uppercase tracking-wider font-mono mt-0.5 font-semibold">A SwaplyOne product</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={onOpenCommandPalette}
            className="px-2 py-1 border border-eink-border text-xs font-mono bg-eink-surface rounded"
          >
            /
          </button>
          <button
            onClick={() => setDrawerOpen(true)}
            className="p-1.5 border border-eink-border bg-eink-surface rounded"
            aria-label="Open Navigation Drawer"
          >
            <Menu className="w-4 h-4 text-eink-text" />
          </button>
        </div>
      </header>

      {/* Slide-out Drawer */}
      {drawerOpen && (
        <div className="fixed inset-0 z-50 md:hidden flex">
          <div className="fixed inset-0 bg-black/40 backdrop-blur-[1px]" onClick={() => setDrawerOpen(false)} />
          
          <div className="relative w-72 max-w-[80vw] bg-eink-bg h-full border-r border-eink-border flex flex-col justify-between p-4 z-10 font-sans">
            <div>
              <div className="flex items-center justify-between pb-4 border-b border-eink-border">
                <div className="flex items-center gap-2.5">
                  <img
                    src="/nav-logo.png"
                    alt="SHIORI"
                    className="w-7 h-7 object-contain bg-transparent border-0 shrink-0 select-none"
                  />
                  <div>
                    <h2 className="font-abask font-bold text-lg tracking-[0.16em] uppercase leading-none">SHIORI</h2>
                    <p className="text-[9px] text-eink-textMuted uppercase font-mono tracking-wider mt-0.5">Plan. Build. Verify.</p>
                  </div>
                </div>
                <button
                  onClick={() => setDrawerOpen(false)}
                  className="p-1.5 border border-eink-border rounded hover:bg-eink-surface"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <nav className="mt-4 space-y-1">
                {[
                  { to: '/dashboard', label: 'Dashboard', icon: Home },
                  { to: '/tasks', label: 'My Tasks', icon: CheckSquare },
                  { to: '/projects', label: 'Projects', icon: FolderGit2 },
                  { to: '/workspaces', label: 'Workspaces', icon: Building2 },
                  { to: '/connections', label: 'Connections (SHIORI ID)', icon: Users },
                  { to: '/github', label: 'GitHub Hub', icon: Github },
                  { to: '/activity', label: 'Activity Journal', icon: Activity },
                  { to: '/journal', label: 'Daily & Weekly Journal', icon: BookOpen },
                  { to: '/notifications', label: 'Notifications', icon: Bell, badge: unreadCount },
                  { to: '/settings', label: 'Settings', icon: Settings },
                ].map((item) => {
                  const Icon = item.icon;
                  return (
                    <NavLink
                      key={item.to}
                      to={item.to}
                      onClick={() => setDrawerOpen(false)}
                      className={({ isActive }) =>
                        `flex items-center justify-between px-3 py-2 text-xs font-medium rounded-sm ${
                          isActive
                            ? 'bg-eink-darkSurface text-eink-darkText font-semibold'
                            : 'text-eink-text hover:bg-eink-surface'
                        }`
                      }
                    >
                      <div className="flex items-center gap-2.5">
                        <Icon className="w-4 h-4" />
                        <span>{item.label}</span>
                      </div>
                      {item.badge ? (
                        <span className="px-1.5 py-0.2 bg-eink-text text-eink-bg text-[10px] font-technical font-bold rounded">
                          {item.badge}
                        </span>
                      ) : null}
                    </NavLink>
                  );
                })}

                <button
                  onClick={() => {
                    setDrawerOpen(false);
                    onOpenSimulator();
                  }}
                  className="w-full flex items-center justify-between px-3 py-2 text-xs font-technical text-eink-text hover:bg-eink-surface rounded border border-dashed border-eink-border mt-3"
                >
                  <div className="flex items-center gap-2">
                    <Terminal className="w-3.5 h-3.5" />
                    <span>CI Webhook Simulator</span>
                  </div>
                  <span className="text-[9px] bg-eink-surface px-1 border border-eink-border rounded">DEV</span>
                </button>
              </nav>
            </div>

            {/* Bottom Profile */}
            <div className="pt-4 border-t border-eink-border flex items-center justify-between">
              <div className="flex items-center gap-2 truncate">
                <div className="w-7 h-7 bg-eink-darkSurface text-eink-darkText rounded flex items-center justify-center font-technical font-bold text-xs">
                  {user?.name ? user.name[0] : 'L'}
                </div>
                <div className="truncate text-xs">
                  <p className="font-semibold text-eink-text truncate">{user?.name || 'Lijith'}</p>
                  <p className="text-[10px] text-eink-textMuted font-technical">Online</p>
                </div>
              </div>
              <button
                onClick={() => {
                  logout();
                  setDrawerOpen(false);
                }}
                className="p-1.5 border border-eink-border rounded text-eink-text"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bottom Navigation Bar */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-30 bg-eink-bg border-t border-eink-border flex items-center justify-around py-2 px-1 safe-area-bottom">
        {[
          { to: '/dashboard', label: 'HOME', icon: Home },
          { to: '/tasks', label: 'TASKS', icon: CheckSquare },
          { to: '/projects', label: 'PROJECTS', icon: FolderGit2 },
          { to: '/activity', label: 'ACTIVITY', icon: Activity },
          { to: '/settings', label: 'SETTINGS', icon: Settings },
        ].map((tab) => {
          const Icon = tab.icon;
          return (
            <NavLink
              key={tab.to}
              to={tab.to}
              className={({ isActive }) =>
                `flex flex-col items-center justify-center py-1 px-3 text-[10px] font-technical tracking-wider ${
                  isActive ? 'text-eink-text font-bold' : 'text-eink-textMuted'
                }`
              }
            >
              <Icon className="w-4 h-4 mb-0.5" />
              <span>{tab.label}</span>
            </NavLink>
          );
        })}
      </nav>
    </>
  );
};
