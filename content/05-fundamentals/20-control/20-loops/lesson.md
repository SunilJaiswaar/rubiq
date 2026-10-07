---
title: Loops, and the ones you should not write
summary: Five ways to repeat work, what each one costs, and why the explicit index loop is usually the wrong choice.
level: beginner
minutes: 13
status: stable
last_reviewed: "2026-10-07"
tags: [fundamentals, loops, iteration]
concepts: [loops, iteration, off-by-one]
prerequisites: [conditionals]
interview:
  - question: When would you use a `for` loop over `map` or `filter`?
    level: basic
    answer: >-
      When you need to break out early, when you are producing something other than a
      one-to-one transformation, or when the per-iteration allocation genuinely matters in
      a measured hot path. Otherwise `map`/`filter`/`reduce` say *what* you are doing
      rather than *how*, which means a reader does not have to simulate the loop to find
      out. "I need the index" is usually not a reason — `entries()` and the second
      callback argument both give you one.
    followUps:
      - "What does `map` do that a `for` loop with `push` does not?"
      - "Why is `for...in` over an array a bad idea?"
resources:
  - title: "MDN — Loops and iteration"
    url: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Loops_and_iteration
---

## The same work, five ways

```javascript runnable
const prices = [100, 250, 80];

// 1. Index loop — total manual control, three places to make a mistake.
let a = [];
for (let i = 0; i < prices.length; i++) a.push(prices[i] * 1.2);

// 2. for...of — no index to get wrong.
let b = [];
for (const p of prices) b.push(p * 1.2);

// 3. forEach — a callback per element, no early exit.
let c = [];
prices.forEach((p) => c.push(p * 1.2));

// 4. map — says "one output per input" in the name.
const d = prices.map((p) => p * 1.2);

// 5. reduce — fold many values into one.
const total = prices.reduce((sum, p) => sum + p, 0);

console.log(a, b, c, d, "total:", total);
```

All five produce the same numbers. They are not equivalent.

:::problem
The index loop has three independent places to be wrong — where `i` starts, the condition,
and the increment — and none of them say anything about your intent. A reader has to
simulate it to find out whether it visits every element, skips the last, or runs forever.

The later forms remove the parts you can get wrong, and name the operation.
:::

:::what
A **loop** repeats a block. The distinction that matters is between *imperative* loops,
where you manage the position yourself, and *declarative* iteration, where you describe
the transformation and the language manages the walk.
:::

:::why
`map` is not shorter than `for`. It is **more specific**. `map` can only produce exactly
one output per input: it cannot skip, cannot duplicate, cannot exit early, cannot change
the length. So seeing `map` tells a reader all of that without reading the body.

`for` tells them nothing, which is why it is the right choice precisely when you need to
do something `map` forbids.
:::

:::how
Choosing between them is mechanical once you know what each one promises.

| You want | Use | Why |
|---|---|---|
| One output per input | `map` | Length is guaranteed to match |
| A subset | `filter` | Predicate in, same elements out |
| One value from many | `reduce` | Explicitly a fold |
| Both at once | `flatMap` / `filter().map()` | One pass, or two clear ones |
| Side effects per element | `for...of` | Honest about doing work, allows `break` |
| To stop early | `for...of` + `break`, or `find`/`some` | `forEach` and `map` cannot stop |
| Index and value | `for (const [i, v] of arr.entries())` | No manual counter |
| To build a key-value map | `Object.fromEntries(arr.map(...))` | Says what it builds |

```javascript runnable
const users = [
  { id: 1, name: "Asha", active: true },
  { id: 2, name: "Bo", active: false },
  { id: 3, name: "Cal", active: true },
];

console.log(users.filter((u) => u.active).map((u) => u.name));
console.log(users.find((u) => u.id === 2)?.name);
console.log(users.some((u) => !u.active), users.every((u) => u.id > 0));
console.log(Object.fromEntries(users.map((u) => [u.id, u.name])));

for (const [i, u] of users.entries()) {
  if (!u.active) { console.log(`stopped at index ${i}`); break; }
}
```
:::

:::mistakes
**Off-by-one, in both directions.**

```javascript runnable
const list = ["a", "b", "c"];

for (let i = 0; i <= list.length; i++) {
  // <= instead of < : one iteration too many
  if (list[i] === undefined) { console.log(`i=${i} is past the end`); break; }
}

for (let i = 1; i < list.length; i++) {
  console.log("skipped index 0, got:", list[i]);
}
```

The reason `for...of` is the better default is not elegance — it is that these two bugs
become unwriteable.

**Mutating the array you are iterating.**

```javascript runnable
const nums = [1, 2, 3, 4];
for (let i = 0; i < nums.length; i++) {
  if (nums[i] % 2 === 0) nums.splice(i, 1);   // removing shifts everything left
}
console.log("broken:", nums, "— 4 survived because indices shifted under us");

console.log("correct:", [1, 2, 3, 4].filter((n) => n % 2 !== 0));
```

Removing element `i` moves element `i+1` into position `i`, and then `i++` steps over it.
The fix is never to patch the index — it is to build a new array.

**`forEach` cannot stop, and ignores your `return`.**

```javascript runnable
[1, 2, 3, 4, 5].forEach((n) => {
  if (n === 3) return;         // acts like `continue`, not `break`
  console.log("forEach saw", n);
});
```

There is no `break` in `forEach`, and `return` only ends that one call. If you need to
stop, use `for...of`, or `find`/`some`/`findIndex` which exist precisely to stop early.

**`forEach` with an async callback does not wait.**

```javascript runnable
const delay = (ms, v) => new Promise((r) => setTimeout(() => r(v), ms));

async function broken() {
  const out = [];
  [3, 1, 2].forEach(async (n) => { out.push(await delay(n * 10, n)) });
  return out;              // returns [] — the callbacks have not finished
}

async function correct() {
  const out = [];
  for (const n of [3, 1, 2]) out.push(await delay(n * 10, n));
  return out;              // in order
}

async function parallel() {
  return Promise.all([3, 1, 2].map((n) => delay(n * 10, n)));   // all at once
}

broken().then((r) => console.log("forEach :", r));
correct().then((r) => console.log("for...of:", r));
parallel().then((r) => console.log("Promise.all:", r));
```

`forEach` fires every callback and returns immediately. Use `for...of` with `await` for
sequential work, or `Promise.all(arr.map(...))` for concurrent work. Those are different
things and you should pick on purpose.

**`for...in` over an array.**

```javascript runnable
const arr = ["a", "b"];
arr.extra = "surprise";
for (const k in arr) console.log("for...in :", k, typeof k);    // "0","1","extra" — strings
for (const v of arr) console.log("for...of :", v);              // "a","b"
```

`for...in` enumerates *keys*, as strings, including inherited and non-index properties. It
is for objects. For arrays it is a bug waiting for someone to add a property.
:::

:::internals
**Why the index loop is sometimes still faster, and why that usually does not matter.**

```javascript runnable
const data = Array.from({ length: 2_000_000 }, (_, i) => i);

function timed(label, fn) {
  const t = performance.now();
  const r = fn();
  console.log(`${label.padEnd(22)} ${(performance.now() - t).toFixed(1)}ms  → ${r}`);
}

timed("for (index)", () => { let s = 0; for (let i = 0; i < data.length; i++) s += data[i]; return s });
timed("for...of",    () => { let s = 0; for (const n of data) s += n; return s });
timed("reduce",      () => data.reduce((s, n) => s + n, 0));
timed("map + reduce", () => data.map((n) => n * 1).reduce((s, n) => s + n, 0));
```

The index loop wins because it compiles to a counter and a bounds check. `for...of` goes
through the iterator protocol — an object with a `next()` method returning
`{value, done}` — which is a function call per element that the JIT often but not always
inlines. `reduce` is a function call per element.

Notice the last line: `map` then `reduce` allocates an entire second two-million-element
array to throw away. **That is the cost worth caring about** — not the per-call overhead,
but the intermediate allocation. One combined `reduce`, or a lazy pipeline, avoids it.

The rule: write the clear version; measure before replacing it; and when you do measure,
expect the win to come from removing an allocation rather than from removing a function
call.
:::

:::failure
**An unbounded loop over external data.** The classic incident shape is a `while` whose
exit condition depends on something you do not control.

```javascript runnable
// Pattern: paginate until the API says stop.
let pages = 0;
let cursor = "start";
const MAX_PAGES = 1000;           // the guard that makes this safe

function fakeApi(c) {
  pages++;
  return pages < 5 ? { next: "more" } : { next: null };
}

while (cursor) {
  if (pages >= MAX_PAGES) throw new Error(`Pagination exceeded ${MAX_PAGES} pages`);
  cursor = fakeApi(cursor).next;
}
console.log("finished after", pages, "pages");
```

Without `MAX_PAGES`, an API that always returns a cursor — a bug on their side, or a
cursor that does not advance — turns into an infinite loop holding a database connection.
**Any loop whose termination depends on a remote system needs an explicit bound**, and the
bound should throw rather than break silently, so you find out.
:::

:::tradeoffs
**Declarative (`map`/`filter`/`reduce`).** States intent, cannot be off by one, composes.
Costs an intermediate array per stage and a function call per element. Cannot exit early.

**`for...of`.** Can `break`, no index to get wrong, works on anything iterable including
generators and streams. Slightly slower than an index loop; no free index.

**Index `for`.** Fastest, full control — including control over which mistakes you make.
Worth it for measured hot paths and for algorithms where the index *is* the subject
(binary search, two pointers, in-place swaps).

The honest summary: **the chain is clearer until it allocates something large.** Three
chained passes over 50 elements is free and readable. Three chained passes over five
million is three arrays you did not need.
:::

:::checkpoint
Rewrite each without an index loop, or say why it needs one:

```javascript
// 1
let names = [];
for (let i = 0; i < users.length; i++) names.push(users[i].name);

// 2
for (let i = 0; i < users.length; i++) if (users[i].id === target) return users[i];

// 3
for (let i = 0; i < arr.length - 1; i++) if (arr[i] > arr[i+1]) return false;

// 4
let total = 0;
for (let i = 0; i < items.length; i++) total += items[i].price * items[i].qty;
```

One of those four genuinely wants indices. Which, and what makes it different?
:::

:::interview
"When would you use a `for` loop instead of `map`?" is testing whether you have a reason
or a habit.

A strong answer names the three real cases: **early exit**, **not a one-to-one
transformation**, and **a measured hot path**. Then the part most candidates skip — *"and
'I need the index' usually is not one of them, because `entries()` and `map`'s second
argument both give you one."*

If performance comes up, do not claim `for` is faster and stop. Say where the cost
actually is: *"the per-call overhead is small and the JIT often removes it; the cost that
shows up in profiles is the intermediate array each chained stage allocates. So for large
data I collapse the chain into one `reduce` or make it lazy — not because function calls
are slow, but because I do not want three copies of five million rows."*
:::

## What you now know

- `map`, `filter` and `reduce` are more specific than `for`, which is why they are
  clearer — `map` cannot change the length.
- Index loops have three independent off-by-one opportunities; `for...of` removes them.
- Never mutate the collection you are iterating. Build a new one.
- `forEach` cannot `break` and does not await. Use `for...of` for sequential async,
  `Promise.all(map(...))` for concurrent.
- `for...in` enumerates string keys including inherited ones. Not for arrays.
- Any loop bounded by a remote system needs an explicit maximum that throws.
- The performance cost that matters is the intermediate allocation, not the function call.
