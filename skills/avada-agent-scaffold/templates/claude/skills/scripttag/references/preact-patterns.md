# Preact Patterns

## Use Preact Instead of React

```javascript
// Use preact directly
import {render} from 'preact';
import {useState, useEffect} from 'preact/hooks';
import {lazy, Suspense} from 'preact/compat';

// Rspack aliases handle React compat:
// 'react' -> 'preact/compat'
// 'react-dom' -> 'preact/compat'
```

## Sharing Components with Admin (React)

Scripttag can import React components from `@assets/` - they work via Preact compat:

```javascript
// rspack.config.js aliases:
// '@assets': '../assets/src'
// '@functions': '../functions/src'

// Import React component - works with Preact compat
const NotificationPopup = lazy(() =>
  import('@assets/components/NotificationPopup/NotificationPopup')
);

// Import lightweight constants from functions
import {DEFAULT_SETTINGS} from '@functions/const/widget/settings';
```

**Benefits:**
- Single source of truth for shared UI components
- Preview in admin matches storefront exactly
- Constants shared between backend, admin, and scripttag

## Functional Components with Hooks

```javascript
import {useState, useEffect, useMemo, useCallback} from 'preact/hooks';

function Widget() {
  const [data, setData] = useState(null);

  useEffect(() => {
    fetchData().then(setData);
  }, []);

  return data ? <Display data={data} /> : null;
}
```

## Window Data Pattern

```javascript
const {
  shop,           // Shop configuration
  customer,       // Current customer data
  settings,       // Widget settings
  translation,    // i18n translations
} = window.APP_DATA || {};

// Always destructure with defaults
const {items = [], config = {}} = settings || {};
```
