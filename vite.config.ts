import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import fs from "node:fs";
import path from "node:path";
import { projectContext } from "./scripts/workspaces";
import { studioPlugin } from "./scripts/studio-plugin";
import { buildContent } from "./scripts/content";
import { buildReleaseContent } from "./scripts/release-content";

export default defineConfig(({ mode }) => {
  const profile = mode === "release" ? "release" : "modern";
  const ctx = projectContext(profile, process.env.MAGICKISA_WORKSPACE);
  return {
    plugins: [react(), studioPlugin(), {
      name: "magickisa-project-content",
      buildStart() {
        if (profile === "release") buildReleaseContent(ctx.content, ctx.public);
        else buildContent(JSON.parse(fs.readFileSync(ctx.projectFile, "utf8")), ctx.public, false);
      },
      transformIndexHtml: {
        order: "pre",
        handler(html, context) {
          if (context.path !== "/index.html") return html;
          return html.replace("/src/main.tsx", profile === "release" ? "/src/compat/release/main.jsx" : "/src/main.tsx");
        },
      },
    }],
    publicDir: ctx.public,
    server: { host: "127.0.0.1", watch: { ignored: ["**/workspace-projects/**", "**/.studio-transfers/**", "**/dist-studio/**"] } },
    preview: { host: "127.0.0.1" },
    build: {
      outDir: process.env.MAGICKISA_BUILD_EDITOR === "1" ? "dist-studio" : ctx.output,
      emptyOutDir: true,
      sourcemap: true,
      rollupOptions: { input: process.env.MAGICKISA_BUILD_EDITOR === "1" ? { engine: "engine.html", preview: "studio-preview.html" } : "index.html" },
    },
  };
});
