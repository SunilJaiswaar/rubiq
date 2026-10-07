/// <reference lib="webworker" />
/**
 * Ruby worker — real CRuby, compiled to WebAssembly, running in the learner's browser.
 *
 * Why a worker rather than the main thread:
 *   1. There is no cooperative way to interrupt WebAssembly. A `while true; end` can only
 *      be stopped by terminating the thread it is on, which is exactly what the host does.
 *   2. The first boot takes over a second. On the main thread that is a frozen page.
 *
 * Why a fresh VM per run, and why that is affordable:
 *   compiling the 29 MB module takes ~90ms and is done once; the FIRST instantiation costs
 *   ~1.3s and every one after it ~400ms. So the module is cached for the worker's lifetime
 *   and a new VM is built for each run. That matters for correctness rather than tidiness —
 *   a reused VM keeps every class the previous run defined, so a stale `Point = Struct.new`
 *   could make a hidden test pass that should have failed. Grading has to be sound, and
 *   400ms is a fair price for it.
 *
 * Why the learner's code is evaluated on its own:
 *   wrapping it in a begin/rescue would shift every line number, so a syntax error on their
 *   line 3 would be reported somewhere else. Instead the prelude, the learner's code and the
 *   collection step are three separate evals, and `eval:N` in a backtrace is their N.
 */
import { DefaultRubyVM } from '@ruby/wasm-wasi/dist/browser'
import rubyWasmUrl from '@ruby/3.4-wasm-wasi/dist/ruby+stdlib.wasm?url'
import { deepEqual } from './deep-equal'

interface TestSpec {
  id: string
  name: string
  call: string
  expect: unknown
  hidden: boolean
}

interface Request {
  source: string
  tests: TestSpec[]
}

/** Redirect stdout into a buffer we can read back, and define the JSON helper. */
const PRELUDE = `
require 'json'
require 'stringio'
$__rubiq_out = StringIO.new
$stdout = $__rubiq_out

# Serialise a value for comparison in JavaScript. Most exercise answers are
# JSON-expressible; anything else (a Struct, a custom object) falls back to #inspect
# so the learner sees something meaningful rather than an internal error.
def __rubiq_dump(value)
  JSON.generate([value])
rescue StandardError, NotImplementedError
  JSON.generate([value.inspect])
end
`

/** Flush the captured stdout and hand it back as JSON. */
const COLLECT = `
$stdout = STDOUT
JSON.generate({ 'out' => $__rubiq_out.string })
`

let modulePromise: Promise<WebAssembly.Module> | null = null

/** Compile once per worker; every run instantiates from the cached module. */
function compiled(): Promise<WebAssembly.Module> {
  modulePromise ??= (async () => {
    const response = await fetch(rubyWasmUrl)
    if (!response.ok) {
      throw new Error(`Could not download the Ruby runtime (HTTP ${response.status}).`)
    }
    // compileStreaming avoids buffering 29 MB before compilation starts.
    return WebAssembly.compileStreaming(response)
  })()
  return modulePromise
}

/**
 * ruby.wasm throws a JS Error whose message carries the Ruby exception and a
 * `eval:LINE:in '...'` prefix. Pull the useful parts out of it.
 */
function parseRubyError(err: unknown): { message: string; line?: number } {
  const raw = err instanceof Error ? err.message : String(err)
  const line = /eval:(\d+)/.exec(raw)?.[1]
  // Drop the leading location so the learner reads the error, not our eval's name.
  const message = raw
    .split('\n')[0]!
    .replace(/^.*?eval:\d+:in\s+'[^']*':\s*/, '')
    .replace(/^.*?eval:\d+:\s*/, '')
    .trim()
  return { message: message || raw, ...(line ? { line: Number(line) } : {}) }
}

self.onmessage = async (event: MessageEvent<Request>) => {
  const { source, tests } = event.data
  const started = performance.now()
  const consoleLines: Array<{ stream: 'log' | 'error'; text: string }> = []

  const reply = (body: Record<string, unknown>) => {
    self.postMessage({ console: consoleLines, durationMs: performance.now() - started, ...body })
  }

  let vm: Awaited<ReturnType<typeof DefaultRubyVM>>['vm']
  try {
    const module = await compiled()
    vm = (await DefaultRubyVM(module)).vm
    vm.eval(PRELUDE)
  } catch (err) {
    reply({
      ok: false,
      error: {
        message: 'The Ruby runtime could not start.',
        hint: err instanceof Error ? err.message : String(err),
      },
    })
    return
  }

  // ---- the learner's code, evaluated alone so line numbers are theirs ----
  let failure: { message: string; line?: number } | null = null
  let value: unknown
  try {
    const result = vm.eval(source)
    // `toString` on a Ruby object calls #to_s. Only used for display.
    value = result.toString()
  } catch (err) {
    failure = parseRubyError(err)
  }

  // ---- tests, each isolated so one raise does not hide the rest ----
  let outcomes: Array<Record<string, unknown>> | undefined
  if (!failure && tests.length > 0) {
    outcomes = tests.map((test) => {
      try {
        const json = vm.eval(`__rubiq_dump(begin\n${test.call}\nend)`).toString()
        const actual = (JSON.parse(json) as unknown[])[0]
        return {
          id: test.id,
          name: test.name,
          passed: deepEqual(actual, test.expect),
          expected: test.expect,
          actual: actual ?? null,
          error: null,
          hidden: test.hidden,
        }
      } catch (err) {
        return {
          id: test.id,
          name: test.name,
          passed: false,
          expected: test.expect,
          actual: null,
          error: parseRubyError(err).message,
          hidden: test.hidden,
        }
      }
    })
  }

  // ---- whatever the code printed ----
  try {
    const collected = JSON.parse(vm.eval(COLLECT).toString()) as { out: string }
    for (const line of collected.out.split('\n')) {
      if (line !== '') consoleLines.push({ stream: 'log', text: line })
    }
  } catch {
    // Losing captured output must not turn a working run into a failed one.
  }

  reply({
    ok: !failure && (outcomes ?? []).every((o) => o['passed'] !== false),
    value: failure ? undefined : value,
    tests: outcomes,
    error: failure ?? undefined,
  })
}
