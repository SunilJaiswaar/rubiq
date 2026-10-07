---
title: method_missing, done properly
summary: The hook of last resort — why respond_to_missing? is not optional, and the pattern that makes only the first call slow.
level: expert
minutes: 16
version: "3.4"
status: stable
last_reviewed: "2026-10-07"
tags: [ruby, metaprogramming, method-missing, ghost-methods]
concepts: [method-missing, respond-to-missing, dynamic-dispatch, proxies]
prerequisites: [method-lookup, metaprogramming]
interview:
  - question: What is method_missing and when does Ruby call it?
    level: advanced
    answer: >-
      It is the hook Ruby calls after the entire method lookup has failed — the singleton
      class, the class, every included module, and every ancestor up to BasicObject. Ruby then
      searches that same chain again for `method_missing`, and the default implementation on
      BasicObject raises NoMethodError. Overriding it lets you respond to method names that do
      not exist as real methods. Two obligations come with it: always call `super` for names
      you do not handle, or you turn typos into silence, and always implement
      `respond_to_missing?`, or the object lies about its own interface.
    followUps:
      - "What exactly breaks if you skip respond_to_missing?"
  - question: Why implement respond_to_missing? rather than overriding respond_to?
    level: advanced
    answer: >-
      Because `respond_to_missing?` is the documented extension point and it fixes more than
      `respond_to?`. Ruby's `respond_to?` consults it automatically, and so does `method(:x)`,
      which means `&:x` symbol-to-proc, `Object#method` and anything using it get the right
      answer too. Overriding `respond_to?` directly fixes only the direct question and leaves
      `method(:x)` raising NameError on a method the object actually handles.
    followUps:
      - "Where does that difference show up in practice?"
  - question: How do you make method_missing fast?
    level: expert
    answer: >-
      Define the real method the first time it is called, then dispatch to it — so only the
      first call pays the failed lookup. `def method_missing(name, *args); if handles?(name);
      self.class.define_method(name) { ... }; send(name, *args); else; super; end; end`. The
      caveat is that defining on `self.class` affects every instance, which is usually what
      you want for schema-derived accessors and wrong for per-object behaviour — there you
      want `singleton_class.define_method`, and that creates a class per object, which costs
      memory and defeats the method cache.
    followUps:
      - "When is the memoisation unsafe?"
resources:
  - title: "Ruby docs — BasicObject#method_missing"
    url: https://docs.ruby-lang.org/en/master/BasicObject.html#method-i-method_missing
---

## The hook of last resort

```ruby
class Settings
  def initialize(data) = @data = data

  def method_missing(name, *args)
    key = name.to_s
    if @data.key?(key)
      @data[key]
    else
      super        # not ours → NoMethodError, with the right message
    end
  end

  def respond_to_missing?(name, include_private = false)
    @data.key?(name.to_s) || super
  end
end

s = Settings.new("theme" => "dark", "timeout" => 5)
s.theme                  # "dark"
s.respond_to?(:theme)    # true
s.method(:theme)         # #<Method: Settings#theme>
s.nonsense               # NoMethodError: undefined method 'nonsense'
```

Both hooks, and the `super` in each. That is the complete, correct shape — everything else in
this lesson is about what happens when you leave a piece out.

:::what
**`method_missing`** is called when method lookup fails completely.
**`respond_to_missing?`** is how you tell the rest of Ruby that a name you handle dynamically
really is part of your interface. Methods that exist only through `method_missing` are
sometimes called **ghost methods**.
:::

:::why
`define_method` covers the case where you know the names. `method_missing` exists for the
case where you cannot.

A proxy wrapping an arbitrary object cannot enumerate its target's methods at definition
time — the target is chosen at runtime. An OpenStruct cannot know its keys before being
given a hash. A SOAP or GraphQL client cannot know the remote schema when the gem is
written. In each case the set of valid names is unknowable until the object exists, and
`method_missing` is the only mechanism that works.

That is a narrow set of cases, and the narrowness is the point. `method_missing` is slower
than a real method, invisible to `respond_to?` unless you do extra work, and turns typos into
whatever your handler decides. When the names *are* knowable — a list of states, a database
schema you can read at boot — define them and get all of that back.
:::

:::how
```text
  WHAT RUBY HAS ALREADY DONE before method_missing runs

    obj.whatever

    1. singleton class of obj         — not found
    2. modules prepended to its class — not found
    3. its class                      — not found
    4. modules included               — not found
    5. superclass, and its modules    — not found
    6. ... up to BasicObject          — not found

    7. start again from step 1, looking for `method_missing`
    8. found one (yours, or BasicObject's)
    9. call it with (:whatever, *args, &block)

    BasicObject#method_missing raises NoMethodError. That is where the
    error you normally see comes from — it is a method call, not a
    language-level failure.

  WHY super MATTERS

    def method_missing(name, *args)
      @data[name.to_s]            # returns nil for ANY name
    end

    obj.theme    → "dark"
    obj.thmee    → nil            ← the typo is now a value
    obj.destroy  → nil            ← silently swallowed

    With `super`, the unhandled name reaches BasicObject's
    implementation and raises NoMethodError, naming the method and
    the receiver. Omitting super means your object absorbs every
    message in the language.
```
:::

:::failure
**Skipping `respond_to_missing?`.** The object works and lies:

```ruby
class Settings
  def method_missing(name, *) = @data[name.to_s] || super
  # no respond_to_missing?
end

s.theme                        # "dark" — works
s.respond_to?(:theme)          # false  — lies
s.method(:theme)               # NameError: undefined method
[s].map(&:theme)               # NoMethodError, in some Ruby versions
Settings.new(...).to_json      # may silently omit it
duck_type_check(s)             # fails, because it asks respond_to?
```

The method works when called directly and is invisible to every piece of code that asks
first — which is most library code, because asking first is how duck typing is done
politely.

**Forgetting `super`, which converts typos into data.**

```ruby
def method_missing(name, *) = @data[name.to_s]

config.timeuot        # nil, not an error
if config.enbaled     # always falsy. The feature is just off, forever.
```

This is the single most expensive mistake in this lesson, because there is no error to
investigate. A misspelled method returns nil and the program continues.

**Catching `nil` instead of distinguishing "absent" from "nil".**

```ruby
def method_missing(name, *)
  @data[name.to_s] || super     # WRONG when the stored value is nil or false
end
# A key that exists with value `false` falls through to super and raises.
# Use key? to decide, and the value only to answer.
def method_missing(name, *args)
  key = name.to_s
  @data.key?(key) ? @data[key] : super
end
```

**Clashing with real methods.** `method_missing` is only consulted when lookup *fails*, so
any name that exists wins:

```ruby
s = Settings.new("class" => "premium", "method" => "card", "hash" => "abc")
s.class     # Settings — the real method, not "premium"
s.method    # ArgumentError — Object#method needs an argument
s.hash      # an Integer
```

This is why `OpenStruct` has sharp edges, and why a proxy that must forward *everything*
inherits from `BasicObject` — which has almost no methods, so almost nothing is shadowed.

**Not handling the block.**

```ruby
def method_missing(name, *args)            # the block is dropped
def method_missing(name, *args, &blk)      # explicit
def method_missing(name, ...)              # Ruby 3: forwards everything
```
:::

:::internals
```text
  THE COST, concretely

  Every call through method_missing pays:

    - a full failed lookup through the ancestor chain
    - a second lookup for method_missing itself
    - the dispatch
    - whatever your handler does (usually a string conversion
      and a hash lookup, both allocating)

  And it pays it EVERY time, because there is nothing to cache:
  the inline method cache caches resolutions, and this one never
  resolves.

  Measured on a simple accessor, method_missing is roughly an order
  of magnitude slower than a defined method. On a cold path that is
  irrelevant. In a loop over a million records it is the loop.

  THE DEFINE-ON-FIRST-CALL PATTERN

    def method_missing(name, *args, &blk)
      key = name.to_s
      return super unless @data.key?(key)

      self.class.define_method(name) { @data[key] }   # once
      send(name, *args, &blk)
    end

  Call 1: failed lookup + define + dispatch.
  Call 2+: a real method, cached, full speed.

  The catch: `self.class.define_method` defines it for EVERY instance
  of the class. Correct when the names come from a shared schema;
  wrong when each object has different keys — and `Settings` above is
  exactly that wrong case, because instance A would gain a method
  reading instance B's keys. There, either accept the cost or use
  `singleton_class.define_method`, which creates a singleton class
  per object: more memory, and it defeats the method cache for that
  object.
```
:::

:::realworld
```ruby
# 1. A transparent proxy. BasicObject, so almost nothing is shadowed.
class Logged < BasicObject
  def initialize(target) = @target = target

  def method_missing(name, *args, **kwargs, &blk)
    ::Kernel.puts "→ #{name}(#{args.map(&:inspect).join(', ')})"
    @target.public_send(name, *args, **kwargs, &blk)
  end

  def respond_to_missing?(name, include_private = false)
    @target.respond_to?(name, include_private)
  end
end

Logged.new([1, 2, 3]).map { |x| x * 2 }
# → map()
# [2, 4, 6]
#
# BasicObject has no `puts`, no `class`, no `inspect` — hence
# ::Kernel.puts, and hence the proxy forwards `class` too, which a
# plain Object-based proxy could not.
```

```ruby
# 2. ActiveRecord's dynamic finders, which is the pattern in the wild.
#    User.find_by_email_and_city(...) was built this way, and was
#    deprecated in favour of find_by(email:, city:) — precisely because
#    ghost methods are hard to discover and the explicit form is not.

# 3. The define-on-first-call version, where it is correct:
#    names derived from the SHARED schema, so defining on the class
#    is right.
class Record
  def initialize(attrs) = @attrs = attrs

  def method_missing(name, *args, &blk)
    key = name.to_s
    return super unless self.class.column_names.include?(key)

    self.class.define_method(name) { @attrs[key] }
    send(name, *args, &blk)
  end

  def respond_to_missing?(name, priv = false)
    self.class.column_names.include?(name.to_s) || super
  end
end
```

```ruby
# 4. Debugging a method_missing-heavy object. The tools that help:
obj.method(:whatever)              # works IF respond_to_missing? is right
obj.singleton_methods              # what was defined per object
obj.class.instance_methods(false)  # what was defined on the class
TracePoint.new(:call) { |tp| p [tp.method_id, tp.path] }.enable
# `method_missing` will show up here, which is often the first clue
# that an "existing" method does not exist.
```
:::

:::mistakes
**No `respond_to_missing?`.** The object lies about its interface and breaks `method(:x)`,
`&:x` in some versions, and every library that checks before calling.

**Overriding `respond_to?` instead.** Fixes less, and `method(:x)` still raises.

**No `super`.** Typos become nil. This is the one that costs days.

**`||` instead of `key?`** to decide whether you handle a name — a stored `false` or `nil`
then raises.

**Using it when the names are knowable.** Read the schema at boot and `define_method`. You
get speed, `respond_to?`, autocomplete and grep.

**Inheriting from `Object` for a transparent proxy.** `class`, `hash`, `to_s`, `send`,
`display`, `method` and about fifty others are already defined, so they never reach your
hook. Use `BasicObject`.

**Dropping the block.** `&blk` or `...`.

**Defining on `self.class` when keys are per-instance.** Instance A gains a method that reads
instance B's data. Subtle, and a real bug.
:::

:::tradeoffs
**`define_method` at load time** — fast, greppable, `respond_to?` works, autocompletes.
Requires knowing the names. Always preferable when possible.

**`method_missing`** — the only option for genuinely unknowable names. Costs a failed lookup
per call, needs two hooks and a `super`, and makes typos your responsibility.

**`method_missing` plus define-on-first-call** — one slow call then full speed, at the cost of
deciding where to define it. On the class when the names are shared; on the singleton class
when they are per-object, which costs memory and the method cache.

**`OpenStruct`** — convenient, notably slow, and it shadows nothing (so `.class` is not your
field). Fine for a test fixture; avoid in hot paths. `Struct` or `Data.define` is nearly always
the better answer.

**A `BasicObject` proxy** — genuinely transparent, and you lose everything Object provides, so
`puts` becomes `::Kernel.puts` and any mistake surfaces as an odd NoMethodError inside your
proxy.

The decision rule: can you enumerate the names at load time? If yes, define them. If no, use
`method_missing` with both hooks, `super`, and a plan for the performance when it stops being
a cold path.
:::

:::checkpoint
1. List the steps Ruby takes before calling `method_missing`.
2. You omit `super`. What does `config.enbaled` return, and why is that worse than an error?
3. You omit `respond_to_missing?`. Name three things that break while direct calls still work.
4. `@data["x"] = false`. Why does `@data[key] || super` break, and what is the fix?
5. Why does a transparent proxy inherit from `BasicObject`?
6. The define-on-first-call pattern defines on `self.class`. When is that wrong?
:::

:::interview
Define it by *where it sits* in dispatch, which shows you understand it is a fallback and not
an interception point:

*"`method_missing` is called after the entire lookup has failed — singleton class, class,
modules, every ancestor up to BasicObject. Ruby then searches that chain again for
`method_missing`, and BasicObject's implementation is what raises NoMethodError. So the error
you normally see is itself a method call."*

Then the two obligations, with consequences rather than rules:

*"Two things are non-negotiable. `super` for names I do not handle, because without it a
misspelled method returns nil and the program carries on — that is the expensive version of
this bug, since there is no error to investigate. And `respond_to_missing?`, because
`respond_to?` and `method(:x)` both consult it; without it the object works when called
directly and is invisible to every library that politely asks first."*

For a senior conversation, add the performance pattern and its catch:

*"It pays a failed lookup on every call and nothing can cache it, so the usual fix is to define
the real method on first use and then dispatch to it — one slow call, then full speed. The catch
is where you define it: on the class if the names come from a shared schema, on the singleton
class if the keys are per-instance, since otherwise one object gains a method that reads
another's data."*

And the framing that matters most: *"I reach for it only when the names are genuinely
unknowable — a proxy over an arbitrary target, a remote schema. If I can enumerate them at boot,
`define_method` gives me speed, `respond_to?` and grep."*
:::

## What you now know

- `method_missing` runs only after the whole ancestor chain has failed, twice over.
- `NoMethodError` comes from `BasicObject#method_missing` — it is a method call.
- Always `super` for names you do not handle, or typos silently become nil.
- Always implement `respond_to_missing?`; `respond_to?` and `method(:x)` both use it.
- Overriding `respond_to?` instead fixes less and leaves `method(:x)` broken.
- Use `key?` rather than `||` to decide, so a stored `false` or `nil` still works.
- Real methods always win, so `class`, `hash` and `method` shadow your ghost methods.
- A transparent proxy inherits from `BasicObject` to minimise what is shadowed.
- Forward the block with `&blk` or `...`.
- Define the method on first call to pay the cost once — on the class for shared names, on
  the singleton class for per-object ones.
- If you can enumerate the names at load time, `define_method` is better on every axis.
