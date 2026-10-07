---
title: What makes a test worth having
summary: A test earns its place by failing when the behaviour breaks and not otherwise — which rules out most of what people write, including most of what coverage rewards.
level: basic
minutes: 18
version: "1"
status: stable
last_reviewed: "2026-10-07"
tags: [testing, test-design, coverage, test-pyramid]
concepts: [test-value, coverage, test-pyramid, behaviour-vs-implementation]
prerequisites: [functions]
interview:
  - question: What makes a test valuable?
    level: basic
    answer: >-
      That it fails when the behaviour is wrong and passes when the behaviour is right. Both
      halves matter and the second is the one people neglect: a test that fails when you rename a
      private method is not protecting anything, it is taxing refactoring. So the useful question
      about any test is "what bug would this catch", and if the answer is "none, it restates the
      implementation", the test is a liability — it has a maintenance cost, it occupies review
      attention, and it will eventually be deleted or made to pass without anyone checking
      whether the behaviour is still correct.
    followUps:
      - "So how do you tell whether a test is coupled to the implementation?"
  - question: Is 100% coverage a good goal?
    level: basic
    answer: >-
      No, because coverage measures execution, not verification. A test that calls every line and
      asserts nothing scores 100%, and a suite can reach high coverage while asserting almost
      nothing meaningful. What coverage is genuinely good for is the inverse reading: uncovered
      lines are lines no test exercises, which is information worth having, particularly for error
      paths. So I treat low coverage in an important area as a signal and a high number as no
      evidence at all. Mutation testing is the metric that actually answers the question coverage
      pretends to, by changing the code and checking whether a test notices.
    followUps:
      - "What does mutation testing do?"
  - question: Explain the test pyramid, and the argument against it.
    level: intermediate
    answer: >-
      Many fast unit tests, fewer integration tests, very few end-to-end tests — the shape follows
      from cost: unit tests are milliseconds and precise about what broke, end-to-end tests are
      seconds to minutes and tell you only that something is wrong. The argument against it is
      that unit tests with heavy mocking can all pass while the system is broken, because what
      they verify is that each part matches your beliefs about the others. The useful synthesis is
      the "testing trophy": weight towards integration tests that exercise real collaborators
      within one process, keep unit tests for genuine logic, and keep a thin end-to-end layer for
      the few paths that must work.
    followUps:
      - "Where do you draw the line between unit and integration?"
resources:
  - title: "Kent Beck — Test Desiderata"
    url: https://kentbeck.github.io/TestDesiderata/
---

## The two-part test for a test

```text
  A test earns its place if:

    1. it FAILS when the behaviour is wrong
    2. it PASSES when the behaviour is right

  Most bad tests fail the second condition. They break when you
  rename something, extract a method, change a collaborator, or
  reorder a call — none of which is a behaviour change.

  The question to ask of any test: WHAT BUG WOULD THIS CATCH?

    "it calls the repository with the right arguments"
      → a bug where... you call it with different arguments,
        which is the same as the test being out of date
    "a user with no orders sees the empty state"
      → a real bug, in a real path, that a user would notice
```

:::what
A **unit test** exercises one piece of logic in isolation. An **integration test** exercises
several real components together. An **end-to-end test** drives the whole system as a user would.
**Coverage** is the fraction of lines executed by the suite. **Mutation testing** changes the code
and checks whether any test notices.
:::

:::why
The reason to be strict about test value is that tests are not free, and a suite's cost is paid
continuously while its value is paid once.

Every test is code you maintain. It has to be read in reviews, updated when the design changes,
and debugged when it fails. A suite of three thousand tests where two thousand assert
implementation details does not merely waste the effort of writing them — it makes every
refactoring more expensive, which means the design stops improving, which is the opposite of what
the suite was for.

The failure is specific and worth naming: a test coupled to *how* the code works rather than *what
it does* converts a safe internal change into a day of test updates. People learn from that, and
what they learn is not to restructure code. So an over-specified suite does not just fail to
protect you; it actively prevents the thing it was supposed to enable.

That is also why coverage is a poor target. It measures whether a line ran, not whether anything
would notice if the line were wrong — and a metric that can be satisfied without asserting
anything will be. The thing you actually want to know is "if I broke this, would a test fail",
which is precisely what mutation testing measures and coverage does not.
:::

:::how
```text
  THE PYRAMID, and why the shape follows from cost

                   /\         E2E          seconds-minutes
                  /  \                     fragile, tells you
                 /    \                    only that something
                /      \                   broke
               /────────\    integration   ~100ms
              /          \                 real collaborators,
             /            \                finds wiring bugs
            /──────────────\  unit         ~1ms
           /                \              precise, cheap, says
          /__________________\             exactly what broke

    Cost per test and time to diagnose both rise as you go up.
    Confidence that the system actually works rises too. The
    pyramid is a budget, not a law.

  THE COUNTER-ARGUMENT, which is real

    Heavily mocked unit tests verify that each part matches YOUR
    BELIEFS about the others.

      test: "the service calls repo.save with a User"       ✓
      test: "the repo saves a User to the database"          ✓
      reality: the service calls repo.save(user_params)      ✗

    Both tests pass. The system is broken. Every mock is an
    assumption, and the assumptions are never tested.

    → the "testing trophy": weight towards integration tests
      with real collaborators in one process. Keep unit tests
      for genuine logic — a pricing rule, a state machine, a
      parser — and a thin E2E layer for the handful of paths
      that must work.

  BEHAVIOUR vs IMPLEMENTATION, concretely

    ✗ implementation
        expect(service).to have_received(:calculate_tax)
        expect(order.instance_variable_get(:@total)).to eq(100)
        expect(Order).to receive(:where).with(status: "paid")

      Each one breaks on a refactor that changes nothing
      observable.

    ✓ behaviour
        expect(order.total).to eq(11_500)
        expect { service.call }.to change { order.reload.status }
          .from("pending").to("paid")
        expect(response).to have_http_status(:created)

      Each one breaks only if the system does something
      different.

    The test: could I rewrite the implementation completely,
    keeping the behaviour, and have this test still pass? If no,
    the test is specifying the implementation.
```
:::

:::example
```ruby
# 1. The same requirement, tested two ways.

# Coupled to implementation. Passes whatever the numbers are.
it "calculates tax" do
  calculator = instance_double(TaxCalculator)
  allow(TaxCalculator).to receive(:new).and_return(calculator)
  allow(calculator).to receive(:rate_for).with("IN").and_return(0.18)
  expect(calculator).to receive(:rate_for).with("IN")
  Order.new(country: "IN", subtotal: 10_000).total
end
# What bug does this catch? A bug where you stop calling
# `rate_for`. It does NOT catch a wrong rate, a wrong
# multiplication, a rounding error, or a missing country — which
# are the bugs that would actually occur.

# Tests the behaviour. Breaks only if the answer is wrong.
it "applies 18% GST to an Indian order" do
  order = Order.new(country: "IN", subtotal: 10_000)
  expect(order.total).to eq(11_800)
end
it "rounds tax to the nearest paisa" do
  order = Order.new(country: "IN", subtotal: 10_001)
  expect(order.total).to eq(11_801)
end
# Now the implementation can be rewritten entirely and these still
# hold — and a wrong rate, a rounding mistake or an unhandled
# country all fail.

# 2. What to test, by value.
#
#   HIGH — branches where getting it wrong matters
#     - boundaries: 0, 1, the limit, the limit + 1, empty, nil
#     - error paths, which are the least-exercised code in
#       production and the most likely to be wrong
#     - anything involving money, permissions, or dates
#     - bugs you have already had: a regression test is the
#       cheapest test to justify
#
#   LOW — code with no decisions in it
#     - a getter, a delegation, a one-line wrapper
#     - framework behaviour: that `validates :presence` works is
#       Rails' test, not yours
#     - the exact text of a log line or an error message
#
# 3. Boundaries, which is where most bugs are.
describe "#discount" do
  it("gives none below the threshold")   { expect(cart(4_999).discount).to eq(0) }
  it("gives none AT the threshold")      { expect(cart(5_000).discount).to eq(0) }
  it("gives 10% above the threshold")    { expect(cart(5_001).discount).to eq(500) }
end
# Three tests, and the middle one is the one that catches `>` versus
# `>=`. One test at 10,000 would pass under either and prove
# nothing about the boundary.
```

```ruby
# 4. Mutation testing — the metric that answers what coverage
#    pretends to.
#
#   The tool changes your code and reruns the suite:
#     `>` → `>=`        did a test fail?
#     `+` → `-`         did a test fail?
#     `true` → `false`  did a test fail?
#     delete a line     did a test fail?
#
#   A surviving mutant is a change to your code that no test
#   noticed — which is exactly a bug your suite would miss.
#
#   Running it on a suite with 95% line coverage routinely finds
#   30-50% of mutants surviving, which is the real answer to
#   "is this suite protecting me".
#
#   It is slow (the suite runs once per mutation), so it is a
#   periodic audit of important modules rather than a CI gate.
```
:::

:::failure
**Asserting on mock interactions instead of outcomes.** `expect(x).to have_received(:save)` passes
when `save` is called with the wrong arguments by code that then ignores the result. It also fails
when you rename `save`, which is not a behaviour change.

**One test with twenty assertions.** The first failure stops the test, so you fix one thing, rerun,
find the next. Each test should have one reason to fail, which is what makes the failure message
informative.

**Testing the framework.** A test that `validates :presence` rejects nil is testing Rails. Test
your validation *rules* through behaviour — that a specific invalid input produces a specific error
— not that the framework's mechanism functions.

**Shared mutable state between tests.** A class variable, a memoised singleton, a record created in
a `before(:all)`. Tests pass in isolation and fail in a different order, which is the most
expensive debugging shape there is.

**Coverage as a target.** A suite can hit 100% while asserting nothing. Worse, a coverage gate
encourages tests written to satisfy the metric — calling code and asserting it does not raise —
which is cost with no benefit.

**No boundary cases.** `discount(10_000)` passes under `>` and `>=`. The test that distinguishes
them is the one at exactly the threshold, and that is where off-by-one bugs live.

**Over-specified assertions.** `expect(json).to eq(full_fixture_with_28_fields)` fails when anyone
adds a field, so it will be regenerated without reading — at which point it asserts whatever the
code currently does, which is nothing.

**Testing private methods directly.** If a private method needs its own test, that is usually a
signal it should be a separate object with a public interface. Testing it directly freezes an
implementation detail.

**Mystery guest.** A test depending on fixture data defined elsewhere, so you cannot tell from
reading it why the expected value is what it is. Build the data the test needs in the test.

**Tautological assertions.**

```ruby
result = calculate(input)
expect(result).to eq(calculate(input))   # always passes
expect(order.total).to eq(order.total)   # always passes
```
These appear in real suites, usually after a refactor where someone pasted the implementation into
the expectation.
:::

:::realworld
```text
// What a useful suite looks like in practice.
//
//   A few hundred unit tests
//     for actual logic: pricing, state machines, parsers,
//     permission rules, date arithmetic. Milliseconds each,
//     no doubles needed because the logic has no collaborators.
//
//   A few hundred integration tests
//     real database, real objects, HTTP-level request specs.
//     "POST /orders with valid params creates an order and
//     returns 201." Finds the wiring bugs that mocks hide.
//
//   A dozen end-to-end tests
//     signup, login, checkout, the one flow that generates
//     revenue. Expensive and worth it for exactly those.
//
//   Plus: a regression test for every bug that reached
//   production. These are the easiest tests to justify and the
//   most likely to catch something, because the bug has already
//   demonstrated it is reachable.
```

```text
// The question to ask in review, which does most of the work:
//
//   "What bug would this test catch?"
//
//   Answers that mean the test is fine:
//     - a wrong tax rate
//     - an off-by-one at the discount threshold
//     - a user seeing another user's order
//     - the empty state not rendering
//
//   Answers that mean it should be deleted:
//     - "it checks we call the service"
//     - "it covers that line"
//     - "it documents the implementation"
//
// A test with no answer is a maintenance cost, and deleting a
// test is a legitimate and underused action. A suite is not an
// archive.
```

```text
// The two numbers worth tracking, neither of which is coverage:
//
//   TIME TO FEEDBACK — if the suite takes twenty minutes, people
//     stop running it locally, and a suite that is not run is not
//     protecting anything. Fast tests are a correctness
//     property, not a convenience.
//
//   FLAKE RATE — any non-zero rate trains people to rerun rather
//     than investigate, at which point a real failure is also
//     rerun. This gets its own lesson, because it is the single
//     most destructive thing that can happen to a suite.
```
:::

:::mistakes
**Asserting interactions rather than outcomes.**

**Twenty assertions in one test.** One reason to fail per test.

**Testing the framework instead of your rules.**

**Shared mutable state.** Order-dependent failures.

**Coverage as a target.** It measures execution, not verification.

**No boundary cases.** The threshold is where the bug is.

**Whole-object equality assertions.** They get regenerated without being read.

**Testing private methods.** Freezes an implementation detail.

**A mystery guest.** Build the data the test needs in the test.

**Tautological assertions.** They always pass.

**Keeping a test nobody can justify.** Deleting tests is allowed.
:::

:::tradeoffs
**Unit tests** — milliseconds, precise diagnosis, no setup; they verify your beliefs about
collaborators rather than reality, so a suite of them can pass while the system is broken.

**Integration tests** — real collaborators, so they find wiring bugs; slower, need a database, and
a failure tells you less precisely where the problem is.

**End-to-end tests** — the only ones that prove the system works; slow, flaky, and expensive to
diagnose. Worth it for a handful of revenue-critical paths.

**Heavy mocking** — fast and isolated, and every mock is an untested assumption that drifts from
reality.

**Real collaborators** — the assumptions are tested; slower, and a change in one place can fail
tests elsewhere, which is sometimes informative and sometimes noise.

**Coverage** — cheap to measure, useful read backwards (uncovered error paths are a real signal),
and worthless as a target.

**Mutation testing** — actually answers whether the suite would catch a bug; too slow for CI, so
use it as a periodic audit of the modules that matter.

The judgement that matters: **weight towards integration tests with real collaborators, keep unit
tests for logic that genuinely has none, and ask of every test what bug it would catch.** A suite
is valuable in proportion to the bugs it would detect, not the lines it executes — and a test that
cannot answer that question costs more than it returns.
:::

:::checkpoint
1. Give the two conditions a test must satisfy. Which one do bad tests usually fail?
2. Why is 100% coverage not evidence of a good suite, and what is coverage genuinely useful for?
3. Give the pyramid and the argument against it. What does the trophy shape propose instead?
4. How do you tell whether a test is coupled to implementation rather than behaviour?
5. Why are three tests around a threshold better than one well inside it?
6. What does mutation testing measure that coverage does not?
7. Why is a whole-object equality assertion a liability?
8. Name two numbers worth tracking about a suite, neither of which is coverage.
:::

:::interview
Give the two-part criterion, and emphasise the half that is usually missed:

*"A test earns its place if it fails when the behaviour is wrong and passes when the behaviour is
right. The second half is the one people neglect: a test that breaks when I rename a private
method or extract a function is not protecting anything, it is taxing refactoring. And that matters
beyond the wasted effort — people learn from it, and what they learn is not to restructure code. So
an over-specified suite does not just fail to protect you, it prevents the thing it was supposed to
enable. The question I ask of any test is 'what bug would this catch', and if the answer is 'none,
it restates the implementation', I would delete it."*

On coverage, be clear about what it measures:

*"Coverage measures execution, not verification — a test that calls every line and asserts nothing
scores one hundred percent. So I treat a high number as no evidence at all, and read it backwards
instead: uncovered lines are lines nothing exercises, which is genuinely useful information,
especially for error paths. The metric that answers the question coverage pretends to is mutation
testing: change `>` to `>=`, flip a boolean, delete a line, and see whether any test notices. On a
suite with ninety-five percent line coverage it routinely finds thirty to fifty percent of mutants
surviving, which is the real answer to whether the suite protects anything."*

On the pyramid, give both sides:

*"Many fast unit tests, fewer integration, very few end-to-end — and the shape follows from cost
rather than from principle. The argument against it is real: heavily mocked unit tests verify that
each part matches your beliefs about the others, so the service test and the repository test can
both pass while the service calls the repository with the wrong thing. Every mock is an untested
assumption. So I weight towards integration tests with real collaborators in one process, keep unit
tests for logic that genuinely has no collaborators — pricing, state machines, parsers — and keep a
thin end-to-end layer for the handful of paths that must work."*

And the practical test for coupling: *"could I rewrite the implementation completely, keeping the
behaviour, and have this test still pass? If not, the test is specifying the implementation."*
:::

## What you now know

- A test must fail when behaviour is wrong *and* pass when it is right; the second is neglected.
- Ask of every test: what bug would this catch? No answer means delete it.
- An over-specified suite makes refactoring expensive, so the design stops improving.
- Coverage measures execution, not verification, and can be satisfied without assertions.
- Read coverage backwards: uncovered error paths are a real signal.
- Mutation testing answers whether a change would be noticed; coverage does not.
- The pyramid follows from cost: unit milliseconds, integration ~100ms, E2E seconds.
- Every mock is an untested assumption, so mocked unit tests can all pass on a broken system.
- The trophy shape weights integration tests with real collaborators.
- Test for coupling: could the implementation be rewritten entirely with the test still passing?
- Boundaries are where bugs live — test at, below and above a threshold.
- One reason to fail per test, or the failure message stops being informative.
- Do not test the framework; test your rules through behaviour.
- Whole-object equality assertions get regenerated without being read.
- Testing a private method usually signals it wants to be its own object.
- Track time-to-feedback and flake rate; a slow suite is not run and a flaky one is not trusted.
