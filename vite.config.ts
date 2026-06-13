import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// 2.5D rhythm tower: r3f backdrop + DOM/canvas cue layer.
export default defineConfig({
  plugins: [react()],
  server: { port: 5180 },
  preview: { port: 5181 },
});
