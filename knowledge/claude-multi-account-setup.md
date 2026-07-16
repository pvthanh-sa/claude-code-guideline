# Claude Code — Multi-Account on One Machine (self-contained runbook)

Goal: run several Claude Code accounts on one machine, **share ALL data** (memory,
history, sessions, `--resume`) between them, and **switch accounts without re-login**.

> **For an AI/Claude reading this to set up a new machine:** follow the "Setup" section
> in order. Read "Verified facts & gotchas" FIRST — it holds the key design decisions;
> getting them wrong breaks the setup.

Placeholders used throughout: `acc1` = your primary/default account, `acc2` = the second
account. Rename freely (the bundle filenames and aliases must match).

---

## Core idea

- Use a **single config directory** `~/.claude` (never set `CLAUDE_CONFIG_DIR`). Because
  every account shares this directory, memory/history/sessions are **shared automatically**.
- A Claude Code session is tied to the **project directory, NOT the account** → one account
  can `--resume` another account's sessions in the same directory.
- "Switching account" only swaps the **OAuth token** (`~/.claude/.credentials.json`) and the
  **identity label** (`.oauthAccount` in `~/.claude.json`). The token is stored locally, so
  there is **no re-login**.

## Verified facts & gotchas (READ BEFORE DOING ANYTHING)

1. **The identity file is `~/.claude.json` at HOME ROOT** (not `~/.claude/.claude.json`).
   Verified: running claude only changes the home-root file's mtime. → jq-patch
   `.oauthAccount` into `~/.claude.json`.
2. **The default account must NOT set `CLAUDE_CONFIG_DIR`.** Setting it to `$HOME/.claude`
   makes Claude read `~/.claude/.claude.json` (a different file) → it thinks you're logged
   out → prompts re-login. Always launch with `env -u CLAUDE_CONFIG_DIR claude`. (Never set
   `CLAUDE_CONFIG_DIR=$HOME/.claude`; it creates a junk `~/.claude/.claude.json`.)
3. **Put the function/aliases in `~/.bash_aliases`**, NOT `~/.bashrc`. On Linux Mint the GUI
   terminal is a **login shell** → reads `~/.bash_profile`; the VS Code terminal is
   **non-login** → reads `~/.bashrc`. Both files already `. ~/.bash_aliases`, so putting it
   there works in every terminal.
4. **Sessions are directory-scoped, not account-scoped** (Claude Code docs + tested: acc2
   resumed acc1's session by id). So switching **never loses or duplicates** data. Tested
   across 5 switch rounds: every session/memory/history file stayed byte-identical.
5. **One account at a time.** They share one credentials file, so don't run two accounts in
   two terminals at once — switching in terminal B changes the token under the session
   running in terminal A.
6. **The OAuth callback may be blocked** by a VPN / Cloudflare WARP / Warp terminal / SSH →
   use the paste-code flow (Claude prints a URL; open it in the browser signed into the right
   account; paste the returned auth code back into the CLI).
7. **After editing `~/.bash_aliases`, open a NEW terminal** (functions/aliases only load in a
   fresh shell).
8. **Policy:** swapping another person's OAuth token is credential sharing — only reasonable
   when both accounts are in the **same Team** and you accept the risk. Anthropic's sanctioned
   model is each person running their own `/login`. This is a user decision.

## Requirements
- `bash`, `jq` (`sudo apt install jq`).

## Setup (in order)

```bash
# --- 1) Account #1 = your default account, log in normally ---
claude            # /login account #1, then exit

# --- 2) Save account #1's bundle ---
mkdir -p ~/.claude/.accounts && chmod 700 ~/.claude/.accounts
cp ~/.claude.json ~/.claude.json.bak-multiacct                       # back up the identity file
cp ~/.claude/.credentials.json ~/.claude/.accounts/acc1.credentials.json
jq '.oauthAccount' ~/.claude.json > ~/.claude/.accounts/acc1.oauthAccount.json

# --- 3) Log in account #2 into a TEMP dir to capture its bundle (leaves account #1 untouched) ---
mkdir -p ~/.claude-tmp
CLAUDE_CONFIG_DIR=$HOME/.claude-tmp claude     # /login account #2 (paste auth-code if WARP blocks callback), then exit
cp ~/.claude-tmp/.credentials.json ~/.claude/.accounts/acc2.credentials.json
jq '.oauthAccount' ~/.claude-tmp/.claude.json > ~/.claude/.accounts/acc2.oauthAccount.json
chmod 600 ~/.claude/.accounts/*.credentials.json
rm -rf ~/.claude-tmp

# --- 4) Install the switch function + aliases into ~/.bash_aliases (block below) ---
# --- 5) Make sure ~/.bash_aliases is sourced (Mint does this by default; if not, add to
#         BOTH ~/.bashrc AND ~/.bash_profile):  if [ -f ~/.bash_aliases ]; then . ~/.bash_aliases; fi
# --- 6) OPEN A NEW TERMINAL ---
```

### Block to paste into `~/.bash_aliases`

Rename `acc1`/`acc2` as you like — they must match the bundle filenames from steps 2/3.

```bash
# ===== Claude Code multi-account (single shared dir, swap login, auto-save) =====
# bundles: ~/.claude/.accounts/<name>.{credentials,oauthAccount}.json
__claude_current() {   # bundle name matching the currently active identity (by email)
  local email f
  email=$(jq -r '.oauthAccount.emailAddress // empty' "$HOME/.claude.json" 2>/dev/null)
  [ -n "$email" ] || return 0
  for f in "$HOME/.claude/.accounts/"*.oauthAccount.json; do
    [ -e "$f" ] || continue
    [ "$(jq -r '.emailAddress // empty' "$f" 2>/dev/null)" = "$email" ] && { basename "$f" .oauthAccount.json; return 0; }
  done
}
__claude_save() {      # persist the current live token + identity into one account's bundle
  local acc="$1" base="$HOME/.claude/.accounts"; [ -n "$acc" ] || return 0
  # GUARD: never overwrite a bundle with an empty/broken token. Without this, an
  # auto-save that fires while the live credentials are a blank mid-login/logout
  # state wipes a good bundle's tokens (accessToken/refreshToken become "") and
  # that account can no longer refresh -> forced re-login.
  local at rt
  at=$(jq -r '(.claudeAiOauth.accessToken // .accessToken // "")' "$HOME/.claude/.credentials.json" 2>/dev/null)
  rt=$(jq -r '(.claudeAiOauth.refreshToken // .refreshToken // "")' "$HOME/.claude/.credentials.json" 2>/dev/null)
  if [ -z "$at" ] || [ -z "$rt" ]; then
    echo "claude: refusing to save empty/broken credentials for '$acc'" >&2; return 0
  fi
  cp -f "$HOME/.claude/.credentials.json" "$base/$acc.credentials.json" 2>/dev/null
  jq '.oauthAccount' "$HOME/.claude.json" > "$base/$acc.oauthAccount.json" 2>/dev/null
  chmod 600 "$base/$acc.credentials.json" 2>/dev/null
}
__claude_switch() {
  local acc="$1" base="$HOME/.claude/.accounts"
  local cred="$base/$acc.credentials.json" oauth="$base/$acc.oauthAccount.json"
  if [ ! -f "$cred" ] || [ ! -f "$oauth" ]; then echo "claude: unknown account '$acc'" >&2; return 1; fi
  local cur; cur="$(__claude_current)"                       # 1) auto-save the outgoing account
  [ -n "$cur" ] && [ "$cur" != "$acc" ] && __claude_save "$cur"
  cp -f "$cred" "$HOME/.claude/.credentials.json" || return 1  # 2) load the target account
  local tmp; tmp="$(mktemp)"
  if jq --slurpfile o "$oauth" '.oauthAccount = $o[0]' "$HOME/.claude.json" > "$tmp"; then
    mv -f "$tmp" "$HOME/.claude.json"
  else rm -f "$tmp"; echo "claude: patch identity failed" >&2; return 1; fi
}
alias claude-acc1='__claude_switch acc1 && env -u CLAUDE_CONFIG_DIR claude'
alias claude-acc2='__claude_switch acc2 && env -u CLAUDE_CONFIG_DIR claude'
# ================================================================================
```

**Auto-save:** every switch first saves the outgoing account's current token (including a
just-refreshed token or a fresh `/login`) back to its bundle before loading the target, so
bundles stay current with **no manual upkeep**.

## Usage

```bash
claude-acc1                      # switch to acc1, then run
claude-acc2                      # switch to acc2, then run
claude                           # run the most recently switched account
claude-acc2 --resume "<name>"    # resume any session (even one acc1 created), directory-scoped
claude-acc2 --resume             # open the picker
```
Who am I: `jq -r '.oauthAccount.emailAddress' ~/.claude.json`

## Verify after setup

```bash
source ~/.bash_aliases
# 1) each account is logged in (no /login prompt):
__claude_switch acc1; env -u CLAUDE_CONFIG_DIR claude config ls 2>&1 | grep -qi 'not logged' && echo FAIL || echo "acc1 OK"
__claude_switch acc2; env -u CLAUDE_CONFIG_DIR claude config ls 2>&1 | grep -qi 'not logged' && echo FAIL || echo "acc2 OK"
# 2) identity switches correctly:
__claude_switch acc1; jq -r '.oauthAccount.emailAddress' ~/.claude.json
__claude_switch acc2; jq -r '.oauthAccount.emailAddress' ~/.claude.json
# (end on the account you want to use)
```

## Troubleshooting

- **`claude-accX` prompts for login:** that bundle's token expired. Run `claude-accX` →
  `/login` once. The next switch auto-saves the new token into its bundle.
- **A bundle's tokens are empty (`accessToken`/`refreshToken` length 0, `expiresAt` 0):** it
  was corrupted by an auto-save that ran while the live credentials were blank. There's no
  recovery — that account must `/login` again. The `__claude_save` guard above now prevents
  this from recurring. Check bundle health:
  `jq '(.claudeAiOauth//.)|{a:(.accessToken|length),r:(.refreshToken|length),exp:.expiresAt}' ~/.claude/.accounts/<name>.credentials.json`
- **OAuth callback hangs (WARP/VPN/SSH):** during login, copy the URL Claude prints, authorize
  in a browser (Incognito signed into the right account), paste the auth code into the CLI.
- **Aliases missing in a new terminal:** confirm `~/.bash_aliases` is sourced from
  `~/.bashrc`/`~/.bash_profile`; open a brand-new terminal.
- **Resume by name says "No sessions match":** you can't resume a session that is currently
  open; close it and retry, or run `--resume` with no name to browse the picker.

## Rollback

```bash
# remove the __claude_* functions + claude-* aliases from ~/.bash_aliases
rm -rf ~/.claude/.accounts          # (optional) delete the stored tokens
# original identity is backed up at ~/.claude.json.bak-multiacct
```
Data under `~/.claude` is not deleted.
