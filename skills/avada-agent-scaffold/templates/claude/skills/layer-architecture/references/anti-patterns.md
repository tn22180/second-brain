# Anti-Patterns & Refactoring Recipes

## Anti-Pattern Detection Checklist

Use this when reviewing or refactoring backend code.

---

## AP-1: Repository imports Service (Circular Dependency)

```javascript
// BAD — repositories/itemRepository.js
import {afterCreateItem} from '../services/itemService'; // CIRCULAR!

export async function saveItem(shopId, data) {
  const item = await create(shopId, data);
  await afterCreateItem({shopId, item}); // Lifecycle hook in repo
  return item;
}
```

**Fix:** Move lifecycle to service, keep repo as pure CRUD.

```javascript
// repositories/itemRepository.js — pure CRUD
export async function create(shopId, data) {
  const ref = collection.doc();
  await ref.set({...data, shopId, createdAt: new Date()});
  return {id: ref.id, ...data};
}

// services/itemService.js — owns lifecycle
export async function createItem({shopId, itemData}) {
  const item = await itemRepo.create(shopId, itemData);
  await afterCreateItem({shopId, item});
  return {success: true, data: item};
}
```

---

## AP-2: Repository imports another Repository (Cross-collection)

```javascript
// BAD — repositories/resourceRepository.js
import {createItem} from './itemRepository'; // Cross-repo!
import {syncWidget} from './widgetRepository'; // Cross-repo!

export async function saveNewResource(shopId, data) {
  const resource = await create(shopId, data);
  await createItem({shopId, resourceId: resource.id, type: 'DEFAULT'});
  await syncWidget(shopId, resource);
  return resource;
}
```

**Fix:** Service orchestrates cross-collection operations.

```javascript
// services/resourceService.js
export async function onboardResource({shopId, data}) {
  const resource = await resourceRepo.create(shopId, data);
  await Promise.all([
    itemService.createDefaultItem({shopId, resource}),
    widgetService.attachWidget({shopId, resource})
  ]);
  return {success: true, data: resource};
}
```

---

## AP-3: Handler contains Business Logic

```javascript
// BAD — handlers/pubsub/subscribeXxx.js
const settings = await getSettingByType(shopId, SETTING_TYPE_X);
if (!settings.status || !settings.enabled) return;
const items = await getItemsByGroup(shopId, groupId);
const filtered = items.filter(i =>
  (!i.lockedUntil || new Date(i.lockedUntil) <= lastActionDate)
  && !isItemLocked(i)
);
// ... 50+ more lines of business logic
```

**Fix:** Handler = thin dispatcher.

```javascript
// Handler
await resourceService.processResourceRefresh({shopId, groupId});

// Service contains all business logic
```

---

## AP-4: Controller calls Repository directly

```javascript
// BAD — controllers/xxxController.js
import {getShopById, updateShopData} from '../repositories/shopRepository';
import {FieldValue} from '@google-cloud/firestore';

export async function toggleFeature(ctx) {
  const {shop} = ctx.state;
  await updateShopData(shop.id, {
    features: FieldValue.arrayUnion(ctx.req.body.feature) // FieldValue in controller!
  });
}
```

**Fix:** Controller → Service → Repository.

```javascript
// controllers/xxxController.js
export async function toggleFeature(ctx) {
  const result = await shopService.toggleFeature(ctx.state.shop.id, ctx.req.body.feature);
  ctx.body = result;
}

// services/shopService.js
export async function toggleFeature(shopId, feature) {
  await shopRepo.addFeature(shopId, feature);
  return {success: true};
}

// repositories/shopRepository.js
export async function addFeature(shopId, feature) {
  await collection.doc(shopId).update({features: FieldValue.arrayUnion(feature)});
}
```

---

## AP-5: Helper contains DB calls

```javascript
// BAD — helpers/resource/calculateTotal.js
import {getTotalByType} from '../repositories/itemRepository';

export async function calculateTotal(shopId, resourceId) {
  const [added, removed, adjusted] = await Promise.all([
    getTotalByType(shopId, resourceId, 'added'),
    getTotalByType(shopId, resourceId, 'removed'),
    getTotalByType(shopId, resourceId, 'adjusted')
  ]);
  return added - removed + adjusted;
}
```

**Fix:** Move to service. Helper stays pure.

```javascript
// helpers/resource/totalCalculation.js — pure utility
export function computeNetTotal({added, removed, adjusted}) {
  return added - removed + adjusted;
}

// services/resource/totalCalculationService.js — DB access
export async function calculateTotal(shopId, resourceId) {
  const [added, removed, adjusted] = await Promise.all([
    itemRepo.getTotalByType(shopId, resourceId, 'added'),
    itemRepo.getTotalByType(shopId, resourceId, 'removed'),
    itemRepo.getTotalByType(shopId, resourceId, 'adjusted')
  ]);
  return computeNetTotal({added, removed, adjusted});
}
```

---

## AP-6: Response formatting in Controller/Service

```javascript
// BAD — controllers/restApiV2/resourceController.js
const pickedResource = pick(resource, resourceFields);
const resourceWithGroup = {...pickedResource, groupName: group?.name};
return formatDateFields(resourceWithGroup);
```

**Fix:** Extract to presenter.

```javascript
// controllers/restApiV2/resourceController.js
ctx.body = {success: true, data: presentResource(resource, {groups})};

// presenters/restApi/resourcePresenter.js
export function presentResource(resource, {groups} = {}) {
  const group = groups?.find(g => g.id === resource.groupId);
  const picked = {};
  for (const f of RESOURCE_FIELDS) {
    if (resource[f] !== undefined) picked[f] = resource[f];
  }
  return formatDateFields({...picked, groupName: group?.name || ''});
}
```

---

## AP-7: Duplicate code across handlers

```javascript
// BAD — Same provider sync logic in 2 files
// subscribeBackgroundHandling.js:783-810
// mediumHandler.js:351-378
const prepareListId = listIdsAudience.length ? listIdsAudience : [listId];
const matchedLists = await providerService.findEmailInLists(email, prepareListId);
await Promise.all(matchedLists.map(id => providerService.updateContact(id, data)));
```

**Fix:** Extract to a single service method.

```javascript
// services/integrate/providerIntegrationService.js
export async function syncResourceToProvider({integration, resource, groups}) {
  const {listId, listIdsAudience = []} = integration;
  const prepareListId = listIdsAudience.length ? listIdsAudience : [listId];
  if (!prepareListId.length) return;
  const matchedLists = await providerService.findEmailInLists(resource.email, prepareListId);
  await Promise.all(matchedLists.map(id => providerService.updateContact(id, data)));
}
```

---

## AP-8: Service bypasses Repository (direct Firestore)

```javascript
// BAD — services/resourceService.js
const snap = await admin.firestore().collection('itemActivities')
  .where('shopId', '==', shopId)
  .where('type', '==', 'archived').get();
```

**Fix:** Route through the collection's repository.

```javascript
// repositories/itemActivityRepository.js
export async function getByType(shopId, type) {
  const snap = await collection.where('shopId', '==', shopId)
    .where('type', '==', type).get();
  return snap.docs.map(doc => prepareDoc({doc}));
}

// services/resourceService.js
const activities = await activityRepo.getByType(shopId, 'archived');
```

---

## AP-9: Hardcoded shop IDs

```javascript
// BAD
if (['30P2movUNPWWQycRyOIW', 'qjap3Et7CJ7Dn43XpWDb'].includes(shop.id)) {
  items = items.filter(i => i.specialFlag);
}
if (shopId === 'example.myshopify.com') {
  // special date logic
}
```

**Fix:** Use shop-level feature flags or configuration.

```javascript
// Check a flag on the shop document instead
if (shop.enableSpecialFilter) {
  items = items.filter(i => i.specialFlag);
}
```
