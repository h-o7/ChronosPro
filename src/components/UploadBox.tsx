/**
 * UploadBox.tsx - Batch Photo Sequence Import Hub
 * 
 * This component provides an interactive drag-and-drop workspace for importing
 * source images into the timelapse workspace. It manages:
 * - HTML5 Drag & Drop states (dragenter, dragover, dragleave, drop).
 * - Standard file input picking for manual selection.
 * - Multi-format filters supporting PNG, JPEG, WEBP, AVIF, and high-end camera RAW (DNG, NEF, CR2, ARW).
 * - Visual loader state with real-time feedback of file processing count,
 *   supporting client-side companion JPEGs extraction.
 */

import React, { useRef, useState } from 'react';
import { Upload, FileDown, Layers, Image as ImageIcon, Sparkles } from 'lucide-react';

interface UploadBoxProps {
  /** Callback fired with the loaded file handles list */
  onFilesSelected: (files: FileList | File[]) => void;
  /** True if files are currently being parsed and decoded in memory */
  isProcessing: boolean;
  /** Index of the current file being processed */
  processingProgress: number;
  /** Total number of files selected for processing */
  processingTotal: number;
}

export default function UploadBox({
  onFilesSelected,
  isProcessing,
  processingProgress,
  processingTotal,
}: UploadBoxProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragActive, setIsDragActive] = useState(false);

  /**
   * Tracks active hover state of drag-and-drop events
   * and overrides default browser behaviors.
   */
  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setIsDragActive(true);
    } else if (e.type === 'dragleave') {
      setIsDragActive(false);
    }
  };

  /**
   * Triggered when files are dropped directly over the zone.
   * Extracts file list handles and dispatches to processing callback.
   */
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragActive(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      onFilesSelected(e.dataTransfer.files);
    }
  };

  /**
   * Triggered when standard input file browser picker selects items.
   * Clears target value state pointer upon dispatch to allow repeating imports of identical files.
   */
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      onFilesSelected(e.target.files);
      e.target.value = ''; // Clear value pointer to allow re-selecting same files after workspace resets
    }
  };

  /**
   * Triggers native input browse element click dispatch.
   */
  const triggerPicker = () => {
    fileInputRef.current?.click();
  };

  return (
    <div className="w-full flex flex-col gap-4">
      {/* Drag & Drop Area */}
      <div
        onDragEnter={handleDrag}
        onDragOver={handleDrag}
        onDragLeave={handleDrag}
        onDrop={handleDrop}
        onClick={triggerPicker}
        className={`w-full min-h-[300px] rounded-2xl border-2 border-dashed flex flex-col items-center justify-center p-8 text-center cursor-pointer transition relative overflow-hidden ${
          isDragActive
            ? 'border-blue-500 bg-blue-950/20'
            : 'border-zinc-800 bg-[#0A0A0A] hover:bg-zinc-900/40 hover:border-[#1E1E1E]'
        }`}
        id="drag-drop-zone"
      >
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept=".jpg,.jpeg,.png,.gif,.webp,.avif,.nef,.dng,.cr2,.arw"
          onChange={handleFileChange}
          className="hidden"
          id="file-element-input"
        />

        {isProcessing ? (
          <div className="flex flex-col items-center gap-4" id="processing-loader">
            <div className="relative flex items-center justify-center">
              <div className="animate-spin rounded-full h-14 w-14 border-4 border-zinc-900 border-t-blue-500"></div>
              <Layers className="absolute w-5 h-5 text-blue-400" />
            </div>
            <div>
              <p className="text-sm font-semibold text-zinc-200">
                Processing Photo Sequence ({processingProgress} / {processingTotal})
              </p>
              <p className="text-xs text-zinc-400 mt-1">
                Decoding raw sensor files & extracting high-res EXIF JPEGs...
              </p>
            </div>
            
            {/* ProgressBar */}
            <div className="w-64 bg-zinc-900 rounded-full h-1.5 overflow-hidden border border-zinc-800 mt-2">
              <div
                className="bg-blue-500 h-1.5 rounded-full transition-all duration-300"
                style={{ width: `${(processingProgress / processingTotal) * 100}%` }}
              ></div>
            </div>
          </div>
        ) : (
          <div className="max-w-md mx-auto flex flex-col items-center text-center gap-4">
            <div className="absolute top-0 right-0 p-4 opacity-5 pointer-events-none">
              <Sparkles className="w-16 h-16 text-blue-400" />
            </div>

            <div className="p-3 bg-blue-950/40 rounded-full border border-blue-900/30 text-blue-400">
              <Upload className="w-8 h-8 text-blue-400" />
            </div>

            <div className="space-y-2">
              <h3 className="text-sm md:text-base font-bold text-zinc-100 tracking-tight flex flex-wrap items-center justify-center gap-2">
                Timelapse Creator
                <span className="text-[9px] bg-blue-950/40 text-blue-400 font-mono font-bold px-1.5 py-0.5 rounded border border-blue-900/30">
                  Sequence Compiler & Player
                </span>
              </h3>
              <p className="text-zinc-400 text-xs leading-relaxed max-w-sm">
                Drag &amp; drop photos here or <span className="text-blue-400 font-semibold underline">browse files</span> to start.
              </p>
            </div>

            <div className="border-t border-zinc-900/60 pt-3 w-full">
              <p className="text-xs text-zinc-400 leading-relaxed max-w-md mx-auto">
                Supports Standard JPEGs (<span className="text-zinc-300">.jpg, .jpeg</span>), PNGs/WebPs/AVIFs (<span className="text-zinc-300">.png, .webp, .avif</span>), and RAW Images (<span className="text-zinc-300">.nef, .dng, .cr2, .arw</span>).
              </p>
            </div>

            <div className="flex items-center gap-6 mt-2 p-2.5 bg-zinc-900/60 rounded-xl border border-zinc-850 text-left">
              <div className="flex items-center gap-2 text-[11px] text-zinc-300">
                <ImageIcon className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />
                <span>Auto Preview decoders</span>
              </div>
              <div className="h-4 w-px bg-zinc-800"></div>
              <div className="flex items-center gap-2 text-[11px] text-zinc-300">
                <FileDown className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />
                <span>EXIF meta timestamps read</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Info Card */}
      <div className="p-4 bg-zinc-900/40 border border-zinc-800/80 rounded-2xl space-y-2">
        <h3 className="text-xs font-semibold text-zinc-300 uppercase tracking-wider font-mono">How RAW NEF files are processed:</h3>
        <p className="text-xs text-zinc-400 leading-relaxed">
          RAW images (like Nikon <code className="text-zinc-300 px-1 py-0.5 bg-zinc-850 rounded text-[11px] font-mono">.nef</code> and Adobe <code className="text-zinc-300 px-1 py-0.5 bg-zinc-850 rounded text-[11px] font-mono">.dng</code>) store uncompressed sensor data. When loaded, this app executes an ultra-fast raw-scanner routine directly in your memory space to extract its high-resolution camera-recorded companion JPEG and reconstructs the real Exif metadata. No files are uploaded to any server – everything runs securely in your Electron-ready environment.
        </p>
      </div>
    </div>
  );
}
