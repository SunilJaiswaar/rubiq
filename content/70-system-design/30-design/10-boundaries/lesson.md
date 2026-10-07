---
title: Where to put the boundaries
summary: Good design is mostly about what a change touches. One test — "does this change belong to one owner" — does more work than any list of principles.
level: advanced
minutes: 18
version: "1"
status: stable
last_reviewed: "2026-10-07"
tags: [system-design, lld, coupling, modules, microservices]
concepts: [coupling, cohesion, boundaries, dependency-direction]
prerequisites: [service-objects]
interview:
  - question: How do you decide where a module boundary should go?
    level: advanced
    answer: >-
      By asking what changes together. A boundary is well placed when a single business change
      touches one side of it and badly placed when it touches both — because then the boundary is
      adding a coordination cost and buying nothing. The useful form of the single
      responsibility principle is not "a class does one thing", which nobody can apply, but
      "a module has one reason to change, belonging to one stakeholder". Pricing rules and tax
      rules both touch an invoice, and they change for different reasons on different schedules
      with different people asking, so they want separating. Two things that always change
      together want joining, regardless of how different they look.
    followUps:
      - "So how do you tell what changes together?"
  - question: What makes coupling bad, specifically?
    level: advanced
    answer: >-
      That a change in one place forces a change in another, so the cost of a change grows with
      how many things reach into it. The distinction worth making is between coupling to an
      interface and coupling to an implementation: depending on "something that can charge a card"
      is fine, and depending on Stripe's particular response shape spread across forty files is
      not. The other distinction is direction. A dependency that points from a volatile module to
      a stable one is cheap, and the reverse is expensive — which is the actual content of
      dependency inversion, rather than "use interfaces everywhere".
    followUps:
      - "Where would you put the interface?"
  - question: When is a microservice the wrong boundary?
    level: advanced
    answer: >-
      When the two sides change together, which is most of the time early on. A service boundary
      costs you a network hop, independent deployment coordination, distributed debugging and the
      loss of transactions and joins across it — and buys independent scaling, independent
      deployment and fault isolation. If a feature regularly requires changing two services
      together, you have paid all of the costs and received none of the benefits. The reliable
      version is to put the boundary inside one codebase first, as a module with an enforced
      interface, and extract it only when the deployment or scaling pressure is real.
    followUps:
      - "How do you enforce a module boundary inside one codebase?"
resources:
  - title: "Parnas — On the Criteria To Be Used in Decomposing Systems into Modules"
    url: https://www.win.tue.nl/~wstomv/edu/2ip30/references/criteria_for_modularization.pdf
---

## One test

```text
  A boundary is well placed when a business change touches one side.

    "add a discount code"
      → pricing module only                     ✓ good boundary

    "add a discount code"
      → pricing, invoice rendering, the email
        template, the API serialiser, and the
        reporting query                         ✗ the boundary is
                                                  not where the
                                                  change is

  The second case is the symptom that matters, and it is
  measurable: look at the last twenty pull requests and count how
  many modules each touched. A module that appears in most of them
  is either genuinely central or badly bounded, and the diff
  usually tells you which.
```

:::what
**Coupling** is the degree to which one module must change when another does. **Cohesion** is the
degree to which a module's contents belong together. A **boundary** is an interface across which
you have decided to restrict knowledge. **Dependency direction** is which side knows about the
other.
:::

:::why
The reason to care about boundaries is that the cost of software is dominated by change, and the
cost of a change is roughly the number of places you must touch and understand.

That reframing matters because the usual framings do not survive contact with real code. "A class
should do one thing" is unfalsifiable — a class that does one thing at one level of abstraction
does ten at another. "Keep coupling low" has no stopping condition, and taken literally produces
an interface per collaborator and indirection nobody can follow. Both are gesturing at something
real and neither tells you what to do on Tuesday.

"What changes together" does. It is observable from version control, it has a clear answer per
candidate boundary, and it explains the cases the principles get wrong. Two modules that always
change together should be one module, however different their contents look — splitting them buys
a coordination cost and nothing else. One module that changes for two unrelated reasons, on two
schedules, at the request of two different people, should be two modules, however similar its
contents look.

Parnas made exactly this argument in 1972 and it has not been improved on: decompose by what
needs to be hidden, which is whatever is likely to change independently. Everything else in design
discipline is downstream of that one criterion.
:::

:::how
```text
  THE FOUR KINDS OF COUPLING, from cheapest to most expensive

  1. DATA — pass a value
       charge(amount_cents)
       The callee knows nothing about the caller. Ideal.

  2. INTERFACE — depend on a shape
       charge(payment_method)  where payment_method responds to
                               #charge
       Substitutable. This is the one you want when you need a
       collaborator at all.

  3. IMPLEMENTATION — depend on a specific thing's internals
       Stripe::Charge.create(...) in forty files
       Changing provider means forty edits, and the forty are not
       findable by grepping for one name.

  4. TEMPORAL / SHARED STATE — depend on an order or a global
       "call setup() before process()"
       Two modules writing the same table
       Invisible in any signature, and the failure is at runtime.

  The fourth is the one that does not show up in a review, which
  is why it survives.

  DEPENDENCY DIRECTION — the part people skip

    Volatile ───▶ Stable      cheap: the stable side does not
                              change, so the dependency costs
                              nothing
    Stable ───▶ Volatile      expensive: every change to the
                              volatile thing reaches into
                              something stable

    So: business rules should not depend on a payment provider's
    SDK. The SDK changes quarterly and the rules do not.

      ✗  Order ──▶ Stripe::Charge
      ✓  Order ──▶ PaymentGateway (an interface you own)
                        ▲
                   StripeGateway

    And the interface belongs with the CONSUMER, not with the
    implementation — otherwise you have only moved the dependency.
    `PaymentGateway` lives next to `Order`, and the Stripe adapter
    depends on it.

  THE PROGRESSION OF BOUNDARIES, in cost order

    1. a function            — free, reversible in minutes
    2. a class               — free, reversible
    3. a module/namespace    — nearly free, enforceable with a
                               lint rule
    4. a package/gem         — a version to manage
    5. a separate database   — no joins, no transactions across it
    6. a separate service    — a network hop, two deploys, and
                               distributed debugging

    Each step costs more and is harder to undo. The useful
    discipline is to place the boundary at level 3 first, which
    costs almost nothing, and promote it only when there is
    measurable pressure — a scaling need, a deployment conflict, a
    team ownership change.
```
:::

:::example
```ruby
# 1. Enforcing a module boundary inside one codebase — level 3,
#    which is where most boundaries should live.
#
#    app/
#      billing/            ← a bounded context
#        public/           ← the only entry point
#          billing.rb      ← the facade
#        internal/
#          invoice.rb
#          tax_calculator.rb
#      orders/
#        public/
#          orders.rb

# A lint rule makes the boundary real rather than aspirational.
# .rubocop.yml, or packwerk, or an ESLint no-restricted-imports:
#   Orders may reference Billing only through Billing's facade.
#   Nothing outside Billing may reference Billing::Internal::*.
#
# This is exactly the technique this platform's own codebase uses:
# `engines/`, `runners/` and `storage/` are forbidden from importing
# React or anything from `features/`, enforced by
# no-restricted-imports. An unenforced boundary is a comment.

# 2. Dependency inversion where it actually helps.
module Orders
  # The interface lives with the CONSUMER. Orders defines what it
  # needs; it does not import what exists.
  class PaymentGateway
    def charge(amount_cents:, token:) = raise NotImplementedError
  end
end

module Payments
  class StripeGateway < Orders::PaymentGateway    # points inward
    def charge(amount_cents:, token:)
      Stripe::Charge.create(amount: amount_cents, source: token)
    end
  end
end
# Stripe's SDK is now mentioned in exactly one file. Swapping
# providers is one new class. And the dependency points from the
# volatile side (Stripe) to the stable side (the business rule),
# which is the whole point.

# 3. When NOT to invert.
class OrderExport
  def to_csv(orders) = CSV.generate { |csv| orders.each { |o| csv << row(o) } }
end
# A CsvWriterInterface here buys nothing: CSV is in the standard
# library, it is not going to change, and there is no second
# implementation on the horizon. An interface with one
# implementation and no plausible second is indirection, not
# decoupling — it makes the code harder to follow in exchange for
# a flexibility nobody will use.
```

```text
// 4. A boundary that is in the wrong place, and the symptom.
//
//   Modules split by LAYER:
//     controllers/  models/  services/  serializers/
//
//   "Add a discount code" touches:
//     controllers/orders_controller.rb
//     models/order.rb
//     services/pricing_service.rb
//     serializers/order_serializer.rb
//
//   Four directories, one change. The layers are a taxonomy of
//   technical kind, not of reason-to-change, so every business
//   change crosses all of them.
//
//   Modules split by DOMAIN:
//     billing/   ordering/   shipping/   catalog/
//
//   "Add a discount code" touches billing/ only.
//
//   Layering within each domain is still useful. The point is
//   which axis is the OUTER one — and the outer axis should be
//   the one changes follow.
```
:::

:::failure
**Splitting by technical layer at the top level.** Every business change crosses every directory,
so the structure actively works against the thing you do most often. Layers belong inside a
domain, not above it.

**An interface with one implementation and no second in sight.** Indirection without decoupling.
You now read two files to understand one behaviour, and the flexibility is never exercised. Add
the interface when the second implementation arrives, or when you need to substitute in a test and
cannot otherwise.

**Shared mutable state as a hidden boundary violation.** Two modules writing the same table are
coupled through the schema regardless of how clean their code looks, and the coupling is invisible
in every signature. This is the hardest kind to find and the most common in long-lived systems.

**Extracting a microservice to fix a code-organisation problem.** If the problem is that two parts
of the code know too much about each other, a network call between them does not reduce the
knowledge — it adds latency, a serialisation format, two deploys, and distributed debugging to the
same coupling. Fix the module boundary first; the service boundary is a deployment decision.

**A distributed monolith.** Services that must be deployed together. You have every cost of
services and none of the independence, which is strictly worse than the monolith you started with.
The test is whether you can deploy one without the other.

**Dependency direction pointing from stable to volatile.** Business rules importing a vendor SDK.
Every SDK upgrade becomes a change to your domain logic, which is exactly backwards.

**An interface defined with the implementation.** Putting `PaymentGateway` in the payments module
means `Orders` still depends on `Payments`, so nothing was inverted. The interface belongs with
whoever needs it.

**Boundaries nobody enforces.** A comment saying "do not import from internal" is not a boundary.
Within a year there will be imports from internal, and nobody will know which were deliberate.
Make it a lint rule or accept that it is advisory.

**Premature boundaries.** Three modules with enforced interfaces on day one, when you do not yet
know what changes together, means the boundaries are in the wrong places and the interfaces make
them expensive to move. Start with fewer, larger modules and split when a seam becomes visible.

**Chasing SOLID as a checklist.** The five principles describe properties that good designs tend
to have, and applying them mechanically produces a factory for every value object. The question
"what changes together" is upstream of all of them.
:::

:::realworld
```text
// How to find the boundaries you already have, empirically.
//
//   1. Co-change analysis from git. Files that change in the same
//      commit repeatedly belong together, whatever directory they
//      are in.
git log --format=%H --name-only | awk '/^$/{next} /^[0-9a-f]{40}$/{c=$0;next} {print c, $0}' \
  | ... group by commit, count pairs
//      A cheap version: for the last 200 commits, which pairs of
//      top-level directories appear together most often? Those
//      pairs are either one module or a badly placed boundary.
//
//   2. Count modules per pull request. A median of one or two is
//      healthy. A median of five means the boundaries do not match
//      the changes.
//
//   3. Look for the module that appears in everything. Either it
//      is genuinely foundational — a logging utility — or it is a
//      god object that accreted.
//
// This is more reliable than reasoning about it, because version
// control records what actually changed together rather than what
// you expected to.
```

```text
// When a service boundary IS the right call — the reasons that
// actually justify the cost:
//
//   Different scaling profiles — image processing needs CPU and
//     the API needs connections. One process cannot be sized for
//     both, and a CPU-bound endpoint in a shared process ruins
//     every other endpoint's latency.
//   Different deployment cadence — a payments change needs review
//     and a marketing page does not.
//   Different availability requirements — checkout must survive
//     the recommendation engine being down, which means the
//     dependency must be removable at runtime.
//   Team ownership — Conway's law is descriptive, not aspirational:
//     the architecture will come to match the communication
//     structure, so fighting it is expensive.
//   A different runtime — an ML model in Python next to a Rails
//     application.
//
// Notice that none of these is "the code is messy". A messy
// monolith becomes a messy distributed system with worse tooling.
```

```text
// The practical progression, which is what to actually do:
//
//   1. One codebase, domain-shaped directories.
//   2. Enforce the boundaries with a lint rule. Free, and now the
//      boundary is real.
//   3. Live with it. Move the boundary when a change keeps
//      crossing it — cheap at this level.
//   4. When one module needs separate scaling or deployment,
//      extract it. The interface already exists, so the extraction
//      is mechanical rather than archaeological.
//
// Step 2 is the one people skip, and it is the one that makes
// steps 3 and 4 possible. An unenforced boundary erodes
// invisibly, so by the time you want to extract the module there
// are two hundred references into its internals.
```
:::

:::mistakes
**Top-level directories by technical layer.** Every change crosses all of them.

**An interface with one implementation and no second expected.**

**Shared tables as an invisible boundary violation.**

**A service to fix code organisation.** The coupling survives the network hop.

**Services that must deploy together.** All of the cost, none of the benefit.

**Stable code depending on volatile code.**

**The interface defined with its implementation.** Nothing is inverted.

**Boundaries that are comments rather than lint rules.** They erode.

**Boundaries before you know what changes together.**

**SOLID as a checklist.** It describes symptoms of good design, not a procedure.
:::

:::tradeoffs
**One module** — no coordination cost, nothing to keep in sync, and no protection against
accidental coupling. Right when you do not yet know the seams.

**Modules with enforced interfaces** — nearly free, reversible in an afternoon, and real because a
lint rule enforces it. The right default, and the step most often skipped.

**Separate packages** — explicit versioning and genuine independence; version-skew problems and a
release process.

**Separate databases** — real write-capacity and blast-radius isolation; no joins and no
transactions across the boundary, so you inherit the queue lesson's obligations.

**Separate services** — independent scaling, deployment and failure; a network hop, two deploys,
distributed tracing, and every consistency problem from the consistency lesson.

**An interface per collaborator** — maximally substitutable and testable; indirection that makes
the code hard to read when the flexibility is never used.

**No interfaces** — direct, readable, concrete; and a vendor change becomes a forty-file edit.

The judgement: **place boundaries where changes stop, and make them as cheap as possible until
there is measurable pressure to make them expensive.** A module boundary is reversible in an
afternoon; a service boundary is reversible in a quarter. Choose the cheapest boundary that
expresses the decision, and promote it only when something forces you to.
:::

:::checkpoint
1. What is the one test for a well-placed boundary, and how do you measure it from version
   control?
2. Give the four kinds of coupling in cost order. Which one does not appear in a code review?
3. Why does dependency direction matter, and which way should it point?
4. Where does an interface belong — with the consumer or the implementation? Why?
5. Why does splitting top-level directories by technical layer work against you?
6. When is an interface with one implementation a mistake, and when is it not?
7. What is a distributed monolith, and what is the test for one?
8. Name three reasons that genuinely justify a service boundary, and one that does not.
:::

:::interview
Give the test, not the principles, because the test is what is actually usable:

*"I ask what changes together. A boundary is well placed when a single business change touches one
side of it, and badly placed when it touches both — because then the boundary is adding
coordination cost and buying nothing. And it is measurable rather than a matter of taste: look at
the last twenty pull requests and count how many modules each one touched. A median of one or two
is healthy; a median of five means the boundaries do not match the changes. Version control records
what actually changed together, which is more reliable than reasoning about it."*

Then be specific about coupling, since "low coupling" on its own says nothing:

*"The distinction I care about is coupling to an interface versus to an implementation. Depending
on 'something that can charge a card' is fine; depending on Stripe's response shape across forty
files is not. And direction matters as much as degree: a dependency from a volatile module to a
stable one is cheap, and the reverse is expensive — so business rules should not import a payment
SDK, because the SDK changes quarterly and the rules do not. That is the actual content of
dependency inversion. The detail people miss is that the interface belongs with the consumer: if
`PaymentGateway` lives in the payments module, orders still depends on payments and nothing has
been inverted."*

On microservices, give the cost honestly:

*"A service boundary costs a network hop, two deploys to coordinate, distributed debugging, and the
loss of transactions and joins across it. It buys independent scaling, independent deployment and
fault isolation. So if a feature regularly needs changing two services together, you have paid
every cost and received no benefit — that is a distributed monolith, and the test is whether you
can deploy one without the other. What justifies the cost is a different scaling profile, a
different deployment cadence, a different availability requirement, team ownership, or a different
runtime. 'The code is messy' is not on that list, because a messy monolith becomes a messy
distributed system with worse tooling."*

And the progression, which is the practical recommendation: *"I put the boundary inside one
codebase first as a module with a lint-enforced interface — that is nearly free and reversible in
an afternoon — and promote it to a service only when there is measurable pressure. The step people
skip is the enforcement, and it is the one that matters: an unenforced boundary erodes invisibly,
so by the time you want to extract the module there are two hundred references into its internals."*
:::

## What you now know

- The test is "what changes together" — a boundary is well placed when a change touches one side.
- It is measurable: count modules per pull request over the last twenty changes.
- Coupling in cost order: data, interface, implementation, temporal/shared state.
- Shared mutable state is the kind that never appears in a code review.
- Dependency direction should point from volatile to stable, not the reverse.
- The interface belongs with the consumer, or nothing has been inverted.
- Top-level directories by technical layer make every business change cross all of them.
- Layering belongs inside a domain, not above it.
- An interface with one implementation and no expected second is indirection, not decoupling.
- A service does not fix coupling; it adds a network hop to the same coupling.
- A distributed monolith has every cost of services and none of the independence.
- The test for one is whether you can deploy either side alone.
- Service boundaries are justified by scaling, cadence, availability, ownership or runtime.
- "The code is messy" is not a reason to distribute it.
- Boundaries that are comments erode; make them lint rules.
- Place the cheapest boundary that expresses the decision, and promote it under real pressure.
