import React, { useState, useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import { CommandPalette } from './CommandPalette';
import { EInkNoticeBanner } from '../common/EInkNoticeBanner';
import { PwaInstallPrompt } from '../common/PwaInstallPrompt';
import { NotificationPermissionPrompt } from '../common/NotificationPermissionPrompt';
import { SimulatorDrawer } from '../simulator/SimulatorDrawer';
import { TaskDetailModal } from '../tasks/TaskDetailModal';
import { useNotifications } from '../../context/NotificationContext';

export const AppLayout: React.FC = () => {
  const [isSimulatorOpen, setIsSimulatorOpen] = useState(false);
  const [isPaletteOpen, setIsPaletteOpen] = useState(false);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const { isRefreshing } = useNotifications();

  // Listen for global custom events from Dynamic Island & shortcuts
  useEffect(() => {
    const handleOpenSimulator = () => setIsSimulatorOpen(true);
    const handleOpenPalette = () => setIsPaletteOpen(true);
    const handleOpenTask = (e: any) => {
      if (e.detail?.taskId) {
        setSelectedTaskId(e.detail.taskId);
      }
    };

    const handleGlobalKeydown = (e: KeyboardEvent) => {
      const activeTag = document.activeElement?.tagName;
      if (
        (e.key === '/' && activeTag !== 'INPUT' && activeTag !== 'TEXTAREA') ||
        (e.key === 'k' && (e.metaKey || e.ctrlKey))
      ) {
        e.preventDefault();
        setIsPaletteOpen((prev) => !prev);
      }
    };

    window.addEventListener('shiori:open-simulator', handleOpenSimulator);
    window.addEventListener('shiori:open-command-palette', handleOpenPalette);
    window.addEventListener('shiori:open-task', handleOpenTask);
    window.addEventListener('keydown', handleGlobalKeydown);

    return () => {
      window.removeEventListener('shiori:open-simulator', handleOpenSimulator);
      window.removeEventListener('shiori:open-command-palette', handleOpenPalette);
      window.removeEventListener('shiori:open-task', handleOpenTask);
      window.removeEventListener('keydown', handleGlobalKeydown);
    };
  }, []);

  return (
    <div
      className={`min-h-screen bg-eink-bg text-eink-text flex flex-col eink-paper transition-colors ${
        isRefreshing ? 'eink-refresh-active' : ''
      }`}
    >
      {/* Dynamic Island is globally mounted at top center */}

      {/* Main Content Workspace Canvas */}
      <div className="flex-1 flex flex-col min-w-0 w-full min-h-screen pt-20 sm:pt-24 pb-16 overflow-x-hidden">
        {/* Real-time E-Ink Development Notice Banner */}
        <EInkNoticeBanner onViewTask={(taskId) => setSelectedTaskId(taskId)} />

        <main className="flex-1 p-3 sm:p-6 md:p-8 max-w-7xl w-full mx-auto font-sans animate-fade-in">
          <Outlet context={{ openTaskModal: (id: string) => setSelectedTaskId(id) }} />
        </main>

        {/* Subtle Watermark Footer */}
        <footer className="w-full pt-8 pb-4 text-center select-none pointer-events-none opacity-40 hover:opacity-80 transition-opacity">
          <div className="flex items-center justify-center gap-2 text-[10px] tracking-[0.28em] text-eink-textMuted uppercase font-technical">
            <span>SHIORI</span>
            <span>•</span>
            <span className="font-bold tracking-[0.32em] text-eink-text">SWAPLYONE</span>
            <span>•</span>
            <span>QUIET WORKSPACE</span>
          </div>
        </footer>
      </div>

      {/* Interactive Global Modals */}
      <CommandPalette
        isOpen={isPaletteOpen}
        onClose={() => setIsPaletteOpen(false)}
        onSelectTask={(id) => setSelectedTaskId(id)}
      />

      <SimulatorDrawer
        isOpen={isSimulatorOpen}
        onClose={() => setIsSimulatorOpen(false)}
        onRefreshData={() => {
          // Triggers window custom event for pages to refresh
          window.dispatchEvent(new Event('shiori-refresh'));
        }}
      />

      {selectedTaskId && (
        <TaskDetailModal
          taskId={selectedTaskId}
          onClose={() => setSelectedTaskId(null)}
          onTaskUpdated={() => {
            window.dispatchEvent(new Event('shiori-refresh'));
          }}
        />
      )}

      {/* Install PWA Prompt */}
      <PwaInstallPrompt />

      {/* Notification Permission Prompt for First-Time Entry */}
      <NotificationPermissionPrompt />
    </div>
  );
};
