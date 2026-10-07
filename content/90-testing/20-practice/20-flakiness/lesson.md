---
title: Flaky tests
summary: A suite that fails one run in fifty teaches people to rerun, and once rerunning is the habit it is applied to the real failure too.
level: intermediate
minutes: 17
version: "1"
status: stable
last_reviewed: "2026-10-07"
tags: [testing, flakiness, ci, determinism]
concepts: [flakiness, test-isolation, determinism, ci-reliability]
prerequisites: [test-value, concurrency]
interview:
  - question: Why is a flaky test worse than no test?
    level: intermediate
    answer: >-
      Because it destroys the suite's only real function, which is to be believed when it says no.
      A test that fails one run in fifty teaches the team that red means "try again", and once
      rerunning is the reflex it gets applied uniformly — including to the genuine failure that
      was trying to tell you something. So one flaky test does not cost you one test's worth of
      confidence; it costs you the suite's. The economics are stark: a 1% flake rate across two
      thousand tests means roughly a one-in-three chance that any given full run fails for no
      reason, at which point nobody treats a red build as information.
    followUps:
      - "So what do you do with one the moment you find it?"
  - question: What are the common causes?
    level: intermediate
    answer: >-
      Shared state between tests, so the result depends on order. Time — a test that passes except
      at a month boundary or in a different timezone. Real concurrency, including a UI test racing
      the thing it is asserting on. Randomness, including unseeded fixture generation. External
      dependencies, which are down sometimes. And resource contention in CI, where a parallel run
      is slower so a timeout that was generous locally is not. The underlying pattern is almost
      always an unstated assumption about ordering, timing or isolation.
    followUps:
      - "Which is the most common in practice?"
  - question: How do you find a flaky test that only fails in CI?
    level: advanced
    answer: >-
      First, make it reproducible: run the suite with the same random seed CI used, since an
      order-dependent failure is reproducible once you know the order. Then bisect the order —
      run the failing test with progressively smaller subsets before it to find which earlier test
      leaves the state behind. If order is not the cause, run the single test in a loop a few
      hundred times to catch a timing or randomness issue. And in the meantime quarantine it, so
      the build stays trustworthy while you work, rather than leaving the whole team to rerun.
    followUps:
      - "What does quarantine mean specifically?"
resources:
  - title: "Google — Flaky Tests at Scale"
    url: https://testing.googleblog.com/2016/05/flaky-tests-at-google-and-how-we.html
---

## The arithmetic

```text
  A 1% flake rate per test, 2,000 tests:

    P(a clean full run) = 0.99^2000 ≈ 0.0000000002

  Even at 0.01% per test:

    P(a clean full run) = 0.9999^2000 ≈ 0.82
    → roughly 1 in 5 full runs fails for no reason

  So the acceptable per-test flake rate in a large suite is
  approximately zero, and "it only fails occasionally" does not
  scale. This is the same compounding as tail latency across
  service calls: individually negligible, collectively decisive.
```

:::what
A **flaky test** passes or fails on the same code, nondeterministically. **Test isolation** is each
test being unaffected by any other. **Quarantine** is removing a test from the blocking build while
keeping it running and visible.
:::

:::why
The damage from flakiness is not the failed runs. It is what the team learns.

A suite's entire value is that when it says no, you believe it and stop. The first time a red build
turns out to be nothing, someone reruns it and it goes green. That works, so it happens again. Within
a few weeks "rerun it" is the reflex response to a red build — and the reflex cannot distinguish a
flake from a real regression, because distinguishing them is precisely the work it exists to avoid.
So the real cost is a genuine failure that gets rerun three times, passes once by luck, and ships.

The arithmetic above is why "it only fails occasionally" is not a defence. A per-test rate low
enough to seem acceptable compounds across the suite into a build that fails for no reason
regularly, and at that point the signal is gone whether or not anyone admits it.

There is a second cost that is easy to miss: a flaky test is usually reporting something true. A
test that fails when run after another test is telling you about shared state that production also
has. A test that fails at a month boundary is telling you about date arithmetic that will also fail
in production, on the 31st. A test that races the UI is telling you the UI has no completion signal.
Treating flakiness as a test problem and silencing it discards a genuine bug report a surprising
proportion of the time.
:::

:::how
```text
  THE CAUSES, roughly in order of frequency

  1. SHARED STATE — order-dependent
       a class variable, a memoised singleton, a record created in
       before(:all), a cache, a global registry, a stubbed
       constant not restored
       symptom: passes alone, fails in a suite, or vice versa

  2. TIME
       Time.now in an assertion
       a test that fails on the 31st, or at a month boundary
       timezone: passes in UTC, fails in IST
       DST: 23- and 25-hour days exist
       symptom: fails at a particular time, or in a particular
                environment

  3. CONCURRENCY AND ASYNCHRONY
       a UI test asserting before the request completes
       a background job that may or may not have run
       two tests using the same database row in parallel
       symptom: fails under load, or under parallel execution

  4. RANDOMNESS
       unseeded fixture data that occasionally collides
       a random name that is occasionally too long for the column
       symptom: fails rarely, with a different value each time

  5. EXTERNAL DEPENDENCIES
       a real HTTP call, DNS, a shared staging environment
       symptom: fails when something else is broken

  6. RESOURCE CONTENTION IN CI
       a timeout generous locally and not under 8 parallel jobs
       symptom: fails only in CI, more when CI is busy

  THE DIAGNOSTIC SEQUENCE

    # 1. Reproduce. An order-dependent failure IS reproducible
    #    once you know the order — which is why CI must print the
    #    seed.
    rspec --seed 12345

    # 2. Bisect the order. Which earlier test leaves state behind?
    rspec --bisect --seed 12345
    #    → "the minimal reproduction is these 2 files"

    # 3. If order is not it, loop the single test.
    for i in $(seq 200); do rspec spec/foo_spec.rb || break; done

    # 4. Run it under load, to surface timing.
    #    Several parallel copies of the suite on one machine.

    # 5. Check what the test assumes about now, order, or
    #    concurrency. The answer is almost always one of those.
```
:::

:::example
```ruby
# 1. Shared state — the most common cause, and the hardest to see.
class FeatureFlags
  def self.enabled?(name) = (@flags ||= load)[name]
end

it "respects the flag" do
  allow(FeatureFlags).to receive(:load).and_return({ "x" => true })
  # @flags is already memoised from an earlier test. The stub is
  # never consulted. Passes alone; fails in the suite — or worse,
  # passes in the suite and fails alone, which is more confusing.
end

# Fixes, in order of durability:
# a. Do not memoise global state. Make the flags an injected
#    dependency.
# b. Reset it explicitly, and make the reset impossible to forget:
config.before { FeatureFlags.reset! }
# c. Freeze it, so an accidental write raises rather than
#    persisting.

# 2. Time — the second most common.
it "expires after 30 days" do
  token = Token.create!(created_at: 30.days.ago)
  expect(token).to be_expired              # fails on some days
end
# `30.days.ago` from a creation time computed at a slightly
# different instant than the comparison means the boundary is
# ambiguous. And a month-length assumption breaks in February.
it "expires after 30 days" do
  travel_to Time.utc(2026, 3, 15, 12, 0) do
    token = Token.create!
    travel 31.days
    expect(token).to be_expired
  end
end
# Freeze the clock, choose a date with no edge properties, and
# move it deliberately. A test that depends on today's date is a
# test that will fail on some future day for no reason.

# 3. Asynchrony — assert on the condition, not on a sleep.
# Flaky: a fixed wait is either too short sometimes or always too
# slow.
click_button "Save"
sleep 2
expect(page).to have_content("Saved")

# Correct: wait for the condition, with a timeout.
click_button "Save"
expect(page).to have_content("Saved", wait: 10)
# Capybara's matchers poll until the condition holds or the
# timeout expires, so the test is as fast as the application and
# only fails if the application is genuinely slow.
#
# The subtler version: asserting on the database immediately after
# a UI action.
click_button "Save"
expect(Order.count).to eq(1)       # flaky: the request may be
                                    # in flight
expect(page).to have_content("Saved")   # wait for the UI first
expect(Order.count).to eq(1)            # now it is safe

# 4. Randomness — seed it, so a failure is reproducible.
Faker::Config.random = Random.new(RSpec.configuration.seed)
# Now a failure caused by generated data can be reproduced with
# the same seed. Unseeded generation produces a failure you
# cannot reproduce, which is the worst kind.
#
# And prefer explicit values where the value matters:
create(:user, email: "a@example.com")    # deterministic
create(:user)                             # random; fine if the
                                          # email is irrelevant
```
:::

:::failure
**Retrying as the fix.** `retry: 3` on the test, or a CI step that reruns failures. It makes the
build green and leaves the nondeterminism in the system — and the test now cannot catch the real
intermittent bug it may have been reporting. Retries are a mitigation while you investigate, not a
resolution.

**`sleep` to fix a race.** It makes the failure less likely and slows every run. Either the wait is
sometimes too short, in which case it is still flaky, or it is always too long. Wait on the
condition.

**Silencing instead of diagnosing.** Deleting or skipping a flaky test discards whatever it was
reporting, and the shared-state and timing causes are frequently real production bugs. Diagnose
first; delete only if the test turns out to be worthless on its own merits.

**No seed printed in CI.** An order-dependent failure is reproducible if you know the order, and
unreproducible if you do not. Printing the seed turns a mystery into a ten-minute bisect, and its
absence is the most common reason flakes go uninvestigated.

**Tests that depend on execution order deliberately.** A test that sets up data for the next one.
Running in a random order will break it, which is the point of running in a random order.

**`before(:all)` for mutable data.** A record created once for a file is shared by every example in
it, so one example mutating it affects the rest, order-dependently.

**Real external calls in tests.** The suite now fails when a third party is down, and it is slow,
and it may be rate-limited. Stub at the HTTP level; verify the real thing on a schedule.

**A timeout tuned on a developer machine.** CI runs several jobs on shared hardware, so everything
is slower. A timeout with no headroom becomes a CI-only flake, which is the hardest kind to
investigate.

**Parallel tests sharing a fixture row.** Two workers updating the same record. Each worker needs
its own database, or the data needs to be per-worker.

**Accepting a flake rate.** A per-test rate of 0.01% is a one-in-five chance that a 2,000-test
suite fails for no reason. The target is zero, and treating any number as acceptable is how a
suite stops being believed.
:::

:::realworld
```text
// The policy that works, and why each part is there.
//
//   1. DETECT. Record every test's pass/fail history by name. A
//      test that has failed and passed on the same commit is
//      flaky by definition, and this is a report rather than an
//      opinion.
//
//   2. QUARANTINE IMMEDIATELY. Move it out of the blocking build
//      the moment it is identified — still running, still
//      reported, not gating merges. This is the key step: it
//      keeps the build trustworthy, which preserves the habit of
//      believing it, while the investigation happens.
//
//   3. ASSIGN IT. A quarantined test with no owner stays
//      quarantined forever, and a growing quarantine list is a
//      slow-motion version of the original problem.
//
//   4. FIX OR DELETE, with a deadline. If nobody will fix it in
//      two weeks, it is not valuable enough to keep, and an
//      honest deletion is better than a permanently quarantined
//      test everyone ignores.
//
//   5. RANDOMISE ORDER ALWAYS, and print the seed. This surfaces
//      order dependence immediately rather than when someone adds
//      a file.
//
// Step 2 is the one that is usually missing, and it is what
// separates a team with a reliable build from a team that reruns.
```

```text
// Making flakiness structurally harder:
//
//   Randomise test order, print the seed, support --bisect.
//   Transactional cleanup per test, or truncation. Never rely on
//     tests cleaning up after themselves.
//   A database per parallel worker.
//   Freeze time by default; make using the real clock the
//     unusual, explicit choice.
//   Seed every random source from the suite's seed.
//   Ban real network calls in the default suite — WebMock's
//     `disable_net_connect!` makes an accidental call a loud
//     error rather than a slow intermittent failure.
//   Generous CI timeouts, since CI hardware is contended.
//   Fail the build on an unexpectedly skipped or pending test, so
//     silencing is visible.
//
// Each of these converts a class of flake from "possible" to
// "impossible" or at least "immediately visible", which is
// cheaper than diagnosing instances of it forever.
```

```text
// The thing worth repeating: a flaky test is often a real bug.
//
//   Order-dependent → shared mutable state, which production has
//     too. A memoised singleton that ignores a configuration
//     change is a production bug with a test symptom.
//   Fails at a month boundary → date arithmetic that will fail on
//     the 31st in production.
//   Races the UI → the UI has no completion signal, so a real
//     user on a slow connection sees the same thing.
//   Fails under parallel execution → a concurrency bug that
//     appears under load.
//
// So the first question about a flake is not "how do I stabilise
// this test" but "what is it telling me". A meaningful proportion
// of the time, the answer is a bug worth fixing.
```
:::

:::mistakes
**Retrying as the fix.** It hides nondeterminism and silences a real intermittent bug.

**`sleep` for a race.** Still flaky, and slower.

**Deleting without diagnosing.** Discards a possible bug report.

**No seed printed in CI.** Reproducible failures become mysteries.

**Deliberate order dependence.** Random ordering exists to catch it.

**`before(:all)` with mutable data.**

**Real network calls in the default suite.**

**Timeouts tuned on a developer machine.** CI is contended and slower.

**Parallel workers sharing fixture rows.**

**Treating any flake rate as acceptable.** It compounds across the suite.

**No quarantine step.** The whole team reruns while one person investigates.
:::

:::tradeoffs
**Randomised order** — surfaces order dependence immediately; failures are initially harder to
reproduce, which printing the seed fixes.

**Fixed order** — reproducible and lets order dependence accumulate invisibly until an unrelated
change exposes it.

**Transactional cleanup** — fast and reliable; it does not work for tests that need committed data,
such as a browser test hitting a separate connection.

**Truncation between tests** — works everywhere and is slower.

**Quarantine** — keeps the build trustworthy during investigation; the quarantine list becomes a
graveyard without owners and deadlines.

**Automatic retries** — a green build today, and the nondeterminism stays and real intermittent
bugs are masked. Acceptable as a temporary measure with a tracking issue, never as policy.

**Real external calls** — genuine integration confidence; slow, dependent on third-party uptime,
and a flake source. Run them on a schedule, not in the default suite.

**Freezing time by default** — removes an entire class of flake; you must remember to unfreeze for
the few tests that need real elapsed time.

The position worth holding: **a flaky test is an incident, not an annoyance.** Quarantine it the
moment it is identified so the build stays believable, then diagnose it — and expect a meaningful
fraction of them to be real bugs about shared state, dates or concurrency rather than test defects.
:::

:::checkpoint
1. A 0.01% per-test flake rate across 2,000 tests — what fraction of full runs fails for no
   reason?
2. What does a flaky test cost beyond the failed runs?
3. List the six common causes. Which is most frequent?
4. Why is `retry: 3` a mitigation rather than a fix?
5. Why is `sleep 2` the wrong fix for a race, and what is the right one?
6. Why must CI print the random seed?
7. What does quarantine mean, and which problem does it solve?
8. Give three cases where a flaky test is reporting a real production bug.
:::

:::interview
Lead with what it costs, because the arithmetic is more persuasive than the principle:

*"A flaky test is worse than no test, because it destroys the suite's only real function — being
believed when it says no. The first red build that turns out to be nothing teaches someone to
rerun, that works, and within weeks rerunning is the reflex. The reflex cannot distinguish a flake
from a regression, because distinguishing them is exactly the work it exists to avoid, so the real
cost is a genuine failure that gets rerun three times, passes by luck, and ships. And the
arithmetic means 'it only fails occasionally' is not a defence: a per-test rate of 0.01% across
two thousand tests gives roughly a one-in-five chance that any full run fails for no reason."*

Name the causes compactly, with the pattern underneath:

*"Shared state, so the result depends on order. Time — a test that fails on the 31st, or in a
different timezone, or across a DST boundary. Concurrency, including a UI test racing the thing it
asserts on. Unseeded randomness. External dependencies. And resource contention in CI, where a
timeout that was generous locally is not under eight parallel jobs. The pattern underneath is
almost always an unstated assumption about ordering, timing or isolation."*

Describe the process, with quarantine as the step people skip:

*"First make it reproducible — an order-dependent failure is reproducible once you know the order,
which is why CI must print the seed, and `--bisect` then finds the minimal pair of files. If order
is not the cause, loop the single test a few hundred times, and run the suite under load for timing
issues. But before any of that, quarantine it: out of the blocking build, still running, still
reported. That is the step usually missing, and it is what keeps the build believable while one
person investigates instead of the whole team rerunning."*

And the point that changes how people treat them: *"I would push back on treating flakiness as
purely a test problem, because a meaningful fraction of flakes are real bugs. An order-dependent
failure is shared mutable state that production also has. A test failing at a month boundary is date
arithmetic that will fail on the 31st. A test racing the UI means the UI has no completion signal,
which a real user on a slow connection also experiences. So the first question is not how to
stabilise the test but what it is telling me."*
:::

## What you now know

- Flakiness compounds: 0.01% per test across 2,000 tests fails roughly one full run in five.
- The real cost is teaching the team to rerun, which is then applied to genuine failures.
- Causes, in rough order: shared state, time, concurrency, randomness, external calls, CI
  contention.
- Shared state is the most common and the hardest to see, because it is order-dependent.
- Retries are a mitigation with a tracking issue, never a resolution.
- `sleep` makes a race less likely and slows every run; wait on the condition with a timeout.
- Assert on the UI's completion signal before asserting on the database.
- CI must print the random seed, or order-dependent failures are unreproducible.
- `--bisect` finds the minimal reproduction once you have the seed.
- Quarantine immediately: out of the blocking build, still running, still reported.
- A quarantine list needs owners and deadlines or it becomes a graveyard.
- Randomise order always, so order dependence surfaces immediately.
- Seed every random source from the suite's seed, so failures reproduce.
- Freeze time by default and make the real clock the explicit exception.
- Ban network calls in the default suite so an accidental one is loud rather than intermittent.
- Give CI generous timeouts; its hardware is contended.
- A flaky test is often a real bug about shared state, dates or concurrency.
