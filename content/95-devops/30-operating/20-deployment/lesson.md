---
title: Deploying without downtime
summary: Every zero-downtime deploy rests on one rule — old and new code run simultaneously — and most deployment incidents are that rule being broken.
level: advanced
minutes: 18
version: "1"
status: stable
last_reviewed: "2026-10-07"
tags: [devops, deployment, migrations, rollback, feature-flags]
concepts: [rolling-deploys, backward-compatibility, migrations, rollback]
prerequisites: [containers, transactions]
interview:
  - question: What is the fundamental constraint of a zero-downtime deploy?
    level: advanced
    answer: >-
      Old and new code run at the same time, against the same database. During a rolling deploy
      there is a window — seconds to minutes — where both versions are serving traffic, so every
      change must be compatible with the version it is replacing in *both* directions: the new code
      must work with the old schema, and the old code must keep working with the new schema,
      because a rollback puts it back. Almost every deployment incident is this rule being broken
      — a column renamed in one step, a required field added, an API response shape changed — and
      the discipline is to make every change expand-only until the old version is gone.
    followUps:
      - "So how do you rename a column?"
  - question: How do you rename a database column safely?
    level: advanced
    answer: >-
      In several deploys, never one. Add the new column. Deploy code that writes both and reads the
      old. Backfill in batches. Deploy code that reads the new and still writes both. Verify, then
      deploy code that uses only the new. Finally, in a later release, drop the old column. Each
      step is independently safe to roll back, which is the property that matters — a single-step
      rename is irreversible the moment traffic hits the new code, because rolling back leaves the
      old code looking for a column that no longer exists.
    followUps:
      - "Why is dropping the column a separate release?"
  - question: Blue-green, canary or rolling?
    level: advanced
    answer: >-
      Rolling is the default: replace instances gradually, so you need no extra capacity and the
      blast radius grows slowly. Blue-green runs two complete environments and switches traffic,
      which gives an instant rollback and costs double capacity — and the switch is still
      all-at-once, so a bad release reaches every user. Canary sends a small percentage to the new
      version and compares metrics before proceeding, which is the only one that detects a problem
      before most users see it, at the cost of needing traffic splitting and automated analysis.
      The real answer is usually rolling plus feature flags, because the flag decouples deploying
      the code from enabling the behaviour.
    followUps:
      - "Why does a flag beat a deployment strategy for risk?"
resources:
  - title: "strong_migrations — safe migration patterns"
    url: https://github.com/ankane/strong_migrations
---

## The rule everything follows from

```text
  DURING A ROLLING DEPLOY

    t0   ████████  v1  v1  v1  v1      all old
    t1   ████████  v2  v1  v1  v1      BOTH serving
    t2   ████████  v2  v2  v1  v1      BOTH serving
    t3   ████████  v2  v2  v2  v2      all new

    …and if you roll back, t2 and t1 happen in reverse.

  So every change must satisfy:

    new code  ×  old schema      ✓
    old code  ×  new schema      ✓      ← the one people forget

  The second is what makes rollback possible. A change that only
  works forwards is a change you cannot undo.
```

:::what
A **rolling deploy** replaces instances gradually. **Backward compatibility** means the previous
version continues to work. An **expand-contract** migration adds the new form, migrates, then
removes the old form in a later release. A **feature flag** decouples shipping code from enabling
behaviour.
:::

:::why
Zero-downtime deployment is not a technique so much as a constraint, and naming the constraint
explains every rule that follows.

If you stop the old version before starting the new one, there is downtime. If you do not, the two
versions coexist — and since they share a database, a cache and a queue, every change has to be
compatible with its predecessor. That is the entire content of the discipline.

The direction people miss is backwards. It is natural to check that new code works with the old
schema, because you run it locally against a database you have not migrated yet. It is unnatural
to check that old code works with the new schema, because that situation only arises during a
rollback — which is to say, during an incident, at the worst possible moment to discover a problem.
A change that is irreversible is therefore a change whose failure mode is "we cannot go back", and
that is how a five-minute problem becomes an hour.

This is also why feature flags matter more than the choice of deployment strategy. Blue-green,
canary and rolling all differ in how the *code* arrives. A flag changes what the code *does*
without a deploy at all — so the risky moment moves from a deployment, which takes minutes and is
hard to reverse quickly, to a configuration change, which is instant in both directions. Shipping
dark and enabling gradually is a stronger safety property than any rollout mechanism, and it
composes with all of them.
:::

:::how
```text
  EXPAND-CONTRACT — the pattern behind every safe schema change

  Renaming `name` to `full_name`:

    1. EXPAND     add full_name (nullable, no default)
                  → old code unaffected; new column unused

    2. DUAL WRITE deploy code writing BOTH, reading name
                  → safe to roll back: name is still correct

    3. BACKFILL   batched UPDATE, committing between batches
                  → per the locking lesson: one big UPDATE locks
                    every row and bloats the table

    4. SWITCH     deploy code reading full_name, still writing both
                  → safe to roll back: previous version reads name,
                    which is still being written

    5. STOP       deploy code using only full_name
                  → roll back goes to step 4, which still works

    6. CONTRACT   a LATER release: drop name
                  → only once no running version references it

    Six steps. Each is independently reversible, which is the
    property being bought. The one-step rename is irreversible
    from the instant traffic reaches the new code.

  WHY CONTRACT IS A SEPARATE RELEASE

    Dropping the column in the same deploy as step 5 means a
    rollback to step 4's code finds a missing column. The old
    column must outlive every version that references it,
    including the one you might roll back to.

  CHANGES THAT ARE NEVER SAFE IN ONE STEP

    rename a column or table        → expand-contract
    add NOT NULL                    → add nullable, backfill, then
                                      add the constraint NOT VALID
                                      and VALIDATE separately
    change a column type            → new column, dual write,
                                      switch
    remove a column                 → stop using it, deploy, then
                                      drop in a later release
    add a column with a volatile    → add nullable, backfill in
      default                         batches, then set the default
    add an index on a live table    → CONCURRENTLY, outside a
                                      transaction
    change an enum's meaning        → add the new value, migrate,
                                      remove the old

  QUEUES AND CACHES HAVE THE SAME PROBLEM

    A job enqueued by v1 may be executed by v2, and vice versa.
      → never change a job's argument shape in one deploy; add a
        new parameter with a default, or a new job class
      → this is why the queues lesson says to pass ids rather
        than serialised objects

    A cache entry written by v1 may be read by v2.
      → version the cache key, so v2 writes to a different key and
        old entries simply expire
```
:::

:::example
```ruby
# 1. Adding a required field, safely. Four deploys, not one.

# Deploy 1 — schema only, nothing uses it.
add_column :users, :country, :string          # nullable

# Deploy 2 — write it; tolerate it being absent on read.
class User
  before_validation { self.country ||= infer_country }
  def country_or_default = country || "unknown"
end

# Deploy 3 — backfill, in batches so no lock is held long.
User.where(country: nil).in_batches(of: 1_000) do |batch|
  batch.update_all(country: "unknown")
  sleep 0.05                                   # be kind to replicas
end

# Deploy 4 — now the constraint can be added, in two steps so no
# long lock is taken.
execute <<~SQL
  ALTER TABLE users ADD CONSTRAINT country_not_null
    CHECK (country IS NOT NULL) NOT VALID;
SQL
execute "ALTER TABLE users VALIDATE CONSTRAINT country_not_null;"
# NOT VALID adds the constraint without checking existing rows, so
# it takes a brief lock. VALIDATE then checks them with a much
# weaker lock that does not block writes. Adding NOT NULL directly
# scans the whole table under an exclusive lock.

# 2. An API response change, which has the same constraint with a
#    different client.
# ✗ breaking: a client deployed five minutes ago expects `name`
{ full_name: user.full_name }
# ✓ expand: serve both for a release or two
{ name: user.full_name, full_name: user.full_name }
# then remove `name` once no client sends an old version — which
# for a mobile app may be months, not minutes.

# 3. A feature flag, which decouples the two risks.
if Flipper.enabled?(:new_pricing, current_user)
  NewPricing.call(order)
else
  LegacyPricing.call(order)
end
# Deploy the code with the flag off — zero risk, because the new
# path does not execute. Then enable for 1% of users, watch the
# metrics, and increase. Disabling is instant and needs no deploy,
# which is a fundamentally better rollback than redeploying the
# previous image.
#
# The cost is flag lifecycle: both branches exist, so both must be
# tested, and a flag with no expiry becomes permanent dead code.
# Give every flag an owner and a removal date.
```

```bash
# 4. The deploy sequence that makes rollback real.
#
#   1. migrate FIRST, with only expand-safe changes
#      (so the old code still works against the new schema)
#   2. deploy the new code gradually
#   3. verify: error rate and latency for N minutes
#   4. roll back automatically if a threshold is breached
#
# The ordering matters: migrating after deploying means the new
# code runs against the old schema, which only works if the change
# was expand-only anyway — so expand-only is the requirement
# either way, and migrating first removes one failure mode.
```
:::

:::failure
**A one-step column rename.** The instant traffic reaches the new code, rolling back leaves the old
code querying a column that no longer exists — so the rollback also fails and you are choosing
between two broken states.

**Adding `NOT NULL` directly on a large table.** It scans every row under an exclusive lock,
blocking all access for the duration. Add it as `NOT VALID` and then `VALIDATE`, which takes a much
weaker lock.

**Dropping a column in the same release that stops using it.** A rollback goes to code that still
references it. The drop belongs in a later release, after the old version can no longer be deployed.

**Changing a job's argument shape.** A job enqueued by the old version is executed by the new one,
and the arguments no longer match — so every in-flight job fails. Add a parameter with a default,
or introduce a new job class.

**Not versioning cache keys.** The new version reads an entry written by the old version with a
different structure, and either crashes or silently misinterprets it. Change the key prefix so old
entries are simply never read.

**Migrating without a lock timeout.** As the locking lesson describes, a migration waiting for
`ACCESS EXCLUSIVE` queues every subsequent query behind it — so a 2ms change takes the table
offline for as long as the slowest running statement. Set `lock_timeout` and retry.

**A backfill as one statement.** Ten million rows in one `UPDATE` holds row locks on all of them
and creates ten million dead tuples. Batch it, commit between batches.

**No rollback verification.** A rollback path that has never been exercised is a plan rather than a
capability. Practise it, ideally as part of the normal deploy pipeline.

**Rolling back a deploy that included an irreversible migration.** You cannot. This is why the
migration discipline is not optional: the rollback plan depends entirely on every schema change
being reversible.

**Blue-green with a shared database.** The "instant switch" does not help if both environments
share a schema the new version has already changed. Blue-green makes the code switch atomic, not
the data.

**A canary with no automated comparison.** Sending 5% of traffic to a new version and watching a
dashboard by eye catches the obvious and misses a 2% error increase — which at scale is the thing
you most wanted to catch.

**Long-lived feature flags.** Both branches must be maintained and tested, and a flag nobody owns
becomes permanent dead code with an unclear state in production.
:::

:::realworld
```text
// The strategies, by what each actually buys.
//
//   ROLLING — replace instances gradually
//     + no extra capacity, blast radius grows slowly
//     − both versions run together, so compatibility is
//       mandatory; rollback takes as long as a deploy
//     → the default
//
//   BLUE-GREEN — two full environments, switch traffic
//     + instant rollback by switching back
//     − double capacity; the switch is all-at-once so a bad
//       release reaches everyone; shared database still
//       constrains schema changes
//     → good when a fast, complete rollback matters more than
//       cost
//
//   CANARY — a small percentage, compared automatically
//     + the only strategy that detects a problem before most
//       users see it
//     − needs traffic splitting and automated metric comparison;
//       low-traffic services take a long time to reach
//       significance
//     → best risk reduction per deploy, most infrastructure
//
//   FEATURE FLAGS — orthogonal to all three
//     + deploy dark, enable gradually, disable instantly with no
//       deploy
//     − both code paths exist and must be tested; flags need
//       owners and expiry
//     → the strongest single safety property, and it composes
//       with any of the above
```

```text
// Why a flag beats a deployment strategy for risk:
//
//   A deployment strategy controls how the CODE arrives. A flag
//   controls what the code DOES.
//
//   Rolling back a deploy: minutes, and it reverts everything in
//     that release including unrelated changes.
//   Turning off a flag: seconds, and it reverts exactly one
//     behaviour.
//
//   So the sequence that minimises risk is: ship the code dark
//   behind a flag, verify the deploy itself is clean, then enable
//   the behaviour separately and gradually. The two risks —
//   "does the new code deploy" and "does the new behaviour work"
//   — are separated, and each can be reverted independently.
```

```text
// The checklist worth having, since deployment incidents are
// repetitive:
//
//   Is every schema change expand-only?
//   Can the previous version run against the new schema?
//   Does the migration have a lock_timeout and a retry?
//   Are backfills batched with commits between?
//   Have any job argument shapes changed?
//   Are cache keys versioned?
//   Does the API response still contain the old field names?
//   Is the rollback path tested, not assumed?
//   Is the risky behaviour behind a flag?
//   Is there an automated rollback trigger on error rate?
//
// Most deployment incidents are one of the first six, and all six
// are checkable statically before anything ships.
```
:::

:::mistakes
**A one-step rename.** Irreversible the moment traffic arrives.

**`NOT NULL` added directly.** A full scan under an exclusive lock.

**Dropping a column in the same release that stops using it.**

**Changing job argument shapes.** In-flight jobs fail.

**Unversioned cache keys.** New code misreads old entries.

**No `lock_timeout` on a migration.** It queues production behind it.

**An unbatched backfill.** Long locks and table bloat.

**An untested rollback path.** A plan, not a capability.

**Blue-green assumed to solve schema changes.** It switches code, not data.

**A canary judged by eye.** Misses the small regression you wanted to catch.

**Flags with no owner or expiry.** Permanent dead code and unclear production state.
:::

:::tradeoffs
**Rolling** — no extra capacity, gradual blast radius; both versions coexist, so compatibility is
mandatory and rollback is another full deploy.

**Blue-green** — instant rollback, a complete environment to test against; double the capacity, an
all-at-once switch, and no help with schema compatibility.

**Canary with automated analysis** — catches regressions before most users are affected; needs
traffic splitting, metric comparison and enough traffic for statistical significance.

**Feature flags** — instant, behaviour-scoped reversal with no deploy, and the two risks
separated; both branches must be maintained, and flags accumulate without lifecycle management.

**Expand-contract migrations** — every step independently reversible; several deploys and a longer
calendar for a change that feels like one line.

**A single-step migration** — one deploy, and your rollback plan is now fiction.

**Migrating before deploying** — the old code must tolerate the new schema, which is the
expand-only requirement anyway, and it removes one failure ordering.

**Automated rollback on error rate** — recovery in a minute without a human; requires a threshold
that does not fire on noise, which takes tuning.

The sentence that generates the rest: **old and new run simultaneously, so every change must be
compatible in both directions.** Expand-contract follows, separate contraction releases follow,
versioned cache keys and additive job arguments follow — and a feature flag is the cheapest way to
make the risky part of a change reversible in seconds rather than minutes.
:::

:::checkpoint
1. State the fundamental constraint. Which direction of compatibility is usually forgotten, and
   why?
2. Give the six steps of renaming a column, and say why the drop is a separate release.
3. Why is `ADD NOT NULL` dangerous, and what is the two-step alternative?
4. What breaks if you change a job's argument shape in one deploy?
5. Why version a cache key across a deploy?
6. Rolling, blue-green, canary — what does each buy and cost?
7. Why does a feature flag give better risk control than any deployment strategy?
8. Name four items from the pre-deploy checklist that are statically checkable.
:::

:::interview
State the constraint first, because everything else is derived from it:

*"Old and new code run at the same time against the same database. During a rolling deploy there is
a window where both versions serve traffic, so every change must be compatible in both directions —
the new code with the old schema, and the old code with the new schema, because a rollback puts the
old code back. The second direction is the one people forget, and the reason is structural: you
naturally test new code against an unmigrated local database, but old-code-against-new-schema only
happens during a rollback, which is during an incident. So a change that only works forwards fails
exactly when you most need to undo it."*

Give the rename as the worked example, because it demonstrates the discipline:

*"Renaming a column takes six deploys. Add the new column nullable. Deploy code writing both and
reading the old. Backfill in batches. Deploy code reading the new and still writing both. Deploy
code using only the new. Then, in a later release, drop the old one. Each step is independently
reversible, which is the property being bought — and the drop has to be a separate release because
rolling back the fifth step lands on code that still references the old column."*

Be precise about the migration hazards:

*"Two specific ones I always check. `ADD NOT NULL` scans every row under an exclusive lock, so on a
large table it blocks all access — add it as `NOT VALID` and `VALIDATE` separately, which takes a
much weaker lock. And every migration gets a short `lock_timeout` with a retry, because a migration
waiting for an exclusive lock queues every subsequent query behind it, so a two-millisecond change
takes the table offline for as long as the slowest running statement."*

Then the strategy answer, with the point that matters most:

*"Rolling by default, blue-green when a complete instant rollback is worth double the capacity,
canary when I need to detect a regression before most users see it. But the honest answer is
rolling plus feature flags, because a flag beats all three for risk: a deployment strategy controls
how the code arrives, a flag controls what the code does. Rolling back a deploy takes minutes and
reverts everything in the release; turning off a flag takes seconds and reverts one behaviour. So I
ship dark, verify the deploy is clean, then enable the behaviour separately and gradually — which
separates 'does this deploy' from 'does this work' and makes each independently reversible."*
:::

## What you now know

- Old and new code run simultaneously, so changes must be compatible in both directions.
- Old-code-against-new-schema is the forgotten direction, and it is what rollback requires.
- Expand-contract: add the new form, dual write, backfill, switch reads, stop, then drop later.
- The contraction must be a separate release, after no deployable version references the old form.
- `ADD NOT NULL` scans under an exclusive lock; use `NOT VALID` then `VALIDATE`.
- Every migration needs a `lock_timeout` and a retry, or it queues production behind it.
- Backfills must be batched with commits between batches.
- A job enqueued by the old version is executed by the new one, so argument shapes must be
  additive.
- Version cache keys, so the new version never reads an entry it would misinterpret.
- API fields must be served in both forms until no old client remains — months for mobile.
- Rolling costs no capacity; blue-green buys instant rollback at double cost; canary detects
  early.
- Blue-green does not solve schema compatibility — it switches code, not data.
- A canary needs automated metric comparison; judging by eye misses small regressions.
- A feature flag reverts one behaviour in seconds, which beats any rollout mechanism.
- Ship dark, verify the deploy, then enable gradually — separating two independent risks.
- Flags need an owner and an expiry, or they become permanent dead code.
- An untested rollback path is a plan, not a capability.
