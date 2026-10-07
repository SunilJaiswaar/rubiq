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

```js
// Maximum sum of any 3 consecutive elements.
const nums = [2, 1, 5, 1, 3, 2];

// Recompute each window from scratch: O(n · k).
function maxSumSlow(nums, k) {
  let best = -Infinity;
  for (let i = 0; i + k <= nums.length; i++) {
    let sum = 0;
    for (let j = i; j < i + k; j++) sum += nums[j];   // re-adds k-1 elements
    best = Math.max(best, sum);
  }
  return best;
}
```

```js
// Slide instead: add the entering element, subtract the leaving one. O(n).
function maxSum(nums, k) {
  let sum = 0;
  for (let i = 0; i < k; i++) sum += nums[i];
  let best = sum;
  for (let i = k; i < nums.length; i++) {
    sum += nums[i] - nums[i - k];
    best = Math.max(best, sum);
  }
  return best;
}
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
```js
// 1. Variable window: longest substring without repeating characters.
function longestUnique(s) {
  const lastSeen = new Map();
  let left = 0, best = 0;
  for (let right = 0; right < s.length; right++) {
    const c = s[right];
    // Jump left straight past the previous occurrence — but never
    // backwards, hence the Math.max.
    if (lastSeen.has(c) && lastSeen.get(c) >= left) left = lastSeen.get(c) + 1;
    lastSeen.set(c, right);
    best = Math.max(best, right - left + 1);
  }
  return best;
}

// 2. Variable window: smallest subarray with sum >= target.
//    Note the shape difference — shrink WHILE valid, recording as you go.
function minSubarrayLen(nums, target) {
  let left = 0, sum = 0, best = Infinity;
  for (let right = 0; right < nums.length; right++) {
    sum += nums[right];
    while (sum >= target) {            // valid → try to make it smaller
      best = Math.min(best, right - left + 1);
      sum -= nums[left++];
    }
  }
  return best === Infinity ? 0 : best;
}

// 3. Window with a frequency map: longest substring with at most k distinct.
function longestKDistinct(s, k) {
  const counts = new Map();
  let left = 0, best = 0;
  for (let right = 0; right < s.length; right++) {
    counts.set(s[right], (counts.get(s[right]) ?? 0) + 1);
    while (counts.size > k) {          // invalid → shrink
      const c = s[left++];
      const n = counts.get(c) - 1;
      if (n === 0) counts.delete(c); else counts.set(c, n);
    }
    best = Math.max(best, right - left + 1);
  }
  return best;
}
// The `delete` when the count hits zero is load-bearing: `counts.size`
// is the validity test, and a key left at zero inflates it forever.
```

Notice the two shapes. For a **longest** answer you shrink *while invalid* and record after.
For a **shortest** answer you shrink *while valid* and record inside the shrink loop. Getting
these the wrong way round is the most common structural error.
:::

:::failure
**Applying it where the condition is not monotonic.**

```js
// "Longest subarray with sum at most 10", with negatives present.
nums = [5, -3, 8, 2];
// Window [5, -3, 8] sums to 10 — valid.
// Extending to [5, -3, 8, 2] sums to 12 — invalid, so we shrink.
// But extending can also DECREASE the sum when a negative arrives,
// so a window we already shrank past might have become valid again.
// The left pointer moving forward permanently is no longer justified.
```

With negatives, the correct tool is prefix sums plus a hash map (for exact targets) or a
monotonic deque (for min/max over a window) — not a sliding window.

**Leaving zero-count keys in the frequency map.**

```js
counts.set(c, counts.get(c) - 1);     // leaves a 0 entry
while (counts.size > k) { ... }       // size now counts absent characters
// → shrinks forever, or hangs. Delete the key when it reaches 0.
```

**Shrinking while valid when you wanted the longest.**

```js
// Longest window with sum <= target.
while (sum <= target) { sum -= nums[left++]; }   // destroys the answer
while (sum >  target) { sum -= nums[left++]; }   // correct: shrink while invalid
```

**Moving `left` backwards.** In the `lastSeen` version of `longestUnique`, omitting the
`Math.max` guard lets a repeat from before the window drag `left` backwards, which both breaks
the invariant and can make the loop non-terminating:

```js
if (lastSeen.has(c)) left = lastSeen.get(c) + 1;   // wrong
// "abba": at the second 'a', lastSeen('a') = 0, so left jumps back to 1
// after already having been 2.
```

**Recording the answer in the wrong place.** For a shortest window the answer must be recorded
*inside* the shrink loop, because the minimum occurs at the moment the window stops being
valid. Recording after the loop measures a window that is already too small.

**Forgetting that the window can be empty.** `minSubarrayLen` must return 0 when no window
qualifies, and `best` initialised to `Infinity` is what lets you detect that.
:::

:::realworld
```js
// 1. Rate limiting — a sliding window over timestamps. This is the
//    technique's most common production appearance.
class RateLimiter {
  #windowMs; #max; #hits = [];
  constructor(windowMs, max) { this.#windowMs = windowMs; this.#max = max; }

  allow(now = Date.now()) {
    // Shrink from the left: drop anything older than the window.
    while (this.#hits.length && this.#hits[0] <= now - this.#windowMs) this.#hits.shift();
    if (this.#hits.length >= this.#max) return false;
    this.#hits.push(now);
    return true;
  }
}
// Each timestamp is pushed once and shifted once, so allow() is O(1)
// amortised despite the inner while — the same argument as above.
// (`shift` on a JS array is O(n); a real implementation uses a ring
// buffer or deque. The algorithm is right; the data structure matters.)
```

```js
// 2. Moving averages over a metric stream — a fixed window, O(1) per point.
function* movingAverage(stream, k) {
  const buf = []; let sum = 0;
  for (const x of stream) {
    buf.push(x); sum += x;
    if (buf.length > k) sum -= buf.shift();
    if (buf.length === k) yield sum / k;
  }
}

// 3. Maximum in every window of size k — a monotonic deque, which is
//    the sliding window's companion structure.
function maxInWindows(nums, k) {
  const dq = [];        // holds INDICES, values decreasing
  const out = [];
  for (let i = 0; i < nums.length; i++) {
    while (dq.length && dq[0] <= i - k) dq.shift();            // out of window
    while (dq.length && nums[dq[dq.length - 1]] <= nums[i]) dq.pop();  // dominated
    dq.push(i);
    if (i >= k - 1) out.push(nums[dq[0]]);
  }
  return out;
}
// O(n): each index is pushed once and popped once. A plain window
// cannot do this, because removing the maximum from the left requires
// knowing the next-largest — which is exactly what the deque keeps.
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

**Using `Array#shift` in a hot loop.** It is O(n) in most implementations, which quietly
reintroduces the quadratic behaviour you removed. A ring buffer or deque keeps it O(1).
:::

:::tradeoffs
**Recompute per window** — trivially correct, no incremental state to get wrong, O(n·k).
Acceptable for tiny k and a reasonable thing to write first.

**Fixed sliding window** — O(n), O(1) state, no inner loop. Only applies when the window
length is given.

**Variable sliding window** — O(n) and answers "longest/shortest range with property P", at
the cost of needing monotonicity and careful shrink-loop placement.

**Prefix sums with a hash map** — handles negatives and exact-sum targets that a window
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
7. Why is `Array#shift` inside the rate limiter's loop a problem even though the algorithm is
   O(1) amortised?
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
There I would use prefix sums with a hash map instead. Applying a window to a non-monotonic
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
- `Array#shift` in the loop reintroduces O(n) — use a ring buffer or deque.
