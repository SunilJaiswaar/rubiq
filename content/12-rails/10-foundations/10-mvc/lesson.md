---
title: What happens when a request arrives
summary: Rack, the middleware stack, the router, the controller. Follow one request all the way down and Rails stops being magic.
level: intermediate
minutes: 16
version: "8.0"
status: stable
last_reviewed: "2026-10-07"
tags: [rails, mvc, rack, middleware]
concepts: [rack, middleware, mvc, request-lifecycle]
prerequisites: [objects, method-lookup]
interview:
  - question: Walk me through what happens when a request hits a Rails app.
    level: intermediate
    answer: >-
      The web server (Puma) accepts the TCP connection, parses the HTTP request and builds
      a Rack `env` hash. That hash is passed down the middleware stack — each middleware is
      an object with a `call(env)` method that may inspect or modify the request, call the
      next one, and then inspect or modify the response on the way back. At the bottom is
      the router, which matches the method and path to a controller and action. The
      controller runs its filters, the action, and renders a view or serialises JSON,
      returning `[status, headers, body]`. That triple travels back up the middleware
      stack, each layer getting a chance to modify it, and Puma writes it to the socket.
    followUps:
      - "What is in the Rack env hash?"
      - "Give me two things the middleware stack does that you would otherwise write yourself."
  - question: What is Rack, and why does it matter?
    level: intermediate
    answer: >-
      Rack is a one-method interface: an object that responds to `call(env)` and returns
      `[status, headers, body]`. That is the entire contract between Ruby web servers and
      Ruby web frameworks. It matters because it decouples them — Rails, Sinatra, Hanami and
      Roda all run on Puma, Unicorn or Falcon without knowing about each other, and you can
      insert your own middleware into any of them. Rails itself is a Rack application; so is
      every piece of its middleware stack.
resources:
  - title: "Rails Guides — Rails on Rack"
    url: https://guides.rubyonrails.org/rails_on_rack.html
  - title: "Rack specification"
    url: https://github.com/rack/rack/blob/main/SPEC.rdoc
---

## What you would have to build

Before frameworks, handling a web request meant doing all of this yourself:

```text
  accept a TCP connection
  read bytes until the headers end
  parse the request line and headers
  decode the URL and query string
  parse the body — form-encoded? JSON? multipart?
  look up a cookie, decrypt the session
  check the CSRF token
  decide which code handles GET /orders/42
  extract "42" from the path
  run the code
  render HTML or JSON
  set headers, compress, write to the socket
```

Every one of those is the same for every application. Only two lines in the middle differ.

:::problem
Writing a web application should be writing the part that is specific to your application.
But the generic parts are not optional and are individually fiddly — HTTP parsing, session
decryption, CSRF verification, content negotiation. Each one has security implications if
you get it wrong.

Worse: if every framework builds its own, then choosing a framework means choosing a web
server, and a library written for one cannot be used with another.
:::

:::what
**Rack** is the interface that solves the second problem. A Rack application is any object
responding to `call(env)` and returning `[status, headers, body]`.

**Middleware** is a Rack application that wraps another one. The **middleware stack** is
how Rails composes all the generic work into layers you can inspect, reorder and add to.
:::

## Rack is genuinely this small

```ruby
# A complete, working Rack application.
app = ->(env) {
  [200, { "content-type" => "text/plain" }, ["Hello from #{env['PATH_INFO']}"]]
}

# run it:  rackup config.ru   with   run app
```

```ruby
# A complete middleware. It takes the next app and calls it.
class RequestTimer
  def initialize(app)
    @app = app
  end

  def call(env)
    started = Process.clock_gettime(Process::CLOCK_MONOTONIC)
    status, headers, body = @app.call(env)        # ← down the stack
    elapsed = Process.clock_gettime(Process::CLOCK_MONOTONIC) - started
    headers["x-runtime"] = elapsed.round(4).to_s   # ← and back up
    [status, headers, body]
  end
end
```

That is the whole pattern, and Rails' entire request handling is built out of it.

:::how
```text
  Puma accepts the connection, builds env, and calls the stack:

  ┌──────────────────────────────────────────────────────────────┐
  │ ActionDispatch::HostAuthorization    blocks unknown Host     │
  │ ┌──────────────────────────────────────────────────────────┐ │
  │ │ Rack::Sendfile            X-Sendfile for static files    │ │
  │ │ ┌──────────────────────────────────────────────────────┐ │ │
  │ │ │ ActionDispatch::Static    serve from public/         │ │ │
  │ │ │ ┌──────────────────────────────────────────────────┐ │ │ │
  │ │ │ │ Rack::Runtime             sets X-Runtime         │ │ │ │
  │ │ │ │ ActionDispatch::Executor  reloading, autoload    │ │ │ │
  │ │ │ │ ActionDispatch::Cookies   parse / sign cookies   │ │ │ │
  │ │ │ │ ActionDispatch::Session   decrypt the session    │ │ │ │
  │ │ │ │ ActionDispatch::Flash     flash messages         │ │ │ │
  │ │ │ │ ActionDispatch::Callbacks                         │ │ │ │
  │ │ │ │ ┌──────────────────────────────────────────────┐ │ │ │ │
  │ │ │ │ │  Rails.application.routes                    │ │ │ │ │
  │ │ │ │ │     ↓ matches GET /orders/42                 │ │ │ │ │
  │ │ │ │ │  OrdersController#show                       │ │ │ │ │
  │ │ │ │ │     before_action :authenticate              │ │ │ │ │
  │ │ │ │ │     the action                                │ │ │ │ │
  │ │ │ │ │     render → [200, headers, body]            │ │ │ │ │
  │ │ │ │ └──────────────────────────────────────────────┘ │ │ │ │
  │ │ │ └──────────────────────────────────────────────────┘ │ │ │
  │ │ └──────────────────────────────────────────────────────┘ │ │
  │ └──────────────────────────────────────────────────────────┘ │
  └──────────────────────────────────────────────────────────────┘
                    ↑ the response travels back up,
                      each layer able to modify it
```

Look at it in your own application:

```bash
$ bin/rails middleware
use ActionDispatch::HostAuthorization
use Rack::Sendfile
use ActionDispatch::Static
use ActionDispatch::Executor
use ActionDispatch::Cookies
use ActionDispatch::Session::CookieStore
use ActionDispatch::Flash
use Rack::MethodOverride
use ActionDispatch::Request::Session
run MyApp::Application.routes
```

That list is the answer to "what is Rails doing on my behalf", and almost nobody looks at
it.
:::

:::why
Two payoffs from making the stack explicit rather than hard-coded.

**You can see the cost.** Every request pays for every layer. Session decryption on an API
endpoint that has no session is pure waste, and because the stack is a list you can remove
it:

```ruby
# config/application.rb — an API-only app does not need these
config.middleware.delete ActionDispatch::Cookies
config.middleware.delete ActionDispatch::Session::CookieStore
config.middleware.delete ActionDispatch::Flash
```

**You can insert your own.** Cross-cutting concerns that apply to every request belong here
rather than in a `before_action` repeated in twelve controllers:

```ruby
config.middleware.insert_before ActionDispatch::Static, RequestTimer
config.middleware.use Rack::Attack        # rate limiting, before the app runs
```

Rate limiting is the clearest case: you want to reject a flood *before* it reaches the
router, the session decryption or the database. Middleware is the only place that is
possible.
:::

## MVC, and the part everyone gets wrong

```text
  Request ──▶ Router ──▶ Controller ──▶ Model ──▶ Database
                              │
                              ▼
                            View ──▶ Response
```

:::mistakes
**Business logic in the controller.** The single most common Rails design error. A
controller's job is to translate HTTP into a method call and the result back into HTTP —
nothing else.

```ruby
# Wrong: the controller knows about pricing, inventory and email.
class OrdersController < ApplicationController
  def create
    @order = Order.new(order_params)
    @order.total = @order.items.sum { |i| i.price * i.quantity }
    @order.total *= 1.18 if @order.user.country == "IN"
    if @order.total > 5000
      @order.discount = @order.total * 0.05
      @order.total -= @order.discount
    end
    if @order.save
      InventoryItem.where(id: @order.item_ids).update_all("stock = stock - 1")
      OrderMailer.confirmation(@order).deliver_now
      redirect_to @order
    else
      render :new, status: :unprocessable_entity
    end
  end
end
```

```ruby
# Right: HTTP in, HTTP out. The decisions live somewhere testable.
class OrdersController < ApplicationController
  def create
    result = PlaceOrder.new(current_user).call(order_params)

    if result.success?
      redirect_to result.order
    else
      @order = result.order
      render :new, status: :unprocessable_entity
    end
  end
end
```

The test for whether logic belongs in a controller: **could this rule ever apply outside
an HTTP request?** Pricing applies in a rake task, a background job and a CSV import. It
does not belong somewhere only reachable by a request.

**Thinking "fat model, skinny controller" means put it all in the model.** It means *not in
the controller*. A 2,000-line `User` model is a different problem, not a solution — which
is what the service-objects lesson is about.

**Rendering in a `before_action` without understanding the chain.** Calling `render` or
`redirect_to` in a filter halts it; returning early does not:

```ruby
before_action :require_admin

def require_admin
  redirect_to root_path unless current_user&.admin?   # halts the chain
  # `return unless ...` would NOT halt it — the action still runs
end
```
:::

:::internals
**What is actually in `env`.** A plain hash, mostly CGI-style keys:

```ruby
{
  "REQUEST_METHOD"  => "GET",
  "PATH_INFO"       => "/orders/42",
  "QUERY_STRING"    => "page=2",
  "HTTP_HOST"       => "example.com",
  "HTTP_COOKIE"     => "_session=abc...",
  "HTTP_USER_AGENT" => "Mozilla/5.0...",
  "rack.input"      => #<StringIO>,     # the request body, as an IO
  "rack.url_scheme" => "https",
  # ...and after the middleware has run:
  "action_dispatch.request.parameters" => { "id" => "42", "page" => "2" },
  "rack.session"    => #<ActionDispatch::Request::Session>,
}
```

Note that headers are `HTTP_`-prefixed and upcased with dashes as underscores — a legacy of
CGI that Rack preserved for compatibility. `ActionDispatch::Request` wraps this hash to give
you `request.headers`, `request.params` and so on; `request.env` is the raw thing.

**The body is an IO, not a string**, and it can only be read once. That is why reading the
raw body in a controller after Rails has already parsed it gives you an empty string unless
you rewind it.

**Why this design and not inheritance.** Middleware composes by wrapping, so order is data
rather than code — you can insert, delete and reorder at boot. A class hierarchy would make
the same stack a compile-time decision, and third-party gems could not insert themselves
into the middle of it.
:::

:::realworld
```ruby
# Middleware is the right place for anything that must happen before the app,
# or must happen even when the app raises.

# 1. Rate limiting — reject before touching the database.
Rack::Attack.throttle("req/ip", limit: 300, period: 5.minutes) { |req| req.ip }

# 2. Request IDs for log correlation — Rails includes this by default.
#    Every log line in a request carries the same id, so you can grep one request
#    out of a million interleaved lines.

# 3. Health checks that must answer even if the database is down.
class HealthCheck
  def initialize(app) = @app = app
  def call(env)
    return [200, { "content-type" => "text/plain" }, ["ok"]] if env["PATH_INFO"] == "/up"
    @app.call(env)
  end
end
# Inserted near the top, it answers without the router, session or database.
```

That third one matters operationally: a health check routed through the full stack reports
unhealthy when the *database* is down, which may be correct — or may take your whole fleet
out of the load balancer during a brief database blip. Where you insert it is a deliberate
decision about what "healthy" means.
:::

:::failure
**Middleware runs for every request, so a slow one is slow everywhere.** A middleware that
makes a network call — fetching a feature flag, checking a token with an auth service —
adds its latency to every single request including static assets and health checks.

**Middleware ordering bugs are subtle.** A middleware inserted *before* the session
middleware cannot read the session, because it has not been decrypted yet. One inserted
after `ActionDispatch::Static` will never see requests for static files.

```ruby
# Reading the session in middleware requires being below it in the stack:
config.middleware.insert_after ActionDispatch::Session::CookieStore, MyAuditLogger
```

**An exception raised in middleware bypasses your controller's `rescue_from`.** Error
handling in `ApplicationController` only covers code the controller reached. Middleware
failures surface as raw 500s from `ActionDispatch::ShowExceptions`, which is why
error-reporting gems install themselves as middleware rather than as a controller concern.
:::

:::tradeoffs
**The convention.** You write the specific part and get HTTP parsing, sessions, CSRF,
parameter decoding and content negotiation correct by default — including several things
with security consequences that are easy to get subtly wrong by hand.

The costs are real and worth naming:

- **You pay for every layer on every request**, whether you need it or not. A JSON API
  running the full default stack is doing session work it will never use.
- **Debugging requires knowing the stack exists.** "Why is my header missing" or "why is
  this request 404 before it reaches my route" are stack questions, and nothing in the
  controller hints at that.
- **Convention over configuration is excellent until you need the unconventional thing**,
  at which point you are fighting defaults you did not choose and may not know about.

The honest summary: Rails trades a steep *conceptual* learning curve for a very shallow
*initial* one. You can ship in a week without understanding any of this, and the day you
need to debug it you need all of it.
:::

:::checkpoint
In any Rails application:

```bash
bin/rails middleware        # how many layers? which could you remove?
bin/rails routes | head -20
```

Then answer: a request for `/favicon.ico` reaches which layer and stops? A request with an
invalid session cookie — which layer notices, and what does the controller see?

Then: write a middleware that adds a `x-request-duration` header. Where in the stack must
it go to time the *whole* request rather than just the controller?
:::

:::interview
"Walk me through a Rails request" is one of the most common Rails interview questions, and
most answers are "the router sends it to a controller, which talks to the model and renders
a view" — which is MVC, not the request lifecycle.

A strong answer names the layers: *"Puma parses HTTP and builds a Rack env hash, which goes
down the middleware stack — each middleware is an object with `call(env)` that can modify
the request, call the next layer, and modify the response coming back. Sessions, cookies and
CSRF all happen there. At the bottom the router matches method and path to a controller
action, which runs its filters and renders, returning status, headers and body back up the
stack."*

Then the detail that separates it: *"and because the stack is a list rather than a hierarchy,
you can see it with `bin/rails middleware` and change it — which is where rate limiting
belongs, because you want to reject a flood before it reaches the router or the database."*
:::

## What you now know

- Rack is one method: `call(env)` returning `[status, headers, body]`. That is the whole
  contract between Ruby servers and frameworks.
- Middleware wraps the next app, so it sees the request going down and the response coming
  back up.
- Rails' generic work — cookies, sessions, flash, CSRF, static files — is middleware, and
  `bin/rails middleware` lists it.
- Every request pays for every layer. An API can and should delete the ones it does not
  use.
- Rate limiting, request IDs and health checks belong in middleware because they must act
  before the app.
- A controller translates HTTP to a method call and back. If a rule could apply outside a
  request, it does not belong there.
- Middleware ordering determines what it can see; exceptions there bypass controller error
  handling.
