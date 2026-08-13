---
name: seo-fleet-tailscale-acl-autodeploy
description: Tailscale ACL that lets central SSH box1/box2 non-interactively for ansible auto-deploy — tags + the two gotchas that blocked it.
metadata: 
  node_type: memory
  type: reference
  originSessionId: a3f0f490-5c60-457e-82b7-5860fe12e2f5
  modified: 2026-08-13T07:22:17.199Z
---

Auto-deploy to the Gen2 follower boxes needs central (ansible control node) to SSH box1/box2
**non-interactively**. Default Tailscale SSH is `check` mode (browser re-auth) → blocks it. Fix =
tailnet ACL (admin console `login.tailscale.com/admin/acls`, NOT repo), set 2026-08-13:

- Tags: **central = `tag:deploy`**, **box1 + box2 = `tag:worker-box`** (gán ở Machines → Edit ACL tags).
- `ssh` rule: `{action: accept, src: [tag:deploy], dst: [tag:worker-box], users: [avada]}` → no re-auth.
- Kept a `check` rule `autogroup:member → tag:worker-box` so the dev Mac fallback still SSHes boxes
  (a TAGGED box no longer matches `autogroup:self`, so the default self-SSH rule stops covering it).
- tailnet is the **grants**-based schema: `tests`/`sshTests` blocks rejected (`unknown field dst/sshUser`) → omit them, verify live instead.

Two gotchas that made the first tests fail even with the rule saved:
1. **box1 had Tailscale SSH server OFF** → `Permission denied (publickey)` (fell through to plain sshd,
   Tailscale never intercepted). Fix: `sudo tailscale set --ssh` on box1.
2. **box2 was user-owned** (`tn221805@gmail.com`), never tagged → `tailnet policy does not permit`.
   Fix: gán `tag:worker-box`. Diagnose real tags from central: `tailscale whois <100.x>` → shows Tags/owner.

Verify (BatchMode fails fast if still interactive): from central
`ssh -o BatchMode=yes avada@100.123.202.84 'echo box1-ok'` (+ 100.104.18.124). Both `*-ok` = thông.

**Control-node ansible tooling (central, 2026-08-13):** central Ubuntu 22.04 / py3.10, had **no pip**
and only apt `ansible 2.10.8` — that ancient build's vendored `six.moves` **breaks on python-3.12 nodes**
(box1 = py3.12 → `No module named ansible.module_utils.six.moves`; box2 = py3.10 worked). Removing box1's
stray apt-ansible did NOT fix it — it's the control build, not the node. Fix: `sudo apt-get install -y
python3-pip` then `python3 -m pip install --user --upgrade ansible-core` → **2.17.14** at
`~/.local/bin/ansible` (2.17 = highest for controller py3.10; 2.18 needs 3.11). Run playbooks with the
full path `~/.local/bin/ansible-playbook`, NOT the apt `ansible` still in PATH. Both boxes then pong.

Playbook files shipped to central at `/home/avada/seo-worker-gen2-build/fleet/` (deploy-followers.yml,
inventory.ini) + `/home/avada/seo-worker-gen2-build/compose.gen2-follower.yml` — build_dir default has
Dockerfile.worker + hydrate image (5.16GB) already present, so a run skips the build.

Unblocks `deploy-followers.yml` (branch `fleet/deploy-all-boxes`). See [[seo-gen2-follower-fleet-deploy]],
[[seo-fleet-tailscale-staging4]], [[seo-gen2-worker-firebase-config]].
