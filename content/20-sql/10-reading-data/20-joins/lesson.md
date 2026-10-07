---
title: Joins
summary: Why data is split across tables in the first place, what each join type actually does to row counts, and the two bugs that produce wrong numbers.
level: basic
minutes: 18
version: "SQL:2016"
status: stable
last_reviewed: "2026-09-20"
tags: [sql, joins, normalisation, databases]
concepts: [joins, normalisation, cardinality, anti-joins]
prerequisites: [select, where]
interview:
  - question: Explain the difference between INNER JOIN and LEFT JOIN.
    level: basic
    answer: >-
      `INNER JOIN` keeps only rows where the join condition matched on both sides. `LEFT
      JOIN` keeps every row from the left table regardless, filling the right table's
      columns with NULL where there was no match. So an inner join can return fewer rows
      than the left table has, and a left join never returns fewer. You want LEFT JOIN
      whenever "no related rows" is a valid, interesting state — customers with no orders,
      posts with no comments.
    followUps:
      - "What happens if you put a condition on the right table in the WHERE clause of a LEFT JOIN?"
      - "How do you find rows with NO match at all?"
  - question: You LEFT JOIN orders onto users and get more rows than you have users. Is that a bug?
    level: intermediate
    hint: How many orders can one user have?
    answer: >-
      No — that is the join working correctly. A join multiplies rows: if a user has three
      orders, that user appears three times, once per matching order. The row count of a
      join is driven by the *cardinality* of the relationship, not by the size of either
      table. It becomes a bug when you then aggregate — `SUM(users.credit_limit)` would
      count that user's credit limit three times. The fix is to aggregate in a subquery
      before joining, or to count distinct.
    followUps:
      - "Show me a query where a join inflates a SUM, and how you would fix it."
    realWorld: >-
      This is the single most common cause of dashboards reporting revenue that is too
      high: a join fanning out before a SUM.
  - question: How would you find all users who have never placed an order?
    level: intermediate
    answer: >-
      Either a LEFT JOIN with `WHERE orders.id IS NULL` — join everything, then keep the
      rows where the right side did not match — or `NOT EXISTS` with a correlated
      subquery. `NOT EXISTS` is usually preferable: it expresses the intent directly, it
      can stop as soon as it finds one match, and unlike `NOT IN` it is not broken by
      NULLs in the subquery.
    followUps:
      - "Why is NOT EXISTS safer than NOT IN here?"
resources:
  - title: "PostgreSQL documentation — Joins between tables"
    url: https://www.postgresql.org/docs/current/tutorial-join.html
---

## Why is the data in pieces?

You could keep everything in one table:

| order_id | total | customer_name | customer_city | customer_email |
|---|---|---|---|---|
| 10 | 500 | Asha | Pune | asha@example.com |
| 11 | 250 | Asha | Pune | asha@example.com |
| 12 | 900 | Cal | Delhi | cal@example.com |

:::problem
Asha's details are stored twice, and will be stored again with every order she places.

- **Update anomaly.** Asha moves to Delhi. You must find and update every row that
  mentions her. Miss one and the database now holds two contradictory answers to "where
  does Asha live?", with nothing to say which is right.
- **Insert anomaly.** A new customer who has not ordered yet has nowhere to exist.
- **Delete anomaly.** Deleting Cal's only order deletes the only record that Cal exists.
- **Space.** Every byte of customer detail is duplicated per order.
:::

:::history
Edgar Codd set this out in 1970, and the fix — **normalisation** — is to store each fact
exactly once, in the table it belongs to, and link tables by key. One row per customer in
`users`; one row per order in `orders`, carrying a `user_id` that points back.

That solves every anomaly above. It creates exactly one new problem: the data a question
needs is now spread across tables, so you need an operation to put it back together for
the duration of a query. That operation is the join.
:::

:::what
A **join** combines rows from two tables according to a condition, producing a single
result set. It does not modify the tables; it is a view assembled for this query only.
:::

Our seeded tables — `users` and `orders`, where `orders.user_id` points at `users.id`:

```sql runnable
SELECT * FROM users;
```

```sql runnable
SELECT * FROM orders;
```

## INNER JOIN: only the matches

```sql runnable
SELECT users.name, orders.id, orders.total
FROM users
JOIN orders ON users.id = orders.user_id
ORDER BY orders.id;
```

:::how
```text
users                      orders
┌────┬───────┐            ┌────┬─────────┬───────┐
│ id │ name  │            │ id │ user_id │ total │
├────┼───────┤            ├────┼─────────┼───────┤
│ 1  │ Asha  │◄───┐       │ 10 │    1    │  500  │──┐
│ 2  │ Bo    │    ├───────│ 11 │    1    │  250  │──┤ both match Asha
│ 3  │ Cal   │◄─┐ │       │ 12 │    3    │  900  │  │
│ 4  │ Dee   │  └─────────│                      │  │
└────┴───────┘            └────┴─────────┴───────┘  │
                                                     ▼
INNER JOIN result:  Asha|10|500   Asha|11|250   Cal|12|900

Bo and Dee have no orders  → dropped.
Asha has two orders        → appears twice.
```
:::

Two things to notice, both of which matter more than they look:

1. **Bo and Dee are gone.** An inner join silently discards rows with no match. If you
   were counting customers, you just undercounted.
2. **Asha appears twice.** A join *multiplies* rows according to how many matches each
   row has.

## LEFT JOIN: keep everything on the left

```sql runnable
SELECT users.name, orders.id, orders.total
FROM users
LEFT JOIN orders ON users.id = orders.user_id
ORDER BY users.name;
```

Now Bo and Dee are present with NULLs where their order would be. That NULL is
information: *this user has no orders*.

:::why
Choose the join type by asking what "no match" means for your question.

| Question | Join | Because |
|---|---|---|
| "Revenue per order" | INNER | An order with no user is corrupt data; dropping it is fine. |
| "All customers and their spend" | LEFT | A customer who spent nothing is still a customer. |
| "Customers who never ordered" | LEFT + `IS NULL` | You specifically want the non-matches. |
| "Do these two sets overlap?" | INNER | You only care about matches. |

The mistake is reaching for `JOIN` by habit and quietly losing the rows you were asked
about.
:::

## Anti-joins: finding the absence

```sql runnable
-- Everyone who has never ordered.
SELECT users.name
FROM users
LEFT JOIN orders ON users.id = orders.user_id
WHERE orders.id IS NULL
ORDER BY users.name;
```

The pattern: join everything, then keep only the rows where the right side failed to
match. It reads oddly the first time and then becomes automatic.

:::failure
**The bug that eats your LEFT JOIN.** Put a condition on the right table in `WHERE`
instead of `ON`, and your LEFT JOIN silently becomes an INNER JOIN.

```sql runnable
-- Intent: every user, with their orders over 300.
-- Reality: users with NO large orders have vanished.
SELECT users.name, orders.total
FROM users
LEFT JOIN orders ON users.id = orders.user_id
WHERE orders.total > 300
ORDER BY users.name;
```

Bo and Dee are gone again. The LEFT JOIN did its job and produced `orders.total = NULL`
for them — and then `WHERE NULL > 300` evaluated to UNKNOWN, so `WHERE` dropped the row.

The fix is to filter in the `ON` clause, which applies *during* the join rather than after:

```sql runnable
SELECT users.name, orders.total
FROM users
LEFT JOIN orders ON users.id = orders.user_id AND orders.total > 300
ORDER BY users.name;
```

**`ON` decides what counts as a match. `WHERE` filters the assembled result.** For an
INNER JOIN the distinction does not matter. For a LEFT JOIN it is the difference between
the right answer and a wrong one that looks plausible.
:::

:::failure
**The bug that inflates your totals.** This one reaches dashboards.

```sql runnable
-- Asha has two orders, so her row is duplicated by the join.
SELECT users.name, users.credit_limit, orders.total
FROM users
JOIN orders ON users.id = orders.user_id
ORDER BY users.name;
```

Look at Asha: her `credit_limit` of 1000 appears twice. Now aggregate it:

```sql runnable
-- WRONG. Asha's credit limit is counted once per order.
SELECT SUM(users.credit_limit) AS total_credit
FROM users
JOIN orders ON users.id = orders.user_id;
```

```sql runnable
-- The real answer:
SELECT SUM(credit_limit) AS total_credit FROM users;
```

The join fanned out, and the SUM counted the duplicates. This is the standard mechanism
behind "why does the dashboard say we made more money than we did".

**How to spot it.** Any `SUM` or `AVG` over a column from the *one* side of a one-to-many
join is suspect. The row count is a tell: if your result has more rows than the table you
are summing from, you are double counting.

**How to fix it.** Aggregate first, then join:

```sql runnable
SELECT users.name, users.credit_limit, COUNT(orders.id) AS order_count, SUM(orders.total) AS spent
FROM users
LEFT JOIN orders ON users.id = orders.user_id
GROUP BY users.name, users.credit_limit
ORDER BY users.name;
```

Here each user appears once, `COUNT` and `SUM` operate over that user's group, and
`credit_limit` is in the `GROUP BY` so it is unambiguous — exactly one value per group.
:::

:::mistakes
**Forgetting the `ON` clause.** In most databases a `JOIN` with no condition is a
**cross join**: every row of the left paired with every row of the right. Four users and
three orders gives twelve rows. On real tables it is how a query accidentally asks for
billions of rows and takes down a database.

**Ambiguous column names.** If both tables have `id`, `SELECT id` is an error. Qualify
everything — `users.id` — in any query touching more than one table. It also makes the
query readable six months later.

**Assuming `JOIN` means `INNER JOIN`.** It does, in standard SQL. Writing `INNER` is
optional. Writing it anyway makes the choice look deliberate to the next reader, which is
worth four characters.
:::

:::tradeoffs
**Normalisation plus joins.** Each fact stored once, so it cannot become inconsistent.
Writes are cheap — change a customer's city in one place. The cost is that reads must
reassemble, and every read pays for the join.

**Denormalisation.** Store the customer's city on the order too. Reads get cheaper: no
join. The cost is that the same fact now lives in two places, so every write must update
both, and the moment one update fails you have two answers to the same question and no
way to tell which is right.

The honest rule is not "always normalise". It is: **normalise by default, denormalise
deliberately, and only when you can name the query you are speeding up and the write path
that keeps the copies in step.** A reporting table rebuilt nightly from normalised source
data is a good denormalisation. A `city` column copied onto orders because a join felt
slow, with no process keeping it current, is how data becomes untrustworthy.
:::

:::internals
The planner has three strategies, and which one it picks explains most join performance
surprises.

```text
NESTED LOOP            for each left row, look up matches on the right
                       cost ≈ left_rows × lookup_cost
                       great when the left side is small AND the right side is indexed
                       catastrophic when neither is true

HASH JOIN              build a hash table of the smaller side, then stream the larger
                       cost ≈ left_rows + right_rows, plus memory for the hash
                       the usual choice for large unindexed equality joins

MERGE JOIN             sort both sides, then walk them together like a zip
                       cost ≈ sorting, then one pass
                       chosen when both inputs are already sorted — e.g. by index order
```

The practical consequence: **a join on an unindexed foreign key degrades badly.** With an
index, a nested loop does an index lookup per row. Without one, every left row triggers a
full scan of the right table — `left_rows × right_rows` work. A foreign key column with
no index is one of the most reliable causes of a query that was fine in development and
collapses in production.

Most databases do *not* create an index on a foreign key automatically. PostgreSQL
indexes the primary key but not the referencing column. Check this on any slow join
before anything else.
:::

:::performance
```sql runnable
-- Watch "rows examined" under the result for each of these.
SELECT COUNT(*) FROM users JOIN orders ON users.id = orders.user_id;
```

Order of operations worth internalising: **filter before you join wherever you can.**
Joining two million-row tables and then keeping 50 rows is far more expensive than
filtering each side to 50 rows and joining those. Good planners reorder this for you when
they can prove it is safe — but they cannot always prove it, especially across subqueries
and views.
:::

:::realworld
```sql
-- The shape you will write a hundred times: entity plus aggregated children,
-- keeping entities with no children.
SELECT
  u.id,
  u.name,
  COUNT(o.id)                     AS order_count,
  COALESCE(SUM(o.total), 0)       AS lifetime_value,
  MAX(o.created_at)               AS last_order_at
FROM users u
LEFT JOIN orders o ON o.user_id = u.id
GROUP BY u.id, u.name
ORDER BY lifetime_value DESC;
```

Three deliberate choices in there:
- `LEFT JOIN`, so customers with no orders still appear.
- `COALESCE(SUM(...), 0)`, because `SUM` of no rows is NULL, not zero — and a report
  showing "NULL" where it means "nothing yet" looks broken.
- `GROUP BY u.id, u.name` rather than just `u.name`, so two customers with the same name
  do not get merged into one row.

That third one is the sort of bug that survives a long time because it only appears when
you happen to have two customers called the same thing.
:::

:::checkpoint
Using `users` and `orders`, write one query that returns every city, the number of
customers in it, and the total amount those customers have spent — including cities whose
customers have never ordered.

Then: before running it, work out whether `SUM(orders.total)` in your query can
double-count anything, and why or why not.
:::

:::interview
Joins come up at every level, and the question that separates candidates is not "what is a
LEFT JOIN" — it is some version of *"your query returns more rows than expected, what
happened?"*

The answer that lands: *"A join multiplies rows by the cardinality of the match. If a user
has three orders, that user appears three times. That is correct for listing orders and
wrong the moment you aggregate a column from the user side — `SUM(user.credit_limit)` will
triple-count. I check for it by comparing the result's row count against the base table's,
and I fix it by aggregating in a subquery before joining, or by grouping on the user's key."*

Then, if you want to clearly signal production experience, add: *"and the related bug is
putting a condition on the right table in `WHERE` rather than `ON`, which quietly turns a
LEFT JOIN into an INNER JOIN."*
:::

## What you now know

- Normalisation stores each fact once to avoid update, insert and delete anomalies. Joins
  reassemble the pieces for a single query.
- `INNER JOIN` keeps matches only — it silently drops rows you may have been asked about.
- `LEFT JOIN` keeps every left row, filling the right with NULL. Choose by asking what "no
  match" means for your question.
- A join *multiplies* rows by match cardinality. More rows than the base table is normal,
  and dangerous once you aggregate.
- `ON` defines a match; `WHERE` filters the result. On a LEFT JOIN, confusing them turns
  it into an INNER JOIN.
- Anti-join: `LEFT JOIN ... WHERE right.id IS NULL`, or `NOT EXISTS`.
- `SUM` of no rows is NULL. Wrap it in `COALESCE` when you mean zero.
- Foreign keys are usually not indexed automatically. Check that first on a slow join.
