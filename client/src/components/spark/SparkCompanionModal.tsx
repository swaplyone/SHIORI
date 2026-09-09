import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  X,
  Mic,
  MicOff,
  Send,
  Volume2,
  VolumeX,
  AlertTriangle,
  Radio,
  Sparkles,
  ShieldCheck,
  CheckCircle2,
  CornerDownLeft
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
    setHeySparkEnabled,
    voiceResponsesEnabled,
    setVoiceResponsesEnabled,
    initialCommand,
    clearInitialCommand,
    recognitionLanguage
  } = useSpark();

  const { startFocusTimer, pauseFocusTimer, resumeFocusTimer, stopFocusTimer } = useMorphBar();
  const navigate = useNavigate();

  const [state, setState] = useState<SparkState>('IDLE');
  const [inputText, setInputText] = useState<string>('');
  const [interimTranscript, setInterimTranscript] = useState<string>('');
  const [responseMessage, setResponseMessage] = useState<string>('');
  const [confirmationPayload, setConfirmationPayload] = useState<any>(null);
  const [errorMessage, setErrorMessage] = useState<string>('');

  const recognitionRef = useRef<any>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const isExecutingRef = useRef(false);
  const lastExecutedTextRef = useRef('');
  const silenceTimerRef = useRef<any>(null);

  // Prevent background scrolling while Spark is open
  useEffect(() => {
    if (isSparkOpen) {
      const originalOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = originalOverflow;
      };
    }
  }, [isSparkOpen]);

  // Speech output using Web SpeechSynthesis API
  const speakText = useCallback((text: string) => {
    if (!voiceResponsesEnabled || typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    try {
      window.speechSynthesis.cancel();
      const clean = text.replace(/[*_`#]/g, '').trim();
      if (!clean) return;

      const utterance = new SpeechSynthesisUtterance(clean);
      utterance.lang = recognitionLanguage || 'en-IN';
      utterance.rate = 1.02;
      utterance.pitch = 1.0;
      utterance.onstart = () => setState('SPEAKING');
      utterance.onend = () => setState('IDLE');
      utterance.onerror = () => setState('IDLE');
      window.speechSynthesis.speak(utterance);
    } catch (e) {
      console.warn('Speech synthesis error:', e);
      setState('IDLE');
    }
  }, [voiceResponsesEnabled, recognitionLanguage]);

  // Execute Command via Secure Backend Router
  const handleExecuteCommand = async (commandToRun?: string, isConfirmed = false) => {
    const text = (commandToRun || inputText).trim();
    if (!text || !token) return;

    if (text === lastExecutedTextRef.current && isExecutingRef.current) return;
    lastExecutedTextRef.current = text;

    isExecutingRef.current = true;
    setState('PROCESSING');
    setErrorMessage('');
    setInterimTranscript('');

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

        if (data.speakText && voiceResponsesEnabled) {
          speakText(data.speakText);
        } else {
          setState('IDLE');
        }

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
          return;
        } else {
          setConfirmationPayload(null);
        }

        if (data.refreshNeeded) {
          window.dispatchEvent(new Event('shiori-refresh'));
        }

        if (data.navigate) {
          setTimeout(() => {
            navigate(data.navigate);
            closeSpark();
          }, 1400);
        }
      } else {
        setState('ERROR');
        setResponseMessage(data.displayText || data.error || 'I could not reach SHIORI right now.');
        if (data.speakText && voiceResponsesEnabled) speakText(data.speakText);
      }
    } catch (err) {
      console.error(err);
      isExecutingRef.current = false;
      setState('ERROR');
      setResponseMessage("I couldn't reach SHIORI right now. Try again.");
    }
  };

  const startListening = () => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setErrorMessage("Voice recognition is not available in this browser. You can type commands below.");
      setState('IDLE');
      return;
    }

    try {
      if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
      setInputText('');
      setInterimTranscript('');
      setErrorMessage('');

      if (recognitionRef.current) {
        try { recognitionRef.current.abort(); } catch {}
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
          // Reset silence debounce
          if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
          silenceTimerRef.current = setTimeout(() => {
            if (cleanedInterim.length > 2 && !isExecutingRef.current) {
              setInputText(cleanedInterim);
              handleExecuteCommand(cleanedInterim);
            }
          }, 2400);
        }

        if (cleanedFinal) {
          if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
          setInputText(cleanedFinal);
          setInterimTranscript('');
          handleExecuteCommand(cleanedFinal);
        }
      };

      recognition.onerror = (event: any) => {
        console.warn('[SPARK SPEECH ERROR]', event.error);
        if (event.error === 'not-allowed') {
          setErrorMessage('Microphone access denied. Check your browser permissions.');
          setState('IDLE');
        } else if (event.error === 'no-speech') {
          setState('IDLE');
        } else {
          setState('IDLE');
        }
      };

      recognition.onend = () => {
        setInterimTranscript('');
        setState((prev) => (prev === 'LISTENING' ? 'IDLE' : prev));
      };

      recognition.start();
      recognitionRef.current = recognition;
    } catch (e) {
      console.warn('Recognition start failed:', e);
      setState('IDLE');
    }
  };

  const stopListening = () => {
    if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
    if (recognitionRef.current) {
      try {
        recognitionRef.current.abort();
      } catch {}
    }
    setInterimTranscript('');
    setState('IDLE');
  };

  // On open: start listening smoothly
  useEffect(() => {
    if (isSparkOpen) {
      isExecutingRef.current = false;
      lastExecutedTextRef.current = '';
      setConfirmationPayload(null);
      setErrorMessage('');
      setInterimTranscript('');

      if (initialCommand && initialCommand.trim().length > 1) {
        setInputText(initialCommand);
        setState('PROCESSING');
        setResponseMessage(`Executing: "${initialCommand}"...`);
        clearInitialCommand();
        handleExecuteCommand(initialCommand);
      } else {
        setState('LISTENING');
        setInputText('');
        setResponseMessage("I'm listening. What should we work on in SHIORI?");
        clearInitialCommand();

        const timer = setTimeout(() => {
          startListening();
        }, 250);

        setTimeout(() => inputRef.current?.focus(), 200);
        return () => clearTimeout(timer);
      }
    } else {
      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
      if (recognitionRef.current) {
        try {
          recognitionRef.current.abort();
        } catch {}
      }
      if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
    }
  }, [isSparkOpen, initialCommand]);

  // Handle ESC and keyboard controls
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isSparkOpen) {
        closeSpark();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isSparkOpen, closeSpark]);

  if (!isSparkOpen) return null;

  // Strands dynamic shader mapping according to state (quiet, restrained, premium glass)
  const getStrandsProps = () => {
    switch (state) {
      case 'LISTENING':
        return {
          colors: ['#10B981', '#ffffff', '#06B6D4', '#F97316'],
          count: 3,
          speed: 0.8,
          amplitude: 1.2,
          waviness: 3.2,
          thickness: 0.7,
          glow: 1.3,
          taper: 6,
          spread: 1,
          intensity: 0.85,
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

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-between p-4 sm:p-8 md:p-10 bg-[#0a0a0a]/85 backdrop-blur-[32px] backdrop-saturate-150 overflow-hidden font-sans select-none animate-fade-in text-white">
      {/* Central Full-Screen WebGL Strands Layer */}
      <div className="fixed inset-0 w-full h-full pointer-events-none z-0">
        <Strands {...strandsProps} />
      </div>

      {/* Subtle paper vignette */}
      <div className="fixed inset-0 bg-radial-gradient from-transparent via-black/20 to-black/80 pointer-events-none z-0" />

      {/* Top Floating Minimalist Bar */}
      <div className="relative z-10 w-full max-w-3xl mx-auto flex items-center justify-between px-5 py-2.5 rounded-full bg-white/[0.06] backdrop-blur-2xl border border-white/15 shadow-2xl">
        <div className="flex items-center gap-3">
          <span className="text-sm font-bold tracking-widest text-white flex items-center gap-1.5 font-abask">
            ✦ SPARK
          </span>
          <span className="hidden sm:inline-block text-[10px] text-white/60 uppercase font-mono tracking-widest px-2 py-0.5 rounded-full bg-white/5 border border-white/10">
            SHIORI PROJECT COMPANION
          </span>

          {heySparkEnabled && (
            <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-emerald-500/20 border border-emerald-400/40 text-emerald-300 text-[10px] font-mono font-bold">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
              <span>WAKE ACTIVE</span>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setVoiceResponsesEnabled(!voiceResponsesEnabled)}
            title={voiceResponsesEnabled ? 'Mute Voice Output' : 'Enable Voice Output'}
            className="p-1.5 text-white/70 hover:text-white rounded-full bg-white/5 hover:bg-white/15 transition-colors border border-white/10 cursor-pointer"
          >
            {voiceResponsesEnabled ? <Volume2 className="w-3.5 h-3.5" /> : <VolumeX className="w-3.5 h-3.5 opacity-50" />}
          </button>

          <button
            onClick={closeSpark}
            className="p-1.5 text-white/70 hover:text-white rounded-full bg-white/5 hover:bg-white/15 transition-colors border border-white/10 cursor-pointer"
            title="Close (Esc)"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Central Immersive Stage */}
      <div className="relative z-10 flex flex-col items-center justify-center text-center my-auto max-w-2xl w-full mx-auto px-4 space-y-5">
        {/* Minimalist Status Label */}
        <div className="flex items-center justify-center">
          <span
            className={`px-3.5 py-1 rounded-full text-[11px] font-mono font-bold tracking-widest border uppercase transition-all shadow-md backdrop-blur-xl ${
              state === 'LISTENING'
                ? 'bg-emerald-600/70 text-white border-emerald-400/60 animate-pulse'
                : state === 'PROCESSING'
                ? 'bg-purple-600/70 text-white border-purple-400/60'
                : state === 'SPEAKING'
                ? 'bg-amber-600/70 text-white border-amber-400/60'
                : state === 'CONFIRMATION'
                ? 'bg-red-600/70 text-white border-red-400/60'
                : 'bg-white/10 text-white/80 border-white/15'
            }`}
          >
            {state === 'LISTENING'
              ? '● LISTENING...'
              : state === 'PROCESSING'
              ? '◌ ONE SECOND...'
              : state === 'SPEAKING'
              ? "✦ HERE'S WHAT I FOUND"
              : state === 'CONFIRMATION'
              ? '⚠ CONFIRMATION'
              : '✦ GO AHEAD'}
          </span>
        </div>

        {/* Live Transcription or Response Display */}
        <div className="w-full space-y-4">
          {state === 'LISTENING' && (interimTranscript || inputText) ? (
            <div className="p-6 bg-black/40 backdrop-blur-2xl border border-white/15 rounded-2xl shadow-xl space-y-2 animate-fade-in">
              <span className="text-[10px] font-mono text-emerald-400 uppercase tracking-widest block font-bold">
                HEARING:
              </span>
              <p className="text-xl sm:text-2xl font-mono text-emerald-200 font-medium italic tracking-tight">
                &gt; "{interimTranscript || inputText}"<span className="inline-block w-2 h-5 ml-1 bg-emerald-400 animate-pulse align-middle" />
              </p>
            </div>
          ) : (
            <div className="p-6 sm:p-8 bg-black/40 backdrop-blur-2xl border border-white/15 rounded-3xl shadow-xl transition-all">
              <p className="text-lg sm:text-2xl font-abask text-white font-medium tracking-tight leading-relaxed whitespace-pre-line">
                {responseMessage || "I'm listening. What should we work on in SHIORI?"}
              </p>
            </div>
          )}

          {/* Error Notice */}
          {errorMessage && (
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-red-500/20 border border-red-400/40 text-red-200 text-xs font-mono">
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Confirmation Box */}
          {state === 'CONFIRMATION' && confirmationPayload && (
            <div className="mt-3 p-4 rounded-xl bg-red-950/40 border border-red-500/40 backdrop-blur-xl text-left space-y-2.5 animate-fade-in">
              <div className="flex items-center gap-2 text-red-200 font-bold text-xs">
                <AlertTriangle className="w-3.5 h-3.5 text-red-400" />
                <span>Explicit Action Confirmation</span>
              </div>
              <p className="text-xs text-white/80 leading-relaxed font-sans">
                Action: <strong className="text-white">{confirmationPayload.action}</strong> on{' '}
                <em className="text-white underline">{confirmationPayload.targetName}</em>.
              </p>
              <div className="flex items-center justify-end gap-2 pt-1">
                <button
                  onClick={() => {
                    setState('IDLE');
                    setConfirmationPayload(null);
                    setResponseMessage('Action cancelled.');
                  }}
                  className="px-3.5 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 border border-white/20 text-white text-xs font-bold transition-all cursor-pointer"
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
      </div>

      {/* Bottom Compact Console with Fallback Text Input */}
      <div className="relative z-10 w-full max-w-2xl mx-auto flex flex-col gap-3 pb-2 sm:pb-0">
        {/* Quick Suggestion Chips */}
        <div className="flex flex-wrap items-center justify-center gap-1.5 text-xs font-mono">
          {[
            'What should I work on?',
            "What's running?",
            "What's overdue?",
            'Start a 25 min focus'
          ].map((sugg) => (
            <button
              key={sugg}
              onClick={() => {
                setInputText(sugg);
                handleExecuteCommand(sugg);
              }}
              className="px-3 py-1 rounded-full bg-white/[0.06] hover:bg-white/[0.14] border border-white/10 text-white/80 transition-all hover:scale-105 active:scale-95 text-[11px] cursor-pointer"
            >
              {sugg}
            </button>
          ))}
        </div>

        {/* Compact Text Input / Voice Bar */}
        <div className="p-2.5 bg-white/[0.07] backdrop-blur-2xl border border-white/15 rounded-2xl shadow-xl flex items-center gap-2.5">
          <button
            onClick={state === 'LISTENING' ? stopListening : startListening}
            className={`p-2.5 rounded-xl border transition-all flex items-center justify-center shrink-0 cursor-pointer ${
              state === 'LISTENING'
                ? 'bg-emerald-500 text-white border-emerald-300 shadow-[0_0_20px_rgba(16,185,129,0.8)] scale-105'
                : 'bg-white/10 hover:bg-white/20 border-white/20 text-white'
            }`}
            title={state === 'LISTENING' ? 'Stop Listening' : 'Tap to Speak'}
          >
            {state === 'LISTENING' ? <MicOff className="w-4 h-4 animate-pulse" /> : <Mic className="w-4 h-4" />}
          </button>

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
            placeholder={
              state === 'LISTENING'
                ? 'Listening to voice...'
                : 'Speak to Spark or type command (e.g. "What should I work on?")...'
            }
            className="flex-1 px-3.5 py-2 bg-black/30 border border-white/10 rounded-xl text-white placeholder-white/40 font-mono text-xs sm:text-sm outline-none focus:border-white/30 transition-colors"
          />

          <button
            onClick={() => handleExecuteCommand()}
            disabled={!inputText.trim() || state === 'PROCESSING'}
            className="p-2.5 rounded-xl bg-white text-black font-bold shadow-md disabled:opacity-30 hover:opacity-90 active:scale-95 transition-all cursor-pointer"
            title="Execute Command"
          >
            <CornerDownLeft className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
};
