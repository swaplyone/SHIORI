import React, { useEffect, useState } from 'react';
import { RotateCcw, X } from 'lucide-react';

export interface UndoItem {
  id: string;
  message: string;
  onUndo: () => Promise<void> | void;
}

export const UndoToast: React.FC = () => {
  const [activeItem, setActiveItem] = useState<UndoItem | null>(null);

  useEffect(() => {
    const handleUndoTrigger = (e: CustomEvent<UndoItem>) => {
      setActiveItem(e.detail);
    };

    window.addEventListener('shiori-undo-trigger' as any, handleUndoTrigger);
    return () => {
      window.removeEventListener('shiori-undo-trigger' as any, handleUndoTrigger);
    };
  }, []);

  useEffect(() => {
    if (!activeItem) return;
    const timer = setTimeout(() => {
      setActiveItem(null);
    }, 6000);
    return () => clearTimeout(timer);
  }, [activeItem]);

  if (!activeItem) return null;

  const handleUndo = async () => {
    try {
      await activeItem.onUndo();
    } catch (err) {
      console.error('Failed to undo action', err);
    } finally {
      setActiveItem(null);
    }
  };

  return (
    <div className="fixed bottom-6 right-6 z-50 animate-slide-up select-none font-technical">
      <div className="bg-eink-darkSurface text-eink-darkText border border-eink-border shadow-2xl rounded-sm px-4 py-3 flex items-center gap-4 text-xs">
        <span className="font-medium tracking-wide">{activeItem.message}</span>
        <div className="flex items-center gap-2">
          <button
            onClick={handleUndo}
            className="px-2.5 py-1 bg-eink-bg text-eink-text border border-eink-border font-bold text-[11px] rounded-sm flex items-center gap-1.5 hover:bg-eink-surface active:scale-95 transition-all shadow-sm"
          >
            <RotateCcw className="w-3 h-3" />
            <span>UNDO</span>
          </button>
          <button
            onClick={() => setActiveItem(null)}
            className="p-1 text-eink-darkText/70 hover:text-eink-darkText transition-colors"
            title="Dismiss"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
};

export function triggerUndoToast(message: string, onUndo: () => Promise<void> | void) {
  window.dispatchEvent(
    new CustomEvent('shiori-undo-trigger', {
      detail: {
        id: Math.random().toString(36).substring(7),
        message,
        onUndo,
      },
    })
  );
}
