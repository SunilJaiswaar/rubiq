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

```js
class Trie {
  #root = { children: new Map(), isWord: false };

  insert(word) {
    let node = this.#root;
    for (const ch of word) {
      if (!node.children.has(ch)) node.children.set(ch, { children: new Map(), isWord: false });
      node = node.children.get(ch);
    }
    node.isWord = true;
  }

  has(word) {
    const node = this.#walk(word);
    return node !== null && node.isWord;
  }

  // The operation that justifies the structure.
  startsWith(prefix) {
    const node = this.#walk(prefix);
    if (!node) return [];
    const out = [];
    const collect = (n, acc) => {
      if (n.isWord) out.push(acc);
      for (const [ch, child] of n.children) collect(child, acc + ch);
    };
    collect(node, prefix);
    return out;
  }

  #walk(s) {
    let node = this.#root;
    for (const ch of s) {
      node = node.children.get(ch);
      if (!node) return null;
    }
    return node;
  }
}
```

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
     t*        * = isWord

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

    startsWith("ca")  → 2 hops to locate, then traverse the subtree.
                        O(|prefix| + |results|).

    Hash map equivalent: iterate ALL keys, test each with
    startsWith. O(number of keys × key length).

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
```js
// 1. Autocomplete with ranking, which is what you would actually ship.
class Autocomplete {
  #root = { children: new Map(), best: [] };     // top suggestions per node

  insert(word, score) {
    let node = this.#root;
    this.#record(node, word, score);
    for (const ch of word) {
      if (!node.children.has(ch)) {
        node.children.set(ch, { children: new Map(), best: [] });
      }
      node = node.children.get(ch);
      this.#record(node, word, score);
    }
  }

  // Keep only the top K at each node, so a query is O(|prefix|).
  #record(node, word, score) {
    node.best.push([score, word]);
    node.best.sort((a, b) => b[0] - a[0]);
    if (node.best.length > 10) node.best.length = 10;
  }

  suggest(prefix) {
    let node = this.#root;
    for (const ch of prefix) {
      node = node.children.get(ch);
      if (!node) return [];
    }
    return node.best.map(([, w]) => w);
  }
}
// Precomputing the top K per node is the production trick: the query
// becomes a walk with no subtree traversal at all, at the cost of
// K entries per node and a more expensive insert. Autocomplete is
// read-heavy by an enormous margin, so that is the right direction
// to trade.

// 2. Word search over a board — where a trie prunes an exponential
//    search, which is its other main use.
function findWords(board, words) {
  const trie = new Trie();
  for (const w of words) trie.insert(w);
  const found = new Set();
  // DFS the board, walking the trie in parallel. The moment the
  // current path is not a trie prefix, the whole branch is abandoned.
  // Without the trie you would test every path against every word.
  // This is the pruning that makes the search feasible.
  return [...found];
}

// 3. Longest prefix match, as a router does it.
function longestPrefixMatch(trie, bits) {
  let node = trie.root, best = null;
  for (const bit of bits) {
    node = node.children.get(bit);
    if (!node) break;
    if (node.route) best = node.route;    // remember the deepest hit
  }
  return best;
}
```
:::

:::failure
**A fixed-size child array over a large alphabet.** 26 is tolerable; 256 for bytes or 65,536 for
Unicode code points is not. A `Map` or a small sorted array costs a few nanoseconds per hop and
saves orders of magnitude of memory.

**Forgetting `isWord`.** Without it you cannot distinguish a stored key from a prefix of one:

```js
trie.insert("cart");
trie.has("car");    // must be false. Without isWord, the walk
                    // succeeds and you return true.
```

**Treating a string as an array of bytes when it is Unicode.**

```js
for (const ch of "café") { ... }     // 4 iterations — code points
for (let i = 0; i < s.length; i++)   // UTF-16 code units: "😀".length === 2
// Splitting a surrogate pair puts half a character in the trie, and
// the key becomes unreachable by any sane query. Use iteration over
// code points, or over grapheme clusters if users will type them.
```

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

**No `isWord` flag.** Prefixes become false positives.

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
3. Why is `isWord` necessary? Give a concrete false positive without it.
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
- `isWord` is required, or every prefix is reported as a stored key.
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
