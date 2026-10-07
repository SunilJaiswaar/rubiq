---
title: Heaps and priority queues
summary: Getting the smallest item in O(1) and removing it in O(log n), without ever sorting the rest — and the array trick that makes it allocation-free.
level: intermediate
minutes: 17
version: "1"
status: stable
last_reviewed: "2026-10-07"
tags: [dsa, heaps, priority-queue, sorting, top-k]
concepts: [heaps, priority-queues, heapify, top-k]
prerequisites: [trees, big-o]
interview:
  - question: What is a heap and what does it guarantee?
    level: intermediate
    answer: >-
      A complete binary tree where every parent compares favourably to its children — in a
      min-heap, every parent is no larger than either child. That gives O(1) access to the
      minimum and O(log n) insertion and extraction. What it deliberately does not give you is
      any ordering beyond the root: the second-smallest element could be either child, and the
      rest is unordered. That weaker invariant is exactly why it is cheaper to maintain than a
      sorted structure, and why it is the right tool when you only ever need the extreme.
    followUps:
      - "How is it stored, and why does that matter?"
  - question: Find the k largest of a million numbers. How?
    level: intermediate
    answer: >-
      A min-heap of size k: push each element, and when the heap exceeds k, pop the minimum.
      What remains is the k largest, in O(n log k) time and O(k) space. Sorting everything is
      O(n log n) and O(n) space, so for k = 10 and n = a million the heap does about 3.3 million
      comparisons against 20 million — and more importantly it never holds more than 10
      elements, so it works on a stream that does not fit in memory. The counter-intuitive part
      is using a *min*-heap to find the largest: the root is the weakest survivor, which is
      precisely the one to evict.
    followUps:
      - "Why a min-heap rather than a max-heap?"
  - question: Why is heapify O(n) rather than O(n log n)?
    level: advanced
    answer: >-
      Because the work per node depends on its height, and almost all nodes are near the bottom
      where the height is small. Half the nodes are leaves and need no work at all, a quarter
      sift down at most one level, an eighth at most two — and the sum of n/2^(k+1) · k over all
      k converges to n. Building by repeated insertion is genuinely O(n log n), because each
      insertion sifts up from the bottom where the distance is largest. Same elements, same
      final structure, different direction of movement.
    followUps:
      - "So why does anyone build one by insertion?"
resources:
  - title: "CLRS — Chapter 6, Heapsort"
    url: https://mitpress.mit.edu/9780262046305/introduction-to-algorithms/
---

## The array trick

```text
  A complete binary tree needs no pointers at all.

         1
       /   \
      3     5          stored as:  [1, 3, 5, 4, 8, 7]
     / \   /                        0  1  2  3  4  5
    4   8 7

  parent(i) = (i - 1) >> 1
  left(i)   = 2i + 1
  right(i)  = 2i + 2

  No nodes, no allocation per element, perfect cache locality — the
  children of i are adjacent to each other, and a sift-down walks a
  contiguous-ish path. This is why a heap outperforms a pointer-based
  tree by a large constant factor.
```

:::what
A **heap** is a complete binary tree satisfying the heap property: in a min-heap every parent
is ≤ both children. A **priority queue** is the interface — insert, and remove the
highest-priority item — and a heap is its usual implementation. The tree is stored in an array
using index arithmetic, so there are no nodes.
:::

:::why
Sorting gives you total order, and most problems do not need it.

"Which job runs next" needs the minimum, repeatedly, from a collection that keeps changing. A
sorted array answers it in O(1) and costs O(n) per insertion because of shifting. A balanced
BST costs O(log n) for both, and maintains an ordering you never read. A heap maintains *only*
the property you use — the extreme is at the root — and nothing else.

That is the trade stated precisely: a heap gives up knowing anything about element 2 in order
to make insertion and extraction cheap. The second-smallest item is one of the root's two
children and the heap does not know which, because it never needed to.

The same logic explains the top-k result. Finding the ten largest of a million by sorting
computes the full order of 999,990 elements you will discard. A size-10 heap computes nothing
about them beyond "is this bigger than the weakest of my ten", which is one comparison each.
Doing less work is not a constant-factor saving here; it changes the complexity from
O(n log n) to O(n log k) and the space from O(n) to O(k).
:::

:::how
```text
  INSERT — sift up

    push to the end, then swap with the parent while it is smaller.

    [1, 3, 5, 4, 8, 7] insert 2

    [1, 3, 5, 4, 8, 7, 2]   2 at index 6, parent index 2 = 5
    2 < 5 → swap           [1, 3, 2, 4, 8, 7, 5]
    2 at index 2, parent index 0 = 1
    2 > 1 → stop

    At most log n swaps: one per level.

  EXTRACT-MIN — sift down

    the root is the answer. Move the LAST element to the root, shrink,
    then swap with the smaller child while it is larger.

    [1, 3, 2, 4, 8, 7, 5]   extract → 1
    move 5 to the root     [5, 3, 2, 4, 8, 7]
    children 3 and 2, smaller is 2 → swap
                           [2, 3, 5, 4, 8, 7]
    5 at index 2, child 7 → 5 < 7 → stop

    Moving the LAST element is what keeps the tree complete, which is
    what keeps the array dense. Any other choice leaves a hole.

  HEAPIFY — why building bottom-up is O(n)

    Sift down from the last parent backwards to the root.

      level     nodes      max sifts    work
      bottom    n/2        0            0        ← leaves: nothing
      -1        n/4        1            n/4
      -2        n/8        2            2n/8
      -3        n/16       3            3n/16
      ...
                                        total → n

    Σ (n / 2^(k+1)) · k  converges to n.

    Building by repeated INSERT is O(n log n): each insert sifts UP
    from the bottom, and most nodes ARE at the bottom, so most
    insertions pay the full log n.

    Bottom-up: most nodes have a short distance to fall.
    Top-down:  most nodes have a long distance to rise.
    Same elements. The direction is the whole difference.
```
:::

:::example
```js
// A complete min-heap, array-backed. Short enough to be worth reading.
class MinHeap {
  #a = [];
  #cmp;
  constructor(cmp = (x, y) => x - y) { this.#cmp = cmp; }

  get size() { return this.#a.length; }
  peek() { return this.#a[0]; }                 // O(1)

  push(v) {
    this.#a.push(v);
    let i = this.#a.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (this.#cmp(this.#a[i], this.#a[p]) >= 0) break;
      [this.#a[i], this.#a[p]] = [this.#a[p], this.#a[i]];
      i = p;
    }
  }

  pop() {
    if (this.#a.length === 0) return undefined;
    const top = this.#a[0];
    const last = this.#a.pop();
    if (this.#a.length) {
      this.#a[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1, r = l + 1;
        let m = i;
        if (l < this.#a.length && this.#cmp(this.#a[l], this.#a[m]) < 0) m = l;
        if (r < this.#a.length && this.#cmp(this.#a[r], this.#a[m]) < 0) m = r;
        if (m === i) break;
        [this.#a[i], this.#a[m]] = [this.#a[m], this.#a[i]];
        i = m;
      }
    }
    return top;
  }

  // O(n), not O(n log n) — see the analysis above.
  static heapify(values, cmp) {
    const h = new MinHeap(cmp);
    h.#a = values.slice();
    for (let i = (h.#a.length >> 1) - 1; i >= 0; i--) h.#siftDown(i);
    return h;
  }
}
```

```js
// Top-k, which is the pattern worth memorising.
function topK(nums, k) {
  const heap = new MinHeap();
  for (const n of nums) {
    heap.push(n);
    if (heap.size > k) heap.pop();   // evict the weakest survivor
  }
  return [...Array(heap.size)].map(() => heap.pop());
}
// A MIN-heap to find the LARGEST. The root is the smallest of the k
// kept so far, which is exactly the candidate to discard. This
// inversion is the part people get wrong, and it is worth saying
// out loud when explaining it.
//
// O(n log k) time, O(k) space, works on a stream.
```
:::

:::failure
**Using a max-heap for top-k.** It gives you the largest immediately and no cheap way to find
the weakest of your k, so you cannot evict. The heap grows to n and you have reimplemented
sorting badly.

**Moving the wrong element to the root on extract.** Promoting a child instead of the last
element leaves a hole, so the tree is no longer complete and the index arithmetic breaks — and
it breaks silently, producing a structure that is still array-shaped and no longer a heap.

**Expecting any order beyond the root.**

```js
const h = MinHeap.heapify([5, 1, 3, 2, 4]);
// The internal array is NOT sorted, and iterating it gives nonsense.
// The only valid way to read a heap in order is to pop repeatedly,
// which is O(n log n) — i.e. heapsort.
```

**Mutating a key while the item is in the heap.** The element is now in the wrong position and
the invariant is broken with no error. Either remove and reinsert, or use a heap with a
`decrease-key` operation plus an index map — which is what Dijkstra needs.

**Comparator returning a boolean.**

```js
new MinHeap((a, b) => a < b);     // true/false, not -1/0/1
// `false` coerces to 0 ("equal"), so the heap silently stops ordering.
new MinHeap((a, b) => a - b);     // correct for numbers
```

**Using `a - b` on strings or large integers.** `"b" - "a"` is NaN, and NaN comparisons are
all false, so the heap quietly degenerates. Use an explicit comparison.

**Unstable ordering for equal priorities.** A heap gives no guarantee about ties, so two jobs
with the same priority can emerge in any order — and the order can differ between runs. If
FIFO-within-priority matters, include an insertion sequence number in the comparison.

**Building with n inserts when you have all the data.** O(n log n) instead of O(n). Heapify.
:::

:::realworld
```text
// Where priority queues are load-bearing.

  Dijkstra and A*           — "closest unvisited node next" is the
                               algorithm. With a binary heap,
                               O((V + E) log V).
  OS schedulers             — run queues ordered by priority.
  Event simulation          — the next event by timestamp; the whole
                               simulation loop is pop-process-push.
  Job queues with priority  — Sidekiq priority queues, cron-style
                               "next due task".
  Timer wheels / timeouts   — the earliest deadline is the root.
  Merging k sorted streams  — a heap of the k current heads. This is
                               how LSM compaction and external merge
                               sort work on data larger than memory.
  Median maintenance        — two heaps, a max-heap for the lower
                               half and a min-heap for the upper,
                               kept within one element of each other.
  Huffman coding            — repeatedly merge the two least frequent.
  Rate limiting / leaky     — earliest expiry at the root.
  buckets
```

```js
// Merging k sorted streams — the pattern worth internalising,
// because it generalises to data that does not fit in memory.
function mergeK(lists) {
  const h = new MinHeap((a, b) => a.value - b.value);
  lists.forEach((list, i) => { if (list.length) h.push({ value: list[0], i, j: 0 }); });

  const out = [];
  while (h.size) {
    const { value, i, j } = h.pop();
    out.push(value);
    if (j + 1 < lists[i].length) h.push({ value: lists[i][j + 1], i, j: j + 1 });
  }
  return out;
}
// The heap holds at most k items regardless of total size, so memory
// is O(k) — which is exactly why external sort can merge 500 sorted
// files of a gigabyte each on a machine with 8 GB of RAM.
```

```text
// A note on what the standard libraries give you:
//   Python  — heapq (functions over a list, min-heap only; negate
//              values for a max-heap)
//   Java    — PriorityQueue
//   C++     — priority_queue (max-heap by default), make_heap
//   Ruby    — nothing built in; use a gem or write the 40 lines
//   JS      — nothing built in; same
// The absence in Ruby and JS is why the implementation above is
// worth being able to write from memory.
```
:::

:::mistakes
**Max-heap for top-k largest.** Use a min-heap of size k.

**Promoting a child rather than the last element** on extract. Breaks completeness.

**Reading the array expecting sorted order.** The only ordered read is repeated popping.

**Mutating a key in place.** Remove and reinsert, or maintain an index for decrease-key.

**Boolean comparator.** Must return a number.

**`a - b` on non-numbers.** NaN silently disables ordering.

**Assuming ties are FIFO.** Add a sequence number if it matters.

**n inserts instead of heapify** when the data is already available.

**Reaching for a heap when you need the whole order.** If you will pop everything anyway, that
is heapsort at O(n log n) — the same as sorting, with worse constants and worse locality than a
good sort. The heap wins when you pop *some* of it.
:::

:::tradeoffs
**Sorted array** — O(1) minimum, O(n) insertion. Right when the collection is built once and
then only read.

**Binary heap** — O(1) peek, O(log n) push and pop, O(n) build, array-backed with excellent
locality and no per-element allocation. The default priority queue.

**Balanced BST** — O(log n) for everything plus ordered iteration and range queries, at the
cost of pointers, allocation and worse locality. Right when you need more than the extreme.

**Fibonacci heap** — O(1) amortised decrease-key, which improves Dijkstra's theoretical bound
to O(E + V log V). Constant factors are bad enough that binary heaps usually win in practice;
worth knowing as the standard example of a structure that is theoretically better and
practically not.

**Two heaps** — running median in O(log n) per element, which no single structure gives you.

**Full sort** — the right answer when you genuinely need everything in order, or when k
approaches n and the heap's advantage disappears.

The question to ask: **how much of the order do you actually need?** All of it → sort. Just the
extreme, repeatedly → heap. The extreme plus ranges and neighbours → ordered tree. Choosing the
structure that knows the least while still answering your question is the general principle,
and the heap is its clearest illustration.
:::

:::checkpoint
1. Give the three index formulas for an array-backed heap, and say what they save.
2. Why is heapify O(n) while building by repeated insertion is O(n log n)? Both end with the
   same structure.
3. Top-10 of a million numbers: why a *min*-heap, and what are the time and space costs
   against sorting?
4. On extract-min, why move the last element to the root rather than promoting the smaller
   child?
5. `new MinHeap((a, b) => a < b)` — what goes wrong and why is it silent?
6. Two jobs are pushed with equal priority. Which comes out first?
7. You need a running median of a stream. What structure, and why can one heap not do it?
:::

:::interview
Define it by the invariant it *does not* maintain, which is the insight:

*"A heap is a complete binary tree where every parent compares favourably to its children, so
the extreme is at the root in O(1) and push and pop are O(log n). What it deliberately does not
know is anything beyond the root — the second-smallest is one of two children and it does not
know which. That weaker invariant is exactly why it is cheaper than a sorted structure, and it
is stored in a flat array with index arithmetic, so there is no allocation per element and the
locality is excellent."*

The top-k answer should include the inversion, because stating it unprompted shows you have
actually used this:

*"A min-heap of size k. Push each element and pop whenever the size exceeds k, so what remains
is the k largest — O(n log k) time, O(k) space, and it works on a stream that does not fit in
memory. The part worth saying explicitly is that it is a min-heap to find the largest: the root
is the weakest of the k I have kept, which is precisely the one to evict. A max-heap gives me the
largest instantly and no cheap way to find the weakest, so I could not evict and the heap would
grow to n."*

And heapify, if it comes up, is a nice piece of reasoning to be able to produce:

*"Bottom-up heapify is O(n) because the work per node is its height, and almost all nodes are
near the bottom — half are leaves and do nothing. The sum converges to n. Building by insertion
is O(n log n) because each insert sifts upward from the bottom, and most nodes are at the bottom,
so most insertions pay the full depth. Same elements, same result, opposite direction of
movement."*
:::

## What you now know

- A heap is a complete binary tree stored in an array: `parent = (i-1)>>1`, `left = 2i+1`.
- The array form means no per-element allocation and strong cache locality.
- O(1) peek, O(log n) push and pop, O(n) heapify.
- It maintains only "the extreme is at the root" — nothing else is ordered.
- Extract moves the *last* element to the root to preserve completeness.
- Heapify is O(n) because work is proportional to height and most nodes are shallow.
- Building by insertion is O(n log n) — the movement goes the expensive direction.
- Top-k largest uses a *min*-heap of size k: O(n log k), O(k) space, stream-friendly.
- Comparators must return numbers; `a - b` on non-numbers gives NaN and silently breaks it.
- Ties have no guaranteed order; add a sequence number if FIFO matters.
- Mutating a key in place breaks the invariant with no error.
- Two heaps give a running median; one cannot.
- If you need the whole order, sort. The heap wins when you pop only part of it.
