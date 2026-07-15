# Primary Workflow

**IMPORTANT:** Read relevant skills from `.claude/skills/` before starting implementation.

## 1. Planning

- Use `/plan [feature]` or delegate to `planner` agent for complex features
- Identify which layers need changes:
  - **Handler** - new endpoint or route?
  - **Service** - new business logic?
  - **Repository** - new Firestore queries?
  - **Frontend** - new page or component?
- Consider multi-tenant implications (`shopId` required everywhere)

## 2. Implementation

### Backend Changes

**Handler** (orchestration only):
```javascript
// packages/functions/src/handlers/featureHandler.js
export const getFeatureData = async (ctx) => {
  const {shopId} = ctx.state;
  const data = await featureService.getData(shopId);
  return ctx.res.json(featurePresenter.format(data));
};
```

**Service** (business logic):
```javascript
// packages/functions/src/services/featureService.js
export const getData = async (shopId, options = {}) => {
  const items = await featureRepo.getByShopId(shopId);
  // Business logic here
  return processedItems;
};
```

**Repository** (ONE collection only):
```javascript
// packages/functions/src/repositories/featureRepo.js
const COLLECTION_NAME = 'features';

export const getByShopId = async (shopId) => {
  const snapshot = await db.collection(COLLECTION_NAME)
    .where('shopId', '==', shopId)
    .get();
  if (snapshot.empty) return [];
  return snapshot.docs.map(doc => ({id: doc.id, ...doc.data()}));
};
```

### Frontend Changes

**Page Component:**
```jsx
// packages/assets/src/pages/FeaturePage.jsx
export default function FeaturePage() {
  const {data, loading} = useFetchApi('/api/feature');

  if (loading) return <SkeletonPage />;

  return (
    <Page title="Feature">
      <FeatureContent data={data} />
    </Page>
  );
}
```

### Key Patterns

- **Early return** - no else/else-if, use guard clauses
- **Response format** - `{success: true, data}` or `{success: false, error}`
- **Request body** - use `ctx.req.body` (NOT `ctx.request.body`)
- **Firestore** - always scope by `shopId`, use `docs.empty` for checks
- **Constants** - group by feature in `const/{feature}/`

## 3. Validation

After implementation:
```bash
yarn lint          # Check for errors
yarn test          # Run tests
```

- Fix all lint errors before proceeding
- **NEVER** ignore failing tests

## 4. Refactor (Optional)

Use `/refactor` to clean up code after tests pass:

- Extract repeated code (DRY)
- Apply early return pattern
- Split large functions (single responsibility)
- Extract constants to `const/{feature}/`
- Keep files under 200 lines

## 5. Update Types & Docs

Use `/typedoc` after adding new functions/types:

- Update JSDoc comments for public functions
- Add TypeScript types to `packages/functions/index.d.ts`
- Ensure exported functions have proper documentation

## 6. Code Review

Use `/review` or delegate to `code-reviewer` agent. Check:

- [ ] Early return pattern used (no nested if/else)
- [ ] Handler only orchestrates (no business logic)
- [ ] Repository handles ONE collection only
- [ ] All queries scoped by `shopId`
- [ ] Response format is `{success, data, error}`
- [ ] File under 200 lines

## 7. Impact Analysis

Use `/impact` before merging:
- Identify affected features
- List test areas
- Document breaking changes

## 8. Debugging

When issues arise:
```bash
tail -100 firebase-debug.log        # Check recent logs
grep -i "error" firebase-debug.log  # Find errors
```

- Delegate to `debugger` agent for complex issues
- Fix and repeat from Step 3

## Quick Checklist

| Area | Check |
|------|-------|
| Handler | Orchestrates only, uses presenter |
| Service | Contains business logic, calls repos |
| Repository | ONE collection, `shopId` first param |
| Frontend | Functional component, Polaris UI |
| Firestore | Index created if compound query |
| Tests | All passing |
