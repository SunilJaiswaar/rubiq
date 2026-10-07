---
title: Transactions and isolation levels
summary: ACID in terms of what breaks without it, the four anomalies, and why READ COMMITTED — the default almost everywhere — still lets your balance go negative.
level: advanced
minutes: 20
version: "SQL:2016"
status: stable
last_reviewed: "2026-10-07"
tags: [sql, transactions, acid, isolation, mvcc]
concepts: [transactions, isolation-levels, mvcc, anomalies]
prerequisites: [select, aggregates]
interview:
  - question: What does ACID stand for, and which letter do people misunderstand?
    level: advanced
    answer: >-
      Atomicity (all or nothing), Consistency (constraints hold before and after), Isolation
      (concurrent transactions do not see each other's partial work), Durability (a commit
      survives a crash). The misunderstood one is Consistency — it means your declared
      constraints are not violated, not that the data is logically correct. Nothing about
      ACID prevents you from writing a correct-but-wrong value. Isolation is the other
      misunderstood one, because it is not binary: it is a dial, and the default setting on
      most databases permits anomalies people assume are impossible.
    followUps:
      - "Which anomalies does the default level allow?"
  - question: What is the difference between READ COMMITTED and REPEATABLE READ?
    level: advanced
    answer: >-
      Under READ COMMITTED each statement sees a fresh snapshot, so reading the same row
      twice in one transaction can give different values — a non-repeatable read. Under
      REPEATABLE READ the snapshot is taken once at the start of the transaction, so all
      reads are consistent with each other. Postgres implements both with MVCC, so readers
      never block writers in either. The practical consequence is that under READ COMMITTED
      a check-then-act sequence is unsafe, because the row can change between the check and
      the act.
    followUps:
      - "So how do you make check-then-act safe?"
  - question: Does SERIALIZABLE mean transactions run one at a time?
    level: advanced
    answer: >-
      No — it means the outcome is equivalent to some serial order. Postgres implements it
      with Serializable Snapshot Isolation: transactions run concurrently and the database
      tracks read/write dependencies, aborting one with a serialization failure if the
      interleaving could not have arisen serially. That is the key operational consequence —
      under SERIALIZABLE your application must be prepared to retry, because a correct
      transaction can fail through no fault of its own.
    followUps:
      - "Where would you put that retry logic?"
resources:
  - title: "PostgreSQL — Transaction Isolation"
    url: https://www.postgresql.org/docs/current/transaction-iso.html
---

## The problem transactions solve

```sql
-- Move 100 from account 1 to account 2.
UPDATE accounts SET balance = balance - 100 WHERE id = 1;
-- ← the process is killed here
UPDATE accounts SET balance = balance + 100 WHERE id = 2;
-- 100 has ceased to exist.
```

```sql
BEGIN;
  UPDATE accounts SET balance = balance - 100 WHERE id = 1;
  UPDATE accounts SET balance = balance + 100 WHERE id = 2;
COMMIT;
-- Killed anywhere before COMMIT: neither update happened.
```

:::what
A **transaction** is a group of statements that takes effect as a unit. **ACID** names its
four guarantees: **Atomicity** (all or nothing), **Consistency** (declared constraints hold
at the boundaries), **Isolation** (concurrent transactions do not observe each other's
partial work), **Durability** (once committed, it survives a crash).
:::

:::why
Each letter exists because of a specific failure that happened to real systems.

**Atomicity** exists because processes die mid-sequence. Without it every multi-statement
operation needs hand-written compensation logic, and that logic can itself be interrupted.

**Durability** exists because `COMMIT` returning before the data is safe means a crash loses
acknowledged work — you told the user their payment succeeded. This is why durability costs
an fsync, and why disabling it is so tempting and so dangerous.

**Isolation** is the interesting one, because it is the only one that is a dial rather than a
switch. Perfect isolation is slow: if transactions truly could not observe each other at all,
concurrency would be minimal. So every database offers weaker levels, and every level is
defined by *which anomalies it still permits*. That makes isolation the one ACID property you
have to make a decision about — and the default is weaker than most people assume.
:::

:::how
```text
  THE FOUR ANOMALIES, in order of severity

  Dirty read        — you see another transaction's UNCOMMITTED change.
                      T1: UPDATE balance = 0  (not committed)
                      T2: SELECT balance      → 0
                      T1: ROLLBACK            → that 0 never existed.

  Non-repeatable    — you read a row twice and get different values,
  read                because another transaction committed in between.
                      T1: SELECT balance → 500
                      T2: UPDATE balance = 100; COMMIT
                      T1: SELECT balance → 100

  Phantom read      — you run the same query twice and get different ROWS,
                      because another transaction inserted matching ones.
                      T1: SELECT count(*) WHERE city='Pune' → 3
                      T2: INSERT ... 'Pune'; COMMIT
                      T1: SELECT count(*) WHERE city='Pune' → 4

  Lost update /     — two transactions read, compute, and write; one
  write skew          overwrites the other, or each is individually valid
                      while the pair violates an invariant.


  WHICH LEVEL ALLOWS WHAT

  Level             | dirty | non-repeat | phantom | write skew
  ------------------|-------|------------|---------|-----------
  READ UNCOMMITTED  |  yes  |    yes     |   yes   |    yes
  READ COMMITTED    |  no   |    yes     |   yes   |    yes     ← the usual default
  REPEATABLE READ   |  no   |    no      |   no*   |    yes
  SERIALIZABLE      |  no   |    no      |   no    |    no

  * The standard permits phantoms at REPEATABLE READ. Postgres's
    implementation does not allow them, because it uses a snapshot.
    This is why "REPEATABLE READ" means measurably different things
    on Postgres and MySQL, and why quoting the standard is not enough.
```
:::

:::internals
```text
  MVCC — why readers do not block writers

  Postgres never overwrites a row in place. An UPDATE writes a NEW
  version and marks the old one as dead, each version stamped with the
  transaction that created it (xmin) and the one that deleted it (xmax).

      accounts, id = 1
        version A:  balance 500,  xmin 100, xmax 150   ← dead
        version B:  balance 400,  xmin 150, xmax null  ← live

  A transaction takes a SNAPSHOT: the set of transaction ids it should
  consider committed. It then reads whichever version is visible to that
  snapshot. So:

    - A reader never waits for a writer: the old version is still there.
    - A writer never waits for a reader.
    - Two writers to the SAME ROW do block, because only one new
      version can win.

  READ COMMITTED  → a new snapshot per statement.
  REPEATABLE READ → one snapshot for the whole transaction.

  That single difference is the entire distinction between the two
  levels, and it explains both: a per-statement snapshot is exactly
  what makes a read non-repeatable.

  The cost of this design is dead versions, which VACUUM reclaims. A
  long-running transaction holds a snapshot, which prevents vacuuming
  anything newer — which is why an idle-in-transaction connection can
  bloat a table it never touched.
```
:::

:::failure
**The lost update, which READ COMMITTED does not prevent.**

```sql
-- Both transactions run at READ COMMITTED. Balance starts at 500.

-- T1                                   -- T2
BEGIN;                                  BEGIN;
SELECT balance FROM accounts WHERE id=1;
-- 500
                                        SELECT balance FROM accounts WHERE id=1;
                                        -- 500
UPDATE accounts SET balance = 400
  WHERE id = 1;
COMMIT;
                                        UPDATE accounts SET balance = 450
                                          WHERE id = 1;
                                        COMMIT;

-- Final balance: 450. T1's withdrawal of 100 has vanished.
-- Both transactions committed. No error was reported.
```

Three fixes, and the difference between them is the thing to understand:

```sql
-- 1. Let the database do the arithmetic. Best when it applies.
UPDATE accounts SET balance = balance - 100 WHERE id = 1;
-- The read and the write are one statement, so there is no gap.

-- 2. Lock the row for the duration. Pessimistic.
BEGIN;
  SELECT balance FROM accounts WHERE id = 1 FOR UPDATE;  -- T2 now waits here
  UPDATE accounts SET balance = 400 WHERE id = 1;
COMMIT;

-- 3. Optimistic locking: fail if the row moved under you.
UPDATE accounts SET balance = 400, lock_version = 2
WHERE id = 1 AND lock_version = 1;
-- 0 rows updated → someone else got there first → retry.
-- This is what Rails' optimistic locking does.
```

**Write skew, which even REPEATABLE READ does not prevent.** The anomaly that justifies
SERIALIZABLE:

```sql
-- Rule: at least one doctor must remain on call.
-- Two doctors, both on call, both try to go off call at once.

-- T1                                       -- T2
SELECT count(*) FROM shifts                 SELECT count(*) FROM shifts
  WHERE on_call = true;  -- 2                 WHERE on_call = true;  -- 2
-- "2 > 1, safe to leave"                   -- "2 > 1, safe to leave"
UPDATE shifts SET on_call = false            UPDATE shifts SET on_call = false
  WHERE doctor = 'A';                          WHERE doctor = 'B';
COMMIT;                                      COMMIT;

-- Zero doctors on call. Each transaction was individually correct.
-- They wrote to DIFFERENT rows, so nothing conflicted.
```

Snapshot isolation cannot catch this: there is no write-write conflict. Only SERIALIZABLE
detects the read-write dependency and aborts one.

**`BEGIN` does not retry itself.** Under SERIALIZABLE — or with optimistic locking, or on
deadlock — a correct transaction can fail. Code that does not retry turns a transient
serialization failure into a 500.
:::

:::realworld
```sql
-- 1. Set the level per transaction, not globally.
BEGIN ISOLATION LEVEL SERIALIZABLE;
  -- the handful of operations with a cross-row invariant
COMMIT;
```

```ruby
# 2. The retry wrapper. Non-negotiable if you use SERIALIZABLE.
def with_retry(attempts: 3)
  tries = 0
  begin
    ActiveRecord::Base.transaction(isolation: :serializable) { yield }
  rescue ActiveRecord::SerializationFailure, ActiveRecord::Deadlocked
    tries += 1
    raise if tries >= attempts
    sleep(0.05 * (2**tries) * (0.5 + rand))   # exponential backoff with jitter
    retry
  end
end
# The jitter matters: without it, two transactions that collided once
# back off by the same amount and collide again.
```

```ruby
# 3. The rule that causes the most production incidents:
#    no network calls inside a transaction.
ActiveRecord::Base.transaction do
  order.update!(status: "paid")
  PaymentGateway.charge!(order)   # WRONG
end
# The transaction holds its locks for the duration of an HTTP call to
# someone else's server. A slow gateway becomes lock contention, then
# connection-pool exhaustion, then an outage in an unrelated endpoint.
# Also: if the gateway succeeds and the commit fails, you have charged
# a card for an order that does not exist.
#
# Commit the state change, then enqueue the side effect.
```

```sql
-- 4. Statement and lock timeouts, so a stuck transaction cannot
--    take the database with it.
SET statement_timeout = '5s';
SET lock_timeout = '2s';
SET idle_in_transaction_session_timeout = '10s';
```

That last setting is the one people discover during an incident. A connection that holds an
open transaction and then does nothing blocks VACUUM and can block DDL indefinitely — a
deploy running a migration hangs behind a web request that opened a transaction and went to
sleep.
:::

:::mistakes
**Assuming the default is strong.** READ COMMITTED permits non-repeatable reads, phantoms and
lost updates. Most application bugs attributed to "a race condition" are this.

**Check-then-act across two statements.** `SELECT` to see if a username is free, then
`INSERT`. Between them, someone else inserts. The fix is a unique constraint — a database
constraint is the only check that cannot be raced, because it is enforced at write time.

**Long transactions.** A transaction open for minutes holds its snapshot, blocking VACUUM and
accumulating locks. Open late, commit early.

**Catching an exception inside a transaction and continuing.** Once a statement has errored,
Postgres marks the transaction aborted and rejects everything until rollback. Rescuing and
carrying on produces `current transaction is aborted` for every subsequent statement.

**Thinking SERIALIZABLE is free correctness.** It converts anomalies into aborts. Without a
retry loop you have traded silent wrongness for visible failure — which is better, but only
if you handle it.

**Trusting `REPEATABLE READ` to mean one thing.** Postgres forbids phantoms at that level;
the standard permits them. Code that is correct on Postgres can be wrong on another engine at
the same declared level.
:::

:::tradeoffs
**READ COMMITTED** — maximum concurrency, the default, and you must handle lost updates
yourself with `FOR UPDATE`, atomic arithmetic or a version column. Correct for the vast
majority of CRUD.

**REPEATABLE READ** — consistent reads for the whole transaction, which is what a report
spanning several queries needs. Still permits write skew. On Postgres the extra cost is
small; the extra risk is serialization failures on conflicting updates.

**SERIALIZABLE** — the only level that prevents write skew, and the only one that requires a
retry loop. Postgres's SSI makes it cheaper than people expect; the cost is aborts under
contention, which grows non-linearly as conflicting transactions pile up.

**Pessimistic (`FOR UPDATE`)** — predictable, no retries, serialises access to the row, and
risks deadlock if two transactions lock rows in different orders. Good for short critical
sections on a contended row.

**Optimistic (version column)** — no locks held, excellent when conflicts are rare, and the
loser must redo its work. Good for a long user-facing edit: locking a record while someone
fills in a form is worse.

The rule worth keeping: use READ COMMITTED plus atomic statements or explicit locks by
default, reach for SERIALIZABLE for the few operations with a genuine cross-row invariant, and
express every invariant you can as a constraint — because a constraint is the only guarantee
that does not depend on every future caller being careful.
:::

:::checkpoint
1. Two transactions read balance 500, then write 400 and 450. Final value, and the name of
   the anomaly?
2. Why does `UPDATE accounts SET balance = balance - 100` not have that problem?
3. Both doctors check "2 on call, safe to leave" and both leave. Which isolation levels allow
   this, and which prevents it?
4. Under Postgres MVCC, why does a reader not block a writer — and why *do* two writers to
   the same row block?
5. What breaks when you put an HTTP call inside a transaction? Name two separate failures.
6. You SELECT to check a username is free, then INSERT. What is the only reliable fix?
:::

:::interview
Define isolation as a dial rather than a guarantee — that framing is most of the answer:

*"Atomicity, Consistency, Isolation, Durability — but isolation is the only one that is a
setting. Each level is defined by which anomalies it still permits, and the default on most
databases is READ COMMITTED, which allows non-repeatable reads, phantoms and lost updates. So
most 'race condition' bugs are not exotic; they are the default isolation level behaving as
documented."*

Then demonstrate the lost update concretely, because it is the one with everyday consequences,
and give the three fixes with their distinction: *"atomic arithmetic in a single statement if
the operation allows it, `SELECT ... FOR UPDATE` if I need to hold the row across statements,
or a version column if conflicts are rare and I would rather not hold a lock."*

For senior roles, write skew is the differentiator:

*"The case that justifies SERIALIZABLE is write skew — two transactions each read a condition,
each act on it validly, and they write to different rows, so there is no write-write conflict
for snapshot isolation to detect. Both doctors see two people on call and both go off call.
Only SERIALIZABLE catches that, by tracking read-write dependencies — and it catches it by
aborting one, which means the application needs a retry loop with backoff and jitter."*

Finish with the operational rule, which signals production experience: *"no network calls
inside a transaction. It holds locks for the duration of someone else's latency, and if the
remote call succeeds while the commit fails you have charged a card for an order that does not
exist."*
:::

## What you now know

- A transaction makes a group of statements all-or-nothing and durable past a crash.
- Isolation is a dial. Each level is defined by the anomalies it still allows.
- READ COMMITTED — the usual default — permits non-repeatable reads, phantoms and lost
  updates.
- Postgres MVCC keeps row versions, so readers never block writers; same-row writers do
  block.
- READ COMMITTED takes a snapshot per statement; REPEATABLE READ takes one per transaction.
- Fix lost updates with atomic arithmetic, `FOR UPDATE`, or a version column.
- Write skew survives REPEATABLE READ; only SERIALIZABLE prevents it, by aborting one side.
- SERIALIZABLE requires a retry loop with exponential backoff and jitter.
- Never put a network call inside a transaction.
- Check-then-act cannot be made safe in application code. Use a constraint.
