/**
 * Ruby runner.
 *
 * Real CRuby 3.4 via WebAssembly, in the learner's browser. Nothing executes on a server,
 * because there is no server — which satisfies the sandboxing requirement structurally
 * rather than by policy.
 *
 * The honest cost, measured rather than estimated:
 *
 *   download      8.5 MB gzipped, once, then content-hashed and cached forever
 *   first run     ~1.3s to instantiate the VM
 *   later runs    ~400ms, because the compiled module stays in the worker
 *
 * The `ruby+stdlib` build is used rather than the 4.7 MB core build. The core one cannot
 * `require 'set'`, and graph algorithms need Set — a learner meeting a LoadError on a
 * standard library would reasonably conclude the platform is broken.
 */
import type { CodeRunner, RunOptions, RunResult } from './types'
import RubyWorker from './ruby-worker?worker'

/** Generous, because the first run includes instantiating the VM. */
const DEFAULT_TIMEOUT = 15_000

interface WorkerReply {
  ok: boolean
  console: RunResult['console']
  value?: unknown
  tests?: RunResult['tests']
  error?: { message: string; line?: number; hint?: string }
  durationMs: number
}

export class RubyRunner implements CodeRunner {
  readonly language = 'ruby' as const
  readonly label = 'Ruby'
  readonly availability = 'local' as const

  /**
   * One worker for the runner's lifetime, so the compiled module is paid for once.
   * It is replaced only when a run has to be killed.
   */
  #worker: Worker | null = null

  #ensureWorker(): Worker {
    this.#worker ??= new RubyWorker()
    return this.#worker
  }

  async run(source: string, options: RunOptions = {}): Promise<RunResult> {
    const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT
    const started = performance.now()

    let worker: Worker
    try {
      worker = this.#ensureWorker()
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
        worker.onmessage = null
        worker.onerror = null
        resolve(result)
      }

      // A runaway loop in WebAssembly cannot be asked to stop, so the thread is killed —
      // and with it the cached module, which the next run pays to rebuild. That is the
      // correct trade: an unstoppable tab is worse than a slow next run.
      const timer = setTimeout(() => {
        worker.terminate()
        this.#worker = null
        finish({
          ok: false,
          console: [],
          error: {
            message: `Stopped after ${timeoutMs}ms.`,
            hint: 'Your code did not finish. An infinite loop, or a recursion with no base case, is the usual cause.',
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
          error: reply.error
            ? { ...reply.error, hint: reply.error.hint ?? hintFor(reply.error.message) }
            : undefined,
          durationMs: reply.durationMs,
          timedOut: false,
        })
      }

      worker.onerror = (event) => {
        // The worker is suspect after an internal error; drop it so the next run is clean.
        worker.terminate()
        this.#worker = null
        finish({
          ok: false,
          console: [],
          error: { message: event.message || 'The Ruby sandbox crashed.' },
          durationMs: performance.now() - started,
          timedOut: false,
        })
      }

      worker.postMessage({ source, tests: options.tests ?? [] })
    })
  }

  dispose(): void {
    this.#worker?.terminate()
    this.#worker = null
  }
}

/**
 * Explain the error rather than echoing it. These are the mistakes that actually stop
 * people writing Ruby, in the words Ruby will have used.
 */
export function hintFor(message: string): string | undefined {
  const m = message.toLowerCase()

  if (m.includes('undefined method')) {
    const receiver = /for an instance of (\w+)|for (nil)/.exec(message)
    if (receiver?.[2] === 'nil' || m.includes('for nil')) {
      return 'The receiver is `nil`, so something earlier returned nothing. Work backwards: which expression produced it? `&.` hides the symptom, not the cause.'
    }
    return `That object does not respond to the method. Check the spelling, and check what the object actually is${receiver?.[1] ? ` — here it is a ${receiver[1]}` : ''} with \`p\` or \`.class\`.`
  }
  if (m.includes('undefined local variable or method')) {
    return 'Ruby has never seen that name. Either it is spelled differently where you assigned it, or it was assigned inside a block or method this line cannot see.'
  }
  if (m.includes('wrong number of arguments')) {
    return 'The method was called with a different number of arguments than it accepts. Ruby counts required positional arguments strictly — a keyword argument is not a positional one.'
  }
  if (m.includes("can't modify frozen") || m.includes('frozenerror')) {
    return 'This object is frozen, so it cannot be changed in place. Build a new object instead — or check whether a frozen string literal is what you are mutating.'
  }
  if (m.includes('stack level too deep')) {
    return 'Infinite recursion: the method calls itself without ever reaching a base case that returns.'
  }
  if (m.includes('divided by 0')) {
    return 'Integer division by zero raises. Guard the denominator, or use floats if an infinite result is acceptable.'
  }
  if (m.includes('unexpected') || m.includes('syntax error')) {
    return 'A syntax error. Look for a missing `end`, an unclosed bracket or string, on or just before the reported line.'
  }
  if (m.includes('no implicit conversion') || m.includes("can't be coerced")) {
    return 'Ruby will not quietly convert between types here. Convert explicitly with `to_s`, `to_i` or `to_f`.'
  }
  if (m.includes('cannot load such file')) {
    const lib = /cannot load such file -- (\S+)/.exec(message)?.[1]
    return `\`${lib ?? 'That library'}\` is not available in this sandbox. The Ruby standard library is present; gems are not, because there is no bundler here.`
  }
  if (m.includes('uninitialized constant')) {
    return 'That constant does not exist yet. Class and module names are constants, so this is usually a typo or a class defined after the line that uses it.'
  }
  return undefined
}
