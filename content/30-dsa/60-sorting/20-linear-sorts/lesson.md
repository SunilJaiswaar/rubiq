---
title: Sorting without comparing
summary: Counting, radix and bucket sort beat the n log n floor by using values as addresses — and the assumptions that buy them that are easy to violate.
level: advanced
minutes: 15
version: "1"
status: stable
last_reviewed: "2026-10-07"
tags: [dsa, sorting, counting-sort, radix-sort, linear-time]
concepts: [counting-sort, radix-sort, non-comparison-sorts, lower-bounds]
prerequisites: [sorting, big-o]
interview:
  - question: How can counting sort be O(n) when the lower bound is O(n log n)?
    level: advanced
    answer: >-
      Because the lower bound applies only to comparison sorts, and counting sort never compares
      two elements. It uses each value as an index into a count array, which is extra
      information the comparison model does not have — you are allowed to know that the values
      are integers in a known range. The cost is that assumption: it is O(n + k) where k is the
      range, so sorting a million 32-bit integers would need a four-billion-entry array. It
      beats the bound by solving a more constrained problem, not by being cleverer.
    followUps:
      - "When does the k term make it worse than quicksort?"
  - question: How does radix sort work and what does it require?
    level: advanced
    answer: >-
      It sorts by one digit at a time, least significant first, using a stable counting sort for
      each pass. After processing all d digits the array is fully sorted, which works because
      stability preserves the ordering established by the previous, less significant digits.
      It is O(d · (n + b)) for d digits in base b. The requirements are that keys decompose into
      a fixed number of digits and that the per-digit sort is stable — if it is not, each pass
      destroys the previous one's work and the result is garbage.
    followUps:
      - "Why least significant first rather than most?"
  - question: When would you actually use one of these?
    level: advanced
    answer: >-
      When the key range is small and known: ages, grades, HTTP status codes, priority levels,
      bytes, or any enum. Counting sort on a million records keyed by one of 100 statuses is a
      single pass plus a 100-entry array, which comfortably beats any comparison sort. Radix
      sort is genuinely used for fixed-width keys at scale — integer ids, IP addresses, and
      inside GPU and database sort implementations. What makes these worth knowing even when you
      do not use them is the habit they teach: ask what you know about the data before reaching
      for a general algorithm.
    followUps:
      - "What makes it unsuitable for sorting strings by locale?"
resources:
  - title: "CLRS — Chapter 8, Sorting in Linear Time"
    url: https://mitpress.mit.edu/9780262046305/introduction-to-algorithms/
---

## Counting sort

```ruby
# Values must be integers in [0, k). No comparisons anywhere.
def counting_sort(a, k)
  count = Array.new(k, 0)
  a.each { |x| count[x] += 1 }                   # tally

  # Prefix sums: count[v] becomes "how many values are < v", which is
  # exactly the output position of the first v.
  total = 0
  (0...k).each do |v|
    c = count[v]
    count[v] = total
    total += c
  end

  out = Array.new(a.size)
  a.each do |x|                                  # place, then advance
    out[count[x]] = x
    count[x] += 1
  end
  out
end

counting_sort([3, 1, 4, 1, 5, 0, 2], 6)   # => [0, 1, 1, 2, 3, 4, 5]
```

O(n + k) time, O(n + k) space. Stable, because the final pass walks the input left to right and
equal values are placed in that order.

Ruby costs you one line here that other languages do not: `out[count[x]++] = x` has no
equivalent, because Ruby has no `++`. Splitting it into a write and an increment is clearer
anyway — the two steps are "place this value" and "the next equal value goes one slot along" —
but it is the kind of line where a careless rewrite reverses the order and silently breaks
stability.

:::what
A **non-comparison sort** orders elements by using their values (or parts of them) to compute
positions directly. **Counting sort** tallies occurrences of each value. **Radix sort** applies
a stable counting sort to one digit at a time. **Bucket sort** distributes values into ranges,
sorts each, and concatenates.
:::

:::why
These exist because the n log n bound is a statement about a *model*, and the model is weaker
than reality.

The comparison model says the only thing you may do with two elements is ask which is larger.
Under that restriction, n log n is provably the floor. But in an actual program you usually know
more: that the values are integers, that they are between 0 and 100, that they are fixed-width,
that they are uniformly distributed. Each of those facts is information the comparison model
discards.

Counting sort converts one such fact — "integers in a small known range" — directly into
addresses. There is no searching because the value *is* the location. That is the whole trick,
and it is the same trick as a hash table: replace comparison with computation.

The reason this is worth a lesson even though you will rarely implement one is the habit it
builds. "Can we sort faster than n log n" has a provable answer of no, and the useful follow-up
is "what do we know about this data". That question has a good answer far more often than people
check — and the same move applies well beyond sorting.
:::

:::how
```text
  COUNTING SORT, step by step

    a = [2, 5, 2, 0, 3],  k = 6

    1. tally            count = [1, 0, 2, 1, 0, 1]
                                  0  1  2  3  4  5

    2. prefix sums      count = [0, 1, 1, 3, 4, 4]
       "count[v] = how many values are strictly less than v"
       = the output index where the first v belongs.

    3. place, walking the input left to right:
       2 → out[1] = 2, count[2] becomes 2
       5 → out[4] = 5
       2 → out[2] = 2          ← second 2 after the first: STABLE
       0 → out[0] = 0
       3 → out[3] = 3

       out = [0, 2, 2, 3, 5]

    Stability comes from step 3 iterating the input in order. Walk
    it backwards and it is still correct and no longer stable.


  RADIX SORT — least significant digit first

    [170, 45, 75, 90, 802, 24, 2, 66]

    by 1s:   [170, 90, 802, 2, 24, 45, 75, 66]
    by 10s:  [802, 2, 24, 45, 66, 170, 75, 90]
    by 100s: [2, 24, 45, 66, 75, 90, 170, 802]

    WHY LSD WORKS — and why stability is load-bearing

    After the 10s pass, 45 and 66 are in order by their last two
    digits. The 100s pass sorts by hundreds; both have hundreds
    digit 0, so they TIE — and a stable sort leaves them in the
    order the previous pass established.

    Use an unstable per-digit sort and each pass destroys the
    previous one's work. The output is not merely imperfect; it is
    unsorted.

    MSD-first can also be made to work, but requires recursing into
    each bucket separately rather than one clean pass per digit,
    because an earlier digit's grouping must be preserved as
    partitions rather than as order.


  WHEN k RUINS IT

    O(n + k):

      n = 1,000,000   k = 100          → 1,000,100.   Excellent.
      n = 1,000,000   k = 1,000,000    → 2,000,000.   Fine.
      n = 1,000       k = 2^32         → 4 billion.   Catastrophic.

    The rule: counting sort is good when k is O(n) or smaller.
    Beyond that, radix sort (which splits the range into digits) or
    a comparison sort.
```
:::

:::example
```ruby
# 1. Radix sort for non-negative integers, base 256.
#    Base 256 means 4 passes for a 32-bit integer and a 256-entry
#    count array — a good practical trade.
def radix_sort(a)
  return a.dup if a.empty?
  bits = 8
  base = 1 << bits
  mask = base - 1
  cur = a.dup
  buf = Array.new(a.size)
  max = a.max

  shift = 0
  while (max >> shift).positive?
    count = Array.new(base, 0)
    cur.each { |x| count[(x >> shift) & mask] += 1 }

    total = 0
    (0...base).each { |v| c = count[v]; count[v] = total; total += c }

    cur.each do |x|
      digit = (x >> shift) & mask
      buf[count[digit]] = x
      count[digit] += 1
    end
    cur, buf = buf, cur          # swap the buffers, do not allocate
    shift += bits
  end
  cur
end

radix_sort([170, 45, 75, 90, 2, 802, 24, 66])
# => [2, 24, 45, 66, 75, 90, 170, 802]

# `while (max >> shift).positive?` means only as many passes as the
# largest value needs — sorting small numbers does not pay for 32 bits
# of width.
#
# Two things Ruby gives you free here. `a.max` needs no spread operator,
# so it works on a million elements; JavaScript's `Math.max(...a)`
# overflows the stack somewhere in the tens of thousands. And because
# Ruby Integers are arbitrary precision, the bit operations keep working
# past 64 bits — `radix_sort([2**100, 2**70 + 5, 7])` sorts correctly,
# just with more passes. A fixed-width implementation would silently
# truncate.

# 2. Counting sort by a key, which is the form you will actually use.
STATUSES = %w[pending paid shipped refunded].freeze

def sort_by_status(records)
  buckets = STATUSES.to_h { |s| [s, []] }
  records.each { |r| buckets[r.status] << r }
  buckets.values.flatten(1)
end

# One pass, four arrays, stable, and O(n) on a million records. A
# comparison sort would do ~20 million string comparisons for the same
# result. The small fixed key range is what makes this valid.
#
# `flatten(1)` and not `flatten`: the depth argument matters, because a
# bare `flatten` would also flatten any record that happens to be an
# Array. Defaulting to "all the way down" is a trap whenever the
# elements could themselves be collections.

# 3. Bucket sort — for values known to be uniformly distributed.
def bucket_sort(a)
  n = a.size
  return a.dup if n.zero?
  buckets = Array.new(n) { [] }
  a.each { |x| buckets[(x * n).floor] << x }     # x in [0, 1)
  buckets.flat_map(&:sort)
end

# O(n) EXPECTED if the distribution is uniform, because each bucket holds
# O(1) elements on average. Clustered input puts everything in one bucket
# and degrades to whatever the inner sort is — so the uniformity
# assumption is doing all the work, and it is the one nobody verifies.
#
# `Array.new(n) { [] }` and not `Array.new(n, [])`. The second form
# stores the SAME array n times, so every push lands in every bucket.
# This is the single most common Ruby array-initialisation bug, and it
# is silent: you get one bucket holding everything, n times over.
```
:::

:::failure
**Negative values in counting sort.**

```ruby
counting_sort([-5, 3], 10)
# No exception. Ruby reads a negative index from the END of the array,
# so `count[-5] += 1` increments index k-5:
count = Array.new(10, 0)
count[-5] += 1
count   # => [0, 0, 0, 0, 0, 1, 0, 0, 0, 0]
#                          ↑ index 5
```

This is worth sitting with, because it is worse than the equivalent mistake in most languages.
There is no error, no `nil`, and no out-of-range: the tally simply lands in the wrong bucket and
the sort returns a plausible, wrongly-ordered array. A negative value in the input quietly
corrupts the count for a positive one.

The fix is to offset by the minimum:

```ruby
def counting_sort_offset(a)
  return [] if a.empty?
  min = a.min
  k = a.max - min + 1
  count = Array.new(k, 0)
  a.each { |x| count[x - min] += 1 }

  total = 0
  (0...k).each { |v| c = count[v]; count[v] = total; total += c }

  out = Array.new(a.size)
  a.each do |x|
    out[count[x - min]] = x       # ...and `min` is added back implicitly,
    count[x - min] += 1           # because we store x, not the index
  end
  out
end

counting_sort_offset([-5, 3, -1, 0, 3])   # => [-5, -1, 0, 3, 3]
```

Deriving `k` from `a.max - a.min + 1` rather than taking it as an argument also removes the
other half of the bug — a caller who passes a `k` smaller than the largest value gets the same
silent wrap at the top end.

**A range you did not bound.** `k` derived from the data (`a.max - a.min + 1`) makes the algorithm's
memory a function of the input's *values*, not its size. One outlier of 2³¹ allocates two
gigabytes:

```ruby
counting_sort([1, 2, 3, 2_147_483_647], 2**31)
# Array.new(2**31, 0) wants 2^31 slots at 8 bytes each: 17 GB, for an
# input of four elements.
```

Measured on ruby 3.4.5: under a memory limit this raises `NoMemoryError: failed to allocate
memory`. Without one, the kernel's OOM killer takes the process — no exception, no log line you
wrote, just a dead worker. And `NoMemoryError` descends from `Exception` rather than
`StandardError`, so even in the version that *does* raise, your `rescue => e` will not see it.

That is an input-controlled allocation, which makes it a denial-of-service vector exactly like
unbounded nesting depth. The guard is a bound on the key range, checked before allocating:

```ruby
MAX_RANGE = 1_000_000

def counting_sort_guarded(a)
  return [] if a.empty?
  range = a.max - a.min + 1
  raise ArgumentError, "key range #{range} exceeds #{MAX_RANGE}" if range > MAX_RANGE
  counting_sort_offset(a)
end
```

The useful framing is that counting sort trades space for the comparison lower bound, and the
space is a function of the *input values* rather than the input size. Any time a size derives
from data rather than from a count, it needs a ceiling.

**An unstable per-digit sort in radix sort.** Not a degradation — the output is wrong, because
each pass depends on the previous one's ordering surviving ties.

**Radix sort on floats or signed integers, naively.** IEEE 754 negative floats sort *backwards*
under a byte-wise comparison, because the sign bit makes them look larger and the mantissa
ordering inverts. Correct handling flips the sign bit for positives and inverts all bits for
negatives before sorting — which is doable and is exactly the kind of detail that makes
hand-rolling radix sort for floats a bad idea.

**Radix sort for locale-aware string sorting.** Collation is not byte order. `"ä"` sorts next to
`"a"` in German, `"ch"` is one letter in traditional Spanish collation, and case-insensitive
ordering is language-dependent. Byte-wise radix gives you byte order, which is correct for
machine keys and wrong for anything a human reads. Use `localeCompare` or ICU.

**Bucket sort on clustered data.** All elements in one bucket, so you have paid for the
distribution pass and then run the inner sort on everything. The uniformity assumption is the
entire basis of the O(n) claim and is rarely checked.

**Counting sort "faster" with a huge k.** The constant is a full pass over k, so initialising a
million-entry array to sort a hundred elements is slower than any comparison sort — while still
being O(n + k) and technically "linear".
:::

:::realworld
```text
// Where non-comparison sorts actually run.

  Database sorts        — Postgres and others use radix-style sorts
                           for fixed-width integer keys; abbreviated
                           keys pack a prefix into a word so most
                           comparisons never touch the full key.
  GPU sorting           — radix sort dominates, because it is
                           branch-free and parallelises cleanly.
                           Comparison sorts branch, and branches are
                           expensive on a GPU.
  Suffix array          — DC3 and related algorithms use radix sort
  construction             internally; this is what powers fast
                           full-text search and bioinformatics.
  Bucketing by day      — grouping a million events by date is a
                           counting sort with 365 buckets, and most
                           people write it as `group_by` without
                           noticing it is linear.
  Priority levels       — job queues with 0-9 priorities: ten
                           buckets, O(n), no heap required.
  IP routing            — radix tries, which are the same
                           digit-at-a-time idea applied to lookup
                           rather than to sorting.
```

```ruby
# The version of this you will actually write, and it rarely looks
# like a sort:
by_status = orders.group_by(&:status)
ordered = %w[pending paid shipped].flat_map { |s| by_status.fetch(s, []) }
```

That is counting sort. One pass to distribute, one pass to concatenate, O(n), stable.
Recognising it as such is what tells you it is already optimal and needs no comparator — and
that reaching for `sort_by` with a hand-written status-to-rank Hash would be strictly more work
for a worse result.

`fetch(s, [])` rather than `by_status[s]` because a status with no records must contribute an
empty list, not a `nil` for `flat_map` to trip over. And in Rails the same shape usually belongs
in the database, where the ordering is an index scan rather than any sort at all:

```ruby
Order.order(Arel.sql("array_position(ARRAY['pending','paid','shipped']::varchar[], status)"))
```

Which is the honest trade to be aware of: `group_by` in Ruby is O(n) and loads every row;
`array_position` in Postgres sorts without loading anything, but costs you a raw SQL fragment
and a dependency on the enum's order living in two places. For a page of results, order in the
database. For records you already have in memory, `group_by` is the answer.

```text
// The transferable idea, which outlives the algorithms:
//
//   A general algorithm cannot use information you have not given it.
//
//   Sorting            → small known range? counting sort.
//   Lookup             → keys are small integers? an array, not a hash.
//   Membership         → bounded universe? a bitset, not a Set.
//   Approximate count  → tolerate error? a Bloom filter, not a Set.
//   Nearly-sorted      → Timsort finds the runs for free.
//
// Every one of these is the same move: pay attention to the data and
// a constrained tool beats a general one by an order of magnitude.
```
:::

:::mistakes
**Negative values without an offset.** Negative array index.

**An unbounded k taken from the data.** Input-controlled allocation.

**An unstable per-digit sort in radix.** Wrong output, not slow output.

**Byte-wise radix on floats or signed ints** without bit manipulation.

**Radix for human-facing string order.** Collation ≠ byte order.

**Bucket sort without checking the distribution.** The O(n) claim is entirely an assumption
about the input.

**Claiming O(n) while k dominates.** Say O(n + k) and then say what bounds k.

**Implementing one where a `group_by` would do.** Most practical uses of counting sort are a
grouping followed by a concatenation, and the standard library already has both.
:::

:::tradeoffs
**Counting sort** — O(n + k), stable, requires integer keys in a known small range, and uses
O(k) memory. Excellent when k is small and fixed; unusable when k is large or input-derived.

**Radix sort** — O(d · (n + b)), handles large ranges by splitting into digits, needs
fixed-width decomposable keys and a stable inner sort. The right choice for integer ids at
scale, and for GPUs because it is branch-free.

**Bucket sort** — O(n) expected under uniformity, O(n log n) or worse otherwise. Only safe when
you actually know the distribution.

**Comparison sort** — O(n log n) always, no assumptions about the data, works with any
comparator including locale collation and multi-key orders. The default precisely because it
assumes nothing.

**Not sorting** — grouping into buckets when you only need groups, a heap when you only need
the top k, or maintaining order incrementally.

The decision: **is the key an integer in a small bounded range?** If yes, counting sort — and it
probably looks like a `group_by`. **Fixed-width keys and a lot of data?** Radix. **Anything else,
or keys a human will read?** The language's comparison sort. And state the bound honestly as
O(n + k), because the k term is where this goes wrong.
:::

:::checkpoint
1. How does counting sort escape the n log n bound? What does it assume in exchange?
2. In the prefix-sum step, what does `count[v]` mean afterwards?
3. What makes counting sort stable, and what single change would break that?
4. Why must radix sort's per-digit sort be stable? What exactly goes wrong without it?
5. Why least-significant-digit first?
6. `counting_sort([1, 2, 3, 2_147_483_647])` — what happens, and why is that a security
   concern? Which error do you get, and will your `rescue` catch it?
7. Why is byte-wise radix sort wrong for sorting names a user will read?
8. `orders.group_by(&:status)` followed by a concatenation in a fixed order — which sort is that?
:::

:::interview
Answer the "how is this possible" question by naming the model, because that is the whole
insight:

*"The lower bound applies to comparison sorts, and counting sort never compares anything. It uses
each value as an index into a count array, so the value *is* the address — which is information
the comparison model is not allowed to have. It does not beat the bound by being cleverer; it
solves a more constrained problem. The constraint is the price: O(n + k) where k is the key range,
so it is excellent for 100 statuses and unusable for 32-bit integers."*

For radix sort, lead with the requirement that is easy to miss:

*"One stable counting sort per digit, least significant first. Stability is load-bearing rather
than nice to have: after the tens pass, two values are correctly ordered by their last two digits,
and when the hundreds pass finds them tied, a stable sort leaves that ordering intact. With an
unstable per-digit sort each pass destroys the previous one's work and the output is simply
unsorted."*

Then make it practical, since you will rarely write one:

*"Where this matters day to day is recognising it. Grouping a million orders by one of four
statuses and concatenating is a counting sort — one pass, four arrays, O(n) — and people write it
as `group_by` without realising it is already optimal. The habit worth having is that 'can we sort
faster than n log n' has a provable no, and the useful question is 'what do we know about this
data'. Small bounded range, fixed width, nearly sorted — each one unlocks a better tool."*
:::

## What you now know

- The n log n bound constrains comparison sorts; these use values as addresses instead.
- Counting sort: tally, prefix-sum into positions, place. O(n + k), stable.
- After the prefix sums, `count[v]` is the number of values less than v — the output index.
- Stability comes from walking the input left to right in the placement pass.
- Radix sort is one stable counting sort per digit, least significant first.
- Stability in radix is required for correctness, not performance: each pass relies on the last.
- k is the danger: an unbounded range taken from the data is input-controlled allocation.
- Negative values need an offset; floats and signed ints need bit manipulation.
- Byte order is not collation — never radix-sort human-facing text.
- Bucket sort's O(n) is entirely an assumption about distribution.
- State the complexity as O(n + k) and say what bounds k.
- Most real uses look like a `group_by` plus a concatenation.
- The transferable move: a general algorithm cannot use information you did not give it.
- A negative index does not raise in Ruby — it wraps to the end of the array, so one negative
  input silently corrupts another value's tally.
- Derive `k` from `a.max - a.min + 1` and bound it; an input-controlled allocation is a DoS.
- `NoMemoryError` is not a `StandardError`, and without a memory limit the OOM killer gets
  there first — so neither path is one you can rescue.
- `Array.new(n) { [] }` creates n arrays; `Array.new(n, [])` creates one array n times.
- `flatten(1)`, not `flatten`, whenever the elements could themselves be collections.
- `a.max` needs no spread operator, and Ruby's arbitrary-precision Integers let radix sort keep
  working past 64 bits.
- `group_by` plus a fixed-order concatenation *is* counting sort — recognise it and stop.
