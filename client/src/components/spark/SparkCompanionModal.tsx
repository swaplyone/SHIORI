import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import {
  X,
  Mic,
  MicOff,
  RotateCcw,
  Volume2,
  VolumeX,
  AlertTriangle,
  CornerDownLeft,
  ShieldCheck,
  Info
} from 'lucide-react';
import Strands from './Strands';
import { useAuth } from '../../context/AuthContext';
import { useMorphBar } from '../../context/MorphBarContext';
import { useSpark } from '../../context/SparkContext';

interface SparkCompanionModalProps {
  context?: {
    projectId?: string;
    taskId?: string;
  };
}

type SparkState = 'IDLE' | 'WAKE_LISTENING' | 'LISTENING' | 'PROCESSING' | 'SPEAKING' | 'CONFIRMATION' | 'ERROR';

export const SparkCompanionModal: React.FC<SparkCompanionModalProps> = ({
  context = {}
}) => {
  const { token } = useAuth();
  const {
    isSparkOpen,
    closeSpark,
    heySparkEnabled,
    voiceResponsesEnabled,
    setVoiceResponsesEnabled,
    initialCommand,
    clearInitialCommand,
    recognitionLanguage,
    unlockIOSAudio,
    isIOS,
    isAudioUnlocked,
    isWakeListening,
    wakeListeningPaused,
    availableVoices,
    speakSpark
  } = useSpark();

  const { startFocusTimer, pauseFocusTimer, resumeFocusTimer, stopFocusTimer } = useMorphBar();
  const navigate = useNavigate();

  const [state, setState] = useState<SparkState>('LISTENING');
  const [inputText, setInputText] = useState<string>('');
  const [interimTranscript, setInterimTranscript] = useState<string>('');
  const [responseMessage, setResponseMessage] = useState<string>('');
  const [confirmationPayload, setConfirmationPayload] = useState<any>(null);
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [isTypingMode, setIsTypingMode] = useState<boolean>(false);

  const stateRef = useRef<SparkState>('LISTENING');
  stateRef.current = state;

  const isConversationActiveRef = useRef<boolean>(false);
  const recognitionRef = useRef<any>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const isExecutingRef = useRef(false);
  const lastExecutedTextRef = useRef('');
  const silenceTimerRef = useRef<any>(null);
  const autoRestartTimerRef = useRef<any>(null);

  // Check for debug query
  const isDebugMode = typeof window !== 'undefined' && (
    window.location.search.includes('debug=spark') || 
    localStorage.getItem('shiori_spark_debug') === 'true'
  );

  // Prevent background scrolling while Spark is open without layout shifts
  useEffect(() => {
    if (isSparkOpen) {
      const originalOverflow = document.body.style.overflow;
      const originalPaddingRight = document.body.style.paddingRight;
      const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
      
      if (scrollbarWidth > 0) {
        document.body.style.paddingRight = `${scrollbarWidth}px`;
      }
      document.body.style.overflow = 'hidden';
      
      return () => {
        document.body.style.overflow = originalOverflow;
        document.body.style.paddingRight = originalPaddingRight;
      };
    }
  }, [isSparkOpen]);

  // Robust Speech Output using speakSpark with seamless iOS handoff
  const speakText = useCallback((text: string, onDone?: () => void) => {
    speakSpark(
      text,
      () => {
        setState('SPEAKING');
      },
      () => {
        if (onDone) {
          onDone();
        } else if (isConversationActiveRef.current) {
          // Continuous conversation loop: Return to LISTENING with 450ms safety delay for iOS hardware
          setState('LISTENING');
          setInputText('');
          setInterimTranscript('');
          setTimeout(() => {
            if (isConversationActiveRef.current && stateRef.current === 'LISTENING') {
              startListening();
            }
          }, 450);
        } else {
          setState('IDLE');
        }
      },
      () => {
        if (onDone) {
          onDone();
        } else if (isConversationActiveRef.current) {
          setState('LISTENING');
          setTimeout(() => {
            if (isConversationActiveRef.current && stateRef.current === 'LISTENING') {
              startListening();
            }
          }, 450);
        } else {
          setState('IDLE');
        }
      }
    );
  }, [speakSpark]);

  // Start Speech Recognition (Single Active Instance with iOS Lifecycle)
  const startListening = useCallback(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setErrorMessage("Voice recognition is not available in this browser. You can type commands below.");
      setState('IDLE');
      return;
    }

    try {
      unlockIOSAudio();

      // Pause ongoing speech synthesis to prevent feedback loop
      if ('speechSynthesis' in window && window.speechSynthesis.speaking) {
        window.speechSynthesis.cancel();
      }

      setInputText('');
      setInterimTranscript('');
      setErrorMessage('');

      if (recognitionRef.current) {
        try { recognitionRef.current.abort(); } catch {}
        recognitionRef.current = null;
      }

      const recognition = new SpeechRecognition();
      recognition.continuous = false;
      recognition.interimResults = true;
      recognition.lang = recognitionLanguage || 'en-IN';
      recognition.maxAlternatives = 2;

      recognition.onstart = () => {
        setState('LISTENING');
      };

      recognition.onresult = (event: any) => {
        let interim = '';
        let final = '';

        for (let i = event.resultIndex; i < event.results.length; i++) {
          const trans = event.results[i][0].transcript;
          if (event.results[i].isFinal) {
            final += trans;
          } else {
            interim += trans;
          }
        }

        const cleanedInterim = interim.replace(/^(?:hey|hi|hello|ok|okay)?\s*spark[,.]?\s*/i, '').trim();
        const cleanedFinal = final.replace(/^(?:hey|hi|hello|ok|okay)?\s*spark[,.]?\s*/i, '').trim();

        if (cleanedInterim) {
          setInterimTranscript(cleanedInterim);

          // 2.0s silence debounce execution for hands-free natural speaking
          if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
          silenceTimerRef.current = setTimeout(() => {
            if (cleanedInterim.length > 2 && !isExecutingRef.current) {
              setInputText(cleanedInterim);
              handleExecuteCommand(cleanedInterim);
            }
          }, 2000);
        }

        if (cleanedFinal) {
          if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
          setInputText(cleanedFinal);
          setInterimTranscript('');
          handleExecuteCommand(cleanedFinal);
        }
      };

      recognition.onerror = (event: any) => {
        if (event.error === 'not-allowed') {
          setErrorMessage(
            isIOS
              ? 'Spark needs microphone access. Check iPhone Settings → Safari → Microphone → Allow.'
              : 'Microphone access denied. Check your browser permissions.'
          );
          setState('IDLE');
        } else if (event.error === 'no-speech') {
          // Restart gracefully on iOS silent timeout
          if (isConversationActiveRef.current && stateRef.current === 'LISTENING' && !isExecutingRef.current) {
            if (autoRestartTimerRef.current) clearTimeout(autoRestartTimerRef.current);
            autoRestartTimerRef.current = setTimeout(() => {
              if (isConversationActiveRef.current && stateRef.current === 'LISTENING' && !isExecutingRef.current) {
                startListening();
              }
            }, 300);
          }
        }
      };

      recognition.onend = () => {
        setInterimTranscript('');
        // Keep listening while conversation session is active
        if (isConversationActiveRef.current && stateRef.current === 'LISTENING' && !isExecutingRef.current) {
          if (autoRestartTimerRef.current) clearTimeout(autoRestartTimerRef.current);
          autoRestartTimerRef.current = setTimeout(() => {
            if (isConversationActiveRef.current && stateRef.current === 'LISTENING' && !isExecutingRef.current) {
              startListening();
            }
          }, 300);
        }
      };

      recognition.start();
      recognitionRef.current = recognition;
    } catch (e) {
      console.warn('Recognition start failed:', e);
    }
  }, [recognitionLanguage, unlockIOSAudio, isIOS]);

  const stopListening = useCallback(() => {
    if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
    if (autoRestartTimerRef.current) clearTimeout(autoRestartTimerRef.current);
    if (recognitionRef.current) {
      try {
        recognitionRef.current.abort();
      } catch {}
      recognitionRef.current = null;
    }
    setInterimTranscript('');
    setState('IDLE');
  }, []);

  // Check for natural exit phrases
  const isExitPhrase = (cmd: string) => {
    const l = cmd.toLowerCase().trim();
    return (
      l === 'stop' || l === 'stop listening' || l === 'close' || l === 'close spark' ||
      l === 'exit' || l === 'exit spark' || l === "that's all" || l === "that is all" ||
      l === "that's all spark" || l === 'goodbye' || l === 'goodbye spark' ||
      l === 'bye' || l === 'bye spark' || l === "i'm done" || l === 'im done'
    );
  };

  // Execute Command via Secure Backend Router
  const handleExecuteCommand = async (commandToRun?: string, isConfirmed = false) => {
    const text = (commandToRun || inputText).trim();
    if (!text || !token) return;

    if (text === lastExecutedTextRef.current && isExecutingRef.current) return;
    lastExecutedTextRef.current = text;

    // 1. Check for natural exit commands
    if (isExitPhrase(text)) {
      isConversationActiveRef.current = false;
      stopListening();
      setState('SPEAKING');
      setResponseMessage('Alright. Back to the workbench. ✦');
      speakText('Alright. Back to the workbench.', () => {
        setTimeout(() => closeSpark(), 300);
      });
      return;
    }

    // Stop speech recognition immediately while processing/speaking to prevent echo
    if (recognitionRef.current) {
      try { recognitionRef.current.abort(); } catch {}
      recognitionRef.current = null;
    }

    isExecutingRef.current = true;
    setState('PROCESSING');
    setErrorMessage('');
    setInterimTranscript('');
    setIsTypingMode(false);

    try {
      const res = await fetch('/api/spark/command', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          command: text,
          context,
          confirmed: isConfirmed,
          confirmationPayload
        })
      });

      const data = await res.json();
      isExecutingRef.current = false;

      if (res.ok && data.success) {
        setResponseMessage(data.displayText || 'Done.');

        if (data.focusAction) {
          if (data.focusAction === 'start') {
            startFocusTimer(data.focusMinutes || 25, 'Spark Focus Session');
          } else if (data.focusAction === 'pause') {
            pauseFocusTimer();
          } else if (data.focusAction === 'resume') {
            resumeFocusTimer();
          } else if (data.focusAction === 'stop') {
            stopFocusTimer();
          }
        }

        if (data.needsConfirmation) {
          setState('CONFIRMATION');
          setConfirmationPayload(data.confirmationPayload);
          if (data.speakText && voiceResponsesEnabled) {
            speakText(data.speakText);
          }
          return;
        } else {
          setConfirmationPayload(null);
        }

        if (data.refreshNeeded) {
          window.dispatchEvent(new Event('shiori-refresh'));
        }

        if (data.navigate) {
          if (data.speakText && voiceResponsesEnabled) {
            speakText(data.speakText, () => {
              navigate(data.navigate);
              setState('LISTENING');
              setTimeout(() => startListening(), 450);
            });
          } else {
            navigate(data.navigate);
            setState('LISTENING');
            setTimeout(() => startListening(), 450);
          }
          return;
        }

        // Voice handoff: Speak text, then automatically return to LISTENING
        if (data.speakText && voiceResponsesEnabled) {
          speakText(data.speakText);
        } else {
          setTimeout(() => {
            if (isConversationActiveRef.current) {
              setState('LISTENING');
              setInputText('');
              setInterimTranscript('');
              startListening();
            } else {
              setState('IDLE');
            }
          }, 1200);
        }
      } else {
        setState('ERROR');
        setResponseMessage(data.displayText || data.error || 'I could not reach SHIORI right now.');
        if (data.speakText && voiceResponsesEnabled) {
          speakText(data.speakText);
        } else {
          setTimeout(() => {
            if (isConversationActiveRef.current) {
              setState('LISTENING');
              startListening();
            }
          }, 1500);
        }
      }
    } catch (err) {
      console.error(err);
      isExecutingRef.current = false;
      setState('ERROR');
      setResponseMessage("I couldn't reach SHIORI right now. Try again.");
      setTimeout(() => {
        if (isConversationActiveRef.current) {
          setState('LISTENING');
          startListening();
        }
      }, 1500);
    }
  };

  const handleRetry = () => {
    unlockIOSAudio();
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    setInputText('');
    setInterimTranscript('');
    setResponseMessage('');
    setErrorMessage('');
    startListening();
  };

  // Barge-in interruption handler: tapping mic or typing cancels current speech and listens
  const handleMicToggle = () => {
    unlockIOSAudio();
    if (state === 'SPEAKING' || state === 'PROCESSING') {
      if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
      isExecutingRef.current = false;
      setState('LISTENING');
      startListening();
    } else if (state === 'LISTENING') {
      stopListening();
    } else {
      startListening();
    }
  };

  // On open: initialize conversation session and start listening smoothly
  useEffect(() => {
    if (isSparkOpen) {
      unlockIOSAudio();
      isConversationActiveRef.current = true;
      isExecutingRef.current = false;
      lastExecutedTextRef.current = '';
      setConfirmationPayload(null);
      setErrorMessage('');
      setInterimTranscript('');
      setIsTypingMode(false);

      if (initialCommand && initialCommand.trim().length > 1) {
        setInputText(initialCommand);
        setState('PROCESSING');
        setResponseMessage(`Executing: "${initialCommand}"...`);
        clearInitialCommand();
        handleExecuteCommand(initialCommand);
      } else {
        setState('LISTENING');
        setInputText('');
        setResponseMessage('');
        clearInitialCommand();

        const timer = setTimeout(() => {
          startListening();
        }, 200);

        return () => clearTimeout(timer);
      }
    } else {
      isConversationActiveRef.current = false;
      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
      if (autoRestartTimerRef.current) clearTimeout(autoRestartTimerRef.current);
      if (recognitionRef.current) {
        try {
          recognitionRef.current.abort();
        } catch {}
        recognitionRef.current = null;
      }
      if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
    }
  }, [isSparkOpen, initialCommand, startListening, unlockIOSAudio]);

  // Handle ESC and keyboard controls
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isSparkOpen) {
        isConversationActiveRef.current = false;
        closeSpark();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isSparkOpen, closeSpark]);

  if (!isSparkOpen) return null;

  // Strands dynamic shader mapping according to state (Japanese-inspired glass sphere)
  const getStrandsProps = () => {
    switch (state) {
      case 'LISTENING':
        return {
          colors: ['#F97316', '#ffffff', '#10B981'],
          count: 3,
          speed: 0.75,
          amplitude: 1.25,
          waviness: 3.2,
          thickness: 0.7,
          glow: 1.2,
          taper: 6,
          spread: 1,
          intensity: 0.75,
          saturation: 2,
          opacity: 1,
          scale: 1.5,
          glass: true,
          refraction: 1,
          dispersion: 1,
          glassSize: 1,
          hueShift: 0
        };
      case 'PROCESSING':
        return {
          colors: ['#7C3AED', '#06B6D4', '#ffffff', '#FF4242'],
          count: 4,
          speed: 1.1,
          amplitude: 0.95,
          waviness: 3.5,
          thickness: 0.7,
          glow: 1.2,
          taper: 6,
          spread: 1,
          intensity: 0.8,
          saturation: 2,
          opacity: 1,
          scale: 1.5,
          glass: true,
          refraction: 1,
          dispersion: 1,
          glassSize: 1,
          hueShift: 0
        };
      case 'SPEAKING':
        return {
          colors: ['#F97316', '#ffffff', '#10B981'],
          count: 3,
          speed: 0.65,
          amplitude: 1.05,
          waviness: 3.0,
          thickness: 0.7,
          glow: 1.15,
          taper: 6,
          spread: 1,
          intensity: 0.75,
          saturation: 2,
          opacity: 1,
          scale: 1.5,
          glass: true,
          refraction: 1,
          dispersion: 1,
          glassSize: 1,
          hueShift: 0
        };
      case 'CONFIRMATION':
      case 'ERROR':
        return {
          colors: ['#FF4242', '#EAB308', '#ffffff'],
          count: 3,
          speed: 0.45,
          amplitude: 0.75,
          waviness: 2.5,
          thickness: 0.7,
          glow: 1.0,
          taper: 6,
          spread: 1,
          intensity: 0.65,
          saturation: 2,
          opacity: 1,
          scale: 1.5,
          glass: true,
          refraction: 1,
          dispersion: 1,
          glassSize: 1,
          hueShift: 0
        };
      case 'WAKE_LISTENING':
      case 'IDLE':
      default:
        return {
          colors: ['#F97316', '#ffffff', '#10B981'],
          count: 3,
          speed: 0.5,
          amplitude: 1,
          waviness: 3,
          thickness: 0.7,
          glow: 1.1,
          taper: 6,
          spread: 1,
          intensity: 0.6,
          saturation: 2,
          opacity: 1,
          scale: 1.5,
          glass: true,
          refraction: 1,
          dispersion: 1,
          glassSize: 1,
          hueShift: 0
        };
    }
  };

  const strandsProps = getStrandsProps();

  const getStatusLabel = () => {
    switch (state) {
      case 'LISTENING':
        return 'LISTENING';
      case 'PROCESSING':
        return 'PROCESSING';
      case 'SPEAKING':
        return 'SPEAKING';
      case 'CONFIRMATION':
        return 'CONFIRMATION';
      case 'ERROR':
        return 'NOTICE';
      case 'IDLE':
      default:
        return 'READY';
    }
  };

  const getSubStatusText = () => {
    if (state === 'LISTENING') {
      return responseMessage ? responseMessage : 'Go ahead.';
    }
    if (state === 'PROCESSING') return 'One second...';
    if (responseMessage) return responseMessage;
    if (state === 'IDLE') return 'Ready when you are.';
    return 'Go ahead.';
  };

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Spark Fullscreen Voice Assistant"
      className="fixed inset-0 z-[99999] flex flex-col justify-between w-screen h-[100dvh] bg-black/40 backdrop-blur-2xl backdrop-saturate-[150%] select-none font-sans text-white overflow-hidden pt-[max(1.25rem,env(safe-area-inset-top))] pb-[max(1.25rem,env(safe-area-inset-bottom))] px-6 sm:px-12 transition-opacity duration-300"
    >
      {/* Subtle radial vignette that keeps the underlying home page visible */}
      <div className="fixed inset-0 bg-[radial-gradient(ellipse_at_center,rgba(0,0,0,0.1)_0%,rgba(0,0,0,0.65)_100%)] pointer-events-none z-0" />

      {/* ========================================================================= */}
      {/* 1. TOP HEADER */}
      {/* ========================================================================= */}
      <header className="relative z-10 w-full flex items-center justify-between shrink-0">
        {/* Top Left: SHIORI Brand */}
        <div className="flex items-center gap-2">
          <span className="text-sm font-serif tracking-[0.28em] text-white/85 font-medium flex items-center gap-1.5 uppercase">
            <span className="text-amber-300 text-xs">✦</span> SHIORI
          </span>
        </div>

        {/* Top Center: Spark Title & Identity */}
        <div className="flex flex-col items-center justify-center text-center">
          <span className="text-amber-200/90 text-sm leading-none mb-1 animate-pulse">✦</span>
          <h1 className="text-base sm:text-lg font-bold tracking-[0.45em] text-white uppercase font-abask leading-none">
            S P A R K
          </h1>
          <p className="text-[9px] sm:text-[10px] tracking-[0.28em] text-white/50 uppercase font-mono mt-1">
            SHIORI PROJECT COMPANION
          </p>
        </div>

        {/* Top Right: Status Pill & Close (X) Button */}
        <div className="flex items-center gap-2 sm:gap-3">
          <div className="hidden sm:flex items-center gap-1.5 px-3.5 py-1 rounded-full bg-white/[0.08] border border-white/15 text-white/90 text-[11px] font-mono tracking-wider shadow-sm">
            <span className="text-amber-300 text-xs">✦</span>
            <span>SPARK</span>
          </div>

          <button
            onClick={() => {
              unlockIOSAudio();
              setVoiceResponsesEnabled(!voiceResponsesEnabled);
            }}
            title={voiceResponsesEnabled ? 'Mute Voice Output' : 'Enable Voice Output'}
            className="p-2 text-white/70 hover:text-white rounded-full bg-white/5 hover:bg-white/15 transition-colors border border-white/10 cursor-pointer"
          >
            {voiceResponsesEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4 opacity-50" />}
          </button>

          <button
            onClick={() => {
              isConversationActiveRef.current = false;
              closeSpark();
            }}
            className="p-2 text-white/70 hover:text-white rounded-full bg-white/5 hover:bg-white/15 transition-colors border border-white/10 cursor-pointer"
            title="Close (Esc)"
            aria-label="Close Spark"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* ========================================================================= */}
      {/* 2. CENTER STAGE: SPHERICAL STRANDS LENS & STATUS */}
      {/* ========================================================================= */}
      <main className="relative z-10 flex-1 flex flex-col items-center justify-center my-auto w-full max-w-2xl mx-auto text-center space-y-5 sm:space-y-6">
        {/* Spherical Lens containing the WebGL Strands Animation */}
        <div className="relative flex items-center justify-center">
          <div className="w-[68vw] h-[68vw] max-w-[340px] max-h-[340px] sm:w-[380px] sm:h-[380px] md:w-[420px] md:h-[420px] rounded-full overflow-hidden relative shadow-[0_0_80px_rgba(0,0,0,0.8),inset_0_0_25px_rgba(255,255,255,0.08)] border border-white/15 backdrop-blur-md">
            <Strands {...strandsProps} className="w-full h-full" />
            {/* Glass refraction reflection overlay */}
            <div className="absolute inset-0 rounded-full bg-gradient-to-b from-white/10 via-transparent to-black/35 pointer-events-none" />
          </div>
        </div>

        {/* State Indicator Pill */}
        <div className="flex flex-col items-center justify-center space-y-2">
          <div className="flex items-center gap-2 px-4 py-1.5 rounded-full bg-black/40 border border-white/15 backdrop-blur-xl shadow-lg">
            {state === 'LISTENING' ? (
              <span className="flex items-center gap-0.5 text-emerald-400">
                <span className="w-0.5 h-3 bg-emerald-400 animate-pulse" />
                <span className="w-0.5 h-4 bg-emerald-400 animate-pulse delay-75" />
                <span className="w-0.5 h-2 bg-emerald-400 animate-pulse delay-150" />
              </span>
            ) : state === 'PROCESSING' ? (
              <span className="w-2 h-2 rounded-full bg-purple-400 animate-ping" />
            ) : state === 'SPEAKING' ? (
              <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
            ) : (
              <span className="w-2 h-2 rounded-full bg-white/40" />
            )}

            <span className="text-xs font-mono font-bold tracking-widest text-white/90">
              {getStatusLabel()}
            </span>
          </div>

          {/* Subtitle / Caption */}
          <p className="text-sm sm:text-base font-sans text-white/75 italic max-w-lg px-4 transition-all leading-relaxed whitespace-pre-line">
            {getSubStatusText()}
          </p>
        </div>

        {/* ========================================================================= */}
        {/* 3. LIVE TRANSCRIPTION OR EDITABLE COMMAND PILL */}
        {/* ========================================================================= */}
        <div className="w-full max-w-xl px-2">
          <div
            onClick={() => {
              unlockIOSAudio();
              setIsTypingMode(true);
              setTimeout(() => inputRef.current?.focus(), 50);
            }}
            className="w-full px-5 py-3 rounded-full bg-black/35 backdrop-blur-2xl border border-white/15 shadow-2xl flex items-center gap-3 transition-all focus-within:border-white/35 focus-within:bg-black/50 cursor-text"
          >
            <Mic className="w-4 h-4 text-white/50 shrink-0" />

            {isTypingMode ? (
              <input
                ref={inputRef}
                type="text"
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    handleExecuteCommand();
                  }
                }}
                onBlur={() => {
                  if (!inputText) setIsTypingMode(false);
                }}
                placeholder='Type a command (e.g. "Start a 25 min focus", "What should I work on?")...'
                className="flex-1 bg-transparent text-white placeholder-white/40 font-mono text-xs sm:text-sm outline-none"
              />
            ) : (
              <div className="flex-1 text-left overflow-hidden">
                {interimTranscript || inputText ? (
                  <p className="text-xs sm:text-sm font-mono text-white/90 truncate">
                    "{interimTranscript || inputText}"
                    {state === 'LISTENING' && (
                      <span className="inline-block w-1.5 h-3.5 ml-1 bg-emerald-400 animate-pulse align-middle" />
                    )}
                  </p>
                ) : (
                  <p className="text-xs sm:text-sm font-mono text-white/40 truncate">
                    {state === 'LISTENING' ? 'Speak a command or tap to type...' : 'Tap to type command...'}
                  </p>
                )}
              </div>
            )}

            {inputText.trim() && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleExecuteCommand();
                }}
                className="p-1.5 rounded-full bg-white text-black hover:bg-white/90 transition-all cursor-pointer"
                title="Send Command"
              >
                <CornerDownLeft className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Error Message & iOS Permission Guidance */}
          {errorMessage && (
            <div className="mt-2.5 p-3 rounded-xl bg-red-500/15 border border-red-400/30 text-red-200 text-xs font-mono space-y-1 text-left animate-fade-in">
              <div className="flex items-center gap-2 font-bold">
                <ShieldCheck className="w-3.5 h-3.5 text-red-400 shrink-0" />
                <span>Microphone Notice</span>
              </div>
              <p className="text-[11px] text-white/80 font-sans">{errorMessage}</p>
            </div>
          )}

          {/* iOS Wake Listening Fallback Banner if Paused */}
          {isIOS && wakeListeningPaused && !errorMessage && (
            <div className="mt-2.5 inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-500/15 border border-amber-400/30 text-amber-200 text-[11px] font-mono">
              <Info className="w-3 h-3 text-amber-300 shrink-0" />
              <span>iPhone paused wake listening. Tap microphone to speak.</span>
            </div>
          )}

          {/* Optional Development Diagnostic Section (?debug=spark) */}
          {isDebugMode && (
            <div className="mt-3 p-2.5 rounded-xl bg-black/60 border border-white/10 text-[10px] font-mono text-white/70 text-left space-y-1">
              <div className="text-amber-300 font-bold uppercase tracking-wider">iOS Diagnostics</div>
              <div className="grid grid-cols-2 gap-1 text-[9px]">
                <div>iOS: <span className="text-white">{isIOS ? 'YES' : 'NO'}</span></div>
                <div>Audio Unlocked: <span className="text-white">{isAudioUnlocked ? 'YES' : 'NO'}</span></div>
                <div>Wake Status: <span className="text-white">{isWakeListening ? 'ACTIVE' : wakeListeningPaused ? 'PAUSED' : 'IDLE'}</span></div>
                <div>Voices Count: <span className="text-white">{availableVoices.length}</span></div>
                <div>Current State: <span className="text-emerald-400">{state}</span></div>
                <div>Language: <span className="text-white">{recognitionLanguage}</span></div>
              </div>
            </div>
          )}

          {/* Confirmation Box */}
          {state === 'CONFIRMATION' && confirmationPayload && (
            <div className="mt-4 p-4 rounded-2xl bg-red-950/40 border border-red-500/40 backdrop-blur-xl text-left space-y-2.5 animate-fade-in shadow-2xl">
              <div className="flex items-center gap-2 text-red-200 font-bold text-xs font-mono uppercase">
                <AlertTriangle className="w-4 h-4 text-red-400" />
                <span>Confirmation Required</span>
              </div>
              <p className="text-xs text-white/80 leading-relaxed font-sans">
                Action: <strong className="text-white">{confirmationPayload.action}</strong> on{' '}
                <em className="text-white underline">{confirmationPayload.targetName}</em>.
              </p>
              <div className="flex items-center justify-end gap-2 pt-1">
                <button
                  onClick={() => {
                    setState('LISTENING');
                    setConfirmationPayload(null);
                    setResponseMessage('Action cancelled. Go ahead.');
                    setTimeout(() => startListening(), 200);
                  }}
                  className="px-4 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 border border-white/20 text-white text-xs font-bold transition-all cursor-pointer"
                >
                  CANCEL
                </button>
                <button
                  onClick={() => handleExecuteCommand(undefined, true)}
                  className="px-4 py-1.5 rounded-lg bg-red-600 hover:bg-red-500 text-white font-bold text-xs shadow-md transition-all cursor-pointer"
                >
                  CONFIRM ACTION
                </button>
              </div>
            </div>
          )}
        </div>

        {/* ========================================================================= */}
        {/* 4. BOTTOM ACTION CONTROLS: CANCEL, GLOWING MIC, RETRY */}
        {/* ========================================================================= */}
        <div className="flex items-center justify-center gap-8 sm:gap-12 pt-1">
          {/* Cancel Button */}
          <div className="flex flex-col items-center gap-1.5">
            <button
              onClick={() => {
                isConversationActiveRef.current = false;
                closeSpark();
              }}
              className="w-11 h-11 sm:w-12 sm:h-12 rounded-full bg-white/[0.08] hover:bg-white/[0.15] border border-white/15 flex items-center justify-center text-white/70 hover:text-white transition-all active:scale-95 shadow-md cursor-pointer"
              title="Cancel (Esc)"
              aria-label="Cancel"
            >
              <X className="w-4 h-4" />
            </button>
            <span className="text-[10px] font-mono tracking-wider text-white/50 uppercase">
              Cancel
            </span>
          </div>

          {/* Central Microphone Button with Rainbow/Gold Glowing Border */}
          <div className="flex flex-col items-center gap-1.5">
            <button
              onClick={handleMicToggle}
              className={`w-16 h-16 sm:w-18 sm:h-18 rounded-full p-[2.5px] transition-all duration-300 active:scale-90 cursor-pointer ${
                state === 'LISTENING'
                  ? 'bg-gradient-to-tr from-[#FF5E5E] via-[#F59E0B] to-[#10B981] shadow-[0_0_30px_rgba(245,158,11,0.35)] scale-105'
                  : 'bg-white/20 hover:bg-white/30 border border-white/20'
              }`}
              title={state === 'LISTENING' ? 'Stop Listening' : 'Start Speaking'}
              aria-label="Toggle Microphone"
            >
              <div className="w-full h-full rounded-full bg-[#131418] flex items-center justify-center text-white">
                {state === 'LISTENING' ? (
                  <MicOff className="w-6 h-6 text-emerald-400 animate-pulse" />
                ) : (
                  <Mic className="w-6 h-6 text-white" />
                )}
              </div>
            </button>
            <span className="text-[10px] font-mono tracking-wider text-white/60">
              {state === 'LISTENING' ? 'Listening...' : state === 'SPEAKING' ? 'Tap to speak' : 'Tap to speak'}
            </span>
          </div>

          {/* Retry Button */}
          <div className="flex flex-col items-center gap-1.5">
            <button
              onClick={handleRetry}
              className="w-11 h-11 sm:w-12 sm:h-12 rounded-full bg-white/[0.08] hover:bg-white/[0.15] border border-white/15 flex items-center justify-center text-white/70 hover:text-white transition-all active:scale-95 shadow-md cursor-pointer"
              title="Retry Voice Input"
              aria-label="Retry"
            >
              <RotateCcw className="w-4 h-4" />
            </button>
            <span className="text-[10px] font-mono tracking-wider text-white/50 uppercase">
              Retry
            </span>
          </div>
        </div>
      </main>

      {/* ========================================================================= */}
      {/* 5. BOTTOM FOOTER BAR */}
      {/* ========================================================================= */}
      <footer className="relative z-10 w-full flex items-center justify-between text-[10px] font-mono text-white/40 tracking-wider shrink-0">
        <div className="flex items-center gap-2">
          <span>—— SHIORI / SPARK</span>
        </div>

        <div className="flex items-center gap-1.5">
          <span>Press</span>
          <kbd className="px-1.5 py-0.5 rounded bg-white/10 text-white/70 font-bold border border-white/10 text-[9px]">
            Esc
          </kbd>
          <span>to close</span>
        </div>
      </footer>
    </div>,
    document.body
  );
};
