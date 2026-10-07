---
title: Authentication
summary: Storing passwords so a breach is survivable, keeping sessions so they can be revoked, and the specific reasons JWTs are usually the wrong default.
level: intermediate
minutes: 19
version: "1"
status: stable
last_reviewed: "2026-10-07"
tags: [security, authentication, passwords, sessions, jwt]
concepts: [password-hashing, sessions, tokens, mfa]
prerequisites: [http-methods, headers]
interview:
  - question: How do you store a password?
    level: intermediate
    answer: >-
      With a purpose-built password hash — Argon2id, scrypt or bcrypt — never a general-purpose
      one like SHA-256. The distinction is deliberate slowness: SHA-256 is designed to be fast,
      so a GPU computes billions per second and a leaked table of hashes is a leaked table of
      passwords. Argon2id is designed to be expensive in both time and memory, so the attacker's
      rate collapses. Each hash gets a unique random salt, which these libraries generate and
      store in the output string, and that is what defeats rainbow tables and stops identical
      passwords producing identical hashes. The parameters are a dial you tune to a target — 100
      to 250 milliseconds is the usual recommendation — and should be revisited as hardware
      improves.
    followUps:
      - "What does a pepper add, and why is it awkward?"
  - question: Session cookie or JWT?
    level: intermediate
    answer: >-
      A session cookie, almost always, and the deciding reason is revocation. A session is a
      reference to server-side state, so logging someone out, invalidating every session after a
      password change, or banning an account is a delete. A JWT is self-contained and valid until
      it expires, so revocation requires a denylist — at which point you have server-side state
      again and have given up the only property that motivated the JWT. JWTs earn their place
      for short-lived machine-to-machine credentials and for cross-service claims where a round
      trip to an auth service is genuinely too expensive. For a web application's user sessions,
      they trade a real property for a theoretical one.
    followUps:
      - "What makes JWT implementations go wrong so often?"
  - question: Where do you store a token in a browser?
    level: intermediate
    answer: >-
      In an `HttpOnly`, `Secure`, `SameSite=Lax` cookie, which is unreadable by JavaScript — so an
      XSS flaw cannot exfiltrate it. `localStorage` is readable by any script on the page,
      including an injected one and anything a compromised dependency does, so a single XSS
      becomes credential theft rather than a defacement. The usual argument for `localStorage` is
      that cookies are vulnerable to CSRF, which is true and is solved by `SameSite` plus a CSRF
      token — a well-understood fix, whereas there is no fix for a readable credential once
      script execution is achieved.
    followUps:
      - "So how do you handle a token for a cross-origin API?"
resources:
  - title: "OWASP — Password Storage Cheat Sheet"
    url: https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html
---

## The hash that assumes it will leak

```ruby
# Wrong, and it looks careful.
Digest::SHA256.hexdigest(password)
# A modern GPU computes tens of billions of SHA-256 hashes per second.
# A leaked table of these is a leaked table of passwords, for every
# password that appears in any wordlist — which is most of them.

# Right.
require "argon2"
hash = Argon2::Password.create(password)
# "$argon2id$v=19$m=65536,t=2,p=1$c29tZXNhbHQ$..."
#   └ algorithm  └ parameters              └ salt  └ hash
# Everything needed to verify it is in the string, including the salt,
# which is why you never store a salt column.
Argon2::Password.verify_password(password, hash)
```

:::what
A **password hash** is a deliberately slow one-way function with a per-password **salt**.
A **session** is server-side state referenced by an opaque cookie. A **token** (JWT) is a
self-contained signed claim. **MFA** requires a second factor beyond a password.
:::

:::why
Password storage is designed around an assumption: **the database will leak.** Not might —
will, eventually, through a backup on a laptop, an exposed snapshot, an SQL injection, or an
insider. Every choice follows from designing for the moment after that.

Under that assumption, the only question is how long the attacker's offline cracking takes. A
fast hash answers: no time at all. SHA-256 at tens of billions per second means every password
in any wordlist falls immediately, and since people reuse passwords, your breach becomes a
breach of their bank. A memory-hard hash at 100 milliseconds per attempt means roughly ten
guesses per second per core, and the attacker's economics collapse — strong passwords become
genuinely infeasible and weak ones take real time.

Sessions are designed around a different assumption: **you will need to revoke.** A password
change should invalidate other sessions. A compromised account must be locked immediately. An
employee leaving must lose access now, not in fifteen minutes. All of those are a delete against
server-side state, and all of them are hard with a self-contained token — which is the core of
the JWT argument. The property that makes a JWT appealing, that no lookup is needed, is exactly
the property that makes revocation impossible, and a denylist to fix it reintroduces the lookup
you were avoiding.
:::

:::how
```text
  THE HASHES, and why "slow" is the feature

    SHA-256         ~10,000,000,000 /s on a GPU     ✗ never
    MD5             faster, and broken              ✗ never
    PBKDF2          ~10,000,000 /s                  △ legacy, FIPS
    bcrypt          ~20,000 /s                       ✓ fine, maxes at
                                                       72 bytes input
    scrypt          memory-hard                      ✓ good
    Argon2id        memory-hard, tunable             ✓ current best

    Memory-hardness is the point of the modern ones: a GPU has
    thousands of cores and limited memory per core, so requiring
    64MB per hash removes the attacker's parallelism advantage in
    a way that pure slowness does not.

  SALT, PEPPER, AND WHAT EACH DEFEATS

    SALT — random, unique per password, stored with the hash
      defeats: rainbow tables, and identical passwords producing
               identical hashes (so a leak does not reveal that
               two users share a password)
      not secret. Generated and embedded by the library.

    PEPPER — a single secret added to every password, stored
             OUTSIDE the database (an HSM, a KMS, an env var)
      defeats: a database-only leak, since the hashes are
               uncrackable without it
      awkward: rotating it requires rehashing on next login, and
               losing it locks out every user. Worth it for
               high-value systems; often skipped.

  SESSION vs JWT — the property that decides it

    SESSION COOKIE
      cookie: an opaque random id
      server: a lookup per request (Redis: ~1ms)
      revoke: DELETE the row. Immediate, per session or all of
              them.

    JWT
      cookie/header: the claims plus a signature
      server: verify the signature. No lookup.
      revoke: ...you cannot. It is valid until `exp`.
              → a denylist, which is a lookup per request, which
                is a session with extra steps and a worse failure
                mode.

    The honest summary: a JWT trades revocation for avoiding a
    1ms lookup. That is a bad trade for a web session and a good
    one for a 60-second service-to-service credential.

  COOKIE FLAGS, all three of which matter

    Secure              HTTPS only
    HttpOnly            unreadable by JavaScript — this is what
                        makes XSS a defacement rather than
                        credential theft
    SameSite=Lax        not sent on cross-site POST, which removes
                        most CSRF; Strict breaks inbound links,
                        None requires Secure
    __Host- prefix      the browser enforces Secure, no Domain,
                        and Path=/ — cheap defence against
                        subdomain attacks
```
:::

:::example
```ruby
# 1. Login, with the details that matter.
def create
  user = User.find_by(email: params[:email].to_s.downcase)

  # Always do the hash comparison, even when the user does not
  # exist, against a dummy hash. Otherwise response time reveals
  # which emails are registered.
  if user&.authenticate(params[:password])
    reset_session                     # prevents session fixation
    session[:user_id] = user.id
    session[:signed_in_at] = Time.now.to_i
    redirect_to root_path
  else
    Argon2::Password.verify_password(params[:password].to_s, DUMMY_HASH)
    # Identical message for both cases: "unknown email" and "wrong
    # password" are the same answer to an attacker enumerating
    # accounts.
    flash.now[:alert] = "Incorrect email or password"
    render :new, status: :unprocessable_entity
  end
end
# `reset_session` is the easily-missed one: without it, an attacker
# who can set a victim's session cookie before login keeps a valid
# session afterwards — session fixation.

# 2. Rehashing on login as parameters change.
def authenticate(password)
  return false unless Argon2::Password.verify_password(password, password_digest)
  if Argon2::Password.new(password_digest).outdated?
    update_column(:password_digest, Argon2::Password.create(password))
  end
  true
end
# You cannot rehash without the plaintext, and login is the only
# time you have it. Without this, parameters chosen in 2020 are
# still protecting your users in 2030.

# 3. Password reset, which is usually the weakest link.
def create_reset
  user = User.find_by(email: params[:email].to_s.downcase)
  if user
    raw = SecureRandom.urlsafe_base64(32)
    user.update!(
      reset_digest: Digest::SHA256.hexdigest(raw),   # store the HASH
      reset_sent_at: Time.now,
    )
    Mailer.reset(user, raw).deliver_later
  end
  # Same response whether or not the account exists.
  render :sent
end
# Four things, all of which get skipped somewhere:
#   - store a hash of the token, not the token: a database leak
#     otherwise lets the attacker reset every account
#   - short expiry (15-60 minutes)
#   - single use: clear it on success
#   - invalidate other sessions after the reset completes
# And the host header must be validated, or the reset link can be
# pointed at an attacker's domain.
```

```ruby
# 4. Rate limiting, which is what actually stops credential
#    stuffing.
class Throttle
  def self.check!(email, ip)
    # Per account AND per IP. Per-IP alone is defeated by a
    # botnet; per-account alone lets one IP try a thousand
    # accounts.
    raise TooMany if count("login:acct:#{email}") > 10
    raise TooMany if count("login:ip:#{ip}") > 100
  end
end
# Credential stuffing uses correct passwords from other breaches,
# so complexity rules and hash strength do nothing against it. The
# effective defences are rate limiting, MFA, and checking new
# passwords against a breached-password list.
```
:::

:::failure
**A general-purpose hash for passwords.** SHA-256, MD5, or a hand-rolled iteration of them. The
speed that makes them good checksums makes them useless here.

**Rolling your own.** `SHA256(salt + SHA256(password))` is a construction nobody has analysed, and
length-extension, timing and salting subtleties are exactly the places these fail. Use the
library.

**Different responses for "unknown email" and "wrong password".** An account enumeration oracle,
which turns into targeted phishing. Identical message and comparable timing.

**Storing a reset token in plaintext.** The reset table becomes a master key: a read-only database
leak lets the attacker reset every account, including accounts with strong passwords and no reuse.

**No `reset_session` at login.** Session fixation: an attacker who sets the victim's cookie before
authentication holds a valid session after it.

**`localStorage` for tokens.** Readable by any script on the page — an injected one, a compromised
npm dependency, a malicious browser extension's injected content. One XSS becomes credential theft
of every logged-in user.

**Composition rules instead of length and a breach check.** "One uppercase, one digit, one symbol"
produces `Password1!` and makes passwords harder to remember and easier to guess. NIST's current
guidance is a 8–64 character minimum, no composition rules, no forced rotation, and a check
against known-breached passwords — because reuse, not weakness, is how accounts are actually
taken.

**SMS for MFA.** Better than nothing and defeated by SIM swapping and SS7 interception, both of
which are available to ordinary criminals. TOTP is much better; a passkey or hardware key is
better still and is the only common factor that resists phishing, because the credential is bound
to the origin.

**MFA that can be bypassed by password reset.** If a reset email grants access without the second
factor, MFA protects nothing — the attacker takes the easier path.

**No limit on password length before hashing.** bcrypt silently truncates at 72 bytes, and an
unbounded input to a memory-hard function is a denial-of-service vector: a 10MB password at 64MB
of memory per hash takes a server down with a handful of requests.

**Logging the request body on the login endpoint.** Passwords in plaintext in your log aggregator,
replicated, retained and widely readable.
:::

:::realworld
```text
// The modern stack, in the order of what to adopt.
//
//   1. Argon2id with tuned parameters, rehashing on login.
//   2. Server-side sessions in a signed HttpOnly Secure
//      SameSite=Lax cookie.
//   3. Rate limiting per account and per IP.
//   4. A breached-password check at signup and change — the
//      k-anonymity API sends only the first five characters of the
//      SHA-1 hash, so you can use it without disclosing the
//      password.
//   5. TOTP MFA, with recovery codes.
//   6. Passkeys (WebAuthn), which remove the password entirely for
//      the users who adopt them and are the only widely-available
//      phishing-resistant factor.
//   7. Delegate it. "Sign in with Google" or an identity provider
//      means someone whose full-time job this is handles the
//      storage, the MFA, the reset flow and the breach detection.
//      For most applications this is the correct answer and the
//      one engineers are most reluctant to reach.
```

```text
// Why JWT implementations go wrong, specifically — the list is
// unusually long for one format:
//
//   alg: none        — some libraries accepted an unsigned token
//                      as valid. Pin the algorithm; never read it
//                      from the token.
//   alg confusion    — a token signed with the RSA *public* key as
//                      an HMAC secret. Pin the algorithm.
//   no expiry check  — `exp` is a claim, not an enforcement.
//   no audience check— a token for service A accepted by service
//                      B.
//   secret in the    — committed, or a weak HMAC secret that is
//     repository       brute-forceable offline.
//   claims trusted   — `{"admin": true}` believed because the
//     after signing     signature was valid, when the signature
//                      only proves who issued it.
//   stored in        — readable by XSS.
//     localStorage
//
// None of these is possible with an opaque session id, because
// there are no claims to confuse and nothing to verify. That
// asymmetry — a format with seven footguns versus a random string
// — is a large part of the argument.
```

```text
// Where JWTs are genuinely right:
//   - service-to-service with a 60-second lifetime, where
//     revocation is irrelevant because expiry is faster than a
//     human response
//   - an identity provider's assertion consumed by many services,
//     where a round trip per request is genuinely too expensive
//   - a stateless signed URL for a download, scoped and
//     short-lived
//
// The pattern: short-lived, narrowly scoped, and machine-issued.
// Not "a user's login session for the next two weeks".
```
:::

:::mistakes
**SHA-256 or MD5 for passwords.** Fast by design.

**A hand-rolled construction.** Use Argon2id via a library.

**Distinguishable responses or timings for unknown accounts.**

**Plaintext reset tokens in the database.** Store the hash.

**No `reset_session` on login.** Session fixation.

**Tokens in `localStorage`.** XSS becomes credential theft.

**Composition rules instead of length plus a breach check.**

**SMS MFA where TOTP or a passkey is available.**

**A reset flow that bypasses MFA.**

**No maximum password length.** Truncation, and a memory-hard DoS.

**Logging request bodies on login.**

**A JWT for a user session.** You have traded revocation for a 1ms lookup.
:::

:::tradeoffs
**bcrypt** — well understood, available everywhere, and capped at 72 bytes of input with no memory
hardness. Perfectly acceptable.

**Argon2id** — memory-hard, tunable along three axes, current best practice; a newer dependency
and parameters you must actually choose.

**Server-side sessions** — revocable immediately, opaque so nothing can be confused, and a lookup
per request plus a session store to operate.

**JWT** — no lookup, works across services; unrevocable before expiry, a long list of
implementation footguns, and claims that are only as trustworthy as the issuer.

**Short-lived JWT plus a refresh token** — the usual compromise: access tokens expire in minutes
so the revocation window is small, and the refresh token is revocable server-side. More moving
parts, and the refresh token is now the thing to protect.

**Cookies** — automatic, work with plain HTML, `HttpOnly` defeats script access; vulnerable to
CSRF, which `SameSite` plus a token addresses.

**Authorization header** — no CSRF exposure, works cross-origin; you must store the token
somewhere, and the only safe place is somewhere JavaScript can read, which reintroduces the XSS
exposure.

**Delegated identity (OIDC)** — someone else's full-time job handles storage, MFA, resets and
breach detection; a dependency on them, and users without an account there.

The default worth stating plainly: **Argon2id, server-side sessions, an `HttpOnly`/`Secure`/
`SameSite=Lax` cookie, rate limiting, and a breached-password check.** Reach for a JWT when the
credential is short-lived and machine-issued, and consider delegating the whole problem — which is
the right answer more often than engineers like.
:::

:::checkpoint
1. Why is SHA-256 the wrong choice, and what makes Argon2id right? What does memory-hardness
   specifically defeat?
2. What does a salt defeat, and what does a pepper add? Why is a pepper awkward?
3. Why does revocation decide the session-versus-JWT question?
4. Name the three cookie flags and what each prevents.
5. Why store a hash of a password-reset token rather than the token?
6. Why is `reset_session` at login necessary?
7. Why do complexity rules not help against credential stuffing, and what does?
8. Name three ways JWT implementations fail that an opaque session id cannot.
:::

:::interview
Lead with the assumption, because it explains every subsequent choice:

*"Password storage is designed around the assumption that the database will leak — not might,
will, through a backup, a snapshot, an injection or an insider. So the only question is how long
offline cracking takes. SHA-256 answers 'no time': tens of billions per second on a GPU, so every
password in a wordlist falls immediately. Argon2id is deliberately expensive in time *and* memory,
and the memory part is what matters — a GPU has thousands of cores and little memory per core, so
requiring 64MB per hash removes the parallelism advantage in a way that slowness alone does not.
Each hash gets a unique salt, which the library generates and embeds, and that is what stops
rainbow tables and stops identical passwords producing identical hashes."*

For sessions versus JWTs, make it one property:

*"Revocation decides it. A session is a reference to server-side state, so logging someone out,
invalidating everything after a password change, or locking a compromised account is a delete. A
JWT is valid until it expires, so revocation needs a denylist — which is a lookup per request,
which is a session with extra steps and a worse failure mode. So a JWT trades revocation for
avoiding a one-millisecond lookup, which is a bad trade for a web session and a good one for a
sixty-second service-to-service credential."*

Add the footgun asymmetry, which is the part that convinces people:

*"The other half of the argument is implementation risk. JWTs have a remarkably long list: `alg:
none` accepted as valid, algorithm confusion where an RSA public key is used as an HMAC secret,
`exp` not actually checked, no audience check so a token for one service works on another, and a
weak secret that is brute-forceable offline. None of those is possible with an opaque random string,
because there are no claims to confuse and nothing to verify."*

And the storage question: *"an `HttpOnly`, `Secure`, `SameSite=Lax` cookie. `localStorage` is
readable by any script on the page, including a compromised dependency, so one XSS becomes
credential theft of every logged-in user. The counter-argument is CSRF, which is real and is
solved by `SameSite` plus a token — a known fix, whereas there is no fix for a readable credential
once script execution is achieved."*
:::

## What you now know

- Password storage assumes the database will leak; everything follows from that.
- Use Argon2id, scrypt or bcrypt — never a general-purpose hash.
- Memory-hardness removes a GPU's parallelism advantage, which slowness alone does not.
- A unique salt per password defeats rainbow tables and hides shared passwords.
- A pepper protects against a database-only leak and is awkward to rotate.
- Rehash on login when parameters change; it is the only time you hold the plaintext.
- Revocation is why server-side sessions beat JWTs for user login.
- A JWT denylist reintroduces the lookup that motivated the JWT.
- `Secure`, `HttpOnly` and `SameSite` each prevent a different attack; use all three.
- `localStorage` tokens turn any XSS into credential theft.
- Store a hash of a reset token, make it short-lived and single-use, and invalidate sessions after.
- `reset_session` at login prevents session fixation.
- Identical responses and timings for unknown accounts, or you have built an enumeration oracle.
- Credential stuffing uses correct passwords: rate limit per account and per IP, add MFA and a
  breach check.
- Length plus a breach check beats composition rules; forced rotation is no longer recommended.
- SMS MFA is defeated by SIM swapping; passkeys are the only common phishing-resistant factor.
- JWTs have many implementation footguns that an opaque session id simply does not have.
- Delegating identity to an OIDC provider is often the correct answer.
