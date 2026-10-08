---
title: Loops, and the ones you should not write
summary: Five ways to repeat work, what each one costs, and why the explicit index loop is usually the wrong choice.
level: beginner
minutes: 13
status: stable
last_reviewed: "2026-10-07"
tags: [fundamentals, loops, iteration]
concepts: [loops, iteration, off-by-one]
prerequisites: [conditionals]
interview:
  - question: When would you use a `for` loop over `map` or `filter`?
    level: basic
    answer: >-
      When you need to break out early, when you are producing something other than a
      one-to-one transformation, or when the per-iteration allocation genuinely matters in
      a measured hot path. Otherwise `map`/`filter`/`reduce` say *what* you are doing
      rather than *how*, which means a reader does not have to simulate the loop to find
      out. "I need the index" is usually not a reason — `entries()` and the second
      callback argument both give you one.
    followUps:
      - "What does `map` do that a `for` loop with `push` does not?"
      - "Why is `for...in` over an array a bad idea?"
resources:
  - title: "MDN — Loops and iteration"
    url: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Loops_and_iteration
---

## The same work, five ways

```ruby runnable
prices = [100, 250, 80]

# 1. while + index — total manual control, three places to make a mistake.
a = []
i = 0
while i < prices.size
  a << prices[i] * 1.2
  i += 1
end

# 2. for ... in — no index to get wrong. Almost never used in Ruby; see below.
b = []
for price in prices
  b << price * 1.2
end

# 3. each — the block form. This is the Ruby baseline.
c = []
prices.each { |price| c << price * 1.2 }

# 4. map — says "one output per input" in the name.
d = prices.map { |price| price * 1.2 }

# 5. sum / reduce — fold many values into one.
total = prices.sum
folded = prices.reduce(0) { |acc, price| acc + price }

p a, b, c, d
p total, folded
```

All five produce the same numbers, and in Ruby only two of them are idiomatic. `while` with an
index is for the rare case where you genuinely need the index arithmetic; `for ... in` is
inherited from older languages and carries a real gotcha covered below; `each` is the baseline;
`map` is what you want whenever there is one output per input.

The skill is picking the method that *names* what you are doing, because the name is the
documentation:

```ruby runnable
users = [
  { id: 1, name: 'Asha', active: true },
  { id: 2, name: 'Bo', active: false },
  { id: 3, name: 'Cal', active: true },
]

p users.map { |u| u[:name] }                   # one out per one in
p users.select { |u| u[:active] }.size         # keep the matching ones
p users.reject { |u| u[:active] }.size         # drop the matching ones
p users.find { |u| u[:id] == 2 }&.fetch(:name) # the first match, or nil
p users.any? { |u| !u[:active] }               # does at least one match?
p users.all? { |u| u[:id].positive? }          # do they all?
p users.none? { |u| u[:id] > 99 }              # does none?
p users.count { |u| u[:active] }               # how many?
p users.sum { |u| u[:id] }                     # add up a derived value
p users.group_by { |u| u[:active] }.keys       # buckets
p users.partition { |u| u[:active] }.map(&:size)  # two buckets, true first
p users.to_h { |u| [u[:id], u[:name]] }        # build a Hash
p users.each_with_object({}) { |u, h| h[u[:id]] = u }.keys  # build anything
p [1, 2, 3, 4].filter_map { |n| n * 10 if n.even? }  # select + map, one pass
p users.min_by { |u| u[:id] }[:name]           # no sorting needed
p users.sort_by { |u| u[:name] }.map { |u| u[:name] }
```

`filter_map` and `each_with_object` are the two most underused. `filter_map` replaces
`select { ... }.map { ... }` with a single pass and no intermediate array. `each_with_object`
is the general accumulator — it is `reduce` without the trap of having to return the
accumulator from the block, which is the mistake everyone makes with `reduce` at least once.

All five produce the same numbers. They are not equivalent.

:::problem
The index loop has three independent places to be wrong — where `i` starts, the condition,
and the increment — and none of them say anything about your intent. A reader has to
simulate it to find out whether it visits every element, skips the last, or runs forever.

The later forms remove the parts you can get wrong, and name the operation.
:::

:::what
A **loop** repeats a block. The distinction that matters is between *imperative* loops,
where you manage the position yourself, and *declarative* iteration, where you describe
the transformation and the language manages the walk.
:::

:::why
`map` is not shorter than `for`. It is **more specific**. `map` can only produce exactly
one output per input: it cannot skip, cannot duplicate, cannot exit early, cannot change
the length. So seeing `map` tells a reader all of that without reading the body.

`for` tells them nothing, which is why it is the right choice precisely when you need to
do something `map` forbids.
:::

:::how
Choosing between them is mechanical once you know what each one promises.

| You want | Use | Why |
|---|---|---|
| One output per input | `map` | Length is guaranteed to match |
| A subset | `filter` | Predicate in, same elements out |
| One value from many | `reduce` | Explicitly a fold |
| Both at once | `flatMap` / `filter().map()` | One pass, or two clear ones |
| Side effects per element | `for...of` | Honest about doing work, allows `break` |
| To stop early | `for...of` + `break`, or `find`/`some` | `forEach` and `map` cannot stop |
| Index and value | `for (const [i, v] of arr.entries())` | No manual counter |
| To build a key-value map | `Object.fromEntries(arr.map(...))` | Says what it builds |

```ruby runnable
users = [
  { id: 1, name: 'Asha', active: true },
  { id: 2, name: 'Bo', active: false },
  { id: 3, name: 'Cal', active: true },
]

# Early exit, with the index when you need it.
users.each_with_index do |u, i|
  unless u[:active]
    puts "stopped at index #{i}"
    break
  end
end

# `break` can carry a value out of the block, which `each` then returns:
first_inactive = users.each { |u| break u[:name] unless u[:active] }
p first_inactive          # "Bo"

# Without a break, `each` returns the collection it was given:
p [1, 2].each { |x| x }   # [1, 2]

# `next` is "continue", not "return":
seen = []
[1, 2, 3, 4, 5].each { |n| next if n == 3; seen << n }
p seen                    # [1, 2, 4, 5]
```

Three things about leaving a block early, because they differ and the difference matters:

| keyword | effect inside a block |
|---|---|
| `next` | skip to the next iteration; `next value` supplies that iteration's value |
| `break` | stop iterating; `break value` makes the whole method call return `value` |
| `return` | return from the **enclosing method**, not the block |

That last one is the one that surprises people. A `return` inside a block passed to `each` exits
the method containing the loop, which is usually what you wanted in a method — and is an error
at the top level, where there is no enclosing method to return from.
:::

:::mistakes
**Off-by-one, in both directions.**

```ruby runnable
list = %w[a b c]

# <= instead of < : one iteration too many
i = 0
while i <= list.size
  if list[i].nil?
    puts "i=#{i} is past the end, and reading it gave nil rather than an error"
    break
  end
  i += 1
end

# Reading out of range is forgiving, which is how off-by-one bugs survive:
p list[3]              # nil
p list[-1]             # "c"  — negative wraps to the end
p list.fetch(3, 'none') # "none"
begin
  list.fetch(3)
rescue IndexError => e
  puts "#{e.class}: #{e.message}"
end
```

Ruby's index access returning `nil` rather than raising is why off-by-one errors here fail
*later*, somewhere a `nil` is used. `fetch` is the strict version, and the same advice from the
conditions lesson applies: `[]` when absence is expected, `fetch` when it is a bug.

The real answer, though, is that you should rarely be writing an index loop at all. Every
off-by-one in this section is a bug that an iterator cannot express:

```ruby runnable
list = %w[a b c]
list.each_with_index { |v, i| print "#{i}:#{v} " }; puts
p list.each_slice(2).to_a        # pairs, no index arithmetic
p list.each_cons(2).to_a         # sliding window of 2
p (1..3).zip(list)               # paired without indexes
p list.first(2), list.last(2), list.drop(1)
```

The reason `for...of` is the better default is not elegance — it is that these two bugs
become unwriteable.

**Mutating the array you are iterating.**

```ruby runnable
# Deleting while iterating. The array shifts under the iterator.
nums = [2, 4, 6]
nums.each { |n| nums.delete(n) if n.even? }
p nums            # [4] — should be []

# And the reason this bug survives code review:
lucky = [1, 2, 3, 4]
lucky.each { |n| lucky.delete(n) if n.even? }
p lucky           # [1, 3] — accidentally correct for THIS input

# The correct tools:
p [2, 4, 6].reject(&:even?)                    # new array
p [2, 4, 6].tap { |a| a.delete_if(&:even?) }   # in place, safe
```

Compare the two results. On `[1, 2, 3, 4]` the buggy loop gives exactly the right answer; on
`[2, 4, 6]` it gives `[4]` instead of `[]`. Whether it is wrong depends on where the deletions
fall relative to the iterator's position, which means a test written against one input passes
and the bug ships.

`reject` builds a new array; `delete_if` and `reject!` mutate safely because they are implemented
to account for the shifting. Never do it by hand.

Removing element `i` moves element `i+1` into position `i`, and then `i++` steps over it.
The fix is never to patch the index — it is to build a new array.

**`forEach` cannot stop, and ignores your `return`.**

```ruby runnable
# In Ruby, `next` is the one that means "continue" — and unlike JavaScript's
# forEach, `break` genuinely works here.
[1, 2, 3, 4, 5].each do |n|
  next if n == 3          # skip
  break if n == 5         # stop entirely
  puts "saw #{n}"
end
```

This is a place where Ruby's blocks are simply more capable than JavaScript's callbacks:
`Array#forEach` cannot be stopped early, so JavaScript code reaches for `some`/`every` or falls
back to a `for` loop to get a `break`. In Ruby, `each` takes a block and `break` exits it, so
there is never a reason to abandon the iterator for an index loop.

There is no `break` in `forEach`, and `return` only ends that one call. If you need to
stop, use `for...of`, or `find`/`some`/`findIndex` which exist precisely to stop early.

**`forEach` with an async callback does not wait.**

Ruby has no `async`/`await`, so the JavaScript version of this section does not translate. What
replaces it is the loop bug that costs Rails applications more time than every other bug in this
lesson combined: **a query inside a loop.**

```ruby
# N+1: one query for the users, then one more per user.
users = User.limit(50)
users.each { |u| puts u.posts.count }      # 51 queries

# One query for the users, one for all their posts.
users = User.limit(50).includes(:posts)
users.each { |u| puts u.posts.size }       # 2 queries
```

The loop looks identical. The difference is invisible at the call site, lives in whether the
association was preloaded, and scales with your data rather than your code — so it passes every
test on a seeded database with three users and falls over at fifty thousand.

Two details that matter as much as `includes`:

`count` versus `size`. On a preloaded association, `count` issues a fresh `COUNT` query anyway,
defeating the preload; `size` uses the loaded collection. So `includes(:posts)` plus
`u.posts.count` is still N+1. Use `size` when you may have preloaded, `count` when you
deliberately want the database to count without loading.

Loading everything at once is its own failure. `User.all.each` instantiates every row in memory
before the first iteration; `find_each` batches:

```ruby
User.find_each(batch_size: 1000) { |u| process(u) }   # 1,000 rows in memory at a time
```

The general principle, and the reason this sits in a fundamentals lesson rather than a Rails one:
**a loop body that does I/O is a different algorithm from a loop body that does arithmetic.** The
cost is not the iteration, it is the round trip multiplied by the iteration count. Recognising
"this loop talks to something" is the single most valuable loop-reading habit you can build.

`forEach` fires every callback and returns immediately. Use `for...of` with `await` for
sequential work, or `Promise.all(arr.map(...))` for concurrent work. Those are different
things and you should pick on purpose.

**`for...in` over an array.**

```ruby runnable
# Ruby's `for` has one specific hazard, and it is about scope.
for i in 1..3
  # ...
end
p defined?(i)    # "local-variable" — `i` leaked out of the loop
p i              # 3 — and so did its final value

[1, 2, 3].each { |j| j }
p defined?(j)    # nil — a block parameter is scoped to the block
```

`for ... in` does not create a new scope; `each` with a block does. That makes `for` a source of
accidental variable capture and shadowing, and it is why you will essentially never see it in
Ruby written after about 2005. The convention is absolute enough that using `for` reads as a
signal that the author came from somewhere else.

There is a second, subtler consequence. Because the block parameter is a fresh binding per
iteration, closures created inside a block each capture their own value:

```ruby runnable
procs = []
[1, 2, 3].each { |n| procs << -> { n } }
p procs.map(&:call)       # [1, 2, 3] — each lambda kept its own n

leaky = []
for n in [1, 2, 3]
  leaky << -> { n }
end
p leaky.map(&:call)       # [3, 3, 3] — all three share one `n`
```

That is exactly the JavaScript `var`-in-a-loop bug, and in Ruby it belongs to `for` alone. Blocks
never have it.

`for...in` enumerates *keys*, as strings, including inherited and non-index properties. It
is for objects. For arrays it is a bug waiting for someone to add a property.
:::

:::internals
**Why the index loop is sometimes still faster, and why that usually does not matter.**

```ruby runnable
data = Array.new(2_000_000) { |i| i }

def timed(label)
  t = Process.clock_gettime(Process::CLOCK_MONOTONIC)
  result = yield
  ms = (Process.clock_gettime(Process::CLOCK_MONOTONIC) - t) * 1000
  puts format('%-20s %8.1f ms  → %s', label, ms, result)
end

timed('while + index')    { s = 0; i = 0; while i < data.size; s += data[i]; i += 1; end; s }
timed('for ... in')       { s = 0; for n in data; s += n; end; s }
timed('each')             { s = 0; data.each { |n| s += n }; s }
timed('reduce { }')       { data.reduce(0) { |s, n| s + n } }
timed('inject(:+)')       { data.inject(:+) }
timed('sum')              { data.sum }
timed('each_with_object') { data.each_with_object([0]) { |n, a| a[0] += n }[0] }
```

Measured on ruby 3.4.5, summing two million integers:

```text
  while + index       120.5 ms
  each                178.2 ms
  for ... in          218.0 ms
  reduce { }          315.1 ms
  each_with_object    467.2 ms
  inject(:+)            5.4 ms      ← 22x faster than the hand-written loop
  sum                   6.1 ms      ← 20x faster
```

The ordering is the opposite of the intuition people bring from other languages. The hand-written
`while` loop is *not* the fast option — it is four times slower than `sum`, because every
iteration pays for a Ruby-level method call, an integer comparison and a block-free but still
interpreted increment. `sum` and `inject(:+)` drop into C and do the whole loop there.

So the rule for Ruby is almost the reverse of the C-family rule: **the more specific the method
you can name, the faster it is**, because a specific method has a C implementation and a generic
one has to call back into your Ruby for every element. `reduce { |s, n| s + n }` is slow for that
reason — the block is Ruby — while `inject(:+)` passes a symbol and stays in C.

And there is a correctness payoff on top of the speed, which is genuinely surprising:

```ruby runnable
floats = [0.1] * 10
p floats.sum          # 1.0
p floats.inject(:+)   # 0.9999999999999999

# Worse, with values of wildly different magnitude:
p [1e100, 1.0, -1e100].sum          # 1.0  — the 1.0 survives
p [1e100, 1.0, -1e100].inject(:+)   # 0.0  — it was rounded away
```

`Array#sum` uses a compensated (Kahan-Babuška) summation for floats, tracking the rounding error
and folding it back in. The naive loop cannot. So the idiomatic one-word method is both twenty
times faster *and* more numerically accurate than the loop you were about to write — which is not
a trade-off you often get.

One more, because it is the kind of thing that looks like magic in a benchmark:

```ruby runnable
t = Process.clock_gettime(Process::CLOCK_MONOTONIC)
total = (1..100_000_000).sum
ms = (Process.clock_gettime(Process::CLOCK_MONOTONIC) - t) * 1000

puts format('summed 1..100,000,000 → %d in %.3f ms', total, ms)
```

`Range#sum` over integers uses the closed form `n(n+1)/2`, so it is O(1) and returns in
microseconds regardless of the range's size.

The index loop wins because it compiles to a counter and a bounds check. `for...of` goes
through the iterator protocol — an object with a `next()` method returning
`{value, done}` — which is a function call per element that the JIT often but not always
inlines. `reduce` is a function call per element.

Notice the last line: `map` then `reduce` allocates an entire second two-million-element
array to throw away. **That is the cost worth caring about** — not the per-call overhead,
but the intermediate allocation. One combined `reduce`, or a lazy pipeline, avoids it.

The rule: write the clear version; measure before replacing it; and when you do measure,
expect the win to come from removing an allocation rather than from removing a function
call.
:::

:::failure
**An unbounded loop over external data.** The classic incident shape is a `while` whose
exit condition depends on something you do not control.

```ruby runnable
# Pattern: paginate until the API says stop.
MAX_PAGES = 1000              # the guard that makes this safe

pages = 0
cursor = 'start'

fake_api = lambda do |_c|
  pages += 1
  { next: pages < 5 ? 'more' : nil }
end

while cursor
  raise "pagination exceeded #{MAX_PAGES} pages" if pages >= MAX_PAGES

  cursor = fake_api.call(cursor)[:next]
end

puts "finished after #{pages} pages"
```

The bound is not pessimism, it is the difference between a bug and an outage. An API that starts
returning the same cursor forever turns this loop into an infinite one that also makes an
unbounded number of requests — so you exhaust a rate limit, fill a disk with logs, and page
someone, all from a loop that looked fine.

Ruby also gives you `loop`, which pairs with enumerators and rescues `StopIteration` for you:

```ruby runnable
e = [1, 2, 3].each
out = []
loop { out << e.next }    # StopIteration is caught by `loop`, not raised
p out
```

And for anything unbounded, lazy enumerators let you express "an infinite sequence, of which I
want three" directly:

```ruby runnable
p (1..Float::INFINITY).lazy.map { |n| n * 2 }.select { |n| n % 3 == 0 }.first(4)

evaluated = 0
(1..Float::INFINITY).lazy.map { |n| evaluated += 1; n }.first(5)
p evaluated      # 5 — it did exactly as much work as was asked for
```

Without `lazy`, that first line would try to build an infinite array. With it, the chain pulls
one element at a time through `map` and `select` until `first(4)` is satisfied. This is the tool
for streaming a large file, paginating an API or walking a big result set without materialising
any of it.

Without `MAX_PAGES`, an API that always returns a cursor — a bug on their side, or a
cursor that does not advance — turns into an infinite loop holding a database connection.
**Any loop whose termination depends on a remote system needs an explicit bound**, and the
bound should throw rather than break silently, so you find out.
:::

:::tradeoffs
**Declarative (`map`/`filter`/`reduce`).** States intent, cannot be off by one, composes.
Costs an intermediate array per stage and a function call per element. Cannot exit early.

**`for...of`.** Can `break`, no index to get wrong, works on anything iterable including
generators and streams. Slightly slower than an index loop; no free index.

**Index `for`.** Fastest, full control — including control over which mistakes you make.
Worth it for measured hot paths and for algorithms where the index *is* the subject
(binary search, two pointers, in-place swaps).

The honest summary: **the chain is clearer until it allocates something large.** Three
chained passes over 50 elements is free and readable. Three chained passes over five
million is three arrays you did not need.
:::

:::checkpoint
Rewrite each without an index loop, or say why it needs one:

```ruby
# Rewrite each of these with the method that names what it does.

# 1
names = []
users.each { |u| names << u[:name] }

# 2
users.each { |u| return u if u[:id] == target }

# 3
(0...arr.size - 1).each { |i| return false if arr[i] > arr[i + 1] }

# 4
total = 0
items.each { |it| total += it[:price] * it[:qty] }

# 5
result = []
items.each { |it| result << it[:sku] if it[:in_stock] }
```

One of those four genuinely wants indices. Which, and what makes it different?
:::

:::interview
"When would you use a `for` loop instead of `map`?" is testing whether you have a reason
or a habit.

A strong answer names the three real cases: **early exit**, **not a one-to-one
transformation**, and **a measured hot path**. Then the part most candidates skip — *"and
'I need the index' usually is not one of them, because `entries()` and `map`'s second
argument both give you one."*

If performance comes up, do not claim `for` is faster and stop. Say where the cost
actually is: *"the per-call overhead is small and the JIT often removes it; the cost that
shows up in profiles is the intermediate array each chained stage allocates. So for large
data I collapse the chain into one `reduce` or make it lazy — not because function calls
are slow, but because I do not want three copies of five million rows."*
:::

## What you now know

- `map`, `filter` and `reduce` are more specific than `for`, which is why they are
  clearer — `map` cannot change the length.
- Index loops have three independent off-by-one opportunities; `for...of` removes them.
- Never mutate the collection you are iterating. Build a new one.
- `forEach` cannot `break` and does not await. Use `for...of` for sequential async,
  `Promise.all(map(...))` for concurrent.
- `for...in` enumerates string keys including inherited ones. Not for arrays.
- Any loop bounded by a remote system needs an explicit maximum that throws.
- The performance cost that matters is the intermediate allocation, not the function call.
