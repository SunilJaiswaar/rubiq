/**
 * The JavaScript sandbox, as a string compiled into a Blob Worker at runtime.
 *
 * Why a string rather than a `?worker` import: the worker must be created from a Blob
 * URL. A Blob worker has an opaque origin, which means `fetch` to our own origin is
 * cross-origin and blocked, and it has no access to the page's DOM, storage or cookies.
 * That is the isolation we want for code a learner typed.
 *
 * Containment, in layers:
 *   1. Worker scope — no `window`, no `document`, no DOM.
 *   2. Blob/opaque origin — same-origin fetch and storage are unavailable.
 *   3. Dangerous globals are deleted before user code is evaluated.
 *   4. The host terminates the worker on a timeout, so an infinite loop cannot hang the tab.
 *
 * This is a teaching sandbox, not a security boundary against a determined attacker.
 * It does not need to be: the code being run is the learner's own, it never leaves their
 * machine, and there is no server to attack (see ARCHITECTURE.md §6).
 */
export const JS_WORKER_SOURCE = String.raw`
// --- strip the parts of the worker API user code has no business touching ---
for (const name of [
  'fetch', 'XMLHttpRequest', 'WebSocket', 'EventSource', 'importScripts',
  'indexedDB', 'caches', 'Notification', 'SharedWorker', 'Worker',
  'navigator', 'BroadcastChannel',
]) {
  try { delete self[name] } catch (_) { /* some are non-configurable; the scope still lacks DOM */ }
}

const MAX_LINES = 500
const MAX_LEN = 2000

function render(value, depth = 0, seen = new WeakSet()) {
  if (depth > 4) return '…'
  if (value === null) return 'null'
  if (value === undefined) return 'undefined'
  const t = typeof value
  if (t === 'string') return depth === 0 ? value : JSON.stringify(value)
  if (t === 'number' || t === 'boolean' || t === 'bigint') return String(value)
  if (t === 'symbol') return value.toString()
  if (t === 'function') return '[Function' + (value.name ? ': ' + value.name : '') + ']'
  if (value instanceof Error) return value.name + ': ' + value.message
  if (value instanceof Map) {
    return 'Map(' + value.size + ') {' +
      [...value.entries()].slice(0, 20).map(([k, v]) =>
        ' ' + render(k, depth + 1, seen) + ' => ' + render(v, depth + 1, seen)).join(',') + ' }'
  }
  if (value instanceof Set) {
    return 'Set(' + value.size + ') {' +
      [...value].slice(0, 20).map((v) => ' ' + render(v, depth + 1, seen)).join(',') + ' }'
  }
  if (t === 'object') {
    if (seen.has(value)) return '[Circular]'
    seen.add(value)
    if (Array.isArray(value)) {
      const items = value.slice(0, 50).map((v) => render(v, depth + 1, seen))
      if (value.length > 50) items.push('… ' + (value.length - 50) + ' more')
      return '[ ' + items.join(', ') + ' ]'
    }
    const keys = Object.keys(value).slice(0, 30)
    const body = keys.map((k) => k + ': ' + render(value[k], depth + 1, seen)).join(', ')
    const name = value.constructor && value.constructor.name !== 'Object'
      ? value.constructor.name + ' ' : ''
    return name + '{ ' + body + (Object.keys(value).length > 30 ? ', …' : '') + ' }'
  }
  return String(value)
}

/** Structural equality, so a test expecting [1,2,3] accepts a fresh array. */
function deepEqual(a, b) {
  if (a === b) return true
  if (typeof a !== typeof b) return false
  if (a === null || b === null) return false
  if (typeof a === 'number' && typeof b === 'number') {
    return Number.isNaN(a) && Number.isNaN(b) ? true : Math.abs(a - b) < 1e-9
  }
  if (typeof a !== 'object') return false
  if (Array.isArray(a) !== Array.isArray(b)) return false
  if (Array.isArray(a)) {
    return a.length === b.length && a.every((v, i) => deepEqual(v, b[i]))
  }
  if (a instanceof Map && b instanceof Map) {
    if (a.size !== b.size) return false
    for (const [k, v] of a) { if (!b.has(k) || !deepEqual(v, b.get(k))) return false }
    return true
  }
  if (a instanceof Set && b instanceof Set) {
    if (a.size !== b.size) return false
    for (const v of a) if (!b.has(v)) return false
    return true
  }
  const ak = Object.keys(a), bk = Object.keys(b)
  return ak.length === bk.length && ak.every((k) => deepEqual(a[k], b[k]))
}

self.onmessage = (event) => {
  const { source, tests } = event.data
  const lines = []
  const push = (stream, args) => {
    if (lines.length >= MAX_LINES) return
    const text = args.map((a) => render(a)).join(' ')
    lines.push({ stream, text: text.length > MAX_LEN ? text.slice(0, MAX_LEN) + ' …(truncated)' : text })
    if (lines.length === MAX_LINES) {
      lines.push({ stream: 'warn', text: 'Output stopped after ' + MAX_LINES + ' lines.' })
    }
  }

  const sandboxConsole = {
    log: (...a) => push('log', a),
    info: (...a) => push('info', a),
    warn: (...a) => push('warn', a),
    error: (...a) => push('error', a),
    debug: (...a) => push('log', a),
    table: (...a) => push('log', a),
  }

  const started = Date.now()
  let value, ok = true, error = null, outcomes = null

  try {
    // User code runs inside a function so top-level declarations do not leak into the
    // worker scope between runs. \`exports\` gives tests something to call.
    const exportsObj = {}
    const fn = new Function(
      'console', 'exports', 'module',
      '"use strict";\n' + source + '\n;return (typeof __last !== "undefined") ? __last : undefined;'
    )
    value = fn(sandboxConsole, exportsObj, { exports: exportsObj })

    if (tests && tests.length) {
      outcomes = tests.map((t) => {
        try {
          // The test expression is evaluated with the learner's declarations in scope.
          const runner = new Function(
            'console', 'exports', 'module',
            '"use strict";\n' + source + '\n;return (' + t.call + ');'
          )
          const actual = runner(sandboxConsole, exportsObj, { exports: exportsObj })
          return {
            id: t.id, name: t.name, passed: deepEqual(actual, t.expect),
            expected: t.expect, actual: actual === undefined ? null : JSON.parse(JSON.stringify(actual ?? null)),
            error: null, hidden: !!t.hidden,
          }
        } catch (e) {
          return {
            id: t.id, name: t.name, passed: false, expected: t.expect, actual: null,
            error: (e && e.message) ? e.message : String(e), hidden: !!t.hidden,
          }
        }
      })
    }
  } catch (e) {
    ok = false
    const message = (e && e.message) ? e.message : String(e)
    // new Function() offsets line numbers by 2 (the "use strict" preamble).
    let line
    const m = /<anonymous>:(\d+):/.exec((e && e.stack) || '')
    if (m) line = Math.max(1, Number(m[1]) - 2)
    error = { message, line }
  }

  self.postMessage({
    ok,
    console: lines,
    value: ok ? render(value) : undefined,
    tests: outcomes,
    error,
    durationMs: Date.now() - started,
    timedOut: false,
  })
}
`
