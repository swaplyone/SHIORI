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
  CheckCircle2
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
    recognitionLanguage,
    requestMicrophoneAccess
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

  // Speech output using Web SpeechSynthesis API
  const speakText = useCallback((text: string) => {
    if (!voiceResponsesEnabled || typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    try {
      window.speechSynthesis.cancel();
      const clean = text.replace(/[*_`#]/g, '').trim();
      if (!clean) return;

      const utterance = new SpeechSynthesisUtterance(clean);
      utterance.lang = recognitionLanguage || 'en-IN';
      utterance.rate = 1.05;
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

    // Clean duplicate executions
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
          }, 1500);
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
      setErrorMessage("Voice recognition is not supported in this browser. You can type commands below.");
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

        // Clean wake word prefixes from the transcribed text
        const cleanedInterim = interim.replace(/^(?:hey|hi|hello|ok|okay)?\s*spark[,.]?\s*/i, '').trim();
        const cleanedFinal = final.replace(/^(?:hey|hi|hello|ok|okay)?\s*spark[,.]?\s*/i, '').trim();

        if (cleanedInterim) {
          setInterimTranscript(cleanedInterim);
        }

        if (cleanedFinal) {
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
    if (recognitionRef.current) {
      try {
        recognitionRef.current.abort();
      } catch {}
    }
    setInterimTranscript('');
    setState('IDLE');
  };

  // When modal opens: Check if an initial command was captured, or start listening
  useEffect(() => {
    if (isSparkOpen) {
      isExecutingRef.current = false;
      lastExecutedTextRef.current = '';
      setConfirmationPayload(null);
      setErrorMessage('');
      setInterimTranscript('');

      if (initialCommand && initialCommand.trim().length > 1) {
        // User spoke wake word + command in one fluid sentence
        setInputText(initialCommand);
        setState('PROCESSING');
        setResponseMessage(`Executing: "${initialCommand}"...`);
        clearInitialCommand();
        handleExecuteCommand(initialCommand);
      } else {
        // User spoke just "Hey Spark" or tapped the floating orb
        setState('LISTENING');
        setInputText('');
        setResponseMessage("I'm listening. What should we work on in SHIORI?");
        clearInitialCommand();

        const timer = setTimeout(() => {
          startListening();
        }, 300);

        setTimeout(() => inputRef.current?.focus(), 250);
        return () => clearTimeout(timer);
      }
    } else {
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

  // Handle ESC key to close
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

  // WebGL Strands dynamic shader mapping according to state
  const getStrandsProps = () => {
    switch (state) {
      case 'LISTENING':
        return {
          colors: ['#10B981', '#ffffff', '#06B6D4', '#F97316'],
          count: 5,
          speed: 1.0,
          amplitude: 1.4,
          waviness: 1.6,
          thickness: 0.85,
          glow: 3.5,
          intensity: 0.95,
          scale: 1.25
        };
      case 'PROCESSING':
        return {
          colors: ['#7C3AED', '#06B6D4', '#ffffff', '#FF4242'],
          count: 6,
          speed: 1.3,
          amplitude: 1.0,
          waviness: 1.9,
          thickness: 0.85,
          glow: 3.0,
          intensity: 0.9,
          scale: 1.2
        };
      case 'SPEAKING':
        return {
          colors: ['#F97316', '#ffffff', '#10B981'],
          count: 4,
          speed: 0.75,
          amplitude: 1.1,
          waviness: 1.2,
          thickness: 0.8,
          glow: 2.9,
          intensity: 0.85,
          scale: 1.2
        };
      case 'CONFIRMATION':
      case 'ERROR':
        return {
          colors: ['#FF4242', '#EAB308', '#ffffff'],
          count: 4,
          speed: 0.5,
          amplitude: 0.8,
          waviness: 1.0,
          thickness: 0.75,
          glow: 2.4,
          intensity: 0.75,
          scale: 1.1
        };
      case 'WAKE_LISTENING':
      case 'IDLE':
      default:
        return {
          colors: ['#F97316', '#ffffff', '#10B981'],
          count: 3,
          speed: 0.4,
          amplitude: 0.6,
          waviness: 0.95,
          thickness: 0.7,
          glow: 2.5,
          intensity: 0.7,
          scale: 1.15
        };
    }
  };

  const strandsProps = getStrandsProps();

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-between p-4 sm:p-8 md:p-10 bg-black/80 backdrop-blur-3xl backdrop-saturate-150 overflow-hidden font-sans select-none animate-fade-in text-white">
      {/* Full-Screen WebGL Strands Canvas Layer */}
      <div className="fixed inset-0 w-full h-full pointer-events-none z-0">
        <Strands {...strandsProps} />
      </div>

      {/* Ambient Frosted Vignette Overlay */}
      <div className="fixed inset-0 bg-radial-gradient from-transparent via-black/25 to-black/85 pointer-events-none z-0" />

      {/* Top Floating Frosted Navigation Bar */}
      <div className="relative z-10 w-full max-w-4xl mx-auto flex items-center justify-between px-5 py-3 rounded-full bg-white/[0.08] backdrop-blur-2xl border border-white/20 shadow-2xl">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="text-base font-bold tracking-widest text-white flex items-center gap-1.5 font-abask drop-shadow-[0_0_12px_rgba(249,115,22,0.6)]">
              ✦ SPARK
            </span>
            <span className="hidden sm:inline-block text-[10px] text-white/70 uppercase font-mono tracking-widest px-2 py-0.5 rounded-full bg-white/10 border border-white/10">
              SHIORI COMPANION
            </span>
          </div>

          {heySparkEnabled && (
            <div className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-500/20 border border-emerald-400/40 text-emerald-300 text-[10px] font-mono font-bold">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
              <span>WAKE ACTIVE</span>
            </div>
          )}
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => setHeySparkEnabled(!heySparkEnabled)}
            className={`hidden sm:flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-mono font-bold transition-all border ${
              heySparkEnabled
                ? 'bg-white/20 text-white border-white/40 shadow-sm'
                : 'bg-white/5 text-white/50 border-white/10 hover:text-white'
            }`}
            title="Wake word operates while SHIORI is open in browser"
          >
            <Radio className="w-3.5 h-3.5" />
            <span>"HEY SPARK"</span>
          </button>

          <button
            onClick={() => setVoiceResponsesEnabled(!voiceResponsesEnabled)}
            title={voiceResponsesEnabled ? 'Mute Voice Output' : 'Enable Voice Output'}
            className="p-2 text-white/70 hover:text-white rounded-full bg-white/5 hover:bg-white/15 transition-colors border border-white/10 cursor-pointer"
          >
            {voiceResponsesEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4 opacity-50" />}
          </button>

          <button
            onClick={closeSpark}
            className="p-2 text-white/70 hover:text-white rounded-full bg-white/5 hover:bg-white/15 transition-colors border border-white/10 cursor-pointer"
            title="Close Companion (Esc)"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Central Immersive Conversation Hub */}
      <div className="relative z-10 flex flex-col items-center justify-center text-center my-auto max-w-3xl w-full mx-auto px-4 space-y-6">
        {/* Animated State Indicator */}
        <div className="flex items-center justify-center">
          <span
            className={`px-4 py-1.5 rounded-full text-xs font-mono font-bold tracking-widest border uppercase transition-all shadow-xl backdrop-blur-xl ${
              state === 'LISTENING'
                ? 'bg-emerald-600/80 text-white border-emerald-300 animate-pulse shadow-[0_0_30px_rgba(16,185,129,0.8)]'
                : state === 'PROCESSING'
                ? 'bg-purple-600/80 text-white border-purple-300 shadow-[0_0_30px_rgba(147,51,234,0.8)]'
                : state === 'SPEAKING'
                ? 'bg-amber-600/80 text-white border-amber-300 shadow-[0_0_30px_rgba(245,158,11,0.8)]'
                : state === 'CONFIRMATION'
                ? 'bg-red-600/80 text-white border-red-300'
                : 'bg-white/10 text-white/90 border-white/20'
            }`}
          >
            {state === 'LISTENING'
              ? '● LISTENING...'
              : state === 'PROCESSING'
              ? '◌ PROCESSING...'
              : state === 'SPEAKING'
              ? '✦ SPARK'
              : state === 'CONFIRMATION'
              ? '⚠ CONFIRMATION'
              : heySparkEnabled
              ? '✦ LISTENING FOR HEY SPARK'
              : '✦ SPARK READY'}
          </span>
        </div>

        {/* Primary Response & Transcription Frosted Glass Card */}
        <div className="bg-black/50 backdrop-blur-2xl border border-white/20 rounded-3xl p-6 sm:p-10 shadow-[0_25px_60px_-15px_rgba(0,0,0,0.9)] text-center w-full space-y-4 transition-all">
          {state === 'LISTENING' && (interimTranscript || inputText) ? (
            <div className="space-y-2 animate-fade-in">
              <span className="text-[11px] font-mono text-emerald-400 uppercase tracking-widest block font-bold">
                HEARING:
              </span>
              <p className="text-xl sm:text-3xl font-mono text-emerald-200 font-semibold italic tracking-tight">
                "{interimTranscript || inputText}"<span className="inline-block w-2.5 h-6 ml-1.5 bg-emerald-400 animate-pulse align-middle" />
              </p>
            </div>
          ) : (
            <p className="text-lg sm:text-2xl font-abask text-white font-medium tracking-tight leading-relaxed drop-shadow-md whitespace-pre-line">
              {responseMessage || 'What should we work on in SHIORI today?'}
            </p>
          )}

          {/* Error Notice if any */}
          {errorMessage && (
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-red-500/20 border border-red-400/40 text-red-200 text-xs font-mono">
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Confirmation Panel */}
          {state === 'CONFIRMATION' && confirmationPayload && (
            <div className="mt-4 p-5 rounded-2xl bg-red-950/40 border border-red-500/40 backdrop-blur-xl text-left space-y-3 animate-fade-in">
              <div className="flex items-center gap-2 text-red-200 font-bold text-sm">
                <AlertTriangle className="w-4 h-4 text-red-400" />
                <span>Explicit Action Confirmation</span>
              </div>
              <p className="text-xs text-white/80 leading-relaxed font-sans">
                Action: <strong className="text-white">{confirmationPayload.action}</strong> on{' '}
                <em className="text-white underline">{confirmationPayload.targetName}</em>.
              </p>
              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  onClick={() => {
                    setState('IDLE');
                    setConfirmationPayload(null);
                    setResponseMessage('Action cancelled.');
                  }}
                  className="px-4 py-2 rounded-xl bg-white/10 hover:bg-white/20 border border-white/20 text-white text-xs font-bold transition-all cursor-pointer"
                >
                  CANCEL
                </button>
                <button
                  onClick={() => handleExecuteCommand(undefined, true)}
                  className="px-5 py-2 rounded-xl bg-red-600 hover:bg-red-500 text-white font-bold text-xs shadow-lg transition-all cursor-pointer"
                >
                  CONFIRM ACTION
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Bottom Floating Frosted Console */}
      <div className="relative z-10 w-full max-w-3xl mx-auto flex flex-col gap-4">
        {/* Quick Suggestion Chips */}
        <div className="flex flex-wrap items-center justify-center gap-2 text-xs font-mono">
          {[
            'What should I work on?',
            "What's running?",
            "What's overdue?",
            'Start 25 min focus',
            'Create task finish OAuth'
          ].map((sugg) => (
            <button
              key={sugg}
              onClick={() => {
                setInputText(sugg);
                handleExecuteCommand(sugg);
              }}
              className="px-3.5 py-1.5 rounded-full bg-white/[0.08] hover:bg-white/[0.18] border border-white/15 text-white/90 transition-all hover:scale-105 active:scale-95 shadow-sm cursor-pointer"
            >
              {sugg}
            </button>
          ))}
        </div>

        {/* Input & Tap-to-Talk Bar */}
        <div className="p-3 bg-white/[0.08] backdrop-blur-2xl border border-white/20 rounded-2xl shadow-2xl flex items-center gap-3">
          {/* Central Pulsating Mic Button */}
          <button
            onClick={state === 'LISTENING' ? stopListening : startListening}
            className={`relative p-3.5 rounded-xl border transition-all flex items-center justify-center shrink-0 cursor-pointer ${
              state === 'LISTENING'
                ? 'bg-emerald-500 text-white border-emerald-300 shadow-[0_0_25px_rgba(16,185,129,0.9)] scale-105'
                : 'bg-white/10 hover:bg-white/20 border-white/20 text-white'
            }`}
            title={state === 'LISTENING' ? 'Stop Listening' : 'Tap to Speak'}
          >
            {state === 'LISTENING' && (
              <span className="absolute -inset-1 rounded-xl border-2 border-emerald-400 animate-ping opacity-60 pointer-events-none" />
            )}
            {state === 'LISTENING' ? <MicOff className="w-5 h-5 animate-pulse" /> : <Mic className="w-5 h-5" />}
          </button>

          {/* Text Input */}
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
                : 'Ask Spark or speak "Hey Spark" (e.g. "What should I work on?")...'
            }
            className="flex-1 px-4 py-2.5 bg-black/40 border border-white/15 rounded-xl text-white placeholder-white/40 font-mono text-xs sm:text-sm outline-none focus:border-white/40 transition-colors"
          />

          {/* Send Button */}
          <button
            onClick={() => handleExecuteCommand()}
            disabled={!inputText.trim() || state === 'PROCESSING'}
            className="p-3 rounded-xl bg-white text-black font-bold shadow-lg disabled:opacity-30 hover:opacity-90 active:scale-95 transition-all cursor-pointer"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};
