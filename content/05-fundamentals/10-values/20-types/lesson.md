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

```javascript runnable
// Dynamic: the VALUE carries its type, and the check happens at the operation.
let x = 5;
console.log(typeof x);     // "number"
x = "now a string";
console.log(typeof x);     // "string" — the name never had a type; the value does

// The error arrives when the operation runs, not before.
try {
  null.length;
} catch (e) {
  console.log(e.constructor.name + ":", e.message);
}
```

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

```javascript runnable
// JavaScript converts rather than complaining.
console.log('"5" - 2   =', "5" - 2);        // 3    — string became a number
console.log('"5" + 2   =', "5" + 2);        // "52" — number became a string
console.log('[] + {}   =', [] + {});
console.log('1 == "1"  =', 1 == "1");       // true  — coerces before comparing
console.log('1 === "1" =', 1 === "1");      // false — compares type first
console.log('[] == false =', [] == false);  // true  — via several conversions
```

:::mistakes
**That `"5" + 2` and `"5" - 2` disagree is the tell.** `+` means both addition and
concatenation, so it picks concatenation when either side is a string. `-` has no string
meaning, so it converts to numbers. Two different rules for two operators that look like a
matched pair.

The practical consequence is a real bug class:

```javascript runnable
// A form field is always a string. Always.
const quantity = "2";      // from an <input>
const price = 10;

console.log("total (broken):", quantity * price);   // 20 — works by accident
console.log("total (broken):", quantity + price);   // "210" — silently wrong

console.log("total (fixed) :", Number(quantity) * price);
```

The first line working by accident is what makes the second line dangerous: there is no
error, and `"210"` looks like a number in a log.

**Always use `===`.** `==` runs a conversion table that almost nobody has memorised
correctly. There is no case where `==` is clearer.

```javascript runnable
// A quick tour of why == is not worth defending.
const pairs = [[0, ""], [0, "0"], ["", "0"], [null, undefined], [NaN, NaN]];
for (const [a, b] of pairs) {
  console.log(`${JSON.stringify(a)} == ${JSON.stringify(b)} →`, a == b);
}
```
:::

:::internals
**Why `0.1 + 0.2 !== 0.3`.** This is not a JavaScript bug; it is in every language using
IEEE 754 floating point, which is nearly all of them.

```javascript runnable
console.log(0.1 + 0.2);                  // 0.30000000000000004
console.log(0.1 + 0.2 === 0.3);          // false
console.log((0.1 + 0.2).toFixed(20));    // see the actual stored value
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

```javascript runnable
// Wrong: accumulating float error over many additions.
let floatTotal = 0;
for (let i = 0; i < 10; i++) floatTotal += 0.1;
console.log("float  :", floatTotal, "— should be 1");

// Right: integers throughout, divide once at the edge.
let paise = 0;
for (let i = 0; i < 10; i++) paise += 10;
console.log("integer:", paise / 100);
```
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

```javascript
console.log(typeof null);
console.log(typeof NaN);
console.log(0.1 + 0.2 === 0.3);
console.log("10" > 9);
console.log("10" > "9");
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
