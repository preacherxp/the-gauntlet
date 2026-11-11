// Playwright runs the phone and tablet checks in tests/e2e: every screen of the
// game on a range of devices, in WebKit (Safari's engine) and in Chrome.
//   npx playwright test            (screenshots go to shots/devices unless SHOTS is set)

import { defineConfig, devices } from '@playwright/test';

const chrome = { channel: 'chrome', launchOptions: { args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] } };
const PORT = 5180;

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 240000,
  fullyParallel: true,
  workers: 4,
  reporter: [['list']],
  use: { baseURL: `http://127.0.0.1:${PORT}/`, trace: 'retain-on-failure' },
  webServer: { command: 'node tools/serve.mjs', env: { PORT: String(PORT) }, url: `http://127.0.0.1:${PORT}/`, reuseExistingServer: false },
  projects: [
    { name: 'iphone-13', use: { ...devices['iPhone 13'] } },
    { name: 'iphone-se', use: { ...devices['iPhone SE'] } },
    { name: 'iphone-15-pro-max', use: { ...devices['iPhone 15 Pro Max'] } },
    { name: 'iphone-13-landscape', use: { ...devices['iPhone 13 landscape'] } },
    { name: 'ipad-mini', use: { ...devices['iPad Mini'] } },
    { name: 'pixel-7', use: { ...devices['Pixel 7'], ...chrome } },
    { name: 'galaxy-s8', use: { ...devices['Galaxy S8'], ...chrome } },
    { name: 'pixel-7-landscape', use: { ...devices['Pixel 7 landscape'], ...chrome } },
  ],
});
