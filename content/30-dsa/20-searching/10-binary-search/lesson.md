---
title: Binary search, including the parts that break
summary: The algorithm is four lines. Getting those four lines right took the industry about four decades.
level: basic
minutes: 17
version: "n/a"
status: stable
last_reviewed: "2026-09-20"
tags: [dsa, binary-search, algorithms, invariants]
concepts: [binary-search, invariants, overflow, loop-termination]
prerequisites: [complexity, big-o]
interview:
  - question: Implement binary search. Then tell me what edge cases you had to think about.
    level: basic
    answer: >-
      The loop is `while low <= high`, midpoint is `low + (high - low) / 2`, and on a miss
      you move `low = mid + 1` or `high = mid - 1`. The edge cases that actually break
      implementations are: the empty array; a target smaller than everything or larger than
      everything; `low <` versus `low <=` in the condition, which determines whether a
      single-element range is ever examined; forgetting the `+ 1` / `- 1`, which makes the
      range stop shrinking and loops forever; and integer overflow in `(low + high) / 2`
      in fixed-width languages.
    followUps:
      - "Why `low + (high - low) / 2` rather than `(low + high) / 2`?"
      - "How would you change it to find the *first* occurrence of a duplicated value?"
  - question: Binary search is O(log n). What does the input have to guarantee for that to hold?
    level: basic
    answer: >-
      Sorted order, and O(1) random access. Sorted order is what makes a comparison
      eliminate half the remaining candidates; random access is what makes jumping to the
      midpoint free. On a linked list the sort order still holds, but reaching the midpoint
      costs O(n) steps, so binary search degrades to O(n) — worse than a plain scan, since
      it also does the comparisons.
    followUps:
      - "So when is it worth sorting first in order to binary search?"
  - question: When would you NOT use binary search on sorted data?
    level: intermediate
    answer: >-
      When the array is small enough that a linear scan's better cache locality wins — a
      sequential scan of 50 contiguous elements is typically faster than 6 cache-missing
      jumps. When you will search only once and the data is unsorted, since sorting costs
      O(n log n) and one scan costs O(n). And when you need something a hash does better:
      if you only need exact-match membership and have the memory, a hash set is O(1).
      Binary search earns its place when you need *ordering* as well — nearest value,
      ranges, first element above a bound.
resources:
  - title: "Jon Bentley, Programming Pearls — on the bug in binary search"
    url: https://research.google/blog/extra-extra-read-all-about-it-nearly-all-binary-searches-and-mergesorts-are-broken/
---

## The idea takes one sentence

The target is in a sorted array. Look at the middle. If the middle is too big, the target
must be in the left half. If too small, the right half. Repeat.

Each comparison eliminates half of what is left.

:::what
**Binary search** finds a value in a sorted, randomly accessible collection in O(log n)
comparisons, by repeatedly halving the range that could still contain it.
:::

:::why
```text
  linear search on 1,000,000 sorted items:  up to 1,000,000 comparisons
  binary search on 1,000,000 sorted items:  at most 20

  1,000,000 → 500,000 → 250,000 → 125,000 → 62,500 → 31,250 → 15,625
  → 7,813 → 3,907 → 1,954 → 977 → 489 → 245 → 123 → 62 → 31 → 16 → 8 → 4 → 2 → 1

  That is 20 steps. Doubling the data adds ONE step.
```

A billion items takes 30 comparisons. This is the most favourable trade in everyday
computing, and it is why sorted order is worth maintaining.
:::

## Writing it

```ruby runnable
def binary_search(array, target)
  low = 0
  high = array.length - 1

  while low <= high
    mid = low + (high - low) / 2

    if array[mid] == target
      return mid
    elsif array[mid] < target
      low = mid + 1
    else
      high = mid - 1
    end
  end

  nil
end

data = [1, 3, 5, 7, 9, 11, 13]
data.each_with_index { |v, i| print "#{i}:#{v}  " }
puts "\n"
puts "find 7  → index #{binary_search(data, 7).inspect}"
puts "find 1  → index #{binary_search(data, 1).inspect}"
puts "find 13 → index #{binary_search(data, 13).inspect}"
puts "find 8  → #{binary_search(data, 8).inspect}"
puts "find 0  → #{binary_search(data, 0).inspect}"
puts "empty   → #{binary_search([], 5).inspect}"
```

Four lines of logic. Now the part that matters.

## The history: this is genuinely hard to get right

:::history
Binary search was first published in 1946. **The first correct published implementation
appeared in 1962** — sixteen years later.

In 1986 Jon Bentley asked a room of professional programmers to write it, with time to
check their work. Ninety percent produced buggy code.

In 2006 Joshua Bloch found a bug in `java.util.Arrays.binarySearch` — in the Java
standard library, written by experts, reviewed, and shipped to millions of developers. It
had been there for nine years. The same bug was in the JDK's merge sort and in Bentley's
own published version.

The reason it is hard is that the algorithm is simple and the *boundaries* are not. There
are four independent decisions — the loop condition, how the midpoint is computed, and
each of the two range updates — and getting any one wrong produces code that works on
most inputs.
:::

:::failure
**Bug 1: integer overflow.** This was the Java bug.

```text
  mid = (low + high) / 2
```

With `low = 1,500,000,000` and `high = 2,000,000,000` in a 32-bit signed integer, the sum
is 3.5 billion. The maximum is about 2.1 billion. It overflows to a negative number,
`mid` becomes negative, and the array access throws.

The fix:

```text
  mid = low + (high - low) / 2
```

Algebraically identical, and `high - low` can never overflow because it is smaller than
`high`. Ruby has arbitrary-precision integers so this specific bug cannot occur — but
write the safe form anyway, because the habit transfers to every language where it can,
and that is most of them.

**Bug 2: the loop never terminates.** Drop the `+ 1`:

```ruby runnable
def broken_search(array, target)
  low, high = 0, array.length - 1
  iterations = 0

  while low <= high
    iterations += 1
    return "found after #{iterations}" if iterations > 20   # circuit breaker

    mid = low + (high - low) / 2
    return mid if array[mid] == target

    if array[mid] < target
      low = mid          # BUG: should be mid + 1
    else
      high = mid - 1
    end
  end
  nil
end

puts broken_search([1, 3, 5], 4).inspect
```

With `low = 1, high = 2`, `mid` is 1. If `array[1] < target`, we set `low = 1` — unchanged.
Next iteration computes the same `mid`, the same comparison, the same assignment. Forever.

Without the circuit breaker that is a hung process. **The `+ 1` is what guarantees the
range shrinks every iteration**, which is what guarantees termination.

**Bug 3: `<` instead of `<=`.**

```ruby runnable
def off_by_one(array, target)
  low, high = 0, array.length - 1
  while low < high            # BUG: should be <=
    mid = low + (high - low) / 2
    return mid if array[mid] == target
    array[mid] < target ? low = mid + 1 : high = mid - 1
  end
  nil
end

puts "find 5 in [1,3,5]: #{off_by_one([1, 3, 5], 5).inspect}  (should be 2)"
puts "single element:    #{off_by_one([42], 42).inspect}  (should be 0)"
```

With `low == high` the range holds exactly one candidate — and `while low < high` exits
without examining it. So the last remaining element is never checked, and the search fails
for any target that happens to land there. It works on most inputs, which is exactly what
makes it dangerous.
:::

## The reason to think in invariants

Memorising the four lines gets you through one interview. Reasoning about the invariant
gets the variants right too.

:::internals
The invariant is one sentence:

> **If the target is in the array, it is at an index in `low..high`.**

Check it at each step:

- **Initially** `low = 0`, `high = length - 1`, so the range is the whole array. True.
- **When `array[mid] < target`:** every index from `low` to `mid` holds a value less than
  or equal to `array[mid]`, which is less than the target. So the target cannot be at any
  of them, and `low = mid + 1` is the smallest range that still satisfies the invariant.
- **When `array[mid] > target`:** symmetrically, `high = mid - 1`.
- **Each iteration shrinks the range** because `mid` is always within `low..high` and both
  updates exclude it.
- **The loop ends when `low > high`** — an empty range. By the invariant, if the target
  were present it would be in that range. The range is empty. Therefore it is absent.

Now the three bugs are not three facts to memorise. They are one idea:

| Bug | Which part of the invariant breaks |
|---|---|
| `low = mid` instead of `mid + 1` | The range stops shrinking → never terminates |
| `while low < high` | A non-empty range (`low == high`) goes unexamined → wrong answer |
| `(low + high) / 2` | `mid` falls outside `low..high` → invariant violated → crash |

Every binary search variant is this invariant with the comparison adjusted.
:::

## The variants that actually come up

Exact-match binary search is the textbook case. In practice you more often want a
*boundary*.

```ruby runnable
# "Leftmost index where the value is >= target" — lower bound.
# Note: no equality check at all, and the loop condition is `<`, not `<=`.
def lower_bound(array, target)
  low, high = 0, array.length    # note: length, not length - 1
  while low < high
    mid = low + (high - low) / 2
    if array[mid] < target
      low = mid + 1
    else
      high = mid                 # keep mid as a candidate
    end
  end
  low
end

data = [1, 3, 3, 3, 7, 9]
puts "data: #{data.inspect}"
puts "first index of 3:        #{lower_bound(data, 3)}"
puts "insertion point for 5:   #{lower_bound(data, 5)}"
puts "insertion point for 0:   #{lower_bound(data, 0)}"
puts "insertion point for 99:  #{lower_bound(data, 99)}"
```

:::note
Three deliberate differences from the exact-match version, and each follows from a
different invariant:

- `high = array.length`, not `length - 1`, because "insert at the end" is a valid answer.
- `while low < high`, because the invariant here is *"the answer is in `low..high`"* where
  `high` is exclusive — so `low == high` means the answer is found, not unexamined.
- `high = mid` rather than `mid - 1`, because `mid` might itself be the leftmost match and
  must stay a candidate.

This is why invariant reasoning beats memorisation: the exact-match template would give
you the wrong answer here, and you cannot patch your way to the right one by adjusting
signs until the tests pass.
:::

```ruby runnable
# Ruby's own bsearch does this for you, in two modes.
data = [1, 3, 3, 3, 7, 9]

# find-minimum mode: block returns true/false, finds the first true.
p data.bsearch { |x| x >= 3 }      # 3  (the value, not the index)
p data.bsearch { |x| x >= 5 }      # 7

# find-any mode: block returns -1 / 0 / 1 like a comparison.
p data.bsearch { |x| 7 <=> x }     # 7

# And for insertion points, Array#bsearch_index:
p data.bsearch_index { |x| x >= 5 }
```

**Use the standard library.** `bsearch` is correct, tested, and does not have the three
bugs. Write your own when an interviewer asks, and when reaching for one in real code,
reach for the one someone else has already debugged.

:::realworld
Binary search shows up in places that are not obviously searches:

```ruby
# 1. Finding the right time bucket in a sorted series — rate limiting, log analysis.
timestamps.bsearch_index { |t| t >= window_start }

# 2. "Binary searching" a deploy to find which commit broke something.
#    `git bisect` is literally this algorithm over commit history.

# 3. Finding the largest value that satisfies a monotonic predicate —
#    the biggest batch size that stays under a memory limit.
def largest_safe_batch(max_memory)
  low, high = 1, 100_000
  best = 1
  while low <= high
    mid = low + (high - low) / 2
    if memory_for(mid) <= max_memory
      best = mid
      low = mid + 1
    else
      high = mid - 1
    end
  end
  best
end
```

That third pattern — **binary searching over an answer space rather than an array** — is
the one that unlocks a surprising number of problems. It works whenever the predicate is
monotonic: once it becomes false it stays false. The "array" is conceptual.

And a database B-tree index, from the SQL track, is binary search generalised to disk
pages: each node holds hundreds of keys instead of one midpoint, which is the same
idea tuned for the fact that a disk read costs the same whether you read 8 bytes or 8
kilobytes.
:::

:::tradeoffs
Binary search buys O(log n) lookups. The price is paid elsewhere, and it is easy to
overlook because it does not appear in the search itself.

**You must maintain sorted order.** Inserting into a sorted array is O(n), because
elements have to move. So a collection that is searched often and written rarely is ideal;
one written constantly is not — you would pay O(n) per insert to save O(n) per search.

**You give up O(1).** A hash set answers exact-match membership in constant time, which is
asymptotically better. Binary search is the right choice only when you also need *order* —
nearest value, ranges, "first element after X", sorted iteration.

**It is cache-hostile at small sizes.** Each step jumps to an unpredictable address.
Fifty sequential reads sit in one or two cache lines; six binary-search jumps are six
potential cache misses, which is why a scan wins below roughly 50 elements.

The structure that resolves all three is a balanced tree — O(log n) search *and* O(log n)
insert while staying ordered. That is exactly what a database B-tree index is, and why
indexes cost something on every write.
:::

:::performance
Binary search is not automatically the right choice on sorted data.

| Situation | Better choice | Why |
|---|---|---|
| Fewer than ~50 elements | Linear scan | Sequential memory access is cache-friendly; 6 jumps cause 6 cache misses |
| Exact match only, memory available | Hash set — O(1) | Beats O(log n), and no sorting needed |
| Linked list | Linear scan | Reaching the midpoint is O(n), so binary search becomes O(n) *plus* comparisons |
| One search on unsorted data | Linear scan — O(n) | Sorting first costs O(n log n) for a single query |
| Many searches on unsorted data | Sort once, then binary search | O(n log n) + O(k log n) beats O(k·n) |

The last two rows are the decision worth internalising: whether to sort first depends
entirely on how many times you will search.

Binary search keeps its advantage over hashing only when you need **order**: nearest
value, range queries, "first element after X", or iterating in sorted sequence. That is
also exactly why databases use B-trees rather than hash indexes for most purposes.
:::

:::mistakes
**Binary searching unsorted data.** It returns a wrong answer rather than an error, which
makes it a quiet bug. If the sort order comes from somewhere else, assert it in
development.

**Searching on one key while sorted by another.** A list of records sorted by `created_at`
cannot be binary searched by `name`. Obvious written down, easy to do when the sort
happens three functions away.

**Returning a boolean when you needed the index.** And returning `-1` for "not found" when
`0` is a valid index — `nil` or a lower-bound insertion point is almost always more
useful.

**Reaching for a hand-written one.** Three documented bug classes and a forty-year
industry track record of getting it wrong. In real code, use `bsearch`.
:::

:::checkpoint
Modify the exact-match implementation so that, when the target appears several times, it
returns the index of the **last** occurrence.

Two questions to answer first, in this order:
1. What is the invariant for "the last occurrence is in `low..high`"?
2. Which of the four decisions — loop condition, midpoint, the two updates — has to change?

If you change the code first and then test until it passes, you will get something that
works on your examples and not in general. That is precisely the failure mode this lesson
is about.
:::

:::interview
Binary search is the most common "implement this" warm-up in existence, and it is not
really testing whether you know the algorithm.

**It is testing whether you handle boundaries deliberately.** So narrate them. Say "I will
use `low <= high` so that a single-element range still gets examined", and "`mid + 1`
rather than `mid`, so the range always shrinks and the loop terminates". Those two
sentences put you ahead of most candidates, who write the code silently and then hunt for
off-by-one errors when a test fails.

**Write `low + (high - low) / 2` and say why in one clause** — "to avoid overflow in
languages with fixed-width integers". It takes three seconds and it is a recognised signal,
because it is the actual bug that was in the JDK for nine years.

**Then test out loud,** in this order: empty array, single element, target at index 0,
target at the last index, target absent and smaller than everything, target absent and
larger than everything. If you reel those off without prompting, the interviewer has
learned what they wanted to know and will usually move straight to the follow-up.

**The follow-up is almost always a variant** — first occurrence, last occurrence,
insertion point, or rotated array. Which is why the invariant matters more than the
template.
:::

## What you now know

- Each comparison halves the candidate range: 20 steps for a million items, 30 for a
  billion. Doubling the data adds one step.
- It requires sorted order *and* O(1) random access. On a linked list it is worse than a
  scan.
- Three classic bugs: overflow in `(low + high) / 2`, a range that stops shrinking
  (`low = mid`), and `while low < high` leaving one element unexamined.
- The invariant — *if the target is present, it is within `low..high`* — explains all three
  and is what you need for the variants.
- `lower_bound` is a different invariant, not the exact-match template with tweaks.
- Use `Array#bsearch` and `bsearch_index` in real code.
- Binary searching over an *answer space* works for any monotonic predicate, and is a much
  wider tool than searching an array.
