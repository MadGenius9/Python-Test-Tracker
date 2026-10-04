import React, { useEffect, useRef, useState } from 'react';
import { Camera, X, Zap, ZapOff, ShieldAlert, AlertTriangle, Keyboard, CheckCircle2, Cpu } from 'lucide-react';
import { prepareZXingModule, readBarcodes, type ReaderOptions } from 'zxing-wasm/reader';
import zxingWasmUrl from 'zxing-wasm/reader/zxing_reader.wasm?url';
import { toGrayscale, applyCLAHE } from '../lib/imagePreprocessing';
import { ParsedTicketScan, selectBestCandidate } from '../lib/ticketUtils';
import { ProductCodeMapping } from '../types';

// Pre-configure WASM loading to always use the local bundled wasm binary (no CDN/network)
if (typeof window !== 'undefined') {
  try {
    prepareZXingModule({
      overrides: {
        locateFile: (path: string, prefix: string) => {
          if (path.endsWith('.wasm')) {
            return zxingWasmUrl;
          }
          return prefix + path;
        },
      },
    });
  } catch (err) {
    console.warn('ZXing WASM initialization error:', err);
  }
}

export interface ScanResult {
  rawValue: string;
  format: string;
  parsed: ParsedTicketScan;
  candidates?: ParsedTicketScan[];
  isAmbiguous?: boolean;
  winningScale?: string;
  engine?: string;
}

interface TicketScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onScan: (result: ScanResult) => void;
  title?: string;
  mappings?: ProductCodeMapping[];
}

// 9-rung ladder on long edge for still photos
const PHOTO_LADDER_RUNGS = [1600, 1400, 1200, 1000, 900, 800, 700, 600, 500];

// Live video scale ladder (cycled across successive frames for speed & coverage)
const VIDEO_LADDER_RUNGS = [1200, 1000, 900, 800, 700, 600, 500, 400];

// Support multiple barcode and 2D formats as specified in Bug 9
const readerOptions: ReaderOptions = {
  formats: ['QRCode', 'Code128', 'Code39', 'DataMatrix', 'PDF417'],
  tryHarder: true,
  tryRotate: true,
  tryInvert: true,
  maxNumberOfSymbols: 8,
};

const NATIVE_FORMATS = ['qr_code', 'code_128', 'code_39', 'data_matrix', 'pdf417'];

export default function TicketScannerModal({
  isOpen,
  onClose,
  onScan,
  title = 'SCAN SAND TICKET',
  mappings = [],
}: TicketScannerModalProps) {
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [hasTorch, setHasTorch] = useState<boolean>(false);
  const [isTorchOn, setIsTorchOn] = useState<boolean>(false);
  const [isInitializing, setIsInitializing] = useState<boolean>(true);
  const [showScanHint, setShowScanHint] = useState<boolean>(false);
  const [engineName, setEngineName] = useState<string>('ZXing WASM (C++ Engine)');
  const [currentLiveRung, setCurrentLiveRung] = useState<number>(800);
  const [lastDebugInfo, setLastDebugInfo] = useState<{ scale: string; rawValue: string; engine: string } | null>(null);
  const [isDecodingPhoto, setIsDecodingPhoto] = useState<boolean>(false);
  const [photoStepInfo, setPhotoStepInfo] = useState<string>('');
  const [photoDecodeError, setPhotoDecodeError] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const hintTimerRef = useRef<NodeJS.Timeout | null>(null);
  const barcodeDetectorRef = useRef<any>(null);
  const isDetectingFrameRef = useRef<boolean>(false);
  const isScanProcessingRef = useRef<boolean>(false);
  const lastRawValueRef = useRef<string>('');
  const lastScanTimeRef = useRef<number>(0);
  const ladderIndexRef = useRef<number>(0);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const scannerActiveRef = useRef<boolean>(false);

  useEffect(() => {
    if (!isOpen) {
      scannerActiveRef.current = false;
      stopCamera();
      return;
    }

    scannerActiveRef.current = true;
    setCameraError(null);
    setIsInitializing(true);
    setHasTorch(false);
    setIsTorchOn(false);
    setShowScanHint(false);
    setPhotoDecodeError(null);
    setIsDecodingPhoto(false);
    setPhotoStepInfo('');
    ladderIndexRef.current = 0;
    isScanProcessingRef.current = false;
    isDetectingFrameRef.current = false;

    // Check if BarcodeDetector is available natively in browser
    if (typeof window !== 'undefined' && 'BarcodeDetector' in window) {
      try {
        const detector = new (window as any).BarcodeDetector({ formats: NATIVE_FORMATS });
        barcodeDetectorRef.current = detector;
        setEngineName('BarcodeDetector (Native) + ZXing WASM');
      } catch (err) {
        barcodeDetectorRef.current = null;
        setEngineName('ZXing WASM (Bundled C++)');
      }
    } else {
      barcodeDetectorRef.current = null;
      setEngineName('ZXing WASM (Bundled C++)');
    }

    // Start 5-second timer for helpful scan hint if scan takes long
    hintTimerRef.current = setTimeout(() => {
      if (scannerActiveRef.current) {
        setShowScanHint(true);
      }
    }, 5000);

    // Start Video Stream
    startCamera();

    return () => {
      scannerActiveRef.current = false;
      stopCamera();
    };
  }, [isOpen]);

  const startCamera = async () => {
    try {
      const constraints: MediaStreamConstraints = {
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1920 },
          height: { ideal: 1080 },
          focusMode: { ideal: 'continuous' },
          advanced: [{ focusMode: 'continuous' }],
        } as unknown as MediaTrackConstraints,
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      if (!scannerActiveRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        if (!scannerActiveRef.current) return;
        setIsInitializing(false);

        // Check Torch capability
        const track = stream.getVideoTracks()[0];
        if (track) {
          const capabilities = track.getCapabilities ? (track.getCapabilities() as unknown as { torch?: boolean }) : {};
          if (capabilities.torch) {
            setHasTorch(true);
          }
        }

        // Start processing loop
        animFrameRef.current = requestAnimationFrame(processVideoFrame);
      }
    } catch (err) {
      if (!scannerActiveRef.current) return;
      setIsInitializing(false);
      console.error('Camera startup error:', err);
      setCameraError(
        'Camera access was denied or is unavailable. Use TAKE A PHOTO INSTEAD below or check permissions.'
      );
    }
  };

  const stopCamera = () => {
    scannerActiveRef.current = false;
    if (hintTimerRef.current) {
      clearTimeout(hintTimerRef.current);
      hintTimerRef.current = null;
    }
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => {
        try {
          track.stop();
        } catch (_) {}
      });
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  };

  // Helper to handle winning candidate(s)
  const handleWinningCandidates = (
    rawCandidates: { rawValue: string; format?: string }[],
    winningScale: string,
    engine: string
  ): boolean => {
    if (!scannerActiveRef.current) return false;
    if (!rawCandidates || rawCandidates.length === 0) return false;

    const bestResult = selectBestCandidate(rawCandidates, mappings);
    if (!bestResult.selected) return false;

    const rawJoined = rawCandidates.map((c) => c.rawValue).join(';');
    const now = Date.now();

    // Debounce duplicate identical scans within 1500ms
    if (lastRawValueRef.current === rawJoined && now - lastScanTimeRef.current < 1500) {
      return false;
    }

    lastRawValueRef.current = rawJoined;
    lastScanTimeRef.current = now;

    // Scan lock: prevent repeated frame processing
    isScanProcessingRef.current = true;

    if (scannerActiveRef.current) {
      setLastDebugInfo({
        scale: winningScale,
        rawValue: bestResult.selected.ticketNumber
          ? `#${bestResult.selected.ticketNumber}`
          : bestResult.selected.rawValue,
        engine,
      });
    }

    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      try {
        navigator.vibrate([100, 50, 100]);
      } catch (e) {}
    }

    stopCamera();

    onScan({
      rawValue: bestResult.selected.rawValue,
      format: bestResult.selected.format || 'QR_CODE',
      parsed: bestResult.selected,
      candidates: bestResult.candidates,
      isAmbiguous: bestResult.isAmbiguous,
      winningScale,
      engine,
    });

    return true;
  };

  // Live video frame processing: Cycles one ladder rung per frame
  const processVideoFrame = async () => {
    if (!scannerActiveRef.current) return;
    if (isScanProcessingRef.current) return;

    const video = videoRef.current;
    const detector = barcodeDetectorRef.current;

    if (!video || video.readyState !== video.HAVE_ENOUGH_DATA) {
      if (scannerActiveRef.current && !isScanProcessingRef.current) {
        animFrameRef.current = requestAnimationFrame(processVideoFrame);
      }
      return;
    }

    if (isDetectingFrameRef.current) {
      if (scannerActiveRef.current && !isScanProcessingRef.current) {
        animFrameRef.current = requestAnimationFrame(processVideoFrame);
      }
      return;
    }

    const vw = video.videoWidth;
    const vh = video.videoHeight;
    if (vw === 0 || vh === 0) {
      if (scannerActiveRef.current && !isScanProcessingRef.current) {
        animFrameRef.current = requestAnimationFrame(processVideoFrame);
      }
      return;
    }

    // Tighter guide box: 45% of narrower dimension
    const cropSize = Math.floor(Math.min(vw, vh) * 0.45);
    const sx = Math.floor((vw - cropSize) / 2);
    const sy = Math.floor((vh - cropSize) / 2);

    isDetectingFrameRef.current = true;

    try {
      if (!scannerActiveRef.current) return;

      // Pass 1: Browser Native BarcodeDetector (if supported)
      if (detector) {
        try {
          const codes = await detector.detect(video);
          if (codes && codes.length > 0) {
            const rawCandidates = codes
              .filter((c: any) => c && c.rawValue)
              .map((c: any) => ({ rawValue: c.rawValue, format: c.format || 'qr_code' }));

            if (rawCandidates.length > 0) {
              const handled = handleWinningCandidates(
                rawCandidates,
                'Full Native Video',
                'BarcodeDetector (Native)'
              );
              if (handled) return;
            }
          }
        } catch (err) {
          // Continue to ZXing WASM fallback
        }
      }

      if (!scannerActiveRef.current) return;

      // Pass 2: ZXing WASM Ladder — 1 rung per frame
      const currentRung = VIDEO_LADDER_RUNGS[ladderIndexRef.current];
      ladderIndexRef.current = (ladderIndexRef.current + 1) % VIDEO_LADDER_RUNGS.length;
      if (scannerActiveRef.current) {
        setCurrentLiveRung(currentRung);
      }

      if (!canvasRef.current) {
        canvasRef.current = document.createElement('canvas');
      }
      const canvas = canvasRef.current;
      canvas.width = currentRung;
      canvas.height = currentRung;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });

      if (ctx) {
        // Draw 45% tight crop scaled to current ladder rung
        ctx.drawImage(video, sx, sy, cropSize, cropSize, 0, 0, currentRung, currentRung);
        const rawImgData = ctx.getImageData(0, 0, currentRung, currentRung);

        // Attempt 1: Grayscale on this rung
        const grayData = toGrayscale(rawImgData);
        let results = await readBarcodes(grayData, readerOptions);

        if (!scannerActiveRef.current) return;

        // Attempt 2: If grayscale fails on this frame, try CLAHE contrast
        if (!results || results.length === 0 || !results.some((r) => r.text)) {
          const claheData = applyCLAHE(rawImgData, 3.0, 8, 8);
          results = await readBarcodes(claheData, readerOptions);
        }

        if (!scannerActiveRef.current) return;

        // Check if barcodes/QR codes decoded successfully
        if (results && results.length > 0) {
          const rawCandidates = results
            .filter((r) => r && r.text)
            .map((r) => ({ rawValue: r.text, format: r.format || 'QRCode' }));

          if (rawCandidates.length > 0) {
            const handled = handleWinningCandidates(
              rawCandidates,
              `${currentRung}px (45% Crop)`,
              'ZXing WASM'
            );
            if (handled) return;
          }
        }
      }
    } catch (err) {
      console.warn('Frame decode error:', err);
    } finally {
      isDetectingFrameRef.current = false;
    }

    if (scannerActiveRef.current && !isScanProcessingRef.current) {
      animFrameRef.current = requestAnimationFrame(processVideoFrame);
    }
  };

  // PHOTO PATH (FILE-PICKER FALLBACK): Thorough 18-step ladder (9 scales x Grayscale + CLAHE)
  const handlePhotoFallbackSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsDecodingPhoto(true);
    setPhotoDecodeError(null);
    setPhotoStepInfo('Loading image...');

    try {
      const img = new Image();
      const objectUrl = URL.createObjectURL(file);
      img.src = objectUrl;

      await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = () => reject(new Error('Could not load image file'));
      });

      const origW = img.naturalWidth || img.width || 1200;
      const origH = img.naturalHeight || img.height || 1200;
      const maxEdge = Math.max(origW, origH);

      // 1. Native BarcodeDetector first on full photo if available
      if (typeof window !== 'undefined' && 'BarcodeDetector' in window) {
        setPhotoStepInfo('Trying Native BarcodeDetector...');
        try {
          const detector = new (window as any).BarcodeDetector({ formats: NATIVE_FORMATS });
          const codes = await detector.detect(img);
          if (codes && codes.length > 0) {
            const rawCandidates = codes
              .filter((c: any) => c && c.rawValue)
              .map((c: any) => ({ rawValue: c.rawValue, format: c.format || 'qr_code' }));

            if (rawCandidates.length > 0) {
              URL.revokeObjectURL(objectUrl);
              const handled = handleWinningCandidates(
                rawCandidates,
                `Native Full Res (${origW}x${origH})`,
                'BarcodeDetector (Native)'
              );
              if (handled) {
                setIsDecodingPhoto(false);
                return;
              }
            }
          }
        } catch (err) {
          console.warn('Native photo detect failed, starting ZXing WASM ladder:', err);
        }
      }

      // 2. ZXing WASM Ladder: Try every rung [1600, 1400, 1200, 1000, 900, 800, 700, 600, 500]
      // Grayscale first, then CLAHE contrast (18 total attempts, stopping at first success)
      const workCanvas = document.createElement('canvas');
      const workCtx = workCanvas.getContext('2d', { willReadFrequently: true });
      if (!workCtx) throw new Error('Could not create canvas context');

      let totalAttempts = 0;
      for (const rung of PHOTO_LADDER_RUNGS) {
        const scale = rung / maxEdge;
        const targetW = Math.max(1, Math.round(origW * scale));
        const targetH = Math.max(1, Math.round(origH * scale));

        workCanvas.width = targetW;
        workCanvas.height = targetH;
        workCtx.drawImage(img, 0, 0, targetW, targetH);
        const rawImgData = workCtx.getImageData(0, 0, targetW, targetH);

        // Attempt A: Grayscale at this rung
        totalAttempts++;
        setPhotoStepInfo(`Testing ladder rung ${rung}px (Grayscale) [${totalAttempts}/18]...`);
        const grayData = toGrayscale(rawImgData);
        let results = await readBarcodes(grayData, readerOptions);

        if (results && results.length > 0) {
          const rawCandidates = results
            .filter((r) => r && r.text)
            .map((r) => ({ rawValue: r.text, format: r.format || 'QRCode' }));

          if (rawCandidates.length > 0) {
            URL.revokeObjectURL(objectUrl);
            const handled = handleWinningCandidates(
              rawCandidates,
              `${rung}px long-edge (Grayscale)`,
              'ZXing WASM'
            );
            if (handled) {
              setIsDecodingPhoto(false);
              return;
            }
          }
        }

        // Attempt B: CLAHE Contrast at this rung
        totalAttempts++;
        setPhotoStepInfo(`Testing ladder rung ${rung}px (CLAHE Contrast) [${totalAttempts}/18]...`);
        const claheData = applyCLAHE(rawImgData, 3.0, 8, 8);
        results = await readBarcodes(claheData, readerOptions);

        if (results && results.length > 0) {
          const rawCandidates = results
            .filter((r) => r && r.text)
            .map((r) => ({ rawValue: r.text, format: r.format || 'QRCode' }));

          if (rawCandidates.length > 0) {
            URL.revokeObjectURL(objectUrl);
            const handled = handleWinningCandidates(
              rawCandidates,
              `${rung}px long-edge (CLAHE)`,
              'ZXing WASM'
            );
            if (handled) {
              setIsDecodingPhoto(false);
              return;
            }
          }
        }
      }

      URL.revokeObjectURL(objectUrl);
      setPhotoDecodeError(
        'No barcode or QR code detected across all 18 scale & contrast ladder attempts (1600px - 500px). Ensure the code is centered, well-lit, and unblurred.'
      );
    } catch (err: any) {
      console.error('Error decoding photo:', err);
      setPhotoDecodeError(err?.message || 'Failed to process photo file.');
    } finally {
      setIsDecodingPhoto(false);
    }
  };

  const toggleTorch = async () => {
    if (!streamRef.current || !hasTorch) return;
    try {
      const track = streamRef.current.getVideoTracks()[0];
      if (track) {
        const nextState = !isTorchOn;
        await track.applyConstraints({
          advanced: [{ torch: nextState } as unknown as MediaTrackConstraintSet],
        });
        setIsTorchOn(nextState);
      }
    } catch (err) {
      console.warn('Torch toggle failed:', err);
    }
  };

  const handleClose = () => {
    stopCamera();
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-[#0b0c0e]/95 flex flex-col justify-between text-[#e8ebe6] p-4 overflow-hidden">
      {/* Top Bar */}
      <div className="flex items-center justify-between gap-4 max-w-xl mx-auto w-full z-10 pt-2 pb-1">
        <div className="flex items-center gap-2.5">
          <Camera className="w-6 h-6 text-[#d4a017]" />
          <div>
            <h2 className="text-base sm:text-lg font-bold uppercase tracking-wider text-[#e8ebe6] font-display">
              {title}
            </h2>
            {/* Live Engine & Debug Status */}
            <div className="text-[11px] font-mono text-[#9aa3ad] flex items-center gap-1.5 flex-wrap">
              <span className="w-2 h-2 rounded-full bg-[#8fa37a] animate-pulse shrink-0" />
              <span>{engineName}</span>
              <span className="text-[#d4a017] bg-[#291e0a] border border-[#d4a017]/40 px-1.5 py-0.5 rounded text-[10px]">
                Live: {currentLiveRung}px
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {hasTorch && (
            <button
              type="button"
              onClick={toggleTorch}
              className={`p-2.5 rounded-xl font-semibold text-xs flex items-center gap-2 border transition cursor-pointer ${
                isTorchOn
                  ? 'bg-[#d4a017] text-[#0b0c0e] border-[#d4a017] shadow-lg'
                  : 'bg-[#1b2027] text-[#e8ebe6] border-[#2a313b] hover:bg-[#2a313b]'
              }`}
              title="Toggle Flashlight / Torch"
            >
              {isTorchOn ? <Zap className="w-4 h-4 fill-[#0b0c0e]" /> : <ZapOff className="w-4 h-4 text-[#9aa3ad]" />}
              <span>{isTorchOn ? 'FLASH ON' : 'FLASH'}</span>
            </button>
          )}

          <button
            type="button"
            onClick={handleClose}
            className="bg-[#1b2027] hover:bg-[#2a313b] text-[#9aa3ad] hover:text-[#e8ebe6] p-2.5 rounded-xl border border-[#2a313b] flex items-center justify-center transition cursor-pointer"
            title="Cancel Scan"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Live Decoder Debug Line */}
      {lastDebugInfo && (
        <div className="max-w-xl mx-auto w-full bg-[#142319] border border-[#8fa37a]/50 rounded-xl px-3 py-1.5 text-[11px] font-mono text-[#8fa37a] flex items-center justify-between gap-2 shadow-lg">
          <div className="flex items-center gap-1.5 truncate">
            <CheckCircle2 className="w-3.5 h-3.5 text-[#8fa37a] shrink-0" />
            <span className="font-semibold text-[#d4a017]">[{lastDebugInfo.scale}]</span>
            <span className="truncate">{lastDebugInfo.rawValue}</span>
          </div>
          <span className="text-[10px] text-[#8fa37a] shrink-0 font-semibold">DECODED</span>
        </div>
      )}

      {/* Camera Viewfinder Area */}
      <div className="flex-1 flex flex-col items-center justify-center relative my-2 max-w-xl mx-auto w-full">
        {cameraError ? (
          <div className="bg-[#14171c] border border-[#c23b32]/60 rounded-2xl p-6 text-center space-y-4 max-w-md w-full shadow-2xl">
            <div className="w-14 h-14 bg-[#260e0c] text-[#e25a4a] rounded-xl flex items-center justify-center mx-auto border border-[#c23b32]/40">
              <ShieldAlert className="w-8 h-8 stroke-[2]" />
            </div>
            <div>
              <h3 className="text-xl font-bold uppercase font-display text-[#e25a4a]">
                LIVE CAMERA UNAVAILABLE
              </h3>
              <p className="text-xs text-[#9aa3ad] mt-2 leading-relaxed">
                {cameraError}
              </p>
            </div>
            <div className="space-y-2 pt-2">
              <label className="w-full bg-[#c23b32] hover:bg-[#e25a4a] text-[#e8ebe6] font-semibold py-3.5 px-4 rounded-xl shadow-xl uppercase tracking-wider text-xs sm:text-sm transition flex items-center justify-center gap-2 cursor-pointer">
                <Camera className="w-5 h-5" />
                <span>TAKE A PHOTO INSTEAD</span>
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={handlePhotoFallbackSelect}
                  className="hidden"
                />
              </label>

              <button
                type="button"
                onClick={handleClose}
                className="w-full bg-[#1b2027] hover:bg-[#2a313b] text-[#e8ebe6] font-semibold py-3 px-4 rounded-xl uppercase tracking-wider text-xs transition flex items-center justify-center gap-2 border border-[#2a313b] cursor-pointer"
              >
                <Keyboard className="w-4 h-4 text-[#9aa3ad]" />
                <span>TYPE NUMBER MANUALLY</span>
              </button>
            </div>
          </div>
        ) : (
          <div className="relative w-full h-full max-h-[500px] bg-[#0b0c0e] rounded-2xl overflow-hidden border border-[#2a313b] shadow-2xl flex items-center justify-center">
            {/* HTML Video Stream */}
            <video
              ref={videoRef}
              playsInline
              muted
              className="w-full h-full object-cover"
            />

            {/* Target Viewfinder Overlay: 45% tight crop with explicit instruction */}
            <div className="absolute inset-0 pointer-events-none flex flex-col items-center justify-center">
              <div className="w-[200px] h-[200px] max-w-[45%] max-h-[45%] aspect-square border-2 border-[#d4a017]/90 rounded-xl relative shadow-[0_0_0_9999px_rgba(11,12,14,0.72)]">
                {/* Corner Markers */}
                <div className="absolute -top-1 -left-1 w-5 h-5 border-t-2 border-l-2 border-[#d4a017] rounded-tl" />
                <div className="absolute -top-1 -right-1 w-5 h-5 border-t-2 border-r-2 border-[#d4a017] rounded-tr" />
                <div className="absolute -bottom-1 -left-1 w-5 h-5 border-b-2 border-l-2 border-[#d4a017] rounded-bl" />
                <div className="absolute -bottom-1 -right-1 w-5 h-5 border-b-2 border-r-2 border-[#d4a017] rounded-br" />

                {/* Laser scan line effect */}
                <div className="absolute left-2 right-2 top-1/2 h-0.5 bg-[#c23b32] shadow-[0_0_8px_rgba(194,59,50,0.8)] opacity-80" />
              </div>

              <div className="mt-3 bg-[#14171c]/95 border border-[#2a313b] text-[#d4a017] text-xs font-semibold uppercase tracking-wider px-3.5 py-1.5 rounded-lg text-center shadow-2xl">
                Align ticket QR / Barcode inside box
              </div>
            </div>

            {/* Photo decode progress overlay */}
            {isDecodingPhoto && (
              <div className="absolute inset-0 bg-[#0b0c0e]/95 backdrop-blur-md z-30 flex flex-col items-center justify-center gap-3 p-6 text-center">
                <div className="w-10 h-10 border-3 border-[#c23b32] border-t-transparent rounded-full animate-spin" />
                <div className="text-sm font-bold text-[#e8ebe6] uppercase tracking-wide font-display">
                  Processing Photo with Scale Ladder...
                </div>
                <div className="text-xs text-[#d4a017] font-mono bg-[#14171c] px-3 py-1.5 rounded-lg border border-[#2a313b]">
                  {photoStepInfo || 'Running 18-step ZXing WASM scale & contrast ladder'}
                </div>
                <p className="text-[11px] text-[#9aa3ad] max-w-xs">
                  Testing 1600, 1400, 1200, 1000, 900, 800, 700, 600, 500 px with CLAHE contrast enhancement
                </p>
              </div>
            )}

            {/* Photo decode error banner */}
            {photoDecodeError && (
              <div className="absolute bottom-4 inset-x-4 bg-[#260e0c] text-[#e8ebe6] p-4 rounded-xl border border-[#c23b32]/60 shadow-2xl space-y-2 z-30">
                <div className="flex items-center gap-2 font-semibold text-xs uppercase text-[#e25a4a]">
                  <AlertTriangle className="w-4 h-4 shrink-0 stroke-[2]" />
                  <span>{photoDecodeError}</span>
                </div>
                <div className="flex items-center gap-2 pt-1">
                  <label className="flex-1 bg-[#c23b32] hover:bg-[#e25a4a] text-[#e8ebe6] font-semibold text-xs py-2 px-3 rounded-lg flex items-center justify-center gap-1.5 uppercase cursor-pointer shadow">
                    <Camera className="w-4 h-4" /> RETAKE PHOTO
                    <input
                      type="file"
                      accept="image/*"
                      capture="environment"
                      onChange={handlePhotoFallbackSelect}
                      className="hidden"
                    />
                  </label>
                  <button
                    type="button"
                    onClick={() => setPhotoDecodeError(null)}
                    className="bg-[#14171c] text-[#9aa3ad] hover:text-[#e8ebe6] font-semibold text-xs py-2 px-3 rounded-lg border border-[#2a313b] cursor-pointer"
                  >
                    DISMISS
                  </button>
                </div>
              </div>
            )}

            {/* Helpful Scan Hint Banner (if scan takes > 5 seconds) */}
            {showScanHint && !photoDecodeError && !isDecodingPhoto && (
              <div className="absolute bottom-4 inset-x-4 bg-[#14171c] text-[#e8ebe6] p-4 rounded-xl border border-[#d4a017]/60 shadow-2xl space-y-2.5 z-20">
                <div className="flex items-center gap-2 font-semibold text-xs uppercase text-[#d4a017]">
                  <AlertTriangle className="w-4 h-4 shrink-0 stroke-[2]" />
                  <span>Trouble scanning curved thermal paper? Try taking a photo</span>
                </div>
                <div className="flex items-center gap-2">
                  <label className="flex-1 bg-[#c23b32] hover:bg-[#e25a4a] text-[#e8ebe6] font-semibold text-xs py-2.5 px-3 rounded-lg flex items-center justify-center gap-1.5 uppercase cursor-pointer shadow-lg">
                    <Camera className="w-4 h-4" /> TAKE A PHOTO INSTEAD
                    <input
                      type="file"
                      accept="image/*"
                      capture="environment"
                      onChange={handlePhotoFallbackSelect}
                      className="hidden"
                    />
                  </label>
                  <button
                    type="button"
                    onClick={handleClose}
                    className="bg-[#1b2027] text-[#9aa3ad] hover:text-[#e8ebe6] font-semibold text-xs py-2.5 px-3 rounded-lg border border-[#2a313b] cursor-pointer"
                  >
                    TYPE NUMBER
                  </button>
                </div>
              </div>
            )}

            {isInitializing && (
              <div className="absolute inset-0 bg-[#0b0c0e] flex items-center justify-center gap-3">
                <div className="w-6 h-6 border-2 border-[#c23b32] border-t-transparent rounded-full animate-spin" />
                <span className="text-xs font-semibold uppercase text-[#9aa3ad]">
                  Starting Camera & ZXing Engine...
                </span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Bottom Action Controls */}
      <div className="max-w-xl mx-auto w-full z-10 pt-2 pb-3 space-y-2">
        {/* TAKE A PHOTO INSTEAD PROMINENT BUTTON */}
        <label className="w-full bg-[#c23b32] hover:bg-[#e25a4a] text-[#e8ebe6] font-semibold text-sm sm:text-base py-3.5 px-4 rounded-xl shadow-xl flex items-center justify-center gap-2 cursor-pointer transition uppercase tracking-wider">
          <Camera className="w-5 h-5" />
          <span>TAKE A PHOTO INSTEAD</span>
          <input
            type="file"
            accept="image/*"
            capture="environment"
            onChange={handlePhotoFallbackSelect}
            className="hidden"
          />
        </label>

        <button
          type="button"
          onClick={handleClose}
          className="w-full bg-[#1b2027] hover:bg-[#2a313b] text-[#9aa3ad] hover:text-[#e8ebe6] font-semibold text-xs sm:text-sm py-3 rounded-xl border border-[#2a313b] transition tracking-wider uppercase flex items-center justify-center gap-2 cursor-pointer"
        >
          <X className="w-4 h-4" />
          <span>CANCEL SCAN</span>
        </button>
      </div>
    </div>
  );
}
