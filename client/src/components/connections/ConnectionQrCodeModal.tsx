import React, { useEffect, useRef, useState } from 'react';
import { X, QrCode, Copy, Check, Download, Sparkles, Terminal, Scroll, ShieldCheck } from 'lucide-react';
import QRCode from 'qrcode';

export type QrTemplateId = 'eink' | 'terminal' | 'japanese' | 'devpass';

interface TemplateOption {
  id: QrTemplateId;
  name: string;
  icon: React.ComponentType<{ className?: string }>;
  tagline: string;
  darkColor: string;
  lightColor: string;
  cardBg: string;
  textColor: string;
  borderColor: string;
}

const TEMPLATES: TemplateOption[] = [
  {
    id: 'eink',
    name: 'Minimal E-Ink',
    icon: QrCode,
    tagline: 'High-contrast monochrome paper',
    darkColor: '#121212',
    lightColor: '#FFFFFF',
    cardBg: 'bg-white',
    textColor: 'text-stone-900',
    borderColor: 'border-stone-300'
  },
  {
    id: 'terminal',
    name: 'Dev Terminal',
    icon: Terminal,
    tagline: 'Matrix darkroom & scanlines',
    darkColor: '#34D399',
    lightColor: '#0F171B',
    cardBg: 'bg-[#0F171B]',
    textColor: 'text-emerald-400',
    borderColor: 'border-emerald-800'
  },
  {
    id: 'japanese',
    name: 'Japanese Washi',
    icon: Scroll,
    tagline: 'Sumi charcoal & tea paper',
    darkColor: '#25282A',
    lightColor: '#F7F4EB',
    cardBg: 'bg-[#F7F4EB]',
    textColor: 'text-[#25282A]',
    borderColor: 'border-[#DDD4C0]'
  },
  {
    id: 'devpass',
    name: 'Verified Pass',
    icon: ShieldCheck,
    tagline: 'Holographic developer badge',
    darkColor: '#1E293B',
    lightColor: '#F1F5F9',
    cardBg: 'bg-slate-50',
    textColor: 'text-slate-900',
    borderColor: 'border-slate-300'
  }
];

interface ConnectionQrCodeModalProps {
  isOpen: boolean;
  onClose: () => void;
  shioriId: string;
  userName?: string;
}

export const ConnectionQrCodeModal: React.FC<ConnectionQrCodeModalProps> = ({
  isOpen,
  onClose,
  shioriId,
  userName
}) => {
  const [selectedTemplate, setSelectedTemplate] = useState<QrTemplateId>('eink');
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const [copiedLink, setCopiedLink] = useState(false);
  const cardRef = useRef<HTMLDivElement | null>(null);

  const activeTemplate = TEMPLATES.find((t) => t.id === selectedTemplate) || TEMPLATES[0];

  const inviteUrl = typeof window !== 'undefined'
    ? `${window.location.origin}/connections?add=${encodeURIComponent(shioriId)}`
    : `https://shiori.app/connections?add=${encodeURIComponent(shioriId)}`;

  useEffect(() => {
    if (!isOpen || !shioriId) return;

    QRCode.toDataURL(inviteUrl, {
      width: 320,
      margin: 2,
      color: {
        dark: activeTemplate.darkColor,
        light: activeTemplate.lightColor
      },
      errorCorrectionLevel: 'H'
    })
      .then((url) => setQrDataUrl(url))
      .catch((err) => console.error('Failed to render QR Code:', err));
  }, [isOpen, shioriId, inviteUrl, activeTemplate]);

  if (!isOpen) return null;

  const handleCopyLink = () => {
    navigator.clipboard.writeText(inviteUrl);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2500);
  };

  // Download styled template card as high-res PNG canvas
  const handleDownloadCard = () => {
    if (!qrDataUrl) return;

    const canvas = document.createElement('canvas');
    canvas.width = 600;
    canvas.height = 760;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // 1. Draw Card Background
    if (selectedTemplate === 'terminal') {
      ctx.fillStyle = '#0F171B';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      // Scanline effect
      ctx.fillStyle = 'rgba(52, 211, 153, 0.03)';
      for (let i = 0; i < canvas.height; i += 4) {
        ctx.fillRect(0, i, canvas.width, 2);
      }
      // Border
      ctx.strokeStyle = '#065F46';
      ctx.lineWidth = 4;
      ctx.strokeRect(16, 16, canvas.width - 32, canvas.height - 32);
    } else if (selectedTemplate === 'japanese') {
      ctx.fillStyle = '#F7F4EB';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.strokeStyle = '#DDD4C0';
      ctx.lineWidth = 4;
      ctx.strokeRect(16, 16, canvas.width - 32, canvas.height - 32);
      // Red seal accent
      ctx.fillStyle = '#C2410C';
      ctx.fillRect(canvas.width - 64, 32, 28, 28);
    } else if (selectedTemplate === 'devpass') {
      ctx.fillStyle = '#F8FAFC';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      // Header ribbon
      ctx.fillStyle = '#1E293B';
      ctx.fillRect(16, 16, canvas.width - 32, 70);
      ctx.strokeStyle = '#CBD5E1';
      ctx.lineWidth = 4;
      ctx.strokeRect(16, 16, canvas.width - 32, canvas.height - 32);
    } else {
      // Minimal E-Ink
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.strokeStyle = '#111111';
      ctx.lineWidth = 4;
      ctx.strokeRect(16, 16, canvas.width - 32, canvas.height - 32);
    }

    // 2. Draw Header Text
    ctx.textAlign = 'center';
    if (selectedTemplate === 'devpass') {
      ctx.fillStyle = '#FFFFFF';
      ctx.font = 'bold 20px monospace';
      ctx.fillText('SHIORI · VERIFIED DEVELOPER', canvas.width / 2, 60);
    } else if (selectedTemplate === 'terminal') {
      ctx.fillStyle = '#34D399';
      ctx.font = 'bold 22px monospace';
      ctx.fillText('// SHIORI_ID_PROTOCOL: V2.4', canvas.width / 2, 65);
    } else if (selectedTemplate === 'japanese') {
      ctx.fillStyle = '#25282A';
      ctx.font = 'bold 22px serif';
      ctx.fillText('SHIORI · 栞 接続証', canvas.width / 2, 65);
    } else {
      ctx.fillStyle = '#111111';
      ctx.font = 'bold 24px monospace';
      ctx.fillText('SHIORI · CONNECT', canvas.width / 2, 65);
    }

    // 3. Draw QR Image
    const img = new Image();
    img.onload = () => {
      const qrSize = 380;
      const qrX = (canvas.width - qrSize) / 2;
      const qrY = 110;

      // Draw QR border frame
      ctx.strokeStyle = activeTemplate.darkColor;
      ctx.lineWidth = 2;
      ctx.strokeRect(qrX - 8, qrY - 8, qrSize + 16, qrSize + 16);

      ctx.drawImage(img, qrX, qrY, qrSize, qrSize);

      // 4. Draw User & ID details
      const idBoxY = 540;
      if (selectedTemplate === 'terminal') {
        ctx.fillStyle = '#065F46';
        ctx.fillRect(canvas.width / 2 - 160, idBoxY, 320, 56);
        ctx.fillStyle = '#34D399';
        ctx.font = 'bold 26px monospace';
        ctx.fillText(shioriId, canvas.width / 2, idBoxY + 38);

        ctx.fillStyle = '#A7F3D0';
        ctx.font = '16px monospace';
        ctx.fillText(userName ? `@${userName}` : 'SHIORI DEV', canvas.width / 2, idBoxY + 85);
      } else if (selectedTemplate === 'japanese') {
        ctx.fillStyle = '#E8E1D3';
        ctx.fillRect(canvas.width / 2 - 160, idBoxY, 320, 56);
        ctx.fillStyle = '#25282A';
        ctx.font = 'bold 26px monospace';
        ctx.fillText(shioriId, canvas.width / 2, idBoxY + 38);

        ctx.fillStyle = '#57534E';
        ctx.font = '16px serif';
        ctx.fillText(userName ? userName : 'SHIORI ID', canvas.width / 2, idBoxY + 85);
      } else {
        ctx.fillStyle = '#F1F5F9';
        ctx.fillRect(canvas.width / 2 - 160, idBoxY, 320, 56);
        ctx.fillStyle = '#0F172A';
        ctx.font = 'bold 26px monospace';
        ctx.fillText(shioriId, canvas.width / 2, idBoxY + 38);

        ctx.fillStyle = '#64748B';
        ctx.font = '16px sans-serif';
        ctx.fillText(userName ? userName : 'SHIORI DEVELOPER', canvas.width / 2, idBoxY + 85);
      }

      // 5. Footer Instructions
      ctx.fillStyle = selectedTemplate === 'terminal' ? '#6EE7B7' : '#94A3B8';
      ctx.font = '13px monospace';
      ctx.fillText('SCAN WITH CAMERA OR SHIORI APP TO CONNECT', canvas.width / 2, 700);

      // Trigger download
      const a = document.createElement('a');
      a.href = canvas.toDataURL('image/png');
      a.download = `shiori-${selectedTemplate}-${shioriId}.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    };
    img.src = qrDataUrl;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 select-none font-sans overflow-y-auto">
      <div className="fixed inset-0 bg-black/50 backdrop-blur-[2px]" onClick={onClose} />

      <div className="relative w-full max-w-md bg-eink-bg border border-eink-border shadow-2xl rounded-sm p-6 z-10 space-y-5 font-technical my-auto">
        {/* Modal Header */}
        <div className="flex items-center justify-between pb-3 border-b border-eink-border">
          <div className="flex items-center gap-2">
            <QrCode className="w-4 h-4 text-eink-text" />
            <h3 className="font-bold text-xs text-eink-text uppercase tracking-wider">
              SHIORI CONNECTION QR & TEMPLATES
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 hover:bg-eink-surface text-eink-textSecondary hover:text-eink-text rounded transition-colors"
            aria-label="Close modal"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Template Selector Bar */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-[10px] text-eink-textMuted uppercase font-bold tracking-wider">
            <span>CHOOSE QR TEMPLATE</span>
            <span className="flex items-center gap-1 text-eink-text">
              <Sparkles className="w-3 h-3 text-amber-500" />
              <span>{activeTemplate.name}</span>
            </span>
          </div>

          <div className="grid grid-cols-4 gap-1.5 p-1 bg-eink-surface border border-eink-border rounded-sm">
            {TEMPLATES.map((tmpl) => {
              const Icon = tmpl.icon;
              const isSelected = selectedTemplate === tmpl.id;
              return (
                <button
                  key={tmpl.id}
                  onClick={() => setSelectedTemplate(tmpl.id)}
                  className={`py-2 px-1 rounded-sm flex flex-col items-center justify-center gap-1 text-[10px] font-bold transition-all cursor-pointer ${
                    isSelected
                      ? 'bg-eink-text text-eink-bg shadow-eink-sm scale-[1.02]'
                      : 'text-eink-textMuted hover:text-eink-text hover:bg-eink-surfaceHover'
                  }`}
                  title={tmpl.tagline}
                >
                  <Icon className="w-3.5 h-3.5" />
                  <span className="truncate w-full text-center leading-tight">
                    {tmpl.name.split(' ')[0]}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Dynamic Styled QR Card Preview */}
        <div
          ref={cardRef}
          className={`p-5 rounded-sm border ${activeTemplate.borderColor} ${activeTemplate.cardBg} ${activeTemplate.textColor} shadow-md flex flex-col items-center justify-center text-center space-y-3 transition-colors duration-200 relative overflow-hidden`}
        >
          {/* Style watermark for Japanese & Terminal */}
          {selectedTemplate === 'japanese' && (
            <div className="absolute top-2 right-2 w-6 h-6 bg-red-700 text-white font-bold text-[9px] flex items-center justify-center rounded-xs shadow-xs">
              栞
            </div>
          )}
          {selectedTemplate === 'terminal' && (
            <div className="absolute top-2 left-2 text-[9px] font-mono text-emerald-500/60 uppercase">
              // SYS_QR_LINK
            </div>
          )}

          <span className="text-[10px] tracking-widest uppercase font-mono font-bold opacity-75">
            {selectedTemplate === 'terminal'
              ? 'DEV IDENTIFIER'
              : selectedTemplate === 'japanese'
              ? '栞 · 接続証'
              : 'SHIORI CONNECTION PASS'}
          </span>

          <div className="p-2.5 bg-white border border-black/10 rounded-sm shadow-inner flex items-center justify-center">
            {qrDataUrl ? (
              <img
                src={qrDataUrl}
                alt={`Connection QR Code for ${shioriId}`}
                className="w-48 h-48 object-contain select-none"
              />
            ) : (
              <div className="w-48 h-48 flex items-center justify-center text-xs text-stone-400">
                Generating QR...
              </div>
            )}
          </div>

          <div className="space-y-1">
            <div className="font-mono text-base font-bold tracking-wider px-3 py-0.5 rounded-sm inline-block border border-black/10 bg-black/5">
              {shioriId}
            </div>
            {userName && (
              <p className="text-xs opacity-80 pt-0.5 font-sans">
                {userName}
              </p>
            )}
          </div>

          <p className="text-[10px] opacity-70 max-w-xs font-sans">
            Scan with any camera or SHIORI scanner to connect instantly.
          </p>
        </div>

        {/* Actions */}
        <div className="pt-2 border-t border-eink-border flex flex-col gap-2">
          <button
            onClick={handleCopyLink}
            className="w-full py-2 px-3 bg-eink-text text-eink-bg text-xs font-bold rounded-sm flex items-center justify-center gap-2 hover:opacity-90 transition-opacity cursor-pointer"
          >
            {copiedLink ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
            <span>{copiedLink ? 'DIRECT INVITE LINK COPIED' : 'COPY DIRECT INVITE LINK'}</span>
          </button>

          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={handleDownloadCard}
              className="py-2 px-3 bg-eink-surface hover:bg-eink-surfaceHover border border-eink-border text-[11px] font-bold text-eink-text rounded-sm flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
              title="Download full styled card image as PNG"
            >
              <Download className="w-3.5 h-3.5" />
              <span>DOWNLOAD CARD</span>
            </button>

            <button
              onClick={onClose}
              className="py-2 px-3 bg-eink-surface hover:bg-eink-surfaceHover border border-eink-border text-[11px] font-bold text-eink-textSecondary rounded-sm flex items-center justify-center transition-colors cursor-pointer"
            >
              CLOSE
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
