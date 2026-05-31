# Docflare

Quản lý Cloudflare Tunnel cho `localhost` bằng desktop app native (Tauri v2 + React + TypeScript + Rust). Kết nối cổng local (VD: `http://localhost:3000`) ra internet qua tên miền tuỳ chỉnh mà không cần dùng `cloudflared` CLI thủ công.

Token và secrets chỉ lưu trong OS credential manager (Windows Credential Manager / GNOME Keyring / macOS Keychain), không bao giờ ghi ra file JSON plain-text.

## Yêu cầu hệ thống

- **Linux:** `webkit2gtk-4.1`, `libgtk-3-dev`, `libjavascriptcoregtk-4.1-dev`, `libsoup-3.0-dev`, `gnome-keyring` (hoặc trình quản lý secrets tương thích `org.freedesktop.secrets`)
- **macOS:** Xcode Command Line Tools
- **Windows:** WebView2 (đã cài sẵn trên Windows 10+)
- **Node.js** ≥ 18, **Rust** ≥ 1.75

## Releases

Bản cài đặt prebuilt cho cả ba hệ điều hành được tạo tự động qua GitHub Actions cho mỗi git tag `v*.*.*`. App tự cập nhật qua Tauri updater (manifest `latest.json` trên GitHub Releases).

| OS | Kiến trúc | File tải về |
|----|-----------|-------------|
| Windows | x64 | `Docflare_<version>_x64-setup.exe` (installer) |
| Windows | x64 | `Docflare_v.<version>_x64_portable.zip` (portable, không cần cài) |
| macOS | Apple Silicon | `Docflare_<version>_aarch64.dmg` |
| macOS | Intel | `Docflare_<version>_x64.dmg` |
| Linux | x64 | `Docflare_<version>_amd64.deb` |
| Linux | x64 | `Docflare_<version>_amd64.AppImage` |

> Các artifact **không được code-sign** (phân phối nội bộ). Xem ghi chú gatekeeper bên dưới.

### macOS — Gatekeeper

App chưa được notarize, nên lần đầu mở macOS sẽ chặn. Gỡ quarantine bằng lệnh:

```bash
xattr -cr /Applications/Docflare.app
```

Sau đó mở app như bình thường.

### Windows — SmartScreen

Lần đầu chạy installer/portable, SmartScreen có thể cảnh báo "Unknown publisher". Chọn **More info → Run anyway**. Chấp nhận cho phân phối nội bộ.

### Linux — Secret Service (bắt buộc)

Docflare lưu token trong Secret Service (`org.freedesktop.secrets`). Cần một keyring đang chạy, nếu không backend sẽ báo lỗi thân thiện khi lưu profile:

- **Ubuntu/Debian:** `sudo apt install gnome-keyring`
- **Fedora:** `sudo dnf install gnome-keyring`
- **Arch:** `sudo pacman -S gnome-keyring`

AppImage cần FUSE; nếu thiếu, chạy với `--appimage-extract-and-run`.

## Lấy thông tin từ Cloudflare

Trước khi dùng Docflare, bạn cần 3 thông tin từ Cloudflare. Làm theo thứ tự bên dưới.

### 1. Tạo API Token

Token phải được giới hạn phạm vi (scoped), **không dùng Global API Key**.

1. Vào https://dash.cloudflare.com/profile/api-tokens
2. Nhấn **Create Token** → chọn **Create Custom Token**
3. Đặt tên tuỳ ý (VD: `Docflare`)
4. Thiết lập permissions (giao diện Cloudflare hiện tại):

   | Scope | Resource | Permission |
   |-------|----------|------------|
   | Account | Connectivity Directory | Edit |
   | Zone | DNS | Edit |
   | Zone | Zone | Read |

   - **Connectivity Directory / Edit** — quản lý Cloudflare Tunnel (tạo, sửa, xoá tunnel và kết nối service)
   - **DNS / Edit** — tạo và quản lý DNS record trỏ subdomain về tunnel
   - **Zone / Read** — xác minh zone tồn tại và token có quyền truy cập

5. Ở mục **Account Resources**, chọn tài khoản muốn quản lý
6. Ở mục **Zone Resources**, chọn tất cả zone hoặc zone cụ thể
7. Nhấn **Continue to summary** → **Create Token**
8. **Sao chép token ngay** — Cloudflare chỉ hiển thị một lần

> Token mẫu có dạng: `AbCd1234...` (bắt đầu bằng ký tự, không phải `sk-` hay `pk-`)

### 2. Lấy Account ID

1. Vào https://dash.cloudflare.com/
2. Ở sidebar bên trái, chọn tên domain bất kỳ
3. Cuộn xuống cuối trang Overview của domain đó
4. Tìm mục **API** ở sidebar phải → copy **Account ID** (32 ký tự hex)

> Account ID có dạng: `1234567890abcdef1234567890abcdef`

### 3. Lấy Zone ID

1. Vào https://dash.cloudflare.com/ → chọn domain cần dùng cho tunnel
2. Ở trang Overview của domain, tìm mục **API** ở sidebar phải
3. Copy **Zone ID** (32 ký tự hex)

> Zone ID có dạng: `abcdef1234567890abcdef1234567890`

## Cài đặt & chạy

```bash
# Clone repo
git clone <repo-url> docflare
cd docflare

# Cài frontend dependencies
npm install

# Chạy development (frontend + Tauri desktop)
npm run tauri dev

# Hoặc chỉ chạy frontend web (không có keyring/backend)
npm run dev
```

Sau khi chạy `npm run tauri dev`, cửa sổ desktop Docflare sẽ mở ra với giao diện onboarding.

## Sử dụng — Onboarding Cloudflare

Giao diện onboarding có 3 khu vực:

### Khu vực trái — Hướng dẫn

Hiển thị 3 bước cần làm trước khi bắt đầu:
1. Dùng scoped API token, không dùng global key
2. Thêm mọi account và zone bạn muốn chuyển đổi
3. Docflare chỉ lưu metadata cục bộ, token nằm trong OS credential manager

### Form giữa — Thêm profile

Điền các trường:
- **Profile name** (tuỳ chọn): tên gợi nhớ như `Production`, `Staging`, `Client A`
- **API token**: token đã tạo ở bước 1 bên trên
- **Account ID**: 32 ký tự hex từ bước 2
- **Zone ID**: 32 ký tự hex từ bước 3

Nhấn **Test connection and save**. Docflare sẽ:
1. Gọi Cloudflare API để kiểm tra token có quyền truy cập account/zone không
2. Nếu hợp lệ → lưu token vào OS credential manager, metadata vào file JSON
3. Profile mới tự động được đặt làm active

### Khu vực phải — Danh sách profile đã lưu

Sau khi lưu ít nhất một profile:
- Mỗi profile hiển thị dạng card với **masked identifiers** (VD: `1234…cdef`)
- **Active badge** trên profile đang được chọn
- Nút **Set active** để chuyển đổi giữa các profile
- Nút **Delete** để xoá profile (kèm confirm dialog)

Bạn có thể thêm nhiều profile cho các tài khoản/zone khác nhau và chuyển đổi nhanh chóng.

## Kiến trúc thư mục

```
docflare/
├── src/                    # Frontend React + TypeScript
│   ├── features/
│   │   └── onboarding/     # Onboarding UI components & tests
│   ├── lib/
│   │   └── tauri/          # Tauri invoke contracts
│   └── app.tsx             # App root
├── src-tauri/              # Backend Rust
│   ├── src/
│   │   ├── cloudflare/     # Cloudflare API client
│   │   ├── commands/       # Tauri command handlers
│   │   ├── domain/         # DTO models
│   │   ├── error/          # Error types
│   │   ├── services/       # Business logic (validation, mutex-guarded)
│   │   └── store/          # Config file + secret store
│   └── tests/              # Integration tests
├── docs/                   # Tài liệu sản phẩm & kiến trúc
├── plans/                  # Implementation plans
└── package.json            # Frontend scripts
```

## Development

```bash
npm run dev          # Frontend dev server (http://127.0.0.1:5173)
npm run build        # TypeScript check + Vite production build
npm run test         # Chạy frontend tests (Vitest + React Testing Library)
npm run lint         # ESLint check

# Rust backend
cargo test --manifest-path src-tauri/Cargo.toml
cargo build --manifest-path src-tauri/Cargo.toml
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings
```

## Bảo mật

- API token **chỉ lưu trong OS credential manager**, không bao giờ ghi ra JSON config hay log
- Frontend chỉ nhận metadata đã mask (`1234…cdef`), không bao giờ thấy raw token/ID sau khi lưu
- Cloudflare preflight dùng non-mutating GET request — không tạo/sửa/xoá gì trên tài khoản
- Thay thế profile thất bại → giữ nguyên profile cũ + secret cũ
- Lỗi backend không rõ nguyên nhân → frontend hiển thị thông báo chung, không dump `error.message` thô
