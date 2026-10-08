---
title: Copying, shallow and deep
summary: Why `{...obj}` is not enough, and how to decide how deep a copy needs to be.
level: basic
minutes: 12
status: stable
last_reviewed: "2026-10-07"
tags: [fundamentals, references, copying]
concepts: [shallow-copy, deep-copy, immutability]
prerequisites: [variables, mutability]
interview:
  - question: What is the difference between a shallow and a deep copy?
    level: basic
    answer: >-
      A shallow copy creates a new container whose entries are the *same references* as
      the original's. So the top level is independent, and everything nested is still
      shared. A deep copy recursively copies the nested values too, so nothing is shared.
      Shallow is O(top-level size) and usually what you want; deep is O(total size), can
      be surprisingly expensive, and has to decide what to do about cycles, functions and
      class instances.
    followUps:
      - "When is a shallow copy actually sufficient?"
      - "What does Marshal preserve that a JSON round trip does not?"
resources:
  - title: "Ruby docs — Marshal"
    url: https://docs.ruby-lang.org/en/master/Marshal.html
  - title: "Rails API — Object#deep_dup"
    url: https://api.rubyonrails.org/classes/Object.html#method-i-deep_dup
---

## The copy that was not a copy

The previous lesson's rule was "copy at your boundaries". Here is that rule being followed
carefully, and still producing the bug:

```ruby runnable
defaults = {
  retries: 3,
  timeout: { connect: 1000, read: 5000 },
}

# Carefully making a copy before changing anything.
config = defaults.dup
config[:retries] = 5
config[:timeout][:read] = 99

p config[:retries]     # 5
p defaults[:retries]   # 3  — good, protected
p defaults[:timeout]   # read: 99 — NOT protected
```

`merge` has exactly the same property, which is worth knowing because it reads even more like a
copy than `dup` does:

```ruby runnable
defaults = { retries: 3, timeout: { read: 5000 } }
config = defaults.merge(retries: 5)      # looks functional, feels safe

config[:timeout][:read] = 99
p defaults[:timeout][:read]              # 99 — the nested Hash was shared, not copied
```

`retries` was protected. `timeout.read` was not.

:::problem
`{ ...defaults }` builds a new object and copies each of the original's *values* into it.
For `retries` that value is the number 3 — copying it is a real copy. For `timeout` that
value is a *reference to an object*. Copying a reference gives you a second reference to
the same object.

So the copy is genuinely new, one level deep, and genuinely shared below that.
:::

:::what
A **shallow copy** creates a new container holding the same references as the original.
The top level is independent; everything nested is shared.

A **deep copy** recursively copies nested values too, so nothing is shared.
:::

:::why
Shallow is the default everywhere — `{...x}`, `Object.assign`, `Array.prototype.slice`,
Python's `dict.copy()`, Ruby's `dup` — because it is the copy you usually want and it is
cheap. Copying one level costs time proportional to the number of properties. Copying
everything costs time proportional to the whole data structure, and most of the time you
are protecting against a mutation that never happens.

So the languages made the cheap, usually-correct thing the default, and left the expensive,
sometimes-necessary thing to an explicit call. That is the right trade — but it means you
have to know which one you are getting.
:::

:::how
```text
  config = defaults.dup

  defaults ──▶ ┌──────────────────────┐
               │ retries: 3           │
               │ timeout: ───────────────┐
               └──────────────────────┘  │
                                         ▼
                                   ┌──────────────────┐
                                   │ connect: 1000    │   ONE object,
                                   │ read:    5000    │   two references
                                   └──────────────────┘
                                         ▲
  config   ──▶ ┌──────────────────────┐  │
               │ retries: 3  (copied) │  │
               │ timeout: ───────────────┘
               └──────────────────────┘

  config.retries = 5        → writes into config's own slot.          Safe.
  config.timeout.read = 99  → follows the shared reference.           Not safe.
```

The rule that falls out: **a shallow copy protects exactly the properties whose values are
primitives.** Numbers, strings, booleans, `null`, `undefined`, symbols and bigints are
copied. Objects, arrays, Maps, Sets, Dates and functions are shared.
:::

## Three ways to copy, and when each is right

```ruby runnable
require 'json'

original = {
  name: 'Asha',
  tags: %w[admin beta],
  meta: { created_at: Time.at(0), scores: [1, 2] },
}

# 1. Shallow — one level. Fast. Usually enough.
shallow = original.dup

# 2. Deep, via JSON — convenient and lossy.
via_json = JSON.parse(JSON.generate(original), symbolize_names: true)

# 3. Deep, properly.
deep = Marshal.load(Marshal.dump(original))

original[:meta][:scores] << 99

p shallow[:meta][:scores]    # [1, 2, 99] — shared
p via_json[:meta][:scores]   # [1, 2]
p deep[:meta][:scores]       # [1, 2]

puts
p deep[:meta][:created_at].class       # Time — survived
p via_json[:meta][:created_at].class   # String — did not
p via_json[:meta][:created_at]
```

`Marshal.load(Marshal.dump(x))` is Ruby's `structuredClone`: a real deep copy that preserves
classes. It is ugly, it is the idiom, and it is in the standard library with nothing to install.

In a Rails application you have a nicer option, because ActiveSupport adds `deep_dup` to Object,
Array and Hash:

```ruby
config = defaults.deep_dup      # Rails only — recursive dup, no serialisation round trip
```

`deep_dup` is usually the better choice when it is available: it recurses with `dup` rather than
serialising, so it handles objects Marshal refuses and does not pay the cost of building a byte
string. It is not a drop-in equivalent though — it duplicates the structure and `dup`s the leaves,
so an object with custom marshalling behaviour may copy differently.

:::mistakes
**`JSON.parse(JSON.stringify(x))` is the copy everyone reaches for first, and it is lossy
in ways that produce late, confusing bugs.** It silently changes or discards:

```ruby runnable
require 'json'
require 'set'

awkward = {
  when: Time.at(0),            # → becomes a String
  sym: :a_symbol,              # → becomes a String
  missing: nil,                # → survives as null/nil
  set: Set[1, 2],              # → guess before you run it
  nan: Float::NAN,             # → raises!
  inf: Float::INFINITY,        # → raises!
  big: 2**80,                  # → survives; Ruby Integers are arbitrary precision
}

awkward.each do |key, value|
  result = begin
    JSON.parse(JSON.generate(key => value)).values.first.inspect
  rescue StandardError => e
    "#{e.class}: #{e.message[0, 40]}"
  end
  puts format('%-9s %-22s → %s', key, value.inspect[0, 22], result)
end
```

Three Ruby-specific things fall out of that.

`Float::NAN` and `Float::INFINITY` **raise** rather than silently becoming `null` as they do in
JavaScript — the better behaviour, and the same "Ruby prefers an error to a guess" pattern from
the types lesson.

The `Set` does not become an array. It becomes `"#<Set: {1, 2}>"` — its `inspect` output, as a
string. Any object without a `to_json` serialises to whatever its `to_s` produces, so an
unsupported type does not fail, it silently becomes a debug string that looks like data. That is
the single most dangerous behaviour in this list, because it survives a round trip and only
breaks much later when something tries to use it.

And symbols are the quiet loss that actually costs you time: every symbol, as a key *or* a value,
comes back as a String. `symbolize_names: true` fixes the keys and not the values, so a
round-tripped `status: :pending` becomes `status: "pending"` and your `case status when :pending`
stops matching.

Marshal has a different and smaller set of refusals:

```ruby runnable
io_like = $stdout
a_proc = -> { 1 }
singleton = Object.new
def singleton.special = 1

[['a Proc', a_proc], ['an IO', io_like], ['a singleton method', singleton]].each do |label, obj|
  result = begin
    Marshal.dump(obj) && 'dumped'
  rescue TypeError => e
    "TypeError: #{e.message}"
  end
  puts format('%-20s → %s', label, result)
end
```

So the choice is: JSON loses type information but is portable and human-readable; Marshal keeps
Ruby types but refuses anything tied to the running process, and its output is only readable by
the same (or a compatible) Ruby version — which is why **Marshal is a terrible cache format and a
genuine security risk if the bytes come from anywhere you do not control.** `Marshal.load` on
untrusted input can instantiate arbitrary objects and is a remote code execution vector. Use it
for in-process copies; never for data crossing a trust boundary.

A `Date` becoming a string is the one that bites hardest: it works everywhere you only
display it, and fails the first time something calls `.getTime()`.

**It also cannot handle cycles:**

```ruby runnable
require 'json'

node = { name: 'a' }
node[:self] = node

begin
  JSON.generate(node)
rescue StandardError => e
  puts "JSON: #{e.class} — #{e.message[0, 60]}"
end

cloned = Marshal.load(Marshal.dump(node))
p cloned[:self].equal?(cloned)   # true — the cycle was preserved, not expanded
```

Marshal tracks object identity as it walks, so a cycle round-trips into a cycle and a value
referenced twice stays shared rather than becoming two copies. That second property matters more
often than cycles do: if your structure holds the same object in two places, Marshal preserves
that and a naive recursive copy would not.

**Marshal is the right default in plain Ruby** — it handles Time, Struct, Set, Range, nested
collections, cycles and shared references correctly, and it preserves classes. Its limits are
honest ones: it refuses Procs, lambdas, IO objects and anything carrying singleton methods,
raising `TypeError` rather than guessing. **In Rails, prefer `deep_dup`**, which recurses with
`dup` instead of serialising.

```ruby runnable
class User
  attr_reader :name
  def initialize(name) = @name = name
  def greet = "hi #{@name}"
end

u = User.new('Bo')
c = Marshal.load(Marshal.dump(u))

p c.name                 # "Bo"       — data copied
p c.instance_of?(User)   # true       — the class survived
p c.greet                # "hi Bo"    — methods still there
p c.equal?(u)            # false      — but a different object
```

This is where Ruby is simply better than the JavaScript equivalent: `structuredClone` drops the
prototype, so a cloned instance comes back as a plain object with no methods. Marshal stores the
class name and reconstructs a real instance.

The catch is that Marshal bypasses `initialize` — it allocates and sets instance variables
directly. So an object whose constructor establishes an invariant, opens a connection or
registers itself somewhere will come back with its instance variables intact and that side effect
never performed. Classes that care define `marshal_dump`/`marshal_load` to control it.

For objects with invariants, define `marshal_dump` and `marshal_load`, or write your own
`deep_copy`. The language cannot guess what "a copy of this" means for your type.
:::

:::tradeoffs
| | Cost | Protects | Use when |
|---|---|---|---|
| `dup` / `clone` / `merge` | O(width) | Top level only | The nested values are immutable, or you will not mutate them |
| `Marshal.load(Marshal.dump(x))` | O(total size) + serialise | Everything it can dump, classes included | You need real isolation in plain Ruby |
| `deep_dup` (Rails) | O(total size) | Everything `dup` can copy | You are in Rails — the usual answer |
| `JSON.parse(JSON.generate(x))` | O(total size) + parse | Everything, lossily | Never, as a copy. Symbols and Time do not survive |
| `freeze` / `deep_freeze` | O(1) / O(total size) | Nothing — it forbids instead | Shared read-only data; turns a silent bug into FrozenError |
| Immutable data | O(changed path) | Everything, by construction | The whole codebase opts in |

`clone` versus `dup`, since Ruby is the odd language for having both: `clone` copies the frozen
state and any singleton methods, `dup` copies neither. So `frozen_thing.dup` is writable and
`frozen_thing.clone` is still frozen, and `clone(freeze: false)` opts out explicitly. Reach for
`dup` by default; reach for `clone` when you specifically want an exact replica including its
frozenness.

**A deep copy is not free and is not automatically correct.** Deep-copying a 50,000-row
result set inside a request handler is a measurable cost for protection you probably do
not need. The question is never "shallow or deep?" in the abstract — it is *"which of
these nested values will anything mutate?"*

If the answer is "none", a shallow copy is correct and cheaper. If the answer is "I do not
know", that is usually a sign the data is being shared too widely, and the real fix is
narrowing who can reach it.
:::

:::realworld
The fourth row of that table is how large frontends actually solve this. Rather than
copying defensively, they make mutation impossible and share freely:

```ruby runnable
# Structural sharing: build a new object that reuses every unchanged subtree.
state = {
  user: { name: 'Asha', prefs: { theme: 'dark' } },
  posts: [{ id: 1 }, { id: 2 }],
}

nxt = state.merge(
  user: state[:user].merge(
    prefs: state[:user][:prefs].merge(theme: 'light'),
  ),
)

p nxt[:user][:prefs][:theme]              # "light"
p state[:user][:prefs][:theme]            # "dark" — original intact
p nxt[:posts].equal?(state[:posts])       # true — posts REUSED, not copied
```

Only the path from the root to the change is rebuilt; everything else is the same object. For a
large state tree that is the difference between copying a megabyte and allocating three hashes,
and it is how every immutable-state library works underneath.

The chain of `merge` calls is also the honest argument for `dig` and for keeping state shallow:
three levels is already awkward to read, and five is unreadable. When you find yourself writing
this, the usual answer is not a better copying technique but a flatter structure, or objects with
methods instead of nested hashes.

Only the path to the change is rebuilt; everything else is shared. That is what makes
Redux's "never mutate state" rule practical rather than wasteful, and what makes React's
`===` check on props a valid way to skip a re-render. Immer and Immutable.js automate the
same idea.
:::

:::debugging
When a copy did not protect you:

1. **Find the deepest thing you mutated.** `config.timeout.read = 99` is two levels; the
   copy was one.
2. **Check identity, not equality.** `copy.nested === original.nested` being `true` is the
   proof.
3. **Freeze deeply in development.** A thrown error with a stack trace beats reasoning.

```ruby runnable
def deep_freeze(obj)
  case obj
  when Hash  then obj.each { |k, v| deep_freeze(k); deep_freeze(v) }
  when Array then obj.each { |v| deep_freeze(v) }
  end
  obj.freeze
end

frozen = deep_freeze({ a: { b: [1] } })

begin
  frozen[:a][:b] << 2
rescue FrozenError => e
  puts "caught: #{e.class} — #{e.message}"
end

p frozen.frozen?, frozen[:a].frozen?, frozen[:a][:b].frozen?
```

Freezing Hash keys as well as values is deliberate, and the reason is worth seeing directly:

```ruby runnable
key = +'mutable'
h = { key => 1 }

p h.keys.first.frozen?         # true  — Ruby dup'd and froze it on insert
p h.keys.first.equal?(key)     # false — so mutating your copy is harmless
key << '!'
p h['mutable']                 # 1 — still findable

# But that protection is for String keys ONLY:
akey = [1, 2]
h2 = { akey => :value }
p h2.keys.first.equal?(akey)   # true — no copy was made
akey << 3
p h2[[1, 2]]                   # nil
p h2[[1, 2, 3]]                # nil — stranded, until h2.rehash
```

So Ruby special-cases String keys — it dups and freezes them, because mutable string keys are
such a common mistake — and does nothing for Array, Hash or custom-object keys. Those strand
their entry the moment you mutate them, exactly as the memoisation lesson's cache keys do. The
explicit `deep_freeze` walk is still worth having for everything that is not a String.
:::

:::checkpoint
For each, say whether `original` is affected:

```ruby
original = { n: 1, list: [1], deep: { x: 1 } }
copy = original.dup

copy[:n] = 2              # ?
copy[:list] << 2          # ?
copy[:list] = [9]         # ?
copy[:deep][:x] = 2       # ?
copy[:deep] = { x: 9 }    # ?

# And then, for each line: does `original` see it?
```

Then: which single one of these five would a shallow copy have needed to be deep to
prevent, and which are safe for a reason that has nothing to do with copy depth?
:::

:::interview
Asked as "what's the difference between shallow and deep copy", the recited answer is fine
and forgettable. What distinguishes a good answer is the follow-through:

*"`dup` copies the top-level values — so reassigning a key on the copy is safe, and mutating
anything nested is not. Integers and Symbols are immutable so they are protected for free;
Hashes, Arrays and mutable Strings are shared. `merge` behaves identically, which catches people
because it reads like a functional operation. In practice I reach for the shallow copy and ask
which nested values anything will actually mutate; if none, that is correct and cheap."*

*"For real isolation I use `deep_dup` in Rails, or `Marshal.load(Marshal.dump(x))` in plain
Ruby, rather than a JSON round trip — JSON turns every Symbol into a String as a key and as a
value, turns Time into a String, raises on NaN and Infinity, and serialises anything it does not
understand to its `inspect` output. A Set arriving as `\"#<Set: {1, 2}>\"` looks like data and
fails somewhere else entirely. And I never `Marshal.load` bytes from outside the process, because
it instantiates arbitrary objects."*

Then the senior note: *"at scale the answer is usually not to copy at all but to stop mutating
shared data and share structure instead — only the path to the change gets rebuilt. The other
half of that is `freeze` at the boundary where shared data is created, which converts a silent
cross-request mutation into a `FrozenError` with a backtrace pointing at the culprit."*
:::

## What you now know

- `dup`, `clone` and `merge` duplicate the container and share everything nested.
- They therefore protect immutable values (Integer, Symbol, frozen String) and nothing else.
- `clone` keeps frozen state and singleton methods; `dup` keeps neither.
- `Marshal.load(Marshal.dump(x))` is the stdlib deep copy: it preserves classes, cycles and
  shared references, but bypasses `initialize` and refuses Procs, IO and singleton methods.
- In Rails, `deep_dup` is usually the better deep copy — it recurses with `dup`, no serialising.
- Never `Marshal.load` untrusted bytes; it is a remote code execution vector.
- A JSON round trip is not a copy: Symbols become Strings as keys *and* values, Time becomes a
  String, NaN and Infinity raise, and unsupported objects become their `inspect` string.
- Deep copying costs O(total size) — ask which nested values actually get mutated first.
- Ruby dups and freezes String Hash keys for you; Array and object keys strand on mutation.
- `freeze` is shallow. Walk the structure if you mean it.
- Immutability plus structural sharing is the scalable answer, and `equal?` is how you check
  that an untouched subtree really was reused.
