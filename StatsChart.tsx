/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

import React, { useState, useEffect, useRef } from 'react';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';

interface StatsChartProps {
  data: number[]; // Array of TPS values (every 100ms)
  label?: string;
  isLive?: boolean;
}

export const StatsChart: React.FC<StatsChartProps> = ({ data, label, isLive }) => {
  // We use this ref for the immediate parent of ResponsiveContainer
  const chartWrapperRef = useRef<HTMLDivElement>(null);
  const [shouldRender, setShouldRender] = useState(false);
  
  const hasData = data && data.length > 0;

  useEffect(() => {
    // If we don't have data, the wrapper div isn't rendered, so we can't observe it.
    // When hasData becomes true, this effect needs to run again to attach the observer.
    const el = chartWrapperRef.current;
    if (!el) return;

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        // Use contentRect for precise sizing box
        const { width, height } = entry.contentRect;
        
        // Only render Recharts if we have valid dimensions.
        if (width > 0 && height > 0) {
            // We use requestAnimationFrame to avoid "ResizeObserver loop limit exceeded" 
            // and ensure we render in sync with the browser paint.
            requestAnimationFrame(() => {
                setShouldRender(true);
            });
        } else {
            setShouldRender(false);
        }
      }
    });

    resizeObserver.observe(el);
    
    return () => resizeObserver.disconnect();
  }, [hasData]); // Added hasData dependency so we re-attach when the "NO DATA" state changes

  // Convert simple array to object array for Recharts
  const chartData = hasData ? data.map((val, idx) => ({
    time: parseFloat((idx * 0.1).toFixed(1)),
    tps: val
  })) : [];

  return (
    <div className="w-full h-full bg-neutral-900/50 rounded p-0 border border-neutral-800 flex flex-col min-w-0 relative">
      
      {!hasData ? (
         <div className="absolute inset-0 flex items-center justify-center text-[10px] text-neutral-600 font-mono">
            NO DATA
         </div>
      ) : (
        <>
            {/* Live Badge */}
            <div className="absolute top-2 right-2 flex items-center gap-1 z-10 pointer-events-none">
                {isLive && (
                    <>
                        <div className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
                        <span className="text-[9px] text-white font-mono tracking-wider">LIVE</span>
                    </>
                )}
            </div>
            
            {/* 
                Ref attached to direct parent. 
                Added w-full h-full and overflow-hidden to ensure strict containment.
            */}
            <div ref={chartWrapperRef} className="flex-1 min-h-0 w-full h-full overflow-hidden">
                {shouldRender && (
                    <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0} debounce={50}>
                        <AreaChart data={chartData} margin={{ top: 15, right: 0, bottom: 0, left: 0 }}>
                        <defs>
                            <linearGradient id="colorTps" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#ffffff" stopOpacity={0.2}/>
                            <stop offset="95%" stopColor="#ffffff" stopOpacity={0}/>
                            </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#222" />
                        <XAxis 
                            dataKey="time" 
                            type="number"
                            domain={['dataMin', 'dataMax']}
                            tick={false} 
                            axisLine={{ stroke: '#333' }}
                            tickLine={false}
                            padding={{ left: 0, right: 0 }}
                            label={{ 
                                value: 'SECONDS', 
                                position: 'insideBottom', 
                                offset: 15, 
                                fill: '#444', 
                                fontSize: 9, 
                                fontWeight: 700 
                            }}
                        />
                        <YAxis 
                            width={24}
                            tick={false} 
                            axisLine={true}
                            tickLine={false}
                            domain={['dataMin', 'dataMax']}
                            label={{ 
                                value: 'TOKENS', 
                                angle: -90, 
                                position: 'insideLeft', 
                                offset: 8,
                                dy: 10,
                                fill: '#444', 
                                fontSize: 9, 
                                fontWeight: 700 
                            }}
                        />
                        <Tooltip 
                            contentStyle={{ backgroundColor: '#050505', border: '1px solid #333', color: '#fff', fontSize: '10px', borderRadius: '4px' }}
                            itemStyle={{ color: '#ffffff' }}
                            cursor={{ stroke: '#ffffff', strokeWidth: 1 }}
                            formatter={(value: number) => [value.toFixed(1), "TPS"]}
                            labelFormatter={(label: number) => `${label.toFixed(1)}s`}
                            isAnimationActive={false}
                        />
                        <Area 
                            type="monotone" 
                            dataKey="tps" 
                            stroke="#666" 
                            strokeWidth={1}
                            fillOpacity={1} 
                            fill="url(#colorTps)" 
                            isAnimationActive={false}
                        />
                        </AreaChart>
                    </ResponsiveContainer>
                )}
            </div>
        </>
      )}
    </div>
  );
};