---
name: storefront-widget
description: Use this skill when the user asks about "storefront widget", "scripttag", "customer-facing", "Preact", "bundle size", "lazy loading", "performance optimization", or any storefront frontend work. Provides Preact patterns for lightweight storefront widgets.
---

# Scripttag Development (Storefront Widget)

## Quick Reference

| Topic | Reference File |
|-------|---------------|
| Bundle Size, Lazy Loading, Tree Shaking | [references/performance.md](references/performance.md) |
| Preact Hooks, Sharing Components | [references/preact-patterns.md](references/preact-patterns.md) |
| Fetch/XHR/Form Interception | [references/request-interception.md](references/request-interception.md) |
| File Upload (base64 + sequential upload) | [references/file-upload.md](references/file-upload.md) |

---

## Overview

The scripttag package contains **customer-facing storefront widgets** injected into merchant stores. Performance is **CRITICAL** — every KB and millisecond impacts merchant store speed and conversion rates.

---

## Tech Stack

| Technology | Purpose | Why |
|------------|---------|-----|
| **Preact** | UI library | 3KB vs React's 40KB+ |
| **SCSS** | Styling | Scoped styles, minimal footprint |
| **Rspack** | Bundler | 10x faster than webpack |
| **Theme App Extension** | Script loading | Shopify-native |

> **Styling:** Always use custom SCSS/CSS. Avoid UI libraries.

---

## Directory Structure

```
packages/scripttag/
├── src/                      # Main widget entry
│   ├── index.js              # Main entry point
│   ├── loader.js             # Minimal loader script
│   ├── components/           # Shared components
│   └── styles/               # Global styles
├── [feature-name]/           # Feature-specific modules
└── rspack.config.js          # Build configuration
```

---

## Loading via Theme App Extension

```liquid
{% comment %} blocks/app-embed.liquid {% endcomment %}
<script>
  window.APP_DATA = {
    shop: {{ shop | json }},
    customer: {{ customer | json }},
    settings: {{ block.settings | json }},
    config: {{ shop.metafields['$app:feature']['config'].value | json }}
  };
</script>

<script src="{{ app_url }}/widget.min.js" defer></script>
```

Read the injected data from `window.APP_DATA` (or `window.{{APP_NAME}}`) inside the widget. `$app:feature` is the app's own reserved metafield namespace.

---

## Styling (SCSS with BEM)

```scss
.widget {
  &__button {
    padding: 8px 16px;
    border: none;
    border-radius: 4px;
    background: var(--primary-color);
    color: white;

    &--secondary {
      background: transparent;
      border: 1px solid var(--primary-color);
    }
  }
}
```

---

## Environment Configuration

```javascript
// rspack.config.js loads in order: .env.{ENVIRONMENT} → .env.local → .env
process.env.API_URL      // Backend API URL
process.env.HOST         // Current host URL
process.env.PUBLIC_PATH  // CDN path for assets
```

---

## Development Commands

```bash
npm run watch         # Development with watch
npm run build         # Production build
npm run build:analyze # Analyze bundle size
```

---

## File Upload Pattern

For features requiring file uploads, use `FileReader` to convert files to
base64, then upload each file **sequentially** via API (parallel uploads hit
backend rate limits) before submitting the form. Return early on the first
failure. See [references/file-upload.md](references/file-upload.md) for the full
`#_fileToBase64` + `handleUploadAndSubmit` implementation.

---

## Security

Storefront code runs on merchant stores against untrusted data — treat all dynamic values as hostile.

**NEVER** use `innerHTML` with template literals containing dynamic data:

```javascript
// BAD — XSS risk if url/title contains malicious content
el.innerHTML = `<img src="${url}" alt="${title}">`;

// GOOD — safe DOM API
const img = document.createElement('img');
img.src = url;
img.alt = title;
el.replaceChildren(img);
```

**Validate redirect URLs** before `window.location.href` assignment:

```javascript
import {isSafeRedirectUrl} from './helpers/urlValidation.js';
// Only allow same-origin or Shopify domains
if (isSafeRedirectUrl(url)) window.location.href = url;
```

**Validate postMessage origin** in OAuth/popup flows:

```javascript
import {getApiOrigin} from './helpers/urlValidation.js';
const expectedOrigin = getApiOrigin();
const handler = (event) => {
  if (expectedOrigin && event.origin !== expectedOrigin) return;
  // ... process message
};
```

**Quote URLs in CSS `url()`** to prevent CSS injection:

```javascript
`url("${imageUrl.replace(/["\\]/g, '\\$&')}")`
```

---

## Checklist

### Before Commit

```
- No barrel imports (use direct paths)
- Heavy components lazy loaded
- No console.log in production
- Custom SCSS with BEM naming
- No UI library dependencies
- No innerHTML with template literals containing user data (XSS)
```

### File Upload

```
- Use FileReader.readAsDataURL() for base64 conversion
- Upload files sequentially (not parallel) to avoid rate limits
- Return early on first upload failure
- Handle both response.fileUrl and response.data.fileUrl
- Validate required files before starting upload
- Send file metadata (fileName, fileType) with upload
```

### Bundle Size Check

```
- Loader < 3KB gzipped
- Main bundle < 50KB gzipped
- No unexpected large chunks
```
