

Here are the two annotation files diagrammed with their h-M3 prototype mapping.

```
╔═══════════════════════════════════════════════════════════════════════════════╗
║                  ANNOTATION FORMAT : h-M3 PROTOTYPE MAP                     ║
╠═══════════════════════════════════════════════════════════════════════════════╣
║                                                                             ║
║  .an.md Section          h-M3 Primitive        Stratum      Modality        ║
║  ─────────────────────   ──────────────────     ─────────    ────────        ║
║  Artifact Summary        SLOT                   STRUCTURE    FORMAL          ║
║  Intent (prose)          PROSE (GROUND)          SUBSTANCE    GENERATIVE     ║
║  Structure               SLOT (nested)           STRUCTURE    FORMAL          ║
║  Symbols                 TERM                    SUBSTANCE    FORMAL          ║
║  Dependencies            RELATION                STRUCTURE    GENERATIVE     ║
║  Patterns                PROSE (DERIVE)          SUBSTANCE    GENERATIVE     ║
║  Hotspots                SLOT                    STRUCTURE    FORMAL          ║
║  Understanding           OUTCOME (JUDGE)         TELOS        FORMAL          ║
║                                                                             ║
╚═══════════════════════════════════════════════════════════════════════════════╝


╔═══════════════════════════════════════════════════════════════════════════════╗
║                     actions.js.an.md                                        ║
║                     h-M3 Prototype                                          ║
╠═══════════════════════════════════════════════════════════════════════════════╣
║                                                                             ║
║  TELOS ─────────────────────────────────────────────────────────────────     ║
║  │                                                                          ║
║  │  Understanding (OUTCOME / JUDGE)                                         ║
║  │  ┌─────────────────────────────────────────────────────────────┐         ║
║  │  │ confidence: 0.9                                             │         ║
║  │  │ key_findings:                                               │         ║
║  │  │   - Pure action-creator module, SAM pattern                 │         ║
║  │  │   - ~80 exports across 16 domain clusters                  │         ║
║  │  │   - 4 implicit state machines                               │         ║
║  │  │ gaps:                                                       │         ║
║  │  │   - Model acceptance logic not visible                      │         ║
║  │  │   - Dead code unknown                                       │         ║
║  │  └─────────────────────────────────────────────────────────────┘         ║
║  │                                                                          ║
║  DYNAMICS ──────────────────────────────────────────────────────────────     ║
║  │                                                                          ║
║  │  Patterns / Implicit State Machines (TRANSITION)                         ║
║  │  ┌─────────────────────────────────────────────────────────────┐         ║
║  │  │                                                             │         ║
║  │  │  FSM: Prompt Lifecycle                                      │         ║
║  │  │  composing ──→ submitted ──→ streaming ──→ complete         │         ║
║  │  │       │                          │              │           │         ║
║  │  │       └──── cancelled ◄──────────┘     error ◄──┘           │         ║
║  │  │                                                             │         ║
║  │  │  FSM: Story Derivation                                      │         ║
║  │  │  idle ──→ deriving ──→ reviewing ──→ ready ──→ committed    │         ║
║  │  │                           │                                 │         ║
║  │  │                           └──→ cancelled                    │         ║
║  │  │                                                             │         ║
║  │  │  FSM: Sprint Orchestration                                  │         ║
║  │  │  planning ──→ approved ──→ mode_selected ──→ implementing   │         ║
║  │  │                                 │               │    │      │         ║
║  │  │                                 │          paused    │      │         ║
║  │  │                                 │               │    ▼      │         ║
║  │  │                                 │           reviewing       │         ║
║  │  │                                 │               │           │         ║
║  │  │                                 │            fixing         │         ║
║  │  │                                 │               │           │         ║
║  │  │                                 └───────── complete         │         ║
║  │  │                                                             │         ║
║  │  │  FSM: GitHub Auth                                           │         ║
║  │  │  unauth ──→ authenticating ──→ authenticated                │         ║
║  │  │                    │                  │                     │         ║
║  │  │                    └──→ error     logout──→ unauth          │         ║
║  │  │                                                             │         ║
║  │  └─────────────────────────────────────────────────────────────┘         ║
║  │                                                                          ║
║  STRUCTURE ─────────────────────────────────────────────────────────────     ║
║  │                                                                          ║
║  │  Artifact (SLOT) ── the file itself                                      ║
║  │  ┌─────────────────────────────────────────────────────────────┐         ║
║  │  │ path: test-dsl/actions.js                                   │         ║
║  │  │ kind: module                                                │         ║
║  │  │ size: 1381 lines, ~80 exports                               │         ║
║  │  │ tags: [sam-pattern, actions, state-management, pure-fns]    │         ║
║  │  └──────────────────────┬──────────────────────────────────────┘         ║
║  │                         │                                                ║
║  │                    contains (nested SLOTs)                               ║
║  │                         │                                                ║
║  │    ┌────────────────────┼────────────────────┐                           ║
║  │    ▼                    ▼                    ▼                            ║
║  │  ┌──────────┐   ┌──────────────┐   ┌─────────────────┐                  ║
║  │  │ App      │   │ Prompt/      │   │ Sprint          │   ... 13 more    ║
║  │  │ Lifecycle│   │ History      │   │ (30+ actions)   │                  ║
║  │  │ 4 fns    │   │ 16 fns       │   │ lines 808-1228  │                  ║
║  │  │ L:14-45  │   │ L:71-233     │   │ HOTSPOT         │                  ║
║  │  └──────────┘   └──────────────┘   └─────────────────┘                  ║
║  │                                                                          ║
║  │  Dependencies (RELATION)                                                 ║
║  │  ┌─────────────────────────────────────────────────────────────┐         ║
║  │  │                                                             │         ║
║  │  │  formatters.js ──imports──→ actions.js                      │         ║
║  │  │                    (generateId only, weight: normal)        │         ║
║  │  │                                                             │         ║
║  │  │  renderer/UI ──calls──→ actions.js  (weight: critical)      │         ║
║  │  │  model (SAM) ◄──receives proposals── actions.js (critical)  │         ║
║  │  │  next-action ──calls──→ actions.js  (weight: normal)        │         ║
║  │  │                                                             │         ║
║  │  └─────────────────────────────────────────────────────────────┘         ║
║  │                                                                          ║
║  SUBSTANCE ─────────────────────────────────────────────────────────────    ║
║  │                                                                          ║
║  │  Symbols (TERM)                     Intent (PROSE)                       ║
║  │  ┌──────────────────────┐           ┌──────────────────────────┐        ║
║  │  │ Canonical signature: │           │ GROUND:                  │        ║
║  │  │  (...) => {          │           │ Pure action creators     │        ║
║  │  │    type: string,     │           │ that produce proposals   │        ║
║  │  │    payload: object   │           │ for the SAM model.       │        ║
║  │  │  }                   │           │ Never mutate state.      │        ║
║  │  │                      │           │                          │        ║
║  │  │ Key fields:          │           │ DERIVE:                  │        ║
║  │  │  - type (87 variants)│           │ Temporal stamping for    │        ║
║  │  │  - payload           │           │ event ordering.          │        ║
║  │  │  - timestamp         │           │ ID generation at action  │        ║
║  │  │  - generateId (ext)  │           │ boundary = idempotent    │        ║
║  │  │                      │           │ proposals.               │        ║
║  │  └──────────────────────┘           └──────────────────────────┘        ║
║  │                                                                          ║
║  │  Hotspots (SLOT -- attention markers)                                    ║
║  │  ┌─────────────────────────────────────────────────────────────┐         ║
║  │  │ ! L:112  completeResponse -- deviates from arrow pattern   │         ║
║  │  │ ! L:308  receiveDerivedStories -- non-trivial transform    │         ║
║  │  │ ! L:416  createStoryGeneration -- ISO vs epoch timestamp   │         ║
║  │  │ ! L:808  Sprint cluster -- highest complexity zone         │         ║
║  │  └─────────────────────────────────────────────────────────────┘         ║
║                                                                             ║
╚═══════════════════════════════════════════════════════════════════════════════╝


╔═══════════════════════════════════════════════════════════════════════════════╗
║                     kiosk-main.html.an.md                                   ║
║                     h-M3 Prototype                                          ║
╠═══════════════════════════════════════════════════════════════════════════════╣
║                                                                             ║
║  TELOS ─────────────────────────────────────────────────────────────────     ║
║  │                                                                          ║
║  │  Understanding (OUTCOME / JUDGE)                                         ║
║  │  ┌─────────────────────────────────────────────────────────────┐         ║
║  │  │ confidence: 0.85                                            │         ║
║  │  │ key_findings:                                               │         ║
║  │  │   - Static HTML shell for iPad kiosk menu                   │         ║
║  │  │   - Unrelated to Puffin (Thai restaurant domain)            │         ║
║  │  │   - 2 implicit state machines                               │         ║
║  │  │   - Strong accessibility despite kiosk context              │         ║
║  │  │ gaps:                                                       │         ║
║  │  │   - kiosk-app.js not available                              │         ║
║  │  │   - CSS and menu-data.js unknown                            │         ║
║  │  └─────────────────────────────────────────────────────────────┘         ║
║  │                                                                          ║
║  DYNAMICS ──────────────────────────────────────────────────────────────     ║
║  │                                                                          ║
║  │  Implicit State Machines (TRANSITION)                                    ║
║  │  ┌─────────────────────────────────────────────────────────────┐         ║
║  │  │                                                             │         ║
║  │  │  FSM: Idle Timeout                                          │         ║
║  │  │  active ──timeout──→ idle_slideshow                         │         ║
║  │  │    ▲                      │                                 │         ║
║  │  │    │ touch            extended                              │         ║
║  │  │    │                  inactivity                             │         ║
║  │  │    │                      ▼                                 │         ║
║  │  │    ├── continueBtn ── idle_warning                          │         ║
║  │  │    │                      │                                 │         ║
║  │  │    │                  countdown=0                            │         ║
║  │  │    │                      ▼                                 │         ║
║  │  │    └──────────────── reset (clear all)                      │         ║
║  │  │                                                             │         ║
║  │  │  FLOW: Ordering Workflow                                    │         ║
║  │  │  ┌───────┐    ┌──────────────┐    ┌──────────┐             │         ║
║  │  │  │ 1.    │    │ 2.           │    │ 3.       │             │         ║
║  │  │  │Slide- │──→ │Browse menu + │──→ │Summary / │             │         ║
║  │  │  │ show  │    │compose meal  │ ◄──│instruct  │             │         ║
║  │  │  │(idle) │    │(main+sidebar)│    │(modals)  │             │         ║
║  │  │  └───────┘    └──────────────┘    └────┬─────┘             │         ║
║  │  │                                        │                   │         ║
║  │  │                                   4. PHYSICAL              │         ║
║  │  │                               (photo → counter)            │         ║
║  │  │                                                             │         ║
║  │  └─────────────────────────────────────────────────────────────┘         ║
║  │                                                                          ║
║  STRUCTURE ─────────────────────────────────────────────────────────────     ║
║  │                                                                          ║
║  │  Artifact (SLOT) ── the file itself                                      ║
║  │  ┌─────────────────────────────────────────────────────────────┐         ║
║  │  │ path: test-dsl/kiosk-main.html                              │         ║
║  │  │ kind: file (HTML document)                                  │         ║
║  │  │ size: 469 lines                                             │         ║
║  │  │ tags: [ui, kiosk, html, ipad, restaurant, accessibility]   │         ║
║  │  └──────────────────────┬──────────────────────────────────────┘         ║
║  │                         │                                                ║
║  │                    contains (nested SLOTs)                               ║
║  │                         │                                                ║
║  │         ┌───────────────┼───────────────┐                                ║
║  │         ▼               ▼               ▼                                ║
║  │  ┌────────────┐  ┌────────────┐  ┌────────────┐                         ║
║  │  │ kiosk-     │  │ kiosk-     │  │ kiosk-     │                         ║
║  │  │ header     │  │ sidebar    │  │ main       │                         ║
║  │  │ L:47-72    │  │ L:75-120   │  │ L:123-184  │                         ║
║  │  │ branding   │  │ drop-zone  │  │ menu grid  │                         ║
║  │  └────────────┘  │ HOTSPOT    │  │ pagination │                         ║
║  │                  └────────────┘  └────────────┘                         ║
║  │                                                                          ║
║  │         ┌──────────────────────────────────────┐                         ║
║  │         │         6 Modal SLOTs                │                         ║
║  │         │  ┌────────┐ ┌──────────┐ ┌────────┐ │                         ║
║  │         │  │hours   │ │dishZoom  │ │summary │ │                         ║
║  │         │  │L:188   │ │L:225     │ │L:251   │ │                         ║
║  │         │  └────────┘ └──────────┘ └────────┘ │                         ║
║  │         │  ┌────────┐ ┌──────────┐ ┌────────┐ │                         ║
║  │         │  │slide-  │ │instruct- │ │idle-   │ │                         ║
║  │         │  │show    │ │ion       │ │warning │ │                         ║
║  │         │  │L:301   │ │L:385     │ │L:442   │ │                         ║
║  │         │  │HOTSPOT │ │          │ │        │ │                         ║
║  │         │  └────────┘ └──────────┘ └────────┘ │                         ║
║  │         └──────────────────────────────────────┘                         ║
║  │                                                                          ║
║  │  Dependencies (RELATION)                                                 ║
║  │  ┌─────────────────────────────────────────────────────────────┐         ║
║  │  │                                                             │         ║
║  │  │  kiosk-theme.css ──styles──→ kiosk-main.html  (critical)    │         ║
║  │  │  kiosk-layout.css ──styles──→ kiosk-main.html (critical)    │         ║
║  │  │  menu-data.js ──data──→ kiosk-main.html       (critical)    │         ║
║  │  │  kiosk-app.js ──logic──→ kiosk-main.html      (critical)    │         ║
║  │  │  logo.png ──asset──→ kiosk-main.html           (normal)     │         ║
║  │  │  img/menu/*.jpg ──assets──→ slideshow          (normal)     │         ║
║  │  │                                                             │         ║
║  │  │  LOAD ORDER (TRANSITION / sequence):                        │         ║
║  │  │  menu-data.js (sync) ; kiosk-app.js (defer)                 │         ║
║  │  │                        HOTSPOT ^                            │         ║
║  │  └─────────────────────────────────────────────────────────────┘         ║
║  │                                                                          ║
║  SUBSTANCE ─────────────────────────────────────────────────────────────    ║
║  │                                                                          ║
║  │  Symbols (TERM)                     Intent (PROSE)                       ║
║  │  ┌──────────────────────┐           ┌──────────────────────────┐        ║
║  │  │ DOM IDs (20+):       │           │ GROUND:                  │        ║
║  │  │  mealComposition     │           │ iPad kiosk for Thai      │        ║
║  │  │  compositionItems    │           │ restaurant. Visual menu  │        ║
║  │  │  dishGrid            │           │ aid -- no payment, no    │        ║
║  │  │  categoryTabs        │           │ network ordering.        │        ║
║  │  │  slideshowModal      │           │                          │        ║
║  │  │  idleWarningModal    │           │ DERIVE:                  │        ║
║  │  │  kioskToast          │           │ Analog-terminating flow. │        ║
║  │  │  ...                 │           │ Time-conditional content │        ║
║  │  │                      │           │ via data attributes.     │        ║
║  │  │ ARIA attrs:          │           │ Progressive enhancement  │        ║
║  │  │  aria-live="polite"  │           │ with inline CSS fallback.│        ║
║  │  │  aria-modal="true"   │           │                          │        ║
║  │  │  role="alertdialog"  │           │                          │        ║
║  │  └──────────────────────┘           └──────────────────────────┘        ║
║                                                                             ║
╚═══════════════════════════════════════════════════════════════════════════════╝
```

The key thing to notice: each annotation file follows the same vertical spine (TELOS → DYNAMICS → STRUCTURE → SUBSTANCE), which mirrors the h-M3 strata. The top tells you *whether you understand it*. The middle tells you *what changes and how things connect*. The bottom tells you *what's concretely there*.