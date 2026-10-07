---
title: Authorisation
summary: The vulnerability class that tops every real-world list, why no framework prevents it, and the one structural change that does.
level: intermediate
minutes: 17
version: "1"
status: stable
last_reviewed: "2026-10-07"
tags: [security, authorization, idor, access-control]
concepts: [authorization, idor, fail-closed, least-privilege]
prerequisites: [authentication, status-codes]
interview:
  - question: Why is broken access control the most common serious vulnerability?
    level: intermediate
    answer: >-
      Because it is the one class with no framework default. Injection is handled by
      parameterised queries, XSS by automatic escaping, CSRF by a token — all on by default, so
      you have to actively defeat them. Authorisation has nothing: an unscoped
      `Order.find(params[:id])` is syntactically perfect, passes code review, and returns any
      order to any logged-in user. It is also invisible to tests, because tests exercise the
      owning user's data and the bug only appears when someone passes a different id. So it is a
      bug that nothing in the toolchain catches and nothing in the normal development loop
      surfaces, which is exactly the profile of something that reaches production.
    followUps:
      - "So what makes it visible?"
  - question: What is IDOR, and how do you prevent it structurally?
    level: intermediate
    answer: >-
      An insecure direct object reference: the application takes an identifier from the request
      and fetches the object without checking the requester may see it. The structural fix is to
      make the scope the only way to query — `current_user.orders.find(params[:id])` rather than
      `Order.find(params[:id])` — so the authorisation is part of the lookup and cannot be
      forgotten separately. Then add a fail-closed check: Pundit's `verify_authorized` as an
      `after_action` turns a missing authorisation call into an error rather than an open door.
      Unguessable identifiers help against casual enumeration and are not access control, because
      ids leak through URLs, logs, referrers and other users.
    followUps:
      - "Why isn't a UUID enough?"
  - question: Where should authorisation live?
    level: intermediate
    answer: >-
      In one place, enforced at the data access boundary, and expressed declaratively so it can be
      read and tested. Scattering `if current_user.admin?` through controllers and views means the
      policy exists nowhere in particular, so nobody can answer "who can do this" without
      grepping — and the view check is cosmetic anyway, since hiding a button does not protect the
      endpoint behind it. A policy object per resource, consulted by controllers and by views,
      means the rule is written once, tested directly, and the view and the endpoint cannot
      disagree.
    followUps:
      - "What about field-level authorisation?"
resources:
  - title: "OWASP Top 10 — Broken Access Control"
    url: https://owasp.org/Top10/A01_2021-Broken_Access_Control/
---

## The bug that looks like working code

```ruby
# Perfect code. Reviewed, tested, shipped.
def show
  @order = Order.find(params[:id])
end
```

```text
  GET /orders/1042    → your order. The test covers this.
  GET /orders/1043    → someone else's order.
                        Nothing in the stack objects.
```

```ruby
# The structural fix: make the scope the query.
def show
  @order = current_user.orders.find(params[:id])
  # 1043 now raises RecordNotFound, which renders a 404 — and a 404
  # is the right answer, because confirming the order exists is
  # itself a disclosure.
end
```

:::what
**Authentication** establishes who you are; **authorisation** decides what you may do. **IDOR**
is fetching an object by a request-supplied identifier without checking access. **Fail-closed**
means the default is denial, so a missing check is an error rather than permission.
:::

:::why
Authorisation is the only major vulnerability class where the framework gives you nothing, and
that single fact explains why it dominates real incident reports.

Compare the others. SQL injection: Active Record parameterises by default, so you have to build a
string yourself to be vulnerable. XSS: templates escape by default, so you have to call `html_safe`
on input. CSRF: a token is verified by default, so you have to disable it. In every case the safe
path is the default and the vulnerability requires an affirmative act.

Authorisation has no default because the framework cannot know your rules. There is no sensible
guess about whether a user may see an order, so `Order.find` does the obvious thing and returns
the order. The vulnerability is therefore not a mistake you made — it is the absence of code you
did not write, which is a much harder thing to notice in a diff.

It is also invisible to the normal development loop. You are logged in as yourself, you click your
own order, and it works. The test suite creates a user, creates their order, and fetches it. Every
signal says the feature is correct, because every signal uses the owner's data. The bug exists only
for a request nobody in the loop makes.

That combination — no default, no tooling, and invisible to ordinary testing — is why the fix has
to be structural. A rule that must be remembered will be forgotten; a scope that is the only way to
query cannot be.
:::

:::how
```text
  THE FOUR PLACES IT FAILS

  1. HORIZONTAL — another user's object
       GET /orders/1043
       The most common, and the one scoping fixes.

  2. VERTICAL — an action above your level
       POST /admin/users/5/promote
       Fails when the check is only in the view that renders the
       button.

  3. CONTEXT — the right object, the wrong state or relationship
       POST /orders/1042/refund  on an order already refunded,
       or by a user who can VIEW the order but not refund it.
       Ownership is not the only question.

  4. FIELD — too much of the right object
       GET /users/42 returning email, phone and internal notes to
       a viewer entitled to see only the display name. Or mass
       assignment letting `role` be set on update.

  Scoping solves 1 completely and nothing else, which is why a
  policy layer is still needed.

  FAIL-OPEN vs FAIL-CLOSED

    FAIL-OPEN (the default everywhere)
      def show
        @order = Order.find(params[:id])   ← no check; allowed
      end
      Forgetting the check grants access.

    FAIL-CLOSED
      class ApplicationController
        after_action :verify_authorized    ← Pundit
      end
      Forgetting the check raises. The new endpoint someone adds
      next year is denied until they think about it.

    This is the single highest-leverage change available, because
    it converts an invisible omission into a loud failure at
    development time.

  403 vs 404 — a disclosure decision

    403 Forbidden    "this exists and you may not see it"
    404 Not Found    "no comment"

    Returning 403 for another tenant's order confirms the order
    exists, which for a sequential id lets an attacker enumerate
    your customer count and activity. Prefer 404 for objects whose
    existence is itself sensitive, and 403 where the resource is
    public knowledge but the action is not.
```
:::

:::example
```ruby
# 1. Scoping as the default, so the unsafe version is unavailable.
class ApplicationController
  # Deliberately no `Order.find` anywhere. Reviewers grep for it.
  def scoped_orders = current_user.orders
end

# Nested resources make the scope structural rather than remembered.
# /projects/7/tasks/99
def show
  @project = current_user.projects.find(params[:project_id])
  @task = @project.tasks.find(params[:id])
  # Two scopes, both enforced by the association. A task belonging
  # to another project of another user cannot be reached by
  # manipulating either id.
end

# 2. A policy object: the rule written once, readable, testable.
class OrderPolicy
  def initialize(user, order) = (@user, @order = user, order)

  def show?    = owner? || @user.support?
  def refund?  = (owner? && @order.refundable?) || @user.admin?
  def destroy? = @user.admin?

  private def owner? = @order.user_id == @user.id
end

# Used in the controller — the enforcement point.
def refund
  @order = Order.find(params[:id])
  authorize @order, :refund?          # raises if not permitted
  @order.refund!
end

# And in the view — for display only.
<%= button_to "Refund", ... if policy(@order).refund? %>
# The same object answers both, so the button and the endpoint
# cannot disagree. Hiding the button is a UX decision; the
# controller check is the security boundary.

# 3. Fail-closed, which makes omissions impossible to ship.
class ApplicationController < ActionController::Base
  include Pundit::Authorization
  after_action :verify_authorized, except: :index
  after_action :verify_policy_scoped, only: :index

  rescue_from Pundit::NotAuthorizedError do
    render file: "public/404.html", status: :not_found
  end
end
# `verify_authorized` raises if no `authorize` call happened during
# the action. A new controller written next year fails its first
# test run until someone decides the policy — which is the point.

# 4. Field-level authorisation, which scoping does not touch.
class UserSerializer
  def as_json
    base = { id: @user.id, name: @user.name }
    base[:email] = @user.email if @viewer == @user || @viewer.admin?
    base[:internal_notes] = @user.internal_notes if @viewer.support?
    base
  end
end
# Default to the minimum and add fields, rather than returning
# everything and removing. Removing means a new column is exposed
# by default, which is the same fail-open mistake one level down.
```
:::

:::failure
**Unscoped lookups.** `Order.find(params[:id])`. The single most common real finding, and it looks
like correct code.

**Authorisation only in the view.** Hiding a button does nothing; the endpoint is still reachable
with curl. The view check is for usability and the controller check is for security, and only one
of them is optional.

**Checking ownership and nothing else.** A user may own an order and still not be allowed to refund
it, or to refund it twice. Ownership answers one question out of several.

**Mass assignment reaching a privilege field.**

```ruby
params.require(:user).permit(:name, :email, :role)   # :role!
# A user updates their own profile and becomes an admin. The
# strong-parameters list is an authorisation decision, not a
# validation one.
```

**Relying on an unguessable id.** A UUID raises the cost of blind enumeration and is not access
control, because identifiers leak — in URLs shared in chat, in `Referer` headers to third parties,
in logs and error trackers, in emails, and through legitimate exposure to a user who later should
not have access. Security by obscurity of the id means revocation is impossible.

**403 where the existence is itself sensitive.** Confirming that order 1043 exists lets an attacker
with sequential ids enumerate your customer base and activity rate.

**Authorising on data from the request.**

```ruby
if params[:is_admin] == "true"           # absurd, and it happens
if session[:role] == "admin"             # if the session is signed, fine
if request.headers["X-Admin"] == "1"     # client-controlled
# Derive authority from the authenticated identity on the server,
# never from anything the client can set.
```

**Time-of-check to time-of-use gaps.** Checking permission, then performing the action in a
separate request or after a slow operation, lets a revocation in between be ignored. For anything
sensitive, re-check at the point of effect, inside the same transaction.

**An admin interface with weaker protection.** It is the highest-value target and frequently the
least reviewed — no rate limiting, no MFA requirement, no audit log, and an "impersonate user"
feature with no constraints.

**No audit log for privileged actions.** When something does go wrong, the difference between a
contained incident and an unbounded one is knowing what was accessed.
:::

:::realworld
```text
// Multi-tenancy, which is authorisation at its most consequential:
// a failure crosses a customer boundary rather than a user one.
//
//   Scope every query by tenant, enforced below the application
//   code so it cannot be forgotten:
//
//     - a default scope that cannot be removed by accident
//     - Postgres row-level security, so the enforcement is in the
//       database and a raw query is still constrained
//     - separate schemas or databases per tenant, which is the
//       strongest and the most operationally expensive
//
//   The thing to avoid is a `WHERE tenant_id = ?` that each
//   developer must remember. One missing clause in one query is a
//   cross-tenant data leak, and that is the incident that ends
//   contracts.
```

```ruby
# Row-level security, for the case where you want the database to
# enforce it.
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON orders
  USING (tenant_id = current_setting('app.tenant_id')::bigint);

# The application sets the tenant once per request:
ActiveRecord::Base.connection.execute(
  "SET LOCAL app.tenant_id = #{tenant.id.to_i}"
)
# Every subsequent query — including a raw SQL one, including one
# written by someone who did not know about tenancy — is filtered.
# The enforcement is no longer something a developer can omit,
# which is the same move as making the scope the only way to query,
# one layer down.
```

```text
// What to review, in order of return:
//
//   1. grep for unscoped finders on tenant-owned models.
//      `Order.find(`, `Model.where(id:`, `find_by(id:`
//   2. Is authorisation fail-closed? Is there an after_action
//      verifying it happened?
//   3. Every `permit` list — does it include a role, a tenant id,
//      a price, a status?
//   4. Does any endpoint accept an id for an object it does not
//      scope — including nested ids, which are the ones people
//      forget?
//   5. Does the serialiser default to minimum fields?
//   6. Is the admin area at least as protected as the rest?
//
// Step 1 and step 2 between them find the large majority of real
// findings, and both are mechanical.
```
:::

:::mistakes
**Unscoped lookups.** Make the scope the query.

**Authorisation only in the view.** The endpoint is still open.

**Ownership treated as the whole question.** State and relationship matter too.

**A privilege field in a `permit` list.**

**Treating an unguessable id as access control.** Ids leak and cannot be revoked.

**403 where existence is sensitive.** Use 404.

**Authorising from client-supplied data.**

**A check separated from the effect.** Re-check inside the transaction.

**A weaker admin interface.** Highest value, least reviewed.

**A serialiser that returns everything minus exclusions.** New columns leak by default.

**No audit log for privileged actions.** Scope of an incident becomes unknowable.
:::

:::tradeoffs
**Scoped queries** — the authorisation is the lookup, so it cannot be forgotten; it covers only
ownership, so a policy layer is still needed.

**Inline checks (`if current_user.admin?`)** — obvious at the point of use, and the policy lives
nowhere, so nobody can answer "who can do this" and the view and controller drift apart.

**Policy objects** — one readable, directly testable place per resource, usable from both
controller and view; a layer of indirection and a file per resource.

**Fail-closed verification** — converts an invisible omission into a development-time error, and it
is the highest-leverage single change available; it requires discipline about the `except:` list,
which quietly becomes a list of unprotected actions.

**Row-level security** — enforcement below the application, so raw queries are still constrained;
it is harder to debug, ties you to a database feature, and interacts awkwardly with connection
pooling.

**Separate databases per tenant** — the strongest isolation, and the highest operational cost:
migrations, connections, backups and monitoring multiply.

**Unguessable identifiers** — real defence against enumeration, and no substitute for a check.
Worth having as well, never instead.

The principle: **make the safe thing the only thing.** Every durable fix in this lesson works by
removing the possibility of the mistake — the scope is the query, the policy is the only source of
truth, the missing check is an error, the database filters regardless. A rule that relies on every
future developer remembering is a rule that will be broken, and this is the vulnerability class
where that breakage is most expensive.
:::

:::checkpoint
1. Why does authorisation lack a framework default when injection, XSS and CSRF all have one?
2. Why is an unscoped `Order.find(params[:id])` invisible to tests?
3. Name the four places authorisation fails. Which one does scoping fix?
4. What does a fail-closed `verify_authorized` change about a new endpoint written next year?
5. When should you return 404 rather than 403?
6. Why is a UUID not access control? Give two ways ids leak.
7. What is wrong with a serialiser that returns all fields minus an exclusion list?
8. For multi-tenancy, why is `WHERE tenant_id = ?` in each query the wrong approach?
:::

:::interview
Lead with why this class dominates, because the reason is the insight:

*"It is the only major vulnerability class with no framework default. Injection is handled by
parameterised queries, XSS by automatic escaping, CSRF by a token — all on by default, so you have
to actively defeat them. Authorisation has nothing, because the framework cannot guess your rules.
So `Order.find(params[:id])` is syntactically perfect, passes review, and returns any order to any
logged-in user. The vulnerability is not a mistake you made; it is the absence of code you did not
write, which is much harder to see in a diff."*

Then the reason it reaches production:

*"And it is invisible to the normal development loop. You are logged in as yourself, you open your
own order, it works. The test creates a user, creates their order, fetches it. Every signal says
the feature is correct because every signal uses the owner's data — the bug exists only for a
request nobody in the loop makes."*

Then the structural fix, and be explicit that it is structural:

*"So the fix has to remove the possibility rather than rely on remembering. Make the scope the
query: `current_user.orders.find(params[:id])`, so the authorisation is part of the lookup. Then
make it fail-closed — an `after_action` that raises if no authorisation call happened during the
request — which is the single highest-leverage change available, because the endpoint somebody adds
next year is denied until they think about it. And a policy object per resource, consulted by both
the controller and the view, so the rule is written once and the button cannot disagree with the
endpoint it triggers."*

And two details worth volunteering: *"scoping only fixes horizontal access — the right object for
the wrong user. Vertical, contextual and field-level failures need the policy layer, and a
serialiser should default to the minimum set of fields rather than returning everything minus
exclusions, because the second form exposes every new column by default. Also, an unguessable id
is worth having and is not access control: ids leak through shared URLs, `Referer` headers, logs
and error trackers, and unlike a check, obscurity cannot be revoked."*
:::

## What you now know

- Authorisation is the only major class with no framework default, which is why it dominates.
- The vulnerability is missing code, not wrong code, so reviews and diffs do not surface it.
- It is invisible to tests, because tests use the owning user's data.
- Make the scope the query: `current_user.orders.find(...)`, never `Order.find(...)`.
- Scoping fixes horizontal access only; vertical, contextual and field-level failures remain.
- Fail-closed verification turns a missing check into a development-time error.
- A policy object per resource means the rule is written once and views cannot disagree.
- A view check is usability; the controller check is security.
- Ownership is one question — state and relationship matter too.
- A `permit` list is an authorisation decision; a role field in it is a privilege escalation.
- Return 404 where the existence of the object is itself sensitive.
- An unguessable id resists enumeration, leaks through many channels, and cannot be revoked.
- Never derive authority from client-supplied data.
- Re-check permission at the point of effect, inside the transaction.
- Serialisers should default to minimum fields, so new columns do not leak.
- For multi-tenancy, enforce the scope below the application — a default scope or row-level
  security — not in each query.
- Audit privileged actions, or the scope of an incident is unknowable.
