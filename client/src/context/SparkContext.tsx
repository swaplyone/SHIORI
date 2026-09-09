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

interface SparkContextType {
  isSparkOpen: boolean;
  openSpark: (initialCommand?: string) => void;
  closeSpark: () => void;
  toggleSpark: () => void;
  heySparkEnabled: boolean;
  setHeySparkEnabled: (enabled: boolean) => void;
  isWakeListening: boolean;
  initialCommand: string;
  clearInitialCommand: () => void;
  briefingData: BriefingData | null;
  refreshBriefing: () => Promise<void>;
  hasSeenGreeting: boolean;
  dismissGreeting: () => void;
  playWakeChime: () => void;
}

const SparkContext = createContext<SparkContextType | undefined>(undefined);

// Helper for fuzzy wake-word matching and command extraction
function extractWakeCommand(transcript: string): { isWake: boolean; commandText: string } {
  if (!transcript) return { isWake: false, commandText: '' };
  const lower = transcript.toLowerCase().trim();

  // List of wake-word patterns (including common speech engine misrecognitions)
  const wakePrefixes = [
    /^(?:hey|hi|hello|ok|okay|yo)?\s*spark[,.]?\s*/i,
    /^(?:hey|hi|hello|ok|okay|yo)?\s*sparky[,.]?\s*/i,
    /^(?:hey|hi|hello|ok|okay|yo)?\s*sparks[,.]?\s*/i,
    /^(?:hey|hi|hello|ok|okay|yo)?\s*spot[,.]?\s*/i,
    /^(?:hey|hi|hello|ok|okay|yo)?\s*smart[,.]?\s*/i,
    /^(?:hey|hi|hello|ok|okay|yo)?\s*spock[,.]?\s*/i,
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

  // Also check if wake-phrase occurs anywhere in the transcript
  const keywordVariants = ['hey spark', 'hi spark', 'ok spark', 'spark', 'sparky', 'hey spot', 'hey spock', 'hey stark'];
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
  const [heySparkEnabled, setHeySparkEnabledState] = useState<boolean>(() => {
    const saved = localStorage.getItem('shiori_hey_spark_enabled');
    // Default to true so Wake Word works out-of-the-box
    return saved !== 'false';
  });
  const [isWakeListening, setIsWakeListening] = useState(false);
  const [briefingData, setBriefingData] = useState<BriefingData | null>(null);
  const [hasSeenGreeting, setHasSeenGreeting] = useState<boolean>(() => {
    return sessionStorage.getItem('shiori_spark_session_greeting') === 'seen';
  });

  const wakeRecognitionRef = useRef<any>(null);
  const isListeningLoopRef = useRef(false);
  const restartTimerRef = useRef<any>(null);

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

  const setHeySparkEnabled = (enabled: boolean) => {
    setHeySparkEnabledState(enabled);
    localStorage.setItem('shiori_hey_spark_enabled', enabled ? 'true' : 'false');
    if (enabled && navigator.mediaDevices?.getUserMedia) {
      navigator.mediaDevices.getUserMedia({ audio: true }).catch(() => {});
    }
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

  // Robust, resilient on-device wake-word detection loop
  useEffect(() => {
    if (!heySparkEnabled || isSparkOpen || !isAuthenticated) {
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
      if (!isListeningLoopRef.current || !heySparkEnabled || isSparkOpen) return;

      try {
        const recognition = new SpeechRecognition();
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.lang = 'en-US';
        recognition.maxAlternatives = 3;

        recognition.onstart = () => {
          setIsWakeListening(true);
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
            console.warn('[SPARK WAKE] Mic permission not granted.');
            setIsWakeListening(false);
            isListeningLoopRef.current = false;
          }
        };

        recognition.onend = () => {
          setIsWakeListening(false);
          wakeRecognitionRef.current = null;
          // Gracefully spawn new instance to maintain perpetual standby listener
          if (isListeningLoopRef.current && heySparkEnabled && !isSparkOpen) {
            restartTimerRef.current = setTimeout(() => {
              if (isListeningLoopRef.current && !isSparkOpen) {
                startInstance();
              }
            }, 300);
          }
        };

        recognition.start();
        wakeRecognitionRef.current = recognition;
      } catch (err) {
        console.warn('Wake speech recognition spawn error:', err);
        if (isListeningLoopRef.current && !isSparkOpen) {
          restartTimerRef.current = setTimeout(startInstance, 1000);
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
  }, [heySparkEnabled, isSparkOpen, isAuthenticated, playWakeChime]);

  return (
    <SparkContext.Provider
      value={{
        isSparkOpen,
        openSpark,
        closeSpark,
        toggleSpark,
        heySparkEnabled,
        setHeySparkEnabled,
        isWakeListening,
        initialCommand,
        clearInitialCommand,
        briefingData,
        refreshBriefing,
        hasSeenGreeting,
        dismissGreeting,
        playWakeChime
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
