---
title: Equality and hashing
summary: Four different questions Ruby can ask about sameness, and the one-line bug that makes two equal objects both appear in a Set.
level: intermediate
minutes: 16
version: "3.4"
status: stable
last_reviewed: "2026-10-07"
tags: [ruby, equality, hash, comparable, value-objects]
concepts: [equality, hashing, value-objects, comparable]
prerequisites: [objects, method-lookup]
interview:
  - question: What is the difference between ==, eql? and equal? in Ruby?
    level: intermediate
    answer: >-
      `equal?` is identity — same object, same `object_id` — and you should never override
      it. `==` is value equality, and it is what you define for your own types; by default
      it falls back to identity. `eql?` is value equality with no type conversion, and it is
      what `Hash` uses together with `hash` to decide whether two keys are the same. The
      practical difference between `==` and `eql?` shows up with numbers: `1 == 1.0` is true
      but `1.eql?(1.0)` is false, which is exactly why `{1 => :a}[1.0]` is nil.
    followUps:
      - "So which do you need to override for a hash key to work?"
  - question: Why must you override hash whenever you override eql?
    level: intermediate
    answer: >-
      Because `Hash` and `Set` find a candidate by hash code first and only then compare with
      `eql?`. If two objects are `eql?` but have different hash codes they land in different
      buckets, so the comparison never happens and both appear in a Set — and a lookup with
      an equal-but-not-identical key returns nil. The contract is one-directional: equal
      objects must have equal hashes; unequal objects may collide, which is merely slower.
      The idiomatic implementation is to hash the same array of attributes that `eql?`
      compares.
    followUps:
      - "What happens if you mutate an object after using it as a hash key?"
  - question: What does Comparable give you, and what do you have to provide?
    level: basic
    answer: >-
      You define `<=>`, returning -1, 0 or 1 — or nil if the two are not comparable — and
      including `Comparable` gives you `<`, `<=`, `>`, `>=`, `==`, `between?` and `clamp`,
      plus `sort` and `min`/`max` work on your objects. It is the clearest example of
      Ruby's pattern of trading one method for a whole interface, the same deal `Enumerable`
      offers for `each`. Note that `Comparable` defines `==` in terms of `<=>`, so if you
      want value equality for hashing you still need `eql?` and `hash`.
    followUps:
      - "When should <=> return nil?"
resources:
  - title: "Ruby docs — Object#eql?"
    url: https://docs.ruby-lang.org/en/master/Object.html#method-i-eql-3F
---

## Four questions, four methods

```ruby
a = "hello"
b = "hello"

a.equal?(b)   # false — different objects
a == b        # true  — same value
a.eql?(b)     # true  — same value, same type
a.hash == b.hash  # true — so they work as the same Hash key

1 == 1.0      # true
1.eql?(1.0)   # false — Integer is not Float
{ 1 => :a }[1.0]  # nil, and this is why
```

:::what
- **`equal?`** — identity. Are these the same object? Never override it.
- **`==`** — value equality, with conversions allowed. Define this for your types.
- **`eql?`** — value equality, no conversions. Used by `Hash` and `Set`.
- **`hash`** — an Integer. Objects that are `eql?` *must* return the same `hash`.
- **`===`** — "matches", used by `case/when`. Means something different per class.
:::

:::why
It looks like three methods for one job, and the separation is doing real work.

`equal?` must exist and must be unoverridable-in-practice because some code genuinely needs
to ask "is this the very same object" — `object_id` comparisons, cycle detection, identity
caches. If `==` were the only question available, that information would be unobtainable.

The split between `==` and `eql?` is about hashing. `1 == 1.0` is convenient: arithmetic
comparisons should not care about storage. But a `Hash` cannot behave that way, because
`1` and `1.0` must hash to the same bucket for it to work, and `1.0` and `1.00000000001`
would then also have to — so Ruby gives `Hash` a stricter equality that ignores conversion.
That is why `{1 => :a}[1.0]` is nil, which surprises people until they see what the
alternative would cost.

`===` is separate again because `case/when` is asking "does this pattern match this value",
which is simply not the same question as equality: `Integer === 5`, `(1..10) === 5` and
`/ell/ === "hello"` are all true, and none of them are equality claims.
:::

:::how
```text
  HOW Hash FINDS A KEY

  h = { point_a => "x" }
  h[point_b]

  1. Compute point_b.hash                    → 8347251
  2. Map it to a bucket                      → bucket 11
  3. Look in bucket 11 only
  4. For each key there: key.eql?(point_b)?
  5. First match wins. No match → nil.

  Step 3 is the whole reason the contract exists. If point_a and
  point_b are eql? but hash differently, they are in DIFFERENT
  buckets, so step 4 never compares them.

      point_a.hash → bucket 11   ["x" is here]
      point_b.hash → bucket 4    [looked here, found nothing]
      → nil, even though the keys are equal.

  THE CONTRACT, one direction only

    a.eql?(b)  ⟹  a.hash == b.hash      required
    a.hash == b.hash  ⟹  a.eql?(b)      NOT required

  Collisions are legal and merely cost a comparison. A missing hash
  override is a correctness bug.
```
:::

:::example
```ruby
# A value object, done properly.
class Money
  attr_reader :cents, :currency

  def initialize(cents, currency)
    @cents = cents
    @currency = currency
    freeze                       # value objects should not change
  end

  # Value equality, tolerant of anything that quacks right.
  def ==(other)
    other.is_a?(Money) && cents == other.cents && currency == other.currency
  end

  # Hash equality. Same comparison, and alias is the common idiom.
  alias eql? ==

  # Hash the same attributes eql? compares. Array#hash combines them well.
  def hash
    [cents, currency].hash
  end
end

a = Money.new(500, "INR")
b = Money.new(500, "INR")

a == b                    # true
a.eql?(b)                 # true
{ a => :paid }[b]         # :paid
Set.new([a, b]).size      # 1
[a, b].uniq.size          # 1
```
:::

:::failure
**Overriding `==` and forgetting `hash`.** The single most common version of this bug:

```ruby
class Money
  attr_reader :cents
  def initialize(cents) = @cents = cents
  def ==(other) = other.is_a?(Money) && cents == other.cents
end

a, b = Money.new(500), Money.new(500)

a == b                 # true
[a, b].uniq.size       # 2   ← uniq uses hash and eql?
Set.new([a, b]).size   # 2
{ a => :x }[b]         # nil
[a, b].group_by(&:itself).size  # 2
```

`==` works, so the object looks correct in tests. Everything built on hashing is silently
wrong, and it fails in whichever one of those four places your code happens to use.

**Mutating an object after using it as a hash key.**

```ruby
key = ["a"]
h = { key => 1 }
key << "b"            # the hash code has changed
h[key]                # nil — looked in the new bucket
h[["a", "b"]]         # nil — the entry is in the OLD bucket
h.keys.first          # ["a", "b"] — it is right there, unreachable
h.rehash              # rebuilds the buckets
h[key]                # 1
```

The entry is visibly present and unreachable by lookup. This is why value objects should be
frozen, and why `Hash` dups and freezes String keys for you — strings being the one type
mutable enough and common enough as keys to warrant a special case.

**Returning a non-Integer from `hash`.**

```ruby
def hash = [cents, currency]   # returns an Array
# TypeError: can't convert Array to Integer, at insertion time.
# Call .hash on the array: [cents, currency].hash
```

**Defining `==` so it is not symmetric.**

```ruby
class Money
  def ==(other) = cents == other.cents   # no type check
end
money == 500            # NoMethodError, or worse, accidentally true
# Always guard the type. `other.is_a?(Money) && ...`
```

Asymmetric equality breaks `Array#include?`, `uniq` and `delete` in ways that depend on
argument order, which makes the resulting bug reports irreproducible.
:::

:::internals
```text
  WHY Array#hash IS THE IDIOM

  [cents, currency].hash does three things you would otherwise do
  by hand:

    - combines the component hashes so that order matters
      ([1, 2].hash != [2, 1].hash)
    - mixes the bits, so small differences in input produce large
      differences in output and keys spread across buckets
    - is seeded per process (SipHash), which is a security property:
      without it an attacker who knows your hash function can send
      thousands of colliding keys and turn an O(1) lookup into
      O(n) — a hash-flooding denial of service.

  Hand-rolled alternatives tend to fail at the mixing step:

    def hash = cents + currency.hash     # addition loses order
    def hash = cents                     # ignores currency entirely
    def hash = 1                         # legal, correct, and turns
                                         # every Hash into a linked list


  OBJECT IDENTITY

  object_id is not a memory address in modern Ruby. Since 2.7 it is a
  lazily-assigned sequential number, precisely so that it does not
  leak heap layout and does not change when the GC compacts. Do not
  store it, and do not use it as a key — use the object itself.
```
:::

:::realworld
```ruby
# 1. Data.define — Ruby 3.2+. Gives you ==, eql?, hash, to_h,
#    deconstruct_keys and immutability for free. Use it.
Money = Data.define(:cents, :currency)

a = Money.new(cents: 500, currency: "INR")
b = Money.new(cents: 500, currency: "INR")
a == b                       # true
Set.new([a, b]).size         # 1
a.frozen?                    # true
a.with(cents: 600)           # a new Money; no mutation

# Struct is the older form: equality for free, but mutable.
Point = Struct.new(:x, :y)
Point.new(1, 2) == Point.new(1, 2)   # true
Point.new(1, 2).frozen?              # false — can be mutated in place

# 2. Comparable: define <=>, get seven methods and sortability.
class Version
  include Comparable
  attr_reader :parts

  def initialize(str) = @parts = str.split(".").map(&:to_i)

  def <=>(other)
    return nil unless other.is_a?(Version)
    parts <=> other.parts      # Array#<=> compares element by element
  end

  def to_s = parts.join(".")
end

Version.new("1.10.0") > Version.new("1.9.3")        # true — not string order
[Version.new("2.0"), Version.new("1.5")].sort.map(&:to_s)  # ["1.5", "2.0"]
Version.new("1.5").clamp(Version.new("1.0"), Version.new("1.2")).to_s  # "1.2"

# Returning nil from <=> is how you say "not comparable", and it is
# what makes `Version.new("1.0") > 5` raise ArgumentError rather than
# producing nonsense.
```

```ruby
# 3. The Rails case, which trips people who assume value semantics.
#    ActiveRecord::Base#== compares class and id, NOT attributes.
u1 = User.find(1)
u2 = User.find(1)
u1 == u2            # true  — same class, same id
u1.equal?(u2)       # false — two different objects, two separate queries

unsaved_a = User.new(name: "x")
unsaved_b = User.new(name: "x")
unsaved_a == unsaved_b   # false — both ids are nil, so it falls back to identity
# Two unsaved records are never equal, which is correct and surprising.
```
:::

:::mistakes
**Using `==` where you meant `equal?`.** Checking whether you were handed the same object
needs `equal?`; `==` can be overridden to say anything.

**Overriding `equal?`.** It is identity. Code that needs identity has nowhere else to go.

**Forgetting `hash`** after defining `eql?` or `==`. Define all three together or use
`Data.define`.

**Using a mutable object as a hash key** and then mutating it. Freeze your keys.

**`===` confusion.** `case x when Integer` works because `Integer === x` asks "is x an
Integer". Defining `===` on your own class is occasionally useful for custom `case`
behaviour, and it is not equality — don't alias it to `==` reflexively.

**Comparing floats with `==`.** `0.1 + 0.2 == 0.3` is false. Use a tolerance, or `BigDecimal`
/ integer cents for money. This is not a Ruby quirk; it is IEEE 754.

**Expecting two unsaved ActiveRecord objects with identical attributes to be equal.** They are
not — AR equality is class plus id, and nil ids fall back to identity.
:::

:::tradeoffs
**`Data.define`** — equality, hashing, immutability and keyword construction for nothing.
Costs you mutability, which for a value object is a feature. Default choice on Ruby 3.2+.

**`Struct`** — equality for free and mutable, with positional access and `to_a`. The mutability
means it can be a broken hash key, so freeze instances you intend to use as keys.

**Hand-written `==`/`eql?`/`hash`** — full control over which attributes count, which matters
when identity is a subset of state (a `User` equal by id, ignoring `updated_at`). Costs three
methods you must keep in sync as attributes change, and nothing enforces that.

**Identity equality (the default)** — correct for entities whose sameness is about identity
rather than contents. Two `Order` objects with identical attributes are usually *not* the same
order, and Rails is right to compare ids.

The judgement: **value objects** (money, coordinates, versions, date ranges) want value
equality, immutability and a `hash`. **Entities** (users, orders) want identity or id
equality. Deciding which one you are holding is the actual design question; the methods follow
from it.
:::

:::checkpoint
1. Why is `{1 => :a}[1.0]` nil when `1 == 1.0` is true?
2. You override `==` but not `hash`. Name four things that silently break.
3. `key = ["a"]; h = {key => 1}; key << "b"`. What does `h[key]` return, and why is the entry
   still visible in `h.keys`?
4. What is the hash contract, and which direction is *not* required?
5. What does `include Comparable` give you, and what must you supply?
6. Why should `<=>` return nil rather than raising for an incomparable argument?
:::

:::interview
Name the three methods and then immediately give the number example, because it proves you
understand the reason for the split rather than the taxonomy:

*"`equal?` is identity, `==` is value equality with conversions, `eql?` is value equality
without them. The difference between the last two is visible in `1 == 1.0` being true while
`1.eql?(1.0)` is false — and that is deliberate, because `Hash` needs an equality that does
not convert. Which is why `{1 => :a}[1.0]` is nil."*

Then the hash contract, with the mechanism:

*"If I override `eql?` I must override `hash`, because `Hash` locates a bucket from the hash
code and only compares keys within that bucket. Two objects that are equal with different hash
codes land in different buckets, so they are never compared — both end up in a `Set`, `uniq`
keeps both, and a lookup with an equal key returns nil. The contract is one-directional: equal
objects must hash equally, but collisions are fine and merely cost a comparison."*

Then show you would not write it by hand: *"in practice I reach for `Data.define` on 3.2+,
which gives equality, hashing and immutability together — and immutability matters here,
because mutating an object after using it as a key leaves the entry in the hash and
unreachable."*
:::

## What you now know

- `equal?` is identity, `==` is value equality, `eql?` is value equality without conversion.
- `===` is "matches" for `case/when`, not equality.
- `Hash` finds a bucket by `hash`, then compares with `eql?` within it.
- Equal objects must have equal hashes. Collisions are legal and only cost a comparison.
- Overriding `==` without `hash` breaks `uniq`, `Set`, `group_by` and hash lookup — silently.
- `[a, b].hash` is the idiom: it mixes bits, respects order and is process-seeded against
  hash flooding.
- Mutating a hash key leaves the entry unreachable until `rehash`.
- Freeze value objects; `Data.define` does this and gives you all three methods.
- `Comparable` turns one `<=>` into seven methods plus sorting. Return nil for incomparable.
- ActiveRecord equality is class plus id, so two unsaved records are never equal.
