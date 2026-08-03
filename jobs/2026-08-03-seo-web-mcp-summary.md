# WebMCP + Agentic Browsing Score — Avada SEO

> Bản tóm tắt cho team & quản lý. Chi tiết kỹ thuật: `jobs/specs/2026-08-03-seo-web-mcp.md`,
> kế hoạch đầy đủ 5 phase: `jobs/planing/2026-08-03-seo-web-mcp-planing.md`

## Feature là gì?

**Vấn đề**: AI agent (ChatGPT Agent, Gemini, Copilot...) đang bắt đầu tự vào web mua hàng thay
người dùng. Nhưng nó phải "nhìn" giao diện rồi đoán chỗ bấm → sai, chậm. Google ra chuẩn
**WebMCP**: website tự khai báo sẵn các hành động (search sản phẩm, add to cart, xem giỏ) để
agent gọi thẳng, không cần đoán.

**Google cũng đã thêm điểm chấm**: Lighthouse có category mới **Agentic Browsing** — 8 audit,
chấm dạng "5/8 pass", đo store có sẵn sàng cho AI agent chưa:

| Nhóm | Audit |
|---|---|
| MCP Integration | Có WebMCP tool đăng ký chưa; schema tool hợp lệ chưa; form nào thiếu annotation |
| Discoverability | Có file `/llms.txt` ở root chưa (giống `robots.txt` nhưng cho AI) |
| Accessibility | Element tương tác có tên/label chưa; cây a11y hợp lệ; nội dung không bị ẩn |
| Layout Stability | CLS ≤ 0.1 — layout nhảy thì agent click sai chỗ |

## Avada SEO sẽ bán 2 thứ

1. **Đo** — quét store merchant, hiện điểm Agentic Readiness ngay cạnh Speed Score đang có.
2. **Tự sửa** — 1 nút bấm: inject WebMCP tools vào theme (giống cách HyperSpeed đang inject),
   tự sinh `llms.txt`. Merchant từ 2/8 lên 7/8 mà không cần biết code.

**Vì sao làm bây giờ**: chuẩn còn mới (Chrome 150+, origin trial). Ra sớm thì mình là app SEO
Shopify **đầu tiên** có "AI agent readiness" — điểm bán hàng mới, không phải đua với 10 app SEO
khác trên feature cũ.

## Plan 1 tuần

| Ngày | Việc | Ra được gì |
|---|---|---|
| **D1** | Const + `agenticAuditService` (Puppeteer + CDP WebMCP domain): dò tool, check `llms.txt`, a11y tree, CLS | Chạy audit 1 URL ra 8 kết quả pass/fail |
| **D2** | Pub/Sub `scanAgenticScore` (4GiB) + controller + route + mở rộng PSI call sang category `agentic-browsing` (có fallback nếu PSI chưa hỗ trợ) | Bấm scan → lưu kết quả vào storage |
| **D3** | FE: card "Agentic Readiness" trong Speed Up — badge 5/8, checklist từng audit, nút Scan Now + i18n | Phase 1 (MVP) demo được |
| **D4** | `webMcpService`: sinh liquid snippet 5 tool (`search_products`, `view_product`, `add_to_cart`, `view_cart`, `get_collections`) + inject/revert theme + gắn vào flow Optimize | Bấm optimize → store có WebMCP tool thật |
| **D5** | `llms.txt` generator + route App Proxy + FE toggle. Test staging end-to-end: scan → optimize → scan lại thấy điểm tăng | Demo trước/sau |

**Nhân lực**: 1 BE + 1 FE. Nếu chỉ 1 fullstack thì đẩy Phase 2 (D4) sang tuần 2.

**Ngoài phạm vi tuần này** (làm sau): form auto-annotation, merchant tự định nghĩa tool,
dashboard lịch sử + biểu đồ xu hướng.

## Rủi ro cần biết trước

1. **PSI API có thể chưa expose category `agentic-browsing`** → đã có plan B: tự chạy Puppeteer
   + CDP WebMCP domain. Không block tiến độ.
2. **Chrome 150+ / origin trial** — chuẩn còn experimental, spec có thể đổi. Code tách thành
   service riêng để đổi rẻ.
3. **`llms.txt` Lighthouse đọc ở domain root**, App Proxy chỉ serve được
   `/apps/avada-seo/llms.txt` → merchant phải tự set redirect Shopify. Cần viết hướng dẫn, hoặc
   tìm cách đặt qua theme.
4. Puppeteer job ăn **4GiB RAM/lần scan** → phải tính chi phí Cloud Function nếu bật cho toàn bộ
   shop. Giai đoạn đầu chỉ scan khi merchant bấm tay.
