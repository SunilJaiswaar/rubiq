---
title: Background jobs
summary: What belongs off the request, why every job must be idempotent, and the retry behaviour that causes duplicate charges.
level: advanced
minutes: 14
version: "8.0"
status: stable
last_reviewed: "2026-10-07"
tags: [rails, jobs, sidekiq, idempotency]
concepts: [background-jobs, idempotency, retries, queues]
prerequisites: [transactions, activerecord]
interview:
  - question: What should go in a background job?
    level: intermediate
    answer: >-
      Anything the user does not need to wait for and anything that can fail
      independently of the request — sending email, generating a report, calling a
      third-party API, image processing, search indexing. The two reasons are latency and
      failure isolation: a request should not take three seconds because a mail provider is
      slow, and a mail provider being down should not fail a checkout. What should not go in
      a job is anything the user needs to see the result of immediately, and anything that
      must be atomic with the database write.
    followUps:
      - "Why must a job be idempotent?"
      - "What goes wrong if you enqueue inside a transaction?"
  - question: Why must every job be idempotent?
    level: advanced
    answer: >-
      Because it will run more than once. A worker killed mid-job leaves the job on the
      queue and it is retried; a network timeout on the acknowledgement means the queue
      believes it failed when it succeeded; most queues offer at-least-once delivery, not
      exactly-once. So "send a payment" running twice must not charge twice. In practice
      that means an idempotency key, a status check, or a database constraint that makes
      the second attempt a no-op.
resources:
  - title: "Rails Guides — Active Job Basics"
    url: https://guides.rubyonrails.org/active_job_basics.html
---

## Two reasons to move work off the request

```ruby
# Synchronous: the user waits for all of it.
def create
  @order = Order.create!(order_params)
  OrderMailer.confirmation(@order).deliver_now      # 400ms, or 30s on a timeout
  SearchIndex.update(@order)                         # 200ms
  Analytics.track("order_placed", @order)            # 150ms
  redirect_to @order
end
```

:::problem
Two separate problems, and they need stating separately because they have different fixes.

**Latency.** The user waits 750 milliseconds for work they do not care about. The request
holds a web worker and a database connection for all of it, so throughput falls by the same
factor.

**Failure coupling.** If the mail provider is down, `deliver_now` raises and the checkout
fails — after the order was created. The user sees an error for an order that exists. A
third party's outage has become your outage, for a step that was not essential.
:::

:::what
A **background job** is work enqueued for later execution by a separate process. **Active
Job** is Rails' interface over a queue backend — Solid Queue, Sidekiq, Resque, Delayed Job.
:::

```ruby
class OrderConfirmationJob < ApplicationJob
  queue_as :mailers
  retry_on Net::SMTPServerBusy, wait: :polynomially_longer, attempts: 5
  discard_on ActiveJob::DeserializationError

  def perform(order)
    OrderMailer.confirmation(order).deliver_now
  end
end

# Enqueue:
OrderConfirmationJob.perform_later(order)
```

```ruby
# The controller now:
def create
  @order = Order.create!(order_params)
  redirect_to @order          # ~20ms
end
# with the jobs enqueued by a service object, after the transaction commits.
```

:::why
Moving work off the request converts a *synchronous dependency* into an *asynchronous* one.
The mail provider being down now means mail is delayed and retried, rather than checkout
failing. That is a different and much better failure mode: the order exists, the customer
has it, and the email arrives when the provider recovers.

The cost is that you have given up knowing whether it worked at the moment you asked.
Everything else in this lesson follows from that.
:::

## Every job runs more than once

:::failure
This is the most important thing about jobs and the most commonly missed.

```text
  Worker picks up job          ──▶  charges the card  ──▶  acknowledges queue
                                         ✓                        ✗ network blip

  Queue never got the ack, so it redelivers.
  Second worker picks it up    ──▶  charges the card again
```

Other ways the same thing happens:

- The worker is killed mid-job — a deploy, an OOM kill, a spot instance reclaim. The job
  is still on the queue.
- The job raises after a side effect, so the retry repeats the side effect.
- A timeout fires on the client while the server completed the work.

**Queues offer at-least-once delivery.** Exactly-once is not available in a distributed
system in general, and no mainstream queue claims it. So:

```ruby
# WRONG: running twice charges twice.
def perform(order)
  PaymentGateway.charge!(order.total, order.card_token)
  order.update!(status: "paid")
end

# RIGHT: an idempotency key the gateway deduplicates on.
def perform(order)
  return if order.paid?                      # cheap guard, not sufficient alone

  PaymentGateway.charge!(
    amount: order.total,
    token: order.card_token,
    idempotency_key: "order-#{order.id}-charge",   # the real protection
  )
  order.update!(status: "paid")
end
```

The `return if order.paid?` guard is necessary and not sufficient — two workers can both
read "unpaid" and both proceed, which is exactly the lost-update race from the transactions
lesson. The idempotency key is what makes it safe, because the deduplication happens at the
one place that can be atomic: the gateway.

Where there is no third party to deduplicate for you, use a constraint:

```ruby
# A table whose unique index makes the second attempt fail harmlessly.
class JobExecution < ApplicationRecord
  # add_index :job_executions, :idempotency_key, unique: true
end

def perform(order)
  JobExecution.create!(idempotency_key: "order-#{order.id}-charge")
  do_the_work(order)
rescue ActiveRecord::RecordNotUnique
  Rails.logger.info("already done, skipping")
end
```
:::

## Enqueueing inside a transaction

:::failure
```ruby
# The classic bug.
ActiveRecord::Base.transaction do
  order = Order.create!(params)
  OrderConfirmationJob.perform_later(order)     # enqueued immediately
  inventory.reserve!(order)                      # raises → ROLLBACK
end
```

The job is in the queue. The order is not in the database. A worker picks it up, calls
`Order.find(id)`, gets `RecordNotFound`, and the job fails — or worse, succeeds against
whatever it can find.

There is a subtler version that happens even without a rollback:

```text
  Transaction:  INSERT order            (not yet committed)
                enqueue job             (Redis — immediate, outside the transaction)
  Worker:       Order.find(id)          ← may run BEFORE the COMMIT
                                           RecordNotFound
  Transaction:  COMMIT
```

The queue is not in your database transaction, so the job can be picked up before the row
is visible. This is a genuine race that appears under load and is nearly impossible to
reproduce locally.

**Three fixes:**

```ruby
# 1. Enqueue after the transaction. Simple and almost always right.
order = nil
ActiveRecord::Base.transaction do
  order = Order.create!(params)
  inventory.reserve!(order)
end
OrderConfirmationJob.perform_later(order)

# 2. after_commit, if it must be on the model.
after_create_commit -> { OrderConfirmationJob.perform_later(self) }

# 3. A database-backed queue, so the enqueue IS in the transaction.
#    Solid Queue (the Rails 8 default) and good_job store jobs in Postgres,
#    so the job and the order commit atomically — the problem disappears.
```

That third option is the real argument for a database-backed queue over Redis, and it is
why Rails 8 ships Solid Queue as the default.
:::

:::internals
**Arguments are serialised, which constrains what you can pass.**

```ruby
# Rails passes a GlobalID, not the object:
OrderConfirmationJob.perform_later(order)
# serialises to: {"_aj_globalid" => "gid://app/Order/42"}
# The worker calls Order.find(42) — a FRESH load.

# Consequences:
# 1. The job sees the record as it is when it RUNS, not when enqueued.
#    Enqueue, then the record changes, then the job runs → new state.
# 2. If the record is deleted before the job runs, deserialisation raises
#    ActiveJob::DeserializationError. Hence `discard_on`.
# 3. You cannot pass an unsaved record, a Proc, or an object without a GlobalID.
```

That first consequence is a real source of bugs: a job enqueued to "email the order
confirmation" reads the order at run time, so if the order was cancelled in between, the
job happily emails a confirmation for a cancelled order. Passing the data you need, rather
than the record, avoids it:

```ruby
# When the point-in-time values matter, pass them:
OrderConfirmationJob.perform_later(order.id, total: order.total, email: order.user.email)
```

**Retry backoff.** `wait: :polynomially_longer` is roughly `attempt ** 4 + 2` seconds — a
few seconds, then a minute, then twenty. Immediate retries against a struggling dependency
are how you turn a brief outage into a sustained one.

```ruby
retry_on Net::OpenTimeout, wait: :polynomially_longer, attempts: 5
retry_on ActiveRecord::Deadlocked, wait: 5.seconds, attempts: 3
discard_on ActiveJob::DeserializationError     # the record is gone; retrying cannot help
```

`discard_on` matters: a job that can never succeed should not be retried twenty-five times
and then sit in a dead set that nobody reads.
:::

:::mistakes
**Passing a whole object instead of an id, when the object is large.** The serialised
arguments go into the queue, so a job carrying a 2 MB payload fills Redis and slows every
enqueue.

**No queue separation.** One queue means a 10,000-job report backlog delays password reset
emails:

```ruby
queue_as :critical     # auth emails, payment webhooks
queue_as :default      # most things
queue_as :low          # reports, backfills, analytics
```

**Unbounded job fan-out.** `User.find_each { |u| NotifyJob.perform_later(u) }` for two
million users enqueues two million jobs as fast as it can, which can take the queue down.
Batch instead:

```ruby
User.in_batches(of: 1_000) { |b| NotifyBatchJob.perform_later(b.pluck(:id)) }
```

**Jobs with no timeout.** A job that hangs on a socket holds a worker thread forever.
Sidekiq and Solid Queue do not impose a per-job timeout by default — set one explicitly on
the HTTP client rather than relying on the queue.

**Assuming ordering.** Jobs run concurrently on multiple workers. Two jobs enqueued in
order may execute in either order, or simultaneously. If order matters you need a single
queue with one worker, or a lock, or a design that does not care.
:::

:::realworld
```ruby
# A job written with all of this in mind.
class ChargeOrderJob < ApplicationJob
  queue_as :critical
  retry_on PaymentGateway::Timeout, wait: :polynomially_longer, attempts: 5
  discard_on ActiveJob::DeserializationError

  def perform(order_id)
    order = Order.find(order_id)
    return if order.paid?                     # fast path for an obvious retry

    result = PaymentGateway.charge!(
      amount: order.total_cents,
      token: order.card_token,
      idempotency_key: "order-#{order.id}-v1",   # the actual guarantee
    )

    order.update!(status: "paid", charge_id: result.id)
  end
end

# Enqueued after the transaction commits:
ActiveRecord::Base.transaction { order.save!; inventory.reserve!(order) }
ChargeOrderJob.perform_later(order.id)
```

Note the id rather than the object, the idempotency key rather than only a guard, the queue
name, the bounded retries, and the `discard_on`. Each of those corresponds to a specific
failure described above.
:::

:::tradeoffs
**Background jobs.** Fast requests, failure isolation from third parties, natural retries,
and work that can be scaled independently of the web tier.

Costs, all of which are real:

- **You no longer know if it worked.** The user gets a success response for something that
  has not happened yet, so you need status surfacing — "your report is being generated".
- **Every job must be idempotent**, which is extra design work on every single one.
- **More moving parts**: a queue to run and monitor, workers to deploy, a dead-letter set
  somebody has to actually read.
- **Harder to debug.** The failure is in a worker log, decoupled in time from the request
  that caused it.

**Doing it synchronously** is simpler, immediate, and gives the user a real answer. It
couples your availability to every dependency's availability and your latency to theirs.

The division that holds up: **synchronous for anything the user must see the result of, and
for anything that must be atomic with the write. Asynchronous for everything else.** Email
is the clearest case on the asynchronous side — nobody has ever needed to know that an
email left the building before their page loaded.
:::

:::checkpoint
For each, decide synchronous or job, and if a job, what makes it idempotent:

1. Send a password reset email.
2. Charge a card at checkout.
3. Generate a 50-page PDF invoice the user clicked "download" on.
4. Update the search index after a post is edited.
5. Decrement stock when an order is placed.

Then: number 2 is the hard one. Argue both sides, and say what you would actually do.
:::

:::interview
Jobs come up constantly and the shallow answer — "put slow things in a job" — misses both
real difficulties.

Give both reasons for moving work off the request: *"latency, and failure isolation. A
request should not take three seconds because a mail provider is slow, and more importantly a
mail provider being down should not fail a checkout — a third party's outage becoming your
outage, for a non-essential step."*

Then the idempotency answer, which is the one that matters: *"every job runs more than once.
Queues are at-least-once — a worker killed mid-job leaves it queued, and a lost
acknowledgement means a redelivery of work that succeeded. So 'charge the card' must not
charge twice. A status guard is not enough because two workers can both read 'unpaid'; the
real protection is an idempotency key the gateway deduplicates on, or a unique constraint that
makes the second attempt a harmless failure."*

The detail that signals production experience: *"and I enqueue after the transaction commits,
never inside it. The queue is not in the database transaction, so the worker can pick the job
up before the row is visible — or the transaction rolls back and the job references a record
that does not exist. It is a race that only appears under load. A database-backed queue like
Solid Queue removes the problem entirely, which is the main reason Rails 8 made it the
default."*
:::

## What you now know

- Two reasons for jobs: latency, and isolating your availability from a dependency's.
- Queues are at-least-once. Every job will run twice, so every job must be idempotent.
- A status guard is necessary and insufficient — two workers can both read the old status.
- Real idempotency comes from an idempotency key or a unique constraint, where the check and
  the act are atomic.
- Never enqueue inside a transaction: the job can run before the commit, or after a
  rollback. Use `after_commit`, or a database-backed queue.
- Arguments are serialised as GlobalIDs, so the job reads the record fresh at run time.
- Separate queues by urgency; batch fan-out; bound retries; `discard_on` what cannot
  succeed.
- Jobs have no ordering guarantee.
