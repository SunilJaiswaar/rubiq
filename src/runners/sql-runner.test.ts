import { describe, it, expect, beforeEach } from 'vitest'
import { SqlRunner } from './sql-runner'

const SEED = {
  tables: [
    {
      name: 'users',
      columns: [
        { name: 'id', type: 'integer' },
        { name: 'name', type: 'text' },
        { name: 'city', type: 'text' },
        { name: 'age', type: 'integer' },
      ],
      rows: [
        [1, 'Asha', 'Pune', 31],
        [2, 'Bo', 'Pune', 24],
        [3, 'Cal', 'Delhi', 45],
        [4, 'Dee', 'Delhi', 24],
        [5, 'Eli', 'Kochi', null],
      ],
    },
    {
      name: 'orders',
      columns: [
        { name: 'id', type: 'integer' },
        { name: 'user_id', type: 'integer' },
        { name: 'total', type: 'integer' },
      ],
      rows: [
        [10, 1, 500],
        [11, 1, 250],
        [12, 3, 900],
      ],
    },
  ],
}

let runner: SqlRunner
beforeEach(() => {
  runner = new SqlRunner()
  runner.seed(SEED)
})

const run = (sql: string) => runner.run(sql)

describe('SELECT', () => {
  it('returns every row and column for SELECT *', async () => {
    const r = await run('SELECT * FROM users')
    expect(r.ok).toBe(true)
    expect(r.table?.columns).toEqual(['id', 'name', 'city', 'age'])
    expect(r.table?.rows).toHaveLength(5)
  })

  it('projects only the requested columns', async () => {
    const r = await run('SELECT name, city FROM users')
    expect(r.table?.columns).toEqual(['name', 'city'])
    expect(r.table?.rows[0]).toEqual(['Asha', 'Pune'])
  })

  it('honours a column alias', async () => {
    const r = await run('SELECT name AS who FROM users LIMIT 1')
    expect(r.table?.columns).toEqual(['who'])
  })

  it('applies DISTINCT', async () => {
    const r = await run('SELECT DISTINCT city FROM users')
    expect(r.table?.rows.map((row) => row[0]).sort()).toEqual(['Delhi', 'Kochi', 'Pune'])
  })
})

describe('WHERE', () => {
  it('filters on equality', async () => {
    const r = await run("SELECT name FROM users WHERE city = 'Pune'")
    expect(r.table?.rows.map((row) => row[0])).toEqual(['Asha', 'Bo'])
  })

  it('filters on a numeric comparison', async () => {
    const r = await run('SELECT name FROM users WHERE age > 30')
    expect(r.table?.rows.map((row) => row[0])).toEqual(['Asha', 'Cal'])
  })

  it('combines conditions with AND', async () => {
    const r = await run("SELECT name FROM users WHERE city = 'Delhi' AND age = 24")
    expect(r.table?.rows.map((row) => row[0])).toEqual(['Dee'])
  })

  it('combines conditions with OR', async () => {
    const r = await run("SELECT name FROM users WHERE city = 'Kochi' OR age = 45")
    expect(r.table?.rows.map((row) => row[0]).sort()).toEqual(['Cal', 'Eli'])
  })

  it('treats a comparison against NULL as not true, like SQL does', async () => {
    const r = await run('SELECT name FROM users WHERE age > 0')
    expect(r.table?.rows.map((row) => row[0])).not.toContain('Eli')
  })

  it('supports IS NULL and IS NOT NULL', async () => {
    const nulls = await run('SELECT name FROM users WHERE age IS NULL')
    expect(nulls.table?.rows.map((row) => row[0])).toEqual(['Eli'])
    const notNulls = await run('SELECT name FROM users WHERE age IS NOT NULL')
    expect(notNulls.table?.rows).toHaveLength(4)
  })

  it('supports IN', async () => {
    const r = await run("SELECT name FROM users WHERE city IN ('Pune', 'Kochi')")
    expect(r.table?.rows).toHaveLength(3)
  })

  it('supports LIKE with % wildcards', async () => {
    const r = await run("SELECT name FROM users WHERE name LIKE 'A%'")
    expect(r.table?.rows.map((row) => row[0])).toEqual(['Asha'])
  })

  it('supports NOT', async () => {
    const r = await run("SELECT name FROM users WHERE NOT city = 'Pune'")
    expect(r.table?.rows).toHaveLength(3)
  })
})

describe('aggregates and GROUP BY', () => {
  it('counts all rows', async () => {
    const r = await run('SELECT COUNT(*) AS n FROM users')
    expect(r.table?.rows).toEqual([[5]])
  })

  it('ignores NULLs in COUNT(column), as SQL does', async () => {
    const r = await run('SELECT COUNT(age) AS n FROM users')
    expect(r.table?.rows).toEqual([[4]])
  })

  it('groups and counts', async () => {
    const r = await run('SELECT city, COUNT(*) AS n FROM users GROUP BY city ORDER BY city')
    expect(r.table?.rows).toEqual([['Delhi', 2], ['Kochi', 1], ['Pune', 2]])
  })

  it('computes SUM, AVG, MIN and MAX', async () => {
    const r = await run('SELECT SUM(age) AS s, AVG(age) AS a, MIN(age) AS mn, MAX(age) AS mx FROM users')
    expect(r.table?.rows[0]).toEqual([124, 31, 24, 45])
  })

  it('filters groups with HAVING, not WHERE', async () => {
    const r = await run('SELECT city, COUNT(*) AS n FROM users GROUP BY city HAVING n > 1 ORDER BY city')
    expect(r.table?.rows).toEqual([['Delhi', 2], ['Pune', 2]])
  })
})

describe('ORDER BY and LIMIT', () => {
  it('sorts ascending by default', async () => {
    const r = await run('SELECT name FROM users ORDER BY name')
    expect(r.table?.rows.map((row) => row[0])).toEqual(['Asha', 'Bo', 'Cal', 'Dee', 'Eli'])
  })

  it('sorts descending', async () => {
    const r = await run('SELECT age FROM users WHERE age IS NOT NULL ORDER BY age DESC')
    expect(r.table?.rows.map((row) => row[0])).toEqual([45, 31, 24, 24])
  })

  it('limits the result set', async () => {
    const r = await run('SELECT name FROM users ORDER BY name LIMIT 2')
    expect(r.table?.rows).toHaveLength(2)
  })
})

describe('JOIN', () => {
  it('inner joins and drops unmatched rows', async () => {
    const r = await run(
      'SELECT users.name, orders.total FROM users JOIN orders ON users.id = orders.user_id ORDER BY orders.total',
    )
    expect(r.table?.rows).toEqual([['Asha', 250], ['Asha', 500], ['Cal', 900]])
  })

  it('left joins and keeps unmatched rows with NULLs', async () => {
    const r = await run(
      'SELECT users.name, orders.total FROM users LEFT JOIN orders ON users.id = orders.user_id',
    )
    expect(r.table?.rows).toHaveLength(6)
    expect(r.table?.rows.filter((row) => row[1] === null)).toHaveLength(3)
  })

  it('aggregates across a join', async () => {
    const r = await run(
      'SELECT users.name, SUM(orders.total) AS spent FROM users JOIN orders ON users.id = orders.user_id GROUP BY users.name ORDER BY users.name',
    )
    expect(r.table?.rows).toEqual([['Asha', 750], ['Cal', 900]])
  })
})

describe('cost reporting — the reason this engine exists', () => {
  it('reports a sequential scan and the full row count with no index', async () => {
    const r = await run("SELECT * FROM users WHERE city = 'Pune'")
    expect(r.table?.rowsScanned).toBe(5)
    expect(r.table?.plan?.[0]).toContain('Seq Scan')
    expect(r.table?.plan?.join('\n')).toContain('No index on city')
  })

  it('switches to an index scan once an index exists', async () => {
    runner.setIndex('users', 'city', true)
    const r = await run("SELECT * FROM users WHERE city = 'Pune'")
    expect(r.table?.plan?.[0]).toContain('Index Scan')
    expect(r.table?.rows).toHaveLength(2)
  })

  it('admits when an index did not pay for itself on a tiny table', async () => {
    runner.setIndex('users', 'city', true)
    const r = await run("SELECT * FROM users WHERE city = 'Pune'")
    // Five rows: walking the index costs as much as reading the table. Saying
    // otherwise would teach "an index is always faster", which is false.
    expect(r.table?.plan?.join('\n')).toContain('did not help')
  })

  it('gives the same answer with and without an index — only the cost differs', async () => {
    const big = {
      tables: [{
        name: 'people',
        columns: [{ name: 'id', type: 'integer' }, { name: 'city', type: 'text' }],
        rows: Array.from({ length: 5000 }, (_, i) => [i, i % 500 === 0 ? 'Delhi' : 'Pune']),
      }],
    }
    const r2 = new SqlRunner()
    r2.seed(big)
    const without = await r2.run("SELECT id FROM people WHERE city = 'Delhi' ORDER BY id")
    r2.setIndex('people', 'city', true)
    const withIndex = await r2.run("SELECT id FROM people WHERE city = 'Delhi' ORDER BY id")

    expect(withIndex.table?.rows).toEqual(without.table?.rows)
    expect(without.table?.rowsScanned).toBe(5000)
    expect(withIndex.table?.rowsScanned).toBeLessThan(30)
    expect(withIndex.table?.plan?.join('\n')).not.toContain('did not help')
  })

  it('cannot use an index for an OR condition, and says so in the plan', async () => {
    runner.setIndex('users', 'city', true)
    const r = await run("SELECT * FROM users WHERE city = 'Pune' OR city = 'Delhi'")
    expect(r.table?.plan?.[0]).toContain('Seq Scan')
  })

  it('shows the index lookup growing only logarithmically with table size', async () => {
    const big = {
      tables: [{
        name: 'events',
        columns: [{ name: 'id', type: 'integer' }, { name: 'kind', type: 'text' }],
        rows: Array.from({ length: 100_000 }, (_, i) => [i, i === 7 ? 'rare' : 'common']),
      }],
    }
    const r1 = new SqlRunner()
    r1.seed(big)
    const seq = await r1.run("SELECT * FROM events WHERE kind = 'rare'")
    expect(seq.table?.rowsScanned).toBe(100_000)

    r1.setIndex('events', 'kind', true)
    const indexed = await r1.run("SELECT * FROM events WHERE kind = 'rare'")
    expect(indexed.table?.rowsScanned).toBeLessThan(25)
    expect(indexed.table?.rows).toHaveLength(1)
  })
})

describe('errors are explanations, not stack traces', () => {
  it('rejects non-SELECT statements with a reason', async () => {
    const r = await run('DROP TABLE users')
    expect(r.ok).toBe(false)
    expect(r.error?.message).toContain('only runs SELECT')
    expect(r.error?.hint).toBeTruthy()
  })

  it('names the available tables when the table is unknown', async () => {
    const r = await run('SELECT * FROM customers')
    expect(r.ok).toBe(false)
    expect(r.error?.message).toContain('customers')
    expect(r.error?.hint).toContain('users')
  })

  it('lists available columns when the column is unknown', async () => {
    const r = await run('SELECT nope FROM users')
    expect(r.ok).toBe(false)
    expect(r.error?.hint).toContain('name')
  })

  it('reports an unparseable condition rather than silently returning nothing', async () => {
    const r = await run('SELECT * FROM users WHERE age BETWEEN 1 AND 2')
    expect(r.ok).toBe(false)
  })

  it('returns column headers even when no rows match, so the shape is still visible', async () => {
    const r = await run("SELECT name, city FROM users WHERE city = 'Nowhere'")
    expect(r.ok).toBe(true)
    expect(r.table?.rows).toHaveLength(0)
    expect(r.table?.columns).toEqual(['name', 'city'])
  })
})

describe('comments', () => {
  it('runs a query preceded by line comments', async () => {
    const r = await run(`
      -- Toggle the index above, then run this both ways.
      -- Watch "rows examined" under the result.
      SELECT name FROM users WHERE city = 'Pune';
    `)
    expect(r.ok).toBe(true)
    expect(r.table?.rows.map((row) => row[0])).toEqual(['Asha', 'Bo'])
  })

  it('runs a query with trailing and inline comments', async () => {
    const r = await run(`SELECT name -- just the name
      FROM users
      WHERE age > 30 -- adults only
    `)
    expect(r.ok).toBe(true)
    expect(r.table?.rows.map((row) => row[0])).toEqual(['Asha', 'Cal'])
  })

  it('handles block comments', async () => {
    const r = await run('SELECT /* only this */ name FROM users WHERE id = 1')
    expect(r.ok).toBe(true)
    expect(r.table?.rows).toEqual([['Asha']])
  })

  it('does not treat -- inside a string literal as a comment', async () => {
    const r = await run("SELECT name FROM users WHERE name = 'Asha' AND city = 'Pune'")
    expect(r.ok).toBe(true)
    expect(r.table?.rows).toEqual([['Asha']])

    // The real test: a literal containing the comment marker must survive.
    const r2 = await run("SELECT name FROM users WHERE city = 'Pu--ne'")
    expect(r2.ok).toBe(true)
    expect(r2.table?.rows).toHaveLength(0)
  })

  it('does not treat /* inside a string literal as a comment', async () => {
    const r = await run("SELECT name FROM users WHERE city = 'Pune/*'")
    expect(r.ok).toBe(true)
    expect(r.table?.rows).toHaveLength(0)
  })

  it('handles an escaped quote inside a literal', async () => {
    const r = await run("SELECT name FROM users WHERE name = 'O''Hara'")
    expect(r.ok).toBe(true)
    expect(r.table?.rows).toHaveLength(0)
  })

  it('reports an empty or comment-only query clearly', async () => {
    const empty = await run('   ')
    expect(empty.ok).toBe(false)
    expect(empty.error?.message).toContain('no query to run')

    const onlyComments = await run('-- nothing here\n-- still nothing')
    expect(onlyComments.ok).toBe(false)
    expect(onlyComments.error?.message).toContain('no query to run')
  })

  it('does not glue tokens together when removing a block comment', async () => {
    const r = await run("SELECT name FROM/* x */users WHERE id = 1")
    expect(r.ok).toBe(true)
    expect(r.table?.rows).toEqual([['Asha']])
  })
})

describe('ORDER BY does not require the column to be selected', () => {
  it('sorts by a column that is not in the SELECT list', async () => {
    // Valid SQL everywhere: conceptually the sort sees the whole row and the
    // projection is the last step. Projecting first loses the sort column.
    const r = await run('SELECT name FROM users WHERE age IS NOT NULL ORDER BY age DESC')
    expect(r.ok).toBe(true)
    expect(r.table?.columns).toEqual(['name'])
    expect(r.table?.rows.map((row) => row[0])).toEqual(['Cal', 'Asha', 'Bo', 'Dee'])
  })

  it('combines an unprojected sort column with LIMIT', async () => {
    const r = await run('SELECT name FROM users WHERE age IS NOT NULL ORDER BY age DESC LIMIT 2')
    expect(r.ok).toBe(true)
    expect(r.table?.rows.map((row) => row[0])).toEqual(['Cal', 'Asha'])
  })

  it('still sorts by an aggregate alias after GROUP BY', async () => {
    // The opposite case: `n` only exists after grouping, so that branch must sort
    // the grouped output rather than the source rows.
    const r = await run('SELECT city, COUNT(*) AS n FROM users GROUP BY city ORDER BY n DESC')
    expect(r.ok).toBe(true)
    expect(r.table?.rows[0]?.[1]).toBe(2)
  })

  it('sorts by multiple columns, only one of which is selected', async () => {
    const r = await run('SELECT name FROM users ORDER BY city, name')
    expect(r.ok).toBe(true)
    expect(r.table?.rows).toHaveLength(5)
  })

  it('reports a sort on a column that does not exist at all', async () => {
    const r = await run('SELECT name FROM users ORDER BY nope')
    expect(r.ok).toBe(false)
    expect(r.error?.message).toContain('nope')
  })
})

describe('performance — the predicate is compiled once, not re-parsed per row', () => {
  const bigTable = (rows: number) => ({
    tables: [{
      name: 'events',
      columns: [
        { name: 'id', type: 'integer' },
        { name: 'kind', type: 'text' },
        { name: 'amount', type: 'integer' },
      ],
      rows: Array.from({ length: rows }, (_, i) => [i, i === 777 ? 'rare' : 'common', i % 999]),
    }],
  })

  it('scans 100,000 rows in well under a second', async () => {
    const engine = new SqlRunner()
    engine.seed(bigTable(100_000))

    const started = performance.now()
    const result = await engine.run("SELECT * FROM events WHERE kind = 'rare'")
    const elapsed = performance.now() - started

    expect(result.ok).toBe(true)
    expect(result.table?.rows).toHaveLength(1)
    expect(result.table?.rowsScanned).toBe(100_000)
    // Before the predicate was compiled once this took ~3 seconds, which made the
    // index lesson's headline demo feel broken. A generous ceiling that still fails
    // loudly if per-row parsing comes back.
    expect(elapsed).toBeLessThan(1000)
  })

  it('scales roughly linearly rather than worse', async () => {
    const measure = async (rows: number) => {
      const engine = new SqlRunner()
      engine.seed(bigTable(rows))
      const started = performance.now()
      await engine.run("SELECT * FROM events WHERE amount > 500 AND kind = 'common'")
      return performance.now() - started
    }

    const small = await measure(20_000)
    const large = await measure(80_000)

    // 4x the rows should cost roughly 4x, not 16x. A wide bound, because timing on
    // shared CI hardware is noisy — this is here to catch an accidental O(n²),
    // not to measure throughput.
    expect(large).toBeLessThan(Math.max(250, small * 12))
  })

  it('compiles a LIKE pattern once rather than per row', async () => {
    const engine = new SqlRunner()
    engine.seed(bigTable(60_000))

    const started = performance.now()
    const result = await engine.run("SELECT COUNT(*) AS n FROM events WHERE kind LIKE 'r%'")
    const elapsed = performance.now() - started

    expect(result.ok).toBe(true)
    expect(result.table?.rows).toEqual([[1]])
    expect(elapsed).toBeLessThan(1000)
  })
})
