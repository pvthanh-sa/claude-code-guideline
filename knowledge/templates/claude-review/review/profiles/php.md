# Profile: PHP (FuelPHP, Laravel, Symfony, CodeIgniter, plain PHP)

> Kit-owned. Globs: `**/*.php`, server-rendered views (`**/views/**`, `*.blade.php`, `*.twig`,
> `*.phtml`). Skip `vendor/**` and `fuel/core/**`, `fuel/packages/**` (framework code).

## SQL built from strings
- Query-builder escape hatches with concatenated input: FuelPHP `DB::expr('… '.$x)`,
  `DB::query("… $x")`; Laravel `DB::raw`, `whereRaw`, `orderByRaw`, `selectRaw`; CodeIgniter
  `$this->db->query("… $x")`; PDO/`mysqli_query` with interpolation — 🔴. Bound parameters or the
  builder's own `where()` are the fix.
- Column/direction for `order_by` / `orderBy` taken from input without an allow-list.
- `IN (…)` built with `implode()` over input.
- Validation that "looks numeric" is not a sanitiser: `$id > 0` is **true** for `"5) OR 1=1 -- "`
  in PHP 7 (leading-numeric string). Cast (`(int)`), `ctype_digit`, or `filter_var(…,
  FILTER_VALIDATE_INT)` before use.

## Output escaping (XSS) in server-rendered views
- Echoing request data or DB content without escaping: `<?php echo $x ?>` / `<?= $x ?>` where the
  framework does not auto-escape; Blade `{!! !!}`; Twig `|raw`; FuelPHP `View::set(…, false)` /
  `set_global(…, false)` (the `false` turns auto-encoding **off**).
- `html_entity_decode` / `htmlspecialchars_decode` on user content before output.
- Values placed inside `<script>`, attributes, or URLs need context-specific encoding
  (`json_encode` with `JSON_HEX_TAG|JSON_HEX_QUOT`, `rawurlencode`), not just `htmlspecialchars`.

## Request handling
- State-changing actions (create, update, delete, login, password, upload) without a CSRF token
  check — FuelPHP `csrf_autoload => false` means every form needs `Security::check_token()`;
  Laravel routes outside the `web` middleware; any state change over **GET**.
- Authorization enforced only in the view (hiding a button) — the controller action must check the
  role/level itself, including for POST/AJAX endpoints.
- Object-level checks: `Model::find($id)` from input, then update/delete without verifying the row
  belongs to the current user/tenant.
- Debug or "temporary" actions left reachable (`action_delete`, test endpoints, `var_dump(); exit;`).
  Framework default routing (FuelPHP, CodeIgniter) exposes every public `action_*` method.

## Dangerous functions
- `unserialize` on input (use `json_decode`); `extract($_POST)`; `eval`, `assert` with strings,
  `preg_replace` with `/e`; `include`/`require` with a variable path; `shell_exec`, `exec`,
  `system`, `passthru`, backticks with input (use `escapeshellarg` at minimum).
- File upload: trusting `$_FILES['type']` or the extension; storing under the web root; keeping the
  client file name; no size limit.

## Language traps
- Loose comparison `==` between strings and numbers, `in_array` / `array_search` without `true`
  (strict), `switch` (loose) — type juggling; magic hashes (`"0e…" == "0e…"`) when comparing hashes
  with `==` — use `hash_equals`.
- `empty("0")` is true; `isset` on null is false; `strpos(...) == false` misses position 0 (`!==`).
- Passwords: `md5`/`sha1`/plain storage — use `password_hash` / `password_verify`.
- Sessions/JWT: signing keys hard-coded in code or config committed to git; `session_regenerate_id`
  missing after login.
- Errors: `display_errors` on in production config; exceptions echoing SQL or paths.

## Framework specifics
- Laravel: `$guarded = []` / `$fillable` including `role`/`is_admin`; `Model::create($request->all())`.
- FuelPHP: `Input::post()` / `Input::get()` used without `Validation`; `Config` files under
  `fuel/app/config/<env>/` committed with credentials.
- Composer: `composer.lock` not committed for an application (non-reproducible builds); `"*"`
  version constraints.
