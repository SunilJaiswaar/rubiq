---
title: Indexes and query plans
summary: Watch a query go from 100,000 rows examined to about 18 — then learn the four cases where an index does nothing at all.
level: intermediate
minutes: 20
version: "SQL:2016"
status: stable
last_reviewed: "2026-09-20"
tags: [sql, indexes, performance, query-plan, btree]
concepts: [indexes, query-plans, btree, selectivity]
prerequisites: [select, where, joins]
interview:
  - question: How does a database index make a query faster?
    level: intermediate
    answer: >-
      An index is a separate, sorted data structure — usually a B-tree — mapping column
      values to row locations. Because it is sorted, finding a value is a descent through
      the tree rather than a scan of the table: roughly log(n) page reads instead of n. For
      a million rows that is about 20 reads instead of a million. The cost is that every
      INSERT, UPDATE and DELETE must also maintain the index, plus the disk space it
      occupies.
    followUps:
      - "When would the planner ignore your index?"
      - "Why not index every column?"
  - question: You add an index and the query is no faster. Name three possible reasons.
    level: advanced
    answer: >-
      First, **low selectivity** — if the value matches a large fraction of the table, a
      sequential scan is genuinely cheaper than an index lookup plus that many random row
      fetches, so the planner correctly ignores the index. Second, **the column is wrapped
      in a function or has a type mismatch** — `WHERE LOWER(email) = ...` cannot use a
      plain index on `email`, because the index stores the original values. Third, **wrong
      column order in a composite index** — an index on `(a, b)` cannot serve a query
      filtering only on `b`. Also possible: stale statistics, or the table being small
      enough that the whole thing fits in one or two pages.
    followUps:
      - "How do you confirm which of those it is?"
  - question: What does EXPLAIN tell you, and what is the difference from EXPLAIN ANALYZE?
    level: intermediate
    answer: >-
      `EXPLAIN` shows the plan the planner *intends* to use, with estimated row counts and
      costs, without running the query. `EXPLAIN ANALYZE` actually executes it and reports
      real timings and real row counts alongside the estimates. The gap between estimated
      and actual rows is the most valuable number on the page: a large discrepancy means
      the planner is working from bad statistics, which is why it chose a bad plan.
resources:
  - title: "PostgreSQL documentation — Using EXPLAIN"
    url: https://www.postgresql.org/docs/current/using-explain.html
  - title: "PostgreSQL documentation — Index types"
    url: https://www.postgresql.org/docs/current/indexes-types.html
---

## See it before reading about it

The playground below holds an `events` table with 100,000 rows. One of them has
`kind = 'rare'`.

Run this, and look at **rows examined** under the result:

```sql runnable
SELECT * FROM events WHERE kind = 'rare';
```

100,000. The database read every row and tested each one.

Now turn on the index — there is a toggle above the editor for `events.kind` — and run the
same query again.

About 18. The query did not change. Your SQL is identical. The planner noticed a new
access path and used it.

:::what
An **index** is a separate data structure, maintained alongside the table, that stores
column values in sorted order together with pointers to the rows containing them. It is
the database equivalent of the index at the back of a book: a sorted list that lets you
find a page without reading the book.
:::

## Why about 18, and not 1?

The number is the shape of the data structure, and it is worth understanding because it
explains both why indexes work and where they stop working.

:::how
An index is a **B-tree**: a balanced tree whose nodes each hold many keys.

```text
                      ┌─────────────────┐
                      │   m   …   s      │        root (1 page read)
                      └──┬───────┬──────┘
             ┌───────────┘       └──────────┐
        ┌────▼─────┐                   ┌────▼─────┐
        │ c  f  i  │                   │ p  r  u  │   internal (1 page read)
        └──┬───────┘                   └────┬─────┘
           │                                │
      ┌────▼────┐                     ┌─────▼──────┐
      │ … leaf… │                     │ …'rare'→ptr│   leaf (1 page read)
      └─────────┘                     └─────┬──────┘
                                            │
                                            ▼
                                   fetch the actual row
```

Each node is one disk page, and a page holds hundreds of keys. So the tree is **wide and
shallow**: for a million rows a B-tree is typically only three or four levels deep.
Finding a value costs one page read per level.

| Rows | Sequential scan | B-tree descent |
|---|---|---|
| 100 | 100 reads | ~1 |
| 10,000 | 10,000 | ~2 |
| 1,000,000 | 1,000,000 | ~3 |
| 100,000,000 | 100,000,000 | ~4 |

That table is the whole argument for indexes. Scanning grows linearly; the tree grows
logarithmically. The gap is small at a hundred rows and absurd at a hundred million.
:::

:::why
This is also why `ORDER BY` can be free. The index is *already sorted*, so a query ordering
by an indexed column can walk the index in order and skip the sort entirely. Try it:

```sql runnable
SELECT kind, amount FROM events ORDER BY kind LIMIT 5;
```
:::

## What an index costs

An index is not free, and treating it as free is how databases end up slow in the other
direction.

:::tradeoffs
**Reads get faster.** Point lookups, range scans and sorts on the indexed column.

**Writes get slower.** Every INSERT must add an entry to every index on the table, in the
right sorted position, possibly splitting a page. Every DELETE must remove them. Every
UPDATE to an indexed column must do both. A table with eight indexes does roughly nine
writes per insert.

**Disk and memory cost.** An index on a text column can easily be 20–40% of the table's
size. Worse, indexes compete with table data for the cache. An unused index is not
harmless — it is evicting pages you do need.

**The rule that follows:** index the columns you filter, join and sort on. Do not index
"just in case". An index nobody uses is a pure tax on every write, forever.
:::

```sql runnable
-- Low selectivity: 'common' matches almost everything.
SELECT COUNT(*) FROM events WHERE kind = 'common';
```

## The four times your index does nothing

This is the practically useful part. Each case is something you can reproduce.

### 1. Low selectivity

:::what
**Selectivity** is the fraction of rows a condition matches. A condition matching 1 row in
100,000 is highly selective. One matching 90,000 is not.
:::

With the index on, run both of these and compare rows examined:

```sql runnable
SELECT COUNT(*) FROM events WHERE kind = 'rare';
```

```sql runnable
SELECT COUNT(*) FROM events WHERE kind = 'common';
```

For `'common'`, using the index would mean descending the tree and then fetching ~90,000
rows individually, in index order, which on real hardware means scattered random reads.
A sequential scan reads the pages in physical order, which disks and read-ahead are far
better at. **The planner correctly ignores the index**, and you should not try to force it.

The usual rule of thumb: if a condition matches more than roughly 5–10% of a table, expect
a sequential scan.

### 2. A function around the column

```sql runnable
-- The index on `kind` stores the original values, so it cannot answer a question
-- about a transformed value — every row would have to be transformed to find out.
SELECT COUNT(*) FROM events WHERE UPPER(kind) = 'RARE';
```

The index is useless here. Fixes, in order of preference: don't transform the column
(compare against the stored form); store the value already normalised; or build an index
on the expression itself — `CREATE INDEX ON events (UPPER(kind))`.

The same applies to implicit type conversions. `WHERE user_id = '42'` against an integer
column may force a cast on every row and discard the index.

### 3. Leading-column mismatch in a composite index

An index on `(kind, amount)` sorts by `kind` first, then by `amount` within each `kind`.

```text
  index on (kind, amount), in stored order:

    ('common',   3)
    ('common',  17)
    ('common',  91)
    ('rare',    42)
    ...

  WHERE kind = 'rare'                  → can use it (seek on the first column)
  WHERE kind = 'rare' AND amount > 40  → can use it (seek, then range within)
  WHERE amount > 40                    → CANNOT use it
```

Why not the last one? Because the amounts are scattered throughout the index — sorted only
*within* each `kind` group. There is no contiguous range of the index containing every
`amount > 40`, so there is nothing to seek to.

**This is the "leftmost prefix" rule.** An index on `(a, b, c)` serves queries filtering
on `a`, on `(a, b)`, or on `(a, b, c)` — but not on `b` alone, nor on `(b, c)`. It is also
why column order in a composite index is a real design decision rather than a formality.

### 4. The table is too small to care

```sql runnable
-- With only a handful of rows, reading the whole thing beats walking a tree.
SELECT * FROM small_lookup WHERE code = 'B';
```

The toggle changes nothing here, because the table fits in a single page. One page read is
one page read. This is also why the SQL engine in these lessons tells you when an index
did not pay for itself — a teaching tool that implied "index = always faster" would be
teaching something false.

:::debugging
The workflow when a query is slow, in order:

1. **`EXPLAIN ANALYZE` it.** Never guess. The plan is printed under every result in this
   playground; in PostgreSQL you run `EXPLAIN ANALYZE SELECT ...`.

2. **Find `Seq Scan` on a large table.** That is your suspect.

3. **Compare estimated rows to actual rows.** This is the most valuable single
   observation:

```text
  Seq Scan on events  (cost=0.00..1834.00 rows=1 width=36)
                                          ^^^^^^ planner's estimate
                      (actual time=0.015..12.3 rows=90000 loops=1)
                                                 ^^^^^^^^^^ reality
```

   Estimated 1, got 90,000. The planner chose its plan believing this step produced one
   row. Its statistics are wrong, so run `ANALYZE events` to refresh them. **A bad plan is
   usually a symptom of bad statistics, not of a stupid planner.**

4. **Check selectivity** before adding an index. `SELECT COUNT(*) ... WHERE <condition>`
   against the table total. Below ~5%, an index will probably help; above it, probably not.

5. **Check the index you already have is usable** — no function around the column, no type
   mismatch, and the leftmost-prefix rule satisfied.
:::

:::failure
What goes wrong with indexes in production:

- **Write amplification.** A team adds indexes to fix read latency, and insert throughput
  halves. Every index multiplies write cost.
- **Index bloat.** Under heavy update load, PostgreSQL's B-trees accumulate dead entries.
  The index grows, stops fitting in cache, and gradually slows down. `REINDEX` fixes it.
- **A `CREATE INDEX` that locks the table.** On a large production table, building an
  index normally blocks writes for the duration. `CREATE INDEX CONCURRENTLY` avoids this;
  forgetting it has caused a lot of unplanned downtime.
- **Stale statistics after a bulk load.** Import ten million rows and the planner still
  believes the table has a thousand. Every plan involving it is wrong until `ANALYZE` runs.
- **Redundant indexes.** An index on `(a)` is redundant when `(a, b)` exists, because the
  leftmost prefix already covers it. It is pure write cost. Auditing for these is usually
  the fastest performance win available on a mature database.
:::

:::realworld
```sql
-- Build without locking out writers. On any table that matters, always.
CREATE INDEX CONCURRENTLY idx_events_kind ON events (kind);

-- Composite: put the equality column first, the range column second.
-- Serves `WHERE user_id = ? AND created_at > ?` and also `WHERE user_id = ?`.
CREATE INDEX idx_events_user_time ON events (user_id, created_at DESC);

-- Partial: index only the rows you actually query. Much smaller, much cheaper.
CREATE INDEX idx_orders_pending ON orders (created_at) WHERE status = 'pending';

-- Find indexes nobody is using — often the quickest available win.
SELECT relname, indexrelname, idx_scan
FROM pg_stat_user_indexes
WHERE idx_scan = 0
ORDER BY relname;
```

That partial index is underused and worth remembering. If 99% of your orders are completed
and you only ever query the pending ones, a partial index is 1% of the size, stays in
cache, and costs almost nothing to maintain.
:::

:::performance
A rough cost model to carry in your head:

| Operation | Cost |
|---|---|
| Sequential scan | O(n) page reads, but *sequential* — fast per page |
| B-tree point lookup | O(log n) page reads, random access |
| B-tree range scan | O(log n) to find the start, then sequential along the leaves |
| Index + row fetch | Add one random read per matched row |
| Index-only scan | No row fetch at all, if the index contains every column selected |

That last row is the one people miss. If a query selects only indexed columns, the
database can answer it from the index without touching the table:

```sql runnable
-- With the index on `kind`, this needs the index only — no rows fetched.
SELECT kind FROM events WHERE kind = 'rare';
```

This is what "covering index" means, and it is why adding a column to an index sometimes
produces a bigger speedup than the lookup itself.
:::

:::mistakes
**Adding an index as the first response to any slow query.** Measure selectivity first.
Half the time the honest answer is that the query asks for too much data and needs
rewriting, not indexing.

**Indexing a boolean.** `WHERE active = true` typically matches most of the table — no
selectivity, no benefit. A *partial* index (`WHERE active = false`, if that is the rare
case) is usually what was wanted.

**Expecting an index to help `LIKE '%foo%'`.** A B-tree can seek to a prefix, so
`LIKE 'foo%'` is fine. A leading wildcard has no prefix to seek to and the index cannot
help; that needs a trigram index or a full-text search index.

**Forgetting that `ORDER BY` can use an index.** A `LIMIT 10 ORDER BY created_at` over a
huge table is fast with an index on `created_at` and catastrophic without it, because
without the index the database must sort the entire table to find the first ten rows.
:::

:::checkpoint
With the index on `events.kind` enabled, predict the rows examined for each of these
*before* running it:

```sql
SELECT COUNT(*) FROM events WHERE kind = 'rare';
SELECT COUNT(*) FROM events WHERE kind = 'common';
SELECT COUNT(*) FROM events WHERE kind <> 'rare';
SELECT COUNT(*) FROM events WHERE UPPER(kind) = 'RARE';
```

Then run them. For every one you got wrong, name which of the four failure cases applies.
:::

:::interview
Index questions separate people who have read about indexes from people who have fixed a
slow query. The giveaway is whether you can say when an index *does not* help.

Anyone can say "an index makes reads faster". A strong answer continues unprompted:
*"...and it slows every write, because each index has to be maintained on insert, update
and delete. So I index what I filter, join and sort on, and I check for unused indexes,
because an unused index is pure write cost. The planner will also ignore an index when
selectivity is poor — if the condition matches most of the table, a sequential scan is
genuinely cheaper — or when the column is wrapped in a function, or when a composite
index's leading column is not in the query."*

Then the sentence that signals real experience: *"and when a plan looks wrong, I compare
the planner's estimated rows against actual rows in `EXPLAIN ANALYZE`, because a bad plan
is usually stale statistics rather than a bad planner."*
:::

## What you now know

- An index is a sorted B-tree beside the table. It turns O(n) scanning into O(log n)
  descent — about 3 or 4 page reads for a million rows.
- Because the index is sorted, it can also satisfy `ORDER BY` and range scans for free.
- Every index taxes every write and competes for cache. Unused indexes are pure cost.
- An index will not help when: selectivity is poor (over ~5–10% of rows), the column is
  wrapped in a function or implicitly cast, a composite index's leading column is absent,
  or the table is tiny.
- `EXPLAIN ANALYZE` and the estimated-versus-actual row gap is the diagnostic. A bad plan
  usually means stale statistics — run `ANALYZE`.
- `CREATE INDEX CONCURRENTLY` on production tables. Partial indexes when you only query a
  small subset.
- An index-only scan skips the table entirely when the index already holds every selected
  column.
