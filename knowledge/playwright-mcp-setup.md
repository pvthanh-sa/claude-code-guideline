# Playwright MCP — disk-efficient setup (for Claude Code / AI agent)

> Purpose: anything (AI or human) that reads this can set up Playwright MCP **correctly and without
> wasting disk**.
> Machine context: Linux, **Microsoft Edge** already installed (`/usr/bin/microsoft-edge`) and Node ≥ 18.
> Use case: let the agent open a web page itself (e.g. a staging Angular SPA), read console/network,
> take snapshots — "self-check".

## TL;DR — one command, once, for EVERY repo

```bash
claude mcp add -s user playwright -- npx @playwright/mcp@latest --browser msedge --ignore-https-errors
```

- `-s user` = **user** scope → configure **once**, applies to all projects (NO per-repo re-setup).
- `--browser msedge` = use the **system-installed Microsoft Edge** → **downloads no browser** (0 MB).
- `--ignore-https-errors` = skip cert errors (handy for staging/self-signed).

After adding: **restart the Claude Code session** to load the server (new config doesn't apply to the
already-running server of the current session).

## Why this uses no extra disk (storage model)

| Component | Location | Per-repo? | Note |
|---|---|---|---|
| Browser | `~/.cache/ms-playwright/` **or** system Edge | ❌ Machine-wide | With `--browser msedge` → uses system Edge, **downloads nothing** |
| `@playwright/mcp` package | `~/.npm/_npx/<hash>/` (~19M) | ❌ Machine-wide | npx cache, downloaded once, reused forever |
| MCP config | `~/.claude.json` (user scope) | ❌ Once for all | A few hundred bytes |
| Runtime profile/output | `~/.cache/ms-playwright-mcp/` | ❌ Shared | Created at runtime; deletable, regenerated automatically |

**Common misconception:** "each repo must reinstall the browser." WRONG — the browser lives in the
shared per-user cache, not duplicated per repo. And `--browser msedge` downloads no browser at all.

## PITFALL — don't do this (wastes ~650 MB for nothing)

```bash
npx playwright install chromium   # ❌ NOT needed when using --browser msedge
```
This pulls ~650 MB into `~/.cache/ms-playwright/` (`chromium-*` ~382M + `chromium_headless_shell-*` ~264M
+ `ffmpeg-*` ~5M) plus an npx `playwright` entry (~19M) — **all of it is waste** if you use system Edge.
Only install chromium if you **deliberately** want a bundled browser (e.g. a machine with no Edge/Chrome).

## Verify the setup

```bash
claude mcp get playwright            # expect: Scope=User, Status=✔ Connected, Args include --browser msedge
which microsoft-edge                 # confirm system Edge exists (msedge needs this)
du -sh ~/.cache/ms-playwright/       # expect: very small (NO chromium-* directory)
```

## Clean up if you accidentally over-installed (reclaim disk)

```bash
# Chromium browser pulled by mistake (~650M) — safe to remove if you use msedge:
rm -rf ~/.cache/ms-playwright/chromium-* ~/.cache/ms-playwright/chromium_headless_shell-* ~/.cache/ms-playwright/ffmpeg-*
# Redundant standalone npx 'playwright' entry (~19M) — @playwright/mcp already bundles playwright-core:
#   find it: for d in ~/.npm/_npx/*/; do grep -l '"playwright"' "$d/package.json" 2>/dev/null; done
# Leftover browser profile (e.g. tried chrome then switched to msedge) — regenerated on next run:
rm -rf ~/.cache/ms-playwright-mcp/mcp-chrome-*
```
Do NOT delete the npx `@playwright/mcp` entry (that's the server — keep it).

## How to "self-check" a web page

- Page with **HTTP basic auth**: embed the credentials in the URL when navigating —
  `https://USER:PASS@host/...` (don't write credentials into a committed file; pull them from
  `.env`/a secret).
- Common tools: `browser_navigate` (open URL) → `browser_console_messages` (read console errors,
  filter `level: error`) → `browser_network_requests` (inspect 404/failed requests) → `browser_snapshot`
  (accessibility tree — better than a screenshot for the agent to read) → `browser_take_screenshot` (image).
- Sites with a normal/Let's Encrypt cert: `--ignore-https-errors` is already on, so certs aren't a blocker.

## Why `msedge` (not the default `chrome`)

`@playwright/mcp` defaults to `--browser chrome` → looks for Google Chrome at `/opt/google/chrome/chrome`.
If the machine has no Chrome, it errors and asks for `npx playwright install chrome` — which on Linux
**needs sudo** (installs system deps) → friction. This machine has **Edge** preinstalled, so
`--browser msedge` runs immediately, 0 downloads, 0 sudo. (The `EDOA/crm-edoa-client` repo also uses
exactly this approach in its own `.mcp.json`.)

## Scope: user vs project (.mcp.json)

- **User scope** (`-s user`, file `~/.claude.json`): once, every repo uses it. **Recommended** for a
  personal tool like Playwright. Not committed, private.
- **Project scope** (`.mcp.json` at the repo root): committed with the repo, shared with the team;
  project scope **overrides** user scope for that repo. Use it when the whole team should share a
  server (e.g. this repo's AWS MCP servers live there).
- If a repo already has its own `.mcp.json` (e.g. EDOA), it still works fine — no conflict with user scope.
