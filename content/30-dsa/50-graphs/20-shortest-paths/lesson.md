---
title: Shortest paths with weights
summary: Dijkstra as BFS with a priority queue, exactly why negative edges break it, and the two algorithms that handle what it cannot.
level: advanced
minutes: 19
version: "1"
status: stable
last_reviewed: "2026-10-07"
tags: [dsa, graphs, dijkstra, bellman-ford, a-star]
concepts: [dijkstra, greedy-algorithms, negative-weights, heuristics]
prerequisites: [bfs, heaps]
interview:
  - question: Explain Dijkstra's algorithm.
    level: advanced
    answer: >-
      It is BFS with a priority queue instead of a plain queue. You keep a tentative distance
      for every node, repeatedly take the unfinalised node with the smallest tentative
      distance, and relax its outgoing edges — if going through it gives a shorter route to a
      neighbour, record that. The key claim is that when a node is popped, its distance is
      final: since every edge is non-negative, no path through any node still in the queue
      could be shorter, because all of those already have a distance at least as large. With a
      binary heap it is O((V + E) log V).
    followUps:
      - "Where exactly does that argument use non-negativity?"
  - question: Why does Dijkstra fail with negative edges?
    level: advanced
    answer: >-
      The correctness argument is that a finalised node can never be improved later, which
      relies on every future path being at least as long as the current minimum. A negative
      edge breaks that: a node popped with distance 5 can later be reached via a node of
      distance 7 followed by an edge of -4, giving 3. Dijkstra has already finalised it and
      will not revisit, so the answer is simply wrong — and it is wrong silently. Bellman-Ford
      handles negative edges by relaxing every edge V-1 times, which is O(V·E), and detects
      negative cycles as a bonus: if anything still improves on the Vth pass, a negative cycle
      exists.
    followUps:
      - "Why V-1 passes specifically?"
  - question: What does A* add to Dijkstra?
    level: advanced
    answer: >-
      A heuristic estimate of the remaining distance to the goal, added to the known distance
      when ordering the queue. That makes the search expand nodes that look promising rather
      than expanding uniformly in all directions, which on a map is dramatically fewer nodes.
      The heuristic must be admissible — never overestimate the true remaining cost — or the
      result can be suboptimal. Straight-line distance is admissible for road networks because
      no road is shorter than a straight line. With a zero heuristic, A* is exactly Dijkstra.
    followUps:
      - "What happens if the heuristic overestimates?"
resources:
  - title: "Red Blob Games — Introduction to A*"
    url: https://www.redblobgames.com/pathfinding/a-star/introduction.html
---

## From BFS to Dijkstra

```js
// BFS: the queue is FIFO, so nodes come out in hop order.
const node = queue.shift();

// Dijkstra: the queue is a min-heap on distance, so nodes come out
// in cost order. That one substitution is the whole algorithm.
const [dist, node] = heap.pop();
```

```js
function dijkstra(graph, start) {
  // graph: { a: [["b", 4], ["c", 1]], ... }  — [neighbour, weight]
  const dist = new Map([[start, 0]]);
  const done = new Set();
  const heap = new MinHeap((x, y) => x[0] - y[0]);
  heap.push([0, start]);

  while (heap.size) {
    const [d, node] = heap.pop();
    if (done.has(node)) continue;        // a stale entry; skip it
    done.add(node);                      // d is now FINAL for node

    for (const [next, w] of graph[node] ?? []) {
      const candidate = d + w;
      if (candidate < (dist.get(next) ?? Infinity)) {
        dist.set(next, candidate);
        heap.push([candidate, next]);    // lazy deletion: push a duplicate
      }
    }
  }
  return dist;
}
```

:::what
**Dijkstra's algorithm** finds shortest paths from one source in a graph with **non-negative**
weights, by repeatedly finalising the nearest unfinalised node. **Bellman-Ford** does the same
with negative weights allowed, more slowly, and detects negative cycles. **A\*** is Dijkstra
plus a heuristic that biases the search towards a specific goal.
:::

:::why
BFS works because every edge costs 1, so arrival order *is* distance order. The moment edges
have different costs, those two orders separate: a path of three edges costing 1 each beats one
edge costing 10, and BFS cannot see that.

Dijkstra restores the property by changing what the queue orders on. If you always expand the
cheapest known frontier node, then you are once again processing nodes in increasing order of
true distance, and the same argument applies — the first time a node is finalised, it is by a
cheapest route.

Spelling out where that argument uses non-negativity is worth doing, because it is the one
thing people recite without understanding. Suppose we pop node `u` with tentative distance
`d(u)`, and suppose some shorter path to `u` exists. That path must leave the finalised set at
some point, through a node `v` still in the queue. But `v`'s tentative distance is at least
`d(u)` — that is why `u` was popped first — and the remaining edges from `v` to `u` contribute
a non-negative amount. So the alternative path costs at least `d(u)`. Contradiction.

Remove non-negativity and the last step fails: the remaining edges could contribute a negative
amount, so a path through a *further* node can be *shorter*. That is not an edge case to patch;
it invalidates the algorithm's central claim, which is why you need a genuinely different
algorithm rather than a tweak.
:::

:::how
```text
      a
    4/ \1
    b   c
    2\ /5
      d

  Dijkstra from a:

    pop (0, a)   final a=0    relax: b=4, c=1
    pop (1, c)   final c=1    relax: d = 1+5 = 6
    pop (4, b)   final b=4    relax: d = 4+2 = 6  (not better, 6 = 6)
    pop (6, d)   final d=6

  BFS from a would have said d is 2 hops either way and picked
  arbitrarily. Dijkstra evaluates the cost.


  WHY NEGATIVE EDGES BREAK IT

      a ──5──▶ b
      │        ▲
      7        │
      ▼       -4
      c ───────┘

    pop a (0). relax: b=5, c=7.
    pop b (5). FINALISED at 5.
    pop c (7). relax: b = 7 + (-4) = 3.

    But b was finalised at 5 and is never reconsidered.
    The true answer is 3. Dijkstra reports 5, with no error.


  BELLMAN-FORD — relax everything, V-1 times

    A shortest path visits at most V nodes, so it has at most V-1
    edges. One full pass over all edges guarantees that every
    shortest path of length 1 is correct; the second pass fixes
    length 2; after V-1 passes, every shortest path is correct
    regardless of the order edges happen to be examined in.

    Then one more pass: if anything STILL improves, some path can be
    shortened indefinitely — a negative cycle. That detection is
    free, and it is why Bellman-Ford is used for currency arbitrage
    and for distance-vector routing.

    O(V · E). Much slower, and it answers a question Dijkstra cannot.


  A* — Dijkstra with a sense of direction

    Dijkstra orders by:   g(n)              cost so far
    A* orders by:         g(n) + h(n)       cost so far + estimate

    Dijkstra expands a circle around the start.
    A* expands an ellipse stretched towards the goal.

         Dijkstra                A*
        ░░░░░░░░░             ░░░
       ░░░░S░░░░░G           ░░S░░░░░░G
        ░░░░░░░░░             ░░░

    If h is ADMISSIBLE (never overestimates), A* is optimal.
    If h = 0, A* is exactly Dijkstra.
    If h overestimates, A* is faster and may return a worse path —
    which is sometimes an acceptable trade, and must be a decision.
```
:::

:::example
```js
// 1. Dijkstra with the path, and with lazy deletion explained.
function dijkstraPath(graph, start, goal) {
  const dist = new Map([[start, 0]]);
  const prev = new Map();
  const done = new Set();
  const heap = new MinHeap((x, y) => x[0] - y[0]);
  heap.push([0, start]);

  while (heap.size) {
    const [d, node] = heap.pop();
    if (done.has(node)) continue;
    if (node === goal) break;              // early exit: it is final
    done.add(node);

    for (const [next, w] of graph[node] ?? []) {
      if (d + w < (dist.get(next) ?? Infinity)) {
        dist.set(next, d + w);
        prev.set(next, node);
        heap.push([d + w, next]);
      }
    }
  }

  if (!dist.has(goal)) return null;
  const path = [];
  for (let at = goal; at !== undefined; at = prev.get(at)) path.push(at);
  return { cost: dist.get(goal), path: path.reverse() };
}
// Two details worth naming. The early exit is valid precisely because
// a popped node is final — without that guarantee you could not stop.
// And `heap.push` on improvement rather than decrease-key is "lazy
// deletion": the heap may hold several entries per node, and the
// `done` check discards the stale ones. It makes the heap O(E) rather
// than O(V), which is a worthwhile trade for not needing an indexed
// heap.

// 2. Bellman-Ford, with negative cycle detection.
function bellmanFord(nodes, edges, start) {
  const dist = new Map(nodes.map((n) => [n, Infinity]));
  dist.set(start, 0);

  for (let i = 0; i < nodes.length - 1; i++) {
    let changed = false;
    for (const [u, v, w] of edges) {
      if (dist.get(u) + w < dist.get(v)) { dist.set(v, dist.get(u) + w); changed = true; }
    }
    if (!changed) break;                   // converged early
  }

  for (const [u, v, w] of edges) {
    if (dist.get(u) + w < dist.get(v)) return { negativeCycle: true };
  }
  return { dist };
}

// 3. A*, which is five lines different from Dijkstra.
function aStar(graph, start, goal, h) {
  const g = new Map([[start, 0]]);
  const done = new Set();
  const heap = new MinHeap((x, y) => x[0] - y[0]);
  heap.push([h(start, goal), start]);

  while (heap.size) {
    const [, node] = heap.pop();
    if (node === goal) return g.get(goal);
    if (done.has(node)) continue;
    done.add(node);

    for (const [next, w] of graph[node] ?? []) {
      const candidate = g.get(node) + w;
      if (candidate < (g.get(next) ?? Infinity)) {
        g.set(next, candidate);
        heap.push([candidate + h(next, goal), next]);   // f = g + h
      }
    }
  }
  return null;
}
// For a grid: h = Manhattan distance when movement is 4-directional,
// Euclidean when movement is free. Using Euclidean on a 4-directional
// grid still works (it underestimates) but prunes less.
```
:::

:::failure
**Dijkstra with any negative edge.** Wrong answer, no error. Worth noting that "all weights are
distances so they cannot be negative" is often wrong in practice — a cost model that includes
discounts, refunds, or energy recovered on a downhill produces negative edges.

**Reprocessing finalised nodes.** Without the `done` check, stale heap entries cause repeated
relaxation. The result stays correct for non-negative weights but the work grows.

**`decrease-key` assumed to exist.** Standard library heaps do not support it. Lazy deletion —
push a new entry and skip stale pops — is the standard workaround and is what the code above
does.

**Early exit on the wrong event.** You may stop when the goal is *popped*, not when it is first
*reached*. Reaching it only gives a tentative distance:

```js
if (next === goal) return dist.get(next);   // WRONG — tentative
// A cheaper route through a node still in the heap may exist.
```

**Mutating a key held in the heap.** Same failure as everywhere else: the entry is in the wrong
position. Lazy deletion sidesteps this by never mutating.

**Fewer than V-1 Bellman-Ford passes.** The bound comes from a shortest path having at most
V-1 edges. Fewer passes can leave distances un-propagated, depending on edge order — so it may
appear to work on one input and fail on another.

**An inadmissible A\* heuristic.** If `h` can overestimate, the path returned may not be
optimal:

```js
// A road network where h is straight-line distance × 1.5 to "account
// for roads not being straight". This overestimates, so A* may commit
// to a worse route. It is also much faster, which is why games do it
// deliberately — but it must be a decision, not an accident.
```

**Float accumulation.** Summing many floating-point weights introduces error, so two genuinely
equal paths may compare unequal and the tie-break becomes arbitrary. Use integers where you can
— cents, metres, milliseconds.
:::

:::realworld
```text
// Where these run.

  Dijkstra       — network routing (OSPF link-state), telephony, and
                    the inner loop of most logistics software.
  A*             — game pathfinding, robot navigation, and every
                    consumer mapping product (with contraction
                    hierarchies layered on top, because A* alone is
                    still too slow for continental road networks).
  Bellman-Ford   — distance-vector routing (RIP, and BGP's logic is
                    related), and currency arbitrage detection, where
                    a negative cycle in log-prices is literally free
                    money.
  Floyd-Warshall — all-pairs shortest paths, O(V³), fine for a few
                    hundred nodes. Used for transitive closure and
                    for precomputing small distance matrices.
  Johnson's      — all-pairs with negative edges: reweight using
                    Bellman-Ford, then run Dijkstra from each node.
```

```js
// Arbitrage detection, because it is the clearest example of why
// "negative cycle" is a useful thing to be able to detect.
//
// A cycle of exchanges multiplies to > 1 if it is profitable:
//     USD → EUR → GBP → USD  with product 1.02
// Taking -log of each rate turns multiplication into addition, so a
// product > 1 becomes a sum < 0 — a negative cycle.
const edges = rates.map(([from, to, rate]) => [from, to, -Math.log(rate)]);
const result = bellmanFord(currencies, edges, "USD");
if (result.negativeCycle) console.log("arbitrage exists");
// The transform is the interesting part: it converts a multiplicative
// question into an additive one so an existing algorithm applies.
// That move — change the representation so a known tool fits — is
// worth more than the algorithm itself.
```

```text
// Scale note. Dijkstra on a continental road network — tens of
// millions of nodes — is too slow for interactive use even with A*.
// Production routing engines precompute:
//   - contraction hierarchies: add shortcut edges so long-distance
//     queries skip most of the detail
//   - multi-level overlays, like only considering motorways once you
//     are far from the endpoints
// The algorithms here are the foundation, not the whole answer. Worth
// knowing so you do not claim Dijkstra scales to Google Maps.
```
:::

:::mistakes
**Dijkstra with negative edges.** Use Bellman-Ford. Check your cost model for discounts and
refunds before assuming non-negativity.

**Returning as soon as the goal is reached.** Stop when it is popped.

**Omitting the `done` check.** Stale heap entries get reprocessed.

**Expecting `decrease-key`.** Use lazy deletion.

**Too few Bellman-Ford passes.** V-1, and the early-exit-on-no-change is a safe optimisation.

**Forgetting that a negative *cycle* makes "shortest path" meaningless.** There is no shortest
path, because you can always go round again. Detecting it is the correct answer, not a
workaround.

**An inadmissible heuristic** when you need optimality.

**Floating-point weights** where integers would do.

**Claiming Dijkstra scales to a road network.** Real routing engines precompute hierarchies.
:::

:::tradeoffs
**BFS** — O(V + E), correct only when all weights are equal. Use it when they are; it is far
simpler.

**Dijkstra** — O((V + E) log V) with a binary heap, requires non-negative weights, gives exact
single-source shortest paths. The default for weighted graphs.

**Dijkstra with a Fibonacci heap** — O(E + V log V) in theory; constant factors usually make
binary heaps faster in practice. A good example of asymptotics not settling the question.

**Bellman-Ford** — O(V·E), handles negative weights, detects negative cycles. Slower by a large
factor, and sometimes the only correct option.

**A\*** — the same guarantees as Dijkstra given an admissible heuristic, with dramatically fewer
nodes expanded when the heuristic is informative. Requires a goal and a meaningful distance
estimate, so it does not apply to abstract graphs.

**Floyd-Warshall** — O(V³) for all pairs, trivially simple to implement, fine up to a few
hundred nodes. Beats running Dijkstra V times when the graph is dense.

**Precomputation (contraction hierarchies)** — microsecond queries at the cost of a long build
and staleness when the graph changes. The only approach that works at road-network scale.

The decision: **equal weights → BFS. Non-negative weights, one source → Dijkstra. Negative
weights → Bellman-Ford. A specific goal with a distance estimate → A\*. All pairs on a small
dense graph → Floyd-Warshall.**
:::

:::checkpoint
1. What single substitution turns BFS into Dijkstra?
2. Reconstruct the argument that a popped node's distance is final. Where exactly does it use
   non-negativity?
3. Give a four-node graph where Dijkstra returns the wrong answer, and say what it returns.
4. Why V-1 passes in Bellman-Ford, and what does a Vth improving pass prove?
5. Why must you wait until the goal is *popped* rather than first reached?
6. What is lazy deletion, and which problem does it avoid?
7. A* with h = 0 is what? With an overestimating h?
8. Why does taking -log of exchange rates turn arbitrage into a negative-cycle problem?
:::

:::interview
Define Dijkstra by its relationship to BFS — it is the clearest framing and shows you see the
structure:

*"It is BFS with a priority queue instead of a FIFO queue. BFS works because every edge costs 1,
so arrival order is distance order; once weights differ, those come apart. Ordering the frontier
by accumulated cost restores the property, so when a node is popped its distance is final."*

Then prove the claim, because that is what the question is really asking:

*"The argument is: suppose a shorter path to the popped node u exists. It has to leave the
finalised set through some node v still in the queue, and v's tentative distance is at least
d(u) — that is why u was popped first — and the rest of the path adds a non-negative amount. So
the alternative is at least d(u). Contradiction. The non-negativity is load-bearing in that last
step: with a negative edge, a path through a further node can be shorter, which is why a node
popped at 5 can later turn out to be 3. Dijkstra never revisits it, so the answer is wrong and
silent."*

Add an implementation detail that shows you have written it:

*"In practice I use lazy deletion rather than decrease-key, since standard heaps do not support
decrease-key — push a new entry on improvement and skip stale pops with a `done` set. That makes
the heap O(E) instead of O(V), which is a fair trade for not maintaining an indexed heap. And the
early exit has to be on *popping* the goal, not on reaching it, because reaching it only gives a
tentative distance."*
:::

## What you now know

- Dijkstra is BFS with a min-priority queue ordered on accumulated cost.
- A popped node's distance is final, and the proof depends on non-negative weights.
- With a negative edge, a node finalised at 5 can later be reachable at 3 — silently wrong.
- Bellman-Ford relaxes all edges V-1 times, because a shortest path has at most V-1 edges.
- A Vth pass that still improves proves a negative cycle exists.
- With a negative cycle, "shortest path" has no meaning; detection is the answer.
- Stop when the goal is popped, not when it is first reached.
- Lazy deletion replaces `decrease-key`: push duplicates, skip stale pops.
- A* orders by g + h; admissible h gives optimality, h = 0 gives Dijkstra.
- An overestimating heuristic is faster and may return a worse path — a legitimate decision.
- Use integer weights where possible to avoid float accumulation.
- Taking -log turns a multiplicative arbitrage question into a negative-cycle question.
- Real routing engines precompute hierarchies; Dijkstra alone does not scale to a continent.
