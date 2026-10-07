---
title: Numbers and estimates
summary: The latency figures that make a design arguable instead of a matter of opinion, and how to get from "how many users" to "how many machines" in five minutes.
level: advanced
minutes: 18
version: "1"
status: stable
last_reviewed: "2026-10-07"
tags: [system-design, latency, estimation, capacity]
concepts: [latency-numbers, back-of-envelope, percentiles, availability]
prerequisites: [dns, big-o]
interview:
  - question: Why do we talk about p99 rather than averages?
    level: advanced
    answer: >-
      Because an average hides the shape of the distribution, and the shape is what users
      experience. A page averaging 200ms might be 80ms for most people and four seconds for the
      five percent with the most data — and those are the users who complain and churn. Averages
      also conceal bimodality: a cache hit at 20ms and a miss at two seconds average to a number
      describing neither. And at scale the tail is not rare: if a page makes 100 service calls and
      each has a p99 of 100ms, the probability that at least one of them is slow is about 63
      percent, so the page's typical experience is the service's worst case. That last point is
      why tail latency is a systems problem and not a per-service one.
    followUps:
      - "So how do you reduce the effect of one slow dependency?"
  - question: Estimate the storage for a Twitter-like feed.
    level: advanced
    answer: >-
      Start from users and behaviour, not from technology. 100 million daily users, each posting
      twice a day, is 200 million posts a day. A post with text, ids and timestamps is roughly
      300 bytes, so 60GB a day of post data, about 22TB a year, and three replicas makes 66TB.
      That is unremarkable. The interesting number is the read side: if each user loads a feed
      five times a day with 50 posts, that is 25 billion post-reads a day, around 290,000 per
      second average and perhaps a million at peak — which immediately tells you the design
      question is fan-out and caching, not storage.
    followUps:
      - "So would you fan out on write or on read?"
  - question: What does "three nines" actually permit?
    level: advanced
    answer: >-
      99.9% is about 43 minutes of downtime a month, or 8.8 hours a year. 99.99% is 4.4 minutes a
      month, which is less than most deploys take, so it effectively requires zero-downtime
      deployment and automated failover. The multiplication is the part people miss: a service
      depending on four components each at 99.9% has at most 99.6% availability, so adding
      dependencies lowers your ceiling. That is the real argument against a dependency you do not
      need, and the argument for degrading gracefully when one is unavailable rather than failing
      with it.
    followUps:
      - "How do you break that multiplication?"
resources:
  - title: "Latency numbers every programmer should know"
    url: https://colin-scott.github.io/personal_website/research/interactive_latency.html
---

## The numbers

```text
  L1 cache reference                          1 ns
  Branch mispredict                           3 ns
  L2 cache reference                          4 ns
  Mutex lock/unlock                          17 ns
  Main memory reference                     100 ns
  Compress 1KB with Snappy                 2,000 ns     2 μs
  Read 1MB sequentially from memory        3,000 ns     3 μs
  SSD random read                         16,000 ns    16 μs
  Read 1MB sequentially from SSD          49,000 ns    49 μs
  Round trip within a datacentre         500,000 ns   500 μs
  Read 1MB sequentially from disk      5,000,000 ns     5 ms
  Disk seek                            10,000,000 ns    10 ms
  Round trip California → Netherlands 150,000,000 ns   150 ms

  The ratios are what matter, and they are stable even as the
  absolute numbers improve:

    memory : SSD        ≈ 1 : 150
    SSD : disk seek     ≈ 1 : 600
    datacentre : WAN    ≈ 1 : 300
    L1 : main memory    ≈ 1 : 100

  Three consequences that follow immediately:
    - a cache hit in memory is ~150× a cache hit on SSD
    - a cross-region round trip costs as much as 300 local ones,
      which is why "just put it in another region" is not free
    - sequential beats random by roughly 100× on disk, which is why
      logs, LSM trees and append-only designs exist
```

:::what
**Back-of-envelope estimation** is deriving the scale of a system from user behaviour and a few
remembered constants. **Percentiles** describe the distribution of latency. **Availability**
multiplies across dependencies.
:::

:::why
The purpose of memorising a handful of numbers is to make design arguments decidable.

"Should we cache this in memory or on disk?" is a matter of opinion until you know the ratio is
150 to 1, at which point it is arithmetic. "Can we make a cross-region call in the request path?"
becomes answerable the moment you know a WAN round trip is 150ms and your latency budget is 200.
"Will this fit on one machine?" takes two minutes with a known bytes-per-row estimate and
otherwise takes a week and a prototype.

The percentile point is subtler and more important. Averages are not merely imprecise — they are
systematically misleading about the thing you care about, because latency distributions are
heavy-tailed. The users with the most data, the most followers, the largest carts are
simultaneously the slowest to serve and the most valuable, so optimising the mean optimises for
the users you would least mind losing.

And at scale the tail becomes the typical case. A page assembling 100 service calls encounters
each service's p99 with probability 1 − 0.99¹⁰⁰ ≈ 63%, so most page loads contain at least one
p99 response. The service team sees a healthy p99; the user sees a slow page every other visit.
Fixing that requires understanding that tail latency compounds, which is why it is a systems
property rather than a per-service one.
:::

:::how
```text
  THE ESTIMATION RECIPE

    1. Users and behaviour       100M DAU, 2 posts/day, 5 feed loads
    2. Convert to per-second     operations ÷ 86,400
    3. Peak multiplier           ×2 to ×10 over average
    4. Bytes per item            estimate generously, round up
    5. Multiply                  storage, bandwidth, QPS
    6. Compare with one machine  then decide how many

  Useful constants worth memorising:
    86,400 seconds in a day    (≈ 10^5, so "per day ÷ 10^5" ≈ QPS)
    2.5M seconds in a month
    1M requests/day ≈ 12 QPS average
    1 QPS sustained ≈ 2.6M requests/month

  And one-machine capacities, order of magnitude:
    a modern server              ~10-50k simple QPS
    Postgres on good hardware    ~5-20k simple queries/s
    Redis                        ~100k+ ops/s
    nginx static                 ~50-100k requests/s
    1 Gbps                       ~125 MB/s ≈ 10TB/day

  WORKED EXAMPLE — the feed

    100M DAU × 2 posts     = 200M posts/day   ≈ 2,300 writes/s avg
    peak ×3                                   ≈ 7,000 writes/s
    300 bytes each         = 60 GB/day        ≈ 22 TB/year
    ×3 replicas                               ≈ 66 TB/year

    100M DAU × 5 loads × 50 posts = 25B post-reads/day
                                  ≈ 290,000 reads/s avg
    peak ×3                       ≈ 870,000 reads/s

    read : write ≈ 125 : 1

  That ratio is the design. It says: reads must be served from
  cache or precomputed, writes can be handled by a modest cluster,
  and storage is not the problem. You reached that conclusion in
  five minutes, before choosing a single technology.

  AVAILABILITY MULTIPLIES

    99.9%     43 min/month      8.8 h/year
    99.99%    4.4 min/month     53 min/year
    99.999%   26 s/month        5.3 min/year

    Serial dependencies multiply:
      4 components × 99.9% = 99.6%   → 3 hours/month

    Redundant alternatives multiply the FAILURE:
      2 components at 99% in parallel
      = 1 − (0.01 × 0.01) = 99.99%

    So dependencies lower the ceiling and redundancy raises it, and
    the only way to depend on something without inheriting its
    downtime is to degrade when it is gone.
```
:::

:::example
```text
// Tail latency compounding, with the arithmetic.

  A page makes N service calls in parallel. Each service has
  p99 = 100ms, p50 = 10ms.

  P(all fast) = 0.99^N
    N = 1    → 99%   of pages fast
    N = 10   → 90%
    N = 50   → 61%
    N = 100  → 37%   ← most pages contain a p99 response

  The page's p50 is now the service's p99. Nothing is broken; the
  arithmetic simply does not care.

  The fixes, in order of effectiveness:
    1. Fewer calls — batch, denormalise, precompute. The only fix
       that addresses the exponent.
    2. Hedged requests — send to two replicas after a delay, take
       the first. Costs ~5% extra load and removes most of the tail.
    3. Timeouts with a fallback — bound the damage rather than
       waiting.
    4. Making each service faster — helps, and N is still the
       exponent.
```

```text
// A capacity decision, done with the numbers above.
//
//   "Can we store the last 30 days of events in Redis?"
//
//   50M events/day × 30 days       = 1.5B events
//   200 bytes each                 = 300 GB
//   Redis overhead ~2× for small   ≈ 600 GB of RAM
//     objects with keys
//
//   A 600GB RAM cluster is expensive. So either:
//     - keep 24h in Redis (20GB — one instance), older in Postgres
//     - or store in Postgres with an index and accept 1ms instead
//       of 0.1ms
//
//   The second option costs 10× the latency of the first and 1/30th
//   the money. Whether that trade is right depends on the read
//   pattern — but the point is that it took two minutes to frame,
//   and nobody had to prototype anything.
```

```text
// Where to put the work: read-heavy versus write-heavy.
//
//   Read : write of 125 : 1 (a feed)
//     → fan out on WRITE. Precompute each user's feed when a post
//       is created, so a read is one lookup. Costs a fan-out of
//       hundreds of writes per post, which is affordable at 2,300
//       posts/s — and breaks for a celebrity with 50M followers,
//       which is why real systems special-case those.
//
//   Read : write of 1 : 1 (a chat)
//     → fan out on READ. Precomputing buys nothing when every
//       write is read once.
//
//   The ratio decides, and you can compute the ratio before
//   designing anything.
```
:::

:::failure
**Optimising the average.** A cache hit at 20ms and a miss at two seconds average to a number
describing neither case. Report p50, p95 and p99, and look at the gap between them — a wide gap
means bimodality, which is a different problem from being uniformly slow.

**Forgetting that tail latency compounds.** Each service is within its SLO and the page is not,
and no individual team's dashboard shows a problem. This needs measuring at the edge.

**Estimating from technology instead of behaviour.** "We need Kafka" before knowing the event
rate. The number may be 12 per second, in which case a database table is a queue.

**Ignoring the peak multiplier.** Average QPS is not what you provision for. A consumer product
can see 5–10× its daily average at peak, and a system sized for the mean fails every evening.

**Treating availability as additive.** Four serial dependencies at 99.9% give 99.6%, which is
three hours a month. Adding a dependency lowers your ceiling, and the only escape is degrading
without it.

**Assuming replication is a backup.** Three replicas protect against hardware failure and
replicate a `DELETE` perfectly. Backups and replicas solve different problems.

**Memorising numbers without ratios.** The absolute figures improve every year; the ratios —
memory to SSD, local to WAN, sequential to random — are stable and are what the arguments rest
on.

**Designing for ten years of growth.** A system sized for 1000× current traffic is expensive and
complex now, and the requirements will have changed before you get there. Size for 10× and know
where the next bottleneck is.

**Using an average request size.** If 1% of requests are 100× the size, they dominate bandwidth
and the average tells you nothing. Estimate the distribution, or at least the top percentile.
:::

:::realworld
```text
// What to actually estimate in a design discussion, in order.
//
//   1. QPS, average and peak           → how many machines
//   2. Storage, with growth and
//      replication                      → what kind of store
//   3. Bandwidth in and out             → network and egress cost,
//                                          which is often the real
//                                          bill
//   4. Read : write ratio               → where to cache, whether
//                                          to precompute
//   5. Latency budget per hop           → how many hops you can
//                                          afford
//   6. Availability target              → how much redundancy, and
//                                          what degradation looks
//                                          like
//
// Egress deserves its place on that list: at typical cloud pricing,
// moving a petabyte out of a datacentre costs more than storing it
// for a year, which has shaped more architectures than most
// technical arguments.
```

```text
// A latency budget, allocated — the discipline that makes a target
// real.
//
//   Target: 200ms p99 at the user.
//
//     TLS + network to edge      40ms   (fixed, geography)
//     edge → origin              20ms
//     auth check (cached)         2ms
//     primary query               15ms
//     3 parallel service calls    30ms  (the slowest, not the sum)
//     render + serialise          10ms
//     response transfer           20ms
//     ────────────────────────────────
//     total                      137ms
//     headroom                    63ms
//
//   Now a proposal to add one cross-region call is arguable rather
//   than a matter of taste: 150ms does not fit in 63ms of headroom.
//   Without the budget, that conversation is two people's
//   intuitions.
```

```text
// The estimates worth having in your head, because they come up
// constantly:
//
//   A UUID                       16 bytes binary, 36 as text
//   A timestamp                  8 bytes
//   A typical row                100-500 bytes
//   A JSON API response          1-10 KB
//   A web page with assets       1-3 MB
//   A photo                      1-5 MB
//   A minute of 1080p video      ~50 MB
//
//   1M rows × 200 bytes          = 200 MB      fits in memory
//   1B rows × 200 bytes          = 200 GB      fits on one disk
//   1T rows × 200 bytes          = 200 TB      needs a cluster
//
// Those three lines answer "does this need to be distributed"
// faster than any other technique.
```
:::

:::mistakes
**Averages instead of percentiles.** They hide bimodality and the users who matter.

**Ignoring tail compounding.** 100 calls at p99 100ms means most pages are slow.

**Choosing technology before computing the rate.** It may be 12 QPS.

**No peak multiplier.** Provision for peak, not average.

**Adding availability instead of multiplying it.** Dependencies lower the ceiling.

**Treating replicas as backups.** They replicate your mistakes faithfully.

**Memorising absolute numbers, not ratios.** The ratios are the stable part.

**Designing for 1000× growth.** Design for 10× and know the next bottleneck.

**Using an average object size with a heavy tail.** The large ones dominate.

**Forgetting egress costs.** Often the largest line on a cloud bill.
:::

:::tradeoffs
**Memory** — ~100ns, volatile, expensive per byte, limited by one machine. For the working set.

**SSD** — ~16μs random, durable, roughly 100× cheaper per byte. For the data.

**Disk** — ~10ms seek and excellent sequential throughput, cheapest. For logs, backups and cold
data, which is why sequential-write designs target it.

**Same datacentre** — 500μs, so a few hops are affordable within a request.

**Cross-region** — 150ms, so at most one in a request path, and preferably zero. Replicate
instead.

**More replicas** — higher read capacity and availability, at the cost of write amplification and
replication lag.

**Precompute (fan-out on write)** — fast reads, expensive writes and stale data; right when reads
dominate heavily.

**Compute on read** — always fresh, slow reads; right when the ratio is near one.

**Higher availability targets** — each nine is roughly ten times the engineering cost, and every
additional dependency lowers the ceiling you can reach at all.

The habit to build: **estimate before designing.** Five minutes of arithmetic converts an
architecture argument into a decision, usually reveals that the obvious bottleneck is not the real
one, and quite often shows that the whole thing fits on one machine.
:::

:::checkpoint
1. Give the approximate ratios: memory to SSD, SSD to disk seek, local round trip to
   cross-region.
2. 100M DAU posting twice a day. Writes per second average, and at 3× peak?
3. The same users loading a 50-post feed five times a day. Reads per second, and what does the
   ratio tell you to build?
4. A page makes 100 service calls, each with p99 = 100ms. What fraction of pages contain a p99
   response?
5. Four serial dependencies at 99.9% each. Resulting availability, in minutes per month?
6. Two redundant components at 99% each. Combined availability?
7. 1 billion rows at 200 bytes — one machine or a cluster? And a trillion?
8. Why is "we need Kafka" a premature statement until you have computed something?
:::

:::interview
Open with the ratios rather than the absolute numbers, since that is what makes them durable:

*"The figures I keep are ratios, because they stay true as hardware improves. Memory to SSD is
about 150 to 1. SSD to a disk seek is about 600 to 1. A datacentre round trip to a cross-continent
one is about 300 to 1. Sequential to random on disk is about 100 to 1. Those four turn most design
arguments into arithmetic — whether a cache belongs in memory, whether a cross-region call fits in
the latency budget, why append-only designs exist."*

Then demonstrate the estimate, because being able to do it quickly is the actual skill:

*"For a feed: 100 million daily users posting twice is 200 million posts a day, which is about
2,300 writes per second average and maybe 7,000 at peak — unremarkable. At 300 bytes a post that
is 60GB a day, 22TB a year, 66TB with three replicas. Also unremarkable. The number that matters is
the read side: five feed loads of fifty posts each is 25 billion post-reads a day, around 290,000
per second. A read-to-write ratio of 125 to 1 is the design — it says precompute and cache, and it
says storage is not the problem. That took five minutes and no technology choices."*

The percentile point is worth making precisely, because most answers stop at "averages hide
outliers":

*"And I would talk in percentiles, with the compounding. An average over a cache hit at 20ms and a
miss at two seconds describes neither. More importantly, tail latency compounds: a page making 100
service calls hits each service's p99 with probability 1 minus 0.99 to the hundredth, which is
about 63 percent — so most page loads contain a p99 response, every service is inside its SLO, and
no team's dashboard shows a problem. The only fix that addresses the exponent is making fewer
calls; hedging and timeouts bound the damage."*

And the availability arithmetic: *"availability multiplies down across dependencies — four
components at three nines is 99.6%, which is three hours a month — and multiplies up across
redundancy. So every dependency lowers the ceiling, and the only way to depend on something without
inheriting its downtime is to degrade gracefully when it is gone."*
:::

## What you now know

- Remember ratios, not absolute numbers: memory:SSD ≈ 1:150, SSD:seek ≈ 1:600, local:WAN ≈
  1:300.
- Sequential beats random by roughly 100× on disk, which is why append-only designs exist.
- Estimate from user behaviour, convert to per-second, apply a peak multiplier, then multiply.
- Per-day divided by 100,000 is roughly QPS.
- Compute the read-to-write ratio before designing: it decides precompute versus compute-on-read.
- A trillion rows needs a cluster; a billion fits on one disk; a million fits in memory.
- Report p50, p95 and p99; a wide gap means bimodality rather than general slowness.
- Tail latency compounds: 100 calls at p99 means most pages are slow.
- Fewer calls is the only fix that changes the exponent; hedging and timeouts bound the damage.
- Availability multiplies down across dependencies and up across redundancy.
- Four serial dependencies at 99.9% give 99.6% — three hours a month.
- 99.99% is 4.4 minutes a month, less than most deploys, so it requires zero-downtime deploys.
- Replicas are not backups; they replicate deletions faithfully.
- Allocate an explicit latency budget per hop so proposals are arguable.
- Egress is often the largest cloud cost and shapes architectures.
- Design for 10× and know where the next bottleneck is.
