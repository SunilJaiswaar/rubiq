---
title: Continuous integration and delivery
summary: A pipeline is a claim about what must be true before code ships. Its value depends on being fast enough to trust and strict enough to mean something.
level: intermediate
minutes: 18
version: "1"
status: stable
last_reviewed: "2026-10-07"
tags: [devops, ci, cd, pipelines, automation]
concepts: [continuous-integration, pipeline-design, build-caching, deployment-gates]
prerequisites: [test-value, flakiness]
interview:
  - question: What is the difference between continuous integration, delivery and deployment?
    level: intermediate
    answer: >-
      Integration is merging to a shared branch frequently with an automated build verifying each
      merge — the point is that integration problems are found in hours rather than at the end of
      a long-lived branch. Delivery means every passing build is *releasable*: artefacts are
      built, migrations are tested, and shipping is one button. Deployment means that button is
      pressed automatically. The distinction between the last two is a business decision rather
      than a technical one, and most teams should get to continuous delivery first — being able to
      ship at any moment is most of the value, and the automatic part is an increment on top.
    followUps:
      - "What has to be true before continuous deployment is safe?"
  - question: What should a pipeline check, and in what order?
    level: intermediate
    answer: >-
      Cheapest and most likely to fail first, so feedback is fast: lint and type checks in
      seconds, then unit tests, then integration tests, then the slow end-to-end layer, then
      security and dependency scanning. Order by expected-time-to-failure rather than by
      importance, because a pipeline's value is partly the speed of its answer. Beyond tests, the
      things worth gating on are the ones that are invisible otherwise: a bundle size budget, a
      migration safety check, a dependency audit. Anything that fails intermittently should not
      gate at all, which is the flakiness argument applied to the build.
    followUps:
      - "Why does pipeline duration matter so much?"
  - question: Why does a slow pipeline matter beyond the waiting?
    level: intermediate
    answer: >-
      Because it changes behaviour. Past roughly ten minutes people stop waiting for it, so they
      context-switch and return later with the context gone — which makes every fix more
      expensive. Past twenty they batch changes into larger pull requests to amortise the wait,
      and larger changes are harder to review and riskier to deploy. So pipeline duration feeds
      directly into change size, which feeds into incident rate. That is why build time is worth
      treating as a product feature with a budget rather than as an infrastructure detail.
    followUps:
      - "So where does the time usually go?"
resources:
  - title: "Accelerate — the four key metrics"
    url: https://itrevolution.com/product/accelerate/
---

## What a pipeline is claiming

```text
  "Everything on the main branch satisfies these conditions."

  The pipeline is the executable form of that sentence, so two
  properties decide its worth:

    STRICT ENOUGH    — does passing actually mean something?
                       a pipeline that only runs lint is a claim
                       about formatting
    FAST ENOUGH      — is the answer available while the author
                       still has the context?

  Those pull against each other, which is the whole design
  problem. More checks means a longer wait; a shorter wait means
  fewer checks or more parallelism.
```

:::what
**Continuous integration** is merging to a shared branch frequently with an automated verification
of each merge. **Continuous delivery** means every passing build is releasable. **Continuous
deployment** means it is released automatically. A **gate** is a check that blocks progress.
:::

:::why
The point of integrating continuously is that integration cost grows faster than linearly with
divergence.

Two branches a day apart conflict in a few lines. Two branches three weeks apart conflict in ways
that require understanding both sets of intentions, and the conflict is frequently semantic rather
than textual — both sides compile, both sides pass their own tests, and the combination is wrong.
Merging daily means that problem is never allowed to grow, which is the actual content of "CI"
before any tooling is involved.

The automated build matters because it makes the claim verifiable. Without it, "main is good" is a
belief maintained by convention, and conventions decay. With it, the claim is a fact that someone
can check, which is what makes it safe for anyone to branch from main at any moment.

The reason speed deserves equal weight with strictness is that a pipeline's value is realised only
when someone acts on its answer. A twenty-minute build does not just waste twenty minutes — people
stop waiting, switch context, and come back with the mental model gone, so the fix that would have
taken two minutes takes fifteen. And they start batching work into larger changes to amortise the
wait, which makes reviews worse and deployments riskier. Pipeline duration therefore propagates
into change size and incident rate, which is why it belongs in a budget rather than being left to
grow.
:::

:::how
```text
  STAGE ORDER — by expected time to failure, not by importance

    1. lint, format, type check        seconds
       → catches the most common mistakes fastest
    2. unit tests                      tens of seconds
    3. build the artefact              a minute or two
       → a compile error here is better than in the deploy
    4. integration tests               minutes, parallelised
    5. end-to-end tests                minutes, a thin layer
    6. security and dependency scan    minutes, can run alongside
    7. deploy to staging, smoke test

    Run 1-3 on every push. Run everything on a pull request.
    Fail fast on the cheap stages so an obvious mistake does not
    cost a full run.

  WHERE THE TIME ACTUALLY GOES

    dependency install     often the largest single cost, and the
                           most cacheable
    the test suite         parallelise by file across N workers
    container build        cache layers, and order the Dockerfile
                           so dependencies come before source
    sequential stages      most things can run in parallel; the
                           dependency graph is usually much
                           shallower than the configuration
                           implies

    The order of effort: cache dependencies, parallelise tests,
    then look at everything else. Those two are usually most of
    it.

  WHAT IS WORTH GATING ON

    ✓ tests, types, lint
    ✓ a bundle or image size budget — invisible otherwise, and it
      only ever gets worse without a gate
    ✓ dependency audit at a defined severity
    ✓ migration safety: does this migration take a lock that
      blocks production?
    ✓ a smoke test against the deployed artefact
    ✗ anything flaky. A gate that fails randomly is not a gate,
      it is a tax, and it trains people to rerun.
    ✗ coverage thresholds. They reward tests that assert nothing.

  THE FOUR METRICS WORTH TRACKING

    deployment frequency      how often you ship
    lead time for changes     commit → production
    change failure rate       what fraction of deploys cause a
                              problem
    time to restore service   how long to recover

    The counter-intuitive finding from the research is that
    frequency and stability move TOGETHER rather than trading off:
    teams that deploy more often have lower change failure rates,
    because each deploy is smaller and the recovery path is
    well-practised.
```
:::

:::example
```yaml
# A pipeline shaped by the principles above.
name: CI
on: [push, pull_request]

jobs:
  # Fast checks, on every push. Seconds.
  quick:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version-file: .nvmrc      # one source of truth for
          cache: npm                      # the version, and a cache
      - run: npm ci                       # ci, not install: respects
                                          # the lockfile exactly
      - run: npm run lint
      - run: npx tsc --noEmit

  # Tests, parallelised. The shard index is what makes it linear
  # in worker count.
  test:
    runs-on: ubuntu-latest
    strategy:
      fail-fast: false        # see every failing shard, not just
      matrix:                  # the first
        shard: [1, 2, 3, 4]
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version-file: .nvmrc, cache: npm }
      - run: npm ci
      - run: npx vitest run --shard=${{ matrix.shard }}/4

  # Things that are invisible without a gate.
  budgets:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: npm ci && npm run build
      - run: node scripts/postbuild.mjs   # exits non-zero over
                                          # the size budget
      - run: npm audit --audit-level=high
```

```bash
# What "fail fast on the cheap stage" is worth, concretely.
#
#   Without ordering: a formatting error is discovered after 18
#   minutes of tests.
#   With ordering: 40 seconds.
#
# Multiply by how often an obvious mistake happens and it is the
# single highest-return change to most pipelines.
```

```text
// Migration safety as a gate — the check that prevents a specific
// class of outage, and which most pipelines lack.
//
//   A migration that takes ACCESS EXCLUSIVE on a large table
//   queues every query behind it, as the locking lesson
//   describes. A linter for migrations (strong_migrations,
//   squawk) fails the build on:
//
//     - adding a column with a volatile default on a large table
//     - adding an index without CONCURRENTLY
//     - adding NOT NULL without a NOT VALID constraint first
//     - renaming or removing a column still referenced by
//       running code
//     - a backfill in the same transaction as a schema change
//
//   Each of those is a known outage shape, and each is a static
//   property of the migration file — so it is exactly the kind of
//   thing a gate should catch, since it is invisible in review
//   and catastrophic in production.
```
:::

:::failure
**A pipeline that takes thirty minutes.** People stop waiting, so feedback arrives after the
context is gone, and they batch changes to amortise the wait — which makes reviews worse and
deploys riskier. Duration is a product concern.

**Flaky gates.** A check that fails randomly trains everyone to rerun, and the rerun reflex is
then applied to real failures. This is the flakiness lesson applied to the whole build, and the
remedy is the same: quarantine it out of the gate immediately.

**Expensive stages first.** Running the full end-to-end suite before the type check means a typo
costs a full pipeline. Order by expected time to failure.

**No dependency caching.** Often the single largest cost in a build, and almost entirely
avoidable. Cache on the lockfile hash so the cache is correct by construction.

**`npm install` instead of `npm ci`.** `install` can update the lockfile, so the build may resolve
different versions than the author tested — which makes the build non-reproducible in exactly the
way a lockfile exists to prevent.

**Secrets in the pipeline configuration.** Committed, visible in logs, and present in every fork's
pull request if the workflow is misconfigured. Use the platform's secret storage, and never echo
them.

**A build that runs on untrusted pull requests with secrets.** A fork's pull request executing
with your deployment credentials is remote code execution with your permissions. Separate the
trusted and untrusted workflows explicitly.

**Coverage thresholds as a gate.** They reward tests that execute code and assert nothing, which
is cost with no benefit. Gate on tests passing; measure coverage without gating.

**No artefact reuse between stages.** Building the application once per stage multiplies the
largest cost. Build once, upload the artefact, and have later stages consume it — which also
means you deploy exactly what was tested.

**Deploying something other than what was tested.** Rebuilding at deploy time means a different
artefact, so the tests verified something else. Promote the artefact, do not rebuild it.

**No way to deploy when the pipeline is broken.** Occasionally you must ship a fix while CI is
down. A documented, audited manual path is better than an undocumented one invented during an
incident.
:::

:::realworld
```text
// Trunk-based development, since it is what makes CI meaningful.
//
//   Short-lived branches, merged within a day or two, behind
//   feature flags when the work is incomplete.
//
//   Why not long-lived branches: integration cost grows faster
//   than linearly with divergence, and the worst conflicts are
//   semantic — both sides pass their own tests and the
//   combination is wrong, which no merge tool detects.
//
//   Feature flags are what make this possible: incomplete work
//   can be on main and off in production, so merging does not
//   require being finished. The cost is flag cleanup, which needs
//   an owner and an expiry or the codebase accumulates dead
//   branches of logic.
```

```text
// The deploy pipeline, as distinct from the build pipeline:
//
//   build once           → one artefact, content-addressed
//   deploy to staging    → automatically
//   smoke test staging   → a handful of real HTTP checks against
//                           the deployed thing, not mocks
//   deploy to production → automatically, or one button
//   verify               → error rate and latency for N minutes
//   roll back            → automatically on a threshold breach
//
//   The two parts people skip are the smoke test and the
//   automatic rollback. A smoke test against the deployed
//   artefact catches the class of failure that unit tests
//   structurally cannot — a missing environment variable, a
//   broken asset path, a migration that did not run — and this
//   platform's own 54 headless-browser checks exist for exactly
//   that reason.
```

```text
// The four metrics, and what each tells you to fix:
//
//   deployment frequency  low → batch size too large, or the
//                         pipeline is too slow to use
//   lead time             long → queueing somewhere: review,
//                         manual gates, or build duration
//   change failure rate   high → insufficient verification, or
//                         changes too large to review
//   time to restore       long → no rollback path, or no
//                         observability to notice
//
// The finding worth repeating is that frequency and stability
// correlate positively. Deploying more often makes things safer,
// because each change is smaller, the diff is reviewable, the
// blast radius is narrower, and the rollback path is exercised
// regularly rather than being theoretical.
```
:::

:::mistakes
**A slow pipeline.** It changes behaviour, not just schedules.

**Flaky gates.** They train people to rerun.

**Expensive stages before cheap ones.**

**No dependency cache.** Usually the largest avoidable cost.

**`npm install` in CI.** Use `ci` so the lockfile is authoritative.

**Secrets in configuration or logs.**

**Untrusted pull requests with access to secrets.** Remote code execution with your permissions.

**Coverage thresholds as a gate.**

**Rebuilding per stage.** Build once, promote the artefact.

**Deploying something other than what was tested.**

**No documented manual deploy path.** One will be invented during an incident.

**Long-lived branches.** Integration cost grows faster than linearly, and the worst conflicts are
semantic.
:::

:::tradeoffs
**More gates** — a passing build means more; every gate adds duration and a chance of a false
failure.

**Fewer gates** — fast feedback and a weaker claim. A pipeline that only lints is making a claim
about formatting.

**Parallelism** — shorter wall-clock time at higher cost and more complexity, and tests must be
genuinely isolated for it to be correct.

**Caching** — large speedups and a correctness risk if the key is wrong. Key on the lockfile hash
so staleness is impossible.

**Continuous deployment** — the smallest possible batch size and the fastest lead time; it requires
real confidence in the suite, feature flags, and automated rollback.

**Continuous delivery with a manual trigger** — the same preparedness with a human decision,
which is appropriate when deploys have external coordination costs. Most teams should reach here
first.

**Trunk-based with flags** — integration problems stay small; flags need lifecycle management or
they accumulate.

**Long-lived branches** — isolation during development, and a merge whose cost grows faster than
linearly with time.

The judgement: **optimise for the smallest change that can safely reach production.** Nearly
everything above follows from that — short branches so changes are small, a fast pipeline so small
changes are cheap to verify, gates that mean something so small changes are safe, and automated
rollback so a mistake is recoverable in minutes.
:::

:::checkpoint
1. Distinguish CI, continuous delivery and continuous deployment. Which distinction is a business
   decision?
2. In what order should stages run, and why that criterion rather than importance?
3. Name two ways a slow pipeline changes behaviour rather than just costing time.
4. Why `npm ci` rather than `npm install` in a build?
5. Why should coverage thresholds not gate a build?
6. Why build once and promote rather than rebuilding per stage?
7. Give three migration patterns worth failing a build over, and why each is dangerous.
8. Why do deployment frequency and stability correlate positively rather than trading off?
:::

:::interview
Define the three terms by what they commit you to, and name the one that is not technical:

*"Integration is merging to a shared branch frequently with an automated build verifying each
merge — and the reason is that integration cost grows faster than linearly with divergence. Two
branches a day apart conflict in a few lines; three weeks apart the conflicts are semantic, where
both sides pass their own tests and the combination is wrong, which no merge tool can detect.
Delivery means every passing build is releasable. Deployment means it releases automatically, and
the gap between those last two is a business decision rather than a technical one — most teams
should reach continuous delivery first, because being able to ship at any moment is most of the
value."*

Give the ordering principle with its justification:

*"Stages in order of expected time to failure rather than importance: lint and types in seconds,
then unit tests, then integration, then a thin end-to-end layer, with scanning alongside. The point
is that a formatting error should cost forty seconds rather than being discovered after eighteen
minutes of tests, and multiplied by how often an obvious mistake happens that is usually the
highest-return change to a pipeline."*

Then the argument that makes duration a first-class concern:

*"And I would treat build time as a product feature with a budget, because a slow pipeline changes
behaviour rather than just costing time. Past about ten minutes people stop waiting, so they
context-switch and return with the mental model gone — a two-minute fix becomes fifteen. Past twenty
they batch work into larger pull requests to amortise the wait, and larger changes are harder to
review and riskier to deploy. So duration propagates into change size and then into incident rate.
Most of the time is usually dependency installation and an unparallelised suite, in that order."*

And the finding worth citing: *"the counter-intuitive result from the DORA research is that
deployment frequency and stability move together rather than trading off. Teams that deploy more
often have lower change failure rates, because each change is smaller, the diff is actually
reviewable, the blast radius is narrower, and the rollback path gets exercised regularly instead of
being theoretical. Which is why I would optimise for the smallest change that can safely reach
production — nearly every other decision here follows from that."*
:::

## What you now know

- CI is frequent merging with automated verification; integration cost grows faster than linearly
  with divergence.
- The worst merge conflicts are semantic, and no tool detects them.
- Delivery means releasable; deployment means released automatically. The gap is a business
  decision.
- Order stages by expected time to failure, so cheap checks fail fast.
- A slow pipeline changes behaviour: context-switching and larger batches, hence more risk.
- Most build time is dependency installation and an unparallelised suite.
- Cache on the lockfile hash; use `npm ci` so the lockfile is authoritative.
- Gate on things otherwise invisible: size budgets, dependency audits, migration safety.
- Never gate on something flaky, and never gate on coverage.
- Build once and promote the artefact, so you deploy exactly what was tested.
- Untrusted pull requests must not have access to deployment secrets.
- Smoke-test the deployed artefact: it catches missing config and broken paths that unit tests
  cannot.
- Automate rollback on an error-rate threshold.
- Document a manual deploy path before an incident forces someone to invent one.
- Trunk-based development with feature flags keeps integration problems small; flags need an
  expiry.
- Deployment frequency and stability correlate positively — smaller changes are safer.
