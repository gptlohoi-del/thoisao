# Nhac — Full Repo Android APK offline + SRT + OTA đơn giản

**Ứng dụng:** Nhac · **Mã nguồn hiện tại:** v1.0.1 · **APK được GitHub tạo:** `NHAC-V1.0.1.apk`.

## Bạn chỉ cần làm gì? (không cần Android Studio)

**Bước 1 — Một lần duy nhất: chuẩn bị khóa ký Nhac.** GitHub có `GITHUB_TOKEN` để *đăng* bản phát hành, nhưng **không có sẵn khóa ký Android**. Android cần giữ nguyên khóa ký qua các bản APK để cập nhật mà không phải gỡ ứng dụng và mất dữ liệu.

- Tải / giải nén full repo, đưa nội dung repo lên **repository GitHub công khai** của bạn. (GitHub Actions phải được bật.)
- Trên máy Windows có Java JDK 17, nhấp đúp `scripts/tao-khoa-ky-windows.bat` **một lần**. Nếu dùng Linux/macOS có JDK, Python 3 và OpenSSL: chạy `bash scripts/tao-khoa-ky-linux-macos.sh`.
- Script tự tạo khóa và lưu ở **Documents/NHAC-KHOA-KY** trên Windows, hoặc **~/NHAC-KHOA-KY** trên Linux/macOS, KHÔNG nằm trong repo. Mở file `NHAC_SIGNING_BUNDLE.txt`, copy toàn bộ nội dung.
- Vào GitHub repository → **Settings → Secrets and variables → Actions → New repository secret**. Đặt **Name:** `NHAC_SIGNING_BUNDLE`. Dán nội dung vừa copy vào **Secret**, nhấn **Add secret**. **Chỉ một secret này**, không cần nhập 4 mục như phiên bản repo cũ.
- **Sao lưu và giữ kín** thư mục `NHAC-KHOA-KY`. Không gửi file `.p12`, `.txt` hoặc nội dung khóa cho ai; không upload vào git. Nếu làm mất khóa mà GitHub Secret cũng không thể phục hồi, bạn không thể tiếp tục ký bản mới bằng cùng khóa.

**Bước 2 — Mỗi khi muốn có APK mới (chỉ khoảng ba thao tác trên GitHub):**

1. Vào repository → **Actions** → **Phat hanh APK Nhac (OTA)** → **Run workflow**.
2. Nhập phiên bản, ví dụ lần đầu `1.0.1`, lần sau `1.0.2`. Nhấn nút chạy.
3. Khi job thành công, vào **Releases**: GitHub đã đăng file `NHAC-V1.0.1.apk` / `NHAC-V1.0.2.apk` chính thức. Mở trên điện thoại và cài bản đầu tiên.

**Bước 3 — OTA trên điện thoại:** mở Nhac khi có mạng, app tự kiểm tra GitHub Releases (tối đa mỗi 24 giờ) hoặc bấm nút **OTA** ở màn hình chính. Nếu có bản mới, bấm **Tải & cài APK**, rồi **xác nhận cài đặt theo yêu cầu Android**. Việc cài đặt không thể diễn ra hoàn toàn âm thầm. Máy offline vẫn nghe nhạc và sửa SRT bình thường.

**Không cần:** tạo tag Git, sửa thủ công versionCode/versionName, nhập GitHub owner/repo trong ứng dụng, tạo máy chủ OTA, WorkManager, GitHub token cho app. Trong workflow, GitHub tự lấy tên repository, tự sửa số phiên bản và tự dùng `GITHUB_TOKEN` tích hợp để đăng Release. Repo phải **công khai** để app kiểm tra bản phát hành mà không cần đăng nhập. Bạn vẫn có thể nhập owner/repo trong phần Cài đặt nếu build APK ngoài GitHub Actions.

## Đã sửa lỗi GitHub Actions: `Failed to find package 'tools'`

Nếu bản repo cũ của bạn bị dừng ở bước `android-actions/setup-android@v3` và báo lỗi `sdkmanager tools`, hãy thay **cả hai** file `.github/workflows/ci.yml` và `.github/workflows/release.yml` bằng phiên bản trong repo này.

Nguyên nhân: Google đã ngừng cung cấp gói SDK cũ `tools`. Repo này chuyển sang `android-actions/setup-android@v4` và chỉ cài `platform-tools`. Đây là lỗi ở bước thiết lập môi trường, không phải lỗi khóa ký/SRT. Không phải tạo lại khóa ký; giữ nguyên GitHub Secret `NHAC_SIGNING_BUNDLE`.

Nếu đã upload bản cũ lên GitHub: mở từng file workflow trên GitHub và cập nhật 2 file, commit, rồi chạy lại **Actions → Phat hanh APK Nhac (OTA)**. Nếu release v1.0.1 chưa được tạo, có thể tiếp tục chọn `1.0.1`. Nếu release v1.0.1 đã tồn tại thì dùng số phiên bản mới cao hơn.

**Lưu ý:** Đã xác định và khắc phục nguyên nhân trong log được gửi. Chưa thể xác nhận build APK thành công trên runner GitHub khi chưa chạy Actions thực tế.

## Các chức năng giữ nguyên theo yêu cầu

- Đóng gói 2 bài MP3/SRT gốc để nghe offline; không cần `IPA.txt`, không tự can thiệp mốc SRT bị chồng nhau.
- Phát MP3, hiện câu SRT theo thời gian, chọn/lặp danh sách câu; **đã bỏ lặp A–B**.
- Tốc độ có thanh trượt và nút `−`, `+` ngay màn hình chính. Mọi thanh trượt dài **tối đa 50%** chiều ngang điện thoại.
- Cài đặt các giá trị Min/Max/Default/Step, cỡ chữ, in đậm và nội dung trong danh sách câu.
- Bấm ✎ để sửa chữ và thời gian SRT trực tiếp; lưu offline trong app. Bấm **Xuất file SRT** để xuất `.srt` đúng tên file gốc, sau đó **bạn tự upload lên GitHub**.
- Không tự upload SRT; không thêm các tính năng khác bạn đã từ chối.

## Lưu ý rất quan trọng

- **Không dùng APK debug để cài lâu dài**. APK debug từ CI dùng khóa ký thử có thể khác với APK release, Android sẽ không cho cập nhật đè. Bạn nên bắt đầu bằng APK tải từ **GitHub Releases** (workflow ký khóa cố định).
- Giữ nguyên package ID `vn.nhac.offline` và khóa ký giữa các bản phát hành. Các bản OTA dùng cùng khóa sẽ không yêu cầu gỡ app cũ; ứng dụng vẫn cần được Android chấp thuận khi cài.
- SRT sửa offline được lưu trong bộ nhớ ứng dụng. Trước khi gỡ app, xóa dữ liệu, đổi điện thoại, hãy **Xuất file SRT**. Repo GitHub không nhận file SRT từ điện thoại tự động.
- **Chỉnh code không tự đẩy vào điện thoại:** sau mỗi thay đổi, push code lên GitHub rồi chạy workflow phát hành với phiên bản cao hơn.
- **OTA cần mạng**. Phát nhạc/SRT, sửa và xuất file SRT không cần mạng.

## Cấu trúc mã nguồn

```text
app/src/main/assets/www/     index.html, styles.css, app.js, srt.js, tracks.json,
                             app-config.json, audio/*.mp3, subtitles/*.srt
app/src/main/java/vn/nhac/offline/MainActivity.java
                             WebView offline, lưu file SRT, tải APK OTA
.github/workflows/ci.yml     Kiểm tra và build APK debug để thử
.github/workflows/release.yml  Một nút phát hành APK ký + GitHub OTA
scripts/prepare_release.py   Tự đổi version, gắn địa chỉ OTA, nạp khóa GitHub Secret
scripts/tao-khoa-ky-windows.bat
scripts/tao-khoa-ky-windows.ps1
scripts/tao-khoa-ky-linux-macos.sh
                             Tạo khóa ký một lần, không gửi khóa vào repo
```

## Cho người biết kỹ thuật

- Java 17, AGP 8.9.2, Gradle 8.11.1, compileSdk/targetSdk 35, minSdk 26.
- Bộ tự động GitHub: `workflow_dispatch` nhận `version` dạng `X.Y.Z`; tính `versionCode = major*1000000 + minor*1000 + patch`, cập nhật `versionName`, `app-config.json` và đường dẫn OTA của repo hiện tại. Mỗi thành phần phiên bản phải nhỏ hơn 1000.
- `NHAC_SIGNING_BUNDLE` là một JSON đã Base64 hóa, chứa keystore PKCS#12 đã Base64 hóa, mật khẩu và alias. Chỉ lưu **trong GitHub Actions Secrets**; không commit hoặc đưa vào Releases. Vì JSON mang cả khóa và mật khẩu, ai có nội dung Secret đều có thể ký APK thay bạn.
- Khi build trực tiếp bằng máy: dùng các biến môi trường `NHAC_KEYSTORE_FILE`, `NHAC_KEYSTORE_PASSWORD`, `NHAC_KEY_ALIAS`, `NHAC_KEY_PASSWORD` rồi chạy `./gradlew :app:assembleRelease`. Script `gradlew` là bootstrap script (không phải Gradle Wrapper JAR thông thường). Android SDK/JDK cần cài sẵn.
- Xuất SRT bằng Android Storage Access Framework; dữ liệu SRT lưu localStorage của WebView. Android 8+ (API 26+) được hỗ trợ. OTA qua public `https://api.github.com/repos/OWNER/REPO/releases/latest` và GitHub Release asset `NHAC-Vx.y.z.apk`.
- Các file `.p12`, `.jks`, `.keystore`, `NHAC_SIGNING_BUNDLE.txt` được gitignore; hãy cẩn thận **không** đưa các tệp khóa vào repo hoặc đính kèm khi nhờ người khác hỗ trợ.

## Kiểm tra

```bash
node --test tests/*.test.js
# Hoặc chạy giao diện thử bằng web server local:
python3 -m http.server 8888 --directory app/src/main/assets/www
```

**Tình trạng xác thực:** đã kiểm thử parser SRT trên môi trường tạo repo; **chưa build APK thật hoặc chạy thử Android** trong môi trường này vì không có Android SDK/Gradle. GitHub Actions sẽ thực hiện bước build; nếu có lỗi thực tế, cần dựa trên log Actions để sửa. Chưa có APK cài đặt trong file ZIP này — đây là full mã nguồn.
