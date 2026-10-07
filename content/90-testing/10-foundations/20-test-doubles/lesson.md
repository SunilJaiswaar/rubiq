---
title: Test doubles
summary: Five kinds, one rule — a double at a boundary you control is a liability, and a double at a boundary you do not is usually necessary.
level: intermediate
minutes: 17
version: "1"
status: stable
last_reviewed: "2026-10-07"
tags: [testing, mocks, stubs, fakes, contract-tests]
concepts: [test-doubles, mocking, contract-tests, boundaries]
prerequisites: [test-value]
interview:
  - question: What are the kinds of test double and how do they differ?
    level: intermediate
    answer: >-
      A dummy is passed and never used. A stub returns canned answers. A spy records what was done
      to it. A mock has expectations about calls built in and fails if they are not met. A fake has
      a real working implementation that is simpler — an in-memory repository, SQLite instead of
      Postgres. The distinction that matters in practice is stub versus mock: a stub supports an
      assertion about the result, while a mock makes the interaction itself the assertion. Mocks
      therefore couple tests to the implementation, which is why they are the double to reach for
      last.
    followUps:
      - "So when is a mock actually right?"
  - question: When should you use a double at all?
    level: intermediate
    answer: >-
      When the real thing is outside your control, nondeterministic, slow enough to matter, or has
      a side effect you must not cause. A payment gateway, an email send, the current time, a
      random value. Inside your own application a double is usually a liability, because every one
      of them encodes an assumption that nothing verifies — so the parts can all match your beliefs
      about each other while the system is broken. The heuristic I use is: double at the process
      boundary, use the real thing inside it.
    followUps:
      - "What verifies the assumption at the boundary?"
  - question: What is a contract test?
    level: advanced
    answer: >-
      A test that checks the real implementation and the double agree. If you have an in-memory
      fake repository standing in for a database-backed one, a contract test is a single shared
      test suite run against both — so the fake cannot drift into behaving differently. Across
      services it is the same idea in a distributed form: the consumer records the requests and
      responses it relies on, and the provider's build verifies it still produces them. That is
      what closes the gap mocks otherwise leave, where both sides pass their own tests and the
      integration is broken.
    followUps:
      - "What does a fake get wrong that a contract test would catch?"
resources:
  - title: "Martin Fowler — Mocks Aren't Stubs"
    url: https://martinfowler.com/articles/mocksArentStubs.html
---

## Five kinds

```text
  DUMMY    passed to satisfy a signature, never used
             logger = Object.new
             service = Service.new(logger)   # never logs in this test

  STUB     returns canned answers; no assertions about calls
             allow(gateway).to receive(:charge).and_return(success)

  SPY      records what happened; you assert afterwards if you want
             expect(mailer).to have_received(:deliver).once

  MOCK     expectations built in; FAILS if the call does not happen
             expect(gateway).to receive(:charge).with(1000)

  FAKE     a real, simpler implementation
             class InMemoryOrders
               def initialize = @rows = {}
               def save(o) = @rows[o.id] = o
               def find(id) = @rows.fetch(id)
             end

  The important axis is not the taxonomy. It is: does the test
  assert an OUTCOME, or does it assert an INTERACTION? A stub
  supports the first. A mock IS the second, which is what couples
  it to the implementation.
```

:::what
A **test double** stands in for a real collaborator. A **stub** provides answers; a **mock**
asserts interactions; a **fake** is a working simplified implementation. A **contract test**
verifies that a double and the real thing behave the same way.
:::

:::why
The case for doubles and the case against them are both real, and the resolution is about *which
boundary* you are at.

The case for: some collaborators cannot be used in a test. A payment gateway charges money. An
email send reaches a real inbox. `Time.now` is different on every run, so a test of "expires after
30 days" cannot be written against it. A third-party API is slow, rate-limited, and down sometimes.
For each of those the double is not a compromise — it is the only way to write a deterministic
test at all.

The case against: every double is an assumption, and nothing checks it. You asserted that your
service calls `repo.save(user)`, and the repository test asserted that `save` persists a user.
Both pass. The service actually passes raw parameters. The suite is green and the feature is
broken, and no amount of additional mocked tests can find it, because they are all built on the
same unverified beliefs.

Those two observations do not conflict once you notice they apply to different places. Inside your
own application you control both sides, so using the real object costs almost nothing and tests
the assumption for free. At a process boundary you do not control the other side, so a double is
necessary — and *that* is where the assumption needs verifying by something else, which is what
contract tests are for.

Hence the rule worth internalising: **double at the process boundary, use the real thing inside
it, and contract-test the boundary.**
:::

:::how
```text
  THE BOUNDARY RULE

    ┌─────────────────────────────────────────┐
    │  your application                       │
    │                                         │
    │  Service ──▶ Policy ──▶ Calculator      │  real objects.
    │     │                                   │  A double here is a
    │     └──▶ Repository ──▶ database        │  liability.
    │                                         │
    └──────────────┬──────────────────────────┘
                   │  ← double HERE
         ┌─────────┴──────────┐
         │ payment gateway    │   you do not control it
         │ email provider     │   it has side effects
         │ Time.now / rand    │   it is nondeterministic
         │ another service    │   it is slow and flaky
         └────────────────────┘

    Inside: real objects, real database. The test is slower and it
    verifies the wiring.
    Outside: a double, plus something that verifies the double
    still matches reality.

  STUB vs MOCK, in code

    # STUB — the double provides input; the ASSERTION is about the
    # result. Rewrite the implementation and this still passes.
    allow(gateway).to receive(:charge).and_return(ok(id: "ch_1"))
    result = CheckoutService.new(gateway).call(order)
    expect(order.reload.status).to eq("paid")
    expect(order.charge_id).to eq("ch_1")

    # MOCK — the double IS the assertion. This fails if you rename
    # the method, reorder arguments, or route the call through a
    # wrapper — none of which is a behaviour change.
    expect(gateway).to receive(:charge).with(amount: 1000, token: "t")
    CheckoutService.new(gateway).call(order)

    The mock is right in one case: when the INTERACTION is the
    observable behaviour and there is no outcome to assert.

      "an audit entry is written when an admin views a record"
      "the email is sent exactly once, not twice"
      "we do NOT call the gateway when the order is already paid"

    That last one is the strongest case for a mock: asserting a
    call did NOT happen has no outcome to observe.

  WHAT A CONTRACT TEST DOES

    one shared suite, two subjects:

      shared_examples "an order repository" do
        it "returns what was saved" do
          subject.save(order)
          expect(subject.find(order.id)).to eq(order)
        end
        it "raises for a missing id" do
          expect { subject.find("nope") }.to raise_error(NotFound)
        end
      end

      describe InMemoryOrders  { it_behaves_like "an order repository" }
      describe PostgresOrders  { it_behaves_like "an order repository" }

    Now the fake cannot drift. The usual drift is in the edge
    cases: the fake returns nil where the real one raises, accepts
    a duplicate where the real one violates a unique index, or
    ignores a transaction boundary.
```
:::

:::example
```ruby
# 1. Time and randomness — the two doubles everyone needs.
it "expires a token after 30 days" do
  token = Token.create!
  travel_to 31.days.from_now do        # Rails' time helper
    expect(token).to be_expired
  end
end
# Inject the clock where a helper is unavailable:
class Token
  def initialize(clock: Time)
    @clock = clock
  end
  def expired? = @clock.now > created_at + 30.days
end
# A clock parameter is a tiny amount of ceremony and it makes
# every time-dependent behaviour testable without freezing global
# state — which matters because global time manipulation leaks
# between tests if a block is missed.

# 2. A fake at the boundary, verified by a contract test.
class FakeGateway
  attr_reader :charges
  def initialize = @charges = []
  def charge(amount:, token:)
    raise Gateway::Declined if token == "tok_declined"
    @charges << { amount: amount, token: token }
    Gateway::Result.new(id: "ch_#{@charges.size}", status: "succeeded")
  end
end
# A fake rather than a mock, because:
#   - it is reusable across every test that needs a gateway
#   - it can model the DECLINE path, which is the one most likely
#     to be wrong in production and the one a stub-per-test tends
#     to omit
#   - tests assert outcomes against it rather than interactions
#
# And the contract test that stops it drifting:
shared_examples "a payment gateway" do
  it "returns a succeeded result with an id" do
    r = subject.charge(amount: 100, token: valid_token)
    expect(r.status).to eq("succeeded")
    expect(r.id).to be_present
  end
  it "raises Declined for a declined card" do
    expect { subject.charge(amount: 100, token: declined_token) }
      .to raise_error(Gateway::Declined)
  end
end
describe FakeGateway do
  it_behaves_like "a payment gateway" do
    let(:valid_token) { "tok_ok" }
    let(:declined_token) { "tok_declined" }
  end
end
describe StripeGateway, :external do   # tagged; runs nightly
  it_behaves_like "a payment gateway" do
    let(:valid_token) { "tok_visa" }           # Stripe's test tokens
    let(:declined_token) { "tok_chargeDeclined" }
  end
end
# The real one runs against the provider's sandbox on a schedule
# rather than on every commit, so a provider change is caught
# within a day without making every build depend on their uptime.

# 3. Where a mock is the right tool.
it "does not charge an order that is already paid" do
  order.update!(status: "paid")
  gateway = instance_double(Gateway)
  expect(gateway).not_to receive(:charge)      # no outcome to assert
  CheckoutService.new(gateway).call(order)
end
# There is no observable outcome of "nothing happened", so the
# interaction assertion is the only way to express it. Note
# `instance_double` rather than `double`: a verifying double fails
# if `charge` does not exist on the real class, which catches the
# drift that makes a mock dangerous.
```
:::

:::failure
**Mocking what you own.** Doubling your own service, policy or calculator means the test verifies
your belief about it rather than its behaviour, and it breaks on any refactor. Use the real object;
it is fast and it tests the integration for free.

**Non-verifying doubles.** `double("gateway")` accepts any method, so after renaming `charge` to
`capture` the test still passes while production raises `NoMethodError`. `instance_double` and
`verify_partial_doubles` check the method exists on the real class, which removes most of the
danger.

**Asserting the interaction when an outcome exists.** `expect(repo).to have_received(:save)` where
`expect(order.reload.status).to eq("paid")` was available. The second survives a rewrite; the
first does not.

**A stub per test, so the decline path is never modelled.** Each test stubs the happy path, so the
suite exercises only success and the error branch — the part most likely to be wrong — is never
run. A fake that implements both paths gets used by everything.

**A fake with no contract test.** The fake drifts: it returns nil where the real one raises,
accepts a duplicate the real unique index rejects, or has no concept of a transaction. The suite is
then green against a system that does not exist.

**Stubbing deep internals.** `allow_any_instance_of(SomeClass).to receive(:private_thing)`. This
reaches past three layers of abstraction and welds the test to all of them.

**Over-stubbing until the test asserts nothing.** When the setup stubs every collaborator, the only
thing left under test is the sequence of calls, which is the implementation. If a test needs eight
stubs, the object under test probably has too many collaborators — the test is reporting a design
problem.

**Global time manipulation without a block.** `Timecop.freeze` or `travel_to` without a block
leaks into subsequent tests, producing order-dependent failures that are expensive to trace. Use
the block form, or inject a clock.

**Stubbing the system under test.** Doubling a method on the object you are testing means you are
no longer testing that object. If it seems necessary, the object is doing two things.

**Mocking an HTTP library instead of the HTTP layer.** Stubbing `Net::HTTP` welds the test to the
client library. Use a request-level tool — WebMock, VCR, an HTTP-level fake — so changing the
client does not break every test.
:::

:::realworld
```text
// What to double, and what to use for real.
//
//   DOUBLE (process boundary)
//     payment gateways, email and SMS providers, third-party APIs
//     the clock, randomness, UUID generation
//     file systems and object storage, sometimes
//     another team's service
//
//   REAL (inside your process)
//     your own objects — always
//     the database. A test database is fast enough, and it tests
//       the queries, the constraints and the migrations. Mocking
//       the repository means nothing verifies that the unique
//       index exists.
//     the framework's own machinery
//
//   The database is the one people argue about. The honest
//   position is that a real database makes tests perhaps 10x
//   slower per test and catches an entire class of bug that no
//   amount of repository mocking can — a wrong column name, a
//   missing index, a constraint violation, a scope that does not
//   do what its name says.
```

```text
// Consumer-driven contract testing, between services.
//
//   The problem: service A mocks service B. A's tests pass. B
//   changes a field name. A breaks in production, and B's tests
//   are all green because B does not know what A relied on.
//
//   The fix:
//     1. A's tests record the requests it makes and the responses
//        it depends on. That recording is the contract.
//     2. The contract is published to a broker.
//     3. B's build replays the contract against the real B and
//        fails if it no longer satisfies it.
//
//   So B learns at build time that a change breaks a consumer,
//   which is the information that was missing. Pact is the usual
//   tool.
//
//   The cost is real: a broker to operate, contracts to version,
//   and discipline about keeping them current. It pays for itself
//   when services are owned by different teams, and is usually
//   overkill within one team that can run both sides together.
```

```text
// The quick review signals:
//
//   grep -c 'allow(' and 'expect(.*receive' per spec file
//     → a file with twenty stubs is testing call sequences
//   grep for `double(` without `instance_double`
//     → non-verifying doubles that survive renames
//   grep for `allow_any_instance_of`
//     → reaching past abstractions
//   grep for `Timecop.freeze` or `travel_to` without a block
//     → leaking global state
//   Does any fake have a contract test?
//     → if not, it has drifted or will
```
:::

:::mistakes
**Mocking your own objects.** Use them; it is fast and tests the integration.

**`double` instead of `instance_double`.** Non-verifying doubles survive renames.

**Asserting interactions when an outcome is observable.**

**Stubbing only the happy path.** The error branch never runs.

**A fake with no contract test.** It drifts, usually on edge cases.

**`allow_any_instance_of` on internals.** Welds the test to three layers.

**Eight stubs in a test.** The design, not the test, is the problem.

**Global time manipulation without a block.** Order-dependent failures.

**Stubbing the object under test.** You are no longer testing it.

**Mocking the HTTP library rather than the HTTP layer.**
:::

:::tradeoffs
**Real objects** — the assumptions are verified, refactoring is safe, and the test is slower and a
failure can point somewhere other than the code you changed.

**Stub** — fast, deterministic, and supports asserting an outcome; encodes an assumption nothing
checks.

**Mock** — the only way to assert that something was or was not called; couples the test to the
implementation, so it breaks on safe refactors.

**Fake** — reusable, models error paths properly, tests assert outcomes against it; a second
implementation to maintain, and it drifts without a contract test.

**A real test database** — catches wrong columns, missing indexes and constraint violations, which
no repository double can; roughly an order of magnitude slower per test.

**Recorded HTTP interactions (VCR)** — real responses with no network dependency; the recordings
go stale silently, so they need periodic re-recording or they assert a provider that no longer
exists.

**A provider sandbox, run nightly** — catches provider changes within a day without making every
build depend on their uptime. The usual right answer for an external dependency.

**Consumer-driven contracts** — closes the mock gap between services, at the cost of a broker,
versioning and discipline. Worth it across team boundaries, overkill within one.

The rule: **double at the process boundary, use the real thing inside it, and contract-test the
boundary.** Doubles inside your own code buy speed you did not need and cost you the verification
you did.
:::

:::checkpoint
1. Name the five doubles. Which axis actually matters when choosing?
2. Why is a mock more coupling than a stub? Give the one case where a mock is right.
3. State the boundary rule. Why does it resolve the apparent conflict about mocking?
4. What does `instance_double` catch that `double` does not?
5. What does a contract test verify, and what drift does it usually catch?
6. Why prefer a fake gateway over a stub per test?
7. Why use a real database rather than mocking the repository?
8. What goes wrong with `travel_to` without a block?
:::

:::interview
Give the taxonomy briefly and then the axis that matters, because the taxonomy alone is trivia:

*"Dummy, stub, spy, mock, fake — but the distinction that matters in practice is whether the test
asserts an outcome or an interaction. A stub provides input so you can assert the result; a mock
*is* the assertion about the call. That is why mocks couple tests to the implementation: renaming a
method or routing the call through a wrapper fails the test without changing any behaviour."*

Then resolve the mocking argument with the boundary rule:

*"The case for doubles and the case against are both real, and they apply to different places.
Inside my own application I control both sides, so using the real object costs almost nothing and
tests the assumption for free. At a process boundary — a payment gateway, an email provider, the
clock, another team's service — a double is the only way to write a deterministic test. So: double
at the process boundary, use the real thing inside it. Every double inside your own code is an
assumption that nothing verifies, which is how a service test and a repository test both pass while
the service calls the repository with the wrong thing."*

Then the piece that closes the gap:

*"And the boundary double needs verifying by something other than the tests that use it. Within a
process that is a contract test — one shared suite run against both the fake and the real
implementation, so the fake cannot drift. The drift is almost always in edge cases: the fake
returns nil where the real one raises, or accepts a duplicate the real unique index rejects. Across
services it is the same idea distributed: the consumer records what it relies on and the provider's
build verifies it still produces that, which is exactly the information the provider was missing."*

Two details worth volunteering: *"I use verifying doubles — `instance_double` rather than `double`
— because a plain double accepts any method, so after a rename the test passes and production
raises NoMethodError. And I prefer a real test database to mocking repositories: it is maybe ten
times slower per test and it catches a whole class of bug that no repository double can — a wrong
column, a missing index, a constraint violation, a scope that does not do what its name says."*
:::

## What you now know

- Five doubles: dummy, stub, spy, mock, fake. The axis that matters is outcome versus interaction.
- A stub supports asserting a result; a mock is itself an assertion about a call.
- Mocks couple tests to implementation, so they break on safe refactors.
- A mock is right when the interaction *is* the behaviour — notably asserting a call did not
  happen.
- The rule: double at the process boundary, use the real thing inside it.
- Every double is an assumption, and inside your own code nothing verifies it.
- Use verifying doubles; a plain `double` survives a rename and production does not.
- A fake models error paths once and is reused, where a stub per test covers only the happy path.
- A fake without a contract test drifts, usually on edge cases the real implementation enforces.
- A contract test is one shared suite run against both implementations.
- Consumer-driven contracts give the provider the information it lacks about what consumers rely
  on.
- Use a real test database: it catches wrong columns, missing indexes and constraint violations.
- Inject a clock, or use block-scoped time helpers, or global time manipulation leaks.
- Eight stubs in one test is a design signal, not a testing one.
- Stub the HTTP layer, not the HTTP library.
- Run the real provider's sandbox on a schedule so provider changes are caught within a day.
