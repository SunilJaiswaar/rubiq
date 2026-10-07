---
title: Observability
summary: Monitoring tells you a known thing is broken; observability lets you ask a question you did not anticipate. The difference decides how long your next incident lasts.
level: advanced
minutes: 18
version: "1"
status: stable
last_reviewed: "2026-10-07"
tags: [devops, observability, metrics, tracing, logging]
concepts: [observability, metrics, structured-logging, tracing]
prerequisites: [percentiles, latency-numbers]
interview:
  - question: What is the difference between monitoring and observability?
    level: advanced
    answer: >-
      Monitoring answers questions you decided to ask in advance — a dashboard of error rate and
      latency, with alerts on thresholds. Observability is whether you can answer a question you
      did not anticipate, from data you already have, without shipping code. The practical test is
      an incident: "error rate is up" is monitoring, and "it is up only for users on the new
      pricing plan, in one region, on requests that touch the recommendation service" is
      observability. The second is what shortens an incident, and it requires high-cardinality
      dimensions on your telemetry, which is exactly what traditional metrics systems cannot
      store.
    followUps:
      - "Why can't metrics hold high-cardinality data?"
  - question: Logs, metrics or traces?
    level: advanced
    answer: >-
      All three, for different questions. Metrics are cheap aggregates over time, so they answer
      "is something wrong" and drive alerts — but they cannot tell you about one request. Logs are
      per-event detail, so they answer "what happened to this specific thing", at a cost
      proportional to volume. Traces follow one request across services, so they answer "where did
      the time go" and "which hop failed", which neither of the others can. The common mistake is
      using logs for everything: counting log lines to get a rate is expensive and slow where a
      counter is free.
    followUps:
      - "What makes a log line useful?"
  - question: What should you alert on?
    level: advanced
    answer: >-
      Symptoms that users experience, not causes — error rate, latency and whether the core
      journey works. Alerting on causes produces pages for things that are not affecting anyone,
      which trains people to ignore alerts, and misses the failures you did not predict. The
      framing I use is that every alert must be actionable, urgent and user-visible: if the
      response is "acknowledge and look tomorrow", it is a dashboard item or a ticket, not a page.
      And an alert needs a runbook, or it is a notification that someone has a problem rather than
      a tool for solving one.
    followUps:
      - "What about error budgets?"
resources:
  - title: "Google SRE Book — Monitoring Distributed Systems"
    url: https://sre.google/sre-book/monitoring-distributed-systems/
---

## The distinction that matters

```text
  MONITORING
    "Is the thing I thought to check still true?"
    error rate, latency, CPU, queue depth — on a dashboard,
    with thresholds.
    → good at telling you SOMETHING is wrong.

  OBSERVABILITY
    "Can I answer a question I did not anticipate, from data I
     already have, without deploying code?"
    → good at telling you WHAT is wrong.

  The incident test:

    monitoring:     "error rate is 4%"
    observability:  "all of it is users on the new pricing plan,
                     in eu-west, on requests that touch the
                     recommendation service, since 14:02"

  The second sentence ends the incident. Getting to it requires
  high-cardinality attributes on your telemetry — plan, region,
  user id, feature flag state — which is precisely what a
  metrics system cannot store.
```

:::what
**Metrics** are numeric aggregates over time. **Logs** are discrete timestamped events.
**Traces** follow one request across services as a tree of spans. **Cardinality** is the number
of distinct values a dimension can take. **SLI/SLO** are a measured indicator of service quality
and a target for it.
:::

:::why
The reason observability is a distinct idea rather than a rebranding of monitoring is that modern
failures are conditional.

A single-process application fails in ways you can enumerate: it is up or down, fast or slow, and a
dashboard of four graphs covers most of it. A system of twelve services, three regions, feature
flags and a dozen customer tiers fails for *some* requests — those from one tenant, with one flag
enabled, hitting one replica, on a particular code path. The number of such combinations is far
larger than the number of dashboards anyone will build, so the failure you are debugging is
usually one nobody anticipated.

That is what shifts the requirement. The question is no longer "do I have a graph for this" but
"can I slice the data by whatever turns out to matter, now, without shipping code and waiting for
a deploy". And it is a hard requirement because the useful dimensions are high-cardinality — user
id, tenant, request path, flag state — and a metrics system stores one time series per unique
combination of labels, so adding user id to a counter creates a million time series and takes the
system down.

The practical consequence is a split: use metrics for the small set of low-cardinality aggregates
that drive alerts, and use structured events or traces, with rich attributes, for the
investigation. Most teams have the first and not the second, which is why incidents are spent
adding log lines and redeploying — the most expensive possible way to ask a question.
:::

:::how
```text
  THE THREE, BY QUESTION

    METRICS            "is something wrong?"
      cheap: a counter is a few bytes regardless of request volume
      fast: pre-aggregated, so a year of data queries instantly
      LOW cardinality only — one time series per label
        combination
      → alerting, dashboards, capacity trends

    LOGS               "what happened to this specific thing?"
      expensive: cost is proportional to volume
      arbitrary cardinality, arbitrary detail
      → investigation, audit, debugging one request

    TRACES             "where did the time go, and which hop
                        failed?"
      one record per request, spanning services
      → latency breakdown, dependency mapping, finding the
        service that is slow in a chain of twelve

  THE CARDINALITY PROBLEM, concretely

    http_requests_total{method, status, path}
      4 methods × 5 statuses × 20 paths = 400 series. Fine.

    ...{method, status, path, user_id}
      × 1,000,000 users = 400,000,000 series.
      This takes down the metrics system. It is the most common
      way people break Prometheus.

    So: metrics for aggregates, structured events for anything
    per-entity. Do not try to make metrics do the second job.

  WHAT MAKES A LOG LINE USEFUL

    ✗ "Error processing order"
       no id, no error, no context. Searchable only for the
       word "Error".

    ✓ {"level":"error","msg":"order processing failed",
       "order_id":"991","user_id":"42","tenant":"acme",
       "error":"Gateway::Declined","attempt":2,
       "trace_id":"4bf92f...","duration_ms":847}

      - STRUCTURED, so it can be queried rather than grepped
      - the IDS, so you can follow one thing
      - the trace id, so it joins to the trace
      - the duration, so it answers a performance question too

    Structure is the whole difference: a JSON log can be queried
    by field and aggregated. A prose log can be searched for
    substrings, which is not the same thing.

  ALERT ON SYMPTOMS, NOT CAUSES

    ✗ "CPU > 80%"              nobody is affected; it may be fine
    ✗ "a pod restarted"        that is the system self-healing
    ✗ "replication lag > 5s"   is anything actually wrong?

    ✓ "error rate > 1% for 5 minutes"
    ✓ "p99 latency > 2s for 5 minutes"
    ✓ "checkout success rate < 99%"
    ✓ "queue oldest message > 10 minutes"

    Cause-based alerts page people for things users do not
    notice, which trains them to ignore pages — and they miss
    every failure mode you did not predict. Symptom-based alerts
    fire for the thing that matters regardless of the cause.

  THE FOUR GOLDEN SIGNALS

    latency      how long, as a distribution not a mean, and
                 split by success and failure — fast errors
                 otherwise hide slow successes
    traffic      requests per second
    errors       rate and ratio
    saturation   how full the constrained resource is
```
:::

:::example
```ruby
# 1. Structured logging with context that propagates.
Rails.logger.info(
  msg: "order.created",
  order_id: order.id,
  user_id: current_user.id,
  tenant: current_tenant.slug,
  total_cents: order.total_cents,
  duration_ms: elapsed.round,
  trace_id: OpenTelemetry::Trace.current_span.context.hex_trace_id,
)
# A consistent event name (`order.created`) so events can be
# counted; ids so one thing can be followed; the trace id so the
# log joins to the trace; a duration so it answers a performance
# question without a second system.

# Set the context once per request, rather than at every call site.
class ApplicationController
  around_action do |_, block|
    Rails.logger.push_tags(
      request_id: request.request_id,
      user_id: current_user&.id,
      tenant: current_tenant&.slug,
    ) { block.call }
  end
end
# Now every log line in the request carries them, including ones
# in library code that knows nothing about tenants.

# 2. Metrics — low cardinality, deliberately.
Metrics.increment("orders.created", tags: { tenant_tier: tier })
#                                            ^^^^^^^^^^^ 3 values
# NOT tenant_id. Three tiers is three series; ten thousand
# tenants is ten thousand, and user_id is a million.
Metrics.histogram("orders.total_cents", order.total_cents)
Metrics.gauge("orders.pending", Order.pending.count)

# 3. Tracing — the spans that make a latency breakdown possible.
tracer.in_span("checkout") do |span|
  span.set_attribute("order.id", order.id)
  span.set_attribute("tenant", tenant.slug)        # high cardinality
                                                    # is FINE on a span
  tracer.in_span("pricing") { price = pricing.call(order) }
  tracer.in_span("payment") { gateway.charge(order) }
  tracer.in_span("fulfilment") { fulfil(order) }
end
# A span carries arbitrary attributes because there is one record
# per request rather than one series per label combination —
# which is exactly why traces can answer the high-cardinality
# questions metrics cannot.
```

```text
// 4. An SLO, and what it is for.
//
//   SLI:  the proportion of requests served in under 300ms with
//         a non-5xx status
//   SLO:  99.9% over 30 days
//   Error budget: 0.1% of 30 days ≈ 43 minutes of failure
//
//   What the budget does is convert an argument into arithmetic:
//
//     budget remaining → ship features, take risks
//     budget spent     → stop feature work, spend it on
//                        reliability
//
//   That replaces "is it reliable enough" — which is a matter of
//   opinion and seniority — with a number both sides agreed on in
//   advance. It also sets alert thresholds honestly: page when
//   the BURN RATE means the budget will be exhausted before the
//   window ends, rather than on an arbitrary error percentage.
//
//   Burn-rate alerting:
//     14x burn over 1 hour   → page (budget gone in ~2 days)
//      6x burn over 6 hours  → page
//      1x burn over 3 days   → ticket
//   Fast burn pages; slow burn is a ticket. This is what stops
//   both alert fatigue and silent degradation.
```
:::

:::failure
**Alerting on causes.** "CPU > 80%" pages someone for a condition that may be entirely fine, and
every such page trains the recipient to ignore pages. Alert on what users experience.

**Metrics with a high-cardinality label.** Adding `user_id` to a counter creates one time series per
user. This is the standard way people take down a Prometheus instance, and it usually happens
because someone wanted a per-user investigation from a system that cannot provide one.

**Unstructured logs.** `"Error processing order"` can be searched for a substring and cannot be
queried by field, counted by tenant, or joined to a trace. Structure is the difference between
searching and asking.

**Logging without ids.** A log line with no request id, order id or trace id cannot be correlated
with anything, so an investigation becomes guesswork about timestamps.

**Averages for latency.** A mean hides the distribution, and the distribution is what users
experience — as the fundamentals lesson's arithmetic shows, a page making many calls encounters
the tail routinely. Report p50, p95 and p99, and split by success and failure, because fast errors
otherwise mask slow successes.

**No trace context across services.** Without a propagated trace id, a request that crosses five
services produces five disconnected sets of logs and no way to join them. The propagation is the
whole mechanism.

**Logging secrets.** Request bodies on a login endpoint, authorisation headers, card numbers.
Logs are replicated, retained and widely readable, so this is a durable disclosure in several
systems at once.

**Alerts with no runbook.** A page at 3am that says "error rate high" and nothing else leaves the
responder to rediscover the system. The runbook does not need to be long; it needs to say what to
check and what the usual causes are.

**Too many alerts.** Alert fatigue is a predictable outcome, not a personal failing: past a certain
rate, every alert is triaged as probably-noise, including the real one. Fewer, better alerts beat
comprehensive ones.

**Dashboards nobody reads.** Forty panels is a wall, not information. One page with the golden
signals and the core journey's success rate, and the rest on demand.

**Sampling without keeping the errors.** Head-based sampling at 1% discards 99% of the failures
too. Tail-based sampling keeps every trace that errored or was slow, which is the opposite of what
naive sampling does.
:::

:::realworld
```text
// What to instrument, in order of value.
//
//   1. The core journey's success rate. "Can users check out" is
//      worth more than every infrastructure metric combined,
//      because it is the only one whose failure definitely
//      matters.
//   2. The four golden signals per service: latency, traffic,
//      errors, saturation.
//   3. Dependency health — latency and error rate per outbound
//      call. This is what distinguishes "we are slow" from
//      "the payment provider is slow".
//   4. Queue oldest-message age, from the queues lesson. Depth
//      alone over-reports bursts and misses stuck messages.
//   5. Business metrics: orders per minute, signups. These catch
//      failures that are technically invisible — a form that
//      renders perfectly and submits to a broken endpoint shows
//      no errors and zero conversions.
//
// Point 5 is the one teams reach last and is often the fastest
// detector, because it measures the outcome rather than the
// mechanism.
```

```text
// A worked incident, showing what each tool contributes:
//
//   14:02  ALERT: checkout success rate 97% (SLO 99.5%)
//          ← symptom-based, so it fired for a real user impact
//
//   14:03  dashboard: errors concentrated in eu-west, started at
//          14:02 sharply
//          ← metrics narrow the WHEN and WHERE
//
//   14:05  traces for failing requests: all have a payment span
//          of 30s ending in a timeout
//          ← traces identify the HOP
//
//   14:06  logs for those traces: "Gateway::Timeout", tenant
//          field shows all tiers, so not tenant-specific
//          ← logs give the WHAT and rule out hypotheses
//
//   14:07  the provider's status page: degraded in one region
//          ← and the fix is a failover, not a deploy
//
//   Each layer answered a different question, and the sequence
//   took five minutes. Without traces, step 3 is "read a lot of
//   logs". Without structured logs, step 4 is grep. Without
//   symptom-based alerting, step 1 never happens and a customer
//   reports it an hour later.
```

```text
// Cost control, since observability bills can exceed compute:
//
//   - sample traces, but TAIL-based: keep 100% of errors and slow
//     requests, 1% of the rest
//   - log at info in production, debug behind a flag
//   - short retention for raw logs, long retention for
//     pre-aggregated metrics
//   - cardinality limits on metrics, enforced, because one bad
//     label is an outage
//   - derive metrics from logs where possible rather than
//     emitting both
//
// The ordering that matters: never sample away your errors.
// Head-based sampling at 1% means 99% of your failures are gone,
// which is exactly backwards.
```
:::

:::mistakes
**Alerting on causes.** Pages for things nobody experiences.

**High-cardinality metric labels.** One series per value; this breaks the metrics system.

**Unstructured logs.** Searchable, not queryable.

**No ids in log lines.** Nothing can be correlated.

**Averages for latency.** The distribution is the user experience.

**Not splitting latency by success and failure.** Fast errors hide slow successes.

**No trace propagation.** Five services, five disconnected log sets.

**Secrets in logs.** Durable disclosure across several systems.

**Alerts without runbooks.** A notification, not a tool.

**Too many alerts.** Fatigue is the predictable outcome.

**Head-based sampling.** Discards the errors you needed.

**Forty-panel dashboards.** A wall rather than information.
:::

:::tradeoffs
**Metrics** — extremely cheap, pre-aggregated, fast to query over long windows; low cardinality
only, and they cannot describe an individual request.

**Logs** — arbitrary detail and cardinality, familiar; cost scales with volume and querying is
slower.

**Traces** — the only thing that answers "where did the time go" across services; needs
instrumentation and propagation everywhere, and sampling decisions.

**Structured logging** — queryable, aggregatable, joinable to traces; slightly more verbose to
write and worth automating via request-scoped context.

**High sampling** — complete data, high cost. **Low head-based sampling** — cheap and discards
your errors. **Tail-based** — keeps every error and slow request at low cost, and needs a
collector that buffers spans before deciding.

**Symptom alerts** — fire for things that matter and are less specific about the cause.
**Cause alerts** — precise and page for non-problems while missing unanticipated failures.

**SLOs with error budgets** — convert a reliability argument into arithmetic and give honest
burn-rate thresholds; they require agreeing a number, which is the organisational work.

The one-sentence version: **alert on symptoms, investigate with high-cardinality data, and keep
all of your errors.** Monitoring tells you something is wrong; observability tells you what, and
the gap between them is the duration of your next incident.
:::

:::checkpoint
1. Give the incident test that distinguishes monitoring from observability.
2. Why can a metrics system not hold `user_id` as a label? Give the arithmetic.
3. Which question does each of logs, metrics and traces answer best?
4. Name four things a useful log line contains beyond the message.
5. Why alert on symptoms rather than causes? Give two failure modes of cause-based alerting.
6. Why split latency by success and failure?
7. What is an error budget for, and what does burn-rate alerting add?
8. Why is head-based sampling at 1% exactly backwards?
:::

:::interview
Give the distinction with the incident test, because it makes the abstraction concrete:

*"Monitoring answers questions you decided to ask in advance; observability is whether you can
answer a question you did not anticipate, from data you already have, without shipping code. The
test is an incident: 'error rate is four percent' is monitoring. 'All of it is users on the new
pricing plan, in eu-west, on requests touching the recommendation service, since 14:02' is
observability — and the second sentence is the one that ends the incident."*

Explain why this became necessary:

*"The reason it is a distinct idea is that modern failures are conditional. A single process is up
or down, and four graphs cover it. Twelve services across three regions with feature flags and
customer tiers fails for *some* requests, and the number of such combinations is far larger than
the number of dashboards anyone will build — so the failure you are debugging is almost always one
nobody anticipated. That means you need to slice by whatever turns out to matter, which requires
high-cardinality attributes."*

Then the constraint that forces the split:

*"And that is precisely what metrics cannot do, because a metrics system stores one time series per
unique label combination. Four methods by five statuses by twenty paths is four hundred series,
which is fine; adding user id multiplies it by a million, which takes the system down — and it is
the most common way people break Prometheus. So metrics for the low-cardinality aggregates that
drive alerts, and structured events or traces with rich attributes for investigation. Most teams
have the first and not the second, which is why incidents get spent adding log lines and
redeploying, the most expensive possible way to ask a question."*

On alerting, give the rule and the reason:

*"Alert on symptoms users experience — error rate, latency, whether checkout works — not on causes.
Cause-based alerts page people for conditions nobody is affected by, which trains them to ignore
pages, and they miss every failure mode that was not predicted. Every alert should be actionable,
urgent and user-visible, and it needs a runbook, or it is a notification that someone has a problem
rather than a tool for solving one. And one detail I would insist on: tail-based sampling, keeping
a hundred percent of errors and slow requests. Head-based sampling at one percent throws away
ninety-nine percent of your failures, which is exactly backwards."*
:::

## What you now know

- Monitoring answers anticipated questions; observability answers unanticipated ones from existing
  data.
- Modern failures are conditional, so the combination space exceeds any set of dashboards.
- Metrics store one time series per label combination, so high-cardinality labels break them.
- Metrics answer "is something wrong"; logs answer "what happened to this"; traces answer "where
  did the time go".
- A useful log line is structured and carries ids, a trace id, and a duration.
- Set log context once per request so library code inherits it.
- Spans can carry high-cardinality attributes because there is one record per request.
- Alert on symptoms — error rate, latency, core journey success — not on CPU or restarts.
- Cause-based alerts page for non-problems and miss unanticipated failures.
- Split latency by success and failure, or fast errors mask slow successes.
- The four golden signals: latency, traffic, errors, saturation.
- An error budget converts a reliability argument into arithmetic agreed in advance.
- Burn-rate alerting pages on fast burn and tickets slow burn, avoiding both fatigue and silent
  decay.
- Business metrics catch failures that are technically invisible.
- Tail-based sampling keeps every error; head-based sampling discards them.
- Never log secrets — logs are replicated, retained and widely readable.
- Every alert needs a runbook.
