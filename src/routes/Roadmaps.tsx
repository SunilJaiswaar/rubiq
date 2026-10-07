import { Link, useParams } from 'react-router-dom'
import { useEffect, useMemo, useState } from 'react'
import { roadmaps, tracks } from '@/content/catalog'
import { useAllProgress, useProgressContext } from '@/hooks/useProgress'
import { computeGaps, recommend, weeklyPlan } from '@/engines/roadmap'
import type { ConceptStat } from '@/engines/progress'
import {
  Page, Card, Badge, ButtonLink, SkillMeter, cx, EmptyState,
} from '@/ui/primitives'

export default function Roadmaps() {
  const { id } = useParams()
  const roadmap = id ? roadmaps.find((r) => r.id === id) : null

  if (id && !roadmap) {
    return (
      <Page width="narrow" className="py-16">
        <EmptyState title="No such roadmap">
          <p>
            That roadmap does not exist. <Link to="/roadmaps" className="text-accent underline">See all roadmaps</Link>.
          </p>
        </EmptyState>
      </Page>
    )
  }

  return roadmap ? <RoadmapDetail roadmapId={roadmap.id} /> : <RoadmapList />
}

function RoadmapList() {
  return (
    <Page className="py-10">
      <header className="max-w-2xl mb-8">
        <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-ink">
          Roadmaps
        </h1>
        <p className="mt-3 text-ink-muted leading-relaxed">
          A roadmap is an <em>order</em>, not a reading list. Each one names the tracks in
          the sequence that pays off fastest for a particular destination, and says why
          that order and not another.
        </p>
      </header>

      <div className="space-y-4">
        {roadmaps.map((roadmap) => (
          <Card key={roadmap.id} className="p-5 sm:p-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 className="text-lg font-semibold text-ink">
                  <Link to={`/roadmaps/${roadmap.id}`} className="hover:text-accent">
                    {roadmap.title}
                  </Link>
                </h2>
                <p className="text-sm text-ink-muted mt-0.5">Target role: {roadmap.role}</p>
              </div>
              <Badge tone="accent">
                {roadmap.experience === 'none' ? 'from scratch' : roadmap.experience}
              </Badge>
            </div>

            <p className="mt-3 text-sm text-ink-muted leading-relaxed max-w-3xl">
              {roadmap.summary}
            </p>

            <ol className="mt-5 flex flex-wrap items-center gap-2">
              {roadmap.stages.map((stage, i) => (
                <li key={stage.title} className="flex items-center gap-2">
                  {i > 0 && <span className="text-ink-faint" aria-hidden="true">→</span>}
                  <span className="text-xs px-2.5 py-1 rounded-lg border border-border bg-surface text-ink-muted">
                    {stage.title}
                  </span>
                </li>
              ))}
            </ol>

            <ButtonLink to={`/roadmaps/${roadmap.id}`} size="sm" className="mt-5">
              Open this roadmap
            </ButtonLink>
          </Card>
        ))}
      </div>
    </Page>
  )
}

function RoadmapDetail({ roadmapId }: { roadmapId: string }) {
  const roadmap = roadmaps.find((r) => r.id === roadmapId)
  const progressMap = useAllProgress()
  const { progress, revision } = useProgressContext()
  const [stats, setStats] = useState<ConceptStat[]>([])

  useEffect(() => {
    if (!progress) return
    void progress.conceptStats().then(setStats)
  }, [progress, revision])

  const gaps = useMemo(() => computeGaps(tracks, progressMap, stats, null), [progressMap, stats])
  const gapByTrack = useMemo(() => new Map(gaps.map((g) => [g.track, g])), [gaps])
  const recs = useMemo(
    () => recommend(gaps, tracks, roadmap ?? null, 4),
    [gaps, roadmap],
  )
  const plan = useMemo(
    () => weeklyPlan(tracks, recs, progressMap, 30),
    [recs, progressMap],
  )

  if (!roadmap) return null

  return (
    <Page className="py-10">
      <nav aria-label="Breadcrumb" className="text-xs text-ink-muted mb-3">
        <Link to="/roadmaps" className="hover:text-ink">Roadmaps</Link>
      </nav>

      <header className="max-w-3xl">
        <Badge tone="accent">
          {roadmap.experience === 'none' ? 'from scratch' : roadmap.experience}
        </Badge>
        <h1 className="mt-3 text-2xl sm:text-3xl font-semibold tracking-tight text-ink">
          {roadmap.title}
        </h1>
        <p className="mt-3 text-ink-muted leading-relaxed">{roadmap.summary}</p>
      </header>

      {/* ------------------------------------------------------- gap chart */}
      <section className="mt-10">
        <h2 className="text-lg font-semibold mb-1 text-ink">Where you are</h2>
        <p className="text-sm text-ink-muted mb-4 max-w-2xl leading-relaxed">
          These bars come from what you have actually completed and how you scored — not
          from a self-assessment. Tracks you have not touched read zero, which is accurate
          rather than discouraging.
        </p>
        <Card className="divide-y divide-border">
          {roadmap.stages.flatMap((stage) => stage.tracks).map((slug) => {
            const gap = gapByTrack.get(slug)
            const track = tracks.find((t) => t.slug === slug)
            if (!gap || !track) return null
            return (
              <div key={slug} className="px-4 py-3 flex items-center gap-4">
                <Link
                  to={`/learn/${slug}`}
                  className="text-sm font-medium w-40 shrink-0 truncate hover:text-accent text-ink"
                >
                  {track.title}
                </Link>
                <SkillMeter value={gap.mastery} estimated={gap.estimated} />
                <span className="text-xs text-ink-muted flex-1 min-w-0">
                  {gap.lessonsCompleted}/{gap.lessonsTotal} lessons
                  {gap.accuracy !== null && (
                    <> · {Math.round(gap.accuracy * 100)}% quiz accuracy</>
                  )}
                  {gap.estimated && <span className="text-ink-faint"> · no data yet</span>}
                </span>
                {!gap.prerequisitesMet && <Badge tone="caution">blocked</Badge>}
              </div>
            )
          })}
        </Card>
      </section>

      {/* ---------------------------------------------------------- stages */}
      <section className="mt-10">
        <h2 className="text-lg font-semibold mb-4 text-ink">The path</h2>
        <ol className="space-y-4">
          {roadmap.stages.map((stage, i) => {
            const stageTracks = stage.tracks
              .map((slug) => tracks.find((t) => t.slug === slug))
              .filter((t): t is NonNullable<typeof t> => Boolean(t))
            const stageDone = stageTracks.every(
              (t) => (gapByTrack.get(t.slug)?.mastery ?? 0) >= 0.8,
            )

            return (
              <li key={stage.title}>
                <Card className={cx('p-5', stageDone && 'border-positive/40')}>
                  <div className="flex items-start gap-4">
                    <span
                      className={cx(
                        'shrink-0 w-7 h-7 rounded-full border flex items-center justify-center text-xs font-bold',
                        stageDone
                          ? 'border-positive bg-positive-soft text-positive'
                          : 'border-border text-ink-muted',
                      )}
                      aria-hidden="true"
                    >
                      {stageDone ? '✓' : i + 1}
                    </span>
                    <div className="min-w-0 flex-1">
                      <h3 className="font-semibold text-ink">{stage.title}</h3>
                      <p className="mt-1 text-sm text-ink-muted leading-relaxed">{stage.goal}</p>

                      <div className="mt-3 flex flex-wrap gap-2">
                        {stageTracks.map((track) => (
                          <Link
                            key={track.slug}
                            to={`/learn/${track.slug}`}
                            className="text-sm px-3 py-1.5 rounded-lg border border-border bg-surface hover:border-accent hover:text-accent transition-colors text-ink-muted"
                          >
                            {track.title}
                            <span className="text-ink-faint ml-1.5 text-xs">
                              {track.lessonCount}
                            </span>
                          </Link>
                        ))}
                      </div>

                      {stage.skills && stage.skills.length > 0 && (
                        <p className="mt-3 text-xs text-ink-faint">
                          Covers: {stage.skills.join(' · ')}
                        </p>
                      )}

                      {stage.milestone && (
                        <div className="mt-3 pt-3 border-t border-border">
                          <p className="text-xs font-bold uppercase tracking-wide text-ink-muted mb-1">
                            You are done when
                          </p>
                          <p className="text-sm text-ink">{stage.milestone}</p>
                        </div>
                      )}
                    </div>
                  </div>
                </Card>
              </li>
            )
          })}
        </ol>
      </section>

      {/* ----------------------------------------------------- weekly plan */}
      {plan.length > 0 && (
        <section className="mt-10">
          <h2 className="text-lg font-semibold mb-1 text-ink">A week of this</h2>
          <p className="text-sm text-ink-muted mb-4 max-w-2xl leading-relaxed">
            Assuming about 30 minutes a day, with 20% headroom — because a plan you beat is
            motivating and a plan you miss is not. These are the next unfinished lessons in
            roadmap order.
          </p>
          <Card className="divide-y divide-border">
            {plan.map((item) => (
              <Link
                key={item.lessonId}
                to={item.route}
                className="flex items-center gap-3 px-4 py-2.5 hover:bg-surface transition-colors"
              >
                <span className="text-xs text-ink-faint w-20 shrink-0 truncate">
                  {item.track}
                </span>
                <span className="text-sm text-ink flex-1 min-w-0 truncate">{item.title}</span>
                <span className="text-xs text-ink-faint tabular-nums shrink-0">
                  {item.minutes}m
                </span>
              </Link>
            ))}
            <div className="px-4 py-2 text-xs text-ink-faint">
              {plan.reduce((n, p) => n + p.minutes, 0)} minutes total
            </div>
          </Card>
        </section>
      )}

      {/* ---------------------------------------------------- what's next */}
      {recs.length > 0 && (
        <section className="mt-10">
          <h2 className="text-lg font-semibold mb-4 text-ink">Right now, do this</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {recs.map((rec) => (
              <Card key={rec.track} className={cx('p-4', rec.blocked && 'opacity-60')}>
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
        </section>
      )}
    </Page>
  )
}
