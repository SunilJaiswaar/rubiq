---
title: The DP shapes worth recognising
summary: Five recurrence patterns that cover most dynamic programming you will meet, each derived from its recursion rather than presented as a formula.
level: expert
minutes: 20
version: "1"
status: stable
last_reviewed: "2026-10-07"
tags: [dsa, dynamic-programming, lcs, lis, knapsack, intervals]
concepts: [dynamic-programming, subsequences, intervals, state-machines]
prerequisites: [dynamic-programming, memoisation]
interview:
  - question: How do you recognise which DP shape a problem is?
    level: expert
    answer: >-
      By asking what the state has to be, which follows from what the answer depends on. One
      sequence where each element is a take-or-skip decision gives a 1D state over the index —
      house robber, climbing stairs, LIS. Two sequences being aligned gives a 2D state over both
      indices — edit distance, LCS, regex matching. A capacity or budget being consumed adds a
      dimension for the remaining budget — knapsack, coin change. A contiguous range being
      merged or split gives a state over (left, right) — matrix chain, burst balloons. And a
      small set of modes you transition between gives a state over (index, mode) — stock trading
      with a cooldown. Those five cover the great majority, and the useful part is that each
      follows from the state question rather than needing to be recalled.
    followUps:
      - "Which shape is 'longest palindromic substring'?"
  - question: Why is the LIS problem O(n log n) rather than O(n²)?
    level: expert
    answer: >-
      The O(n²) version compares each element against every earlier one. The O(n log n) version
      keeps an array where position i holds the smallest possible tail of an increasing
      subsequence of length i+1 — that array is sorted by construction, so each new element can
      be placed with a binary search. It replaces the first tail that is greater than or equal
      to it, or appends. The length of that array is the answer. Note it does not hold the
      subsequence itself, only candidate tails, so reconstructing the actual sequence needs
      parent pointers alongside.
    followUps:
      - "Why is that array necessarily sorted?"
  - question: What makes interval DP different from the others?
    level: expert
    answer: >-
      The state is a range rather than a position, and the recurrence splits that range at every
      possible point — so the work per state is O(n) rather than O(1), giving O(n³) overall for
      O(n²) states. Matrix chain multiplication and optimal binary search tree construction are
      the classic cases. The practical marker is a problem where the order of combining matters
      and you must try every split, which is exactly what makes a greedy approach wrong: there
      is no locally visible reason to prefer one split point.
    followUps:
      - "Why can't you be greedy about the split?"
resources:
  - title: "Competitive Programmer's Handbook — Dynamic Programming"
    url: https://cses.fi/book/book.pdf
---

## Shape 1: one sequence, take or skip

```ruby
# House robber: maximise the sum with no two adjacent elements.
# State: i. "Best from index i onward."
def rob(nums)
  skip = 0
  take = 0                         # best if we skip / take the current
  (nums.size - 1).downto(0) do |i|
    skip, take = [skip, take].max, nums[i] + skip
  end
  [skip, take].max
end

rob([2, 7, 9, 3, 1])   # => 12   (2 + 9 + 1)
rob([])                # => 0
```

The recurrence: `best(i) = max(best(i+1), nums[i] + best(i+2))`. Two scalars suffice because it
looks back only two steps.

The parallel assignment is doing load-bearing work: `take`'s new value needs `skip`'s *old*
value, and the right-hand side is fully evaluated before either name is rebound. Split it into
two lines and you get a silently wrong answer rather than an error.

:::what
A **DP shape** is a family of problems sharing the same state structure and therefore the same
recurrence skeleton. Recognising the shape tells you what to index your table by, which is the
hard part; the recurrence then follows from enumerating the choices at each state.
:::

:::why
The reason to learn shapes rather than individual problems is that the hard step in DP is
defining the state, and the state is determined by what the answer depends on — which is a
structural property of the problem, not a trick.

"Maximise over a sequence with a constraint between adjacent elements" always has state `i`,
because at each position the only decision is take or skip and the only history that matters is
how far back the constraint reaches. "Align two sequences" always has state `(i, j)`, because
the answer depends on how much of each has been consumed. "Spend a budget" adds the remaining
budget. These are not coincidences to memorise; they are the answer to "what varies".

Working this way also tells you the complexity before you write anything. State `(i, j)` over
two strings is n·m states; if each takes O(1) work you have an O(n·m) algorithm, and if you find
yourself doing O(n) work per state you should check whether the state is wrong. That estimate,
made up front, is often enough to decide whether DP is viable at all.
:::

:::how
```text
  THE FIVE SHAPES, by what the state must be

  1. ONE SEQUENCE            state: i
     "decide about element i, with a constraint on what you decided
      recently"
     → house robber, climbing stairs, max subarray, LIS (O(n²) form),
       decode ways, word break
     Work per state O(1) or O(n) → O(n) or O(n²)

  2. TWO SEQUENCES           state: (i, j)
     "how much of each have we consumed"
     → edit distance, LCS, regex/wildcard matching, interleaving
     O(n·m) states, O(1) each → O(n·m)

  3. BUDGET / CAPACITY       state: (i, remaining)
     "which items considered, how much budget is left"
     → 0/1 knapsack, coin change, partition into equal subsets,
       target sum
     O(n·W) states → pseudo-polynomial

  4. INTERVAL                state: (left, right)
     "best way to combine everything in this range"
     → matrix chain, burst balloons, optimal BST, palindrome
       partitioning
     O(n²) states, O(n) each (try every split) → O(n³)

  5. STATE MACHINE           state: (i, mode)
     "position, plus which of a few modes we are in"
     → stock trading with k transactions or a cooldown, regex with
       states, any problem with "you may only do X after Y"
     O(n·modes) states → O(n) when modes is a constant


  HOW TO TELL WHICH — ask what the answer depends on

    Only the current position and a bounded lookback?     → 1
    Two independent cursors?                              → 2
    A quantity being consumed?                            → 3
    A contiguous range that must be combined somehow?     → 4
    A small number of situations you can be in?           → 5

  And a diagnostic: if you cannot write the state, you cannot write
  the recurrence. Time spent on the state is not time wasted.
```
:::

:::example
```ruby
# Shape 2: longest common subsequence. The basis of diff.
def lcs(a, b)
  t = Array.new(a.size + 1) { Array.new(b.size + 1, 0) }
  (1..a.size).each do |i|
    (1..b.size).each do |j|
      t[i][j] = if a[i - 1] == b[j - 1]
                  t[i - 1][j - 1] + 1                  # match: consume both
                else
                  [t[i - 1][j], t[i][j - 1]].max       # skip one or the other
                end
    end
  end
  t[a.size][b.size]
end

lcs('ABCBDAB', 'BDCABA')   # => 4
```

Three choices at each state, which is all the recurrence is. `git diff` is this, run over lines
rather than characters.

```ruby
# Shape 3: coin change — fewest coins to make an amount.
def coin_change(coins, amount)
  t = Array.new(amount + 1, Float::INFINITY)
  t[0] = 0
  (1..amount).each do |a|
    coins.each do |c|
      t[a] = t[a - c] + 1 if c <= a && t[a - c] + 1 < t[a]
    end
  end
  t[amount].infinite? ? -1 : t[amount]
end

coin_change([1, 5, 10, 25], 63)   # => 6
coin_change([1, 3, 4], 6)         # => 2   greedy would say 3 (4+1+1)
coin_change([5], 3)               # => -1
```

Note the loop order: amount outside, coins inside, means each coin may be reused — unbounded.
Swap them and iterate amount downwards for the 0/1 version. Same observation as the knapsack row.

`Float::INFINITY` mixes freely with Integers in comparisons and arithmetic, so the sentinel needs
no special casing. `t[amount].infinite?` returns `1`, `-1` or `nil` rather than a boolean, which
is unusual enough to be worth knowing — it is truthy for an infinite value and `nil` otherwise, so
it reads correctly in a condition but `== true` would fail.

```ruby
# Shape 4: matrix chain. Where interval DP earns its place.
def matrix_chain(dims)
  # dims[i] × dims[i+1] is matrix i. n = dims.size - 1 matrices.
  n = dims.size - 1
  t = Array.new(n) { Array.new(n, 0) }

  (2..n).each do |len|                            # by increasing range
    (0..(n - len)).each do |i|
      j = i + len - 1
      t[i][j] = Float::INFINITY
      (i...j).each do |k|                         # EVERY split point
        cost = t[i][k] + t[k + 1][j] + (dims[i] * dims[k + 1] * dims[j + 1])
        t[i][j] = cost if cost < t[i][j]
      end
    end
  end
  t[0][n - 1]
end

matrix_chain([10, 100, 5, 50])   # => 7500
```

Iterating by increasing LENGTH is the dependency order: a range's answer depends only on strictly
shorter ranges. That ordering is the interval-DP analogue of "fill row i-1 before row i".

Why not greedy: multiplying a 10×100 by a 100×5 then by 5×50 costs 5,000 + 2,500 = 7,500, while
the other grouping costs 100·5·50 + 10·100·50 = 25,000 + 50,000 = 75,000. Ten times worse, and
nothing locally visible distinguishes them — you have to evaluate the splits.

```ruby
# Shape 5: stock trading with a cooldown day after each sale.
def max_profit_with_cooldown(prices)
  hold = -Float::INFINITY                         # three modes
  sold = 0
  rest = 0
  prices.each do |p|
    hold, sold, rest = [hold, rest - p].max,      # kept, or bought from rest
                       hold + p,                  # just sold today
                       [rest, sold].max           # stayed, or cooled down
  end
  [sold, rest].max
end

max_profit_with_cooldown([1, 2, 3, 0, 2])   # => 3
```

Three modes, O(1) space. The parallel assignment is the whole correctness argument: each new
value must be computed from the *previous* day's modes. Updating them one at a time reads today's
`hold` when computing `sold`, and on this input that returns 4 — it over-reports the profit,
which is the worse direction for a bug in a trading calculation to fail in.

```ruby
# Shape 1, improved: LIS in O(n log n).
def lis(nums)
  tails = []    # tails[i] = smallest tail of an increasing
                # subsequence of length i+1
  nums.each do |x|
    i = tails.bsearch_index { |t| t >= x }   # first index with tails[i] >= x
    if i.nil?
      tails << x                             # x extends the longest run
    else
      tails[i] = x                           # x is a better tail for that length
    end
  end
  tails.size
end

lis([10, 9, 2, 5, 3, 7, 101, 18])   # => 4
```

`tails` is sorted by construction: a longer increasing subsequence cannot have a smaller tail
than a shorter one, or you could truncate it and contradict minimality. That is what licenses the
binary search — and in Ruby you do not have to write it. `Array#bsearch_index` in find-minimum
mode takes a block returning true/false and gives the first index where it flips to true, which
is exactly "lower bound". It returns `nil` when the block is false everywhere, which is precisely
the append case, so the two branches fall out of the API rather than out of index arithmetic.

Note that `tails` is NOT the subsequence — its contents are tails of different candidate runs,
and only its *length* is meaningful. Reconstructing the actual subsequence needs parent pointers.
This is the most common wrong answer about this algorithm.
:::

:::failure
**Forcing a problem into the wrong shape.** The symptom is a recurrence you cannot justify:

```ruby
# "Longest palindromic substring" attempted as a 1D DP over i.
# It fails because a palindrome is defined by a RANGE, not by a
# position: whether s[i..j] is a palindrome depends on s[i+1..j-1].
# That is shape 4, state (i, j).
```

**Wrong loop order in interval DP.** A range's answer depends on shorter ranges, so iterating by
increasing length is mandatory. Iterating `i` then `j` in the obvious nesting reads unfilled
cells.

**Sequential instead of simultaneous updates in a state machine.**

```ruby
hold = [hold, rest - p].max
sold = hold + p                  # reads TODAY's hold. Wrong.
```

Use parallel assignment, which evaluates the whole right-hand side first:

```ruby
hold, sold, rest = [hold, rest - p].max, hold + p, [rest, sold].max
```

Measured on `[1, 2, 3, 0, 2]`: the correct version returns 3 and the sequential one returns 4.
No error, no warning, and the wrong answer is *larger* — a bug that inflates a projected profit
is one nobody reports.

**Loop order deciding bounded versus unbounded, accidentally.** Coin change with the amount loop
outside allows reuse; the knapsack row direction forbids it. Both are correct code for
*different* problems, so getting it wrong gives a plausible wrong answer.

**Reconstructing LIS from `tails`.** `tails` holds candidate tails, not the subsequence —
elements in it may not even be in the original relative order. Keep parent pointers if you need
the sequence.

**Assuming a greedy split works in interval DP.** It does not, and the matrix chain numbers above
show why: the two groupings differ by a factor of ten with nothing locally distinguishing them.

**Ignoring the state-space size.** Edit distance on two 1 MB files is 10¹² states. The shape is
right and the problem is not solvable this way, which is why real diff tools use Myers'
algorithm plus heuristics.

**A state that encodes the path.** If your cache key is "the set of items chosen so far", you
have 2ⁿ states and no overlap. The point of a good state is that many different paths collapse
into it.
:::

:::realworld
```text
// Each shape, where it actually appears.

  1D sequence     — revenue optimisation over time slots; "best
                     subarray" in metrics analysis; word wrapping;
                     word break in tokenisers and CJK segmentation.
  Two sequences   — diff and merge (git, Google Docs), spell check,
                     DNA alignment, regex and glob matching, fuzzy
                     search ranking.
  Budget          — ad budget allocation, cache admission, scheduling
                     under a resource cap, subset-sum in accounting
                     reconciliation.
  Interval        — query optimisers choosing join order (Postgres
                     does DP over relation subsets); TeX's paragraph
                     breaking; optimal BST construction for a known
                     access distribution; parsing with CYK.
  State machine   — Viterbi decoding in speech recognition and error
                     correction; tokenisers; payment and order state
                     machines with "you may only refund after
                     capture" constraints.
```

```ruby
require 'set'

# The one most worth being able to write: word break, which is the
# shape of real tokenisation and segmentation.
def word_break?(s, dict)
  words = dict.to_set
  reachable = Array.new(s.size + 1, false)
  reachable[0] = true
  max_len = dict.map(&:size).max || 0

  (1..s.size).each do |i|
    ([0, i - max_len].max...i).each do |j|
      next unless reachable[j] && words.include?(s[j...i])
      reachable[i] = true
      break
    end
  end
  reachable[s.size]
end

word_break?('leetcode', %w[leet code])   # => true
word_break?('cars', %w[car ca rs])       # => true   needs the second split
word_break?('leetcodex', %w[leet code])  # => false
```

`max_len` bounds the inner loop by the longest dictionary word rather than by `i`, which is the
difference between O(n²) and O(n·L) — and on a long string with short words that is the whole
cost. This is roughly how Chinese and Japanese text is segmented, with probabilities instead of
booleans.

Three Ruby notes. `dict.map(&:size).max || 0` handles the empty dictionary, because `max` on an
empty Array returns `nil` rather than raising or returning zero — a `|| 0` that is easy to omit
and fails only on the empty-input path. `s[j...i]` is the exclusive range slice, matching
JavaScript's `slice(j, i)`; `s.slice(j, i)` in Ruby would take a *length* and silently read the
wrong substring. And this is the one place in the lesson where a memo of booleans appears, so it
is worth connecting: written as a recursive `cache[i] ||= ...` this would recompute every `false`
forever, because `||=` cannot distinguish "not yet computed" from "computed, and the answer is
false". The tabulated form sidesteps the problem entirely, which is a real argument for tables
over memoisation whenever the value type includes `nil` or `false`.

```text
// Honest note on where this fits in real work.
//
// You will rarely write a DP from scratch in application code. Where
// this pays off is:
//
//   - recognising that a problem IS a DP, so you look for a library
//     rather than inventing a heuristic (diff, edit distance,
//     alignment, Viterbi are all in libraries);
//   - knowing the state-space size, so you can tell immediately that
//     the clean approach will not fit;
//   - recognising when a greedy heuristic someone has written is
//     wrong because the problem needed DP.
//
// That last one is the most valuable in practice. "We just pick the
// cheapest option at each step" is correct for Dijkstra and wrong for
// matrix chain, and the difference is whether a locally optimal
// choice is provably safe.
```
:::

:::mistakes
**Forcing the wrong shape.** If the recurrence will not come, the state is wrong.

**Interval DP not iterated by increasing length.**

**Sequential updates in a state machine.**

**Loop order silently changing bounded to unbounded.**

**Treating `tails` in LIS as the subsequence.**

**Greedy where the split must be enumerated.**

**Not estimating the state count before writing the code.**

**A state that encodes a path rather than a summary.** 2ⁿ states and no overlap means it is not
DP.

**Writing a DP when a library exists.** Edit distance, diff, alignment and Viterbi are all
solved, tested and tuned.
:::

:::tradeoffs
**1D sequence DP** — O(n) or O(n²), usually reducible to O(1) space. The simplest shape, and the
one most often solvable greedily instead, so check first.

**Two-sequence DP** — O(n·m) time, reducible to O(min(n, m)) space if you only need the value.
Unavoidably quadratic in general, which is why practical diff tools add heuristics.

**Budget DP** — pseudo-polynomial, so viable only when the budget is small. For large budgets,
approximation.

**Interval DP** — O(n³), which limits n to a few hundred. Postgres's join-order DP is this,
which is exactly why it switches to a genetic algorithm past about twelve relations.

**State-machine DP** — O(n × modes), effectively linear when modes is small. The cheapest shape,
and the easiest to get wrong through non-simultaneous updates.

**Greedy** — far cheaper when a local choice is provably safe. The test is whether you can prove
an exchange argument; if you cannot, assume you need DP.

**A library** — the right answer for the classics. Hand-writing edit distance in production is
rarely a good use of the risk budget.

The judgement that matters most: **estimate the state count before writing anything.** n·m states
on two 1 MB strings tells you the textbook approach is out, and that is worth knowing before you
have written a table.
:::

:::checkpoint
1. Name the five shapes and the state each one indexes by.
2. Which shape is "longest palindromic substring", and why is 1D insufficient?
3. Why must interval DP iterate by increasing range length?
4. In the stock-trading state machine, why must the three updates be simultaneous?
5. Coin change with the amount loop outside permits coin reuse. What change makes it 0/1?
6. Why is the `tails` array in the O(n log n) LIS necessarily sorted?
7. Give the matrix-chain example showing a greedy split is wrong, with the numbers.
8. Edit distance on two 1 MB files — what is the state count, and what do real tools do?
:::

:::interview
Answer the recognition question by deriving rather than listing, because that is the skill:

*"I ask what the answer depends on, and the state falls out. A single sequence where each
element is a take-or-skip decision with a bounded lookback gives state i. Two sequences being
aligned gives state (i, j), because the answer depends on how much of each has been consumed. A
budget being consumed adds the remaining budget. A contiguous range that must be combined gives
state (left, right), and the recurrence tries every split, so the work per state is O(n) and
the whole thing is O(n³). And a small set of modes you transition between gives (index, mode).
Those five cover most of it, and each is the answer to 'what varies', not something I had to
memorise."*

Then show you use the estimate:

*"The useful part is that the state count gives the complexity before I write anything. Two 1 MB
strings is 10¹² states for edit distance, which tells me immediately that the clean approach is
out and that real diff tools use Myers' algorithm with anchoring heuristics instead. Making that
estimate first is often the whole decision."*

For interval DP, make the greedy point concretely:

*"Matrix chain is the one where greedy is visibly wrong. Multiplying 10×100 by 100×5 by 5×50:
one grouping costs 7,500, the other 75,000. Ten times worse, and nothing locally visible
distinguishes the two split points — which is exactly the condition that rules out greedy and
requires enumerating the splits. That is also the most valuable version of this knowledge in real
work: recognising that someone's 'just pick the cheapest at each step' heuristic is wrong because
the problem had no safe local choice."*
:::

## What you now know

- Five shapes cover most DP: one sequence, two sequences, budget, interval, state machine.
- The state follows from what the answer depends on, not from recalling a formula.
- 1D: state i, O(n) or O(n²), usually O(1) space.
- 2D alignment: state (i, j), O(n·m) — edit distance, LCS, regex matching.
- Budget: state (i, remaining), pseudo-polynomial.
- Interval: state (left, right), try every split, O(n³), iterate by increasing length.
- State machine: state (i, mode), O(n × modes), and the updates must be simultaneous.
- Loop order can silently switch bounded to unbounded; both are correct for different problems.
- The LIS `tails` array is sorted by construction, which licenses the binary search.
- `tails` holds candidate tails, not the subsequence — keep parent pointers for that.
- Greedy is wrong for interval DP because no local signal distinguishes split points.
- Estimate the state count before writing code; it often decides whether DP is viable.
- For the classics, use a library — and the highest-value skill is spotting a greedy heuristic
  that should have been a DP.
- `Array#bsearch_index` in find-minimum mode is the lower bound LIS needs, and its `nil` return
  is exactly the append case.
- `tails` in the O(n log n) LIS is not the subsequence — only its length means anything.
- `Float::INFINITY` mixes with Integers freely; `.infinite?` returns `1`/`-1`/`nil`, not a boolean.
- Updating the stock-mode scalars one at a time returns 4 instead of 3 on `[1, 2, 3, 0, 2]` — it
  over-reports, which is the direction nobody reports.
- `s[j...i]` is the exclusive slice; `s.slice(j, i)` takes a length and reads the wrong substring.
- `[].max` is `nil`, so bounds derived from `map(&:size).max` need a `|| 0`.
