import { readFileSync } from "node:fs";
import { defineConfig } from "vite";

// Serves the test host, and the built interface at /annotation.html.
export default defineConfig({
  root: new URL("./harness", import.meta.url).pathname,
  server: { port: 4179, strictPort: true },
  plugins: [
    {
      name: "serve-built-ui",
      configureServer(server) {
        server.middlewares.use("/annotation.html", (_req, res) => {
          res.setHeader("content-type", "text/html; charset=utf-8");
          res.end(readFileSync(new URL("../dist/index.html", import.meta.url)));
        });
      },
    },
  ],
});
