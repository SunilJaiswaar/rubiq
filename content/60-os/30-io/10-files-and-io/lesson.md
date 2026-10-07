---
title: Files, durability and waiting on many sockets
summary: Why a successful write may not be on disk, and the three mechanisms for waiting on ten thousand connections at once.
level: expert
minutes: 18
version: "1"
status: stable
last_reviewed: "2026-10-07"
tags: [os, io, fsync, epoll, durability]
concepts: [buffered-io, fsync, io-multiplexing, file-descriptors]
prerequisites: [virtual-memory, processes]
interview:
  - question: Does a successful `write` mean the data is on disk?
    level: expert
    answer: >-
      No. `write` copies into the kernel's page cache and returns; the data is durable only after
      `fsync` (or `fdatasync`) returns successfully. In between there is a window — typically up
      to 30 seconds by default — where a power loss or kernel panic loses it, though a process
      crash does not, since the page cache belongs to the kernel. That distinction matters: for
      process-crash safety `write` is enough, and for power-loss safety you need `fsync`. And the
      file's data being durable does not make its directory entry durable, so after creating a
      new file you must fsync the containing directory too.
    followUps:
      - "So how does a database guarantee durability?"
  - question: How do you wait on ten thousand sockets?
    level: expert
    answer: >-
      `epoll` on Linux, `kqueue` on BSD and macOS, or `io_uring` for the newest approach. The
      older `select` and `poll` take the entire set of descriptors on every call and scan it, so
      they are O(n) per call and `select` additionally caps out at 1024 descriptors. `epoll`
      registers interest once and returns only the ready descriptors, so it is O(ready) rather
      than O(watched) — which is what made the C10k problem solvable and is why every event-driven
      server is built on it. `io_uring` goes further by making the I/O itself asynchronous rather
      than just the readiness notification, which removes syscall overhead at high rates.
    followUps:
      - "What is the difference between readiness and completion?"
  - question: What is a file descriptor, and why do you run out?
    level: expert
    answer: >-
      A small integer indexing into the process's file descriptor table, which points at kernel
      objects — files, sockets, pipes, timers, epoll instances. You run out because the limit is
      per process and much lower than people expect: often 1024 soft by default, and every
      connection, every open file and every epoll registration consumes one. The symptom is
      `EMFILE` or "too many open files", and the usual cause is a leak — descriptors not closed on
      an error path — rather than genuine demand. Raising the limit treats the symptom; `ls
      /proc/PID/fd` finds the cause.
    followUps:
      - "How would you find a descriptor leak?"
resources:
  - title: "The C10K problem"
    url: http://www.kegel.com/c10k.html
---

## The write that was not written

```c
int fd = open("data.txt", O_WRONLY | O_CREAT, 0644);
write(fd, buf, len);     // returns len. Success.
close(fd);               // returns 0. Success.
// Pull the power cable now. The data may be gone.
//
// `write` copied into the page cache. The kernel will flush it
// within ~30 seconds, or sooner under pressure. `close` does not
// flush.

fsync(fd);               // NOW it is on the device — if this returns 0.
```

:::what
**Buffered I/O** means `write` copies into the kernel's page cache and returns before the device
has the data. **`fsync`** forces those pages to the device and waits. A **file descriptor** is a
per-process integer referring to a kernel object. **I/O multiplexing** is waiting on many
descriptors with one thread.
:::

:::why
Buffering exists because a disk write is five orders of magnitude slower than a memory write, and
most writes are followed by more writes to the same region.

Without the page cache, appending a line to a log would cost a device round trip, and a program
writing a byte at a time would be unusable. With it, writes accumulate in memory, get merged and
reordered into efficient device operations, and reads of recently written data never touch the
device at all. The performance difference is not marginal — it is the difference between software
being feasible and not.

The cost is that "written" no longer means "safe", and the gap is the single most misunderstood
thing about file I/O. Two different failures need distinguishing: a **process crash** loses
nothing, because the page cache belongs to the kernel and survives; a **power loss or kernel
panic** loses whatever has not been flushed. So the question is never "is my data safe" but
"safe against what", and the answer determines whether you need `fsync` at all.

Multiplexing exists for a different reason: a thread per connection does not scale. Ten thousand
threads is gigabytes of stack reservation and a scheduler run queue that thrashes the cache, so
the only way to serve ten thousand idle-most-of-the-time connections is for one thread to wait on
all of them. That is what `epoll` provides, and the shift from O(watched) to O(ready) is what
made it possible at all.
:::

:::how
```text
  THE PATH OF A WRITE

    write(fd, buf, n)
      │
      ▼  copy into the page cache (memory)        ~100ns/KB
    return n                                      ← "success"
      │
      │  ...dirty page, waiting
      │
      ▼  flushed by the kernel (writeback thread,
         or fsync, or memory pressure, or ~30s)
      │
      ▼  device write cache                        the device says
      │                                            "done" early too
      ▼  actual platters / NAND                    ← now durable

  fsync waits for the device to confirm, and asks it to flush its
  own cache. Consumer SSDs have been known to lie about this,
  which is why enterprise drives advertise power-loss protection.

  WHAT EACH FAILURE LOSES

    process crash (SIGKILL, segfault)
      → nothing. The page cache is the kernel's.
    kernel panic / power loss
      → everything not yet flushed.
    disk failure
      → everything, which is what replication is for.

  So: fsync protects against power loss, not against your program
  crashing. A great deal of code calls fsync for the wrong reason.

  THE DIRECTORY PROBLEM — the detail people miss

    fd = open("new.txt", O_CREAT|O_WRONLY)
    write(fd, data)
    fsync(fd)                  ← the DATA is durable
    close(fd)
    // power loss here: the file may not EXIST. The directory
    // entry naming it is itself metadata in another block, and
    // that has not been flushed.

    dirfd = open(".", O_RDONLY)
    fsync(dirfd)               ← now the name is durable too

  The atomic-replace pattern, which is what every careful writer
  does:

    write to tmp → fsync(tmp) → rename(tmp, final) → fsync(dir)

    `rename` within a filesystem is atomic, so a reader sees either
    the old file or the new one, never a partial write. This is how
    editors, package managers and config writers avoid truncated
    files.

  WAITING ON MANY DESCRIPTORS

    select(n, &readfds, ...)
      - pass the whole set every call, kernel scans all of it
      - O(n) per call, and n ≤ 1024 (FD_SETSIZE)
      - the set is modified, so you rebuild it each time

    poll(fds, n, timeout)
      - no 1024 limit, still O(n) per call

    epoll_create / epoll_ctl / epoll_wait
      - register interest ONCE
      - epoll_wait returns only the READY descriptors
      - O(ready), not O(watched)
      → 10,000 connections with 10 active costs 10 units of work,
        not 10,000. This is the whole answer to C10k.

    io_uring
      - submission and completion queues shared with the kernel
      - asynchronous COMPLETION, not just readiness: you submit
        "read this" and are told when the data is there
      - batches many operations per syscall, so syscall overhead
        stops dominating at high rates
```
:::

:::example
```c
// 1. Durable write, done properly.
int fd = open("data.tmp", O_WRONLY | O_CREAT | O_TRUNC, 0644);
write(fd, buf, len);
if (fsync(fd) != 0) { /* HANDLE THIS. A failed fsync means the data
                         is lost, and on Linux the error may be
                         reported once and then cleared. */ }
close(fd);
rename("data.tmp", "data.txt");       // atomic within a filesystem
int dirfd = open(".", O_RDONLY);
fsync(dirfd);                          // make the rename durable
close(dirfd);
// Four steps, each necessary. Omitting the last one means the file
// may still have its old contents after a power loss despite
// everything above succeeding.
```

```c
// 2. epoll, the shape of every event-driven server.
int ep = epoll_create1(0);
struct epoll_event ev = { .events = EPOLLIN | EPOLLET, .data.fd = sock };
epoll_ctl(ep, EPOLL_CTL_ADD, sock, &ev);      // register once

struct epoll_event events[64];
for (;;) {
    int n = epoll_wait(ep, events, 64, -1);    // only ready ones
    for (int i = 0; i < n; i++) handle(events[i].data.fd);
}
// EPOLLET is edge-triggered: you are told when readiness CHANGES,
// so you must read until EAGAIN or you will not be told again and
// the connection hangs. Level-triggered (the default) re-reports
// while data remains, which is more forgiving and slightly more
// syscalls.
```

```bash
# 3. Finding a descriptor leak — the usual cause of EMFILE.
ls -l /proc/PID/fd | wc -l           # how many are open
ls -l /proc/PID/fd | awk '{print $NF}' | sort | uniq -c | sort -rn | head
#   4812 socket:[12345678]           ← sockets not being closed
#     12 /var/log/app.log
# The grouping is what identifies the leak: thousands of one kind
# means an error path that returns without closing.

cat /proc/PID/limits | grep 'open files'
#   Max open files   1024   1048576
#              soft ─┘      └─ hard
ulimit -n 65536                       # raise the soft limit
# Raising it buys time. The grouping above finds the bug.

# 4. Is the system actually I/O-bound?
iostat -x 1
#   %util   — how busy the device is (misleading on SSDs with
#             parallel queues, where 100% does not mean saturated)
#   await   — average wait per request, the number that matters
#   aqu-sz  — queue depth; high with low await means healthy
#             parallelism, high with high await means saturation
```

```c
// 5. When fsync is too slow: the three honest options.
//
// a. fdatasync — flushes data but not metadata like mtime. Cheaper,
//    and sufficient when the file size has not changed.
// b. Batch — one fsync for many logical writes. This is what a
//    database's group commit does: several transactions share one
//    flush, so throughput rises while each one's latency is
//    slightly worse.
// c. Accept the window — explicitly, with a documented bound.
//    Postgres's synchronous_commit = off is exactly this: much
//    faster commits, and a crash loses the last fraction of a
//    second. For analytics that is a good trade; for payments it
//    is not.
//
// What is not an option is calling fsync and ignoring its return
// value, which is a durability guarantee you did not actually get.
```
:::

:::failure
**Believing `write` is durable.** The most common misunderstanding here. It is durable against a
process crash and not against power loss.

**Not fsyncing the directory after creating a file.** The data survives and the name does not, so
the file appears to have its old contents or not to exist.

**Ignoring `fsync`'s return value.** A failed `fsync` means the data is lost — and historically
on Linux the error was reported once and then the pages were marked clean, so a retry returned
success while the data was gone. This caused real data loss in PostgreSQL and was the subject of
the "fsyncgate" discussion. Treat a failed `fsync` as unrecoverable for that file.

**`fsync` per write in a loop.** Each one is a device round trip — hundreds of microseconds to
milliseconds — so a thousand logged events become a second of waiting. Batch them.

**Edge-triggered `epoll` without draining.** With `EPOLLET` you are notified when readiness
changes, so if you read once and leave data in the buffer you will never be notified again and
the connection silently hangs. Read until `EAGAIN`.

**A thread per connection at scale.** Ten thousand threads is gigabytes of stack reservation and
a scheduler that thrashes. This is precisely what `epoll` was invented to replace.

**`select` in new code.** Hard-capped at 1024 descriptors on most systems, and it modifies the
sets you pass so they must be rebuilt every call. There is no reason to choose it now.

**Not handling partial writes.** `write` may return less than you asked for, especially on a
socket or a pipe. Code that assumes the full length silently truncates data.

**Descriptor leaks on error paths.** The happy path closes; the exception path returns early.
Every `EMFILE` incident is this. Use RAII, `defer`, `ensure`, or a `with` block so closing is not
a statement someone can skip.

**`%util` read as saturation on an SSD.** A device that can serve 32 requests in parallel reports
100% utilisation while handling one request at a time. `await` and queue depth are the meaningful
numbers.
:::

:::realworld
```text
// How databases get durability, which is the worked example of
// everything above.
//
//   Write-ahead log: before modifying a data page, append the
//   change to a sequential log and fsync THAT. Sequential appends
//   are the fastest thing a device does, and recovery replays the
//   log.
//
//   Group commit: several concurrent transactions wait for one
//   fsync. Each commit's latency rises slightly; total throughput
//   rises a great deal.
//
//   Checkpointing: data pages are flushed lazily in the background,
//   because the log already guarantees recoverability.
//
//   Postgres exposes the whole trade as settings:
//     synchronous_commit = on      fsync before acknowledging
//                        = off     acknowledge first; a crash loses
//                                  the last ~200ms
//     wal_sync_method              which syscall to use
//     full_page_writes             protection against torn pages
//
// The pattern generalises: make the durable write sequential, batch
// the flushes, and do the expensive random work lazily.
```

```text
// What every event-driven runtime is built on.
//
//   nginx, Redis, HAProxy   → epoll / kqueue directly
//   Node.js                  → libuv, which wraps epoll/kqueue/IOCP
//   Go                        → the runtime's netpoller is epoll;
//                               goroutines make it look like
//                               blocking I/O
//   Rust tokio                → mio, which wraps epoll; io_uring
//                               support is emerging
//   Java NIO                  → epoll via Selector
//
// Go is the interesting case: you write blocking code and the
// runtime converts it to epoll registrations plus goroutine
// parking. That is why Go gets event-loop scalability with
// sequential-looking code, and why a blocking syscall that the
// runtime does not know about (certain cgo calls) ties up an OS
// thread.
```

```bash
# The I/O investigation order.
iostat -x 1               # is the device busy? what is `await`?
iotop -o                  # which process is doing the I/O
pidstat -d 1              # per-process read/write rates
cat /proc/PID/io          # cumulative bytes, including cancelled writes
strace -c -p PID          # which syscalls, and how much time in each
lsof -p PID               # what is open
# `read_bytes` in /proc/PID/io counts actual device reads, so
# comparing it with `rchar` (bytes requested) tells you the page
# cache hit rate for that process — a genuinely useful number that
# few people know exists.
```
:::

:::mistakes
**Assuming `write` is durable.** It survives a process crash, not a power loss.

**Not fsyncing the directory** after creating or renaming.

**Ignoring `fsync`'s error.** The data is gone and a retry may report success.

**`fsync` per write.** Batch, or use `fdatasync`, or accept a documented window.

**Edge-triggered `epoll` without reading to `EAGAIN`.** Silent hangs.

**A thread per connection at high concurrency.**

**`select` in new code.** 1024 descriptors and a rebuilt set per call.

**Assuming `write` writes everything.** Handle short writes.

**Leaking descriptors on error paths.** Use a construct that cannot be skipped.

**Reading `%util` as saturation on a parallel device.** Use `await`.
:::

:::tradeoffs
**Buffered I/O** — fast, merges and reorders writes, serves reads from cache; durability is
deferred and bounded only by the kernel's flush interval.

**`fsync` per write** — maximum durability, device-round-trip latency per operation. Correct for
a payment ledger and ruinous for a log.

**Group commit** — near-`fsync` durability at a fraction of the cost, with slightly worse
per-operation latency. What every database does.

**`fdatasync`** — skips metadata, so cheaper, and only sufficient when the file size has not
changed.

**Accepting a window (`synchronous_commit = off`)** — large throughput gain for a bounded,
documented loss on crash. A legitimate engineering decision when stated explicitly.

**`O_DIRECT`** — bypasses the page cache, so a large scan does not evict everything else, and you
then implement your own caching and honour alignment requirements.

**`select`/`poll`** — portable and simple, O(n) per call. Fine for a handful of descriptors.

**`epoll`/`kqueue`** — O(ready), the basis of every scalable server, and platform-specific with
edge-triggered subtleties.

**`io_uring`** — the lowest syscall overhead and true asynchronous completion, at the cost of
being new, Linux-only, and having had a meaningful number of security issues.

The two sentences worth keeping: **durability is a question of "safe against what", and the
answer decides whether you need `fsync` at all.** And **wait on readiness, not on threads** —
every scalable server is one thread waiting on many descriptors, because threads are the expensive
part.
:::

:::checkpoint
1. `write` returns successfully, then the process is SIGKILLed. Is the data lost? What if the
   power fails instead?
2. You `fsync` a new file's data and the power fails. What can still go wrong?
3. Give the four steps of an atomic file replace, and what each protects against.
4. Why is `epoll` O(ready) while `poll` is O(watched), and why did that matter for C10k?
5. What breaks with edge-triggered `epoll` if you read once?
6. `fsync` returns an error. What is the correct response, and what did Linux historically do
   wrong?
7. Why is `%util` at 100% not proof that an SSD is saturated?
8. You hit "too many open files". What do you check before raising the limit?
:::

:::interview
Answer the durability question with the distinction that matters:

*"No — `write` copies into the kernel's page cache and returns. The data is durable only after
`fsync` returns successfully. The useful framing is 'safe against what': a process crash loses
nothing, because the page cache belongs to the kernel and outlives the process, whereas a power
loss or kernel panic loses anything unflushed. A lot of code calls `fsync` for crash safety it
already had."*

Add the detail that shows you have implemented it:

*"And data durability is not file durability. After creating a file, fsyncing its data leaves the
directory entry unflushed, so after a power loss the file may not exist. The careful pattern is
write to a temporary file, fsync it, rename over the target — rename within a filesystem is atomic,
so a reader sees the old or the new file and never a partial one — then fsync the directory. Four
steps, all of them necessary. I would also check `fsync`'s return value, because historically on
Linux a failed fsync reported the error once and then marked the pages clean, so a retry succeeded
while the data was gone. That caused real data loss in Postgres."*

For the multiplexing question, give the complexity argument:

*"`epoll`, or `kqueue` on BSD. The older `select` and `poll` take the whole descriptor set on every
call and the kernel scans it, so they are O(watched) — and `select` caps at 1024. `epoll`
registers interest once and returns only ready descriptors, so it is O(ready): ten thousand
connections with ten active costs ten units of work rather than ten thousand. That change is
exactly what made C10k solvable, and it is why nginx, Redis, HAProxy, libuv and Go's netpoller are
all built on it. `io_uring` is the newer step, making the I/O itself asynchronous rather than only
the readiness notification, so syscall overhead stops dominating at very high rates."*

And one practical note: *"the trap with edge-triggered epoll is that you are told when readiness
changes, so if you read once and leave data in the buffer you are never told again and the
connection hangs silently. Read until EAGAIN."*
:::

## What you now know

- `write` copies into the page cache and returns; durability requires `fsync`.
- A process crash loses nothing; a power loss or panic loses unflushed data.
- Fsyncing a file's data does not make its directory entry durable.
- Atomic replace: write temp, fsync temp, rename, fsync directory.
- `rename` within a filesystem is atomic, so readers never see a partial file.
- A failed `fsync` means the data is lost; Linux historically cleared the error after reporting
  it once.
- `fsync` per write is a device round trip each; batch with group commit or use `fdatasync`.
- Accepting a bounded durability window is a legitimate decision when documented.
- A file descriptor is a per-process integer; limits are often 1024 soft by default.
- `EMFILE` is usually a leak on an error path, not genuine demand.
- `select` is capped at 1024 and modifies its sets; `poll` is O(watched).
- `epoll` registers once and returns only ready descriptors: O(ready).
- Edge-triggered `epoll` requires reading until `EAGAIN` or the connection hangs.
- `io_uring` provides asynchronous completion and batching, with a newer security history.
- `write` can return a short count; handle partial writes.
- `%util` is misleading on parallel devices; use `await` and queue depth.
- Comparing `rchar` with `read_bytes` in `/proc/PID/io` gives a per-process cache hit rate.
