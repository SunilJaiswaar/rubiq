---
title: Functions
summary: The unit of reuse, the unit of testing, and the unit of naming. What makes one good is mostly what it refuses to do.
level: beginner
minutes: 13
status: stable
last_reviewed: "2026-10-07"
tags: [fundamentals, functions, purity]
concepts: [functions, pure-functions, side-effects]
prerequisites: [variables, conditionals]
interview:
  - question: What is a pure function and why would you prefer one?
    level: basic
    answer: >-
      A pure function returns the same output for the same input and has no observable
      side effects — it does not write to anything outside itself, perform I/O, or read
      mutable external state. The practical benefits: it is testable without any setup,
      because the input is the whole world it sees; it is safe to cache, retry and run in
      parallel; and when it is wrong you only have to read the function. The constraint is
      that a purely pure program does nothing useful, so the goal is to push I/O to the
      edges and keep the decision-making pure.
    followUps:
      - "Is a function that reads a constant still pure?"
      - "Where do the side effects go, if not in the function?"
  - question: What is the difference between a parameter and an argument?
    level: beginner
    answer: >-
      A parameter is the name in the declaration — the slot. An argument is the value
      passed at the call site. `function f(x)` declares a parameter `x`; `f(5)` passes the
      argument `5`. The distinction matters when talking about defaults and arity: the
      arity is the number of parameters, and whether an argument was passed at all is what
      a default parameter tests.
resources:
  - title: "MDN — Functions"
    url: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Functions
---

## What problem a function solves

Not "reuse". Reuse is a happy consequence.

```javascript runnable
// Inline: the reader must work out what this computes before they can judge it.
const subtotal = 100 * 3;
const withTax = subtotal + subtotal * 0.18;
const withShipping = withTax + (withTax > 500 ? 0 : 50);
console.log(withShipping);
```

```javascript runnable
// Named: the reader can decide whether to look inside.
const subtotal = (price, qty) => price * qty;
const withTax = (amount, rate = 0.18) => amount + amount * rate;
const withShipping = (amount, freeOver = 500) => amount + (amount > freeOver ? 0 : 50);

console.log(withShipping(withTax(subtotal(100, 3))));
```

:::problem
A program of any size is too large to hold in your head at once. The only defence is to be
able to **stop reading** — to see a name, trust it, and move on.

That requires the named thing to have a boundary you can trust: a clear input, a clear
output, and no surprises in between. A function is that boundary. "Avoiding duplication" is
a side benefit; the primary job is letting a reader skip something.
:::

:::what
A **function** is a named, parameterised block with an input and an output. A **pure**
function depends only on its arguments and affects nothing outside itself.
:::

:::why
The boundary is only trustworthy if the function keeps its promises. Two promises make the
difference:

1. **Same input, same output.** If a function can return different things for the same
   arguments, you cannot reason about a call site without knowing the rest of the program.
2. **No surprises.** If it also writes a file, mutates its argument or increments a
   counter, the name was a lie and you have to read it anyway.

A function that keeps both is **pure**, and purity is what makes the "stop reading"
property real.
:::

## Pure, and not

```javascript runnable
// Pure: input in, value out, nothing touched.
const taxOn = (amount, rate) => amount * rate;
console.log(taxOn(100, 0.18), taxOn(100, 0.18));   // identical, always

// Impure: reads mutable external state. Same arguments, different answers.
let currentRate = 0.18;
const taxOnImpure = (amount) => amount * currentRate;
console.log(taxOnImpure(100));
currentRate = 0.28;
console.log(taxOnImpure(100));   // changed, and the call site looks the same

// Impure: mutates its argument. The caller's data is now different.
const addTaxBad = (order) => { order.total *= 1.18; return order; };
const myOrder = { total: 100 };
addTaxBad(myOrder);
console.log("caller's order was modified:", myOrder);

// Pure version: returns a new value.
const addTaxGood = (order) => ({ ...order, total: order.total * 1.18 });
const o = { total: 100 };
console.log(addTaxGood(o), "original intact:", o);
```

:::how
Purity buys you specific, mechanical properties:

```text
  PURE                                      IMPURE
  ────                                      ──────
  Test with no setup.                       Needs a database, a clock, a mock.
  f(x) === f(x), so cacheable.              Caching changes behaviour.
  Safe to retry on failure.                 Retrying may double-charge someone.
  Safe to run in parallel.                  Shared state means races.
  To debug: read the function.              To debug: read the program.
```

The caching one is worth seeing, because it only works for pure functions:

```javascript runnable
function memoize(fn) {
  const cache = new Map();
  return (...args) => {
    const key = JSON.stringify(args);
    if (!cache.has(key)) cache.set(key, fn(...args));
    return cache.get(key);
  };
}

let calls = 0;
const slowSquare = (n) => { calls++; return n * n; };
const fast = memoize(slowSquare);

console.log(fast(9), fast(9), fast(9), "— underlying calls:", calls);
```

Memoising `taxOnImpure` would be a bug: it would return the old rate forever. The cache is
only correct because the function promised the same output for the same input.
:::

## Pushing effects to the edge

A program with no side effects does nothing. The goal is not to eliminate them but to
**separate deciding from doing**.

```javascript runnable
// Everything tangled: decisions and effects in one function.
function processOrderTangled(id) {
  // (pretend) const order = db.find(id)
  const order = { id, total: 100, country: "IN" };
  const rate = order.country === "IN" ? 0.18 : 0.0;
  order.total += order.total * rate;
  // db.save(order); emailCustomer(order);
  console.log("tangled → saved and emailed", order.total);
}

// Separated: a pure core that decides, a thin shell that acts.
const rateFor = (country) => (country === "IN" ? 0.18 : 0);
const priceOrder = (order) => ({ ...order, total: order.total * (1 + rateFor(order.country)) });

function processOrderClean(order, save, notify) {
  const priced = priceOrder(order);     // pure: all the thinking
  save(priced);                         // effects: injected, so testable
  notify(priced);
  return priced;
}

const saved = [];
processOrderClean({ id: 1, total: 100, country: "IN" },
  (o) => saved.push(o), () => {});
console.log("clean → priced to", saved[0].total, "with no database in sight");

// And the pure core needs no setup at all to test:
console.log("rateFor('IN') =", rateFor("IN"), "| rateFor('US') =", rateFor("US"));
console.log("priceOrder is pure:", JSON.stringify(priceOrder({ total: 100, country: "IN" })));
```

:::realworld
This shape has names in several communities and they all describe the same move:

- **Functional core, imperative shell** — the pure logic in the middle, I/O at the rim.
- **Hexagonal / ports and adapters** — the domain knows nothing about the database.
- **Dependency injection** — pass the effectful collaborators in, as `save` and `notify`
  above, so a test can pass fakes.

The practical test for whether you have done it: *can you test the interesting logic
without a database, a network, or a clock?* If pricing needs a running Postgres, the
pricing rules are tangled with storage.
:::

:::mistakes
**Doing two things, signalled by "and" in the name.** `validateAndSave`, `getUserAndLog`,
`parseAndStore`. Each is two functions wearing one name, and the caller can never want
exactly half of it.

**A default parameter evaluated once.** This is a famous trap in Python and it catches
people in JavaScript for the opposite reason:

```javascript runnable
// JavaScript: the default is re-evaluated on every call. Usually what you want.
function addJs(item, list = []) { list.push(item); return list; }
console.log(addJs("a"), addJs("b"));        // ["a"] ["b"] — independent
```

```python
# Python: the default is evaluated ONCE, at definition time. Shared forever.
def add_py(item, lst=[]):
    lst.append(item)
    return lst

add_py("a")   # ['a']
add_py("b")   # ['a', 'b']  ← the same list
# The fix:  def add_py(item, lst=None):  lst = [] if lst is None else lst
```

Same-looking syntax, opposite semantics. Worth knowing which language you are in.

**Too many parameters.** Past three, callers start passing them in the wrong order and the
compiler cannot help if the types match.

```javascript runnable
// Positional: what is `true, false, true`? The caller cannot tell and neither can you.
function createUserBad(name, email, isAdmin, sendEmail, verified) { /* ... */ }

// Named via an object: self-documenting, order-independent, extensible.
function createUser({ name, email, isAdmin = false, sendEmail = true, verified = false }) {
  return { name, email, isAdmin, sendEmail, verified };
}
console.log(createUser({ name: "Asha", email: "a@b.c", isAdmin: true }));
```

**Boolean parameters that select behaviour.** `render(data, true)` — true what? If a flag
chooses between two behaviours, that is usually two functions.
:::

:::tradeoffs
**Small pure functions.** Easy to test, name, reuse and reason about. Cost: more names to
invent, more indirection to follow, and a reader jumping between six three-line functions
may understand less than one twenty-line function would have told them.

**Larger functions with effects inline.** The whole story is in one place. Cost: untestable
without setup, unsafe to retry, and you must read all of it to trust any of it.

The failure mode at each extreme is real. Over-decomposition produces codebases where
every function is trivially correct and nobody can find where the work happens. The useful
heuristic is not line count but **whether the name is honest**: if you cannot name it
without "and", it is doing too much; if the name just restates the single line inside,
it is doing too little.
:::

:::debugging
When a function misbehaves, purity tells you where to look:

1. **Is it pure?** Then the bug is inside it, and the arguments reproduce it exactly.
   Write the failing call as a test and you are done hunting.
2. **Is it impure?** Then list what it reads and writes beyond its arguments — globals, a
   clock, a database, its own arguments. Each is a candidate.

```javascript runnable
// Making an impure function testable by injecting the impure part.
const isExpiredHard = (token) => token.expiresAt < Date.now();   // reads the clock
const isExpired = (token, now = Date.now()) => token.expiresAt < now;

console.log(isExpired({ expiresAt: 1000 }, 999));    // deterministic
console.log(isExpired({ expiresAt: 1000 }, 1001));
```

A default argument for the clock is the cheapest testability change available: callers are
unaffected, tests get determinism.
:::

:::checkpoint
Classify each as pure or impure, and for the impure ones say what single change would make
it pure:

```javascript
const a = (x, y) => x + y;
const b = (list) => list.sort();
const c = () => Date.now();
const d = (user) => `Hello, ${user.name}`;
const e = (n) => { console.log(n); return n * 2; };
const f = (arr) => [...arr].sort();
let total = 0;
const g = (n) => { total += n; return total; };
```

Then: one of these is pure but still a poor function to depend on in a test. Which, and
why?
:::

:::interview
"What is a pure function" is a vocabulary check. The question underneath is whether you
know what it is *for*.

So answer with the consequences: *"same input, same output, no side effects — which means
I can test it with no setup, cache it, retry it safely, and when it is wrong I only have
to read the function."* Then the part that shows judgement: *"a fully pure program does
nothing, so the goal is separating deciding from doing. The pricing rules are pure; the
save and the email are injected. The test for whether I have managed it is whether I can
test the interesting logic without a database or a clock."*

If asked about function size, resist a number. *"I do not have a line limit — I have a
naming test. If the honest name needs 'and', it is two functions. If the name just
restates the one line inside, it should not be a function."*
:::

## What you now know

- A function's primary job is letting a reader stop reading — reuse is a side benefit.
- That only works if the name is honest, which is what purity enforces.
- Pure means same input/same output and no side effects; it buys testability, caching,
  safe retries and parallelism.
- Separate deciding from doing: pure core, effects injected at the edges.
- `and` in a function name means two functions.
- Default parameters are re-evaluated per call in JavaScript and once at definition in
  Python.
- Past three parameters, use a named object; boolean flags that select behaviour are
  usually two functions.
