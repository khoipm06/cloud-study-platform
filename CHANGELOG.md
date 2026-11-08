# Thay đổi bản 1.6.1

- Chuyển thanh toán từ VNPay sang mô phỏng nội bộ, có thành công/thất bại/hủy/hết hạn và xác nhận rõ không thu tiền thật.
- Tạo/tiếp tục đơn với giá máy chủ, kiểm tra chủ đơn và phiên bản; thành công và ghi danh cùng transaction, gửi lặp không cấp đôi.
- Bỏ yêu cầu cấu hình merchant/secret, ngừng callback cũ; giữ lịch sử và quyền đã ghi danh. Migration 0010 đóng đơn cổng cũ còn chờ.
- 621 kiểm tra API đạt, TypeScript/build thành công. Kiểm thử có cả lỗi ghi danh để kiểm tra rollback đơn.

# Thay đổi bản 1.2

- Thêm mục tiêu theo khóa và lịch phiên học riêng, có ngày đích, phút/tuần, trạng thái và múi giờ.
- Lưu giờ UTC, xử lý đổi múi giờ và từ chối giờ không tồn tại do DST; chặn phiên học trùng giờ.
- Nhắc trước phiên trong ứng dụng, bật/tắt, đánh dấu đã đọc, loại trùng và thu hồi khi đổi/hủy lịch.
- Thêm nhóm học theo khóa, bài viết, bình luận, sửa/gỡ nội dung của mình và phân trang.
- Giới hạn 5 bài/bình luận mỗi phút và mã yêu cầu để gửi lại không tạo nội dung trùng.
- Gửi thông báo trong ứng dụng cho tác giả khi có phản hồi mới; không tự gửi email hoặc thông báo đẩy.
- Báo cáo bài viết/bình luận và luồng quản trị KEEP/HIDE, có lý do, nhật ký và xử lý đồng thời các báo cáo cùng nội dung.
- Thêm migration 0003 cho dữ liệu mới và 0004 cho chỉ mục; giữ nguyên dữ liệu phiên bản trước.
- Tổng cộng 237 kiểm tra API đã đạt, gồm cả kiểm tra cũ và các luồng mới.

# Thay đổi bản 1.1

- Bổ sung thư viện công khai có phân trang và dữ liệu lấy từ máy chủ.
- Thêm ngân hàng câu hỏi theo khóa, liên kết bài ôn tập và lịch sử revision quiz bất biến.
- Chấm đáp án đã lưu; hỗ trợ bỏ chọn và nộp bài còn câu trống sau xác nhận.
- Gợi ý ôn từ câu sai/bỏ trống, loại trùng và kiểm tra quyền trước khi tạo liên kết.
- Thêm bài video HTTPS, bài bắt buộc/tự chọn, lưu bài gần nhất và thời điểm hoàn thành khóa.
- Sắp xếp, xóa bài nháp và xóa khóa nháp chưa có ghi danh; thứ tự bài còn lại được đánh lại liên tiếp.
- Báo cáo giảng viên và xuất CSV theo trang; quản trị viên ngoài khóa chỉ nhận tổng hợp.
- Danh mục có chuẩn hóa tên, phiên bản và trạng thái hoạt động; đổi tên cập nhật khóa liên quan.
- Gỡ/khôi phục tài liệu trong 7 ngày; dọn object quá hạn bằng thao tác quản trị.
- Yêu cầu lý do khi kiểm duyệt hoặc đổi quyền; nhật ký phân trang.
- Loại bỏ cơ chế cho người đăng nhập đầu tiên tự trở thành quản trị khi website công khai.
- Thêm hai migration nối tiếp; giữ nguyên dữ liệu và migration của bản 1.0.
