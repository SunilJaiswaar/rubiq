---
title: When request/response is the wrong shape
summary: Polling, long polling, Server-Sent Events and WebSockets — what each costs, and the operational problems that only appear once a connection is long-lived.
level: advanced
minutes: 17
version: "1"
status: stable
last_reviewed: "2026-10-07"
tags: [http, websockets, sse, polling, realtime]
concepts: [server-push, websockets, server-sent-events, connection-state]
prerequisites: [http-methods, dns]
interview:
  - question: Polling, SSE or WebSockets?
    level: advanced
    answer: >-
      Polling for anything infrequent, because it is stateless, cacheable and survives every proxy
      — and its cost is bounded by the interval. Server-Sent Events when updates flow one way,
      server to client, which covers notifications, progress, dashboards and feeds; it is plain
      HTTP, so it works through proxies, reconnects automatically with `Last-Event-ID`, and needs
      no new protocol. WebSockets when you genuinely need bidirectional, low-latency messaging —
      chat, collaborative editing, games. The mistake is reaching for WebSockets by default: you
      take on connection state, your own heartbeats, your own reconnection and your own
      authentication story, for a capability most features do not use.
    followUps:
      - "What does SSE give you for free that WebSockets do not?"
  - question: Why are long-lived connections operationally harder?
    level: advanced
    answer: >-
      Because they make your servers stateful. A load balancer must keep a client on the same
      machine, so a deploy disconnects everyone at once and they all reconnect simultaneously —
      a thundering herd against a cold server. Connection count becomes a capacity limit you must
      plan for, not just request rate. Scaling horizontally needs a shared pub/sub layer, since
      the server holding a user's connection is probably not the one handling the event. And
      anything that silently drops idle connections — load balancers, mobile NAT, corporate
      proxies — means you need heartbeats to discover a dead connection rather than assuming
      silence means nothing happened.
    followUps:
      - "How do you handle the reconnect storm on deploy?"
  - question: How do you authenticate a WebSocket?
    level: advanced
    answer: >-
      At the handshake, because the handshake is an HTTP request and can carry a cookie. The
      difficulty is that the browser's WebSocket API cannot set custom headers, so a bearer token
      cannot go in `Authorization` — people put it in the query string, where it ends up in access
      logs. The better pattern is a short-lived single-use ticket: the client requests one over
      normal authenticated HTTP, then presents it in the connect URL. And authorisation does not
      end at the handshake: a connection can live for hours, so permission revocation has to be
      pushed to the connection rather than checked once.
    followUps:
      - "Why is a token in the query string a problem specifically?"
resources:
  - title: "MDN — Server-sent events"
    url: https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events
---

## The four options

```text
  POLLING — a request on a timer
    client: GET /notifications every 10s
    cost:   N clients × 6 requests/min, mostly returning nothing
    wins:   stateless, cacheable, works everywhere, trivially debugged

  LONG POLLING — a request the server holds open
    client: GET /notifications?wait=30
    server: holds the request until there is news or 30s elapse
    cost:   one connection per waiting client, but no empty responses
    wins:   near-realtime over plain HTTP; the historical fallback

  SERVER-SENT EVENTS — one request, a streaming response
    client: new EventSource("/stream")
    server: Content-Type: text/event-stream, then writes forever
    cost:   one connection per client, one direction
    wins:   plain HTTP, automatic reconnection, event ids, no new
            protocol

  WEBSOCKETS — an upgraded, bidirectional connection
    client: new WebSocket("wss://...")
    server: 101 Switching Protocols, then frames both ways
    cost:   one connection per client, and you own everything about
            its lifecycle
    wins:   low latency in both directions, small frames
```

:::what
**Polling** is repeated requests. **Long polling** holds a request open until there is something
to say. **Server-Sent Events** is a single HTTP response that never ends, carrying a stream of
text events. **WebSockets** upgrade an HTTP connection to a bidirectional frame-based protocol.
:::

:::why
Request/response assumes the client knows when to ask, and for a whole class of features it does
not — a message arriving, a job finishing, another user's cursor moving.

Polling is the obvious workaround and its cost is worth stating precisely. Ten thousand clients
polling every ten seconds is a thousand requests per second, and if updates are rare, essentially
all of them return nothing. Each one pays a request round trip and, if connections are not reused,
a handshake. You are spending a thousand requests per second to discover that nothing happened.

The latency is also bounded below by the interval: an update arriving just after a poll waits the
full ten seconds. Shortening the interval improves latency and multiplies the waste linearly,
which is a bad trade in both directions.

Server push inverts it: the connection exists, and the server writes when there is something to
write. Zero traffic when nothing happens, and latency measured in milliseconds when something
does.

The reason to be deliberate about which mechanism you choose is that the cost moves rather than
disappearing. A long-lived connection makes a previously stateless server stateful, and
statelessness was doing a lot of work — it is what made load balancing, deploys and horizontal
scaling simple. Those problems return, and they return as *operational* problems rather than code
problems, which is why they tend to surprise people after the feature has shipped.
:::

:::how
```text
  THE COST COMPARISON, 10,000 clients, an update every 5 minutes
  per client

    POLLING every 10s
      1,000 req/s, of which ~99.7% return nothing
      latency: 0-10s
      server state: none

    LONG POLLING, 30s timeout
      ~333 req/s (reconnections), no empty responses
      latency: ~0
      server state: 10,000 held requests — and a thread or fibre
        each unless the server is async, which is why this needed
        an event-driven server to be viable

    SSE
      ~0 req/s steady state
      latency: ~0
      server state: 10,000 open connections

    WEBSOCKETS
      ~0 req/s, plus heartbeats
      latency: ~0, both directions
      server state: 10,000 open connections, and you own
        reconnection, heartbeats and message framing

  SSE WIRE FORMAT — it is just text, which is the point

    Content-Type: text/event-stream
    Cache-Control: no-cache
    Connection: keep-alive

    id: 42
    event: notification
    data: {"title":"New message"}

    retry: 3000

    : this is a comment, used as a keep-alive ping

    Blank line separates events. The browser's EventSource
    reconnects automatically and sends Last-Event-ID, so the server
    can resume from where the client left off — which is replay for
    free, and the main thing WebSockets make you build yourself.

  WEBSOCKET LIFECYCLE — the parts you must implement

    1. HTTP GET with Upgrade: websocket   ← can carry a cookie
    2. 101 Switching Protocols
    3. frames both ways
    4. ping/pong heartbeats               ← you schedule these
    5. close, or a silent death            ← indistinguishable without 4
    6. reconnect with backoff              ← you implement this
    7. resume missed messages              ← you design this

    Steps 4, 6 and 7 are free with SSE. That is most of the argument
    for preferring it when you do not need to send upward.
```
:::

:::example
```js
// 1. SSE on the client. Three lines, and reconnection is handled.
const es = new EventSource("/stream");
es.addEventListener("notification", (e) => show(JSON.parse(e.data)));
es.onerror = () => { /* EventSource is already retrying */ };
// On disconnect the browser reconnects with Last-Event-ID set to the
// last `id:` it saw, so the server can replay what was missed.

// 2. SSE on the server — note the two lines people forget.
app.get("/stream", (req, res) => {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    "Connection": "keep-alive",
    "X-Accel-Buffering": "no",     // nginx will buffer otherwise, and
                                    // the stream appears to hang
  });

  const since = req.headers["last-event-id"];
  if (since) replayFrom(since, res);

  const send = (ev) => res.write(`id: ${ev.id}\nevent: ${ev.type}\ndata: ${JSON.stringify(ev.data)}\n\n`);
  const unsubscribe = bus.subscribe(req.user.id, send);

  // A comment every 20s: keeps intermediaries from killing an idle
  // connection, and lets the server notice a dead client.
  const ping = setInterval(() => res.write(": ping\n\n"), 20_000);

  req.on("close", () => { clearInterval(ping); unsubscribe(); });
});
// The `req.on("close")` cleanup is not optional: without it every
// disconnected client leaves a subscription and a timer behind, and
// the process leaks until it is restarted.

// 3. WebSocket reconnection with backoff, which you must write.
function connect(url, onMessage) {
  let attempt = 0, ws;
  const open = () => {
    ws = new WebSocket(url);
    ws.onopen = () => { attempt = 0; };
    ws.onmessage = (e) => onMessage(JSON.parse(e.data));
    ws.onclose = () => {
      const delay = Math.min(30_000, 500 * 2 ** attempt++) * (0.5 + Math.random());
      setTimeout(open, delay);         // jitter, or every client
    };                                  // reconnects in lockstep
  };
  open();
  return () => ws?.close();
}
// The jitter matters most on deploy: ten thousand clients
// disconnected at the same instant will reconnect at the same
// instant without it, and the reconnect storm is worse than the
// deploy.

// 4. Authentication via a short-lived ticket, avoiding the query
//    string problem.
const { ticket } = await fetch("/api/ws-ticket", { method: "POST" }).then((r) => r.json());
const ws = new WebSocket(`wss://example.com/ws?ticket=${ticket}`);
// The ticket is single-use and expires in ~30 seconds, so even
// though it appears in access logs and proxy logs, it is worthless
// by the time anyone reads them. A long-lived bearer token in a URL
// is not.
```
:::

:::failure
**WebSockets by default.** You acquire connection state, heartbeats, reconnection, replay and a
new authentication story, for a feature that only needed server-to-client messages. SSE gives
three of those for free.

**No heartbeat.** A TCP connection whose peer has vanished — laptop lid closed, mobile network
switched, NAT mapping expired — looks identical to an idle one. Without a ping you discover it on
the next write, which may be hours later, and until then you believe you have a connected client.

**Buffering proxies.** nginx buffers responses by default, so an SSE stream is held until the
buffer fills and the feature appears to do nothing. `X-Accel-Buffering: no`, or
`proxy_buffering off`. This costs people hours because the code is correct.

**Idle timeouts you did not set.** Most load balancers close connections after 60 seconds of
silence. A connection with nothing to say must still say something.

**No cleanup on disconnect.** Every abandoned connection leaves a subscription, a timer and
possibly a database handle. The process grows until it is restarted, and the symptom appears as a
slow memory leak unrelated to anything.

**A token in the query string.** URLs are written to access logs, proxy logs, browser history and
`Referer` headers. A long-lived token there is a credential in plaintext in several systems.
Use a short-lived single-use ticket.

**Checking authorisation only at connect.** A connection can live for hours. If a user's
permissions are revoked, nothing re-checks — you have to push the revocation to the connection or
re-validate periodically.

**Assuming the connection is the source of truth.** Messages are lost across reconnects unless you
design replay. The connection is a transport, and the client's state has to be reconstructable
from a request — which means "fetch current state, then subscribe" rather than "subscribe and
accumulate".

**Deploying without considering the herd.** Rolling a fleet disconnects every client at once, and
they all reconnect immediately, hitting a server with cold caches and an empty connection pool.
Jittered client backoff plus staggered rollout.

**Polling with a short interval as a fix for latency.** Halving the interval doubles the load and
halves the worst-case latency. At some point server push is cheaper in both dimensions, and the
crossover is earlier than people expect.
:::

:::realworld
```text
// What to use, by what the feature actually needs.

  Notification badge, feed updates, progress bars, build logs,
  dashboards, AI token streaming
    → SSE. One direction, plain HTTP, free reconnection and replay.
      This covers most "realtime" features people build WebSockets
      for.

  Chat, collaborative editing, multiplayer, live cursors
    → WebSockets. Genuinely bidirectional and latency-sensitive.

  "Has this job finished" checked occasionally
    → polling, with a sensible interval. Stateless and cacheable.
      Do not build a connection for something checked twice.

  Server-to-server events
    → webhooks, or a message queue. A long-lived connection between
      your own services is usually the wrong answer when a queue
      gives you durability and retries.

// Scaling note, which is the part that bites after launch:
//
//   Server A holds Asha's connection. An event for Asha is generated
//   on server B. B has no way to reach her.
//
//   So you need a shared pub/sub layer — Redis, NATS, a managed
//   service — with every app server subscribing and forwarding to
//   its own connections. That is an extra component with its own
//   availability, and it is not optional past one server. Designing
//   as if it were avoidable is the usual mistake.
```

```text
// The pattern that makes any of these correct:
//
//   1. Fetch the current state over ordinary HTTP.
//   2. Subscribe for updates.
//   3. On reconnect, go back to step 1 — or replay from the last
//      event id if you built that.
//
// The connection is a latency optimisation over polling, not the
// source of truth. Designing it that way means a dropped connection
// is a brief delay rather than a corrupt client state, and it is
// what lets you deploy without worrying.
```
:::

:::mistakes
**WebSockets where SSE would do.** You take on reconnection, heartbeats and replay.

**No heartbeat.** A dead connection is indistinguishable from an idle one.

**Proxy buffering.** The stream appears to hang; the code is fine.

**No cleanup on disconnect.** Leaks subscriptions and timers.

**A long-lived token in a connect URL.** It lands in logs. Use a ticket.

**Authorising only at connect.** Revocation never takes effect.

**Treating the stream as the source of truth.** Design fetch-then-subscribe.

**No jitter on reconnect.** The deploy becomes a thundering herd.

**Assuming one server.** Past one process you need shared pub/sub.

**Shortening a poll interval instead of switching mechanism.** Linear cost for sublinear benefit.
:::

:::tradeoffs
**Polling** — stateless, cacheable, works through every proxy, trivially debugged with curl. Costs
wasted requests and latency bounded by the interval. The right answer more often than it is
chosen.

**Long polling** — near-realtime over plain HTTP with no empty responses, at the cost of a held
request per client. Mainly of historical interest now, though still the most compatible push
mechanism.

**SSE** — plain HTTP, automatic reconnection, event ids for replay, works through proxies that
understand chunked responses. One direction only, text only, and browsers historically limited
concurrent connections per origin on HTTP/1.1 — which HTTP/2 multiplexing resolves.

**WebSockets** — bidirectional, low latency, small binary frames. You own heartbeats,
reconnection, replay, authentication and backpressure, and some corporate proxies block the
upgrade.

**Webhooks** — for server-to-server, the right shape: no held connection, and the receiver must be
publicly reachable and you must handle retries and signing.

**A message queue** — durability, retries and replay that none of the above provide, at the cost of
another system and higher latency.

The ordering that holds in practice: **polling if it is infrequent, SSE if it flows one way,
WebSockets only if you genuinely send upward.** And whichever you choose, design fetch-then-
subscribe, so a dropped connection costs latency rather than correctness.
:::

:::checkpoint
1. Ten thousand clients, updates every five minutes. Give the request rate for polling at 10s
   versus SSE.
2. What three things does SSE give you that you would implement yourself with WebSockets?
3. Why is a dead connection indistinguishable from an idle one, and what fixes it?
4. Your SSE endpoint works locally and hangs behind nginx. Why?
5. Why is a bearer token in a WebSocket URL a problem, and what do you use instead?
6. A user's permissions are revoked while they hold a connection. What happens?
7. Why do you need shared pub/sub as soon as you have two app servers?
8. Describe fetch-then-subscribe and what it protects against.
:::

:::interview
Choose by what the feature needs, and show that WebSockets are not the default:

*"Polling if updates are infrequent, because it is stateless, cacheable and survives every proxy.
SSE if updates flow one way, which covers notifications, progress, dashboards, feeds and token
streaming — it is plain HTTP, and the browser gives you automatic reconnection plus `Last-Event-ID`
so the server can replay what was missed. WebSockets only when I genuinely need to send upward
with low latency: chat, collaborative editing, games. Reaching for WebSockets by default means
taking on heartbeats, reconnection, replay and a new authentication story for a capability most
features never use."*

Then the operational point, which is what separates having read about this from having run it:

*"The real cost of a long-lived connection is that it makes the server stateful, and statelessness
was doing a lot of work. A deploy disconnects every client simultaneously, so they reconnect
simultaneously against a cold server — which is why client backoff needs jitter and rollouts need
staggering. Connection count becomes a capacity limit alongside request rate. And as soon as there
are two app servers you need shared pub/sub, because the server holding a user's connection is
probably not the one that generated their event."*

Add a detail or two that only come from debugging it:

*"Two things that cost people hours. A dead connection looks exactly like an idle one — TCP gives
you no notification when a laptop lid closes or a NAT mapping expires — so you need heartbeats to
discover it rather than finding out on the next write. And nginx buffers responses by default, so
an SSE stream appears to hang while the code is perfectly correct; it needs
`X-Accel-Buffering: no`."*

And the design principle: *"whatever the mechanism, I design fetch-then-subscribe — get current
state over ordinary HTTP, then subscribe for deltas, and on reconnect fetch again. The connection
is a latency optimisation over polling, not the source of truth, which means a dropped connection
costs a moment rather than leaving the client with corrupt state."*
:::

## What you now know

- Polling is stateless and cacheable; its cost is wasted requests and latency bounded by the
  interval.
- Long polling removes empty responses at the cost of a held request per client.
- SSE is a never-ending HTTP response: plain HTTP, one direction, text only.
- SSE gives automatic reconnection, `Last-Event-ID` replay and no new protocol for free.
- WebSockets are bidirectional and make you implement heartbeats, reconnection and replay.
- A long-lived connection makes the server stateful, which returns the problems statelessness
  solved.
- A dead connection is indistinguishable from an idle one without heartbeats.
- Proxies buffer by default — `X-Accel-Buffering: no` for nginx.
- Load balancers close idle connections, so an idle stream must still send something.
- Always clean up subscriptions and timers on disconnect, or the process leaks.
- Tokens in URLs land in access logs, proxy logs and history; use a short-lived single-use ticket.
- Authorisation at connect time does not cover a connection that lives for hours.
- Reconnect backoff needs jitter, or a deploy becomes a thundering herd.
- Two app servers require shared pub/sub to route events to the right connection.
- Design fetch-then-subscribe, so the connection is an optimisation rather than the truth.
