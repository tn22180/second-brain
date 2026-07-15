# Avada Development Rules

## Principles
**YAGNI** - You Aren't Gonna Need It
**KISS** - Keep It Simple, Stupid
**DRY** - Don't Repeat Yourself

## Code Standards

### Naming Conventions
- `camelCase` - variables, functions, properties
- `PascalCase` - classes, React components
- `UPPER_SNAKE_CASE` - constants
- Functions start with verbs: `getUserData`, `calculateTotal`
- Booleans prefix with `is/has`: `isActive`, `hasPermission`

### Code Patterns
- Prefer `const` over `let`; avoid mutation
- Use `===` instead of `==`
- Prefer async/await over promises
- Prefer `map/filter/reduce` over `for` loops for data transformation
- Functions with >3 params use object destructuring
- Use early return pattern; minimize `else`
- Single responsibility: one function does one thing

### Backend Structure (Node.js/Firebase)
```
packages/functions/src/
├── handlers/      # Controllers - orchestrate ONLY, no business logic
├── services/      # Business logic, combine multiple repos
├── repositories/  # ONE Firestore collection per repo - NEVER mix
├── helpers/       # Small single-purpose utilities
├── presenters/    # Format output data
├── const/         # Constants grouped by domain (see Constants Rules)
└── config/        # Configuration
```

### Constants Organization
- Group constants by feature in `const/{feature}/` directory
- **Split by bundle target**: scripttag-safe (lightweight) vs backend-only (heavier)
- Use barrel file `index.js` for convenient imports
- Keep collection names inline in repositories (not extracted)
- Example structure:
  ```
  const/featureName/
  ├── index.js      # Barrel file re-exporting all
  ├── settings.js   # Default settings, enums (SCRIPTTAG-SAFE - keep lightweight)
  └── config.js     # TTL, API config, fallbacks (BACKEND-ONLY)
  ```
- **Scripttag imports**: Use direct path `@functions/const/feature/settings` (not barrel)
- **Backend/Admin imports**: Use barrel `@functions/const/feature`

### Frontend Structure (React)
- One component per file (PascalCase filename)
- Functional components only
- BEM naming for CSS classes
- Use React Context to avoid prop drilling
- Custom hooks for reusable logic

## Firestore Rules
- Repository handles ONE collection only
- Define collection name as `const COLLECTION_NAME = '...'` inline in repository
- All query/mutation functions require `shopId` as first parameter (multi-tenant)
- Use batch operations (max 500 per batch)
- Check emptiness with `docs.empty` (not size/length)
- Use Firestore aggregates for count/sum/avg
- Filter early with `where`, select only needed fields
- **INDEXES**: Create `firestore-indexes/{collection}.json` for compound queries, run `yarn firestore:build`

## Shopify/Polaris Rules
- Use GraphQL Admin API (preferred over REST)
- Button `url` prop for navigation (NOT `onClick` + `window.open`)
- Use Polaris components when available
- Verify webhook HMAC signatures
- Handle rate limits with exponential backoff

## Development Environment
- `yarn dev` auto-syncs cloudflare tunnel URL to all packages — no manual env updates
  needed during development. NEVER commit a `*.trycloudflare.com` URL.

## Security
- NEVER commit credentials or API keys
- Validate `.gitignore` includes secrets
- Sanitize all user inputs
- Parameterize database queries
- Verify authentication on all endpoints

## Pre-commit
- Run `npm run lint` before commit
- Run `npm test` before push
- NEVER ignore failing tests
- Use conventional commit messages
- Keep commits focused and atomic

## File Size
- Keep files under 200 lines when possible
- Split large files into focused modules
- Extract utilities into separate files
