import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import fs from "node:fs";
import { projectContext } from "./scripts/workspaces";
import { studioPlugin } from "./scripts/studio-plugin";
import { buildContent } from "./scripts/content";
import { LEGACY_UNSUPPORTED } from "./src/engine/support";

export default defineConfig(({ mode }) => {
  if (mode === "release") throw new Error(LEGACY_UNSUPPORTED);
  const profile = "modern";
  const ctx = projectContext(profile, process.env.MAGICKISA_WORKSPACE);
  return {
    plugins: [
      react(),
      studioPlugin(),
      {
        name: "magickisa-project-content",
        buildStart() {
          buildContent(
            JSON.parse(fs.readFileSync(ctx.projectFile, "utf8")),
            ctx.public,
            false,
          );
        },
      },
    ],
    publicDir: ctx.public,
    server: {
      host: "127.0.0.1",
      watch: {
        ignored: [
          "**/workspace-projects/**",
          "**/.studio-transfers/**",
          "**/dist-studio/**",
        ],
      },
    },
    preview: { host: "127.0.0.1" },
    build: {
      outDir:
        process.env.MAGICKISA_BUILD_EDITOR === "1" ? "dist-studio" : ctx.output,
      emptyOutDir: true,
      sourcemap: true,
      rollupOptions: {
        input:
          process.env.MAGICKISA_BUILD_EDITOR === "1"
            ? { engine: "engine.html", preview: "studio-preview.html" }
            : "index.html",
      },
    },
  };
});
