---
title: Blocks and yield
summary: Why Ruby has a second, special way of passing a function — and why it is special enough to be worth the strangeness.
level: basic
minutes: 18
version: "3.3"
status: stable
last_reviewed: "2026-09-20"
tags: [ruby, blocks, yield, closures, iterators]
concepts: [blocks, yield, closures, ensure]
prerequisites: [method-lookup]
interview:
  - question: What is a block in Ruby, and how is it different from a regular argument?
    level: basic
    hint: How many blocks can a method take?
    answer: >-
      A block is a chunk of code attached to a method call with `do...end` or `{...}`. It
      is not an ordinary argument: a method takes at most one block, it does not appear in
      the parameter list, and it is passed on a dedicated slot in the call frame rather
      than in the argument array. The method invokes it with `yield` or captures it as a
      Proc with `&block`. Because it is a closure, it can see the local variables where it
      was written, not where it is called.
    followUps:
      - "Why does Ruby special-case one block rather than just passing a lambda?"
      - "What does `block_given?` protect you from?"
  - question: Why is `File.open` with a block better than `File.open` without one?
    level: basic
    answer: >-
      With a block, `File.open` takes responsibility for closing the file: it yields the
      handle, and closes it in an `ensure` so the file is closed even if your block raises
      or returns early. Without a block you get the handle back and must close it
      yourself, which means every early return, exception and forgotten branch is a leaked
      file descriptor. This inversion — the library owns the cleanup, you own the work —
      is the single most valuable thing blocks do.
    followUps:
      - "How would you write your own method with that guarantee?"
      - "What happens to the file if the block calls `return`?"
    realWorld: >-
      The same pattern is everywhere: database transactions, mutex locks, HTTP connection
      pools, temporary directories, benchmark timers.
  - question: What does `block_given?` do and when do you need it?
    level: basic
    answer: >-
      It returns whether the current method was called with a block. You need it whenever
      `yield` is optional, because `yield` with no block raises `LocalJumpError`. The
      common pattern is a method that returns an Enumerator when called without a block
      and iterates when called with one — which is how all of Ruby's own iterators behave.
resources:
  - title: "Ruby documentation — Proc"
    url: https://docs.ruby-lang.org/en/master/Proc.html
  - title: "Ruby documentation — Kernel#block_given?"
    url: https://docs.ruby-lang.org/en/master/Kernel.html#method-i-block_given-3F
---

## A problem you have definitely had

You need to read a file and count its lines.

```ruby
file = File.open("data.txt")
count = file.readlines.size
file.close
count
```

Fine. Now add error handling, because `readlines` can raise:

```ruby
file = File.open("data.txt")
begin
  count = file.readlines.size
ensure
  file.close
end
count
```

Now notice that you have to write that `begin/ensure/close` dance **every single time you
touch a file**. And a database connection. And a lock. And a network socket. Every
acquire/release pair, forever, with the release in an `ensure` so it survives exceptions.

:::problem
The resource-handling code is the same every time, and the useful code in the middle is
different every time. Normal functions cannot help you here, because the thing that
varies is *in the middle* — surrounded on both sides by code you want to reuse.

You cannot extract "open a file, run something, close it" into a function unless you can
pass the "run something" part in.
:::

:::history
Languages solved this in roughly three waves.

- **Manual discipline** (C): `fopen`/`fclose` and a code review culture of checking every
  path. Leaks were a permanent category of bug.
- **Scope-bound destructors** (C++ RAII, 1980s): tie release to a stack object's lifetime.
  Elegant, but requires deterministic destruction, which garbage-collected languages
  do not have.
- **Blocks in the language** (Smalltalk, then Ruby): let the *library* own the
  acquire/release pair and accept the middle as a parameter.

Java eventually arrived at `try-with-resources` (2011) and Python at the `with` statement
and context managers (2005). Both are narrower solutions to this same problem — dedicated
syntax for one use case. Ruby's answer is general: pass code to a method.
:::

:::what
A **block** is a piece of code attached to a method call, which that method can run
whenever and however many times it likes. It is written with `do ... end` or `{ ... }`,
and it is passed on a special slot — not in the argument list.
:::

Here is the entire solution:

```ruby runnable
# Ruby's File.open, when given a block, does this:
def with_file(name)
  handle = "handle for #{name}"   # pretend this is a real file
  puts "opened #{name}"
  yield(handle)                   # <- run the caller's code, here, now
ensure
  puts "closed #{name}"           # <- happens no matter what
end

with_file("data.txt") do |f|
  puts "working with #{f}"
end

puts "---"

# And the guarantee holds even when the block blows up:
begin
  with_file("other.txt") do |_f|
    raise "something went wrong"
  end
rescue => e
  puts "caught: #{e.message}"
end
```

Run that. Note the ordering: `closed other.txt` prints **before** `caught:`, because
`ensure` runs as the exception passes through on its way out. The file is closed. You did
not write a single line of cleanup code.

:::why
Blocks let a library invert responsibility. The library knows the boring, critical,
easy-to-get-wrong part — acquire, guarantee release, handle the error path — and the
caller supplies only the interesting part. Every `File.open`, `transaction`, `synchronize`
and `benchmark` in Ruby is this one idea.
:::

## `yield` is a hole in the method

`yield` is the clearest way to think about this. When you write a method containing
`yield`, you are leaving a hole, and the caller fills it.

```ruby runnable
def three_times
  puts "before"
  yield 1
  yield 2
  yield 3
  puts "after"
end

three_times { |n| puts "got #{n}" }
```

The method decides *how many times* the hole is executed and *what arguments* go in. The
caller decides *what happens*. That division is why `each`, `map`, `select`, `times` and
`upto` are all ordinary methods in Ruby rather than language keywords — the looping is in
the method, the body is in the block.

```ruby runnable
# `each` is not magic. Here it is, for a toy collection.
class Basket
  def initialize(*items)
    @items = items
  end

  def each
    return to_enum(:each) unless block_given?   # no block? hand back an Enumerator.
    i = 0
    while i < @items.length
      yield @items[i]
      i += 1
    end
    self
  end
end

basket = Basket.new("apple", "pear", "fig")
basket.each { |item| puts item.upcase }

# Because `each` exists and yields, the Enumerator works too:
p basket.each.to_a
```

:::mistakes
**Calling `yield` when no block was passed.**

```ruby runnable
def risky
  yield
end

begin
  risky
rescue LocalJumpError => e
  puts "#{e.class}: #{e.message}"
end
```

`yield` with no block raises `LocalJumpError` — "no block given (yield)". If the block is
optional, guard it:

```ruby runnable
def greet(name)
  text = "Hello, #{name}"
  text = yield(text) if block_given?
  text
end

puts greet("Asha")
puts greet("Asha") { |t| t.upcase + "!" }
```

**Using `{ }` where you meant `do...end`.** The two are *almost* interchangeable, but
`{ }` binds more tightly than `do...end`:

```ruby runnable
def wrap(x)
  "wrapped(#{x})"
end

# `{ }` binds to `puts`'s argument — the inner method call
puts [1, 2, 3].map { |n| n * 2 }.inspect

# This is the classic trap, shown with an explicit comparison:
# `do...end` binds to the OUTER method (wrap); `{ }` binds to the INNER one.
result_brace = wrap [1, 2].map { |n| n }   # map gets the block
puts result_brace
```

The community convention exists for exactly this reason: `{ }` for single-line blocks
whose value you use, `do...end` for multi-line blocks you run for their side effects.
:::

## Blocks are closures, and that is the second half of the power

A block does not just carry code. It carries the *environment* where it was written.

```ruby runnable
def run_it
  # This method has no idea what `total` is.
  yield
  yield
end

total = 0
run_it { total += 10 }
puts total     # 20
```

`total` is a local variable in the calling scope. The block increments it, and the change
is visible outside. `run_it` never saw `total` and could not have — but the block carries
a reference to the scope it came from.

:::jargon Closure
A **closure** is a function bundled together with the variable bindings from the scope
where it was defined. "Closed over" is the metaphor: the function wraps itself around
those variables and keeps them alive.

The practical consequence: a block sees the variables where it was *written*, not where it
is *run*. This is why you can write `users.each { |u| results << u.name }` and have
`results` be a local variable from three lines up.
:::

:::internals
When Ruby compiles a method call with a block, the block becomes a separate instruction
sequence, and the call frame gets a pointer to it in a dedicated slot — not in the
argument array. That is why a method takes at most one block and why the block does not
appear in the parameter list.

`yield` compiles to a single VM instruction (`invokeblock`) that jumps to that instruction
sequence. Crucially, **no object is allocated**. The block is not a `Proc`; it is just a
pointer to code plus a pointer to the environment.

That changes the moment you write `&block`:

```ruby
def fast; yield; end          # invokeblock — no allocation
def slow(&block); block.call; end   # allocates a Proc object, then calls it
```

`&block` *reifies* the block: it builds a real `Proc` object so you can store it, pass it
on, or inspect it. For that you pay an allocation and a slower call path.

The rule follows directly: use bare `yield` when you only need to run the block here. Use
`&block` only when you need the block as a value — to pass it to another method, store it
for later, or check `arity`.

```ruby runnable
require "benchmark"

def with_yield
  yield
end

def with_proc(&block)
  block.call
end

n = 500_000
Benchmark.bm(12) do |x|
  x.report("yield") { n.times { with_yield { 1 } } }
  x.report("&block") { n.times { with_proc { 1 } } }
end
```
:::

:::realworld
Every one of these is the same pattern — the library owns the guarantee:

```ruby
# Database: commit on success, roll back on any exception.
ActiveRecord::Base.transaction do
  order.save!
  inventory.decrement!(:count)
end

# Lock: released even if the body raises.
MUTEX.synchronize do
  @cache[key] = expensive_computation
end

# Temporary directory: deleted afterwards, always.
Dir.mktmpdir do |dir|
  File.write(File.join(dir, "scratch"), data)
end

# Connection pool: returned to the pool, always.
ActiveRecord::Base.connection_pool.with_connection do |conn|
  conn.execute(sql)
end
```

If you are writing a library and you find yourself documenting "remember to call
`close`", you almost certainly want to offer a block form instead. Documentation asks
users to be careful; a block form makes carefulness unnecessary.
:::

:::failure
Blocks interact with control flow in a way that surprises people, and the surprise can
cause real bugs.

**`return` inside a block returns from the enclosing *method*, not from the block.**

```ruby runnable
def find_first_even(numbers)
  numbers.each do |n|
    return n if n.even?    # exits find_first_even entirely
  end
  nil
end

p find_first_even([1, 3, 6, 8])   # 6 — the each loop is abandoned
```

That is usually what you want. But it means a block is not a self-contained function: it
can tear down the frame around it. If you convert that block to a lambda, the behaviour
changes — `return` in a lambda returns only from the lambda. That difference is the
subject of the next lesson.

**A block that escapes its method can outlive the frame it closed over.**

```ruby runnable
def make_counter
  count = 0
  -> { count += 1 }     # closes over `count`
end

counter = make_counter
puts counter.call   # 1
puts counter.call   # 2
puts counter.call   # 3
```

`count` lives on after `make_counter` returned, because the closure holds it. This is a
feature — it is how memoisation and generators work — but it is also how closures leak
memory: a block stored in a long-lived object keeps its *entire* captured scope alive,
including objects you forgot were in scope.
:::

:::debugging
When a block is not behaving:

```ruby runnable
def inspect_block(&block)
  puts "arity:      #{block.arity}"        # how many params it declares
  puts "lambda?:    #{block.lambda?}"      # strict arg checking + local return?
  puts "source:     #{block.source_location.inspect}"
  puts "parameters: #{block.parameters.inspect}"
end

inspect_block { |a, b| a + b }
```

- `arity` tells you how many arguments it expects. Negative means it has optional or
  splat params (`-2` means "one required, then more").
- `lambda?` is the single most useful diagnostic when argument counts or `return`
  behaviour surprises you.
- `source_location` finds where a block came from when it was passed through three
  layers of library code.
:::

:::performance
Blocks are cheap, but not free, and the costs are easy to reason about:

| What you write | Cost |
|---|---|
| `yield` | One VM instruction. No allocation. |
| `&block` then `block.call` | Allocates a Proc; slower call. |
| `&:symbol` (`map(&:name)`) | Allocates a Proc per call site, but Ruby caches it for symbols. |
| Block in a hot loop | The block body is compiled once; calling it is the only per-iteration cost. |

The thing actually worth avoiding is `&block` where `yield` would do. In a method called
millions of times that difference is measurable — as the benchmark above shows.
:::

:::tradeoffs
**What blocks buy.** Resource safety by construction. Iteration as a library concern
rather than a language one. An extremely compact way to express "do this to each thing".

**What they cost.** A second, special calling convention that every Ruby learner has to
absorb — blocks are not quite objects, not quite arguments, and the `{ }` vs `do...end`
precedence difference is a genuine wart. Ruby then needed `Proc`, `lambda`, `&`, `yield`,
`block_given?` and `Method#to_proc` to make the special case work with the rest of the
language. A language with only first-class functions (JavaScript, Python) has one concept
where Ruby has several, at the cost of the `ensure`-safety pattern being wordier.
:::

:::checkpoint
Write a method `retry_up_to(n)` that runs a block, and if the block raises, tries again
up to `n` times total before letting the exception through. It should return the block's
value on success.

Then answer, without running it: if the block calls `return`, what happens?

The exercise below has tests for the first part.
:::

:::interview
"What is a block?" is a warm-up. The real question is usually the one after it, and it is
some version of *"why does Ruby have blocks when it already has Procs and lambdas?"*

A strong answer: blocks are the optimised, ergonomic path for the overwhelmingly common
case — passing exactly one piece of code to a method that runs it immediately. Because a
block is a pointer rather than an object, `yield` allocates nothing, which matters when
every `each` in the language uses it. `Proc` and `lambda` exist for when you need that
code to *be a value*: stored, passed on, or returned. Then mention the `ensure` guarantee
as the reason the design pays for itself, because that is the part that shows you have
used it rather than read about it.
:::

## What you now know

- Blocks exist to solve a specific structural problem: reusing code that wraps *around* a
  varying middle.
- `yield` is a hole in a method; the caller fills it, the method decides when and how often.
- `ensure` plus `yield` is the resource-safety pattern behind `File.open`, `transaction`
  and `synchronize`. Prefer offering a block form over documenting `close`.
- `yield` with no block raises `LocalJumpError`; guard with `block_given?`.
- Blocks are closures: they see the scope where they were written, which is both the
  source of their power and a way to leak memory.
- `return` in a block exits the enclosing method. That is the thread the next lesson pulls on.
