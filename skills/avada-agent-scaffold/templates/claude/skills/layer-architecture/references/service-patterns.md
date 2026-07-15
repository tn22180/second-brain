# Service Layer Patterns

## Core Principles

1. **Service = Business Capability Owner** — each function = 1 complete business use case
2. **Naming: verb + noun** — `processResourceRefresh`, `calculateItemTotals`, `syncResourceToProvider`
3. **Service calls repos, never the reverse**
4. **Service may call other services** (but avoid deep chains > 3 levels)

---

## Pattern 1: Orchestration Service

When a business action requires multiple repos + side-effects:

```javascript
// services/resourceCreateService.js
export async function createResource({shopId, resourceData}) {
  // 1. Core CRUD
  const resource = await resourceRepo.create(shopId, resourceData);

  // 2. Parallel side-effects
  const [widgetResult, itemResult] = await Promise.all([
    widgetService.attachDefaultWidget({shopId, resource}),
    itemService.assignInitialItem({shopId, resource})
  ]);

  // 3. Async fan-out (non-blocking)
  await publishTopic('backgroundHandling', {
    action: 'sync_integrations',
    shopId,
    resourceId: resource.id
  });

  return {success: true, data: {resource, widgetResult, itemResult}};
}
```

**When to use:** Handler/controller previously called 3+ repo methods sequentially.

---

## Pattern 2: Extract from Repository

When a repo function contains business logic + CRUD mixed together:

```javascript
// BEFORE — in resourceRepository.js (WRONG)
export async function saveResource(shopId, data) {
  const existing = await getByEmail(shopId, data.email);
  if (existing) {
    // Business logic: compute a score
    const score = computeResourceScore(data);
    await itemRepo.createItem({...}); // Cross-repo!
    await syncExternal(data); // External API!
    return updateById(existing.id, shopId, {...data, score});
  }
  const resource = await create(shopId, data);
  await widgetRepo.detectSyncWidget(shopId, resource); // Cross-repo!
  return resource;
}

// AFTER — Repository = pure CRUD
// repositories/resourceRepository.js
export async function getByEmail(shopId, email) {
  const snap = await collection.where('shopId', '==', shopId)
    .where('email', '==', email).limit(1).get();
  return snap.empty ? null : prepareDoc({doc: snap.docs[0]});
}

export async function create(shopId, data) {
  const ref = collection.doc();
  const doc = {...data, shopId, createdAt: new Date()};
  await ref.set(doc);
  return {id: ref.id, ...doc};
}

export async function updateById(id, shopId, data) {
  await collection.doc(id).update({...data, updatedAt: new Date()});
}

// Service = business orchestration
// services/resourceService.js
export async function saveResource({shopId, resourceData}) {
  const existing = await resourceRepo.getByEmail(shopId, resourceData.email);

  if (existing) {
    const score = computeResourceScore(resourceData);
    await Promise.all([
      resourceRepo.updateById(existing.id, shopId, {...resourceData, score}),
      itemService.createItem({shopId, resourceId: existing.id, score}),
      widgetService.syncWidget({shopId, resource: existing})
    ]);
    return {success: true, data: existing};
  }

  const resource = await resourceRepo.create(shopId, resourceData);
  await widgetService.attachDefaultWidget({shopId, resource});
  return {success: true, data: resource};
}
```

---

## Pattern 3: Extract from Handler

When handler contains inline business logic:

```javascript
// BEFORE — in subscribeBackgroundHandling.js (WRONG)
case 'resource_refresh': {
  const settings = await settingRepo.getByType(shopId, SETTING_TYPE_X);
  if (!settings.status || !settings.enabled) return;
  const items = await itemRepo.getByGroup(shopId, groupId);
  const filtered = items.filter(i => !isItemLocked(i));
  // ... 100+ lines of refresh logic
  break;
}

// AFTER — Handler = thin dispatcher
case 'resource_refresh': {
  await resourceService.processResourceRefresh({shopId, groupId});
  break;
}

// Service owns the business logic
// services/resourceService.js
export async function processResourceRefresh({shopId, groupId}) {
  const settings = await settingRepo.getByType(shopId, SETTING_TYPE_X);
  if (!settings.status || !settings.enabled) return;

  const items = await itemRepo.getByGroup(shopId, groupId);
  const eligible = items.filter(i => !isItemLocked(i));

  for (const item of eligible) {
    const next = determineNextState(item, settings);
    await Promise.all([
      itemRepo.updateById(item.id, shopId, {state: next.id}),
      logService.createStateChange({shopId, item, next})
    ]);
  }
}
```

---

## Pattern 4: Extract from Helper

When a helper contains DB calls or external API calls:

```javascript
// BEFORE — in helpers/widget/resourceCalculatorHelper.js (WRONG)
export async function getWidgetData(shopId) {
  const [settings, groups, items] = await Promise.all([
    settingRepo.getSettings(shopId),
    groupRepo.getAllGroups({shopId}),
    itemRepo.getItemList({shopId})
  ]);
  // ... data assembly
}

// AFTER — Helper stays pure, service does the fetching
// helpers/widget/resourceCalculatorHelper.js (pure utility)
export function calculateResourceDisplay(count, groups, settings) {
  // Pure calculation — no DB, no side-effects
  return groups.map(group => ({
    ...group,
    remaining: Math.max(0, group.target - count)
  }));
}

// services/widget/resourceCalculatorService.js (data fetching + orchestration)
export async function getWidgetData(shopId) {
  const [settings, groups, items] = await Promise.all([
    settingRepo.getSettings(shopId),
    groupRepo.getAllGroups({shopId}),
    itemRepo.getItemList({shopId})
  ]);
  return calculateResourceDisplay(count, groups, settings);
}
```

---

## Pattern 5: Breaking Circular Dependencies

When repo imports service AND service imports repo:

```javascript
// PROBLEM: itemRepository imports itemService.afterCreateItem
// AND itemService imports itemRepository.getAllItems
// → Circular!

// SOLUTION: Remove service import from repo, move lifecycle hooks to service

// repositories/itemRepository.js — pure CRUD only
export async function create(shopId, data) {
  const ref = collection.doc();
  await ref.set({...data, shopId, createdAt: new Date()});
  return {id: ref.id, ...data};
}

// services/itemService.js — owns lifecycle
export async function createItem({shopId, itemData}) {
  await beforeCreateItem({shopId, itemData}); // Validation
  const item = await itemRepo.create(shopId, itemData);
  await afterCreateItem({shopId, item}); // Side-effects
  return {success: true, data: item};
}
```

**Rule:** If a repo calls `afterXxx()` or `beforeXxx()` lifecycle hooks → move the entire operation to a service that wraps the repo call.

---

## Pattern 6: Service Gateway for Common Reads

When 30+ handlers all call `shopRepo.getShopById()` directly:

```javascript
// services/shopService.js
export async function getShop(shopId) {
  // Single point for caching, logging, validation
  return shopRepo.getShopById(shopId);
}
```

This enables adding caching/metrics later without touching 30+ handlers.
