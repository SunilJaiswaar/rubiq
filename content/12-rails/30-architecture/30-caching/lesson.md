---
title: Caching
summary: Where to cache, how to invalidate without thinking about invalidation, and the stampede that takes a site down at the worst moment.
level: advanced
minutes: 14
version: "8.0"
status: stable
last_reviewed: "2026-10-07"
tags: [rails, caching, performance, redis]
concepts: [caching, cache-invalidation, cache-stampede, russian-doll-caching]
prerequisites: [activerecord, n-plus-one]
interview:
  - question: What is cache invalidation and why is it hard?
    level: advanced
    answer: >-
      Deciding when cached data is no longer correct. It is hard because the cache has no
      way to know what the data depended on — you have to express that relationship by
      hand, and every place that writes the data must know every cache that derived from
      it. The approach that avoids most of the difficulty is key-based expiration: build
      the dependency into the cache key, usually from an updated-at timestamp, so a change
      produces a different key and the old entry simply becomes unreachable. You never
      delete anything; you stop asking for it.
    followUps:
      - "So what happens to all the stale entries?"
      - "What is a cache stampede and how do you prevent it?"
  - question: What is a cache stampede?
    level: advanced
    answer: >-
      A popular cache entry expires and every concurrent request misses simultaneously, so
      all of them run the expensive computation at once. The database gets hit by a
      thousand identical queries at the exact moment it was being protected from them,
      which often takes it down — and then nothing can repopulate the cache. It is worst
      for the most popular keys, which is to say at the worst possible time. The fix is to
      let only one request regenerate while the others serve stale, which is what
      `race_condition_ttl` does.
resources:
  - title: "Rails Guides — Caching with Rails"
    url: https://guides.rubyonrails.org/caching_with_rails.html
---

## Where you can cache

```text
  Browser cache          Cache-Control headers        no request at all
       │
  CDN                    edge cache                   no origin request
       │
  HTTP cache             ETag / Last-Modified         304, no body
       │
  Fragment cache         rendered HTML                no render
       │
  Query cache            SQL results                  no query
       │
  Database              buffer pool                   no disk read
```

Each layer avoids everything below it. The highest layer you can correctly use is always
the best one, which is why `Cache-Control` on a static asset beats any amount of
application caching.

:::problem
Caching trades correctness for speed, and the exchange rate is set by how long you are
willing to serve stale data. That is a product decision disguised as a technical one.

The technical difficulty is narrower and sharper: **the cache does not know what the data
depended on.** If you cache a rendered order summary, nothing connects that entry to the
order, its items, the user's currency setting or the tax rate. So every writer must know
every derived cache, which is a coupling that does not survive a growing codebase.
:::

:::what
**Caching** stores the result of expensive work under a key. **Invalidation** is deciding
when a stored result is no longer correct.
:::

## The low-level API

```ruby
Rails.cache.write("key", value, expires_in: 1.hour)
Rails.cache.read("key")
Rails.cache.fetch("key", expires_in: 1.hour) { expensive_thing }
Rails.cache.delete("key")
Rails.cache.fetch_multi("a", "b", "c") { |k| compute(k) }   # one round trip
```

`fetch` with a block is the one to use: read, and on a miss compute and write.

```ruby
# A typical use: an expensive aggregate.
def monthly_revenue
  Rails.cache.fetch("revenue/#{Date.current.strftime('%Y-%m')}", expires_in: 1.hour) do
    Order.where(created_at: Date.current.all_month).sum(:total)
  end
end
```

## Key-based expiration

:::why
The insight that makes caching tractable in Rails: **do not invalidate, change the key.**

```ruby
# The cache key includes the record's updated_at:
cache order do
  render order
end
# → key: "views/orders/42-20261007143022000000/abc123..."
#                       ↑ id   ↑ updated_at        ↑ template digest
```

When the order is saved, `updated_at` changes, so the key changes, so the next render is a
miss and recomputes. The old entry is never deleted — it becomes unreachable and is
eventually evicted by the store's LRU policy.

This is a genuinely good trade. You have replaced "every writer must know every derived
cache" — which cannot be maintained — with "the key encodes what it depended on", which is
local and automatic. The cost is wasted memory on entries nobody will ask for again, and
memory is cheap.

The template digest in the key matters too: edit the template and every key changes, so you
cannot ship a template change and serve HTML rendered by the old one.
:::

## Russian doll caching

```erb
<%# Nested, so an inner change does not invalidate the outer shell's siblings %>
<% cache @order do %>
  <h1>Order <%= @order.reference %></h1>
  <% @order.items.each do |item| %>
    <% cache item do %>
      <%= render item %>
    <% end %>
  <% end %>
<% end %>
```

:::how
```text
  One item changes:

    cache(@order)       ← key changes IF the order is touched
      cache(item_1)     ← unchanged, served from cache
      cache(item_2)     ← CHANGED, re-rendered
      cache(item_3)     ← unchanged, served from cache

  So re-rendering the outer block costs three cache reads and one render,
  not three renders.

  For the outer key to change at all, the order must be touched:

    class Item < ApplicationRecord
      belongs_to :order, touch: true      ← updates order.updated_at
    end
```

Without `touch: true` the outer cache is stale: the item changed, the order's `updated_at`
did not, so the outer key is the same and the cached HTML — containing the old item — is
served. `touch: true` is what makes nesting correct, and forgetting it is the most common
Russian-doll bug.

The cost of `touch: true` is an extra UPDATE on every item save, and contention on the
parent row if items change frequently.
:::

## Cache stampede

:::failure
```text
  A key with 1,000 requests/second expires at t=0.

  t=0.000   request 1 misses → starts a 2-second query
  t=0.001   request 2 misses → starts the same 2-second query
  t=0.002   request 3 misses → ...
  ...
  t=2.000   2,000 identical queries have been issued

  The database is saturated. Queries slow down. More requests pile up.
  Nothing completes, so nothing writes the cache. The site is down —
  and it is down specifically because the cache was working.
```

This is worst for your most popular keys, which means it happens at peak traffic.

```ruby
# The fix: one request regenerates, the rest serve the stale value briefly.
Rails.cache.fetch("expensive", expires_in: 1.hour, race_condition_ttl: 10.seconds) do
  expensive_computation
end
```

`race_condition_ttl` works by keeping the expired entry for an extra window and letting the
first requester extend its life while it recomputes. Concurrent requests during those
seconds get slightly stale data instead of all hitting the database.

Two other mitigations worth knowing:

```ruby
# 1. Jitter the expiry, so a batch of keys written together do not all expire together.
expires_in: 1.hour + rand(5.minutes)

# 2. Refresh ahead of expiry in a job, so the cache is never cold for user traffic.
class WarmRevenueCacheJob < ApplicationJob
  def perform
    Rails.cache.write("revenue", compute_revenue, expires_in: 2.hours)
  end
end
# Scheduled every hour — the entry never expires under load.
```

That third approach — **write-through from a scheduled job rather than read-through from a
request** — removes the stampede entirely for a small number of very hot keys, and is worth
it for dashboard aggregates.
:::

:::mistakes
**Caching with a key that does not include everything the output depends on.**

```ruby
# Wrong: the same key for every user.
Rails.cache.fetch("dashboard") { render_dashboard(current_user) }
# One user's dashboard is served to everyone. A data leak, not just a bug.

# Right:
Rails.cache.fetch(["dashboard", current_user.id, current_user.updated_at]) { ... }
```

This is the most dangerous caching mistake because the symptom is showing one customer
another customer's data. Any cache key for personalised content must include the user.

**Caching inside a loop with per-item round trips.** `fetch` in a loop over 100 items is 100
Redis round trips. `fetch_multi` is one.

**Caching a query that is already fast.** A primary-key lookup against a warm buffer pool is
sub-millisecond. A Redis round trip is also sub-millisecond, plus serialisation. Caching it
adds a dependency and an invalidation problem for no gain.

**Forgetting that `Rails.cache` in development is a null store by default.** Caching code
appears to work and caches nothing, so you discover the invalidation bugs in production.
`bin/rails dev:cache` toggles it.

**Unbounded cache keys.** Caching per query-string combination means an attacker can fill
your cache with junk by varying a parameter, evicting everything useful.

**Stale-after-write within a request.** Writing a record and then reading a cache populated
earlier in the same request serves the old value. Worth watching in a controller that
updates and then renders.
:::

:::realworld
```ruby
# 1. HTTP caching — the cheapest, because the body is never generated.
def show
  @order = current_user.orders.find(params[:id])
  fresh_when(@order)            # sets ETag and Last-Modified
  # An unchanged order → 304 Not Modified, no body, no render.
end

# For public content a CDN can serve:
def index
  @posts = Post.published
  expires_in 5.minutes, public: true
  fresh_when(@posts.maximum(:updated_at))
end

# 2. Counter caches instead of caching counts — a column beats a cache entry.
belongs_to :order, counter_cache: true

# 3. A cached aggregate, keyed on something that changes when the data does.
def self.leaderboard
  Rails.cache.fetch(["leaderboard", Score.maximum(:updated_at)], expires_in: 10.minutes) do
    Score.order(points: :desc).limit(10).to_a
  end
end
# The MAX(updated_at) query is indexed and cheap; it replaces manual invalidation.

# 4. Rails 8 defaults: Solid Cache, backed by the database rather than Redis.
#    Slower per read than Redis and enormously larger, so entries live for weeks
#    rather than minutes — which changes the trade: more hits, less recomputation,
#    and one fewer service to operate.
```

That last point is a genuine shift. Redis caching is constrained by memory cost, so TTLs are
short and hit rates are moderate. A disk-backed cache can hold months of entries, so the hit
rate climbs and the stampede risk falls — at the cost of a slower individual read. For most
applications that is the better trade, which is why Rails 8 changed the default.
:::

:::tradeoffs
**Caching** converts repeated expensive work into a single computation plus cheap reads. At
the HTTP layer it eliminates the work entirely.

The costs, in order of how often they actually bite:

- **Staleness is now a product decision** you have to make explicitly and keep making.
- **A cache key is a contract.** Miss a dependency and you serve wrong data — and if you
  miss the user, you serve someone else's data.
- **Another system to operate**: memory limits, eviction, a cold start after a deploy.
- **Debugging gets harder.** "Works for me" often means "my cache entry is different".

**Not caching** keeps everything correct by construction and makes the system slower and
more expensive.

The order worth following: **make it fast first, then cache.** An N+1 that becomes two
queries needs no cache. A missing index that takes a query from 900ms to 2ms needs no cache.
Caching a slow query hides the slowness rather than removing it, and you still pay it on
every miss, every deploy, and every stampede. Caching is the last optimisation, not the
first.
:::

:::checkpoint
For each, choose a layer and a key — or say it should not be cached:

1. A public blog post page.
2. A logged-in user's dashboard showing their own orders.
3. Total revenue this month, shown on an admin page refreshed constantly.
4. A user's avatar image.
5. `Order.find(params[:id])` on a well-indexed table.

Then: number 3 is the stampede candidate. What would you do, and what would you do instead
of caching at all?
:::

:::interview
Caching questions separate people who have cached from people who have debugged a cache.

On invalidation, lead with why it is hard and then with the escape: *"hard because the cache
has no idea what the data depended on, so every writer would need to know every derived
entry — which does not survive a growing codebase. Rails' answer is key-based expiration:
put `updated_at` in the key, so a change produces a different key and the old entry just
becomes unreachable. You never invalidate; you stop asking. The cost is wasted memory, which
is cheap."*

On stampedes, the detail that matters is *when* it happens: *"the entry expires and every
concurrent request misses at once, so a thousand identical expensive queries hit the database
at the exact moment the cache was protecting it. It takes the database down, and then nothing
can repopulate the cache. And it is worst for your most popular keys, which means it happens
at peak. `race_condition_ttl` lets one request regenerate while the rest serve stale; jitter
stops a batch of keys expiring together; and for a few very hot keys I would write them from a
scheduled job instead, so they are never cold for user traffic."*

Then the judgement: *"but I would make it fast before caching it. An N+1 or a missing index
should be fixed, not cached — caching a slow query means you still pay for it on every miss
and every deploy."*
:::

## What you now know

- Cache at the highest layer you correctly can; HTTP caching avoids generating the response
  at all.
- Key-based expiration replaces invalidation: encode the dependency in the key and old
  entries become unreachable.
- The key is a contract. A personalised cache key must include the user, or you leak data.
- `touch: true` is what makes Russian-doll caching correct; without it the outer shell is
  stale.
- A stampede hits your most popular keys at peak. `race_condition_ttl`, jitter, or
  write-through from a job.
- `fetch_multi` for collections; one round trip instead of N.
- Development caching is off by default, so invalidation bugs surface in production.
- Make it fast before caching it. Caching a slow query hides the problem and you still pay
  on every miss.
