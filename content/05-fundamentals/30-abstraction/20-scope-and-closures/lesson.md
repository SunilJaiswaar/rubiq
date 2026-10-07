---
title: Scope and closures
summary: Where a name is visible, how long the value it refers to survives, and the loop bug that taught a generation about both.
level: basic
minutes: 14
status: stable
last_reviewed: "2026-10-07"
tags: [fundamentals, scope, closures, hoisting]
concepts: [scope, closures, lexical-scoping]
prerequisites: [functions, variables]
interview:
  - question: What is a closure?
    level: basic
    answer: >-
      A function together with the variable bindings from the scope where it was defined.
      Two consequences follow. First, lookup is *lexical*: the function sees the variables
      where it was written, not where it is called. Second, those bindings stay alive as
      long as the function does — so a closure returned from a function keeps that
      function's locals from being collected. That is what makes counters, memoisation and
      private state possible, and it is also how closures leak memory.
    followUps:
      - "So why did `var` in a loop capture the wrong value?"
      - "How can a closure cause a memory leak?"
  - question: Explain the difference between `var`, `let` and `const`.
    level: basic
    answer: >-
      `var` is function-scoped and hoisted initialised to `undefined`, so it is readable
      before its declaration. `let` and `const` are block-scoped and hoisted but *not*
      initialised — reading one before its declaration throws a ReferenceError, which is
      the temporal dead zone. `const` additionally forbids rebinding the name, though the
      value it points at can still be mutated. Block scoping is the important difference:
      it is why `let` in a `for` loop gives each iteration its own binding.
resources:
  - title: "MDN — Closures"
    url: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Closures
---

## Two questions that look like one

```javascript runnable
function outer() {
  const secret = "hidden";
  function inner() {
    return secret;        // How can inner see this?
  }
  return inner;
}

const fn = outer();       // outer has RETURNED. Its locals should be gone.
console.log(fn());        // "hidden" — but they are not
```

There are two separate questions here and conflating them is why closures feel mysterious:

1. **Scope** — *where is a name visible?* Answered at the time the code is written.
2. **Lifetime** — *how long does the value survive?* Answered at runtime.

:::problem
The naive model is that a function's locals live on the stack and vanish when it returns.
That model predicts `fn()` throws. It does not throw, so the model is wrong — and the
correct model is the thing that makes callbacks, event handlers, memoisation and module
privacy work at all.
:::

:::what
**Lexical scope**: a name is resolved by looking outward through the blocks that
*textually enclose* the code, not through the call stack.

A **closure**: a function bundled with the bindings it captured from its defining scope,
kept alive for as long as the function is reachable.
:::

## Lexical means "where it was written"

```javascript runnable
const name = "global";

function whoAmI() {
  return name;              // resolved where whoAmI was WRITTEN
}

function caller() {
  const name = "caller";    // irrelevant to whoAmI
  return whoAmI();
}

console.log(caller());      // "global", not "caller"
```

:::how
```text
  Resolution walks OUT through enclosing blocks, not UP the call stack:

    ┌─ global ──────────────────────────────┐
    │  const name = "global"                │
    │                                       │
    │  ┌─ whoAmI ──────────────┐            │
    │  │  return name ─────────────────────▶ found here
    │  └───────────────────────┘            │
    │                                       │
    │  ┌─ caller ──────────────┐            │
    │  │  const name = "caller"│  ← never consulted; it does not
    │  │  return whoAmI()      │    enclose whoAmI textually
    │  └───────────────────────┘            │
    └───────────────────────────────────────┘
```

The alternative — resolving through the call stack — is called **dynamic scoping**. Almost
no modern language uses it, because it means a function's behaviour depends on who called
it, so you can never read a function in isolation. Bash and Emacs Lisp have it; the
comparison is instructive about why nobody repeated it.
:::

:::why
Lexical scope is what makes a function readable on its own. Everything it can see is
visible on the page around it. That is also exactly what a closure preserves — and why a
closure is not a special feature so much as the honest consequence of lexical scope
surviving the stack.
:::

## The loop bug

This is the single most instructive bug in JavaScript's history, because it is scope and
lifetime failing together.

```javascript runnable
console.log("with var:");
var fnsVar = [];
for (var i = 0; i < 3; i++) {
  fnsVar.push(() => i);
}
console.log("  ", fnsVar.map((f) => f()));     // [3, 3, 3]

console.log("with let:");
const fnsLet = [];
for (let j = 0; j < 3; j++) {
  fnsLet.push(() => j);
}
console.log("  ", fnsLet.map((f) => f()));     // [0, 1, 2]
```

:::internals
```text
  var:  ONE binding, function-scoped. All three closures captured the same box.
        By the time any of them ran, the loop had finished and the box held 3.

        ┌─────────┐
        │ i = 3   │ ◀── fn0, fn1, fn2 all point here
        └─────────┘

  let:  a NEW binding per iteration — this is specified behaviour, not a side effect.
        Each closure captured a different box.

        ┌─────────┐  ┌─────────┐  ┌─────────┐
        │ j = 0   │  │ j = 1   │  │ j = 2   │
        └─────────┘  └─────────┘  └─────────┘
             ▲            ▲            ▲
            fn0          fn1          fn2
```

Before `let` existed, the workaround was to create a scope by hand with an immediately
invoked function:

```javascript runnable
var fns = [];
for (var i = 0; i < 3; i++) {
  (function (captured) {
    fns.push(() => captured);      // `captured` is a fresh parameter per call
  })(i);
}
console.log(fns.map((f) => f()));  // [0, 1, 2]
```

That pattern — the IIFE — is all over pre-2015 JavaScript, and this is the bug it existed
to work around. `let` made it unnecessary by giving the loop a per-iteration binding.
:::

## `var`, `let`, `const`

```javascript runnable
function scoping() {
  if (true) {
    var functionScoped = "var";
    let blockScoped = "let";
  }
  console.log("var escapes the block:", functionScoped);
  try {
    console.log(blockScoped);
  } catch (e) {
    console.log("let does not:", e.constructor.name);
  }
}
scoping();
```

```javascript runnable
// Hoisting: both are hoisted, but only `var` is initialised.
function hoisting() {
  console.log("var before declaration :", typeof varName);   // "undefined"
  try {
    console.log(letName);
  } catch (e) {
    console.log("let before declaration:", e.constructor.name, "— temporal dead zone");
  }
  var varName = 1;
  let letName = 2;
}
hoisting();
```

:::mistakes
**`const` does not freeze the value** — it freezes the binding. Covered in the names-and-
values lesson, and it keeps surprising people here too.

**Closures capture the binding, not a snapshot.**

```javascript runnable
let config = { url: "first" };
const read = () => config.url;

console.log(read());             // "first"
config = { url: "second" };
console.log(read());             // "second" — it sees the current binding
```

If you wanted the value at capture time, capture the value:

```javascript runnable
let config = { url: "first" };
const readSnapshot = ((url) => () => url)(config.url);

config = { url: "second" };
console.log(readSnapshot());     // "first"
```

**`this` is not lexically scoped in a regular function.** It is the one exception to
everything above, which is exactly why it causes trouble:

```javascript runnable
const counter = {
  count: 0,
  incRegular: function () {
    [1, 2].forEach(function () {
      // `this` here is NOT counter — regular functions get `this` from the call
      if (this === undefined || this !== counter) return;
      this.count++;
    });
    return this.count;
  },
  incArrow: function () {
    [1, 2].forEach(() => { this.count++; });   // arrow: `this` IS lexical
    return this.count;
  },
};
console.log("regular callback:", counter.incRegular());   // 0 — lost `this`
console.log("arrow callback  :", counter.incArrow());     // 2 — kept it
```

**Arrow functions close over `this` lexically; regular functions receive it from the call
site.** That single difference is the main practical reason to prefer arrows for
callbacks.
:::

:::failure
**Closures keep their entire captured scope alive, including things you forgot about.**

```javascript runnable
function makeLeaky() {
  const huge = new Array(1_000_000).fill("x");   // ~8 MB
  const small = huge.length;

  // This closure only needs `small` — but it captures the whole scope,
  // so `huge` cannot be collected while the returned function is reachable.
  return () => small;
}

function makeClean() {
  const smallOnly = computeLength();
  return () => smallOnly;

  function computeLength() {
    const huge = new Array(1_000_000).fill("x");
    return huge.length;        // `huge` is scoped to this function and dies with it
  }
}

const leaky = makeLeaky();
const clean = makeClean();
console.log("both return the same answer:", leaky(), clean());
console.log("but only one holds 8 MB alive");
```

This is the classic leak shape in long-lived processes: an event handler or a cache entry
whose closure captured a scope containing a large object nobody meant to retain. The fix is
structural — compute in a narrower scope so the large value is never in the captured
environment.

Engines do optimise some of this away, but you cannot rely on it: whether a given variable
is retained depends on whether the engine can prove it is unused, and `eval` or a debugger
defeats that proof.
:::

:::realworld
Closures are the mechanism behind a surprising amount of ordinary code:

```javascript runnable
// Private state with no class and no `#` fields.
function makeAccount(balance) {
  return {
    deposit: (n) => (balance += n),
    get: () => balance,
  };
}
const acct = makeAccount(100);
acct.deposit(50);
console.log("balance:", acct.get(), "| balance is unreachable:", acct.balance);

// Memoisation — the cache lives in the closure.
const once = (fn) => { let done = false, val; return (...a) => (done ? val : (done = true, val = fn(...a))) };
let inits = 0;
const init = once(() => { inits++; return "ready" });
console.log(init(), init(), "— ran", inits, "time");

// Partial application.
const multiplyBy = (factor) => (n) => n * factor;
console.log([1, 2, 3].map(multiplyBy(10)));
```

React hooks are closures: `useState` returns a setter that closes over which state slot it
owns. The "stale closure" bug every React developer meets — a callback reading an old
value — is exactly this lesson, with a dependency array as the fix.
:::

:::tradeoffs
**Closures** give you private state without a class, let callbacks carry context without
parameters, and make partial application and memoisation trivial.

The costs are real: captured scope is invisible at the call site, so a closure reading
something that changed later is a bug with no local evidence; and retained scope is the
most common JavaScript memory leak. Classes make the state explicit and inspectable at the
price of ceremony.

The rule worth adopting: **capture what you need, not the scope you are in.** If a closure
only needs one number, make sure one number is all that is in reach.
:::

:::checkpoint
Predict each:

```javascript
// 1
for (var i = 0; i < 3; i++) setTimeout(() => console.log("A", i), 0);

// 2
for (let i = 0; i < 3; i++) setTimeout(() => console.log("B", i), 0);

// 3
const fns = [1, 2, 3].map((n) => () => n);
console.log(fns.map((f) => f()));

// 4
let x = 1;
const f = () => x;
x = 2;
console.log(f());
```

Then: number 3 behaves like `let` rather than `var` even though no `let` appears. Why?
:::

:::interview
"What is a closure?" is asked constantly and answered badly, because most answers describe
the mechanism without the consequence.

Lead with both halves: *"a function plus the bindings from where it was defined. So lookup
is lexical — it sees where it was written, not where it is called — and those bindings stay
alive as long as the function does."* Then prove you understand the second half: *"which is
why a closure returned from a function keeps that function's locals alive, and why the
most common JavaScript memory leak is a handler whose captured scope contains something
large."*

The follow-up is almost always the loop. The right answer is not "use `let`" — it is
*"`var` is function-scoped, so all three closures captured one binding that held 3 by the
time they ran. `let` creates a new binding per iteration, which is specified behaviour.
Before `let`, you made a scope by hand with an IIFE — that is what all those wrapper
functions in old code were for."*
:::

## What you now know

- Scope asks where a name is visible; lifetime asks how long the value survives. Closures
  are both answers at once.
- Lexical scoping resolves names outward through enclosing text, not up the call stack —
  which is what makes a function readable alone.
- A closure captures *bindings*, not snapshots, so it sees later changes.
- `var` is function-scoped and initialised on hoist; `let`/`const` are block-scoped with a
  temporal dead zone.
- `let` in a loop creates a binding per iteration. The pre-2015 IIFE did this by hand.
- Arrow functions close over `this` lexically; regular functions take it from the call.
- A closure retains its whole captured scope — capture what you need, not where you are.
