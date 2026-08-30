/**
 * SHIORI High-Craft Acoustic Sound Design Engine
 * Inspired by Japanese stationery: washi paper, fountain pen ink, bamboo/wood desk tactile cues.
 * 
 * Uses Web Audio API with soft harmonic resonance, low-pass smoothing, and gentle acoustic envelopes.
 */

class ShioriAudioEngine {
  private ctx: AudioContext | null = null;
  private isMuted: boolean = false;

  constructor() {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem('shiori_sound_enabled');
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

  public async unlock(): Promise<boolean> {
    const ctx = this.getContext();
    if (!ctx) return false;
    try {
      if (ctx.state === 'suspended') {
        await ctx.resume();
      }
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
      this.playSoftClick(0.06);
    }
  }

  public toggleSound(): boolean {
    const nextState = !this.getSoundEnabled();
    this.setSoundEnabled(nextState);
    return nextState;
  }

  /**
   * 1. PAPER RUSTLE: Velvet washi paper glide (smooth, zero harsh static noise)
   * Plays at stage 2 (~0.4s)
   */
  public playPaperRustle(volume = 0.08): void {
    if (this.isMuted) return;
    const ctx = this.getContext();
    if (!ctx || ctx.state === 'suspended') return;

    try {
      const duration = 0.45;
      const bufferSize = Math.floor(ctx.sampleRate * duration);
      const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const data = buffer.getChannelData(0);

      // Velvet smooth Brownian noise with triple integration (no harsh white hiss)
      let b0 = 0, b1 = 0, b2 = 0;
      for (let i = 0; i < bufferSize; i++) {
        const white = Math.random() * 2 - 1;
        b0 = 0.96 * b0 + white * 0.04;
        b1 = 0.94 * b1 + b0 * 0.06;
        b2 = 0.92 * b2 + b1 * 0.08;
        data[i] = b2 * 4.5;
      }

      const noise = ctx.createBufferSource();
      noise.buffer = buffer;

      // Soft low-pass filter to keep only warm paper textures
      const lpf = ctx.createBiquadFilter();
      lpf.type = 'lowpass';
      lpf.frequency.setValueAtTime(650, ctx.currentTime);
      lpf.frequency.linearRampToValueAtTime(950, ctx.currentTime + duration * 0.4);
      lpf.frequency.exponentialRampToValueAtTime(450, ctx.currentTime + duration);

      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.0001, ctx.currentTime);
      gain.gain.linearRampToValueAtTime(volume, ctx.currentTime + 0.12);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + duration);

      noise.connect(lpf);
      lpf.connect(gain);
      gain.connect(ctx.destination);

      noise.start();
      noise.stop(ctx.currentTime + duration);
    } catch {}
  }

  /**
   * 2. INK STROKE: Delicate calligraphy brush / fountain pen nib glide
   * Plays at stage 3 (~1.3s)
   */
  public playInkStroke(volume = 0.09): void {
    if (this.isMuted) return;
    const ctx = this.getContext();
    if (!ctx || ctx.state === 'suspended') return;

    try {
      const duration = 0.32;

      // Warm acoustic stroke tone (harmonic resonance)
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(280, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(190, ctx.currentTime + duration);

      const oscGain = ctx.createGain();
      oscGain.gain.setValueAtTime(0.0001, ctx.currentTime);
      oscGain.gain.linearRampToValueAtTime(volume * 0.4, ctx.currentTime + 0.06);
      oscGain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + duration);

      osc.connect(oscGain);
      oscGain.connect(ctx.destination);

      // Soft paper nib friction
      const bufferSize = Math.floor(ctx.sampleRate * duration);
      const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      let smooth = 0;
      for (let i = 0; i < bufferSize; i++) {
        const w = Math.random() * 2 - 1;
        smooth = 0.85 * smooth + w * 0.15;
        data[i] = smooth * 0.7;
      }

      const noise = ctx.createBufferSource();
      noise.buffer = buffer;

      const bpf = ctx.createBiquadFilter();
      bpf.type = 'bandpass';
      bpf.frequency.setValueAtTime(1600, ctx.currentTime);
      bpf.Q.setValueAtTime(1.8, ctx.currentTime);

      const noiseGain = ctx.createGain();
      noiseGain.gain.setValueAtTime(0.0001, ctx.currentTime);
      noiseGain.gain.linearRampToValueAtTime(volume * 0.5, ctx.currentTime + 0.05);
      noiseGain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + duration);

      noise.connect(bpf);
      bpf.connect(noiseGain);
      noiseGain.connect(ctx.destination);

      osc.start();
      noise.start();
      osc.stop(ctx.currentTime + duration);
      noise.stop(ctx.currentTime + duration);
    } catch {}
  }

  /**
   * 3. SOFT TACTILE CLICK / INK SETTLE: Quiet Japanese wooden seal / bamboo desk tap
   * Plays at stage 6 (~2.6s)
   */
  public playSoftClick(volume = 0.07): void {
    if (this.isMuted) return;
    const ctx = this.getContext();
    if (!ctx || ctx.state === 'suspended') return;

    try {
      const duration = 0.065;

      // Resonant dual-tone bamboo / wood click
      const osc1 = ctx.createOscillator();
      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(760, ctx.currentTime);
      osc1.frequency.exponentialRampToValueAtTime(280, ctx.currentTime + duration);

      const osc2 = ctx.createOscillator();
      osc2.type = 'triangle';
      osc2.frequency.setValueAtTime(1120, ctx.currentTime);
      osc2.frequency.exponentialRampToValueAtTime(420, ctx.currentTime + duration);

      const gain = ctx.createGain();
      gain.gain.setValueAtTime(volume, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + duration);

      osc1.connect(gain);
      osc2.connect(gain);
      gain.connect(ctx.destination);

      osc1.start();
      osc2.start();
      osc1.stop(ctx.currentTime + duration);
      osc2.stop(ctx.currentTime + duration);
    } catch {}
  }

  /**
   * 4. ENTRANCE PAGE TURN: Soft notebook page turn + gentle physical e-ink settle
   * Plays when clicking "OPEN SHIORI →"
   */
  public playPageTurn(volume = 0.08): void {
    if (this.isMuted) return;
    const ctx = this.getContext();
    if (!ctx || ctx.state === 'suspended') return;

    try {
      const duration = 0.22;
      const bufferSize = Math.floor(ctx.sampleRate * duration);
      const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const data = buffer.getChannelData(0);

      let b = 0;
      for (let i = 0; i < bufferSize; i++) {
        b = 0.9 * b + (Math.random() * 2 - 1) * 0.1;
        data[i] = b * 2.2;
      }

      const noise = ctx.createBufferSource();
      noise.buffer = buffer;

      const lpf = ctx.createBiquadFilter();
      lpf.type = 'lowpass';
      lpf.frequency.setValueAtTime(800, ctx.currentTime);
      lpf.frequency.exponentialRampToValueAtTime(320, ctx.currentTime + duration);

      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.0001, ctx.currentTime);
      gain.gain.linearRampToValueAtTime(volume, ctx.currentTime + 0.04);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + duration);

      noise.connect(lpf);
      lpf.connect(gain);
      gain.connect(ctx.destination);

      noise.start();
      noise.stop(ctx.currentTime + duration);
    } catch {}
  }
}

export const shioriAudio = new ShioriAudioEngine();
