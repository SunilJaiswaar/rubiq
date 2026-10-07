---
title: Finding what is actually slow
summary: Measure before optimising. The tools that tell you where the time goes, and the four things it usually is.
level: advanced
minutes: 13
version: "8.0"
status: stable
last_reviewed: "2026-10-07"
tags: [rails, performance, profiling, observability]
concepts: [profiling, observability, database-performance, memory]
prerequisites: [n-plus-one, indexes]
interview:
  - question: A page is slow in production. How do you find out why?
    level: advanced
    answer: >-
      Measure, in that environment, before changing anything. Start with the breakdown the
      framework already gives you — Rails logs view, database and allocation time per
      request, so you immediately know whether it is query time, render time or neither.
      Then narrow: `rack-mini-profiler` in a browser for per-query timings, APM traces for
      production percentiles, `EXPLAIN ANALYZE` on the slow query. The common mistake is
      optimising from intuition — the bottleneck is usually not where it feels like it is,
      and most slow Rails pages are one of four things: N+1 queries, a missing index, an
      unbounded collection, or memory pressure causing GC.
    followUps:
      - "Why percentiles rather than averages?"
      - "What does a high allocation count tell you?"
  - question: Why look at p95 and p99 rather than the average?
    level: advanced
    answer: >-
      Because the average hides the shape of the distribution. A page averaging 200ms might
      be 80ms for most users and 4 seconds for the 5% with the most data — and those are
      the users who complain, churn, and whose requests tie up your workers. Averages also
      conceal bimodality: a cache hit at 20ms and a miss at 2 seconds average to something
      that describes neither. You optimise the tail because the tail is where users
      actually experience the system.
resources:
  - title: "rack-mini-profiler"
    url: https://github.com/MiniProfiler/rack-mini-profiler
---

## Measure first, and mean it

```text
  Completed 200 OK in 1847ms (Views: 23.1ms | ActiveRecord: 1794.3ms | Allocations: 284913)
```

That one line, which Rails prints for every request, answers the first question: it is the
database, not rendering.

```text
  Completed 200 OK in 1203ms (Views: 1150.2ms | ActiveRecord: 18.4ms | Allocations: 1894203)
```

This one is rendering, and the allocation count says why — nearly two million objects for
one request is garbage-collection pressure.

:::problem
Optimising without measuring fails in a specific way: you make something faster that was not
the bottleneck, so the page is the same speed and you now have more complex code.

It fails because intuition is unreliable about where time goes. The code you wrote most
recently, or that looks most complicated, feels like the suspect. It usually is not.
:::

:::what
**Profiling** attributes elapsed time to specific code. **Observability** is having that
information for production traffic rather than only locally.
:::

:::why
Production is the only environment where the numbers mean anything, for three reasons that
all point the same way: the data volume is different, the network latency to the database is
different, and the concurrency is different. A page that is fast with 50 seeded rows on a
local Postgres tells you nothing about 5 million rows across an availability zone.

Which is why the first tool is the production log, not a local benchmark.
:::

## The tools, in the order you should reach for them

```ruby
# 1. The log, which you already have.
#    "ActiveRecord: 1794ms" → database. "Views: 1150ms" → rendering.
#    High allocations with low DB time → object churn and GC.

# 2. rack-mini-profiler — a per-request breakdown in the browser,
#    including every query with its own timing and a backtrace to the line
#    that issued it. The fastest way to find an N+1.
gem "rack-mini-profiler"
gem "memory_profiler"      # adds memory analysis to the same panel
gem "stackprof"            # adds CPU flamegraphs

# 3. For a specific slow query:
puts Order.where(...).explain(analyze: true)

# 4. For production percentiles and traces: an APM.
#    Or, with no budget, Rails' own instrumentation:
ActiveSupport::Notifications.subscribe("sql.active_record") do |*, payload|
  next if payload[:name] == "SCHEMA"
  Rails.logger.warn("SLOW: #{payload[:sql]}") if payload[:duration].to_f > 100
end
```

:::how
```text
  Read the log line, then branch:

    ActiveRecord time dominates
      │
      ├── many queries?  ───▶ N+1. Check the log for repeats. Fix with includes.
      │
      └── few, slow queries? ─▶ EXPLAIN ANALYZE. Usually a missing index
                                 or a query returning far too many rows.

    Views time dominates
      │
      ├── high allocations? ──▶ object churn. Often rendering a huge collection,
      │                          or building strings in a loop.
      │
      └── low allocations?  ──▶ real computation in the view, or a slow partial
                                 rendered N times. Check for a cache opportunity.

    Neither dominates but total is high
      │
      └── external I/O. An HTTP call in the request path, or a lock wait.
```
:::

## The four things it usually is

```ruby
# 1. N+1 queries. Covered fully in its own lesson.
#    Signature: many near-identical queries differing only by id.

# 2. A missing index. Signature: one query, hundreds of milliseconds.
Order.where(user_id: 1).explain(analyze: true)
#    Seq Scan on orders  (cost=0.00..18334.00 rows=1 width=36)
#                        (actual time=0.015..412.3 rows=1 loops=1)
#    → 412ms to find one row. Add the index.

# 3. An unbounded collection. Signature: fast for most users, slow for some.
@orders = current_user.orders                     # some users have 40,000
@orders = current_user.orders.page(params[:page]) # bounded

# 4. Memory pressure. Signature: high allocations, GC time, rising RSS.
Order.all.each { ... }                   # loads every row into memory
Order.find_each(batch_size: 500) { ... } # 500 at a time
```

:::failure
**The three allocation patterns that cause GC pressure**, which is the least obvious of the
four:

```ruby
# a. Loading objects to read one column.
Order.limit(10_000).map(&:total).sum     # 10,000 full AR objects
Order.limit(10_000).sum(:total)          # one SUM, zero objects
Order.limit(10_000).pluck(:total)        # 10,000 floats, no objects

# b. String building in a loop.
report = ""
items.each { |i| report += "#{i.name}\n" }   # a new string per iteration
report = items.map { |i| "#{i.name}\n" }.join  # one allocation at the end

# c. Rendering a large collection one partial at a time.
<% @items.each do |item| %><%= render item %><% end %>   # N partial lookups
<%= render partial: "item", collection: @items %>         # one lookup, one pass
```

Each of those produces objects proportional to the collection size, and Ruby's GC has to
trace all of them. The symptom is a request whose time is not in the database and not in any
single slow operation — it is spread across allocation and collection.

```ruby
# Seeing it directly:
require "memory_profiler"
report = MemoryProfiler.report { OrdersController.new.index }
report.pretty_print(to_file: "memory.txt")
# Shows allocations by gem, by file, by line.
```
:::

:::realworld
```ruby
# The things worth having configured before you need them.

# 1. Log slow queries from Postgres itself.
#    postgresql.conf:  log_min_duration_statement = 200

# 2. pg_stat_statements — the single most useful Postgres extension.
#    Ranks queries by total time across all executions, which finds the
#    1ms query called 50,000 times per request-minute. A profiler looking
#    at one request never will.
```

```sql
SELECT calls, round(mean_exec_time::numeric, 2) AS avg_ms,
       round(total_exec_time::numeric) AS total_ms, query
FROM pg_stat_statements
ORDER BY total_exec_time DESC
LIMIT 10;
```

```ruby
# 3. A request-level budget, logged when exceeded.
config.after_initialize do
  ActiveSupport::Notifications.subscribe("process_action.action_controller") do |*, payload|
    if payload[:db_runtime].to_f > 500
      Rails.logger.warn("DB BUDGET: #{payload[:controller]}##{payload[:action]} " \
                        "#{payload[:db_runtime].round}ms")
    end
  end
end

# 4. Connection pool sizing — a common and invisible bottleneck.
#    pool must be >= threads per process, or threads queue for a connection
#    and the symptom looks like database slowness.
#    config/database.yml:  pool: <%= ENV.fetch("RAILS_MAX_THREADS", 5) %>
```

That last one is worth dwelling on because it is so often misdiagnosed: if Puma runs 5
threads and the pool is 5, any request holding a connection while doing something else
starves the others. The dashboard shows "database slow" and the database is idle.
:::

:::mistakes
**Benchmarking in development.** Different data volume, a local database, no concurrency,
and code reloading on every request. The numbers are not comparable to anything.

**Optimising the average.** A page averaging 200ms can be 80ms for most users and 4 seconds
for the ones with the most data — and those are the users who notice. Always look at p95
and p99.

**Trusting a single measurement.** The first request after a deploy has cold caches and an
unwarmed connection pool. Measure a distribution.

**Micro-optimising Ruby while a query takes 400ms.** Replacing `map.select` with a single
`each` saves microseconds. The index saves 400 milliseconds. Fix the biggest number first.

**Caching instead of fixing.** From the caching lesson: a slow query behind a cache is still
slow on every miss, and you have acquired an invalidation problem.

**Forgetting that `count` is a query.** `@orders.count` in a view after `@orders` is loaded
issues a `COUNT(*)` when `size` would have used the loaded array.
:::

:::tradeoffs
**Measuring first** costs time before you have changed anything, which feels unproductive
when someone is waiting for a fix. The payoff is that the change you make is the one that
matters.

**Optimising by intuition** is faster to start and frequently fixes nothing, leaving more
complex code and the original problem — and now the obvious suspect has been eliminated so
the next guess is worse.

**Observability infrastructure** — APM, `pg_stat_statements`, logging budgets — costs setup
and money, and makes the difference between diagnosing a production issue in ten minutes and
in two days. It is also the only thing that finds the aggregate problems a single-request
profiler cannot: the fast query called 50,000 times.

The order that holds: **measure, fix the biggest number, measure again.** And the
corollary — most Rails performance work is not clever. It is an index, an `includes`, a
`page`, or a `find_each`. Reach for the exotic explanation only after eliminating those four.
:::

:::checkpoint
Diagnose each from the log line alone, and say what you would check next:

1. `in 2100ms (Views: 15ms | ActiveRecord: 2050ms | Allocations: 12000)`
2. `in 1400ms (Views: 1350ms | ActiveRecord: 20ms | Allocations: 2100000)`
3. `in 900ms (Views: 30ms | ActiveRecord: 40ms | Allocations: 18000)`
4. `in 450ms (Views: 20ms | ActiveRecord: 410ms | Allocations: 9000)` with 200 query lines
5. `in 450ms (Views: 20ms | ActiveRecord: 410ms | Allocations: 9000)` with 2 query lines

Note that 4 and 5 have identical timings and different causes. What distinguishes them, and
what is the fix for each?
:::

:::interview
Performance questions are really about method, so describe a process rather than a list of
tricks.

*"I measure in production before changing anything, because data volume, network latency and
concurrency all differ from development. The Rails log already splits view time from database
time, so one line tells me which half of the system to look at. If it is the database I check
whether it is many queries — an N+1 — or a few slow ones, which is an EXPLAIN and usually a
missing index. If it is views with high allocations, it is object churn, often loading full
records to read one column."*

Then the part that signals production experience: *"and I look at p95 and p99 rather than
averages, because an average hides a bimodal distribution — a cache hit at 20ms and a miss at
2 seconds average to a number describing neither. I also want `pg_stat_statements`, because
the worst query is often not the slowest one: a 1ms query executed 50,000 times a minute
dominates total time and no single-request profiler will ever show it."*

Close with the honest summary: *"most Rails performance work is not clever. It is an index, an
`includes`, pagination, or `find_each`. I eliminate those four before looking for anything
interesting."*
:::

## What you now know

- Measure in production. The Rails log already splits view, database and allocation time.
- Many similar queries means N+1; few slow queries means EXPLAIN and probably an index.
- High allocations with low database time means object churn — usually loading records to
  read a column.
- An unbounded collection is fast for most users and slow for the ones with data.
- Use p95 and p99; averages hide bimodal distributions and the users who complain.
- `pg_stat_statements` finds the fast query executed 50,000 times, which a request profiler
  cannot.
- Check the connection pool against thread count — starvation looks exactly like database
  slowness.
- Fix the biggest number first. Most of the time it is an index, `includes`, `page` or
  `find_each`.
