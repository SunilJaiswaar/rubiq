import { Link } from 'react-router-dom'
import { tracks, totals, roadmaps } from '@/content/catalog'
import { useAllProgress, useProgressContext } from '@/hooks/useProgress'
import { useEffect, useMemo, useState } from 'react'
import { computeGaps, recommend } from '@/engines/roadmap'
import type { ConceptStat } from '@/engines/progress'
import {
  Page, Card, ButtonLink, Badge, LevelBadge, ProgressBar, SectionHeading, cx,
} from '@/ui/primitives'

export default function Home() {
  const progressMap = useAllProgress()
  const { progress, revision } = useProgressContext()
  const [stats, setStats] = useState<ConceptStat[]>([])

  useEffect(() => {
    if (!progress) return
    void progress.conceptStats().then(setStats)
  }, [progress, revision])

  const started = progressMap.size > 0
  const completed = [...progressMap.values()].filter((p) => p.completed).length

  const nextUp = useMemo(() => {
    const gaps = computeGaps(tracks, progressMap, stats, null)
    return recommend(gaps, tracks, null, 3)
  }, [progressMap, stats])

  const inProgress = useMemo(
    () =>
      tracks
        .map((track) => {
          const lessons = track.modules.flatMap((m) => m.lessons)
          const done = lessons.filter((l) => progressMap.get(l.id)?.completed).length
          const next = lessons.find((l) => !progressMap.get(l.id)?.completed)
          return { track, done, total: lessons.length, next }
        })
        .filter((t) => t.done > 0 && t.done < t.total),
    [progressMap],
  )

  return (
    <>
      {/* ------------------------------------------------------------ hero */}
      <Page className="pt-16 pb-14 sm:pt-24 sm:pb-20">
        <div className="max-w-3xl">
          <h1 className="text-[2rem] sm:text-5xl font-semibold tracking-tight leading-[1.1] text-ink">
            Become the software engineer
            <br className="hidden sm:block" />
            you always wanted to be.
          </h1>
          <p className="mt-6 text-lg text-ink-muted leading-relaxed max-w-2xl">
            One structured place for programming, databases, computer science and real
            engineering judgement. Every lesson starts from the problem the thing was
            invented to solve — so you understand it rather than memorise it.
          </p>

          <div className="mt-8 flex flex-wrap gap-3">
            <ButtonLink
              to={started ? (inProgress[0]?.next?.route ?? '/learn') : '/learn/ruby/everything-is-an-object'}
              variant="primary"
              size="lg"
            >
              {started ? 'Continue learning' : 'Start learning'}
            </ButtonLink>
            <ButtonLink to="/roadmaps" size="lg">Explore roadmaps</ButtonLink>
          </div>

          <dl className="mt-10 flex flex-wrap gap-x-8 gap-y-3 text-sm">
            {[
              [totals.lessons, 'lessons'],
              [totals.quizzes, 'quizzes'],
              [totals.exercises, 'runnable exercises'],
              [totals.interviewQuestions, 'interview questions'],
              [`${Math.round(totals.minutes / 60)}h`, 'of reading'],
            ].map(([value, label]) => (
              <div key={String(label)} className="flex items-baseline gap-1.5">
                <dt className="sr-only">{label}</dt>
                <dd className="font-semibold tabular-nums text-ink">{value}</dd>
                <dd className="text-ink-muted">{label}</dd>
              </div>
            ))}
          </dl>

          <p className="mt-6 text-xs text-ink-faint max-w-xl leading-relaxed">
            Free, open source, and no account. Your progress is stored in your browser and
            you can export it whenever you like.
          </p>
        </div>
      </Page>

      {/* ----------------------------------------------------- continue */}
      {inProgress.length > 0 && (
        <Page className="pb-14">
          <SectionHeading
            title="Pick up where you left off"
            subtitle={`${completed} lesson${completed === 1 ? '' : 's'} completed so far`}
          />
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {inProgress.map(({ track, done, total, next }) => (
              <Card key={track.slug} className="p-4">
                <div className="flex items-center justify-between gap-2 mb-3">
                  <Link
                    to={`/learn/${track.slug}`}
                    className="font-medium text-sm hover:text-accent text-ink"
                  >
                    {track.title}
                  </Link>
                  <span className="text-xs text-ink-faint tabular-nums">
                    {done}/{total}
                  </span>
                </div>
                <ProgressBar value={done / total} showValue={false} />
                {next && (
                  <Link
                    to={next.route}
                    className="mt-3 block text-sm text-ink-muted hover:text-accent"
                  >
                    Next: {next.title} →
                  </Link>
                )}
              </Card>
            ))}
          </div>
        </Page>
      )}

      {/* ------------------------------------------------- what to learn */}
      {!started && (
        <Page className="pb-14">
          <SectionHeading
            title="Not sure where to start?"
            subtitle="Pick a destination and the platform orders the work for you"
          />
          <div className="grid gap-3 sm:grid-cols-3">
            {roadmaps.map((roadmap) => (
              <Card key={roadmap.id} className="p-5 flex flex-col">
                <Badge tone="accent">{roadmap.experience === 'none' ? 'From scratch' : roadmap.experience}</Badge>
                <h3 className="mt-3 font-semibold text-ink">{roadmap.title}</h3>
                <p className="mt-2 text-sm text-ink-muted leading-relaxed flex-1">
                  {roadmap.summary.split('.').slice(0, 2).join('.')}.
                </p>
                <Link
                  to={`/roadmaps/${roadmap.id}`}
                  className="mt-4 text-sm text-accent hover:underline"
                >
                  See the path →
                </Link>
              </Card>
            ))}
          </div>
        </Page>
      )}

      {started && nextUp.length > 0 && (
        <Page className="pb-14">
          <SectionHeading
            title="What to learn next"
            subtitle="Based on what you have actually finished and scored"
            action={
              <Link to="/progress" className="text-sm text-accent hover:underline">
                See your full picture →
              </Link>
            }
          />
          <div className="grid gap-3 sm:grid-cols-3">
            {nextUp.map((rec) => (
              <Card
                key={rec.track}
                className={cx('p-4', rec.blocked && 'opacity-70')}
              >
                <div className="flex items-start justify-between gap-2">
                  <h3 className="font-medium text-sm text-ink">{rec.title}</h3>
                  {rec.blocked && <Badge tone="caution">blocked</Badge>}
                </div>
                <p className="mt-1.5 text-xs text-ink-muted leading-relaxed">{rec.reason}</p>
                {!rec.blocked && (
                  <Link
                    to={`/learn/${rec.track}`}
                    className="mt-3 inline-block text-sm text-accent hover:underline"
                  >
                    Open →
                  </Link>
                )}
              </Card>
            ))}
          </div>
        </Page>
      )}

      {/* ---------------------------------------------------------- tracks */}
      <Page className="pb-16">
        <SectionHeading
          title="Tracks"
          subtitle="Every one teaches the why before the how"
          action={<Link to="/learn" className="text-sm text-accent hover:underline">All tracks →</Link>}
        />
        <div className="grid gap-4 md:grid-cols-3">
          {tracks.map((track) => {
            const lessons = track.modules.flatMap((m) => m.lessons)
            const done = lessons.filter((l) => progressMap.get(l.id)?.completed).length
            return (
              <Card key={track.slug} className="p-5 flex flex-col">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="font-semibold text-ink">
                    <Link to={`/learn/${track.slug}`} className="hover:text-accent">
                      {track.title}
                    </Link>
                  </h3>
                  <LevelBadge level={track.difficulty} />
                </div>
                <p className="mt-1.5 text-sm text-ink-muted">{track.tagline}</p>

                <ul className="mt-4 space-y-1.5 flex-1">
                  {track.outcomes.slice(0, 3).map((outcome) => (
                    <li key={outcome} className="text-xs text-ink-muted flex gap-2">
                      <span className="text-accent shrink-0" aria-hidden="true">✓</span>
                      <span>{outcome}</span>
                    </li>
                  ))}
                </ul>

                <div className="mt-4 pt-3 border-t border-border flex items-center justify-between text-xs text-ink-faint">
                  <span>{track.lessonCount} lessons · {Math.round(track.minutes / 60)}h</span>
                  {done > 0 && <span className="text-positive">{done} done</span>}
                </div>
              </Card>
            )
          })}
        </div>
      </Page>

      {/* ----------------------------------------------------- how it works */}
      <Page className="pb-20">
        <SectionHeading
          title="How this is different"
          subtitle="Four things most tutorials skip"
        />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[
            {
              title: 'The problem comes first',
              body: 'Redis does not start with "an in-memory key-value store". It starts with why re-running the same expensive query is wasteful. Switch on WHY mode in any lesson to read only that thread.',
            },
            {
              title: 'You see it happen',
              body: 'Run a query against 100,000 rows, watch it examine all of them, toggle an index, run it again. The number changes in front of you.',
            },
            {
              title: 'Failure is taught on purpose',
              body: 'What breaks when Redis dies, when the connection pool drains, when the index is on the wrong column. Engineers are made by the second question, not the first.',
            },
            {
              title: 'Nothing is reviewed once',
              body: 'Quizzes feed a spaced-repetition queue keyed on concepts, not cards — so you get asked a different question about the same idea days later.',
            },
          ].map((item) => (
            <div key={item.title}>
              <h3 className="font-medium text-sm text-ink">{item.title}</h3>
              <p className="mt-2 text-sm text-ink-muted leading-relaxed">{item.body}</p>
            </div>
          ))}
        </div>
      </Page>
    </>
  )
}
