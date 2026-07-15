---
name: polaris-components
description: Use this skill when the user asks about "Polaris components", "Shopify UI", "Button", "Card", "Modal", "IndexTable", "BlockStack", "InlineStack", "icons", "Badge", "Banner", or any Shopify Polaris component usage. Provides Polaris v12+ component patterns and best practices.
---

# Shopify Polaris (React) - v12

## Quick Reference

| Topic | Reference File |
|-------|---------------|
| Icons v9, Common Icon Names | [references/icons.md](references/icons.md) |
| Page, Layout, BlockStack, Spacing | [references/layout.md](references/layout.md) |
| Button Variants, Navigation, Groups | [references/buttons.md](references/buttons.md) |
| Text, Badge, Banner, Modal, Skeleton | [references/components.md](references/components.md) |

---

## Version Info

| Package | Version | Notes |
|---------|---------|-------|
| @shopify/polaris | ^12.16.0 | React component library |
| @shopify/polaris-icons | 9.3.0 | Icons v9 (no Minor/Major suffix) |
| @shopify/polaris-viz | ^15.1.3 | Charts and visualizations |
| @shopify/app-bridge-react | ^4.1.5 | Shopify App Bridge |

---

## Icons v9 (CRITICAL)

```javascript
// GOOD: v9 icons (no suffix)
import {PlusCircleIcon, DeleteIcon, SearchIcon} from '@shopify/polaris-icons';

// BAD: Old v8 icons (with Minor/Major suffix)
import {SearchMinor, PlusMajor} from '@shopify/polaris-icons';
```

---

## Quick Patterns

### Page with Layout

```javascript
<Page title="Page Title" primaryAction={{content: 'Save', onAction: handleSave}}>
  <Layout>
    <Layout.Section>
      <Card>
        <BlockStack gap="400">{/* Content */}</BlockStack>
      </Card>
    </Layout.Section>
  </Layout>
</Page>
```

### Stacking

```javascript
// Vertical (column)
<BlockStack gap="400">...</BlockStack>

// Horizontal (row)
<InlineStack gap="200" align="center">...</InlineStack>
```

### Button

```javascript
<Button variant="primary" onClick={handleSave}>Save</Button>
<Button variant="primary" tone="critical">Delete</Button>
<Button icon={PlusIcon}>Add</Button>
<Button url="/settings">Navigate</Button>  // Use url for navigation!
```

---

## Migration Notes (v11 to v12)

| Deprecated | Replacement |
|------------|-------------|
| `Stack` | `BlockStack` / `InlineStack` |
| `TextStyle` | `Text` with props |
| `Heading` | `Text variant="heading*"` |
| `LegacyCard` | `Card` + `Box` |
| `LegacyStack` | `BlockStack` / `InlineStack` |

---

## Checklist

```
- Using Polaris v12+ components (not Legacy*)
- Icons from v9 (no Minor/Major suffix)
- Button navigation uses url prop (not onClick)
- Proper spacing tokens (100-800)
- Text uses variant prop for typography
- Card uses Box/BlockStack for sections
- Modal uses Modal.Section for content
- Loading states with Skeleton components
- Proper accessibility labels on icon buttons
```
