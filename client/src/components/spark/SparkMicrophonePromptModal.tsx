import React from 'react';
import { Mic, Shield, X, AlertCircle } from 'lucide-react';
import { useSpark } from '../../context/SparkContext';

export const SparkMicrophonePromptModal: React.FC = () => {
  const { isMicPromptOpen, closeMicPrompt, requestMicrophoneAccess, setHeySparkEnabled } = useSpark();

  if (!isMicPromptOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in font-technical text-xs select-none">
      <div className="bg-eink-bg border-2 border-eink-text text-eink-text max-w-md w-full rounded-sm shadow-2xl p-5 space-y-4 animate-scale-up">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-eink-surface border border-eink-border flex items-center justify-center text-eink-text">
              <Mic className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-eink-text font-abask">
                ✦ SPARK WAKE WORD
              </h3>
              <p className="text-[10px] text-eink-textMuted font-mono">
                BROWSER MICROPHONE PERMISSION
              </p>
            </div>
          </div>

          <button
            onClick={() => {
              closeMicPrompt();
              setHeySparkEnabled(false);
            }}
            className="p-1 text-eink-textMuted hover:text-eink-text rounded hover:bg-eink-surface transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body Explanation */}
        <div className="space-y-2.5 text-xs text-eink-textSecondary leading-relaxed">
          <p className="font-bold text-eink-text text-sm">
            Spark needs microphone access to listen for "Hey Spark".
          </p>
          <p className="text-[11px]">
            This operates <strong>only while SHIORI is actively open</strong> in your browser or PWA. Audio is processed on-device through standard Web Speech recognition and is never streamed to third-party ad networks.
          </p>

          <div className="p-2.5 bg-eink-surface border border-eink-border rounded-sm flex items-center gap-2 text-[11px] text-eink-text">
            <Shield className="w-4 h-4 text-eink-text shrink-0" />
            <span>Privacy guaranteed: Audio is discarded immediately after wake-phrase matching.</span>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center justify-end gap-2 pt-2 border-t border-eink-border">
          <button
            onClick={() => {
              closeMicPrompt();
              setHeySparkEnabled(false);
            }}
            className="px-4 py-2 border border-eink-border bg-eink-surface hover:bg-eink-surfaceHover text-eink-text font-bold rounded-sm text-xs transition-colors cursor-pointer"
          >
            NOT NOW
          </button>

          <button
            onClick={async () => {
              await requestMicrophoneAccess();
              closeMicPrompt();
            }}
            className="px-5 py-2 bg-eink-text text-eink-bg font-bold rounded-sm text-xs shadow-eink-sm hover:opacity-90 active:scale-95 transition-all flex items-center gap-1.5 cursor-pointer"
          >
            <Mic className="w-3.5 h-3.5" />
            <span>ALLOW MICROPHONE</span>
          </button>
        </div>
      </div>
    </div>
  );
};
