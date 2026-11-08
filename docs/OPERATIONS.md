# Vận hành Cloud study platform 1.7.0

## Cấu hình runtime

| Biến | Cách dùng |
| --- | --- |
| `BOOTSTRAP_ADMIN_EMAIL` | Email ChatGPT đã xác minh của quản trị khởi tạo; chỉ dùng khi database chưa có owner |
| `BACKUP_ENCRYPTION_KEY` | Secret base64 đúng 32 byte, lưu trong môi trường hosting; không đưa vào source hoặc lời nhắc tự động |
| `EMAIL_GATEWAY_URL` | Endpoint HTTPS nhận POST gửi email theo hợp đồng bên dưới |
| `EMAIL_GATEWAY_TOKEN` | Bearer secret của gateway email |
| `EMAIL_FROM` | Địa chỉ gửi đã được nhà cung cấp cho phép |
| `AV_SCAN_URL` | Endpoint HTTPS scanner riêng theo hợp đồng bên dưới |
| `AV_SCAN_TOKEN` | Secret Bearer của scanner nếu có |
| `JUDGE0_URL` | URL HTTPS của dịch vụ Judge0 CE do nhóm quản lý hoặc đã được phép sử dụng; không mặc định gửi mã đến dịch vụ công cộng |
| `JUDGE0_TOKEN` | Secret xác thực X-Auth-Token nếu provider yêu cầu |
| `VAPID_PRIVATE_JWK` | Secret JSON JWK EC/P-256 có d/x/y, chỉ dùng ký Web Push ES256 |
| `VAPID_SUBJECT` | URI liên hệ HTTPS hoặc mailto của đơn vị vận hành; website hiện dùng origin HTTPS |

Trên website được bàn giao, khóa backup đã được tạo và lưu ở cấu hình hosting. Bộ source không chứa khóa. Khi triển khai mới, tạo khóa bằng `crypto.randomBytes(32).toString('base64')` trong Node rồi lưu qua công cụ quản lý secret. Giữ khóa trong kho secret do người vận hành kiểm soát. Không đổi hoặc xóa khóa khi còn cần khôi phục backup cũ; bản MVP chưa có nhiều key ID hoặc quy trình rotate khóa. Không có khóa thì không giải mã được bản sao lưu.

## Sao lưu và khôi phục

Vào Quản trị → Vận hành & sao lưu. Nút Tạo bản sao lưu đọc dữ liệu nghiệp vụ từ D1 và tạo bản sao các object học liệu READY/DETACHED/retired trên R2. Cả snapshot JSON và từng bản sao tệp được mã hóa AES-256-GCM bằng IV mới; manifest lưu SHA-256 để kiểm tra toàn vẹn. Phiên đăng nhập, đăng ký push/khóa thiết bị, hàng đợi push, giới hạn tần suất đăng nhập, audit, nhật ký tác vụ, khóa tác vụ và danh sách backup nằm ngoài snapshot để giữ dấu vết vận hành.

Giới hạn đồ án: 3.000 bản ghi, 8 MiB metadata, 100 tệp, 10 MiB/tệp. Bản vượt giới hạn thất bại rõ ràng. Backup thiếu object cũng thất bại; không đánh dấu READY khi thiếu tệp. Nút tải manifest cũ chỉ tải metadata mã hóa: các bản sao học liệu vẫn nằm trên R2 của Site. Đây không phải bản sao ở tài khoản cloud độc lập. Bản 1.6 bổ sung nút tải **gói .mohoc đầy đủ** gồm cả snapshot và các bản sao tệp. Gói này không chứa khóa mã hóa; cần giữ khóa riêng. Hiện chưa tự động chuyển gói sang tài khoản cloud khác.

Chỉ owner được khôi phục toàn nền tảng. Chọn Xem trước khôi phục, kiểm tra thời điểm/số bản ghi/tệp, nhập `KHOI PHUC` trong 10 phút. Token xem trước gắn người dùng và dùng một lần. Checksum, schema và quyền owner phải khớp. Bản khác schema cần chuyển đổi trước, không tự khôi phục qua nhiều phiên bản.

Khôi phục giữ khóa vận hành và khóa bảo trì; từ chối khi còn request đang hoạt động. API nghiệp vụ tạm trả 503 khi khôi phục. Tệp bị thiếu được lấy lại từ bản sao; tệp cùng key nhưng sai checksum làm dừng thao tác để đối soát. Thay thế các bảng nghiệp vụ bằng D1 batch/transaction; lỗi DB rollback toàn bộ. Object mới thêm vào khi khôi phục lỗi được dọn; object mới hơn snapshot được đưa vào hàng đợi giữ thêm 7 ngày. Audit của lần khôi phục ghi cùng transaction. Khôi phục cũng xóa mọi phiên tài khoản riêng và đăng ký thiết bị push, buộc đăng nhập và bật lại nhắc thiết bị. Backup schema 4 lưu cả sổ giao dịch ví và lịch sử duyệt khóa học. Backup schema 2 và 3 được nạp với bảng mới để trống. Token email nằm ngoài snapshot. Khôi phục cũng xóa token email. Backup 1.3 có schema khác, được giữ nhưng cần chuyển đổi trước khi khôi phục ở 1.4. Backup 1.4 đánh dấu schema_version=2 và được tạo lại dù hôm nay đã có backup 1.3.

Thao tác thay thế dữ liệu sẽ mất các thay đổi sau snapshot. Nên tạo backup mới và thử khôi phục trên môi trường riêng trước khi dùng trên production. Không thực hiện khôi phục production để kiểm tra bản bàn giao này. Các kiểm thử khôi phục chạy trên fixture riêng.

Tác vụ vận hành chỉ tạo tối đa một backup READY mỗi ngày UTC nếu cần. Dọn backup READY cũ hơn 7 ngày, luôn giữ ít nhất 7 bản gần nhất; backup FAILED cũ hơn 1 ngày được dọn phần object còn lại. Xử lý tối đa 3 backup cũ mỗi lần, 30 học liệu detached và 30 object retired. Tệp đang gắn vào bài không được dọn.

## Nhắc nền và tác vụ cloud

Công cụ `run_operations` đã được gọi qua kết nối của Site, tạo backup thực tế READY 48 bản ghi ngày 02/11/2026 và đọc lại bằng `operations_status`. Lịch liên kết “Vận hành Mở học hàng giờ” đã từng bật, nhưng khi đọc trạng thái trong đợt 1.6 hiện đang tắt, timezone Asia/Ho_Chi_Minh, automation ID `Automation_e444c99626708191bdfc7ae1e7137c37`. Đã đọc lại lịch sử các lần chạy cloud: 18:32, 19:24 và 20:38 ngày 02/11/2026 (Asia/Ho_Chi_Minh) đều SUCCEEDED; bản sao lưu schema 2 READY. Không đo độ trễ scheduler và không thực hiện restore production.

Dịch vụ lịch từ chối chu kỳ 5 phút và chỉ cho tối đa 1 lần/giờ. Vì vậy dùng lịch hàng giờ cho vận hành và tạo thông báo học đến hạn; nhắc nền không bảo đảm tới trước phiên 15 phút, có thể trễ gần một giờ. Trang mở vẫn cập nhật nhắc trong ứng dụng. Web Push đã có nhưng cần người học cấp quyền và bật từng thiết bị; chưa có email/SMS.

Mỗi lần chạy xử lý nhắc đến hạn cho tối đa 100 người dùng, hết hạn tối đa 100 booking, dọn tệp hết hạn, quét tối đa 3 tệp cộng đồng nếu scanner có cấu hình và backup nếu đến hạn. Có dedupe key và khóa chống chạy chồng. Quyền ADMIN dựa trên danh tính được Sites xác minh; không có secret trong prompt. Không đổi audience của Site. Tác vụ không khôi phục dữ liệu. Nếu cần nhắc nền chính xác hơn một giờ, phải bổ sung scheduler có chu kỳ ngắn hơn ở hạ tầng khác.

Quy tắc mentor: yêu cầu giữ chỗ tối đa 24 giờ hoặc tới giờ bắt đầu, tùy mốc đến trước. Mentor cần xác nhận và cung cấp link họp HTTPS. Yêu cầu hết hạn giải phóng slot tương lai; không tự gia hạn. Người tham gia hủy trước giờ bắt đầu và ghi lý do. Mentor đánh dấu hoàn tất sau giờ kết thúc; chỉ học viên được đánh giá một lần.

## Kết nối lab

Chuẩn bị dịch vụ Judge0 CE riêng có Python 3 (language ID 71), API `/config_info`, `/submissions/batch`. Cấu hình URL và token qua secret/runtime. Provider phải cho phép `enable_network:false` hoặc đã mặc định tắt mạng. Worker từ chối chạy nếu không tắt được mạng; không thực thi mã người học trong Worker.

Mỗi test gửi giới hạn CPU 2 giây, wall 5 giây, bộ nhớ 64 MiB, stack 32 MiB, tệp 512 KiB, một process và một lần chạy. Dịch vụ thực thi phải thực sự áp dụng giới hạn/cách ly; adapter không thay thế cấu hình bảo mật hay cập nhật của provider. Mỗi lab tối đa 5 test. Hai lượt mới/phút/người, 50 lượt/ngày, một lượt đang chạy/người/lab. Chờ kết quả tối đa 2 phút; poll không nhanh hơn 3 giây. Test ẩn không trả input, expected output, stdout hoặc stderr cho người học. Lịch sử mã/kết quả chỉ chủ lượt đọc được.

Các luồng lỗi/kết quả và payload provider đã kiểm thử bằng giả lập. **Chưa có provider production hoặc kiểm chứng chạy mã thật.** Không tự trỏ đến public demo, không giả kết quả. Hướng dẫn API gốc: [Judge0 CE](https://ce.judge0.com/docs).

## Theo dõi

`GET /api/health` là liveness; `/api/health/ready` thực sự đọc D1 và gọi R2 head, trả 503 nếu không sẵn sàng. Trang Vận hành hiển thị lần chạy/backup gần nhất và lỗi. Nhật ký Worker do hosting quản lý; không ghi key, token, mã học viên hoặc nội dung backup vào log. Chưa có cảnh báo gửi ngoài ứng dụng hoặc kiểm thử tải/RPO/RTO.

## Tài khoản riêng

Đăng ký tại mục Đăng nhập/Đăng ký; quản trị duyệt trong Duyệt tài khoản riêng. Đây là duyệt thành viên cho đồ án, không chứng minh quyền sở hữu email. Đăng ký không tự liên kết với tài khoản ChatGPT có sẵn; email đã gắn tài khoản nền tảng cũ được dành riêng. Chủ tài khoản có thể đăng nhập ChatGPT rồi thêm mật khẩu trong Hồ sơ; hành động này giữ đúng ID/quyền/dữ liệu và bỏ qua mọi ID/email do trình duyệt gửi. Mọi tài khoản tự đăng ký luôn là LEARNER. Mã dự phòng chỉ hiển thị một lần; mỗi mã 128 bit ngẫu nhiên, lưu hash và dùng một lần. Quản trị không xem được mật khẩu hoặc mã gốc.

Cookie `__Host-mohoc-session` có HttpOnly, Secure, SameSite=Lax, hạn 7 ngày. DB chỉ giữ hash token. Mật khẩu scrypt N32768/r8/p3, salt riêng, so sánh constant-time; giới hạn một phép băm mỗi Worker isolate để tránh nhân bộ nhớ, trả 503 nếu bận. Tần suất đăng nhập giới hạn theo IP và email; đăng ký theo IP. Đổi mật khẩu, khôi phục, vô hiệu hóa hoặc khôi phục toàn nền tảng đều kết thúc phiên. Chưa có MFA. Luồng email đã có qua HTTP gateway nhưng chưa cấu hình dịch vụ thật.

Nguồn kỹ thuật: [OWASP Password Storage](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html), [Cloudflare node:crypto](https://developers.cloudflare.com/workers/runtime-apis/nodejs/crypto/).

## Ví VND, duyệt khóa học và chứng nhận

Migration `0011_course_marketplace.sql` thêm bảng `wallet_transactions` và `course_review_events`. Ví tính số dư từ tổng tiền vào và tiền ra. Số VND khởi đầu được cấp một lần khi người dùng mở ví. Admin cấp thêm từ **Tài khoản và cấp VND** và nhập lý do.

POST `/api/wallet-buy` nhận ID và phiên bản khóa học. Máy chủ kiểm tra người mua, giá, trạng thái duyệt và số dư. Giao dịch ghi sổ, ghi danh và ghi nhật ký quản trị trong một D1 batch. Ràng buộc người mua và khóa học chống ghi nợ lặp. POST `/api/wallet-grant` gắn yêu cầu cấp VND với ID riêng để gửi lại an toàn.

Người tạo gửi bản nháp và mở trang khóa học để xem trạng thái. Admin kiểm tra nội dung trong hàng chờ trước khi quyết định. Nhật ký cá nhân hiển thị phản hồi. Các endpoint của màn hình đơn hàng cũ trả 410. Các đơn lịch sử và quyền học đã cấp vẫn có trong dữ liệu sao lưu.

Chứng nhận cần ghi danh, hoàn thành tất cả bài bắt buộc (ít nhất 1) và một quiz đạt ≥70. Tên, khóa và kết quả được chụp lúc cấp. Mặc định riêng tư; chủ chứng nhận tự bật/tắt chia sẻ sau thông báo dữ liệu công khai. Có bản in để lưu PDF và trang xác thực trạng thái thu hồi. Quản trị thu hồi kèm lý do/audit. Đây là chứng nhận hoàn thành nội bộ, không phải chứng chỉ nghề nghiệp.

## Tin nhắn và tệp cộng đồng

Tin nhắn chỉ hai thành viên trong cùng khóa được đọc; quản trị không tham gia không được đọc. Hỗ trợ tắt nhận tin, chặn hai chiều, gỡ tin của mình, đã đọc, phân trang. Cập nhật bằng polling 5 giây khi trang hiển thị, không phải WebSocket hoặc push ngoài ứng dụng.

Tệp PDF/PNG/JPEG tối đa 5 MiB, 3 tệp mỗi bài/tin và 20 tệp/ngày/người. Kiểm tra chữ ký/đuôi rồi lưu PENDING ở R2. PENDING/REJECTED không tải qua đường thông thường. Quản trị có đường riêng để tải tệp cách ly nhằm duyệt thủ công, gồm cả tệp đính kèm tin riêng; giao diện nêu rõ điều này trước upload. Duyệt thủ công lưu người, lý do và provenance MANUAL_APPROVED, không giả là quét mã độc. Tệp bị gỡ giữ 7 ngày; tệp bị từ chối cũ hơn 7 ngày từ upload được dọn.

Scanner riêng nhận POST octet-stream, header `X-File-SHA256`, tùy chọn Bearer token. Phải trả JSON `{clean:boolean,sha256:string,engine:string}`. Hash phải khớp đúng byte đã gửi; lỗi/kết quả không hợp lệ giữ PENDING. Tác vụ vận hành xử lý tối đa 3 tệp/lần. Chưa có scanner production, nên dùng duyệt thủ công. Cần bảo đảm scanner được vận hành riêng và thực sự quét; hợp đồng API không tự chứng minh độ an toàn của scanner.

## Web Push và xuất lịch (1.5)

Người học mở Kế hoạch học → Nhắc học trên thiết bị. Chỉ gọi quyền Notification/Push sau khi nhấn Bật trên thiết bị này. Tối đa 5 thiết bị/người; tên thiết bị có thể chọn để dễ thu hồi. Dùng Gửi thử để tự kiểm tra; mỗi thiết bị tối đa một lần/phút. API chỉ trả device ID/tên/trạng thái, không trả endpoint, auth secret hoặc private key. Đăng xuất không tự thu hồi nhắc vì lịch vẫn có thể chạy khi đóng trang; máy dùng chung cần tắt đăng ký trước khi rời máy.

Mỗi tác vụ chạy tạo outbox cho nhắc STUDY còn hiệu lực, chưa đọc và được tạo sau khi thiết bị đăng ký. Chỉ gửi nếu người học còn ghi danh, chưa bị khóa, khóa học còn hiển thị, mục tiêu ACTIVE, phiên PLANNED chưa kết thúc và cài đặt nhắc đang bật. Không gửi thông báo tin nhắn/cộng đồng. Kiểm tra điều kiện lại ngay trước HTTP; nếu người dùng thay đổi đúng lúc provider đã nhận thì không thể thu hồi thông báo đã gửi.

Giới hạn: tối đa 20 lần gửi/tick, 5 request song song, mỗi request timeout 8 giây. Atomic claim chống hai tick lấy cùng item; lease gửi 2 phút. Thử lại lỗi mạng/408/429/5xx với backoff 1–16 giờ, tối đa 5 lần gửi. Lỗi HTTP 4xx khác dừng item; 404/410 xóa đăng ký và các item liên quan. SENT nghĩa provider chấp nhận HTTP 2xx, không chứng minh thiết bị nhận/hiện thông báo. Outbox cũ hơn 7 ngày được dọn. Nếu chấp nhận nhưng mất phản hồi có thể gửi lặp; notification tag giúp gộp.

VAPID và mã hóa dùng Web Crypto P-256, ECDH/HKDF/AES-128-GCM. Test có vector công khai RFC 8291, xác thực JWT/VAPID và chặn endpoint ngoài allowlist. Chỉ gửi tới HTTPS của FCM, Mozilla Autopush, Apple Push hoặc Windows Push; không theo redirect. Thông báo màn hình khóa luôn chung, chỉ mở /#planner cùng origin. Service worker không intercept fetch/cache trang hoặc API.

Tạo khóa riêng cho môi trường triển khai mới, rồi truyền thẳng vào công cụ secret qua stdin. Ví dụ Wrangler đã đăng nhập trên máy quản trị:

```sh
node --input-type=module -e 'const p=await crypto.subtle.generateKey({name:"ECDSA",namedCurve:"P-256"},true,["sign","verify"]);process.stdout.write(JSON.stringify(await crypto.subtle.exportKey("jwk",p.privateKey)))' | pnpm exec wrangler secret put VAPID_PRIVATE_JWK --config dist/server/wrangler.json
```

Cấu hình VAPID_SUBJECT qua công cụ quản lý môi trường. Trên hosted Sites dùng native environment tools và triển khai phiên bản sau khi cập nhật secret; không đặt key trong hosting.json. Không đổi khóa tùy tiện: browser subscription bị ràng buộc public key; sau khi đổi người học cần tắt/bật đăng ký lại. Không đưa VAPID_PRIVATE_JWK vào repo/log.

Trang quản trị có push_runtime.ok: probe ký/kiểm chữ ký và mã hóa ngay trong Worker, không gọi dịch vụ push và không gửi tới người dùng. Queue chỉ hiển thị tổng hợp theo trạng thái. Lỗi cấu hình push không chặn dọn tệp, hết hạn mentor và backup.

Lịch chỉ kiểm tra hàng giờ, do đó push vẫn có thể đến trễ gần một giờ hoặc phiên quá ngắn có thể đã kết thúc trước lần tick nên không được push. Hệ điều hành còn có thể trì hoãn/chặn. .ics chứa alarm để ứng dụng lịch tự nhắc, nhưng người dùng phải nhập file và cho phép nhắc; không tự đồng bộ hay tự sửa lịch ngoài Mở học. File tuần yêu cầu phiên đăng nhập, giới hạn 93 ngày/1.000 phiên, chỉ lấy lịch của chính người học và không gồm ghi chú, email, link họp riêng.

Trên iOS/iPadOS: thêm website vào Màn hình chính rồi mở ứng dụng đã thêm để bật push. Manifest standalone được cung cấp; không có chế độ học offline.

Nguồn giao thức: [RFC 8291](https://www.rfc-editor.org/rfc/rfc8291.html), [RFC 8292](https://www.rfc-editor.org/rfc/rfc8292.html), [RFC 5545](https://www.rfc-editor.org/rfc/rfc5545.html), [WebKit Web Push](https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/).

## Email tài khoản (1.6)

Đặt EMAIL_GATEWAY_URL, EMAIL_GATEWAY_TOKEN và EMAIL_FROM trên hosting, rồi triển khai lại để áp dụng. Đây là hợp đồng gateway riêng, không phải tự động tương thích mọi API email. Gateway cần nhận POST JSON `{from,to,subject,text,idempotency_key}`, Bearer token và header Idempotency-Key; trả HTTP 2xx chỉ khi đã nhận thư để gửi. Nên lưu idempotency key để tránh gửi lặp khi có retry. Không in token/liên kết vào log. Có timeout 8 giây và không theo redirect. Chưa có SMTP client hoặc gateway production được triển khai trong đợt này.

Đăng ký có thể gửi email VERIFY nếu gateway sẵn sàng, nhưng tài khoản vẫn PENDING cho tới khi được quản trị duyệt. Người dùng có thể yêu cầu gửi lại xác minh hoặc đặt lại mật khẩu tại trang đăng nhập. Liên kết nằm trong fragment #auth/verify/TOKEN hoặc #auth/reset/TOKEN; không thực thi khi chỉ GET/preview liên kết. Giao diện xóa fragment token khỏi lịch sử ngay khi đọc vào bộ nhớ, người dùng chủ động xác nhận.

Token ngẫu nhiên 256 bit, lưu SHA-256; VERIFY 24 giờ, RESET 30 phút. Reset chỉ cho tài khoản ACTIVE không bị khóa, gắn phiên bản thông tin đăng nhập; dùng thành công sẽ đổi mật khẩu, tăng version, xóa tất cả phiên và token email. Xác minh email không tự cấp quyền hay tự liên kết tài khoản. Phản hồi gửi lại/quên mật khẩu giống nhau cho email có và không có tài khoản; giới hạn 3 yêu cầu/địa chỉ/giờ và 10/IP/giờ. Khi gateway chưa cấu hình, API báo 503 và vẫn có mã dự phòng. HTTP 2xx của gateway không chứng minh thư đã tới hộp thư.

## Sao lưu di chuyển đầy đủ (1.6)

Gói .mohoc dùng envelope MOHOC-BACKUP-1, header JSON có giới hạn, snapshot AES-GCM và các object AES-GCM. Tải và nhập theo stream, tổng tối đa 128 MiB, 100 tệp, 10 MiB/tệp, 8 MiB metadata và 3.000 bản ghi. API: GET /api/backup-export/ID dành cho ADMIN; POST /api/backup-import (application/octet-stream, X-Mo-Hoc: 1) chỉ cho owner. Nhập xác minh AEAD, checksum, kích thước, schema và owner, không tin đường dẫn từ header; từ chối dữ liệu thiếu/dư và dọn object nhập dở nếu thất bại.

Gói không chứa khóa mã hóa. Môi trường đích cần cùng BACKUP_ENCRYPTION_KEY, cùng danh tính owner và schema hiện tại. Nhập thành công chỉ thêm backup READY với ID mới; chưa thay thế bất kỳ bảng nghiệp vụ hoặc tệp đang hoạt động. Sau đó mới dùng Xem trước/nhập KHOI PHUC theo quy trình hiện có. Không coi việc tải manifest cũ là tải đầy đủ học liệu. Chưa diễn tập mất toàn bộ tài khoản cloud; chưa có sao lưu tự động sang tài khoản độc lập.
