# Icons v9 (CRITICAL)

## Import Pattern

```javascript
// GOOD: v9 icons (no suffix)
import {
  PlusCircleIcon,
  DeleteIcon,
  EditIcon,
  SearchIcon,
  ChevronRightIcon,
  AlertCircleIcon,
  MenuHorizontalIcon
} from '@shopify/polaris-icons';

// BAD: Old v8 icons (with Minor/Major suffix)
import {SearchMinor, PlusMajor} from '@shopify/polaris-icons';
```

## Common Icon Names

| Action | Icon Name |
|--------|-----------|
| Add | `PlusIcon`, `PlusCircleIcon` |
| Delete | `DeleteIcon`, `XIcon` |
| Edit | `EditIcon` |
| Search | `SearchIcon` |
| Settings | `SettingsIcon` |
| Menu | `MenuHorizontalIcon`, `MenuVerticalIcon` |
| Chevron | `ChevronRightIcon`, `ChevronDownIcon`, `ChevronUpIcon` |
| Alert | `AlertCircleIcon`, `AlertTriangleIcon` |
| Check | `CheckIcon`, `CheckCircleIcon` |
| Info | `InfoIcon` |
| External | `ExternalIcon` |
| Download | `DownloadIcon` |
| Upload | `UploadIcon` |
| Refresh | `RefreshIcon` |
| Filter | `FilterIcon` |
| Sort | `SortIcon` |
| View | `ViewIcon` |
| Hide | `HideIcon` |

## Usage with Button

```javascript
import {Button} from '@shopify/polaris';
import {PlusIcon, DeleteIcon} from '@shopify/polaris-icons';

// With text
<Button icon={PlusIcon} onClick={handleAdd}>Add tier</Button>

// Icon only (requires accessibilityLabel)
<Button icon={DeleteIcon} accessibilityLabel="Delete" onClick={handleDelete} />
```

## Usage with Icon Component

```javascript
import {Icon} from '@shopify/polaris';
import {AlertCircleIcon} from '@shopify/polaris-icons';

<Icon source={AlertCircleIcon} tone="critical" />
```
