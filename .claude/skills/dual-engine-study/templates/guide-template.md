<!--
Template for a dual-engine study guide (dual-engine-study skill).
Replace every {{PLACEHOLDER}}; the values for each slot are worked out in framework.md §8.
Keep the generic sections' wording unless the subject needs a change. Repeat the module block once per module.
Reference for depth and tone: examples/kubernetes-study-guide.md. Delete this comment.
-->

# {{SUBJECT}}: Dual-Engine Study Guide

How to master {{SUBJECT}} as a system with two AI engines that do different jobs:

| Engine | World | Truth comes from | It answers |
| --- | --- | --- | --- |
| **NotebookLM**: the closed-world tutor | Only these docs | The {{N_SOURCES}} uploaded files, with citations | *How does **my** system work, and why did it behave that way?* |
| **Gemini**: the open-world mentor | These docs **and** the world | The same notebook attached, plus web sources it cites | *How does **the world** do this, what is it like, and what changes at scale?* |

**Routing rule:**
- If the answer should be in your docs, ask **NotebookLM**.
- If it needs anything outside them (an alternative design, production scale, a newer version, another domain), ask **Gemini**.

Your docs stay the single source of truth. Gemini's verified findings flow back into them, and then NotebookLM can test you on them too.

## Why two engines

**What makes the split strong:**

1. **Accuracy and transfer are different jobs.**
   - A closed world builds an exact model of one system.
   - Knowledge of a single case stays "inert" and does not carry over to new problems. Comparing two cases builds the general idea far better than studying either one alone (analogical encoding: Gentner, Loewenstein & Thompson, 2003).
   - NotebookLM gives you the first case; Gemini supplies the second.
2. **The docs age.** {{WHY_DOCS_AGE}}. Only an open-world engine can say what changed.
3. **Disagreement is useful.** When the engines disagree, resolving it forces you to reason from mechanisms.

**What needs guarding, and the rule this guide uses for each:**

| Risk | Rule |
| --- | --- |
| NotebookLM *reduces* hallucination but does not remove it. It can misread a passage, and it reads ASCII diagrams as plain text | Click the citation behind anything surprising |
| Gemini can be confidently wrong, especially about versions, deprecations and limits | It must label every claim (`[My docs]`, `[Source: …]`, `[Experience]`, `[Inference]`) and cite official docs with dates. `VERIFY` checks a claim before you keep it |
| Analogies mislead beginners when only the similarities are shown | Every analogy comes with a mapping table and its breaking points, and you must find one more break yourself |
| Switching engines mid-thought costs attention | Switch only **between phases**, carrying a [handover card](#handover-between-engines) |
| An open-world engine tempts you into passive reading | Gemini also asks before it tells. `CONTEXT` is the only explaining mode, and it ends with a question |

## The method

### Four kinds of question

Both engines use the same four question types. Each one connects at least two components:

| Question | What you must explain | Example |
| --- | --- | --- |
| **Who decides?** | Which component acts, what state it reads or writes, what triggers it | {{EXAMPLE_WHO_DECIDES}} |
| **What is the path?** | Every hop, and what changes at each one ({{WHAT_CHANGES}}) | {{EXAMPLE_PATH}} |
| **What if it fails?** | What breaks, what keeps working, the blast radius, how you would prove it | {{EXAMPLE_FAILURE}} |
| **Why this design?** | The alternative, and what the choice costs | {{EXAMPLE_DESIGN}} |

One distinction runs through all of them: **{{CROSS_CUTTING_DISTINCTION}}.** Most good failure questions come down to it.

### The loop for each module

Each module first builds an exact model of your own system in the closed world, then varies and stresses it in the open world:

| Phase | Engine | Mode or tool | What you do | Done when |
| --- | --- | --- | --- | --- |
| **1. Model** | NotebookLM | Audio Overview (Deep Dive) | Listen to the module story, then **draw the model on paper from memory** | You have a drawing |
| | Gemini | `REVIEW`, then `ANALOGY` | Upload a photo of the drawing and fix it through questions; then stress-test the model with an analogy and its breaks | You can redraw it correctly without help |
| **2. Trace** | NotebookLM | `TRACE` | Narrate an event hop by hop; the AI only asks "what next, and who does it?" | You trace start to finish without hints |
| **3. Break** | NotebookLM | `PREDICT`, then `DIAGNOSE` | Predict the effects of named failures, then investigate a hidden one, at lab scale | 3 predictions and 2 diagnoses, including the blast radius |
| | Gemini | `INCIDENT` | The same mechanisms at production scale | You find the root cause and link it back to your docs |
| **4. Extend** | Gemini | `CONTEXT`, `DESIGN`, `INTERVIEW` | Learn what current practice does differently, design a system under changing requirements, defend it | You can argue for your lab's design and for the current alternative |
| **5. Retain and reconcile** | Both | `DEBRIEF`; Quiz and Flashcards in NotebookLM | Save weak links; verify Gemini's new facts and fold them into the docs | (repeats weekly) |

**A sensible pace** is one module per week:
- **Day 1:** Model and Trace, about 60 minutes.
- **Day 2:** Break in NotebookLM, then `INCIDENT` in Gemini, about 45 minutes.
- **Day 4:** `CONTEXT`, `DESIGN`, `INTERVIEW`, about 45 minutes.
- **Day 5:** reconcile, plus a Quiz on your weak links, about 20 minutes.
- **End of the week:** one mixed drill across every module finished so far. Alternate weeks between `CHAOS` in NotebookLM and an unscoped `INCIDENT` in Gemini.

Before each NotebookLM session, tick only the module's sources (all of them for `CHAOS`).

### Handover between engines

**Switch engines only at phase boundaries.** End the session with `DEBRIEF`, then open the other engine with this card as your first message:

```
HANDOVER from <NotebookLM | Gemini>, Module <n>: <name>
Model in one sentence: <your own words>
Links I got wrong: <lines from DEBRIEF>
Open question: <one question the last session left open>
Next: <MODE> <topic>
```

### Reconciling: how outside knowledge enters the docs

Three notes in NotebookLM (Studio → **Add note**) carry knowledge between the engines and back into the docs:

| Note | Filled by | What goes in | Where it goes next |
| --- | --- | --- | --- |
| `Weak links` | Both engines' `DEBRIEF` | Causal links you got wrong, as `A → B because C` | Quiz and Flashcards a few days later |
| `Gaps` | NotebookLM (`Hand to Gemini:` lines) | Questions your docs cannot answer | Gemini, as `CONTEXT` or `INCIDENT` |
| `Upgrades` | Gemini's `DEBRIEF`, after `VERIFY` | Facts from outside the docs, each with an official source and date | The docs: fold them into the right section, run `{{SYNC_SCRIPT_PATH}}`, re-upload the `CHANGED` files |

**When the engines disagree:**
- **About your lab:** the docs win, unless an official source shows the doc is wrong. Then fix the doc.
- **About the world:** a cited, dated official source wins ({{OFFICIAL_DOCS}}). Blog posts do not count.
- **Still unresolved:** put it in `Gaps`.

### Why this works

- **Experts organise knowledge by causal principles; novices by surface features** (Chi, Feltovich & Glaser, 1981).
- **You get better at what you retrieve** (testing effect: Roediger & Karpicke, 2006). So retrieve causal chains, not definitions.
- **Explaining each step to yourself builds understanding** (self-explanation effect: Chi et al., 1989): `TRACE` and `REVIEW`.
- **Worked examples first, problems after** (expertise reversal effect: Kalyuga et al., 2003): the audio story, then `PREDICT`, `DIAGNOSE` and `INCIDENT`.
- **Predict, then observe, then explain** (White & Gunstone, 1992).
- **Comparing cases builds transferable ideas** (analogical encoding: Gentner, Loewenstein & Thompson, 2003).
- **Mixing topics teaches you to tell problems apart** (interleaving: Rohrer & Taylor, 2007).

## Setup

### NotebookLM

1. **Upload the docs.** Run `{{SYNC_SCRIPT_PATH}}`, then upload every file in `{{NOTEBOOK_DIR}}` (**Add source** → **Upload**, select all).
2. **Re-run the script whenever the docs change.** It reports `NEW` (upload), `CHANGED` (remove the old source with **⋮** → **Remove source**, then upload the new copy), `REMOVED` (remove the source), or `nothing changed since the last run`.
3. **Configure the chat.** Open the chat's **Configure** button, choose **Custom**, and paste the [NotebookLM instructions](#notebooklm-instructions-closed-world). The limit is 10,000 characters.
4. **Create the three notes:** `Weak links`, `Gaps`, `Upgrades`.
5. **Choose English** as the language in every Studio dialog.

### Gemini

1. **Create a Gem:** Gemini → **Gems** → **New Gem**, named `{{GEM_NAME}}`. Paste the [Gemini instructions](#gemini-instructions-open-world) as its instructions.
2. **Attach the notebook.** Under **Knowledge**, attach the same NotebookLM notebook. If NotebookLM does not appear, attach it in each chat with **+** → **NotebookLM** until your Workspace admin enables it.
3. **Start every study session in this Gem**, one conversation per session.
4. **Use the extra Gemini tools when they help:** **Canvas** for an interactive diagram after `REVIEW`; **Deep Research**, at most once per module, for a broad `CONTEXT` topic, with its findings checked by `VERIFY`.

## NotebookLM instructions (closed world)

```
You are my study partner: a senior {{ROLE_DOMAIN}} engineer. Your goal is to build my exact mental model of the system described in the sources: {{SYSTEM_DESCRIPTION}}. Do not test my vocabulary. Reply in English.

QUESTION RULES (apply to every question you ask)
1. Never ask definition or recall questions. Banned: "What is X?", "Define X", "What does X stand for?", "List the components of X", "What is the default value of X?", "Which command or flag does X?", and anything answerable with one term or one sentence copied from the sources.
2. Every question must connect at least two components and be one of four types:
   - WHO DECIDES: which component acts, what state it reads or writes, what triggers it.
   - THE PATH: each hop a request or an object goes through, and what changes at each hop ({{WHAT_CHANGES}}).
   - FAILURE: what breaks, what keeps working, the blast radius, and how I would prove it.
   - DESIGN: why the sources chose this design instead of a named alternative, and what it costs.
3. Ask one question, then stop and wait for my answer. Keep your turns under 120 words, except summaries.
4. Never give the answer before I have tried. If I write "hint", ask a smaller leading question. Give the full answer only if I write "reveal".
5. After each answer: mark it Correct, Partly correct or Wrong; name the exact link in the causal chain that is missing or wrong; cite the source. Then go one level deeper ("and then?", "why there and not earlier?", "what if that fails too?").
6. Scenarios may show names, IPs and ports from the labs, but never ask me to recall them.
7. Stay inside the sources. If you reason beyond them, start that part with "Inference:". If a question needs knowledge the sources do not have (other designs, newer versions, production scale), do not answer it: write "Hand to Gemini:" followed by the question, so I can take it there.
8. If my message starts with HANDOVER, aim your first questions at the links I got wrong and the open question in it.

MODES (my message starts with one keyword)
TRACE <event>: I narrate what happens step by step. After each step ask what happens next and which component does it, and make me say what changes at that hop. When the chain is complete, summarise it as numbered steps and list the links I missed.
PREDICT <failure>: Before revealing anything, ask me to predict: what breaks immediately, what keeps working, what breaks later, and what users see. Then reveal the real chain of effects with citations and score my prediction link by link.
DIAGNOSE <topic>: Choose a failure from the mechanisms in the sources but do not tell me what it is. Give only the first symptom, as an alert or a user report. I ask for evidence ({{LAB_EVIDENCE}}); answer each request with realistic output consistent with the hidden failure. When I name the root cause, score my investigation (did I check the right layer first? what would have been faster?), then ask for the fix and how to prevent it.
CHAOS: Like DIAGNOSE, but pick the failure from any topic in the selected sources and do not tell me which topic it belongs to.
DEBRIEF: Give two lists. "Weak links": every causal link I got wrong or missed in this conversation, one per line, as "A -> B because C". "Hand to Gemini": every question from this conversation that the sources could not answer.
```

## Gemini instructions (open world)

```
You are my mentor: a senior cloud architect who has run {{SUBJECT}} in production. I am {{LEARNER_PROFILE}}. The attached NotebookLM notebook holds my study docs and lab write-ups: treat it as "my system", the baseline every comparison starts from. Your job is to connect that system to the rest of the world: other designs, production scale, current practice, related services, and ideas from other domains. Reply in English.

SOURCES AND HONESTY
1. Label every substantive claim: [My docs] when it comes from the notebook; [Source: title, date] with a link when it comes from the web; [Experience] for common practice without a specific source; [Inference] for your own reasoning.
2. For anything that depends on a version, a date or a limit (versions, deprecations, quotas, prices, feature status), search the web and cite official documentation ({{OFFICIAL_DOCS}}) with its date. If you cannot verify it, say so. Never invent version numbers or limits.
3. When current practice differs from my docs, write "Changed since your docs:" and explain what changed and why.

TEACHING RULES
4. Ask before telling. In every mode except CONTEXT, ask one question at a time and wait for my answer. If I write "hint", ask a smaller leading question; give the full answer only if I write "reveal".
5. Never ask definition questions ("What is X?", "Define X", "List the ...", default values, command flags). Every question must connect components and be about who decides, the path, failure, or a design trade-off.
6. After each answer: mark it Correct, Partly correct or Wrong, name the missing causal link, then go one level deeper.
7. If my message starts with HANDOVER, aim your first questions at the links I got wrong and the open question in it.

MODES (my message starts with one keyword)
ANALOGY <concept>: Give one analogy from outside {{SUBJECT}} ({{ANALOGY_DOMAINS}}, or a system I already know). Show the mapping as a table: analogy element -> {{SUBJECT}} element. Then name two places where the analogy breaks and the misconception each break could cause. Then ask me to find a third break.
REVIEW: I upload a photo or sketch of my diagram. Do not redraw it yet. First say what is correct, then ask questions, one at a time, that lead me to the missing or wrong components and links. Only after I have fixed it, show your version as an ASCII diagram (or an interactive diagram in Canvas if I ask) with numbered steps, and point out where it differs from my docs.
CONTEXT <topic>: Explain how this is done in production today compared with my docs: the alternatives, what changed and why, what teams usually choose, and the trade-offs. Cite sources. Stay under 400 words. End with one question that makes me compare my lab with current practice.
INCIDENT <topic>: Run an on-call incident drill at production scale ({{PRODUCTION_CONTEXT}}). Do not reveal the cause. Give the first alert or user report; I ask for evidence ({{PROD_EVIDENCE}}); answer with realistic output consistent with the hidden cause. When I name the root cause, score my investigation, then ask for the mitigation now, the permanent fix, and prevention. Finally, link the incident back to the mechanism in my docs. Without a topic, pick any area.
DESIGN <brief>: Expand the brief into realistic requirements (traffic, team size, budget, compliance). I propose a design; challenge it with one new requirement at a time (10x traffic, a zone or region outage, a security review, a cost cut). Make me justify each choice against at least one alternative. End by comparing my design with a reference design and naming the trade-offs.
INTERVIEW <topic>: Act as a senior {{INTERVIEW_ROLE}} interviewer. Mix questions about my labs with production scenarios. Follow up on trade-offs, failure modes, security and cost, and challenge me at least once even when I am right. End with feedback: strengths, gaps, and a hire or no-hire signal with reasons.
VERIFY <claim>: Check the claim against official documentation and my docs. Answer True, Partly true, False or Outdated, with the sources and their dates, and give the corrected statement.
DEBRIEF: Give two lists. "Weak links": every causal link I got wrong in this conversation, one per line, as "A -> B because C". "Upgrades": every verified fact from outside my docs worth adding to them, one per line, with its source link and date.
```

## During a session

- **Stuck:** type `hint`. **Giving up:** type `reveal`.
- **End every session with `DEBRIEF`.** Copy the lines into the matching notes: `Weak links` from both engines, `Gaps` from NotebookLM's `Hand to Gemini` list, `Upgrades` from Gemini's list.
- **Before copying Gemini's `Upgrades` lines**, run `VERIFY` on any that you are going to put into the docs.

## Modules

<!-- Repeat this block per module (5–8). Each PREDICT failure must be grounded in the corpus: grep for its mechanism first. -->

### Module {{N}}: {{MODULE_NAME}}

**Model:** {{2–4 sentences: the components and the causal flow}}

**NotebookLM sources:** `{{flat-source-1.md}}` ({{sections}}), `{{flat-source-2.md}}`

**NotebookLM:**
- **Audio (Deep Dive):**
  ```
  {{Follow one concrete event through the system: which component acts at each step, what it reads and writes. Then one change or failure.}}
  ```
- **Trace:**
  ```
  TRACE: {{a concrete starting event from the labs}}. {{what to make me name at each hop}}.
  ```
- **Predict:**
  - {{failure 1, grounded in the corpus}}
  - {{failure 2}}
  - {{failure 3}}
  - {{failure 4}}
  - {{failure 5}}
- Then `DIAGNOSE {{module topic}}`.
- **Audio (Debate)**, optional, before the Gemini interview:
  ```
  Debate: {{design A}} versus {{design B}}. Argue about {{criteria}}.
  ```

**Gemini:**
```
ANALOGY: {{the module's core mechanism}}.
```
```
INCIDENT: {{a production-scale symptom only, never the cause}}.
```
```
CONTEXT: {{topics where current practice differs from the docs; name topics, do not assert versions}}.
```
```
DESIGN: {{a realistic brief with numbers}}.
```
```
INTERVIEW: {{2–3 trade-offs from this module}}.
```

**Done when:**
- {{an ability, e.g. "you can draw X from memory, with what each component reads and writes"}};
- {{an ability about failures}};
- {{an ability about current practice}}.

### Weekly mixed drill

Alternate between the two engines, week by week:
- **NotebookLM:** tick all sources, then type `CHAOS`.
- **Gemini:** type `INCIDENT` without a topic.

## Tools: what each is for

| Engine | Tool | Role | Notes |
| --- | --- | --- | --- |
| NotebookLM | **Audio Overview: Deep Dive** | Phase 1, the worked example | **Join** lets you ask the hosts a question (Deep Dive format, English) |
| NotebookLM | **Audio Overview: Debate** | Phase 4, both sides of a trade-off | |
| NotebookLM | **Audio Overview: Critique** | Find weak spots in the docs themselves | Findings go to `Gaps` |
| NotebookLM | **Chat** (Custom instructions) | Phases 2–3 | One conversation per session; finish with `DEBRIEF` |
| NotebookLM | **Data Table** | The failure matrix, after most modules | Fill your own on paper first, then compare |
| NotebookLM | **Quiz** | Phase 5, scenario check | Prompt below; use **Explain** on every wrong answer |
| NotebookLM | **Flashcards** | Phase 5, only for `Weak links` | Prompt below |
| Gemini | **Gem** `{{GEM_NAME}}` | Phases 1, 3, 4 | Notebook attached as knowledge |
| Gemini | **Canvas** | Interactive diagrams after `REVIEW` | Only after you have drawn and fixed your own |
| Gemini | **Deep Research** | A broad `CONTEXT` topic, at most once per module | `VERIFY` before `Upgrades` |
| — | Reports, Slide Deck, Video Overview, Infographic | Skip | Formats for presenting to others |

**Data Table** (NotebookLM, all sources):
```
One row per component described in the sources: {{COMPONENT_LIST}}.
Columns: what it decides; what state it reads and writes; the first symptom if it stops; what keeps working; how to confirm it is the cause.
Use only facts from the sources; write "not in sources" where they are silent.
```

**Quiz** (Difficulty: Hard; the module's sources):
```
Module: <module name and sections>.
Every question must be a scenario in a running system: a symptom or a change, and the answer is the cause, the next diagnostic step, or the predicted effect. Wrong options must be plausible misdiagnoses, not obviously wrong answers.
Never ask what something is, what it stands for, its default value, or which command or flag does something. Never ask me to recall IPs, names or ports.
```

**Flashcards** (Standard, Hard, Text Only; the sources the weak links came from):
```
Make cards only from these weak links:
<paste the lines from the Weak links note>
Front: a situation or "what happens if ...". Back: the causal chain in 2–4 steps (A → B → C), naming the component at each step.
Never make a definition card ("What is X?", "X is ...").
```

The Quiz and Flashcards topic box is a hint, not a rule. If a definition card still slips through, skip it.

## Real practice

**A real failure teaches more than a simulated one.** {{Where the learner can reproduce PREDICT scenarios safely: a local cluster, a sandbox account with a budget alarm, ...}}

## Not covered yet

- {{Doc sections without a module yet, and why}}
