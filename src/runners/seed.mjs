/**
 * Declarative row generation for SQL playground seeds.
 *
 * The index lesson needs 100,000 rows to make the point that scanning is O(n) and a
 * B-tree descent is not. Writing those rows as literal YAML would be unreviewable, and
 * letting content execute arbitrary code to produce them would mean content authors can
 * run anything in CI. So seeds declare *how* rows are made, from a fixed vocabulary of
 * generators, and this file expands them.
 *
 * Deterministic by construction: the same spec always produces the same rows, so a
 * lesson's stated "rows examined" figures stay true and a diff of generated output is
 * stable.
 */

/** xorshift32 — small, fast, and identical across platforms and Node versions. */
function rng(seed) {
  let state = (seed | 0) || 0x9e3779b9
  return () => {
    state ^= state << 13; state >>>= 0
    state ^= state >>> 17
    state ^= state << 5; state >>>= 0
    return state / 0x100000000
  }
}

/**
 * @param {{count: number, columns: Array<object>}} spec
 * @param {number} columnCount how many columns the table declares
 * @returns {unknown[][]}
 */
export function generateRows(spec, columnCount) {
  const count = Number(spec.count)
  if (!Number.isInteger(count) || count < 1 || count > 1_000_000) {
    throw new Error(`generate.count must be an integer between 1 and 1000000 (got ${spec.count})`)
  }
  const columns = spec.columns ?? []
  if (columns.length !== columnCount) {
    throw new Error(
      `generate.columns has ${columns.length} entries but the table declares ${columnCount} columns`,
    )
  }

  // One RNG per column so adding a column does not reshuffle the others.
  const random = columns.map((c, i) => rng((Number(c.seed) || 0) + i * 7919 + count))

  const rows = new Array(count)
  for (let i = 0; i < count; i++) {
    const row = new Array(columns.length)
    for (let c = 0; c < columns.length; c++) {
      row[c] = valueFor(columns[c], i, count, random[c])
    }
    rows[i] = row
  }
  return rows
}

function valueFor(spec, i, count, rand) {
  switch (spec.kind) {
    // 1, 2, 3, … — for primary keys.
    case 'sequence':
      return (Number(spec.start) || 0) + i * (Number(spec.step) || 1)

    // Repeat a list in order: a, b, c, a, b, c, …
    case 'cycle': {
      const values = spec.values ?? []
      if (values.length === 0) throw new Error('cycle needs values')
      return values[i % values.length]
    }

    // A rare value at exact positions, a common value everywhere else.
    // This is what makes a selectivity demonstration reproducible.
    case 'rare': {
      const at = new Set((spec.at ?? [0]).map(Number))
      return at.has(i) ? spec.value : spec.otherwise
    }

    // Each value for a fixed share of rows, assigned deterministically by position.
    case 'weighted': {
      const values = spec.values ?? []
      const total = values.reduce((n, v) => n + (Number(v.weight) || 0), 0)
      if (total <= 0) throw new Error('weighted needs positive weights')
      // Position-based rather than random, so counts are exact.
      let cursor = (i / count) * total
      for (const v of values) {
        cursor -= Number(v.weight) || 0
        if (cursor < 0) return v.value
      }
      return values[values.length - 1].value
    }

    case 'random_int': {
      const min = Number(spec.min) || 0
      // `Number(undefined)` is NaN, not nullish, so `?? min` would never fire — a spec
      // with no `max` produced NaN rows instead of falling back to `min`.
      const parsedMax = Number(spec.max)
      const max = Number.isFinite(parsedMax) ? parsedMax : min
      return min + Math.floor(rand() * (max - min + 1))
    }

    case 'random_choice': {
      const values = spec.values ?? []
      if (values.length === 0) throw new Error('random_choice needs values')
      return values[Math.floor(rand() * values.length)]
    }

    // "2026-01-01" plus i days (or hours).
    case 'date_series': {
      const start = Date.parse(spec.start ?? '2026-01-01T00:00:00Z')
      if (Number.isNaN(start)) throw new Error(`date_series start "${spec.start}" is not a date`)
      const unit = spec.unit === 'hour' ? 3_600_000 : 86_400_000
      const d = new Date(start + i * unit * (Number(spec.step) || 1))
      return spec.unit === 'hour' ? d.toISOString() : d.toISOString().slice(0, 10)
    }

    case 'template':
      // "user-{i}" → "user-0", "user-1", …
      return String(spec.format ?? '{i}').replace(/\{i\}/g, String(i + (Number(spec.offset) || 0)))

    case 'constant':
      return spec.value ?? null

    default:
      throw new Error(`unknown generator kind "${spec.kind}"`)
  }
}

export const GENERATOR_KINDS = [
  'sequence', 'cycle', 'rare', 'weighted', 'random_int', 'random_choice',
  'date_series', 'template', 'constant',
]

/** Expand every `generate:` block in a seed into literal rows. */
export function expandSeed(seed, where) {
  if (!seed?.tables) return seed
  return {
    ...seed,
    tables: seed.tables.map((table) => {
      if (!table.generate) return table
      try {
        const rows = generateRows(table.generate, table.columns?.length ?? 0)
        const { generate: _drop, ...rest } = table
        return { ...rest, rows: [...(table.rows ?? []), ...rows] }
      } catch (err) {
        throw new Error(`${where}: table "${table.name}" — ${err.message}`, { cause: err })
      }
    }),
  }
}
