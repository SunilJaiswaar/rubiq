/** Shared output panel for every runner: console lines, SQL tables, plans, test results. */
import type { RunResult, TestOutcome } from '@/runners/types'
import { cx, Badge } from '@/ui/primitives'

/**
 * Render an unknown value as text without ever producing "[object Object]".
 * Cells come from a dynamically typed engine, so the type is genuinely unknown here.
 */
function display(value: unknown): string {
  if (value === null || value === undefined) return ''
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') {
    return String(value)
  }
  try {
    return JSON.stringify(value) ?? ''
  } catch {
    return '[unserialisable]'
  }
}

export function RunPanel({ result, running }: { result: RunResult | null; running: boolean }) {
  if (running) {
    return (
      <div className="px-4 py-6 text-sm text-ink-muted flex items-center gap-2">
        <span className="w-3.5 h-3.5 rounded-full border-2 border-border border-t-accent animate-spin" aria-hidden="true" />
        Running…
      </div>
    )
  }

  if (!result) {
    return (
      <p className="px-4 py-6 text-sm text-ink-faint">
        Nothing run yet. Press <kbd className="font-mono text-xs">⌘↵</kbd> or the Run button.
      </p>
    )
  }

  return (
    <div className="divide-y divide-border" aria-live="polite">
      {result.error && <ErrorView error={result.error} timedOut={result.timedOut} />}
      {result.tests && result.tests.length > 0 && <TestResults tests={result.tests} />}
      {result.table && <TableView table={result.table} />}
      {result.console.length > 0 && <ConsoleView lines={result.console} />}

      {!result.error &&
        result.console.length === 0 &&
        !result.table &&
        !result.tests?.length && (
        <div className="px-4 py-5 text-sm text-ink-muted">
          Ran without errors, and printed nothing.
          {result.value !== undefined && result.value !== 'undefined' && (
            <> The last expression evaluated to <code className="font-mono text-xs">{display(result.value)}</code>.</>
          )}
        </div>
      )}

      <div className="px-4 py-2 text-[0.6875rem] text-ink-faint flex gap-3">
        <span>{Math.round(result.durationMs)} ms</span>
        {result.table?.rowsScanned !== undefined && (
          <span className="font-medium text-ink-muted">
            rows examined: {result.table.rowsScanned.toLocaleString()}
          </span>
        )}
      </div>
    </div>
  )
}

function ErrorView({
  error, timedOut,
}: { error: NonNullable<RunResult['error']>; timedOut: boolean }) {
  return (
    <div className="px-4 py-3.5 bg-danger-soft" role="alert">
      <div className="flex items-start gap-2">
        <Badge tone="danger">{timedOut ? 'Timed out' : 'Error'}</Badge>
        <div className="min-w-0 flex-1">
          <p className="font-mono text-xs text-danger break-words">
            {error.message}
            {error.line !== undefined && (
              <span className="text-ink-faint"> (line {error.line})</span>
            )}
          </p>
          {/* The hint is the teaching part — plain language, explaining the cause. */}
          {error.hint && (
            <p className="mt-2 text-sm text-ink leading-relaxed">{error.hint}</p>
          )}
        </div>
      </div>
    </div>
  )
}

function TestResults({ tests }: { tests: TestOutcome[] }) {
  const passed = tests.filter((t) => t.passed).length
  const all = passed === tests.length

  return (
    <div>
      <div
        className={cx(
          'px-4 py-2.5 flex items-center gap-2 text-sm font-medium',
          all ? 'bg-positive-soft text-positive' : 'bg-caution-soft text-caution',
        )}
      >
        <span aria-hidden="true">{all ? '✓' : '○'}</span>
        {passed} of {tests.length} tests passing
      </div>
      <ul className="divide-y divide-border">
        {tests.map((test) => (
          <li key={test.id} className="px-4 py-2.5">
            <div className="flex items-start gap-2.5">
              <span
                className={cx(
                  'shrink-0 mt-0.5 w-4 h-4 rounded-full flex items-center justify-center text-[0.625rem] font-bold',
                  test.passed ? 'bg-positive-soft text-positive' : 'bg-danger-soft text-danger',
                )}
                aria-hidden="true"
              >
                {test.passed ? '✓' : '✕'}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm text-ink">{test.name}</p>
                {!test.passed && (
                  <div className="mt-1.5 font-mono text-[0.6875rem] space-y-0.5">
                    {test.error ? (
                      <p className="text-danger break-words">threw: {test.error}</p>
                    ) : (
                      <>
                        <p className="text-ink-muted">
                          expected <span className="text-positive">{JSON.stringify(test.expected)}</span>
                        </p>
                        <p className="text-ink-muted">
                          got <span className="text-danger">{JSON.stringify(test.actual)}</span>
                        </p>
                      </>
                    )}
                  </div>
                )}
              </div>
              {test.hidden && <Badge>hidden</Badge>}
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}

function TableView({ table }: { table: NonNullable<RunResult['table']> }) {
  const MAX = 50
  const shown = table.rows.slice(0, MAX)

  return (
    <div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="bg-surface sticky top-0">
            <tr>
              {table.columns.map((column) => (
                <th
                  key={column}
                  className="text-left font-semibold px-3 py-2 border-b border-border whitespace-nowrap font-mono text-ink-muted"
                >
                  {column}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {shown.map((row, i) => (
              <tr key={i} className="border-b border-border last:border-0">
                {row.map((cell, j) => (
                  <td key={j} className="px-3 py-1.5 font-mono whitespace-nowrap">
                    {cell === null || cell === undefined ? (
                      <span className="text-ink-faint italic">NULL</span>
                    ) : (
                      display(cell)
                    )}
                  </td>
                ))}
              </tr>
            ))}
            {shown.length === 0 && (
              <tr>
                <td
                  colSpan={Math.max(1, table.columns.length)}
                  className="px-3 py-5 text-center text-ink-muted"
                >
                  No rows matched. The column headers above show the shape the query would
                  have returned.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="px-3 py-1.5 text-[0.6875rem] text-ink-faint border-t border-border">
        {table.rows.length} row{table.rows.length === 1 ? '' : 's'}
        {table.rows.length > MAX && ` · showing the first ${MAX}`}
      </div>

      {/* The plan is the pedagogical payload for the SQL track, so it is shown by
          default rather than hidden behind a toggle. */}
      {table.plan && table.plan.length > 0 && (
        <details open className="border-t border-border">
          <summary className="px-3 py-2 text-[0.6875rem] font-semibold uppercase tracking-wide text-ink-muted cursor-pointer hover:text-ink">
            Query plan
          </summary>
          <pre className="px-3 pb-3 font-mono text-[0.6875rem] leading-relaxed overflow-x-auto text-ink-muted">
            {table.plan.join('\n')}
          </pre>
        </details>
      )}
    </div>
  )
}

function ConsoleView({ lines }: { lines: RunResult['console'] }) {
  return (
    <pre className="px-4 py-3 font-mono text-xs leading-relaxed overflow-x-auto max-h-80">
      {lines.map((line, i) => (
        <div
          key={i}
          className={cx(
            'whitespace-pre-wrap break-words',
            line.stream === 'error' && 'text-danger',
            line.stream === 'warn' && 'text-caution',
            line.stream === 'info' && 'text-accent',
          )}
        >
          {line.text}
        </div>
      ))}
    </pre>
  )
}
