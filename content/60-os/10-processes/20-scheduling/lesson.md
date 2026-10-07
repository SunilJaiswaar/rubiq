---
title: Scheduling and why your process is slow
summary: The scheduler decides who runs next, and most "slow for no reason" problems are it doing exactly what it was configured to do.
level: advanced
minutes: 16
version: "1"
status: stable
last_reviewed: "2026-10-07"
tags: [os, scheduling, cgroups, containers, latency]
concepts: [scheduling, preemption, cpu-limits, load-average]
prerequisites: [processes, threads]
interview:
  - question: What does load average actually measure?
    level: advanced
    answer: >-
      On Linux, the number of tasks either running or waiting to run, averaged over 1, 5 and 15
      minutes — and crucially it also counts tasks in uninterruptible sleep, which usually means
      blocked on disk I/O. So a load average of 8 on an 8-core machine might mean fully utilised,
      or it might mean two processes computing and six stuck on a slow disk. That is why load
      average alone is close to useless for diagnosis: it conflates CPU demand with I/O waiting.
      Pressure stall information, which reports the percentage of time tasks were stalled on CPU,
      memory or I/O, is the metric that actually distinguishes them.
    followUps:
      - "So what would you look at instead?"
  - question: Why does a container with a CPU limit get slower in a way that looks like nothing?
    level: advanced
    answer: >-
      CFS quota throttling. A limit of 1 CPU is implemented as 100ms of runtime per 100ms period,
      and when a process exhausts its quota it is stopped until the period rolls over — so it
      stops for up to 100 milliseconds at a time with no CPU pressure visible anywhere. It is
      particularly bad for multi-threaded runtimes, because eight threads each doing 20ms of work
      consume a one-CPU quota in 12ms and then the whole process sleeps for 88ms. The symptom is
      p99 latency spikes with low average CPU usage, and the metric that reveals it is
      `nr_throttled` in the cgroup's cpu.stat.
    followUps:
      - "How would you fix it?"
  - question: What is priority inversion?
    level: advanced
    answer: >-
      A high-priority task waiting on a lock held by a low-priority task, which cannot run because
      a medium-priority task is occupying the CPU. The high-priority task is effectively blocked
      by the medium one it should preempt. The classic fix is priority inheritance: while holding a
      lock that a higher-priority task wants, the holder temporarily inherits that priority. It is
      famous because it caused the Mars Pathfinder's repeated resets in 1997, which were diagnosed
      and patched remotely.
    followUps:
      - "Where would this show up outside real-time systems?"
resources:
  - title: "Brendan Gregg — Linux Performance"
    url: https://www.brendangregg.com/linuxperf.html
---

## The scheduler's job

```text
  More runnable tasks than cores. Who runs next, and for how long?

  Linux CFS (and its successor EEVDF) answers: whoever has had the
  least CPU time relative to their weight.

    task A  weight 1024 (nice 0)   vruntime 120ms
    task B  weight 1024 (nice 0)   vruntime 118ms   ← runs next
    task C  weight  335 (nice 5)   vruntime  40ms

  vruntime advances in proportion to real time divided by weight, so
  a low-weight task's clock runs fast and it is picked less often.
  The scheduler always picks the smallest vruntime, which makes
  fairness the default and starvation impossible.
```

:::what
The **scheduler** chooses which runnable task occupies each CPU and for how long.
**Preemption** is the kernel interrupting a running task. **nice** adjusts a task's weight.
**cgroups** impose limits on groups of processes, which is how containers are bounded.
:::

:::why
Most of the time the scheduler is invisible, and the cases where it is not are worth
understanding because they look like something else entirely.

The usual experience is a process that is slow with no obvious cause: CPU utilisation is modest,
the queries are fast, there is no garbage collection pause to blame, and yet p99 latency has
spikes. Almost every instance of that is the scheduler doing exactly what it was told — enforcing
a quota, honouring a priority, or waiting for a task that is itself blocked.

The container case is the one that affects the most people. A CPU limit does not make your
process run proportionally slower; it makes it run at full speed and then stop completely for up
to 100 milliseconds. Average utilisation looks fine because the average over a second is within
the limit. Only the tail is destroyed, and nothing in a standard dashboard names the cause.

Understanding this matters because the fix is configuration rather than code. No amount of
optimisation helps a process that is being stopped by its cgroup, and a week spent profiling the
application is a week spent on the wrong thing — which is why "check whether you are being
throttled" belongs near the top of any latency investigation in a container.
:::

:::how
```text
  CFS, in one idea

    Every task has a vruntime — virtual runtime — which advances
    while it runs, scaled by its weight:

      vruntime += real_time × (1024 / weight)

    nice  0 → weight 1024  → vruntime advances at 1×
    nice  5 → weight  335  → advances at ~3×  (gets less CPU)
    nice -5 → weight 3121  → advances at ~0.33× (gets more)

    The scheduler runs the task with the smallest vruntime. So the
    task that has had the least weighted CPU time goes next, which
    makes starvation structurally impossible and makes nice a
    proportion rather than a priority.

    EEVDF, which replaced CFS in Linux 6.6, adds a deadline notion
    so latency-sensitive tasks can be served sooner without
    distorting fairness. The mental model above still holds.

  CGROUP CPU LIMITS — the part that surprises people

    cpu.max = "100000 100000"      → 1 CPU: 100ms quota per 100ms

    A SINGLE thread using 100% of one core:
      runs 100ms, quota exhausted exactly at the period end.
      Smooth. No throttling.

    EIGHT threads each wanting 100%:
      all eight run, consuming 8 × 12.5ms = 100ms of quota
      in 12.5ms of wall time.
      → throttled for the remaining 87.5ms of the period.

      timeline:  ████▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁████▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁
                 run  throttled        run  throttled

    Average CPU: 1.0 — exactly the limit, so dashboards look fine.
    Worst-case added latency: ~87ms, on any request unlucky enough
    to land in a throttled window.

    This is why a JVM or Go runtime that sizes its thread pool from
    the HOST core count behaves badly in a limited container: it
    creates 64 threads for a 1-CPU quota and throttles constantly.

  LOAD AVERAGE — and why it misleads on Linux

    load = tasks running + tasks RUNNABLE + tasks in
           UNINTERRUPTIBLE SLEEP (state D, usually disk I/O)

    load 8 on 8 cores could be:
      - 8 tasks computing          → saturated CPU
      - 2 computing, 6 on disk     → idle CPU, slow disk
      - 8 tasks on an NFS mount    → idle CPU, hung network

    Three completely different problems, one number. Linux's
    inclusion of state D is deliberate — it was meant to capture
    "demand" — and it makes the number ambiguous.
```
:::

:::example
```bash
# 1. Is the container being throttled? Check this before profiling.
cat /sys/fs/cgroup/cpu.stat
#   usage_usec 48392011
#   nr_periods 120000
#   nr_throttled 8423          ← 7% of periods hit the limit
#   throttled_usec 412000000   ← 412 seconds of stopped time

# nr_throttled > 0 means some requests paid up to a full period of
# latency. If p99 is bad and this is non-zero, stop looking at the
# application.

# 2. Which state are the tasks in? This is what load average hides.
vmstat 1 5
#  r  b   swpd   free  ...  us sy id wa
#  2  6      0  1.2G       12  3 20 65
#    r = runnable (CPU demand)
#    b = blocked on I/O
#    wa = time waiting for I/O
# r=2 b=6 wa=65 is an I/O problem on an idle CPU. Load average
# would have reported 8 and told you nothing.

# 3. Pressure stall information — the metric that disambiguates.
cat /proc/pressure/cpu
#   some avg10=0.42 avg60=0.31 avg300=0.28 total=...
cat /proc/pressure/io
#   some avg10=62.30 ...        ← tasks stalled on I/O 62% of the time
#   full avg10=28.11 ...        ← ALL tasks stalled 28% of the time
# "some" means at least one task was stalled; "full" means everything
# was. This separates CPU demand from I/O waiting, which load average
# cannot.

# 4. Per-thread CPU, when a process looks "50% busy" on two cores.
top -H -p PID
pidstat -t -p PID 1
# A single spinning thread in an otherwise idle process is invisible
# in process-level metrics.
```

```bash
# 5. Fixing the throttling, in order of preference.
#
# a. Tell the runtime the real limit, so it sizes its pools correctly.
#    JVM:   -XX:ActiveProcessorCount=2   (modern JVMs read cgroups)
#    Go:    GOMAXPROCS=2                  (does NOT read cgroups)
#    Node:  UV_THREADPOOL_SIZE=4
#
# b. Raise the limit, or remove it and use requests only — in
#    Kubernetes, a CPU request guarantees a share while a limit
#    imposes the quota. Many teams set requests and no limits
#    deliberately for latency-sensitive services.
#
# c. Shorten the period, so a throttle costs less:
#    cpu.max = "20000 20000"  → same 1 CPU, 20ms periods, so the
#    worst-case stall is 20ms instead of 100ms.
#
# The first is usually the real fix: a runtime that creates 64
# threads for a 1-CPU quota is misconfigured, not under-resourced.
```
:::

:::failure
**CPU limits on a latency-sensitive service.** The quota turns a smooth 50% utilisation into
alternating full speed and full stop. A service with p50 of 10ms and p99 of 400ms, with CPU
reported at half its limit, is this.

**A runtime reading the host's core count.** Go's `GOMAXPROCS` historically defaulted to the
host's CPU count regardless of the cgroup limit, so a 1-CPU container ran 64 OS threads
competing for 100ms of quota. Older JVMs did the same for their thread pools and GC threads.
Check what your runtime detects, rather than assuming.

**Diagnosing with load average.** It conflates CPU demand with uninterruptible I/O waiting, so
the number cannot distinguish a saturated CPU from an idle CPU behind a slow disk. Use `vmstat`'s
r and b columns, or pressure stall information.

**`nice` expected to be a priority.** It is a weight, so a nice-19 task still runs — it simply
gets a small share. It will not be starved, and it will not be pushed aside entirely, which is
usually a feature and occasionally not what someone wanted.

**Real-time priorities used casually.** `SCHED_FIFO` tasks preempt everything, including kernel
threads, so a spinning real-time thread can make a machine unresponsive with no way to recover
short of a reset. The default `sched_rt_runtime_us` reserves 5% of each period for non-real-time
tasks specifically to stop that, and disabling it is how people lock up machines.

**Priority inversion.** A high-priority task waits on a lock held by a low-priority task that
cannot get scheduled. Mars Pathfinder is the famous case; the everyday version is a latency-
sensitive request blocked behind a background job holding a row lock while it waits for CPU.

**Assuming more threads means more throughput.** Past the core count, the extra threads add
context switches and cache pollution. Under a quota they also exhaust it faster and throttle
sooner — so oversubscription is actively worse in a container than on bare metal.

**Ignoring CPU affinity on NUMA machines.** A thread moved to a different socket now reaches
memory across an interconnect, which can be twice the latency. For high-throughput work, pinning
matters.
:::

:::realworld
```text
// What to check, in order, when something is slow and the code
// looks fine.
//
//   1. cgroup throttling      cat /sys/fs/cgroup/cpu.stat
//                              nr_throttled > 0 → stop here, it is
//                              configuration
//   2. runnable vs blocked    vmstat 1
//                              r high → CPU demand
//                              b high, wa high → I/O
//   3. pressure               /proc/pressure/{cpu,io,memory}
//                              which resource is actually stalling
//   4. per-thread             top -H, pidstat -t
//                              one hot thread hides in process
//                              metrics
//   5. which syscall          strace -c -p PID
//                              counts by call, finds the surprise
//   6. where in code          perf top, a flame graph
//
// Steps 1-3 cost seconds and eliminate whole categories. Starting
// at step 6 is the most common mistake in performance work.
```

```text
// The Kubernetes decision worth understanding, because it is made
// by default and rarely revisited:
//
//   requests  — a guaranteed share, used for scheduling placement.
//               Under contention you get at least this much.
//   limits    — a hard quota, enforced by throttling.
//
//   requests only, no limit:
//     the pod can burst into idle capacity, so latency is good and
//     a runaway process can starve its neighbours.
//
//   limits == requests:
//     predictable and isolated, and bursty workloads are throttled
//     even when the node is idle.
//
// For a latency-sensitive service, requests with a generous or
// absent CPU limit is a defensible and common choice — CPU is
// compressible, so throttling degrades rather than fails. Memory
// limits are different: memory is not compressible, so exceeding a
// memory limit means the OOM killer, and those should always be set.
```

```text
// The OOM killer, since it is the other scheduler-adjacent surprise:
//
//   Exceed a memory cgroup limit and a process in that cgroup is
//   killed — not throttled. The kernel chooses by oom_score, which
//   favours killing large, recently-started processes.
//
//   Symptom: a container that "restarts for no reason", with exit
//   code 137 (128 + SIGKILL). Nothing in the application log,
//   because the process was not asked to stop.
//
//   dmesg | grep -i oom     shows what was killed and why.
```
:::

:::mistakes
**CPU limits on latency-sensitive work.** Throttling destroys the tail while averages look fine.

**A runtime sized from host cores.** Set `GOMAXPROCS`, `ActiveProcessorCount` or the equivalent.

**Load average as a diagnosis.** It includes I/O wait on Linux.

**Treating `nice` as a priority.** It is a proportional weight.

**Real-time priorities without understanding them.** A spinning FIFO thread can lock the machine.

**Oversubscribing threads.** Worse in a container than on metal, because quota is consumed
faster.

**Profiling before checking throttling.** Seconds of checking versus days of profiling.

**Not setting memory limits.** Unlike CPU, memory is not compressible; the failure is a kill.

**Ignoring exit code 137.** It means the OOM killer, and the application log will be silent.

**Ignoring NUMA on large machines.** Cross-socket memory access is substantially slower.
:::

:::tradeoffs
**Fair scheduling (CFS/EEVDF)** — no starvation, good default behaviour, and no latency guarantee
for any particular task. Right for almost everything.

**`nice`** — a cheap way to deprioritise background work, and it only takes effect under
contention, so it will not protect you from a quota.

**Real-time scheduling** — genuine latency guarantees, at the risk of locking the machine if the
task misbehaves. For audio, control systems and little else.

**CPU limits** — predictable isolation between tenants, at the cost of throttling stalls that
ruin tail latency.

**CPU requests only** — bursting into idle capacity so latency stays good, at the cost of noisy
neighbours being possible.

**More threads** — better I/O overlap, worse cache behaviour and faster quota consumption.

**CPU pinning** — better cache and NUMA locality, at the cost of flexibility and of idle cores
when the pinned task is quiet.

The investigative order is the real lesson: **check what the scheduler is being told before
examining what your code is doing.** Throttling, a misdetected core count and an I/O-dominated
load average each explain a "mysteriously slow" service completely, and each takes seconds to
rule out.
:::

:::checkpoint
1. What does Linux load average include that makes it ambiguous? Give three readings of "load 8
   on 8 cores".
2. Eight threads, a 1-CPU quota, 100ms period. Describe the timeline and the worst-case added
   latency.
3. Why does average CPU utilisation look healthy while throttling destroys p99?
4. What is `vruntime`, and why does fair scheduling make starvation impossible?
5. Is `nice` a priority or a weight? What follows from the answer?
6. Your container restarts with exit code 137 and nothing in the log. What happened?
7. Why is a memory limit more important to set than a CPU limit?
8. Give the first three things you check when a containerised service is slow.
:::

:::interview
Lead with the container case, because it is the one that affects real systems most:

*"The scheduler problem I look for first is cgroup CPU throttling. A limit of one CPU is
implemented as 100ms of runtime per 100ms period, so when the quota is exhausted the process stops
completely until the period rolls over. Eight threads each wanting a core consume a one-CPU quota
in twelve milliseconds and then sleep for eighty-eight. Average utilisation is exactly at the
limit, so dashboards look healthy, and only the tail is destroyed — p50 of 10ms with p99 of 400ms
and CPU at half the limit is almost always this. `nr_throttled` in the cgroup's cpu.stat is the
metric, and checking it takes seconds."*

Then the diagnostic point about load average, which is widely misunderstood:

*"And I would not use load average to diagnose it. On Linux it counts tasks in uninterruptible
sleep as well as runnable ones, so a load of 8 on eight cores could be a saturated CPU, or two
processes computing while six are stuck on a slow disk, or eight tasks hung on an NFS mount. Three
different problems, one number. `vmstat`'s runnable and blocked columns separate them, and
pressure stall information is better still because it reports the percentage of time tasks were
stalled per resource."*

If there is room for the mechanism:

*"Linux's fair scheduler tracks a virtual runtime per task that advances in proportion to real
time divided by the task's weight, and always runs the smallest. That makes starvation structurally
impossible and makes `nice` a proportion rather than a priority — a nice-19 task still runs, it
just gets a small share. Which also means `nice` will not save you from a quota, because throttling
happens regardless of relative weights."*

And the operational contrast worth adding: *"CPU is compressible, so a CPU limit degrades
performance. Memory is not, so exceeding a memory limit means the OOM killer — exit code 137 and
nothing in the application log, because the process was never asked to stop. That asymmetry is why
I would always set a memory limit and think carefully before setting a CPU one."*
:::

## What you now know

- Linux's scheduler picks the task with the smallest weighted virtual runtime, so fairness is
  the default and starvation is impossible.
- `nice` sets a weight, not a priority — a deprioritised task still runs.
- A cgroup CPU limit is a quota per period, enforced by stopping the process entirely.
- Many threads exhaust a quota quickly and then stall for most of the period.
- Throttling leaves average utilisation looking healthy and destroys tail latency.
- `nr_throttled` in `cpu.stat` is how you detect it, in seconds.
- Runtimes that size pools from host cores misbehave badly under a quota.
- Linux load average includes uninterruptible I/O wait, so it cannot distinguish CPU from disk.
- `vmstat`'s r and b columns, and pressure stall information, separate the resources.
- A single hot thread is invisible in process-level CPU metrics; use `top -H`.
- Real-time priorities can lock a machine; the RT runtime reservation exists to prevent it.
- Priority inversion blocks a high-priority task behind a medium-priority one.
- CPU is compressible and memory is not: exceeding a memory limit means a kill, exit code 137.
- Check throttling, runnable-versus-blocked, and pressure before profiling code.
