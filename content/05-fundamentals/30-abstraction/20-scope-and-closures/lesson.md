---
title: Scope and closures
summary: Where a name is visible, how long the value it refers to survives, and the loop bug that taught a generation about both.
level: basic
minutes: 14
status: stable
last_reviewed: "2026-10-07"
tags: [fundamentals, scope, closures, hoisting]
concepts: [scope, closures, lexical-scoping]
prerequisites: [functions, variables]
interview:
  - question: What is a closure?
    level: basic
    answer: >-
      A function together with the variable bindings from the scope where it was defined.
      Two consequences follow. First, lookup is *lexical*: the function sees the variables
      where it was written, not where it is called. Second, those bindings stay alive as
      long as the function does — so a closure returned from a function keeps that
      function's locals from being collected. That is what makes counters, memoisation and
      private state possible, and it is also how closures leak memory.
    followUps:
      - "So why did `var` in a loop capture the wrong value?"
      - "How can a closure cause a memory leak?"
  - question: Explain the difference between `var`, `let` and `const`.
    level: basic
    answer: >-
      `var` is function-scoped and hoisted initialised to `undefined`, so it is readable
      before its declaration. `let` and `const` are block-scoped and hoisted but *not*
      initialised — reading one before its declaration throws a ReferenceError, which is
      the temporal dead zone. `const` additionally forbids rebinding the name, though the
      value it points at can still be mutated. Block scoping is the important difference:
      it is why `let` in a `for` loop gives each iteration its own binding.
resources:
  - title: "MDN — Closures"
    url: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Closures
---

## Two questions that look like one

```ruby runnable
def outer
  secret = 'hidden'
  inner = -> { secret }   # How can this see `secret`?
  inner
end

fn = outer                # `outer` has RETURNED. Its locals should be gone.
p fn.call                 # "hidden" — but they are not
```

Before going further, the Ruby-specific thing that trips up everyone arriving from JavaScript or
Python: **`def` does not close over the enclosing scope.** A nested `def` cannot see the locals
around it at all.

```ruby runnable
def outer_with_def
  secret = 'hidden'

  def inner_method    # a method, not a closure
    secret            # NameError — this body cannot see `secret`
  end

  begin
    inner_method
  rescue NameError => e
    puts "#{e.class}: #{e.message}"
  end
end

outer_with_def
```

`def` opens a brand-new scope with nothing inherited. Blocks, procs and lambdas inherit
everything. That single distinction explains a large fraction of Ruby's design:

| construct | sees enclosing locals? |
|---|---|
| `def` | **no** — a fresh scope |
| `{ ... }` / `do ... end` block | yes |
| `->() { }` lambda, `proc { }`, `Proc.new` | yes |
| `define_method(:name) { }` | **yes** — which is why it exists |
| `class` / `module` body | no |

`define_method` earning its place is the useful consequence. It is the way to define a method
*that closes over something*, and it is how most of Rails' generated methods capture their
configuration:

```ruby runnable
class Holder
  captured = 'from the class body'

  define_method(:via_define_method) { captured }   # works

  # def via_def = captured                          # would be a NameError
end

p Holder.new.via_define_method
```

There are two separate questions here and conflating them is why closures feel mysterious:

1. **Scope** — *where is a name visible?* Answered at the time the code is written.
2. **Lifetime** — *how long does the value survive?* Answered at runtime.

:::problem
The naive model is that a function's locals live on the stack and vanish when it returns.
That model predicts `fn()` throws. It does not throw, so the model is wrong — and the
correct model is the thing that makes callbacks, event handlers, memoisation and module
privacy work at all.
:::

:::what
**Lexical scope**: a name is resolved by looking outward through the blocks that
*textually enclose* the code, not through the call stack.

A **closure**: a function bundled with the bindings it captured from its defining scope,
kept alive for as long as the function is reachable.
:::

## Lexical means "where it was written"

```ruby runnable
# Ruby's `def` scoping makes the lexical point even more sharply: a method
# cannot see a caller's locals OR its definer's locals.
NAME = 'constant'

def who_am_i = NAME       # constants ARE looked up lexically

def calling_method
  name = 'caller'         # completely invisible to who_am_i
  who_am_i
end

p calling_method          # "constant", not "caller"
```

A lambda, by contrast, is resolved where it was *written*, not where it is called — which is the
same lexical rule, applied to something that does capture:

```ruby runnable
message = 'defined here'
show = -> { message }

def elsewhere(callable)
  message = 'called here'   # irrelevant to the lambda
  callable.call
end

p elsewhere(show)           # "defined here"
```

This is the whole content of "lexical scope": a name is resolved by where the code sits in the
source, never by who called it. The alternative — resolving by caller — is dynamic scope, and
Ruby has exactly one piece of it left: global variables, and `Thread.current`, which is why both
are discouraged.

:::how
```text
  Resolution walks OUT through enclosing blocks, not UP the call stack:

    ┌─ global ──────────────────────────────┐
    │  const name = "global"                │
    │                                       │
    │  ┌─ whoAmI ──────────────┐            │
    │  │  return name ─────────────────────▶ found here
    │  └───────────────────────┘            │
    │                                       │
    │  ┌─ caller ──────────────┐            │
    │  │  const name = "caller"│  ← never consulted; it does not
    │  │  return whoAmI()      │    enclose whoAmI textually
    │  └───────────────────────┘            │
    └───────────────────────────────────────┘
```

The alternative — resolving through the call stack — is called **dynamic scoping**. Almost
no modern language uses it, because it means a function's behaviour depends on who called
it, so you can never read a function in isolation. Bash and Emacs Lisp have it; the
comparison is instructive about why nobody repeated it.
:::

:::why
Lexical scope is what makes a function readable on its own. Everything it can see is
visible on the page around it. That is also exactly what a closure preserves — and why a
closure is not a special feature so much as the honest consequence of lexical scope
surviving the stack.
:::

## The loop bug

This is the single most instructive bug in JavaScript's history, because it is scope and
lifetime failing together.

```ruby runnable
# A block parameter is a fresh binding per iteration, so each lambda keeps
# its own value. This is the behaviour JavaScript needed `let` to get.
from_block = []
[0, 1, 2].each { |n| from_block << -> { n } }
p from_block.map(&:call)      # [0, 1, 2]

# `for` does not create a scope, so all three lambdas share ONE binding.
from_for = []
for n in [0, 1, 2]
  from_for << -> { n }
end
p from_for.map(&:call)        # [2, 2, 2]
p n                           # 2 — and the variable leaked out of the loop
```

This is the `var`-in-a-loop bug, and in Ruby it belongs to `for` alone. Every block-based
iterator — `each`, `map`, `times`, `each_with_index` — gives each iteration its own binding, so
the problem cannot occur. It is the clearest single argument for why `for` has effectively
disappeared from Ruby.

The other half of block scoping is that a block *can* write to variables that already exist
outside it, which is deliberate and is what makes accumulator patterns work:

```ruby runnable
total = 0
[1, 2, 3].each { |n| total += n }   # writes the OUTER total
p total                              # 6

first_seen = nil
%w[a b c].each { |s| first_seen ||= s }
p first_seen                         # "a"
```

And when you want a block-local variable that shadows instead, declare it after a semicolon in
the parameter list:

```ruby runnable
shadowed = 'outer'
[1].each { |_n; shadowed| shadowed = 'inner' }
p shadowed      # "outer" — untouched
```

That syntax is rare in real code, but knowing it exists explains the error message when you hit
`shadowing outer local variable` warnings.

:::internals
```text
  var:  ONE binding, function-scoped. All three closures captured the same box.
        By the time any of them ran, the loop had finished and the box held 3.

        ┌─────────┐
        │ i = 3   │ ◀── fn0, fn1, fn2 all point here
        └─────────┘

  let:  a NEW binding per iteration — this is specified behaviour, not a side effect.
        Each closure captured a different box.

        ┌─────────┐  ┌─────────┐  ┌─────────┐
        │ j = 0   │  │ j = 1   │  │ j = 2   │
        └─────────┘  └─────────┘  └─────────┘
             ▲            ▲            ▲
            fn0          fn1          fn2
```

Before `let` existed, the workaround was to create a scope by hand with an immediately
invoked function:

```ruby runnable
# The JavaScript fix for `var` was to wrap each iteration in a function so the
# value became a parameter. In Ruby that is just... using a block, which is
# what you were going to do anyway:
fns = []
3.times { |captured| fns << -> { captured } }
p fns.map(&:call)       # [0, 1, 2]

# Or, if you already have the `for` loop and cannot change it, bind explicitly:
fns2 = []
for n in [0, 1, 2]
  fns2 << ->(captured = n) { captured }   # the default is evaluated NOW
end
p fns2.map(&:call)      # [0, 1, 2]
```

That pattern — the IIFE — is all over pre-2015 JavaScript, and this is the bug it existed
to work around. `let` made it unnecessary by giving the loop a per-iteration binding.
:::

## `var`, `let`, `const`

```ruby runnable
# Ruby has no block-scoped `let`. `if`, `while`, `case` and `begin` do NOT
# create scopes, so a variable assigned inside one is visible afterwards.
def scoping
  if true
    inside_if = 'assigned inside the if'
  end

  p inside_if        # "assigned inside the if" — visible
end
scoping
```

And the consequence that actually catches people — a variable assigned in a branch that *did not
run* is still defined, and holds `nil`:

```ruby runnable
def maybe(flag)
  if flag
    result = 'computed'
  end
  result        # nil when flag was false, NOT a NameError
end

p maybe(true)    # "computed"
p maybe(false)   # nil
```

Ruby decides a name is a local variable at *parse* time, when it sees the assignment — not at run
time when the assignment executes. So the name exists either way and defaults to `nil`. That is
why `if`-assigned variables are a quiet source of `NoMethodError ... for nil` later on, and why
the idiomatic form is to make the `if` an expression and assign its value:

```ruby runnable
def maybe_better(flag)
  result = if flag
             'computed'
           else
             'default'
           end
  result
end

p [maybe_better(true), maybe_better(false)]
```

Making every branch produce a value turns "I forgot a case" from a silent `nil` into something
you can see in the shape of the code.

```ruby runnable
# Ruby's version of hoisting: the parser creates the local when it SEES the
# assignment, so the name exists from that point in the source onward — even
# if the line never executes.
def before_and_after
  begin
    p later       # NameError: the parser has not seen the assignment yet
  rescue NameError => e
    puts "before the assignment: #{e.class}"
  end

  later = 'now defined' if false   # never runs...
  p later                          # ...but the name exists, holding nil
end

before_and_after
```

So Ruby has a one-directional version of the problem: *before* the assignment appears in the
source you get a `NameError`; *after* it appears you get `nil` whether or not it ran. There is no
temporal dead zone and no `undefined` — just `nil`, which is the value you then carry around.

The practical reading: a `NameError` for a local means you referenced it above its assignment, or
misspelled it. A surprising `nil` means the assignment is below you in the source and did not
run. Those are two different bugs with two different fixes, and the error distinguishes them.

:::mistakes
**`const` does not freeze the value** — it freezes the binding. Covered in the names-and-
values lesson, and it keeps surprising people here too.

**Closures capture the binding, not a snapshot.**

```ruby runnable
config = { url: 'first' }
read = -> { config[:url] }

p read.call              # "first"
config = { url: 'second' }
p read.call              # "second" — the closure sees the current binding
```

If you wanted the value at capture time, capture the value:

```ruby runnable
config = { url: 'first' }

# Capture the VALUE, not the variable, by passing it in.
read_snapshot = ->(url) { -> { url } }.call(config[:url])

config = { url: 'second' }
p read_snapshot.call     # "first"

# A default argument does the same thing more readably:
config = { url: 'third' }
snapshot2 = ->(url = config[:url]) { url }
config = { url: 'fourth' }
p snapshot2.call         # "fourth" — careful! the default is evaluated at CALL time
```

That last line is a trap worth having met once. A lambda's default argument is evaluated when the
lambda is *called*, not when it is created, so it does not snapshot anything. If you want a value
frozen at creation time, pass it as an argument at creation time — the `.call(config[:url])` form
above — or assign it to a separate local first.

**`this` is not lexically scoped in a regular function.** It is the one exception to
everything above, which is exactly why it causes trouble:

A closure captures more than local variables: it also captures `self`. In JavaScript this is a
famous source of bugs, because a regular function receives `this` from how it is *called* and an
arrow function takes it lexically. Ruby has no such split — **a block always inherits `self` from
where it was written**:

```ruby runnable
class Counter
  attr_reader :count

  def initialize = @count = 0

  def increment
    [1, 2].each { @count += 1 }   # `self` is still this Counter
    @count
  end

  def who_am_i = [1].map { self.class.name }.first
end

c = Counter.new
p c.increment      # 2 — the instance variable was found, as you would expect
p c.who_am_i       # "Counter"
```

So the `this`-binding bug class does not exist here. What exists instead is the deliberate
version: Ruby lets you *change* `self` for a block, and that is how almost every Ruby DSL you
have used works.

```ruby runnable
class Config
  attr_reader :settings

  def initialize = @settings = {}
  def set(key, value) = @settings[key] = value

  def self.build(&block)
    config = new
    config.instance_eval(&block)   # inside the block, `self` IS config
    config
  end
end

cfg = Config.build do
  set :host, 'example.com'        # no receiver — `self` is the config
  set :port, 443
end

p cfg.settings
```

That is the mechanism behind `Rails.application.routes.draw do ... end`, an RSpec `describe`
block, a FactoryBot factory, a `Gemfile`, and a Rake task. Each one re-points `self` at an object
whose methods make up the vocabulary of the DSL, which is why those files read like configuration
rather than code.

Knowing it is a mechanism rather than magic buys you two things. You can read the error when a
DSL block cannot find a method — it is looking on the DSL object, not on your class. And you can
tell the two block-passing conventions apart when designing an API:

```ruby runnable
class Builder
  def self.with_yield
    b = new
    yield b            # `self` stays the caller's; the block takes an argument
    b
  end

  def self.with_instance_eval(&blk)
    b = new
    b.instance_eval(&blk)   # `self` becomes b; the block takes nothing
    b
  end

  def mark = (@marked = true; self)
  def marked? = !!@marked
end

Builder.with_yield { |b| p ['with_yield, self is', self.class.name]; b.mark }
Builder.with_instance_eval { p ['with_instance_eval, self is', self.class.name]; mark }
```

`yield b` is the safer convention and the right default: the caller keeps their own `self`, so
their helper methods and instance variables still work, and the dependency is explicit in the
block parameter. `instance_eval` makes the nicer-looking DSL and takes something away — inside
that block the caller's own methods may be unreachable, which is a confusing failure to debug.
Use it when you are building a configuration language, and `yield` for everything else.

**Arrow functions close over `this` lexically; regular functions receive it from the call
site.** That single difference is the main practical reason to prefer arrows for
callbacks.
:::

:::failure
**Closures keep their entire captured scope alive, including things you forgot about.**

```ruby runnable
require 'objspace'

def make_leaky
  huge = Array.new(1_000_000, 'x')
  small = huge.size
  # This lambda only needs `small`, but it captures the whole binding — so
  # `huge` stays reachable for as long as the lambda does.
  -> { small }
end

def make_clean
  small_only = Array.new(1_000_000, 'x').size   # the array is unreferenced here
  -> { small_only }
end

leaky = make_leaky
clean = make_clean
p [leaky.call, clean.call]      # the same answer

# You can see the captured scope directly:
p leaky.binding.local_variables    # [:huge, :small] — huge is still named
p clean.binding.local_variables    # [:small_only]
```

Ruby lets you *prove* this rather than assert it, which the JavaScript version could not:
`Proc#binding` hands you the captured scope as an object, and `local_variables` lists exactly what
the closure is keeping alive. `[:huge, :small]` is the leak, visible.

The fix is to not have the large object as a local in the capturing scope — compute and discard it
in a different method, or set the variable to `nil` before returning the lambda. In a long-running
Rails process this matters most for closures stored somewhere persistent: a memoised callback, an
`around_action`, an `ActiveSupport::Notifications` subscriber, or anything registered at boot. A
closure created per request and dropped per request cannot leak much; one registered once and
holding a request's worth of data holds it forever.

This is the classic leak shape in long-lived processes: an event handler or a cache entry
whose closure captured a scope containing a large object nobody meant to retain. The fix is
structural — compute in a narrower scope so the large value is never in the captured
environment.

Engines do optimise some of this away, but you cannot rely on it: whether a given variable
is retained depends on whether the engine can prove it is unused, and `eval` or a debugger
defeats that proof.
:::

:::realworld
Closures are the mechanism behind a surprising amount of ordinary code:

```ruby runnable
# Private state with no class at all — the balance is only reachable
# through the lambdas that closed over it.
def make_account(balance)
  {
    deposit: ->(n) { balance += n },
    read: -> { balance },
  }
end

acct = make_account(100)
acct[:deposit].call(50)
p acct[:read].call      # 150
p acct[:balance]        # nil — there is no such key; the state is unreachable

# Run-once, with the flag in the closure.
def once(&fn)
  done = false
  value = nil
  lambda do |*args|
    unless done
      done = true
      value = fn.call(*args)
    end
    value
  end
end

inits = 0
init = once { inits += 1; 'ready' }
p [init.call, init.call, init.call]
p inits                 # 1

# Partial application. Ruby has `curry` built in.
multiply = ->(factor, n) { n * factor }
p [1, 2, 3].map(&multiply.curry[10])

# ...and `method(:name).to_proc` turns any method into one.
def triple(n) = n * 3
p [1, 2, 3].map(&method(:triple))
```

Two Ruby-specific notes. `done = false` has to be assigned *before* the lambda, because the
parser needs to have seen the assignment for the name to be a local rather than a method call —
the same parse-time rule from the hoisting section.

And in Ruby this pattern competes with a real language feature, which it does not in JavaScript.
A class with `private` methods and `attr_reader` gives you encapsulation with a name, a place for
documentation, and a type that appears in backtraces. Closure-based state is the right choice for
something small and anonymous — a callback, a configured lambda, a memoised helper — and the
wrong choice for anything a reader will need to find later. `Struct` and `Data.define` cover most
of the middle ground.

React hooks are closures: `useState` returns a setter that closes over which state slot it
owns. The "stale closure" bug every React developer meets — a callback reading an old
value — is exactly this lesson, with a dependency array as the fix.
:::

:::tradeoffs
**Closures** give you private state without a class, let callbacks carry context without
parameters, and make partial application and memoisation trivial.

The costs are real: captured scope is invisible at the call site, so a closure reading
something that changed later is a bug with no local evidence; and retained scope is the
most common JavaScript memory leak. Classes make the state explicit and inspectable at the
price of ceremony.

The rule worth adopting: **capture what you need, not the scope you are in.** If a closure
only needs one number, make sure one number is all that is in reach.
:::

:::checkpoint
Predict each:

```ruby
# What does each print, and why?

# 1
fns = []
for i in [1, 2, 3]
  fns << -> { i }
end
p fns.map(&:call)

# 2
fns2 = [1, 2, 3].map { |n| -> { n } }
p fns2.map(&:call)

# 3
x = 1
f = -> { x }
x = 2
p f.call

# 4
def try_it
  value = 'local'
  def inner = value
  inner
end
# p try_it

# 5
def maybe(flag)
  if flag
    answer = 'yes'
  end
  answer
end
p [maybe(true), maybe(false)]

# 6
p(proc { |a, b| [a, b] }.call(1))
p(->(a, b) { [a, b] }.call(1)) rescue p $!.class
```

Then: number 3 behaves like `let` rather than `var` even though no `let` appears. Why?
:::

:::interview
"What is a closure?" is asked constantly and answered badly, because most answers describe
the mechanism without the consequence.

Lead with both halves: *"a function plus the bindings from where it was defined. So lookup
is lexical — it sees where it was written, not where it is called — and those bindings stay
alive as long as the function does."* Then prove you understand the second half: *"which is
why a closure returned from a function keeps that function's locals alive, and why the
most common JavaScript memory leak is a handler whose captured scope contains something
large."*

The follow-up is almost always the loop. The right answer is not "use `let`" — it is
*"`var` is function-scoped, so all three closures captured one binding that held 3 by the
time they ran. `let` creates a new binding per iteration, which is specified behaviour.
Before `let`, you made a scope by hand with an IIFE — that is what all those wrapper
functions in old code were for."*
:::

## What you now know

- Scope asks where a name is visible; lifetime asks how long the value survives. Closures
  are both answers at once.
- Lexical scoping resolves names outward through enclosing text, not up the call stack —
  which is what makes a function readable alone.
- A closure captures *bindings*, not snapshots, so it sees later changes.
- `var` is function-scoped and initialised on hoist; `let`/`const` are block-scoped with a
  temporal dead zone.
- `let` in a loop creates a binding per iteration. The pre-2015 IIFE did this by hand.
- Arrow functions close over `this` lexically; regular functions take it from the call.
- A closure retains its whole captured scope — capture what you need, not where you are.
