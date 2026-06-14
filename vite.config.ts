import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));

// 2.5D rhythm tower: r3f backdrop + DOM/canvas cue layer.
// Multi-page: the game (index.html) + a client-side content inspector (preview.html).
export default defineConfig({
  plugins: [react()],
  server: { port: 5180 },
  preview: { port: 5181 },
  build: {
    rollupOptions: {
      input: {
        main: resolve(root, 'index.html'),
        preview: resolve(root, 'preview.html'),
      },
    },
  },
});
