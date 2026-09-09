export type SparkVoice = 'af_bella' | 'af_heart' | 'af_nicole';

export interface SparkVoiceInfo {
  id: SparkVoice;
  name: string;
  description: string;
  character: string;
  sampleText: string;
}

export const STANDARD_VOICE_SAMPLE_TEXT = "Hey, I'm Spark. Ready when you are. You've got a few things to finish, so let's get started.";

export const DEFAULT_SPARK_VOICE: SparkVoice = 'af_bella';

export const SPARK_VOICES: SparkVoiceInfo[] = [
  {
    id: 'af_bella',
    name: 'Bella',
    description: 'Warm · Sweet · Friendly',
    character: 'The default Spark voice. Approachable, warm and naturally conversational.',
    sampleText: STANDARD_VOICE_SAMPLE_TEXT
  },
  {
    id: 'af_heart',
    name: 'Heart',
    description: 'Expressive · Gentle · Natural',
    character: 'Slightly more expressive and emotionally rich with natural cadence.',
    sampleText: STANDARD_VOICE_SAMPLE_TEXT
  },
  {
    id: 'af_nicole',
    name: 'Nicole',
    description: 'Soft · Calm · Relaxed',
    character: 'Gentler, quieter and more relaxed for calm focused work.',
    sampleText: STANDARD_VOICE_SAMPLE_TEXT
  }
];
