import { useEffect, useRef } from 'react';

const ORDERED_ENGINE_SCRIPTS: readonly string[] = [
  './lib/three.min.js',
  './js/config.js',
  './js/levels.js',
  './js/textures.js',
  './js/world.js',
  './js/contraptions.js',
  './js/units.js',
  './js/vfx-post.js',
  './js/audio.js',
  './js/simulation.js',
  './js/hud.js',
  './js/main.js',
];

interface SanctumWindow extends Window {
  GAME?: {
    Main?: unknown;
  };
}

function loadClassicScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[data-sanctum-src="${src}"]`);
    if (existing) {
      resolve();
      return;
    }
    const script = document.createElement('script');
    script.src = src;
    script.async = false;
    script.dataset.sanctumSrc = src;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error(`Failed to load script: ${src}`));
    document.body.appendChild(script);
  });
}

export function App() {
  const bootedRef = useRef(false);

  useEffect(() => {
    const win = window as unknown as SanctumWindow;
    if (bootedRef.current || win.GAME?.Main) {
      return;
    }
    bootedRef.current = true;

    void (async () => {
      for (const src of ORDERED_ENGINE_SCRIPTS) {
        await loadClassicScript(src);
      }
    })();
  }, []);

  return null;
}

export default App;
