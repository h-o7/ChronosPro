/**
 * db.ts - Unified IndexedDB Storage Manager for Offline-First Session Persistence
 * 
 * Provides robust client-side storage for:
 * - Studio sequence frames (including the raw original File/Blob objects).
 * - HEIC converter queue items (including raw source and converted baseline JPEG blobs).
 * 
 * This enables the application to survive browser tab backgrounding, iframe reloads,
 * and standard workspace switches without losing any uploaded content or conversion progress.
 */

import { TimelapseFrame, HEICFile } from '../types';

const DB_NAME = 'ChronosProStudioDB';
const DB_VERSION = 1;
const STORE_STUDIO = 'studio_frames';
const STORE_HEIC = 'heic_converter';

/**
 * Initializes and returns a connection to the IndexedDB database
 */
export function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (e) => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_STUDIO)) {
        db.createObjectStore(STORE_STUDIO, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORE_HEIC)) {
        db.createObjectStore(STORE_HEIC, { keyPath: 'id' });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

// ============================================================================
// STUDIO FRAMES STORAGE CONTROLS
// ============================================================================

/**
 * Saves all active timeline frames to IndexedDB, retaining raw File streams
 */
export async function saveStudioFrames(frames: TimelapseFrame[]): Promise<void> {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_STUDIO, 'readwrite');
    const store = tx.objectStore(STORE_STUDIO);

    // Clear existing records first to maintain strict sequence parity
    store.clear();

    for (const frame of frames) {
      // Serialize only the cloneable fields (exclude preview URL, save raw File)
      const { previewUrl, ...serializable } = frame;
      store.put(serializable);
    }

    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (err) {
    console.error('[DB] Failed to save studio frames:', err);
  }
}

/**
 * Loads and restores all persisted timeline frames from IndexedDB
 */
export async function loadStudioFrames(): Promise<TimelapseFrame[]> {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_STUDIO, 'readonly');
    const store = tx.objectStore(STORE_STUDIO);
    const request = store.getAll();

    const results = await new Promise<any[]>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });

    // Reconstruct valid Blob URLs for each frame
    return results.map((item) => {
      let previewUrl = '';
      if (item.file) {
        previewUrl = URL.createObjectURL(item.file);
      }
      return {
        ...item,
        previewUrl,
      };
    });
  } catch (err) {
    console.error('[DB] Failed to load studio frames:', err);
    return [];
  }
}

/**
 * Truncates and clears all cached studio timeline frames from persistent storage
 */
export async function clearStudioFrames(): Promise<void> {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_STUDIO, 'readwrite');
    tx.objectStore(STORE_STUDIO).clear();
  } catch (err) {
    console.error('[DB] Failed to clear studio frames:', err);
  }
}

// ============================================================================
// HEIC CONVERTER STORAGE CONTROLS
// ============================================================================

/**
 * Saves all batch HEIC conversion items to IndexedDB
 */
export async function saveHEICFiles(files: HEICFile[]): Promise<void> {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_HEIC, 'readwrite');
    const store = tx.objectStore(STORE_HEIC);

    // Wipe store to represent current state exactly
    store.clear();

    for (const item of files) {
      // Exclude unstable object URLs, retain decoded buffers and files
      const { convertedUrl, ...serializable } = item;
      store.put(serializable);
    }

    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (err) {
    console.error('[DB] Failed to save HEIC files:', err);
  }
}

/**
 * Loads and restores HEIC converter items, generating fresh Blob URLs where appropriate
 */
export async function loadHEICFiles(): Promise<HEICFile[]> {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_HEIC, 'readonly');
    const store = tx.objectStore(STORE_HEIC);
    const request = store.getAll();

    const results = await new Promise<any[]>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });

    return results.map((item) => {
      let convertedUrl = '';
      if (item.convertedBlob && item.status === 'done') {
        convertedUrl = URL.createObjectURL(item.convertedBlob);
      }
      return {
        ...item,
        convertedUrl,
      };
    });
  } catch (err) {
    console.error('[DB] Failed to load HEIC files:', err);
    return [];
  }
}

/**
 * Truncates and clears the HEIC batch conversion persistent store
 */
export async function clearHEICFiles(): Promise<void> {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_HEIC, 'readwrite');
    tx.objectStore(STORE_HEIC).clear();
  } catch (err) {
    console.error('[DB] Failed to clear HEIC files:', err);
  }
}
