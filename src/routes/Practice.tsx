import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { loadExerciseBank, tracks } from '@/content/catalog'
import type { Exercise, LessonStub } from '@/content/types'
import { useAllProgress } from '@/hooks/useProgress'
import { ExerciseRunner } from '@/features/ExerciseRunner'
import { useProgressContext } from '@/hooks/useProgress'
import {
  Page, Card, Badge, Spinner, EmptyState, LevelBadge, cx,
} from '@/ui/primitives'

export default function Practice() {
  const [bank, setBank] = useState<Array<{ lesson: LessonStub; exercise: Exercise }> | null>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const [trackFilter, setTrackFilter] = useState('')
  const progressMap = useAllProgress()
  const { progress, invalidate } = useProgressContext()

  useEffect(() => { void loadExerciseBank().then(setBank) }, [])

  const filtered = useMemo(
    () => (bank ?? []).filter((e) => !trackFilter || e.lesson.track === trackFilter),
    [bank, trackFilter],
  )

  const current = useMemo(
    () => filtered.find((e) => e.exercise.id === selected) ?? filtered[0],
    [filtered, selected],
  )

  if (!bank) {
    return (
      <Page className="py-20 flex justify-center">
        <Spinner label="Loading exercises" />
      </Page>
    )
  }

  if (bank.length === 0) {
    return (
      <Page width="narrow" className="py-16">
        <EmptyState title="No exercises yet">
          <p>
            Exercises live alongside lessons as <code>exercise.yml</code> files. See the{' '}
            <Link to="/contribute" className="text-accent underline">contribute guide</Link>{' '}
            for the format — one file, no application code.
          </p>
        </EmptyState>
      </Page>
    )
  }

  return (
    <Page width="wide" className="py-10">
      <header className="max-w-2xl mb-8">
        <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-ink">
          Practice
        </h1>
        <p className="mt-3 text-ink-muted leading-relaxed">
          Every exercise in the curriculum, runnable here. Hidden tests cover the edge cases
          — so passing means it actually works, not that it works on the example.
        </p>
      </header>

      <div className="mb-6 flex flex-wrap gap-1.5">
        <FilterChip active={!trackFilter} onClick={() => setTrackFilter('')}>
          All ({bank.length})
        </FilterChip>
        {tracks.map((track) => {
          const count = bank.filter((e) => e.lesson.track === track.slug).length
          if (count === 0) return null
          return (
            <FilterChip
              key={track.slug}
              active={trackFilter === track.slug}
              onClick={() => setTrackFilter(track.slug)}
            >
              {track.title} ({count})
            </FilterChip>
          )
        })}
      </div>

      <div className="lg:grid lg:grid-cols-[16rem_minmax(0,1fr)] lg:gap-8">
        <nav aria-label="Exercises" className="mb-6 lg:mb-0">
          <ul className="space-y-1.5">
            {filtered.map(({ lesson, exercise }) => {
              const solved = progressMap.get(lesson.id)?.exerciseSolved
              const isCurrent = current?.exercise.id === exercise.id
              return (
                <li key={exercise.id}>
                  <button
                    type="button"
                    onClick={() => setSelected(exercise.id)}
                    aria-current={isCurrent ? 'true' : undefined}
                    className={cx(
                      'w-full text-left p-3 rounded-xl border transition-colors',
                      isCurrent
                        ? 'border-accent bg-accent-soft'
                        : 'border-border hover:border-border-strong bg-surface-raised',
                    )}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span className="text-sm font-medium text-ink">{exercise.title}</span>
                      {solved && <Badge tone="positive">✓</Badge>}
                    </div>
                    <span className="block mt-1 text-xs text-ink-muted truncate">
                      {lesson.title}
                    </span>
                    <span className="mt-1.5 flex items-center gap-1.5">
                      <Badge>{exercise.language}</Badge>
                      <LevelBadge level={lesson.level} />
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        </nav>

        <div className="min-w-0">
          {current ? (
            <>
              <div className="mb-4 text-sm text-ink-muted">
                From{' '}
                <Link to={current.lesson.route} className="text-accent hover:underline">
                  {current.lesson.title}
                </Link>{' '}
                — read the lesson first if the exercise does not make sense.
              </div>
              <ExerciseRunner
                key={current.exercise.id}
                exercise={current.exercise}
                onSolved={async () => {
                  if (!progress) return
                  await progress.recordExerciseSolved(current.lesson.id)
                  await progress.touchStreak()
                  invalidate()
                }}
              />
            </>
          ) : (
            <Card className="p-8">
              <EmptyState title="No exercises in that track yet" />
            </Card>
          )}
        </div>
      </div>
    </Page>
  )
}

function FilterChip({
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
