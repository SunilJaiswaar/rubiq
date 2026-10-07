---
title: Comparison sorts
summary: Why no comparison sort can beat O(n log n), what quicksort trades for its speed, and why your language's sort is none of the textbook algorithms.
level: intermediate
minutes: 19
version: "1"
status: stable
last_reviewed: "2026-10-07"
tags: [dsa, sorting, quicksort, mergesort, stability]
concepts: [sorting, stability, lower-bounds, divide-and-conquer]
prerequisites: [big-o, recursion]
interview:
  - question: Why can no comparison sort be faster than O(n log n)?
    level: intermediate
    answer: >-
      There are n! possible orderings, and each comparison yields one bit — it splits the
      remaining possibilities into at most two groups. To distinguish n! outcomes you need at
      least log₂(n!) comparisons, and log₂(n!) is Θ(n log n) by Stirling's approximation. So it
      is an information-theoretic floor, not a statement about cleverness: any algorithm whose
      only tool is pairwise comparison must ask that many questions. Algorithms that beat it,
      like counting sort, do so by not comparing — they use the values as indices, which is
      extra information the comparison model does not have.
    followUps:
      - "So what assumption does counting sort make?"
  - question: Quicksort or mergesort?
    level: intermediate
    answer: >-
      Quicksort is usually faster in practice — it sorts in place with excellent cache locality
      and a small constant factor — but its worst case is O(n²) and it is not stable. Mergesort
      is O(n log n) guaranteed and stable, and it needs O(n) extra space. So the honest answer
      is that it depends on what you are protecting: quicksort for raw speed on primitives
      where stability is meaningless, mergesort when you need a guarantee or stability. Most
      language runtimes use neither in pure form — they use introsort (quicksort that switches
      to heapsort on bad recursion depth) or Timsort, which exploits existing runs.
    followUps:
      - "What makes quicksort degenerate, and how is that avoided?"
  - question: What is a stable sort and why does it matter?
    level: basic
    answer: >-
      A stable sort preserves the relative order of elements that compare equal. It matters
      because it lets you sort by multiple keys with successive passes: sort by name, then by
      department, and within each department the names are still in order. Without stability
      that second sort scrambles the first. It also matters for user-facing lists, where
      re-sorting by one column should not reshuffle rows that tie. Ruby guarantees stability for
      neither `sort` nor `sort_by`, and `sort_by` visibly breaks it from about twenty elements —
      measured on ruby 3.4.5, twenty rows with two distinct keys come back with the equal ones
      reversed. So in Ruby the answer is to make ties explicit by sorting on a tuple that ends
      in the original index, rather than to rely on the sort.
    followUps:
      - "How would you make an unstable sort behave stably?"
resources:
  - title: "Timsort — the original description"
    url: https://github.com/python/cpython/blob/main/Objects/listsort.txt
---

## The floor

```text
  n = 8 elements → 8! = 40,320 possible orderings.

  Each comparison answers one yes/no question, so it can at best
  halve the set of candidate orderings.

    after 1 comparison:  20,160 possible
    after 2:             10,080
    ...
    after k:             40,320 / 2^k

  To get to 1, you need 2^k >= 40,320, so k >= log2(40,320) ≈ 15.3.

  In general: k >= log2(n!) = Θ(n log n).

  This is a bound on INFORMATION, not on implementation. No amount
  of cleverness escapes it while the only primitive is "is a < b".
```

:::what
A **comparison sort** orders elements using only pairwise comparisons. **Stability** means
elements that compare equal keep their original relative order. **In-place** means O(1) or
O(log n) extra space. The three properties — time, stability, space — are what distinguish the
algorithms, because they all achieve the same asymptotic time.
:::

:::why
Knowing the floor exists changes how you respond to "can we sort this faster".

If someone proposes a faster comparison sort, the answer is no — not "probably not", but *no*,
with a proof. That saves time. But the proof also tells you exactly where the escape hatch is:
it assumes comparison is the only operation available. So the productive question is never "a
better sort" but "is there information about the data we are not using".

And usually there is. If the values are small integers, counting sort uses them as array
indices and runs in O(n). If the data is nearly sorted, Timsort finds the existing runs and
runs in O(n). If you only need the top ten, a heap gives O(n log k) and you never sort the rest.
If the data is already sorted by a related key, stability lets you refine rather than redo.

So the lower bound is not a disappointing fact to memorise. It is the thing that redirects you
from optimising the algorithm to examining the input, which is where the real wins are.
:::

:::how
```text
  MERGESORT — divide, sort, merge

    [5, 2, 8, 1]
      ├── [5, 2]  →  [2, 5]
      └── [8, 1]  →  [1, 8]
    merge [2,5] and [1,8] with two pointers → [1, 2, 5, 8]

    log n levels, O(n) merging per level → O(n log n), always.
    The merge needs somewhere to write, hence O(n) space.
    Stable, if the merge prefers the LEFT side on ties.

  QUICKSORT — partition, then recurse

    [5, 2, 8, 1, 9, 3]   pivot = 5
    partition → [2, 1, 3] 5 [8, 9]
                 ↑ all < 5    ↑ all > 5

    The pivot is now in its FINAL position. Recurse on each side.
    No merge step, so no extra array — hence in place.

    Good pivot: halves each time         → O(n log n)
    Bad pivot: smallest every time       → O(n²)

      [1,2,3,4,5] with pivot = first element:
        partition → [] 1 [2,3,4,5]      removed one element
        partition → [] 2 [3,4,5]        removed one element
        ...n levels, O(n) work each → O(n²)

    Already-sorted input with a naive pivot is the worst case, which
    is the same unpleasant coincidence as a BST built from sorted
    input.

  THE FIX, and why "random pivot" is not the whole story

    - median-of-three: pivot = median(first, middle, last). Cheap,
      handles sorted and reverse-sorted input, still has adversarial
      cases. Note "median" literally: ordering the three and then
      pivoting on the LAST of them pivots on the maximum, which is
      the quadratic case you were trying to avoid. Measured below.
    - three-way partitioning: equal elements land in a middle band
      and are never recursed into. Median-of-three does nothing for
      duplicate-heavy input; this is what fixes it.
    - random pivot: expected O(n log n) regardless of input, and an
      attacker who can see your random numbers can still defeat it.
    - introsort: count recursion depth; past ~2 log n, switch to
      heapsort. Keeps quicksort's speed and gets a HARD O(n log n)
      bound. This is what C++ std::sort does.

  HEAPSORT — heapify, then extract n times

    O(n) heapify + n × O(log n) extract = O(n log n) guaranteed,
    in place, NOT stable, and poor cache locality because sift-down
    jumps around the array. Rarely the fastest; valuable as
    introsort's guaranteed fallback.
```
:::

:::example
```ruby
# 1. Mergesort — note the `<=`, which is what makes it stable.
def merge_sort(a)
  return a if a.size <= 1
  mid = a.size / 2
  left = merge_sort(a[0...mid])
  right = merge_sort(a[mid..])

  out = []
  i = j = 0
  while i < left.size && j < right.size
    # `<=` takes from the LEFT on a tie, preserving the input order.
    # `<` here would reverse equal elements and break stability.
    if left[i] <= right[j]
      out << left[i]
      i += 1
    else
      out << right[j]
      j += 1
    end
  end
  out.concat(left[i..], right[j..])   # whichever side is left over
end

merge_sort([5, 2, 9, 1, 5, 6])   # => [1, 2, 5, 5, 6, 9]

# `left[i..]` when i == left.size gives [], not nil, so the tail
# concat needs no guard — one of the places Ruby's slicing is kinder
# than it looks.

# 2. Quicksort, in place, with median-of-three and tail-call
#    elimination on the larger side.
def quick_sort(a, lo = 0, hi = a.size - 1)
  while lo < hi
    p = partition(a, lo, hi)
    # Recurse on the SMALLER side, loop on the larger: bounds stack
    # depth to O(log n) even when the partition is poor.
    if p - lo < hi - p
      quick_sort(a, lo, p - 1)
      lo = p + 1
    else
      quick_sort(a, p + 1, hi)
      hi = p - 1
    end
  end
  a
end

def partition(a, lo, hi)
  mid = (lo + hi) / 2
  a[lo], a[mid] = a[mid], a[lo] if a[mid] < a[lo]
  a[lo], a[hi]  = a[hi], a[lo]  if a[hi] < a[lo]
  a[mid], a[hi] = a[hi], a[mid] if a[hi] < a[mid]
  # Those three swaps leave a[lo] <= a[mid] <= a[hi], so the MEDIAN is
  # now at mid — not at hi. This swap is what actually makes it
  # median-of-three; without it the pivot is the maximum of the three,
  # and sorted input is exactly quadratic. See the failure section.
  a[mid], a[hi] = a[hi], a[mid]
  pivot = a[hi]

  i = lo
  (lo...hi).each do |j|
    next unless a[j] < pivot
    a[i], a[j] = a[j], a[i]
    i += 1
  end
  a[i], a[hi] = a[hi], a[i]
  i
end

# 3. Making an unstable sort behave stably — decorate with the index.
def stable_sort_by(a, &key)
  a.each_with_index.sort_by { |v, i| [key.call(v), i] }.map(&:first)
end

rows = [
  { dept: 'eng', name: 'ann' },
  { dept: 'ops', name: 'bob' },
  { dept: 'eng', name: 'cid' },
]
stable_sort_by(rows) { |r| r[:dept] }.map { |r| r[:name] }
# => ["ann", "cid", "bob"]

# The `, i` in the sort key is the whole trick: ties are broken by
# original position, so the comparison becomes a total order and
# stability stops being the sort's responsibility. Ruby's array
# comparison does the rest — `[key, index] <=> [key, index]` compares
# element by element, so you get the tie-break for free.

# 4. Multi-key sorting, which is what stability is actually for.
#    In Ruby, prefer ONE pass on a tuple:
rows.sort_by { |r| [r[:dept], r[:name]] }

# ...rather than two passes relying on stability:
rows.sort_by! { |r| r[:name] }    # then
rows.sort_by! { |r| r[:dept] }    # ← needs a stable sort. Ruby's is not.
#
# In a language with a guaranteed-stable sort the two-pass form is
# legitimate, and it is what you want when the second sort happens
# later — a user clicking a column header. In Ruby that pattern is
# broken, so a column-header sort has to carry every key it has ever
# been sorted by, or decorate with the index as in 3.
```
:::

:::failure
**A comparator that is not a total order.** The single most damaging mistake here, because the
consequences are not what people expect:

```ruby
# A boolean comparator. Ruby raises rather than misordering:
arr.sort { |a, b| a.priority > b.priority }
# NoMethodError: undefined method '>' for true

# A Float comparator, which Ruby ACCEPTS. This is the silent one:
[3, 1, 2].sort { |a, b| (a - b) / 2.0 }   # => [1, 2, 3], fine by luck
[3, 1, 2].sort { rand - 0.5 }             # => garbage, and not a shuffle

# And Ruby does not detect an inconsistent comparator at all:
[5, 3, 1, 4, 2].sort { |a, b| ((a - b) % 3) - 1 }
# => [3, 5, 2, 1, 4]       no exception, not sorted
```

Three different outcomes worth separating. The boolean comparator raises, because Ruby will not
coerce `true` to a number — that bug costs you minutes. A Float result is accepted, since all
Ruby needs is something it can compare against zero, so `sort { rand - 0.5 }` silently returns a
badly-biased non-shuffle. And an inconsistent comparator produces a wrong answer with no
complaint: V8's Timsort can throw "Comparison function is not consistent", and C++ treats an
invalid comparator for `std::sort` as undefined behaviour that reads past the end of the array,
but Ruby just hands you the wrong array.

To shuffle, use `shuffle`, which is Fisher-Yates. `sort_by { rand }` is a correct-but-slower
shuffle — a random Schwartzian key is sound, each element gets one fixed key. `sort { rand - 0.5 }`
is neither: the comparator gives inconsistent answers about the same pair, so the distribution
is decided by the algorithm's access pattern rather than by chance. It is the same famously
biased non-shuffle as JavaScript's `sort(() => Math.random() - 0.5)`.

**Sorting numbers that are secretly strings.**

```ruby
[10, 9, 100].sort          # => [9, 10, 100]      numeric, as you want
%w[10 9 100].sort          # => ["10", "100", "9"]   lexicographic
%w[10 9 100].sort_by(&:to_i)   # => ["9", "10", "100"]
```

Ruby does not have JavaScript's "`sort()` is lexicographic by default" trap — `sort` on Integers
sorts numerically. The Ruby version of the trap is that your numbers are often *strings*: a
`params` value, a CSV column, an id read from a header. Those sort lexicographically and look
plausible until `"100"` turns up before `"9"`.

The same bug with a sharper edge, because the output looks almost right:

```ruby
%w[1.10.0 1.9.0 1.2.0].sort
# => ["1.10.0", "1.2.0", "1.9.0"]        1.10 before 1.2 before 1.9
%w[1.10.0 1.9.0 1.2.0].sort_by { |v| Gem::Version.new(v) }
# => ["1.2.0", "1.9.0", "1.10.0"]
```

`Gem::Version` is in the standard library, understands pre-release suffixes, and is the correct
answer for anything version-shaped. Reaching for it is cheaper than discovering the bug.

**Assuming stability where it is not guaranteed.** In Ruby it is not guaranteed for either
`sort` or `sort_by`, and the two behave differently in practice — measured on ruby 3.4.5:

```text
  Array#sort_by     stable up to 16 elements, NOT stable from 20 up.
                    At n = 20 the equal-key elements come back reversed.
  Array#sort        preserved input order on every case tested, from
                    8 to 10,000 elements.
```

Do not read that second line as a guarantee. It is an implementation detail of MRI's sort — the
small-partition insertion sort is stable, which is why `sort_by` holds below about sixteen
elements too — and nothing documents it. Code that depends on it is code that breaks on a Ruby
upgrade, on JRuby, or when your array crosses a size threshold. Make ties explicit.

Elsewhere: stable in Python, Java for objects, and JavaScript since ES2019. Unstable in C++
`std::sort` (use `std::stable_sort`), Java's primitive sort, and Go's `sort.Slice` (use
`sort.SliceStable`).

**Quicksort on sorted input with a naive pivot.** O(n²). This is a realistic input, not a
contrived one — and if the input is attacker-controlled it is a denial-of-service vector, which
is why hash-based and sort-based code paths both need randomisation.

**Median-of-three that pivots on the maximum.** The subtle version of the same bug, and worth
dwelling on because the code looks exactly right:

```ruby
a[lo], a[mid] = a[mid], a[lo] if a[mid] < a[lo]
a[lo], a[hi]  = a[hi], a[lo]  if a[hi] < a[lo]
a[mid], a[hi] = a[hi], a[mid] if a[hi] < a[mid]
pivot = a[hi]        # ← the MAXIMUM of the three, not the median
```

Those three swaps sort the three positions, so afterwards `a[lo] <= a[mid] <= a[hi]`. Taking
`a[hi]` therefore takes the largest. The median is at `mid`, and one more swap is needed to move
it into place. Measured comparison counts on already-sorted input:

```text
  n       pivot = max      pivot = median     n²/2
  200          19,900              1,153     20,000
  1,000       499,500              7,987    500,000
  4,000     7,998,000             39,917  8,000,000
```

Exactly n²/2 — the broken version removes one element per partition, which is the degenerate
case the technique exists to prevent. It is also *correct*, so every test passes.

What hides it is that random input barely notices: at n = 4,000 the two versions cost 55,664 and
46,183 comparisons. So the bug is invisible in a benchmark over shuffled data and catastrophic
on the sorted data you actually get from a database `ORDER BY`.

**Treating median-of-three as protection against duplicates.** It is not, and this is a separate
failure with a separate fix. Lomuto partitioning puts equal elements all on one side, so an array
of mostly-equal values splits off one element at a time:

```text
  all elements equal      Lomuto        three-way
  n = 1,000               499,500           1,000
  n = 4,000             7,998,000           4,000

  20,000 values, 10 distinct
                       20,085,244          59,645     ← 337× apart
```

Three-way partitioning (Dutch national flag) puts equals in a middle band and never recurses
into it, which makes all-equal input linear. The insurance is close to free: on 20,000 *distinct*
values the two cost 285,521 and 298,591 comparisons, about 5% more. Any sort that might see a
low-cardinality column — a status, a boolean, a category — wants it.

```ruby
def quick_sort3(a, lo = 0, hi = a.size - 1)
  return a if lo >= hi
  mid = (lo + hi) / 2
  a[lo], a[mid] = a[mid], a[lo] if a[mid] < a[lo]
  a[lo], a[hi]  = a[hi], a[lo]  if a[hi] < a[lo]
  a[mid], a[hi] = a[hi], a[mid] if a[hi] < a[mid]
  pivot = a[mid]

  lt = lo        # everything below lt is < pivot
  gt = hi        # everything above gt is > pivot
  i = lo
  while i <= gt
    case a[i] <=> pivot
    when -1 then a[lt], a[i] = a[i], a[lt]; lt += 1; i += 1
    when 1  then a[gt], a[i] = a[i], a[gt]; gt -= 1   # do NOT advance i
    else i += 1
    end
  end
  quick_sort3(a, lo, lt - 1)
  quick_sort3(a, gt + 1, hi)   # the band [lt..gt] is already final
  a
end
```

The one detail to get right: on the `> pivot` branch `i` does not advance, because the element
just swapped in from `gt` has not been examined yet. Advancing there is the classic way to get a
three-way partition that is subtly wrong.

**Sorting when you only need part of the answer.** Top-k is O(n log k) with a heap;
`nth_element` / quickselect finds the kth element in O(n) expected. Sorting everything to take
ten items is doing n log n work for an O(n) question.

**Sorting a linked list with an array algorithm.** Quicksort needs random access; a linked list
has none. Mergesort is the natural list sort, because merging only needs sequential access and
can be done by relinking with no extra space.

**Sorting in a loop.** `items.sort()` inside a loop over items is O(n² log n) and is almost
always a sign that the data should have been sorted once outside, or kept in a sorted structure.
:::

:::realworld
```text
// What your language actually uses — none of them are textbook.

  Python          Timsort. Merges existing ascending/descending runs,
                  with galloping merges and a minimum run length
                  topped up by insertion sort. O(n) on already-sorted
                  and nearly-sorted data, stable, O(n) space.

  Java            Timsort for objects (stable). Dual-pivot quicksort
                  for primitives (unstable, and stability is
                  meaningless for primitives since equal ints are
                  indistinguishable).

  Ruby            Quicksort (ruby_qsort) with insertion sort for
                  small partitions. NOT guaranteed stable for either
                  sort or sort_by, and no stable_sort exists —
                  decorate with the index instead. sort_by uses a
                  Schwartzian transform internally, computing each
                  key once, which is why it beats sort { } whenever
                  the key is expensive.

  JavaScript (V8) Timsort since 2018. Stable, as ES2019 requires.

  C++             Introsort for std::sort: quicksort, switching to
                  heapsort past a depth limit and to insertion sort
                  for small ranges. Unstable. std::stable_sort is a
                  separate, mergesort-based function.

  Rust            Timsort-derived for sort(); pattern-defeating
                  quicksort for sort_unstable().

  Go              Pattern-defeating quicksort for sort.Slice;
                  sort.SliceStable is separate.

  Postgres        Quicksort in memory; external merge sort when the
                  data exceeds work_mem, which is why raising
                  work_mem can change a query's plan and speed
                  dramatically.
```

```text
// The two ideas every production sort shares:

  1. SWITCH TO INSERTION SORT FOR SMALL ARRAYS (n < ~16).
     Insertion sort is O(n²) and has a tiny constant, no recursion
     overhead, and perfect locality. Below about 16 elements it beats
     everything asymptotically better. Every real implementation does
     this, and it is the clearest example of why asymptotic analysis
     is about growth rather than about which is faster today.

  2. EXPLOIT EXISTING ORDER.
     Real data is rarely random: log files are nearly sorted by time,
     a re-sorted table is nearly sorted already, appended records are
     in order. Timsort detects runs and merges them, so "sort a
     million rows that are already almost sorted" is closer to O(n)
     than O(n log n).
```

```text
// External sorting, which is how you sort more data than memory —
// and is the merge from mergesort, applied to files.
//
//   1. Read work_mem worth of rows, sort in memory, write a run file.
//   2. Repeat until the input is consumed. Now you have k sorted files.
//   3. Merge all k with a heap of the current heads. O(k) memory.
//
// This is Postgres's external sort, and the final phase of every LSM
// compaction. The heap-of-k-heads merge from the heaps lesson is the
// whole of step 3.
//
// The Rails-shaped version: when you reach for `Model.order(:x).to_a`
// over a large table you are asking Postgres to do step 1 and hoping
// it fits in work_mem. `EXPLAIN ANALYZE` tells you which happened —
// "Sort Method: quicksort Memory: 2048kB" means it fit, and
// "external merge Disk: 48MB" means it did not. The fix is almost
// never a better sort; it is an index that makes the sort
// unnecessary, or a smaller result set.
```
:::

:::mistakes
**An inconsistent or boolean comparator.** May throw, may be undefined behaviour, will not
sort.

**`sort { rand - 0.5 }` as a shuffle.** Biased, and an inconsistent comparator. Use `shuffle`.

**`.sort()` on numbers in JavaScript.** Lexicographic.

**`a - b` on strings or dates.** NaN, silently.

**Assuming your language's sort is stable.** Check. C++, Go and Java's primitive sorts are not.

**Naive-pivot quicksort on sorted input.** O(n², and a DoS vector if the input is untrusted.

**Sorting to find the top k.** Use a heap, or quickselect.

**Array algorithms on linked lists.** Mergesort is the one that fits.

**Re-sorting inside a loop.** Sort once, or keep a sorted structure.

**Ignoring that comparison is sometimes the expensive part.** Sorting by a computed key calls
that function O(n log n) times — `sort_by` / Schwartzian transform computes it n times instead,
which matters when the key requires work.
:::

:::tradeoffs
**Mergesort** — O(n log n) guaranteed, stable, O(n) space, sequential access only (so it works
on linked lists and on files larger than memory). The choice when you need a guarantee or
stability.

**Quicksort** — O(n log n) expected and O(n²) worst case, in place, unstable, best constant
factor and locality of the comparison sorts. The choice for raw speed on primitives, with a
pivot strategy.

**Heapsort** — O(n log n) guaranteed, in place, unstable, poor locality. Rarely fastest; its
role is as introsort's safety net, converting quicksort's worst case into a guarantee.

**Insertion sort** — O(n²), stable, in place, and the fastest option below roughly 16 elements
or on nearly-sorted data. Every real sort uses it as a base case.

**Timsort** — stable, O(n) on nearly-sorted input, O(n log n) worst case, O(n) space, and
complex. The right default for real-world data, which is why Python, Java and JavaScript all
chose it.

**Introsort** — quicksort's speed with a hard O(n log n) bound, unstable. The right default when
stability is irrelevant.

**Not sorting at all** — a heap for top-k, quickselect for the kth element, a hash map for
grouping, or a sorted structure maintained incrementally. Frequently the best available answer,
and the one most often missed.

The decision in practice: **use your language's sort.** It is better than what you would write.
The judgement you actually need is whether you need stability, whether you need a worst-case
guarantee, and whether you need to sort at all.
:::

:::checkpoint
1. Reconstruct the n log n lower bound argument. What assumption does it rest on?
2. What makes quicksort O(n²), and why is that input realistic rather than contrived?
3. Three ways to avoid it, and which one gives a hard guarantee?
4. Why does `left[i] <= right[j]` rather than `<` make mergesort stable?
5. You need to sort by name within department, and the user may re-sort by clicking a header.
   Why does stability matter?
6. Why does every production sort switch to insertion sort for small inputs?
7. `sort { rand - 0.5 }` — what is wrong with it, and what should you use instead? Why does
   `sort_by { rand }` not have the same problem?
8. Ordering three positions and pivoting on the last of them: what does that actually pivot on,
   and what does it cost on sorted input?
9. Median-of-three does not help with duplicate-heavy input. What does, and what does it cost
   when there are no duplicates?
8. Sort a billion rows on a machine with 8 GB of RAM. Outline the approach.
:::

:::interview
Give the lower bound as a proof, not as a fact, because being able to derive it is the
difference between knowing and having read:

*"There are n! orderings and each comparison yields one bit, so it can at best halve the
candidate set. Distinguishing n! outcomes needs at least log₂(n!) comparisons, which is Θ(n log
n) by Stirling. It is an information bound, so no cleverness escapes it — but it assumes
comparison is the only operation, which is exactly the assumption counting and radix sort
violate by using values as indices."*

Then show the bound is useful rather than depressing:

*"Which means the productive question is never 'a faster sort' but 'what do we know about this
data that we are not using'. Small integer range — counting sort, O(n). Nearly sorted — Timsort
finds the runs and gets close to O(n). Only need the top ten — a heap, O(n log k), and you never
sort the rest."*

On quicksort versus mergesort, answer the question behind the question:

*"Quicksort is usually faster — in place, great locality, small constant — with an O(n²) worst
case that sorted input triggers under a naive pivot, which is realistic rather than contrived.
Mergesort is guaranteed and stable and costs O(n) space. In practice I use the language's sort,
which is neither: Timsort where stability is required, introsort where it is not. Introsort is
the interesting one — quicksort that counts recursion depth and switches to heapsort past about
2 log n, so it keeps quicksort's speed and converts the worst case into a hard bound."*

And one detail that signals you have read a real implementation: *"they all fall back to
insertion sort below about sixteen elements, because its constant factor beats everything
asymptotically better at that size — which is a good reminder that Big-O describes growth, not
which is faster today."*
:::

## What you now know

- The n log n floor is information-theoretic: n! outcomes, one bit per comparison.
- It assumes comparison is the only operation, which is where counting and radix sort escape.
- The useful response to the bound is to look for unused information about the input.
- Mergesort: guaranteed, stable, O(n) space, sequential access — works on lists and on files.
- Quicksort: in place, unstable, fastest constant, O(n²) on sorted input with a naive pivot.
- Median-of-three, random pivots, and introsort's depth limit; only the last is a guarantee.
- `<=` in the merge is what makes mergesort stable.
- Stability is what makes multi-pass multi-key sorting work.
- Decorate with the original index to make any sort behave stably.
- An inconsistent comparator may throw or be undefined behaviour, not merely produce disorder.
- `sort { rand - 0.5 }` is a biased non-shuffle; use `shuffle`. `sort_by { rand }` is sound.
- Ruby guarantees stability for neither `sort` nor `sort_by`; `sort_by` breaks visibly from ~20
  elements. Sort on `[key, index]` instead of relying on it.
- A boolean comparator raises in Ruby; a Float one is accepted; an inconsistent one is silent.
- "Median-of-three" means moving the median into the pivot slot. Ordering the three and taking
  the last one pivots on the maximum and is exactly n²/2 on sorted input.
- Lomuto partitioning is quadratic on duplicate-heavy input; three-way partitioning makes it
  linear and costs about 5% when there are no duplicates.
- Numbers held as strings sort lexicographically; use `sort_by(&:to_i)` or `Gem::Version`.
- Every production sort falls back to insertion sort for small inputs.
- Timsort exploits existing runs, so nearly-sorted real data approaches O(n).
- External merge sort handles data larger than memory, using a heap of k run heads.
- Often the best answer is not to sort: heap for top-k, quickselect for the kth element.
