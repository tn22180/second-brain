# Save Bar (App Bridge)

The `<ui-save-bar>` web component requires refs and `setAttribute` for loading state (React props don't work on web components).

## Pattern

```javascript
import {useRef, useEffect} from 'react';
import {useAppBridge} from '@shopify/app-bridge-react';

function MyForm() {
  const shopify = useAppBridge();
  const saveButtonRef = useRef(null);
  const [isDirty, setIsDirty] = useState(false);
  const [saving, setSaving] = useState(false);

  // Show/hide save bar based on form changes
  useEffect(() => {
    if (isDirty) {
      shopify.saveBar.show('my-save-bar');
    } else {
      shopify.saveBar.hide('my-save-bar');
    }
  }, [isDirty, shopify]);

  // Set loading state on save button (CRITICAL: use setAttribute)
  useEffect(() => {
    if (saveButtonRef.current) {
      if (saving) {
        saveButtonRef.current.setAttribute('loading', '');
        saveButtonRef.current.setAttribute('disabled', '');
      } else {
        saveButtonRef.current.removeAttribute('loading');
        saveButtonRef.current.removeAttribute('disabled');
      }
    }
  }, [saving]);

  const handleSave = async () => {
    setSaving(true);
    await saveData();
    setSaving(false);
    setIsDirty(false);
  };

  const handleDiscard = () => {
    resetForm();
    setIsDirty(false);
  };

  return (
    <Page title="Settings">
      <ui-save-bar id="my-save-bar">
        <button ref={saveButtonRef} variant="primary" onClick={handleSave}>
          Save
        </button>
        <button onClick={handleDiscard}>Discard</button>
      </ui-save-bar>
      {/* Form content */}
    </Page>
  );
}
```

## Key Points

| Issue | Solution |
|-------|----------|
| Loading state not working | Use `setAttribute('loading', '')` via ref |
| Disabled state not working | Use `setAttribute('disabled', '')` via ref |
| Save bar not showing | Call `shopify.saveBar.show('bar-id')` |
| Save bar not hiding | Call `shopify.saveBar.hide('bar-id')` |

## Tracking Form Changes

```javascript
const [initialData, setInitialData] = useState(null);
const [formData, setFormData] = useState({});

// Check if form is dirty
useEffect(() => {
  if (initialData) {
    const hasChanges = JSON.stringify(formData) !== JSON.stringify(initialData);
    setIsDirty(hasChanges);
  }
}, [formData, initialData]);

// After save, update initial data
const handleSave = async () => {
  await saveData(formData);
  setInitialData(formData);
  setIsDirty(false);
};
```
