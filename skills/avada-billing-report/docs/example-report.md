
# GCP Daily Cost Report

| | |
|---|---|
| **Thời gian** | 08:00:51 24/4/2026 (Bangkok) |
| **DoD** | 2026-04-21 → 2026-04-22 |
| **MTD** | 2026-04-01 → 2026-04-22 (22 ngày) |
| **Rolling 30** | 2026-03-25 → 2026-04-22 |
| **Nguồn** | BigQuery Billing Export |

---

## 🔍 Avada SEO
> Shopify SEO app — image optimize, speed up, audit, Google Search Console
> Project: `avada-seo` | Nguồn: BigQuery Billing Export

### 💰 Tổng quan

|  | Tháng này (MTD) | Rolling 30 ngày |
|--|---:|---:|
| Thực tế | $2485.82 (22 ngày) | $3229.67 (30 ngày) |
| Trung bình / ngày | ~$112.99 | ~$107.66 |
| **Ước tính tháng** | **~$3389.76** | **~$3229.67** |

### 📈 Biến động ngày

| | Ngày kia (2026-04-21) | Hôm qua (2026-04-22) | Thay đổi |
|---|---|---|---|
| Chi phí | $74.07 | **$81.40** | **+9.9% 📈** |

**Nguyên nhân chính:**

- **Cloud Functions**: tăng +$3.96 ($30.96 → $34.92)
- **Firestore / Storage**: tăng +$3.71 ($37.03 → $40.74)
- fn `apiGen2`: tăng +$1.42 ($4.42 → $5.84)
- fn `lighthouseauditrunnerGen2`: tăng +$1.13 ($7.49 → $8.62)
- fn `recursiveSubscriberGen2`: tăng +$0.81 ($10.75 → $11.56)

### 🗂️ Chi phí theo Service *(Rolling 30 ngày)*

| Service | Chi phí | % | Ước tính tháng |
|---------|--------:|--:|---------------:|
| Firestore / Storage | $1652.53 | 51.2% | ~$1652.53 |
| Cloud Functions | $1262.77 | 39.1% | ~$1262.77 |
| Logging | $148.23 | 4.6% | ~$148.23 |
| Firebase Hosting | $73.26 | 2.3% | ~$73.26 |
| Artifact Registry | $41.56 | 1.3% | ~$41.56 |
| Cloud Build | $35.97 | 1.1% | ~$35.97 |
| Cloud Storage | $7.17 | 0.2% | ~$7.17 |
| BigQuery | $4.99 | 0.2% | ~$4.99 |
| Scheduler | $1.36 | 0.0% | ~$1.36 |
| Pub/Sub | $1.08 | 0.0% | ~$1.08 |
| Compute Engine | $0.75 | 0.0% | ~$0.75 |
| Networking | $0.00 | 0.0% | ~$0.00 |
| VM Manager | $0.00 | 0.0% | ~$0.00 |

### ⚡ Top Cloud Functions *(Rolling 30 ngày)*
> Tổng Functions: **$1248.97**

| # | Function | Chi phí | % | Ước tính tháng |
|---|----------|--------:|--:|---------------:|
| 🔴 | `recursiveSubscriber` | $715.09 | 57.3% | ~$715.09 |
| 🟡 | `recursiveSubscriberGen2` | $103.80 | 8.3% | ~$103.80 |
| 🟠 | `proxy` | $90.38 | 7.2% | ~$90.38 |
| 🟠 | `api` | $71.30 | 5.7% | ~$71.30 |
| 🟠 | `lighthouseauditrunner` | $46.96 | 3.8% | ~$46.96 |
| ⚪ | `lighthouseauditrunnerGen2` | $44.39 | 3.6% | ~$44.39 |
| ⚪ | `apiGen2` | $24.90 | 2.0% | ~$24.90 |
| ⚪ | `scanSpeedScoreSubscriberV2` | $22.96 | 1.8% | ~$22.96 |
| ⚪ | `proxyGen2` | $22.31 | 1.8% | ~$22.31 |
| ⚪ | `auth` | $17.72 | 1.4% | ~$17.72 |
| ⚪ | `embedApp` | $14.68 | 1.2% | ~$14.68 |
| ⚪ | `scanIssuesSubscriber` | $12.30 | 1.0% | ~$12.30 |
| ⚪ | `embedAppGen2` | $9.65 | 0.8% | ~$9.65 |
| ⚪ | `authGen2` | $7.58 | 0.6% | ~$7.58 |
| ⚪ | `handleOptimizeImage` | $6.84 | 0.5% | ~$6.84 |
| ⚪ | `scanIssuesSubscriberGen2` | $5.71 | 0.5% | ~$5.71 |
| ⚪ | `syncElasticsearchChunk` | $4.20 | 0.3% | ~$4.20 |
| ⚪ | `apiSa` | $3.56 | 0.3% | ~$3.56 |
| ⚪ | `ext-firestore-bigquery-export-fsexportbigquery` | $3.20 | 0.3% | ~$3.20 |
| ⚪ | `scanSpeedScoreSubscriberV2Gen2` | $2.78 | 0.2% | ~$2.78 |
| ⚪ | `apiSaGen2` | $2.73 | 0.2% | ~$2.73 |
| ⚪ | `handleOptimizeImageGen2` | $2.72 | 0.2% | ~$2.72 |
| ⚪ | `onUpdateShop` | $2.65 | 0.2% | ~$2.65 |
| ⚪ | `handleHookSubscriber` | $1.98 | 0.2% | ~$1.98 |
| ⚪ | `optimizeStoreSubscriber` | $1.93 | 0.2% | ~$1.93 |
| ⚪ | `chatbot` | $1.91 | 0.2% | ~$1.91 |
| ⚪ | `onUpdateShopGen2` | $1.82 | 0.1% | ~$1.82 |
| ⚪ | `optimizeStoreSubscriberGen2` | $1.25 | 0.1% | ~$1.25 |
| ⚪ | `optimizeSubscriberGen2` | $0.95 | 0.1% | ~$0.95 |
| ⚪ | `optimizeSubscriberV2` | $0.71 | 0.1% | ~$0.71 |

### 💡 Gợi ý Optimize

> 💰 **Budget**: R30 estimate **~$3229.67**/tháng → Target **$3,500** → dưới budget **$270.33** 🟢

**🔧 Functions:**

| Function | Cost | Gợi ý |
|----------|-----:|-------|
| `recursiveSubscriber` | $715.09 | ⚠️ 57% Cloud Fn → ưu tiên #1 · Idempotency key · Circuit breaker · Check memory alloc vs p95 |
| `recursiveSubscriberGen2` | $103.80 | Idempotency key · Circuit breaker · Check memory alloc vs p95 |
| `proxy` | $90.38 | Cache response · Connection pooling · Timeout hợp lý |
| `api` | $71.30 | Cache response · Connection pooling · Timeout hợp lý |
| `lighthouseauditrunner` | $46.96 | Cache kết quả 24h · Queue + rate limit · Dùng LH API thay tự chạy |
| `lighthouseauditrunnerGen2` | $44.39 | Cache kết quả 24h · Queue + rate limit · Dùng LH API thay tự chạy |
| `apiGen2` | $24.90 | Cache response · Connection pooling · Timeout hợp lý |
| `scanSpeedScoreSubscriberV2` | $22.96 | Cache kết quả 24h · Queue + rate limit · Dùng LH API thay tự chạy |
| `proxyGen2` | $22.31 | Cache response · Connection pooling · Timeout hợp lý |
| `auth` | $17.72 | Tăng session TTL · Cache token validation · Giảm memory alloc |
| `scanIssuesSubscriber` | $12.30 | Cache kết quả 24h · Queue + rate limit · Dùng LH API thay tự chạy |
| `authGen2` | $7.58 | Tăng session TTL · Cache token validation · Giảm memory alloc |
| `handleOptimizeImage` | $6.84 | Batch nhiều ảnh/req · Cloud Tasks queue · Cache ảnh đã xử lý |
| `scanIssuesSubscriberGen2` | $5.71 | Cache kết quả 24h · Queue + rate limit · Dùng LH API thay tự chạy |
| `apiSa` | $3.56 | Cache response · Connection pooling · Timeout hợp lý |
| `scanSpeedScoreSubscriberV2Gen2` | $2.78 | Cache kết quả 24h · Queue + rate limit · Dùng LH API thay tự chạy |
| `apiSaGen2` | $2.73 | Cache response · Connection pooling · Timeout hợp lý |
| `handleOptimizeImageGen2` | $2.72 | Batch nhiều ảnh/req · Cloud Tasks queue · Cache ảnh đã xử lý |
| `onUpdateShop` | $2.65 | Debounce/throttle invocations |
| `handleHookSubscriber` | $1.98 | Idempotency key · Circuit breaker · Check memory alloc vs p95 |
| `optimizeStoreSubscriber` | $1.93 | Idempotency key · Circuit breaker · Check memory alloc vs p95 |
| `onUpdateShopGen2` | $1.82 | Debounce/throttle invocations |
| `optimizeStoreSubscriberGen2` | $1.25 | Idempotency key · Circuit breaker · Check memory alloc vs p95 |
| `optimizeSubscriberGen2` | $0.95 | Idempotency key · Circuit breaker · Check memory alloc vs p95 |
| `optimizeSubscriberV2` | $0.71 | Idempotency key · Circuit breaker · Check memory alloc vs p95 |

**🛠️ Services:**

- **Logging** ($148.23): retention 7 ngày · filter DEBUG/INFO · structured logging
- **Firestore/Storage** ($1652.53): cleanup unused indexes · cache frequent reads · batch writes · TTL cho data tạm
- **Firebase Hosting** ($73.26): Cache-Control headers · gzip/brotli · review rewrites → fn calls
- **Artifact Registry** ($41.56): cleanup policy · giữ N versions gần nhất


---

## 🖼️ App Plaza Image Optimizer
> Shopify image optimization app
> Project: `app-plaza-image-optimizer` | Nguồn: BigQuery Billing Export

### 💰 Tổng quan

|  | Tháng này (MTD) | Rolling 30 ngày |
|--|---:|---:|
| Thực tế | $536.37 (22 ngày) | $961.72 (30 ngày) |
| Trung bình / ngày | ~$24.38 | ~$32.06 |
| **Ước tính tháng** | **~$731.41** | **~$961.72** |

### 📈 Biến động ngày

| | Ngày kia (2026-04-21) | Hôm qua (2026-04-22) | Thay đổi |
|---|---|---|---|
| Chi phí | $14.95 | **$11.29** | **-24.5% 📉 ⚠️** |

**Nguyên nhân chính:**

- **Cloud Run**: giảm -$1.25 ($4.15 → $2.90)
- **Cloud Functions**: giảm -$1.16 ($4.58 → $3.42)
- fn `handleOptimizeImage`: giảm -$1.18 ($3.56 → $2.39)

### 🗂️ Chi phí theo Service *(Rolling 30 ngày)*

| Service | Chi phí | % | Ước tính tháng |
|---------|--------:|--:|---------------:|
| Cloud Functions | $454.49 | 47.3% | ~$454.49 |
| Firestore / Storage | $298.22 | 31.0% | ~$298.22 |
| Cloud Run | $162.09 | 16.9% | ~$162.09 |
| Logging | $22.49 | 2.3% | ~$22.49 |
| Cloud Build | $10.01 | 1.0% | ~$10.01 |
| Cloud Storage | $8.90 | 0.9% | ~$8.90 |
| Artifact Registry | $4.85 | 0.5% | ~$4.85 |
| Scheduler | $0.40 | 0.0% | ~$0.40 |
| Pub/Sub | $0.24 | 0.0% | ~$0.24 |
| BigQuery | $0.03 | 0.0% | ~$0.03 |

### ⚡ Top Cloud Functions *(Rolling 30 ngày)*
> Tổng Functions: **$454.49**

| # | Function | Chi phí | % | Ước tính tháng |
|---|----------|--------:|--:|---------------:|
| 🔴 | `recursiveSubscriber` | $340.92 | 75.0% | ~$340.92 |
| 🟡 | `handleOptimizeImage` | $84.62 | 18.6% | ~$84.62 |
| 🟠 | `auth` | $10.10 | 2.2% | ~$10.10 |
| 🟠 | `webHookHandlerSubscriber` | $9.01 | 2.0% | ~$9.01 |
| 🟠 | `api` | $6.19 | 1.4% | ~$6.19 |
| ⚪ | `webhookBulkOperation` | $1.35 | 0.3% | ~$1.35 |
| ⚪ | `optimizeSubscriberV2` | $0.76 | 0.2% | ~$0.76 |
| ⚪ | `createPreviewImages` | $0.62 | 0.1% | ~$0.62 |
| ⚪ | `countImagesHandler` | $0.35 | 0.1% | ~$0.35 |
| ⚪ | `apiSa` | $0.26 | 0.1% | ~$0.26 |
| ⚪ | `aiApi` | $0.07 | 0.0% | ~$0.07 |
| ⚪ | `reviewUpdatesSchedule` | $0.06 | 0.0% | ~$0.06 |
| ⚪ | `scanSpeedScoreSubscriberV2` | $0.05 | 0.0% | ~$0.05 |
| ⚪ | `apiv2` | $0.02 | 0.0% | ~$0.02 |
| ⚪ | `apisav2` | $0.02 | 0.0% | ~$0.02 |
| ⚪ | `optimizeStoreSubscriber` | $0.02 | 0.0% | ~$0.02 |
| ⚪ | `handleDowngradeSpeedUp` | $0.01 | 0.0% | ~$0.01 |
| ⚪ | `handleSpeedupBackground` | $0.01 | 0.0% | ~$0.01 |
| ⚪ | `handleRevertProductByLog` | $0.01 | 0.0% | ~$0.01 |
| ⚪ | `dailyJobsPublisher` | $0.00 | 0.0% | ~$0.00 |
| ⚪ | `proxy` | $0.00 | 0.0% | ~$0.00 |
| ⚪ | `authSa` | $0.00 | 0.0% | ~$0.00 |
| ⚪ | `weekylyNotifycation` | $0.00 | 0.0% | ~$0.00 |
| ⚪ | `(untagged)` | $0.00 | 0.0% | ~$0.00 |
| ⚪ | `publicEndpoint` | $0.00 | 0.0% | ~$0.00 |
| ⚪ | `handleGetThirdPartyScripts` | $0.00 | 0.0% | ~$0.00 |
| ⚪ | `dailyAutoLimitExpiredSchedule` | $0.00 | 0.0% | ~$0.00 |
| ⚪ | `monthlyNotifycation` | $0.00 | 0.0% | ~$0.00 |

### 💡 Gợi ý Optimize

> 💰 **Budget**: R30 estimate **~$961.72**/tháng → Target **$3,500** → dưới budget **$2538.28** 🟢

**🔧 Functions:**

| Function | Cost | Gợi ý |
|----------|-----:|-------|
| `recursiveSubscriber` | $340.92 | ⚠️ 75% Cloud Fn → ưu tiên #1 · Idempotency key · Circuit breaker · Check memory alloc vs p95 |
| `handleOptimizeImage` | $84.62 | Batch nhiều ảnh/req · Cloud Tasks queue · Cache ảnh đã xử lý |
| `auth` | $10.10 | Tăng session TTL · Cache token validation · Giảm memory alloc |
| `webHookHandlerSubscriber` | $9.01 | Idempotency key · Circuit breaker · Check memory alloc vs p95 |
| `api` | $6.19 | Cache response · Connection pooling · Timeout hợp lý |
| `webhookBulkOperation` | $1.35 | Verify HMAC signature · Respond 200 → async Pub/Sub · Dedup bằng idempotency key |
| `optimizeSubscriberV2` | $0.76 | Idempotency key · Circuit breaker · Check memory alloc vs p95 |
| `createPreviewImages` | $0.62 | Batch nhiều ảnh/req · Cloud Tasks queue · Cache ảnh đã xử lý |
| `countImagesHandler` | $0.35 | Batch nhiều ảnh/req · Cloud Tasks queue · Cache ảnh đã xử lý |
| `apiSa` | $0.26 | Cache response · Connection pooling · Timeout hợp lý |
| `aiApi` | $0.07 | Cache response · Connection pooling · Timeout hợp lý |
| `reviewUpdatesSchedule` | $0.06 | Check frequency · Merge jobs nhỏ · Cloud Scheduler + Pub/Sub |
| `scanSpeedScoreSubscriberV2` | $0.05 | Cache kết quả 24h · Queue + rate limit · Dùng LH API thay tự chạy |
| `apiv2` | $0.02 | Cache response · Connection pooling · Timeout hợp lý |
| `apisav2` | $0.02 | Cache response · Connection pooling · Timeout hợp lý |
| `optimizeStoreSubscriber` | $0.02 | Idempotency key · Circuit breaker · Check memory alloc vs p95 |
| `dailyJobsPublisher` | $0.00 | Check frequency · Merge jobs nhỏ · Cloud Scheduler + Pub/Sub |
| `proxy` | $0.00 | Cache response · Connection pooling · Timeout hợp lý |
| `authSa` | $0.00 | Tăng session TTL · Cache token validation · Giảm memory alloc |
| `dailyAutoLimitExpiredSchedule` | $0.00 | Check frequency · Merge jobs nhỏ · Cloud Scheduler + Pub/Sub |

**🛠️ Services:**

- **Logging** ($22.49): retention 7 ngày · filter DEBUG/INFO · structured logging
- **Firestore/Storage** ($298.22): cleanup unused indexes · cache frequent reads · batch writes · TTL cho data tạm
- **Cloud Run** ($162.09): check min-instances · tăng concurrency · review timeout + CPU throttle
- **Artifact Registry** ($4.85): cleanup policy · giữ N versions gần nhất


---

## 📝 Avada Blog
> Shopify blog writing assistant app
> Project: `avada-blog-app` | Nguồn: BigQuery Billing Export

### 💰 Tổng quan

|  | Tháng này (MTD) | Rolling 30 ngày |
|--|---:|---:|
| Thực tế | $213.46 (22 ngày) | $283.39 (30 ngày) |
| Trung bình / ngày | ~$9.70 | ~$9.45 |
| **Ước tính tháng** | **~$291.08** | **~$283.39** |

### 📈 Biến động ngày

| | Ngày kia (2026-04-21) | Hôm qua (2026-04-22) | Thay đổi |
|---|---|---|---|
| Chi phí | $8.55 | **$10.24** | **+19.8% 📈 ⚠️** |

**Nguyên nhân chính:**

- **Firestore / Storage**: tăng +$2.35 ($3.48 → $5.82)
- **Cloud Functions**: giảm -$0.96 ($4.06 → $3.10)
- fn `proxy`: giảm -$0.49 ($1.67 → $1.18)
- fn `api`: giảm -$0.38 ($1.46 → $1.08)
- fn `embedApp`: giảm -$0.12 ($0.18 → $0.06)

### 🗂️ Chi phí theo Service *(Rolling 30 ngày)*

| Service | Chi phí | % | Ước tính tháng |
|---------|--------:|--:|---------------:|
| Firestore / Storage | $141.87 | 50.1% | ~$141.87 |
| Cloud Functions | $105.53 | 37.2% | ~$105.53 |
| Firebase Hosting | $21.21 | 7.5% | ~$21.21 |
| Artifact Registry | $6.12 | 2.2% | ~$6.12 |
| Logging | $5.47 | 1.9% | ~$5.47 |
| Cloud Build | $1.90 | 0.7% | ~$1.90 |
| BigQuery | $1.07 | 0.4% | ~$1.07 |
| Scheduler | $0.19 | 0.1% | ~$0.19 |
| Pub/Sub | $0.03 | 0.0% | ~$0.03 |
| Cloud Storage | $0.01 | 0.0% | ~$0.01 |

### ⚡ Top Cloud Functions *(Rolling 30 ngày)*
> Tổng Functions: **$105.53**

| # | Function | Chi phí | % | Ước tính tháng |
|---|----------|--------:|--:|---------------:|
| 🔴 | `proxy` | $42.30 | 40.1% | ~$42.30 |
| 🟡 | `api` | $37.20 | 35.3% | ~$37.20 |
| 🟠 | `auth` | $14.51 | 13.8% | ~$14.51 |
| 🟠 | `embedApp` | $5.18 | 4.9% | ~$5.18 |
| 🟠 | `subscribeUpdateNewSubscriberCreditsHandler` | $3.11 | 3.0% | ~$3.11 |
| ⚪ | `apiv2` | $1.60 | 1.5% | ~$1.60 |
| ⚪ | `apiSa` | $1.35 | 1.3% | ~$1.35 |
| ⚪ | `knowledgeBase` | $0.13 | 0.1% | ~$0.13 |
| ⚪ | `syncSubscribeActiveCharge` | $0.04 | 0.0% | ~$0.04 |
| ⚪ | `subscribeSummaryNewPublishedArticle` | $0.02 | 0.0% | ~$0.02 |
| ⚪ | `apisav2` | $0.02 | 0.0% | ~$0.02 |
| ⚪ | `onCreateUser` | $0.01 | 0.0% | ~$0.01 |
| ⚪ | `authSa` | $0.01 | 0.0% | ~$0.01 |
| ⚪ | `subscribeImportArticles` | $0.00 | 0.0% | ~$0.00 |
| ⚪ | `subscribeExportSelectedArticlesHandler` | $0.00 | 0.0% | ~$0.00 |
| ⚪ | `reviewUpdatesSchedule` | $0.00 | 0.0% | ~$0.00 |
| ⚪ | `subscribeUpdateProductsForArticles` | $0.00 | 0.0% | ~$0.00 |
| ⚪ | `cleanupExportFiles` | $0.00 | 0.0% | ~$0.00 |
| ⚪ | `subscribeUpdateRelatedBlogsForArticlesHandler` | $0.00 | 0.0% | ~$0.00 |
| ⚪ | `subscribeExportAllArticlesHandler` | $0.00 | 0.0% | ~$0.00 |
| ⚪ | `subscribeUpdatePlanActiveCharge` | $0.00 | 0.0% | ~$0.00 |
| ⚪ | `onAISummaryUpdate` | $0.00 | 0.0% | ~$0.00 |
| ⚪ | `subscribeBatchArticleSummary` | $0.00 | 0.0% | ~$0.00 |
| ⚪ | `matchReviewsWithShopsSubscriber` | $0.00 | 0.0% | ~$0.00 |
| ⚪ | `subscribeUpdateCreditFree` | $0.00 | 0.0% | ~$0.00 |
| ⚪ | `(untagged)` | $0.00 | 0.0% | ~$0.00 |

### 💡 Gợi ý Optimize

> 💰 **Budget**: R30 estimate **~$283.39**/tháng → Target **$3,500** → dưới budget **$3216.61** 🟢

**🔧 Functions:**

| Function | Cost | Gợi ý |
|----------|-----:|-------|
| `proxy` | $42.30 | ⚠️ 40% Cloud Fn → ưu tiên #1 · Cache response · Connection pooling · Timeout hợp lý |
| `api` | $37.20 | Cache response · Connection pooling · Timeout hợp lý |
| `auth` | $14.51 | Tăng session TTL · Cache token validation · Giảm memory alloc |
| `subscribeUpdateNewSubscriberCreditsHandler` | $3.11 | Idempotency key · Circuit breaker · Check memory alloc vs p95 |
| `apiv2` | $1.60 | Cache response · Connection pooling · Timeout hợp lý |
| `apiSa` | $1.35 | Cache response · Connection pooling · Timeout hợp lý |
| `apisav2` | $0.02 | Cache response · Connection pooling · Timeout hợp lý |
| `authSa` | $0.01 | Tăng session TTL · Cache token validation · Giảm memory alloc |
| `reviewUpdatesSchedule` | $0.00 | Check frequency · Merge jobs nhỏ · Cloud Scheduler + Pub/Sub |
| `subscribeUpdateProductsForArticles` | $0.00 | Debounce/throttle invocations |
| `subscribeUpdateRelatedBlogsForArticlesHandler` | $0.00 | Debounce/throttle invocations |
| `subscribeUpdatePlanActiveCharge` | $0.00 | Debounce/throttle invocations |
| `onAISummaryUpdate` | $0.00 | Debounce/throttle invocations |
| `matchReviewsWithShopsSubscriber` | $0.00 | Idempotency key · Circuit breaker · Check memory alloc vs p95 |
| `subscribeUpdateCreditFree` | $0.00 | Debounce/throttle invocations |

**🛠️ Services:**

- **Logging** ($5.47): retention 7 ngày · filter DEBUG/INFO · structured logging
- **Firestore/Storage** ($141.87): cleanup unused indexes · cache frequent reads · batch writes · TTL cho data tạm
- **Firebase Hosting** ($21.21): Cache-Control headers · gzip/brotli · review rewrites → fn calls
- **Artifact Registry** ($6.12): cleanup policy · giữ N versions gần nhất


---

## ✍️ AI Product Copy
> AI product description copy generator
> Project: `ai-product-copy` | Nguồn: BigQuery Billing Export

### 💰 Tổng quan

|  | Tháng này (MTD) | Rolling 30 ngày |
|--|---:|---:|
| Thực tế | $31.51 (22 ngày) | $39.57 (30 ngày) |
| Trung bình / ngày | ~$1.43 | ~$1.32 |
| **Ước tính tháng** | **~$42.97** | **~$39.57** |

### 📈 Biến động ngày

| | Ngày kia (2026-04-21) | Hôm qua (2026-04-22) | Thay đổi |
|---|---|---|---|
| Chi phí | $0.96 | **$1.06** | **+10.5% 📈** |

**Nguyên nhân chính:**

- fn `handleBulkGenerateSubscriber`: tăng +$0.33 ($0.12 → $0.46)

### 🗂️ Chi phí theo Service *(Rolling 30 ngày)*

| Service | Chi phí | % | Ước tính tháng |
|---------|--------:|--:|---------------:|
| Firestore / Storage | $20.75 | 52.4% | ~$20.75 |
| Cloud Functions | $16.61 | 42.0% | ~$16.61 |
| Cloud Trace | $0.80 | 2.0% | ~$0.80 |
| Pub/Sub | $0.72 | 1.8% | ~$0.72 |
| Cloud Build | $0.34 | 0.9% | ~$0.34 |
| Firebase Hosting | $0.20 | 0.5% | ~$0.20 |
| Scheduler | $0.09 | 0.2% | ~$0.09 |
| Translate | $0.05 | 0.1% | ~$0.05 |
| Artifact Registry | $0.01 | 0.0% | ~$0.01 |
| Cloud Storage | $0.00 | 0.0% | ~$0.00 |

### ⚡ Top Cloud Functions *(Rolling 30 ngày)*
> Tổng Functions: **$16.61**

| # | Function | Chi phí | % | Ước tính tháng |
|---|----------|--------:|--:|---------------:|
| 🔴 | `auth` | $3.41 | 20.5% | ~$3.41 |
| 🟡 | `handleBulkGenerateSubscriber` | $3.07 | 18.5% | ~$3.07 |
| 🟠 | `subscribeUpdateCreditsHandler` | $2.56 | 15.4% | ~$2.56 |
| 🟠 | `api` | $2.19 | 13.2% | ~$2.19 |
| 🟠 | `updateDesc` | $1.63 | 9.8% | ~$1.63 |
| ⚪ | `handleHook` | $1.05 | 6.3% | ~$1.05 |
| ⚪ | `webhookCreateProduct` | $0.93 | 5.6% | ~$0.93 |
| ⚪ | `syncSubscribeActiveCharge` | $0.49 | 3.0% | ~$0.49 |
| ⚪ | `embedApp` | $0.34 | 2.1% | ~$0.34 |
| ⚪ | `publishAll` | $0.29 | 1.8% | ~$0.29 |
| ⚪ | `proxy` | $0.27 | 1.6% | ~$0.27 |
| ⚪ | `handleProductUpdate` | $0.09 | 0.6% | ~$0.09 |
| ⚪ | `syncProducts` | $0.09 | 0.5% | ~$0.09 |
| ⚪ | `apiSa` | $0.06 | 0.4% | ~$0.06 |
| ⚪ | `handleSetupApp` | $0.05 | 0.3% | ~$0.05 |
| ⚪ | `webhookBulkOperation` | $0.04 | 0.3% | ~$0.04 |
| ⚪ | `authSa` | $0.03 | 0.2% | ~$0.03 |
| ⚪ | `extension` | $0.00 | 0.0% | ~$0.00 |

### 💡 Gợi ý Optimize

> 💰 **Budget**: R30 estimate **~$39.57**/tháng → Target **$3,500** → dưới budget **$3460.43** 🟢

**🔧 Functions:**

| Function | Cost | Gợi ý |
|----------|-----:|-------|
| `auth` | $3.41 | Tăng session TTL · Cache token validation · Giảm memory alloc |
| `handleBulkGenerateSubscriber` | $3.07 | Idempotency key · Circuit breaker · Check memory alloc vs p95 |
| `subscribeUpdateCreditsHandler` | $2.56 | Debounce/throttle invocations |
| `api` | $2.19 | Cache response · Connection pooling · Timeout hợp lý |
| `updateDesc` | $1.63 | Debounce/throttle invocations |
| `handleHook` | $1.05 | Verify HMAC signature · Respond 200 → async Pub/Sub · Dedup bằng idempotency key |
| `webhookCreateProduct` | $0.93 | Verify HMAC signature · Respond 200 → async Pub/Sub · Dedup bằng idempotency key |
| `proxy` | $0.27 | Cache response · Connection pooling · Timeout hợp lý |
| `handleProductUpdate` | $0.09 | Debounce/throttle invocations |
| `apiSa` | $0.06 | Cache response · Connection pooling · Timeout hợp lý |
| `webhookBulkOperation` | $0.04 | Verify HMAC signature · Respond 200 → async Pub/Sub · Dedup bằng idempotency key |
| `authSa` | $0.03 | Tăng session TTL · Cache token validation · Giảm memory alloc |

**🛠️ Services:**

- **Firestore/Storage** ($20.75): cleanup unused indexes · cache frequent reads · batch writes · TTL cho data tạm


---

## 🤖 SEO On AEO
> Answer Engine Optimization app
> Project: `seo-on-aeo` | Nguồn: BigQuery Billing Export

### 💰 Tổng quan

|  | Tháng này (MTD) | Rolling 30 ngày |
|--|---:|---:|
| Thực tế | $29.84 (22 ngày) | $37.70 (30 ngày) |
| Trung bình / ngày | ~$1.36 | ~$1.26 |
| **Ước tính tháng** | **~$40.69** | **~$37.70** |

### 📈 Biến động ngày

| | Ngày kia (2026-04-21) | Hôm qua (2026-04-22) | Thay đổi |
|---|---|---|---|
| Chi phí | $1.21 | **$0.89** | **-26.1% 📉 ⚠️** |


### 🗂️ Chi phí theo Service *(Rolling 30 ngày)*

| Service | Chi phí | % | Ước tính tháng |
|---------|--------:|--:|---------------:|
| Cloud Functions | $25.16 | 66.7% | ~$25.16 |
| Firestore / Storage | $11.81 | 31.3% | ~$11.81 |
| Cloud Build | $0.72 | 1.9% | ~$0.72 |
| Artifact Registry | $0.01 | 0.0% | ~$0.01 |
| Cloud Storage | $0.00 | 0.0% | ~$0.00 |

### ⚡ Top Cloud Functions *(Rolling 30 ngày)*
> Tổng Functions: **$25.16**

| # | Function | Chi phí | % | Ước tính tháng |
|---|----------|--------:|--:|---------------:|
| 🔴 | `auth` | $12.76 | 50.7% | ~$12.76 |
| 🟡 | `proxy` | $8.11 | 32.2% | ~$8.11 |
| 🟠 | `api` | $2.71 | 10.8% | ~$2.71 |
| 🟠 | `apiSa` | $1.50 | 6.0% | ~$1.50 |
| 🟠 | `onCreateUser` | $0.04 | 0.2% | ~$0.04 |
| ⚪ | `embedApp` | $0.02 | 0.1% | ~$0.02 |
| ⚪ | `handleHookSubscriber` | $0.01 | 0.0% | ~$0.01 |
| ⚪ | `updateLinksSubscriber` | $0.01 | 0.0% | ~$0.01 |
| ⚪ | `onUpdateShop` | $0.00 | 0.0% | ~$0.00 |
| ⚪ | `authSa` | $0.00 | 0.0% | ~$0.00 |
| ⚪ | `webhookBulkOperation` | $0.00 | 0.0% | ~$0.00 |

### 💡 Gợi ý Optimize

> 💰 **Budget**: R30 estimate **~$37.70**/tháng → Target **$3,500** → dưới budget **$3462.30** 🟢

**🔧 Functions:**

| Function | Cost | Gợi ý |
|----------|-----:|-------|
| `auth` | $12.76 | ⚠️ 51% Cloud Fn → ưu tiên #1 · Tăng session TTL · Cache token validation · Giảm memory alloc |
| `proxy` | $8.11 | Cache response · Connection pooling · Timeout hợp lý |
| `api` | $2.71 | Cache response · Connection pooling · Timeout hợp lý |
| `apiSa` | $1.50 | Cache response · Connection pooling · Timeout hợp lý |
| `handleHookSubscriber` | $0.01 | Idempotency key · Circuit breaker · Check memory alloc vs p95 |
| `updateLinksSubscriber` | $0.01 | Idempotency key · Circuit breaker · Check memory alloc vs p95 |
| `onUpdateShop` | $0.00 | Debounce/throttle invocations |
| `authSa` | $0.00 | Tăng session TTL · Cache token validation · Giảm memory alloc |
| `webhookBulkOperation` | $0.00 | Verify HMAC signature · Respond 200 → async Pub/Sub · Dedup bằng idempotency key |

**🛠️ Services:**

- **Firestore/Storage** ($11.81): cleanup unused indexes · cache frequent reads · batch writes · TTL cho data tạm


---

## 🎯 Mục tiêu: Optimize về $3500/tháng

> **R30 estimate hiện tại: ~$4552.05/tháng → Target: $3500 → Cần cắt: ~$1052.05 (30.1%)** 🔴

| App | Estimate/tháng (R30) | % tổng | Mục tiêu |
|-----|---:|---:|---:|
| 🔍 Avada SEO | ~$3229.67 | 70.9% | **~$2177.62** *(cắt ~$1052.05)* |
| 🖼️ App Plaza Image Optimizer | ~$961.72 | 21.1% | ~$961.72 ✅ ổn |
| 📝 Avada Blog | ~$283.39 | 6.2% | ~$283.39 ✅ ổn |
| ✍️ AI Product Copy | ~$39.57 | 0.9% | ~$39.57 ✅ ổn |
| 🤖 SEO On AEO | ~$37.70 | 0.8% | ~$37.70 ✅ ổn |

> 💡 **Avada SEO** chiếm 71% tổng chi phí — toàn bộ gap cần cắt từ app này.

---

### 🔍 Avada SEO

> Hiện tại **~$3229.67/tháng** → Mục tiêu **~$2177.62/tháng** → Cần cắt **~$1052.05** (33%)

**Tổng tiết kiệm ước tính (nếu thực hiện đầy đủ): ~$1144.09/tháng** → còn khoảng ~$2085.58/tháng

#### 1. **Firestore / Storage** — ~$1652.53/tháng
*🔴 Ưu tiên cao · Tiết kiệm ước tính: ~$495.76/tháng*

- GCP Console → Firestore → Indexes → **xóa composite indexes** không được query tới
- **Bật Firestore TTL** cho các collection: `cache`, `job_queue`, `temp_logs` — tự động dọn data cũ
- Cache frequent reads bằng in-memory LRU hoặc Redis thay vì đọc Firestore mỗi request
- Dùng `batch.commit()` (≤500 ops/batch) thay vì single writes trong loops

#### 2. **`recursiveSubscriber`** — ~$715.09/tháng
*🔴 Ưu tiên cao · Tiết kiệm ước tính: ~$321.79/tháng*

- **Thêm idempotency key** vào Pub/Sub message attributes → dedup khi message bị redeliver
- **Circuit breaker**: stop xử lý khi error rate > 10% trong 5 phút — tránh retry storm
- Audit trong Cloud Monitoring: `invocations/ngày` × `avg execution time` — có tăng bất thường?
- Review **memory allocation** vs p95 actual: nếu function chỉ dùng 128MB nhưng alloc 512MB → giảm

#### 3. **Logging** — ~$148.23/tháng
*🔴 Ưu tiên cao · Tiết kiệm ước tính: ~$103.76/tháng*

- GCP Console → Cloud Logging → Log Router → **Set retention = 7 ngày** (mặc định 30 ngày) → tiết kiệm ~70%
- Tắt DEBUG/INFO logs trong production environment (chỉ giữ WARNING/ERROR)
- Log sampling cho high-volume functions (vd: chỉ log 1/10 request thành công)

#### 4. **`recursiveSubscriberGen2`** — ~$103.80/tháng
*🔴 Ưu tiên cao · Tiết kiệm ước tính: ~$46.71/tháng*

- **Thêm idempotency key** vào Pub/Sub message attributes → dedup khi message bị redeliver
- **Circuit breaker**: stop xử lý khi error rate > 10% trong 5 phút — tránh retry storm
- Audit trong Cloud Monitoring: `invocations/ngày` × `avg execution time` — có tăng bất thường?
- Review **memory allocation** vs p95 actual: nếu function chỉ dùng 128MB nhưng alloc 512MB → giảm

#### 5. **`lighthouseauditrunner`** — ~$46.96/tháng
*🔴 Ưu tiên cao · Tiết kiệm ước tính: ~$36.63/tháng*

- **Cache kết quả scan 24h** trong Firestore (key: `shopId_date`) → giảm 80-90% invocations
- Implement **queue + rate limit**: giới hạn concurrent scans (vd: max 10 shop/lần)
- Giảm timeout headless Chrome → bớt CPU/memory per invocation
- **Cân nhắc PageSpeed API** (`pagespeed.googleapis.com/pagespeedonline/v5`) thay Chrome tự chạy — rẻ hơn ~60%

#### 6. **`lighthouseauditrunnerGen2`** — ~$44.39/tháng
*🔴 Ưu tiên cao · Tiết kiệm ước tính: ~$34.62/tháng*

- **Cache kết quả scan 24h** trong Firestore (key: `shopId_date`) → giảm 80-90% invocations
- Implement **queue + rate limit**: giới hạn concurrent scans (vd: max 10 shop/lần)
- Giảm timeout headless Chrome → bớt CPU/memory per invocation
- **Cân nhắc PageSpeed API** (`pagespeed.googleapis.com/pagespeedonline/v5`) thay Chrome tự chạy — rẻ hơn ~60%

#### 7. **`scanSpeedScoreSubscriberV2`** — ~$22.96/tháng
*🔴 Ưu tiên cao · Tiết kiệm ước tính: ~$17.22/tháng*

- **Cache kết quả 24h** (key: shopId + scanType + date) → bỏ qua scan nếu đã có kết quả hôm nay
- Queue + rate limit để tránh concurrent spike khi nhiều shop trigger cùng lúc

#### 8. **`proxy`** — ~$90.38/tháng
*🟡 Ưu tiên trung bình · Tiết kiệm ước tính: ~$27.12/tháng*

- Thêm **response cache** với TTL phù hợp (vd: 5 phút cho data ít thay đổi)
- Connection pooling cho external API calls (tránh tạo mới connection mỗi invocation)
- Giảm memory allocation nếu function đơn giản

#### 9. **Artifact Registry** — ~$41.56/tháng
*🟡 Ưu tiên trung bình · Tiết kiệm ước tính: ~$24.94/tháng*

- Setup **cleanup policy**: giữ 5 images mới nhất, xóa image older > 30 ngày
- Audit: `gcloud artifacts docker images list --repository=<repo> --sort-by=~CREATE_TIME`

#### 10. **`api`** — ~$71.30/tháng
*🟡 Ưu tiên trung bình · Tiết kiệm ước tính: ~$21.39/tháng*

- Thêm **response cache** với TTL phù hợp (vd: 5 phút cho data ít thay đổi)
- Connection pooling cho external API calls (tránh tạo mới connection mỗi invocation)
- Giảm memory allocation nếu function đơn giản

#### 11. **`apiGen2`** — ~$24.90/tháng
*🟡 Ưu tiên trung bình · Tiết kiệm ước tính: ~$7.47/tháng*

- Thêm **response cache** với TTL phù hợp (vd: 5 phút cho data ít thay đổi)
- Connection pooling cho external API calls (tránh tạo mới connection mỗi invocation)
- Giảm memory allocation nếu function đơn giản

#### 12. **`proxyGen2`** — ~$22.31/tháng
*🟡 Ưu tiên trung bình · Tiết kiệm ước tính: ~$6.69/tháng*

- Thêm **response cache** với TTL phù hợp (vd: 5 phút cho data ít thay đổi)
- Connection pooling cho external API calls (tránh tạo mới connection mỗi invocation)
- Giảm memory allocation nếu function đơn giản

### 🖼️ App Plaza Image Optimizer — ~$961.72/tháng ✅

Đang ổn, không cần ưu tiên optimize.

### 📝 Avada Blog — ~$283.39/tháng ✅

Đang ổn, không cần ưu tiên optimize.

### ✍️ AI Product Copy — ~$39.57/tháng ✅

Đang ổn, không cần ưu tiên optimize.

### 🤖 SEO On AEO — ~$37.70/tháng ✅

Đang ổn, không cần ưu tiên optimize.

---
## 💰 Tổng 3 apps

|  | Tháng này (MTD) | Rolling 30 ngày |
|--|---:|---:|
| Thực tế | — (22 ngày) | $4552.05 (30 ngày) |
| **Ước tính tháng** | **~$4495.91** | **~$4552.05** |
| 🎯 Budget target | $3500.00 | $3500.00 |
| Gap | **+$995.91** cần cắt | **+$1052.05** cần cắt 🔴 |

> 💡 Top mục tiêu cắt giảm: xem phần **Gợi ý Optimize** của từng app bên trên.
