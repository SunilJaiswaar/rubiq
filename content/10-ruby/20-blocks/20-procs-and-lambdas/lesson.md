---
title: Procs and lambdas
summary: Two objects that look identical, behave differently in two specific ways, and the historical reason both exist.
level: intermediate
minutes: 15
version: "3.3"
status: stable
last_reviewed: "2026-09-20"
tags: [ruby, proc, lambda, closures, arity]
concepts: [procs, lambdas, arity, closures]
prerequisites: [blocks, yield]
interview:
  - question: What is the difference between a proc and a lambda?
    level: intermediate
    hint: There are exactly two differences that matter.
    answer: >-
      Two things. First, **argument checking**: a lambda enforces arity like a method and
      raises ArgumentError on a mismatch; a proc silently pads missing arguments with
      `nil` and discards extras. Second, **`return` semantics**: `return` in a lambda
      returns from the lambda; `return` in a proc returns from the *enclosing method*, and
      raises LocalJumpError if that method has already finished. Everything else —
      `call`, `curry`, closure behaviour, being a `Proc` instance — is the same. You can
      tell them apart with `#lambda?`.
    followUps:
      - "Why does the difference exist at all? Why not just have lambdas?"
      - "Which one does `&:symbol` produce?"
      - "What happens if you `return` from a proc whose defining method has already returned?"
  - question: Why does `[1,2,3].each(&:to_s)` work? What is `&` doing?
    level: intermediate
    answer: >-
      `&` converts an object into a block by calling `to_proc` on it. `Symbol#to_proc`
      returns a proc that sends that symbol as a message to its argument — roughly
      `->(x) { x.to_s }`. So `&:to_s` becomes the block. The same mechanism works for any
      object that defines `to_proc`, including `Method` objects via `method(:puts)`, which
      is how you pass an existing method as a block.
    followUps:
      - "How would you make your own class usable with `&`?"
  - question: When would you reach for a proc rather than a lambda?
    level: advanced
    answer: >-
      Almost never, deliberately. Procs are what blocks become when captured with
      `&block`, so you encounter them constantly without choosing them. When you are
      explicitly creating a callable to store or pass around, a lambda is nearly always
      right: strict arity catches wiring mistakes at the call site, and local `return`
      means the callable cannot tear down a frame somewhere else. The main reason to want
      proc semantics is deliberate arity leniency — a callback whose signature may grow
      without breaking existing callers.
resources:
  - title: "Ruby documentation — Proc#lambda?"
    url: https://docs.ruby-lang.org/en/master/Proc.html#method-i-lambda-3F
---

## Why are there two of these?

A block is not an object. Sometimes you need it to be — to store it in an instance
variable, put it in a hash, return it from a method, or pass it along to something else.
Ruby gives you two ways to get a callable object, and they look interchangeable:

```ruby runnable
double_proc   = Proc.new { |x| x * 2 }
double_proc2  = proc { |x| x * 2 }
double_lambda = lambda { |x| x * 2 }
double_arrow  = ->(x) { x * 2 }

puts double_proc.call(5)
puts double_lambda.call(5)
puts double_arrow.(5)       # .() is also call
puts double_arrow[5]        # so is []

puts double_proc.class      # Proc
puts double_lambda.class    # Proc  — same class!
puts double_proc.lambda?    # false
puts double_lambda.lambda?  # true  — the difference is a flag, not a type
```

Both are instances of `Proc`. The difference is a boolean flag on the object. That is a
strange design, and it is strange for a historical reason.

:::history
Blocks came first, in Ruby's earliest versions, inspired by Smalltalk. `Proc.new` existed
to turn a block into an object, and it faithfully preserved block semantics — including
lenient arguments and method-level `return`, because a proc was conceptually *a block
you happened to be holding*.

Then people started using procs as functions: storing them, composing them, returning
them. For that purpose block semantics are wrong. A function that silently accepts the
wrong number of arguments hides bugs, and a function whose `return` escapes into the
caller's frame is not a function at all.

Rather than change `Proc` and break existing code, Matz added `lambda` — the same class
with the flag flipped to method-like behaviour. Ruby 1.9 then added the `->` arrow syntax
because `lambda { |x| }` is wordy for something you write constantly.

So: `Proc` is "a block as an object" and `lambda` is "a function as an object", and they
share a class for backward-compatibility reasons that made sense in 2003. Knowing that
makes the two differences predictable rather than arbitrary — in each case, the proc acts
like a block, and the lambda acts like a method.
:::

:::what
A **proc** is a callable object with *block* semantics: lenient arguments, and `return`
that exits the enclosing method.

A **lambda** is a callable object with *method* semantics: strict arguments, and `return`
that exits only the lambda.
:::

## Difference one: argument checking

```ruby runnable
pr = proc    { |a, b| "a=#{a.inspect} b=#{b.inspect}" }
la = lambda  { |a, b| "a=#{a.inspect} b=#{b.inspect}" }

# A proc pads and discards without complaint:
puts pr.call(1)           # a=1 b=nil
puts pr.call(1, 2, 3)     # a=1 b=2    (the 3 is dropped)
puts pr.call([1, 2])      # a=1 b=2    (the array is auto-splatted!)

# A lambda insists:
begin
  la.call(1)
rescue ArgumentError => e
  puts "ArgumentError: #{e.message}"
end
puts la.call(1, 2)
```

That third proc case is worth staring at. `pr.call([1, 2])` destructures the array into
`a` and `b`. This is the same auto-splatting that makes `hash.each { |key, value| }` work
when `each` actually yields a single two-element array per entry.

:::why
Block leniency is not sloppiness; it is what makes iteration ergonomic.

```ruby runnable
pairs = { a: 1, b: 2 }

# Hash#each yields ONE argument per iteration: a [key, value] array.
pairs.each { |pair| p pair }

# But block leniency lets you destructure it for free:
pairs.each { |key, value| puts "#{key} -> #{value}" }

# And ignore what you do not need:
pairs.each { |key| puts key }
```

Without auto-splatting, every hash iteration would need `|pair| key, value = pair`. The
leniency pays for itself hundreds of times a day — in blocks. It stops paying the moment
the callable is a stored function, which is why lambdas opted out.
:::

## Difference two: what `return` means

This is the one that causes production bugs.

```ruby runnable
def with_lambda
  checker = -> { return "from lambda" }
  result = checker.call
  "method finished, lambda returned #{result.inspect}"
end

def with_proc
  checker = proc { return "from proc" }
  checker.call
  "this line never runs"
end

puts with_lambda
puts with_proc
```

A lambda's `return` returns from the lambda, like a method. A proc's `return` returns from
the method that *created* it — so calling the proc ends `with_proc` immediately, and the
final string is never evaluated.

:::failure
Now the dangerous version. What if the proc outlives the method that created it?

```ruby runnable
def make_escaping_proc
  proc { return "nowhere to go" }
end

escaper = make_escaping_proc   # make_escaping_proc has already returned

begin
  escaper.call
rescue LocalJumpError => e
  puts "#{e.class}: #{e.message}"
end
```

`LocalJumpError`. The proc tries to return from a frame that no longer exists on the
stack. The lambda version is simply fine:

```ruby runnable
def make_lambda
  -> { return "safe" }
end

puts make_lambda.call
```

**This is the practical rule.** Any callable you store, return, or pass across a boundary
should be a lambda. A stored proc is a latent `LocalJumpError` waiting for the day someone
calls it from somewhere other than where it was made.
:::

:::mistakes
**Assuming `&:symbol` and `&block` give you lambdas.** They do not — both produce procs:

```ruby runnable
def capture(&b)
  b
end

puts capture { }.lambda?                 # false — a captured block is a proc
puts :upcase.to_proc.lambda?             # false
puts method(:puts).to_proc.lambda?       # true  — Method#to_proc IS a lambda
```

This matters when you forward a captured block somewhere it will be stored. If a library
captures your block with `&block` and keeps it in a callback registry, and your block
contains `return`, you have created exactly the `LocalJumpError` above — and the stack
trace will point at the library, not at you.

**Forgetting that arity reporting differs:**

```ruby runnable
puts proc { |a, b| }.arity        # 2
puts proc { |a, *b| }.arity       # -2  (one required, then any number)
puts lambda { |a, b = 1| }.arity  # -2
puts proc { }.arity               # 0
puts proc { |*a| }.arity          # -1
```

Negative arity means "at least `-(n+1)` required arguments". `-2` means one required.
Libraries use `arity` to decide how to call your callback, which is why a block with the
wrong signature sometimes produces a confusing error from deep inside a gem.
:::

## The `&` operator, properly understood

`&` in an argument position means: *convert this object to a block by calling `to_proc`
on it.*

```ruby runnable
words = %w[apple pear fig]

# All four of these are the same thing.
p words.map { |w| w.upcase }
p words.map(&:upcase)
p words.map(&->(w) { w.upcase })
p words.map(&:upcase.to_proc)
```

Because it is just `to_proc`, you can make your own objects work with it:

```ruby runnable
class Multiplier
  def initialize(factor)
    @factor = factor
  end

  def to_proc
    ->(n) { n * @factor }
  end
end

p [1, 2, 3].map(&Multiplier.new(10))
```

And in the other direction, `&` on a parameter captures the block as a Proc:

```ruby runnable
def forwards(&block)
  # `&block` on the way out converts the Proc back into a block.
  [1, 2, 3].each(&block)
end

forwards { |n| puts "got #{n}" }
```

:::realworld
Lambdas are the right default wherever a callable is *data*:

```ruby
# Rails validations and scopes — stored and called later, so lambdas.
validates :email, format: { with: URI::MailTo::EMAIL_REGEXP }
scope :recent, -> { where("created_at > ?", 1.week.ago) }

# Rack middleware is literally a callable object.
app = ->(env) { [200, { "content-type" => "text/plain" }, ["ok"]] }

# A dispatch table — far clearer than a long case statement.
HANDLERS = {
  "created"  => ->(payload) { Order.create!(payload) },
  "refunded" => ->(payload) { Refund.process(payload) },
  "disputed" => ->(payload) { Dispute.open(payload) },
}.freeze

def handle(event, payload)
  handler = HANDLERS.fetch(event) { ->(_) { raise "unknown event #{event}" } }
  handler.call(payload)
end

puts handle("created", { id: 1 }).inspect rescue puts "needs Order class"
```

Notice that `scope :recent, -> { ... }` must be a lambda for a second reason: it is stored
and re-evaluated on every call, so `1.week.ago` is computed fresh each time. Written as a
plain value it would freeze the timestamp at class-load time — a real and famous Rails bug.
:::

:::internals
Both procs and lambdas capture a `Binding`: a reference to the local variable scope, `self`,
and the default definee at the point of creation. That is what makes them closures, and
you can inspect it:

```ruby runnable
def make_closure
  secret = "hidden"
  -> { secret }
end

c = make_closure
puts c.call
p c.binding.local_variables
puts c.binding.local_variable_get(:secret)
```

The `lambda?` flag changes two things in the VM: whether argument setup uses the strict
method path or the lenient block path, and how a `return` instruction is compiled —
lambdas get a local return, procs get a non-local jump targeting the creating frame's
identifier. When that frame is gone, the jump fails, which is the `LocalJumpError`.

Because a closure holds the whole binding, it keeps every local in that scope alive:

```ruby
def leaky
  huge = File.read("enormous.log")   # 500 MB
  small = huge.lines.first
  -> { small }                       # keeps `huge` alive too — the whole binding is captured
end
```

The fix is to not have the large object in scope: extract the small computation into its
own method so the closure's binding is small. This is a real source of memory growth in
long-running Ruby processes that register callbacks.
:::

:::tradeoffs
**Lambda.** Errors surface at the call site. Safe to store and pass. Behaves like a
method, which is what most people expect. Cost: you must get the arity right, which is
occasionally annoying for callbacks whose signature evolves.

**Proc.** Ergonomic destructuring, tolerant of signature changes, and it is what blocks
*are*, so you cannot avoid it. Cost: silently wrong argument counts, and a `return` that
can escape into a frame that may not exist.

**The design itself.** Sharing one class for two behaviours is a wart — `lambda?` should
not need to exist. But the alternative in 2003 was breaking every program using
`Proc.new`, and Ruby chose compatibility. Worth remembering when you are tempted to
"clean up" an API that many people depend on.
:::

:::debugging
When a callable misbehaves, these four lines tell you almost everything:

```ruby runnable
def diagnose(c)
  puts "lambda?:    #{c.lambda?}"
  puts "arity:      #{c.arity}"
  puts "parameters: #{c.parameters.inspect}"
  puts "defined at: #{c.source_location.inspect}"
end

diagnose(->(a, b = 1, *rest, key:, **opts) { })
```

`parameters` is the one people forget. It distinguishes `:req`, `:opt`, `:rest`,
`:keyreq`, `:key` and `:block`, which is exactly what you need when a library is calling
your callback with a shape you did not anticipate.
:::

:::checkpoint
Predict the output of each, then run them:

```ruby
# 1
add = proc { |a, b| (a || 0) + (b || 0) }
puts add.call(1)

# 2
add_l = ->(a, b) { a + b }
puts add_l.call(1) rescue puts "raised"

# 3
def mystery
  p = proc { return :early }
  p.call
  :late
end
puts mystery

# 4
def mystery2
  l = -> { return :early }
  l.call
  :late
end
puts mystery2
```

If you got 3 and 4 right for the right reason, you have the concept.
:::

:::interview
Candidates routinely recite "procs are lenient, lambdas are strict" and stop. Two things
distinguish a strong answer:

1. **Give the `return` difference equal weight,** and explain the `LocalJumpError` case —
   a stored proc whose creating method has returned. That is the difference that actually
   causes incidents.
2. **Explain *why* both exist.** Procs preserve block semantics because a proc *is* a
   block as an object; lambdas were added for function semantics without breaking
   existing code. Then state the rule you follow: lambda for anything stored or passed,
   and accept procs wherever blocks are captured.

A good closing line: *"and `&:symbol` gives you a proc, not a lambda, which matters if the
library stores it."* That is the detail that shows experience.
:::

## What you now know

- `proc` and `lambda` are both `Proc` instances distinguished by a flag; `#lambda?` tells
  you which.
- Procs check arguments leniently and auto-splat arrays — the behaviour that makes
  `hash.each { |k, v| }` work.
- Lambdas check arguments strictly, like methods.
- `return` in a lambda is local; in a proc it exits the creating method, and raises
  `LocalJumpError` if that method is gone.
- Default to lambdas for anything you store, return or pass on.
- `&` means `to_proc`, which is why `&:upcase` works and why you can make your own
  objects usable with it.
- Closures capture the whole binding, so a closure in scope with a large object keeps it alive.
