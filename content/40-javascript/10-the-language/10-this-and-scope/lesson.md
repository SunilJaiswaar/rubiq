---
title: this, scope and closures
summary: Why `this` depends on how a function is called rather than where it was written, and the four rules that fully determine it.
level: basic
minutes: 18
version: "ES2024"
status: stable
last_reviewed: "2026-10-07"
tags: [javascript, this, closures, scope, arrow-functions]
concepts: [this-binding, closures, scope, hoisting]
prerequisites: [functions, scope-and-closures]
interview:
  - question: What determines the value of `this` in JavaScript?
    level: basic
    answer: >-
      How the function is *called*, not where it was defined — with one exception. There are
      four rules, in priority order: `new` binds `this` to the new object; an explicit `call`,
      `apply` or `bind` binds it to the given value; a method call binds it to the object before
      the dot; and a plain call binds it to `undefined` in strict mode or the global object
      otherwise. The exception is an arrow function, which has no `this` of its own and closes
      over the `this` of the enclosing scope lexically — which is exactly why arrows fixed the
      callback problem that `bind` and `var self = this` were working around.
    followUps:
      - "So why does passing a method as a callback lose `this`?"
  - question: What is a closure, and what is it actually used for?
    level: basic
    answer: >-
      A function together with the variables it captured from the scope where it was defined,
      kept alive for as long as the function is reachable. It is what makes a callback able to
      refer to the state around it, and it is the mechanism behind private state in a factory
      function, memoisation caches, and partial application. The practical consequence to
      remember is retention: a closure holds a strong reference to what it captured, so a
      handler capturing a large object keeps that object alive as long as the handler is
      registered.
    followUps:
      - "Where does that cause a leak in practice?"
  - question: Why does the classic `var` loop print the same number repeatedly?
    level: basic
    answer: >-
      Because `var` is function-scoped, so all the closures created in the loop capture the same
      single binding — and by the time the callbacks run, that binding holds its final value.
      `let` is block-scoped and the specification creates a fresh binding per iteration, so each
      closure captures a distinct variable. Before `let`, the workaround was an immediately
      invoked function per iteration, which created a new scope by brute force. It is the clearest
      demonstration that closures capture *bindings*, not values.
    followUps:
      - "What does `let` actually create per iteration?"
resources:
  - title: "MDN — Closures"
    url: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Closures
---

## The problem

```js
const counter = {
  count: 0,
  increment() { this.count++; },
};

counter.increment();
counter.count;              // 1 — fine

const inc = counter.increment;
inc();                      // TypeError: Cannot read properties of undefined
// The function is the same function. Only the call changed.

[1, 2, 3].forEach(counter.increment);
// Also broken, for the same reason.
```

:::what
**`this`** is a binding established at call time, determined by the call site. **Scope** is
where a name is visible, determined by where the code is written. A **closure** is a function
plus the bindings it captured from its defining scope.
:::

:::why
`this` works this way because of what JavaScript was trying to be: a language where the same
function could serve as a method on many objects without being bound to any of them.

```js
function describe() { return `${this.name} (${this.type})`; }
const dog = { name: "Rex", type: "dog", describe };
const cat = { name: "Mia", type: "cat", describe };
// One function, two objects. `this` is the parameter that makes it work.
```

Read that way, `this` is an implicit first parameter supplied by the call site — which makes
dynamic binding the obvious design rather than a mistake. The problem is that the implicitness
means it can be supplied wrongly, or not at all, and nothing at the call site warns you.

That is why arrow functions exist. The overwhelmingly common case by 2015 was a callback that
wanted the `this` of the code around it, and the two workarounds — `var self = this` and
`.bind(this)` — were boilerplate for something lexical scope already did correctly for every
other variable. An arrow has no `this` of its own, so the lookup goes outward through scopes
exactly like any other name.

So the rule worth carrying is: **a method needs dynamic `this`, a callback almost never does.**
Write methods with `function` or shorthand syntax, and callbacks as arrows.
:::

:::how
```text
  THE FOUR RULES, in priority order

  1. new Foo()              → this is the newly created object
  2. f.call(obj) /          → this is obj  (bind is permanent,
     f.apply(obj) /            call/apply are for one call)
     f.bind(obj)
  3. obj.f()                → this is obj  ("the object before the dot")
  4. f()                    → undefined in strict mode / modules,
                              globalThis in sloppy mode

  Arrow functions bypass all four: they have no `this` binding at all,
  so `this` resolves through the scope chain like a normal variable.

  WHY THE CALLBACK CASE BREAKS

    const inc = counter.increment;   // rule 3 does not apply any more:
    inc();                           // there is no object before the dot
                                     // → rule 4 → this is undefined

    The function never "had" a `this`. The dot supplied one.

  THE SCOPE CHAIN, by contrast, is lexical

    function outer() {
      const x = 1;
      function inner() { return x; }   // found by walking OUT through
      return inner;                     // the scopes where this code
    }                                    // was WRITTEN
    outer()();   // 1 — even though outer has returned

    `x` survives because `inner` holds a reference to the scope. That
    is the closure.

  CLOSURES CAPTURE BINDINGS, NOT VALUES

    var: one binding for the whole function
      for (var i = 0; i < 3; i++) setTimeout(() => console.log(i));
      → 3, 3, 3        all three closures share one `i`, now 3

    let: a fresh binding per iteration
      for (let i = 0; i < 3; i++) setTimeout(() => console.log(i));
      → 0, 1, 2        three distinct bindings
```
:::

:::example
```js
// 1. The three fixes for a lost `this`, and when each is right.
class Counter {
  count = 0;

  // a. Arrow as a class field: bound per instance, correct in callbacks.
  //    Costs one function per instance rather than one per class.
  increment = () => { this.count++; };

  // b. Ordinary method: shared on the prototype, needs care when passed.
  decrement() { this.count--; }
}

const c = new Counter();
[1, 2, 3].forEach(c.increment);          // works — arrow field
[1, 2, 3].forEach(() => c.decrement());  // works — wrapped in an arrow
[1, 2, 3].forEach(c.decrement.bind(c));  // works — explicitly bound
[1, 2, 3].forEach(c.decrement);          // broken

// 2. Closures for private state — the module pattern, which is still
//    the clearest way to express "nothing outside can touch this".
function makeCounter(start = 0) {
  let count = start;                      // genuinely inaccessible
  return {
    increment: () => ++count,
    get value() { return count; },
  };
}
const counter = makeCounter();
counter.increment();
counter.value;        // 1
counter.count;        // undefined — there is no such property

// 3. Memoisation, which is a closure over a cache.
function memoise(fn) {
  const cache = new Map();
  return (...args) => {
    const key = JSON.stringify(args);     // adequate for primitives only
    if (!cache.has(key)) cache.set(key, fn(...args));
    return cache.get(key);
  };
}
// Note the cache is unbounded. On a long-lived function with varied
// arguments that is a leak, which is the standard mistake with this
// pattern — bound it or use a WeakMap keyed on an object argument.
```
:::

:::failure
**Arrow functions as methods.** They capture the *defining* scope, which for an object literal
is not the object:

```js
const obj = {
  name: "x",
  getName: () => this.name,    // `this` is whatever surrounds the literal,
};                              // usually undefined or window — never obj
obj.getName();                  // undefined
```

**Arrow functions where you need dynamic `this`.** Event handlers and prototype methods both
rely on it:

```js
button.addEventListener("click", function () { this; });  // the element
button.addEventListener("click", () => { this; });        // enclosing scope
// Both are useful. Choosing by habit rather than by need is the bug.
```

**`this` in a nested plain function.**

```js
const obj = {
  items: [1, 2],
  log() {
    this.items.forEach(function (i) {
      console.log(this.items);   // TypeError — plain call, rule 4
    });
  },
};
// Use an arrow for the inner function, or forEach's thisArg parameter.
```

**Assuming closures capture values.** The `var`-in-a-loop case, and its subtler cousin:

```js
let handler;
function setup() {
  let config = loadConfig();
  handler = () => config;        // captures the BINDING
  config = null;                 // so the closure now returns null
}
```

**A closure retaining something large.**

```js
function attach(element) {
  const bigData = new Array(1e7);          // 80 MB
  element.addEventListener("click", () => console.log("clicked"));
  // The handler does not use bigData — but in some engines the whole
  // scope is retained, and more importantly the pattern of capturing
  // a large local in a long-lived handler is a real leak source.
  // Capture only what you need, or null it out explicitly.
}
```

**Hoisting surprises.**

```js
console.log(a);   // undefined — `var a` is hoisted, initialised later
var a = 1;

console.log(b);   // ReferenceError — `let` is hoisted but uninitialised
let b = 1;        // the "temporal dead zone"

foo();            // works — function declarations are fully hoisted
function foo() {}

bar();            // TypeError: bar is not a function
var bar = function () {};
```

The temporal dead zone is a feature, not an inconsistency: it turns a silent `undefined` into an
error that names the problem.
:::

:::realworld
```js
// 1. React hooks are closures, and the stale-closure bug is the most
//    common React mistake.
function Counter() {
  const [count, setCount] = useState(0);

  useEffect(() => {
    const id = setInterval(() => {
      setCount(count + 1);     // STALE: this closure captured count = 0
    }, 1000);                  // forever, because the effect never re-ran
    return () => clearInterval(id);
  }, []);                      // empty deps → the closure is created once

  // Correct: the updater form does not need the captured value.
  useEffect(() => {
    const id = setInterval(() => setCount((c) => c + 1), 1000);
    return () => clearInterval(id);
  }, []);
}
// This is not a React quirk. It is closures behaving exactly as
// specified: the function captured the binding that existed when it
// was created, and `count` is a new binding on every render.

// 2. Debounce — a closure over a timer handle, which is why it works
//    across calls.
function debounce(fn, ms) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
}
// `timer` persists between invocations because the returned arrow
// closes over it. Without the closure you would need a module-level
// variable, which would be shared between every debounced function.

// 3. The loop fix in production code — usually not needed any more,
//    and worth recognising in older code.
for (var i = 0; i < 3; i++) {
  (function (j) { setTimeout(() => console.log(j)); })(i);
}
// The IIFE creates a scope per iteration by brute force. `let` does
// the same thing in the specification, which is why this pattern
// disappeared.
```
:::

:::mistakes
**Arrow functions as object or prototype methods.** They capture the enclosing scope, which is
not the object.

**Arrows where dynamic `this` is wanted.** Event handlers that need `this` as the element.

**Passing a method as a callback unbound.** `obj.method` loses the receiver.

**Assuming closures capture values.** They capture bindings; the value is read when the function
runs.

**Unbounded memoisation caches.** A closure cache lives as long as the function.

**Capturing large objects in long-lived handlers.**

**Relying on `var` hoisting.** Use `const` by default and `let` where reassignment is needed.

**`this` inside a nested plain function.** Arrow, or pass `thisArg`.

**Stale closures in React effects.** Use the updater form, or declare the dependency.
:::

:::tradeoffs
**`function` methods** — dynamic `this`, shared on the prototype, so one function per class
rather than per instance. The correct choice for methods, and they require care when passed as
callbacks.

**Arrow class fields** — bound automatically, so safe to pass anywhere, at the cost of one
function object per instance and not being on the prototype (so not overridable in the usual
way). Worth it for handlers you pass around; wasteful for every method.

**`.bind()`** — explicit and creates a new function each call, so `onClick={this.f.bind(this)}`
in a render path allocates on every render and breaks referential equality for memoised
children. Bind once in the constructor, or use a field.

**Closures for private state** — genuinely inaccessible, and costs a new set of functions per
instance and no prototype sharing. `#private` class fields give privacy with prototype methods,
which is usually the better modern answer.

**`var` versus `let`** — there is no remaining reason to choose `var`. Block scoping and
per-iteration bindings fix real bugs, and the temporal dead zone converts silent `undefined`
into an error.

The rule worth internalising: **`this` is dynamic and lexical scope is static.** Almost every
`this` bug is code expecting the first to behave like the second — and the fix is either an
arrow, which makes it lexical, or an explicit bind, which makes the dynamic value deliberate.
:::

:::checkpoint
1. `const inc = counter.increment; inc()` throws. Which of the four rules applied, and why did
   rule 3 stop applying?
2. Why is an arrow function wrong as an object-literal method?
3. `for (var i...)` versus `for (let i...)` with `setTimeout` — give both outputs and the
   reason.
4. Name three ways to fix a lost `this`, and the cost of each.
5. Why does `console.log(a); var a = 1` print `undefined` while the `let` version throws?
6. In the React interval example, why does `setCount(count + 1)` stay stuck at 1?
7. What does `memoise` leak, and how would you bound it?
:::

:::interview
Answer the `this` question with the rules and then the reason they exist:

*"`this` is determined by the call site, not the definition site. Four rules in priority order:
`new` binds it to the new object, an explicit `call`/`apply`/`bind` binds it to what you pass, a
method call binds it to the object before the dot, and a plain call gives `undefined` in strict
mode. Arrow functions bypass all four — they have no `this` of their own, so it resolves
lexically like any other variable."*

Then explain why that design is defensible, which most answers skip:

*"The reason it is dynamic is that `this` is effectively an implicit first parameter supplied by
the call site, which is what lets one function be a method on many objects. The cost of the
implicitness is that it can be supplied wrongly with no warning — which is exactly what happens
when you pass `obj.method` as a callback. Arrows exist because the common case by 2015 was a
callback that wanted the surrounding `this`, and `var self = this` was boilerplate for something
lexical scope already did right."*

For closures, lead with the binding-not-value point, because it is the one that produces bugs:

*"A closure captures bindings, not values, which is why `var` in a loop prints the final value
three times — all three closures share one binding — and `let` prints 0, 1, 2 because the
specification creates a fresh binding per iteration. The same mechanism is the stale-closure bug
in React: an effect with empty dependencies captures the bindings from the first render and keeps
them forever, so `setCount(count + 1)` is always computing from zero. That is not a React quirk;
it is closures working exactly as specified."*
:::

## What you now know

- `this` is bound by the call site; four rules, in priority order: `new`, explicit bind, method
  call, plain call.
- A plain call gives `undefined` in strict mode and modules.
- Arrow functions have no `this`; it resolves lexically through the scope chain.
- `this` is effectively an implicit parameter, which is why it is dynamic.
- Methods want dynamic `this`; callbacks almost never do.
- Arrows are wrong as object-literal or prototype methods.
- Closures capture bindings, not values — read at call time, not at creation time.
- `var` creates one binding per function; `let` creates one per loop iteration.
- Closures retain what they capture for as long as the function is reachable.
- Unbounded memoisation caches in closures are a leak.
- The temporal dead zone turns a silent `undefined` into a named error.
- The stale-closure bug in React is this mechanism, not a framework quirk.
- `this` is dynamic, scope is static, and most `this` bugs confuse the two.
