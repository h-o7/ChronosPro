/**
 * WorkLogPanel.tsx - Handbrake-Style Real-Time Console Logs
 * 
 * Provides an administrative, interactive developer console listing all internal system processes.
 * Features:
 * - Real-time auto-scrolling to show new pipeline executions (HEIC conversions, sequence exports, frame imports).
 * - Full filter matching via level types (All, Info, Success, Warn, Error).
 * - Live substring search capability.
 * - Single-click system log aggregation for copy-pasting to clipboard.
 */

import React, { useEffect, useRef, useState } from 'react';
import { WorkLogEntry } from '../types';
import { Terminal, Copy, Trash2, X, Check, Search, AlertTriangle, Info, XOctagon } from 'lucide-react';

interface WorkLogPanelProps {
  /** Aggregated logs history */
  workLogs: WorkLogEntry[];
  /** Callback to wipe historical entries */
  onClear: () => void;
  /** Close / switch tab callback */
  onClose: () => void;
  /** True if rendered as full-size workspace tab */
  isFullTab?: boolean;
}

export default function WorkLogPanel({ workLogs, onClear, onClose, isFullTab = false }: WorkLogPanelProps) {
  const [copied, setCopied] = useState(false);
  const [filterText, setFilterText] = useState('');
  const [filterType, setFilterType] = useState<string>('all');
  
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Auto-scroll to bottom of logs on new entry to keep log focus on recent activity
  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [workLogs]);

  /**
   * Aggregates and copies logs to user clipboard
   */
  const handleCopyLogs = () => {
    const formattedText = workLogs
      .map((log) => `[${log.timestamp}] [${log.type.toUpperCase()}] ${log.message}`)
      .join('\n');
    
    navigator.clipboard.writeText(formattedText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const filteredLogs = workLogs.filter((log) => {
    const matchesSearch = log.message.toLowerCase().includes(filterText.toLowerCase());
    const matchesType = filterType === 'all' || log.type === filterType;
    return matchesSearch && matchesType;
  });

  return (
    <div 
      className={`border border-zinc-800 bg-[#070709] rounded-2xl overflow-hidden shadow-2xl flex flex-col transition-all duration-300 font-mono text-xs text-zinc-300 ${
        isFullTab ? 'flex-1 h-[680px]' : 'h-[320px]'
      }`}
      id="work-log-panel"
    >
      {/* Header bar */}
      <div className="bg-[#0e0e12] border-b border-zinc-850 px-4 py-2.5 flex items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <Terminal className="w-4 h-4 text-amber-500 animate-pulse" />
          <span className="font-bold uppercase tracking-wider text-zinc-200">Activity Log Console</span>
          <span className="bg-zinc-800 text-[11px] text-zinc-400 px-2 py-0.5 rounded-full font-semibold">
            {workLogs.length} total
          </span>
        </div>

        <div className="flex items-center gap-2">
          {/* Copy logs to Clipboard */}
          <button
            onClick={handleCopyLogs}
            className="p-1.5 hover:bg-zinc-800 rounded-lg text-zinc-400 hover:text-white transition flex items-center gap-1.5 cursor-pointer"
            title="Copy all logs to clipboard"
          >
            {copied ? (
              <>
                <Check className="w-3.5 h-3.5 text-emerald-400" />
                <span className="text-[11px] text-emerald-400 font-sans">Copied!</span>
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5" />
                <span className="text-[11px] font-sans">Copy Logs</span>
              </>
            )}
          </button>

          {/* Clear logs */}
          <button
            onClick={onClear}
            className="p-1.5 hover:bg-zinc-800 rounded-lg text-zinc-400 hover:text-red-400 transition flex items-center gap-1.5 cursor-pointer"
            title="Clear all workspace logs"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span className="text-[11px] font-sans">Clear Console</span>
          </button>

          <div className="w-[1px] h-4 bg-zinc-800 mx-1" />

          {/* Close logs panel / Switch back to Studio */}
          <button
            onClick={onClose}
            className="p-1 hover:bg-zinc-800 rounded text-zinc-400 hover:text-white transition flex items-center gap-1 cursor-pointer"
            title={isFullTab ? "Return to Timelapse Workspace" : "Collapse panel"}
          >
            <X className="w-4 h-4" />
            {isFullTab && <span className="text-[11px] font-sans pr-1">Back to Timelapse</span>}
          </button>
        </div>
      </div>

      {/* Filter and search utilities bar */}
      <div className="bg-[#0A0A0C] border-b border-zinc-850 px-4 py-2 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <Search className="w-3.5 h-3.5 text-zinc-500" />
          <input
            type="text"
            placeholder="Filter logs by message..."
            value={filterText}
            onChange={(e) => setFilterText(e.target.value)}
            className="bg-transparent border-0 outline-none text-zinc-250 placeholder-zinc-650 w-full sm:w-60 focus:ring-0 text-xs py-0.5"
          />
        </div>

        <div className="flex items-center gap-1 text-[11px] uppercase font-bold tracking-wide text-zinc-400">
          <span className="mr-1">Type:</span>
          <button
            onClick={() => setFilterType('all')}
            className={`px-2 py-0.5 rounded-md border ${
              filterType === 'all'
                ? 'bg-zinc-800 text-white border-zinc-700'
                : 'bg-transparent text-zinc-500 border-transparent hover:text-zinc-300'
            }`}
          >
            All
          </button>
          <button
            onClick={() => setFilterType('info')}
            className={`px-2 py-0.5 rounded-md border ${
              filterType === 'info'
                ? 'bg-zinc-850 text-blue-400 border-zinc-700'
                : 'bg-transparent text-zinc-500 border-transparent hover:text-zinc-300'
            }`}
          >
            Info
          </button>
          <button
            onClick={() => setFilterType('success')}
            className={`px-2 py-0.5 rounded-md border ${
              filterType === 'success'
                ? 'bg-zinc-850 text-emerald-400 border-zinc-700'
                : 'bg-transparent text-zinc-500 border-transparent hover:text-zinc-300'
            }`}
          >
            Success
          </button>
          <button
            onClick={() => setFilterType('warn')}
            className={`px-2 py-0.5 rounded-md border ${
              filterType === 'warn'
                ? 'bg-zinc-850 text-amber-400 border-zinc-700'
                : 'bg-transparent text-zinc-500 border-transparent hover:text-zinc-300'
            }`}
          >
            Warn
          </button>
          <button
            onClick={() => setFilterType('error')}
            className={`px-2 py-0.5 rounded-md border ${
              filterType === 'error'
                ? 'bg-zinc-850 text-red-400 border-zinc-700'
                : 'bg-transparent text-zinc-500 border-transparent hover:text-zinc-300'
            }`}
          >
            Error
          </button>
        </div>
      </div>

      {/* Terminal log items */}
      <div 
        ref={containerRef}
        className="flex-1 overflow-y-auto px-4 py-3 divide-y divide-zinc-900/30 font-mono leading-relaxed"
        id="logs-scroll-container"
      >
        {filteredLogs.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-zinc-600 gap-2">
            <Terminal className="w-5 h-5 text-zinc-700" />
            <span>No matching log records found</span>
          </div>
        ) : (
          filteredLogs.map((log, index) => {
            let badgeStyle = "text-zinc-400";
            let lineStyle = "text-zinc-300";
            let Icon = Info;

            if (log.type === 'success') {
              badgeStyle = "text-emerald-400 font-semibold";
              lineStyle = "text-emerald-250";
              Icon = Check;
            } else if (log.type === 'warn') {
              badgeStyle = "text-amber-400 font-semibold";
              lineStyle = "text-amber-250";
              Icon = AlertTriangle;
            } else if (log.type === 'error') {
              badgeStyle = "text-red-400 font-bold";
              lineStyle = "text-red-300";
              Icon = XOctagon;
            }

            return (
              <div 
                key={index} 
                className={`py-1.5 flex items-start gap-3 transition-colors hover:bg-zinc-950/40 rounded px-1 -mx-1`}
              >
                {/* Timestamp */}
                <span className="text-zinc-500 shrink-0 select-none text-[11px] mt-0.5 w-16">
                  {log.timestamp}
                </span>

                {/* Level Tag with Icon */}
                <span className={`flex items-center gap-1 shrink-0 select-none text-[11px] font-bold uppercase tracking-wide w-16 ${badgeStyle}`}>
                  <Icon className="w-3 h-3" />
                  {log.type}
                </span>

                {/* Log Message */}
                <span className={`break-all ${lineStyle}`}>
                  {log.message}
                </span>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
