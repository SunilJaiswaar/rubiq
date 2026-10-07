---
title: Aggregates and GROUP BY
summary: Collapsing many rows into one number — and the three things that go wrong when you do it (NULLs, WHERE versus HAVING, and joins that inflate your totals).
level: basic
minutes: 16
version: "SQL:2016"
status: stable
last_reviewed: "2026-10-07"
tags: [sql, aggregates, group-by, having, null]
concepts: [aggregates, grouping, null-semantics]
prerequisites: [select, where, joins]
interview:
  - question: What is the difference between WHERE and HAVING?
    level: basic
    answer: >-
      `WHERE` filters rows before grouping; `HAVING` filters groups after. So `WHERE` cannot
      refer to an aggregate — the aggregate does not exist yet — and `HAVING` can. The
      practical consequence is that putting a row-level condition in `HAVING` still works but
      is slower, because you grouped rows you were going to discard. Filter as early as you
      can.
    followUps:
      - "Can HAVING refer to a column that is not in GROUP BY?"
  - question: What is the difference between COUNT(*), COUNT(column) and COUNT(DISTINCT column)?
    level: basic
    answer: >-
      `COUNT(*)` counts rows. `COUNT(column)` counts rows where that column is not NULL —
      which is why the two differ, and the difference is exactly the number of NULLs.
      `COUNT(DISTINCT column)` counts distinct non-NULL values. This matters most after a
      LEFT JOIN: `COUNT(*)` counts the row the outer join invented for a non-matching
      left-hand row, so a user with no orders appears to have one.
    followUps:
      - "How do you count users with zero orders correctly?"
  - question: Why can a JOIN make a SUM wrong?
    level: intermediate
    answer: >-
      Because a join multiplies rows. If each order has three line items, joining orders to
      line items gives three rows per order, and `SUM(orders.total)` now counts each order's
      total three times. The aggregate is correct for the rows it was given — the rows were
      wrong. The fix is to aggregate each side separately, usually with a subquery or a CTE,
      rather than aggregating over a multiplied result set.
    followUps:
      - "How would you spot this in a report you did not write?"
resources:
  - title: "PostgreSQL — Aggregate Functions"
    url: https://www.postgresql.org/docs/current/functions-aggregate.html
---

## From many rows to one

```sql
-- Five aggregates over the whole table: one row out.
SELECT COUNT(*), SUM(total), AVG(total), MIN(total), MAX(total)
FROM orders;

-- The same aggregates, once per city: one row per city.
SELECT city, COUNT(*), SUM(total)
FROM orders
GROUP BY city;
```

:::what
An **aggregate function** takes a set of rows and returns one value. **GROUP BY** splits the
rows into sets first, so you get one output row per set instead of one for the whole table.
:::

:::why
The reason this is a distinct piece of SQL rather than something you do in application code
is volume. Answering "what did each city spend last month" over ten million orders by
fetching ten million rows and summing them in Ruby means moving ten million rows across the
network, allocating objects for all of them, and doing the arithmetic in the slowest
available place.

`GROUP BY` does the arithmetic where the data already is and sends you one row per city.
That is not a micro-optimisation — it is the difference between a report that runs and one
that times out. The database also has access to sorted indexes and hash tables you cannot
reach from outside it.
:::

:::how
```text
  SELECT city, SUM(total) FROM orders WHERE total > 100 GROUP BY city HAVING SUM(total) > 500

  1. FROM      — read orders
  2. WHERE     — discard rows with total <= 100        ← rows, before grouping
  3. GROUP BY  — partition the survivors by city
  4. aggregate — compute SUM(total) per partition
  5. HAVING    — discard groups with SUM <= 500        ← groups, after aggregating
  6. SELECT    — project city and the sum
  7. ORDER BY  — sort the groups
  8. LIMIT     — cut

  Two filters at two different stages, which is the entire explanation
  for why both WHERE and HAVING exist.
```

Notice that `SELECT` runs near the *end*. This is why you cannot use a `SELECT` alias in
`WHERE` in most databases: the alias does not exist yet. (Postgres and MySQL allow it in
`GROUP BY` and `HAVING` as an extension; the standard does not.)
:::

:::example
```sql
-- Every column in SELECT must either be in GROUP BY or inside an aggregate.
SELECT city, COUNT(*) AS n, SUM(total) AS revenue
FROM orders
GROUP BY city
ORDER BY revenue DESC;

-- This is an error, and the error is a real one:
SELECT city, name, COUNT(*) FROM orders GROUP BY city;
-- Which `name`? The group has many rows and they disagree.
-- MySQL used to silently pick one. That was worse than the error.
```
:::

:::failure
**NULL is not zero, and aggregates ignore it.**

```sql
-- totals: 100, NULL, 300
SELECT COUNT(*), COUNT(total), SUM(total), AVG(total) FROM orders;
--        3          2            400         200

-- COUNT(*)  counts rows:                   3
-- COUNT(total) counts non-NULL values:     2
-- SUM ignores NULL:                        400 (not an error, not NULL)
-- AVG divides by the non-NULL count:       400/2 = 200, NOT 400/3 = 133
```

That `AVG` is the one that bites. If `total` is NULL for rows where the order was cancelled,
your average order value silently excludes them — which may be what you want, but nothing in
the query says so. Be explicit:

```sql
SELECT AVG(COALESCE(total, 0)) FROM orders;   -- treat NULL as zero
SELECT AVG(total) FROM orders WHERE total IS NOT NULL;  -- same as AVG(total), but visibly
```

**An empty group has no row, but no group at all still gives you a row.**

```sql
SELECT COUNT(*) FROM orders WHERE 1 = 0;        -- one row: 0
SELECT city, COUNT(*) FROM orders WHERE 1 = 0 GROUP BY city;  -- zero rows
```

Aggregates with no `GROUP BY` always return exactly one row. Add `GROUP BY` and an empty
input gives you nothing — which breaks code that assumes `rows[0]` exists.

**`SUM` of nothing is NULL, not 0.**

```sql
SELECT SUM(total) FROM orders WHERE city = 'Nowhere';  -- NULL
SELECT COALESCE(SUM(total), 0) FROM orders WHERE city = 'Nowhere';  -- 0
```

Every dashboard that shows "NULL" instead of a zero is this line.
:::

:::mistakes
**Counting after a LEFT JOIN.** The classic wrong answer:

```sql
-- "How many orders does each user have?"
SELECT users.name, COUNT(*)
FROM users LEFT JOIN orders ON orders.user_id = users.id
GROUP BY users.name;
-- A user with no orders gets COUNT(*) = 1, because the outer join
-- invented a row with NULL on the right. Count the right-hand key instead:

SELECT users.name, COUNT(orders.id)
FROM users LEFT JOIN orders ON orders.user_id = users.id
GROUP BY users.name;
-- COUNT(orders.id) ignores the NULL. Now it is 0.
```

**Summing across a join that multiplies rows.** The most expensive mistake on this page,
because the number looks plausible:

```sql
-- orders: 1 order, total 100. line_items: 3 items for that order.
SELECT SUM(orders.total)
FROM orders JOIN line_items ON line_items.order_id = orders.id;
-- 300. The join produced three rows, each carrying total = 100.

-- Aggregate each side separately:
SELECT (SELECT SUM(total) FROM orders) AS revenue,
       (SELECT COUNT(*) FROM line_items) AS items;
```

Two aggregates over two different grains cannot share one query without care. If a revenue
figure ever jumps after someone adds a join to a report, this is why.

**`HAVING` doing `WHERE`'s job.**

```sql
-- Works, and groups rows it will throw away:
SELECT city, SUM(total) FROM orders GROUP BY city HAVING city <> 'Pune';
-- Filter first:
SELECT city, SUM(total) FROM orders WHERE city <> 'Pune' GROUP BY city;
```

**`COUNT(DISTINCT ...)` on a large table, casually.** It cannot be computed incrementally
the way `COUNT(*)` can — it needs to remember every value seen, so it sorts or hashes the
whole column. On a hundred million rows that is a real cost, and it is the usual answer to
"why is this one dashboard tile slow".
:::

:::realworld
```sql
-- Conditional aggregation: several counts in one pass over the table.
-- Much cheaper than three queries, and the pattern behind most dashboards.
SELECT
  COUNT(*)                                             AS all_orders,
  COUNT(*) FILTER (WHERE status = 'paid')              AS paid,
  COUNT(*) FILTER (WHERE status = 'refunded')          AS refunded,
  SUM(total) FILTER (WHERE status = 'paid')            AS revenue
FROM orders;

-- FILTER is standard SQL but not universal. The portable form:
SELECT
  COUNT(*)                                             AS all_orders,
  SUM(CASE WHEN status = 'paid' THEN 1 ELSE 0 END)     AS paid,
  SUM(CASE WHEN status = 'paid' THEN total ELSE 0 END) AS revenue
FROM orders;
```

```sql
-- Grouping by a derived value, which is where most reporting queries live.
SELECT date_trunc('month', created_at) AS month, COUNT(*), SUM(total)
FROM orders
WHERE created_at >= now() - interval '1 year'
GROUP BY 1          -- "the first SELECT expression"; fine here, avoid in long queries
ORDER BY 1;
```

Two production notes. First, that `WHERE` before the `GROUP BY` is doing most of the work —
grouping a year is cheap, grouping all history is not, and the `WHERE` is also what lets an
index on `created_at` be used at all. Second, `GROUP BY 1` is convenient and brittle: adding
a column to `SELECT` silently changes the grouping. Name it in anything that will be edited
again.
:::

:::tradeoffs
**Aggregating in the database** moves the arithmetic to the data and returns a small result.
You give up the ability to use your application's own logic — business rules in Ruby cannot
participate in a `SUM`.

**Aggregating in the application** lets you use any logic you like, at the cost of
transferring every row and allocating objects for all of them. Reasonable for hundreds of
rows, ruinous for millions.

**Pre-aggregating** — a nightly job writing a `daily_revenue` table — makes the read
instant and introduces staleness plus a job that can fail. This is the right answer
surprisingly often: dashboards rarely need the last five minutes, and a materialised total
is cheap to serve.

The rule that holds: filter as early as possible, aggregate as close to the data as
possible, and never aggregate across a join without checking what the join did to the row
count first.
:::

:::checkpoint
`orders` has four rows: totals 100, 200, NULL, and 100, the last two in Pune and the first
two in Delhi (NULL is in Pune).

1. `SELECT COUNT(*), COUNT(total), SUM(total), AVG(total) FROM orders;`
2. `SELECT city, COUNT(total) FROM orders GROUP BY city;`
3. `SELECT SUM(total) FROM orders WHERE city = 'Kochi';`
4. Why does `SELECT city, name FROM orders GROUP BY city` fail?
5. A report joins `orders` to `line_items` and sums `orders.total`. Revenue triples
   overnight with no new orders. What happened?
:::

:::interview
Aggregate questions are usually a NULL question wearing a disguise, so say the NULL part out
loud without being asked.

*"`COUNT(*)` counts rows, `COUNT(col)` counts non-NULL values, and the gap between them is
the NULL count. `SUM` and `AVG` skip NULLs too, so `AVG` divides by the non-NULL count — not
the row count — which means a nullable column gives you an average over a subset that the
query never mentions. And `SUM` over an empty set is NULL rather than 0, which is where
dashboards get their blank tiles."*

Then the join point, which separates people who have maintained a report from people who
have only written one:

*"The thing I actually check first in someone else's reporting query is whether it aggregates
across a join. A join multiplies rows, so summing a column from the one-side of a one-to-many
counts it once per child row. The aggregate is right and the input was wrong, which is why
the number looks plausible instead of absurd."*
:::

## What you now know

- `WHERE` filters rows before grouping; `HAVING` filters groups after. Filter early.
- `SELECT` is evaluated late, which is why its aliases are not available to `WHERE`.
- `COUNT(*)` counts rows; `COUNT(col)` counts non-NULLs. After a LEFT JOIN you want the
  second one.
- `SUM` and `AVG` ignore NULL. `AVG` divides by the non-NULL count.
- `SUM` of an empty set is NULL. `COALESCE` it if a number must appear.
- Aggregates without `GROUP BY` always return one row; with `GROUP BY` they can return none.
- Aggregating over a join that multiplies rows inflates the result. Aggregate each grain
  separately.
- `FILTER` (or `CASE`) gives you several conditional aggregates in one pass.
