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
  Radio
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

  // Initialize Speech Recognition for live spoken commands
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

        const cleanTranscript = transcript.replace(/^(hey\s+)?spark,?\s*/i, '').trim();
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
        // If we captured speech in the input, execute it
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
        // User spoke the wake word + command in one breath (e.g., "Hey Spark create task test")
        setInputText(initialCommand);
        setState('PROCESSING');
        setResponseMessage(`Executing: "${initialCommand}"...`);
        clearInitialCommand();
        handleExecuteCommand(initialCommand);
      } else {
        // User spoke just "Hey Spark" or tapped the Spark button
        setState('WAKE_DETECTED');
        setInputText('');
        setResponseMessage('What should we work on in SHIORI today?');
        clearInitialCommand();

        // Start listening smoothly after brief wake pulse
        const timer = setTimeout(() => {
          startListening();
        }, 400);

        setTimeout(() => inputRef.current?.focus(), 200);
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
          }, 1400);
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

  // WebGL Strands shader attributes mapping
  const getStrandsProps = () => {
    switch (state) {
      case 'WAKE_DETECTED':
        return {
          colors: ['#F97316', '#ffffff', '#10B981', '#EAB308'],
          count: 5,
          speed: 1.4,
          amplitude: 1.5,
          waviness: 1.6,
          thickness: 0.9,
          glow: 3.2,
          intensity: 0.9
        };
      case 'LISTENING':
        return {
          colors: ['#10B981', '#ffffff', '#06B6D4', '#F97316'],
          count: 4,
          speed: 0.8,
          amplitude: 1.2,
          waviness: 1.3,
          thickness: 0.8,
          glow: 2.8,
          intensity: 0.8
        };
      case 'PROCESSING':
        return {
          colors: ['#7C3AED', '#06B6D4', '#ffffff', '#FF4242'],
          count: 6,
          speed: 1.3,
          amplitude: 0.9,
          waviness: 1.8,
          thickness: 0.8,
          glow: 2.8,
          intensity: 0.85
        };
      case 'SPEAKING':
        return {
          colors: ['#F97316', '#ffffff', '#10B981'],
          count: 4,
          speed: 0.65,
          amplitude: 1.0,
          waviness: 1.1,
          thickness: 0.75,
          glow: 2.5,
          intensity: 0.75
        };
      case 'CONFIRMATION':
      case 'ERROR':
        return {
          colors: ['#FF4242', '#EAB308', '#ffffff'],
          count: 3,
          speed: 0.4,
          amplitude: 0.6,
          waviness: 0.9,
          thickness: 0.7,
          glow: 2.0,
          intensity: 0.7
        };
      case 'STANDBY':
      default:
        return {
          colors: ['#F97316', '#ffffff', '#10B981'],
          count: 3,
          speed: 0.4,
          amplitude: 0.55,
          waviness: 1.0,
          thickness: 0.7,
          glow: 2.4,
          intensity: 0.7
        };
    }
  };

  const strandsProps = getStrandsProps();

  return (
    <div className="fixed inset-0 z-50 bg-eink-text/50 backdrop-blur-[2px] flex items-center justify-center p-3 sm:p-4 font-sans select-none animate-fade-in">
      <div className="bg-eink-bg border-2 border-eink-text w-full max-w-lg rounded-sm shadow-2xl flex flex-col overflow-hidden font-technical text-xs animate-scale-up">
        {/* Header */}
        <div className="p-3.5 border-b border-eink-border bg-eink-surface flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-sm font-bold tracking-widest text-eink-text flex items-center gap-1.5 font-abask">
              ✦ SPARK
            </span>
            <span className="text-[10px] text-eink-textMuted uppercase font-mono tracking-wider">
              YOUR SHIORI COMPANION
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setSpeechEnabled(!speechEnabled)}
              title={speechEnabled ? 'Mute Speech Output' : 'Enable Speech Output'}
              className="p-1 text-eink-textMuted hover:text-eink-text transition-colors"
            >
              {speechEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4 opacity-50" />}
            </button>
            <button
              onClick={closeSpark}
              className="p-1 text-eink-textMuted hover:text-eink-text rounded hover:bg-eink-surfaceHover transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Central Visual Stage: Radiant WebGL Strands Animation */}
        <div className="relative h-48 sm:h-52 w-full bg-[#111111] flex flex-col items-center justify-center overflow-hidden border-b border-eink-border">
          {/* Strands Container with explicit height */}
          <div className="absolute inset-0 w-full h-full">
            <Strands {...strandsProps} />
          </div>

          {/* Status Badge & Caption Overlay */}
          <div className="relative z-10 flex flex-col items-center gap-2 text-center px-4 pointer-events-none">
            <span
              className={`px-3 py-0.5 rounded-full text-[10px] font-mono font-bold tracking-widest border uppercase transition-all shadow-md ${
                state === 'WAKE_DETECTED'
                  ? 'bg-orange-500 text-white border-orange-400 scale-110 animate-pulse'
                  : state === 'LISTENING'
                  ? 'bg-emerald-600 text-white border-emerald-400 animate-pulse'
                  : state === 'PROCESSING'
                  ? 'bg-purple-600 text-white border-purple-400 font-bold'
                  : state === 'CONFIRMATION'
                  ? 'bg-red-600 text-white border-red-400'
                  : 'bg-black/60 backdrop-blur-md text-white/90 border-white/20'
              }`}
            >
              {state === 'WAKE_DETECTED'
                ? '✦ HEY SPARK DETECTED'
                : state === 'LISTENING'
                ? '● LISTENING...'
                : state === 'PROCESSING'
                ? '◌ ONE SECOND...'
                : state === 'SPEAKING'
                ? '✦ SPARK'
                : state === 'CONFIRMATION'
                ? '⚠ CONFIRMATION'
                : '✦ READY'}
            </span>

            {/* Response text box */}
            <p className="text-xs font-mono text-white bg-black/50 backdrop-blur-sm px-3 py-1 rounded border border-white/10 max-w-sm leading-relaxed font-medium shadow-sm">
              {responseMessage}
            </p>
          </div>
        </div>

        {/* Confirmation Modal Body if Active */}
        {state === 'CONFIRMATION' && confirmationPayload && (
          <div className="p-4 bg-eink-surface border-b border-eink-border space-y-3">
            <div className="flex items-center gap-2 text-eink-text font-bold text-xs">
              <AlertTriangle className="w-4 h-4 text-eink-text" />
              <span>Explicit Confirmation Required</span>
            </div>
            <p className="text-[11px] text-eink-textSecondary">
              Action: <strong>{confirmationPayload.action}</strong> on <em>{confirmationPayload.targetName}</em>.
            </p>
            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                onClick={() => {
                  setState('STANDBY');
                  setConfirmationPayload(null);
                  setResponseMessage('Action cancelled.');
                }}
                className="px-3.5 py-1.5 border border-eink-border hover:bg-eink-bg text-eink-text font-bold rounded-sm text-xs"
              >
                CANCEL
              </button>
              <button
                onClick={() => handleExecuteCommand(undefined, true)}
                className="px-4 py-1.5 bg-eink-text text-eink-bg font-bold rounded-sm text-xs shadow-eink-sm hover:opacity-90 active:scale-[0.99]"
              >
                CONFIRM ACTION
              </button>
            </div>
          </div>
        )}

        {/* Error Notice */}
        {errorMessage && (
          <div className="p-2.5 bg-eink-surface border-b border-eink-border text-[11px] text-eink-textSecondary flex items-center gap-2">
            <ShieldCheck className="w-3.5 h-3.5 text-eink-text shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}

        {/* Input & Tap-to-Talk Bar */}
        <div className="p-3 bg-eink-surface/50 flex items-center gap-2 border-b border-eink-border">
          <button
            onClick={state === 'LISTENING' ? stopListening : startListening}
            className={`p-2.5 rounded-sm border transition-all flex items-center justify-center shrink-0 ${
              state === 'LISTENING'
                ? 'bg-eink-text text-eink-bg border-eink-text shadow-md scale-105'
                : 'bg-eink-surface hover:bg-eink-surfaceHover border-eink-border text-eink-text'
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
            placeholder={state === 'LISTENING' ? 'Listening to voice...' : 'Ask Spark (e.g. "What should I work on?", "Start focus")...'}
            className="flex-1 px-3 py-2 bg-eink-bg border border-eink-border rounded-sm text-eink-text font-mono text-xs outline-none focus:border-eink-text"
          />

          <button
            onClick={() => handleExecuteCommand()}
            disabled={!inputText.trim() || state === 'PROCESSING'}
            className="p-2 bg-eink-text text-eink-bg rounded-sm font-bold shadow-eink-sm disabled:opacity-40 hover:opacity-90 active:scale-[0.98] transition-all"
          >
            <Send className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Quick Suggestion Chips */}
        <div className="p-3 bg-eink-bg flex flex-wrap items-center gap-1.5 text-[11px] font-mono border-b border-eink-border/50">
          <span className="text-[10px] text-eink-textMuted uppercase font-bold mr-1">TRY:</span>
          {[
            'What should I work on?',
            "What's running?",
            "What's overdue?",
            'Start a 25 min focus',
            'Create task Fix OAuth'
          ].map((sugg) => (
            <button
              key={sugg}
              onClick={() => {
                setInputText(sugg);
                handleExecuteCommand(sugg);
              }}
              className="px-2 py-1 bg-eink-surface hover:bg-eink-surfaceHover border border-eink-border rounded-sm text-eink-textSecondary transition-colors"
            >
              {sugg}
            </button>
          ))}
        </div>

        {/* Wake Word Setting Strip */}
        <div className="p-2.5 bg-eink-surface flex items-center justify-between text-[11px]">
          <div className="flex items-center gap-2">
            <Radio className={`w-3.5 h-3.5 ${heySparkEnabled ? 'text-eink-text animate-pulse' : 'text-eink-textMuted'}`} />
            <div>
              <span className="font-bold text-eink-text block leading-none">"Hey Spark" Wake Word</span>
              <span className="text-[10px] text-eink-textMuted">Listen while SHIORI is open</span>
            </div>
          </div>

          <button
            onClick={() => setHeySparkEnabled(!heySparkEnabled)}
            className={`px-2.5 py-1 rounded-sm border font-mono text-[10px] font-bold transition-all ${
              heySparkEnabled
                ? 'bg-eink-text text-eink-bg border-eink-text'
                : 'bg-eink-bg border-eink-border text-eink-textSecondary hover:text-eink-text'
            }`}
          >
            {heySparkEnabled ? 'ON [LISTENING]' : 'OFF'}
          </button>
        </div>
      </div>
    </div>
  );
};
