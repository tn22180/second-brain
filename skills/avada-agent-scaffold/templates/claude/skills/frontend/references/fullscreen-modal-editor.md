# Fullscreen Modal Editor Pattern

For complex editors that benefit from fullscreen space (widget editor, template builder), use an App Bridge Modal with `variant="max"`. The editor content runs in an iframe; the parent component handles SaveBar actions via `postMessage`.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  Parent Component (EditorModal.js)                          │
│  - Opens Modal with variant="max"                           │
│  - Declares SaveBar as Modal child                          │
│  - Sends postMessage('save'/'discard') to iframe            │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│  Iframe Content (EditorModalContent.js)                     │
│  - Actual editor UI                                         │
│  - Controls SaveBar visibility via shopify.saveBar.show()   │
│  - Listens for postMessage to execute save/discard          │
└─────────────────────────────────────────────────────────────┘
```

## Parent Component (Modal Host)

```jsx
import {Modal, SaveBar, TitleBar} from '@shopify/app-bridge-react';

function sendMessageToIframe(msg) {
  const modal = document.getElementById('app-editor-modal');
  if (modal?.contentWindow) {
    modal.contentWindow.postMessage(msg, '*');
  }
}

function EditorModal() {
  const history = useHistory();
  const location = useLocation();
  const isFullscreen = new URLSearchParams(location.search).get('fullscreen') === 'true';

  // Inside iframe OR standalone: render actual editor
  if (isFullscreen || !isEmbeddedAppEnv) {
    return <Suspense fallback={<div />}><EditorModalContent /></Suspense>;
  }

  // Embedded mode: open fullscreen modal
  const modalSrc = getUrl('/editor?fullscreen=true');

  return (
    <Modal
      id="app-editor-modal"
      variant="max"
      src={modalSrc}
      open
      onHide={() => history.push('/')}
    >
      <TitleBar title="Editor" />
      <SaveBar id="app-editor-save-bar">
        <button variant="primary" onClick={() => sendMessageToIframe('save')}></button>
        <button onClick={() => sendMessageToIframe('discard')}></button>
      </SaveBar>
    </Modal>
  );
}
```

## Iframe Content (Editor)

```jsx
function EditorModalContent() {
  const [hasChanges, setHasChanges] = useState(false);

  // Show/hide SaveBar based on changes
  useEffect(() => {
    if (hasChanges) {
      shopify.saveBar.show('app-editor-save-bar');
    } else {
      shopify.saveBar.hide('app-editor-save-bar');
    }
  }, [hasChanges]);

  // Listen for save/discard from parent
  useEffect(() => {
    const handler = (event) => {
      if (event.data === 'save') handleSave();
      if (event.data === 'discard') handleDiscard();
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, []);

  return <div>Editor UI...</div>;
}
```

## Key Points

- **Modal variant="max"**: Fullscreen modal for complex editors
- **iframe src with ?fullscreen=true**: Same component renders differently based on context
- **postMessage communication**: Parent sends 'save'/'discard', iframe executes
- **shopify.saveBar.show/hide**: App Bridge handles cross-frame SaveBar visibility
- **Lazy loading**: Use `React.lazy()` + `Suspense` for editor content
