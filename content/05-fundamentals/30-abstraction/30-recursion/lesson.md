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

```ruby runnable
data = [1, [2, 3, [4, [5]]], 6, [[7]]]

# Iteratively: you have to maintain the pending work yourself.
def sum_iterative(input)
  total = 0
  pending = [input]                     # an explicit stack
  until pending.empty?
    item = pending.pop
    if item.is_a?(Array)
      pending.concat(item)
    else
      total += item
    end
  end
  total
end

# Recursively: the shape of the code is the shape of the data.
def sum_recursive(input)
  return input unless input.is_a?(Array)      # base case
  input.sum { |item| sum_recursive(item) }
end

p [sum_iterative(data), sum_recursive(data)]

# And the Ruby answer, which is neither: the standard library already did it.
p data.flatten.sum
p data.flatten(1)       # one level only, when you want control
```

Worth noticing that `flatten` exists before you write either version. A surprising amount of
hand-rolled recursion in Ruby codebases is reimplementing `flatten`, `dig`, `deep_merge`,
`each_with_object` or `Enumerable#sum`. Reach for recursion when the *structure* is genuinely
yours — a comment tree, a category hierarchy, a directory walk, a parsed document — not when it
is a nested array.

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

```ruby runnable
def three = 'done'
def two = three
def one = two
p one

# The stack is visible in any error:
def deep(n)
  raise 'bottom' if n.zero?
  deep(n - 1)
end

begin
  deep(3)
rescue StandardError => e
  puts e.backtrace.first(5).join("\n")
end

# And `caller` gives you the stack without raising anything:
def show_stack = puts(caller.first(3).join("\n"))
def middle = show_stack
def outermost = middle
outermost
```

`caller` returning the stack as an array of strings, at any point, with no exception involved, is
genuinely useful for debugging — "who called this?" answered in one line. `caller_locations` gives
the same information as objects with `path`, `lineno` and `label` readers, which is what you want
if you are doing anything with it other than printing.

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

```ruby runnable
def probe_depth(n = 1)
  probe_depth(n + 1)
rescue SystemStackError
  n
end

puts "max depth here: #{probe_depth}"

# And what hitting it looks like:
def no_base_case(n) = no_base_case(n + 1)
begin
  no_base_case(0)
rescue SystemStackError => e
  puts "#{e.class}: #{e.message}"
end
```

Measured on ruby 3.4.5 with the default stack, a trivial self-recursive method reaches about
**10,000 frames**. A method whose frame holds more — several locals, a block — reaches fewer; the
recursive BST insert from the DSA track dies at around 9,400. "Roughly ten thousand, and fewer as
the frame grows" is the number to carry.

Two Ruby-specific facts about that limit, both of which matter more than the number:

**`SystemStackError` descends from `Exception`, not `StandardError`.** So a bare `rescue`, a
`rescue => e`, and the `rescue_from StandardError` in your `ApplicationController` all miss it.
You have to name it:

```ruby runnable
def boom(n) = boom(n + 1)

begin
  begin
    boom(0)
  rescue => e                       # bare rescue == rescue StandardError
    puts "this never runs"
  end
rescue SystemStackError
  puts 'only an explicit `rescue SystemStackError` catches it'
end
```

And catching it is a poor plan anyway: the stack is already exhausted, so the handler itself has
very little room to run in. Bound the depth instead.

**The limit is configurable**, which is worth knowing and almost never worth doing.
`RUBY_THREAD_VM_STACK_SIZE` raises it for threads, and a `Thread` can be given its own larger
stack. Reaching for that is a sign the recursion should be iterative — you are buying a larger
cliff, not removing it.

This matters because **the limit is on nesting, not on work**. An iterative loop can run a
billion times; a recursive function cannot nest ten thousand deep. Those are different
resources.
:::

:::mistakes
**No base case, or a base case the input can skip past.**

```ruby runnable
# Looks fine. Overflows for an odd input, because it never equals 0.
def count_down(n)
  return 'done' if n.zero?
  count_down(n - 2)
end

begin
  count_down(7)
rescue SystemStackError => e
  puts "odd input: #{e.class}"
end

# Fixed: test a condition the input must eventually satisfy.
def count_down_fixed(n)
  return 'done' if n <= 0
  count_down_fixed(n - 2)
end

p count_down_fixed(7)
p count_down_fixed(8)
```

The lesson generalises past this one bug: **a base case that tests for equality is a bug waiting
for an input that steps over it.** `== 0` assumes every path lands exactly on zero. `<= 0` is
true for everything beyond it, so no input can slip past. The same reasoning applies to
`n == target` in a search, `index == size` in a walk, and `balance == 0` in anything financial.

Prefer `<=` over `===` for a numeric base case. Equality assumes the input lands exactly on
your value; an inequality does not.

**The input not actually getting smaller.**

```ruby runnable
def broken(list)
  return 0 if list.empty?
  list.first + broken(list)          # passes the SAME list — never shrinks
end

begin
  broken([1, 2])
rescue SystemStackError => e
  puts "no progress: #{e.class}"
end

def fixed(list)
  return 0 if list.empty?
  list.first + fixed(list[1..])      # a smaller list each time
end

p fixed([1, 2, 3])
```

`list[1..]` is Ruby's "everything after the first element", and it returns `[]` rather than `nil`
when the list has one element — so the base case is reached rather than skipped. (`list[1..]` on
an *empty* array gives `nil`, but the `empty?` guard runs first, so it never happens here. That
ordering is load-bearing.)

Note also that this version allocates a new array per call, so summing a 10,000-element list
copies about 50 million elements in total. That is the usual price of the elegant recursive form
on a sequence, and it is a second reason — beyond stack depth — that `sum` or `reduce` is the
right tool for a flat list. Recursion earns its cost on *branching* structures, where there is no
flat iteration to reach for.

Two things must be true and people check only the first: there *is* a base case, and every
recursive call moves measurably towards it.

**Exponential blowup from recomputing the same subproblem.**

```ruby runnable
$naive_calls = 0
def fib_naive(n)
  $naive_calls += 1
  n <= 1 ? n : fib_naive(n - 1) + fib_naive(n - 2)
end

$memo_calls = 0
def fib_memo(n, cache = {})
  $memo_calls += 1
  return n if n <= 1
  cache.fetch(n) { cache[n] = fib_memo(n - 1, cache) + fib_memo(n - 2, cache) }
end

puts "fib(30) = #{fib_naive(30)} in #{$naive_calls} calls"
puts "fib(30) = #{fib_memo(30)} in #{$memo_calls} calls"
```

The gap is 2,692,537 calls against 59 — and the memoised version also returns an exact answer for
`fib(200)`, because Ruby Integers are arbitrary precision. A language using 64-bit doubles gives a
silently wrong answer from `fib(79)` onward, which is the first Fibonacci number above 2^53.

`cache.fetch(n) { ... }` rather than `cache[n] ||= ...` for the reason the memoisation lesson
gives: `||=` cannot distinguish "not computed" from "computed, and the answer is `false` or
`nil`". It happens not to matter for Fibonacci, where every answer is a non-zero Integer, and it
matters enormously the first time you memoise a predicate.

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

```ruby runnable
# A 50,000-node linked list. Nothing is wrong with the recursion.
Node = Struct.new(:value, :next_node)

list = nil
50_000.times { |i| list = Node.new(i, list) }

def length_recursive(node)
  node.nil? ? 0 : 1 + length_recursive(node.next_node)
end

begin
  length_recursive(list)
rescue SystemStackError => e
  puts "legitimate depth: #{e.class}"
end

# Iteration keeps the state in one frame, on the heap, which is large.
def length_iterative(node)
  count = 0
  until node.nil?
    count += 1
    node = node.next_node
  end
  count
end

p length_iterative(list)
```

This is the honest case against recursion, and it is not about style. The recursion is correct,
clear and matches the data's definition — and it cannot run, because the data is 50,000 deep and
the stack holds about 10,000 frames. No amount of good taste fixes that.

The rule that follows: **recursion is fine when the depth is bounded by something you control, and
a bug when the depth is bounded by your data.** A balanced tree of a million nodes is 20 deep and
recursion is ideal. A linked list, a linear chain, a degenerate tree, or anything whose depth
scales with input size needs iteration or an explicit stack.

**The rule for production code: if the depth depends on input you do not control, do not
use the call stack.** A JSON parser, a directory walker, a comment-tree renderer — all of
these have been the cause of real outages when someone submitted deeply nested input.
Converting to an explicit stack is the fix, and it is also a denial-of-service mitigation.

```ruby runnable
# Walking arbitrary nested data safely: explicit stack, bounded depth.
def walk_safely(root, max_depth: 1000)
  out = []
  stack = [[root, 0]]
  until stack.empty?
    node, depth = stack.pop
    raise ArgumentError, "nesting exceeded #{max_depth}" if depth > max_depth

    if node.is_a?(Array)
      node.each { |child| stack << [child, depth + 1] }
    else
      out << node
    end
  end
  out
end

p walk_safely([1, [2, [3, [4]]]])

begin
  deep = (1..2000).reduce(0) { |acc, _| [acc] }   # 2,000 levels of nesting
  walk_safely(deep, max_depth: 100)
rescue ArgumentError => e
  puts "#{e.class}: #{e.message}"
end
```

Two properties make this safe rather than merely iterative. The stack lives on the heap, so depth
is limited by memory rather than by 10,000 frames. And the depth is *bounded explicitly*, which
matters whenever the structure came from outside: a deeply nested JSON payload is a few kilobytes
that costs an unbounded recursive walker its entire stack.

For JSON specifically Ruby already does this — `JSON.parse` enforces `max_nesting: 100` and raises
`JSON::NestingError` — but `params`, YAML and your own recursive validators are not covered, so
the bound belongs in your walker.
:::

:::internals
**Tail calls, and why JavaScript cannot help you.**

A *tail call* is a recursive call that is the very last thing the function does — nothing
is waiting on its result. In principle the engine can reuse the current frame rather than
pushing a new one, turning the recursion into a loop with no depth limit.

```ruby runnable
# NOT a tail call: the multiplication happens after the call returns, so the
# frame has to stay alive to do it.
def fact_not_tail(n) = n <= 1 ? 1 : n * fact_not_tail(n - 1)

# A tail call: the recursive call is the entire return expression, so this
# frame has nothing left to do.
def fact_tail(n, acc = 1) = n <= 1 ? acc : fact_tail(n - 1, n * acc)

p [fact_not_tail(10), fact_tail(10)]

# By default Ruby does NOT optimise tail calls, so both still overflow:
begin
  fact_tail(100_000)
rescue SystemStackError => e
  puts "tail call, still: #{e.class}"
end
```

Ruby does have tail-call optimisation. It is off by default, and switching it on is a compile
option rather than a runtime flag — so it applies to code compiled with it, not to code already
loaded:

```ruby runnable
source = <<~RUBY
  def fact_tail(n, acc = 1)
    return acc if n <= 1
    fact_tail(n - 1, n * acc)
  end
  fact_tail(100_000).to_s.size
RUBY

iseq = RubyVM::InstructionSequence.compile(
  source, nil, nil, 1,
  tailcall_optimization: true,
  trace_instruction: false,
)

puts "digits in 100,000! = #{iseq.eval}"
```

That runs 100,000 frames deep and returns the number of digits in 100,000 factorial — 456,574 of
them — where the same code without the option raises `SystemStackError`.

It is a genuinely interesting capability and you should almost certainly not use it. It is not
widely exercised, it makes backtraces unhelpful by removing the frames they would have named, it
applies per compilation unit so reasoning about what is optimised is awkward, and nothing in the
ecosystem assumes it. Know it exists so you can answer the question; write a loop in production.

The transferable part is recognising a tail call at all. `fact_tail` keeps a running accumulator
so the frame has no work left after the recursive call — and that rewrite is exactly what turns
the recursion into a loop by hand:

```ruby runnable
def fact_loop(n)
  acc = 1
  while n > 1
    acc *= n
    n -= 1
  end
  acc
end

p fact_loop(100_000).to_s.size      # 456574, no stack growth at all
```

An accumulator parameter and a loop variable are the same idea. If you can write the tail-call
version, you can write the loop — and in Ruby that is the version to ship.

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
```ruby runnable
# Recursion is the natural fit here — a comment tree of unknown depth.
thread = {
  id: 1, text: 'root',
  replies: [
    { id: 2, text: 'a', replies: [{ id: 4, text: 'a.1', replies: [] }] },
    { id: 3, text: 'b', replies: [] },
  ],
}

def count_comments(node) = 1 + node[:replies].sum { |r| count_comments(r) }

def flatten_thread(node, depth = 0)
  [{ id: node[:id], depth: depth }] +
    node[:replies].flat_map { |r| flatten_thread(r, depth + 1) }
end

puts "total: #{count_comments(thread)}"
puts flatten_thread(thread).map { |c| ('  ' * c[:depth]) + c[:id].to_s }.join("\n")
```

This is the shape worth recognising, because it is the one you will actually meet: a comment
thread, a category tree, a file tree, a nested menu, an org chart, a parsed document. The depth is
unknown, it is small in practice, and the recursive version is three lines where an iterative one
is fifteen.

The Rails note that makes it real: fetching that tree with recursion means a query per level,
which is the N+1 problem with a variable N. The usual answers are to denormalise the structure so
one query returns it all — a `path` column of ancestor ids, a nested-set `lft`/`rgt` pair, or what
the `ancestry` and `closure_tree` gems provide — or to let PostgreSQL walk it with a recursive
CTE. Recursion in Ruby over data already in memory is cheap; recursion that issues a query per
step is the expensive kind, and no amount of elegance in the Ruby fixes it.

And bound the depth anyway if the structure is user-generated. A comment thread 20,000 replies
deep is a valid thing for someone to construct, and it will take your stack with it.

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
