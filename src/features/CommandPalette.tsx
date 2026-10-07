/**
 * Search, as a command palette.
 *
 * The search index is fetched on first open, never at page load. Until it arrives the
 * palette still works for navigation and track jumps, so `/` is never a dead key.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { loadSearchEngine, type SearchEngine, type SearchHit } from '@/engines/search'
import { tracks } from '@/content/catalog'
import { useFocusTrap } from '@/hooks/useKeyboard'
import { cx, Badge, Spinner } from '@/ui/primitives'

interface Item {
  id: string
  title: string
  detail: string
  to: string
  kind: 'lesson' | 'track' | 'page'
  level?: string
}

const PAGES: Item[] = [
  { id: 'p-learn', title: 'All tracks', detail: 'Browse the catalogue', to: '/learn', kind: 'page' },
  { id: 'p-roadmaps', title: 'Roadmaps', detail: 'Role-based learning paths', to: '/roadmaps', kind: 'page' },
  { id: 'p-practice', title: 'Practice', detail: 'Every coding exercise', to: '/practice', kind: 'page' },
  { id: 'p-interview', title: 'Interview', detail: 'Progressive-reveal questions', to: '/interview', kind: 'page' },
  { id: 'p-review', title: 'Review', detail: 'Spaced repetition queue', to: '/review', kind: 'page' },
  { id: 'p-playground', title: 'Playground', detail: 'Run code and SQL', to: '/playground', kind: 'page' },
  { id: 'p-graph', title: 'Concept map', detail: 'How the concepts connect', to: '/graph', kind: 'page' },
  { id: 'p-progress', title: 'Progress', detail: 'Your stats, export and import', to: '/progress', kind: 'page' },
  { id: 'p-contribute', title: 'Contribute', detail: 'Add or fix a lesson', to: '/contribute', kind: 'page' },
]

const TRACK_ITEMS: Item[] = tracks.map((t) => ({
  id: `t-${t.slug}`,
  title: t.title,
  detail: `${t.lessonCount} lessons · ${t.tagline}`,
  to: `/learn/${t.slug}`,
  kind: 'track',
}))

/**
 * Rendered only while open — the parent does `{paletteOpen && <CommandPalette … />}`.
 *
 * That is deliberate. When this was always mounted it needed effects to clear the
 * query, reset the highlighted row and refocus the input every time `open` flipped.
 * Mounting fresh makes all of that the component's initial state instead, which is
 * both less code and what React recommends over resetting state in an effect.
 * Re-running `loadSearchEngine()` on each open is free: the promise is memoised at
 * module level.
 */
export function CommandPalette({
  onClose, onNavigate,
}: { onClose: () => void; onNavigate: (to: string) => void }) {
  const [query, setQuery] = useState('')
  const [engine, setEngine] = useState<SearchEngine | null>(null)
  const [loadingIndex, setLoadingIndex] = useState(true)
  const [rawSelected, setSelected] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const dialogRef = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLUListElement>(null)

  useFocusTrap(dialogRef, true)

  // Focus the input and fetch the index, once, on mount.
  useEffect(() => {
    inputRef.current?.focus()
    let cancelled = false
    void loadSearchEngine()
      .then((loaded) => { if (!cancelled) setEngine(loaded) })
      .finally(() => { if (!cancelled) setLoadingIndex(false) })
    return () => { cancelled = true }
  }, [])

  // Prevent the page behind the dialog from scrolling.
  useEffect(() => {
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = previous }
  }, [])

  const items = useMemo<Item[]>(() => {
    const q = query.trim()
    if (!q) {
      return [...TRACK_ITEMS, ...PAGES].slice(0, 10)
    }

    const lower = q.toLowerCase()
    const staticMatches = [...TRACK_ITEMS, ...PAGES].filter(
      (i) => i.title.toLowerCase().includes(lower) || i.detail.toLowerCase().includes(lower),
    )

    const lessonMatches: Item[] = (engine?.search(q, { limit: 12 }) ?? []).map(
      (hit: SearchHit) => ({
        id: hit.doc.id,
        title: hit.doc.title,
        detail: hit.doc.summary || `${hit.doc.track} · ${hit.doc.minutes} min`,
        to: hit.doc.route,
        kind: 'lesson' as const,
        level: hit.doc.level,
      }),
    )

    return [...lessonMatches, ...staticMatches].slice(0, 14)
  }, [query, engine])

  // The highlighted row is clamped during render rather than reset in an effect,
  // so a shorter result list can never leave the selection pointing past its end.
  const selected = items.length === 0 ? 0 : Math.min(rawSelected, items.length - 1)

  // Keep the highlighted row in view while arrowing through a long list.
  useEffect(() => {
    listRef.current?.querySelector('[data-selected="true"]')?.scrollIntoView({ block: 'nearest' })
  }, [selected])

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setSelected((s) => (items.length === 0 ? 0 : (s + 1) % items.length))
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setSelected((s) => (items.length === 0 ? 0 : (s - 1 + items.length) % items.length))
    } else if (event.key === 'Enter') {
      event.preventDefault()
      const item = items[selected]
      if (item) onNavigate(item.to)
      else if (query.trim()) onNavigate(`/search?q=${encodeURIComponent(query.trim())}`)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-[12vh] px-4"
      role="presentation"
    >
      <div
        className="absolute inset-0 bg-black/45 backdrop-blur-[2px]"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label="Search and navigate"
        className="relative w-full max-w-xl bg-surface-raised border border-border rounded-xl shadow-2xl overflow-hidden"
      >
        <div className="flex items-center gap-3 px-4 border-b border-border">
          <span className="text-ink-faint" aria-hidden="true">⌕</span>
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Search lessons, or ask a question…"
            aria-label="Search"
            aria-controls="palette-results"
            aria-activedescendant={items[selected] ? `palette-${items[selected].id}` : undefined}
            className="flex-1 bg-transparent py-3.5 text-[0.9375rem] outline-none placeholder:text-ink-faint text-ink"
            autoComplete="off"
            spellCheck={false}
          />
          {loadingIndex && <Spinner label="" />}
          <kbd className="font-mono text-[0.625rem] text-ink-faint border border-border rounded px-1 py-px">
            esc
          </kbd>
        </div>

        <ul
          ref={listRef}
          id="palette-results"
          role="listbox"
          aria-label="Results"
          className="max-h-[52vh] overflow-y-auto py-1.5"
        >
          {items.length === 0 && (
            <li className="px-4 py-8 text-center text-sm text-ink-muted">
              {engine
                ? <>Nothing matched &ldquo;{query}&rdquo;.</>
                : <>Loading the search index…</>}
            </li>
          )}
          {items.map((item, i) => (
            <li key={item.id} id={`palette-${item.id}`} role="option" aria-selected={i === selected}>
              <button
                type="button"
                data-selected={i === selected}
                onMouseEnter={() => setSelected(i)}
                onClick={() => onNavigate(item.to)}
                className={cx(
                  'w-full text-left px-4 py-2 flex items-center gap-3 transition-colors',
                  i === selected ? 'bg-accent-soft' : 'hover:bg-surface',
                )}
              >
                <span className="text-[0.625rem] font-semibold uppercase tracking-wide text-ink-faint w-12 shrink-0">
                  {item.kind}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium text-ink truncate">{item.title}</span>
                  <span className="block text-xs text-ink-muted truncate">{item.detail}</span>
                </span>
                {item.level && <Badge>{item.level}</Badge>}
              </button>
            </li>
          ))}
        </ul>

        {query.trim() && (
          <div className="border-t border-border px-4 py-2 text-xs text-ink-faint flex items-center justify-between">
            <span>
              <kbd className="font-mono">↑↓</kbd> navigate · <kbd className="font-mono">↵</kbd> open
            </span>
            <button
              type="button"
              className="hover:text-ink-muted"
              onClick={() => onNavigate(`/search?q=${encodeURIComponent(query.trim())}`)}
            >
              See all results →
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
