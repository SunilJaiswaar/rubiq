---
title: Types as constraints
summary: Using the type system to make wrong states impossible rather than to annotate what you already wrote — and the handful of features that does most of the work.
level: intermediate
minutes: 19
version: "5.x"
status: stable
last_reviewed: "2026-10-07"
tags: [typescript, types, unions, narrowing, generics]
concepts: [type-narrowing, discriminated-unions, structural-typing, type-inference]
prerequisites: [types, prototypes]
interview:
  - question: What is a discriminated union and why does it matter?
    level: intermediate
    answer: >-
      A union of object types that each carry a literal-typed field identifying which member they
      are — `{ status: "loading" } | { status: "ok", data: T } | { status: "error", error: E }`.
      It matters because it makes invalid combinations unrepresentable: with four independent
      booleans you can be loading and errored at once, and with a discriminated union you cannot.
      TypeScript then narrows on the discriminant, so inside a `case "ok"` branch the `data`
      field exists and is typed, and inside the others it does not. That is the difference between
      a type system that documents your code and one that eliminates a class of bug.
    followUps:
      - "How do you make sure you handled every case?"
  - question: TypeScript is structurally typed. What does that mean in practice?
    level: intermediate
    answer: >-
      Compatibility is decided by shape, not by declared name. An object literal with the right
      properties satisfies an interface it never mentions, and two interfaces with identical
      members are interchangeable. That is usually what you want — it is why you can pass a plain
      object where a type is expected — but it means the type system will not stop you passing a
      `UserId` where an `OrderId` is expected if both are `string`. The fix is a branded type: a
      string intersected with a unique marker, which makes them structurally different.
    followUps:
      - "Why not just use a class for that?"
  - question: When is `any` acceptable, and what should you use instead?
    level: intermediate
    answer: >-
      Almost never, because `any` does not just skip checking on that value — it propagates, so
      everything derived from it is unchecked too. One `any` at a boundary can silently disable
      type checking across a whole module. `unknown` is the honest alternative for genuinely
      unknown data: it accepts anything and permits nothing until you narrow it, which forces the
      validation that `any` lets you skip. For the gaps that remain, a `satisfies` check or a
      well-placed type guard is usually what was actually wanted.
    followUps:
      - "So how do you type the result of JSON.parse?"
resources:
  - title: "TypeScript Handbook — Narrowing"
    url: https://www.typescriptlang.org/docs/handbook/2/narrowing.html
---

## The idea

```ts
// Annotating what you wrote. Four booleans — sixteen states, twelve
// of which are nonsense.
interface State {
  isLoading: boolean;
  isError: boolean;
  data?: User;
  error?: Error;
}
// isLoading && isError? data present while isError? Nothing prevents it.

// Constraining what can exist. Three states, all meaningful.
type State =
  | { status: "loading" }
  | { status: "ok"; data: User }
  | { status: "error"; error: Error };

function render(state: State) {
  switch (state.status) {
    case "loading": return spinner();
    case "ok":      return view(state.data);    // data exists here
    case "error":   return oops(state.error);   // and error here
  }
}
// state.data in the "error" branch is a compile error. The impossible
// combinations cannot be constructed at all.
```

:::what
**Structural typing** decides compatibility by shape. **Narrowing** is the compiler tracking a
value's type through control flow. A **discriminated union** is a union whose members share a
literal-typed field, which narrowing can switch on. **`unknown`** accepts any value and permits
no operation until narrowed; **`any`** disables checking and propagates.
:::

:::why
The useful framing is that a type is a *set of permitted values*, so designing types is choosing
which states can exist.

Written as four independent booleans and optional fields, "loading" has 2⁴ × 2 × 2 = 64
representable states, and the number that make sense is three. Every one of the other sixty-one
is a bug someone can write, a branch someone must defend against, and a test case nobody will
write. Expressed as a three-member union, those states are not merely discouraged — they cannot
be constructed, so the defensive branches disappear along with the bugs.

This is why "make illegal states unrepresentable" is the single highest-leverage idea in applied
typing. It changes what the type system is *for*: not documentation that drifts, and not a
linter you appease, but a constraint that removes work.

The same argument explains why `any` is worse than it looks. It does not locally disable checking
— it propagates, because everything derived from an `any` is also `any`. One `any` at a data
boundary can switch off type checking through a whole call graph silently, which is exactly the
opposite of what you installed the type system for. `unknown` is the honest version: it admits
you do not know, and refuses every operation until you have proved something.
:::

:::how
```text
  NARROWING — the compiler following your control flow

    function f(x: string | number | null) {
      if (x === null) return;        // x: string | number below
      if (typeof x === "string") {
        x.toUpperCase();             // x: string
      } else {
        x.toFixed(2);                // x: number — by elimination
      }
    }

  The narrowing mechanisms, in rough order of usefulness:

    typeof x === "string"            primitives
    x === null / x == null           null and undefined
    "key" in x                       presence of a property
    x instanceof Date                classes
    Array.isArray(x)                 arrays
    x.kind === "circle"              a literal discriminant
    isUser(x)                        a user-defined type guard

  EXHAUSTIVENESS — how you learn about the case you forgot

    type Shape = Circle | Square | Triangle;

    function area(s: Shape): number {
      switch (s.kind) {
        case "circle": return Math.PI * s.r ** 2;
        case "square": return s.side ** 2;
        default:
          const _exhaustive: never = s;    // ERROR: Triangle is not never
          throw new Error(`unhandled: ${s}`);
      }
    }

    Adding a member to Shape now breaks the build at every switch
    that does not handle it. That is the feature: the compiler finds
    the places you would have had to remember.

  STRUCTURAL TYPING, and the gap it leaves

    type UserId = string;
    type OrderId = string;
    function getUser(id: UserId) {}
    getUser(orderId);                 // no error — both are string

    type UserId = string & { readonly __brand: "UserId" };
    getUser(orderId);                 // error: brands differ

    The brand is a compile-time fiction with no runtime cost, and it
    turns a whole category of argument-swap bug into a type error.
```
:::

:::example
```ts
// 1. Parsing at the boundary — the one place types cannot help you,
//    so this is where validation belongs.
function parseUser(json: unknown): User {
  if (typeof json !== "object" || json === null) throw new Error("not an object");
  const o = json as Record<string, unknown>;
  if (typeof o.id !== "string") throw new Error("id must be a string");
  if (typeof o.name !== "string") throw new Error("name must be a string");
  return { id: o.id, name: o.name };
}
// `JSON.parse` returns `any`, which is a lie — the data is genuinely
// unknown. Typing the parameter as `unknown` forces this validation
// to exist. In real code use zod or valibot, which generate both the
// validator and the type from one schema so they cannot drift.

// 2. A type guard, which teaches the compiler something it cannot
//    infer.
function isError(x: unknown): x is Error {
  return x instanceof Error;
}
try { risky(); } catch (e) {
  // `e` is `unknown` under useUnknownInCatchVariables — correctly,
  // since JavaScript lets you throw anything.
  if (isError(e)) console.error(e.message);
  else console.error(String(e));
}

// 3. Generics that constrain rather than decorate.
function pluck<T, K extends keyof T>(items: T[], key: K): T[K][] {
  return items.map((i) => i[key]);
}
pluck(users, "name");       // string[]
pluck(users, "nmae");       // error: not a key of User
// `K extends keyof T` is what makes the typo a compile error. A
// signature of (items: any[], key: string) would accept it.

// 4. `satisfies` — check against a type without widening.
const routes = {
  home: "/",
  user: "/users/:id",
} satisfies Record<string, string>;

routes.home;        // type "/" — the literal is preserved
// With `: Record<string, string>` the type would widen to string and
// `routes.nonexistent` would be allowed. `satisfies` validates the
// shape and keeps the inference.

// 5. Utility types, which remove most hand-written duplication.
type User = { id: string; name: string; email: string; createdAt: Date };

type NewUser   = Omit<User, "id" | "createdAt">;
type UserPatch = Partial<Omit<User, "id">>;
type UserKeys  = keyof User;                      // "id" | "name" | ...
type Public    = Readonly<Pick<User, "id" | "name">>;
// Derived from one source, so they cannot drift from it — which is
// the same argument as generating the validator from the schema.
```
:::

:::failure
**`any` propagating silently.**

```ts
const data: any = JSON.parse(body);
const name = data.user.name;          // any
const upper = name.toUpperCase();     // any — no check
const n: number = upper;              // ALLOWED. No error anywhere.
// One `any` at the boundary disabled checking for everything
// downstream. `unknown` would have stopped at the first access.
```

**Type assertions used as a fix.**

```ts
const user = response as User;       // a claim, verified by nobody
// If the server returns something else, this is a runtime error at
// some unrelated line later. An assertion moves the failure, it does
// not prevent it. Validate instead.
```

**Non-null assertion to silence the compiler.**

```ts
const el = document.getElementById("x")!;    // "trust me"
el.focus();                                   // TypeError if absent
// The compiler was telling you about a real case. `!` deletes the
// warning and keeps the bug.
```

**`enum` where a union of literals is better.**

```ts
enum Status { Active = "active" }    // emits runtime code, nominal-ish,
                                     // and awkward with JSON
type Status = "active" | "archived"; // zero runtime cost, assignable
                                     // from a string literal, narrows
// `const enum` and numeric enums have further sharp edges. Literal
// unions are the modern default.
```

**Optional properties where a union was meant.**

```ts
interface Result { data?: T; error?: E }   // both? neither? allowed.
type Result = { ok: true; data: T } | { ok: false; error: E };
```

**Forgetting `strict`.** Without `strictNullChecks`, `string` includes `null` and the compiler
cannot warn about the most common runtime error in the language. Every option in `strict` closes
a real hole; `noUncheckedIndexedAccess` in particular makes `arr[0]` correctly `T | undefined`.

**Trusting the types at a boundary.** Types describe your program, not the network. Anything
crossing in from outside — an API response, a query string, a localStorage value, a webhook —
is `unknown` until validated, and a type annotation on it is a comment with a compiler's
authority behind it.

**Over-genericising.**

```ts
function identity<T extends Record<string, unknown>>(x: T): T { return x; }
// A generic earns its place when it preserves a relationship between
// inputs and outputs. If it does not, it is noise with inference costs.
```
:::

:::realworld
```ts
// 1. One schema, both the validator and the type. This is the single
//    highest-value pattern in applied TypeScript.
import { z } from "zod";

const UserSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1),
  email: z.string().email(),
  createdAt: z.coerce.date(),
});
type User = z.infer<typeof UserSchema>;        // derived, cannot drift

const user = UserSchema.parse(await res.json()); // throws on bad data
// The type and the runtime check come from one declaration, so they
// cannot disagree — which is exactly the failure mode of a
// hand-written interface plus a hand-written validator.

// 2. Branded ids, which eliminate argument-swap bugs.
type Brand<T, B> = T & { readonly __brand: B };
type UserId = Brand<string, "UserId">;
type OrderId = Brand<string, "OrderId">;

const asUserId = (s: string) => s as UserId;   // one controlled cast

function transfer(from: UserId, to: UserId, order: OrderId) {}
transfer(userA, orderId, userB);               // compile error
// Zero runtime cost. The only `as` is in the constructor function,
// which is where you validate.

// 3. Exhaustive handling as a build-time guarantee.
type Event =
  | { type: "created"; id: string }
  | { type: "updated"; id: string; changes: Partial<User> }
  | { type: "deleted"; id: string };

function handle(e: Event) {
  switch (e.type) {
    case "created": return onCreate(e.id);
    case "updated": return onUpdate(e.id, e.changes);
    case "deleted": return onDelete(e.id);
    default: {
      const _: never = e;
      throw new Error(`unhandled event: ${JSON.stringify(e)}`);
    }
  }
}
// Adding a fourth event type breaks the build here and everywhere
// else that switches on it. In a codebase with twenty handlers, that
// is twenty places you did not have to remember.
```

```text
// The tsconfig settings that matter, and why:
//
//   strict: true                      — all of the below, plus more
//   strictNullChecks                  — null is not in every type
//   noUncheckedIndexedAccess          — arr[i] is T | undefined,
//                                        which is the truth
//   exactOptionalPropertyTypes        — { a?: string } does not
//                                        accept { a: undefined }
//   noImplicitOverride                — catches a renamed base method
//   verbatimModuleSyntax              — explicit type-only imports
//
// Each one converts a class of runtime error into a compile error.
// Turning them on in an existing codebase is work; turning them on
// in a new one is free.
```
:::

:::mistakes
**`any` anywhere you could use `unknown`.** It propagates.

**Assertions (`as`) instead of validation.** Moves the failure, does not remove it.

**`!` to silence a real possibility.**

**Optional properties where the states are mutually exclusive.** Use a discriminated union.

**`enum` instead of a literal union.** Runtime cost and awkward interop.

**Not running `strict`.** Most of the value is in those flags.

**Trusting types at a boundary.** Network, storage, query strings and webhooks are `unknown`.

**Hand-writing a type next to a hand-written validator.** They will drift. Derive one from the
other.

**Generics that preserve no relationship.** Noise.

**Using classes purely to get nominal typing.** A brand is cheaper and has no runtime footprint.
:::

:::tradeoffs
**Interfaces and inference** — minimal annotation, excellent editor support, and nothing checked
at runtime. The baseline.

**Discriminated unions** — illegal states become unrepresentable and exhaustiveness is checkable,
at the cost of more verbose construction. Almost always worth it for state.

**Runtime schema validation (zod and similar)** — the type and the check come from one source, so
they cannot drift, at the cost of a dependency and some bundle size. The right answer at every
boundary.

**Branded types** — nominal safety for primitives with zero runtime cost, at the cost of a
controlled cast in the constructor and slightly noisier signatures.

**`unknown` plus narrowing** — honest and forces validation, which is more code than `any` and
exactly the code that was missing.

**`any`** — unblocks you now and silently disables checking downstream. Acceptable as a temporary,
`// eslint-disable`-annotated escape with a reason; never as a habit.

**Heavy type-level programming** — expressive, and it produces error messages nobody can read and
compile times that hurt. The useful ceiling is lower than it looks.

The principle that does most of the work: **a type is a set of permitted values, so make the set
exactly the valid states.** Everything else here — unions, brands, `unknown`, exhaustiveness — is
an application of that one idea.
:::

:::checkpoint
1. Four booleans and two optional fields — how many representable states, and how many are
   valid?
2. Rewrite that as a discriminated union. What becomes impossible?
3. Why is `any` worse than a single unchecked value?
4. What does the `const _: never = s` line in a `default` branch buy you?
5. `type UserId = string` does not stop you passing an `OrderId`. Why, and what fixes it?
6. What is the difference between `: Record<string, string>` and `satisfies Record<string,
   string>`?
7. Why is `JSON.parse` returning `any` a problem, and what should the parameter type be?
8. Name three `strict` flags and the runtime error each one prevents.
:::

:::interview
Lead with the framing, because it changes what the rest of the answer is about:

*"A type is a set of permitted values, so designing types is choosing which states can exist. A
loading state written as four booleans and two optional fields has dozens of representable states
and three valid ones — every other one is a bug someone can write and a branch someone has to
defend against. Written as a three-member discriminated union, those states cannot be constructed
at all, so the defensive code disappears with the bugs. That is the difference between a type
system that documents and one that removes work."*

Then the exhaustiveness point, which is the concrete payoff:

*"The payoff I care about most is exhaustiveness. Assigning the narrowed value to `never` in the
default branch means adding a union member breaks the build at every switch that does not handle
it — so in a codebase with twenty handlers, that is twenty places I did not have to remember. The
compiler finds the work."*

On `any`, give the propagation argument rather than a style preference:

*"`any` is not a local escape hatch — it propagates, because everything derived from an `any` is
also `any`. One `any` where a response is parsed can disable checking through a whole call graph
silently, which is the exact opposite of why the type system is there. `unknown` is the honest
version: it accepts any value and permits nothing until you narrow it, which forces the validation
that `any` lets you skip."*

And the thing that matters most in practice: *"at any boundary — an API response, a query string,
localStorage, a webhook — types describe my program and not the network, so I validate with a
schema and derive the type from it. One declaration means the type and the runtime check cannot
drift, which is the failure mode of a hand-written interface next to a hand-written validator."*
:::

## What you now know

- A type is a set of permitted values; designing types is choosing which states can exist.
- "Make illegal states unrepresentable" removes defensive branches as well as bugs.
- A discriminated union plus narrowing gives per-branch field access for free.
- Assigning to `never` in a `default` branch turns a new union member into a build error.
- `any` propagates, so one of them can disable checking across a call graph.
- `unknown` accepts anything and permits nothing until narrowed — the honest choice.
- `as` and `!` move failures rather than preventing them.
- TypeScript is structurally typed, so `UserId` and `OrderId` as `string` are interchangeable.
- A branded type fixes that with zero runtime cost and one controlled cast.
- `satisfies` validates a shape without widening the inferred literal types.
- Prefer literal unions to `enum`: no runtime emit, better interop.
- Derive types from a runtime schema so the type and the validation cannot drift.
- Types describe your program, not the network — every boundary needs validation.
- `strict`, `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes` each close a real hole.
- Generics earn their place by preserving a relationship between inputs and outputs.
