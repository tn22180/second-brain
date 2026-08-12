CS ticket 2026-08-12, item 3 (Lan Anh / Esther): stop offering Minify.

Shopify's CDN already minifies `theme.css.liquid` / `theme.js.liquid`, so this app's minify is
redundant. The backend kill-switch has been live since `b67f7eb5c5` (`MINIFY_SUNSET = true` in
`minifyService.js:29`) — a minify run there no longer generates anything, it reverts the theme.
This MR makes the frontend, the presets and the audit agree with that, so nobody is offered a
feature that cannot work.

The rule agreed with Lan Anh: **a merchant who is already ON keeps seeing Minify so they can turn
it OFF. Nobody can turn it ON.**

## What changes

**Frontend lockdown** (`SpeedUp.js`, `Minify/Minify.js`)
- The Minify tab is filtered out unless `minify.enabled`, `minify.updating`, or `minify.error`.
  `error` is in the list on purpose: after a failed revert `enabled` is already false and
  `updating` has cleared, so without it the merchant loses both the retry and the failure banner
  at `Minify.js:117` while `.aio.min` files are still referenced in their theme.
- The toggle is one-way. `onChange` returns early when the feature is off, so the only reachable
  transition is ON → OFF. Turning off still runs the existing revert: theme originals restored,
  generated `aio.min` assets removed.
- New sunset banner explaining why, translated into all 14 locales.

**Presets** (`assets/config/image/speedOptimize.js`, `functions/const/optimizeSpeed.js`,
`functions/const/speedUp.js`)
- `minify` removed from Basic / Standard / Turbo / Rocket and from the custom-mode source array.
  Left in place, an auto-optimize run would undo a merchant's minified theme without them asking.
- New test `speedUpPresets.test.js` also locks an ordering invariant that is easy to break by
  accident: `handleEndProgress` treats the **last** entry of `actionList` as the end-of-run marker,
  and the settings branch (`updateTasksSetting`) runs before the asset branch (`handleReadAsset`),
  so a preset ending in `loading` / `preload` / `pageSpeed` reports the run finished while `asset`
  and `duplicate` are still in flight. Removing `minify` leaves `asset` / `duplicate` last, which
  is correct; the test keeps it that way.

**Audit + checklist** (`seoIssues.js`, `seoIssueFeatures.js`, `seoCheckListOption.js`,
`audit/issues/minify.js` deleted)
- The audit auto-discovers issue modules with `readdirSync`, so deleting the file is what removes
  it. It no longer raises a "minify your assets" issue and no longer offers a one-click fix that
  would land on the sunset backend and do nothing.

**`.gitignore`** — `docs/` and `/.claude/` were blanket-ignored, contradicting the comments right
below them, which is why `docs/features/minify-sunset.md` could not be committed. `specs` was also
unanchored and matched `docs/superpowers/specs/` at any depth; it is now `/specs`.

## Blast radius

- **Theme writes.** Turning minify off writes to the merchant's theme (restore originals, delete
  generated assets). That path is unchanged by this MR — it is the existing revert — but it is the
  one destructive thing here.
- **Checklist score moves.** Removing the minify issue changes the denominator in
  `Audit.calcScoreDependOnIssues`, so shops will see their score shift on the next recalc. Expected,
  not a bug.
- No data migration needed: presets are re-applied from these constants on every mode pick and on
  every auto-optimize run.

Full write-up: `docs/features/minify-sunset.md`.

## Verification

```
$ DISABLE_V8_COMPILE_CACHE=1 npx jest speedUpPresets minifyRetired
Test Suites: 4 passed, 4 total
Tests:       52 passed, 52 total
```

Branch diff: 28 files, +326 / −106. No secrets, no `.env*` / lockfile / CI / firebase config
touched, no new dependency, no Firestore query changed (shop scoping unaffected).

## Known follow-up, deliberately not in this MR

`components/Issue/IssueContent.js:177` and `:218` still carry minify branches. Both degrade safely
(`settingsUpdate['minify']` resolves to `{}` and `handleSave` becomes a no-op; the `case 'minify':`
is unreachable). `Issues.json:399` / `issue.json:399` keep orphan copy. Out of scope here.
