---
name: layer-architecture
description: Use this skill when writing or refactoring backend code across layers — handler, controller, service, repository, presenter. Provides strict import rules, code templates, anti-patterns, and refactoring patterns for the layered architecture. MUST be consulted when extracting business logic, breaking circular dependencies, or creating new services/presenters.
---

# Backend — Layered Architecture Rules

## Quick Reference

| Topic | Reference File |
|-------|---------------|
| Service patterns, orchestration, cross-repo coordination | [references/service-patterns.md](references/service-patterns.md) |
| Presenter patterns, field whitelists, composition | [references/presenter-patterns.md](references/presenter-patterns.md) |
| Anti-patterns and refactoring recipes | [references/anti-patterns.md](references/anti-patterns.md) |

---

## Layer Rules (Strict)

```
Request → Handler/Controller → Service → Repository → Firestore
                                  ↓
                              Presenter → Response
```

### Import Direction (ONE WAY ONLY)

```
handlers/controllers → services → repositories
                     → presenters
                     → helpers (pure utilities only)
```

**NEVER:** `repository → service`, `handler → repository`, `helper → repository/service`

### Layer Responsibilities

| Layer | Location | Does | Does NOT |
|-------|----------|------|----------|
| **Handler** | `handlers/` | Parse PubSub/trigger event, call 1 service method, return | if/else business logic, DB calls, calculations |
| **Controller** | `controllers/` | Validate input, call service, call presenter, set `ctx.body` | Business logic, DB calls, `FieldValue`, `pick()` on response |
| **Service** | `services/` | Business logic, orchestrate repos, cross-collection coordination, external API calls | `ctx` object, HTTP concerns, response formatting |
| **Repository** | `repositories/` | CRUD for ONE Firestore collection, query building, batch ops | Import other repos, import services, business decisions, side-effects |
| **Presenter** | `presenters/` | Field picking, key renaming, date formatting, nested shape building | DB calls, business logic, side-effects |
| **Helper** | `helpers/` | Pure utility functions (string, date, array, math) | DB calls, API calls, PubSub, import repos/services |

---

## Handler Template

```javascript
// handlers/pubsub/subscribeXxx.js
import {xxxService} from '../../services/xxxService';

export default async function subscribeXxx(message) {
  const {shopId, itemId, action} = message.data;
  await xxxService.processAction({shopId, itemId, action});
}
```

**Max 30 lines.** If handler has if/else business logic → extract to service.

---

## Controller Template

```javascript
// controllers/xxxController.js
import {xxxService} from '../services/xxxService';
import {presentXxx} from '../presenters/restApi/xxxPresenter';

export async function getOne(ctx) {
  const {shop} = ctx.state;
  const {id} = ctx.params;

  const result = await xxxService.getById(shop.id, id);
  if (!result.success) {
    ctx.status = result.status || 400;
    ctx.body = result;
    return;
  }

  ctx.body = {success: true, data: presentXxx(result.data)};
}
```

**Controller does:** validate → service call → presenter → response.
**Controller does NOT:** `FieldValue.increment()`, `pick(resource, fields)`, business calculations.

---

## Service Template

```javascript
// services/xxxService.js
import {getById, updateById} from '../repositories/xxxRepository';
import {getShopById} from '../repositories/shopRepository';
import {getItemById} from '../repositories/itemRepository';

/**
 * Process business action for xxx
 * @param {Object} params
 * @param {string} params.shopId
 */
export async function processAction({shopId, itemId, action}) {
  const [shop, item] = await Promise.all([
    getShopById(shopId),
    getItemById(itemId)
  ]);

  if (!shop || !item) return {success: false, error: 'Not found'};

  // Business logic here
  const result = computeResult(item, action);

  await updateById(itemId, shopId, result);
  return {success: true, data: result};
}
```

**Service is the ONLY layer that:** makes business decisions, calls multiple repos, calls external APIs, publishes PubSub.

---

## Repository Template

```javascript
// repositories/xxxRepository.js — ONE collection only
import {getFirestore} from 'firebase-admin/firestore';
import {prepareDoc, paginateQuery} from './helper';

const collection = getFirestore().collection('xxxCollection');

export async function getById(id, shopId) {
  const doc = await collection.doc(id).get();
  if (!doc.exists) return null;
  const data = prepareDoc({doc});
  if (data.shopId !== shopId) return null;
  return data;
}

export async function create(shopId, data) {
  const ref = collection.doc();
  const docData = {...data, shopId, createdAt: new Date(), updatedAt: new Date()};
  await ref.set(docData);
  return {id: ref.id, ...docData};
}
```

**Repository imports ONLY:** `firebase-admin`, `@google-cloud/firestore`, `./helper`, pure utilities from `helpers/`.
**Repository NEVER imports:** other repositories, services, PubSub, external APIs.

---

## Presenter Template

```javascript
// presenters/restApi/xxxPresenter.js
import {formatDateFields} from '@avada/firestore-utils';

const PUBLIC_FIELDS = ['id', 'name', 'status', 'createdAt', 'updatedAt'];

export function presentXxx(item) {
  const picked = {};
  for (const field of PUBLIC_FIELDS) {
    if (item[field] !== undefined) picked[field] = item[field];
  }
  return formatDateFields(picked);
}

export function presentXxxList(items) {
  return items.map(presentXxx);
}
```

**Presenter is:** pure function, no side-effects, no DB, no imports from repos/services.
**Presenter owns:** field whitelist, key renaming, date formatting, nested shape composition.

---

## Refactoring Decision Tree

```
"Where does this code belong?"

Is it a Firestore read/write for a single collection?
  → Repository

Does it make a business decision (if/else on business rules)?
  → Service

Does it coordinate multiple repos or external APIs?
  → Service

Does it format data for API response (pick fields, rename keys)?
  → Presenter

Is it a pure calculation with no side-effects?
  → Helper (if reusable) or inline in Service

Does it parse HTTP request or set HTTP response?
  → Controller

Does it parse PubSub/trigger events?
  → Handler
```
