# Mở học 1.6.1 — Thanh toán mô phỏng

Người học tạo đơn từ khóa có giá rồi chọn thành công, thất bại hoặc hủy ngay trong ứng dụng. Giao diện yêu cầu xác nhận hiểu đây là mô phỏng, không thu tiền thật, không nhập thông tin ngân hàng và không chuyển sang cổng bên ngoài. Thành công mở quyền học ngay và cập nhật danh sách khóa đã ghi danh.

Máy chủ lấy giá khóa, chụp số tiền khi tạo đơn, giữ thời hạn 15 phút và tiếp tục đơn chờ thay vì tạo trùng. Chỉ chủ đơn được xử lý; version và trạng thái ngăn cập nhật cũ/gửi lặp. Đơn thành công và ghi danh cùng transaction; lỗi ghi danh rollback đơn về PENDING. Kết quả đã kết thúc không đổi sang loại khác. Khóa bị ẩn hoặc không xuất bản không thể mở quyền qua mô phỏng.

## Nâng cấp

Áp dụng `drizzle/0010_simulated_payments.sql` cho database 1.6. Migration giữ mọi đơn cũ và quyền đã ghi danh, đổi provider mặc định sang SIMULATED, đóng đơn VNPAY_SANDBOX còn PENDING bằng CANCELLED/LEGACY_PROVIDER_DISABLED. Callback cũ trả 410 và không cấp quyền. Không cần cấu hình merchant hoặc khóa thanh toán. Backup schema 3 không đổi; đơn cũ được khôi phục từ backup cũng chỉ dùng xem lịch sử.

## Kiểm chứng

621 kiểm tra API đạt; TypeScript và production build thành công. Các ca mới gồm số tiền/người dùng bị sửa, đơn người khác, xác nhận mô phỏng, version cũ, gửi lặp, kết quả thất bại/hủy/hết hạn, khóa ẩn, lỗi ghi danh để kiểm tra rollback, giới hạn tạo đơn và callback cũ. Migration kiểm tra trên SQLite và D1 cục bộ có dữ liệu cũ. UI thanh toán sau đăng nhập vẫn cần nghiệm thu với tài khoản thật; không thực hiện giao dịch tiền thật.

Các phần AI, email, lab, scanner và lịch vận hành giữ nguyên trạng thái trước đợt này.
