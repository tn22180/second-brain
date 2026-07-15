---
description: Generate commit message and commit all changes
---

Commit all current changes with an auto-generated commit message.

## Steps

1. **Check git status** - See all untracked and modified files
2. **Stage all changes** - Run `git add -A`
3. **Review staged changes** - Run `git diff --staged` to understand what's being committed
4. **Check recent commits** - Run `git log --oneline -5` to match commit message style
5. **Generate commit message** - Based on the changes:
   - Use conventional commit format: `type: description`
   - Types: `feat`, `fix`, `refactor`, `docs`, `style`, `test`, `chore`
   - Keep it concise (1-2 sentences)
   - Focus on "why" not "what"
6. **Create commit** - Use HEREDOC format:

```bash
git commit -m "$(cat <<'EOF'
type: Short description of changes

Longer description if needed.

Co-Authored-By: Claude <noreply@anthropic.com>
EOF
)"
```

7. **Verify commit** - Run `git status` to confirm clean working tree

## Commit Message Guidelines

- `feat:` - New feature or functionality
- `fix:` - Bug fix
- `refactor:` - Code restructuring without behavior change
- `docs:` - Documentation only
- `style:` - Formatting, whitespace (no code change)
- `test:` - Adding or fixing tests
- `chore:` - Build, config, dependencies

## Example

```bash
git add -A && git commit -m "$(cat <<'EOF'
feat: Add root-to-embed redirect for Shopify app

- Fix MIME type error by using absolute paths for embed.js
- Add Vite middleware to redirect root with embed params to /embed
- Update firebase.json to route root to embedApp function

Co-Authored-By: Claude <noreply@anthropic.com>
EOF
)"
```
