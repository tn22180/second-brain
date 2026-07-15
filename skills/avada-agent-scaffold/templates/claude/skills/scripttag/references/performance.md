# Performance Rules (CRITICAL)

## Bundle Size Limits

| Component | Target Size |
|-----------|-------------|
| Loader script | < 3KB gzipped |
| Main bundle | < 50KB gzipped |
| Feature chunk | < 30KB gzipped |
| Initial load total | < 60KB gzipped |

## Minimal Loader Pattern

```javascript
// loader.js - Keep as small as possible (~2KB)
function loadScript() {
  const script = document.createElement('script');
  script.async = true;
  script.src = `${CDN_URL}/main.min.js`;
  document.head.appendChild(script);
}

// Load after page ready (non-blocking)
if (document.readyState === 'complete') {
  setTimeout(loadScript, 1);
} else {
  window.addEventListener('load', loadScript, false);
}
```

## Lazy Loading Components

```javascript
// Use preact/compat lazy (NOT preact-lazy) for React component compatibility
import {lazy, Suspense} from 'preact/compat';

const HeavyComponent = lazy(() => import('./HeavyComponent'));

// With Suspense wrapper
<Suspense fallback={null}>
  <HeavyComponent />
</Suspense>
```

## Tree Shaking

```javascript
// BAD: Import entire library
import * as utils from '@avada/utils';

// GOOD: Import only what you need
import {isEmpty} from '@avada/utils/lib/isEmpty';

// BAD: Barrel imports
import {formatDate, formatCurrency} from '../helpers';

// GOOD: Direct path imports
import formatDate from '../helpers/formatDate';
import formatCurrency from '../helpers/formatCurrency';
```

## Checklist

```
- No barrel imports (use direct paths)
- Heavy components lazy loaded
- Dynamic imports for conditional features
- Tree-shaking friendly imports
- No console.log in production
- Custom SCSS with BEM naming
- No UI library dependencies
```
