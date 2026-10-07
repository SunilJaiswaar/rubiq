import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { loadSearchEngine, type SearchEngine } from '@/engines/search'
import { tracks } from '@/content/catalog'
import { Page, Card, Badge, Spinner, EmptyState, cx } from '@/ui/primitives'

const EXAMPLES = [
  'why does Redis use memory',
  'n+1 query',
  'what is NULL',
  'ruby blocks',
  'how does an index work',
  'binary search edge cases',
  'hash collisions',
]

export default function Search() {
  const [params, setParams] = useSearchParams()
  const query = params.get('q') ?? ''
  const trackFilter = params.get('track') ?? ''
  const [engine, setEngine] = useState<SearchEngine | null>(null)
  const [input, setInput] = useState(query)

  useEffect(() => { void loadSearchEngine().then(setEngine) }, [])
  useEffect(() => { setInput(query) }, [query])

  // Debounce so the URL does not change on every keystroke.
  useEffect(() => {
    const timer = setTimeout(() => {
      const next = new URLSearchParams(params)
      if (input.trim()) next.set('q', input.trim())
      else next.delete('q')
      if (next.toString() !== params.toString()) setParams(next, { replace: true })
    }, 200)
    return () => clearTimeout(timer)
  }, [input, params, setParams])

  const hits = useMemo(() => {
    if (!engine || !query.trim()) return []
    return engine.search(query, { limit: 30, ...(trackFilter ? { track: trackFilter } : {}) })
  }, [engine, query, trackFilter])

  const setTrack = (slug: string) => {
    const next = new URLSearchParams(params)
    if (slug) next.set('track', slug)
    else next.delete('track')
    setParams(next, { replace: true })
  }

  return (
    <Page width="narrow" className="py-10">
      <h1 className="text-2xl font-semibold tracking-tight mb-5 text-ink">Search</h1>

      <div className="relative">
        <label htmlFor="search-input" className="sr-only">Search lessons</label>
        <input
          id="search-input"
          type="search"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask a question, or name a thing…"
          autoFocus
          autoComplete="off"
          className="w-full text-base rounded-xl border border-border-strong bg-surface-raised px-4 py-3 placeholder:text-ink-faint text-ink focus:border-accent focus:outline-none"
        />
        {!engine && (
          <span className="absolute right-3 top-1/2 -translate-y-1/2">
            <Spinner label="" />
          </span>
        )}
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5">
        <button
          type="button"
          onClick={() => setTrack('')}
          aria-pressed={!trackFilter}
          className={cx(
            'text-xs px-2.5 py-1 rounded-full border transition-colors',
            !trackFilter
              ? 'border-accent bg-accent-soft text-accent-ink'
              : 'border-border text-ink-muted hover:border-border-strong',
          )}
        >
          All tracks
        </button>
        {tracks.map((track) => (
          <button
            key={track.slug}
            type="button"
            onClick={() => setTrack(track.slug)}
            aria-pressed={trackFilter === track.slug}
            className={cx(
              'text-xs px-2.5 py-1 rounded-full border transition-colors',
              trackFilter === track.slug
                ? 'border-accent bg-accent-soft text-accent-ink'
                : 'border-border text-ink-muted hover:border-border-strong',
            )}
          >
            {track.title}
          </button>
        ))}
      </div>

      {!query.trim() ? (
        <div className="mt-10">
          <h2 className="text-xs font-bold uppercase tracking-wide text-ink-muted mb-3">
            Try asking
          </h2>
          <ul className="space-y-1.5">
            {EXAMPLES.map((example) => (
              <li key={example}>
                <button
                  type="button"
                  onClick={() => setInput(example)}
                  className="text-sm text-accent hover:underline text-left"
                >
                  {example}
                </button>
              </li>
            ))}
          </ul>
          <p className="mt-6 text-sm text-ink-muted leading-relaxed">
            Search covers every word of every lesson, including the code. Natural questions
            work — common words are ignored and the rest are matched, so
            &ldquo;why does Redis use memory&rdquo; scores on <em>redis</em>,{' '}
            <em>use</em> and <em>memory</em>.
          </p>
        </div>
      ) : hits.length === 0 ? (
        <div className="mt-6">
          {engine ? (
            <EmptyState title={`Nothing matched "${query}"`}>
              <p>
                This curriculum is small and growing — the topic may genuinely not be
                written yet. The{' '}
                <Link to="/contribute" className="text-accent underline">contribute guide</Link>{' '}
                explains how to add a lesson, and{' '}
                <a
                  href={`https://github.com/SunilJaiswaar/rubiq/issues/new?title=${encodeURIComponent(`Lesson request: ${query}`)}&labels=content`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-accent underline"
                >
                  requesting it as an issue
                </a>{' '}
                is the fastest way to get it on the list.
              </p>
            </EmptyState>
          ) : (
            <div className="py-10 flex justify-center">
              <Spinner label="Loading the search index" />
            </div>
          )}
        </div>
      ) : (
        <>
          <p className="mt-6 mb-3 text-sm text-ink-muted">
            {hits.length} result{hits.length === 1 ? '' : 's'}
          </p>
          <ul className="space-y-2">
            {hits.map((hit) => (
              <li key={hit.doc.id}>
                <Card className="hover:border-border-strong transition-colors">
                  <Link to={hit.doc.route} className="block p-4">
                    <div className="flex items-start justify-between gap-3">
                      <h3 className="font-medium text-ink">{hit.doc.title}</h3>
                      <div className="flex gap-1.5 shrink-0">
                        <Badge>{hit.doc.track}</Badge>
                        <Badge>{hit.doc.minutes}m</Badge>
                      </div>
                    </div>
                    {hit.doc.summary && (
                      <p className="mt-1.5 text-sm text-ink-muted leading-relaxed">
                        {hit.doc.summary}
                      </p>
                    )}
                    {/* Say why this result matched — opaque ranking erodes trust. */}
                    <p className="mt-2 text-[0.6875rem] text-ink-faint">
                      matched {hit.matchedTerms.map((t) => `“${t}”`).join(', ')} in{' '}
                      {hit.matchedFields.join(', ')}
                    </p>
                  </Link>
                </Card>
              </li>
            ))}
          </ul>
        </>
      )}
    </Page>
  )
}
