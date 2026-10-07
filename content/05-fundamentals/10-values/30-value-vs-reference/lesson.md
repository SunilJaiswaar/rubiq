---
title: Copying, shallow and deep
summary: Why `{...obj}` is not enough, and how to decide how deep a copy needs to be.
level: basic
minutes: 12
status: stable
last_reviewed: "2026-10-07"
tags: [fundamentals, references, copying]
concepts: [shallow-copy, deep-copy, immutability]
prerequisites: [variables, mutability]
interview:
  - question: What is the difference between a shallow and a deep copy?
    level: basic
    answer: >-
      A shallow copy creates a new container whose entries are the *same references* as
      the original's. So the top level is independent, and everything nested is still
      shared. A deep copy recursively copies the nested values too, so nothing is shared.
      Shallow is O(top-level size) and usually what you want; deep is O(total size), can
      be surprisingly expensive, and has to decide what to do about cycles, functions and
      class instances.
    followUps:
      - "When is a shallow copy actually sufficient?"
      - "What does `structuredClone` do that `JSON.parse(JSON.stringify(x))` does not?"
resources:
  - title: "MDN — structuredClone()"
    url: https://developer.mozilla.org/en-US/docs/Web/API/Window/structuredClone
---

## The copy that was not a copy

The previous lesson's rule was "copy at your boundaries". Here is that rule being followed
carefully, and still producing the bug:

```javascript runnable
const defaults = {
  retries: 3,
  timeout: { connect: 1000, read: 5000 },
};

// Carefully making a copy before changing anything.
const config = { ...defaults };
config.retries = 5;
config.timeout.read = 99;

console.log("config.retries   =", config.retries);     // 5
console.log("defaults.retries =", defaults.retries);   // 3  — good, protected
console.log("defaults.timeout =", defaults.timeout);   // read: 99 — NOT protected
```

`retries` was protected. `timeout.read` was not.

:::problem
`{ ...defaults }` builds a new object and copies each of the original's *values* into it.
For `retries` that value is the number 3 — copying it is a real copy. For `timeout` that
value is a *reference to an object*. Copying a reference gives you a second reference to
the same object.

So the copy is genuinely new, one level deep, and genuinely shared below that.
:::

:::what
A **shallow copy** creates a new container holding the same references as the original.
The top level is independent; everything nested is shared.

A **deep copy** recursively copies nested values too, so nothing is shared.
:::

:::why
Shallow is the default everywhere — `{...x}`, `Object.assign`, `Array.prototype.slice`,
Python's `dict.copy()`, Ruby's `dup` — because it is the copy you usually want and it is
cheap. Copying one level costs time proportional to the number of properties. Copying
everything costs time proportional to the whole data structure, and most of the time you
are protecting against a mutation that never happens.

So the languages made the cheap, usually-correct thing the default, and left the expensive,
sometimes-necessary thing to an explicit call. That is the right trade — but it means you
have to know which one you are getting.
:::

:::how
```text
  const config = { ...defaults }

  defaults ──▶ ┌──────────────────────┐
               │ retries: 3           │
               │ timeout: ───────────────┐
               └──────────────────────┘  │
                                         ▼
                                   ┌──────────────────┐
                                   │ connect: 1000    │   ONE object,
                                   │ read:    5000    │   two references
                                   └──────────────────┘
                                         ▲
  config   ──▶ ┌──────────────────────┐  │
               │ retries: 3  (copied) │  │
               │ timeout: ───────────────┘
               └──────────────────────┘

  config.retries = 5        → writes into config's own slot.          Safe.
  config.timeout.read = 99  → follows the shared reference.           Not safe.
```

The rule that falls out: **a shallow copy protects exactly the properties whose values are
primitives.** Numbers, strings, booleans, `null`, `undefined`, symbols and bigints are
copied. Objects, arrays, Maps, Sets, Dates and functions are shared.
:::

## Three ways to copy, and when each is right

```javascript runnable
const original = {
  name: "Asha",
  tags: ["admin", "beta"],
  meta: { createdAt: new Date("2026-01-01"), scores: [1, 2] },
};

// 1. Shallow — one level. Fast. Usually enough.
const shallow = { ...original };

// 2. Deep, via JSON — convenient and lossy.
const viaJson = JSON.parse(JSON.stringify(original));

// 3. Deep, properly.
const deep = structuredClone(original);

original.meta.scores.push(99);

console.log("shallow sees the change:", shallow.meta.scores);  // [1,2,99] — shared
console.log("viaJson  isolated      :", viaJson.meta.scores);  // [1,2]
console.log("deep     isolated      :", deep.meta.scores);     // [1,2]

console.log();
console.log("Date survived structuredClone:", deep.meta.createdAt instanceof Date);
console.log("Date survived JSON round-trip:", viaJson.meta.createdAt instanceof Date);
console.log("  it became:", typeof viaJson.meta.createdAt, JSON.stringify(viaJson.meta.createdAt));
```

:::mistakes
**`JSON.parse(JSON.stringify(x))` is the copy everyone reaches for first, and it is lossy
in ways that produce late, confusing bugs.** It silently changes or discards:

```javascript runnable
const awkward = {
  when: new Date("2026-01-01"),   // → becomes a string
  missing: undefined,              // → key disappears entirely
  fn() { return 1 },               // → disappears entirely
  big: 10n,                        // → throws
  set: new Set([1, 2]),            // → becomes {}
  nan: NaN,                        // → becomes null
  inf: Infinity,                   // → becomes null
};

const { big, ...safe } = awkward;   // BigInt would throw, so drop it first
const round = JSON.parse(JSON.stringify(safe));
console.log(round);
console.log("keys lost:", Object.keys(safe).filter((k) => !(k in round)));
```

A `Date` becoming a string is the one that bites hardest: it works everywhere you only
display it, and fails the first time something calls `.getTime()`.

**It also cannot handle cycles:**

```javascript runnable
const node = { name: "a" };
node.self = node;

try {
  JSON.stringify(node);
} catch (e) {
  console.log("JSON:", e.constructor.name, "—", e.message.split("\n")[0]);
}

const cloned = structuredClone(node);
console.log("structuredClone handled it:", cloned.self === cloned);
```

**`structuredClone` is the right default** — it handles Dates, Maps, Sets, RegExps,
ArrayBuffers, cycles and `undefined` correctly. Its limits are honest ones: it cannot
clone functions, DOM nodes, or class instances (you get a plain object, losing the
prototype).

```javascript runnable
class User { constructor(n) { this.n = n } greet() { return "hi " + this.n } }
const u = new User("Bo");
const c = structuredClone(u);
console.log("data copied  :", c.n);
console.log("still a User :", c instanceof User);     // false — prototype lost
console.log("has greet    :", typeof c.greet);        // undefined
```

For class instances, write a `clone()` method. The language cannot guess what your
invariants are.
:::

:::tradeoffs
| | Cost | Protects | Use when |
|---|---|---|---|
| Shallow (`{...x}`, `[...x]`) | O(width) | Top level only | The nested values are primitives, or you will not mutate them |
| `structuredClone(x)` | O(total size) | Everything it can clone | You need real isolation of plain data |
| `JSON.parse(JSON.stringify(x))` | O(total size) + parse | Everything, lossily | Essentially never, now that `structuredClone` exists |
| Immutable data | O(changed path) | Everything, by construction | The whole codebase opts in |

**A deep copy is not free and is not automatically correct.** Deep-copying a 50,000-row
result set inside a request handler is a measurable cost for protection you probably do
not need. The question is never "shallow or deep?" in the abstract — it is *"which of
these nested values will anything mutate?"*

If the answer is "none", a shallow copy is correct and cheaper. If the answer is "I do not
know", that is usually a sign the data is being shared too widely, and the real fix is
narrowing who can reach it.
:::

:::realworld
The fourth row of that table is how large frontends actually solve this. Rather than
copying defensively, they make mutation impossible and share freely:

```javascript runnable
// Structural sharing: build a new object that reuses every unchanged subtree.
const state = {
  user: { name: "Asha", prefs: { theme: "dark" } },
  posts: [{ id: 1 }, { id: 2 }],
};

const next = {
  ...state,
  user: { ...state.user, prefs: { ...state.user.prefs, theme: "light" } },
};

console.log("theme changed  :", next.user.prefs.theme);
console.log("original intact:", state.user.prefs.theme);
// posts was not touched, so it is REUSED rather than copied:
console.log("posts shared   :", next.posts === state.posts);
```

Only the path to the change is rebuilt; everything else is shared. That is what makes
Redux's "never mutate state" rule practical rather than wasteful, and what makes React's
`===` check on props a valid way to skip a re-render. Immer and Immutable.js automate the
same idea.
:::

:::debugging
When a copy did not protect you:

1. **Find the deepest thing you mutated.** `config.timeout.read = 99` is two levels; the
   copy was one.
2. **Check identity, not equality.** `copy.nested === original.nested` being `true` is the
   proof.
3. **Freeze deeply in development.** A thrown error with a stack trace beats reasoning.

```javascript runnable
function deepFreeze(obj) {
  for (const value of Object.values(obj)) {
    if (value && typeof value === "object") deepFreeze(value);
  }
  return Object.freeze(obj);
}

const frozen = deepFreeze({ a: { b: 1 } });
try {
  "use strict";
  frozen.a.b = 2;
} catch (e) {
  console.log("caught:", e.message);
}
```
:::

:::checkpoint
For each, say whether `original` is affected:

```javascript
const original = { n: 1, list: [1], deep: { x: 1 } };
const copy = { ...original };

copy.n = 2;              // ?
copy.list.push(2);       // ?
copy.list = [9];         // ?
copy.deep.x = 2;         // ?
copy.deep = { x: 9 };    // ?
```

Then: which single one of these five would a shallow copy have needed to be deep to
prevent, and which are safe for a reason that has nothing to do with copy depth?
:::

:::interview
Asked as "what's the difference between shallow and deep copy", the recited answer is fine
and forgettable. What distinguishes a good answer is the follow-through:

*"Shallow copies the top-level values — so it genuinely protects primitives and genuinely
does not protect anything nested. In practice I reach for a shallow copy and ask which
nested values anything will mutate; if none, that is correct and cheap. For real isolation
I use `structuredClone` rather than the JSON round-trip, because JSON turns Dates into
strings, drops `undefined` and functions, and throws on cycles — and a Date that became a
string works until something calls `.getTime()`."*

Then the senior note: *"at scale the answer is usually not to copy at all but to make the
data immutable and share structure, which is what Redux and React's prop comparison
depend on."*
:::

## What you now know

- A shallow copy duplicates the container and shares everything nested.
- It therefore protects primitives and nothing else.
- `JSON.parse(JSON.stringify(x))` loses Dates, `undefined`, functions, Sets and Maps, and
  throws on cycles.
- `structuredClone` is the right deep copy for plain data; it cannot clone functions or
  preserve prototypes.
- Deep copying costs O(total size) — ask which nested values actually get mutated first.
- Immutability plus structural sharing is the scalable answer, and it is why `===` on
  props is a valid optimisation.
