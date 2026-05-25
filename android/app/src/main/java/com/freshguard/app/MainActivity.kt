package com.freshguard.app

import android.Manifest
import android.app.Activity
import android.content.Intent
import android.content.SharedPreferences
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Bundle
import android.provider.MediaStore
import android.view.KeyEvent
import android.view.View
import android.webkit.CookieManager
import android.webkit.PermissionRequest
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.Toast
import androidx.activity.OnBackPressedCallback
import androidx.activity.result.ActivityResultLauncher
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import androidx.core.content.FileProvider
import com.freshguard.app.databinding.ActivityMainBinding
import java.io.ByteArrayInputStream
import java.io.File
import java.net.HttpURLConnection
import java.net.URL

class MainActivity : AppCompatActivity() {

    private lateinit var binding: ActivityMainBinding
    private lateinit var prefs: SharedPreferences

    private var fileChooserCallback: ValueCallback<Array<Uri>>? = null
    private var pendingCameraUri: Uri? = null
    private var pendingPermissionRequest: PermissionRequest? = null

    private val cameraPermissionLauncher: ActivityResultLauncher<String> =
        registerForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
            val req = pendingPermissionRequest
            pendingPermissionRequest = null
            if (req != null) {
                if (granted) req.grant(req.resources) else req.deny()
            } else if (granted) {
                launchCameraIntent()
            } else {
                cancelFileChooser()
                Toast.makeText(this, R.string.camera_permission_denied, Toast.LENGTH_SHORT).show()
            }
        }

    private val fileChooserLauncher: ActivityResultLauncher<Intent> =
        registerForActivityResult(ActivityResultContracts.StartActivityForResult()) { result ->
            val cb = fileChooserCallback ?: return@registerForActivityResult
            fileChooserCallback = null
            if (result.resultCode != Activity.RESULT_OK) {
                cb.onReceiveValue(null)
                pendingCameraUri = null
                return@registerForActivityResult
            }
            val data = result.data
            val uris: Array<Uri>? = when {
                data?.clipData != null -> {
                    val cd = data.clipData!!
                    Array(cd.itemCount) { i -> cd.getItemAt(i).uri }
                }
                data?.data != null -> arrayOf(data.data!!)
                pendingCameraUri != null -> arrayOf(pendingCameraUri!!)
                else -> null
            }
            pendingCameraUri = null
            cb.onReceiveValue(uris)
        }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        prefs = getSharedPreferences(AppConfig.PREFS_NAME, MODE_PRIVATE)

        val phone = prefs.getString(AppConfig.KEY_USER_PHONE, null)
        if (phone.isNullOrBlank()) {
            startActivity(Intent(this, LoginActivity::class.java))
            finish()
            return
        }

        binding = ActivityMainBinding.inflate(layoutInflater)
        setContentView(binding.root)
        // 네이티브 툴바 제거 — 웹앱이 자체 AppBar/BottomTabBar 를 가지므로 풀스크린.

        setupWebView()
        setupBackHandler()

        binding.btnRetry.setOnClickListener { loadServerUrl() }

        // CookieManager 로 fg_user 쿠키 셋 → 서버가 user-scope 데이터로 분리.
        primeCookies(phone)
        loadServerUrl()
    }

    private fun primeCookies(phone: String) {
        val cm = CookieManager.getInstance()
        cm.setAcceptCookie(true)
        cm.setAcceptThirdPartyCookies(binding.webview, true)
        // domain= 명시 없이 host 쿠키로 셋. 같은 origin 모든 path에 부착.
        cm.setCookie(AppConfig.SERVER_URL, "fg_user=$phone; Path=/; Max-Age=${60 * 60 * 24 * 90}; SameSite=Lax")
        cm.flush()
    }

    private fun setupWebView() {
        val web = binding.webview
        val s = web.settings
        s.javaScriptEnabled = true
        s.domStorageEnabled = true
        s.databaseEnabled = true
        s.mediaPlaybackRequiresUserGesture = false
        s.allowFileAccess = false
        s.allowContentAccess = false
        // 시스템의 폰트 크기/디스플레이 스케일이 WebView 레이아웃을 깨뜨리지 않도록 100% 고정.
        s.textZoom = 100
        // 일반 캐시 정책 — ngrok 인터스티셜 쿠키 및 자원이 정상적으로 캐시되어
        // 매번 다시 받지 않도록 함.
        s.cacheMode = android.webkit.WebSettings.LOAD_DEFAULT
        s.loadWithOverviewMode = true
        s.useWideViewPort = true
        s.javaScriptCanOpenWindowsAutomatically = true
        s.setSupportMultipleWindows(false)
        // UA 변경은 Next.js / ngrok 어딘가에서 다른 처리를 유발할 수 있어 제거.

        WebView.setWebContentsDebuggingEnabled(true)

        web.webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                val url = request.url.toString()
                if (url.startsWith("http://") || url.startsWith("https://")) {
                    return false  // 같은 호스트라도 WebView가 자체 처리하게 둠 — 인터셉트는 아래에서.
                }
                val intent = Intent(Intent.ACTION_VIEW, request.url)
                return try {
                    startActivity(intent)
                    true
                } catch (_: Exception) {
                    true
                }
            }

            // CSS/JS/이미지를 비롯한 모든 GET 요청에 ngrok-skip-browser-warning 헤더를 부착하기 위해
            // ngrok 호스트로의 GET 요청만 가로채 우리가 직접 보내고 응답을 반환한다.
            // 이렇게 하지 않으면 메인 프레임만 우회되고 서브리소스가 인터스티셜 HTML로 응답돼
            // 페이지가 무스타일로 그려진다(흰 바탕 + 텍스트만).
            override fun shouldInterceptRequest(view: WebView, request: WebResourceRequest): WebResourceResponse? {
                val host = request.url.host.orEmpty()
                if (!isNgrokHost(host)) return null
                if (!request.method.equals("GET", ignoreCase = true)) return null
                return try {
                    val urlStr = request.url.toString()
                    val conn = (URL(urlStr).openConnection() as HttpURLConnection).apply {
                        requestMethod = "GET"
                        connectTimeout = 15_000
                        readTimeout = 60_000
                        instanceFollowRedirects = false
                        // 원본 요청 헤더 복사 (위험 헤더는 제외)
                        request.requestHeaders.forEach { (k, v) ->
                            val lk = k.lowercase()
                            if (lk !in setOf("host", "content-length", "connection", "transfer-encoding", "cookie")) {
                                setRequestProperty(k, v)
                            }
                        }
                        setRequestProperty("ngrok-skip-browser-warning", "true")
                        // WebView 의 쿠키를 함께 전달
                        CookieManager.getInstance().getCookie(urlStr)?.let { setRequestProperty("Cookie", it) }
                    }

                    val status = conn.responseCode
                    val message = (conn.responseMessage ?: "OK").ifBlank { "OK" }
                    val contentType = conn.contentType ?: ""
                    val mimeType = contentType.substringBefore(";").trim().ifBlank { "application/octet-stream" }
                    val encoding = Regex("charset=([^;\\s]+)", RegexOption.IGNORE_CASE)
                        .find(contentType)?.groupValues?.get(1) ?: "UTF-8"

                    val headers = mutableMapOf<String, String>()
                    conn.headerFields.forEach { (k, v) -> if (k != null) headers[k] = v.joinToString(", ") }

                    // 서버가 내려준 Set-Cookie 를 CookieManager 에 반영 (다음 요청에도 적용되도록)
                    conn.headerFields["Set-Cookie"]?.forEach { sc ->
                        CookieManager.getInstance().setCookie(urlStr, sc)
                    }

                    val stream = (if (status in 200..399) conn.inputStream else conn.errorStream)
                        ?: ByteArrayInputStream(ByteArray(0))

                    WebResourceResponse(mimeType, encoding, status, message, headers, stream)
                } catch (_: Exception) {
                    null  // 실패 시 WebView 기본 로딩으로 폴백
                }
            }
            override fun onReceivedError(view: WebView, request: WebResourceRequest, error: android.webkit.WebResourceError) {
                if (request.isForMainFrame) {
                    showError(getString(R.string.error_load_failed, error.description))
                }
            }
            override fun onPageFinished(view: WebView?, url: String?) {
                // 페이지 로드가 끝나면 누적된 쿠키(예: ngrok abuse_interstitial)를 즉시 디스크에 기록.
                CookieManager.getInstance().flush()
                super.onPageFinished(view, url)
            }
        }

        web.webChromeClient = object : WebChromeClient() {
            override fun onPermissionRequest(request: PermissionRequest) {
                val needsCamera = request.resources.any { it == PermissionRequest.RESOURCE_VIDEO_CAPTURE }
                if (needsCamera && !hasCameraPermission()) {
                    pendingPermissionRequest = request
                    cameraPermissionLauncher.launch(Manifest.permission.CAMERA)
                } else {
                    request.grant(request.resources)
                }
            }

            override fun onShowFileChooser(
                webView: WebView,
                filePathCallback: ValueCallback<Array<Uri>>,
                fileChooserParams: FileChooserParams,
            ): Boolean {
                fileChooserCallback?.onReceiveValue(null)
                fileChooserCallback = filePathCallback

                val wantsCamera = fileChooserParams.isCaptureEnabled
                if (wantsCamera) {
                    if (hasCameraPermission()) launchCameraIntent()
                    else cameraPermissionLauncher.launch(Manifest.permission.CAMERA)
                } else {
                    launchChooserIntent(fileChooserParams)
                }
                return true
            }
        }
    }

    private fun hasCameraPermission(): Boolean {
        return ContextCompat.checkSelfPermission(this, Manifest.permission.CAMERA) ==
            PackageManager.PERMISSION_GRANTED
    }

    private fun launchCameraIntent() {
        val intent = Intent(MediaStore.ACTION_IMAGE_CAPTURE)
        val photoFile = createTempPhotoFile() ?: run { cancelFileChooser(); return }
        val uri = FileProvider.getUriForFile(
            this,
            "${packageName}.fileprovider",
            photoFile,
        )
        pendingCameraUri = uri
        intent.putExtra(MediaStore.EXTRA_OUTPUT, uri)
        intent.addFlags(Intent.FLAG_GRANT_WRITE_URI_PERMISSION)
        try {
            fileChooserLauncher.launch(intent)
        } catch (_: Exception) {
            cancelFileChooser()
        }
    }

    private fun launchChooserIntent(params: WebChromeClient.FileChooserParams) {
        val pick = Intent(Intent.ACTION_GET_CONTENT).apply {
            addCategory(Intent.CATEGORY_OPENABLE)
            type = params.acceptTypes
                .firstOrNull { it.isNotBlank() }
                ?.takeIf { it.contains("/") }
                ?: "image/*"
            if (params.mode == WebChromeClient.FileChooserParams.MODE_OPEN_MULTIPLE) {
                putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true)
            }
        }
        try {
            fileChooserLauncher.launch(Intent.createChooser(pick, getString(R.string.file_chooser_title)))
        } catch (_: Exception) {
            cancelFileChooser()
        }
    }

    private fun cancelFileChooser() {
        fileChooserCallback?.onReceiveValue(null)
        fileChooserCallback = null
        pendingCameraUri = null
    }

    private fun createTempPhotoFile(): File? = try {
        val dir = File(cacheDir, "captures").apply { mkdirs() }
        File.createTempFile("capture_", ".jpg", dir)
    } catch (_: Exception) { null }

    private fun setupBackHandler() {
        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                if (binding.webview.canGoBack()) binding.webview.goBack()
                else finish()
            }
        })
    }

    // 네이티브 툴바를 제거했으므로 메뉴(새로고침/로그아웃)는 뒤로가기 키를 길게 눌러서 호출.
    override fun onKeyLongPress(keyCode: Int, event: KeyEvent?): Boolean {
        if (keyCode == KeyEvent.KEYCODE_BACK) {
            showAppMenu()
            return true
        }
        return super.onKeyLongPress(keyCode, event)
    }

    override fun onKeyDown(keyCode: Int, event: KeyEvent?): Boolean {
        if (keyCode == KeyEvent.KEYCODE_BACK && event != null) {
            event.startTracking()
            return true
        }
        return super.onKeyDown(keyCode, event)
    }

    override fun onKeyUp(keyCode: Int, event: KeyEvent?): Boolean {
        if (keyCode == KeyEvent.KEYCODE_BACK && event != null && !event.isCanceled && !event.isLongPress) {
            // 짧게 누르면 평소처럼 뒤로가기.
            onBackPressedDispatcher.onBackPressed()
            return true
        }
        return super.onKeyUp(keyCode, event)
    }

    private fun showAppMenu() {
        val items = arrayOf(
            getString(R.string.menu_reload),
            getString(R.string.menu_logout),
        )
        AlertDialog.Builder(this)
            .setItems(items) { _, which ->
                when (which) {
                    0 -> binding.webview.reload()
                    1 -> confirmLogout()
                }
            }
            .show()
    }

    private fun loadServerUrl() {
        binding.errorBox.visibility = View.GONE
        binding.webview.visibility = View.VISIBLE
        // 초기 로드 시 ngrok-skip-browser-warning 헤더로 인터스티셜 영구 우회.
        // 이후 ngrok이 abuse_interstitial 쿠키를 셋해서 같은 세션 동안은 자동 통과.
        binding.webview.loadUrl(AppConfig.SERVER_URL, NGROK_BYPASS_HEADERS)
    }

    private fun showError(msg: String) {
        binding.webview.visibility = View.GONE
        binding.errorBox.visibility = View.VISIBLE
        binding.errorMessage.text = msg
    }

    override fun onPause() {
        super.onPause()
        // Activity가 백그라운드로 가기 전에 쿠키를 디스크에 확실히 기록.
        CookieManager.getInstance().flush()
    }

    private fun confirmLogout() {
        AlertDialog.Builder(this)
            .setTitle(R.string.logout_confirm_title)
            .setMessage(R.string.logout_confirm_message)
            .setNegativeButton(R.string.logout_cancel, null)
            .setPositiveButton(R.string.logout_ok) { _, _ -> performLogout() }
            .show()
    }

    private fun performLogout() {
        prefs.edit().remove(AppConfig.KEY_USER_PHONE).apply()
        // 쿠키도 정리
        val cm = CookieManager.getInstance()
        cm.setCookie(AppConfig.SERVER_URL, "fg_user=; Path=/; Max-Age=0")
        cm.flush()
        binding.webview.clearCache(true)
        binding.webview.clearHistory()

        startActivity(Intent(this, LoginActivity::class.java).apply {
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK)
        })
        finish()
    }

    companion object {
        private val NGROK_BYPASS_HEADERS = mapOf("ngrok-skip-browser-warning" to "true")
        private fun isNgrokHost(host: String): Boolean {
            return host.endsWith("ngrok-free.dev") ||
                host.endsWith("ngrok-free.app") ||
                host.endsWith("ngrok.app") ||
                host.endsWith("ngrok.io")
        }
    }
}
