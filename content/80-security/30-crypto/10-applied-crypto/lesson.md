---
title: Applied cryptography
summary: The six decisions an application engineer actually makes, the much longer list to delegate to a library, and why "do not roll your own" is about construction rather than algorithms.
level: advanced
minutes: 18
version: "1"
status: stable
last_reviewed: "2026-10-07"
tags: [security, cryptography, hashing, encryption, secrets]
concepts: [hashing, symmetric-encryption, hmac, key-management]
prerequisites: [authentication, tls]
interview:
  - question: Hashing, encryption or encoding?
    level: advanced
    answer: >-
      Encoding is a reversible representation change with no key and no security property — base64
      is encoding, and calling it encryption is the most common confusion in this area. Hashing is
      one-way: you cannot recover the input, so it is for verification and integrity, not for
      storage you need to read back. Encryption is reversible with a key, so it is for data you
      must retrieve. The practical consequence is that the choice follows from one question: do you
      ever need the original value? Passwords never — hash them. Card numbers and access tokens
      yes — encrypt them, and then the hard part is key management rather than the algorithm.
    followUps:
      - "Why is key management the hard part?"
  - question: What does "do not roll your own crypto" actually mean?
    level: advanced
    answer: >-
      Not "do not use cryptography" and not "do not understand it" — it means do not invent the
      *construction*. Using AES-256-GCM through a library is fine and expected. Combining AES-CBC
      with your own padding and your own MAC ordering is where real systems break, because the
      failures are not in the primitives but in how they are composed: a MAC over the plaintext
      instead of the ciphertext, a nonce reused, a padding error reported distinguishably, a
      comparison that returns early. Those are all composition bugs, each with a decade of
      literature, and none of them is visible in a test that only checks round-tripping.
    followUps:
      - "Give an example of a composition bug."
  - question: Why is nonce reuse catastrophic in GCM?
    level: advanced
    answer: >-
      Because GCM is a counter mode: the nonce plus a counter produces a keystream that is XORed
      with the plaintext. Reuse the nonce with the same key and two ciphertexts share a keystream,
      so XORing them cancels it and leaves the XOR of the two plaintexts — recoverable with
      ordinary cryptanalysis. Worse, nonce reuse in GCM also leaks the authentication subkey,
      which lets an attacker forge valid tags for arbitrary messages, so you lose confidentiality
      and integrity at once. This is why you never choose a nonce yourself: generate it randomly
      per message, or use a construction like XChaCha20-Poly1305 whose nonce is large enough that
      random collision is not a concern.
    followUps:
      - "So where should the nonce be stored?"
resources:
  - title: "Latacora — Cryptographic Right Answers"
    url: https://www.latacora.com/blog/2018/04/03/cryptographic-right-answers/
---

## Three things people confuse

```text
  ENCODING      base64, hex, URL-encoding
                reversible, no key, NO security property
                → "we encrypt it with base64" is the single most
                  common misunderstanding in this subject

  HASHING       SHA-256, SHA-3, BLAKE3
                one-way, no key
                → integrity, deduplication, fingerprints
                → NOT for passwords, which need a slow hash

  MAC           HMAC-SHA256
                one-way, WITH a key
                → "this came from someone holding the key and has
                  not been altered"

  ENCRYPTION    AES-256-GCM, XChaCha20-Poly1305
                reversible, with a key
                → confidentiality, and with AEAD also integrity

  The question that picks one: do you ever need the original
  value back? Never → hash. Yes → encrypt. Just changing
  representation → encode, and claim nothing.
```

:::what
A **hash** is a one-way function with no key. A **MAC** is a keyed one-way function proving
origin and integrity. **AEAD** encryption (authenticated encryption with associated data)
provides confidentiality *and* integrity in one operation. A **nonce** is a per-message value
that must never repeat with the same key.
:::

:::why
The reason to learn the categories rather than the algorithms is that nearly every real failure is
a category error or a composition error, not a broken primitive.

AES has not been broken. SHA-256 has not been broken. What breaks is systems that encrypt without
authenticating, so an attacker can modify ciphertext undetected; systems that reuse a nonce;
systems that compare MACs with `==` and leak the answer through timing; systems that hash
passwords with a fast hash; systems that store a key next to the data it protects. Every one of
those is a decision about *use*, and the primitive performed perfectly throughout.

That is also what "do not roll your own crypto" means, and it is narrower than it is usually
taken to be. Using AES-256-GCM from a library is not rolling your own. Deciding to combine AES-CBC
with HMAC, choosing the order, choosing what the MAC covers, and choosing how to report a padding
error — that is rolling your own, and each of those four decisions has a named attack attached
when made wrongly. The reason to delegate is not that the mathematics is hard; it is that the
composition has a long list of non-obvious requirements, and a test that encrypts and decrypts
successfully will pass regardless of whether any of them were met.

Which leaves the thing that is actually your problem: **keys**. The algorithm is a library call.
Where the key lives, who can read it, how it rotates, and what happens when it leaks are decisions
no library makes for you, and they are where the remaining risk concentrates.
:::

:::how
```text
  THE RIGHT ANSWERS, so the decision is not yours

    password storage       Argon2id (or bcrypt/scrypt)
    general hashing        SHA-256, or BLAKE3 if speed matters
    message authentication HMAC-SHA256
    symmetric encryption   AES-256-GCM, or XChaCha20-Poly1305
    random values          the OS CSPRNG: SecureRandom,
                           crypto.randomBytes, os.urandom
    key derivation         HKDF from a high-entropy secret;
                           Argon2id from a password
    asymmetric signing     Ed25519
    key exchange           X25519
    transport              TLS 1.3, via your platform's stack

  If you are choosing anything not on that list, the question to
  ask is why — not because the alternatives are broken, but
  because being on a short list means the failure modes are
  documented and the libraries are well tested.

  WHY AEAD RATHER THAN ENCRYPTION ALONE

    AES-CBC alone gives you confidentiality and NOT integrity, so
    an attacker can flip bits in the ciphertext and you decrypt
    attacker-influenced plaintext with no error.

    A padding oracle makes it worse: if a padding failure is
    distinguishable from a MAC failure — different error, different
    timing, different status code — an attacker decrypts the whole
    message by submitting modified ciphertexts and watching which
    error comes back. That attack broke real systems repeatedly
    (ASP.NET, TLS's CBC modes, XML encryption).

    AES-GCM authenticates as part of decryption, so a modified
    ciphertext fails before any plaintext is returned, and there is
    one failure mode rather than two distinguishable ones.

  THE NONCE RULE

    Same key + same nonce + different plaintexts = catastrophe.

    GCM is counter mode:
      keystream = E(key, nonce || counter)
      ciphertext = plaintext XOR keystream

      C1 = P1 XOR KS
      C2 = P2 XOR KS          ← same nonce, same keystream
      C1 XOR C2 = P1 XOR P2   ← the key is gone; plaintexts leak

    And in GCM specifically, nonce reuse also reveals the
    authentication subkey, so the attacker can forge valid tags.
    Both properties lost at once.

    Rule: generate the nonce randomly per message with a CSPRNG,
    store it alongside the ciphertext (it is not secret), and never
    derive it from anything predictable like a counter you reset or
    a user id.

  KEY MANAGEMENT — the part that is yours

    ✗ a key in the repository
    ✗ a key in the same database as the ciphertext
    ✗ one key for everything, forever
    ✓ a KMS or secrets manager, with access logged
    ✓ envelope encryption: a data key per record, encrypted by a
      master key in the KMS, stored with the record
    ✓ rotation that works: a key id stored with every ciphertext
      so old data stays readable under the old key

    Envelope encryption is the standard pattern because it makes
    rotation and per-record revocation tractable — you re-encrypt
    data keys rather than terabytes of data.
```
:::

:::example
```ruby
# 1. Encrypting a field, using the framework rather than primitives.
class User < ApplicationRecord
  encrypts :ssn, deterministic: false
  encrypts :email, deterministic: true   # so it can be queried
end
# `deterministic: true` means the same plaintext always gives the
# same ciphertext, which is what lets you do `find_by(email:)` —
# and the cost is that equal values are visibly equal, so an
# attacker with the database can see which users share a value and
# can confirm a guess. Use it only where querying is required, and
# never on low-cardinality data like a boolean or a postcode,
# where the ciphertext becomes a lookup table.

# 2. By hand, for when the framework does not cover it.
require "openssl"

def encrypt(plaintext, key)
  cipher = OpenSSL::Cipher.new("aes-256-gcm").encrypt
  cipher.key = key
  nonce = cipher.random_iv            # random, per message
  cipher.auth_data = ""               # bind context here if any
  ciphertext = cipher.update(plaintext) + cipher.final
  # Store all three. The nonce and tag are not secret.
  { nonce: nonce, ciphertext: ciphertext, tag: cipher.auth_tag }
end

def decrypt(parts, key)
  cipher = OpenSSL::Cipher.new("aes-256-gcm").decrypt
  cipher.key = key
  cipher.iv = parts[:nonce]
  cipher.auth_tag = parts[:tag]       # MUST be set before final
  cipher.auth_data = ""
  cipher.update(parts[:ciphertext]) + cipher.final
rescue OpenSSL::Cipher::CipherError
  # Authentication failed: wrong key, or tampering. Do not
  # distinguish the two in anything the caller can observe.
  raise DecryptionFailed
end
# `cipher.final` is where the tag is verified, so a modified
# ciphertext raises rather than returning plaintext. Forgetting to
# set auth_tag means the verification silently does not happen —
# which is the single most common mistake with GCM in this API.
```

```ruby
# 3. Signing something a client will hold and return.
def sign(payload)
  data = JSON.generate(payload)
  mac = OpenSSL::HMAC.hexdigest("SHA256", ENV["SIGNING_KEY"], data)
  "#{Base64.urlsafe_encode64(data)}.#{mac}"
end

def verify(token)
  encoded, mac = token.split(".", 2)
  data = Base64.urlsafe_decode64(encoded)
  expected = OpenSSL::HMAC.hexdigest("SHA256", ENV["SIGNING_KEY"], data)
  # CONSTANT TIME. `==` returns as soon as bytes differ, so an
  # attacker measures how long it took and recovers the MAC one
  # byte at a time — about 256 × 32 requests rather than 2^256.
  raise Invalid unless OpenSSL.secure_compare(mac, expected)
  JSON.parse(data)
end
# Note the MAC covers the serialised data, not the parsed object,
# and verification happens before parsing. Parsing first means you
# have deserialised attacker-controlled input before checking
# whether it came from you.

# 4. Tokens, and why the generation matters.
SecureRandom.urlsafe_base64(32)     # 256 bits from the OS CSPRNG
rand(10**20)                        # Mersenne Twister: predictable
                                     # from a few outputs
Time.now.to_i.to_s                   # guessable
SecureRandom.uuid                    # fine as an identifier,
                                     # 122 bits — not as a secret
# For anything acting as a credential, 256 bits from a CSPRNG.
# Anything derived from a timestamp, a counter or a PRNG designed
# for simulations is guessable, and the guess is offline and free.
```
:::

:::failure
**Calling base64 encryption.** No key, no secret, trivially reversible. It appears in real systems
as "we obfuscate the id", and the id is readable by anyone who recognises the alphabet.

**Encryption without authentication.** AES-CBC or AES-CTR without a MAC lets an attacker modify
ciphertext and have the modified plaintext accepted. Use an AEAD mode; there is no reason to
compose your own.

**A distinguishable padding failure.** If "bad padding" and "bad MAC" differ in error message,
status code or timing, you have a padding oracle and the attacker decrypts the message without the
key. This broke ASP.NET, TLS CBC suites and XML Encryption, repeatedly.

**Nonce reuse.** Deriving a nonce from a user id, a row id, a counter that resets on deploy, or a
truncated timestamp. Random per message, from a CSPRNG.

**Forgetting to set the auth tag before decrypting.** In OpenSSL's API, if `auth_tag` is not set,
`final` has nothing to verify — so decryption succeeds on tampered data and the mode's whole
benefit is gone silently.

**Comparing MACs with `==`.** Early return leaks the number of matching bytes through timing, which
turns an infeasible brute force into a few thousand requests. Use the library's constant-time
comparison.

**Parsing before verifying.** Decode and deserialise attacker-controlled input, then check the
signature. The deserialisation already happened, and if the format is one that instantiates objects
you have executed code before deciding whether to trust the message.

**A fast hash for passwords.** Covered in the authentication lesson and worth repeating because it
is the most consequential category error.

**`Math.random` or `rand` for anything secret.** These are designed for simulations and are
predictable from a handful of outputs. Session ids, reset tokens, nonces and API keys all need a
CSPRNG.

**A key in the repository.** Git retains it forever, so rotating the key is necessary and
rewriting history is not sufficient — anyone who cloned has it. Rotate first, clean up second.

**Deterministic encryption on low-cardinality data.** Encrypting a boolean or a country code
deterministically produces a lookup table: equal ciphertexts reveal equal values, and with a few
dozen possibilities the attacker simply encrypts each one.

**No key rotation plan.** Storing a key id with each ciphertext costs a column now. Retrofitting it
means decrypting and re-encrypting everything with no way to tell which key any given row used.

**Encrypting without considering the threat model.** Encrypting a column with a key the application
can read protects against a leaked backup and not against a compromised application — which is a
real and useful property, and should be stated rather than assumed to be more.
:::

:::realworld
```text
// What you actually do, in practice.
//
//   Passwords              → the framework's has_secure_password,
//                             backed by Argon2id or bcrypt.
//   Field encryption       → the framework's feature (Rails
//                             encrypts, Django's fields), which
//                             handles nonces, tags and key
//                             derivation.
//   Secrets at rest        → a KMS or secrets manager. Never the
//                             repository, never the same database.
//   Secrets in transit     → TLS 1.3, terminated by something
//                             maintained.
//   Signed URLs and        → the framework's message verifier,
//     tokens                  which gets constant-time comparison
//                             and versioning right.
//   Randomness             → SecureRandom and nothing else.
//
// Notice how little of this is a cryptographic decision. The
// decisions are about where keys live and who can read them.
```

```text
// Envelope encryption, because it is the pattern worth knowing.
//
//   per record:
//     data_key = random 256 bits
//     ciphertext = AES-GCM(data_key, plaintext)
//     wrapped_key = KMS.encrypt(master_key_id, data_key)
//     store: ciphertext, nonce, tag, wrapped_key, master_key_id
//
//   to read:
//     data_key = KMS.decrypt(wrapped_key)
//     plaintext = AES-GCM-decrypt(data_key, ...)
//
//   Why it is the standard pattern:
//     - the master key never leaves the KMS, so it cannot be
//       exfiltrated by reading the database or the application's
//       memory
//     - rotating the master key re-encrypts the small wrapped
//       keys, not terabytes of data
//     - every decryption is a KMS call, so access is logged and
//       revocable — which turns "someone read the table" from
//       unknowable into an audit query
//     - a per-record key limits the damage from any single key
//       compromise
```

```text
// What to look for in a review:
//
//   grep for base64 described as encryption
//   grep for AES-CBC, AES-ECB — ECB is never right, CBC needs a
//     MAC you probably did not add
//   grep for `==` near `hmac`, `signature`, `digest`, `token`
//   grep for Math.random, rand(, mt_rand near token or secret
//   grep for hardcoded keys: /key\s*=\s*["'][A-Za-z0-9+\/]{16,}/
//   check whether any ciphertext column has a key id beside it
//   check whether a decryption failure is distinguishable from a
//     tampering failure in logs, timing or status
//
// Each of these is mechanical and each finds a real class of bug.
```
:::

:::mistakes
**Base64 called encryption.** No key, no secret.

**Encryption without authentication.** Use AEAD.

**Distinguishable padding and MAC failures.** A padding oracle.

**Nonce reuse.** Random per message.

**Not setting the auth tag before decrypting.** Verification silently skipped.

**`==` on a MAC.** Timing leak; use constant-time comparison.

**Parsing before verifying.** Deserialising untrusted input first.

**A fast hash for passwords.**

**`rand`/`Math.random` for secrets.** Use a CSPRNG.

**Keys in the repository.** Rotate first, then clean up.

**Deterministic encryption on low-cardinality data.** A lookup table.

**No key id stored with ciphertext.** Rotation becomes impossible.

**Encrypting without stating the threat model.** It protects against a leaked backup, not a
compromised application.
:::

:::tradeoffs
**Hashing** — irreversible, no key to manage, and you can never read the value back. Right for
passwords, fingerprints and deduplication.

**Deterministic encryption** — searchable with an equality lookup; equal values are visibly equal,
which leaks structure and is a lookup table on low-cardinality data.

**Randomised encryption** — no structure leaked at all; unsearchable, so you need a separate
blind index or a hash column if you must query it.

**AEAD (GCM, ChaCha20-Poly1305)** — confidentiality and integrity in one operation, one failure
mode, hard to misuse except via the nonce; requires nonce discipline.

**Encrypt-then-MAC by hand** — complete control and four opportunities to get it wrong, each with
a named attack. There is no reason to choose this.

**A local key (env var)** — simple, fast, free; readable by anything that can read the process's
environment or a memory dump, and rotation is manual.

**A KMS with envelope encryption** — the master key never leaves the service, access is logged and
revocable, rotation is tractable; a network call per decryption, a cost per operation, and a
dependency in the critical path.

**TLS termination at a load balancer** — maintained by someone else and offloaded; the traffic
inside your network is then plaintext, which matters for a zero-trust posture.

The summary worth keeping: **the algorithm is a library call and the keys are your problem.** Use
the short list of right answers, let a library handle the construction, and spend the available
effort on where keys live, who can read them, how they rotate, and what you can prove about who
accessed what.
:::

:::checkpoint
1. Encoding, hashing, MAC, encryption — what distinguishes each, and which question picks one?
2. What does "do not roll your own crypto" mean precisely? Give a composition bug.
3. Why is nonce reuse in GCM worse than just leaking plaintext?
4. What is a padding oracle, and what makes it possible?
5. Why must a MAC be compared in constant time? How many requests does the attack take?
6. Why verify before parsing?
7. Why is deterministic encryption wrong for a country code?
8. Give three properties envelope encryption buys that a local key does not.
:::

:::interview
Start with the categories, because the confusion between them is the most common real problem:

*"Encoding is a reversible representation change with no key and no security property — base64 is
encoding, and 'we encrypt it with base64' is the most common misunderstanding in this area.
Hashing is one-way with no key, so it is for verification and integrity. A MAC is one-way with a
key, so it proves origin as well as integrity. Encryption is reversible with a key. The question
that picks one is whether you ever need the original value back: passwords never, so hash them;
card numbers yes, so encrypt them — and then the hard part is key management rather than the
algorithm."*

Be precise about the maxim, because the usual reading is too broad:

*"'Do not roll your own crypto' means do not invent the construction, not do not use cryptography.
Calling AES-256-GCM from a library is expected. Combining AES-CBC with your own padding and your
own MAC ordering is where systems break, and the failures are compositional: a MAC over the
plaintext rather than the ciphertext, a nonce reused, a padding error distinguishable from a MAC
error, a comparison that returns early. Each has a decade of literature and a named attack, and
none of them is visible in a test that only checks that encrypt-then-decrypt round-trips."*

The nonce answer is a good one to be able to derive:

*"GCM is counter mode, so the nonce and key produce a keystream that is XORed with the plaintext.
Reuse the nonce with the same key and two ciphertexts share a keystream, so XORing the ciphertexts
cancels it and leaves the XOR of the plaintexts. And in GCM specifically, nonce reuse also reveals
the authentication subkey, so the attacker can forge valid tags — you lose confidentiality and
integrity simultaneously. So the nonce is random per message from a CSPRNG, stored next to the
ciphertext since it is not secret, and never derived from anything predictable."*

And the framing that matters most in practice: *"almost none of my real decisions are
cryptographic. The algorithm is on a short published list and comes from a library. What is
genuinely mine is where the key lives, who can read it, how it rotates, and what I can prove about
who decrypted what — which is why envelope encryption with a KMS is the standard pattern: the
master key never leaves the service, rotation re-encrypts small wrapped keys rather than terabytes,
and every decryption is a logged, revocable call."*
:::

## What you now know

- Encoding has no security property; hashing is keyless and one-way; a MAC is keyed; encryption
  is reversible.
- The question that picks one: do you ever need the original value back?
- "Do not roll your own" means the construction, not the primitives.
- Use AEAD — AES-256-GCM or XChaCha20-Poly1305 — so integrity is not a separate decision.
- Encryption without authentication lets an attacker modify ciphertext undetected.
- A padding oracle exists whenever padding and MAC failures are distinguishable.
- Nonce reuse in GCM leaks the XOR of plaintexts *and* the authentication subkey.
- Generate nonces randomly per message; store them with the ciphertext, since they are not secret.
- Forgetting to set the auth tag makes GCM verification silently not happen.
- Compare MACs in constant time; `==` reduces the attack to a few thousand requests.
- Verify before parsing, so you never deserialise unauthenticated input.
- Use a CSPRNG for anything secret; `rand` and `Math.random` are predictable.
- Deterministic encryption enables equality lookups and makes low-cardinality data a lookup table.
- Store a key id with every ciphertext, or rotation becomes impossible to retrofit.
- Envelope encryption keeps the master key in a KMS, makes rotation cheap, and logs every
  decryption.
- A key in the repository must be rotated, not just removed from history.
- State the threat model: an application-readable key protects against a leaked backup, not a
  compromised application.
