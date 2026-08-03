# Kế Hoạch Triển Khai: Tích Hợp WebMCP & Agentic Browsing

> Tài liệu thiết kế: `docs/superpowers/specs/2026-08-02-webmcp-agentic-browsing-design.md`
> Tài liệu tính năng: `docs/features/webmcp-agentic-browsing.md`
> Tóm tắt: `docs/superpowers/specs/webmcp-lighthouse-agentic-browsing.md`

---

## Phase 1: Quét & Báo Cáo Điểm Agentic Browsing

### Task 1.1: Hằng Số & Mô Hình Dữ Liệu

**File**: `packages/functions/src/const/agenticBrowsing.js` (mới)

```javascript
// Tên các audit khớp với danh mục agentic browsing của Lighthouse
export const AGENTIC_AUDITS = {
  WEBMCP_TOOLS: 'webmcpTools',
  WEBMCP_SCHEMA_VALID: 'webmcpSchemaValid',
  FORMS_MISSING_ANNOTATIONS: 'formsMissingAnnotations',
  LLMS_TXT: 'llmsTxt',
  A11Y_NAMES_LABELS: 'a11yNamesLabels',
  A11Y_TREE_INTEGRITY: 'a11yTreeIntegrity',
  A11Y_VISIBILITY: 'a11yVisibility',
  LAYOUT_STABILITY_CLS: 'layoutStabilityCls'
};

export const TOTAL_AGENTIC_AUDITS = Object.keys(AGENTIC_AUDITS).length; // 8

// Ngưỡng CLS để đảm bảo độ tin cậy khi agent tương tác
export const AGENTIC_CLS_THRESHOLD = 0.1;

// Khóa localStorage cho điểm agentic (nằm trong avada-speed-score)
export const AGENTIC_SCORE_KEY = 'agenticScore';

// Giá trị mặc định khi chưa chạy quét
export const AGENTIC_SCORE_DEFAULT = {
  agenticPassedAudits: 0,
  agenticTotalAudits: TOTAL_AGENTIC_AUDITS,
  agenticDetails: null,
  agenticToolCount: 0,
  agenticLlmsTxt: false,
  agenticUnannotatedForms: 0
};
```

**File**: `packages/functions/src/const/seoIssues.js`

Thêm vào:
```javascript
export const AGENTIC_SCORE_KEY = 'avada-agentic-score';
```

**Xác nhận**: Không trùng tên với key hiện có trong `seoIssues.js`.

---

### Task 1.2: Dịch Vụ Audit Agentic (CDP + Puppeteer)

**File**: `packages/functions/src/services/agenticAuditService.js` (mới)

**Mẫu**: Theo `hyperSpeedService.js` — khởi chạy Puppeteer, page.goto, evaluate, đóng.

```javascript
import puppeteer from 'puppeteer';
import logger from '@functions/helpers/logger';
import {delay} from '@avada/utils';
import {getRedirectTracer} from '@functions/helpers/seoSpeed';
import {AGENTIC_CLS_THRESHOLD, TOTAL_AGENTIC_AUDITS} from '@functions/const/agenticBrowsing';
import fetch from 'node-fetch';

/**
 * Chạy audit agentic browsing trên một URL bằng Puppeteer + CDP WebMCP domain.
 *
 * @param {Object} params
 * @param {string} params.url - URL storefront cần audit
 * @param {Object} params.shop - tài liệu shop
 * @returns {Promise<AgenticAuditResult>}
 */
export async function auditAgenticBrowsing({url, shop}) {
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  try {
    const page = await browser.newPage();
    let cdpSupported = true;
    let tools = [];

    // Thử kết nối CDP WebMCP domain — có thể không khả dụng trên một số phiên bản Chrome
    try {
      const client = await page.createCDPSession();
      await client.send('WebMCP.enable');
      client.on('WebMCP.toolRegistered', event => tools.push(event));
    } catch {
      cdpSupported = false;
      logger.debug('[auditAgenticBrowsing] CDP WebMCP không khả dụng, bỏ qua phát hiện tool');
    }

    await page.goto(url, {waitUntil: 'networkidle0', timeout: 60000});
    await delay(3000); // Chờ JS đăng ký tool

    // Dự phòng: phát hiện tool qua DOM nếu CDP không khả dụng
    if (!cdpSupported) {
      tools = await page.evaluate(() => {
        const detected = [];
        // Kiểm tra các declarative tool
        document.querySelectorAll('form[toolname]').forEach(form => {
          detected.push({
            name: form.getAttribute('toolname'),
            description: form.getAttribute('tooldescription') || '',
            type: 'declarative'
          });
        });
        // Kiểm tra imperative tool (nếu modelContext khả dụng)
        if (typeof document.modelContext !== 'undefined') {
          // Không thể dùng await trong evaluate dễ dàng — sẽ được bổ sung bởi CDP khi có
        }
        return detected;
      });
    }

    // Audit: llms.txt
    const llmsTxtExists = await checkLlmsTxt(url);

    // Audit: các form chưa được chú thích
    const unannotatedForms = await page.evaluate(() =>
      document.querySelectorAll('form:not([toolname])').length
    );

    // Audit: snapshot accessibility
    const a11ySnapshot = await page.accessibility.snapshot();
    const a11yAudits = auditAgentAccessibility(a11ySnapshot);

    // Audit: CLS
    const cls = await measureCLS(page);

    const audits = buildAuditResults({tools, llmsTxtExists, unannotatedForms, a11yAudits, cls});

    return audits;
  } catch (error) {
    logger.error('[auditAgenticBrowsing]', shop.id, error.message);
    return null;
  } finally {
    await browser.close();
  }
}

/**
 * Kiểm tra xem llms.txt có tồn tại tại thư mục gốc của domain không.
 */
async function checkLlmsTxt(pageUrl) {
  try {
    const urlObj = new URL(pageUrl);
    const llmsUrl = `${urlObj.origin}/llms.txt`;
    const resp = await fetch(llmsUrl, {timeout: 10000});
    return resp.ok && resp.headers.get('content-type')?.includes('text');
  } catch {
    return false;
  }
}

/**
 * Audit cây accessibility để kiểm tra các tiêu chí dành cho agent.
 */
function auditAgentAccessibility(snapshot) {
  if (!snapshot) return {namesLabels: false, treeIntegrity: false, visibility: true};

  let hasNamesLabels = true;
  let hasTreeIntegrity = true;

  function walk(node) {
    // Kiểm tra tên: các phần tử tương tác cần có tên
    const interactiveRoles = ['button', 'link', 'textbox', 'checkbox', 'radio', 'combobox', 'menuitem'];
    if (interactiveRoles.includes(node.role) && !node.name) {
      hasNamesLabels = false;
    }
    // Kiểm tra tính toàn vẹn của cây: role phải hợp lệ (Puppeteer a11y snapshot chỉ trả về role hợp lệ)
    if (node.children) {
      node.children.forEach(walk);
    }
  }

  walk(snapshot);
  return {namesLabels: hasNamesLabels, treeIntegrity: hasTreeIntegrity, visibility: true};
}

/**
 * Đo CLS bằng PerformanceObserver thông qua page.evaluate.
 */
async function measureCLS(page) {
  return page.evaluate(() => {
    return new Promise(resolve => {
      let clsValue = 0;
      const observer = new PerformanceObserver(list => {
        for (const entry of list.getEntries()) {
          if (!entry.hadRecentInput) {
            clsValue += entry.value;
          }
        }
      });
      observer.observe({type: 'layout-shift', buffered: true});
      setTimeout(() => {
        observer.disconnect();
        resolve(clsValue);
      }, 2000);
    });
  });
}

/**
 * Xây dựng kết quả audit có cấu trúc.
 */
function buildAuditResults({tools, llmsTxtExists, unannotatedForms, a11yAudits, cls}) {
  const details = {
    webmcpTools: {status: tools.length > 0 ? 'pass' : 'fail', count: tools.length},
    webmcpSchemaValid: {status: tools.length > 0 ? 'pass' : 'na'},
    formsMissingAnnotations: {status: unannotatedForms === 0 ? 'pass' : 'fail', count: unannotatedForms},
    llmsTxt: {status: llmsTxtExists ? 'pass' : 'fail'},
    a11yNamesLabels: {status: a11yAudits.namesLabels ? 'pass' : 'fail'},
    a11yTreeIntegrity: {status: a11yAudits.treeIntegrity ? 'pass' : 'fail'},
    a11yVisibility: {status: a11yAudits.visibility ? 'pass' : 'fail'},
    layoutStabilityCls: {status: cls <= AGENTIC_CLS_THRESHOLD ? 'pass' : 'fail', value: cls}
  };

  const passedAudits = Object.values(details).filter(d => d.status === 'pass').length;

  return {
    agenticPassedAudits: passedAudits,
    agenticTotalAudits: TOTAL_AGENTIC_AUDITS,
    agenticDetails: details,
    agenticToolCount: tools.length,
    agenticLlmsTxt: llmsTxtExists,
    agenticUnannotatedForms: unannotatedForms
  };
}
```

**Phụ thuộc**: `puppeteer` (đã có trong dự án), `node-fetch` (đã có trong dự án).

---

### Task 1.3: Mở Rộng PSI API

**File**: `packages/functions/src/helpers/google.js`

**Dòng 85**: Thay đổi `category: 'performance'` để hỗ trợ agentic-browsing.

```javascript
// Trước
{url, strategy: device, category: 'performance', key: pagespeedApiKey}

// Sau
{url, strategy: device, category: ['performance', 'agentic-browsing'], key: pagespeedApiKey}
```

**Cập nhật `formatAuditResults`** (dòng 214) để trích xuất dữ liệu danh mục agentic:

```javascript
export function formatAuditResults(resp, field = 'lighthouseResult') {
  const result = {
    // ... các trường hiện có không đổi
    score: parseInt((resp?.[field]?.categories?.performance?.score || 1) * 100),
    lpc: resp?.[field]?.audits?.['largest-contentful-paint']?.displayValue,
    // ... v.v.
  };

  // Danh mục agentic browsing (có thể không tồn tại nếu PSI chưa hỗ trợ)
  const agenticCategory = resp?.[field]?.categories?.['agentic-browsing'];
  if (agenticCategory) {
    result.agenticScore = agenticCategory.score; // phân số, không phải 0-100
    result.agenticAuditRefs = agenticCategory.auditRefs;
  }

  return result;
}
```

**Dự phòng**: Nếu PSI trả về lỗi cho danh mục không xác định, bắt lỗi và thử lại chỉ với `'performance'`.
Điều này đảm bảo tương thích ngược.

---

### Task 1.4: Handler Quét + Pub/Sub

**File**: `packages/functions/src/handlers/pubsub/subscribeScanAgenticScore.js` (mới)

```javascript
import {auditAgenticBrowsing} from '@functions/services/agenticAuditService';
import {saveStorages} from '@functions/repositories/localStorageRepository';
import {Audit} from '@functions/services/audit/audit';
import logger from '@functions/helpers/logger';

export default async function subscribeScanAgenticScore(message) {
  const {shop} = JSON.parse(Buffer.from(message.data, 'base64').toString());
  const {id} = shop;

  try {
    logger.debug('[subscribeScanAgenticScore] bắt đầu', id);

    // Đặt cờ đang quét
    await saveStorages(id, {
      'avada-speed-score.doneAgenticHome': false
    });

    // Lấy URL của shop
    const {rootRedirectedUrl} = await Audit.getShopDomainUrls(shop);
    const url = rootRedirectedUrl.includes('https://')
      ? rootRedirectedUrl
      : `https://${rootRedirectedUrl}`;

    // Chạy audit
    const result = await auditAgenticBrowsing({url, shop});

    if (result) {
      // Lưu kết quả vào localStorage (cùng mẫu với speed score)
      const storageData = {};
      Object.keys(result).forEach(key => {
        storageData[`avada-speed-score.homePage.${key}`] = result[key];
      });
      await saveStorages(id, storageData);
    }

    // Bật cờ hoàn thành
    await saveStorages(id, {
      'avada-speed-score.doneAgenticHome': true
    });

    logger.debug('[subscribeScanAgenticScore] hoàn thành', id);
  } catch (error) {
    logger.error('[subscribeScanAgenticScore]', id, error.message);
    // Bật cờ hoàn thành ngay cả khi lỗi để FE ngừng polling
    await saveStorages(id, {
      'avada-speed-score.doneAgenticHome': true
    });
  }
}
```

**File**: `packages/functions/src/handlers/exports/pubsubFunctions.js`

Thêm sau `scanSpeedScoreSubscriberV2Gen2` (khoảng dòng 252):

```javascript
import subscribeScanAgenticScore from '@functions/handlers/pubsub/subscribeScanAgenticScore';

export const scanAgenticScoreGen2 = onMessagePublished(
  {memory: '4GiB', timeoutSeconds: 540, topic: 'scanAgenticScore', ...vpcSettings},
  wrapPubSub(subscribeScanAgenticScore)
);
```

Cấp phát 4GiB vì Puppeteer. Tương tự như cấu hình background HyperSpeed.

---

### Task 1.5: Controller + Route

**File**: `packages/functions/src/controllers/seoController.js`

Thêm hàm controller mới (gần `getSpeedScore` ở khoảng dòng 1422):

```javascript
export async function scanAgenticScore(ctx) {
  const shopId = getCurrentShop(ctx);
  const shop = await getShopById(shopId);
  await dispatchWork('scanAgenticScore', {shop});
  ctx.body = {success: true};
}
```

**File**: `packages/functions/src/routes/api.js`

Thêm route:
```javascript
router.post('/agentic-score/scan', seoController.scanAgenticScore);
```

**Lưu ý**: Dữ liệu điểm agentic được đọc từ localStorage `avada-speed-score` (cùng với speed score),
vì vậy không cần endpoint GET riêng — FE đọc qua dữ liệu `getSpeedScore` hiện có.

---

### Task 1.6: Mở Rộng Định Hình Điểm Số

**File**: `packages/functions/src/helpers/pageSpeed/pageSpeed.js`

Mở rộng `prepareDataOnePage` để bao gồm dữ liệu agentic từ PSI (khi có):

```javascript
export const prepareDataOnePage = (resp, device) => {
  try {
    const results = {};
    // ... các trường hiện có ...

    // Dữ liệu agentic browsing (từ PSI nếu có)
    if (resp.agenticScore !== undefined) {
      results[`${device}AgenticScore`] = resp.agenticScore;
    }
    if (resp.agenticAuditRefs) {
      results[`${device}AgenticAuditRefs`] = resp.agenticAuditRefs;
    }

    return results;
  } catch (e) {
    return defaultPageSpeedReport;
  }
};
```

---

### Task 1.7: Giao Diện — Thẻ Điểm Agentic

**Component**: Component mới trong khu vực speed-up hiển thị mức độ sẵn sàng cho agentic.

**Nguồn dữ liệu**: Cùng localStorage `avada-speed-score`, các trường:
- `agenticPassedAudits` / `agenticTotalAudits`
- `agenticDetails` (object với trạng thái từng audit)
- `doneAgenticHome` (cờ polling)

**Các phần tử UI**:
- Huy hiệu điểm phân số: "5/8 audits pass"
- Danh sách kiểm tra audit với biểu tượng đạt/không đạt
- Nút "Quét Ngay" → gọi `POST /api/agentic-score/scan`
- Nút "Tối Ưu" → liên kết đến tối ưu WebMCP (Phase 2)
- Văn bản hướng dẫn giải thích từng audit

**Các file cần tạo/chỉnh sửa**:
- `packages/assets/src/components/AgenticScore/AgenticScore.js` (mới)
- `packages/assets/src/components/AgenticScore/AgenticScore.scss` (mới)
- `packages/assets/src/components/AgenticScore/AgenticScore.json` (mới, i18n)
- Tích hợp vào bố cục trang Speed Up hiện có

---

## Phase 2: Tiêm Tool WebMCP

### Task 2.1: Dịch Vụ WebMCP

**File**: `packages/functions/src/services/webMcpService.js` (mới)

Các hàm cốt lõi:
- `generateWebMcpSnippet(shopTools)` — xây dựng liquid snippet với các đăng ký tool
- `handleWebMcpInjection({shop, themeId, assets})` — tải snippet lên theme
- `revertWebMcp({shop, themeId})` — xóa snippet khỏi theme
- `getShopifyWebMcpTools()` — trả về các tool mặc định của Shopify store

**Định nghĩa tool** (5 tool mặc định sử dụng Shopify public API):
1. `search_products` — `/search/suggest.json` (Predictive Search API)
2. `view_product` — `/products/{handle}.json`
3. `add_to_cart` — `POST /cart/add.json`
4. `view_cart` — `/cart.json`
5. `get_collections` — `/collections.json`

Tất cả đều dùng **Imperative API** (`document.modelContext.registerTool`).

**Bảo mật**:
- `readOnlyHint: true` cho các tool chỉ đọc
- `untrustedContentHint: false` (dữ liệu của chính chúng ta)
- Kiểm tra tính năng: `if (typeof document.modelContext === 'undefined') return;`
- Không để lộ dữ liệu nhạy cảm

**Mẫu**: Theo `hyperSpeedService.js`:
- Tạo nội dung liquid → dùng `handleThemeFilesUpsert` để tải lên
- Tiêm include vào `snippets/avada-seo.liquid`
- Revert xóa file snippet + tham chiếu include

---

### Task 2.2: Tích Hợp Action

**File**: `packages/functions/src/config/default.js`

```javascript
export const ACTION_WEBMCP = 'webMcp';

// Cập nhật BACKGROUND_ACTION_LIST
export const BACKGROUND_ACTION_LIST = [ACTION_CRITICAL_CSS, ACTION_HYPER_SPEED, ACTION_WEBMCP];
```

**File**: `packages/functions/src/config/assets.js`

```javascript
export const WEBMCP_TOOLS_SNIPPET = 'snippets/avada-seo-webmcp-tools.liquid';

// Thêm vào mảng ALL_REMOVABLE_ASSETS
```

**File**: `packages/functions/src/handlers/pubsub/subcribeSpeedupBackground.js`

Thêm xử lý WebMCP sau HyperSpeed, trước Critical CSS:

```javascript
import {ACTION_WEBMCP} from '@functions/config/default';
import {handleWebMcpInjection} from '@functions/services/webMcpService';

// Trong subscribeSpeedupBackground:
if (actionList.includes(ACTION_HYPER_SPEED)) {
  await handleHyperSpeed({shop, themeId});
}

if (actionList.includes(ACTION_WEBMCP)) {
  await handleWebMcpService({shop, themeId});
}

// Critical CSS cuối cùng (yêu cầu thứ tự hiện có)
if (actionList.includes(ACTION_CRITICAL_CSS)) {
  await handleSpeedupCriticalCss({shop, themeId});
}

async function handleWebMcpService({shop, themeId}) {
  try {
    logger.debug('[handleWebMcpService] bắt đầu', shop.id, themeId);
    const assets = await handleGetAllThemeData({shop, themeId});
    await handleWebMcpInjection({shop, themeId, assets});
    logger.debug('[handleWebMcpService] hoàn thành', shop.id, themeId);
  } catch (error) {
    logger.error('[handleWebMcpService]', shop.id, themeId, error.message);
  }
}
```

**File**: `packages/functions/src/handlers/pubsub/subscribeOptimizeStore.js`

Thêm theo dõi tiến trình cho WebMCP (cùng mẫu fake progress như HyperSpeed):

```javascript
if (actionList.includes(ACTION_WEBMCP)) {
  await updateProgress(optimizeId, {
    [`${ACTION_WEBMCP}.status`]: STATUS_RUNNING,
    [`${ACTION_WEBMCP}.startedAt`]: new Date()
  });
  await delay(1000);
  await updateProgress(optimizeId, {
    [`${ACTION_WEBMCP}.status`]: STATUS_DONE,
    [`${ACTION_WEBMCP}.finishedAt`]: new Date()
  });
}
```

Thêm `ACTION_WEBMCP` vào mảng actionsCheck của `handleEndProgress`.

---

### Task 2.3: Cài Đặt & Controller

**File**: `packages/functions/src/controllers/seoController.js`

Mở rộng `setSpeedUp` (dòng 356) để xử lý trường cài đặt `webMcp`:

```javascript
const fieldsToCheck = ['preload', 'pageSpeed', 'loading', 'minify', 'webMcp'];
```

**Lược đồ cài đặt** (tài liệu `settings` trong Firestore):
```javascript
{
  webMcp: {
    enabled: false,
    toolsInjected: false,
    appliedThemeId: null
  }
}
```

---

### Task 2.4: Logic Hoàn Tác

**File**: `packages/functions/src/services/webMcpService.js`

```javascript
export async function revertWebMcp({shop, themeId}) {
  // 1. Xóa snippets/avada-seo-webmcp-tools.liquid khỏi theme
  // 2. Xóa {% render 'avada-seo-webmcp-tools' %} khỏi avada-seo.liquid
  // Mẫu: giống hệt revertHyperSpeed trong hyperSpeedService.js
}
```

Kết nối vào luồng gỡ cài đặt: thêm `WEBMCP_TOOLS_SNIPPET` vào `ALL_REMOVABLE_ASSETS` (đã làm ở 2.2).

---

### Task 2.5: Giao Diện — Toggle Cài Đặt WebMCP

Thêm vào trang cài đặt Speed Up:
- Toggle: "Bật WebMCP Tools" — tiêm/hoàn tác các tool trên theme
- Huy hiệu trạng thái: "Đang hoạt động trên theme X" / "Chưa hoạt động"
- Xem trước danh sách tool hiển thị 5 tool mặc định

---

## Phase 3: Trình Tạo llms.txt

### Task 3.1: Dịch Vụ llms.txt

**File**: `packages/functions/src/services/llmsTxtService.js` (mới)

```javascript
export async function generateLlmsTxt(shop) {
  // Lấy collections + pages từ Shopify
  // Xây dựng nội dung văn bản
  // Trả về chuỗi
}
```

Dùng `initShopify(shop)` để lấy collections/pages.
Cache kết quả trong Redis (key: `llms-txt:${shopId}`, TTL: 24 giờ).
Vô hiệu hóa khi: dữ liệu shop thay đổi, tạo/xóa collection hoặc page.

---

### Task 3.2: Route App Proxy

**File**: `packages/functions/src/routes/appProxy.js`

```javascript
router.get('/llms.txt', async ctx => {
  const shop = await getShopByProxySignature(ctx);
  const content = await generateLlmsTxt(shop);
  ctx.type = 'text/plain';
  ctx.body = content;
});
```

Merchant truy cập qua: `https://store.myshopify.com/apps/avada-seo/llms.txt`

**Lưu ý**: Lighthouse kiểm tra `/llms.txt` tại thư mục gốc domain. Merchant cần cấu hình redirect
Shopify hoặc chúng ta khám phá phương pháp cấp theme. Ghi lại điều này trong hướng dẫn dành cho merchant.

---

### Task 3.3: Giao Diện — Toggle & Xem Trước llms.txt

- Toggle trong cài đặt: "Bật llms.txt"
- Thẻ xem trước hiển thị nội dung đã tạo
- Nút sao chép URL
- Hướng dẫn để merchant thiết lập redirect

---

## Phase 4: Chú Thích Form (Tương Lai)

### Task 4.1: Trình Quét Form

Trình quét dựa trên Puppeteer:
1. Tải các trang storefront
2. Tìm tất cả các phần tử `<form>`
3. Phân loại chúng (tìm kiếm, liên hệ, bản tin, thêm vào giỏ, đăng nhập)
4. Báo cáo các form thiếu `toolname`/`tooldescription`

### Task 4.2: Tự Động Chú Thích

Liquid snippet thêm `toolname`/`tooldescription` vào các loại form đã biết qua JS:

```javascript
document.querySelectorAll('form[action*="/search"]').forEach(form => {
  if (!form.hasAttribute('toolname')) {
    form.setAttribute('toolname', 'search_products');
    form.setAttribute('tooldescription', 'Search for products');
  }
});
```

---

## Phase 5: Hoàn Thiện Dashboard

### Task 5.1: Dashboard Mức Độ Sẵn Sàng Agentic Thống Nhất

Kết hợp tất cả dữ liệu agentic thành một giao diện toàn diện:
- Điểm sẵn sàng tổng thể (phân số)
- Phân tích từng audit với đề xuất khắc phục
- So sánh trước/sau (quét trước khi tối ưu, quét sau khi tối ưu)
- Biểu đồ xu hướng theo lịch sử

---

## Thứ Tự Thực Thi & Phụ Thuộc

```
Task 1.1 (hằng số) ──┐
                       ├── Task 1.2 (dịch vụ audit) ──┐
Task 1.3 (PSI ext) ───┘                               ├── Task 1.4 (handler) ── Task 1.5 (controller)
                                                       │
                                                       └── Task 1.6 (định hình điểm số)
                                                                   │
                                                                   └── Task 1.7 (FE card)

Task 2.1 (dịch vụ) ── Task 2.2 (tích hợp action) ── Task 2.3 (cài đặt)
                    └── Task 2.4 (hoàn tác)
                                         └── Task 2.5 (FE toggle)

Task 3.1 (dịch vụ) ── Task 3.2 (route) ── Task 3.3 (FE toggle)

Task 4.x, 5.x: sau khi Phase 1-3 hoàn thành
```

## Checklist Từng Task

```
- [ ] Code tuân theo các mẫu hiện có trong file đang chỉnh sửa
- [ ] Phạm vi shopId đúng (khớp với quy ước xung quanh)
- [ ] Không dùng console.log thô — dùng logger
- [ ] Kiểm tra quyền sở hữu khi thay đổi dữ liệu
- [ ] Topic Pub/Sub mới: thêm vào exports của pubsubFunctions.js
- [ ] Liquid snippet mới: thêm vào ALL_REMOVABLE_ASSETS
- [ ] Trường cài đặt mới: thêm vào cấu hình pickFields
- [ ] Action mới: thêm vào ACTION_LIST, mảng actionsCheck của handleEndProgress
- [ ] Background job: cấp phát bộ nhớ phù hợp (4GiB cho Puppeteer)
- [ ] Route mới: thêm vào api.js hoặc appProxy.js
- [ ] i18n: chuỗi mới hiển thị với người dùng phải có đầy đủ trong tất cả locale
- [ ] Đường dẫn hoàn tác tồn tại và đã được kiểm thử
- [ ] Tài liệu tính năng đã được cập nhật
```
