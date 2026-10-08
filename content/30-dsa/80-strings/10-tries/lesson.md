---
title: Tries and prefix structures
summary: A tree keyed by characters that answers prefix questions a hash map cannot — and the memory cost that makes people reach for the compressed version.
level: advanced
minutes: 16
version: "1"
status: stable
last_reviewed: "2026-10-07"
tags: [dsa, tries, prefix-tree, autocomplete, routing]
concepts: [tries, prefix-search, radix-trees, space-time-tradeoffs]
prerequisites: [trees, hash-tables]
interview:
  - question: What does a trie give you that a hash map does not?
    level: advanced
    answer: >-
      Prefix queries. A hash map answers "is this exact key present" in O(1) and can say nothing
      about "which keys start with 'auto'" short of scanning every key. A trie stores one node
      per character with shared prefixes, so walking down the 'a'-'u'-'t'-'o' path lands you on
      the subtree containing exactly the matching keys — O(length of prefix) to locate, then
      proportional to the number of results to enumerate. It also gives you sorted iteration for
      free if you keep children ordered, and longest-prefix matching, which is the operation IP
      routing is built on.
    followUps:
      - "What is the memory cost, and how do you reduce it?"
  - question: What is the memory problem with a trie, and what fixes it?
    level: advanced
    answer: >-
      A naive trie allocates a node per character, and if each node holds a fixed array of 26 or
      256 child pointers, most of them are null — storing a few thousand words can cost
      megabytes. Two fixes. A hash map or sorted array per node instead of a fixed array, which
      trades a little lookup speed for a large memory saving. And path compression: a radix tree
      (or Patricia trie) collapses any chain of single-child nodes into one node holding the
      whole substring, which removes most of the nodes in practice because long unique suffixes
      are common.
    followUps:
      - "Where would you see a radix tree in production?"
  - question: When would you not use a trie?
    level: advanced
    answer: >-
      When you only need exact lookups — a hash map is simpler, faster and smaller. When the keys
      are long and share few prefixes, since the structure's whole advantage is shared prefixes
      and without them you pay the node overhead for nothing. And when a database index would do
      the job: a B-tree index supports prefix matching through a range scan, which is why `WHERE
      name LIKE 'auto%'` can use an index, and that is usually a better answer than building an
      in-memory trie beside your database.
    followUps:
      - "Why can LIKE 'auto%' use an index but LIKE '%auto' cannot?"
resources:
  - title: "Sedgewick & Wayne — Tries"
    url: https://algs4.cs.princeton.edu/52trie/
---

## The structure

```ruby
class Trie
  def self.node = { children: {}, terminal: false }

  def initialize
    @root = self.class.node
  end

  attr_reader :root

  def insert(word)
    current = @root
    word.each_char { |ch| current = (current[:children][ch] ||= self.class.node) }
    current[:terminal] = true
    self                                  # so inserts can chain
  end

  def include?(word)
    node = walk(word)
    !node.nil? && node[:terminal]
  end

  # The operation that justifies the structure.
  def starts_with(prefix)
    node = walk(prefix)
    return [] unless node
    out = []
    collect = lambda do |n, acc|
      out << acc if n[:terminal]
      n[:children].each { |ch, child| collect.call(child, acc + ch) }
    end
    collect.call(node, prefix)
    out
  end

  private

  def walk(str)
    node = @root
    str.each_char do |ch|
      node = node[:children][ch]
      return nil unless node
    end
    node
  end
end

trie = Trie.new
%w[car cart cat dog do].each { |w| trie.insert(w) }

trie.include?('car')       # => true
trie.include?('ca')        # => false — a prefix is not a word
trie.starts_with('ca')     # => ["car", "cart", "cat"]
trie.starts_with('')       # => all five words
```

The line carrying the most weight is `current[:children][ch] ||= self.class.node`. It replaces
the check-then-insert dance — "does this child exist, if not create it, now fetch it" — with one
expression that also evaluates to the node you want, so the walk and the insert are the same
statement. This is the single most useful Ruby idiom for building any tree incrementally.

A plain Hash for the node, rather than a Struct or a class, is a deliberate choice at this size:
there are two fields, both are mutated constantly, and a node is never passed anywhere that cares
about its type. If a third field appears — a score, a count, a parent pointer — promote it to a
Struct before the Hash keys become a guessing game.

Naming matters more than usual here. `include?` rather than `has`, because that is what every
other Ruby collection calls the question, and a `Trie` that answers `include?` can be used
wherever duck typing expects a collection. The `?` suffix tells you it returns a boolean without
reading the body.

```text
  insert "car", "cat", "cart", "dog"

        (root)
        /    \
       c      d
       │      │
       a      o
      / \     │
     r   t*   g*
     │   
     t*        * = terminal

  "car" and "cart" and "cat" share the "ca" path. The sharing is
  the point: storage is proportional to distinct prefixes, not to
  total characters.
```

:::what
A **trie** (prefix tree) stores strings as paths from the root, one node per character, with
common prefixes shared. A node is marked to indicate that the path to it forms a complete key. A
**radix tree** compresses chains of single-child nodes into a single node holding a substring.
:::

:::why
The structure exists because a hash map destroys the information prefix queries need.

Hashing is designed so that similar keys land in unrelated buckets — that is what makes
collisions rare and lookups constant. The consequence is that "car" and "cart" have nothing to
do with each other in a hash map, so "which keys begin with 'car'" requires examining every key.
On a million-entry dictionary that is a million string comparisons for an autocomplete
keystroke.

A trie makes the prefix structural. Walking four characters lands you at the node for "cart" and
everything below it is, by construction, exactly the keys with that prefix. The query cost is the
prefix length plus the number of results — independent of how many keys the structure holds.

The same property gives longest-prefix matching, which is less obvious and more important than
autocomplete. An IP routing table holds entries like `10.0.0.0/8` and `10.1.0.0/16`, and routing
a packet means finding the *longest* matching prefix. A hash map cannot express that question at
all; a trie answers it by walking down and remembering the deepest match. Every router does
this, which is why radix tries are in every network stack.

This is the same trade as everywhere in this track, stated from the other side: hashing buys
constant-time equality by discarding structure, and a trie keeps the structure in order to answer
questions about it.
:::

:::how
```text
  LOOKUP COST

    has("cart")  → 4 node hops. Independent of how many words
                   the trie contains.

    A hash map is O(1), but the constant includes hashing the whole
    string — which is also O(length). So for lookups the two are
    closer than the notation suggests; the trie's advantage is
    elsewhere.

  PREFIX QUERY

    starts_with("ca")  → 2 hops to locate, then traverse the subtree.
                        O(|prefix| + |results|).

    Hash map equivalent: iterate ALL keys, test each with
    starts_with. O(number of keys × key length).

    On 1,000,000 keys and a 3-character prefix with 10 matches:
      trie:     3 hops + 10 results
      hash map: 1,000,000 comparisons

  LONGEST PREFIX MATCH — the routing operation

    table: 10.0.0.0/8 → A,  10.1.0.0/16 → B,  10.1.2.0/24 → C
    packet for 10.1.2.5

    Walk the bits, remembering the deepest node that had a route:
      after 8 bits  → A is a candidate
      after 16 bits → B is a better candidate
      after 24 bits → C is better still
      no further match → answer C

    One pass, and the answer is the deepest match rather than any
    match. No hash-based structure can do this, because it requires
    the prefixes to be related in the structure.

  THE MEMORY PROBLEM

    A node with a fixed array of 26 children:
      26 pointers × 8 bytes = 208 bytes per node, mostly null.
      A 100,000-word dictionary averaging 8 characters has up to
      800,000 nodes → ~166 MB for ~800 KB of text.

    Map or sorted array per node: proportional to actual children,
    typically 1-3. Slower per hop, vastly smaller.

    RADIX TREE — collapse single-child chains:

      naive:                compressed:

        t                     "test"*
        │                     /    \
        e                 "ing"*  "ed"*
        │
        s
        │
        t*
       / \
      i   e
      │   │
      n   d*
      │
      g*

      Long unique suffixes become one node, which in real
      vocabularies removes the large majority of the nodes.
```
:::

:::example
```ruby
# 1. Autocomplete with ranking, which is what you would actually ship.
class Autocomplete
  K = 10

  def initialize
    @root = { children: {}, best: [] }   # top suggestions per node
  end

  def insert(word, score)
    current = @root
    record(current, word, score)
    word.each_char do |ch|
      current = (current[:children][ch] ||= { children: {}, best: [] })
      record(current, word, score)
    end
    self
  end

  def suggest(prefix)
    current = @root
    prefix.each_char do |ch|
      current = current[:children][ch]
      return [] unless current
    end
    current[:best].map { |_score, word| word }
  end

  private

  # Keep only the top K at each node, so a query is O(|prefix|).
  def record(node, word, score)
    node[:best] << [score, word]
    node[:best].sort_by! { |score_, word_| [-score_, word_] }
    node[:best].slice!(K..)
  end
end

ac = Autocomplete.new
ac.insert('ruby', 100).insert('rails', 90).insert('rake', 50).insert('rust', 80)

ac.suggest('r')    # => ["ruby", "rails", "rust", "rake"]
ac.suggest('ru')   # => ["ruby", "rust"]
ac.suggest('x')    # => []
```

Precomputing the top K per node is the production trick: the query becomes a walk with no subtree
traversal at all, at the cost of K entries per node and a more expensive insert. Autocomplete is
read-heavy by an enormous margin, so that is the right direction to trade.

Two details. `sort_by! { [-score, word] }` sorts descending by score and then *ascending by word*
as a tie-break — necessary, not decorative, because Ruby's sort is not stable, so without the
second key two words with equal scores would swap places between runs and the suggestion list
would flicker. And `slice!(K..)` truncates to K with no length check: on an array already shorter
than K it returns `nil` and leaves the array alone, which is exactly the behaviour you want and
the reason it needs no guard.

```ruby
# 2. Word search over a board — where a trie prunes an exponential
#    search, which is its other main use.
require 'set'

def find_words(board, words)
  trie = Trie.new
  words.each { |w| trie.insert(w) }
  rows = board.size
  cols = board[0].size
  found = Set.new

  visit = lambda do |r, c, node, acc, seen|
    child = node[:children][board[r][c]]
    return unless child            # not a prefix: abandon the whole branch
    word = acc + board[r][c]
    found << word if child[:terminal]

    seen << [r, c]
    [[-1, 0], [1, 0], [0, -1], [0, 1]].each do |dr, dc|
      nr = r + dr
      nc = c + dc
      next if nr.negative? || nc.negative? || nr >= rows || nc >= cols
      next if seen.include?([nr, nc])
      visit.call(nr, nc, child, word, seen)
    end
    seen.delete([r, c])            # un-mark on the way out: other paths may use it
  end

  rows.times { |r| cols.times { |c| visit.call(r, c, trie.root, '', Set.new) } }
  found.to_a
end

board = [%w[o a a n], %w[e t a e], %w[i h k r], %w[i f l v]]
find_words(board, %w[oath pea eat rain])   # => ["oath", "eat"]
```

The trie is doing the pruning: the moment the current path is not a trie prefix, the entire
branch is abandoned. Without it you would test every path on the board against every word, which
is exponential in the path length and multiplied by the dictionary size.

The detail that makes this correct rather than merely fast is `seen.delete([r, c])` after the
loop. A cell is off-limits only for the path currently using it, not for every path — forgetting
to un-mark gives you a search that finds the first word and then mysteriously misses later ones.
That is depth-first backtracking rather than graph traversal, and the distinction is exactly the
mark-on-enqueue discussion from the graph lesson read in reverse.

```ruby
# 3. Longest prefix match, as a router does it.
def longest_prefix_match(trie, bits)
  node = trie
  best = node[:route]              # a default route, if one is registered at the root
  bits.each_char do |bit|
    node = node[:children][bit]
    break unless node
    best = node[:route] if node[:route]   # remember the deepest hit
  end
  best
end
```

`best` is carried rather than returned at the point of failure, which is the whole algorithm:
you want the most specific match that exists, so you keep overwriting as you descend and return
whatever you were last holding when the walk ran out. Starting `best` from the root's route is
how a default route falls out of the same code path instead of needing a special case.
:::

:::failure
**A fixed-size child array over a large alphabet.** 26 is tolerable; 256 for bytes or 65,536 for
Unicode code points is not. A `Map` or a small sorted array costs a few nanoseconds per hop and
saves orders of magnitude of memory.

**Forgetting `terminal`.** Without it you cannot distinguish a stored key from a prefix of one:

```ruby
trie = Trie.new.insert('cart')
trie.include?('car')      # must be false
trie.starts_with('car')   # => ["cart"]  — the walk DOES succeed
```

Without the `terminal` flag there is nothing to distinguish "this node exists because a word ends
here" from "this node exists because it is on the way to one", so `include?('car')` returns true
and your spell-checker accepts every prefix of every word in the dictionary.

**Treating a string as an array of bytes when it is Unicode.**

Ruby spares you the worst version of this. Strings are sequences of codepoints, not UTF-16 code
units, so `each_char` can never split a character in half:

```ruby
'😀'.size              # => 1      (JavaScript: "😀".length === 2)
'😀'.each_char.to_a    # => ["😀"]
```

So the surrogate-pair bug — half a character stored in the trie, the key unreachable by any sane
query — simply does not arise. What *does* still arise is that a codepoint is not what a user
thinks of as a character:

```ruby
'👨‍👩‍👧'.size                            # => 5 codepoints (three people, two joiners)
'👨‍👩‍👧'.each_grapheme_cluster.to_a.size   # => 1
'🇮🇳'.size                            # => 2 codepoints, 1 grapheme
```

Inserting a family emoji walks five levels of the trie. That is usually harmless — the word is
still findable, because lookup splits it the same way — but it breaks the moment you do anything
positional, like "delete the last character" on a backspace, which would leave a dangling joiner.

The failure that actually bites is normalisation, because the two spellings look identical:

```ruby
trie = Trie.new.insert("cafe\u0301")   # e + combining acute
trie.include?('café')                  # => false   precomposed é
trie.include?("cafe\u0301")            # => true
trie.include?('café'.unicode_normalize(:nfd))   # => true
```

Two byte sequences, one appearance, two different keys. A user who types the word on a Mac and a
user who pastes it from a web page can disagree about whether it is in your dictionary. Normalise
on the way in and on the way out — pick one form, `:nfc` is the usual choice for storage — and do
it at the boundary so the trie only ever sees one spelling. The same reasoning applies to
`downcase` for case-insensitive search: normalise once at the edge, not at every comparison.

**Building a trie to replace exact lookups.** A hash map is smaller and faster. The trie is
justified by prefix queries, not by lookups.

**Expecting it to answer suffix or substring queries.** `LIKE '%auto'` is not a prefix question,
and a trie cannot help — for suffixes, build a trie of the reversed strings; for arbitrary
substrings you need a suffix tree or suffix automaton, which are considerably more complex.

**Unbounded memory from user input.** A trie built from untrusted keys grows with the distinct
prefixes supplied, so an attacker sending random long strings allocates a node per character.
Bound the key length and the total node count.

**Not compressing when the keys are long and sparse.** A million UUIDs in a naive trie is 36
million nodes with almost no sharing after the first few characters — the worst possible case for
the structure, and the one where a radix tree or simply a hash map is the right answer.

**Rebuilding the whole structure on every change** when the keys are nearly static. Tries are
cheap to insert into incrementally; treating them as immutable and rebuilding is a common and
unnecessary cost.
:::

:::realworld
```text
// Where prefix structures run.

  IP routing tables     — radix tries (Patricia) in the Linux kernel's
                           FIB, BSD, and every hardware router. Longest
                           prefix match is the forwarding decision.
  HTTP routers          — radix trees for path matching. Go's httprouter,
                           Rails' journey, Express 5, and nginx's
                           location matching all use one, because
                           /users/:id/posts shares a prefix with
                           /users/:id/comments.
  Autocomplete          — search suggestions, editor completion, and
                           shell tab-completion.
  Spell check           — a trie plus bounded edit distance, searched
                           with pruning so that most of the dictionary
                           is never visited.
  Databases             — Redis implements its radix tree (rax) for
                           stream ids and key tracking; Postgres SP-GiST
                           supports a radix tree over text.
  Ethereum              — the Merkle Patricia trie is the state
                           structure, combining prefix compression with
                           content addressing.
  Compilers and         — keyword recognition, and Aho-Corasick for
  log scanning             matching many patterns at once is a trie
                           with failure links.
  Filesystem paths      — directory lookup is a prefix walk, which is
                           why path resolution cost is proportional to
                           depth.
```

```text
// Why LIKE 'auto%' uses an index and LIKE '%auto' does not.
//
// A B-tree index is sorted, so all keys beginning with 'auto' occupy
// one contiguous range: the planner rewrites the predicate as
//   name >= 'auto' AND name < 'autp'
// and does one descent plus a range scan.
//
// '%auto' has no such range: matching keys are scattered throughout
// the ordering, so there is no contiguous region to scan and the
// index cannot help. The fixes are a trigram index (pg_trgm), a
// full-text index, or an index on reverse(name) if the pattern is
// always a suffix.
//
// Note that this is the same property a trie has, expressed in a
// different structure: shared prefixes are adjacent, shared suffixes
// are not.
```
:::

:::mistakes
**Fixed child arrays over a large alphabet.** Use a Map or sorted array.

**No `terminal` flag.** Prefixes become false positives.

**Byte or UTF-16 indexing on Unicode text.** Split surrogate pairs, unreachable keys.

**Using a trie for exact lookups only.** A hash map is better on every axis.

**Expecting suffix or substring queries.** Different structures entirely.

**Unbounded growth from untrusted keys.** Bound length and node count.

**Naive tries for keys with no shared prefixes.** All overhead, no benefit.

**Building an in-memory trie when a database index would do.** A B-tree range scan already
answers prefix queries, without a second copy of the data to keep in sync.
:::

:::tradeoffs
**Hash map** — O(1) exact lookup, minimal memory, no prefix capability, no ordering. The default
for key-value access.

**Naive trie** — O(|key|) operations, O(|prefix| + |results|) prefix queries, sorted iteration if
children are ordered, and substantial memory overhead. Right when prefix queries matter and the
keys share prefixes.

**Radix / Patricia tree** — the same operations with far fewer nodes, at the cost of more complex
insertion and deletion because nodes split and merge. The production choice, which is why routers
and HTTP routers use it rather than a plain trie.

**Sorted array with binary search** — O(log n) lookup and prefix queries via a range scan,
minimal memory, and expensive insertion. Excellent for a static dictionary, which is more common
than people assume.

**B-tree index in a database** — prefix matching through a range scan, persistent, no duplicate
copy to maintain. Usually the right answer when the data already lives in a database.

**Suffix tree / suffix automaton** — arbitrary substring queries, which nothing above can do, at
a large cost in memory and complexity.

The decision: **exact lookups only → hash map. Prefix queries on prefix-sharing keys → radix
tree. Static dictionary → sorted array. Already in a database → use the index. Arbitrary
substrings → suffix structure, and think hard first.**
:::

:::checkpoint
1. What question can a trie answer that a hash map cannot, and why is hashing structurally
   unable to?
2. On a million keys with a 3-character prefix and 10 matches, compare the trie and hash-map
   costs.
3. Why is the `terminal` flag necessary? Give a concrete false positive without it.
4. Why is a 26-pointer child array a memory problem, and what are the two fixes?
5. What does a radix tree compress, and why is that effective on real vocabularies?
6. Why can `LIKE 'auto%'` use a B-tree index while `LIKE '%auto'` cannot?
7. A million UUIDs in a naive trie — why is this the worst case?
8. How does a trie prune the board-word-search from exponential to feasible?
:::

:::interview
Lead with the capability, framed as the consequence of hashing:

*"A trie answers prefix queries, which a hash map structurally cannot. Hashing is designed so
similar keys land in unrelated buckets — that is what makes it constant time — so 'car' and 'cart'
have no relationship in a hash map and finding all keys with a prefix means scanning every key. A
trie makes the prefix structural: walking three characters lands you on the subtree that is exactly
the matches, so the query is O(prefix + results) regardless of how many keys exist. On a million
keys that is three hops against a million comparisons."*

Then name the operation that matters more than autocomplete:

*"The one I would highlight is longest-prefix match, because it is what IP routing is. A routing
table has 10.0.0.0/8 and 10.1.0.0/16 and you need the *longest* match for a packet — you walk the
bits remembering the deepest node with a route. A hash map cannot express that question at all, and
it is why radix tries are in every network stack and every HTTP router."*

Be honest about the cost and the fix:

*"The problem is memory. A node per character with a fixed 26- or 256-entry child array is mostly
null pointers, and a 100,000-word dictionary can cost a hundred megabytes for under a megabyte of
text. Two fixes: a map or small sorted array per node, and path compression — a radix tree collapses
single-child chains into one node holding the substring, which removes most nodes in a real
vocabulary because long unique suffixes are common."*

And show you would check whether you need it: *"if the keys share few prefixes — a million UUIDs —
it is all overhead. And if the data is already in a database, a B-tree index answers prefix queries
with a range scan, which is usually better than maintaining a second copy in memory."*
:::

## What you now know

- A trie stores one node per character with shared prefixes, marked where keys end.
- It answers prefix queries in O(|prefix| + |results|), independent of the key count.
- Hashing structurally cannot do this: it scatters similar keys by design.
- Longest-prefix match — the IP routing operation — needs a trie and cannot be hashed.
- `terminal` is required, or every prefix is reported as a stored key.
- Fixed child arrays waste most of their space; use a Map or sorted array.
- A radix tree collapses single-child chains, removing most nodes in real vocabularies.
- Precomputing the top K per node makes ranked autocomplete a pure walk.
- A trie prunes exhaustive searches by abandoning any path that is not a prefix.
- Iterate by code point, not by UTF-16 unit, or you split surrogate pairs.
- Tries built from untrusted keys grow per character — bound length and node count.
- Keys with no shared prefixes are the worst case; use a hash map.
- `LIKE 'auto%'` uses an index because shared prefixes are adjacent in sorted order; `'%auto'`
  cannot.
- Suffix or substring queries need a suffix tree, not a trie.
- `node[:children][ch] ||= new_node` is the walk and the insert in one expression.
- A prefix is not a word: without a `terminal` flag every prefix tests as present.
- Ruby strings are codepoint-indexed, so `each_char` cannot split a character — the UTF-16
  surrogate bug does not exist here.
- But a codepoint is not a grapheme: a family emoji is 5 codepoints and 1 character.
- Normalisation is the real Unicode trap — `"cafe\u0301"` and `"café"` are different keys.
  Normalise at the boundary, not at each comparison.
- Per-node top-K needs an explicit tie-break, because Ruby's sort is not stable.
- `slice!(K..)` truncates safely on an array already shorter than K.
- Backtracking must un-mark cells on the way out; a cell is blocked only for the current path.
