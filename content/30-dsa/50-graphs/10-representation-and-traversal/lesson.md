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

```js
// Adjacency list — O(V + E) space. The default.
const graph = {
  a: ["b", "c"],
  b: ["d"],
  c: ["d"],
  d: [],
};

// Adjacency matrix — O(V²) space, O(1) edge test.
//      a  b  c  d
// a [  0, 1, 1, 0 ]
// b [  0, 0, 0, 1 ]
// c [  0, 0, 0, 1 ]
// d [  0, 0, 0, 0 ]
```

## Two traversals, one difference

```js
function bfs(graph, start) {
  const seen = new Set([start]);
  const queue = [start];
  const order = [];
  while (queue.length) {
    const node = queue.shift();        // ← FIFO
    order.push(node);
    for (const next of graph[node] ?? []) {
      if (!seen.has(next)) { seen.add(next); queue.push(next); }
    }
  }
  return order;
}

function dfs(graph, start) {
  const seen = new Set([start]);
  const stack = [start];
  const order = [];
  while (stack.length) {
    const node = stack.pop();          // ← LIFO. The only change.
    order.push(node);
    for (const next of graph[node] ?? []) {
      if (!seen.has(next)) { seen.add(next); stack.push(next); }
    }
  }
  return order;
}
```

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

    if (!seen.has(next)) { seen.add(next); queue.push(next); }

    Marking on dequeue lets a node be pushed many times before it is
    first processed — in a dense graph, O(E) copies of the same node
    in the queue. Correct output, badly wrong memory.
```
:::

:::example
```js
// 1. Shortest path in an unweighted graph, with the path itself.
function shortestPath(graph, start, goal) {
  if (start === goal) return [start];
  const prev = new Map([[start, null]]);
  const queue = [start];
  while (queue.length) {
    const node = queue.shift();
    for (const next of graph[node] ?? []) {
      if (prev.has(next)) continue;
      prev.set(next, node);
      if (next === goal) {                    // reconstruct and return
        const path = [goal];
        for (let at = node; at !== null; at = prev.get(at)) path.push(at);
        return path.reverse();
      }
      queue.push(next);
    }
  }
  return null;
}
// `prev` doubles as the visited set, which is a common simplification:
// "has a predecessor" and "has been seen" are the same condition.

// 2. Cycle detection in a DIRECTED graph — three states.
function hasCycle(graph) {
  const WHITE = 0, GREY = 1, BLACK = 2;        // unseen, in-progress, done
  const colour = new Map();

  function visit(node) {
    colour.set(node, GREY);
    for (const next of graph[node] ?? []) {
      const c = colour.get(next) ?? WHITE;
      if (c === GREY) return true;             // back edge → cycle
      if (c === WHITE && visit(next)) return true;
      // BLACK is fine: already fully explored by another route.
    }
    colour.set(node, BLACK);
    return false;
  }

  for (const node of Object.keys(graph)) {
    if ((colour.get(node) ?? WHITE) === WHITE && visit(node)) return true;
  }
  return false;
}
// The outer loop matters: a graph can be disconnected, so one DFS
// from one node may not reach everything.

// 3. Topological sort — DFS post-order, reversed.
function topoSort(graph) {
  const seen = new Set(), out = [];
  function visit(node) {
    if (seen.has(node)) return;
    seen.add(node);
    for (const next of graph[node] ?? []) visit(next);
    out.push(node);                            // POST-order
  }
  for (const node of Object.keys(graph)) visit(node);
  return out.reverse();
}
// Why post-order reversed: a node is pushed only after everything it
// depends on has been pushed, so reversing puts dependencies first.
// This is the same post-order-because-the-value-flows-upward argument
// as computing a tree's height.
// Note: this version assumes no cycles. Combine with hasCycle, or use
// Kahn's algorithm, which detects them naturally.

// 4. Kahn's algorithm — BFS-flavoured topological sort that reports
//    cycles for free.
function kahn(graph) {
  const indegree = new Map(Object.keys(graph).map((n) => [n, 0]));
  for (const node of Object.keys(graph))
    for (const next of graph[node]) indegree.set(next, indegree.get(next) + 1);

  const queue = [...indegree].filter(([, d]) => d === 0).map(([n]) => n);
  const out = [];
  while (queue.length) {
    const node = queue.shift();
    out.push(node);
    for (const next of graph[node]) {
      indegree.set(next, indegree.get(next) - 1);
      if (indegree.get(next) === 0) queue.push(next);
    }
  }
  return out.length === Object.keys(graph).length ? out : null;   // null = cycle
}
// The length check is the cycle detection: nodes in a cycle never
// reach indegree 0, so they are never enqueued.
```
:::

:::failure
**No visited set.** Infinite loop on any cycle. In a tree you can omit it; in a graph you
cannot, and "it worked on my test data" means your test data was a tree.

**Marking visited on dequeue instead of on enqueue.**

```js
while (queue.length) {
  const node = queue.shift();
  if (seen.has(node)) continue;
  seen.add(node);
  for (const next of graph[node]) queue.push(next);   // no check
}
// Correct output. The queue can hold O(E) entries — the same node
// pushed once per incoming edge. On a dense graph that is the
// difference between megabytes and gigabytes.
```

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

```js
function hasCycleUndirected(graph, node, parent, seen) {
  seen.add(node);
  for (const next of graph[node]) {
    if (next === parent) continue;            // skip the edge we came from
    if (seen.has(next)) return true;
    if (hasCycleUndirected(graph, next, node, seen)) return true;
  }
  return false;
}
// Without the parent check, every single edge reports a cycle.
// (This breaks with multi-edges between the same pair; use edge
// identity rather than node identity if those are possible.)
```

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

```js
// The production shape of this: a dependency checker.
function buildOrder(deps) {
  // deps: { "app": ["auth", "db"], "auth": ["db"], "db": [] }
  const order = kahn(deps);
  if (!order) {
    // Report WHICH cycle, not just that there is one — the three-state
    // DFS can return the grey path, which is the actionable answer.
    throw new Error("circular dependency");
  }
  return order;
}
// Worth noting: a good error message here is the difference between a
// five-minute fix and an afternoon. "Circular dependency" is nearly
// useless; "a → b → c → a" is immediately actionable, and the grey
// stack at the moment of detection is exactly that path.
```

```js
// Scale note: at a million nodes, the adjacency list is a Map of
// arrays and the visited set is a Set — but for integer-labelled
// nodes, typed arrays are dramatically better:
const seen = new Uint8Array(V);         // 1 byte per node, not a hash entry
const dist = new Int32Array(V).fill(-1);
// A Set of a million numbers is tens of megabytes; a Uint8Array is
// one. On graph-heavy code this is the difference that matters, and
// it is the same locality argument as everywhere else.
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
