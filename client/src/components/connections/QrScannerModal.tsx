import React, { useEffect, useRef, useState } from 'react';
import { X, Camera, Upload, AlertCircle, CheckCircle2, RefreshCw } from 'lucide-react';
import jsQR from 'jsqr';

interface QrScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onScanSuccess: (shioriId: string) => void;
}

export const QrScannerModal: React.FC<QrScannerModalProps> = ({
  isOpen,
  onClose,
  onScanSuccess
}) => {
  const [mode, setMode] = useState<'camera' | 'upload'>('camera');
  const [cameraError, setCameraError] = useState<string>('');
  const [isScanning, setIsScanning] = useState<boolean>(false);
  const [detectedId, setDetectedId] = useState<string>('');
  const [uploadError, setUploadError] = useState<string>('');

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const animationFrameRef = useRef<number | null>(null);

  // Helper to extract SHIORI ID from scanned text / URL
  const extractShioriId = (text: string): string | null => {
    const raw = text.trim();
    // Case 1: Direct URL with ?add=...
    try {
      const url = new URL(raw);
      const addParam = url.searchParams.get('add');
      if (addParam) return addParam.trim().toUpperCase();
    } catch {}

    // Case 2: SHI-XXXX pattern (e.g. SHI-3A91M, SHI-A001)
    const match = raw.match(/SHI-[A-Za-z0-9]+/i);
    if (match) return match[0].toUpperCase();

    // Case 3: JSON payload
    try {
      const parsed = JSON.parse(raw);
      if (parsed.shioriId) return String(parsed.shioriId).toUpperCase();
      if (parsed.id && String(parsed.id).startsWith('SHI-')) return String(parsed.id).toUpperCase();
    } catch {}

    return null;
  };

  // Stop camera tracks cleanly
  const stopCamera = () => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    setIsScanning(false);
  };

  // Start live camera stream
  const startCamera = async () => {
    setCameraError('');
    setDetectedId('');
    stopCamera();

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setCameraError('Camera access is not supported on this browser/device.');
      setMode('upload');
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 640 }, height: { ideal: 480 } }
      });
      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.setAttribute('playsinline', 'true');
        await videoRef.current.play();
        setIsScanning(true);
        scanFrame();
      }
    } catch (err: any) {
      console.warn('[QR SCANNER] Camera access failed:', err);
      setCameraError(err.name === 'NotAllowedError'
        ? 'Camera permission denied. Please enable camera access or upload an image.'
        : 'Could not access device camera. Try uploading an image instead.'
      );
      setMode('upload');
    }
  };

  // Loop to process video frames with jsQR
  const scanFrame = () => {
    if (!videoRef.current || !canvasRef.current || videoRef.current.readyState !== videoRef.current.HAVE_ENOUGH_DATA) {
      animationFrameRef.current = requestAnimationFrame(scanFrame);
      return;
    }

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });

    if (!ctx) {
      animationFrameRef.current = requestAnimationFrame(scanFrame);
      return;
    }

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const code = jsQR(imageData.data, imageData.width, imageData.height, {
      inversionAttempts: 'dontInvert'
    });

    if (code && code.data) {
      const parsedId = extractShioriId(code.data);
      if (parsedId) {
        setDetectedId(parsedId);
        stopCamera();
        // Give short confirmation feedback then trigger
        setTimeout(() => {
          onScanSuccess(parsedId);
          onClose();
        }, 500);
        return;
      }
    }

    animationFrameRef.current = requestAnimationFrame(scanFrame);
  };

  // Handle image file upload
  const handleFileUpload = (file: File) => {
    setUploadError('');
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (!ctx) {
          setUploadError('Could not initialize canvas decoder.');
          return;
        }

        ctx.drawImage(img, 0, 0);
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const code = jsQR(imageData.data, imageData.width, imageData.height, {
          inversionAttempts: 'attemptBoth'
        });

        if (code && code.data) {
          const parsedId = extractShioriId(code.data);
          if (parsedId) {
            setDetectedId(parsedId);
            setTimeout(() => {
              onScanSuccess(parsedId);
              onClose();
            }, 500);
          } else {
            setUploadError(`Scanned code: "${code.data.substring(0, 40)}" is not a valid SHIORI ID.`);
          }
        } else {
          setUploadError('No valid QR code found in this image. Ensure the code is clearly visible.');
        }
      };
      img.src = e.target?.result as string;
    };
    reader.readAsDataURL(file);
  };

  useEffect(() => {
    if (isOpen) {
      if (mode === 'camera') {
        startCamera();
      }
    } else {
      stopCamera();
      setDetectedId('');
      setUploadError('');
      setCameraError('');
    }

    return () => {
      stopCamera();
    };
  }, [isOpen, mode]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 select-none font-sans">
      <div className="fixed inset-0 bg-black/50 backdrop-blur-[2px]" onClick={onClose} />

      <div className="relative w-full max-w-sm bg-eink-bg border border-eink-border shadow-2xl rounded-sm p-5 z-10 space-y-4 font-technical">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-eink-border">
          <div className="flex items-center gap-2">
            <Camera className="w-4 h-4 text-eink-text" />
            <h3 className="font-bold text-xs text-eink-text uppercase tracking-wider">
              SCAN CONNECTION QR
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 hover:bg-eink-surface text-eink-textSecondary hover:text-eink-text rounded transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tab Controls (Camera vs Upload) */}
        <div className="grid grid-cols-2 p-1 bg-eink-surface border border-eink-border rounded-sm text-xs">
          <button
            onClick={() => {
              setMode('camera');
              setUploadError('');
            }}
            className={`py-1.5 font-bold rounded-sm flex items-center justify-center gap-1.5 transition-colors cursor-pointer ${
              mode === 'camera'
                ? 'bg-eink-text text-eink-bg shadow-eink-sm'
                : 'text-eink-textMuted hover:text-eink-text'
            }`}
          >
            <Camera className="w-3.5 h-3.5" />
            <span>CAMERA</span>
          </button>
          <button
            onClick={() => {
              stopCamera();
              setMode('upload');
            }}
            className={`py-1.5 font-bold rounded-sm flex items-center justify-center gap-1.5 transition-colors cursor-pointer ${
              mode === 'upload'
                ? 'bg-eink-text text-eink-bg shadow-eink-sm'
                : 'text-eink-textMuted hover:text-eink-text'
            }`}
          >
            <Upload className="w-3.5 h-3.5" />
            <span>UPLOAD IMAGE</span>
          </button>
        </div>

        {/* Content Area */}
        {mode === 'camera' ? (
          <div className="space-y-3">
            <div className="relative w-full aspect-square bg-black rounded-sm overflow-hidden border border-eink-border flex items-center justify-center">
              <video
                ref={videoRef}
                className="w-full h-full object-cover"
                playsInline
                muted
              />
              <canvas ref={canvasRef} className="hidden" />

              {/* Viewfinder Target Graphic */}
              <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                <div className="relative w-48 h-48 border-2 border-dashed border-white/60 rounded-md">
                  <div className="absolute -top-1 -left-1 w-4 h-4 border-t-2 border-l-2 border-white" />
                  <div className="absolute -top-1 -right-1 w-4 h-4 border-t-2 border-r-2 border-white" />
                  <div className="absolute -bottom-1 -left-1 w-4 h-4 border-b-2 border-l-2 border-white" />
                  <div className="absolute -bottom-1 -right-1 w-4 h-4 border-b-2 border-r-2 border-white" />

                  {/* Animated laser scan line */}
                  {isScanning && !detectedId && (
                    <div className="absolute inset-x-0 h-0.5 bg-emerald-400 shadow-[0_0_8px_#34d399] animate-pulse top-1/2" />
                  )}
                </div>
              </div>

              {/* Detected ID Notification */}
              {detectedId && (
                <div className="absolute inset-0 bg-black/80 flex flex-col items-center justify-center text-white space-y-2 p-4 text-center">
                  <CheckCircle2 className="w-10 h-10 text-emerald-400 animate-bounce" />
                  <p className="text-xs uppercase font-bold tracking-widest text-emerald-300">
                    SHIORI ID DETECTED
                  </p>
                  <p className="text-sm font-mono font-bold bg-white/10 px-3 py-1 rounded border border-white/20">
                    {detectedId}
                  </p>
                </div>
              )}
            </div>

            <p className="text-[11px] text-eink-textMuted text-center font-sans">
              Point your camera at a teammate's SHIORI QR code to connect.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            <label
              htmlFor="qr-file-input"
              className="w-full aspect-square border-2 border-dashed border-eink-border bg-eink-surface hover:bg-eink-surfaceHover rounded-sm flex flex-col items-center justify-center p-6 text-center cursor-pointer transition-colors"
            >
              <Upload className="w-8 h-8 text-eink-textSecondary mb-2" />
              <span className="text-xs font-bold text-eink-text block">
                DROP QR CODE IMAGE HERE
              </span>
              <span className="text-[11px] text-eink-textMuted mt-1 block">
                or click to choose a screenshot / photo
              </span>
              <input
                id="qr-file-input"
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleFileUpload(file);
                }}
              />
            </label>

            {detectedId && (
              <div className="p-3 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-300 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300 rounded-sm text-xs flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>Found SHIORI ID: <strong>{detectedId}</strong></span>
              </div>
            )}

            {uploadError && (
              <div className="p-2.5 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 rounded-sm text-[11px] flex items-center gap-2 font-sans">
                <AlertCircle className="w-4 h-4 shrink-0 text-red-500" />
                <span>{uploadError}</span>
              </div>
            )}
          </div>
        )}

        {/* Footer */}
        <div className="pt-2 border-t border-eink-border flex justify-between items-center">
          {mode === 'camera' && (
            <button
              onClick={() => startCamera()}
              className="text-[11px] text-eink-textSecondary hover:text-eink-text flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <RefreshCw className="w-3 h-3" />
              <span>Restart Camera</span>
            </button>
          )}
          <button
            onClick={onClose}
            className="ml-auto py-1.5 px-4 bg-eink-surface hover:bg-eink-surfaceHover border border-eink-border text-xs font-bold text-eink-text rounded-sm transition-colors cursor-pointer"
          >
            CANCEL
          </button>
        </div>
      </div>
    </div>
  );
};
