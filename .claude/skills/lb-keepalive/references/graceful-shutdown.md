# Graceful shutdown with long keep-alive

Raising the server's keep-alive to N+5 s has a side effect: idle connections now live for a minute
or more. A naive "close the server and wait for every connection" shutdown waits on them, overruns
the orchestrator's stop timeout and gets SIGKILLed, which cuts in-flight requests. Review shutdown in the
same change as keep-alive.

## The stop sequence (ECS behind an ALB; Kubernetes is analogous)

1. The target is deregistered: the LB stops routing **new** requests to it and drains for
   `deregistration_delay` (ALB default 300 s; Kubernetes: endpoint removal + `preStop`).
2. The container gets **SIGTERM**.
3. After `stopTimeout` (ECS, default 30 s, Fargate max 120 s) / `terminationGracePeriodSeconds`
   (Kubernetes, default 30 s), it gets **SIGKILL**.

The app owns step 2 → 3. It must finish inside the stop timeout, leaving a margin.

## What the app does on SIGTERM

```
stop accepting new connections
→ close idle keep-alive connections now
→ let in-flight requests finish; close each connection as soon as it goes idle
   (an in-flight request gets a keep-alive response and would otherwise idle for N+5 s)
→ at (stopTimeout − 5 s): force-close whatever is left
→ close resources (DB pools, Redis, queues) — after HTTP, never before
→ exit 0 (exit 1 on error)
```

Pass the infra number through env (`STOP_TIMEOUT_SECONDS` = the task definition `stopTimeout`)
and derive the drain (`N − 5`) in code, with the same validation as the keep-alive env.

## Container-level traps (any language)

- **PID 1 ignores default signal actions.** The kernel does not apply the default (terminate)
  action to PID 1, so an app that relies on "SIGTERM kills me" never stops and waits for SIGKILL.
  Either handle SIGTERM and `exit` explicitly, or run an init (`tini`, ECS `initProcessEnabled`,
  `docker run --init`).
- **Exec-form `CMD`/`ENTRYPOINT`** (`["node","dist/main"]`). Shell form (`CMD node dist/main`)
  makes `/bin/sh` PID 1, and it does not forward SIGTERM to the app.
- **No package-manager wrapper** (`npm start`, `yarn start`, `pnpm start`, `poetry run`) as the
  container command: it adds a process that may not forward signals. Run the runtime directly.
- Test it: `docker run …` then `docker stop -t 30 <id>` and check the logs show the drain and the
  exit code is 0 within the timeout (exit 137 = it was SIGKILLed).

## Per runtime

| Runtime | Built-in graceful shutdown | Notes |
|---|---|---|
| Node `http.Server` | `server.close()` + `closeIdleConnections()` / `closeAllConnections()` (Node ≥ 18.2) | `close()` only drops connections idle *right now*; sweep `closeIdleConnections()` every ~250 ms until done, `closeAllConnections()` at the deadline. See the NestJS sketch below |
| NestJS | Avoid `app.enableShutdownHooks()` alone and `forceCloseConnections` | the hook runs `onModuleDestroy` before closing HTTP and can wait on keep-alive sockets past the stop timeout; `forceCloseConnections` cuts in-flight requests. Drain HTTP yourself, then `app.close()` |
| Nitro / Nuxt | `NITRO_SHUTDOWN_TIMEOUT` (ms) | set to `(stopTimeout − 5) × 1000` |
| Go `net/http` | `srv.Shutdown(ctx)` with a deadline context | closes idle connections, waits for active ones until the context expires |
| Spring Boot | `server.shutdown=graceful`, `spring.lifecycle.timeout-per-shutdown-phase` | check whether graceful is the default in your Boot version |
| ASP.NET Core | `HostOptions.ShutdownTimeout` | check the default for your .NET version |
| Gunicorn | `--graceful-timeout` | workers finish in-flight requests within it |
| Uvicorn | `--timeout-graceful-shutdown` | unset = waits without a bound — set it below the stop timeout |

Values marked "check" differ across major versions; confirm in the docs of the version you run
rather than trusting a table.

## NestJS drain (proven)

```ts
// src/common/http/graceful-shutdown.ts
export async function drainHttpServer(server: Server, drainMs: number): Promise<boolean> {
  if (!server.listening) return false;
  let forced = false;
  const closed = new Promise<void>((resolve) => server.close(() => resolve()));
  const sweep = setInterval(() => server.closeIdleConnections(), 250);
  const deadline = setTimeout(() => { forced = true; server.closeAllConnections(); }, drainMs);
  try { await closed; } finally { clearInterval(sweep); clearTimeout(deadline); }
  return forced;
}

export function enableGracefulShutdown(app: INestApplication<Server>, drainMs: number): void {
  let shuttingDown = false;
  const shutdown = async (signal: NodeJS.Signals) => {
    if (shuttingDown) return;
    shuttingDown = true;
    try {
      if (await drainHttpServer(app.getHttpServer(), drainMs)) logger.warn('force-closed leftovers');
      await app.close();          // every Nest lifecycle hook: DB/Redis teardown goes there
      process.exit(0);            // PID 1: do not re-raise the signal, exit explicitly
    } catch (err) { logger.error('Shutdown failed', err); process.exit(1); }
  };
  for (const s of ['SIGTERM', 'SIGINT'] as const) process.once(s, (r) => void shutdown(r));
}
```
