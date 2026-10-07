---
title: Binary search trees and balance
summary: O(log n) search that becomes O(n) the moment you insert sorted data — what balancing actually fixes, and why the real world uses B-trees.
level: intermediate
minutes: 18
version: "1"
status: stable
last_reviewed: "2026-10-07"
tags: [dsa, bst, balance, avl, red-black, b-tree]
concepts: [binary-search-trees, balancing, tree-rotations, b-trees]
prerequisites: [trees, binary-search]
interview:
  - question: What is the BST invariant, and what does it buy you?
    level: intermediate
    answer: >-
      For every node, all values in its left subtree are smaller and all values in its right
      subtree are larger. That lets search discard half the remaining tree at each step, so it
      is O(h) — and O(h) is O(log n) only if the tree is balanced. It also means an in-order
      traversal emits sorted order, which is what makes range queries and "the next value after
      x" cheap. Those two properties, ordered iteration and logarithmic search, are what a hash
      table cannot give you, and they are the reason ordered trees still exist alongside hashes.
    followUps:
      - "When is the height not log n?"
  - question: What goes wrong if you insert sorted data into a plain BST?
    level: intermediate
    answer: >-
      Every value is larger than the last, so every insertion goes right and the tree becomes a
      linked list of height n. Search degrades from O(log n) to O(n), and the degradation is
      silent — the code is correct and just slow. It is also a realistic input rather than an
      adversarial one: auto-increment ids, timestamps and anything inserted in order all produce
      exactly this shape, which is why self-balancing trees are not an optimisation but the
      default.
    followUps:
      - "How does a self-balancing tree prevent it?"
  - question: Why do databases use B-trees rather than red-black trees?
    level: advanced
    answer: >-
      Because the cost that matters is the number of disk or page reads, not the number of
      comparisons. A binary tree of a billion keys is about 30 levels deep, so a lookup can be
      30 page reads. A B-tree stores hundreds of keys per node, sized to a disk page, so the
      same billion keys fit in three or four levels — three or four reads. The comparisons within
      a node are free by comparison, since the node is already in memory. It is the same
      reasoning as cache locality in arrays, one level up the memory hierarchy.
    followUps:
      - "What is the difference between a B-tree and a B+ tree?"
resources:
  - title: "CLRS — Chapter 13, Red-Black Trees"
    url: https://mitpress.mit.edu/9780262046305/introduction-to-algorithms/
---

## Search, and then the problem

```js
function search(node, target) {
  while (node) {
    if (target === node.value) return node;
    node = target < node.value ? node.left : node.right;   // discard half
  }
  return null;
}
// O(h). Note that is O(h) and not O(log n) — the distinction is
// the entire subject of this lesson.
```

```js
function insert(node, value) {
  if (!node) return new Node(value);
  if (value < node.value) node.left = insert(node.left, value);
  else if (value > node.value) node.right = insert(node.right, value);
  return node;      // equal values ignored; decide this deliberately
}

// Now insert 1, 2, 3, 4, 5 in order:
//   1
//    \
//     2
//      \
//       3
//        \
//         4
//          \
//           5
// Height 5, not log(5). This is a linked list wearing a tree's type.
```

:::what
A **binary search tree** maintains the invariant that every left descendant is smaller than
its ancestor and every right descendant is larger. A **self-balancing** BST (AVL, red-black)
additionally guarantees O(log n) height by restructuring after insertions and deletions. A
**B-tree** generalises the idea to many keys per node, which is what makes it suitable for
disk.
:::

:::why
The BST exists to make binary search work on a mutable collection.

Binary search on a sorted array is O(log n) to find and O(n) to insert, because inserting
means shifting. A BST keeps the ordering in the structure rather than in the layout, so an
insertion is a pointer assignment — O(log n) if the tree stays shallow.

That "if" is the whole story, and the reason it matters is that the bad case is not
adversarial but ordinary. Auto-increment primary keys, timestamps, alphabetical imports,
anything appended in order — all produce strictly increasing insertions, which produce a
right-leaning chain. So the realistic default input to a BST is its worst case.

Self-balancing trees exist to remove that. They accept a little extra work per insertion in
exchange for a guarantee rather than a hope, and the guarantee is what lets you put one in
production. This is a recurring shape in engineering: the structure with better average
behaviour and no worst-case bound loses to the one with a slightly worse average and a
guarantee, because you cannot reason about a system built from hopes.
:::

:::how
```text
  WHY HEIGHT IS EVERYTHING

    Balanced, n = 1,000,000:     h ≈ 20   → 20 comparisons
    Degenerate, n = 1,000,000:   h = n    → 1,000,000 comparisons

    Same code. Same invariant. 50,000× difference.


  THE ROTATION, which is the single mechanism all balancing uses

      y                               x
     / \        left rotate y        / \
    x   C      ──────────────▶      A   y
   / \         ◀──────────────         / \
  A   B         right rotate x        B   C

    Both shapes satisfy the BST invariant: A < x < B < y < C in each.
    Only the heights differ. A rotation is O(1) — three pointer
    assignments — and it is the only tool needed, because every
    imbalance reduces to one of four cases handled by one or two
    rotations.


  AVL vs RED-BLACK — the same idea, different strictness

    AVL:        |height(left) - height(right)| <= 1 at every node
                → height <= 1.44 log n
                → faster lookups, more rotations on write

    Red-Black:  no red node has a red child; every root-to-leaf path
                has the same number of black nodes
                → height <= 2 log n
                → slightly taller, fewer rotations on write

    So: read-heavy → AVL. Write-heavy → red-black. Which is why
    language standard libraries (C++ std::map, Java TreeMap) use
    red-black: a general-purpose map sees both.


  B-TREE — why disk changes the answer

    Binary, 1 billion keys:    ~30 levels  → up to 30 page reads
    B-tree, 500 keys/node:      3 levels   → 3 page reads

      [ 100 | 200 | 300 | ... | 500 keys ]     ← one 8 KB page
       /     |     |            \

    The in-node comparisons are free: the page is already in memory.
    You are optimising page fetches, not comparisons — the same
    locality argument as arrays versus linked lists, one level up.
```
:::

:::example
```js
// 1. Deletion — the operation with three cases, and the one people
//    get wrong.
function remove(node, value) {
  if (!node) return null;
  if (value < node.value) { node.left = remove(node.left, value); return node; }
  if (value > node.value) { node.right = remove(node.right, value); return node; }

  // Found it.
  if (!node.left) return node.right;      // 0 or 1 child: splice it out
  if (!node.right) return node.left;

  // Two children: replace with the in-order successor (smallest on
  // the right), then delete that successor from the right subtree.
  let succ = node.right;
  while (succ.left) succ = succ.left;
  node.value = succ.value;
  node.right = remove(node.right, succ.value);
  return node;
}
// Why the successor specifically: it is the smallest value greater
// than this node, so it is the only value that can sit here without
// violating the invariant on either side. The predecessor (largest
// on the left) works equally well, and always choosing one of them
// is itself a source of imbalance over many deletions.

// 2. Validation — and the version that looks right and is not.
function isBST_WRONG(n) {
  if (!n) return true;
  if (n.left && n.left.value >= n.value) return false;
  if (n.right && n.right.value <= n.value) return false;
  return isBST_WRONG(n.left) && isBST_WRONG(n.right);
}
//     5
//    / \
//   3   7
//      / \
//     4   8      ← 4 < 5, so it must not be in the RIGHT subtree
// Every parent-child pair is locally valid. The tree is not a BST.

function isBST(n, min = -Infinity, max = Infinity) {
  if (!n) return true;
  if (n.value <= min || n.value >= max) return false;
  return isBST(n.left, min, n.value) && isBST(n.right, n.value, max);
}
// The invariant is about ANCESTORS, not parents. Passing the
// permitted range down is how you express that.

// 3. Range query — the operation a hash table cannot do.
function range(node, lo, hi, out = []) {
  if (!node) return out;
  if (node.value > lo) range(node.left, lo, hi, out);     // prune
  if (node.value >= lo && node.value <= hi) out.push(node.value);
  if (node.value < hi) range(node.right, lo, hi, out);    // prune
  return out;
}
// The two pruning conditions are what make this O(log n + k) rather
// than O(n): whole subtrees that cannot contain matches are skipped.
```
:::

:::failure
**Sorted insertion.** The headline failure, and the common one:

```js
const tree = null;
for (let i = 1; i <= 100000; i++) insert(tree, i);
// Height 100,000. Every search is a linear scan. No error, no warning.
// The code passes every correctness test it has.
```

**Validating locally instead of against the ancestor range.** Shown above. This is the most
frequently-failed version of a very common interview question, and the reason it fails is
conceptual: the invariant constrains all descendants, not immediate children.

**Deleting by copying the wrong replacement.**

```js
// Replacing with any leaf, or with the left child, breaks the invariant.
// Only the in-order successor or predecessor is safe, because only
// they have no values between themselves and the removed node.
```

**Duplicates with no policy.** `insert` above silently ignores equal values. The alternatives
are a count on the node, a consistent side (always left), or rejecting them. Each is fine;
having no decision is not, because the behaviour then depends on insertion order.

**Floating-point or mixed-type keys.** `0.1 + 0.2 < 0.3` is true, so a tree keyed on computed
floats can contain a value its own search cannot find. Use integers or a decimal type.

**Mutating a node's key in place.** The node is now in the wrong position and is unreachable
by search — the same failure as mutating a hash key. Remove and reinsert.

**Assuming `h = log n` because the type says tree.** `O(h)` is the honest complexity of a
plain BST. Only a balancing guarantee turns it into `O(log n)`.
:::

:::realworld
```text
// Where ordered trees actually are.

  Database indexes         — B+ trees. All values in the leaves,
                              leaves linked, so a range scan is a
                              linked-list walk after one descent.
                              This is why `WHERE created_at > x`
                              can use an index and `WHERE LOWER(x)
                              = y` cannot.
  File systems             — ext4 (HTree), NTFS, APFS, btrfs
                              (B-trees, which is the name).
  std::map / TreeMap /     — red-black trees. Ordered iteration is
  SortedDict                  the feature; a hash map cannot do it.
  LSM trees                — Cassandra, RocksDB, LevelDB. Writes go
                              to a memtable (often a skip list),
                              flushed to sorted files. A different
                              trade: faster writes, reads must check
                              several files.
  Interval and range trees — collision detection, calendar overlap,
                              IP routing tables.
  Git                      — tree objects, though keyed by name
                              rather than ordered for search.
```

```text
// The choice you will actually make: hash map or ordered tree?

  Hash map                      Ordered tree (B-tree / red-black)
  ─────────────────────────     ─────────────────────────────────
  O(1) average lookup           O(log n) lookup
  O(n) worst case               O(log n) guaranteed
  no ordering at all            sorted iteration, free
  cannot do ranges              O(log n + k) range query
  cannot do "next after x"      O(log n) successor
  needs a good hash fn          needs only a comparison
  rehashing pauses              no global restructuring

  Rule: exact-match lookups only → hash. Anything involving
  order, ranges, prefixes, or "nearest" → tree.

  This is the same split as two pointers versus a hash set, and it
  is worth recognising as one idea: hashing destroys order to buy
  constant-time equality.
```
:::

:::mistakes
**Using a plain BST on ordered input.** Use a balanced tree, or shuffle, or use the language's
sorted map.

**Validating with parent comparisons.** Pass down the permitted range.

**No duplicate policy.**

**Replacing a deleted node with anything but its successor or predecessor.**

**Mutating a key in place.** Remove, change, reinsert.

**Quoting O(log n) for an unbalanced tree.** Say O(h) and then say what bounds h.

**Reaching for a BST when a hash map will do.** If you never need order, the hash is simpler
and faster.

**Implementing a red-black tree from memory in production code.** The rebalancing cases are
genuinely intricate; use the standard library. Understand rotations so you can reason about
cost, not so you can hand-roll one.
:::

:::tradeoffs
**Sorted array** — O(log n) search, O(1) indexed access, perfect locality, O(n) insertion.
Ideal for data that is built once and read many times.

**Plain BST** — O(log n) insertion and search *when balanced*, O(n) when not, and the common
input makes it not. Teaching structure, not a production one.

**AVL** — strictly balanced, so the fastest lookups, at the cost of more rotations per write.
Read-heavy workloads.

**Red-black** — slightly taller, fewer rotations per write. The general-purpose choice, which
is why standard libraries use it.

**B-tree / B+ tree** — optimised for page fetches rather than comparisons, so the only sensible
choice when the data is on disk or larger than cache. Higher constant factor in memory.

**Skip list** — probabilistic O(log n) with much simpler code and no rotations, easy to make
lock-free. Used by Redis sorted sets and LSM memtables. Expected rather than guaranteed bounds.

**Hash map** — O(1) average and no ordering. Faster for exact lookups; useless for ranges.

The decision in practice: you will almost never implement these. What you will do is choose
between a hash map and an ordered map, and decide whether your index should support range
queries. Knowing *why* the shapes differ is what makes that choice informed rather than
habitual.
:::

:::checkpoint
1. Why is search on a BST O(h) rather than O(log n)? What makes h equal log n?
2. Insert 1..5 in order into a plain BST. Draw it. What is the height?
3. The tree `5, left 3, right 7, with 7's left child 4` — every parent-child pair is valid.
   Why is it not a BST, and what does a correct validator pass down?
4. When deleting a node with two children, why must the replacement be the in-order successor
   or predecessor?
5. AVL versus red-black: which for a read-heavy workload, and why?
6. A billion keys on disk. Why does a B-tree beat a red-black tree, and by roughly how much?
7. Name two operations an ordered tree supports that a hash map cannot.
:::

:::interview
State the invariant, then immediately state the catch — that pairing is the answer:

*"Every left descendant is smaller, every right descendant is larger, so search discards half
the tree per step and is O(h). The important part is that it is O(h), not O(log n): h equals log
n only if the tree is balanced, and the input that makes it unbalanced is not adversarial — it is
auto-increment ids, timestamps, anything inserted in order. Sorted insertion produces a linked
list of height n, and it does so silently, because the code stays correct and just gets slow."*

For validation, name the conceptual error rather than the code:

*"The common mistake is comparing each node to its parent. The invariant constrains all
ancestors, not just the parent — so a value can be less than its parent and still be illegal
because it sits in some grandparent's right subtree. The correct version passes a permitted
range down and narrows it at each step."*

For the B-tree question, give the numbers:

*"Because the unit of cost is a page read, not a comparison. A binary tree over a billion keys
is about 30 levels, so up to 30 page fetches. A B-tree node holds hundreds of keys sized to a
disk page, so the same billion keys fit in three or four levels — and the comparisons inside a
node are free because the page is already in memory. It is the same locality argument as arrays
versus linked lists, one level up the hierarchy."*

And the practical framing: *"in real work I am choosing between a hash map and an ordered map,
not implementing either. The question is whether I need ranges, ordered iteration, or nearest-
value lookups — if not, the hash is simpler and faster."*
:::

## What you now know

- The BST invariant constrains all descendants, not just immediate children.
- Search is O(h); h is log n only with a balance guarantee.
- Sorted insertion degenerates a plain BST into a linked list, silently.
- Ordered input is the common case, which is why balanced trees are the default.
- A rotation is three pointer assignments and preserves the invariant while changing height.
- AVL is stricter — faster reads, more rotations. Red-black is looser — the general default.
- Deleting a two-child node requires the in-order successor or predecessor as replacement.
- Validate by passing a permitted range down, not by comparing with the parent.
- Decide a duplicate policy explicitly.
- Never mutate a key in place; remove and reinsert.
- B-trees win on disk because the cost is page fetches: 3 reads instead of 30.
- B+ trees link their leaves, which is what makes an index range scan cheap.
- Hash maps buy O(1) equality by destroying order; trees keep order and pay log n.
