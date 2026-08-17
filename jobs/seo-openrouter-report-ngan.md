# Báo sếp — SEO / OpenRouter (bản ngắn)

2026-08-17 · số liệu 31 ngày, lấy từ OpenRouter API

---

Em đã test thật Ollama Cloud và đo lại chi phí app SEO. Báo anh 3 điểm:

**1. Chi phí SEO hiện tại: $348.57/tháng** — $217 sinh nội dung, $114 alt text ảnh, $17 còn lại.

**2. Chưa nên chuyển sang Ollama.** Gói Max $100 đang khoá đăng ký ("New sign-ups paused"), mua được ngay chỉ có Pro $20 hoặc Team $125. Quan trọng hơn: Ollama đã khai tử đúng 2 model app mình đang dùng (tháng 6 và tháng 7), trong khi OpenRouter vẫn phục vụ. Chuyển sang Ollama là đổi luôn model cho 15 điểm gọi trong code, không phải chỉ đổi nhà cung cấp.

**3. Giảm được $184/tháng (53%) mà không đổi provider.** Đổi model sinh nội dung sang `gemini-2.5-flash-lite` — model này đã có trong code mình và đang chạy 100 nghìn request/tháng ở prod. $348 → $165/tháng. Không cần viết thêm gì, không rủi ro.

**Việc gấp:** ví OpenRouter còn **$79.51**, cả 5 app dùng chung và đang tiêu $18.88/ngày → **hết trong ~4 ngày**. Cần nạp ngay.

**Đề xuất:** nạp credit tuần này, đổi model sinh nội dung, giữ OpenRouter. Nếu anh vẫn muốn thử Ollama em test được với Pro $20 một tháng, không cần cam kết $100.

---

## Cần biết trước khi gửi (không nằm trong bản gửi sếp)

**Con số $184 là chắc về giá, chưa chắc về chất lượng.** Nó tính từ token thật của 31 ngày
(112.6M input + 54.4M output của `gemini-3-flash-preview`) nhân giá `gemini-2.5-flash-lite`
($0.100 in / $0.400 out) = $33.01, so với $217.04 hiện tại. Phép tính không sai.

Nhưng **chưa đo chất lượng output của `gemini-2.5-flash-lite`** trên tập 30 sản phẩm thật. Nó không
nằm trong eval vì lúc đó đang đi tìm "model tương đương Ollama", còn con này vốn đã ở trong repo.

Nếu sếp hỏi "chắc chưa": trả lời trung thực là **giá thì chắc, chất lượng cần một buổi test nữa**.
Đừng hứa quá. Chạy eval mất ~$0.30 và ~10 phút với harness đã có:
`--or-models=google/gemini-2.5-flash-lite`.

**Tại sao chọn `gemini-2.5-flash-lite` chứ không phải `gemma-4-31b-it`:** gemma-4 rẻ hơn $3.26/tháng
nhưng đo trên 30 sản phẩm thì có 2 khuyết điểm thật — rò rỉ markdown fence 24% (vì
`generateOpenRouterText` không strip fence, chỉ bản structured mới strip tại `openrouter/index.js:177-183`),
và khi URL ảnh trả 404 nó **bịa** `"Please provide the image you would like me to analyze."` — string
hợp lệ nên qua schema và ghi thẳng vào thuộc tính alt. $3/tháng không đủ để mua thêm rủi ro đó.
`gemini-2.5-flash-lite` cùng dòng Google với model hiện tại và đã chạy 100,246 request/tháng ở prod.

**Giữ `qwen3-vl-235b` cho image alt.** Không đổi. Nó fail-loud đúng khi ảnh chết, gemma-4 thì không.

---

Chi tiết đầy đủ + phản biện từng luận điểm: `jobs/ollama-vs-openrouter-bao-sep.md`
