---
title: The N+1 query problem
summary: The most common Rails performance bug. Why the ORM causes it, how to see it, and the four ways to fix it.
level: intermediate
minutes: 16
version: "8.0"
status: stable
last_reviewed: "2026-10-07"
tags: [rails, activerecord, performance, n-plus-one]
concepts: [n-plus-one, eager-loading, lazy-loading, activerecord]
prerequisites: [joins, select]
interview:
  - question: What is an N+1 query and why does an ORM encourage it?
    level: intermediate
    answer: >-
      One query to fetch N records, then one more per record to fetch an association — N+1
      total. The ORM encourages it because `order.user.name` looks like a field access and
      is actually a database round trip. The code gives no visual signal that a loop over
      100 orders issues 101 queries, and in development with ten rows it is imperceptible.
      The fix is to tell Active Record what you will need: `includes`, `preload` or
      `eager_load`.
    followUps:
      - "What is the difference between includes, preload and eager_load?"
      - "Why is N+1 worse than one query that does N times the work?"
  - question: Why is N+1 so much worse than the row count suggests?
    level: advanced
    answer: >-
      Because the cost is per *query*, not per row. Each query pays connection
      acquisition, SQL parsing, planning, a network round trip, and object instantiation.
      At even 1ms of round-trip latency, 500 queries is half a second of almost pure
      waiting — and that latency is invisible in development against a local database and
      brutal against a database in another availability zone. One query returning 500 rows
      pays that overhead once.
resources:
  - title: "Rails Guides — Eager Loading Associations"
    url: https://guides.rubyonrails.org/active_record_querying.html#eager-loading-associations
---

## The bug that looks like nothing

```erb
<%# app/views/orders/index.html.erb %>
<% @orders.each do |order| %>
  <tr>
    <td><%= order.id %></td>
    <td><%= order.user.name %></td>      <%# ← this line is a database query %>
    <td><%= order.items.count %></td>    <%# ← so is this one %>
  </tr>
<% end %>
```

```ruby
# app/controllers/orders_controller.rb
def index
  @orders = Order.limit(100)
end
```

That page issues **201 queries**. The code contains no loop over queries, no `find`, and
nothing that looks expensive.

:::problem
An ORM's central promise is that database rows look like ordinary objects. `order.user` has
the same syntax as `order.total`, so it reads as a field access.

But `order.total` is a value already in memory and `order.user` is a `SELECT`. The
abstraction hides the one distinction that matters for performance, and nothing in the code
marks the boundary.

Then development makes it invisible: ten seed orders against a local Postgres is 21 queries
in 8 milliseconds. Production has 100 orders and 2ms of network latency to the database,
and the same page takes 1.6 seconds.
:::

:::what
An **N+1 query** is one query to load a collection, plus one query per element to load an
association. **Lazy loading** is the behaviour that causes it: the association is fetched
when first accessed. **Eager loading** is the fix: declare what you need up front.
:::

:::how
```text
  LAZY (the default)                    EAGER (includes)

  SELECT * FROM orders LIMIT 100        SELECT * FROM orders LIMIT 100
    ↓ then, per order:                  SELECT * FROM users
  SELECT * FROM users WHERE id = 1        WHERE id IN (1,2,3,...,100)
  SELECT * FROM users WHERE id = 2
  SELECT * FROM users WHERE id = 3      2 queries, total.
  ... 100 times

  101 queries. Each one pays:
    connection checkout
    SQL parse + plan
    network round trip     ← dominates
    result instantiation
```

The overhead is the point. At 2ms round-trip latency:

| | Queries | Latency cost |
|---|---|---|
| N+1 over 100 orders | 101 | ~202 ms of waiting |
| N+1 over 500 orders | 501 | ~1 second |
| Eager loaded | 2 | ~4 ms |

The database itself is barely working in either case. Almost all of the N+1 cost is time
spent waiting, which is why it scales with *network distance* as much as with data size —
and why moving a database to another availability zone has turned acceptable pages into
timeouts in a single deploy.
:::

:::why
It is worth being precise about why this is the most-cited Rails performance problem rather
than just a common one.

Every other performance bug scales with your data. This one scales with the *distance to
your database*, which is a deployment decision made by someone else, possibly after you
wrote the code. The same page can be acceptable on a laptop, fine in a single-AZ staging
environment, and a timeout in production — with no code change and no data change.

That is why the fix has to be a declaration rather than an optimisation you apply when
something gets slow: by the time it is slow, the cause is in a view three layers from the
query.
:::

## Seeing it

```ruby
# 1. The log. Repeated identical queries with different ids is the signature.
#    Order Load (0.3ms)  SELECT "orders".* FROM "orders" LIMIT 100
#    User Load (0.2ms)   SELECT "users".* FROM "users" WHERE "users"."id" = 1 LIMIT 1
#    User Load (0.2ms)   SELECT "users".* FROM "users" WHERE "users"."id" = 2 LIMIT 1
#    ...

# 2. Strict loading — turn lazy loads into exceptions. The best option.
class Order < ApplicationRecord
  self.strict_loading_by_default = true
end
# Now order.user raises ActiveRecord::StrictLoadingViolationError
# unless it was eager loaded. The bug becomes impossible to ship.

# Per-query, when you do not want it globally:
Order.strict_loading.limit(100)

# 3. Application-wide, in config, reported rather than raised:
config.active_record.action_on_strict_loading_violation = :log

# 4. The bullet gem, which detects both N+1 and unnecessary eager loading.
```

:::realworld
`strict_loading` is the single most valuable thing in this lesson. Added in Rails 6.1, it
converts N+1 from "a performance bug you discover in production" into "a test failure".

```ruby
# A sensible adoption path for an existing codebase:

# 1. Start by logging, not raising, so you can see the scale of it.
config.active_record.action_on_strict_loading_violation = :log

# 2. Enable it per model as you fix each one.
class Order < ApplicationRecord
  self.strict_loading_by_default = true
end

# 3. Raise in test and development; log in production.
config.active_record.action_on_strict_loading_violation =
  Rails.env.production? ? :log : :raise
```

That last line matters: raising in production would turn a slow page into a 500, which is
worse. Raise where it is cheap to find out, log where it is not.
:::

## The four fixes

```ruby
# 1. includes — Rails chooses the strategy
Order.includes(:user).limit(100)
#    → two queries (preload), or one LEFT JOIN (eager_load) if you
#      reference the association in a where/order clause

# 2. preload — always separate queries
Order.preload(:user).limit(100)
#    SELECT * FROM orders LIMIT 100
#    SELECT * FROM users WHERE id IN (...)

# 3. eager_load — always one LEFT OUTER JOIN
Order.eager_load(:user).limit(100)
#    SELECT orders.*, users.* FROM orders
#      LEFT OUTER JOIN users ON users.id = orders.user_id LIMIT 100

# 4. joins — for filtering only. Does NOT load the association.
Order.joins(:user).where(users: { country: "IN" })
#    order.user here is still an N+1. joins filters; it does not preload.
```

:::how
Choosing between them:

| | Queries | Can filter on the association? | Good when |
|---|---|---|---|
| `preload` | 2 | No | Default. Clean, and the second query is indexed by id |
| `eager_load` | 1 | Yes | You need `WHERE` or `ORDER BY` on the association |
| `includes` | either | Yes (switches to join) | You do not want to think about it |
| `joins` | 1 | Yes | Filtering only — you will not read the association |

`includes` is the usual advice and has a trap: it silently switches to a join when it
detects a reference to the association, and a join against a `has_many` multiplies rows.

```ruby
# This looks fine and loads 100 orders × their items as a cartesian-ish result set:
Order.includes(:items).where(items: { status: "shipped" }).limit(100)
# Rails switches to eager_load → LEFT JOIN → the LIMIT applies to JOINED rows,
# so you get fewer than 100 orders. A classic surprise.

# Be explicit about what you meant:
Order.eager_load(:items).where(items: { status: "shipped" })   # intentional join
Order.preload(:items).where(id: shipped_order_ids)             # two clean queries
```
:::

## Nested and counted

```ruby
# Nested associations
Order.includes(user: :company, items: [:product, :warehouse])

# counter_cache — when you only ever need the number
class Item < ApplicationRecord
  belongs_to :order, counter_cache: true   # maintains orders.items_count
end
Order.limit(100).each { |o| o.items.size }   # no queries; reads the column

# size vs count vs length — three different behaviours
order.items.count    # always SELECT COUNT(*) — a query every time
order.items.length   # loads all records into memory, then counts them
order.items.size     # uses counter_cache if present, else loaded array, else COUNT

# `size` is almost always the right one.
```

:::mistakes
**Using `count` in a view.** `order.items.count` issues a `COUNT(*)` on every call, so
calling it twice in one template is two queries. `size` reuses what is loaded.

**Eager loading something you do not use.** The opposite bug, and it is real:

```ruby
# Loads every item for 100 orders to display a count.
Order.includes(:items).limit(100)
# Better: a counter_cache column, or a grouped count:
Item.where(order_id: ids).group(:order_id).count
```

Bullet reports these as "unused eager loading", and they can be slower than the N+1 they
replaced — loading 50,000 item rows to show 100 numbers.

**`includes` with a `limit` and a `has_many`.** Shown above. The limit applies after the
join, so you get the wrong number of parent records.

**N+1 inside a serializer or a decorator.** The query is a long way from the controller
that could have fixed it, which makes it hard to find. This is the most common place
production N+1 hides.

**Pluck when you need objects, objects when you need columns:**

```ruby
Order.limit(100).map(&:total).sum   # loads 100 full objects to add a column
Order.limit(100).sum(:total)        # one SELECT SUM — no objects at all
Order.pluck(:id, :total)            # arrays, not objects — much cheaper
```
:::

:::failure
**N+1 that only appears for some users.** A page is fine for a user with 3 orders and times
out for the one with 4,000. Nothing in the code distinguishes them, and the bug report says
"the dashboard is slow" with no reproduction.

```ruby
# This is why pagination is a correctness concern, not just a UX one:
@orders = current_user.orders.includes(:items).page(params[:page]).per(25)
```

**N+1 in a background job that processes everything.** The request-level version is a slow
page; the job version is a job that takes four hours and holds a database connection the
whole time, exhausting the pool for everything else.

```ruby
# Wrong: loads every order into memory, N+1 per order.
Order.all.each { |o| process(o.user) }

# Right: batched, eager loaded.
Order.includes(:user).find_each(batch_size: 500) { |o| process(o.user) }
```

`find_each` is the other half of this lesson: `Order.all.each` loads every row into memory
at once, which on a large table is an out-of-memory kill rather than a slow query.
:::

:::internals
**Why Rails cannot fix this automatically.** The obvious question is why the ORM does not
just notice the loop and batch the queries.

It cannot, because it does not know the loop exists. By the time `order.user` is called, the
collection has already been fetched and iterated; Active Record sees a sequence of
independent association reads with no information that more are coming.

Some ORMs do solve it. GraphQL implementations use a **dataloader**: association reads are
collected within a tick of the event loop and resolved in one batched query. That requires
the framework to control the evaluation schedule, which Rails' synchronous request model
does not.

This is why the fix must be a declaration — `includes` — rather than an optimisation. You
are supplying the information the ORM cannot derive.

```ruby
# What Rails actually does for preload:
#   1. Load the parent records.
#   2. Collect the foreign keys: [1, 2, 3, ...]
#   3. One query: WHERE id IN (...)
#   4. Build a hash keyed by id and attach each child to its parent in memory.
#
# Note step 3 has a practical limit: Postgres handles tens of thousands of
# IN values, but a 100,000-element IN list is its own problem. This is one
# reason batching matters even with eager loading.
```
:::

:::tradeoffs
**Lazy loading by default.** You never load data you do not use, and the association API is
simple — no declaration required for a one-off access. For a page showing one order, lazy is
exactly right.

The cost is that the default is wrong for every collection, and the failure is invisible in
development.

**Eager loading.** Predictable query count. The cost is loading data you might not use, and
on a `has_many` join, potentially a great deal of it.

**The real trade is where you put the knowledge.** The controller knows what the view will
need, but the view is where the access happens — so the two are separated by exactly the
distance that makes this bug easy to introduce and hard to find. GraphQL's dataloader pattern
and `strict_loading` are two different answers to the same structural problem: one makes the
framework figure it out, the other makes forgetting an error.

For a Rails codebase, `strict_loading_by_default` is the answer worth adopting, because it
moves the discovery from production to the test suite.
:::

:::checkpoint
This page is slow. Find all the N+1s and fix each:

```erb
<% @posts.each do |post| %>
  <h2><%= post.title %></h2>
  <p>by <%= post.author.name %> at <%= post.author.company.name %></p>
  <p><%= post.comments.count %> comments</p>
  <% post.tags.each do |tag| %><span><%= tag.name %></span><% end %>
  <% if post.comments.any? %><p>Latest: <%= post.comments.last.body %></p><% end %>
<% end %>
```

Then: one of those lines is an N+1 that `includes` will *not* fix as written. Which, and
why?
:::

:::interview
N+1 is close to guaranteed in a Rails interview, and almost everyone can define it. The
depth shows up in three follow-ups.

**Why the ORM causes it:** *"because `order.user` is syntactically a field access and
semantically a query. The abstraction hides the only distinction that matters here, and
development with ten rows and no network latency hides the consequence."*

**Why it is worse than it looks:** *"the cost is per query, not per row — connection
checkout, parse, plan, round trip. At 2ms latency 500 queries is a second of pure waiting,
and the database is barely working. Which is why it gets dramatically worse when the
database moves to another availability zone, with no code change."*

**The fix, with the distinction:** *"`preload` for two clean queries, `eager_load` when I
need to filter on the association, `joins` when I am only filtering and will not read it. I
avoid relying on `includes` with a limit on a `has_many`, because it switches to a join and
the limit then applies to joined rows."*

Then the answer that ends the topic well: *"but mostly I turn on `strict_loading_by_default`,
so a lazy load raises in test. It converts this from a production discovery into a test
failure."*
:::

## What you now know

- N+1 is one query per record for an association, caused by lazy loading looking like
  field access.
- The cost is per query — round trips dominate — so it scales with network latency, not
  just data size.
- `preload` = two queries. `eager_load` = one LEFT JOIN. `includes` = Rails decides.
  `joins` = filter only, no loading.
- `includes` + `limit` on a `has_many` silently becomes a join, and the limit applies to
  joined rows.
- `size` over `count` in views; `counter_cache` when you only need the number.
- Unnecessary eager loading is a real bug and can be slower than the N+1.
- `find_each` for batches; `Order.all.each` loads everything into memory.
- `strict_loading_by_default` makes N+1 a test failure instead of a production incident.
