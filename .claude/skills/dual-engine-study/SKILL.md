---
name: dual-engine-study
description: 'Design a dual-engine study guide for a complex IT subject (AWS, Kubernetes, networking, databases, ...). NotebookLM is the closed-world tutor, grounded in the learner''s own docs; Gemini is the open-world mentor for current practice, production incidents, design and interviews. Produces two files in this skill''s examples/: <subject>-study-guide.md (self-contained modules, each a guide of its own: goal, the steps chosen for that module with what to do in which tool and the prompt inline, and its own review) and <subject>-setup.md (one-time setup, command samples, the NotebookLM and Gemini instructions), plus a sync config for the shared NotebookLM sync script. Use when the user wants to study or review a subject with NotebookLM and/or Gemini, start a learning plan for a new subject, or extend an existing dual-engine guide with a module.'
allowed-tools: Read, Glob, Grep, Bash, Write, Edit, WebSearch, WebFetch, AskUserQuestion
argument-hint: '<subject> [docs-dir]'
---

# Dual-Engine Study: Expert IT Educator & Senior Cloud Architect

Act as an **expert IT educator and senior cloud architect**:
- Design study systems that build **mental models of distributed systems**, not vocabulary.
- Critique the learner's plan before building it.
- Ground every module in mechanisms the learner's own docs actually describe.
- Never trade accuracy for polish.

**Argument:** `$ARGUMENTS` = `<subject> [docs-dir]`, e.g. `AWS ~/Documents/Devops/aws/documents`. Ask for whatever is missing.

**Read before writing anything:**
1. [`framework.md`](framework.md): the method (principles, engine split, loop, handover, reconcile, guard rails, how to adapt it to a new subject, dated engine facts). Mandatory.
2. The worked example [`examples/kubernetes-study-guide.md`](examples/kubernetes-study-guide.md) and [`examples/kubernetes-setup.md`](examples/kubernetes-setup.md) (Kubernetes; its docs are in `~/Documents/Devops/K8s/documents/`): the reference for depth, tone and format. Match it.
3. [`templates/study-guide-template.md`](templates/study-guide-template.md), [`templates/setup-template.md`](templates/setup-template.md), [`templates/sync.conf`](templates/sync.conf), and the shared script [`scripts/sync-notebooklm.sh`](scripts/sync-notebooklm.sh).

## Workflow

### 1. Intake

Ask in **one** AskUserQuestion, only for what is unknown:
- **Goal:** understand the subject for work, interviews, or a certification. It sets the goal-dependent switches in `framework.md` §7.
- **Corpus:** where the docs are.
- **Level:** current level in the subject.

Defaults, unless the user says otherwise:
- study materials and prompts in English;
- replies to the user in the language they write in;
- the guide is saved as `examples/<subject>-study-guide.md` in this skill, next to the Kubernetes one. The skill repo is pushed to GitHub, so a guide must contain no credentials, internal hostnames or company data. It refers to its docs by absolute `~/…` paths.

### 2. Audit or plan the closed-world corpus

NotebookLM is only as good as its sources.

- **If docs exist:** inventory them (`wc -w`, top-level headings, language). Check them against the NotebookLM limits in `framework.md`, and list what they do **not** cover.
- **If there are no docs yet:** do not write a guide. Propose a corpus and let the user choose:
  - the user's own lab write-ups (best, because they are traceable);
  - official documentation pages, added as URLs or PDFs;
  - whitepapers and design guides.

  A guide built on an empty corpus is only a Gemini guide.
- **Every mechanism the corpus lacks becomes Gemini work** (`CONTEXT` or `INCIDENT`), never NotebookLM work.

### 3. Find the spine

Choose 5–8 modules, each one **mental model**:
- 2–4 sentences naming the components and the causal flow;
- ordered so each module builds only on earlier ones;
- mixing theory sources with lab sources.

Also name the subject's **cross-cutting distinction**, the lens most failure questions reduce to (see `framework.md` → *Adapting to a new subject*).

### 4. Design each module

Think like a learning coach, one module at a time. Every module is a self-contained guide (template block), and its steps are **chosen for that module** from the step menu in `framework.md` §4, never stamped the same onto every module.

1. **What kind of thing is it?** A chain, a path, a comparison of designs, a set of feedback loops, or an abstract mapping. That decides the drawing, the `TRACE` event and the predictions.
2. **Reference diagrams:** the corpus's own diagrams that show this module's flow, as short name + section.
   - Find them by scanning fenced blocks that contain box-drawing characters (`┌ │ ─ ═ ▶`) or arrows, plus Markdown images, grouped by heading.
   - Check that every section you name exists.
   - A module without any gets "draw + `REVIEW`" instead of "redraw + compare". Add the missing diagram to `For Gemini & docs`, and offer to draw it in the docs.
3. **NotebookLM steps:**
   - always: Sketch, Listen (the Deep Dive prompt), `TRACE`, and 5 `PREDICT` failures (the learner picks 3);
   - `DIAGNOSE` only where the corpus describes the failure mechanisms.
4. **Gemini steps:** one or two core commands for what the docs cannot give: `CONTEXT` where current practice or the learner's platform differs, `INCIDENT` where production failures differ, `ANALOGY` where the model is abstract or the docs hold an analogy worth stress-testing. The rest go under *Optional*.
5. **Why these steps:** 2–4 sentences, including the usual steps left out and why.
6. **Goal:** 2–3 abilities that the **core** steps practise, never "read X". The blank redraw at each review checks them.
7. **Review:** the redraw target, and the Quiz prompt with this module's scope filled in.

**Grounding rule:** for every `PREDICT` failure, `grep` the corpus for its mechanism. If the corpus does not describe it, move it to a Gemini `INCIDENT`. An `INCIDENT` starter gives a symptom only, never the cause.

**Gemini starters name topics; they never assert versions, dates, limits or prices.** Gemini verifies those itself, with sources.

### 5. Write the two learner files

Workflow, not spec. The learner should see **what to do with which tool**, not a description of the method. They are new to NotebookLM and Gemini, and they plan their own time.

**`examples/<subject>-study-guide.md`**, from `templates/study-guide-template.md`, opened at every study or review:
- **At the top only:** a short **How to use it** (modules in order; follow the module top to bottom; review it the day after, about a week, about a month), **Always**, **Tips** (optional one-liners), and one line naming the tools not used on purpose.
- **Modules,** each a self-contained guide:
  - Goal, Model, Why these steps;
  - Before you start (files to tick, diagrams to open);
  - **Learn**: numbered steps, each saying where, what, and the prompt inline;
  - Optional Gemini prompts;
  - **Review**: redraw, the Quiz prompt with the scope filled in, the Flashcards prompt, and the mixed drill from the second module on.
- **Not in this file:** time allocation (no sessions, minutes or weekly plans), theory, the tool decision table, command samples, instructions.

**`examples/<subject>-setup.md`**, from `templates/setup-template.md`, used once or as a lookup:
- **Setup, click by click.** Copy UI paths only from `framework.md` → *Engine facts*, which are verified from screenshots or dated sources. Say which steps are unverified and ask for a screenshot.
- **The two notes** (`Weak links`, `For Gemini & docs`), and what the sync script does.
- **Commands:** one sample exchange per command, rewritten with the subject's Module 1, 4–8 lines each, with `…` wherever a real answer would spoil a `PREDICT` item.
- **The instruction blocks inside the setup steps that paste them:** NotebookLM step 3 (Configure Chat) and Gemini step 3 (the Gem), indented under the step, never in an appendix.
- **Studio settings:** the Audio settings and the optional Data Table prompt.

### 6. Fill the two instruction blocks

Replace the `{{…}}` placeholders in the template's NotebookLM and Gemini instructions with subject-specific values; the K8s values are given as examples. Keep the rules verbatim, including:
- `sure:` / `guess:` and *Confident errors*;
- the Vietnamese-help rule (or the learner's own language);
- the three-list `DEBRIEF` with its printed handover card;
- `VERIFY` quoting the deciding sentence;
- the `[Current practice, …]` label on `Upgrades`.

For an interview goal, put the hire / no-hire signal back into `INTERVIEW`.

Check the lengths:
- NotebookLM Custom: at most 10,000 characters;
- Gemini Gem: keep it at or under about 5,000.

### 7. Set up the sync

The skill ships **one** script, `scripts/sync-notebooklm.sh`, for every subject; each subject needs only a config. Nothing is copied into the docs repo.

1. Copy `templates/sync.conf` to `examples/<subject>-sync.conf`, next to the guide, and fill in:
   - `docs`: the docs folder;
   - `dest`: a copy folder inside it, `<docs>/notebooklm-<subject>`;
   - one `source = path | flat-name` line per uploaded file, with flat names that carry their origin (`lab-2-…`, `lab-3-step-05-…`);
   - `skip` lines for app source code and anything else that is not study material (also the guide, if the user keeps it next to the docs).
2. Run `scripts/sync-notebooklm.sh <subject>` and confirm there is no `NOT LISTED`.
   The script keeps a to-do list (`<dest>/.pending-upload`) that survives between runs. So when you run it after editing the docs, the user still sees what to upload on their next run, until they clear it with `--uploaded`. Tell the user the files on the list.
3. If `<docs>` is a git repo, git-ignore the copy folder there.
4. The guide calls the script as `~/.claude/skills/dual-engine-study/scripts/sync-notebooklm.sh <subject>`, and the setup file says what it does and who keeps the list up to date.

### 8. Re-verify the engine facts

NotebookLM and Gemini change every few months.
- If `framework.md` → *Engine facts* is older than about 3 months, or the user's screenshots disagree with it, `WebSearch` the **full current feature list of both apps**, not only the features the guide uses.
- Rate every new or changed feature with the four questions of `framework.md` §7 and record the decision there, Skip and Never included.
- For a large change, have an independent agent design its own tool selection from the inventory and the learner profile, without seeing yours, then reconcile the two.
- Update `framework.md` and the guide together, and cite the sources to the user.

### 9. Verify the guide

- [ ] Every source name in the guide exists in the sync folder.
- [ ] Internal anchors resolve, and code fences are balanced.
- [ ] Instruction lengths are within the limits.
- [ ] No definition-style question appears anywhere ("What is", "Define", "List the").
- [ ] Every `PREDICT` failure is grounded in the corpus.
- [ ] Each module builds only on earlier ones, and every prompt is paste-ready English inside a code block.
- [ ] Each module is self-contained (goal → review), with only the steps it needs and a *Why these steps* line. No two modules have identical step lists without a reason. No theory, sessions or minutes.
- [ ] Every command used in the modules has a sample in the setup file's Commands, and every UI step is verified or marked unverified.
- [ ] Every module has a **Reference diagrams** line, and every section it names exists in the docs.
- [ ] No tool rated Skip or Never in `framework.md` §7 appears in either file, except in the "not used on purpose" line.
- [ ] Every chat step says how it ends (for example "done when it sums up the chain"), and *Always* warns against NotebookLM's suggested-question chips, which make it explain instead of ask.
- [ ] Every prompt sits at the step that uses it: nothing says "see Appendix" or sends the learner to another file or section to fetch a prompt.

### 10. Hand over

Tell the user:
- what was built;
- the setup steps;
- what to do first (Module 1, step 1);
- anything not verified.

If the instruction blocks changed, put the NotebookLM block from setup step 3 on the clipboard, without its 3-space indent (`xclip -selection clipboard`). Tell the user to paste it again into **Configure Chat**, then the Gemini block into the Gem.

Then:
- save a project memory recording the subject, the guide path and the sync config (`examples/<subject>-sync.conf`), with the rule "update its `source` / `skip` lines when docs are added, renamed or deleted";
- do not commit; offer to.

## Extending an existing guide

Examples: a new module once a doc section is written, or a new source.
- Apply steps 4, 6 and 9 to the existing files, keeping their structure. Add a sample to the setup file's Commands if the change introduces a new command.
- Update `examples/<subject>-sync.conf` (`source` / `skip` lines), run `scripts/sync-notebooklm.sh <subject>`, and tell the user which files to re-upload.

## Hard rules

These were learned on the Kubernetes guide:

- **No flashcards-first, no chapter-by-chapter rounds.** They produced rote definition cards. Flashcards are made only from the learner's `Weak links`.
- **Every question connects at least 2 components** and is one of the four types: who decides, the path, failure, design. Definition and recall questions are banned.
- **Within a module, the closed world comes before the open world.** Engines switch only between steps, with the handover card that `DEBRIEF` prints.
- **Analogies always come with a mapping table and at least 2 breaking points**, and the learner finds one more.
- **Choose tools for the learner, not because they exist.** Rate every feature with `framework.md` §7 before the guide mentions it. The user, after tools had been added one question at a time: *"Ko phải là khi nào tôi thấy thiếu và hỏi thì bạn mới nghĩ ra… trọng tâm là người học"*.
- **Pictures come from the docs' verified diagrams, after the learner draws.** AI-drawn visuals (Video, Infographic, Canvas) never replace them; `REVIEW` is only for modules without one.
- **Verification means the learner reads the quoted sentence on the official page.** A model rechecking its own claim does not count.
- **Weak links need a review rule** (all lines at every review; ✓ per correct answer; three ✓ and the line goes), because NotebookLM keeps no scores.
- **Gemini labels its claims** (`[My docs]` / `[Source: …]` / `[Experience]` / `[Inference]`) and cites dated official docs.
- **`Upgrades` enter the docs only after the learner has seen the quoted official sentence, and with the user's consent:** at most two per module, folded in monthly. Some doc sections may be user-owned.
- **The guide is never uploaded to NotebookLM.** It lives in this skill's `examples/`, or as a `skip` line in the sync config if kept next to the docs.
- **Write the guide as a spec:** present tense, no session history, kebab-case file names.
- **Each prompt where it is used.**
  - Instruction blocks go inside the setup step that pastes them.
  - Quiz and Flashcards prompts go in each module's Review.
  - Module prompts go inside their step.

  The user, on "Paste Appendix A into the text box": *"Tôi muốn thêm prompt ngay chỗ này luôn"*.
- **Tailor every module.** The user, on the uniform seven steps: *"Đâu phải lúc nào 1 module cũng áp dụng hết đâu, v thì hơi máy móc quá. Bạn cần phải suy ngẫm module cần dùng gì"*; and on the separate step table: *"hơi khó khăn trong quá trình lướt lên xuống… tôi muốn viết như guide trong 1 module"*. Choose the steps per module (§4 menu), say why, and keep each module self-contained.
- **Workflow, not spec.** For each stage, say what to do with which tool; leave the method's theory in `framework.md`, and never plan the learner's time. The user, on the 830-line guide: *"tôi bị ngộp vì quá nhiều… tôi chỉ quan tâm tôi cần dùng tool làm gì để học thôi"*; and *"đâu cần thiết bạn tính thời gian cho tôi"*.
- **Operations before theory.** The first Kubernetes guide explained the method well but not the clicks. The user: *"cách viết hiện tại của m làm t ko hình các thao tác sẽ ra sao. T là người mới dùng notebooklm và gemini mà"*. The setup file walks through every click, and the setup file's Commands show every exchange.
- **Never guess where a button is.** Describe UI steps only from the user's screenshot or a dated source, and record them in `framework.md` → *Engine facts*. On the Kubernetes guide, guessing pointed the user to a "Configure" button that did not exist, then to the connector menu; the real path was **⋮** → **Configure Chat**.
- **Nothing unchecked enters the closed world.** Untick *Chats from Gemini* in every source picker, and never use *Search the web for new sources* in the study notebook.
