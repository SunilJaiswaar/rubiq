---
title: Designing an HTTP API
summary: Resources, versioning, pagination and errors — the four decisions that are expensive to change later, and how to make each one once.
level: intermediate
minutes: 19
version: "1"
status: stable
last_reviewed: "2026-10-07"
tags: [http, api-design, rest, versioning, pagination]
concepts: [rest, api-versioning, pagination, error-design]
prerequisites: [http-methods, status-codes]
interview:
  - question: What makes an API RESTful, and does it matter?
    level: intermediate
    answer: >-
      Strictly, Fielding's constraints: client-server, stateless, cacheable, a uniform interface,
      layered, and optionally code-on-demand — with hypermedia as the part almost nobody
      implements. In practice "RESTful" has come to mean resource-oriented URLs with HTTP methods
      and status codes used for their actual meanings, and that looser definition is the one worth
      caring about. What matters is not the label but the consequence: if you use the protocol's
      semantics, every layer between you and the client — caches, proxies, client libraries,
      monitoring — behaves correctly without being configured. Tunnelling everything through
      `POST /api` with a verb in the body means none of them can help.
    followUps:
      - "So when is REST the wrong shape?"
  - question: Offset pagination or cursor pagination?
    level: intermediate
    answer: >-
      Cursor, for anything that matters. Offset pagination is `LIMIT 20 OFFSET 10000`, which makes
      the database count and discard ten thousand rows, so later pages get progressively slower.
      It is also incorrect under concurrent writes: if a row is inserted before page two is
      fetched, one item shifts across the boundary and the client sees it twice or not at all.
      A cursor encodes the last row's sort key, so the query becomes `WHERE (created_at, id) <
      (...) LIMIT 20` — index-friendly, constant time per page, and stable under inserts. The cost
      is that you cannot jump to page 50.
    followUps:
      - "Why does the cursor need the id as well as the timestamp?"
  - question: How would you version an API?
    level: intermediate
    answer: >-
      The honest first answer is to avoid needing to: additive changes — new optional fields, new
      endpoints — do not require a version, and most changes can be made additive. When a breaking
      change is genuinely necessary, a version in the URL path is the most practical option
      because it is visible in logs, easy to route, and trivial for a client to pin. Header-based
      versioning is more theoretically correct and harder to debug and cache. What matters more
      than the mechanism is the policy: how long old versions are supported, how clients find out,
      and whether you can see which clients are still on which version.
    followUps:
      - "What counts as a breaking change?"
resources:
  - title: "RFC 9457 — Problem Details for HTTP APIs"
    url: https://www.rfc-editor.org/rfc/rfc9457.html
---

## Resources, not procedures

```http
# Procedures over HTTP: the protocol is a transport and nothing else.
POST /api  {"action": "getUser", "id": 42}
POST /api  {"action": "deleteUser", "id": 42}
# No caching (POST), no idempotency, every response is 200, and
# monitoring cannot tell a read from a destructive write.

# Resources: the protocol carries meaning.
GET    /users/42          → 200, cacheable, safe, retryable
DELETE /users/42          → 204, idempotent
PATCH  /users/42          → 200, partial update
GET    /users/42/orders   → 200, a sub-collection
```

:::what
A **resource** is a thing with an identity and a URL. The **uniform interface** means the same
small set of methods applies to every resource, so a client that understands one endpoint
understands all of them. **Versioning**, **pagination** and **error format** are the three
decisions that are hardest to change after clients exist.
:::

:::why
The argument for resource orientation is not aesthetic. It is that HTTP already has a cache, a
retry model, a status vocabulary and an idempotency contract, and all of them are keyed on the
method and the URL.

Use them, and a `GET /users/42` is automatically cacheable by a CDN, retryable by a client
library, prefetchable, and visible in monitoring as a read. Tunnel it through `POST /api` with an
action name in the body, and none of that is available — every call is an uncacheable,
unretryable, indistinguishable 200, and you will eventually reimplement caching and retries
yourself, badly, inside your own protocol.

The three hard decisions are hard for a different reason: they are *contracts*. A field you can
add. A pagination model you cannot change without breaking every client that walks pages. So the
useful discipline is to get those three right early and leave everything else flexible — which is
roughly the opposite of how API design is usually prioritised, where people argue about URL
pluralisation and leave error formats to emerge.
:::

:::how
```text
  URL SHAPE — the conventions that carry their weight

    /users                    collection
    /users/42                 member
    /users/42/orders          sub-collection scoped to a member
    /orders/991               that order's canonical URL too
    /users/42/orders/991      ...so do not require the long form

    Nest one level at most. /users/42/orders/991/items/7/returns/3
    is a URL nobody can construct and a route nobody can maintain,
    and the nesting adds no information once an id is globally
    unique.

    Plural collections, lowercase, hyphens not underscores:
    /shipping-addresses, not /ShippingAddress or /shipping_addresses.
    This is a convention rather than a principle; consistency is
    what matters.

  WHAT BREAKS A CLIENT, AND WHAT DOES NOT

    Safe (additive):
      + a new optional field in a response
      + a new optional request parameter
      + a new endpoint
      + a new value in an enum IF clients were told to ignore unknowns

    Breaking:
      − removing or renaming a field
      − changing a type ("42" → 42)
      − making an optional parameter required
      − changing a status code for the same condition
      − changing the default sort order or page size
      − tightening validation
      − a new enum value if clients switch exhaustively on it

    That last pair is worth noting: whether an enum addition breaks
    clients depends on what you told them to do with unknowns, which
    is why the documentation is part of the contract.

  PAGINATION — the two models

    OFFSET
      GET /users?page=3&per_page=20
      → LIMIT 20 OFFSET 40

      Lets you jump to any page, and:
        - the database counts and discards OFFSET rows, so page 500
          is 500 times the work of page 1
        - a row inserted before page 2 shifts the boundary, so the
          client sees an item twice or misses it entirely

    CURSOR
      GET /users?limit=20&after=eyJjcmVhdGVkX2F0IjoiMjAy...

      → WHERE (created_at, id) < ($1, $2)
        ORDER BY created_at DESC, id DESC
        LIMIT 20

      Constant cost per page, stable under inserts, index-friendly.
      Cannot jump to page 50, and the cursor must be opaque so you
      can change its contents later.

      The id in the sort key is not optional: with duplicate
      timestamps, ordering by created_at alone is non-deterministic,
      so rows can be skipped or repeated at page boundaries.
```
:::

:::example
```json
// A machine-readable error format. RFC 9457 if you want a standard;
// the important thing is that it is consistent and parseable.
HTTP/1.1 422 Unprocessable Content
Content-Type: application/problem+json

{
  "type": "https://api.example.com/errors/validation",
  "title": "Validation failed",
  "status": 422,
  "detail": "2 fields are invalid",
  "instance": "/orders",
  "errors": [
    { "field": "email", "code": "invalid_format", "message": "must be an email" },
    { "field": "items", "code": "too_few",       "message": "at least one item" }
  ]
}
```

Three things make that usable rather than decorative. There is a stable machine `code` per error,
so a client can branch on it without string-matching a message. The field is named, so a form can
show the error in the right place. And the status code is accurate, so infrastructure that reads
only the status still behaves correctly.

```json
// A paginated response, with the client told how to continue.
{
  "data": [ { "id": "991" }, { "id": "990" } ],
  "page": {
    "next": "/orders?limit=20&after=eyJ0cyI6MTcyODI5...",
    "has_more": true
  }
}
// Returning the next URL rather than raw cursor fields means you can
// change the cursor's encoding without touching any client. Note the
// absence of a total count: computing it is a second full scan, so
// make it optional and off by default.
```

```http
# Versioning, and the thing that matters more than the mechanism.
GET /v1/users/42
Sunset: Wed, 01 Jul 2027 00:00:00 GMT
Deprecation: true
Link: </v2/users/42>; rel="successor-version"
# Standard headers announcing the end date, so a client can detect
# deprecation automatically instead of reading a blog post.
#
# And the operational half: log the version and client identifier on
# every request, so "can we remove v1" is a query rather than a
# guess. Without that you will never be confident enough to delete
# anything.
```

```http
# Idempotency for unsafe operations, which is what makes a client's
# retry safe.
POST /payments
Idempotency-Key: 7f3a9c21-4b2e-4d1a-9e88-1c2b3a4d5e6f

# Server: store the key with the response for 24 hours. A repeat with
# the same key returns the stored response instead of charging again.
# Without this, every network timeout on a payment endpoint is a
# support ticket.
```
:::

:::failure
**Offset pagination on a large, growing table.** Both problems at once:

```sql
-- Page 500 of a feed:
SELECT * FROM posts ORDER BY created_at DESC LIMIT 20 OFFSET 10000;
-- The database produces 10,020 rows and throws away 10,000.
-- Meanwhile three posts were created, so the boundary moved and the
-- client sees duplicates. Users report "the feed repeats itself",
-- which sounds like a frontend bug and is not.
```

**A cursor that is not opaque.**

```json
"next_cursor": "created_at=2026-10-07T10:00:00Z&id=991"
// Clients will parse it, construct their own, and depend on the
// format. Now you cannot change the sort key. Base64-encode it, or
// return a full URL, so it is clearly not yours to interpret.
```

**Versioning everything from day one.** `/v1/` on an API with one client, where every change
could have been additive, produces a `/v2/` that differs by one field and twice the code to
maintain. Prefer additive change; version when you genuinely cannot.

**Error messages as the only machine signal.**

```json
{"error": "Email has already been taken"}
// The client must string-match to behave differently, so changing
// the wording breaks integrations and translating it is impossible.
// Give a stable code alongside the human message.
```

**Leaking internals in errors.**

```json
{"error": "PG::UniqueViolation: duplicate key value violates unique
constraint \"index_users_on_email\" at /app/models/user.rb:42"}
// Schema names, file paths and library versions, handed to anyone.
// Log the detail, return a code and a safe message.
```

**Inconsistent shapes between endpoints.** One returns `{data: [...]}`, another a bare array, a
third `{users: [...]}`. Every client needs per-endpoint code, which is exactly what a uniform
interface was supposed to prevent.

**A `total` count on every list response.** `SELECT COUNT(*)` with the same filters is a second
full scan, often more expensive than the page itself. Make it opt-in, or return a bounded
estimate.

**Unbounded `limit`.** `?limit=1000000` is an outage someone can request. Clamp it, document the
maximum, and return the effective value.

**PATCH with unclear semantics.** Does `{"tags": []}` clear the tags, or is an omitted field left
alone and an explicit empty array meaningful? Both readings are defensible, so say which one you
implement — JSON Merge Patch and JSON Patch are the two standard answers.

**Rate limiting without telling the client.** 429 with no `Retry-After` and no limit headers means
every client guesses, and the ones that guess badly keep hammering you during an incident.
:::

:::realworld
```text
// The decisions worth making once, up front, because they are
// contracts rather than implementation.

  1. Error format      — one shape, everywhere, with stable codes.
  2. Pagination        — cursor, opaque, with a next link.
  3. Timestamps        — ISO 8601 with an offset, always UTC.
                          "2026-10-07T10:00:00Z", never a local time
                          and never a Unix integer in some places and
                          a string in others.
  4. Ids               — strings in JSON, even when numeric. A 64-bit
                          integer does not survive JavaScript's
                          number type, and the failure is silent
                          truncation.
  5. Money             — integer minor units plus a currency code.
                          Never a float.
  6. Nulls vs absent   — decide whether a missing field and a null
                          field mean the same thing, and be consistent.
  7. Enums             — document that clients must tolerate unknown
                          values, so adding one is not breaking.

// Each of those is cheap now and expensive once there are clients,
// and none of them is about URL design, which is where most API
// discussions actually go.
```

```text
// When REST is the wrong shape — worth knowing so you do not force
// it.
//
//   Many related resources per view → GraphQL avoids the N+1 of
//     round trips, at the cost of caching being much harder (every
//     query is a POST with a different body) and of query cost
//     becoming an attack surface.
//
//   Internal service-to-service, latency-sensitive → gRPC: binary,
//     schema-first, streaming, code-generated clients. Poor browser
//     support without a proxy.
//
//   Server-initiated updates → Server-Sent Events or WebSockets.
//     Polling an endpoint every second is a real pattern and a bad
//     one at scale.
//
//   Bulk or long-running work → 202 Accepted with a Location
//     pointing at a status resource. Trying to do a ten-minute job
//     inside one request fails at the first proxy timeout.
//
// REST is the right default for a public API because it is
// cacheable, debuggable with curl, and understood by everyone. The
// alternatives win in specific situations, which is the only reason
// to take on their costs.
```
:::

:::mistakes
**Offset pagination at scale.** Slow and incorrect under writes.

**Transparent cursors.** Clients parse them and you can never change the format.

**Premature versioning.** Prefer additive change.

**Error messages as the machine contract.** Provide stable codes.

**Leaking internals in error bodies.**

**Inconsistent response envelopes.**

**Mandatory `total` counts.** A second full scan per request.

**Unbounded `limit`.** Clamp it.

**Ambiguous PATCH semantics.** State which patch format you implement.

**429 without `Retry-After`.**

**Numeric ids as JSON numbers.** Silent truncation in JavaScript clients.

**Deep nesting.** `/a/1/b/2/c/3` is unmaintainable and adds nothing when ids are unique.
:::

:::tradeoffs
**Resource-oriented HTTP** — caching, idempotency, status semantics and tooling all work for
free, at the cost of several round trips for a view that needs several resources.

**RPC over POST** — one call per operation and complete freedom in the payload, and you forfeit
caching, retries, meaningful status codes and monitoring that can distinguish reads from writes.

**GraphQL** — one request for exactly the data a view needs, at the cost of much harder HTTP
caching, query cost as an attack surface, and needing a dataloader layer to avoid N+1 queries
server-side.

**gRPC** — fast, schema-enforced, streaming, generated clients; poor browser support, binary so
harder to debug, and another runtime.

**Cursor pagination** — constant cost, stable under writes, index-friendly; no random page
access.

**Offset pagination** — jump to any page and show a page count; slow and incorrect at scale.
Acceptable for a small admin table.

**URL versioning** — visible, routable, cacheable, trivially pinnable; clutters every path and
tempts you into whole-API versions when one endpoint changed.

**Header versioning** — clean URLs and a single resource identity; invisible in logs and
browsers, needs `Vary`, harder to debug.

The ordering that holds: **decide the error format, the pagination model and the data
conventions first**, because those are the contracts. URL shape and versioning mechanism matter
less than being consistent about them, and the best versioning strategy is making changes that do
not need one.
:::

:::checkpoint
1. Name two things `GET /users/42` gives you that `POST /api {"action":"getUser"}` does not.
2. Why is offset pagination both slow and incorrect at scale? Give both mechanisms.
3. Why must a cursor include the id as well as the timestamp?
4. Why should a cursor be opaque?
5. Classify as breaking or not: adding an optional response field; adding an enum value;
   changing a default page size; tightening validation.
6. What three properties make an error response usable by a client?
7. Why are numeric ids returned as strings in JSON?
8. Name a case where REST is the wrong shape, and what you would use.
:::

:::interview
Answer the REST question by its consequences rather than its definition:

*"Strictly it is Fielding's constraints, with hypermedia as the part almost nobody implements. In
practice it means resource URLs plus HTTP methods and status codes used for their real meanings,
and the reason that matters is not purity — it is that HTTP already has a cache, a retry model and
an idempotency contract, all keyed on the method and URL. Use them and a GET is cacheable by a
CDN, retryable by a client library and visible in monitoring as a read. Tunnel everything through
`POST /api` with a verb in the body and none of that is available, so you end up reimplementing
caching and retries inside your own protocol."*

Give the pagination answer with both failure modes, since most people name only the slow one:

*"Cursor, for anything that grows. Offset has two problems. It is slow — `LIMIT 20 OFFSET 10000`
makes the database produce ten thousand and twenty rows and discard ten thousand, so page 500
costs five hundred times page one. And it is incorrect under concurrent writes: a row inserted
before the next page is fetched shifts the boundary, so the client sees an item twice or misses it
entirely, which users report as 'the feed repeats itself'. A cursor encodes the last row's sort
key, so the query is a range scan on an index — constant cost, stable under inserts. The sort key
needs the id as a tiebreaker, because duplicate timestamps make the ordering non-deterministic and
rows fall through the cracks at boundaries."*

On versioning, lead with avoidance:

*"The first answer is to not need it. Additive changes do not break clients, and most changes can
be made additive. When a breaking change is unavoidable I would put the version in the path,
because it is visible in logs, easy to route and trivial to pin. But the mechanism matters less
than the policy: a support window, `Sunset` and `Deprecation` headers so clients find out
automatically, and version plus client id logged on every request — otherwise 'can we remove v1'
is a guess and you never delete anything."*

And the thing worth volunteering: *"the decisions I would make first are the error format,
pagination and data conventions — ids as strings because a 64-bit integer silently truncates in
JavaScript, money as integer minor units, timestamps as ISO 8601 with an offset. Those are
contracts. URL pluralisation, which is where API discussions usually go, is not."*
:::

## What you now know

- Resource-oriented URLs let HTTP's cache, retry and status semantics work for you.
- RPC over POST forfeits all of that and you reimplement it worse.
- Nest one level at most; a globally unique id makes deeper nesting pointless.
- Additive changes are safe; removals, renames, type changes and tightened validation are not.
- Whether an enum addition breaks clients depends on what you documented about unknowns.
- Offset pagination is O(offset) and incorrect under concurrent writes.
- Cursor pagination is constant cost and stable; the cursor needs a unique tiebreaker.
- Keep cursors opaque so you can change their contents.
- An error response needs an accurate status, a stable machine code, and a field reference.
- Never leak schema names, file paths or library versions in an error body.
- `total` counts are a second full scan — make them opt-in.
- Clamp `limit`, and return the effective value.
- `Idempotency-Key` is what makes a client's retry of a POST safe.
- Return ids as strings; 64-bit integers truncate silently in JavaScript.
- Money as integer minor units plus a currency code; timestamps as ISO 8601 with an offset.
- `Sunset` and `Deprecation` headers plus per-version logging are what let you remove a version.
- GraphQL, gRPC, SSE and 202-plus-status-resource each solve a shape REST handles badly.
