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
| **Commands** | `TRACE`, `PREDICT`, `DIAGNOSE` (lab scale), `CHAOS`, `DEBRIEF` | `INCIDENT` (production scale), `CONTEXT`, `DESIGN`, `INTERVIEW` (depends on the goal), `VERIFY`, `DEBRIEF`; `ANALOGY` (optional); `REVIEW` (modules without a diagram) |
| **Other tools used** | Audio Deep Dive (Short, with the docs' diagram open), Quiz, Flashcards, Notes; Data Table once | A Gem with instructions only, the notebook attached in each chat; Deep Research, rarely |

The full keep/skip decision for every feature is in §7.

**Routing rule:**
- If the answer should be in the docs, ask NotebookLM.
- If it needs anything outside them (an alternative design, production scale, a newer version, a cloud service, another domain), ask Gemini.

**The docs stay the single source of truth.** Open-world knowledge is folded back into them once the learner has seen its official source, then re-synced, so NotebookLM can test it too.

**Why each command sits where it does:**
- `TRACE`, `PREDICT` and lab-scale `DIAGNOSE` must match the learner's labs exactly → NotebookLM.
- `INCIDENT`, `CONTEXT`, `DESIGN` and `INTERVIEW` need knowledge beyond the docs → Gemini.
- Pictures come from the docs' verified diagrams, after the learner has drawn their own. AI-drawn visuals never replace them; `REVIEW` covers only modules whose docs have no diagram.

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

Each subject also has a **cross-cutting distinction** that most failure questions reduce to (§9).

## 4. The weekly loop

One module per week (two weeks on the smallest budget). Within a module the closed world comes first, so there is one exact case; the open world follows, so it can be compared with others.

| Phase | What the learner does | What it builds |
| --- | --- | --- |
| **1. Model** | Sketch from what they already know → Deep Dive audio (Short) with the docs' diagram open → redraw from memory → mark the differences in red | An accurate picture of the mechanism |
| **2. Trace** | `TRACE` in NotebookLM | The causal chain, step by step |
| **3. Break** | `PREDICT` and `DIAGNOSE` in NotebookLM, then `INCIDENT` in Gemini | Reasoning from cause to effect and back |
| **4. Extend** | `CONTEXT`, `DESIGN` (and `INTERVIEW`, depending on the goal) in Gemini | Transfer to current practice and to new designs |
| **5. Retain** | Next week's blank redraw; Quiz on *last* week's module; due flashcards; a mixed drill | Durable memory, and an honest sense of what is known |

**Session plans by weekly time.** Sessions are at least a day apart. Pick the plan at intake (SKILL.md step 1):

| Weekly time | Sessions |
| --- | --- |
| **Under 2 h** | **A** (60': redraw last week, sketch, audio with diagram, redraw, `TRACE`) and **D** (40': `PREDICT` ×2, due flashcards, Quiz on last week). No Gemini sessions except `INCIDENT` every other week. One module takes about two weeks |
| **2.5–3 h** | **A** (55') as above; **B** (50': `PREDICT` ×2, `DIAGNOSE` ×1, then Gemini `INCIDENT` and `CONTEXT`); **C+D** (35': Quiz on last week, due flashcards, mixed drill) |
| **4–5 h** (the Kubernetes guide) | **A** Model + Trace (60'); **B** Break (60': `PREDICT` ×3, `DIAGNOSE` ×1–2, `INCIDENT`); **C** Extend (55': `CONTEXT`, `DESIGN`, optional `INTERVIEW`); **D** Retain (40': Quiz on last week, due flashcards, mixed drill) |

Every plan adds **once a month** about 20 minutes: fold `Upgrades` into the docs, run the sync script, re-upload `CHANGED` files.

**Spacing.** NotebookLM keeps no scores, so the `Weak links` note is the schedule. Each line reads `A -> B because C (box n, due YYYY-MM-DD)`:

| Result when due | New box | Next due |
| --- | --- | --- |
| Wrong | 1 | next week |
| Right in box 1 | 2 | in 2 weeks |
| Right in box 2 | 3 | in 4 weeks |
| Right in box 3 | — | delete the line |

**Calibration:**
- The learner starts answers with `sure:` or `guess:`. A wrong `sure:` answer is a *Confident error*; these go to the top of `Weak links`, marked `!`.
- The learner writes a predicted Quiz score before each quiz and the real score after it.
- Each session A opens with a blank redraw of last week's model, instead of a self-judged "done".

## 5. Handover, reconcile, conflicts

**Handover card.** `DEBRIEF` prints it in a code block; the learner fills in only *Model in one sentence* (a 30-second recall) and pastes it as the first message in the other engine, only between steps:
```
HANDOVER from <NotebookLM | Gemini>, Module <n>: <name>
Model in one sentence: <own words>
Links I got wrong: <confident errors first>
Open question: <one>
Next: <MODE> <topic>
```

**Three NotebookLM notes** carry knowledge between the engines:

| Note | Filled by | Goes to |
| --- | --- | --- |
| `Weak links` (`A -> B because C (box n, due date)`; `!` = confident error) | Both engines' `DEBRIEF`, and the redraw comparisons | Session D, when due |
| `Gaps` | NotebookLM's *Hand to Gemini* lines | Gemini `CONTEXT` / `INCIDENT` |
| `Upgrades` (`fact [Current practice, page, date, link]`) | Gemini's `DEBRIEF`, at most two per module, kept only once the learner has opened the link and found the quoted sentence | The docs once a month (with the user's consent), then sync and re-upload of `CHANGED` files |

**Conflict rule:**
- About the learner's lab: the docs win, unless an official source proves them wrong; then fix the doc.
- About the world: a dated official source wins; blogs do not count.
- Unresolved: it goes to `Gaps`.

## 6. Guard rails

| Risk | Rule |
| --- | --- |
| NotebookLM reduces hallucination but does not remove it, and misreads ASCII diagrams | Check the citation behind anything surprising; the learner looks at the docs' diagrams directly |
| Gemini is confidently wrong about versions and limits | Label every claim; cite official docs with dates; `VERIFY` quotes the deciding sentence |
| A model rechecking its own claim is not verification | The learner opens the link and finds the quoted sentence before anything enters `Upgrades` |
| Unchecked material enters the closed world: *Search the web* imports, *Chats from Gemini*, notes converted to sources | Never use *Search the web* in the study notebook; untick *Chats from Gemini* in every source picker, Studio dialogs included; never **Convert to source** a study note |
| AI-drawn visuals (Video, Infographic, Canvas) can contradict verified diagrams | The learner draws first, then compares with the docs' diagrams |
| Analogies mislead beginners | Mapping table, 2 breaks with the misconception each causes, and the learner finds a third |
| Switching engines costs attention | Switch only between steps, with the card `DEBRIEF` prints |
| The open world invites passive reading | Gemini asks before it tells; `CONTEXT` is the only explaining mode and ends with a question |
| AI-generated quizzes and cards drift to definitions | Scenario-only prompts; skip definition cards; flashcards only from due `Weak links` lines |
| Without tracking, weak links pile up and are never retested | Boxes and due dates (§4) |

## 7. Tool selection

Tools are chosen for the learner, not because they exist. Every feature of both apps is rated on four questions:

1. **Active:** does it make the learner retrieve, produce, explain or decide?
2. **Accurate:** is it grounded in the docs or checkable? Wrong pictures and claims are hard to unlearn.
3. **Unique:** does it serve a step that nothing else in the setup serves better?
4. **Cheap:** does it cost few minutes and clicks for a beginner?

**Ratings:** Core passes all four and is used every week. Optional has a specific trigger. Skip adds nothing here. Never works against the method.

| Engine | Feature | Rating | Trigger / reason |
| --- | --- | --- | --- |
| NotebookLM | Chat with Custom instructions, length Default | Core | The only tool that keeps asking "why?" and grades reasoning; *Shorter* cuts off `DEBRIEF` |
| NotebookLM | Citations | Core | The learner's check on the AI |
| NotebookLM | Audio Overview: Deep Dive, Short, with the docs' diagram open | Core | Worked example; narration with a diagram beats either alone |
| NotebookLM | Join | Optional | One hop confuses the learner |
| NotebookLM | Notes, Save to note | Core | `Weak links` is the only progress record |
| NotebookLM | Quiz + Explain | Core | Delayed scenario retrieval on last week's module; predicted vs actual score |
| NotebookLM | Flashcards + Explain | Core | Spaced retrieval of due `Weak links` lines |
| NotebookLM | Delete chat history | Optional | Start of a new module, after `DEBRIEF` is saved |
| NotebookLM | Data Table | Optional, once | Failure matrix after the module covering most components; paper first |
| NotebookLM | Mobile app | Optional | Due flashcards on the go; no scores kept |
| NotebookLM | Mind Map | Skip | Topic tree without causal arrows; the docs' diagrams show the flow |
| NotebookLM | Audio Brief, Critique, Debate | Skip | Passive; `DESIGN` practises trade-offs actively |
| NotebookLM | Learning Guide preset | Skip | Replaced by the Custom instructions |
| NotebookLM | Reports, Slide Deck | Skip | For reading or presenting, not retrieval |
| NotebookLM | Video Overview, Infographic | Never | Passive; AI-drawn pictures can contradict verified diagrams |
| NotebookLM | Search the web for new sources (Fast / Deep Research) | Never in the study notebook | Imports unchecked pages into the closed world |
| Gemini | Gem (instructions only, no default tool, no Knowledge) + **+** → NotebookLM per chat | Core | One mentor persona, reusable across subjects |
| Gemini | Deep Research | Optional | At most twice per course, for broad `CONTEXT` topics |
| Gemini | Photo upload (`REVIEW`) | Optional | Modules whose docs have no diagram |
| Gemini | Canvas | Skip | An AI redraw competes with verified diagrams |
| Gemini | Guided Learning; quizzes and flashcards in chat | Skip | A second tutor without the method's rules; not grounded; no progress kept |
| Gemini | Gemini Live | Depends on the goal | Skip for "understand for work"; Optional for interviews (below) |
| Gemini | Scheduled actions | Skip | Cannot read `Weak links`; a repeating calendar event is enough |
| Gemini | Notebooks inside Gemini | Skip | Hidden memory and a third instruction set to maintain |

**Goal-dependent switches** (set at intake):
- **Understand for work** (the Kubernetes learner): the table as is. `INTERVIEW` is optional, and its feedback is strengths, gaps and what to study next.
- **Interviews:** `INTERVIEW` in every module, with a hire / no-hire signal. Gemini Live is Optional for a spoken repeat; first ask it to list its commands, to confirm the Gem's rules loaded (not yet verified).
- **Certification:** add an exam-style quiz in Gemini (open-world, cited) next to NotebookLM's grounded quiz.

**Re-audit.** At SKILL.md step 8, list every current feature of both apps, not just the ones in use. Rate each new feature with the four questions and record the decision here, including Skip and Never. Never add a tool only because it is new.

## 8. Research basis

- **Experts organise knowledge by causal principles; novices by surface features** (Chi, Feltovich & Glaser, 1981): the four question types.
- **You get better at what you retrieve** (testing effect: Roediger & Karpicke, 2006): retrieve causal chains, not definitions.
- **Guessing before learning primes it** (pretesting: Richland, Kornell & Kao, 2009): the sketch before the audio.
- **Narration plus a diagram beats either alone** (modality effect: Mousavi, Low & Sweller, 1995): the audio with the docs' diagram open.
- **Explaining each step to yourself builds understanding** (self-explanation effect: Chi et al., 1989): `TRACE`.
- **Worked examples first, problems after** (expertise reversal effect: Kalyuga et al., 2003): audio first, then `PREDICT` / `DIAGNOSE` / `INCIDENT`.
- **Predict, then observe, then explain** (White & Gunstone, 1992): `PREDICT`.
- **Comparing cases builds transferable ideas** (analogical encoding: Gentner, Loewenstein & Thompson, 2003): the lab against current practice.
- **Spaced, repeated retrieval makes memory last** (Cepeda et al., 2006; successive relearning: Rawson & Dunlosky, 2011); dropping an item after one correct recall hurts retention (Karpicke & Roediger, 2008): boxes and due dates.
- **High-confidence errors are the ones corrected best** (hypercorrection: Butterfield & Metcalfe, 2001): `sure:` and *Confident errors*.
- **Smooth explanations make learners overconfident** (Dunlosky & Rawson, 2012); **delayed judgements are accurate** (Nelson & Dunlosky, 1991): predicted vs actual quiz scores, next week's blank redraw.
- **Mixing topics teaches discrimination** (interleaving: Rohrer & Taylor, 2007): the mixed drill and the quiz on last week's module.

## 9. Adapting to a new subject

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
| Reference diagrams | Theory, Lab 3 Overview, the Lab 1 network doc (all modules except identity) | to find in the learner's docs at step 4; a module without one gets `REVIEW` and a `Gaps` line |

## 10. Engine facts

Verified 2026-11-07 and 2026-11-08 (UI details against the user's screenshots on 2026-11-08). Re-check with WebSearch when older than about 3 months.

**NotebookLM:**
- **Custom chat:** the **⋮** menu at the top right (next to **Share**) → **Configure Chat** → goal **Custom** takes instructions of up to **10,000 characters** (the dialog shows a `0 / 10000` counter). The dialog offers the goals *Default*, *Learning Guide* and *Custom*, and a response length of *Default*, *Longer* or *Shorter*. The same menu has *Customize notebook*, *Copy notebook*, *Analytics* and *Delete chat history*. The sliders icon in the chat box is **not** chat configuration: it opens app connectors (Google Drive, Connect an app).
- **Name:** the app's footer reads "Gemini Notebook"; third-party guides say NotebookLM was renamed in July 2026. The URL and the guides still say NotebookLM.
- **Gemini chats as sources:** Gemini conversations that use the notebook appear in the Sources panel as a **Chats from Gemini** group, and **Select all** ticks them too.
- **Search the web for new sources:** the box at the top of the Sources panel (**Web**, **Fast Research** or **Deep Research**) finds web pages and can import them, and a Deep Research report, as sources.
- **Notes:** each note has a **Convert to source** button (seen 2026-11-08) that turns it into a source. Study notes (`Weak links`, `Gaps`, `Upgrades`) must never be converted.
- **Chat history:** each notebook has one saved chat thread per person. **⋮** → **Delete chat history** clears all of it; single messages cannot be deleted. **Save to note** sits under each reply, and **Add note** at the bottom of the Studio panel.
- **Audio Overview:** formats Deep Dive, Brief, Critique and Debate; lengths Short, Default and Long. Interactive **Join** reportedly works for Deep Dive only, and in English.
- **Video Overview:** formats Explainer, Short and Cinematic, in AI-generated visual styles; generating one can take 30 minutes or more.
- **Reports:** Briefing, Study guide, Blog post and *Create your own*; FAQ and Timeline may have become custom-only.
- **Flashcards and Quiz:** topic box, difficulty, number, language, source picker, and **Explain** with citations. The topic box is a hint, not a hard rule. No scores or progress are kept.
- **Data Table:** a Studio output with a custom prompt; it exports to Google Sheets.
- **Mobile app:** Audio Overviews can be downloaded for offline listening inside the app; flashcards and quizzes work on the phone.
- **Studio dialogs, seen 2026-11-05 and 2026-11-08:**
  - *Customize Audio Overview*: Format, Choose language, Length, Sources, the box *What should the AI hosts focus on in this episode?*, and suggestion chips that append text to the box.
  - *Flashcards*: Number of Cards, Level of Difficulty, Include Images, Choose language, Sources, topic box and chips.
- **Sources:** an uploaded file is a static copy. A changed file must be removed and re-uploaded; the sync script reports which ones. The free tier allows 50 sources per notebook; Pro allows more.

**Gemini:**
- **Notebooks as sources:** a notebook is attached in a chat with **+** → **NotebookLM** (documented by Google; Workspace accounts need NotebookLM enabled by the admin). Since April 2026, notebooks also live inside Gemini and sync both ways.
- **Gems:** created on the web only, through the side panel → **Gems** (or **Explore Gems**) → **New Gem**, with Name, Instructions, a default tool (including Guided Learning, Canvas and Deep Research) and Knowledge files; usable on mobile afterwards. Attaching a notebook as Gem Knowledge is reported but not confirmed, so this method attaches it per chat. Not yet checked against the user's screen.
- **Guided Learning:** a Socratic tutor mode that builds a study plan; Gemini can also make quizzes, flashcards and study guides in chat.
- **Gemini Live:** voice conversation, with camera and screen sharing on mobile. Whether it uses a Gem's instructions and an attached notebook is unconfirmed.
- **Scheduled actions:** recurring prompts (daily, weekly or monthly), up to 10 at a time, at fixed intervals; on paid plans.
- **Notebooks inside Gemini:** per-notebook instructions and a notebook memory.
- **Canvas** builds interactive diagrams and pages; **Deep Research** writes long, cited reports.

Sources:
- [NotebookLM custom chat, 10,000 characters (Android Authority)](https://www.androidauthority.com/notebooklm-chat-customization-upgrade-3622570/)
- [NotebookLM Audio Overview formats (9to5Google)](https://9to5google.com/2025/09/02/notebooklm-audio-overview-debate/)
- [NotebookLM flashcards and quizzes (9to5Google)](https://9to5google.com/2025/09/08/notebooklm-flashcards-quizzes/)
- [NotebookLM adds Deep Research and more source types (Google blog)](https://blog.google/technology/google-labs/notebooklm-deep-research-file-types/)
- [NotebookLM new report formats (Android Authority)](https://www.androidauthority.com/notebooklm-new-report-formats-3673677/)
- [NotebookLM Video Overview guide (Chrome Story, 07/2026)](https://chromestory.com/2026/07/notebooklm-video-overview/)
- [NotebookLM app flashcards and quizzes (9to5Google)](https://9to5google.com/2025/11/06/notebooklm-app-flashcards-quizzes/)
- [Data Tables in NotebookLM (Google blog)](https://blog.google/technology/google-labs/notebooklm-data-tables/)
- [Use chat in NotebookLM (Google support)](https://support.google.com/notebooklm/answer/16179559?hl=en)
- [NotebookLM in Gemini (Workspace Updates, 01/2026)](https://workspaceupdates.googleblog.com/2026/01/take-notebooks-further-notebooklm-gemini.html)
- [Notebooks in the Gemini app (9to5Google, 04/2026)](https://9to5google.com/2026/04/08/gemini-app-notebooks/)
- [Create a custom Gem in the Gemini app (Chrome Story, 07/2026)](https://chromestory.com/2026/07/create-gem-gemini-app/)
- [Gemini Gems guide (Zapier)](https://zapier.com/blog/gemini-gems/)
- [Guided Learning in Gemini (Google blog)](https://blog.google/products-and-platforms/products/gemini/guided-learning-google-gemini/)
- [How to use Gemini Live's camera and screen sharing (Android Central)](https://www.androidcentral.com/apps-software/ai/how-use-gemini-live-camera-screen-sharing)
- [Schedule actions in Gemini Apps (Google support)](https://support.google.com/gemini/answer/16316416?hl=en-GB)

## 11. Anti-patterns seen so far

- **Flashcard rounds per chapter** produced "What is X?" cards; replaced by this framework.
- **Adding tools one by one as the learner asks** (Audio, then Video, then Mind Map) instead of rating every feature up front; replaced by §7 and an independent second design to compare against.
- **`PREDICT` failures the docs never describe** make NotebookLM improvise. Grep first; move them to Gemini.
- **Prompts asserting version facts** ("X is GA since …") go stale and get repeated as truth. Name topics; let Gemini verify.
- **A model "verifying" its own claim.** Only the quoted sentence on the official page, seen by the learner, counts.
- **`Weak links` without a schedule** pile up and are never retested; use boxes and due dates.
- **Guessing where a button is.** UI steps come only from the user's screenshots or dated sources.
- **Uploading the study guide itself as a source** makes the AI quiz about the method. Keep it out of the notebook.
- **Asking the learner to recall IPs, ports or names from labs** is trivia. Scenarios may *show* them, but questions never ask for them.
