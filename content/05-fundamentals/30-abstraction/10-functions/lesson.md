---
title: Functions
summary: The unit of reuse, the unit of testing, and the unit of naming. What makes one good is mostly what it refuses to do.
level: beginner
minutes: 13
status: stable
last_reviewed: "2026-10-07"
tags: [fundamentals, functions, purity]
concepts: [functions, pure-functions, side-effects]
prerequisites: [variables, conditionals]
interview:
  - question: What is a pure function and why would you prefer one?
    level: basic
    answer: >-
      A pure function returns the same output for the same input and has no observable
      side effects — it does not write to anything outside itself, perform I/O, or read
      mutable external state. The practical benefits: it is testable without any setup,
      because the input is the whole world it sees; it is safe to cache, retry and run in
      parallel; and when it is wrong you only have to read the function. The constraint is
      that a purely pure program does nothing useful, so the goal is to push I/O to the
      edges and keep the decision-making pure.
    followUps:
      - "Is a function that reads a constant still pure?"
      - "Where do the side effects go, if not in the function?"
  - question: What is the difference between a parameter and an argument?
    level: beginner
    answer: >-
      A parameter is the name in the declaration — the slot. An argument is the value
      passed at the call site. `function f(x)` declares a parameter `x`; `f(5)` passes the
      argument `5`. The distinction matters when talking about defaults and arity: the
      arity is the number of parameters, and whether an argument was passed at all is what
      a default parameter tests.
resources:
  - title: "MDN — Functions"
    url: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Functions
---

## What problem a function solves

Not "reuse". Reuse is a happy consequence.

```ruby runnable
# Inline: the reader must work out what this computes before they can judge it.
subtotal = 100 * 3
with_tax = subtotal + (subtotal * 0.18)
with_shipping = with_tax + (with_tax > 500 ? 0 : 50)
p with_shipping
```

```ruby runnable
# Named: the reader can decide whether to look inside.
def subtotal(price, qty) = price * qty
def with_tax(amount, rate: 0.18) = amount + (amount * rate)
def with_shipping(amount, free_over: 500) = amount + (amount > free_over ? 0 : 50)

p with_shipping(with_tax(subtotal(100, 3)))
```

Three Ruby things are already visible. The endless method definition `def name(args) = expr`,
added in Ruby 3.0, is for exactly this case: a method whose whole body is one expression. It is
not a lambda — it is a real method, with a name that appears in backtraces.

The optional parameters are *keyword* arguments, not positional ones with defaults. That is
Ruby's native answer to a problem the JavaScript version of this lesson had to solve by passing
an options object, and it is covered properly below.

And there is no `return`. A Ruby method returns its last expression, so an explicit `return` is
reserved for leaving early. Writing `return` on the final line is harmless and reads, to a Ruby
reader, as a small signal that the author is translating from somewhere else.

:::problem
A program of any size is too large to hold in your head at once. The only defence is to be
able to **stop reading** — to see a name, trust it, and move on.

That requires the named thing to have a boundary you can trust: a clear input, a clear
output, and no surprises in between. A function is that boundary. "Avoiding duplication" is
a side benefit; the primary job is letting a reader skip something.
:::

:::what
A **function** is a named, parameterised block with an input and an output. A **pure**
function depends only on its arguments and affects nothing outside itself.
:::

:::why
The boundary is only trustworthy if the function keeps its promises. Two promises make the
difference:

1. **Same input, same output.** If a function can return different things for the same
   arguments, you cannot reason about a call site without knowing the rest of the program.
2. **No surprises.** If it also writes a file, mutates its argument or increments a
   counter, the name was a lie and you have to read it anyway.

A function that keeps both is **pure**, and purity is what makes the "stop reading"
property real.
:::

## Pure, and not

```ruby runnable
# Pure: input in, value out, nothing touched.
def tax_on(amount, rate) = amount * rate
p [tax_on(100, 0.18), tax_on(100, 0.18)]    # identical, always

# Impure: reads mutable external state. Same arguments, different answers.
$current_rate = 0.18
def tax_on_impure(amount) = amount * $current_rate
p tax_on_impure(100)
$current_rate = 0.28
p tax_on_impure(100)    # changed, and the call site looks the same

# Impure: mutates its argument. The caller's data is now different.
def add_tax_bad(order)
  order[:total] *= 1.18
  order
end
my_order = { total: 100 }
add_tax_bad(my_order)
p my_order              # the caller's hash was modified

# Pure version: returns a new value.
def add_tax_good(order) = order.merge(total: order[:total] * 1.18)
o = { total: 100 }
p add_tax_good(o)
p o                     # original intact
```

A global like `$current_rate` is deliberately ugly, and in Ruby it is rare. The realistic
versions of the same impurity are much easier to write by accident: a class variable
(`@@rate`), a constant that was never frozen, a `Thread.current[:tenant]`, a `Rails.cache`
read, or `Time.now`. All of them make the function's answer depend on something the call site
cannot see.

The in-place version is worth one more look, because Ruby has a naming convention that would
have warned the caller and this code did not use it. A method that mutates its argument and
returns it should be `add_tax!`, and better still should not take someone else's hash at all.

:::how
Purity buys you specific, mechanical properties:

```text
  PURE                                      IMPURE
  ────                                      ──────
  Test with no setup.                       Needs a database, a clock, a mock.
  f(x) === f(x), so cacheable.              Caching changes behaviour.
  Safe to retry on failure.                 Retrying may double-charge someone.
  Safe to run in parallel.                  Shared state means races.
  To debug: read the function.              To debug: read the program.
```

The caching one is worth seeing, because it only works for pure functions:

```ruby runnable
def memoize(&fn)
  cache = {}
  # `args` is an Array, and Ruby Arrays hash by value — so the argument list
  # IS the cache key. No JSON.stringify, no string building.
  ->(*args) { cache.fetch(args) { cache[args] = fn.call(*args) } }
end

calls = 0
fast = memoize { |n| calls += 1; n * n }

p [fast.call(9), fast.call(9), fast.call(9)]
p calls                 # 1 — the underlying block ran once
```

`cache.fetch(args) { ... }` rather than `cache[args] ||= ...` is the important detail, and it is
the same trap as in the memoisation lesson: `||=` treats a cached `false` or `nil` as a miss, so
a memoised predicate would recompute every negative answer forever. `fetch` with a block only
runs the block when the key is genuinely absent.

```ruby runnable
# The difference, demonstrated.
calls = 0
with_fetch = (cache = {}; ->(n) { cache.fetch(n) { cache[n] = (calls += 1; false) } })
with_fetch.call(1); with_fetch.call(1); with_fetch.call(1)
p calls      # 1 — cached correctly

calls = 0
with_or_eq = (cache = {}; ->(n) { cache[n] ||= (calls += 1; false) })
with_or_eq.call(1); with_or_eq.call(1); with_or_eq.call(1)
p calls      # 3 — the false is never treated as cached
```

Memoising `taxOnImpure` would be a bug: it would return the old rate forever. The cache is
only correct because the function promised the same output for the same input.
:::

## Pushing effects to the edge

A program with no side effects does nothing. The goal is not to eliminate them but to
**separate deciding from doing**.

```ruby runnable
# Everything tangled: decisions and effects in one method.
def process_order_tangled(id)
  order = { id: id, total: 100, country: 'IN' }   # pretend: Order.find(id)
  rate = order[:country] == 'IN' ? 0.18 : 0.0
  order[:total] += order[:total] * rate
  # order.save!; OrderMailer.confirmation(order).deliver_later
  puts "tangled → saved and emailed #{order[:total]}"
end

# Separated: a pure core that decides, a thin shell that acts.
def rate_for(country) = country == 'IN' ? 0.18 : 0
def price_order(order) = order.merge(total: order[:total] * (1 + rate_for(order[:country])))

def process_order_clean(order, save:, notify:)
  priced = price_order(order)    # pure: all the thinking
  save.call(priced)              # effects: injected, so testable
  notify.call(priced)
  priced
end

saved = []
process_order_clean(
  { id: 1, total: 100, country: 'IN' },
  save: ->(o) { saved << o },
  notify: ->(_o) {},
)
p saved.first[:total]            # priced, with no database in sight

# And the pure core needs no setup at all to test:
p [rate_for('IN'), rate_for('US')]
p price_order({ total: 100, country: 'IN' })
```

The shape here — a pure core, a thin imperative shell — is the single most useful structural idea
in this lesson, and it is what a Rails service object is for. `rate_for` and `price_order` need
no database, no fixtures, no `ActiveRecord`, and no `travel_to`; they are tested by calling them.
Everything that needs setup has been pushed into `save` and `notify`, which the test replaces
with lambdas that record what happened.

Worth naming the Rails-specific version, because the injected-lambda form above is a teaching
device rather than what you would ship. In practice the shell is a method on a service object and
the "effects" are collaborators passed to its constructor — same separation, more conventional
packaging. What matters is that the pricing logic is a method you can call with a Hash.

:::realworld
This shape has names in several communities and they all describe the same move:

- **Functional core, imperative shell** — the pure logic in the middle, I/O at the rim.
- **Hexagonal / ports and adapters** — the domain knows nothing about the database.
- **Dependency injection** — pass the effectful collaborators in, as `save` and `notify`
  above, so a test can pass fakes.

The practical test for whether you have done it: *can you test the interesting logic
without a database, a network, or a clock?* If pricing needs a running Postgres, the
pricing rules are tangled with storage.
:::

:::mistakes
**Doing two things, signalled by "and" in the name.** `validateAndSave`, `getUserAndLog`,
`parseAndStore`. Each is two functions wearing one name, and the caller can never want
exactly half of it.

**A default parameter evaluated once.** This is a famous trap in Python and it catches
people in JavaScript for the opposite reason:

```ruby runnable
# Ruby re-evaluates a default on every call, so each gets a fresh array.
def add(item, list = [])
  list << item
end

p add('a')      # ["a"]
p add('b')      # ["b"] — independent, not ["a", "b"]

# And because the default is an expression, it can refer to earlier parameters:
def page(number, per_page = 20, offset = (number - 1) * per_page)
  { number: number, per_page: per_page, offset: offset }
end
p page(3)
p page(3, 50)
```

This is the opposite of Python, where a mutable default is created once at definition time and
shared across every call — the single most famous gotcha in that language. Ruby evaluates the
default expression on each call, in the scope of the method, which is why it can reference
parameters declared to its left.

```python
# Python: the default is evaluated ONCE, at definition time. Shared forever.
def add_py(item, lst=[]):
    lst.append(item)
    return lst

add_py("a")   # ['a']
add_py("b")   # ['a', 'b']  ← the same list
# The fix:  def add_py(item, lst=None):  lst = [] if lst is None else lst
```

Same-looking syntax, opposite semantics. Worth knowing which language you are in.

**Too many parameters.** Past three, callers start passing them in the wrong order and the
compiler cannot help if the types match.

```ruby runnable
# Positional: what is `true, false, true`? The caller cannot tell, and in six
# months neither can you.
def create_user_bad(name, email, admin, send_email, verified) = nil
# create_user_bad('Asha', 'a@b.c', true, false, true)

# Keyword arguments: self-documenting, order-independent, extensible.
def create_user(name:, email:, admin: false, send_email: true, verified: false)
  { name: name, email: email, admin: admin, send_email: send_email, verified: verified }
end

p create_user(name: 'Asha', email: 'a@b.c', admin: true)
p create_user(email: 'b@c.d', name: 'Bo')      # order does not matter
```

Keyword arguments are a language feature in Ruby rather than a convention, and that buys you
three things an options Hash does not:

```ruby runnable
def create_user(name:, email:, admin: false)
  { name: name, email: email, admin: admin }
end

# 1. A missing required argument fails immediately, by name.
begin
  create_user(name: 'Asha')
rescue ArgumentError => e
  puts "#{e.class}: #{e.message}"       # missing keyword: :email
end

# 2. A typo fails immediately, by name.
begin
  create_user(name: 'Asha', email: 'a@b.c', admn: true)
rescue ArgumentError => e
  puts "#{e.class}: #{e.message}"       # unknown keyword: :admn
end

# 3. A Hash you already have can be splatted in with **.
attrs = { name: 'Cal', email: 'c@d.e' }
p create_user(**attrs)
```

That second one is the reason to prefer keywords over an options Hash even in Ruby: with
`options = {}` and `options[:admin]`, a misspelled key is silently `nil` and you get the default
behaviour with no complaint. With keyword arguments it is an `ArgumentError` naming the key.

A rule that holds up well: **more than two positional parameters, or any boolean parameter, means
use keywords.** A boolean positional argument is unreadable at the call site by construction —
`create_user('Asha', 'a@b.c', true)` cannot be understood without opening the definition.

**Boolean parameters that select behaviour.** `render(data, true)` — true what? If a flag
chooses between two behaviours, that is usually two functions.
:::

:::tradeoffs
**Small pure functions.** Easy to test, name, reuse and reason about. Cost: more names to
invent, more indirection to follow, and a reader jumping between six three-line functions
may understand less than one twenty-line function would have told them.

**Larger functions with effects inline.** The whole story is in one place. Cost: untestable
without setup, unsafe to retry, and you must read all of it to trust any of it.

The failure mode at each extreme is real. Over-decomposition produces codebases where
every function is trivially correct and nobody can find where the work happens. The useful
heuristic is not line count but **whether the name is honest**: if you cannot name it
without "and", it is doing too much; if the name just restates the single line inside,
it is doing too little.
:::

:::debugging
When a function misbehaves, purity tells you where to look:

1. **Is it pure?** Then the bug is inside it, and the arguments reproduce it exactly.
   Write the failing call as a test and you are done hunting.
2. **Is it impure?** Then list what it reads and writes beyond its arguments — globals, a
   clock, a database, its own arguments. Each is a candidate.

```ruby runnable
# Impure: reads the clock, so its answer depends on when you ask.
def expired_hard?(token) = token[:expires_at] < Time.now

# Pure, by injecting the clock as a keyword argument with a sensible default.
def expired?(token, now: Time.now) = token[:expires_at] < now

token = { expires_at: Time.at(1000) }
p expired?(token, now: Time.at(999))     # false — deterministic
p expired?(token, now: Time.at(1001))    # true

# Production calls read naturally and get the real clock:
p expired?({ expires_at: Time.now - 60 })
```

The default argument is doing the real work: production callers write `expired?(token)` and never
think about it, while a test passes an exact instant and gets a deterministic answer with no
stubbing, no `travel_to`, and no dependency on how fast the test suite runs.

The same move applies to every ambient input — the clock, randomness, the current user, a request
id, `SecureRandom`, the environment. Each one is a parameter with a default, and the result is a
method that can be reasoned about by reading its signature.

A default argument for the clock is the cheapest testability change available: callers are
unaffected, tests get determinism.
:::

:::checkpoint
Classify each as pure or impure, and for the impure ones say what single change would make
it pure:

```ruby
# Which of these are pure? For each impure one, name what makes it so.

def a(x, y) = x + y
def b(list) = list.sort!
def c = Time.now
def d(user) = "Hello, #{user[:name]}"
def e(n) = (puts n; n * 2)
def f(arr) = arr.sort
def g(n) = ($total += n)
def h(record) = record.update!(seen: true)
def i(n) = n.times.map { rand }
def j(hash) = hash.merge(seen: true)
```

Then: one of these is pure but still a poor function to depend on in a test. Which, and
why?
:::

:::interview
"What is a pure function" is a vocabulary check. The question underneath is whether you
know what it is *for*.

So answer with the consequences: *"same input, same output, no side effects — which means
I can test it with no setup, cache it, retry it safely, and when it is wrong I only have
to read the function."* Then the part that shows judgement: *"a fully pure program does
nothing, so the goal is separating deciding from doing. The pricing rules are pure; the
save and the email are injected. The test for whether I have managed it is whether I can
test the interesting logic without a database or a clock."*

If asked about function size, resist a number. *"I do not have a line limit — I have a
naming test. If the honest name needs 'and', it is two functions. If the name just
restates the one line inside, it should not be a function."*
:::

## What you now know

- A function's primary job is letting a reader stop reading — reuse is a side benefit.
- That only works if the name is honest, which is what purity enforces.
- Pure means same input/same output and no side effects; it buys testability, caching,
  safe retries and parallelism.
- Separate deciding from doing: pure core, effects injected at the edges.
- `and` in a function name means two functions.
- Default parameters are re-evaluated per call in JavaScript and once at definition in
  Python.
- Past three parameters, use a named object; boolean flags that select behaviour are
  usually two functions.
