# launchd

Empty on purpose. `autofix init` writes `<label>.plist` here for the machine it runs on, and
`.gitignore` keeps it out of the repo: a real plist carries a home directory, a username, a
node version and a service-account email.

```
bun run bin/autofix.ts init --service-account bot@<project>.iam.gserviceaccount.com
cp launchd/<label>.plist ~/Library/LaunchAgents/
launchctl load ~/Library/LaunchAgents/<label>.plist
```

The renderer is `src/setup/plist.ts`; `test/setup.test.ts` covers what it emits.
