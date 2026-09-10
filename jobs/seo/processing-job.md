trong app có rất nhiều jobs chạy background như optimize ảnh, hay optimize content. có 1 vấn đề về trải nghiệm là khi chuyển trang sẽ không xem được tiến trình chạy và có bao nhiêu jobs đang chạy, vậy nên k muốn làm 1 pop nhỏ show dưới góc bên trái show các job đang chjay dạng chekclist đã xong đang chjay, cấp link vào trang xem chi tiết luôn, cần có UI UX đẹp, nhỏ gọn tránh LCP pagespeed app

---

## Progress

Started: 2026-09-10
Repo: `/Users/nguyentuan/orca/workspaces/seo/waspfish` (branch `waspfish`)
Design spec: `docs/superpowers/specs/2026-09-10-job-progress-dock-design.md`

Tracking note: this session has no TaskCreate/TodoWrite tool, so this table is the only tracker.

| #   | Task                                          | Agent / Model                 | Status | Rounds | Sec | Notes                          |
| --- | --------------------------------------------- | ----------------------------- | ------ | ------ | --- | ------------------------------ |
| 0   | Local env up (emulators + tunnel)             | inline                        | ✅     | 1/5    | —   | probes 200/200/200/401         |
| 1   | Registry core: const + service + unit tests   | backend-implementer / opus    | ✅     | 2/5    | clean | 17/17 jest; race fixed in r2   |
| 2   | Firestore rule for `shopJobs`                 | inline                        | ✅     | 1/5    | clean | get 200 / list 403 / write 403 |
| 3   | Producer: image optimize + alt text           | backend-implementer / sonnet  | ✅     | 2/5    | clean | 9 sites; 3 branches indeterminate by decision |
| 3a  | Registry: in-process throttle guard            | backend-implementer / sonnet  | ✅     | 1/5    | clean | 22/22 jest                     |
| 3b  | Staleness rule (JOB_STALE_MS) + counts          | inline                        | ✅     | 1/5    | clean | NEW — dead run must not read as running |
| 4   | FE: jobProgressContext (single onSnapshot)    | frontend-implementer / sonnet | ✅     | 2/5    | clean | ISO-timestamp sort bug fixed   |
| 5   | FE: JobProgressDock component + i18n json     | frontend-implementer / sonnet | ✅     | 1/5    | clean | own 4.1KB lazy chunk           |
| 6   | FE: mount in MainFrame + ownerPaths filter    | frontend-implementer / sonnet | ✅     | 1/5    | clean | 19 insertions, 1 file          |
| 7   | Producer: bulk AI fix (`bulkFixJobs`)         | backend-implementer / sonnet  | ✅     | 1/5    | clean | 6 sites via one funnel         |
| 8   | Producer: AI content, 3 sections              | backend-implementer / sonnet  | ✅     | 1/5    | clean | 5 sites, 16 new test cases     |
| 14  | Add `JOB_STATUS.CANCELLED`                     | inline                        | ✅     | 1/5    | clean | 6 cancel paths split off failed |
| 9   | Producer: internal link, 3 collections        | backend-implementer / sonnet  | ✅     | 1/5    | clean | 12 files, 10 helper tests      |
| 10  | Producer: redirects, 4 collections            | backend-implementer / sonnet  | ✅     | 1/5    | clean | corrected my wrong collection  |
| 11  | Producer: search index sync + chunk adapter   | backend-implementer / opus    | ✅     | 1/5    | clean | 10/10 adapter tests            |
| 15  | Search-index progress must not sit at 100%     | opus → finished inline        | ✅     | 2/5    | clean | 17/17; agent died on rate limit |
| 12  | i18n: `yarn update-label-claude` + skill       | skill `avada-update-label`    | ✅     | 1/5    | clean | 27 keys × 9 locales            |
| 13  | Feature doc `docs/features/job-progress-dock.md` | inline                     | ✅     | 1/5    | clean |                                |

Order: 1 → 2 → 4 → **3a** → 3 → 5 → 6 (end-to-end viewable) → 7-11 in parallel → 12 → 13.
(3a was inserted after task 3's recon; no producer may be wired before it.)

### Decisions taken during brainstorming

- Aggregate at the **write** side (`shopJobs/{shopId}`, one doc, one listener), not via a polling
  REST endpoint. A `GET /jobs/active` reading 13 collections costs ~156 Firestore reads/min/shop.
- `type` is the merchant-visible job kind, not the collection — so AI content is three rows.
- Suppression uses `ownerPaths`, not `link`. Conflating them was a bug caught before any code.
- Dropped: sitemap, speed scan (no per-run job state doc), `aiFixJobs` (would duplicate bulk fix),
  single one-off AI fix (finishes too fast to read).
- Put back after being dropped: Elasticsearch / search-index sync — recon showed it is
  merchant-triggered and already rendered to merchants.

### Findings raised, deliberately NOT fixed here

- `firestore.rules:75-95` uses `allow read: if true` on `bulkFixJobs`, `aiFixJobs`,
  `optimizeReport` and others. `read` = `get` + `list`, so a client can list an entire
  collection, not just its own shop's doc — a cross-shop read. Pre-existing; own ticket.
- `useJobDataMigrate` is called with two different ids: `pages/Audit/Audit.js:72` passes
  `shop?.id`, `pages/Audit/Report.js:153` passes `shop?.shopId`. One of them reads with the
  wrong key.

### Log

#### ✅ Task 0: Local env up
- Status: ✅ completed
- `yarn install --frozen-lockfile` exit 0; functions babel build exit 0; assets production build exit 0
- Emulators `All emulators ready`; probes: UI 200, `/` 200, `/embed` 200, `/api/settings` 401
  (`Failed to parse session token 'undefined': jwt must be provided` — the expected success signal)
- Tunnel `atlantic-chose-den-personalized.trycloudflare.com`, preview URL on store `linhnguyen11`
- Two issues handled: created the missing `packages/assets/.env` (4th and last target of
  `vite.config.js:105-124`, so the tunnel URL still reached the other three); restarted the
  emulators because they had booted before vite wrote the tunnel into `.env.local`
- Note: `packages/functions/.env` is a symlink into the master checkout, so this worktree's dev
  run rewrote master's `APP_BASE_URL`

#### 🔄 Task 1: Registry core
- Agent: backend-implementer (opus)
- Status: 🔄 in-progress
- Plan:
  - Goal: `jobRegistryService.upsertJob()` maintains `shopJobs/{shopId}` — dedupe by jobKey,
    throttled writes, 24h prune of finished entries — with unit tests green. Nothing calls it yet.
  - Files allowed (all NEW, no existing file touched):
    - `packages/functions/src/const/jobRegistry.js`
    - `packages/functions/src/repositories/jobRegistryRepository.js`
    - `packages/functions/src/services/jobRegistryService.js`
    - `packages/functions/src/services/__tests__/jobRegistryService.test.js`
  - Approach: logic in the service, Firestore in the repository, test mocks the repository —
    the shape `services/__tests__/redirectJobStateService.test.js:1-13` already uses. Rejected:
    (a) all-in-repository, which cannot be tested without a live Firestore; (b) a subcollection
    per job, which multiplies reads and defeats the one-listener design.
  - Test command: `./node_modules/.bin/jest packages/functions/src/services/__tests__/jobRegistryService.test.js`
    — expect all tests passing.
  - Risk: an upsert on every progress tick multiplies Firestore writes on long jobs. The throttle
    is the mitigation and is what the tests must actually pin down.
  - Rollback: purely additive, no call sites yet — delete the four files.
- Rounds used: 2/5
- Round 1: built 4 files, 14/14 tests passed. Review FAILED.
  - Blocking bug: `upsertJob` was read-modify-write with a full-overwrite `set()`. Two jobs of the
    same shop interleave (A reads {A,B}, B reads {A,B}, A writes {A',B}, B writes {A,B'} → A' lost).
    Not an edge case — several concurrent jobs per shop is the whole point of the dock. A lost
    terminal write leaves a finished job showing as running until the TTL expires.
  - `set({merge: true})` was correctly ruled out: Firestore deep-merges nested maps and would
    resurrect exactly the entries the prune just dropped.
- Round 2: fix accepted. `repositories/jobRegistryRepository.js` now exposes
  `updateShopJobs(shopId, mutate)` running `firestore.runTransaction`; prune + throttle + merge all
  execute inside the transaction against the freshly-read map, `null` from the mutator means
  "throttled, issue no write". 17/17 tests, including two concurrency cases.
- Verified by me, not taken on report: `./node_modules/.bin/jest .../jobRegistryService.test.js`
  → `Test Suites: 1 passed, Tests: 17 passed`.
- Security check: **clean**. Diff = 3 modified files (204 insertions, 147 deletions) on top of the
  4 new files. No secret, no `.env`/lockfile/CI/`firebase.json`/rules touched, no new dependency,
  no `console.*`, doc keyed by `shopId`. `grep` confirms zero call sites of `upsertJob` outside its
  own module and tests — still additive.
- Deviation to flag: the agent ran `git commit` (`821a4eb013`) without being asked. Round 2 was left
  uncommitted in the working tree; no amend, no revert.
- Deferred out of this task, on purpose: the GCP TTL policy on `shopJobs.expireAt` (console/gcloud
  config, not code) → task 2. The `jobDataMigrate` chunk-summing adapter → task 11.
- Started: 2026-09-10
- Completed: 2026-09-10

#### 🔄 Task 2: Firestore rule for `shopJobs`
- Agent: inline (5 dictated lines — an agent for this is waste)
- Status: 🔄 in-progress
- Plan:
  - Goal: the client can `get` its own `shopJobs` doc; it cannot `list` the collection and cannot
    write. Plus record that the TTL policy still has to be created in GCP.
  - Files allowed: `firestore.rules` only.
  - Approach: `allow get: if true; allow write: if false;`. Rejected: copying the neighbouring
    `allow read: if true` (`firestore.rules:75-95`) — `read` = `get` + `list`, so that grants
    collection enumeration across every shop.
  - Test command: start the firestore emulator alone and confirm it loads the rules without a
    compile error (the emulator validates rules at startup). `emulators-macos` deliberately excludes
    firestore, so this is a separate one-off run.
  - Risk: a rules mistake is a live data-exposure change. Mitigated by being strictly tighter than
    every neighbouring rule.
  - Rollback: revert the single match block.
- Rounds used: 1/5
- **The first verification I proposed was worthless and I threw it out.** Starting the firestore
  emulator does NOT compile the rules: a negative control with a deliberate syntax error
  (`allow get: if ;`) started just as happily and ran the script. An earlier run had also produced a
  false green because the emulator died on a port clash and the phrase "Emulator UI" in the warning
  text matched the success grep.
- Real verification: drive the emulator's REST API as an unauthenticated client and measure
  behaviour. `@firebase/rules-unit-testing` is not installed and adding a dependency for this would
  be smuggling one in, so the emulator's own REST surface was used instead. Seeded through
  `Authorization: Bearer owner` (which bypasses rules), then requested with no auth at all:

  ```
  GET   shopJobs/testshop  : 200   (want 200)
  LIST  shopJobs           : 403   (want 403)
  WRITE shopJobs/testshop  : 403   (want 403)
  LIST  bulkFixJobs        : 200   ← discriminator
  ```

  The last line is what makes the other three mean something: a neighbouring collection declared
  `allow read: if true` DOES list, so the check is measuring the rule and not just failing to reach
  Firestore.
- Side effect of that discriminator: the cross-shop listing finding is now **confirmed empirically**,
  not merely read off the rules file. An unauthenticated client can list every shop's `bulkFixJobs`.
- Security check: **clean**. Diff is 7 added lines in `firestore.rules` and nothing else.
  `firestore.rules` is normally a forbidden file under the §8 checklist; here it is the task's whole
  point, and the change is strictly more restrictive than every rule around it.
- Still outstanding, NOT code: the TTL policy on `shopJobs.expireAt` has to be created in GCP
  (console or gcloud) or the `expireAt` field is inert and finished jobs are never swept. Needs
  Tony — writes to GCP are his call and the project id must be confirmed first.
- Started: 2026-09-10
- Completed: 2026-09-10


#### 🔄 Task 4: FE jobProgressContext
- Agent: frontend-implementer (sonnet). Dispatched in parallel with task 3's recon — the two share
  no files.
- Status: 🔄 in-progress
- Plan:
  - Goal: one React context opening exactly ONE `onSnapshot` on `shopJobs/{shopId}`, exposing the
    job list already filtered for route ownership. Data layer only, no UI.
  - Files allowed: `packages/assets/src/contexts/jobProgressContext.js` (NEW). Nothing else —
    MainFrame is task 6, the dock is task 5, and the 15 existing onSnapshot hooks stay untouched.
  - Approach: copy the subscription shape of `hooks/useBulkFixJob.js:20-35`; shop id from redux
    `state.shop.activeShop.id` (`hooks/useSyncRedirectState.js:24,34`); constants imported from the
    backend through the `@functions/*` alias, which is this repo's established way of keeping one
    definition. Rejected: a second polling hook (defeats the single-listener design) and duplicating
    the catalog on the frontend (the alias exists precisely to stop that drift).
  - Test command: `./node_modules/.bin/jest packages/assets/src` still green, plus
    `DISABLE_V8_COMPILE_CACHE=1 ./node_modules/.bin/eslint --fix <the new file>` exits 0.
  - Risk: getting rule 2 backwards again — suppression must compare `ownerPaths`, prefixed, against
    `location.pathname`, never `link`. Called out explicitly in the dispatch.
  - Rollback: additive, delete the file.

- Rounds used: 2/5
- Round 1: file built, eslint 0. Review FAILED.
  - Bug: `toMillis` only understood a Firestore Timestamp, but the registry writes the per-entry
    timestamps as ISO strings (`jobRegistryService` — `updatedAt: nowIso`). An ISO string fell
    through to `value || 0` and returned the string, so `toMillis(b) - toMillis(a)` was
    `string - string` = NaN, which silently disables a comparator. Ordering inside each group was
    arbitrary — the "newest first" the task asked for never happened.
- Round 2: fixed inline rather than spending an agent round on three lines. `toMillis` now parses
  an ISO string with `Date.parse`, keeps the Timestamp path, and passes numbers through.
- Verified: `eslint exit=0`, and the comparator proven on ISO input → `new > mid > old`.
- Pre-existing failures confirmed NOT ours: `./node_modules/.bin/jest packages/assets/src` reports
  2 failures (`onPageListQuery.helpers.test.js`, `overviewCardScore.test.js`). `grep` shows
  `jobProgressContext` is imported nowhere yet, so it cannot be reached by any test.
- Security check: **clean**. One new file; no secret, no dependency, no forbidden file. The listener
  reads only `shopJobs/{activeShop.id}`, and task 2's rule denies `list`, so a wrong id cannot
  become an enumeration.
- Accepted inference, worth confirming at task 5: `runningCount`/`doneCount` are computed from
  `visibleJobs`, not the raw list — a job hidden by route ownership should not move a badge on the
  very page that already displays it.
- Note for task 6: the provider calls `useLocation()`, so it must be mounted INSIDE the Router
  (`layouts/AppTranslate.js:94-140`), not above it.
- Started: 2026-09-10
- Completed: 2026-09-10

#### ⬜ Task 3a: Registry in-process throttle guard (NEW)
- Agent: backend-implementer (sonnet)
- Status: ⬜ pending
- Why this exists: task 3's recon showed image-optimize increments its counters **once per image**
  (`services/optimize/productService.js:108`), and there are ~15 write points across the family.
  Task 1 deliberately moved the throttle INSIDE the transaction to close the write race — correct
  for correctness, but it means no call is free: every `upsertJob` opens a Firestore transaction
  before it can discover it was going to be throttled. Wiring that into a per-image loop is one
  transaction per image.
- Scope creep, split out rather than absorbed into task 3, per tony-wf §6.
- Plan:
  - Goal: `upsertJob` returns without touching Firestore when this process already wrote the same
    job key within the throttle window and progress has not moved past the delta.
  - Files allowed: `services/jobRegistryService.js` and its existing test file only.
  - Approach: a module-level `Map` of jobKey → {lastWriteMs, lastRatio}, consulted BEFORE
    `updateShopJobs`. Terminal statuses always bypass it. The in-transaction throttle stays exactly
    as it is — the guard is an optimisation in front of it, never a replacement, because a single
    process's memory cannot see another instance's writes.
  - Bounding: the Map must not grow without limit across a long-lived worker process — entries are
    dropped when a job reaches a terminal status, and stale entries older than the retention window
    are swept on write.
  - Test command: `./node_modules/.bin/jest packages/functions/src/services/__tests__/jobRegistryService.test.js`
  - Risk: a guard that also swallowed terminal writes would strand a finished job as "running"
    forever. That case gets an explicit test.
  - Rollback: delete the guard; the in-transaction throttle still holds correctness on its own.

- Rounds used: 1/5
- Verified by me: `./node_modules/.bin/jest .../jobRegistryService.test.js` → 22 passed.
- Review PASS. Checked the three things that could have gone wrong: terminal status bypasses the
  guard (`isGuardedByLocalWrite` returns false on terminal, and `recordLocalWrite` deletes the key);
  the Map is bounded because the sweep drops anything older than the 3s window, so it only ever
  holds keys written in the last 3s; and `wrote` is reset INSIDE the mutator, which is right because
  Firestore re-runs the callback on contention and only the last invocation commits.
- `recordLocalWrite` stamps `callTime` (taken before the transaction) rather than the commit time.
  The skew is in the safe direction — the window expires early, so more writes, never fewer.
- Test-isolation change disclosed by the agent and accepted: `__resetJobRegistryGuard()` added to
  `beforeEach`. It is new isolation infrastructure for real module state, not an assertion bent to
  match the code — several existing tests reuse the same job key back to back.
- Security check: **clean**. Two files, no secret, no dependency, no forbidden file, no `console.*`.
- Started / Completed: 2026-09-10

#### ✅ Task 3b: Staleness rule (NEW)
- Agent: inline
- Status: ✅ completed
- Why this exists: found while reading `helpers/imageOptimize/isOptimizeRunActive.js` for task 3.
  Nothing flips `doneOptimize` for a run that dies mid-flight — there is a real incident behind that
  comment (SEO-260827-btJ4n8), and the app already treats a job doc untouched for 15 minutes as
  dead, in three separate places. The registry inherited the same disease in a worse form: a dead
  run would have sat at `running` until the 24h TTL, so the dock would have promised work that had
  stopped. That breaks the dock's only real claim.
- Changes: `JOB_STALE_MS = 15 * 60 * 1000` in `const/jobRegistry.js` (same number as
  `OPTIMIZE_STALE_MS`, on purpose — two staleness rules for one run is how the dock and the page
  start disagreeing); `stale` computed per job in the context; `runningCount` / `staleCount` /
  `doneCount` are now three separate numbers.
- Two bugs in my own first patch, caught before moving on:
  1. `doneCount = visibleJobs.length - runningCount` counted a stale job as finished. It is neither.
  2. `isStale` read `Date.now()` at render, but a dead run sends no further snapshot — nothing would
     ever re-render to notice. Added a one-minute timer that runs ONLY while something claims to be
     running.
- Also replaced the `toMillis` I had hand-written in task 4: `@assets/helpers/datetime/toMillis`
  already existed and handles more shapes than mine did (`{seconds}` from a REST read). Writing a
  second one was exactly the drift the repo's "check whether it already exists" rule is about.
- Verified: `eslint --fix` exit 0; `./node_modules/.bin/jest packages/assets/src` → 228 passed,
  2 failed — the same two pre-existing failures as before this task, unchanged.
- Security check: **clean**. Two files, no secret, no dependency, no forbidden file.

#### 🔄 Task 5: JobProgressDock component
- Agent: frontend-implementer (sonnet), instructed to invoke the `ui-ux-pro-max` skill first — the
  brief asks for "UI UX đẹp, nhỏ gọn" and this is the only part of the feature a merchant looks at.
- Status: 🔄 in-progress. Dispatched in parallel with tasks 3 and 6.
- Plan:
  - Goal: the floating dock — collapsed pill with the running count and a done badge, expanding to
    a compact checklist, one row per job, each linking to the page that owns it.
  - Files allowed: `components/JobProgressDock/JobProgressDock.{js,json,scss}` (all NEW).
    MainFrame is task 6's, running at the same time; the export path and default export name were
    fixed in both dispatches so the two cannot disagree.
  - Approach: consume `useJobProgress()` and render `visibleJobs`, which is already sorted and
    already route-filtered. Rejected: letting the dock do its own filtering or sorting — that logic
    lives in the context precisely so there is one copy of it.
  - FOUR states, not three: running, done, failed, **stale**. Stale must not look like work in
    progress.
  - `total === 0` means unknown → indeterminate, never "0%" and never a full bar.
  - Test command: `eslint --fix` exit 0, and `jest packages/assets/src` failure count must not grow
    past the 2 that already fail in this worktree.
  - Risk: a fixed-position element that participates in first paint would defeat the LCP
    requirement; and a z-index above `FrameOverlay` (515) would punch through Polaris modals.
    Both stated as hard constraints in the dispatch (target ~400).
  - Rollback: additive, delete the folder.

#### 🔄 Task 6: Mount in MainFrame
- Agent: frontend-implementer (sonnet)
- Status: 🔄 in-progress
- Plan:
  - Goal: `JobProgressProvider` wraps the shell and the dock is lazily mounted after first paint,
    in both the embedded and standalone shells.
  - Files allowed: `layouts/MainFrame.js` ONLY.
  - Approach: `React.lazy` for the dock so it lands in its own chunk and adds zero bytes to the main
    bundle; mount flipped on in a `useEffect` so it is absent from the first frame;
    `<Suspense fallback={null}>` — a fallback that renders is a fallback that can shift layout.
  - Placement verified before dispatch: `Router` is at `layouts/AppTranslate.js:104` and wraps
    `AppLayoutFrame` → `MainFrame`, so the provider's `useLocation()` resolves.
  - Test command: `eslint --fix` exit 0; `jest packages/assets/src` count unchanged;
    `git diff --stat` on MainFrame.js must stay small — a large diff means the agent did more than
    the task.
  - Risk: mounting inside something that unmounts on navigation would make a running job's row
    flicker on every page change. Called out in the dispatch.
  - Rollback: revert the single file.

- Rounds used: 1/5
- Review PASS. Diff is 19 insertions in one file and every line traces to mounting.
- Two placement calls worth keeping: the provider wraps ONLY the dock, not the whole `Frame` — its
  value changes on every progress tick and the nav/topbar have no use for it, so a wide wrapper
  would re-render the shell each time a job nudges forward. And the mount sits outside
  `AppStatus{children}`, the subtree that swaps per route, so a running row does not unmount and
  flicker on every navigation.
- Verified: `eslint --fix` exit 0; `jest packages/assets/src` → 228 passed / 2 failed, the same two
  pre-existing failures, count unchanged; `git diff --stat` → 19 insertions, 1 deletion.
- Security check: **clean**. One file, no secret, no dependency, no forbidden file.
- Correction to the agent's report: it stated `@assets/contexts/jobProgressContext` does not exist
  yet. It does — task 4 created it. Only the dock component was missing at that moment.
- **Open risk, cannot be caught by any test — must be checked in the browser once task 5 lands:**
  the dock is `position: fixed` inside Polaris `<Frame>`. If any ancestor carries `transform`,
  `filter` or `perspective`, fixed positioning anchors to that ancestor instead of the viewport and
  the dock lands in the wrong place. Polaris `Frame` animates its nav on small screens, so this is a
  live possibility rather than a theoretical one.
- Started / Completed: 2026-09-10

#### ✅ Task 3: Producer — image optimize + alt text
- Agent: backend-implementer (sonnet). 2 rounds.
- Round 1: wired 8 of the 10 sites I named and **refused two**, correctly. My call-site list was
  wrong: I had `productService.js:436` and `fileImageService.js:285-289` down as batch writes in the
  bulk pipeline; a reachability trace showed they belong to the manual OTM flow, which writes
  `status:'done'` synchronously right after dispatch. A PROGRESS upsert there would land `running`
  AFTER `done`, with no FINISH to follow — the row would stick at running until the staleness window.
  Exactly the failure task 3b exists to prevent. They stay unwired.
  **Lesson carried into tasks 7-11: recon reads names, it does not prove reachability. Every producer
  task from here on must trace reachability before wiring.**
- Round 2: added the one real batch-level tick, `handlers/cron/subscribeRecursive.js` after the
  `resolveAll` containing the `countProductOptimize` increment — so the doc it reads is post-batch.
  Type is read from the history doc, not `shop.optimizingType` (a single scalar field that a
  concurrent alt pass would make wrong).
- **Known gap, accepted by Tony (option A, 2026-09-10):** only the by-product path has a batch-level
  `updateHistoryOptimize` to hang a tick on. Verified by grep, not assumed:
  - collections (`subscribeRecursive.js:392-395`) — no `historyOptimize` write at all
  - legacy product (`:396-400`) — writes `lastLineNo`/`lastProductId` to the **shop** doc via
    `updateShopCountProductLine:1005`, which `optimizeJobProgress()` cannot read
  - files (`services/optimize/optimizeImageJobLoop.js`) — `grep -c updateHistoryOptimize` = 0
  - blogs — `optimizeBlogImage` has only two callers, both manual OTM; there is no bulk recursion
    path for blogs at all
  These runs show an indeterminate "Processing…" rather than a percentage. This is not the dock
  failing: those pipelines have never counted progress, which is why the existing image page cannot
  show a percentage for them either. Closing it means adding counters to three production optimize
  pipelines — a different risk class from this additive feature, so it is out of scope here.
- processed/total derivation verified against source, not taken on trust:
  `pages/Image/Progress/ProgressBar/ProgressBar.js:50` computes
  `(countImage / totalAllPageImageCount) * 100`, and the new
  `helpers/optimize/optimizeJobRegistryMapping.js` mirrors exactly that.
- `shopId` at every call site is `shop.id` / `currentShop.id` — the Firestore doc id the dock keys
  on. Checked, because a shopify domain here would mean the dock silently never finds the doc.
- Verified by me: `./node_modules/.bin/jest packages/functions/src` → 1522 passed, 2 failed
  (`shopify2026Client.test.js`, `workListStore.test.js` — both pre-existing, neither shares a file
  or import with this diff).
- Real regression the agent found and fixed: `doneOptimizeFinalizeSideEffects.test.js` mocks
  `@google-cloud/firestore` down to `{FieldValue}`, so the new import chain made it construct a real
  `Firestore` and throw. Fixed by mocking `jobRegistryService`, matching that file's own pattern.
- Security check: **clean**. Additive only, no control-flow change, no secret, no dependency, no
  forbidden file.
- Ships to the worker fleet only via `[deploy-worker]` — `firebase deploy` does not update the box.

#### ✅ Task 5: JobProgressDock
- Verified: builds into its OWN chunk, `static/assets/JobProgressDock-*.js` at **4.1 KB** — the LCP
  constraint confirmed against the build artifact, not against a claim.
- Checked the three things that silently fail: Polaris 13.9.5 `Box` really does accept
  `position`/`insetBlockEnd`/`insetInlineStart`/`zIndex` (they are in its `.d.ts`); `Box` is a
  `forwardRef`, so the click-outside ref is not null; and all 14 `jobType.*` i18n keys match the 14
  `JOB_TYPE` values exactly — compared by script, not by eye.
- Security check: **clean**. Two new files, no secret, no dependency, no forbidden file.
- Preview published for Tony: https://claude.ai/code/artifact/352a555f-795f-4a31-ab84-ca6af90e0a99

#### ⬜ Task 12: i18n — route confirmed before it could block
- Checked ahead rather than discovering it at the end: **`GOOGLE_TRANSLATE_API_KEY` is not set**
  anywhere — not in `packages/functions/.env`, not in the shell env — so `yarn update-label` would
  die at `commands/autoTranslateV2.js:8`, where the Translate client is constructed with it.
- Working route needs no key:
  `yarn update-label-claude` → `commands/updateLabel.js:15` writes `.translate-request.json` at the
  repo root → the `avada-update-label` skill processes it with one Claude subagent per language.
  `updateLabel.js:44` prints that instruction itself.
- Deliberately NOT started yet: it fans out 9 language subagents, and 5 producer agents are already
  in flight; the global rule is to ask before going past 8 at once. It depends only on
  `JobProgressDock.json` (already written), not on any producer, so it runs cleanly once they land.
- Strings needing translation: 12 UI keys plus 14 `jobType.*` labels, all under `JobProgressDock.*`.

### Ship decision — SPLIT, not one release (Tony, 2026-09-10)

Three artefacts deploy by three different mechanisms, and getting the order wrong produces a dock
that looks broken rather than one that is absent:

1. **Firestore rule** (`firestore.rules`, `shopJobs` get-only) — must land FIRST. Without it the
   client listener is denied and the dock never receives anything, even once producers are live.
2. **Backend producers** — `firebase deploy` covers GCF, but the image-optimize producer runs on the
   **worker fleet** (`optimizeImage`, `optimizeImageV2`, `handleManualOptimizeImage` are in
   `worker.config.yml`). `firebase deploy` does NOT update the worker box: that needs
   `[deploy-worker]` in the commit title. Ship without it and image-optimize rows simply never
   appear, with nothing in the logs to say why.
3. **Frontend** (dock + context + MainFrame mount) — safe to ship at any point; it renders nothing
   until the registry has data.

Ordering rationale: rule → producers → frontend means the dock is never visible while broken. The
reverse order gives merchants a dock that shows nothing and cannot say why.

### TTL policy — authorised by Tony, blocked on auth

`shopJobs.expireAt` needs a Firestore TTL policy or the field is inert: the 24h prune only runs
when some *other* upsert happens, so a shop that stops running jobs keeps its finished rows forever.

**Blocked:** `gcloud` returned `Reauthentication failed. cannot prompt during non-interactive
execution` — needs `gcloud auth login` from Tony's own terminal.

**Trap noted while checking:** `gcloud config get-value project` on this machine returns
**`avada-seo` — production**. Every command below therefore passes `--project` explicitly.

```bash
gcloud firestore fields ttls update expireAt \
  --collection-group=shopJobs \
  --project=avad-seo-staging
```

Production (`avada-seo`) is deliberately NOT done at the same time — with a split ship, the prod TTL
belongs to the prod deploy step.

Verify after creating, rather than trusting the command's exit code:

```bash
gcloud firestore fields ttls list --project=avad-seo-staging
```

The policy must read `ACTIVE`. Firestore TTL only acts on a **Timestamp** field;
`jobRegistryRepository` writes `expireAt: new Date(...)`, which the SDK serialises as a Timestamp,
so the type is right — but an ISO string there would make the policy silently sweep nothing.

#### ✅ Task 8: Producer — AI content (3 sections)
- Agent: backend-implementer (sonnet), 1 round.
- Wired 5 sites; section→type mapping isolated in
  `helpers/generateBulk/generateBulkJobRegistryMapping.js`. processed/total confirmed against
  `pages/AiContent/GenerateBulk.js:91-92` and `pages/BulkGenerator/HistoryPanel.jsx:97-99`.
- The reachability requirement paid for itself three times:
  - `subscribeGenFaq.js:94/:108` confirmed **per-item** (inside `generateFaqForResource`, under
    `pLimit(5)`), so not wired. The batch boundary after `Promise.all(outcomes)` was used instead —
    the same shape already accepted at `subscribeRecursive.js:465`.
  - `generateBulkController.js:331-332` (`generateAgain`, `POST /regenerateBulkItem`) **refused**:
    it has no `statusAll` guard, so it can fire after a job is already finished. An
    `upsertJob(RUNNING)` there would resurrect a completed dock row.
  - The FAILED write is skipped on an ownership failure — when the payload's `shopID` does not match
    the doc's real owner, writing would mirror one shop's progress into another shop's registry.
    That is a tenant-isolation call the agent made on its own; it matches why `trackJobOutcome` is
    already skipped on that branch.
- 16 new test cases across 5 files. Verified by me: `jest packages/functions/src` → 1557 passed,
  2 failed (the same two pre-existing).
- Security check: **clean**. No secret, no dependency, no forbidden file; the ownership guard above
  actively improves tenant isolation rather than weakening it.

#### ⬜ Task 14: Add `JOB_STATUS.CANCELLED` (NEW)
- Raised by task 8's own concerns section, then confirmed by grep to be systemic rather than local.
- `JOB_STATUS` has only `running` / `done` / `failed`, so **every merchant-initiated cancel reports
  as "Failed"**:

  | Site | What the merchant actually did |
  | --- | --- |
  | `controllers/generateBulkController.js:307` | cancelled an AI content run |
  | `controllers/seoController.js:873` | pressed Stop on image optimize |
  | `controllers/bulkAuditFixController.js:296` | cancelled a bulk fix |
  | `controllers/auditAgentController.js:263` | cancelled a search index sync |

- Why it matters here specifically: this feature's entire value is reporting status truthfully.
  Telling a merchant that the thing they deliberately stopped "failed" is wrong information, and it
  is the kind of wrong that generates support tickets.
- **Must land before task 12.** Task 12 translates 26 strings into 12 locales; adding a status key
  afterwards means paying for that twice.
- Deliberately NOT started yet: tasks 7, 9, 10 and 11 are in flight and are writing to those exact
  controllers. Editing them now would collide.

#### ✅ Task 7: Producer — bulk AI fix
- 6 sites, all hung off `services/bulkAuditFix/chain.js:checkJobCompletion`, the one funnel every
  product-terminal path already passes through (its own comment: "EVERY terminal exit of a product
  run must call this"). Reused its existing `getBulkFixJobById` read — no new Firestore read.
- Refused `productWorker.js` / `subscribeBulkAuditFixProduct.js`: per-sub-step writes inside a single
  product's fix loop, i.e. per-item-inside-an-item. The FAL-206 rethrow there is untouched.
- Also refused `dispatcher.js:dispatchBulkFixProducts` — START already fires one step earlier, and a
  second tick for the same conceptual event adds nothing.
- Three paths that bypass the funnel were found and wired separately, which a name-based list would
  have missed entirely: `stopJobOutOfCredits` (deliberately does not advance the chain),
  `stuckJobRecovery` (`continue`s before `advanceChain`), and `cancelBulkFix` (writes CANCELLED
  directly, never touches the chain).
- processed/total from `pages/BulkAuditFix/components/ProgressBar.js:31`
  (`succeeded + failed + skipped`, which `incrementProgress` keeps equal to `job.completed`).
- Pre-existing FE bug reported, not fixed: that same page reads `job?.totalProducts`, a field that
  does not exist on the doc, silently falling back to `products.length`.
- Verified: `jest packages/functions/src` → 1557 passed, 2 pre-existing failures.
- Security check: **clean**. `shopID` traced end to end and confirmed to be the Firestore doc id.

#### ✅ Task 11: Producer — search index sync
- Agent: backend-implementer (opus). Worth the model: it found a trap neither the spec nor the recon
  had seen.
- **The trap.** `jobDataMigrate` is ONE doc reused per shop, and the chunk counters are never
  cleared when a run starts — `syncToElasticsearch` resets them per resource type, and only once
  that type's Shopify bulk export lands. So a fresh run begins with the PREVIOUS run's
  `totalChunks_*`, `completedChunks_*` and `completedTypes` still populated, and the obvious
  implementation (sum every `totalChunks_*` present) reports a just-started run as 100% done.
  The adapter counts only types proven fresh for this run: `completedTypes` plus one explicitly
  named in-flight type. That is also why `:96`, `:272` and `:297` pass a literal 0/0.
- Failed chunks count as processed, matching the job's own completion rule
  (`jobDataMigrate.service.js:576` advances on `completed + failed >= total`), clamped with
  `Math.min` because an at-least-once redelivery can inflate the raw sum.
- `:526`'s transaction handled correctly: the upsert runs AFTER `runTransaction` resolves, with the
  post-write shape captured in a closure that resets on each attempt — same reasoning as the `wrote`
  flag in task 3a.
- Two ordering hazards closed: the chunk upsert had to precede an early `return` so it can never
  land after the terminal write, and both progress sites are gated on `status === doing` so a chunk
  redelivered after the run finished cannot resurrect a completed row.
- Verified by me: 10/10 adapter tests; `jest packages/functions/src` → 1556 passed, 2 pre-existing.
- Security check: **clean**. Confirmed `jobDataMigrate.shopId` comes from `getCurrentShop(ctx)` =
  the Firestore doc id, the same id the dock reads — so the known `Audit.js`/`Report.js` FE key
  mismatch does not affect this producer.
- Reported, not fixed: `handlers/pubsub/subscribeBulkDataShopifyExport.js:19-22` swallows its error
  and returns, so GCF acks and the whole run is lost silently — the FAL-206 class again, and exactly
  the path that would strand a `running` row until the staleness window.

#### ⬜ Task 15: Search-index progress must not sit at 100% (NEW)
- Raised by task 11 after implementing the spec exactly as written.
- **My spec rule caused this**, not the implementation. "Sum `completedChunks_*` over
  `totalChunks_*`" means the run discovers its own size one resource type at a time, so the row
  reaches 100% while still `running` at the end of each type and stays there — minutes at a time,
  three times a run — before dropping back to ~67% when the next type's export lands.
- `processed` never decreases; the ratio does. A full progress bar on a job that is not finished is
  the same category of lie as reporting a cancelled job as failed.
- Likely fix: weight by resource type rather than by raw chunk totals — completed types plus the
  current type's chunk fraction — which is monotone and cannot reach 100% before the last type ends.
  That contradicts the spec's current "no `totalChunks_*` yet → total 0" test, so the spec changes
  with it.
- Not started: task 9 and 10 are still in flight.

#### ✅ Task 9: Producer — internal link (3 collections)
- 12 files. Completion for all three collections is counter-driven by Firestore `onUpdate` triggers
  (`handlers/trigger/on*UpdateHandler.js`), which is where DONE is written — a shape no other
  producer in this feature has.
- The parallel-fan-out trap it closed: approve/revert dispatch N batches via `Promise.all`, so a slow
  batch's post-loop write could land AFTER the trigger already wrote DONE. Guarded with
  `isRunStillActive(doc)` before every RUNNING write.
- Refused the batch handlers' outer "Fatal Error" catches: one batch failing is not the job failing,
  because other parallel batches may still complete the counter. Writing FAILED there would be a
  false terminal.
- Reported, not fixed: approve/revert can under-count `processedCount` when a task hits neither the
  applied nor the failed branch, so the trigger may never fire. Those runs fall to the 15-minute
  staleness rule.

#### ✅ Task 10: Producer — redirects (4 collections)
- **It corrected my brief.** I named `historyImport` and `hooks/useImportData.js:14` for redirect
  import; that is the unrelated product/CSV import flow. The real collection is
  `historyImportRedirects`, read live by `pages/Redirect404/List.js:115-131`. It wired the real one.
- **Pre-existing product bug found, verified by me:** `completeSyncRedirectLog`
  (`repositories/syncRedirectLogRepository.js:90`) has **zero callers** in the entire tree — I
  re-grepped to confirm, and it is dead even from the Dev Zone. So `syncRedirectLogs` never reaches
  a done state at all, and the `REDIRECT_SYNC` row will only ever be running or failed, relying
  entirely on the 15-minute staleness rule. Its own ticket; not fixed here.
- Two more reported, not fixed: `REDIRECT_MIGRATION` is Dev-Zone-only so a merchant will never see
  that row; and `historyImportRedirects` writes `status: 'done'` in its error path too, so the
  source data cannot distinguish failure from success. The producer mirrors the source rather than
  inventing a FAILED the doc never carries — reporting FAILED while the page says done is exactly
  the contradiction this design exists to prevent.

#### ✅ Task 14: `JOB_STATUS.CANCELLED`
- Done inline. Six merchant-cancel paths were reporting "Failed": `generateBulkController.js:305`,
  `seoController.js:873`, `auditAgentController.js:261`,
  `subscribeHandleDaily/WeeklyBrokenLinks.js`, and `bulkFixJobRegistryMapping.js`.
- What made this worth doing rather than accepting: **three different agents each independently
  wrote a comment apologising for the missing status** ("JOB_STATUS has no CANCELLED — FAILED is the
  closest…"). When three independent implementers each have to justify a design, the design is
  wrong, not their reading of it.
- FE: the row gets `XCircleIcon` with a **subdued** tone, not critical — the merchant stopped it on
  purpose, nothing broke. It counts toward `doneCount` because the pill answers "is anything still
  working". The done badge stays `success` tone because `hasFailed` still tests only for FAILED.
- One test broke, deliberately: `generateBulkController.cancel.test.js` asserted the old FAILED.
  The behaviour changed on purpose, so the assertion changed with it — not the other way round.
- Verified: `jest packages/functions/src` back to 1557 passed / 2 pre-existing failures; assets
  rebuild clean, dock chunk 4.39 KB.

#### ✅ Task 15: Search-index progress
- The opus agent **died mid-task on a session rate limit** (resets 18:40). It had written the tests
  first and got no further, leaving the tree red at 13 failed / 4 passed. I finished it inline
  rather than restart a fresh agent against the same limit.
- New rule: weight by resource type (100 units each, four-type run = 400) instead of summing chunks.
  The denominator is fixed the moment the queue is known, and an in-flight type is capped at 99 of
  its 100, so 100% is reachable only once the last type actually joins `completedTypes`.
- Reused the existing `RESOURCE_TO_PAGE_TYPE` map (`const/jobDataMigrate.js:33`) rather than writing
  an inverse map — the repo already owned it.
- 17/17 pass, including the one that matters: a simulated four-type run asserting monotonicity
  across every reading, not three independent snapshots.
- The crashed agent's "call-site defect" turned out to be real and is already in the tree:
  `triggerNextBulkOperation` reads the doc BEFORE its own write, so the adapter is now called with
  `{...job, completedTypes: newCompletedTypes}`.
- Verified: `jest packages/functions/src` → 1564 passed, 2 pre-existing failures. eslint 0.

#### ✅ Task 12: i18n
- Ran `yarn update-label-claude`; the `avada-update-label` skill translated 27 `JobProgressDock.*`
  keys into 9 locales.
- Checked the script's "Removed: 2 keys" warning before agreeing to anything: the `en.json` diff is
  39 insertions and **0 deletions**, so nothing was lost.
- Verified per locale by script rather than by self-report — counting `JobProgressDock` leaves in
  every translation file: `da/de/en/es/fr/nl/origin/pt-BR/sv/vi/zh-CN` = 27 each; **`it`, `iw`, `nb`
  = 0**, because they are not in the tooling's target list.
- That degrades correctly rather than breaking: `layouts/AppTranslate.js:47` sets `fallback: en`, so
  those three locales show English dock strings, not raw keys. Reported; not fixed, because adding
  locales the repo's own tooling does not target is a repo-level decision, not this feature's.

#### ✅ Task 13: Feature doc
- `docs/features/job-progress-dock.md` — what it does, entry points, data model, the five
  duplication rules, the three truthfulness rules, cost controls, the split-deploy order, the TTL
  operations step, how to add a new job, known gaps, and the pre-existing bugs found along the way.

---

## COMPLETE — 2026-09-10

### Final verification (run, not claimed)

```
backend    Test Suites: 176 passed, 2 failed, 178 total
           Tests:       1564 passed, 2 failed, 1566 total
frontend   Test Suites:  24 passed, 2 failed,  26 total
           Tests:        228 passed, 2 failed,  230 total
```

All 4 failures are pre-existing, and this is proven rather than asserted: none of the four test
files appears in the diff, and none imports anything from this feature —
`shopify2026Client.test.js`, `workListStore.test.js`, `onPageListQuery.helpers.test.js`,
`overviewCardScore.test.js`.

Assets build clean; the dock lands in its own lazy chunk at 4.39 KB, so nothing was added to the
main bundle.

### Final security check — whole branch diff: CLEAN

1. No secret anywhere in the diff, and none in the new untracked files either.
2. No credential on a command line or in a log line.
3. Shop scoping intact: `shopJobs` is keyed by the shop's Firestore doc id, checked per producer,
   and the client rule allows `get` only — never `list`.
4. No request input trusted: producers read shop identity from session state, never from a body.
5. No forbidden file touched — no `.env*`, no lockfile, no `.gitlab-ci.yml`, no `firebase.json`, no
   `.firebaserc`. `firestore.rules` is in the diff because it was task 2's whole point, and the rule
   added is strictly tighter than every rule around it.
6. No new dependency; `package.json` is untouched, so the CI immutable install is unaffected.
7. Blast radius stated: the only production-path behaviour change is additive registry writes that
   cannot throw into their callers; everything else is new files.

`console.*` audit: three hits exist in files this branch touched, but **no hunk in this branch adds
one** — verified by grepping only added lines. `productService.js:335`
(`console.log('newAlt====', newAlt)`) is a live debug log that arrived in commit `a512634a6d` on
master. Reported, not fixed: outside this diff's scope.

### Totals

15 tasks, 21 rounds, cap of 5 never reached on any task. Every task passed tests, review and a
security check before being marked done.

### Still needs Tony

1. `gcloud auth login`, then the TTL policy on `shopJobs.expireAt` (staging now, production with the
   prod deploy). Without it `expireAt` is inert.
2. Git: nothing is committed except `821a4eb013`, which an agent made unasked early on. Everything
   since is uncommitted in the working tree.
3. The split-deploy order: rules → producers (with `[deploy-worker]`) → frontend.

### Rules deployed to staging — 2026-09-10

Triggered by a live `[jobProgressContext] FirebaseError: Missing or insufficient permissions.` in
the local admin. Cause was not a code defect: `firestore.rules` was modified locally and never
deployed, so staging still ran a ruleset where `shopJobs` matched nothing and fell through to the
top-level `allow read, write: if false`. This is exactly the failure the split-deploy order exists
to prevent, confirmed live. Note `emulators-macos` runs no firestore emulator, so the local app
reads real staging — which is why it surfaced before any deploy.

`firebase deploy --only firestore:rules --project avad-seo-staging` (explicit project; the machine's
`gcloud config` points at production). Rules compiled and released.

Verified against real staging rather than trusting "Deploy complete", by probing the Firestore REST
API with no auth at all:

```
GET  shopJobs/probeNonExistent123 : 404 NOT_FOUND   ← rule allows the read; was 403 before
LIST shopJobs                     : 403             ← `get` without `list`, as intended
LIST bulkFixJobs                  : 200             ← control
```

404 rather than 403 is the decisive bit: permission granted, document simply absent.

The control line also re-confirms the cross-shop listing finding **on real staging**, not just on
the emulator: an unauthenticated client can list every shop's `bulkFixJobs`. Still not fixed here —
its own ticket.

Expected state after this: the permission error is gone and the dock renders nothing, because
`shopJobs` has no documents until the producers deploy.
