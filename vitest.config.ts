import { defineConfig, mergeConfig } from 'vitest/config'
import viteConfig from './vite.config'

// Kept separate from vite.config.ts so that file stays a plain, correctly typed Vite
// config — `test` is not part of Vite's own schema.
export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      environment: 'jsdom',
      globals: true,
      setupFiles: ['./src/test/setup.ts'],
      include: ['src/**/*.{test,spec}.{ts,tsx}', 'scripts/**/*.test.mjs'],
      coverage: {
        provider: 'v8',
        reporter: ['text', 'lcov'],
        include: ['src/engines/**', 'src/runners/**', 'src/storage/**'],
      },
    },
  }),
)
