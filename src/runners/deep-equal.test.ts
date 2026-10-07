/**
 * The comparison rule exists twice: here as a module (used by the Ruby worker, which is a
 * real module and can import) and inside `worker-source.ts` as a string (the JS worker is
 * built into a Blob URL, so it cannot).
 *
 * Two copies of a rule drift. This is the contract test for them — one shared table of
 * cases, run against both implementations, so they cannot disagree silently.
 */
import { describe, it, expect } from 'vitest'
import { deepEqual } from './deep-equal'
import { JS_WORKER_SOURCE } from './worker-source'

/** Pull the sibling implementation out of the worker source and make it callable. */
function extractWorkerDeepEqual(): (a: unknown, b: unknown) => boolean {
  const start = JS_WORKER_SOURCE.indexOf('function deepEqual')
  expect(start, 'worker source should still define deepEqual').toBeGreaterThan(-1)

  // Walk braces to find the end of the function, so this does not depend on formatting.
  let depth = 0
  let end = -1
  for (let i = JS_WORKER_SOURCE.indexOf('{', start); i < JS_WORKER_SOURCE.length; i++) {
    const ch = JS_WORKER_SOURCE[i]
    if (ch === '{') depth++
    else if (ch === '}') {
      depth--
      if (depth === 0) {
        end = i + 1
        break
      }
    }
  }
  expect(end, 'deepEqual in the worker source should be brace-balanced').toBeGreaterThan(start)

  const source = JS_WORKER_SOURCE.slice(start, end)
  type Comparator = (a: unknown, b: unknown) => boolean

  /*
   * Evaluating our own worker source is the only way to compare the two implementations'
   * *behaviour*, which is the point of a contract test — a textual comparison cannot work,
   * since one copy is TypeScript and the other is plain JS. The input is a build-time
   * constant from this repository, never anything a user supplies.
   */
  // eslint-disable-next-line @typescript-eslint/no-implied-eval
  const factory = new Function(`${source}; return deepEqual`) as () => Comparator
  return factory()
}

/** Cases both implementations must agree on. JSON-expressible, since Ruby arrives as JSON. */
const CASES: Array<{ name: string; a: unknown; b: unknown; equal: boolean }> = [
  { name: 'identical numbers', a: 1, b: 1, equal: true },
  { name: 'different numbers', a: 1, b: 2, equal: false },
  { name: 'float tolerance', a: 0.1 + 0.2, b: 0.3, equal: true },
  { name: 'floats beyond tolerance', a: 0.1, b: 0.2, equal: false },
  { name: 'NaN equals NaN', a: NaN, b: NaN, equal: true },
  { name: 'strings', a: 'a', b: 'a', equal: true },
  { name: 'string vs number', a: '1', b: 1, equal: false },
  { name: 'booleans', a: true, b: true, equal: true },
  { name: 'true vs 1', a: true, b: 1, equal: false },
  { name: 'null equals null', a: null, b: null, equal: true },
  { name: 'null vs undefined', a: null, b: undefined, equal: false },
  { name: 'arrays', a: [1, 2, 3], b: [1, 2, 3], equal: true },
  { name: 'arrays, different order', a: [1, 2], b: [2, 1], equal: false },
  { name: 'arrays, different length', a: [1], b: [1, 2], equal: false },
  { name: 'nested arrays', a: [[1], [2, [3]]], b: [[1], [2, [3]]], equal: true },
  { name: 'empty arrays', a: [], b: [], equal: true },
  { name: 'objects', a: { x: 1 }, b: { x: 1 }, equal: true },
  { name: 'objects, key order', a: { x: 1, y: 2 }, b: { y: 2, x: 1 }, equal: true },
  { name: 'objects, extra key', a: { x: 1 }, b: { x: 1, y: 2 }, equal: false },
  { name: 'nested objects', a: { a: { b: [1] } }, b: { a: { b: [1] } }, equal: true },
  { name: 'array vs object', a: [], b: {}, equal: false },
  { name: 'object vs null', a: {}, b: null, equal: false },
]

describe('deepEqual', () => {
  it.each(CASES)('$name', ({ a, b, equal }) => {
    expect(deepEqual(a, b)).toBe(equal)
  })

  it('is symmetric', () => {
    for (const { a, b, equal } of CASES) {
      expect(deepEqual(b, a), `symmetry for ${JSON.stringify([a, b])}`).toBe(equal)
    }
  })
})

describe('contract: the module and the JS worker agree', () => {
  const workerDeepEqual = extractWorkerDeepEqual()

  it.each(CASES)('$name', ({ a, b, equal }) => {
    expect(workerDeepEqual(a, b), 'worker copy disagrees with the module').toBe(equal)
    expect(workerDeepEqual(a, b)).toBe(deepEqual(a, b))
  })
})
