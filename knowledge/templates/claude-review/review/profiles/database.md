# Profile: Database schema & migrations (PostgreSQL / Aurora first, MySQL notes)

> Kit-owned. Globs: migration dirs (`**/migrations/**`, `**/migration/**`, `prisma/**`,
> `**/*.sql`, `db/**`), and ORM entity/model files when a migration is or should be in the PR.

## Deploy-order safety (code and schema ship at different moments)
- **Expand / contract.** During a rolling deploy, old code runs against the new schema. Dropping or
  renaming a column/table that the currently deployed code still reads or writes → errors until
  the rollout finishes, and a rollback breaks. Rename = add new + backfill + switch code + drop
  later. Flag a drop/rename in the same PR as the code change that stops using it — 🔴.
- Adding a `NOT NULL` column without a default while old code inserts rows without it → inserts fail.
- Changing an enum: removing a value still stored in rows or still sent by old code.
- Entity/model changed with **no migration** (or the migration does not match the entity — column
  type, nullability, length, index) → drift; with `synchronize: true` this silently alters prod.

## Locking & long-running DDL (PostgreSQL)
- `CREATE INDEX` without `CONCURRENTLY` on a large existing table → blocks writes for the whole
  build. (Note: `CONCURRENTLY` cannot run inside a transaction — TypeORM/Prisma/Knex wrap
  migrations in one by default; check the migration disables it.)
- `ALTER TABLE … ADD COLUMN … DEFAULT <volatile>` (e.g. `now()`, `gen_random_uuid()`), column type
  changes, `SET NOT NULL` on a big table → full rewrite or full scan under `ACCESS EXCLUSIVE`.
  Safer: add nullable → backfill in batches → `ADD CONSTRAINT … CHECK (col IS NOT NULL) NOT VALID`
  → `VALIDATE CONSTRAINT` → `SET NOT NULL`.
- Adding a foreign key without `NOT VALID` + later `VALIDATE` on a large table.
- No `lock_timeout` on DDL against hot tables → the migration queues behind a long query and blocks
  everything behind it.
- MySQL: most `ALTER TABLE` copies the table unless `ALGORITHM=INPLACE/INSTANT` applies.

## Data correctness
- Data backfill/update inside the schema migration over a large table in one transaction → long
  lock, huge WAL, timeouts. Batch it, or run it as a separate job.
- `UPDATE`/`DELETE` in a migration without a `WHERE`, or with a `WHERE` that matches more than
  intended.
- Down migration missing, or one that loses data silently (dropping a column that the up
  migration populated) — flag only if the team uses down migrations.
- Unique constraint added where duplicates may already exist → the migration fails in prod.
- Money/quantity columns as `float`/`double`/`real` — use `numeric(p,s)` or integer minor units.
- Timestamps without time zone where the app mixes time zones (`timestamptz` is the safe default).

## Queries in application code
Applies even when the schema is owned elsewhere (another repo, a DBA, hand-run `*.sql` scripts).
- SQL assembled with string concatenation or a builder escape hatch (`expr`, `raw`, `query`,
  `whereRaw`, `createNativeQuery`, `fmt.Sprintf` into `db.Query`) — injection; see the language
  profile for the exact APIs.
- Multi-statement writes outside a transaction; a transaction opened but not rolled back on every
  error path; a long transaction held across network calls.
- Read-modify-write on counters/sequences/stock without a lock (`SELECT … FOR UPDATE`,
  `WITH (UPDLOCK)` on SQL Server) or an atomic `UPDATE … SET n = n + 1`.
- Queries in loops (N+1); unbounded `SELECT` on growing tables; `SELECT *` feeding a response that
  then leaks columns (password hashes, tokens).
- Hand-run change scripts (`er/*.sql`, `sql/*.sql`): the same deploy-order and locking rules as
  migrations apply — note whether the script is re-runnable.

## Integrity & performance
- Foreign key columns without an index (Postgres does not create one) → slow joins and slow
  parent deletes.
- Uniqueness or invariants enforced only in application code — add a DB constraint.
- Cascading deletes (`ON DELETE CASCADE`) added to tables with business history (orders, stock
  movements) — 🔴 unless clearly intended.
- New query patterns in the code with no supporting index on a large table (say "likely").
