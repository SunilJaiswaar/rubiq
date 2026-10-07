---
title: Binary trees and traversals
summary: Four ways to visit every node, what each one is actually for, and why "write it recursively" is the right first answer and not always the last.
level: intermediate
minutes: 18
version: "1"
status: stable
last_reviewed: "2026-10-07"
tags: [dsa, trees, recursion, traversal, bfs, dfs]
concepts: [trees, traversals, recursion, tree-height]
prerequisites: [recursion, stacks]
interview:
  - question: Name the tree traversals and say what each is used for.
    level: intermediate
    answer: >-
      Pre-order visits the node before its children, which is what you want for copying a tree
      or serialising it, because the parent must exist before the children can be attached.
      In-order visits left, node, right — on a binary search tree that yields the values in
      sorted order, which is the main reason in-order matters. Post-order visits children
      before the node, which is what you need for deleting a tree, computing sizes or heights,
      and any aggregation where the parent's answer depends on its children's. Level-order is
      breadth-first using a queue, used for anything about distance from the root — printing by
      depth, finding the shallowest node, or serialising in the format most people expect.
    followUps:
      - "Which traversal computes the height, and why does it have to be that one?"
  - question: What is the complexity of a tree traversal, in time and space?
    level: intermediate
    answer: >-
      O(n) time for all of them, since each node is visited exactly once. Space is the
      interesting part: recursive depth-first traversal uses O(h) stack where h is the height —
      O(log n) for a balanced tree and O(n) for a degenerate one. Breadth-first uses O(w) where
      w is the maximum width, which for a balanced tree is O(n/2) — so BFS uses more memory
      than DFS on a wide tree, and less on a deep one. That trade is the practical reason to
      pick one over the other when the tree is large.
    followUps:
      - "So which would you use on a very deep tree?"
  - question: Why is recursion natural for trees?
    level: basic
    answer: >-
      Because the definition is recursive: a binary tree is a node with a left subtree and a
      right subtree, each of which is a binary tree. So a function that handles "a node" plus
      two recursive calls covers every case, and the base case is the empty tree. The structure
      of the code matches the structure of the data, which is why tree code written recursively
      is usually three lines and the iterative version is fifteen. The limit is stack depth:
      Ruby's default stack is about ten thousand frames, so an unbalanced tree of a million
      nodes raises SystemStackError while an explicit stack on the heap does not — and
      SystemStackError descends from Exception rather than StandardError, so a bare rescue
      will not catch it.
    followUps:
      - "Where would you draw the line in production code?"
resources:
  - title: "CLRS — Chapter 12, Binary Search Trees"
    url: https://mitpress.mit.edu/9780262046305/introduction-to-algorithms/
---

## The structure and the four traversals

```ruby
Node = Struct.new(:value, :left, :right)

def leaf(v) = Node.new(v)   # Struct lets you omit trailing members; both stay nil

#        4
#      /   \
#     2     6
#    / \   / \
#   1   3 5   7
tree = Node.new(4,
  Node.new(2, leaf(1), leaf(3)),
  Node.new(6, leaf(5), leaf(7)))
```

```ruby
# The accumulator is a default argument, so the caller passes nothing and
# each recursive call threads the same array through.
def pre_order(n, out = [])
  return out unless n
  out << n.value
  pre_order(n.left, out)
  pre_order(n.right, out)
end

def in_order(n, out = [])
  return out unless n
  in_order(n.left, out)
  out << n.value
  in_order(n.right, out)
end

def post_order(n, out = [])
  return out unless n
  post_order(n.left, out)
  post_order(n.right, out)
  out << n.value
end

pre_order(tree)    # => [4, 2, 1, 3, 6, 5, 7]
in_order(tree)     # => [1, 2, 3, 4, 5, 6, 7]   ← sorted, because this is a BST
post_order(tree)   # => [1, 3, 2, 5, 7, 6, 4]
pre_order(nil)     # => []
```

The three recursive versions differ only in where the `out <<` sits. That is worth noticing:
the traversal order is not three algorithms, it is one algorithm and three placements.

Two Ruby details carry their weight here. `return out unless n` guards the node *and* makes
the empty tree return the accumulator rather than `nil`, so the caller never has to
special-case it. And `out << n.value` returns `out`, which is why each method's last
expression is already the answer — no explicit `return` needed at the end.

:::what
A **binary tree** is a node with at most two children. **Depth-first** traversals
(pre-/in-/post-order) go as deep as possible before backtracking, using a stack — explicit or
the call stack. **Breadth-first** (level-order) visits all nodes at one depth before the next,
using a queue. The **height** of a tree is the longest root-to-leaf path.
:::

:::why
The four traversals exist because four different kinds of question need four different orders,
and the choice is forced by the dependency direction.

**Post-order is required** whenever a node's answer depends on its children's answers. You
cannot compute a subtree's height before computing its children's heights, so the visit must
happen after the recursion returns. Same for size, sum, "is this balanced", and deleting a
tree — you must free the children before the parent, or you lose the pointers to them.

**Pre-order is required** whenever the children's processing depends on the parent. Copying a
tree needs the parent node to exist before you can attach children to it. Serialising needs
the parent written first so a reader can reconstruct in the same order.

**In-order is special to search trees.** On a BST it emits sorted order, which turns "give me
everything between 10 and 20" into a partial traversal — the operation that makes a database
index useful.

**Level-order answers questions about distance from the root**, because it reaches every node
at depth d before any node at depth d+1. That is the same property that makes BFS find
shortest paths in an unweighted graph, and it is why "shallowest leaf" is a queue problem and
not a recursion problem.

So the recognition rule is about dependency: does the parent need the children's answers
(post), do the children need the parent's (pre), do you need sorted order (in), or do you need
depth (level)?
:::

:::how
```text
        4
      /   \
     2     6
    / \   / \
   1   3 5   7

  PRE-ORDER (node, left, right) — top-down
    4 → 2 → 1 → 3 → 6 → 5 → 7
    The node is handled on the way DOWN.

  IN-ORDER (left, node, right)
    1 → 2 → 3 → 4 → 5 → 6 → 7
    Sorted, for a BST. This is not a coincidence — it is the BST
    invariant read out loud: everything left is smaller, everything
    right is larger.

  POST-ORDER (left, right, node) — bottom-up
    1 → 3 → 2 → 5 → 7 → 6 → 4
    The node is handled on the way UP, once both children are done.

  LEVEL-ORDER (breadth-first, with a queue)
    4 → 2 → 6 → 1 → 3 → 5 → 7
    Depth 0, then depth 1, then depth 2.


  WHY HEIGHT MUST BE POST-ORDER

    height(n) = 1 + max(height(n.left), height(n.right))
                     └──────── needs both children FIRST ────────┘

    There is no pre-order formulation, because the value you are
    computing flows upward. Any aggregation of that shape is
    post-order by necessity, not by choice.


  SPACE, which is where DFS and BFS actually differ

    DFS stack holds one path:        O(h)
    BFS queue holds one full level:  O(w)

    Balanced tree:  h = log n,  w = n/2
      → DFS O(log n), BFS O(n).      DFS is much better.

    Degenerate tree (a linked list): h = n,  w = 1
      → DFS O(n), BFS O(1).          BFS is much better.
```
:::

:::example
```ruby
# 1. Level-order, which needs a queue and a level boundary.
def level_order(root)
  return [] unless root
  levels = []
  queue = [root]
  until queue.empty?
    size = queue.size            # snapshot: this is one level
    level = []
    size.times do
      n = queue.shift            # O(1) in Ruby — see the queues lesson
      level << n.value
      queue << n.left if n.left
      queue << n.right if n.right
    end
    levels << level
  end
  levels
end

level_order(tree)   # => [[4], [2, 6], [1, 3, 5, 7]]

# The `size` snapshot before the inner loop is the whole trick. Without
# it you cannot tell where one level ends, because you are appending to
# the same queue you are consuming. `size.times` reads better than a
# counting loop and makes the snapshot impossible to forget — the count
# is fixed the moment the block starts.

# 2. Height — post-order by necessity.
def height(n)
  return 0 unless n
  1 + [height(n.left), height(n.right)].max
end

# Ruby has no two-argument Math.max; `[a, b].max` is the idiom, and it
# extends to n children without changing shape — which matters the day
# the tree stops being binary.

# 3. Is it balanced? The naive version is O(n²) because it recomputes
#    heights; returning height and balance together makes it O(n).
#    -1 is the "unbalanced" sentinel, carried in the return value.
def balanced_height(n)
  return 0 unless n
  l = balanced_height(n.left)
  return -1 if l == -1
  r = balanced_height(n.right)
  return -1 if r == -1
  return -1 if (l - r).abs > 1
  1 + [l, r].max
end

def balanced?(root) = balanced_height(root) != -1

# Carrying the failure in the return value is a pattern worth keeping:
# it avoids a second traversal and avoids an exception for control flow.
# Ruby cannot nest a `def` inside a `def` usefully, so the helper is a
# sibling method rather than a closure — and the `?` suffix on the public
# one signals the predicate, while the helper returning an Integer does
# not get a `?`.

# 4. Iterative in-order, for when recursion depth is a risk.
def in_order_iterative(root)
  out = []
  stack = []
  node = root
  while node || !stack.empty?
    while node                   # go left
      stack << node
      node = node.left
    end
    node = stack.pop
    out << node.value
    node = node.right            # then right
  end
  out
end
```
:::

:::failure
**Recursion on a degenerate tree.**

```ruby
# Values inserted in sorted order produce this:
#   1 → 2 → 3 → 4 → ... → 1,000,000
# Height is n, not log n, so the recursive traversal overflows the stack.
#
# Measured on ruby 3.4.5, default main-thread stack: a trivial
# self-recursive method reaches about 10,000 frames before
# SystemStackError. A method whose frame holds more — several locals, a
# block — reaches fewer; the recursive BST `insert` in the next lesson
# dies at about 9,400. So "roughly ten thousand" is the number to carry,
# and it shrinks as the frame grows fatter.
#
# The part that catches people in production:
begin
  deep_traversal(tree)
rescue => e                     # bare rescue == rescue StandardError
  # never runs
end
# SystemStackError inherits from Exception directly, NOT StandardError,
# so a bare `rescue` does not catch it. Neither does the `rescue_from
# StandardError` in your ApplicationController. You have to name it:
#
#   rescue SystemStackError
#
# And catching it is a poor plan anyway: the stack is already exhausted,
# so the handler itself has very little room to run in. Bound the depth
# instead.
```

**Forgetting the level boundary in BFS.** Without the `size` snapshot you get every value in
breadth-first order with no indication of where levels divide — and attempts to detect it by
comparing values or counting total nodes are fragile.

**Using the wrong traversal for the dependency direction.**

```ruby
# "Sum each subtree and store it on the node" — post-order.
# Attempting it pre-order means the parent's sum is computed before
# the children's, so it is wrong, and the code looks fine.
```

**Null checks on the child instead of the node.**

```ruby
# Wrong: asks about the children instead of the node it was handed.
def size(n)
  left  = n.left  ? size(n.left)  : 0
  right = n.right ? size(n.right) : 0
  1 + left + right
end
size(tree)   # => 7      — passes every test written against a real tree
size(nil)    # NoMethodError: undefined method 'left' for nil

# Right: guard the node you were handed.
def size(n)
  return 0 unless n
  1 + size(n.left) + size(n.right)
end
size(nil)    # => 0

# Guarding the node rather than the children also removes the need to
# check both children separately, which halves the branches. In Ruby the
# wrong version is especially tempting because `n.left ? ... : 0` reads
# so naturally — and `n&.left` would have made it *worse*, silently
# returning 1 for an empty tree instead of raising.
```

**Height off by one.** Decide whether an empty tree has height 0 or -1 and whether a single
node has 1 or 0, then be consistent. Most "balanced" bugs are this.

**O(n²) from recomputing.** Calling `height()` inside a traversal that itself visits every
node is quadratic. Compute once on the way up and return it, as `balanced_height` does.

**Mutating while traversing.** Deleting nodes during a pre-order walk removes the pointers you
were about to follow. Deletion is post-order for exactly that reason.
:::

:::realworld
```text
// Trees are not an interview topic. They are the shape of most
// hierarchical data you touch.

  File systems            — directories, and `du` is a post-order
                             traversal (a directory's size needs its
                             children's sizes first).
  Abstract syntax trees   — Ruby's own parser, and every tool built on
                             it. RuboCop walks an AST; `on_send` is a
                             visitor callback on a pre-order traversal.
                             Prism gives you the tree directly.
  ERB and view rendering  — a layout containing partials containing
                             partials. Rendering is pre-order (the
                             parent's buffer must exist first).
  JSON and YAML           — parsed into a tree; serialising is pre-order.
  Nested params           — `params[:order][:items][0][:sku]` is a tree
                             walk, and `deep_merge` / `deep_symbolize_keys`
                             are recursive traversals you call daily.
  ActiveRecord includes   — `includes(posts: :comments)` is a preload
                             tree; the query planner walks it.
  Database indexes        — B-trees, where in-order traversal is what
                             makes a range query cheap.
  Git                     — a commit points at a tree object, which
                             points at blobs and subtrees.
  The DOM                 — Nokogiri's `css` and `xpath` are traversals;
                             so is every Capybara `within` block.
  Org charts, categories, comment threads (`acts_as_tree`), decision
  trees, routing tables (tries), and the call stack itself.
```

```ruby
require 'json'

# The one production detail that matters most: input-controlled depth.
# A deeply nested payload is a denial of service against any recursive
# parser or validator — the attacker spends a few kilobytes and you spend
# a stack.
#
# For JSON specifically, Ruby already did this for you:
JSON.parse('[' * 120 + ']' * 120)
# JSON::NestingError: nesting of 101 is too deep
#
# `max_nesting` defaults to 100, and you can tighten it at the boundary:
JSON.parse(body, max_nesting: 20)
# JSON::NestingError: nesting of 21 is too deep

# Note that Rails does NOT give you this on params. ActionDispatch parses
# request JSON with its own settings, and `params` arrives as a nested
# hash you then walk yourself — so the bound you want is on YOUR
# recursive code:
MAX_DEPTH = 20

def depth_of(value, level = 1)
  raise ArgumentError, 'nested too deeply' if level > MAX_DEPTH

  case value
  when Hash  then value.values.map { |v| depth_of(v, level + 1) }.max || level
  when Array then value.map { |v| depth_of(v, level + 1) }.max || level
  else level
  end
end

# What NOT to do — counting brackets in the raw string:
#
#   text.each_char { |c| depth += 1 if c == '[' || c == '{' }
#
# It over-counts brackets that are inside string values. The payload
# {"a": "[[[[["} has a real depth of 1 and this counter reports 6, so you
# reject valid requests. Measure the structure after parsing, or let the
# parser enforce it — do not re-implement a lexer by accident.
```
:::

:::mistakes
**Recursing on a tree whose depth is input-controlled.** Bound the depth, or use an explicit
stack. `SystemStackError` is not a `StandardError`, so your usual rescue will not see it.

**Guarding children rather than the node.** Guard the node; it is simpler and correct for the
empty tree. Reaching for `&.` here hides the bug instead of fixing it — `n&.left` makes an
empty tree return a wrong answer rather than raising.

**Inconsistent height convention.** Pick one, write it down.

**Recomputing height inside a traversal.** O(n²). Return the value upward instead.

**Missing the level snapshot in BFS** when levels matter.

**Choosing a traversal by habit.** Let the dependency direction choose: parent needs children
→ post-order; children need parent → pre-order; sorted → in-order; depth → level.

**Assuming in-order gives sorted output on any binary tree.** It does so only on a BST, where
it is the invariant restated.

**Deleting nodes during a pre-order walk.** You destroy the pointers you are about to follow.
:::

:::tradeoffs
**Recursive DFS** — shortest, clearest code, matches the data's own definition. Costs O(h)
call-stack space and fails outright on deep trees.

**Iterative DFS with an explicit stack** — same O(h) space on the heap rather than the stack,
so no overflow, and noticeably more code. The right choice when depth is unbounded or
attacker-controlled.

**BFS with a queue** — answers depth questions directly, and costs O(w) space, which on a
balanced tree is O(n/2) — worse than DFS. Better than DFS only on deep, narrow trees.

**Morris traversal** — O(1) space in-order by temporarily rewriting right pointers back up the
tree. Genuinely clever, mutates the tree during traversal, and almost never worth it; know it
exists so you can answer "can you do better than O(h) space".

**Storing aggregates on nodes** (subtree size, height) — makes queries O(1) and every mutation
must maintain them, which is the normalisation trade from schema design in a different setting.

The default that is right most of the time: **recursive DFS**, with a depth bound at any
boundary where the input is not yours.
:::

:::checkpoint
1. Why must height be computed post-order? Give the formula and point at the dependency.
2. Pre-, in-, post- and level-order on the tree at the top — give all four sequences.
3. For a balanced tree of a million nodes, what are DFS and BFS space costs? For a degenerate
   one?
4. What does the `size` snapshot do in `level_order`, and what breaks without it?
5. Why is the naive `balanced?` O(n²), and what single change fixes it?
6. Why does in-order give sorted output on a BST but not on an arbitrary binary tree?
7. Why is a deeply nested JSON payload a denial-of-service vector, and what does
   `JSON.parse` already do about it?
8. Why does `rescue => e` fail to catch a `SystemStackError`?
:::

:::interview
Answer the traversal question by use, not by name — anyone can recite the orders:

*"Pre-order handles the node on the way down, so it is for copying and serialising, where the
parent has to exist before the children can attach. Post-order handles it on the way up, so it
is for anything where the parent's answer depends on its children's — height, size, deletion.
In-order on a BST yields sorted order, which is the BST invariant read out loud and is what
makes a range query cheap. Level-order uses a queue and answers questions about distance from
the root."*

Give the space analysis, because it is the part people skip:

*"All four are O(n) time. The difference is space: DFS holds one path, so O(h), and BFS holds
one level, so O(w). On a balanced tree that is O(log n) against O(n/2), so DFS wins clearly. On
a degenerate tree it inverts — height n, width 1 — so BFS wins. Which means the answer to
'which traversal uses less memory' is 'what shape is the tree'."*

Then the production note, which is where this stops being an exercise:

*"Recursion is my default because the code matches the data's definition, but I bound depth
wherever the input is not mine. Ruby gives me about ten thousand frames, so a deeply nested
payload is a few kilobytes that costs me a stack overflow — and `SystemStackError` is not a
`StandardError`, so it sails straight past the rescue I thought I had. `JSON.parse` already
bounds nesting at 100, which is the right shape of fix: enforce the limit at the boundary
rather than making every traversal iterative."*
:::

## What you now know

- The three DFS orders differ only in where the visit sits relative to the recursive calls.
- Post-order is required when a parent's answer depends on its children's — height, size,
  deletion.
- Pre-order is required when the children's handling depends on the parent — copying,
  serialising.
- In-order yields sorted output on a BST, which is the invariant restated.
- Level-order uses a queue and answers questions about depth.
- All traversals are O(n) time. DFS is O(h) space, BFS is O(w).
- Balanced: DFS O(log n) beats BFS O(n/2). Degenerate: BFS O(1) beats DFS O(n).
- Guard the node you were handed, not its children.
- Snapshot `queue.size` before consuming a level, so BFS can tell where levels divide.
- Return aggregates upward instead of recomputing them — that is the O(n²) → O(n) fix.
- Recursion is the right default; bound the depth whenever the input is untrusted.
- Ruby gives roughly 10,000 stack frames, fewer as each frame grows fatter.
- `SystemStackError` is not a `StandardError` — `rescue => e` will not catch it.
- `JSON.parse` already enforces `max_nesting: 100`; tighten it rather than counting brackets.
- `return out unless n` guards the node and keeps the empty tree returning a usable value.
