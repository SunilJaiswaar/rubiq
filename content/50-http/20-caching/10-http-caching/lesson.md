---
title: HTTP caching
summary: The headers that decide whether a request happens at all, the two-tier model behind every fast site, and why a wrong cache header is worse than a wrong page.
level: intermediate
minutes: 18
version: "RFC 9111"
status: stable
last_reviewed: "2026-10-07"
tags: [http, caching, cdn, etag, performance]
concepts: [caching, cache-validation, cache-invalidation, immutable-assets]
prerequisites: [http-methods, headers]
interview:
  - question: What is the difference between max-age and no-cache?
    level: intermediate
    answer: >-
      `max-age=N` means the response may be used for N seconds without asking anyone, so there is
      no request at all. `no-cache` is misleadingly named: it means the response may be stored but
      must be revalidated before use, so you get a conditional request and usually a 304. The one
      that actually forbids storage is `no-store`. So the three tiers are: `max-age` for no
      request, `no-cache` for a cheap request, and `no-store` for a full request every time plus a
      guarantee nothing is written to disk — which matters for anything sensitive.
    followUps:
      - "What does must-revalidate add?"
  - question: How do you cache a static asset forever and still ship changes?
    level: intermediate
    answer: >-
      Put a content hash in the filename and serve it with `Cache-Control: public, max-age=31536000,
      immutable`. Because the URL changes whenever the content changes, there is no invalidation
      problem — the new deploy references a new URL, which has never been cached. The HTML that
      references them is the only thing that must stay fresh, so it gets a short max-age or
      `no-cache`. That split — immutable, fingerprinted assets plus a revalidated entry point — is
      how essentially every modern site is built, and it works because invalidation is replaced by
      naming.
    followUps:
      - "What does `immutable` add beyond a long max-age?"
  - question: Why is a wrong cache header harder to fix than a wrong page?
    level: advanced
    answer: >-
      Because you cannot reach the caches. A page served with `max-age=31536000` by mistake is now
      in browser caches, CDN nodes, and corporate proxies you have no control over, and it will be
      served to those users for a year. You can purge your own CDN, but not a user's browser or an
      ISP's proxy. The usual mitigation is to change the URL so the bad entry is never consulted
      again, which is sometimes impossible for an entry-point URL. Which is why cache headers are
      a deploy-time decision reviewed like a migration, not something to experiment with in
      production.
    followUps:
      - "So what would you do if it happened?"
resources:
  - title: "MDN — HTTP caching"
    url: https://developer.mozilla.org/en-US/docs/Web/HTTP/Caching
---

## The three tiers

```http
# Tier 1: no request at all. The fastest possible response.
Cache-Control: public, max-age=31536000, immutable

# Tier 2: a cheap conditional request, no body in the response.
Cache-Control: no-cache
ETag: "a1b2c3"
# → client sends If-None-Match, server replies 304, ~200 bytes

# Tier 3: a full request every time, and do not write it to disk.
Cache-Control: no-store
```

:::what
A **cache** stores a response and may reuse it for a later equivalent request. **Freshness** is
whether it may be used without asking; **validation** is a cheap request confirming it is still
current. `Cache-Control` governs both. A **private** cache is the user's browser; a **shared**
cache is a CDN or proxy.
:::

:::why
Caching is the only optimisation that makes a request cost nothing, which is categorically
different from making it fast.

A 20ms API response still costs a DNS lookup, a TCP handshake, a TLS handshake and a round trip —
300ms on a cross-continent link. A cache hit in the browser costs nothing: no network, no
server, no bandwidth, no time. There is no amount of server optimisation that competes with not
making the request.

That is why the header is worth understanding properly rather than copying. And it is also why
the mistakes are expensive in an unusual way. Most bugs are fixable by deploying: you push a
change and the problem is gone. A wrong cache header is *distributed* — it has been handed to
browsers, CDN nodes and proxies you cannot address — so the mistake keeps being served after you
have fixed the code. A `max-age` of a year on an HTML page cannot be undone for the users who
already have it.

So the design goal is to avoid ever needing invalidation. The modern answer does exactly that:
make asset URLs contain a content hash, so a change produces a new URL rather than a stale entry.
The invalidation problem is replaced by a naming convention, which is a much better kind of
problem to have.
:::

:::how
```text
  THE DECISION A CACHE MAKES

    request arrives
      │
      ├─ a stored response for this URL?        no → fetch
      │
      ├─ is it FRESH? (age < max-age)          yes → serve it. No
      │                                              network at all.
      │
      ├─ can it be VALIDATED? (ETag or
      │  Last-Modified present)                yes → conditional
      │                                              request → 304 or
      │                                              200 with new body
      └─ otherwise                                  → fetch

  Cache-Control, the directives that matter

    public            any cache may store it
    private           only the browser (never a CDN)
    no-cache          store, but revalidate before every use
    no-store          do not store at all
    max-age=N         fresh for N seconds (all caches)
    s-maxage=N        fresh for N seconds (shared caches only)
    must-revalidate   when stale, do NOT serve while fetching
    immutable         do not revalidate even on a reload
    stale-while-revalidate=N
                      serve stale for up to N seconds while
                      refreshing in the background
    stale-if-error=N  serve stale if the origin is down

  The last two are the ones most people have not used and should:
  stale-while-revalidate makes a cache refresh invisible to the user,
  and stale-if-error turns an origin outage into slightly old content
  rather than an error page.

  VALIDATORS

    ETag: "a1b2c3"              a version identifier, any opaque string
    If-None-Match: "a1b2c3"     → 304 if unchanged

    Last-Modified: Tue, 07 Oct 2026 10:00:00 GMT
    If-Modified-Since: ...      → 304 if not modified since

    ETag is stronger: it detects any change, whereas Last-Modified has
    one-second granularity and breaks for content that changes more
    than once a second or whose timestamp is not meaningful.

  VARY — the header people forget, with security consequences

    Vary: Accept-Encoding, Accept-Language

    "This response depends on those request headers, so cache a
    separate entry per distinct value."

    Omit `Vary: Accept-Encoding` and a cache may serve gzipped bytes
    to a client that did not ask for them. Omit a Vary for an
    authorisation-dependent response and a shared cache can serve one
    user's data to another — which is why such responses need
    `private` or `no-store`, not a clever Vary.
```
:::

:::example
```text
// The standard two-tier setup, which is how nearly every modern
// site is configured.

  /index.html
    Cache-Control: no-cache
    ETag: "deploy-7f3a9c"
    → a conditional request per visit; 304 and ~200 bytes when
      unchanged. Always current, nearly free.

  /assets/app.4f3a9c21.js
    Cache-Control: public, max-age=31536000, immutable
    → never requested again. A new deploy produces
      app.9b2e8d14.js, a URL that has never been cached, so there
      is nothing to invalidate.

  /api/users/42
    Cache-Control: private, max-age=0, must-revalidate
    ETag: "u42-v9"
    → never stored by a CDN (it is user-specific), revalidated by
      the browser, 304 when unchanged.

  /api/public/stats
    Cache-Control: public, max-age=60, stale-while-revalidate=300
    → at most one origin request per minute per cache node, and
      users never wait for a refresh.
```

```ruby
# Conditional responses in an application, which is where the 304
# actually comes from.
def show
  @order = current_user.orders.find(params[:id])
  # fresh_when sets ETag and Last-Modified, and returns 304 if the
  # client's validators match — skipping the view render entirely.
  fresh_when(@order)
end
# The saving is not only bandwidth: the template is not rendered and
# the serialiser does not run. On a heavy page the 304 path can be
# twenty times cheaper than the 200 path.
```

```ruby
# Cache keys that cannot go stale, which is the same naming trick
# applied inside the application.
cache [@order, @order.items.maximum(:updated_at)] do
  render partial: "order", object: @order
end
# The key contains everything the output depends on, so a change
# produces a different key rather than a stale entry. Expiry becomes
# a memory-pressure concern rather than a correctness one.
```

```http
# Serving stale content during an origin outage — worth configuring
# before you need it.
Cache-Control: public, max-age=60, stale-if-error=86400
# The origin returns 500 for an hour. Users see content up to a day
# old instead of an error page. For most read paths that is
# unambiguously better, and it costs one directive.
```
:::

:::failure
**`no-cache` believed to mean "do not cache".**

```http
Cache-Control: no-cache
# Means: store it, but revalidate before use.
Cache-Control: no-store
# Means: do not store it. This is what you want for a bank statement.
```
This naming confusion is the single most common cache mistake, and it matters: `no-cache` on a
response containing personal data means the response *is* written to disk and may be read later
by anything with access to the cache directory.

**Caching an authenticated response publicly.**

```http
Cache-Control: public, max-age=300
Set-Cookie: session=...
# A shared cache now holds one user's page and will serve it to the
# next person who requests that URL. This is a real and recurring
# class of incident, and it is catastrophic rather than embarrassing.
# Authenticated responses need `private` or `no-store`.
```

**A long `max-age` on an entry point.** The unfixable mistake:

```http
# Accidentally on /index.html:
Cache-Control: public, max-age=31536000
# You can purge your CDN. You cannot purge users' browsers or an
# ISP's proxy. Those users are pinned to that version of your site
# for a year, and they cannot be reached by deploying anything —
# the browser will not ask.
# The only partial remedy is to serve the site from a different URL,
# which breaks every existing link.
```

**No `Vary: Accept-Encoding`.** A cache may store a gzipped response and serve it to a client
that did not send `Accept-Encoding: gzip`, which arrives as binary garbage.

**An ETag that changes when the content does not.** Including a timestamp or a process id in the
ETag means every revalidation returns 200 with a full body, so the cache never helps. Worth
checking: `curl -I` twice and compare.

**Weak versus strong ETags misunderstood.** `W/"abc"` is weak, meaning semantically equivalent
rather than byte-identical, and it cannot be used for range requests. If you serve partial
content — video, resumable downloads — a weak ETag breaks it.

**Caching a POST response.** Permitted by the specification under narrow conditions and almost
never what anyone means. If a result is cacheable, expose it as a GET.

**`stale-while-revalidate` without understanding it.** The first user after expiry gets stale
content. That is the point, and it is wrong for anything where staleness is a correctness problem
— a stock level, a price, a permission.

**Query strings assumed to bust caches.** Some older proxies ignore query strings for caching
decisions. A path-based hash is more reliable than `?v=2`.
:::

:::realworld
```text
// A correct configuration, annotated with why each line is there.

  HTML entry point
    Cache-Control: no-cache
    ETag: <deploy hash>
    → must be current (it names the asset URLs), and revalidation
      is cheap.

  Fingerprinted JS/CSS/fonts
    Cache-Control: public, max-age=31536000, immutable
    → the content hash IS the cache key; `immutable` additionally
      stops a browser revalidating on an explicit reload, which
      otherwise produces a burst of pointless 304s.

  Images, user uploads
    Cache-Control: public, max-age=86400
    → fingerprint them too if you can; otherwise a day is a
      reasonable compromise.

  Authenticated API
    Cache-Control: private, no-store
    → never in a shared cache, never on disk.

  Public API
    Cache-Control: public, max-age=60, stale-while-revalidate=300,
                   stale-if-error=86400
    Vary: Accept-Encoding
    → one origin hit per minute per node, invisible refreshes, and
      an outage degrades to stale data instead of errors.
```

```bash
# Verifying what you actually shipped. Do this after every change to
# caching, because it is not visible in the application's behaviour.
curl -I https://example.com/assets/app.4f3a9c21.js
# cache-control: public, max-age=31536000, immutable

curl -I https://example.com/
# cache-control: no-cache
# etag: "deploy-7f3a9c"

# Confirm the 304 path works:
curl -I -H 'If-None-Match: "deploy-7f3a9c"' https://example.com/
# HTTP/2 304
#
# And confirm nothing authenticated is public:
curl -I -H 'Cookie: session=...' https://example.com/account | grep -i cache
# cache-control: private, no-store
```

```text
// A note on the economics, which is usually the argument that
// actually gets caching prioritised:
//
//   A CDN hit costs a fraction of an origin request and adds no
//   latency beyond the edge round trip. Raising a cache hit rate
//   from 80% to 95% does not make the site 15% faster — it removes
//   three quarters of the remaining origin traffic, which changes
//   how much infrastructure you need rather than only how fast
//   pages feel.
//
// And the reliability argument: content served from a cache is
// content that survives your origin being down. `stale-if-error`
// turns an outage into a degradation.
```
:::

:::mistakes
**`no-cache` instead of `no-store`.** The former still stores.

**`public` on an authenticated response.** One user's data served to another.

**A long `max-age` on an entry point.** Unfixable for users who already have it.

**No `Vary: Accept-Encoding`.** Garbled responses.

**An ETag that changes every request.** Revalidation never saves anything.

**Weak ETags with range requests.** Partial content breaks.

**Relying on query strings to bust caches.** Use a path-based hash.

**`stale-while-revalidate` on data where staleness is a correctness problem.**

**No verification after a change.** Cache headers are invisible in application behaviour; check
with `curl -I`.

**Treating cache headers as a tuning knob.** They are a distributed, partly irreversible deploy.
Review them like a migration.
:::

:::tradeoffs
**No caching (`no-store`)** — always correct, always slow, and necessary for sensitive data.

**Validation (`no-cache` + ETag)** — always current, costs a round trip, saves the body and the
rendering. The right default for an HTML entry point.

**Freshness (`max-age`)** — zero cost for the duration, and you cannot change your mind. Safe
only when the URL is content-addressed, or when the staleness window is genuinely acceptable.

**Immutable fingerprinted assets** — the best of both: no requests and no invalidation problem,
because the URL changes with the content. Requires a build step that rewrites references.

**`stale-while-revalidate`** — refreshes are invisible to users, at the cost of one stale
response per expiry per node. Excellent for content, wrong for prices and permissions.

**`stale-if-error`** — an outage degrades to old content instead of an error. Almost free, and
underused.

**CDN with short `s-maxage` plus purging** — control over invalidation and a purge system to
operate and get wrong. Fine for a CMS where editors expect immediate updates.

The principle: **replace invalidation with naming wherever you can.** Content-addressed URLs
remove the hard problem entirely, and what is left — a revalidated entry point — is cheap and
safe. When you cannot do that, prefer a short `max-age` plus `stale-while-revalidate` over a long
one, because the cost of being too fresh is bounded and the cost of being too stale is not.
:::

:::checkpoint
1. `no-cache`, `no-store`, `max-age=0` — what does each actually do?
2. How do you cache an asset for a year and still ship a change tomorrow?
3. What does `immutable` add beyond a long `max-age`?
4. Why is a wrong `max-age` on `/index.html` worse than a wrong page?
5. What goes wrong without `Vary: Accept-Encoding`?
6. `public, max-age=300` on a page that depends on a session cookie — what is the incident?
7. What do `stale-while-revalidate` and `stale-if-error` each buy you, and when is the first
   one wrong?
8. How do you verify a cache header change actually shipped?
:::

:::interview
Start with the three tiers, because it organises everything else:

*"Three levels. `max-age` means no request at all — the browser serves it without asking.
`no-cache` is badly named: it means store it but revalidate before use, so you get a conditional
request and usually a 304 with no body. `no-store` is the one that actually forbids storage, which
is what you need for anything sensitive. Reaching for `no-cache` when you meant `no-store` means
personal data is written to disk, which is the most common mistake in this area."*

Then give the pattern, since it is what the question is usually driving at:

*"For static assets, put a content hash in the filename and serve it with a year's `max-age` plus
`immutable`. Because the URL changes whenever the content does, there is no invalidation problem —
a new deploy references a URL that has never been cached. The HTML referencing them is the only
thing that must stay current, so it gets `no-cache` and an ETag. That split is how essentially
every modern site is built, and the interesting part is that it replaces cache invalidation with a
naming convention, which is a far better problem to have."*

And the point that shows operational judgement:

*"The reason I treat cache headers like a migration rather than a tuning knob is that the mistake
is distributed and partly irreversible. A year's `max-age` accidentally on an HTML page is now in
browsers and proxies I cannot address — I can purge my CDN, but those users will not ask my server
anything for a year, so deploying a fix reaches nobody. The only remedy is serving from a different
URL, which breaks every existing link. So I verify with `curl -I` after any change, because cache
headers are invisible in the application's own behaviour."*

If there is room, the underused pair: *"`stale-if-error` is nearly free and turns an origin outage
into slightly old content instead of an error page, and `stale-while-revalidate` makes refreshes
invisible to users. Both are wrong for anything where staleness is a correctness problem — a price,
a stock level, a permission."*
:::

## What you now know

- Three tiers: `max-age` (no request), `no-cache` (cheap conditional), `no-store` (nothing
  stored).
- `no-cache` still stores the response — use `no-store` for sensitive data.
- `private` keeps a response out of shared caches; `public` allows them.
- Fingerprinted URLs plus `max-age=31536000, immutable` eliminate invalidation.
- `immutable` additionally prevents revalidation on an explicit reload.
- An authenticated response with `public` can be served to another user — a real incident class.
- A wrong `max-age` on an entry point cannot be fixed by deploying.
- `Vary` tells caches which request headers the response depends on; omitting `Accept-Encoding`
  garbles responses.
- ETags are stronger than `Last-Modified`; weak ETags break range requests.
- An ETag that changes every request makes revalidation useless.
- `stale-while-revalidate` hides refresh latency; `stale-if-error` survives an origin outage.
- A 304 skips rendering and serialisation, not just bytes.
- Include everything the output depends on in a cache key, so staleness is impossible.
- Verify with `curl -I`; cache headers are invisible in application behaviour.
- Replace invalidation with naming wherever possible.
