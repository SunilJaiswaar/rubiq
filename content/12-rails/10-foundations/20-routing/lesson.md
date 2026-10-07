---
title: Routing
summary: Mapping HTTP verbs and paths to code, and why REST conventions save you from inventing names.
level: intermediate
minutes: 13
version: "8.0"
status: stable
last_reviewed: "2026-10-07"
tags: [rails, routing, rest]
concepts: [routing, rest, nested-resources]
prerequisites: [rack, request-lifecycle]
interview:
  - question: What does `resources :orders` generate, and why those seven routes?
    level: intermediate
    answer: >-
      Seven routes covering the full lifecycle of a collection: index and show to read,
      new and create to add, edit and update to change, destroy to remove. The pairs exist
      because HTML has no way to submit a PATCH or DELETE directly, so `new` and `edit`
      serve the form and `create`/`update` receive it. For an API you would use
      `only: [:index, :show, :create, :update, :destroy]` since the form-serving routes
      have no purpose. The value of the convention is not the seven routes — it is that
      every Rails developer already knows what `OrdersController#show` does.
    followUps:
      - "When would you add a non-RESTful route, and how would you name it?"
      - "Why is deep nesting discouraged?"
  - question: Why should routes be nested at most one level deep?
    level: intermediate
    answer: >-
      Because the URL only needs enough information to find the record, and a nested id is
      usually redundant once the child id is unique. `/orders/42/items/7` carries an order
      id that `Item.find(7)` does not need, so the controller either ignores it — making
      the URL a lie — or has to verify it matches, which is extra work on every request.
      One level expresses the relationship; more than that produces long URLs, unwieldy
      helper names like `order_item_comment_path`, and ambiguity about which parent is
      authoritative.
resources:
  - title: "Rails Guides — Routing"
    url: https://guides.rubyonrails.org/routing.html
---

## The problem routing solves

A request arrives: `PATCH /orders/42`. Something must decide which Ruby method runs and
what `42` means.

```ruby
# Without a router, by hand:
def handle(method, path)
  if method == "GET" && path == "/orders"
    OrdersController.new.index
  elsif method == "GET" && path =~ %r{\A/orders/(\d+)\z}
    OrdersController.new.show(id: $1)
  elsif method == "PATCH" && path =~ %r{\A/orders/(\d+)\z}
    OrdersController.new.update(id: $1)
  # ...twenty more, for one resource
  end
end
```

:::problem
Three things go wrong as this grows. The dispatch table becomes unreadable. Generating a
URL for a link means duplicating the pattern somewhere else, so paths drift out of sync
with routes. And every developer invents their own naming, so nothing is guessable.

That third one is the expensive problem. A codebase where one resource uses `/orders/list`
and another uses `/products/all` costs a reader something every single time.
:::

:::what
A **router** maps (HTTP method, path) to a controller action, extracts path segments as
parameters, and generates URLs in reverse so you never write a path by hand.

**REST** here means a convention: a fixed set of seven actions per resource, so the names
are never a decision.
:::

## The seven, and why

```ruby
# config/routes.rb
Rails.application.routes.draw do
  resources :orders
end
```

```bash
$ bin/rails routes -c orders
   Prefix Verb   URI Pattern            Controller#Action
   orders GET    /orders                orders#index     # list them
          POST   /orders                orders#create    # add one
new_order GET    /orders/new            orders#new       # form to add
edit_order GET   /orders/:id/edit       orders#edit      # form to change
    order GET    /orders/:id            orders#show      # one of them
          PATCH  /orders/:id            orders#update    # change it
          DELETE /orders/:id            orders#destroy   # remove it
```

:::how
```text
  Four operations, seven routes. The extra three are an HTML limitation:

    read one       GET    /orders/:id        show
    read many      GET    /orders            index
    create         POST   /orders            create
      + the form   GET    /orders/new        new       ← HTML needs a page
    update         PATCH  /orders/:id        update
      + the form   GET    /orders/:id/edit   edit      ← HTML needs a page
    delete         DELETE /orders/:id        destroy

  An API has no forms, so:

    resources :orders, only: [:index, :show, :create, :update, :destroy]
```

And the reverse direction, which is the half people underuse:

```erb
<%= link_to "All orders", orders_path %>          <!-- /orders -->
<%= link_to order.id, order_path(order) %>        <!-- /orders/42 -->
<%= link_to "Edit", edit_order_path(order) %>     <!-- /orders/42/edit -->
<%= button_to "Delete", order_path(order), method: :delete %>
```

Never write `"/orders/#{order.id}"` in a view. The helper means changing the route changes
every link, and a typo is a NoMethodError at render time rather than a 404 in production.
:::

:::why
The convention's value is not the seven routes — you could write those by hand. It is that
**the names are not a decision**.

A new developer opening `OrdersController` knows what `show` does before reading it. A
reviewer seeing `POST /orders` knows it creates one. An API consumer can guess
`/orders/42`. Every one of those is a small saving, and they happen constantly.

The cost of inventing your own is paid every time someone reads the code, forever.
:::

## Nesting, and where to stop

```ruby
# One level: expresses that items belong to an order.
resources :orders do
  resources :items
end
# → /orders/42/items
#   /orders/42/items/7     ← the order id is now redundant
```

:::mistakes
**Nesting more than one level deep.** It produces URLs and helper names that nobody wants:

```ruby
# Don't:
resources :orders do
  resources :items do
    resources :comments        # /orders/42/items/7/comments/3
  end                           # order_item_comment_path(order, item, comment)
end
```

The convention that solves this — **nest only the collection, not the member**:

```ruby
# Do:
resources :orders do
  resources :items, only: [:index, :new, :create]   # needs the parent
end
resources :items, only: [:show, :edit, :update, :destroy]  # does not

# → POST /orders/42/items     (which order? the parent is needed)
#   GET  /items/7             (item 7 is unique; the order id adds nothing)
```

This is `shallow: true`, and Rails gives it to you directly:

```ruby
resources :orders do
  resources :items, shallow: true
end
```

**A nested id you do not verify is a security bug.** If the route is `/orders/42/items/7`
and the controller does `Item.find(params[:id])`, then `/orders/999/items/7` returns item 7
regardless of who owns order 999. The URL implies a check that is not happening:

```ruby
# Wrong: the order id in the path is decoration.
def show
  @item = Item.find(params[:id])
end

# Right: scope through the parent, so the relationship is enforced.
def show
  @order = current_user.orders.find(params[:order_id])
  @item  = @order.items.find(params[:id])
end
```

Scoping through `current_user` also makes an unauthorised request a 404 rather than a 403,
which leaks less — the attacker cannot distinguish "exists but not yours" from "does not
exist".

**Reaching for `match` with `via: :all`.** It makes one path respond to every verb,
including HEAD and OPTIONS, which is almost never intended and defeats CSRF reasoning.

**Route order matters, and the first match wins:**

```ruby
get "/orders/:id", to: "orders#show"
get "/orders/new", to: "orders#new"     # unreachable — ":id" matched "new" first
```

`resources` orders them correctly for you, which is one more reason to prefer it.
:::

## When the resource is not a noun

The usual complaint about REST is that real applications have actions that are not CRUD —
publishing, archiving, cancelling, exporting.

```ruby
# Option 1: a member/collection route. Fine for one or two.
resources :orders do
  member     { post :cancel }      # POST /orders/42/cancel
  collection { get  :export }      # GET  /orders/export
end

# Option 2 — usually better: treat the action as a resource.
resources :orders do
  resource :cancellation, only: [:create]    # POST /orders/42/cancellation
end
# → CancellationsController#create
```

:::realworld
Option 2 looks like a trick and is genuinely useful, because the "action" almost always
turns out to have a lifecycle of its own.

A cancellation has a reason, a timestamp, a user who performed it, and eventually you will
want to list them or undo one. If it was a `cancel` action on `OrdersController`, all of
that accretes into a controller that is about orders. As `CancellationsController` it has
somewhere to live, and `destroy` is already the obvious name for undoing it.

The heuristic: **if the verb has state, it is a noun.** `cancel` with a reason and a
timestamp is a `Cancellation`. `publish` with a scheduled time is a `Publication`.

```ruby
# Other routing pieces worth knowing:

# Constraints — reject bad input at the router, before any controller runs.
resources :orders, constraints: { id: /\d+/ }

# Namespacing for versioned APIs.
namespace :api do
  namespace :v1 do
    resources :orders, only: [:index, :show]   # /api/v1/orders
  end
end

# A singular resource — no id, because there is only one per user.
resource :profile, only: [:show, :edit, :update]   # /profile

# Default format, so the API does not depend on an Accept header.
namespace :api, defaults: { format: :json } do
  resources :orders
end

# Rails 8: the built-in health check, deliberately above the app.
get "up" => "rails/health#show", as: :rails_health_check
```
:::

:::failure
**A route that is never reached is silent.** Nothing warns you — the request just gets the
earlier match. `bin/rails routes` shows order, and reading it top to bottom is the only
check.

**A catch-all route swallows your 404s:**

```ruby
# This must be last, and it will match literally everything after it.
get "*path", to: "pages#show"
```

Put a catch-all above an API namespace and every API request becomes a page lookup. It is
also how a single-page-app fallback accidentally starts serving HTML to JSON clients.

**Constraints that are too loose leak into the controller.** Without
`constraints: { id: /\d+/ }`, the path `/orders/abc` reaches `Order.find("abc")`, which
raises `RecordNotFound` and produces a 404 — fine. But `/orders/1%20OR%201=1` also reaches
the controller, and whether that is safe depends entirely on what the controller does with
it. Constraining at the router means the question never arises.
:::

:::tradeoffs
**RESTful conventions.** Names are not a decision, URLs are guessable, helpers are
generated, and every Rails developer can navigate an unfamiliar codebase. HTTP caching and
intermediaries work correctly because the verbs mean what they say.

Costs: real applications have operations that are awkward as nouns, and forcing them
produces either a long tail of member routes or resources like `Cancellation` that feel
invented. Deep hierarchies are genuinely poorly served.

**RPC-style routes** (`POST /orders/cancel`, `POST /orders/bulkUpdate`) map directly onto
whatever your application does, with no translation.

Costs: every name is a decision, and therefore inconsistent across a team. Verbs stop
carrying meaning, so caching and retry semantics have to be documented rather than
inferred. GraphQL is the coherent version of this trade — one endpoint, all semantics in
the payload — and it gives up HTTP caching almost entirely in exchange.

The pragmatic middle, which most Rails codebases land on: **RESTful by default, a named
route when the alternative is contorted, and a new resource when the verb has state.**
:::

:::checkpoint
Write the routes for:

1. Blog posts, publicly readable, editable only by admins at `/admin/posts`.
2. Comments on a post — creatable from the post page, editable on their own.
3. "Publish" on a post, where publishing records who did it and when.
4. A JSON API at `/api/v2/posts`, read-only, defaulting to JSON with no Accept header.

Then: for number 2, write the `show` action in a way that would make
`/posts/999/comments/5` return 404 rather than comment 5.
:::

:::interview
Routing questions usually test whether you treat REST as a rule you follow or a trade-off
you understand.

For `resources :orders`: name the seven, then explain the pairing — *"new and edit exist
because HTML cannot submit PATCH or DELETE, so they serve the form that create and update
receive. An API drops them."*

The better question is the non-CRUD one, and the strong answer has a heuristic rather than a
preference: *"a member route is fine for one or two, but if the verb has state — a
cancellation has a reason, a timestamp and a user — then it is a noun, and
`POST /orders/42/cancellation` gives it somewhere to live and makes `destroy` the obvious
name for undoing it."*

On nesting, lead with the security angle, which most candidates miss: *"at most one level,
and shallow beyond that. And a nested id you do not scope through is worse than useless —
`/orders/999/items/7` returning item 7 means the URL implies an ownership check that is not
happening. I scope through `current_user.orders` so the relationship is enforced and an
unauthorised request is a 404 rather than a 403."*
:::

## What you now know

- `resources` generates seven routes; `new` and `edit` exist only because HTML cannot
  submit PATCH or DELETE.
- The convention's value is that names are not a decision — guessable for readers and API
  consumers alike.
- Always use path helpers, never interpolate a path. A route change then updates every
  link.
- Nest one level at most, and use `shallow: true` beyond it.
- Scope nested lookups through the parent, or the id in the URL is decoration and an
  authorisation hole.
- Route order matters and a shadowed route fails silently. Read `bin/rails routes`.
- If a verb has state, make it a resource. `cancel` becomes `Cancellation`.
- Constrain ids at the router so malformed input never reaches a controller.
