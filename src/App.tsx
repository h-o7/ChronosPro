/**
 * App.tsx - ChronosPro Studio Application Shell & Core Controller
 * 
 * This is the orchestrator of ChronosPro. It manages:
 * - Active view tabs (Timelapse Workspace, Batch HEIC Converter, Work Log Console).
 * - Sequence frames management (previews, dimensions verification, chronological EXIF sorting, and removals).
 * - Live playback preview loop with custom frame rate intervals (1 - 60 Hz).
 * - Real-time subscription of the activity log console to catch transcoder & compiler logs.
 * - Compilation wizard modals and settings configurations.
 */

import React, { useState, useEffect } from 'react';
import { TimelapseFrame, ExportSettings, WorkLogEntry, ActiveTab } from './types';
import Navbar from './components/Navbar';
import UploadBox from './components/UploadBox';
import Timeline from './components/Timeline';
import TimelapsePlayer from './components/TimelapsePlayer';
import ControlPanel from './components/ControlPanel';
import ExportModal from './components/ExportModal';
import WorkLogPanel from './components/WorkLogPanel';
import HEICConverter from './components/HEICConverter';
import { parseUploadFile } from './utils/photoParser';
import { logger } from './utils/logger';
import { saveStudioFrames, loadStudioFrames, clearStudioFrames, clearHEICFiles } from './utils/db';
import { Layers, Image as ImageIcon, ChevronRight, HelpCircle, HardDrive, Trash2 } from 'lucide-react';

const INITIAL_SETTINGS: ExportSettings = {
  frameRate: 15,
  resolutionWidth: 1920,
  resolutionHeight: 1080,
  aspectRatio: '16:9',
  speedMultiplier: 1,
  loop: true,
  exportFormat: 'webm',
  videoQuality: 'high',
};

/**
 * Capping resolution helper to prevent browser video encoding crashes due to extreme dimensions.
 * Constrains the pixel width/height to maximum 4K (3840x2160) and forces both dimensions
 * to even integers as strictly required by standard H.264/AV1 video codecs.
 */
function capResolutionTo4k(width: number, height: number): { width: number; height: number } {
  const MAX_W = 3840;
  const MAX_H = 2160;
  
  let targetW = width;
  let targetH = height;
  
  if (targetW > MAX_W) {
    const scale = MAX_W / targetW;
    targetW = MAX_W;
    targetH = Math.round(targetH * scale);
  }
  
  if (targetH > MAX_H) {
    const scale = MAX_H / targetH;
    targetH = MAX_H;
    targetW = Math.round(targetW * scale);
  }
  
  // Audio-video codecs like H.264 / AV1 strictly require even dimensions
  if (targetW % 2 !== 0) targetW--;
  if (targetH % 2 !== 0) targetH--;
  
  return { width: Math.max(100, targetW), height: Math.max(100, targetH) };
}

export default function App() {
  const [frames, setFrames] = useState<TimelapseFrame[]>([]);
  const [selectedFrameIndex, setSelectedFrameIndex] = useState<number | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  
  // Track if session initialization has completed to prevent race conditions during DB cleanup
  const [isSessionInitialized, setIsSessionInitialized] = useState(false);

  // Initialize with default settings
  const [settings, setSettings] = useState<ExportSettings>(INITIAL_SETTINGS);

  // Initialize with fresh default logs
  const [workLogs, setWorkLogs] = useState<WorkLogEntry[]>(() => [
    { timestamp: new Date().toLocaleTimeString(), type: 'info', message: 'ChronosPro Compiler Engine initialized.' },
    { timestamp: new Date().toLocaleTimeString(), type: 'info', message: 'Ready to receive image sequence (JPEG, PNG, RAW NEF/DNG/CR2/ARW).' },
  ]);

  // Default active tab to 'studio'
  const [activeTab, setActiveTab] = useState<ActiveTab>('studio');

  /**
   * Appends an administrative log record to the WorkLog history stack
   */
  const addLog = (message: string, type: 'info' | 'success' | 'warn' | 'error' = 'info') => {
    const timestamp = new Date().toLocaleTimeString();
    setWorkLogs((prev) => [...prev, { timestamp, type, message }]);
  };

  // --------------------------------------------------------------------------
  // SESSION STORAGE PERSISTENCE EFFECTS
  // --------------------------------------------------------------------------

  // Wipe databases on application boot to always start fresh
  useEffect(() => {
    const initializeSession = async () => {
      try {
        addLog('Initializing fresh workspace session...', 'info');
        await Promise.all([clearStudioFrames(), clearHEICFiles()]);
        addLog('Workspace and queue successfully reset.', 'success');
      } catch (err: any) {
        addLog(`Failed to initialize session: ${err.message || String(err)}`, 'error');
      } finally {
        setIsSessionInitialized(true);
      }
    };
    initializeSession();
  }, []);

  // Persist timeline sequence frames to IndexedDB during the active session for performant queueing
  useEffect(() => {
    if (!isSessionInitialized) return;
    if (frames.length === 0) {
      clearStudioFrames();
      return;
    }
    saveStudioFrames(frames);
  }, [frames, isSessionInitialized]);

  // Subscribe to central logger outputs so converter/compiler telemetry is automatically piped to the Work Log Console
  useEffect(() => {
    const unsubscribe = logger.subscribe((message, type) => {
      addLog(message, type);
    });
    return () => unsubscribe();
  }, []);

  /**
   * Safely updates sequence settings, adjusting dimensions if "Match Source" (original) is selected
   */
  const handleSettingsChange = (newSettings: ExportSettings) => {
    if (newSettings.aspectRatio === 'original' && frames.length > 0) {
      const firstFrame = frames[0];
      if (firstFrame && firstFrame.status === 'ready' && firstFrame.width && firstFrame.height) {
        const capped = capResolutionTo4k(firstFrame.width, firstFrame.height);
        newSettings.resolutionWidth = capped.width;
        newSettings.resolutionHeight = capped.height;
      }
    }
    setSettings(newSettings);
  };

  /**
   * Aligns settings dimensions to match the first uploaded frame's native width and height
   */
  const handleUseSource = () => {
    if (frames.length > 0) {
      const firstFrame = frames[0];
      if (firstFrame && firstFrame.width && firstFrame.height) {
        const capped = capResolutionTo4k(firstFrame.width, firstFrame.height);
        addLog(`Enforcing source sequence native resolution: ${firstFrame.width}x${firstFrame.height} px (Capped/Aligned to even: ${capped.width}x${capped.height} px).`, 'success');
        setSettings({
          ...settings,
          resolutionWidth: capped.width,
          resolutionHeight: capped.height,
          aspectRatio: 'original',
        });
      }
    } else {
      addLog('No sequence imported yet. Load images first to fetch source resolution dimensions.', 'warn');
    }
  };

  // File loading states
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingProgress, setProcessingProgress] = useState(0);
  const [processingTotal, setProcessingTotal] = useState(0);

  // Export overlay state
  const [isExportOpen, setIsExportOpen] = useState(false);

  // 1. Playback Timer: Advances frame based on Frame Rate
  useEffect(() => {
    if (!isPlaying || frames.length === 0) return;

    const intervalTime = 1000 / settings.frameRate;
    const timer = setInterval(() => {
      setSelectedFrameIndex((prev) => {
        if (prev === null) return 0;
        const next = prev + 1;
        if (next >= frames.length) {
          if (settings.loop) {
            return 0;
          } else {
            setIsPlaying(false);
            return prev;
          }
        }
        return next;
      });
    }, intervalTime);

    // Guard clean-up
    return () => clearInterval(timer);
  }, [isPlaying, frames.length, settings.frameRate, settings.loop]);

  // 2. Memory Clean Up: Revoke object URLs on unmount of component
  useEffect(() => {
    return () => {
      frames.forEach((f) => {
        if (f.previewUrl) {
          URL.revokeObjectURL(f.previewUrl);
        }
      });
    };
  }, []);

  /**
   * Processes uploaded raw photos, parsing EXIF metadata, generating thumbnail object URLs
   * and detecting dimension discrepancies between sequence frames.
   */
  const handleFilesSelected = async (fileList: FileList | File[]) => {
    const list = Array.from(fileList);
    if (list.length === 0) return;

    addLog(`Initiating sequence import for ${list.length} files...`, 'info');

    setIsProcessing(true);
    setProcessingTotal(list.length);
    setProcessingProgress(0);

    const loadedFrames: TimelapseFrame[] = [];
    
    // Determine the base width and height from the first ready frame
    let baseWidth = frames.find(f => f.status === 'ready')?.width;
    let baseHeight = frames.find(f => f.status === 'ready')?.height;

    for (let i = 0; i < list.length; i++) {
      const file = list[i];
      try {
        const metadata = await parseUploadFile(file);
        
        loadedFrames.push({
          id: Math.random().toString(36).substring(2, 11),
          name: file.name,
          size: file.size,
          type: file.type || 'image/jpeg',
          lastModified: file.lastModified,
          previewUrl: metadata.previewUrl || '',
          status: 'ready',
          width: metadata.width,
          height: metadata.height,
          dateTaken: metadata.dateTaken,
          file: file, // Store the raw File/Blob object for browser IndexedDB cache
        });

        if (!baseWidth && metadata.width) {
          baseWidth = metadata.width;
          baseHeight = metadata.height;
          addLog(`Sequence base resolution established from first file: ${baseWidth}x${baseHeight} px`, 'info');
        }

        if (baseWidth && metadata.width && (metadata.width !== baseWidth || metadata.height !== baseHeight)) {
          addLog(
            `Dimension Discrepancy: "${file.name}" is ${metadata.width}x${metadata.height}, but base sequence is ${baseWidth}x${baseHeight}. Auto-rescaling, centering, and letterboxing will be applied during playback and compilation to prevent failures.`,
            'warn'
          );
        } else {
          addLog(`Decoded and parsed "${file.name}" (${metadata.width}x${metadata.height}) successfully.`, 'success');
        }

      } catch (err: any) {
        console.error('Frame decode failed:', file.name, err);
        addLog(`Failed to parse "${file.name}": ${err.message || 'corrupt format'}`, 'error');
        // Load item anyway with 'error' status so the user can see faulty cells on timeline
        loadedFrames.push({
          id: Math.random().toString(36).substring(2, 11),
          name: file.name,
          size: file.size,
          type: file.type || 'image/jpeg',
          lastModified: file.lastModified,
          previewUrl: '',
          status: 'error',
          errorMessage: err.message || 'Corrupt format',
        });
      }
      setProcessingProgress((prev) => prev + 1);
    }

    setFrames((prev) => {
      const newSequence = [...prev, ...loadedFrames];
      if (selectedFrameIndex === null && newSequence.length > 0) {
        setSelectedFrameIndex(0);
      }

      // Auto-update resolution to match first frame if using 'original' (Match Source)
      if (prev.length === 0 && newSequence.length > 0) {
        const firstFrame = newSequence[0];
        if (firstFrame && firstFrame.status === 'ready' && firstFrame.width && firstFrame.height) {
          const capped = capResolutionTo4k(firstFrame.width, firstFrame.height);
          setSettings((s) => ({
            ...s,
            resolutionWidth: capped.width,
            resolutionHeight: capped.height,
          }));
        }
      }
      return newSequence;
    });
    
    setIsProcessing(false);
  };

  /**
   * Safely deletes a frame from the timeline sequence, releasing its allocated Object URL
   */
  const handleRemoveFrame = (id: string) => {
    setFrames((prev) => {
      const target = prev.find((f) => f.id === id);
      if (target) {
        addLog(`Removed frame "${target.name}" from workspace.`, 'info');
        if (target.previewUrl) {
          URL.revokeObjectURL(target.previewUrl);
        }
      }
      const updated = prev.filter((f) => f.id !== id);
      
      // Keep selected index in bound
      if (updated.length === 0) {
        setSelectedFrameIndex(null);
        setIsPlaying(false);
      } else if (selectedFrameIndex !== null && selectedFrameIndex >= updated.length) {
        setSelectedFrameIndex(updated.length - 1);
      }
      return updated;
    });
  };

  /**
   * Resets the entire studio workbench, releasing all Object URLs to avoid memory leaks
   */
  const handleClearAll = () => {
    // Safely revoke all blob URLs first to prevent memory leaks
    frames.forEach((f) => {
      if (f.previewUrl) URL.revokeObjectURL(f.previewUrl);
    });
    setFrames([]);
    setSelectedFrameIndex(null);
    setIsPlaying(false);
    setSettings(INITIAL_SETTINGS);
    setIsExportOpen(false);
    setIsProcessing(false);
    setProcessingProgress(0);
    setProcessingTotal(0);

    addLog(`Workspace cleared. All cached memory resources released.`, 'info');
  };

  /**
   * Helper function to convert a Blob/File to a base64 string
   */
  const blobToBase64 = (blob: Blob): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  };

  /**
   * Helper function to convert a base64 string back into a File
   */
  const dataURLtoFile = (dataurl: string, filename: string): File => {
    const arr = dataurl.split(',');
    const mime = arr[0].match(/:(.*?);/)?.[1] || 'image/jpeg';
    const bstr = atob(arr[1]);
    let n = bstr.length;
    const u8arr = new Uint8Array(n);
    while (n--) {
      u8arr[n] = bstr.charCodeAt(n);
    }
    return new File([u8arr], filename, { type: mime });
  };

  /**
   * Exports the current workspace state (settings, active logs, active tab, and frames including original files)
   * as a downloaded JSON file for backup and crash recovery.
   */
  const handleSaveWorkspace = async () => {
    addLog('Exporting workspace and encoding image data... Please do not close the window.', 'info');
    try {
      const serializedFrames = [];
      let count = 0;
      
      for (const frame of frames) {
        let fileBase64 = '';
        if (frame.file) {
          fileBase64 = await blobToBase64(frame.file);
        }
        serializedFrames.push({
          id: frame.id,
          name: frame.name,
          size: frame.size,
          type: frame.type,
          lastModified: frame.lastModified,
          status: frame.status,
          errorMessage: frame.errorMessage,
          width: frame.width,
          height: frame.height,
          dateTaken: frame.dateTaken ? (frame.dateTaken instanceof Date ? frame.dateTaken.toISOString() : String(frame.dateTaken)) : undefined,
          fileBase64,
        });
        count++;
      }

      const backupData = {
        type: 'chronospro-workspace-backup',
        version: '1.5.0',
        exportedAt: new Date().toISOString(),
        settings,
        activeTab,
        workLogs,
        frames: serializedFrames,
      };

      const jsonString = JSON.stringify(backupData);
      const blob = new Blob([jsonString], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      
      const link = document.createElement('a');
      link.href = url;
      link.download = `chronospro-workspace-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      addLog(`Workspace successfully saved to file! Compiled and serialized ${frames.length} timeline frames.`, 'success');
    } catch (err: any) {
      addLog(`Failed to export workspace file: ${err.message || String(err)}`, 'error');
    }
  };

  /**
   * Imports a workspace backup JSON file, restores all settings, logs, active view,
   * reconstructs File blobs, regenerates previews, and synchronizes with local IndexedDB.
   */
  const handleImportWorkspace = async (file: File) => {
    addLog(`Importing workspace from backup file "${file.name}"...`, 'info');
    try {
      const text = await file.text();
      const data = JSON.parse(text);

      if (data.type !== 'chronospro-workspace-backup') {
        throw new Error('Invalid workspace backup file format.');
      }

      // Restore basic states
      if (data.settings) setSettings(data.settings);
      if (data.activeTab) setActiveTab(data.activeTab);
      if (data.workLogs) setWorkLogs(data.workLogs);

      // Reconstruct frames
      const restoredFrames: TimelapseFrame[] = [];
      if (Array.isArray(data.frames)) {
        addLog(`Decoding and reconstructing ${data.frames.length} image frame objects...`, 'info');
        for (const f of data.frames) {
          let reconstructedFile: File | undefined;
          let previewUrl = '';
          if (f.fileBase64) {
            reconstructedFile = dataURLtoFile(f.fileBase64, f.name);
            previewUrl = URL.createObjectURL(reconstructedFile);
          }
          
          restoredFrames.push({
            id: f.id,
            name: f.name,
            size: f.size,
            type: f.type,
            lastModified: f.lastModified,
            status: f.status,
            errorMessage: f.errorMessage,
            width: f.width,
            height: f.height,
            dateTaken: f.dateTaken ? new Date(f.dateTaken) : undefined,
            previewUrl,
            file: reconstructedFile,
          });
        }
      }

      setFrames(restoredFrames);
      if (restoredFrames.length > 0) {
        setSelectedFrameIndex(0);
      } else {
        setSelectedFrameIndex(null);
      }

      // Also persist to IndexedDB immediately for active session frame queueing
      await saveStudioFrames(restoredFrames);

      addLog(`Workspace imported successfully! Restored ${restoredFrames.length} sequence timeline frames and synchronized settings.`, 'success');
      alert(`Workspace imported successfully! Restored ${restoredFrames.length} sequence frames and settings.`);
    } catch (err: any) {
      addLog(`Failed to import workspace: ${err.message || String(err)}`, 'error');
      alert(`Failed to import workspace: ${err.message || String(err)}`);
    }
  };

  // 5. Sequence Sorting mechanisms
  const handleSortByFilename = (direction: 'asc' | 'desc') => {
    setFrames((prev) => {
      const sorted = [...prev].sort((a, b) => {
        return direction === 'asc'
          ? a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' })
          : b.name.localeCompare(a.name, undefined, { numeric: true, sensitivity: 'base' });
      });
      return sorted;
    });
    setSelectedFrameIndex(0);
    addLog(`Sorted workspace frames sequence by filename (${direction.toUpperCase()}).`, 'info');
  };

  const handleSortByDate = (direction: 'asc' | 'desc') => {
    setFrames((prev) => {
      const sorted = [...prev].sort((a, b) => {
        const timeA = a.dateTaken?.getTime() || a.lastModified;
        const timeB = b.dateTaken?.getTime() || b.lastModified;
        return direction === 'asc' ? timeA - timeB : timeB - timeA;
      });
      return sorted;
    });
    setSelectedFrameIndex(0);
    addLog(`Sorted workspace frames sequence chronologically via EXIF / system timestamp (${direction.toUpperCase()}).`, 'info');
  };

  const handleReverseAll = () => {
    setFrames((prev) => [...prev].reverse());
    setSelectedFrameIndex(0);
    addLog(`Reversed current sequence frames timeline order.`, 'info');
  };

  if (!isSessionInitialized) {
    return (
      <div className="min-h-screen bg-[#060606] text-zinc-100 flex flex-col items-center justify-center font-sans antialiased" id="session-init-loader">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-2 border-zinc-850 border-t-blue-500 rounded-full animate-spin" />
          <p className="text-xs font-mono text-zinc-450 tracking-wider">INITIALIZING CHRONOSPRO...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#060606] text-zinc-100 flex flex-col font-sans selection:bg-blue-600 selection:text-white antialiased" id="studio-root-container">
      
      {/* Navbar component */}
      <Navbar
        totalFrames={frames.length}
        onClearAll={handleClearAll}
        onSaveWorkspace={handleSaveWorkspace}
        onImportWorkspace={handleImportWorkspace}
        activeTab={activeTab}
        onChangeTab={setActiveTab}
      />

      {/* Main tab content */}
      <div className={activeTab === 'studio' ? 'block flex-1' : 'hidden'} id="studio-tab-content">
        <main className="flex-1 max-w-7xl w-full mx-auto p-4 md:p-6 grid grid-cols-1 lg:grid-cols-12 gap-6 items-start" id="main-workbench">
        
        {/* Left column: Upload picker and compilation Controls */}
        <section className="lg:col-span-4 flex flex-col gap-6 w-full" id="left-sidebar-controls">
          {frames.length === 0 ? (
            <UploadBox
              onFilesSelected={handleFilesSelected}
              isProcessing={isProcessing}
              processingProgress={processingProgress}
              processingTotal={processingTotal}
            />
          ) : (
            <ControlPanel
              settings={settings}
              onChangeSettings={handleSettingsChange}
              onStartExport={() => setIsExportOpen(true)}
              framesCount={frames.length}
              onUseSource={handleUseSource}
              hasFrames={frames.length > 0}
            />
          )}

          {/* Instructions card */}
          <div className="bg-[#0A0A0A] border border-zinc-805 p-5 rounded-2xl flex items-start gap-3 shadow-xl">
            <Layers className="w-5 h-5 text-blue-400 mt-0.5 flex-shrink-0" />
            <div className="text-left w-full">
              <h4 className="text-xs font-bold text-zinc-300 uppercase tracking-wider font-mono">Production Workflow</h4>
              <p className="text-[12px] text-zinc-400 leading-normal mt-1">
                Drag on additional raw photo items anytime to insert them directly into the current sequence. Use the timeline tool to inspect frame counts. You can sort items chronologically leveraging original EXIF timestamp tags.
              </p>
              <div className="mt-3 pt-3 border-t border-zinc-850/60 flex items-center gap-2 text-[11px] font-mono text-emerald-400 leading-tight">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse flex-shrink-0" />
                <span>Smooth sequence: Processing every uploaded photo frame in correct order.</span>
              </div>
            </div>
          </div>
        </section>

        {/* Right column: Dynamic player + timeline manager */}
        <section className="lg:col-span-8 flex flex-col gap-6 w-full" id="right-workspace-content">
          {frames.length > 0 ? (
            <>
              {/* Output Preview Screen */}
              <TimelapsePlayer
                frames={frames}
                currentFrameIndex={selectedFrameIndex !== null ? selectedFrameIndex : 0}
                isPlaying={isPlaying}
                onSetFrameIndex={setSelectedFrameIndex}
                onSetPlaying={setIsPlaying}
                settings={settings}
              />

              {/* Advanced Timeline grid */}
              <Timeline
                frames={frames}
                selectedFrameIndex={selectedFrameIndex}
                onSelectFrame={setSelectedFrameIndex}
                onRemoveFrame={handleRemoveFrame}
                onSortByFilename={handleSortByFilename}
                onSortByDate={handleSortByDate}
                onReverseAll={handleReverseAll}
              />

              {/* Fast Drag additions zone if frames have already been uploaded */}
              <div className="p-4.5 rounded-2xl border border-dashed border-zinc-800 bg-zinc-950/20 flex flex-col xs:flex-row items-center justify-between gap-3 text-xs shadow-md">
                <span className="text-zinc-400 flex items-center gap-2">
                  <ImageIcon className="w-4 h-4 text-blue-400" />
                  Have more photos or other raw frames to add?
                </span>
                
                <input
                  id="append-images-file-input"
                  type="file"
                  multiple
                  accept=".jpg,.jpeg,.png,.gif,.webp,.avif,.nef,.dng,.cr2,.arw"
                  onChange={(e) => {
                    if (e.target.files && e.target.files.length > 0) {
                      handleFilesSelected(e.target.files);
                      e.target.value = ''; // clears selection pointer so reselecting same files triggers change event again
                    }
                  }}
                  className="hidden"
                />

                <button
                  onClick={() => {
                    const input = document.getElementById('append-images-file-input');
                    if (input) input.click();
                  }}
                  className="px-3.5 py-1.5 rounded-xl bg-zinc-900 hover:bg-zinc-850 text-zinc-200 transition-all border border-zinc-800 hover:border-zinc-700 hover:text-white font-mono text-xs font-bold shadow-sm"
                >
                  Append Images
                </button>
              </div>
            </>
          ) : (
            <div className="bg-[#0A0A0A] border border-zinc-800 rounded-2xl p-12 text-center h-[460px] flex flex-col items-center justify-center gap-5 shadow-xl">
              <div className="w-16 h-16 bg-zinc-900 border border-zinc-800 flex items-center justify-center text-blue-450 shadow-inner rounded-2xl">
                <Layers className="w-8 h-8 animate-pulse text-blue-400" />
              </div>
              <div className="max-w-md">
                <h3 className="text-xs font-bold text-zinc-400 uppercase tracking-widest font-mono">No Active Sequence</h3>
                <p className="text-xs text-zinc-500 leading-relaxed mt-2 font-mono">
                  Start by dragging some photos into the upload box on the left, or click it to choose sequence files from your computer.
                </p>
              </div>
              <button
                onClick={() => setActiveTab('worklog')}
                className="mt-2 text-xs uppercase tracking-wider font-mono font-bold px-5 py-3 bg-zinc-900 hover:bg-zinc-850 rounded-xl text-zinc-300 border border-zinc-800 transition-all active:scale-95 shadow-md flex items-center gap-2 cursor-pointer"
              >
                <span>Open Work Log Console</span>
              </button>
            </div>
          )}
        </section>

        </main>
      </div>

      <div className={activeTab === 'heic' ? 'block flex-1' : 'hidden'} id="heic-tab-content">
        <main className="flex-1 max-w-7xl w-full mx-auto p-4 md:p-6 flex flex-col gap-6 animate-in fade-in duration-200" id="heic-workbench">
          <HEICConverter
            onImportToStudio={(importedFiles) => {
              handleFilesSelected(importedFiles);
              setActiveTab('studio');
            }}
          />
        </main>
      </div>

      <div className={activeTab === 'worklog' ? 'block flex-1' : 'hidden'} id="worklog-tab-content">
        <main className="flex-1 max-w-7xl w-full mx-auto p-4 md:p-6 flex flex-col gap-6" id="work-log-workbench">
          <div className="flex-1 flex flex-col">
            <WorkLogPanel
              workLogs={workLogs}
              onClear={() => setWorkLogs([])}
              onClose={() => setActiveTab('studio')}
              isFullTab={true}
            />
          </div>
        </main>
      </div>

      {/* Export manager compilation modal dialogue */}
      {isExportOpen && (
        <ExportModal
          isOpen={isExportOpen}
          onClose={() => setIsExportOpen(false)}
          frames={frames}
          settings={settings}
          addLog={addLog}
        />
      )}

    </div>
  );
}
