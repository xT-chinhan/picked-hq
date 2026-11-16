# Picked — kế hoạch MVP chạy thật (một lần chạy từ đầu đến cuối)

Mục tiêu: nhập một thương hiệu, bấm **một lần**, hệ thống tự chạy toàn bộ chuỗi bằng AI thật và tạo ra sản phẩm thật: điểm AI Visibility đo từ Gemini, chẩn đoán website, bản nháp nội dung dựa trên dữ kiện thật, kiểm tra rủi ro, chủ shop duyệt, và một trang shop công khai (FAQ + JSON-LD + `llms.txt`).

## 1. Một lần chạy (định nghĩa "xong")

Lệnh: `pnpm mvp -- --brand Elmich --website https://elmich.vn --category "hộp cơm giữ nhiệt"`
hoặc nút **Live audit** trên giao diện (cùng một pipeline).

| # | Bước | Kết quả thật | Công cụ |
|---|---|---|---|
| 1 | Câu hỏi người mua | 40 câu hỏi (ngân hàng câu hộp cơm, hoặc AI sinh cho ngành khác) | agy flash |
| 2 | Hỏi Gemini web | 40 câu trả lời + nguồn dẫn, 5 tab song song (~3 phút) | Playwright (đã xong) |
| 3 | Phân tích | điểm, thứ hạng, đối thủ, nguồn, danh sách câu hỏi bị bỏ sót | parse.mjs (đã xong) |
| 4 | Chẩn đoán website | điểm 0–100 + 30 kiểm tra (reach/read/understand) | **Elmo site-audit** (đã tích hợp) |
| 5 | Dữ kiện nguồn | danh sách dữ kiện có đánh số `f1..fn`, mỗi cái có URL nguồn | fetch + agy argon |
| 6 | Nội dung | FAQ (trả lời đúng các câu bị bỏ sót), trang giới thiệu, thư pitch; mọi câu trích `refs` | agy argon |
| 7 | Cổng rủi ro | mỗi câu được đối chiếu dữ kiện; quét PII; chặn cường điệu; độ tin cậy từng tài liệu | quy tắc + agy flash |
| 8 | Chủ shop duyệt | trang `/approve/<id>` trên điện thoại (QR) hoặc nút trên canvas | server + `qrcode` |
| 9 | Đăng | `public/shops/<slug>/` gồm `index.html` (JSON-LD), `llms.txt`, `sitemap.xml`, `robots.txt` | render thuần |
| 10 | Theo dõi | bản đo gốc được lưu; chạy lại sau 7 ngày để so sánh | lưu run |

Mọi bước phát sự kiện SSE; canvas hiện dữ liệu thật. Mỗi bước có cache theo nội dung nên chạy lại tức thì, và cả run được ghi để phát lại không cần mạng.

## 2. Quyết định tích hợp (ưu tiên có sẵn trước khi tự viết)

| Repo | Quyết định | Cách dùng |
|---|---|---|
| **elmohq/elmo** (MIT) | **Dùng** gói `site-audit` (đã đóng gói vào `server/vendor/`); lấy **định nghĩa chỉ số** | Chẩn đoán website thật. Chỉ số: visibility = tỉ lệ câu hỏi nhắc thương hiệu; position = thứ hạng trung bình; citations theo nhóm domain |
| **Gemini web + Playwright** | Đã dùng | Đo thật, đa tab |
| **agy / agyxt** | **Dùng làm LLM của hệ thống** | `agy -p --json-schema` qua proxy agyxt :8899 (tự đổi tài khoản khi hết hạn mức) |
| **Codex Astra** (`gpt-6-astra`) | **Dùng để viết code phụ** | `scripts/astra.sh WP-x`, mỗi gói việc một đặc tả |
| **Codex gpt-6.1-sol** (web search live) | Tùy chọn | Bổ sung dữ kiện khi website thiếu |
| elmohq/elmo, yaojingang/GEOFlow, GEORank | Tham khảo ý tưởng, trả lời "đối thủ là ai" | Không chép mã (GEOFlow là AGPL, PHP) |
| yaojingang/GEOInflow (MIT) | Lộ trình | Theo dõi bot AI truy cập trang shop đã đăng |
| LangGraph / LangGraph.js | Lộ trình | Dùng khi cần duyệt dừng/tiếp bền vững; MVP dùng máy trạng thái đơn giản |
| LiteLLM, CrewAI, Unstructured, Superset | Bỏ | Đã có `agy` + Gemini; Unstructured không cần vì Gemini đọc trực tiếp |
| serpmaven, shopee-scraper, facebook-scraper | Bỏ | Cào Google cần proxy trả phí; hai scraper kia hỏng hoặc cần đăng nhập tay |
| Gateway xingchiapi | Không dùng cho sản phẩm | Chỉ cho client lập trình; chỉ Astra qua Codex CLI |

## 3. Phân vai AI

| Việc | Model | Giới hạn song song | Dự phòng |
|---|---|---|---|
| Trích xuất/phán xét có cấu trúc | `gemini-3.8-flash-low` (11 s) | 3 | `gemini-4-argon-low` |
| Viết nội dung, dữ kiện | `gemini-4-argon-medium` | 2 | `gemini-4-hydrogen-low` |
| Viết bản nháp dài (tùy chọn) | `gpt-oss-120b-medium` (không tuân thủ lược đồ, chỉ viết) | 1 | argon |
| Đo AI Visibility | Gemini web, chưa đăng nhập | 5 tab | bản run đã lưu |
| Viết code phụ | Codex `gpt-6-astra` | 2–3 | Claude |

Không dùng model Claude trong hệ thống. Gemini CLI cần đăng nhập Google nên bỏ qua.

## 4. Hợp đồng dữ liệu (các gói việc độc lập nhau nhờ hợp đồng này)

```
llm        = { agyJson({prompt, schema, model}), agyText({prompt, model}) }   // WP-A, truyền vào các module để dễ kiểm thử
Facts      = { brand, website, facts: [{ id:'f1', kind, text, source }] }
Content    = { faqs:[{q, a, refs:[id]}], overview:{title, paragraphs:[{text, refs}]}, pitch:{to, subject, body:[{text, refs}]} }
Risk       = { items:[{doc, sentence, refs, supported, why}], pii:[...], flags:[...], confidence:{faq, overview, pitch}, needsOwner:[doc] }
Approval   = { id, url, qr, status:'pending'|'approved'|'rejected', decisions:{faq, overview, pitch} }
Shop files = { 'index.html', 'llms.txt', 'sitemap.xml', 'robots.txt' }
```

## 5. Gói việc

| Gói | Người làm | Tệp | Nghiệm thu |
|---|---|---|---|
| **WP-A** Lớp LLM | Claude | `server/llm.mjs` | `agyJson` trả JSON đúng lược đồ; cache; giới hạn song song; bật proxy agyxt |
| **WP-B** Dữ kiện | Astra | `server/facts.mjs` + test | tải 5 trang, trích dữ kiện `f1..`, mỗi dữ kiện có nguồn; chạy thật trên elmich.vn |
| **WP-C** Nội dung + trang shop | Astra | `server/content.mjs`, `server/shop.mjs` + test | Content hợp lệ, mọi câu có `refs`; trang HTML có JSON-LD FAQPage/Organization và `llms.txt` đúng chuẩn |
| **WP-D** Rủi ro | Astra | `server/risk.mjs` + test | bắt số điện thoại/email/CCCD; bắt "tốt nhất Việt Nam"; số liệu không có trong dữ kiện bị đánh dấu |
| **WP-E** Duyệt | Astra | `server/approve.mjs` + test | trang duyệt di động, QR, quyết định lưu lại |
| **WP-F** Pipeline | Claude | `server/pipeline.mjs`, `server/index.mjs` | một lần chạy ra đủ sự kiện và tệp; có cache |
| **WP-G** Canvas | Claude | `src/*` | Content/Risk/Approve/Publish/Impact hiện dữ liệu thật |
| **WP-H** Tổng duyệt | Claude | `public/runs/` | chạy thật Elmich; ghi bản phát lại; README; đẩy GitHub |

Astra làm WP-B, C, D, E song song (tối đa 3 tiến trình một lúc), mỗi gói chỉ sửa các tệp của mình. Claude làm WP-A trước (vài phút), rồi F, G, và duyệt mã Astra viết.

## 6. Thứ tự

1. WP-A (Claude) song song với khởi chạy WP-B và WP-D (Astra).
2. WP-C và WP-E (Astra) khi có chỗ trống.
3. WP-F nối các module khi chúng xong; WP-G dựng giao diện theo sự kiện.
4. WP-H: chạy thật toàn chuỗi cho Elmich, ghi lại, kiểm thử bản phát lại.

## 7. Rủi ro và dự phòng

| Rủi ro | Dự phòng |
|---|---|
| Gemini web chặn hoặc giới hạn | bản run đã lưu (đã có, phát lại chấm lại được cho thương hiệu bất kỳ) |
| agy hết hạn mức hoặc phiên | proxy agyxt đổi tài khoản; cache LLM theo nội dung; kết quả đã ghi |
| Website của thương hiệu chặn audit hoặc thiếu | Sunhouse chặn audit: báo "blocked" như một phát hiện; không có website thì nhập dữ kiện tay |
| Điện thoại không vào được máy chủ (mạng ở nơi thi) | nút Approve ngay trên canvas |
| Mạng không ổn định | toàn bộ cả run phát lại không cần mạng |

## 8. Nói thật trên sân khấu

- Điểm AI Visibility là thật. "Điểm sau khi sửa" chưa đo được vì AI chưa cập nhật; số hiển thị là mục tiêu pilot.
- Thương hiệu demo là thương hiệu công khai (Elmich), không phải khách hàng của nhóm; dữ kiện lấy từ website của họ.
- Zalo OA chưa tích hợp; duyệt qua đường dẫn.
- Gemini được đo là bản web chưa đăng nhập (Flash-Lite).
