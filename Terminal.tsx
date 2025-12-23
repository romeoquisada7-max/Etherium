/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

import React, { useEffect, useState, useMemo, useRef } from 'react';
import { SpinnerData, CandidateState } from '../types';
import { StatsChart } from './StatsChart';

// --- Helper Functions ---

export const parsePartialJson = (jsonStr: string) => {
    const result = { mutationName: "", reasoning: "", p5Code: "" };
    
    // Helper to extract value safely
    const extract = (key: string) => {
        // 1. Strict Match: Try to find key and value with a closing quote (completed field)
        // We use [^"]* to ensure we stop at the first closing quote
        const strictRegex = new RegExp(`"${key}"\\s*:\\s*"((?:[^"\\\\]|\\\\.)*)"`);
        const strictMatch = jsonStr.match(strictRegex);
        if (strictMatch) return strictMatch[1];

        // 2. Loose Match: If not found, try to find key and take everything until end of string (streaming field)
        // This only matches if the string ENDS inside the value (no closing quote found)
        const looseRegex = new RegExp(`"${key}"\\s*:\\s*"((?:[^"\\\\]|\\\\.)*)$`);
        const looseMatch = jsonStr.match(looseRegex);
        if (looseMatch) return looseMatch[1];
        
        return "";
    };

    result.mutationName = extract("mutationName");
    result.reasoning = extract("reasoning");
    
    // p5Code extraction
    let codeRaw = extract("p5Code");
    if (codeRaw) {
        result.p5Code = codeRaw
            .replace(/\\n/g, '\n')
            .replace(/\\"/g, '"')
            .replace(/\\\\/g, '\\')
            .replace(/\\t/g, '  ');
    }

    return result;
};

// --- Sub-Component: TerminalPanel ---

interface TerminalPanelProps {
    data: SpinnerData | null;
    streamBuffer: string;
    isGenerating: boolean;
    tpsHistory: number[];
    generationStartTime: number;
    label: string;
    labelColorClass: string;
    showControls?: boolean;
    overlayPosition?: string;
    className?: string;
    allowInteraction?: boolean;
}

const TerminalPanel: React.FC<TerminalPanelProps> = ({
    data,
    streamBuffer,
    isGenerating,
    tpsHistory,
    generationStartTime,
    label,
    labelColorClass,
    showControls,
    overlayPosition = "inset-x-0",
    className = "",
    allowInteraction = true
}) => {
    const [liveElapsed, setLiveElapsed] = useState(0);
    const [isCodeOpen, setIsCodeOpen] = useState(false);
    const codeScrollRef = useRef<HTMLPreElement>(null);
    const lastValidCodeRef = useRef<string>("");

    // Live timer & Auto-Open/Collapse Logic
    useEffect(() => {
        let interval: any;
        if (isGenerating) {
            setIsCodeOpen(true); // Automatically expand to show streaming
            interval = setInterval(() => {
                setLiveElapsed(performance.now() - generationStartTime);
            }, 50);
        } else {
            setIsCodeOpen(false); // Automatically collapse when done
            setLiveElapsed(0);
        }
        return () => clearInterval(interval);
    }, [isGenerating, generationStartTime]);

    // Reset last valid code when starting a new generation
    useEffect(() => {
        if (isGenerating && streamBuffer.length < 10) {
            lastValidCodeRef.current = "";
        }
    }, [generationStartTime, isGenerating, streamBuffer]);

    // Derived Display Data
    const displayData = useMemo(() => {
        if (isGenerating && streamBuffer) {
            return parsePartialJson(streamBuffer);
        }
        return data || { mutationName: "", reasoning: "", p5Code: "" };
    }, [isGenerating, streamBuffer, data]);

    // Cache valid code to prevent flashing when the parser returns empty during a tricky chunk
    if (displayData.p5Code) {
        lastValidCodeRef.current = displayData.p5Code;
    }
    const codeToDisplay = displayData.p5Code || lastValidCodeRef.current;

    // Auto-scroll logic
    useEffect(() => {
        if (isCodeOpen && codeScrollRef.current) {
            codeScrollRef.current.scrollTop = codeScrollRef.current.scrollHeight;
        }
    }, [codeToDisplay, isCodeOpen]);

    const liveAvgTps = isGenerating && liveElapsed > 0 
        ? ((streamBuffer.length / 4) / (liveElapsed / 1000)).toFixed(1)
        : "0.0";
    
    const totalTokens = isGenerating 
        ? Math.round(streamBuffer.length / 4) 
        : (data?.totalTokens || 0);
        
    const timeValue = isGenerating 
        ? (liveElapsed / 1000).toFixed(1)
        : (data?.generationTimeMs ? (data.generationTimeMs / 1000).toFixed(1) : "0.0");

    const tpsValue = isGenerating ? liveAvgTps : data?.tokensPerSecond || 0;

    const handleDownload = (e: React.MouseEvent) => {
        e.stopPropagation();
        const code = data?.p5Code;
        if (!code) return;
    
        const blob = new Blob([code], { type: 'text/javascript' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        
        const safeName = (data?.mutationName || 'spinner').replace(/[^a-z0-9]+/gi, '_').toLowerCase();
        link.download = `spinner_${data?.id || 'gen'}_${safeName}.js`;
        link.href = url;
        
        document.body.appendChild(link);
        link.click();
        
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    };

    return (
        <div className={`flex-1 flex flex-col justify-end min-w-0 bg-[#0a0a0a] border-r border-neutral-900/50 last:border-r-0 relative group overflow-hidden ${className}`}>
            
            {/* 
                CODE OVERLAY (Fixed Position to break out of containers) 
                Sits behind metrics (z-30) but covers spinner.
            */}
            <div 
                className={`fixed ${overlayPosition} top-14 bottom-0 bg-[#050505]/95 backdrop-blur-md z-30 transition-transform duration-700 ease-[cubic-bezier(0.19,1,0.22,1)] flex flex-col pt-0 pb-56 md:pb-80 px-0 border-b border-neutral-800
                ${isCodeOpen ? 'translate-y-0 shadow-[0_20px_50px_rgba(0,0,0,0.5)]' : 'translate-y-[calc(100%+20px)]'}`}
            >
                 {/* NEW HEADER in Overlay (Acts as Collapse Trigger) */}
                 <div 
                    onClick={() => setIsCodeOpen(false)}
                    className="flex-none h-10 flex items-center justify-between px-3 md:px-6 border-b border-neutral-800 cursor-pointer select-none bg-neutral-900/40 hover:bg-neutral-900 transition-colors group/header"
                >
                    <div className="flex items-center gap-2">
                        <span className="text-[10px] text-neutral-500 rotate-180 transition-colors group-hover/header:text-neutral-400">
                            ▲
                        </span>
                        <span className="text-[9px] font-bold uppercase tracking-widest text-neutral-400 group-hover/header:text-neutral-200 transition-colors">
                            Collapse Code Stream
                        </span>
                        {isGenerating && <span className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-pulse ml-2" />}
                    </div>

                    <div className="flex items-center gap-4">
                        {codeToDisplay && <span className="text-[10px] font-mono text-neutral-600 hidden sm:inline">{codeToDisplay.length} bytes</span>}
                        {showControls && data?.p5Code && (
                            <button 
                                onClick={handleDownload}
                                disabled={!allowInteraction}
                                tabIndex={allowInteraction ? 0 : -1}
                                className="flex items-center gap-2 px-2 py-0.5 rounded bg-neutral-900 hover:bg-neutral-800 text-neutral-500 hover:text-white transition-all text-[9px] uppercase tracking-wider font-medium border border-neutral-800 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                <span>JS</span>
                                <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                            </button>
                        )}
                    </div>
                 </div>

                 <pre 
                    ref={codeScrollRef}
                    className="flex-1 overflow-auto custom-scrollbar text-[10px] md:text-xs leading-relaxed text-neutral-400 font-mono whitespace-pre-wrap break-all p-4 md:px-8 bg-[#0a0a0a]"
                 >
                    <code>{codeToDisplay || "// Spinner code generating..."}</code>
                </pre>
            </div>

            {/* 
                BOTTOM CONTROL GROUP (Z-40 to stay above the code overlay)
            */}
            <div className="relative z-40 bg-black shadow-[0_-10px_40px_rgba(0,0,0,0.8)] border-t border-neutral-900 flex flex-col max-h-full">
                
                {/* TRIGGER BAR (EXPAND) */}
                <div 
                    onClick={() => setIsCodeOpen(true)}
                    className={`flex-none h-8 flex items-center justify-between px-3 md:px-6 bg-neutral-900/40 hover:bg-neutral-900 border-b border-neutral-900 cursor-pointer select-none transition-all duration-300 group/trigger
                    ${isCodeOpen ? 'opacity-0 -translate-y-2 pointer-events-none' : 'opacity-100 translate-y-0'}`}
                >
                    <div className="flex items-center gap-2">
                        <span className="text-[10px] text-neutral-500 transition-transform duration-300">
                            ▲
                        </span>
                        <span className="text-[9px] font-bold uppercase tracking-widest text-neutral-600 group-hover/trigger:text-neutral-400 transition-colors">
                            Expand Code Stream
                        </span>
                    </div>

                    {showControls && data?.p5Code && (
                        <button 
                            onClick={handleDownload}
                            disabled={!allowInteraction}
                            tabIndex={allowInteraction ? 0 : -1}
                            className="flex items-center gap-2 px-2 py-0.5 rounded bg-neutral-900 hover:bg-neutral-800 text-neutral-500 hover:text-white transition-all text-[9px] uppercase tracking-wider font-medium border border-neutral-800 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            <span>JS</span>
                            <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                        </button>
                    )}
                </div>

                {/* INFO & DESCRIPTION */}
                <div className="flex-shrink min-h-0 overflow-y-auto px-4 md:px-6 pt-3 pb-2 transition-all duration-500 bg-black custom-scrollbar max-h-32 md:max-h-40">
                     <div className="flex items-center gap-2 md:gap-3 mb-1">
                        <span className={`text-[8px] md:text-[9px] font-bold uppercase tracking-widest px-1.5 py-px rounded bg-neutral-900 border border-neutral-800 ${labelColorClass}`}>
                            {label}
                        </span>
                        <h2 className="text-sm md:text-base font-bold text-neutral-200 tracking-tight leading-none truncate">
                            {displayData.mutationName || "..."}
                        </h2>
                    </div>
                    <p className="text-[9px] md:text-[10px] text-neutral-500 leading-relaxed font-medium max-w-3xl">
                        {displayData.reasoning || "..."}
                    </p>
                </div>

                {/* METRICS ROW */}
                <div className="flex-none grid grid-cols-3 divide-x divide-neutral-900 border-y border-neutral-900 mt-2 bg-black">
                    <div className="p-2 md:p-4 flex flex-col justify-end items-end text-right">
                        <span className="text-[8px] md:text-[9px] text-neutral-600 uppercase tracking-[0.2em] mb-1">Time</span>
                        <div className="flex items-baseline gap-1 justify-end w-full">
                            <span className="text-lg sm:text-2xl md:text-4xl xl:text-5xl font-light text-white font-mono tracking-tighter">
                                {timeValue}
                            </span>
                            <span className="text-[10px] md:text-xs text-neutral-600 font-mono">s</span>
                        </div>
                    </div>
                    <div className="p-2 md:p-4 flex flex-col justify-end items-end text-right">
                        <span className="text-[8px] md:text-[9px] text-neutral-600 uppercase tracking-[0.2em] mb-1">Speed</span>
                        <div className="flex items-baseline gap-1 justify-end w-full">
                            <span className={`text-lg sm:text-2xl md:text-4xl xl:text-5xl font-light font-mono tracking-tighter ${isGenerating ? 'text-blue-400 animate-pulse' : 'text-white'}`}>
                                {tpsValue}
                            </span>
                            <span className="text-[10px] md:text-xs text-neutral-600 font-mono">tps</span>
                        </div>
                    </div>
                    <div className="p-2 md:p-4 flex flex-col justify-end items-end text-right">
                        <span className="text-[8px] md:text-[9px] text-neutral-600 uppercase tracking-[0.2em] mb-1">Tokens</span>
                        <div className="flex items-baseline gap-1 justify-end w-full">
                            <span className="text-lg sm:text-2xl md:text-4xl xl:text-5xl font-light text-white font-mono tracking-tighter">
                                {totalTokens}
                            </span>
                        </div>
                    </div>
                </div>

                {/* CHART */}
                <div className="flex-none h-20 md:h-28 w-full bg-neutral-900/10 relative bg-black">
                     <StatsChart data={tpsHistory} label="" isLive={isGenerating} />
                </div>
            </div>
        </div>
    );
};

// --- Main Container ---

interface TerminalProps {
  currentData: SpinnerData | null;
  candidates: { a: CandidateState; b: CandidateState } | null;
  
  isGenerating: boolean;
  generationStartTime: number;
  history: SpinnerData[];
  currentIndex: number;
  
  isSelectionMode: boolean;
  mobileTab?: 'a' | 'b'; 
  allowInteraction?: boolean;
}

export const Terminal: React.FC<TerminalProps> = ({ 
    currentData,
    candidates,
    isGenerating,
    generationStartTime,
    history,
    currentIndex,
    isSelectionMode,
    mobileTab = 'a',
    allowInteraction = true
}) => {
  return (
    <div className="flex flex-col h-full bg-[#0a0a0a] font-mono text-sm border-t border-neutral-800">
        <style>{`
            .custom-scrollbar::-webkit-scrollbar {
                width: 6px;
                height: 6px;
            }
            .custom-scrollbar::-webkit-scrollbar-track {
                background: transparent;
            }
            .custom-scrollbar::-webkit-scrollbar-thumb {
                background: #262626;
                border-radius: 3px;
            }
            .custom-scrollbar::-webkit-scrollbar-thumb:hover {
                background: #404040;
            }
        `}</style>

        {/* --- CONTENT AREA (SPLIT OR SINGLE) --- */}
        <div className="flex-1 flex flex-row overflow-hidden">
            {isSelectionMode && candidates ? (
                <>
                    <TerminalPanel 
                        data={candidates.a.data}
                        streamBuffer={candidates.a.buffer}
                        isGenerating={isGenerating}
                        tpsHistory={candidates.a.tpsHistory}
                        generationStartTime={generationStartTime}
                        label="VARIANT A"
                        labelColorClass="text-blue-400 border-blue-900/50 bg-blue-900/10"
                        showControls={!isGenerating}
                        overlayPosition="left-0 w-full lg:w-1/2 border-r border-neutral-900"
                        className={`${mobileTab === 'b' ? 'hidden lg:flex' : 'flex'}`}
                        allowInteraction={allowInteraction}
                    />
                    <div className="w-px bg-neutral-900 flex-none z-10 hidden lg:block" />
                    <TerminalPanel 
                        data={candidates.b.data}
                        streamBuffer={candidates.b.buffer}
                        isGenerating={isGenerating}
                        tpsHistory={candidates.b.tpsHistory}
                        generationStartTime={generationStartTime}
                        label="VARIANT B"
                        labelColorClass="text-purple-400 border-purple-900/50 bg-purple-900/10"
                        showControls={!isGenerating}
                        overlayPosition="right-0 w-full lg:w-1/2"
                        className={`${mobileTab === 'a' ? 'hidden lg:flex' : 'flex'}`}
                        allowInteraction={allowInteraction}
                    />
                </>
            ) : (
                <TerminalPanel 
                    data={currentData}
                    streamBuffer=""
                    isGenerating={false}
                    tpsHistory={currentData?.tpsHistory || []}
                    generationStartTime={0}
                    label={`GEN ${currentData?.id || 1}`}
                    labelColorClass="text-white border-neutral-700 bg-neutral-800"
                    showControls={true}
                    overlayPosition="inset-x-0"
                    allowInteraction={allowInteraction}
                />
            )}
        </div>
    </div>
  );
};