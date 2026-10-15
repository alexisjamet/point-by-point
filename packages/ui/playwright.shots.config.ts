import { defineConfig, devices } from "@playwright/test";

// The README screenshots (e2e/readme.shots.ts), against the same test host as the e2e suite.
export default defineConfig({
  testDir: "./e2e",
  testMatch: /\.shots\.ts$/,
  reporter: "list",
  use: { ...devices["Desktop Chrome"], baseURL: "http://localhost:4179" },
  webServer: {
    command: "vite --config e2e/vite.config.ts",
    url: "http://localhost:4179",
    reuseExistingServer: true,
  },
});
