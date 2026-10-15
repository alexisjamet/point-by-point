import { readFileSync } from "node:fs";
import { defineConfig } from "vitest/config";
import { viteSingleFile } from "vite-plugin-singlefile";

const { version } = JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf8")) as {
  version: string;
};

export default defineConfig({
  plugins: [viteSingleFile({ removeViteModuleLoader: true })],
  define: { __APP_VERSION__: JSON.stringify(version) },
  build: {
    target: "es2022",
    outDir: "dist",
    emptyOutDir: true,
    assetsInlineLimit: Number.MAX_SAFE_INTEGER,
    cssCodeSplit: false,
    modulePreload: false,
  },
  test: {
    environment: "jsdom",
    include: ["test/**/*.test.ts"],
  },
});
