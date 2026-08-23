---
name: resume-cutoff
description: 'Pick up work after a session was cut off mid-task — usage limit reached, context exhausted, crash, or a closed terminal. Re-establishes what was actually finished from artifacts rather than from the conversation summary, checks whether any non-idempotent side effect already fired, reports, and only then continues the unfinished part. Use at the start of any session that resumes interrupted work.'
disable-model-invocation: true
allowed-tools: Read, Glob, Grep, Bash
argument-hint: '[what was being worked on, if known]'
---

# Resume after a cutoff

The work stopped somewhere unknown. The danger is not forgetting — it is **believing**.
A summary of the earlier conversation is available and it reads as fact, but it was
written from intent, not from outcome: a step described as done may have been cut
between the decision and the write. Half-finished work that is assumed finished is the
failure mode this skill exists to prevent, and the second one is repeating a side
effect that already fired.

**Do not resume the task yet.** Establish the state, report it, and wait.

## 1. Ground truth, from artifacts only

Prefer what the machine can be made to prove over what any text says.

```bash
git status --short && git log --oneline -10 && git diff --stat
git stash list && git branch -vv          # work parked, branch ahead/behind
```

Then, whichever apply to this project:

- **Untracked files are the strongest signal of a cutoff** — something was created and
  never committed, often mid-write. Open them; a truncated file is obvious.
- **Run the check, do not read about it.** Build, lint, tests, the step's own
  *done-when*, a verification script. A step is finished when its check passes now, not
  when a note says it passed.
- **Checklists and boards**: a `TODO.md`, a task list, the ticket status. Note that these
  record what someone *marked*, so they rank below a check that runs.
- **Database or infrastructure**: a migration may be applied while its file is
  uncommitted, or committed while never applied. Query the actual state.

If the previous session's exact actions matter, the transcript is on disk and is
lossless where the summary is not:

```bash
ls -t ~/.claude/projects/*/*.jsonl | head -3          # newest sessions
```

Grep it for the last tool calls to see precisely what ran and what it returned.

## 2. Did a side effect already fire?

Everything that leaves the machine is non-idempotent, and repeating it does visible
damage. Before redoing any step, check whether its effect is already out there:

| Action | Check before repeating |
|---|---|
| Commit, push, PR, merge | `git log origin/<branch>`, `gh pr list` |
| Comment, ticket update, board change | Read the item back through its API |
| Message sent — Slack, mail | Read the channel or thread |
| Any API write, payment, provisioning | Read the resource back |
| Migration, seed, destructive script | Query the database |

A duplicate comment or a second PR is worse than an unfinished task, because the
unfinished task is still visible while the duplicate has to be found and cleaned up.

## 3. Classify and report — then stop

Report every item in the interrupted work as exactly one of:

- **Done and verified** — the check was run in *this* session and passed. Nothing to do.
- **Partially applied** — say precisely what exists and what is missing. This is where
  the real work is.
- **Not started.**
- **Unknown** — could not be determined. Say so rather than guessing; an unknown that is
  announced costs a question, an unknown that is assumed costs a defect.

Include what was found in step 2. Then **wait for a decision** before continuing.

## 4. Resume

Only the unfinished part. Do not re-run a completed step "to be safe" — re-running is
not free where it writes files, applies migrations, or calls anything external. Do not
rewrite a file that already has the right content.

If a partially applied change turns out to be inconsistent, say so and propose either
finishing it forward or reverting cleanly — do not silently patch over it.

## Anti-patterns

- Trusting the summary's "✅ done" without running the check.
- Starting the task over from the beginning because that feels safer.
- Re-posting, re-pushing or re-sending because it is unclear whether it went through.
- Reporting "resumed and continued" without saying what state things were found in.
