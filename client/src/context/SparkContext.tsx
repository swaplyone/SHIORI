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

// Helper for fuzzy wake-word matching
function extractWakeCommand(transcript: string): { isWake: boolean; commandText: string } {
  const lower = transcript.toLowerCase().trim();
  
  // List of wake-word patterns (including common speech engine misrecognitions)
  const wakePatterns = [
    /^hey\s+spark[,.]?\s*/i,
    /^spark[,.]?\s*/i,
    /^hey\s+sparks[,.]?\s*/i,
    /^sparks[,.]?\s*/i,
    /^hey\s+spot[,.]?\s*/i,
    /^hey\s+smart[,.]?\s*/i,
    /^hey\s+shark[,.]?\s*/i,
    /^hey\s+shiori[,.]?\s*/i,
    /^shiori[,.]?\s*/i
  ];

  for (const pattern of wakePatterns) {
    if (pattern.test(lower)) {
      const remaining = lower.replace(pattern, '').trim();
      return { isWake: true, commandText: remaining };
    }
  }

  // Also check anywhere inside sentence (e.g., "okay hey spark what is overdue")
  if (lower.includes('hey spark') || lower.includes('spark')) {
    const idx = lower.indexOf('hey spark') !== -1 ? lower.indexOf('hey spark') + 9 : lower.indexOf('spark') + 5;
    const remaining = lower.substring(idx).replace(/^[,.\s]+/, '').trim();
    return { isWake: true, commandText: remaining };
  }

  return { isWake: false, commandText: '' };
}

export const SparkProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { token, isAuthenticated } = useAuth();
  const [isSparkOpen, setIsSparkOpen] = useState(false);
  const [initialCommand, setInitialCommand] = useState('');
  const [heySparkEnabled, setHeySparkEnabledState] = useState<boolean>(() => {
    return localStorage.getItem('shiori_hey_spark_enabled') === 'true';
  });
  const [isWakeListening, setIsWakeListening] = useState(false);
  const [briefingData, setBriefingData] = useState<BriefingData | null>(null);
  const [hasSeenGreeting, setHasSeenGreeting] = useState<boolean>(() => {
    return sessionStorage.getItem('shiori_spark_session_greeting') === 'seen';
  });

  const wakeRecognitionRef = useRef<any>(null);
  const isListeningLoopRef = useRef(false);

  // Play pleasant double chime on wake detection
  const playWakeChime = useCallback(() => {
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const osc1 = ctx.createOscillator();
      const osc2 = ctx.createOscillator();
      const gain = ctx.createGain();

      osc1.type = 'sine';
      osc2.type = 'sine';
      osc1.frequency.setValueAtTime(587.33, ctx.currentTime); // D5
      osc2.frequency.setValueAtTime(880.00, ctx.currentTime + 0.08); // A5

      gain.gain.setValueAtTime(0.09, ctx.currentTime);
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

  // Robust on-device wake-word detection loop
  useEffect(() => {
    if (!heySparkEnabled || isSparkOpen || !isAuthenticated) {
      if (wakeRecognitionRef.current) {
        try {
          isListeningLoopRef.current = false;
          wakeRecognitionRef.current.abort();
        } catch {}
      }
      setIsWakeListening(false);
      return;
    }

    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setIsWakeListening(false);
      return;
    }

    let recognition: any = null;

    const startWakeRecognition = () => {
      if (!heySparkEnabled || isSparkOpen || !isAuthenticated) return;
      try {
        recognition = new SpeechRecognition();
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.lang = 'en-US';

        recognition.onstart = () => {
          isListeningLoopRef.current = true;
          setIsWakeListening(true);
        };

        recognition.onresult = (event: any) => {
          for (let i = event.resultIndex; i < event.results.length; i++) {
            const transcript = event.results[i][0].transcript || '';
            const { isWake, commandText } = extractWakeCommand(transcript);

            if (isWake) {
              playWakeChime();
              isListeningLoopRef.current = false;
              try {
                recognition.abort();
              } catch {}
              openSpark(commandText);
              break;
            }
          }
        };

        recognition.onerror = (event: any) => {
          if (event.error === 'not-allowed') {
            console.warn('[SPARK WAKE] Microphone permission not allowed.');
            setHeySparkEnabled(false);
            setIsWakeListening(false);
          }
        };

        recognition.onend = () => {
          setIsWakeListening(false);
          // Restart gracefully if still enabled and modal closed
          if (isListeningLoopRef.current && heySparkEnabled && !isSparkOpen) {
            setTimeout(() => {
              if (isListeningLoopRef.current && !isSparkOpen) {
                try {
                  recognition.start();
                } catch {}
              }
            }, 500);
          }
        };

        recognition.start();
        wakeRecognitionRef.current = recognition;
      } catch (err) {
        console.warn('Wake speech recognition error:', err);
      }
    };

    startWakeRecognition();

    return () => {
      isListeningLoopRef.current = false;
      if (recognition) {
        try {
          recognition.abort();
        } catch {}
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
