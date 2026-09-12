import React, { useEffect, useState } from 'react';
import { X, QrCode, Copy, Check, Download, Share2 } from 'lucide-react';
import QRCode from 'qrcode';

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
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const [copiedLink, setCopiedLink] = useState(false);

  const inviteUrl = typeof window !== 'undefined'
    ? `${window.location.origin}/connections?add=${encodeURIComponent(shioriId)}`
    : `https://shiori.app/connections?add=${encodeURIComponent(shioriId)}`;

  useEffect(() => {
    if (!isOpen || !shioriId) return;

    QRCode.toDataURL(inviteUrl, {
      width: 280,
      margin: 2,
      color: {
        dark: '#111111',
        light: '#FFFFFF'
      },
      errorCorrectionLevel: 'H'
    })
      .then((url) => setQrDataUrl(url))
      .catch((err) => console.error('Failed to render QR Code:', err));
  }, [isOpen, shioriId, inviteUrl]);

  if (!isOpen) return null;

  const handleCopyLink = () => {
    navigator.clipboard.writeText(inviteUrl);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2500);
  };

  const handleDownloadQr = () => {
    if (!qrDataUrl) return;
    const a = document.createElement('a');
    a.href = qrDataUrl;
    a.download = `shiori-connection-${shioriId}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 select-none font-sans">
      <div className="fixed inset-0 bg-black/40 backdrop-blur-[2px]" onClick={onClose} />

      <div className="relative w-full max-w-sm bg-eink-bg border border-eink-border shadow-2xl rounded-sm p-6 z-10 space-y-5 font-technical">
        {/* Modal Header */}
        <div className="flex items-center justify-between pb-3 border-b border-eink-border">
          <div className="flex items-center gap-2">
            <QrCode className="w-4 h-4 text-eink-text" />
            <h3 className="font-bold text-xs text-eink-text uppercase tracking-wider">
              CONNECTION QR CODE
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

        {/* QR Code Presentation Box */}
        <div className="flex flex-col items-center justify-center text-center space-y-4">
          <div className="p-3 bg-white border border-eink-border rounded-sm shadow-sm flex items-center justify-center">
            {qrDataUrl ? (
              <img
                src={qrDataUrl}
                alt={`Connection QR Code for ${shioriId}`}
                className="w-56 h-56 object-contain select-none"
              />
            ) : (
              <div className="w-56 h-56 flex items-center justify-center text-xs text-stone-400">
                Generating QR...
              </div>
            )}
          </div>

          <div className="space-y-1">
            <span className="text-[10px] uppercase font-bold text-eink-textMuted tracking-wider block">
              SHIORI ID
            </span>
            <div className="font-mono text-base font-bold text-eink-text bg-eink-surface px-3 py-1 border border-eink-border rounded-sm inline-block tracking-wider">
              {shioriId}
            </div>
            {userName && (
              <p className="text-xs text-eink-textSecondary pt-0.5">
                {userName}
              </p>
            )}
          </div>

          <p className="text-[11px] text-eink-textMuted leading-relaxed max-w-xs font-sans">
            Teammates can scan this QR code using their camera to automatically connect with you on SHIORI.
          </p>
        </div>

        {/* Actions */}
        <div className="pt-2 border-t border-eink-border flex flex-col gap-2">
          <button
            onClick={handleCopyLink}
            className="w-full py-2 px-3 bg-eink-text text-eink-bg text-xs font-bold rounded-sm flex items-center justify-center gap-2 hover:opacity-90 transition-opacity cursor-pointer"
          >
            {copiedLink ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
            <span>{copiedLink ? 'INVITE LINK COPIED' : 'COPY DIRECT INVITE LINK'}</span>
          </button>

          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={handleDownloadQr}
              className="py-1.5 px-3 bg-eink-surface hover:bg-eink-surfaceHover border border-eink-border text-[11px] font-bold text-eink-text rounded-sm flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              <span>DOWNLOAD PNG</span>
            </button>

            <button
              onClick={onClose}
              className="py-1.5 px-3 bg-eink-surface hover:bg-eink-surfaceHover border border-eink-border text-[11px] font-bold text-eink-textSecondary rounded-sm flex items-center justify-center transition-colors cursor-pointer"
            >
              CLOSE
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
