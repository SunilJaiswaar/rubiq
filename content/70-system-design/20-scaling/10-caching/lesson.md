---
title: Caching strategies
summary: Four placements, three invalidation strategies, and the three failure modes that turn a cache from an optimisation into an outage.
level: advanced
minutes: 18
version: "1"
status: stable
last_reviewed: "2026-10-07"
tags: [system-design, caching, redis, invalidation, stampede]
concepts: [cache-strategies, cache-invalidation, stampede, cache-coherence]
prerequisites: [caching, latency-numbers]
interview:
  - question: Where would you put a cache, and in what order?
    level: advanced
    answer: >-
      In increasing distance from the user: the browser, a CDN, an application-level in-process
      cache, and a shared cache like Redis — and finally the database's own buffer pool, which you
      get for free. The order matters because each layer that handles a request removes load from
      every layer behind it, so a cache near the user is worth far more than one near the
      database. The usual mistake is reaching for Redis first: an in-process cache is a hash lookup
      at nanoseconds with no network hop, and for things that are small, shared and rarely change —
      feature flags, configuration, a routing table — it is strictly better, at the cost of being
      per-instance and therefore harder to invalidate.
    followUps:
      - "What makes an in-process cache hard to invalidate?"
  - question: What is a cache stampede and how do you prevent it?
    level: advanced
    answer: >-
      A popular key expires and every concurrent request misses simultaneously, so all of them hit
      the database for the same value — a thousand identical queries where one would do, arriving
      at exactly the moment the cache stopped protecting you. Three defences: a lock or
      single-flight so only one request recomputes while the others wait; stale-while-revalidate,
      serving the expired value while one request refreshes; and jittered TTLs so keys written
      together do not expire together. The third is the cheapest and the most commonly missing,
      because a deploy that warms a thousand keys gives them all the same expiry.
    followUps:
      - "Which would you reach for first?"
  - question: Write-through or write-behind?
    level: advanced
    answer: >-
      Write-through updates the cache and the store synchronously, so the cache is never stale and
      every write pays both costs. Write-behind acknowledges after the cache write and persists
      asynchronously, which is much faster and loses data if the process dies before the flush.
      In practice most systems use neither: they use cache-aside, where the application reads
      through the cache and *deletes* the key on write rather than updating it. Deleting is more
      robust than updating because a failed update leaves a wrong value cached, whereas a failed
      delete leaves you with a miss — and a miss is self-correcting.
    followUps:
      - "Why is deleting safer than updating?"
resources:
  - title: "Facebook — Scaling Memcache"
    url: https://www.usenix.org/system/files/conference/nsdi13/nsdi13-final170_update.pdf
---

## Four placements

```text
  browser cache         0ms        no network at all
    │                              Cache-Control, covered in the
    │                              HTTP track
  CDN edge              ~10ms      close to the user, shared
    │                              across users
  in-process cache      ~100ns     a hash lookup, no network;
    │                              per instance, so N copies
  shared cache (Redis)  ~1ms       one copy, consistent across
    │                              instances, a network hop
  database buffer pool  ~0.1ms     you already have it, and sizing
    │                              it is a real decision
  disk                  ~16μs-10ms

  Each layer that answers removes load from everything behind it,
  so the value of a cache is roughly proportional to how close it
  is to the user. A 90% CDN hit rate removes 90% of all downstream
  load; a 90% Redis hit rate removes 90% of database load only.
```

:::what
**Cache-aside** means the application checks the cache, and on a miss reads the store and
populates it. **Write-through** writes both synchronously. **Write-behind** writes the cache and
persists later. A **stampede** is many concurrent misses on the same key. **Coherence** is whether
separate caches agree.
:::

:::why
A cache is the highest-leverage optimisation available, because it does not make work faster — it
removes the work. Everything else in performance engineering is a constant factor; a cache changes
the number of operations.

That leverage is why caches get added early and why they cause so many incidents. Three specific
reasons.

First, a cache changes the *failure shape* of a system. A service running at 20% database
utilisation behind a 95% hit rate is running at 400% database utilisation if the cache empties. So
a cache is not merely an optimisation once the system depends on it — it is a load-bearing
component, and losing it is an outage rather than a slowdown. That transition happens silently,
the moment the hit rate becomes necessary rather than nice.

Second, invalidation is genuinely hard, and it is hard for a structural reason: the cache does not
know when the underlying data changed. Every strategy is a way of guessing — a TTL guesses a
timescale, an explicit delete guesses that you found every write path, a version in the key guesses
that you can compute the version cheaply.

Third, the anomalies are user-visible in a way that database staleness often is not. Two servers
with separate in-process caches will disagree, so a user refreshing a page sees two different
answers depending on which instance served them, which looks like the application being broken
rather than being stale.
:::

:::how
```text
  CACHE-ASIDE — the default, and why

    READ
      value = cache.get(key)
      if value is nil
        value = db.query(...)
        cache.set(key, value, ttl)
      return value

    WRITE
      db.update(...)
      cache.delete(key)          ← DELETE, not set

    Delete rather than update, because:
      - a failed update leaves a WRONG value cached, which persists
        until the TTL; a failed delete leaves a MISS, which
        self-corrects on the next read
      - two concurrent writes can interleave their cache updates so
        the cache ends up holding the older value, permanently
      - you often do not have the full new value at the write site,
        only the changed fields

  THE THREE STAMPEDE DEFENCES

    1. SINGLE FLIGHT / LOCK
         one request recomputes; the others wait for it
         + exactly one query
         − the waiters are blocked, and a crash mid-recompute needs
           a lock timeout

    2. STALE-WHILE-REVALIDATE
         serve the expired value immediately; one request refreshes
         in the background
         + nobody waits
         − one window of stale data per expiry

    3. JITTERED TTL
         ttl = base + random(0, base × 0.1)
         + trivial, no coordination
         − does not help a genuinely cold cache
         ← this is the one most often missing, because a deploy
           that warms 1000 keys gives them all the same expiry and
           they all expire in the same second

    Use jitter always. Add single-flight for expensive keys. Add
    stale-while-revalidate where staleness is acceptable.

  THE THREE WAYS A CACHE CAUSES AN OUTAGE

    a. STAMPEDE          popular key expires → N identical queries
    b. COLD START        cache restarts/flushes → 100% miss rate →
                         the database receives traffic it has never
                         seen and has never been sized for
    c. PENETRATION       requests for keys that do not exist are
                         never cached, so every one reaches the
                         database. An attacker requesting random
                         ids bypasses the cache entirely.
                         Fix: cache the negative result too, with a
                         short TTL.
```
:::

:::example
```ruby
# 1. Cache-aside with jitter and single-flight.
def fetch_user(id)
  key = "user:v2:#{id}"
  cached = redis.get(key)
  return JSON.parse(cached) if cached

  # Single-flight: one process computes, others poll briefly.
  lock_key = "#{key}:lock"
  if redis.set(lock_key, 1, nx: true, ex: 10)
    begin
      user = User.find(id).as_json
      redis.set(key, user.to_json, ex: 300 + rand(30))   # jitter
      user
    ensure
      redis.del(lock_key)
    end
  else
    sleep 0.05
    cached = redis.get(key)
    cached ? JSON.parse(cached) : User.find(id).as_json   # fall back
  end
end
# The `ex: 10` on the lock matters: without an expiry, a process
# that dies while holding it blocks every other reader until someone
# notices. The fallback to a direct query matters too — a cache
# problem should degrade to slow, never to broken.

# 2. Versioned keys — invalidation without deletion.
def cache_key_for(order)
  "order:#{order.id}:#{order.updated_at.to_i}"
end
# Changing the record changes the key, so the old entry is simply
# never read again and expires on its own. No invalidation step to
# get wrong, and no window where a stale value is served.
#
# Cost: the old entries occupy memory until they expire, so this
# trades memory for correctness. Usually the right trade, and it is
# the same "replace invalidation with naming" move as fingerprinted
# asset URLs.

# 3. Negative caching, against penetration.
def fetch_order(id)
  key = "order:#{id}"
  cached = redis.get(key)
  return nil if cached == "__nil__"             # a cached miss
  return JSON.parse(cached) if cached

  order = Order.find_by(id: id)
  redis.set(key, order ? order.to_json : "__nil__", ex: order ? 300 : 30)
  order
end
# Without the sentinel, requests for non-existent ids never populate
# the cache and so always reach the database — which an attacker can
# exploit with random ids, and which happens accidentally whenever a
# client has stale ids.
# The short TTL on the negative entry limits the window in which a
# newly created record appears absent.
```

```ruby
# 4. Degrading rather than failing when the cache is gone.
def cached_fetch(key, ttl: 300)
  redis.get(key)&.then { |v| return JSON.parse(v) }
  value = yield
  redis.set(key, value.to_json, ex: ttl)
  value
rescue Redis::BaseConnectionError => e
  Rails.logger.warn("cache unavailable: #{e.message}")
  yield                                          # slow, not broken
end
# A cache outage should raise latency and database load, not return
# errors. This is the single most valuable line of defensive code in
# a caching layer — and it is also the line that makes a cold-start
# thundering herd possible, so it belongs alongside a circuit
# breaker or a concurrency limit on the fallback path.
```
:::

:::failure
**Updating the cache on write instead of deleting.** Two concurrent writes can interleave so the
cache keeps the older value indefinitely:

```text
  T1: write A to db
  T2: write B to db
  T2: set cache = B
  T1: set cache = A        ← the cache now holds A, forever
```
Deleting has no such ordering problem: whoever deletes last leaves a miss, and the next read
repopulates from the database.

**Uniform TTLs.** A deploy that warms a thousand keys gives them all the same expiry, so they all
expire within the same second and the stampede arrives as a single spike. Always jitter.

**Treating a cache as optional once it is load-bearing.** A service at 20% database utilisation
behind a 95% hit rate needs 400% if the cache empties. Know your cold-cache capacity, because that
is what you have during an incident.

**No negative caching.** Requests for non-existent keys bypass the cache entirely, which an
attacker can exploit with random ids and which happens naturally with stale client data.

**A lock with no expiry.** A process that dies holding a single-flight lock blocks every reader
until a human intervenes.

**Caching derived data without caching its dependencies' versions.** A page cache keyed only on
the page id is stale when any of the twelve records it renders changes. Include the maximum
`updated_at` of everything the output depends on — which is the same point the schema lesson makes
about cache keys.

**Stale-while-revalidate where staleness is a correctness problem.** A permission check, a price,
a stock level. Serving the expired value is the entire mechanism, so it is wrong wherever that
matters.

**An unbounded in-process cache.** A memoisation hash on a long-lived object grows forever. Bound
it with an LRU, or use a TTL.

**Ignoring cache coherence between instances.** Eight application servers with in-process caches
will disagree after a write, so a user's refreshes alternate between answers. Either accept it
with a short TTL, or use a shared cache for anything a user can observe changing.

**Caching at the wrong granularity.** Caching one fully-rendered page means any change invalidates
all of it; caching twelve fragments means a change invalidates one. The cost is twelve lookups
instead of one, which is usually worth it.
:::

:::realworld
```text
// What to cache, by how much it is worth.
//
//   Highest value: expensive and rarely changing
//     - rendered HTML fragments
//     - aggregate counts and reports
//     - permission and role lookups
//     - feature flags and configuration
//     - third-party API responses (and these should ALSO be
//       cached stale-if-error, since you do not control their
//       uptime)
//
//   Lowest value: cheap or constantly changing
//     - a primary-key lookup on an indexed table, which is already
//       sub-millisecond and in the buffer pool
//     - anything written more often than read
//
//   The product to compute is (cost of computing) × (read rate) ÷
//   (change rate). Caching a 0.2ms query read ten times a day is
//   pure complexity.
```

```text
// Eviction policies, and when the default is wrong.
//
//   LRU          evict least recently used. The sensible default.
//   LFU          evict least frequently used. Better when a small
//                 set is hot and a long tail is scanned once —
//                 LRU would let the scan evict the hot set.
//   TTL only     no eviction, keys expire. Predictable memory only
//                 if you bound the key space.
//   random       surprisingly competitive, and cheap.
//
//   Redis's `maxmemory-policy` defaults to `noeviction`, which
//   means writes FAIL when memory is full rather than evicting.
//   That is correct for Redis-as-a-database and wrong for
//   Redis-as-a-cache, and it is the most common Redis
//   misconfiguration — a cache that starts returning errors
//   instead of making room.
```

```text
// The hit rate arithmetic, which is what justifies effort.
//
//   95% → 99% hit rate does not make things 4% faster. It removes
//   80% of the remaining misses: from 5 misses per 100 requests to
//   1. That is a five-fold reduction in database load.
//
//   99% → 99.9% removes 90% of what is left again.
//
//   So effort at a high hit rate has more leverage than it appears,
//   and the metric to track is miss RATE rather than hit rate —
//   because the miss rate is what the database sees, and halving a
//   small number is the thing that matters.
```
:::

:::mistakes
**Setting the cache on write instead of deleting.** Interleaving leaves a permanently wrong value.

**Uniform TTLs.** Synchronised expiry becomes a spike.

**No single-flight on expensive keys.**

**No negative caching.** Missing keys bypass the cache entirely.

**A lock with no expiry.** One dead process blocks everyone.

**A key that omits part of what the output depends on.**

**Stale-while-revalidate for prices, permissions or stock.**

**An unbounded in-process cache.** Bound it.

**Ignoring coherence between instances.** Users see alternating answers.

**`maxmemory-policy noeviction` on a cache.** Writes fail instead of evicting.

**Not knowing your cold-cache capacity.** That is the capacity you have during an incident.
:::

:::tradeoffs
**Browser cache** — zero cost, no network, and you cannot invalidate it. Only safe with
content-addressed URLs.

**CDN** — removes load from everything behind it and terminates TLS near the user; costs money and
an invalidation story.

**In-process cache** — nanoseconds, no network, no serialisation; N copies that disagree, and
memory per instance. Right for small, shared, slow-changing data.

**Shared cache (Redis)** — one coherent copy, invalidation in one place, survives a deploy; a
network hop, a new component to operate, and a single point of failure if you do not degrade.

**Cache-aside** — simple, only caches what is read, and the first read of each key is slow. The
default.

**Write-through** — never stale, and every write pays both costs plus a dependency on the cache's
availability for writes.

**Write-behind** — fastest writes, and acknowledged data can be lost. Rarely worth it outside
metrics and counters.

**Versioned keys** — invalidation becomes impossible to get wrong, at the cost of memory held by
superseded entries.

**TTL-only** — trivial, and staleness bounded only by the TTL. Fine for anything where a bounded
window is acceptable, which is more things than people expect.

The judgement that matters: **a cache is a capacity decision, not just a latency one.** Once the
hit rate is necessary, the cache is part of the critical path, so it needs the same treatment as
any other dependency — degradation, a known cold-start capacity, and a plan for the moment it is
empty.
:::

:::checkpoint
1. Order the cache placements by distance from the user, with rough latencies. Why does position
   matter so much?
2. Why delete rather than set on write? Give the interleaving that makes setting wrong.
3. Name the three stampede defences and the cost of each. Which is cheapest?
4. What is cache penetration, and what is the fix?
5. A service runs at 20% database utilisation behind a 95% hit rate. What happens if the cache
   empties?
6. Why is 95% → 99% hit rate a bigger win than it sounds?
7. What does `maxmemory-policy noeviction` do to a cache, and why is it the default?
8. Eight app servers with in-process caches. What does a user see after a write?
:::

:::interview
Lead with placement, because the ordering carries the main insight:

*"Four places, in increasing distance from the user: the browser, a CDN, an in-process cache, and a
shared cache like Redis — plus the database's buffer pool, which you already have. Position matters
disproportionately because each layer that answers a request removes load from everything behind
it. A 90% CDN hit rate removes 90% of all downstream load; a 90% Redis hit rate removes 90% of
database load only. The mistake I see most is reaching for Redis first — for small, shared,
slow-changing data like feature flags or a routing table, an in-process cache is a hash lookup at
nanoseconds with no network hop and is strictly better, at the cost of N copies that can disagree."*

Then cache-aside with the reason for deleting, which is a nice piece of reasoning:

*"I would default to cache-aside, and on a write I delete the key rather than updating it. Two
reasons. A failed update leaves a wrong value cached until the TTL, whereas a failed delete leaves
a miss, which self-corrects on the next read. And two concurrent writes can interleave their cache
updates so the cache ends up holding the older value permanently — delete has no such ordering
problem, because whoever deletes last leaves a miss."*

Then the stampede, with the defence people forget:

*"Three defences. Single-flight, so one request recomputes while the others wait. Stale-while-
revalidate, so nobody waits and one window of staleness is accepted. And jittered TTLs, which is
the cheapest and the one most often missing — a deploy that warms a thousand keys gives them all
the same expiry, so they all expire in the same second and the stampede arrives as one spike. I
would always jitter, add single-flight for expensive keys, and use stale-while-revalidate only
where staleness is not a correctness problem."*

And the framing that makes this a design discussion rather than an optimisation one:

*"The thing I would want stated explicitly is that a cache is a capacity decision, not just a
latency one. A service at 20% database utilisation behind a 95% hit rate needs 400% if the cache
empties — so once the hit rate is necessary, the cache is on the critical path and deserves the
same treatment as any dependency: degrade to slow rather than broken, know the cold-cache capacity,
and have a plan for the moment it is empty, because that is the capacity you have during an
incident."*
:::

## What you now know

- Four placements: browser, CDN, in-process, shared — plus the database buffer pool.
- Value is roughly proportional to closeness to the user, since each layer shields the rest.
- Cache-aside is the default: read through, delete on write.
- Delete rather than set, because a failed update leaves a wrong value and interleaving is
  permanent.
- Stampedes: use jittered TTLs always, single-flight for expensive keys, stale-while-revalidate
  where acceptable.
- Uniform TTLs from a warming deploy produce a synchronised expiry spike.
- Cache penetration is uncached misses for non-existent keys; cache the negative with a short TTL.
- Single-flight locks need an expiry, or one dead process blocks every reader.
- Versioned keys replace invalidation with naming, at the cost of memory.
- A cache key must include everything the output depends on.
- Degrade to slow rather than failing when the cache is unreachable.
- Once the hit rate is necessary, the cache is load-bearing — know your cold-cache capacity.
- Track miss rate, not hit rate: 95% → 99% removes 80% of the remaining database load.
- `maxmemory-policy noeviction` is Redis's default and makes a full cache return errors.
- In-process caches on N servers disagree; use a shared cache for anything users watch change.
- Cache fragments rather than whole pages so one change invalidates one fragment.
