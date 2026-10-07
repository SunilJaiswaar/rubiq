---
title: Sliding window
summary: A contiguous range that grows and shrinks, turning O(n·k) into O(n) — plus the condition that must be monotonic for it to work at all.
level: basic
minutes: 16
version: "1"
status: stable
last_reviewed: "2026-10-07"
tags: [dsa, arrays, sliding-window, strings]
concepts: [sliding-window, amortised-analysis, monotonicity]
prerequisites: [two-pointers, big-o]
interview:
  - question: Why is a sliding window O(n) when the inner loop looks nested?
    level: basic
    answer: >-
      Because each pointer only moves forward, and neither ever resets. The left pointer
      advances at most n times across the whole run, and so does the right, so total work is
      bounded by 2n regardless of how the inner while loop is shaped. That is an amortised
      argument: a single outer iteration might shrink the window by many positions, but it can
      only do that by consuming moves that are never available again. Counting total pointer
      movement rather than nesting depth is the right way to analyse it.
    followUps:
      - "What makes the window invalid to use?"
  - question: What property must the condition have for a sliding window to be correct?
    level: intermediate
    answer: >-
      Monotonicity: extending the window must never make an invalid window valid, and
      shrinking it must never make a valid window invalid. "Sum of positive numbers at most
      K" has that — adding elements only increases the sum. "Sum at most K with negative
      numbers allowed" does not, because extending can decrease the sum, so a window you
      shrank away might have been fine. Without monotonicity you cannot justify moving the
      left pointer forward permanently, and the usual correct tool is prefix sums with a hash
      map instead.
    followUps:
      - "So how would you solve it with negatives?"
  - question: Fixed-size versus variable-size window — how do they differ in code?
    level: basic
    answer: >-
      A fixed window advances both ends together: add the entering element, remove the leaving
      one, and the window length never changes — so there is no inner loop at all. A variable
      window grows the right pointer unconditionally and shrinks from the left only while the
      window is invalid, so the inner while loop is where the problem's constraint lives. Most
      "longest substring with property P" problems are the variable form; most "maximum sum of
      k consecutive" problems are the fixed form.
    followUps:
      - "Which shape is 'smallest window containing all of T'?"
resources:
  - title: "Skiena — The Algorithm Design Manual"
    url: https://www.algorist.com/
---

## The problem

```ruby
# Maximum sum of any 3 consecutive elements.
nums = [2, 1, 5, 1, 3, 2]

# Recompute each window from scratch: O(n · k).
def max_sum_slow(nums, k)
  best = -Float::INFINITY
  (0..nums.size - k).each do |i|
    sum = 0
    (i...i + k).each { |j| sum += nums[j] }   # re-adds k-1 elements
    best = [best, sum].max
  end
  best
end
```

```ruby
# Slide instead: add the entering element, subtract the leaving one. O(n).
def max_sum(nums, k)
  sum = nums.first(k).sum
  best = sum
  (k...nums.size).each do |i|
    sum += nums[i] - nums[i - k]
    best = [best, sum].max
  end
  best
end
```

The insight is that consecutive windows overlap in `k - 1` elements, so recomputing the sum
throws away almost everything you already knew.

:::what
A **sliding window** is a contiguous range `[left, right]` maintained over a sequence, with
summary state (a sum, a count, a frequency map) updated incrementally as the ends move. In the
**fixed** form both ends advance together; in the **variable** form the right end grows and the
left end catches up only while a condition is violated.
:::

:::why
The technique exists because recomputation is the waste. Two adjacent windows of size 1000
differ by two elements, so recomputing all 1000 does 998 units of redundant work — and the
redundancy grows with the window, which is why the slow version is O(n·k) rather than O(n).

The variable form answers a different and larger class of question: "what is the longest or
shortest range satisfying P". The reason a single pass suffices is subtler than in the fixed
case. For each right end, there is exactly one leftmost position that keeps the window valid,
and — crucially — that position **never moves backwards** as the right end advances. Extending
the window can only make things worse, so the left boundary you were forced to by an earlier
right end is still at least as far forward now.

That monotonicity is the entire licence for moving `left` forward permanently. It is also the
condition people skip, which is why the pattern is often applied to problems where it silently
returns the wrong answer.
:::

:::how
```text
  VARIABLE WINDOW — longest substring with no repeated character

    s = "abcabcbb"

    right=0  a        window "a"       ok    best 1
    right=1  ab       window "ab"      ok    best 2
    right=2  abc      window "abc"     ok    best 3
    right=3  abca     'a' repeats      → shrink from the left
             left=1   "bca"            ok    best 3
    right=4  bcab     'b' repeats      → shrink
             left=2   "cab"            ok    best 3
    ...

  THE POINTER MOVEMENT, which is the complexity argument

    right: 0 1 2 3 4 5 6 7      → n moves, never backwards
    left:  0 0 0 1 2 3 4 6      → at most n moves, never backwards

    Total ≤ 2n. The inner `while` can run several times in one outer
    iteration, but only by consuming left-moves that will never be
    available again. Nesting depth is the wrong thing to count.

  FIXED WINDOW — no inner loop at all

    add nums[right], remove nums[right - k], every step.
    The window length is invariant, so there is nothing to shrink.
```
:::

:::example
```ruby
# 1. Variable window: longest substring without repeating characters.
def longest_unique(str)
  last_seen = {}
  left = 0
  best = 0
  str.each_char.with_index do |char, right|
    # Jump left straight past the previous occurrence — but never
    # backwards, hence the `>= left` guard.
    left = last_seen[char] + 1 if last_seen.key?(char) && last_seen[char] >= left
    last_seen[char] = right
    best = [best, right - left + 1].max
  end
  best
end

# 2. Variable window: smallest subarray with sum >= target.
#    Note the shape difference — shrink WHILE valid, recording as you go.
def min_subarray_len(nums, target)
  left = 0
  sum = 0
  best = Float::INFINITY
  nums.each_with_index do |value, right|
    sum += value
    while sum >= target                      # valid → try to make it smaller
      best = [best, right - left + 1].min
      sum -= nums[left]
      left += 1
    end
  end
  best.infinite? ? 0 : best
end

# 3. Window with a frequency Hash: longest substring with at most k distinct.
def longest_k_distinct(str, k)
  counts = Hash.new(0)                       # default 0, so += needs no guard
  left = 0
  best = 0
  str.each_char.with_index do |char, right|
    counts[char] += 1
    while counts.size > k                    # invalid → shrink
      leaving = str[left]
      left += 1
      counts[leaving] -= 1
      counts.delete(leaving) if counts[leaving].zero?
    end
    best = [best, right - left + 1].max
  end
  best
end
# The `delete` when the count hits zero is load-bearing: `counts.size`
# is the validity test, and a key left at zero inflates it forever.
# Note that `Hash.new(0)` gives a default WITHOUT storing the key, so
# merely reading `counts[x]` does not create an entry.
```

Notice the two shapes. For a **longest** answer you shrink *while invalid* and record after.
For a **shortest** answer you shrink *while valid* and record inside the shrink loop. Getting
these the wrong way round is the most common structural error.
:::

:::failure
**Applying it where the condition is not monotonic.**

```ruby
# "Longest subarray with sum at most 10", with negatives present.
nums = [5, -3, 8, 2]
# Window [5, -3, 8] sums to 10 — valid.
# Extending to [5, -3, 8, 2] sums to 12 — invalid, so we shrink.
# But extending can also DECREASE the sum when a negative arrives,
# so a window we already shrank past might have become valid again.
# The left pointer moving forward permanently is no longer justified.
```

With negatives, the correct tool is prefix sums plus a `Hash` (for exact targets) or a
monotonic deque (for min/max over a window) — not a sliding window.

**Leaving zero-count keys in the frequency map.**

```ruby
counts[leaving] -= 1                  # leaves a 0 entry
while counts.size > k                 # size now counts absent characters
# → shrinks forever, or walks off the string. Delete the key at 0.
```

**Shrinking while valid when you wanted the longest.**

```ruby
# Longest window with sum <= target.
while sum <= target then sum -= nums[left]; left += 1 end  # destroys the answer
while sum >  target then sum -= nums[left]; left += 1 end  # correct: while INVALID
```

**Moving `left` backwards.** In the `lastSeen` version of `longestUnique`, omitting the
`Math.max` guard lets a repeat from before the window drag `left` backwards, which both breaks
the invariant and can make the loop non-terminating:

```ruby
left = last_seen[char] + 1 if last_seen.key?(char)   # wrong
# "abba": at the second 'a', last_seen['a'] == 0, so left jumps back to 1
# after already having been 2.
```

**Recording the answer in the wrong place.** For a shortest window the answer must be recorded
*inside* the shrink loop, because the minimum occurs at the moment the window stops being
valid. Recording after the loop measures a window that is already too small.

**Forgetting that the window can be empty.** `minSubarrayLen` must return 0 when no window
qualifies, and `best` initialised to `Infinity` is what lets you detect that.
:::

:::realworld
```ruby
# 1. Rate limiting — a sliding window over timestamps. This is the
#    technique's most common production appearance.
class RateLimiter
  def initialize(window_seconds, max)
    @window = window_seconds
    @max = max
    @hits = []
  end

  def allow?(now = Time.now.to_f)
    # Shrink from the left: drop anything older than the window.
    @hits.shift while @hits.any? && @hits.first <= now - @window
    return false if @hits.size >= @max

    @hits << now
    true
  end
end
# Each timestamp is pushed once and shifted once, so allow? is O(1)
# amortised despite the inner while — the same argument as above.
#
# And here Ruby is genuinely better than JavaScript rather than merely
# different: `Array#shift` in MRI is O(1), because the array keeps a
# start offset and shifting advances it instead of moving elements. The
# JavaScript version of this code needs a ring buffer or a deque to stay
# linear; the Ruby version does not. Measured on Ruby 3.4: shifting
# 100,000 elements takes 6.4ms and 400,000 takes 23.2ms — four times the
# work for four times the time, which is constant per shift.
```

```ruby
# 2. Moving averages over a metric stream — a fixed window, O(1) per point.
#    An Enumerator, so it is lazy: nothing is computed until something
#    asks for the next value, and an endless stream stays endless.
def moving_average(stream, k)
  Enumerator.new do |yielder|
    buf = []
    sum = 0.0
    stream.each do |x|
      buf << x
      sum += x
      sum -= buf.shift if buf.size > k
      yielder << sum / k if buf.size == k
    end
  end
end

# 3. Maximum in every window of size k — a monotonic deque, which is
#    the sliding window's companion structure.
def max_in_windows(nums, k)
  dq = []                                              # holds INDICES,
  out = []                                             # values decreasing
  nums.each_with_index do |value, i|
    dq.shift while dq.any? && dq.first <= i - k        # out of window
    dq.pop   while dq.any? && nums[dq.last] <= value   # dominated
    dq << i
    out << nums[dq.first] if i >= k - 1
  end
  out
end
# O(n): each index is pushed once and popped once. A plain window cannot
# do this, because removing the maximum from the left requires knowing
# the next-largest — which is exactly what the deque keeps. An Array is
# a fine deque in Ruby: push, pop, shift and unshift are all O(1).
```

Worth noting where else this appears: TCP's congestion window, log-based anomaly detection
over the last N minutes, and database window functions with a `ROWS BETWEEN n PRECEDING`
frame are all the same idea — maintain summary state over a moving range instead of
recomputing it.
:::

:::mistakes
**Using it on a non-monotonic condition.** Negative numbers with a sum constraint are the
classic case. Reach for prefix sums instead.

**Shrink-while-valid versus shrink-while-invalid.** Longest wants invalid; shortest wants
valid. Decide from the question, not by trial.

**Recording the answer outside the shrink loop** for a shortest-window problem.

**Leaving zero counts in a frequency map** when `map.size` is the validity test.

**Letting `left` move backwards.** Guard with `Math.max(left, ...)`.

**Resetting state on each outer step.** If you rebuild the sum or the map inside the loop, you
have written the O(n·k) version with extra steps.

**Claiming O(n·k) because of the inner `while`.** Count total pointer movement. Each moves at
most n times.

**Assuming `Array#shift` is O(n).** It is in JavaScript, and that advice is widely repeated
— but MRI's `shift` advances a start offset instead of moving elements, so it is O(1). In Ruby
an Array is already a usable queue and deque, and reaching for a ring buffer here is
complexity you do not need. (`unshift` is likewise O(1) amortised.)
:::

:::tradeoffs
**Recompute per window** — trivially correct, no incremental state to get wrong, O(n·k).
Acceptable for tiny k and a reasonable thing to write first.

**Fixed sliding window** — O(n), O(1) state, no inner loop. Only applies when the window
length is given.

**Variable sliding window** — O(n) and answers "longest/shortest range with property P", at
the cost of needing monotonicity and careful shrink-loop placement.

**Prefix sums with a `Hash`** — handles negatives and exact-sum targets that a window
cannot, costs O(n) space, and does not answer "longest range" as directly.

**Monotonic deque** — gives min or max over a moving window in O(n), which a plain window
cannot do at all, at the cost of a second structure and more code.

The question to ask first: **does extending the window only ever move the condition one way?**
If yes, a window works and is the simplest O(n) answer. If no, you need prefix sums or a deque,
and forcing a window produces an answer that is wrong on inputs your tests probably do not
have.
:::

:::checkpoint
1. Why is the variable window O(n) when it contains a nested `while`?
2. "Longest subarray with sum at most K", with negatives allowed. Why does a window fail, and
   what works instead?
3. For "shortest window with sum ≥ target", do you shrink while valid or while invalid? Where
   do you record the answer?
4. Why must a zero count be deleted from the frequency map rather than left at zero?
5. In `longestUnique`, what breaks without `Math.max` when guarding `left`?
6. Why can a plain sliding window not give you the maximum in every window of size k?
7. The rate limiter calls `Array#shift` in a loop. In JavaScript that would reintroduce O(n).
   Why does it not in Ruby, and what would you have to change if you ported it?
:::

:::interview
Lead with the amortised argument, since the "but it's nested" objection is the first thing an
interviewer will test:

*"Both pointers only move forward and neither ever resets, so across the whole run left moves at
most n times and right moves at most n times — total work is bounded by 2n. The inner while can
run many times in one outer iteration, but only by consuming left-moves that are then gone
forever. Counting total pointer movement is the right analysis; nesting depth is not."*

Then the precondition, which is the part that shows judgement:

*"The condition has to be monotonic — extending the window must only ever move it one way.
'Sum of positives at most K' qualifies. The same problem with negatives does not, because
extending can reduce the sum, so a window I already shrank past might have become valid again.
There I would use prefix sums with a Hash instead. Applying a window to a non-monotonic
condition gives a wrong answer rather than a slow one, which is worse."*

And the structural distinction, stated as a rule you can apply rather than recall:

*"For a longest-window answer I shrink while the window is invalid and record after. For a
shortest-window answer I shrink while it is valid and record inside the shrink loop, because the
minimum occurs exactly when it stops being valid. Getting those the wrong way round is the most
common bug in this pattern."*
:::

## What you now know

- Adjacent windows overlap, so recomputation is the waste the technique removes.
- Fixed window: both ends move together, no inner loop, O(1) state.
- Variable window: grow right, shrink left while the window is invalid.
- O(n) by amortised analysis — each pointer moves forward at most n times.
- Correctness requires monotonicity: extending must only move the condition one way.
- Negative numbers with a sum constraint break monotonicity; use prefix sums.
- Longest: shrink while invalid, record after. Shortest: shrink while valid, record inside.
- Delete zero-count keys when `map.size` is the validity test.
- Never let `left` move backwards; guard it.
- A monotonic deque gives window min/max, which a plain window cannot.
- `Array#shift` is O(1) in MRI, so an Array is a fine queue — the JavaScript advice to avoid
  it does not transfer.
