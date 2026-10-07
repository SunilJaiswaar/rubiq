/**
 * Structural equality for exercise grading.
 *
 * Extracted so that every runner compares values the same way. The JS worker runs as a
 * stringified source (it is built into a Blob URL, so it cannot import), which means this
 * logic exists twice — and two copies of a comparison rule is exactly the drift a contract
 * test is for. `deep-equal.test.ts` runs both implementations over one shared table of
 * cases, so the copies cannot disagree without a test failing.
 *
 * Numbers compare with a tolerance because an exercise expecting 0.3 should accept
 * 0.1 + 0.2, which in IEEE 754 is not 0.3.
 */
export function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true
  if (typeof a !== typeof b) return false
  if (a === null || b === null) return false

  if (typeof a === 'number' && typeof b === 'number') {
    return Number.isNaN(a) && Number.isNaN(b) ? true : Math.abs(a - b) < 1e-9
  }
  if (typeof a !== 'object') return false

  if (Array.isArray(a) !== Array.isArray(b)) return false
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((v, i) => deepEqual(v, b[i]))
  }

  if (a instanceof Map && b instanceof Map) {
    if (a.size !== b.size) return false
    for (const [k, v] of a) {
      if (!b.has(k) || !deepEqual(v, b.get(k))) return false
    }
    return true
  }
  if (a instanceof Set && b instanceof Set) {
    if (a.size !== b.size) return false
    for (const v of a) if (!b.has(v)) return false
    return true
  }

  const ao = a as Record<string, unknown>
  const bo = b as Record<string, unknown>
  const ak = Object.keys(ao)
  const bk = Object.keys(bo)
  return ak.length === bk.length && ak.every((k) => deepEqual(ao[k], bo[k]))
}
