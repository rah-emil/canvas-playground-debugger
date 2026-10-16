import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

// https://vite.dev/config/
export default defineConfig({
  // On GitHub Pages the site lives at /<repository>/; the path comes from CI (see .github/workflows).
  base: process.env.BASE_PATH || '/',
  plugins: [react()],
  // The AVIF WASM encoder locates its .wasm relative to its own module — Vite's pre-bundling breaks that.
  optimizeDeps: { exclude: ['@jsquash/avif'] },
  // The worker has a dynamic import (the wasm glue), which requires the es format.
  worker: { format: 'es' },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    setupFiles: ['src/test/setup.ts'],
  },
})
