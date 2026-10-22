# Profile: Frontend (React, Next.js, Vue, Nuxt, Angular, Svelte)

> Kit-owned. Globs: the frontend app's `**/*.{ts,tsx,js,jsx,vue,svelte}`.

## Security
- `dangerouslySetInnerHTML`, `v-html`, `[innerHTML]`, `{@html}` with data that is not sanitised
  (DOMPurify or equivalent) — XSS.
- `href`/`src` built from user data without blocking `javascript:` URLs.
- Secrets in client code or in public env prefixes (`NEXT_PUBLIC_`, `VITE_`, `NUXT_PUBLIC_`,
  `REACT_APP_`) — everything there ships to the browser.
- Auth tokens in `localStorage`/`sessionStorage` where the app otherwise uses HttpOnly cookies;
  authorization decided only in the UI (hiding a button is not access control).
- `postMessage` handlers without an origin check; `window.open` without `noopener`.

## Correctness
- Effects with missing/wrong dependencies → stale closures, or infinite render/fetch loops (object
  or function literals in a dependency array).
- Async race: responses arriving out of order (search-as-you-type), setting state after unmount,
  no `AbortController` on fetches that a newer one supersedes.
- List `key` = array index on lists that reorder, insert, or delete → wrong row state.
- Mutating state/props in place (React `push`/`sort` on state; Vue reactivity lost by destructuring
  a reactive object / props).
- Forms: double submit (button not disabled while pending); client validation without server
  validation; number inputs parsed as strings.
- Dates and time zones: rendering server UTC as local without intent; `new Date('YYYY-MM-DD')` is
  UTC midnight → shows the previous day in negative offsets.

## SSR / framework specifics
- Next/Nuxt: browser-only APIs (`window`, `localStorage`) used during server render → crash or
  hydration mismatch; server-only code or secrets imported into a client component.
- Next.js App Router: data that must be per-user cached as static; `fetch` caching defaults hiding
  fresh data; server actions without authorization checks (they are public endpoints).
- Route guards / middleware: a new page or route missing the auth guard its siblings have.

## API integration
- The frontend's assumption about a response field that the backend in this PR changed (or vice
  versa) — grep both sides.
- Errors from the API not handled → blank screen; loading state never cleared on error.

## Performance (flag only with visible impact)
- Fetching inside a loop / per list item; re-fetching on every render.
- Importing a whole heavy library for one function in a client bundle (moment, lodash full).
- Rendering very large lists without virtualisation where the PR introduces the list.
