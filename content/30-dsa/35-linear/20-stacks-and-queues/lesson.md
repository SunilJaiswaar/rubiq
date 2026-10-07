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
      In Ruby, with an Array: `push` to enqueue and `shift` to dequeue, both O(1), because MRI's
      Array keeps a start offset rather than moving elements. That is worth saying plainly because
      the usual answer — "never use an array as a queue" — is imported from languages where
      `shift` is O(n). The reasons to reach for something else are memory rather than time: a ring
      buffer with wrapping head and tail indices gives O(1) in *fixed* memory, which an Array
      queue does not, and `Thread::Queue` is the right answer when producers and consumers are
      different threads. Two stacks — push onto an inbox, and pour it into an outbox when the
      outbox empties — is the classic trick worth knowing for the amortisation argument: each
      element moves between stacks exactly once, so it is O(1) amortised even though one dequeue
      can be O(n).
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

```ruby
# Stack — last in, first out.
stack = []
stack.push(1, 2, 3)
stack.pop        # => 3, the most recent

# Queue — first in, first out.
queue = []
queue.push(1, 2, 3)
queue.shift      # => 1, the one that has waited longest
```

In Ruby one class is both. `Array` gives you `push`/`pop` at the end and
`shift`/`unshift` at the front, and **all four are O(1)** — so an Array is a stack, a
queue and a deque depending only on which pair of methods you call. That is not true
everywhere: in JavaScript `shift` is O(n), which is why so much algorithm writing warns
against using an array as a queue. Worth knowing so you can ignore the warning here and
heed it when you port the code.

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
```ruby
# 1. Bracket matching, the canonical stack problem.
def balanced?(str)
  pairs = { ')' => '(', ']' => '[', '}' => '{' }
  stack = []
  str.each_char do |char|
    if '([{'.include?(char)
      stack << char
    elsif pairs.key?(char)
      return false if stack.pop != pairs[char]   # pop on empty is nil
    end
  end
  stack.empty?                     # leftover openers mean unbalanced
end
# The final emptiness check is load-bearing: "((" never fails a
# comparison, because no closer arrives.
#
# `stack.pop` returns nil on an empty stack, and `nil != '('` is true,
# so an unmatched closer is rejected correctly. That is worth a comment
# in real code — it reads like an oversight and is not.

# 2. A queue from two stacks. O(1) amortised at both ends.
#    In Ruby you would just use an Array — this is here because the
#    amortisation argument is the thing worth understanding, and
#    because it is the answer in languages where shift is O(n).
class TwoStackQueue
  def initialize
    @inbox = []
    @outbox = []
  end

  def enqueue(item) = @inbox << item

  def dequeue
    @outbox = @inbox.reverse.tap { @inbox = [] } if @outbox.empty?
    @outbox.pop
  end

  def size = @inbox.size + @outbox.size
end

# 3. A circular buffer — O(1) in FIXED memory, which is the reason to
#    want one: an Array queue is already O(1), but it grows.
class RingBuffer
  def initialize(capacity)
    @buf = Array.new(capacity)
    @head = 0
    @tail = 0
    @count = 0
  end

  def push(item)
    raise 'full' if @count == @buf.size

    @buf[@tail] = item
    @tail = (@tail + 1) % @buf.size       # the wrap
    @count += 1
    item
  end

  def shift
    return nil if @count.zero?

    item = @buf[@head]
    @buf[@head] = nil                     # release the reference
    @head = (@head + 1) % @buf.size
    @count -= 1
    item
  end

  def size = @count
end
# Note `@count` rather than inferring emptiness from head == tail:
# that comparison is ambiguous between full and empty, which is a
# classic ring-buffer bug.

# 4. Converting recursion to iteration — the stack makes the call
#    stack explicit, which is how you avoid a stack overflow.
def dfs_recursive(node, &visit)
  return if node.nil?

  visit.call(node)
  node.children.each { |child| dfs_recursive(child, &visit) }
end

def dfs_iterative(root)
  out = []
  stack = [root]
  until stack.empty?
    node = stack.pop
    out << node.name
    # Push in reverse so children are visited left to right.
    node.children.reverse_each { |child| stack << child }
  end
  out
end
# Change `stack.pop` to `queue.shift` and depth-first becomes
# breadth-first. That one-method difference is worth remembering, and
# in Ruby it costs nothing — both are O(1) on an Array.
```
:::

:::failure
**Porting the "never use shift as a queue" rule into Ruby.** It is the single most repeated
performance warning about queues, it is correct in JavaScript, and it is false here:

```ruby
queue = []
# ...
process(queue.shift) until queue.empty?    # fine. O(1) per shift.
```

MRI's Array keeps a start offset, so `shift` advances the offset instead of moving every
remaining element. Measured on Ruby 3.4: shifting 100,000 elements takes 5.7ms and 400,000
takes 24.2ms — four times the work for roughly four times the time, which is constant per
operation. `unshift`, `push` and `pop` are the same.

**The trap that *is* real in Ruby** is the same shape — a quiet quadratic hiding inside an
innocuous-looking method — but a different method:

```ruby
seen = []
items.each { |x| seen << x unless seen.include?(x) }   # O(n) per check
```

`Array#include?` is a linear scan, so this is O(n²). Measured: 2,000 items takes 16.4ms
against 0.7ms for a `Set` — 22 times slower — and 8,000 items takes 260.8ms against 1.8ms,
which is **143 times** slower. The ratio grows with n, which is the signature. Use a `Set`,
or a `Hash` if you need to associate something with each key:

```ruby
require 'set'
seen = Set.new
items.each { |x| seen << x }        # O(1) per membership test
```

**Popping an empty stack.** Different languages fail differently, and all of them badly:

```ruby
[].pop              # => nil, silently
[].first            # => nil
[].fetch(0)         # => IndexError: index 0 outside of array bounds
# Ruby returns nil rather than raising, so a comparison against nil
# then quietly succeeds or fails. In Python this is an IndexError; in
# Java, EmptyStackException. Either check emptiness, use `fetch` when
# absence is a bug, or — as in the bracket matcher — rely on
# `nil != '('` being correct and say so in a comment, because it
# reads like an oversight.
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

```ruby
# The one production detail worth stating explicitly: a bounded queue
# is a design decision, not a limitation.
class BoundedQueue
  def initialize(capacity)
    @capacity = capacity
    @items = []
  end

  def offer(item)
    return false if @items.size >= @capacity   # reject

    @items << item
    true
  end
end
# An unbounded queue converts a throughput problem into a memory
# problem, and memory exhaustion takes down the whole process rather
# than just the overloaded path. Rejecting work is a feature — it is
# what lets the caller retry, shed load, or report honestly.
#
# For work shared between threads, reach for `Thread::Queue` rather
# than an Array: it is built for the producer/consumer case, blocks on
# `pop` until something arrives, and takes a `max` for the bounded
# version (`Thread::SizedQueue`).
```
:::

:::mistakes
**Assuming `Array#shift` is O(n)** because it is in JavaScript. It is O(1) in MRI. The real
quadratic to watch for is `Array#include?` inside a loop — use a `Set`.

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

**Queue by `shift` on an Array** — simplest to write and O(1) per dequeue in MRI, so it is the
default rather than a compromise. It grows without bound, which is the real reason to replace
it.

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
1. `process(queue.shift) until queue.empty?` is fine in Ruby and quadratic in JavaScript. Why?
   And what *is* the equivalent quiet quadratic in Ruby?
2. In bracket matching, why is the final `stack.empty?` check necessary?
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

*"In Ruby, an Array: `push` and `shift`, both O(1), because MRI keeps a start offset rather
than moving elements. I would say that explicitly, because the standard advice — never use an
array as a queue — is imported from JavaScript, where `shift` really is O(n). The reasons to
reach for something else here are about memory and concurrency rather than time: a ring buffer
is O(1) in *fixed* memory, and `Thread::Queue` is what you want when producers and consumers
are separate threads. Two stacks is still worth knowing for the amortisation argument — each
element crosses between stacks exactly once, so it is O(1) amortised even though a single
dequeue can be O(n)."*

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
- `Array#shift` is O(1) in MRI, so an Array is a queue, a stack and a deque. The JavaScript
  warning against it does not transfer; `Array#include?` in a loop is Ruby's quiet quadratic.
- A two-stack queue is O(1) amortised because each element crosses once.
- A ring buffer is O(1) in fixed memory; track a count, since `head === tail` is ambiguous.
- Clear dequeued ring-buffer slots or they retain references.
- A stack reverses pushed children, so push DFS children in reverse order.
- `pop` → `shift` converts depth-first into breadth-first traversal.
- A bounded queue makes overload an explicit decision; an unbounded one makes it an OOM.
- Most recent → stack, longest waiting → queue, most urgent → heap, either end → deque.
