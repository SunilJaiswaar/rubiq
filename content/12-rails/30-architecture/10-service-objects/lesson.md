---
title: Where logic goes when the model gets too big
summary: Service objects, form objects, query objects and concerns — what each is for, and the failure mode of each.
level: advanced
minutes: 13
version: "8.0"
status: stable
last_reviewed: "2026-10-07"
tags: [rails, architecture, service-objects, refactoring]
concepts: [service-objects, concerns, query-objects, single-responsibility]
prerequisites: [controllers, activerecord]
interview:
  - question: What is a service object and when would you add one?
    level: advanced
    answer: >-
      A plain Ruby class representing one business operation, with a single public method,
      taking its collaborators as constructor arguments and returning a result. You add one
      when an operation spans several models, has side effects, or would otherwise live in a
      controller or as a model callback — because in both of those places it becomes
      unreachable from other callers and untestable without a request or a save. The
      signals are: an "and" in the method name, a controller action over twenty lines, or a
      model growing past a few hundred lines with methods unrelated to its own data.
    followUps:
      - "What is the difference between a service object and a model method?"
      - "When is a concern the better tool?"
  - question: Why are Rails concerns criticised?
    level: advanced
    answer: >-
      Because a concern moves code without reducing coupling. The methods still execute in
      the model's context with access to all its state, so a 2,000-line model split into
      eight concerns is still a 2,000-line object — just harder to read, because you now
      have to open eight files to know what `User` responds to. They are genuinely useful
      for behaviour that is shared across unrelated models — timestamping, soft deletion,
      sluggable — where the alternative is duplication. They are not a tool for making a
      large model smaller.
resources:
  - title: "Rails Guides — Active Support Concern"
    url: https://api.rubyonrails.org/classes/ActiveSupport/Concern.html
---

## The shape of the problem

A Rails application starts with logic in the controller. Then it moves to the model,
because "fat model, skinny controller". Then the model is 2,000 lines.

```ruby
class User < ApplicationRecord
  # 40 associations
  # 25 validations
  # 18 callbacks
  # authentication, billing, notification preferences, onboarding state,
  # team membership, API tokens, GDPR export, admin impersonation...
end
```

:::problem
"Fat model" solved a real problem — logic in controllers is unreachable from jobs and rake
tasks — and created a new one. A `User` class containing billing, notifications and GDPR
export has no boundaries, so:

- Everything can reach everything. A notification change can break billing.
- Loading a user loads a class that knows about a dozen subsystems.
- The test file is 3,000 lines and every test needs a full `User`.
- `user.save` triggers eighteen callbacks spanning six concerns.

The advice was never "put everything in the model". It was "not in the controller". There is
a third place.
:::

:::what
A **service object** is a plain Ruby class for one business operation: one public method,
dependencies injected, returning a result. It is not a Rails concept — it is just a class,
which is the point.
:::

## The four tools

```ruby
# 1. SERVICE OBJECT — one operation, usually spanning models, with side effects.
class PlaceOrder
  Result = Struct.new(:success?, :order, :errors, keyword_init: true)

  def initialize(user, inventory: Inventory, mailer: OrderMailer)
    @user, @inventory, @mailer = user, inventory, mailer
  end

  def call(params)
    order = @user.orders.build(params)

    ActiveRecord::Base.transaction do
      order.save!
      @inventory.reserve!(order)
    end

    @mailer.confirmation(order).deliver_later
    Result.new(success?: true, order: order, errors: [])
  rescue ActiveRecord::RecordInvalid
    Result.new(success?: false, order: order, errors: order.errors.full_messages)
  end
end
```

```ruby
# 2. QUERY OBJECT — a complex read, named and testable.
class OverdueInvoices
  def initialize(scope = Invoice.all) = @scope = scope

  def call(as_of: Date.current)
    @scope.unpaid
          .where(due_on: ...as_of)
          .includes(:customer)
          .order(due_on: :asc)
  end
end
# Better than a 12-line scope, because it has a name, a test, and
# somewhere to put the next condition.
```

```ruby
# 3. FORM OBJECT — validation for something that is not one model.
class SignupForm
  include ActiveModel::Model

  attr_accessor :email, :password, :company_name, :accepted_terms

  validates :email, presence: true, format: { with: URI::MailTo::EMAIL_REGEXP }
  validates :password, length: { minimum: 12 }
  validates :accepted_terms, acceptance: true

  def save
    return false unless valid?
    ActiveRecord::Base.transaction do
      company = Company.create!(name: company_name)
      @user = company.users.create!(email: email, password: password)
    end
    true
  end

  attr_reader :user
end
# `accepted_terms` is not a column. It belongs here, not on User.
```

```ruby
# 4. CONCERN — behaviour genuinely shared across unrelated models.
module SoftDeletable
  extend ActiveSupport::Concern

  included do
    scope :kept,    -> { where(deleted_at: nil) }
    scope :deleted, -> { where.not(deleted_at: nil) }
    default_scope { kept }
  end

  def soft_delete! = update!(deleted_at: Time.current)
  def deleted?     = deleted_at.present?
end
# Used by Order, Invoice, Comment — models with nothing else in common.
# This is what concerns are for.
```

:::why
The distinction that makes this useful rather than architecture astronomy:

| | Belongs where | Because |
|---|---|---|
| Logic about **one record's own data** | the model | `order.total` needs the order's items; nothing else is involved |
| An **operation** spanning records, with effects | a service object | reachable from a controller, a job and a rake task; testable without any of them |
| A **complex read** | a query object | it has a name, a test, and room to grow |
| Validation of something **not a model** | a form object | `accepted_terms` is not a column and should not become one |
| Behaviour shared by **unrelated models** | a concern | the alternative is duplication |

The test for a service object is the one from the controllers lesson, inverted: **could this
operation be triggered by something other than a request?** Placing an order can come from
a controller, an admin tool, an API, a CSV import and a retry job. It needs to live
somewhere all five can reach.
:::

:::mistakes
**A service object that is a function with a class around it.**

```ruby
# This is not a service object. It is `format_currency` with ceremony.
class CurrencyFormatter
  def initialize(amount) = @amount = amount
  def call = "₹#{'%.2f' % @amount}"
end
```

If it has no dependencies, no side effects and no branching, it is a method. Put it on the
model or in a module.

**Service objects as a dumping ground.** `UserService` with fourteen public methods is the
fat model again, with a different filename. One class, one operation, one public method.
The name should be a verb phrase — `PlaceOrder`, `CancelSubscription`, `ExportUserData` —
not a noun with `Service` appended.

**Returning `true`/`false` and losing the error.** The caller needs to know *why*:

```ruby
# Poor: the controller cannot render a useful message.
def call = order.save

# Better: a result object carrying the reason.
Result.new(success?: false, errors: order.errors.full_messages)
```

**Concerns used to shrink a model.** A 2,000-line model split into eight concerns is still
one object with 2,000 lines of behaviour and all the same coupling — every method still has
access to all the state. You have made it *harder* to read, because finding what `User`
responds to now means opening nine files.

```ruby
# This is not decomposition:
class User < ApplicationRecord
  include Billable        # 300 lines
  include Notifiable      # 250 lines
  include Onboardable     # 400 lines
  # still one object, still 2,000 lines of behaviour, now spread out
end
```

Real decomposition means a separate object with its own state and a narrow interface:

```ruby
# A different object, not a mixin.
class UserBilling
  def initialize(user) = @user = user
  def charge!(amount) = # ...
  def payment_method  = # ...
end
user.billing.charge!(500)   # delegated, and UserBilling can be tested alone
```

**Over-engineering a small app.** Five service objects for a CRUD admin panel is worse than
the controller code it replaced. These tools are a response to pressure; applied before the
pressure exists they are pure overhead.
:::

:::realworld
```ruby
# The controller after extraction — doing only its job.
class OrdersController < ApplicationController
  def create
    result = PlaceOrder.new(current_user).call(order_params)

    if result.success?
      redirect_to result.order, notice: "Order placed"
    else
      @order = result.order
      render :new, status: :unprocessable_entity
    end
  end
end

# And the operation is now reachable from everywhere it needs to be:
PlaceOrder.new(user).call(params)                    # controller
PlaceOrder.new(admin_acting_as(user)).call(params)   # admin tool
CsvImport.each_row { |r| PlaceOrder.new(r.user).call(r.attrs) }  # import
RetryFailedOrdersJob                                  # job
```

```ruby
# Testing a service object: no request, no database for the collaborators.
RSpec.describe PlaceOrder do
  it "reserves inventory and mails on success" do
    mailer    = double(confirmation: double(deliver_later: true))
    inventory = double(reserve!: true)

    result = PlaceOrder.new(user, inventory: inventory, mailer: mailer).call(valid_params)

    expect(result).to be_success
    expect(inventory).to have_received(:reserve!)
  end
end
```

That test is the whole argument. The same logic as a controller action needs a request spec;
as an `after_create` callback it runs on every factory call in the suite.
:::

:::tradeoffs
**Service objects.** One operation per class, injectable dependencies, testable in
isolation, reachable from any caller. The operation's full scope is visible in one file.

Costs: more files and more names to invent; a reader must follow one more hop from the
controller; and there is no framework guidance, so every team invents slightly different
conventions — `call` versus `perform` versus `execute`, result objects versus exceptions.
That inconsistency is a real cost in a large codebase.

**Keeping it in the model.** Fewer files, no indirection, and Rails' conventions tell you
where to look.

Costs: the model accretes unrelated responsibilities until nothing in it can be understood
or tested in isolation, and callbacks make `save` do unbounded work.

**The honest position:** these are responses to pressure, not defaults. A small application
should keep logic in models and controllers, because the indirection costs more than it
saves. The signals that the pressure has arrived are concrete — a controller action over
twenty lines, a model over a few hundred, an "and" in a method name, a test that needs
elaborate setup. Refactor when you see those, not before.
:::

:::checkpoint
A `User` model is 1,800 lines covering authentication, billing, notification preferences and
GDPR export.

1. Which of those four is most likely to be legitimate model code? Why?
2. "Export this user's data as a zip and email it" — which tool, and why not a callback?
3. "Users with an overdue invoice who have logged in this week" — which tool?
4. Soft deletion is needed on `User`, `Order` and `Comment`. Which tool?
5. Why would splitting the 1,800 lines into six concerns not help?
:::

:::interview
This is a common senior Rails question and the trap is sounding doctrinaire. Interviewers
are listening for whether you can say when *not* to do it.

Define it concretely: *"a plain class for one business operation — one public method,
dependencies injected, returning a result object. Not a Rails concept, which is the point."*

Then the reason, which should be about reachability and testing rather than purity:
*"placing an order can be triggered by a controller, an admin tool, an API, a CSV import and
a retry job. In a controller it is reachable by one of those; as an `after_create` callback it
runs in every test that builds an order. A service object is reachable by all five and
testable without any of them."*

Then the concerns answer, which separates people who have maintained a large Rails app:
*"concerns move code without reducing coupling — every method still has access to all the
model's state, so eight concerns is still one 2,000-line object and now you open nine files
to see what it responds to. They are right for behaviour shared across unrelated models, like
soft deletion. They are not a tool for shrinking a model."*

Close with the restraint: *"and I would not add any of this to a small app. These are
responses to specific pressure — a long controller action, a model you cannot test in
isolation, an 'and' in a method name."*
:::

## What you now know

- "Fat model" meant "not in the controller", not "everything in the model".
- A service object is one operation, one public method, injected dependencies, a result
  object.
- The test: could this be triggered by something other than a request? If so it needs a
  home all callers can reach.
- Query objects for complex reads; form objects for validating things that are not models.
- Concerns are for behaviour shared across *unrelated* models, not for shrinking one model.
- Splitting a large model into concerns reduces no coupling and makes it harder to read.
- Real decomposition means a separate object with its own state and a narrow interface.
- Add these when you see the pressure — a long action, an untestable model, an "and" in a
  name — not before.
