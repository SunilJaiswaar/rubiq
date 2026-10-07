---
title: Models, validations and callbacks
summary: Active Record gives you persistence, validation and lifecycle hooks. Two of those three are good ideas.
level: intermediate
minutes: 15
version: "8.0"
status: stable
last_reviewed: "2026-10-07"
tags: [rails, activerecord, validations, callbacks]
concepts: [activerecord, validations, callbacks, database-constraints]
prerequisites: [select, objects]
interview:
  - question: Are Rails validations enough to guarantee data integrity?
    level: intermediate
    answer: >-
      No. They run in the application, so anything that bypasses it — a SQL console, a
      rake task using `update_column`, another service, a data migration — writes
      invalid data. They are also racy: two concurrent requests both pass a uniqueness
      validation and both insert, because the check and the insert are separate
      statements. Validations are for giving users good error messages; a database
      constraint is what actually guarantees the invariant. You want both, for different
      reasons.
    followUps:
      - "So how do you make uniqueness actually safe?"
      - "Which validations have no database equivalent?"
  - question: Why are callbacks considered a design problem?
    level: advanced
    answer: >-
      Because they make saving a record do unbounded, invisible work. `order.save` looks
      like persistence and may send email, call an API and touch four other tables — none
      of which is visible at the call site. They run on every save including data
      migrations and tests, they are hard to opt out of, their ordering is implicit, and a
      failure in one leaves you with a partially-applied operation. They are reasonable
      for things intrinsic to the record — normalising a field, maintaining a derived
      column — and poor for anything with side effects outside it.
resources:
  - title: "Rails Guides — Active Record Validations"
    url: https://guides.rubyonrails.org/active_record_validations.html
  - title: "Rails Guides — Active Record Callbacks"
    url: https://guides.rubyonrails.org/active_record_callbacks.html
---

## What Active Record is doing for you

```ruby
class Order < ApplicationRecord
  belongs_to :user
  has_many :items

  validates :reference, presence: true, uniqueness: true
  validates :total, numericality: { greater_than: 0 }
end
```

```ruby
order = Order.new(reference: "ORD-1", total: 100)
order.save          # INSERT, if valid
order.valid?        # run validations, populate order.errors
order.errors.full_messages
```

You did not write a schema definition, a SQL statement, or a mapping between columns and
attributes. Active Record reads the schema at boot and defines the accessors.

:::problem
The hard part is not the mapping — it is that there are now **two places** that can enforce
a rule, and they do not enforce it equally.

`validates :reference, uniqueness: true` reads like a guarantee. It is not. It is a
`SELECT` followed by an `INSERT`, with a window between them.
:::

:::what
A **validation** runs in Ruby before a save, collecting errors for the user. A **database
constraint** is enforced by the database on every write, regardless of what issued it.

They solve different problems and you need both.
:::

## Why a validation is not a guarantee

```ruby
validates :reference, uniqueness: true

# What Rails actually does:
#   SELECT 1 FROM orders WHERE reference = 'ORD-1' LIMIT 1
#   -- if no row:
#   INSERT INTO orders (reference, ...) VALUES ('ORD-1', ...)
```

:::how
```text
  Two concurrent requests, same reference:

  Request A                         Request B
  ─────────                         ─────────
  SELECT ... WHERE reference=X
    → no rows, valid                SELECT ... WHERE reference=X
                                      → no rows, valid
  INSERT reference=X  ✓
                                    INSERT reference=X  ✓   ← duplicate

  Both validations passed. Both inserts succeeded.
  The validation is a check-then-act race, every time.
```

The fix is a database constraint, because the database can make the check and the write
atomic:

```ruby
# db/migrate/..._add_unique_index_to_orders.rb
add_index :orders, :reference, unique: true

# Now the second INSERT raises ActiveRecord::RecordNotUnique.
```

And then you want *both*, because they do different jobs:

```ruby
class Order < ApplicationRecord
  validates :reference, uniqueness: true   # a good error message, usually

  # The constraint is the guarantee. Handle the race explicitly:
  def save_with_retry
    save!
  rescue ActiveRecord::RecordNotUnique
    errors.add(:reference, "has already been taken")
    false
  end
end
```
:::

:::why
The division of labour is worth stating plainly:

| | Validation | Constraint |
|---|---|---|
| Runs | in the application | in the database |
| Covers | saves through this model | every write, from anywhere |
| Race-safe | no | yes |
| Error message | good, per-field | a database exception |
| Can express | "password confirmation matches" | "this column is never null" |

A validation is a **user interface** feature: it produces "Email has already been taken"
next to the right field. A constraint is a **correctness** feature: it makes the invariant
true no matter what wrote the row.

Rails' documentation historically under-emphasised the second, which is why a great many
production databases contain nulls in columns the model says are required.
:::

## Constraints you should almost always have

```ruby
# A migration that actually enforces things:
create_table :orders do |t|
  t.references :user, null: false, foreign_key: true   # NOT NULL + FK
  t.string  :reference, null: false
  t.decimal :total, precision: 10, scale: 2, null: false, default: 0
  t.timestamps
end

add_index :orders, :reference, unique: true

# A check constraint — available since Rails 6.1:
add_check_constraint :orders, "total >= 0", name: "orders_total_non_negative"
```

:::mistakes
**`validates :user, presence: true` is not a foreign key.** It checks that the association
loads, which means it issues a `SELECT`. A foreign key constraint prevents an orphan row
even when the parent is deleted by something else entirely.

**No `null: false` on a column the model validates for presence.** The two should always
agree, and the migration is the one that matters.

**`update_column` and `update_attribute` skip validations.** So do `update_all`,
`insert_all`, and `touch`:

```ruby
order.update(total: -5)          # validated → false
order.update_column(:total, -5)  # straight to UPDATE — no validation, no callbacks
Order.update_all(total: -5)      # one UPDATE, no model involved at all
```

These are legitimate tools — `update_all` is the right way to touch a million rows — but
they are a hole in the model's guarantees, which is the argument for the check constraint.

**Validating uniqueness scoped to a parent without a composite index:**

```ruby
validates :sku, uniqueness: { scope: :warehouse_id }
# needs:
add_index :items, [:warehouse_id, :sku], unique: true
```

**`save` returning false and nobody noticing.** `save` returns a boolean; `save!` raises.
In a service object or a job, `save!` is almost always correct, because a silently-unsaved
record is worse than an exception.
:::

## Callbacks

```ruby
class Order < ApplicationRecord
  before_validation :normalise_reference
  after_create      :send_confirmation_email     # ← the problem
  after_save        :update_search_index          # ← also a problem
  before_destroy    :check_refundable

  private

  def normalise_reference
    self.reference = reference&.strip&.upcase     # fine: intrinsic to the record
  end

  def send_confirmation_email
    OrderMailer.confirmation(self).deliver_now    # not fine
  end
end
```

:::failure
**What that `after_create` does to you:**

```ruby
# 1. A test that creates an order sends an email.
#    Every test. You now need stubs in a hundred places.
let(:order) { create(:order) }   # ← sends mail

# 2. A data migration importing 50,000 historical orders sends 50,000 emails.
Order.insert_all(rows)           # safe — skips callbacks
Order.create!(rows)              # 50,000 emails to real customers

# 3. The email provider is down. The order cannot be created.
#    A transient mail failure is now a failed checkout.

# 4. Rails console: you fix a typo in an address and an email goes out.
order.update(note: "corrected")  # after_save fires

# 5. The side effect is invisible at the call site.
#    `order.save` tells a reader nothing about email.
```

The deeper problem is **transactional**. `after_create` runs inside the transaction, so:

```ruby
# The email is sent, then the transaction rolls back.
# The customer has a confirmation for an order that does not exist.
ActiveRecord::Base.transaction do
  order.save!          # after_create sends the email
  inventory.decrement! # raises → ROLLBACK
end
```

`after_create_commit` exists precisely for this, and is the minimum correct version if you
insist on a callback:

```ruby
after_create_commit -> { OrderMailer.confirmation(self).deliver_later }
```

`deliver_later` also removes the mail provider from the request path. But the better answer
is usually not to have the callback at all.
:::

:::realworld
**Where the side effect belongs instead.** Make it explicit at the one call site that means
it:

```ruby
# app/services/place_order.rb
class PlaceOrder
  Result = Struct.new(:success?, :order, :errors)

  def initialize(user) = @user = user

  def call(params)
    order = @user.orders.build(params)

    ActiveRecord::Base.transaction do
      order.save!
      Inventory.reserve!(order)
    end

    # Outside the transaction, after it has committed.
    OrderMailer.confirmation(order).deliver_later
    SearchIndexJob.perform_later(order)

    Result.new(true, order, [])
  rescue ActiveRecord::RecordInvalid
    Result.new(false, order, order.errors.full_messages)
  end
end
```

Now: a test that builds an order sends nothing. The import creates orders without email.
The mail provider being down does not fail checkout. And a reader of `PlaceOrder` can see
every consequence in one screen.

**Callbacks that are genuinely fine**, because they are intrinsic to the record and have no
external effect:

```ruby
before_validation :normalise_email         # downcase, strip
before_save       :compute_slug             # derived from another column
after_touch       :invalidate_cached_total  # local, idempotent
normalizes :email, with: ->(e) { e.strip.downcase }   # Rails 7.1+, better than a callback
```

The test: **does it leave the record?** Normalising a column does not. Sending an email,
calling an API, enqueuing a job, writing to another table — all do.
:::

:::internals
**Callback order on create**, which matters when you have several:

```text
  before_validation
    validate
  after_validation
  before_save
    before_create
      INSERT                      ← inside the transaction
    after_create
  after_save
  COMMIT
  after_commit / after_create_commit     ← outside the transaction
```

Two consequences people hit:

**Returning `false` from a `before_*` callback no longer halts the chain** (since Rails 5).
You must `throw :abort`:

```ruby
before_save :check_something

def check_something
  throw :abort unless valid_somehow?   # `return false` does nothing
end
```

**`after_commit` does not run in transactional tests** unless configured, because the test
wraps everything in a transaction that is rolled back. This is a classic source of
"it works in production, the test says nothing happened".
:::

:::tradeoffs
**Validations.** Good error messages, declarative, testable without a database round trip
for most of them. The cost is that they are advisory, racy, and bypassed by several ordinary
Active Record methods.

**Constraints.** Actually guarantee the invariant, for every writer. The cost is that error
messages are database exceptions you must translate, and a constraint violation in a
transaction aborts the whole thing.

**Callbacks.** Genuinely convenient and genuinely the most-regretted feature in large Rails
codebases. The specific failure is that they couple persistence to side effects, so saving a
record becomes an operation of unbounded scope — and the scope is invisible from the call
site.

The position most experienced Rails teams end up at: **validations plus constraints,
callbacks only for things intrinsic to the record, and side effects in explicit service
objects.** Not because callbacks are bad in principle, but because "what happens when I save
this?" should be answerable by reading the caller.
:::

:::checkpoint
A `User` model needs: a unique email, a required name, and a welcome email on signup.

1. Write the validations.
2. Write the migration, including what makes the uniqueness real.
3. Where does the welcome email go, and why not `after_create`?
4. Two signups race with the same email. Trace what happens with and without the index.
5. A data migration imports 10,000 legacy users. What must be true for that to be safe?
:::

:::interview
The validation question is a good senior filter because the junior answer is "validations
ensure data integrity" and the senior answer is "no, they do not".

*"Validations run in the application, so anything bypassing it writes invalid data — a SQL
console, `update_column`, `update_all`, another service. And uniqueness validation is a
check-then-act race: two concurrent requests both pass the SELECT and both INSERT. The
database constraint is the guarantee; the validation is there to produce a good error
message. I want both, and I handle `RecordNotUnique` for the race."*

On callbacks, avoid sounding dogmatic — explain the mechanism: *"my objection is that they
make `save` do unbounded invisible work. An `after_create` that mails means every test
sends email, a data import mails 10,000 customers, and a mail outage fails checkout. And
because `after_create` is inside the transaction, you can send a confirmation for an order
that then rolls back. I keep callbacks for things intrinsic to the record — normalising a
column — and put side effects in a service object where the caller can see them."*
:::

## What you now know

- Validations run in Ruby and are advisory; constraints run in the database and are
  guarantees. Use both, for different reasons.
- Uniqueness validation is a check-then-act race. A unique index is the fix; handle
  `RecordNotUnique`.
- `update_column`, `update_all`, `insert_all` and `touch` skip validations and callbacks.
- `null: false` and `foreign_key: true` belong in the migration; the model validation is
  the message, not the rule.
- `after_create` runs inside the transaction, so a side effect can outlive a rollback.
  `after_create_commit` at minimum.
- A callback is acceptable if the effect does not leave the record. Email, APIs and jobs do.
- `throw :abort`, not `return false`, halts a callback chain.
- `after_commit` is silent in transactional tests, which hides real behaviour.
