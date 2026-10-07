---
title: How Ruby finds a method
summary: The ancestor chain, why `super` works the way it does, and how to debug "undefined method" without guessing.
level: basic
minutes: 16
version: "3.3"
status: stable
last_reviewed: "2026-09-20"
tags: [ruby, objects, method-lookup, debugging]
concepts: [method-lookup, ancestors, modules, super]
prerequisites: [objects]
interview:
  - question: Walk me through what Ruby does when you call `user.save`.
    level: intermediate
    hint: Start from the object, not from the class.
    answer: >-
      Ruby finds the object's class, then walks that class's ancestor chain in order,
      looking for a method named `save` in each entry's method table. The chain is: the
      object's singleton class (if it has one), then the class itself, then any modules
      it prepended (last prepend first), then modules it included (last include first),
      then the superclass, and so on up through `Object`, `Kernel` and `BasicObject`.
      The first match wins and execution stops there. If nothing matches, Ruby starts
      over looking for `method_missing` along the same chain — and `BasicObject#method_missing`
      raises `NoMethodError`.
    followUps:
      - "If two included modules both define `save`, which one wins?"
      - "How would you insert behaviour *before* the class's own method rather than after?"
    realWorld: >-
      This is exactly how Rails concerns, `ActiveSupport::Concern` and gems like Devise
      add behaviour to your models without editing them — and why load order can change
      behaviour when two gems define the same method.
  - question: What is the difference between `include` and `prepend`?
    level: intermediate
    answer: >-
      Both insert a module into the ancestor chain, but at different positions relative to
      the class. `include` puts the module *after* the class, so the class's own method
      wins and the module is a fallback. `prepend` puts it *before* the class, so the
      module's method wins and can call `super` to reach the class's version. `prepend` is
      how you wrap existing behaviour — logging, instrumentation, memoisation — without
      alias chaining.
    followUps:
      - "Why did `alias_method_chain` get deprecated in favour of `prepend`?"
  - question: Why does `5.foo` raise NoMethodError rather than returning nil?
    level: basic
    answer: >-
      Because the lookup failed and the fallback path ended at `BasicObject#method_missing`,
      whose implementation raises `NoMethodError`. Returning `nil` for unknown methods
      would mean every typo silently produced `nil`, and the bug would surface somewhere
      far from its cause.
resources:
  - title: "Ruby documentation — Module#ancestors"
    url: https://docs.ruby-lang.org/en/master/Module.html#method-i-ancestors
  - title: "Ruby documentation — Module#prepend"
    url: https://docs.ruby-lang.org/en/master/Module.html#method-i-prepend
---

## The error you will see a thousand times

```text
NoMethodError: undefined method `nmae' for an instance of User
```

Most of the time the cause is a typo and you fix it in two seconds. But sometimes the
method *definitely* exists, you can see it in the file, and Ruby still says no. Or worse:
the method runs, but it is not the one you were looking at.

Guessing at that point is miserable. The way out is to know the rule Ruby actually
follows — and it is a short rule.

:::problem
Multiple inheritance is genuinely useful: a `User` might want timestamp behaviour, soft
deletion, and serialisation, none of which belong in a single parent class. But full
multiple inheritance creates the diamond problem — if two parents define the same method,
which runs? C++ makes you disambiguate by hand. Java sidestepped it by banning multiple
inheritance of implementation entirely, which pushed everyone toward awkward delegation.
:::

:::history
Before Ruby, the two mainstream answers were:

- **Single inheritance only** (Java, C#): no ambiguity, but no way to share
  implementation across unrelated branches of a hierarchy. Hence interfaces with no
  bodies, and a lot of copy-paste or delegation.
- **Full multiple inheritance** (C++, Python): powerful, but the resolution rules are
  intricate enough that most teams adopt a style guide telling people not to use it.
:::

:::why
Ruby's answer: classes are single-inheritance, but **modules** can be mixed in, and
mixing in a module does not create a second parent — it *inserts a link into a single,
linear chain*. There is never any ambiguity about which method wins, because there is
never more than one chain. You can always print it.
:::

## The chain is a real thing you can look at

```ruby runnable
module Timestamps
  def touch
    "touched"
  end
end

module SoftDelete
  def destroy
    "soft deleted"
  end
end

class Record
  def save
    "saved"
  end
end

class User < Record
  include Timestamps
  include SoftDelete
end

p User.ancestors
```

That prints:

```text
[User, SoftDelete, Timestamps, Record, Object, Kernel, BasicObject]
```

This list *is* the algorithm. When you call a method on a `User`, Ruby checks each entry
left to right and runs the first definition it finds. That is the whole rule.

:::what
**Method lookup** is a linear search for a method name through the receiver's ancestor
chain, stopping at the first match.
:::

Notice two things about the order:

1. `SoftDelete` comes before `Timestamps`, even though `Timestamps` was included first.
   **Later includes sit closer to the class.** Think of each `include` as pushing the
   module onto the chain right above the class, shoving earlier ones further away.
2. Both modules come *after* `User` and *before* `Record`. So `User`'s own methods beat
   any included module, and any included module beats the superclass.

:::how
```text
    user.save
      │
      ▼
 ┌─────────────────┐
 │ singleton class │  methods defined on this one object (def user.save)
 └────────┬────────┘
          ▼
 ┌─────────────────┐
 │ prepended mods  │  last prepend first
 └────────┬────────┘
          ▼
 ┌─────────────────┐
 │      User       │  the class itself
 └────────┬────────┘
          ▼
 ┌─────────────────┐
 │ included mods   │  last include first
 └────────┬────────┘
          ▼
 ┌─────────────────┐
 │     Record      │  superclass — then repeat the whole pattern for it
 └────────┬────────┘
          ▼
   Object → Kernel → BasicObject
          │
          ▼
   not found → start again looking for method_missing
          │
          ▼
   BasicObject#method_missing → raise NoMethodError
```
:::

## `super` means "keep walking from here"

This is the part that clicks late for most people, and it clicks immediately once you
think in terms of the chain.

`super` does **not** mean "call my parent class's method". It means: *resume the search
for this same method name, starting from the next entry in the chain.*

```ruby runnable
module Loud
  def greet
    super.upcase + "!"
  end
end

class Greeter
  def greet
    "hello"
  end
end

class Shouter < Greeter
  include Loud
end

p Shouter.ancestors
puts Shouter.new.greet
```

`Shouter.ancestors` is `[Shouter, Loud, Greeter, ...]`. Calling `greet` finds nothing in
`Shouter`, finds `Loud#greet`, and `super` inside it resumes from `Greeter` — which is
the next link, and happens not to be a superclass relationship at all. A module calling
`super` to reach a class is perfectly normal once you stop thinking in parent/child terms.

:::mistakes
**Expecting `include` to override the class's own method.** This is the single most
common surprise:

```ruby runnable
module Override
  def name
    "from module"
  end
end

class Thing
  include Override

  def name
    "from class"
  end
end

puts Thing.new.name   # "from class" — the module is a *fallback*, not an override
```

If you wanted the module to win, you needed `prepend`:

```ruby runnable
module Wrapper
  def name
    "wrapped(" + super + ")"
  end
end

class Thing
  prepend Wrapper

  def name
    "original"
  end
end

puts Thing.new.name     # "wrapped(original)"
p Thing.ancestors       # [Wrapper, Thing, Object, ...]
```

`prepend` is the tool for *decorating* existing behaviour. The module sits in front, does
its work, and calls `super` to reach the real implementation.
:::

:::realworld
`prepend` is how instrumentation gets added to code you do not own:

```ruby
# Measure how long every call to Payment#charge takes, without touching Payment.
module ChargeTiming
  def charge(*args, **kwargs, &block)
    started = Process.clock_gettime(Process::CLOCK_MONOTONIC)
    super
  ensure
    elapsed = Process.clock_gettime(Process::CLOCK_MONOTONIC) - started
    Metrics.timing("payment.charge", elapsed)
  end
end

Payment.prepend(ChargeTiming)
```

Before `prepend` existed (Ruby 2.0), the community used `alias_method_chain`: rename the
original method out of the way, define a new one, and call the renamed version. It worked
until two libraries did it to the same method, at which point the aliases formed a chain
whose order depended on load order and whose stack traces were unreadable. Rails
deprecated `alias_method_chain` precisely because `prepend` solves the same problem
without rewriting anyone's method table.

This is a good example of a language feature that exists because of a specific, painful
historical workaround. Knowing the workaround is what makes the feature feel obviously
right rather than arbitrary.
:::

:::debugging
When a method is not the one you expected, stop reading files and ask Ruby directly.

```ruby runnable
module Helper
  def describe
    "helper"
  end
end

class Widget
  include Helper
end

w = Widget.new

# 1. Which definition will actually run, and where does it live?
m = w.method(:describe)
puts m.owner.inspect          # Helper — the module, not Widget
puts m.source_location.inspect # ["file.rb", 3] in a real file

# 2. What is the full chain, in resolution order?
p Widget.ancestors

# 3. Does it respond at all, including private methods?
puts w.respond_to?(:describe)                 # true
puts w.respond_to?(:secret, true)             # include private methods

# 4. Where did a surprising method come from?
p Widget.instance_methods(false)              # defined directly on Widget only
```

`method(:name).owner` and `.source_location` together answer "which code is actually
running" in one step. They work on anything, including methods a gem defined. Reach for
them before you reach for grep.
:::

:::internals
Each class and module holds a method table — a hash from method name to the compiled
instruction sequence. Walking the ancestor chain on every call would be slow, so the VM
keeps two caches:

- A **global method cache** keyed by (class, method name).
- **Inline caches** at each call site, remembering the class seen last time and the
  method it resolved to. If the next call has the same receiver class, the cached entry
  is used with no lookup at all.

This is why defining methods at runtime is cheap but *redefining* them is not: any change
to a method table bumps a global version counter, invalidating inline caches that depended
on it. Code that calls `define_method` inside a request handler will quietly defeat the
VM's caching for everything.
:::

:::performance
A deep ancestor chain costs almost nothing on the happy path, because of inline caching.
What does cost is **`method_missing`**: a failed lookup walks the entire chain, then walks
it *again* looking for `method_missing`. Dynamic proxies built on `method_missing` are
therefore much slower than ones built with `define_method`, and are a known hotspot in
code that uses `OpenStruct` heavily.

If you implement `method_missing`, always implement `respond_to_missing?` alongside it —
otherwise `respond_to?` lies about your object, and anything doing duck-type checks
(including `Array#flatten` and serialisation libraries) will make the wrong decision.
:::

:::tradeoffs
**What linearisation buys.** No ambiguity, ever. One printable chain. `super` has a single
simple meaning. Mixins compose without a resolution algorithm you have to study.

**What it costs.** Order is significant and invisible at the call site. Two gems that both
`include` a module defining `cache_key` will silently resolve to whichever was included
last, and nothing warns you. The fix is discipline — namespace your module methods, prefer
`prepend` with `super` over outright redefinition — not a language guarantee.
:::

:::checkpoint
Given this code, what does `Foo.new.hello` print, and what is `Foo.ancestors`?

```ruby
module A
  def hello
    "A:" + super
  end
end

module B
  def hello
    "B:" + super
  end
end

class Base
  def hello
    "base"
  end
end

class Foo < Base
  prepend A
  include B
end
```

Work it out from the chain before running it. The answer depends on exactly one rule you
have already read.
:::

:::interview
A strong answer to "how does Ruby find a method" does three things:

1. **Names the chain in order**, including the singleton class and the prepend slot — not
   just "it checks the class then the superclass".
2. **Explains `super` as resumption**, not as parent delegation. This immediately
   separates people who have internalised the model from people who have memorised the
   keyword.
3. **Mentions the `method_missing` second pass.** Most candidates stop at `NoMethodError`
   without knowing that Ruby does a second full walk first.

If you can then say *"and I'd debug it with `method(:foo).owner` and `.source_location`"*,
you have signalled that you have actually done this under pressure.
:::

## What you now know

- Method lookup is a linear walk through `ancestors`, first match wins. You can print the
  chain whenever you are unsure.
- `include` inserts a module *below* the class — it is a fallback. `prepend` inserts it
  *above* — it is a decorator.
- Later `include`s and `prepend`s sit closer to the class than earlier ones.
- `super` resumes the search from the next link, which may be a module rather than a
  superclass.
- A failed lookup walks the chain twice: once for the method, once for `method_missing`.
- `method(:name).owner` and `.source_location` tell you exactly which code will run.
