/**
 * Navbar.tsx - Central Control Room Header
 * 
 * Renders the global layout header, managing:
 * - App title, branding, and active versioning labels.
 * - Tab-switching controls between Timelapse Workspace, HEIC Converter, and Work Log console.
 * - Global session controls like "Clear Workspace" button.
 * - Telemetry flags indicating the current project state (Loaded vs Empty) and GPU status indicators.
 */

import React from 'react';
import { Video, Terminal, RefreshCw } from 'lucide-react';
import { ActiveTab } from '../types';

interface NavbarProps {
  /** Number of parsed timelapse frames in current timeline session */
  totalFrames: number;
  /** Global trigger clearing workspace, revoking Object URLs and resetting indexes */
  onClearAll: () => void;
  /** Callback to explicitly save the current workspace to persistent local storage */
  onSaveWorkspace?: () => void;
  /** Callback to import a saved workspace file */
  onImportWorkspace?: (file: File) => void;
  /** Currently active navigation workflow */
  activeTab: ActiveTab;
  /** Callback to transition between views */
  onChangeTab: (tab: ActiveTab) => void;
}

export default function Navbar({ totalFrames, onClearAll, onSaveWorkspace, onImportWorkspace, activeTab, onChangeTab }: NavbarProps) {
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && onImportWorkspace) {
      onImportWorkspace(file);
    }
    // Reset file input value to allow re-import of same file
    e.target.value = '';
  };

  return (
    <header className="border-b border-zinc-800 bg-[#0A0A0A] px-6 py-4 flex flex-col md:flex-row md:items-center justify-between gap-4" id="app-header">
      {/* Brand & Identity Area */}
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 bg-blue-600 rounded-lg flex items-center justify-center text-white shadow-lg shadow-blue-900/30">
          <Video className="w-5 h-5" id="logo-icon" />
        </div>
        <div>
          <h1 className="text-lg font-bold tracking-tight uppercase text-zinc-100 font-sans">
            ChronosPro <span className="text-zinc-500 font-normal">v1.5</span>
          </h1>
          <p className="text-[11px] text-zinc-400 font-mono tracking-wide uppercase">High-Speed Timelapse & Format Converter</p>
        </div>
      </div>

      {/* Segmented Tab Control */}
      <div className="flex bg-zinc-950 border border-zinc-850 p-1 rounded-xl text-xs font-sans">
        <button
          onClick={() => onChangeTab('studio')}
          className={`px-4 py-1.5 rounded-lg font-semibold flex items-center gap-2 transition-all cursor-pointer ${
            activeTab === 'studio'
              ? 'bg-blue-600 text-white shadow-md shadow-blue-900/20'
              : 'text-zinc-400 hover:text-zinc-200'
          }`}
          title="Switch to Timelapse Studio workflow"
        >
          <Video className="w-4 h-4" />
          <span>Timelapse Workspace</span>
        </button>
        <button
          onClick={() => onChangeTab('heic')}
          className={`px-4 py-1.5 rounded-lg font-semibold flex items-center gap-2 transition-all cursor-pointer ${
            activeTab === 'heic'
              ? 'bg-blue-600 text-white shadow-md shadow-blue-900/20'
              : 'text-zinc-400 hover:text-zinc-200'
          }`}
          title="Switch to HEIC Batch Converter"
        >
          <RefreshCw className="w-4 h-4" />
          <span>HEIC Converter</span>
        </button>
        <button
          onClick={() => onChangeTab('worklog')}
          className={`px-4 py-1.5 rounded-lg font-semibold flex items-center gap-2 transition-all cursor-pointer ${
            activeTab === 'worklog'
              ? 'bg-amber-600 text-white shadow-md shadow-amber-900/20'
              : 'text-zinc-400 hover:text-zinc-200'
          }`}
          title="Switch to Handbrake-style Activity/Work Log console"
        >
          <Terminal className="w-4 h-4" />
          <span>Work Log Console</span>
        </button>
      </div>

      {/* Global telemetry fields */}
      <div className="flex flex-wrap items-center gap-3 sm:gap-4 text-xs font-mono">
        <div className="flex flex-col items-center gap-1">
          <div className="bg-zinc-900/80 border border-zinc-850 px-3 py-1.5 rounded-lg text-zinc-400 text-center">
            Project: <span className="text-blue-400 font-semibold">{totalFrames > 0 ? "Active_Sequence_Studio" : "Unloaded_Workspace"}</span>
          </div>
          <div className="flex items-center justify-center gap-2 px-1">
            <span className="flex h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
            <span className="text-[10px] uppercase font-bold text-zinc-500 tracking-wider">GPU ACCELERATED</span>
          </div>
        </div>
        
        <div className="flex flex-col gap-1 sm:gap-1.5">
          {onImportWorkspace && (
            <>
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileChange}
                accept=".json"
                className="hidden"
                id="workspace-import-file-input"
              />
              <button
                onClick={handleImportClick}
                className="px-3.5 py-1 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-zinc-300 border border-zinc-800 font-semibold transition text-center cursor-pointer text-[11px]"
                id="import-workspace-btn"
              >
                Import Workspace
              </button>
            </>
          )}
          {totalFrames > 0 && onSaveWorkspace && (
            <button
              onClick={onSaveWorkspace}
              className="px-3.5 py-1 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-semibold transition text-center cursor-pointer text-[11px]"
              id="save-workspace-btn"
            >
              Save Workspace
            </button>
          )}
          {totalFrames > 0 && (
            <button
              onClick={onClearAll}
              className="px-3.5 py-1 rounded-lg bg-red-950/40 hover:bg-red-950/80 text-red-300 border border-red-900/40 font-semibold transition text-center cursor-pointer text-[11px]"
              id="clear-all-btn"
            >
              Clear Workspace
            </button>
          )}
        </div>
      </div>
    </header>
  );
}
