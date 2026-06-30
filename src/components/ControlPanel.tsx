/**
 * ControlPanel.tsx - Export Settings Configuration Center
 * 
 * This component handles user options for the final timelapse compilation.
 * It manages:
 * - Frame Rate (FPS) selection (1 - 60 Hz).
 * - Speed Factor (multiplier/frame skip engine).
 * - Aspect Ratio adjustments (Original, 16:9, 4:3, 1:1, 9:16).
 * - Preset dimensions matching common standards (4K, 1080p, etc.).
 * - Compilation format (MP4 via H.264, WebM container, or frame ZIP archive).
 * - Multi-tier target rendering bitrates (Standard, High Studio, Pristine Lossless).
 */

import React from 'react';
import { ExportSettings } from '../types';
import { Video, Sliders, Play, Settings, Save, FileArchive, Info } from 'lucide-react';

interface ControlPanelProps {
  /** The current active export configurations (FPS, dimensions, format, bitrate profile) */
  settings: ExportSettings;
  /** State-updating callback to save configuration settings back to main state */
  onChangeSettings: (settings: ExportSettings) => void;
  /** Triggers the rendering & download wizard modal dialog */
  onStartExport: () => void;
  /** Total count of frames currently added to the studio sequence */
  framesCount: number;
  /** Callback to auto-detect and set compilation size to the dimensions of the first source photo */
  onUseSource: () => void;
  /** Boolean indicating whether any frames are currently loaded in the timeline */
  hasFrames: boolean;
}

/** Pre-configured aspect ratio metadata mapping labels and scale factors */
const ASPECT_RATIOS: { value: ExportSettings['aspectRatio']; label: string; aspect: string }[] = [
  { value: 'original', label: 'Match Source', aspect: 'Auto' },
  { value: '16:9', label: 'Widescreen (16:9)', aspect: '16:9' },
  { value: '4:3', label: 'Classic (4:3)', aspect: '4:3' },
  { value: '1:1', label: 'Square (1:1)', aspect: '1:1' },
  { value: '9:16', label: 'Vertical (9:16)', aspect: '9:16' },
];

/** Recommended export dimension presets for rapid cinematic selection */
const RESOLUTION_PRESETS = [
  { label: '4K HD', width: 3840, height: 2160 },
  { label: '1080p HD', width: 1920, height: 1080 },
  { label: '720p', width: 1280, height: 720 },
  { label: 'Square', width: 1080, height: 1080 },
];

export default function ControlPanel({
  settings,
  onChangeSettings,
  onStartExport,
  framesCount,
  onUseSource,
  hasFrames,
}: ControlPanelProps) {
  
  /**
   * Safe individual state updater for ExportSettings object fields.
   * Leverages TypeScript generics to enforce strict key-value pairs matches.
   */
  const updateSetting = <K extends keyof ExportSettings>(key: K, value: ExportSettings[K]) => {
    const updated = { ...settings, [key]: value };
    
    // Automatically recalculate resolution width/height in sync if aspect ratio changes
    if (key === 'aspectRatio' && value !== 'original') {
      const parts = (value as string).split(':').map(Number);
      if (parts.length === 2) {
        const [wRatio, hRatio] = parts;
        // Keep the master standard height at 1080px and calculate corresponding width
        updated.resolutionHeight = 1080;
        updated.resolutionWidth = Math.round((1080 / hRatio) * wRatio);
      }
    }
    onChangeSettings(updated);
  };

  /**
   * Updates resolution dimensions and syncs nearest aspect ratio classification
   */
  const selectResolution = (width: number, height: number, label: string) => {
    let idealAspect: ExportSettings['aspectRatio'] = '16:9';
    if (width === height) idealAspect = '1:1';
    
    onChangeSettings({
      ...settings,
      resolutionWidth: width,
      resolutionHeight: height,
      aspectRatio: idealAspect,
    });
  };

  return (
    <div className="bg-[#0A0A0A] border border-zinc-800 rounded-2xl p-6 flex flex-col gap-6 shadow-xl" id="control-panel-settings">
      
      {/* Configuration Header */}
      <div className="flex items-center gap-2 border-b border-zinc-850 pb-3">
        <Sliders className="w-4 h-4 text-blue-400" />
        <h2 className="text-xs font-bold text-zinc-300 uppercase tracking-wider font-mono">Export Settings</h2>
      </div>

      {/* Frame Rate Configuration Slider */}
      <div className="space-y-3">
        <div className="flex justify-between items-center">
          <label className="text-sm text-zinc-200">Frame Rate</label>
          <span className="px-2 py-0.5 bg-blue-950/40 text-blue-400 font-mono text-xs font-bold rounded border border-blue-900/40">
            {settings.frameRate} FPS
          </span>
        </div>
        <input
          type="range"
          min={1}
          max={60}
          value={settings.frameRate}
          onChange={(e) => updateSetting('frameRate', parseInt(e.target.value, 10))}
          className="w-full h-2 bg-zinc-800 border border-zinc-700 rounded-lg cursor-pointer appearance-none accent-blue-500 hover:bg-zinc-700 transition-all focus:outline-none"
          id="framerate-slider"
        />
        <div className="flex justify-between text-[11px] text-zinc-400 font-mono">
          <span>1 FPS</span>
          <span>24 FPS (Cinema)</span>
          <span>30 FPS (Standard)</span>
          <span>60 FPS</span>
        </div>
      </div>

      {/* Speed Multiplier Segment Box */}
      <div className="space-y-3 pt-1 border-t border-zinc-850/40">
        <div className="flex justify-between items-center bg-transparent mt-2">
          <label className="text-sm text-zinc-200">Timelapse Speed Factor</label>
          <span className="px-2 py-0.5 bg-zinc-900 text-zinc-200 font-mono text-xs rounded border border-zinc-800">
            {settings.speedMultiplier === 1 ? '1x (Normal)' : `${settings.speedMultiplier}x`}
          </span>
        </div>
        
        {/* Step factor segmented buttons list */}
        <div className="grid grid-cols-5 gap-1.5 p-1 bg-black/40 rounded-lg border border-zinc-850">
          {[1, 2, 3, 4, 8].map((factor) => {
            const isSelected = settings.speedMultiplier === factor;
            return (
              <button
                key={factor}
                onClick={() => updateSetting('speedMultiplier', factor)}
                className={`py-1 text-center font-mono text-xs rounded transition-all font-semibold cursor-pointer ${
                  isSelected
                    ? 'bg-blue-600 text-white shadow-sm shadow-blue-900/30'
                    : 'text-zinc-400 hover:text-white hover:bg-zinc-850'
                }`}
                title={factor > 1 ? `Skips frames to speed up rendering by ${factor}x` : 'Processes every frame sequentially'}
              >
                {factor}x
              </button>
            );
          })}
        </div>
        {settings.speedMultiplier > 1 && (
          <p className="text-[11px] text-zinc-400 leading-normal">
            Speeding up: App will sample every {settings.speedMultiplier}th frame, skipping others.
          </p>
        )}
      </div>

      {/* Aspect Ratio Segments */}
      <div className="space-y-3 pt-1 border-t border-zinc-850/40">
        <label className="text-sm text-zinc-200 block">Output Aspect Ratio</label>
        <div className="grid grid-cols-2 xs:grid-cols-3 sm:grid-cols-5 gap-1.5">
          {ASPECT_RATIOS.map((item) => {
            const isSelected = settings.aspectRatio === item.value;
            return (
              <button
                key={item.value}
                onClick={() => updateSetting('aspectRatio', item.value)}
                className={`py-2 px-1 rounded-lg border text-center transition cursor-pointer ${
                  isSelected
                    ? 'bg-blue-950/20 border-blue-600/70 text-blue-350 font-medium shadow-inner'
                    : 'border-zinc-800 bg-zinc-950/30 text-zinc-400 hover:border-zinc-700 hover:text-zinc-200'
                }`}
              >
                <p className="text-[12px] truncate leading-none font-semibold">{item.label.split(' ')[0]}</p>
                <p className="text-[10px] text-zinc-400 font-mono mt-1">{item.aspect}</p>
              </button>
            );
          })}
        </div>
      </div>

      {/* Resolution Sizing Presets */}
      <div className="space-y-3 pt-1 border-t border-zinc-850/40">
        <div className="flex justify-between items-center bg-transparent mt-2">
          <label className="text-sm text-zinc-200 block">Resolution Presets</label>
          <button
            onClick={onUseSource}
            disabled={!hasFrames}
            className={`text-[11px] uppercase tracking-wider font-mono font-bold px-2 py-1 rounded border transition-all ${
              hasFrames
                ? 'bg-zinc-900 hover:bg-zinc-850 text-blue-400 border-zinc-800 cursor-pointer hover:text-blue-300'
                : 'bg-zinc-950 text-zinc-600 border-zinc-900 cursor-not-allowed opacity-40'
            }`}
            title="Output will automatically match source resolution"
          >
            Use Source
          </button>
        </div>
        <div className="grid grid-cols-4 gap-1">
          {RESOLUTION_PRESETS.map((res) => {
            const isSelected = settings.resolutionWidth === res.width && settings.resolutionHeight === res.height;
            return (
              <button
                key={res.label}
                onClick={() => selectResolution(res.width, res.height, res.label)}
                className={`p-1.5 rounded-lg border text-center transition cursor-pointer ${
                  isSelected
                    ? 'border-blue-600 bg-blue-950/15 text-blue-350'
                    : 'border-zinc-800 bg-zinc-950/20 text-zinc-300 hover:border-zinc-700'
                }`}
              >
                <p className="text-[11px] font-semibold truncate leading-none">{res.label}</p>
                <p className="text-[9px] text-zinc-400 font-mono mt-1 tracking-tighter">
                  {res.width}×{res.height}
                </p>
              </button>
            );
          })}
        </div>
      </div>

      {/* Bitrate Encoding Profiles */}
      {settings.exportFormat !== 'frames-zip' && (
        <div className="space-y-3 pt-4 border-t border-zinc-850">
          <div className="flex justify-between items-center bg-transparent">
            <label className="text-[11px] uppercase tracking-wider font-mono font-bold text-zinc-400 block">Video Encoding Quality</label>
            <span className="px-1.5 py-0.5 bg-blue-950/25 border border-blue-900/40 text-blue-400 font-mono text-[9px] font-bold rounded">
              {settings.videoQuality === 'standard' && "5 Mbps"}
              {settings.videoQuality === 'high' && "45 Mbps"}
              {settings.videoQuality === 'lossless' && "95 Mbps"}
            </span>
          </div>
          <div className="grid grid-cols-3 gap-1.5">
            {(['standard', 'high', 'lossless'] as ExportSettings['videoQuality'][]).map((quality) => {
              const isSelected = settings.videoQuality === quality;
              return (
                <button
                  key={quality}
                  onClick={() => updateSetting('videoQuality', quality)}
                  className={`py-1.5 px-1 rounded-lg border text-center transition cursor-pointer ${
                    isSelected
                      ? 'border-blue-600 bg-blue-950/15 text-blue-350 font-medium'
                      : 'border-zinc-900 bg-zinc-950/30 text-zinc-400 hover:border-zinc-700 hover:text-zinc-200'
                  }`}
                >
                  <p className="text-[11px] font-semibold">
                    {quality === 'standard' && 'Standard'}
                    {quality === 'high' && 'High'}
                    {quality === 'lossless' && 'Pristine'}
                  </p>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Render Master CTA button */}
      <div className="pt-4 border-t border-zinc-850">
        <button
          onClick={onStartExport}
          disabled={framesCount === 0}
          className="w-full py-3.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold transition shadow-lg hover:shadow-blue-900/20 active:scale-[0.98] flex items-center justify-center gap-2 disabled:opacity-30 disabled:hover:bg-blue-600 disabled:pointer-events-none cursor-pointer"
          id="export-trigger-btn"
        >
          <Save className="w-5 h-5" />
          <span>GENERATE &amp; SAVE</span>
        </button>
        <p className="text-[11px] text-zinc-400 mt-2.5 text-center leading-normal font-mono">
          {framesCount === 0 
            ? 'Import some photographs or trigger the demo sequencer to enable export.'
            : `Compiles ${Math.ceil(framesCount / settings.speedMultiplier)} active frames at ${settings.resolutionWidth}x${settings.resolutionHeight}.`
          }
        </p>
      </div>

      {/* Export Format (MP4 vs WebM vs ZIP) */}
      <div className="space-y-3 pt-4 border-t border-zinc-850">
        <label className="text-xs uppercase tracking-wider font-mono font-bold text-zinc-400 block">Output Format</label>
        <div className="grid grid-cols-3 gap-1.5">
          <button
            onClick={() => updateSetting('exportFormat', 'mp4')}
            className={`flex flex-col items-center justify-center p-2 rounded-xl border transition text-center cursor-pointer ${
              settings.exportFormat === 'mp4'
                ? 'border-blue-600 bg-blue-950/15 text-blue-300'
                : 'border-zinc-800 bg-zinc-950/20 text-zinc-400 hover:border-zinc-700'
            }`}
          >
            <Video className="w-4 h-4 text-emerald-400 flex-shrink-0 mb-1" />
            <div>
              <p className="text-[11px] font-semibold">MP4 Video</p>
              <p className="text-[9px] text-zinc-500 leading-tight">Universal H.264</p>
            </div>
          </button>

          <button
            onClick={() => updateSetting('exportFormat', 'webm')}
            className={`flex flex-col items-center justify-center p-2 rounded-xl border transition text-center cursor-pointer ${
              settings.exportFormat === 'webm'
                ? 'border-blue-600 bg-blue-950/15 text-blue-300'
                : 'border-zinc-800 bg-zinc-950/20 text-zinc-400 hover:border-zinc-700'
            }`}
          >
            <Video className="w-4 h-4 text-blue-400 flex-shrink-0 mb-1" />
            <div>
              <p className="text-[11px] font-semibold">WebM Movie</p>
              <p className="text-[9px] text-zinc-500 leading-tight">Fast HTML5 web</p>
            </div>
          </button>

          <button
            onClick={() => updateSetting('exportFormat', 'frames-zip')}
            className={`flex flex-col items-center justify-center p-2 rounded-xl border transition text-center cursor-pointer ${
              settings.exportFormat === 'frames-zip'
                ? 'border-blue-600 bg-blue-950/15 text-blue-300'
                : 'border-zinc-800 bg-zinc-950/20 text-zinc-400 hover:border-zinc-700'
            }`}
          >
            <FileArchive className="w-4 h-4 text-amber-500 flex-shrink-0 mb-1" />
            <div>
              <p className="text-[11px] font-semibold">Sequenced ZIP</p>
              <p className="text-[9px] text-zinc-500 leading-tight">For editors</p>
            </div>
          </button>
        </div>
      </div>

    </div>
  );
}
