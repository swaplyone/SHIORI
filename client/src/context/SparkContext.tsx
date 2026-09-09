import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
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
  openSpark: () => void;
  closeSpark: () => void;
  toggleSpark: () => void;
  heySparkEnabled: boolean;
  setHeySparkEnabled: (enabled: boolean) => void;
  isWakeListening: boolean;
  briefingData: BriefingData | null;
  refreshBriefing: () => Promise<void>;
  hasSeenGreeting: boolean;
  dismissGreeting: () => void;
}

const SparkContext = createContext<SparkContextType | undefined>(undefined);

export const SparkProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { token, isAuthenticated } = useAuth();
  const [isSparkOpen, setIsSparkOpen] = useState(false);
  const [heySparkEnabled, setHeySparkEnabledState] = useState<boolean>(() => {
    return localStorage.getItem('shiori_hey_spark_enabled') === 'true';
  });
  const [isWakeListening, setIsWakeListening] = useState(false);
  const [briefingData, setBriefingData] = useState<BriefingData | null>(null);
  const [hasSeenGreeting, setHasSeenGreeting] = useState<boolean>(() => {
    return sessionStorage.getItem('shiori_spark_session_greeting') === 'seen';
  });

  const wakeRecognitionRef = useRef<any>(null);
  const isListeningRef = useRef(false);

  // Play gentle subtle double chime when wake word detected
  const playWakeChime = () => {
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

      gain.gain.setValueAtTime(0.08, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);

      osc1.connect(gain);
      osc2.connect(gain);
      gain.connect(ctx.destination);

      osc1.start(ctx.currentTime);
      osc1.stop(ctx.currentTime + 0.08);
      osc2.start(ctx.currentTime + 0.08);
      osc2.stop(ctx.currentTime + 0.35);
    } catch {}
  };

  const setHeySparkEnabled = (enabled: boolean) => {
    setHeySparkEnabledState(enabled);
    localStorage.setItem('shiori_hey_spark_enabled', enabled ? 'true' : 'false');
  };

  const openSpark = () => setIsSparkOpen(true);
  const closeSpark = () => setIsSparkOpen(false);
  const toggleSpark = () => setIsSparkOpen((prev) => !prev);

  const dismissGreeting = () => {
    setHasSeenGreeting(true);
    sessionStorage.setItem('shiori_spark_session_greeting', 'seen');
  };

  // Fetch proactive daily briefing on session load
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

  // Wake-word listening loop ("Hey Spark" / "Spark")
  useEffect(() => {
    if (!heySparkEnabled || isSparkOpen || !isAuthenticated) {
      if (wakeRecognitionRef.current) {
        try {
          isListeningRef.current = false;
          wakeRecognitionRef.current.abort();
        } catch {}
      }
      setIsWakeListening(false);
      return;
    }

    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) return;

    let recognition: any = null;

    try {
      recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = 'en-US';

      recognition.onstart = () => {
        isListeningRef.current = true;
        setIsWakeListening(true);
      };

      recognition.onresult = (event: any) => {
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const text = (event.results[i][0].transcript || '').toLowerCase().trim();
          if (text.includes('hey spark') || text.includes('spark')) {
            playWakeChime();
            setIsSparkOpen(true);
            try {
              recognition.abort();
            } catch {}
            break;
          }
        }
      };

      recognition.onerror = (event: any) => {
        if (event.error === 'not-allowed') {
          console.warn('[SPARK WAKE] Mic permission denied.');
          setHeySparkEnabled(false);
        }
        setIsWakeListening(false);
      };

      recognition.onend = () => {
        setIsWakeListening(false);
        // Automatically restart if wake listening is still enabled and modal is closed
        if (isListeningRef.current && heySparkEnabled && !isSparkOpen) {
          setTimeout(() => {
            try {
              if (isListeningRef.current) recognition.start();
            } catch {}
          }, 800);
        }
      };

      recognition.start();
      wakeRecognitionRef.current = recognition;
    } catch (e) {
      console.warn('Wake recognition start failed:', e);
    }

    return () => {
      isListeningRef.current = false;
      if (recognition) {
        try {
          recognition.abort();
        } catch {}
      }
    };
  }, [heySparkEnabled, isSparkOpen, isAuthenticated]);

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
        briefingData,
        refreshBriefing,
        hasSeenGreeting,
        dismissGreeting
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
