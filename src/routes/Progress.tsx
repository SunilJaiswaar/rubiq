import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { tracks, totals, allLessons } from '@/content/catalog'
import { useAllProgress, useProgressContext } from '@/hooks/useProgress'
import { computeGaps } from '@/engines/roadmap'
import type { Bookmark, ConceptStat, Note, Streak } from '@/engines/progress'
import {
  Page, Card, Button, SkillMeter, SectionHeading, cx,
} from '@/ui/primitives'

export default function ProgressPage() {
  const progressMap = useAllProgress()
  const { progress, revision, invalidate, durable } = useProgressContext()

  const [stats, setStats] = useState<ConceptStat[]>([])
  const [weak, setWeak] = useState<ConceptStat[]>([])
  const [streak, setStreak] = useState<Streak | null>(null)
  const [notes, setNotes] = useState<Note[]>([])
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([])
  const [message, setMessage] = useState<{ tone: 'ok' | 'bad'; text: string } | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!progress) return
    void progress.conceptStats().then(setStats)
    void progress.weakConcepts().then(setWeak)
    void progress.streak().then(setStreak)
    void progress.allNotes().then(setNotes)
    void progress.allBookmarks().then(setBookmarks)
  }, [progress, revision])

  const completed = [...progressMap.values()].filter((p) => p.completed).length
  const read = [...progressMap.values()].filter((p) => p.read).length
  const minutes = Math.round(
    [...progressMap.values()].reduce((n, p) => n + p.seconds, 0) / 60,
  )
  const exercisesSolved = [...progressMap.values()].filter((p) => p.exerciseSolved).length

  const gaps = useMemo(() => computeGaps(tracks, progressMap, stats, null), [progressMap, stats])

  const totalAnswers = stats.reduce((n, s) => n + s.total, 0)
  const totalCorrect = stats.reduce((n, s) => n + s.correct, 0)

  /* ------------------------------------------------------- export/import */

  const exportData = useCallback(async () => {
    if (!progress) return
    const payload = await progress.exportAll()
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `rubiq-progress-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
    setMessage({ tone: 'ok', text: 'Downloaded. That file is everything we hold about you.' })
  }, [progress])

  const importData = useCallback(async (file: File, mode: 'merge' | 'replace') => {
    if (!progress) return
    try {
      const count = await progress.importAll(JSON.parse(await file.text()), mode)
      invalidate()
      setMessage({ tone: 'ok', text: `Imported ${count} records.` })
    } catch (error) {
      setMessage({
        tone: 'bad',
        text: error instanceof Error ? error.message : 'That file could not be read.',
      })
    }
  }, [progress, invalidate])

  const exportNotes = useCallback(() => {
    const body = notes
      .map((note) => {
        const lesson = allLessons.find((l) => l.id === note.lessonId)
        return `## ${lesson?.title ?? note.lessonId}\n\n${note.body}\n`
      })
      .join('\n')
    const blob = new Blob([`# My Rubiq notes\n\n${body}`], { type: 'text/markdown' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'rubiq-notes.md'
    a.click()
    URL.revokeObjectURL(url)
  }, [notes])

  return (
    <Page className="py-10">
      <header className="mb-8">
        <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-ink">
          Your progress
        </h1>
        <p className="mt-3 text-ink-muted leading-relaxed max-w-2xl">
          All of this is computed from what you have actually done, and all of it lives in
          this browser. No account, no server, nothing sent anywhere.
        </p>
      </header>

      {/* ------------------------------------------------------------ stats */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-10">
        <Stat value={completed} label="completed" hint={`of ${totals.lessons}`} />
        <Stat value={read} label="opened" />
        <Stat value={exercisesSolved} label="exercises solved" />
        <Stat
          value={totalAnswers > 0 ? `${Math.round((totalCorrect / totalAnswers) * 100)}%` : '—'}
          label="quiz accuracy"
          hint={totalAnswers > 0 ? `${totalAnswers} answers` : 'no quizzes yet'}
        />
        <Stat value={streak?.current ?? 0} label="day streak" hint={`best ${streak?.longest ?? 0}`} />
        <Stat
          value={minutes >= 60 ? `${Math.floor(minutes / 60)}h ${minutes % 60}m` : `${minutes}m`}
          label="focused time"
          hint="visible tab only"
        />
      </div>

      {/* ------------------------------------------------------------- gaps */}
      <section className="mb-10">
        <SectionHeading
          title="Skills"
          subtitle="Completion weighted 60%, quiz accuracy 40%. Grey bars are estimates with no data behind them."
        />
        <Card className="divide-y divide-border">
          {gaps.map((gap) => (
            <div key={gap.track} className="px-4 py-3 flex flex-wrap items-center gap-x-4 gap-y-2">
              <Link
                to={`/learn/${gap.track}`}
                className="text-sm font-medium w-40 shrink-0 hover:text-accent text-ink"
              >
                {gap.title}
              </Link>
              <SkillMeter value={gap.mastery} estimated={gap.estimated} />
              <span className="text-xs text-ink-muted flex-1 min-w-[12rem]">
                {gap.lessonsCompleted}/{gap.lessonsTotal} lessons
                {gap.accuracy !== null && <> · {Math.round(gap.accuracy * 100)}% accuracy</>}
              </span>
              <span className="text-sm tabular-nums text-ink-muted w-10 text-right">
                {Math.round(gap.mastery * 100)}%
              </span>
            </div>
          ))}
        </Card>
      </section>

      {/* ------------------------------------------------------ weak areas */}
      <section className="mb-10">
        <SectionHeading
          title="Weak areas"
          subtitle="Concepts you have missed more than once — one unlucky answer does not count"
          action={
            weak.length > 0
              ? <Link to="/review" className="text-sm text-accent hover:underline">Review these →</Link>
              : undefined
          }
        />
        {weak.length === 0 ? (
          <Card className="p-6">
            <p className="text-sm text-ink-muted">
              {totalAnswers === 0
                ? 'Nothing yet — take a quiz and this fills in with the concepts you actually struggle with.'
                : 'No concept has tripped you up more than once. Keep going.'}
            </p>
          </Card>
        ) : (
          <Card className="divide-y divide-border">
            {weak.map((stat) => (
              <div key={stat.concept} className="px-4 py-2.5 flex items-center gap-3">
                <code className="text-sm font-mono text-caution flex-1">{stat.concept}</code>
                <span className="text-xs text-ink-muted tabular-nums">
                  {stat.correct}/{stat.total} correct
                </span>
                <Link
                  to={`/graph?concept=${encodeURIComponent(stat.concept)}`}
                  className="text-xs text-accent hover:underline"
                >
                  lessons →
                </Link>
              </div>
            ))}
          </Card>
        )}
      </section>

      {/* ------------------------------------------------------- activity */}
      {streak && streak.days.length > 0 && (
        <section className="mb-10">
          <SectionHeading title="Activity" subtitle="Days you completed something" />
          <Card className="p-4">
            <ActivityGrid days={streak.days} />
          </Card>
        </section>
      )}

      {/* ------------------------------------------- bookmarks and notes */}
      <div className="grid gap-6 lg:grid-cols-2 mb-10">
        <section>
          <SectionHeading title={`Saved (${bookmarks.length})`} />
          {bookmarks.length === 0 ? (
            <Card className="p-6">
              <p className="text-sm text-ink-muted">
                Nothing saved. The ☆ button on a lesson keeps it here.
              </p>
            </Card>
          ) : (
            <Card className="divide-y divide-border">
              {bookmarks.map((bookmark) => (
                <Link
                  key={bookmark.lessonId}
                  to={bookmark.route}
                  className="block px-4 py-2.5 text-sm text-ink hover:bg-surface transition-colors"
                >
                  {bookmark.title}
                </Link>
              ))}
            </Card>
          )}
        </section>

        <section>
          <SectionHeading
            title={`Notes (${notes.length})`}
            action={
              notes.length > 0
                ? <Button size="sm" onClick={exportNotes}>Export as Markdown</Button>
                : undefined
            }
          />
          {notes.length === 0 ? (
            <Card className="p-6">
              <p className="text-sm text-ink-muted">
                No notes. Every lesson has a note box in its sidebar.
              </p>
            </Card>
          ) : (
            <Card className="divide-y divide-border">
              {notes.slice(0, 8).map((note) => {
                const lesson = allLessons.find((l) => l.id === note.lessonId)
                return (
                  <div key={note.lessonId} className="px-4 py-3">
                    <Link
                      to={lesson?.route ?? '/learn'}
                      className="text-sm font-medium text-ink hover:text-accent"
                    >
                      {lesson?.title ?? note.lessonId}
                    </Link>
                    <p className="mt-1 text-xs text-ink-muted line-clamp-2 leading-relaxed">
                      {note.body}
                    </p>
                  </div>
                )
              })}
            </Card>
          )}
        </section>
      </div>

      {/* --------------------------------------------------- your data */}
      <section>
        <SectionHeading
          title="Your data"
          subtitle="It is yours. Take it with you whenever you like."
        />
        <Card className="p-5">
          {!durable && (
            <p className="mb-4 text-sm text-caution">
              This browser is blocking storage, so nothing is being saved between sessions.
              Exporting will produce an almost empty file.
            </p>
          )}

          <div className="flex flex-wrap gap-2">
            <Button variant="primary" onClick={() => void exportData()}>
              Export everything (JSON)
            </Button>
            <Button onClick={() => fileInput.current?.click()}>Import a file</Button>
            <input
              ref={fileInput}
              type="file"
              accept="application/json,.json"
              className="sr-only"
              aria-label="Choose a progress file to import"
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (file) void importData(file, 'merge')
                e.target.value = ''
              }}
            />
            <Button
              variant="danger"
              onClick={async () => {
                if (!progress) return
                // A destructive action gets an explicit confirmation naming what is lost.
                const ok = window.confirm(
                  `Delete all local progress?\n\n` +
                  `This removes ${completed} completed lessons, ${notes.length} notes, ` +
                  `${bookmarks.length} bookmarks and your ${streak?.current ?? 0}-day streak. ` +
                  `It cannot be undone.\n\nExport first if you are not sure.`,
                )
                if (!ok) return
                await progress.clearEverything()
                invalidate()
                setMessage({ tone: 'ok', text: 'All local data deleted.' })
              }}
            >
              Delete everything
            </Button>
          </div>

          {message && (
            <p
              role="status"
              className={cx(
                'mt-3 text-sm',
                message.tone === 'ok' ? 'text-positive' : 'text-danger',
              )}
            >
              {message.text}
            </p>
          )}

          <p className="mt-4 text-xs text-ink-faint leading-relaxed max-w-2xl">
            The export is plain JSON with a documented shape, so it is readable without
            this app. Import merges by default, so moving between two browsers does not
            lose anything. Nothing here has ever been sent to a server — there is no server.
          </p>
        </Card>
      </section>
    </Page>
  )
}

function Stat({
  value, label, hint,
}: { value: string | number; label: string; hint?: string }) {
  return (
    <Card className="p-3.5">
      <p className="text-2xl font-semibold tabular-nums text-ink">{value}</p>
      <p className="text-xs text-ink-muted mt-0.5">{label}</p>
      {hint && <p className="text-[0.625rem] text-ink-faint">{hint}</p>}
    </Card>
  )
}

/** A 12-week activity grid. Small enough to read, long enough to show a habit. */
function ActivityGrid({ days }: { days: string[] }) {
  const active = new Set(days)
  const WEEKS = 12
  const cells: Array<{ date: string; active: boolean }> = []

  const today = new Date()
  // Start on the Sunday 12 weeks back so columns line up as weeks.
  const start = new Date(today)
  start.setUTCDate(start.getUTCDate() - (WEEKS * 7 - 1) - start.getUTCDay())

  for (let i = 0; i < WEEKS * 7; i++) {
    const date = new Date(start)
    date.setUTCDate(date.getUTCDate() + i)
    const iso = date.toISOString().slice(0, 10)
    cells.push({ date: iso, active: active.has(iso) })
  }

  return (
    <div className="overflow-x-auto">
      <div
        className="grid grid-rows-7 grid-flow-col gap-[3px] w-max"
        role="img"
        aria-label={`Activity over the last ${WEEKS} weeks: ${days.length} active days`}
      >
        {cells.map((cell) => (
          <div
            key={cell.date}
            title={`${cell.date}${cell.active ? ' — active' : ''}`}
            className={cx(
              'w-3 h-3 rounded-[2px]',
              cell.active ? 'bg-accent' : 'bg-surface border border-border',
            )}
          />
        ))}
      </div>
    </div>
  )
}
