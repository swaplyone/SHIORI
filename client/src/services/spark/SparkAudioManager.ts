/**
 * SparkAudioManager
 * Centralized audio playback and Web Audio manager for Spark.
 * Handles audio buffering, singleton playback without overlap, iOS audio unlocking,
 * and exposes real-time audio amplitude analysis for the Strands visualization.
 */

export class SparkAudioManager {
  private static instance: SparkAudioManager | null = null;

  private audioElement: HTMLAudioElement | null = null;
  private audioContext: AudioContext | null = null;
  private analyserNode: AnalyserNode | null = null;
  private sourceNode: MediaElementAudioSourceNode | null = null;
  private frequencyData: Uint8Array | null = null;

  private currentBlobUrl: string | null = null;
  private isAudioPlaying: boolean = false;
  private onEndCallback: (() => void) | null = null;
  private onErrorCallback: (() => void) | null = null;
  private onStartCallback: (() => void) | null = null;

  private constructor() {
    if (typeof window !== 'undefined') {
      this.initAudioElement();
    }
  }

  public static getInstance(): SparkAudioManager {
    if (!SparkAudioManager.instance) {
      SparkAudioManager.instance = new SparkAudioManager();
    }
    return SparkAudioManager.instance;
  }

  private initAudioElement() {
    if (this.audioElement) return;

    this.audioElement = new Audio();
    this.audioElement.preload = 'auto';
    this.audioElement.crossOrigin = 'anonymous';

    this.audioElement.addEventListener('playing', () => {
      this.isAudioPlaying = true;
      if (this.onStartCallback) {
        this.onStartCallback();
      }
    });

    this.audioElement.addEventListener('ended', () => {
      this.isAudioPlaying = false;
      this.cleanupBlobUrl();
      if (this.onEndCallback) {
        const cb = this.onEndCallback;
        this.onEndCallback = null;
        cb();
      }
    });

    this.audioElement.addEventListener('error', (e) => {
      console.warn('[SparkAudioManager] Audio playback error:', e);
      this.isAudioPlaying = false;
      this.cleanupBlobUrl();
      if (this.onErrorCallback) {
        const cb = this.onErrorCallback;
        this.onErrorCallback = null;
        cb();
      }
    });
  }

  private ensureAudioContext(): boolean {
    if (typeof window === 'undefined') return false;

    try {
      if (!this.audioContext) {
        const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
        if (!AudioContextClass) return false;
        this.audioContext = new AudioContextClass();
      }

      if (this.audioContext.state === 'suspended') {
        this.audioContext.resume().catch(() => {});
      }

      if (!this.analyserNode && this.audioContext) {
        this.analyserNode = this.audioContext.createAnalyser();
        this.analyserNode.fftSize = 64;
        this.analyserNode.smoothingTimeConstant = 0.8;
        this.frequencyData = new Uint8Array(this.analyserNode.frequencyBinCount);

        if (this.audioElement && !this.sourceNode) {
          try {
            this.sourceNode = this.audioContext.createMediaElementSource(this.audioElement);
            this.sourceNode.connect(this.analyserNode);
            this.analyserNode.connect(this.audioContext.destination);
          } catch (err) {
            console.warn('[SparkAudioManager] MediaElementSource connect error:', err);
          }
        }
      }

      return true;
    } catch (err) {
      console.warn('[SparkAudioManager] AudioContext init error:', err);
      return false;
    }
  }

  /**
   * Unlock Web Audio & Audio element on iOS Safari / PWA user gesture.
   */
  public unlockAudio(): void {
    if (typeof window === 'undefined') return;

    try {
      this.ensureAudioContext();

      if (this.audioContext && this.audioContext.state === 'suspended') {
        this.audioContext.resume().catch(() => {});
      }

      if (this.audioElement) {
        this.audioElement.load();
      }
    } catch (err) {
      console.warn('[SparkAudioManager] unlockAudio error:', err);
    }
  }

  /**
   * Play audio from a URL (e.g. Kokoro synthesis endpoint or cached audio)
   */
  public async playUrl(
    url: string,
    onStart?: () => void,
    onEnd?: () => void,
    onError?: () => void
  ): Promise<void> {
    this.stop(); // Stop any active playback immediately

    this.onStartCallback = onStart || null;
    this.onEndCallback = onEnd || null;
    this.onErrorCallback = onError || null;

    if (!this.audioElement) {
      this.initAudioElement();
    }

    if (!this.audioElement) {
      if (onError) onError();
      return;
    }

    this.ensureAudioContext();

    try {
      this.audioElement.src = url;
      await this.audioElement.play();
    } catch (err: any) {
      console.warn('[SparkAudioManager] playUrl error:', err);
      this.isAudioPlaying = false;
      if (onError) onError();
    }
  }

  /**
   * Play audio from an audio Blob (e.g. from Kokoro neural TTS synthesis)
   */
  public async playBlob(
    blob: Blob,
    onStart?: () => void,
    onEnd?: () => void,
    onError?: () => void
  ): Promise<void> {
    this.cleanupBlobUrl();
    const url = URL.createObjectURL(blob);
    this.currentBlobUrl = url;
    return this.playUrl(url, onStart, onEnd, onError);
  }

  /**
   * Stop active audio immediately.
   */
  public stop(): void {
    if (this.audioElement) {
      try {
        this.audioElement.pause();
        this.audioElement.currentTime = 0;
      } catch {}
    }
    this.isAudioPlaying = false;
    this.cleanupBlobUrl();
    this.onStartCallback = null;
    this.onEndCallback = null;
    this.onErrorCallback = null;
  }

  private cleanupBlobUrl() {
    if (this.currentBlobUrl) {
      try {
        URL.revokeObjectURL(this.currentBlobUrl);
      } catch {}
      this.currentBlobUrl = null;
    }
  }

  /**
   * Returns whether audio is currently playing.
   */
  public isPlaying(): boolean {
    return this.isAudioPlaying;
  }

  /**
   * Calculates smoothed RMS amplitude (0.0 to 1.0) for connecting Spark's voice to the Strands canvas animation.
   */
  public getAmplitude(): number {
    if (!this.isAudioPlaying || !this.analyserNode || !this.frequencyData) {
      return 0;
    }

    try {
      this.analyserNode.getByteFrequencyData(this.frequencyData as any);
      let sum = 0;
      for (let i = 0; i < this.frequencyData.length; i++) {
        sum += this.frequencyData[i];
      }
      const avg = sum / this.frequencyData.length;
      return Math.min(1.0, avg / 128.0);
    } catch {
      return 0;
    }
  }
}

export const sparkAudioManager = SparkAudioManager.getInstance();
