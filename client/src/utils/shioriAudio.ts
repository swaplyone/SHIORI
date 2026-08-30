/**
 * SHIORI E-Ink Sound Design Engine
 * Inspired by Japanese stationery: paper, ink, pencil, quiet desk ambience, minimal tactile UI.
 * 
 * Uses Web Audio API for 0ms latency, zero external network dependency, and pristine acoustic control.
 */

class ShioriAudioEngine {
  private ctx: AudioContext | null = null;
  private isMuted: boolean = false;
  private initialized: boolean = false;

  constructor() {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem('shiori_sound_enabled');
      // Default to enabled (with browser autoplay gesture handling)
      this.isMuted = stored === 'false';
    }
  }

  private getContext(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    return this.ctx;
  }

  /**
   * Unlock / resume AudioContext on user interaction if browser policy suspended it
   */
  public async unlock(): Promise<boolean> {
    const ctx = this.getContext();
    if (!ctx) return false;
    try {
      if (ctx.state === 'suspended') {
        await ctx.resume();
      }
      this.initialized = true;
      return true;
    } catch {
      return false;
    }
  }

  public getSoundEnabled(): boolean {
    return !this.isMuted;
  }

  public setSoundEnabled(enabled: boolean): void {
    this.isMuted = !enabled;
    if (typeof window !== 'undefined') {
      localStorage.setItem('shiori_sound_enabled', enabled ? 'true' : 'false');
    }
    if (enabled) {
      this.unlock();
      this.playSoftClick(0.08);
    }
  }

  public toggleSound(): boolean {
    const nextState = !this.getSoundEnabled();
    this.setSoundEnabled(nextState);
    return nextState;
  }

  /**
   * 1. PAPER RUSTLE: Soft washi paper movement / subtle desk rustle
   * Accompanies illustration reveal (~0.4s - 0.9s)
   */
  public playPaperRustle(volume = 0.11): void {
    if (this.isMuted) return;
    const ctx = this.getContext();
    if (!ctx || ctx.state === 'suspended') return;

    try {
      const duration = 0.55;
      const bufferSize = ctx.sampleRate * duration;
      const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const data = buffer.getChannelData(0);

      // Generate soft brown/pink noise
      let lastOut = 0.0;
      for (let i = 0; i < bufferSize; i++) {
        const white = Math.random() * 2 - 1;
        // Low-pass integration for soft paper grain
        lastOut = (lastOut + (0.04 * white)) / 1.04;
        data[i] = lastOut * 3.2;
      }

      const noise = ctx.createBufferSource();
      noise.buffer = buffer;

      // Bandpass filter to isolate paper friction frequencies
      const filter = ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(800, ctx.currentTime);
      filter.frequency.exponentialRampToValueAtTime(1400, ctx.currentTime + duration * 0.5);
      filter.frequency.exponentialRampToValueAtTime(600, ctx.currentTime + duration);
      filter.Q.setValueAtTime(1.1, ctx.currentTime);

      // Smooth organic envelope
      const gainNode = ctx.createGain();
      gainNode.gain.setValueAtTime(0.0001, ctx.currentTime);
      gainNode.gain.linearRampToValueAtTime(volume, ctx.currentTime + 0.15);
      gainNode.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + duration);

      noise.connect(filter);
      filter.connect(gainNode);
      gainNode.connect(ctx.destination);

      noise.start();
      noise.stop(ctx.currentTime + duration);
    } catch {
      // Fail silently without breaking UI
    }
  }

  /**
   * 2. INK STROKE: Soft graphite / ink nib drawing onto textured paper
   * Synchronized with character reveal / logo appearance (~1.3s - 1.8s)
   */
  public playInkStroke(volume = 0.13): void {
    if (this.isMuted) return;
    const ctx = this.getContext();
    if (!ctx || ctx.state === 'suspended') return;

    try {
      const duration = 0.35;
      const bufferSize = ctx.sampleRate * duration;
      const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const data = buffer.getChannelData(0);

      // High-frequency friction grain
      for (let i = 0; i < bufferSize; i++) {
        data[i] = (Math.random() * 2 - 1) * 0.6;
      }

      const noise = ctx.createBufferSource();
      noise.buffer = buffer;

      // Highpass + Peaking filter for nib/brush friction
      const highpass = ctx.createBiquadFilter();
      highpass.type = 'highpass';
      highpass.frequency.setValueAtTime(2200, ctx.currentTime);

      const peakFilter = ctx.createBiquadFilter();
      peakFilter.type = 'peaking';
      peakFilter.frequency.setValueAtTime(3200, ctx.currentTime);
      peakFilter.Q.setValueAtTime(2.0, ctx.currentTime);
      peakFilter.gain.setValueAtTime(4.0, ctx.currentTime);

      // Soft fundamental harmonic for pen weight
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(240, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(180, ctx.currentTime + duration);

      const oscGain = ctx.createGain();
      oscGain.gain.setValueAtTime(0.0001, ctx.currentTime);
      oscGain.gain.linearRampToValueAtTime(volume * 0.35, ctx.currentTime + 0.05);
      oscGain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + duration);

      const noiseGain = ctx.createGain();
      noiseGain.gain.setValueAtTime(0.0001, ctx.currentTime);
      noiseGain.gain.linearRampToValueAtTime(volume, ctx.currentTime + 0.04);
      noiseGain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + duration);

      noise.connect(highpass);
      highpass.connect(peakFilter);
      peakFilter.connect(noiseGain);
      noiseGain.connect(ctx.destination);

      osc.connect(oscGain);
      oscGain.connect(ctx.destination);

      noise.start();
      osc.start();
      noise.stop(ctx.currentTime + duration);
      osc.stop(ctx.currentTime + duration);
    } catch {
      // Fail silently
    }
  }

  /**
   * 3. SOFT TACTILE CLICK / INK SETTLE: Delicate wooden stamp / task checkmark settle
   * Synchronized with task verification / settlement (~2.6s)
   */
  public playSoftClick(volume = 0.08): void {
    if (this.isMuted) return;
    const ctx = this.getContext();
    if (!ctx || ctx.state === 'suspended') return;

    try {
      const duration = 0.07;
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(1100, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(320, ctx.currentTime + duration);

      const gain = ctx.createGain();
      gain.gain.setValueAtTime(volume, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + duration);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start();
      osc.stop(ctx.currentTime + duration);
    } catch {
      // Fail silently
    }
  }

  /**
   * 4. ENTRANCE REFRESH: Subtle page turn + gentle physical e-ink settling sound
   * Triggered when clicking "OPEN SHIORI →"
   */
  public playPageTurn(volume = 0.12): void {
    if (this.isMuted) return;
    const ctx = this.getContext();
    if (!ctx || ctx.state === 'suspended') return;

    try {
      const duration = 0.28;
      const bufferSize = ctx.sampleRate * duration;
      const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const data = buffer.getChannelData(0);

      let last = 0;
      for (let i = 0; i < bufferSize; i++) {
        const white = Math.random() * 2 - 1;
        last = (last + 0.06 * white) / 1.06;
        data[i] = last * 2.8;
      }

      const noise = ctx.createBufferSource();
      noise.buffer = buffer;

      const filter = ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(1200, ctx.currentTime);
      filter.frequency.exponentialRampToValueAtTime(450, ctx.currentTime + duration);
      filter.Q.setValueAtTime(1.4, ctx.currentTime);

      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.0001, ctx.currentTime);
      gain.gain.linearRampToValueAtTime(volume, ctx.currentTime + 0.06);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + duration);

      noise.connect(filter);
      filter.connect(gain);
      gain.connect(ctx.destination);

      noise.start();
      noise.stop(ctx.currentTime + duration);
    } catch {
      // Fail silently
    }
  }
}

export const shioriAudio = new ShioriAudioEngine();
