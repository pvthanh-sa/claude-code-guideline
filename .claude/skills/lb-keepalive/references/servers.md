# Serving side — server runtimes

What the backend does with an idle keep-alive connection, and how to raise it above the pooling
side (`proxy idle + 5 s`). Defaults change between versions — the "Version" column is what was
checked (Oct 2026); confirm for the version you run, then measure with `scripts/check-keepalive.mjs`.

"Race at ALB 60 s?" = does the **default** lose against the AWS ALB default.

| Runtime | Setting | Default | Race at ALB 60 s? | Version checked | How to set (ALB 60 → 65) |
|---|---|---|---|---|---|
| **Node.js** `http.Server` | `keepAliveTimeout` + `headersTimeout` | 5 s / min(requestTimeout, 60 s) | **yes** | ≤ 26 (65 s from Node 27, see below) | `server.keepAliveTimeout = 65000; server.headersTimeout = 66000` — see `node.md` |
| Next.js | `next start --keepAliveTimeout <ms>`; standalone `KEEP_ALIVE_TIMEOUT` env | unset → Node's 5 s | **yes** | flag ≥ 12.2, env ≥ 13.3 | `KEEP_ALIVE_TIMEOUT=65000`. Sets only `keepAliveTimeout` (not `headersTimeout`); `0` is ignored |
| Fastify | `keepAliveTimeout` option | 72 s | no (> 60) — but < 72 if the LB is raised | v5 / 6.0 docs | `Fastify({ keepAliveTimeout: 65000, http: { headersTimeout: 66000 } })` or `fastify.server.headersTimeout` |
| **Gunicorn** | `--keep-alive` / `keepalive` | 2 s | **yes** (async / gthread workers) | 26.x | `--keep-alive 65`. The **sync** worker ignores it (no persistent connections: no race, no reuse) |
| Gunicorn + UvicornWorker | inherits Gunicorn `keepalive` → uvicorn `timeout_keep_alive` | **2 s** (not uvicorn's 5 s) | **yes** | `uvicorn-worker` pkg (`uvicorn.workers` deprecated) | `--keep-alive 65` on the Gunicorn command |
| **Uvicorn** | `--timeout-keep-alive` | 5 s | **yes** | 0.54 | `--timeout-keep-alive 65` |
| Hypercorn | `keep_alive_timeout` | 5 s | **yes** | 0.18 | config `keep_alive_timeout = 65` (check the CLI flag name for your version) |
| **Go** `net/http` | `Server.IdleTimeout` | 0 → falls back to `ReadTimeout`; both 0 → no idle timeout | only if `ReadTimeout` < 60 s and `IdleTimeout` unset | go1.27 | `IdleTimeout: 65 * time.Second` explicitly (and `ReadHeaderTimeout` separately). Never rely on the `ReadTimeout` fallback |
| **Spring Boot / Tomcat** | `server.tomcat.keep-alive-timeout` (falls back to `connection-timeout`) | 60 s (Tomcat's embedded default; the 20 s in the standalone `server.xml` does not apply) | **tie → yes** | Boot 3.5 / 4.1 | `server.tomcat.keep-alive-timeout=65s` |
| Spring Boot / Jetty | `server.jetty.connection-idle-timeout` | 30 s | **yes** | Jetty 12 | `server.jetty.connection-idle-timeout=65s` |
| Spring Boot / Undertow | `server.undertow.no-request-timeout` | none (-1) | no | Boot 3.x — Boot 4 drops Undertow | leave, or set ≥ 65 s explicitly |
| **ASP.NET Core Kestrel** | `KestrelServerLimits.KeepAliveTimeout` | 130 s | no | .NET main | leave; set explicitly if the LB goes above ~125 s. `RequestHeadersTimeout` 30 s is unrelated |
| **Ruby Puma** | `persistent_timeout` / `PUMA_PERSISTENT_TIMEOUT` | **65 s** (was 20 s before Puma 7.0) | Puma ≥ 7: no (exactly ALB+5); **Puma < 7: yes** | 8.0 | `persistent_timeout 65` explicitly — pins it across upgrades |
| **Apache httpd** | `KeepAliveTimeout` | 5 s | **yes** | 2.4 | `KeepAlive On` + `KeepAliveTimeout 65` |
| **nginx** (serving) | `keepalive_timeout` | 75 s | no (> 60) | current | set explicitly when the LB goes above ~70 s |
| PHP-FPM | — (FastCGI) | — | — | — | the nginx / Apache in front owns HTTP keep-alive |

## Notes per runtime

- **Node 27 changes the default** `keepAliveTimeout` to 65 s (nodejs/node PR #62782, semver-major,
  merged 2026-04-26). Still set it explicitly: the default only matches an ALB at exactly 60 s, and
  `headersTimeout` still needs to be above it.
- **Node's +1 s buffer** (socket idle timer = `keepAliveTimeout + 1000`) exists from **v22.9.0 /
  v20.18.0**; 22.0–22.8 close at exactly `keepAliveTimeout`. Configurable as `keepAliveTimeoutBuffer`
  from v24.6.0 / v22.19.0. That's why the check script needs `--slack=2` for Node.
- **Gunicorn sync worker**: a request/response then close. Switching to `gthread`, `gevent`,
  `eventlet` or a Uvicorn worker turns keep-alive on with the 2 s default → set `--keep-alive` in
  the same change.
- **Go**: `ReadTimeout` covers the whole request read and doubles as the idle fallback — a service
  with `ReadTimeout: 10s` and no `IdleTimeout` closes idle connections at 10 s.
- **Puma / Fastify / Kestrel / nginx** defaults beat ALB 60 s today. Still set the value from the
  env: when the LB idle timeout is raised (e.g. 120 s for slow endpoints), they lose.

## Templates for CLI/config-driven servers

Derive in the entrypoint, with the same fail-fast validation as code:

```sh
#!/bin/sh
# entrypoint.sh — ALB_IDLE_TIMEOUT_SECONDS holds the ALB idle_timeout exactly as in Terraform.
set -eu
N="${ALB_IDLE_TIMEOUT_SECONDS:-60}"
case "$N" in ''|*[!0-9]*) echo "Invalid ALB_IDLE_TIMEOUT_SECONDS=\"$N\": expected an integer 1-4000" >&2; exit 1;; esac
[ "$N" -ge 1 ] && [ "$N" -le 4000 ] || { echo "Invalid ALB_IDLE_TIMEOUT_SECONDS=$N: out of range 1-4000" >&2; exit 1; }
KEEPALIVE=$((N + 5))
echo "keep-alive=${KEEPALIVE}s (ALB idle_timeout=${N}s)"
exec gunicorn app:app --worker-class uvicorn_worker.UvicornWorker --keep-alive "$KEEPALIVE" --bind 0.0.0.0:8000
```

`exec` keeps the server as PID 1 so it receives SIGTERM (see `graceful-shutdown.md`). The same
shape works for `uvicorn --timeout-keep-alive`, `puma` (`persistent_timeout` read from env in
`config/puma.rb`) and `envsubst`-templated nginx / Apache configs.
