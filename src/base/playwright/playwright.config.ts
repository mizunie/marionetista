import { defineConfig, devices } from '@playwright/test'
import path from 'path'

export const STORAGE_STATE = path.join(__dirname, '.auth/session.json')

export default defineConfig({
  testDir: './src/tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [['html', { open: 'never' }]],

  use: {
    baseURL: process.env.BASE_URL || 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },

  globalSetup: './global.setup.ts',

  projects: [
    // Setup: autenticación (corre primero, una sola vez)
    {
      name: 'setup',
      testMatch: /global\.setup\.ts/,
    },
    // Tests que requieren sesión autenticada
    /*{
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        storageState: STORAGE_STATE,
      },
      dependencies: ['setup'],
    },*/
    // Tests que NO requieren sesión (ej: login page)
    {
      name: 'chromium-no-auth',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
})
