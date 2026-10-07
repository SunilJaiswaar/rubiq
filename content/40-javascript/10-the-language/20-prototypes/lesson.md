---
title: Prototypes, classes and coercion
summary: What `class` compiles to, why `[] + {}` is a string, and the two rules that make coercion predictable instead of folklore.
level: intermediate
minutes: 18
version: "ES2024"
status: stable
last_reviewed: "2026-10-07"
tags: [javascript, prototypes, classes, coercion, equality]
concepts: [prototypes, prototype-chain, coercion, equality]
prerequisites: [objects, this-binding]
interview:
  - question: What is the prototype chain?
    level: intermediate
    answer: >-
      Every object has an internal link to another object, its prototype. A property lookup that
      fails on the object itself follows that link, and keeps following until it finds the
      property or reaches null. That chain is how inheritance works, and it means methods are
      stored once on the prototype rather than per instance. `class` is syntax over this: the
      methods go on `Constructor.prototype`, and `extends` sets that prototype's own prototype.
      The practical consequence is that adding a method to a prototype affects every existing
      instance immediately, because instances hold a reference rather than a copy.
    followUps:
      - "So what is the difference between `__proto__` and `prototype`?"
  - question: Why is `[] + {}` a string and `{} + []` sometimes zero?
    level: intermediate
    answer: >-
      `+` with a non-primitive operand calls `ToPrimitive` on both, and for `+` the preferred
      hint is "default", which tries `valueOf` and then `toString`. An array's `valueOf` returns
      the array, so `toString` is used and gives `""`; a plain object gives `"[object Object]"`.
      So the concatenation is `"" + "[object Object]"`. The `{} + []` case returning 0 is not an
      operator rule at all — at the start of a statement, `{}` parses as an empty block, so what
      is evaluated is unary `+[]`, which is 0. It is a parsing quirk masquerading as a coercion
      quirk, which is why it only happens in a REPL.
    followUps:
      - "What makes `==` unpredictable, and what do you use instead?"
  - question: When would you use `Object.create` rather than a class?
    level: advanced
    answer: >-
      When you want to set a prototype explicitly without a constructor — building an object that
      delegates to another, creating an object with no prototype at all for use as a dictionary,
      or implementing a mixin. `Object.create(null)` in particular is the standard fix for using
      an object as a map, because without a prototype there is no inherited `constructor`,
      `toString` or `hasOwnProperty` for a user-supplied key to collide with. In most application
      code a `class` or a `Map` is clearer; `Object.create` is for the cases where you are
      manipulating the chain deliberately.
    followUps:
      - "Why would a key named `constructor` cause a problem?"
resources:
  - title: "MDN — Inheritance and the prototype chain"
    url: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Inheritance_and_the_prototype_chain
---

## `class` is syntax

```js
class Animal {
  constructor(name) { this.name = name; }
  speak() { return `${this.name} makes a sound`; }
}
class Dog extends Animal {
  speak() { return `${this.name} barks`; }
}

// What that is, underneath:
Object.getPrototypeOf(new Dog("Rex")) === Dog.prototype;        // true
Object.getPrototypeOf(Dog.prototype) === Animal.prototype;      // true
Object.getPrototypeOf(Animal.prototype) === Object.prototype;   // true
Object.getPrototypeOf(Object.prototype) === null;               // the end

// And methods live on the prototype, not the instance:
Object.keys(new Dog("Rex"));                    // ["name"] — just data
Dog.prototype.hasOwnProperty("speak");          // true
```

:::what
A **prototype** is an object that another object delegates failed property lookups to. The
**prototype chain** is the sequence of those links, ending at `null`. **Coercion** is the
implicit conversion of a value to another type, governed by `ToPrimitive` and the operator's
rules.
:::

:::why
Prototypes exist because JavaScript was designed in ten days around one idea: objects
delegating to objects, with no separate notion of a class.

Delegation rather than copying has a real consequence. Patch a prototype and every existing
instance sees the change immediately, because instances hold a link rather than a copy. That is
what made polyfills possible — adding `Array.prototype.includes` on an old engine made it work
on arrays that already existed — and it is the same mechanism that makes prototype pollution a
security issue.

`class` arrived in ES2015 not to replace that model but to stop everyone writing it by hand.
The pre-class idiom was five lines of `Child.prototype = Object.create(Parent.prototype)` plus
restoring `constructor`, and getting it subtly wrong was routine. `class` is the same machinery
with a syntax that cannot be miswired — which is worth knowing because it means `class` has no
new capability to learn, only a clearer spelling.

Coercion has a less flattering explanation. `==` and implicit conversion exist because the
language was meant to be forgiving for people pasting small scripts into web pages, and the
rules accumulated rather than being designed. The useful response is not to memorise the table:
it is to use `===`, to convert explicitly, and to know the two or three places where coercion
is unavoidable.
:::

:::how
```text
  PROPERTY LOOKUP

    dog.speak()

    1. own properties of dog?            no
    2. Dog.prototype?                    yes → call it
       (3. Animal.prototype)
       (4. Object.prototype)
       (5. null → undefined)

  __proto__ vs prototype — the confusing pair

    instance.__proto__  → the object this instance delegates to
                          (modern spelling: Object.getPrototypeOf)
    Function.prototype  → the object instances of this function will
                          delegate to

    So:  new Dog().__proto__ === Dog.prototype

    `prototype` is a property on constructors. `__proto__` is the
    link on every object. They are not the same thing and the
    naming is simply unfortunate.

  ToPrimitive — the whole of coercion in one rule

    When an object meets a primitive operator:

      hint "number"  → valueOf, then toString
      hint "string"  → toString, then valueOf
      hint "default" → valueOf, then toString   (used by +, ==)

      [].valueOf()     → []        (still an object, so continue)
      [].toString()    → ""
      ({}).toString()  → "[object Object]"

    [] + {}  →  "" + "[object Object]"  →  "[object Object]"

  WHY + IS THE ODD ONE OUT

    + is both numeric addition and string concatenation, so it
    cannot pick a hint: if EITHER side becomes a string, it
    concatenates.

      1 + "2"    → "12"       concatenation
      1 - "2"    → -1         - is numeric only, so "2" → 2
      "3" * "4"  → 12         same

    Every other arithmetic operator is unambiguous, which is why
    only + surprises people.

  == vs ===

    == applies conversions:
      "1" == 1        true
      null == undefined  true   (and nothing else)
      [] == false     true      ([] → "" → 0, false → 0)
      "" == 0         true
      NaN == NaN      false

    === compares type then value, with two exceptions worth knowing:
      NaN === NaN     false     (use Number.isNaN)
      0 === -0        true      (use Object.is to distinguish)
```
:::

:::example
```js
// 1. Prototypes without classes — delegation, explicitly.
const canSpeak = {
  speak() { return `${this.name} speaks`; },
};
const dog = Object.create(canSpeak);
dog.name = "Rex";
dog.speak();                      // "Rex speaks"
// `dog` has one own property. The method is borrowed.

// 2. Object.create(null) for a dictionary — the correct fix for
//    prototype collisions.
const counts = Object.create(null);
counts["constructor"] = 1;        // just a key, nothing inherited
"toString" in counts;             // false

const broken = {};
broken["constructor"];            // Object — a FUNCTION, not undefined
if (broken["toString"]) { }       // truthy for a key never set
// A `Map` is usually the better answer in modern code, since it also
// accepts non-string keys and has a real `size`.

// 3. Explicit conversion, which is what to write instead of relying
//    on coercion.
Number("42");          // 42
Number("");            // 0      ← worth knowing
Number("abc");         // NaN
parseInt("42px", 10);  // 42     ← stops at the first non-digit
Number("42px");        // NaN    ← stricter, usually what you want
String(42);            // "42"
Boolean("");           // false
// The falsy values, in full: false, 0, -0, 0n, "", null, undefined, NaN.
// Everything else is truthy — including "0", "false", [] and {}.

// 4. Instance checks and their failure modes.
dog instanceof Dog;                    // walks the prototype chain
Array.isArray(x);                      // works across realms (iframes)
x instanceof Array;                    // FALSE for an array from an
                                       // iframe — different Array
Object.prototype.toString.call(x);     // "[object Array]" — the old
                                       // reliable type check
typeof null;                           // "object" — a famous bug,
                                       // kept for compatibility
```
:::

:::failure
**Prototype pollution.** The security consequence of delegation being live:

```js
// A naive deep merge, as found in many utility libraries.
function merge(target, source) {
  for (const key in source) {
    if (typeof source[key] === "object") {
      target[key] = merge(target[key] ?? {}, source[key]);
    } else {
      target[key] = source[key];
    }
  }
  return target;
}

merge({}, JSON.parse('{"__proto__": {"isAdmin": true}}'));
// Now EVERY object in the program has isAdmin === true, because
// Object.prototype was modified and every object delegates to it.
({}).isAdmin;     // true

// The fix: refuse the dangerous keys.
const BLOCKED = new Set(["__proto__", "constructor", "prototype"]);
if (BLOCKED.has(key)) continue;
// Or use Object.create(null) targets, or a Map, or structuredClone.
```

This has been a real CVE in lodash, jQuery and many smaller packages. It is the same hazard as
the search-index collision from the build pipeline, with authentication attached.

**A mutable object as a prototype default.**

```js
function Thing() {}
Thing.prototype.tags = [];          // ONE array, shared by all instances
const a = new Thing(), b = new Thing();
a.tags.push("x");
b.tags;                              // ["x"]
// Initialise mutable state in the constructor or as a class field.
```

**`for...in` including inherited keys.**

```js
for (const k in obj) { }             // includes enumerable inherited props
for (const k of Object.keys(obj)) { }  // own enumerable only
// `for...in` on an array also gives you string indices and any
// enumerable properties someone added to Array.prototype.
```

**Arrow functions as class fields where a prototype method was wanted.** They are per instance
and not on the prototype, so a subclass cannot override them in the usual way and every instance
pays for its own function object.

**`==` with anything unusual.**

```js
[] == false;        // true
[0] == false;       // true
"\n" == 0;          // true — whitespace strings become 0
null == 0;          // FALSE — null only equals undefined
// Use ===. The only defensible `==` is `x == null` to test for
// null-or-undefined, and `x ?? y` now covers that case better.
```

**`parseInt` without a radix.** Historically `parseInt("08")` was 0 in some engines. Always pass
10.

**`typeof` for anything but primitives.** `typeof []` is `"object"`, `typeof null` is
`"object"`, and `typeof function(){}` is `"function"`. Use `Array.isArray`, `x === null`, and
`instanceof` or duck typing for the rest.
:::

:::realworld
```js
// 1. Why class fields and prototype methods differ in practice.
class Component {
  handleClick = () => {};     // per instance; stable reference; bound
  render() {}                  // on the prototype; shared; needs binding
}
// 10,000 components: 10,000 handleClick functions, 1 render.
// The arrow is right when you pass it as a callback and need the
// reference to be stable (React memoisation); the prototype method
// is right for everything else.

// 2. Mixins, which are prototype manipulation with a nicer face.
const Serialisable = (Base) => class extends Base {
  toJSON() { return { ...this }; }
};
const Timestamped = (Base) => class extends Base {
  touch() { this.updatedAt = new Date(); }
};
class Model {}
class User extends Serialisable(Timestamped(Model)) {}
// Each mixin inserts a link in the prototype chain, so `super` works
// through them and method resolution order is the chain order.

// 3. The coercion you cannot avoid, and how to handle it.
//    Template literals and string concatenation always coerce:
`Total: ${amount}`              // amount.toString()
// So define toString on value objects that will be interpolated:
class Money {
  constructor(cents) { this.cents = cents; }
  toString() { return `₹${(this.cents / 100).toFixed(2)}`; }
  toJSON() { return this.cents; }      // and control serialisation
  valueOf() { return this.cents; }     // and arithmetic, if you want it
}
`${new Money(12345)}`           // "₹123.45"
JSON.stringify(new Money(100)); // "100"
// Defining these three explicitly is how you stop coercion being
// something that happens to you.
```

```text
// The practical rules this reduces to:
//
//   1. `===` always. The one `==` worth using is `== null`, and `??`
//      has largely replaced it.
//   2. Convert explicitly: Number(), String(), Boolean().
//   3. Object.keys / entries, not for...in.
//   4. Object.create(null) or Map for dictionaries with untrusted keys.
//   5. Array.isArray, not instanceof Array.
//   6. Never assign to a prototype you do not own.
//   7. Define toString / toJSON / valueOf on value objects, so
//      coercion is something you specified.
```
:::

:::mistakes
**Thinking `class` adds a new object model.** It is syntax over prototypes.

**Confusing `prototype` and `__proto__`.** One is a property of constructors, one is the link on
every object.

**Mutable prototype defaults.** Shared between every instance.

**`for...in` for own properties.** Use `Object.keys`.

**`==`.** Use `===` and explicit conversion.

**`parseInt` without a radix.**

**`typeof` for arrays or null.**

**Merging untrusted objects without blocking `__proto__`.** Prototype pollution.

**Patching built-in prototypes.** Breaks other code and future language versions.

**Arrow class fields by default.** Per instance, not overridable in the normal way.
:::

:::tradeoffs
**`class`** — familiar, cannot be miswired, supports `extends`, `super`, `#private` and static
members. The default.

**`Object.create` and factory functions** — explicit control over the chain and closure-based
privacy, at the cost of no prototype sharing for closure-held functions and less familiar code.
Right for mixins and for prototype-less dictionaries.

**`Object.create(null)`** — a dictionary with no inherited keys, so no collision hazard, and it
has no `toString`, so it is awkward to debug and some library code will choke on it.

**`Map`** — real keys of any type, a `size`, guaranteed insertion order and no prototype
collisions. The right default for a dictionary; costs you JSON serialisation and object literal
syntax.

**Coercion** — concise, and it will eventually surprise someone reading the code. Explicit
conversion is two more characters and removes a class of bug.

**`==`** — nothing to recommend it except `== null`, and `??` covers that.

The summary that holds: **prototypes are the model and `class` is the spelling; `===` and
explicit conversion remove almost all coercion problems; and anything acting as a dictionary over
untrusted keys should be a `Map` or have a null prototype.**
:::

:::checkpoint
1. Where do `class` methods actually live, and what does `Object.keys(instance)` return?
2. Explain `[] + {}` using `ToPrimitive`. Why is `{} + []` different, and why only in a REPL?
3. Why does `+` surprise people when `-` and `*` do not?
4. `Thing.prototype.tags = []` — what breaks, and what is the fix?
5. How does prototype pollution work, and name two defences.
6. Why is `x instanceof Array` unreliable? What do you use?
7. List the eight falsy values. Is `"0"` one of them?
8. What do `toString`, `toJSON` and `valueOf` each control?
:::

:::interview
Say what `class` is before describing it, because that framing is the answer:

*"`class` is syntax over prototypes — it adds no new object model. The methods go on
`Constructor.prototype` and `extends` links one prototype to another, so a property lookup that
misses on the instance walks the chain until it hits `null`. The consequence worth naming is that
delegation is live: patching a prototype affects every existing instance, because instances hold a
link rather than a copy. That is what made polyfills work, and it is also why prototype pollution
is a vulnerability."*

For coercion, give the mechanism rather than the table:

*"It is one rule: `ToPrimitive` with a hint. `+` uses the default hint, which tries `valueOf` and
then `toString`, so `[] + {}` is `""` plus `"[object Object]"`. And `+` is the only arithmetic
operator that surprises people because it is overloaded — if either side becomes a string it
concatenates, whereas `-` and `*` are numeric only and coerce cleanly. `{} + []` being 0 is not a
coercion rule at all: at the start of a statement `{}` parses as a block, so you are evaluating
unary `+[]`. It is a parsing quirk, which is why it only happens in a REPL."*

Then be practical, since that is what the question is for:

*"In practice I use `===` always — the only defensible `==` is `== null`, and `??` has replaced
that — convert explicitly with `Number()` and `String()`, and use `Object.keys` rather than
`for...in` so inherited keys do not appear. For anything acting as a dictionary over keys I do not
control, a `Map` or `Object.create(null)`, because `obj['constructor']` on a plain object returns
a function rather than `undefined`."*
:::

## What you now know

- `class` is syntax over prototypes; methods live on `Constructor.prototype`.
- A failed property lookup walks the prototype chain until `null`.
- Delegation is live: patching a prototype affects existing instances immediately.
- `prototype` is a property of constructors; `__proto__` is the link on every object.
- Coercion is `ToPrimitive` with a hint: `valueOf` then `toString`, or the reverse for strings.
- `+` is overloaded, so if either side becomes a string it concatenates. Other operators are
  numeric.
- `{} + []` being 0 is a parsing quirk, not a coercion rule.
- `==` applies conversions; `null == undefined` and nothing else. Use `===`.
- `NaN === NaN` is false and `0 === -0` is true; use `Number.isNaN` and `Object.is`.
- A mutable value on a prototype is shared by every instance.
- `for...in` includes inherited enumerable keys; use `Object.keys`.
- Prototype pollution comes from merging untrusted keys — block `__proto__` and `constructor`.
- `Object.create(null)` or `Map` for dictionaries with untrusted keys.
- `Array.isArray`, not `instanceof Array`, which fails across realms.
- Define `toString`, `toJSON` and `valueOf` so coercion is something you specified.
