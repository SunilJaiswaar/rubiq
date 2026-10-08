---
title: Names and values
summary: A variable is not a box. Getting that one idea right prevents a whole category of bug.
level: beginner
minutes: 12
status: stable
last_reviewed: "2026-10-07"
tags: [fundamentals, variables, assignment]
concepts: [variables, assignment, mutability]
prerequisites: []
interview:
  - question: What is the difference between a variable and a value?
    level: beginner
    hint: How many names can point at the same thing?
    answer: >-
      A value is a thing that exists — the number 5, a particular list, an object. A
      variable is a *name* that currently refers to a value. The distinction matters
      because several names can refer to the same value, so changing that value through
      one name is visible through all of them. Reassigning a name, by contrast, only
      changes where that one name points and leaves every other name alone.
    followUps:
      - "So what does `b = a` copy — the value, or the reference to it?"
      - "Why does that distinction not matter for numbers?"
resources:
  - title: "MDN — Assignment operators"
    url: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/Assignment
---

## The box model, and why it misleads you

Almost every tutorial begins like this: *"a variable is a box that holds a value."*

It is a useful lie for about a week. Then you hit this:

```ruby runnable
a = [1, 2, 3]
b = a

b << 4

p a    # what do you expect?
p b
```

If variables were boxes, `b = a` would have copied the contents into a second box, and
pushing into `b` would leave `a` alone. Run it. Both show `[1, 2, 3, 4]`.

:::problem
The box model predicts the wrong answer, so it has to go. And it has to go *early*,
because the bug it causes — changing data through one name and being surprised when
another name sees it — is one of the most common sources of confusion in every language
that has ever existed.
:::

:::what
A **value** is a thing: the number 5, a particular list, a specific object.

A **variable** is a **name** that currently refers to a value. Assignment binds a name to
a value. It does not copy the value into anything.
:::

:::how
A better picture is labels and things.

```text
  a = [1, 2, 3]

      a ──────▶ ┌─────────────┐
                │ [1, 2, 3]   │   the array — one thing, somewhere in memory
                └─────────────┘

  b = a              b is a second LABEL on the SAME thing

      a ──────▶ ┌─────────────┐
                │ [1, 2, 3]   │
      b ──────▶ └─────────────┘

  b << 4             follows the label, changes the thing

      a ──────▶ ┌─────────────┐
                │ [1,2,3,4]   │   both labels see it, because there is one thing
      b ──────▶ └─────────────┘
```

Now contrast that with reassignment:

```ruby runnable
a = [1, 2, 3]
b = a

b = [9, 9]        # NOT b << — this moves the label b to a different thing

p a    # [1, 2, 3] — untouched
p b    # [9, 9]
```

If you want to see the difference rather than infer it, ask the objects who they are:

```ruby runnable
a = [1, 2, 3]
b = a
puts "same object? #{a.equal?(b)}"      # true — one array, two names

b = [9, 9]
puts "same object? #{a.equal?(b)}"      # false — b now names something else
```

`equal?` is the identity question in Ruby, and it is the only one of the three comparison
methods you cannot redefine to lie. `==` asks "do these have the same value", and any class may
answer that however it likes. `equal?` asks "are these the same object", and the answer comes
from the runtime.

```text
  b = [9, 9]         moves the LABEL, leaves the old thing alone

      a ──────▶ ┌─────────────┐
                │ [1, 2, 3]   │
                └─────────────┘
      b ──────▶ ┌─────────────┐
                │ [9, 9]      │
                └─────────────┘
```
:::

:::why
Two names for one value is not a flaw — it is how you pass data around without copying it.
A function that receives a million-element list receives a reference, not a million
copies. That is the difference between a program that runs and one that exhausts memory.

The cost is that you must know, at every point, whether you are *changing a thing* or
*moving a label*. Those are different operations that look similar.
:::

## Mutating versus reassigning

This is the whole lesson in one table. Learn to classify any line of code into one of
these two columns.

| Operation | What it does | Visible through other names? |
|---|---|---|
| `b = [9]` | Moves the label `b` | No |
| `b.push(4)` | Changes the thing | **Yes** |
| `b.name = "x"` | Changes the thing | **Yes** |
| `b = b.concat([4])` | Builds a new thing, moves the label | No |
| `b.sort()` | Changes the thing (in place) | **Yes** |
| `[...b].sort()` | Copies, then changes the copy | No |

```ruby runnable
original = [3, 1, 2]

sorted_copy = original.sort
p sorted_copy              # [1, 2, 3]
p original                 # [3, 1, 2] — untouched

original.sort!
p original                 # [1, 2, 3] — changed
```

Ruby gives you a naming convention for exactly this distinction, and it is one of the language's
genuinely kind design choices: a method ending in `!` is the dangerous one. `sort` returns a new
array, `sort!` rearranges the one you gave it. Same for `map`/`map!`, `reject`/`reject!`,
`gsub`/`gsub!`, `uniq`/`uniq!`, `flatten`/`flatten!`.

Treat the convention as a hint, not a guarantee, because plenty of mutating methods have no bang:

```ruby runnable
list = [1, 2]
list.push(3)      # mutates
list << 4         # mutates
list.delete(1)    # mutates
list.clear        # mutates
p list

# The real rule: `!` means "there is a non-mutating sibling, and this is not it".
# A method with no safe counterpart does not need the warning label.
```

:::mistakes
**The function that quietly edits your data.**

```ruby runnable
def add_tax(prices)
  prices.each_with_index do |price, i|
    prices[i] = price * 1.2        # changes the CALLER's array
  end
end

my_prices = [100, 200]
with_tax = add_tax(my_prices)

p with_tax
p my_prices    # also changed — the original is gone
```

The caller has lost their original data and nothing told them. Write it so it cannot
happen:

```ruby runnable
def add_tax(prices)
  prices.map { |price| price * 1.2 }   # builds a new array; caller's is untouched
end

my_prices = [100, 200]
p add_tax(my_prices)
p my_prices    # safe
```

This is the habit worth forming early, because it is most of what "functional style" means in
day-to-day Ruby: reach for `map`, `select`, `reject` and `each_with_object`, which return new
collections, before reaching for `each` with an index and an assignment. The second version is
also shorter, which is usually how Ruby tells you it is the one the language wanted.

**A function that returns a value and also changes its argument is doing two things.**
Pick one. Returning a new value is almost always the one to pick.

**`const` does not mean immutable.**

Ruby has no `const`, and this is a place where it is noticeably weaker than JavaScript. A
constant is just a name starting with a capital letter, and it protects almost nothing:

```ruby runnable
LIST = [1, 2]
LIST << 3          # allowed — the thing changed, the name did not move
p LIST

LIST = [9]         # also allowed! Only a warning, on stderr:
                   #   warning: already initialized constant LIST
                   #   warning: previous definition of LIST was here
p LIST
```

Both of those succeed. The reassignment prints a warning and carries on, so a typo that
shadows a constant is a message in a log rather than a stopped program. What `freeze` gives you
is the other half — protection of the *value*, which is the half that actually matters:

```ruby runnable
SETTINGS = { retries: 3 }.freeze

begin
  SETTINGS[:retries] = 99
rescue FrozenError => e
  puts "#{e.class}: #{e.message}"
end

p SETTINGS
```

So the Ruby idiom for a real constant is `NAME = value.freeze`, and the reason you see `.freeze`
scattered through well-kept Ruby is this: the capital letter documents intent, and `freeze`
enforces it.

`const` freezes the *label*, not the *thing*. This confuses people in every language that
has a similar keyword — Java's `final`, C++'s `const` on a pointer. Same distinction,
every time.
:::

:::realworld
How languages differ — and notice that they are all solving the same problem:

| Language | Position |
|---|---|
| JavaScript, Python, Ruby, Java | Names refer to objects. Numbers and strings are immutable, so the distinction is invisible for them and very visible for lists and objects. |
| C, C++ | Explicit. You choose a value (`int x`), a pointer (`int *x`) or a reference (`int &x`), and the syntax tells the reader which. |
| Rust | The compiler tracks who owns a value and refuses to compile a program where two names could mutate it at once. The bug above is a compile error. |
| Clojure, Elixir | Data is immutable by default. `b.push(4)` is not possible; you get a new collection. The bug cannot be written. |

Rust and Clojure are both responses to exactly the confusion in this lesson. Knowing the
problem is what makes their design look obvious rather than restrictive.
:::

:::debugging
When data changed and you do not know who changed it:

1. **Find every name bound to that value.** Search for the assignments, not the mutations.
2. **Suspect the functions you passed it to.** A function that takes a collection and
   returns nothing is the prime suspect.
3. **Freeze it and see who complains.** `obj.freeze`, then run. `FrozenError` names the file
   and line of the write, which is faster than reading every call site. Remember it is shallow,
   so freeze the nested parts too if the mutation is deeper down.
4. **Ask the object its identity.** `obj.object_id` and `a.equal?(b)` settle "is this the same
   array or an equal one", which is usually the question you are actually stuck on.

```ruby runnable
CONFIG = { retries: 3, timeout: { read: 5000 } }.freeze

def misbehave(c)
  c[:retries] = 99
end

begin
  misbehave(CONFIG)
rescue FrozenError => e
  puts "caught: #{e.message}"
end
p CONFIG

# But freeze is SHALLOW, and this is the part that catches people:
CONFIG[:timeout][:read] = 1
p CONFIG      # the nested hash changed, with no error at all
```

`freeze` protects one object, not a tree. The outer Hash refused the write; the inner Hash was
never frozen and accepted it silently. Freezing a structure for real means walking it:

```ruby runnable
def deep_freeze(obj)
  case obj
  when Hash  then obj.each { |k, v| deep_freeze(k); deep_freeze(v) }
  when Array then obj.each { |v| deep_freeze(v) }
  end
  obj.freeze
end

settings = deep_freeze({ timeout: { read: 5000 } })
begin
  settings[:timeout][:read] = 1
rescue FrozenError => e
  puts "now caught: #{e.message}"
end
```

In Rails, `config` objects and `ActiveSupport::OrderedOptions` are not deep-frozen either, which
is why a before_action that mutates something out of `Rails.application.config` can poison every
later request in that process. The freeze you want is at the boundary where the shared object is
created, not where it is read.
:::

:::tradeoffs
**Sharing a reference** is fast and memory-cheap, and it makes action-at-a-distance
possible — a change here shows up there.

**Copying** is safe and local, and it costs time and memory proportional to the data. For
a three-element array that is free; for a million rows inside a loop it is the
bottleneck.

The working rule most codebases converge on: **copy at boundaries, share inside them.**
A function that is part of your public interface should not mutate what it was given. The
private helper five lines later can, because its caller is you and you can see both ends.
:::

:::checkpoint
Predict each, then run it:

```ruby
# 1
x = 5; y = x; y = 6
p x

# 2
a = { n: 1 }; b = a; b[:n] = 2
p a[:n]

# 3
arr = [1]; other = arr; other = other + [2]
p arr

# 4
def touch(hash) = hash[:touched] = true
h = {}; touch(h)
p h

# 5 — the one that is specific to Ruby
s = "abc"; t = s; t << "d"
p s
```

For each one, say *before* running it whether the line moves a label or changes a thing.
That is the only question.
:::

:::interview
This is asked at every level, usually disguised. "What does this print?" with two names on
one array is the beginner version. "Why is this function not thread-safe?" is the senior
version, and it is the same idea.

A strong answer uses the right vocabulary unprompted: *"`b = a` binds a second name to
the same object, so mutating through `b` is observable through `a`. Reassigning `b` only
rebinds that name."* Then the practical rule: *"so I avoid functions that mutate their
arguments, and when I need a copy I take one explicitly — and I know a shallow copy only
protects the top level."*
:::

## What you now know

- A variable is a name bound to a value, not a box containing one.
- Assignment rebinds a name. It never copies the value.
- Several names can refer to one value, so mutating through one is visible through all.
- Mutating a thing and moving a label look similar and are completely different.
- `const` freezes the binding, not the value.
- Copy at your boundaries; share inside them.
