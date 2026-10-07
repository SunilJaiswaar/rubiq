---
title: Locking and deadlocks
summary: What each lock blocks, why two correct transactions deadlock, and the migrations that take an exclusive lock on a table you are serving traffic from.
level: expert
minutes: 18
version: "SQL:2016"
status: stable
last_reviewed: "2026-10-07"
tags: [sql, locking, deadlocks, migrations, concurrency]
concepts: [locking, deadlocks, lock-ordering, online-migrations]
prerequisites: [transactions, isolation-levels]
interview:
  - question: What causes a deadlock, and how do you prevent one?
    level: expert
    answer: >-
      Two transactions each holding a lock the other needs, in a cycle. The classic case is
      transaction A locking row 1 then row 2, while B locks row 2 then row 1 — both then wait
      forever, so the database detects the cycle and kills one. The prevention is a
      consistent lock ordering: if every transaction locks rows in ascending primary-key
      order, a cycle is impossible. `ORDER BY id FOR UPDATE` is the practical form. Beyond
      that, keep transactions short and take locks as late as possible, because a lock you
      hold for less time has less chance of participating in a cycle.
    followUps:
      - "Who gets killed, and what should the application do?"
  - question: What is the difference between FOR UPDATE and FOR SHARE?
    level: expert
    answer: >-
      `FOR UPDATE` takes an exclusive row lock: no other transaction can lock or modify those
      rows. `FOR SHARE` allows other readers to also take a share lock but blocks writers —
      useful when you need a row to stay unchanged while you read related data without
      intending to modify it. The trap with `FOR SHARE` is that two transactions both holding
      a share lock and both trying to upgrade to exclusive will deadlock, which is a common
      way to produce one by accident.
    followUps:
      - "When would SKIP LOCKED be the right choice?"
  - question: Why can adding a column be dangerous on a large table?
    level: expert
    answer: >-
      Because DDL needs an ACCESS EXCLUSIVE lock, which conflicts with everything including
      plain SELECTs. On modern Postgres adding a nullable column — or one with a constant
      default — is metadata-only and takes milliseconds, so the lock is brief. The danger is
      that acquiring the lock means waiting for every existing transaction on the table to
      finish, and while it waits, it queues ahead of all new queries. So a long-running
      SELECT plus an ALTER TABLE equals a full outage on that table, even though the ALTER
      itself would have taken 2ms. The fix is a short `lock_timeout` and a retry.
    followUps:
      - "What about adding an index?"
resources:
  - title: "PostgreSQL — Explicit Locking"
    url: https://www.postgresql.org/docs/current/explicit-locking.html
---

## Locks you did not ask for

```sql
-- Every one of these takes a lock, and only one of them says so.
UPDATE accounts SET balance = 0 WHERE id = 1;    -- row lock, exclusive
SELECT * FROM accounts WHERE id = 1 FOR UPDATE;  -- row lock, exclusive
SELECT * FROM accounts WHERE id = 1;             -- no row lock (MVCC)
ALTER TABLE accounts ADD COLUMN note text;       -- TABLE lock, exclusive
CREATE INDEX ON accounts (balance);              -- TABLE lock, blocks writes
```

:::what
A **lock** is a reservation that prevents conflicting access. Postgres takes **row locks**
for writes and **table locks** for schema changes, and locks are held until the transaction
ends — not until the statement ends. A **deadlock** is a cycle of transactions each waiting
for a lock another holds.
:::

:::why
Locks exist because MVCC alone cannot serialise writes. Two readers can see different
versions of a row quite happily, but two writers must agree on which new version exists, so
one has to wait. That is unavoidable.

What is avoidable is *how long* and *how widely* it waits, and that is almost entirely under
your control. The reason to understand locking is not to take more locks — it is that the
locks you already take have a duration you chose without noticing. A transaction that updates
a row and then makes an HTTP call holds that row lock for the length of someone else's
latency. A migration that runs for an hour on a table you are serving blocks every query
against it, including the ones that only read.

Most database-related outages are not slow queries. They are a lock held longer than anyone
intended, and the queue behind it.
:::

:::how
```text
  THE DEADLOCK, exactly

  T1                              T2
  BEGIN;                          BEGIN;
  UPDATE accounts                 UPDATE accounts
    SET ... WHERE id = 1;           SET ... WHERE id = 2;
  -- holds lock on row 1          -- holds lock on row 2

  UPDATE accounts                 UPDATE accounts
    SET ... WHERE id = 2;           SET ... WHERE id = 1;
  -- waits for T2                 -- waits for T1

       T1 ──waits for──▶ T2
        ▲                 │
        └──waits for──────┘        a cycle

  Postgres's deadlock detector notices after deadlock_timeout (1s by
  default) and kills one transaction with SQLSTATE 40P01. The other
  proceeds. The victim's application must retry.

  THE FIX — consistent ordering

  Both transactions lock in ascending id order:

    T1: lock 1, then 2
    T2: lock 1, then 2     ← T2 simply waits at row 1

  No cycle is possible, because you cannot wait for something earlier
  in the order than what you already hold.
```

```sql
-- The practical form:
SELECT * FROM accounts WHERE id IN (1, 2) ORDER BY id FOR UPDATE;
-- One statement, deterministic order, both rows locked.
-- Note: ORDER BY in a FOR UPDATE applies to the lock acquisition
-- order, which is the entire point here.
```
:::

:::internals
```text
  LOCK MODES, and what each conflicts with (Postgres, table level)

  Mode                     Taken by                 Conflicts with
  ------------------------ ------------------------ ------------------
  ACCESS SHARE             SELECT                   ACCESS EXCLUSIVE
  ROW SHARE                SELECT FOR UPDATE        EXCLUSIVE, ACCESS EXCL
  ROW EXCLUSIVE            INSERT/UPDATE/DELETE     SHARE and above
  SHARE UPDATE EXCLUSIVE   VACUUM, CREATE INDEX     itself, SHARE and above
                           CONCURRENTLY
  SHARE                    CREATE INDEX             ROW EXCLUSIVE and above
  ACCESS EXCLUSIVE         ALTER TABLE, DROP,       EVERYTHING,
                           TRUNCATE, VACUUM FULL    including SELECT

  Two facts that explain most incidents:

  1. ACCESS EXCLUSIVE conflicts with ACCESS SHARE. A plain SELECT and
     an ALTER TABLE cannot coexist.

  2. Lock requests QUEUE, and the queue is ordered. So:

       long SELECT running          holds ACCESS SHARE
       ALTER TABLE arrives          waits for ACCESS EXCLUSIVE
       new SELECT arrives           waits BEHIND the ALTER

     The new SELECT is blocked by a statement it does not conflict
     with, because the ALTER is ahead of it in the queue. One slow
     read plus one instant migration takes the table offline.
```
:::

:::failure
**The migration that blocked everything, despite being fast.**

```sql
-- This is metadata-only on Postgres 11+. It takes about 2ms.
ALTER TABLE orders ADD COLUMN note text;

-- Unless: an analytics query has been reading orders for 40 seconds.
-- Then the ALTER waits 40 seconds for ACCESS EXCLUSIVE, and every
-- query arriving in those 40 seconds queues behind the ALTER.
-- Your API returns timeouts for 40 seconds because of a 2ms change.
```

The fix is to refuse to wait:

```sql
SET lock_timeout = '2s';
ALTER TABLE orders ADD COLUMN note text;
-- Fails fast if it cannot get the lock. Retry in a loop.
-- Failing the migration is strictly better than queueing production
-- traffic behind it.
```

**`CREATE INDEX` without `CONCURRENTLY`.**

```sql
CREATE INDEX idx ON orders (customer_id);
-- SHARE lock: reads continue, every write blocks, for the whole build.
-- On 50 million rows that is minutes of failed writes.

CREATE INDEX CONCURRENTLY idx ON orders (customer_id);
-- SHARE UPDATE EXCLUSIVE: reads and writes continue.
-- Costs: two table passes, cannot run inside a transaction, and on
-- failure leaves an INVALID index you must drop manually.
-- Check for one after any failed concurrent build:
--   SELECT indexrelid::regclass FROM pg_index WHERE NOT indisvalid;
```

**`FOR SHARE` upgrading to exclusive — an accidental deadlock factory.**

```sql
-- Both transactions do this:
BEGIN;
  SELECT * FROM accounts WHERE id = 1 FOR SHARE;   -- both succeed
  UPDATE accounts SET balance = 0 WHERE id = 1;    -- both wait forever
-- Each needs the other to release its share lock. Deadlock.
```

If you intend to write, take `FOR UPDATE` from the start. Lock upgrades are a classic source
of deadlocks in otherwise careful code.

**The unordered batch update.**

```ruby
# Two jobs processing overlapping sets, in hash order.
ids.each { |id| Account.find(id).update!(...) }
# The iteration order differs between jobs → cycles → deadlocks
# under load, intermittently, which is the worst way to find out.

ids.sort.each { |id| ... }    # a one-word fix
```
:::

:::realworld
```sql
-- 1. A work queue without a queue server. SKIP LOCKED is the whole trick.
BEGIN;
  SELECT * FROM jobs
  WHERE status = 'pending'
  ORDER BY created_at
  FOR UPDATE SKIP LOCKED
  LIMIT 1;
  -- SKIP LOCKED: ignore rows another worker has locked rather than
  -- waiting for them. Ten workers get ten different jobs with no
  -- coordination and no contention.
  UPDATE jobs SET status = 'running' WHERE id = ...;
COMMIT;

-- NOWAIT is the other variant: error immediately instead of waiting.
SELECT * FROM accounts WHERE id = 1 FOR UPDATE NOWAIT;
-- Useful when "someone else is editing this" is a better answer
-- for the user than a spinner.
```

```sql
-- 2. Diagnosing a live lock problem. Worth memorising.
SELECT
  blocked.pid    AS blocked_pid,
  blocked.query  AS blocked_query,
  blocking.pid   AS blocking_pid,
  blocking.query AS blocking_query,
  blocking.state,
  now() - blocking.xact_start AS blocking_age
FROM pg_stat_activity blocked
JOIN pg_stat_activity blocking
  ON blocking.pid = ANY(pg_blocking_pids(blocked.pid))
WHERE blocked.wait_event_type = 'Lock';

-- Then, having identified it:
SELECT pg_cancel_backend(12345);   -- cancel the query, politely
SELECT pg_terminate_backend(12345); -- kill the connection
```

```ruby
# 3. The migration rules that prevent all of this, as a checklist.
#    - lock_timeout on every migration, with a retry
#    - CREATE INDEX CONCURRENTLY, never plain, on a live table
#    - add a column nullable, backfill in batches, then add NOT NULL
#      via a NOT VALID check constraint and VALIDATE separately
#    - never combine a long backfill and a DDL change in one transaction
class AddNoteToOrders < ActiveRecord::Migration[8.0]
  disable_ddl_transaction!          # required for CONCURRENTLY

  def up
    safety_assured do
      execute "SET lock_timeout = '2s'"
      add_column :orders, :note, :text      # nullable: metadata-only
    end
  end
end
```

The backfill pattern is worth stating explicitly because the obvious version is the dangerous
one: `UPDATE orders SET note = '' ` on ten million rows takes row locks on all of them for the
length of the statement, and generates ten million dead tuples for VACUUM. Batched updates of
a few thousand rows, committing between batches, keep each lock short and let VACUUM keep up.
:::

:::mistakes
**Assuming locks release at the end of the statement.** They release at `COMMIT`. A
transaction that updates a row at the top and then does ten seconds of work holds that lock
for ten seconds.

**Locking in inconsistent order.** The only cause of avoidable deadlocks. `ORDER BY id` on
every multi-row lock, and sort your id lists in application code.

**Not retrying deadlocks.** A deadlock is a normal, expected outcome under concurrency, not a
bug to be eliminated. The victim gets SQLSTATE 40P01; it should retry with backoff and jitter.

**Running a migration without `lock_timeout`.** The migration will wait politely for its lock
and take production down behind it.

**Using `pg_terminate_backend` first.** Try `pg_cancel_backend` — it cancels the query and
leaves the connection, which means the application sees a query error rather than a dropped
connection.

**Taking `FOR SHARE` and then writing.** Two of those deadlock reliably. Take `FOR UPDATE` if
you intend to write.

**Holding a transaction open across a user interaction.** "Lock the record while the form is
open" guarantees locks held for minutes and abandoned by closed tabs. Use optimistic locking
with a version column.
:::

:::tradeoffs
**Pessimistic (`FOR UPDATE`)** — correctness without retries, at the cost of serialising
access and risking deadlock. Right for a short critical section on a hot row, such as
decrementing stock.

**Optimistic (version column)** — no lock held, so no deadlock and no contention, and the
loser redoes its work. Right when conflicts are rare, and the only sane option across a user
interaction.

**`SKIP LOCKED`** — turns a table into a concurrent work queue with no coordination. You give
up ordering guarantees: workers may process out of order, which matters if the jobs are not
independent.

**`NOWAIT`** — fails immediately rather than queueing, which turns a latency problem into an
error you can handle. Better UX than an unbounded wait, worse than a retry when contention is
brief.

**`CREATE INDEX CONCURRENTLY`** — no write blocking, at the cost of two passes, no enclosing
transaction, and an INVALID index to clean up if it fails. On a live table this is not really
a trade-off; it is the only acceptable option.

The judgement that holds: shorten every lock you take, acquire locks in a consistent order,
and set `lock_timeout` on anything that takes a table lock. The default of waiting forever is
the wrong default for a system serving traffic.
:::

:::checkpoint
1. T1 locks row 1 then row 2; T2 locks row 2 then row 1. What happens, what does Postgres do,
   and what is the one-line fix?
2. `ALTER TABLE orders ADD COLUMN note text` is metadata-only and takes 2ms. Describe how it
   causes a 40-second outage.
3. Why does a new `SELECT` get blocked by an `ALTER TABLE` that is itself still waiting?
4. Two transactions take `FOR SHARE` on the same row and then both `UPDATE` it. Outcome?
5. What does `SKIP LOCKED` give you, and what do you give up?
6. Why batch a backfill instead of one big `UPDATE`? Give two reasons.
:::

:::interview
Deadlock questions are testing whether you see it as a cycle rather than as bad luck:

*"A deadlock is a cycle of waits — A holds row 1 and wants row 2, B holds row 2 and wants row
1. Postgres detects the cycle after a timeout and kills one with SQLSTATE 40P01. The prevention
is a consistent lock order: if everything locks in ascending primary-key order, you can never
wait for something earlier than what you already hold, so a cycle is impossible. In practice
that means `ORDER BY id FOR UPDATE` and sorting id lists before iterating."*

Then the point that marks production experience, because it is the one that causes real
outages:

*"The lock problem I actually watch for is migrations. `ALTER TABLE` needs ACCESS EXCLUSIVE,
which conflicts with plain SELECTs, and lock requests queue in order — so if a 40-second
analytics query is running, the ALTER waits behind it and every new query waits behind the
ALTER. A 2ms metadata change takes the table offline for 40 seconds. So every migration gets a
short `lock_timeout` and a retry: failing the migration is strictly better than queueing
production traffic behind it."*

And the one-liner worth having ready: *"a deadlock is a normal outcome under concurrency, not a
bug to eliminate. The application retries with backoff and jitter."*
:::

## What you now know

- Locks are held until `COMMIT`, not until the statement ends.
- A deadlock is a cycle of waits; Postgres detects it and kills one transaction.
- Consistent lock ordering — ascending primary key — makes cycles impossible.
- Deadlocks are expected under concurrency. Retry with backoff and jitter.
- `ACCESS EXCLUSIVE` (DDL) conflicts with everything, including `SELECT`.
- Lock requests queue, so a waiting `ALTER TABLE` blocks queries that do not conflict with
  the running one.
- Set `lock_timeout` on every migration and retry rather than queueing traffic.
- `CREATE INDEX CONCURRENTLY` on any live table; check for INVALID indexes if it fails.
- `FOR SHARE` followed by `UPDATE` deadlocks. Take `FOR UPDATE` if you will write.
- `FOR UPDATE SKIP LOCKED` makes a table a concurrent work queue, giving up strict ordering.
- Batch backfills: short locks, and VACUUM can keep up with the dead tuples.
