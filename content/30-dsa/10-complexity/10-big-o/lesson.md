---
title: Big-O, derived rather than memorised
summary: Why we count operations instead of measuring seconds, and how to read the complexity of code you are looking at.
level: basic
minutes: 16
version: "n/a"
status: stable
last_reviewed: "2026-09-20"
tags: [dsa, complexity, big-o, performance]
concepts: [complexity, big-o, amortised-analysis, growth-rates]
prerequisites: []
interview:
  - question: What is Big-O notation actually describing?
    level: basic
    answer: >-
      An upper bound on how the number of operations grows as the input grows, with
      constants and lower-order terms discarded. It says nothing about absolute speed: an
      O(n) algorithm can be slower than an O(n²) one on small inputs, and often is,
      because the constant factor is real and Big-O deliberately throws it away. What it
      buys you is the ability to predict behaviour at a scale you have not tested at.
    followUps:
      - "Give me a case where you would choose the asymptotically worse algorithm."
      - "What is the difference between O, Θ and Ω?"
  - question: Why is appending to a dynamic array O(1) when it sometimes has to copy everything?
    level: intermediate
    hint: What does the array do when it runs out of room?
    answer: >-
      Because of amortised analysis. When the array is full it allocates a new buffer of
      double the size and copies, which is O(n) — but doubling means that resize happens
      only after n more appends, so the cost is spread over all of them. The total cost of
      n appends is O(n), making the average O(1) per append. The crucial detail is the
      *doubling*: if the array grew by a fixed amount instead, resizes would happen every
      k appends and the total would be O(n²).
    followUps:
      - "What is the worst-case cost of a single append?"
      - "When does amortised O(1) not good enough?"
  - question: You profile a function and it is slow. Does Big-O help?
    level: intermediate
    answer: >-
      Only for one specific question: will this get worse as the data grows? Big-O will not
      tell you whether the problem is a bad algorithm or a bad constant — an O(n) loop
      doing a database query per iteration is asymptotically fine and operationally
      catastrophic. So I use the profiler to find where time goes, and Big-O to decide
      whether the fix is a smaller constant or a different algorithm. The N+1 query
      problem is the classic case where the complexity class is fine and the code is still
      wrong.
resources:
  - title: "Big-O cheat sheet (common data structure complexities)"
    url: https://www.bigocheatsheet.com/
---

## The question Big-O exists to answer

You have written a function. It takes 50 milliseconds on your laptop with 1,000 records.
Production has 2 million records.

Will it take 100 seconds, or 11 hours?

:::problem
You cannot answer that by measuring, because you do not have production data on your
laptop, and the answer depends entirely on the *shape* of your code rather than its
speed. Two functions that both take 50ms on 1,000 records can differ by a factor of a
million at 2 million records.

And you cannot answer it by timing, because timings are specific to a machine, a
language, a cache state, and what else was running. A measurement tells you about today.
You need to know about a scale you cannot reach yet.
:::

:::why
So we stop measuring time and start counting **operations as a function of input size**.
That is machine-independent, language-independent, and — crucially — it extrapolates.
:::

## Count the operations

```ruby runnable
# How many times does the comparison run, as a function of array length?
def contains?(array, target)
  array.each do |item|
    return true if item == target
  end
  false
end

# Instrument it so the count is visible rather than asserted.
[10, 100, 1000].each do |n|
  data = (1..n).to_a
  comparisons = 0
  data.each { |item| comparisons += 1; break if item == -1 }
  puts "n = #{n.to_s.rjust(4)}  →  #{comparisons} comparisons"
end
```

The count equals `n`. Double the input, double the work. We write that **O(n)** and call
it linear.

```ruby runnable
# Now a nested loop.
[10, 20, 40].each do |n|
  data = (1..n).to_a
  operations = 0
  data.each do |a|
    data.each do |b|
      operations += 1
    end
  end
  puts "n = #{n.to_s.rjust(3)}  →  #{operations} operations  (n² = #{n * n})"
end
```

Double the input, **quadruple** the work. That is **O(n²)**, quadratic.

:::what
**Big-O** describes an upper bound on how an algorithm's operation count grows as its
input grows, discarding constant factors and lower-order terms.
:::

## Why we throw away the constants

This is the part that feels like cheating and is actually the point.

```text
  Algorithm A:  3n + 50       operations
  Algorithm B:  n²            operations

  n = 10     A: 80          B: 100        A wins, barely
  n = 100    A: 350         B: 10,000     A wins by 28×
  n = 10,000 A: 30,050      B: 100,000,000  A wins by 3,300×
```

As `n` grows, the `3` and the `50` stop mattering. The *shape* — linear versus quadratic —
dominates everything else. So we write A as O(n) and B as O(n²) and discard the rest,
because the discarded parts cannot change the answer at scale.

:::tradeoffs
**What dropping constants buys.** A comparison that is true on any machine, in any
language, forever. You can reason about an algorithm without running it.

**What it costs — and this matters.** Big-O is *silent about the thing you often care
about*. Consider:

```text
  Algorithm A: O(n)     but each operation is a 10 ms network call
  Algorithm B: O(n²)    but each operation is a 1 ns array read

  n = 1,000:   A = 10 seconds        B = 1 millisecond
```

B is asymptotically worse and 10,000× faster at this scale. The crossover is around
n = 100 million. So the honest claim is: **Big-O tells you how a cost grows, not how big
it is.** Both facts matter, and Big-O only gives you one.

This is exactly why the N+1 query problem is dangerous: it is O(n), which sounds fine, and
each of those n operations is a database round trip.
:::

## Reading complexity off code

A few rules that cover most real code.

:::how
**Sequential blocks add, and the bigger one wins.**

```ruby
array.each { }           # O(n)
array.each { }           # O(n)
# total: O(n) + O(n) = O(2n) = O(n)

array.each { }           # O(n)
array.each { |a| array.each { |b| } }   # O(n²)
# total: O(n) + O(n²) = O(n²)   ← the smaller term is dropped
```

**Nested loops multiply.**

```ruby
users.each do |u|        # n
  orders.each do |o|     # m
  end
end
# O(n × m), which is O(n²) only when n and m are the same size.
# Writing O(n·m) is more honest when they are different collections.
```

**Halving the input each step is logarithmic.**

```ruby
while n > 1
  n = n / 2
end
# How many times can you halve n before reaching 1? log₂(n) times.
# n = 1,000,000 → about 20 iterations.
```

**A loop containing a halving is O(n log n).** That is the complexity of a good
comparison sort, and it is why `sort` is cheap enough to use freely.
:::

```ruby runnable
# See the growth rates side by side. The numbers do the arguing.
puts "      n |      log n |          n |    n log n |              n²"
puts "-" * 66
[10, 100, 1_000, 10_000, 100_000, 1_000_000].each do |n|
  log  = Math.log2(n).round
  nlog = (n * Math.log2(n)).round
  sq   = n * n
  puts [
    n.to_s.rjust(7),
    log.to_s.rjust(10),
    n.to_s.rjust(10),
    nlog.to_s.rjust(10),
    sq.to_s.rjust(15),
  ].join(" | ")
end
```

Look at the last row. At a million items, an O(n log n) algorithm does 20 million
operations and an O(n²) algorithm does a **trillion**. On a machine doing a billion
operations a second: 20 milliseconds versus roughly 16 minutes.

That is the whole practical value of this topic. Not the notation — the ability to look at
a nested loop over a large collection and know, before running it, that it will not
finish.

## Amortised analysis: why `push` is O(1)

A dynamic array has a fixed-size buffer. When it fills up, appending has to allocate a
bigger one and copy everything across — clearly O(n). So how is `push` O(1)?

:::how
The trick is **doubling**.

```text
  capacity 4, length 4 → push → allocate 8, copy 4 items.   cost 4
  pushes 5, 6, 7, 8                                          cost 1 each
  capacity 8, length 8 → push → allocate 16, copy 8 items.   cost 8
  pushes 9 … 16                                              cost 1 each
  capacity 16 → push → allocate 32, copy 16.                 cost 16

  Total copying cost to reach n items:  4 + 8 + 16 + … + n
                                     =  about 2n
  Total pushes: n
  Average cost per push: 2n / n = 2 = O(1)
```

The expensive resizes get rarer at exactly the rate their cost grows, so they cancel. This
is called **amortised O(1)**: any individual push might cost O(n), but n pushes cost O(n)
in total.

The doubling is essential. If the array grew by a constant 10 slots instead:

```text
  resizes happen every 10 pushes, each costing O(current length)
  total = 10 + 20 + 30 + … + n = O(n²)
```

Growing by a constant amount turns n appends into quadratic work. This is also why
repeatedly concatenating strings in a loop is slow in many languages — each `+=` allocates
a new string and copies.
:::

```ruby runnable
require "benchmark"
n = 200_000

Benchmark.bm(22) do |x|
  x.report("push (amortised O(1))") do
    a = []
    n.times { |i| a.push(i) }
  end

  x.report("unshift (O(n) each)") do
    a = []
    20_000.times { |i| a.unshift(i) }   # 10x fewer iterations, still slower
  end
end
```

`unshift` has to move every existing element to make room at the front, so it is O(n) per
call and O(n²) in a loop. Twenty thousand `unshift` calls lose to two hundred thousand
`push` calls. If you are building a list in reverse, `push` then `reverse` — two O(n)
passes — beats `unshift` in a loop.

:::mistakes
**Assuming a built-in method is free.** `include?` on an array is O(n). Inside a loop over
the same array, that is O(n²):

```ruby runnable
require "benchmark"
haystack = (1..20_000).to_a
needles  = (1..20_000).to_a

Benchmark.bm(16) do |x|
  x.report("array include?") do
    needles.count { |n| haystack.include?(n) }     # O(n²)
  end

  lookup = haystack.to_set
  x.report("set include?") do
    needles.count { |n| lookup.include?(n) }       # O(n)
  end
end
```

One line — converting to a Set first — changes the complexity class. This is the single
most common O(n²) in real application code, and it is usually written by accident.

**Confusing best, average and worst case.** Quicksort is O(n log n) on average and O(n²)
in the worst case. Hash lookup is O(1) on average and O(n) if every key collides. When a
system has a latency SLA, the worst case is the number that matters.

**Thinking O(1) means fast.** O(1) means "does not grow with input size". A single
operation taking 200ms is O(1).
:::

:::realworld
Where this changes decisions, concretely:

```ruby
# O(n) database calls — asymptotically "linear", operationally a disaster.
# 500 users = 501 round trips = several seconds.
users.each { |u| puts u.orders.count }

# O(1) database calls. Same asymptotic complexity in CPU terms. 500× faster in practice.
counts = Order.group(:user_id).count
users.each { |u| puts counts[u.id] || 0 }
```

Both loops are O(n). Big-O cannot distinguish them, because the difference is entirely in
the constant factor — and the constant factor is a network round trip. This is why
"what is the complexity?" is a necessary question and never a sufficient one.

```ruby
# Deduplicating 100,000 records
records.uniq                            # O(n) — hashes each record once
records.each_with_index.select { |r, i| records.index(r) == i }   # O(n²) — do not
```

:::

:::debugging
How to find an accidental O(n²) in code you did not write:

1. **Time it at two sizes.** Run with n and with 2n. If the time quadruples, it is
   quadratic. If it doubles, linear. This takes two minutes and is conclusive.
2. **Look for a lookup inside a loop.** `include?`, `index`, `find`, `detect`, `select`
   and `where` inside an iteration over the same or a comparable collection.
3. **Look for a query inside a loop.** Asymptotically invisible, operationally the most
   common performance bug in web applications.
4. **Look for string building in a loop** without a buffer or `join`.
5. **Look for `unshift`, `shift` or `insert(0, …)`** on an array in a loop.

```ruby runnable
# The two-size test, made concrete.
require "benchmark"

def quadratic(n)
  data = (1..n).to_a
  data.count { |x| data.include?(x) }
end

t1 = Benchmark.realtime { quadratic(3_000) }
t2 = Benchmark.realtime { quadratic(6_000) }
puts "n=3000: #{(t1 * 1000).round(1)}ms"
puts "n=6000: #{(t2 * 1000).round(1)}ms"
puts "ratio: #{(t2 / t1).round(1)}x  → ~2x means linear, ~4x means quadratic"
```
:::

:::performance
The complexities worth knowing without looking up:

| Operation | Array | Hash / Set | Sorted array |
|---|---|---|---|
| Access by index | O(1) | — | O(1) |
| Search by value | O(n) | O(1) avg | O(log n) |
| Insert at end | O(1) amortised | O(1) avg | O(n) |
| Insert at front | O(n) | — | O(n) |
| Delete by value | O(n) | O(1) avg | O(n) |
| Min / max | O(n) | O(n) | O(1) |
| In sorted order | O(n log n) | O(n log n) | O(1) |

Reading that table as a *decision table* is the skill. "I need fast membership tests" →
the Hash column. "I need fast min" → sorted, or a heap. The data structure follows from
the access pattern, and choosing by habit instead is where most avoidable slowness
comes from.
:::

:::checkpoint
State the complexity of each, in terms of `n = array.length`:

```ruby
# 1
array.each { |x| puts x }

# 2
array.each { |x| array.each { |y| puts x + y } }

# 3
array.sort.first

# 4
array.each { |x| puts array.include?(x) }

# 5
seen = {}
array.each { |x| seen[x] = true }

# 6
i = array.length
i = i / 2 while i > 1
```

Then, for number 3: is there a better way to get the minimum, and what is its complexity?
:::

:::interview
Complexity comes up in essentially every technical interview, and the failure mode is
reciting a number without reasoning.

**Do this:** state the complexity *before* you code, derive it out loud from the loops
rather than recalling it, and name the worst case separately when it differs from the
average. "This is O(n log n) because I sort first and then do a single linear pass" is a
much stronger sentence than "this is O(n log n)".

**Then add the sentence most candidates skip:** what you are trading away. "I am using a
hash to get O(1) lookups, which costs O(n) extra memory — if memory were the constraint
I would sort in place and binary search instead, at O(n log n) time and O(1) space."
Interviewers are listening for whether you know a choice was made.

**And be ready for "can you do better?"** The honest answer is sometimes no, and knowing
the lower bound is itself a signal — comparison sorting cannot beat O(n log n), and
finding a minimum in an unsorted array cannot beat O(n), because you must look at every
element to know.
:::

## What you now know

- Big-O counts operations as a function of input size, discarding constants, so it
  predicts behaviour at scales you cannot test.
- Dropping constants is what makes it portable and also what makes it incomplete: an O(n)
  loop of network calls is far worse than an O(n²) loop of array reads at realistic sizes.
- Sequential blocks add (bigger term wins); nested loops multiply; halving each step is
  logarithmic.
- At n = 1,000,000 the gap between O(n log n) and O(n²) is about 20ms versus 16 minutes.
- `push` is amortised O(1) *because* the array doubles. Growing by a constant would make
  n appends O(n²).
- The most common accidental O(n²) in application code is a lookup — or a database query —
  inside a loop.
- Verify empirically by timing at n and 2n: roughly 2× is linear, roughly 4× is quadratic.
