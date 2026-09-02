import { defineConfig, devices } from '@playwright/test'

// The backend runs from the repo's backend/ directory. Locally that means the
// virtualenv interpreter; in CI the venv is already on PATH.
const PYTHON = process.env.AEGIS_PYTHON ?? 'python'

const backendEnv = {
  AEGIS_DATABASE_URL: 'sqlite+aiosqlite:///./e2e.db',
  AEGIS_API_TOKEN: 'dev-local-token',
  AEGIS_TICK_SECONDS: '1.0',
  AEGIS_CORS_ORIGINS: 'http://localhost:5173,http://127.0.0.1:5173',
}

export default defineConfig({
  testDir: './e2e',
  timeout: 120_000,
  expect: { timeout: 30_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'retain-on-failure',
    viewport: { width: 1600, height: 1000 },
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      command: `"${PYTHON}" -m uvicorn aegis.main:app --host 127.0.0.1 --port 8000`,
      cwd: '../backend',
      url: 'http://127.0.0.1:8000/api/health',
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      env: backendEnv,
    },
    {
      command: 'npm run dev -- --port 5173 --strictPort',
      url: 'http://localhost:5173',
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
  ],
})
