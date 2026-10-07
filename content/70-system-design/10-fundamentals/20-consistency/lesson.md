---
title: Consistency, CAP and what you actually get
summary: CAP is narrower than its reputation. The useful version is PACELC, and the real question is which anomalies your product can tolerate.
level: expert
minutes: 18
version: "1"
status: stable
last_reviewed: "2026-10-07"
tags: [system-design, cap, consistency, replication]
concepts: [cap-theorem, eventual-consistency, read-your-writes, idempotency]
prerequisites: [transactions, isolation-levels]
interview:
  - question: State CAP correctly.
    level: expert
    answer: >-
      In the presence of a network partition, a distributed system must choose between
      consistency — every read sees the latest write — and availability — every request gets a
      response. That is all it says. The common misstatement is "pick two of three", which is
      wrong because partitions are not something you choose: networks drop packets, so you are
      choosing between C and A *during a partition* and can have both when the network is healthy.
      That is why PACELC is the more useful formulation: if Partitioned, choose Availability or
      Consistency, Else choose Latency or Consistency. The second half is the part that affects
      systems every day, because the latency cost of coordination applies even when nothing has
      failed.
    followUps:
      - "So which does a typical database choose?"
  - question: What does eventual consistency actually mean for a user?
    level: expert
    answer: >-
      That a read may return a stale value, and that given no further writes all replicas will
      converge. The practical issue is which specific anomalies that permits — a user posting a
      comment and not seeing it, a counter going backwards, two reads in one page disagreeing.
      Those are different problems with different fixes, and the strongest useful guarantee short
      of linearisability is usually session consistency: read-your-writes, monotonic reads, and
      consistent prefix. Those are much cheaper than global consistency and remove almost all the
      anomalies users actually notice.
    followUps:
      - "How do you implement read-your-writes cheaply?"
  - question: Where does idempotency fit into this?
    level: expert
    answer: >-
      It is what makes retries safe, and retries are unavoidable in a distributed system because
      you cannot distinguish a lost request from a lost response. A timeout tells you nothing
      about whether the operation happened. So every unsafe operation needs either a natural
      idempotency — setting a value rather than incrementing it — or a deduplication key the server
      remembers. Without that, at-least-once delivery means duplicate charges, and exactly-once
      delivery does not exist at the network level; what exists is at-least-once delivery plus
      idempotent handling, which is observationally equivalent.
    followUps:
      - "Why can't you have exactly-once delivery?"
resources:
  - title: "Designing Data-Intensive Applications"
    url: https://dataintensive.net/
---

## What CAP says, and what it does not

```text
  THE THEOREM

    During a network partition, you may have
      Consistency: every read returns the most recent write
    OR
      Availability: every request receives a non-error response
    but not both.

  WHAT IT DOES NOT SAY

    ✗ "pick two of three"
       Partitions are not a choice. Networks fail, so P is a given.
       You are choosing between C and A during a partition.

    ✗ anything about the healthy case
       With no partition you can have both. CAP is silent on the
       99.9% of the time nothing is broken.

    ✗ that "consistency" means what databases mean by it
       CAP's C is linearisability. ACID's C is constraint
       satisfaction. The same letter, unrelated properties.

  PACELC — the formulation that is actually useful

    if (Partitioned) choose Availability or Consistency
    Else            choose Latency or Consistency

    The ELSE half is what you live with daily: coordinating across
    replicas costs a round trip even when everything is healthy, so
    strong consistency has a latency price with no failure involved.
```

:::what
**Linearisability** means operations appear to happen in a single global order consistent with
real time. **Eventual consistency** means replicas converge given no further writes.
**Read-your-writes**, **monotonic reads** and **consistent prefix** are session guarantees that
sit between the two.
:::

:::why
CAP gets quoted because it sounds like a decision procedure, and it is not. The useful question is
never "CP or AP" — it is **which specific anomalies can this product tolerate**, because that
question has a different answer per feature within one system.

A user posting a comment and not seeing it on refresh is a bug they will report. A follower count
being stale by two seconds is invisible. A payment balance being stale is a financial incident.
Those three live in the same application and want three different guarantees, which is why
"the database is eventually consistent" is an incomplete statement about correctness.

The second reason to move past CAP is that coordination costs latency even when nothing has
failed, which is the half PACELC adds. A write that must be acknowledged by a quorum across three
availability zones pays a round trip between zones — a millisecond or two — on every write,
forever, in the complete absence of any failure. That is a real and permanent cost paid for a
guarantee you may not need, and it is invisible in a CAP framing.

So the productive framing is: **enumerate the anomalies, decide which are acceptable, and buy only
the guarantees that remove the unacceptable ones.** Session guarantees remove most user-visible
weirdness at a fraction of the cost of linearisability, which is why they are what most real
systems actually implement.
:::

:::how
```text
  THE ANOMALIES, from weakest to strongest guarantee

  eventual consistency
    ✗ you post a comment, refresh, and it is gone
    ✗ a counter goes 5 → 7 → 6
    ✗ two widgets on one page disagree
    ✓ replicas converge eventually

  + READ-YOUR-WRITES
    ✓ you always see your own writes
    ✗ a counter can still go backwards
    cost: route a session's reads to a replica known to have its
          writes, or to the primary for a window after writing

  + MONOTONIC READS
    ✓ you never see time move backwards
    cost: pin a session to one replica, or track a read version

  + CONSISTENT PREFIX
    ✓ you never see an effect before its cause
      (no reply visible before the comment it replies to)
    cost: order writes per partition and respect it on read

  = SESSION CONSISTENCY
    Removes essentially every anomaly a user notices, for a
    fraction of the price of the next step.

  + LINEARISABILITY
    ✓ a single global order; a read sees the latest write from
      anyone
    cost: coordination on every operation — a quorum round trip,
          and unavailability during a partition

  THE QUORUM ARITHMETIC

    N replicas, W write acks required, R read replies required.

    W + R > N  ⟹  a read set and a write set must overlap, so a
                   read sees the latest write.

      N=3, W=2, R=2  → strong-ish, tolerates 1 failure
      N=3, W=3, R=1  → fast reads, writes fail if any replica is down
      N=3, W=1, R=1  → fast and eventually consistent
      N=5, W=3, R=3  → tolerates 2 failures

    This is the dial. It is not a binary choice between CP and AP;
    it is a per-operation decision, and many stores let you set it
    per query.

  WHY EXACTLY-ONCE DELIVERY DOES NOT EXIST

    client sends → network → server processes → response → network

    A timeout can mean:
      - the request never arrived
      - it arrived and was processed, and the response was lost
      - it arrived and is still being processed

    The client cannot distinguish these, so it must either retry
    (risking duplication) or give up (risking loss). There is no
    third option at the network level.

    What exists: AT-LEAST-ONCE delivery + IDEMPOTENT handling,
    which is observationally equivalent to exactly-once. Every
    system claiming exactly-once semantics is doing this.
```
:::

:::example
```ruby
# 1. Read-your-writes, implemented cheaply.
#    After a write, pin this session's reads to the primary briefly.
def after_write
  session[:read_primary_until] = Time.now + 2.seconds
end

def with_appropriate_replica
  if session[:read_primary_until]&.future?
    ActiveRecord::Base.connected_to(role: :writing) { yield }
  else
    ActiveRecord::Base.connected_to(role: :reading) { yield }
  end
end
# Two seconds of primary reads after a write removes the single most
# reported class of replication bug — "I saved it and it vanished" —
# at a cost of a small amount of extra primary load.
#
# The more precise version tracks the write's log position and reads
# from any replica that has caught up to it, which is what Rails'
# `prevent_writes` plus a LSN check, or MySQL's GTID tracking, do.
```

```ruby
# 2. Idempotent handling, which is what makes at-least-once safe.
def charge(order, idempotency_key:)
  existing = IdempotencyRecord.find_by(key: idempotency_key)
  return existing.response if existing

  ActiveRecord::Base.transaction do
    response = gateway.charge!(order)
    IdempotencyRecord.create!(key: idempotency_key, response: response)
    response
  end
rescue ActiveRecord::RecordNotUnique
  # Two concurrent retries raced. The unique index decided; read the
  # winner's response.
  IdempotencyRecord.find_by(key: idempotency_key).response
end
# The unique index is doing the real work. A check-then-insert would
# have a race window, which is the same point the schema-design
# lesson makes: a constraint is the only check that cannot be raced.
```

```text
// 3. Choosing per feature, which is what this is really about.
//
//   Payment balance        → linearisable. A stale read is a
//                             financial error. Pay the latency.
//   Inventory for checkout → linearisable or pessimistic locking at
//                             the decrement; overselling is a real
//                             cost.
//   Inventory shown on a    → eventually consistent and cached.
//     product page             Being off by one for a second is
//                             fine, and this read is 1000× the
//                             other one.
//   Follower count         → eventual, and deliberately approximate
//                             at scale.
//   User's own profile     → read-your-writes. Anything less
//                             generates support tickets.
//   Feed                   → consistent prefix, so replies never
//                             appear before their parent.
//   Audit log              → durable and ordered per entity;
//                             staleness is acceptable, loss is not.
//
// Seven features, five different guarantees, one application. That
// is the normal case, and "is the system consistent" is the wrong
// question.
```
:::

:::failure
**Quoting CAP as "pick two".** Partitions are not optional, so the choice is between C and A
during a partition. Saying "we chose AP" also says nothing about the healthy-case latency cost,
which is where PACELC's second half lives.

**Conflating CAP's C with ACID's C.** CAP's C is linearisability; ACID's C is "your constraints
hold". A single-node database is trivially CAP-consistent and says nothing about partitions.

**Assuming a managed database is strongly consistent.** Read replicas are asynchronous by default
almost everywhere. A read-after-write against a replica returns stale data, and the lag is
unbounded during a backlog — which is exactly when you are least likely to be looking.

**Believing exactly-once delivery is available.** It is not. A timeout cannot distinguish a lost
request from a lost response, so you get at-least-once plus idempotency, or at-most-once plus
loss.

**Idempotency by check-then-insert.** `SELECT` then `INSERT` has a race window, so two concurrent
retries both pass the check. The unique index is what makes it correct.

**Ignoring clock skew.** "Last write wins" by wall-clock timestamp silently discards writes when
clocks disagree, and they always disagree by milliseconds and occasionally by much more. Use
logical clocks, version vectors, or a server-assigned sequence.

**Read-modify-write across a replica boundary.** Reading a counter from a replica, incrementing,
and writing to the primary loses concurrent increments — the lost update from the transactions
lesson, now with replication lag making the window much larger.

**Assuming replication lag is small.** It is small until a bulk update, a long transaction, a
schema migration or a network hiccup, at which point it can be minutes. Code that is correct only
when lag is under a second is code that fails during incidents.

**Treating a partition as rare.** A partition is any failure of communication: a dropped packet
run, an overloaded network card, a GC pause long enough to miss heartbeats, a misconfigured
security group. Partial, asymmetric and transient partitions are routine.
:::

:::realworld
```text
// What real systems choose, and what they ask you to configure.
//
//   Postgres primary + async replicas
//     → writes linearisable on the primary; replica reads eventual.
//       `synchronous_commit = remote_apply` makes a replica read
//       consistent at the cost of a round trip per commit.
//
//   DynamoDB
//     → eventually consistent reads by default, strongly consistent
//       reads available at double the cost and higher latency. The
//       dial is per request, which is the right granularity.
//
//   Cassandra
//     → quorum tunable per query: ONE, QUORUM, ALL. LOCAL_QUORUM is
//       the common production choice — a quorum within one region,
//       avoiding cross-region latency.
//
//   Spanner / CockroachDB
//     → linearisable globally, using synchronised clocks (TrueTime)
//       or hybrid logical clocks. The honest cost is a commit
//       latency floor set by the distance between replicas.
//
//   Kafka
//     → ordered within a partition only. "Ordered" across
//       partitions is not offered, which is why the partition key
//       is a correctness decision rather than a performance one.
//
//   Redis replication
//     → asynchronous. A primary failover can lose acknowledged
//       writes, which is documented and frequently forgotten.
```

```text
// The practical procedure, which is what to do instead of arguing
// about CAP:
//
//   1. List the operations, not the system.
//   2. For each, name the anomaly that would matter:
//        - stale read
//        - lost update
//        - non-monotonic read
//        - causality violation
//        - duplicate side effect
//   3. Ask what it costs the business. "The counter is briefly
//      wrong" and "we charged twice" are different sentences.
//   4. Buy the weakest guarantee that removes the unacceptable
//      anomalies.
//   5. Make every unsafe operation idempotent regardless, because
//      retries will happen whatever you choose.
//
// Step 5 is the one that is always worth doing. The others are
// per-feature.
```
:::

:::mistakes
**"Pick two of three."** Partitions are given.

**Confusing CAP's C with ACID's C.** Unrelated properties.

**Assuming replicas are synchronous.** They are asynchronous by default.

**Expecting exactly-once delivery.** At-least-once plus idempotency is what exists.

**Check-then-insert for idempotency.** Needs a unique constraint.

**Wall-clock last-write-wins.** Clock skew silently discards writes.

**Read-modify-write across replicas.** Lost updates with a wide window.

**Assuming bounded replication lag.** It is unbounded during exactly the events that cause it.

**Treating partitions as exotic.** A GC pause is a partition.

**One consistency level for the whole system.** Different features need different guarantees.
:::

:::tradeoffs
**Linearisable** — reads always current, reasoning is simple, and you pay coordination latency on
every operation plus unavailability during a partition. Correct for money and inventory
decrements.

**Session consistency** — removes nearly every user-visible anomaly for a small fraction of the
cost: route reads to a caught-up replica, pin a session, track a version. The best
value-for-money point and what most systems should implement.

**Eventual consistency** — maximum availability and lowest latency, with anomalies you must
enumerate and judge. Correct for counters, feeds, recommendations and analytics.

**Quorum tuning (W + R > N)** — a per-operation dial rather than a system-wide choice, which is
the right granularity. Costs understanding and configuration discipline.

**Synchronous replication** — no acknowledged write is ever lost, at the cost of commit latency
and writes failing when a replica is down.

**Asynchronous replication** — fast commits, and a failover can lose acknowledged writes. The
default, and often an acceptable risk that should nonetheless be a stated one.

**Idempotency keys** — make retries safe, at the cost of storing keys and responses with a
retention policy. Always worth it for anything with a side effect.

The summary: **CAP tells you almost nothing actionable; the anomaly list tells you everything.**
Decide per operation, prefer session guarantees over global ones, and make every unsafe operation
idempotent whatever else you choose — because retries do not ask permission.
:::

:::checkpoint
1. State CAP precisely. What is wrong with "pick two of three"?
2. What does PACELC add, and why does the second half matter more day to day?
3. Name the three session guarantees and the anomaly each removes.
4. `N=3, W=2, R=2` — what does `W + R > N` buy you, and how many failures does it tolerate?
5. Why can a timeout not tell you whether an operation happened?
6. Why is check-then-insert insufficient for idempotency, and what fixes it?
7. Give three features in one application that need three different guarantees.
8. Why is a long GC pause a partition?
:::

:::interview
State the theorem correctly and then name the common error, because being precise here is the
whole signal:

*"During a network partition you can have consistency or availability, not both. That is all it
says. 'Pick two of three' is wrong because a partition is not something you choose — networks drop
packets, so P is given and the choice is between C and A while partitioned. It also says nothing
about the healthy case, which is most of the time, and its C means linearisability rather than
ACID's C, which is a completely different property."*

Then move to what is actually useful:

*"PACELC is the formulation I would reach for: if partitioned, choose availability or consistency;
else, choose latency or consistency. The second half is what you live with every day — a write
requiring a quorum acknowledgement across availability zones pays a cross-zone round trip on every
commit, forever, with nothing broken. That is a permanent cost for a guarantee you may not need,
and a CAP framing hides it entirely."*

Then reframe the question, which is the part that distinguishes a senior answer:

*"In practice I would not ask 'is this system CP or AP'. I would list the operations and name the
anomaly that would matter for each. A stale follower count is invisible. A user not seeing their
own comment is a support ticket. A stale balance is a financial incident. Those three live in one
application and want three different guarantees. And the best value point is usually session
consistency — read-your-writes, monotonic reads, consistent prefix — because it removes almost
everything a user notices at a small fraction of the cost of linearisability."*

And the thing worth doing regardless: *"whatever consistency model I pick, I make every unsafe
operation idempotent, because a timeout cannot distinguish a lost request from a lost response.
Retries are unavoidable, exactly-once delivery does not exist at the network level, and what does
exist is at-least-once plus idempotent handling — with the deduplication enforced by a unique
constraint, since check-then-insert has a race window."*
:::

## What you now know

- CAP: during a partition, choose consistency or availability. Partitions are not optional.
- "Pick two of three" is wrong, and CAP says nothing about the healthy case.
- CAP's C is linearisability; ACID's C is constraint satisfaction. Unrelated.
- PACELC adds the else-branch: coordination costs latency with no failure involved.
- Session guarantees — read-your-writes, monotonic reads, consistent prefix — remove most
  user-visible anomalies cheaply.
- `W + R > N` forces read and write sets to overlap, which is the quorum dial.
- Quorum levels are a per-operation decision, not a system-wide one.
- A timeout cannot distinguish a lost request from a lost response.
- Exactly-once delivery does not exist; at-least-once plus idempotency is equivalent.
- Idempotency needs a unique constraint, not a check-then-insert.
- Wall-clock last-write-wins loses writes under clock skew.
- Replication lag is unbounded precisely during the incidents that cause it.
- A long GC pause is a partition.
- Different features in one application need different guarantees — enumerate the anomalies.
