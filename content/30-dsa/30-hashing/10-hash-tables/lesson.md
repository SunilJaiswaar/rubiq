---
title: Hash tables
summary: How O(1) lookup is possible at all, what collisions cost, and the two ways a hash table turns into a linked list.
level: intermediate
minutes: 18
version: "n/a"
status: stable
last_reviewed: "2026-09-20"
tags: [dsa, hash-table, hashing, collisions, data-structures]
concepts: [hash-tables, collisions, load-factor, hashing]
prerequisites: [complexity, big-o]
interview:
  - question: How does a hash table achieve O(1) lookup?
    level: intermediate
    answer: >-
      It converts the key into an integer with a hash function, reduces that to a bucket
      index with a modulo, and indexes straight into an array — which is O(1). No search
      happens. The cost is paid in memory: the array has to be larger than the number of
      entries, and keys that hash to the same bucket have to be handled by chaining or
      probing, which is what makes it O(1) *average* rather than guaranteed.
    followUps:
      - "What is the worst case, and when does it actually happen?"
      - "Why does the array have to be bigger than the number of entries?"
  - question: What is a hash collision and how are collisions resolved?
    level: intermediate
    answer: >-
      A collision is two distinct keys mapping to the same bucket. It is unavoidable —
      there are more possible keys than buckets, so the pigeonhole principle guarantees it.
      Two standard resolutions: **chaining**, where each bucket holds a list (or, above a
      threshold, a tree) of entries and a lookup scans it; and **open addressing**, where
      a colliding entry is placed in a nearby free slot found by probing. Chaining is
      simpler and degrades gracefully; open addressing has better cache locality because
      everything lives in one contiguous array.
    followUps:
      - "Which does your language's standard hash use?"
      - "How does deletion work under open addressing?"
  - question: When is a hash table the wrong data structure?
    level: intermediate
    answer: >-
      When you need order. A hash gives you no useful iteration order (or, in languages
      like Ruby and modern JavaScript, insertion order — which is still not *sorted*
      order), so range queries, nearest-value lookups, "first key above X", and sorted
      traversal all require a tree instead. Also when memory is tight, since a hash
      deliberately wastes space to stay fast; when keys are expensive to hash, such as
      long strings hashed repeatedly; and when you need worst-case rather than average
      guarantees, because a hash's worst case is O(n).
    realWorld: >-
      This is exactly why databases default to B-tree indexes rather than hash indexes:
      `WHERE created_at > ?` and `ORDER BY` both need ordering.
resources:
  - title: "Ruby documentation — Hash"
    url: https://docs.ruby-lang.org/en/master/Hash.html
---

## The problem, stated precisely

You have a million user records and you need to find one by email address.

An array means scanning: up to a million comparisons. Sorting by email and binary
searching brings that to 20 — good, but you must keep the array sorted, and every
insertion is O(n) because elements have to move.

:::problem
Array indexing is O(1) — `array[847_293]` is a single arithmetic operation and one memory
read, regardless of array size. But that only helps if you know the index.

You know an email address. You need an index.
:::

:::why
So: compute the index *from* the key.

If some function `f("asha@example.com")` reliably produces `847293`, then finding Asha is
`array[f("asha@example.com")]` — one function call and one array read. O(1), with no
search at all.

That function is a hash function, and that idea is the entire data structure.
:::

:::what
A **hash table** stores key-value pairs in an array, choosing each entry's position by
applying a **hash function** to the key and reducing the result to an array index.
Lookup computes the same position and reads it directly.
:::

## Build one

```ruby runnable
class TinyHash
  def initialize(buckets = 8)
    @buckets = Array.new(buckets) { [] }   # chaining: each bucket is a list
    @size = 0
  end

  def index_for(key)
    # key.hash is Ruby's built-in hash function; .abs because it can be negative,
    # and % to fold the huge integer down to a valid bucket index.
    key.hash.abs % @buckets.length
  end

  def []=(key, value)
    bucket = @buckets[index_for(key)]
    pair = bucket.find { |k, _| k == key }
    if pair
      pair[1] = value          # overwrite an existing key
    else
      bucket << [key, value]
      @size += 1
    end
    value
  end

  def [](key)
    bucket = @buckets[index_for(key)]
    pair = bucket.find { |k, _| k == key }
    pair && pair[1]
  end

  def inspect_buckets
    @buckets.each_with_index.map { |b, i| "#{i}: #{b.map(&:first).inspect}" }
  end

  attr_reader :size
end

h = TinyHash.new(8)
%w[asha bo cal dee eli fay gus].each_with_index { |name, i| h[name] = i }

puts "size: #{h.size}"
puts "h['cal'] = #{h['cal'].inspect}"
puts "h['nope'] = #{h['nope'].inspect}"
puts
puts "bucket contents:"
puts h.inspect_buckets
```

Run it and look at the bucket distribution. Seven names into eight buckets, and some
buckets hold two entries while others are empty. That is not a flaw in the code — it is
the central fact about hash tables.

## Collisions are mathematically unavoidable

:::how
There are more possible keys than buckets. Always.

```text
  Possible 20-character email addresses:  astronomically many
  Buckets in your array:                  16, or 1024, or 1,048,576

  Pigeonhole principle: if you put more items than containers, at least
  one container holds more than one item. No hash function can avoid it.
```

So the question is never "how do I avoid collisions" but "what do I do when they happen".

**Chaining** — what the code above does, and what Ruby, Java and Python all use in some
form:

```text
  bucket 0 → [ ]
  bucket 1 → [ ("bo", 1) ]
  bucket 2 → [ ("asha", 0) → ("eli", 4) ]      ← two keys collided here
  bucket 3 → [ ("cal", 2) ]
  ...

  Lookup: hash the key, go to the bucket, then scan the (short) list.
```

**Open addressing** — if the bucket is taken, probe for the next free slot:

```text
  index:    0        1        2        3        4
          [ — ]   ["bo"]  ["asha"] ["eli"]  [ — ]
                              ▲        ▲
                       asha landed  eli wanted bucket 2, found it
                       in bucket 2  occupied, so it took 3

  Lookup for "eli": hash → 2, occupied by "asha", so probe 3. Found.
  Lookup for a missing key: probe until an EMPTY slot. That is the stopping condition.
```

Open addressing keeps everything in one contiguous array, which is much kinder to the CPU
cache — no pointer-chasing. Its cost is that deletion is awkward: you cannot simply empty
a slot, because that would break the probe chain for anything that passed through it, so
you have to leave a tombstone marker instead.
:::

## Load factor: why the array must be bigger than the data

```ruby runnable
# Watch what happens to the longest bucket as the table fills up.
class Probe
  def initialize(buckets)
    @buckets = Array.new(buckets) { [] }
  end

  def add(key)
    @buckets[key.hash.abs % @buckets.length] << key
  end

  def stats
    lengths = @buckets.map(&:length)
    { longest: lengths.max, empty: lengths.count(0), avg: (lengths.sum.to_f / lengths.length).round(2) }
  end
end

puts "load   longest-chain  empty-buckets  avg-chain"
[0.25, 0.5, 0.75, 1.0, 2.0, 4.0].each do |load|
  buckets = 256
  table = Probe.new(buckets)
  (buckets * load).to_i.times { |i| table.add("key-#{i}") }
  s = table.stats
  puts "#{load.to_s.ljust(6)} #{s[:longest].to_s.center(14)} #{s[:empty].to_s.center(14)} #{s[:avg]}"
end
```

:::what
**Load factor** is entries ÷ buckets. At a load factor of 0.75, 256 buckets hold 192
entries.
:::

:::how
The average chain length *is* the load factor — that is what the numbers above show. So
lookup cost is roughly `1 + load_factor`:

| Load factor | Avg chain | Lookup cost |
|---|---|---|
| 0.5 | 0.5 | ~1.5 probes |
| 0.75 | 0.75 | ~1.75 probes |
| 2.0 | 2.0 | ~3 probes |
| 10.0 | 10.0 | ~11 probes |

Keep the load factor bounded by a constant and lookup is O(1) by definition — the chain
length does not grow with `n`, because the table grows too.

That is the actual mechanism behind "O(1) average": the table **resizes**. When the load
factor crosses a threshold (Java uses 0.75, Python 0.66, Ruby around 0.75), the table
allocates a bigger array — typically double — and rehashes every entry into it.

Rehashing is O(n), and by the same doubling argument as dynamic array growth, it amortises
to O(1) per insert.
:::

:::tradeoffs
A hash table is a deliberate trade of **memory for time**.

At a load factor of 0.75, a quarter of your array is empty by design. You could pack it
to 1.0 and save that memory — and your chains would get longer and lookups slower. You
could drop to 0.25 and get shorter chains, at four times the memory.

**What you gain:** O(1) average insert, lookup and delete.

**What you give up:**
- **Order.** No sorted iteration, no range queries, no "nearest key". This is the big one.
- **Memory.** Both the slack and the per-entry overhead of chain pointers.
- **Worst-case guarantees.** O(n) if every key collides.
- **Predictable latency.** A resize is an O(n) pause. For a p99 latency target, that
  matters — which is why some real-time systems pre-size their tables and never resize.
:::

## The two ways a hash table becomes a linked list

:::failure
**1. A bad hash function.**

```ruby runnable
# A hash function that ignores most of the key.
class BadHash
  def initialize(buckets = 16)
    @buckets = Array.new(buckets) { [] }
  end

  def add(key)
    # Only uses the string's length. Catastrophic for same-length keys.
    @buckets[key.length % @buckets.length] << key
  end

  def stats
    @buckets.map(&:length)
  end
end

bad = BadHash.new(16)
1000.times { |i| bad.add("user-#{i.to_s.rjust(6, '0')}") }   # all the same length
p bad.stats
puts "→ every key in one bucket. Lookup is now O(n)."
```

Every key has the same length, so every key lands in the same bucket, and the hash table
is a linked list with extra steps. A good hash function must distribute keys uniformly and
use the *whole* key.

**2. Deliberate collisions — hash flooding.**

This is a real security vulnerability, not a theoretical one. If an attacker knows your
hash function, they can craft thousands of distinct keys that all hash to the same bucket.
Send them as form fields or JSON keys, and every insert scans a growing chain: `n`
insertions become O(n²) work. A few hundred kilobytes of request body can consume a CPU
core for minutes.

This was disclosed against PHP, Java, Python, Ruby and Node in 2011–2012, and it is why
modern runtimes use **randomised hash seeds**: a per-process random value mixed into every
hash, so an attacker cannot predict bucket assignment. It is also why `key.hash` for the
same string differs between Ruby processes:

```ruby runnable
# Run this twice. The value changes between processes — by design.
puts "asha".hash
```

Java took a different route for `HashMap`: once a bucket's chain exceeds 8 entries, it
converts that chain to a red-black tree, so the worst case becomes O(log n) rather than
O(n). Defence in depth rather than relying on the seed alone.
:::

:::mistakes
**Mutating a key after inserting it.** The entry was filed under the key's *old* hash. Change
the key and the table looks in the wrong bucket — the value is still there, and
unreachable.

```ruby runnable
key = ["a"]
h = { key => "value" }
puts "before: #{h[key].inspect}"

key << "b"                  # mutate the key in place
puts "after:  #{h[key].inspect}"     # nil — filed under the old hash
puts "still present? #{h.values.inspect}"
puts "after rehash: #{h.rehash[key].inspect}"
```

This is why strings used as hash keys should be frozen, and why Ruby freezes string
literals used as hash keys automatically. It is also most of the reason symbols exist as a
separate type: they are immutable and interned, so they are safe and cheap as keys.

**Defining `==` without `hash`.** If two objects are equal they *must* have the same hash,
or the table will file them in different buckets and never see them as equal:

```ruby runnable
class Point
  attr_reader :x, :y
  def initialize(x, y); @x, @y = x, y; end
  def ==(other); other.is_a?(Point) && x == other.x && y == other.y; end
  # eql? and hash NOT defined — this is the bug
end

a = Point.new(1, 2)
b = Point.new(1, 2)
puts "a == b: #{a == b}"
puts "as hash keys: #{({ a => 'first', b => 'second' }).size} entries (expected 1)"

class FixedPoint
  attr_reader :x, :y
  def initialize(x, y); @x, @y = x, y; end
  def ==(other); other.is_a?(FixedPoint) && x == other.x && y == other.y; end
  alias eql? ==
  def hash; [self.class, x, y].hash; end
end

c = FixedPoint.new(1, 2)
d = FixedPoint.new(1, 2)
puts "fixed: #{({ c => 'first', d => 'second' }).size} entry"
```

The rule is in every language with hash-based collections: **equal objects must have equal
hashes.** The converse need not hold — unequal objects may share a hash, which is just a
collision.

**Assuming iteration order is sorted.** Ruby hashes and modern JavaScript objects preserve
*insertion* order, which people routinely mistake for a guarantee of sorted order. It is
not. Sort explicitly, or use a structure that maintains order.
:::

:::performance
```ruby runnable
require "benchmark"

n = 100_000
array = (1..n).to_a
set   = array.to_set
hash  = array.to_h { |i| [i, true] }
needles = Array.new(2_000) { rand(1..n) }

Benchmark.bm(14) do |x|
  x.report("array include?") { needles.each { |v| array.include?(v) } }
  x.report("set include?")   { needles.each { |v| set.include?(v) } }
  x.report("hash key?")      { needles.each { |v| hash.key?(v) } }
end
```

Two thousand lookups into a hundred thousand items: the array does up to 200 million
comparisons, the hash does 2,000. That ratio is the reason this data structure is
everywhere.

Costs worth knowing:
- **Hashing is not free.** A long string must be read in full to be hashed. Hashing a 1 KB
  key is ~1 KB of work before any lookup happens. Short keys, or cached hashes, matter in
  hot paths.
- **Cache behaviour is poor.** A hash lookup is by design a jump to an unpredictable
  address — close to a guaranteed cache miss. This is why a linear scan of a small array
  beats a hash: 50 sequential reads in one or two cache lines beat one random access.
- **Resizing is a latency spike,** not a throughput problem. Pre-size when you know the
  size: `Hash.new` then filling 1M entries resizes about 20 times.
:::

:::realworld
```ruby
# The single most valuable application: turning an O(n²) loop into O(n).
# Before — a lookup inside a loop:
orders.each { |o| user = users.find { |u| u.id == o.user_id } }      # O(n·m)

# After — index once, then look up:
by_id = users.index_by(&:id)                                         # O(n)
orders.each { |o| user = by_id[o.user_id] }                           # O(1) each

# Deduplication and set operations, free:
unique = records.uniq
seen = Set.new
records.each { |r| next unless seen.add?(r.id); process(r) }

# Counting and grouping:
counts = events.tally
by_kind = events.group_by(&:kind)

# Memoisation:
@cache ||= {}
def expensive(n) = (@cache[n] ||= slow_computation(n))
```

Where a hash is specifically the *wrong* answer:

```ruby
# "Events in the last hour" — a range query. A hash cannot answer this
# without examining every key. Use a sorted structure.
# "The 10 highest scores" — needs order. Use a heap or a sorted array.
# "The next scheduled job" — needs min. Use a priority queue.
```

And the database parallel from the SQL track: PostgreSQL supports hash indexes and almost
nobody uses them, because a B-tree handles equality nearly as well *and* handles ranges,
sorting and `LIKE 'prefix%'`. The asymptotic win of O(1) over O(log n) rarely beats losing
ordered access.
:::

:::debugging
When a hash-based structure misbehaves:

1. **Lookup returns nil for a key you are sure you inserted.** Either the key was mutated
   after insertion, or the key's class defines `==` without `hash`/`eql?`. Check
   `h.keys.map(&:hash)` against `your_key.hash`.
2. **Performance collapsed as data grew.** Measure bucket distribution, or at least
   confirm the keys are varied. If a custom `hash` returns a constant, or ignores most of
   the key, you have a linked list.
3. **Two "equal" objects both present as keys.** `==` without `eql?` and `hash`. In Ruby,
   `Hash` uses `eql?` and `hash`, not `==`.
4. **Intermittent latency spikes on insert.** Resizing. Pre-size the table.
:::

:::checkpoint
You have 10 million log lines. You need two things:

1. How many distinct IP addresses appear.
2. All requests between 14:00 and 15:00.

For each, say which data structure you would use and why — and specifically, why the one
that works for (1) does not work for (2).
:::

:::interview
Hash tables appear in two different ways, and they test different things.

**As a tool:** most "optimise this" problems are solved by introducing a hash. Two Sum,
anagram grouping, finding duplicates, N+1 queries. The interviewer wants to see you
recognise the lookup-inside-a-loop shape and say *"I will index this by id first, which
trades O(n) memory for O(1) lookups."* Naming the trade is the part people skip.

**As a subject:** "how does a hash table work?" A strong answer has four beats and takes
about ninety seconds — hash the key to an integer, modulo to a bucket index, resolve
collisions by chaining or probing, and resize when the load factor crosses a threshold so
that average chain length stays constant. That last clause is important, because it is
*why* the complexity is O(1) rather than a thing you assert about it.

Then the follow-up that separates candidates: **what is the worst case, and when does it
happen?** O(n), when every key collides — from a bad hash function, or deliberately, via
hash flooding. Mentioning randomised hash seeds, or Java converting long chains to trees,
is the detail that signals you have read about this rather than only used it.
:::

## What you now know

- A hash table computes a position from the key, so lookup is array indexing rather than
  searching.
- Collisions are guaranteed by the pigeonhole principle; chaining and open addressing are
  the two resolutions, trading simplicity against cache locality.
- Average chain length equals the load factor, so bounding the load factor — by resizing
  and rehashing — is what makes the complexity O(1).
- Rehashing is O(n) and amortises to O(1), but it is a latency spike. Pre-size when you
  can.
- A bad hash function, or a deliberate hash-flooding attack, turns the table into a linked
  list. Hence randomised seeds and tree-ified buckets.
- Mutating a key after insertion makes its value unreachable. Equal objects must have
  equal hashes.
- Hashes give up order. Range queries, nearest-value and sorted iteration need a tree —
  which is why database indexes are B-trees.
