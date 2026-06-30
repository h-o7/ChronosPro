/**
 * Timeline.tsx - Sequential Asset Timeline Manager
 * 
 * This component acts as the filmstrip visualizer for loaded frames in the timeline sequence.
 * It provides:
 * - Dynamic grids rendering loaded photo sequences.
 * - Format badges (JPG, PNG, NEF, GIF etc.) detailing container extensions.
 * - Chronological and Alphabetical re-ordering buttons.
 * - Reversal tools, frame index numbering (#1, #2, etc.), and image-specific delete actions.
 * - Selection states showing file dimensions, size limits, and internal EXIF datetime markers.
 */

import React from 'react';
import { TimelapseFrame } from '../types';
import { Trash2, AlertTriangle, Calendar, RefreshCw, SortAsc, FileText, ArrowUpDown } from 'lucide-react';

interface TimelineProps {
  /** The sequence of parsed timelapse frames */
  frames: TimelapseFrame[];
  /** Current index of the highlighted/active frame being played or edited */
  selectedFrameIndex: number | null;
  /** Select callback when user taps/clicks a specific frame item */
  onSelectFrame: (index: number) => void;
  /** Callback to delete/purge an individual frame from timeline */
  onRemoveFrame: (id: string) => void;
  /** Command to sort sequence items alphabetically */
  onSortByFilename: (direction: 'asc' | 'desc') => void;
  /** Command to sort sequence items chronologically via EXIF timestamps */
  onSortByDate: (direction: 'asc' | 'desc') => void;
  /** Command to fully reverse the loaded timeline frame indexes list */
  onReverseAll: () => void;
}

export default function Timeline({
  frames,
  selectedFrameIndex,
  onSelectFrame,
  onRemoveFrame,
  onSortByFilename,
  onSortByDate,
  onReverseAll,
}: TimelineProps) {
  // Gracefully render nothing if sequence is entirely empty
  if (frames.length === 0) return null;

  return (
    <div className="bg-[#0A0A0A] border border-zinc-800 rounded-2xl p-6 flex flex-col gap-4 shadow-xl font-sans" id="timeline-container">
      {/* Timeline Controls Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-zinc-850 pb-4">
        <div>
          <h2 className="text-xs font-bold text-zinc-300 uppercase tracking-wider font-mono flex items-center gap-2">
            Imported Assets
            <span className="px-2 py-0.5 bg-zinc-900 border border-zinc-850 text-blue-400 font-mono text-[11px] rounded-lg">
              {frames.length} total
            </span>
          </h2>
          <p className="text-xs text-zinc-400 mt-1">Rearrange, sort, or preview sequence items below</p>
        </div>

        {/* Sorting toolbar */}
        <div className="flex flex-wrap items-center gap-2 text-xs font-mono">
          <button
            onClick={() => onSortByFilename('asc')}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-zinc-300 transition border border-zinc-800"
            title="Sort sequence in alphabetical order by source filename"
          >
            <FileText className="w-3.5 h-3.5 text-zinc-400" />
            Sort A-Z
          </button>
          
          <button
            onClick={() => onSortByDate('asc')}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-zinc-300 transition border border-zinc-800"
            title="Sort chronologically using internal EXIF Date-Taken attributes"
          >
            <Calendar className="w-3.5 h-3.5 text-zinc-400" />
            Chronological
          </button>

          <button
            onClick={onReverseAll}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-zinc-300 transition border border-zinc-805"
            title="Reverse order of frames"
          >
            <RefreshCw className="w-3.5 h-3.5 text-zinc-400" />
            Reverse
          </button>
        </div>
      </div>

      {/* Grid containing thumbnail list */}
      <div className="grid grid-cols-2 xs:grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-3 max-h-[380px] overflow-y-auto pr-2 custom-scrollbar" id="timeline-grid">
        {frames.map((frame, index) => {
          const isSelected = selectedFrameIndex === index;
          const ext = frame.name.split('.').pop()?.toUpperCase() || 'JPG';
          const isNef = ext === 'NEF';
          
          return (
            <div
              key={frame.id}
              onClick={() => onSelectFrame(index)}
              className={`group relative rounded-xl border cursor-pointer overflow-hidden transition p-2 select-none ${
                isSelected
                  ? 'border-blue-500 ring-2 ring-blue-950/85 bg-zinc-900/60'
                  : 'border-zinc-800 bg-[#060606] hover:border-zinc-700 hover:bg-zinc-900/20'
              }`}
            >
              {/* Thumbnail preview */}
              <div className="relative aspect-video rounded-lg bg-black overflow-hidden flex items-center justify-center">
                {frame.status === 'ready' ? (
                  <img
                    src={frame.previewUrl}
                    alt={frame.name}
                    className="w-full h-full object-cover"
                    referrerPolicy="no-referrer"
                    loading="lazy"
                  />
                ) : frame.status === 'error' ? (
                  <div className="flex flex-col items-center justify-center text-red-450 p-2 text-center">
                    <AlertTriangle className="w-5 h-5 mb-1" />
                    <span className="text-[11px] leading-tight font-mono">Error</span>
                  </div>
                 ) : (
                  <div className="animate-pulse w-full h-full bg-zinc-900 flex items-center justify-center font-mono text-[11px]">
                    <span className="text-[11px] text-zinc-400 font-mono">Loading</span>
                  </div>
                )}

                {/* Sequence Indicator badge */}
                <div className="absolute bottom-1 left-2 bg-black/70 backdrop-blur-xs px-1.5 py-0.5 rounded text-[10px] font-mono text-zinc-300">
                  #{index + 1}
                </div>

                {/* Format Tag */}
                <div className={`absolute top-1 left-2 px-1.5 py-0.5 rounded text-[9px] font-bold font-mono tracking-wider ${
                  isNef 
                    ? 'bg-amber-600/90 text-white shadow-xs' 
                    : ext === 'GIF' 
                    ? 'bg-purple-650/95 text-white' 
                    : 'bg-blue-600 text-white'
                }`}>
                  {ext}
                </div>
              </div>

              {/* Text Meta info */}
              <div className="mt-2 text-left">
                <p className="text-[12px] font-bold text-zinc-100 truncate pr-4" title={frame.name}>
                  {frame.name}
                </p>
                <div className="flex items-center justify-between text-[10px] text-zinc-400 font-mono mt-1">
                  <span>
                    {frame.width && frame.height ? `${frame.width}x${frame.height}` : '...'}
                  </span>
                  <span>
                    {(frame.size / (1024 * 1024)).toFixed(1)}MB
                  </span>
                </div>
                {frame.dateTaken && (
                  <p className="text-[9px] text-zinc-400 mt-1 flex items-center gap-1 font-mono">
                    <Calendar className="w-2.5 h-2.5 flex-shrink-0 text-zinc-500" />
                    {frame.dateTaken.toLocaleDateString(undefined, {
                      month: 'short',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit'
                    })}
                  </p>
                )}
              </div>

              {/* Trash/delete action button on corner hover */}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onRemoveFrame(frame.id);
                }}
                className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 p-1.5 rounded bg-zinc-950/90 hover:bg-red-650 text-red-400 hover:text-white transition duration-150 border border-zinc-850"
                title="Remove this frame from timeline"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
