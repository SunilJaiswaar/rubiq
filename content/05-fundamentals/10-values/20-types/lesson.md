---
title: Types, and what they are for
summary: Why a language bothers tracking what kind of thing a value is — and the real difference between static and dynamic.
level: beginner
minutes: 14
status: stable
last_reviewed: "2026-10-07"
tags: [fundamentals, types, static-typing]
concepts: [types, type-checking, coercion]
prerequisites: [variables]
interview:
  - question: What is the difference between static and dynamic typing?
    level: basic
    answer: >-
      Both track types. The difference is *when* the check happens. A statically typed
      language checks before the program runs, so a type error is a compile failure on
      every path through the code, including paths your tests never reach. A dynamically
      typed language checks as each operation executes, so a type error is a runtime
      exception on the paths that actually run. Static catches more, earlier, at the cost
      of having to express what you mean in the type system; dynamic lets you write code
      the type system could not have described.
    followUps:
      - "Is JavaScript untyped?"
      - "What does gradual typing give you that neither extreme does?"
  - question: Why is implicit coercion considered a design mistake?
    level: basic
    hint: What should `[] + {}` be?
    answer: >-
      Because it turns a mistake into a plausible-looking value instead of an error.
      `"5" - 2` giving `3` means a string reached arithmetic and the program carried on;
      the bug surfaces later, somewhere else, with no connection to its cause. Languages
      designed after JavaScript almost all refuse: Python raises TypeError for
      `"5" - 2`, Ruby raises, Go will not compile it.
resources:
  - title: "MDN — Equality comparisons and sameness"
    url: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Equality_comparisons_and_sameness
---

## Everything in memory is a number

At the hardware level there are no strings, no lists, no booleans. There are bytes.

```text
  01000001 01000010 01000011

  Is that...
    the string "ABC"?
    the number 4,276,803?
    three small numbers 65, 66, 67?
    part of a floating-point value?
    a machine instruction?
```

It is all of those, depending on how you read it. The bytes carry no opinion.

:::problem
If bytes do not say what they are, then *something* has to remember. Otherwise you can add
a customer's name to a price and the machine will happily produce a number, because adding
is just an operation on bytes.

The question every language has to answer is: **who remembers, and when is it checked?**
:::

:::what
A **type** is a claim about what a value is and what you may do with it. Type checking is
the process of verifying those claims.

**Static typing** checks before the program runs. **Dynamic typing** checks as each
operation runs.
:::

## The two answers

```ruby runnable
# Dynamic: the VALUE carries its type, and the check happens at the operation.
x = 5
p x.class            # Integer
x = 'now a string'
p x.class            # String — the name never had a type; the value does

# The error arrives when the operation runs, not before.
begin
  nil.length
rescue NoMethodError => e
  puts "#{e.class}: #{e.message}"
end
```

Ruby takes this further than most dynamic languages: there is no `typeof` operator because
asking an object its class is just a method call, and `nil` is an object too.

```ruby runnable
[5, 5.0, 'five', :five, nil, true, [5], { a: 5 }, (1..5)].each do |v|
  puts format('%-12s %s', v.inspect, v.class)
end
```

Note `nil.class` is `NilClass` and `nil` is a real object with methods. That is why the error
above is `NoMethodError` — "this object does not respond to `length`" — rather than a special
null-pointer failure. It is the same error you would get for a typo on any other object, which
is both reassuring and the reason `NoMethodError ... for nil` is the error you will see most
often in Ruby: it means something upstream returned nothing and you did not notice.

```typescript
// Static: the NAME has a type, and the check happens before anything runs.
let x: number = 5;
x = "now a string";
//  ^^^ Type 'string' is not assignable to type 'number'.
//      This is a compile error. The program is never produced.
```

:::how
The crucial difference is **coverage**, not strictness.

```text
  DYNAMIC: checked on the paths that execute

      if (rareCondition) {
        doSomethingWith(wrongType)    ← error only when rareCondition is true,
      }                                  which might be in production, in March

  STATIC: checked on every path, including ones nothing has ever run

      if (rareCondition) {
        doSomethingWith(wrongType)    ← compile error now, unconditionally
      }
```

A test suite gives a dynamic language coverage of the paths the tests take. A type checker
gives coverage of *all* paths, for the specific class of errors it understands. Those are
complementary, which is why statically typed codebases still have tests and why large
dynamically typed codebases keep adding type checkers.
:::

:::why
Types do three jobs, and the first is the one people underrate:

1. **Documentation that cannot go stale.** `function charge(user, amount)` tells you
   nothing. `function charge(user: User, amount: Money): Receipt` tells you what to pass
   and what you get, and it cannot drift from the code the way a comment can.
2. **Catching a category of mistake early.** Not logic errors — a type checker will
   happily let you compute the wrong price correctly typed.
3. **Letting the machine go faster.** If the compiler knows a value is a 64-bit integer it
   emits one instruction. If it has to check at runtime, it emits a check first. This is
   most of why C is faster than Python.
:::

## Coercion: the part that bites

Here is the fork in the road, and it is the single biggest difference between Ruby and the
language this section was originally written in. JavaScript converts rather than complaining:
`"5" - 2` is `3`, `"5" + 2` is `"52"`, and `[] == false` is `true`. Ruby refuses:

```ruby runnable
checks = [
  ['"5" - 2',   -> { '5' - 2 } ],
  ['"5" + 2',   -> { '5' + 2 } ],
  ['2 + "5"',   -> { 2 + '5' } ],
  ['[] + {}',   -> { [] + {} } ],
  ['"10" > 9',  -> { '10' > 9 } ],
]

checks.each do |label, attempt|
  result = begin
    attempt.call.inspect
  rescue StandardError => e
    "#{e.class}: #{e.message}"
  end
  puts format('%-10s → %s', label, result)
end

# And comparison does not coerce either — it just says no.
p 1 == '1'          # false, with no conversion attempted
p [] == false       # false
p nil == false      # false — in Ruby these are different things
```

Every one of those is an error or a plain `false`. There is no `===` to reach for, because `==`
never coerced in the first place. That is a real reduction in the number of things you have to
hold in your head, and it is why Ruby code rarely contains defensive type checks: the operation
itself is the check.

**Ruby's own silent conversion trap is elsewhere**, and it is worth more attention than the one
you just escaped. The explicit converters are lenient:

```ruby runnable
p '5'.to_i        # 5
p '5abc'.to_i     # 5     — stops at the first non-digit, says nothing
p 'abc'.to_i      # 0     — no digits at all, and you get a valid-looking number
p ''.to_i         # 0
p nil.to_i        # 0
p '0x1f'.to_i     # 0     — not hex unless you ask
p '3.7'.to_i      # 3     — truncates
p 'abc'.to_f      # 0.0
```

`"abc".to_i` returning `0` is the shape of a real bug: a malformed price becomes free, a
malformed id becomes record zero, a malformed count becomes "none". Nothing raises, and `0` is a
perfectly plausible number to find in a log.

The strict converters are the `Kernel` methods with capital letters:

```ruby runnable
[['5', nil], ['5abc', nil], ['abc', nil], ['1f', 16]].each do |str, base|
  result = begin
    (base ? Integer(str, base) : Integer(str)).inspect
  rescue StandardError => e
    "#{e.class}: #{e.message}"
  end
  puts format('Integer(%-7s %s) → %s', str.inspect + ',', base.inspect, result)
end

# And when you want strictness without an exception:
p Integer('abc', exception: false)   # nil — explicit "this was not a number"
```

The rule worth adopting: **`to_i` for data you produced, `Integer()` for data someone else
produced.** Anything arriving from `params`, a CSV, an API payload or an environment variable is
in the second category.

:::mistakes
**That `"5" + 2` and `"5" - 2` disagree is the tell.** `+` means both addition and
concatenation, so it picks concatenation when either side is a string. `-` has no string
meaning, so it converts to numbers. Two different rules for two operators that look like a
matched pair.

The practical consequence is a real bug class:

```ruby runnable
# A form field is always a string. Always. In Rails, params values are strings.
quantity = '2'      # params[:quantity]
price = 10

# Ruby will not let the first mistake happen at all:
begin
  puts quantity * price
rescue StandardError => e
  puts "#{e.class}: #{e.message}"
end

# ...although String#* IS defined — as repetition. So this "works":
p '2' * 10          # "2222222222"   a String, not 20

# The fix, and the version to use on untrusted input:
p Integer(quantity) * price            # 20
p Integer(quantity, exception: false)  # 2, or nil if it was junk
```

That `'2' * 10` result deserves a second look, because it is the one place Ruby will quietly
hand you something useless instead of raising. `String#*` means "repeat", so a string where you
expected a number produces a longer string rather than an error — and `quantity * price` for a
quantity of `"2"` and a price of `10` gives `"2222222222"`, which will then fail somewhere much
later, in a currency formatter or a database insert, far from the line that caused it.

In Rails the habit that prevents this is to convert at the boundary, once, in the place that
knows what the parameter means — strong parameters, a form object, or an ActiveRecord cast from
the column type — and never to do arithmetic on anything straight out of `params`.

The first line working by accident is what makes the second line dangerous: there is no
error, and `"210"` looks like a number in a log.

**Always use `===`.** `==` runs a conversion table that almost nobody has memorised
correctly. There is no case where `==` is clearer.

```ruby runnable
# Ruby's equivalent list is boring, which is the point.
pairs = [[0, ''], [0, '0'], ['', '0'], [nil, false], [Float::NAN, Float::NAN]]
pairs.each { |a, b| puts format('%-14s == %-14s → %s', a.inspect, b.inspect, a == b) }
```

All false. The only surprise is the last one, and it is not Ruby's fault: `NaN == NaN` is false
by IEEE 754, in every language. `value.nan?` is how you ask.

What Ruby *does* ask you to learn is that there are three equality questions, not one:

```ruby runnable
p 1 == 1.0           # true  — same value
p 1.eql?(1.0)        # false — same value AND same type
p 1.equal?(1)        # true  — the same object

# The one that bites: Hash keys use eql?, not ==
counts = { 1 => :integer_key }
p counts[1.0]        # nil — 1.0 is not the same key as 1
p({ 1 => :a, 1.0 => :b }.size)   # 2 — two distinct keys that are == to each other
```

| method | asks | you redefine it when |
|---|---|---|
| `==` | same value? | your class has a meaningful notion of equal |
| `eql?` | same value and type? | your objects are used as Hash keys (pair it with `hash`) |
| `equal?` | the same object? | never — it is identity, and overriding it is a lie |
| `===` | does this *match*? | your class is the subject of a `case`/`when` |

`===` is not a stricter `==`, which is the trap for anyone arriving from JavaScript. It is the
"case equality" or pattern-match operator, and classes define it to mean whatever matching means
for them:

```ruby runnable
p Integer === 5          # true  — is 5 an Integer?
p (1..10) === 5          # true  — is 5 in the range?
p(/ell/ === 'hello')     # true  — does the pattern match?
p 5 === 5                # true  — Object#=== falls back to ==

# which is exactly what `case` uses:
def describe(x)
  case x
  when Integer then 'a whole number'
  when 1.0..9.9 then 'a small float'
  when /\A\d+\z/ then 'a string of digits'
  else 'something else'
  end
end
p [5, 2.5, '42', :x].map { |v| describe(v) }
```
:::

:::internals
**Why `0.1 + 0.2 !== 0.3`.** This is not a JavaScript bug; it is in every language using
IEEE 754 floating point, which is nearly all of them.

```ruby runnable
p 0.1 + 0.2                 # 0.30000000000000004
p 0.1 + 0.2 == 0.3          # false
puts format('%.20f', 0.1 + 0.2)   # see the actual stored value
p (0.1 + 0.2).rationalize(0.0001) # 3/10 — what you meant
```

A float stores a number as `sign × mantissa × 2^exponent` — a sum of powers of two. `0.5`
is `2^-1`, exactly representable. `0.1` is not: in binary it is `0.0001100110011...`
repeating forever, exactly as `1/3` is `0.333...` in decimal. The stored value is the
nearest representable one, and two tiny errors add up to a visible one.

```text
  0.1 decimal  →  0.0001100110011001100110011...  binary (repeating)
                  └──────── truncated to 53 bits ────────┘
                            slightly more than 0.1
```

**So never use floats for money.** Store integer minor units — paise, cents — and divide
only for display. Or use a decimal type: `BigDecimal` in Ruby and Java, `decimal.Decimal`
in Python, `NUMERIC` in PostgreSQL.

```ruby runnable
# Wrong: accumulating float error over many additions.
float_total = 0.0
10.times { float_total += 0.1 }
p float_total            # 0.9999999999999999 — should be 1

# Right: integers throughout, divide once at the very edge.
paise = 0
10.times { paise += 10 }
p paise / 100.0          # 1.0

# Ruby also gives you two exact types, which most languages do not.
require 'bigdecimal'
require 'bigdecimal/util'

p (BigDecimal('0.1') * 10).to_i      # 1 — exact decimal arithmetic
p (1r / 10 * 10) == 1                # true — Rational, exact fractions
p 1r / 3                             # (1/3) — no rounding at all
```

Three options, and the choice is not arbitrary:

**Integer minor units** — store paise, cents, satoshis. Fastest, exact, and the thing to reach
for by default. The cost is that every display and every input needs a conversion, and forgetting
one gives you a bill a hundred times too large.

**`BigDecimal`** — exact decimal arithmetic with a scale you control. This is what Rails uses for
a `decimal` column, and what ActiveRecord hands you back from one, so it is already in your
application whether you chose it or not. Slower than Integer, and `BigDecimal('0.1')` is exact
while `BigDecimal(0.1)` is not — the string constructor is the one you want.

**`Rational`** — exact fractions, so `1r/3` loses nothing. Right for ratios, tax rates and
anything you will multiply repeatedly; wrong for money you need to round and display.

What matters most is the rule underneath all three: **never let a Float hold money.** A
`float` column in a schema is a bug waiting for a reconciliation report to find it.
:::

:::tradeoffs
**Static typing.** Errors before you run. Types as enforced documentation. Better editor
completion and safer refactoring — rename a field and the compiler lists every caller.
Faster code. Cost: you must express your intent in the type system, which is sometimes
awkward and occasionally impossible, and you pay a compile step.

**Dynamic typing.** Write what you mean and run it. Duck typing composes without
ceremony — the Enumerable pattern in Ruby works because nothing has to declare a
relationship. Cost: an error on an unexercised path is a production incident, and
refactoring is a search-and-pray operation that tests only partly cover.

**Gradual typing** — TypeScript, Python's hints, Ruby's RBS, Sorbet — is the wager that
you can take most of the static benefit while keeping the dynamic escape hatch. It mostly
works, with one honest caveat: TypeScript's types are erased at runtime. A value that
arrives from the network typed as `User` is only a `User` because you said so.

```typescript
// This compiles. It is also a lie, and nothing checks it at runtime.
const user = await res.json() as User;
```

Validate at the boundary — Zod, Valibot, a hand-written check. Everything inside can then
trust the type.
:::

:::realworld
| Language | When checked | Notable choice |
|---|---|---|
| C, C++ | Compile | Types do not stop you reinterpreting the bytes anyway |
| Java, C# | Compile + some runtime | Casts are checked at runtime, so a bad one throws |
| Go | Compile | Deliberately small type system; no inheritance |
| Rust | Compile | Types also track *ownership*, so data races are compile errors |
| TypeScript | Compile only | Erased at runtime — validate at the edges |
| Python, Ruby | Runtime | Optional hints checked by a separate tool, not the interpreter |
| JavaScript | Runtime | Coerces instead of complaining, for historical reasons |
:::

:::checkpoint
Without running them:

```ruby
p nil.class
p Float::NAN == Float::NAN
p 0.1 + 0.2 == 0.3
p '10' > '9'
p 'abc'.to_i
p Integer('abc', exception: false)
p 1.eql?(1.0)
p({ 1 => :a }[1.0])
```

The last two differ. Say why before you run it — then say which operator would have made
the intent unambiguous.
:::

:::interview
"Static or dynamic, which is better?" is a trap: the answer is "for what?", and a
candidate who picks a side without asking has told you something.

A strong answer frames it as **when the check happens and what it covers**: static checks
every path before running, for the errors the type system can express; dynamic checks the
paths that execute, for everything. Then the practical position: *"I want types at module
and network boundaries, where a wrong assumption is expensive and a comment goes stale.
Inside a small module I care less. And in TypeScript I validate anything crossing a
boundary at runtime, because the types are erased."*

If floats come up, the answer is never "floating point is broken" — it is *"0.1 has no
exact binary representation, which is why money is stored as integer minor units or a
decimal type."*
:::

## What you now know

- Bytes carry no type; something has to remember, and the question is when it is checked.
- Static checks every path before running. Dynamic checks the paths that execute.
- Types are documentation that cannot go stale, a safety net for one error class, and a
  speed optimisation.
- Coercion turns mistakes into plausible values. Use `===`.
- `0.1 + 0.2 !== 0.3` because binary cannot represent 0.1. Money goes in integers.
- TypeScript's types are erased, so validate at the boundary.
