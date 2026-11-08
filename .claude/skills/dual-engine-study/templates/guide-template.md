<!--
Template for a dual-engine study guide (dual-engine-study skill).
The guide is for a learner who is new to NotebookLM and Gemini: operations first (Parts 1–3), material (Parts 4–5), theory last (Part 6).
Replace every {{PLACEHOLDER}}; framework.md §8 gives the subject-specific values. Rewrite the Part 3 samples with the subject's Module 1.
UI steps must match a screenshot or a dated source (framework.md §9). Reference for depth and tone: examples/kubernetes-study-guide.md.
Delete this comment.
-->

# {{SUBJECT}}: Dual-Engine Study Guide

How to master {{SUBJECT}} as a system, with two AI engines that do different jobs:
- **NotebookLM**, the closed-world tutor: it answers only from your {{N_SOURCES}} docs, with citations. *How does **my** system work, and why did it behave that way?*
- **Gemini**, the open-world mentor: the same docs plus the web. *How does **the world** do this, and what changes at scale?*

**Routing rule:** if the answer should be in your docs, ask NotebookLM. If it needs anything outside them, ask Gemini.

The docs live in `{{DOCS_DIR}}/`. This guide lives with the `dual-engine-study` Claude Code skill and is not uploaded to NotebookLM.

**How to read this guide:**
- **New to NotebookLM and Gemini?** Do [Part 1](#part-1-one-time-setup) once, then follow [Part 2](#part-2-your-first-week-step-by-step) for your first week. [Part 3](#part-3-what-each-command-looks-like) shows what every command looks like in practice.
- **Part 4** holds the modules, your weekly material.
- **Part 5** has the Studio prompts.
- **Part 6** explains why the method works.

## Part 1: One-time setup

About 30 minutes. The NotebookLM steps match the screen as of 2026-11-08. The Gemini steps come from public guides; if your screen differs, take a screenshot and update this part.

### NotebookLM

NotebookLM's footer now reads *Gemini Notebook*; it is the same app at notebooklm.google.com. A notebook page has three columns: **Sources** on the left, **Chat** in the middle and **Studio** on the right. The **⋮** menu at the top right, next to **Share**, holds the notebook settings.

1. **Copy the docs into one folder.** In a terminal, run:
   ```bash
   {{DOCS_DIR}}/scripts/sync-notebooklm.sh
   ```
2. **Upload them.** In **Sources**, click **+ Add sources** and upload every file in `{{DOCS_DIR}}/{{NOTEBOOK_DIR_NAME}}/`.
3. **Paste the tutor instructions.**
   - Open **⋮** → **Configure Chat**.
   - Under *Define your conversational goal, style, or role*, choose **Custom**.
   - Paste [Appendix A](#appendix-a-notebooklm-instructions) into the text box. Copy only the text inside the grey box; the counter then shows about `{{NLM_INSTRUCTION_CHARS}} / 10000`.
   - Leave *Choose your response length* on **Default**, then click **Save**.

   The instructions are a notebook setting, separate from the chat history.
4. **Create three notes.** Click **Add note** at the bottom of the Studio panel three times, and title the notes `Weak links`, `Gaps` and `Upgrades`.
5. **Keep `Chats from Gemini` unticked.** Once you have chatted with this notebook in Gemini, the Sources panel shows a **Chats from Gemini (N)** group at the top of the list, just under **Select all**, with a ✦ icon and a ▾ arrow. **Select all** ticks it too. Untick it: it holds Gemini's unverified open-world answers, and verified facts should reach NotebookLM only through the docs (`Upgrades`). If the group is not there, there is nothing to do.

**When the docs change**, run the script again and do what it reports:

| Script says | In NotebookLM |
| --- | --- |
| `NEW` | Upload the file |
| `CHANGED` | Remove the old source (the **⋮** next to it in the Sources panel → **Remove source**), then upload the new copy |
| `REMOVED` | Remove the source |
| `nothing changed since the last run` | Nothing |

### Gemini

1. Open gemini.google.com **on a computer**: Gems can only be created on the web, but you can use them on the phone afterwards.
2. In the left side panel, click **Gems** (some accounts show **Explore Gems**), then **New Gem**.
3. Fill in the Gem:
   - **Name:** `{{GEM_NAME}}`.
   - **Instructions:** paste [Appendix B](#appendix-b-gemini-instructions).
   - Leave the default tool empty.
4. **Knowledge:** if the Gem offers to add a NotebookLM notebook, add `{{NOTEBOOK_NAME}}`. If it does not, skip this step; you attach the notebook in each chat instead. On a Workspace account the option only appears once the admin has enabled NotebookLM.
5. Click **Save**.

**To start a Gemini study session:**
1. In the side panel, open **Gems** → **{{GEM_NAME}}**; every session is a new chat in the Gem.
2. In the prompt box, click **+** → **NotebookLM** and pick `{{NOTEBOOK_NAME}}`. Skip this if the Gem already has the notebook as Knowledge.
3. Send your first message: a [handover card](#handover-switching-engines) or a command from Part 3.

## Part 2: Your first week, step by step

Each module takes a week and always runs through the same days. Below is Module 1, click by click; later modules work the same way with their own prompts from Part 4.

**Before every NotebookLM chat or Studio item, set the sources.** In **Sources**:
1. Untick **Select all** so that nothing is ticked.
2. Tick only the module's files (Module 1: {{MODULE_1_SOURCES}}).
3. Check that **Chats from Gemini** stays unticked.

### Day 1: Model and Trace (about 60 minutes)

1. **Listen (NotebookLM, about 20 minutes).** In the Studio panel, open **Audio Overview**. In *Customize Audio Overview*, set:
   - **Format:** Deep Dive.
   - **Choose language:** English.
   - **Length:** Default.
   - **Sources:** the module's files.
   - **What should the AI hosts focus on in this episode?:** paste the module's **Audio** prompt.

   Do not click the suggestion chips under the box (such as *+ Scaling Logic*): they add text that pulls the episode away from the module. Click **Generate**; the episode appears in the Studio panel after a few minutes. If a **Join** button shows while it plays, you can interrupt the hosts with a question.
2. **Draw (paper, about 10 minutes).** Without looking at anything, draw what you heard:
   - one box per component;
   - one arrow per "talks to";
   - next to each box, what it reads or writes.

   A wrong drawing is fine; the next step fixes it.
3. **Review the drawing (Gemini, about 15 minutes; you can skip it on your first day).**
   - Photograph the drawing and start a Gemini session (Part 1).
   - Add the photo with **+**, then send `REVIEW` ([sample](#review)).
   - When the drawing is right, send the module's **ANALOGY** prompt ([sample](#analogy)).
4. **Trace (NotebookLM, about 15 minutes).** Paste the module's **Trace** prompt into the chat box and answer one question at a time ([sample](#trace)).
5. **Close the day.** Send `DEBRIEF` ([sample](#debrief)). Click **Save to note** under the reply, then copy:
   - its *Weak links* lines into your `Weak links` note;
   - its *Hand to Gemini* lines into `Gaps`.

### Day 2: Break (about 45 minutes)

1. **Optional, for a clean chat:** **⋮** → **Delete chat history** (it deletes the whole chat; your notes are not affected). The first time, reopen **⋮** → **Configure Chat** afterwards to check that your instructions are still there.
2. **Predict (NotebookLM).** Send `PREDICT:` followed by one failure from the module's **Predict** list, then answer the four questions ([sample](#predict)). Do at least 3 of the 5 failures.
3. **Diagnose (NotebookLM).** Send the module's **DIAGNOSE** line, for Module 1 `DIAGNOSE {{MODULE_1_TOPIC}}`, and investigate ([sample](#diagnose)). Do it twice.
4. **Close the NotebookLM part.** Send `DEBRIEF` → **Save to note** → copy the lines into your notes.
5. **Incident (Gemini).** Start a Gemini session and send a [handover card](#handover-switching-engines), then the module's **INCIDENT** prompt ([sample](#incident)).
6. **Close the Gemini part.** Send `DEBRIEF` and copy its *Weak links* lines into `Weak links`.

### Day 4: Extend (about 45 minutes, Gemini)

1. Start a Gemini session and send a handover card.
2. Send the module's **CONTEXT** prompt, then **DESIGN**, then **INTERVIEW** ([samples](#context)). Finish each exercise before starting the next.
3. If the module has a **Debate** audio prompt, generate it in NotebookLM (Audio Overview → Format **Debate**) and listen before **INTERVIEW**.
4. Send `DEBRIEF`. For every *Upgrades* line you want to keep, first send `VERIFY` followed by the line ([sample](#verify)). Copy only the lines that pass into `Upgrades`.

### Day 5: Retain (about 20 minutes, NotebookLM)

1. **Quiz.** In the Studio panel, open **Quiz** and set:
   - **Difficulty:** Hard.
   - **Language:** English.
   - **Sources:** the module's files.
   - **Topic box:** the Quiz prompt from Part 5, with the module's name filled in.

   Answer every question, and click **Explain** on every wrong answer.
2. **Flashcards.** Open **Flashcards** and set: **Standard**, **Hard**, **Text Only**, **English**. In the topic box, paste the Flashcards prompt from Part 5 with your `Weak links` lines.
3. **Fold upgrades into the docs.** When `Upgrades` has lines worth keeping, ask Claude Code to fold them into the docs. Then run the sync script and re-upload the `CHANGED` files.

### End of the week: mixed drill (about 20 minutes)

Alternate between the two engines, week by week:
- **NotebookLM:** tick **all** sources (still not *Chats from Gemini*), then send `CHAOS`.
- **Gemini:** start a session and send `INCIDENT` with no topic.

Mixing topics is what trains you to tell problems apart.

## Part 3: What each command looks like

**Commands are ordinary messages:** type them into the chat box and press Enter. They work because of the instructions you pasted in Part 1.
- **Answer in a few sentences of your own.** The AI grades the cause-and-effect links, not your wording, and you do not need exact command syntax.
- **Stuck?** Send `hint` for a smaller leading question. Send `reveal` for the full answer to the current question.

| Command | Engine | What you get | Finished when |
| --- | --- | --- | --- |
| `TRACE: <event>` | NotebookLM | You narrate an event step by step; it asks what happens next | The chain reaches the end and it lists the links you missed |
| `PREDICT: <failure>` | NotebookLM | A named failure; you predict its effects before they are revealed | It has scored your prediction |
| `DIAGNOSE <topic>` | NotebookLM | A hidden failure; you investigate from the first symptom | You have named the root cause, the fix and the prevention |
| `CHAOS` | NotebookLM | `DIAGNOSE` on any topic, without saying which | As for `DIAGNOSE` |
| `REVIEW` with a photo | Gemini | Questions that lead you to fix your own drawing | Your drawing is right; then it shows its version |
| `ANALOGY: <concept>` | Gemini | An analogy, a mapping table, two places it breaks | You have found a third break |
| `INCIDENT: <symptom>` | Gemini | An incident drill at production scale | Root cause, mitigation, fix, prevention, and the link back to your docs |
| `CONTEXT: <topic>` | Gemini | A short, cited explanation of current practice | You have answered its closing question |
| `DESIGN: <brief>` | Gemini | A design exercise whose requirements keep changing | It compares your design with a reference design |
| `INTERVIEW: <topic>` | Gemini | A mock interview | Feedback with a hire or no-hire signal |
| `VERIFY <claim>` | Gemini | True, Partly true, False or Outdated, with dated sources | |
| `DEBRIEF` | Both | The lists to copy into your notes | |
| `HANDOVER …` | Both | The other engine starts from your weak links | |

<!-- The samples below come from the Kubernetes guide. Rewrite each one with the subject's own Module 1 prompts, keeping the same shape and length. -->

### TRACE

Send the module's **Trace** prompt. A session looks like this:

> **You:** TRACE: I run kubectl apply for a Deployment with 3 replicas (Theory sections II–IV). Then I delete one of its Pods. Then I change the image tag.
>
> **NotebookLM:** You ran `kubectl apply`. Which component receives the request first, and what does it do with it?
>
> **You:** kubectl sends the Deployment to the API server, which validates it and stores it in etcd.
>
> **NotebookLM:** Correct [1]. The Deployment now exists in etcd, but no Pod exists yet. Which component notices this, and what does it create?
>
> **You:** The scheduler creates the Pods?
>
> **NotebookLM:** Wrong. Missing link: the scheduler does not create Pods; it only assigns existing Pods to nodes [2]. Which component watches Deployments?
>
> **You:** hint
>
> **NotebookLM:** Look at the Controller Manager in section II. Which of its controllers is responsible for Deployments, and what object does it create first?

It goes on until the containers run on a node, then moves to "delete a Pod" and "change the image tag". At the end it lists the whole chain as numbered steps, plus the links you missed.

### PREDICT

Send `PREDICT:` and **one** failure from the module's **Predict** list per message:

> **You:** PREDICT: The kube-scheduler is stopped for 10 minutes while I scale a Deployment from 3 to 6 replicas.
>
> **NotebookLM:** Before I reveal anything, predict: (1) what breaks immediately, (2) what keeps working, (3) what breaks later, (4) what users see.
>
> **You:** (1) … (2) … (3) … (4) … *(your four answers)*
>
> **NotebookLM:** (1) Correct: … [3]. (2) Partly correct: you missed … (3) Wrong: … The real chain of effects: 1. … 2. … 3. …

### DIAGNOSE

Send the module's **DIAGNOSE** line. NotebookLM chooses a failure and hides it:

> **You:** DIAGNOSE {{MODULE_1_TOPIC}}
>
> **NotebookLM:** Alert: a Deployment has had 3 desired replicas and 0 available ones for 10 minutes. What do you check first?
>
> **You:** Show me the Pods of that Deployment.
>
> **NotebookLM:** *(simulated `kubectl get pods` output that matches the hidden failure)*
>
> **You:** Describe one of them and show the events.
>
> **NotebookLM:** *(simulated output)*
>
> **You:** Root cause: … Fix: …
>
> **NotebookLM:** Correct. You reached the right layer after two steps; looking at … first would have been faster. How do you prevent it from happening again?

`CHAOS` works the same way, but on any topic in the ticked sources.

### DEBRIEF

Send it at the end of every session. NotebookLM answers with two lists:

> **Weak links**
> - ReplicaSet controller -> creates the Pods because the scheduler only assigns existing Pods to nodes
>
> **Hand to Gemini**
> - How does a managed control plane such as EKS protect etcd?

Click **Save to note** under the reply. Copy the *Weak links* lines into your `Weak links` note and the *Hand to Gemini* lines into `Gaps`.

Gemini's `DEBRIEF` returns *Weak links* and *Upgrades*, each *Upgrades* line with a source link. Send `VERIFY` with an *Upgrades* line before you copy it into `Upgrades`.

### HANDOVER: switching engines

The first message after you switch engines is a handover card, so the new engine starts from your weak links. Fill it from the last `DEBRIEF`:

```
HANDOVER from NotebookLM, Module 1: The control loop
Model in one sentence: Controllers watch the desired state stored through the API server and act until the actual state matches it.
Links I got wrong: ReplicaSet controller -> creates the Pods because the scheduler only assigns existing Pods to nodes
Open question: How does a managed control plane such as EKS protect etcd?
Next: INCIDENT: every deployment in the cluster suddenly fails, although all running Pods are healthy.
```

The blank card:

```
HANDOVER from <NotebookLM | Gemini>, Module <n>: <name>
Model in one sentence: <your own words>
Links I got wrong: <lines from DEBRIEF>
Open question: <one question the last session left open>
Next: <MODE> <topic>
```

Switch engines only between steps, never in the middle of one.

### REVIEW

1. Photograph your drawing.
2. In a Gemini session, add the photo with **+**.
3. Send `REVIEW`:

> **Gemini:** What is correct: the API server is in the middle, and each node has a kubelet [My docs]. Question 1: your drawing has an arrow from the scheduler straight to etcd. Which component do all the other components go through?
>
> **You:** The API server.
>
> **Gemini:** Correct. Fix that arrow. Question 2: …

Once your drawing is right, Gemini shows its own version as an ASCII diagram with numbered steps. Ask for "Canvas" if you want an interactive one.

### ANALOGY

> **You:** ANALOGY: the Kubernetes control loop. Then stress-test the "K8s Company" analogy in my docs (Theory section II): where does it break?
>
> **Gemini:** Analogy: … *(a table: analogy element → Kubernetes element)*. Break 1: … (the misconception it could cause: …). Break 2: … Now find a third break.

Answer with your own third break; Gemini grades it.

### INCIDENT

> **You:** INCIDENT: every deployment in the cluster suddenly fails, although all running Pods are healthy.
>
> **Gemini:** 09:12, an alert from CI: deploys to three services fail with an error from the API server. What do you look at first?
>
> **You:** The full error message and the events in one of those namespaces.
>
> **Gemini:** *(realistic output)*
>
> … *(you keep asking for evidence: kubectl, CloudWatch, ALB metrics, CloudTrail)* …
>
> **You:** Root cause: …
>
> **Gemini:** Correct. Investigation score: … Now: what is your mitigation right now, the permanent fix, and the prevention? … [My docs] This connects to Module 1: every write goes through the API server, so …

### CONTEXT

> **You:** CONTEXT: what a managed control plane (EKS) takes off my hands compared with my kubeadm lab, and what EKS Auto Mode changes on top of that.
>
> **Gemini:** *(under 400 words)* [My docs] In your lab you ran etcd and the API server yourself… [Source: Amazon EKS User Guide, date] On EKS… Changed since your docs: … Question: which failure from Module 1 can no longer happen on EKS, and which still can?

Answer the closing question; Gemini grades it like any other answer. `CONTEXT` is the only command that explains first.

### DESIGN and INTERVIEW

> **You:** DESIGN: one EKS cluster shared by 5 teams that deploy their own services: who may change what, and how to stop one team from starving the others.
>
> **Gemini:** Requirements: … What is your design?
>
> **You:** *(a few bullet points)*
>
> **Gemini:** New requirement: one team's nightly batch job uses all the CPU. What changes in your design, and what does that cost? … *(3–4 rounds)* … Compared with a reference design: …

`INTERVIEW` runs the same way: one question at a time, follow-ups, at least one "are you sure?", and at the end feedback with strengths, gaps and a hire or no-hire signal.

### VERIFY

> **You:** VERIFY ingress-nginx is retired and no longer receives security fixes.
>
> **Gemini:** True / Partly true / False / Outdated: … [Source: Kubernetes blog, date] Corrected statement: …

Only lines that pass go into your `Upgrades` note.

## Part 4: Modules

Each module block gives the mental model to build, the sources to tick, the NotebookLM prompts and the Gemini prompts. Part 2 says on which day each prompt is used.

<!-- Repeat this block per module (5–8). Each PREDICT failure must be grounded in the corpus: grep for its mechanism first. INCIDENT starters give a symptom only, never the cause. -->

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

### Not covered yet

- {{Doc sections without a module yet, and why}}

## Part 5: Studio tools and prompts

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

## Part 6: Why the method works

### Why two engines

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
| Switching engines mid-thought costs attention | Switch only **between phases**, carrying a [handover card](#handover-switching-engines) |
| An open-world engine tempts you into passive reading | Gemini also asks before it tells. `CONTEXT` is the only explaining mode, and it ends with a question |

### The method

#### Four kinds of question

Both engines use the same four question types. Each one connects at least two components:

| Question | What you must explain | Example |
| --- | --- | --- |
| **Who decides?** | Which component acts, what state it reads or writes, what triggers it | {{EXAMPLE_WHO_DECIDES}} |
| **What is the path?** | Every hop, and what changes at each one ({{WHAT_CHANGES}}) | {{EXAMPLE_PATH}} |
| **What if it fails?** | What breaks, what keeps working, the blast radius, how you would prove it | {{EXAMPLE_FAILURE}} |
| **Why this design?** | The alternative, and what the choice costs | {{EXAMPLE_DESIGN}} |

One distinction runs through all of them: **{{CROSS_CUTTING_DISTINCTION}}.** Most good failure questions come down to it.

#### The loop for each module

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

Before each NotebookLM session, tick only the module's sources (all of them for `CHAOS`), and never the **Chats from Gemini** group.

#### Reconciling: how outside knowledge enters the docs

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

#### Why this works

- **Experts organise knowledge by causal principles; novices by surface features** (Chi, Feltovich & Glaser, 1981).
- **You get better at what you retrieve** (testing effect: Roediger & Karpicke, 2006). So retrieve causal chains, not definitions.
- **Explaining each step to yourself builds understanding** (self-explanation effect: Chi et al., 1989): `TRACE` and `REVIEW`.
- **Worked examples first, problems after** (expertise reversal effect: Kalyuga et al., 2003): the audio story, then `PREDICT`, `DIAGNOSE` and `INCIDENT`.
- **Predict, then observe, then explain** (White & Gunstone, 1992).
- **Comparing cases builds transferable ideas** (analogical encoding: Gentner, Loewenstein & Thompson, 2003).
- **Mixing topics teaches you to tell problems apart** (interleaving: Rohrer & Taylor, 2007).

### Real practice

**A real failure teaches more than a simulated one.** {{Where the learner can reproduce PREDICT scenarios safely: a local cluster, a sandbox account with a budget alarm, ...}}

## Appendix A: NotebookLM instructions

Paste this into **⋮** → **Configure Chat** → **Custom** (Part 1).

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

## Appendix B: Gemini instructions

Paste this into the Gem's **Instructions** (Part 1).

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
