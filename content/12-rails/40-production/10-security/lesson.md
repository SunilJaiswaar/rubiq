---
title: The security defaults you are relying on
summary: Rails protects you from several classes of attack by default. Knowing which, and how each protection can be switched off by accident.
level: advanced
minutes: 15
version: "8.0"
status: stable
last_reviewed: "2026-10-07"
tags: [rails, security, csrf, sql-injection]
concepts: [csrf, sql-injection, xss, mass-assignment, authorization]
prerequisites: [controllers, strong-parameters]
interview:
  - question: How does Rails protect against SQL injection, and how do you defeat that protection?
    level: advanced
    answer: >-
      Active Record parameterises values: `where(name: params[:q])` sends the query and the
      value separately, so the value can never be parsed as SQL. You defeat it by building
      SQL strings yourself — `where("name = '#{params[:q]}'")` — or by passing user input
      into any method that takes raw SQL: `order`, `group`, `pluck` with an expression,
      `select`, `joins` with a string, or `find_by_sql`. The rule is that *values* are safe
      and *identifiers* are not, because you cannot parameterise a column name — so an
      `order(params[:sort])` has to be validated against an allow list.
    followUps:
      - "Why can you not just escape the input instead?"
      - "Which Active Record methods take raw SQL?"
  - question: What does Rails' CSRF protection actually do?
    level: advanced
    answer: >-
      It puts a per-session token in a meta tag and in every form, and verifies it on every
      non-GET request. The attack it prevents is another site causing the user's browser to
      submit a request with their cookies attached — the attacker can make the browser send
      the request but cannot read your page to obtain the token. Note that it relies on GET
      being safe: a state-changing GET has no token check at all, which is one reason the
      verbs matter.
resources:
  - title: "Rails Guides — Securing Rails Applications"
    url: https://guides.rubyonrails.org/security.html
---

## What you get for free

```ruby
# SQL injection — parameterised, safe.
User.where(email: params[:email])

# XSS — escaped on output by default.
<%= @user.name %>        # "<script>" becomes "&lt;script&gt;"

# CSRF — token verified on every non-GET request.
protect_from_forgery with: :exception    # on by default

# Mass assignment — default-deny.
params.require(:user).permit(:name)

# Session — signed and encrypted cookies.
# Passwords — bcrypt via has_secure_password.
# Headers — X-Frame-Options, X-Content-Type-Options set by default.
```

:::problem
Every one of those defaults can be switched off by writing ordinary-looking code, and in
most cases nothing warns you.

That is the real security risk in a Rails application: not that the framework is insecure,
but that the protections are invisible until you step outside them, and stepping outside
them looks like normal work.
:::

:::what
Rails' protections operate at specific boundaries: **parameterisation** at the query
boundary, **escaping** at the output boundary, **token verification** at the request
boundary, and **allow lists** at the assignment boundary. Each one fails when you hand it a
string instead of a value.
:::

:::why
Learning the boundaries rather than a list of rules is what makes this transferable, and
the reason is that the rules are all the same rule. "Use placeholders", "do not call
`html_safe` on input", "use strong parameters" are three instances of one principle: keep
data as data, and never let it cross into a position where something else will parse it as
structure.

Once you see it that way, you can evaluate code you have never been warned about. A gem
that takes a column name, a template that renders a user-supplied partial path, a redirect
built from a parameter — none of those appear on a checklist, and all of them are the same
shape. Memorising the list leaves you defenceless against the item that is not on it.
:::

## SQL injection

```ruby
# Safe — the value is sent separately from the query.
User.where(email: params[:email])
User.where("email = ?", params[:email])
User.where("email = :e", e: params[:email])

# Unsafe — you built the SQL.
User.where("email = '#{params[:email]}'")
# params[:email] = "' OR '1'='1" → returns every user
```

:::how
```text
  PARAMETERISED

    Rails sends:  SELECT * FROM users WHERE email = $1
    and:          $1 = "' OR '1'='1"

    The database PARSES the query first, then binds the value. The value
    is data by the time it exists. There is no parse step left for it to
    influence, which is why this is not "escaping done well" — it is a
    different mechanism.

  INTERPOLATED

    Rails sends:  SELECT * FROM users WHERE email = '' OR '1'='1'

    One string. The database parses the whole thing, including the
    attacker's syntax.
```

This is why escaping is the wrong fix. Escaping tries to neutralise characters that are
special to a parser; parameterisation removes the value from the parser's input entirely.
Escaping requires knowing every special character in every context and getting it right
every time.
:::

:::failure
**The methods that take raw SQL.** `where` with a hash is safe. These are not:

```ruby
# Every one of these interpolates into SQL:
Order.order(params[:sort])                       # "id; DROP TABLE orders--"
Order.group(params[:group_by])
Order.select(params[:fields])
Order.joins(params[:join])
Order.pluck(params[:column])
Order.find_by_sql("SELECT ... #{params[:x]}")
Order.where("created_at > #{params[:date]}")     # no placeholder
Order.exists?(["id = #{params[:id]}"])
```

**You cannot parameterise an identifier.** A placeholder works for a value and not for a
column or table name — `ORDER BY $1` is not valid SQL. So the only safe handling of a
user-supplied column is an allow list:

```ruby
SORTABLE = %w[created_at total reference].freeze

def sort_column
  SORTABLE.include?(params[:sort]) ? params[:sort] : "created_at"
end

def sort_direction
  params[:dir] == "asc" ? "asc" : "desc"
end

Order.order(sort_column => sort_direction)
```

Note the direction is also validated — `params[:dir]` interpolated into `order` is the same
hole, and it is easy to miss because it looks too small to matter.

```ruby
# Rails 6.1+ will raise on an unrecognised order value, which helps:
config.active_record.allow_unsafe_raw_sql = :disabled
```
:::

## XSS

```erb
<%= @post.body %>           <!-- escaped. Safe. -->
<%= raw @post.body %>       <!-- NOT escaped -->
<%== @post.body %>          <!-- same as raw -->
<%= @post.body.html_safe %> <!-- a claim, not a sanitisation -->
```

:::mistakes
**`html_safe` does not sanitise anything.** It marks a string as already-safe so Rails skips
escaping it. Calling it on user input is exactly the vulnerability:

```erb
<%= params[:q].html_safe %>    <!-- fully exploitable -->
```

If you must render user HTML, sanitise it:

```erb
<%= sanitize @post.body, tags: %w[p br strong em a], attributes: %w[href] %>
```

**Escaping is context-dependent, and Rails only escapes HTML.** The same string needs
different treatment in different places, and `<%= %>` only handles one of them:

```erb
<%# HTML body — correct %>
<div><%= user_input %></div>

<%# Inside a script tag — HTML escaping is NOT enough %>
<script>var x = "<%= user_input %>";</script>
<%# user_input = '";alert(1);//'  breaks out of the string %>

<%# Correct: %>
<script>var x = <%= user_input.to_json %>;</script>
<%# or better, pass data through a data attribute and read it in JS %>

<%# In an href — javascript: URLs %>
<a href="<%= user_url %>">     <%# user_url = "javascript:alert(1)" %>
```

The `javascript:` URL case is worth remembering because HTML escaping does nothing about
it — there are no special characters to escape. Validate the scheme:

```ruby
uri = URI.parse(user_url) rescue nil
safe = uri && %w[http https].include?(uri.scheme)
```
:::

## CSRF

:::how
```text
  The attack:

  1. User is logged into bank.com; their session cookie is in the browser.
  2. User visits evil.com, which contains:

       <form action="https://bank.com/transfer" method="post">
         <input name="to" value="attacker">
         <input name="amount" value="10000">
       </form>
       <script>document.forms[0].submit()</script>

  3. The browser submits it WITH the bank.com cookie attached.
     The bank sees an authenticated request.

  The defence:

  Rails puts a per-session token in the page and requires it on every
  non-GET request. evil.com can make the browser send a request but
  cannot READ bank.com's page to obtain the token — the same-origin
  policy prevents that.
```

**The protection assumes GET is safe.** Rails does not check the token on GET, so a
state-changing GET route has no CSRF protection at all:

```ruby
# This is exploitable by an <img> tag on any site:
get "/orders/:id/cancel", to: "orders#cancel"
# <img src="https://app.com/orders/42/cancel">

# Which is the real reason the verbs matter.
post "/orders/:id/cancellation", to: "cancellations#create"
```

**`SameSite=Lax` cookies** — the Rails default — already block most of this at the browser
level, because the cookie is not sent on a cross-site POST. CSRF tokens remain necessary as
defence in depth and for older browsers, and because `Lax` still permits top-level
cross-site GET navigation.

**`protect_from_forgery with: :null_session`** is what API controllers use, and it silently
turns the protection off for that controller. Correct for a token-authenticated API, which
is not cookie-authenticated and therefore not vulnerable. Dangerous if the controller also
accepts session cookies.
:::

:::failure
**Authorisation is the one Rails does not do for you.**

Authentication — who are you — has `has_secure_password` and, since Rails 8, a generator.
Authorisation — what may you do — has nothing, and it is where most real vulnerabilities in
Rails applications are.

```ruby
# The single most common vulnerability in a Rails codebase:
def show
  @order = Order.find(params[:id])      # any logged-in user, any order
end

# Scoped — the authorisation is in the query:
def show
  @order = current_user.orders.find(params[:id])
end
```

This class of bug is called IDOR — insecure direct object reference — and it is consistently
near the top of real-world findings. It is invisible in tests that only use the owning
user's fixtures.

```ruby
# For anything beyond ownership, be explicit (Pundit shown):
class OrderPolicy
  def initialize(user, order) = (@user, @order = user, order)
  def show?    = @order.user == @user || @user.admin?
  def destroy? = @order.user == @user && @order.pending?
end

# And fail closed — require a check rather than remembering to add one:
class ApplicationController < ActionController::Base
  after_action :verify_authorized, except: :index
end
```

That `after_action :verify_authorized` is the important line: it makes a *missing*
authorisation check an error, rather than relying on every developer to remember one. Same
principle as strong parameters being default-deny.
:::

:::realworld
```ruby
# The checks worth running on any Rails codebase you inherit:

# 1. Static analysis for all of the above.
#    bundle exec brakeman
#    Finds interpolated SQL, html_safe on params, mass assignment, open redirects.

# 2. Dependency advisories.
#    bundle exec bundle-audit check --update

# 3. Grep for the specific switch-offs:
#    git grep "html_safe"
#    git grep "raw "
#    git grep "permit!"
#    git grep "null_session"
#    git grep -E "where\(\"" | grep -v "?"       # interpolated where
#    git grep -E "\.find\(params" | grep -v current_user   # unscoped find

# 4. Open redirect — easy to miss, used for phishing.
redirect_to params[:return_to]          # "https://evil.com"
redirect_to params[:return_to], allow_other_host: false   # Rails 7+ default

# 5. Credentials.
#    Nothing in the repository. config/credentials.yml.enc or ENV.
#    git grep -iE "(api_key|secret|password)\s*=\s*['\"]"
```

`brakeman` in CI is the highest-value addition, because it catches the specific patterns in
this lesson automatically and does not get tired.
:::

:::tradeoffs
**Secure defaults** mean the common path is safe and a new developer cannot easily introduce
SQL injection or XSS. That is a genuine achievement and most Rails applications are better
off for it than they would be with an unopinionated framework.

The cost is specific: **the protections are invisible, so nobody learns where the boundaries
are until they cross one.** A developer who has only written `where(email: params[:email])`
has no model of why it is safe, which means they have no instinct that `order(params[:sort])`
is different. The framework's success at hiding the mechanism is what makes the exception
dangerous.

Hence the practical position: **know what each default protects against and what switches it
off**, and automate the checking with brakeman rather than relying on recall. And accept
that authorisation is yours — there is no default to rely on, which is why it is where the
bugs are.
:::

:::checkpoint
Find the vulnerability in each and fix it:

```ruby
# 1
Order.where("user_id = #{current_user.id} AND status = '#{params[:status]}'")

# 2
def show = @user = User.find(params[:id])

# 3
<%= @comment.body.html_safe %>

# 4
get "/subscriptions/:id/cancel", to: "subscriptions#cancel"

# 5
redirect_to params[:next]

# 6
Order.order("#{params[:sort]} #{params[:dir]}")
```

One of those six is a vulnerability even though the user id comes from the session rather
than from params. Which, and why?
:::

:::interview
Rails security questions reward knowing the mechanism rather than the rule.

On SQL injection: *"Active Record parameterises, so the query is parsed before the value is
bound and the value never reaches the parser. That is why it is stronger than escaping,
which requires getting every special character right in every context. You lose it by
building SQL yourself — and the subtle case is that values can be parameterised and
identifiers cannot, so `order(params[:sort])` needs an allow list. People remember to
validate the column and forget the direction."*

On CSRF, give the attack and the assumption: *"another site makes the browser submit a
request with the user's cookies; they can send it but cannot read your page to get the token.
Which means the protection assumes GET is safe — a state-changing GET route has no token
check at all. `SameSite=Lax` now blocks most of it at the browser, but the token is still
defence in depth."*

Then the answer that shows where you think the real risk is: *"the protections Rails gives
you are good, and the one it does not give you is authorisation — which is where I would
actually look first. `Order.find(params[:id])` without scoping is the most common real
vulnerability in Rails codebases, and it is invisible in tests that only use the owner's
fixtures. I would scope through `current_user` and add `after_action :verify_authorized` so a
missing check is an error rather than something to remember."*
:::

## What you now know

- Parameterisation removes the value from the parser's input — fundamentally stronger than
  escaping.
- Values can be parameterised; identifiers cannot. `order`, `group`, `select`, `pluck` and
  `joins` take raw SQL and need allow lists — including the sort direction.
- `html_safe` and `raw` are claims, not sanitisation. Use `sanitize` for user HTML.
- HTML escaping is not enough inside `<script>` or an `href` — use `to_json` and validate
  URL schemes.
- CSRF protection assumes GET is safe, so a state-changing GET has none.
- `SameSite=Lax` blocks most CSRF at the browser; the token is defence in depth.
- Authorisation is not provided. Unscoped `find(params[:id])` is the most common real
  vulnerability.
- `after_action :verify_authorized` makes a missing check an error. Run brakeman in CI.
