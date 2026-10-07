---
title: The event loop
summary: One thread, several queues, and why a slow synchronous function freezes everything while a slow network call freezes nothing.
level: intermediate
minutes: 18
version: "ES2024"
status: stable
last_reviewed: "2026-10-07"
tags: [javascript, event-loop, async, microtasks, concurrency]
concepts: [event-loop, microtasks, macrotasks, blocking]
prerequisites: [functions, this-binding]
interview:
  - question: Explain the event loop.
    level: intermediate
    answer: >-
      JavaScript runs on one thread with a queue of work. The loop takes one task from the macrotask
      queue, runs it to completion, then drains the entire microtask queue before taking the next
      task — and in a browser, renders between tasks if anything changed. Promise callbacks are
      microtasks; `setTimeout`, I/O callbacks and events are macrotasks. "Runs to completion" is the
      key phrase: nothing interrupts a task, so a function that takes two seconds blocks everything
      including rendering for two seconds. What makes the model work is that the *waiting* happens
      outside the thread — the host provides the timers and the sockets — so the thread only ever
      runs your callbacks.
    followUps:
      - "What is the difference between a microtask and a macrotask, concretely?"
  - question: Why does a promise callback run before a `setTimeout(0)` queued earlier?
    level: intermediate
    answer: >-
      Because the microtask queue is drained completely between macrotasks, so every pending promise
      callback runs before the next timer callback is even considered. That ordering is what makes
      promise chains behave predictably — a `.then` is always observed before any I/O or timer
      callback that was queued around the same time. The practical hazard is starvation: a microtask
      that queues another microtask never lets the loop proceed, so you can freeze the page with
      promises and no infinite `for` loop in sight.
    followUps:
      - "How would you yield to the loop deliberately?"
  - question: If JavaScript is single-threaded, how does it do many things at once?
    level: intermediate
    answer: >-
      It does not run your code concurrently — it interleaves it. The concurrency lives in the host:
      the browser or Node handles timers, network sockets and file I/O on other threads, and when
      one completes it queues a callback. So a thousand in-flight HTTP requests cost almost nothing
      on the JavaScript thread, because the thread is not involved in waiting. That is why the model
      is excellent for I/O-bound work and useless for CPU-bound work, where the answer is a Web
      Worker or a child process — genuinely separate threads with no shared memory.
    followUps:
      - "So what moves a CPU-bound task off the main thread?"
resources:
  - title: "Jake Archibald — In the Loop"
    url: https://www.youtube.com/watch?v=cCOL7MC4Pl0
---

## The ordering that explains everything

```js
console.log("1");
setTimeout(() => console.log("2"), 0);
Promise.resolve().then(() => console.log("3"));
queueMicrotask(() => console.log("4"));
console.log("5");

// 1, 5, 3, 4, 2
//
// 1 and 5: synchronous, this task.
// 3 and 4: microtasks, drained before the loop continues.
// 2: a macrotask, so it waits for the next turn of the loop.
```

:::what
The **event loop** takes one **macrotask** (a timer callback, an I/O completion, a DOM event),
runs it to completion, then drains the **microtask** queue entirely, then repeats. Microtasks are
promise reactions, `queueMicrotask` and `MutationObserver`. **Run to completion** means no task is
ever interrupted part-way.
:::

:::why
The single thread is a deliberate trade, and the thing it buys is the absence of data races.

In a multi-threaded UI, two threads touching the same DOM node need a lock, and getting that
wrong produces a class of bug that is nondeterministic and nearly impossible to reproduce.
JavaScript removed the possibility: between any two statements in your function, no other
JavaScript can run. You never need a mutex, because there is nothing to race against. That is an
enormous simplification, and it is why the model survived.

The cost is that blocking is total. A two-second synchronous loop blocks input handling,
animation, rendering and every pending callback for two seconds, because the loop cannot take
the next task until the current one returns. There is no preemption to rescue you.

What makes this workable is that almost all waiting happens outside the thread. When you make an
HTTP request, the thread does not wait — the host's networking stack does, on its own threads,
and queues a callback when the response arrives. So ten thousand concurrent requests cost
essentially nothing in JavaScript, while one tight numeric loop costs everything. The model is
precisely inverted from what people expect, and understanding why is the difference between
writing responsive code and sprinkling `setTimeout` at random.
:::

:::how
```text
  ONE TURN OF THE LOOP

    ┌─────────────────────────────────────────────┐
    │ 1. take ONE macrotask, run to completion    │
    │    (timer cb, I/O cb, DOM event, script)    │
    ├─────────────────────────────────────────────┤
    │ 2. drain the ENTIRE microtask queue         │
    │    — including microtasks queued during     │
    │      this drain                             │
    ├─────────────────────────────────────────────┤
    │ 3. (browser) requestAnimationFrame callbacks│
    │ 4. (browser) style, layout, paint — if      │
    │    anything changed and it is time to       │
    │    render (~16.7ms at 60Hz)                 │
    └─────────────────────────────────────────────┘
                        ↓ repeat

  WHERE THE WAITING HAPPENS — this is the key picture

    your thread            the host (other threads)
    ───────────            ────────────────────────
    fetch(url) ──────────▶ open socket, send, wait...
    (returns immediately)        │
    ...other work...             │ response arrives
                                 ▼
    callback queued ◀──── push onto the macrotask queue
    (runs next turn)

    The thread never waits. That is the whole reason one thread can
    serve thousands of connections.

  WHY ORDERING MATTERS — a worked case

    async function f() {
      console.log("a");
      await null;              // yields, queues the rest as a microtask
      console.log("b");
    }
    console.log("start");
    f();
    console.log("end");

    → start, a, end, b

    Everything up to the first `await` runs SYNCHRONOUSLY. The await
    splits the function: the remainder becomes a microtask. So `f()`
    is not "started in the background" — its first half already ran.

  MICROTASK STARVATION

    function spin() { Promise.resolve().then(spin); }
    spin();

    The microtask queue never empties, so step 2 never finishes. No
    rendering, no input, no timers — a frozen page with no loop in
    sight. `setTimeout(spin, 0)` instead would yield between turns
    and the page would stay responsive.
```
:::

:::example
```js
// 1. The classic ordering puzzle, annotated.
async function test() {
  console.log("1");                                   // sync
  await Promise.resolve();
  console.log("2");                                   // microtask
}
console.log("3");                                     // sync
test();
Promise.resolve().then(() => console.log("4"));       // microtask
setTimeout(() => console.log("5"), 0);                // macrotask
console.log("6");                                     // sync
// 3, 1, 6, 2, 4, 5
//
// Synchronous first (3, 1, 6) — note "1" is synchronous because it
// precedes the await. Then microtasks in queue order (2, 4). Then
// the next macrotask (5).

// 2. Yielding deliberately, so a long job does not block rendering.
async function processLargeArray(items, onChunk) {
  const CHUNK = 500;
  for (let i = 0; i < items.length; i += CHUNK) {
    for (const item of items.slice(i, i + CHUNK)) onChunk(item);
    // A macrotask boundary: lets the browser render and handle input.
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}
// `await Promise.resolve()` would NOT help: it is a microtask, so the
// loop never reaches the rendering step. Yielding needs a macrotask.
//
// The modern browser API for exactly this:
//   if (navigator.scheduling?.isInputPending()) await scheduler.yield();

// 3. Moving CPU work off the thread entirely.
const worker = new Worker("heavy.js");
worker.postMessage({ data });
worker.onmessage = (e) => render(e.data);
// A real separate thread with no shared memory — messages are
// structured-cloned, so there is still nothing to race over. The
// single-threaded guarantee is preserved per worker.

// 4. Measuring whether you are blocking.
const t = performance.now();
doTheThing();
const ms = performance.now() - t;
if (ms > 50) console.warn(`blocked for ${ms.toFixed(0)}ms`);
// 50ms is the usual threshold for "the user notices". A frame budget
// at 60Hz is 16.7ms, so anything over that drops frames.
```
:::

:::failure
**A synchronous loop blocking everything.**

```js
button.onclick = () => {
  for (let i = 0; i < 1e9; i++) {}      // 2 seconds
  // The spinner you set before this never appears: the DOM update
  // cannot render until the task returns.
};
// Setting a loading state and then blocking synchronously is a very
// common bug, and it looks like "the spinner is broken".
```

**Expecting `setTimeout(fn, 0)` to run immediately.** It runs after the current task *and* all
microtasks, and the minimum delay is clamped — 4ms after several nested timers, and much more in
a background tab.

**Microtask starvation.** A recursive promise chain freezes the page without any visible loop.

**Assuming `await` yields to rendering.** It yields to the microtask queue only. If you need the
browser to paint, you need a macrotask boundary.

**Thinking an `async` function starts asynchronously.**

```js
async function f() { console.log("runs now"); await x; }
f();                 // "runs now" is printed before f() returns
console.log("after");
// Everything before the first await is synchronous. If that part is
// expensive, marking the function `async` has bought you nothing.
```

**Unhandled promise rejections.**

```js
async function f() { throw new Error("boom"); }
f();                      // no await, no catch
// In Node 15+ this terminates the process. In browsers it fires
// unhandledrejection and is often silently lost in production.
// Either await it, or attach .catch(), or handle the global event.
```

**Blocking I/O in Node.**

```js
const data = fs.readFileSync("big.json");   // blocks the event loop
// In a server, every other request waits. The async version does not.
// readFileSync is fine at startup and a bug in a request handler.
```

**`JSON.parse` on a large payload.** Synchronous and not interruptible, so a 50 MB response blocks
for hundreds of milliseconds. There is no async version; the answer is to stream, or to parse in a
worker.
:::

:::realworld
```text
// Node's loop has named phases, which matters for debugging.
//
//   timers          → setTimeout, setInterval callbacks
//   pending         → some system callbacks
//   poll            → I/O events (where it waits)
//   check           → setImmediate callbacks
//   close           → close handlers
//
//   and between EVERY phase: process.nextTick queue, then microtasks.
//
// So the orderings worth knowing:
//   process.nextTick  — before other microtasks, every phase
//   Promise.then      — microtask
//   setImmediate      — the check phase, i.e. after poll
//   setTimeout(fn, 0) — the timers phase, next turn
//
// `setImmediate` is misnamed: it is not immediate, it runs after I/O.
// `process.nextTick` is also misnamed: it runs before the next tick.
```

```js
// The production symptom of a blocked loop, and how to see it.
const start = Date.now();
setInterval(() => {
  const drift = Date.now() - start - elapsed;
  if (drift > 100) console.warn(`event loop blocked ~${drift}ms`);
}, 100);
// Timer drift is the cheapest event-loop lag monitor there is: a
// timer that should fire every 100ms and fires every 400ms tells you
// the loop was busy for 300ms. Production tooling exposes this as
// "event loop lag", and it is the single most useful Node metric —
// p99 latency rises with it even for requests doing no work.
```

```text
// Where this shapes architecture:
//
//   - Node serves high concurrency on one thread because requests are
//     I/O-bound. One CPU-bound endpoint ruins it for every other
//     endpoint in the process, which is why image processing and PDF
//     generation go to a worker or a separate service.
//
//   - A browser's 16.7ms frame budget means any task over ~16ms drops
//     a frame. Long tasks are a measured Core Web Vital (INP), so
//     this is not a theoretical concern — it is a ranking signal.
//
//   - Clustering (Node) or multiple Puma workers exist to use more
//     cores, since one loop uses one core no matter what.
```
:::

:::mistakes
**Blocking synchronously after setting a loading state.** The render never happens.

**`setTimeout(fn, 0)` expected to be immediate.** Clamped, and after all microtasks.

**Recursive microtasks.** Starvation, with no visible loop.

**`await` to yield for rendering.** It is a microtask; you need a macrotask.

**Assuming `async` defers the whole function.** Everything before the first `await` is
synchronous.

**Unhandled rejections.** Process exit in Node, silent loss in browsers.

**`*Sync` file APIs in a request handler.**

**Large `JSON.parse` on the main thread.**

**Reaching for `setTimeout` to fix a race.** It makes the race less likely and not impossible.
Fix the ordering with a promise.

**Ignoring event loop lag.** It is the metric that explains latency with no slow query attached.
:::

:::tradeoffs
**Single thread** — no data races, no locks, drastically simpler reasoning. Total blocking, and
one core.

**Microtasks** — run before anything else, so promise chains are predictable and ordering is
tight. They can starve the loop.

**Macrotasks** — yield to rendering and input between them, which is what keeps a page
responsive. Higher latency and clamped timer resolution.

**Web Workers / worker_threads** — real parallelism for CPU work, with no shared memory by
default, so still no races. Costs message-passing overhead and structured cloning, which is
expensive for large objects (`SharedArrayBuffer` and `Transferable`s exist for that).

**Clustering / multiple processes** — uses all cores and isolates failures, at the cost of memory
per process and no shared state.

**Streaming instead of buffering** — avoids the single large synchronous parse, at the cost of
more complex code.

The rule worth carrying: **the event loop is excellent at waiting and terrible at computing.**
I/O-bound work scales to thousands of concurrent operations on one thread; CPU-bound work needs
to leave the thread entirely. Almost every performance problem in JavaScript is one of those two
sentences being ignored.
:::

:::checkpoint
1. Give the output order for the five-statement example at the top, and the reason for each.
2. Why does a promise callback run before a `setTimeout(0)` queued before it?
3. `async function f() { console.log("a"); await null; console.log("b"); }` with logs around the
   call — what order, and why is "a" synchronous?
4. Why does `await Promise.resolve()` not let the browser paint, while `await setTimeout`-wrapped
   does?
5. Write a microtask starvation loop and say what the user sees.
6. One thread, ten thousand in-flight HTTP requests. Why is that cheap?
7. What is event loop lag, and how do you measure it with no library?
8. `readFileSync` in a Node request handler — what is the blast radius?
:::

:::interview
Describe the loop as a cycle with a specific ordering, and name "run to completion" explicitly:

*"One thread. The loop takes a single macrotask, runs it to completion with no interruption, then
drains the whole microtask queue — including microtasks queued during the drain — and in a browser
renders between tasks. Promise reactions are microtasks; timers, I/O callbacks and DOM events are
macrotasks. 'Run to completion' is the load-bearing part: nothing preempts a task, so a two-second
synchronous function blocks input, animation and rendering for two seconds."*

Then explain why the model works, which is the part that shows understanding:

*"What makes a single thread viable is that the waiting happens somewhere else. When I call
`fetch`, the thread does not wait — the host's networking runs on its own threads and queues a
callback when the response arrives. So ten thousand concurrent requests cost nearly nothing on the
JavaScript thread, while one tight numeric loop costs everything. The model is exactly inverted
from most people's intuition: excellent at waiting, terrible at computing."*

Add the detail that distinguishes a careful answer:

*"Two things I would flag. First, everything before the first `await` in an async function runs
synchronously — marking a function async does not defer it, so expensive work before the await
still blocks. Second, `await` only yields to the microtask queue, so it does not let the browser
paint; if I need a frame, I need a macrotask boundary. And microtasks can starve the loop — a
recursive promise chain freezes a page with no infinite loop anywhere in the source."*

If it is a Node conversation: *"the metric I actually watch is event loop lag. A timer that should
fire every 100ms firing every 400 tells you the loop was busy for 300, and p99 latency tracks it
even for requests that do no work of their own."*
:::

## What you now know

- One thread: one macrotask, then the entire microtask queue, then render, repeat.
- Microtasks are promise reactions, `queueMicrotask`, `MutationObserver`.
- Macrotasks are timers, I/O callbacks and DOM events.
- Run to completion means nothing preempts a task — blocking is total.
- The waiting happens in the host, on other threads, which is why I/O concurrency is cheap.
- All microtasks run before the next macrotask, so promise ordering is predictable.
- Recursive microtasks starve the loop and freeze the page with no visible loop.
- `await` yields to microtasks only; rendering needs a macrotask boundary.
- Everything before the first `await` runs synchronously.
- `setTimeout(fn, 0)` is clamped and runs after all microtasks.
- Unhandled rejections terminate Node and are often silently lost in browsers.
- `*Sync` APIs and large `JSON.parse` block every other request in the process.
- Node's phases: timers, pending, poll, check, close — with nextTick and microtasks between each.
- Event loop lag, measured as timer drift, is the most useful single Node metric.
- CPU-bound work belongs in a worker or another process; the loop cannot help with it.
