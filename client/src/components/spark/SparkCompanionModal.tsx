import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  X,
  Mic,
  MicOff,
  Send,
  Sparkles,
  RotateCcw,
  Check,
  AlertTriangle,
  Volume2,
  VolumeX,
  ShieldCheck,
  Terminal,
  ArrowRight,
  Play,
  CheckCircle2,
  Clock,
  Radio,
  Minimize2
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

type SparkState = 'STANDBY' | 'WAKE_DETECTED' | 'LISTENING' | 'PROCESSING' | 'SPEAKING' | 'CONFIRMATION' | 'ERROR';

export const SparkCompanionModal: React.FC<SparkCompanionModalProps> = ({
  context = {}
}) => {
  const { token } = useAuth();
  const {
    isSparkOpen,
    closeSpark,
    heySparkEnabled,
    setHeySparkEnabled,
    initialCommand,
    clearInitialCommand
  } = useSpark();

  const { startFocusTimer, pauseFocusTimer, resumeFocusTimer, stopFocusTimer } = useMorphBar();
  const navigate = useNavigate();

  const [state, setState] = useState<SparkState>('STANDBY');
  const [inputText, setInputText] = useState<string>('');
  const [responseMessage, setResponseMessage] = useState<string>('');
  const [confirmationPayload, setConfirmationPayload] = useState<any>(null);
  const [speechEnabled, setSpeechEnabled] = useState<boolean>(true);
  const [errorMessage, setErrorMessage] = useState<string>('');

  const recognitionRef = useRef<any>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const isExecutingRef = useRef(false);

  // Initialize Speech Recognition for active voice input
  useEffect(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) return;

    try {
      const recognition = new SpeechRecognition();
      recognition.continuous = false;
      recognition.interimResults = true;
      recognition.lang = 'en-US';

      recognition.onstart = () => {
        setState('LISTENING');
      };

      recognition.onresult = (event: any) => {
        let transcript = '';
        for (let i = event.resultIndex; i < event.results.length; i++) {
          transcript += event.results[i][0].transcript;
        }

        const cleanTranscript = transcript.replace(/^(?:hey|hi|hello|ok|okay)?\s*spark[,.]?\s*/i, '').trim();
        if (cleanTranscript) {
          setInputText(cleanTranscript);
        }
      };

      recognition.onerror = (event: any) => {
        console.warn('[SPARK ACTIVE SPEECH ERROR]', event.error);
        if (event.error === 'not-allowed') {
          setErrorMessage('Microphone access denied. You can type commands below.');
          setState('STANDBY');
        } else if (event.error === 'no-speech') {
          setState('STANDBY');
        } else {
          setState('STANDBY');
        }
      };

      recognition.onend = () => {
        // If voice transcribed text was captured, auto-execute it
        if (inputRef.current?.value && !isExecutingRef.current) {
          handleExecuteCommand(inputRef.current.value);
        } else {
          setState((prev) => (prev === 'LISTENING' ? 'STANDBY' : prev));
        }
      };

      recognitionRef.current = recognition;
    } catch (err) {
      console.warn('Modal SpeechRecognition init error:', err);
    }
  }, []);

  // When modal opens: Check if an initial command was captured, or start listening
  useEffect(() => {
    if (isSparkOpen) {
      isExecutingRef.current = false;
      setConfirmationPayload(null);
      setErrorMessage('');

      if (initialCommand && initialCommand.trim().length > 1) {
        // User spoke the wake word + command in one breath
        setInputText(initialCommand);
        setState('PROCESSING');
        setResponseMessage(`Executing: "${initialCommand}"...`);
        clearInitialCommand();
        handleExecuteCommand(initialCommand);
      } else {
        // User spoke just "Hey Spark" or tapped the floating orb
        setState('WAKE_DETECTED');
        setInputText('');
        setResponseMessage('What should we work on in SHIORI today?');
        clearInitialCommand();

        // Start listening smoothly after wake chime animation
        const timer = setTimeout(() => {
          startListening();
        }, 500);

        setTimeout(() => inputRef.current?.focus(), 300);
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

  // Speech output
  const speakText = (text: string) => {
    if (!speechEnabled || !('speechSynthesis' in window)) return;
    try {
      window.speechSynthesis.cancel();
      const clean = text.replace(/[*_`#]/g, '').trim();
      const utterance = new SpeechSynthesisUtterance(clean);
      utterance.rate = 1.05;
      utterance.pitch = 1.0;
      utterance.onstart = () => setState('SPEAKING');
      utterance.onend = () => setState('STANDBY');
      utterance.onerror = () => setState('STANDBY');
      window.speechSynthesis.speak(utterance);
    } catch (e) {
      console.warn('Speech synthesis error:', e);
    }
  };

  const startListening = () => {
    if (!recognitionRef.current) {
      setState('STANDBY');
      return;
    }
    try {
      if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
      setInputText('');
      setErrorMessage('');
      recognitionRef.current.start();
    } catch (e) {
      console.warn('Recognition start failed:', e);
      setState('STANDBY');
    }
  };

  const stopListening = () => {
    if (recognitionRef.current) {
      try {
        recognitionRef.current.abort();
      } catch {}
    }
    setState('STANDBY');
  };

  // Execute Command via Secure Backend Router
  const handleExecuteCommand = async (commandToRun?: string, isConfirmed = false) => {
    const text = (commandToRun || inputText).trim();
    if (!text || !token) return;

    isExecutingRef.current = true;
    setState('PROCESSING');
    setErrorMessage('');

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

        if (data.speakText) {
          speakText(data.speakText);
        } else {
          setState('STANDBY');
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
        if (data.speakText) speakText(data.speakText);
      }
    } catch (err) {
      console.error(err);
      isExecutingRef.current = false;
      setState('ERROR');
      setResponseMessage("I couldn't reach SHIORI right now. Try again.");
    }
  };

  if (!isSparkOpen) return null;

  // WebGL Strands dynamic shader mapping for full-screen visuals
  const getStrandsProps = () => {
    switch (state) {
      case 'WAKE_DETECTED':
        return {
          colors: ['#F97316', '#ffffff', '#10B981', '#EAB308'],
          count: 6,
          speed: 1.5,
          amplitude: 1.6,
          waviness: 1.8,
          thickness: 0.95,
          glow: 3.8,
          intensity: 1.0,
          scale: 1.3
        };
      case 'LISTENING':
        return {
          colors: ['#10B981', '#ffffff', '#06B6D4', '#F97316'],
          count: 5,
          speed: 0.95,
          amplitude: 1.4,
          waviness: 1.5,
          thickness: 0.85,
          glow: 3.4,
          intensity: 0.95,
          scale: 1.25
        };
      case 'PROCESSING':
        return {
          colors: ['#7C3AED', '#06B6D4', '#ffffff', '#FF4242'],
          count: 7,
          speed: 1.4,
          amplitude: 1.1,
          waviness: 2.0,
          thickness: 0.85,
          glow: 3.2,
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
          glow: 3.0,
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
      case 'STANDBY':
      default:
        return {
          colors: ['#F97316', '#ffffff', '#10B981'],
          count: 3,
          speed: 0.45,
          amplitude: 0.65,
          waviness: 1.0,
          thickness: 0.7,
          glow: 2.6,
          intensity: 0.75,
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
      <div className="fixed inset-0 bg-radial-gradient from-transparent via-black/20 to-black/80 pointer-events-none z-0" />

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
            title="Toggle 'Hey Spark' wake-word listener"
          >
            <Radio className="w-3.5 h-3.5" />
            <span>"HEY SPARK"</span>
          </button>

          <button
            onClick={() => setSpeechEnabled(!speechEnabled)}
            title={speechEnabled ? 'Mute Audio Output' : 'Enable Audio Output'}
            className="p-2 text-white/70 hover:text-white rounded-full bg-white/5 hover:bg-white/15 transition-colors border border-white/10"
          >
            {speechEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4 opacity-50" />}
          </button>

          <button
            onClick={closeSpark}
            className="p-2 text-white/70 hover:text-white rounded-full bg-white/5 hover:bg-white/15 transition-colors border border-white/10"
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
              state === 'WAKE_DETECTED'
                ? 'bg-orange-500/80 text-white border-orange-300 scale-110 animate-pulse shadow-[0_0_30px_rgba(249,115,22,0.8)]'
                : state === 'LISTENING'
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
            {state === 'WAKE_DETECTED'
              ? '✦ HEY SPARK DETECTED'
              : state === 'LISTENING'
              ? '● LISTENING TO VOICE...'
              : state === 'PROCESSING'
              ? '◌ PROCESSING COMMAND...'
              : state === 'SPEAKING'
              ? '✦ SPARK'
              : state === 'CONFIRMATION'
              ? '⚠ ACTION CONFIRMATION'
              : '✦ SPARK READY'}
          </span>
        </div>

        {/* Primary Response & Transcription Frosted Glass Card */}
        <div className="bg-black/50 backdrop-blur-2xl border border-white/20 rounded-3xl p-6 sm:p-10 shadow-[0_25px_60px_-15px_rgba(0,0,0,0.9)] text-center w-full space-y-4 transition-all">
          {state === 'LISTENING' && inputText ? (
            <div className="space-y-2 animate-fade-in">
              <span className="text-[11px] font-mono text-emerald-400 uppercase tracking-widest block font-bold">
                HEARING:
              </span>
              <p className="text-xl sm:text-3xl font-mono text-emerald-200 font-semibold italic tracking-tight">
                "{inputText}"<span className="inline-block w-2.5 h-6 ml-1.5 bg-emerald-400 animate-pulse align-middle" />
              </p>
            </div>
          ) : (
            <p className="text-lg sm:text-2xl font-abask text-white font-medium tracking-tight leading-relaxed drop-shadow-md">
              {responseMessage || 'How can I assist your workflow today?'}
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
                    setState('STANDBY');
                    setConfirmationPayload(null);
                    setResponseMessage('Action cancelled.');
                  }}
                  className="px-4 py-2 rounded-xl bg-white/10 hover:bg-white/20 border border-white/20 text-white text-xs font-bold transition-all"
                >
                  CANCEL
                </button>
                <button
                  onClick={() => handleExecuteCommand(undefined, true)}
                  className="px-5 py-2 rounded-xl bg-red-600 hover:bg-red-500 text-white font-bold text-xs shadow-lg transition-all"
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
            'Fix GitHub authentication'
          ].map((sugg) => (
            <button
              key={sugg}
              onClick={() => {
                setInputText(sugg);
                handleExecuteCommand(sugg);
              }}
              className="px-3.5 py-1.5 rounded-full bg-white/[0.08] hover:bg-white/[0.18] border border-white/15 text-white/90 transition-all hover:scale-105 active:scale-95 shadow-sm"
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
