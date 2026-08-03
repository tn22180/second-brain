# Agentic Browsing — đo thật, 2026-08-03

Gate "weight-promotion" trong `webmcp.md` đã **đo xong**, không cần deploy staging.
Cách đo: cài `lighthouse@13.4.1` ra scratchpad, dựng trang tĩnh localhost, chạy Chrome
`150.0.7871.187` (cùng dòng build với Chrome của PSI: `HeadlessChrome/150.0.7871.186`).

Artefact: `jobs/seo/data/` — 5 report Lighthouse JSON + snippet liquid + fixture PSI thật.

## 1. PSI live, gymshark.com mobile

```
categories: ['performance', 'agentic-browsing']    agentic score = 0.48
id                          w   score  mode            group
agent-accessibility-tree    1   0      binary          agent-accessibility
cumulative-layout-shift     1   0.95   numeric         —
webmcp-form-coverage        0   null   notApplicable   webmcp
webmcp-registered-tools     0   null   notApplicable   webmcp
webmcp-schema-validity      0   null   notApplicable   webmcp
llms-txt                    0   null   notApplicable   agent-accessibility
```

(0 + 0.95) / 2 = 0.475 → 0.48. **Mean-of-applicable đúng.** `notApplicable` → `weight: 0` → ra
khỏi mẫu số.

## 2. Chỉ 1 trong 3 audit webmcp là audit tính điểm

Đọc source `lighthouse@13.4.1`:

| audit | `scoreDisplayMode` trong meta | Vào điểm? |
|---|---|---|
| `webmcp-registered-tools` | `INFORMATIVE` | **không bao giờ** |
| `webmcp-form-coverage` | `INFORMATIVE` | **không bao giờ** |
| `webmcp-schema-validity` | (mặc định binary) | có |

`core/audits/webmcp-registered-tools.js:44`, `webmcp-form-coverage.js`, `webmcp-schema-validity.js`.

Hệ quả cho FE: page WebMCP **không được** trình bày cả 3 như "sửa để tăng điểm". Chỉ
`webmcp-schema-validity` tăng điểm; 2 cái kia là thông tin.

Thêm: 5 `errorType` mà `webmcp-schema-validity` bắt đều tên `FormModelContext*` — tức chỉ soi
API **declarative** (`<form toolname= tooldescription=>`). Snippet của mình dùng API imperative
nên không sinh issue nào.

## 3. Hôm nay PSI KHÔNG thấy WebMCP — của mọi site, không riêng mình

Gatherer `core/gather/gatherers/webmcp.js:137-142`:

```js
const isSupported = await context.driver.executionContext.evaluate(
  () => typeof navigator.modelContext !== 'undefined' ||
        typeof document.modelContext !== 'undefined',
  {args: [], useIsolation: true}
);
```

`isSupported === false` → cả 3 audit trả `notApplicable`. Trong response PSI,
`webmcp-registered-tools` khai `INFORMATIVE` trong meta nhưng trả `notApplicable` → **chứng minh
`isSupported === false` trên Chrome của PSI**.

Truy nguyên nhân, 3 bước:

1. CDP domain `WebMCP` **có** trong Chrome 150 (probe `/json/protocol`: 57 domain, có `WebMCP`).
   Nên không phải `WebMCP.enable` thất bại.
2. Trang stub gán `navigator.modelContext` bằng JS của page → **vẫn** notApplicable. Vì
   `useIsolation: true` chạy ở isolated world, không thấy global của main world. Tức check này chỉ
   pass với property **native của browser**, polyfill không lừa được.
3. Probe `--dump-dom`:

| Chrome flags | `navigator.modelContext` | `'modelContext' in Navigator.prototype` |
|---|---|---|
| mặc định | `undefined` | `false` |
| `--enable-features=WebMCP` | `object` | `true` |
| `--enable-blink-features=WebMCP` | `object` | `true` |

**WebMCP nằm sau flag ở Chrome 150, mặc định tắt.** PSI chạy flag mặc định.

→ Không merchant nào trên thế giới làm 3 audit này đổi trạng thái được lúc này. Không phải lỗi
schema của mình.

## 4. Bật flag → snippet chạy đúng

`--enable-features=WebMCP`, cùng trang, chạy lại:

| audit | baseline (không snippet) | có snippet |
|---|---|---|
| `webmcp-registered-tools` | w=0 score=1 informative | w=0 score=1 informative, **liệt kê 5 imperative tool** |
| `webmcp-form-coverage` | w=0 score=1 informative | w=0 score=1 informative |
| `webmcp-schema-validity` | notApplicable (0 tool) | **w=1 score=1 binary** |

Snippet **đúng**. Khi Chrome ship WebMCP mặc định, nó đẩy `webmcp-schema-validity` vào mẫu số với
score 1 → kéo trung bình lên. Guard `typeof document.modelContext === 'undefined'` an toàn: khi bật
flag Chrome expose **cả** `navigator.modelContext` lẫn `document.modelContext`.

Chiều rủi ro cũng xác nhận: schema sai → w=1 score=0 → **tụt điểm**.

## 5. llms.txt là đòn bẩy dùng được NGAY

Đo: trang có `/llms.txt` hợp lệ → `llms-txt` **w=1, score=1, binary** (cả 2 lần chạy, flag on/off).

Source `core/audits/agentic/llms-txt.js`: 4xx → `notApplicable`; không tồn tại/lỗi → **score 0**;
5xx → score 0; tồn tại → chấm nội dung (cần `^# ` h1, cần `[x](y)` link, `length >= 50`).

Gatherer chỉ fetch `new URL('/llms.txt', finalDisplayedUrl)` — **domain root**, không phải app proxy.

Số cho gymshark hôm nay:

```
hiện tại:        (0 + 0.95) / 2      = 0.475
+ llms.txt tốt:  (0 + 0.95 + 1) / 3  = 0.650     → +17.5 điểm
+ llms.txt lỗi:  (0 + 0.95 + 0) / 3  = 0.317     → −15.8 điểm
```

## Chốt lại kế hoạch

1. **Đảo thứ tự Phase 3.** llms.txt lên trước, không phải sau WebMCP. Nó là thứ duy nhất đổi được
   điểm hôm nay. Vướng: Shopify không ghi được domain root → phải qua Shopify URL Redirect
   `/llms.txt` → app proxy. Cần verify redirect có giữ 200 (không 3xx) cho gatherer.
2. **WebMCP giữ nguyên code, sửa cách trình bày.** Không hứa tăng điểm. Đúng câu: "sẵn sàng cho khi
   Chrome bật WebMCP" + 2 audit informative đánh dấu là thông tin.
3. **Gỡ gate deploy-staging** trong `webmcp.md` — đã trả lời bằng đo local, không cần đụng staging.
4. **`webmcp-schema-validity` là audit duy nhất phải canh.** Nếu sau này đổi sang form declarative
   thì mọi field thiếu `toolname`/`tooldescription`/tên param bắt buộc đều thành ERROR → score 0 →
   tụt điểm merchant.

## Cần dọn trước khi commit

`packages/functions/src/helpers/google.js:276` còn `console.log('resprespresp', resp)` — vi phạm
rule "no raw console.* in backend" và in nguyên response PSI ~1 MB vào log.
