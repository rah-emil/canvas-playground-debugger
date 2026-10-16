import { defineConfig } from '@playwright/test'

// Отдельный порт: не пересекается с `vite` (5173) и `vite preview` (4173).
const PORT = 5199

export default defineConfig({
  testDir: 'e2e',
  fullyParallel: true,
  reporter: 'list',
  use: {
    baseURL: `http://localhost:${PORT}`,
    // Системный Chrome: не нужно скачивать браузеры Playwright.
    channel: 'chrome',
    viewport: { width: 1280, height: 900 },
  },
  webServer: {
    command: `pnpm dev --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    // Никогда не подключаемся к чужому серверу: он может отдавать устаревшую сборку.
    reuseExistingServer: false,
  },
})
