# Mở học 1.5

## Thay đổi

- Web Push cho nhắc học: tự bật từng thiết bị, tối đa 5, đặt tên, gửi thử và thu hồi.
- Queue gửi lại có backoff, chống gửi lặp sau khi provider nhận, tự gỡ endpoint hết hạn. Kiểm tra lại quyền và trạng thái học trước gửi.
- Xuất lịch tuần .ics: UTC/DST, tên tiếng Việt, nhắc trước phiên, UID/SEQUENCE ổn định và trạng thái hủy.
- Thêm manifest standalone cho Màn hình chính, service worker không cache dữ liệu học riêng tư.
- Quản trị xem probe crypto runtime và tổng hàng đợi/lỗi push.
- Sửa nhãn thư viện không còn gọi tất cả khóa là miễn phí khi có giá sandbox.

## Nâng cấp

Database 1.4 chỉ áp dụng drizzle/0008_study_reminders.sql. Không sửa dữ liệu cũ hoặc audience. Cần VAPID_PRIVATE_JWK secret và VAPID_SUBJECT cho Web Push; không cần merchant hoặc gói trả phí từ bên thứ ba để tạo khóa. Browser tự đăng ký dịch vụ push khi người học cấp quyền.

Backup schema 2 của 1.4 vẫn tương thích; thiết bị/outbox không được backup. Restore xóa mọi đăng ký push, người học bật lại. Không thực hiện restore production trong đợt này.

## Kiểm chứng

519 kiểm tra API đạt, cùng vector RFC 8291, chữ ký VAPID, endpoint SSRF, service worker, UTF-8/calendar injection và DST. Test dịch vụ push là HTTP fixture, không phải nghiệm thu nhận thông báo trên thiết bị thật. TypeScript/build được kiểm tra trước đóng gói.

Đã kiểm tra UI công khai thư viện/tìm kiếm qua browser. Managed preview thiếu sites-previewd; UI có đăng nhập và nhận push thật vẫn cần nghiệm thu. API acceptance/provider acceptance không thay thế các bước này.

## Phần còn phụ thuộc cấu hình

| Phần | Cần bổ sung |
| --- | --- |
| AI tutor | Chọn provider và API key; chưa dùng OpenAI Developers theo lựa chọn trước |
| Lab Python | Judge0 riêng có sandbox và giới hạn thực thi; chưa chạy mã thật |
| VNPay sandbox | Merchant/secret, đăng ký IPN, giao dịch nghiệm thu |
| Quét mã độc | Scanner riêng; hiện dùng cách ly/duyệt thủ công |
| Email | Nhà cung cấp gửi email, domain và cấu hình; chưa xác minh/reset qua email |
| Nhắc đúng giờ hơn | Scheduler có chu kỳ dưới 1 giờ, nếu đồ án cần cam kết thời gian |
| Phục hồi/tải | Restore ở cloud thử riêng, sao lưu ngoài tài khoản, đo tải và RPO/RTO |

Chưa tuyên bố toàn bộ đặc tả hoàn thành.
