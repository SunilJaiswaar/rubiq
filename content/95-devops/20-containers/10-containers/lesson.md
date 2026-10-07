---
title: Containers
summary: A container is a process with a different view of the filesystem and some limits — not a virtual machine. Six facts that follow, and the problems each explains.
level: intermediate
minutes: 18
version: "1"
status: stable
last_reviewed: "2026-10-07"
tags: [devops, containers, docker, images, kubernetes]
concepts: [containers, images, layers, namespaces]
prerequisites: [processes, virtual-memory]
interview:
  - question: What is a container, actually?
    level: intermediate
    answer: >-
      A normal process on the host kernel, started with namespaces that give it its own view of
      the filesystem, network, process tree and hostname, and cgroups that cap its CPU and memory.
      There is no guest kernel and no hardware emulation — `ps` on the host shows the process. That
      single fact explains most of what surprises people: startup is milliseconds because there is
      nothing to boot, overhead is near zero because there is no second kernel, a Linux image
      cannot run on a Windows kernel without a Linux VM underneath, and isolation is weaker than a
      virtual machine's because a kernel vulnerability is shared.
    followUps:
      - "So what are the isolation implications?"
  - question: What is an image, and why does layer order matter?
    level: intermediate
    answer: >-
      A stack of read-only filesystem layers plus metadata, where each Dockerfile instruction
      produces a layer. Builds cache per layer and the cache invalidates from the first changed
      layer downwards — so if you copy your source before installing dependencies, every source
      change reinstalls everything. Putting the dependency manifest in, installing, and only then
      copying the source means a code change rebuilds one layer. The other consequence is that
      deleting a file in a later layer does not reclaim it: the bytes are still in the earlier
      layer, which is how secrets end up permanently in images.
    followUps:
      - "So how do you get a secret into a build safely?"
  - question: Why does a container die when the main process exits?
    level: intermediate
    answer: >-
      Because the container *is* that process. PID 1 in the namespace is your entrypoint, and when
      it exits the namespace is torn down. Two consequences follow: a process that daemonises and
      returns immediately makes the container exit, and PID 1 has special signal behaviour — it
      does not get default signal handlers, so a process that does not explicitly handle SIGTERM
      ignores it and is SIGKILLed after the grace period, losing in-flight work. It also inherits
      the duty of reaping orphaned children, which is why `--init` or `tini` exists.
    followUps:
      - "What does that mean for graceful shutdown?"
resources:
  - title: "Docker — best practices for writing Dockerfiles"
    url: https://docs.docker.com/build/building/best-practices/
---

## Not a virtual machine

```text
  VIRTUAL MACHINE                 CONTAINER
  ┌─────────────────┐             ┌─────────────────┐
  │ app             │             │ app             │
  │ libs            │             │ libs            │
  │ GUEST KERNEL    │             │                 │  ← no kernel
  │ virtual hw      │             │                 │  ← no hw
  ├─────────────────┤             ├─────────────────┤
  │ hypervisor      │             │ container rt    │
  │ host kernel     │             │ HOST KERNEL     │  ← shared
  └─────────────────┘             └─────────────────┘

  boot:      30s                  start:    ~50ms
  overhead:  a kernel + hw        overhead: ~0
  isolation: hardware-enforced    isolation: kernel features
  kernel:    its own              kernel:    the host's

  A container is a process. `ps aux` on the host shows it. That
  one sentence explains almost everything below.
```

:::what
A **container** is a process isolated by **namespaces** (its own filesystem, network, PID and
hostname views) and limited by **cgroups** (CPU, memory, I/O). An **image** is a stack of
read-only layers plus metadata. A **layer** is the filesystem delta produced by one build step.
:::

:::why
Containers solved a deployment problem rather than an isolation problem, and keeping that in mind
explains both their shape and their limits.

The problem was that "it works on my machine" is usually a statement about the environment: a
system library version, a locale, a missing binary, an environment variable, a different OpenSSL.
A virtual machine solved that and cost a full guest kernel per application, so you could not run
twenty of them per host or start one per request.

A container keeps the useful half — a complete, pinned filesystem containing exactly the
dependencies you tested against — and discards the expensive half, the second kernel. What remains
is a process with a different root directory and some limits, which is why it starts in
milliseconds and why density is high enough to make per-service deployment practical.

The cost of sharing the kernel is the thing to be clear-eyed about. Isolation is enforced by kernel
features rather than by hardware, so a kernel vulnerability is a shared vulnerability, and a
container escape is a known category rather than a theoretical one. That is an acceptable trade
between your own services and a poor one between untrusted tenants, which is why multi-tenant
providers run virtual machines underneath the containers rather than relying on containers alone.
:::

:::how
```text
  LAYER CACHING — the single most consequential build fact

    Each instruction produces a layer. The cache is invalidated
    from the first changed layer DOWNWARDS.

    ✗ WRONG
      COPY . .                  ← any source change invalidates…
      RUN npm ci                ← …this, so every build reinstalls

    ✓ RIGHT
      COPY package*.json ./     ← changes rarely
      RUN npm ci                ← cached until dependencies change
      COPY . .                  ← changes constantly, cheap layer

    A one-line code change: 4 minutes versus 10 seconds.

  LAYERS ARE ADDITIVE — deleting does not reclaim

      RUN wget big.tar.gz && tar -xf big.tar.gz
      RUN rm big.tar.gz         ← a NEW layer that hides the file

      The bytes are still in the earlier layer. The image is still
      large, and `docker history` shows it.

      → do it in ONE layer:
      RUN wget big.tar.gz && tar -xf big.tar.gz && rm big.tar.gz

    And the security version of the same fact:

      COPY id_rsa /tmp/
      RUN use-it && rm /tmp/id_rsa

      The key is in the image permanently and anyone who pulls it
      can extract it. Use BuildKit secret mounts, which never
      enter a layer at all.

  PID 1 — why containers exit and why SIGTERM is ignored

    The container IS the entrypoint process. It exits → the
    container exits. So:
      - a process that daemonises and returns = instant exit
      - `CMD service nginx start` exits immediately

    And PID 1 is special in Linux: it does NOT get default signal
    handlers. A process with no explicit SIGTERM handler, running
    as PID 1, IGNORES SIGTERM — so an orchestrator's graceful
    stop does nothing, the grace period elapses, and SIGKILL
    discards in-flight requests.

      → handle SIGTERM explicitly, and use `--init` or `tini` so
        orphaned children are reaped.

  EXEC vs SHELL FORM — the reason signals get lost

      CMD npm start            → runs `/bin/sh -c "npm start"`
                                  sh is PID 1 and does not forward
                                  signals to npm
      CMD ["npm", "start"]     → npm is PID 1 and receives them

    This single distinction is responsible for a large share of
    "my container will not stop gracefully" reports.

  WHAT THE CONTAINER SEES, AND DOES NOT

      /proc/cpuinfo    → the HOST's CPUs
      /proc/meminfo    → the HOST's memory
      free, nproc      → the host's figures

    So a runtime that sizes its thread pool or heap from these
    gets it badly wrong under a cgroup limit — the same class of
    bug as the scheduling lesson's GOMAXPROCS problem. Modern
    JVMs and Go read cgroup limits; many other things do not.
```
:::

:::example
```dockerfile
# A multi-stage build, annotated with why each line is where it is.

# ---- build stage: tools that must not ship ----
FROM node:24-slim AS build
WORKDIR /app

# Dependencies first, so a source change does not reinstall them.
COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build && npm prune --omit=dev

# ---- runtime stage: only what is needed to run ----
FROM node:24-slim
WORKDIR /app

# A non-root user. Without this the process is root inside the
# container, and a container escape is then root on the host.
RUN useradd --no-create-home --shell /usr/sbin/nologin app
USER app

# Copy only the built output and production dependencies, so the
# compiler, the dev dependencies and the source are absent.
COPY --from=build --chown=app /app/dist ./dist
COPY --from=build --chown=app /app/node_modules ./node_modules

# Exec form, so the process is PID 1 and receives signals.
CMD ["node", "dist/server.js"]
```

```javascript
// Graceful shutdown — the handler that makes a rolling deploy
// lose no requests.
const server = app.listen(3000);

let shuttingDown = false;
process.on("SIGTERM", () => {
  if (shuttingDown) return;
  shuttingDown = true;

  // 1. Fail readiness FIRST, so the load balancer stops sending
  //    new requests. Without this, requests arrive during
  //    shutdown and fail.
  app.set("ready", false);

  // 2. Give the load balancer time to notice. This delay is not
  //    optional — endpoint propagation takes seconds, and closing
  //    immediately drops requests that were already routed.
  setTimeout(() => {
    server.close(() => {       // 3. finish in-flight requests
      db.end();                 // 4. then release resources
      process.exit(0);
    });
  }, 5000);
});

// And the orchestrator needs a grace period longer than the sum:
//   terminationGracePeriodSeconds: 30
// Shorter than your shutdown sequence means SIGKILL mid-request.
```

```yaml
# The two probes, which are different questions.
livenessProbe:          # "is this process wedged? restart it"
  httpGet: { path: /healthz, port: 3000 }
  periodSeconds: 10
  failureThreshold: 3
readinessProbe:         # "should it receive traffic right now?"
  httpGet: { path: /ready, port: 3000 }
  periodSeconds: 5
startupProbe:           # "it is still booting; do not judge yet"
  httpGet: { path: /healthz, port: 3000 }
  failureThreshold: 30
  periodSeconds: 2

# The distinction matters: a liveness probe that checks the
# DATABASE will restart every pod when the database has a blip,
# turning a dependency hiccup into a full outage — and the
# restarts make recovery slower. Liveness checks only "is this
# process able to serve"; readiness checks dependencies.
```
:::

:::failure
**`COPY . .` before installing dependencies.** Every source change reinstalls everything. The
single most common Dockerfile mistake and a four-minute build that should be ten seconds.

**Deleting a file in a later layer to shrink the image.** The bytes remain in the earlier layer.
`docker history` shows the real size, and secrets copied in during a build are permanently
extractable by anyone who pulls the image.

**Shell-form `CMD`.** `CMD npm start` runs under `/bin/sh -c`, so `sh` is PID 1 and does not
forward signals. SIGTERM is ignored, the grace period elapses, and SIGKILL discards in-flight
requests. Use the exec form.

**No SIGTERM handler.** Even in exec form, PID 1 does not get default signal handlers, so a
process that does not install one ignores SIGTERM entirely.

**Closing the server before failing readiness.** Requests already routed by the load balancer
arrive at a closed socket. Fail readiness, wait for propagation, *then* stop accepting.

**A grace period shorter than the shutdown sequence.** SIGKILL mid-request, so the careful handler
accomplishes nothing.

**Running as root.** The default, and it means a container escape is root on the host. Add a user
and a `USER` directive.

**`latest` as a tag.** Not reproducible — two deploys of "the same" image can differ — and it
defeats rollback, since the tag no longer points at the old thing. Tag with a content digest or a
commit SHA.

**A liveness probe that checks dependencies.** A database blip restarts every pod simultaneously,
which converts a degraded dependency into a full outage and makes recovery slower. Liveness is
about this process; readiness is about dependencies.

**No resource limits.** One container can consume the node's memory and get other things OOM-killed
alongside it. Memory limits in particular are not optional, because memory is not compressible.

**Sizing a runtime from `/proc`.** It reports the host's CPUs and memory, not the cgroup's. The
same class of bug as the scheduler lesson's.

**Writing to the container filesystem for anything that must persist.** It is ephemeral; a restart
discards it. Logs to stdout, state to a volume or an external store.

**Building a huge image.** A 2GB image means slow pulls on every new node, slow scaling, slow
rollbacks and a larger attack surface from packages you never use.
:::

:::realworld
```text
// Image size, and why it is worth attention.
//
//   node:24           ~1.1 GB    full Debian plus build tools
//   node:24-slim      ~240 MB    the usual right choice
//   node:24-alpine    ~140 MB    musl instead of glibc, which
//                                breaks some native modules and
//                                changes DNS resolution behaviour
//   distroless        ~110 MB    no shell, no package manager —
//                                a much smaller attack surface
//                                and genuinely harder to debug
//
//   The cost of size is paid on every pull: node scaling, a
//   rollback, a new deploy to a cold node. It is also attack
//   surface — every package you did not need is a CVE you have
//   to triage.
//
//   Alpine's musl is the trap: subtly different DNS handling and
//   no glibc means native extensions may fail in ways that only
//   appear under load or in specific network configurations.
//   `slim` is the lower-risk default.
```

```text
// What belongs in an image versus in configuration.
//
//   IN THE IMAGE       code, dependencies, the runtime. Identical
//                      in every environment, which is the entire
//                      point — the same artefact is promoted from
//                      staging to production.
//   IN THE ENVIRONMENT database URLs, API keys, feature flags,
//                      log level.
//
//   Building a separate image per environment destroys the
//   guarantee that you are deploying what you tested, which is
//   the same point the CI lesson makes about rebuilding at deploy
//   time.
//
//   Secrets specifically: injected at runtime, never baked in.
//   For build-time secrets — a private registry token — use
//   BuildKit's secret mounts, which are available during a RUN
//   and never written to a layer.
```

```bash
# Debugging a container, in order of usefulness.
docker logs -f --tail=100 CONTAINER     # stdout/stderr
docker exec -it CONTAINER sh            # a shell inside it
docker inspect CONTAINER                # config, mounts, env
docker stats                            # live CPU and memory
docker history IMAGE                    # layer sizes — finds the
                                        # 800MB layer you did not
                                        # expect
docker diff CONTAINER                   # what changed since start

# For a distroless image with no shell:
kubectl debug -it POD --image=busybox --target=app
# an ephemeral debug container sharing the namespaces, which is
# how you keep a minimal image and still investigate it.

# And the two things to check first when a container will not stay
# up:
docker inspect --format '{{.State.ExitCode}}' CONTAINER
#   137 = SIGKILL, usually the OOM killer → raise the memory limit
#         or fix the leak
#   143 = SIGTERM, a normal stop
#   1   = the application exited; read the logs
docker inspect --format '{{.State.OOMKilled}}' CONTAINER
```
:::

:::mistakes
**`COPY . .` before dependency installation.** Destroys the cache on every change.

**Deleting in a later layer.** The bytes stay; secrets stay extractable.

**Shell-form `CMD`.** `sh` becomes PID 1 and swallows signals.

**No SIGTERM handler.** PID 1 has no default handlers.

**Closing the server before failing readiness.** Routed requests fail.

**A grace period shorter than shutdown.** SIGKILL mid-request.

**Running as root.** An escape becomes host root.

**The `latest` tag.** Not reproducible and defeats rollback.

**A liveness probe that checks the database.** A blip restarts everything.

**No memory limit.** Memory is not compressible; one container takes the node.

**Reading `/proc` for CPU or memory.** It reports the host's.

**Persisting to the container filesystem.**

**A 2GB image.** Slow pulls, slow scaling, more CVEs.
:::

:::tradeoffs
**Containers** — fast start, near-zero overhead, high density, a pinned filesystem; isolation via
kernel features, so a kernel vulnerability is shared.

**Virtual machines** — hardware-enforced isolation and a separate kernel, so genuinely suitable for
untrusted tenants; seconds to boot and a kernel's worth of overhead each.

**Full base image** — every tool present, easy to debug; large, slow to pull, and a wide attack
surface.

**Slim** — a good default: most tooling, a fraction of the size, glibc so native modules work.

**Alpine** — very small; musl rather than glibc, with DNS and native-module differences that
surface in production rather than in testing.

**Distroless** — smallest attack surface and no shell, so you cannot exec in to look around.
Pair it with ephemeral debug containers.

**Multi-stage builds** — build tools stay out of the runtime image, which is both smaller and
safer; a slightly more complex Dockerfile.

**One process per container** — clean lifecycle, independent scaling, and the orchestrator's
restart semantics work; you need a sidecar or a separate container for anything else.

**Several processes per container** — simpler for legacy software; you now need a supervisor, and
the container's health no longer corresponds to one thing.

The sentence worth keeping: **a container is a process, not a machine.** Its lifecycle is a
process lifecycle, its signals are process signals, its filesystem is ephemeral, and its limits are
cgroup limits — and almost every surprising container behaviour follows directly from one of those
four.
:::

:::checkpoint
1. What is a container, in one sentence? Name three things that follow from it.
2. Why does `COPY . .` before `npm ci` cost four minutes instead of ten seconds?
3. Why does `rm` in a later layer not shrink the image, and what is the security version of that
   fact?
4. Why does `CMD npm start` break graceful shutdown?
5. Why does a process ignoring SIGTERM as PID 1 differ from ordinary process behaviour?
6. Why fail readiness before closing the server, and why wait in between?
7. Why is a liveness probe that checks the database harmful?
8. Why does a runtime that reads `/proc/cpuinfo` misbehave in a container?
:::

:::interview
Define it by what it is, because everything else follows:

*"A container is a normal process on the host kernel, started with namespaces that give it its own
view of the filesystem, network and process tree, and cgroups that cap its CPU and memory. There is
no guest kernel and no hardware emulation — `ps` on the host shows the process. That one fact
explains most of what surprises people: startup is milliseconds because nothing boots, overhead is
near zero because there is no second kernel, and isolation is weaker than a virtual machine's
because a kernel vulnerability is shared — which is why multi-tenant providers run VMs underneath
containers rather than relying on containers alone."*

Then the build fact with the biggest practical effect:

*"The layer cache invalidates from the first changed layer downwards, so copying source before
installing dependencies means every code change reinstalls everything — four minutes instead of
ten seconds. Copy the manifest, install, then copy the source. The related fact is that layers are
additive: deleting a file in a later layer does not reclaim the bytes, so a `RUN rm` after a `COPY`
leaves the file in the image permanently. That is also how secrets end up extractable from
published images, which is why build-time secrets need BuildKit mounts that never enter a layer."*

Then the PID 1 behaviour, which is reliably the most useful thing to know:

*"The container *is* the entrypoint process, so when it exits the container exits — a process that
daemonises makes the container stop immediately. And PID 1 is special in Linux: it does not get
default signal handlers, so a process with no explicit SIGTERM handler ignores SIGTERM entirely,
the grace period elapses, and SIGKILL discards in-flight requests. The shell form of CMD makes it
worse, because `/bin/sh -c` becomes PID 1 and does not forward signals to your process. Exec form,
explicit handler, and `--init` so orphaned children get reaped."*

And one operational detail: *"a liveness probe must not check dependencies. If it checks the
database, a brief database problem restarts every pod at once, which turns a degraded dependency
into a full outage and makes recovery slower because everything is cold. Liveness asks whether this
process is wedged; readiness asks whether it should receive traffic, and that is where dependency
checks belong."*
:::

## What you now know

- A container is a process with namespaces and cgroups — no guest kernel, no hardware emulation.
- Startup is milliseconds and overhead is near zero because nothing boots.
- Isolation is kernel-enforced, so a kernel bug is shared; VMs remain the answer for untrusted
  tenants.
- The layer cache invalidates downwards from the first change: manifest, install, then source.
- Layers are additive — deleting later does not reclaim bytes, and secrets stay extractable.
- Use BuildKit secret mounts for build-time secrets.
- The container is the entrypoint process; it exits when that process exits.
- PID 1 gets no default signal handlers, so SIGTERM must be handled explicitly.
- Shell-form `CMD` puts `/bin/sh` at PID 1, which does not forward signals.
- Use `--init` or `tini` so orphaned children are reaped.
- Fail readiness, wait for load-balancer propagation, then close the server.
- The grace period must exceed the whole shutdown sequence or SIGKILL interrupts it.
- Run as a non-root user; an escape as root is root on the host.
- Never deploy `latest`: it is not reproducible and defeats rollback.
- Liveness checks this process; readiness checks dependencies. Confusing them amplifies outages.
- `/proc` reports the host's CPUs and memory, so runtimes must read cgroup limits.
- The container filesystem is ephemeral: logs to stdout, state to a volume.
- Multi-stage builds keep build tools out of the runtime image.
- Exit code 137 means SIGKILL, usually the OOM killer.
