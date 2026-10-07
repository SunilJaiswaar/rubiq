---
title: From recursion to a table
summary: Dynamic programming is recursion plus a cache. The two conditions a problem must satisfy, and the mechanical route from an exponential solution to a linear one.
level: advanced
minutes: 20
version: "1"
status: stable
last_reviewed: "2026-10-07"
tags: [dsa, dynamic-programming, memoisation, recursion]
concepts: [dynamic-programming, memoisation, tabulation, optimal-substructure]
prerequisites: [recursion, hash-tables]
interview:
  - question: What two properties must a problem have for dynamic programming to apply?
    level: advanced
    answer: >-
      Overlapping subproblems — the recursion solves the same subproblem many times, which is
      what makes caching worthwhile — and optimal substructure, meaning an optimal solution is
      built from optimal solutions to subproblems. Both are needed. Mergesort has optimal
      substructure but no overlap, since the halves are disjoint, so caching buys nothing; it
      is divide-and-conquer, not DP. And a problem where a locally optimal subsolution can be
      the wrong choice globally — like the longest *simple* path in a graph — has overlap but
      no optimal substructure, so DP does not apply at all.
    followUps:
      - "Give me a problem with overlap but no optimal substructure."
  - question: Memoisation or tabulation?
    level: advanced
    answer: >-
      Memoisation is top-down: write the recursion naturally and add a cache, so you only
      compute the subproblems you actually need. Tabulation is bottom-up: fill a table in
      dependency order, which avoids recursion entirely and so avoids stack overflow, and
      usually has better constants and locality. I reach for memoisation first because the
      recursion is the thing I can reason about, then convert to tabulation if the depth is a
      risk or the constants matter. The one case where memoisation genuinely wins is a sparse
      state space, where tabulation would fill a table mostly with values nothing ever reads.
    followUps:
      - "How do you get from one to the other mechanically?"
  - question: How do you reduce a DP's space usage?
    level: advanced
    answer: >-
      Look at what the recurrence actually reads. If row i depends only on row i-1, you keep
      two rows instead of n — or one row updated in the right direction. Fibonacci needs two
      numbers, not an array. Knapsack with a 2D table over items and capacity becomes one
      capacity-sized row iterated downwards, because iterating upwards would let an item be
      used twice. The cost is that you lose the table, so you can no longer reconstruct *which*
      choices produced the answer — only its value. If you need the choices, keep the table or
      store parent pointers.
    followUps:
      - "Why downwards specifically for 0/1 knapsack?"
resources:
  - title: "Erik Demaine — MIT 6.006 Dynamic Programming"
    url: https://ocw.mit.edu/courses/6-006-introduction-to-algorithms-fall-2011/
---

## The same computation, three times

```js
// 1. Naive recursion: O(2^n). fib(40) is about a billion calls.
function fib(n) {
  if (n <= 1) return n;
  return fib(n - 1) + fib(n - 2);
}

// 2. Memoised: O(n). Each value computed once.
function fibMemo(n, cache = new Map()) {
  if (n <= 1) return n;
  if (cache.has(n)) return cache.get(n);
  const result = fibMemo(n - 1, cache) + fibMemo(n - 2, cache);
  cache.set(n, result);
  return result;
}

// 3. Tabulated: O(n) time, and then O(1) space once you notice the
//    recurrence only looks back two steps.
function fibTable(n) {
  let prev = 0, curr = 1;
  for (let i = 2; i <= n; i++) [prev, curr] = [curr, prev + curr];
  return n <= 1 ? n : curr;
}
```

The three versions differ by a cache and a loop. Nothing clever happened — the exponential
version was simply recomputing.

:::what
**Dynamic programming** solves a problem by solving each distinct subproblem once and reusing
the result. **Memoisation** caches results of a recursive function (top-down). **Tabulation**
fills a table in dependency order (bottom-up). The problem must have **overlapping
subproblems** and **optimal substructure**.
:::

:::why
DP has a reputation for being hard, and the reputation comes from how it is usually taught —
as a list of recurrences to recognise. Derived instead from the recursion, it is mechanical.

The exponential cost in `fib` is not inherent to the problem. `fib(40)` calls `fib(38)` twice,
`fib(37)` three times, `fib(36)` five times — the call tree has a billion nodes and only 40
distinct values in it. Every one of those repeats is wasted work on a question already
answered.

So the actual skill is not memorising recurrences. It is the two-step process: write the
recursion that expresses the problem, then notice the repetition. Everything after that is
bookkeeping, and most of the apparent difficulty of DP lives in the first step — finding the
right definition of a subproblem — rather than in the caching.

The reason both properties are required is worth being precise about. Overlap makes caching
pay. Optimal substructure makes the recurrence *valid* — it says you can commit to the best
subsolution without worrying that a worse one might lead somewhere better overall. When that
fails, as it does for the longest simple path in a graph, no amount of caching helps, because
the recurrence itself is wrong.
:::

:::how
```text
  WHY fib IS EXPONENTIAL — the call tree

                     fib(5)
                   /        \
              fib(4)         fib(3)
             /     \         /     \
        fib(3)   fib(2)  fib(2)   fib(1)
        /    \    /   \   /   \
     fib(2) f(1) f(1) f(0) f(1) f(0)
     /   \
   f(1) f(0)

    fib(3) computed twice. fib(2) three times. The tree doubles at
    each level: O(2^n) nodes, and only n distinct values among them.

  WITH A CACHE — the tree becomes a DAG

                     fib(5)
                   /        \
              fib(4) ──────▶ fib(3) ──────▶ fib(2) ──▶ fib(1)
                                                  └──▶ fib(0)

    Each node computed once. O(n) nodes, O(n) edges.

    This is the general picture: DP turns a tree of overlapping
    recursive calls into a DAG of distinct subproblems, and the
    complexity becomes (number of states) × (work per state).


  THE FOUR-STEP RECIPE

    1. STATE       — what varies between subproblems? That is your
                     cache key and your table index.
    2. RECURRENCE  — how does a state's answer follow from smaller
                     states?
    3. BASE CASE   — the smallest states, answered directly.
    4. ORDER       — top-down with a cache, or bottom-up in an order
                     where dependencies are already filled.

    The complexity falls out: states × work-per-state.
    fib: n states, O(1) each → O(n).
    knapsack: n·W states, O(1) each → O(n·W).


  MEMOISATION → TABULATION, mechanically

    memo:   f(i) = g(f(i-1), f(i-2))        recursion, cache on entry
    table:  for i from base upward:         loop, same expression
              t[i] = g(t[i-1], t[i-2])

    The expression is identical. What changes is who guarantees the
    dependencies are ready: the recursion does it by calling them,
    the loop does it by ordering.
```
:::

:::example
```js
// A worked example end to end: 0/1 knapsack.
// n items with weights and values, capacity W, each item used 0 or 1 times.

// Step 1-3: state is (item index, remaining capacity).
function knapsackMemo(weights, values, W) {
  const cache = new Map();
  function best(i, cap) {
    if (i === weights.length || cap === 0) return 0;        // base
    const key = i * (W + 1) + cap;                          // flat key
    if (cache.has(key)) return cache.get(key);

    let result = best(i + 1, cap);                          // skip item i
    if (weights[i] <= cap) {                                // or take it
      result = Math.max(result, values[i] + best(i + 1, cap - weights[i]));
    }
    cache.set(key, result);
    return result;
  }
  return best(0, W);
}
// States: n × (W+1). Work per state: O(1). → O(n·W).
// Note this is NOT polynomial in the input SIZE — W is a value, and
// writing it takes log W bits. Knapsack is NP-hard; O(n·W) is
// "pseudo-polynomial", which is why it is fast for W = 1000 and
// useless for W = 2^40.

// Step 4 as a table.
function knapsackTable(weights, values, W) {
  const n = weights.length;
  const t = Array.from({ length: n + 1 }, () => new Array(W + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let cap = 0; cap <= W; cap++) {
      t[i][cap] = t[i + 1][cap];
      if (weights[i] <= cap) {
        t[i][cap] = Math.max(t[i][cap], values[i] + t[i + 1][cap - weights[i]]);
      }
    }
  }
  return t[0][W];
}

// Space reduced to one row. The direction is the subtle part.
function knapsackRow(weights, values, W) {
  const t = new Array(W + 1).fill(0);
  for (let i = 0; i < weights.length; i++) {
    for (let cap = W; cap >= weights[i]; cap--) {       // DOWNWARD
      t[cap] = Math.max(t[cap], values[i] + t[cap - weights[i]]);
    }
  }
  return t[W];
}
// Downward because `t[cap - weights[i]]` must still hold the value
// from BEFORE item i was considered. Iterating upward would read a
// cell already updated with item i, allowing the item to be used
// twice — which is a different problem (unbounded knapsack), and is
// in fact exactly how you solve that one. One loop direction
// distinguishes two problems.
```
:::

:::failure
**A state that does not capture everything the answer depends on.** The most common real error,
and it produces wrong answers rather than slow ones:

```js
// "Longest increasing subsequence" with state = index only.
function lis(a, i) { ... }     // not enough: the answer depends on
                               // what the previous chosen element was
// Either add it to the state, or redefine the subproblem as
// "LIS ending at i", which makes the previous element implicit.
```

Redefining the subproblem is usually better than widening the state, and finding that
definition is most of the difficulty in DP.

**Caching on a mutable key.** Same hazard as everywhere else:

```js
cache.set(arrayOfChoices, result);   // the array is mutated later
// Use an immutable, canonical key: a string, a flat integer index,
// or a tuple of primitives.
```

**A cache key that misses part of the state.** Caching `best(i)` when the function also depends
on `cap` returns a value computed for a different capacity. Silent, and completely wrong.

**Memoising a function with side effects.** The cache returns the value and skips the effect, so
the second call behaves differently from the first.

**Recursion depth on large inputs.** `fibMemo(100000)` overflows the stack even though it is
O(n) — the memoisation fixes the time and not the depth. That is the main practical reason to
convert to a table.

**Tabulating in the wrong order.** A cell read before it is written yields a base-case value
instead of the real one. The dependency direction of the recurrence dictates the loop direction,
which is why the knapsack row goes downward.

**Reducing space and then needing the choices.**

```js
// t[W] gives the best VALUE. Which items achieved it?
// With only one row, you cannot tell — the history is gone.
// Keep the full table and walk back through it, or store a parent
// pointer per state.
```

**Assuming optimal substructure.** The longest *simple* path in a graph has overlapping
subproblems and no optimal substructure: the longest path to an intermediate node may use nodes
you later need, so composing optimal subpaths can produce an invalid path. DP does not apply,
and the problem is NP-hard.
:::

:::realworld
```text
// Where DP is actually running.

  diff and git             — longest common subsequence, which is why
                              `git diff` output is minimal rather than
                              just "these lines differ".
  Spell check / fuzzy      — edit distance (Levenshtein), used by
  search                      search engines, Postgres pg_trgm, and
                              every "did you mean".
  Sequence alignment       — Needleman-Wunsch and Smith-Waterman in
                              bioinformatics are edit distance with a
                              scoring matrix.
  Query planners           — Postgres uses DP over subsets of
                              relations to choose a join order, which
                              is why it switches to a genetic
                              algorithm past ~12 tables: the DP is
                              O(2^n).
  Text layout              — Knuth-Plass line breaking in TeX
                              minimises total badness over the whole
                              paragraph, which is why TeX's paragraphs
                              look better than greedy line breaking.
  Video and image codecs   — rate-distortion optimisation, Viterbi
                              decoding.
  Speech recognition       — the Viterbi algorithm is DP over hidden
                              states.
  Resource allocation      — knapsack variants in scheduling, ad
                              auctions, and portfolio selection.
```

```js
// Edit distance, because it is the one you are most likely to need.
function editDistance(a, b) {
  // One row, because row i depends only on row i-1.
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const curr = [i];
    for (let j = 1; j <= b.length; j++) {
      curr[j] = a[i - 1] === b[j - 1]
        ? prev[j - 1]                                    // match: free
        : 1 + Math.min(prev[j - 1], prev[j], curr[j - 1]); // sub, del, ins
    }
    prev = curr;
  }
  return prev[b.length];
}
// O(a·b) time, O(b) space. The three options in the min are the three
// edit operations, which is the clearest case of a recurrence that is
// just "enumerate the choices and take the best".
```

```text
// A production note worth having: DP is often the wrong answer
// because the inputs are large.
//
//   Edit distance on two 1 MB files is 10^12 cells. Nobody does that.
//   Real diff tools use Myers' algorithm (O(ND), fast when the files
//   are similar), heuristics to anchor on unique lines, and bail out
//   on pathological inputs.
//
// The textbook recurrence is the foundation. Production
// implementations add input-dependent shortcuts, which is a general
// pattern: the asymptotically clean algorithm plus real-world
// heuristics beats either alone.
```
:::

:::mistakes
**An incomplete state.** The commonest source of wrong answers. Make sure the key captures
everything the value depends on.

**Widening the state instead of redefining the subproblem.** "LIS ending at i" is better than
carrying the previous element around.

**Mutable cache keys.**

**Memoising something with side effects.**

**Assuming memoisation fixes the recursion depth.** It fixes time, not stack.

**Tabulating against the dependency direction.**

**Reducing space and then needing the path.** Keep the table or parent pointers.

**Calling O(n·W) polynomial.** It is pseudo-polynomial: W is a value, not a size.

**Reaching for DP without checking optimal substructure.** Overlap alone is not enough.

**Using DP where greedy suffices.** If a greedy choice is provably safe — as in Dijkstra or
Huffman — it is simpler and faster. DP is for when you must consider the alternatives.
:::

:::tradeoffs
**Naive recursion** — closest to the problem statement, easiest to verify, exponential. Still
worth writing first: it is the thing you then memoise.

**Memoisation** — add a cache to the recursion, so only reachable states are computed. Keeps
the readable recursive shape, costs stack depth and hash-map constants. Best when the state
space is sparse.

**Tabulation** — no recursion so no overflow, better constants and locality, computes every
state whether needed or not, and requires you to work out the fill order. Best when the state
space is dense and depth is a risk.

**Space-reduced tabulation** — O(1) or O(one row) memory, and you lose the ability to
reconstruct the decisions. Fine when only the value matters.

**Greedy** — far simpler and faster when a local choice is provably globally safe. Check
whether it is before building a table.

**Approximation or heuristics** — when the state space is genuinely too large. Knapsack with
W = 2⁴⁰ is not a DP problem; it is an approximation problem.

The habit that makes this tractable: **write the recursion, identify the state, then decide
where to put the cache.** DP is not a list of recurrences to recognise — it is a transformation
you apply to a recursion you already wrote.
:::

:::checkpoint
1. Which two properties must hold? Give a problem with each one missing.
2. Why is `fib` exponential when it only has n distinct answers?
3. What is the general complexity formula for a DP?
4. Give the mechanical route from a memoised function to a table. What changes and what stays?
5. Why does the one-row knapsack iterate capacity downwards? What problem does iterating
   upwards solve?
6. Why does memoisation not prevent a stack overflow?
7. You reduce a DP to one row and now need to know which items were chosen. What went wrong?
8. Why is O(n·W) knapsack not a polynomial-time algorithm?
:::

:::interview
Define DP as a transformation rather than a category, because that is what makes it usable:

*"It is recursion plus a cache, applied when the recursion solves the same subproblem
repeatedly. `fib` is exponential with only n distinct answers in the whole call tree — every
repeat is work on a question already answered. So the method is: write the recursion that
expresses the problem, identify what varies between calls, and cache on that."*

Name both conditions and show you know why each is needed:

*"Overlapping subproblems is what makes the cache pay — mergesort has optimal substructure with
no overlap, so caching buys nothing and it is just divide-and-conquer. Optimal substructure is
what makes the recurrence *valid*: it says committing to the best subsolution is safe. The
longest simple path in a graph has overlap and no optimal substructure, because composing
optimal subpaths can revisit a node, so no amount of caching helps — the recurrence is wrong."*

Then demonstrate the mechanical part, which is what the interviewer actually wants to see you
do:

*"I start top-down, because the recursion is the part I can reason about, and convert to a table
if depth is a risk — memoisation fixes the time and not the stack. The conversion is mechanical:
the expression is identical, and what changes is whether the dependencies are guaranteed by
calling them or by the loop order. And the complexity falls out as states times work per state,
which is also how I sanity-check that my state definition is not too wide."*

One detail worth having ready: *"for 0/1 knapsack reduced to a single row, the capacity loop goes
downwards, so the cell I read still holds the value from before this item. Upwards would let the
item be used twice — which is exactly how you solve unbounded knapsack. One loop direction
distinguishes two problems."*
:::

## What you now know

- DP is recursion plus a cache, applicable when subproblems overlap.
- It turns a tree of recursive calls into a DAG of distinct states.
- Both properties are required: overlap makes caching pay, optimal substructure makes the
  recurrence valid.
- Mergesort has optimal substructure without overlap; longest simple path has the reverse.
- The recipe: state, recurrence, base case, order.
- Complexity is (number of states) × (work per state).
- Memoisation computes only reachable states and keeps the recursive shape — and the stack depth.
- Tabulation avoids recursion and requires you to find the dependency order.
- The memo-to-table conversion keeps the expression and changes who orders the dependencies.
- An incomplete state is the main source of silently wrong answers.
- Redefining the subproblem usually beats widening the state.
- Space reduction loses the ability to reconstruct the choices.
- O(n·W) is pseudo-polynomial: W is a value, not an input size.
- Check whether a greedy choice is safe before building a table.
