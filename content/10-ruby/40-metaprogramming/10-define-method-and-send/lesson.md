---
title: define_method, send and instance_variable_get
summary: How attr_accessor is written, why define_method beats a heredoc of eval, and the security rule that makes send dangerous.
level: advanced
minutes: 18
version: "3.4"
status: stable
last_reviewed: "2026-10-07"
tags: [ruby, metaprogramming, define-method, send, reflection]
concepts: [metaprogramming, reflection, closures, dynamic-dispatch]
prerequisites: [method-lookup, blocks, procs]
interview:
  - question: How would you implement attr_accessor yourself?
    level: advanced
    answer: >-
      As a class method that calls `define_method` once per name, closing over the name to
      build the getter and setter. `def self.my_accessor(*names); names.each { |n|
      define_method(n) { instance_variable_get("@#{n}") }; define_method("#{n}=") { |v|
      instance_variable_set("@#{n}", v) } }; end`. The important detail is that
      `define_method` takes a block, and the block is a closure — so it captures `n` from the
      enclosing scope. A `def` inside the loop could not, because `def` opens a new scope that
      sees nothing from outside it.
    followUps:
      - "Why not build the method with a string and eval?"
  - question: What is the difference between send and public_send?
    level: advanced
    answer: >-
      `send` can call private and protected methods; `public_send` respects visibility. That
      makes `public_send` the right default, and it matters most when the method name comes
      from input — `send(params[:action])` lets a caller invoke any method on the object,
      including `instance_variable_set`, `eval`, `exit` or `system`. The rule is: never pass
      user input to send without validating it against an explicit allow list, and prefer
      `public_send` so at least private methods are out of reach.
    followUps:
      - "Show me the allow list version."
  - question: When is metaprogramming the wrong tool?
    level: advanced
    answer: >-
      When the number of methods is small and known. Three `define_method` calls in a loop
      replace three readable `def`s with something that does not appear in grep, does not
      show up in editor autocomplete, and produces a backtrace pointing at the
      metaprogramming rather than the behaviour. The rule I use is that dynamic definition
      earns its place when the set of names comes from data — a schema, a config file, a list
      of states — and not when it merely saves typing.
    followUps:
      - "How do you make dynamically defined methods discoverable?"
resources:
  - title: "Ruby docs — Module#define_method"
    url: https://docs.ruby-lang.org/en/master/Module.html#method-i-define_method
---

## Writing attr_accessor

```ruby
class Module
  def my_accessor(*names)
    names.each do |name|
      define_method(name) { instance_variable_get("@#{name}") }
      define_method("#{name}=") { |value| instance_variable_set("@#{name}", value) }
    end
  end
end

class User
  my_accessor :name, :email
end

u = User.new
u.name = "Asha"
u.name            # "Asha"
User.instance_methods(false).sort   # [:email, :email=, :name, :name=]
```

That is roughly what `attr_accessor` does — in C, and without the string interpolation. The
point is that it is not a language keyword. It is a method that defines methods, and you can
write your own.

:::what
**Metaprogramming** is code that operates on the program itself — defining methods at
runtime, calling methods by name, reading and writing instance variables from outside the
object. The core tools are `define_method`, `send`/`public_send`,
`instance_variable_get`/`set`, and the reflection methods (`methods`, `instance_variables`,
`respond_to?`).
:::

:::why
The honest reason is repetition that varies by data.

If you have a state machine with twelve states, writing `def pending?; status ==
"pending"; end` twelve times means twelve chances to typo a string, and adding a state means
remembering to add a method. The list of states is data; the methods are a mechanical
function of that data. Writing them by hand is doing by hand what a loop does reliably.

This is what makes Rails possible. `has_many :orders` defines `orders`, `orders=`,
`order_ids`, `order_ids=` and more — you could not write those by hand for every association
in an application, and more importantly they would drift from the schema. `belongs_to`
generating methods from a declaration is the same move as `attr_accessor`, one level up.

The cost is equally real and is the reason this lesson spends as much time on when not to.
A dynamically defined method does not appear in grep, which is how people actually navigate
code. That is a serious loss, and it is only worth paying when the alternative is worse.
:::

:::how
```text
  define_method VS def

    def creates a new scope. The block passed to define_method
    does not — it is a closure over where it was written.

    names.each do |name|
      def get_#{name}        # ← impossible: def takes a literal name
      end
    end

    names.each do |name|
      define_method(name) { @data[name] }   # ← `name` is captured
    end

    This is the whole reason define_method exists. You cannot
    parameterise `def`.


  THE THREE WAYS TO CALL A METHOD BY NAME

    obj.send(:name)          — ignores visibility (private too)
    obj.public_send(:name)   — respects visibility
    obj.method(:name).call   — gets a Method object first; useful when
                               you want to check arity or pass it on

  THE THREE WAYS TO DEFINE ONE DYNAMICALLY

    define_method(:x) { ... }        — a closure. Fast, debuggable.
    class_eval "def x; ...; end"     — a string. Compiled once; can
                                       define anything including
                                       keyword args; no closure.
    instance_eval / singleton_class  — defines on ONE object only.

  Prefer the first. Reach for the second only when you need syntax a
  block cannot express, and pass __FILE__ and __LINE__ so backtraces
  point somewhere useful.
```
:::

:::example
```ruby
# The case that earns it: methods generated from data.
class Order
  STATES = %w[pending paid shipped refunded].freeze

  attr_reader :status

  def initialize(status) = @status = status

  STATES.each do |state|
    # pending? paid? shipped? refunded?
    define_method("#{state}?") { status == state }

    # pending! paid! shipped! refunded!
    define_method("#{state}!") { @status = state }
  end
end

o = Order.new("pending")
o.pending?    # true
o.paid!
o.paid?       # true

# Adding a state to STATES adds four methods. Nothing can drift.
```

```ruby
# Making them discoverable, which is the duty that comes with this.
class Order
  # 1. Document the generated names.
  #    Generated per state in STATES: pending?, pending!, paid?, paid! ...

  # 2. Let reflection find them.
  Order.instance_methods(false).grep(/\?$/)   # [:pending?, :paid?, ...]

  # 3. In a gem, ship an .rbs or a YARD @!method directive so editors
  #    can autocomplete them.
end
```
:::

:::failure
**`send` with user input is remote code execution.**

```ruby
# A "flexible" controller action.
def show
  @value = @user.send(params[:field])
end

# params[:field] = "email"             → fine
# params[:field] = "password_digest"   → leaks the hash
# params[:field] = "destroy"           → deletes the user
# params[:field] = "instance_variable_get" with an argument → anything
```

```ruby
# The fix is an allow list, and nothing else is a fix.
FIELDS = %w[name email city].freeze

def show
  field = params[:field]
  raise ArgumentError unless FIELDS.include?(field)
  @value = @user.public_send(field)
end
# public_send so private methods are out of reach even if the
# allow list is later edited carelessly.
```

Note that validating with a regex is not an allow list. `/\A\w+\z/` admits `destroy`,
`delete`, `exit` and `eval`.

**`define_method` in a loop with `def` inside it.**

```ruby
class Broken
  %w[a b].each do |name|
    def value   # defines ONE method called `value`, twice
      name      # NameError: undefined local variable `name`
    end
  end
end
# `def` opens a fresh scope. It cannot see `name`. Only the block
# form closes over it.
```

**Defining methods from untrusted strings.**

```ruby
class_eval "def #{params[:name]}; 1; end"
# params[:name] = "x; end; system('rm -rf /'); def y"
# You have handed over a Ruby evaluator.
```

`define_method(params[:name].to_sym)` is safe from *code injection* — the name is data, not
code — but still lets a caller shadow an existing method, so it needs the same allow list.

**Backtraces that point nowhere.**

```ruby
class_eval "def total; items.sum(&:price); end"
# NoMethodError ... from (eval):1:in `total'
# "(eval):1" is the entire location information you get.

class_eval "def total; items.sum(&:price); end", __FILE__, __LINE__
# app/models/order.rb:14:in `total'
```

**`instance_variable_set` from outside the object** bypasses every validation and setter the
class has. It is occasionally right in a test factory and nearly always wrong in application
code — it is the reflection equivalent of reaching into another object's private state,
because that is exactly what it is.
:::

:::internals
```text
  WHY define_method IS FASTER THAN method_missing

  define_method installs a real method in the method table. Calls go
  through normal dispatch and participate in Ruby's inline method
  cache, so a repeated call site resolves once.

  method_missing runs AFTER the full ancestor-chain lookup has failed.
  Every single call pays the failed lookup, then the dispatch to
  method_missing, then whatever that does.

      obj.pending?  with define_method
        → method cache hit → call. One dispatch.

      obj.pending?  with method_missing
        → walk singleton class, class, each module, superclass...
        → not found anywhere
        → walk again looking for method_missing
        → call method_missing
        → string-match the name
        → finally do the work

  Rule of thumb: define methods eagerly when you know the names;
  use method_missing only when you genuinely cannot know them, and
  then define the method on first use so only the first call is slow.


  CLOSURE COST

  define_method's block captures its enclosing scope and keeps it
  alive for the life of the class. Capturing a large local by accident
  means it is never collected:

    huge = File.read("big.csv")          # 200 MB
    define_method(:x) { huge.length }    # 200 MB retained forever

  Capture the small thing you need, not the scope that contains it.
```
:::

:::realworld
```ruby
# 1. A delegator — roughly what Forwardable does.
class Order
  def self.delegate(*methods, to:)
    methods.each do |m|
      define_method(m) { |*args, **kwargs, &blk|
        public_send(to).public_send(m, *args, **kwargs, &blk)
      }
    end
  end

  delegate :name, :email, to: :customer

  def customer = @customer
end
# `*args, **kwargs, &blk` is the forwarding signature. Ruby 3 also
# allows `(...)` for exactly this:  define_method(m) { |...| }  is not
# valid, but `def m(...) = target.m(...)` is — worth knowing when a
# plain def will do.

# 2. Reflection for a real purpose: serialising whatever is there.
class Model
  def to_h
    instance_variables.to_h { |iv| [iv.to_s.delete("@").to_sym, instance_variable_get(iv)] }
  end
end

# 3. Instrumenting an existing method without touching it — a module
#    prepended, which is the clean way. The alias_method chain people
#    used before `prepend` existed breaks when applied twice.
module Timing
  def self.for(klass, method)
    mod = Module.new do
      define_method(method) do |*args, **kw, &blk|
        t = Process.clock_gettime(Process::CLOCK_MONOTONIC)
        super(*args, **kw, &blk)
      ensure
        Rails.logger.info("#{klass}##{method} #{((Process.clock_gettime(Process::CLOCK_MONOTONIC) - t) * 1000).round(1)}ms")
      end
    end
    klass.prepend(mod)
  end
end

Timing.for(Order, :total)
# `prepend` puts the module BEFORE the class in the ancestor chain,
# so `super` reaches the original. Applying it twice nests cleanly
# instead of creating an infinite alias loop.
```

```ruby
# 4. What this looks like in Rails, so the magic is less magic.
#    `store_accessor` generates typed readers over a jsonb column:
class User < ApplicationRecord
  store_accessor :settings, :theme, :timezone
end
# defines theme, theme=, timezone, timezone= — reading from and
# writing to the `settings` hash. Exactly the my_accessor pattern,
# with a different backing store.
```
:::

:::mistakes
**Using metaprogramming to save three `def`s.** If the names are known and few, write them.
Grep is how people read code.

**`send` instead of `public_send`.** Default to the one that respects visibility.

**`send` with unvalidated input.** An allow list or nothing. A regex is not an allow list.

**Building methods from strings when a block would do.** You lose closures, gain an injection
surface, and get `(eval):1` in backtraces.

**Forgetting `__FILE__, __LINE__`** on the `class_eval` calls where a string is genuinely
required.

**Defining methods inside `initialize`.** That defines them on the class on every
instantiation, or on a singleton class per object — which creates a new class per object,
defeats the method cache and leaks memory.

**Capturing a large object in a `define_method` block.** The closure lives as long as the
class.

**Not documenting generated methods.** A method nobody can find is a method nobody can
maintain. Document the pattern and the source list.
:::

:::tradeoffs
**Plain `def`** — greppable, autocompletes, appears in backtraces correctly, and repeats
itself. Correct for a small fixed set.

**`define_method`** — one definition for N methods that cannot drift from their source data,
real methods in the method table with full dispatch speed. Costs discoverability, which you
partly buy back with documentation and `.rbs` signatures.

**`class_eval` with a string** — can express any syntax including keyword arguments and
blocks; no closure; an injection surface if any part is interpolated from input; needs
`__FILE__`/`__LINE__` for sane backtraces.

**`method_missing`** — handles names you genuinely cannot enumerate, at the cost of a failed
lookup on every call and invisibility to `respond_to?` unless you also implement
`respond_to_missing?`. The next lesson is about doing it properly.

**Reflection (`instance_variable_get`)** — lets you write generic serialisers and test
helpers, and lets you bypass every guarantee the class makes. Use it on your own objects, from
the outside almost never.

The test I would apply: **does the list of names come from data?** If yes — a schema, a state
list, a config file — generate them, because hand-written versions will drift. If no,
`define_method` is just a less readable `def`.
:::

:::checkpoint
1. Why can you not use `def` inside `names.each do |name|` to define a method per name?
2. `send` versus `public_send` — which would you default to, and why does it matter for
   `params[:field]`?
3. Why is `/\A\w+\z/` not an adequate validation before `send`?
4. Why does `define_method` dispatch faster than `method_missing`?
5. What does `class_eval "...", __FILE__, __LINE__` fix?
6. `huge = File.read("big.csv"); define_method(:x) { huge.length }` — what is the problem?
:::

:::interview
Lead with `attr_accessor`, because being able to write it shows you understand that it is not
syntax:

*"`attr_accessor` is a method on `Module` that calls `define_method` once per name. The
important part is that `define_method` takes a block, and a block is a closure, so it captures
the name from the enclosing scope. A `def` inside the loop cannot — `def` opens a fresh scope
that sees nothing outside it. That is the entire reason `define_method` exists: you cannot
parameterise `def`."*

Then the security point, phrased as a rule rather than a worry:

*"`send` ignores visibility, so `send(params[:field])` is remote code execution — `destroy`,
`exit`, `instance_variable_set` are all reachable. I default to `public_send` and validate the
name against an explicit allow list. A regex is not an allow list; `/\A\w+\z/` admits
`destroy`."*

Then show restraint, which is what senior interviewers are actually probing for:

*"The test I apply is whether the list of names comes from data. A state machine with twelve
states, or accessors derived from a schema — generate those, because hand-written versions
drift. Three methods I happen to be bored of typing — write them, because a dynamically defined
method does not show up in grep, and grep is how people read code."*
:::

## What you now know

- `attr_accessor` is an ordinary method calling `define_method`; nothing about it is syntax.
- `def` cannot be parameterised because it opens a new scope. `define_method`'s block closes
  over the enclosing one.
- `send` ignores visibility; `public_send` respects it. Default to `public_send`.
- Never pass unvalidated input to `send`. Use an explicit allow list, not a regex.
- `define_method` installs a real method and benefits from the method cache;
  `method_missing` pays a failed lookup on every call.
- Interpolating input into `class_eval` is code injection; `define_method` with a dynamic name
  is not, but can still shadow methods.
- Pass `__FILE__, __LINE__` to `class_eval` or backtraces say `(eval):1`.
- A `define_method` closure retains whatever it captures for the life of the class.
- `prepend` a module to wrap a method, so `super` reaches the original and double application
  is safe.
- Generate methods when the names come from data; otherwise write them, because grep matters.
