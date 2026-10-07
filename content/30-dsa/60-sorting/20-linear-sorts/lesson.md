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

```js
// Values must be integers in [0, k). No comparisons anywhere.
function countingSort(a, k) {
  const count = new Array(k).fill(0);
  for (const x of a) count[x]++;                 // tally

  // Prefix sums: count[v] becomes "how many values are < v",
  // which is exactly the output position of the first v.
  let total = 0;
  for (let v = 0; v < k; v++) {
    const c = count[v];
    count[v] = total;
    total += c;
  }

  const out = new Array(a.length);
  for (const x of a) out[count[x]++] = x;        // place, then advance
  return out;
}
// O(n + k) time, O(n + k) space. Stable, because the final pass walks
// the input left to right and equal values are placed in that order.
```

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
```js
// 1. Radix sort for non-negative integers, base 256.
//    Base 256 means 4 passes for a 32-bit integer and a
//    256-entry count array — a good practical trade.
function radixSort(a) {
  const BITS = 8, BASE = 1 << BITS, MASK = BASE - 1;
  let cur = a.slice();
  let buf = new Array(a.length);
  const max = Math.max(...a, 0);

  for (let shift = 0; (max >> shift) > 0; shift += BITS) {
    const count = new Array(BASE).fill(0);
    for (const x of cur) count[(x >> shift) & MASK]++;

    let total = 0;
    for (let v = 0; v < BASE; v++) { const c = count[v]; count[v] = total; total += c; }

    for (const x of cur) buf[count[(x >> shift) & MASK]++] = x;
    [cur, buf] = [buf, cur];           // swap, do not allocate
  }
  return cur;
}
// The loop bound `(max >> shift) > 0` means only as many passes as
// the largest value needs — sorting small numbers does not pay for
// 32 bits of width.

// 2. Counting sort by a key, which is the form you will actually use.
function sortByStatus(records) {
  const STATUSES = ["pending", "paid", "shipped", "refunded"];
  const index = new Map(STATUSES.map((s, i) => [s, i]));
  const buckets = STATUSES.map(() => []);
  for (const r of records) buckets[index.get(r.status)].push(r);
  return buckets.flat();
}
// One pass, four arrays, stable, and O(n) on a million records.
// A comparison sort would do ~20 million string comparisons for the
// same result. The small fixed key range is what makes this valid.

// 3. Bucket sort — for values known to be uniformly distributed.
function bucketSort(a) {
  const n = a.length;
  const buckets = Array.from({ length: n }, () => []);
  for (const x of a) buckets[Math.floor(x * n)].push(x);     // x in [0, 1)
  return buckets.flatMap((b) => b.sort((p, q) => p - q));
}
// O(n) EXPECTED if the distribution is uniform, because each bucket
// holds O(1) elements on average. Clustered input puts everything in
// one bucket and degrades to whatever the inner sort is — so the
// uniformity assumption is doing all the work, and it is the one
// nobody verifies.
```
:::

:::failure
**Negative values in counting sort.**

```js
countingSort([-5, 3], 10);   // count[-5] — writes to a negative index
// Offset by the minimum:
const min = Math.min(...a);
count[x - min]++;
// ...and remember to add `min` back when reading out.
```

**A range you did not bound.** `k` derived from the data (`Math.max(...a)`) makes the algorithm's
memory a function of the input's *values*, not its size. One outlier of 2³¹ allocates two
gigabytes:

```js
countingSort([1, 2, 3, 2147483647]);   // k = 2^31. Four elements.
// This is an input-controlled allocation, which makes it a denial-of-
// service vector exactly like unbounded nesting depth.
```

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

```js
// The version of this you will actually write, and it rarely looks
// like a sort:
const byStatus = Object.groupBy(orders, (o) => o.status);
const ordered = ["pending", "paid", "shipped"].flatMap((s) => byStatus[s] ?? []);
// That is counting sort. One pass to distribute, one pass to
// concatenate, O(n), stable. Recognising it as such is what tells
// you it is already optimal and does not need a comparator.
```

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
6. `countingSort([1, 2, 3, 2147483647])` — what happens, and why is that a security concern?
7. Why is byte-wise radix sort wrong for sorting names a user will read?
8. `Object.groupBy(orders, o => o.status)` followed by a concatenation — which sort is that?
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
