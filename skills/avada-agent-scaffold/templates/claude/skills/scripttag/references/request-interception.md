# Request Interception

Intercept Shopify storefront requests to modify data, add properties, or track analytics.

## Common Use Cases

| Endpoint | Use Case |
|----------|----------|
| `/cart/add` | Modify quantity, add line item properties |
| `/cart/update` | Adjust quantities, apply discounts |
| `/cart/change` | Track cart modifications |
| `/contact` | Add hidden fields, track submissions |

## Fetch Interception

```javascript
(function() {
  if (window.__appInterceptorInstalled) return;
  window.__appInterceptorInstalled = true;

  const INTERCEPT_URLS = ['/cart/add', '/cart/update'];

  const originalFetch = window.fetch;
  window.fetch = function(url, options) {
    const urlStr = typeof url === 'string' ? url : (url && url.url) || '';
    const shouldIntercept = INTERCEPT_URLS.some(endpoint => urlStr.includes(endpoint));

    if (shouldIntercept && options && options.body) {
      try {
        const modifiedData = getModifiedData(urlStr);
        if (modifiedData) {
          if (typeof options.body === 'string') {
            const body = JSON.parse(options.body);
            Object.assign(body, modifiedData);
            options = {...options, body: JSON.stringify(body)};
          } else if (options.body instanceof FormData) {
            Object.entries(modifiedData).forEach(([key, value]) => {
              options.body.set(key, String(value));
            });
          }
        }
      } catch (e) {
        console.log('Intercept error:', e);
      }
    }
    return originalFetch.call(this, url, options);
  };
})();
```

## XMLHttpRequest Interception

```javascript
(function() {
  const INTERCEPT_URLS = ['/cart/add', '/cart/update'];
  const originalOpen = XMLHttpRequest.prototype.open;
  const originalSend = XMLHttpRequest.prototype.send;

  XMLHttpRequest.prototype.open = function(method, url) {
    this._interceptUrl = url;
    return originalOpen.apply(this, arguments);
  };

  XMLHttpRequest.prototype.send = function(data) {
    const shouldIntercept = INTERCEPT_URLS.some(endpoint =>
      this._interceptUrl && this._interceptUrl.includes(endpoint)
    );

    if (shouldIntercept && data) {
      try {
        const modifiedData = getModifiedData(this._interceptUrl);
        if (modifiedData) {
          if (typeof data === 'string') {
            const parsed = JSON.parse(data);
            Object.assign(parsed, modifiedData);
            data = JSON.stringify(parsed);
          }
        }
      } catch (e) {
        console.log('Intercept error:', e);
      }
    }
    return originalSend.call(this, data);
  };
})();
```

## Form Submission Interception

```javascript
(function() {
  const INTERCEPT_URLS = ['/cart/add', '/cart/update'];

  document.addEventListener('submit', function(e) {
    const form = e.target;
    const shouldIntercept = INTERCEPT_URLS.some(endpoint =>
      form.action && form.action.includes(endpoint)
    );

    if (shouldIntercept) {
      const modifiedData = getModifiedData(form.action);
      if (modifiedData) {
        Object.entries(modifiedData).forEach(([key, value]) => {
          const input = form.querySelector(`[name="${key}"]`);
          if (input) {
            input.value = value;
          } else {
            const hidden = document.createElement('input');
            hidden.type = 'hidden';
            hidden.name = key;
            hidden.value = value;
            form.appendChild(hidden);
          }
        });
      }
    }
  }, true);
})();
```

## Key Points

| Aspect | Recommendation |
|--------|----------------|
| Install once | Use global flag `window.__appInterceptorInstalled` |
| Configure endpoints | Define `INTERCEPT_URLS` array |
| Preserve original | Store and call original functions |
| Handle all methods | Intercept fetch, XHR, and form submissions |
| Error handling | Wrap in try-catch, fail gracefully |
```
