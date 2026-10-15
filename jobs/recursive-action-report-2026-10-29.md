# Brief: báo cáo 2 tuần `recursiveSubscriberGen2` theo action (mở tự động 2026-10-29)

Session này do launchd `com.tn22180.recursive-report-1029` mở. Tuan đã hẹn: 2 tuần sau khi
đổi log, báo lại action nào của `recursive` còn chạy, tốn bao nhiêu, cái nào xoá được.
Chỉ ĐỌC prod. Không sửa code, không deploy. Kết luận đầu tiên, tiếng Việt, ngắn.

## Bối cảnh (2026-10-15)
- Audit: function $84.4/30d (CPU $69, memory $14), 4GiB/2vCPU, concurrency 80. Memory
  `seo-recursive-cost-profile` trong auto-memory có đủ số.
- MR !2416 (merged `f11185c286`): fix crash `.map` của `optimize_images_by_product` (shop
  `x7UXMKBZwJt0Tdv5NXER` / vi0fmh-j4 kẹt 1 năm), FILE_PAGE legacy đọc JSONL 1 lần (shard dưới
  `fileImageJsonl/legacy-worklist/`), xoá phần sinh minify.
- MR !2421: log `[subscribeRecursive] start action` / `finish action` lên `warn`; tham số:
  `action, data.type, shopId, shopifyDomain, eventId[, executionTime ms]`.
- 14 action: recompute_store_checklist, count_meta_tags, lazy_load, minify, send_404_report,
  optimize_images (type product/file/filePageIterator/collection), optimize_images_by_product,
  clear_image_error, revert_product_by_log, revert_file_image_alt, count_optimized_images,
  enable_bulk_faqs, delete_bulk_faqs, enable_bulk_meta. `build_sitemap` không có handler.

## Bước 1 — đã lên prod chưa (làm trước, đừng đoán)
- Repo `projects/Falcon/seo`: `git fetch --tags`; tìm merge commit của !2421
  (`glab mr view 2421` với `GITLAB_HOST=git.avada.net`), rồi `git tag --contains <sha>`.
- Không có tag nào chứa → DỪNG, báo "chưa deploy, chưa có số" + gợi ý cắt tag. Không bịa số.
- Có tag → lấy thời điểm tag/pipeline deploy làm mốc bắt đầu cửa sổ đo.

## Bước 2 — số theo action (GCF)
- Cloud Logging project `avada-seo`, token: `gcloud auth print-access-token --account
  tony-cli@avada-seo.iam.gserviceaccount.com` (config `sa` user account reauth chết — dùng SA).
- Filter: `resource.labels.service_name="recursivesubscribergen2" textPayload:"[subscribeRecursive] finish action"`
  từ mốc deploy. Phân trang hết. Parse action, type, executionTime.
- Bảng mỗi action(+type): số lần, p50/p95/max thời gian, tổng thời gian, % tổng.
- Đếm thêm `start action` để thấy run bị kill (start mà không finish ≈ timeout 540s).

## Bước 3 — fleet
- Shop có `recursive` trong `workerJobs` chạy trên fleet; log ở Loki/Grafana trên box. Nếu
  không vào được thì ghi rõ "chỉ có số GCF", đừng bỏ qua im lặng.

## Bước 4 — kiểm fix của !2416
- `textPayload:"reading 'map'"` trên service đó từ mốc deploy: kỳ vọng 0 (trước 48/ngày).
- Firestore `shops/x7UXMKBZwJt0Tdv5NXER`: `doneOptimize` kỳ vọng true.
- Có run FILE_PAGE legacy nào ghi `fileImageJsonl/legacy-worklist/` chưa (log `LEGACY_PUBSUB FILE_PAGE`
  + GCS list prefix).
- Billing export `avada-seo.gcp_billing_export.gcp_billing_export_v1_01BDCA_07A8E0_293FF2`
  qua BigQuery REST (bq CLI cũng reauth chết), label `goog-drz-cloudfunctions-id =
  recursivesubscribergen2`: cost/ngày từ mốc deploy so với $84.4/30d trước.

## Bước 5 — kết luận
- Action 0 lần chạy trong cửa sổ → ứng viên xoá; ghi ai gọi nó trong code (một số chỉ chạy
  hiếm: uninstall `lazy_load`, revert do merchant bấm) — 0 hit trong 2 tuần ≠ chết chắc chắn.
- Có nên tách `recursiveImage` (4GiB) / `recursiveLight` (1GiB) không: chỉ khi nhóm ảnh chiếm
  phần lớn thời gian VÀ cần $ riêng; nếu tách phải giữ key `dispatchWork('recursive')`.
- Một khuyến nghị, không liệt kê phương án.

## Đầu ra
- Trả lời trong session. Xong thì DM Telegram ngắn (dòng đầu `<b>recursive report</b>`, HTML,
  bot Hermes: `~/.hermes/.env` TELEGRAM_BOT_TOKEN, chat 1178722633) — đọc token từ file, không
  in ra command line.
- Cập nhật memory `seo-recursive-cost-profile` với kết quả.
