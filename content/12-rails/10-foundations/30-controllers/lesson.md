---
title: Controllers and strong parameters
summary: What a controller should and should not do, and the mass-assignment vulnerability that shaped Rails' parameter handling.
level: intermediate
minutes: 13
version: "8.0"
status: stable
last_reviewed: "2026-10-07"
tags: [rails, controllers, security, strong-parameters]
concepts: [controllers, strong-parameters, mass-assignment, filters]
prerequisites: [routing, request-lifecycle]
interview:
  - question: What problem do strong parameters solve?
    level: intermediate
    hint: What happens if a form POST includes a field you did not put in the form?
    answer: >-
      Mass assignment. `User.new(params[:user])` sets every attribute present in the
      params, and params come from the client — so a crafted request can set
      `admin: true`, or `account_balance`, or any other column, whether or not your form
      has that field. Strong parameters make the allowed list explicit:
      `params.require(:user).permit(:name, :email)` raises if `user` is missing and
      silently drops anything not permitted. It is a default-deny list, which is the only
      kind that stays correct when someone adds a column.
    followUps:
      - "Why default-deny rather than a list of forbidden attributes?"
      - "How do you permit a nested hash or an array?"
  - question: What should a controller not do?
    level: intermediate
    answer: >-
      Business logic, data manipulation beyond loading what the action needs, and anything
      that would also be correct in a background job or a rake task. Its job is to
      translate HTTP into a method call and the result back into an HTTP response —
      choosing a status code, rendering a template or serialising JSON, setting a redirect.
      The test is whether the rule could ever apply outside a request; if it could, it does
      not belong there.
resources:
  - title: "Rails Guides — Action Controller Overview"
    url: https://guides.rubyonrails.org/action_controller_overview.html
---

## The vulnerability that changed Rails

In 2012, someone demonstrated the problem by committing to the Rails repository on GitHub
without write access. GitHub's Rails application did roughly this:

```ruby
# The form has fields for :name and :description.
def update
  @repo = Repository.find(params[:id])
  @repo.update(params[:repository])    # ← every submitted key is assigned
end
```

The form had two fields. `params[:repository]` had whatever the attacker sent, including a
`public_key_ids` array that reassigned a deploy key.

:::problem
`params` is **entirely attacker-controlled**. Not the form — the params. A form is a
suggestion about what a browser will send; nothing requires the client to use your form, or
a browser at all.

So any code of the shape `Model.new(params[:model])` assigns every column the attacker
chose to include. The columns they want are the ones that are not in your form:
`admin`, `role`, `verified`, `balance`, `user_id`.
:::

:::what
**Strong parameters** make the allowed attribute list explicit. `params` is an
`ActionController::Parameters`, not a Hash, and Active Record refuses to mass-assign from
it until you have called `permit`.
:::

```ruby
# Rails refuses this outright:
def create
  User.new(params[:user])
  # ActiveModel::ForbiddenAttributesError
end

# You must say what is allowed:
def create
  User.new(user_params)
end

private

def user_params
  params.require(:user).permit(:name, :email)
end
```

:::how
```text
  params.require(:user)        raises ParameterMissing if absent
                               → 400 Bad Request, not a nil error later

        .permit(:name, :email) returns a new Parameters with ONLY these keys
                               → anything else is silently dropped

  Submitted:  { user: { name: "A", email: "a@b.c", admin: "true" } }
  Permitted:  { name: "A", email: "a@b.c" }
                                 admin was dropped

  In development and test, unpermitted keys are logged:
    Unpermitted parameter: :admin
  Set action_on_unpermitted_parameters = :raise to make it loud.
```

The shapes you will need:

```ruby
# Nested hash
params.require(:order).permit(:note, address: [:line1, :city, :postcode])

# Array of scalars
params.require(:post).permit(:title, tag_ids: [])

# Array of hashes — nested attributes
params.require(:order).permit(items_attributes: [:id, :product_id, :quantity, :_destroy])

# Genuinely arbitrary keys (a JSON settings blob). Use sparingly and
# never for something that maps onto columns.
params.require(:config).permit(:name, preferences: {})
```

:::why
The crucial design choice is **default-deny**. Rails 3 had `attr_accessible`, a per-model
allow list, and before that `attr_protected`, a deny list.

A deny list is wrong in a way that is not obvious at first: it is correct only until
someone adds a column. Add `is_superuser` to a migration and forget to add it to
`attr_protected`, and you have a privilege-escalation bug introduced by a schema change,
in a file nobody reviewing the migration will look at.

Default-deny fails the other way: forget to permit a new attribute and the feature does not
work. That is a bug you find in the first minute of testing, not an exploit you find in a
post-mortem.
:::

## Filters

```ruby
class OrdersController < ApplicationController
  before_action :authenticate_user!
  before_action :set_order, only: [:show, :edit, :update, :destroy]
  after_action  :track_view, only: [:show]
  around_action :with_timing

  rescue_from ActiveRecord::RecordNotFound, with: :not_found

  def show; end

  def update
    if @order.update(order_params)
      redirect_to @order, notice: "Updated"
    else
      render :edit, status: :unprocessable_entity
    end
  end

  private

  # Scoped through current_user, so another user's order is a 404.
  def set_order
    @order = current_user.orders.find(params[:id])
  end

  def order_params
    params.require(:order).permit(:note, :quantity)
  end

  def not_found
    render file: "public/404.html", status: :not_found
  end
end
```

:::mistakes
**`render` or `redirect_to` in a filter halts the chain; `return` does not.**

```ruby
# Wrong — the action still runs.
def require_admin
  return unless current_user&.admin?
end

# Right — rendering or redirecting halts it.
def require_admin
  redirect_to root_path, alert: "Not allowed" unless current_user&.admin?
end

# Also right, and clearer about intent:
def require_admin
  head :forbidden unless current_user&.admin?
end
```

**Forgetting the status code on a failed form render.** The default is 200, which tells the
browser the submission succeeded:

```ruby
render :new, status: :unprocessable_entity    # 422 — required for Turbo to work
```

Turbo specifically requires a 4xx or 5xx on a failed form submission, so omitting this
produces a form that silently does nothing. It was easy to get away with before Hotwire;
now it is a visible bug.

**Finding records without scoping.** The most common authorisation hole in Rails:

```ruby
Order.find(params[:id])                # any logged-in user can read any order
current_user.orders.find(params[:id])  # scoped — a 404 for someone else's
```

**Overusing `skip_before_action`.** `skip_before_action :authenticate_user!` scattered
through controllers means the security posture is defined by exceptions, and nobody can
tell which endpoints are public without reading every file. An explicit `allow_unauthenticated`
in the few public actions reads better than subtracting from a default elsewhere.

**Instance variables as an implicit interface.** `@order` set in a filter and used in a
view is the Rails convention, and it is also an untyped, undeclared contract. Renaming it
breaks the view with no compiler to tell you.
:::

:::failure
**`permit!` permits everything** and is the thing to grep for in a code review:

```ruby
params.require(:user).permit!    # exactly the 2012 vulnerability, opted into
```

**Permitting an id you should not.** This is subtler and still common:

```ruby
# If user_id is permitted, an attacker reassigns ownership:
params.require(:order).permit(:note, :user_id)

# Set ownership from the session, never from params:
current_user.orders.create(params.require(:order).permit(:note))
```

**Nested attributes are a mass-assignment surface too.** `items_attributes` with `:id`
permitted lets a request update an item by id — and Rails will accept an id belonging to
someone else's order unless the association scoping prevents it. `accepts_nested_attributes_for`
is convenient and worth auditing specifically.

**Params type confusion.** Everything from a query string or form is a string. `params[:page]`
is `"2"`, and `params[:active]` is `"false"` — which is truthy:

```ruby
if params[:active]        # true even for "false"
if params[:active] == "true"
# or use ActiveModel::Type::Boolean.new.cast(params[:active])
```
:::

:::realworld
```ruby
# A controller doing only its job: HTTP in, HTTP out.
class OrdersController < ApplicationController
  before_action :authenticate_user!

  def create
    result = PlaceOrder.new(current_user).call(order_params)

    respond_to do |format|
      if result.success?
        format.html { redirect_to result.order, notice: "Order placed" }
        format.json { render json: result.order, status: :created }
      else
        @order = result.order
        format.html { render :new, status: :unprocessable_entity }
        format.json { render json: { errors: result.errors }, status: :unprocessable_entity }
      end
    end
  end

  private

  def order_params
    params.require(:order).permit(:note, items_attributes: [:product_id, :quantity])
  end
end
```

Everything interesting is in `PlaceOrder`. The controller chooses status codes and formats,
which is exactly what it is for — and the pricing logic is now reachable from a rake task
and testable without a request.

```ruby
# Useful request-level things a controller legitimately does:
request.remote_ip
request.headers["Authorization"]
request.format.json?
response.headers["Cache-Control"] = "public, max-age=300"
head :no_content                      # 204, no body
send_data pdf, filename: "invoice.pdf", type: "application/pdf"
```
:::

:::tradeoffs
**Strong parameters.** Default-deny, so a new column is not automatically exposed. Explicit
and greppable — you can audit every `permit` call in a codebase.

Costs: the allow list is duplicated from the form and drifts from it, so a new field means
editing two places and the failure is a silently-ignored value. In development it logs; in
production it is quiet by default.

**Filters.** Cross-cutting concerns in one place, applied declaratively.

Costs: control flow becomes non-local. Reading an action no longer tells you what runs
before it, `skip_before_action` makes the real behaviour a subtraction from a default
defined elsewhere, and a filter that sets `@order` creates an invisible dependency for both
the action and the view. A long `before_action` chain in a base controller is one of the
harder things to reason about in a mature Rails application.
:::

:::checkpoint
For a `Post` with columns `title`, `body`, `published`, `author_id`, `view_count`:

1. Write `post_params` for an author creating a post.
2. Which columns must *not* be permitted, and what is the attack for each?
3. Write the `create` action so the author cannot be spoofed.
4. The form has a `tag_ids` multi-select. Permit it.
5. What status should a failed create render, and what breaks if you omit it?
:::

:::interview
Strong parameters is one of the best Rails security questions because the answer reveals
whether you understand the threat model.

Lead with where params come from: *"`params` is attacker-controlled — a form is a
suggestion, not a constraint, and nothing requires the client to use it. So
`User.new(params[:user])` assigns whatever columns they chose to send, and the interesting
ones are the ones not in your form: `admin`, `role`, `balance`."*

Then the design point: *"strong parameters are default-deny, which matters because the
alternative — a deny list like the old `attr_protected` — is correct only until someone adds
a column. A migration then introduces a privilege-escalation bug, in a file no reviewer
connects to security. Default-deny fails safe: you forget to permit something and the
feature does not work, which you find immediately."*

If asked what else to watch for: *"`permit!`, and permitting a foreign key like `user_id` —
ownership comes from the session, never from params."*
:::

## What you now know

- `params` is attacker-controlled. A form constrains nothing.
- Strong parameters are default-deny, so adding a column does not expose it.
- `require` raises (400) when a key is missing; `permit` silently drops what is not listed.
- Set ownership from `current_user`, never from a permitted `user_id`.
- Scope lookups through the owner so another user's record is a 404.
- `render`/`redirect_to` halts a filter chain; `return` does not.
- Failed form renders need `status: :unprocessable_entity`, or Turbo silently does nothing.
- All params are strings. `"false"` is truthy.
