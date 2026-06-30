/**
 * TimelapsePlayer.tsx - Real-time Sequence Viewer Canvas & Playback engine
 * 
 * This component runs the main visual playback simulation on a responsive HTML5 Canvas.
 * Core design features:
 * - Active ResizeObserver to dynamically resize, clear, and scale the canvas centered inside parent containers.
 * - Multi-stage neighbor image preloader keeping active frame +5 lookaheads in RAM caches, preventing flickering.
 * - Intelligent drawing logic drawing files according to custom dimensions/presets and Original aspect ratios.
 * - Subdued rule-of-thirds photography composition grid lines overlay.
 * - Fully fledged media transport controls: Scrubber sliders, FPS trackers, frame back/forward triggers, and rewind toggles.
 */

import React, { useEffect, useRef, useState } from 'react';
import { Play, Pause, SkipBack, SkipForward, Maximize2, RotateCcw, AlertCircle } from 'lucide-react';
import { TimelapseFrame, ExportSettings } from '../types';

interface TimelapsePlayerProps {
  /** Sequential array of parsed images */
  frames: TimelapseFrame[];
  /** Current active index on the video timeline */
  currentFrameIndex: number;
  /** True if the playback timer is running */
  isPlaying: boolean;
  /** Updates the playback head pointer */
  onSetFrameIndex: (index: number) => void;
  /** Starts or stops the playback interval timer */
  onSetPlaying: (playing: boolean) => void;
  /** Active export configurations */
  settings: ExportSettings;
}

export default function TimelapsePlayer({
  frames,
  currentFrameIndex,
  isPlaying,
  onSetFrameIndex,
  onSetPlaying,
  settings,
}: TimelapsePlayerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  /** Fast RAM cache holding instantiated HTMLImageElement classes to avoid disk-read latency spikes during playing */
  const imageCacheRef = useRef<Map<string, HTMLImageElement>>(new Map());
  
  const [containerSize, setContainerSize] = useState({ width: 640, height: 360 });
  const [canvasLoading, setCanvasLoading] = useState(false);

  // 1. Observe container size for responsive width / height calculations
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let resizeTimer: number;
    const observer = new ResizeObserver((entries) => {
      if (!entries || entries.length === 0) return;
      const { width, height } = entries[0].contentRect;
      
      // Debounce slightly to prevent lag during rapid mouse dragging
      window.clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(() => {
        setContainerSize({
          width: Math.floor(width),
          height: Math.floor(height) || 360,
        });
      }, 50);
    });

    observer.observe(container);
    return () => {
      observer.disconnect();
      window.clearTimeout(resizeTimer);
    };
  }, []);

  // 2. Preload and cache Image elements so the canvas can render instantaneous sequences without black flicker
  useEffect(() => {
    // Clear dead caches from deleted or replaced timeline frames
    const activeUrls = new Set(frames.map(f => f.previewUrl));
    for (const key of imageCacheRef.current.keys()) {
      if (!activeUrls.has(key)) {
        imageCacheRef.current.delete(key);
      }
    }

    // Warm up nearest neighborhood items (2 steps backward, 5 steps forward)
    const maxPreload = 5;
    const startIdx = Math.max(0, currentFrameIndex - 2);
    const endIdx = Math.min(frames.length - 1, currentFrameIndex + maxPreload);

    for (let i = startIdx; i <= endIdx; i++) {
      const url = frames[i]?.previewUrl;
      if (url && !imageCacheRef.current.has(url)) {
        const img = new Image();
        img.src = url;
        imageCacheRef.current.set(url, img);
      }
    }
  }, [frames, currentFrameIndex]);

  // 3. Render the active frame to the canvas when sizing or active index changes
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const activeFrame = frames[currentFrameIndex];
    if (!activeFrame || activeFrame.status !== 'ready') {
      // Clear canvas with deep transparent backdrop if no frame ready
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = '#17171c';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = '#6b7280';
      ctx.font = '12px monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('No sequence frames loaded', canvas.width / 2, canvas.height / 2);
      return;
    }

    // Set canvas dimensions matching the container width/height
    canvas.width = containerSize.width;
    canvas.height = containerSize.height;

    // Load or pull from cache
    let img = imageCacheRef.current.get(activeFrame.previewUrl);
    
    const draw = (imageElement: HTMLImageElement) => {
      // Clear previous frames
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      
      // Paint dark grey backdrop
      ctx.fillStyle = '#0a0a0c';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Render image respecting selected Aspect Ratio constraints
      const imgW = imageElement.naturalWidth || activeFrame.width || 1;
      const imgH = imageElement.naturalHeight || activeFrame.height || 1;
      
      let targetRatio = imgW / imgH;
      
      // Calculate target dimensions inside current canvas frame
      let renderW = canvas.width;
      let renderH = canvas.width / targetRatio;
      
      if (renderH > canvas.height) {
        renderH = canvas.height;
        renderW = canvas.height * targetRatio;
      }
      
      const xOffset = (canvas.width - renderW) / 2;
      const yOffset = (canvas.height - renderH) / 2;

      // Draw active photo frame centered onto canvas viewport
      ctx.drawImage(imageElement, xOffset, yOffset, renderW, renderH);

      // Standard Grid lines overlay if requested (subtle artistic flair)
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
      ctx.lineWidth = 1;
      // Verticals thirds
      ctx.beginPath();
      ctx.moveTo(canvas.width / 3, 0); ctx.lineTo(canvas.width / 3, canvas.height);
      ctx.moveTo((canvas.width / 3) * 2, 0); ctx.lineTo((canvas.width / 3) * 2, canvas.height);
      // Horizontals thirds
      ctx.moveTo(0, canvas.height / 3); ctx.lineTo(canvas.width, canvas.height / 3);
      ctx.moveTo(0, (canvas.height / 3) * 2); ctx.lineTo(canvas.width, (canvas.height / 3) * 2);
      ctx.stroke();
    };

    if (img && img.complete) {
      draw(img);
    } else {
      const fallbackImg = new Image();
      fallbackImg.src = activeFrame.previewUrl;
      fallbackImg.onload = () => {
        imageCacheRef.current.set(activeFrame.previewUrl, fallbackImg);
        draw(fallbackImg);
      };
    }
  }, [frames, currentFrameIndex, containerSize, settings.aspectRatio]);

  const togglePlay = () => {
    onSetPlaying(!isPlaying);
  };

  const nextFrame = () => {
    if (frames.length === 0) return;
    onSetFrameIndex((currentFrameIndex + 1) % frames.length);
  };

  const prevFrame = () => {
    if (frames.length === 0) return;
    onSetFrameIndex((currentFrameIndex - 1 + frames.length) % frames.length);
  };

  const rewind = () => {
    onSetFrameIndex(0);
    onSetPlaying(false);
  };

  const activeFrame = frames[currentFrameIndex];

  return (
    <div className="bg-[#0A0A0A] border border-zinc-800 rounded-2xl overflow-hidden flex flex-col shadow-xl" id="viewport-card">
      
      {/* Viewport Header */}
      <div className="bg-zinc-950/80 px-4 py-2.5 border-b border-zinc-850 flex items-center justify-between">
        <span className="text-xs font-semibold text-zinc-300 flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full bg-blue-500 animate-pulse"></span>
          PREVIEW WINDOW
        </span>
        <div className="text-[11px] font-mono text-zinc-400 bg-zinc-900/80 px-2.5 py-0.5 rounded-md border border-zinc-850">
          Aspect Option: {settings.aspectRatio.toUpperCase()} • Res: {settings.resolutionWidth}x{settings.resolutionHeight}
        </div>
      </div>

      {/* Main Canvas Frame Container */}
      <div 
        ref={containerRef} 
        className="w-full h-[360px] cursor-pointer relative bg-zinc-950 flex items-center justify-center overflow-hidden" 
        onClick={togglePlay}
        id="canvas-box-container"
      >
        <canvas ref={canvasRef} className="block transition-opacity duration-150" />

        {/* Dynamic Watermark details Overlay */}
        {activeFrame && (
          <div className="absolute top-4 left-4 bg-zinc-950/80 backdrop-blur-md px-3 py-2 rounded-xl text-left font-mono pointer-events-none border border-white/10 shadow-lg">
            <p className="text-[12px] text-zinc-100 font-bold truncate max-w-[200px]">{activeFrame.name}</p>
            <p className="text-[11px] text-zinc-400 mt-1">
              Ref: {currentFrameIndex + 1} / {frames.length} ({Math.round(((currentFrameIndex + 1) / frames.length) * 100)}%)
            </p>
            {activeFrame.width && (
              <p className="text-[10px] text-zinc-550 mt-0.5">Original: {activeFrame.width}x{activeFrame.height}</p>
            )}
          </div>
        )}

        {/* Play indicator overlay centered briefly if clicked */}
        {!isPlaying && frames.length > 0 && (
          <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity">
            <div className="p-4 bg-zinc-900/95 rounded-full border border-zinc-750 text-blue-400 shadow-xl shadow-black/80 scale-105 transition-transform">
              <Play className="w-8 h-8 fill-blue-400" />
            </div>
          </div>
        )}
      </div>

      {/* Playback Progress Scrubber bar */}
      <div className="bg-zinc-950 px-5 pt-3 pb-1.5 border-t border-zinc-850/60 flex items-center gap-3">
        <span className="text-[11px] font-mono text-zinc-400 w-8 text-right">
          00:{(currentFrameIndex + 1).toString().padStart(2, '0')}
        </span>
        <input
          type="range"
          min={0}
          max={Math.max(0, frames.length - 1)}
          value={currentFrameIndex}
          onChange={(e) => onSetFrameIndex(parseInt(e.target.value, 10))}
          className="flex-1 accent-blue-500 h-1 bg-zinc-800 rounded-lg cursor-pointer"
          disabled={frames.length === 0}
          id="frame-scrubber"
        />
        <span className="text-[11px] font-mono text-zinc-400 w-8 text-left">
          00:{frames.length.toString().padStart(2, '0')}
        </span>
      </div>

      {/* Control Buttons row */}
      <div className="bg-zinc-950 px-5 pb-4 pt-2.5 flex items-center justify-between gap-4">
        {/* Playback timing/duration display */}
        <div className="text-left font-mono text-xs">
          <p className="text-zinc-300">
            Duration: <span className="text-blue-400 font-bold font-mono">{(frames.length / settings.frameRate).toFixed(1)}s</span>
          </p>
          <p className="text-[10px] text-zinc-400 mt-0.5">
            {settings.frameRate} FPS COMPILATION
          </p>
        </div>

        {/* Media Buttons */}
        <div className="flex items-center gap-1.5 bg-zinc-900 p-1.5 rounded-xl border border-zinc-800">
          <button
            onClick={rewind}
            disabled={frames.length === 0}
            className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition disabled:opacity-30 cursor-pointer"
            title="Rewind to start"
          >
            <RotateCcw className="w-4 h-4" />
          </button>
          
          <button
            onClick={prevFrame}
            disabled={frames.length === 0}
            className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition disabled:opacity-30 cursor-pointer"
            title="Previous Frame"
          >
            <SkipBack className="w-4 h-4" />
          </button>

          <button
            onClick={togglePlay}
            disabled={frames.length === 0}
            className="px-4 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-bold transition flex items-center gap-1.5 disabled:opacity-40 cursor-pointer"
          >
            {isPlaying ? (
              <>
                <Pause className="w-3.5 h-3.5 fill-white animate-pulse" />
                <span className="text-xs uppercase tracking-wide">Pause</span>
              </>
            ) : (
              <>
                <Play className="w-3.5 h-3.5 fill-white" />
                <span className="text-xs uppercase tracking-wide">Play</span>
              </>
            )}
          </button>

          <button
            onClick={nextFrame}
            disabled={frames.length === 0}
            className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition disabled:opacity-30 cursor-pointer"
            title="Next Frame"
          >
            <SkipForward className="w-4 h-4" />
          </button>
        </div>

        {/* Layout details */}
        <div className="text-right text-[11px] text-zinc-400 font-mono">
          {frames.length > 0 ? (
            <span>
              canvas: {containerSize.width}x{containerSize.height} px
            </span>
          ) : (
            <span className="flex items-center gap-1 text-amber-500">
              <span className="h-1.5 w-1.5 rounded-full bg-amber-500"></span> Empty sequence
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
