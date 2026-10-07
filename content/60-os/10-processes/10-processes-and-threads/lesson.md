---
title: Processes, threads and what they share
summary: One difference — a shared address space — explains why threads are fast, why they are dangerous, and why a crash takes down a process but not its siblings.
level: intermediate
minutes: 18
version: "1"
status: stable
last_reviewed: "2026-10-07"
tags: [os, processes, threads, isolation, fork]
concepts: [processes, threads, address-space, context-switch]
prerequisites: [concurrency]
interview:
  - question: What is the difference between a process and a thread?
    level: intermediate
    answer: >-
      A process owns a private address space, file descriptor table and set of permissions; a
      thread is a scheduled execution context inside one, sharing all of that with its siblings
      and owning only a stack, registers and a program counter. That single difference explains
      everything else: threads are cheap to create and switch between because there is no address
      space to swap, they can communicate by writing to the same memory, and they can corrupt
      each other for exactly the same reason. It also explains fault isolation — a segfault or an
      unhandled signal ends the whole process and every thread in it, while a sibling process
      carries on.
    followUps:
      - "So when would you choose processes over threads?"
  - question: What happens on fork?
    level: intermediate
    answer: >-
      The kernel creates a child process that is a near-copy of the parent — same memory, same
      open file descriptors, same working directory — and returns the child's pid to the parent
      and zero to the child, which is how each knows which it is. The memory is not actually
      copied: pages are marked copy-on-write and shared until one side writes, at which point
      that page is duplicated. That is what makes preforking servers memory-efficient, and also
      what makes garbage collection in a forked child expensive, because marking objects writes
      to their headers and un-shares the pages.
    followUps:
      - "Why is fork plus threads dangerous?"
  - question: Why is a context switch expensive?
    level: intermediate
    answer: >-
      Direct cost is saving and restoring registers and, for a process switch, swapping page
      tables — microseconds. The larger cost is indirect: the new task's working set is not in
      the CPU caches, so it runs slowly until they refill, and a process switch also flushes
      parts of the TLB. So the measured cost of a switch is small and the real cost is cache
      pollution, which is why a thread switch is cheaper than a process switch and why pinning
      threads to cores helps on latency-sensitive work.
    followUps:
      - "What is the practical consequence for how many threads you run?"
resources:
  - title: "Operating Systems — Three Easy Pieces"
    url: https://pages.cs.wisc.edu/~remzi/OSTEP/
---

## What each owns

```text
  PROCESS                              THREAD (within a process)
  ─────────────────────────────        ─────────────────────────────
  private address space                shares the address space
  file descriptor table                shares the descriptors
  pid, uid, permissions                shares all of them
  signal handlers                      shares them
  current working directory            shares it

  own stack, registers, PC             own stack, registers, PC

  creation: ~100s of microseconds      creation: ~10s of microseconds
  switch: ~2-5 microseconds            switch: ~1-2 microseconds
  crash: kills only itself             crash: kills the whole process
  communication: pipes, sockets,       communication: shared memory,
    shared memory segments               which is to say variables
```

:::what
A **process** is a program in execution with its own virtual address space. A **thread** is a
schedulable execution context within a process; threads in one process share its memory and
descriptors. A **context switch** is the kernel saving one task's state and restoring another's.
:::

:::why
Both exist because two different things are needed, and one mechanism cannot provide both.

Isolation is the point of a process. If a buggy program can scribble over another program's
memory, nothing is safe and nothing is debuggable. A private address space means a bug's blast
radius is one process, and the kernel can enforce that in hardware with no cooperation from the
program — which is what makes multi-tenant machines possible at all.

Sharing is the point of a thread. If two parts of one program must work on the same data
structure, copying it between address spaces is both slow and awkward. Threads let them simply
refer to the same memory, which is as fast as communication can be.

The trade is stark and worth stating plainly: **the shared address space is simultaneously the
feature and the danger.** Two threads can cooperate on a data structure at memory speed, and two
threads can corrupt that structure in a way that is nondeterministic and nearly impossible to
reproduce. Every mutex, lock and atomic exists to buy back a guarantee that separate processes
have for free.

Which gives the practical rule: **use processes for isolation, threads for sharing.** A web
server runs multiple worker processes so one crash does not take the fleet down, and threads
within each so requests can share a connection pool and a compiled template cache.
:::

:::how
```text
  THE ADDRESS SPACE, and why sharing it is the whole story

    PROCESS A                    PROCESS B
    ┌─────────────┐              ┌─────────────┐
    │ stack       │              │ stack       │
    │ ...         │              │ ...         │
    │ heap        │              │ heap        │
    │ data        │              │ data        │
    │ text (code) │              │ text (code) │
    └─────────────┘              └─────────────┘
      page table A                 page table B
          │                            │
          └────── physical memory ─────┘
                 (disjoint, enforced
                  by the MMU)

    PROCESS A with three threads
    ┌───────────────────────────┐
    │ stack T1 │ stack T2 │ T3  │  ← one each
    ├──────────┴──────────┴─────┤
    │ heap                      │  ← SHARED. Every object, every
    │ data                      │    global, every descriptor.
    │ text                      │
    └───────────────────────────┘

    A pointer in thread 1 is valid in thread 2. That is the feature.
    It is also why a use-after-free in one thread corrupts another.

  fork() — one call, two return values

    pid = fork()
      in the parent: pid = child's pid
      in the child:  pid = 0
      on failure:    pid = -1

    Everything is duplicated: memory (lazily), descriptors, cwd.
    Not duplicated: threads. The child has ONE thread, the one that
    called fork — which is why fork in a threaded program is a trap.

  COPY-ON-WRITE

    before:  parent ──┐
                      ├──▶ page (shared, read-only)
             child  ──┘

    child writes:
             parent ────▶ original page
             child  ────▶ a fresh copy

    So forking a 500MB process costs almost nothing until the pages
    are written. This is why preforking servers — Unicorn, Puma in
    cluster mode, nginx — boot the application once and then fork.

    And why GC undermines it: marking an object writes to its header,
    which triggers the copy. A full GC in a forked child can
    un-share most of the heap, which is the reason `GC.compact`
    before forking exists.

  THE PRACTICAL LIMIT ON THREAD COUNT

    More threads than cores does not add throughput for CPU-bound
    work — it adds context switches, and each one pollutes the
    caches. For I/O-bound work more threads help, because most are
    blocked and not competing for CPU.

    CPU-bound:  threads ≈ cores
    I/O-bound:  threads ≈ cores × (1 + wait/compute)
                ...bounded by whatever resource they contend for,
                which is usually a connection pool.
```
:::

:::example
```c
// fork, exec, wait — the three calls behind every shell command.
pid_t pid = fork();
if (pid == 0) {
    // Child. Replace this process's image entirely.
    execlp("ls", "ls", "-l", NULL);
    _exit(127);                 // only reached if exec failed
} else if (pid > 0) {
    int status;
    waitpid(pid, &status, 0);   // reap it, or it becomes a zombie
}
// fork copies, exec replaces. `ls` does not inherit the parent's
// code — only its descriptors, which is exactly how shell
// redirection works: the child reopens fd 1 before exec.
```

```bash
# Seeing it from outside.
ps -eLf | head                   # processes AND threads (-L)
cat /proc/$$/status | grep Threads
ls /proc/$$/fd                   # this shell's open descriptors
cat /proc/$$/maps | head          # its address space, region by region

# Threads of one process, with their individual CPU use:
top -H -p $(pgrep -f puma | head -1)
# Useful when one thread is spinning and the process looks "50% busy"
# on a two-core box — the aggregate hides which thread it is.
```

```ruby
# The isolation argument, concretely.
# Threads: a crash takes everything.
Thread.new { raise NoMemoryError }     # may bring down the process
# Processes: a crash takes one worker.
pid = fork { do_risky_work }
Process.wait(pid)                       # the parent survives regardless

# This is why Puma runs `workers` (processes) and `threads` per
# worker: the processes give fault isolation and use multiple cores,
# the threads give cheap concurrency for I/O within each.
# One segfault in a C extension kills one worker's in-flight
# requests rather than the whole fleet.
```
:::

:::failure
**`fork` in a threaded program.** The classic trap, and the reason `fork` is effectively
deprecated in modern multithreaded code:

```text
Only the calling thread survives in the child. So:

  - a mutex held by another thread at the moment of fork is now
    locked forever in the child, with no thread able to release it
  - a connection pool's bookkeeping thread does not exist, but its
    data structures do, so the child has a pool it cannot manage
  - a malloc arena mid-operation stays mid-operation

The child then deadlocks on its first allocation or its first
database query, intermittently, depending on timing. POSIX
specifies that only async-signal-safe functions may be called
between fork and exec for exactly this reason.
```

**Shared file descriptors after fork.** Parent and child share the *offset*:

```c
int fd = open("log", O_WRONLY | O_APPEND);
fork();
// Both write to the same descriptor. With O_APPEND the writes are
// atomic and interleave safely. Without it, both hold the same
// offset and overwrite each other's output.
```

**Zombie processes.** A child that has exited stays in the process table until the parent calls
`wait`. A long-running parent that forks without reaping accumulates entries until the table is
full and no process on the machine can fork.

**Assuming threads give you cores.** Under a global interpreter lock — CPython, Ruby's MRI —
threads do not execute bytecode in parallel. Four CPU-bound threads on four cores take the same
time as one. Processes are the answer there.

**Too many threads.** A thread's stack is reserved address space — typically 1MB to 8MB — so
10,000 threads is gigabytes of reservation plus a scheduler run queue that no longer fits in
cache. The practical answer for high concurrency is an event loop or async runtime, not more
threads.

**Not sizing threads against the resource they contend for.** Twenty threads sharing a
five-connection pool means fifteen are blocked in `checkout`, and the symptom looks exactly like
a slow database. This is the same observation as the Puma misconfiguration in the Ruby track and
it generalises: a thread is only useful if the resource it needs is available.

**Ignoring that signals are per-process.** A signal handler runs on an arbitrary thread, and the
handler shares all the process's state. Doing real work in a handler — allocating, taking a lock
— can deadlock against the thread that was interrupted.
:::

:::realworld
```text
// How real servers combine the two, and why.

  nginx       — one master process, N workers (one per core), each
                 single-threaded with an event loop. Processes for
                 isolation and cores, an event loop for concurrency.
                 No thread safety to reason about at all.

  Puma        — N worker processes × M threads. Processes for cores
                 and fault isolation, threads for I/O overlap within
                 a worker. Requires thread-safe application code.

  Unicorn     — N worker processes, one thread each. No thread
                 safety required, one request at a time per worker,
                 so memory per worker × N and no concurrency within.

  PostgreSQL  — one process per connection. Excellent isolation, and
                 expensive enough that a connection pooler
                 (pgbouncer) is standard at scale.

  Chrome      — one process per site, plus GPU and network
                 processes. A renderer crash loses one tab, and a
                 compromised renderer is sandboxed away from your
                 files. The memory cost is the famous trade.

// The pattern: processes for isolation and for using cores, and
// either threads or an event loop for concurrency within. Almost
// nothing serious uses one mechanism alone.
```

```bash
# Diagnosing a stuck process, in order.
ps -o pid,stat,wchan,cmd -p PID
#  STAT: R running · S interruptible sleep · D UNINTERRUPTIBLE
#  sleep (usually disk I/O) · Z zombie · T stopped
#  A process in D cannot be killed, which is why `kill -9` sometimes
#  appears to do nothing — it is waiting on the kernel, not on you.

cat /proc/PID/stack                  # where in the kernel it is
strace -p PID                        # which syscall it is in
strace -f -p PID                     # ...following threads
gdb -p PID -batch -ex 'thread apply all bt'   # every thread's stack

# For a hung request this sequence finds the answer faster than
# reading code, because it tells you what the process is actually
# waiting for rather than what you think it is doing.
```
:::

:::mistakes
**`fork` in a threaded program.** Mutexes held by vanished threads deadlock the child.

**Not reaping children.** Zombies fill the process table.

**Sharing a descriptor offset without `O_APPEND`.** Interleaved, overwritten output.

**Expecting threads to use multiple cores under a GIL.**

**Thousands of threads.** Stack reservation and scheduler overhead; use async.

**Threads exceeding the pool they contend for.** Blocked threads look like a slow dependency.

**Real work in a signal handler.** It can deadlock against the interrupted thread.

**Assuming a thread crash is survivable.** An unhandled segfault ends the process.

**Forgetting copy-on-write is undone by writes.** A GC in a forked child un-shares the heap.
:::

:::tradeoffs
**Processes** — hard isolation enforced by hardware, fault containment, and they use multiple
cores regardless of any interpreter lock. Costs memory per process (much reduced by
copy-on-write), and inter-process communication rather than shared variables.

**Threads** — cheap to create and switch, shared memory so communication is free, and every
shared mutable structure becomes your problem. One crash ends all of them.

**Preforking** — boot once and fork, so the application's memory is shared copy-on-write. Costs
you the `fork`-plus-threads hazard and makes GC behaviour matter.

**Event loop, single thread** — no locks, no races, excellent for I/O concurrency, one core, and
total blocking when something computes.

**Processes plus threads** — what most production servers do, because it gets isolation and cores
from one and cheap I/O concurrency from the other. Costs you thread-safe application code.

**Async runtimes** — tens of thousands of concurrent operations without a thread each, at the
cost of a different programming model and a blocking call anywhere stalling a whole executor
thread.

The rule that holds: **processes for isolation, threads for sharing, an event loop for waiting.**
Most real systems need two of the three, and choosing by habit rather than by which property you
actually want is where the avoidable complexity comes from.
:::

:::checkpoint
1. List what a thread owns and what it shares. Which single item explains most of the
   consequences?
2. What does `fork` return, and how does each process know which it is?
3. Why does forking a 500MB process cost almost nothing, and what undoes that?
4. Why is `fork` in a threaded program dangerous? Give a concrete deadlock.
5. What is a zombie process, and what eventually breaks because of them?
6. Why is a thread switch cheaper than a process switch, and what is the larger hidden cost of
   both?
7. Twenty threads, a five-connection pool. What does the dashboard show?
8. Why does nginx use processes with an event loop while Puma uses processes with threads?
:::

:::interview
Answer with the one difference and then derive the rest from it:

*"A process owns a private address space, descriptor table and permissions; a thread shares all
of that with its siblings and owns only a stack, registers and a program counter. That single
difference explains everything else. Threads are cheap to create and switch because there is no
address space to swap. They communicate by writing to the same memory, which is as fast as
communication gets. And they can corrupt each other for exactly the same reason — so every mutex
exists to buy back a guarantee that separate processes have for free. It also explains fault
isolation: a segfault ends the whole process and every thread in it, while a sibling process
carries on."*

Then give the rule, which is what the question is really asking:

*"So processes for isolation, threads for sharing. That is why Puma runs worker processes and
threads within each — the processes give fault containment and use multiple cores regardless of
the GIL, the threads give cheap I/O overlap and share a connection pool. And why nginx runs
processes with a single-threaded event loop instead: it has no shared mutable state to protect, so
it gets concurrency without any thread safety to reason about."*

The `fork` detail is worth volunteering, since it shows real experience:

*"The trap I would flag is `fork` in a threaded program. Only the calling thread survives in the
child, but all the memory does — so a mutex held by another thread at the moment of fork is locked
forever in the child with nothing able to release it, and the child deadlocks on its first
allocation or first query, intermittently. That is why POSIX restricts you to async-signal-safe
calls between fork and exec, and why preforking servers fork before starting any threads."*

And the sizing point: *"more threads than cores adds nothing for CPU-bound work — just context
switches and cache pollution — and for I/O-bound work the real limit is whatever resource they
contend for. Twenty threads against a five-connection pool means fifteen are blocked in checkout,
and that looks exactly like a slow database while the database is idle."*
:::

## What you now know

- A process owns an address space; a thread shares one and owns only a stack and registers.
- That single difference explains speed, communication, corruption and fault isolation.
- `fork` returns the child's pid to the parent and 0 to the child.
- `fork` copies memory lazily via copy-on-write, which is why preforking is cheap.
- Writes — including GC marking object headers — undo the sharing.
- Only the calling thread survives `fork`, so held mutexes deadlock the child.
- Unreaped children become zombies and eventually fill the process table.
- Parent and child share a descriptor's offset; `O_APPEND` makes concurrent writes safe.
- Under a GIL, threads give concurrency but not parallel bytecode execution.
- A thread switch is cheaper than a process switch; the real cost of both is cache pollution.
- Thread count should match cores for CPU work, and the contended resource for I/O work.
- A signal handler runs on an arbitrary thread and shares all process state.
- A process in state D is in uninterruptible sleep and cannot be killed.
- Processes for isolation, threads for sharing, an event loop for waiting.
