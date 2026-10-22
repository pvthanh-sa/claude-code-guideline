# Profile: Python (Django, FastAPI, Flask, scripts, Lambda)

> Kit-owned. Globs: `**/*.py`.

## Correctness
- Mutable default arguments (`def f(x=[])`, `x={}`) shared across calls.
- Bare `except:` / `except Exception: pass` hiding real failures; `except` that catches
  `KeyboardInterrupt`/`SystemExit` via bare `except`.
- Naive vs aware `datetime` mixed (`datetime.now()` vs `datetime.now(timezone.utc)`) — comparison
  raises or silently shifts; `utcnow()` returns naive.
- `float` for money/quantities — use `Decimal` with an explicit context/quantize.
- Late binding in closures/lambdas inside loops.
- `is` used for value comparison (`x is 1`, `s is "a"`).
- Integer division / rounding (`round()` is banker's rounding).

## Async
- Blocking calls (`requests`, `time.sleep`, sync DB drivers, heavy CPU) inside `async def` — block
  the event loop for every request.
- Coroutine called without `await` (never runs); `asyncio.gather` without `return_exceptions`
  handling where one failure should not cancel the rest.

## Data access
- Django: N+1 (missing `select_related`/`prefetch_related`); `.save()` read-modify-write races —
  use `F()` expressions or `select_for_update()` inside `transaction.atomic()`; `get()` without
  handling `DoesNotExist`/`MultipleObjectsReturned`.
- SQLAlchemy: session shared across threads/requests; missing commit/rollback on error; lazy
  loading in a loop.
- Raw SQL with f-strings / `%` formatting instead of parameters.

## Security
- `pickle`, `yaml.load` (non-safe loader), `eval`, `exec` on untrusted data.
- `subprocess` with `shell=True` and interpolated input.
- `requests` without `timeout=` (hangs forever); `verify=False`.
- Django: `DEBUG=True` reachable in prod, `ALLOWED_HOSTS=['*']`, `csrf_exempt` on state-changing
  views, `mark_safe`/`|safe` on user data.
- FastAPI: endpoint missing the `Depends(...)` auth dependency its router siblings use; response
  model leaking fields (password hashes).

## Lambda / scripts
- Clients (boto3, DB connections) created inside the handler on every invocation instead of at
  module scope; global mutable state leaking between invocations.
- Handler not idempotent for at-least-once triggers (SQS, EventBridge, S3 events).
- Missing pagination on boto3 list calls (use paginators).
