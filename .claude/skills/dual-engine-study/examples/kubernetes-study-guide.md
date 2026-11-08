# Kubernetes: Study Guide

**NotebookLM** answers only from your 16 docs: use it to learn *your* system exactly. **Gemini** brings in the rest of the world: production incidents, current practice, design. Setup, command samples and the instructions to paste are in [kubernetes-setup.md](kubernetes-setup.md).

**How to use it.** Take the modules in order. Open the one you are on and follow it from top to bottom: each step says where to go and what to do, and gives the prompt to paste. Each module has only the steps it needs; *Why these steps* says why. When you finish a module, do its *Review* the day after, about a week later and about a month later; start the next module whenever you like.

## Always

- Before a NotebookLM chat or Studio item, tick only the module's files, in Studio dialogs too, and never **Chats from Gemini**.
- Never use *Search the web for new sources* in this notebook, and never **Convert to source** a note.
- When an answer or a grade surprises you, click its citation number and read the passage.
- Review by testing yourself, never by rereading or re-listening. It should feel hard: struggling to recall is what builds memory.
- At each one-month review, ask Claude Code to fold the checked facts from `For Gemini & docs` into the docs, then run the sync script and re-upload the files it reports as `CHANGED`.

## Tips (optional)

- Start an answer with `sure:` or `guess:`. A wrong `sure:` answer is flagged *Confident error*: put it first in `Weak links`, marked `!`.
- Stuck: send `hint` for a smaller question, `reveal` for the answer.
- A hard step: ask in Vietnamese; the explanation comes in Vietnamese with the terms in English.
- Before a quiz, note the score you expect; a big gap to the real score means you feel surer than you are.
- New module: **⋮** → **Delete chat history** for a clean chat, once the last `DEBRIEF` is saved.

Not used on purpose: Video Overview, Infographic, Mind Map, Reports, Slide Deck, Audio Brief / Critique / Debate, Canvas, Guided Learning. Why: the skill's `framework.md`, §7.

## Modules

**Where the reference diagrams are** (all under `~/Documents/Devops/K8s/`; open them in VS Code's Markdown preview):

| Short name | File |
| --- | --- |
| Theory | `documents/kubernetes-theory.md` |
| Lab 3 Overview | `documents/labs/lab-3-onprem-kubeadm-rancher/overview.md` |
| Lab 3 step 07 / 08 | `documents/labs/lab-3-onprem-kubeadm-rancher/steps/07-…` / `08-…` |
| Lab 1 network doc | `k8s_demo-networking/NETWORK_ARCHITECTURE.md` |
| Karpenter doc | `documents/eks-autoscaling-karpenter.md` |

### Module 1: The control loop

**Goal:** you can draw kubectl → API server → etcd → controllers / scheduler → kubelet → container runtime from memory, with what each one reads and writes; you can say what still works when each control-plane component is down; you can say what a managed control plane changes about that.

**Model:** You never start containers yourself. You write desired state to the API server, which stores it in etcd. Controllers and the scheduler watch that state and act to close the gap. On each node, the kubelet makes the decision real.

**Why these steps:** The control loop is a chain of components acting on stored state, so drawing it and tracing one `kubectl apply` through it are the core. Predicting what keeps running when a control-plane part is down shows whether the model is really there. Your docs barely describe control-plane troubleshooting, so there is no `DIAGNOSE`. Gemini does what the docs cannot: it stress-tests your own "K8s Company" analogy, and maps the lab onto the managed control plane you use on EKS.

**Before you start:**
- In NotebookLM, tick only `kubernetes-theory.md` (II–IV), `lab-3-overview.md`.
- Open these diagrams from your docs in VS Code's Markdown preview (Ctrl+Shift+V): Theory II *The big picture* (the cluster-architecture image and the "K8s Company" image); Theory III *Behind the scenes: `kubectl create deployment --image ...`*; Lab 3 Overview *What runs on each node*.

#### Learn

1. **Sketch** (paper, 2 minutes): how `kubectl apply` becomes running containers: which components act, and which one talks to which. Wrong is fine.
2. **Listen** (NotebookLM → Studio → Audio Overview: Deep Dive, English, Short): paste this into *What should the AI hosts focus on*, then play it with the diagrams open:
   ```
   Follow one kubectl apply of a Deployment with 3 replicas from the API server to running containers. At each step say which component acts, what it reads and what it writes, and why only the API server talks to etcd. Then follow what happens when one of those Pods is deleted.
   ```
3. **Redraw** (paper): close everything and redraw the chain kubectl → API server → etcd → controllers and scheduler → kubelet → container runtime, with what each one reads and writes. Then open Theory II *The big picture* and mark the differences in red.
4. **Trace** (NotebookLM chat): send this and answer one question at a time:
   ```
   TRACE: I run kubectl apply for a Deployment with 3 replicas (Theory sections II–IV). Then I delete one of its Pods. Then I change the image tag.
   ```
5. **Predict** (NotebookLM chat): send `PREDICT:` followed by one of these per message. Pick the three you are least sure of:
   - The kube-scheduler is stopped for 10 minutes while I scale a Deployment from 3 to 6 replicas.
   - The kube-controller-manager is stopped and a Pod of a Deployment is deleted.
   - The API server is unreachable for 10 minutes: what keeps serving user traffic, and what can no longer change?
   - A worker node is switched off while it runs one replica of a Deployment and one Pod of a DaemonSet.
   - A new node joins the cluster.
6. **Save** (NotebookLM): send `DEBRIEF`. Copy its mistakes into `Weak links` and its open questions into `For Gemini & docs`; keep the handover card it prints.
7. **Analogy** (Gemini: a new Gem chat with the notebook attached): paste the handover card with your own *Model in one sentence*, then send:
   ```
   ANALOGY: the Kubernetes control loop. Then stress-test the "K8s Company" analogy in my docs (Theory section II): where does it break?
   ```
8. **Current practice** (Gemini, same chat): send:
   ```
   CONTEXT: what a managed control plane (EKS) takes off my hands compared with my kubeadm lab, and what EKS Auto Mode changes on top of that.
   ```
9. **Save** (Gemini): send `DEBRIEF`. Copy its mistakes into `Weak links`. For each fact it suggests, open the link, find the quoted sentence, and only then copy the fact into `For Gemini & docs`.

**Optional, in the same Gemini chat** (`INCIDENT`, `INTERVIEW`):
```
INCIDENT: every deployment in the cluster suddenly fails, although all running Pods are healthy.
```
```
INTERVIEW: the declarative model and controllers versus imperative scripts; why a Deployment manages ReplicaSets instead of Pods; why node agents are DaemonSets.
```

#### Review: the day after, about a week later, about a month later

1. **Redraw** (paper): on a blank page, redraw the chain kubectl → API server → etcd → controllers and scheduler → kubelet → container runtime, with what each one reads and writes. Compare with Theory II *The big picture*; each miss becomes a `Weak links` line.
2. **Quiz** (NotebookLM → Studio → Quiz: Hard, English, this module's files): paste this into the topic box, then click **Explain** on every wrong answer:
   ```
   Module: The control loop (Theory sections II–IV; Lab 3 Overview).
   Every question must be a scenario in a running cluster: a symptom or a change, and the answer is the cause, the next diagnostic step, or the predicted effect. Wrong options must be plausible misdiagnoses, not obviously wrong answers.
   Never ask what something is, what it stands for, its default value, or which command or flag does something. Never ask me to recall IPs, names or ports.
   ```
3. **Weak links** (NotebookLM → Studio → Flashcards: Standard, Hard, Text Only, English): paste this with all your `Weak links` lines. Then: right → add a ✓; wrong → remove its ✓s; three ✓ → delete the line.
   ```
   Make cards only from these weak links:
   <paste all lines from the Weak links note>
   Front: a situation or "what happens if ...". Back: the causal chain in 2–4 steps (A → B → C), naming the component at each step.
   Never make a definition card ("What is X?", "X is ...").
   ```

### Module 2: Service networking inside the cluster

**Goal:** you can trace a Pod → Service → Pod call and name the node where each address change happens; you can explain why a not-ready Pod gets no traffic but keeps running; you can say how EKS networking differs from your on-prem lab.

**Model:** A Service is a stable name and a virtual IP. CoreDNS turns the name into the IP. kube-proxy's rules on the sending node turn that IP into one Pod IP from the Service's endpoints. Readiness decides which Pods are in that list.

**Why these steps:** This module is a path, so tracing one call hop by hop, and naming where each address changes, is the core. Your docs describe selectors, endpoints and readiness well, so `DIAGNOSE` has solid ground here. On EKS the Pod network works differently from your Calico lab, so `CONTEXT` comes first in Gemini; `INCIDENT` then tests the same mechanisms on a busy cluster.

**Before you start:**
- In NotebookLM, tick only `kubernetes-theory.md` (V parts 1–4, IX), `lab-3-overview.md`, `lab-1-app-network-architecture.md`.
- Open these diagrams from your docs in VS Code's Markdown preview (Ctrl+Shift+V): Theory V *1. NodePort* and *2. ClusterIP*; Lab 3 Overview *How a request travels*; Lab 1 network doc *CoreDNS Architecture* and *Layer 4 (Transport) - kube-proxy*.

#### Learn

1. **Sketch** (paper, 2 minutes): a call from the frontend Pod to `ecommerce-backend`: how the name becomes an IP, and the IP becomes a Pod. Wrong is fine.
2. **Listen** (NotebookLM → Studio → Audio Overview: Deep Dive, English, Short): paste this into *What should the AI hosts focus on*, then play it with the diagrams open:
   ```
   Explain how one Pod reaches another through a Service: the DNS lookup through CoreDNS, the ClusterIP, the rules kube-proxy writes on the sending node, the endpoints list, and how readiness probes add Pods to it and remove them. Use the on-prem lab's frontend → backend → MySQL calls as the running example, including where DNAT and SNAT happen and why.
   ```
3. **Redraw** (paper): close everything and redraw the Pod → Service → Pod path, marking the node where each address changes. Then open Lab 3 Overview *How a request travels* and mark the differences in red.
4. **Trace** (NotebookLM chat): send this and answer one question at a time:
   ```
   TRACE: On the on-prem cluster (lab-3-overview), the frontend Pod's nginx forwards /api/products to http://ecommerce-backend:8080, and the backend then queries MySQL. Make me name every address change and the node where it happens.
   ```
5. **Predict** (NotebookLM chat): send `PREDICT:` followed by one of these per message. Pick the three you are least sure of:
   - kube-proxy stops on one node.
   - Every CoreDNS Pod is down.
   - A Service's selector has a typo in one label.
   - The readiness probe starts failing on one of the two backend Pods.
   - A request enters a NodePort on a node that does not run the target Pod (`externalTrafficPolicy: Cluster`): what source IP does the Pod see, and why?
6. **Diagnose** (NotebookLM chat): send `DIAGNOSE Service networking` and investigate from the first symptom.
7. **Save** (NotebookLM): send `DEBRIEF`. Copy its mistakes into `Weak links` and its open questions into `For Gemini & docs`; keep the handover card it prints.
8. **Current practice** (Gemini: a new Gem chat with the notebook attached): paste the handover card with your own *Model in one sentence*, then send:
   ```
   CONTEXT: kube-proxy modes (iptables, IPVS, nftables) and eBPF-based replacements such as Cilium; and how the Amazon VPC CNI gives Pods VPC IP addresses, compared with Calico IPIP in my on-prem lab.
   ```
9. **Incident** (Gemini, same chat): send:
   ```
   INCIDENT: intermittent timeouts between services on a busy EKS cluster.
   ```
10. **Save** (Gemini): send `DEBRIEF`. Copy its mistakes into `Weak links`. For each fact it suggests, open the link, find the quoted sentence, and only then copy the fact into `For Gemini & docs`.

**Optional, in the same Gemini chat** (`DESIGN`, `INTERVIEW`):
```
DESIGN: service-to-service traffic for 40 microservices that need mTLS, retries and per-service metrics: is a service mesh worth it?
```
```
INTERVIEW: service discovery through DNS versus environment variables; ClusterIP versus headless Services for a database; why a Pod's own IP is never used as a stable address.
```

#### Review: the day after, about a week later, about a month later

1. **Redraw** (paper): on a blank page, redraw the Pod → Service → Pod path, marking the node where each address changes. Compare with Lab 3 Overview *How a request travels*; each miss becomes a `Weak links` line.
2. **Quiz** (NotebookLM → Studio → Quiz: Hard, English, this module's files): paste this into the topic box, then click **Explain** on every wrong answer:
   ```
   Module: Service networking (Theory section V parts 1–4 and IX; Lab 3 Overview; the Lab 1 network doc).
   Every question must be a scenario in a running cluster: a symptom or a change, and the answer is the cause, the next diagnostic step, or the predicted effect. Wrong options must be plausible misdiagnoses, not obviously wrong answers.
   Never ask what something is, what it stands for, its default value, or which command or flag does something. Never ask me to recall IPs, names or ports.
   ```
3. **Weak links** (NotebookLM → Studio → Flashcards: Standard, Hard, Text Only, English): paste this with all your `Weak links` lines. Then: right → add a ✓; wrong → remove its ✓s; three ✓ → delete the line.
   ```
   Make cards only from these weak links:
   <paste all lines from the Weak links note>
   Front: a situation or "what happens if ...". Back: the causal chain in 2–4 steps (A → B → C), naming the component at each step.
   Never make a definition card ("What is X?", "X is ...").
   ```
4. **Mix**: one drill across all modules so far: NotebookLM `CHAOS` with all files ticked, or Gemini `INCIDENT` with no topic. Alternate between them.

### Module 3: The edge, getting traffic into the cluster

**Goal:** you can draw the three edges side by side and point to where each one loses the client IP; you can say which failures stop new configuration and which stop traffic; you can say what a Gateway API migration changes.

**Model:** Something outside the cluster must forward traffic to something inside it. There are two designs:
- a cloud load balancer sends straight to Pod IPs (AWS Load Balancer Controller);
- your own proxy sends to a NodePort, and a controller inside the cluster routes from there.

In both, the component that **configures** the path is not a hop **on** the path.

**Why these steps:** The lesson is the comparison of three designs, so you draw them side by side and trace the same request through two labs. Your docs predate the retirement of ingress-nginx, so `CONTEXT` (Gateway API) is essential, and 502 errors from the ALB during deployments are the most common edge `INCIDENT` on EKS.

**Before you start:**
- In NotebookLM, tick only `kubernetes-theory.md` (V part 5), `lab-1-eks-alb-ingress-irsa.md`, `lab-1-app-network-architecture.md`, `lab-2-kops-ingress-nginx-alb.md`, `lab-3-overview.md`, `lab-3-step-05-ingress-nodeport-reverse-proxy.md`.
- Open these diagrams from your docs in VS Code's Markdown preview (Ctrl+Shift+V): Theory V *What is Ingress?*, *Why on-prem uses NodePort but cloud uses LoadBalancer* and *ALB Ingress Controller on AWS*; Lab 1 network doc *External User Request Flow* and *How the ALB Gets Its Rules (Control Plane, Not a Hop)*; Lab 3 Overview *Servers and networks*.

#### Learn

1. **Sketch** (paper, 2 minutes): the three ways traffic reached your apps in Labs 1, 2 and 3. Wrong is fine.
2. **Listen** (NotebookLM → Studio → Audio Overview: Deep Dive, English, Short): paste this into *What should the AI hosts focus on*, then play it with the diagrams open:
   ```
   Compare how a user request enters the cluster in the three labs: Lab 1 (ALB managed by the AWS Load Balancer Controller, sending to Pod IPs), Lab 2 (a hand-made ALB in front of ingress-nginx on a NodePort) and Lab 3 (an external nginx in front of ingress-nginx on a NodePort). For each, name every hop and who configures it.
   ```
3. **Redraw** (paper): close everything and redraw the three edges side by side, marking who configures each hop and where each one loses the client IP. Then open Theory V *Why on-prem uses NodePort but cloud uses LoadBalancer* and mark the differences in red.
4. **Trace** (NotebookLM chat): send this and answer one question at a time:
   ```
   TRACE: One user request to the app, first on EKS (Lab 1), then on-prem (Lab 3), from the browser to a backend Pod. For each hop make me name who forwards it, the source and destination after the hop, and who configured that hop.
   ```
5. **Predict** (NotebookLM chat): send `PREDICT:` followed by one of these per message. Pick the three you are least sure of:
   - The AWS Load Balancer Controller Pod crashes: does traffic through the existing ALB stop?
   - The ingress-nginx controller Pod is deleted on the on-prem cluster.
   - An Ingress is created without a matching ingress class.
   - The on-prem nginx-lb still lists a node that has been switched off.
   - On EKS, a backend Pod fails its readiness probe while it is an ALB target.
6. **Save** (NotebookLM): send `DEBRIEF`. Copy its mistakes into `Weak links` and its open questions into `For Gemini & docs`; keep the handover card it prints.
7. **Incident** (Gemini: a new Gem chat with the notebook attached): paste the handover card with your own *Model in one sentence*, then send:
   ```
   INCIDENT: users get 502 errors from the ALB for about 30 seconds during every deployment on EKS.
   ```
8. **Current practice** (Gemini, same chat): send:
   ```
   CONTEXT: ingress-nginx is retired. Gateway API, which implementations support it on EKS and on-prem, and what migrating my Lab 3 edge would involve.
   ```
9. **Save** (Gemini): send `DEBRIEF`. Copy its mistakes into `Weak links`. For each fact it suggests, open the link, find the quoted sentence, and only then copy the fact into `For Gemini & docs`.

**Optional, in the same Gemini chat** (`DESIGN`, `INTERVIEW`):
```
DESIGN: one EKS edge for 3 teams with TLS everywhere, a WAF and per-team hostnames: one ALB or several, and who owns which part?
```
```
INTERVIEW: why on-prem uses NodePort while cloud uses LoadBalancer; why a ClusterIP Service is enough behind an ALB in IP mode; how you would replace a retired ingress controller without downtime.
```

#### Review: the day after, about a week later, about a month later

1. **Redraw** (paper): on a blank page, redraw the three edges side by side, marking who configures each hop and where each one loses the client IP. Compare with Theory V *Why on-prem uses NodePort but cloud uses LoadBalancer*; each miss becomes a `Weak links` line.
2. **Quiz** (NotebookLM → Studio → Quiz: Hard, English, this module's files): paste this into the topic box, then click **Explain** on every wrong answer:
   ```
   Module: The edge (Theory section V part 5; Labs 1, 2 and 3).
   Every question must be a scenario in a running cluster: a symptom or a change, and the answer is the cause, the next diagnostic step, or the predicted effect. Wrong options must be plausible misdiagnoses, not obviously wrong answers.
   Never ask what something is, what it stands for, its default value, or which command or flag does something. Never ask me to recall IPs, names or ports.
   ```
3. **Weak links** (NotebookLM → Studio → Flashcards: Standard, Hard, Text Only, English): paste this with all your `Weak links` lines. Then: right → add a ✓; wrong → remove its ✓s; three ✓ → delete the line.
   ```
   Make cards only from these weak links:
   <paste all lines from the Weak links note>
   Front: a situation or "what happens if ...". Back: the causal chain in 2–4 steps (A → B → C), naming the component at each step.
   Never make a definition card ("What is X?", "X is ...").
   ```
4. **Mix**: one drill across all modules so far: NotebookLM `CHAOS` with all files ticked, or Gemini `INCIDENT` with no topic. Alternate between them.

### Module 4: State, where the data lives

**Goal:** you can say which object owns the data at each step; you can list the exact conditions under which data is lost; you can defend where you would run the database in production.

**Model:** Pods are disposable; data survives only in volumes whose lifecycle is separate from Pods:
- a PVC asks for storage;
- a PV is bound to it, either created by an admin or provisioned through a StorageClass;
- the CSI driver attaches and mounts it on the node;
- a StatefulSet keeps each Pod's identity tied to its own PVC.

**Why these steps:** Storage is about ownership and lifecycle, so the trace follows one row from the StatefulSet down to the disk and back after a restart, and the predictions ask exactly when data is lost. Your lab used NFS; on EKS a volume is tied to one Availability Zone, so `INCIDENT` (a Pod stuck after a node failure) and `CONTEXT` (database operators versus RDS) cover what the lab could not.

**Before you start:**
- In NotebookLM, tick only `kubernetes-theory.md` (VI–VII), `lab-3-step-08-nfs-storage-statefulset-database.md`, `lab-1-app-network-architecture.md`, `kubernetes-misconfigurations.md`.
- Open these diagrams from your docs in VS Code's Markdown preview (Ctrl+Shift+V): Theory VI *Persistent Volumes (PV)* and *Persistent Volume Claims (PVC)*; Lab 1 network doc *Volume Binding Flow*; Lab 3 step 08, the diagram at the top.

#### Learn

1. **Sketch** (paper, 2 minutes): where the database's bytes physically live, and which objects connect the Pod to them. Wrong is fine.
2. **Listen** (NotebookLM → Studio → Audio Overview: Deep Dive, English, Short): paste this into *What should the AI hosts focus on*, then play it with the diagrams open:
   ```
   Follow the database's data through its life: the PVC created from the StatefulSet's template, how a PV is bound, where the bytes physically live (NFS on-prem, EBS or EFS on AWS), and what happens to them when the Pod is rescheduled, when the StatefulSet is deleted, and when the PVC is deleted.
   ```
3. **Redraw** (paper): close everything and redraw the chain StatefulSet → PVC → PV → StorageClass and CSI driver → disk, with who creates each object. Then open Theory VI *Persistent Volume Claims (PVC)* and mark the differences in red.
4. **Trace** (NotebookLM chat): send this and answer one question at a time:
   ```
   TRACE: I apply the MySQL StatefulSet with a volumeClaimTemplate on the on-prem cluster (lab-3-step-08). Continue until the first row is written to disk on the NFS server. Then the Pod is deleted and comes back.
   ```
5. **Predict** (NotebookLM chat): send `PREDICT:` followed by one of these per message. Pick the three you are least sure of:
   - The PVC stays Pending.
   - The node that runs a Pod with an EBS volume dies and the only free node is in another Availability Zone.
   - Someone deletes a PVC whose StorageClass has `reclaimPolicy: Delete`.
   - The NFS server reboots while MySQL is writing.
   - The MySQL StatefulSet is scaled from 1 to 3 replicas, expecting a replicated database.
6. **Save** (NotebookLM): send `DEBRIEF`. Copy its mistakes into `Weak links` and its open questions into `For Gemini & docs`; keep the handover card it prints.
7. **Incident** (Gemini: a new Gem chat with the notebook attached): paste the handover card with your own *Model in one sentence*, then send:
   ```
   INCIDENT: after a node failure on EKS, the replacement database Pod has been stuck in ContainerCreating for 10 minutes.
   ```
8. **Current practice** (Gemini, same chat): send:
   ```
   CONTEXT: running databases on Kubernetes today: the EBS CSI driver and volume snapshots, database operators such as CloudNativePG, versus RDS or Aurora. What teams choose, and why.
   ```
9. **Save** (Gemini): send `DEBRIEF`. Copy its mistakes into `Weak links`. For each fact it suggests, open the link, find the quoted sentence, and only then copy the fact into `For Gemini & docs`.

**Optional, in the same Gemini chat** (`DESIGN`, `INTERVIEW`):
```
DESIGN: PostgreSQL for an e-commerce product that may lose at most 5 minutes of data and must be back within 30 minutes: on EKS or on RDS?
```
```
INTERVIEW: a database in a StatefulSet versus a managed database; EBS versus EFS for this app; static versus dynamic provisioning.
```

#### Review: the day after, about a week later, about a month later

1. **Redraw** (paper): on a blank page, redraw the chain StatefulSet → PVC → PV → StorageClass and CSI driver → disk, with who creates each object. Compare with Theory VI *Persistent Volume Claims (PVC)*; each miss becomes a `Weak links` line.
2. **Quiz** (NotebookLM → Studio → Quiz: Hard, English, this module's files): paste this into the topic box, then click **Explain** on every wrong answer:
   ```
   Module: State (Theory sections VI–VII; Lab 3 step 08; the Lab 1 network doc; the misconfigurations doc).
   Every question must be a scenario in a running cluster: a symptom or a change, and the answer is the cause, the next diagnostic step, or the predicted effect. Wrong options must be plausible misdiagnoses, not obviously wrong answers.
   Never ask what something is, what it stands for, its default value, or which command or flag does something. Never ask me to recall IPs, names or ports.
   ```
3. **Weak links** (NotebookLM → Studio → Flashcards: Standard, Hard, Text Only, English): paste this with all your `Weak links` lines. Then: right → add a ✓; wrong → remove its ✓s; three ✓ → delete the line.
   ```
   Make cards only from these weak links:
   <paste all lines from the Weak links note>
   Front: a situation or "what happens if ...". Back: the causal chain in 2–4 steps (A → B → C), naming the component at each step.
   Never make a definition card ("What is X?", "X is ...").
   ```
4. **Mix**: one drill across all modules so far: NotebookLM `CHAOS` with all files ticked, or Gemini `INCIDENT` with no topic. Alternate between them.

### Module 5: Health and scaling feedback loops

**Goal:** you can walk the whole chain from more traffic to more nodes and back, and place each misconfiguration on it; you can say which newer autoscaler you would add to this chain, and why.

**Model:** Several feedback loops hang together:
- probes decide between "restart it" (liveness) and "send it no traffic" (readiness);
- metrics-server feeds the HPA, which changes the replica count;
- Pods that cannot be scheduled make Karpenter add nodes, and its consolidation removes them later;
- resource requests connect all of these loops.

**Why these steps:** Several feedback loops interact here, so the trace follows one traffic spike through all of them. The misconfigurations doc describes real failure patterns, so `DIAGNOSE` has solid ground. `INCIDENT` (a flash sale) shows the loops' timing at scale, and `CONTEXT` covers the autoscalers that are newer than your docs.

**Before you start:**
- In NotebookLM, tick only `kubernetes-theory.md` (VIII–X), `eks-autoscaling-karpenter.md`, `kubernetes-misconfigurations.md`, `lab-3-step-07-autoscaling-hpa.md`.
- Open these diagrams from your docs in VS Code's Markdown preview (Ctrl+Shift+V): Theory IX *What is a Liveness Probe?* and X *How it works*; Karpenter doc, the diagram under *Luồng hoạt động*; Lab 3 step 07, the diagram at the top.

#### Learn

1. **Sketch** (paper, 2 minutes): what happens between "traffic triples" and "a new node serves traffic". Wrong is fine.
2. **Listen** (NotebookLM → Studio → Audio Overview: Deep Dive, English, Short): paste this into *What should the AI hosts focus on*, then play it with the diagrams open:
   ```
   Explain the chain from rising traffic to new nodes and back: CPU usage measured against requests, the HPA's calculation, new Pods, readiness gating traffic, Pods that cannot be scheduled, Karpenter launching a node, and consolidation removing it later. Point out where each misconfiguration in the sources breaks the chain.
   ```
3. **Redraw** (paper): close everything and redraw the loops: probes; metrics-server → HPA → replicas; unschedulable Pods → Karpenter → nodes; and where resource requests sit in each. Then open Theory X *How it works* and the Karpenter doc's diagram and mark the differences in red.
4. **Trace** (NotebookLM chat): send this and answer one question at a time:
   ```
   TRACE: Traffic to the backend triples on EKS. Continue until a new node serves traffic, then until traffic drops and the extra capacity is removed.
   ```
5. **Predict** (NotebookLM chat): send `PREDICT:` followed by one of these per message. Pick the three you are least sure of:
   - The liveness probe checks the database, and the database becomes slow.
   - A Deployment has no CPU requests, and an HPA targets 70% CPU.
   - metrics-server is down.
   - New Pods spike their CPU while starting up.
   - A Pod requests more memory than any node offers after the kubelet's reservations.
6. **Diagnose** (NotebookLM chat): send `DIAGNOSE health and scaling` and investigate from the first symptom.
7. **Save** (NotebookLM): send `DEBRIEF`. Copy its mistakes into `Weak links` and its open questions into `For Gemini & docs`; keep the handover card it prints.
8. **Incident** (Gemini: a new Gem chat with the notebook attached): paste the handover card with your own *Model in one sentence*, then send:
   ```
   INCIDENT: during a flash sale the HPA scales the backend out, but the error rate stays high for 5 minutes before the system recovers.
   ```
9. **Current practice** (Gemini, same chat): send:
   ```
   CONTEXT: autoscaling beyond CPU-based HPA: KEDA, VPA, Karpenter disruption budgets and EKS Auto Mode. What to use when.
   ```
10. **Save** (Gemini): send `DEBRIEF`. Copy its mistakes into `Weak links`. For each fact it suggests, open the link, find the quoted sentence, and only then copy the fact into `For Gemini & docs`.

**Optional, in the same Gemini chat** (`DESIGN`, `INTERVIEW`):
```
DESIGN: autoscaling for a flash sale with a known start time and 20 times normal traffic.
```
```
INTERVIEW: liveness versus readiness when a dependency fails; Cluster Autoscaler versus Karpenter; how to stop the HPA from flapping.
```

#### Review: the day after, about a week later, about a month later

1. **Redraw** (paper): on a blank page, redraw the loops: probes; metrics-server → HPA → replicas; unschedulable Pods → Karpenter → nodes; and where resource requests sit in each. Compare with Theory X *How it works* and the Karpenter doc's diagram; each miss becomes a `Weak links` line.
2. **Quiz** (NotebookLM → Studio → Quiz: Hard, English, this module's files): paste this into the topic box, then click **Explain** on every wrong answer:
   ```
   Module: Health and scaling (Theory sections VIII–X; the Karpenter doc; the misconfigurations doc; Lab 3 step 07).
   Every question must be a scenario in a running cluster: a symptom or a change, and the answer is the cause, the next diagnostic step, or the predicted effect. Wrong options must be plausible misdiagnoses, not obviously wrong answers.
   Never ask what something is, what it stands for, its default value, or which command or flag does something. Never ask me to recall IPs, names or ports.
   ```
3. **Weak links** (NotebookLM → Studio → Flashcards: Standard, Hard, Text Only, English): paste this with all your `Weak links` lines. Then: right → add a ✓; wrong → remove its ✓s; three ✓ → delete the line.
   ```
   Make cards only from these weak links:
   <paste all lines from the Weak links note>
   Front: a situation or "what happens if ...". Back: the causal chain in 2–4 steps (A → B → C), naming the component at each step.
   Never make a definition card ("What is X?", "X is ...").
   ```
4. **Mix**: one drill across all modules so far: NotebookLM `CHAOS` with all files ticked, or Gemini `INCIDENT` with no topic. Alternate between them.

### Module 6: Identity and access on EKS

**Goal:** you can trace both identity paths (person → cluster and Pod → AWS) and say which component rejects the request in each misconfiguration; you can say what Pod Identity changes.

**Model:** Two identity systems meet:
- **People:** IAM users and roles get into the cluster through access entries (or the older aws-auth ConfigMap).
- **Pods:** Pods get AWS permissions through IRSA. A service account is linked to an IAM role, the role trusts the cluster's OIDC provider, and the Pod exchanges its token for temporary credentials.

**Why these steps:** Identity is abstract and your docs have no diagram of it, so you draw it yourself and Gemini's `REVIEW` checks the drawing; an `ANALOGY` makes the two paths concrete. `CONTEXT` matters most: EKS Pod Identity and access entries have changed this area since your lab was written.

**Before you start:**
- In NotebookLM, tick only `lab-1-eks-alb-ingress-irsa.md`, `eks-autoscaling-karpenter.md`, `kubernetes-misconfigurations.md`.
- Your docs have no diagram for this module yet. Ask Claude Code to add an IRSA and access-entry diagram to Lab 1; until then, step 3 uses Gemini's `REVIEW`.

#### Learn

1. **Sketch** (paper, 2 minutes): the two identity paths: you → the cluster, and a Pod → the AWS API. Wrong is fine.
2. **Listen** (NotebookLM → Studio → Audio Overview: Deep Dive, English, Short): paste this into *What should the AI hosts focus on*, then play it, noting the order of the hops:
   ```
   Explain how the AWS Load Balancer Controller Pod gets permission to create an ALB: the service account, the OIDC provider, the IAM role's trust policy and the token exchange. Then explain how a new IAM user gets kubectl access to the cluster, and why AWS permissions alone are not enough.
   ```
3. **Draw and review** (paper, then Gemini): from memory, draw both identity paths, naming the component that checks each step. Photograph the drawing, start a Gem chat with the notebook attached, send the photo with `REVIEW`, and fix the drawing through its questions. Keep the corrected drawing for your reviews.
4. **Trace** (NotebookLM chat): send this and answer one question at a time:
   ```
   TRACE: The AWS Load Balancer Controller Pod starts and must call the AWS API to create an ALB for a new Ingress. Then a new IAM user runs kubectl get pods for the first time.
   ```
5. **Predict** (NotebookLM chat): send `PREDICT:` followed by one of these per message. Pick the three you are least sure of:
   - The IAM role's trust policy names the wrong service account.
   - The cluster's OIDC provider was never associated with IAM.
   - A new IAM user has AdministratorAccess in AWS but no access entry.
   - Pods get AWS permissions from the node's instance role instead of IRSA.
   - An app's database password is stored only as a base64 Kubernetes Secret in Git.
6. **Save** (NotebookLM): send `DEBRIEF`. Copy its mistakes into `Weak links` and its open questions into `For Gemini & docs`; keep the handover card it prints.
7. **Analogy** (Gemini: a new Gem chat with the notebook attached): paste the handover card with your own *Model in one sentence*, then send:
   ```
   ANALOGY: IAM, access entries, Kubernetes RBAC and IRSA as one identity system.
   ```
8. **Current practice** (Gemini, same chat): send:
   ```
   CONTEXT: EKS Pod Identity versus IRSA, and access entries versus the aws-auth ConfigMap: what changed, why, and how to migrate.
   ```
9. **Save** (Gemini): send `DEBRIEF`. Copy its mistakes into `Weak links`. For each fact it suggests, open the link, find the quoted sentence, and only then copy the fact into `For Gemini & docs`.

**Optional, in the same Gemini chat** (`INCIDENT`, `DESIGN`, `INTERVIEW`):
```
INCIDENT: after a change to the cluster's access configuration, half the platform team gets Unauthorized from kubectl, and a controller starts failing with AccessDenied.
```
```
DESIGN: access for 3 teams and 10 controllers on one EKS cluster, with least privilege and an audit trail.
```
```
INTERVIEW: IRSA versus the node instance role; External Secrets with AWS Secrets Manager versus Kubernetes Secrets; least privilege for controllers such as Karpenter.
```

#### Review: the day after, about a week later, about a month later

1. **Redraw** (paper): on a blank page, redraw both identity paths, naming the component that checks each step. Compare with your corrected drawing from step 3; each miss becomes a `Weak links` line.
2. **Quiz** (NotebookLM → Studio → Quiz: Hard, English, this module's files): paste this into the topic box, then click **Explain** on every wrong answer:
   ```
   Module: Identity and access on EKS (Lab 1; the Karpenter doc; the misconfigurations doc).
   Every question must be a scenario in a running cluster: a symptom or a change, and the answer is the cause, the next diagnostic step, or the predicted effect. Wrong options must be plausible misdiagnoses, not obviously wrong answers.
   Never ask what something is, what it stands for, its default value, or which command or flag does something. Never ask me to recall IPs, names or ports.
   ```
3. **Weak links** (NotebookLM → Studio → Flashcards: Standard, Hard, Text Only, English): paste this with all your `Weak links` lines. Then: right → add a ✓; wrong → remove its ✓s; three ✓ → delete the line.
   ```
   Make cards only from these weak links:
   <paste all lines from the Weak links note>
   Front: a situation or "what happens if ...". Back: the causal chain in 2–4 steps (A → B → C), naming the component at each step.
   Never make a definition card ("What is X?", "X is ...").
   ```
4. **Mix**: one drill across all modules so far: NotebookLM `CHAOS` with all files ticked, or Gemini `INCIDENT` with no topic. Alternate between them.

### Not covered yet

- **XI. Monitoring & Administration, and Lab 3 step 09.** Theory XI is a skeleton you will extend with newer tools. To research them, run Gemini `CONTEXT` (and Deep Research) on observability and backup for EKS, starting from what Lab 3 step 09 used. Verify the findings, write XI, then add a Module 7 here.
- **XII Kops/EKS provisioning, XIV kubectl appendix, Lab 3 steps 01–04 and 06.** These are installation procedures and commands, better practised in a terminal than in a chat.
