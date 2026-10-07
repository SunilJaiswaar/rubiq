import { Link, useParams } from 'react-router-dom'
import { getTrack, tracks } from '@/content/catalog'
import { useAllProgress } from '@/hooks/useProgress'
import { NotFoundBody } from '@/features/RouteError'
import {
  Page, Card, Badge, ButtonLink, LevelBadge, ProgressBar, cx,
} from '@/ui/primitives'

export default function Track() {
  const { track: slug = '' } = useParams()
  const track = getTrack(slug)
  const progressMap = useAllProgress()

  if (!track) return <NotFoundBody />

  const lessons = track.modules.flatMap((m) => m.lessons)
  const done = lessons.filter((l) => progressMap.get(l.id)?.completed).length
  const next = lessons.find((l) => !progressMap.get(l.id)?.completed) ?? lessons[0]
  const paragraphs = track.description.split('\n\n').filter(Boolean)

  return (
    <Page className="py-10">
      <nav aria-label="Breadcrumb" className="text-xs text-ink-muted mb-3">
        <Link to="/learn" className="hover:text-ink">Tracks</Link>
      </nav>

      <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_18rem] lg:gap-10">
        <div className="min-w-0">
          <header>
            <div className="flex flex-wrap items-center gap-2 mb-3">
              <LevelBadge level={track.difficulty} />
              <Badge>{track.category}</Badge>
              <Badge>{track.lessonCount} lessons</Badge>
              <Badge>{Math.round(track.minutes / 60)} hours</Badge>
            </div>
            <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-ink">
              {track.title}
            </h1>
            <p className="mt-2 text-lg text-ink-muted">{track.tagline}</p>
          </header>

          <div className="mt-6 space-y-4 max-w-2xl">
            {paragraphs.map((paragraph, i) => (
              <p key={i} className="text-ink-muted leading-relaxed">{paragraph}</p>
            ))}
          </div>

          {track.outcomes.length > 0 && (
            <section className="mt-8">
              <h2 className="text-xs font-bold uppercase tracking-wide text-ink-muted mb-3">
                By the end you will be able to
              </h2>
              <ul className="space-y-2 max-w-2xl">
                {track.outcomes.map((outcome) => (
                  <li key={outcome} className="flex gap-2.5 text-sm text-ink">
                    <span className="text-accent shrink-0 mt-0.5" aria-hidden="true">✓</span>
                    <span>{outcome}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section className="mt-10">
            <h2 className="text-lg font-semibold mb-4 text-ink">The sequence</h2>
            <ol className="space-y-6">
              {track.modules.map((module, moduleIndex) => (
                <li key={module.slug}>
                  <div className="flex items-baseline gap-3 mb-2">
                    <span className="text-xs font-mono text-ink-faint tabular-nums">
                      {String(moduleIndex + 1).padStart(2, '0')}
                    </span>
                    <h3 className="font-medium text-ink">{module.title}</h3>
                    <LevelBadge level={module.level} />
                  </div>
                  {module.summary && (
                    <p className="ml-9 text-sm text-ink-muted mb-3 leading-relaxed max-w-2xl">
                      {module.summary}
                    </p>
                  )}
                  <ol className="ml-9 space-y-1.5">
                    {module.lessons.map((lesson) => {
                      const lp = progressMap.get(lesson.id)
                      return (
                        <li key={lesson.id}>
                          <Link
                            to={lesson.route}
                            className="group flex items-start gap-3 p-3 -mx-3 rounded-xl hover:bg-surface transition-colors"
                          >
                            <span
                              className={cx(
                                'shrink-0 mt-0.5 w-5 h-5 rounded-full border flex items-center justify-center text-[0.625rem] font-bold',
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
                            <span className="min-w-0 flex-1">
                              <span className="block text-sm font-medium text-ink group-hover:text-accent">
                                {lesson.title}
                              </span>
                              {lesson.summary && (
                                <span className="block text-xs text-ink-muted mt-0.5 leading-relaxed">
                                  {lesson.summary}
                                </span>
                              )}
                              <span className="flex flex-wrap items-center gap-1.5 mt-1.5">
                                <span className="text-[0.6875rem] text-ink-faint">
                                  {lesson.minutes} min
                                </span>
                                {lesson.hasQuiz && <Badge>quiz</Badge>}
                                {lesson.hasExercise && <Badge tone="accent">exercise</Badge>}
                                {lesson.hasPlayground && <Badge tone="accent">playground</Badge>}
                                {lesson.interviewCount > 0 && (
                                  <Badge>{lesson.interviewCount} interview Q</Badge>
                                )}
                              </span>
                            </span>
                          </Link>
                        </li>
                      )
                    })}
                  </ol>
                </li>
              ))}
            </ol>
          </section>
        </div>

        <aside className="mt-10 lg:mt-0">
          <div className="lg:sticky lg:top-20 space-y-4">
            <Card className="p-5">
              {done > 0 ? (
                <>
                  <ProgressBar
                    value={done / Math.max(1, lessons.length)}
                    label={`${done} of ${lessons.length} completed`}
                  />
                  <ButtonLink
                    to={next?.route ?? '#'}
                    variant="primary"
                    className="w-full mt-4"
                  >
                    Continue
                  </ButtonLink>
                </>
              ) : (
                <>
                  <p className="text-sm text-ink-muted mb-3">
                    {lessons.length} lessons, about {Math.round(track.minutes / 60)} hours
                    of reading plus the exercises.
                  </p>
                  <ButtonLink
                    to={lessons[0]?.route ?? '#'}
                    variant="primary"
                    className="w-full"
                  >
                    Start the first lesson
                  </ButtonLink>
                </>
              )}
              {next && (
                <p className="mt-3 text-xs text-ink-faint">
                  Up next: {next.title}
                </p>
              )}
            </Card>

            {track.prerequisites.length > 0 && (
              <Card className="p-5">
                <h2 className="text-xs font-bold uppercase tracking-wide text-ink-muted mb-2">
                  Builds on
                </h2>
                <ul className="space-y-1.5">
                  {track.prerequisites.map((prereq) => {
                    const prereqTrack = tracks.find((t) => t.slug === prereq)
                    return (
                      <li key={prereq} className="text-sm">
                        <Link to={`/learn/${prereq}`} className="text-accent hover:underline">
                          {prereqTrack?.title ?? prereq}
                        </Link>
                      </li>
                    )
                  })}
                </ul>
                <p className="mt-2.5 text-xs text-ink-faint leading-relaxed">
                  Not enforced — you can start here. But the lessons assume these ideas.
                </p>
              </Card>
            )}

            <Card className="p-5">
              <h2 className="text-xs font-bold uppercase tracking-wide text-ink-muted mb-2">
                Concepts in this track
              </h2>
              <div className="flex flex-wrap gap-1">
                {[...new Set(lessons.flatMap((l) => l.concepts))].map((concept) => (
                  <Link
                    key={concept}
                    to={`/graph?concept=${encodeURIComponent(concept)}`}
                    className="text-[0.6875rem] font-mono px-1.5 py-0.5 rounded border border-border text-ink-muted hover:border-accent hover:text-accent transition-colors"
                  >
                    {concept}
                  </Link>
                ))}
              </div>
            </Card>
          </div>
        </aside>
      </div>
    </Page>
  )
}
