/**
 * The spaced-repetition queue.
 *
 * Items are *concepts*, not cards, so a review pulls a different question about the same
 * idea each time — retrieval practice rather than memorising one card's answer. The
 * question shown is picked from the quizzes of the lessons that teach that concept.
 */
import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { allLessons, loadLesson } from '@/content/catalog'
import type { Question } from '@/content/types'
import { useProgressContext } from '@/hooks/useProgress'
import type { ReviewItem, Grade } from '@/engines/srs'
import { Page, Card, Badge, Button, Spinner, EmptyState, ProgressBar, cx } from '@/ui/primitives'

export default function Review() {
  const { srs, progress, invalidate, revision } = useProgressContext()
  const [due, setDue] = useState<ReviewItem[] | null>(null)
  const [forecast, setForecast] = useState<Array<{ day: string; count: number }>>([])
  const [health, setHealth] = useState<{ tracked: number; mature: number; struggling: number } | null>(null)
  const [index, setIndex] = useState(0)
  const [question, setQuestion] = useState<{ question: Question; lessonRoute: string; lessonTitle: string } | null>(null)
  const [revealed, setRevealed] = useState(false)
  const [reviewedCount, setReviewedCount] = useState(0)

  useEffect(() => {
    if (!srs) return
    void srs.due().then(setDue)
    void srs.forecast(14).then(setForecast)
    void srs.health().then(setHealth)
  }, [srs, revision])

  const current = due?.[index]

  // Pick a question about this concept from a lesson that teaches it.
  useEffect(() => {
    if (!current) { setQuestion(null); return }
    let cancelled = false
    setRevealed(false)
    void (async () => {
      const candidates = allLessons.filter((l) => l.concepts.includes(current.concept))
      for (const stub of candidates) {
        const lesson = await loadLesson(stub.id)
        const matching = lesson?.quiz?.questions.filter((q) => q.concept === current.concept)
        if (matching && matching.length > 0) {
          // Rotate through available questions using the review count, so a concept
          // reviewed four times is asked four different ways where possible.
          const picked = matching[current.streak % matching.length]
          if (!cancelled && picked) {
            setQuestion({ question: picked, lessonRoute: stub.route, lessonTitle: stub.title })
            return
          }
        }
      }
      if (!cancelled) setQuestion(null)
    })()
    return () => { cancelled = true }
  }, [current])

  const grade = useCallback(async (value: Grade) => {
    if (!srs || !current) return
    await srs.review(current.concept, value)
    if (progress) {
      await progress.recordConcept(current.concept, value === 'good' || value === 'easy')
      await progress.touchStreak()
    }
    setReviewedCount((n) => n + 1)
    setRevealed(false)
    setIndex((i) => i + 1)
    invalidate()
  }, [srs, current, progress, invalidate])

  if (!due) {
    return (
      <Page className="py-20 flex justify-center">
        <Spinner label="Loading your review queue" />
      </Page>
    )
  }

  const finished = index >= due.length

  return (
    <Page width="narrow" className="py-10">
      <header className="mb-6">
        <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-ink">Review</h1>
        <p className="mt-3 text-ink-muted leading-relaxed">
          Concepts come back just as you are about to forget them. The queue fills itself as
          you study — meeting a concept in a lesson schedules it, and a quiz you get wrong
          brings it back sooner.
        </p>
      </header>

      {health && health.tracked > 0 && (
        <div className="grid grid-cols-3 gap-3 mb-6">
          <Stat label="Tracked" value={health.tracked} />
          <Stat label="Holding" value={health.mature} hint="21+ day interval" tone="positive" />
          <Stat label="Shaky" value={health.struggling} hint="lapsed twice" tone="caution" />
        </div>
      )}

      {due.length === 0 ? (
        <Card className="p-8">
          <EmptyState title={health?.tracked ? 'Nothing due today' : 'Nothing scheduled yet'}>
            {health?.tracked ? (
              <p>
                You are up to date. {forecast.find((f) => f.count > 0)
                  ? `Next up: ${forecast.find((f) => f.count > 0)?.count} concept(s) on ${forecast.find((f) => f.count > 0)?.day}.`
                  : 'Nothing is scheduled in the next fortnight.'}
              </p>
            ) : (
              <p>
                Read a lesson and its concepts get added here automatically. Start with{' '}
                <Link to="/learn" className="text-accent underline">any track</Link>.
              </p>
            )}
          </EmptyState>
        </Card>
      ) : finished ? (
        <Card className="p-8">
          <EmptyState title={`Done — ${reviewedCount} concept${reviewedCount === 1 ? '' : 's'} reviewed`}>
            <p>
              That is the whole queue for today. Each one you graded has been pushed out to
              a new interval based on how it went.
            </p>
          </EmptyState>
        </Card>
      ) : (
        <>
          <ProgressBar
            value={index / due.length}
            label={`${index} of ${due.length} reviewed`}
          />

          {current && (
            <Card className="mt-4 p-5">
              <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
                <code className="text-sm font-mono font-semibold text-accent">
                  {current.concept}
                </code>
                <div className="flex items-center gap-1.5">
                  {current.lapses > 0 && <Badge tone="caution">{current.lapses} lapses</Badge>}
                  <Badge>
                    {current.interval === 0 ? 'new' : `${current.interval}d interval`}
                  </Badge>
                </div>
              </div>

              {question ? (
                <>
                  <p className="text-[0.9375rem] leading-relaxed text-ink whitespace-pre-wrap">
                    {question.question.prompt}
                  </p>

                  {!revealed ? (
                    <>
                      <p className="mt-4 text-xs text-ink-faint">
                        Answer it in your head first — out loud is better. Then reveal.
                      </p>
                      <Button
                        variant="primary"
                        className="mt-3"
                        onClick={() => setRevealed(true)}
                      >
                        Reveal the answer
                      </Button>
                    </>
                  ) : (
                    <>
                      <div className="mt-4 rounded-lg border border-border bg-surface p-4">
                        <AnswerView question={question.question} />
                        {question.question.explanation && (
                          <p className="mt-3 pt-3 border-t border-border text-sm text-ink-muted leading-relaxed">
                            {question.question.explanation}
                          </p>
                        )}
                      </div>
                      <Link
                        to={question.lessonRoute}
                        className="mt-3 inline-block text-xs text-accent hover:underline"
                      >
                        Re-read &ldquo;{question.lessonTitle}&rdquo; →
                      </Link>
                    </>
                  )}
                </>
              ) : (
                <>
                  <p className="text-[0.9375rem] text-ink">
                    Explain <strong>{current.concept}</strong> in your own words.
                  </p>
                  <p className="mt-2 text-xs text-ink-faint">
                    No quiz question is tagged with this concept yet, so this is a plain
                    recall prompt. Say it out loud, then grade yourself honestly.
                  </p>
                  {current.lessonIds[0] && (
                    <Link
                      to={allLessons.find((l) => l.id === current.lessonIds[0])?.route ?? '/learn'}
                      className="mt-3 inline-block text-xs text-accent hover:underline"
                    >
                      Re-read the lesson →
                    </Link>
                  )}
                  {!revealed && (
                    <Button variant="primary" className="mt-3" onClick={() => setRevealed(true)}>
                      I have answered
                    </Button>
                  )}
                </>
              )}

              {revealed && (
                <fieldset className="mt-5 pt-5 border-t border-border">
                  <legend className="text-xs font-bold uppercase tracking-wide text-ink-muted mb-2.5">
                    How did that go?
                  </legend>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {([
                      ['again', 'Forgot', 'Comes back very soon'],
                      ['hard', 'Struggled', 'Comes back soon'],
                      ['good', 'Got it', 'Normal interval'],
                      ['easy', 'Easy', 'Longer interval'],
                    ] as const).map(([value, label, hint]) => (
                      <button
                        key={value}
                        type="button"
                        onClick={() => void grade(value)}
                        className={cx(
                          'px-3 py-2 rounded-lg border text-left transition-colors',
                          value === 'again' && 'border-danger/40 hover:bg-danger-soft',
                          value === 'hard' && 'border-caution/40 hover:bg-caution-soft',
                          value === 'good' && 'border-accent/40 hover:bg-accent-soft',
                          value === 'easy' && 'border-positive/40 hover:bg-positive-soft',
                        )}
                      >
                        <span className="block text-sm font-medium text-ink">{label}</span>
                        <span className="block text-[0.625rem] text-ink-faint mt-0.5">{hint}</span>
                      </button>
                    ))}
                  </div>
                  <p className="mt-2.5 text-xs text-ink-faint leading-relaxed">
                    Grade honestly. Marking something &ldquo;easy&rdquo; that you half-knew
                    pushes it a month away, which is exactly when you will need it.
                  </p>
                </fieldset>
              )}
            </Card>
          )}
        </>
      )}

      {/* --------------------------------------------------------- forecast */}
      {forecast.some((f) => f.count > 0) && (
        <section className="mt-10">
          <h2 className="text-xs font-bold uppercase tracking-wide text-ink-muted mb-3">
            Next fortnight
          </h2>
          <div className="flex items-end gap-1 h-20" role="img" aria-label="Review forecast">
            {forecast.map((day) => {
              const max = Math.max(1, ...forecast.map((f) => f.count))
              return (
                <div key={day.day} className="flex-1 flex flex-col items-center gap-1">
                  <div
                    className={cx(
                      'w-full rounded-t transition-all',
                      day.count > 0 ? 'bg-accent' : 'bg-surface border-t border-border',
                    )}
                    style={{ height: `${Math.max(2, (day.count / max) * 100)}%` }}
                    title={`${day.day}: ${day.count}`}
                  />
                  <span className="text-[0.5625rem] text-ink-faint tabular-nums">
                    {day.day.slice(8)}
                  </span>
                </div>
              )
            })}
          </div>
        </section>
      )}
    </Page>
  )
}

function AnswerView({ question }: { question: Question }) {
  if (question.kind === 'recall') {
    return (
      <>
        <p className="text-xs font-bold uppercase tracking-wide text-ink-muted mb-2">
          Key points
        </p>
        <ul className="space-y-1.5 text-sm text-ink">
          {question.keyPoints.map((point, i) => (
            <li key={i} className="flex gap-2">
              <span className="text-accent shrink-0" aria-hidden="true">•</span>
              <span>{point}</span>
            </li>
          ))}
        </ul>
      </>
    )
  }

  if (question.kind === 'order') {
    return (
      <ol className="space-y-1 text-sm text-ink">
        {question.items.map((item, i) => (
          <li key={item}>
            <span className="text-ink-faint font-mono text-xs mr-2">{i + 1}.</span>
            {item}
          </li>
        ))}
      </ol>
    )
  }

  const correct = question.options.filter((o) => o.correct)
  return (
    <ul className="space-y-1.5 text-sm text-ink">
      {correct.map((option) => (
        <li key={option.id} className="flex gap-2">
          <span className="text-positive shrink-0" aria-hidden="true">✓</span>
          <span>{option.text}</span>
        </li>
      ))}
    </ul>
  )
}

function Stat({
  label, value, hint, tone,
}: { label: string; value: number; hint?: string; tone?: 'positive' | 'caution' }) {
  return (
    <Card className="p-3">
      <p
        className={cx(
          'text-2xl font-semibold tabular-nums',
          tone === 'positive' && 'text-positive',
          tone === 'caution' && 'text-caution',
          !tone && 'text-ink',
        )}
      >
        {value}
      </p>
      <p className="text-xs text-ink-muted mt-0.5">{label}</p>
      {hint && <p className="text-[0.625rem] text-ink-faint">{hint}</p>}
    </Card>
  )
}
