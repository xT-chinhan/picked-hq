# NaN for Picked

Tiện ích Chrome đặt cuộc trò chuyện NaN cạnh trang đang xem. Không có bước build hoặc thư viện chạy kèm.

## Cài đặt

1. Mở `chrome://extensions` và bật **Developer mode**.
2. Chọn **Load unpacked**, chọn thư mục `extension/`.
3. Bấm biểu tượng NaN để mở bảng bên. Chrome 114 hỗ trợ bảng bên; phím tắt và menu mở bảng bằng chương trình cần Chrome 116 trở lên.
4. Trong **Cài đặt máy chủ**, giữ `http://127.0.0.1:5198` cho máy chủ cục bộ hoặc đặt `https://pickedhq.pages.dev`.

Bấm **Review this page** để đọc trang và gửi bản trích xuất tới `/api/page/review`. Bấm **Send page to chat** để đọc trang và gửi URL, tiêu đề, mô tả, loại schema và trạng thái FAQ kèm tin nhắn tới `/api/one/chat`. Tin nhắn tiếp theo sử dụng ngữ cảnh trang đã đọc; chuyển trang sẽ xóa ngữ cảnh cũ. Nội dung chọn qua menu được điền vào ô nhập, chỉ gửi khi bạn bấm **Gửi**.

Phím tắt **Alt+Shift+N** hoặc menu **Ask NaN about this page** mở bảng và chọn trang nguồn; bấm một nút trong bảng để đọc nội dung. Có thể sửa phím tắt tại `chrome://extensions/shortcuts`. Các trang nội bộ Chrome và cửa hàng tiện ích không cho phép trích xuất.

Đèn xanh báo `/api/health` trả về `{ "ok": true }`. Khi máy chủ lỗi hoặc trả 503, bảng hiển thị “NaN-Team đang tạm khóa để phát triển dự án”. Có thể lưu URL HTTP(S) khác, nhưng quyền truy cập mạng chỉ gồm hai máy chủ nêu trên; máy chủ khác phải hỗ trợ CORS từ tiện ích. URL có thông tin đăng nhập, truy vấn hoặc fragment không được chấp nhận.

## Quyền

- `sidePanel`: hiển thị bảng NaN cạnh trang.
- `activeTab`: quyền tạm thời trên trang khi người dùng tương tác với tiện ích.
- `scripting`: trích xuất nội dung trang theo thao tác người dùng.
- `storage`: lưu URL máy chủ và yêu cầu mở trang chờ xử lý trong phiên.
- `contextMenus`: thêm mục hỏi NaN trên trang hoặc vùng văn bản chọn.
- Quyền host cho `http://127.0.0.1:5198/*` và `https://pickedhq.pages.dev/*`: gọi máy chủ Picked.

Tiện ích không đọc cookie, không theo dõi phím gõ, không đọc nội dung trang ngầm. Chỉ đọc nội dung khi người dùng bấm nút trích xuất; phím tắt chỉ mở bảng. Không dùng debugger, native messaging hay quyền tất cả trang. Tiêu đề tab được cập nhật để người dùng biết trang đang chọn. Dữ liệu trang là dữ liệu không tin cậy, luôn hiển thị qua `textContent`.

## Kiểm thử offline

Chạy từ thư mục gốc repo (Node 24, `linkedom` đã cài):

```sh
node --test extension/tests/*.test.mjs
```

Kiểm thử dùng DOM giả, storage giả và fetch giả; không truy cập Internet. Thử thủ công trên Chrome: mở bảng từ biểu tượng, phím tắt và menu; đánh giá một trang thường; gửi tin nhắn; đổi máy chủ; kiểm tra thông báo khi máy chủ dừng.


## 0.2: the side panel reads the page for the AI
- **NaN can read this browser** is a switch in the panel. It asks Chrome for page access (optional host permissions) only when you turn it on, and you can turn it off at any time. Until then NaN reads nothing, and a card explains how to turn it on.
- **The tab chip** above the message box shows the page NaN will read with your next message. Press × to send a message without the page.
- When you send a message with the page attached, the extension extracts the title, description, headings, structured data and the first 6,000 characters of visible text and sends them with the question, so NaN answers about the page. Page text is only ever shown as text, never as HTML.
- **+ menu**: attach this tab, review this page for AI (score, checks, a gauge), or analyze the site in Picked. Real jobs run in Picked: “Run this in Picked” opens it with `?ask=...`.
