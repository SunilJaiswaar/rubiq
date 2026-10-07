/**
 * The code-execution contract (brief §14).
 *
 * The playground UI is written against this interface and nothing else, so adding a
 * server-side Ruby sandbox later changes one file in this folder and zero components.
 */

export type Language =
  | 'javascript' | 'typescript' | 'sql'
  | 'ruby' | 'python' | 'go' | 'java' | 'cpp' | 'c' | 'csharp' | 'php' | 'rust'

export type Availability =
  /** Runs in this browser, right now. */
  | 'local'
  /** Needs a backend that is not deployed yet. */
  | 'remote'
  /** Cannot run here at all; the UI explains why instead of offering a dead button. */
  | 'unavailable'

export interface ConsoleLine {
  stream: 'log' | 'warn' | 'error' | 'info'
  text: string
}

export interface TestOutcome {
  id: string
  name: string
  passed: boolean
  expected: unknown
  actual: unknown
  error: string | null
  hidden: boolean
}

export interface TableResult {
  columns: string[]
  rows: unknown[][]
  /** Rows the engine had to look at — used to show the cost of a missing index. */
  rowsScanned?: number | undefined
  plan?: string[] | undefined
}

export interface RunResult {
  ok: boolean
  console: ConsoleLine[]
  /** Value of the last expression, when the language has one. */
  value?: unknown
  table?: TableResult | undefined
  tests?: TestOutcome[] | undefined
  error?: { message: string; line?: number | undefined; hint?: string | undefined } | undefined
  durationMs: number
  timedOut: boolean
}

export interface RunOptions {
  /** Hard wall-clock limit. The worker is terminated, not asked politely. */
  timeoutMs?: number
  /** Exercise tests to run against the learner's code. */
  tests?: Array<{ id: string; name: string; call: string; expect: unknown; hidden: boolean }>
  /** Seed data for SQL. */
  seed?: {
    tables: Array<{
      name: string
      columns: Array<{ name: string; type: string }>
      rows: unknown[][]
    }>
  }
}

export interface CodeRunner {
  readonly language: Language
  readonly label: string
  readonly availability: Availability
  /** Shown when `availability !== 'local'` so the learner knows what is going on. */
  readonly unavailableReason?: string | undefined
  run(source: string, options?: RunOptions): Promise<RunResult>
  dispose?(): void
}
