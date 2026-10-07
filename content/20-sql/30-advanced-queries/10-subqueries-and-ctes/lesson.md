---
title: Subqueries and CTEs
summary: Four kinds of subquery, when each is the right shape, and why a correlated subquery can turn one query into a hundred thousand.
level: intermediate
minutes: 18
version: "SQL:2016"
status: stable
last_reviewed: "2026-10-07"
tags: [sql, subqueries, cte, exists, performance]
concepts: [subqueries, ctes, correlated-subqueries, set-operations]
prerequisites: [select, joins, aggregates]
interview:
  - question: What is a correlated subquery, and why can it be slow?
    level: intermediate
    answer: >-
      A correlated subquery references a column from the outer query, so it cannot be
      evaluated once — logically it runs per outer row. For a hundred thousand outer rows
      that is a hundred thousand executions of the inner query. In practice a good planner
      often rewrites it into a join or a semi-join, so it is not automatically slow; the
      danger is that whether it does depends on the shape, the statistics and the database,
      so you cannot rely on it. If the inner query does not reference the outer one, it is
      uncorrelated and runs exactly once.
    followUps:
      - "How would you rewrite one to avoid the risk?"
      - "How do you tell from the plan which happened?"
  - question: When would you use EXISTS rather than IN?
    level: intermediate
    answer: >-
      `EXISTS` when you only care whether a match exists and the inner set is large, because
      it can stop at the first match. `IN` with a small literal list or small subquery is
      clearer. The decisive case is NULL: `NOT IN` against a set containing NULL returns no
      rows at all, because `x NOT IN (1, NULL)` evaluates to UNKNOWN rather than true.
      `NOT EXISTS` has no such trap, which is why it is the safer default for the
      "rows with no match" question.
    followUps:
      - "Walk me through why NOT IN with a NULL returns nothing."
  - question: Does a CTE make a query faster?
    level: advanced
    answer: >-
      Not by itself — it makes it readable. Historically Postgres materialised every CTE,
      which created an optimisation fence: it could not push a filter down into one, so a
      CTE could be *slower* than the equivalent subquery. Since Postgres 12 a CTE referenced
      once is inlined by default, and you can force either behaviour with MATERIALIZED or NOT
      MATERIALIZED. Materialising deliberately is useful when a CTE is referenced several
      times and expensive to compute. So: use CTEs for clarity, and know which side of that
      version boundary your database is on.
    followUps:
      - "When would you want MATERIALIZED on purpose?"
resources:
  - title: "PostgreSQL — WITH Queries (CTEs)"
    url: https://www.postgresql.org/docs/current/queries-with.html
---

## The four places a subquery can go

```sql
-- 1. As a value (scalar subquery) — must return one row, one column.
SELECT name, (SELECT COUNT(*) FROM orders WHERE orders.user_id = users.id) AS n
FROM users;

-- 2. As a set, in WHERE.
SELECT * FROM users WHERE id IN (SELECT user_id FROM orders WHERE total > 500);

-- 3. As a table, in FROM (a "derived table" — must be aliased).
SELECT city, AVG(n) FROM (
  SELECT city, user_id, COUNT(*) AS n FROM orders GROUP BY city, user_id
) AS per_user
GROUP BY city;

-- 4. As a named step, before the query (a CTE).
WITH big_spenders AS (
  SELECT user_id, SUM(total) AS spent FROM orders GROUP BY user_id HAVING SUM(total) > 1000
)
SELECT users.name, big_spenders.spent
FROM big_spenders JOIN users ON users.id = big_spenders.user_id;
```

:::what
A **subquery** is a SELECT inside another statement. A **CTE** (common table expression, the
`WITH` clause) is a subquery given a name up front, so it can be referenced like a table —
including more than once, and including by itself for recursion.
:::

:::why
Both exist because some questions need two passes over the data and SQL has no variables.

"Which users spent more than average?" requires knowing the average before you can compare
against it. There is no way to express that in a single flat SELECT — `WHERE total >
AVG(total)` is not merely disallowed, it is meaningless, because `WHERE` sees one row and the
average is a property of all of them. The subquery is how you get a second pass.

CTEs add a second thing: a name. A four-join query with nested derived tables is technically
equivalent to the same logic as four named CTEs, and only one of them can be read six months
later. That matters more than it sounds like it should, because the alternative to a readable
query is not an unreadable query — it is a second query that nobody reconciles with the
first.
:::

:::how
```text
  UNCORRELATED — the inner query does not mention the outer one

    SELECT * FROM orders WHERE total > (SELECT AVG(total) FROM orders)

    1. Run the inner query once.          → 420
    2. Substitute the value.              → WHERE total > 420
    3. Run the outer query.

    Cost: one extra pass. Fine.

  CORRELATED — the inner query references an outer column

    SELECT name,
           (SELECT COUNT(*) FROM orders o WHERE o.user_id = u.id)
    FROM users u

    Logically: for each row of users, run the inner query.
    100,000 users → 100,000 executions of the inner query.

    In practice the planner usually rewrites this into a grouped join.
    Usually. Whether it does depends on the shape, the statistics, and
    which database you are on — which is the actual argument for writing
    the join yourself when the table is large.
```
:::

:::example
```sql
-- The "compare against an aggregate" shape, which is the one you will
-- reach for most often.
SELECT name, total
FROM orders
WHERE total > (SELECT AVG(total) FROM orders);

-- The "top N per group" shape, done with a correlated subquery.
-- (The window-function version in the next lesson is better. This one
-- works everywhere.)
SELECT * FROM orders o
WHERE (SELECT COUNT(*) FROM orders x
       WHERE x.city = o.city AND x.total > o.total) < 3
ORDER BY city, total DESC;
-- "fewer than 3 orders in this city beat mine" = top 3 per city
```
:::

:::failure
**`NOT IN` with a NULL in the set returns nothing. Ever.**

```sql
-- orders.user_id is nullable, and one row has NULL.
SELECT * FROM users WHERE id NOT IN (SELECT user_id FROM orders);
-- Zero rows. Always. Even though plenty of users have no orders.
```

Why: `id NOT IN (1, 2, NULL)` expands to `id <> 1 AND id <> 2 AND id <> NULL`. The last
comparison is UNKNOWN, not false — SQL cannot say whether your id differs from an unknown
value. `true AND UNKNOWN` is UNKNOWN, and `WHERE UNKNOWN` does not pass. So every row fails.

Three fixes, in order of preference:

```sql
-- Best: NOT EXISTS has no NULL trap, because it asks about row existence.
SELECT * FROM users u
WHERE NOT EXISTS (SELECT 1 FROM orders o WHERE o.user_id = u.id);

-- Also correct: LEFT JOIN and keep the non-matches.
SELECT u.* FROM users u
LEFT JOIN orders o ON o.user_id = u.id
WHERE o.id IS NULL;

-- Works, and depends on you remembering forever:
SELECT * FROM users WHERE id NOT IN (SELECT user_id FROM orders WHERE user_id IS NOT NULL);
```

This is the single most common correctness bug involving subqueries, and it is silent — the
query returns zero rows rather than an error, so it looks like a data problem.

**A scalar subquery that returns two rows is a runtime error.**

```sql
SELECT (SELECT id FROM orders WHERE user_id = 1) FROM users;
-- ERROR: more than one row returned by a subquery used as an expression
```

It passes in development with one order per user and fails in production. If a scalar
subquery is not guaranteed to be unique by a constraint, add `LIMIT 1` with an explicit
`ORDER BY` — or use an aggregate, which always returns one row.
:::

:::mistakes
**Assuming a CTE is an optimisation.** It is a readability tool. On Postgres before 12 it was
a pessimisation: every CTE was materialised, which meant the planner could not push a `WHERE`
from the outer query into it.

```sql
-- Postgres 11: this scans all of orders, materialises it, then filters.
WITH all_orders AS (SELECT * FROM orders)
SELECT * FROM all_orders WHERE id = 42;

-- Postgres 12+: inlined, so the index on id is used.
-- And you can still force the old behaviour when you want it:
WITH all_orders AS MATERIALIZED (SELECT * FROM orders) ...
```

**Nesting derived tables three deep instead of naming them.** Both of these work; only one
can be debugged.

```sql
SELECT * FROM (SELECT * FROM (SELECT ... ) a WHERE ...) b WHERE ...

WITH step1 AS (...), step2 AS (SELECT * FROM step1 WHERE ...)
SELECT * FROM step2 WHERE ...
```

**Forgetting that a derived table must be aliased.** `FROM (SELECT ...)` is a syntax error in
Postgres without `AS something`. It is legal in MySQL, which trains the habit out of people.

**Using a correlated subquery in `SELECT` to fetch one column per row.** This is the SQL
spelling of an N+1 — and unlike the application-level kind, it does not show up as many
queries in your logs, so it is harder to spot. One query, a hundred thousand inner
executions.
:::

:::realworld
```sql
-- 1. EXISTS for "has at least one", which stops at the first match.
SELECT * FROM users u
WHERE EXISTS (SELECT 1 FROM orders o WHERE o.user_id = u.id AND o.total > 500);
-- SELECT 1, not SELECT *: nothing reads the columns, so do not name any.

-- 2. A CTE chain, which is how a real reporting query is structured.
WITH recent AS (
  SELECT * FROM orders WHERE created_at >= now() - interval '30 days'
), per_user AS (
  SELECT user_id, COUNT(*) AS n, SUM(total) AS spent FROM recent GROUP BY user_id
), ranked AS (
  SELECT *, spent > (SELECT AVG(spent) FROM per_user) AS above_average FROM per_user
)
SELECT users.name, ranked.n, ranked.spent, ranked.above_average
FROM ranked JOIN users ON users.id = ranked.user_id
ORDER BY ranked.spent DESC
LIMIT 20;
```

Read that bottom-up and it is four statements you could have run separately, which is exactly
the point: each CTE is independently testable by selecting from it, and the filter in
`recent` bounds the work for everything downstream.

```sql
-- 3. Recursive CTEs, for hierarchies. The one thing a subquery cannot do.
WITH RECURSIVE subtree AS (
  SELECT id, parent_id, name FROM categories WHERE id = 7   -- anchor
  UNION ALL
  SELECT c.id, c.parent_id, c.name
  FROM categories c JOIN subtree s ON c.parent_id = s.id    -- step
)
SELECT * FROM subtree;
```

A cycle in `categories` makes that loop forever. In production, carry a depth column and
`WHERE depth < 50`, or accumulate the visited path and exclude it — a self-referencing table
with no constraint preventing cycles will eventually have one.
:::

:::tradeoffs
**Correlated subquery** — closest to how the question was asked, and you are trusting the
planner to rewrite it. Fine for small outer sets; a risk at scale, because the plan can
change when the statistics do.

**Join plus GROUP BY** — explicit about the one pass, usually the fastest, and further from
the English sentence. The right choice when the table is large.

**CTE** — readable, independently testable, and on older Postgres an optimisation fence. On
modern Postgres a single-use CTE is inlined, so the cost is zero and you should default to
it.

**`EXISTS` versus `IN`** — `EXISTS` can short-circuit at the first match and has no NULL
trap. `IN` reads better for a small literal list. For the negative form the answer is not a
preference: use `NOT EXISTS`.

The judgement that matters: write it the readable way first, then look at the plan. A
correlated subquery the planner flattened is free, and you only know by looking.
:::

:::checkpoint
1. `WHERE id NOT IN (SELECT user_id FROM orders)` returns no rows, but many users have no
   orders. What is wrong, and what are two fixes?
2. Which of these runs once, and which runs per outer row?
   `(SELECT AVG(total) FROM orders)` versus
   `(SELECT AVG(total) FROM orders o WHERE o.city = u.city)`
3. Why `SELECT 1` inside `EXISTS` rather than `SELECT *`?
4. A scalar subquery works locally and errors in production. What changed?
5. On Postgres 11, why might wrapping a table in a CTE make a query dramatically slower?
:::

:::interview
The question behind most subquery questions is whether you know that SQL is declarative but
not magic — that the planner may or may not rewrite what you wrote.

*"An uncorrelated subquery runs once and gets substituted. A correlated one references an
outer column, so logically it runs per outer row — and the planner usually flattens it into a
semi-join, but whether it does depends on the shape and the statistics. So on a large table I
write the join myself rather than depending on a rewrite that could stop happening when the
data changes."*

Then the NULL answer, unprompted, because it is the one with a real bug attached:

*"I avoid `NOT IN` against a subquery entirely. If the inner set contains a NULL, `x NOT IN
(1, NULL)` is UNKNOWN rather than true, so the whole query returns zero rows — silently, with
no error. `NOT EXISTS` asks about row existence instead of value comparison, so it has no such
case."*

And on CTEs, the version-aware answer: *"they are for readability, not speed. Before Postgres
12 they were an optimisation fence, which could make them slower; since 12 a single-use CTE is
inlined. I use them because each step can be tested by selecting from it."*
:::

## What you now know

- A subquery can be a value, a set, a table, or a named step (CTE).
- Uncorrelated subqueries run once; correlated ones logically run per outer row.
- The planner often flattens correlated subqueries into joins — often, not always.
- `NOT IN` with a NULL in the set returns zero rows. Use `NOT EXISTS`.
- A scalar subquery returning two rows is a runtime error, not a planning one.
- `EXISTS` can stop at the first match; write `SELECT 1` inside it.
- CTEs are for clarity. Before Postgres 12 they were an optimisation fence; now single-use
  CTEs are inlined.
- Recursive CTEs handle hierarchies, and need a depth guard against cycles.
