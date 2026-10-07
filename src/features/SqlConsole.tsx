/**
 * The SQL console used inside lessons.
 *
 * The index toggle is the point of this component. A learner can run the same query with
 * and without an index and watch "rows examined" change — which is the difference between
 * being told that indexes matter and seeing it (brief §13).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Playground } from '@/content/types'
import { SqlRunner } from '@/runners/sql-runner'
import { expandSeed } from '@/runners/seed.mjs'
import type { RunResult } from '@/runners/types'
import { CodeEditor } from './CodeEditor'
import { RunPanel } from './RunPanel'
import { Button, Card, cx } from '@/ui/primitives'

export function SqlConsole({
  playground, initialQuery, runSignal = 0,
}: {
  playground: Playground
  initialQuery?: string | undefined
  /**
   * Incremented by the caller to mean "run the current query now". A lesson's
   * `runnable` code fence sends the query *and* bumps this, because a learner who
   * clicks Run expects the query to run — loading it into the editor and making them
   * press Run again is a worse version of copy-paste.
   */
  runSignal?: number
}) {
  const [query, setQuery] = useState(initialQuery ?? playground.starter)
  const [result, setResult] = useState<RunResult | null>(null)
  const [running, setRunning] = useState(false)
  const [indexes, setIndexes] = useState<Record<string, string[]>>(playground.indexes)

  // Expanding the seed is the browser-side half of the generated-rows design: the
  // lesson shipped a ~400-byte spec, and 100,000 rows are built here.
  const seed = useMemo(
    () => (playground.seed ? expandSeed(playground.seed) : null),
    [playground.seed],
  )

  const runner = useMemo(() => new SqlRunner(), [])

  useEffect(() => {
    if (seed) runner.seed(seed, indexes)
  }, [runner, seed, indexes])

  // Show the query the parent just sent from a lesson's `runnable` fence. Not a
  // render-time adjustment, because `initialQuery` can repeat: clicking the same
  // fence twice must restore it even though the prop value did not change. The
  // signal below is what distinguishes the two.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (initialQuery) setQuery(initialQuery)
  }, [initialQuery])

  const run = useCallback(async (source?: string) => {
    setRunning(true)
    try {
      setResult(await runner.run(source ?? query))
    } finally {
      setRunning(false)
    }
  }, [runner, query])

  // Run when the caller signals it, using the query it just handed us rather than
  // waiting a render for state to settle.
  const lastSignal = useRef(runSignal)
  // Running a query is async I/O triggered by a parent signal, which is what an
  // effect is for. The lint rule sees it because `run` sets a loading flag.
  useEffect(() => {
    if (runSignal === lastSignal.current) return
    lastSignal.current = runSignal
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (initialQuery) void run(initialQuery)
  }, [runSignal, initialQuery, run])

  const tables = runner.tables

  const toggleIndex = (table: string, column: string) => {
    setIndexes((prev) => {
      const existing = prev[table] ?? []
      const next = existing.includes(column)
        ? existing.filter((c) => c !== column)
        : [...existing, column]
      return { ...prev, [table]: next }
    })
    setResult(null)
  }

  return (
    <Card className="overflow-hidden not-prose">
      {/* --- schema + index toggles --- */}
      <div className="px-4 py-3 border-b border-border bg-surface">
        {playground.notes && (
          <p className="text-xs text-ink-muted leading-relaxed mb-3">{playground.notes}</p>
        )}
        <div className="space-y-2.5">
          {tables.map((table) => (
            <div key={table.name} className="text-xs">
              <div className="flex items-baseline gap-2 flex-wrap">
                <span className="font-mono font-semibold text-ink">{table.name}</span>
                <span className="text-ink-faint">
                  {table.rowCount.toLocaleString()} row{table.rowCount === 1 ? '' : 's'}
                </span>
              </div>
              <div className="mt-1 flex flex-wrap gap-1">
                {table.columns.map((column) => {
                  const indexed = (indexes[table.name] ?? []).includes(column.name)
                  return (
                    <button
                      key={column.name}
                      type="button"
                      onClick={() => toggleIndex(table.name, column.name)}
                      aria-pressed={indexed}
                      title={
                        indexed
                          ? `Drop the index on ${table.name}.${column.name}`
                          : `Create an index on ${table.name}.${column.name}`
                      }
                      className={cx(
                        'font-mono px-1.5 py-0.5 rounded border transition-colors',
                        indexed
                          ? 'border-accent bg-accent-soft text-accent-ink'
                          : 'border-border bg-canvas text-ink-muted hover:border-border-strong',
                      )}
                    >
                      {column.name}
                      <span className="text-ink-faint ml-1">{column.type}</span>
                      {indexed && <span className="ml-1" aria-hidden="true">⌁</span>}
                    </button>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
        <p className="mt-2.5 text-[0.6875rem] text-ink-faint">
          Click a column to create or drop an index on it, then re-run and compare
          &ldquo;rows examined&rdquo;.
        </p>
      </div>

      <CodeEditor
        value={query}
        onChange={setQuery}
        language="sql"
        height={150}
        onRun={() => void run()}
        ariaLabel="SQL query editor"
      />

      <div className="px-4 py-2.5 border-y border-border flex items-center justify-between gap-2">
        <span className="text-[0.6875rem] text-ink-faint">
          A teaching engine — SELECT, WHERE, JOIN, GROUP BY, HAVING, ORDER BY, LIMIT. Not
          PostgreSQL.
        </span>
        <Button size="sm" variant="primary" onClick={() => void run()} disabled={running}>
          {running ? 'Running…' : 'Run ▸'}
        </Button>
      </div>

      <RunPanel result={result} running={running} />
    </Card>
  )
}
