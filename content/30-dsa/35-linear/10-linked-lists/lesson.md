---
title: Linked lists
summary: O(1) insertion that is usually slower than an array's O(n) — why that is, and the pointer techniques worth knowing anyway.
level: basic
minutes: 18
version: "1"
status: stable
last_reviewed: "2026-10-07"
tags: [dsa, linked-lists, pointers, cache]
concepts: [linked-lists, pointer-manipulation, cache-locality, cycle-detection]
prerequisites: [big-o]
interview:
  - question: When would you choose a linked list over an array?
    level: basic
    answer: >-
      Rarely, and the honest answer is more interesting than the textbook one. The textbook
      case is O(1) insertion and deletion in the middle, but that assumes you already hold a
      pointer to the position — finding it is O(n), and an array's O(n) shift is a single
      contiguous memory move that modern CPUs do extremely fast. The cases where a linked list
      genuinely wins are when you hold node references and splice frequently, as in an LRU
      cache, when you need stable references that survive other insertions, and when you cannot
      tolerate the pause of reallocating and copying a large array.
    followUps:
      - "Why is the array faster despite the worse complexity?"
  - question: How do you detect a cycle in a linked list?
    level: basic
    answer: >-
      Floyd's algorithm: a slow pointer advancing one node and a fast pointer advancing two. If
      there is a cycle they must eventually meet, because once both are inside the loop the gap
      between them shrinks by one each step, so it reaches zero. If there is no cycle the fast
      pointer reaches the end. It is O(n) time and O(1) space, which is the advantage over a
      hash set of visited nodes — the set is also O(n) time but costs O(n) space.
    followUps:
      - "How do you find where the cycle starts?"
  - question: Why is reversing a linked list a standard interview question?
    level: basic
    answer: >-
      Because it cannot be done by pattern-matching: you must hold three pointers at once and
      understand why. You need `prev` to point the current node at, `curr` to operate on, and
      `next` saved before you overwrite `curr.next` — losing that reference detaches the rest
      of the list irrecoverably. It is the smallest problem that tests whether you can reason
      about aliasing rather than about an algorithm you have memorised.
    followUps:
      - "What is the recursive version, and what is its space cost?"
resources:
  - title: "CLRS — Introduction to Algorithms"
    url: https://mitpress.mit.edu/9780262046305/introduction-to-algorithms/
---

## The structure

```ruby
Node = Struct.new(:value, :next)

# 1 → 2 → 3 → nil
list = Node.new(1, Node.new(2, Node.new(3, nil)))

# Insert after a node you already hold: two assignments, no shifting.
def insert_after(node, value)
  node.next = Node.new(value, node.next)
end

# Delete the node after one you hold: one assignment.
def delete_after(node)
  node.next = node.next.next if node.next
end
```

:::what
A **linked list** stores each element in its own node, which holds a reference to the next.
There is no index arithmetic, so access is sequential: reaching position k costs k steps. A
**singly** linked list points forward only; a **doubly** linked list also points back, which
costs an extra reference per node and buys O(1) deletion given only the node.
:::

:::why
The structure exists because arrays have a fixed, contiguous layout, and that one property
causes three problems: inserting in the middle requires shifting everything after it, growing
requires allocating a new block and copying, and a reference to element 5 becomes a reference
to a different element the moment something is inserted before it.

A linked list solves all three. Insertion is local to the nodes involved, growth is one
allocation, and a node reference stays valid no matter what happens elsewhere in the list.

The reason you still reach for arrays almost always is cache locality, and it is worth being
precise about the magnitude. An array's elements sit together in memory, so one cache-line
fetch brings in the next several and sequential traversal is close to free. A linked list's
nodes are wherever the allocator put them, so each step is potentially a cache miss — around
100 nanoseconds against roughly 1 nanosecond for a hit. That is a factor of a hundred on the
constant, which is why shifting a thousand contiguous bytes often beats following a hundred
pointers, and why the complexity table is genuinely misleading here.

So learn linked lists for the pointer reasoning and for the specific places they appear —
LRU caches, allocator free lists, the chains in a hash table — not as a default sequence.
:::

:::how
```text
  REVERSING, which is the technique everything else builds on

    1 → 2 → 3 → null

    prev = null
    curr = 1

    step 1:  next = curr.next          (save 2 — or lose it forever)
             curr.next = prev          1 → null
             prev = curr               prev = 1
             curr = next               curr = 2

             null ← 1    2 → 3 → null

    step 2:  null ← 1 ← 2    3 → null
    step 3:  null ← 1 ← 2 ← 3
             curr = null → stop, return prev (= 3)

  WHY `next` MUST BE SAVED FIRST

    curr.next = prev     ← this OVERWRITES the only reference to the
                           rest of the list. Nothing else points at
                           node 2. It is unreachable, and in a
                           garbage-collected language it is collected.


  FLOYD'S CYCLE DETECTION

    slow moves 1, fast moves 2.

    1 → 2 → 3 → 4 → 5
                ↑       ↓
                └───────┘

    Once both are in the cycle, fast gains one position per step on
    slow. The gap is at most the cycle length, so it reaches zero in
    at most that many steps. They cannot "jump over" each other,
    because the gap decreases by exactly one.

  FINDING THE CYCLE'S START

    After they meet, reset slow to the head and advance BOTH by one.
    They meet at the entry point.

    Why: let L be the distance head→entry and C the cycle length.
    When they first meet, slow has travelled L + k and fast
    2(L + k), so the extra distance L + k is a whole number of
    cycles. Therefore walking L more steps from the head and L more
    from the meeting point both land on the entry.
```
:::

:::example
```ruby
# 1. Reverse, iteratively. O(n) time, O(1) space.
def reverse(head)
  prev = nil
  curr = head
  while curr
    following = curr.next    # save before overwriting
    curr.next = prev
    prev = curr
    curr = following
  end
  prev
end

# 2. Reverse, recursively. O(n) time, O(n) stack — which is the
#    reason to prefer the iterative form on long lists.
def reverse_rec(head)
  return head if head.nil? || head.next.nil?

  new_head = reverse_rec(head.next)
  head.next.next = head
  head.next = nil
  new_head
end

# 3. Floyd's cycle detection, and finding the entry.
def detect_cycle(head)
  slow = fast = head
  while fast&.next                 # &. so a nil tail ends the loop
    slow = slow.next
    fast = fast.next.next
    next unless slow.equal?(fast)  # equal? is identity, not ==

    slow = head
    until slow.equal?(fast)
      slow = slow.next
      fast = fast.next
    end
    return slow                    # the node where the cycle begins
  end
  nil
end

# 4. Middle node in one pass — the same two-speed trick.
def middle(head)
  slow = fast = head
  while fast&.next
    slow = slow.next
    fast = fast.next.next
  end
  slow                             # for even length, the second middle
end
```

Two Ruby details worth noticing. `fast&.next` replaces JavaScript's `fast && fast.next`,
so the guard that stops an even-length list walking off the end is one character. And the
comparison is `equal?`, not `==`: `equal?` asks "the same object", which is the question
cycle detection means. A `Struct` defines `==` by *value*, so two distinct nodes holding
the same number would compare equal and the loop would stop at the wrong place.
:::

:::failure
**Overwriting `next` before saving it.**

```ruby
while curr
  curr.next = prev    # the rest of the list is now unreachable
  prev = curr
  curr = curr.next    # this is `prev` — loops forever on one node
end
```

**Losing the head.** Any operation that may change the first node needs either a returned new
head or a sentinel:

```ruby
# A dummy head removes the "is it the first node" special case entirely.
def remove_all(head, target)
  dummy = Node.new(nil, head)
  node = dummy
  while node.next
    if node.next.value == target
      node.next = node.next.next
    else
      node = node.next
    end
  end
  dummy.next              # the real head, which may have changed
end
# Without the dummy you need a separate branch for removing the head,
# and that branch is where the bugs are.
```

**Advancing after deleting.**

```ruby
while node.next
  node.next = node.next.next if node.next.value == target
  node = node.next      # skips the node that just moved into place
end
# Two consecutive targets: the second survives. Only advance in the
# `else` branch.
```

**Not checking `fast.next` before `fast.next.next`.**

```ruby
while fast then fast = fast.next.next end   # NoMethodError on nil
while fast&.next                            # correct
```

**Assuming a cycle means the list is circular.** The cycle can begin anywhere. `detectCycle`
returns the entry node precisely because "there is a loop somewhere in the tail" is the
general case.

**Recursing on a long list.** `reverseRec` on 100,000 nodes overflows the stack in most
runtimes. The iterative version has no such limit, which is the practical argument for it.

**Treating indexed access as cheap.** `list[k]` does not exist; reaching position k is k
steps. A loop doing `get(i)` for every i is O(n²) — the linked-list version of the same
mistake as `string += x` in a loop.
:::

:::realworld
```ruby
# 1. An LRU cache. The classic implementation is a doubly linked list
#    plus a hash: the list gives O(1) move-to-front, the hash gives
#    O(1) lookup, and neither can do both alone. An Array cannot
#    move-to-front without shifting the rest; a hash has no ordering.
#
#    In Ruby you get the combination for free, because Hash is
#    insertion-ordered and `delete` followed by re-insert moves a key
#    to the end. So this is a complete LRU:
class LRU
  def initialize(capacity)
    @capacity = capacity
    @store = {}
  end

  def get(key)
    return nil unless @store.key?(key)

    @store[key] = @store.delete(key)   # delete + re-insert = move to end
  end

  def set(key, value)
    @store.delete(key)                 # so an update also refreshes position
    @store[key] = value
    @store.delete(@store.first.first) if @store.size > @capacity
    value
  end
end
# `@store.first.first` is the oldest key, because the oldest entry is
# the first one in insertion order.
#
# Worth being clear about what this does and does not demonstrate. It
# is a real LRU and it is the right thing to write in Ruby. But the
# linked list has not gone away — it moved into MRI's Hash, which
# maintains insertion order internally. Knowing the structure is still
# what lets you reason about the cost, and it is what you would
# implement in a language whose hash is unordered. This is also what
# Redis, Memcached and your CPU's cache do underneath.
```

```text
// 2. Where else they really appear.
//
//    Hash table chains — collisions in a bucket are a linked list,
//    which is why a hash table's worst case is O(n).
//
//    Memory allocators — the free list is a linked list threaded
//    through the free blocks themselves, costing zero extra memory.
//
//    Git's commit graph — each commit points at its parents. A
//    linked structure where nodes are immutable and content-addressed.
//
//    Blockchain — the same idea with the pointer being a hash.
//
//    Undo stacks and the DOM — sibling and parent pointers.
//
// And where they do NOT appear: as a general-purpose list. Ruby's
// Array, Python's list, Java's ArrayList and JS arrays are all
// dynamic arrays, because that is what is fast in practice.
```
:::

:::mistakes
**Choosing a linked list for O(1) insertion** without noticing that *finding* the position is
O(n), which dominates.

**Ignoring cache locality.** A cache miss is around 100× a hit. This is the main reason arrays
win in practice.

**Forgetting the dummy head.** It eliminates the head special case and therefore most of the
bugs.

**Advancing the cursor after a deletion.** Advance only when you did not delete.

**Missing the `fast.next` guard** in two-pointer traversals.

**Recursing on an unbounded list.** Stack overflow.

**Calling `get(i)` in a loop.** O(n²).

**Assuming a doubly linked list is strictly better.** It costs an extra pointer per node —
noticeable on millions of small nodes — and doubles the number of links you must keep
consistent, which is where the harder bugs come from.
:::

:::tradeoffs
**Array (dynamic array)** — O(1) indexed access, excellent cache locality, O(n) middle
insertion that is a single fast memory move, amortised O(1) append with occasional
reallocation pauses. The default, and correctly so.

**Singly linked list** — O(1) insertion and deletion *given a node*, O(n) to find anything,
poor locality, one pointer of overhead per element. Stable references are the real benefit.

**Doubly linked list** — adds O(1) deletion given only the node and backwards traversal, for
one more pointer per node and twice the links to keep consistent. Required for an LRU.

**Array plus index map** — often the better answer than a linked list when you need O(1)
lookup and ordering, as long as you can tolerate shifting or use tombstones.

The honest summary: a linked list is the right data structure when you **hold node
references and splice**, and the wrong one as a general sequence. When you catch yourself
wanting one, check whether you are really about to index into it — if so, you want an array.
:::

:::checkpoint
1. In `reverse`, what breaks if you do not save `curr.next` before overwriting it?
2. Why can an array's O(n) insertion beat a linked list's O(1)? Give the magnitude.
3. Why must Floyd's two pointers meet if a cycle exists? Why can they not step over each
   other?
4. After the pointers meet, how do you find the cycle's start, and why does it work?
5. What does a dummy head node eliminate?
6. `while (node.next) { if (match) node.next = node.next.next; node = node.next; }` — what
   input breaks this?
7. An LRU needs O(1) lookup *and* O(1) move-to-front. Which structure gives each, and which
   Ruby feature lets a single `Hash` supply both?
:::

:::interview
Answer the "when would you use one" question honestly, because the textbook answer is a
trap:

*"Rarely, as a general sequence. The usual justification is O(1) middle insertion, but that
assumes I already hold the position — finding it is O(n), and an array's O(n) shift is one
contiguous memory move that a CPU does extremely fast. The real factor is locality: a cache
miss is around 100 nanoseconds against about 1 for a hit, so following a hundred pointers can
cost more than shifting a thousand contiguous bytes. Where a linked list genuinely wins is when
I hold node references and splice — an LRU cache, an allocator free list — or when I need
references that stay valid as the structure changes."*

For reversal, name the three pointers and the reason, not the steps:

*"Three pointers: `prev`, `curr`, and `next` saved before I overwrite `curr.next`, because that
assignment destroys the only reference to the rest of the list. That is the whole difficulty —
it is a question about aliasing rather than about an algorithm."*

For cycle detection, give the proof, since that is what is being checked:

*"Floyd's: slow by one, fast by two, O(1) space. Once both are inside the cycle, fast gains
exactly one position per step, so the gap decreases by one each time and must reach zero — they
cannot step over each other. A hash set of visited nodes is also O(n) time but costs O(n) space,
which is the trade."*
:::

## What you now know

- A linked list trades indexed access for local insertion and stable references.
- Reaching position k is k steps; there is no index arithmetic.
- Reversal needs three pointers, and `next` must be saved before `curr.next` is overwritten.
- A dummy head node eliminates the "is it the first node" special case.
- Advance the cursor only when you did not delete.
- Floyd's cycle detection is O(n) time and O(1) space; the gap shrinks by one per step.
- After meeting, reset one pointer to the head and advance both by one to find the entry.
- Arrays usually win in practice: a cache miss is around 100× a hit.
- Doubly linked lists cost a pointer per node and twice the invariants.
- An LRU needs both structures: the list for O(1) move-to-front, the map for O(1) lookup.
- Real uses: hash table chains, allocator free lists, commit graphs, undo stacks.
- Every mainstream "list" type — Ruby Array, Python list, JS array — is a dynamic array.
