# Keep WebView JavaScript interfaces
-keepclassmembers class com.freshguard.app.** {
   @android.webkit.JavascriptInterface <methods>;
}
