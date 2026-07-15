---
name: frontend-development
description: Use this skill when the user asks about "React admin", "Polaris pages", "translations", "loadable components", "skeleton loading", "useFetchApi", "useCreateApi", "locale", "i18n", or any admin frontend development work. Provides React/Polaris patterns for the embedded admin app.
---

# Frontend Development (packages/assets)

> **Admin Embedded App** - Uses React + Shopify Polaris
>
> For **storefront widgets** (customer-facing), see `scripttag` skill

## Quick Reference

| Topic | Reference File |
|-------|---------------|
| i18n, Translation Keys, yarn update-label | [references/translations.md](references/translations.md) |
| useFetchApi, useCreateApi, useEditApi | [references/api-hooks.md](references/api-hooks.md) |
| ui-save-bar, Loading States | [references/save-bar.md](references/save-bar.md) |
| Product/Collection Picker | [references/resource-picker.md](references/resource-picker.md) |
| New Page Checklist, Routes, Navigation | [references/creating-pages.md](references/creating-pages.md) |
| Fullscreen Modal Editor (App Bridge variant="max") | [references/fullscreen-modal-editor.md](references/fullscreen-modal-editor.md) |

---

## Directory Structure

```
packages/assets/src/
├── components/        # Reusable React components
├── pages/            # Page components with skeleton loading
├── loadables/        # Code-split components (organized in folders)
├── contexts/         # React contexts for state management
├── hooks/            # Custom React hooks (API, state)
├── services/         # API services calling admin endpoints
├── routes/           # Route definitions (routes.js)
└── locale/           # Translations
    ├── input/        # Source translation JSON files
    └── output/       # Generated translated files
```

---

## Quick Patterns

### Translation Usage

```javascript
import {useTranslation} from 'react-i18next';

function MyPage() {
  const {t} = useTranslation();
  return <Page title={t('MyPage.title')}>{t('MyPage.subtitle')}</Page>;
}
```

### API Hooks

```javascript
// Fetch data
const {data, loading, fetchApi} = useFetchApi({
  url: '/api/resources',
  defaultData: [],
  initLoad: true
});

// Create
const {creating, handleCreate} = useCreateApi({
  url: '/api/resources',
  successMsg: 'Created!',
  successCallback: () => fetchApi()
});
```

### Skeleton Loading

```javascript
function PageSkeleton() {
  return (
    <SkeletonPage primaryAction>
      <Layout>
        <Layout.Section>
          <Card>
            <SkeletonBodyText lines={5} />
          </Card>
        </Layout.Section>
      </Layout>
    </SkeletonPage>
  );
}
```

---

## State Management

- Use React Context for global state
- Use local state for component-specific data

```javascript
// contexts/ShopContext.js
const ShopContext = createContext();

export function ShopProvider({ children }) {
  const [shop, setShop] = useState(null);

  return (
    <ShopContext.Provider value={{ shop, setShop }}>
      {children}
    </ShopContext.Provider>
  );
}

export const useShop = () => useContext(ShopContext);
```

---

## Component Guidelines

- Use `.js` files only (no `.jsx`)
- Always create loadable components in organized folders with `index.js`
- All data-fetching pages must have skeleton loading states

---

## Fullscreen Modal Editor Pattern

For complex editors that benefit from fullscreen space (widget editor, template
builder), use an App Bridge Modal with `variant="max"`. The editor content runs
in an iframe; the parent component handles SaveBar actions via `postMessage`.
See [references/fullscreen-modal-editor.md](references/fullscreen-modal-editor.md)
for the full parent/iframe pattern.

---

## Development Commands

```bash
# Start embedded app development
cd packages/assets && npm run watch:embed

# Start standalone development
cd packages/assets && npm run watch:standalone

# Production build
cd packages/assets && npm run production
```
