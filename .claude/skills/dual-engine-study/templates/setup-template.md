<!--
Template: setup and reference for one study track (dual-engine-study skill): one-time setup click by click,
command samples (rewrite them with the subject's Module 1), Studio prompts, and the two instruction blocks.
UI steps must match a screenshot or a dated source (framework.md §10). Save as examples/<subject-id>-setup.md. Delete this comment.
-->

# {{SUBJECT}}: Setup and Reference

What you do once, or look up when needed. The study workflow is in [{{SUBJECT_ID}}-study-guide.md]({{SUBJECT_ID}}-study-guide.md).

The NotebookLM steps match the screen as of 2026-11-08. The Gemini steps come from public guides; if your screen differs, take a screenshot and update this part.

## NotebookLM setup

NotebookLM's footer now reads *Gemini Notebook*; it is the same app at notebooklm.google.com. A notebook page has three columns: **Sources** on the left, **Chat** in the middle and **Studio** on the right. The **⋮** menu at the top right, next to **Share**, holds the notebook settings.

1. **Copy the docs into one folder.** In a terminal, run:
   ```bash
   ~/.claude/skills/dual-engine-study/scripts/sync-notebooklm.sh {{SUBJECT_ID}}
   ```
2. **Upload them.** In **Sources**, click **+ Add sources** and upload every file in `{{DOCS_DIR}}/{{NOTEBOOK_DIR_NAME}}/`.
3. **Paste the tutor instructions.**
   - Open **⋮** → **Configure Chat**.
   - Under *Define your conversational goal, style, or role*, choose **Custom**.
   - Paste the instructions below into the text box. Copy only the text inside the grey box; the counter then shows about `{{NLM_INSTRUCTION_CHARS}} / 10000`.
   - Leave *Choose your response length* on **Default** (*Shorter* cuts off `DEBRIEF`), then click **Save**.

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
   8. SCOPE: my first message in a session starts with a SCOPE line naming the module and its sections. Keep every question, scenario and summary inside that module. When an answer needs a mechanism from another topic, give it one line as a black box ("<component> then does X: a later topic"), do not ask about it, and list it under "Later" in DEBRIEF. If my message starts with HANDOVER, aim your first questions at the links I got wrong.
   9. If I start an answer with "sure:" and any part of it is wrong, mark that part "Confident error". "guess:" means I am unsure.
   10. If I write in Vietnamese, explain in Vietnamese, but keep technical terms and your questions in English.

   MODES (my message starts with one keyword)
   TRACE <event>: I narrate what happens step by step. After each step ask what happens next and which component does it, and make me say what changes at that hop. When the chain is complete, summarise it as numbered steps and list the links I missed.
   PREDICT <failure>: Before revealing anything, ask me to predict: what breaks immediately, what keeps working, what breaks later, and what users see. Then reveal the real chain of effects with citations and score my prediction link by link.
   DIAGNOSE <topic>: Choose a failure from this module's mechanisms in the sources but do not tell me what it is. Give only the first symptom, as an alert or a user report. I ask for evidence ({{LAB_EVIDENCE}}); answer each request with realistic output consistent with the hidden failure. When I name the root cause, score my investigation (did I check the right layer first? what would have been faster?), then ask for the fix and how to prevent it.
   CHAOS <modules>: Like DIAGNOSE, but pick the failure from any of the modules I list, and do not tell me which one it belongs to.
   DEBRIEF: Give four lists. "Confident errors": links I got wrong in answers I started with "sure:". "Weak links": every other causal link I got wrong or missed in this conversation. Write each as one line: "A -> B because C". "Hand to Gemini": every question about this module that the sources could not answer. "Later": mechanisms from other topics that came up, one per line. Then print, in a code block, a four-line handover card: "HANDOVER from NotebookLM, <the SCOPE of this session>", "Model in one sentence:" (leave it empty for me), "Links I got wrong: <confident errors first>", "Open question: <the most important Hand to Gemini question, or none>".
   ```

   The instructions are a notebook setting, separate from the chat history.
4. **Create two notes.** Click **Add note** at the bottom of the Studio panel twice, and title the notes `Weak links` and `For Gemini & docs`. Leave both empty: your `DEBRIEF`s fill them.
   - `Weak links`: one line per mistake, as `A -> B because C`; a line starting with `!` was a confident error. In reviews you add a ✓ each time you get a line right, and delete it at three.
   - `For Gemini & docs`: questions your docs could not answer (for Gemini), and facts from Gemini whose source you have checked (for the docs).
   - Never click **Convert to source** at the bottom of a note: it turns the note into a source, so your list of mistakes would become material that the chat and the quizzes draw on.

   After a few weeks, `Weak links` looks like this. It is an example, not something to copy:
   ```
   ! ReplicaSet controller -> creates the Pods because the scheduler only assigns existing Pods to nodes ✓
   kubelet -> reports Pod status through the API server because no component talks to etcd directly ✓✓
   ```
5. **Keep `Chats from Gemini` unticked.** Once you have chatted with this notebook in Gemini, the Sources panel shows a **Chats from Gemini (N)** group at the top of the list, just under **Select all**, with a ✦ icon and a ▾ arrow. **Select all** ticks it too. Untick it: it holds Gemini's unverified open-world answers, and verified facts should reach NotebookLM only through the docs (via `For Gemini & docs`). If the group is not there, there is nothing to do.
6. **Never use *Search the web for new sources*** in this notebook: that is the box at the top of the Sources panel, with **Web** and **Fast Research**. It imports web pages as sources, and they would mix with your docs. Questions beyond your docs go to Gemini.

**What the sync script does.** NotebookLM cannot read your folders, so the script copies the {{N_SOURCES}} files listed in `{{SUBJECT_ID}}-sync.conf` (next to this guide, in the skill) into one flat folder. It renames each file so its name says where it comes from, for example `lab-2-…`. It never changes your docs. A `.md` file in the docs folder that is not in the list is reported as `NOT LISTED`, so a new doc is never forgotten. When you add, rename or delete a doc, ask Claude Code to update `{{SUBJECT_ID}}-sync.conf`; it also does this by itself when it writes a doc.

**When the docs change**, run the script again. It keeps a to-do list of what NotebookLM still needs and shows it on every run, whoever ran it before, until you clear it:

| Script says | In NotebookLM |
| --- | --- |
| `NEW` | Upload the file |
| `CHANGED` | Remove the old source (the **⋮** next to it in the Sources panel → **Remove source**), then upload the new copy |
| `REMOVED` | Remove the source |
| `NotebookLM is up to date.` | Nothing |

Once you have done what the list says, clear it:

```bash
~/.claude/skills/dual-engine-study/scripts/sync-notebooklm.sh {{SUBJECT_ID}} --uploaded
```

## Gemini setup

1. Open gemini.google.com **on a computer**: Gems can only be created on the web, but you can use them on the phone afterwards.
2. In the left side panel, click **Gems** (some accounts show **Explore Gems**), then **New Gem**.
3. Fill in the Gem:
   - **Name:** `{{GEM_NAME}}`.
   - **Instructions:** paste the text below; copy only the text inside the grey box.
   - Leave the default tool empty.
   - **Knowledge:** add the NotebookLM notebook `{{NOTEBOOK_NAME}}`. Every chat in the Gem then has it, so you never attach it again.

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
   7. Stay in the module named by my HANDOVER card or SCOPE line: link it to production, current practice and other domains, but do not drift to another {{SUBJECT}} topic; if one is needed, give it one line as a black box and list it under "Later" in DEBRIEF. A HANDOVER card comes with a command: run it, aiming at the links I got wrong.
   8. If I start an answer with "sure:" and any part of it is wrong, mark that part "Confident error". "guess:" means I am unsure.
   9. If I write in Vietnamese, explain in Vietnamese, but keep technical terms and your questions in English.

   MODES (my message starts with one keyword)
   ANALOGY <concept>: Give one analogy from outside {{SUBJECT}} ({{ANALOGY_DOMAINS}}, or a system I already know). Show the mapping as a table: analogy element -> {{SUBJECT}} element. Then name two places where the analogy breaks and the misconception each break could cause. Then ask me to find a third break.
   REVIEW: I upload a photo of my diagram. Do not redraw it yet. First say what is correct, then ask questions, one at a time, that lead me to the missing or wrong components and links. Only after I have fixed it, show your version as an ASCII diagram with numbered steps, and point out where it differs from my docs.
   CONTEXT <topic>: Explain how this is done in production today compared with my docs: the alternatives, what changed and why, what teams usually choose, and the trade-offs. Cite sources. Stay under 400 words. End with one question that makes me compare my lab with current practice.
   INCIDENT <topic>: Run an on-call incident drill at production scale ({{PRODUCTION_CONTEXT}}). Do not reveal the cause. Give the first alert or user report; I ask for evidence ({{PROD_EVIDENCE}}); answer with realistic output consistent with the hidden cause. When I name the root cause, score my investigation, then ask for the mitigation now, the permanent fix, and prevention. Then link it back to the mechanism in my docs. Without a topic, pick from the modules I list.
   DESIGN <brief>: Expand the brief into realistic requirements (traffic, team size, budget, compliance). I propose a design; challenge it with one new requirement at a time (10x traffic, a zone or region outage, a security review, a cost cut). Make me justify each choice against at least one alternative. End by comparing my design with a reference design and naming the trade-offs.
   INTERVIEW <topic>: Act as a senior {{INTERVIEW_ROLE}} interviewer. Mix questions about my labs with production scenarios. Follow up on trade-offs, failure modes, security and cost, and challenge me at least once even when I am right. End with feedback: strengths, gaps, and what to study next.
   VERIFY <claim>: Check the claim against official documentation and my docs. Answer True, Partly true, False or Outdated. Quote the exact sentence from the official page that decides it, with the page title, date and link, so I can find it myself. If no official page says it, answer "Unverified". Then give the corrected statement.
   DEBRIEF: Give four lists. "Confident errors" and "Weak links", one line each: "A -> B because C". "Upgrades": at most two facts from outside my docs worth adding to them, each as "<fact> [Current practice, <page title>, <date>, <link>]". "Later": topics outside this module that came up.
   ```
4. Click **Save**.

**To start a Gemini study session:**
1. In the side panel, open **Gems** → **{{GEM_NAME}}**; every session is a new chat in the Gem.
2. The notebook comes with the Gem's Knowledge; there is nothing to attach. Only if your Gem has no Knowledge (the NotebookLM option is missing on some accounts until the admin enables it), click **+** → **NotebookLM** in the prompt box and pick `{{NOTEBOOK_NAME}}`.
3. Send your first message: the [handover card](#handover-switching-engines) printed by your last `DEBRIEF`, or a command from [Commands](#commands).

## Commands

**Commands are ordinary messages:** type them into the chat box and press Enter. Each module's first NotebookLM message starts with a `SCOPE:` line that keeps the whole session inside that module. They work because of the instructions you pasted in the setup above.
- **Answer in a few sentences of your own.** The AI grades the cause-and-effect links, not your wording, and you do not need exact command syntax.
- **Say how sure you are.** Start an answer with `sure:` or `guess:`. A wrong `sure:` answer is marked *Confident error*: it is the misconception most worth fixing, and the one you will fix fastest.
- **Stuck?** Send `hint` for a smaller leading question. Send `reveal` for the full answer to the current question.
- **A hard step?** Ask in Vietnamese: the AI explains in Vietnamese and keeps the technical terms and its questions in English.

| Command | Engine | What you get | Finished when |
| --- | --- | --- | --- |
| `TRACE: <event>` | NotebookLM | You narrate an event step by step; it asks what happens next | The chain reaches the end and it lists the links you missed |
| `PREDICT: <failure>` | NotebookLM | A named failure; you predict its effects before they are revealed | It has scored your prediction |
| `DIAGNOSE <topic>` | NotebookLM | A hidden failure; you investigate from the first symptom | You have named the root cause, the fix and the prevention |
| `CHAOS: Modules 1–N` | NotebookLM | `DIAGNOSE` on any module you have learned, without saying which | As for `DIAGNOSE` |
| `INCIDENT: <symptom>` | Gemini | An incident drill at production scale | Root cause, mitigation, fix, prevention, and the link back to your docs |
| `CONTEXT: <topic>` | Gemini | A short, cited explanation of current practice | You have answered its closing question |
| `DESIGN: <brief>` | Gemini | A design exercise whose requirements keep changing | It compares your design with a reference design |
| `INTERVIEW: <topic>` | Gemini | A mock interview (optional) | Feedback: strengths, gaps, what to study next |
| `ANALOGY: <concept>` | Gemini | An analogy, a mapping table, two places it breaks (optional) | You have found a third break |
| `REVIEW` with a photo | Gemini | Questions that lead you to fix your own drawing (modules without a reference diagram) | Your drawing is right |
| `VERIFY <claim>` | Gemini | A verdict, with the official sentence quoted and linked | You have found that sentence on the page |
| `DEBRIEF` | Both | Confident errors, weak links, and gaps or upgrades, plus a ready handover card | |
| `HANDOVER …` | Both | The other engine starts from your weak links | |

<!-- The samples below come from the Kubernetes guide. Rewrite each one with the subject's own Module 1 prompts, keeping the same shape and length. -->

### TRACE

Send the module's **Trace** prompt. A session looks like this:

> **You:** TRACE: I run kubectl apply for a Deployment with 3 replicas (Theory sections II–IV). Then I delete one of its Pods. Then I change the image tag.
>
> **NotebookLM:** You ran `kubectl apply`. Which component receives the request first, and what does it do with it?
>
> **You:** sure: kubectl sends the Deployment to the API server, which validates it and stores it in etcd.
>
> **NotebookLM:** Correct [1]. The Deployment now exists in etcd, but no Pod exists yet. Which component notices this, and what does it create?
>
> **You:** sure: the scheduler creates the Pods.
>
> **NotebookLM:** Confident error. Missing link: the scheduler does not create Pods; it only assigns existing Pods to nodes [2]. Which component watches Deployments?
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
> **You:** (1) sure: … (2) guess: … (3) guess: … (4) sure: …
>
> **NotebookLM:** (1) Correct: … [3]. (2) Partly correct: you missed … (3) Wrong: … (4) Confident error: … The real chain of effects: 1. … 2. … 3. …

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
> **You:** guess: root cause … fix …
>
> **NotebookLM:** Correct. You reached the right layer after two steps; looking at … first would have been faster. How do you prevent it from happening again?

`CHAOS: Modules 1–N` works the same way, but on any of the modules you have learned.

### DEBRIEF

Send it at the end of every session. NotebookLM answers with three lists and a handover card:

> **Confident errors**
> - ReplicaSet controller -> creates the Pods because the scheduler only assigns existing Pods to nodes
>
> **Weak links**
> - kubelet -> reports Pod status through the API server because no component talks to etcd directly
>
> **Hand to Gemini**
> - How does a managed control plane such as EKS protect etcd?
>
> **Later**
> - kube-proxy routing Service traffic to the new Pod (Module 2)
>
> *(then the handover card, in a code block)*

Click **Save to note** under the reply, then copy the lines into your notes as each module's *Save* steps describe. Gemini's `DEBRIEF` has *Upgrades* instead of *Hand to Gemini*: at most two lines, each with its source page.

### HANDOVER: switching engines

`DEBRIEF` prints the card. Fill in only the second line, the model in one sentence in your own words (a 30-second recall), and send the card **together with the step's prompt, in one message**, to the other engine:

```
HANDOVER from NotebookLM, Module 1: The control loop
Model in one sentence: Controllers watch the desired state stored through the API server and act until the actual state matches it.
Links I got wrong: ReplicaSet controller -> creates the Pods because the scheduler only assigns existing Pods to nodes
Open question: How does a managed control plane such as EKS protect etcd?

ANALOGY: the Kubernetes control loop. Then stress-test the "K8s Company" analogy in my docs (Theory section II): where does it break?
```

Switch engines only between steps, never in the middle of one.

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
> **You:** sure: root cause …
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

`INTERVIEW` (optional) runs the same way: one question at a time, follow-ups, at least one "are you sure?", and at the end feedback with strengths, gaps and what to study next.

### VERIFY

> **You:** VERIFY ingress-nginx is retired and no longer receives security fixes.
>
> **Gemini:** True / Partly true / False / Outdated: … Quote: "…" (page title, date, link). Corrected statement: …

Open the link and find the quoted sentence. Only then does the line go into `Upgrades`.

### ANALOGY and REVIEW

> **You:** ANALOGY: the Kubernetes control loop. Then stress-test the "K8s Company" analogy in my docs (Theory section II): where does it break?
>
> **Gemini:** Analogy: … *(a table: analogy element → Kubernetes element)*. Break 1: … (the misconception it could cause: …). Break 2: … Now find a third break.

For `REVIEW`, add the photo of your drawing with **+**, then send `REVIEW`:

> **Gemini:** What is correct: the API server is in the middle, and each node has a kubelet [My docs]. Question 1: your drawing has an arrow from the scheduler straight to etcd. Which component do all the other components go through?

It keeps asking until your drawing is right; then it shows its own version as an ASCII diagram.

## Studio settings

**Audio Overview** (each module's *Listen* step): Format **Deep Dive**; Choose language **English**; Length **Short**; Sources: the module's files; *What should the AI hosts focus on in this episode?*: the module's Listen prompt. Do not click the suggestion chips under the box (such as *+ Scaling Logic*): they pull the episode away from the module.

The Quiz and Flashcards prompts are in each module's *Review* in the study guide, where you use them.

**Data Table** (optional, once, after the module that covers most components; all sources; fill your own table on paper first):
```
One row per component described in the sources: {{COMPONENT_LIST}}.
Columns: what it decides; what state it reads and writes; the first symptom if it stops; what keeps working; how to confirm it is the cause.
Use only facts from the sources; write "not in sources" where they are silent.
```
