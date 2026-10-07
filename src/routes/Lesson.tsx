import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import {
  findLesson, getTrack, loadLesson, prefetchLesson, lessonsOfTrack,
} from '@/content/catalog'
import type { Lesson as LessonData, LessonStub, ModeName } from '@/content/types'
import {
  useProgressContext, useLessonProgress, useTimeOnLesson,
} from '@/hooks/useProgress'
import { LessonBody } from '@/features/LessonBody'
import { ModeSwitcher } from '@/features/ModeSwitcher'
import { Quiz } from '@/features/Quiz'
import { ExerciseRunner } from '@/features/ExerciseRunner'
import { SqlConsole } from '@/features/SqlConsole'
import { InterviewCard } from '@/features/InterviewCard'
import { NotFoundBody } from '@/features/RouteError'
import {
  Page, Card, Badge, Button, ButtonLink, LevelBadge, Spinner, cx,
} from '@/ui/primitives'

export default function Lesson() {
  const { track: trackSlug = '', lesson: lessonSlug = '' } = useParams()
  const [params, setParams] = useSearchParams()
  const stub = findLesson(trackSlug, lessonSlug)
  const track = getTrack(trackSlug)

  const [lesson, setLesson] = useState<LessonData | null>(null)
  const [loadError, setLoadError] = useState(false)
  const [sqlQuery, setSqlQuery] = useState<string | undefined>(undefined)
  // Bumped on every fence Run press, so pressing Run on the same snippet twice runs
  // it twice rather than being swallowed as "no change".
  const [sqlRunSignal, setSqlRunSignal] = useState(0)

  const { progress, srs, invalidate } = useProgressContext()
  const lessonProgress = useLessonProgress(stub?.id ?? null)
  useTimeOnLesson(stub?.id ?? null)

  const mode = (params.get('mode') ?? 'full') as ModeName
  const setMode = useCallback(
    (next: ModeName) => {
      const updated = new URLSearchParams(params)
      if (next === 'full') updated.delete('mode')
      else updated.set('mode', next)
      // A mode belongs in the URL so it survives a reload and can be shared.
      setParams(updated, { replace: true })
    },
    [params, setParams],
  )

  /* --------------------------------------------------------------- loading */
  useEffect(() => {
    if (!stub) return
    let cancelled = false
    setLesson(null)
    setLoadError(false)
    void loadLesson(stub.id).then(
      (data) => {
        if (cancelled) return
        if (data) setLesson(data)
        else setLoadError(true)
      },
      () => { if (!cancelled) setLoadError(true) },
    )
    return () => { cancelled = true }
  }, [stub])

  /* ------------------------------------------- mark read, enrol concepts */
  useEffect(() => {
    if (!progress || !srs || !stub) return
    void progress.markRead(stub.id).then(invalidate)
    // Meeting a concept in a lesson puts it into the review schedule, so the queue
    // fills itself as the learner studies rather than needing to be curated.
    for (const concept of stub.concepts) void srs.enrol(concept, stub.id)
  }, [progress, srs, stub, invalidate])

  /* ----------------------------------------------- prefetch the next lesson */
  useEffect(() => {
    if (lesson?.next) prefetchLesson(lesson.next.id)
  }, [lesson?.next])

  const siblings = useMemo(() => lessonsOfTrack(trackSlug), [trackSlug])

  if (!stub || !track) return <NotFoundBody />

  const onQuizComplete = async (result: {
    score: number
    passed: boolean
    weakConcepts: string[]
    perConcept: Array<{ concept: string; correct: boolean }>
  }) => {
    if (!progress || !srs || !lesson) return

    await progress.recordQuizResult(stub.id, result.score)
    for (const { concept, correct } of result.perConcept) {
      await progress.recordConcept(concept, correct)
      // A missed concept comes back soon; a correct one moves out. This is the
      // link between assessment and the review schedule.
      await srs.review(concept, correct ? 'good' : 'again')
    }
    await progress.recomputeCompletion(stub, lesson.quiz?.passScore ?? 0.7)
    if (result.passed) await progress.touchStreak()
    invalidate()
  }

  const onExerciseSolved = async () => {
    if (!progress || !lesson) return
    await progress.recordExerciseSolved(stub.id)
    await progress.recomputeCompletion(stub, lesson.quiz?.passScore ?? 0.7)
    await progress.touchStreak()
    invalidate()
  }

  return (
    <Page width="wide" className="py-8">
      <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_17rem] lg:gap-10">
        <article className="min-w-0">
          {/* ------------------------------------------------------- header */}
          <nav aria-label="Breadcrumb" className="text-xs text-ink-muted mb-3">
            <Link to="/learn" className="hover:text-ink">Tracks</Link>
            <span className="mx-1.5 text-ink-faint" aria-hidden="true">/</span>
            <Link to={`/learn/${track.slug}`} className="hover:text-ink">{track.title}</Link>
          </nav>

          <header className="mb-6">
            <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight leading-tight text-ink">
              {stub.title}
            </h1>
            {stub.summary && (
              <p className="mt-2.5 text-ink-muted leading-relaxed max-w-2xl">{stub.summary}</p>
            )}

            <div className="mt-4 flex flex-wrap items-center gap-2">
              <LevelBadge level={stub.level} />
              <Badge>{stub.minutes} min read</Badge>
              {lesson?.version && <Badge>v{lesson.version}</Badge>}
              {lesson?.status && lesson.status !== 'stable' && (
                <Badge tone="caution">{lesson.status}</Badge>
              )}
              {lessonProgress?.completed && <Badge tone="positive">Completed</Badge>}
              {lessonProgress?.read && !lessonProgress.completed && <Badge>Read</Badge>}
            </div>

            {lesson?.lastReviewed && (
              <p className="mt-3 text-xs text-ink-faint">
                Last reviewed {lesson.lastReviewed}.{' '}
                <a
                  href={`https://github.com/SunilJaiswaar/rubiq/edit/main/${stub.sourcePath}/lesson.md`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline hover:text-ink-muted"
                >
                  Improve this lesson ↗
                </a>
              </p>
            )}
          </header>

          {stub.modes.length > 1 && (
            <div className="mb-6">
              <ModeSwitcher available={stub.modes} value={mode} onChange={setMode} />
            </div>
          )}

          {/* --------------------------------------------------------- body */}
          {loadError ? (
            <Card className="p-6">
              <h2 className="font-semibold text-ink">This lesson could not load</h2>
              <p className="mt-2 text-sm text-ink-muted">
                The content file failed to download. If you are offline it may not be
                cached yet; otherwise a reload usually fixes it.
              </p>
              <Button className="mt-4" onClick={() => window.location.reload()}>
                Reload
              </Button>
            </Card>
          ) : !lesson ? (
            <div className="py-16 flex justify-center">
              <Spinner label="Loading the lesson" />
            </div>
          ) : (
            <>
              <LessonBody
                html={lesson.html}
                mode={mode}
                {...(lesson.playground?.language === 'sql'
                  ? {
                      onRunCode: (code: string) => {
                        setSqlQuery(code)
                        setSqlRunSignal((n) => n + 1)
                        document.getElementById('lesson-playground')
                          ?.scrollIntoView({ behavior: 'smooth', block: 'center' })
                      },
                    }
                  : {})}
              />

              {/* --------------------------------------------- playground */}
              {lesson.playground?.language === 'sql' && lesson.playground.seed && (
                <section id="lesson-playground" className="mt-12 scroll-mt-20">
                  <h2 className="text-lg font-semibold mb-1 text-ink">Try it</h2>
                  <p className="text-sm text-ink-muted mb-4">
                    Real tables, running in your browser. Every query reports how many rows
                    it had to examine.
                  </p>
                  <SqlConsole
                    playground={lesson.playground}
                    initialQuery={sqlQuery}
                    runSignal={sqlRunSignal}
                  />
                </section>
              )}

              {/* ----------------------------------------------- exercise */}
              {lesson.exercise && (
                <section id="exercise" className="mt-12 scroll-mt-20">
                  <h2 className="text-lg font-semibold mb-1 text-ink">Practice</h2>
                  <p className="text-sm text-ink-muted mb-4">
                    Write it yourself. Hints are there when you want them; the solution
                    unlocks once you have either solved it or read every hint.
                  </p>
                  <ExerciseRunner
                    exercise={lesson.exercise}
                    onSolved={() => void onExerciseSolved()}
                  />
                </section>
              )}

              {/* --------------------------------------------------- quiz */}
              {lesson.quiz && (
                <section id="quiz" className="mt-12 scroll-mt-20">
                  <h2 className="text-lg font-semibold mb-1 text-ink">Check yourself</h2>
                  <p className="text-sm text-ink-muted mb-4">
                    Retrieval, not review. Trying to recall it is what makes it stick, even
                    when you get it wrong — especially when you get it wrong.
                  </p>
                  <Quiz
                    quiz={lesson.quiz}
                    lessonId={stub.id}
                    onComplete={(r) => void onQuizComplete(r)}
                  />
                </section>
              )}

              {/* ---------------------------------------------- interview */}
              {lesson.interview.length > 0 && (
                <section id="interview" className="mt-12 scroll-mt-20">
                  <h2 className="text-lg font-semibold mb-1 text-ink">Interview me</h2>
                  <p className="text-sm text-ink-muted mb-4">
                    Answer out loud before revealing anything. Reading a good answer feels
                    like learning and is not.
                  </p>
                  <div className="space-y-3">
                    {lesson.interview.map((question, i) => (
                      <InterviewCard key={i} question={question} lessonTitle={stub.title} />
                    ))}
                  </div>
                </section>
              )}

              {/* --------------------------------------------- resources */}
              {lesson.resources.length > 0 && (
                <section className="mt-12">
                  <h2 className="text-lg font-semibold mb-3 text-ink">Primary sources</h2>
                  <ul className="space-y-2">
                    {lesson.resources.map((resource) => (
                      <li key={resource.url}>
                        <a
                          href={resource.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-sm text-accent hover:underline"
                        >
                          {resource.title} ↗
                        </a>
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              {/* --------------------------------------------- next/prev */}
              <nav
                aria-label="Lesson navigation"
                className="mt-14 pt-6 border-t border-border grid gap-3 sm:grid-cols-2"
              >
                {lesson.previous ? (
                  <Link
                    to={lesson.previous.route}
                    className="group p-4 rounded-xl border border-border hover:border-border-strong transition-colors"
                  >
                    <span className="text-xs text-ink-faint">← Previous</span>
                    <span className="block text-sm font-medium mt-1 text-ink group-hover:text-accent">
                      {lesson.previous.title}
                    </span>
                  </Link>
                ) : <div />}

                {lesson.next ? (
                  <Link
                    to={lesson.next.route}
                    onMouseEnter={() => prefetchLesson(lesson.next!.id)}
                    className="group p-4 rounded-xl border border-border hover:border-border-strong transition-colors sm:text-right"
                  >
                    <span className="text-xs text-ink-faint">Next →</span>
                    <span className="block text-sm font-medium mt-1 text-ink group-hover:text-accent">
                      {lesson.next.title}
                    </span>
                  </Link>
                ) : (
                  <Card className="p-4 sm:text-right">
                    <span className="text-xs text-ink-faint">End of the track</span>
                    <ButtonLink to="/learn" size="sm" className="mt-2">
                      Choose what is next
                    </ButtonLink>
                  </Card>
                )}
              </nav>
            </>
          )}
        </article>

        {/* ------------------------------------------------------- sidebar */}
        <aside className="hidden lg:block">
          <div className="sticky top-20 space-y-5 max-h-[calc(100dvh-6rem)] overflow-y-auto pb-6">
            {lesson && lesson.headings.length > 2 && (
              <nav aria-labelledby="toc-heading">
                <h2
                  id="toc-heading"
                  className="text-xs font-bold uppercase tracking-wide text-ink-muted mb-2"
                >
                  On this page
                </h2>
                <ul className="space-y-1 text-sm border-l border-border">
                  {lesson.headings.map((heading, i) => (
                    <li key={i}>
                      <a
                        href={`#${slugify(heading.text)}`}
                        className={cx(
                          'block py-0.5 text-ink-muted hover:text-ink border-l-2 border-transparent hover:border-accent -ml-px',
                          heading.depth === 2 ? 'pl-3' : 'pl-6 text-xs',
                        )}
                      >
                        {heading.text}
                      </a>
                    </li>
                  ))}
                </ul>
              </nav>
            )}

            <LessonTools stub={stub} />

            <nav aria-labelledby="track-heading">
              <h2
                id="track-heading"
                className="text-xs font-bold uppercase tracking-wide text-ink-muted mb-2"
              >
                {track.title}
              </h2>
              <ol className="space-y-0.5 text-sm">
                {siblings.map((sibling) => (
                  <li key={sibling.id}>
                    <Link
                      to={sibling.route}
                      onMouseEnter={() => prefetchLesson(sibling.id)}
                      aria-current={sibling.id === stub.id ? 'page' : undefined}
                      className={cx(
                        'block py-1 px-2 -mx-2 rounded transition-colors truncate',
                        sibling.id === stub.id
                          ? 'text-ink font-medium bg-surface'
                          : 'text-ink-muted hover:text-ink hover:bg-surface',
                      )}
                    >
                      {sibling.title}
                    </Link>
                  </li>
                ))}
              </ol>
            </nav>
          </div>
        </aside>
      </div>
    </Page>
  )
}

/* -------------------------------------------------------- notes/bookmarks */

function LessonTools({ stub }: { stub: LessonStub }) {
  const { progress, invalidate } = useProgressContext()
  const [bookmarked, setBookmarked] = useState(false)
  const [note, setNote] = useState('')
  const [noteOpen, setNoteOpen] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    if (!progress) return
    void progress.isBookmarked(stub.id).then(setBookmarked)
    void progress.note(stub.id).then((n) => setNote(n?.body ?? ''))
  }, [progress, stub.id])

  // Debounced autosave — a notes box that needs a Save button loses notes.
  useEffect(() => {
    if (!progress || !noteOpen) return
    const timer = setTimeout(() => {
      void progress.saveNote(stub.id, note).then(() => {
        setSaved(true)
        setTimeout(() => setSaved(false), 1500)
      })
    }, 700)
    return () => clearTimeout(timer)
  }, [note, progress, stub.id, noteOpen])

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <Button
          size="sm"
          variant={bookmarked ? 'primary' : 'secondary'}
          className="flex-1"
          onClick={async () => {
            if (!progress) return
            setBookmarked(await progress.toggleBookmark(stub))
            invalidate()
          }}
          aria-pressed={bookmarked}
        >
          {bookmarked ? '★ Saved' : '☆ Save'}
        </Button>
        <Button size="sm" className="flex-1" onClick={() => setNoteOpen((o) => !o)}>
          {note ? '✎ Note' : '+ Note'}
        </Button>
      </div>

      {noteOpen && (
        <div>
          <label htmlFor="lesson-note" className="sr-only">Your note on this lesson</label>
          <textarea
            id="lesson-note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={5}
            placeholder="What clicked? What is still confusing? Future you will want this."
            className="w-full text-xs rounded-lg border border-border-strong bg-surface-raised p-2.5 resize-y placeholder:text-ink-faint text-ink focus:border-accent focus:outline-none"
          />
          <p className="text-[0.625rem] text-ink-faint mt-1">
            {saved ? 'Saved' : 'Saves as you type · stored only in this browser'}
          </p>
        </div>
      )}
    </div>
  )
}

const slugify = (text: string): string =>
  text.toLowerCase().trim().replace(/[^\w\s-]/g, '').replace(/\s+/g, '-').replace(/-+/g, '-')

