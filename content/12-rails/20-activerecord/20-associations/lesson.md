---
title: Associations
summary: belongs_to, has_many, has_many :through and polymorphic — what each generates, and the foreign key you must not forget to index.
level: intermediate
minutes: 13
version: "8.0"
status: stable
last_reviewed: "2026-10-07"
tags: [rails, activerecord, associations]
concepts: [associations, foreign-keys, polymorphic, join-tables]
prerequisites: [joins, activerecord]
interview:
  - question: What is the difference between has_many :through and has_and_belongs_to_many?
    level: intermediate
    answer: >-
      `has_and_belongs_to_many` uses a bare join table with only two foreign keys and no
      model. `has_many :through` uses a real model for the join, so the relationship itself
      can have attributes, validations, callbacks and its own associations. Almost always
      choose `:through`, because the join nearly always turns out to need an attribute —
      when someone was added to a project, what role they have, who invited them. Migrating
      from HABTM to `:through` later means creating a model and rewriting every query that
      used it.
    followUps:
      - "Give me a case where HABTM is genuinely fine."
      - "What index does a join table need?"
  - question: What does Rails not do automatically for a `belongs_to`?
    level: intermediate
    answer: >-
      Index the foreign key. `t.references :user` adds an index by default in a
      `create_table`, but `add_column :orders, :user_id, :integer` does not, and neither
      does adding a `belongs_to` to the model without a migration. An unindexed foreign key
      makes every join and every `order.user` lookup a sequential scan, which is invisible
      in development and the single most common cause of a Rails app that collapses under
      real data.
resources:
  - title: "Rails Guides — Active Record Associations"
    url: https://guides.rubyonrails.org/association_basics.html
---

## What an association actually is

```ruby
class Order < ApplicationRecord
  belongs_to :user
end
```

:::what
An **association** is a declaration that generates methods. `belongs_to :user` defines
`user`, `user=`, `build_user`, `create_user` and `reload_user`, all of which use the
`user_id` column on this table.

It generates Ruby. It creates no database structure at all.
:::

:::problem
That last sentence is the thing people get wrong. The declaration and the schema are
independent, so they can disagree — and when they do, the model lies.

```ruby
class Order < ApplicationRecord
  belongs_to :user       # requires orders.user_id to exist
end
# If the migration never added user_id, this raises at runtime, not at boot.
# If the migration added it without an index, every lookup is a full scan.
```
:::

:::how
```text
  belongs_to :user          the FOREIGN KEY lives on THIS table
    orders.user_id ──▶ users.id

  has_many :items           the foreign key lives on the OTHER table
    orders.id ◀── items.order_id

  has_many :tags, through: :taggings      a real model in the middle
    posts.id ◀── taggings.post_id
                 taggings.tag_id ──▶ tags.id

  has_one :profile          like has_many, but one — FK on the other table
    users.id ◀── profiles.user_id

  polymorphic               one FK pair serving several parent types
    comments.commentable_id   +   comments.commentable_type
```

The rule for remembering which side: **`belongs_to` is on the table holding the foreign
key.** Everything else follows.
:::

## has_many :through

```ruby
# The join is a model, so it can carry data.
class Project < ApplicationRecord
  has_many :memberships
  has_many :users, through: :memberships
end

class Membership < ApplicationRecord
  belongs_to :project
  belongs_to :user
  # ...and now it can have its own attributes:
  #   role, invited_by_id, joined_at
  validates :role, inclusion: { in: %w[owner member viewer] }
end

class User < ApplicationRecord
  has_many :memberships
  has_many :projects, through: :memberships
end
```

```ruby
project.users                      # through the join
project.memberships.find_by(user: u).role    # the join's own data
project.users << user              # creates a Membership
```

:::why
The alternative, `has_and_belongs_to_many`, uses a bare join table with no model:

```ruby
class Project < ApplicationRecord
  has_and_belongs_to_many :users     # projects_users: project_id, user_id
end
```

It is shorter, and it is a bet that the relationship will never need an attribute. That bet
loses almost every time — within a year someone asks for roles, or who invited whom, or
when they joined.

Migrating out of it is not a one-line change: you must create the model, rename the table
to the model's convention, add a primary key the join table never had, and rewrite every
query. **Start with `:through`.** The extra file costs nothing.
:::

## Polymorphic

```ruby
class Comment < ApplicationRecord
  belongs_to :commentable, polymorphic: true
end

class Post < ApplicationRecord
  has_many :comments, as: :commentable
end

class Photo < ApplicationRecord
  has_many :comments, as: :commentable
end
```

```ruby
# Migration:
create_table :comments do |t|
  t.references :commentable, polymorphic: true, null: false, index: true
  t.text :body
end
# → commentable_id (integer) + commentable_type (string), with a composite index
```

:::tradeoffs
**Polymorphic associations** avoid a table per commentable type and keep one `Comment`
model.

The costs are specific and worth knowing before you reach for it:

- **No foreign key constraint is possible.** The database cannot enforce that
  `commentable_id` refers to anything, because the target table varies per row. Orphaned
  comments are now an application concern.
- **Joining is awkward.** You cannot `joins(:commentable)` meaningfully, because there is
  no single table to join. Eager loading issues one query per type.
- **The type column stores a class name as a string.** Rename the class and every existing
  row is wrong until you write a data migration.

The alternative — a nullable foreign key per type, or a separate comments table per parent
— is uglier in the schema and lets the database enforce integrity. For two types the
separate-column version is often better; for six, polymorphic wins.
:::

## The index you must not forget

:::failure
```ruby
# A migration that looks complete and is not:
add_column :orders, :user_id, :bigint

# Every one of these is now a sequential scan of orders:
order.user                        # SELECT * FROM users WHERE id = ?   (fine — users.id is indexed)
user.orders                       # SELECT * FROM orders WHERE user_id = ?   ← full scan
Order.joins(:user)                # scan
Order.where(user: user)           # scan
```

`t.references :user` inside `create_table` adds the index. `add_column` does not, and
neither does adding `belongs_to` to a model. So the failure mode is: someone adds an
association in a later migration, development has 50 rows and is instant, production has
two million and the page times out.

```ruby
# Always, for every foreign key:
add_reference :orders, :user, foreign_key: true, index: true

# On a large table, do not lock it:
add_index :orders, :user_id, algorithm: :concurrently
# (requires disable_ddl_transaction! in the migration)
```

**`foreign_key: true` is separate from the index and also worth having.** The index makes
lookups fast; the constraint prevents an orphan row when a parent is deleted by something
that is not your model.

```sql
-- Find unindexed foreign keys in a Postgres database:
SELECT c.conrelid::regclass AS table_name, a.attname AS column_name
FROM pg_constraint c
JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY(c.conkey)
WHERE c.contype = 'f'
  AND NOT EXISTS (
    SELECT 1 FROM pg_index i
    WHERE i.indrelid = c.conrelid AND a.attnum = ANY(i.indkey)
  );
```

That query is worth running on any Rails database you inherit. It very often returns rows.
:::

:::mistakes
**`dependent:` omitted, leaving orphans.**

```ruby
has_many :items, dependent: :destroy    # loads each and runs callbacks — slow, correct
has_many :items, dependent: :delete_all # one DELETE, no callbacks — fast, skips hooks
has_many :items, dependent: :nullify    # sets order_id to NULL
# omitted → items keep pointing at a deleted order
```

With a foreign key constraint and no `dependent:`, deleting the parent raises instead of
orphaning — which is the database saving you, and a good reason to have the constraint.

**`inverse_of` not inferred, so you get two copies in memory:**

```ruby
order = Order.first
item  = order.items.first
item.order.equal?(order)    # false without inverse_of — a second query and a second object
```

Rails infers `inverse_of` for conventional names and fails to when you use `foreign_key:`
or a scope. Setting it explicitly saves a query and prevents validation oddities where
parent and child disagree about each other's state.

**`belongs_to` is required by default** since Rails 5, which surprises people migrating
older code:

```ruby
belongs_to :user                    # presence validated — save fails without a user
belongs_to :user, optional: true    # nullable
```

**Counting through an association in a loop.** Covered in the N+1 lesson, and associations
are where it happens.
:::

:::realworld
```ruby
# Scoped associations — a named subset, defined once.
class Order < ApplicationRecord
  has_many :items
  has_many :shipped_items, -> { where(status: "shipped") }, class_name: "Item"
  has_many :recent_items,  -> { order(created_at: :desc).limit(10) }, class_name: "Item"
end

# Associations through associations.
class User < ApplicationRecord
  has_many :orders
  has_many :items, through: :orders        # every item this user has ever ordered
end

# A has_one that is really "the latest of many".
class User < ApplicationRecord
  has_one :latest_order, -> { order(created_at: :desc) }, class_name: "Order"
end

# Self-referential — the shape for threaded comments or org charts.
class Employee < ApplicationRecord
  belongs_to :manager, class_name: "Employee", optional: true
  has_many :reports, class_name: "Employee", foreign_key: :manager_id
end
```

That last one is worth noting: a self-referential hierarchy queried recursively is the
classic case where Active Record runs out and raw SQL with a recursive CTE is the right
answer.
:::

:::checkpoint
Design the schema and associations for: users, projects, and membership of a project with a
role.

1. Which association type, and why not the other one?
2. Write the migration, including every index and constraint.
3. How do you get "all users in this project with the owner role"?
4. A project is deleted. What happens to its memberships, and what are your three options?
5. Which single index, if omitted, makes `user.projects` a sequential scan?
:::

:::interview
Associations questions usually sound basic and are a good index of production experience,
because the interesting answers are all about the schema rather than the DSL.

On `:through` versus HABTM: *"`:through` uses a real model, so the relationship can have
attributes — a role, who invited them, when they joined. HABTM bets that it never will, and
that bet usually loses; migrating out means creating the model, renaming the table, adding a
primary key and rewriting the queries. I start with `:through`."*

The answer that signals you have operated a Rails app: *"and the thing I check first on any
schema I inherit is whether the foreign keys are indexed. `t.references` indexes by default
inside `create_table`, but `add_column :orders, :user_id` does not — so someone adds an
association in a later migration, it is instant against 50 development rows, and
`user.orders` is a sequential scan over two million in production. There is a Postgres query
that lists unindexed foreign keys and it almost always returns something."*
:::

## What you now know

- An association generates Ruby methods and creates no schema. Declaration and migration
  can disagree.
- `belongs_to` lives on the table holding the foreign key; everything else follows from
  that.
- Prefer `has_many :through` over HABTM — the join almost always needs an attribute
  eventually.
- Polymorphic trades away foreign key constraints and easy joins, and stores a class name
  as a string.
- `t.references` indexes by default; `add_column` does not. Unindexed foreign keys are the
  classic production collapse.
- `foreign_key: true` and the index are separate things and you want both.
- `dependent:` omitted leaves orphans; `inverse_of` omitted costs a query and an extra
  object.
- `belongs_to` is required by default since Rails 5.
