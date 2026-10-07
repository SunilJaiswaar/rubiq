---
title: SELECT and WHERE
summary: Why SQL is declarative, what that buys you, and why NULL does not behave like any other value.
level: beginner
minutes: 15
version: "SQL:2016"
status: stable
last_reviewed: "2026-09-20"
tags: [sql, select, where, null, databases]
concepts: [select, where, null, declarative-queries, three-valued-logic]
prerequisites: []
interview:
  - question: What does it mean that SQL is declarative?
    level: basic
    answer: >-
      You describe the result you want, not the steps to produce it. `SELECT name FROM
      users WHERE city = 'Pune'` says nothing about whether to scan the table, use an
      index, or in what order to apply the filter — the query planner decides that, using
      statistics about the data. The practical consequence is that the same query gets
      faster when you add an index, without being rewritten, and that two differently
      written queries can produce the same plan.
    followUps:
      - "If the planner decides, how do you influence it?"
      - "Give an example where the planner's choice changes as the data grows."
  - question: Why does `WHERE age = NULL` return no rows?
    level: basic
    hint: What is NULL actually claiming about the value?
    answer: >-
      Because NULL means "unknown", not "empty". Comparing anything to an unknown value
      yields UNKNOWN rather than TRUE or FALSE, and `WHERE` only keeps rows where the
      predicate is TRUE. So `age = NULL` is never true — not even for rows where age is
      NULL, because "is this unknown value equal to some other unknown value?" is itself
      unknowable. You need `IS NULL`, which is a dedicated test rather than a comparison.
    followUps:
      - "What does `NOT IN (1, 2, NULL)` return, and why does that surprise people?"
      - "How does NULL interact with COUNT?"
  - question: What is the difference between WHERE and HAVING?
    level: basic
    answer: >-
      `WHERE` filters individual rows before grouping; `HAVING` filters groups after
      aggregation. So you cannot reference an aggregate like `COUNT(*)` in `WHERE`, because
      the groups do not exist yet — and filtering with `WHERE` first is usually faster,
      because there is less data to group.
resources:
  - title: "PostgreSQL documentation — The SELECT command"
    url: https://www.postgresql.org/docs/current/sql-select.html
  - title: "PostgreSQL documentation — Comparison functions and operators"
    url: https://www.postgresql.org/docs/current/functions-comparison.html
---

## You tell it what, not how

Here is a thing you want: the names of everyone in Pune.

In a general-purpose language you would write the *procedure*:

```ruby
names = []
File.foreach("users.csv") do |line|
  id, name, city, age = line.chomp.split(",")
  names << name if city == "Pune"
end
names
```

You decided to read the file top to bottom, one line at a time, testing each one. If the
file were sorted by city you could have stopped early — but you would have to write that
yourself. If an index existed, you would have to use it yourself.

In SQL you write the *result*:

```sql runnable
SELECT name FROM users WHERE city = 'Pune';
```

:::what
SQL is **declarative**: a query describes the rows you want, not the procedure for finding
them. A component called the **query planner** turns your description into an execution
strategy, choosing between scanning, index lookups, join algorithms and sort methods based
on statistics it keeps about your actual data.
:::

:::why
The separation means the *same query* gets faster when circumstances change. Add an index
and the planner starts using it — your SQL does not change. The table grows from a
thousand rows to ten million and the planner switches from a nested loop to a hash join —
your SQL does not change. Thirty years of research into making data access fast has gone
into planners, and you get it by describing what you want.
:::

:::tradeoffs
**What declarative buys.** Portability of intent, automatic improvement, and a planner
smarter about your data distribution than you are.

**What it costs.** You lose direct control. When a query is slow, you cannot simply read
the code to see why — you have to ask the planner what it decided (`EXPLAIN`) and then
influence it indirectly, by adding indexes, rewriting the query into a shape it handles
better, or updating statistics. That indirection is the single biggest source of
frustration for engineers who are fluent in procedural code, and it is why the next lesson
but one is about reading plans.
:::

## The shape of a SELECT

Try these in order. The editor below runs against real seeded tables.

```sql runnable
SELECT * FROM users;
```

```sql runnable
-- Only the columns you need. `SELECT *` in application code is a habit worth breaking:
-- it ships columns you do not use, and it breaks when someone adds a column.
SELECT name, city FROM users;
```

```sql runnable
-- Rename a column in the output.
SELECT name AS customer, age AS years FROM users;
```

```sql runnable
-- Filter rows.
SELECT name, age FROM users WHERE age > 30;
```

```sql runnable
-- Combine conditions.
SELECT name FROM users WHERE city = 'Pune' AND age < 30;
```

```sql runnable
-- Set membership, and pattern matching.
SELECT name, city FROM users WHERE city IN ('Pune', 'Kochi');
```

```sql runnable
SELECT name FROM users WHERE name LIKE 'A%';
```

```sql runnable
-- Order and limit. Without ORDER BY, row order is NOT guaranteed — ever.
SELECT name, age FROM users WHERE age IS NOT NULL ORDER BY age DESC LIMIT 3;
```

:::mistakes
**Assuming rows come back in a stable order without `ORDER BY`.** They often do, which is
what makes this dangerous. The order you observe is a side effect of the plan the planner
happened to choose; add an index, change the row count, or upgrade the database, and it
changes. If order matters, say so.

**`SELECT *` in application code.** It transfers columns you do not use, prevents
index-only scans, and silently changes shape when the schema does. Fine when exploring
interactively; a liability in a query your code depends on.
:::

## NULL is not a value. It is an admission of ignorance.

This is the single most common source of SQL bugs, and the reason is conceptual rather
than syntactic.

```sql runnable
-- Eli's age is NULL. Watch what happens.
SELECT name, age FROM users WHERE age = NULL;
```

No rows. Not even Eli, whose age *is* NULL.

```sql runnable
-- The correct test:
SELECT name, age FROM users WHERE age IS NULL;
```

:::what
NULL means **unknown**, not zero, not empty string, not "no value". It is a marker saying
"the database does not know what goes here".
:::

:::how
Because NULL is unknown, SQL comparison is **three-valued**: TRUE, FALSE, or UNKNOWN.

```text
  age = NULL
  │
  ├─ "is this value equal to an unknown value?"
  └─ the honest answer is: I don't know → UNKNOWN

  WHERE keeps a row only when the predicate is TRUE.
  UNKNOWN is not TRUE. So the row is dropped.
```

The full truth tables:

| `a` | `b` | `a = b` | `a AND b` | `a OR b` |
|---|---|---|---|---|
| TRUE | TRUE | TRUE | TRUE | TRUE |
| TRUE | FALSE | FALSE | FALSE | TRUE |
| TRUE | NULL | UNKNOWN | UNKNOWN | **TRUE** |
| FALSE | NULL | UNKNOWN | **FALSE** | UNKNOWN |
| NULL | NULL | UNKNOWN | UNKNOWN | UNKNOWN |

Two rows there are worth memorising: `TRUE OR NULL` is TRUE (because the result is true
regardless of what the unknown turns out to be), and `FALSE AND NULL` is FALSE (same
reasoning). SQL's logic is not arbitrary — it answers "could this be determined without
knowing the unknown?"
:::

:::failure
Here is the NULL bug that reaches production most often.

```sql runnable
-- "Everyone not in Pune". Looks right.
SELECT name, city FROM users WHERE city <> 'Pune';
```

Count the rows. Now count the whole table. Anyone whose `city` is NULL is **missing from
both** `city = 'Pune'` and `city <> 'Pune'`. The two queries do not partition the table,
and nothing warns you.

The correct version has to say what to do about the unknowns:

```sql runnable
SELECT name, city FROM users WHERE city <> 'Pune' OR city IS NULL;
```

The same trap, worse, with `NOT IN`:

```text
  SELECT * FROM orders WHERE user_id NOT IN (SELECT id FROM banned_users);
```

If `banned_users` contains even one NULL `id`, this returns **zero rows**. Always.
Because `user_id NOT IN (1, 2, NULL)` expands to
`user_id <> 1 AND user_id <> 2 AND user_id <> NULL`, and that last term is UNKNOWN, so
the whole conjunction can never be TRUE.

This is a genuinely notorious bug: the query is syntactically valid, passes review, works
in testing where the subquery has no NULLs, and returns an empty set in production the day
someone inserts a row with a null id. `NOT EXISTS` does not have this behaviour, which is
why experienced engineers reach for it by default.
:::

:::realworld
How teams actually defend against this:

```sql
-- 1. Forbid the unknown where it is meaningless. Most NULL bugs are schema bugs.
ALTER TABLE users ALTER COLUMN city SET NOT NULL;

-- 2. Make the default explicit at read time.
SELECT name, COALESCE(city, 'unknown') AS city FROM users;

-- 3. Prefer NOT EXISTS over NOT IN for anti-joins.
SELECT * FROM orders o
WHERE NOT EXISTS (SELECT 1 FROM banned_users b WHERE b.id = o.user_id);
```

The first is the most valuable and the most often skipped. A column that is `NOT NULL`
cannot produce any of the bugs above. Ask of every nullable column: *what does it mean
when this is unknown?* If there is no good answer, it should not be nullable.
:::

:::debugging
When a query returns the wrong number of rows, check these in order:

1. **Count without the filter.** `SELECT COUNT(*) FROM users` — do you have the rows you
   think you have?
2. **Count each condition separately.** A multi-condition `WHERE` that returns nothing
   usually has one condition at fault; test them one at a time.
3. **Look for NULLs in every column you filter on.**
   `SELECT COUNT(*) FROM users WHERE city IS NULL`. If that number is not zero and your
   filter uses `<>`, `NOT IN` or `!=`, you have found it.
4. **Check your string comparison.** `'Pune'` and `'pune '` are different values. Trailing
   whitespace from an import is a classic.

```sql runnable
SELECT COUNT(*) AS total FROM users;
```

```sql runnable
SELECT COUNT(*) AS missing_age FROM users WHERE age IS NULL;
```

```sql runnable
-- COUNT(column) ignores NULLs; COUNT(*) does not. The gap tells you how many are unknown.
SELECT COUNT(*) AS rows_total, COUNT(age) AS ages_known FROM users;
```
:::

:::performance
Every query in this lesson scans the whole table — look at the "rows examined" figure
under each result. With five rows that is irrelevant. The thing to internalise now is
simply that the number exists and that you can see it, because it is what the index
lesson is about.

One habit to start immediately: **a function applied to a column prevents index use.**

```text
  WHERE LOWER(email) = 'a@b.com'      -- cannot use a plain index on email
  WHERE email = 'a@b.com'             -- can
```

The database would have to compute `LOWER(email)` for every row to know which match, so
the index on `email` is useless. The fix is an index on the *expression*
(`CREATE INDEX ON users (LOWER(email))`) or storing the value already normalised.
:::

:::checkpoint
Using the `users` table, write a query that returns the name and city of everyone who is
**not** in Delhi, including people whose city is unknown, sorted by name.

Then: how many rows should it return? Work it out from `SELECT * FROM users` before you
run it.
:::

:::interview
"What is NULL?" sounds like a beginner question and is used as a filter at every level,
because the answer reveals whether you have debugged a real NULL bug.

A weak answer: "NULL means empty or no value."

A strong answer: "NULL means *unknown*, which makes SQL comparison three-valued — TRUE,
FALSE, UNKNOWN. `WHERE` only keeps TRUE, so `= NULL` never matches and you need `IS NULL`.
The consequence that bites is that `city = 'X'` and `city <> 'X'` do not partition the
table, and `NOT IN` against a subquery containing a single NULL returns zero rows. I use
`NOT EXISTS` for anti-joins and I make columns `NOT NULL` unless 'unknown' has a real
meaning."

That answer takes twenty seconds and demonstrates you have been burned, which is the
thing being tested.
:::

## What you now know

- SQL is declarative: you describe the result, the planner chooses the strategy. That is
  why adding an index speeds up a query you did not change.
- Without `ORDER BY` there is no guaranteed row order, however stable it looks.
- NULL means unknown, which makes comparisons three-valued. `WHERE` keeps only TRUE.
- `= NULL` never matches; use `IS NULL`. `<>` silently excludes NULL rows.
- `NOT IN` with a NULL anywhere in the list returns no rows at all. Prefer `NOT EXISTS`.
- `COUNT(*)` counts rows; `COUNT(column)` skips NULLs. The difference is a useful probe.
- A function wrapped around a column stops an ordinary index being usable.
