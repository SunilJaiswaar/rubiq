import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { fileURLToPath } from 'node:url'

// GitHub Pages serves a project site from /<repo>/. Override with BASE_PATH in CI.
const base = process.env.BASE_PATH ?? '/'

export default defineConfig({
  base,
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      '~generated': fileURLToPath(new URL('./src/generated', import.meta.url)),
    },
  },
  build: {
    target: 'es2022',
    cssCodeSplit: true,
    reportCompressedSize: false,
    rollupOptions: {
      output: {
        /**
         * Only React is grouped by hand. Rollup already isolates dynamically imported
         * subgraphs correctly, and forcing Monaco into a named manual chunk made Vite
         * treat it as part of the entry's static graph — which added a
         * `<link rel="modulepreload">` for ~950 KB of editor to every page load,
         * including pages with no editor on them.
         */
        manualChunks(id) {
          if (id.includes('node_modules/react') || id.includes('node_modules/scheduler')) {
            return 'react'
          }
          return undefined
        },
      },
    },
  },
})
