# Resource Picker (App Bridge)

Use App Bridge's resource picker for selecting Shopify resources (products, collections, etc.).

## Product Selection

```javascript
import {useAppBridge} from '@shopify/app-bridge-react';

function ProductSelector({selectedProducts, onSelect}) {
  const shopify = useAppBridge();

  const handleSelectProducts = async () => {
    try {
      const selected = await shopify.resourcePicker({
        type: 'product',
        multiple: true,
        selectionIds: selectedProducts.map(p => ({id: p.id})),
        filter: {
          variants: false  // Exclude variants
        }
      });

      if (selected) {
        onSelect(selected.map(product => ({
          id: product.id,
          title: product.title,
          image: product.images?.[0]?.originalSrc || null
        })));
      }
    } catch (error) {
      console.error('Resource picker error:', error);
    }
  };

  return (
    <Button icon={SearchIcon} onClick={handleSelectProducts}>
      Browse products
    </Button>
  );
}
```

## Resource Picker Options

| Option | Type | Description |
|--------|------|-------------|
| `type` | string | `'product'`, `'collection'`, `'variant'` |
| `multiple` | boolean | Allow multiple selection |
| `selectionIds` | array | Pre-selected resource IDs `[{id: 'gid://...'}]` |
| `filter.variants` | boolean | Include/exclude variants |
| `filter.draft` | boolean | Include draft products |

## Collection Selection

```javascript
const selected = await shopify.resourcePicker({
  type: 'collection',
  multiple: false
});

if (selected && selected.length > 0) {
  const collection = selected[0];
  console.log('Selected collection:', collection.title);
}
```

## Pre-selecting Resources

```javascript
// Convert existing IDs to selection format
const selectionIds = existingProducts.map(p => ({
  id: `gid://shopify/Product/${p.shopifyId}`
}));

const selected = await shopify.resourcePicker({
  type: 'product',
  multiple: true,
  selectionIds
});
```

## Variant Selection

```javascript
const selected = await shopify.resourcePicker({
  type: 'product',
  multiple: true,
  filter: {
    variants: true  // Include variants
  }
});

// Each product will have variants array
selected.forEach(product => {
  product.variants.forEach(variant => {
    console.log('Variant:', variant.title, variant.price);
  });
});
```
