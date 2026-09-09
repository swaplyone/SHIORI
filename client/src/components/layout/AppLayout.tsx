import React, { useState, useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import { CommandPalette } from './CommandPalette';
import { EInkNoticeBanner } from '../common/EInkNoticeBanner';
import { PwaInstallPrompt } from '../common/PwaInstallPrompt';
import { NotificationPermissionPrompt } from '../common/NotificationPermissionPrompt';
import { SimulatorDrawer } from '../simulator/SimulatorDrawer';
import { TaskDetailModal } from '../tasks/TaskDetailModal';
import { SparkCompanionModal } from '../spark/SparkCompanionModal';
import { SparkGreetingBanner } from '../spark/SparkGreetingBanner';
import { useNotifications } from '../../context/NotificationContext';
import { useSpark } from '../../context/SparkContext';
import { Mic, Radio } from 'lucide-react';

export const AppLayout: React.FC = () => {
  const [isSimulatorOpen, setIsSimulatorOpen] = useState(false);
  const [isPaletteOpen, setIsPaletteOpen] = useState(false);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const { isRefreshing } = useNotifications();
  const { openSpark, toggleSpark, heySparkEnabled, isWakeListening } = useSpark();

  // Listen for global custom events from Dynamic Island & shortcuts
  useEffect(() => {
    const handleOpenSimulator = () => setIsSimulatorOpen(true);
    const handleOpenPalette = () => setIsPaletteOpen(true);
    const handleOpenSpark = () => openSpark();
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
      } else if (
        ((e.key === 'j' || e.key === 'J') && (e.metaKey || e.ctrlKey)) ||
        ((e.key === 's' || e.key === 'S') && e.altKey)
      ) {
        e.preventDefault();
        toggleSpark();
      }
    };

    window.addEventListener('shiori:open-simulator', handleOpenSimulator);
    window.addEventListener('shiori:open-command-palette', handleOpenPalette);
    window.addEventListener('shiori:open-spark', handleOpenSpark);
    window.addEventListener('shiori:open-task', handleOpenTask);
    window.addEventListener('keydown', handleGlobalKeydown);

    return () => {
      window.removeEventListener('shiori:open-simulator', handleOpenSimulator);
      window.removeEventListener('shiori:open-command-palette', handleOpenPalette);
      window.removeEventListener('shiori:open-spark', handleOpenSpark);
      window.removeEventListener('shiori:open-task', handleOpenTask);
      window.removeEventListener('keydown', handleGlobalKeydown);
    };
  }, [openSpark, toggleSpark]);

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

        {/* Proactive Spark Greeting & Daily Task Briefing Banner */}
        <SparkGreetingBanner />

        <main className="flex-1 p-3 sm:p-6 md:p-8 max-w-7xl w-full mx-auto font-sans animate-fade-in">
          <Outlet context={{ openTaskModal: (id: string) => setSelectedTaskId(id) }} />
        </main>

        {/* Editorial Watermark Footer */}
        <footer className="w-full max-w-7xl mx-auto px-4 sm:px-8 mt-14 pb-8 select-none">
          <div className="border-t border-eink-border/40 pt-6 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
            {/* Left: Brand Seal & Origin */}
            <div className="flex items-center gap-2.5">
              <span className="w-1.5 h-1.5 rounded-full bg-eink-text/40 shrink-0" />
              <span className="font-abask tracking-[0.22em] text-[11px] text-eink-text/70 font-semibold uppercase">
                A PRODUCT OF SWAPLYONE
              </span>
            </div>

            {/* Center: Kanji Watermark & Purpose */}
            <div className="flex items-center gap-2 font-mono text-[10px] text-eink-textMuted/80 tracking-widest uppercase">
              <span>栞 SHIORI</span>
              <span>—</span>
              <span>ELECTRONIC PAPER WORKSPACE</span>
            </div>

            {/* Right: Craft & Version */}
            <div className="flex items-center gap-2 text-[10px] font-mono text-eink-textMuted/60 uppercase">
              <span>PLAN · BUILD · VERIFY</span>
            </div>
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

      {/* Global Spark Companion Modal */}
      <SparkCompanionModal />

      {/* Floating Spark Quick-Talk Launcher (Always accessible, mobile safe-area aware) */}
      <button
        onClick={openSpark}
        className={`fixed bottom-5 right-5 z-40 px-3 py-2 bg-eink-surface hover:bg-eink-surfaceHover text-eink-text border border-eink-border shadow-eink-sm hover:scale-105 active:scale-95 transition-all flex items-center gap-1.5 rounded-full font-technical text-xs font-bold ${
          heySparkEnabled ? 'ring-1 ring-eink-text' : ''
        }`}
        title={heySparkEnabled ? 'Spark is listening for "Hey Spark" (Ctrl+J)' : 'Open Spark Companion (Ctrl+J / Alt+S)'}
      >
        <span className="text-eink-text font-bold">✦</span>
        <span className="tracking-wider">SPARK</span>
        {heySparkEnabled ? (
          <Radio className="w-3.5 h-3.5 text-eink-text animate-pulse ml-0.5" />
        ) : (
          <Mic className="w-3.5 h-3.5 text-eink-textSecondary ml-0.5" />
        )}
      </button>

      {/* Install PWA Prompt */}
      <PwaInstallPrompt />

      {/* Notification Permission Prompt for First-Time Entry */}
      <NotificationPermissionPrompt />
    </div>
  );
};
