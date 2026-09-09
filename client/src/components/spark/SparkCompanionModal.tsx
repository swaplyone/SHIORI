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
  Clock
} from 'lucide-react';
import Strands from './Strands';
import { useAuth } from '../../context/AuthContext';
import { useMorphBar } from '../../context/MorphBarContext';

interface SparkCompanionModalProps {
  isOpen: boolean;
  onClose: () => void;
  context?: {
    projectId?: string;
    taskId?: string;
  };
}

type SparkState = 'IDLE' | 'LISTENING' | 'PROCESSING' | 'SPEAKING' | 'CONFIRMATION' | 'ERROR';

export const SparkCompanionModal: React.FC<SparkCompanionModalProps> = ({
  isOpen,
  onClose,
  context = {}
}) => {
  const { token } = useAuth();
  const { startFocusTimer, pauseFocusTimer, resumeFocusTimer, stopFocusTimer } = useMorphBar();
  const navigate = useNavigate();

  const [state, setState] = useState<SparkState>('IDLE');
  const [transcript, setTranscript] = useState<string>('');
  const [inputText, setInputText] = useState<string>('');
  const [responseMessage, setResponseMessage] = useState<string>('');
  const [confirmationPayload, setConfirmationPayload] = useState<any>(null);
  const [speechEnabled, setSpeechEnabled] = useState<boolean>(true);
  const [hasMicPermission, setHasMicPermission] = useState<boolean | null>(null);
  const [errorMessage, setErrorMessage] = useState<string>('');

  const recognitionRef = useRef<any>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Initialize Web Speech Recognition
  useEffect(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (SpeechRecognition) {
      try {
        const recognition = new SpeechRecognition();
        recognition.continuous = false;
        recognition.interimResults = true;
        recognition.lang = 'en-US';

        recognition.onstart = () => {
          setState('LISTENING');
          setHasMicPermission(true);
        };

        recognition.onresult = (event: any) => {
          let currentTranscript = '';
          for (let i = event.resultIndex; i < event.results.length; i++) {
            currentTranscript += event.results[i][0].transcript;
          }
          setTranscript(currentTranscript);
          setInputText(currentTranscript);
        };

        recognition.onerror = (event: any) => {
          console.warn('[SPARK SPEECH ERROR]', event.error);
          if (event.error === 'not-allowed') {
            setHasMicPermission(false);
            setErrorMessage('Microphone access denied. You can type commands below.');
          } else if (event.error === 'no-speech') {
            setState('IDLE');
          } else {
            setErrorMessage('Speech recognition unavailable. Try typing your command.');
            setState('IDLE');
          }
        };

        recognition.onend = () => {
          if (transcript.trim() && state === 'LISTENING') {
            handleExecuteCommand(transcript.trim());
          } else {
            setState('IDLE');
          }
        };

        recognitionRef.current = recognition;
      } catch (err) {
        console.warn('SpeechRecognition initialization failed:', err);
      }
    }
  }, [transcript, state]);

  // Focus input on open
  useEffect(() => {
    if (isOpen) {
      setState('IDLE');
      setTranscript('');
      setInputText('');
      setResponseMessage('What should we work on in SHIORI today?');
      setConfirmationPayload(null);
      setErrorMessage('');
      setTimeout(() => inputRef.current?.focus(), 150);
    } else {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch {}
      }
      if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
    }
  }, [isOpen]);

  // Handle Speech Output
  const speakText = (text: string) => {
    if (!speechEnabled || !('speechSynthesis' in window)) return;
    try {
      window.speechSynthesis.cancel();
      const clean = text.replace(/[*_`#]/g, '').trim();
      const utterance = new SpeechSynthesisUtterance(clean);
      utterance.rate = 1.05;
      utterance.pitch = 1.0;
      utterance.onstart = () => setState('SPEAKING');
      utterance.onend = () => setState('IDLE');
      utterance.onerror = () => setState('IDLE');
      window.speechSynthesis.speak(utterance);
    } catch (e) {
      console.warn('Speech synthesis error:', e);
    }
  };

  // Start Voice Listening
  const startListening = () => {
    if (!recognitionRef.current) {
      setErrorMessage('Speech recognition is not supported in this browser. Please type commands below.');
      return;
    }
    try {
      if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
      setTranscript('');
      setInputText('');
      setErrorMessage('');
      recognitionRef.current.start();
    } catch (e) {
      console.warn('Recognition start error:', e);
    }
  };

  // Stop Voice Listening
  const stopListening = () => {
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {}
    }
  };

  // Execute Command via Secure Backend Router
  const handleExecuteCommand = async (commandToRun?: string, isConfirmed = false) => {
    const text = (commandToRun || inputText).trim();
    if (!text || !token) return;

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

      if (res.ok && data.success) {
        setResponseMessage(data.displayText || 'Done.');

        // Speech audio
        if (data.speakText) {
          speakText(data.speakText);
        } else {
          setState('IDLE');
        }

        // Handle Focus Timer integration
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

        // Handle Confirmation Requirement
        if (data.needsConfirmation) {
          setState('CONFIRMATION');
          setConfirmationPayload(data.confirmationPayload);
          return;
        } else {
          setConfirmationPayload(null);
        }

        // Trigger UI refresh
        if (data.refreshNeeded) {
          window.dispatchEvent(new Event('shiori-refresh'));
        }

        // Trigger Navigation
        if (data.navigate) {
          setTimeout(() => {
            navigate(data.navigate);
            onClose();
          }, 1200);
        }
      } else {
        setState('ERROR');
        setResponseMessage(data.displayText || data.error || 'I could not reach SHIORI right now.');
        if (data.speakText) speakText(data.speakText);
      }
    } catch (err) {
      console.error(err);
      setState('ERROR');
      setResponseMessage("I couldn't reach SHIORI right now. Try again.");
    }
  };

  if (!isOpen) return null;

  // Compute Strands WebGL shader attributes based on Spark state
  const getStrandsProps = () => {
    switch (state) {
      case 'LISTENING':
        return {
          colors: ['#111111', '#555555', '#222222', '#000000'],
          count: 5,
          speed: 0.85,
          amplitude: 1.3,
          waviness: 1.4,
          thickness: 0.9,
          glow: 3.2
        };
      case 'PROCESSING':
        return {
          colors: ['#222222', '#777777', '#111111', '#444444'],
          count: 6,
          speed: 1.3,
          amplitude: 0.9,
          waviness: 1.8,
          thickness: 0.8,
          glow: 2.8
        };
      case 'SPEAKING':
        return {
          colors: ['#111111', '#444444', '#222222'],
          count: 4,
          speed: 0.65,
          amplitude: 1.0,
          waviness: 1.1,
          thickness: 0.75,
          glow: 2.4
        };
      case 'CONFIRMATION':
      case 'ERROR':
        return {
          colors: ['#333333', '#666666', '#222222'],
          count: 3,
          speed: 0.35,
          amplitude: 0.5,
          waviness: 0.8,
          thickness: 0.6,
          glow: 1.8
        };
      case 'IDLE':
      default:
        return {
          colors: ['#333333', '#777777', '#111111'],
          count: 3,
          speed: 0.3,
          amplitude: 0.45,
          waviness: 0.9,
          thickness: 0.6,
          glow: 1.6
        };
    }
  };

  const strandsProps = getStrandsProps();

  return (
    <div className="fixed inset-0 z-50 bg-eink-text/40 backdrop-blur-[2px] flex items-center justify-center p-3 sm:p-4 font-sans select-none animate-fade-in">
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
              onClick={onClose}
              className="p-1 text-eink-textMuted hover:text-eink-text rounded hover:bg-eink-surfaceHover transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Central Visual Stage: Strands WebGL Waveform Animation */}
        <div className="relative h-44 sm:h-48 w-full bg-eink-bg flex flex-col items-center justify-center overflow-hidden border-b border-eink-border">
          {/* Strands Container */}
          <div className="absolute inset-0 opacity-85">
            <Strands {...strandsProps} />
          </div>

          {/* Status Badge */}
          <div className="relative z-10 flex flex-col items-center gap-2 text-center px-4">
            <span
              className={`px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold tracking-widest border uppercase transition-all shadow-sm ${
                state === 'LISTENING'
                  ? 'bg-eink-text text-eink-bg border-eink-text animate-pulse'
                  : state === 'PROCESSING'
                  ? 'bg-eink-surface text-eink-text border-eink-text font-bold'
                  : state === 'CONFIRMATION'
                  ? 'bg-eink-text text-eink-bg border-eink-text'
                  : 'bg-eink-surface/80 text-eink-textSecondary border-eink-border'
              }`}
            >
              {state === 'LISTENING'
                ? '● LISTENING...'
                : state === 'PROCESSING'
                ? '◌ ONE SECOND...'
                : state === 'SPEAKING'
                ? '✦ SPARK'
                : state === 'CONFIRMATION'
                ? '⚠ CONFIRMATION'
                : '✦ READY'}
            </span>

            {/* Response / Status Text */}
            <p className="text-xs font-mono text-eink-text max-w-sm leading-relaxed px-2 font-medium">
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
                  setState('IDLE');
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
            placeholder={state === 'LISTENING' ? 'Listening to voice...' : 'Type a command (e.g., "Start focus", "Show tasks")...'}
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
        <div className="p-3 bg-eink-bg flex flex-wrap items-center gap-1.5 text-[11px] font-mono">
          <span className="text-[10px] text-eink-textMuted uppercase font-bold mr-1">SUGGESTIONS:</span>
          {[
            'Start a 25 min focus session',
            'Show my tasks',
            'Check Git status',
            'Create task Finish auth',
            'Create private repository'
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

        {/* Footer */}
        <div className="p-2.5 bg-eink-surface border-t border-eink-border flex items-center justify-between text-[10px] text-eink-textMuted font-mono">
          <span>SHIORI Voice & Project Companion • Tap 🎙 or press Enter</span>
          <span className="uppercase">Plan • Build • Verify</span>
        </div>
      </div>
    </div>
  );
};
