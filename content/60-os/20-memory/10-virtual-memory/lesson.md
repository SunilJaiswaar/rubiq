---
title: Virtual memory
summary: Every process believes it owns the whole address space. How the hardware maintains that fiction, and the four ways it stops being free.
level: advanced
minutes: 18
version: "1"
status: stable
last_reviewed: "2026-10-07"
tags: [os, memory, paging, mmap, swap]
concepts: [virtual-memory, paging, page-faults, memory-mapping]
prerequisites: [processes, memory]
interview:
  - question: What problem does virtual memory solve?
    level: advanced
    answer: >-
      Three at once. Isolation — each process has its own address space, so one cannot read or
      corrupt another's memory, and that is enforced by hardware rather than by cooperation.
      Relocation — a program can be loaded anywhere physically while always seeing the same
      virtual addresses, which is why you do not have to compile for a specific memory location.
      And overcommit — a process can be given more address space than there is RAM, because
      pages are only backed by physical memory when actually touched. The cost is a translation
      on every memory access, which is why the TLB exists and why TLB misses matter.
    followUps:
      - "How is the translation made fast enough to be acceptable?"
  - question: What is the difference between a minor and a major page fault?
    level: advanced
    answer: >-
      Both are the MMU telling the kernel a virtual address has no valid mapping. A minor fault is
      resolved from memory — the page is in the page cache already, or it needs a new zero page,
      or it is a copy-on-write duplication — costing microseconds. A major fault requires reading
      from storage, costing hundreds of microseconds on an SSD and milliseconds on a disk, which
      is three to four orders of magnitude worse. So minor faults are normal and high major fault
      rates mean you are either short of memory or reading files through mmap, and distinguishing
      them is the whole point of the metric.
    followUps:
      - "So how do you tell which cause it is?"
  - question: Why is a process's RSS different from the memory it allocated?
    level: advanced
    answer: >-
      RSS is resident set size — physical pages currently mapped — which is neither what the
      process asked for nor what it is using. It excludes allocated-but-never-touched pages, since
      those have no physical backing; it excludes pages evicted to swap; and it double-counts
      shared pages across processes, so summing RSS over a preforking server vastly overstates
      real usage. PSS, proportional set size, divides shared pages by the number of sharers and is
      the figure to use when you care about totals. That is why `free` can show plenty of
      available memory while a sum of RSS suggests there is none.
    followUps:
      - "Which number would you alert on?"
resources:
  - title: "What every programmer should know about memory"
    url: https://people.freebsd.org/~lstewart/articles/cpumemory.pdf
---

## The fiction

```text
  Every process sees the same layout, starting at the same addresses:

    0x7fff_ffff_ffff  ┌──────────────┐
                      │ stack      ↓ │
                      │              │
                      │ mmap region  │  shared libraries, file maps,
                      │              │  large mallocs
                      │              │
                      │ heap       ↑ │  brk / small mallocs
                      ├──────────────┤
                      │ bss, data    │  globals
                      │ text         │  code, read-only
    0x0000_0000_0000  └──────────────┘  (unmapped: null deref traps)

  Two processes both using address 0x400000 are using different
  physical memory. The MMU translates, per process, on every access.
```

:::what
**Virtual memory** gives each process a private address space, translated to physical memory by
the **MMU** using **page tables**. A **page** is the unit of mapping, usually 4KB. A **page
fault** is the hardware asking the kernel to resolve an address with no valid mapping. The
**TLB** caches recent translations.
:::

:::why
The fiction buys three things that are each individually worth the cost.

**Isolation** is the one that makes shared machines possible. Because translation is per process
and enforced in hardware, a bug in one program cannot corrupt another's memory, and the guarantee
needs no cooperation from either program. Without it, every process would have to be trusted, and
a single wild pointer could take down a machine.

**Relocation** is why a program does not need to know where it will live. The linker can assume
the same addresses every time, the loader can place it anywhere physically, and
address-space-layout randomisation becomes possible — which is itself a significant security
property, because an attacker cannot predict where anything is.

**Overcommit** is the one with the most everyday consequences. A process can be given far more
address space than the machine has RAM, because nothing is backed by physical memory until
touched. That is what makes `malloc` of a gigabyte instant, what makes `fork` cheap, and what
lets a 200MB binary start without reading 200MB from disk. It is also why "out of memory" arrives
as a crash during a write rather than as a failed allocation.

The cost is a translation on every single memory access, which would be ruinous if it were a page
table walk each time. The TLB makes it nearly free when it hits — and the fact that it has a
fixed, small number of entries is why memory access patterns affect performance so much more than
instruction counts.
:::

:::how
```text
  TRANSLATION, and why the TLB matters

    virtual address ──▶ TLB?
                         │
                    hit  │  ~1 cycle
                         ▼
                    physical address

                    miss │  walk the page tables: 4 levels on
                         │  x86-64, so up to 4 memory accesses
                         ▼
                    fill the TLB, retry

  A TLB has on the order of 1500 entries. At 4KB per page that
  covers about 6MB of memory. A working set larger than that
  thrashes the TLB, and every access pays a page walk.

  This is why HUGE PAGES exist: a 2MB page means one TLB entry
  covers 500× more memory, so a database with a 100GB buffer pool
  needs 50,000 entries instead of 25 million. Measurable
  double-digit gains for that workload, and wasted memory for
  anything with a sparse access pattern.

  PAGE FAULTS — two kinds, three orders of magnitude apart

    MINOR — resolvable without storage
      first touch of a malloc'd page → map a zero page
      copy-on-write after fork       → copy the page
      page already in the page cache → map it
      cost: ~1-2 microseconds

    MAJOR — needs I/O
      file page not in cache         → read from storage
      page previously swapped out    → read from swap
      cost: ~100μs (SSD) to ~10ms (disk)

    So a million minor faults is a second of CPU; a million major
    faults is three hours of waiting. The metric is only meaningful
    when you separate them.

  WHY RSS IS NOT USAGE

    malloc(1 GB)                  → VSZ +1GB, RSS +0
                                     (address space reserved, no
                                      pages yet)
    touch one byte per page       → RSS +1GB
                                     (now physically backed)
    pages swapped out             → RSS decreases, usage unchanged
    two forked workers            → each reports the shared pages
                                     in its own RSS

    Summing RSS over 8 preforked workers can report 4GB when the
    machine is holding 800MB. PSS divides shared pages by the
    number of sharers, and is the number to sum.
```
:::

:::example
```bash
# 1. Where the memory actually is.
cat /proc/PID/status | grep -E 'VmSize|VmRSS|VmSwap'
#  VmSize: 2847236 kB     ← virtual: everything mapped, mostly untouched
#  VmRSS:   412880 kB     ← resident: physically present right now
#  VmSwap:    8192 kB     ← evicted to swap

cat /proc/PID/smaps_rollup
#  Rss:              412880 kB
#  Pss:              198432 kB     ← shared pages divided by sharers
#  Private_Clean:     12000 kB
#  Private_Dirty:    180000 kB     ← genuinely this process's, and
#                                     cannot be dropped without swap
# Private_Dirty is the closest single number to "memory this process
# is costing the machine".

# 2. Are the faults minor or major? This distinction is the whole
#    diagnosis.
ps -o min_flt,maj_flt,cmd -p PID
vmstat 1
#  si  so    ← swap in / out. Non-zero sustained means thrashing.
#  free, buff/cache

# 3. The number most people misread.
free -h
#   total  used  free  shared  buff/cache  available
#   16Gi   4Gi   200Mi  1Gi     11Gi        11Gi
#
# "free" being 200Mi alarms people. It should be near zero: unused
# RAM is wasted RAM, so the kernel fills it with page cache, which
# is reclaimable instantly. `available` is the number that matters —
# how much can be had without swapping.
```

```c
// 4. mmap — the same mechanism, used deliberately.
int fd = open("big.dat", O_RDONLY);
void *p = mmap(NULL, len, PROT_READ, MAP_SHARED, fd, 0);
// The file is now addressable memory. Nothing has been read.
// Touching p[1000000] triggers a major fault that reads one page.
//
// Wins:  no copy into user space, pages shared between processes
//        mapping the same file, the kernel handles caching and
//        eviction
// Costs: every access can fault, so latency is unpredictable; I/O
//        errors arrive as SIGBUS rather than as a return value;
//        and it is awkward when the file changes size underneath you
//
// This is how database buffer pools, loaders of shared libraries,
// and tools like ripgrep read large files.
```

```bash
# 5. Overcommit, and the setting worth knowing about.
cat /proc/sys/vm/overcommit_memory
#  0 = heuristic (default): allow plausible overcommit
#  1 = always allow: never refuse an allocation
#  2 = strict: refuse allocations beyond swap + ratio × RAM

# With the default, malloc succeeds and the OOM killer resolves the
# consequences later. With mode 2, malloc fails and the program can
# handle it — which is better for a single dedicated service and
# worse for anything that forks a large process or maps big files,
# since both reserve far more than they use.
```
:::

:::failure
**Treating RSS as memory usage.** It excludes untouched allocations and swapped pages, and
double-counts shared pages. Summing it across preforked workers overstates usage, sometimes by
several times. Use PSS, or `Private_Dirty` for the per-process cost.

**Alarming at low `free`.** The kernel deliberately uses spare RAM as page cache, which is
reclaimable on demand. `available` is the number to watch; `free` near zero is healthy.

**Confusing swap usage with a problem.** Pages swapped out and never touched again cost nothing.
Sustained `si`/`so` in `vmstat` — actual paging traffic — is the problem. Static swap usage is
usually the kernel having sensibly evicted something idle.

**Disabling swap entirely.** Tempting, and it removes the kernel's ability to evict genuinely
cold anonymous pages, so reclaim pressure falls entirely on the page cache and the OOM killer
arrives sooner. A small swap plus a low `swappiness` is usually better than none.

**Assuming `malloc` failing is how you learn about memory exhaustion.** Under default overcommit
it does not fail; the process is killed later, during an unrelated write, by the OOM killer. So
code that checks `malloc`'s return value is not wrong but is rarely what saves you.

**Ignoring TLB pressure.** A program with a 100GB working set and 4KB pages needs 25 million
translations for entries that hold about 1500. Huge pages can be a double-digit improvement for
databases and large in-memory caches, and a waste for sparse access patterns.

**`mmap` for small files.** Setting up the mapping and taking a fault per page costs more than a
single `read` for anything small. `mmap` wins on large files accessed randomly, and loses on
small sequential ones.

**Not handling SIGBUS from a mapped file.** If the file is truncated while mapped, accessing the
removed region raises SIGBUS rather than returning an error. A process reading user-supplied files
via `mmap` needs to handle that or it crashes on a malicious input.

**Memory fragmentation mistaken for a leak.** Covered in the Ruby track and general: freed memory
in the middle of an allocator arena cannot be returned to the OS, so RSS stays high while live
objects are flat. Checking live-object counts versus RSS is what separates the two.
:::

:::realworld
```text
// The page cache, which is the most important thing on this page
// for everyday performance.
//
//   Every file read goes through it. A second read of the same file
//   is a memcpy rather than I/O — which is why a benchmark's
//   second run is faster, and why "the database is fast on
//   staging" often means "the dataset fits in staging's page
//   cache".
//
//   Implications:
//     - Sizing a database's buffer pool at 100% of RAM starves the
//       page cache and is usually worse than 60-70%.
//     - A machine's effective memory for caching is RAM minus
//       process RSS, so a memory leak degrades I/O performance
//       long before it causes an OOM.
//     - Reading a 50GB file sequentially evicts everything else.
//       posix_fadvise with DONTNEED, or O_DIRECT, exists for that.
```

```text
// What containers change, and do not.
//
//   A memory limit is a cgroup limit on charged pages — RSS plus
//   page cache attributed to the cgroup. So a process doing heavy
//   file I/O can approach its memory limit through page cache
//   alone, and the kernel will reclaim that cache rather than kill
//   the process, which shows up as degraded I/O rather than as a
//   memory problem.
//
//   Exceeding the limit with anonymous memory is different: there
//   is nothing to reclaim, so the OOM killer runs. Exit code 137.
//
//   And a container's /proc/meminfo shows the HOST's memory unless
//   lxcfs or similar is in use, which is why runtimes that size
//   their heaps from it get it badly wrong — the same class of bug
//   as reading the host's core count.
```

```bash
# The investigation sequence for a memory problem.
free -h                           # available, not free
vmstat 1                          # si/so — is it actually paging?
ps aux --sort=-rss | head         # who is largest
cat /proc/PID/smaps_rollup        # PSS and Private_Dirty for the suspect
ps -o min_flt,maj_flt -p PID      # minor (normal) vs major (I/O)
cat /sys/fs/cgroup/memory.stat    # in a container: what is charged
dmesg | grep -i oom               # has the killer already run?

# This order answers "is there a real shortage", "is it paging",
# "which process", and "is it anonymous memory or page cache" —
# which is the set of questions whose answers determine what to do.
```
:::

:::mistakes
**RSS as usage.** Use PSS for totals, `Private_Dirty` per process.

**Alarming on low `free`.** Watch `available`.

**Treating any swap usage as a problem.** Watch paging rate, not static usage.

**Disabling swap.** It removes a reclaim option and brings the OOM killer closer.

**Expecting `malloc` to fail.** Overcommit means it succeeds and you are killed later.

**Ignoring huge pages for large working sets.** TLB coverage is a real limit.

**`mmap` for small files.** Fault-per-page costs more than a `read`.

**Not handling SIGBUS on a mapped file.**

**Mistaking fragmentation for a leak.** Compare live-object counts with RSS.

**Sizing a buffer pool at 100% of RAM.** The page cache needs room.

**Reading container memory limits from `/proc/meminfo`.** It reports the host's.
:::

:::tradeoffs
**Virtual memory** — isolation, relocation and overcommit, at the cost of a translation per
access. Not optional on any general-purpose system.

**4KB pages** — fine-grained, so little waste, and limited TLB coverage.

**Huge pages (2MB)** — far better TLB coverage for large contiguous working sets, at the cost of
internal waste for sparse ones and of allocation failures under fragmentation. Transparent huge
pages automate this and are notorious for latency spikes during compaction, which is why
databases often recommend disabling them.

**Overcommit** — cheap `fork`, instant large allocations, lazily-backed mappings; the failure mode
moves from a failed allocation to a kill at an unpredictable time.

**Swap** — gives the kernel somewhere to put cold anonymous pages, which protects the page cache;
costs major faults if the working set genuinely exceeds RAM.

**`mmap`** — zero-copy, shared between processes, kernel-managed caching; unpredictable latency,
SIGBUS instead of error returns, and poor for small files.

**`read`/`write`** — predictable, errors are return values, and a copy into user space.

**`O_DIRECT`** — bypasses the page cache so a large sequential scan does not evict everything;
you must then do your own caching and alignment.

The idea worth carrying: **memory is not a number, it is several numbers measuring different
things.** Virtual, resident, proportional, private-dirty, cached and available each answer a
different question, and almost every confusing memory investigation is someone comparing two of
them as though they were the same.
:::

:::checkpoint
1. Name the three problems virtual memory solves. Which one explains why `fork` is cheap?
2. Minor versus major page fault — give the cause and the cost of each.
3. `malloc(1GB)` then touch nothing. What happens to VSZ and RSS?
4. Why does summing RSS across eight preforked workers overstate usage, and what do you use
   instead?
5. `free -h` shows 200Mi free and 11Gi buff/cache. Is this a problem?
6. Why do huge pages help a database with a 100GB buffer pool?
7. Why does `malloc` returning non-null not mean the memory is available?
8. A container does heavy file I/O and approaches its memory limit. Is it about to be killed?
:::

:::interview
Give all three purposes, because most answers give only isolation:

*"Three things at once. Isolation, enforced in hardware — each process has its own translation, so
a wild pointer cannot reach another process's memory and neither program has to cooperate for that
to hold. Relocation — a program always sees the same virtual addresses while being loaded anywhere
physically, which is what makes ASLR possible. And overcommit — address space can exceed physical
memory because nothing is backed until touched, which is why `malloc` of a gigabyte is instant,
why `fork` is cheap, and why a 200MB binary starts without reading 200MB."*

Then the fault distinction, with the magnitude:

*"The metric I care about is minor versus major faults. A minor fault is resolved from memory — a
first touch, a copy-on-write, a page already in the page cache — and costs a microsecond or two. A
major fault needs storage, so a hundred microseconds on SSD or milliseconds on a disk. That is
three to four orders of magnitude, so a million minor faults is a second of CPU and a million major
faults is hours of waiting. Reporting a combined fault count tells you nothing."*

The RSS point is reliably useful and widely misunderstood:

*"And I would be careful about what number I am looking at. RSS excludes allocated-but-untouched
pages, excludes anything swapped out, and double-counts pages shared between processes — so summing
it across eight preforked workers can report four gigabytes when the machine holds eight hundred
megabytes. PSS divides shared pages by the number of sharers and is the figure to sum;
`Private_Dirty` is the closest thing to what one process costs. Likewise `free` being near zero is
healthy — the kernel fills spare RAM with reclaimable page cache — and `available` is the number to
alert on."*

One more if the conversation is production-oriented: *"in a container the memory limit charges page
cache as well as anonymous memory, so a process doing heavy file I/O approaches its limit through
cache and the kernel just reclaims it — degraded I/O, not a kill. Exceeding it with anonymous
memory has nothing to reclaim, so that is the OOM killer and exit code 137."*
:::

## What you now know

- Virtual memory provides isolation, relocation and overcommit.
- Overcommit is why `malloc` of a gigabyte is instant and `fork` is cheap.
- Translation happens per access; the TLB makes it ~1 cycle on a hit.
- A TLB holds roughly 1500 entries, covering about 6MB at 4KB pages.
- Huge pages multiply TLB coverage, which matters for large buffer pools.
- Minor faults are resolved from memory in microseconds; major faults need storage.
- The minor/major distinction spans three to four orders of magnitude.
- RSS omits untouched and swapped pages and double-counts shared ones.
- PSS divides shared pages by sharers; `Private_Dirty` is the per-process cost.
- Low `free` is healthy — the page cache uses spare RAM. Watch `available`.
- Static swap usage is fine; sustained `si`/`so` paging is the problem.
- Disabling swap removes a reclaim option and brings the OOM killer closer.
- Under default overcommit, `malloc` succeeds and the OOM killer arrives later.
- `mmap` is zero-copy and shared, with unpredictable latency and SIGBUS on truncation.
- The page cache makes a second read of a file a memcpy, which is why benchmarks improve.
- A container's memory limit charges page cache too; reclaim degrades I/O rather than killing.
- Memory is several different numbers, and comparing two of them is the usual confusion.
