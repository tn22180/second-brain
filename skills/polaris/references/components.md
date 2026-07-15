# Common Components

## Text Variants

```javascript
import {Text} from '@shopify/polaris';

<Text variant="headingXl" as="h1">Page Title</Text>
<Text variant="headingLg" as="h2">Section Title</Text>
<Text variant="headingMd" as="h3">Card Title</Text>
<Text variant="bodyMd">Regular body text</Text>
<Text variant="bodySm">Small text</Text>

// With tone
<Text tone="subdued">Secondary text</Text>
<Text tone="success">Success message</Text>
<Text tone="critical">Error message</Text>

// Font weight
<Text fontWeight="bold">Bold text</Text>
```

## Badge

```javascript
import {Badge} from '@shopify/polaris';

<Badge>Default</Badge>
<Badge tone="info">Info</Badge>
<Badge tone="success">Active</Badge>
<Badge tone="warning">Pending</Badge>
<Badge tone="critical">Error</Badge>

// With progress
<Badge progress="incomplete">Draft</Badge>
<Badge progress="complete" tone="success">Complete</Badge>
```

## Banner

```javascript
import {Banner} from '@shopify/polaris';

// Info
<Banner title="Info" tone="info">
  This is informational content.
</Banner>

// Success
<Banner title="Success" tone="success" onDismiss={() => setShow(false)}>
  Changes saved successfully.
</Banner>

// Warning
<Banner title="Warning" tone="warning">
  This action cannot be undone.
</Banner>

// Critical
<Banner title="Error" tone="critical">
  Failed to save changes.
</Banner>
```

## Modal

```javascript
import {Modal, Text} from '@shopify/polaris';

<Modal
  open={open}
  onClose={() => setOpen(false)}
  title="Confirm action"
  primaryAction={{
    content: 'Confirm',
    onAction: handleConfirm,
    loading: loading
  }}
  secondaryActions={[
    {content: 'Cancel', onAction: () => setOpen(false)}
  ]}
>
  <Modal.Section>
    <Text>Are you sure you want to proceed?</Text>
  </Modal.Section>
</Modal>
```

## Loading States (Skeleton)

```javascript
import {
  SkeletonPage,
  SkeletonBodyText,
  SkeletonDisplayText,
  Card,
  Layout
} from '@shopify/polaris';

function PageSkeleton() {
  return (
    <SkeletonPage primaryAction>
      <Layout>
        <Layout.Section>
          <Card>
            <SkeletonDisplayText size="small" />
            <SkeletonBodyText lines={3} />
          </Card>
        </Layout.Section>
      </Layout>
    </SkeletonPage>
  );
}
```

## Spinner

```javascript
import {Spinner} from '@shopify/polaris';

<Spinner accessibilityLabel="Loading" size="small" />
<Spinner accessibilityLabel="Loading" size="large" />
```

## EmptyState

```javascript
import {EmptyState} from '@shopify/polaris';

<EmptyState
  heading="No products yet"
  action={{content: 'Add product', onAction: handleAdd}}
  image="https://cdn.shopify.com/..."
>
  <p>Add products to get started.</p>
</EmptyState>
```
