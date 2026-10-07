---
title: Mutability, dup and freeze
summary: Most Ruby objects can be changed by anyone holding them. The three bugs that causes, and the difference between dup, clone and a deep copy.
level: intermediate
minutes: 15
version: "3.4"
status: stable
last_reviewed: "2026-10-07"
tags: [ruby, mutability, freeze, dup, clone]
concepts: [mutability, freezing, copying, aliasing]
prerequisites: [objects, value-vs-reference]
interview:
  - question: What is the difference between dup and clone?
    level: intermediate
    answer: >-
      Both make a shallow copy. `clone` also copies the frozen state and the singleton class;
      `dup` copies neither, so `dup` of a frozen object is unfrozen and `clone` of a frozen
      object is frozen. You can override that with `clone(freeze: false)`. Both are shallow,
      which is usually the thing that actually matters: the copy's instance variables point at
      the same objects as the original's, so mutating a nested array affects both.
    followUps:
      - "How would you make a deep copy, and what is wrong with the usual trick?"
  - question: What does freeze actually prevent?
    level: intermediate
    answer: >-
      It prevents modifying that object's own state — its instance variables, and for built-in
      types its contents. It is shallow: freezing an array prevents adding and removing
      elements, and does nothing to the elements themselves, so `a.freeze; a[0] << "x"` works
      fine. That shallowness is the main source of false confidence. Freezing is also how
      Ruby gets some real optimisations, notably deduplicating frozen string literals.
    followUps:
      - "So how do you deeply freeze something?"
  - question: Why does a default argument of [] not behave the way people expect?
    level: intermediate
    answer: >-
      In Ruby it actually behaves fine — the expression is evaluated on every call, so each
      call gets a fresh array. The trap is the *constant* or instance-variable version: a
      default that returns a shared object, or a class-level constant array that a caller then
      mutates, changes the value for everyone. Python evaluates defaults once at definition
      time, which is where the famous version of this bug comes from — worth knowing because
      the same mistake in Ruby takes the form of a shared constant rather than a shared
      default.
    followUps:
      - "How do you protect a constant from being mutated?"
resources:
  - title: "Ruby docs — Object#freeze"
    url: https://docs.ruby-lang.org/en/master/Object.html#method-i-freeze
---

## The problem, in four lines

```ruby
class Config
  attr_reader :hosts
  def initialize(hosts) = @hosts = hosts
end

hosts  = ["a.example", "b.example"]
config = Config.new(hosts)

hosts << "evil.example"     # the caller still holds the array
config.hosts                # ["a.example", "b.example", "evil.example"]
```

`attr_reader` returned the object, not a copy. Everyone holding that array can change what
the config says.

:::what
An object is **mutable** if its state can change after creation. In Ruby almost everything
is: strings, arrays, hashes and your own objects. `freeze` makes an object reject
modification, and it is **shallow** — it protects the object, not what the object points at.
:::

:::why
Mutability is the default because it is convenient and fast: building a string by appending
is cheaper than allocating a new one each time, and `array << x` is the natural way to
collect results.

The cost is that passing an object is granting write access. Two pieces of code holding the
same array are coupled in a way neither can see from reading its own code — which is the
defining property of a bug that takes a long time to find. "Who changed this?" is answerable
by reading one place when objects are immutable, and requires understanding the whole program
when they are not.

So Ruby gives you the tools to opt into immutability where it matters — `freeze`, `dup`,
`Data.define`, frozen string literals — and leaves the default alone. The skill is knowing
the three boundaries where it matters: what you accept, what you return, and what you share.
:::

:::how
```text
  TWO NAMES, ONE OBJECT

    a = ["x"]
    b = a            # not a copy. Another name for the same array.

    a.object_id == b.object_id   → true
    a << "y"
    b                            → ["x", "y"]

  REASSIGNMENT IS NOT MUTATION

    a = ["x"]
    b = a
    a = a + ["y"]    # + builds a NEW array; a now names it
    b                → ["x"]      b still names the original

    a = ["x"]
    b = a
    a << "y"         # << mutates the object both names refer to
    b                → ["x", "y"]

  The method you choose decides whether the other name sees it.
  Ruby's convention: a `!` suffix often means "mutates the receiver",
  and `+`, `map`, `select`, `sort` return new objects while `<<`,
  `concat`, `map!`, `sort!` mutate.

  SHALLOW VERSUS DEEP

    original = { tags: ["a"] }
    copy     = original.dup

    copy[:tags] << "b"           # same inner array
    original                     → { tags: ["a", "b"] }

    original ──┐
               ├──▶ the ["a"] array   ← one object, two owners
    copy ──────┘
```
:::

:::example
```ruby
# Three boundaries, three defences.

class Config
  attr_reader :hosts

  # 1. What you ACCEPT: copy it, so the caller cannot change it later.
  def initialize(hosts)
    @hosts = hosts.dup.freeze
  end

  # 2. What you RETURN: already frozen above, so attr_reader is safe.
  #    Without the freeze you would need:
  #      def hosts = @hosts.dup
  #    which allocates on every call — the frozen version is better.
end

hosts  = ["a.example"]
config = Config.new(hosts)
hosts << "evil.example"     # affects only the caller's array
config.hosts                # ["a.example"]
config.hosts << "x"         # FrozenError
```

```ruby
# 3. What you SHARE: a constant is not protected by being a constant.
class Config
  DEFAULTS = { timeout: 5, retries: 3 }         # mutable!
  FROZEN   = { timeout: 5, retries: 3 }.freeze  # not mutable
end

Config::DEFAULTS[:timeout] = 500   # works, and affects everyone, forever
Config::FROZEN[:timeout] = 500     # FrozenError
# `DEFAULTS = ...` again would warn about reassigning a constant.
# Mutating its contents warns about nothing at all.
```
:::

:::failure
**`freeze` is shallow, which gives false confidence.**

```ruby
config = { hosts: ["a"], name: "prod" }.freeze

config[:env] = "x"      # FrozenError — good
config[:hosts] << "b"   # works. The ARRAY is not frozen.
config[:name] << "!"    # works. The STRING is not frozen.
config                  # { hosts: ["a", "b"], name: "prod!" }
```

Deep freezing has no built-in method, so it is a recursive walk:

```ruby
def deep_freeze(obj)
  case obj
  when Hash  then obj.each { |k, v| deep_freeze(k); deep_freeze(v) }
  when Array then obj.each { |v| deep_freeze(v) }
  end
  obj.freeze
end
# Note this does not handle cycles. For config loaded from YAML it is fine;
# for an arbitrary object graph you need a visited set.
```

**The shared default that is not a default.**

```ruby
# Ruby evaluates default arguments per call, so this is actually fine:
def add(item, list = [])
  list << item
end
add(1)   # [1]
add(2)   # [2]    — a fresh array each call

# This is the Ruby version of the bug:
EMPTY = []
def add(item, list = EMPTY)
  list << item
end
add(1)   # [1]
add(2)   # [1, 2]    — EMPTY is now permanently [1, 2]
EMPTY    # [1, 2]
```

Python evaluates defaults once at definition time, which makes `def add(item, list=[])` the
famous version of this bug. Ruby's equivalent hides in a constant or a memoised
`@list ||= []`.

**`dup` on a frozen object silently gives you a mutable one.**

```ruby
FROZEN = ["a"].freeze
copy = FROZEN.dup
copy << "b"        # works. dup does not copy frozen state.
copy = FROZEN.clone
copy << "b"        # FrozenError. clone does.
copy = FROZEN.clone(freeze: false)
copy << "b"        # works, explicitly.
```

That is usually what you want from `dup` — you duplicated it in order to change it — but it
means `dup` is not a way to pass along an immutability guarantee.

**The `Marshal` deep-copy trick, and why it is a trap.**

```ruby
deep = Marshal.load(Marshal.dump(original))
# Fails on: procs, lambdas, IO objects, singleton methods, anonymous
# classes, and anything holding a database connection.
# Also: NEVER Marshal.load untrusted input. It instantiates arbitrary
# objects and calls methods on them — it is remote code execution.
```

For config and plain data it works. As a general-purpose deep copy it is a liability on both
counts.
:::

:::realworld
```ruby
# 1. Frozen string literals. On by default for new files in 3.x via
#    the magic comment, and the default in a future version.
# frozen_string_literal: true

s = "hello"
s.frozen?        # true
s << " world"    # FrozenError
s = s + " world" # fine — a new string
s = +"hello"     # unary + gives a MUTABLE copy when you need one
s = -"hello"     # unary - gives a FROZEN, DEDUPLICATED string

# Why it is worth having on: every identical literal in the file
# becomes the same object, so a literal inside a loop allocates once
# instead of once per iteration. On a hot path that is measurable.
```

```ruby
# 2. The Rails pattern this prevents.
class User < ApplicationRecord
  # Dangerous: the caller can mutate the array behind your attribute.
  def tags = read_attribute(:tags)

  # Safe, and allocation-free after the first call.
  def tags = (@tags ||= read_attribute(:tags).freeze)
end
```

```ruby
# 3. Mutation across a boundary — the version that reaches production.
def normalise!(params)
  params[:email] = params[:email].downcase
  params
end

original = { email: "A@B.COM" }
normalise!(original)
# The caller's hash changed. If `original` was a cached object, or a
# request parameter reused later, the effect outlives this call.
#
# The convention Ruby gives you: the `!` says so. Use it, and provide
# a non-mutating version as the default:
def normalise(params) = params.merge(email: params[:email].downcase)
```

```ruby
# 4. Ractors make this structural rather than advisory. A Ractor can
#    only receive deeply-frozen (shareable) objects, so immutability
#    stops being a discipline and becomes a type check.
Ractor.shareable?({ a: 1 }.freeze)    # false — nested values unfrozen
Ractor.shareable?(Ractor.make_shareable({ a: [1] }))  # true, deep-frozen
```
:::

:::mistakes
**Returning `@array` from an `attr_reader`** without freezing it. The caller can modify your
object's state through the reader.

**Assuming `freeze` is deep.** It protects one object. Nested containers are untouched.

**Assuming `freeze` makes something thread-safe.** A frozen object cannot be mutated, so
sharing it is safe — but freezing a container whose elements are mutable buys you nothing for
concurrency.

**`dup`ing to preserve immutability.** `dup` drops the frozen flag. Use `clone`.

**Mutating a constant's contents.** Ruby warns when you reassign a constant and says nothing
when you mutate one. `freeze` every constant holding a collection.

**Mutating a method argument without a `!` in the name.** The convention exists so callers can
tell at the call site. Breaking it means every caller must read your implementation.

**`each` + `delete` on the same collection.** Mutating a collection while iterating it skips
elements. Build a new collection with `reject`.

**Memoising with `||=` on a falsy value.** `@x ||= compute` recomputes forever when `compute`
returns nil or false. Use `defined?(@x) ? @x : (@x = compute)`.
:::

:::tradeoffs
**Mutable by default** — fast, convenient, and passing an object grants write access to it.
Appropriate for local, short-lived objects where you own every reference.

**Freezing at boundaries** — the practical middle. Copy and freeze what you accept, freeze
what you expose, freeze every constant. Costs one `dup` per boundary and removes the whole
class of bug.

**Immutable value objects (`Data.define`)** — no aliasing bugs, safe to share across threads,
usable as hash keys. Costs an allocation per change, which is almost always irrelevant and
occasionally matters in a tight loop.

**Deep freezing** — a real guarantee, and it has to be hand-rolled, is recursive, and chokes
on cycles. Worth it for loaded configuration and little else.

**Defensive copying on every read** — safe and allocates on every call, which turns a reader
into a cost. Freezing once at construction is almost always the better version of the same
idea.

The rule worth internalising: **freeze at the boundary, not everywhere.** Local mutation
inside a method is fine and fast; what matters is what crosses in and out.
:::

:::checkpoint
1. `a = ["x"]; b = a; a << "y"` — what is `b`? And with `a = a + ["y"]` instead?
2. `config = { hosts: ["a"] }.freeze`. Which of `config[:x] = 1` and `config[:hosts] << "b"`
   raises?
3. `FROZEN.dup` versus `FROZEN.clone` — which gives a mutable copy?
4. Why does `EMPTY = []; def add(x, l = EMPTY) = l << x` accumulate across calls when
   `def add(x, l = []) = l << x` does not?
5. Name two reasons `Marshal.load(Marshal.dump(x))` is a poor general deep copy.
6. What does `# frozen_string_literal: true` buy you beyond safety?
:::

:::interview
Lead with the fact that passing an object grants write access, because that framing is the
insight:

*"Almost everything in Ruby is mutable, so handing someone an array is handing them write
access to it. The three places that matters are what I accept, what I return and what I share.
I `dup` and `freeze` what I accept so the caller cannot change it afterwards, I freeze what I
expose rather than duping on every read, and I freeze every constant holding a collection —
Ruby warns about reassigning a constant and says nothing about mutating one."*

The `dup`/`clone` distinction, with the part that actually matters:

*"`clone` copies the frozen state and the singleton class; `dup` copies neither. But the more
important thing about both is that they are shallow — the copy's instance variables point at
the same objects, so mutating a nested array affects both. There is no built-in deep copy;
`Marshal.load(Marshal.dump(x))` is the usual trick and it fails on procs, IO and anything
holding a connection, and it is remote code execution on untrusted input."*

And the shallowness of `freeze`, which is where false confidence comes from:

*"`freeze` is shallow. Freezing a hash stops you adding keys and does nothing to the values,
so `config[:hosts] << 'x'` works on a frozen config. Deep freezing is a recursive walk you
write yourself — or `Ractor.make_shareable`, which does it and then enforces it."*
:::

## What you now know

- Assignment creates another name for the same object; `b = a` is not a copy.
- `<<` and `!` methods mutate; `+`, `map`, `select` return new objects.
- `dup` and `clone` are shallow; nested objects stay shared.
- `clone` preserves frozen state and the singleton class; `dup` does not.
- `freeze` is shallow — it protects the object, not what it points at.
- Deep freezing is a hand-written recursive walk, or `Ractor.make_shareable`.
- Ruby evaluates default arguments per call; the shared-object bug hides in constants.
- Mutating a constant's contents produces no warning. Freeze collection constants.
- Copy and freeze at boundaries: what you accept, what you return, what you share.
- Frozen string literals deduplicate identical literals, so a literal in a loop allocates
  once.
- `Marshal.load(Marshal.dump(x))` is not a general deep copy, and is unsafe on untrusted
  input.
