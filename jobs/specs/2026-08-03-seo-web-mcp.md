# Feature: WebMCP & Lighthouse Agentic Browsing

> Avada SEO tích hợp Google WebMCP + Lighthouse Agentic Browsing scoring để giúp merchant
> sẵn sàng cho thế hệ AI agent tương tác với storefront.

## 1. WebMCP là gì?

### Định nghĩa

**WebMCP** (Web Model Context Protocol) là web standard mới của Google cho phép website **khai
báo các tool (hành động/khả năng)** để AI agent có thể sử dụng trực tiếp, thay vì phải "nhìn"
và "bấm" vào UI như người dùng.

**Ví dụ thực tế**: Thay vì AI agent phải tìm nút "Add to Cart", bấm vào nó, chọn số lượng...
website khai báo sẵn tool `add_to_cart` với input schema rõ ràng. Agent gọi tool trực tiếp.

### 2 cách khai báo tool

#### A. Imperative API (JavaScript)

```javascript
// Đăng ký tool bằng JS — phù hợp cho logic phức tạp
await document.modelContext.registerTool({
  name: 'search_products',
  description: 'Search for products by keyword',
  inputSchema: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'Search keyword' },
      category: { type: 'string', enum: ['all', 'clothing', 'electronics'] }
    },
    required: ['query']
  },
  execute: async ({ query, category }) => {
    // thuc hien search
    return JSON.stringify(results);
  }
});
```

- Đăng ký: `document.modelContext.registerTool(toolDef, options)`
- Huỷ đăng ký: `AbortController` + `signal`
- Lấy danh sách tool: `document.modelContext.getTools()`
- Gọi tool: `document.modelContext.executeTool(tool, jsonArgs)`
- Event: `document.modelContext.addEventListener('toolchange', handler)`

#### B. Declarative API (HTML form annotations)

```html
<!-- Thêm attribute vào form HTML có sẵn — phù hợp cho form đơn giản -->
<form toolname="contact_support"
      tooldescription="Submit a customer support request">
  <label for="name">Name</label>
  <input type="text" name="name">

  <select name="issue_type"
    toolparamdescription="Type of support issue">
    <option value="order">Order issue</option>
    <option value="return">Return request</option>
  </select>

  <button type="submit">Submit</button>
</form>
```

- Attribute: `toolname`, `tooldescription` trên `<form>`
- Attribute: `toolparamdescription` trên `<input>`, `<select>`
- `toolautosubmit` để form tự động submit khi agent gọi
- CSS: `:tool-form-active`, `:tool-submit-active` (styling khi agent đang dùng tool)

### Bảo mật WebMCP

- Chỉ chạy trên **origin-isolated documents**
- Permissions Policy: `tools` mặc định `self`
- Cross-origin iframe cần `allow="tools"`
- Annotation `untrustedContentHint: true` cho data từ user/external
- `readOnlyHint: true` cho tool chỉ đọc
- `exposedTo: ['https://trusted.com']` giới hạn origin được dùng tool
- Character budgets: tool name 30 ký tự, description 500, param description 150, output 1.5K

### WebMCP vs MCP

| Khía cạnh | MCP | WebMCP |
|-----------|-----|--------|
| Môi trường | Server-side, persistent | Browser, tab-bound |
| Vòng đời | Luôn chạy (background service) | Chỉ tồn tại khi page mở |
| Protocol | JSON-RPC, SDK đa ngôn ngữ | Browser-native JS/HTML API |
| Mục đích | Backend data/tools | Frontend live UI interaction |
| Quan hệ | Bổ sung nhau — MCP cho backend, WebMCP cho frontend |

## 2. Lighthouse Agentic Browsing Scoring là gì?

### Định nghĩa

Lighthouse thêm **category mới** tên "Agentic Browsing" để đánh giá mức độ "sẵn sàng cho AI
agent" của website. Khác với Performance score (0-100 weighted), category này dùng:

- **Fractional score**: Tỉ lệ audit pass (vd: 5/8 passed)
- **Pass/fail** cho từng audit
- **Informational** signals

### Các nhóm audit

#### A. MCP Integration

Lighthouse dùng Chrome DevTools Protocol (CDP) domain `WebMCP` để phát hiện tool:

| Audit | Mô tả |
|-------|-------|
| Registered WebMCP tools | Kiểm tra có tool nào được đăng ký (imperative hoặc declarative) |
| Forms missing tool annotations | Tìm form HTML chưa có `toolname`/`tooldescription` |
| WebMCP schema validity | Kiểm tra inputSchema của tool có hợp lệ (JSON Schema) |

#### B. Discoverability

| Audit | Mô tả |
|-------|-------|
| `llms.txt` presence | Kiểm tra file `/llms.txt` ở domain root — mô tả site cho AI/LLM |

`llms.txt` giống `robots.txt` nhưng dành cho AI agent. Nội dung mô tả:
- Site làm gì
- Các trang/section chính
- API/capability có sẵn
- Liên hệ hỗ trợ

#### C. Accessibility (Agent-Centric)

Accessibility cho "mắt máy" — AI agent cần đọc accessibility tree:

| Audit | Mô tả |
|-------|-------|
| Names and labels | Mọi element tương tác cần có tên lập trình (aria-label, label, alt) |
| Tree integrity | Role và quan hệ parent-child phải hợp lệ (ARIA) |
| Visibility | Nội dung không bị ẩn khỏi accessibility tree |

#### D. Layout Stability

| Audit | Mô tả |
|-------|-------|
| Cumulative Layout Shift (CLS) | Đo độ ổn định visual — agent cần xác định vị trí element chính xác |

CLS đã là metric của Performance. Ở đây nó được đánh giá lại từ góc độ agent:
layout shift làm agent click sai vị trí.

### Tại sao kết quả có thể thay đổi?

1. **Dynamic tool registration**: JS đăng ký tool có timing khác nhau mỗi lần load
2. **Accessibility tree variability**: DOM phức tạp thay đổi cây a11y
3. **CLS**: Quảng cáo, hình ảnh không có dimensions, nội dung inject

### Yêu cầu

- Chrome 150+ (experimental)
- Đăng ký WebMCP origin trial
- Chưa chắc PSI API đã expose category này qua REST (cần verify)

## 3. llms.txt là gì?

File text ở domain root (`https://example.com/llms.txt`) giúp AI agent/LLM hiểu website:

```text
# Example Store

> An online store selling handmade crafts and artisan products.

## Main Sections
- /products - Browse all products
- /collections - Shop by category
- /about - About us
- /contact - Contact support

## Capabilities
- Product search and filtering
- Shopping cart and checkout
- Order tracking
- Customer support

## API
- WebMCP tools available on all pages
```

## 4. Avada SEO sẽ làm gì?

### Phase 1: Scan & Report (MVP)

**Mục tiêu**: Hiển thị Agentic Browsing readiness bên cạnh Speed Score.

- Mở rộng PSI scan để lấy thêm agentic browsing data (nếu PSI API hỗ trợ)
- Nếu PSI API chưa hỗ trợ: tự chạy audit riêng bằng Puppeteer + CDP WebMCP domain
- Hiển thị dashboard: số audit passed/failed, chi tiết từng audit
- Hướng dẫn merchant cải thiện

### Phase 2: Auto-Optimize (Core)

**Mục tiêu**: Tự động inject WebMCP tools vào merchant storefront.

**WebMCP tools cho Shopify store:**

| Tool | Mô tả | Loại |
|------|-------|------|
| `search_products` | Tìm kiếm sản phẩm | Imperative (JS) |
| `view_product` | Xem chi tiết sản phẩm | Imperative (JS) |
| `add_to_cart` | Thêm vào giỏ hàng | Imperative (JS) |
| `view_cart` | Xem giỏ hàng | Imperative (JS) |
| `filter_products` | Lọc sản phẩm theo giá, loại... | Imperative (JS) |
| `subscribe_newsletter` | Đăng ký nhận tin | Declarative (form) |
| `contact_support` | Liên hệ hỗ trợ | Declarative (form) |

**Cách inject**: Giống pattern HyperSpeed — tạo liquid snippet, inject vào theme.

**llms.txt**: Tự động generate và serve qua App Proxy (`/apps/avada-seo/llms.txt`).

### Phase 3: Advanced

- Form scanner: phát hiện form chưa có WebMCP annotations, tự động thêm
- Custom tool builder: merchant định nghĩa tool riêng
- WebMCP evals: test tool hoạt động đúng
- Accessibility improvements tự động cho agent-centric audits

## 5. Touchpoints trong codebase hiện tại

| Cần làm | File hiện tại | Thay đổi |
|---------|---------------|----------|
| Scan PSI agentic | `helpers/google.js:84` | Thêm category 'agentic-browsing' vào PSI call |
| Score shaping | `helpers/pageSpeed/pageSpeed.js` | Thêm fields cho agentic score |
| Score storage | `helpers/utils/getPageContent.js:245` | Lưu agentic score vào localStorage |
| Constants | `const/seoSpeedScore.js` | Thêm default values cho agentic |
| Theme injection | `config/assets.js` | Thêm snippet names cho WebMCP |
| Liquid generation | Mới (giống `hyperSpeedService.js`) | Service tạo WebMCP liquid |
| llms.txt | Mới (giống sitemap proxy) | Route + generator |
| FE dashboard | Frontend speed-up components | Thêm section agentic score |
