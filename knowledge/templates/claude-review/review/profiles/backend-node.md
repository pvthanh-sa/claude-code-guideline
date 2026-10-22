# Profile: Backend — Node.js / TypeScript (NestJS, Express, Fastify, Koa)

> Kit-owned. Globs: `**/*.ts`, `**/*.js`, `**/*.mts`, `**/*.cjs` outside the frontend app.

## Async & error handling
- Floating promise: an async call without `await`/`return`/`.catch` — errors become unhandled
  rejections and the work may not finish before the response or the process exits.
- `array.forEach(async …)` — nothing awaits it; use `for…of` or `Promise.all`.
- `Promise.all` over an unbounded list (DB rows, files, external calls) — no concurrency limit.
- `try/catch` that swallows (`catch {}` / log-and-continue) where the caller needs to know; a
  `catch` that rethrows a new error and loses the cause.
- In NestJS: throwing plain `Error` where an `HttpException` is expected changes the status to 500;
  an exception filter that hides the real error.
- Event handlers / queue consumers / cron jobs with no try/catch — one bad message kills the loop
  or poisons the queue.

## Data integrity & concurrency (highest-value checks)
- **Read-modify-write on shared counters or balances** (stock quantity, inventory, credit, seat
  count, sequence numbers): read the row, compute in JS, write it back = **lost update** under two
  concurrent requests. Needs an atomic update (`SET qty = qty - :n WHERE qty >= :n`), a row lock
  (`SELECT … FOR UPDATE` / `pessimistic_write`), or optimistic locking (`@VersionColumn`).
- Multi-step writes not wrapped in one transaction (TypeORM `DataSource.transaction` /
  `QueryRunner`, Prisma `$transaction`, Sequelize `transaction`) — a failure halfway leaves partial
  state. Inside a transaction, every query must use the transaction's manager/client — a call
  through the default repository runs **outside** it.
- Check-then-insert uniqueness in code without a DB unique constraint — duplicates under races.
- Idempotency: handlers triggered by webhooks, queues, or client retries that are not safe to run
  twice (double charge, double stock movement). Look for an idempotency key or a unique constraint.
- Money and quantities as JS `number` with fractional values — use integer minor units or a decimal
  library; `toFixed` returns a string and rounds unexpectedly.

## Database access
- N+1 queries: a query inside a loop over rows; lazy relations resolved per item.
- Unbounded queries: `find()` / `findMany()` with no `take`/`limit` on a table that grows; missing
  pagination on a list endpoint.
- Filters on columns with no index, on a large table (say "likely slow", don't claim without schema).
- TypeORM `synchronize: true` or Prisma `db push` reachable in a non-local environment — 🔴.
- `save()` on a partially loaded entity overwriting columns with stale values.

## API contract & validation
- DTO without validation decorators, or a global `ValidationPipe` without `whitelist: true` /
  `forbidNonWhitelisted` where mass assignment matters; `transform: true` missing where types are
  relied on (query params arrive as strings).
- Response shape, status code, field name, enum value, or nullability changed — grep the consumers
  (frontend, other services, mobile) in this repo.
- Pagination / sort fields taken from the query and passed to the ORM unchecked (`order: { [userField]: … }`).

## Types & null safety
- Non-null assertion `!`, `as` casts, or `any` that hide a value which really can be
  `undefined`/`null` (e.g. `findOne` result used without a check).
- `==` vs `===` with mixed types; `parseInt` without radix; `Number('')` is `0`;
  `new Date(string)` parsing in local time zone; comparing dates as strings.
- `switch` over an enum with no `default` / exhaustiveness check after a new enum member is added.

## Runtime & operations
- Config read at import time (`process.env.X` at module top) that tests or DI can't override; a
  missing env var falling back silently to an unsafe default.
- Timeouts: outbound HTTP calls (axios/fetch/got) with no timeout; DB pool without a statement or
  acquire timeout.
- Behind a load balancer: `server.keepAliveTimeout` must exceed the LB idle timeout (ALB default
  60s) and `headersTimeout` must exceed `keepAliveTimeout` — otherwise intermittent 502s.
- Memory: caches / maps that grow without bound; reading a whole large file or result set into
  memory where a stream fits.
- Logging: secrets or PII in logs; log level `debug` left on in hot paths.
