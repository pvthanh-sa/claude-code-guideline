# Dual-Engine Study Guide

How to master Kubernetes and EKS as a system with two AI engines that do different jobs:

| Engine | World | Truth comes from | It answers |
| --- | --- | --- | --- |
| **NotebookLM**: the closed-world tutor | Only these docs | The 16 uploaded files, with citations | *How does **my** system work, and why did it behave that way?* |
| **Gemini**: the open-world mentor | These docs **and** the world | The same notebook attached, plus web sources it cites | *How does **the world** do this, what is it like, and what changes at scale?* |

**Routing rule:**
- If the answer should be in your docs, ask **NotebookLM**.
- If it needs anything outside them (an alternative design, production scale, a newer version, an AWS service, another domain), ask **Gemini**.

Your docs stay the single source of truth. Gemini's verified findings flow back into them, and then NotebookLM can test you on them too.

The docs live in `~/Documents/Devops/K8s/documents/`. This guide lives with the `dual-engine-study` Claude Code skill, as its worked example, and is not uploaded to NotebookLM.

## Why two engines

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
| NotebookLM *reduces* hallucination but does not remove it. It can misread a passage, and it reads the ASCII diagrams as plain text | Click the citation behind anything surprising |
| Gemini can be confidently wrong, especially about versions, deprecations and AWS limits | It must label every claim (`[My docs]`, `[Source: …]`, `[Experience]`, `[Inference]`) and cite official docs with dates. `VERIFY` checks a claim before you keep it |
| Analogies mislead beginners when only the similarities are shown | Every analogy comes with a mapping table and its breaking points, and you must find one more break yourself |
| Switching engines mid-thought costs attention | Switch only **between phases**, carrying a [handover card](#handover-between-engines) |
| An open-world engine tempts you into passive reading | Gemini also asks before it tells. `CONTEXT` is the only explaining mode, and it ends with a question |

**How the proposed split was adjusted:**
- **`TRACE` and lab-scale `DIAGNOSE` stay in NotebookLM**, because they must match your labs exactly.
- **`INTERVIEW` moves to Gemini**, because interviews test transfer to systems you have not built.
- **A new `INCIDENT` mode in Gemini** handles production-scale failures. Your docs barely cover these (no CrashLoopBackOff, no ImagePullBackOff, no NotReady node).
- **Visualisation is part of `REVIEW`, not its own mode.** Seeing a finished diagram before drawing your own removes the benefit of drawing it.

## The method

### Four kinds of question

Both engines use the same four question types. Each one connects at least two components:

| Question | What you must explain | Example |
| --- | --- | --- |
| **Who decides?** | Which component acts, what state it reads or writes, what triggers it | You delete a Pod of a Deployment: which component notices, and how? |
| **What is the path?** | Every hop, and what changes at each one (address, identity, state) | Trace a request from the ALB to the database: where does the destination change? |
| **What if it fails?** | What breaks, what keeps working, the blast radius, how you would prove it | kube-proxy stops on one node: which traffic breaks, and which does not? |
| **Why this design?** | The alternative, and what the choice costs | Why does the on-prem cluster use nginx in front of a NodePort instead of a LoadBalancer Service? |

One distinction runs through all of them: **the control plane decides, the data plane carries traffic.** Most good failure questions come down to "which of the two did this break?"

### The loop for each module

Each module first builds an exact model of your own system in the closed world, then varies and stresses it in the open world:

| Phase | Engine | Mode or tool | What you do | Done when |
| --- | --- | --- | --- | --- |
| **1. Model** | NotebookLM | Audio Overview (Deep Dive) | Listen to the module story, then **draw the model on paper from memory** | You have a drawing |
| | Gemini | `REVIEW`, then `ANALOGY` | Upload a photo of the drawing and fix it through questions; then stress-test the model with an analogy and its breaks | You can redraw it correctly without help |
| **2. Trace** | NotebookLM | `TRACE` | Narrate an event hop by hop; the AI only asks "what next, and who does it?" | You trace start to finish without hints |
| **3. Break** | NotebookLM | `PREDICT`, then `DIAGNOSE` | Predict the effects of named failures, then investigate a hidden one, at lab scale | 3 predictions and 2 diagnoses, including the blast radius |
| | Gemini | `INCIDENT` | The same mechanisms at production scale on AWS | You find the root cause and link it back to your docs |
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

**Switch engines only at phase boundaries.** End the session with `DEBRIEF`, then open the other engine with a handover card as your first message:

```
HANDOVER from <NotebookLM | Gemini>, Module <n>: <name>
Model in one sentence: <your own words>
Links I got wrong: <lines from DEBRIEF>
Open question: <one question the last session left open>
Next: <MODE> <topic>
```

Both engines' instructions tell them to aim their first questions at the links you got wrong.

### Reconciling: how outside knowledge enters the docs

Three notes in NotebookLM (Studio → **Add note**) carry knowledge between the engines and back into the docs:

| Note | Filled by | What goes in | Where it goes next |
| --- | --- | --- | --- |
| `Weak links` | Both engines' `DEBRIEF` | Causal links you got wrong, as `A → B because C` | Quiz and Flashcards a few days later |
| `Gaps` | NotebookLM (`Hand to Gemini:` lines) | Questions your docs cannot answer | Gemini, as `CONTEXT` or `INCIDENT` |
| `Upgrades` | Gemini's `DEBRIEF`, after `VERIFY` | Facts from outside the docs, each with an official source and date | The docs: fold them into the right Theory section (ask Claude Code if you like), run `~/Documents/Devops/K8s/documents/scripts/sync-notebooklm.sh`, re-upload the `CHANGED` files |

After that, NotebookLM can test you on the new knowledge too: the open world has become part of the closed world.

**When the engines disagree:**
- **About your lab** (what your cluster does): the docs win, unless an official source shows the doc is wrong. Then fix the doc.
- **About the world** (current versions, current practice): a cited, dated official source wins (kubernetes.io, docs.aws.amazon.com, the project's own docs). Blog posts do not count.
- **Still unresolved:** put it in `Gaps`. Asking each engine to explain the other's answer is often the fastest way to the real mechanism.

### Why this works

- **Experts organise knowledge by causal principles; novices by surface features** (Chi, Feltovich & Glaser, 1981). The four question types force the causal organisation.
- **You get better at what you retrieve** (testing effect: Roediger & Karpicke, 2006). So retrieve causal chains, not definitions.
- **Explaining each step to yourself builds understanding** (self-explanation effect: Chi et al., 1989). That is what `TRACE` and `REVIEW` make you do.
- **Worked examples first, problems after** (expertise reversal effect: Kalyuga et al., 2003). The audio story is the worked example; `PREDICT`, `DIAGNOSE` and `INCIDENT` are the problems.
- **Predict, then observe, then explain** (White & Gunstone, 1992). Predicting before seeing the answer exposes wrong models that rereading hides.
- **Comparing cases builds transferable ideas** (analogical encoding: Gentner, Loewenstein & Thompson, 2003). Your lab compared with production practice and with an analogy gives three cases of one mechanism.
- **Mixing topics teaches you to tell problems apart** (interleaving: Rohrer & Taylor, 2007). Incidents do not say which chapter they come from.

## Setup

### NotebookLM

1. **Upload the docs.** Run `~/Documents/Devops/K8s/documents/scripts/sync-notebooklm.sh`, then upload every file in `~/Documents/Devops/K8s/documents/notebooklm-k8s/` (**Add source** → **Upload**, select all).
2. **Re-run the script whenever the docs change.** NotebookLM keeps the copy it got at upload time; the script tells you which copies are now out of date:
   ```
   NotebookLM folder: .../documents/notebooklm-k8s (17 files)
     CHANGED  kubernetes-theory.md
     NEW      lab-4-something.md
   ```
   - `NEW`: upload the file.
   - `CHANGED`: delete the old source (**⋮** → **Remove source**), then upload the new copy.
   - `REMOVED`: delete the source.
   - `nothing changed since the last run`: nothing to do.
3. **Configure the chat.** Open the chat's **Configure** button, choose **Custom**, and paste the [NotebookLM instructions](#notebooklm-instructions-closed-world). The limit is 10,000 characters; these are about 3,400.
4. **Create the three notes:** `Weak links`, `Gaps`, `Upgrades`.
5. **Choose English** as the language in every Studio dialog.

### Gemini

1. **Create a Gem:** Gemini → **Gems** → **New Gem**, named `Cloud Architect Mentor`. Paste the [Gemini instructions](#gemini-instructions-open-world) as its instructions.
2. **Attach the notebook.** Under **Knowledge**, attach the same NotebookLM notebook. If NotebookLM does not appear there, your Workspace admin has not enabled it yet. Until then, attach the notebook in each chat with **+** → **NotebookLM**.
3. **Start every study session in this Gem**, one conversation per session.
4. **Use the extra Gemini tools when they help:**
   - **Canvas**, when you want an interactive diagram after `REVIEW`;
   - **Deep Research**, at most once per module, for a broad `CONTEXT` topic. Its findings still go through `VERIFY` before they enter `Upgrades`.

## NotebookLM instructions (closed world)

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

MODES (my message starts with one keyword)
TRACE <event>: I narrate what happens step by step. After each step ask what happens next and which component does it, and make me say what changes at that hop. When the chain is complete, summarise it as numbered steps and list the links I missed.
PREDICT <failure>: Before revealing anything, ask me to predict: what breaks immediately, what keeps working, what breaks later, and what users see. Then reveal the real chain of effects with citations and score my prediction link by link.
DIAGNOSE <topic>: Choose a failure from the mechanisms in the sources but do not tell me what it is. Give only the first symptom, as an alert or a user report. I ask for evidence (kubectl get/describe/logs/events, metrics, curl); answer each request with realistic output consistent with the hidden failure. When I name the root cause, score my investigation (did I check the right layer first? what would have been faster?), then ask for the fix and how to prevent it.
CHAOS: Like DIAGNOSE, but pick the failure from any topic in the selected sources and do not tell me which topic it belongs to.
DEBRIEF: Give two lists. "Weak links": every causal link I got wrong or missed in this conversation, one per line, as "A -> B because C". "Hand to Gemini": every question from this conversation that the sources could not answer.
```

## Gemini instructions (open world)

```
You are my mentor: a senior cloud architect who has run Kubernetes in production on AWS and on-premises. I am a DevOps engineer who works mainly on AWS EKS. The attached NotebookLM notebook holds my study docs and lab write-ups: treat it as "my system", the baseline every comparison starts from. Your job is to connect that system to the rest of the world: other designs, production scale, current practice, AWS services, and ideas from other domains. Reply in English.

SOURCES AND HONESTY
1. Label every substantive claim: [My docs] when it comes from the notebook; [Source: title, date] with a link when it comes from the web; [Experience] for common practice without a specific source; [Inference] for your own reasoning.
2. For anything that depends on a version, a date or a limit (Kubernetes and EKS versions, deprecations, AWS quotas, prices, feature status), search the web and cite official documentation (kubernetes.io, docs.aws.amazon.com, the project's own docs) with its date. If you cannot verify it, say so. Never invent version numbers or limits.
3. When current practice differs from my docs, write "Changed since your docs:" and explain what changed and why.

TEACHING RULES
4. Ask before telling. In every mode except CONTEXT, ask one question at a time and wait for my answer. If I write "hint", ask a smaller leading question; give the full answer only if I write "reveal".
5. Never ask definition questions ("What is X?", "Define X", "List the ...", default values, command flags). Every question must connect components and be about who decides, the path, failure, or a design trade-off.
6. After each answer: mark it Correct, Partly correct or Wrong, name the missing causal link, then go one level deeper.
7. If my message starts with HANDOVER, aim your first questions at the links I got wrong and the open question in it.

MODES (my message starts with one keyword)
ANALOGY <concept>: Give one analogy from outside Kubernetes (everyday life, a restaurant, an airport, a postal system, or a system I already know such as Linux or AWS). Show the mapping as a table: analogy element -> Kubernetes element. Then name two places where the analogy breaks and the misconception each break could cause. Then ask me to find a third break.
REVIEW: I upload a photo or sketch of my diagram. Do not redraw it yet. First say what is correct, then ask questions, one at a time, that lead me to the missing or wrong components and links. Only after I have fixed it, show your version as an ASCII diagram (or an interactive diagram in Canvas if I ask) with numbered steps, and point out where it differs from my docs.
CONTEXT <topic>: Explain how this is done in production today compared with my docs: the alternatives, what changed and why, what teams usually choose on EKS and on-prem, and the trade-offs. Cite sources. Stay under 400 words. End with one question that makes me compare my lab with current practice.
INCIDENT <topic>: Run an on-call incident drill at production scale on AWS (several Availability Zones, many nodes, real AWS controllers and limits). Do not reveal the cause. Give the first alert or user report; I ask for evidence (kubectl, CloudWatch, ALB metrics, VPC flow logs, AWS console, events); answer with realistic output consistent with the hidden cause. When I name the root cause, score my investigation, then ask for the mitigation now, the permanent fix, and prevention. Finally, link the incident back to the mechanism in my docs. Without a topic, pick any area.
DESIGN <brief>: Expand the brief into realistic requirements (traffic, team size, budget, compliance). I propose a design; challenge it with one new requirement at a time (10x traffic, an Availability Zone outage, a security review, a cost cut). Make me justify each choice against at least one alternative. End by comparing my design with a reference design and naming the trade-offs.
INTERVIEW <topic>: Act as a senior DevOps/SRE interviewer at a company that runs EKS. Mix questions about my labs with production scenarios. Follow up on trade-offs, failure modes, security and cost, and challenge me at least once even when I am right. End with feedback: strengths, gaps, and a hire or no-hire signal with reasons.
VERIFY <claim>: Check the claim against official documentation and my docs. Answer True, Partly true, False or Outdated, with the sources and their dates, and give the corrected statement.
DEBRIEF: Give two lists. "Weak links": every causal link I got wrong in this conversation, one per line, as "A -> B because C". "Upgrades": every verified fact from outside my docs worth adding to them, one per line, with its source link and date.
```

## During a session

- **Stuck:** type `hint`. **Giving up:** type `reveal`.
- **End every session with `DEBRIEF`.** Copy the lines into the matching notes: `Weak links` from both engines, `Gaps` from NotebookLM's `Hand to Gemini` list, `Upgrades` from Gemini's list.
- **Before copying Gemini's `Upgrades` lines**, run `VERIFY` on any that you are going to put into the docs.

## Modules

The modules follow the Theory's order, and each one mixes Theory with the labs, because the labs are concrete systems you can trace.

For every module:
- **NotebookLM, Phase 1:** in Studio → **Audio Overview**, choose **Deep Dive** and paste the module's audio prompt into the customize box.
- **NotebookLM, `PREDICT`:** type `PREDICT:` followed by one of the listed failures, one per conversation turn.
- **Gemini:** use the starters, after your handover card when you switch from NotebookLM.

### Module 1: The control loop

**Model:** You never start containers yourself. You write desired state to the API server, which stores it in etcd. Controllers and the scheduler watch that state and act to close the gap. On each node, the kubelet makes the decision real.

**NotebookLM sources:** `kubernetes-theory.md` (II–IV), `lab-3-overview.md`

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
INCIDENT: a validating admission webhook's backend goes down, and every deployment in the cluster starts failing.
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
- **Audio (Debate)**, before the Gemini interview:
  ```
  Debate: the EKS edge (AWS Load Balancer Controller, ALB to Pod IPs) versus the on-prem edge (external nginx, NodePort, ingress-nginx). Argue about the number of hops, failure points, the client IP, cost and day-2 operations.
  ```

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
- **Audio (Debate)**, before the Gemini interview:
  ```
  Debate: Cluster Autoscaler with fixed node groups versus Karpenter, for a cluster whose traffic varies a lot during the day. Argue about speed, cost, disruption to running Pods and operational risk.
  ```

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

### Weekly mixed drill

Alternate between the two engines, week by week:
- **NotebookLM:** tick all sources, then type `CHAOS`.
- **Gemini:** type `INCIDENT` without a topic.

Mixing topics is what makes you able to tell problems apart.

## Tools: what each is for

| Engine | Tool | Role | Notes |
| --- | --- | --- | --- |
| NotebookLM | **Audio Overview: Deep Dive** | Phase 1, the worked example | Use the module prompt. While it plays, **Join** lets you ask the hosts a question (Deep Dive format, English) |
| NotebookLM | **Audio Overview: Debate** | Phase 4, both sides of a trade-off | Modules 3 and 5 have prompts |
| NotebookLM | **Audio Overview: Critique** | Find weak spots in the docs themselves | Prompt: `Critique how well these sources explain <module topic>: what is missing, unclear or outdated?`. Findings go to `Gaps` |
| NotebookLM | **Chat** (Custom instructions) | Phases 2–3 | One conversation per session; finish with `DEBRIEF` |
| NotebookLM | **Data Table** | After Modules 1–5, the failure matrix | Fill your own table on paper first, then generate it with the prompt below and compare |
| NotebookLM | **Quiz** | Phase 5, scenario check | Prompt below; use **Explain** on every wrong answer |
| NotebookLM | **Flashcards** | Phase 5, only for `Weak links` | Prompt below; repeat a few days later on Hard |
| NotebookLM | **Mind Map** | Optional | `REVIEW` in Gemini gives better feedback on your own drawing |
| Gemini | **Gem** `Cloud Architect Mentor` | Phases 1, 3, 4 | Notebook attached as knowledge |
| Gemini | **Canvas** | Interactive diagrams after `REVIEW` | Only after you have drawn and fixed your own |
| Gemini | **Deep Research** | A broad `CONTEXT` topic, at most once per module | Findings go through `VERIFY` before `Upgrades` |
| — | Reports, Slide Deck, Video Overview, Infographic | Skip | Formats for presenting to others |

**Data Table** (NotebookLM, all sources):
```
One row per component described in the sources: API server, etcd, scheduler, controller manager, kubelet, kube-proxy, CoreDNS, ingress controller, AWS Load Balancer Controller, metrics-server, HPA, Karpenter, CSI driver.
Columns: what it decides; what state it reads and writes; the first symptom if it stops; what keeps working; how to confirm it is the cause.
Use only facts from the sources; write "not in sources" where they are silent.
```

**Quiz** (Difficulty: Hard; the module's sources):
```
Module: <module name and Theory sections>.
Every question must be a scenario in a running cluster: a symptom or a change, and the answer is the cause, the next diagnostic step, or the predicted effect. Wrong options must be plausible misdiagnoses, not obviously wrong answers.
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

**A real failure teaches more than a simulated one.** When a `PREDICT` scenario only needs a single-node cluster, reproduce it on minikube and compare what you see with what you predicted. Theory sections V and VI have minikube walkthroughs to start from.

## Not covered yet

- **XI. Monitoring & Administration, and Lab 3 step 09.** Theory XI is a skeleton you will extend with newer tools. To research them, run Gemini `CONTEXT` (and Deep Research) on observability and backup for EKS, starting from what Lab 3 step 09 used. Verify the findings, write XI, then add a Module 7 here.
- **XII Kops/EKS provisioning, XIV kubectl appendix, Lab 3 steps 01–04 and 06.** These are installation procedures and commands, better practised in a terminal than in a chat.
