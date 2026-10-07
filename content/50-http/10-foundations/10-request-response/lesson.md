---
title: What a request actually is
summary: Text over a socket, with four parts — and the three header behaviours that explain most of what seems mysterious about HTTP.
level: basic
minutes: 17
version: "HTTP/1.1, /2, /3"
status: stable
last_reviewed: "2026-10-07"
tags: [http, requests, status-codes, headers, methods]
concepts: [http-methods, status-codes, headers, idempotency]
prerequisites: []
interview:
  - question: What makes a method safe, idempotent, or neither?
    level: basic
    answer: >-
      Safe means it does not change server state — GET, HEAD, OPTIONS. Idempotent means
      repeating it has the same effect as doing it once — all the safe methods, plus PUT and
      DELETE. POST is neither, and PATCH is not guaranteed to be either, though it can be if you
      design it that way. This is not trivia: it determines what a proxy may cache, what a
      browser may prefetch, and what a client library may retry automatically. A retry on a POST
      can charge a card twice, which is why idempotency keys exist.
    followUps:
      - "How do you make a POST safe to retry?"
  - question: What is the difference between 401 and 403?
    level: basic
    answer: >-
      401 Unauthorized means "I do not know who you are" — authentication is missing or invalid,
      and the response should include `WWW-Authenticate` saying how to authenticate. 403
      Forbidden means "I know who you are and you may not do this" — authentication succeeded
      and authorisation failed, so retrying with the same credentials is pointless. The names
      are backwards, which is a known wart: 401 is about authentication despite being called
      Unauthorized. A third option worth knowing is returning 404 for a resource the user is not
      allowed to see, so you do not leak its existence.
    followUps:
      - "When would you return 404 instead of 403?"
  - question: Why does a request to one origin sometimes send two requests?
    level: basic
    answer: >-
      A CORS preflight. For a cross-origin request that is not "simple" — any method other than
      GET, HEAD or POST, or a custom header, or a JSON content type — the browser sends an
      OPTIONS request first, asking whether the actual request is permitted. The server answers
      with `Access-Control-Allow-*` headers and the real request follows. It is the browser
      enforcing the same-origin policy on the client's behalf, which is why CORS is a browser
      concept and curl is unaffected by it.
    followUps:
      - "So is CORS a security mechanism for the server?"
resources:
  - title: "MDN — HTTP"
    url: https://developer.mozilla.org/en-US/docs/Web/HTTP
---

## It is text

```http
GET /api/users/42?include=orders HTTP/1.1
Host: api.example.com
Accept: application/json
Authorization: Bearer eyJhbGc...
User-Agent: curl/8.5.0

```

```http
HTTP/1.1 200 OK
Content-Type: application/json; charset=utf-8
Content-Length: 47
Cache-Control: private, max-age=0
ETag: "a1b2c3"

{"id":"42","name":"Asha","orders":[{"id":"7"}]}
```

Four parts each: a start line, headers, a blank line, and an optional body. HTTP/2 and /3
compress and multiplex this, but the semantics are identical — the same methods, statuses and
headers, in a binary framing.

:::what
An HTTP **request** has a method, a target, a version, headers and an optional body. A
**response** has a status code, a reason phrase, headers and an optional body. The protocol is
**stateless**: each request carries everything the server needs, which is why cookies and tokens
exist.
:::

:::why
Statelessness is the design decision that everything else follows from.

A stateful protocol would let the server remember "this connection is logged in as Asha", which
is simpler for one server and fatal for scale: every request from that client would have to
reach the same machine, so you could not put a load balancer in front, could not restart a
server without dropping sessions, and could not cache anything at an intermediary.

Making each request self-contained means any server can answer any request, which is what makes
horizontal scaling, CDNs and transparent proxies possible. The cost is that identity has to be
re-established every time — hence a cookie or a bearer token on every single request — and that
is a cost the web has accepted happily because the alternative does not scale.

The method semantics follow from the same place. If a request is self-contained and side-effect
free, an intermediary can cache it, a browser can prefetch it, and a client can retry it on a
timeout, all without asking anyone. Those three behaviours are why "GET must not change state"
is a real constraint rather than a convention: a crawler or a prefetcher will happily issue your
state-changing GET, and nothing will warn you.
:::

:::how
```text
  METHODS, by what an intermediary may do with them

    method   safe  idempotent  cacheable   notes
    ───────  ────  ──────────  ─────────   ─────────────────────────
    GET       ✓        ✓           ✓       no body; the default
    HEAD      ✓        ✓           ✓       headers only
    OPTIONS   ✓        ✓           ✗       capability / CORS preflight
    PUT       ✗        ✓           ✗       replace the whole resource
    DELETE    ✗        ✓           ✗       repeat is still "gone"
    POST      ✗        ✗        rarely     create, or anything else
    PATCH     ✗      maybe         ✗       partial; design it idempotent

  Why idempotency is operational, not philosophical:

    client sends POST /charges
    network times out — did it arrive?
    retry → possibly two charges

    PUT /charges/{client-generated-id} is idempotent: the second
    request addresses the same resource, so it overwrites rather
    than duplicates. For POST, an Idempotency-Key header lets the
    server deduplicate.

  STATUS CODES, by class

    1xx  informational   101 Switching Protocols (WebSocket upgrade)
    2xx  success         200 OK · 201 Created (+ Location)
                         202 Accepted (async) · 204 No Content
    3xx  redirect        301 permanent · 302 found · 304 Not Modified
                         307/308 preserve the method (302 may not)
    4xx  client error    400 malformed · 401 who are you
                         403 not allowed · 404 absent
                         409 conflict · 422 semantically invalid
                         429 rate limited (+ Retry-After)
    5xx  server error    500 bug · 502 bad upstream
                         503 unavailable (+ Retry-After) · 504 timeout

  The 4xx/5xx boundary matters: 4xx means "do not retry this as-is",
  5xx means "this might work later". Clients and load balancers both
  act on that distinction, so returning 500 for bad user input makes
  your error rate alarm fire for a user's typo.

  THREE HEADER BEHAVIOURS THAT EXPLAIN A LOT

    1. Content negotiation
         Accept: application/json         what the client wants
         Content-Type: application/json   what this body IS
       Confusing these is the most common header mistake.

    2. Conditional requests
         ETag: "a1b2c3"              server: this version
         If-None-Match: "a1b2c3"     client: only if changed
         → 304 Not Modified, no body. The request happened; the
           payload did not.

    3. Connection reuse
         HTTP/1.1 keeps the TCP connection open by default, so the
         handshake is paid once per connection rather than per
         request. HTTP/2 goes further and multiplexes many requests
         over one connection, which is why bundling many files into
         one became less important.
```
:::

:::example
```http
# A conditional request, which is the mechanism behind "fast but fresh".
GET /api/users/42 HTTP/1.1
If-None-Match: "a1b2c3"

HTTP/1.1 304 Not Modified
ETag: "a1b2c3"
# No body. The client reuses what it has. Still a round trip, but
# bytes saved and — more importantly — the client knows it is current.
```

```http
# 201 Created, done properly.
POST /api/orders HTTP/1.1
Content-Type: application/json
Idempotency-Key: 7f3a9c21-...

{"items": [{"sku": "ABC", "qty": 2}]}

HTTP/1.1 201 Created
Location: /api/orders/991
Content-Type: application/json

{"id": "991", "status": "pending"}
# Location tells the client where the thing now lives. The
# idempotency key lets the server return the SAME 201 if the client
# retries after a timeout, instead of creating a second order.
```

```http
# 429, done properly — the client needs to know how long to wait.
HTTP/1.1 429 Too Many Requests
Retry-After: 30
RateLimit-Limit: 100
RateLimit-Remaining: 0
RateLimit-Reset: 30

# Without Retry-After, every client invents its own backoff, and the
# ones that guess wrong keep hammering you during an incident.
```

```http
# A CORS preflight, and what it is actually asking.
OPTIONS /api/orders HTTP/1.1
Origin: https://app.example.com
Access-Control-Request-Method: POST
Access-Control-Request-Headers: content-type, authorization

HTTP/1.1 204 No Content
Access-Control-Allow-Origin: https://app.example.com
Access-Control-Allow-Methods: POST, GET
Access-Control-Allow-Headers: content-type, authorization
Access-Control-Allow-Credentials: true
Access-Control-Max-Age: 86400
# Max-Age caches the preflight, so you are not paying an extra round
# trip on every request. Omitting it is a common and invisible
# latency cost.
```
:::

:::failure
**State-changing GET.** The single most consequential method mistake:

```http
GET /subscriptions/42/cancel
```
A browser prefetcher, a crawler, a link checker, a corporate proxy that warms caches, or an
email client scanning links will issue it. There is also no CSRF token check on GET, so any
site can trigger it with an `<img>` tag. This is the same point the Rails security lesson makes
from the framework side; it is a property of the protocol.

**Returning 200 with an error body.**

```json
HTTP/1.1 200 OK
{"success": false, "error": "not found"}
```
Every intermediary now believes it succeeded: it may be cached, monitoring reports zero errors,
and the client's error handling — which checks the status — does not fire. The status code is
the part of the response that the rest of the infrastructure reads.

**5xx for client mistakes.** A validation failure returned as 500 pollutes your error rate,
pages someone at 3am, and tells the client's retry logic to try again — which it will, forever,
because the input is still invalid.

**Mixing up `Accept` and `Content-Type`.** `Accept` describes the response you want;
`Content-Type` describes the body you are sending. Setting `Content-Type: application/json` on a
GET with no body is harmless noise; forgetting it on a POST means the server may not parse the
body at all.

**Assuming CORS protects the server.**

```text
CORS is enforced by the browser, for the browser's benefit. It stops
page A reading page B's responses. It does not stop anyone sending
your server a request — curl, Postman and any script ignore it
entirely. A permissive CORS policy is a risk to your users' data in
their browsers, not a hole in your server's authorisation. Server-side
authorisation is still entirely your job.
```

**302 changing the method.** Historically some clients turn a redirected POST into a GET. Use
307 or 308 if the method must be preserved — this breaks form resubmission in ways that are
hard to reproduce.

**Unbounded request bodies.** Without a size limit, a client can stream gigabytes at you. Set
one at the proxy and in the application.

**Trusting client headers.** `X-Forwarded-For`, `Host`, `Referer` and `User-Agent` are all
attacker-controlled. Only trust `X-Forwarded-For` as far as your own proxy, and validate `Host`
against an allow list — an unvalidated `Host` is how password-reset links get sent to an
attacker's domain.
:::

:::realworld
```text
// The headers worth setting on every response, and why.

  Content-Type              — with charset. Without it, browsers
                               sniff, and sniffing is an XSS vector.
  X-Content-Type-Options: nosniff
                            — tells them not to.
  Cache-Control             — explicitly, even when the answer is
                               "no-store". Omitting it means
                               intermediaries guess.
  Strict-Transport-Security — HTTPS only, for a long max-age.
  Content-Security-Policy   — the strongest single XSS mitigation.
  X-Frame-Options / CSP frame-ancestors
                            — clickjacking.
  Referrer-Policy           — stops URLs with tokens leaking to third
                               parties via the Referer header.

// And one worth removing: Server and X-Powered-By, which tell an
// attacker which CVEs to try.
```

```text
// What changed across versions, and what it means for you.
//
//   HTTP/1.1  — one request at a time per connection. Browsers opened
//               6 connections per origin, which is why bundling and
//               domain sharding were performance techniques.
//
//   HTTP/2    — multiplexing over one connection, header compression,
//               server push (now effectively dead). Bundling became
//               much less important; domain sharding became actively
//               harmful, since it defeats multiplexing.
//
//   HTTP/3    — the same semantics over QUIC, which is UDP-based.
//               Fixes head-of-line blocking at the transport level:
//               in HTTP/2 one lost TCP packet stalls every stream,
//               and in HTTP/3 it stalls only the affected one. Also
//               makes connection migration possible, which matters
//               on mobile networks.
//
// The semantics did not change. Methods, statuses and headers are
// the same, which is why "learn HTTP" is still one thing to learn.
```

```bash
# The debugging command worth memorising.
curl -v -o /dev/null -w '%{http_code} %{time_total}s\n' https://example.com/api

# -v shows the full request and response headers, including the TLS
# handshake. Most "mysterious" HTTP problems are visible in those
# headers — a wrong Content-Type, a cache header you did not expect,
# a redirect chain, a cookie not being set because of SameSite.
```
:::

:::mistakes
**State-changing GET.** Prefetchers, crawlers and `<img>` tags will fire it, with no CSRF check.

**200 with an error body.** The status is what the infrastructure reads.

**5xx for client errors.** False alarms and infinite retries.

**`Accept` versus `Content-Type` confusion.**

**Believing CORS protects the server.** It protects the browser's user.

**302 where 307/308 was needed.** The method may change.

**No request size limit.**

**Trusting `Host`, `X-Forwarded-For` or `Referer`.** All client-controlled.

**No `Retry-After` on 429 or 503.** Clients invent their own backoff and get it wrong.

**No `Cache-Control`.** Intermediaries guess, and their guess is cacheable.
:::

:::tradeoffs
**Statelessness** — any server can answer any request, so load balancing, CDNs and restarts are
easy. Costs re-authentication on every request and larger requests.

**Cookies** — sent automatically, work with plain HTML forms, and that automatic sending is what
makes CSRF possible. Need `HttpOnly`, `Secure` and `SameSite`.

**Bearer tokens** — not sent automatically, so no CSRF, and you must attach them yourself and
store them somewhere, and `localStorage` is readable by any XSS.

**Conditional requests** — a round trip but no payload, so the client is provably fresh. Cheaper
than a full response and not free; `Cache-Control: max-age` avoids the request entirely.

**Fine-grained status codes** — precise and actionable, and clients may not handle them. Use
them, and make sure the body carries a machine-readable error code too, since status codes are a
small vocabulary.

**HTTP/2 multiplexing** — fewer connections and no need to bundle, at the cost of TCP
head-of-line blocking that HTTP/3 then fixes.

The rule that does most of the work: **use the protocol's own semantics.** A correct status code,
a correct method and an explicit cache header let every layer between you and the client — proxy,
CDN, browser, client library, monitoring — do the right thing without being told. Tunnelling
everything through `200 POST` means none of them can help.
:::

:::checkpoint
1. Which methods are safe, which are idempotent, and why does the distinction matter
   operationally?
2. 401 versus 403 — and when would you return 404 instead?
3. Why does `GET /subscriptions/42/cancel` get triggered without a user clicking anything?
4. What is wrong with `200 OK {"success": false}`? Name three things that break.
5. Why does returning 500 for a validation error cause a second problem beyond being wrong?
6. What does a CORS preflight ask, and who does CORS protect?
7. Why is `302` risky for a POST, and what do you use?
8. Name three client-supplied headers you must not trust, and what goes wrong with each.
:::

:::interview
Anchor the answer in statelessness, because the rest follows from it:

*"HTTP is stateless — each request carries everything the server needs — and that is the decision
everything else follows from. It is what lets any server answer any request, which is what makes
load balancers, CDNs and rolling restarts possible. The cost is re-establishing identity on every
request, which is why cookies and bearer tokens exist."*

Then the method semantics, framed as what they license rather than as definitions:

*"Safe means no state change; idempotent means repeating it is the same as doing it once. GET,
HEAD and OPTIONS are both; PUT and DELETE are idempotent but not safe; POST is neither. That
matters because it determines what a proxy may cache, what a browser may prefetch, and what a
client library may retry on a timeout. So a state-changing GET is not a style violation — a
prefetcher or a crawler will fire it, and there is no CSRF check on GET, so an `<img>` tag can
trigger it from any site."*

Give the status-code answer with the operational consequence:

*"401 is 'I do not know who you are' and should carry `WWW-Authenticate`; 403 is 'I know and you
may not'. The names are backwards, which is a known wart. And the 4xx/5xx boundary is the one
that matters most in production: 4xx means do not retry as-is, 5xx means it might work later. So
returning 500 for a validation failure both pages someone and tells the client's retry logic to
keep trying input that will never be valid."*

One correction that reliably lands: *"CORS is enforced by the browser for the browser's user. It
stops one page reading another origin's responses. It does not stop anyone sending my server a
request — curl ignores it entirely — so it is not a substitute for server-side authorisation."*
:::

## What you now know

- A request is a method, target, version, headers and optional body — text over a socket.
- HTTP is stateless by design, which is what enables load balancing and CDNs.
- Safe means no state change; idempotent means repeating is harmless.
- Those properties decide what may be cached, prefetched and retried.
- A state-changing GET will be triggered by prefetchers and `<img>` tags, with no CSRF check.
- 401 is authentication, 403 is authorisation; 404 avoids leaking existence.
- 4xx means do not retry as-is; 5xx means it might work later.
- `Accept` is what you want; `Content-Type` is what you are sending.
- Conditional requests with `ETag`/`If-None-Match` return 304 with no body.
- `Idempotency-Key` makes a POST safe to retry.
- `Retry-After` on 429 and 503, or clients invent their own backoff badly.
- CORS is browser-enforced and protects the user, not the server.
- 307/308 preserve the method; 302 may not.
- `Host`, `X-Forwarded-For` and `Referer` are attacker-controlled.
- HTTP/2 multiplexes, HTTP/3 fixes transport head-of-line blocking; the semantics are unchanged.
