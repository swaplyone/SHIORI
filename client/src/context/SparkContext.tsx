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
  
  // State
  isWakeListening: boolean;
  initialCommand: string;
  clearInitialCommand: () => void;
  briefingData: BriefingData | null;
  refreshBriefing: () => Promise<void>;
  hasSeenGreeting: boolean;
  dismissGreeting: () => void;
  playWakeChime: () => void;
  recognitionLanguage: string;
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
  const [micPermissionStatus, setMicPermissionStatus] = useState<MicPermissionState>('prompt');
  const [isMicPromptOpen, setIsMicPromptOpen] = useState(false);

  const [briefingData, setBriefingData] = useState<BriefingData | null>(null);
  const [hasSeenGreeting, setHasSeenGreeting] = useState<boolean>(() => {
    return sessionStorage.getItem('shiori_spark_session_greeting') === 'seen';
  });

  // Best speech recognition language (defaulting to en-IN for natural Indian English pronunciation)
  const recognitionLanguage = navigator.language?.startsWith('en') ? 'en-IN' : (navigator.language || 'en-IN');

  const wakeRecognitionRef = useRef<any>(null);
  const isListeningLoopRef = useRef(false);
  const restartTimerRef = useRef<any>(null);
  const consecutiveErrorCountRef = useRef(0);

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
    if (!navigator.mediaDevices?.getUserMedia) {
      setMicPermissionStatus('unsupported');
      return false;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      // Stop stream immediately after permission is confirmed
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
    if (cmd) setInitialCommand(cmd);
    setIsSparkOpen(true);
  };

  const closeSpark = () => {
    setIsSparkOpen(false);
    setInitialCommand('');
  };

  const toggleSpark = () => {
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

  // Robust on-device wake-word detection loop (SHIORI-open only)
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
      return;
    }

    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      console.warn('[SPARK WAKE] SpeechRecognition API not supported in this browser.');
      setIsWakeListening(false);
      return;
    }

    isListeningLoopRef.current = true;

    const startInstance = () => {
      if (!isListeningLoopRef.current || !heySparkEnabled || !voiceAssistantEnabled || isSparkOpen) return;

      try {
        const recognition = new SpeechRecognition();
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.lang = recognitionLanguage;
        recognition.maxAlternatives = 3;

        recognition.onstart = () => {
          setIsWakeListening(true);
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
            console.warn('[SPARK WAKE] Microphone permission denied.');
            setIsWakeListening(false);
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

          // Safe restart throttling to prevent runaway loops
          if (isListeningLoopRef.current && heySparkEnabled && voiceAssistantEnabled && !isSparkOpen) {
            const delay = consecutiveErrorCountRef.current > 3 ? 3000 : 300;
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
        console.warn('Wake speech recognition spawn error:', err);
        if (isListeningLoopRef.current && !isSparkOpen) {
          restartTimerRef.current = setTimeout(startInstance, 1500);
        }
      }
    };

    startInstance();

    return () => {
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
        isWakeListening,
        initialCommand,
        clearInitialCommand,
        briefingData,
        refreshBriefing,
        hasSeenGreeting,
        dismissGreeting,
        playWakeChime,
        recognitionLanguage
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
