fingerprint: 1pzp7dr
service: scanSpeedScoreSubscriberV2
message: [no message]
app: IMG-OPT
repo: avada-image-optimizer
date: 2026-08-17T03:39:48.004Z
status: infra
attempt: 1

# IMG-OPT · scanSpeedScoreSubscriberV2 · 1pzp7dr

**Outcome.** infra class — reported, no MR

**Root cause.** Not a runtime failure: the single ERROR is a Cloud Functions gen2 deploy — UpdateFunction on scanSpeedScoreSubscriberV2, run by anhnt@avada.io at 2026-08-17T03:28:53Z — whose Cloud Build (e6ec13a8-4e62-48a5-9eeb-eae00c7347f5) died 34s into the buildpack's `npm install --package-lock-only --quiet` with exit status 2, while 21 other builds of the identical packages/functions source in the same deploy succeeded.

**Mechanism.** firebase.json points the functions build at packages/functions, and that directory ships no package-lock.json (only root package-lock.json, e2e/package-lock.json and yarn.lock are tracked; `ls packages/functions/package-lock.json` → No such file). So the Google Node.js buildpack logs 'WARNING: *** Improve build performance by generating and committing package-lock.json' and runs `npm install --package-lock-only --quiet`, a full live resolve of 1853 packages against the npm registry, once per function — 22 times in this deploy. A sibling build (5cfbb1d4-754e-4c98-95ff-331aae7a2618) took 2m10.1s to complete that same resolve. Build e6ec13a8 started it at 03:29:32.251Z and step 2 exited non-zero at 03:30:09.430Z — 34s, no npm output flushed (`--quiet` buffers stdout until completion, so the resolver's own error text never reached Cloud Logging). Cloud Functions surfaced it as status code 13 'Build failed with status: INTERNAL_ERROR' at 03:30:23.918Z, which is the alerted entry. No revision was rolled out, so the previously deployed revision kept serving: stderr=0 and no 5xx request log exists for this service in the window. The unpinned floating specifiers in that package.json (e.g. `"cors": "latest"`) mean every one of those 22 resolves is non-deterministic and network-dependent, which is the exposure — not a defect in any src/ handler.

Confidence: `medium` · infra class, not auto-fixed

## Code
- `firebase.json:8` — "source": "packages/functions" — the directory Cloud Build receives as the function source zip; it carries no package-lock.json, which is why the buildpack must regenerate one
- `firebase.json:9` — predeploy runs only `npm run production` (babel src → lib); it never produces or commits a lockfile, so dependency resolution is deferred to Cloud Build
- `packages/functions/package.json:46` — `"cors": "latest"` — an unpinned floating specifier resolved live against the registry on every build, making the 22 per-deploy resolves non-deterministic
- `packages/functions/package.json:47` — `"crisp-api": "^9.2.0"` pulls the git dependency ssh://git@github.com/crisp-dev/emitter.git, logged by the sibling build at 03:31:51.062Z as 'npm warn skipping integrity check for git dependency' — a non-registry fetch inside the same resolve step

## Evidence
- 1 matching entries: `(resource.labels.service_name="scanSpeedScoreSubscriberV2" OR resource.labels.function_name="scanSpeedScoreSubscriberV2" OR resource.labels.job_name="scanSpeedScoreSubscriberV2") AND timestamp>="2026-08-17T03:15:33.688Z" AND timestamp<="2026-08-17T03:45:33.688Z" AND severity>=ERROR`
- 1 matching entries: `resource.labels.build_id="e6ec13a8-4e62-48a5-9eeb-eae00c7347f5" AND textPayload:"failed: step exited with non-zero status: 2"`
- 33 matching entries: `resource.type="build" AND timestamp>="2026-08-17T03:28:00Z" AND timestamp<="2026-08-17T03:36:00Z" AND textPayload:"Running \"npm install --package-lock-only --quiet\""`
- 19 matching entries: `protoPayload.methodName="google.cloud.functions.v2.FunctionService.UpdateFunction" AND timestamp>="2026-08-17T02:30:00Z" AND timestamp<="2026-08-17T04:30:00Z"`

## Job
- analyze rounds: 3
- cost: $4.53

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
