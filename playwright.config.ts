import { defineConfig } from '@playwright/test'

// Отдельный порт: не пересекается с `vite` (5173) и `vite preview` (4173).
const PORT = 5199

export default defineConfig({
  testDir: 'e2e',
  fullyParallel: true,
  // В CI: запрет случайно оставленного test.only, один повтор на случай флака и HTML-отчёт для артефакта.
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  // У раннера 2 ядра: 4 воркера с тяжёлыми 4K-тестами только мешали бы друг другу.
  workers: process.env.CI ? 2 : undefined,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
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
