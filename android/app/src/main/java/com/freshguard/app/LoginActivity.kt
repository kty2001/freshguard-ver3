package com.freshguard.app

import android.content.Intent
import android.os.Bundle
import android.view.View
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import com.freshguard.app.databinding.ActivityLoginBinding

class LoginActivity : AppCompatActivity() {

    private lateinit var binding: ActivityLoginBinding

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityLoginBinding.inflate(layoutInflater)
        setContentView(binding.root)

        // 인증번호 단계 제거 — 첫 화면(전화번호 입력)만 사용.
        binding.flipper.displayedChild = 0
        binding.editPhone.requestFocus()

        binding.btnSendCode.setOnClickListener { performLogin() }
    }

    private fun performLogin() {
        val raw = binding.editPhone.text?.toString()?.trim().orEmpty()
        val digits = raw.replace(Regex("[^0-9]"), "")
        if (digits.length < 8) {
            Toast.makeText(this, R.string.login_invalid_phone, Toast.LENGTH_SHORT).show()
            return
        }
        setLoading(true)

        // 인증번호 검증 없이 즉시 로그인. 서버 스코프용 userId 로만 사용.
        val prefs = getSharedPreferences(AppConfig.PREFS_NAME, MODE_PRIVATE)
        prefs.edit().putString(AppConfig.KEY_USER_PHONE, digits).apply()

        startActivity(Intent(this, MainActivity::class.java).apply {
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK)
        })
        finish()
    }

    private fun setLoading(loading: Boolean) {
        binding.progress.visibility = if (loading) View.VISIBLE else View.GONE
        binding.btnSendCode.isEnabled = !loading
    }
}
