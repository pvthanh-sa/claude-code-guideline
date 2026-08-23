---
name: clickup
description: 'Read and update ClickUp from any project — task trees, start/due dates, man-day estimates, comments, and rescheduling a plan across working days. Use whenever a task board needs to be read, dated, re-estimated, rescheduled after a slip or change request, or checked for what is due. Talks to the REST API v2 with a personal token; the claude.ai ClickUp MCP connector does not authenticate inside Claude Code.'
disable-model-invocation: true
allowed-tools: Read, Bash
argument-hint: '[what to read or change]'
---

# ClickUp

Board updates through the REST API v2. `scripts/cu.py` wraps the calls; **every write is
a dry run until `--apply`**.

## Setup, once per machine

```bash
printf 'CLICKUP_TOKEN=pk_xxx\n' > ~/.clickup.env && chmod 600 ~/.clickup.env
```

The token comes from ClickUp → avatar → **Settings → ClickUp API → Generate** (the menu
is *ClickUp API*, not *Apps*). It is shown once and acts with the owner's full
permissions across the whole workspace — never put it in a repository.

**Do not spend time on the MCP connector.** Connecting ClickUp at claude.ai authorises
the web client only; a Claude Code session still reports `Needs authentication` and no
ClickUp tool appears. The REST API is the working path.

## Reading the board

A task URL is `app.clickup.com/t/<team_id>/<CUSTOM-ID>` — `3686505/DEV-8463` means team
`3686505`, custom id `DEV-8463`. The custom id is **not** the task id, and any call
using one needs `?custom_task_ids=true&team_id=<team>`; `cu.py get` takes `--team` for
this. Every other subcommand uses the real id, which `get` prints.

```bash
CU=~/.claude/skills/clickup/scripts/cu.py
python3 $CU get DEV-8463 --team 3686505        # find the real id, the list, the parent
python3 $CU tree <list_id>                     # whole list as a tree
python3 $CU tree <list_id> --root <task_id>    # one branch only
```

`tree` paginates for you. Doing it by hand is the classic first bug: `/list/{id}/task`
returns **100 tasks per page** and silently stops there, so a 116-task list looks like
116 minus the tail. Always pass `subtasks=true` and `include_closed=true` or half the
board is invisible.

## Writing

```bash
python3 $CU set <task_id> --start 2026-08-27 --due 2026-08-28 --estimate 1.5   # dry run
python3 $CU set <task_id> --start 2026-08-27 --due 2026-08-28 --apply
python3 $CU set <task_id> --clear-dates --apply
python3 $CU comment <task_id> "why this changed" --apply
```

- **Dates are epoch milliseconds.** Seconds silently means 1970. The script handles it;
  hand-rolled `date +%s` without `%3N` does not.
- All-day dates are written at **04:00 local** with `*_date_time: false`, which is what
  the ClickUp UI itself stores. Midnight local risks displaying as the previous day in
  another timezone. Override with `CLICKUP_TZ_OFFSET` / `CLICKUP_ALLDAY_HOUR`.
- **Estimates are milliseconds too**; `--estimate` takes man-days at 8 h = 1 day.
- Clearing a date is `null`, not `0` or `""`.
- Rate limit is 100 requests/minute on a personal token — the script sleeps between
  bulk writes.

## Rescheduling

`plan` lays an ordered list of tasks across **working days**, skipping weekends and the
holidays given, packing fractional man-days into shared days:

```bash
python3 $CU plan --start 2026-08-27 --holidays 2026-09-01,2026-09-02 \
  --tasks <id>:1.5 <id>:2.5 <id>:1.0 <id>:3.5
python3 $CU plan ... --apply
python3 $CU verify <list_id> --holidays 2026-09-01,2026-09-02
```

Order the `--tasks` in the sequence the work will actually happen, which is not always
id order — a task created late can still belong first.

Pin the date the customer or the lead fixed, then let everything after it cascade;
never hand-shift each row. When a task slips, re-run `plan` from the first unfinished
task and leave completed ones untouched.

## The procedure that avoids damage

1. **Read first.** `tree` the branch you were asked about and show the current state.
2. **Preview.** Run the write as a dry run and show the before/after. A shared board is
   other people's work — get a yes before writing.
3. **Write**, then **read back with `verify`** and by re-running `tree`. A 200 response
   is not evidence; the board is.
4. **Stay inside the branch you were asked about.** Fetching a list returns every task
   in it, including other people's. Filter to the requested subtree before writing, and
   report anything already dated outside it rather than touching it.
5. **Record why.** A schedule change without a comment on the task is unexplainable a
   month later. Post one with `notify_all` off, naming the reason, the tasks moved and
   the new end date.

## Vocabulary that bites

| Thing | Reality |
|---|---|
| `custom_id` (`DEV-8463`) | Not the task id. Needs `custom_task_ids=true&team_id=` |
| `time_estimate` on a parent | Independent of its subtasks — ClickUp does not roll up. They can disagree, and will |
| `status` | Free text per list (`Open`, `in progress`, `backlog`, `completed`), not a fixed enum |
| Dates on subtasks | Optional. Many boards date only the parent rows the lead reads — ask before dating 47 subtasks |
| `include_closed` | Off by default, so completed work vanishes from a plain list call |
