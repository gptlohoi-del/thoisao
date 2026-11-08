package vn.nhac.offline;

import android.app.Activity;
import android.content.Intent;
import android.content.ActivityNotFoundException;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.provider.Settings;
import android.graphics.Color;
import android.view.View;
import android.view.WindowInsets;
import android.webkit.JavascriptInterface;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebChromeClient;
import android.widget.Toast;

import androidx.core.content.FileProvider;
import androidx.webkit.WebViewAssetLoader;
import androidx.webkit.WebViewClientCompat;

import org.json.JSONObject;

import java.io.ByteArrayInputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.FilterInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.HashMap;
import java.util.Locale;
import java.util.Map;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

public final class MainActivity extends Activity {
    private static final String INTERNAL_ORIGIN = "https://appassets.androidplatform.net";
    private static final String START_PAGE = INTERNAL_ORIGIN + "/assets/www/index.html";
    private static final int REQUEST_EXPORT_SRT = 41;
    private static final int MAX_APK_BYTES = 300 * 1024 * 1024;
    private static final Pattern APK_NAME = Pattern.compile("NHAC-V\\d+\\.\\d+\\.\\d+\\.apk");
    private static final Pattern GITHUB_RELEASE = Pattern.compile("^/[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+/releases/download/[^/]+/NHAC-V\\d+\\.\\d+\\.\\d+\\.apk$");
    private static final Pattern RANGE = Pattern.compile("bytes=(\\d+)-(\\d*)");

    private final ExecutorService downloadWorker = Executors.newSingleThreadExecutor();
    private WebView webView;
    private byte[] pendingSrt;
    private File pendingApk;
    private boolean pageLoaded = false;

    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        getWindow().setStatusBarColor(Color.rgb(40, 70, 94));
        getWindow().setNavigationBarColor(Color.rgb(40, 70, 94));
        webView = new WebView(this);
        webView.setBackgroundColor(Color.rgb(242, 245, 248));
        setContentView(webView);
        // Android 15 edge-to-edge: keep content outside status/navigation bars.
        webView.setOnApplyWindowInsetsListener((view, insets) -> {
            view.setPadding(insets.getSystemWindowInsetLeft(), insets.getSystemWindowInsetTop(),
                insets.getSystemWindowInsetRight(), insets.getSystemWindowInsetBottom());
            return insets;
        });
        WebSettings ws = webView.getSettings();
        ws.setJavaScriptEnabled(true);
        ws.setDomStorageEnabled(true);
        ws.setAllowFileAccess(false);
        ws.setAllowContentAccess(false);
        ws.setAllowFileAccessFromFileURLs(false);
        ws.setAllowUniversalAccessFromFileURLs(false);
        ws.setMediaPlaybackRequiresUserGesture(true);
        ws.setJavaScriptCanOpenWindowsAutomatically(false);
        webView.setWebChromeClient(new WebChromeClient());
        webView.addJavascriptInterface(new NativeBridge(), "Android");
        WebViewAssetLoader loader = new WebViewAssetLoader.Builder()
                .addPathHandler("/assets/", new WebViewAssetLoader.AssetsPathHandler(this))
                .build();
        webView.setWebViewClient(new WebViewClientCompat() {
            @Override public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                Uri url = request.getUrl();
                if ("appassets.androidplatform.net".equals(url.getHost()) && url.getPath() != null &&
                    url.getPath().startsWith("/assets/www/audio/") && url.getPath().endsWith(".mp3")) {
                    return serveMp3Range(url, request.getRequestHeaders().get("Range"));
                }
                return loader.shouldInterceptRequest(url);
            }
            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                return handleNavigation(request.getUrl());
            }
            @Override public void onPageFinished(WebView view, String url) {
                if (url.startsWith(INTERNAL_ORIGIN + "/assets/www/")) pageLoaded = true;
            }
        });
        webView.loadUrl(START_PAGE);
    }

    private boolean handleNavigation(Uri uri) {
        if ("https".equals(uri.getScheme()) && "appassets.androidplatform.net".equals(uri.getHost()) &&
                uri.getPath() != null && uri.getPath().startsWith("/assets/www/")) return false;
        if ("https".equals(uri.getScheme())) {
            try { startActivity(new Intent(Intent.ACTION_VIEW, uri)); } catch (Exception ignored) { }
        }
        // Never load untrusted web content inside the WebView with Android JS bridge.
        return true;
    }

    // MP3 in the APK is uncompressed. Explicit HTTP byte ranges allow seeking/repeating offline.
    private WebResourceResponse serveMp3Range(Uri uri, String rangeHeader) {
        String filename = uri.getLastPathSegment();
        if (filename == null || !filename.matches("[a-z0-9-]+\\.mp3")) return null;
        try {
            android.content.res.AssetFileDescriptor fd = getAssets().openFd("www/audio/" + filename);
            long length = fd.getLength();
            long start = 0, end = length - 1;
            boolean partial = false;
            Matcher match = RANGE.matcher(rangeHeader == null ? "" : rangeHeader);
            if (match.matches()) {
                start = Long.parseLong(match.group(1));
                if (!match.group(2).isEmpty()) end = Math.min(end, Long.parseLong(match.group(2)));
                partial = true;
            }
            if (start < 0 || start >= length || end < start) {
                fd.close();
                WebResourceResponse invalid = new WebResourceResponse("audio/mpeg", null, new ByteArrayInputStream(new byte[0]));
                invalid.setStatusCodeAndReasonPhrase(416, "Range Not Satisfiable");
                Map<String, String> headers = new HashMap<>();
                headers.put("Content-Range", "bytes */" + length);
                invalid.setResponseHeaders(headers);
                return invalid;
            }
            InputStream input = fd.createInputStream();
            long remaining = start;
            while (remaining > 0) {
                long moved = input.skip(remaining);
                if (moved <= 0) throw new IOException("Cannot seek MP3 asset");
                remaining -= moved;
            }
            WebResourceResponse response = new WebResourceResponse("audio/mpeg", null,
                new BoundedInput(input, end - start + 1));
            Map<String, String> headers = new HashMap<>();
            headers.put("Accept-Ranges", "bytes");
            headers.put("Content-Length", String.valueOf(end - start + 1));
            if (partial) {
                headers.put("Content-Range", "bytes " + start + "-" + end + "/" + length);
                response.setStatusCodeAndReasonPhrase(206, "Partial Content");
            }
            response.setResponseHeaders(headers);
            return response;
        } catch (Exception e) {
            return null;
        }
    }
    private static final class BoundedInput extends FilterInputStream {
        private long remaining;
        BoundedInput(InputStream input, long limit) { super(input); remaining = limit; }
        @Override public int read() throws IOException {
            if (remaining <= 0) return -1;
            int x = super.read(); if (x >= 0) remaining--; return x;
        }
        @Override public int read(byte[] buffer, int off, int len) throws IOException {
            if (remaining <= 0) return -1;
            int n = super.read(buffer, off, (int)Math.min(len, remaining));
            if (n > 0) remaining -= n;
            return n;
        }
    }

    private void js(String expression) {
        runOnUiThread(() -> { if (pageLoaded && webView != null) webView.evaluateJavascript(expression, null); });
    }
    private void toast(String message) {
        runOnUiThread(() -> Toast.makeText(this, message, Toast.LENGTH_LONG).show());
    }
    private static String javascriptString(String message) { return JSONObject.quote(message == null ? "Không rõ lỗi" : message); }

    private final class NativeBridge {
        @JavascriptInterface public String getVersionName() { return BuildConfig.VERSION_NAME; }
        @JavascriptInterface public void exportSrt(String filename, String contents) {
            if (filename == null || !filename.toLowerCase(Locale.ROOT).endsWith(".srt") ||
                    filename.contains("/") || filename.contains("\\") || contents == null) {
                js("window.NhacNative.onExportResult(false)"); return;
            }
            runOnUiThread(() -> {
                pendingSrt = contents.getBytes(StandardCharsets.UTF_8);
                Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT);
                intent.addCategory(Intent.CATEGORY_OPENABLE);
                intent.setType("application/x-subrip");
                intent.putExtra(Intent.EXTRA_TITLE, filename);
                try { startActivityForResult(intent, REQUEST_EXPORT_SRT); }
                catch (ActivityNotFoundException e) { pendingSrt = null; js("window.NhacNative.onExportResult(false)"); }
            });
        }
        @JavascriptInterface public void downloadApk(String url, String name, String digest) {
            try {
                if (!APK_NAME.matcher(name).matches()) throw new IllegalArgumentException("Tên APK không đúng định dạng NHAC-Vx.y.z.apk");
                URL source = new URL(url);
                if (!"https".equals(source.getProtocol()) || !"github.com".equalsIgnoreCase(source.getHost()) ||
                        !GITHUB_RELEASE.matcher(source.getPath()).matches() || !source.getPath().endsWith("/" + name)) {
                    throw new IllegalArgumentException("Chỉ hỗ trợ APK từ GitHub Releases.");
                }
                if (digest != null && !digest.isEmpty() && !digest.matches("(?i)^sha256:[0-9a-f]{64}$")) {
                    throw new IllegalArgumentException("Mã kiểm tra SHA-256 không hợp lệ.");
                }
                downloadWorker.execute(() -> downloadAndInstall(source, name, digest));
            } catch (Exception e) {
                js("window.NhacNative.onDownloadError(" + javascriptString(e.getMessage()) + ")");
            }
        }
    }

    @Override protected void onActivityResult(int request, int result, Intent data) {
        super.onActivityResult(request, result, data);
        if (request == REQUEST_EXPORT_SRT) {
            boolean success = false;
            if (result == RESULT_OK && data != null && data.getData() != null && pendingSrt != null) {
                try (OutputStream out = getContentResolver().openOutputStream(data.getData())) {
                    if (out != null) { out.write(pendingSrt); out.flush(); success = true; }
                } catch (Exception e) { toast("Không lưu được SRT: " + e.getMessage()); }
            }
            pendingSrt = null;
            js("window.NhacNative.onExportResult(" + success + ")");
        }
    }

    private void downloadAndInstall(URL url, String filename, String sha256) {
        File dir = new File(getCacheDir(), "updates");
        if (!dir.isDirectory() && !dir.mkdirs()) {
            js("window.NhacNative.onDownloadError('Không tạo được thư mục lưu APK')"); return;
        }
        File apk = new File(dir, filename);
        File part = new File(dir, filename + ".part");
        HttpURLConnection connection = null;
        try {
            connection = (HttpURLConnection)url.openConnection();
            connection.setConnectTimeout(15000); connection.setReadTimeout(30000);
            connection.setInstanceFollowRedirects(true);
            connection.setRequestProperty("User-Agent", "Nhac-Android-Updater/1.0");
            if (connection.getResponseCode() != HttpURLConnection.HTTP_OK) throw new IOException("HTTP " + connection.getResponseCode());
            long announced = connection.getContentLengthLong();
            if (announced > MAX_APK_BYTES) throw new IOException("APK vượt quá giới hạn 300 MB");
            MessageDigest hash = MessageDigest.getInstance("SHA-256");
            long count = 0;
            int lastProgress = -1;
            try (InputStream in = connection.getInputStream(); FileOutputStream out = new FileOutputStream(part)) {
                byte[] buffer = new byte[32 * 1024];
                for (int n; (n = in.read(buffer)) != -1;) {
                    count += n;
                    if (count > MAX_APK_BYTES) throw new IOException("APK vượt quá giới hạn 300 MB");
                    out.write(buffer, 0, n); hash.update(buffer, 0, n);
                    if (announced > 0) {
                        int percent = (int)(count * 100 / announced);
                        if (percent >= lastProgress + 5 || percent == 100) {
                            lastProgress = percent;
                            js("window.NhacNative.onDownloadProgress(" + percent + ")");
                        }
                    }
                }
            }
            if (count < 1024) throw new IOException("APK tải về quá nhỏ/không hợp lệ");
            if (sha256 != null && !sha256.isEmpty()) {
                StringBuilder computed = new StringBuilder("sha256:");
                for (byte b : hash.digest()) computed.append(String.format(Locale.ROOT, "%02x", b & 0xff));
                if (!computed.toString().equalsIgnoreCase(sha256)) throw new IOException("Sai SHA-256: bản tải về không khớp Release");
            }
            if (apk.exists() && !apk.delete()) throw new IOException("Không thay được APK cũ");
            if (!part.renameTo(apk)) throw new IOException("Không lưu được file APK");
            runOnUiThread(() -> {
                pendingApk = apk;
                js("window.NhacNative.onDownloadComplete()");
                tryInstallPending();
            });
        } catch (Exception e) {
            if (part.exists()) part.delete();
            js("window.NhacNative.onDownloadError(" + javascriptString(e.getMessage()) + ")");
        } finally {
            if (connection != null) connection.disconnect();
        }
    }
    private void tryInstallPending() {
        if (pendingApk == null || !pendingApk.isFile()) return;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && !getPackageManager().canRequestPackageInstalls()) {
            toast("Cho phép Nhac cài ứng dụng từ nguồn này, rồi quay lại để cập nhật.");
            try {
                startActivity(new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                        Uri.parse("package:" + getPackageName())));
            } catch (Exception e) { toast("Vui lòng cấp quyền cài APK trong Cài đặt Android."); }
            return;
        }
        File apk = pendingApk;
        pendingApk = null;
        Uri uri = FileProvider.getUriForFile(this, getPackageName() + ".fileprovider", apk);
        Intent install = new Intent(Intent.ACTION_VIEW);
        install.setDataAndType(uri, "application/vnd.android.package-archive");
        install.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
        try { startActivity(install); }
        catch (Exception e) { toast("Không mở được bộ cài APK: " + e.getMessage()); }
    }
    @Override protected void onResume() {
        super.onResume();
        if (pendingApk != null && getPackageManager().canRequestPackageInstalls()) tryInstallPending();
        if (pageLoaded) js("window.NhacApp.checkForUpdates(false)");
    }
    @Override public void onBackPressed() {
        if (webView == null || !pageLoaded) { super.onBackPressed(); return; }
        webView.evaluateJavascript("window.NhacApp.closeTopDialog()", result -> {
            if (!"true".equals(result)) MainActivity.super.onBackPressed();
        });
    }
    @Override protected void onDestroy() {
        if (webView != null) {
            webView.loadUrl("about:blank");
            webView.removeJavascriptInterface("Android");
            webView.destroy();
            webView = null;
        }
        downloadWorker.shutdownNow();
        super.onDestroy();
    }
}
