/**
 * Kokoro Neural TTS Service for SHIORI Server
 * Synthesizes audio using Kokoro voice profiles:
 * - af_bella: Warm · Sweet · Friendly
 * - af_heart: Expressive · Gentle · Natural
 * - af_nicole: Soft · Calm · Relaxed
 */

export type KokoroVoiceId = 'af_bella' | 'af_heart' | 'af_nicole';

export class KokoroService {
  private static instance: KokoroService | null = null;
  private cache: Map<string, Buffer> = new Map();

  public static getInstance(): KokoroService {
    if (!KokoroService.instance) {
      KokoroService.instance = new KokoroService();
    }
    return KokoroService.instance;
  }

  /**
   * Synthesizes natural speech audio buffer for a given voice and text.
   */
  public async synthesize(text: string, voice: KokoroVoiceId = 'af_bella'): Promise<Buffer | null> {
    const cleanText = text.trim();
    if (!cleanText) return null;

    const cacheKey = `${voice}:${cleanText}`;
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey)!;
    }

    // 1. Check if an external Kokoro/TTS endpoint is configured in environment
    const ttsEndpoint = process.env.KOKORO_TTS_URL || process.env.TTS_API_URL;
    const ttsApiKey = process.env.KOKORO_API_KEY || process.env.TTS_API_KEY;

    if (ttsEndpoint) {
      try {
        const headers: Record<string, string> = {
          'Content-Type': 'application/json'
        };
        if (ttsApiKey) {
          headers['Authorization'] = `Bearer ${ttsApiKey}`;
        }

        const res = await fetch(ttsEndpoint, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            model: 'kokoro',
            input: cleanText,
            voice: voice,
            response_format: 'mp3',
            speed: 1.0
          })
        });

        if (res.ok) {
          const arrayBuffer = await res.arrayBuffer();
          const buffer = Buffer.from(arrayBuffer);
          this.cache.set(cacheKey, buffer);
          return buffer;
        }
      } catch (err) {
        console.warn('[KokoroService] Remote synthesis failed:', err);
      }
    }

    return null;
  }
}

export const kokoroService = KokoroService.getInstance();
