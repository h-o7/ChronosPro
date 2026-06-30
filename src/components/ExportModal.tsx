/**
 * ExportModal.tsx - Professional High-Bitrate Timelapse Compiler & Video Encoder
 * 
 * This component runs the core compiler pipelines. It supports:
 * 1. Zipped Frame Archives (frames-zip): Sequential JPEGs are resized, compressed 
 *    at 98% visual quality, and zipped with 4-digit zero-padding format matching pro tools.
 * 2. High-Bitrate Hardware Video Encoding (mp4/webm): Integrates HTML5 canvas.captureStream()
 *    with browser MediaRecorder API. Features:
 *    - Intelligent automatic codec compatibility check (H.264/AVC inside MP4 vs. VP8/VP9 inside WebM).
 *    - Automatic safe fallback handling if platform blocks MP4 containers.
 *    - Enforced even resolutions to fit rigid H.264 video specs.
 *    - Custom target bitrates up to 95 Mbps matching studio standards.
 *    - Sequential, slow-drain memory canvas drawing with forced GPU raster flushes (ctx.getImageData).
 */

import React, { useEffect, useState, useRef } from 'react';
import { TimelapseFrame, ExportSettings } from '../types';
import { Play, Pause, XCircle, HardDriveDownload, Sparkles, CheckCircle2, Video, FileArchive, ShieldAlert } from 'lucide-react';
import JSZip from 'jszip';

interface ExportModalProps {
  /** True if compilation modal wrapper is visible in view */
  isOpen: boolean;
  /** Close callback dismissing state */
  onClose: () => void;
  /** Sequence frames loaded on timeline */
  frames: TimelapseFrame[];
  /** Export settings (aspect, resolutions, bitrates) */
  settings: ExportSettings;
  /** Logs status messages into WorkLog Console */
  addLog: (message: string, type?: 'info' | 'success' | 'warn' | 'error') => void;
}

export default function ExportModal({ isOpen, onClose, frames, settings, addLog }: ExportModalProps) {
  const [exporting, setExporting] = useState(false);
  const [complete, setComplete] = useState(false);
  const [progress, setProgress] = useState(0);
  const [total, setTotal] = useState(0);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [actualExt, setActualExt] = useState<string>('mp4');
  const [fallbackFormatUsed, setFallbackFormatUsed] = useState<boolean>(false);
  
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const isMountedRef = useRef(true);
  const activeStreamRef = useRef<MediaStream | null>(null);
  const activeRecorderRef = useRef<MediaRecorder | null>(null);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      
      // Stop stream tracks and recorder if unmounting while active
      if (activeRecorderRef.current && activeRecorderRef.current.state !== 'inactive') {
        try {
          activeRecorderRef.current.stop();
        } catch (e) {
          console.warn('Error stopping active recorder during unmount:', e);
        }
      }
      if (activeStreamRef.current) {
        try {
          activeStreamRef.current.getTracks().forEach((track) => track.stop());
        } catch (e) {
          console.warn('Error stopping active video stream tracks during unmount:', e);
        }
      }
      
      if (downloadUrl) {
        URL.revokeObjectURL(downloadUrl);
      }
    };
  }, [downloadUrl]);

  if (!isOpen) return null;

  // Compile frames according to speed multiplier
  const filteredFrames: TimelapseFrame[] = [];
  for (let i = 0; i < frames.length; i += settings.speedMultiplier) {
    filteredFrames.push(frames[i]);
  }

  const startCompilation = async () => {
    setErrorMsg(null);
    setComplete(false);
    setExporting(true);
    setProgress(0);
    setTotal(filteredFrames.length);

    addLog(`Starting compilation sequence of ${filteredFrames.length} frames...`, 'info');
    addLog(`Settings: ${settings.resolutionWidth}x${settings.resolutionHeight} px, ${settings.frameRate} FPS, Speed: ${settings.speedMultiplier}x, Format: ${settings.exportFormat.toUpperCase()}`, 'info');

    try {
      if (settings.exportFormat === 'frames-zip') {
        await compileZip();
      } else {
        await compileVideo();
      }
    } catch (err: any) {
      console.error(err);
      const msg = err.message || 'An unexpected compilation error occurred.';
      addLog(`Compilation failed: ${msg}`, 'error');
      setErrorMsg(msg);
      setExporting(false);
    }
  };

  /**
   * Pipeline 1: Sequential Static Image Packager (ZIP)
   * Renders frames onto canvas, exports to JPEG blob (98%), and adds to JSZip
   */
  const compileZip = async () => {
    const zip = new JSZip();
    addLog(`Initiating sequence packaging to ZIP archive...`, 'info');
    
    // Wait slightly to let React mount the on-screen canvas ref
    await new Promise((resolve) => setTimeout(resolve, 150));
    const canvas = canvasRef.current;
    if (!canvas) throw new Error('Could not find active compilation preview canvas ref.');
    const ctx = canvas.getContext('2d');
    
    if (!ctx) throw new Error('Could not instantiate hidden canvas 2D rendering context.');

    for (let i = 0; i < filteredFrames.length; i++) {
      if (!isMountedRef.current) return;
      setProgress(i + 1);
      const frame = filteredFrames[i];
      
      // Draw image onto canvas with scaling to make standard fit
      await drawFrameToHiddenCanvas(frame, canvas, ctx);
      
      // Convert canvas drawing to high-quality JPEG blob (98% quality for visually lossless results)
      const blob = await new Promise<Blob | null>((resolve) => {
        canvas.toBlob((b) => resolve(b), 'image/jpeg', 0.98);
      });

      if (blob) {
        // Pad sequence numbering: e.g. frame_0001.jpg
        const paddedIndex = String(i + 1).padStart(4, '0');
        zip.file(`frame_${paddedIndex}.jpg`, blob);
        
        if (i % 5 === 0 || i === filteredFrames.length - 1) {
          addLog(`[ZIP] Wrapped frame ${i + 1}/${filteredFrames.length}: "${frame.name}" (${frame.width || 'unknown'}x${frame.height || 'unknown'})`, 'info');
        }
      }
      
      // Yield to main thread periodically so browser UI doesn't lock up
      await new Promise((resolve) => requestAnimationFrame(resolve));
    }

    addLog(`Creating zipped stream...`, 'info');
    const zipBlob = await zip.generateAsync({ type: 'blob' }, (metadata) => {
      // Scale zip compression progress as well
    });

    addLog(`ZIP sequence package built successfully. Total size: ${(zipBlob.size / (1024 * 1024)).toFixed(2)} MB.`, 'success');

    const url = URL.createObjectURL(zipBlob);
    setDownloadUrl(url);
    setComplete(true);
    setExporting(false);
  };

  // Preload helper to cache all frames inside memory before recording starts
  const preloadFrameImages = async (framesToPreload: TimelapseFrame[]): Promise<HTMLImageElement[]> => {
    const promises = framesToPreload.map((frame) => {
      return new Promise<HTMLImageElement>((resolve) => {
        const img = new Image();
        img.src = frame.previewUrl;
        img.onload = () => resolve(img);
        img.onerror = () => resolve(img); // Resolve anyway as fallback to not crash compilation
      });
    });
    return Promise.all(promises);
  };

  // Helper to draw a preloaded image onto canvas synchronously
  const drawPreloadedImageToCanvas = (img: HTMLImageElement, frame: TimelapseFrame, canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D) => {
    // Fill deep off-black background matching players
    ctx.fillStyle = '#0a0a0c';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    if (!img || !img.complete || img.naturalWidth === 0) {
      // Draw visible error placeholder
      ctx.fillStyle = '#7f1d1d';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = '#fca5a5';
      ctx.font = '16px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(`Error rendering: ${frame.name}`, canvas.width / 2, canvas.height / 2);
      return;
    }

    const imgW = img.naturalWidth || frame.width || 1;
    const imgH = img.naturalHeight || frame.height || 1;
    const targetRatio = imgW / imgH;

    let renderW = canvas.width;
    let renderH = canvas.width / targetRatio;

    if (renderH > canvas.height) {
      renderH = canvas.height;
      renderW = canvas.height * targetRatio;
    }

    const xOffset = (canvas.width - renderW) / 2;
    const yOffset = (canvas.height - renderH) / 2;

    ctx.drawImage(img, xOffset, yOffset, renderW, renderH);
  };

  /**
   * Pipeline 2: Hardware Video Compilation (MP4 / WebM container streams)
   * Streams canvas context frames via requestAnimationFrame sequences directly to browser's MediaRecorder
   */
  const compileVideo = async () => {
    // Wait slightly to let React mount the on-screen canvas ref
    await new Promise((resolve) => setTimeout(resolve, 200));
    const canvas = canvasRef.current;
    if (!canvas) throw new Error('Could not find active compilation preview canvas ref.');
    const ctx = canvas.getContext('2d');
    
    if (!ctx) throw new Error('Could not instantiate video capture canvas rendering context.');

    try {
      // Find supported container (MP4 or WebM) based on user settings
      let typesSupported: string[] = [];
      const userWantsMP4 = settings.exportFormat === 'mp4';

      if (userWantsMP4) {
        typesSupported = [
          'video/mp4;codecs=h264',
          'video/mp4;codecs=avc1',
          'video/mp4',
        ];
      } else {
        typesSupported = [
          'video/webm;codecs=vp9',
          'video/webm;codecs=vp8',
          'video/webm',
        ];
      }

      let selectedMimeType = '';
      for (const t of typesSupported) {
        if (MediaRecorder.isTypeSupported(t)) {
          selectedMimeType = t;
          break;
        }
      }

      let fellBack = false;
      // Safe fallback if target MIME type is completely unsupported by browser (Chrome on Linux, Safari, etc.)
      if (!selectedMimeType) {
        if (userWantsMP4) {
          fellBack = true;
        }
        const fallbacks = [
          'video/webm;codecs=vp9',
          'video/webm;codecs=vp8',
          'video/webm',
        ];
        for (const f of fallbacks) {
          if (MediaRecorder.isTypeSupported(f)) {
            selectedMimeType = f;
            break;
          }
        }
      }

      if (!selectedMimeType) {
        throw new Error('No compatible browser movie encoding formats (MP4/WebM) are supported by your browser.');
      }

      setFallbackFormatUsed(fellBack);
      const isActuallyMP4 = selectedMimeType.toLowerCase().includes('mp4');
      setActualExt(isActuallyMP4 ? 'mp4' : 'webm');

      // Force even target dimensions to strictly comply with standard H.264 / AV1 video codec specifications
      let targetWidth = settings.resolutionWidth;
      let targetHeight = settings.resolutionHeight;
      if (targetWidth % 2 !== 0) {
        targetWidth--;
        addLog(`Normalized odd export width from ${settings.resolutionWidth} to even ${targetWidth} px.`, 'warn');
      }
      if (targetHeight % 2 !== 0) {
        targetHeight--;
        addLog(`Normalized odd export height from ${settings.resolutionHeight} to even ${targetHeight} px.`, 'warn');
      }

      canvas.width = targetWidth;
      canvas.height = targetHeight;

      addLog(`Initializing MediaRecorder encoding stream. Codec: ${selectedMimeType}. Target resolution: ${targetWidth}x${targetHeight}.`, 'info');

      // Capture standard frame stream
      const fps = settings.frameRate;
      const stream = canvas.captureStream(fps);
      activeStreamRef.current = stream;
      const recordedChunks: Blob[] = [];

      // Determine appropriate bitrate based on settings.videoQuality and resolution presets
      let bps = 35000000; // default 35 Mbps (High)
      if (settings.videoQuality === 'standard') {
        bps = 5000000; // 5 Mbps (Compact HD)
      } else if (settings.videoQuality === 'high') {
        bps = 45000000; // 45 Mbps (Full HD crisp studio)
      } else if (settings.videoQuality === 'lossless') {
        bps = 95000000; // 95 Mbps (Master lossless presentation rate)
      }

      addLog(`Configured video stream compression rate to ${(bps / 1000000).toFixed(1)} Mbps.`, 'info');

      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: selectedMimeType,
        videoBitsPerSecond: bps,
      });
      activeRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          recordedChunks.push(event.data);
        }
      };

      const containerMimeType = selectedMimeType.split(';')[0];

      // Returns a promise that resolves when the recorder finishes
      const recordingPromise = new Promise<Blob>((resolve) => {
        mediaRecorder.onstop = () => {
          const videoBlob = new Blob(recordedChunks, { type: containerMimeType });
          resolve(videoBlob);
        };
      });

      // Warm up and start recording
      mediaRecorder.start();
      await new Promise((resolve) => setTimeout(resolve, 300));

      // Draw first frame immediately to establish the stream keyframe
      if (filteredFrames.length > 0) {
        const firstFrame = filteredFrames[0];
        addLog(`Injecting stream base keyframe: "${firstFrame.name}" (${firstFrame.width || 'unknown'}x${firstFrame.height || 'unknown'})`, 'info');
        const firstImg = await new Promise<HTMLImageElement>((resolve) => {
          const img = new Image();
          img.onload = () => resolve(img);
          img.onerror = () => resolve(img);
          img.src = firstFrame.previewUrl;
        });

        drawPreloadedImageToCanvas(firstImg, firstFrame, canvas, ctx);
        try {
          ctx.getImageData(0, 0, 1, 1);
        } catch (e) {
          console.warn('GPU readback flush skipped', e);
        }
        const track = stream.getVideoTracks()[0];
        if (track && 'requestFrame' in track) {
          (track as any).requestFrame();
        }
        await new Promise((resolve) => setTimeout(resolve, 150));
      }

      // Iterate through frames synchronously, loading and drawing each image one-by-one (memory safe!)
      const timeStep = 1000 / fps;
      for (let i = 0; i < filteredFrames.length; i++) {
        if (!isMountedRef.current) {
          // Abort process immediately and clear resources
          addLog(`Video recording interrupted: compile cancelled.`, 'warn');
          try {
            mediaRecorder.stop();
          } catch (e) {}
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        setProgress(i + 1);
        const frame = filteredFrames[i];
        
        if (i % 5 === 0 || i === filteredFrames.length - 1) {
          addLog(`[VIDEO] Encoding frame ${i + 1}/${filteredFrames.length}: "${frame.name}" (${frame.width || 'unknown'}x${frame.height || 'unknown'})`, 'info');
        }

        const startTime = Date.now();

        // Load the image sequentially to maintain a tiny flat memory profile
        const img = await new Promise<HTMLImageElement>((resolve) => {
          const tempImg = new Image();
          tempImg.onload = () => resolve(tempImg);
          tempImg.onerror = () => resolve(tempImg); // continues gracefully
          tempImg.src = frame.previewUrl;
        });
        
        drawPreloadedImageToCanvas(img, frame, canvas, ctx);

        // Force synchronous GPU rasterization flush so the frame is fully painted into the canvas stream buffer
        try {
          ctx.getImageData(0, 0, 1, 1);
        } catch (e) {
          console.warn('GPU readback flush skipped', e);
        }

        // Trigger manual frame capture on the track if supported
        const track = stream.getVideoTracks()[0];
        if (track && 'requestFrame' in track) {
          (track as any).requestFrame();
        }
        
        const elapsed = Date.now() - startTime;
        const remainingDelay = Math.max(0, timeStep - elapsed);

        // Wait precise interval matching target FPS, while forcing browser paint-loop cycle to flush
        await new Promise((resolve) => {
          let resolved = false;
          const done = () => {
            if (!resolved) {
              resolved = true;
              resolve(null);
            }
          };
          requestAnimationFrame(() => {
            setTimeout(done, Math.max(0, remainingDelay - 15)); // offset some execution time
          });
          setTimeout(done, remainingDelay); // fallback if backgrounded
        });
      }

      // Safe pause so the browser has plenty of time to fully compress and flush final frames
      addLog(`Finalizing bitstream encoding and flushing buffers...`, 'info');
      await new Promise((resolve) => setTimeout(resolve, 1000));

      // Stop and compile
      mediaRecorder.stop();
      const movieBlob = await recordingPromise;

      // Stop stream tracks to free up browser canvas capturing resources
      stream.getTracks().forEach((track) => track.stop());
      activeStreamRef.current = null;
      activeRecorderRef.current = null;

      if (!movieBlob || movieBlob.size === 0) {
        throw new Error('Recorded timelapse video compiled with 0 bytes. Try reducing resolution or changing format.');
      }

      addLog(`Video compiled successfully! Format: ${isActuallyMP4 ? 'MP4' : 'WebM'}. Size: ${(movieBlob.size / (1024 * 1024)).toFixed(2)} MB.`, 'success');

      const url = URL.createObjectURL(movieBlob);
      setDownloadUrl(url);
      setComplete(true);
      setExporting(false);
    } catch (err) {
      // Pass down to outer handler
      throw err;
    }
  };

  // Shared Helper for ZIP sequential rendering
  const drawFrameToHiddenCanvas = (frame: TimelapseFrame, canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D): Promise<void> => {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        ctx.fillStyle = '#0a0a0c';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        const imgW = img.naturalWidth || frame.width || 1;
        const imgH = img.naturalHeight || frame.height || 1;
        const targetRatio = imgW / imgH;

        let renderW = canvas.width;
        let renderH = canvas.width / targetRatio;

        if (renderH > canvas.height) {
          renderH = canvas.height;
          renderW = canvas.height * targetRatio;
        }

        const xOffset = (canvas.width - renderW) / 2;
        const yOffset = (canvas.height - renderH) / 2;

        ctx.drawImage(img, xOffset, yOffset, renderW, renderH);
        resolve();
      };
      img.onerror = () => {
        ctx.fillStyle = '#7f1d1d';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = '#fca5a5';
        ctx.font = '14px monospace';
        ctx.textAlign = 'center';
        ctx.fillText(`Error drawing ${frame.name}`, canvas.width / 2, canvas.height / 2);
        resolve();
      };
      img.src = frame.previewUrl;
    });
  };

  const handleDownload = () => {
    if (!downloadUrl) return;
    const a = document.createElement('a');
    a.href = downloadUrl;
    
    // Choose name based on format
    const nameSlug = 'timelapse_compilation';
    if (settings.exportFormat === 'frames-zip') {
      a.download = `${nameSlug}_frames.zip`;
    } else {
      a.download = `${nameSlug}.${actualExt}`;
    }
    
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-fade-in" id="export-modal-backdrop">
      <div className="bg-[#0A0A0A] border border-zinc-800 rounded-2xl max-w-lg w-full overflow-hidden shadow-2xl shadow-black/85" id="export-modal-box">
        
        {/* Header */}
        <div className="bg-zinc-950/80 px-6 py-4.5 border-b border-zinc-850 flex items-center justify-between">
          <span className="text-xs font-bold text-zinc-400 uppercase tracking-wider font-mono">Timelapse Compiler</span>
          {!exporting && (
            <button onClick={onClose} className="p-1.5 hover:bg-zinc-900 text-zinc-500 hover:text-white rounded-lg transition-all" id="close-modal-x-btn">
              <XCircle className="w-5 h-5" />
            </button>
          )}
        </div>

        {/* Content */}
        <div className="p-6 space-y-6 text-center">

          {/* Core Configuration details summary */}
          {!exporting && !complete && (
            <div className="space-y-4">
              <div className="p-4 bg-zinc-950 rounded-xl border border-zinc-850 text-left">
                <h3 className="text-xs font-bold text-zinc-455 uppercase tracking-wide mb-3 font-mono">Export Summary</h3>
                <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs font-mono">
                  <div className="flex justify-between border-b border-zinc-900/60 pb-1.5 flex-row">
                    <dt className="text-zinc-500">Resolution:</dt>
                    <dd className="text-zinc-200 font-bold">{settings.resolutionWidth}x{settings.resolutionHeight} px</dd>
                  </div>
                  <div className="flex justify-between border-b border-zinc-900/60 pb-1.5 flex-row">
                    <dt className="text-zinc-550">Aspect Ratio:</dt>
                    <dd className="text-zinc-200 uppercase font-bold">{settings.aspectRatio}</dd>
                  </div>
                  <div className="flex justify-between border-b border-zinc-900/60 pb-1.5 flex-row">
                    <dt className="text-zinc-550">Frame Rate:</dt>
                    <dd className="text-zinc-200 font-bold">{settings.frameRate} FPS</dd>
                  </div>
                  <div className="flex justify-between border-b border-zinc-900/60 pb-1.5 flex-row">
                    <dt className="text-zinc-550">Speed multiplier:</dt>
                    <dd className="text-zinc-200 font-bold">{settings.speedMultiplier}x</dd>
                  </div>
                  {settings.exportFormat !== 'frames-zip' && (
                    <div className="flex justify-between border-b border-zinc-900/60 pb-1.5 col-span-2 flex-row">
                      <dt className="text-zinc-500">Encoding Bitrate:</dt>
                      <dd className="text-emerald-400 font-bold">
                        {settings.videoQuality === 'standard' && '5 Mbps (Standard)'}
                        {settings.videoQuality === 'high' && '45 Mbps ( crisp high )'}
                        {settings.videoQuality === 'lossless' && '95 Mbps (Lossless Master)'}
                      </dd>
                    </div>
                  )}
                  <div className="flex justify-between pt-1.5 col-span-2 flex-row">
                    <dt className="text-zinc-555 font-sans italic">Total frames to write:</dt>
                    <dd className="text-blue-400 font-bold">{filteredFrames.length} items</dd>
                  </div>
                </dl>
              </div>

              {/* Format warning/notes */}
              <div className="p-4 bg-blue-950/20 border border-blue-900/40 rounded-xl flex items-start gap-2.5 text-left text-xs text-zinc-400 leading-normal">
                <Sparkles className="w-4 h-4 text-blue-405 flex-shrink-0 mt-0.5" />
                <p>
                  Your compilation will be scaled to exactly <span className="text-blue-300 font-mono font-bold">{settings.resolutionWidth}x{settings.resolutionHeight} px</span>.
                  {settings.exportFormat === 'frames-zip'
                    ? ' This will compile each static photo, save it to high-quality JPG, and pack them sequentially in a structure matching professional editing tools.'
                    : ` This will compile the frames in canvas and render an HTML5 compatible high-bitrate ${settings.exportFormat.toUpperCase()} video.`}
                </p>
              </div>

              <button
                onClick={startCompilation}
                className="w-full py-3.5 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-xl transition shadow-lg hover:shadow-blue-900/20 active:scale-[0.98]"
              >
                Begin Compiling Sequence
              </button>
            </div>
          )}

          {/* Compilation in progress layout */}
          {exporting && (
            <div className="space-y-5 py-4">
              <div className="relative flex items-center justify-center">
                <div className="animate-spin rounded-full h-16 w-16 border-4 border-zinc-850 border-t-blue-500 font-sans"></div>
                {settings.exportFormat === 'frames-zip' ? (
                  <FileArchive className="absolute w-6 h-6 text-blue-400" />
                ) : (
                  <Video className="absolute w-6 h-6 text-blue-400 animate-pulse" />
                )}
              </div>

              {/* Dynamic Live Encoding Canvas (Forces GPU rendering context pipeline and stays active in viewport) */}
              <div className="relative mx-auto max-w-[320px] rounded-xl overflow-hidden border border-zinc-800 bg-zinc-950 p-1.5 shadow-md">
                <canvas
                  ref={canvasRef}
                  width={settings.resolutionWidth}
                  height={settings.resolutionHeight}
                  className="w-full h-auto aspect-video object-contain bg-zinc-900 rounded-lg"
                />
                <div className="absolute top-4.5 right-4.5 px-2 py-0.5 bg-rose-600 text-white font-mono text-[10px] uppercase font-bold rounded flex items-center gap-1.5 shadow-lg">
                  <span className="w-1.5 h-1.5 rounded-full bg-white animate-ping"></span>
                  {settings.exportFormat === 'frames-zip' ? 'EXTRACTING' : 'RECORDING'}
                </div>
              </div>

              <div className="space-y-1.5">
                <p className="text-xs uppercase tracking-wider font-bold text-zinc-300 font-mono">Compiling &amp; Encoding Sequence...</p>
                <p className="text-xs text-zinc-400 font-mono">
                  Writing frame {progress} / {total} ({Math.round((progress / total) * 100)}%)
                </p>
              </div>

              {/* Range progress bar */}
              <div className="w-full bg-zinc-950 rounded-full h-2 overflow-hidden border border-zinc-850">
                <div
                  className="bg-blue-500 h-2 rounded-full transition-all duration-150"
                  style={{ width: `${(progress / total) * 100}%` }}
                ></div>
              </div>

              <p className="text-[11px] text-zinc-550 font-mono leading-normal">
                Please hold. Do not close your browser panel or refresh the page.
              </p>
            </div>
          )}

          {/* Complete View */}
          {complete && (
            <div className="space-y-5 py-4 animate-scale-up">
              <div className="mx-auto p-3 bg-emerald-950/20 border border-emerald-900/30 text-emerald-400 rounded-full w-fit">
                <CheckCircle2 className="w-10 h-10" />
              </div>

              <div className="space-y-1">
                <p className="text-md font-bold text-emerald-400 uppercase tracking-wider font-mono">Compilation Successful!</p>
                <div className="text-xs text-zinc-400 leading-relaxed max-w-sm mx-auto space-y-3">
                  <p>
                    {settings.exportFormat === 'frames-zip'
                      ? 'Your zipped archive of perfectly sized sequential JPG frames has been successfully built.'
                      : `Your video timelapse compilation has been encoded successfully as ${actualExt.toUpperCase()}.`}
                  </p>
                  
                  {fallbackFormatUsed && (
                    <div className="mt-3 p-3 bg-amber-950/25 border border-amber-900/50 rounded-xl text-left text-xs text-amber-300 leading-relaxed font-mono">
                      <span className="font-bold uppercase tracking-wider block mb-1 text-amber-400">⚠️ Format Fallback Applied</span>
                      Your browser or OS platform does not natively support the <span className="underline font-bold text-amber-200">MP4 (H.264)</span> hardware video recording format. 
                      To ensure your file compile succeeded and didn't result in an empty file, we fell back and created a high-quality, fully compatible <span className="font-bold text-amber-200">WEBM</span> movie file instead.
                    </div>
                  )}
                </div>
              </div>

              <div className="pt-2 flex flex-col gap-2.5 max-w-xs mx-auto font-mono">
                <button
                  onClick={handleDownload}
                  className="w-full py-3.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl transition shadow-lg hover:shadow-emerald-900/20 flex items-center justify-center gap-2 active:scale-[0.98]"
                  id="final-download-trigger"
                >
                  <HardDriveDownload className="w-4 h-4" />
                  Save Compilation As...
                </button>
                
                <button
                  onClick={onClose}
                  className="w-full py-2.5 bg-zinc-900 border border-zinc-850 hover:bg-zinc-800 text-zinc-300 text-xs font-bold rounded-xl transition-all"
                >
                  Close
                </button>
              </div>
            </div>
          )}

          {/* Error messages if compilation fails */}
          {errorMsg && (
            <div className="p-4 bg-rose-950/20 border border-rose-900/40 rounded-xl text-left space-y-3">
              <div className="flex items-center gap-2 text-rose-455 font-semibold text-xs font-mono uppercase tracking-wide">
                <ShieldAlert className="w-4 h-4 flex-shrink-0" />
                <span>Compilation Interrupted</span>
              </div>
              <p className="text-xs text-rose-300/90 leading-normal font-mono bg-rose-955/10 p-2.5 rounded border border-rose-955/35">
                {errorMsg}
              </p>
              <button
                onClick={startCompilation}
                className="px-4 py-2 bg-zinc-900 border border-zinc-805 hover:bg-zinc-800 text-white text-xs font-bold rounded-lg transition"
              >
                Retry Compile
              </button>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
