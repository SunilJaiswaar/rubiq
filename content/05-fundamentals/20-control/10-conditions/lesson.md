---
title: Conditions and truthiness
summary: Branching is the easy part. Knowing what counts as true, and what short-circuiting does, is where the bugs are.
level: beginner
minutes: 11
status: stable
last_reviewed: "2026-10-07"
tags: [fundamentals, conditionals, truthiness]
concepts: [conditionals, truthiness, short-circuit]
prerequisites: [types]
interview:
  - question: What does short-circuit evaluation mean, and why does it matter?
    level: beginner
    answer: >-
      In `a && b`, if `a` is falsy the result is already determined, so `b` is never
      evaluated. Same for `a || b` when `a` is truthy. It matters for two reasons: it lets
      you guard an expression that would otherwise throw — `user && user.name` — and it
      means an operand with a side effect may silently not run, which is a real source of
      bugs when people put a function call on the right-hand side.
    followUps:
      - "So what is the difference between `||` and `??`?"
      - "Give me a case where short-circuiting hides a bug rather than preventing one."
resources:
  - title: "MDN — Nullish coalescing operator"
    url: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/Nullish_coalescing
---

## A program that cannot decide anything can only do one thing

```ruby runnable
# Without a conditional, this is all a program can be: a fixed sequence.
puts 'open file'
puts 'read it'
puts 'close it'
# Every input produces identical behaviour. Useless for anything real.
```

:::problem
Real work depends on the data. Is the user logged in? Is the list empty? Did the request
fail? Without a way to ask, a program is a recording rather than a process.
:::

:::what
A **conditional** runs one branch or another depending on whether an expression is true.
**Truthiness** is the language's rule for what counts as true when the expression is not
already a boolean.
:::

:::why
Every language needs the truthiness rule because programmers write `if (list)` rather than
`if (list !== null && list.length > 0)`. The convenience is real. The cost is that the
rule differs per language in exactly the places you are most likely to make a mistake.
:::

## The rule, and why it must be memorised

```ruby runnable
values = [false, nil, 0, 0.0, '', '0', 'false', [], {}, :sym, -1, Float::NAN]

values.each do |v|
  puts format('%-12s → %s', v.inspect, v ? 'truthy' : 'falsy')
end
```

Run it. **Exactly two values are falsy in Ruby: `nil` and `false`.** Everything else is truthy —
zero, the empty string, the empty array, the empty hash, even `NaN`.

This is the single largest simplification Ruby offers over the language this lesson was
originally written in, where eight different values are falsy and `"0"` and `[]` disagree with
each other. There is one rule, it has no exceptions, and you can hold it in your head
permanently:

```text
  falsy:  nil, false
  truthy: literally everything else
```

Which means a whole category of bug simply does not exist here — but it is replaced by a
narrower one, and the rest of this lesson is mostly about that.

JavaScript has exactly **eight** falsy values: `false`, `0`, `-0`, `0n`, `""`, `null`,
`undefined`, `NaN`. Everything else is truthy — including `"0"`, `"false"`, `[]` and `{}`.

:::realworld
This is where languages genuinely disagree, and where moving between them hurts:

| Value | JavaScript | Python | Ruby | PHP |
|---|---|---|---|---|
| `0` | falsy | falsy | **truthy** | falsy |
| `""` | falsy | falsy | **truthy** | falsy |
| `[]` | **truthy** | falsy | **truthy** | falsy |
| `{}` / `{}` | **truthy** | falsy | **truthy** | falsy |
| `"0"` | **truthy** | truthy | **truthy** | **falsy** |

Ruby is the simplest: only `nil` and `false` are falsy, full stop. Python treats "empty" as
false for every container. JavaScript treats emptiness as false for strings but not for
collections — which is the inconsistency that catches people.

So `if (list)` means "the list exists" in JavaScript and "the list has items" in Python.
The same five characters, two different questions.
:::

:::mistakes
**The zero bug.** This is the single most common truthiness error in JavaScript, and it is
always about a legitimately-zero value.

```ruby runnable
def describe(count)
  return 'no data' unless count
  "#{count} items"
end

p describe(5)      # "5 items"
p describe(0)      # "0 items"  — correct, because 0 is truthy in Ruby
p describe(nil)    # "no data"
```

In JavaScript, Python or C, `if (!count)` with a count of zero reports "no data" — the classic
falsy-zero bug. In Ruby the guard means what it says, and `unless count` is a safe way to write
"unless this is missing".

**The Ruby version of the bug is about `false`, not zero.** Since `nil` and `false` are the only
two falsy values, a boolean that is legitimately `false` is indistinguishable from an absent
value:

```ruby runnable
def notify?(settings)
  settings[:email] || true     # "default to notifying"
end

p notify?({ email: true })    # true
p notify?({})                 # true  — a sensible default
p notify?({ email: false })   # true  — WRONG. The user opted out.
```

The user set `email: false`, the `||` saw a falsy value, and the default overrode a deliberate
choice. This is the same shape as the falsy-zero bug, just restricted to booleans — and it is
worse in one way, because the value it silently discards is always a decision someone made on
purpose.

The same bug with a default:

Ruby has no null-coalescing operator — no `??` — so `||` is the only short form and you have to
step up to a method call when `false` or `nil` is meaningful. `Hash#fetch` is that method:

```ruby runnable
settings = { volume: 0, verbose: false, retries: nil }

# `||` is fine for 0 and "" — they are truthy here.
p settings[:volume] || 50          # 0  — correct, unlike in JavaScript

# It is NOT fine for false:
p settings[:verbose] || true       # true  — overrides the deliberate false
p settings.fetch(:verbose, true)   # false — correct

# And `fetch` distinguishes "missing" from "present and nil":
p settings.fetch(:retries, 3)      # nil — the key exists, holding nil
p settings.fetch(:nope, 3)         # 3   — the key is genuinely absent
p settings.key?(:retries)          # true
```

| you want | write |
|---|---|
| a default when the value is `nil` or `false` | `value \|\| default` |
| a default only when the key is **absent** | `hash.fetch(key, default)` |
| a default computed only if needed | `hash.fetch(key) { expensive }` |
| to raise if the key is absent | `hash.fetch(key)` |
| to ask whether it is there at all | `hash.key?(key)` |

`fetch` with no default raising `KeyError` is worth adopting as a habit for required
configuration: a missing key fails at startup with the key's name in the message, rather than
flowing through as `nil` and failing somewhere unrelated.

**`||` defaults on any falsy value. `??` defaults only on `null` and `undefined`.** For
numeric and string settings, `??` is almost always the one you want. This is why `??`
exists at all.

**Empty-array checks.**

```ruby runnable
items = []
puts 'an empty array is truthy, so this runs' if items
puts 'say what you mean' if items.empty?

# The predicates worth knowing, because they say what you mean:
p [].empty?, ''.empty?, {}.empty?       # true, true, true
p 0.zero?, 0.positive?                  # true, false
p nil.nil?, [].nil?                     # true, false
p [].any?, [nil].any?, [nil].size       # false, false, 1  ← careful
```

That last line is the one to look at twice. `any?` with no block does not mean "is it
non-empty" — it means "does it contain any truthy element". `[nil, false].any?` is `false`
even though the array has two elements. If you mean non-empty, write `!empty?` or `size.positive?`.

Rails adds `present?` and `blank?`, which fold emptiness back into truthiness:
`"".blank?`, `[].blank?` and `nil.blank?` are all true, and `"  ".blank?` is true as well. They
are genuinely useful for user input, where a whitespace-only string should count as absent — but
they are Rails, not Ruby, and they treat `false.blank?` as `true`, which is its own trap.

**Chained comparisons that do not mean what they read as.**

```ruby runnable
age = 25

begin
  p 1 < age < 10
rescue NoMethodError => e
  puts "#{e.class}: #{e.message}"
end

p 1 < age && age < 10      # false — explicit, and correct
p age.between?(1, 10)      # false — clearer still
p (1..10).cover?(age)      # false — clearest when the range is the concept
```

JavaScript evaluates `1 < 25 < 10` as `true < 10`, coerces `true` to `1`, and returns `true`.
Ruby parses it the same way and then refuses: `true` has no `<` method, so you get a
`NoMethodError` at the point of the mistake. Same expression, same parse, opposite outcome —
and this is the coercion story from the types lesson showing up in control flow.

`between?` comes from `Comparable`, so it works on anything that defines `<=>`: numbers,
strings, dates, and your own classes. `(1..10).cover?` is the one to prefer when the range is a
meaningful thing in your domain, because you can name it and pass it around.

Python allows `1 < age < 10` and means it. JavaScript, C, Java and most others evaluate
left to right and coerce the intermediate boolean. Write the `&&`.
:::

## Short-circuiting

```ruby runnable
def side_effect(label)
  puts "  evaluated: #{label}"
  true
end

puts 'false && side_effect:'
false && side_effect('right of &&')     # never runs

puts 'true || side_effect:'
true || side_effect('right of ||')      # never runs

puts 'true && side_effect:'
true && side_effect('right of &&')      # runs
```

:::how
The evaluation rule is: stop as soon as the answer is determined.

```text
  a && b     if a is falsy, the result is a. b is never evaluated.
  a || b     if a is truthy, the result is a. b is never evaluated.
  a ?? b     if a is null or undefined, evaluate b. Otherwise a.

  Note the return VALUE is the operand, not a boolean:
```

```ruby runnable
p('' || 'default')        # ""       — the empty string is truthy, so it wins
p('hi' || 'default')      # "hi"     — the value, not `true`
p(0 && 'reached')         # "reached" — 0 is truthy, so && continues
p(nil && 'never')         # nil      — the falsy value, not `false`
p(false || nil)           # nil      — the last value evaluated
```

`&&` and `||` return one of their operands, never a coerced boolean. That is what makes
`name = given || 'anonymous'` work, and it is also why `a || b` is not a safe way to get a
boolean out of two values — use `!!(a || b)` or, better, a predicate method.

**And now the Ruby-specific trap, which has no JavaScript equivalent:** `and`/`or`/`not` are
*also* operators, with different precedence from `&&`/`||`/`!`. They bind looser than assignment:

```ruby runnable
x = nil
result = (x = nil or 'fallback')   # parses as (x = nil) or 'fallback'
p x        # nil       — x got nil, not the fallback
p result   # "fallback" — the expression evaluated to it

y = (nil || 'fallback')            # || binds tighter than =
p y        # "fallback" — what you meant
```

The rule the community settled on: **use `&&` and `||` for values, and `and`/`or` only for
control flow**, as in `do_thing or raise 'failed'`. If you are assigning, `||` is the only
correct choice. RuboCop's `Style/AndOr` enforces exactly this.

That is what makes `user && user.name` work as a guard: the expression evaluates to
`undefined` rather than throwing.
:::

:::failure
**Short-circuiting hides work you meant to do.**

```ruby runnable
$audit_calls = 0

def audit(action)
  $audit_calls += 1
  true
end

def delete_item(user)
  # BUG: if the user is not an admin, the audit never happens.
  return 'deleted' if user[:admin] && audit('delete')

  'denied'
end

delete_item({ admin: false })
delete_item({ admin: true })
puts "audit entries: #{$audit_calls} — should be 2, both attempts matter"
```

A denied attempt is the one you most want in the audit log, and short-circuiting removed it.
The fix is to stop mixing a question with an action:

```ruby runnable
$audit_calls = 0

def audit(action)
  $audit_calls += 1
  true
end

def delete_item(user)
  audit('delete')                       # always, first, unconditionally
  user[:admin] ? 'deleted' : 'denied'
end

delete_item({ admin: false })
delete_item({ admin: true })
puts "audit entries: #{$audit_calls}"
```

The general rule: **the right-hand side of `&&` or `||` must be a pure test.** Anything that
writes, logs, charges, enqueues or sends belongs on its own line, where its execution does not
depend on a condition two tokens to the left.

The rule: **never put something you need to happen on the right-hand side of `&&` or
`||`.** Side effects belong on their own line.

**Optional chaining hides the cause, not just the symptom.**

```ruby runnable
response = { data: nil }

p response[:data]&.fetch(:user)        # nil — no crash
p response.dig(:data, :user, :name)    # nil — the Hash version

# Which is fine if "absent" is expected, and a disaster if it is not:
# the request failed, and you now have nil flowing downstream instead
# of an error at the point of failure.
#
# Compare:
begin
  response.fetch(:data).fetch(:user)
rescue StandardError => e
  puts "#{e.class}: #{e.message}"      # fails HERE, where the data is missing
end
```

`&.` and `dig` are the right tools when absence is a legitimate state you intend to handle. They
are the wrong tools for making an error go away. A chain of `&.` that ends in a `nil` you then
pass along has moved the failure from the line that knows what went wrong to a line hundreds of
frames later that does not — and the resulting `NoMethodError ... for nil` is the least
informative error in Ruby precisely because the cause is always elsewhere.

The question to ask at every `&.`: *is `nil` a value this code knows how to handle?* If yes, use
it and handle the `nil`. If no, use `fetch` and let it raise where the problem is.

One more Ruby detail: `dig` raises if something along the path is not diggable, which is usually
what you want:

```ruby runnable
begin
  { a: 1 }.dig(:a, :b)
rescue TypeError => e
  puts "#{e.class}: #{e.message}"
end
```

`?.` is correct when absence is a legitimate state and wrong when it is a failure you
needed to know about. The crash at least told you where.
:::

:::tradeoffs
**Relying on truthiness** is shorter and reads well for the common case: `if (!user)
return`.

**Explicit comparisons** are longer and say exactly which condition you mean, which
matters the moment `0` or `""` is a legitimate value.

The rule most codebases settle on: **truthiness for existence, explicit for values.**
`if (!user) return` is fine, because there is no falsy user. `if (!count)` is not, because
`0` is a count. Same for `if (!name)` where an empty string might be real input.
:::

:::checkpoint
Predict each:

```ruby
puts 'A' if []
puts 'B' if '0'
puts 'C' if 0
p(0 || 'fallback')
p(nil || 0 || '' || 'last')
p({ a: false }[:a] || 'fallback')
p({ a: false }.fetch(:a, 'fallback'))
p [].any?
p [nil].any?
x = (y = nil or 'oops'); p [x, y]
```

Then: the last one is `true`. Trace the conversions that get it there, and say what you
would have written instead.
:::

:::interview
Truthiness alone is a warm-up. The question that actually separates answers is *"when
would you use `??` instead of `||`?"* — because the right answer requires knowing the
failure it prevents.

*"`||` falls back on any falsy value, so a deliberate `0` or `""` gets replaced by the
default. `??` only falls back on `null` and `undefined`. For a numeric setting like a
volume or a retry count, `??` is correct and `||` is a bug that only shows up when
someone sets it to zero."*

Then the follow-through most candidates miss: *"and I keep side effects out of `&&` and
`||`, because short-circuiting means the right-hand side may never run — I have seen an
audit log go missing that way."*
:::

## What you now know

- JavaScript has exactly eight falsy values; `[]`, `{}`, `"0"` and `"false"` are all
  truthy.
- The rule differs per language — `if (list)` asks a different question in JS and Python.
- `||` defaults on any falsy value; `??` only on `null`/`undefined`. For numbers, use `??`.
- `&&` and `||` return an operand, not a boolean, which is what makes them usable as
  guards.
- Short-circuiting means the right-hand side may not run — never put a needed side effect
  there.
- `?.` is right when absence is expected and wrong when it is a failure you needed to see.
- Truthiness for existence; explicit comparisons for values.
