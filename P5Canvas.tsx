/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

import React, { useEffect, useRef, useState, forwardRef, useImperativeHandle } from 'react';

// Declare p5 globally since we loaded it via CDN
declare global {
  interface Window {
    p5: any;
  }
}

export interface P5CanvasRef {
    downloadGif: () => void;
    downloadPng: (filename: string, size?: number) => void;
}

interface P5CanvasProps {
  code: string;
}

export const P5Canvas = forwardRef<P5CanvasRef, P5CanvasProps>(({ code }, ref) => {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const p5InstanceRef = useRef<any>(null);
  const [scale, setScale] = useState(1);

  useImperativeHandle(ref, () => ({
    downloadGif: () => {
        if (p5InstanceRef.current) {
            // Saves a 4-second loop. 
            // 'silent: true' suppresses the default p5.js loading screen (the flower).
            try {
                // We record 4 seconds to match the 4000ms loop enforced in the prompt
                p5InstanceRef.current.saveGif('spinner_loop', 4, { silent: true });
            } catch (e) {
                console.error("GIF generation failed", e);
            }
        }
    },
    downloadPng: (filename: string, size?: number) => {
        const p = p5InstanceRef.current;
        if (!p) return;

        // If no size is specified, or size matches canvas, save directly
        if (!size || size === 400) {
            p.saveCanvas(filename, 'png');
        } else {
            // Create an offscreen graphics buffer to resize the output
            // This is crucial for creating cursor-sized (32x32, 48x48) assets from the 400x400 source
            const pg = p.createGraphics(size, size);
            pg.clear();
            
            // Draw the current canvas content onto the smaller buffer
            // p.get() captures the current frame as an image
            pg.image(p.get(), 0, 0, size, size);
            
            // Save the buffer using the main instance's save method
            p.save(pg, filename + '.png');
            
            // Cleanup
            pg.remove();
        }
    }
  }));

  // Resize observer to handle scaling for smaller screens and layout changes
  useEffect(() => {
    if (!wrapperRef.current) return;

    const updateScale = () => {
      if (wrapperRef.current) {
        const { width, height } = wrapperRef.current.getBoundingClientRect();
        // The base size is 400x400. Calculate scale to fit.
        const minDimension = Math.min(width, height);
        
        // Subtract minimal padding (30px total, 15px per side) from dimension to ensure breathing room
        // while maximizing size.
        const safeDimension = Math.max(0, minDimension - 30);
        
        // Calculate scale, allowing up to 2.0x for large screens to really fill the space
        const newScale = Math.min(safeDimension / 400, 2.0); 
        setScale(Math.max(0.1, newScale)); // Prevent negative or zero scale
      }
    };

    const resizeObserver = new ResizeObserver(() => {
        // Wrap in requestAnimationFrame to avoid "ResizeObserver loop limit exceeded"
        requestAnimationFrame(updateScale);
    });

    resizeObserver.observe(wrapperRef.current);
    updateScale(); // Initial check

    return () => resizeObserver.disconnect();
  }, []);

  useEffect(() => {
    if (!canvasRef.current || !window.p5) return;

    // Cleanup previous instance
    if (p5InstanceRef.current) {
      p5InstanceRef.current.remove();
    }

    try {
      // Sanitize the code: remove markdown backticks if present
      const cleanCode = code.replace(/```javascript/g, '').replace(/```/g, '').trim();

      // Create a wrapper function for the sketch
      // We wrap the AI generated code (which is the body) into a function (p) => { ... }
      // eslint-disable-next-line no-new-func
      const sketchFunction = new Function('p', cleanCode);

      // Initialize p5 in instance mode
      // CRITICAL FIX: Append to canvasRef.current (inner div), not wrapperRef (outer div)
      p5InstanceRef.current = new window.p5((p: any) => {
        // Safe defaults if the AI forgets them
        p.setup = () => {
          p.createCanvas(400, 400);
          p.clear(); // Ensure transparent start
        };
        
        // Execute the AI code which should override setup/draw
        try {
            sketchFunction(p);

            // Wrap p.draw to catch RUNTIME errors (like maxDepth undefined)
            // The AI defines p.draw inside sketchFunction. We need to intercept it.
            const originalDraw = p.draw;
            if (originalDraw) {
                p.draw = () => {
                    try {
                        originalDraw();
                    } catch (drawErr) {
                        console.error("Runtime error in p5 draw loop:", drawErr);
                        p.noLoop(); // Stop the loop to save CPU
                        p.clear();
                        p.translate(0, 0); // Reset matrix
                        p.fill(255, 50, 50);
                        p.noStroke();
                        p.textAlign(p.CENTER, p.CENTER);
                        p.textSize(16);
                        p.text("RUNTIME_ERR", 200, 180);
                        p.textSize(10);
                        p.text((drawErr as Error).message.substring(0, 40), 200, 210);
                    }
                }
            }
        } catch (e) {
            console.error("Error executing generated p5 code:", e);
            p.clear();
            p.fill(150);
            p.noStroke();
            p.textAlign(p.LEFT, p.TOP);
            p.textSize(12);
            p.text("RENDER_ERR", 10, 10);
        }
      }, canvasRef.current);
    } catch (err) {
      console.error("Failed to compile p5 code:", err);
    }

    return () => {
      if (p5InstanceRef.current) {
        p5InstanceRef.current.remove();
      }
    };
  }, [code]);

  return (
    <div className="w-full h-full flex items-center justify-center overflow-hidden" ref={wrapperRef}>
        <div 
          ref={canvasRef}
          style={{ 
            width: '400px', 
            height: '400px', 
            transform: `scale(${scale})`,
            transformOrigin: 'center center',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'transform 0.3s ease-out' // Smooth scaling transition
          }}
        >
            {/* The p5 canvas injects itself here */}
        </div>
    </div>
  );
});
P5Canvas.displayName = 'P5Canvas';