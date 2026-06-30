import { TimelapseFrame } from '../types';

/**
 * Parses dynamic GIF/JPG/NEF files, extracts embedded images for NEFs,
 * and recovers original metadata such as dimensions and DateTimeOriginal.
 */

// Helper to read Uint16 from byte array
function readUint16(bytes: Uint8Array, offset: number, isLittleEndian: boolean): number {
  if (isLittleEndian) {
    return bytes[offset] | (bytes[offset + 1] << 8);
  } else {
    return (bytes[offset] << 8) | bytes[offset + 1];
  }
}

// Helper to read Uint32 from byte array
function readUint32(bytes: Uint8Array, offset: number, isLittleEndian: boolean): number {
  if (isLittleEndian) {
    return (bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16) | (bytes[offset + 3] << 24)) >>> 0;
  } else {
    return ((bytes[offset] << 24) | (bytes[offset + 1] << 16) | (bytes[offset + 2] << 8) | bytes[offset + 3]) >>> 0;
  }
}

// Helper to read ASCII string
function readAscii(bytes: Uint8Array, offset: number, count: number): string {
  let str = '';
  for (let i = 0; i < count; i++) {
    const charCode = bytes[offset + i];
    if (charCode === 0) break; // Null terminator
    str += String.fromCharCode(charCode);
  }
  return str.trim();
}

// Parses EXIF DateTimeOriginal format "YYYY:MM:DD HH:MM:SS"
function parseExifDateString(dateStr: string): Date | undefined {
  const parts = dateStr.split(' ');
  if (parts.length < 2) return undefined;
  
  const dateParts = parts[0].split(':');
  const timeParts = parts[1].split(':');
  if (dateParts.length < 3 || timeParts.length < 2) return undefined;
  
  const year = parseInt(dateParts[0], 10);
  const month = parseInt(dateParts[1], 10) - 1; // 0-based
  const day = parseInt(dateParts[2], 10);
  const hour = parseInt(timeParts[0], 10);
  const minute = parseInt(timeParts[1], 10);
  const second = timeParts[2] ? parseInt(timeParts[2], 10) : 0;
  
  if (isNaN(year) || isNaN(month) || isNaN(day) || isNaN(hour) || isNaN(minute)) return undefined;
  return new Date(year, month, day, hour, minute, second);
}

// Inner structure to parse an EXIF IFD
function parseIFD(bytes: Uint8Array, startOffset: number, ifdOffset: number, isLittleEndian: boolean, visitedOffsets: Set<number>): { dateTaken?: Date } {
  const tags: { dateTaken?: Date } = {};
  if (ifdOffset >= bytes.length - 2) return tags;
  
  visitedOffsets.add(ifdOffset);
  const numEntries = readUint16(bytes, ifdOffset, isLittleEndian);
  let entryOffset = ifdOffset + 2;
  
  if (entryOffset + numEntries * 12 > bytes.length) return tags;
  
  for (let i = 0; i < numEntries; i++) {
    const tag = readUint16(bytes, entryOffset, isLittleEndian);
    const count = readUint32(bytes, entryOffset + 4, isLittleEndian);
    const valueOrOffset = readUint32(bytes, entryOffset + 8, isLittleEndian);
    
    if (tag === 0x9003 || tag === 0x0132 || tag === 0x9004) {
      let dataOffset = valueOrOffset;
      if (count <= 4) {
        dataOffset = entryOffset + 8;
      } else {
        dataOffset = startOffset + valueOrOffset;
      }
      
      if (dataOffset + count < bytes.length) {
        const dateStr = readAscii(bytes, dataOffset, count);
        const date = parseExifDateString(dateStr);
        if (date) {
          tags.dateTaken = date;
          if (tag === 0x9003) return tags;
        }
      }
    }
    entryOffset += 12;
  }
  return tags;
}

// Parses raw TIFF Header and directories
export function parseTiffHeaderAndIFD(bytes: Uint8Array, startOffset: number): { dateTaken?: Date } {
  const tags: { dateTaken?: Date } = {};
  
  if (bytes.length < startOffset + 8) return tags;
  
  let isLittleEndian = true;
  if (bytes[startOffset] === 0x49 && bytes[startOffset + 1] === 0x49) {
    isLittleEndian = true;
  } else if (bytes[startOffset] === 0x4D && bytes[startOffset + 1] === 0x4D) {
    isLittleEndian = false;
  } else {
    return tags;
  }
  
  const magic = readUint16(bytes, startOffset + 2, isLittleEndian);
  if (magic !== 42) return tags;
  
  const firstIfdOffset = readUint32(bytes, startOffset + 4, isLittleEndian);
  if (firstIfdOffset === 0 || startOffset + firstIfdOffset >= bytes.length) return tags;
  
  let ifdOffset = startOffset + firstIfdOffset;
  const visitedOffsets = new Set<number>();
  
  while (ifdOffset !== startOffset && ifdOffset < bytes.length - 2 && !visitedOffsets.has(ifdOffset)) {
    visitedOffsets.add(ifdOffset);
    const numEntries = readUint16(bytes, ifdOffset, isLittleEndian);
    let entryOffset = ifdOffset + 2;
    
    if (entryOffset + numEntries * 12 > bytes.length) break;
    
    for (let i = 0; i < numEntries; i++) {
      const tag = readUint16(bytes, entryOffset, isLittleEndian);
      const count = readUint32(bytes, entryOffset + 4, isLittleEndian);
      const valueOrOffset = readUint32(bytes, entryOffset + 8, isLittleEndian);
      
      if (tag === 0x9003 || tag === 0x0132 || tag === 0x9004) {
        let dataOffset = valueOrOffset;
        if (count <= 4) {
          dataOffset = entryOffset + 8;
        } else {
          dataOffset = startOffset + valueOrOffset;
        }
        
        if (dataOffset + count < bytes.length) {
          const dateStr = readAscii(bytes, dataOffset, count);
          const date = parseExifDateString(dateStr);
          if (date) {
            tags.dateTaken = date;
            if (tag === 0x9003) return tags;
          }
        }
      }
      
      if (tag === 0x8769) { // Exif IFD Pointer
        const exifIfdOffset = startOffset + valueOrOffset;
        if (exifIfdOffset < bytes.length && !visitedOffsets.has(exifIfdOffset)) {
          const innerTags = parseIFD(bytes, startOffset, exifIfdOffset, isLittleEndian, visitedOffsets);
          if (innerTags.dateTaken) {
            tags.dateTaken = innerTags.dateTaken;
          }
        }
      }
      
      entryOffset += 12;
    }
    
    const nextIfdOffset = readUint32(bytes, entryOffset, isLittleEndian);
    if (nextIfdOffset === 0) break;
    ifdOffset = startOffset + nextIfdOffset;
  }
  
  return tags;
}

// Scrapes APP1 EXIF segment from a JPEG byte stream
export function getExifDateFromJpeg(bytes: Uint8Array): Date | undefined {
  const len = bytes.length;
  if (len < 10) return undefined;
  if (bytes[0] !== 0xFF || bytes[1] !== 0xD8) return undefined;
  
  let i = 2;
  while (i < len - 4) {
    if (bytes[i] === 0xFF) {
      const marker = bytes[i + 1];
      if (marker === 0xE1) { // APP1 segment containing EXIF
        const app1Len = (bytes[i + 2] << 8) | bytes[i + 3];
        const possibleExif = i + 4;
        if (possibleExif + 6 < len &&
            bytes[possibleExif] === 0x45 && // E
            bytes[possibleExif + 1] === 0x78 && // x
            bytes[possibleExif + 2] === 0x69 && // i
            bytes[possibleExif + 3] === 0x66 && // f
            bytes[possibleExif + 4] === 0 &&
            bytes[possibleExif + 5] === 0) {
          
          const tiffStart = possibleExif + 6;
          const tags = parseTiffHeaderAndIFD(bytes, tiffStart);
          if (tags.dateTaken) return tags.dateTaken;
        }
        i += 2 + app1Len;
      } else if (marker === 0xD9 || marker === 0xDA) {
        break; // Stop headers scanning once compressed scan data begins
      } else {
        const segmentLen = (bytes[i + 2] << 8) | bytes[i + 3];
        i += 2 + segmentLen;
      }
    } else {
      i++;
    }
  }
  return undefined;
}

/**
 * Searches the byte buffer of a RAW Nikon (NEF) file for embedded JPEG preview images,
 * and recovers the largest JPEG file (complete with headers) to serve as a high-fidelity rendering.
 */
export function extractEmbeddedJpegFromNef(arrayBuffer: ArrayBuffer): Blob | null {
  const bytes = new Uint8Array(arrayBuffer);
  const len = bytes.length;
  
  // Scrapes for JPEG SOI (Start Of Image) markers: [FF D8 FF]
  const soiIndices: number[] = [];
  for (let i = 0; i < len - 2; i++) {
    if (bytes[i] === 0xFF && bytes[i + 1] === 0xD8 && bytes[i + 2] === 0xFF) {
      soiIndices.push(i);
    }
  }
  
  if (soiIndices.length === 0) return null;
  const foundJpegs: { blob: Blob; size: number }[] = [];
  
  for (const start of soiIndices) {
    let index = start + 2;
    let foundEoi = false;
    let endOfImage = -1;
    
    while (index < len - 1) {
      if (bytes[index] === 0xFF) {
        const marker = bytes[index + 1];
        
        if (marker === 0xD9) { // End of Image
          endOfImage = index + 2;
          foundEoi = true;
          break;
        } else if (marker === 0x00) {
          index += 2; // Stuffed byte skip
        } else if (marker >= 0xD0 && marker <= 0xD7) {
          index += 2; // Restart markers - no length info
        } else if (marker === 0x01 || marker === 0xFF) {
          index += 1;
        } else if (marker === 0xDA) { // Start of Scan (entropy-coded payload)
          if (index + 3 < len) {
            const segLen = (bytes[index + 2] << 8) | bytes[index + 3];
            index += 2 + segLen;
            
            // Search bitstream for standard EOI: FF D9 marker
            while (index < len - 1) {
              if (bytes[index] === 0xFF && bytes[index + 1] === 0xD9) {
                endOfImage = index + 2;
                foundEoi = true;
                break;
              }
              index++;
            }
          }
          break;
        } else {
          // Standard segment with 16-bit length info
          if (index + 3 < len) {
            const segLen = (bytes[index + 2] << 8) | bytes[index + 3];
            index += 2 + segLen;
          } else {
            break;
          }
        }
      } else {
        index++;
      }
    }
    
    if (foundEoi && endOfImage > start) {
      const jpegData = bytes.subarray(start, endOfImage);
      if (jpegData.length > 1000) { // Exclude micro icon fragments
        foundJpegs.push({
          blob: new Blob([jpegData], { type: 'image/jpeg' }),
          size: jpegData.length
        });
      }
    }
  }
  
  // Fallback scan: simple match between SOI and first matching EOI if segment parsing bounds are broken
  if (foundJpegs.length === 0) {
    for (const start of soiIndices) {
      let end = -1;
      for (let i = start + 500; i < len - 1; i++) { // Skip local header bytes
        if (bytes[i] === 0xFF && bytes[i + 1] === 0xD9) {
          end = i + 2;
          break;
        }
      }
      if (end !== -1 && (end - start) > 1000) {
        const jpegData = bytes.subarray(start, end);
        foundJpegs.push({
          blob: new Blob([jpegData], { type: 'image/jpeg' }),
          size: jpegData.length
        });
      }
    }
  }
  
  if (foundJpegs.length === 0) return null;
  
  // Select the largest extracted JPEG because cameras often embed tiny icons alongside high-res previews.
  foundJpegs.sort((a, b) => b.size - a.size);
  return foundJpegs[0].blob;
}

/**
 * Parses user uploaded file objects (JPG, GIF, NEF).
 * Converts NEF to object URLs using full-size scrapers, extracts EXIF info,
 * and pre-calculates image dimensions.
 */
export async function parseUploadFile(file: File): Promise<Partial<TimelapseFrame>> {
  const extension = file.name.split('.').pop()?.toLowerCase();
  
  let previewUrl = '';
  let dateTaken: Date | undefined;
  
  const rawExtensions = ['nef', 'dng', 'cr2', 'arw'];
  const isRaw = rawExtensions.includes(extension || '');
  
  if (isRaw) {
    const arrayBuffer = await file.arrayBuffer();
    // Parse Date Taken from RAW/TIFF header directory
    try {
      const bytes = new Uint8Array(arrayBuffer);
      const tiffMeta = parseTiffHeaderAndIFD(bytes, 0);
      if (tiffMeta.dateTaken) {
        dateTaken = tiffMeta.dateTaken;
      }
    } catch (e) {
      console.warn(`Could not parse ${extension?.toUpperCase()} EXIF`, e);
    }
    
    // Extract full JPEG embedded preview 
    const jpegBlob = extractEmbeddedJpegFromNef(arrayBuffer);
    if (jpegBlob) {
      previewUrl = URL.createObjectURL(jpegBlob);
    } else {
      throw new Error(`RawExtractionFailed: No preview JPEG embedded in ${extension?.toUpperCase()} file.`);
    }
  } else {
    // JPG, AVIF, WebP, PNG, GIF, or others
    previewUrl = URL.createObjectURL(file);
    if (extension === 'jpg' || extension === 'jpeg') {
      try {
        const arrayBuffer = await file.arrayBuffer();
        const bytes = new Uint8Array(arrayBuffer);
        dateTaken = getExifDateFromJpeg(bytes);
      } catch (e) {
        console.warn('Could not parse JPG EXIF', e);
      }
    }
  }
  
  // If EXIF date taken wasn't found, default to lastModified
  if (!dateTaken) {
    dateTaken = new Date(file.lastModified);
  }
  
  // Determine pixel dimensions by loading the image in the browser background
  const dimensions = await new Promise<{ width: number; height: number }>((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
    };
    img.onerror = () => {
      reject(new Error('ImageDecodingFailed: Could not render image preview in browser.'));
    };
    img.src = previewUrl;
  });
  
  return {
    previewUrl,
    dateTaken,
    width: dimensions.width,
    height: dimensions.height,
    status: 'ready'
  };
}
