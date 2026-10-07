---
title: Migrations that do not take the site down
summary: A migration is a lock on a production table. Which ones are safe, which block writes, and how to tell.
level: advanced
minutes: 13
version: "8.0"
status: stable
last_reviewed: "2026-10-07"
tags: [rails, migrations, postgres, locking]
concepts: [migrations, locks, zero-downtime]
prerequisites: [indexes, activerecord]
interview:
  - question: Why can adding an index take a site down?
    level: advanced
    answer: >-
      `CREATE INDEX` takes a lock that blocks writes to the table for as long as it takes to
      build, which on a large table is minutes. Every insert and update queues behind it,
      the connection pool fills with waiting requests, and the application stops responding
      — including for tables that are not being indexed, because the pool is shared.
      `CREATE INDEX CONCURRENTLY` avoids the write lock at the cost of being slower and
      unable to run inside a transaction, which is why Rails needs
      `disable_ddl_transaction!`.
    followUps:
      - "Which other migrations block writes?"
      - "Why must adding a NOT NULL column with a default be treated carefully?"
  - question: Why must you never deploy a column rename in one step?
    level: advanced
    answer: >-
      Because old and new application code run simultaneously during a deploy. Rename
      `email` to `email_address` and the old processes, which are still serving traffic,
      query a column that no longer exists — every request fails until the deploy
      completes. The safe form is expand-and-contract: add the new column, write to both,
      backfill, switch reads, stop writing the old one, and drop it in a later deploy.
      Several deploys, no downtime.
resources:
  - title: "strong_migrations — unsafe migration detection"
    url: https://github.com/ankane/strong_migrations
---

## A migration is a lock

```ruby
class AddIndexToOrders < ActiveRecord::Migration[8.0]
  def change
    add_index :orders, :user_id
  end
end
```

On a development database with 200 rows this is instantaneous. On a production table with
40 million rows it holds a lock for several minutes.

:::problem
Every write to `orders` waits for that lock. Requests pile up, each holding a database
connection. The pool — typically 5 to 25 connections — fills. New requests cannot get a
connection, so they fail, **including requests that have nothing to do with `orders`**.

So a migration on one table takes the whole application down, and the symptom looks like a
general outage rather than a migration problem.
:::

:::what
Migrations differ in **what lock they take and for how long**. A safe migration takes a
brief lock on metadata. An unsafe one holds a lock while rewriting or scanning the whole
table.
:::

:::how
```text
  SAFE — metadata only, milliseconds regardless of table size

    add_column (no default, nullable)
    add_index ... algorithm: :concurrently
    drop_table on an unreferenced table
    add_column with a default           (Postgres 11+, Rails 5+)

  BLOCKS WRITES — holds ACCESS EXCLUSIVE while scanning or rewriting

    add_index                            (without concurrently)
    add_column ... null: false           (without a default, on existing rows)
    change_column type                   (rewrites every row)
    add_foreign_key                      (validates every existing row)
    add_check_constraint                 (same)
    remove_column                        (brief, but see below)

  DANGEROUS FOR A DIFFERENT REASON — breaks running code

    rename_column
    rename_table
    remove_column                        (old code still SELECTs it)
    change_column_null                   (if old code writes NULL)
```

The second category is a performance problem. The third is a correctness problem, and it is
the one people underestimate.
:::

## Why renames and drops break deploys

:::failure
During a rolling deploy there is a window — often several minutes — where **old and new
code are both serving traffic**.

```text
  t=0    All processes: v1 code. Schema: has `email`.
  t=1    Migration runs: RENAME email TO email_address
  t=2    Process A restarted → v2 code, queries email_address   ✓
         Process B still v1  → queries email                     ✗ every request 500s
  t=3    Process B restarted → v2                                ✓

  The window at t=2 can be minutes. Every request to B fails.
```

`remove_column` has the same problem in a subtler form: Active Record caches the column
list at boot and issues `SELECT "orders"."id", "orders"."email", ...` listing every column
it knows about. Drop the column and old processes' queries reference a column that is gone.

**The fix is expand and contract**, across several deploys:

```ruby
# Deploy 1 — expand. Add the new column. Nothing reads it yet.
add_column :users, :email_address, :string
add_index  :users, :email_address, algorithm: :concurrently

# Deploy 2 — write both. Old code reads `email`; new code writes both.
class User < ApplicationRecord
  before_save { self.email_address = email }
end

# Deploy 3 — backfill in batches, not one UPDATE.
User.where(email_address: nil).in_batches(of: 1_000) do |batch|
  batch.update_all("email_address = email")
  sleep 0.1              # let replication and other queries breathe
end

# Deploy 4 — switch reads to the new column. Still writing both.

# Deploy 5 — contract. Stop writing the old one, then drop it.
#   Tell Active Record to ignore it BEFORE the drop, so old
#   processes stop selecting it:
class User < ApplicationRecord
  self.ignored_columns = ["email"]
end
# Deploy 6 — now remove_column :users, :email
```

Six deploys to rename a column. That is the actual cost of zero downtime, and it is why
schema design matters more in a system that cannot stop.
:::

:::why
The reason this is worth the ceremony is that the alternative is not "a short outage" — it
is an outage of unpredictable length during which the application is returning 500s and you
cannot easily roll back, because the schema has already changed.

A rollback after a destructive migration means restoring data, and `down` methods for data
migrations are frequently impossible to write correctly. So the expand-and-contract
discipline is really about **keeping every intermediate state deployable in both
directions.**
:::

## The specific traps

```ruby
# 1. Adding a NOT NULL column to an existing table.
add_column :orders, :status, :string, null: false
# → fails: existing rows would violate it.

# Correct, in Postgres 11+ — the default is stored in metadata, not written to rows:
add_column :orders, :status, :string, null: false, default: "pending"
# Instant, even on 40 million rows. On Postgres 10 and earlier this rewrote
# the whole table — which is why the old advice was never to do it.

# 2. Index on a large table.
add_index :orders, :user_id                      # blocks writes
add_index :orders, :user_id, algorithm: :concurrently   # does not
# Requires:
class AddIndex < ActiveRecord::Migration[8.0]
  disable_ddl_transaction!      # CONCURRENTLY cannot run in a transaction
  def change
    add_index :orders, :user_id, algorithm: :concurrently
  end
end

# 3. Foreign key on a large table — validation scans every row.
add_foreign_key :orders, :users, validate: false   # instant: no scan
validate_foreign_key :orders, :users                # separate migration, no write lock

# 4. Changing a column type rewrites the table.
change_column :orders, :total, :decimal
# Instead: add a new column, backfill, switch, drop.

# 5. A data migration in a schema migration.
#    Don't. It locks the table for the duration and cannot be retried safely.
#    Use a rake task or a one-off job, batched.
```

:::internals
**Why `CONCURRENTLY` is slower and what it costs.** A normal `CREATE INDEX` takes one pass
over the table under a write lock. `CONCURRENTLY` takes two passes plus a wait for existing
transactions to finish, so it is typically two to three times slower in wall-clock time —
and it can **fail partway**, leaving an invalid index behind:

```sql
-- After a failed concurrent build:
SELECT indexrelid::regclass FROM pg_index WHERE NOT indisvalid;
-- An invalid index is not used by queries and still costs writes. Drop it and retry.
DROP INDEX CONCURRENTLY idx_orders_user_id;
```

This is why a concurrent index build needs monitoring rather than fire-and-forget, and why
`strong_migrations` warns about it rather than just rewriting your migration for you.

**Lock queueing is the mechanism that makes this an outage.** Postgres locks queue, and a
queued `ACCESS EXCLUSIVE` request blocks every *subsequent* lock request including plain
reads:

```text
  Running:   a long SELECT              holds ACCESS SHARE
  Waiting:   ALTER TABLE                wants ACCESS EXCLUSIVE  ← queued
  Waiting:   a simple SELECT            wants ACCESS SHARE      ← queued behind the ALTER

  So one long-running query plus one DDL statement blocks all reads.
```

Which is why you set a lock timeout: fail fast rather than queueing behind a slow query.

```ruby
# In the migration, or globally:
execute "SET lock_timeout = '5s'"
# Better to have the migration fail and retry than to block the site for a minute.
```
:::

:::realworld
```ruby
# Gemfile — this is the single highest-value addition for a growing Rails app.
gem "strong_migrations"

# It then refuses unsafe migrations at development time, with the safe version:
#
#   === Dangerous operation detected #strong_migrations ===
#   Adding an index non-concurrently blocks writes. Instead, use:
#
#     class AddIndexToOrders < ActiveRecord::Migration[8.0]
#       disable_ddl_transaction!
#       def change
#         add_index :orders, :user_id, algorithm: :concurrently
#       end
#     end
```

The value is that it moves this knowledge out of people's heads and into a tool. Nobody
remembers which of fifteen operations is safe on which Postgres version — and the one time
it matters, it is 3am.

```ruby
# Also worth configuring:
config.active_record.migration_error = :page_load   # fail loudly on pending migrations
config.active_record.dump_schema_after_migration = Rails.env.development?
```
:::

:::mistakes
**Editing a migration that has already run elsewhere.** Your database has the new version and
everyone else's has the old one, with the same version number recorded — so nobody's schema
matches and nothing reports it. Write a new migration instead.

**Putting data changes in a schema migration.** A backfill inside a schema change means the
migration holds its lock for the length of the backfill, and re-running it in a fresh environment
executes business logic against an empty database. Separate them.

**Referencing a model class from a migration.** `User.find_each` uses today's model against a
historical schema, so a validation or a callback added later breaks a migration that used to work.
Use `execute` or a bare table reference.

**Trusting `schema.rb` as the source of truth for structure the dumper cannot represent.**
Partial indexes, check constraints, triggers and functions are lost in the Ruby dumper. Switch to
`structure.sql` if you use any of them.

**No `down` and no plan.** `irreversible migration` discovered during a rollback is the worst
possible timing. If it genuinely cannot be reversed, say so explicitly and make the forward path
safe instead.

**Running a migration without a statement or lock timeout.** Covered in the locking lesson: the
migration waits politely and queues production behind it.
:::

:::tradeoffs
**Running migrations with the app up** means no maintenance window and no coordination, and
the price is the expand-and-contract discipline — more deploys, intermediate states, and
code that temporarily handles both schemas.

**A maintenance window** makes any migration safe and trivially simple, and costs you
downtime plus the organisational weight of scheduling it.

Which is right genuinely depends on scale. A three-user internal tool should take the
window and do the rename in one migration — six deploys is absurd for that. A system where
downtime has a cost should never take a lock it does not have to.

The mistake is applying either answer unthinkingly: the internal tool with a six-deploy
column rename is wasting effort, and the high-traffic app with a casual `add_index` is one
migration away from an incident.
:::

:::checkpoint
For each, say safe or unsafe, and give the safe version:

1. `add_column :users, :verified, :boolean, default: false, null: false` on 50M rows.
2. `add_index :events, [:user_id, :created_at]` on 200M rows.
3. `rename_column :users, :name, :full_name`.
4. `remove_column :orders, :legacy_ref`.
5. `add_foreign_key :orders, :users`.
6. An `UPDATE` setting a new column for every existing row.

Then: which of these is unsafe for a reason that has nothing to do with locking?
:::

:::interview
Migration safety is a strong senior signal because it only comes from having operated
something.

On indexes: *"`CREATE INDEX` blocks writes for the duration, so on a large table every
insert queues, the connection pool fills, and the whole app stops — not just that table,
because the pool is shared. `CONCURRENTLY` avoids the write lock, needs
`disable_ddl_transaction!`, is a few times slower, and can fail leaving an invalid index, so
it needs checking afterwards."*

On renames, the key insight is about deploys rather than databases: *"during a rolling
deploy old and new code both serve traffic, so renaming a column means the old processes
query something that no longer exists. It is expand-and-contract: add, dual-write,
backfill in batches, switch reads, `ignored_columns`, then drop — several deploys."*

The answer that shows judgement rather than recitation: *"and I would put
`strong_migrations` in the Gemfile, because nobody reliably remembers which of fifteen
operations is safe on which Postgres version, and the one time it matters is at 3am."*
:::

## What you now know

- An unsafe migration blocks writes, fills the connection pool, and takes down the whole
  app — not just the table.
- A queued `ACCESS EXCLUSIVE` lock blocks subsequent reads too, so one slow query plus one
  DDL statement stops everything. Set a `lock_timeout`.
- `add_index` blocks; `algorithm: :concurrently` with `disable_ddl_transaction!` does not,
  and can leave an invalid index on failure.
- `add_column` with a default is instant on Postgres 11+ and rewrote the table before that.
- `add_foreign_key ... validate: false` then `validate_foreign_key` separately avoids the
  scan.
- Renames and drops break running code during a rolling deploy. Expand and contract, over
  several deploys, using `ignored_columns` before a drop.
- Backfill in batches with a pause, never one `UPDATE`.
- `strong_migrations` moves this out of memory and into a tool.
