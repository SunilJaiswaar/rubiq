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

```javascript runnable
// Without a conditional, this is all a program can be: a fixed sequence.
console.log("open file");
console.log("read it");
console.log("close it");
// Every input produces identical behaviour. Useless for anything real.
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

```javascript runnable
const values = [false, 0, -0, 0n, "", null, undefined, NaN,
                "0", "false", [], {}, " ", -1];

for (const v of values) {
  const label = typeof v === "string" ? JSON.stringify(v) : String(v);
  console.log(`${label.padEnd(12)} → ${v ? "truthy" : "falsy"}`);
}
```

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

```javascript runnable
function describe(count) {
  if (!count) return "no data";          // 0 is falsy, so 0 items → "no data"
  return `${count} items`;
}
console.log(describe(5));
console.log(describe(0));        // "no data" — but 0 IS the data
console.log(describe(undefined));

function describeFixed(count) {
  if (count === undefined || count === null) return "no data";
  return `${count} items`;
}
console.log(describeFixed(0));   // "0 items" — correct
```

The same bug with a default:

```javascript runnable
const settings = { volume: 0, retries: 0 };

console.log("|| :", settings.volume || 50);   // 50 — overrides a deliberate 0
console.log("?? :", settings.volume ?? 50);   // 0  — only defaults on null/undefined
```

**`||` defaults on any falsy value. `??` defaults only on `null` and `undefined`.** For
numeric and string settings, `??` is almost always the one you want. This is why `??`
exists at all.

**Empty-array checks.**

```javascript runnable
const items = [];
if (items) console.log("JS: an empty array is truthy, so this runs");
if (items.length === 0) console.log("say what you mean:", "it is empty");
```

**Chained comparisons that do not mean what they read as.**

```javascript runnable
const age = 25;
console.log("1 < age < 10  →", 1 < age < 10);   // true?!
// (1 < 25) → true → (true < 10) → (1 < 10) → true
console.log("explicit     →", 1 < age && age < 10);
```

Python allows `1 < age < 10` and means it. JavaScript, C, Java and most others evaluate
left to right and coerce the intermediate boolean. Write the `&&`.
:::

## Short-circuiting

```javascript runnable
function sideEffect(label) {
  console.log("  evaluated:", label);
  return true;
}

console.log("false && sideEffect():");
false && sideEffect("right of &&");     // never runs

console.log("true || sideEffect():");
true || sideEffect("right of ||");      // never runs

console.log("true && sideEffect():");
true && sideEffect("right of &&");      // runs
```

:::how
The evaluation rule is: stop as soon as the answer is determined.

```text
  a && b     if a is falsy, the result is a. b is never evaluated.
  a || b     if a is truthy, the result is a. b is never evaluated.
  a ?? b     if a is null or undefined, evaluate b. Otherwise a.

  Note the return VALUE is the operand, not a boolean:
```

```javascript runnable
console.log('"" || "default"   →', "" || "default");      // "default"
console.log('"hi" || "default" →', "hi" || "default");    // "hi" — not `true`
console.log('0 && "never"      →', 0 && "never");         // 0 — not `false`
```

That is what makes `user && user.name` work as a guard: the expression evaluates to
`undefined` rather than throwing.
:::

:::failure
**Short-circuiting hides work you meant to do.**

```javascript runnable
let auditCalls = 0;
function audit(action) { auditCalls++; return true; }

function deleteItem(user, item) {
  // BUG: if the user is not an admin, the audit never happens.
  if (user.isAdmin && audit("delete")) {
    return "deleted";
  }
  return "denied";
}

deleteItem({ isAdmin: false }, {});
deleteItem({ isAdmin: true }, {});
console.log("audit entries:", auditCalls, "— should be 2, both attempts matter");
```

The rule: **never put something you need to happen on the right-hand side of `&&` or
`||`.** Side effects belong on their own line.

**Optional chaining hides the cause, not just the symptom.**

```javascript runnable
const response = { data: null };
console.log(response.data?.user?.name);   // undefined — no crash

// Which is fine if "absent" is expected, and a disaster if it is not:
// the request failed, and you now have `undefined` flowing downstream
// instead of an error at the point of failure.
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

```javascript
if ([]) console.log("A");
if ("0") console.log("B");
if (0) console.log("C");
console.log(0 || "fallback");
console.log(0 ?? "fallback");
console.log(null || 0 || "" || "last");
console.log([] == false);
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
