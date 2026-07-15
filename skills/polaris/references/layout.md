# Layout Components

## Page Structure

```javascript
import {Page, Layout, Card, BlockStack, Box} from '@shopify/polaris';

function MyPage() {
  return (
    <Page
      title="Page Title"
      subtitle="Optional subtitle"
      primaryAction={{content: 'Save', onAction: handleSave}}
      secondaryActions={[
        {content: 'Export', onAction: handleExport}
      ]}
      backAction={{content: 'Back', onAction: () => history.goBack()}}
    >
      <Layout>
        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              {/* Main content */}
            </BlockStack>
          </Card>
        </Layout.Section>

        <Layout.Section variant="oneThird">
          <Card>
            {/* Sidebar content */}
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
```

## BlockStack vs InlineStack

```javascript
import {BlockStack, InlineStack, Text, Button} from '@shopify/polaris';

// BlockStack: Vertical stacking (column)
<BlockStack gap="400">
  <Text>Item 1</Text>
  <Text>Item 2</Text>
</BlockStack>

// InlineStack: Horizontal stacking (row)
<InlineStack gap="200" align="center" blockAlign="center">
  <Button>Cancel</Button>
  <Button variant="primary">Save</Button>
</InlineStack>
```

## Spacing Tokens

| Token | Value | Use Case |
|-------|-------|----------|
| 100 | 4px | Tight spacing |
| 200 | 8px | Small gaps |
| 300 | 12px | Medium-small |
| 400 | 16px | Default spacing |
| 500 | 20px | Medium-large |
| 600 | 24px | Large gaps |
| 800 | 32px | Section spacing |

## Layout.Section Variants

| Variant | Description |
|---------|-------------|
| (default) | Full width |
| `oneThird` | One-third width sidebar |
| `oneHalf` | Half width |

## Box Component

```javascript
import {Box} from '@shopify/polaris';

// For custom padding/margins
<Box padding="400" background="bg-surface-secondary">
  Content with padding and background
</Box>

// Border radius
<Box borderRadius="200" borderColor="border" borderWidth="025">
  Bordered content
</Box>
```

## Card Sections

```javascript
import {Card, BlockStack, Text} from '@shopify/polaris';

<Card>
  <BlockStack gap="400">
    <Text variant="headingMd">Card Title</Text>
    <Text>Card content goes here.</Text>
  </BlockStack>
</Card>
```
