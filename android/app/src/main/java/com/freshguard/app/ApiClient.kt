package com.freshguard.app

import android.util.Log
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.io.BufferedReader
import java.io.InputStreamReader
import java.io.OutputStream
import java.net.HttpURLConnection
import java.net.URL

object ApiClient {

    data class Result(
        val ok: Boolean,
        val status: Int,
        val body: JSONObject?,
        val error: String?,
    )

    private const val TAG = "FreshGuardApi"
    private const val TIMEOUT_MS = 15000

    suspend fun postJson(url: String, payload: JSONObject): Result = withContext(Dispatchers.IO) {
        var conn: HttpURLConnection? = null
        try {
            val u = URL(url)
            conn = (u.openConnection() as HttpURLConnection).apply {
                requestMethod = "POST"
                connectTimeout = TIMEOUT_MS
                readTimeout = TIMEOUT_MS
                doOutput = true
                setRequestProperty("Content-Type", "application/json; charset=utf-8")
                setRequestProperty("Accept", "application/json")
                // ngrok 무료 플랜의 첫 접속 경고 페이지 우회용 헤더.
                setRequestProperty("ngrok-skip-browser-warning", "true")
                setRequestProperty("User-Agent", "FreshGuardAndroid/1.0")
            }
            val out: OutputStream = conn.outputStream
            out.write(payload.toString().toByteArray(Charsets.UTF_8))
            out.flush(); out.close()

            val code = conn.responseCode
            val stream = if (code in 200..299) conn.inputStream else conn.errorStream
            val text = stream?.use {
                BufferedReader(InputStreamReader(it, Charsets.UTF_8)).readText()
            } ?: ""

            val json = runCatching { JSONObject(text) }.getOrNull()
            if (code in 200..299) {
                Result(true, code, json, null)
            } else {
                val errMsg = json?.optString("error", "")?.takeIf { it.isNotBlank() } ?: text.takeIf { it.isNotBlank() } ?: "HTTP $code"
                Result(false, code, json, errMsg)
            }
        } catch (e: Exception) {
            Log.w(TAG, "request failed: $url", e)
            Result(false, -1, null, e.message ?: e.javaClass.simpleName)
        } finally {
            conn?.disconnect()
        }
    }
}
