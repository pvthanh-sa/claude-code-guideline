# Profile: Application code — other languages (Go, Java/Kotlin, C#/.NET, Ruby, Rust)

> Kit-owned. Use when the repo's language has no dedicated profile. Combine with
> `protocol.md` §3 — the questions there are language-independent.

## Go
- Error returned and ignored (`_ =`, unchecked `err`); error wrapped without `%w`.
- Goroutine leaks: goroutines blocked forever on a channel nobody reads; no `ctx` cancellation.
- Data races: maps or slices shared across goroutines without a mutex; loop variable captured by a
  goroutine (pre-Go 1.22 semantics if `go.mod` says `go < 1.22`).
- `defer` inside a loop (resources held until the function returns); `defer rows.Close()` missing.
- `http.Client{}` with no `Timeout`; response body not closed.
- Nil map write; nil pointer from an unchecked type assertion (`v := x.(T)` without `, ok`).

## Java / Kotlin (Spring)
- `@Transactional` on a private method or a self-invoked method — the proxy is bypassed, no
  transaction; checked exceptions not rolling back by default.
- Lazy-loading outside a session (`LazyInitializationException`); N+1 via relations in loops.
- Lost updates without `@Version` or `SELECT … FOR UPDATE` on shared counters.
- `equals`/`hashCode` inconsistent on entities used in sets/maps.
- Resources not in try-with-resources; thread pools never shut down.
- Kotlin: `!!` on platform types from Java APIs.

## C# / .NET
- `async void` (except event handlers); `.Result`/`.Wait()` deadlocks; missing `ConfigureAwait`
  in libraries; `HttpClient` created per request (socket exhaustion).
- `IDisposable` not disposed; EF Core tracking queries in read-only paths; N+1 via lazy loading.

## Ruby
- Mass assignment (`permit!`); raw SQL interpolation in `where("… #{x}")`; `Marshal.load` /
  `YAML.load` on user data; N+1 (`includes` missing).

(PHP has its own profile: `php.md`.)

## All languages
- Resource lifetime (files, connections, locks) on every exit path, including errors.
- Shared mutable state across requests/threads.
- Time zones, decimal precision, integer overflow at boundaries.
- Retries without backoff or without idempotency; timeouts on every network call.
