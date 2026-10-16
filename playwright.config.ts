import { defineConfig } from '@playwright/test'

// A dedicated port: it does not collide with `vite` (5173) or `vite preview` (4173).
const PORT = 5199

export default defineConfig({
  testDir: 'e2e',
  fullyParallel: true,
  // In CI: forbid an accidentally left test.only, retry once in case of a flake and produce an HTML report for the artifact.
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  // The runner has 2 cores: 4 workers running heavy 4K tests would only get in each other's way.
  workers: process.env.CI ? 2 : undefined,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: `http://localhost:${PORT}`,
    // System Chrome: no need to download Playwright browsers.
    channel: 'chrome',
    viewport: { width: 1280, height: 900 },
  },
  webServer: {
    command: `pnpm dev --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    // Never attach to someone else's server: it may be serving a stale build.
    reuseExistingServer: false,
  },
})
