---
title: Two pointers
summary: How a nested loop becomes one pass — and the property the input must have for that to be valid rather than merely faster.
level: basic
minutes: 16
version: "1"
status: stable
last_reviewed: "2026-10-07"
tags: [dsa, arrays, two-pointers, sorting]
concepts: [two-pointers, invariants, sorted-input]
prerequisites: [big-o]
interview:
  - question: When can you use two pointers instead of a nested loop?
    level: basic
    answer: >-
      When you can decide, from looking at the current pair, which pointer to move — and be
      certain that the discarded possibilities could not have been answers. On a sorted
      array that certainty comes from the ordering: if the sum is too small, no pair using
      the current left element and a *smaller* right element can be large enough, so the
      entire left column is eliminated by moving left forward. Without that property you are
      just guessing which pointer to move, and the algorithm is wrong rather than slow.
    followUps:
      - "What is the complexity, including the sort?"
  - question: Two pointers reduces O(n²) to O(n). Why is the overall answer sometimes O(n log n)?
    level: basic
    answer: >-
      Because the technique usually needs sorted input, and sorting costs O(n log n), which
      dominates the O(n) scan. That is still a large improvement over O(n²), and it is worth
      stating in an interview because it shows you are accounting for the whole solution. If
      the input arrives sorted, or if a `Set` can replace the sort, you can get the full
      O(n).
    followUps:
      - "When would you use a Set instead?"
  - question: For two-sum, when is a Hash better than two pointers?
    level: basic
    answer: >-
      When the array is unsorted and you need the original indices. The hash approach is
      O(n) time and O(n) space and never reorders anything. Two pointers is O(n log n) if you
      must sort, and sorting destroys the indices unless you sort pairs of value and index.
      Two pointers wins when the input is already sorted, when you need O(1) extra space, or
      when the problem is about a *range* rather than an exact target — a Hash cannot
      answer "the closest sum to X" in one pass.
    followUps:
      - "Which would you use for three-sum, and why?"
resources:
  - title: "Sedgewick & Wayne — Algorithms"
    url: https://algs4.cs.princeton.edu/home/
---

## The problem

```ruby
# Find two numbers in a sorted array that sum to the target.
nums = [2, 7, 11, 15, 19, 24]
target = 26

# Obvious version: check every pair.
def two_sum_slow(nums, target)
  nums.each_index do |i|
    ((i + 1)...nums.size).each do |j|
      return [i, j] if nums[i] + nums[j] == target
    end
  end
  nil
end
# n = 100,000 → about 5,000,000,000 comparisons.
```

```ruby
# Two pointers: one pass.
def two_sum(nums, target)
  lo = 0
  hi = nums.size - 1
  while lo < hi
    sum = nums[lo] + nums[hi]
    return [lo, hi] if sum == target

    if sum < target
      lo += 1   # need more → the only way is a bigger small number
    else
      hi -= 1   # need less → the only way is a smaller big number
    end
  end
  nil
end
# n = 100,000 → at most 100,000 comparisons.
```

:::what
**Two pointers** means walking two indices through a sequence under a rule that moves at
least one of them forward on every step, so the total work is proportional to the length
rather than to the number of pairs.
:::

:::why
The nested loop examines every pair because it has no information to rule any of them out.
Two pointers works when the input *does* carry that information, and sortedness is the usual
form of it.

Look at what moving `lo` forward actually claims. The sum at `(lo, hi)` was too small. `hi`
is the largest remaining element, so every pair `(lo, j)` for `j < hi` has a sum that is
smaller still — none of them can reach the target. Advancing `lo` therefore discards an
entire column of the pair matrix in one step, and the discard is *provably* safe.

That is the whole technique, and the reason it is worth understanding rather than memorising:
the speed is a consequence of the elimination argument, and if you cannot make the
elimination argument for your problem, the pattern does not apply. Two pointers on an
unsorted array is not a slower algorithm — it is an incorrect one.
:::

:::how
```text
  nums = [2, 7, 11, 15, 19, 24], target = 26

   lo                        hi
   2   7   11   15   19   24      2 + 24 = 26  ✓ found

  A case that moves:  target = 30

   lo                        hi
   2   7   11   15   19   24      2 + 24 = 26 < 30  → lo++
       lo                    hi
   2   7   11   15   19   24      7 + 24 = 31 > 30  → hi--
       lo                hi
   2   7   11   15   19   24      7 + 19 = 26 < 30  → lo++
           lo            hi
   2   7   11   15   19   24     11 + 19 = 30  ✓

  WHAT EACH MOVE ELIMINATES

    sum < target, so lo++ discards every pair (lo, j) for j <= hi,
    because nums[hi] is the largest available partner and even it
    was not enough.

           hi →
    lo  ┌─────────────────┐
     ↓  │ ░░░░░░░░░░░░░░░ │   ░ = eliminated by one lo++
        │                 │
        └─────────────────┘

  Each step removes a row or a column, and there are 2n of those,
  so the loop runs at most 2n times.
```
:::

:::example
```ruby
# The three canonical shapes. Learn these and most variants are obvious.

# 1. Opposite ends, converging — pair with a target property.
def palindrome?(str)
  lo = 0
  hi = str.length - 1
  while lo < hi
    return false if str[lo] != str[hi]

    lo += 1
    hi -= 1
  end
  true
end

# 2. Same direction, different speeds — in-place filtering.
#    `write` lags behind `read`, so the kept elements compact to the front.
#    The `!` is Ruby's convention for "this mutates its argument".
def remove_duplicates!(sorted)
  return 0 if sorted.empty?

  write = 1
  (1...sorted.size).each do |read|
    if sorted[read] != sorted[write - 1]
      sorted[write] = sorted[read]
      write += 1
    end
  end
  write          # the new length; O(1) extra space
end

# 3. Two sequences — merging.
def merge_sorted(a, b)
  out = []
  i = j = 0
  while i < a.size && j < b.size
    if a[i] <= b[j]
      out << a[i]
      i += 1
    else
      out << b[j]
      j += 1
    end
  end
  # Whichever side is left over is already sorted, so append it wholesale.
  out.concat(a[i..]).concat(b[j..])
end
# This is the merge step of merge sort, and `<=` rather than `<` is what
# makes it stable. That matters more in Ruby than in JavaScript: MRI's
# Array#sort is NOT stable, so a stable merge is something you build
# rather than something you inherit.
```
:::

:::failure
**Using it on unsorted input.** The elimination argument requires the ordering, so without it
the algorithm reports "not found" for pairs that exist:

```ruby
two_sum([1, 3, 2], 4)   # => nil. But 1 + 3 = 4 is right there, at [0, 1].

# lo=0 hi=2   1 + 2 = 3 < 4  → lo += 1
# lo=1 hi=2   3 + 2 = 5 > 4  → hi -= 1
# lo=1 hi=1   lo < hi is false → nil
#
# The pair at indices 0 and 1 was never compared. Advancing `lo` past
# index 0 threw away the only element that could have completed the sum,
# because on unsorted input "the sum is too small" does not imply
# "no larger partner exists to the left".
```

**Returning indices after sorting.** Sorting moves the elements, so the indices you return
are positions in the sorted array, which is usually not what was asked:

```ruby
# If you must sort AND report original indices, carry them:
pairs = nums.each_with_index.sort_by { |value, _index| value }
# ...then two-pointer over pairs and return pairs[lo][1], pairs[hi][1].
# At that point, consider whether a Hash is simpler.
```

**Off-by-one in the loop condition.** `lo < hi` versus `lo <= hi` decides whether an element
can pair with itself:

```ruby
# target = 8, nums = [1, 4, 9]
# `lo <= hi` allows lo == hi: 4 + 4 = 8, "found", using one element twice.
# For distinct pairs, the condition is `lo < hi`.
# For palindromes, `lo < hi` is also correct — a single middle character
# needs no comparison.
```

**Forgetting to skip duplicates when the answer must be unique.** In three-sum this is the
difference between a correct solution and one that returns the same triple many times:

```ruby
# After finding a valid pair, advance past equal values:
lo += 1 while lo < hi && nums[lo] == nums[lo + 1]
hi -= 1 while lo < hi && nums[hi] == nums[hi - 1]
lo += 1
hi -= 1
# Note the `lo < hi` guard inside the skip loops — without it,
# an array of identical values walks off the end.
```

**A move that does not make progress.** Every iteration must advance a pointer. A branch
that moves neither is an infinite loop, and it is easy to introduce when adding a third case:

```ruby
out << [nums[lo], nums[hi]] if sum == target   # forgot to move → hangs
```
:::

:::realworld
```ruby
# 1. Three-sum, which is two pointers inside one loop: O(n²) rather
#    than the O(n³) of three nested loops.
def three_sum(nums)
  nums = nums.sort                                 # sort, not sort! — do not
  out = []                                         # mutate the caller's array
  (0..nums.size - 3).each do |i|
    next if i.positive? && nums[i] == nums[i - 1]   # skip duplicate anchors
    break if nums[i].positive?                      # sorted: no triple can reach 0

    lo = i + 1
    hi = nums.size - 1
    while lo < hi
      sum = nums[i] + nums[lo] + nums[hi]
      if sum.negative?
        lo += 1
      elsif sum.positive?
        hi -= 1
      else
        out << [nums[i], nums[lo], nums[hi]]
        lo += 1 while lo < hi && nums[lo] == nums[lo + 1]
        hi -= 1 while lo < hi && nums[hi] == nums[hi - 1]
        lo += 1
        hi -= 1
      end
    end
  end
  out
end
# `(0..nums.size - 3)` is empty rather than wrong for a short array:
# with two elements the range is (0..-1), which iterates zero times.
```

```ruby
# 2. Where this appears outside interviews.
#
# Merging sorted streams — the core of external sort, log merging,
# LSM-tree compaction, and git's own merge of sorted file lists.
# You cannot load the inputs into memory, and two pointers needs
# only the current element of each.
#
# Diffing two sorted id lists to find adds and removes, in one pass
# with no Set allocation:
def diff_sorted(before, after)
  added = []
  removed = []
  i = j = 0
  while i < before.size && j < after.size
    if before[i] == after[j]
      i += 1
      j += 1
    elsif before[i] < after[j]
      removed << before[i]
      i += 1
    else
      added << after[j]
      j += 1
    end
  end
  removed.concat(before[i..])   # anything left on the left was removed
  added.concat(after[j..])      # anything left on the right was added
  { added: added, removed: removed }
end
# O(n + m) time, O(1) extra space beyond the output. The Set version is
# also O(n + m) and allocates two Sets — which matters when the lists
# are millions of ids long, and is why ActiveRecord's own bulk-diff
# code paths work on sorted id arrays.
#
# Reading two sorted index scans in Postgres: a merge join is
# literally this loop.
```
:::

:::mistakes
**Applying it without the elimination argument.** If you cannot say what moving a pointer
rules out, the pattern does not apply yet.

**Sorting when you needed indices.** Sort pairs of `[value, index]`, or use a `Hash`.

**`lo <= hi` when pairs must be distinct.** Decide deliberately which you want.

**Not skipping duplicates** when the output must be unique — and forgetting the bounds guard
inside the skip loops.

**A branch that moves neither pointer.** Infinite loop.

**Ignoring the sort in the complexity.** The answer is O(n log n) when you sort, and saying
O(n) without qualification is the kind of imprecision interviewers notice.

**Reaching for it when a `Hash` is clearer.** For unsorted two-sum with original indices,
the hash is simpler, O(n), and does not reorder the input.
:::

:::tradeoffs
**Nested loops** — always correct, no preconditions, O(n²). Fine for small n, and a
perfectly good first answer to state before improving it.

**Two pointers on sorted input** — O(n) scan, O(1) extra space, requires the ordering. The
right answer when the data is already sorted or when space is constrained.

**Two pointers with a sort first** — O(n log n) total, O(1) extra space beyond the sort,
destroys original indices. Good when you need ordering anyway, as in three-sum.

**Hash map** — O(n) time and O(n) space, no ordering required, preserves indices. Usually the
better answer for exact-match lookups on unsorted data.

The distinction worth carrying: a `Hash` answers *"is this exact value present"*, so it
cannot help with closest-sum, ranges, or anything needing neighbours. Two pointers exploits
order, which is exactly what gives you those. Pick based on whether the question is about
equality or about ordering.
:::

:::checkpoint
1. Why does moving `lo` forward when the sum is too small not risk skipping a valid pair?
2. `two_sum([1, 3, 2], 4)` returns `nil`, though 1 + 3 = 4. Trace it and say which comparison never happened.
3. What is the total complexity of three-sum, and where does each factor come from?
4. When is `lo <= hi` correct, and when is it a bug?
5. Two sorted lists of a million ids, and you need the added and removed sets. Two pointers or
   two `Set`s? Argue it.
6. `remove_duplicates!` uses `write` and `read`. Why does the output stay correct even though it
   overwrites the array it is reading?
:::

:::interview
State the precondition before the technique — that is what distinguishes understanding from
pattern-matching:

*"Two pointers works when I can prove which pointer to move. On a sorted array, if the sum is
too small, the current right element is the largest partner available, so no pair using this
left element can reach the target — advancing left discards a whole column of candidates
safely. Each step removes a row or a column, and there are 2n of them, so it is linear. Without
the ordering I have no such argument, and the algorithm is wrong rather than slow."*

Account for the sort, because leaving it out is a common imprecision:

*"If I have to sort first it is O(n log n) overall, with O(1) extra space. Still far better than
O(n²). If the input arrives sorted, it is genuinely O(n)."*

And show you would choose, not just produce:

*"For unsorted two-sum where the original indices matter, I would use a Hash instead — O(n),
no reordering. The general split is that a Hash answers 'is this exact value present', so it
cannot do closest-sum or anything involving neighbours. Two pointers exploits ordering, which is
precisely what buys you those."*
:::

## What you now know

- Two pointers replaces a nested loop when each move provably eliminates candidates.
- Sorted input is the usual source of that proof; without it the algorithm is incorrect.
- Each step advances a pointer, so at most 2n steps — hence O(n).
- With a sort, the total is O(n log n), and saying so is part of a correct answer.
- Three shapes: converging from the ends, same-direction with different speeds, and merging
  two sequences.
- Sorting destroys original indices; carry `[value, index]` pairs or use a `Hash`.
- `lo < hi` for distinct pairs; `lo <= hi` lets an element pair with itself.
- Skip duplicates when the output must be unique, with a bounds guard inside the skip.
- Every branch must move a pointer, or the loop never ends.
- A `Hash` answers equality questions; two pointers answers ordering questions.
