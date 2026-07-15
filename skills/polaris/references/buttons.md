# Button Patterns

## Button Variants

```javascript
import {Button, ButtonGroup} from '@shopify/polaris';
import {PlusIcon, DeleteIcon} from '@shopify/polaris-icons';

// Primary action
<Button variant="primary" onClick={handleSave}>Save</Button>

// Secondary (default)
<Button onClick={handleCancel}>Cancel</Button>

// Destructive
<Button variant="primary" tone="critical" onClick={handleDelete}>Delete</Button>

// With icon
<Button icon={PlusIcon} onClick={handleAdd}>Add tier</Button>

// Icon only
<Button icon={DeleteIcon} accessibilityLabel="Delete" onClick={handleDelete} />

// Loading state
<Button variant="primary" loading={saving} onClick={handleSave}>
  {saving ? 'Saving...' : 'Save'}
</Button>
```

## Navigation (CRITICAL)

```javascript
// GOOD: Use url prop for navigation
<Button url="/settings">Go to Settings</Button>
<Button url="https://help.shopify.com" external>Help</Button>

// BAD: onClick + window.open
<Button onClick={() => window.open('/settings')}>Settings</Button>
```

## Button Tones

| Tone | Use Case |
|------|----------|
| (default) | Standard actions |
| `critical` | Destructive actions (delete, remove) |
| `success` | Positive confirmation |

## Button Sizes

```javascript
// Default size
<Button>Normal</Button>

// Large size
<Button size="large">Large Button</Button>

// Slim size
<Button size="slim">Slim</Button>
```

## ButtonGroup

```javascript
import {ButtonGroup, Button} from '@shopify/polaris';

// Group related buttons
<ButtonGroup>
  <Button>Cancel</Button>
  <Button variant="primary">Save</Button>
</ButtonGroup>

// Segmented (toggle-like)
<ButtonGroup variant="segmented">
  <Button pressed={view === 'list'} onClick={() => setView('list')}>List</Button>
  <Button pressed={view === 'grid'} onClick={() => setView('grid')}>Grid</Button>
</ButtonGroup>
```

## Disabled State

```javascript
<Button disabled>Cannot click</Button>

// Conditionally disabled
<Button disabled={!isValid} variant="primary" onClick={handleSubmit}>
  Submit
</Button>
```

## Full Width

```javascript
<Button fullWidth variant="primary">
  Full Width Button
</Button>
```
