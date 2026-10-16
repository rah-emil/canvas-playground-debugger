import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

// https://vite.dev/config/
export default defineConfig({
  // На GitHub Pages сайт живёт по адресу /<репозиторий>/, путь приходит из CI (см. .github/workflows).
  base: process.env.BASE_PATH || '/',
  plugins: [react()],
  // WASM-кодировщик AVIF сам находит свой .wasm относительно модуля — прекомпиляция Vite это ломает.
  optimizeDeps: { exclude: ['@jsquash/avif'] },
  // В воркере есть динамический import (wasm-glue), а он требует es-формата.
  worker: { format: 'es' },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    setupFiles: ['src/test/setup.ts'],
  },
})
