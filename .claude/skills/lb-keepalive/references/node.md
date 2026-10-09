# Node.js — reaching the `http.Server` and setting the timeouts

Node's defaults lose the race against almost every pooling proxy: `keepAliveTimeout` is
**5 s**, `headersTimeout` is **60 s**. Set both on the underlying `http.Server`:

```
headersTimeout (N+6 s)  >  keepAliveTimeout (N+5 s)  >  proxy idle timeout (N s)
```

`headersTimeout > keepAliveTimeout` is a legacy Node requirement (older versions could drop a
reused connection while waiting for the next request head); keep it on every version.

The fix is always two assignments. The work is **finding the server object** — each framework
hides it differently:

| Runtime | Where the `http.Server` is | Status |
|---|---|---|
| Plain `node:http` | `http.createServer()` return value | standard API |
| Express | `const server = app.listen(port)` | standard API |
| Koa | `const server = app.listen(port)` | standard API |
| NestJS (Express or Fastify adapter) | `app.getHttpServer()` after `NestFactory.create()`, **before** `app.listen()` | proven in production (Nest 11, Express) |
| Fastify (standalone) | `fastify.server`; `keepAliveTimeout` is also a constructor option | see `servers.md` for its default |
| Hono (`@hono/node-server`) | `serve()` returns the server | standard API |
| Nuxt 3/4 / Nitro `node-server` preset | not exposed — Nitro plugin + diagnostics channel (below) | proven in production (Nitro 2.13, Node 22) |
| Next.js `next start` / standalone | not exposed — see `servers.md` (env/flag support differs by version) | verify per version |

Whatever the path: **read the values back from the server object and log them once at startup**.
A hook that silently did not run looks exactly like a working fix until the 502s return.

## Env and validation (shared by every Node variant)

- The env holds the **proxy's** number exactly as written in IaC (`ALB_IDLE_TIMEOUT_SECONDS=60`),
  the code derives +5 / +6. Infra changes → only the env changes.
- Unset → the provider default (ALB: 60). Set but invalid (`''`, `60s`, `1e2`, out of range)
  → throw at startup → non-zero exit. A silent fallback would bring the 502s back without
  anyone noticing; a crash makes the deploy fail and roll back.
- Parse with a digits-only regex (`/^\d+$/`) — `Number('')` is `0`, `parseInt('60s')` is `60`.

## NestJS (proven)

```ts
// src/config/http-server.config.ts — the only place the arithmetic lives
import type { Server } from 'node:http';

export interface KeepAliveTimeouts { keepAliveTimeout: number; headersTimeout: number }

export function resolveKeepAliveTimeouts(env: NodeJS.ProcessEnv = process.env): KeepAliveTimeouts {
  const idle = readIntegerEnv(env, 'ALB_IDLE_TIMEOUT_SECONDS', { fallback: 60, min: 1, max: 4000 });
  return { keepAliveTimeout: (idle + 5) * 1000, headersTimeout: (idle + 6) * 1000 };
}

export function applyKeepAliveTimeouts(server: Server, t: KeepAliveTimeouts): void {
  server.keepAliveTimeout = t.keepAliveTimeout;
  server.headersTimeout = t.headersTimeout;
}

function readIntegerEnv(env: NodeJS.ProcessEnv, name: string,
  spec: { fallback: number; min: number; max: number }): number {
  const raw = env[name];
  if (raw === undefined) return spec.fallback;
  const value = /^\d+$/.test(raw) ? Number(raw) : NaN;
  if (!(value >= spec.min && value <= spec.max)) {
    throw new Error(`Invalid ${name}="${raw}": expected an integer between ${spec.min} and ${spec.max}`);
  }
  return value;
}
```

```ts
// src/main.ts
async function bootstrap() {
  const timeouts = resolveKeepAliveTimeouts();          // read env first: invalid → throw
  const app = await NestFactory.create(AppModule);
  const server = app.getHttpServer();                    // already built, not yet listening
  applyKeepAliveTimeouts(server, timeouts);
  logger.log(`keepAliveTimeout=${server.keepAliveTimeout} headersTimeout=${server.headersTimeout}`);
  await app.listen(process.env.PORT ?? 3000);
}
bootstrap().catch((err) => { logger.error('Application failed to start', err?.stack); process.exit(1); });
```

Unit-test `resolveKeepAliveTimeouts` (unset → 65000/66000, `"120"` → 125000/126000, `""` /
`"60s"` / `"0"` / `"4001"` → throws). Do **not** add `app.enableShutdownHooks()` without reading
`graceful-shutdown.md` — with a 65 s keep-alive it can hang shutdown.

## Nuxt / Nitro `node-server` preset (proven)

Nitro builds its `http.Server` privately and offers no option for these timeouts. Nitro runs
plugins synchronously **before** it calls `listen()`, so a plugin can subscribe to Node's
`tracing:net.server.listen:asyncStart` diagnostics channel, which fires inside `listen()` before
the port is bound. Requirements and caveats:

- Node **≥ 22.3** (≥ 20.16 on the 20.x line). Pin the Docker base image accordingly.
- Built-in diagnostics channels are still marked experimental → keep the safety net: on the first
  request, if the channel never fired, set the values through `req.socket.server` (undocumented)
  and `console.error('[keepalive] FALLBACK …')` / `[keepalive] NOT APPLIED …` so an error-log alarm
  fires. If Node ever drops the channel, switch to a one-shot patch of
  `http.Server.prototype.listen` inside the same plugin (same ordering guarantee).
- Skip in `import.meta.dev` (no proxy in dev; leave the dev worker alone).
- Env arrives through `runtimeConfig` (`albIdleTimeoutSeconds: 60` → `NUXT_ALB_IDLE_TIMEOUT_SECONDS`),
  destr-parsed: `"60"` → `60`, `"60s"` stays a string → validate the type, throw on anything else.
- Only the very first response advertises `Keep-Alive: timeout=5` (copied at response creation);
  the idle timer already uses 65 s. Harmless.
- Graceful shutdown: Nitro honours `NITRO_SHUTDOWN_TIMEOUT` (ms). Set it to `(stopTimeout − 5) × 1000`.

```ts
// server/plugins/keepalive.ts
import { subscribe, unsubscribe } from 'node:diagnostics_channel'
import { Server as HttpServer } from 'node:http'
import { Server as HttpsServer } from 'node:https'
import type { Socket } from 'node:net'

const LISTEN_CHANNEL = 'tracing:net.server.listen:asyncStart'
type NodeServer = HttpServer | HttpsServer
const isNodeServer = (s: unknown): s is NodeServer => s instanceof HttpServer || s instanceof HttpsServer
const effective = (s: NodeServer) => `keepAliveTimeout=${s.keepAliveTimeout} headersTimeout=${s.headersTimeout}`

export default defineNitroPlugin((nitroApp) => {
  if (import.meta.dev) return
  const idle: unknown = useRuntimeConfig().albIdleTimeoutSeconds
  if (typeof idle !== 'number' || !Number.isInteger(idle) || idle < 1 || idle > 4000) {
    throw new Error(`[keepalive] NUXT_ALB_IDLE_TIMEOUT_SECONDS must be an integer 1–4000, got ${JSON.stringify(idle)}`)
  }
  let applied = false
  const apply = (s: NodeServer) => {
    s.keepAliveTimeout = (idle + 5) * 1000
    s.headersTimeout = (idle + 6) * 1000
    applied = true
  }
  const onListen = (message: unknown) => {
    const { server } = message as { server: unknown }
    if (!isNodeServer(server)) return
    unsubscribe(LISTEN_CHANNEL, onListen)
    apply(server)
    server.once('listening', () => console.log(`[keepalive] ${effective(server)}`))
  }
  subscribe(LISTEN_CHANNEL, onListen)

  let checked = false
  const offRequest = nitroApp.hooks.hook('request', (event) => {
    if (checked) return
    checked = true
    offRequest()
    if (applied) return
    unsubscribe(LISTEN_CHANNEL, onListen)
    const server = (event.node.req.socket as Socket & { server?: unknown }).server
    if (isNodeServer(server)) {
      apply(server)
      console.error(`[keepalive] FALLBACK: ${LISTEN_CHANNEL} never fired, applied via socket.server — ${effective(server)}`)
    } else {
      console.error('[keepalive] NOT APPLIED: http.Server unreachable — Node defaults in effect (502 risk)')
    }
  })
})
```

## Measuring Node (what the check script will show)

- **Idle close ≈ N+6 s, not N+5.** From Node **v22.9.0 / v20.18.0** the idle timer is armed at
  `keepAliveTimeout + 1 s` while the header still says `timeout=N+5` (configurable as
  `keepAliveTimeoutBuffer` from v24.6.0 / v22.19.0; 22.0–22.8 close at exactly `keepAliveTimeout`).
  Expected — run the script with `--expect=<N+5> --slack=2`.
- **Node 27 defaults `keepAliveTimeout` to 65 s.** Keep setting both values explicitly: the default
  only matches an ALB at exactly 60 s and does not move `headersTimeout`.
- **headersTimeout lands anywhere in `[headersTimeout, headersTimeout + 30 s]`** — Node only checks
  every `connectionsCheckingInterval` (30 s). Opt in with `--checks=…,headers-timeout`.
- `x-powered-by` is unrelated but usually turned off in the same change (`app.disable('x-powered-by')`).
