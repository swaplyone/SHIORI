import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from './AuthContext';

interface BriefingData {
  greeting: string;
  punchline: string;
  summarySentence: string;
  counts: {
    running: number;
    pending: number;
    overdue: number;
    dueToday: number;
  };
  recommendation?: {
    taskCode: string;
    title: string;
    priority: string;
    projectName: string;
  } | null;
}

export type MicPermissionState = 'granted' | 'denied' | 'prompt' | 'unsupported';

interface SparkContextType {
  isSparkOpen: boolean;
  openSpark: (initialCommand?: string) => void;
  closeSpark: () => void;
  toggleSpark: () => void;
  
  // Settings & Toggles
  voiceAssistantEnabled: boolean;
  setVoiceAssistantEnabled: (enabled: boolean) => void;
  heySparkEnabled: boolean;
  setHeySparkEnabled: (enabled: boolean) => void;
  voiceResponsesEnabled: boolean;
  setVoiceResponsesEnabled: (enabled: boolean) => void;
  
  // Microphone & Permissions
  micPermissionStatus: MicPermissionState;
  checkMicPermission: () => Promise<MicPermissionState>;
  requestMicrophoneAccess: () => Promise<boolean>;
  isMicPromptOpen: boolean;
  openMicPrompt: () => void;
  closeMicPrompt: () => void;
  
  // Audio & iOS Unlock
  unlockIOSAudio: () => void;
  isAudioUnlocked: boolean;
  isIOS: boolean;
  
  // State
  isWakeListening: boolean;
  wakeListeningPaused: boolean;
  initialCommand: string;
  clearInitialCommand: () => void;
  briefingData: BriefingData | null;
  refreshBriefing: () => Promise<void>;
  hasSeenGreeting: boolean;
  dismissGreeting: () => void;
  playWakeChime: () => void;
  recognitionLanguage: string;
  availableVoices: SpeechSynthesisVoice[];
  speakSpark: (text: string, onStart?: () => void, onEnd?: () => void, onError?: () => void) => void;
}

const SparkContext = createContext<SparkContextType | undefined>(undefined);

// Helper for fuzzy wake-word matching and clean command extraction
export function extractWakeCommand(transcript: string): { isWake: boolean; commandText: string } {
  if (!transcript) return { isWake: false, commandText: '' };
  
  // Normalize casing and clean punctuation
  const lower = transcript.toLowerCase().trim();

  // Primary wake-word variations (including Indian English and phonetic browser misrecognitions)
  const wakePrefixes = [
    /^(?:hey|hi|hello|ok|okay|yo)?\s*spark[,.]?\s*/i,
    /^(?:hey|hi|hello|ok|okay|yo)?\s*sparc[,.]?\s*/i,
    /^(?:hey|hi|hello|ok|okay|yo)?\s*sparky[,.]?\s*/i,
    /^(?:hey|hi|hello|ok|okay|yo)?\s*sparks[,.]?\s*/i,
    /^(?:hey|hi|hello|ok|okay|yo)?\s*spock[,.]?\s*/i,
    /^(?:hey|hi|hello|ok|okay|yo)?\s*spot[,.]?\s*/i,
    /^(?:hey|hi|hello|ok|okay|yo)?\s*smart[,.]?\s*/i,
    /^(?:hey|hi|hello|ok|okay|yo)?\s*stark[,.]?\s*/i,
    /^(?:hey|hi|hello|ok|okay|yo)?\s*start[,.]?\s*/i,
    /^(?:hey|hi|hello|ok|okay|yo)?\s*shark[,.]?\s*/i,
    /^(?:hey|hi|hello|ok|okay|yo)?\s*bark[,.]?\s*/i,
    /^(?:hey|hi|hello|ok|okay|yo)?\s*mark[,.]?\s*/i,
    /^(?:hey|hi|hello|ok|okay|yo)?\s*park[,.]?\s*/i,
    /^(?:hey|hi|hello|ok|okay|yo)?\s*spar[,.]?\s*/i,
    /^(?:hey|hi|hello|ok|okay|yo)?\s*shiori[,.]?\s*/i
  ];

  for (const pattern of wakePrefixes) {
    if (pattern.test(lower)) {
      const remaining = lower.replace(pattern, '').trim();
      return { isWake: true, commandText: remaining };
    }
  }

  // Check substring anywhere in the utterance
  const keywordVariants = [
    'hey spark', 'hey, spark', 'hi spark', 'ok spark', 'okay spark', 
    'hey spock', 'hey sparc', 'hey stark', 'hey spot'
  ];
  for (const kw of keywordVariants) {
    const idx = lower.indexOf(kw);
    if (idx !== -1) {
      const remaining = lower.substring(idx + kw.length).replace(/^[,.\s]+/, '').trim();
      return { isWake: true, commandText: remaining };
    }
  }

  return { isWake: false, commandText: '' };
}

export const SparkProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { token, isAuthenticated } = useAuth();
  const [isSparkOpen, setIsSparkOpen] = useState(false);
  const [initialCommand, setInitialCommand] = useState('');
  
  // Toggles & Preferences with LocalStorage persistence
  const [voiceAssistantEnabled, setVoiceAssistantEnabledState] = useState<boolean>(() => {
    return localStorage.getItem('shiori_spark_assistant_enabled') !== 'false';
  });

  const [heySparkEnabled, setHeySparkEnabledState] = useState<boolean>(() => {
    return localStorage.getItem('shiori_hey_spark_enabled') !== 'false';
  });

  const [voiceResponsesEnabled, setVoiceResponsesEnabledState] = useState<boolean>(() => {
    return localStorage.getItem('shiori_spark_voice_responses') !== 'false';
  });

  const [isWakeListening, setIsWakeListening] = useState(false);
  const [wakeListeningPaused, setWakeListeningPaused] = useState(false);
  const [micPermissionStatus, setMicPermissionStatus] = useState<MicPermissionState>('prompt');
  const [isMicPromptOpen, setIsMicPromptOpen] = useState(false);
  const [isAudioUnlocked, setIsAudioUnlocked] = useState(false);
  const [availableVoices, setAvailableVoices] = useState<SpeechSynthesisVoice[]>([]);

  const [briefingData, setBriefingData] = useState<BriefingData | null>(null);
  const [hasSeenGreeting, setHasSeenGreeting] = useState<boolean>(() => {
    return sessionStorage.getItem('shiori_spark_session_greeting') === 'seen';
  });

  const isIOS = typeof navigator !== 'undefined' && (
    /iPad|iPhone|iPod/.test(navigator.userAgent) || 
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  );

  // Best speech recognition language
  const recognitionLanguage = navigator.language?.startsWith('en') ? 'en-IN' : (navigator.language || 'en-IN');

  const wakeRecognitionRef = useRef<any>(null);
  const isListeningLoopRef = useRef(false);
  const restartTimerRef = useRef<any>(null);
  const consecutiveErrorCountRef = useRef(0);

  // 1. Populate & Cache Speech Synthesis Voices (Asynchronous on iOS Safari)
  const loadVoices = useCallback(() => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    const voices = window.speechSynthesis.getVoices();
    if (voices && voices.length > 0) {
      setAvailableVoices(voices);
    }
  }, []);

  useEffect(() => {
    loadVoices();
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.onvoiceschanged = loadVoices;
    }
  }, [loadVoices]);

  // 2. iOS Audio User Gesture Unlock Step
  const unlockIOSAudio = useCallback(() => {
    if (typeof window === 'undefined') return;
    try {
      // Unlock Web Audio Context
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtx) {
        const ctx = new AudioCtx();
        if (ctx.state === 'suspended') {
          ctx.resume();
        }
        const buffer = ctx.createBuffer(1, 1, 22050);
        const source = ctx.createBufferSource();
        source.buffer = buffer;
        source.connect(ctx.destination);
        source.start(0);
      }

      // Unlock SpeechSynthesis on iOS WebKit
      if ('speechSynthesis' in window) {
        window.speechSynthesis.resume();
        const dummyUtterance = new SpeechSynthesisUtterance('');
        dummyUtterance.volume = 0;
        dummyUtterance.rate = 2;
        window.speechSynthesis.speak(dummyUtterance);
      }

      setIsAudioUnlocked(true);
    } catch (e) {
      console.warn('[SPARK AUDIO UNLOCK]', e);
    }
  }, []);

  // One-time auto unlock on first user gesture anywhere in the app
  useEffect(() => {
    const handleGesture = () => {
      unlockIOSAudio();
    };
    window.addEventListener('click', handleGesture, { once: true, passive: true });
    window.addEventListener('touchstart', handleGesture, { once: true, passive: true });
    return () => {
      window.removeEventListener('click', handleGesture);
      window.removeEventListener('touchstart', handleGesture);
    };
  }, [unlockIOSAudio]);

  // 3. Reusable speakSpark function with robust iOS voice selection
  const speakSpark = useCallback((
    text: string,
    onStart?: () => void,
    onEnd?: () => void,
    onError?: () => void
  ) => {
    if (!voiceResponsesEnabled || typeof window === 'undefined' || !('speechSynthesis' in window)) {
      if (onEnd) onEnd();
      return;
    }

    try {
      window.speechSynthesis.cancel();
      const clean = text
        .replace(/[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F1E6}-\u{1F1FF}\u{1F600}-\u{1F64F}\u{1F680}-\u{1F6FF}]/gu, '')
        .replace(/[*_~`#\[\]\(\)]/g, '')
        .trim();

      if (!clean) {
        if (onEnd) onEnd();
        return;
      }

      const utterance = new SpeechSynthesisUtterance(clean);
      const voices = availableVoices.length > 0 ? availableVoices : window.speechSynthesis.getVoices();

      // Pick best English voice on device
      let selectedVoice = voices.find(v => v.lang === recognitionLanguage || v.lang.replace('_', '-') === recognitionLanguage);
      if (!selectedVoice) {
        selectedVoice = voices.find(v => v.lang.startsWith('en-IN') || v.lang.startsWith('en-GB') || v.lang.startsWith('en-US') || v.lang.startsWith('en'));
      }
      if (selectedVoice) {
        utterance.voice = selectedVoice;
        utterance.lang = selectedVoice.lang;
      } else {
        utterance.lang = recognitionLanguage || 'en-US';
      }

      utterance.rate = 1.0;
      utterance.pitch = 1.0;
      utterance.volume = 1.0;

      utterance.onstart = () => {
        if (onStart) onStart();
      };

      utterance.onend = () => {
        if (onEnd) onEnd();
      };

      utterance.onerror = (e) => {
        console.warn('[SPARK SPEECH SYNTHESIS ERROR]', e);
        if (onError) onError();
        else if (onEnd) onEnd();
      };

      window.speechSynthesis.speak(utterance);
    } catch (err) {
      console.warn('speakSpark error:', err);
      if (onError) onError();
      else if (onEnd) onEnd();
    }
  }, [voiceResponsesEnabled, recognitionLanguage, availableVoices]);

  // Check microphone permission via Permissions API
  const checkMicPermission = useCallback(async (): Promise<MicPermissionState> => {
    if (typeof navigator === 'undefined' || !navigator.permissions) {
      return 'prompt';
    }
    try {
      const status = await navigator.permissions.query({ name: 'microphone' as PermissionName });
      const state = (status.state as MicPermissionState) || 'prompt';
      setMicPermissionStatus(state);
      status.onchange = () => {
        setMicPermissionStatus((status.state as MicPermissionState) || 'prompt');
      };
      return state;
    } catch {
      return 'prompt';
    }
  }, []);

  useEffect(() => {
    checkMicPermission();
  }, [checkMicPermission]);

  // Request microphone permission explicitly
  const requestMicrophoneAccess = async (): Promise<boolean> => {
    unlockIOSAudio();
    if (!navigator.mediaDevices?.getUserMedia) {
      setMicPermissionStatus('unsupported');
      return false;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((track) => track.stop());
      setMicPermissionStatus('granted');
      return true;
    } catch (err: any) {
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        setMicPermissionStatus('denied');
      } else {
        setMicPermissionStatus('prompt');
      }
      return false;
    }
  };

  // Play pleasant double chime on wake detection
  const playWakeChime = useCallback(() => {
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      if (ctx.state === 'suspended') {
        ctx.resume();
      }
      const osc1 = ctx.createOscillator();
      const osc2 = ctx.createOscillator();
      const gain = ctx.createGain();

      osc1.type = 'sine';
      osc2.type = 'sine';
      osc1.frequency.setValueAtTime(587.33, ctx.currentTime); // D5
      osc2.frequency.setValueAtTime(880.00, ctx.currentTime + 0.08); // A5

      gain.gain.setValueAtTime(0.12, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);

      osc1.connect(gain);
      osc2.connect(gain);
      gain.connect(ctx.destination);

      osc1.start(ctx.currentTime);
      osc1.stop(ctx.currentTime + 0.08);
      osc2.start(ctx.currentTime + 0.08);
      osc2.stop(ctx.currentTime + 0.35);
    } catch {}
  }, []);

  const setVoiceAssistantEnabled = (enabled: boolean) => {
    setVoiceAssistantEnabledState(enabled);
    localStorage.setItem('shiori_spark_assistant_enabled', enabled ? 'true' : 'false');
  };

  const setHeySparkEnabled = (enabled: boolean) => {
    setHeySparkEnabledState(enabled);
    localStorage.setItem('shiori_hey_spark_enabled', enabled ? 'true' : 'false');
    if (enabled) {
      checkMicPermission().then((status) => {
        if (status !== 'granted') {
          setIsMicPromptOpen(true);
        }
      });
    }
  };

  const setVoiceResponsesEnabled = (enabled: boolean) => {
    setVoiceResponsesEnabledState(enabled);
    localStorage.setItem('shiori_spark_voice_responses', enabled ? 'true' : 'false');
  };

  const openSpark = (cmd?: string) => {
    unlockIOSAudio();
    if (cmd) setInitialCommand(cmd);
    setIsSparkOpen(true);
  };

  const closeSpark = () => {
    setIsSparkOpen(false);
    setInitialCommand('');
  };

  const toggleSpark = () => {
    unlockIOSAudio();
    setIsSparkOpen((prev) => !prev);
  };

  const clearInitialCommand = () => setInitialCommand('');

  const dismissGreeting = () => {
    setHasSeenGreeting(true);
    sessionStorage.setItem('shiori_spark_session_greeting', 'seen');
  };

  const openMicPrompt = () => setIsMicPromptOpen(true);
  const closeMicPrompt = () => setIsMicPromptOpen(false);

  // Fetch daily briefing on session load
  const refreshBriefing = async () => {
    if (!token || !isAuthenticated) return;
    try {
      const res = await fetch('/api/spark/briefing', {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setBriefingData(data);
      }
    } catch (e) {
      console.warn('Failed to load Spark briefing:', e);
    }
  };

  useEffect(() => {
    if (isAuthenticated && token) {
      refreshBriefing();
    }
  }, [isAuthenticated, token]);

  // Robust on-device wake-word detection loop (SHIORI-open only) with iOS visibility handling
  useEffect(() => {
    if (!voiceAssistantEnabled || !heySparkEnabled || isSparkOpen || !isAuthenticated) {
      isListeningLoopRef.current = false;
      if (restartTimerRef.current) clearTimeout(restartTimerRef.current);
      if (wakeRecognitionRef.current) {
        try {
          wakeRecognitionRef.current.abort();
        } catch {}
        wakeRecognitionRef.current = null;
      }
      setIsWakeListening(false);
      setWakeListeningPaused(false);
      return;
    }

    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setIsWakeListening(false);
      setWakeListeningPaused(true);
      return;
    }

    isListeningLoopRef.current = true;

    const startInstance = () => {
      if (!isListeningLoopRef.current || !heySparkEnabled || !voiceAssistantEnabled || isSparkOpen) return;
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
        setIsWakeListening(false);
        setWakeListeningPaused(true);
        return;
      }

      try {
        if (wakeRecognitionRef.current) {
          try { wakeRecognitionRef.current.abort(); } catch {}
          wakeRecognitionRef.current = null;
        }

        const recognition = new SpeechRecognition();
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.lang = recognitionLanguage;
        recognition.maxAlternatives = 3;

        recognition.onstart = () => {
          setIsWakeListening(true);
          setWakeListeningPaused(false);
          consecutiveErrorCountRef.current = 0;
        };

        recognition.onresult = (event: any) => {
          for (let i = event.resultIndex; i < event.results.length; i++) {
            const result = event.results[i];
            for (let a = 0; a < result.length; a++) {
              const transcript = result[a].transcript || '';
              const { isWake, commandText } = extractWakeCommand(transcript);

              if (isWake) {
                playWakeChime();
                isListeningLoopRef.current = false;
                try {
                  recognition.abort();
                } catch {}
                wakeRecognitionRef.current = null;
                openSpark(commandText);
                return;
              }
            }
          }
        };

        recognition.onerror = (event: any) => {
          if (event.error === 'not-allowed') {
            setIsWakeListening(false);
            setWakeListeningPaused(true);
            isListeningLoopRef.current = false;
            setMicPermissionStatus('denied');
          } else if (event.error === 'no-speech' || event.error === 'network') {
            // Normal silent intervals, do not abort
          } else {
            consecutiveErrorCountRef.current += 1;
          }
        };

        recognition.onend = () => {
          setIsWakeListening(false);
          wakeRecognitionRef.current = null;

          // Safe restart throttling to prevent runaway loops, paused if document hidden
          if (isListeningLoopRef.current && heySparkEnabled && voiceAssistantEnabled && !isSparkOpen) {
            if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
              setWakeListeningPaused(true);
              return;
            }

            const delay = consecutiveErrorCountRef.current > 3 ? 3000 : 350;
            restartTimerRef.current = setTimeout(() => {
              if (isListeningLoopRef.current && !isSparkOpen) {
                startInstance();
              }
            }, delay);
          }
        };

        recognition.start();
        wakeRecognitionRef.current = recognition;
      } catch (err) {
        if (isListeningLoopRef.current && !isSparkOpen) {
          restartTimerRef.current = setTimeout(startInstance, 1500);
        }
      }
    };

    startInstance();

    // Visibility change handler (pauses wake listening when user leaves tab/app on iOS)
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        if (wakeRecognitionRef.current) {
          try { wakeRecognitionRef.current.abort(); } catch {}
          wakeRecognitionRef.current = null;
        }
        setIsWakeListening(false);
        setWakeListeningPaused(true);
      } else if (document.visibilityState === 'visible') {
        if (isListeningLoopRef.current && heySparkEnabled && voiceAssistantEnabled && !isSparkOpen) {
          startInstance();
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      isListeningLoopRef.current = false;
      if (restartTimerRef.current) clearTimeout(restartTimerRef.current);
      if (wakeRecognitionRef.current) {
        try {
          wakeRecognitionRef.current.abort();
        } catch {}
        wakeRecognitionRef.current = null;
      }
    };
  }, [heySparkEnabled, voiceAssistantEnabled, isSparkOpen, isAuthenticated, recognitionLanguage, playWakeChime]);

  return (
    <SparkContext.Provider
      value={{
        isSparkOpen,
        openSpark,
        closeSpark,
        toggleSpark,
        voiceAssistantEnabled,
        setVoiceAssistantEnabled,
        heySparkEnabled,
        setHeySparkEnabled,
        voiceResponsesEnabled,
        setVoiceResponsesEnabled,
        micPermissionStatus,
        checkMicPermission,
        requestMicrophoneAccess,
        isMicPromptOpen,
        openMicPrompt,
        closeMicPrompt,
        unlockIOSAudio,
        isAudioUnlocked,
        isIOS,
        isWakeListening,
        wakeListeningPaused,
        initialCommand,
        clearInitialCommand,
        briefingData,
        refreshBriefing,
        hasSeenGreeting,
        dismissGreeting,
        playWakeChime,
        recognitionLanguage,
        availableVoices,
        speakSpark
      }}
    >
      {children}
    </SparkContext.Provider>
  );
};

export const useSpark = () => {
  const context = useContext(SparkContext);
  if (!context) {
    throw new Error('useSpark must be used within a SparkProvider');
  }
  return context;
};
