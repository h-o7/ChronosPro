/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * HEICConverter.tsx - Professional Batch HEIC/HEIF Image Converter & Optimizer
 * 
 * This component provides batch conversion capabilities from raw HEIC/HEIF captures
 * as well as standard images (JPEG, PNG, WEBP, BMP) directly in the browser sandboxed context.
 * Features:
 * - Visually lossless conversion with customizable sub-sampling JPEG quality slider.
 * - Hardware-accelerated scaling and aspect ratio fitting (Contain vs. Stretch).
 * - Multi-thread memory protection via sequential queue processing.
 * - Double persistent layers: IndexedDB caches large source files and transcoded blobs; 
 *   LocalStorage holds slider quality scales and aspect bounding presets.
 */

import React, { useState, useRef, useEffect } from 'react';
import { 
  Upload, 
  Image as ImageIcon, 
  Trash2, 
  SlidersHorizontal, 
  Play, 
  Download, 
  CheckCircle2, 
  AlertCircle, 
  Loader2, 
  FolderArchive,
  Scale,
  Folder,
  Sparkles,
  Layers
} from 'lucide-react';
import JSZip from 'jszip';
import { HEICFile } from '../types';
import { convertHEICtoJPG, resizeImage } from '../utils/heic';
import { logger } from '../utils/logger';
import { saveHEICFiles, loadHEICFiles, clearHEICFiles } from '../utils/db';
import { extractEmbeddedJpegFromNef } from '../utils/photoParser';

interface HEICConverterProps {
  onImportToStudio?: (files: File[]) => void;
}

export default function HEICConverter({ onImportToStudio }: HEICConverterProps) {
  // Batch queue files initialized to an empty list. Restored from IndexedDB on mount.
  const [files, setFiles] = useState<HEICFile[]>([]);
  
  // Settings initialized from SessionStorage fallbacks
  const [quality, setQuality] = useState<number>(() => {
    if (typeof window !== 'undefined') {
      const val = sessionStorage.getItem('chronospro_heic_quality');
      if (val) return parseFloat(val);
    }
    return 0.85;
  });
  
  const [isConvertingAll, setIsConvertingAll] = useState<boolean>(false);
  const [conversionIndex, setConversionIndex] = useState<number>(0);
  const [isZipping, setIsZipping] = useState<boolean>(false);
  const [isSavingToFolder, setIsSavingToFolder] = useState<boolean>(false);
  
  // Resizing configuration parameters initialized from SessionStorage fallbacks
  const [resizeEnabled, setResizeEnabled] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      return sessionStorage.getItem('chronospro_heic_resize_enabled') === 'true';
    }
    return false;
  });
  const [resizeWidth, setResizeWidth] = useState<number>(() => {
    if (typeof window !== 'undefined') {
      const val = sessionStorage.getItem('chronospro_heic_resize_width');
      if (val) return parseInt(val, 10);
    }
    return 1920;
  });
  const [resizeHeight, setResizeHeight] = useState<number>(() => {
    if (typeof window !== 'undefined') {
      const val = sessionStorage.getItem('chronospro_heic_resize_height');
      if (val) return parseInt(val, 10);
    }
    return 1080;
  });
  const [resizeModeFit, setResizeModeFit] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      return sessionStorage.getItem('chronospro_heic_resize_mode_fit') !== 'false';
    }
    return true;
  });

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Drag over visual toggle states
  const [isDragging, setIsDragging] = useState<boolean>(false);

  // --------------------------------------------------------------------------
  // OFFLINE PERSISTENCE EFFECTS
  // --------------------------------------------------------------------------

  // Restore Converter files list from local IndexedDB on mount
  useEffect(() => {
    const initLoad = async () => {
      logger.info('converter', 'Scanning local browser cache for previous HEIC Converter queues...');
      try {
        const loaded = await loadHEICFiles();
        if (loaded && loaded.length > 0) {
          setFiles(loaded);
          logger.success('converter', `Successfully restored ${loaded.length} pending/converted photos from local storage.`);
        } else {
          logger.info('converter', 'No cached HEIC files found in offline storage.');
        }
      } catch (err: any) {
        logger.error('converter', `Failed to restore cached files: ${err.message || String(err)}`);
      }
    };
    initLoad();
  }, []);

  // Persist files queue to IndexedDB whenever the files stack undergoes changes
  useEffect(() => {
    if (files.length === 0) {
      clearHEICFiles();
      return;
    }
    saveHEICFiles(files);
  }, [files]);

  // Synchronize configuration adjustments to SessionStorage
  useEffect(() => {
    sessionStorage.setItem('chronospro_heic_quality', quality.toString());
  }, [quality]);

  useEffect(() => {
    sessionStorage.setItem('chronospro_heic_resize_enabled', resizeEnabled.toString());
  }, [resizeEnabled]);

  useEffect(() => {
    sessionStorage.setItem('chronospro_heic_resize_width', resizeWidth.toString());
  }, [resizeWidth]);

  useEffect(() => {
    sessionStorage.setItem('chronospro_heic_resize_height', resizeHeight.toString());
  }, [resizeHeight]);

  useEffect(() => {
    sessionStorage.setItem('chronospro_heic_resize_mode_fit', resizeModeFit.toString());
  }, [resizeModeFit]);

  // --------------------------------------------------------------------------
  // BATCH QUEUE OPERATIONS
  // --------------------------------------------------------------------------

  // Handle file selections
  const processUploadedFiles = (rawFiles: FileList | null) => {
    if (!rawFiles) return;

    logger.info('converter', `Uploaded ${rawFiles.length} files to batch queue.`);
    const newHeicFiles: HEICFile[] = [];
    for (let i = 0; i < rawFiles.length; i++) {
      const file = rawFiles[i];
      const nameLower = file.name.toLowerCase();
      
      // We target HEIC / HEIF, AVIF, and RAW formats alongside standard formats
      const isHeic = nameLower.endsWith('.heic') || nameLower.endsWith('.heif');
      const isRaw = nameLower.endsWith('.nef') || nameLower.endsWith('.dng') || nameLower.endsWith('.cr2') || nameLower.endsWith('.arw');
      const isAvif = nameLower.endsWith('.avif');

      let formatLabel = 'Standard/Other Image';
      if (isHeic) {
        formatLabel = 'HEIC/HEIF Image';
      } else if (isRaw) {
        formatLabel = `RAW ${nameLower.split('.').pop()?.toUpperCase()} Image`;
      } else if (isAvif) {
        formatLabel = 'AVIF Image';
      }

      logger.info('converter', `Queued [File ${i + 1}/${rawFiles.length}] Name: "${file.name}" | Size: ${(file.size / 1024).toFixed(1)} KB | Format: ${formatLabel}`);
      
      // Create new HEIC item
      newHeicFiles.push({
        id: crypto.randomUUID(),
        file,
        name: file.name,
        size: file.size,
        status: 'pending',
        progress: 0,
      });
    }

    setFiles((prev) => [...prev, ...newHeicFiles]);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    processUploadedFiles(e.dataTransfer.files);
  };

  // Trigger manual file selection
  const handleSelectFilesClick = () => {
    fileInputRef.current?.click();
  };

  // Convert a single image file (HEIC or standard format)
  const convertSingleFile = async (id: string, customQuality?: number) => {
    const targetFile = files.find((f) => f.id === id);
    if (!targetFile) return;

    logger.info('converter', `Starting transcode for file: "${targetFile.name}" (Original size: ${(targetFile.size / 1024).toFixed(1)} KB)`);

    // Update status
    setFiles((prev) =>
      prev.map((f) =>
        f.id === id
          ? { ...f, status: 'converting', progress: 20 }
          : f
      )
    );

    try {
      const targetBlob = targetFile.file;
      const nameLower = targetFile.name.toLowerCase();
      const isHeic = nameLower.endsWith('.heic') || nameLower.endsWith('.heif');
      const isRaw = nameLower.endsWith('.nef') || nameLower.endsWith('.dng') || nameLower.endsWith('.cr2') || nameLower.endsWith('.arw');
      
      let convertedBlob: Blob;

      if (isHeic) {
        logger.info('converter', `[${targetFile.name}] Parsing HEIC/HEIF container. Decoding pixel bitstream...`);
        // Step 1: Decode HEIC to JPG
        convertedBlob = await convertHEICtoJPG(targetBlob, customQuality ?? quality);
        logger.info('converter', `[${targetFile.name}] Decoded HEIC successfully. Sub-sampling quality set to ${(customQuality ?? quality) * 100}%`);
        
        // Step 2: Resize if enabled
        if (resizeEnabled && resizeWidth > 0 && resizeHeight > 0) {
          logger.info('converter', `[${targetFile.name}] Resize filter active. Fitting into bounding box: ${resizeWidth}x${resizeHeight}px (${resizeModeFit ? 'Letterbox/Contain' : 'Stretch/Fill'})`);
          convertedBlob = await resizeImage(
            convertedBlob,
            resizeWidth,
            resizeHeight,
            resizeModeFit,
            customQuality ?? quality
          );
        }
      } else if (isRaw) {
        logger.info('converter', `[${targetFile.name}] Parsing RAW container (${nameLower.split('.').pop()?.toUpperCase()}). Scraping embedded high-fidelity preview...`);
        const arrayBuffer = await targetBlob.arrayBuffer();
        const extracted = extractEmbeddedJpegFromNef(arrayBuffer);
        if (!extracted) {
          throw new Error(`RawExtractionFailed: No preview JPEG embedded in raw metadata structure.`);
        }
        
        logger.info('converter', `[${targetFile.name}] Extracted ${formatSize(extracted.size)} preview JPEG. Re-transcoding & matching profile...`);
        
        // Step 2: Resize or compress
        if (resizeEnabled && resizeWidth > 0 && resizeHeight > 0) {
          logger.info('converter', `[${targetFile.name}] Resize filter active. Fitting raw preview to bounding box: ${resizeWidth}x${resizeHeight}px`);
          convertedBlob = await resizeImage(
            extracted,
            resizeWidth,
            resizeHeight,
            resizeModeFit,
            customQuality ?? quality
          );
        } else {
          logger.info('converter', `[${targetFile.name}] Compressing raw preview using original dimensions.`);
          convertedBlob = await resizeImage(
            extracted,
            99999, // large upper bound
            99999, // large upper bound
            true,  // fit
            customQuality ?? quality
          );
        }
      } else {
        // For non-HEIC / standard format files (JPG, PNG, WEBP, BMP, AVIF, etc.):
        // We ALWAYS transcode standard images to JPEG (applying custom quality and/or resizing)
        logger.info('converter', `[${targetFile.name}] Loading standard web image format. Re-transcoding to baseline JPG container...`);
        if (resizeEnabled && resizeWidth > 0 && resizeHeight > 0) {
          logger.info('converter', `[${targetFile.name}] Resize filter active. Fitting standard image to bounding box: ${resizeWidth}x${resizeHeight}px`);
          convertedBlob = await resizeImage(
            targetBlob,
            resizeWidth,
            resizeHeight,
            resizeModeFit,
            customQuality ?? quality
          );
        } else {
          // If resizing is disabled, transcode using natural/original size to compress to JPG with chosen quality
          logger.info('converter', `[${targetFile.name}] Compressing image using original dimensions.`);
          convertedBlob = await resizeImage(
            targetBlob,
            99999, // large upper bound
            99999, // large upper bound
            true,  // fit (retains original size since no upscale occurs)
            customQuality ?? quality
          );
        }
      }

      const convertedUrl = URL.createObjectURL(convertedBlob);
      logger.success('converter', `[${targetFile.name}] Transcoded successfully. Output size: ${(convertedBlob.size / 1024).toFixed(1)} KB (Compression ratio: ${((convertedBlob.size / targetFile.size) * 100).toFixed(1)}%)`);

      setFiles((prev) =>
        prev.map((f) =>
          f.id === id
            ? {
                ...f,
                status: 'done',
                convertedBlob,
                convertedUrl,
                progress: 100,
              }
            : f
        )
      );
    } catch (err: any) {
      const errorMsg = err.message || 'Error converting HEIC image';
      logger.error('converter', `[${targetFile.name}] Transcode failed: ${errorMsg}`);
      setFiles((prev) =>
        prev.map((f) =>
          f.id === id
            ? {
                ...f,
                status: 'error',
                errorMsg,
                progress: 0,
              }
            : f
        )
      );
    }
  };

  // Mass conversion sequential loop (runs 1 at a time to prevent device out-of-memory errors)
  const handleConvertAll = async () => {
    const pendingFiles = files.filter((f) => f.status === 'pending' || f.status === 'error');
    if (pendingFiles.length === 0) return;

    logger.info('converter', `Initiating sequential batch conversion for ${pendingFiles.length} images...`);
    setIsConvertingAll(true);
    let count = 0;

    for (let i = 0; i < files.length; i++) {
      const current = files[i];
      if (current.status === 'pending' || current.status === 'error') {
        setConversionIndex(i + 1);
        await convertSingleFile(current.id);
        count++;
      }
    }

    logger.success('converter', `Sequential batch conversion completed. Transcoded ${count} photos successfully.`);
    setIsConvertingAll(false);
  };

  // Individual image download
  const downloadSingle = (fileItem: HEICFile) => {
    if (!fileItem.convertedBlob || !fileItem.convertedUrl) return;

    const newName = fileItem.name.replace(/\.[^.]+$/, '') + '.jpg';
    const link = document.createElement('a');
    link.href = fileItem.convertedUrl;
    link.download = newName;
    link.click();
  };

  // Bulk ZIP saving
  const handleDownloadAllZip = async () => {
    const successfulFiles = files.filter((f) => f.status === 'done' && f.convertedBlob);
    if (successfulFiles.length === 0) return;

    setIsZipping(true);
    const zip = new JSZip();

    successfulFiles.forEach((fileItem) => {
      if (fileItem.convertedBlob) {
        const pureName = fileItem.name.replace(/\.[^.]+$/, '') + '.jpg';
        zip.file(pureName, fileItem.convertedBlob);
      }
    });

    try {
      const zipContentBlob = await zip.generateAsync({ type: 'blob' });
      const downloadUrl = URL.createObjectURL(zipContentBlob);
      
      const link = document.createElement('a');
      link.href = downloadUrl;
      link.download = 'heic_converted_jpgs.zip';
      link.click();

      // Revoke to clean memories
      setTimeout(() => URL.revokeObjectURL(downloadUrl), 1000);
    } catch (err) {
      console.error('ZIP generation failed: ', err);
    } finally {
      setIsZipping(false);
    }
  };

  // Bulk Local Folder saving (Supports Electron Desktop app & Web File System Access API)
  const handleSaveToFolder = async () => {
    const successfulFiles = files.filter((f) => f.status === 'done' && f.convertedBlob);
    if (successfulFiles.length === 0) {
      logger.warn('converter', 'No successfully converted files to save. Please convert HEIC photos first.');
      return;
    }

    logger.info('converter', `Starting folder export sequence for ${successfulFiles.length} files...`);
    const electronAPI = (window as any).electronAPI;

    // --- 1. Electron Desktop Environment ---
    if (electronAPI) {
      try {
        setIsSavingToFolder(true);
        logger.info('converter', 'Electron environment detected. Launching native system directory selector...');

        // Let the user choose a target directory
        const directory = await electronAPI.selectDirectory();
        if (!directory) {
          logger.warn('converter', 'Native directory choice canceled by user.');
          setIsSavingToFolder(false);
          return; // Canceled by user
        }

        logger.success('converter', `Native directory selected: "${directory}". Preparing to write files...`);

        // Save each converted image file sequentially to minimize peak IPC memory usage
        for (const fileItem of successfulFiles) {
          if (!fileItem.convertedBlob) continue;
          const pureName = fileItem.name.replace(/\.[^.]+$/, '') + '.jpg';
          logger.info('converter', `Natively writing [${pureName}] to disk...`);
          
          // Read Blob as arrayBuffer
          const arrayBuffer = await fileItem.convertedBlob.arrayBuffer();
          
          // Pass to native writer
          const res = await electronAPI.saveFilesToDirectory(directory, [{
            name: pureName,
            arrayBuffer: new Uint8Array(arrayBuffer)
          }]);

          if (!res || !res.success) {
            throw new Error(res?.error || `Failed to write file "${pureName}" to disk`);
          }
          logger.success('converter', `Successfully wrote file [${pureName}] to system.`);
        }

        logger.success('converter', `Bulk native export complete! Saved ${successfulFiles.length} images to ${directory}`);
        alert(`Successfully saved all ${successfulFiles.length} converted JPG photos natively into folder:\n${directory}`);
      } catch (err: any) {
        logger.error('converter', `Local native folder export failed: ${err.message || String(err)}`);
        alert(`Folder export failed: ${err.message || String(err)}`);
      } finally {
        setIsSavingToFolder(false);
      }
      return;
    }

    // Detect if we are running inside an iframe (e.g. AI Studio development preview)
    const isIframe = typeof window !== 'undefined' && window.self !== window.top;

    // --- 2. Web Browser Environment with File System Access API ---
    if (typeof window !== 'undefined' && 'showDirectoryPicker' in window && !isIframe) {
      try {
        setIsSavingToFolder(true);
        logger.info('converter', 'Web browser context detected. Spawning showDirectoryPicker prompt...');
        
        // Prompt user to select directory
        const directoryHandle = await (window as any).showDirectoryPicker({
          mode: 'readwrite',
        });

        logger.success('converter', `Directory picked and approved: "${directoryHandle.name}". Initializing write streams...`);

        let savedCount = 0;
        for (const fileItem of successfulFiles) {
          if (!fileItem.convertedBlob) continue;
          const pureName = fileItem.name.replace(/\.[^.]+$/, '') + '.jpg';
          logger.info('converter', `Opening writable file stream for "${pureName}"...`);
          
          // Create a new file handle inside selected directory
          const fileHandle = await directoryHandle.getFileHandle(pureName, { create: true });
          
          // Create writeable stream and write Blob
          const writable = await fileHandle.createWritable();
          await writable.write(fileItem.convertedBlob);
          await writable.close();
          
          savedCount++;
          logger.success('converter', `Written file stream completed for "${pureName}"`);
        }

        logger.success('converter', `Web folder export completed. Successfully streamed ${savedCount} photos directly to local directory.`);
        alert(`Successfully exported ${savedCount} converted photos directly into your selected local folder!`);
      } catch (err: any) {
        if (err.name === 'AbortError') {
          logger.warn('converter', 'Web directory picker was canceled by the user.');
          return;
        }
        
        logger.error('converter', `Web folder export stream error: ${err.message || String(err)}`);
        
        // Check for sandboxing or cross-origin policy blockages
        const isSandboxError = err.name === 'SecurityError' || 
                              err.message?.toLowerCase().includes('sandboxed') || 
                              err.message?.toLowerCase().includes('permission') ||
                              err.message?.toLowerCase().includes('not allowed');
                              
        if (isSandboxError) {
          logger.warn('converter', '⚠️ ATTENTION: The Web File System Access API is restricted inside sandboxed preview iframes by browser security policies. Please open this app in a separate browser tab (via the external link) to use folder saving directly, or click "Download All (ZIP)" to retrieve your photos safely.');
        }
        
        alert(`Folder export failed: ${err.message || String(err)}.\n\nNOTE: Browsers block direct folder saving inside preview panels. Please open the app in a new tab or use the "Download All (ZIP)" button.`);
      } finally {
        setIsSavingToFolder(false);
      }
      return;
    }

    // --- 3. Traditional Browser Fallback (e.g. Firefox, Safari, Mobile, or Sandboxed Iframe Preview) ---
    try {
      setIsSavingToFolder(true);
      if (isIframe) {
        logger.warn('converter', 'Direct folder selection is restricted inside sandboxed preview iframes by browser security policies. Triggering discrete automatic sequential downloads directly...');
        
        for (const fileItem of successfulFiles) {
          if (!fileItem.convertedBlob) continue;
          const pureName = fileItem.name.replace(/\.[^.]+$/, '') + '.jpg';
          logger.info('converter', `Triggering discrete anchor download for [${pureName}]...`);
          
          const link = document.createElement('a');
          link.href = URL.createObjectURL(fileItem.convertedBlob);
          link.download = pureName;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          
          // Keep a tiny delay to avoid browser choking on rapid parallel downloads
          await new Promise((resolve) => setTimeout(resolve, 250));
        }
        logger.success('converter', 'Fallback sequential downloads triggered successfully inside preview iframe! (Tip: Open ChronosPro in a separate browser tab to select a custom output folder directly, or click "Download ZIP" to save all photos in one archive.)');
      } else {
        logger.warn('converter', 'File System Access API not supported on this browser/platform. Triggering discrete automatic sequential downloads directly...');
        
        for (const fileItem of successfulFiles) {
          if (!fileItem.convertedBlob) continue;
          const pureName = fileItem.name.replace(/\.[^.]+$/, '') + '.jpg';
          logger.info('converter', `Triggering discrete anchor download for [${pureName}]...`);
          
          const link = document.createElement('a');
          link.href = URL.createObjectURL(fileItem.convertedBlob);
          link.download = pureName;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          
          // Keep a tiny delay to avoid browser choking on rapid parallel downloads
          await new Promise((resolve) => setTimeout(resolve, 250));
        }
        logger.success('converter', 'Fallback sequential downloads triggered successfully.');
      }
    } catch (err: any) {
      logger.error('converter', `Discrete downloads fallback failed: ${err.message || String(err)}`);
    } finally {
      setIsSavingToFolder(false);
    }
  };

  // Clear file lists and revoke object URLs
  const handleClearList = () => {
    files.forEach((f) => {
      if (f.convertedUrl) {
        URL.revokeObjectURL(f.convertedUrl);
      }
    });
    setFiles([]);
    setConversionIndex(0);
  };

  // Convert and send converted photos to the main timelapse workspace timeline
  const handleImportToTimelapse = () => {
    if (!onImportToStudio) return;
    
    const successfulFiles = files.filter((f) => f.status === 'done' && f.convertedBlob);
    if (successfulFiles.length === 0) return;
    
    logger.info('converter', `Packaging ${successfulFiles.length} converted JPG photos for transfer to the Timelapse Workspace...`);
    
    const filesToImport = successfulFiles.map((f) => {
      const pureName = f.name.replace(/\.[^.]+$/, '') + '.jpg';
      return new File([f.convertedBlob!], pureName, { type: 'image/jpeg' });
    });
    
    onImportToStudio(filesToImport);
    logger.success('converter', `Exported ${filesToImport.length} photos to the Timelapse Studio successfully!`);
  };

  // Remove individual file slot
  const removeFile = (id: string) => {
    const target = files.find((f) => f.id === id);
    if (target?.convertedUrl) {
      URL.revokeObjectURL(target.convertedUrl);
    }
    setFiles((prev) => prev.filter((f) => f.id !== id));
  };

  const formatSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const convertedCount = files.filter((f) => f.status === 'done').length;
  const pendingCount = files.filter((f) => f.status === 'pending').length;
  const errorCount = files.filter((f) => f.status === 'error').length;

  return (
    <div className="space-y-6">
      {/* Control Station Panel */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-stretch">
        {/* Dropzone & Loader */}
        <div className="flex flex-col justify-between h-full space-y-4">
          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={handleSelectFilesClick}
            className={`flex-1 flex flex-col items-center justify-center border-2 border-dashed rounded-2xl p-6 md:p-8 transition-all cursor-pointer relative overflow-hidden ${
              isDragging
                ? 'border-blue-500 bg-blue-950/20 scale-[0.99] shadow-inner'
                : 'border-zinc-750 bg-[#0A0A0A] hover:bg-zinc-900/40 hover:border-blue-500/50 shadow-xl'
            }`}
          >
            <input
              type="file"
              ref={fileInputRef}
              onChange={(e) => processUploadedFiles(e.target.files)}
              multiple
              accept=".heic,.heif,.jpg,.jpeg,.png,.webp,.bmp,.avif,.nef,.dng,.cr2,.arw"
              className="hidden"
              id="heic-input"
            />
            
            <div className="absolute top-0 right-0 p-4 opacity-5 pointer-events-none">
              <Sparkles className="w-16 h-16 text-blue-400" />
            </div>

            <div className="max-w-md mx-auto flex flex-col items-center text-center gap-4">
              <div className="p-3 bg-blue-950/40 rounded-full border border-blue-900/30 text-blue-400">
                <Upload className="w-8 h-8 text-blue-400" />
              </div>

              <div className="space-y-2">
                <h3 className="text-sm md:text-base font-bold text-zinc-100 tracking-tight flex flex-wrap items-center justify-center gap-2">
                  Advanced Batch Photo Converter
                  <span className="text-[9px] bg-blue-950/40 text-blue-400 font-mono font-bold px-1.5 py-0.5 rounded border border-blue-900/30">
                    Folder Transcoder & Resizer
                  </span>
                </h3>
                <p className="text-zinc-400 text-xs leading-relaxed max-w-sm">
                  Drag & drop photos or folders here, or <span className="text-blue-400 font-semibold underline">browse files</span> to start.
                </p>
              </div>

              <div className="border-t border-zinc-900/60 pt-3 w-full">
                <p className="text-xs text-zinc-400 leading-relaxed max-w-md mx-auto">
                  Fast, offline transcoding supporting HEIC, AVIF, standard images, & RAW formats (<span className="text-zinc-300">.nef, .dng, .cr2, .arw</span>) securely in your browser.
                </p>
              </div>
            </div>
          </div>

          {/* Overall Converting progress and status */}
          {files.length > 0 && (
            <div className="space-y-3 mt-auto">
              <div className="bg-[#0A0A0A] border border-zinc-805 rounded-2xl p-4 flex flex-col sm:flex-row items-center justify-between gap-3 shadow-xl text-left">
                <div className="flex flex-col gap-0.5 w-full sm:w-auto">
                  <span className="text-[10px] text-zinc-500 uppercase tracking-widest font-mono font-bold">Queue Status</span>
                  <span className="text-zinc-300 text-xs font-semibold flex items-center gap-1.5 mt-0.5">
                    <span className="text-blue-400 font-bold">{convertedCount}</span> converted
                    <span className="text-zinc-700 font-bold">•</span>
                    <span className="text-amber-500 font-semibold">{pendingCount}</span> remaining
                    {errorCount > 0 && (
                      <>
                        <span className="text-zinc-700 font-bold">•</span>
                        <span className="text-red-400 font-semibold flex items-center gap-1">
                          <AlertCircle className="w-3 h-3" /> {errorCount} errors
                        </span>
                      </>
                    )}
                  </span>
                </div>

                {/* Graphical Master Slider Progress */}
                <div className="flex-1 w-full sm:max-w-xs bg-zinc-950 rounded-full h-2.5 overflow-hidden border border-zinc-850">
                  <div 
                    className="bg-blue-600 h-full transition-all duration-300"
                    style={{ width: `${(convertedCount / files.length) * 100}%` }}
                  />
                </div>

                <span className="text-zinc-300 font-mono text-xs font-bold shrink-0">
                  {Math.round((convertedCount / files.length) * 100)}%
                </span>
              </div>

              {/* Import to Timelapse Button */}
              <button
                onClick={handleImportToTimelapse}
                disabled={convertedCount === 0 || isConvertingAll}
                className="w-full py-3 px-4 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 disabled:from-zinc-900 disabled:to-zinc-900 disabled:text-zinc-500 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-all cursor-pointer shadow-lg disabled:shadow-none active:scale-[0.99]"
              >
                <Layers className="w-4 h-4 text-white" />
                <span>Import {convertedCount} Converted Photo{convertedCount === 1 ? '' : 's'} to Timelapse</span>
              </button>
            </div>
          )}
        </div>

        {/* Configuration Column */}
        <div className="bg-[#0A0A0A] border border-zinc-800 rounded-2xl p-5 flex flex-col justify-between h-full shadow-xl text-left">
          <div className="space-y-4">
            <div className="flex items-center gap-2 border-b border-zinc-900 pb-3">
              <SlidersHorizontal className="w-4 h-4 text-blue-400" />
              <h3 className="text-xs font-bold text-zinc-300 uppercase tracking-wider font-mono">Rendering Plan</h3>
            </div>

            {/* Quality Slider Control */}
            <div className="space-y-2">
              <div className="flex justify-between text-xs font-semibold font-mono">
                <span className="text-zinc-400 font-medium">JPEG Quality</span>
                <span className="text-blue-400 font-bold">{Math.round(quality * 100)}%</span>
              </div>
              <input
                type="range"
                min="0.10"
                max="1.00"
                step="0.05"
                value={quality}
                onChange={(e) => setQuality(parseFloat(e.target.value))}
                disabled={isConvertingAll}
                className="w-full h-2 bg-zinc-800 border border-zinc-700 rounded-lg appearance-none cursor-pointer accent-blue-500 hover:bg-zinc-700 transition-all focus:outline-none"
              />
            </div>

            {/* Image Resizing Options */}
            <div className="border-t border-zinc-900 pt-4 space-y-3">
              <div className="flex items-center justify-between">
                <label className="flex items-center gap-2.5 text-xs font-bold text-zinc-300 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={resizeEnabled}
                    onChange={(e) => setResizeEnabled(e.target.checked)}
                    disabled={isConvertingAll}
                    className="rounded border-zinc-700 bg-zinc-950 text-blue-600 focus:ring-blue-500/50 w-4 h-4 cursor-pointer"
                  />
                  <span className="flex items-center gap-1.5">
                    <Scale className="w-4 h-4 text-blue-400" />
                    Enable Resizing
                  </span>
                </label>
              </div>

              {resizeEnabled && (
                <div className="space-y-3 bg-zinc-950 p-3 rounded-xl border border-zinc-900 animate-fadeIn">
                  {/* Resize Mode */}
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[10px] uppercase font-mono font-bold text-zinc-400">Mode:</span>
                    <div className="flex bg-zinc-900 p-0.5 rounded-lg text-[10px] w-36 border border-zinc-800">
                      <button
                        type="button"
                        onClick={() => setResizeModeFit(true)}
                        className={`flex-1 py-1 text-center font-bold rounded-md transition-all cursor-pointer ${
                          resizeModeFit
                            ? 'bg-[#0A0A0A] text-zinc-100 shadow-sm border border-zinc-800'
                            : 'text-zinc-500 hover:text-zinc-300'
                        }`}
                      >
                        Fit (Ratio)
                      </button>
                      <button
                        type="button"
                        onClick={() => setResizeModeFit(false)}
                        className={`flex-1 py-1 text-center font-bold rounded-md transition-all cursor-pointer ${
                          !resizeModeFit
                            ? 'bg-[#0A0A0A] text-zinc-100 shadow-sm border border-zinc-800'
                            : 'text-zinc-500 hover:text-zinc-300'
                        }`}
                      >
                        Stretch
                      </button>
                    </div>
                  </div>

                  {/* Dimensions inputs */}
                  <div className="grid grid-cols-2 gap-2.5">
                    <div className="flex items-center justify-between gap-1.5 bg-zinc-900 border border-zinc-800 rounded-lg px-2.5 py-1.5">
                      <span className="text-[9px] font-mono text-zinc-500 font-bold">W</span>
                      <input
                        type="number"
                        min="100"
                        max="10000"
                        value={resizeWidth}
                        onChange={(e) => setResizeWidth(Math.max(100, parseInt(e.target.value) || 0))}
                        disabled={isConvertingAll}
                        className="w-full text-right text-xs text-zinc-200 focus:outline-none bg-transparent font-mono"
                      />
                      <span className="text-[9px] font-mono text-zinc-500">px</span>
                    </div>
                    <div className="flex items-center justify-between gap-1.5 bg-zinc-900 border border-zinc-800 rounded-lg px-2.5 py-1.5">
                      <span className="text-[9px] font-mono text-zinc-500 font-bold">H</span>
                      <input
                        type="number"
                        min="100"
                        max="10000"
                        value={resizeHeight}
                        onChange={(e) => setResizeHeight(Math.max(100, parseInt(e.target.value) || 0))}
                        disabled={isConvertingAll}
                        className="w-full text-right text-xs text-zinc-200 focus:outline-none bg-transparent font-mono"
                      />
                      <span className="text-[9px] font-mono text-zinc-500">px</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Operations stack */}
          <div className="space-y-2.5 pt-4 border-t border-zinc-900 mt-4">
            <button
              onClick={handleConvertAll}
              disabled={isConvertingAll || files.length === 0 || pendingCount === 0}
              className="w-full py-3 px-4 bg-blue-600 border border-transparent hover:border-blue-400 hover:bg-blue-500 disabled:bg-zinc-900 disabled:text-zinc-500 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-all cursor-pointer shadow-lg disabled:shadow-none"
            >
              {isConvertingAll ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin text-white flex-shrink-0" />
                  <span className="truncate">Converting ({conversionIndex}/{files.length})</span>
                </>
              ) : (
                <>
                  <Play className="w-4 h-4 text-white fill-current flex-shrink-0" />
                  <span className="truncate">Start Batch Conversion</span>
                </>
              )}
            </button>

            <div className="grid grid-cols-2 gap-2.5">
              <button
                onClick={handleSaveToFolder}
                disabled={convertedCount === 0 || isConvertingAll || isSavingToFolder}
                className="py-2.5 px-2 bg-blue-950/40 hover:bg-blue-900/40 disabled:bg-zinc-900 disabled:text-zinc-500 text-blue-300 border border-blue-900/30 rounded-xl text-[11px] font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer shadow-md"
                title={
                  typeof window !== 'undefined' && 'electronAPI' in window
                    ? 'Natively write individual JPG files directly into any local disk directory'
                    : typeof window !== 'undefined' && 'showDirectoryPicker' in window
                    ? 'Uses modern high-performance browser directory features to write JPGs directly to a local folder without a ZIP archive!'
                    : 'Saves individual JPG files sequentially on your computer!'
                }
              >
                {isSavingToFolder ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-400 flex-shrink-0" />
                    <span className="truncate">Saving...</span>
                  </>
                ) : (
                  <>
                    <Folder className="w-3.5 h-3.5 text-blue-400 flex-shrink-0" />
                    <span className="truncate">Save to Folder</span>
                  </>
                )}
              </button>

              <button
                onClick={handleDownloadAllZip}
                disabled={convertedCount === 0 || isConvertingAll || isZipping}
                className="py-2.5 px-2 bg-zinc-900 hover:bg-zinc-850 border border-zinc-800 disabled:bg-zinc-950 disabled:border-none disabled:text-zinc-600 text-zinc-350 rounded-xl text-[11px] font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer shadow-md"
              >
                {isZipping ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-zinc-405 flex-shrink-0" />
                    <span className="truncate">Zipping...</span>
                  </>
                ) : (
                  <>
                    <FolderArchive className="w-3.5 h-3.5 text-blue-400 flex-shrink-0" />
                    <span className="truncate">Download ZIP</span>
                  </>
                )}
              </button>
            </div>

            {/* CLEAR LIST */}
            <button
              onClick={handleClearList}
              disabled={files.length === 0 || isConvertingAll}
              className="w-full py-2 px-3 bg-transparent hover:bg-red-950/20 text-zinc-400 hover:text-red-400 rounded-xl text-[11px] font-bold flex items-center justify-center gap-2 transition-all cursor-pointer"
            >
              <Trash2 className="w-4 h-4 flex-shrink-0" />
              <span>Clear Queue List</span>
            </button>
          </div>
        </div>
      </div>

      {/* Grid file display queue */}
      {files.length > 0 ? (
        <div className="bg-[#0A0A0A] border border-zinc-800 rounded-2xl p-6 shadow-xl text-left">
          <div className="flex items-center justify-between mb-4 border-b border-zinc-900 pb-3">
            <span className="text-xs text-zinc-400 font-bold tracking-wider uppercase font-mono">Conversion Queue ({files.length})</span>
            <span className="text-[10px] text-zinc-500 font-mono">Click preview frame to export single JPEG files</span>
          </div>

          {errorCount > 0 && (
            <div className="mb-4 bg-red-950/20 border border-red-900/40 rounded-xl p-4 flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5 animate-pulse" />
              <div className="text-xs text-red-200 space-y-1.5 leading-relaxed">
                <p className="font-bold text-red-300">Some HEIC photos failed to transcode</p>
                {typeof window !== 'undefined' && 'electronAPI' in window ? (
                  <p className="text-red-350 font-medium">
                    You are running inside the <strong>Electron Desktop App</strong> which utilizes optimized native background threads. If a photo still fails to load, the capture may be corrupted or in an unsupported high bit-depth format. Please verify the source file's integrity.
                  </p>
                ) : (
                  <p className="text-red-350 font-medium">
                    Browser-based environments are powered by standard WebAssembly decoders which only support standard <strong>8-bit HEIC files</strong>. High Dynamic Range (<strong>10-bit HDR, Apple ProRAW HDR, or Samsung HDR10+</strong>) captures cannot be fully decoded inside a standard web browser.
                  </p>
                )}
                <p className="font-bold text-[11px] pt-1 text-red-300">
                  💡 Recommended Workarounds:
                </p>
                <ul className="list-disc pl-5 space-y-1.5 mt-0.5 font-normal text-red-300/90">
                  {!(typeof window !== 'undefined' && 'electronAPI' in window) && (
                    <li className="text-blue-200 font-semibold bg-blue-950/30 p-2 rounded-lg border border-blue-900/30 my-1">
                      🚀 <strong>Use the Electron Desktop App</strong>: Pack and launch your local build (`npm run electron:start` or `npm run package`) which activates <strong>GPU-accelerated, native zero-memory-limit converters</strong> (including macOS `sips` integration) to bypass browser bounds completely!
                    </li>
                  )}
                  <li><strong>For Samsung Galaxy:</strong> Go to Camera Settings ➔ Advanced picture options ➔ Toggle off <strong>"HDR10+ pictures / High bit-depth HEIF"</strong>.</li>
                  <li><strong>For iPhone/iOS:</strong> Go to Settings ➔ Camera ➔ Formats ➔ Select <strong>"Most Compatible"</strong> (captures in JPEG) or disable <strong>Apple ProRAW / Auto-HDR</strong> high-depth capture.</li>
                  <li><strong>Alternative:</strong> Convert high-bitrate photos using native tools (such as Preview on Mac or Photos on Windows) first, then import standard files.</li>
                </ul>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4">
            {files.map((fileItem) => (
              <div 
                key={fileItem.id} 
                className="bg-zinc-950 border border-zinc-900 rounded-xl p-3 flex items-center gap-3 relative group hover:border-zinc-700 hover:bg-zinc-900/20 transition-all overflow-hidden shadow-md"
              >
                {/* Visual Image Preview Panel */}
                <div 
                  onClick={() => fileItem.status === 'done' && downloadSingle(fileItem)}
                  className={`w-14 h-14 rounded-lg bg-zinc-900 overflow-hidden flex items-center justify-center relative flex-shrink-0 cursor-pointer ${
                    fileItem.status === 'done' ? 'ring-2 ring-blue-500/10 border border-blue-900/30' : 'border border-zinc-800'
                  }`}
                >
                  {fileItem.status === 'done' && fileItem.convertedUrl ? (
                    <img 
                      src={fileItem.convertedUrl} 
                      alt="Thumbnail" 
                      className="w-full h-full object-cover group-hover:scale-105 transition-all"
                      referrerPolicy="no-referrer"
                    />
                  ) : fileItem.status === 'converting' ? (
                    <Loader2 className="w-5 h-5 text-blue-400 animate-spin" />
                  ) : (
                    <ImageIcon className="w-6 h-6 text-zinc-600" />
                  )}
                </div>

                {/* Details column */}
                <div className="flex-1 min-w-0 pr-6">
                  <p className="text-zinc-200 text-xs font-bold truncate font-mono" title={fileItem.name}>
                    {fileItem.name}
                  </p>
                  <p className="text-zinc-500 font-mono text-[10px] mt-1 font-bold">
                    {formatSize(fileItem.size)}
                  </p>

                  {/* Progress / Status Tag */}
                  <div className="mt-1.5 flex items-center gap-1.5">
                    {fileItem.status === 'pending' && (
                      <span className="text-[10px] font-mono font-bold text-zinc-400 bg-zinc-900 px-1.5 py-0.5 rounded border border-zinc-800">
                        Pending
                      </span>
                    )}
                    {fileItem.status === 'converting' && (
                      <span className="text-[10px] font-mono font-bold text-blue-300 bg-blue-950/30 px-1.5 py-0.5 rounded border border-blue-900/30">
                        Converting
                      </span>
                    )}
                    {fileItem.status === 'done' && (
                      <span className="text-[10px] font-mono font-bold text-emerald-400 bg-emerald-950/30 px-1.5 py-0.5 rounded border border-emerald-900/30 flex items-center gap-1">
                        <CheckCircle2 className="w-2.5 h-2.5" /> Done
                      </span>
                    )}
                    {fileItem.status === 'error' && (
                      <span 
                        className="text-[10px] font-mono font-bold text-red-400 bg-red-950/30 px-1.5 py-0.5 rounded border border-red-900/30 flex items-center gap-1 truncate max-w-full"
                        title={fileItem.errorMsg}
                      >
                        <AlertCircle className="w-2.5 h-2.5 flex-shrink-0" /> Error
                      </span>
                    )}
                  </div>
                </div>

                {/* Single file download & deletion */}
                <div className="absolute right-2 top-2 bottom-2 flex flex-col justify-between opacity-50 group-hover:opacity-100 transition-all z-10">
                  <button
                    onClick={() => removeFile(fileItem.id)}
                    disabled={isConvertingAll}
                    className="p-1 text-zinc-500 hover:text-red-400 hover:bg-zinc-900 rounded-md transition-all cursor-pointer disabled:opacity-30"
                    title="Remove item"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>

                  {fileItem.status === 'done' && (
                    <button
                      onClick={() => downloadSingle(fileItem)}
                      className="p-1 text-zinc-500 hover:text-blue-400 hover:bg-zinc-900 rounded-md transition-all cursor-pointer"
                      title="Download JPG"
                    >
                      <Download className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="bg-[#0A0A0A] border border-zinc-800 rounded-2xl p-12 text-center text-zinc-550 shadow-xl">
          <FolderArchive className="w-12 h-12 text-zinc-700 mx-auto mb-3" />
          <p className="text-zinc-300 font-bold">Your transcoding queue is empty</p>
          <p className="text-zinc-500 text-xs mt-1.5 font-mono">Upload HEIC or standard images/folders above to transcode them into highly polished JPEGs instantly</p>
        </div>
      )}
    </div>
  );
}
