import { useState, useEffect, useCallback, useRef } from 'react';
import { shioriAudio } from '../utils/shioriAudio';

export interface UseShioriWelcomeSoundOptions {
  prefersReducedMotion?: boolean;
}

export function useShioriWelcomeSound({ prefersReducedMotion = false }: UseShioriWelcomeSoundOptions = {}) {
  const [soundEnabled, setSoundEnabled] = useState<boolean>(() => shioriAudio.getSoundEnabled());
  const hasTriggeredInitialSound = useRef(false);

  // Sync state with audio engine
  const toggleSound = useCallback(() => {
    const next = shioriAudio.toggleSound();
    setSoundEnabled(next);
  }, []);

  // Listen for user gesture to unlock AudioContext
  useEffect(() => {
    const handleGesture = () => {
      shioriAudio.unlock();
    };

    window.addEventListener('pointerdown', handleGesture, { once: true });
    window.addEventListener('keydown', handleGesture, { once: true });

    return () => {
      window.removeEventListener('pointerdown', handleGesture);
      window.removeEventListener('keydown', handleGesture);
    };
  }, []);

  /**
   * Synchronize sound events with OpeningAnimation stages:
   * Stage 2 (0.4s): Progressive illustration ink drawing -> Paper rustle
   * Stage 3 (1.3s): Sequential character reveal for SHIORI -> Ink/pencil stroke
   * Stage 6 (2.6s): Task auto-completes into ✓ Fix authentication -> Soft tactile click / settle
   */
  const playStageSound = useCallback((stage: number) => {
    if (prefersReducedMotion || !soundEnabled) return;

    switch (stage) {
      case 2:
        shioriAudio.playPaperRustle(0.11);
        break;
      case 3:
        shioriAudio.playInkStroke(0.13);
        break;
      case 6:
        shioriAudio.playSoftClick(0.09);
        break;
      default:
        break;
    }
  }, [prefersReducedMotion, soundEnabled]);

  const playEntranceSound = useCallback(() => {
    if (!soundEnabled) return;
    shioriAudio.playPageTurn(0.12);
  }, [soundEnabled]);

  return {
    soundEnabled,
    toggleSound,
    playStageSound,
    playEntranceSound,
  };
}
