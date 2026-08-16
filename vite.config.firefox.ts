import { fileURLToPath, URL } from "node:url";
import { resolve } from "node:path";
import { copyFileSync, mkdirSync, writeFileSync } from "node:fs";
import { defineConfig, loadEnv, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { createManifest } from "./extension/manifest.js";
import {
  DEFAULT_API_ENDPOINT,
  normalizeApiEndpoint,
} from "./src/lib/contracts.js";

function firefoxExtensionPlugin(apiEndpoint: string): Plugin {
  return {
    name: "firefox-extension-plugin",
    closeBundle() {
      const rootDir = process.cwd();
      const outDir = resolve(rootDir, "dist-firefox");
      mkdirSync(resolve(outDir, "extension/icons"), { recursive: true });

      // Generate Firefox Manifest V3
      const manifest = createManifest(apiEndpoint, "firefox");
      writeFileSync(
        resolve(outDir, "manifest.json"),
        JSON.stringify(manifest, null, 2),
      );

      // Copy extension icons
      for (const size of [16, 32, 48, 128]) {
        copyFileSync(
          resolve(rootDir, `extension/icons/${size}.png`),
          resolve(outDir, `extension/icons/${size}.png`),
        );
      }
    },
  };
}

const currentDir = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const apiEndpoint = normalizeApiEndpoint(
    env.VITE_API_ORIGIN || DEFAULT_API_ENDPOINT,
  );

  return {
    base: "./",
    plugins: [react(), firefoxExtensionPlugin(apiEndpoint)],
    build: {
      outDir: "dist-firefox",
      emptyOutDir: true,
      target: "firefox115",
      rollupOptions: {
        input: {
          popup: resolve(currentDir, "extension/popup.html"),
          background: resolve(currentDir, "extension/background.ts"),
        },
        output: {
          entryFileNames: (chunkInfo) => {
            if (chunkInfo.name === "background") {
              return "background.js";
            }
            return "assets/[name]-[hash].js";
          },
          chunkFileNames: "assets/[name]-[hash].js",
          assetFileNames: "assets/[name]-[hash].[ext]",
        },
      },
    },
    resolve: {
      alias: {
        "@": fileURLToPath(new URL("./src", import.meta.url)),
      },
    },
  };
});
