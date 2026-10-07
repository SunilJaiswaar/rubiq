---
title: Graphs, BFS and DFS
summary: Two traversals that differ by one line, why that line decides whether you get shortest paths, and the visited set that separates a working algorithm from an infinite loop.
level: intermediate
minutes: 20
version: "1"
status: stable
last_reviewed: "2026-10-07"
tags: [dsa, graphs, bfs, dfs, topological-sort]
concepts: [graphs, bfs, dfs, cycle-detection, topological-sort]
prerequisites: [stacks, trees]
interview:
  - question: What is the difference between BFS and DFS, and when does it matter?
    level: intermediate
    answer: >-
      Mechanically they are the same loop with a different container: BFS uses a queue, DFS a
      stack. The consequence is that BFS visits every node at distance d before any at
      distance d+1, so it finds shortest paths in an unweighted graph — DFS does not, because
      it commits to one branch and may reach a node by a long route first. DFS is the right
      choice when you need the path structure: cycle detection, topological sort, and anything
      where "what is currently on the stack" is meaningful. Space differs too: BFS holds a
      frontier, which can be most of the graph, while DFS holds one path.
    followUps:
      - "Why does BFS give shortest paths but Dijkstra is needed for weights?"
  - question: Adjacency list or adjacency matrix?
    level: intermediate
    answer: >-
      A list for almost everything. It costs O(V + E) space and iterating a node's neighbours
      is proportional to its degree, which is what traversals do constantly. A matrix costs
      O(V²) regardless of edge count, so on a million nodes it is a trillion entries — but it
      answers "is there an edge from a to b" in O(1) and is the right choice for dense graphs
      or when you need that test in a tight loop. The deciding question is density: if E is
      close to V², the matrix is competitive; if E is closer to V, the list wins by orders of
      magnitude.
    followUps:
      - "Which does a social network use?"
  - question: How do you detect a cycle in a directed graph?
    level: advanced
    answer: >-
      DFS with three states rather than two: unvisited, in-progress, and done. If you reach a
      node that is in-progress, you have found a back edge to something still on the current
      path, which is a cycle. Reaching a node that is merely done is fine — that is a
      different route to an already-explored subgraph. The two-state version is the common bug:
      with only "visited" you cannot distinguish a cycle from a diamond, so it reports cycles
      in acyclic graphs. In an undirected graph the rule is different: track the parent, because
      the edge you arrived on always leads back.
    followUps:
      - "How does that relate to topological sort?"
resources:
  - title: "Sedgewick & Wayne — Algorithms, Chapter 4"
    url: https://algs4.cs.princeton.edu/40graphs/
---

## Two representations

```ruby
# Adjacency list — O(V + E) space. The default.
graph = {
  a: %i[b c],
  b: %i[d],
  c: %i[d],
  d: [],
}

# Adjacency matrix — O(V²) space, O(1) edge test.
#      a  b  c  d
# a [  0, 1, 1, 0 ]
# b [  0, 0, 0, 1 ]
# c [  0, 0, 0, 1 ]
# d [  0, 0, 0, 0 ]
```

A Ruby-specific warning before any of the traversals, because it is the bug you will actually
write. The tempting way to avoid a `nil` for a node with no listed edges is an auto-vivifying
Hash:

```ruby
graph = Hash.new { |h, k| h[k] = [] }

graph.keys          # => [:a]
graph[:typo]        # => []      looks harmless
graph.keys          # => [:a, :typo]      ← it added the key
```

The default *block* runs on a miss and assigns, so merely looking at a node inserts it. During
a traversal that means the graph grows as you walk it, `graph.size` changes under you, and a
loop over `each_key` can raise `RuntimeError: hash modified during iteration`. Use
`graph.fetch(node, [])`, which returns the default without storing it — that is the honest
translation of `graph[node] ?? []`, and it is what every traversal below uses.

## Two traversals, one difference

```ruby
require 'set'

def bfs(graph, start)
  seen = Set[start]
  queue = [start]
  order = []
  until queue.empty?
    node = queue.shift                 # ← FIFO, and O(1) in Ruby
    order << node
    graph.fetch(node, []).each do |nxt|
      next if seen.include?(nxt)
      seen << nxt
      queue << nxt
    end
  end
  order
end

def dfs(graph, start)
  seen = Set[start]
  stack = [start]
  order = []
  until stack.empty?
    node = stack.pop                   # ← LIFO. The only change.
    order << node
    graph.fetch(node, []).each do |nxt|
      next if seen.include?(nxt)
      seen << nxt
      stack << nxt
    end
  end
  order
end

bfs(graph, :a)   # => [:a, :b, :c, :d]
dfs(graph, :a)   # => [:a, :c, :d, :b]
```

`Set[start]` is the literal constructor — shorter than `Set.new([start])` and the form worth
knowing. And `next` inside the block is Ruby's `continue`: it skips to the next neighbour, not
out of the method. That collision of keywords is worth being deliberate about, which is why
the neighbour variable here is `nxt` rather than `next`.

One line differs, and it changes which problems the function can solve.

:::what
A **graph** is a set of nodes and edges. Edges may be **directed** or not, **weighted** or
not. **BFS** explores by distance from the start using a queue; **DFS** explores one branch to
exhaustion using a stack. A **visited set** is required in both, because unlike a tree a graph
can reach the same node by several routes — including a cycle.
:::

:::why
Graphs matter because most real problems are graphs once you look.

Dependencies between modules, build targets, or database migrations. Social connections.
Routes on a map. States in a workflow and the transitions between them. Foreign keys. A
filesystem with symlinks. Service calls in a distributed system. Imports in a codebase. Each
of these looks like a bespoke problem and is in fact "walk a graph", which means the two
traversals above solve a surprising proportion of them.

The reason the queue-versus-stack distinction deserves emphasis is that it is not a style
choice — it is a correctness property. BFS dequeues nodes in non-decreasing order of distance
from the start, so the first time it reaches a node, it has arrived by a shortest route. That
is a proof, and it is what makes "fewest hops" a BFS problem. DFS has no such property: it
might reach a neighbour of the start after a thousand steps around a long cycle.

Conversely DFS's stack *is* the current path, which makes it the only natural tool for
questions about paths — is there a cycle, in what order can these be built, which nodes are
reachable without passing through x. Choosing the wrong one does not produce a slower answer;
it produces a wrong one.
:::

:::how
```text
  a ── b ── d
  │         │
  └── c ────┘

  BFS from a:            DFS from a (stack, right-first due to pop):
    queue [a]              stack [a]
    visit a, push b,c      visit a, push b,c
    queue [b,c]            stack [b,c]
    visit b, push d        visit c, push d
    queue [c,d]            stack [b,d]
    visit c                visit d
    queue [d]              stack [b]
    visit d                visit b

    a b c d                a c d b

  DISTANCES — why BFS is special

    BFS dequeues in non-decreasing distance order:
      a(0) → b(1), c(1) → d(2)

    The first time BFS reaches a node, that is its shortest distance.
    Proof sketch: the queue always holds nodes of distance d then d+1
    and nothing else, so nothing of distance d+2 can be dequeued
    before all of distance d+1.

    DFS reached d via c in this run and might have reached it via a
    10-step detour in a different graph. There is no guarantee.


  THE VISITED SET — not an optimisation

    a → b → a → b → a ...

    Without `seen`, a cycle is an infinite loop. In a TREE you can
    omit it because there is exactly one path to each node; in a
    graph you cannot. This is the single most common graph bug.

  MARK WHEN ENQUEUED, NOT WHEN DEQUEUED

    next if seen.include?(nxt)
    seen << nxt
    queue << nxt

    Marking on dequeue lets a node be pushed many times before it is
    first processed — in a dense graph, O(E) copies of the same node
    in the queue. Measured on a 60-node complete graph: a peak queue
    of 3,481 entries instead of 60, for identical output. Correct
    result, badly wrong memory.
```
:::

:::example
```ruby
# 1. Shortest path in an unweighted graph, with the path itself.
def shortest_path(graph, start, goal)
  return [start] if start == goal
  prev = { start => nil }
  queue = [start]
  until queue.empty?
    node = queue.shift
    graph.fetch(node, []).each do |nxt|
      next if prev.key?(nxt)
      prev[nxt] = node
      if nxt == goal                          # reconstruct and return
        path = [goal]
        at = node
        while at
          path << at
          at = prev[at]
        end
        return path.reverse
      end
      queue << nxt
    end
  end
  nil
end

shortest_path(graph, :a, :d)   # => [:a, :b, :d]

# `prev` doubles as the visited set, which is a common simplification:
# "has a predecessor" and "has been seen" are the same condition. Note
# `prev.key?(nxt)` rather than `prev[nxt]` — the start node's
# predecessor is nil, so a truthiness test would re-visit it forever.

# 2. Cycle detection in a DIRECTED graph — three states.
def cycle?(graph)
  colour = {}                                 # nil = unseen

  visit = lambda do |node|
    colour[node] = :grey                      # in progress
    graph.fetch(node, []).each do |nxt|
      case colour[nxt]
      when :grey then return true             # back edge → cycle
      when nil   then return true if visit.call(nxt)
      end                                     # :black is fine: already explored
    end
    colour[node] = :black                     # done
    false
  end

  graph.each_key.any? { |node| colour[node].nil? && visit.call(node) }
end

cycle?(graph)                        # => false
cycle?({ a: [:b], b: [:c], c: [:a] })   # => true
cycle?({ a: [] , b: [:c], c: [:b] })    # => true — a different component

# Symbols beat integer constants here: `:grey` needs no legend. And the
# outer `any?` matters — a graph can be disconnected, so one DFS from one
# node may not reach everything.
#
# Ruby cannot nest a `def`, so the recursive helper is a lambda. Two
# reasons it must be a lambda and not a proc: `return` inside a lambda
# returns from the lambda, which is what the `when :grey then return true`
# needs, and a lambda checks its arity. A `proc` would make that `return`
# try to return from `cycle?` itself.

# 3. Topological sort — DFS post-order, reversed.
def topo_sort(graph)
  seen = Set.new
  out = []
  visit = lambda do |node|
    next if seen.include?(node)               # `next` exits the lambda
    seen << node
    graph.fetch(node, []).each { |nxt| visit.call(nxt) }
    out << node                               # POST-order
  end
  graph.each_key { |node| visit.call(node) }
  out.reverse
end

topo_sort(graph)   # => [:a, :c, :b, :d]  — one of several valid orders

# Why post-order reversed: a node is pushed only after everything it
# depends on has been pushed, so reversing puts dependencies first. This
# is the same post-order-because-the-value-flows-upward argument as
# computing a tree's height.
#
# Note: this version assumes no cycles. Combine it with `cycle?`, or use
# Kahn's algorithm, which detects them naturally.

# 4. Kahn's algorithm — BFS-flavoured topological sort that reports
#    cycles for free.
def kahn(graph)
  indegree = graph.each_key.to_h { |n| [n, 0] }
  graph.each_value { |nexts| nexts.each { |n| indegree[n] += 1 } }

  queue = indegree.select { |_, d| d.zero? }.keys
  out = []
  until queue.empty?
    node = queue.shift
    out << node
    graph.fetch(node, []).each do |nxt|
      indegree[nxt] -= 1
      queue << nxt if indegree[nxt].zero?
    end
  end
  out.size == graph.size ? out : nil          # nil = cycle
end

kahn(graph)                              # => [:a, :b, :c, :d]
kahn({ a: [:b], b: [:c], c: [:a] })      # => nil

# The size check is the cycle detection: nodes in a cycle never reach
# indegree 0, so they are never enqueued. `each_key.to_h { ... }` builds
# the counter in one pass — and note that `indegree[n] += 1` on a node
# that appears only as a target would raise on nil, which is precisely
# why every node must be a key in the graph Hash. A graph that lists only
# nodes with outgoing edges is a malformed input, and this is where you
# find out.
```
:::

:::failure
**No visited set.** Infinite loop on any cycle. In a tree you can omit it; in a graph you
cannot, and "it worked on my test data" means your test data was a tree.

**Marking visited on dequeue instead of on enqueue.**

```ruby
until queue.empty?
  node = queue.shift
  next if seen.include?(node)
  seen << node
  graph.fetch(node, []).each { |nxt| queue << nxt }   # no check
end
```

The output is correct. The queue is not: it can hold O(E) entries, because the same node gets
pushed once per incoming edge. Measured on a 60-node complete graph — 3,540 edges — the
late-checking version's queue peaked at **3,481 entries** against the early-checking version's
60. The results were identical. On a dense graph at scale that is the difference between
megabytes and gigabytes, and nothing about the output tells you it is happening.

**Two-state cycle detection on a directed graph.**

```text
    a → b → d
    └→ c → d

  With only a `visited` set: DFS visits a, b, d, then from c reaches
  d, finds it visited, and reports a cycle.
  There is no cycle. This is a diamond.

  Three states distinguish "on the current path" (GREY, a real cycle)
  from "finished" (BLACK, just another route).
```

**Using the directed rule on an undirected graph.** In an undirected graph every edge appears
twice, so the edge you arrived on always leads back to a visited node:

```ruby
def cycle_undirected?(graph, node, parent, seen)
  seen << node
  graph.fetch(node, []).each do |nxt|
    next if nxt == parent                     # skip the edge we came from
    return true if seen.include?(nxt)
    return true if cycle_undirected?(graph, nxt, node, seen)
  end
  false
end

cycle_undirected?({ a: %i[b c], b: %i[a c], c: %i[a b] }, :a, nil, Set.new)   # => true
cycle_undirected?({ a: [:b], b: %i[a c], c: [:b] }, :a, nil, Set.new)         # => false
```

Without the parent check every single edge reports a cycle, because an undirected edge appears
in both nodes' lists. Passing `nil` as the initial parent works because no node is ever `nil`.

This also breaks with multi-edges between the same pair: two distinct edges from `a` to `b` *are*
a cycle, and the parent check suppresses it. If parallel edges are possible, track edge identity
rather than node identity.

**Forgetting disconnected components.** One traversal from one start node reaches only its
component. Any "for the whole graph" question needs an outer loop over all nodes.

**BFS on a weighted graph.** BFS counts edges, not weight, so it returns the path with the
fewest hops rather than the lowest cost. Three cheap edges can beat one expensive one, and BFS
will not find that. That is what Dijkstra is for.

**Topological sort on a graph with a cycle.** The DFS version silently produces an ordering
that is not valid. Kahn's catches it by construction, which is a good reason to prefer it when
the input is not known to be acyclic.

**Recursive DFS on a large graph.** Depth can be V. Use an explicit stack when V is large or
input-controlled.
:::

:::realworld
```text
// Where you have already used these without calling them graphs.

  Dependency resolution  — npm, bundler, cargo: a topological sort,
                            and "circular dependency detected" is
                            three-state DFS reporting a back edge.
  Build systems          — make, bazel: topological order of targets.
  Database migrations    — ordered by dependency, and Rails' schema
                            load is a topological walk.
  Rails autoload         — a circular require is a cycle in the
                            import graph.
  Garbage collection     — mark phase is a graph traversal from roots.
  Spreadsheet formulas   — recalculation order is a topological sort;
                            "circular reference" is cycle detection.
  Social graphs          — "people you may know" is BFS at depth 2.
  Route planning         — Dijkstra / A* on a weighted graph.
  Terraform / k8s        — resource dependency DAGs.
  Git                    — the commit DAG; `git log --topo-order` is
                            literally named after this.
  Deadlock detection     — a cycle in the waits-for graph, which is
                            exactly what Postgres does before killing
                            a transaction.
```

```ruby
# The production shape of this: a dependency checker.
class CircularDependency < StandardError; end

def build_order(deps)
  # deps: { app: %i[auth db], auth: %i[db], db: [] }
  kahn(deps) || raise(CircularDependency, 'circular dependency')
end
```

A good error message here is the difference between a five-minute fix and an afternoon.
"Circular dependency" is nearly useless. `app → auth → db → app` is immediately actionable, and
the grey path at the moment of detection *is* that answer — so the three-state DFS is worth
keeping around purely for its error message, even when Kahn's algorithm is doing the sorting.

If this shape feels familiar it is because you have met it: `rails db:migrate` ordering, Bundler
resolving a dependency graph, Zeitwerk autoloading a constant that needs a constant that needs
the first one, and `ActiveRecord` callbacks that touch an association whose callback touches
back. Rails' own "Circular dependency detected while autoloading constant" is this algorithm
reporting a grey edge.

```ruby
# Scale note. At a million nodes the visited Set is the thing that hurts,
# and Ruby has no typed arrays to reach for. Measured on ruby 3.4.5 for
# a million integer-labelled nodes:
#
#   Set of 1M Integers           ~31 MB     resident
#   Array.new(1_000_000, false)    8.0 MB   (8 bytes per slot, exactly)
#   String of 1M bytes             1.0 MB   (1 byte per node)
#   Integer used as a bitmask      125 KB   (1 bit per node)
#
# For integer-labelled nodes an Array of booleans is the pragmatic
# default — four times smaller than the Set, and faster, because an
# index is not a hash lookup:
seen = Array.new(v, false)
dist = Array.new(v, -1)

# When even that matters, a String is a byte buffer with no object
# overhead per element:
seen = +"\0" * v
seen.setbyte(i, 1)
seen.getbyte(i) == 1

# And Ruby's arbitrary-precision Integers are a bitset for free, which
# is the smallest option by a wide margin:
seen = 0
seen |= (1 << i)                  # mark
(seen >> i) & 1 == 1              # test
#
# The catch is that each `|=` builds a whole new Integer, so filling a
# bitmask one bit at a time allocates heavily even though the final
# object is 125 KB. Use it for a set you build once and query often, not
# one you mutate in a loop.
#
# The ordinary answer is still the Set. Reach for these when the node
# count is in the millions and you have measured — which, in a Rails
# application, is usually the point at which the graph should be a
# recursive CTE in PostgreSQL instead.
```
:::

:::mistakes
**No visited set.** Infinite loop.

**Marking on dequeue.** O(E) queue growth.

**Two-state cycle detection on a directed graph.** False positives on diamonds.

**No parent check on an undirected graph.** Every edge looks like a cycle.

**Only traversing from one start.** Misses other components.

**BFS for weighted shortest paths.** Wrong answer; use Dijkstra.

**Topological sort without cycle detection.** Silently invalid output.

**Recursive DFS on a deep graph.** Stack overflow.

**A `Set` for a million integer nodes** when a typed array would do. Correct, and
unnecessarily expensive.

**Assuming `graph[node]` exists.** A node with no outgoing edges may be missing from the
adjacency structure entirely. `graph[node] ?? []`.
:::

:::tradeoffs
**Adjacency list** — O(V + E) space, neighbour iteration proportional to degree, O(degree)
edge test. Right for sparse graphs, which is almost all real ones.

**Adjacency matrix** — O(V²) space, O(1) edge test, excellent locality, and trivially supports
matrix algorithms. Right for dense graphs and small V.

**Edge list** — O(E) space, terrible for traversal, and exactly what Kruskal's algorithm wants
because it sorts edges. Also the natural format on disk.

**BFS** — shortest paths in unweighted graphs, level structure, O(V + E) time and O(frontier)
space, which can be most of the graph.

**DFS** — path structure, cycles, topological order, O(V + E) time and O(depth) space.
Recursive version is shorter and risks overflow.

**Kahn's algorithm** — topological sort that detects cycles by construction and gives a BFS-ish
order. Needs indegrees computed first.

**Three-state DFS** — detects cycles *and* can report the cycle itself from the grey path,
which is the difference between a useless error message and an actionable one.

The decision that covers most cases: **unweighted shortest path → BFS. Anything about paths,
cycles or ordering → DFS. Weighted shortest path → Dijkstra. Connectivity with no path needed →
union-find.** And store it as an adjacency list unless you have measured a reason not to.
:::

:::checkpoint
1. BFS and DFS differ by one line. Which, and what property does it give BFS that DFS lacks?
2. Why must the visited set exist for a graph but not for a tree?
3. Why mark a node visited on enqueue rather than on dequeue? What is the cost of getting it
   wrong?
4. Draw `a→b→d, a→c→d`. Why does two-state cycle detection report a cycle here?
5. In an undirected graph, why does every edge look like a cycle without a parent check?
6. Why is topological sort DFS *post*-order reversed?
7. How does Kahn's algorithm detect a cycle without any extra bookkeeping?
8. A weighted graph where three cheap edges beat one expensive edge. What does BFS return?
:::

:::interview
Give the mechanical difference and then the consequence, because the consequence is the point:

*"Same loop, different container — a queue for BFS, a stack for DFS. The consequence is that BFS
dequeues nodes in non-decreasing distance order, so the first time it reaches a node it has
arrived by a shortest route. That is a guarantee, which is why 'fewest hops' is a BFS problem.
DFS has no such property — it commits to a branch and could reach a neighbour of the start after
a thousand steps. But DFS's stack *is* the current path, which makes it the right tool for
cycles, topological order, and anything where what is on the stack is meaningful."*

The cycle-detection question has a specific trap, so name it:

*"Three states, not two: unvisited, in-progress, done. Reaching an in-progress node is a back
edge to something on the current path, so that is a cycle. Reaching a finished node is just
another route into an already-explored subgraph. With only a visited flag you cannot tell those
apart, so a diamond — a→b→d and a→c→d — gets reported as a cycle. And in an undirected graph the
rule is different again: every edge appears twice, so you track the parent and skip the edge you
arrived on."*

Then something that shows production thinking:

*"One thing I would add in real code: when I detect a cycle I report the cycle, not just its
existence. The grey stack at the moment of detection is exactly the path, and 'a → b → c → a' is
the difference between a five-minute fix and an afternoon of bisecting."*
:::

## What you now know

- BFS and DFS are the same loop; the queue-versus-stack choice is a correctness property.
- BFS reaches nodes in non-decreasing distance order, so it finds unweighted shortest paths.
- DFS's stack is the current path, which is what cycles and topological order need.
- A visited set is mandatory for graphs — a cycle is otherwise an infinite loop.
- Mark on enqueue, not on dequeue, or the queue grows to O(E).
- Directed cycle detection needs three states; two states report diamonds as cycles.
- Undirected cycle detection needs a parent check, since every edge appears twice.
- Traverse from every node, or you miss disconnected components.
- Topological sort is DFS post-order reversed, for the same reason tree height is post-order.
- Kahn's algorithm detects cycles by construction: nodes in a cycle never reach indegree 0.
- BFS counts edges, not weight — use Dijkstra when edges have costs.
- Adjacency list for sparse graphs, matrix for dense, edge list for sorting edges.
- Report the cycle path, not just its existence.
- Typed arrays beat Sets for integer-labelled nodes at scale.
