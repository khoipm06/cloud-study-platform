# Nghiệm thu MVP 1.7.0

Dùng tài khoản học viên, giảng viên chủ khóa, mentor và quản trị trên một môi trường thử riêng. Không nhập dữ liệu nhạy cảm. Các kết quả dưới đây là điều kiện cần tự kiểm tra bằng UI; không phải lời khẳng định đã kiểm thử trình duyệt có đăng nhập.

| Vai trò | Thao tác | Kết quả cần đạt |
| --- | --- | --- |
| Người đăng ký | Tạo tài khoản riêng, lưu mã dự phòng | Mặc định PENDING/LEARNER; không tự lấy quyền admin hoặc dùng lại dữ liệu ChatGPT cùng email |
| Quản trị | Duyệt tài khoản riêng có lý do | Người được duyệt đăng nhập được; không gắn nhãn email đã xác minh |
| Tài khoản riêng | Đổi mật khẩu/khôi phục bằng mã/đăng xuất | Cookie HttpOnly, mã một lần, mọi phiên cũ bị hủy; mật khẩu thuần không nằm trong DB |
| Khách | Mở thư viện, lọc/tìm, xem khóa và mentor | Thấy thông tin công khai, không đọc được bài đầy đủ, key quiz hoặc lịch hẹn riêng |
| Học viên | Ghi danh, đọc/video, lưu ghi chú và hoàn thành bài | Tiến độ và ghi chú còn sau tải lại; bài tự chọn không tính vào điều kiện hoàn tất |
| Học viên | Làm quiz, bỏ chọn, tải lại, nộp còn câu trống | Đáp án giữ nguyên, có xác nhận nộp, điểm và lời giải đúng snapshot |
| Giảng viên | Tạo hai quiz theo chủ đề, mở làm bài và sửa một đề | Hai quiz độc lập; lượt đang làm và kết quả cũ giữ đề cũ |
| Học viên | Tra cứu từ khóa không dấu trong khóa đã ghi danh | Trích đoạn có nguồn mở đúng bài; từ không có trong bài trả kết quả rỗng |
| Học viên | Tạo mục tiêu và phiên học theo múi giờ | Lịch lưu qua tải lại, chặn trùng; tùy chọn nhắc và đã đọc có hiệu lực |
| Thành viên nhóm | Tạo/sửa/gỡ bài và bình luận, báo cáo | Chỉ sửa nội dung của mình, hạn chế tần suất, giữ dấu kiểm duyệt |
| Quản trị | Tìm tài khoản, cấp giảng viên/mentor và khóa/mở có lý do | Kiểm tra quyền ở máy chủ, từ chối phiên bản cũ, có audit; không tùy ý cấp ADMIN |
| Mentor | Tạo hồ sơ hiển thị, mở giờ, thử tạo trùng | Hồ sơ có trong danh bạ, giờ trùng bị chặn |
| Hai học viên | Cùng đặt một khung giờ | Chỉ một yêu cầu giữ chỗ thành công |
| Mentor / học viên | Xác nhận với HTTPS, hủy/đổi sang giờ khác | Link chỉ người tham gia thấy; slot hủy được mở lại, giờ hết hạn không thể xác nhận |
| Mentor / học viên | Hoàn tất sau buổi và đánh giá | Chỉ học viên đánh giá một lần; điểm trung bình công khai, nhận xét riêng |
| Người học | Tạo/tiếp tục đơn và chọn thành công/thất bại/hủy | Chỉ thành công mở quyền học, kết quả được lưu qua tải lại; không gửi ra cổng ngoài, không thu tiền thật |
| Người học | Cấp và chia sẻ chứng nhận | Đủ tiến độ/quiz; mặc định riêng tư, chỉ công khai sau bật chia sẻ |
| Quản trị | Thu hồi chứng nhận | Có lý do/audit, trang xác thực báo bị thu hồi |
| Hai thành viên cùng khóa | Nhắn tin, chặn, tắt nhận, gỡ và đã đọc | Chỉ người tham gia đọc; chặn/tắt nhận chặn gửi hai chiều; admin không tham gia không đọc được |
| Thành viên nhóm | Đính kèm PDF/ảnh vào bài/tin | Cách ly PENDING, không tải trước duyệt; chỉ tác giả đính kèm; tệp private giữ quyền hội thoại |
| Quản trị / scanner | Duyệt tệp hoặc trả kết quả có checksum | Phân biệt duyệt thủ công với scanner; sai checksum giữ cách ly; REJECTED không tải được |
| Giảng viên | Tạo lab có ví dụ công khai và test ẩn | Người học chỉ đọc được ví dụ công khai |
| Học viên + runner đã cấu hình | Chạy lời giải đúng/sai/quá thời gian | Có trạng thái bất đồng bộ, điểm từ test, test ẩn không lộ output; lịch sử riêng |
| Quản trị | Chạy vận hành và đọc lại lịch sử | Tạo nhắc đến hạn, không tạo trùng; hết hạn booking, dọn tệp theo retention |
| Quản trị | Tạo backup rồi tải manifest | Chỉ admin tải được tệp mã hóa; bản READY có đủ object |
| Chủ nền tảng, môi trường thử | Xem trước và khôi phục backup | Yêu cầu xác nhận chính xác, khôi phục dữ liệu/tệp, giữ audit, khóa request đồng thời |

Kiểm thử tự động: `pnpm test`, `pnpm typecheck`, `pnpm build`. Migration phải kiểm tra trên database 1.0/1.2 đã có dữ liệu, không chỉ database rỗng. Kiểm thử backup/restore không tác động production.

Điều kiện ngoài mã nguồn: xác thực ChatGPT của hosting, secret backup, dịch vụ chạy mã, kết nối MCP/lịch cloud. AI sinh câu trả lời chưa kết nối mô hình; email có adapter gateway nhưng chưa kết nối dịch vụ gửi thật; Web Push đã cấu hình nhưng cần thử thiết bị thật. Tài khoản riêng hoạt động theo duyệt thủ công, không gửi email xác minh. Runner và scanner cần cấu hình thật trước nghiệm thu ngoài fixture. Thanh toán đã chuyển sang mô phỏng nội bộ. Lịch cloud hàng giờ hiện đang tắt khi kiểm tra bản 1.6; cần bật lại theo quyết định của người vận hành trước khi nghiệm thu chạy theo lịch; nhắc nền có thể trễ gần một giờ.

## Nhắc học và lịch 1.5

| Kịch bản | Kết quả cần nghiệm thu trên thiết bị thật |
| --- | --- |
| Mở Kế hoạch học, chưa nhấn Bật | Không tự hỏi quyền thông báo |
| Bật thiết bị, cấp quyền, Gửi thử | Dịch vụ nhận request; OS hiển thị câu chung, không tên khóa/ghi chú |
| Đóng trang, có phiên đến hạn, chờ tick | Nhận nhắc khi browser/OS cho phép; bấm chỉ mở cùng origin /#planner |
| Đọc nhắc hoặc hủy phiên trước tick | Không tạo/gửi thêm push của nhắc đó |
| Tắt cài đặt nhắc, lưu trữ mục tiêu, ẩn khóa hoặc khóa người học | Không gửi push tới người học bị chặn |
| Thu hồi thiết bị từ một thiết bị khác | Thiết bị bị thu hồi không nhận nhắc tiếp theo |
| Provider tạm lỗi, hết hạn subscription | Retry theo backoff; 404/410 gỡ thiết bị; không giả báo đã hiển thị |
| Xuất lịch tuần và nhập Apple/Google/Outlook | Đúng giờ, tiếng Việt, alarm; sửa/hủy phải xuất/cập nhật lại, không tự đồng bộ |
| iPhone/iPad | Thêm Màn hình chính, mở standalone rồi bật; kiểm tra đúng phiên bản OS/browser |
| Khôi phục trên môi trường thử riêng | Đăng ký thiết bị/outbox bị xóa, phải opt-in lại; không hồi sinh device credentials cũ |

621 kiểm tra API và các ca RFC/crypto/service worker/DST đã đạt ở môi trường fixture. Những hàng trên vẫn cần nghiệm thu bằng browser/thiết bị thật có đăng nhập. Không xin quyền push hoặc gửi thử tới thiết bị người dùng chỉ để đánh dấu hoàn thành kiểm thử.

## Bổ sung 1.6

| Kịch bản | Kết quả cần nghiệm thu |
| --- | --- |
| Hai người học, quản trị không tham gia | Chỉ chủ hội thoại hỏi học liệu đọc/xóa được lịch sử; ẩn khóa hoặc gỡ ghi danh thì không mở được nội dung |
| Hỏi kiến thức và từ khóa không có | Có trích đoạn đúng nguồn hoặc báo chưa tìm thấy; không ghi nhãn là mô hình AI |
| Gửi lại yêu cầu sau mất kết nối | Không lưu trùng một lượt hỏi; sửa câu hỏi với cùng request ID bị từ chối |
| Đăng ký khi email gateway sẵn sàng | Hộp thư nhận liên kết thật, click rồi chủ động xác minh; tài khoản vẫn chờ quản trị duyệt |
| Reset bằng email trên hai thiết bị | Link hết hạn/đã dùng không đổi mật khẩu; link hợp lệ kết thúc mọi phiên cũ |
| Chủ nền tảng tải gói .mohoc | Gói có snapshot và tệp; lưu ở kho riêng cùng quy trình bảo quản khóa tách biệt |
| Môi trường thử riêng cùng owner/key | Nhập gói không đổi dữ liệu đang hoạt động; xem trước và khôi phục mới thay thế dữ liệu/tệp |
| Gói sai khóa/bị sửa/thiếu tệp | Từ chối rõ ràng, không làm thay đổi dữ liệu đang hoạt động, không để object nhập dở |

Đã kiểm tra các luồng email bằng HTTP fixture và portable restore bằng SQLite/R2 fixture; chưa xác nhận thư thật hoặc diễn tập cloud riêng. Preview managed không có mailbox sites-previewd ở đợt này; chưa nghiệm thu các hàng UI có đăng nhập.

## Ví VND, duyệt khóa học và nhật ký

| Vai trò | Thao tác | Kết quả mong đợi |
| --- | --- | --- |
| Người tạo | Tạo khóa, thêm bài bắt buộc và quiz, chọn giá, gửi duyệt | Khóa hiện trong hàng chờ của admin |
| Admin | Xem bài học và quiz rồi trả lại kèm lý do | Người tạo thấy lý do và sửa được bản nháp |
| Admin | Duyệt lần gửi tiếp theo | Khóa có mặt trong thư viện |
| Người mua | Mở ví rồi mua khóa có giá | Giá trừ khỏi ví, khóa xuất hiện trong Khóa học của tôi |
| Người tạo | Mở ví và nhật ký sau lượt mua | Giao dịch vào bằng đúng giá của khóa |
| Người học | Ghi danh khóa miễn phí | Quyền học được mở và số dư bằng trước khi ghi danh |
| Admin | Cấp VND kèm lý do | Ví người nhận và nhật ký quản trị ghi nhận khoản cấp |

Dùng các tài khoản riêng cho người tạo và người mua. Kiểm tra lại số dư sau khi mở khóa trả phí đã mua và sau khi bấm xác nhận mua ở hai tab.
