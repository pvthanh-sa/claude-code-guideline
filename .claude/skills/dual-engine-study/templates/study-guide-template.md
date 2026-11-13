<!--
Template: the learner's study guide (dual-engine-study skill). Save as examples/<subject-id>-study-guide.md. Delete this comment.
Rules:
- Workflow, not spec. No time allocation, no theory (that lives in framework.md).
- Every module is a self-contained guide: goal, model, why these steps, what to open, Learn steps with the prompts inline, its own Review.
  The learner never scrolls to another section to know what to do or what to paste.
- Choose each module's steps from the step menu in framework.md §4 and write "Why these steps" in 2–4 sentences.
  Never give every module the same steps.
- The Goal asks only for what the core steps practise; optional steps never carry a goal.
- Each PREDICT failure is grounded in the corpus (grep first); DIAGNOSE only where the docs describe the failure mechanisms;
  INCIDENT starters give a symptom only, never the cause.
- Gemini: one or two core commands per module, chosen for what the docs cannot give (current practice, production scale,
  an abstract model); the rest go under "Optional".
-->

# {{SUBJECT}}: Study Guide

**NotebookLM** answers only from your {{N_SOURCES}} docs: use it to learn *your* system exactly. **Gemini** brings in the rest of the world: production incidents, current practice, design. Setup, command samples and the instructions to paste are in [{{SUBJECT_ID}}-setup.md]({{SUBJECT_ID}}-setup.md).

**How to use it.** Take the modules in order. Open the one you are on and follow it from top to bottom: each step says where to go and what to do, and gives the prompt to paste. Each module has only the steps it needs; *Why these steps* says why. When you finish a module, do its *Review* the day after, about a week later and about a month later; start the next module whenever you like.

## Always

- Before a NotebookLM chat or Studio item, tick only the module's files, in Studio dialogs too, and never **Chats from Gemini**.
- Never use *Search the web for new sources* in this notebook, and never **Convert to source** a note.
- When an answer or a grade surprises you, click its citation number and read the passage.
- Don't click the suggested questions NotebookLM shows under a reply: they make it explain the answer instead of asking you.
- Stay inside the module you are on. The `SCOPE:` line at the top of its Trace prompt keeps NotebookLM there, and the handover card keeps Gemini there. A mechanism marked "a later topic" belongs to its own module: leave it until then.
- Review by testing yourself, never by rereading or re-listening. It should feel hard: struggling to recall is what builds memory.
- At each one-month review, ask Claude Code to fold the checked facts from `For Gemini & docs` into the docs, then run the sync script, do what its to-do list says, and clear the list with `--uploaded`.

## Tips (optional)

- Start an answer with `sure:` or `guess:`. A wrong `sure:` answer is flagged *Confident error*: put it first in `Weak links`, marked `!`.
- Stuck: send `hint` for a smaller question, `reveal` for the answer.
- A hard step: ask in {{LEARNER_LANGUAGE}}; the explanation comes in that language with the terms in English.
- Before a quiz, note the score you expect; a big gap to the real score means you feel surer than you are.
- New module: **⋮** → **Delete chat history** for a clean chat, once the last `DEBRIEF` is saved.

Not used on purpose: Video Overview, Infographic, Mind Map, Reports, Slide Deck, Audio Brief / Critique / Debate, Canvas, Guided Learning. Why: the skill's `framework.md`, §7.

## Modules

**Where the reference diagrams are:** {{a short-name → file table for the docs that hold diagrams}}

<!-- Repeat per module (5–8). Keep only the steps this module needs; renumber. -->

### Module {{N}}: {{MODULE_NAME}}

**Goal:** {{2–3 abilities the core steps practise, e.g. "you can draw X from memory, with what each component reads and writes; you can say what still works when Y is down"}}.

**Model:** {{2–4 sentences: the components and the causal flow}}

**Why these steps:** {{2–4 sentences: what kind of thing this module is (a chain, a path, a comparison, a set of feedback loops, an abstract mapping), which steps that calls for, which usual steps are left out and why, and what Gemini adds that the docs cannot}}

**Before you start:**
- In NotebookLM, tick only {{the module's flat source names}}.
- Open these diagrams from your docs in VS Code's Markdown preview (Ctrl+Shift+V): {{short name + section, …}}. {{If none: "Your docs have no diagram for this module yet. Ask Claude Code to add one; until then, step 3 uses Gemini's `REVIEW`."}}

#### Learn

1. **Sketch** (paper, 2 minutes): {{what to sketch from prior knowledge}}. Wrong is fine.
2. **Listen** (NotebookLM → Studio → Audio Overview: Deep Dive, English, Short): paste this into *What should the AI hosts focus on*, then play it with the diagrams open:
   ```
   {{Follow one concrete event through the system: which component acts at each step, what it reads and writes. Then one change or failure.}}
   ```
3. **Redraw** (paper): close everything and redraw {{what}}. Then open {{the reference diagram}} and mark the differences in red.
   {{Without a reference diagram, use instead: **Draw and review** (paper, then Gemini): from memory, draw {{what}}. Photograph the drawing, start a new chat in your Gem, send the photo with `REVIEW`, and fix the drawing through its questions.}}
4. **Trace** (NotebookLM chat): send this, then answer each question it asks in your own words, one reply per question. The step is done when it sums up the whole chain as numbered steps and lists the links you missed:
   ```
   SCOPE: Module {{N}}, {{module name and sections}}.
   TRACE: {{a concrete starting event from the labs}}. {{what to make me name at each hop}}.
   ```
5. **Predict** (NotebookLM chat): send `PREDICT:` followed by one of these, answer the four questions it asks, read its scoring, then send the next one. Do the three you are least sure of:
   - {{failure 1, grounded in the corpus}}
   - {{failure 2}}
   - {{failure 3}}
   - {{failure 4}}
   - {{failure 5}}
6. {{Only where the docs describe the failure mechanisms:}} **Diagnose** (NotebookLM chat): send `DIAGNOSE {{module topic}}` and investigate from the first symptom.
7. **Save** (NotebookLM): send `DEBRIEF`. Copy its mistakes into `Weak links` and its open questions into `For Gemini & docs`; keep the handover card it prints. Its *Later* list needs nothing now: those topics have their own modules.
8. **{{Gemini step name}}** (Gemini: a new chat in your Gem): write *Model in one sentence* on the handover card in your own words, then send the card and this prompt **in one message**, so Gemini starts with this step and stays in this module:
   ```
   {{CONTEXT / INCIDENT / ANALOGY: the module's first core Gemini prompt}}
   ```
9. **{{Gemini step name}}** (Gemini, same chat): send:
   ```
   {{the second core Gemini prompt, if the module needs one}}
   ```
10. **Save** (Gemini): send `DEBRIEF`. Copy its mistakes into `Weak links`. For each fact it suggests, open the link, find the quoted sentence, and only then copy the fact into `For Gemini & docs`.

**Optional, in the same Gemini chat** ({{the other commands}}):
```
{{DESIGN / INTERVIEW / INCIDENT / ANALOGY prompts this module can use but does not need}}
```

#### Review: the day after, about a week later, about a month later

1. **Redraw** (paper): on a blank page, redraw {{what}}. Compare with {{the reference diagram, or the corrected REVIEW drawing}}; each miss becomes a `Weak links` line.
2. **Quiz** (NotebookLM → Studio → Quiz: Hard, English, this module's files): paste this into the topic box, then click **Explain** on every wrong answer:
   ```
   Module: {{module name and sections}}.
   Every question must be a scenario in a running system: a symptom or a change, and the answer is the cause, the next diagnostic step, or the predicted effect. Wrong options must be plausible misdiagnoses, not obviously wrong answers.
   Never ask what something is, what it stands for, its default value, or which command or flag does something. Never ask me to recall IPs, names or ports.
   ```
3. **Weak links** (NotebookLM → Studio → Flashcards: Standard, Hard, Text Only, English): paste this with all your `Weak links` lines. Then: right → add a ✓; wrong → remove its ✓s; three ✓ → delete the line.
   ```
   Make cards only from these weak links:
   <paste all lines from the Weak links note>
   Front: a situation or "what happens if ...". Back: the causal chain in 2–4 steps (A → B → C), naming the component at each step.
   Never make a definition card ("What is X?", "X is ...").
   ```
4. {{From the second module on:}} **Mix**: one drill across the modules learned so far: NotebookLM `CHAOS: Modules 1–{{N}}` with those modules' files ticked, or Gemini `INCIDENT: any of Modules 1–{{N}}`. Alternate between them.

### Not covered yet

- {{Doc sections without a module yet, and why}}
