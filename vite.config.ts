import { fileURLToPath, URL } from 'node:url'
import { defineConfig, loadEnv } from 'vite'
import { crx } from '@crxjs/vite-plugin'
import react from '@vitejs/plugin-react'
import { createManifest } from './extension/manifest.js'
import { DEFAULT_API_ENDPOINT, normalizeApiEndpoint } from './src/lib/contracts.js'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const apiEndpoint = normalizeApiEndpoint(
    env.VITE_API_ORIGIN || DEFAULT_API_ENDPOINT,
  )

  return {
    plugins: [react(), crx({ manifest: createManifest(apiEndpoint) })],
    server: {
      host: 'localhost',
      port: 5173,
      strictPort: true,
    },
    build: {
      outDir: 'dist-extension',
      emptyOutDir: true,
      target: 'chrome120',
    },
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
      },
    },
  }
})


