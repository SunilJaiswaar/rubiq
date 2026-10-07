import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { loadInterviewBank, tracks } from '@/content/catalog'
import type { InterviewQuestion, LessonStub, Level } from '@/content/types'
import { InterviewCard } from '@/features/InterviewCard'
import { Page, Card, Spinner, EmptyState, Button, cx } from '@/ui/primitives'

type Entry = { lesson: LessonStub; question: InterviewQuestion }

const LEVELS: Level[] = ['beginner', 'basic', 'intermediate', 'advanced', 'expert']

export default function Interview() {
  const [bank, setBank] = useState<Entry[] | null>(null)
  const [trackFilter, setTrackFilter] = useState('')
  const [levelFilter, setLevelFilter] = useState<Level | ''>('')
  // Simulation mode shows one question at a time, which is what an interview is like.
  const [simulating, setSimulating] = useState(false)
  const [simIndex, setSimIndex] = useState(0)
  const [seed, setSeed] = useState(1)

  useEffect(() => { void loadInterviewBank().then(setBank) }, [])

  const filtered = useMemo(() => {
    const all = bank ?? []
    return all.filter(
      (e) =>
        (!trackFilter || e.lesson.track === trackFilter) &&
        (!levelFilter || (e.question.level ?? e.lesson.level) === levelFilter),
    )
  }, [bank, trackFilter, levelFilter])

  const simOrder = useMemo(() => {
    // A stable shuffle so navigating back and forth does not reorder.
    const items = [...filtered]
    let state = seed || 1
    for (let i = items.length - 1; i > 0; i--) {
      state = (state * 1103515245 + 12345) & 0x7fffffff
      const j = state % (i + 1)
      const a = items[i]!
      items[i] = items[j]!
      items[j] = a
    }
    return items
  }, [filtered, seed])

  if (!bank) {
    return (
      <Page className="py-20 flex justify-center">
        <Spinner label="Loading the question bank" />
      </Page>
    )
  }

  if (bank.length === 0) {
    return (
      <Page width="narrow" className="py-16">
        <EmptyState title="No interview questions yet">
          <p>
            Interview questions live in each lesson's frontmatter under{' '}
            <code>interview:</code>. See the{' '}
            <Link to="/contribute" className="text-accent underline">contribute guide</Link>.
          </p>
        </EmptyState>
      </Page>
    )
  }

  const current = simOrder[simIndex]

  return (
    <Page width="narrow" className="py-10">
      <header className="mb-6">
        <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-ink">
          Interview
        </h1>
        <p className="mt-3 text-ink-muted leading-relaxed">
          {bank.length} questions drawn from the lessons. Each one makes you commit to an
          answer before it shows you anything — because reading a good answer feels like
          learning and mostly is not.
        </p>
      </header>

      <Card className="p-4 mb-6">
        <div className="flex flex-wrap items-center gap-3 justify-between">
          <div>
            <h2 className="text-sm font-semibold text-ink">Simulation</h2>
            <p className="text-xs text-ink-muted mt-0.5">
              One question at a time, in random order. Closer to the real thing than a list.
            </p>
          </div>
          <Button
            variant={simulating ? 'secondary' : 'primary'}
            size="sm"
            onClick={() => {
              setSimulating((s) => !s)
              setSimIndex(0)
              setSeed(Date.now() % 100000)
            }}
          >
            {simulating ? 'Back to browsing' : 'Start a simulation'}
          </Button>
        </div>
      </Card>

      {!simulating && (
        <div className="mb-5 space-y-2">
          <div className="flex flex-wrap gap-1.5">
            <Chip active={!trackFilter} onClick={() => setTrackFilter('')}>
              All tracks ({bank.length})
            </Chip>
            {tracks.map((track) => {
              const count = bank.filter((e) => e.lesson.track === track.slug).length
              if (count === 0) return null
              return (
                <Chip
                  key={track.slug}
                  active={trackFilter === track.slug}
                  onClick={() => setTrackFilter(track.slug)}
                >
                  {track.title} ({count})
                </Chip>
              )
            })}
          </div>
          <div className="flex flex-wrap gap-1.5">
            <Chip active={!levelFilter} onClick={() => setLevelFilter('')}>
              Any level
            </Chip>
            {LEVELS.map((level) => {
              const count = bank.filter(
                (e) => (e.question.level ?? e.lesson.level) === level,
              ).length
              if (count === 0) return null
              return (
                <Chip
                  key={level}
                  active={levelFilter === level}
                  onClick={() => setLevelFilter(level)}
                >
                  {level} ({count})
                </Chip>
              )
            })}
          </div>
        </div>
      )}

      {simulating ? (
        current ? (
          <>
            <div className="flex items-center justify-between mb-3 text-sm">
              <span className="text-ink-muted">
                Question {simIndex + 1} of {simOrder.length}
              </span>
              <Link
                to={current.lesson.route}
                className="text-xs text-accent hover:underline"
              >
                Read the lesson →
              </Link>
            </div>

            <InterviewCard
              key={`${simIndex}-${seed}`}
              question={current.question}
              lessonTitle={current.lesson.title}
            />

            <div className="mt-4 flex justify-between">
              <Button
                size="sm"
                onClick={() => setSimIndex((i) => Math.max(0, i - 1))}
                disabled={simIndex === 0}
              >
                ← Previous
              </Button>
              <Button
                size="sm"
                variant="primary"
                onClick={() => setSimIndex((i) => Math.min(simOrder.length - 1, i + 1))}
                disabled={simIndex >= simOrder.length - 1}
              >
                Next question →
              </Button>
            </div>
          </>
        ) : (
          <EmptyState title="No questions match those filters" />
        )
      ) : (
        <>
          <p className="mb-3 text-sm text-ink-muted">
            {filtered.length} question{filtered.length === 1 ? '' : 's'}
          </p>
          <div className="space-y-3">
            {filtered.map((entry, i) => (
              <div key={`${entry.lesson.id}-${i}`}>
                <InterviewCard
                  question={entry.question}
                  lessonTitle={entry.lesson.title}
                />
              </div>
            ))}
          </div>
          {filtered.length === 0 && <EmptyState title="No questions match those filters" />}
        </>
      )}
    </Page>
  )
}

function Chip({
  active, onClick, children,
}: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cx(
        'text-xs px-2.5 py-1 rounded-full border transition-colors',
        active
          ? 'border-accent bg-accent-soft text-accent-ink'
          : 'border-border text-ink-muted hover:border-border-strong',
      )}
    >
      {children}
    </button>
  )
}
