---
title: Promises and async/await
summary: A promise is a value that arrives later, with one guarantee that makes composition possible — and the four combinators that cover almost every real case.
level: intermediate
minutes: 18
version: "ES2024"
status: stable
last_reviewed: "2026-10-07"
tags: [javascript, promises, async-await, error-handling, concurrency]
concepts: [promises, async-await, error-propagation, concurrency-patterns]
prerequisites: [event-loop, closures]
interview:
  - question: What problem do promises solve that callbacks did not?
    level: intermediate
    answer: >-
      Composition and error propagation. A callback is a hole in your function that someone else
      fills, so combining two async operations means nesting, and there is no way to return a
      pending result — which is why callback code grows inwards instead of downwards. A promise
      is a *value*, so it can be returned, stored, passed and combined, and errors propagate down
      a chain the way exceptions propagate up a stack. Promises also guarantee what callbacks
      did not: a handler is called exactly once, always asynchronously, and attaching a handler
      after settlement still works.
    followUps:
      - "Why does 'always asynchronously' matter?"
  - question: Promise.all, allSettled, race or any?
    level: intermediate
    answer: >-
      `all` resolves with every result or rejects on the first failure, so it is for "I need all
      of these and any failure is fatal". `allSettled` never rejects and reports each outcome,
      so it is for "do all of these and tell me what happened" — independent work where partial
      success is useful. `race` settles with the first to settle either way, which is how you
      implement a timeout. `any` resolves with the first *success* and rejects only if all fail,
      which is for fallbacks across replicas. The common mistake is `all` where `allSettled` was
      meant: one failure discards results you already paid for.
    followUps:
      - "Does rejecting from Promise.all cancel the others?"
  - question: Is `await` in a loop a mistake?
    level: intermediate
    answer: >-
      Only if the iterations are independent. `for (const x of xs) await f(x)` is sequential, so n
      requests take n times as long — and that is correct and necessary when each depends on the
      last, or when you must not overwhelm the far end. When they are independent, `Promise.all`
      with a map runs them concurrently. The nuance worth adding is that unbounded concurrency is
      its own failure: mapping ten thousand URLs into `Promise.all` opens ten thousand connections
      at once, so in production you want a bounded pool.
    followUps:
      - "How would you bound it?"
resources:
  - title: "MDN — Using promises"
    url: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Using_promises
---

## What a promise guarantees

```js
const p = fetch("/api/user");    // a value representing a future result

// Three guarantees callbacks did not have:
// 1. A handler runs at most once.
// 2. It always runs asynchronously, even for an already-settled promise.
// 3. Attaching a handler after settlement still works.

const resolved = Promise.resolve(1);
resolved.then(() => console.log("a"));   // still asynchronous
console.log("b");
// b, a
```

That second guarantee is what makes promise code reasonable to read: a function's
synchronous section always finishes before any handler runs, so you never have to ask
whether a callback already fired.

:::what
A **promise** is an object representing a value that is not available yet. It is **pending**, then
either **fulfilled** with a value or **rejected** with a reason — once, permanently. `async`/`await`
is syntax over promises: an `async` function returns a promise, and `await` suspends until one
settles.
:::

:::why
Callbacks worked and did not compose, and the reason is that a callback is not a value.

```js
// Callbacks: the shape grows inwards, and each level needs its own
// error handling, which is why it was so often omitted.
getUser(id, (err, user) => {
  if (err) return handle(err);
  getOrders(user.id, (err, orders) => {
    if (err) return handle(err);
    getItems(orders[0].id, (err, items) => {
      if (err) return handle(err);
      render(items);
    });
  });
});
```

You cannot return a pending callback result, so the only way to use it is inside the callback —
hence the nesting. You cannot pass it to a function that combines two async operations, because
there is nothing to pass. And an error at one level must be handled at that level, because there
is no mechanism carrying it outward.

A promise is a first-class value, which fixes all three: it can be returned from a function,
stored in a variable, collected into an array and handed to `Promise.all`, and a rejection skips
every `.then` until a handler is found — the async analogue of an exception unwinding a stack.

`async`/`await` then removes the remaining ceremony. It is not a different mechanism: an `async`
function returns a promise, `await` unwraps one, and `try`/`catch` catches a rejection. The whole
value is that control flow written with `if`, `for` and `try` reads the same whether the
operations are synchronous or not.
:::

:::how
```text
  STATES — one transition, permanent

    pending ──┬──▶ fulfilled (value)
              └──▶ rejected (reason)

    "Settled" means either. A settled promise never changes, which is
    why you can attach handlers later and why a promise can be shared.

  THE CHAIN

    p.then(f).then(g).catch(h)

    - whatever f returns becomes the next promise's value
    - if f returns a promise, the chain waits for it (flattening)
    - if f throws or returns a rejected promise, the chain skips
      ahead to the next catch

      ok → f → ok → g → ok
       │         │
       └─ err ───┴──────────▶ h

  async/await IS THAT CHAIN

    async function load() {
      const user = await getUser(id);      // .then
      const orders = await getOrders(user); // .then
      return orders;                        // resolves the returned promise
    }
    // throw inside → the returned promise rejects
    // try/catch     → .catch

  SEQUENTIAL vs CONCURRENT — the distinction that matters most

    // sequential: 3 × 200ms = 600ms
    const a = await fetchA();
    const b = await fetchB();
    const c = await fetchC();

    // concurrent: 200ms
    const [a, b, c] = await Promise.all([fetchA(), fetchB(), fetchC()]);

    The second form starts all three before awaiting any. The first
    is correct only if b genuinely needs a.

  THE FOUR COMBINATORS

    all         → all values, or the FIRST rejection
    allSettled  → [{status, value|reason}, ...], never rejects
    race        → the first to SETTLE, either way
    any         → the first to FULFIL; rejects only if all reject
```
:::

:::example
```js
// 1. Bounded concurrency — what you actually want in production.
async function mapWithLimit(items, limit, fn) {
  const results = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;                      // claim an index
      results[i] = await fn(items[i], i);
    }
  }
  await Promise.all(Array.from({ length: limit }, worker));
  return results;
}
await mapWithLimit(urls, 10, fetchJson);
// Ten in flight at any time, regardless of how many URLs there are.
// `Promise.all(urls.map(fetchJson))` would open all of them at once —
// which exhausts sockets, trips rate limits, and is a good way to be
// mistaken for an attack.

// 2. A timeout, via race. Note what it does and does not do.
function withTimeout(promise, ms) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`timed out after ${ms}ms`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}
// The `finally` matters: without it the timer keeps the process alive
// in Node and leaks a handle per call.
//
// And the honest limitation: racing does not CANCEL the original
// operation. The request continues and its result is discarded. For
// real cancellation you need AbortController.

// 3. Real cancellation.
const controller = new AbortController();
const promise = fetch(url, { signal: controller.signal });
setTimeout(() => controller.abort(), 5000);
// fetch rejects with an AbortError and the connection is actually
// closed. This is the difference between ignoring a result and not
// paying for it.

// 4. allSettled where all would lose data.
const results = await Promise.allSettled(userIds.map(fetchUser));
const found = results.filter((r) => r.status === "fulfilled").map((r) => r.value);
const failed = results.filter((r) => r.status === "rejected");
// With Promise.all, one 404 among a hundred discards the other
// ninety-nine responses you already paid for.

// 5. Retry with backoff and jitter.
async function retry(fn, { attempts = 3, base = 100 } = {}) {
  for (let i = 0; ; i++) {
    try {
      return await fn();
    } catch (err) {
      if (i >= attempts - 1) throw err;
      const delay = base * 2 ** i * (0.5 + Math.random());
      await new Promise((r) => setTimeout(r, delay));
    }
  }
}
// The jitter is not decoration: without it, every client that failed
// together retries together, and the retry storm is worse than the
// original incident.
```
:::

:::failure
**`await` in a loop over independent work.**

```js
for (const id of ids) {
  users.push(await fetchUser(id));     // 100 ids × 200ms = 20 seconds
}
const users = await Promise.all(ids.map(fetchUser));   // 200ms
// Sequential is right when each step depends on the last, or when the
// far end must not be hammered. It is wrong by default.
```

**`forEach` with an async callback.**

```js
items.forEach(async (item) => { await save(item); });
console.log("done");            // prints immediately; nothing is saved yet
// forEach ignores the returned promises. Use for...of with await for
// sequential, or Promise.all with map for concurrent.
```

**Unbounded `Promise.all`.** Ten thousand concurrent requests exhausts file descriptors and looks
like a denial-of-service attack from the receiving end.

**`Promise.all` where `allSettled` was meant.** One rejection discards every other result.

**Forgetting that a rejection in `Promise.all` does not cancel anything.** The other operations
continue to completion; you simply stop observing them. Their side effects still happen, which
matters when they are writes.

**A floating promise.**

```js
async function handler() {
  sendAnalytics();        // not awaited, not caught
  return render();
}
// If sendAnalytics rejects: unhandled rejection. In Node 15+ that
// terminates the process. Either await it, or attach .catch()
// deliberately:  void sendAnalytics().catch(reportError);
```

**`try`/`catch` that does not cover what you think.**

```js
try {
  someAsyncThing();          // no await: the promise escapes the try
} catch (e) { }              // never runs
// The try block has already exited by the time the promise rejects.
```

**The constructor anti-pattern.**

```js
return new Promise(async (resolve, reject) => {    // never do this
  const x = await f();                             // a throw here is
  resolve(x);                                      // swallowed entirely
});
// An async executor's rejection is not routed to the outer promise.
// Just return the async function's promise.
```

**Mixing `await` with `.then` on the same chain.** It works and makes the ordering much harder to
read. Pick one per function.

**Creating a promise just to wrap a value.** `return Promise.resolve(x)` inside an `async`
function is redundant — the function already wraps it.
:::

:::realworld
```js
// 1. Caching an in-flight promise — deduplication, which is cheaper
//    than caching the result and often more useful.
const inFlight = new Map();
function fetchUserOnce(id) {
  if (!inFlight.has(id)) {
    inFlight.set(id, fetchUser(id).finally(() => inFlight.delete(id)));
  }
  return inFlight.get(id);
}
// Ten components asking for user 5 at once produce one request. The
// `finally` delete is what prevents it from becoming a permanent
// cache of possibly-failed results.

// 2. A sequential pipeline where order genuinely matters.
async function migrate(steps) {
  for (const step of steps) {
    await step();            // each must finish before the next starts
  }
}
// Promise.all here would run migrations concurrently, which is a very
// effective way to corrupt a schema. `await` in a loop is correct
// precisely when there is a dependency, and this is that case.

// 3. Timeout plus abort plus retry, composed — roughly what a real
//    HTTP client wrapper looks like.
async function request(url, { timeout = 5000, attempts = 3 } = {}) {
  return retry(async () => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    try {
      const res = await fetch(url, { signal: controller.signal });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } finally {
      clearTimeout(timer);
    }
  }, { attempts });
}
// Note `if (!res.ok) throw` — fetch does NOT reject on 4xx or 5xx. It
// only rejects on network failure, so a 500 is a *successful* fetch
// as far as the promise is concerned. This surprises people
// constantly and silently turns server errors into rendered pages.
```

```text
// Ordering rules worth internalising for real code:
//
//   1. Start everything that can run concurrently BEFORE the first
//      await. `const a = f(); const b = g(); await a; await b;` is
//      concurrent; awaiting each in turn is not.
//   2. Bound concurrency against anything external.
//   3. allSettled for independent work, all for a transaction-like
//      set where partial success is useless.
//   4. Every timeout should also abort, or you are paying for work
//      you have discarded.
//   5. Attach a catch to every promise you do not await.
```
:::

:::mistakes
**`await` in a loop over independent operations.** Use `Promise.all`.

**`forEach` with `async`.** The promises are dropped.

**Unbounded `Promise.all`.** Socket exhaustion and rate limits.

**`all` instead of `allSettled`.** Discards results you already have.

**Expecting rejection to cancel siblings.** It does not; use `AbortController`.

**Floating promises.** Unhandled rejection, and process exit in Node.

**`try`/`catch` without `await`.** The block exits before the rejection.

**`new Promise(async ...)`.** Swallows errors.

**Assuming `fetch` rejects on 4xx/5xx.** Check `res.ok`.

**No `clearTimeout` in a race-based timeout.** Leaks a handle per call and keeps Node alive.

**Retrying without jitter.** Synchronised retry storms.
:::

:::tradeoffs
**Callbacks** — no allocation, no microtask, and they do not compose, cannot be returned, and give
you no error propagation. Still correct for simple event handlers, which is what they are good at.

**Promises with `.then`** — composable and explicit about where each step ends. Chains of more
than three steps read worse than `await`.

**`async`/`await`** — control flow reads like synchronous code, and `try`/`catch` works. The
trap is that it makes sequential code the path of least resistance, so accidental serialisation
is the characteristic performance bug of async/await codebases.

**`Promise.all`** — maximum concurrency and the shortest code, with no bound on resource use and
all-or-nothing error semantics.

**`Promise.allSettled`** — partial success, every outcome reported, and you must handle the
result shape. The right default for independent work.

**Bounded pool** — predictable resource use and good throughput, at the cost of about fifteen
lines or a dependency.

**`AbortController`** — actually stops the work rather than ignoring it. Requires the API to
support signals, which `fetch` and most modern libraries do.

The two rules that matter most: **start concurrent work before the first `await`**, and **bound
every concurrency against something you do not control.** Those two cover the majority of real
async defects.
:::

:::checkpoint
1. Name the three guarantees a promise makes that a callback did not.
2. `const a = await f(); const b = await g();` versus `Promise.all([f(), g()])` — timings, and
   when is the first one correct?
3. Why does `items.forEach(async i => await save(i))` print "done" before anything is saved?
4. Give the four combinators and one real use for each.
5. Does a `Promise.all` rejection cancel the other operations? What does?
6. Why does `try { someAsyncThing() } catch {}` never catch?
7. What does `fetch` do on an HTTP 500, and why is that surprising?
8. Why does the race-based timeout need `clearTimeout`?
:::

:::interview
Frame promises as the consequence of being a value, because that is what callbacks lacked:

*"A callback is not a value, so you cannot return a pending result, cannot pass it to something
that combines two async operations, and cannot propagate an error outward — which is why callback
code nests instead of flowing. A promise is a first-class value, so it composes: you can return
it, collect it into an array, hand it to `Promise.all`, and a rejection skips down the chain to
the nearest catch the way an exception unwinds a stack. It also guarantees a handler runs at most
once, always asynchronously, and works if attached after settlement — none of which callbacks
promised."*

Then show you know the performance failure mode, since that is the practical question:

*"The characteristic bug in async/await code is accidental serialisation, because `await` on each
line is the path of least resistance. Three independent 200ms requests awaited in sequence take
600ms; started together and awaited with `Promise.all` they take 200. The rule is to start
everything concurrent before the first await. But unbounded `Promise.all` is its own failure —
mapping ten thousand URLs opens ten thousand connections, which exhausts sockets and looks like
an attack from the other end — so in production I want a bounded pool."*

And one correction people appreciate:

*"Two things worth stating explicitly. A `Promise.all` rejection does not cancel its siblings;
they run to completion and you just stop observing them, which matters when they perform writes.
Real cancellation needs `AbortController`. And `fetch` does not reject on 4xx or 5xx — only on
network failure — so a 500 is a successful fetch as far as the promise is concerned, and you have
to check `res.ok` yourself."*
:::

## What you now know

- A promise is a value, which is what makes composition and error propagation possible.
- Three guarantees: handlers run at most once, always asynchronously, and work after settlement.
- A promise settles once, permanently, so it can be shared and awaited repeatedly.
- `async`/`await` is syntax over the same chain; a throw becomes a rejection.
- Start concurrent work before the first `await`, or you serialise it accidentally.
- `all` for all-or-nothing, `allSettled` for independent work, `race` for timeouts, `any` for
  fallbacks.
- A rejection does not cancel siblings; `AbortController` does.
- `forEach` with an async callback drops the promises.
- Unbounded `Promise.all` exhausts sockets — use a bounded pool.
- A floating promise's rejection is unhandled and terminates Node 15+.
- `try`/`catch` without `await` never catches.
- `new Promise(async ...)` swallows errors.
- `fetch` rejects only on network failure; check `res.ok` for HTTP status.
- Clear the timer in a race-based timeout, or it leaks a handle per call.
- Retry with exponential backoff *and* jitter, or clients resynchronise into a storm.
