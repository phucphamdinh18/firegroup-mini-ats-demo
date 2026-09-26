# FireGroup Mini ATS — bước đầu của kiến trúc mới

**Luồng đã chốt:** GitHub Pages hiển thị giao diện; Supabase xác nhận tài khoản Google và quản lý vai trò/quyền theo Job ID; Apps Script giữ Dashboard và automation hiện có. Bản này chỉ thử **đăng nhập + quyền theo job + dữ liệu ứng viên giả**. Nó chưa đọc hoặc ghi Sheet, Drive hay CV thật.

## Cần cấu hình một lần

1. Tạo một Supabase project Free. Trong SQL Editor của **project mới**, chạy toàn bộ `pilot-schema.sql`. Tên các bảng đều bắt đầu bằng `pilot_`.
2. Vào Authentication → Providers → Google, bật Google. Ở Google Cloud OAuth web client, thêm đúng **Authorized redirect URI** mà trang Supabase Google provider hiển thị (dạng `https://<project>.supabase.co/auth/v1/callback`). Nhập Google Client ID và **Client Secret trực tiếp vào Supabase**; không đưa secret vào GitHub hoặc gửi qua chat. Authorized JavaScript origin của GitHub Pages là `https://phucphamdinh18.github.io`.
3. Trong Supabase Authentication → URL Configuration, đặt Site URL là `https://phucphamdinh18.github.io/firegroup-mini-ats-demo/` và thêm cả hai Redirect URL: `https://phucphamdinh18.github.io/firegroup-mini-ats-demo/pilot.html` và `https://phucphamdinh18.github.io/firegroup-mini-ats-demo/index.html`.
4. `pilot-config.js` trên nhánh thử nghiệm đã có Project URL và publishable key. Đây là hai giá trị dành cho trình duyệt; tuyệt đối không dùng `service_role`, secret API key, database password hay OAuth client secret. Cấu hình này chưa hiện trên GitHub Pages cho đến khi nhánh được merge.
5. Mở trang `/pilot.html` và đăng nhập Google bằng tài khoản admin. Tài khoản xuất hiện ở trạng thái chờ duyệt. Quay lại SQL Editor, chạy câu lệnh bootstrap admin ở cuối `pilot-schema.sql` (chỉ sau khi email admin đã xuất hiện). Tải lại trang, admin sẽ thấy 3 ứng viên **giả** thuộc hai Job ID giả `FG-1024` và `FG-1022`.
6. Thử bằng tài khoản Google thứ hai: đăng nhập lần đầu → trạng thái chờ; admin duyệt vai trò Recruiter/Hiring Manager/Interviewer và gán `FG-1024` → người thứ hai thấy 2 ứng viên giả của đúng job đó. Thu hồi job hoặc khóa tài khoản → tải lại trang và xác nhận danh sách biến mất.

## Giới hạn an toàn của bước thử

- Các quy tắc RLS trong database quyết định hàng nào được trả về. Việc ẩn nút trên trang web chỉ giúp giao diện dễ dùng; nó không được dùng làm rào chắn bảo mật.
- Trang công khai chỉ chứa dữ liệu ứng viên giả; không đưa CV, lương, email ứng viên hay thông tin từ Sheet production vào các file công khai.
- Supabase chỉ chứa bảng user, job access và ứng viên giả trong bước này. Khi nối Apps Script thật sẽ cần một lớp chuyển tiếp xác thực và bảo vệ endpoint. Việc đăng nhập xong ở trang GitHub **chưa tự tạo kết nối an toàn đến Apps Script**.
- Bảng `User Access` và `Job Team Access` trong Sheet hiện tại không bị sửa. Trước khi dùng dữ liệu thật, cần chốt nguồn quyền duy nhất để tránh Supabase và Sheet cấp quyền khác nhau.
- Không triển khai Cloud Run. Không sửa Apps Script production, Dashboard hoặc trigger.

## Đường dẫn

Sau khi upload: `https://phucphamdinh18.github.io/firegroup-mini-ats-demo/pilot.html`.
