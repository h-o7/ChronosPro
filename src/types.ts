export interface TimelapseFrame {
  id: string;
  name: string;
  size: number;
  type: string;
  lastModified: number;
  previewUrl: string; // Blob URL of decoded image (JPG/GIF, or extracted JPG from NEF)
  status: 'loading' | 'ready' | 'error';
  errorMessage?: string;
  width?: number; // Decoded pixel dimensions
  height?: number;
  dateTaken?: Date; // Parsed from EXIF metadata or fallback to lastModified
  file?: File; // Store original File/Blob for IndexedDB persistence
}

export interface ExportSettings {
  frameRate: number; // e.g., 24 FPS
  resolutionWidth: number; // e.g., 1920
  resolutionHeight: number; // e.g., 1080
  aspectRatio: '16:9' | '4:3' | '1:1' | '9:16' | 'original';
  speedMultiplier: number; // 1x, 2x, etc. (skips frames or repeats them)
  loop: boolean;
  exportFormat: 'webm' | 'mp4' | 'frames-zip';
  videoQuality: 'standard' | 'high' | 'lossless';
}

export interface PlaybackState {
  isPlaying: boolean;
  currentFrameIndex: number;
  fps: number;
}

export interface WorkLogEntry {
  timestamp: string;
  type: 'info' | 'success' | 'warn' | 'error';
  message: string;
}

export interface HEICFile {
  id: string;
  file: File;
  name: string;
  size: number;
  status: 'pending' | 'converting' | 'done' | 'error';
  progress: number;
  convertedBlob?: Blob;
  convertedUrl?: string;
  errorMsg?: string;
}

export type ActiveTab = 'studio' | 'heic' | 'worklog';

