/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

let scriptLoadingPromise: Promise<any> | null = null;

/**
 * Ensures the heic2any script is loaded into the browser context.
 */
export function loadHeic2Any(): Promise<any> {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('Browser context required.'));
  }

  // Check if already loaded
  if ((window as any).heic2any) {
    return Promise.resolve((window as any).heic2any);
  }

  if (scriptLoadingPromise) {
    return scriptLoadingPromise;
  }

  scriptLoadingPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/heic2any@0.0.4/dist/heic2any.js';
    script.async = true;
    script.onload = () => {
      if ((window as any).heic2any) {
        resolve((window as any).heic2any);
      } else {
        reject(new Error('Failed to initialize heic2any.'));
      }
    };
    script.onerror = () => {
      scriptLoadingPromise = null;
      reject(new Error('Failed to load HEIC converter script (heic2any) from CDN. Please verify network access.'));
    };
    document.head.appendChild(script);
  });

  return scriptLoadingPromise;
}

/**
 * Converts a HEIC Blob into a standard high-quality JPG Blob.
 */
export async function convertHEICtoJPG(
  blob: Blob,
  quality: number = 0.85
): Promise<Blob> {
  // If running in Electron, use our native high-fidelity fast converter
  const electronAPI = (typeof window !== 'undefined') ? (window as any).electronAPI : null;
  if (electronAPI && typeof electronAPI.convertHeic === 'function') {
    try {
      const arrayBuffer = await blob.arrayBuffer();
      const uint8Array = await electronAPI.convertHeic(arrayBuffer, quality);
      return new Blob([uint8Array], { type: 'image/jpeg' });
    } catch (err: any) {
      console.error('Electron native converter failed, falling back to browser-based converter...', err);
      // Fall through to standard heic2any
    }
  }

  const heic2any = await loadHeic2Any();

  // Try standard conversion first
  try {
    const response = await heic2any({
      blob,
      toType: 'image/jpeg',
      quality: quality,
    });

    if (Array.isArray(response)) {
      if (response.length > 0) {
        return response[0];
      }
      throw new Error('Empty response returned from converter.');
    }
    return response;
  } catch (err: any) {
    const errMsg = err?.message || String(err);
    console.warn('Standard HEIC conversion failed, retrying with multiple: true...', errMsg);
    
    // Automatically retry with multiple: true in case it is a multi-frame container,
    // burst photo, portrait depth-map photo, or live image representation.
    try {
      const response = await heic2any({
        blob,
        toType: 'image/jpeg',
        quality: quality,
        multiple: true,
      });

      if (Array.isArray(response)) {
        if (response.length > 0) {
          return response[0];
        }
        throw new Error('Multi-frame converter returned an empty list.');
      }
      if (response) {
        return response;
      }
      throw new Error('Empty response.');
    } catch (retryErr: any) {
      const retryErrMsg = retryErr?.message || String(retryErr);
      console.error('HEIC multi-frame conversion retry also failed:', retryErrMsg);

      // Analyze the error message to provide a highly descriptive diagnostic report
      let diagnosis = 'HEIC decoding failed.';
      
      const isBitDepth = 
        retryErrMsg.toLowerCase().includes('bit-depth') || 
        retryErrMsg.toLowerCase().includes('bitdepth') ||
        retryErrMsg.toLowerCase().includes('depth') ||
        retryErrMsg.toLowerCase().includes('format') ||
        retryErrMsg.toLowerCase().includes('unsupported') ||
        retryErrMsg.toLowerCase().includes('codec') ||
        retryErrMsg.toLowerCase().includes('null') ||
        retryErrMsg.includes('libheif error') ||
        retryErrMsg.includes('TypeError');

      if (isBitDepth) {
        diagnosis = 'Unsupported format (likely 10-bit HDR / ProRAW / HDR10+). Browser or web-based decoders only support standard 8-bit formats. To resolve, disable HDR10+/high bit-depth in camera settings, or convert via native OS tools.';
      } else {
        diagnosis = `HEIC decoding error: ${retryErrMsg}. Verify image integrity.`;
      }
      
      throw new Error(diagnosis);
    }
  }
}

/**
 * Resizes an image Blob using Canvas API.
 */
export function resizeImage(
  blob: Blob,
  targetWidth: number,
  targetHeight: number,
  fit: boolean = true,
  quality: number = 0.85
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      let newWidth = targetWidth;
      let newHeight = targetHeight;

      if (fit) {
        const scale = Math.min(targetWidth / (img.naturalWidth || 1), targetHeight / (img.naturalHeight || 1)) || 1;
        
        // Prevent upscale if original is smaller than target
        if (scale < 1) {
          newWidth = Math.round(img.naturalWidth * scale) || targetWidth;
          newHeight = Math.round(img.naturalHeight * scale) || targetHeight;
        } else {
          newWidth = img.naturalWidth || targetWidth;
          newHeight = img.naturalHeight || targetHeight;
        }
      }

      const canvas = document.createElement('canvas');
      canvas.width = newWidth;
      canvas.height = newHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('Failed to get canvas 2d context.'));
        return;
      }

      // Draw image onto canvas
      ctx.drawImage(img, 0, 0, newWidth, newHeight);

      // Export canvas to Blob
      canvas.toBlob(
        (resizedBlob) => {
          if (resizedBlob) {
            resolve(resizedBlob);
          } else {
            reject(new Error('Failed to generate resized blob from canvas.'));
          }
        },
        'image/jpeg',
        quality
      );
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Failed to load image for resizing.'));
    };
    img.src = url;
  });
}

/**
 * Helper to get the image width/height from a Blob URL.
 */
export function getImageDimensions(url: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      resolve({ width: img.naturalWidth || 1920, height: img.naturalHeight || 1080 });
    };
    img.onerror = () => {
      resolve({ width: 1920, height: 1080 }); // default fallback
    };
    img.src = url;
  });
}
