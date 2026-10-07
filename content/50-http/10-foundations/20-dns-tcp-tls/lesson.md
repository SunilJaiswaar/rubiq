---
title: What happens before the request
summary: DNS, TCP and TLS, in round trips — so you can tell whether a slow page is slow before or after the first byte.
level: intermediate
minutes: 18
version: "TLS 1.3"
status: stable
last_reviewed: "2026-10-07"
tags: [networking, dns, tcp, tls, latency]
concepts: [dns, tcp-handshake, tls, latency-budget]
prerequisites: [http-methods]
interview:
  - question: Walk me through what happens when I type a URL and press Enter.
    level: intermediate
    answer: >-
      DNS resolution turns the hostname into an IP — browser cache, OS cache, then a recursive
      resolver, which may walk from the root to the TLD to the authoritative nameserver. Then a
      TCP handshake, which is one round trip for SYN, SYN-ACK, ACK. Then a TLS handshake, which is
      one more round trip on TLS 1.3 and two on 1.2. Then the HTTP request goes out, the server
      responds, and the browser parses the HTML and discovers subresources, each of which may
      need its own connection. On a 100ms link that is roughly 300ms of setup before the first
      byte of HTML, which is why connection reuse and preconnect hints matter so much.
    followUps:
      - "Which of those can you eliminate or overlap?"
  - question: Why does TCP need a handshake at all?
    level: intermediate
    answer: >-
      Because TCP provides an ordered, reliable byte stream, and both ends must agree on starting
      sequence numbers before any data can be acknowledged or reordered. The three-way handshake
      exchanges those and confirms both directions are working. It also makes connections harder
      to spoof, since the initiator must prove it received the server's sequence number. The cost
      is a full round trip before any data, which is why QUIC — and therefore HTTP/3 — folds the
      transport and cryptographic handshakes together and can send data in the first packet on a
      resumed connection.
    followUps:
      - "What is head-of-line blocking, and where does it happen?"
  - question: What does TLS actually give you?
    level: intermediate
    answer: >-
      Three things, and people usually name only the first: confidentiality, so an observer cannot
      read the traffic; integrity, so they cannot modify it undetected; and authentication, so you
      know you are talking to who the certificate says. The third is the one that makes the others
      meaningful — encryption to an attacker is worthless. Authentication rests on a chain of
      signatures up to a root certificate your system already trusts, which is why certificate
      pinning, expiry and revocation are operationally significant rather than paperwork.
    followUps:
      - "What is in a certificate, and what does the CA actually verify?"
resources:
  - title: "High Performance Browser Networking"
    url: https://hpbn.co/
---

## The round trips

```text
  client                                            server
    │
    │ ─── DNS query ─────────────▶ resolver            0-1+ RTT
    │ ◀── A record ────────────────                    (0 if cached)
    │
    │ ─── SYN ──────────────────────────────────▶
    │ ◀── SYN-ACK ──────────────────────────────       1 RTT
    │ ─── ACK ──────────────────────────────────▶
    │
    │ ─── ClientHello ──────────────────────────▶
    │ ◀── ServerHello, cert, finished ──────────       1 RTT (TLS 1.3)
    │ ─── finished ─────────────────────────────▶      2 RTT (TLS 1.2)
    │
    │ ─── GET / ────────────────────────────────▶
    │ ◀── 200 OK ───────────────────────────────       1 RTT + server time
    │
    └─ first byte of HTML

  On a 100ms round trip: ~400ms before any HTML arrives, of which
  ~300ms is setup and none of it is your server's fault.
```

:::what
**DNS** maps a hostname to an IP address. **TCP** provides a reliable ordered byte stream, set up
with a three-way handshake. **TLS** provides confidentiality, integrity and authentication on top
of it. A **round trip time** (RTT) is one message there and back, and it is the unit that matters
because latency is dominated by the speed of light rather than by bandwidth.
:::

:::why
Understanding this sequence matters for one practical reason: it tells you whether a slow page is
your code's fault.

Time to first byte decomposes into DNS, TCP, TLS, server processing and transfer. If your server
responds in 20ms and the page feels slow, no amount of query optimisation helps — the problem is
in the 300ms of setup, and the fixes are completely different: connection reuse, a CDN closer to
the user, HTTP/2 so subresources share a connection, `preconnect` hints, or a shorter certificate
chain.

The deeper reason to know it is that latency does not improve. Bandwidth has grown by orders of
magnitude and round trip time is bounded by physics — light takes about 40ms to cross the
Atlantic, and real networks are two to three times worse than that. So a design that needs five
sequential round trips will always be slow, on any connection, forever. That makes *number of
round trips* the quantity to optimise, which is why every version of HTTP and TLS since 2015 has
been about removing them.
:::

:::how
```text
  DNS — a cache hierarchy, not a lookup

    browser cache (seconds to minutes)
      → OS cache / stub resolver
        → recursive resolver (your ISP, 8.8.8.8, 1.1.1.1)
          → root nameserver        "ask the .com servers"
            → TLD nameserver       "ask ns1.example.com"
              → authoritative      "93.184.216.34"

    Each level caches for the record's TTL. A cold lookup can be
    4 round trips; a warm one is 0. This is why lowering TTL before
    a migration is a real technique — and why it takes effect only
    after the OLD TTL has expired everywhere.

  TCP — why three messages

    SYN      → "my sequence numbers start at X"
    SYN-ACK  → "got it; mine start at Y"
    ACK      → "got it"

    Both ends now know each other's starting sequence number, which
    is what makes ordering and retransmission possible. The third
    message also proves the client received Y, which makes blind
    spoofing hard.

  TLS 1.3 — one round trip, and why it got shorter

    ClientHello  → supported ciphers + a key share, guessed
    ServerHello  → chosen cipher, its key share, certificate,
                    and it can already encrypt
    Finished     → client confirms

    TLS 1.2 needed two round trips because the key exchange could
    not begin until the cipher was negotiated. 1.3 guesses, which
    is almost always right, and removes a whole RTT.

    Session resumption: 0-RTT, sending data in the first packet.
    Fast, and replayable — so only for idempotent requests.

  THE CERTIFICATE CHAIN

    leaf (example.com)  signed by  intermediate CA
    intermediate CA     signed by  root CA
    root CA             already in your OS/browser trust store

    The server must send the leaf AND the intermediates. A missing
    intermediate is the classic "works in Chrome, fails in curl"
    bug, because some clients fetch missing intermediates and
    others do not.

    What a CA verifies for a normal (DV) certificate: that you
    control the domain. Not that you are a real company, not that
    you are trustworthy. The padlock means "encrypted to whoever
    controls this domain", which is exactly why phishing sites
    have padlocks.
```
:::

:::example
```bash
# Decompose the time. This is the single most useful networking
# diagnostic command.
curl -w '
  dns:      %{time_namelookup}s
  tcp:      %{time_connect}s
  tls:      %{time_appconnect}s
  sent:     %{time_pretransfer}s
  first:    %{time_starttransfer}s
  total:    %{time_total}s
' -o /dev/null -s https://example.com

#   dns:      0.004s     ← cached
#   tcp:      0.098s     ← +94ms: one RTT
#   tls:      0.195s     ← +97ms: one more RTT
#   first:    0.312s     ← +117ms: request + server + response
#   total:    0.314s
#
# Each number is cumulative. Subtracting gives you the phase. Here
# 195ms of 314ms is setup — so optimising the server's 117ms has a
# ceiling of about a third of the total.
```

```bash
# Inspecting DNS resolution properly.
dig +trace example.com        # walk from the root, see every step
dig example.com              # the answer plus the TTL
dig @1.1.1.1 example.com     # bypass your local resolver

# Inspecting a certificate chain.
openssl s_client -connect example.com:443 -servername example.com </dev/null \
  | openssl x509 -noout -dates -subject -issuer
# -servername sends SNI, which is required when one IP serves many
# certificates — omitting it is why you sometimes get the wrong cert.
```

```html
<!-- Removing round trips from the client side. -->
<link rel="preconnect" href="https://cdn.example.com" />
<!-- DNS + TCP + TLS now happen in parallel with parsing the HTML,
     so when the first image is requested the connection is ready.
     Worth about 200-300ms on a cross-continent connection. -->

<link rel="dns-prefetch" href="https://analytics.example.com" />
<!-- DNS only. Cheaper, for origins you might not use. -->

<link rel="preload" href="/fonts/body.woff2" as="font" crossorigin />
<!-- Fetch now, use later. For resources discovered late — a font
     referenced from a CSS file is not discoverable until the CSS
     has downloaded and parsed. -->
```
:::

:::failure
**Blaming the server for setup time.** A 20ms server behind 300ms of DNS, TCP and TLS is a
network problem. Measure the phases before optimising anything.

**A missing intermediate certificate.**

```text
Chrome: works.        curl: "unable to get local issuer certificate"
Firefox: works.       Java:  SSLHandshakeException
# Some clients fetch missing intermediates via AIA; others do not.
# "Works in my browser" is not a test of a certificate chain.
# Check with: openssl s_client -showcerts
```

**Expecting a DNS change to take effect immediately.** A record with a 24-hour TTL can be cached
for 24 hours in resolvers you do not control. Lowering the TTL helps *next* time — and only after
the old TTL has drained everywhere. Plan migrations days ahead.

**Certificate expiry.** The most common self-inflicted outage in this list, and entirely
preventable with automated renewal plus an alert at 30 days. A certificate expiring at 2am takes
down everything at once, including your monitoring if it uses the same certificate.

**0-RTT data on a non-idempotent request.** TLS 1.3's early data can be replayed by an attacker
who captures it. Only send it for safe, idempotent requests, which is why it is usually restricted
to GET.

**Domain sharding on HTTP/2.** Splitting assets across `img1.`, `img2.`, `img3.` was an HTTP/1.1
technique to get around the six-connections-per-origin limit. On HTTP/2 it is actively harmful: it
forces multiple connections where one multiplexed connection was the point, and each new origin
costs DNS plus TCP plus TLS.

**Ignoring TCP slow start.** A new connection does not get full bandwidth immediately — it ramps
up, starting at around 10 packets (roughly 14KB). So the first 14KB of a response arrives in one
round trip and the next chunk needs another. This is the real reason "keep critical CSS under
14KB" was advice, and the reason connection reuse matters for more than just the handshake.

**Not setting `Host` or SNI correctly.** One IP serves many sites; without SNI the server cannot
know which certificate to present, so you get the wrong one or a failure.

**Assuming HTTPS means safe.** It means encrypted to whoever controls that domain. A phishing site
has a valid certificate for its own domain.
:::

:::realworld
```text
// Where the round trips go, and how to remove them.

  DNS            — cached; use a fast resolver, keep TTLs sensible
                   (300s is a reasonable default), and use preconnect
                   for third-party origins.
  TCP            — reuse connections. HTTP/1.1 keep-alive, HTTP/2
                   multiplexing. A CDN terminates close to the user,
                   so the handshake RTT is 10ms instead of 150ms and
                   the long leg runs over an already-warm connection.
  TLS            — 1.3 over 1.2 saves a full RTT. Session resumption
                   saves it again. OCSP stapling avoids the client
                   making its own revocation request. Keep the chain
                   short; every certificate is bytes in the handshake.
  HTTP           — HTTP/2 or /3 so subresources share the connection.
  Server         — this is the part you control, and often the
                   smallest part.

// A CDN is mostly a latency product, not a bandwidth one. Its main
// trick is terminating TCP and TLS near the user and keeping a warm
// connection to your origin — so the handshake RTTs are short even
// for content it cannot cache.
```

```text
// HEAD-OF-LINE BLOCKING, at two layers — worth being precise about.
//
//   HTTP/1.1: one request per connection at a time. Request 2 waits
//             for request 1's response. Application-layer blocking.
//
//   HTTP/2:   requests are multiplexed, so the application layer is
//             fixed. But they share one TCP connection, and TCP
//             guarantees ordered delivery — so one lost packet
//             stalls EVERY stream until it is retransmitted.
//             Transport-layer blocking.
//
//   HTTP/3:   QUIC over UDP implements ordering per stream, so a lost
//             packet stalls only its own stream. This is the main
//             reason HTTP/3 exists, and it matters most on lossy
//             networks — mobile, in particular.
```

```bash
# The debugging sequence, in order, when something is slow or broken.
dig example.com                    # resolving? to the right IP?
nc -vz example.com 443             # TCP reachable? firewall?
openssl s_client -connect example.com:443 -servername example.com
                                   # certificate valid? chain complete?
curl -v https://example.com        # headers, redirects, HTTP version
curl -w '...' -o /dev/null         # which phase is slow
traceroute example.com             # where the latency is
# Working up the stack in this order means each step eliminates a
# layer, which is much faster than guessing.
```
:::

:::mistakes
**Optimising the server when setup dominates.** Measure the phases first.

**Testing a certificate chain in one browser.** Browsers paper over missing intermediates.

**Expecting DNS changes to propagate fast.** You are bound by the old TTL.

**No certificate expiry alerting.** The most preventable outage there is.

**0-RTT on non-idempotent requests.** Replayable.

**Domain sharding on HTTP/2.** Defeats multiplexing and multiplies handshakes.

**Forgetting slow start.** The first ~14KB is one round trip; the rest is more.

**Omitting SNI.** Wrong certificate on a shared IP.

**Treating the padlock as trustworthiness.** It attests domain control only.

**Opening a new connection per request.** Three round trips you already paid for once.
:::

:::tradeoffs
**HTTP/1.1 with keep-alive** — universally supported, one request at a time per connection, so
browsers open six. Bundling and sharding were rational here.

**HTTP/2** — multiplexing removes application-layer blocking and makes bundling less necessary,
at the cost of TCP head-of-line blocking and making sharding harmful.

**HTTP/3 (QUIC)** — per-stream ordering fixes transport blocking and supports connection
migration, at the cost of UDP being blocked on some networks and less mature tooling.

**TLS 1.3** — one fewer round trip and a smaller cipher list, with 0-RTT available and replayable.

**A CDN** — terminates TCP and TLS near the user, which removes most of the setup latency even for
uncacheable responses. Costs money, a cache-invalidation story, and another system to reason
about.

**Low DNS TTL** — faster failover and more DNS lookups and less caching. High TTL is the reverse.
Lower it temporarily before a planned migration.

**`preconnect`** — removes 200-300ms for a third-party origin, at the cost of a connection you may
not use. A handful is useful; a dozen wastes resources and competes for bandwidth.

The quantity to optimise is **round trips**, not bytes. Bandwidth has improved enormously and RTT
is bounded by physics, so a design needing five sequential round trips is permanently slow.
Everything above is a way of removing one.
:::

:::checkpoint
1. List the phases from pressing Enter to the first byte of HTML, with round trip counts.
2. On a 100ms RTT link, roughly how much time passes before the first byte, and how much of it
   is your server?
3. Why does TCP need three messages rather than two?
4. Why is TLS 1.3 one round trip where 1.2 needed two?
5. A site works in Chrome and fails in curl with a certificate error. What is the likely cause?
6. You lower a DNS TTL from 24h to 60s and migrate an hour later. What goes wrong?
7. What are the two kinds of head-of-line blocking, and which version fixes each?
8. Why was "keep critical CSS under 14KB" advice?
:::

:::interview
Walk the sequence with round trip counts, because the numbers are what make the answer useful:

*"DNS first — browser cache, OS cache, recursive resolver, and a cold lookup can be several round
trips while a warm one is zero. Then TCP's three-way handshake, which is one RTT. Then TLS, one
RTT on 1.3 and two on 1.2. Then the request itself and the server's processing. On a 100ms link
that is about 300ms of setup before any HTML, and none of it is the application's fault."*

Then make the point that follows from it:

*"Which is why I decompose time-to-first-byte before optimising anything. `curl -w` gives you
namelookup, connect, appconnect and starttransfer, and subtracting them gives the phase. If the
server is 20ms of a 320ms total, query optimisation has a ceiling of about six percent and the
real fixes are elsewhere — connection reuse, a CDN terminating TLS near the user, HTTP/2 so
subresources share the connection, preconnect hints."*

And the structural point, which is what makes this worth knowing rather than looking up:

*"The quantity to optimise is round trips, not bytes. Bandwidth has improved by orders of
magnitude and RTT is bounded by the speed of light — about 40ms across the Atlantic at best, two
to three times that in practice. So a design that needs five sequential round trips is permanently
slow on any connection. That is why every HTTP and TLS revision since 2015 has been about removing
a round trip: TLS 1.3 saving one, 0-RTT resumption saving another, QUIC folding the transport and
crypto handshakes together."*

If TLS comes up specifically: *"it gives confidentiality, integrity and authentication, and the
third is the one that makes the others meaningful — encryption to an attacker is worthless. Which
is also why the padlock means 'encrypted to whoever controls this domain' and not 'trustworthy',
and why phishing sites have padlocks."*
:::

## What you now know

- The sequence is DNS, TCP, TLS, request, response — each costing round trips.
- On a 100ms link that is roughly 300ms before the first byte, independent of your server.
- Decompose TTFB with `curl -w` before optimising; the server is often the smallest part.
- DNS is a cache hierarchy; a warm lookup is free and a cold one is several round trips.
- TCP's three messages exchange sequence numbers and prove both directions work.
- TLS 1.3 is one round trip because it guesses the key share; 1.2 needed two.
- 0-RTT resumption is replayable, so only for idempotent requests.
- A certificate chain needs its intermediates sent; browsers hide a missing one, curl does not.
- DNS changes are bound by the *old* TTL, so lower it days in advance.
- Certificate expiry is the most preventable outage; automate renewal and alert early.
- HTTP/1.1 blocks at the application layer; HTTP/2 at the transport layer; HTTP/3 fixes both.
- Domain sharding helps on HTTP/1.1 and hurts on HTTP/2.
- TCP slow start means the first ~14KB arrives in one round trip.
- A CDN is primarily a latency product: it terminates TCP and TLS near the user.
- Optimise round trips, not bytes — RTT is bounded by physics.
- HTTPS attests domain control, not trustworthiness.
