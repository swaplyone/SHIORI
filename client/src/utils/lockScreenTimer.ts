// Live Lock-Screen Focus Timer (MediaSession & PWA Notification Lock-Screen Activity)
// Displays a live ticking timer and controls on Android/iOS/Desktop lock screens just like Zepto / Live Activities.

class LockScreenTimerManager {
  private audioElement: HTMLAudioElement | null = null;
  private isRunning: boolean = false;
  private onPauseCb?: () => void;
  private onResumeCb?: () => void;
  private onStopCb?: () => void;

  private getAudioElement(): HTMLAudioElement {
    if (!this.audioElement) {
      // 1-second silent MP3 data URI to keep Media Session active in background and lock screen
      const silentAudioUri =
        'data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA';
      this.audioElement = new Audio(silentAudioUri);
      this.audioElement.loop = true;
    }
    return this.audioElement;
  }

  public start(params: {
    taskTitle: string;
    projectName: string;
    secondsRemaining: number;
    totalSeconds: number;
    onPause?: () => void;
    onResume?: () => void;
    onStop?: () => void;
  }) {
    this.onPauseCb = params.onPause;
    this.onResumeCb = params.onResume;
    this.onStopCb = params.onStop;
    this.isRunning = true;

    try {
      const audio = this.getAudioElement();
      audio.play().catch(() => {
        // User gesture needed on some platforms
      });

      if ('mediaSession' in navigator) {
        navigator.mediaSession.playbackState = 'playing';

        // Bind lock-screen media widget controls
        navigator.mediaSession.setActionHandler('play', () => {
          this.onResumeCb?.();
          navigator.mediaSession.playbackState = 'playing';
        });

        navigator.mediaSession.setActionHandler('pause', () => {
          this.onPauseCb?.();
          navigator.mediaSession.playbackState = 'paused';
        });

        navigator.mediaSession.setActionHandler('stop', () => {
          this.onStopCb?.();
          this.stop();
        });

        navigator.mediaSession.setActionHandler('seekto', () => {});
      }

      this.update(params.secondsRemaining, params.totalSeconds, false, params.taskTitle, params.projectName);
    } catch (err) {
      console.warn('[LOCKSCREEN TIMER] Init error:', err);
    }
  }

  public update(
    secondsRemaining: number,
    totalSeconds: number,
    isPaused: boolean,
    taskTitle: string = 'Focus Session',
    projectName: string = 'SHIORI'
  ) {
    if (!this.isRunning) return;

    const mins = Math.floor(secondsRemaining / 60);
    const secs = secondsRemaining % 60;
    const timeFormatted = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;

    const titleStr = isPaused
      ? `⏸ ${timeFormatted} (Paused) • ${taskTitle}`
      : secondsRemaining <= 0
      ? `🔔 Focus Complete! • ${taskTitle}`
      : `⏳ ${timeFormatted} • ${taskTitle}`;

    // 1. Update MediaSession Lock Screen Widget
    if ('mediaSession' in navigator) {
      try {
        navigator.mediaSession.metadata = new MediaMetadata({
          title: titleStr,
          artist: `SHIORI Focus Mode (${Math.round(totalSeconds / 60)}m)`,
          album: projectName,
          artwork: [
            { src: '/favicon-shiori.png', sizes: '192x192', type: 'image/png' },
            { src: '/favicon-shiori.png', sizes: '512x512', type: 'image/png' },
          ],
        });

        navigator.mediaSession.playbackState = isPaused ? 'paused' : 'playing';

        if ('setPositionState' in navigator.mediaSession && totalSeconds > 0) {
          const pos = Math.max(0, Math.min(totalSeconds, totalSeconds - secondsRemaining));
          navigator.mediaSession.setPositionState({
            duration: totalSeconds,
            playbackRate: isPaused ? 0 : 1,
            position: pos,
          });
        }
      } catch (e) {
        // Ignored
      }
    }

    // 2. Update Browser Tab Title
    if (typeof document !== 'undefined') {
      document.title = `${timeFormatted} | ${taskTitle} - SHIORI`;
    }
  }

  public stop() {
    this.isRunning = false;
    try {
      if (this.audioElement) {
        this.audioElement.pause();
        this.audioElement.currentTime = 0;
      }

      if ('mediaSession' in navigator) {
        navigator.mediaSession.playbackState = 'none';
        navigator.mediaSession.metadata = null;
      }

      if (typeof document !== 'undefined') {
        document.title = 'SHIORI - High-Velocity Development Workspace';
      }
    } catch (err) {
      console.warn('[LOCKSCREEN TIMER] Stop error:', err);
    }
  }
}

export const lockScreenTimer = new LockScreenTimerManager();
