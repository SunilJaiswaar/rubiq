---
title: Replication and sharding
summary: Replication buys read capacity and availability; sharding buys write capacity and costs you joins, transactions and the ability to change your mind.
level: expert
minutes: 18
version: "1"
status: stable
last_reviewed: "2026-10-07"
tags: [system-design, replication, sharding, partitioning]
concepts: [replication, sharding, partition-keys, hot-spots]
prerequisites: [consistency, transactions]
interview:
  - question: What does replication solve, and what does it not?
    level: expert
    answer: >-
      It solves read capacity, availability and durability — more copies means more read throughput,
      survival of a node failure, and geographic locality. It does not solve write capacity, because
      every replica must apply every write, so adding replicas increases total write work rather
      than dividing it. It also does not solve data volume: every replica holds the full dataset.
      So replication is the answer to "too many reads" or "we cannot afford downtime", and sharding
      is the answer to "too many writes" or "it does not fit". Confusing the two is the most common
      scaling mistake, because replication is so much cheaper to adopt.
    followUps:
      - "So when is sharding actually necessary?"
  - question: How do you choose a shard key?
    level: expert
    answer: >-
      By asking what every query filters on, and whether the values are evenly distributed. The key
      must appear in almost every read, or those reads become scatter-gather across all shards; it
      must spread load evenly, or one shard becomes the bottleneck; and it should keep related data
      together, or every operation becomes a distributed transaction. Those three pull in different
      directions, which is why it is hard. For a multi-tenant system, tenant id usually satisfies
      all three — unless one tenant is a hundred times larger than the others, which is the case
      that breaks it.
    followUps:
      - "What do you do about that one huge tenant?"
  - question: Why is resharding so painful?
    level: expert
    answer: >-
      Because with naive modulo hashing, changing the shard count rehashes almost every key — going
      from 4 to 5 shards moves about 80% of the data, during which the system must serve traffic
      from a moving dataset. Consistent hashing reduces that to roughly 1/N of the keys, which is
      the main reason it exists. The alternative is to over-provision logical shards: create 1024
      virtual shards mapped onto 4 physical nodes, so growing means moving whole virtual shards
      rather than rehashing anything. That decision has to be made up front, which is why shard
      count is one of the few things genuinely worth getting right early.
    followUps:
      - "How does consistent hashing achieve that?"
resources:
  - title: "Designing Data-Intensive Applications, chapters 5-6"
    url: https://dataintensive.net/
---

## Two different problems

```text
  REPLICATION — the same data, several copies

    ┌─────────┐      ┌─────────┐      ┌─────────┐
    │ primary │ ───▶ │replica 1│      │replica 2│
    │  ALL    │      │  ALL    │      │  ALL    │
    │  data   │      │  data   │      │  data   │
    └─────────┘      └─────────┘      └─────────┘

    solves:  read capacity, availability, durability, locality
    costs:   every write applied N times, replication lag,
             stale reads
    does NOT solve:  write capacity, data volume

  SHARDING — different data, several nodes

    ┌─────────┐      ┌─────────┐      ┌─────────┐
    │ shard 1 │      │ shard 2 │      │ shard 3 │
    │ users   │      │ users   │      │ users   │
    │ A-H     │      │ I-P     │      │ Q-Z     │
    └─────────┘      └─────────┘      └─────────┘

    solves:  write capacity, data volume
    costs:   no cross-shard joins, no cross-shard transactions,
             a routing layer, and resharding is a project
    does NOT solve:  availability (each shard still needs replicas)

  So production systems do both: each shard is replicated. The two
  are orthogonal, and conflating them is the most common error.
```

:::what
**Replication** keeps copies of the same data on several nodes. **Sharding** (partitioning) splits
data across nodes by a **shard key**. A **hot spot** is a shard receiving disproportionate load.
**Consistent hashing** maps keys to nodes such that adding a node moves only a small fraction of
keys.
:::

:::why
These are different answers to different questions, and the reason to be strict about that is that
replication is cheap and sharding is expensive — so almost everyone reaches for replication, and
some fraction of them are solving the wrong problem.

Replication costs you a configuration change and some lag. It gives you more read throughput, a
node you can lose, and the option of a replica in another region. For a read-heavy system — which
most systems are, often by a ratio of a hundred to one — that is the whole answer.

What it cannot do is reduce write work. Every replica applies every write, so ten replicas do ten
times the total write work for exactly the same write capacity as one. If writes are the
bottleneck, replication makes it worse.

Sharding is the answer there, and it is expensive in a way that is easy to underestimate. You lose
joins across shards, transactions across shards, and uniqueness constraints across shards. You
gain a routing layer, a rebalancing problem, and a shard key that is very difficult to change
later. Teams routinely shard a year before they need to and spend that year paying for distributed
operations that a bigger machine would have handled.

Which gives the sequence worth following: **make one machine bigger, then cache, then replicate
reads, then split by function, and shard last.** A modern server holds several terabytes and
handles tens of thousands of writes per second. That ceiling is much higher than most estimates
assume, and the arithmetic from the fundamentals lesson is how you find out where you actually are.
:::

:::how
```text
  SHARDING STRATEGIES

  RANGE — users A-H, I-P, Q-Z; or by date

    + range queries work: "all orders in March" hits one shard
    + easy to reason about and to rebalance by splitting a range
    − hot spots are structural: sharding by date means ALL writes
      go to today's shard, so one node takes 100% of the write load
      and the rest are read-only archives

  HASH — shard = hash(key) % N

    + even distribution, which is the whole point
    − range queries become scatter-gather across every shard
    − changing N rehashes nearly everything

  CONSISTENT HASHING — keys and nodes on a ring

      hash space 0 ─────────────────────────── 2^32
                  │    N1      │   N2    │  N3  │
                  ▼            ▼         ▼      ▼
      a key goes to the first node clockwise from its hash

    Adding N4 takes over only the arc between its position and the
    previous node, so roughly 1/N of the keys move rather than all
    of them. Virtual nodes (each physical node placed at many ring
    positions) smooth the distribution, because with 3 nodes at 3
    positions the arcs are badly uneven.

  DIRECTORY — a lookup table from key to shard

    + complete flexibility, including moving one noisy tenant to
      its own shard
    − the directory is a dependency on every query and must be
      cached, replicated and kept consistent

  WHAT YOU LOSE WHEN YOU SHARD

    cross-shard JOIN        → application-side join, or denormalise
    cross-shard TRANSACTION → a saga with compensating actions, or
                               two-phase commit and its blocking
                               failure mode
    global UNIQUE           → a central allocator, or a key scheme
                               that embeds the shard (snowflake ids)
    global ORDER BY + LIMIT → fetch N from every shard, merge, take
                               N. Costs N × shards rows.
    COUNT(*)               → scatter-gather, or a maintained
                               counter per shard

  Each of those is a feature the database gave you for free and
  that you now implement.
```
:::

:::example
```text
// Choosing a shard key: the three requirements, in tension.

  1. Present in almost every query
       Shard users by id, then "all orders for user X" is one shard
       — good. But "all orders in the last hour across all users"
       is every shard.

  2. Evenly distributed
       Shard by country and the US shard is 40% of your data.
       Shard by hash(user_id) and it is even by construction.

  3. Keeps related data together
       Shard orders by order_id and a user's orders are scattered,
       so "this user's order history" is scatter-gather and
       "transfer between two of this user's accounts" is a
       distributed transaction.
       Shard by user_id and both are local.

  For a multi-tenant application, tenant_id usually satisfies all
  three — which is why it is the default answer — and fails on
  requirement 2 the moment one tenant is a hundred times larger
  than the median. That case needs explicit handling: a directory
  mapping, so the large tenant gets its own shard.
```

```ruby
# Read/write splitting — the cheap win, done carefully.
class ApplicationRecord < ActiveRecord::Base
  connects_to database: { writing: :primary, reading: :replica }
end

# Rails routes reads to the replica and writes to the primary, and
# keeps a session on the primary for a window after a write —
# which is the read-your-writes implementation from the consistency
# lesson, built in.
config.active_record.database_selector = { delay: 2.seconds }

# The three queries that must NOT go to a replica:
#   - a read followed by a write based on it (lost update, with
#     replication lag widening the window)
#   - anything inside a transaction
#   - a read whose staleness is a correctness problem
ActiveRecord::Base.connected_to(role: :writing) do
  balance = account.lock!.balance        # must be the primary
  account.update!(balance: balance - 100)
end
```

```text
// Snowflake ids — unique across shards with no coordination.
//
//   64 bits:  [41 bits timestamp][10 bits node][12 bits sequence]
//
//   + globally unique with no central allocator
//   + roughly time-ordered, so index inserts stay sequential and
//     a range scan on id approximates a range scan on time
//   + the node bits can encode the shard, so an id tells you where
//     its row lives — which removes a directory lookup
//   − leaks creation time, which is sometimes a privacy issue
//   − 10 bits means 1024 nodes maximum
//   − clock skew or a backwards clock step breaks uniqueness, so
//     the generator must refuse to go backwards
//
// Compare with UUIDv4: unique with no coordination and no ordering,
// so index inserts are random and write amplification on a B-tree
// is much worse. UUIDv7 fixes that by making the high bits a
// timestamp, and is the better modern default when you do not need
// the shard to be embedded.
```

```text
// Hot spots, and how they actually arise.
//
//   Sharding by timestamp     → all writes to today's shard.
//                                Structural, not accidental.
//   Sharding by tenant        → one enterprise customer is 40% of
//                                the load.
//   Sharding by user          → a celebrity account with 50M
//                                followers.
//   Sharding by a sequential  → all new rows to the highest shard.
//     id without hashing
//
//   Fixes, in order of preference:
//     - hash or salt the key, which destroys range queries
//     - split the hot key: user_id + bucket, so one celebrity
//       becomes 100 keys, read with a scatter-gather over 100
//     - a directory mapping, moving the hot tenant to its own
//       shard
//     - cache in front of the hot shard, which often removes the
//       problem entirely for reads
//
//   The last one is worth trying first: a hot spot on reads is a
//   caching problem, and only a hot spot on writes genuinely
//   requires resharding.
```
:::

:::failure
**Sharding to solve a read problem.** Reads scale with replicas and a cache. Sharding adds
distributed-systems cost and does nothing for read capacity that a replica would not have done
more cheaply.

**Replicating to solve a write problem.** Every replica applies every write, so you have increased
total write work for no additional write capacity.

**A shard key missing from most queries.** Every read becomes scatter-gather, so latency is the
slowest shard's and the tail compounds exactly as in the fundamentals lesson. This is the mistake
that makes a sharded system slower than the single machine it replaced.

**Sharding by timestamp.** All writes land on the current shard by construction, so you have the
operational cost of sharding and the write capacity of one node.

**Naive modulo hashing.** Growing from 4 shards to 5 rehashes about 80% of the keys, and that
migration must happen while serving traffic. Consistent hashing or over-provisioned logical shards,
decided before you shard.

**Too few logical shards.** 1024 virtual shards onto 4 machines costs nothing now and makes every
future growth a move of whole shards. 4 shards onto 4 machines makes the next step a rehash.

**Assuming replicas are backups.** They replicate a `DROP TABLE` faithfully and immediately.
Backups exist for human error and corruption; replicas for hardware failure.

**Read-modify-write across a replica boundary.** Reading from a replica and writing to the primary
loses concurrent updates, and replication lag makes the window much larger than a local race.

**Unbounded trust in replication lag.** It is milliseconds until a bulk update, a long
transaction, or a migration, and then it is minutes. Code correct only under low lag fails during
exactly the incidents that cause lag.

**Distributed transactions by default.** Two-phase commit blocks if the coordinator dies while
participants hold locks, so a coordinator failure can freeze every shard involved. Sagas with
compensating actions are the usual answer, and they require designing the compensation — which is
sometimes impossible, as there is no un-sending an email.

**Forgetting cross-shard uniqueness.** A unique index is per shard. Enforcing global uniqueness
needs a central allocator or a key scheme that makes it unnecessary.
:::

:::realworld
```text
// The scaling sequence, in the order to actually do it.
//
//   1. A bigger machine. Unglamorous, and a modern server holds
//      several terabytes and serves tens of thousands of writes
//      per second. Doubling hardware is hours of work; sharding is
//      quarters.
//   2. Indexes and query fixes. Frequently a 100× improvement for
//      a day's work, and it is strictly cheaper than any
//      architecture change.
//   3. Caching. Removes read load entirely rather than serving it
//      faster.
//   4. Read replicas. Scales reads to the limit of write
//      throughput.
//   5. Functional separation — move a high-write table to its own
//      database. Keeps every query local within each database and
//      gets much of sharding's benefit without a shard key.
//   6. Shard. Last, deliberately, with a key chosen from the
//      actual query patterns.
//
// Most systems never reach 6, and some that did got there early
// and paid for it.
```

```text
// What the managed options change.
//
//   Vitess (MySQL)       — sharding with a routing layer that
//                           understands SQL, so some cross-shard
//                           queries work. What YouTube runs on.
//   Citus (Postgres)     — distributed Postgres; a distribution
//                           column per table, co-located joins
//                           where keys match.
//   CockroachDB/Spanner  — automatic range sharding with
//                           distributed transactions, so you keep
//                           SQL semantics. The cost is commit
//                           latency bounded by replica distance.
//   DynamoDB             — the partition key IS the API, so the
//                           design discipline is enforced rather
//                           than optional. A bad key is
//                           immediately visible as throttling.
//
// The pattern: managed systems do not remove the shard-key
// decision, they make it explicit. Which is arguably better, since
// a bad key in a self-managed system is discovered a year later.
```

```text
// A migration that works, since this is what the work actually
// looks like:
//
//   1. Dual-write to old and new, reading from old.
//   2. Backfill historical data into the new layout.
//   3. Verify — compare row counts and checksums per key range.
//   4. Shift reads gradually, by percentage, with a kill switch.
//   5. Stop writing to old, after a period where you could still
//      go back.
//   6. Delete old, much later.
//
// Steps 3 and 4 are what makes it safe, and step 5's delay is what
// makes it reversible. A cutover without them is a bet.
```
:::

:::mistakes
**Sharding for reads.** Replicate and cache.

**Replicating for writes.** Every replica applies every write.

**A shard key absent from most queries.** Scatter-gather on everything.

**Sharding by time.** All writes to one shard, by construction.

**Modulo hashing.** Growth rehashes almost everything.

**Too few logical shards.** Over-provision them; it is free now.

**Replicas treated as backups.** They replicate your mistakes.

**Read-modify-write across replicas.** Lost updates, with a wide window.

**Assuming bounded lag.** It is unbounded when it matters.

**Two-phase commit by default.** A coordinator failure freezes participants.

**Forgetting uniqueness is per shard.**
:::

:::tradeoffs
**Vertical scaling** — no code changes and no distributed-systems cost, bounded by the largest
machine and a single failure domain. Far further than most people assume, and the right first
move.

**Read replicas** — cheap read scaling and a failover target, with replication lag and no write
capacity gain.

**Functional separation** — real write capacity for the moved table, every query still local, no
shard key; and no cross-database joins or transactions, which is sharding's cost at a smaller
scale.

**Range sharding** — range queries work and rebalancing is a split; hot spots are structural when
the key correlates with time.

**Hash sharding** — even by construction; range queries become scatter-gather and resharding
rehashes.

**Consistent hashing** — adding a node moves roughly 1/N of keys; needs virtual nodes to be even,
and still no range queries.

**Directory sharding** — complete flexibility including isolating a noisy tenant; the directory is
a dependency on every query.

**Distributed SQL (Spanner, Cockroach)** — keeps joins, transactions and constraints across
shards, at the cost of commit latency set by replica distance and much higher operational
complexity.

The sentence to keep: **replication is for reads and availability, sharding is for writes and
volume, and the shard key is the one decision you cannot cheaply revisit.** Everything else in a
scaling plan can be changed later.
:::

:::checkpoint
1. What does replication solve, and which of "too many reads / too many writes / too much data"
   does it not?
2. Name the three requirements for a shard key and say why they conflict.
3. Why is sharding by timestamp usually wrong?
4. Going from 4 shards to 5 with modulo hashing — what fraction of keys move, and what fixes it?
5. What is the point of 1024 logical shards on 4 machines?
6. List four things the database did for you that you implement yourself after sharding.
7. Why are replicas not backups?
8. Give the scaling sequence in order, and say why sharding is last.
:::

:::interview
Separate the two problems first, because conflating them is the error being tested:

*"They solve different problems. Replication gives read capacity, availability and locality — more
copies, so more read throughput and a node you can lose. It does nothing for write capacity,
because every replica applies every write, so ten replicas do ten times the total write work for
the same write throughput as one. And it does nothing for data volume, since each replica holds the
full dataset. Sharding is the answer to writes and volume, and it is expensive. Production systems
do both: each shard is replicated."*

Then the shard key, framed as three requirements in tension:

*"The key has to appear in nearly every query, or reads become scatter-gather and the latency is
the slowest shard's — which is how a sharded system ends up slower than the machine it replaced. It
has to distribute evenly, or one shard is the bottleneck and the others are idle. And it should keep
related data together, or ordinary operations become distributed transactions. Those three conflict:
sharding orders by order id distributes beautifully and scatters every user's history. For
multi-tenant systems, tenant id usually satisfies all three, and it fails the moment one tenant is a
hundred times the median — which needs a directory mapping so that tenant gets its own shard."*

The resharding point is worth making with numbers:

*"Resharding is painful because modulo hashing moves almost everything — four shards to five
rehashes about eighty percent of the keys, while serving traffic. Consistent hashing reduces that to
roughly one over N, which is why it exists. But the better answer is to over-provision logical
shards up front: 1024 virtual shards onto four machines costs nothing today and makes every future
growth a move of whole shards rather than a rehash. That has to be decided before you shard, which
is why shard count is one of the few things genuinely worth getting right early."*

And the sequencing, which is the most useful part in practice:

*"I would go: bigger machine, then indexes and query fixes, then caching, then read replicas, then
functional separation of the high-write table, and shard last. A modern server holds several
terabytes and serves tens of thousands of writes per second, so that ceiling is much higher than
most estimates assume — and teams routinely shard a year early and spend the year paying for
distributed operations a larger machine would have absorbed."*
:::

## What you now know

- Replication solves reads, availability, durability and locality — not writes or volume.
- Every replica applies every write, so replication increases total write work.
- Sharding solves write capacity and data volume, and costs joins, transactions and uniqueness.
- Production systems replicate each shard; the two are orthogonal.
- A shard key must be in most queries, be evenly distributed, and keep related data together.
- Those three requirements conflict, which is why the key is the hard decision.
- Sharding by time puts all writes on one shard by construction.
- Modulo hashing rehashes ~80% of keys when going from 4 to 5 shards.
- Consistent hashing moves roughly 1/N; virtual nodes make the distribution even.
- Over-provision logical shards — 1024 onto 4 machines — so growth moves shards, not keys.
- After sharding you implement cross-shard joins, transactions, uniqueness, order-by-limit and
  counts.
- Snowflake ids give coordination-free uniqueness and rough time ordering, and leak creation time.
- UUIDv7 is the modern default when you do not need the shard embedded.
- A read hot spot is often a caching problem; only write hot spots require resharding.
- Replicas are not backups — they replicate deletions faithfully.
- Scale in order: bigger machine, queries, cache, replicas, functional split, then shard.
