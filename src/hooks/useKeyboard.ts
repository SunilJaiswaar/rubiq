import { useEffect } from 'react'

/**
 * Global keyboard shortcuts.
 *
 * Deliberately inert while focus is in an editable field — a learner typing `/` in a
 * notes box must get a slash, not a search dialog. This is the bug that makes most
 * hand-rolled shortcut systems infuriating.
 */
export function useShortcut(
  key: string,
  handler: (event: KeyboardEvent) => void,
  { enabled = true, allowInInput = false }: { enabled?: boolean; allowInInput?: boolean } = {},
): void {
  useEffect(() => {
    if (!enabled) return

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== key) return
      if (event.metaKey || event.ctrlKey || event.altKey) return

      if (!allowInInput) {
        const target = event.target as HTMLElement | null
        const tag = target?.tagName
        if (
          tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' ||
          target?.isContentEditable ||
          target?.closest('[data-editor]')
        ) {
          return
        }
      }

      handler(event)
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [key, handler, enabled, allowInInput])
}

/** Trap focus inside a container while it is open — required for a modal dialog. */
export function useFocusTrap(
  ref: React.RefObject<HTMLElement | null>,
  active: boolean,
): void {
  useEffect(() => {
    if (!active || !ref.current) return
    const container = ref.current
    const previouslyFocused = document.activeElement as HTMLElement | null

    const selector =
      'a[href],button:not([disabled]),input:not([disabled]),select,textarea,[tabindex]:not([tabindex="-1"])'

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Tab') return
      const items = [...container.querySelectorAll<HTMLElement>(selector)]
        .filter((el) => el.offsetParent !== null)
      if (items.length === 0) return

      const first = items[0] as HTMLElement
      const last = items[items.length - 1] as HTMLElement

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }

    container.addEventListener('keydown', onKeyDown)
    return () => {
      container.removeEventListener('keydown', onKeyDown)
      previouslyFocused?.focus?.()
    }
  }, [ref, active])
}
