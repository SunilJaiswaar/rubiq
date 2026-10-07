---
title: Everything is an object
summary: Why Ruby has no primitives, what that buys you, and the one place the rule genuinely bends.
level: beginner
minutes: 14
version: "3.3"
status: stable
last_reviewed: "2026-09-20"
tags: [ruby, objects, oop, fundamentals]
concepts: [objects, message-passing, nil]
prerequisites: []
interview:
  - question: In Ruby, what does it mean to say "everything is an object"?
    level: beginner
    hint: Think about what you can do to an integer, and compare it to a language where you cannot.
    answer: >-
      Every value in Ruby — integers, strings, `nil`, `true`, classes themselves — is an
      instance of some class and responds to methods. `5.class` is `Integer`,
      `nil.class` is `NilClass`, `Integer.class` is `Class`. There is no separate
      category of "primitive" values that you call built-in operators on instead of
      methods. Even `5 + 3` is a method call: `5.+(3)`.
    followUps:
      - "If `5 + 3` is a method call, can you define `+` on your own class?"
      - "What is the practical consequence of `nil` being an object rather than a null pointer?"
    realWorld: >-
      It is why `nil.to_a` gives `[]` instead of crashing, and why Rails can add
      `5.days.ago` — `days` is just a method on Integer that a library was free to define.
  - question: Why does Ruby have both `nil?` and `.nil?` working on every object, instead of a null check?
    level: basic
    hint: What would `nil.nil?` have to be if `nil` were not an object?
    answer: >-
      Because `nil` is a real object (the single instance of `NilClass`), asking "are you
      nothing?" can be a message sent to any object. `Object#nil?` returns `false` and
      `NilClass#nil?` returns `true`, so the check is ordinary polymorphism rather than a
      special form in the language. A null pointer could not answer a method call at all.
resources:
  - title: "Ruby documentation — Object"
    url: https://docs.ruby-lang.org/en/master/Object.html
  - title: "Ruby documentation — NilClass"
    url: https://docs.ruby-lang.org/en/master/NilClass.html
---

## Start with the annoyance, not the rule

Here is a line of Java:

```java
int count = 5;
String text = count.toString();   // does not compile
```

`int` is a *primitive*. It is a number the machine understands directly, and it has no
methods, so you cannot ask it to do anything. To call a method you must first wrap it:
`Integer.valueOf(count).toString()`. Java later added autoboxing to hide this, but the
split is still there underneath — primitives and objects are different kinds of thing,
and you have to know which one you are holding.

Most languages have some version of this split. It exists for a good reason: a bare
machine integer is dramatically faster and smaller than a heap-allocated object with a
header and a pointer.

:::problem
Two kinds of value means two sets of rules. A primitive cannot be `null`, cannot go in a
generic collection without wrapping, cannot have a method added to it, and cannot be
subclassed. Every library author has to handle both cases. Every learner has to remember
which is which.
:::

Ruby made the opposite trade. It gave up the guarantee of raw machine representation and
said: there is only one kind of thing.

:::what
In Ruby, every value is an object — an instance of some class that responds to messages.
Integers, strings, `nil`, `true`, ranges, and classes themselves are all objects. There
is no second category.
:::

You can check this yourself, and you should:

```ruby runnable
puts 5.class            # Integer
puts "hi".class         # String
puts nil.class          # NilClass
puts true.class         # TrueClass
puts (1..10).class      # Range
puts Integer.class      # Class
puts Class.class        # Class
```

Read that last pair again. `Integer` is an object whose class is `Class`. And `Class` is
an object whose class is also `Class`. The rule does not stop at some foundation layer
where the "real" machinery lives — it goes all the way down.

:::why
One kind of thing means one set of rules. Once you know that values receive messages,
you know how *all* of Ruby works, including parts you have not met yet. That is why Ruby
feels small to experienced users despite having a large standard library: there is not
much language to learn, only a lot of methods.
:::

## Operators are methods

This is where the idea stops being philosophy and starts paying for itself.

```ruby runnable
puts 5 + 3              # 8
puts 5.+(3)             # 8 — the same thing, spelled explicitly
puts [1, 2] + [3]       # [1, 2, 3] — Array also defines +
puts "ab" * 3           # "ababab" — String defines *
```

`+` is not a built-in operation that the language performs on numbers. It is the name of
a method, and `5 + 3` is sugar for sending the message `+` with the argument `3`. Ruby
only gives you nicer syntax for a set of method names it recognises as operators.

Which means you can define them:

```ruby runnable
class Money
  attr_reader :cents

  def initialize(cents)
    @cents = cents
  end

  # Not an operator overload in the C++ sense — just a method named "+".
  def +(other)
    Money.new(cents + other.cents)
  end

  def to_s
    format("₹%.2f", cents / 100.0)
  end
end

puts Money.new(45_00) + Money.new(5_50)   # ₹50.50
```

:::jargon Message passing
"Sending a message" and "calling a method" describe the same event from two angles.
*Calling a method* emphasises the code that runs. *Sending a message* emphasises that the
caller only names what it wants — `+`, `to_s`, `save` — and the receiver decides what
that means. Ruby's documentation and community lean on the message vocabulary because
the receiver really does get to decide, at runtime, including in ways the caller could
not have known about.
:::

## `nil` is an object, and that is a load-bearing decision

In a language with null pointers, `null` is the absence of an object. Calling a method on
it is an error at the level of the machine — there is nothing there to call.

Ruby's `nil` is not an absence. It is a specific object: the one and only instance of
`NilClass`.

```ruby runnable
puts nil.class          # NilClass
puts nil.to_a.inspect   # []
puts nil.to_s.inspect   # ""
puts nil.to_i           # 0
puts nil.inspect        # nil
puts nil.nil?           # true
puts 5.nil?             # false

# There is exactly one nil. Every nil is the same object.
puts nil.object_id == nil.object_id   # true
```

:::how
Because `nil` responds to methods, "is this missing?" becomes an ordinary polymorphic
call. `Object#nil?` returns `false`; `NilClass` overrides it to return `true`. No special
syntax, no compiler magic — just a method that two classes answer differently.
:::

:::tradeoffs
**What Ruby gains.** Uniform rules. `nil` can be stored, passed, compared and asked
questions like any other object. `nil.to_a` returning `[]` lets you write
`(value || []).each` style code without type checks.

**What Ruby gives up.** Speed and memory. An object header per integer is real cost, and
Ruby works hard to hide it (see below). More importantly, it gives up a *compile-time*
guarantee: `nil` satisfies every variable, so a `nil` that should have been a `User`
travels silently until something asks it for `name`. Languages with non-nullable types
catch that before the program runs. Ruby catches it when the method is called.
:::

:::mistakes
**Thinking `nil` is falsy because it is "empty".** Ruby has exactly two falsy values:
`false` and `nil`. Everything else is truthy — including `0`, `""`, and `[]`.

```ruby runnable
puts "0 is truthy"  if 0
puts "empty string is truthy" if ""
puts "empty array is truthy"  if []
puts "nil is falsy"   unless nil
puts "false is falsy" unless false
```

If you arrive from JavaScript or Python, where `0` and `""` are falsy, this will bite
you. `if user.age` is true for a newborn whose age is `0`.
:::

## Where the rule genuinely bends

A teaching claim that falls apart under inspection is worse than no claim, so: "everything
is an object" is true at the level of *semantics*, not implementation.

:::internals
If every integer were a real heap object, `1_000_000.times { }` would allocate a million
objects and Ruby would be unusably slow. It is not, because of a trick called **immediate
values**.

A Ruby variable holds a machine word called a `VALUE`. For most objects that word is a
pointer to a heap structure. But Ruby steals the low bits as a tag:

```text
 VALUE (64 bits)
 ┌──────────────────────────────────────────────┬───┐
 │ 62 bits of payload                           │ 1 │  → tag 1: a small Integer
 └──────────────────────────────────────────────┴───┘
   value is right here, in the word itself. No heap, no allocation.

 ┌──────────────────────────────────────────────┬───┐
 │ 61 bits of pointer                           │000│  → tag 000: a heap object
 └──────────────────────────────────────────────┴───┘
   value lives elsewhere; follow the pointer.
```

Small integers (`Fixnum` in older Ruby, now just `Integer` under 2^62), `nil`, `true`,
`false` and `Symbol` are stored directly in the word. `5` is not a pointer to an object
containing 5 — it *is* 5, shifted left one bit with a tag.

So when you write `5.class`, the interpreter checks the tag, sees "this is an immediate
integer", and dispatches to `Integer`'s method table without any object existing on the
heap at all.

Two consequences you can observe:

```ruby runnable
# Immediate values have no per-object state to freeze or mutate.
puts 5.frozen?          # true
puts :sym.frozen?       # true
puts nil.frozen?        # true

# And no instance variables can be attached to them.
begin
  5.instance_variable_set(:@x, 1)
rescue => e
  puts "#{e.class}: #{e.message}"
end
```

The object model is a complete fiction, maintained perfectly. You get uniform semantics
*and* you do not pay for a heap allocation per integer. This is the kind of trade that
language implementations exist to make, and it is worth knowing about because it explains
both why `5.frozen?` is `true` and why Ruby integers are faster than you would expect.
:::

:::realworld
This is not trivia — it is the mechanism behind one of Rails' most recognisable features:

```ruby
5.days.ago
2.megabytes
"user".pluralize
```

Rails did not need a preprocessor or a special syntax to add these. `days` is a method
Rails defined on `Integer`, and `pluralize` is one it defined on `String`. Because
integers are objects with an open class, a library can extend them.

The same capability is also a well-known hazard. Two libraries that both add `Integer#to_duration`
with different behaviour will silently fight, and the winner depends on load order. The
Ruby community's answer is refinements and careful namespacing; the lesson is that "you
can extend any class" and "you should extend any class" are different claims.
:::

:::performance
Being able to send a message to anything means Ruby cannot resolve most calls until
runtime. `a + b` requires looking up `+` on whatever `a` turns out to be. Modern Ruby
makes this cheap with inline caches — remembering the answer at each call site and
reusing it while the receiver's class stays the same — but it is still work a statically
typed compiler does not have to do.

The practical rule: method calls in Ruby are cheap but not free, and the tightest loops
are where that shows. Reach for a different structure before you reach for micro-tuning.
:::

:::checkpoint
Without running it, say what each line prints and, more importantly, why:

```ruby
puts 0 ? "yes" : "no"
puts nil.to_a.inspect
puts 5.respond_to?(:+)
puts nil.respond_to?(:upcase)
```

Then run it. If any answer surprised you, the surprise is the useful part — which rule
did you expect to apply?
:::

:::interview
A frequent follow-up is: *"If everything is an object, isn't Ruby slow?"*

A weak answer says "yes, Ruby is slow". A strong answer separates semantics from
implementation: the object model is uniform at the language level, but the interpreter
uses immediate values so that integers, symbols, `nil` and booleans never touch the heap,
and inline caches so that repeated method lookups at the same call site are near-free.
The remaining cost is dynamic dispatch, which is real but usually dwarfed by I/O in the
kind of application Ruby is used for.

That answer shows you know the difference between what a language promises and what its
runtime does — which is most of what this question is testing.
:::

## What you now know

- Every Ruby value is an object that responds to messages. There are no primitives.
- Operators are method names with friendlier syntax, so you can define them yourself.
- `nil` is a real object, which makes null checks ordinary polymorphism and makes `nil`
  propagate quietly instead of crashing at the boundary.
- Only `false` and `nil` are falsy. `0`, `""` and `[]` are all true.
- The uniformity is semantic. Underneath, immediate values keep small integers, symbols,
  `nil` and booleans off the heap entirely.

Next: if methods are messages that a receiver interprets, how does Ruby decide *which*
method actually runs?
