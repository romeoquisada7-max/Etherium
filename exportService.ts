/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

import JSZip from 'jszip';
import saveAs from 'file-saver';

// Declare global p5 for the hidden instance
declare global {
  interface Window {
    p5: any;
  }
}

interface ExportConfig {
  code: string;
  platform: 'windows' | 'linux' | 'chrome';
  filename: string;
}

// Helper to create a Linux Plymouth script
const generatePlymouthScript = (frameCount: number) => `
# Plymouth Script for Custom Spinner
Window.SetBackgroundTopColor(0, 0, 0);
Window.SetBackgroundBottomColor(0, 0, 0);

for (i = 0; i < ${frameCount}; i++)
  spinner_images[i] = Image("spinner_" + i + ".png");

spinner_sprite = Sprite();
spinner_sprite.SetX(Window.GetWidth() / 2 - spinner_images[0].GetWidth() / 2);
spinner_sprite.SetY(Window.GetHeight() / 2 - spinner_images[0].GetHeight() / 2);

progress = 0;
fun refresh_callback () {
  progress++;
  index = Math.Int(progress / 2) % ${frameCount};
  spinner_sprite.SetImage(spinner_images[index]);
}
Plymouth.SetRefreshFunction (refresh_callback);
`;

const generatePlymouthThemeFile = (name: string) => `
[Plymouth Theme]
Name=${name}
Description=A generative AI spinner theme
ModuleName=script

[script]
ImageDir=.
ScriptFile=${name}.script
`;

// Helper to create Chrome Extension manifest
const generateChromeManifest = () => JSON.stringify({
  "manifest_version": 3,
  "name": "Spinner Evolve Custom Cursor",
  "version": "1.0",
  "description": "Replaces the default cursor with an evolved AI spinner.",
  "permissions": ["activeTab", "scripting"],
  "content_scripts": [
    {
      "matches": ["<all_urls>"],
      "css": ["cursor.css"]
    }
  ]
}, null, 2);

const generateChromeCSS = () => `
body {
  cursor: url('cursor.png') 16 16, auto !important;
}
a, button, [role="button"] {
  cursor: url('cursor_active.png') 16 16, pointer !important;
}
`;

export const generateExportPack = async ({ code, platform, filename }: ExportConfig) => {
  return new Promise<void>((resolve, reject) => {
    // 1. Setup a hidden container for the ghost p5 instance
    const container = document.createElement('div');
    container.style.visibility = 'hidden';
    container.style.position = 'absolute';
    container.style.pointerEvents = 'none';
    document.body.appendChild(container);

    // Configuration based on Platform
    let targetSize = 32; // Default for Windows
    let frameCount = 30; // 1 second loop at 30fps roughly
    let durationMs = 2000; // Capture 2 seconds to ensure a full loop

    if (platform === 'linux') {
      targetSize = 64; // Plymouth prefers slightly larger
      frameCount = 60; 
      durationMs = 2000;
    } else if (platform === 'chrome') {
      targetSize = 32;
    }

    const frames: string[] = [];

    // 2. Initialize the ghost p5 instance
    const sketch = (p: any) => {
      let simulatedTime = 0;
      const timeStep = durationMs / frameCount;

      // Wrap the user code
      const cleanCode = code.replace(/```javascript/g, '').replace(/```/g, '').trim();
      const userSketch = new Function('p', cleanCode);

      p.setup = () => {
        // Force 400x400 as per AI training, we will downscale later
        p.createCanvas(400, 400); 
        p.frameRate(30);
        p.pixelDensity(1); // Simplify export
        
        // Execute user setup if needed (though we override canvas)
        try {
            // We need to execute the user's function to register their setup/draw
            userSketch(p);
            
            // Re-enforce our canvas size if they changed it
            p.resizeCanvas(400, 400);
        } catch (e) {
            console.error("Export setup error", e);
        }
      };

      p.draw = () => {
        // OVERRIDE TIME: We manually advance time to capture perfect frames
        p.millis = () => simulatedTime;
        
        // Call user draw
        // The user code is already hooked into p.draw by userSketch(p)
        // But we need to make sure we don't error out
      };

      // We use a custom loop to capture frames instead of relying on p5's loop
      // This ensures we get exactly the frames we want, synchronously-ish
    };

    const p5Instance = new window.p5(sketch, container);

    // 3. Capture Loop
    // We wait for p5 to be ready. p5 instantiation is synchronous for setup, but we need to ensure draw is ready.
    setTimeout(async () => {
      try {
        const zip = new JSZip();
        const mainCanvas = container.querySelector('canvas') as HTMLCanvasElement;
        
        // Helper canvas for resizing
        const resizeCanvas = document.createElement('canvas');
        resizeCanvas.width = targetSize;
        resizeCanvas.height = targetSize;
        const resizeCtx = resizeCanvas.getContext('2d');

        if (!mainCanvas || !resizeCtx) throw new Error("Canvas initialization failed");

        // Override the user's draw loop with our capturer
        const originalDraw = p5Instance.draw;
        
        for (let i = 0; i < frameCount; i++) {
            // Update Mock Time
            const t = (i / frameCount) * durationMs;
            p5Instance.millis = () => t;

            // Draw one frame
            p5Instance.push(); // Save state
            if (originalDraw) originalDraw();
            p5Instance.pop(); // Restore state

            // Downscale
            resizeCtx.clearRect(0, 0, targetSize, targetSize);
            resizeCtx.drawImage(mainCanvas, 0, 0, 400, 400, 0, 0, targetSize, targetSize);

            // Capture
            const dataUrl = resizeCanvas.toDataURL('image/png');
            const base64Data = dataUrl.split(',')[1]; // Remove "data:image/png;base64,"
            
            frames.push(base64Data);
        }

        // 4. Package for Platform
        if (platform === 'windows') {
            const folder = zip.folder("Windows_Cursor_Frames");
            frames.forEach((f, i) => {
                // Windows frames usually need to be 0-indexed with padding
                const name = `frame_${String(i).padStart(2, '0')}.png`;
                folder?.file(name, f, { base64: true });
            });
            folder?.file("INSTRUCTIONS.txt", 
                "1. These are raw PNG frames of your evolved spinner.\n" +
                "2. To create a Windows .ani cursor:\n" +
                "   - Download a tool like 'RealWorld Cursor Editor' (free).\n" +
                "   - Import these frames.\n" +
                "   - Save as .ani.\n" +
                "3. Go to Windows Settings > Personalization > Themes > Mouse Cursor and browse for your new .ani file."
            );
        } 
        else if (platform === 'linux') {
            const themeName = "evolved_spinner";
            const folder = zip.folder(themeName);
            
            frames.forEach((f, i) => {
                folder?.file(`spinner_${i}.png`, f, { base64: true });
            });
            
            folder?.file(`${themeName}.script`, generatePlymouthScript(frameCount));
            folder?.file(`${themeName}.plymouth`, generatePlymouthThemeFile(themeName));
            folder?.file("install_help.txt", 
                "To install this Plymouth theme:\n" +
                "1. Copy this folder to /usr/share/plymouth/themes/\n" +
                "2. Run: sudo plymouth-set-default-theme -R evolved_spinner"
            );
        }
        else if (platform === 'chrome') {
            const folder = zip.folder("Chrome_Extension");
            // Use the first frame as the static cursor
            folder?.file("cursor.png", frames[0], { base64: true });
            // Use a slightly different frame for active if we want, or same
            folder?.file("cursor_active.png", frames[Math.floor(frames.length/4)], { base64: true });
            
            folder?.file("manifest.json", generateChromeManifest());
            folder?.file("cursor.css", generateChromeCSS());
            folder?.file("INSTRUCTIONS.txt",
                "1. Go to chrome://extensions in your browser.\n" +
                "2. Enable 'Developer mode' in the top right.\n" +
                "3. Drag and drop this folder (unzipped) into the window.\n" +
                "4. Refresh any webpage to see your new AI cursor!"
            );
        }

        // 5. Download
        const content = await zip.generateAsync({ type: "blob" });
        saveAs(content, `${filename}_${platform}_pack.zip`);

        resolve();
      } catch (err) {
        reject(err);
      } finally {
        p5Instance.remove();
        document.body.removeChild(container);
      }
    }, 500); // Small delay to let p5 init
  });
};