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

  parent(i) = (i - 1) / 2        # integer division, which floors
  left(i)   = 2i + 1
  right(i)  = 2i + 2

  Ruby's `/` on two Integers already floors, so there is no Math.floor
  and no `>> 1` needed — though `(i - 1) >> 1` is valid Ruby and
  identical for every i >= 0.

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
```ruby
# A complete min-heap, array-backed. Short enough to be worth reading,
# which matters more in Ruby than elsewhere: there is nothing in the
# standard library to use instead.
class MinHeap
  # Passing values in heapifies them bottom-up in O(n). Passing none
  # builds an empty heap, because the downto loop simply does not run.
  # One constructor covers both, so there is no separate `heapify`.
  def initialize(values = [], &cmp)
    @cmp = cmp || ->(x, y) { x <=> y }
    @a = values.dup
    ((@a.size / 2) - 1).downto(0) { |i| sift_down(i) }
  end

  def size = @a.size
  def empty? = @a.empty?
  def peek = @a.first                        # O(1), and nil when empty

  def push(value)
    @a << value
    i = @a.size - 1
    while i.positive?
      parent = (i - 1) / 2
      break if @cmp.call(@a[i], @a[parent]) >= 0
      @a[i], @a[parent] = @a[parent], @a[i]  # parallel assignment: no temp
      i = parent
    end
    self                                     # so pushes can chain
  end

  def pop
    return nil if @a.empty?
    top = @a[0]
    last = @a.pop                            # the LAST element, to stay complete
    unless @a.empty?
      @a[0] = last
      sift_down(0)
    end
    top
  end

  # For inspection only. The array is NOT sorted.
  def to_a = @a.dup

  private

  def sift_down(i)
    loop do
      l = (2 * i) + 1
      r = l + 1
      m = i
      m = l if l < @a.size && @cmp.call(@a[l], @a[m]).negative?
      m = r if r < @a.size && @cmp.call(@a[r], @a[m]).negative?
      break if m == i
      @a[i], @a[m] = @a[m], @a[i]
      i = m
    end
  end
end

heap = MinHeap.new
[5, 3, 8, 1, 9, 2].each { |v| heap.push(v) }
heap.peek                             # => 1
Array.new(heap.size) { heap.pop }     # => [1, 2, 3, 5, 8, 9]

MinHeap.new([5, 1, 3, 2, 4]).peek     # => 1, built in O(n)

# A max-heap is the same class with the comparison reversed — no second
# implementation, and no negating your values the way Python's heapq
# forces you to:
MinHeap.new([1, 5, 3]) { |x, y| y <=> x }.peek   # => 5
```

Three Ruby details are doing real work here.

The comparator defaults to `->(x, y) { x <=> y }` rather than `x - y`. Subtraction only works
for numbers; `<=>` is the protocol every comparable object in Ruby already implements, so this
heap orders strings, `Time`s, `Comparable` models and anything with a `<=>` without changing a
line. The cost is that `<=>` can return `nil`, which is the subject of the failure section.

`@a[i], @a[parent] = @a[parent], @a[i]` is a parallel assignment: the right-hand side is
evaluated first, so the swap needs no temporary. It is also the one place where this code is
genuinely shorter than its equivalent elsewhere.

`Array.new(heap.size) { heap.pop }` drains the heap in sorted order — and it works because
`Array.new` evaluates the size once, before the block runs. That is heapsort, at O(n log n),
and it is the *only* ordered way to read a heap.

```ruby
# Top-k, which is the pattern worth memorising.
def top_k(nums, k)
  heap = MinHeap.new
  nums.each do |n|
    heap.push(n)
    heap.pop if heap.size > k        # evict the weakest survivor
  end
  Array.new(heap.size) { heap.pop }  # ascending
end

top_k([5, 1, 9, 3, 14, 7, 2], 3)   # => [7, 9, 14]
top_k([2, 1], 5)                   # => [1, 2]   fewer than k is fine
top_k([], 3)                       # => []

# A MIN-heap to find the LARGEST. The root is the smallest of the k
# kept so far, which is exactly the candidate to discard. This
# inversion is the part people get wrong, and it is worth saying
# out loud when explaining it.
#
# O(n log k) time, O(k) space, works on a stream.
#
# The Ruby shortcut, for when n is small enough to hold:
#   nums.max(3)        # => [14, 9, 7]
# `Enumerable#max(n)` and `min(n)` do exactly this internally, and they
# are the right answer in application code. Write the heap when the
# input is a stream you cannot materialise — a cursor, an IO, a
# `find_each` over a million rows — because `max(n)` needs the
# Enumerable and the heap needs only one element at a time.
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

```ruby
MinHeap.new([5, 1, 3, 2, 4]).to_a
# => [1, 2, 3, 5, 4]
#
# The minimum is at the front and the rest is not sorted. Iterating the
# array gives nonsense, and the bug is subtle precisely because the
# first element is always right. The only valid way to read a heap in
# order is to pop repeatedly, which is O(n log n) — i.e. heapsort.
#
# This is also why `to_a` above is marked "for inspection only", and why
# a heap class should not define `each` or include Enumerable: doing so
# invites `heap.first(3)`, `heap.sort` and `heap.map`, all of which
# would read the raw array and all of which would be wrong.
```

**Mutating a key while the item is in the heap.** The element is now in the wrong position and
the invariant is broken with no error. Either remove and reinsert, or use a heap with a
`decrease-key` operation plus an index map — which is what Dijkstra needs.

**Comparator returning a boolean.** This is the classic version of the bug, and Ruby does not
have it:

```ruby
MinHeap.new { |x, y| x < y }.push(1).push(2)
# NoMethodError: undefined method '>=' for false

[3, 1, 2].sort { |x, y| x < y }
# NoMethodError: undefined method '>' for true
```

In a language where `false` coerces to `0`, a boolean comparator reads as "always equal" and
the heap silently stops ordering. Ruby has no such coercion, so the first comparison raises and
you find out immediately — including inside `Array#sort`, which is the same protocol. Write
`<=>` and the problem does not arise.

**Comparing things that are not comparable.** This is the Ruby-shaped version of the same
family, and it is also loud:

```ruby
1 <=> 'a'                 # => nil        not an exception, just nil
[1, 'a'].sort             # ArgumentError: comparison of Integer with String failed
Float::NAN <=> 1.0        # => nil
MinHeap.new([1.0, Float::NAN, 2.0])
# NoMethodError: undefined method 'negative?' for nil
```

`<=>` returns `nil` for operands it cannot order, and every structure built on it then fails on
that `nil` rather than guessing. So `NaN` in a heap raises instead of quietly disabling the
ordering. That is Ruby's three-way protocol earning its keep: the design that looks like extra
ceremony is what converts a silent data corruption into a stack trace.

**The one that *is* silent in Ruby: an inconsistent `<=>`.** If your comparison is not a total
order, nothing raises and the answer is simply wrong:

```ruby
[3, 1, 2].sort { |x, y| ((x - y) % 3) - 1 }
# => [3, 2, 1]        no error, no warning, not sorted
```

A comparator must be consistent — if `a < b` and `b < c` then `a < c` — and nothing checks
this for you. The realistic way to write one by accident is a `<=>` that compares a subset of
fields, or one that mixes a comparison with a tie-break that disagrees with itself. When you
define `<=>` on a model, it is worth a test that sorts a shuffled array and checks the result,
because this is the failure mode no exception will catch.

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

```ruby
# Merging k sorted streams — the pattern worth internalising,
# because it generalises to data that does not fit in memory.
def merge_k(lists)
  heap = MinHeap.new { |x, y| x[0] <=> y[0] }
  lists.each_with_index { |list, i| heap.push([list[0], i, 0]) unless list.empty? }

  out = []
  until heap.empty?
    value, i, j = heap.pop               # destructuring the triple
    out << value
    heap.push([lists[i][j + 1], i, j + 1]) if j + 1 < lists[i].size
  end
  out
end

merge_k([[1, 4, 7], [2, 5, 8], [3, 6, 9]])   # => [1, 2, 3, 4, 5, 6, 7, 8, 9]
merge_k([[1], [], [0, 2]])                   # => [0, 1, 2]

# The entry is a plain [value, list_index, position] array, destructured
# on the way out — cheaper than a Struct and clear enough at three
# fields. Past three, use a Struct; past that, you are hiding a bug.
#
# The heap holds at most k items regardless of total size, so memory
# is O(k) — which is exactly why external sort can merge 500 sorted
# files of a gigabyte each on a machine with 8 GB of RAM.
```

```text
// What the standard libraries give you, and what Ruby does not.

  Python  — heapq: functions over a plain list, min-heap only, so a
             max-heap means negating every value on the way in.
  Java    — PriorityQueue, with a Comparator.
  C++     — priority_queue (max-heap by default) and make_heap.
  Go      — container/heap, if you implement the interface.
  Ruby    — nothing. No Heap, no PriorityQueue, and no sorted map
             either. `SortedSet` was extracted from the `set` library
             in Ruby 3.0 and now needs the `sorted_set` gem.
  JS      — nothing, same.

  So in Ruby the forty lines above are not an exercise, they are the
  implementation. Which is the honest reason this lesson has you write
  one: a Rubyist who needs a priority queue either writes it, adds a
  gem, or — most often, and usually correctly — moves the ordering out
  of the process entirely:

    ORDER BY priority, created_at LIMIT 1    -- PostgreSQL's B-tree
    ZADD / ZPOPMIN                           -- Redis, a skip list
    Sidekiq queues                           -- already a priority
                                                 queue, consumed in
                                                 queue order

  `Enumerable#max(n)` and `min(n)` also cover a surprising share of
  real top-k needs, and they are implemented with a heap internally.
  Reach for your own heap when the data is a stream, when you need
  incremental pushes and pops interleaved, or when the priority changes
  while items are waiting.
```
:::

:::mistakes
**Max-heap for top-k largest.** Use a min-heap of size k.

**Promoting a child rather than the last element** on extract. Breaks completeness.

**Reading the array expecting sorted order.** The only ordered read is repeated popping.

**Mutating a key in place.** Remove and reinsert, or maintain an index for decrease-key.

**Boolean comparator.** Must return -1, 0 or 1. Ruby raises on the first comparison rather
than misordering, so this one costs you minutes, not a weekend.

**An inconsistent `<=>`.** The failure Ruby *cannot* catch for you. Test it by sorting a
shuffled array.

**Reaching for a heap before `max(n)`.** `Enumerable#max(n)` is already a heap, and it is one
line. Write your own when the input is a stream.

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
5. `MinHeap.new { |x, y| x < y }` — what goes wrong, and why does Ruby make it loud when
   most languages make it silent?
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
- Comparators return `<=>`'s three-way result, which works for any Comparable — not just
  numbers.
- A boolean comparator raises in Ruby instead of silently misordering; `<=>` returning `nil`
  raises too. An inconsistent `<=>` is the one silent failure left, so test it.
- Ruby ships no heap, no priority queue and no sorted map, so these forty lines are the
  implementation — but `Enumerable#max(n)`, a PostgreSQL `ORDER BY ... LIMIT` or a Redis sorted
  set is usually the better answer in a Rails application.
- Ties have no guaranteed order; add a sequence number if FIFO matters.
- Mutating a key in place breaks the invariant with no error.
- Two heaps give a running median; one cannot.
- If you need the whole order, sort. The heap wins when you pop only part of it.
