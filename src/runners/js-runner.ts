/**
 * JavaScript / TypeScript runner.
 *
 * TypeScript is transformed with Sucrase, not with the TypeScript compiler (~6 MB) and
 * not with a regex. A regex stripper looks tempting and is a trap: it cannot tell a type
 * annotation from an object-literal value or a ternary's colon, so it corrupts working
 * code and the learner gets a baffling error in code they wrote correctly. Sucrase is a
 * real parser at a fraction of tsc's size, and it is loaded lazily — only when someone
 * actually runs TypeScript.
 *
 * Type *checking* is Monaco's job, via the language service already in the editor. So:
 * honest type errors while writing, correct execution when running.
 */
import type { CodeRunner, RunOptions, RunResult, Language } from './types'
import { JS_WORKER_SOURCE } from './worker-source'

const DEFAULT_TIMEOUT = 4000

interface WorkerReply {
  ok: boolean
  console: RunResult['console']
  value?: unknown
  tests?: RunResult['tests']
  error?: { message: string; line?: number }
  durationMs: number
}

export class JsRunner implements CodeRunner {
  readonly language: Language
  readonly label: string
  readonly availability = 'local' as const

  #blobUrl: string | null = null

  constructor(language: 'javascript' | 'typescript' = 'javascript') {
    this.language = language
    this.label = language === 'typescript' ? 'TypeScript' : 'JavaScript'
  }

  #url(): string {
    this.#blobUrl ??= URL.createObjectURL(
      new Blob([JS_WORKER_SOURCE], { type: 'text/javascript' }),
    )
    return this.#blobUrl
  }

  async run(source: string, options: RunOptions = {}): Promise<RunResult> {
    const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT
    const started = performance.now()

    let code: string
    try {
      code = this.language === 'typescript' ? await transformTypeScript(source) : source
    } catch (err) {
      // A TypeScript syntax error. Report it as the compile error it is, rather than
      // letting mangled output fail confusingly at runtime.
      const message = err instanceof Error ? err.message : String(err)
      return {
        ok: false,
        console: [],
        error: {
          message: message.replace(/^Error: /, ''),
          line: /\((\d+):\d+\)/.exec(message) ? Number(/\((\d+):\d+\)/.exec(message)?.[1]) : undefined,
          hint: 'TypeScript could not parse this. The editor underlines the same problem.',
        },
        durationMs: performance.now() - started,
        timedOut: false,
      }
    }

    let worker: Worker
    try {
      worker = new Worker(this.#url())
    } catch (err) {
      return {
        ok: false,
        console: [],
        error: {
          message: 'This browser blocked the code sandbox.',
          hint: err instanceof Error ? err.message : undefined,
        },
        durationMs: 0,
        timedOut: false,
      }
    }

    return new Promise<RunResult>((resolve) => {
      let settled = false

      const finish = (result: RunResult) => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        worker.terminate()
        resolve(result)
      }

      // The only reliable way to stop a `while (true) {}` is to kill the thread.
      const timer = setTimeout(() => {
        finish({
          ok: false,
          console: [],
          error: {
            message: `Stopped after ${timeoutMs}ms.`,
            hint: 'Your code did not finish. An infinite loop or a condition that never becomes false is the usual cause.',
          },
          durationMs: performance.now() - started,
          timedOut: true,
        })
      }, timeoutMs)

      worker.onmessage = (event: MessageEvent<WorkerReply>) => {
        const reply = event.data
        finish({
          ok: reply.ok,
          console: reply.console ?? [],
          value: reply.value,
          tests: reply.tests ?? undefined,
          error: reply.error ? { ...reply.error, hint: hintFor(reply.error.message) } : undefined,
          durationMs: reply.durationMs,
          timedOut: false,
        })
      }

      worker.onerror = (event) => {
        finish({
          ok: false,
          console: [],
          error: { message: event.message || 'The sandbox crashed.', line: event.lineno },
          durationMs: performance.now() - started,
          timedOut: false,
        })
      }

      worker.postMessage({ source: code, tests: options.tests ?? [] })
    })
  }

  dispose(): void {
    if (this.#blobUrl) {
      URL.revokeObjectURL(this.#blobUrl)
      this.#blobUrl = null
    }
  }
}

/**
 * Explain the error instead of just echoing it (brief §14: "error explanation").
 * These are the mistakes that actually stop beginners, in the words they will see.
 */
export function hintFor(message: string): string | undefined {
  const m = message.toLowerCase()
  if (m.includes('is not defined')) {
    const name = /(\w+) is not defined/.exec(message)?.[1]
    return `JavaScript has never seen \`${name ?? 'that name'}\`. Either it is spelled differently where you declared it, or it is declared inside a block that this line cannot see.`
  }
  if (m.includes('is not a function')) {
    return 'The value exists, but it is not callable. Log it first — it is usually `undefined` because a previous step returned nothing, or an object where you expected a function.'
  }
  if (m.includes('cannot read propert')) {
    return 'You reached into something that is `null` or `undefined`. Work backwards: which expression produced it? Optional chaining (`a?.b`) hides the symptom but not the cause.'
  }
  if (m.includes('unexpected token')) {
    return 'A syntax error. Check for a missing bracket, brace, or comma on or just before the reported line.'
  }
  if (m.includes('maximum call stack')) {
    return 'Infinite recursion. Your function calls itself without ever hitting a base case that returns.'
  }
  if (m.includes('assignment to constant')) {
    return '`const` bindings cannot be reassigned. Use `let` if the variable genuinely needs to change — but consider whether a new value would be clearer.'
  }
  if (m.includes('cannot access') && m.includes('before initialization')) {
    return 'A `let`/`const` declaration is hoisted but not initialised — this line runs before the declaration does. Move the declaration above its first use.'
  }
  return undefined
}

/**
 * TypeScript → JavaScript, parsed properly, loaded on demand.
 *
 * Only the `typescript` transform runs: ES syntax is left alone, because the sandbox
 * evaluates one script in a modern engine and has nothing to interop with.
 */
let transformer: Promise<typeof import('sucrase')> | null = null

export async function transformTypeScript(source: string): Promise<string> {
  transformer ??= import('sucrase')
  const { transform } = await transformer
  const { code } = transform(source, {
    transforms: ['typescript'],
    disableESTransforms: true,
  })
  return code
}
