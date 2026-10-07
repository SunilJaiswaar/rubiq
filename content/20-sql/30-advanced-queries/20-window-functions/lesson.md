---
title: Window functions
summary: Aggregate without collapsing rows. Running totals, rankings and top-N-per-group in one pass — plus the frame clause nobody reads until it bites.
level: advanced
minutes: 20
version: "SQL:2016"
status: stable
last_reviewed: "2026-10-07"
tags: [sql, window-functions, ranking, analytics]
concepts: [window-functions, partitioning, frames]
prerequisites: [aggregates, subqueries]
interview:
  - question: What is the difference between a window function and GROUP BY?
    level: advanced
    answer: >-
      `GROUP BY` collapses each group into one row; a window function computes a value across
      a set of rows and attaches it to every row, so the row count is unchanged. That is the
      whole difference, and it is what makes "show each order next to its city's total"
      expressible in one query — with `GROUP BY` you would need to aggregate and then join
      the result back. Window functions are also evaluated after `WHERE`, `GROUP BY` and
      `HAVING`, which is why you cannot filter on one in `WHERE` and need a subquery or CTE
      instead.
    followUps:
      - "So how do you filter on a window function's result?"
      - "Can you use both in the same query?"
  - question: What is the difference between ROW_NUMBER, RANK and DENSE_RANK?
    level: advanced
    answer: >-
      They differ only in how they handle ties. `ROW_NUMBER` ignores ties and always gives
      distinct consecutive numbers — so for equal values the result is arbitrary unless the
      ORDER BY is fully deterministic. `RANK` gives ties the same number and then skips: 1,
      2, 2, 4. `DENSE_RANK` gives ties the same number and does not skip: 1, 2, 2, 3. For
      "top 3 per group" the choice matters — `ROW_NUMBER` gives you exactly three rows,
      `RANK` can give you four if two tie for third.
    followUps:
      - "Which would you use for a leaderboard, and why?"
  - question: What does the frame clause do, and what is the default?
    level: advanced
    answer: >-
      The frame defines which rows within the partition the function sees. The default
      depends on whether you wrote ORDER BY: with no ORDER BY the frame is the whole
      partition, and with ORDER BY it is RANGE BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW —
      which is what makes `SUM(x) OVER (ORDER BY d)` a running total rather than the overall
      total. The trap is that RANGE includes all peer rows with the same ORDER BY value, so
      with duplicate dates a running total jumps by the whole day's worth on every row of
      that day. ROWS counts physical rows instead and avoids that.
    followUps:
      - "When would you actually want RANGE over ROWS?"
resources:
  - title: "PostgreSQL — Window Functions"
    url: https://www.postgresql.org/docs/current/tutorial-window.html
---

## Aggregating without collapsing

```sql
-- GROUP BY: three cities in, three rows out. The orders are gone.
SELECT city, SUM(total) FROM orders GROUP BY city;

-- Window: six orders in, six rows out — each carrying its city's total.
SELECT id, city, total, SUM(total) OVER (PARTITION BY city) AS city_total
FROM orders;

--  id | city  | total | city_total
--  10 | Pune  |   500 |        830
--  11 | Pune  |   250 |        830
--  15 | Pune  |    80 |        830
--  12 | Delhi |   900 |        900
```

:::what
A **window function** computes a value over a set of rows related to the current row — the
*window* — and returns one value per row. `OVER` defines the window: `PARTITION BY` splits
the rows into groups, `ORDER BY` orders them within a group, and the frame clause narrows
which of those rows are visible.
:::

:::why
Before window functions, "each row alongside something computed from its neighbours" needed
two passes and a join:

```sql
-- The old way. Aggregate, then join the aggregate back.
SELECT o.id, o.city, o.total, t.city_total
FROM orders o
JOIN (SELECT city, SUM(total) AS city_total FROM orders GROUP BY city) t
  ON t.city = o.city;
```

That works, and it reads the table twice, and it gets worse fast — a query showing each
order's total, its city total, its rank in the city and the running total by date needs four
such joins. With windows it is one scan and four `OVER` clauses.

The deeper reason is that a whole category of question is about a row *in context*: its rank,
its share, its difference from the previous row, its position in a running total. `GROUP BY`
cannot express those, because it destroys the row. Window functions were added to SQL
precisely because reporting is mostly these questions, and the alternative was moving the
data into a spreadsheet.
:::

:::how
```text
  SELECT id, city, total,
         SUM(total) OVER (PARTITION BY city ORDER BY id) AS running
  FROM orders

  1. PARTITION BY city — split rows into independent windows

       Pune:   [10, 500]  [11, 250]  [15, 80]
       Delhi:  [12, 900]  [13, null]
       Kochi:  [14, 120]

  2. ORDER BY id — order within each partition

  3. frame — default with ORDER BY is
       RANGE BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
     so for Pune the windows are
       row 10: [10]            → 500
       row 11: [10, 11]        → 750
       row 15: [10, 11, 15]    → 830          ← a running total

  4. compute SUM over each frame, attach to the row

  Remove ORDER BY and the frame becomes the whole partition,
  so every Pune row gets 830. That one word changes the meaning.
```

Where windows sit in the evaluation order matters: **after** `WHERE`, `GROUP BY` and
`HAVING`, and **before** `ORDER BY` and `LIMIT`. Hence you cannot filter on a window
function in `WHERE` — it has not been computed yet.
:::

:::example
```sql
-- The one you will write most: top N per group.
WITH ranked AS (
  SELECT id, city, total,
         ROW_NUMBER() OVER (PARTITION BY city ORDER BY total DESC, id) AS rn
  FROM orders
)
SELECT id, city, total FROM ranked WHERE rn <= 3;
-- The CTE exists because `WHERE rn <= 3` is illegal in the same SELECT:
-- window functions are computed after WHERE.
--
-- Note `, id` in the ORDER BY. Without a tiebreaker, two equal totals
-- get numbers in an arbitrary order that can change between runs.
```
:::

:::internals
```text
  How the database executes a window.

  1. Sort the rows by (partition keys, order keys) — one sort serves both.
  2. Walk the sorted rows, detecting partition boundaries as the keys change.
  3. Maintain the aggregate incrementally over the frame as it slides.

  Consequences:

  - A window costs a sort. Several windows sharing the same OVER clause
    share one sort; different OVER clauses may need several. Writing
    them identically is not a style choice — it saves a sort.

  - An index on (partition_key, order_key) can supply the ordering
    directly and skip the sort entirely.

  - A running total is computed in one forward pass, not re-summed per
    row. But the frame matters: UNBOUNDED PRECEDING AND CURRENT ROW
    accumulates, while an arbitrary frame like
    "2 PRECEDING AND 2 FOLLOWING" needs a sliding window and can cost
    more.
```

```sql
-- Naming the window when it repeats — same sort, used four times.
SELECT id, city, total,
       ROW_NUMBER() OVER w,
       SUM(total)   OVER w,
       LAG(total)   OVER w
FROM orders
WINDOW w AS (PARTITION BY city ORDER BY total DESC);
```
:::

:::failure
**`RANGE` versus `ROWS`, which is the frame trap.**

```sql
-- Daily sales, with two rows on 2026-01-02.
SELECT day, amount, SUM(amount) OVER (ORDER BY day) AS running FROM sales;

--  day        | amount | running
--  2026-01-01 |    100 |     100
--  2026-01-02 |     50 |     250   ← both of the 2nd's rows already included
--  2026-01-02 |    100 |     250   ← same value, not 150 then 250
--  2026-01-03 |     10 |     260
```

The default frame with `ORDER BY` is `RANGE`, which includes every *peer* — every row with
the same `ORDER BY` value as the current row. With duplicate days, each row of a day sees the
whole day. If you wanted a row-by-row running total, say so:

```sql
SUM(amount) OVER (ORDER BY day ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW)
--  2026-01-02 |  50 | 150
--  2026-01-02 | 100 | 250
```

`RANGE` is usually what you want for a *daily* running total (all of a day or none of it).
`ROWS` is what you want for per-row accumulation. The failure is silent either way — the
numbers are plausible.

**`ROW_NUMBER` with a non-deterministic `ORDER BY`.**

```sql
ROW_NUMBER() OVER (PARTITION BY city ORDER BY total DESC)
-- Two orders with total = 500. Which gets rn = 1? Unspecified.
-- Paginate with this and a row can appear on both page 1 and page 2.
```

Always add a unique tiebreaker — usually the primary key.

**`AVG` over a window including NULLs** behaves like `AVG` anywhere: it skips them and
divides by the non-NULL count. A running average over a column with gaps is not an average
over the rows you can see.
:::

:::realworld
```sql
-- 1. Share of total — the single most requested dashboard column.
SELECT city, total,
       ROUND(100.0 * total / SUM(total) OVER (), 1) AS pct_of_all,
       ROUND(100.0 * total / SUM(total) OVER (PARTITION BY city), 1) AS pct_of_city
FROM orders;
-- SUM(total) OVER () with an empty window = the grand total, on every row.

-- 2. Change versus the previous period.
SELECT month, revenue,
       LAG(revenue) OVER (ORDER BY month) AS prev,
       revenue - LAG(revenue) OVER (ORDER BY month) AS delta,
       ROUND(100.0 * (revenue - LAG(revenue) OVER (ORDER BY month))
             / LAG(revenue) OVER (ORDER BY month), 1) AS pct_change
FROM monthly;
-- LAG returns NULL for the first row, so pct_change is NULL there.
-- That is correct, and your chart library may not think so.

-- 3. Deduplication — keep one row per key, the newest.
WITH d AS (
  SELECT *, ROW_NUMBER() OVER (PARTITION BY email ORDER BY created_at DESC, id DESC) AS rn
  FROM users
)
DELETE FROM users WHERE id IN (SELECT id FROM d WHERE rn > 1);
-- Run the SELECT first. Always run the SELECT first.

-- 4. Sessionisation — the pattern worth stealing.
--    A new session starts when the gap since the previous event exceeds 30 minutes.
SELECT user_id, occurred_at,
       SUM(is_new_session) OVER (PARTITION BY user_id ORDER BY occurred_at) AS session_id
FROM (
  SELECT user_id, occurred_at,
         CASE WHEN occurred_at - LAG(occurred_at) OVER (PARTITION BY user_id ORDER BY occurred_at)
                   > interval '30 minutes'
              OR LAG(occurred_at) OVER (PARTITION BY user_id ORDER BY occurred_at) IS NULL
              THEN 1 ELSE 0 END AS is_new_session
  FROM events
) e;
-- A running SUM over a 0/1 flag turns "boundaries" into "group ids".
-- That trick — gaps and islands — solves a surprising number of problems.
```
:::

:::tradeoffs
**Window function** — one scan plus a sort, no self-join, and the row survives. Not available
in very old MySQL (pre-8.0) or SQLite (pre-3.25), which is the only real reason to avoid one
now.

**Aggregate plus self-join** — portable to anything, reads the table twice, and gets
unmanageable past two aggregates.

**Correlated subquery per row** — the most readable for "rank within group" and the most
dangerous, since it is logically per-row.

**Doing it in application code** — full flexibility, and you must transfer every row. For a
running total over a million rows that is the wrong trade by a wide margin; for a hundred
rows it is fine and easier to test.

Two costs worth stating plainly. A window needs a sort, so it is not free — but one sort for
four windows sharing an `OVER` clause is cheaper than four joins, which is usually the real
comparison. And you cannot filter on a window result in `WHERE`, so every top-N query needs a
CTE or subquery layer; that is a syntax cost, not a performance one.
:::

:::checkpoint
1. `SUM(total) OVER (PARTITION BY city)` versus `GROUP BY city` — how many rows does each
   return for six orders across three cities?
2. Why does `WHERE ROW_NUMBER() OVER (...) <= 3` fail, and what is the fix?
3. Totals 500, 500, 300. Give the output of `ROW_NUMBER`, `RANK` and `DENSE_RANK`.
4. A running total over `ORDER BY day` shows the same value for two rows on the same day.
   Why, and what do you change?
5. What does `SUM(x) OVER ()` — empty parentheses — compute?
:::

:::interview
Lead with the one-sentence distinction, because it is the thing being tested:

*"`GROUP BY` collapses rows; a window function computes across a set of rows and attaches the
result to each one, so the row count is unchanged. That is what lets you show an order next to
its city's total in a single pass instead of aggregating and joining back."*

Then the evaluation-order point, which explains a syntax rule rather than just reciting it:

*"Windows are computed after `WHERE`, `GROUP BY` and `HAVING`, so you cannot filter on one in
`WHERE` — it does not exist yet. That is why every top-N-per-group query has a CTE wrapping a
`ROW_NUMBER` and filters on the outside."*

If they go deeper, the frame clause is the senior signal:

*"The default frame with `ORDER BY` is `RANGE`, which includes all peer rows sharing the
current `ORDER BY` value. So a running total ordered by day gives every row of a duplicate day
the whole day's total. `ROWS` counts physical rows instead. Both are plausible-looking and only
one is what you meant."*

And a practical note that signals you have shipped these: *"I give `ROW_NUMBER` a unique
tiebreaker in the `ORDER BY`, because otherwise ties are ordered arbitrarily and paginated
results can repeat or drop rows between pages."*
:::

## What you now know

- A window function aggregates without collapsing rows; `GROUP BY` collapses.
- `OVER (PARTITION BY ... ORDER BY ...)` defines the window; `OVER ()` is every row.
- Windows are computed after `WHERE`/`HAVING`, so filtering on one needs a CTE or subquery.
- `ROW_NUMBER` ignores ties, `RANK` skips after them, `DENSE_RANK` does not skip.
- Always give `ROW_NUMBER` a unique tiebreaker or ordering is arbitrary.
- Adding `ORDER BY` to a window changes the default frame, turning a total into a running
  total.
- `RANGE` includes all peers with the same ordering value; `ROWS` counts physical rows.
- A window costs a sort; identical `OVER` clauses share one. `WINDOW w AS (...)` names it.
- A running `SUM` over a 0/1 boundary flag converts boundaries into group ids — gaps and
  islands.
