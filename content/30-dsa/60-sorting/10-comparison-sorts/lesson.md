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
      re-sorting by one column should not reshuffle rows that tie. JavaScript's `Array#sort` is
      required to be stable since ES2019; before that it was implementation-defined and V8 used
      an unstable sort for short arrays.
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
      cases.
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
```js
// 1. Mergesort — note the `<=`, which is what makes it stable.
function mergeSort(a) {
  if (a.length <= 1) return a;
  const mid = a.length >> 1;
  const left = mergeSort(a.slice(0, mid));
  const right = mergeSort(a.slice(mid));

  const out = [];
  let i = 0, j = 0;
  while (i < left.length && j < right.length) {
    out.push(left[i] <= right[j] ? left[i++] : right[j++]);
    //              ^^ `<` here would break stability: on a tie it
    //                 would take from the right, reversing equals.
  }
  while (i < left.length) out.push(left[i++]);
  while (j < right.length) out.push(right[j++]);
  return out;
}

// 2. Quicksort, in place, with median-of-three and tail-call
//    elimination on the larger side.
function quickSort(a, lo = 0, hi = a.length - 1) {
  while (lo < hi) {
    const p = partition(a, lo, hi);
    // Recurse on the SMALLER side, loop on the larger: bounds stack
    // depth to O(log n) even when the partition is poor.
    if (p - lo < hi - p) { quickSort(a, lo, p - 1); lo = p + 1; }
    else { quickSort(a, p + 1, hi); hi = p - 1; }
  }
  return a;
}

function partition(a, lo, hi) {
  // median-of-three, moved to hi as the pivot
  const mid = (lo + hi) >> 1;
  if (a[mid] < a[lo]) [a[lo], a[mid]] = [a[mid], a[lo]];
  if (a[hi] < a[lo]) [a[lo], a[hi]] = [a[hi], a[lo]];
  if (a[hi] < a[mid]) [a[mid], a[hi]] = [a[hi], a[mid]];
  const pivot = a[hi];

  let i = lo;
  for (let j = lo; j < hi; j++) {
    if (a[j] < pivot) { [a[i], a[j]] = [a[j], a[i]]; i++; }
  }
  [a[i], a[hi]] = [a[hi], a[i]];
  return i;
}

// 3. Making an unstable sort behave stably — decorate with the index.
function stableSortBy(a, key) {
  return a
    .map((v, i) => [v, i])
    .sort((x, y) => key(x[0]) - key(y[0]) || x[1] - y[1])   // index tie-break
    .map(([v]) => v);
}
// The `|| x[1] - y[1]` is the whole trick: ties are broken by
// original position, so the comparator becomes a total order and
// stability is no longer the sort's responsibility.

// 4. Multi-key sorting, which is what stability is actually for.
//    Two passes, least significant first:
rows.sort((a, b) => a.name.localeCompare(b.name));     // then
rows.sort((a, b) => a.dept.localeCompare(b.dept));
// Within each department, names remain sorted — but only because the
// sort is stable. One comparator doing both is clearer when you
// control it; the two-pass form matters when the second sort is
// triggered later by a user clicking a column header.
```
:::

:::failure
**A comparator that is not a total order.** The single most damaging mistake here, because the
consequences are not what people expect:

```js
// Not transitive, and not consistent.
arr.sort((a, b) => a.priority > b.priority);     // boolean: 0 or 1, never -1
arr.sort(() => Math.random() - 0.5);             // not a shuffle
// An inconsistent comparator does not merely produce an unsorted
// result. V8's Timsort can throw "Comparison function is not
// consistent", and in C++ an invalid comparator for std::sort is
// undefined behaviour that reads past the end of the array.
```

And the random one deserves spelling out: `sort(() => Math.random() - 0.5)` is a famously
biased shuffle, not a uniform one, because the comparator's results are inconsistent and the
algorithm's access pattern determines the distribution. Use Fisher-Yates.

**Numeric sort without a comparator in JavaScript.**

```js
[10, 9, 100].sort()        // [10, 100, 9] — lexicographic by default
[10, 9, 100].sort((a, b) => a - b)   // [9, 10, 100]
```

**`a - b` on non-numbers.** `"b" - "a"` is NaN, and every comparison with NaN is false, so the
sort silently stops ordering. Use `localeCompare` for strings, and explicit comparisons for
BigInt or Date.

**Assuming stability where it is not guaranteed.** Stable: JS since ES2019, Python's sort, Java
for objects, Ruby's `sort_by`... actually Ruby's `sort` and `sort_by` are *not* guaranteed
stable. Unstable: C++ `std::sort` (use `std::stable_sort`), Java's primitive sort, Go's
`sort.Slice` (use `sort.SliceStable`). Check your language rather than assuming.

**Quicksort on sorted input with a naive pivot.** O(n²). This is a realistic input, not a
contrived one — and if the input is attacker-controlled it is a denial-of-service vector, which
is why hash-based and sort-based code paths both need randomisation.

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

```js
// External sorting, which is how you sort more data than memory —
// and is the merge from mergesort, applied to files.
//
//   1. Read work_mem worth of rows, sort in memory, write a run file.
//   2. Repeat until the input is consumed. Now you have k sorted files.
//   3. Merge all k with a heap of the current heads. O(k) memory.
//
// This is Postgres's external sort, Hadoop's shuffle, and the final
// phase of every LSM compaction. The heap-of-k-heads merge from the
// heaps lesson is the whole of step 3.
```
:::

:::mistakes
**An inconsistent or boolean comparator.** May throw, may be undefined behaviour, will not
sort.

**`sort(() => Math.random() - 0.5)` as a shuffle.** Biased. Use Fisher-Yates.

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
7. `sort(() => Math.random() - 0.5)` — what is wrong with it, and what should you use?
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
- `sort(() => Math.random() - 0.5)` is a biased shuffle; use Fisher-Yates.
- Every production sort falls back to insertion sort for small inputs.
- Timsort exploits existing runs, so nearly-sorted real data approaches O(n).
- External merge sort handles data larger than memory, using a heap of k run heads.
- Often the best answer is not to sort: heap for top-k, quickselect for the kth element.
