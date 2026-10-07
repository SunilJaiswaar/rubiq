/**
 * A small relational engine, written here rather than imported.
 *
 * Why not sql.js (SQLite compiled to WASM)? Because of what the brief actually asks for
 * in §13: the learner should *see* that a query without an index scans 100,000 rows and
 * with an index does not. SQLite will happily tell you its plan, but it will not let a
 * lesson toggle an index off and show the row count change in a way we control, and it
 * costs ~1.5 MB of WASM on a platform that must feel fast on a slow connection.
 *
 * So this engine supports the SQL a learner meets in the first several lessons —
 * SELECT with projection, WHERE, JOIN, GROUP BY/HAVING, ORDER BY, LIMIT, aggregates —
 * and *reports its own cost*: rows scanned, whether an index was used, and a plan.
 * That instrumentation is the pedagogical point.
 *
 * Its limits are stated honestly in the UI: this is a teaching engine, not PostgreSQL.
 * Lessons that need real database behaviour link to a real database.
 */
import type { CodeRunner, RunOptions, RunResult, TableResult, Language } from './types'

interface Column { name: string; type: string }
interface Table {
  name: string
  columns: Column[]
  rows: unknown[][]
  indexes: Set<string>
}

type Row = Record<string, unknown>

/**
 * How the evaluator reads a column out of "a row".
 *
 * Two implementations, for one specific reason: materialising every row of a table into
 * an object *before* filtering costs an allocation and one property write per column per
 * row. On the index lesson's 100,000-row table that was ~800,000 property writes and
 * three seconds of wall clock for the demo the whole track is built around.
 *
 * `ArrayRow` reads straight out of the stored array via a column-index map, and the scan
 * reuses a single instance — so filtering 100,000 rows allocates one object rather than
 * 100,000. Rows that survive the filter are materialised as objects, because the later
 * stages (joins, grouping, projection) are far simpler against a plain record and by
 * then there are few rows left.
 *
 * This is predicate pushdown, which is exactly what a real planner does and for exactly
 * the same reason.
 */
interface RowAccess {
  get(ref: string): unknown
  names(): string[]
}

/** Zero-allocation view over a stored row. Mutate `values` and reuse. */
class ArrayRow implements RowAccess {
  values: unknown[] = []

  constructor(
    private readonly index: Map<string, number>,
    private readonly columnNames: string[],
  ) {}

  get(ref: string): unknown {
    const clean = ref.replace(/"/g, '')
    let at = this.index.get(clean)
    if (at === undefined && clean.includes('.')) {
      at = this.index.get(clean.split('.').pop() as string)
    }
    if (at === undefined) {
      throw new SqlError(
        `There is no column called \`${ref}\`.`,
        `Available columns: ${this.columnNames.join(', ')}`,
      )
    }
    return this.values[at] ?? null
  }

  names(): string[] {
    return this.columnNames
  }
}

/** Adapter for the materialised rows used after the scan. */
class ObjectRow implements RowAccess {
  constructor(public row: Row) {}
  get(ref: string): unknown {
    return lookup(this.row, ref)
  }
  names(): string[] {
    return Object.keys(this.row)
  }
}

/** Column name → position, under both the bare and the table-qualified name. */
function columnIndexFor(table: Table): Map<string, number> {
  const index = new Map<string, number>()
  table.columns.forEach((column, i) => {
    index.set(column.name, i)
    index.set(`${table.name}.${column.name}`, i)
  })
  return index
}

/* ----------------------------------------------------------------- parsing */

interface ParsedQuery {
  select: Array<{ expr: string; alias: string | null; agg: string | null; column: string | null }>
  from: string | null
  joins: Array<{ table: string; left: string; right: string; kind: 'inner' | 'left' }>
  where: string | null
  groupBy: string[]
  having: string | null
  orderBy: Array<{ column: string; dir: 'asc' | 'desc' }>
  limit: number | null
  distinct: boolean
}

class SqlError extends Error {
  constructor(message: string, readonly hint?: string) {
    super(message)
  }
}

/**
 * Remove SQL comments before parsing.
 *
 * Done with a scan rather than a regex because `--` and `/*` inside a string literal
 * are data, not comments: `WHERE note = 'a -- b'` must survive intact. A regex cannot
 * tell those apart, and the failure is silent — the query quietly loses its tail.
 */
export function stripComments(sql: string): string {
  let out = ''
  let i = 0
  let inString = false

  while (i < sql.length) {
    const ch = sql[i] as string
    const next = sql[i + 1]

    if (inString) {
      out += ch
      // '' is an escaped quote inside a string, not the end of it.
      if (ch === "'" && next === "'") { out += next; i += 2; continue }
      if (ch === "'") inString = false
      i++
      continue
    }

    if (ch === "'") { inString = true; out += ch; i++; continue }

    if (ch === '-' && next === '-') {
      // Line comment: skip to the newline, keeping the newline so tokens stay apart.
      while (i < sql.length && sql[i] !== '\n') i++
      continue
    }

    if (ch === '/' && next === '*') {
      i += 2
      while (i < sql.length && !(sql[i] === '*' && sql[i + 1] === '/')) i++
      i += 2
      // Replace the comment with a space so `a/* x */b` does not become `ab`.
      out += ' '
      continue
    }

    out += ch
    i++
  }

  return out
}

function parse(sql: string): ParsedQuery {
  const text = stripComments(sql).trim().replace(/;+\s*$/, '').trim()

  if (text.length === 0) {
    throw new SqlError(
      'There is no query to run.',
      'The editor is empty, or contains only comments.',
    )
  }

  if (!/^select\b/i.test(text)) {
    throw new SqlError(
      'This engine only runs SELECT statements.',
      'Lessons that need INSERT, UPDATE or schema changes use a seeded table instead — look for the table definition above the editor.',
    )
  }

  const section = (name: string, stop: string[]): string | null => {
    // With no following clause there is nothing to stop at, so the lookahead must be
    // end-of-string alone. An empty alternation `(?:)` matches at offset 0 and would
    // make every such section come back empty — which silently broke LIMIT.
    const lookahead = stop.length > 0 ? `(?=\\b(?:${stop.join('|')})\\b|$)` : '(?=$)'
    const re = new RegExp(`\\b${name}\\b([\\s\\S]*?)${lookahead}`, 'i')
    return re.exec(text)?.[1]?.trim() ?? null
  }

  const STOPS = ['from', 'where', 'group\\s+by', 'having', 'order\\s+by', 'limit', 'inner\\s+join', 'left\\s+join', 'join']

  const selectRaw = section('select', STOPS)
  if (!selectRaw) throw new SqlError('Could not find the column list after SELECT.')

  const distinct = /^distinct\b/i.test(selectRaw)
  const projections = (distinct ? selectRaw.replace(/^distinct\b/i, '') : selectRaw)
    .split(/,(?![^(]*\))/)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((raw) => {
      const aliasMatch = /\s+as\s+([\w"]+)$/i.exec(raw)
      const alias = aliasMatch ? aliasMatch[1]!.replace(/"/g, '') : null
      const expr = aliasMatch ? raw.slice(0, aliasMatch.index).trim() : raw
      const aggMatch = /^(count|sum|avg|min|max)\s*\(\s*(.*?)\s*\)$/i.exec(expr)
      return {
        expr,
        alias,
        agg: aggMatch ? aggMatch[1]!.toLowerCase() : null,
        column: aggMatch ? (aggMatch[2] ?? null) : null,
      }
    })

  const fromRaw = section('from', STOPS.filter((s) => s !== 'from'))
  const from = fromRaw ? (fromRaw.split(/\s+/)[0]?.replace(/"/g, '') ?? null) : null

  const joins: ParsedQuery['joins'] = []
  const joinRe = /\b(inner\s+join|left\s+(?:outer\s+)?join|join)\s+([\w"]+)(?:\s+(?:as\s+)?[\w"]+)?\s+on\s+([\w".]+)\s*=\s*([\w".]+)/gi
  for (const m of text.matchAll(joinRe)) {
    joins.push({
      table: m[2]!.replace(/"/g, ''),
      left: m[3]!.replace(/"/g, ''),
      right: m[4]!.replace(/"/g, ''),
      kind: /left/i.test(m[1]!) ? 'left' : 'inner',
    })
  }

  const limitRaw = section('limit', [])
  const orderRaw = section('order\\s+by', ['limit'])

  return {
    select: projections,
    from,
    joins,
    where: section('where', ['group\\s+by', 'having', 'order\\s+by', 'limit']),
    groupBy: (section('group\\s+by', ['having', 'order\\s+by', 'limit']) ?? '')
      .split(',').map((s) => s.trim().replace(/"/g, '')).filter(Boolean),
    having: section('having', ['order\\s+by', 'limit']),
    orderBy: (orderRaw ?? '')
      .split(',').map((s) => s.trim()).filter(Boolean)
      .map((part) => {
        const [col = '', dir = 'asc'] = part.split(/\s+/)
        return { column: col.replace(/"/g, ''), dir: /desc/i.test(dir) ? 'desc' as const : 'asc' as const }
      }),
    limit: limitRaw ? Number(limitRaw.split(/\s+/)[0]) : null,
    distinct,
  }
}

/* -------------------------------------------------------------- evaluation */

/**
 * Compile a WHERE/HAVING predicate into a function, once.
 *
 * The obvious implementation evaluates the expression string against each row — and that
 * is what this did first. It meant re-running several regexes, a paren-aware split and a
 * literal parse for *every row*, which cost ~3 seconds on the index lesson's 100,000-row
 * table. All of that work depends only on the expression, not on the data.
 *
 * So the expression is parsed once into a tree of closures and the per-row cost drops to
 * a column read and a comparison. A `LIKE` pattern becomes a compiled RegExp once rather
 * than 100,000 times. This is the same reason real databases have a planning phase
 * separate from execution, which makes it a useful thing for the SQL track to be honest
 * about rather than quietly slow.
 */
type Predicate = (row: RowAccess) => boolean

function compilePredicate(expr: string): Predicate {
  // OR binds loosest, so it splits first.
  const ors = splitTop(expr, /\s+(or)\s+/i)
  if (ors.length > 1) {
    const parts = ors.map(compilePredicate)
    return (row) => parts.some((part) => part(row))
  }

  const ands = splitTop(expr, /\s+(and)\s+/i)
  if (ands.length > 1) {
    const parts = ands.map(compilePredicate)
    return (row) => parts.every((part) => part(row))
  }

  const trimmed = expr.trim()

  if (/^not\s+/i.test(trimmed)) {
    const inner = compilePredicate(trimmed.replace(/^not\s+/i, ''))
    return (row) => !inner(row)
  }

  if (trimmed.startsWith('(') && trimmed.endsWith(')')) {
    return compilePredicate(trimmed.slice(1, -1))
  }

  const nullMatch = /^([\w".]+)\s+is\s+(not\s+)?null$/i.exec(trimmed)
  if (nullMatch) {
    const ref = nullMatch[1] as string
    const negate = Boolean(nullMatch[2])
    return (row) => {
      const value = row.get(ref)
      const isNull = value === null || value === undefined
      return negate ? !isNull : isNull
    }
  }

  const inMatch = /^([\w".]+)\s+(not\s+)?in\s*\((.*)\)$/i.exec(trimmed)
  if (inMatch) {
    const ref = inMatch[1] as string
    const negate = Boolean(inMatch[2])
    // The set is parsed once, not per row.
    const set = (inMatch[3] as string).split(',').map((part) => literal(part.trim()))
    return (row) => {
      const value = row.get(ref)
      const hit = set.some((candidate) => looseEq(candidate, value))
      return negate ? !hit : hit
    }
  }

  const likeMatch = /^([\w".]+)\s+(not\s+)?like\s+(.+)$/i.exec(trimmed)
  if (likeMatch) {
    const ref = likeMatch[1] as string
    const negate = Boolean(likeMatch[2])
    const pattern = asText(literal((likeMatch[3] as string).trim()))
    // One RegExp for the whole scan.
    const re = new RegExp(
      '^' +
        pattern
          .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
          .replace(/%/g, '.*')
          .replace(/_/g, '.') +
        '$',
      'i',
    )
    return (row) => {
      const hit = re.test(asText(row.get(ref)))
      return negate ? !hit : hit
    }
  }

  const cmp = /^(.+?)\s*(<>|!=|>=|<=|=|>|<)\s*(.+)$/.exec(trimmed)
  if (!cmp) throw new SqlError(`Could not understand the condition \`${trimmed}\`.`)

  const leftToken = (cmp[1] as string).trim()
  const rightToken = (cmp[3] as string).trim()
  const op = cmp[2] as string

  // Decide literal-vs-column once, and parse any literal once.
  const leftLiteral = isLiteral(leftToken) ? literal(leftToken) : undefined
  const rightLiteral = isLiteral(rightToken) ? literal(rightToken) : undefined
  const leftIsLiteral = isLiteral(leftToken)
  const rightIsLiteral = isLiteral(rightToken)

  return (row) => {
    const left = leftIsLiteral ? leftLiteral : row.get(leftToken)
    const right = rightIsLiteral ? rightLiteral : row.get(rightToken)

    // SQL three-valued logic: a comparison involving NULL is never TRUE.
    if (left === null || left === undefined || right === null || right === undefined) {
      return false
    }

    switch (op) {
      case '=': return looseEq(left, right)
      case '!=': case '<>': return !looseEq(left, right)
      case '>': return compare(left, right) > 0
      case '<': return compare(left, right) < 0
      case '>=': return compare(left, right) >= 0
      case '<=': return compare(left, right) <= 0
      default: return false
    }
  }
}

/** Split on a top-level operator, ignoring anything inside parentheses. */
function splitTop(expr: string, re: RegExp): string[] {
  const parts: string[] = []
  let depth = 0
  let current = ''
  const source = expr
  let i = 0
  while (i < source.length) {
    const ch = source[i]!
    if (ch === '(') depth++
    if (ch === ')') depth--
    if (depth === 0) {
      const rest = source.slice(i)
      const m = new RegExp('^' + re.source, re.flags.replace('g', '')).exec(rest)
      if (m) {
        parts.push(current)
        current = ''
        i += m[0].length
        continue
      }
    }
    current += ch
    i++
  }
  parts.push(current)
  return parts.map((p) => p.trim()).filter(Boolean)
}

function literal(token: string): unknown {
  const t = token.trim()
  if (/^'(.*)'$/s.test(t)) return t.slice(1, -1).replace(/''/g, "'")
  if (/^-?\d+(\.\d+)?$/.test(t)) return Number(t)
  if (/^true$/i.test(t)) return true
  if (/^false$/i.test(t)) return false
  if (/^null$/i.test(t)) return null
  return t
}

function isLiteral(token: string): boolean {
  const t = token.trim()
  return /^'/.test(t) || /^-?\d/.test(t) || /^(true|false|null)$/i.test(t)
}


/** `users.name` and `name` both resolve; qualified wins when both exist. */
function lookup(row: Row, ref: string): unknown {
  const clean = ref.replace(/"/g, '')
  if (clean in row) return row[clean]
  const bare = clean.includes('.') ? clean.split('.').pop()! : clean
  if (bare in row) return row[bare]
  // Try any qualified key ending in `.bare`.
  const key = Object.keys(row).find((k) => k.endsWith('.' + bare))
  if (key) return row[key]
  throw new SqlError(
    `There is no column called \`${ref}\`.`,
    `Available columns: ${Object.keys(row).join(', ')}`,
  )
}

/**
 * Coerce a cell to text for pattern matching. Only scalars are meaningful here, so
 * anything else becomes an empty string rather than "[object Object]" — which would
 * make LIKE silently match nothing in a way nobody could debug.
 */
function asText(value: unknown): string {
  if (value === null || value === undefined) return ''
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') {
    return String(value)
  }
  return ''
}

const looseEq = (a: unknown, b: unknown): boolean =>
  typeof a === 'string' && typeof b === 'string'
    ? a.toLowerCase() === b.toLowerCase()
    : a === b || Number(a) === Number(b)

function compare(a: unknown, b: unknown): number {
  if (typeof a === 'number' && typeof b === 'number') return a - b
  const na = Number(a), nb = Number(b)
  if (!Number.isNaN(na) && !Number.isNaN(nb)) return na - nb
  return String(a).localeCompare(String(b))
}

/* ------------------------------------------------------------------ engine */

export class SqlRunner implements CodeRunner {
  readonly language = 'sql' as const satisfies Language
  readonly label = 'SQL'
  readonly availability = 'local' as const

  #tables = new Map<string, Table>()

  /** Lessons seed tables; `indexes` is what makes the index demo possible. */
  seed(seed: NonNullable<RunOptions['seed']>, indexes: Record<string, string[]> = {}): void {
    this.#tables.clear()
    for (const t of seed.tables) {
      this.#tables.set(t.name.toLowerCase(), {
        name: t.name,
        columns: t.columns,
        rows: t.rows,
        indexes: new Set(indexes[t.name] ?? []),
      })
    }
  }

  setIndex(table: string, column: string, enabled: boolean): void {
    const t = this.#tables.get(table.toLowerCase())
    if (!t) return
    if (enabled) t.indexes.add(column)
    else t.indexes.delete(column)
  }

  get tables(): Array<{ name: string; columns: Column[]; rowCount: number; indexes: string[] }> {
    return [...this.#tables.values()].map((t) => ({
      name: t.name, columns: t.columns, rowCount: t.rows.length, indexes: [...t.indexes],
    }))
  }

  async run(sql: string, options: RunOptions = {}): Promise<RunResult> {
    const started = performance.now()
    if (options.seed) this.seed(options.seed)

    try {
      const table = this.#execute(sql)
      return {
        ok: true,
        console: [],
        table,
        durationMs: performance.now() - started,
        timedOut: false,
      }
    } catch (err) {
      const e = err as SqlError
      return {
        ok: false,
        console: [],
        error: { message: e.message, hint: e.hint },
        durationMs: performance.now() - started,
        timedOut: false,
      }
    }
  }

  #execute(sql: string): TableResult {
    const q = parse(sql)
    if (!q.from) throw new SqlError('This query has no FROM clause, so there is no table to read.')

    const base = this.#tables.get(q.from.toLowerCase())
    if (!base) {
      throw new SqlError(
        `There is no table called \`${q.from}\`.`,
        `This exercise has: ${[...this.#tables.keys()].join(', ') || 'no tables'}`,
      )
    }

    const plan: string[] = []
    let rowsScanned = 0

    // --- scan, with index awareness so the cost is visible ---
    const indexedEquality = q.where ? findIndexableEquality(q.where, base) : null

    // Column positions for the base table, resolved once rather than per row.
    const baseIndex = columnIndexFor(base)
    const baseNames = base.columns.map((c) => c.name)

    // Parse the predicates once. Everything below applies them; nothing re-parses.
    const wherePredicate = q.where ? compilePredicate(q.where) : null
    const havingPredicate = q.having ? compilePredicate(q.having) : null

    let rows: Row[]
    // True once the WHERE clause has already been applied during the scan, so the
    // generic filter stage below does not redo the work.
    let whereApplied = false

    if (indexedEquality) {
      // Simulated B-tree lookup: log2(n) descent plus the matching rows.
      const at = baseIndex.get(indexedEquality.column)
      const matching = base.rows
        .filter((values) => looseEq(at === undefined ? null : values[at], indexedEquality.value))
        .map((values) => toRow(base, values))
      // B-tree cost: descend the tree, then read the matching leaf entries.
      const descent = Math.ceil(Math.log2(base.rows.length + 1))
      rowsScanned = descent + matching.length
      rows = matching
      plan.push(
        `Index Scan using idx_${base.name}_${indexedEquality.column} on ${base.name}`,
        `  Index Cond: (${indexedEquality.column} = ${JSON.stringify(indexedEquality.value)})`,
        `  Rows examined: ${rowsScanned} of ${base.rows.length}` +
          ` (${descent} to walk the index + ${matching.length} matched)`,
      )
      // Be honest when the index did not actually pay for itself. A real planner would
      // have chosen the sequential scan here, and a learner who sees "index = always
      // faster" has learned the wrong lesson.
      if (rowsScanned >= base.rows.length) {
        plan.push(
          `  ⓘ The index did not help: walking it cost as much as reading all ` +
            `${base.rows.length} rows. Indexes pay off as tables grow — a real planner ` +
            `would have ignored this one.`,
        )
      }
    } else {
      rowsScanned = base.rows.length

      // Predicate pushdown. One reusable view, so scanning 100,000 rows allocates one
      // object rather than 100,000 — see the note on RowAccess.
      if (wherePredicate && q.joins.length === 0) {
        const view = new ArrayRow(baseIndex, baseNames)
        const survivors: Row[] = []
        for (const values of base.rows) {
          view.values = values
          if (wherePredicate(view)) survivors.push(toRow(base, values))
        }
        rows = survivors
        whereApplied = true
      } else {
        rows = base.rows.map((r) => toRow(base, r))
      }

      plan.push(
        `Seq Scan on ${base.name}`,
        `  Rows examined: ${rowsScanned} of ${base.rows.length}`,
      )
      if (q.where) {
        const column = /([\w".]+)\s*=/.exec(q.where)?.[1]?.replace(/"/g, '')
        if (column && !base.indexes.has(column)) {
          plan.push(`  ⚠ No index on ${column} — every row had to be read and tested`)
        }
      }
    }

    // --- joins ---
    for (const join of q.joins) {
      const other = this.#tables.get(join.table.toLowerCase())
      if (!other) throw new SqlError(`There is no table called \`${join.table}\`.`)
      const otherRows = other.rows.map((r) => toRow(other, r))
      rowsScanned += otherRows.length
      plan.push(
        `${join.kind === 'left' ? 'Left' : 'Inner'} Join: ${base.name} × ${other.name}`,
        `  Join Cond: ${join.left} = ${join.right}`,
      )

      const joined: Row[] = []
      for (const left of rows) {
        const matches = otherRows.filter((right) => {
          const merged = { ...left, ...right }
          try {
            return looseEq(lookup(merged, join.left), lookup(merged, join.right))
          } catch {
            return false
          }
        })
        if (matches.length === 0 && join.kind === 'left') {
          const nulls = Object.fromEntries(other.columns.map((c) => [`${other.name}.${c.name}`, null]))
          joined.push({ ...left, ...nulls })
        }
        for (const right of matches) joined.push({ ...left, ...right })
      }
      rows = joined
    }

    // --- where ---
    if (wherePredicate && !whereApplied) {
      const before = rows.length
      const view = new ObjectRow({})
      rows = rows.filter((row) => {
        view.row = row
        return wherePredicate(view)
      })
      if (!indexedEquality) plan.push(`  Filter: removed ${before - rows.length} rows`)
    } else if (whereApplied) {
      plan.push(`  Filter: removed ${rowsScanned - rows.length} rows`)
    }

    // --- group by / aggregates ---
    const hasAgg = q.select.some((s) => s.agg)
    let output: Row[]
    let orderApplied = false

    if (q.groupBy.length > 0 || hasAgg) {
      const groups = new Map<string, Row[]>()
      if (q.groupBy.length === 0) {
        groups.set('__all__', rows)
      } else {
        for (const row of rows) {
          const key = q.groupBy.map((g) => String(lookup(row, g))).join('\u0000')
          const bucket = groups.get(key)
          if (bucket) bucket.push(row)
          else groups.set(key, [row])
        }
      }
      plan.push(`${q.groupBy.length ? 'HashAggregate' : 'Aggregate'}: ${groups.size} group(s)`)

      output = [...groups.values()].map((bucket) => {
        const first = bucket[0] ?? {}
        const out: Row = {}
        for (const g of q.groupBy) out[g] = lookup(first, g)
        for (const sel of q.select) {
          if (!sel.agg) {
            if (sel.expr === '*') continue
            const name = sel.alias ?? sel.expr
            if (!(name in out)) out[name] = lookup(first, sel.expr)
            continue
          }
          out[sel.alias ?? sel.expr] = aggregate(sel.agg, sel.column ?? '*', bucket)
        }
        return out
      })

      if (q.having) {
        const view = new ObjectRow({})
        output = output.filter((row) => {
          view.row = row
          return (havingPredicate as Predicate)(view)
        })
        plan.push(`  HAVING: ${output.length} group(s) kept`)
      }
    } else {
      /*
       * Sort BEFORE projecting.
       *
       * `SELECT id FROM events ORDER BY amount` is valid SQL — conceptually the sort
       * happens over the full rows and the projection is the last step. Projecting first
       * means `amount` is gone by the time the sort looks for it, which made a very
       * ordinary query fail with "there is no column called amount".
       *
       * The aggregate branch above is the opposite case: there, ORDER BY may name an
       * aggregate alias (`ORDER BY n DESC`), which only exists *after* the grouping. So
       * each branch sorts at the point where the names it can reference are in scope.
       */
      if (q.orderBy.length > 0) {
        rows = sortRows(rows, q.orderBy)
        plan.push(`Sort: ${describeOrder(q.orderBy)}`)
      }

      // --- projection ---
      const wantsAll = q.select.some((s) => s.expr === '*')
      output = rows.map((row) => {
        if (wantsAll) return stripQualifiers(row)
        const out: Row = {}
        for (const sel of q.select) {
          out[sel.alias ?? sel.expr] = isLiteral(sel.expr) ? literal(sel.expr) : lookup(row, sel.expr)
        }
        return out
      })
      // Already sorted above; do not sort the projected rows again.
      orderApplied = true
    }

    if (q.distinct) {
      const seen = new Set<string>()
      output = output.filter((row) => {
        const key = JSON.stringify(row)
        if (seen.has(key)) return false
        seen.add(key)
        return true
      })
      plan.push(`Unique: ${output.length} distinct row(s)`)
    }

    if (q.orderBy.length > 0 && !orderApplied) {
      output = sortRows(output, q.orderBy)
      plan.push(`Sort: ${describeOrder(q.orderBy)}`)
    }

    if (q.limit !== null && !Number.isNaN(q.limit)) {
      output = output.slice(0, q.limit)
      plan.push(`Limit: ${q.limit}`)
    }

    const columns = output.length > 0 ? Object.keys(output[0] as Row) : columnNamesFor(q, base)
    return {
      columns,
      rows: output.map((row) => columns.map((c) => row[c] ?? null)),
      rowsScanned,
      plan,
    }
  }
}

type OrderBy = Array<{ column: string; dir: 'asc' | 'desc' }>

function sortRows(rows: Row[], orderBy: OrderBy): Row[] {
  return [...rows].sort((a, b) => {
    for (const { column, dir } of orderBy) {
      const delta = compare(lookup(a, column), lookup(b, column))
      if (delta !== 0) return dir === 'desc' ? -delta : delta
    }
    return 0
  })
}

const describeOrder = (orderBy: OrderBy): string =>
  orderBy.map((o) => `${o.column} ${o.dir.toUpperCase()}`).join(', ')

function aggregate(fn: string, column: string, rows: Row[]): unknown {
  if (fn === 'count') {
    return column === '*' ? rows.length : rows.filter((r) => lookup(r, column) != null).length
  }
  // NULLs must be dropped *before* coercion: `Number(null)` is 0, not NaN, so a
  // NULL age would otherwise drag AVG down and make MIN zero.
  const values = rows
    .map((r) => lookup(r, column))
    .filter((v) => v !== null && v !== undefined)
    .map(Number)
    .filter((n) => !Number.isNaN(n))
  if (values.length === 0) return null
  switch (fn) {
    case 'sum': return values.reduce((a, b) => a + b, 0)
    case 'avg': return Number((values.reduce((a, b) => a + b, 0) / values.length).toFixed(4))
    case 'min': return Math.min(...values)
    case 'max': return Math.max(...values)
    default: return null
  }
}

/** Each row is keyed both bare and qualified, so `users.id` and `id` both work. */
function toRow(table: Table, values: unknown[]): Row {
  const row: Row = {}
  table.columns.forEach((col, i) => {
    row[col.name] = values[i] ?? null
    row[`${table.name}.${col.name}`] = values[i] ?? null
  })
  return row
}

function stripQualifiers(row: Row): Row {
  const out: Row = {}
  for (const [key, value] of Object.entries(row)) if (!key.includes('.')) out[key] = value
  return out
}

function columnNamesFor(q: ParsedQuery, base: Table): string[] {
  if (q.select.some((s) => s.expr === '*')) return base.columns.map((c) => c.name)
  return q.select.map((s) => s.alias ?? s.expr)
}

/** Can this WHERE clause be answered by an index? Only simple top-level equality. */
function findIndexableEquality(
  where: string,
  table: Table,
): { column: string; value: unknown } | null {
  if (/\b(or)\b/i.test(where)) return null
  for (const clause of splitTop(where, /\s+(and)\s+/i)) {
    const m = /^([\w"]+)\s*=\s*(.+)$/.exec(clause.trim())
    if (!m) continue
    const column = m[1]!.replace(/"/g, '')
    if (table.indexes.has(column) && isLiteral(m[2]!)) {
      return { column, value: literal(m[2]!) }
    }
  }
  return null
}
