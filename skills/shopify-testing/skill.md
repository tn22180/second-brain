# Shopify App Browser Testing Skill

Use this skill when you need to test the Shopify app using Playwright MCP. This covers admin app testing, theme extension setup, storefront testing, and e-commerce flows.

## Prerequisites

Before testing, read `shopify.app.toml` to get:
- `dev_store_url` - Store domain (e.g., `thomas-joy-klaviyo-prod.myshopify.com`)
- `name` - App name, convert to kebab-case for URL (e.g., `thomas app base template` → `thomas-app-base-template`)

## URL Patterns

### Admin URLs
| Purpose | URL Pattern |
|---------|-------------|
| Embedded App | `https://admin.shopify.com/store/{store}/apps/{app-handle}/embed` |
| App Page | `https://admin.shopify.com/store/{store}/apps/{app-handle}/{page}` |
| Theme Editor | `https://admin.shopify.com/store/{store}/themes/current/editor` |
| Theme Customizer | `https://admin.shopify.com/store/{store}/themes` |
| Online Store | `https://admin.shopify.com/store/{store}/themes` |
| Products | `https://admin.shopify.com/store/{store}/products` |
| Orders | `https://admin.shopify.com/store/{store}/orders` |
| Customers | `https://admin.shopify.com/store/{store}/customers` |
| Settings | `https://admin.shopify.com/store/{store}/settings` |
| App Settings | `https://admin.shopify.com/store/{store}/settings/apps` |

### Storefront URLs
| Purpose | URL Pattern |
|---------|-------------|
| Homepage | `https://{store-domain}` |
| Products | `https://{store-domain}/collections/all` |
| Product Page | `https://{store-domain}/products/{handle}` |
| Cart | `https://{store-domain}/cart` |
| Checkout | `https://{store-domain}/checkout` |

## Testing Workflows

### 1. Test Embedded Admin App

```javascript
// 1. Navigate to embedded app
mcp__playwright__browser_navigate({ url: "https://admin.shopify.com/store/{store}/apps/{app-handle}/embed" })

// 2. Wait for app to load (look for app content in iframe)
mcp__playwright__browser_wait_for({ time: 3 })

// 3. Take snapshot to verify content
mcp__playwright__browser_snapshot({})

// 4. Check console for errors
mcp__playwright__browser_console_messages({ level: "error" })
```

### 2. Add Theme App Extension Block

```javascript
// 1. Go to Theme Editor
mcp__playwright__browser_navigate({ url: "https://admin.shopify.com/store/{store}/themes/current/editor" })

// 2. Wait for editor to load
mcp__playwright__browser_wait_for({ text: "Add section" })

// 3. Click "Add section" or "Add block"
mcp__playwright__browser_click({ element: "Add section button", ref: "..." })

// 4. Search for app block
mcp__playwright__browser_type({ element: "Search input", ref: "...", text: "{app-name}" })

// 5. Click to add the app block
mcp__playwright__browser_click({ element: "App block", ref: "..." })

// 6. Save changes
mcp__playwright__browser_click({ element: "Save button", ref: "..." })
```

### 3. Test Storefront with App Extension

```javascript
// 1. Navigate to storefront
mcp__playwright__browser_navigate({ url: "https://{store-domain}" })

// 2. Wait for page load
mcp__playwright__browser_wait_for({ time: 2 })

// 3. Take snapshot to check if app widget is visible
mcp__playwright__browser_snapshot({})

// 4. Check for app-specific elements (e.g., loyalty widget, popup)
mcp__playwright__browser_wait_for({ text: "Points" }) // or relevant app text
```

### 4. Add Product to Cart

```javascript
// 1. Navigate to a product page
mcp__playwright__browser_navigate({ url: "https://{store-domain}/products/{product-handle}" })

// 2. Wait for product page
mcp__playwright__browser_wait_for({ time: 2 })

// 3. Click "Add to cart" button
mcp__playwright__browser_click({ element: "Add to cart button", ref: "..." })

// 4. Wait for cart update
mcp__playwright__browser_wait_for({ time: 1 })

// 5. Verify cart (navigate or check cart drawer)
mcp__playwright__browser_navigate({ url: "https://{store-domain}/cart" })
```

### 5. Complete Checkout Flow

```javascript
// 1. Go to cart
mcp__playwright__browser_navigate({ url: "https://{store-domain}/cart" })

// 2. Click checkout
mcp__playwright__browser_click({ element: "Checkout button", ref: "..." })

// 3. Fill shipping info (if not logged in)
mcp__playwright__browser_fill_form({ fields: [
  { name: "Email", type: "textbox", ref: "...", value: "test@example.com" },
  { name: "First name", type: "textbox", ref: "...", value: "Test" },
  { name: "Last name", type: "textbox", ref: "...", value: "User" },
  { name: "Address", type: "textbox", ref: "...", value: "123 Test St" },
  { name: "City", type: "textbox", ref: "...", value: "Test City" },
  { name: "ZIP", type: "textbox", ref: "...", value: "12345" }
]})

// 4. Continue to shipping/payment
mcp__playwright__browser_click({ element: "Continue button", ref: "..." })

// 5. Verify checkout extensions are visible (if applicable)
mcp__playwright__browser_snapshot({})
```

### 6. Test Checkout UI Extension

```javascript
// 1. Complete steps to reach checkout
// 2. Look for extension render points
mcp__playwright__browser_snapshot({})

// 3. Verify extension content is displayed
mcp__playwright__browser_wait_for({ text: "{extension-text}" })

// 4. Interact with extension if needed
mcp__playwright__browser_click({ element: "Extension button", ref: "..." })
```

### 7. Browse Shopify Admin Settings

```javascript
// 1. Go to Settings
mcp__playwright__browser_navigate({ url: "https://admin.shopify.com/store/{store}/settings" })

// 2. Navigate to specific settings
// - Apps and sales channels: /settings/apps
// - Notifications: /settings/notifications
// - Checkout: /settings/checkout
// - Markets: /settings/markets
```

### 8. Create Test Order (Admin)

```javascript
// 1. Go to Orders
mcp__playwright__browser_navigate({ url: "https://admin.shopify.com/store/{store}/orders" })

// 2. Click "Create order"
mcp__playwright__browser_click({ element: "Create order button", ref: "..." })

// 3. Add products
mcp__playwright__browser_click({ element: "Browse products", ref: "..." })
mcp__playwright__browser_click({ element: "Product to add", ref: "..." })

// 4. Add customer
mcp__playwright__browser_click({ element: "Add customer", ref: "..." })

// 5. Complete order
mcp__playwright__browser_click({ element: "Collect payment", ref: "..." })
```

## Common Testing Scenarios

### Verify App Loads Without Errors
1. Navigate to embedded app
2. Wait for iframe content
3. Check `browser_console_messages` for errors
4. Take snapshot to verify UI renders

### Test App Navigation
1. Navigate to app
2. Click each nav item (Samples, Settings, etc.)
3. Verify page content loads
4. Check for console errors

### Test Theme Extension Visibility
1. Add app block in theme editor
2. Preview or visit storefront
3. Verify widget/block renders
4. Test any interactive features

### Test Data Flow
1. Make change in admin app
2. Verify change reflects in Firestore (check firebase-debug.log)
3. Verify change appears on storefront (if applicable)

## Debugging Tips

### Check Console Errors
```javascript
mcp__playwright__browser_console_messages({ level: "error" })
```

### Check Network Requests
```javascript
mcp__playwright__browser_network_requests({})
```

### Take Screenshot for Visual Verification
```javascript
mcp__playwright__browser_take_screenshot({ fullPage: true })
```

### Check Firebase Logs
After testing, check `firebase-debug.log` for backend errors:
```bash
grep -i "error\|warn" firebase-debug.log | tail -50
```

## Example: Full App Test

```javascript
// 1. Read shopify.app.toml to get store and app info
// Store: thomas-joy-klaviyo-prod
// App: thomas-app-base-template

// 2. Test embedded app
mcp__playwright__browser_navigate({
  url: "https://admin.shopify.com/store/thomas-joy-klaviyo-prod/apps/thomas-app-base-template/embed"
})
mcp__playwright__browser_wait_for({ time: 3 })
mcp__playwright__browser_snapshot({})
mcp__playwright__browser_console_messages({ level: "error" })

// 3. Test navigation within app
mcp__playwright__browser_click({ element: "Settings nav item", ref: "..." })
mcp__playwright__browser_wait_for({ time: 1 })
mcp__playwright__browser_snapshot({})

// 4. Test storefront
mcp__playwright__browser_navigate({ url: "https://thomas-joy-klaviyo-prod.myshopify.com" })
mcp__playwright__browser_wait_for({ time: 2 })
mcp__playwright__browser_snapshot({})

// 5. Report results
```

## Notes

- Always wait for page loads before taking snapshots
- Use `browser_snapshot` over `browser_take_screenshot` for accessibility tree (better for finding elements)
- Check console errors after each major navigation
- If login is required, the test may need manual intervention or session cookies
- For dev stores with password protection, enter the store password first