import '@testing-library/jest-dom/vitest'
import { afterEach } from 'vitest'
import { cleanup } from '@testing-library/react'
import { __setStoreForTests } from '@/storage/store'

afterEach(() => {
  cleanup()
  __setStoreForTests(null)
})

// jsdom has no matchMedia; the theme and reduced-motion hooks both use it.
if (!window.matchMedia) {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  }))
}
