# Cloud study platform — MVP 1.7.0

Đồ án nền tảng học tập tiếng Việt. React và TypeScript chạy trên Cloudflare Workers qua Vinext. D1 lưu dữ liệu, còn R2 lưu học liệu và bản sao lưu.

## Tính năng

| Nhóm | Nội dung |
| --- | --- |
| Tài khoản riêng | Đăng ký email/mật khẩu, duyệt bởi quản trị, phiên HttpOnly, đăng xuất, đổi mật khẩu, 5 mã khôi phục dùng một lần. Đã có luồng liên kết xác minh và reset email qua HTTP gateway; chưa cấu hình dịch vụ gửi thật. |
| Học tập | Thư viện công khai, tìm kiếm/lọc/phân trang, ghi danh miễn phí hoặc mua bằng Ví VND, bài đọc/video HTTPS, học liệu PDF/ảnh, tiến độ theo bài bắt buộc, ghi chú riêng |
| Luyện tập | Quiz cuối khóa và nhiều quiz theo chủ đề; ngân hàng câu hỏi; revision và snapshot bất biến; lưu/bỏ chọn đáp án; tiếp tục lượt chưa nộp; chấm trên máy chủ; kết quả, lời giải và liên kết ôn tập |
| Kế hoạch | Mục tiêu theo khóa, lịch tuần, phiên học, múi giờ/DST, chống trùng lịch, nhắc trong ứng dụng, đánh dấu đã đọc |
| Nhắc ngoài ứng dụng | Web Push opt-in trên tối đa 5 thiết bị/người; nút gửi thử; hàng đợi, gửi lại có backoff, bỏ qua lịch hủy/ẩn/đã đọc; xuất lịch tuần .ics với alarm. Cần cấp quyền trên thiết bị; lịch máy chủ vẫn mỗi giờ. |
| Cộng đồng | Thảo luận theo khóa, bài viết/bình luận, sửa/gỡ nội dung của mình, báo cáo, giới hạn đăng, kiểm duyệt và nhật ký |
| Mentor | Quyền mentor được cấp riêng; hồ sơ công khai tự chọn; mở/đóng giờ, giữ chỗ, xác nhận/từ chối/hủy/hết hạn/hoàn tất; liên kết họp riêng; đánh giá sau buổi |
| Chứng nhận | Cấp khi hoàn thành bài bắt buộc và đạt quiz ≥70; bản in/lưu PDF, chia sẻ tự chọn, xác thực công khai và thu hồi có lý do |
| Ví VND mô phỏng | Nhận 500.000 ₫ khi mở ví lần đầu, mua khóa học, nhận doanh thu khóa đã bán và xem giao dịch. Quản trị viên có thể cấp thêm VND. |
| Nhật ký hoạt động | Lịch sử riêng của tài khoản gồm ghi danh, mua bán, hoàn thành bài học, nộp quiz, tạo khóa và kết quả duyệt. |
| Tin nhắn riêng | Hai thành viên cùng khóa, chặn/bỏ chặn, tắt nhận tin, trạng thái đã đọc, gỡ tin của mình, phân trang và cập nhật khi mở trang |
| Tệp cộng đồng | PDF/ảnh trên bài viết hoặc tin nhắn, cách ly PENDING, scanner HTTP hoặc duyệt thủ công có lý do, tải có kiểm tra quyền |
| Hỏi học liệu | Trò chuyện theo khóa, lịch sử riêng, tiếp tục/xóa hội thoại, trích đoạn có nguồn; hiện không dùng mô hình AI. Tìm đoạn chứa từ khóa trong bài đọc của khóa đã được phép học; hỗ trợ từ khóa không dấu, trích nguyên văn kèm liên kết nguồn; không sinh câu trả lời bằng AI |
| Lab | Biên soạn Python 3, ví dụ công khai/test ẩn, mã khởi đầu, kết nối Judge0, chạy/chấm bất đồng bộ và lịch sử riêng. **Cần dịch vụ thực thi riêng để chạy thật.** |
| Người tạo khóa học | Mọi tài khoản đăng nhập đều có thể soạn bài và quiz, đặt giá, gửi duyệt, theo dõi phản hồi, lưu trữ khóa và xem báo cáo của khóa mình. |
| Quản trị | Duyệt khóa miễn phí và trả phí, cấp VND, tìm và khóa tài khoản, cấp quyền mentor, quản lý danh mục và nhật ký hệ thống |
| Vận hành | Health/readiness, chạy nhắc học đến hạn cho nhiều người dùng, hết hạn lịch mentor, dọn học liệu, sao lưu AES-256-GCM cả dữ liệu và bản sao tệp, xem trước/khôi phục toàn bộ chỉ cho chủ nền tảng; xuất/nhập gói đầy đủ .mohoc để giữ riêng |

Có sẵn 6 khóa mẫu, 18 bài đọc và quiz mẫu. Không tự tạo mentor giả hoặc kết quả lab giả. Thời lượng học hiển thị là thời lượng bài/phiên đã khai báo, không phải thời gian xem thực tế. Hoàn tất phiên trên lịch không tự đánh dấu hoàn thành bài học.

## Mã nguồn

| Tệp | Vai trò |
| --- | --- |
| `app/page.tsx` | Điều hướng, dashboard, học tập, biên soạn và quản trị |
| `app/features-client.tsx`, `lib/features.ts` | Ngân hàng, báo cáo, CSV, danh mục, cấu trúc nháp, khôi phục học liệu |
| `app/learning-client.tsx`, `lib/learning-services.ts`, `lib/planning.ts` | Kế hoạch, múi giờ, thông báo, cộng đồng |
| `app/advanced-client.tsx`, `lib/advanced-services.ts` | Nhiều quiz, tài khoản, mentor, tra cứu |
| `app/auth-client.tsx`, `lib/auth-services.ts` | Tài khoản riêng, mật khẩu, phiên, duyệt và mã khôi phục |
| `app/marketplace-client.tsx`, `lib/marketplace.ts` | Ví VND, mua khóa học, hàng chờ duyệt, nhật ký |
| `app/commerce-client.tsx`, `lib/commerce-services.ts` | Chứng nhận và đặt giá khóa học |
| `app/social-client.tsx`, `lib/social-services.ts` | Tin nhắn, tệp cách ly, scanner và duyệt thủ công |
| `app/reminder-client.tsx`, `lib/reminder-services.ts`, `lib/web-push.ts` | Nhắc thiết bị, Web Push/VAPID, outbox và xuất lịch RFC 5545 |
| `public/mo-hoc-sw.js`, `public/manifest.webmanifest` | Hiển thị thông báo chung và thêm ứng dụng vào màn hình chính; không cache API riêng tư |
| `app/dialog.tsx` | Dialog dùng chung, bàn phím và focus |
| `app/quiz-client.tsx` | Soạn câu hỏi và xem kết quả dùng chung |
| `app/lab-client.tsx`, `lib/lab-services.ts` | Lab Python và adapter dịch vụ thực thi |
| `lib/operations.ts`, `app/mcp/route.ts` | Backup/restore, tác vụ vận hành và MCP có phân quyền |
| `app/api/[...path]/route.ts` | API, danh tính, kiểm tra quyền, các dịch vụ cốt lõi |
| `db/schema.ts`, `drizzle/` | Schema và migration nối tiếp |
| `tests/` | Kiểm thử API với SQLite/R2 adapter và dịch vụ chạy mã giả lập |
| `docs/OPERATIONS.md` | Cấu hình, sao lưu/khôi phục, nhắc nền và giới hạn vận hành |
| `docs/ACCEPTANCE.md` | Kịch bản nghiệm thu theo vai trò |

## Chạy trên máy cá nhân

Cần Node.js 22.13+ và pnpm đúng phiên bản trong `package.json`.

```sh
pnpm install --frozen-lockfile
```

Với database portable mới, tạo `.dev.vars` chứa `BOOTSTRAP_ADMIN_EMAIL=seedy@sites.test`. Đây là danh tính mô phỏng của starter khi phát triển portable; không phải tài khoản production. Managed preview không mô phỏng đăng nhập. Không commit `.dev.vars` hoặc secret.

```sh
pnpm build
```

Áp dụng **theo thứ tự các tệp `drizzle/*.sql` chưa chạy**. Ví dụ với tệp đầu tiên:

```sh
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0000_cultured_thunderbird.sql
```

Tiếp tục áp dụng các migration từ `0001` đến `0011_course_marketplace.sql` theo thứ tự tên tệp bằng cùng lệnh và đổi `--file`. Nếu database đã áp dụng đến `0010_simulated_payments.sql`, chỉ cần chạy `0011_course_marketplace.sql`. Mỗi migration chạy một lần.

```sh
pnpm dev
pnpm test
pnpm typecheck
pnpm build
```

Dùng URL terminal trả về. Với hosted Sites, migration được áp dụng trước khi Worker mới hoạt động. Giữ nguyên Site ID và bindings `DB`/`BUCKET` trong `.openai/hosting.json`.

## Đăng nhập và phân quyền

Website công khai hỗ trợ tài khoản riêng bằng email/mật khẩu. Tài khoản mới là LEARNER và PENDING, cần quản trị duyệt tại Quản trị → Duyệt tài khoản riêng. Email chỉ được gắn nhãn đã xác minh sau khi dùng liên kết một lần. Hiện gateway chưa được cấu hình nên vẫn dùng duyệt và mã dự phòng. Lúc đăng ký hiển thị 5 mã khôi phục một lần; lưu riêng để đặt lại mật khẩu khi quên. Mật khẩu băm bằng scrypt N32768/r8/p3 với salt riêng; không lưu mật khẩu thuần. Có giới hạn tần suất và số phép băm đồng thời. Phiên lưu token hash trên D1, cookie Secure/HttpOnly/SameSite=Lax. Đổi/khôi phục mật khẩu kết thúc mọi phiên.

Đăng nhập ChatGPT do Sites xác minh vẫn được giữ cho tài khoản/quản trị có sẵn. Người đã đăng nhập ChatGPT có thể chủ động thêm mật khẩu tại Hồ sơ, giữ nguyên ID/dữ liệu/quyền. Tài khoản riêng và ChatGPT không tự liên kết theo email; đăng ký trùng email tài khoản nền tảng cũ bị từ chối; không nhận được quyền ADMIN. Với database mới, cấu hình `BOOTSTRAP_ADMIN_EMAIL` đúng danh tính đã xác minh trước lần đăng nhập quản trị đầu tiên. Khách đầu tiên không thể tự chiếm quyền ADMIN. Không nhận ID/vai trò từ trình duyệt.

Mentor vẫn có thể học và tạo khóa học. Trong Quản trị → Tài khoản, bật quyền mentor, ghi lý do; sau đó người đó vào Kết nối mentor để tạo hồ sơ và mở lịch. Link họp và mục tiêu tư vấn chỉ trả cho hai người tham gia, kể cả tài khoản ADMIN không tham gia cũng không được xem.

## Ghi danh, ví và duyệt khóa học

1. Đăng nhập bằng tài khoản người dùng và mở **Khóa học do tôi tạo → Tạo khóa học**. Thêm ít nhất một bài bắt buộc và một quiz hợp lệ. Giá 0 là miễn phí.
2. Chọn **Gửi duyệt**. Trong **Quản trị viên → Khóa học chờ duyệt**, admin mở khóa để kiểm tra bài học, học liệu và quiz. Admin có thể duyệt để xuất bản hoặc trả về bản nháp kèm lý do. Admin duyệt và xuất bản trực tiếp khóa do mình tạo.
3. Tài khoản khác ghi danh miễn phí hoặc xác nhận mua bằng **Ví VND**. Một lượt mua chuyển toàn bộ giá khóa cho người tạo và cấp quyền học cùng một giao dịch. Ví và **Nhật ký hoạt động** hiển thị kết quả cho từng tài khoản.

Người tạo có thể rút yêu cầu đang chờ để sửa bản nháp. Admin chỉnh sửa khóa đã duyệt. Khóa trả phí do người dùng đăng trước phiên bản này được đưa vào hàng chờ cho các lượt mua mới. Người đã ghi danh tiếp tục học. Dữ liệu đơn hàng cũ được lưu để tương thích với các bản sao lưu.

## Kiểm thử

Chạy `pnpm test` để kiểm thử API với SQLite và bộ nhớ mô phỏng R2. Bộ kiểm thử bao gồm phân quyền, khóa trong hàng chờ, hai lượt mua đồng thời, lỗi ghi danh, nhật ký và khôi phục ví từ bản sao lưu. Xem `docs/ACCEPTANCE.md` để nghiệm thu bằng tài khoản thật.

Runner lab, scanner và cổng gửi email cần được cấu hình riêng. Trợ lý học liệu hiện trích nguồn trong khóa học. Cấu hình dịch vụ nằm trong `docs/OPERATIONS.md`.

## Mới trong 1.5

- Nhắc học ngoài trang bằng Web Push: người học chủ động bật/tắt từng thiết bị, đặt tên, thử thông báo và thu hồi đăng ký.
- Chỉ push nhắc học STUDY; không đẩy tin nhắn/cộng đồng. Màn hình khóa chỉ thấy câu nhắc chung, không có tên khóa, ghi chú hoặc liên kết mentor.
- Hàng đợi tránh gửi lặp sau khi dịch vụ đã nhận; lỗi tạm thời thử lại, tối đa 5 lần. Thiết bị 404/410 được gỡ. Đọc, hủy, ẩn khóa, lưu trữ mục tiêu, tắt nhắc hoặc khóa tài khoản đều ngăn lần gửi tiếp theo. Có thể gửi lặp nếu provider đã nhận nhưng kết nối mất trước phản hồi; notification tag giúp gộp trên thiết bị.
- Xuất file lịch tuần (.ics), UTC giữ đúng thời điểm qua DST; UID ổn định, SEQUENCE, trạng thái hủy và alarm theo lựa chọn nhắc. Đây là file chụp, không phải đồng bộ Google/Apple Calendar.
- Runtime probe kiểm chứng ECDSA, ECDH và AES-GCM mà không gửi thông báo đến ai. Quản trị xem tổng hàng đợi và lỗi.
- Khôi phục dữ liệu xóa đăng ký thiết bị và outbox, buộc opt-in lại; không đưa device credentials vào backup. Backup schema 2 của bản 1.4 vẫn tương thích.

Tham khảo `docs/RELEASE-1.6.1.md`, `docs/RELEASE-1.6.md`, `docs/RELEASE-1.5.md`, `docs/OPERATIONS.md` và `docs/ACCEPTANCE.md`.

## Mới trong 1.6

- Hỏi học liệu dưới dạng hội thoại: tối đa 30 cuộc/khóa, 100 lượt/cuộc; lưu riêng, chống gửi trùng, nguồn từ bài đọc và kiểm tra lại quyền khi mở lịch sử. Chưa có mô hình AI sinh câu trả lời.
- Xác minh email bằng liên kết 24 giờ; đặt lại mật khẩu bằng liên kết 30 phút; token chỉ lưu hash, dùng một lần, hết hạn/khóa tài khoản được kiểm tra; reset kết thúc mọi phiên. Duyệt quản trị vẫn độc lập. HTTP gateway cần cấu hình trước khi gửi thật.
- Gói .mohoc chứa metadata và bản sao học liệu mã hóa, tải/nhập theo stream, giới hạn 128 MiB. Nhập gói không tự khôi phục. Cần cùng khóa mã hóa và cùng chủ nền tảng; không chứa khóa mã hóa. Schema 2 được bổ sung các bảng mới rỗng khi nạp ở 1.6.
- Sao lưu schema 3 bao gồm lịch sử hỏi học liệu và địa chỉ đã xác minh; không bao gồm email token, phiên đăng nhập, đăng ký push/outbox.
- 592 kiểm tra API đã đạt. Chưa nghiệm thu UI có đăng nhập, nhận push trên thiết bị thật, chạy Judge0, scanner hoặc hộp thư thật. Lịch vận hành đang tắt ở lần kiểm tra này, chưa được bật lại.

## Mới trong 1.6.1

Thanh toán chuyển sang mô phỏng trong ứng dụng: chọn khóa có giá → tạo đơn → xác nhận hiểu đây là mô phỏng → chọn thành công/thất bại/hủy. Không cần merchant hoặc khóa VNPay. Thành công mới mở quyền học; thất bại/hủy/hết hạn không ghi danh. Máy chủ chụp giá lúc tạo đơn, kiểm tra chủ đơn và phiên bản, chống gửi lặp và rollback nếu ghi danh lỗi. Một đơn chờ được tiếp tục thay vì tạo trùng; tối đa 10 đơn mới/giờ/người.

Migration 0010 giữ đơn cũ và quyền đã ghi danh, đổi provider mặc định sang SIMULATED và đóng đơn VNPAY_SANDBOX còn PENDING. Callback cũ trả 410 và không thể mở quyền học. Backup schema 3 vẫn tương thích vì tên/thứ tự cột không đổi; đơn cũ khôi phục từ snapshot cũng chỉ dùng xem lịch sử.

Bản 1.6.1 đạt 621 kiểm tra API, TypeScript và production build. Đã kiểm tra migration trên dữ liệu cũ bằng SQLite và D1 cục bộ, gồm giữ đơn PAID/ghi danh và đóng đơn cổng cũ còn chờ.
