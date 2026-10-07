---
title: Threads, the GVL and the rest
summary: Why Ruby threads make I/O faster and computation no faster at all — and what Ractors, processes and fibers each actually buy you.
level: expert
minutes: 20
version: "3.4"
status: stable
last_reviewed: "2026-10-07"
tags: [ruby, concurrency, threads, gvl, ractor, fibers]
concepts: [concurrency, parallelism, gvl, thread-safety]
prerequisites: [objects, mutability]
interview:
  - question: What is the GVL and what does it mean for threads?
    level: expert
    answer: >-
      The Global VM Lock means only one thread can execute Ruby bytecode at a time within a
      process. So threads give you concurrency but not parallelism for Ruby code: four
      CPU-bound threads on four cores take the same wall-clock time as one. What makes threads
      genuinely useful is that the GVL is released around blocking I/O — a socket read, a
      database query, a file operation — so while one thread waits on the network, others run
      Ruby. That is why a web server benefits enormously from threads despite the GVL: most
      request time is waiting. For CPU-bound work you need separate processes, or Ractors.
    followUps:
      - "So why is thread safety still a concern if only one runs at a time?"
  - question: If the GVL means one thread at a time, why do race conditions still happen?
    level: expert
    answer: >-
      Because the GVL guarantees only that one thread executes bytecode at a time, not that any
      operation you care about is atomic. A thread can be preempted between bytecode
      instructions, and `@count += 1` is at least three — read, add, write — so two threads can
      both read the same value and both write the incremented one. The GVL protects the VM's own
      internal structures from corruption; it says nothing about your application's invariants.
      That is why you still need a Mutex, or atomic data structures from concurrent-ruby.
    followUps:
      - "Which operations are actually atomic?"
  - question: When would you use a Ractor rather than threads or processes?
    level: expert
    answer: >-
      When you want true parallelism for Ruby code within one process. Each Ractor has its own
      GVL, so CPU-bound work genuinely runs in parallel — and the price is that Ractors cannot
      share mutable objects. You pass deeply-frozen (shareable) objects or copies, which turns
      thread-safety from a discipline into something the runtime enforces. The practical catch
      is maturity: Ractors remain experimental, most gems are not Ractor-safe, and anything
      touching global state tends to raise. For CPU-bound work today, separate processes are
      usually still the pragmatic answer.
    followUps:
      - "What makes an object shareable?"
resources:
  - title: "Ruby docs — Thread"
    url: https://docs.ruby-lang.org/en/master/Thread.html
---

## The measurement that explains everything

```ruby
require "benchmark"

def cpu_work = 8_000_000.times { |i| i * 2 }

Benchmark.realtime { 4.times { cpu_work } }                        # ~1.6s
Benchmark.realtime { 4.times.map { Thread.new { cpu_work } }.each(&:join) }  # ~1.6s
#                                                              no faster.

def io_work = sleep(0.5)   # stands in for a network call

Benchmark.realtime { 4.times { io_work } }                         # ~2.0s
Benchmark.realtime { 4.times.map { Thread.new { io_work } }.each(&:join) }   # ~0.5s
#                                                              4x faster.
```

Four threads, four cores, and CPU work is not faster while I/O work is four times faster.
That is the GVL, in two measurements.

:::what
The **GVL** (Global VM Lock) permits only one thread per process to execute Ruby bytecode at
a time. **Concurrency** is multiple tasks in progress; **parallelism** is multiple tasks
executing simultaneously. Ruby threads give you concurrency always, and parallelism only for
the parts that are not executing Ruby — I/O, and C extensions that release the lock.
:::

:::why
The GVL exists because it makes the interpreter and every C extension dramatically simpler to
write correctly.

Without it, every piece of VM internal state — the object heap, the method cache, the
constant table, the GC's own bookkeeping — would need its own locking, and so would every C
extension ever written. Getting that right is hard, and getting it wrong produces crashes
rather than incorrect answers. The GVL buys correctness-by-default at the cost of parallel
Ruby execution.

The reason this was an acceptable trade for so long is the shape of the typical Ruby workload.
A web request spends most of its time waiting: on the database, on a cache, on an HTTP call to
another service. Waiting does not need the GVL, so it is released — which means threads
deliver nearly all the benefit you would have wanted from parallelism for that workload. The
trade only hurts when your work is genuinely CPU-bound, and that is what Ractors and separate
processes are for.
:::

:::how
```text
  WHAT RELEASES THE GVL

    sleep                       yes
    socket / HTTP               yes
    File read / write           yes
    database query (pg, mysql2) yes — the driver releases it
    Ruby computation            NO
    String / Array operations   NO
    C extension                 only if it explicitly does so

  SO:

    Thread 1  ██▓▓▓▓▓▓▓▓░░██            █ running Ruby
    Thread 2  ░░██▓▓▓▓▓▓▓▓░░            ▓ waiting on I/O (GVL released)
    Thread 3  ░░░░██▓▓▓▓▓▓██            ░ ready, waiting for the GVL
              └ overlapping I/O: this is the whole win

  CPU-bound:

    Thread 1  ████░░░░░░░░
    Thread 2  ░░░░████░░░░            interleaved, never simultaneous.
    Thread 3  ░░░░░░░░████            Same total time, plus switching.


  WHY A RACE IS STILL POSSIBLE

    @count += 1   compiles to roughly:

      getinstancevariable  @count     ← thread can be preempted here
      putobject            1
      opt_plus
      setinstancevariable  @count     ← or here

    Two threads: both read 5, both compute 6, both write 6.
    Final value 6, not 7. One increment lost.

    The GVL protects the VM. It does not make your operations atomic.
```
:::

:::failure
**The lost increment, which is the canonical demonstration.**

```ruby
count = 0
10.times.map { Thread.new { 10_000.times { count += 1 } } }.each(&:join)
count   # 100_000 if you are lucky; typically less, and varies per run

# Fixed with a mutex:
count = 0
m = Mutex.new
10.times.map { Thread.new { 10_000.times { m.synchronize { count += 1 } } } }.each(&:join)
count   # 100_000, always

# Or with an atomic from concurrent-ruby — no lock, and faster here:
require "concurrent"
count = Concurrent::AtomicFixnum.new(0)
10.times.map { Thread.new { 10_000.times { count.increment } } }.each(&:join)
count.value   # 100_000
```

**The lazily-initialised shared object.**

```ruby
class Client
  def self.instance
    @instance ||= expensive_setup     # two threads → two setups
  end
end
# Both threads see nil, both run setup, one wins. If setup opens a
# connection or registers a handler, the loser leaks it silently.

# Correct: initialise eagerly at boot, or guard it.
MUTEX = Mutex.new
def self.instance
  MUTEX.synchronize { @instance ||= expensive_setup }
end
```

**Thread-local state that is not as local as you think.**

```ruby
Thread.current[:user] = user     # fiber-local, despite the name
Thread.current.thread_variable_set(:user, user)  # genuinely thread-local
# In a server using fibers (falcon) or with Enumerator::Lazy, the
# first one does not persist where you expect.
# And on a threaded server, a thread is REUSED between requests —
# anything left in it leaks into the next request.
```

**Swallowing a thread's exception.**

```ruby
t = Thread.new { raise "boom" }
sleep 1
puts "still here"        # the exception is silent until you join
t.join                   # NOW it raises, in the calling thread

# Make failures loud:
Thread.abort_on_exception = true          # process-wide
Thread.new { ... }.tap { |t| t.abort_on_exception = true }   # per thread
# Or always join and handle. A thread that dies quietly is a job
# that silently never ran.
```

**`Timeout.timeout`, which is unsafe in a way that is worth knowing.**

```ruby
Timeout.timeout(5) { do_something }
# It raises an exception in another thread at an arbitrary point —
# possibly inside an ensure block, mid-way through a two-step state
# change, or while a mutex is held. Use the library's own timeout
# (HTTP read_timeout, Postgres statement_timeout) wherever one exists.
```
:::

:::internals
```text
  THE FOUR MODELS, and what each actually gives you

  PROCESSES
    ✓ true parallelism, ✓ fault isolation, ✓ works with every gem
    ✗ memory per process (mitigated by copy-on-write and preforking)
    ✗ no shared memory — IPC or a database to communicate
    → Puma/Unicorn workers, Sidekiq processes. The default answer
      for CPU-bound work.

  THREADS
    ✓ cheap, ✓ shared memory, ✓ excellent for I/O overlap
    ✗ no parallel Ruby execution, ✗ every shared mutable object is
      your problem
    → Puma threads, connection pools, parallel HTTP fan-out.

  FIBERS
    ✓ extremely cheap (thousands), ✓ cooperative so no preemption
      mid-operation — which removes a whole class of race
    ✗ you must yield explicitly, ✗ one blocking call without a
      fiber scheduler blocks everything
    → Async/Falcon, generators (Enumerator is built on fibers).

  RACTORS
    ✓ true parallelism for Ruby code, ✓ isolation enforced by the
      runtime rather than by discipline
    ✗ experimental, ✗ cannot share mutable objects, ✗ most gems are
      not Ractor-safe and global state raises
    → CPU-bound work, once the ecosystem catches up.


  WHAT MAKES AN OBJECT SHAREABLE (Ractors)

    Ractor.shareable?(42)                  → true  (immutable)
    Ractor.shareable?("x".freeze)          → true
    Ractor.shareable?({a: [1]}.freeze)     → false (nested mutable)
    Ractor.make_shareable({a: [1]})        → deep-freezes it

    This is the mutability lesson turned into a runtime check: the
    only objects two Ractors can share are ones neither can change.
```
:::

:::realworld
```ruby
# 1. Parallel I/O fan-out — the pattern threads are genuinely for.
#    Three independent HTTP calls: 300ms total instead of 900ms.
results = [url_a, url_b, url_c].map { |u| Thread.new { fetch(u) } }.map(&:value)
#                                                              ^^^^^
# `value` joins AND returns the result AND re-raises any exception
# in the caller. Prefer it to `join` for exactly that reason.

# 2. A bounded thread pool, because unbounded threads are a different
#    outage. 1000 URLs should not become 1000 sockets.
require "concurrent"
pool = Concurrent::FixedThreadPool.new(10)
futures = urls.map { |u| Concurrent::Future.execute(executor: pool) { fetch(u) } }
results = futures.map(&:value!)      # value! re-raises; value returns nil
pool.shutdown
pool.wait_for_termination
```

```ruby
# 3. Puma's two dials, and how to reason about them.
#    workers = processes (parallelism, bounded by cores)
#    threads = per worker (I/O overlap, bounded by DB pool)
#
#      workers 4, threads 5  → up to 20 concurrent requests
#      database pool MUST be >= 5, or threads queue for a connection
#      and the symptom looks exactly like a slow database
#
# This is the single most common Rails misconfiguration: threads
# raised without raising the pool.
```

```ruby
# 4. Thread safety in Rails, concretely.
#    Request-scoped state must not live in a class variable, because
#    a threaded server runs several requests in one process.
class Current
  def self.user = Thread.current.thread_variable_get(:current_user)
  def self.user=(u) = Thread.current.thread_variable_set(:current_user, u)
end
# Better: ActiveSupport::CurrentAttributes, which does this AND
# resets between requests. The reset is the part people forget —
# threads are pooled and reused, so leftover state leaks forward.

# Memoising on a class is shared across all threads:
class Config
  def self.settings = @settings ||= load_settings   # race on first call
end
# Load it at boot. Eager initialisation is the simplest thread safety
# there is.
```

```ruby
# 5. Ractors, for when the work really is CPU-bound.
rs = 4.times.map do |i|
  Ractor.new(i) do |n|
    (n * 1000..(n + 1) * 1000).sum { |x| expensive(x) }
  end
end
rs.sum(&:take)
# Genuinely parallel. Expect warnings, and expect gems to object.
```
:::

:::mistakes
**Expecting threads to speed up CPU-bound work.** They cannot, within one process. Use
processes or Ractors.

**Assuming `+=`, `<<` or `||=` are atomic.** None are. Mutex or an atomic type.

**Memoising shared state lazily.** `@x ||=` on a class in a threaded server is a race. Load
at boot.

**Unbounded thread creation.** `urls.map { Thread.new { ... } }` with 1000 urls. Use a pool.

**Threads outnumbering the connection pool.** Threads then block waiting for a connection and
it looks like database slowness.

**Using `Thread.current[]` for thread-local state.** It is fiber-local. Use
`thread_variable_set`, or `ActiveSupport::CurrentAttributes`.

**Leaving state in a pooled thread.** Threads are reused between requests. Reset explicitly.

**Ignoring a thread's exception.** It is silent until `join` or `value`. Prefer `value`, or
set `abort_on_exception`.

**`Timeout.timeout` for anything important.** It raises at an arbitrary point in another
thread. Use the library's own timeout.

**Sharing an ActiveRecord connection between threads.** Each thread must check out its own;
`with_connection` exists for this.
:::

:::tradeoffs
**Threads** — cheap, shared memory, and the right tool for overlapping I/O, which is most of
what a web app does. You take on responsibility for every shared mutable object, and you get
no parallel Ruby execution.

**Processes** — real parallelism, real fault isolation, every gem works. Costs memory per
process (substantially reduced by preforking and copy-on-write) and gives you no shared
memory.

**Fibers** — thousands of them, and cooperative scheduling means no preemption mid-operation,
which eliminates a category of race. Costs an explicit yield discipline and a fiber-aware
scheduler for I/O; one unaware blocking call stalls everything.

**Ractors** — true parallelism with isolation the runtime enforces rather than something you
must remember. Costs: experimental, no shared mutable state, and an ecosystem that is not
ready.

**Immutability** — the cheapest thread safety available, because a frozen object needs no
lock. Costs allocation per change, and it is the strategy Ractors make mandatory.

The decision procedure that holds today: **I/O-bound → threads.** **CPU-bound → processes**
(Ractors when the ecosystem allows). **Lots of concurrent connections → fibers.** And in every
case, prefer sharing nothing over sharing with a lock, because a lock is a thing a future
caller can forget.
:::

:::checkpoint
1. Four threads, four cores, CPU-bound work. Faster than one thread? What about four
   `sleep(1)` calls?
2. Name four things that release the GVL and two that do not.
3. If only one thread runs Ruby at a time, how can `@count += 1` lose an increment?
4. Puma with 4 workers × 5 threads and a database pool of 5. What is wrong, and what is the
   symptom?
5. `Thread.current[:user]` versus `thread_variable_set` — what is the difference, and why
   does thread reuse matter?
6. `Thread.new { raise "boom" }` — when do you find out?
7. Why can two Ractors not share `{a: [1]}.freeze`?
:::

:::interview
Give the two measurements rather than the definition — it is the fastest way to show you
understand the consequence:

*"Only one thread executes Ruby bytecode per process. So four CPU-bound threads on four cores
take the same wall-clock time as one, while four threads each waiting on a 500ms HTTP call take
500ms total instead of two seconds — because the GVL is released around blocking I/O. That is
why Puma's thread setting is worth having despite the GVL: a web request is mostly waiting."*

Then the point most people get wrong, which is a good differentiator:

*"The GVL does not give you thread safety. It guarantees one thread executes bytecode at a
time, not that any operation is atomic — a thread can be preempted between bytecode
instructions, and `@count += 1` is three of them, so two threads can both read 5 and both write
6. The GVL protects the VM's internal structures; my application's invariants are still mine."*

Then the practical configuration answer, which signals production experience:

*"The misconfiguration I look for first is Puma threads exceeding the database pool. Threads
then block waiting to check out a connection, and the symptom is indistinguishable from a slow
database — the dashboard says the database is the problem while the database is idle."*

And on Ractors, be accurate about readiness: *"they give true parallelism because each has its
own GVL, and they enforce isolation by refusing to share mutable objects — which turns thread
safety into a runtime check instead of a discipline. But they are still experimental and most
gems are not Ractor-safe, so for CPU-bound work today I would use separate processes."*
:::

## What you now know

- The GVL allows one thread per process to execute Ruby bytecode at a time.
- Threads give concurrency always, parallelism only where Ruby is not executing.
- The GVL is released around I/O — sockets, files, database drivers — and not around
  computation.
- The GVL is not thread safety: `+=`, `<<` and `||=` are multiple bytecodes and can interleave.
- Lazy memoisation of shared state is a race. Initialise at boot.
- Use a bounded pool; unbounded `Thread.new` is its own outage.
- Puma threads must not exceed the database pool, or threads queue and it looks like DB
  slowness.
- `Thread.current[]` is fiber-local; use `thread_variable_set` or `CurrentAttributes`.
- Threads are pooled and reused, so request-scoped state must be reset.
- A thread's exception is silent until `join`/`value`. Prefer `value`.
- `Timeout.timeout` raises at an arbitrary point; use the library's own timeout.
- Processes for CPU-bound work, threads for I/O, fibers for many connections, Ractors when
  the ecosystem is ready.
- Ractors can share only deeply-frozen objects, which makes immutability enforceable.
