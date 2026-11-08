# Kubernetes: Study Guide

**NotebookLM** answers only from your 16 docs: use it to learn *your* system exactly. **Gemini** brings in the rest of the world: production incidents, current practice, design. One-time setup, command samples and the instructions to paste are in [kubernetes-setup.md](kubernetes-setup.md).

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
- Module 6 has no diagram in the docs: at step 3, photograph your drawing and send `REVIEW` in Gemini instead of comparing.

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

**Model:** You never start containers yourself. You write desired state to the API server, which stores it in etcd. Controllers and the scheduler watch that state and act to close the gap. On each node, the kubelet makes the decision real.

- **Tick:** `kubernetes-theory.md` (II–IV), `lab-3-overview.md`
- **Diagrams:** Theory II *The big picture* (the cluster-architecture image and the "K8s Company" image); Theory III *Behind the scenes: `kubectl create deployment --image ...`*; Lab 3 Overview *What runs on each node*.

**Step 2 · Listen** (Audio Overview, focus box):
```
Follow one kubectl apply of a Deployment with 3 replicas from the API server to running containers. At each step say which component acts, what it reads and what it writes, and why only the API server talks to etcd. Then follow what happens when one of those Pods is deleted.
```

**Step 4 · Explain** (NotebookLM chat):
```
TRACE: I run kubectl apply for a Deployment with 3 replicas (Theory sections II–IV). Then I delete one of its Pods. Then I change the image tag.
```

**Step 5 · Break** (NotebookLM chat): send `PREDICT:` with three of these, one per message, then `DIAGNOSE the control loop`.
- The kube-scheduler is stopped for 10 minutes while I scale a Deployment from 3 to 6 replicas.
- The kube-controller-manager is stopped and a Pod of a Deployment is deleted.
- The API server is unreachable for 10 minutes: what keeps serving user traffic, and what can no longer change?
- A worker node is switched off while it runs one replica of a Deployment and one Pod of a DaemonSet.
- A new node joins the cluster.

**Step 6 · Connect** (Gemini), one after another:
```
INCIDENT: every deployment in the cluster suddenly fails, although all running Pods are healthy.
```
```
CONTEXT: what a managed control plane (EKS) takes off my hands compared with my kubeadm lab, and what EKS Auto Mode changes on top of that.
```
```
DESIGN: one EKS cluster shared by 5 teams that deploy their own services: who may change what, and how to stop one team from starving the others.
```
Optional:
```
ANALOGY: the Kubernetes control loop. Then stress-test the "K8s Company" analogy in my docs (Theory section II): where does it break?
```
```
INTERVIEW: the declarative model and controllers versus imperative scripts; why a Deployment manages ReplicaSets instead of Pods; why node agents are DaemonSets.
```

**Done when** (your redraw at each review shows it):
- you can draw kubectl → API server → etcd → controllers / scheduler → kubelet → container runtime from memory, with what each one reads and writes;
- you can say what still works when each control-plane component is down;
- you can say what a managed control plane changes about that.

### Module 2: Service networking inside the cluster

**Model:** A Service is a stable name and a virtual IP. CoreDNS turns the name into the IP. kube-proxy's rules on the sending node turn that IP into one Pod IP from the Service's endpoints. Readiness decides which Pods are in that list.

- **Tick:** `kubernetes-theory.md` (V parts 1–4, IX), `lab-3-overview.md`, `lab-1-app-network-architecture.md`
- **Diagrams:** Theory V *1. NodePort* and *2. ClusterIP*; Lab 3 Overview *How a request travels*; Lab 1 network doc *CoreDNS Architecture* and *Layer 4 (Transport) - kube-proxy*.

**Step 2 · Listen** (Audio Overview, focus box):
```
Explain how one Pod reaches another through a Service: the DNS lookup through CoreDNS, the ClusterIP, the rules kube-proxy writes on the sending node, the endpoints list, and how readiness probes add Pods to it and remove them. Use the on-prem lab's frontend → backend → MySQL calls as the running example, including where DNAT and SNAT happen and why.
```

**Step 4 · Explain** (NotebookLM chat):
```
TRACE: On the on-prem cluster (lab-3-overview), the frontend Pod's nginx forwards /api/products to http://ecommerce-backend:8080, and the backend then queries MySQL. Make me name every address change and the node where it happens.
```

**Step 5 · Break** (NotebookLM chat): send `PREDICT:` with three of these, one per message, then `DIAGNOSE Service networking`.
- kube-proxy stops on one node.
- Every CoreDNS Pod is down.
- A Service's selector has a typo in one label.
- The readiness probe starts failing on one of the two backend Pods.
- A request enters a NodePort on a node that does not run the target Pod (`externalTrafficPolicy: Cluster`): what source IP does the Pod see, and why?

**Step 6 · Connect** (Gemini), one after another:
```
INCIDENT: intermittent timeouts between services on a busy EKS cluster.
```
```
CONTEXT: kube-proxy modes (iptables, IPVS, nftables) and eBPF-based replacements such as Cilium; and how the Amazon VPC CNI gives Pods VPC IP addresses, compared with Calico IPIP in my on-prem lab.
```
```
DESIGN: service-to-service traffic for 40 microservices that need mTLS, retries and per-service metrics: is a service mesh worth it?
```
Optional:
```
ANALOGY: a Kubernetes Service, with its DNS name, ClusterIP, kube-proxy rules and endpoints.
```
```
INTERVIEW: service discovery through DNS versus environment variables; ClusterIP versus headless Services for a database; why a Pod's own IP is never used as a stable address.
```

**Done when** (your redraw at each review shows it):
- you can trace a Pod → Service → Pod call and name the node where each address change happens;
- you can explain why a not-ready Pod gets no traffic but keeps running;
- you can say how EKS networking differs from your on-prem lab.

### Module 3: The edge, getting traffic into the cluster

**Model:** Something outside the cluster must forward traffic to something inside it. There are two designs:
- a cloud load balancer sends straight to Pod IPs (AWS Load Balancer Controller);
- your own proxy sends to a NodePort, and a controller inside the cluster routes from there.

In both, the component that **configures** the path is not a hop **on** the path.

- **Tick:** `kubernetes-theory.md` (V part 5), `lab-1-eks-alb-ingress-irsa.md`, `lab-1-app-network-architecture.md`, `lab-2-kops-ingress-nginx-alb.md`, `lab-3-overview.md`, `lab-3-step-05-ingress-nodeport-reverse-proxy.md`
- **Diagrams:** Theory V *What is Ingress?*, *Why on-prem uses NodePort but cloud uses LoadBalancer* and *ALB Ingress Controller on AWS*; Lab 1 network doc *External User Request Flow* and *How the ALB Gets Its Rules (Control Plane, Not a Hop)*; Lab 3 Overview *Servers and networks*.

**Step 2 · Listen** (Audio Overview, focus box):
```
Compare how a user request enters the cluster in the three labs: Lab 1 (ALB managed by the AWS Load Balancer Controller, sending to Pod IPs), Lab 2 (a hand-made ALB in front of ingress-nginx on a NodePort) and Lab 3 (an external nginx in front of ingress-nginx on a NodePort). For each, name every hop and who configures it.
```

**Step 4 · Explain** (NotebookLM chat):
```
TRACE: One user request to the app, first on EKS (Lab 1), then on-prem (Lab 3), from the browser to a backend Pod. For each hop make me name who forwards it, the source and destination after the hop, and who configured that hop.
```

**Step 5 · Break** (NotebookLM chat): send `PREDICT:` with three of these, one per message, then `DIAGNOSE the edge`.
- The AWS Load Balancer Controller Pod crashes: does traffic through the existing ALB stop?
- The ingress-nginx controller Pod is deleted on the on-prem cluster.
- An Ingress is created without a matching ingress class.
- The on-prem nginx-lb still lists a node that has been switched off.
- On EKS, a backend Pod fails its readiness probe while it is an ALB target.

**Step 6 · Connect** (Gemini), one after another:
```
INCIDENT: users get 502 errors from the ALB for about 30 seconds during every deployment on EKS.
```
```
CONTEXT: ingress-nginx is retired. Gateway API, which implementations support it on EKS and on-prem, and what migrating my Lab 3 edge would involve.
```
```
DESIGN: one EKS edge for 3 teams with TLS everywhere, a WAF and per-team hostnames: one ALB or several, and who owns which part?
```
Optional:
```
ANALOGY: the edge: external load balancer, NodePort and Ingress controller.
```
```
INTERVIEW: why on-prem uses NodePort while cloud uses LoadBalancer; why a ClusterIP Service is enough behind an ALB in IP mode; how you would replace a retired ingress controller without downtime.
```

**Done when** (your redraw at each review shows it):
- you can draw the three edges side by side and point to where each one loses the client IP;
- you can say which failures stop new configuration and which stop traffic;
- you can say what a Gateway API migration changes.

### Module 4: State, where the data lives

**Model:** Pods are disposable; data survives only in volumes whose lifecycle is separate from Pods:
- a PVC asks for storage;
- a PV is bound to it, either created by an admin or provisioned through a StorageClass;
- the CSI driver attaches and mounts it on the node;
- a StatefulSet keeps each Pod's identity tied to its own PVC.

- **Tick:** `kubernetes-theory.md` (VI–VII), `lab-3-step-08-nfs-storage-statefulset-database.md`, `lab-1-app-network-architecture.md`, `kubernetes-misconfigurations.md`
- **Diagrams:** Theory VI *Persistent Volumes (PV)* and *Persistent Volume Claims (PVC)*; Lab 1 network doc *Volume Binding Flow*; Lab 3 step 08, the diagram at the top.

**Step 2 · Listen** (Audio Overview, focus box):
```
Follow the database's data through its life: the PVC created from the StatefulSet's template, how a PV is bound, where the bytes physically live (NFS on-prem, EBS or EFS on AWS), and what happens to them when the Pod is rescheduled, when the StatefulSet is deleted, and when the PVC is deleted.
```

**Step 4 · Explain** (NotebookLM chat):
```
TRACE: I apply the MySQL StatefulSet with a volumeClaimTemplate on the on-prem cluster (lab-3-step-08). Continue until the first row is written to disk on the NFS server. Then the Pod is deleted and comes back.
```

**Step 5 · Break** (NotebookLM chat): send `PREDICT:` with three of these, one per message, then `DIAGNOSE storage`.
- The PVC stays Pending.
- The node that runs a Pod with an EBS volume dies and the only free node is in another Availability Zone.
- Someone deletes a PVC whose StorageClass has `reclaimPolicy: Delete`.
- The NFS server reboots while MySQL is writing.
- The MySQL StatefulSet is scaled from 1 to 3 replicas, expecting a replicated database.

**Step 6 · Connect** (Gemini), one after another:
```
INCIDENT: after a node failure on EKS, the replacement database Pod has been stuck in ContainerCreating for 10 minutes.
```
```
CONTEXT: running databases on Kubernetes today: the EBS CSI driver and volume snapshots, database operators such as CloudNativePG, versus RDS or Aurora. What teams choose, and why.
```
```
DESIGN: PostgreSQL for an e-commerce product that may lose at most 5 minutes of data and must be back within 30 minutes: on EKS or on RDS?
```
Optional:
```
ANALOGY: PV, PVC, StorageClass and a StatefulSet's stable identity.
```
```
INTERVIEW: a database in a StatefulSet versus a managed database; EBS versus EFS for this app; static versus dynamic provisioning.
```

**Done when** (your redraw at each review shows it):
- you can say which object owns the data at each step;
- you can list the exact conditions under which data is lost;
- you can defend where you would run the database in production.

### Module 5: Health and scaling feedback loops

**Model:** Several feedback loops hang together:
- probes decide between "restart it" (liveness) and "send it no traffic" (readiness);
- metrics-server feeds the HPA, which changes the replica count;
- Pods that cannot be scheduled make Karpenter add nodes, and its consolidation removes them later;
- resource requests connect all of these loops.

- **Tick:** `kubernetes-theory.md` (VIII–X), `eks-autoscaling-karpenter.md`, `kubernetes-misconfigurations.md`, `lab-3-step-07-autoscaling-hpa.md`
- **Diagrams:** Theory IX *What is a Liveness Probe?* and X *How it works*; Karpenter doc, the diagram under *Luồng hoạt động*; Lab 3 step 07, the diagram at the top.

**Step 2 · Listen** (Audio Overview, focus box):
```
Explain the chain from rising traffic to new nodes and back: CPU usage measured against requests, the HPA's calculation, new Pods, readiness gating traffic, Pods that cannot be scheduled, Karpenter launching a node, and consolidation removing it later. Point out where each misconfiguration in the sources breaks the chain.
```

**Step 4 · Explain** (NotebookLM chat):
```
TRACE: Traffic to the backend triples on EKS. Continue until a new node serves traffic, then until traffic drops and the extra capacity is removed.
```

**Step 5 · Break** (NotebookLM chat): send `PREDICT:` with three of these, one per message, then `DIAGNOSE health and scaling`.
- The liveness probe checks the database, and the database becomes slow.
- A Deployment has no CPU requests, and an HPA targets 70% CPU.
- metrics-server is down.
- New Pods spike their CPU while starting up.
- A Pod requests more memory than any node offers after the kubelet's reservations.

**Step 6 · Connect** (Gemini), one after another:
```
INCIDENT: during a flash sale the HPA scales the backend out, but the error rate stays high for 5 minutes before the system recovers.
```
```
CONTEXT: autoscaling beyond CPU-based HPA: KEDA, VPA, Karpenter disruption budgets and EKS Auto Mode. What to use when.
```
```
DESIGN: autoscaling for a flash sale with a known start time and 20 times normal traffic.
```
Optional:
```
ANALOGY: probes, the HPA and Karpenter as one system.
```
```
INTERVIEW: liveness versus readiness when a dependency fails; Cluster Autoscaler versus Karpenter; how to stop the HPA from flapping.
```

**Done when** (your redraw at each review shows it):
- you can walk the whole chain from more traffic to more nodes and back, and place each misconfiguration on it;
- you can plan capacity for a known traffic spike.

### Module 6: Identity and access on EKS

**Model:** Two identity systems meet:
- **People:** IAM users and roles get into the cluster through access entries (or the older aws-auth ConfigMap).
- **Pods:** Pods get AWS permissions through IRSA. A service account is linked to an IAM role, the role trusts the cluster's OIDC provider, and the Pod exchanges its token for temporary credentials.

- **Tick:** `lab-1-eks-alb-ingress-irsa.md`, `eks-autoscaling-karpenter.md`, `kubernetes-misconfigurations.md`
- **Diagrams:** none in the docs yet. At step 3, photograph your drawing and send `REVIEW` in Gemini instead of comparing, and add "IRSA and access-entry diagram for Lab 1" to `For Gemini & docs`.

**Step 2 · Listen** (Audio Overview, focus box):
```
Explain how the AWS Load Balancer Controller Pod gets permission to create an ALB: the service account, the OIDC provider, the IAM role's trust policy and the token exchange. Then explain how a new IAM user gets kubectl access to the cluster, and why AWS permissions alone are not enough.
```

**Step 4 · Explain** (NotebookLM chat):
```
TRACE: The AWS Load Balancer Controller Pod starts and must call the AWS API to create an ALB for a new Ingress. Then a new IAM user runs kubectl get pods for the first time.
```

**Step 5 · Break** (NotebookLM chat): send `PREDICT:` with three of these, one per message, then `DIAGNOSE identity on EKS`.
- The IAM role's trust policy names the wrong service account.
- The cluster's OIDC provider was never associated with IAM.
- A new IAM user has AdministratorAccess in AWS but no access entry.
- Pods get AWS permissions from the node's instance role instead of IRSA.
- An app's database password is stored only as a base64 Kubernetes Secret in Git.

**Step 6 · Connect** (Gemini), one after another:
```
INCIDENT: after a change to the cluster's access configuration, half the platform team gets Unauthorized from kubectl, and a controller starts failing with AccessDenied.
```
```
CONTEXT: EKS Pod Identity versus IRSA, and access entries versus the aws-auth ConfigMap: what changed, why, and how to migrate.
```
```
DESIGN: access for 3 teams and 10 controllers on one EKS cluster, with least privilege and an audit trail.
```
Optional:
```
ANALOGY: IAM, access entries, Kubernetes RBAC and IRSA as one identity system.
```
```
INTERVIEW: IRSA versus the node instance role; External Secrets with AWS Secrets Manager versus Kubernetes Secrets; least privilege for controllers such as Karpenter.
```

**Done when** (your redraw at each review shows it):
- you can trace both identity paths (person → cluster and Pod → AWS) and say which component rejects the request in each misconfiguration;
- you can say what Pod Identity changes.

### Not covered yet

- **XI. Monitoring & Administration, and Lab 3 step 09.** Theory XI is a skeleton you will extend with newer tools. To research them, run Gemini `CONTEXT` (and Deep Research) on observability and backup for EKS, starting from what Lab 3 step 09 used. Verify the findings, write XI, then add a Module 7 here.
- **XII Kops/EKS provisioning, XIV kubectl appendix, Lab 3 steps 01–04 and 06.** These are installation procedures and commands, better practised in a terminal than in a chat.
