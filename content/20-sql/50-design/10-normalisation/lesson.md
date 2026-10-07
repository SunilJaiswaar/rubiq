---
title: Normalisation and schema design
summary: The three normal forms in terms of the bugs they prevent, when to denormalise deliberately, and why a constraint beats a convention.
level: intermediate
minutes: 18
version: "SQL:2016"
status: stable
last_reviewed: "2026-10-07"
tags: [sql, normalisation, schema-design, constraints]
concepts: [normalisation, constraints, schema-design, data-integrity]
prerequisites: [select, joins]
interview:
  - question: Explain the first three normal forms without reciting the definitions.
    level: intermediate
    answer: >-
      1NF: one value per cell — no comma-separated lists in a column, because you cannot
      index, join or constrain the elements of a string. 2NF: every non-key column depends on
      the whole key, not part of it — only relevant with composite keys. 3NF: no non-key
      column depends on another non-key column, so a city stored next to a postcode in the
      same row is a 3NF violation because city is determined by postcode, not by the row's
      identity. The point of all three is the same: store each fact once, so there is no way
      for two copies to disagree.
    followUps:
      - "When would you deliberately violate 3NF?"
  - question: When is denormalising the right call?
    level: advanced
    answer: >-
      When a read is hot enough that the join cost matters, and you can afford the duplicate
      to be stale or can keep it correct cheaply. Counter caches and a copy of a product's
      price on the order line are the standard examples — and the price one is not really
      denormalisation, because an order line records the price *at purchase time*, which is a
      different fact from the product's current price. That distinction matters: duplicating
      a fact is a maintenance burden, while recording a historical value is simply correct.
      The rule is to normalise first and denormalise with a measurement in hand.
    followUps:
      - "How do you keep a counter cache correct under concurrency?"
  - question: Why prefer a database constraint over a model validation?
    level: intermediate
    answer: >-
      Because a validation is advisory and a constraint is not. A validation is bypassed by
      `update_column`, by `insert_all`, by a second application, by a console session, by a
      migration, and by a concurrent request that passed its check before the other one
      committed. The constraint is enforced by the database on every write regardless of
      origin. Validations are for user-facing messages; constraints are for correctness, and
      invariants you care about should have both.
    followUps:
      - "Which invariants can a constraint not express?"
resources:
  - title: "PostgreSQL — Constraints"
    url: https://www.postgresql.org/docs/current/ddl-constraints.html
---

## The table that teaches the whole lesson

```sql
-- Everything in one table. It works, right up until it does not.
CREATE TABLE orders_bad (
  id            integer PRIMARY KEY,
  customer_name text,
  customer_email text,
  customer_city text,
  product_names text,     -- "Keyboard, Mouse, Monitor"
  total         integer
);
```

Four distinct bugs are already present, and none of them are visible yet:

```sql
-- 1. The same customer's email is stored once per order. Update one, miss
--    the others, and now the data disagrees with itself.
-- 2. "Which customers are in Pune?" requires scanning orders and
--    deduplicating, and a customer with no orders does not exist at all.
-- 3. "How many keyboards did we sell?" needs LIKE '%Keyboard%', which
--    cannot use an index and matches "Keyboard Stand".
-- 4. Deleting a customer's only order deletes the customer.
```

:::what
**Normalisation** is organising tables so that each fact is stored exactly once. The normal
forms are successive conditions: **1NF** one value per cell, **2NF** every non-key column
depends on the whole key, **3NF** no non-key column depends on another non-key column.
:::

:::why
The forms sound like bureaucracy and are really about one failure: a fact stored twice can
disagree with itself.

That is the whole argument. If a customer's email lives in one place, there is no code path
that can make two copies differ. If it lives in every order row, correctness depends on every
future writer updating all of them — including the bulk import somebody writes in two years,
and the console session someone runs during an incident.

The comma-separated list is worth dwelling on, because it looks harmless. `product_names` as
text means you cannot index the products, cannot join to the products table, cannot add a
foreign key, cannot count sales per product without parsing strings, and cannot prevent a
typo creating a product that does not exist. Every one of those is a capability the database
would have given you for free in exchange for a second table.

Normalisation is not a virtue. It is a way of making whole categories of bug unrepresentable.
:::

:::how
```text
  1NF — one value per cell

    product_names "Keyboard, Mouse"      →   order_items table
                                              (order_id, product_id, qty)

    Why: a list in a string cannot be indexed, joined, constrained
    or counted. The "fix" of LIKE '%Keyboard%' cannot use an index
    and matches "Keyboard Stand" too.

  2NF — non-key columns depend on the WHOLE key

    order_items(order_id, product_id, qty, product_name)
                 └─────── key ───────┘        └─ depends only on product_id

    Why: product_name is repeated for every order of that product, so
    renaming a product means updating every order line.
    Only ever relevant when the key is composite.

  3NF — no non-key column depends on another non-key column

    customers(id, name, postcode, city)
                        └─ city is determined by postcode, not by id

    Why: two rows can carry the same postcode with different cities,
    and nothing stops them.

  All three say: one fact, one place.
```
:::

:::example
```sql
-- The same data, normalised.
CREATE TABLE customers (
  id    bigserial PRIMARY KEY,
  name  text NOT NULL,
  email text NOT NULL UNIQUE,
  city  text NOT NULL
);

CREATE TABLE orders (
  id          bigserial PRIMARY KEY,
  customer_id bigint NOT NULL REFERENCES customers(id),
  status      text NOT NULL DEFAULT 'pending',
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE products (
  id    bigserial PRIMARY KEY,
  name  text NOT NULL,
  price integer NOT NULL CHECK (price >= 0)
);

CREATE TABLE order_items (
  order_id    bigint NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id  bigint NOT NULL REFERENCES products(id),
  quantity    integer NOT NULL CHECK (quantity > 0),
  unit_price  integer NOT NULL,     -- the price AT PURCHASE TIME
  PRIMARY KEY (order_id, product_id)
);
```

Three things in that last table are deliberate and worth naming. The composite primary key
makes "the same product twice on one order" impossible rather than merely discouraged.
`ON DELETE CASCADE` says an item cannot outlive its order, so there is no orphan state to
handle. And `unit_price` is *not* a denormalisation — the price a customer paid is a different
fact from the product's current price, and an order must not change when someone edits a price
list.
:::

:::failure
**Updating a duplicated fact in one place.**

```sql
-- orders_bad has 40,000 rows for this customer.
UPDATE orders_bad SET customer_email = 'new@x.com' WHERE id = 991;
-- One row updated. 39,999 rows still carry the old address.
-- No error. The data now contradicts itself, and which row you read
-- determines what you believe.
```

**The comma-separated column, when someone finally needs to query it.**

```sql
SELECT * FROM orders_bad WHERE product_names LIKE '%Mouse%';
-- Sequential scan, always: an index on product_names cannot serve
-- a leading-wildcard LIKE.
-- Also matches "Mouse Pad" and "Gaming Mousepad".
-- Also misses "mouse" unless you remember to lower() both sides.
```

**The lookup table nobody constrained.**

```sql
-- status is text with no CHECK and no foreign key.
SELECT DISTINCT status FROM orders;
-- 'paid', 'Paid', 'PAID', 'paid ', 'complete', 'completed', 'pending', NULL
-- Every report that filters on status is now wrong, and you cannot
-- tell which values were typos and which were a previous convention.
```

Each of those is prevented by a constraint that costs one line:

```sql
ALTER TABLE orders ADD CONSTRAINT status_valid
  CHECK (status IN ('pending', 'paid', 'shipped', 'refunded'));
```

**A nullable foreign key that should not be nullable.** `orders.customer_id` without
`NOT NULL` permits an order belonging to nobody. Every query joining orders to customers then
silently drops those rows — an inner join excludes them, so the row count in your revenue
report is quietly lower than reality.
:::

:::realworld
```sql
-- 1. Denormalise on purpose, with the reason written down.
ALTER TABLE orders ADD COLUMN items_count integer NOT NULL DEFAULT 0;
-- Reason: the order list renders a count for every row, and counting
-- order_items per order was the top query by total time.
-- Correctness: maintained by a trigger, not by application code, so
-- it cannot be bypassed by a bulk import.

CREATE FUNCTION sync_items_count() RETURNS trigger AS $$
BEGIN
  UPDATE orders SET items_count = (
    SELECT COALESCE(SUM(quantity), 0) FROM order_items
    WHERE order_id = COALESCE(NEW.order_id, OLD.order_id)
  ) WHERE id = COALESCE(NEW.order_id, OLD.order_id);
  RETURN NULL;
END $$ LANGUAGE plpgsql;

CREATE TRIGGER order_items_count
AFTER INSERT OR UPDATE OR DELETE ON order_items
FOR EACH ROW EXECUTE FUNCTION sync_items_count();
```

```sql
-- 2. Constraints that encode real invariants, which is where the
--    leverage is — each of these replaces a rule people must remember.
ALTER TABLE orders ADD CONSTRAINT shipped_has_date
  CHECK (status <> 'shipped' OR shipped_at IS NOT NULL);

-- One default address per customer, enforced rather than hoped for.
CREATE UNIQUE INDEX one_default_address
  ON addresses (customer_id) WHERE is_default;

-- No overlapping bookings for a room. A single line replacing an
-- entire class of race condition.
ALTER TABLE bookings ADD CONSTRAINT no_overlap
  EXCLUDE USING gist (room_id WITH =, during WITH &&);
```

```sql
-- 3. JSONB for genuinely variable data, not as an escape from design.
CREATE TABLE events (
  id         bigserial PRIMARY KEY,
  user_id    bigint NOT NULL REFERENCES users(id),   -- known: a column
  name       text NOT NULL,                          -- known: a column
  properties jsonb NOT NULL DEFAULT '{}'             -- unknown: jsonb
);
CREATE INDEX events_props ON events USING gin (properties);
```

The line to hold: anything you filter, join or constrain on belongs in a column. `jsonb` is
for the part of the payload whose shape you genuinely do not know, and the cost of putting a
known field in there is that it has no type, no NOT NULL, no foreign key and no default — you
have traded all of the database's help for schema flexibility you did not need.
:::

:::mistakes
**Normalising past the point of usefulness.** Splitting `city` into a `cities` table with an
id buys referential integrity for city names and costs a join on every query. Sometimes
right, often not — and 6NF-style decomposition is almost never right in an application
database.

**Denormalising before measuring.** The join you are avoiding probably costs 0.2ms. You have
taken on a permanent correctness burden to save it.

**Maintaining a counter cache in application code.** Two concurrent inserts both read the
count and both write the same incremented value, so the count drifts low — a lost update. Use
`count = count + 1` atomically, or a trigger.

**Validations without constraints.** `validates :email, uniqueness: true` is a SELECT followed
by an INSERT, with a window between them. Two simultaneous signups both pass. The unique index
is what makes it true.

**`status` as free text.** Add a `CHECK` or a foreign key to a lookup table on day one; by the
time you notice, the column contains six spellings and you cannot tell which are typos.

**Surrogate key everywhere without thinking.** A join table of `(order_id, product_id)` has a
perfectly good composite natural key. An extra `id` column adds a unique index you do not need
and — worse — removes the constraint that the pair is unique, unless you remember to add it
separately.

**Timestamps without time zones.** `timestamp` discards the offset; `timestamptz` stores an
instant. The bug appears once, in October, and is expensive.
:::

:::tradeoffs
**Normalised** — one fact in one place, so it cannot contradict itself, and constraints can
enforce your invariants. Costs joins on read.

**Denormalised** — fewer joins, and you own the synchronisation forever. The correct version
of this trade keeps the duplicate maintained by the database (a trigger or a generated column)
rather than by every caller.

**JSONB** — schema flexibility with no migration, and you give up types, NOT NULL, foreign
keys, defaults and most of the planner's statistics. Right for genuinely unknown shapes, wrong
as a way to avoid deciding.

**Natural versus surrogate keys** — a natural key is self-documenting and makes the join table
case genuinely simpler; a surrogate key is stable when the natural one turns out to be
mutable, which it usually does. Email addresses change.

**Constraints versus application validation** — a constraint cannot be bypassed and gives a
poor error message. A validation gives a good message and can be bypassed by `update_column`,
`insert_all`, a second service, a console session or a concurrent request. Important
invariants deserve both: the validation for the message, the constraint for the truth.

The working rule: normalise by default, denormalise with a measurement, and put every
invariant you can into the schema — because a constraint protects you from code that has not
been written yet.
:::

:::checkpoint
1. `orders.product_names` holds `"Keyboard, Mouse"`. Name three things you cannot do with it.
2. `customers(id, name, postcode, city)` — which normal form does this violate, and what goes
   wrong?
3. Why is `order_items.unit_price` not a denormalisation?
4. A counter cache maintained by `count += 1` in Ruby drifts low over time. Why?
5. `validates :email, uniqueness: true` is in the model and duplicates still appear. Why?
6. When is `jsonb` the right choice, and what exactly do you give up?
:::

:::interview
Define the normal forms by the bug each prevents, not by their wording:

*"1NF is one value per cell, because a comma-separated list cannot be indexed, joined or
constrained. 2NF only matters with a composite key: every non-key column must depend on the
whole key. 3NF is no non-key column depending on another — city next to postcode, where two
rows can carry the same postcode and disagree about the city. They are all the same idea: one
fact, one place, so there is no way for two copies to differ."*

Then show judgement rather than dogma, which is what the question is usually probing:

*"I normalise first and denormalise with a measurement. And I distinguish real denormalisation
from recording history — storing the unit price on an order line looks like duplication but is
not, because the price paid is a different fact from the current price. An order must not change
when someone edits the price list."*

Close on constraints, which is the strongest available signal:

*"I put invariants in the schema. A uniqueness validation in the model is a SELECT then an
INSERT with a gap in between, so two simultaneous signups both pass — the unique index is what
makes it true. Validations are for error messages; constraints are for correctness. And a
constraint also protects against the bulk import someone writes in two years, which is the
case I actually worry about."*
:::

## What you now know

- Normalisation means each fact is stored once, so copies cannot disagree.
- 1NF: one value per cell. A list in a column cannot be indexed, joined or constrained.
- 2NF: non-key columns depend on the whole key — only relevant with composite keys.
- 3NF: no non-key column determined by another non-key column.
- Recording a historical value, like the price paid, is not denormalisation.
- Denormalise with a measurement, and maintain the duplicate in the database, not in callers.
- A counter incremented in application code drifts — that is a lost update.
- A validation has a race window; a unique index does not.
- Constrain enumerated columns on day one, or they accumulate spellings.
- `jsonb` for unknown shapes only. Anything you filter or join on belongs in a column.
- Use `timestamptz`, not `timestamp`.
