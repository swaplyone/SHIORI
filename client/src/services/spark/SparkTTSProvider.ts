/**
 * SparkTTSProvider
 * Provider abstraction for Spark Text-To-Speech.
 * Implements Kokoro neural TTS provider with seamless browser speech synthesis fallback.
 */

import { SparkVoice, DEFAULT_SPARK_VOICE } from '../../types/spark-voices';
import { sparkAudioManager } from './SparkAudioManager';
import { SparkSpeechFormatter } from './SparkSpeechFormatter';

export interface SparkTTSProvider {
  name: string;
  synthesize(text: string, voice: SparkVoice): Promise<Blob | null>;
}

/**
 * Kokoro Neural TTS Provider
 * Requests high-quality neural Kokoro audio from SHIORI server endpoint (/api/spark/tts).
 */
export class KokoroTTSProvider implements SparkTTSProvider {
  public name = 'Kokoro';
  private audioCache = new Map<string, Blob>();

  public async synthesize(text: string, voice: SparkVoice): Promise<Blob | null> {
    const formatted = SparkSpeechFormatter.format(text);
    if (!formatted) return null;

    const cacheKey = `${voice}:${formatted}`;
    if (this.audioCache.has(cacheKey)) {
      return this.audioCache.get(cacheKey)!;
    }

    try {
      const response = await fetch('/api/spark/tts', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'audio/wav, audio/mpeg, audio/webm, audio/*'
        },
        body: JSON.stringify({
          text: formatted,
          voice: voice || DEFAULT_SPARK_VOICE
        })
      });

      if (!response.ok) {
        throw new Error(`TTS server responded with status ${response.status}`);
      }

      const blob = await response.blob();
      if (blob && blob.size > 100) {
        this.audioCache.set(cacheKey, blob);
        return blob;
      }
      return null;
    } catch (err) {
      console.warn('[KokoroTTSProvider] Synthesis failed, triggering browser fallback:', err);
      return null;
    }
  }
}

/**
 * Browser Speech Synthesis Fallback Provider
 * Used when server-side Kokoro is unavailable or offline.
 */
export class BrowserSpeechFallbackProvider {
  public name = 'BrowserFallback';

  public speak(
    text: string,
    voice: SparkVoice,
    onStart?: () => void,
    onEnd?: () => void,
    onError?: () => void
  ): void {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
      if (onError) onError();
      else if (onEnd) onEnd();
      return;
    }

    try {
      window.speechSynthesis.cancel();
      const formatted = SparkSpeechFormatter.format(text);
      if (!formatted) {
        if (onEnd) onEnd();
        return;
      }

      const utterance = new SpeechSynthesisUtterance(formatted);
      const voices = window.speechSynthesis.getVoices();

      // Find best matching voice on device
      let matchedVoice: SpeechSynthesisVoice | undefined;
      const naturalVoices = voices.filter(v => 
        (v.name.includes('Natural') || v.name.includes('Online') || v.name.includes('Neural') || v.name.includes('Premium') || v.name.includes('Enhanced')) &&
        v.lang.startsWith('en')
      );

      const candidateVoices = naturalVoices.length > 0 ? naturalVoices : voices.filter(v => v.lang.startsWith('en'));

      if (voice === 'af_bella') {
        matchedVoice = candidateVoices.find(v => /bella|samantha|karen|victoria|zira|jenny|aria/i.test(v.name)) || candidateVoices[0];
        utterance.pitch = 1.0;
        utterance.rate = 0.98;
      } else if (voice === 'af_heart') {
        matchedVoice = candidateVoices.find(v => /heart|moira|fiona|serena|ava|sonia/i.test(v.name)) || candidateVoices[0];
        utterance.pitch = 1.02;
        utterance.rate = 0.95;
      } else if (voice === 'af_nicole') {
        matchedVoice = candidateVoices.find(v => /nicole|tessa|clara|susan|emma|stephanie/i.test(v.name)) || candidateVoices[0];
        utterance.pitch = 0.95;
        utterance.rate = 0.92;
      }

      if (matchedVoice) {
        utterance.voice = matchedVoice;
        utterance.lang = matchedVoice.lang;
      } else {
        utterance.lang = 'en-US';
      }

      utterance.onstart = () => {
        if (onStart) onStart();
      };

      utterance.onend = () => {
        if (onEnd) onEnd();
      };

      utterance.onerror = (e) => {
        console.warn('[BrowserSpeechFallbackProvider] Speech error:', e);
        if (onError) onError();
        else if (onEnd) onEnd();
      };

      window.speechSynthesis.speak(utterance);
    } catch (err) {
      console.warn('[BrowserSpeechFallbackProvider] Failed to speak:', err);
      if (onError) onError();
      else if (onEnd) onEnd();
    }
  }
}

/**
 * Composite Spark TTS Manager
 * Orchestrates Kokoro synthesis with automatic browser speech synthesis fallback.
 */
export class SparkTTSManager {
  private kokoroProvider = new KokoroTTSProvider();
  private browserFallback = new BrowserSpeechFallbackProvider();

  public async speak(
    text: string,
    voice: SparkVoice = DEFAULT_SPARK_VOICE,
    onStart?: () => void,
    onEnd?: () => void,
    onError?: () => void
  ): Promise<void> {
    // 1. Cancel any active browser speech synthesis or audio playback
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    sparkAudioManager.stop();

    const formatted = SparkSpeechFormatter.format(text);
    if (!formatted) {
      if (onEnd) onEnd();
      return;
    }

    // 2. Try Kokoro Neural TTS first
    try {
      const audioBlob = await this.kokoroProvider.synthesize(formatted, voice);
      if (audioBlob) {
        await sparkAudioManager.playBlob(audioBlob, onStart, onEnd, onError);
        return;
      }
    } catch (err) {
      console.warn('[SparkTTSManager] Kokoro error, using browser fallback:', err);
    }

    // 3. Fallback to Browser Speech Synthesis
    this.browserFallback.speak(formatted, voice, onStart, onEnd, onError);
  }

  public stop(): void {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    sparkAudioManager.stop();
  }
}

export const sparkTTSManager = new SparkTTSManager();
