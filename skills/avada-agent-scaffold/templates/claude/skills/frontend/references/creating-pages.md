# Creating New Pages

When adding a new page to the admin app, follow this checklist.

## Checklist

| Step | File | Action |
|------|------|--------|
| 1. Page component | `pages/MyPage/MyPage.js` | Create main page component |
| 2. Index export | `pages/MyPage/index.js` | Export default component |
| 3. Loadable | `loadables/MyPage/MyPage.js` | Create lazy-loaded wrapper |
| 4. Route | `routes/routes.js` | Add route with import |
| 5. **Navigation** | `const/navigation.js` | **Add to navigationLinks array** |

## Example: Adding a "Resources" Page

### 1. Page Component

```javascript
// pages/Resources/Resources.js
export default function Resources() {
  return <Page title="Resources">...</Page>;
}
```

### 2. Index Export

```javascript
// pages/Resources/index.js
export {default} from './Resources';
```

### 3. Loadable Component

```javascript
// loadables/Resources/Resources.js
import React from 'react';
const Loadable = React.lazy(() => import('../../pages/Resources/Resources'));
export default Loadable;
```

### 4. Route

```javascript
// routes/routes.js
import Resources from '@assets/loadables/Resources/Resources';
// Add in Switch:
<Route exact path={prefix + '/resources'} component={Resources} />
```

### 5. Navigation

```javascript
// const/navigation.js - ADD TO NAVIGATION
export const navigationLinks = [
  {
    label: 'Resources',         // <-- ADD NEW ITEM
    destination: '/resources'
  },
  // ... other links
].map(item => ({
  ...item,
  destination: '/embed' + item.destination
}));
```

## Navigation File Location

```
packages/assets/src/const/navigation.js
```

The navigation array is transformed to add `/embed` prefix automatically.

## Skeleton Loading

All data-fetching pages must have skeleton loading states:

```javascript
function ResourcePageSkeleton() {
  return (
    <SkeletonPage primaryAction>
      <Layout>
        <Layout.Section>
          <Card>
            <SkeletonBodyText lines={5} />
          </Card>
        </Layout.Section>
      </Layout>
    </SkeletonPage>
  );
}
```

## Component Guidelines

- Use `.js` files only (no `.jsx`)
- Always create loadable components in organized folders with `index.js`
- Never create loadable components at top level
