/**
 * An exercise: editor, tests, hints, solution.
 *
 * The hint ladder is deliberate (brief §14, §35). Hints are revealed one at a time and
 * the solution stays locked until either the tests pass or every hint has been read.
 * A solution available on arrival is a solution that gets read instead of the problem
 * being attempted — and attempting is where the learning is.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import type { Exercise } from '@/content/types'
import { getRunner } from '@/runners'
import type { RunResult } from '@/runners/types'
import { expandSeed } from '@/runners/seed.mjs'
import { CodeEditor } from './CodeEditor'
import { RunPanel } from './RunPanel'
import { Button, Card, Badge } from '@/ui/primitives'

export function ExerciseRunner({
  exercise, onSolved,
}: { exercise: Exercise; onSolved?: () => void }) {
  const [code, setCode] = useState(exercise.starter)
  const [result, setResult] = useState<RunResult | null>(null)
  const [running, setRunning] = useState(false)
  const [hintsShown, setHintsShown] = useState(0)
  const [solutionShown, setSolutionShown] = useState(false)
  const [solved, setSolved] = useState(false)
  const solvedRef = useRef(false)

  const runner = getRunner(exercise.language)
  const allHintsRead = hintsShown >= exercise.hints.length
  const solutionUnlocked = solved || allHintsRead

  const run = useCallback(async () => {
    if (runner.availability !== 'local') return
    setRunning(true)
    try {
      const seed = exercise.seed ? expandSeed(exercise.seed) : null
      const next = await runner.run(code, {
        tests: exercise.tests,
        ...(seed ? { seed } : {}),
      })
      setResult(next)

      const allPassed =
        Boolean(next.tests?.length) && next.tests!.every((t) => t.passed)
      if (allPassed && !solvedRef.current) {
        solvedRef.current = true
        setSolved(true)
        onSolved?.()
      }
    } finally {
      setRunning(false)
    }
  }, [code, exercise, runner, onSolved])

  // Reset when navigating between exercises.
  useEffect(() => {
    setCode(exercise.starter)
    setResult(null)
    setHintsShown(0)
    setSolutionShown(false)
    setSolved(false)
    solvedRef.current = false
  }, [exercise.id, exercise.starter])

  if (runner.availability !== 'local') {
    return <NotRunnable exercise={exercise} reason={runner.unavailableReason} />
  }

  return (
    <div className="space-y-4">
      <Card className="overflow-hidden">
        <div className="px-4 py-3 border-b border-border flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2 min-w-0">
            <Badge tone="accent">{runner.label}</Badge>
            <h3 className="text-sm font-semibold truncate text-ink">{exercise.title}</h3>
          </div>
          <div className="flex items-center gap-2">
            {solved && <Badge tone="positive">Solved</Badge>}
            <Button
              size="sm"
              variant="ghost"
              onClick={() => { setCode(exercise.starter); setResult(null) }}
            >
              Reset
            </Button>
            <Button size="sm" variant="primary" onClick={() => void run()} disabled={running}>
              {running ? 'Running…' : 'Run tests'}
            </Button>
          </div>
        </div>

        {exercise.brief && (
          <div className="px-4 py-3.5 border-b border-border text-sm text-ink-muted leading-relaxed whitespace-pre-line">
            {exercise.brief}
          </div>
        )}

        <CodeEditor
          value={code}
          onChange={setCode}
          language={exercise.language}
          height={360}
          onRun={() => void run()}
          ariaLabel={`Code editor for ${exercise.title}`}
        />

        <div className="border-t border-border bg-surface/50">
          <RunPanel result={result} running={running} />
        </div>
      </Card>

      {/* --- hints --- */}
      {exercise.hints.length > 0 && (
        <Card className="p-4">
          <div className="flex items-center justify-between gap-3">
            <h4 className="text-xs font-bold uppercase tracking-wide text-ink-muted">
              Hints ({hintsShown}/{exercise.hints.length})
            </h4>
            {hintsShown < exercise.hints.length && (
              <Button size="sm" variant="secondary" onClick={() => setHintsShown((n) => n + 1)}>
                {hintsShown === 0 ? 'I am stuck — one hint' : 'Another hint'}
              </Button>
            )}
          </div>

          {hintsShown === 0 ? (
            <p className="mt-2 text-xs text-ink-faint leading-relaxed">
              Try it first. Being stuck for a few minutes is doing more for you than the
              hint will — hints are here so you do not give up, not so you do not struggle.
            </p>
          ) : (
            <ol className="mt-3 space-y-2.5">
              {exercise.hints.slice(0, hintsShown).map((hint, i) => (
                <li key={i} className="flex gap-2.5 text-sm text-ink-muted leading-relaxed">
                  <span className="shrink-0 text-xs font-mono text-ink-faint mt-0.5">
                    {i + 1}.
                  </span>
                  <span>{hint}</span>
                </li>
              ))}
            </ol>
          )}
        </Card>
      )}

      {/* --- solution --- */}
      <Card className="p-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <h4 className="text-xs font-bold uppercase tracking-wide text-ink-muted">
            Reference solution
          </h4>
          {solutionUnlocked ? (
            <Button size="sm" variant="secondary" onClick={() => setSolutionShown((s) => !s)}>
              {solutionShown ? 'Hide' : 'Show solution'}
            </Button>
          ) : (
            <span className="text-xs text-ink-faint">
              Unlocks once the tests pass, or after all {exercise.hints.length} hints
            </span>
          )}
        </div>

        {solutionShown && solutionUnlocked && (
          <>
            <pre className="mt-3 p-3.5 bg-surface border border-border rounded-lg overflow-x-auto font-mono text-xs leading-relaxed">
              <code>{exercise.solution}</code>
            </pre>
            <p className="mt-2.5 text-xs text-ink-faint leading-relaxed">
              Compare it against yours rather than replacing yours. A different working
              solution is not a worse one — but if this one is shorter or clearer, the
              interesting question is which idea made it so.
            </p>
          </>
        )}
      </Card>
    </div>
  )
}

/**
 * The honest state for a language with no browser runner. Not a disabled button and not
 * a "coming soon" — the exercise, its tests and its solution are all still readable.
 */
function NotRunnable({ exercise, reason }: { exercise: Exercise; reason?: string | undefined }) {
  return (
    <Card className="overflow-hidden">
      <div className="px-4 py-3 border-b border-border flex items-center gap-2">
        <Badge tone="caution">{exercise.language} · not runnable here</Badge>
        <h3 className="text-sm font-semibold truncate text-ink">{exercise.title}</h3>
      </div>

      <div className="px-4 py-3.5 text-sm text-ink-muted leading-relaxed border-b border-border">
        {reason}
      </div>

      {exercise.brief && (
        <div className="px-4 py-3.5 text-sm text-ink leading-relaxed whitespace-pre-line border-b border-border">
          {exercise.brief}
        </div>
      )}

      <div className="p-4 space-y-4">
        <section>
          <h4 className="text-xs font-bold uppercase tracking-wide text-ink-muted mb-2">
            Starting point
          </h4>
          <pre className="p-3 bg-surface border border-border rounded-lg overflow-x-auto font-mono text-xs">
            <code>{exercise.starter}</code>
          </pre>
        </section>

        <section>
          <h4 className="text-xs font-bold uppercase tracking-wide text-ink-muted mb-2">
            What it has to satisfy
          </h4>
          <ul className="space-y-1.5">
            {exercise.tests.filter((t) => !t.hidden).map((test) => (
              <li key={test.id} className="text-sm text-ink-muted">
                <span className="text-ink">{test.name}</span>
                <code className="ml-2 font-mono text-xs text-ink-faint">
                  {test.call} → {JSON.stringify(test.expect)}
                </code>
              </li>
            ))}
          </ul>
        </section>

        <details>
          <summary className="text-xs font-bold uppercase tracking-wide text-ink-muted cursor-pointer hover:text-ink">
            Reference solution
          </summary>
          <pre className="mt-2.5 p-3 bg-surface border border-border rounded-lg overflow-x-auto font-mono text-xs">
            <code>{exercise.solution}</code>
          </pre>
        </details>
      </div>
    </Card>
  )
}
