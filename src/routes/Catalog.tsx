import { Link } from 'react-router-dom'
import { tracks, totals } from '@/content/catalog'
import { useAllProgress } from '@/hooks/useProgress'
import { Page, Card, Badge, LevelBadge, ProgressBar, cx } from '@/ui/primitives'

export default function Catalog() {
  const progressMap = useAllProgress()

  const byCategory = tracks.reduce<Record<string, typeof tracks>>((acc, track) => {
    const key = track.category
    acc[key] = [...(acc[key] ?? []), track]
    return acc
  }, {})

  return (
    <Page className="py-10">
      <header className="max-w-2xl mb-10">
        <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-ink">
          Tracks
        </h1>
        <p className="mt-3 text-ink-muted leading-relaxed">
          {totals.lessons} lessons across {totals.tracks} tracks. Each track is a sequence,
          not a list — the order is the teaching. Start anywhere, but the prerequisites are
          there for a reason.
        </p>
      </header>

      <div className="space-y-10">
        {Object.entries(byCategory).map(([category, group]) => (
          <section key={category}>
            <h2 className="text-xs font-bold uppercase tracking-wide text-ink-muted mb-4">
              {category}
            </h2>
            <div className="space-y-4">
              {group.map((track) => {
                const lessons = track.modules.flatMap((m) => m.lessons)
                const done = lessons.filter((l) => progressMap.get(l.id)?.completed).length

                return (
                  <Card key={track.slug} className="overflow-hidden">
                    <div className="p-5 sm:p-6">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0">
                          <h3 className="text-lg font-semibold text-ink">
                            <Link to={`/learn/${track.slug}`} className="hover:text-accent">
                              {track.title}
                            </Link>
                          </h3>
                          <p className="text-sm text-ink-muted mt-0.5">{track.tagline}</p>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <LevelBadge level={track.difficulty} />
                          <Badge>{track.lessonCount} lessons</Badge>
                          <Badge>{Math.round(track.minutes / 60)}h</Badge>
                        </div>
                      </div>

                      {track.prerequisites.length > 0 && (
                        <p className="mt-3 text-xs text-ink-faint">
                          Builds on:{' '}
                          {track.prerequisites.map((slug, i) => (
                            <span key={slug}>
                              {i > 0 && ', '}
                              <Link to={`/learn/${slug}`} className="text-accent hover:underline">
                                {tracks.find((t) => t.slug === slug)?.title ?? slug}
                              </Link>
                            </span>
                          ))}
                        </p>
                      )}

                      <p className="mt-3 text-sm text-ink-muted leading-relaxed max-w-3xl">
                        {track.description.split('\n\n')[0]}
                      </p>

                      {done > 0 && (
                        <div className="mt-4 max-w-xs">
                          <ProgressBar
                            value={done / Math.max(1, lessons.length)}
                            label={`${done} of ${lessons.length} completed`}
                          />
                        </div>
                      )}
                    </div>

                    {/* Modules and lessons, so the shape of the track is visible
                        without a second click. */}
                    <div className="border-t border-border divide-y divide-border">
                      {track.modules.map((module) => (
                        <div key={module.slug} className="px-5 sm:px-6 py-4">
                          <div className="flex items-baseline justify-between gap-3 mb-2">
                            <h4 className="text-sm font-medium text-ink">{module.title}</h4>
                            <LevelBadge level={module.level} />
                          </div>
                          {module.summary && (
                            <p className="text-xs text-ink-muted mb-3 leading-relaxed max-w-2xl">
                              {module.summary}
                            </p>
                          )}
                          <ol className="space-y-0.5">
                            {module.lessons.map((lesson) => {
                              const lp = progressMap.get(lesson.id)
                              return (
                                <li key={lesson.id}>
                                  <Link
                                    to={lesson.route}
                                    className="group flex items-center gap-2.5 py-1.5 px-2 -mx-2 rounded-lg hover:bg-surface transition-colors"
                                  >
                                    <span
                                      className={cx(
                                        'shrink-0 w-4 h-4 rounded-full border flex items-center justify-center text-[0.5625rem] font-bold',
                                        lp?.completed
                                          ? 'border-positive bg-positive-soft text-positive'
                                          : lp?.read
                                            ? 'border-accent text-accent'
                                            : 'border-border text-transparent',
                                      )}
                                      aria-hidden="true"
                                    >
                                      {lp?.completed ? '✓' : lp?.read ? '·' : ''}
                                    </span>
                                    <span className="text-sm text-ink-muted group-hover:text-ink min-w-0 flex-1 truncate">
                                      {lesson.title}
                                    </span>
                                    <span className="flex items-center gap-1 shrink-0">
                                      {lesson.hasExercise && (
                                        <span
                                          className="text-[0.625rem] text-accent"
                                          title="Has a runnable exercise"
                                        >
                                          ▸
                                        </span>
                                      )}
                                      {lesson.hasPlayground && (
                                        <span
                                          className="text-[0.625rem] text-accent"
                                          title="Has an interactive playground"
                                        >
                                          ⌁
                                        </span>
                                      )}
                                      <span className="text-[0.6875rem] text-ink-faint tabular-nums w-10 text-right">
                                        {lesson.minutes}m
                                      </span>
                                    </span>
                                  </Link>
                                </li>
                              )
                            })}
                          </ol>
                        </div>
                      ))}
                    </div>
                  </Card>
                )
              })}
            </div>
          </section>
        ))}
      </div>

      <Card className="mt-12 p-6">
        <h2 className="font-semibold text-ink">A track you want is missing</h2>
        <p className="mt-2 text-sm text-ink-muted leading-relaxed max-w-2xl">
          Probably. The curriculum this is aiming at is much larger than what exists —
          see <Link to="/contribute" className="text-accent underline">Contribute</Link>{' '}
          for the planned shape and how to add a lesson. A lesson is one Markdown file; you
          do not need to understand the application to write one.
        </p>
      </Card>
    </Page>
  )
}
