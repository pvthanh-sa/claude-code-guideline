---
name: lb-keepalive
description: "Aligns HTTP keep-alive / idle timeouts across every hop (CDN → load balancer → reverse proxy → app → outbound HTTP clients) so the side that reuses a pooled connection never sends a request onto a socket the other side already closed. Fixes and prevents intermittent 502s behind AWS ALB, CloudFront, nginx, HAProxy, Envoy and GCP/Azure load balancers, and ECONNRESET / 'socket hang up' from client connection pools. Runtime-agnostic: Node.js (Express, NestJS, Nuxt/Nitro, Next.js, Fastify), Python (Gunicorn, Uvicorn), Go, Java (Tomcat, Jetty), .NET Kestrel, Ruby Puma, Apache, nginx. Use when deploying any HTTP service behind a load balancer or proxy, when seeing random 502s or connection resets after idle periods, or when changing an LB idle timeout."
metadata:
  domain: devops
  triggers: keep-alive, keepalive, keepAliveTimeout, idle_timeout, idle timeout, 502 Bad Gateway, intermittent 502, ALB 502, HTTPCode_ELB_502_Count, ECONNRESET, socket hang up, connection reset, headersTimeout, persistent_timeout, timeout_keep_alive, IdleTimeout, upstream keepalive
  role: engineer
  scope: implementation
  output-format: code
  related-skills: devops-engineer, sre-engineer, monitoring-expert, terraform-engineer
---

# LB keep-alive — idle timeout alignment

An L7 load balancer or reverse proxy keeps idle connections to the backend and reuses them. If
the backend closes an idle connection first, the proxy can send the next request onto a socket
that is already gone → the request fails (502 from ALB, `upstream prematurely closed` from nginx,
`ECONNRESET` from an HTTP client). It is a timing race: rare, intermittent, after idle periods, on
any endpoint, invisible to health checks (they open fresh connections) and unrelated to app logic.

## The rule (one per hop)

For every hop where one side **pools** connections and the other **serves** them:

```
server idle keep-alive  >  pooling side's idle timeout          (the pooling side closes first)
```

Standard margin: **server = proxy + 5 s**. Node.js also needs `headersTimeout = proxy + 6 s`.
With the AWS ALB default (60 s): server keep-alive **65 s**.

The same rule read from the client side: an app's outbound HTTP pool must drop idle sockets
**before** the server or LB it calls does (`client idle < server idle`).

**Never "fix" it by lowering the load balancer below the server.** It flips the ordering but kills
connection reuse and cuts slow requests (504). Raise the server. Lower the pooling side only when
the server is not yours to configure (a third-party API, a managed service) — then the pooling
side is the one you control.

## Workflow

1. **Map the hops.** Write the request path as a table: browser → CDN → LB → sidecar / reverse
   proxy → app → outbound calls (other services, internal ALBs, third-party APIs). For each hop:
   who pools, who serves. L4 pass-through (AWS NLB, kube-proxy) does not pool — it is not part of
   this race. Load `references/proxies.md` for each pooling side.
2. **Read the real idle timeout per environment** from IaC or the live resource — never assume
   the default. `grep -rniE 'idle_timeout|keepalive|keep_alive|idleTimeout' <infra-repo>`; for AWS,
   `aws elbv2 describe-load-balancer-attributes`. dev, stg and prod may differ.
3. **Find the server's knob and default** in `references/servers.md`. Many runtime defaults are
   below 60 s and lose the race out of the box (Node 5 s, Uvicorn 5 s, Gunicorn 2 s, Apache 5 s).
   For Node, the hard part is reaching the `http.Server` — load `references/node.md`.
4. **Implement through env.**
   - The env var holds the **pooling side's** number exactly as written in IaC
     (`ALB_IDLE_TIMEOUT_SECONDS=60`). Code or the start command derives the server values (+5 s).
     When infra changes, only the env changes.
   - Unset → the provider default (ALB 60). Set but invalid (`''`, `60s`, out of range) → fail at
     startup with a non-zero exit. A silent fallback brings the 502s back unnoticed; a crash fails
     the deploy and rolls it back.
   - Servers configured by CLI or config file (Gunicorn, Uvicorn, Puma, nginx, Apache): derive the
     value in the entrypoint or template, with the same validation.
5. **Log the effective value once at startup**, read back from the server object, not from the
   constant you assigned (e.g. `keepAliveTimeout=65000 headersTimeout=66000`). A hook that did not
   run looks identical to a working fix until the 502s return.
6. **Review graceful shutdown in the same change.** A 65 s keep-alive makes naive shutdowns hang
   until SIGKILL. Load `references/graceful-shutdown.md`.
7. **Verify.** See below.
8. **Document** in the repo's `CLAUDE.md` / README: the hop table, the env var, the rule ("change
   the env when the LB changes; never lower the LB below the server"), the expected startup log line.

## Verify

| Level | How | Pass |
|---|---|---|
| Unit | test the derivation function | unset → default+5; valid → N+5; `''`, `60s`, `0`, over max → throws |
| Container | `node scripts/check-keepalive.mjs http://localhost:<port> --expect=<N+5>` against the image run like production (read-only rootfs, same env) | `ALL PASS`. Node ≥ 22.9 / 20.18: add `--slack=2` |
| Deploy | startup log line in the log group of every task | shows the derived values |
| Production | LB 502 metric / proxy error log over the next days (ALB: `HTTPCode_ELB_502_Count`) | stops appearing after idle periods |

`scripts/check-keepalive.mjs` (in this skill folder) is zero-dependency and language-agnostic: it
speaks raw HTTP/1.1, so it measures any server. Copy it into the project's `scripts/` and keep the
copy unchanged. Against a URL behind the LB it measures the client↔LB hop: use it there to
report, without `--expect`.

## Pitfalls

- **Only the idle close matters.** The `Keep-Alive: timeout=N` response header is optional and
  advisory; most servers do not send it, and an ALB does not forward it. Measure the close.
- **Defaults hide in workers and wrappers.** Gunicorn's `--keep-alive` is ignored by the sync
  worker, which has no persistent connections at all (no race, but no reuse); switching the
  worker class makes the setting matter. Check the layer that actually serves the socket.
- **A sidecar or in-container reverse proxy is its own hop.** ALB → nginx → app means two rules:
  nginx's `keepalive_timeout` > ALB idle, and the app's keep-alive > nginx's upstream
  `keepalive_timeout`, if nginx pools upstream connections at all.
- **Max requests per connection is not a race.** Servers that close after N requests (Tomcat
  `maxKeepAliveRequests`, nginx `keepalive_requests`) send `Connection: close` on the last response,
  so the proxy knows. Only a silent idle close races.
- **HTTP/2 or gRPC to the backend** behaves differently (GOAWAY frames, connection age limits) —
  out of scope here; check the proxy's HTTP/2 upstream settings separately.
- **Upgrading nginx can create the race.** From nginx 1.29.7 / 1.30.x, upstream keep-alive is on by
  default (60 s idle). A backend that was never pooled before — and kept a 5 s default — starts
  racing after an image bump with no config change. See `references/proxies.md`.
- **Defaults move between versions** (Node 27 → 65 s, Puma 7 → 65 s, nginx 1.29.7 → pooling on).
  Set the value explicitly from env even when today's default happens to win.
- **NLB is not this bug**, but it drops connections idle longer than its TCP idle timeout without
  sending FIN/RST. Long-lived sockets through an NLB need TCP keepalive below that value.
- **Proxies in series can disagree per environment.** Record the numbers per environment in the
  hop table; a prod LB with `idle_timeout = 300` needs a different env value than dev.

## Reference guide

| Topic | Reference | Load when |
|---|---|---|
| Load balancers, CDNs, reverse proxies | `references/proxies.md` | step 1–2: idle timeout and defaults of each pooling side |
| Server runtimes | `references/servers.md` | step 3: knob, default and how to set it, per language |
| Node.js in depth | `references/node.md` | any Node server: reaching `http.Server`, proven NestJS and Nitro code |
| Graceful shutdown | `references/graceful-shutdown.md` | step 6: always, after raising keep-alive |
| Behaviour check | `scripts/check-keepalive.mjs` | step 7 |
