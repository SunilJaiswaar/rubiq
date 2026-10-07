---
title: Stacks and queues
summary: Two structures defined by what they forbid — and why that restriction is what makes them useful rather than limiting.
level: basic
minutes: 16
version: "1"
status: stable
last_reviewed: "2026-10-07"
tags: [dsa, stacks, queues, deque, recursion]
concepts: [stacks, queues, lifo-fifo, amortised-analysis]
prerequisites: [big-o, linked-lists]
interview:
  - question: What problems is a stack the natural fit for?
    level: basic
    answer: >-
      Anything with nesting, because nesting is last-in-first-out by definition. Matching
      brackets, parsing expressions, undo history, depth-first traversal, and the call stack
      itself — a function returns to its most recent caller, which is exactly LIFO. The useful
      recognition rule is: if the problem involves "the most recent unmatched thing", it is a
      stack. If it involves "the thing that has waited longest", it is a queue.
    followUps:
      - "So how do you convert a recursive algorithm to an iterative one?"
  - question: How do you implement a queue efficiently with arrays?
    level: intermediate
    answer: >-
      Either a circular buffer with head and tail indices that wrap, which gives O(1) at both
      ends in fixed memory, or two stacks: push onto an inbox stack, and when the outbox is
      empty, pour the inbox into it. The two-stack version is O(1) amortised — each element is
      moved exactly once between stacks — even though a single dequeue can be O(n). The naive
      version, shifting an array from the front, is O(n) per dequeue because every remaining
      element moves.
    followUps:
      - "Why is the two-stack version amortised O(1) rather than O(n)?"
  - question: What is a deque and when do you need one?
    level: intermediate
    answer: >-
      A double-ended queue: push and pop at both ends in O(1). You need it when an algorithm
      must add at one end and remove from either — the sliding-window maximum is the standard
      case, where you append new indices at the back, drop dominated ones from the back, and
      drop out-of-window ones from the front. It is also what underlies work-stealing
      schedulers: a worker takes from its own end while thieves take from the other, which
      minimises contention.
    followUps:
      - "Why does the monotonic deque stay O(n) overall?"
resources:
  - title: "Sedgewick & Wayne — Algorithms, Chapter 1.3"
    url: https://algs4.cs.princeton.edu/13stacks/
---

## Two structures, one difference

```js
// Stack — last in, first out.
const stack = [];
stack.push(1); stack.push(2); stack.push(3);
stack.pop();        // 3 — the most recent

// Queue — first in, first out.
const queue = [];
queue.push(1); queue.push(2); queue.push(3);
queue.shift();      // 1 — the one that has waited longest
```

That is the entire difference, and it determines which problems each solves.

:::what
A **stack** supports push and pop at one end: last in, first out. A **queue** supports push at
one end and pop at the other: first in, first out. A **deque** supports both operations at both
ends. All three are defined by their *interface*, not their implementation — each can be built
on an array or a linked list.
:::

:::why
A stack and a queue are both less capable than an array. You cannot index into them, cannot
search them, cannot insert in the middle. That restriction is the point.

Two reasons. The first is that the restriction matches the problem. Nesting is inherently
LIFO: when you encounter `)`, the only bracket it can match is the most recent unmatched `(`.
Expressing that with a stack means the structure enforces the rule, so there is no code path
that can match the wrong one. Writing it with an array and an index means you are maintaining
that discipline by hand, and discipline is what fails under maintenance.

The second is that a narrow interface can be implemented well. Because a stack only ever
touches one end, it can be a plain array with no shifting, a linked list with no traversal, or
a fixed region of memory with one pointer — all O(1), all cache-friendly. The call stack is a
stack precisely because "push a frame, pop a frame" can be two instructions adjusting a
register.

So the right way to read "a stack can only do two things" is: a stack can do two things
*extremely well*, and most problems involving nesting need exactly those two.
:::

:::how
```text
  BRACKET MATCHING — why a stack is the only sensible structure

    "({[]})"

    (   push (        stack: (
    {   push {        stack: ( {
    [   push [        stack: ( { [
    ]   pop  [  ✓     stack: ( {
    }   pop  {  ✓     stack: (
    )   pop  (  ✓     stack: (empty) → balanced

    "([)]"

    (   push (        stack: ( 
    [   push [        stack: ( [
    )   pop  [  ✗     mismatch → not balanced

    The structure guarantees you compare against the most recent
    unmatched opener. Nothing else could be correct.


  QUEUE FROM TWO STACKS — the amortisation argument

    inbox: push here          outbox: pop here

    enqueue(x)  → inbox.push(x)
    dequeue()   → if outbox empty: pour ALL of inbox into outbox
                  (reversing it, which is what makes it FIFO)
                  then outbox.pop()

    enqueue 1,2,3     inbox [1,2,3]   outbox []
    dequeue           inbox []        outbox [3,2,1] → pop 1
    dequeue                                          → pop 2
    enqueue 4         inbox [4]       outbox [3]
    dequeue                                          → pop 3
    dequeue           inbox []        outbox [4]     → pop 4

    One dequeue can cost O(n). But each element is moved from inbox
    to outbox EXACTLY ONCE in its lifetime, so n operations cost
    O(n) total — O(1) amortised.
```
:::

:::example
```js
// 1. Bracket matching, the canonical stack problem.
function balanced(s) {
  const pairs = { ")": "(", "]": "[", "}": "{" };
  const stack = [];
  for (const c of s) {
    if (c === "(" || c === "[" || c === "{") stack.push(c);
    else if (c in pairs) {
      if (stack.pop() !== pairs[c]) return false;   // pop() on empty is undefined
    }
  }
  return stack.length === 0;        // leftover openers mean unbalanced
}
// The final length check is load-bearing: "((" never fails a
// comparison, because no closer arrives.

// 2. A queue from two stacks. O(1) amortised at both ends.
class Queue {
  #in = []; #out = [];
  enqueue(x) { this.#in.push(x); }
  dequeue() {
    if (this.#out.length === 0) {
      while (this.#in.length) this.#out.push(this.#in.pop());
    }
    return this.#out.pop();
  }
  get size() { return this.#in.length + this.#out.length; }
}

// 3. A circular buffer — O(1) in fixed memory, which is what you
//    want in an embedded or high-throughput context.
class RingBuffer {
  #buf; #head = 0; #tail = 0; #count = 0;
  constructor(capacity) { this.#buf = new Array(capacity); }
  push(x) {
    if (this.#count === this.#buf.length) throw new Error("full");
    this.#buf[this.#tail] = x;
    this.#tail = (this.#tail + 1) % this.#buf.length;   // the wrap
    this.#count++;
  }
  shift() {
    if (this.#count === 0) return undefined;
    const x = this.#buf[this.#head];
    this.#buf[this.#head] = undefined;        // release the reference
    this.#head = (this.#head + 1) % this.#buf.length;
    this.#count--;
    return x;
  }
}
// Note `#count` rather than inferring emptiness from head === tail:
// that comparison is ambiguous between full and empty, which is a
// classic ring-buffer bug.

// 4. Converting recursion to iteration — the stack makes the call
//    stack explicit, which is how you avoid a stack overflow.
function dfsRecursive(node, visit) {
  if (!node) return;
  visit(node);
  for (const child of node.children) dfsRecursive(child, visit);
}

function dfsIterative(root, visit) {
  const stack = [root];
  while (stack.length) {
    const node = stack.pop();
    visit(node);
    // Push in reverse so children are visited left to right.
    for (let i = node.children.length - 1; i >= 0; i--) stack.push(node.children[i]);
  }
}
// Swap `stack.pop()` for `queue.shift()` and depth-first becomes
// breadth-first. That one-line difference is worth remembering.
```
:::

:::failure
**`Array#shift` as a queue.** The single most common performance bug in this area:

```js
const queue = [];
// ...
while (queue.length) process(queue.shift());
// shift() is O(n) in most implementations — it reindexes every
// remaining element. n dequeues become O(n²).
// On 100,000 items that is 5 billion element moves.

// Use an index instead, if you can afford not to reclaim memory:
let head = 0;
while (head < queue.length) process(queue[head++]);
// Or a real deque / ring buffer / two-stack queue.
```

(V8 optimises `shift` for small arrays, which is exactly why this passes a test with ten items
and fails in production with a hundred thousand.)

**Popping an empty stack.** Different languages fail differently, and all of them badly:

```js
[].pop()           // undefined — comparisons then silently succeed or fail
// In Ruby:  [].pop → nil
// In Python: [].pop() → IndexError
// In Java:  Stack.pop() → EmptyStackException; Deque.pop() → NoSuchElement
// Always check emptiness, or in the bracket case rely on the fact
// that `undefined !== "("` happens to be correct — and say so in a
// comment, because it looks like an oversight.
```

**Forgetting the final emptiness check** in bracket matching. `"((("` triggers no mismatch,
because no closing bracket ever arrives.

**Ring buffer with `head === tail` as the emptiness test.** That condition is true both when
the buffer is empty and when it is full. Keep an explicit count, or waste one slot so full is
`(tail + 1) % n === head`.

**Not clearing the slot on `shift` in a ring buffer.** The array keeps a reference to the
dequeued object, so it is never collected. A long-lived buffer then retains every object that
ever passed through its current slots.

**Pushing children in order for a DFS** and expecting left-to-right traversal. A stack reverses
them. Push in reverse.

**Using a queue where you need a priority queue.** "Process the most urgent next" is not FIFO.
That is a heap, and reaching for a sorted array instead gives you O(n) insertion.
:::

:::realworld
```text
// Where these actually are, which is almost everywhere.

STACKS
  The call stack          — one frame per active call. A stack
                            overflow is literally this structure
                            exceeding its bounds.
  Undo/redo              — two stacks; an action moves between them.
  Expression evaluation  — shunting-yard, and every RPN calculator.
  Backtracking           — the path so far, pushed and popped.
  Browser history        — back is pop, and visiting a new page
                            clears the forward stack.
  Transaction nesting    — SAVEPOINTs are a stack; a rollback pops.

QUEUES
  Job queues             — Sidekiq, SQS, RabbitMQ. FIFO is fairness.
  BFS                    — the frontier, which is why BFS finds
                            shortest paths in an unweighted graph.
  Request buffers        — the listen backlog is a queue; when it
                            fills, connections are refused.
  Rate limiters          — the token bucket's queue of waiters.
  Producer/consumer      — a bounded queue is how backpressure is
                            implemented. An unbounded one is how
                            you run out of memory instead.

DEQUES
  Sliding-window min/max — the monotonic deque.
  Work stealing          — each worker pops its own end, thieves
                            take the other, so contention is rare.
  Browser event loop     — the task queue, with priority insertion
                            at the front.
```

```js
// The one production detail worth stating explicitly: a bounded
// queue is a design decision, not a limitation.
class BoundedQueue {
  #items = []; #capacity;
  constructor(capacity) { this.#capacity = capacity; }
  offer(x) {
    if (this.#items.length >= this.#capacity) return false;  // reject
    this.#items.push(x);
    return true;
  }
}
// An unbounded queue converts a throughput problem into a memory
// problem, and memory exhaustion takes down the whole process rather
// than just the overloaded path. Rejecting work is a feature —
// it is what lets the caller retry, shed load, or report honestly.
```
:::

:::mistakes
**`Array#shift` in a loop.** O(n) per call. Use an index, a deque or two stacks.

**No emptiness check before `pop`.** Silent `undefined`/`nil` or an exception, depending on
language.

**Skipping the final emptiness check** when matching brackets.

**`head === tail` for ring buffer emptiness.** Ambiguous with full.

**Leaving references in a dequeued ring-buffer slot.** A retention leak.

**Pushing DFS children in order.** A stack reverses them.

**Reaching for a sorted array as a priority queue.** O(n) insertion; use a heap.

**Making the queue unbounded** because bounding it requires deciding what to do when full.
That decision does not go away — it just becomes an out-of-memory error instead of a rejection.

**Recursion where an explicit stack belongs.** If the depth is input-controlled, the recursive
version has a stack overflow waiting in it.
:::

:::tradeoffs
**Stack on a dynamic array** — O(1) amortised push and pop, excellent locality, occasional
reallocation. The default.

**Stack on a linked list** — true O(1) with no reallocation pause, one pointer of overhead per
element and poor locality. Worth it when a pause is unacceptable.

**Queue by `shift` on an array** — simplest to write, O(n) per dequeue. Acceptable only for
small, bounded sizes, and it will pass your tests before failing in production.

**Queue as a ring buffer** — O(1) both ends, fixed memory, and you must decide what happens
when it is full. The right answer for high throughput and for anything embedded.

**Queue from two stacks** — O(1) amortised, trivial to implement correctly, and a single
dequeue can be O(n), which matters if you care about tail latency rather than throughput.

**Deque** — both ends in O(1), slightly more bookkeeping, and the only option for monotonic
window algorithms.

**Bounded versus unbounded** — bounding forces you to handle overload explicitly (reject,
block, or shed) and keeps memory predictable. Unbounded postpones the decision until the
process dies, which is strictly worse.

The recognition rule that does most of the work: *most recent unmatched thing* → stack.
*Longest waiting thing* → queue. *Most urgent thing* → heap. *Either end* → deque.
:::

:::checkpoint
1. Why is `queue.shift()` in a loop O(n²), and why does it pass a small test?
2. In bracket matching, why is the final `stack.length === 0` check necessary?
3. One dequeue from a two-stack queue can be O(n). Why is the amortised cost O(1)?
4. Why is `head === tail` an inadequate emptiness test for a ring buffer?
5. You push a node's children onto a stack in order and traverse left-to-right. What actually
   happens?
6. Change `stack.pop()` to `queue.shift()` in an iterative traversal. What changes about the
   traversal order, and what does that buy you?
7. Why is a bounded queue better than an unbounded one, even though bounding means rejecting
   work?
:::

:::interview
Define them by the restriction and then say why the restriction helps:

*"A stack is last-in-first-out, a queue is first-in-first-out, and both are less capable than
an array on purpose. Nesting is inherently LIFO — when I see a closing bracket, the only one it
can match is the most recent unmatched opener — so using a stack means the structure enforces
the rule instead of me maintaining it by hand. And because the interface only touches one end,
it can be implemented as two instructions, which is why the call stack is a stack."*

The implementation question has a specific right answer worth knowing:

*"For a queue I would not use `Array#shift` — it reindexes everything, so n dequeues is O(n²),
and it passes a ten-element test because V8 optimises the small case. A ring buffer gives O(1)
at both ends in fixed memory. Two stacks is the elegant version: push onto an inbox, and when
the outbox empties, pour the inbox in — which reverses it, giving FIFO. One dequeue can be O(n),
but each element moves between stacks exactly once in its lifetime, so it is O(1) amortised."*

And the recognition rule, which is what makes this useful rather than trivia:

*"Most recent unmatched thing is a stack. Longest waiting thing is a queue. Most urgent thing is
a heap. Either end is a deque. And swapping `pop` for `shift` in a traversal turns depth-first
into breadth-first, which is the cheapest useful fact in this area."*
:::

## What you now know

- A stack is LIFO, a queue is FIFO, a deque does both ends; all are interfaces, not
  implementations.
- The restriction is the value: it matches nesting and fairness, and it can be implemented
  perfectly.
- Nesting problems need a stack because only the most recent unmatched item can match.
- Bracket matching needs a final emptiness check, or unclosed openers pass.
- `Array#shift` is O(n); a queue built on it is O(n²) and will pass small tests.
- A two-stack queue is O(1) amortised because each element crosses once.
- A ring buffer is O(1) in fixed memory; track a count, since `head === tail` is ambiguous.
- Clear dequeued ring-buffer slots or they retain references.
- A stack reverses pushed children, so push DFS children in reverse order.
- `pop` → `shift` converts depth-first into breadth-first traversal.
- A bounded queue makes overload an explicit decision; an unbounded one makes it an OOM.
- Most recent → stack, longest waiting → queue, most urgent → heap, either end → deque.
