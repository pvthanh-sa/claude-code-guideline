<!--
Template: the learner's study guide (dual-engine-study skill). Workflow, not spec: the first screen is only the
Learn table, the Review table, Always and Tips. No time allocation, no theory (that lives in framework.md).
Replace every {{PLACEHOLDER}}; repeat the module block per module (5–8). Each PREDICT failure must be grounded in the
corpus (grep first); INCIDENT starters give a symptom only. Save as examples/<subject-id>-study-guide.md. Delete this comment.
-->

# {{SUBJECT}}: Study Guide

**NotebookLM** answers only from your {{N_SOURCES}} docs: use it to learn *your* system exactly. **Gemini** brings in the rest of the world: production incidents, current practice, design. One-time setup, command samples and the instructions to paste are in [{{SUBJECT_ID}}-setup.md]({{SUBJECT_ID}}-setup.md).

## Learn a module

Go through the steps in order, in as many sittings as you like. Each module's prompts are under [Modules](#modules), grouped by these steps.

| # | Step | Where | What you do | Why it works |
| --- | --- | --- | --- | --- |
| 1 | **Guess** | Paper | Sketch how you think the module's system works, for 2 minutes. Wrong is fine | Guessing first makes your brain search for the answer |
| 2 | **Listen** | NotebookLM → Audio Overview | Generate the module's audio (Deep Dive, Short) and listen with its **Diagrams** open | Hearing and seeing together beats either alone |
| 3 | **Rebuild** | Paper | Close everything and redraw from memory. Then open the diagrams and mark the differences in red | Recalling, then checking at once, is what sticks |
| 4 | **Explain** | NotebookLM chat | Send the module's `TRACE` prompt and answer one question at a time | Explaining each step builds the causal chain |
| 5 | **Break** | NotebookLM chat | Send three `PREDICT` failures, then the `DIAGNOSE` line. Finish with `DEBRIEF` | Predicting, then checking, exposes wrong models |
| 6 | **Connect** | Gemini (your Gem, notebook attached) | Paste the handover card that `DEBRIEF` printed, then send the module's `INCIDENT`, `CONTEXT` and `DESIGN` prompts. Finish with `DEBRIEF` | Comparing your lab with the real world makes it transferable |
| 7 | **Save** | NotebookLM notes | From each `DEBRIEF`, copy the mistakes into `Weak links`, and the open questions and checked facts into `For Gemini & docs` | Your mistakes become the questions of your next review |

## Review

Review each module **the day after** you learn it (sleep in between helps memory set), **about a week later**, and **about a month later**. Review by testing yourself, never by rereading or re-listening: rereading feels productive but builds little memory.

| Step | Where | What you do |
| --- | --- | --- |
| **Redraw** | Paper | On a blank page, redraw the module's model. Open the diagrams and mark what you missed; each miss becomes a `Weak links` line |
| **Quiz** | NotebookLM → Quiz | Difficulty Hard, the module's files, the Quiz prompt. Click **Explain** on every wrong answer |
| **Weak links** | NotebookLM → Flashcards | Cards from all `Weak links` lines. Then: right → add a ✓; wrong → remove its ✓s; three ✓ (right in three different reviews) → delete the line |
| **Mix** (from two modules on) | NotebookLM `CHAOS` with all files ticked, or Gemini `INCIDENT` with no topic | One mixed drill per review, alternating between the two |

At the one-month review, also ask Claude Code to fold the checked facts from `For Gemini & docs` into the docs, then run the sync script and re-upload the files it reports as `CHANGED`.

## Always

- Before a NotebookLM chat or Studio item, tick only the module's files, in Studio dialogs too, and never **Chats from Gemini**.
- Never use *Search the web for new sources* in this notebook, and never **Convert to source** a note.
- When an answer or a grade surprises you, click its citation number and read the passage.
- It should feel hard. Struggling to recall is what builds memory; when it feels easy and smooth, you are probably only re-reading.

## Tips (optional)

- Start an answer with `sure:` or `guess:`. A wrong `sure:` answer is flagged *Confident error*: put it first in `Weak links`, marked `!`.
- Stuck: send `hint` for a smaller question, `reveal` for the answer.
- A hard step: ask in Vietnamese; the explanation comes in Vietnamese with the terms in English.
- Model still abstract after step 3: send the module's `ANALOGY` prompt in Gemini.
- Interview practice: send the module's `INTERVIEW` prompt in Gemini.
- Before a quiz, note the score you expect; a big gap to the real score means you feel surer than you are.
- New module: **⋮** → **Delete chat history** for a clean chat, once the last `DEBRIEF` is saved.
- {{A module without a reference diagram}}: at step 3, photograph your drawing and send `REVIEW` in Gemini instead of comparing.

Not used on purpose: Video Overview, Infographic, Mind Map, Reports, Slide Deck, Audio Brief / Critique / Debate, Canvas, Guided Learning. Why: the skill's `framework.md`, §7.

## Modules

**Where the reference diagrams are:** {{a short-name → file table for the docs that hold diagrams}}

<!-- Repeat this block per module (5–8). Each PREDICT failure must be grounded in the corpus: grep for its mechanism first. INCIDENT starters give a symptom only, never the cause. -->

### Module {{N}}: {{MODULE_NAME}}

**Model:** {{2–4 sentences: the components and the causal flow}}

- **Tick:** `{{flat-source-1.md}}` ({{sections}}), `{{flat-source-2.md}}`
- **Diagrams:** {{diagrams in the docs that show this module's flow (short name + section); if none: "none in the docs yet", use Gemini REVIEW at step 3, and add the missing diagram to For Gemini & docs}}

**Step 2 · Listen** (Audio Overview, focus box):
```
{{Follow one concrete event through the system: which component acts at each step, what it reads and writes. Then one change or failure.}}
```

**Step 4 · Explain** (NotebookLM chat):
```
TRACE: {{a concrete starting event from the labs}}. {{what to make me name at each hop}}.
```

**Step 5 · Break** (NotebookLM chat): send `PREDICT:` with three of these, one per message, then `DIAGNOSE {{module topic}}`.
- {{failure 1, grounded in the corpus}}
- {{failure 2}}
- {{failure 3}}
- {{failure 4}}
- {{failure 5}}

**Step 6 · Connect** (Gemini), one after another:
```
INCIDENT: {{a production-scale symptom only, never the cause}}.
```
```
CONTEXT: {{topics where current practice differs from the docs; name topics, do not assert versions}}.
```
```
DESIGN: {{a realistic brief with numbers}}.
```
Optional:
```
ANALOGY: {{the module's core mechanism}}.
```
```
INTERVIEW: {{2–3 trade-offs from this module}}.
```

**Done when** (your redraw at each review shows it):
- {{an ability, e.g. "you can draw X from memory, with what each component reads and writes"}};
- {{an ability about failures}};
- {{an ability about current practice}}.

### Not covered yet

- {{Doc sections without a module yet, and why}}
