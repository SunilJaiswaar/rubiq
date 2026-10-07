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

```js
class Node {
  constructor(value, next = null) { this.value = value; this.next = next; }
}

// 1 → 2 → 3 → null
const list = new Node(1, new Node(2, new Node(3)));

// Insert after a node you already hold: three assignments, no shifting.
function insertAfter(node, value) {
  node.next = new Node(value, node.next);
}

// Delete the node after one you hold: one assignment.
function deleteAfter(node) {
  if (node.next) node.next = node.next.next;
}
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
```js
// 1. Reverse, iteratively. O(n) time, O(1) space.
function reverse(head) {
  let prev = null, curr = head;
  while (curr) {
    const next = curr.next;   // save before overwriting
    curr.next = prev;
    prev = curr;
    curr = next;
  }
  return prev;
}

// 2. Reverse, recursively. O(n) time, O(n) stack — which is the
//    reason to prefer the iterative form on long lists.
function reverseRec(head) {
  if (!head || !head.next) return head;
  const newHead = reverseRec(head.next);
  head.next.next = head;
  head.next = null;
  return newHead;
}

// 3. Floyd's cycle detection, and finding the entry.
function detectCycle(head) {
  let slow = head, fast = head;
  while (fast && fast.next) {
    slow = slow.next;
    fast = fast.next.next;
    if (slow === fast) {
      slow = head;
      while (slow !== fast) { slow = slow.next; fast = fast.next; }
      return slow;                 // the node where the cycle begins
    }
  }
  return null;
}

// 4. Middle node in one pass — the same two-speed trick.
function middle(head) {
  let slow = head, fast = head;
  while (fast && fast.next) { slow = slow.next; fast = fast.next.next; }
  return slow;    // for even length, the second of the two middles
}
```
:::

:::failure
**Overwriting `next` before saving it.**

```js
while (curr) {
  curr.next = prev;      // the rest of the list is now unreachable
  prev = curr;
  curr = curr.next;      // this is `prev` — infinite loop on one node
}
```

**Losing the head.** Any operation that may change the first node needs either a returned new
head or a sentinel:

```js
// A dummy head removes the "is it the first node" special case entirely.
function removeAll(head, target) {
  const dummy = new Node(null, head);
  let node = dummy;
  while (node.next) {
    if (node.next.value === target) node.next = node.next.next;
    else node = node.next;
  }
  return dummy.next;      // the real head, which may have changed
}
// Without the dummy you need a separate branch for removing the head,
// and that branch is where the bugs are.
```

**Advancing after deleting.**

```js
while (node.next) {
  if (node.next.value === target) node.next = node.next.next;
  node = node.next;       // skips the node that just moved into place
}
// Two consecutive targets: the second survives. Only advance in the
// `else` branch.
```

**Not checking `fast.next` before `fast.next.next`.**

```js
while (fast) { fast = fast.next.next; }    // TypeError on an even-length list
while (fast && fast.next) { ... }          // correct
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
```js
// 1. An LRU cache — doubly linked list plus hash map. This is the one
//    place a linked list is unambiguously the right choice, and it is
//    worth understanding why.
class LRU {
  #map = new Map();          // key → node, for O(1) lookup
  #head = { };               // sentinels remove all the null checks
  #tail = { };
  #capacity;

  constructor(capacity) {
    this.#capacity = capacity;
    this.#head.next = this.#tail;
    this.#tail.prev = this.#head;
  }

  #remove(n) { n.prev.next = n.next; n.next.prev = n.prev; }
  #addFront(n) {
    n.next = this.#head.next; n.prev = this.#head;
    this.#head.next.prev = n; this.#head.next = n;
  }

  get(key) {
    const n = this.#map.get(key);
    if (!n) return undefined;
    this.#remove(n); this.#addFront(n);     // O(1) — the point of the list
    return n.value;
  }

  set(key, value) {
    if (this.#map.has(key)) this.#remove(this.#map.get(key));
    const n = { key, value };
    this.#addFront(n);
    this.#map.set(key, n);
    if (this.#map.size > this.#capacity) {
      const lru = this.#tail.prev;
      this.#remove(lru);
      this.#map.delete(lru.key);
    }
  }
}
// The list gives O(1) move-to-front; the map gives O(1) lookup.
// An array could not do the move-to-front without shifting, and a
// map alone has no ordering. This is why the combination exists —
// and it is what Redis, Memcached and your CPU's cache all use.
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
7. Why is a doubly linked list necessary for an LRU cache, and why is the hash map necessary
   too?
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
