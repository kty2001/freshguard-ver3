package com.freshguard.app

// 서버 URL은 빌드에 하드코딩.
// 변경하려면 이 상수만 수정하고 다시 빌드.
object AppConfig {
    const val SERVER_URL: String = "https://finalist-deed-swagger.ngrok-free.dev"

    const val PREFS_NAME = "freshguard_prefs"
    const val KEY_USER_PHONE = "user_phone" // 인증 완료된 전화번호 (= userId)
}
