# App Bridge (Direct API)

## When to Use

| Scenario | Use App Bridge | Use Firebase API |
|----------|---------------|------------------|
| Simple Shopify CRUD | Yes | No |
| Need Firestore data | No | Yes |
| Complex business logic | No | Yes |
| Background processing | No | Yes |

## Direct API Call

```javascript
import { authenticatedFetch } from '@shopify/app-bridge/utilities';

async function fetchProducts(app) {
  const response = await authenticatedFetch(app)(
    '/admin/api/2024-04/graphql.json',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: `{ products(first: 10) { nodes { id title } } }`
      })
    }
  );

  return response.json();
}
```

**Benefits:**
- Faster (no Firebase roundtrip)
- Lower cost (no function invocation)
- Uses shop's session directly

## App Bridge Hooks

```javascript
import { useAppBridge } from '@shopify/app-bridge-react';

function MyComponent() {
  const shopify = useAppBridge();

  const fetchData = async () => {
    const response = await shopify.graphql(`
      query {
        shop {
          name
          email
        }
      }
    `);
    return response.data;
  };
}
```

## Resource Picker

```javascript
import { useAppBridge } from '@shopify/app-bridge-react';

function ProductSelector() {
  const shopify = useAppBridge();

  const handleSelect = async () => {
    const selected = await shopify.resourcePicker({
      type: 'product',
      multiple: true,
      filter: { variants: false }
    });

    if (selected) {
      console.log('Selected:', selected);
    }
  };
}
```

## Toast Notifications

```javascript
const shopify = useAppBridge();

// Success toast
shopify.toast.show('Changes saved successfully');

// Error toast
shopify.toast.show('Failed to save', { isError: true });
```

## Navigation

```javascript
const shopify = useAppBridge();

// Navigate within app
shopify.navigate.toPath('/settings');

// Navigate to Shopify admin
shopify.navigate.toAdminPath('/orders');

// Open external URL
shopify.navigate.toRemote('https://help.shopify.com');
```

## Modal

```javascript
const shopify = useAppBridge();

// Open modal
shopify.modal.show('confirm-modal');

// Close modal
shopify.modal.hide('confirm-modal');
```
