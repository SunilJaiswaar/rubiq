/**
 * The concept map (brief §38).
 *
 * Not a force-directed graph. A spring layout of a knowledge graph looks impressive and
 * is almost unusable for the actual question a learner has — "what do I need before this,
 * and what does it unlock?" So this renders prerequisites and dependents as columns
 * around a selected concept, which answers that question directly and works on a phone.
 */
import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { loadGraph, allLessons, tracks } from '@/content/catalog'
import type { Graph as GraphData, GraphNode } from '@/content/types'
import { Page, Card, Badge, Spinner, EmptyState, cx } from '@/ui/primitives'

export default function Graph() {
  const [graph, setGraph] = useState<GraphData | null>(null)
  const [params, setParams] = useSearchParams()
  const selectedId = params.get('concept')

  useEffect(() => { void loadGraph().then(setGraph) }, [])

  const concepts = useMemo(
    () =>
      (graph?.nodes ?? [])
        .filter((n) => n.kind === 'concept')
        .sort((a, b) => a.label.localeCompare(b.label)),
    [graph],
  )

  const byId = useMemo(
    () => new Map((graph?.nodes ?? []).map((n) => [n.id, n])),
    [graph],
  )

  const selected = selectedId
    ? concepts.find((c) => c.label === selectedId || c.id === `concept:${selectedId}`)
    : null

  if (!graph) {
    return (
      <Page className="py-20 flex justify-center">
        <Spinner label="Loading the concept map" />
      </Page>
    )
  }

  const select = (label: string | null) => {
    const next = new URLSearchParams(params)
    if (label) next.set('concept', label)
    else next.delete('concept')
    setParams(next, { replace: true })
  }

  return (
    <Page className="py-10">
      <header className="max-w-2xl mb-8">
        <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-ink">
          Concept map
        </h1>
        <p className="mt-3 text-ink-muted leading-relaxed">
          Every concept the curriculum teaches, with what it depends on and what it unlocks.
          Concepts and their prerequisites are declared in lesson frontmatter, so this map
          is generated from the content rather than maintained separately.
        </p>
      </header>

      {concepts.length === 0 ? (
        <EmptyState title="No concepts declared yet">
          <p>Lessons declare <code>concepts:</code> in their frontmatter.</p>
        </EmptyState>
      ) : (
        <div className="lg:grid lg:grid-cols-[16rem_minmax(0,1fr)] lg:gap-8">
          <nav aria-label="Concepts" className="mb-6 lg:mb-0">
            <h2 className="text-xs font-bold uppercase tracking-wide text-ink-muted mb-2">
              {concepts.length} concepts
            </h2>
            <ul className="space-y-0.5 lg:max-h-[70vh] lg:overflow-y-auto">
              {concepts.map((concept) => (
                <li key={concept.id}>
                  <button
                    type="button"
                    onClick={() => select(concept.label)}
                    aria-current={selected?.id === concept.id ? 'true' : undefined}
                    className={cx(
                      'w-full text-left px-2.5 py-1.5 rounded-lg text-sm font-mono transition-colors flex items-center justify-between gap-2',
                      selected?.id === concept.id
                        ? 'bg-accent-soft text-accent-ink'
                        : 'text-ink-muted hover:text-ink hover:bg-surface',
                    )}
                  >
                    <span className="truncate">{concept.label}</span>
                    <span className="text-[0.625rem] text-ink-faint shrink-0">
                      {concept.lessons.length}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </nav>

          <div className="min-w-0">
            {selected ? (
              <ConceptDetail node={selected} byId={byId} onSelect={select} />
            ) : (
              <>
                <Card className="p-6 mb-6">
                  <h2 className="font-semibold text-ink">Pick a concept</h2>
                  <p className="mt-2 text-sm text-ink-muted leading-relaxed">
                    You will see what it depends on, what depends on it, and every lesson
                    that teaches it. Useful when a lesson assumes something you have not met.
                  </p>
                </Card>

                {/* A per-track overview so the page is useful before anything is picked. */}
                <div className="space-y-6">
                  {tracks.map((track) => {
                    const trackConcepts = concepts.filter((c) => c.track === track.slug)
                    if (trackConcepts.length === 0) return null
                    return (
                      <section key={track.slug}>
                        <h3 className="text-sm font-semibold mb-2 text-ink">
                          <Link to={`/learn/${track.slug}`} className="hover:text-accent">
                            {track.title}
                          </Link>
                        </h3>
                        <div className="flex flex-wrap gap-1.5">
                          {trackConcepts.map((concept) => (
                            <button
                              key={concept.id}
                              type="button"
                              onClick={() => select(concept.label)}
                              className="text-xs font-mono px-2 py-1 rounded-lg border border-border text-ink-muted hover:border-accent hover:text-accent transition-colors"
                            >
                              {concept.label}
                            </button>
                          ))}
                        </div>
                      </section>
                    )
                  })}
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </Page>
  )
}

function ConceptDetail({
  node, byId, onSelect,
}: {
  node: GraphNode
  byId: Map<string, GraphNode>
  onSelect: (label: string) => void
}) {
  const prereqs = node.prerequisites
    .map((id) => byId.get(id))
    .filter((n): n is GraphNode => Boolean(n))
  const unlocks = node.next
    .map((id) => byId.get(id))
    .filter((n): n is GraphNode => Boolean(n))

  // Lessons that merely mention the concept, as opposed to teaching it.
  const mentions = allLessons.filter(
    (l) => l.prerequisites.includes(node.label) && !node.lessons.some((x) => x.id === l.id),
  )

  return (
    <div>
      <div className="flex items-center gap-3 mb-6 flex-wrap">
        <code className="text-xl font-mono font-semibold text-accent">{node.label}</code>
        {node.track && <Badge>{node.track}</Badge>}
      </div>

      <div className="grid gap-4 sm:grid-cols-3 mb-6">
        <Column
          title="Comes before"
          empty="Nothing — this is a starting point."
          items={prereqs}
          onSelect={onSelect}
        />
        <Card className="p-4 border-accent/40">
          <h3 className="text-xs font-bold uppercase tracking-wide text-accent mb-2">
            This concept
          </h3>
          <code className="text-sm font-mono text-ink">{node.label}</code>
          <p className="mt-2 text-xs text-ink-muted">
            Taught in {node.lessons.length} lesson{node.lessons.length === 1 ? '' : 's'}
          </p>
        </Card>
        <Column
          title="Unlocks"
          empty="Nothing yet depends on this."
          items={unlocks}
          onSelect={onSelect}
        />
      </div>

      <section className="mb-6">
        <h3 className="text-xs font-bold uppercase tracking-wide text-ink-muted mb-2">
          Taught in
        </h3>
        {node.lessons.length === 0 ? (
          <Card className="p-4">
            <p className="text-sm text-ink-muted">No lesson declares this concept yet.</p>
          </Card>
        ) : (
          <Card className="divide-y divide-border">
            {node.lessons.map((lesson) => (
              <Link
                key={lesson.id}
                to={lesson.route}
                className="block px-4 py-2.5 text-sm text-ink hover:bg-surface transition-colors"
              >
                {lesson.title}
              </Link>
            ))}
          </Card>
        )}
      </section>

      {mentions.length > 0 && (
        <section>
          <h3 className="text-xs font-bold uppercase tracking-wide text-ink-muted mb-2">
            Assumed by
          </h3>
          <Card className="divide-y divide-border">
            {mentions.map((lesson) => (
              <Link
                key={lesson.id}
                to={lesson.route}
                className="block px-4 py-2.5 text-sm text-ink-muted hover:bg-surface hover:text-ink transition-colors"
              >
                {lesson.title}
              </Link>
            ))}
          </Card>
          <p className="mt-2 text-xs text-ink-faint">
            These lessons list this concept as a prerequisite — read it first.
          </p>
        </section>
      )}
    </div>
  )
}

function Column({
  title, items, empty, onSelect,
}: {
  title: string
  items: GraphNode[]
  empty: string
  onSelect: (label: string) => void
}) {
  return (
    <Card className="p-4">
      <h3 className="text-xs font-bold uppercase tracking-wide text-ink-muted mb-2">
        {title}
      </h3>
      {items.length === 0 ? (
        <p className="text-xs text-ink-faint leading-relaxed">{empty}</p>
      ) : (
        <ul className="space-y-1">
          {items.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                onClick={() => onSelect(item.label)}
                className="text-sm font-mono text-accent hover:underline text-left"
              >
                {item.label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}
