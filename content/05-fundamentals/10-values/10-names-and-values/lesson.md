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

```javascript runnable
let a = [1, 2, 3];
let b = a;

b.push(4);

console.log("a =", a);   // what do you expect?
console.log("b =", b);
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
  let a = [1, 2, 3]

      a ──────▶ ┌─────────────┐
                │ [1, 2, 3]   │   the list — one thing, somewhere in memory
                └─────────────┘

  let b = a          b is a second LABEL on the SAME thing

      a ──────▶ ┌─────────────┐
                │ [1, 2, 3]   │
      b ──────▶ └─────────────┘

  b.push(4)          follows the label, changes the thing

      a ──────▶ ┌─────────────┐
                │ [1,2,3,4]   │   both labels see it, because there is one thing
      b ──────▶ └─────────────┘
```

Now contrast that with reassignment:

```javascript runnable
let a = [1, 2, 3];
let b = a;

b = [9, 9];        // NOT b.push — this moves the label b to a different thing

console.log("a =", a);   // [1, 2, 3] — untouched
console.log("b =", b);   // [9, 9]
```

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

```javascript runnable
const original = [3, 1, 2];

const sortedCopy = [...original].sort((x, y) => x - y);
console.log("after copy-sort, original =", original);   // untouched

original.sort((x, y) => x - y);
console.log("after in-place sort,   original =", original);   // changed
```

:::mistakes
**The function that quietly edits your data.**

```javascript runnable
function addTax(prices) {
  for (let i = 0; i < prices.length; i++) {
    prices[i] = prices[i] * 1.2;      // changes the CALLER's array
  }
  return prices;
}

const myPrices = [100, 200];
const withTax = addTax(myPrices);

console.log("withTax  =", withTax);
console.log("myPrices =", myPrices);   // also changed — the original is gone
```

The caller has lost their original data and nothing told them. Write it so it cannot
happen:

```javascript runnable
function addTax(prices) {
  return prices.map((p) => p * 1.2);   // builds a new array; caller's is untouched
}

const myPrices = [100, 200];
console.log("withTax  =", addTax(myPrices));
console.log("myPrices =", myPrices);   // safe
```

**A function that returns a value and also changes its argument is doing two things.**
Pick one. Returning a new value is almost always the one to pick.

**`const` does not mean immutable.**

```javascript runnable
const list = [1, 2];
list.push(3);          // fine — the thing changed, the label did not move
console.log(list);

try {
  list = [9];          // not fine — this would move the label
} catch (e) {
  console.log(e.constructor.name + ":", e.message);
}
```

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
3. **Freeze it and see who complains.** `Object.freeze(obj)` in JavaScript, `.freeze` in
   Ruby. The stack trace points at the culprit.

```javascript runnable
const config = Object.freeze({ retries: 3 });

function misbehave(c) {
  "use strict";
  c.retries = 99;      // throws in strict mode instead of silently failing
}

try {
  misbehave(config);
} catch (e) {
  console.log("caught:", e.message);
}
console.log("config still:", config);
```
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

```javascript
// 1
let x = 5; let y = x; y = 6;
console.log(x);

// 2
let a = { n: 1 }; let b = a; b.n = 2;
console.log(a.n);

// 3
let p = [1]; let q = p; q = [...q, 2];
console.log(p);

// 4
const f = (obj) => { obj.touched = true; };
const o = {}; f(o);
console.log(o);
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
