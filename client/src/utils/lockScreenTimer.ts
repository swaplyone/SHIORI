// Live Lock-Screen Focus Timer (iOS Safari MediaSession & Notification Activity Engine)
// Provides a continuous lock-screen ticking widget with play/pause/reset controls for iOS, Android, and Desktop.

function createValidSilenceWavUri(durationSec: number = 3): string {
  const sampleRate = 8000;
  const numChannels = 1;
  const bitsPerSample = 16;
  const numSamples = sampleRate * durationSec;
  const dataSize = numSamples * (bitsPerSample / 8);
  const headerSize = 44;
  const totalSize = headerSize + dataSize;
  const buffer = new Uint8Array(totalSize);

  const writeString = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) {
      buffer[offset + i] = str.charCodeAt(i);
    }
  };

  writeString(0, 'RIFF');
  const fileLen = totalSize - 8;
  buffer[4] = fileLen & 0xff;
  buffer[5] = (fileLen >> 8) & 0xff;
  buffer[6] = (fileLen >> 16) & 0xff;
  buffer[7] = (fileLen >> 24) & 0xff;

  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  buffer[16] = 16;
  buffer[17] = 0;
  buffer[18] = 0;
  buffer[19] = 0;
  buffer[20] = 1; // PCM
  buffer[21] = 0;
  buffer[22] = numChannels;
  buffer[23] = 0;

  // Sample Rate
  buffer[24] = sampleRate & 0xff;
  buffer[25] = (sampleRate >> 8) & 0xff;
  buffer[26] = (sampleRate >> 16) & 0xff;
  buffer[27] = (sampleRate >> 24) & 0xff;

  // Byte Rate
  const byteRate = sampleRate * numChannels * (bitsPerSample / 8);
  buffer[28] = byteRate & 0xff;
  buffer[29] = (byteRate >> 8) & 0xff;
  buffer[30] = (byteRate >> 16) & 0xff;
  buffer[31] = (byteRate >> 24) & 0xff;

  // Block Align & Bits
  buffer[32] = numChannels * (bitsPerSample / 8);
  buffer[33] = 0;
  buffer[34] = bitsPerSample;
  buffer[35] = 0;

  // Data subchunk
  writeString(36, 'data');
  buffer[40] = dataSize & 0xff;
  buffer[41] = (dataSize >> 8) & 0xff;
  buffer[42] = (dataSize >> 16) & 0xff;
  buffer[43] = (dataSize >> 24) & 0xff;

  let binary = '';
  const len = buffer.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(buffer[i]);
  }
  return 'data:audio/wav;base64,' + btoa(binary);
}

class LockScreenTimerManager {
  private audioElement: HTMLAudioElement | null = null;
  private isRunning: boolean = false;
  private onPauseCb?: () => void;
  private onResumeCb?: () => void;
  private onStopCb?: () => void;
  private cachedWavUri: string = '';

  private getAudioElement(): HTMLAudioElement {
    if (!this.audioElement) {
      if (!this.cachedWavUri) {
        this.cachedWavUri = createValidSilenceWavUri(3);
      }
      this.audioElement = new Audio(this.cachedWavUri);
      this.audioElement.loop = true;
      this.audioElement.preload = 'auto';
      this.audioElement.setAttribute('playsinline', 'true');
      this.audioElement.setAttribute('webkit-playsinline', 'true');
      // Low volume to ensure active audio stream on iOS
      this.audioElement.volume = 0.01;
    }
    return this.audioElement;
  }

  public async start(params: {
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
      // 1. Trigger audio play within user touch gesture
      const audio = this.getAudioElement();
      audio.currentTime = 0;
      const playPromise = audio.play();
      if (playPromise !== undefined) {
        playPromise.catch((err) => {
          console.warn('[LOCKSCREEN] Audio play deferral:', err);
        });
      }

      // 2. Setup iOS & Android MediaSession Widget
      if ('mediaSession' in navigator) {
        navigator.mediaSession.playbackState = 'playing';

        navigator.mediaSession.setActionHandler('play', () => {
          this.onResumeCb?.();
          const aud = this.getAudioElement();
          aud.play().catch(() => {});
          navigator.mediaSession.playbackState = 'playing';
        });

        navigator.mediaSession.setActionHandler('pause', () => {
          this.onPauseCb?.();
          const aud = this.getAudioElement();
          aud.pause();
          navigator.mediaSession.playbackState = 'paused';
        });

        navigator.mediaSession.setActionHandler('stop', () => {
          this.onStopCb?.();
          this.stop();
        });

        navigator.mediaSession.setActionHandler('previoustrack', () => {
          this.onResumeCb?.();
        });

        navigator.mediaSession.setActionHandler('nexttrack', () => {
          this.onStopCb?.();
        });

        try {
          navigator.mediaSession.setActionHandler('seekto' as any, () => {});
        } catch {}
      }

      this.update(params.secondsRemaining, params.totalSeconds, false, params.taskTitle, params.projectName);
    } catch (err) {
      console.warn('[LOCKSCREEN TIMER] Start error:', err);
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
          album: projectName || 'SHIORI',
          artwork: [
            { src: '/favicon-shiori.png', sizes: '96x96', type: 'image/png' },
            { src: '/favicon-shiori.png', sizes: '128x128', type: 'image/png' },
            { src: '/favicon-shiori.png', sizes: '192x192', type: 'image/png' },
            { src: '/favicon-shiori.png', sizes: '256x256', type: 'image/png' },
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
        // Handled silently
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
