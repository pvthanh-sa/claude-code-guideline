# Kubernetes: Dual-Engine Study Guide

How to master Kubernetes and EKS as a system, with two AI engines that do different jobs:
- **NotebookLM**, the closed-world tutor: it answers only from your 16 docs, with citations. *How does **my** system work, and why did it behave that way?*
- **Gemini**, the open-world mentor: the same docs plus the web. *How does **the world** do this, and what changes at scale?*

**Routing rule:** if the answer should be in your docs, ask NotebookLM. If it needs anything outside them (an alternative design, production scale, a newer version, another domain), ask Gemini.

The docs live in `~/Documents/Devops/K8s/documents/`. This guide lives with the `dual-engine-study` Claude Code skill, as its worked example, and is not uploaded to NotebookLM. It is set up for about 4 hours a week, with the goal of understanding the system for your daily work.

**How to read this guide:**
- **New to NotebookLM and Gemini?** Do [Part 1](#part-1-one-time-setup) once, then follow [Part 2](#part-2-your-week-session-by-session) every week. [Part 3](#part-3-what-each-command-looks-like) shows what every command looks like in practice.
- **Part 4** holds the modules, your weekly material.
- **Part 5** says which tools to use, which to skip and why, and has the Studio prompts.
- **Part 6** explains why the method works.

## Part 1: One-time setup

About 30 minutes. The NotebookLM steps match the screen as of 2026-11-08. The Gemini steps come from public guides; if your screen differs, take a screenshot and update this part.

### NotebookLM

NotebookLM's footer now reads *Gemini Notebook*; it is the same app at notebooklm.google.com. A notebook page has three columns: **Sources** on the left, **Chat** in the middle and **Studio** on the right. The **⋮** menu at the top right, next to **Share**, holds the notebook settings.

1. **Copy the docs into one folder.** In a terminal, run:
   ```bash
   ~/Documents/Devops/K8s/documents/scripts/sync-notebooklm.sh
   ```
2. **Upload them.** In **Sources**, click **+ Add sources** and upload every file in `~/Documents/Devops/K8s/documents/notebooklm-k8s/`.
3. **Paste the tutor instructions.**
   - Open **⋮** → **Configure Chat**.
   - Under *Define your conversational goal, style, or role*, choose **Custom**.
   - Paste [Appendix A](#appendix-a-notebooklm-instructions) into the text box. Copy only the text inside the grey box; the counter then shows about `4061 / 10000`.
   - Leave *Choose your response length* on **Default** (*Shorter* cuts off `DEBRIEF`), then click **Save**.

   The instructions are a notebook setting, separate from the chat history.
4. **Create three notes.** Click **Add note** at the bottom of the Studio panel three times, and title the notes `Weak links`, `Gaps` and `Upgrades`.
   - Leave `Gaps` and `Upgrades` empty: your `DEBRIEF`s fill them later.
   - In `Weak links`, type only this first line, as normal text (not in a code block): `Quiz (predicted / actual): week 1 – / –`
   - Never click **Convert to source** at the bottom of a note: it turns the note into a source, so your list of mistakes would become material that the chat and the quizzes draw on.

   After a few sessions, `Weak links` looks like this. It is an example, not something to copy:
   ```
   Quiz (predicted / actual): week 1 70% / 55%
   ! ReplicaSet controller -> creates the Pods because the scheduler only assigns existing Pods to nodes (box 1, due 2026-11-15)
   kubelet -> reports Pod status through the API server because no component talks to etcd directly (box 1, due 2026-11-15)
   ```
   `!` marks a confident error; the box and the due date drive your reviews (Part 2, session D).
5. **Keep `Chats from Gemini` unticked.** Once you have chatted with this notebook in Gemini, the Sources panel shows a **Chats from Gemini (N)** group at the top of the list, just under **Select all**, with a ✦ icon and a ▾ arrow. **Select all** ticks it too. Untick it: it holds Gemini's unverified open-world answers, and verified facts should reach NotebookLM only through the docs (`Upgrades`). If the group is not there, there is nothing to do.
6. **Never use *Search the web for new sources*** in this notebook: that is the box at the top of the Sources panel, with **Web** and **Fast Research**. It imports web pages as sources, and they would mix with your docs. Questions beyond your docs go to Gemini.

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
   - **Name:** `Cloud Architect Mentor`.
   - **Instructions:** paste [Appendix B](#appendix-b-gemini-instructions).
   - Leave the default tool empty and add no Knowledge files: you attach the notebook in each chat instead.
4. Click **Save**.

**To start a Gemini study session:**
1. In the side panel, open **Gems** → **Cloud Architect Mentor**; every session is a new chat in the Gem.
2. In the prompt box, click **+** → **NotebookLM** and pick `k8s`. On a Workspace account this option appears only once the admin has enabled NotebookLM.
3. Send your first message: the [handover card](#handover-switching-engines) printed by your last `DEBRIEF`, or a command from Part 3.

## Part 2: Your week, session by session

One module per week, in **four sessions of about an hour, at least one day apart** (about 4 hours, plus a monthly 20 minutes). The sessions below use Module 1; later modules work the same way with their own prompts from Part 4.

**Before every NotebookLM chat or Studio item, set the sources.** In **Sources**:
1. Untick **Select all** so that nothing is ticked.
2. Tick only the files the session needs (Module 1: `kubernetes-theory.md` and `lab-3-overview.md`).
3. Check that **Chats from Gemini** stays unticked.

Studio dialogs (Audio Overview, Quiz, Flashcards) have their own **Sources** menu: open it and check the same.

### Session A: Model and Trace (about 60 minutes)

1. **New module only:** if the chat still holds last week's conversation and its `DEBRIEF` is saved, clear it with **⋮** → **Delete chat history**. The first time, reopen **⋮** → **Configure Chat** afterwards to check that your instructions are still there.
2. **Start the audio (NotebookLM).** In the Studio panel, open **Audio Overview**. In *Customize Audio Overview*, set:
   - **Format:** Deep Dive.
   - **Choose language:** English.
   - **Length:** Short.
   - **Sources:** the module's files.
   - **What should the AI hosts focus on in this episode?:** paste the module's **Audio** prompt.

   Do not click the suggestion chips under the box (such as *+ Scaling Logic*): they add text that pulls the episode away from the module. Click **Generate**; the episode takes a few minutes, so do step 3 meanwhile.
3. **Draw before you learn (paper, about 7 minutes).**
   - **From Module 2 on:** redraw *last* week's model on a blank page without looking. Then open last week's reference diagram and mark the differences in red; each difference becomes a line in `Weak links`. This, not a feeling of "done", is how you know last week stuck.
   - **This week's model:** sketch it for 2 minutes from what you already know. Guesses are fine: they tell you what to listen for.
4. **Listen with the diagram open (about 15 minutes).** Open the module's **Reference diagrams** (Part 4) in VS Code's Markdown preview and play the episode in the Studio panel while you look at them. If one hop confuses you, click **Join** (if shown) and ask the hosts.
5. **Redraw and compare (about 10 minutes).** Close everything and redraw the model from memory: one box per component, one arrow per "talks to", and next to each box what it reads or writes. Then open the reference diagrams again and mark every difference in red.
   - A module **without** reference diagrams (Module 6): instead of comparing, photograph your drawing, start a Gemini session and send `REVIEW` ([sample](#analogy-and-review)).
   - **Optional:** if the model still feels abstract, send the module's **ANALOGY** prompt in a Gemini session ([sample](#analogy-and-review)).
6. **Trace (NotebookLM, about 15 minutes).** Paste the module's **Trace** prompt into the chat box and answer one question at a time ([sample](#trace)).
7. **Close the session.** Send `DEBRIEF` ([sample](#debrief)) and click **Save to note** under the reply. Then:
   - copy the *Confident errors* lines to the top of `Weak links` with a `!`, and the *Weak links* lines below them; give every new line the due date of next week's session D;
   - copy the *Hand to Gemini* lines into `Gaps`;
   - keep the handover card for session B.

### Session B: Break (about 60 minutes)

1. **Predict (NotebookLM).** Send `PREDICT:` followed by one failure from the module's **Predict** list, then answer the four questions, each starting with `sure:` or `guess:` ([sample](#predict)). Do 3 of the 5 failures.
2. **Diagnose (NotebookLM).** Send the module's **DIAGNOSE** line, for Module 1 `DIAGNOSE the control loop`, and investigate ([sample](#diagnose)). Do one, or two if time allows.
3. **Close the NotebookLM part.** `DEBRIEF` → **Save to note** → copy the lines into your notes, as in session A.
4. **Incident (Gemini).** Start a Gemini session, paste the handover card with your own *Model in one sentence*, then send the module's **INCIDENT** prompt ([sample](#incident)).
5. **Close the Gemini part.** Send `DEBRIEF`, copy its *Confident errors* and *Weak links* lines into `Weak links`, and keep its handover card for session C.

### Session C: Extend (about 55 minutes, Gemini)

1. Start a Gemini session and paste the handover card.
2. Send the module's **CONTEXT** prompt and answer its closing question ([sample](#context)).
3. Send the module's **DESIGN** prompt ([sample](#design-and-interview)). **INTERVIEW** is optional: do it in weeks with time to spare.
4. Send `DEBRIEF`. For each *Upgrades* line (at most two), open its link and find the sentence it relies on; if you cannot find it, send `VERIFY` with the line ([sample](#verify)). Copy into `Upgrades` only the lines whose sentence you have seen.

### Session D: Retain (about 40 minutes, NotebookLM; the phone app is fine)

1. **Quiz on last week's module** (this week's module in week 1).
   - At the top of `Weak links`, write the score you expect.
   - In the Studio panel, open **Quiz** and set: **Difficulty:** Hard; **Language:** English; **Sources:** last week's module files; **Topic box:** the Quiz prompt from Part 5 with that module's name.
   - Answer every question, click **Explain** on every wrong answer, then write the real score next to your prediction. A big gap means you feel surer than you are.
2. **Due flashcards.**
   - Copy every `Weak links` line whose due date has arrived.
   - Open **Flashcards** and set **Fewer** or **Standard**, **Hard**, **Text Only**, **English**; in the topic box paste the Flashcards prompt from Part 5 with those lines.
   - After the cards, update each line:

   | Your answer | New box | Next due |
   | --- | --- | --- |
   | Wrong | 1 | next week |
   | Right, line was in box 1 | 2 | in 2 weeks |
   | Right, line was in box 2 | 3 | in 4 weeks |
   | Right, line was in box 3 | — | delete the line: learned |
3. **Mixed drill (about 10 minutes).** Alternate week by week:
   - **NotebookLM:** tick **all** sources (still not *Chats from Gemini*), then send `CHAOS`.
   - **Gemini:** start a session and send `INCIDENT` with no topic.

   Mixing topics is what trains you to tell problems apart.

### Once a month (about 20 minutes)

1. Ask Claude Code to fold the lines in `Upgrades` into the docs, then clear the note.
2. Run the sync script and re-upload the `CHANGED` files (Part 1).

## Part 3: What each command looks like

**Commands are ordinary messages:** type them into the chat box and press Enter. They work because of the instructions you pasted in Part 1.
- **Answer in a few sentences of your own.** The AI grades the cause-and-effect links, not your wording, and you do not need exact command syntax.
- **Say how sure you are.** Start an answer with `sure:` or `guess:`. A wrong `sure:` answer is marked *Confident error*: it is the misconception most worth fixing, and the one you will fix fastest.
- **Stuck?** Send `hint` for a smaller leading question. Send `reveal` for the full answer to the current question.
- **A hard step?** Ask in Vietnamese: the AI explains in Vietnamese and keeps the technical terms and its questions in English.

| Command | Engine | What you get | Finished when |
| --- | --- | --- | --- |
| `TRACE: <event>` | NotebookLM | You narrate an event step by step; it asks what happens next | The chain reaches the end and it lists the links you missed |
| `PREDICT: <failure>` | NotebookLM | A named failure; you predict its effects before they are revealed | It has scored your prediction |
| `DIAGNOSE <topic>` | NotebookLM | A hidden failure; you investigate from the first symptom | You have named the root cause, the fix and the prevention |
| `CHAOS` | NotebookLM | `DIAGNOSE` on any topic, without saying which | As for `DIAGNOSE` |
| `INCIDENT: <symptom>` | Gemini | An incident drill at production scale | Root cause, mitigation, fix, prevention, and the link back to your docs |
| `CONTEXT: <topic>` | Gemini | A short, cited explanation of current practice | You have answered its closing question |
| `DESIGN: <brief>` | Gemini | A design exercise whose requirements keep changing | It compares your design with a reference design |
| `INTERVIEW: <topic>` | Gemini | A mock interview (optional) | Feedback: strengths, gaps, what to study next |
| `ANALOGY: <concept>` | Gemini | An analogy, a mapping table, two places it breaks (optional) | You have found a third break |
| `REVIEW` with a photo | Gemini | Questions that lead you to fix your own drawing (modules without a reference diagram) | Your drawing is right |
| `VERIFY <claim>` | Gemini | A verdict, with the official sentence quoted and linked | You have found that sentence on the page |
| `DEBRIEF` | Both | Confident errors, weak links, and gaps or upgrades, plus a ready handover card | |
| `HANDOVER …` | Both | The other engine starts from your weak links | |

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

> **You:** DIAGNOSE the control loop
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

`CHAOS` works the same way, but on any topic in the ticked sources.

### DEBRIEF

Send it at the end of every session. NotebookLM answers with three lists and a handover card:

> **Confident errors**
> - ReplicaSet controller -> creates the Pods because the scheduler only assigns existing Pods to nodes (box 1)
>
> **Weak links**
> - kubelet -> reports Pod status through the API server because no component talks to etcd directly (box 1)
>
> **Hand to Gemini**
> - How does a managed control plane such as EKS protect etcd?
>
> *(then the handover card, in a code block)*

Click **Save to note** under the reply, then copy the lines into your notes as session A step 7 describes. Gemini's `DEBRIEF` has *Upgrades* instead of *Hand to Gemini*: at most two lines, each with its source page.

### HANDOVER: switching engines

`DEBRIEF` prints the card. Fill in only the second line, the model in one sentence in your own words (a 30-second recall), and paste the card as the first message in the other engine:

```
HANDOVER from NotebookLM, Module 1: The control loop
Model in one sentence: Controllers watch the desired state stored through the API server and act until the actual state matches it.
Links I got wrong: ReplicaSet controller -> creates the Pods because the scheduler only assigns existing Pods to nodes
Open question: How does a managed control plane such as EKS protect etcd?
Next: INCIDENT: every deployment in the cluster suddenly fails, although all running Pods are healthy.
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

## Part 4: Modules

Each module block gives the mental model to build, the sources to tick, the **reference diagrams** to open in session A, the NotebookLM prompts (Audio, Trace, the Predict list, the Diagnose line) and the Gemini prompts. Copy a prompt by selecting the text inside its box. Part 2 says in which session each prompt is used.

**Where the reference diagrams are** (all under `~/Documents/Devops/K8s/`; open them in VS Code's Markdown preview):

| Short name | File |
| --- | --- |
| Theory | `documents/kubernetes-theory.md` |
| Lab 3 Overview | `documents/labs/lab-3-onprem-kubeadm-rancher/overview.md` |
| Lab 3 step 07 / 08 | `documents/labs/lab-3-onprem-kubeadm-rancher/steps/07-…` / `08-…` |
| Lab 1 network doc | `k8s_demo-networking/NETWORK_ARCHITECTURE.md` |
| Karpenter doc | `documents/eks-autoscaling-karpenter.md` |

### Module 1: The control loop

**Model:** You never start containers yourself. You write desired state to the API server, which stores it in etcd. Controllers and the scheduler watch that state and act to close the gap. On each node, the kubelet makes the decision real.

**NotebookLM sources:** `kubernetes-theory.md` (II–IV), `lab-3-overview.md`

**Reference diagrams:** Theory II *The big picture* (the cluster-architecture image and the "K8s Company" image); Theory III *Behind the scenes: `kubectl create deployment --image ...`*; Lab 3 Overview *What runs on each node*.

**NotebookLM:**
- **Audio (Deep Dive):**
  ```
  Follow one kubectl apply of a Deployment with 3 replicas from the API server to running containers. At each step say which component acts, what it reads and what it writes, and why only the API server talks to etcd. Then follow what happens when one of those Pods is deleted.
  ```
- **Trace:**
  ```
  TRACE: I run kubectl apply for a Deployment with 3 replicas (Theory sections II–IV). Then I delete one of its Pods. Then I change the image tag.
  ```
- **Predict:**
  - The kube-scheduler is stopped for 10 minutes while I scale a Deployment from 3 to 6 replicas.
  - The kube-controller-manager is stopped and a Pod of a Deployment is deleted.
  - The API server is unreachable for 10 minutes: what keeps serving user traffic, and what can no longer change?
  - A worker node is switched off while it runs one replica of a Deployment and one Pod of a DaemonSet.
  - A new node joins the cluster.
- Then `DIAGNOSE the control loop`.

**Gemini:**
```
ANALOGY: the Kubernetes control loop. Then stress-test the "K8s Company" analogy in my docs (Theory section II): where does it break?
```
```
INCIDENT: every deployment in the cluster suddenly fails, although all running Pods are healthy.
```
```
CONTEXT: what a managed control plane (EKS) takes off my hands compared with my kubeadm lab, and what EKS Auto Mode changes on top of that.
```
```
DESIGN: one EKS cluster shared by 5 teams that deploy their own services: who may change what, and how to stop one team from starving the others.
```
```
INTERVIEW: the declarative model and controllers versus imperative scripts; why a Deployment manages ReplicaSets instead of Pods; why node agents are DaemonSets.
```

**Done when:**
- you can draw kubectl → API server → etcd → controllers / scheduler → kubelet → container runtime from memory, with what each one reads and writes;
- you can say what still works when each control-plane component is down;
- you can say what a managed control plane changes about that.

### Module 2: Service networking inside the cluster

**Model:** A Service is a stable name and a virtual IP. CoreDNS turns the name into the IP. kube-proxy's rules on the sending node turn that IP into one Pod IP from the Service's endpoints. Readiness decides which Pods are in that list.

**NotebookLM sources:** `kubernetes-theory.md` (V parts 1–4, IX), `lab-3-overview.md`, `lab-1-app-network-architecture.md`

**Reference diagrams:** Theory V *1. NodePort* and *2. ClusterIP*; Lab 3 Overview *How a request travels*; Lab 1 network doc *CoreDNS Architecture* and *Layer 4 (Transport) - kube-proxy*.

**NotebookLM:**
- **Audio (Deep Dive):**
  ```
  Explain how one Pod reaches another through a Service: the DNS lookup through CoreDNS, the ClusterIP, the rules kube-proxy writes on the sending node, the endpoints list, and how readiness probes add Pods to it and remove them. Use the on-prem lab's frontend → backend → MySQL calls as the running example, including where DNAT and SNAT happen and why.
  ```
- **Trace:**
  ```
  TRACE: On the on-prem cluster (lab-3-overview), the frontend Pod's nginx forwards /api/products to http://ecommerce-backend:8080, and the backend then queries MySQL. Make me name every address change and the node where it happens.
  ```
- **Predict:**
  - kube-proxy stops on one node.
  - Every CoreDNS Pod is down.
  - A Service's selector has a typo in one label.
  - The readiness probe starts failing on one of the two backend Pods.
  - A request enters a NodePort on a node that does not run the target Pod (`externalTrafficPolicy: Cluster`): what source IP does the Pod see, and why?
- Then `DIAGNOSE Service networking`.

**Gemini:**
```
ANALOGY: a Kubernetes Service, with its DNS name, ClusterIP, kube-proxy rules and endpoints.
```
```
INCIDENT: intermittent timeouts between services on a busy EKS cluster.
```
```
CONTEXT: kube-proxy modes (iptables, IPVS, nftables) and eBPF-based replacements such as Cilium; and how the Amazon VPC CNI gives Pods VPC IP addresses, compared with Calico IPIP in my on-prem lab.
```
```
DESIGN: service-to-service traffic for 40 microservices that need mTLS, retries and per-service metrics: is a service mesh worth it?
```
```
INTERVIEW: service discovery through DNS versus environment variables; ClusterIP versus headless Services for a database; why a Pod's own IP is never used as a stable address.
```

**Done when:**
- you can trace a Pod → Service → Pod call and name the node where each address change happens;
- you can explain why a not-ready Pod gets no traffic but keeps running;
- you can say how EKS networking differs from your on-prem lab.

### Module 3: The edge, getting traffic into the cluster

**Model:** Something outside the cluster must forward traffic to something inside it. There are two designs:
- a cloud load balancer sends straight to Pod IPs (AWS Load Balancer Controller);
- your own proxy sends to a NodePort, and a controller inside the cluster routes from there.

In both, the component that **configures** the path is not a hop **on** the path.

**NotebookLM sources:** `kubernetes-theory.md` (V part 5), `lab-1-eks-alb-ingress-irsa.md`, `lab-1-app-network-architecture.md`, `lab-2-kops-ingress-nginx-alb.md`, `lab-3-overview.md`, `lab-3-step-05-ingress-nodeport-reverse-proxy.md`

**Reference diagrams:** Theory V *What is Ingress?*, *Why on-prem uses NodePort but cloud uses LoadBalancer* and *ALB Ingress Controller on AWS*; Lab 1 network doc *External User Request Flow* and *How the ALB Gets Its Rules (Control Plane, Not a Hop)*; Lab 3 Overview *Servers and networks*.

**NotebookLM:**
- **Audio (Deep Dive):**
  ```
  Compare how a user request enters the cluster in the three labs: Lab 1 (ALB managed by the AWS Load Balancer Controller, sending to Pod IPs), Lab 2 (a hand-made ALB in front of ingress-nginx on a NodePort) and Lab 3 (an external nginx in front of ingress-nginx on a NodePort). For each, name every hop and who configures it.
  ```
- **Trace:**
  ```
  TRACE: One user request to the app, first on EKS (Lab 1), then on-prem (Lab 3), from the browser to a backend Pod. For each hop make me name who forwards it, the source and destination after the hop, and who configured that hop.
  ```
- **Predict:**
  - The AWS Load Balancer Controller Pod crashes: does traffic through the existing ALB stop?
  - The ingress-nginx controller Pod is deleted on the on-prem cluster.
  - An Ingress is created without a matching ingress class.
  - The on-prem nginx-lb still lists a node that has been switched off.
  - On EKS, a backend Pod fails its readiness probe while it is an ALB target.
- Then `DIAGNOSE the edge`.

**Gemini:**
```
ANALOGY: the edge: external load balancer, NodePort and Ingress controller.
```
```
INCIDENT: users get 502 errors from the ALB for about 30 seconds during every deployment on EKS.
```
```
CONTEXT: ingress-nginx is retired. Gateway API, which implementations support it on EKS and on-prem, and what migrating my Lab 3 edge would involve.
```
```
DESIGN: one EKS edge for 3 teams with TLS everywhere, a WAF and per-team hostnames: one ALB or several, and who owns which part?
```
```
INTERVIEW: why on-prem uses NodePort while cloud uses LoadBalancer; why a ClusterIP Service is enough behind an ALB in IP mode; how you would replace a retired ingress controller without downtime.
```

**Done when:**
- you can draw the three edges side by side and point to where each one loses the client IP;
- you can say which failures stop new configuration and which stop traffic;
- you can say what a Gateway API migration changes.

### Module 4: State, where the data lives

**Model:** Pods are disposable; data survives only in volumes whose lifecycle is separate from Pods:
- a PVC asks for storage;
- a PV is bound to it, either created by an admin or provisioned through a StorageClass;
- the CSI driver attaches and mounts it on the node;
- a StatefulSet keeps each Pod's identity tied to its own PVC.

**NotebookLM sources:** `kubernetes-theory.md` (VI–VII), `lab-3-step-08-nfs-storage-statefulset-database.md`, `lab-1-app-network-architecture.md`, `kubernetes-misconfigurations.md`

**Reference diagrams:** Theory VI *Persistent Volumes (PV)* and *Persistent Volume Claims (PVC)*; Lab 1 network doc *Volume Binding Flow*; Lab 3 step 08, the diagram at the top.

**NotebookLM:**
- **Audio (Deep Dive):**
  ```
  Follow the database's data through its life: the PVC created from the StatefulSet's template, how a PV is bound, where the bytes physically live (NFS on-prem, EBS or EFS on AWS), and what happens to them when the Pod is rescheduled, when the StatefulSet is deleted, and when the PVC is deleted.
  ```
- **Trace:**
  ```
  TRACE: I apply the MySQL StatefulSet with a volumeClaimTemplate on the on-prem cluster (lab-3-step-08). Continue until the first row is written to disk on the NFS server. Then the Pod is deleted and comes back.
  ```
- **Predict:**
  - The PVC stays Pending.
  - The node that runs a Pod with an EBS volume dies and the only free node is in another Availability Zone.
  - Someone deletes a PVC whose StorageClass has `reclaimPolicy: Delete`.
  - The NFS server reboots while MySQL is writing.
  - The MySQL StatefulSet is scaled from 1 to 3 replicas, expecting a replicated database.
- Then `DIAGNOSE storage`.

**Gemini:**
```
ANALOGY: PV, PVC, StorageClass and a StatefulSet's stable identity.
```
```
INCIDENT: after a node failure on EKS, the replacement database Pod has been stuck in ContainerCreating for 10 minutes.
```
```
CONTEXT: running databases on Kubernetes today: the EBS CSI driver and volume snapshots, database operators such as CloudNativePG, versus RDS or Aurora. What teams choose, and why.
```
```
DESIGN: PostgreSQL for an e-commerce product that may lose at most 5 minutes of data and must be back within 30 minutes: on EKS or on RDS?
```
```
INTERVIEW: a database in a StatefulSet versus a managed database; EBS versus EFS for this app; static versus dynamic provisioning.
```

**Done when:**
- you can say which object owns the data at each step;
- you can list the exact conditions under which data is lost;
- you can defend where you would run the database in production.

### Module 5: Health and scaling feedback loops

**Model:** Several feedback loops hang together:
- probes decide between "restart it" (liveness) and "send it no traffic" (readiness);
- metrics-server feeds the HPA, which changes the replica count;
- Pods that cannot be scheduled make Karpenter add nodes, and its consolidation removes them later;
- resource requests connect all of these loops.

**NotebookLM sources:** `kubernetes-theory.md` (VIII–X), `eks-autoscaling-karpenter.md`, `kubernetes-misconfigurations.md`, `lab-3-step-07-autoscaling-hpa.md`

**Reference diagrams:** Theory IX *What is a Liveness Probe?* and X *How it works*; Karpenter doc, the diagram under *Luồng hoạt động*; Lab 3 step 07, the diagram at the top.

**NotebookLM:**
- **Audio (Deep Dive):**
  ```
  Explain the chain from rising traffic to new nodes and back: CPU usage measured against requests, the HPA's calculation, new Pods, readiness gating traffic, Pods that cannot be scheduled, Karpenter launching a node, and consolidation removing it later. Point out where each misconfiguration in the sources breaks the chain.
  ```
- **Trace:**
  ```
  TRACE: Traffic to the backend triples on EKS. Continue until a new node serves traffic, then until traffic drops and the extra capacity is removed.
  ```
- **Predict:**
  - The liveness probe checks the database, and the database becomes slow.
  - A Deployment has no CPU requests, and an HPA targets 70% CPU.
  - metrics-server is down.
  - New Pods spike their CPU while starting up.
  - A Pod requests more memory than any node offers after the kubelet's reservations.
- Then `DIAGNOSE health and scaling`.

**Gemini:**
```
ANALOGY: probes, the HPA and Karpenter as one system.
```
```
INCIDENT: during a flash sale the HPA scales the backend out, but the error rate stays high for 5 minutes before the system recovers.
```
```
CONTEXT: autoscaling beyond CPU-based HPA: KEDA, VPA, Karpenter disruption budgets and EKS Auto Mode. What to use when.
```
```
DESIGN: autoscaling for a flash sale with a known start time and 20 times normal traffic.
```
```
INTERVIEW: liveness versus readiness when a dependency fails; Cluster Autoscaler versus Karpenter; how to stop the HPA from flapping.
```

**Done when:**
- you can walk the whole chain from more traffic to more nodes and back, and place each misconfiguration on it;
- you can plan capacity for a known traffic spike.

### Module 6: Identity and access on EKS

**Model:** Two identity systems meet:
- **People:** IAM users and roles get into the cluster through access entries (or the older aws-auth ConfigMap).
- **Pods:** Pods get AWS permissions through IRSA. A service account is linked to an IAM role, the role trusts the cluster's OIDC provider, and the Pod exchanges its token for temporary credentials.

**NotebookLM sources:** `lab-1-eks-alb-ingress-irsa.md`, `eks-autoscaling-karpenter.md`, `kubernetes-misconfigurations.md`

**Reference diagrams:** none in the docs yet. In session A, replace the comparison with Gemini `REVIEW`, and add "IRSA and access-entry diagram for Lab 1" to `Gaps`.

**NotebookLM:**
- **Audio (Deep Dive):**
  ```
  Explain how the AWS Load Balancer Controller Pod gets permission to create an ALB: the service account, the OIDC provider, the IAM role's trust policy and the token exchange. Then explain how a new IAM user gets kubectl access to the cluster, and why AWS permissions alone are not enough.
  ```
- **Trace:**
  ```
  TRACE: The AWS Load Balancer Controller Pod starts and must call the AWS API to create an ALB for a new Ingress. Then a new IAM user runs kubectl get pods for the first time.
  ```
- **Predict:**
  - The IAM role's trust policy names the wrong service account.
  - The cluster's OIDC provider was never associated with IAM.
  - A new IAM user has AdministratorAccess in AWS but no access entry.
  - Pods get AWS permissions from the node's instance role instead of IRSA.
  - An app's database password is stored only as a base64 Kubernetes Secret in Git.
- Then `DIAGNOSE identity on EKS`.

**Gemini:**
```
ANALOGY: IAM, access entries, Kubernetes RBAC and IRSA as one identity system.
```
```
INCIDENT: after a change to the cluster's access configuration, half the platform team gets Unauthorized from kubectl, and a controller starts failing with AccessDenied.
```
```
CONTEXT: EKS Pod Identity versus IRSA, and access entries versus the aws-auth ConfigMap: what changed, why, and how to migrate.
```
```
DESIGN: access for 3 teams and 10 controllers on one EKS cluster, with least privilege and an audit trail.
```
```
INTERVIEW: IRSA versus the node instance role; External Secrets with AWS Secrets Manager versus Kubernetes Secrets; least privilege for controllers such as Karpenter.
```

**Done when:**
- you can trace both identity paths (person → cluster and Pod → AWS) and say which component rejects the request in each misconfiguration;
- you can say what Pod Identity changes.

### Not covered yet

- **XI. Monitoring & Administration, and Lab 3 step 09.** Theory XI is a skeleton you will extend with newer tools. To research them, run Gemini `CONTEXT` (and Deep Research) on observability and backup for EKS, starting from what Lab 3 step 09 used. Verify the findings, write XI, then add a Module 7 here.
- **XII Kops/EKS provisioning, XIV kubectl appendix, Lab 3 steps 01–04 and 06.** These are installation procedures and commands, better practised in a terminal than in a chat.

## Part 5: Tools: what to use, what to skip, and prompts

Every feature of both apps was rated on four questions: does it make you *retrieve, produce or decide*; is it *accurate* (grounded or checkable); does it do something *no other tool here* does better; and is it *cheap* in minutes and clicks? Core tools are in every week; optional ones have a trigger; the rest are left out on purpose.

| Engine | Tool | Use | When | Why |
| --- | --- | --- | --- | --- |
| NotebookLM | Chat with Custom instructions (length Default) | Core | Sessions A, B, D | The only tool that keeps asking "why?" and grades your reasoning |
| NotebookLM | Citations | Core | Whenever a grade surprises you | Your check on the AI: click the number and read the passage |
| NotebookLM | Audio Overview: Deep Dive, Short | Core | Session A, with the reference diagram open | A worked example; narration with a diagram teaches more than either alone |
| NotebookLM | Join (while the audio plays) | Optional | One hop confuses you | |
| NotebookLM | Notes, Save to note | Core | End of every session | `Weak links` is your only progress record |
| NotebookLM | Quiz + Explain | Core | Session D, last week's module | Delayed, scenario-based retrieval; predicted vs actual score |
| NotebookLM | Flashcards + Explain | Core | Session D, due lines only | Spaced retrieval of your weak links |
| NotebookLM | Delete chat history | Optional | Start of a new module | A clean thread; save `DEBRIEF` first |
| NotebookLM | Data Table | Optional, once | After Module 5 | Failure matrix: fill yours on paper first, then compare |
| NotebookLM | Mobile app | Optional | Due flashcards on the go | No scores are kept: update `Weak links` yourself |
| NotebookLM | Mind Map | Skip | | A topic tree without causal arrows; the docs' diagrams show the flow |
| NotebookLM | Audio Brief, Critique, Debate | Skip | | Passive; `DESIGN` practises trade-offs actively |
| NotebookLM | Learning Guide preset | Skip | | Your Custom instructions replace it, with the four question types |
| NotebookLM | Reports, Slide Deck | Skip | | Made for reading or presenting, not for retrieval |
| NotebookLM | Video Overview, Infographic | Never | | Passive, and AI-drawn pictures can contradict your verified diagrams |
| NotebookLM | Search the web for new sources (Fast / Deep Research) | Never in this notebook | | Imports unchecked web pages into the closed world; ask Gemini instead |
| Gemini | Gem with instructions only, notebook attached in each chat | Core | Sessions B, C | One mentor persona, reusable for the next subject |
| Gemini | Deep Research | Optional | At most twice in the course: Theory XI, and the start of AWS | Long cited reports; check every Upgrade's source yourself |
| Gemini | Photo upload (`REVIEW`) | Optional | Module 6 only | Feedback on your drawing where the docs have no diagram |
| Gemini | Canvas | Skip | | An AI redraw competes with your verified diagrams |
| Gemini | Guided Learning; quizzes and flashcards in chat | Skip | | A second tutor without your rules; not grounded, no progress kept |
| Gemini | Gemini Live | Skip | | Good for spoken interview practice, which is not your goal now |
| Gemini | Scheduled actions | Skip | | Cannot read `Weak links`; a repeating calendar event is enough |
| Gemini | Notebooks inside Gemini | Skip | | Hidden memory and a third set of instructions to maintain |

**Data Table** (NotebookLM, all sources):
```
One row per component described in the sources: API server, etcd, scheduler, controller manager, kubelet, kube-proxy, CoreDNS, ingress controller, AWS Load Balancer Controller, metrics-server, HPA, Karpenter, CSI driver.
Columns: what it decides; what state it reads and writes; the first symptom if it stops; what keeps working; how to confirm it is the cause.
Use only facts from the sources; write "not in sources" where they are silent.
```

**Quiz** (session D; Difficulty: Hard; last week's module's sources):
```
Module: <module name and Theory sections>.
Every question must be a scenario in a running cluster: a symptom or a change, and the answer is the cause, the next diagnostic step, or the predicted effect. Wrong options must be plausible misdiagnoses, not obviously wrong answers.
Never ask what something is, what it stands for, its default value, or which command or flag does something. Never ask me to recall IPs, names or ports.
```

**Flashcards** (session D; Fewer or Standard, Hard, Text Only; the sources the lines came from):
```
Make cards only from these weak links, which are due today:
<paste the due lines from the Weak links note>
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
2. **The docs age.** They come from a pre-AI course, and parts are already outdated (ingress-nginx is retired). Only an open-world engine can say what changed.
3. **Disagreement is useful.** When the engines disagree, resolving it forces you to reason from mechanisms. That is the skill you are building.

**What needs guarding, and the rule this guide uses for each:**

| Risk | Rule |
| --- | --- |
| NotebookLM *reduces* hallucination but does not remove it. It can misread a passage, and it reads ASCII diagrams as plain text | Click the citation behind anything surprising; look at the docs' diagrams yourself |
| Gemini can be confidently wrong, especially about versions, deprecations and limits | It labels every claim; `VERIFY` quotes the official sentence and you open the link to find it. A model rechecking its own claim is not verification |
| Unchecked material entering the closed world: web research results, *Chats from Gemini* | Never use *Search the web* in the study notebook; keep *Chats from Gemini* unticked in every source picker |
| AI-drawn visuals (Video, Infographic, Canvas) can contradict your verified diagrams | Draw your own, then compare it with the docs' diagrams |
| Analogies mislead beginners when only the similarities are shown | Every analogy comes with a mapping table and two breaking points, and you find a third |
| Switching engines mid-thought costs attention | Switch only between steps, with the handover card that `DEBRIEF` prints |
| An open-world engine invites passive reading | Gemini asks before it tells. `CONTEXT` is the only explaining mode, and it ends with a question |
| Nothing tracks what you got wrong, so weak links pile up and are never retested | Boxes and due dates in `Weak links`; session D reviews what is due |

**Why each command sits where it does:**
- `TRACE`, `PREDICT` and lab-scale `DIAGNOSE` must match your labs exactly, so they run in NotebookLM.
- `INCIDENT`, `CONTEXT`, `DESIGN` and `INTERVIEW` need knowledge beyond your docs, so they run in Gemini.
- Pictures come from the docs' verified diagrams, after you have drawn your own. `REVIEW` covers only modules without one.

### The method

#### Four kinds of question

Both engines use the same four question types. Each one connects at least two components:

| Question | What you must explain | Example |
| --- | --- | --- |
| **Who decides?** | Which component acts, what state it reads or writes, what triggers it | You delete a Pod of a Deployment: which component notices, and how? |
| **What is the path?** | Every hop, and what changes at each one (address, identity, state) | Trace a request from the ALB to the database: where does the destination change? |
| **What if it fails?** | What breaks, what keeps working, the blast radius, how you would prove it | kube-proxy stops on one node: which traffic breaks, and which does not? |
| **Why this design?** | The alternative, and what the choice costs | Why does the on-prem cluster use nginx in front of a NodePort instead of a LoadBalancer Service? |

One distinction runs through all of them: **the control plane decides, the data plane carries traffic.** Most good failure questions come down to "which of the two did this break?"

#### How the week maps to the five phases

| Phase | Session | What you do | What it builds |
| --- | --- | --- | --- |
| **1. Model** | A | Sketch first, listen with the reference diagram open, redraw, compare | An accurate picture of the mechanism |
| **2. Trace** | A | `TRACE` | The causal chain, step by step |
| **3. Break** | B | `PREDICT`, `DIAGNOSE`, then `INCIDENT` | Reasoning from cause to effect and back, at lab and production scale |
| **4. Extend** | C | `CONTEXT`, `DESIGN` (`INTERVIEW`) | Transfer to current practice and to new designs |
| **5. Retain** | D, and the redraw at the start of every session A | Quiz on last week, due flashcards, mixed drill | Durable memory, and an honest sense of what you know |

#### Reconciling: how outside knowledge enters the docs

| Note | Filled by | What goes in | Where it goes next |
| --- | --- | --- | --- |
| `Weak links` | Both engines' `DEBRIEF`, and your redraw comparisons | `A -> B because C (box n, due date)`; confident errors first, marked `!` | Session D, when due |
| `Gaps` | NotebookLM's *Hand to Gemini* list | Questions your docs cannot answer | Gemini, as `CONTEXT` or `INCIDENT` |
| `Upgrades` | Gemini's `DEBRIEF`, once you have seen the quoted sentence | At most two per module: `fact [Current practice, page, date, link]` | Once a month into the docs; then `~/Documents/Devops/K8s/documents/scripts/sync-notebooklm.sh` and re-upload the `CHANGED` files |

After that, NotebookLM can test you on the new knowledge too: the open world has become part of the closed world.

**When the engines disagree:**
- **About your lab:** the docs win, unless an official source shows the doc is wrong. Then fix the doc.
- **About the world** (current versions, current practice): a cited, dated official source wins (kubernetes.io, docs.aws.amazon.com, the project's own docs). Blog posts do not count.
- **Still unresolved:** put it in `Gaps`. Asking each engine to explain the other's answer is often the fastest way to the real mechanism.

#### Why this works

- **Experts organise knowledge by causal principles; novices by surface features** (Chi, Feltovich & Glaser, 1981). The four question types force the causal organisation.
- **You get better at what you retrieve** (testing effect: Roediger & Karpicke, 2006). So retrieve causal chains, not definitions.
- **Guessing before learning primes it** (pretesting: Richland, Kornell & Kao, 2009): the 2-minute sketch in session A.
- **Narration plus a diagram beats either alone** (modality effect: Mousavi, Low & Sweller, 1995): the audio with the reference diagram open.
- **Explaining each step to yourself builds understanding** (self-explanation effect: Chi et al., 1989): `TRACE`.
- **Worked examples first, problems after** (expertise reversal effect: Kalyuga et al., 2003): the audio, then `PREDICT`, `DIAGNOSE` and `INCIDENT`.
- **Predict, then observe, then explain** (White & Gunstone, 1992). Predicting before seeing the answer exposes wrong models that rereading hides.
- **Comparing cases builds transferable ideas** (analogical encoding: Gentner, Loewenstein & Thompson, 2003): your lab against current practice in `CONTEXT` and `DESIGN`.
- **Spaced, repeated retrieval makes memory last** (Cepeda et al., 2006; successive relearning: Rawson & Dunlosky, 2011), and dropping an item after one correct recall hurts retention (Karpicke & Roediger, 2008): the boxes and due dates.
- **Errors made with high confidence are the ones corrected best** (hypercorrection: Butterfield & Metcalfe, 2001): `sure:` and *Confident errors*.
- **Smooth explanations make you overconfident** (Dunlosky & Rawson, 2012), and **judgements made after a delay are accurate** (Nelson & Dunlosky, 1991): the predicted quiz score and next week's blank redraw.
- **Mixing topics teaches you to tell problems apart** (interleaving: Rohrer & Taylor, 2007): the weekly mixed drill and the quiz on last week's module.

### Real practice

**A real failure teaches more than a simulated one.** When a `PREDICT` scenario only needs a single-node cluster, reproduce it on minikube and compare what you see with what you predicted. Theory sections V and VI have minikube walkthroughs to start from.

## Appendix A: NotebookLM instructions

Paste this into **⋮** → **Configure Chat** → **Custom** (Part 1).

```
You are my study partner: a senior Kubernetes and AWS engineer. Your goal is to build my exact mental model of the system described in the sources: a set of components that act on shared state and forward traffic. Do not test my vocabulary. Reply in English.

QUESTION RULES (apply to every question you ask)
1. Never ask definition or recall questions. Banned: "What is X?", "Define X", "What does X stand for?", "List the components of X", "What is the default value of X?", "Which command or flag does X?", and anything answerable with one term or one sentence copied from the sources.
2. Every question must connect at least two components and be one of four types:
   - WHO DECIDES: which component acts, what state it reads or writes, what triggers it.
   - THE PATH: each hop a request or an object goes through, and what changes at each hop (address, identity, state).
   - FAILURE: what breaks, what keeps working, the blast radius, and how I would prove it.
   - DESIGN: why the sources chose this design instead of a named alternative, and what it costs.
3. Ask one question, then stop and wait for my answer. Keep your turns under 120 words, except summaries.
4. Never give the answer before I have tried. If I write "hint", ask a smaller leading question. Give the full answer only if I write "reveal".
5. After each answer: mark it Correct, Partly correct or Wrong; name the exact link in the causal chain that is missing or wrong; cite the source. Then go one level deeper ("and then?", "why there and not earlier?", "what if that fails too?").
6. Scenarios may show names, IPs and ports from the labs, but never ask me to recall them.
7. Stay inside the sources. If you reason beyond them, start that part with "Inference:". If a question needs knowledge the sources do not have (other designs, newer versions, production scale), do not answer it: write "Hand to Gemini:" followed by the question, so I can take it there.
8. If my message starts with HANDOVER, aim your first questions at the links I got wrong and the open question in it.
9. If I start an answer with "sure:" and any part of it is wrong, mark that part "Confident error". "guess:" means I am unsure.
10. If I write in Vietnamese, explain in Vietnamese, but keep technical terms and your questions in English.

MODES (my message starts with one keyword)
TRACE <event>: I narrate what happens step by step. After each step ask what happens next and which component does it, and make me say what changes at that hop. When the chain is complete, summarise it as numbered steps and list the links I missed.
PREDICT <failure>: Before revealing anything, ask me to predict: what breaks immediately, what keeps working, what breaks later, and what users see. Then reveal the real chain of effects with citations and score my prediction link by link.
DIAGNOSE <topic>: Choose a failure from the mechanisms in the sources but do not tell me what it is. Give only the first symptom, as an alert or a user report. I ask for evidence (kubectl get/describe/logs/events, metrics, curl); answer each request with realistic output consistent with the hidden failure. When I name the root cause, score my investigation (did I check the right layer first? what would have been faster?), then ask for the fix and how to prevent it.
CHAOS: Like DIAGNOSE, but pick the failure from any topic in the selected sources and do not tell me which topic it belongs to.
DEBRIEF: Give three lists. "Confident errors": links I got wrong in answers I started with "sure:". "Weak links": every other causal link I got wrong or missed in this conversation. Write each as one line: "A -> B because C (box 1)". "Hand to Gemini": every question from this conversation that the sources could not answer. Then print, in a code block, a five-line handover card: "HANDOVER from NotebookLM, Module <n>: <name>", "Model in one sentence:" (leave it empty for me), "Links I got wrong: <confident errors first>", "Open question: <the most important Hand to Gemini question>", "Next: <the Gemini mode and topic to run next>".
```

## Appendix B: Gemini instructions

Paste this into the Gem's **Instructions** (Part 1).

```
You are my mentor: a senior cloud architect who has run Kubernetes in production on AWS and on-premises. I am a DevOps engineer who works mainly on AWS EKS. The attached NotebookLM notebook holds my study docs and lab write-ups: treat it as "my system", the baseline every comparison starts from. Your job is to connect that system to the rest of the world: other designs, production scale, current practice, AWS services, and ideas from other domains. Reply in English.

SOURCES AND HONESTY
1. Label every substantive claim: [My docs] when it comes from the notebook; [Source: title, date] with a link when it comes from the web; [Experience] for common practice without a specific source; [Inference] for your own reasoning.
2. For anything that depends on a version, a date or a limit (versions, deprecations, quotas, prices, feature status), search the web and cite official documentation (kubernetes.io, docs.aws.amazon.com, the project's own docs) with its date. If you cannot verify it, say so. Never invent version numbers or limits.
3. When current practice differs from my docs, write "Changed since your docs:" and explain what changed and why.

TEACHING RULES
4. Ask before telling. In every mode except CONTEXT, ask one question at a time and wait for my answer. If I write "hint", ask a smaller leading question; give the full answer only if I write "reveal".
5. Never ask definition questions ("What is X?", "Define X", "List the ...", default values, command flags). Every question must connect components and be about who decides, the path, failure, or a design trade-off.
6. After each answer: mark it Correct, Partly correct or Wrong, name the missing causal link, then go one level deeper.
7. If my message starts with HANDOVER, aim your first questions at the links I got wrong and the open question in it.
8. If I start an answer with "sure:" and any part of it is wrong, mark that part "Confident error". "guess:" means I am unsure.
9. If I write in Vietnamese, explain in Vietnamese, but keep technical terms and your questions in English.

MODES (my message starts with one keyword)
ANALOGY <concept>: Give one analogy from outside Kubernetes (everyday life, or a system I already know such as Linux or AWS). Show the mapping as a table: analogy element -> Kubernetes element. Then name two places where the analogy breaks and the misconception each break could cause. Then ask me to find a third break.
REVIEW: I upload a photo of my diagram. Do not redraw it yet. First say what is correct, then ask questions, one at a time, that lead me to the missing or wrong components and links. Only after I have fixed it, show your version as an ASCII diagram with numbered steps, and point out where it differs from my docs.
CONTEXT <topic>: Explain how this is done in production today compared with my docs: the alternatives, what changed and why, what teams usually choose, and the trade-offs. Cite sources. Stay under 400 words. End with one question that makes me compare my lab with current practice.
INCIDENT <topic>: Run an on-call incident drill at production scale on AWS (several Availability Zones, many nodes, real AWS controllers and limits). Do not reveal the cause. Give the first alert or user report; I ask for evidence (kubectl, CloudWatch, ALB metrics, flow logs, events); answer with realistic output consistent with the hidden cause. When I name the root cause, score my investigation, then ask for the mitigation now, the permanent fix, and prevention. Then link it back to the mechanism in my docs. Without a topic, pick any area.
DESIGN <brief>: Expand the brief into realistic requirements (traffic, team size, budget, compliance). I propose a design; challenge it with one new requirement at a time (10x traffic, a zone outage, a security review, a cost cut). Make me justify each choice against at least one alternative. End by comparing my design with a reference design and naming the trade-offs.
INTERVIEW <topic>: Act as a senior DevOps/SRE interviewer. Mix questions about my labs with production scenarios. Follow up on trade-offs, failure modes, security and cost, and challenge me at least once even when I am right. End with feedback: strengths, gaps, and what to study next.
VERIFY <claim>: Check the claim against official documentation and my docs. Answer True, Partly true, False or Outdated. Quote the exact sentence from the official page that decides it, with the page title, date and link, so I can find it myself. If no official page says it, answer "Unverified". Then give the corrected statement.
DEBRIEF: Give three lists. "Confident errors" and "Weak links", one line each: "A -> B because C (box 1)". "Upgrades": at most two facts from outside my docs worth adding to them, each as "<fact> [Current practice, <page title>, <date>, <link>]". Then print a handover card in a code block, in the same five-line format as the HANDOVER card I sent you, from Gemini, with "Model in one sentence:" left empty for me.
```
