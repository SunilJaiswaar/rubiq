---
title: Memory and the garbage collector
summary: Why a Ruby process grows and never shrinks, the difference between a leak and fragmentation, and the three allocation patterns that cause most of it.
level: expert
minutes: 20
version: "3.4"
status: stable
last_reviewed: "2026-10-07"
tags: [ruby, gc, memory, performance, allocations]
concepts: [garbage-collection, memory, allocations, fragmentation]
prerequisites: [objects, mutability]
interview:
  - question: How does Ruby's garbage collector work?
    level: expert
    answer: >-
      It is a generational, incremental mark-and-sweep collector with compaction available.
      Generational means objects start in a young generation and most die there, so a minor GC
      only traces young objects — which is cheap, because the common case is garbage that was
      just created. An object surviving three minor collections is promoted to the old
      generation, which is only traced during a major GC. Incremental means the marking phase
      is split into steps so a major GC does not stop the world for one long pause.
      Mark-and-sweep means it traces reachability from roots and frees what it did not reach,
      which is why cycles are collected correctly — unlike reference counting.
    followUps:
      - "What triggers a major GC rather than a minor one?"
  - question: Why does a Ruby process's memory grow and never come back down?
    level: expert
    answer: >-
      Two separate reasons, and distinguishing them is the whole diagnosis. First, Ruby's heap
      only grows: freed slots are reused for new objects but the pages are rarely returned to
      the OS, so RSS reflects the high-water mark rather than current use. Second, glibc malloc
      fragmentation — freed memory in the middle of an arena cannot be returned, and Ruby's
      allocation pattern across many threads makes this worse, which is why jemalloc or
      MALLOC_ARENA_MAX often cuts RSS substantially with no code change. Neither of those is a
      leak. A real leak is unbounded retention: something holds references that keep growing,
      and ObjectSpace counts rising monotonically is how you tell.
    followUps:
      - "How would you prove which one you have?"
  - question: What is the most common cause of high allocation counts in a Rails app?
    level: expert
    answer: >-
      Loading full objects to use one field. `User.all.map(&:email)` instantiates every record
      with every column and every attribute object, when `User.pluck(:email)` returns strings.
      After that: string building in a loop rather than `join`, and `each` over a large
      relation instead of `find_each`, which loads everything into memory at once. All three
      are the same mistake — creating objects proportional to data volume when the result does
      not need them — and allocation count rather than time is the signal, because the cost
      shows up later as GC pressure rather than at the allocation site.
    followUps:
      - "How do you measure allocations rather than time?"
resources:
  - title: "Ruby docs — GC"
    url: https://docs.ruby-lang.org/en/master/GC.html
---

## Measuring before theorising

```ruby
require "objspace"

GC.stat[:heap_live_slots]       # objects currently alive
GC.stat[:total_allocated_objects]  # cumulative, since boot
GC.stat[:minor_gc_count]        # cheap collections
GC.stat[:major_gc_count]        # expensive ones
ObjectSpace.count_objects       # {:TOTAL=>..., :T_STRING=>..., :T_ARRAY=>...}

# Allocations for one block of code — the number that matters most.
before = GC.stat[:total_allocated_objects]
do_the_thing
GC.stat[:total_allocated_objects] - before
```

:::what
Ruby's GC is **generational** (young objects are collected separately and cheaply),
**incremental** (the marking phase is split into steps to shorten pauses), **mark-and-sweep**
(it traces reachability from roots and frees the rest), and optionally **compacting** (it can
move objects to reduce fragmentation).
:::

:::why
Garbage collection exists so you do not write `free`. The design choices within it exist
because of one observation that holds across almost all programs: **most objects die young.**

A request allocates a few hundred thousand objects, almost all of which are unreachable by
the time the response is written. A collector that traced the entire heap to discover that
would do an enormous amount of work to find a small amount of garbage. So Ruby traces only
the young generation most of the time — a minor GC — and promotes survivors out of the way.
An object that lives through three minor collections is probably long-lived, so it stops
being examined on every pass.

Incremental marking exists for a different reason: latency. A major GC that marks the whole
heap in one go produces a pause proportional to heap size, and a 200ms pause in the middle
of a request is a user-visible stall. Splitting marking into steps trades a little total
throughput for a much better tail latency, which is the correct trade for a web application
and the wrong one for a batch job — hence the knobs.
:::

:::how
```text
  THE GENERATIONS

    new object ──▶ [ YOUNG ]
                      │
             survives 3 minor GCs
                      │
                      ▼
                   [ OLD ]  ── only traced during a MAJOR GC

    MINOR GC: trace young objects only. Milliseconds. Frequent.
    MAJOR GC: trace everything. Tens to hundreds of ms. Rare.

  WHAT TRIGGERS EACH

    Minor: the young generation fills up (eden slots exhausted).
    Major: the old generation has grown past a factor of its size
           after the last major GC (oldmalloc / old-objects thresholds),
           or malloc_increase crosses a limit, or you call GC.start.

  THE WRITE BARRIER — the part that makes generations possible

    If an OLD object gains a reference to a YOUNG object, a minor GC
    tracing only young objects would not see that the young one is
    reachable, and would free it.

        old_array << young_string    # old → young reference

    Ruby records this ("remembers" the old object) via a write
    barrier, so minor GCs also scan remembered old objects. This is
    why a long-lived cache that keeps absorbing new objects makes
    minor GCs progressively less cheap: the remembered set grows.

  MARK AND SWEEP, and why cycles are fine

    roots (globals, constants, the stack, live frames)
      │
      ├─▶ reachable ────▶ reachable ────▶ reachable
      │
      └─▶ reachable

    a ⇄ b  (referring to each other, unreachable from roots)
           → not marked → swept. Correct.

    Reference counting could not do this — each count stays at 1.
    That is the main reason Ruby does not use refcounting.
```
:::

:::failure
**The three allocation patterns that cause most GC pressure.**

```ruby
# 1. Loading objects to read one column. The most common by far.
User.all.map(&:email)        # N AR objects, N attribute hashes, N strings
User.pluck(:email)           # N strings. Nothing else.
# On 50,000 users that is roughly 50,000 vs 500,000+ objects.

Order.limit(10_000).map(&:total).sum   # 10,000 AR objects
Order.limit(10_000).sum(:total)        # one SUM in the database, 1 object

# 2. String building in a loop.
report = ""
items.each { |i| report += "#{i.name}\n" }   # a NEW string per iteration
report = items.map { |i| "#{i.name}\n" }.join  # one join allocation
# `+=` on a string is `report = report + "..."`: it allocates a string
# the size of everything so far, every time. Quadratic in total bytes.

# 3. Loading a whole table to iterate it.
Order.all.each { |o| process(o) }               # every row in memory
Order.find_each(batch_size: 500) { |o| process(o) }  # 500 at a time
```

All three are the same mistake: creating objects proportional to the data when the result
does not need them. And the cost is deferred — the allocation itself is fast, and you pay for
it later in GC time, which is why the symptom appears somewhere other than the cause.

**The retained-object leak, which is the only real leak Ruby has.**

```ruby
# A class-level collection that only grows.
class Tracker
  SEEN = []                                   # never cleared
  def self.track(x) = SEEN << x
end
# Every tracked object is reachable from a constant, so it is never
# collected. After a week the process is 4 GB.

# Memoisation keyed on something unbounded.
def user_for(id)
  @cache ||= {}
  @cache[id] ||= User.find(id)     # on a long-lived object: unbounded
end

# A closure capturing more than you meant.
def handler
  big = File.read("huge.csv")      # 200 MB
  ->(x) { x * 2 }                  # captures the whole scope
end
# The lambda keeps `big` alive for as long as the lambda lives.
```

**Confusing fragmentation with a leak.**

```text
  A LEAK                          FRAGMENTATION
  heap_live_slots rises           heap_live_slots is flat
  monotonically                   RSS rises then plateaus
  ObjectSpace counts of one       heap_free_slots is large
  type keep growing               while RSS stays high
  → find what retains them        → jemalloc / MALLOC_ARENA_MAX
                                     / GC.compact
```

They look identical from the outside — RSS going up — and need completely different
responses. Checking `heap_live_slots` first tells you which conversation to have.

**`GC.start` in application code.** It forces a full major collection, which is exactly the
expensive thing, and the collector's own heuristics are better than your guess. The legitimate
uses are benchmarking and immediately before forking.
:::

:::realworld
```ruby
# 1. Finding the retainer — allocations vs retentions, which is the
#    distinction that matters.
require "memory_profiler"

report = MemoryProfiler.report { 100.times { do_the_thing } }
report.pretty_print
# "Total allocated" — churn. Causes GC pressure.
# "Total retained"  — still alive after the block. Causes a leak.
# Grouped by gem, by file, by line. The retained section is where a
# leak is visible; the allocated section is where GC pressure is.

# 2. Allocation counting in a test, so a regression fails CI.
def test_index_allocations
  before = GC.stat[:total_allocated_objects]
  get "/orders"
  allocated = GC.stat[:total_allocated_objects] - before
  assert_operator allocated, :<, 50_000, "allocation regression"
end
# A number with a budget, like any other performance budget.
```

```ruby
# 3. Copy-on-write and preforking. The reason Puma and Unicorn boot
#    the app before forking:
#
#    parent boots Rails  → 200 MB of mostly-immutable objects
#    fork 8 workers      → pages SHARED until written to
#
#    A GC in a child marks objects, which writes to their headers,
#    which un-shares the page. That is what GC.compact before forking
#    helps with, and why these settings exist:
GC.compact                    # defragment before forking
# Or in a preload block:
#   before_fork { GC.compact }

# 4. The allocator, which is often the biggest single win and
#    requires no code change at all.
#
#    LD_PRELOAD=/usr/lib/libjemalloc.so.2
#      — typically 20-40% lower RSS for a Rails app
#    MALLOC_ARENA_MAX=2
#      — glibc creates an arena per thread by default; capping it
#        trades a little contention for much less fragmentation
#
#    Neither changes how much your app allocates. They change how
#    much of what it frees can be reused.
```

```ruby
# 5. The knobs worth knowing, and the honest advice about them.
#    RUBY_GC_HEAP_INIT_SLOTS      — start bigger, fewer early GCs
#    RUBY_GC_HEAP_GROWTH_FACTOR   — grow faster, less often
#    RUBY_GC_MALLOC_LIMIT         — delay major GCs triggered by malloc
#
#    Measure before and after. The defaults are good, these interact,
#    and "tuning the GC" is almost always a worse use of time than
#    not allocating the objects in the first place.
```
:::

:::mistakes
**Optimising allocations before measuring.** Count them; the biggest source is rarely where
it feels like it is.

**Confusing allocated with retained.** High churn causes GC pressure. High retention causes a
leak. Different numbers, different fixes.

**Treating RSS as current memory use.** Ruby's heap does not shrink. RSS is the high-water
mark plus fragmentation.

**Calling `GC.start`** to fix a memory problem. You are forcing the most expensive operation
the collector has.

**Memoising on a long-lived object with an unbounded key.** `@cache[id] ||=` on a singleton or
class is a leak with extra steps. Bound it, or use a real cache with eviction.

**`+=` on strings in a loop.** Quadratic. Use `<<` on one buffer, or build an array and
`join`.

**Assuming `WeakRef` solves retention.** It helps for caches, and it is slow and awkward, and
the object can vanish between your check and your use. Bounded caches are usually better.

**`ObjectSpace.each_object` in production.** It stops the world and walks the entire heap.
Diagnostic only.

**Ignoring the allocator.** jemalloc or `MALLOC_ARENA_MAX` is a configuration change with no
code risk and often the largest single reduction in RSS available.
:::

:::tradeoffs
**Generational GC** — most collections are cheap, because most garbage is young. Costs a
write barrier on every reference store and a remembered set that grows with long-lived
objects pointing at new ones.

**Incremental marking** — much shorter pauses, slightly lower total throughput. Right for a
request/response system; the wrong trade for a batch job where total time is what matters.

**Compaction (`GC.compact`)** — reduces fragmentation and improves copy-on-write sharing, at
the cost of a long pause. Correct before forking, wrong inside a request.

**A bigger heap (`RUBY_GC_HEAP_INIT_SLOTS`)** — fewer collections, more baseline memory. Worth
it when you know the steady-state size and are paying for early growth.

**jemalloc** — typically 20–40% lower RSS for Rails with no code change, at the cost of a
non-default dependency in your image.

**Allocating less** — the only option that improves both memory *and* time, and the only one
that requires changing code. `pluck` over `map`, `find_each` over `each`, `join` over `+=`.

The order to work in: **allocate less, then change the allocator, then tune the GC.** The
first has the largest effect, the second is nearly free, and the third is where people start.
:::

:::checkpoint
1. Why is a minor GC cheap, and what makes an object stop being eligible for one?
2. What is a write barrier for, and why does a long-lived cache make minor GCs slower?
3. `a` and `b` reference each other and nothing else references them. Collected or not? Why
   does that answer differ from reference counting?
4. Distinguish a leak from fragmentation using `GC.stat`. Which field do you check first?
5. `User.all.map(&:email)` versus `User.pluck(:email)` on 50,000 rows — what is the
   difference in objects?
6. Why does `report += "..."` in a loop get quadratically worse?
7. Why `GC.compact` before forking?
:::

:::interview
Lead with the observation the design rests on, not the acronym:

*"It is generational, incremental mark-and-sweep with optional compaction. Generational
matters because most objects die young — a request allocates hundreds of thousands of objects
that are all garbage by the time it responds, so tracing the whole heap to find that would be
enormous work for a small result. Minor GCs trace only the young generation; an object
surviving three of them is promoted and stops being examined."*

Then the question that separates people who have debugged this from people who have read about
it:

*"The thing I would want to establish first about a growing process is whether it is a leak at
all. Ruby's heap does not shrink — freed slots are reused but pages are rarely returned to the
OS — so RSS is a high-water mark. Plus glibc fragmentation, which is why switching to jemalloc
or capping `MALLOC_ARENA_MAX` often cuts RSS by a third with no code change. A real leak is
unbounded retention, and `heap_live_slots` rising monotonically is how you tell the difference.
Checking that one field decides which problem you are solving."*

Then the practical answer, which is where most of the value is:

*"In a Rails app the usual cause of GC pressure is loading full objects to read one field —
`User.all.map(&:email)` instantiates every record and every attribute where `pluck` returns
strings. Then string `+=` in a loop, which is quadratic, and `each` over a relation instead of
`find_each`. And the ordering I would work in is: allocate less, then change the allocator,
then tune the GC — because that is descending order of effect and people usually start at the
end."*
:::

## What you now know

- Ruby's GC is generational, incremental, mark-and-sweep, optionally compacting.
- Minor GCs trace only young objects and are cheap; three survivals promote an object.
- The write barrier records old→young references, so minor GCs stay correct.
- A growing long-lived cache enlarges the remembered set and makes minor GCs slower.
- Mark-and-sweep collects cycles correctly; reference counting cannot.
- RSS is a high-water mark: Ruby's heap grows and rarely returns pages to the OS.
- A leak shows as rising `heap_live_slots`; fragmentation shows as high RSS with free slots.
- jemalloc or `MALLOC_ARENA_MAX=2` often cuts RSS substantially with no code change.
- The three big allocation sources: full objects for one column, string `+=` in a loop,
  loading a whole table.
- Distinguish allocated (GC pressure) from retained (leak) in `memory_profiler`.
- `GC.compact` before forking improves copy-on-write sharing; never call it in a request.
- Work in order: allocate less, change the allocator, tune the GC.
