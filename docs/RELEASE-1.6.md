# Mở học 1.6

- Hỏi học liệu theo hội thoại, lưu lịch sử riêng theo khóa, trích đoạn có nguồn, tiếp tục/xóa và tránh gửi trùng. Chế độ EXTRACTIVE_SEARCH; chưa có mô hình AI sinh câu trả lời.
- Xác minh email và reset bằng liên kết một lần qua gateway HTTP. Xác minh không tự duyệt tài khoản; reset hủy mọi phiên. Cấu hình gửi thật còn thiếu.
- Xuất/nhập gói .mohoc đầy đủ, mã hóa cả dữ liệu và học liệu, stream có giới hạn. Import không tự khôi phục; sai khóa, sai checksum, dữ liệu dư/thiếu bị từ chối.
- Backup schema 3 chứa hội thoại và địa chỉ đã xác minh, đọc được schema 2 bằng cách bổ sung ba bảng mới rỗng. Không sao lưu token email/phiên/thiết bị push.
- Sửa nhãn vận hành không mặc định khẳng định lịch đang chạy; sửa việc tải lại trang quản trị bằng phiên vừa bị vô hiệu hóa sau restore.

## Migration

Database 1.5 áp dụng duy nhất `drizzle/0009_account_email_and_tutor.sql`. Không xóa bảng hoặc dữ liệu cũ. Giữ Site ID, DB/R2, audience và các secret hiện có.

## Kiểm chứng

592 kiểm tra API đạt, gồm các ca hiện có và email token, kiểm tra quyền hội thoại, nhập/xuất đầy đủ sau khi xóa object backup nguồn, dữ liệu hỏng/cắt ngắn/dư, đọc stream chia nhỏ, sai khóa và khôi phục schema 2. TypeScript và production build được kiểm tra trước bàn giao.

Preview managed thiếu sites-previewd; chưa nghiệm thu UI có đăng nhập hoặc push trên thiết bị thật. Email dùng gateway HTTP giả lập trong test; lab/VNPay/scanner chưa có dịch vụ để chạy thật. Chưa diễn tập phục hồi trên cloud riêng hoặc đo tải.

Ở lần đọc trạng thái Site trong đợt này, lịch “Vận hành Mở học hàng giờ” đang tắt; giữ nguyên, không tự bật lại. Chatbot AI chưa kết nối mô hình theo lựa chọn chưa dùng OpenAI Developers trước đó. Xem OPERATIONS.md để cấu hình gateway email và sử dụng gói di chuyển.
