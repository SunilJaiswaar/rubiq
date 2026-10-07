---
title: Transactions and locking
summary: What a transaction actually guarantees, why isolation levels matter, and the two ways to stop two requests overwriting each other.
level: advanced
minutes: 15
version: "8.0"
status: stable
last_reviewed: "2026-10-07"
tags: [rails, transactions, locking, concurrency]
concepts: [transactions, isolation, optimistic-locking, pessimistic-locking]
prerequisites: [activerecord, transactions-sql]
interview:
  - question: What does a transaction guarantee, and what does it not?
    level: advanced
    answer: >-
      It guarantees atomicity and durability for the statements inside it: either all of
      them commit or none do, and once committed the result survives a crash. It does not
      guarantee that your read-then-write is safe, because by default another transaction
      can commit between your SELECT and your UPDATE. That is what isolation levels and
      explicit locking are for. Wrapping a check-then-act in a transaction and assuming it
      is now safe is one of the most common concurrency mistakes.
    followUps:
      - "So how do you make a read-then-write safe?"
      - "What is the difference between optimistic and pessimistic locking?"
  - question: Optimistic or pessimistic locking — how do you choose?
    level: advanced
    answer: >-
      Pessimistic locking (`SELECT FOR UPDATE`) takes the lock up front, so conflicting
      transactions wait. Use it when conflicts are likely and the work is short — stock
      decrements, balance transfers. Optimistic locking (a `lock_version` column) takes no
      lock and detects a conflict at save time by checking the version, raising
      `StaleObjectError`. Use it when conflicts are rare or the work is long, such as a
      user editing a form for ten minutes — you cannot hold a database lock for that. The
      trade is waiting versus retrying.
resources:
  - title: "Rails Guides — Optimistic and Pessimistic Locking"
    url: https://api.rubyonrails.org/classes/ActiveRecord/Locking.html
---

## The bug a transaction does not fix

```ruby
# Transfer money. Wrapped in a transaction, so surely safe?
ActiveRecord::Base.transaction do
  from = Account.find(1)
  to   = Account.find(2)

  raise "Insufficient funds" if from.balance < amount

  from.update!(balance: from.balance - amount)
  to.update!(balance: to.balance + amount)
end
```

This is atomic and it is still wrong.

:::problem
Two concurrent transfers from the same account:

```text
  Request A (transfer 100)          Request B (transfer 100)
  balance is 150                    balance is 150
  ─────────────────────             ─────────────────────
  SELECT balance → 150
                                    SELECT balance → 150
  150 >= 100 ✓                      150 >= 100 ✓
  UPDATE balance = 50
                                    UPDATE balance = 50   ← overwrites

  Both succeeded. 200 was transferred out of 150.
  The final balance is 50, not -50, because the second UPDATE
  computed from a stale read.
```

Both transactions were atomic. Neither was isolated from the other. **Atomicity is about
all-or-nothing; it says nothing about concurrent reads.**
:::

:::what
A **transaction** makes a group of statements atomic and durable. An **isolation level**
determines what a transaction can see of concurrent ones. A **lock** forces concurrent
transactions to wait rather than proceed on a stale read.
:::

:::why
Rails and Postgres default to `READ COMMITTED`, which guarantees only that you never read
uncommitted data. It explicitly permits what happened above:

| Anomaly | READ COMMITTED | REPEATABLE READ | SERIALIZABLE |
|---|---|---|---|
| Dirty read (uncommitted data) | prevented | prevented | prevented |
| Lost update (the case above) | **allowed** | prevented¹ | prevented |
| Non-repeatable read (same query, different answer) | **allowed** | prevented | prevented |
| Phantom read (new rows appear) | **allowed** | allowed² | prevented |

¹ Postgres raises a serialization error you must retry. ² Postgres' REPEATABLE READ
actually prevents phantoms too, going beyond the standard.

The default is `READ COMMITTED` because it is fast and sufficient for the overwhelming
majority of queries. The cost is that **every read-then-write you write is unsafe unless you
do something about it.**
:::

## The three fixes

```ruby
# 1. Do not read-then-write. Let the database compute it.
Account.where(id: 1).where("balance >= ?", amount)
       .update_all("balance = balance - #{amount.to_i}")
# One atomic statement. If it updates 0 rows, there were insufficient funds.
# No read, so nothing to be stale.

# 2. Pessimistic lock — take the lock before reading.
ActiveRecord::Base.transaction do
  from = Account.lock.find(1)          # SELECT ... FOR UPDATE
  raise "Insufficient funds" if from.balance < amount
  from.update!(balance: from.balance - amount)
end
# The second transaction blocks at `lock.find` until the first commits,
# then reads the NEW balance.

# 3. Optimistic lock — detect the conflict at save time.
class Account < ApplicationRecord
  # requires an integer column: lock_version, default 0, null: false
end

account = Account.find(1)
# ...time passes, maybe a user is filling in a form...
account.update!(balance: new_balance)
# UPDATE accounts SET balance = ?, lock_version = 1
#   WHERE id = 1 AND lock_version = 0
# If another save bumped the version, 0 rows match → ActiveRecord::StaleObjectError
```

:::how
```text
  PESSIMISTIC — "nobody else touches this until I am done"

    A: SELECT ... FOR UPDATE  ──▶ holds the row lock
    B: SELECT ... FOR UPDATE  ──▶ BLOCKS, waiting
    A: UPDATE, COMMIT         ──▶ releases
    B:                        ──▶ proceeds, reads the new value

    Correct by construction. Cost: B waits. If A is slow, B times out.
    Risk: deadlock if two transactions lock the same rows in different orders.


  OPTIMISTIC — "I will assume nobody did, and check"

    A: read (lock_version = 0)
    B: read (lock_version = 0)
    A: UPDATE ... WHERE lock_version = 0   → 1 row, version becomes 1
    B: UPDATE ... WHERE lock_version = 0   → 0 rows → StaleObjectError

    No waiting at all. Cost: B must retry, and B's user may lose their edits.
```

The deciding question is **how long you hold the read**. A stock decrement reads and writes
in the same millisecond, so pessimistic is right — the wait is negligible. A user editing a
form holds the read for ten minutes, and you cannot hold a database lock for that, so
optimistic is the only option.
:::

:::failure
**Deadlock from inconsistent lock ordering.** This is the classic production incident with
pessimistic locking:

```ruby
# Request A: transfer 1 → 2        Request B: transfer 2 → 1
Account.lock.find(1)                Account.lock.find(2)
Account.lock.find(2)  ← waits on B  Account.lock.find(1)  ← waits on A
# Deadlock. Postgres detects it and kills one with a deadlock error.
```

The fix is to **always acquire locks in a deterministic order**:

```ruby
ActiveRecord::Base.transaction do
  # Sort by id so every transaction locks in the same sequence.
  first, second = [from_id, to_id].sort
  a = Account.lock.find(first)
  b = Account.lock.find(second)
  # ...
end
```

**Long transactions holding locks.** A transaction is open from `transaction do` until the
block ends, and everything inside it holds its locks for that whole time:

```ruby
# Wrong: an HTTP call inside a transaction.
ActiveRecord::Base.transaction do
  order.update!(status: "paid")
  PaymentGateway.charge!(order)    # 3 seconds, maybe 30 on a timeout
  order.update!(charged_at: Time.current)
end
# The row stays locked for the whole gateway call. Under load, every
# request for that order queues, and the connection pool fills.
```

Never do I/O inside a transaction. Keep transactions to database work only.

**`after_commit` versus work inside the transaction.** Covered in the callbacks lesson and
it is the same principle: anything with an external effect belongs after the commit, because
a rollback cannot un-send it.

**Rescuing inside the transaction block swallows the rollback:**

```ruby
ActiveRecord::Base.transaction do
  order.save!
  begin
    inventory.decrement!
  rescue => e
    Rails.logger.error(e)      # swallowed — the transaction COMMITS
  end
end
# The order is saved without the inventory decrement. Partially applied.

# `ActiveRecord::Rollback` is also silently swallowed by design:
ActiveRecord::Base.transaction do
  raise ActiveRecord::Rollback   # rolls back, raises nothing to the caller
end
# So the caller cannot tell it failed. Use a different exception, or
# return a result object.
```
:::

:::internals
**Nested transactions are not nested by default.** Rails joins them into the outer one:

```ruby
ActiveRecord::Base.transaction do          # BEGIN
  order.save!
  ActiveRecord::Base.transaction do        # NOT a new transaction
    raise ActiveRecord::Rollback           # rolls back NOTHING
  end
  # execution continues, outer transaction commits
end
```

That `Rollback` is swallowed and the outer transaction commits. To get a real nested
transaction you must ask for a savepoint:

```ruby
ActiveRecord::Base.transaction(requires_new: true) do
  # SAVEPOINT active_record_1
  raise ActiveRecord::Rollback   # ROLLBACK TO SAVEPOINT — outer survives
end
```

This surprises nearly everyone the first time, and it means a service object calling another
service object that uses transactions does not get the isolation it looks like it has.

**`SELECT FOR UPDATE` variants:**

```ruby
Account.lock.find(1)                      # FOR UPDATE — blocks
Account.lock("FOR UPDATE NOWAIT").find(1) # raises immediately if locked
Account.lock("FOR UPDATE SKIP LOCKED").limit(10)  # skips locked rows
Account.lock("FOR SHARE").find(1)          # others may read, not write
```

`SKIP LOCKED` is how you build a work queue in Postgres: each worker takes rows nobody else
has locked, with no coordination and no waiting. It is what Solid Queue and good_job use.
:::

:::realworld
```ruby
# The pattern for an operation that must be atomic and has side effects.
class PlaceOrder
  def call(params)
    order = nil

    ActiveRecord::Base.transaction do
      order = Order.create!(params)

      # Deterministic lock order prevents deadlock.
      items = Item.lock.where(id: params[:item_ids].sort).to_a
      items.each do |item|
        raise OutOfStock, item.id if item.stock < 1
        item.update!(stock: item.stock - 1)
      end
    end

    # Outside the transaction. Cannot be undone, so must not run before COMMIT.
    OrderMailer.confirmation(order).deliver_later
    order
  end
end

# The no-read alternative, which avoids locking entirely:
updated = Item.where(id: id).where("stock > 0").update_all("stock = stock - 1")
raise OutOfStock if updated.zero?
```

That last two-liner is worth preferring when it fits. No transaction, no lock, no retry — a
single conditional UPDATE is atomic by itself, and "did it affect a row?" is the answer to
"was there stock?". Most inventory and counter problems reduce to this.
:::

:::mistakes
**Rescuing an exception inside a transaction and continuing.** The block completes, so the
transaction commits — the rescue silently converted an abort into a partial write. Re-raise, or
roll back explicitly.

**`rescue ActiveRecord::Rollback` outside the block.** It is swallowed by the transaction by
design and never reaches your handler, so the code after it runs as though nothing happened.

**Assuming a nested `transaction` call is a nested transaction.** By default it joins the outer
one, so an inner rollback rolls back everything. `requires_new: true` creates a savepoint, which
is what people usually mean.

**Doing anything non-transactional inside the block.** An email, an HTTP call, a job enqueued to
Redis — none of it is rolled back, so a failed transaction leaves the side effect behind. Enqueue
after commit, or use `after_commit`.

**`after_save` where `after_commit` was meant.** `after_save` runs inside the transaction, so a
job it enqueues can start before the record is visible to another connection — and may run at all
when the transaction then rolls back.

**Holding a transaction open across a user interaction or a slow loop.** Locks and the connection
are held for the duration, and the transaction's snapshot blocks VACUUM. Open late, commit early.
:::

:::tradeoffs
**Pessimistic.** Correct by construction, no retry logic, and the conflict is resolved by
waiting. Costs: waiting under contention, deadlock risk if ordering is inconsistent, and
total unsuitability for anything holding a read across user interaction.

**Optimistic.** No locks, so no waiting and no deadlocks, and it works across arbitrarily
long gaps — which is the only option for a form. Costs: the loser does work that is thrown
away, you must write retry or conflict-resolution logic, and the user may lose edits.

**A single conditional UPDATE.** No transaction, no lock, no retry — the cheapest correct
answer when the operation can be expressed as one statement. Costs: it only works for
operations the database can compute itself, and it gives you no object-level validations or
callbacks.

The ordering worth internalising: **try the single statement first, then pessimistic for
short conflicts, then optimistic for long ones.** Most people reach for a transaction and
stop, which is the one option that solves nothing on its own.
:::

:::checkpoint
For each, choose the mechanism and justify it:

1. Decrement stock when an order is placed.
2. A user edits a long article in a browser for twenty minutes.
3. Transfer a balance between two accounts.
4. Generate a sequential invoice number with no gaps.
5. Ten background workers pulling jobs from one table.

Then: number 3 has a failure mode the others do not. What is it, and what prevents it?
:::

:::interview
Transactions are a strong senior topic because the junior answer — "wrap it in a
transaction" — is confidently wrong.

Lead with the distinction: *"a transaction gives atomicity, not isolation from concurrent
reads. At READ COMMITTED, which is the Rails and Postgres default, another transaction can
commit between my SELECT and my UPDATE — so a check-then-act is still a race even inside a
transaction. That is the lost update anomaly and the default explicitly permits it."*

Then the three options with the deciding question: *"best case I avoid the read entirely —
one conditional UPDATE, and zero affected rows means the condition failed. If I need the
read, the question is how long I hold it: milliseconds means pessimistic locking, because the
wait is nothing; across user interaction means optimistic, because you cannot hold a row lock
for ten minutes."*

Then the detail that signals operational experience: *"and with pessimistic locking I always
sort the ids before locking, because inconsistent lock ordering is how you get a deadlock in
production. And no HTTP calls inside a transaction — the row stays locked for the whole
gateway timeout."*
:::

## What you now know

- A transaction gives atomicity and durability, not isolation from concurrent reads.
- `READ COMMITTED` — the default — permits lost updates, so every read-then-write is a race.
- Prefer a single conditional `UPDATE`: atomic by itself, and zero affected rows is your
  answer.
- Pessimistic (`lock.find`) for short conflicts; optimistic (`lock_version`) when the read
  is held across user time.
- Always lock in a deterministic order, or you will deadlock.
- Never do I/O inside a transaction — the lock is held for the whole call.
- Nested `transaction` blocks join the outer one unless you pass `requires_new: true`.
- `ActiveRecord::Rollback` is swallowed, so the caller cannot tell it failed.
- `FOR UPDATE SKIP LOCKED` is how a Postgres-backed job queue works.
