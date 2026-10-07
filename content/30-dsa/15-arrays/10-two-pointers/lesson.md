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
      the input arrives sorted, or if a hash set can replace the sort, you can get the full
      O(n).
    followUps:
      - "When would you use a hash set instead?"
  - question: For two-sum, when is a hash map better than two pointers?
    level: basic
    answer: >-
      When the array is unsorted and you need the original indices. The hash approach is
      O(n) time and O(n) space and never reorders anything. Two pointers is O(n log n) if you
      must sort, and sorting destroys the indices unless you sort pairs of value and index.
      Two pointers wins when the input is already sorted, when you need O(1) extra space, or
      when the problem is about a *range* rather than an exact target — a hash map cannot
      answer "the closest sum to X" in one pass.
    followUps:
      - "Which would you use for three-sum, and why?"
resources:
  - title: "Sedgewick & Wayne — Algorithms"
    url: https://algs4.cs.princeton.edu/home/
---

## The problem

```js
// Find two numbers in a sorted array that sum to the target.
const nums = [2, 7, 11, 15, 19, 24];
const target = 26;

// Obvious version: check every pair.
function twoSumSlow(nums, target) {
  for (let i = 0; i < nums.length; i++)
    for (let j = i + 1; j < nums.length; j++)
      if (nums[i] + nums[j] === target) return [i, j];
  return null;
}
// n = 100,000 → about 5,000,000,000 comparisons.
```

```js
// Two pointers: one pass.
function twoSum(nums, target) {
  let lo = 0, hi = nums.length - 1;
  while (lo < hi) {
    const sum = nums[lo] + nums[hi];
    if (sum === target) return [lo, hi];
    if (sum < target) lo++;   // need more → the only way is a bigger small number
    else hi--;                // need less → the only way is a smaller big number
  }
  return null;
}
// n = 100,000 → at most 100,000 comparisons.
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
```js
// The three canonical shapes. Learn these and most variants are obvious.

// 1. Opposite ends, converging — pair with a target property.
function isPalindrome(s) {
  let lo = 0, hi = s.length - 1;
  while (lo < hi) {
    if (s[lo] !== s[hi]) return false;
    lo++; hi--;
  }
  return true;
}

// 2. Same direction, different speeds — in-place filtering.
//    `write` lags behind `read`, so the kept elements compact to the front.
function removeDuplicates(sorted) {
  if (sorted.length === 0) return 0;
  let write = 1;
  for (let read = 1; read < sorted.length; read++) {
    if (sorted[read] !== sorted[write - 1]) sorted[write++] = sorted[read];
  }
  return write;              // the new length; O(1) extra space
}

// 3. Two sequences — merging.
function mergeSorted(a, b) {
  const out = [];
  let i = 0, j = 0;
  while (i < a.length && j < b.length) out.push(a[i] <= b[j] ? a[i++] : b[j++]);
  while (i < a.length) out.push(a[i++]);
  while (j < b.length) out.push(b[j++]);
  return out;
}
// This is the merge step of merge sort, and `<=` rather than `<`
// is what makes it stable.
```
:::

:::failure
**Using it on unsorted input.** The elimination argument requires the ordering, so without it
the algorithm reports "not found" for pairs that exist:

```js
twoSum([7, 2, 24, 11], 9);   // null. 7 + 2 = 9 is right there.
// 7 + 11 = 18 > 9 → hi--
// 7 + 24 = 31 > 9 → hi--
// 7 + 2  = 9 ... but lo < hi is now false. Missed.
```

**Returning indices after sorting.** Sorting moves the elements, so the indices you return
are positions in the sorted array, which is usually not what was asked:

```js
// If you must sort AND report original indices, carry them:
const pairs = nums.map((v, i) => [v, i]).sort((a, b) => a[0] - b[0]);
// ...then two-pointer over pairs and return pairs[lo][1], pairs[hi][1].
// At that point, consider whether a hash map is simpler.
```

**Off-by-one in the loop condition.** `lo < hi` versus `lo <= hi` decides whether an element
can pair with itself:

```js
// target = 8, nums = [1, 4, 9]
// lo <= hi allows lo === hi: 4 + 4 = 8, "found", using one element twice.
// For distinct pairs, the condition is lo < hi.
// For palindromes, lo < hi is also correct — a single middle character
// needs no comparison.
```

**Forgetting to skip duplicates when the answer must be unique.** In three-sum this is the
difference between a correct solution and one that returns the same triple many times:

```js
// After finding a valid pair, advance past equal values:
while (lo < hi && nums[lo] === nums[lo + 1]) lo++;
while (lo < hi && nums[hi] === nums[hi - 1]) hi--;
lo++; hi--;
// Note the `lo < hi` guard inside the skip loops — without it,
// an array of identical values walks off the end.
```

**A move that does not make progress.** Every iteration must advance a pointer. A branch
that moves neither is an infinite loop, and it is easy to introduce when adding a third case:

```js
if (sum === target) { /* record, and... */ }   // forgot to move → hangs
```
:::

:::realworld
```js
// 1. Three-sum, which is two pointers inside one loop: O(n²) rather
//    than the O(n³) of three nested loops.
function threeSum(nums) {
  nums.sort((a, b) => a - b);
  const out = [];
  for (let i = 0; i < nums.length - 2; i++) {
    if (i > 0 && nums[i] === nums[i - 1]) continue;   // skip duplicate anchors
    if (nums[i] > 0) break;                           // sorted: no triple can sum to 0
    let lo = i + 1, hi = nums.length - 1;
    while (lo < hi) {
      const sum = nums[i] + nums[lo] + nums[hi];
      if (sum < 0) lo++;
      else if (sum > 0) hi--;
      else {
        out.push([nums[i], nums[lo], nums[hi]]);
        while (lo < hi && nums[lo] === nums[lo + 1]) lo++;
        while (lo < hi && nums[hi] === nums[hi - 1]) hi--;
        lo++; hi--;
      }
    }
  }
  return out;
}
```

```js
// 2. Where this appears outside interviews.

// Merging sorted streams — the core of external sort, log merging,
// LSM-tree compaction, and git's own merge of sorted file lists.
// You cannot load the inputs into memory, and two pointers needs
// only the current element of each.

// Diffing two sorted ID lists to find adds and removes, in one pass
// with no set allocation:
function diffSorted(before, after) {
  const added = [], removed = [];
  let i = 0, j = 0;
  while (i < before.length && j < after.length) {
    if (before[i] === after[j]) { i++; j++; }
    else if (before[i] < after[j]) removed.push(before[i++]);
    else added.push(after[j++]);
  }
  while (i < before.length) removed.push(before[i++]);
  while (j < after.length) added.push(after[j++]);
  return { added, removed };
}
// O(n + m) time, O(1) extra space beyond the output. The hash-set
// version is also O(n + m) and allocates two sets — which matters
// when the lists are millions of ids long.

// Reading two sorted index scans in a database: an index merge join
// is literally this loop.
```
:::

:::mistakes
**Applying it without the elimination argument.** If you cannot say what moving a pointer
rules out, the pattern does not apply yet.

**Sorting when you needed indices.** Sort pairs of `[value, index]`, or use a hash map.

**`lo <= hi` when pairs must be distinct.** Decide deliberately which you want.

**Not skipping duplicates** when the output must be unique — and forgetting the bounds guard
inside the skip loops.

**A branch that moves neither pointer.** Infinite loop.

**Ignoring the sort in the complexity.** The answer is O(n log n) when you sort, and saying
O(n) without qualification is the kind of imprecision interviewers notice.

**Reaching for it when a hash map is clearer.** For unsorted two-sum with original indices,
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

The distinction worth carrying: a hash map answers *"is this exact value present"*, so it
cannot help with closest-sum, ranges, or anything needing neighbours. Two pointers exploits
order, which is exactly what gives you those. Pick based on whether the question is about
equality or about ordering.
:::

:::checkpoint
1. Why does moving `lo` forward when the sum is too small not risk skipping a valid pair?
2. `twoSum([7, 2, 24, 11], 9)` with the two-pointer version returns null. Why?
3. What is the total complexity of three-sum, and where does each factor come from?
4. When is `lo <= hi` correct, and when is it a bug?
5. Two sorted lists of a million ids, and you need the added and removed sets. Two pointers or
   two hash sets? Argue it.
6. `removeDuplicates` uses `write` and `read`. Why does the output stay correct even though it
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

*"For unsorted two-sum where the original indices matter, I would use a hash map instead — O(n),
no reordering. The general split is that a hash map answers 'is this exact value present', so it
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
- Sorting destroys original indices; carry `[value, index]` pairs or use a hash map.
- `lo < hi` for distinct pairs; `lo <= hi` lets an element pair with itself.
- Skip duplicates when the output must be unique, with a bounds guard inside the skip.
- Every branch must move a pointer, or the loop never ends.
- Hash maps answer equality questions; two pointers answers ordering questions.
