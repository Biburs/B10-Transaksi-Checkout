// @ts-check
const { defineConfig, devices } = require("@playwright/test");

/**
 * Konfigurasi Playwright untuk E2E test Facultyware.
 *
 * PRASYARAT (lihat tests/e2e/README.md):
 *  - MySQL berjalan & database `facultyware` sudah berisi data seed
 *    (node scripts/seed_login.js, seed_items.js, seed_employees.js).
 *
 * Playwright akan otomatis menjalankan server (`npm start`) lewat `webServer`
 * di bawah, lalu menjalankan test terhadap http://localhost:3000.
 */
module.exports = defineConfig({
  testDir: "./tests/e2e",
  // Test menulis data nyata ke DB, jadi jalankan berurutan biar deterministik.
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: "html",

  use: {
    baseURL: "http://localhost:3000",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },

  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],

  // Start server otomatis sebelum test. reuseExistingServer agar tidak bentrok
  // kalau `npm run dev` sudah berjalan di port 3000.
  webServer: {
    command: "npm start",
    url: "http://localhost:3000/login",
    reuseExistingServer: true,
    timeout: 120 * 1000,
  },
});
