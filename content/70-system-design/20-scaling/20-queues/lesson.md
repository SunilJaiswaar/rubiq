---
title: Queues and asynchronous work
summary: Moving work out of the request means accepting that it might not happen — and the four things you must build because of that.
level: advanced
minutes: 18
version: "1"
status: stable
last_reviewed: "2026-10-07"
tags: [system-design, queues, async, idempotency, backpressure]
concepts: [message-queues, at-least-once, dead-letter-queues, backpressure]
prerequisites: [idempotency, http-methods]
interview:
  - question: Why move work out of the request path?
    level: advanced
    answer: >-
      Three reasons. Latency — the user does not wait for something they do not need to see, so
      sending a confirmation email should not add 400ms to a signup. Resilience — a third party
      being down fails a background job that retries, rather than failing the user's request.
      And load smoothing — a burst of ten thousand requests becomes a queue drained at a
      sustainable rate rather than a thundering herd against a database. The cost is that the
      work is now eventually-happening rather than happening, which means you need idempotency,
      retries, a dead-letter path and a way to observe the queue.
    followUps:
      - "What makes a job safe to retry?"
  - question: What delivery guarantees can a queue give you?
    level: advanced
    answer: >-
      At-most-once, where a message may be lost but never duplicated, which suits metrics and very
      little else. At-least-once, where a message may be delivered more than once but never lost,
      which is what nearly every system uses. Exactly-once does not exist at the transport level,
      because a consumer crash between doing the work and acknowledging is indistinguishable from
      a crash before doing it. What systems advertising exactly-once provide is at-least-once
      delivery plus deduplication or transactional writes — which is observationally equivalent
      and is the thing to build yourself.
    followUps:
      - "So where do you put the deduplication?"
  - question: What is the dual-write problem?
    level: advanced
    answer: >-
      Writing to the database and publishing a message are two separate operations with no shared
      transaction, so either can succeed while the other fails. Commit then publish risks a lost
      event; publish then commit risks an event for data that does not exist. The standard
      solutions are the transactional outbox — insert the event into a table in the same
      transaction as the data change, and have a separate process publish from that table — or
      change data capture, reading the database's own replication log. Both work by making the
      event part of the same atomic write as the data.
    followUps:
      - "Which would you choose and why?"
resources:
  - title: "Designing Data-Intensive Applications, chapter 11"
    url: https://dataintensive.net/
---

## What you gain, and what it costs

```text
  SYNCHRONOUS
    POST /signup
      create user          20ms
      send welcome email   400ms   ← the user waits for this
      index for search     150ms   ← and this
      notify analytics      80ms   ← and this
    ────────────────────────────
    650ms, and any of the last three failing fails the signup.

  ASYNCHRONOUS
    POST /signup
      create user          20ms
      enqueue 3 jobs        2ms
    ────────────────────────────
    22ms, and the user's signup cannot be broken by an email
    provider.

  WHAT YOU NOW OWN
    - the work might run twice            → idempotency
    - the work might fail                 → retries with backoff
    - the work might fail forever         → a dead-letter queue
    - the queue might grow without bound  → backpressure and
                                             monitoring
    - the user does not know it happened  → a status mechanism

  Those five are not optional extras. A queue without them is a
  way of losing work quietly.
```

:::what
A **message queue** decouples producing work from performing it. **At-least-once** delivery means
a message may arrive more than once. A **dead-letter queue** holds messages that have failed
repeatedly. **Backpressure** is the mechanism by which a slow consumer slows its producer.
:::

:::why
The core reason is that a request's latency budget and a task's required work are unrelated
quantities, and tying them together makes both worse.

A signup needs 50ms. Sending an email needs a third party to answer. Resizing an image needs CPU.
Rebuilding a search index needs minutes. Forcing those into one request means the user waits for
all of it and any one failure fails everything — so the request's reliability becomes the product
of every dependency's reliability, which is the availability multiplication from the fundamentals
lesson applied in the worst possible place.

Decoupling fixes that, and it also changes the shape of load. Ten thousand simultaneous requests
each doing synchronous work means ten thousand concurrent database connections and a collapse. The
same ten thousand enqueued and drained by twenty workers means a queue that is briefly deep and a
database that is never overwhelmed. The queue absorbs the burst, which is often the main reason to
have one rather than a secondary benefit.

What you are buying with all of that is a weaker guarantee: the work will *probably* happen,
*eventually*, and possibly more than once. Everything difficult about queues follows from
accepting that, which is why the five obligations above are the real content of this topic rather
than the choice of broker.
:::

:::how
```text
  AT-LEAST-ONCE, and why exactly-once is unavailable

    consumer receives message
      │
      ▼  does the work
      │
      ▼  acknowledges
      │
      ▼  broker deletes the message

    Crash between "does the work" and "acknowledges":
      → the broker redelivers, and the work happens twice.

    Acknowledge BEFORE doing the work instead:
      → a crash loses the work entirely. At-most-once.

    There is no ordering of those two operations that gives
    exactly-once, because they are not atomic with each other. What
    is available: at-least-once delivery plus idempotent handling.

  THE DUAL-WRITE PROBLEM

    db.transaction { user.save! }
    queue.publish(UserCreated)      ← the process dies here

    → the user exists and nothing downstream knows.

    queue.publish(UserCreated)
    db.transaction { user.save! }    ← this fails

    → an event for a user that does not exist.

    TRANSACTIONAL OUTBOX — make the event part of the write

      db.transaction do
        user.save!
        OutboxEvent.create!(type: "UserCreated", payload: {...})
      end
      # a separate poller publishes from `outbox_events` and marks
      # rows as sent

      Atomic, because the event is a row in the same transaction.
      Costs a polling process and at-least-once publication (the
      poller can crash after publishing and before marking).

    CHANGE DATA CAPTURE — read the database's own log

      Debezium and similar tail the replication log, so every
      committed change becomes an event with no application code
      at all.
      Costs a connector to operate, and the events are shaped like
      your schema rather than like your domain — so a column rename
      becomes a breaking change for consumers.

  BACKPRESSURE — what happens when the consumer cannot keep up

    unbounded queue      → memory grows until the process dies.
                           A throughput problem becomes an
                           out-of-memory problem, which takes down
                           unrelated code in the same process.
    bounded, reject      → the producer gets an error and can
                           retry, shed, or report honestly. Usually
                           right for a request path.
    bounded, block       → the producer slows down. Right when the
                           producer can usefully wait — a file
                           reader, a batch job.
    bounded, drop oldest → right for metrics and telemetry, where
                           fresh data is worth more than complete
                           data.

    Choosing is mandatory. Not choosing means the fourth option
    happens to you in the form of an OOM kill.
```
:::

:::example
```ruby
# 1. An idempotent job — the baseline requirement.
class SendWelcomeEmail
  def perform(user_id)
    user = User.find(user_id)
    # The unique index on (user_id, kind) is what makes this safe,
    # not the check. A find-then-create would race against a
    # concurrent redelivery.
    EmailLog.create!(user_id: user.id, kind: "welcome")
    Mailer.welcome(user).deliver_now
  rescue ActiveRecord::RecordNotUnique
    # Already sent. A redelivery, not a failure.
    nil
  end
end
# Note the ordering problem that remains: if the mailer call fails
# after the log row is committed, a retry sees the row and skips the
# send. Either send first and log after (risking a duplicate email),
# or record "attempted" and "succeeded" separately. Which is correct
# depends on whether a duplicate email or a missing one is worse —
# and that is a product decision, not a technical one.

# 2. Retries with backoff and jitter, and a dead-letter path.
class ProcessPayment
  MAX_ATTEMPTS = 5

  def perform(payment_id, attempt = 1)
    gateway.capture!(payment_id)
  rescue Gateway::TransientError => e
    if attempt >= MAX_ATTEMPTS
      DeadLetter.create!(job: self.class.name, args: [payment_id], error: e.message)
      Alert.notify("payment stuck", payment_id)
      return
    end
    delay = (2 ** attempt) * (0.5 + rand)      # jitter
    self.class.perform_in(delay.seconds, payment_id, attempt + 1)
  rescue Gateway::PermanentError => e
    # A declined card is not a retryable condition. Retrying it five
    # times with backoff just delays telling the user.
    DeadLetter.create!(...)
  end
end
# Distinguishing transient from permanent is the part most retry
# code omits, and it matters in both directions: retrying a
# permanent failure wastes time and hides the problem, and failing
# fast on a transient one loses work that would have succeeded.

# 3. The transactional outbox.
class Order < ApplicationRecord
  after_create do
    OutboxEvent.create!(
      aggregate: "Order", aggregate_id: id,
      event_type: "OrderPlaced", payload: as_json
    )
  end
end
# `after_create` runs inside the transaction, so the event and the
# order commit together or not at all.

class OutboxPublisher
  def run
    OutboxEvent.where(published_at: nil).order(:id).limit(100).each do |e|
      broker.publish(e.event_type, e.payload)
      e.update!(published_at: Time.now)
    end
  end
end
# Publication is at-least-once: a crash between publish and update
# republishes. Consumers must be idempotent, which they had to be
# anyway.
```

```text
// 4. What to monitor, which is what makes a queue operable.
//
//   queue DEPTH            — growing means consumers cannot keep up
//   OLDEST MESSAGE AGE     — the better signal. Depth of 10,000
//                             draining in a minute is healthy;
//                             depth of 5 where the oldest is an
//                             hour old means something is stuck.
//   processing rate        — per queue, per job type
//   failure rate           — and retry rate separately
//   dead-letter count      — should be zero; any growth is a page
//   consumer count         — a silent consumer crash looks exactly
//                             like a quiet period
//
// Oldest-message-age is the metric to alert on. Depth alone
// produces both false positives during bursts and false negatives
// when one poison message blocks a partition.
```
:::

:::failure
**A job that is not idempotent.** At-least-once delivery means it will run twice eventually —
during a deploy, a broker failover, or a consumer OOM. "It worked in staging" means staging never
redelivered.

**Retrying a permanent failure.** A declined card, a validation error, a 404 from a third party.
Retrying five times with exponential backoff delays the inevitable and hides the cause. Classify
errors.

**Retrying without jitter.** Everything that failed together retries together, and the retry storm
is worse than the original incident. This is the same point as in the HTTP and transactions
lessons, and it keeps appearing because it keeps being omitted.

**No dead-letter queue.** A permanently failing message either retries forever, consuming
capacity, or is silently dropped. With a DLQ it becomes a visible, inspectable, replayable item.

**An unbounded queue.** A throughput problem becomes an out-of-memory kill, which takes down
everything else in the process. Bounding forces you to choose a behaviour; not bounding chooses the
worst one.

**Alerting on depth instead of age.** A deep queue draining quickly is fine; a shallow queue whose
oldest message is an hour old is broken. Age catches the poison-message case that depth misses
entirely.

**Passing objects instead of ids.** A serialised model in a job payload is a snapshot: by the time
the job runs the record may have changed or been deleted, and the payload cannot be deployed past a
schema change. Pass the id and re-read.

**Assuming ordering.** Most brokers guarantee order only within a partition or a single consumer,
and retries break it regardless — a failed message retried later arrives after messages that came
after it. If order matters, partition by the entity whose order matters, and accept the throughput
limit that implies.

**The dual-write problem, unaddressed.** Commit then publish loses events; publish then commit
creates phantom ones. Both happen rarely enough to survive testing and often enough to matter.

**Long-running jobs with no visibility timeout handling.** A job that takes longer than the
broker's visibility timeout is redelivered while still running, so two workers process it
concurrently. Either extend the timeout periodically or make the job short.
:::

:::realworld
```text
// Choosing a queue, by what you actually need.
//
//   A database table           — genuinely fine below a few hundred
//     (+ SKIP LOCKED)            jobs per second. One fewer system
//                                to operate, transactional with
//                                your data, and queryable. The
//                                SKIP LOCKED pattern from the
//                                locking lesson is the whole
//                                implementation.
//
//   Redis (Sidekiq, BullMQ)    — fast, simple, excellent tooling.
//                                Persistence is weaker than a
//                                broker's; a failover can lose
//                                jobs, which is documented and
//                                often forgotten.
//
//   SQS / managed queue        — operationally free, at-least-once,
//                                good DLQ support, visibility
//                                timeouts. Limited ordering (FIFO
//                                queues trade throughput for it)
//                                and per-message cost.
//
//   Kafka / a log              — high throughput, retention and
//                                replay, multiple independent
//                                consumer groups, strict order per
//                                partition. A real distributed
//                                system to operate, and consumers
//                                must manage offsets.
//
// The honest default for most applications is the first or second.
// Reach for a log when you need replay, multiple consumer groups,
// or retention — not for volume alone, which is the usual stated
// reason and rarely the real one.
```

```text
// The patterns worth knowing by name.
//
//   Work queue        — N consumers, each message handled once.
//                        Scale by adding consumers.
//   Pub/sub           — each subscriber sees every message. For
//                        events, where the producer does not know
//                        or care who is listening.
//   Request/reply     — a correlation id and a reply queue. Usually
//                        a sign you wanted a synchronous call.
//   Saga              — a long-running process as a sequence of
//                        local transactions with compensating
//                        actions, because there is no distributed
//                        transaction to roll back.
//   Scheduled/delayed — "retry in an hour", "expire this in 30
//                        days". A sorted set or a dedicated
//                        scheduler.
//   Fan-out           — one event, many jobs. Watch the
//                        amplification: one post becoming 50,000
//                        feed writes is a design decision.
```

```text
// The observability rule that matters most:
//
//   A queue makes failures invisible by design. The user's request
//   succeeded; whether the work happened is a separate question
//   that nobody is watching unless you made someone watch it.
//
//   So: every queue needs an oldest-message-age alert, a
//   dead-letter alert, and ideally a reconciliation job that
//   compares intent with outcome — "how many users were created
//   yesterday, and how many welcome emails were sent". That last
//   one catches entire classes of silent failure that per-job
//   monitoring never will.
```
:::

:::mistakes
**A non-idempotent job.** At-least-once guarantees a second run eventually.

**Retrying permanent failures.** Classify errors first.

**Retrying without jitter.** Synchronised retry storms.

**No dead-letter queue.** Failures retry forever or vanish.

**An unbounded queue.** A throughput problem becomes an OOM.

**Alerting on depth rather than oldest-message age.**

**Serialising objects into payloads.** Pass ids; re-read in the job.

**Assuming ordering.** Retries break it even where the broker preserves it.

**Ignoring the dual-write problem.** Use an outbox or CDC.

**Jobs longer than the visibility timeout.** Concurrent duplicate processing.

**No reconciliation.** Per-job monitoring misses whole-class failures.
:::

:::tradeoffs
**Synchronous** — the user knows the outcome, errors are reportable immediately, and no extra
infrastructure. The request inherits every dependency's latency and availability.

**Asynchronous** — fast requests, independent failure, load smoothing; you now own idempotency,
retries, dead-lettering, backpressure and status reporting.

**A database table as a queue** — transactional with your data, one fewer system, fully
queryable; limited throughput and polling latency.

**Redis-backed** — fast and simple with great tooling; weaker durability, and a failover can lose
jobs.

**A managed queue** — no operations, good dead-letter support; per-message cost and limited
ordering.

**A log (Kafka)** — retention, replay, multiple consumer groups, high throughput; a real
distributed system to run and offsets to manage.

**Transactional outbox** — atomic with the data write, no new infrastructure beyond a poller;
adds polling latency and at-least-once publication.

**Change data capture** — no application code at all; events shaped like your schema, so a column
rename breaks consumers, and a connector to operate.

The framing worth keeping: **a queue converts "this failed" into "this has not happened yet",
which is only an improvement if someone is watching.** The infrastructure choice is the easy part;
the five obligations — idempotency, classified retries, dead-lettering, backpressure and
reconciliation — are what make asynchronous work trustworthy.
:::

:::checkpoint
1. Name the five things you must build once work moves out of the request path.
2. Why can a queue not offer exactly-once delivery? Where do the two orderings fail?
3. What is the dual-write problem, and how does an outbox solve it?
4. Why alert on oldest-message age rather than queue depth? Give a case each metric misses.
5. Why pass an id rather than a serialised object?
6. Why does retrying break ordering even on a broker that preserves it?
7. A job takes longer than the visibility timeout. What happens?
8. What does a reconciliation job catch that per-job monitoring does not?
:::

:::interview
Give the three reasons and then the price, because the price is the substance:

*"Three reasons to move work out of a request: latency, so the user does not wait for an email
provider; resilience, so a third party being down fails a retryable job rather than the user's
signup; and load smoothing, so a burst of ten thousand requests becomes a queue drained at a
sustainable rate rather than ten thousand concurrent database connections. What you pay is that
the work is now eventually-happening and possibly happening twice — so you own idempotency,
classified retries, a dead-letter path, backpressure, and a way to tell whether it happened."*

Be precise about delivery semantics, since this is where imprecision is most common:

*"At-least-once is what you get. Exactly-once is not available at the transport level: acknowledge
after doing the work and a crash in between causes a redelivery; acknowledge before and a crash
loses the work. There is no ordering of those two operations that is atomic, so every system
claiming exactly-once is providing at-least-once plus deduplication — which is observationally
equivalent and is the thing to build. I put the deduplication behind a unique constraint, because
a check-then-act has a race window against a concurrent redelivery."*

The dual-write problem is worth volunteering:

*"The failure I would design for explicitly is the dual write. Saving to the database and
publishing an event are two operations with no shared transaction, so commit-then-publish loses
events and publish-then-commit creates events for data that does not exist. Both are rare enough
to survive testing. A transactional outbox fixes it by making the event a row in the same
transaction, with a separate poller publishing from that table — and the poller is at-least-once
too, which is fine because consumers had to be idempotent anyway."*

And one operational detail that signals experience: *"I alert on oldest-message age rather than
queue depth. A depth of ten thousand draining in a minute is healthy; a depth of five where the
oldest message is an hour old means something is stuck, and depth alone misses that completely. And
I would add a reconciliation job — comparing how many users were created yesterday against how many
welcome emails were sent — because a queue makes failures invisible by design, and per-job
monitoring never catches a whole class going missing."*
:::

## What you now know

- Async work buys latency, independent failure and load smoothing.
- The price is five obligations: idempotency, retries, dead-lettering, backpressure, status.
- At-least-once is what brokers provide; exactly-once is not available at the transport level.
- Acknowledge after the work and you risk duplication; before, and you risk loss.
- Deduplicate behind a unique constraint, not a check-then-act.
- Classify errors: retrying a permanent failure delays the inevitable and hides the cause.
- Always jitter retry backoff, or everything that failed together retries together.
- A dead-letter queue turns an invisible permanent failure into an inspectable item.
- Bound the queue and choose the overflow behaviour — reject, block, or drop oldest.
- Alert on oldest-message age; depth misses poison messages and over-reports bursts.
- Pass ids, not serialised objects: payloads outlive schema changes and go stale.
- Retries break ordering even where a broker preserves it.
- The dual-write problem needs a transactional outbox or change data capture.
- A job exceeding the visibility timeout is redelivered while still running.
- A database table with `SKIP LOCKED` is a legitimate queue below a few hundred jobs per second.
- Reach for a log for replay, retention and multiple consumer groups — not for volume alone.
- Reconciliation catches whole classes of silent failure that per-job monitoring cannot.
