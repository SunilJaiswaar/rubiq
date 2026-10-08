---
title: Enumerable — one method, fifty for free
summary: How defining `each` gives you `map`, `select`, `group_by` and the rest, and why laziness matters when collections get big.
level: intermediate
minutes: 16
version: "3.3"
status: stable
last_reviewed: "2026-09-20"
tags: [ruby, enumerable, iterators, lazy, collections]
concepts: [enumerable, enumerator, lazy-evaluation, duck-typing]
prerequisites: [blocks, yield]
interview:
  - question: What do you have to implement to get all of Enumerable's methods?
    level: intermediate
    answer: >-
      One method: `each`, which yields each element. Then `include Enumerable`. Every other
      method — `map`, `select`, `reduce`, `sort_by`, `group_by`, `min_by`, `each_slice`,
      around fifty of them — is implemented in terms of `each`. Optionally define `<=>` on
      the elements to make `sort`, `min` and `max` work, since those need an ordering.
    followUps:
      - "What does `Comparable` give you for the same price?"
      - "Why is `Array#map` not simply Enumerable's `map`?"
  - question: What is the difference between `map` and `each`?
    level: basic
    answer: >-
      `each` runs the block for its side effects and returns the original collection.
      `map` collects the block's return value for every element and returns a new array of
      the same length. If you are using `each` and pushing onto an array you declared
      above, you want `map`. If you are using `map` and ignoring the result, you want
      `each`.
  - question: When would you use `lazy`?
    level: advanced
    hint: Think about what `(1..Float::INFINITY).map { ... }` does.
    answer: >-
      When the source is huge or infinite, or when the pipeline would otherwise build large
      intermediate arrays you immediately throw away. `lazy` turns the chain into a pull
      pipeline: each element travels through all the stages before the next one is fetched,
      so nothing intermediate is materialised and only as many elements as the terminal
      operation needs are ever produced. The costs are per-element overhead — slower than
      eager for small collections — and that side effects now happen in a different,
      interleaved order.
    followUps:
      - "What terminates a lazy chain?"
      - "When is lazy slower than eager?"
resources:
  - title: "Ruby documentation — Enumerable"
    url: https://docs.ruby-lang.org/en/master/Enumerable.html
  - title: "Ruby documentation — Enumerator::Lazy"
    url: https://docs.ruby-lang.org/en/master/Enumerator/Lazy.html
---

## The duplication problem

Imagine you are designing a standard library. You have arrays, hashes, sets, ranges, file
handles that yield lines, and a database cursor that yields rows. Users want to transform,
filter, count, group and sort all of them.

:::problem
Six collection types × fifty useful operations = three hundred method implementations,
most of them identical apart from how they walk their elements. Every new collection type
starts from zero. Every bug fix has to be applied six times.
:::

:::history
Java's answer was interfaces: `Collection` declared the operations and each class
implemented them, which still meant writing them repeatedly — until Java 8 added default
methods and streams, two decades later. C++ went the other way with iterators and free
functions in `<algorithm>`: `std::transform` works on anything exposing a begin/end pair.
Ruby's answer predates both and is simpler to state.
:::

:::what
`Enumerable` is a module containing around fifty methods, every one of which is written in
terms of a single method called `each`. Include it, define `each`, and you get the rest.
:::

```ruby runnable
class Playlist
  include Enumerable          # <- the fifty methods arrive here

  def initialize(*tracks)
    @tracks = tracks
  end

  # The only method I have to write.
  def each
    return to_enum(:each) unless block_given?
    @tracks.each { |t| yield t }
    self
  end
end

list = Playlist.new(
  { title: "Kolkata",  mins: 4, genre: :jazz },
  { title: "Monsoon",  mins: 7, genre: :ambient },
  { title: "Rooftop",  mins: 3, genre: :jazz },
  { title: "Nightbus", mins: 9, genre: :ambient },
)

p list.map { |t| t[:title] }
p list.select { |t| t[:mins] > 5 }.map { |t| t[:title] }
p list.sum { |t| t[:mins] }
p list.group_by { |t| t[:genre] }.transform_values { |ts| ts.map { |t| t[:title] } }
p list.min_by { |t| t[:mins] }[:title]
p list.sort_by { |t| -t[:mins] }.first[:title]
p list.each_slice(2).to_a.length
p list.partition { |t| t[:genre] == :jazz }.map(&:length)
```

Every one of those came from the one `each` above.

:::how
`Enumerable#map` is, in essence, this:

```ruby runnable
module MyEnumerable
  def my_map
    result = []
    each { |element| result << yield(element) }   # calls YOUR each
    result
  end

  def my_select
    result = []
    each { |element| result << element if yield(element) }
    result
  end

  def my_reduce(initial)
    accumulator = initial
    each { |element| accumulator = yield(accumulator, element) }
    accumulator
  end
end

class Countdown
  include MyEnumerable

  def each
    3.downto(1) { |n| yield n }
  end
end

p Countdown.new.my_map { |n| n * 10 }
p Countdown.new.my_select(&:odd?)
p Countdown.new.my_reduce(0) { |sum, n| sum + n }
```

There is no magic. `Enumerable` methods call `each`, which is *your* method, and `yield`
back into *your* caller's block. This is duck typing doing real work: `Enumerable` has
never heard of your class and does not need to.
:::

:::why
One method to implement, fifty to use. And the cost is paid once, by the standard library,
not by every collection author. The deeper win is that `Enumerable` turns "is iterable"
into a contract any object can satisfy — including objects whose elements do not exist yet,
like a file being read or an API being paged.
:::

## `return to_enum(:each) unless block_given?`

That line in the example is not decoration. It is what makes an enumerable composable.

```ruby runnable
# Self-contained, so this fence runs on its own: the same Playlist as above,
# trimmed to what this example needs.
class Playlist
  include Enumerable

  def initialize(*tracks)
    @tracks = tracks
  end

  def each
    return to_enum(:each) unless block_given?
    @tracks.each { |t| yield t }
    self
  end
end

list = Playlist.new({ title: "A" }, { title: "B" }, { title: "C" })

# With a block: iterate.
list.each { |t| print t[:title] }
puts

# Without a block: hand back an Enumerator you can do other things with.
e = list.each
puts e.class              # Enumerator
p e.next                  # external iteration — pull one at a time
p e.next
p list.each_with_index.map { |t, i| "#{i}:#{t[:title]}" }
```

`each_with_index` only works because `each` without a block returns an `Enumerator`. If
you skip that line, `list.each_with_index` raises — and so does `each_slice`, `each_cons`,
`with_index`, `zip` and `lazy`. One line, a lot of capability.

:::jargon Enumerator
An **Enumerator** is an object that knows how to iterate something but has not done it
yet. It holds the receiver and the method to call. Two things follow:

- **External iteration.** `e.next` pulls one element at a time, which inverts control —
  you drive the loop instead of the collection driving it.
- **Composition.** Because the Enumerator is an object, it is itself `Enumerable`, so
  you can chain.
:::

## Laziness: when the collection is too big to materialise

Every example so far builds a new array at each step. For four tracks that is irrelevant.
For four million rows it is the whole problem.

```ruby runnable
# Eager: each stage builds a full intermediate array.
result = (1..20)
  .map { |n| n * 3 }          # builds a 20-element array
  .select { |n| n.even? }     # builds another array
  .first(3)                   # throws nearly all of it away
p result
```

Now the version that cannot work eagerly at all:

```ruby runnable
# An infinite source. Eager `map` here would never return.
result = (1..Float::INFINITY)
  .lazy
  .map { |n| n * 3 }
  .select { |n| n % 7 == 0 }
  .first(4)
p result
```

:::how
The difference is push versus pull.

```text
EAGER — each stage completes before the next begins
  source ──▶ [all 20] ──▶ map ──▶ [all 20] ──▶ select ──▶ [10] ──▶ first(3) ──▶ [3]
                               ▲ 17 results computed and discarded

LAZY — one element travels the whole pipeline, then the next
  source ──▶ 1 ──▶ map ──▶ 3  ──▶ select ──▶ ✗ drop
  source ──▶ 2 ──▶ map ──▶ 6  ──▶ select ──▶ ✗ drop
  source ──▶ 3 ──▶ map ──▶ 9  ──▶ select ──▶ ✗ drop
  ...
  source ──▶ 7 ──▶ map ──▶ 21 ──▶ select ──▶ ✓ keep (1 of 4)
  ...
  stops the instant first(4) is satisfied — nothing further is ever computed
```

A lazy chain computes nothing until a **terminal operation** asks for values. `first(n)`,
`to_a`, `force`, `each`, `reduce`, `include?` and `take_while` are terminal. `map`,
`select`, `reject`, `take`, `drop`, `flat_map`, `filter_map`, `with_index` and `uniq
` are lazy.
:::

You can watch the difference directly:

```ruby runnable
def counted(label)
  count = 0
  tracker = ->(n) { count += 1; n }
  [tracker, -> { puts "#{label}: block ran #{count} times" }]
end

eager_fn, eager_report = counted("eager")
(1..1000).map { |n| eager_fn.(n) }.select(&:even?).first(3)
eager_report.call

lazy_fn, lazy_report = counted("lazy ")
(1..1000).lazy.map { |n| lazy_fn.(n) }.select(&:even?).first(3).to_a
lazy_report.call
```

Eager runs the block a thousand times to produce three results. Lazy runs it six.

:::realworld
Where laziness earns its keep:

```ruby
# Read a 10 GB log without loading it into memory.
# `each_line` without a block gives an Enumerator; `lazy` keeps it streaming.
File.open("app.log") do |f|
  f.each_line
   .lazy
   .map   { |line| JSON.parse(line) rescue nil }
   .reject(&:nil?)
   .select { |entry| entry["level"] == "error" }
   .first(20)
end

# Page through an API, stopping as soon as you have what you need.
def all_customers
  Enumerator.new do |yielder|
    page = 1
    loop do
      results = api.customers(page: page)
      break if results.empty?
      results.each { |c| yielder << c }
      page += 1
    end
  end
end

# Fetches page 2 only if page 1 did not contain five matches.
all_customers.lazy.select { |c| c.overdue? }.first(5)
```

That second pattern — `Enumerator.new` with a yielder — is how you make something
enumerable when the elements are produced by an external process. The consumer writes
ordinary `select` and `first`, and has no idea HTTP is involved.
:::

:::mistakes
**Forgetting the terminal operation.** A lazy chain without one is just a description:

```ruby runnable
chain = (1..10).lazy.map { |n| n * 2 }
p chain.class          # Enumerator::Lazy — nothing has run
p chain.first(3)       # now it runs
p chain.to_a.length    # `force` is an alias for to_a
```

**Reaching for `lazy` on small collections.** Laziness has per-element overhead. For a
few hundred items, eager is faster:

```ruby runnable
require "benchmark"
data = (1..2_000).to_a

Benchmark.bm(8) do |x|
  x.report("eager") { 300.times { data.map { |n| n * 2 }.select(&:even?).first(5) } }
  x.report("lazy")  { 300.times { data.lazy.map { |n| n * 2 }.select(&:even?).first(5).to_a } }
end
```

The crossover depends on how much work each stage does and how early you stop. Reach for
`lazy` when the source is unbounded, the data does not fit comfortably in memory, or you
are discarding most of what you compute — not as a default.

**Using `each` where `map` was meant.**

```ruby runnable
# Writing it the long way is a sign you wanted map.
names = []
[{ n: "a" }, { n: "b" }].each { |h| names << h[:n] }
p names

p [{ n: "a" }, { n: "b" }].map { |h| h[:n] }   # same thing, one line
```
:::

:::performance
Specialised classes override Enumerable's generic implementations when they can do better:

- `Array#map` is written in C and knows the length up front, so it allocates the result
  array once instead of growing it.
- `Hash#each` yields without building intermediate pairs.
- `Range#sum` for integers uses the arithmetic series formula — `(1..1_000_000).sum` is
  O(1), not O(n).

```ruby runnable
require "benchmark"
puts (1..10_000_000).sum        # instant: n*(n+1)/2
Benchmark.bm(10) do |x|
  x.report("range sum") { (1..5_000_000).sum }
  x.report("each sum")  { s = 0; (1..5_000_000).each { |n| s += n }; s }
end
```

So `include Enumerable` gives you correctness for free, and the standard library's
concrete classes give you speed on top. Your own class gets the correctness; if a method
becomes a hotspot, override it.

Two allocation habits worth knowing:
- `filter_map` does `map` + `compact` in one pass, with one array instead of two.
- `sum` beats `reduce(:+)` for numbers, because it avoids a block call per element.
:::

:::tradeoffs
**What Enumerable buys.** Fifty methods for the cost of one. A uniform vocabulary across
every collection in the language, including ones you write. Duck typing at its most
useful: the module and your class know nothing about each other.

**What it costs.** Generic implementations are slower than specialised ones, so the
standard library has to override them — meaning `Array#map` and `Enumerable#map` are
different code with the same name, and only one of them is the one you read. And the
method surface is large: `detect`/`find`, `select`/`filter`, `collect`/`map`,
`inject`/`reduce` are aliases, and `each_with_object` versus `reduce` is a real source
of confusion.
:::

:::checkpoint
Given the `Playlist` class above, write a single chained expression that returns the
titles of the two shortest ambient tracks, longest first.

Then answer: if `@tracks` were a database cursor yielding ten million rows, which part of
your expression would be the problem, and what would you change?
:::

:::interview
"How does Enumerable work?" tests whether you understand composition or have just
memorised method names. A strong answer is short: *"You implement `each`; every other
method is written in terms of it."* Then add the two details that show depth:

1. **`each` without a block should return `to_enum(:each)`** — otherwise `each_with_index`,
   `each_slice` and `lazy` all break on your class.
2. **Concrete classes override the generic implementations** for speed, which is why
   `Array#map` is C and `(1..n).sum` is O(1).

If laziness comes up, frame it as push versus pull and name a case where it is the only
option — an infinite range, or a file too large for memory — followed by the honest
caveat that it is slower for small collections.
:::

## What you now know

- Implement `each`, `include Enumerable`, get fifty methods. They work by calling your
  `each`.
- `return to_enum(:each) unless block_given?` is what makes `each_with_index`,
  `each_slice` and `lazy` work on your class.
- An `Enumerator` is iteration not yet performed — which enables external iteration with
  `next` and chaining.
- `lazy` converts a push pipeline into a pull pipeline: nothing is computed until a
  terminal operation asks, and only as much as it asks for.
- Use `lazy` for unbounded or oversized sources, not as a default — it is slower per
  element.
- Concrete classes override generic Enumerable methods for speed; your class gets
  correctness and can override later.
