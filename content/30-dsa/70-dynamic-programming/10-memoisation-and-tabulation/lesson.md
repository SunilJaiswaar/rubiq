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

```ruby
# 1. Naive recursion: O(2^n). fib(40) is about a billion calls.
def fib(n) = n <= 1 ? n : fib(n - 1) + fib(n - 2)

# 2. Memoised: O(n). Each value computed once.
def fib_memo(n, cache = {})
  return n if n <= 1
  cache[n] ||= fib_memo(n - 1, cache) + fib_memo(n - 2, cache)
end

# 3. Tabulated: O(n) time, and then O(1) space once you notice the
#    recurrence only looks back two steps.
def fib_table(n)
  return n if n <= 1
  prev = 0
  curr = 1
  (2..n).each { prev, curr = curr, prev + curr }
  curr
end

fib_memo(40)    # => 102334155
fib_table(40)   # => 102334155
```

Four Ruby details, and the first two are the reason this is shorter than it looks.

`cache[n] ||= ...` is the whole memoisation. It reads the cache, computes only on a miss, stores,
and returns — the four lines of the explicit version collapsed into one. The caveat is that `||=`
treats `nil` and `false` as misses, so it is wrong for any memo whose legitimate answer can be
`false` or `nil`; there you need `cache.fetch(n) { cache[n] = ... }` or an explicit
`cache.key?(n)` check. A memo of booleans written with `||=` recomputes every `false` forever,
which turns an O(n) solution back into an exponential one with no visible symptom.

`cache = {}` as a default argument is safe here, which is worth saying explicitly for anyone
arriving from Python: Ruby evaluates default arguments on *every* call, so each top-level call
gets a fresh Hash. Python's famous mutable-default-argument bug has no Ruby equivalent.

`prev, curr = curr, prev + curr` is parallel assignment — the right-hand side is fully evaluated
before anything is assigned, which is exactly what this recurrence needs. Writing it as two
statements reads `prev`'s new value when computing `curr` and silently gives the wrong sequence.

And the arithmetic is exact. Ruby Integers are arbitrary precision, so `fib(200)` is the true
42-digit answer. In a language backed by 64-bit doubles the first wrong answer is `fib(79)` =
14,472,334,024,676,221, which is the first Fibonacci number above 2^53 — and it is wrong
*quietly*, returning a plausible integer that is simply not the right one. Here the only cost of
large values is that the additions get slower.

The idiomatic Ruby memo deserves its own look, because it is the version you will actually meet
in other people's code:

```ruby
FIB = Hash.new { |h, n| h[n] = n <= 1 ? n : h[n - 1] + h[n - 2] }

FIB[40]    # => 102334155
FIB[200]   # => 280571172992510140037611932413038677189525
```

A Hash whose default block fills itself in, recursively. The recursion runs through the Hash
rather than through a method, so the cache and the recurrence are the same object. It is lovely,
and it has two sharp edges: the depth of that recursion is still the depth of the dependency
chain, so `FIB[20_000]` raises `SystemStackError` where the iterative version does not — and
because it is a constant, the cache lives for the life of the process, which is a memory leak if
the key space is unbounded. Use it for small, fixed domains.

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
```ruby
# A worked example end to end: 0/1 knapsack.
# n items with weights and values, capacity W, each used 0 or 1 times.

# Steps 1-3: state is (item index, remaining capacity).
def knapsack_memo(weights, values, capacity)
  cache = {}
  best = lambda do |i, cap|
    return 0 if i == weights.size || cap.zero?           # base
    cache[[i, cap]] ||= begin                            # the state IS the key
      result = best.call(i + 1, cap)                     # skip item i
      if weights[i] <= cap                               # or take it
        result = [result, values[i] + best.call(i + 1, cap - weights[i])].max
      end
      result
    end
  end
  best.call(0, capacity)
end

knapsack_memo([2, 3, 4, 5], [3, 4, 5, 6], 5)   # => 7
```

`cache[[i, cap]]` is the detail worth stopping on. Ruby Arrays are valid Hash keys and hash *by
value*, so the tuple of state variables is the cache key directly — no flat-index arithmetic like
`i * (W + 1) + cap`, no string building, no risk of two different states colliding on one key.
That flat-key trick exists in other languages only because their maps hash objects by identity.

The one thing to know about it: a mutated key becomes unfindable.

```ruby
key = [1, 2]
cache = { key => 'x' }
key << 3
cache[[1, 2, 3]]   # => nil     the stored hash code is stale
cache[[1, 2]]      # => nil     and the old value no longer matches
cache.rehash
cache[[1, 2, 3]]   # => "x"     repaired
```

So build the key fresh each time, as above, and never hold a reference to a key you then mutate.
`freeze` the array if you want the guarantee enforced.

States: n × (W+1). Work per state: O(1). So O(n·W) — and note this is **not** polynomial in the
input *size*. W is a value, and writing it takes log W bits. Knapsack is NP-hard; O(n·W) is
"pseudo-polynomial", which is why it is fast for W = 1,000 and useless for W = 2^40.

```ruby
# Step 4 as a table.
def knapsack_table(weights, values, capacity)
  n = weights.size
  # The BLOCK form. `Array.new(n + 1, Array.new(capacity + 1, 0))` would
  # store the same row n+1 times, and every write would hit every row.
  t = Array.new(n + 1) { Array.new(capacity + 1, 0) }
  (n - 1).downto(0) do |i|
    (0..capacity).each do |cap|
      t[i][cap] = t[i + 1][cap]
      next unless weights[i] <= cap
      t[i][cap] = [t[i][cap], values[i] + t[i + 1][cap - weights[i]]].max
    end
  end
  t[0][capacity]
end

# Space reduced to one row. The direction is the subtle part.
def knapsack_row(weights, values, capacity)
  t = Array.new(capacity + 1, 0)
  weights.each_with_index do |w, i|
    capacity.downto(w) do |cap|                 # DOWNWARD
      t[cap] = [t[cap], values[i] + t[cap - w]].max
    end
  end
  t[capacity]
end
```

Downward because `t[cap - w]` must still hold the value from *before* item i was considered.
Iterating upward reads a cell already updated with item i, which lets the item be used twice —
a different problem entirely, and in fact exactly how you solve that one:

```ruby
knapsack_row([2], [3], 6)        # => 3   each item once
knapsack_unbounded([2], [3], 6)  # => 9   the same item three times
```

One loop direction distinguishes two problems. `capacity.downto(w)` also encodes the lower bound
in the iterator rather than in an `if`, which is both shorter and harder to get wrong than a
C-style loop with a decrementing index.
:::

:::failure
**A state that does not capture everything the answer depends on.** The most common real error,
and it produces wrong answers rather than slow ones:

```ruby
# "Longest increasing subsequence" with state = index only.
def lis(a, i)
  # Not enough: the answer depends on what the previous chosen
  # element was, and `i` does not record it.
end
# Either add it to the state, or redefine the subproblem as
# "LIS ending at i", which makes the previous element implicit.
```

Redefining the subproblem is usually better than widening the state, and finding that
definition is most of the difficulty in DP.

**Caching on a mutable key.** Same hazard as everywhere else:

```ruby
choices = [1, 2]
cache[choices] = result
choices << 3            # the key's hash is now stale
cache[choices]          # => nil, and the entry is unreachable
```

Ruby hashes Arrays and Strings by value, which is what makes tuple keys work at all — and it is
also why mutating one after storing it strands the entry. Build the key fresh from the state
variables, or `freeze` it. `cache.rehash` repairs an already-broken Hash, but needing it means
something is holding a reference it should not.

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

```ruby
# t[capacity] gives the best VALUE. Which items achieved it?
# With only one row, you cannot tell — the history is gone.
# Keep the full table and walk back through it, or store a parent
# pointer per state.
#
# This is the trade the space optimisation actually makes, and it is
# usually the wrong one in application code: "the best total is 7" is
# rarely the answer anyone wanted, and "take items 0 and 1" is.
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

```ruby
# Edit distance, because it is the one you are most likely to need.
def edit_distance(a, b)
  # One row, because row i depends only on row i-1.
  prev = (0..b.size).to_a
  (1..a.size).each do |i|
    curr = [i]
    (1..b.size).each do |j|
      curr[j] = if a[i - 1] == b[j - 1]
                  prev[j - 1]                                  # match: free
                else
                  1 + [prev[j - 1], prev[j], curr[j - 1]].min  # sub, del, ins
                end
    end
    prev = curr
  end
  prev[b.size]
end

edit_distance('kitten', 'sitting')   # => 3
```

O(a·b) time, O(b) space. The three options in the `min` are the three edit operations, which is
the clearest case of a recurrence that is just "enumerate the choices and take the best".

`(0..b.size).to_a` builds the first row — `[0, 1, 2, ...]`, the cost of deleting j characters —
in one expression, and `[x, y, z].min` takes three arguments where `Math.min` needs a spread.
Note also that `a[i - 1]` on a Ruby String gives a one-character String, not a byte or a
codepoint, so this compares characters and works on `"café"` as you would hope. It is still not
grapheme-aware: `"e\u0301"` is two characters to Ruby and one to a reader, so edit distance over
user-visible text wants `each_grapheme_cluster.to_a` rather than raw indexing.

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
- `cache[n] ||= ...` is the whole memo — but it treats `nil` and `false` as misses, so a memo of
  booleans recomputes every `false` forever. Use `fetch`/`key?`, or tabulate.
- Ruby Arrays hash by value, so `cache[[i, cap]]` needs no flat-key arithmetic; mutating a stored
  key strands the entry until `rehash`.
- `Array.new(n) { [] }` builds n rows; `Array.new(n, [])` builds one row n times.
- Default arguments are evaluated per call, so `cache = {}` is safe — unlike Python.
- Parallel assignment evaluates the whole right-hand side first, which is what makes the
  two-scalar recurrences correct.
- Integers are arbitrary precision: `fib(200)` is exact, where 64-bit doubles go wrong silently
  from `fib(79)` onward.
- A self-referential `Hash.new { |h, n| h[n] = ... }` is an elegant memo, but it recurses as deep
  as the dependency chain and never frees its cache.
