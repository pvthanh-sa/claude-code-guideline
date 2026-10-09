# Pooling side — load balancers, CDNs, reverse proxies

The number to beat at each hop. Defaults change between versions: confirm against the docs of the
version you run, and always read the **configured** value from IaC or the live resource.
Checked against vendor docs / source in Oct 2026.

| Proxy | Setting (pooled backend connections) | Default | Range / notes |
|---|---|---|---|
| **AWS ALB** | `idle_timeout.timeout_seconds` (Terraform `aws_lb.idle_timeout`) | **60 s** | 1–4000 s. One value for both client and target connections. AWS's own guidance: set the app's keep-alive above it |
| AWS ALB | `client_keep_alive.seconds` | 3600 s | 60–604800 s. Client side only (max connection age); does **not** affect target reuse |
| **AWS NLB** | `tcp.idle_timeout.seconds` (listener) | 350 s | 60–6000 s; TLS listeners fixed at 350 s. L4 pass-through — **not part of this race** (see below) |
| **AWS CloudFront** (custom origin) | `OriginKeepaliveTimeout` | **5 s** | 1–300 s (higher via quota). An origin served directly by Node (default 5 s) is a tie → race. `OriginReadTimeout` default 30 s (1–120) is unrelated |
| **GCP** global / classic external Application LB | backend keep-alive | **600 s, fixed** | Google: backend keep-alive must be **> 600 s** (their nginx example: `keepalive_timeout 620s`). Regional (Envoy-based) ALB: also 600 s fixed |
| **Azure Front Door** | origin idle timeout | **90 s, fixed** | Not configurable → backend keep-alive > 90 s |
| **Azure Application Gateway v2** | backend connection idle | not documented | It reuses backend connections but documents no backend idle timeout. Set the backend high (e.g. ≥ 125 s, above the documented client-side 120 s) and verify with the error logs |
| **nginx** (reverse proxy) | `keepalive_timeout` inside `upstream {}` | 60 s | Only matters if nginx pools upstream connections — see the version note below. `keepalive_requests` 1000, `keepalive_time` 1 h |
| **HAProxy** | none — no per-connection idle timer on server-side connections | — | Idle backend connections are trimmed by `pool-purge-delay` (default 5 s: half of the idle ones are closed each interval), `pool-max-conn` and fd ratios. `timeout http-keep-alive` is front-side only; `timeout server` applies only while waiting for data. With the defaults HAProxy drops idle backend connections within seconds — a backend with keep-alive ≥ ~10 s is safe; a backend shorter than the purge cycle can still race. `http-reuse` default `safe` |
| **Envoy** | `HttpProtocolOptions.idle_timeout` (cluster, via `typed_extension_protocol_options` → `envoy.extensions.upstreams.http.v3.HttpProtocolOptions`) | **1 h** | Much longer than any app default → **set it down** (e.g. 55 s) or raise the app above it. `0` disables it (leaks). The cluster field `common_http_protocol_options` is deprecated |
| **Traefik** | `serversTransport.forwardingTimeouts.idleConnTimeout` | **90 s** | v3. Entrypoint `respondingTimeouts.idleTimeout` (client side) 180 s |
| **Istio / service mesh sidecars** | Envoy underneath (`DestinationRule` `connectionPool.http.idleTimeout`) | Envoy's 1 h unless set | Same rule; the sidecar is a hop |

## nginx — does it pool upstream connections?

- **Before nginx 1.29.7:** only if you configure it — `keepalive N;` in the `upstream` block **plus**
  `proxy_http_version 1.1;` and `proxy_set_header Connection "";`. Without those, every proxied
  request opens a new connection: no reuse, no race.
- **nginx 1.29.7+ (released 2026-03-24) and the 1.30.x stable line:** upstream keep-alive is **on by
  default** (`keepalive 32 local`), `proxy_http_version` defaults to 1.1 and `Connection` is no longer
  sent. **Upgrading nginx turns pooling on**, with a 60 s idle timeout — a backend with a 5 s
  keep-alive (Node ≤ 26 default, Uvicorn, Gunicorn, Apache) enters the race after the upgrade
  without any config change. Check the nginx version in every image when auditing.
- nginx as the **serving** side (the app container behind an ALB): `keepalive_timeout` default 75 s
  (> ALB 60 s, safe at the default ALB value; re-check if the ALB is raised). `keepalive_requests` 1000.
- PHP-FPM sits behind nginx over FastCGI; nginx owns the HTTP keep-alive. `fastcgi_keep_conn` is off
  by default, so FastCGI connections are not pooled.

## L4 load balancers (NLB, kube-proxy, GCP passthrough NLB)

They forward packets per flow and do not reuse a connection for another client, so the keep-alive
502 race does not exist there. The client in front of them is the one pooling — apply the rule to
that client. Separate NLB trap: a flow idle longer than its TCP idle timeout (350 s) is dropped
**without** FIN/RST; long-lived sockets need TCP keepalive probes below that.

## Outbound HTTP clients (the app as the pooling side)

When the app calls another service through a pool, the app is the pooling side and the **client's**
idle timeout must be **shorter** than the server/LB it calls.

| Client | Idle setting | Default | Notes |
|---|---|---|---|
| Node `fetch` / undici | `keepAliveTimeout`, `keepAliveTimeoutThreshold`, `keepAliveMaxTimeout` | 4 s / 2 s / 600 s | Follows the server's `Keep-Alive: timeout=` hint minus the 2 s threshold — but the hint is lost behind an ALB, so the 4 s default applies. Safe against ALB 60 s |
| Node `http.Agent({ keepAlive: true })` | `timeout` + server hint | `globalAgent` keep-alive on with 5 s (Node ≥ 19) | From v19 the agent follows the server hint (minus 1 s, `agentKeepAliveTimeoutBuffer`, configurable since v24.7 / v22.20). A custom agent with a large `timeout` against a 60 s ALB races |
| Go `http.Transport` | `IdleConnTimeout` | 90 s | **Longer than an ALB's 60 s** → set it below the target's idle (e.g. 50 s) when calling through an ALB |
| Python `requests` / urllib3 | no idle timeout | — | Reuses whatever is pooled; relies on retry of idempotent requests on a stale socket. Configure `Retry` and keep calls idempotent |
| Java (Apache HttpClient 5, OkHttp) | `evictIdleConnections` / `ConnectionPool(keepAlive…)` | OkHttp 5 min | Set eviction below the server/LB idle |
