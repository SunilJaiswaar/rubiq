---
title: Test-driven development
summary: Writing the test first is a design technique that happens to leave tests behind — and the reason it is hard is that it makes bad design immediately uncomfortable.
level: intermediate
minutes: 17
version: "1"
status: stable
last_reviewed: "2026-10-07"
tags: [testing, tdd, design, refactoring]
concepts: [tdd, red-green-refactor, design-feedback, outside-in]
prerequisites: [test-value, test-doubles]
interview:
  - question: What is TDD actually for?
    level: intermediate
    answer: >-
      Design feedback. The tests are a by-product. Writing the test first forces you to use the
      interface before it exists, so if it is awkward to call you find out in thirty seconds
      instead of after it has six callers — and if it needs eight collaborators to set up, the
      test is telling you the object has eight collaborators. That is information you cannot get
      any other way as cheaply. The secondary benefit is that you never write code without knowing
      what would prove it works, which tends to produce smaller steps and fewer debugging
      sessions.
    followUps:
      - "So is the test suite a side effect?"
  - question: Walk me through red-green-refactor.
    level: intermediate
    answer: >-
      Write a failing test for the next small piece of behaviour — and watch it fail, because a
      test that passes before the code exists is testing nothing. Write the simplest code that
      makes it pass, including something obviously incomplete like a hardcoded return, because the
      point of green is to have a working baseline rather than a finished design. Then refactor
      with the test protecting you, which is the step that gets skipped and the step where the
      design actually happens. The discipline of the cycle is that you are never doing two of
      those at once — changing behaviour and changing structure simultaneously is what makes
      debugging hard.
    followUps:
      - "Why does watching it fail matter?"
  - question: When is TDD the wrong approach?
    level: advanced
    answer: >-
      When you do not yet know what you are building. Exploring an unfamiliar API, trying three
      approaches to see which works, or spiking a prototype — tests written before you understand
      the shape are tests you will throw away, and writing them slows the exploration without
      informing it. The honest practice there is to spike freely, then delete the spike and
      rebuild test-first now that you know the design. It is also awkward for things where the
      feedback loop is visual or where the hard part is integration rather than logic, which is
      why nobody sensibly TDDs a CSS layout.
    followUps:
      - "So what do you do about the spike?"
resources:
  - title: "Kent Beck — Test-Driven Development By Example"
    url: https://www.oreilly.com/library/view/test-driven-development/0321146530/
---

## The cycle

```text
     ┌──────────────┐
     │  RED         │  write a failing test for the next small
     │              │  behaviour — and WATCH it fail
     └──────┬───────┘
            ▼
     ┌──────────────┐
     │  GREEN       │  the simplest thing that passes. Hardcoding
     │              │  is allowed. The goal is a baseline, not a
     └──────┬───────┘  design.
            ▼
     ┌──────────────┐
     │  REFACTOR    │  improve the structure with the test
     │              │  holding it. Behaviour unchanged.
     └──────┬───────┘
            │
            └──▶ repeat

  The rule that makes it work: never two at once. Changing
  behaviour and structure in the same step is what turns a
  five-minute problem into an hour of bisecting.
```

:::what
**TDD** is writing a failing test before the code that satisfies it, in small cycles.
**Red-green-refactor** names the three steps. **Outside-in** starts from the user-visible
behaviour and works down; **inside-out** starts from the smallest pieces.
:::

:::why
The reason TDD is worth understanding is that its stated benefit is not its main one.

The stated benefit is a test suite, and you can get that by writing tests afterwards. The actual
benefit is **design feedback at the cheapest possible moment**. Writing the test first means you
are the interface's first caller, before it exists — so you discover that it is awkward to
construct, that it needs five collaborators, that the method name does not say what you want, or
that you need to reach through two objects to get a value, all within thirty seconds and with
nothing to undo.

That feedback is unusually hard to get any other way. By the time code has six callers, the awkward
interface is cemented, and the cost of fixing it is six edits plus a conversation. Before it has
any, it is a free decision.

This also explains why TDD feels difficult, and the explanation is uncomfortable: it makes bad
design *immediately* painful rather than eventually painful. A class with eight dependencies is
hard to test because it is hard to use, and TDD surfaces that on day one instead of in six months.
People often conclude the testing is the problem. Sometimes it is — but the honest reading is that
a test which is hard to write is usually reporting something true.

The second real benefit is smaller steps. If you cannot write the code without first stating what
would prove it works, you tend to write less of it at a time, and you spend far less time in a
debugger asking which of forty new lines is wrong.
:::

:::how
```text
  A WORKED CYCLE — a discount rule

  RED
    it "gives no discount below 5000" do
      expect(Discount.for(4_999)).to eq(0)
    end
    → NameError: uninitialized constant Discount
    → run it. A failing test you have not seen fail might be
      failing for a reason you did not intend.

  GREEN — the simplest thing
    class Discount
      def self.for(_) = 0
    end
    → passes. Obviously incomplete, and that is fine: you now
      have a working baseline and a test that pins one case.

  RED
    it "gives 10% above 5000" do
      expect(Discount.for(5_001)).to eq(500)
    end

  GREEN
    def self.for(amount) = amount > 5_000 ? amount / 10 : 0

  RED — the boundary, which is the interesting one
    it "gives no discount AT 5000" do
      expect(Discount.for(5_000)).to eq(0)
    end
    → passes already. Keep it: it pins the `>` versus `>=`
      decision so a later change cannot silently flip it.

  REFACTOR
    THRESHOLD = 5_000
    RATE = 0.1
    def self.for(amount)
      amount > THRESHOLD ? (amount * RATE).round : 0
    end
    → the names now say why. Tests still green.

  WHY WATCH IT FAIL

    A test written after the code, or not run before the code
    exists, can pass for reasons unrelated to the behaviour:
      - it asserts something already true
      - the setup does not reach the assertion
      - a typo means it tests nothing
      - a `pending` or a skipped block
    Seeing red first proves the test is connected to the thing it
    claims to test. This is the single most skipped step and the
    one that produces tests that never fail.

  OUTSIDE-IN vs INSIDE-OUT

    OUTSIDE-IN
      start: a request spec for the user-visible behaviour
      → it fails, pointing at the first missing piece
      → drop a level, test that, implement it
      → climb back up
      + you only build what the behaviour needs
      + the design is driven by use
      − needs doubles for the pieces that do not exist yet

    INSIDE-OUT
      start: the smallest piece of logic, build upward
      + no doubles needed, every step is real
      − you can build three perfect objects that do not compose,
        and discover it last

    In practice: outside-in for a feature, so the shape is driven
    by the requirement; inside-out for a well-understood algorithm,
    where the pieces are obvious and the composition is not in
    doubt.
```
:::

:::example
```ruby
# 1. Design feedback, caught in the test. This is the whole point.
it "charges the order" do
  service = CheckoutService.new(
    gateway: gateway, mailer: mailer, inventory: inventory,
    audit: audit, pricing: pricing, tax: tax, fx: fx, ledger: ledger,
  )
  # Eight collaborators. The test is unpleasant to write, and the
  # reason is not the test — it is that this object does eight
  # things. The signal arrived before there were any callers.
end

# After listening to it:
it "charges the order and records the payment" do
  service = PaymentService.new(gateway: gateway, ledger: ledger)
  expect { service.call(order) }
    .to change { order.reload.status }.from("pending").to("paid")
end
# Two collaborators, one responsibility, and the rest moved to
# objects with their own tests. The test became easy because the
# design improved — which is the causality worth noticing.

# 2. Fixing a bug, test-first. The highest-value use of the cycle.
#
#   a. Reproduce it as a failing test FIRST.
it "handles an order with no line items" do
  order = Order.create!(user: user)          # no items
  expect(order.total).to eq(0)               # currently raises
end
#   b. Fix it.
#   c. The test stays as a regression test.
#
# Writing the test first here is not dogma: it proves you have
# actually reproduced the bug. Fixing first and then writing a
# test proves only that the code currently does something.

# 3. Outside-in, one level at a time.
# Level 1: the behaviour the user cares about.
it "shows the discounted total at checkout" do
  post "/checkout", params: { cart_id: cart.id }
  expect(response.body).to include("₹4,500")
end
# → fails: no route. Add it.
# → fails: no controller action. Add it.
# → fails: no Discount. NOW drop a level and TDD Discount on its
#   own, then climb back.
#
# Each failure names the next thing to build, so you never build
# anything the behaviour did not ask for — which is where
# speculative generality comes from.
```

```text
// 4. What the refactor step is for, concretely.
//
//   Green with duplication:
//     def total = subtotal + (subtotal * 0.18).round
//     def display = "₹#{(subtotal + (subtotal * 0.18).round) / 100.0}"
//
//   Refactor:
//     def tax   = (subtotal * TAX_RATE).round
//     def total = subtotal + tax
//     def display = format_money(total)
//
//   Behaviour identical, tests unchanged, duplication gone and
//   the names now explain themselves. This step is where the
//   design actually happens, and it is the one that gets dropped
//   under time pressure — which is how a TDD'd codebase ends up
//   looking like any other.
```
:::

:::failure
**Skipping red.** A test that has never failed might be asserting something already true, might
not reach its assertion, or might be skipped. Seeing it fail is what proves it is connected to the
behaviour.

**Skipping refactor.** Then TDD produces working code with no design improvement, which is the
most common way it is "tried and did not help". Green is a baseline; refactor is the point.

**Steps that are too large.** Writing six tests and then all the code loses the feedback: when
something breaks you are back to bisecting forty lines. The step size should be whatever keeps the
next failure obvious.

**Testing implementation because you wrote it first.** Writing the test immediately after the
method, from the method, produces an assertion that mirrors the code. Write it from the
requirement, before the method exists, and it describes behaviour.

**Mocking everything so the test is writable.** When a test is hard because the object has eight
collaborators, the fix is fewer collaborators, not eight doubles. Mocking the pain away discards
exactly the signal TDD was providing.

**TDD on exploration.** Writing tests for an API you do not understand yet produces tests you
delete. Spike freely, learn the shape, then delete the spike and rebuild test-first — the
deletion is the part people skip, and keeping the spike means keeping untested exploratory code.

**100% TDD as an identity.** Nobody usefully TDDs a CSS layout, a prototype being shown to a
stakeholder tomorrow, or a one-line configuration change. The technique is for code whose design
matters and whose behaviour can be stated.

**Writing the test after the fix when fixing a bug.** Then you have not proved you reproduced it.
The failing test first is what distinguishes a fix from a change.

**Treating a hard-to-test design as a testing problem.** Sometimes it genuinely is — a framework
with awkward seams, legacy code with no injection points. Usually it is the design, and the test is
reporting something true.

**Never deleting tests.** As the design changes, tests written against an earlier shape become
noise. A suite is not an archive; a test that no longer catches a bug anyone could cause should go.
:::

:::realworld
```text
// Where TDD earns its place most clearly:
//
//   Bug fixes — reproduce as a failing test first. It proves the
//     reproduction, and the test is the regression test. The
//     highest-value, least-arguable use.
//
//   Business logic — pricing, tax, eligibility, state machines,
//     date arithmetic. Lots of branches, a clear specification,
//     and painful to debug through the UI.
//
//   Parsers and transformers — input in, output out, easy to
//     specify, many edge cases.
//
//   Refactoring legacy code — write tests for the CURRENT
//     behaviour first, whatever it is, then change the structure
//     with the tests holding. This is the only safe order, and
//     the tests may encode bugs, which is correct: you are
//     preserving behaviour, not endorsing it.
//
// Where it earns less:
//   - UI layout and visual design
//   - throwaway prototypes
//   - glue code with no decisions in it
//   - exploring an unfamiliar library
```

```text
// What TDD does to a codebase, as an observation rather than a
// claim:
//
//   Objects tend to be smaller, because large ones are unpleasant
//     to set up in a test and the unpleasantness arrives early.
//   Dependencies tend to be injected, because that is what makes
//     substitution possible.
//   Pure functions appear more often, because they are trivial to
//     test and the path of least resistance in TDD is the easy
//     test.
//   Error paths get implemented, because writing the test for
//     them is the same cost as the happy path — whereas
//     test-after tends to cover what was built rather than what
//     should have been.
//
// None of those is caused by testing. They are caused by taking
// the feedback, and you can arrive at all of them without TDD if
// you are already disciplined about design. TDD's claim is that it
// makes the feedback arrive whether or not you were looking for
// it.
```

```text
// Honest accounting of the research:
//
//   Studies on TDD's effect on defect rates and productivity are
//   mixed. What they more consistently show is that writing tests
//   at all correlates with fewer defects, and that smaller
//   increments correlate with less debugging time — both of which
//   TDD enforces rather than uniquely provides.
//
//   The defensible position is that TDD is one reliable way to
//   get design feedback early and keep steps small. If you get
//   those another way, the argument for TDD is weaker. If you do
//   not, it is strong.
```
:::

:::mistakes
**Skipping red.** The test may never have been able to fail.

**Skipping refactor.** No design improvement, which is the main benefit.

**Steps too large.** You lose the feedback and return to bisecting.

**Writing the test from the code.** It mirrors the implementation.

**Mocking away the pain.** Discards the design signal.

**TDD while exploring.** Spike, delete, rebuild.

**TDD as an identity rather than a tool.**

**Writing the test after the bug fix.** You have not proved the reproduction.

**Blaming the test when the design is the problem.**

**Never deleting obsolete tests.** A suite is not an archive.
:::

:::tradeoffs
**Test-first** — design feedback before there are callers, small steps, error paths implemented;
slower on the first pass and useless when you do not yet know the shape.

**Test-after** — faster when the design is already clear; the tests tend to mirror the
implementation, and the design feedback arrives after it is expensive to act on.

**No tests** — fastest to write and every change is then a manual verification problem. Defensible
only for genuinely throwaway code, and that category is smaller than people claim.

**Outside-in** — the design is driven by the requirement and nothing speculative gets built; needs
doubles for pieces that do not exist yet.

**Inside-out** — every step uses real objects and no doubles; you can build three good objects
that do not compose and find out last.

**Small steps** — obvious failures, almost no debugging; more cycles and more apparent ceremony.

**Large steps** — faster when you are confident and you are back to bisecting when wrong.

The honest position: **TDD is a reliable way to get design feedback early and keep increments
small.** If you already get both another way, the case is weaker. For bug fixes and
branch-heavy business logic it is close to unarguable, and for exploration it is the wrong tool.
:::

:::checkpoint
1. What is TDD's primary benefit, and why is the test suite secondary?
2. Why does watching the test fail matter? Give two ways a never-failed test can be worthless.
3. What happens to a TDD'd codebase if the refactor step is skipped?
4. Your test needs eight collaborators. What is it telling you, and what is the wrong response?
5. Outside-in versus inside-out — what does each risk?
6. Why write the failing test before fixing a bug rather than after?
7. When refactoring legacy code, what do you test first, and why might those tests encode bugs?
8. Name two situations where TDD is the wrong tool.
:::

:::interview
Lead with what it is for, because the common answer gets this backwards:

*"It is a design technique that leaves tests behind, not a testing technique. Writing the test
first makes me the interface's first caller before it exists — so I find out that it is awkward to
construct, or needs five collaborators, or has a method name that does not say what I mean, within
thirty seconds and with nothing to undo. By the time it has six callers that is six edits and a
conversation. That feedback at that moment is hard to get any other way."*

Then explain why it feels hard, which is the part that shows you have actually done it:

*"And that explains why it is uncomfortable: it makes bad design immediately painful instead of
eventually painful. A class with eight dependencies is hard to test because it is hard to use, and
TDD surfaces that on day one rather than in six months. The wrong response is to mock the pain
away — eight doubles to make the test writable discards exactly the signal. Sometimes a hard test
really is a framework problem, and usually it is reporting something true about the design."*

Describe the cycle with the step people drop:

*"Red, green, refactor, and never two at once. Watch it fail, because a test that has never failed
might be asserting something already true or not reaching its assertion — that is the most skipped
step and it is what produces tests that can never fail. Green with the simplest thing, hardcoding
allowed, because the goal is a working baseline rather than a finished design. Then refactor, which
is where the design actually happens and the step that disappears under time pressure — which is
how a codebase can be fully TDD'd and look like any other."*

And be willing to say where it does not apply: *"it is the wrong tool when I do not yet know what I
am building. Tests written against an API I am still learning are tests I will delete, so I spike
freely, then delete the spike and rebuild test-first now that I know the shape — the deletion being
the part people skip. The clearest case for it is the opposite: fixing a bug, where the failing test
first is what proves I actually reproduced it, and it becomes the regression test for free."*
:::

## What you now know

- TDD's primary benefit is design feedback before the interface has callers; the suite is a
  by-product.
- A test that is hard to write is usually reporting something true about the design.
- Mocking the difficulty away discards the signal TDD was providing.
- Red, green, refactor — and never change behaviour and structure in the same step.
- Watch the test fail: a never-failed test may assert something already true or never reach its
  assertion.
- Green permits hardcoding; the goal is a working baseline, not a finished design.
- The refactor step is where the design happens, and skipping it is the usual reason TDD
  "did not help".
- Steps should be small enough that the next failure is obvious.
- Writing the test from the code produces an assertion that mirrors the code.
- Outside-in builds only what the behaviour requires and needs doubles for missing pieces.
- Inside-out needs no doubles and risks components that do not compose.
- For a bug, the failing test comes first because it proves the reproduction.
- For legacy code, test the current behaviour first — even if it is wrong — then restructure.
- TDD is the wrong tool for exploration, visual work and throwaway code.
- Spike freely, then delete the spike and rebuild test-first.
- Delete obsolete tests; a suite is not an archive.
