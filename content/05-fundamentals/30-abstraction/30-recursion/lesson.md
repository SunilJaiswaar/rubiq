---
title: Recursion and the call stack
summary: What the machine does when a function calls itself, why there is a depth limit, and when recursion is the clearer tool.
level: basic
minutes: 14
status: stable
last_reviewed: "2026-10-07"
tags: [fundamentals, recursion, call-stack]
concepts: [recursion, call-stack, base-case, memoization]
prerequisites: [functions, scope]
interview:
  - question: What causes a stack overflow?
    level: basic
    answer: >-
      Every function call pushes a frame — arguments, locals, and the return address —
      onto a fixed-size region of memory. The stack is small, typically around 1 MB, so a
      few thousand to a few tens of thousands of nested frames exhaust it. The usual cause
      is recursion that never reaches its base case, but deep *legitimate* recursion over
      a large structure hits the same wall, which is why production code that walks
      unbounded data uses an explicit stack rather than the call stack.
    followUps:
      - "Why does an iterative version not have that limit?"
      - "What is tail-call optimisation and why can you not rely on it in JavaScript?"
  - question: When is recursion the better choice over a loop?
    level: basic
    answer: >-
      When the data is itself recursive — trees, nested objects, file systems, parsed
      expressions, graphs. The recursive version mirrors the structure, so there is no
      bookkeeping to get wrong. For linear data a loop is clearer and has no depth limit.
      The honest summary: recursive data wants recursion, sequential data wants iteration.
resources:
  - title: "MDN — Recursion"
    url: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Functions#recursion
---

## A problem a loop handles badly

Sum every number in a nested structure of unknown shape.

```javascript runnable
const data = [1, [2, 3, [4, [5]]], 6, [[7]]];

// Iteratively: you have to maintain the pending work yourself.
function sumIterative(input) {
  let total = 0;
  const pending = [input];              // an explicit stack
  while (pending.length > 0) {
    const item = pending.pop();
    if (Array.isArray(item)) pending.push(...item);
    else total += item;
  }
  return total;
}

// Recursively: the shape of the code is the shape of the data.
function sumRecursive(input) {
  if (!Array.isArray(input)) return input;              // base case
  return input.reduce((acc, item) => acc + sumRecursive(item), 0);
}

console.log(sumIterative(data), sumRecursive(data));
```

:::problem
The iterative version works, and it required inventing a stack, pushing to it, popping
from it, and spreading nested arrays into it. That bookkeeping is not part of the problem —
it is overhead you took on because a `while` loop only knows how to go forwards.

The recursive version has no bookkeeping, because the machine already maintains a stack of
pending work for you. It is called the call stack.
:::

:::what
A **recursive** function calls itself on a smaller part of the problem. It needs two
things: a **base case** that returns without recursing, and a **recursive case** that
makes the input strictly smaller.

The **call stack** is the region of memory holding one frame per in-progress call.
:::

:::why
When the data is recursive, the recursive solution is the one with no accidental
complexity. A tree has nodes with children that are trees; `walk(node)` calling
`walk(child)` is a direct transcription. The iterative version has to reconstruct, by
hand, the stack the language would have given it for free — and that hand-built stack is
where the bugs go.
:::

## What a call actually costs

```javascript runnable
function three() { return "done"; }
function two()   { return three(); }
function one()   { return two(); }
console.log(one());

// The stack is visible in any error:
function deep(n) { if (n === 0) throw new Error("bottom"); return deep(n - 1); }
try { deep(3); } catch (e) {
  console.log(e.stack.split("\n").slice(0, 5).join("\n"));
}
```

:::internals
```text
  factorial(3)
                                   ┌──────────────────────────┐
  push frame: n=3                  │ n=3  waiting on fact(2)  │
  push frame: n=2                  │ n=2  waiting on fact(1)  │
  push frame: n=1                  │ n=1  waiting on fact(0)  │
  push frame: n=0  ── base case ──▶│ n=0  returns 1           │
                                   └──────────────────────────┘
                                              │ unwinding
  n=1 returns 1 * 1 = 1      ◀────────────────┘
  n=2 returns 2 * 1 = 2
  n=3 returns 3 * 2 = 6

  Each frame holds: the arguments, the locals, and WHERE TO RETURN TO.
  That return address is the thing a loop does not need and recursion does.
```

The stack is a fixed, small region — typically about 1 MB, set when the thread is created.
A frame is tens of bytes, so the limit lands in the thousands:

```javascript runnable
function depth(n = 1) {
  try { return depth(n + 1); } catch { return n; }
}
console.log("max depth here:", depth().toLocaleString());

// And what hitting it looks like:
function noBaseCase(n) { return noBaseCase(n + 1); }
try { noBaseCase(0); } catch (e) { console.log(e.constructor.name + ":", e.message); }
```

This matters because **the limit is on nesting, not on work**. An iterative loop can run a
billion times; a recursive function cannot nest ten thousand deep. Those are different
resources.
:::

:::mistakes
**No base case, or a base case the input can skip past.**

```javascript runnable
// Looks fine. Overflows for an odd input, because it never equals 0.
function halveToZero(n) {
  if (n === 0) return "done";
  return halveToZero(n - 2);
}
try { halveToZero(7); } catch (e) { console.log("odd input:", e.constructor.name); }

// Fixed: test a condition the input must eventually satisfy.
function halveToZeroFixed(n) {
  if (n <= 0) return "done";
  return halveToZeroFixed(n - 2);
}
console.log("fixed:", halveToZeroFixed(7));
```

Prefer `<=` over `===` for a numeric base case. Equality assumes the input lands exactly on
your value; an inequality does not.

**The input not actually getting smaller.**

```javascript runnable
function broken(list) {
  if (list.length === 0) return 0;
  return list[0] + broken(list);     // passes the SAME list — never shrinks
}
try { broken([1, 2]); } catch (e) { console.log("no progress:", e.constructor.name); }

function fixed(list) {
  if (list.length === 0) return 0;
  return list[0] + fixed(list.slice(1));
}
console.log("fixed:", fixed([1, 2, 3]));
```

Two things must be true and people check only the first: there *is* a base case, and every
recursive call moves measurably towards it.

**Exponential blowup from recomputing the same subproblem.**

```javascript runnable
let naiveCalls = 0;
function fibNaive(n) {
  naiveCalls++;
  return n <= 1 ? n : fibNaive(n - 1) + fibNaive(n - 2);
}

let memoCalls = 0;
function fibMemo(n, cache = new Map()) {
  memoCalls++;
  if (n <= 1) return n;
  if (cache.has(n)) return cache.get(n);
  const result = fibMemo(n - 1, cache) + fibMemo(n - 2, cache);
  cache.set(n, result);
  return result;
}

console.log("fib(30) =", fibNaive(30), "in", naiveCalls.toLocaleString(), "calls");
console.log("fib(30) =", fibMemo(30),  "in", memoCalls.toLocaleString(), "calls");
```

:::

:::how
Why naive Fibonacci is exponential, in one picture:

```text
                      fib(5)
               ┌────────┴────────┐
            fib(4)             fib(3)         ← fib(3) computed twice
         ┌────┴────┐        ┌────┴────┐
      fib(3)    fib(2)   fib(2)    fib(1)     ← fib(2) three times
    ┌───┴───┐   ┌─┴─┐    ┌─┴─┐
  fib(2) fib(1) ...      ...                  ← and it doubles each level

  Calls ≈ 2^n. Distinct subproblems: n.
  Memoising collapses 2^n into n, because there were only ever n answers.
```

That gap — exponential calls over a linear number of distinct subproblems — is the entire
motivation for dynamic programming. Memoisation is the top-down form; filling a table
bottom-up is the same insight written as a loop.
:::

:::failure
**Deep but legitimate recursion.** The base case is correct, the input shrinks, and it
still overflows — because the data is genuinely deep.

```javascript runnable
// A 50,000-node linked list. Nothing is wrong with the recursion.
let list = null;
for (let i = 0; i < 50_000; i++) list = { value: i, next: list };

function lengthRecursive(node) {
  return node === null ? 0 : 1 + lengthRecursive(node.next);
}
try { lengthRecursive(list); } catch (e) { console.log("legitimate depth:", e.constructor.name); }

// An explicit stack moves the frames to the heap, which is large.
function lengthIterative(node) {
  let n = 0;
  while (node !== null) { n++; node = node.next; }
  return n;
}
console.log("iterative:", lengthIterative(list).toLocaleString());
```

**The rule for production code: if the depth depends on input you do not control, do not
use the call stack.** A JSON parser, a directory walker, a comment-tree renderer — all of
these have been the cause of real outages when someone submitted deeply nested input.
Converting to an explicit stack is the fix, and it is also a denial-of-service mitigation.

```javascript runnable
// Walking arbitrary nested data safely: explicit stack, bounded depth.
function walkSafely(root, maxDepth = 1000) {
  const out = [];
  const stack = [[root, 0]];
  while (stack.length) {
    const [node, depth] = stack.pop();
    if (depth > maxDepth) throw new Error(`Nesting exceeded ${maxDepth}`);
    if (Array.isArray(node)) { for (const c of node) stack.push([c, depth + 1]); }
    else out.push(node);
  }
  return out;
}
console.log(walkSafely([1, [2, [3, [4]]]]));
```
:::

:::internals
**Tail calls, and why JavaScript cannot help you.**

A *tail call* is a recursive call that is the very last thing the function does — nothing
is waiting on its result. In principle the engine can reuse the current frame rather than
pushing a new one, turning the recursion into a loop with no depth limit.

```javascript runnable
// NOT a tail call: the multiplication happens after the call returns.
const factNotTail = (n) => (n <= 1 ? 1 : n * factNotTail(n - 1));

// A tail call: the recursive call is the entire return expression.
const factTail = (n, acc = 1) => (n <= 1 ? acc : factTail(n - 1, n * acc));

console.log(factNotTail(10), factTail(10));

// But in JavaScript both still overflow — TCO is specified and not implemented.
try { factTail(200_000); } catch (e) { console.log("tail call, still:", e.constructor.name); }
```

Tail-call optimisation is in the ES2015 specification and, apart from Safari, no major
engine implements it. So **writing tail-recursively in JavaScript buys you nothing**.

It does elsewhere: Scheme and Elixir guarantee it, Scala has `@tailrec` which fails to
compile if the call is not in tail position, and Clojure gives you `recur` as an explicit
construct. Knowing the difference matters when you move between languages — the idiomatic
deep recursion of Elixir is a crash in Node.
:::

:::tradeoffs
**Recursion.** Matches recursive data, so there is nothing to get wrong. Shorter and often
provably correct by induction — base case plus inductive step.

Costs: a stack depth limit you do not control, a frame per call, and stack traces that are
harder to read.

**Iteration.** No depth limit, no per-call cost, straightforward to trace in a debugger.

Costs: you maintain the pending-work stack yourself for anything non-linear, and that
hand-rolled stack is where the bugs land.

The decision rule: **recursive data wants recursion; sequential data wants iteration.** And
the override: **if the depth comes from untrusted input, use an explicit stack regardless**,
because a crash is not an acceptable response to a deeply nested payload.
:::

:::realworld
```javascript runnable
// Recursion is the natural fit here — a comment tree of unknown depth.
const thread = {
  id: 1, text: "root",
  replies: [
    { id: 2, text: "a", replies: [{ id: 4, text: "a.1", replies: [] }] },
    { id: 3, text: "b", replies: [] },
  ],
};

function countComments(node) {
  return 1 + node.replies.reduce((n, r) => n + countComments(r), 0);
}
function flatten(node, depth = 0) {
  return [{ id: node.id, depth }, ...node.replies.flatMap((r) => flatten(r, depth + 1))];
}

console.log("total:", countComments(thread));
console.log(flatten(thread).map((c) => "  ".repeat(c.depth) + c.id).join("\n"));
```

Where you will meet recursion in real systems: JSON and HTML parsing, directory traversal,
tree and graph algorithms, query planners, template rendering, diffing algorithms
(including React's reconciler), and anything that evaluates an expression.
:::

:::checkpoint
Write `flattenDeep(arr)` recursively, then say what happens for `[1,[2,[3,[...]]]]` nested
100,000 deep — and what you would change for input arriving from a user.

Then: `fibMemo` above passes the cache as a defaulted parameter. What breaks if you instead
declare it in module scope, and when would that actually be what you want?
:::

:::interview
Recursion appears in two forms. As a coding task — tree traversal, nested structures —
where the expectation is that you state the base case *before* writing the recursive case,
because that is the order in which it is easy to get right.

As a concept question it is usually "what causes a stack overflow", and a strong answer
separates the two causes: *"a missing or unreachable base case is the usual one, but
legitimate deep recursion over a large structure hits the same limit — the stack is around
1 MB, so the ceiling is thousands of frames, not millions. So for anything whose depth
depends on input I do not control, I use an explicit stack with a bound."*

The detail that lands well: *"and I do not write tail-recursively in JavaScript expecting
help — TCO is in the spec and essentially unimplemented outside Safari. In Elixir or Scala
it is a real technique."*
:::

## What you now know

- Recursion needs a base case *and* strictly shrinking input. Check both.
- Prefer `<=` to `===` for numeric base cases — equality assumes the input lands exactly.
- Each call pushes a frame holding arguments, locals and a return address; the stack is
  ~1 MB, so the limit is thousands of frames.
- The limit is on nesting, not total work. A loop can run a billion times.
- Recomputing subproblems turns linear work into exponential; memoisation collapses it.
- If depth depends on untrusted input, use an explicit stack with a bound.
- Tail-call optimisation is specified but unimplemented in most JS engines. Do not rely on
  it.
