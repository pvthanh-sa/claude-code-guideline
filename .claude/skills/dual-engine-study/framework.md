# The Dual-Engine Framework

The method behind every guide this skill writes. Distilled from the Kubernetes guide ([`examples/kubernetes-study-guide.md`](examples/kubernetes-study-guide.md)), where it was designed and refined with the learner.

## 1. The problem it solves

Complex IT subjects (Kubernetes, AWS, networking) are **systems**: understanding them lives in the links between components, not in the components. A flashcards-first loop, organised by chapter, fails in five ways:

1. **It drills the wrong unit.** A card holds one fact; the system lives in the links (who triggers whom, what changes at each hop, what breaks downstream).
2. **The card format pulls towards definitions.** A topic prompt is only a hint to the generator, so cards drift back to "What is X?".
3. **It tests before there is a model to test.** Retrieval without a causal picture strengthens fragments.
4. **It is siloed by chapter, while failures cross chapters.** One symptom has causes in several chapters.
5. **The one tool that can ask "why?" and "what next?" (chat) is used last.**

## 2. Two engines, one source of truth

| | NotebookLM: the closed-world tutor | Gemini: the open-world mentor |
| --- | --- | --- |
| **Truth comes from** | The learner's uploaded docs, with citations | The same notebook (attached) **plus** web sources it cites with dates |
| **Answers** | How does **my** system work, and why did it behave that way? | How does **the world** do this, what is it like, and what changes at scale? |
| **Modes** | `TRACE`, `PREDICT`, `DIAGNOSE` (lab scale), `CHAOS`, `DEBRIEF` | `ANALOGY`, `REVIEW`, `CONTEXT`, `INCIDENT` (production scale), `DESIGN`, `INTERVIEW`, `VERIFY`, `DEBRIEF` |
| **Studio / extras** | Audio (Deep Dive, Debate, Critique), Data Table, Quiz, Flashcards | Gem with the notebook as Knowledge, Canvas, Deep Research |

**Routing rule:**
- If the answer should be in the docs, ask NotebookLM.
- If it needs anything outside them (an alternative design, production scale, a newer version, a cloud service, another domain), ask Gemini.

**The docs stay the single source of truth.** Verified open-world knowledge is folded back into them, then re-synced, so NotebookLM can test it too.

**Why each mode sits where it does:**
- `TRACE`, `PREDICT` and lab-scale `DIAGNOSE` must match the learner's labs exactly → NotebookLM.
- `INTERVIEW` tests transfer to systems the learner has not built → Gemini.
- `INCIDENT` covers failures the docs rarely describe → Gemini.
- Visualisation lives inside `REVIEW`, because showing a finished diagram before the learner draws removes the benefit of drawing.

## 3. Four kinds of question

Every question, from either engine, connects at least two components and is one of:

| Type | The learner must explain |
| --- | --- |
| **Who decides?** | Which component acts, what state it reads or writes, what triggers it |
| **What is the path?** | Every hop, and what changes at each one (address, identity, state) |
| **What if it fails?** | What breaks, what keeps working, the blast radius, how to prove it |
| **Why this design?** | The named alternative, and what the choice costs |

Banned in both engines:
- definitions ("What is X?", "Define X");
- acronyms and default values;
- "list the …";
- "which command or flag …";
- anything answerable with one term or one sentence copied from the sources.

Each subject also has a **cross-cutting distinction** that most failure questions reduce to (§8).

## 4. The loop for each module

| Phase | Engine | Mode or tool | Done when |
| --- | --- | --- | --- |
| **1. Model** | NotebookLM | Deep Dive audio, then the learner **draws from memory** | A drawing exists |
| | Gemini | `REVIEW` (photo of the drawing, fixed through questions), then `ANALOGY` (mapping table plus breaks) | The learner redraws it correctly without help |
| **2. Trace** | NotebookLM | `TRACE` | Start to finish without hints |
| **3. Break** | NotebookLM | `PREDICT`, then `DIAGNOSE` | 3 predictions and 2 diagnoses, with blast radius |
| | Gemini | `INCIDENT` | Root cause found and linked back to the docs |
| **4. Extend** | Gemini | `CONTEXT`, `DESIGN`, `INTERVIEW` | Can argue for the lab's design and for the current alternative |
| **5. Retain and reconcile** | Both | `DEBRIEF`; NotebookLM Quiz, then Flashcards from `Weak links` | Repeats weekly |

**Order:** closed world first, so there is one exact case; then the open world, so it can be compared with others.

**Pace:** one module per week.
- **Day 1:** Model and Trace, about 60 minutes.
- **Day 2:** Break, about 45 minutes.
- **Day 4:** Extend, about 45 minutes.
- **Day 5:** reconcile and a quiz, about 20 minutes.
- **Weekly:** a mixed drill, alternating NotebookLM `CHAOS` with Gemini `INCIDENT` without a topic.

## 5. Handover, reconcile, conflicts

**Handover card.** It is pasted as the first message whenever the learner switches engines, and only between phases:
```
HANDOVER from <NotebookLM | Gemini>, Module <n>: <name>
Model in one sentence: <own words>
Links I got wrong: <lines from DEBRIEF>
Open question: <one>
Next: <MODE> <topic>
```

**Three NotebookLM notes** carry knowledge between the engines:

| Note | Filled by | Goes to |
| --- | --- | --- |
| `Weak links` (`A → B because C`) | Both engines' `DEBRIEF` | Quiz and Flashcards days later |
| `Gaps` | NotebookLM's `Hand to Gemini:` lines | Gemini `CONTEXT` / `INCIDENT` |
| `Upgrades` (fact, official source, date) | Gemini's `DEBRIEF`, after `VERIFY` | The docs (with the user's consent), then sync and re-upload of `CHANGED` files |

**Conflict rule:**
- About the learner's lab: the docs win, unless an official source proves them wrong; then fix the doc.
- About the world: a dated official source wins; blogs do not count.
- Unresolved: it goes to `Gaps`.

## 6. Guard rails

| Risk | Rule |
| --- | --- |
| NotebookLM reduces hallucination but does not remove it, and misreads ASCII diagrams | Check the citation behind anything surprising |
| Gemini is confidently wrong about versions and limits | Label every claim; cite official docs with dates; `VERIFY` before keeping anything |
| Analogies mislead beginners | Mapping table, 2 breaks with the misconception each causes, and the learner finds a third |
| Switching engines costs attention | Switch only at phase boundaries, with the handover card |
| The open world invites passive reading | Gemini asks before it tells; `CONTEXT` is the only explaining mode and ends with a question |
| Gemini chats appear in NotebookLM's sources (*Chats from Gemini*) | Leave them unticked; open-world knowledge reaches NotebookLM only through the docs, after `VERIFY` |
| AI-generated quizzes and cards drift to definitions | Scenario-only prompts; skip definition cards; flashcards only from `Weak links` |

## 7. Research basis

- **Experts organise knowledge by causal principles; novices by surface features** (Chi, Feltovich & Glaser, 1981).
- **You get better at what you retrieve** (testing effect: Roediger & Karpicke, 2006). So retrieve causal chains.
- **Explaining each step to yourself builds understanding** (self-explanation effect: Chi et al., 1989): `TRACE` and `REVIEW`.
- **Worked examples first, problems after** (expertise reversal effect: Kalyuga et al., 2003): audio first, then `PREDICT` / `DIAGNOSE` / `INCIDENT`.
- **Predict, then observe, then explain** (White & Gunstone, 1992): `PREDICT`.
- **Comparing cases builds transferable ideas** (analogical encoding: Gentner, Loewenstein & Thompson, 2003): lab vs production vs analogy.
- **Mixing topics teaches discrimination** (interleaving: Rohrer & Taylor, 2007): `CHAOS` and unscoped `INCIDENT`.

## 8. Adapting to a new subject

Fill these for the subject before writing modules. The Kubernetes column is the reference; the AWS column is a starting point to refine with the learner's docs.

| Slot | Kubernetes (done) | AWS (starting point) |
| --- | --- | --- |
| System description (`{{SYSTEM_DESCRIPTION}}`) | a set of components that act on shared state and forward traffic | a set of regional and zonal services, each with a control plane and a data plane, connected by networks and authorised by IAM |
| Cross-cutting distinction | the control plane decides, the data plane carries traffic | control plane vs data plane, and static stability (what keeps working when a control plane is impaired); zonal vs regional blast radius |
| What changes at each hop (`{{WHAT_CHANGES}}`) | address, identity, state | address (NAT, load balancer), route table, security group / NACL decision, IAM principal and credentials |
| Typical `TRACE` events | `kubectl apply` → running Pod; browser → Pod → database | browser → Route 53 → ALB → target in a private subnet → RDS; an EC2 instance assuming a role and calling S3 |
| Lab evidence (`{{LAB_EVIDENCE}}`) | kubectl get/describe/logs/events, metrics, curl | AWS CLI describe calls, CloudWatch metrics and logs, CloudTrail events, VPC Flow Logs, Reachability Analyzer, IAM policy simulator |
| Production context (`{{PRODUCTION_CONTEXT}}`) | several Availability Zones, many nodes, real AWS controllers and limits | several accounts and Regions, Organizations and SCPs, quotas and throttling, multi-AZ failover |
| Official docs (`{{OFFICIAL_DOCS}}`) | kubernetes.io, docs.aws.amazon.com, the project's own docs | docs.aws.amazon.com, the AWS Well-Architected Framework, the Amazon Builders' Library |
| Analogy domains | a company, a restaurant, an airport, the postal system | a city (roads = routes, gates = security groups), an airport (IAM = passport and boarding pass), the postal system |

## 9. Engine facts

Verified 2026-11-07; UI details checked against the user's screenshots on 2026-11-08. Re-check with WebSearch when older than about 3 months.

**NotebookLM:**
- **Custom chat:** the **⋮** menu at the top right (next to **Share**) → **Configure Chat** → goal **Custom** takes instructions of up to **10,000 characters** (the dialog shows a `0 / 10000` counter; seen 2026-11-08). The dialog offers the goals *Default*, *Learning Guide* and *Custom*, and a response length of *Default*, *Longer* or *Shorter*. Keep *Default* length: *Shorter* can cut the summaries and `DEBRIEF` lists. The same menu has *Customize notebook*, *Copy notebook*, *Analytics* and *Delete chat history*. The sliders icon in the chat box is **not** chat configuration: it opens app connectors (Google Drive, Connect an app). UI seen 2026-11-08.
- **Name:** the app's footer reads "Gemini Notebook"; third-party guides say NotebookLM was renamed in July 2026. The URL and the guides still say NotebookLM.
- **Gemini chats as sources:** Gemini conversations that use the notebook appear in the Sources panel as a **Chats from Gemini** group, and **Select all** ticks them too (seen 2026-11-08). Closed-world sessions must leave them unticked.
- **Audio Overview formats:** Deep Dive, Brief, Critique and Debate. Interactive **Join** lets you ask the hosts questions; reportedly it works for Deep Dive only, and in English.
- **Flashcards and Quiz:** they have a topic box, a difficulty setting, a source picker, and **Explain** with citations. The topic box is a hint, not a hard rule.
- **Data Table:** a Studio output with a custom prompt; it exports to Google Sheets.
- **Sources:** an uploaded file is a static copy. A changed file must be removed and re-uploaded; the sync script reports which ones. The free tier allows 50 sources per notebook; Pro allows more.

- **Chat history:** each notebook has one chat thread per person, and it is saved. **⋮** → **Delete chat history** clears all of it; single messages cannot be deleted. **Save to note** sits under each reply, and **Add note** at the bottom of the Studio panel.
- **Studio dialogs, seen 2026-11-05 and 2026-11-08:**
  - *Customize Audio Overview*: Format, Choose language, Length (Short / Default / Long), Sources, the box *What should the AI hosts focus on in this episode?*, and suggestion chips that append text to the box.
  - *Flashcards*: Number of Cards, Level of Difficulty, Include Images, Choose language, Sources, topic box and chips.

**Gemini:**
- **Notebooks as sources:** a NotebookLM notebook can be attached as a source in the Gemini app (**+** → NotebookLM); Workspace accounts have this since January 2026. Since April 2026, notebooks also live in Gemini and sync both ways.
- **Gems:**
  - Gems are created on the web only, through the side panel → **Gems** (or **Explore Gems**) → **New Gem**, which has Name, Instructions, a default tool and Knowledge files. After that, they are usable on mobile too.
  - Attaching a notebook as Gem **Knowledge** is reported but not confirmed.
  - The documented way to attach a notebook is per chat: **+** → **NotebookLM**.
  - On Workspace, an admin must enable NotebookLM first.
  - None of this has been checked against the user's screen yet.
- **Canvas** builds interactive diagrams and pages; **Deep Research** writes long, cited reports.

Sources:
- [NotebookLM custom chat, 10,000 characters (Android Authority)](https://www.androidauthority.com/notebooklm-chat-customization-upgrade-3622570/)
- [NotebookLM Audio Overview formats (9to5Google)](https://9to5google.com/2025/09/02/notebooklm-audio-overview-debate/)
- [NotebookLM flashcards and quizzes (9to5Google)](https://9to5google.com/2025/09/08/notebooklm-flashcards-quizzes/)
- [Data Tables in NotebookLM (Google blog)](https://blog.google/technology/google-labs/notebooklm-data-tables/)
- [NotebookLM in Gemini (Workspace Updates, 01/2026)](https://workspaceupdates.googleblog.com/2026/01/take-notebooks-further-notebooklm-gemini.html)
- [Notebooks in the Gemini app (9to5Google, 04/2026)](https://9to5google.com/2026/04/08/gemini-app-notebooks/)
- [Use chat in NotebookLM (Google support)](https://support.google.com/notebooklm/answer/16179559?hl=en)
- [Create a custom Gem in the Gemini app (Chrome Story, 07/2026)](https://chromestory.com/2026/07/create-gem-gemini-app/)
- [Gemini Gems guide (Zapier)](https://zapier.com/blog/gemini-gems/)
- [NotebookLM in Gemini Gems for Workspace (DEV Community)](https://dev.to/workalizer/unlocking-notebooklm-in-gemini-gems-for-google-workspace-accounts-3ck4)

## 10. Anti-patterns seen so far

- **Flashcard rounds per chapter** produced "What is X?" cards; replaced by this framework.
- **`PREDICT` failures the docs never describe** make NotebookLM improvise. Grep first; move them to Gemini.
- **Prompts asserting version facts** ("X is GA since …") go stale and get repeated as truth. Name topics; let Gemini verify.
- **Uploading the study guide itself as a source** makes the AI quiz about the method. Keep it in `SKIP`.
- **Asking the learner to recall IPs, ports or names from labs** is trivia. Scenarios may *show* them, but questions never ask for them.
