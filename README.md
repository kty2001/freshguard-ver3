# 🥬 FreshGuard — ver3

> 휴대폰으로 냉장고 사진을 찍으면 AI가 식재료를 인식하고, 유통기한을 추정하고, 임박한 재료로 만들 수 있는 한식 레시피를 추천하는 앱.

원격 VLM 서버 한 대가 비전 + 언어를 모두 담당하고, 이 Next.js 앱은 프록시 + UI + 사용자 데이터 저장만 맡습니다. 안드로이드 APK 래퍼 / 휴대폰 번호 기반 로그인 / 사용자별 데이터 분리까지 포함된 버전입니다.

---

## 🧭 전체 아키텍처

```
[ 안드로이드 APK / 휴대폰 브라우저 / 데스크톱 브라우저 ]
                    │
                    ▼   HTTPS (ngrok)
        ┌───────────────────────────────────────┐
        │   Next.js 앱 (워크스테이션, 포트 3000) │
        │   - /login, AppBar, BottomTabBar       │
        │   - 미들웨어: fg_user 쿠키 없으면 /login│
        │   - API: /api/auth/*, /api/inventory, ...│
        │   - 데이터: data/users/<phone>/*.json   │
        └───────────────┬───────────────────────┘
                        │ HTTP
                        ▼
        ┌───────────────────────────────────────┐
        │   원격 VLM 서버 (GPU 머신)             │
        │   /v1/health, /v1/recognize,           │
        │   /v1/expiry/suggest, /v1/recipes      │
        │   비전 + 언어를 한 모델이 처리         │
        └───────────────────────────────────────┘
```

---

## 🚀 빠른 시작

### 1) 워크스테이션 (Next.js + 데이터 저장)

```bash
npm install
cp .env.example .env.local
# .env.local 에서 FRESHGUARD_VLM_URL 을 VLM 서버 주소로 변경
#   예: http://192.168.0.20:8000

npm run dev   # http://localhost:3000
```

외부에서 접근하려면 ngrok 같은 터널을 띄웁니다:
```bash
ngrok http 3000
# 발급된 URL 예: https://finalist-deed-swagger.ngrok-free.dev
```

### 2) 휴대폰 (안드로이드 APK)

루트에 `FreshGuard-debug.apk`가 빌드되어 있습니다. 폰에 옮겨 설치하세요. 서버 URL은 `android/app/src/main/java/com/freshguard/app/AppConfig.kt`의 `SERVER_URL` 상수에 하드코딩되어 있습니다.

다시 빌드하려면:
```bash
cd android
JAVA_HOME=/opt/homebrew/opt/openjdk@17 \
  ANDROID_HOME=~/Library/Android/sdk \
  ./gradlew assembleDebug
# 산출물: android/app/build/outputs/apk/debug/app-debug.apk
```

### 3) 휴대폰 (브라우저)

ngrok URL을 폰 크롬에서 직접 열어도 됩니다. 처음 ngrok의 "Visit Site" 한 번 클릭, 이후 로그인 화면(`/login`)에서 휴대폰 번호 입력 → 메인.

---

## 🔐 로그인 / 사용자 데이터 분리

- **로그인 방식:** 휴대폰 번호 한 줄 (현재 빌드 기준 — 인증번호 검증 없이 식별자로만 사용)
- 로그인 시 `fg_user=<숫자전화번호>` 쿠키 발급 (90일)
- 미들웨어 `middleware.ts`가 쿠키 없는 모든 요청을 `/login`으로 리다이렉트
- 데이터는 전화번호별로 완전 분리:

```
data/
└── users/
    ├── 01012345678/
    │   ├── inventory.json
    │   ├── consume_log.json
    │   └── budget.json
    ├── 01098765432/
    │   └── ...
    └── default/   ← 쿠키 없는 폴백
```

- 같은 번호로 다시 로그인 = 데이터 그대로 복원
- 다른 번호로 로그인 = 빈 냉장고로 시작
- 설정 페이지에서 로그아웃 가능 (`/settings` → 👤 계정 → 로그아웃)

> **운영 전 주의:** 현재 인증번호 검증을 건너뛰는 데모 모드입니다. 운영 시에는 `/api/auth/send-code`, `/api/auth/verify-code` 흐름을 다시 켜고 실제 SMS 게이트웨이(NHN Cloud / Twilio 등)와 연동해야 합니다.

---

## 📡 VLM 서버 — 구현해야 할 HTTP 계약

본 앱은 `lib/vlmServer.ts` 한 곳에서만 VLM 서버를 호출합니다. 다른 컴퓨터에서 띄우는 서버는 아래 4개 엔드포인트만 구현하면 됩니다.

인증(선택): `Authorization: Bearer <FRESHGUARD_VLM_TOKEN>` 헤더 검증.

### 1) `GET /v1/health`
```jsonc
// 200 OK
{ "ok": true, "model": "qwen2-vl-7b", "uptime_s": 1234 }
```

### 2) `POST /v1/recognize` (multipart)
요청: `image` (file, required) — 클라이언트에서 EXIF 회전 + longest-side 1024로 정규화된 JPEG.

응답:
```jsonc
{
  "items": [
    { "label": "사과", "quantity": 2, "unit": "개", "confidence": 0.86 },
    { "label": "두부", "quantity": 1, "unit": "모", "confidence": 0.91 }
  ],
  "raw": "사과 2개, 두부 1모이 보입니다.",
  "model": "qwen2-vl-7b",
  "elapsed_ms": 612
}
```

### 3) `POST /v1/expiry/suggest` (JSON)
요청: `{ "name": "고등어" }`

응답:
```jsonc
{
  "is_food": true,
  "name": "고등어",
  "category": "해산물",
  "storage_type": "냉장",
  "days": 2,
  "note": "랩으로 밀봉 후 0~3℃ 보관",
  "model": "qwen2-vl-7b",
  "elapsed_ms": 280
}
```

음식 아닌 입력(`메뚜기`, `asdf` 등)이면 `is_food: false`. 단 **클라이언트가 `lib/foodAllowlist.ts` 기준으로 한 번 더 검증**하여, VLM이 잘못 거부한 외국·가공·특수 식품(`하몽`, `프로슈토`, `모차렐라`, `아보카도` 등)은 자동으로 식품으로 인정합니다.

### 4) `POST /v1/recipes` (JSON)
요청:
```json
{
  "expiring": ["김치", "두부", "대파"],
  "all":      ["김치", "두부", "대파", "달걀", "양파"],
  "must_use": ["김치"],
  "allergies": []
}
```

응답: 한국어 메뉴 5개. `must_use`가 있으면 모든 메뉴에 반드시 1개 이상 포함. 카테고리는 `찌개/국/볶음/구이/조림/무침/전·부침/샐러드/면/밥/반찬` 중 하나. 이유는 30자 이내, '분'·'인분' 표기 금지. 정확히 5건.

---

## 📱 안드로이드 APK

`android/` 디렉터리에 Kotlin/Gradle 프로젝트. 단일 WebView 래퍼:

| 기능 | 위치 |
|---|---|
| 서버 URL 하드코딩 | `AppConfig.kt::SERVER_URL` |
| 로그인 화면 (전화번호) | `LoginActivity.kt` |
| WebView + 권한 처리 | `MainActivity.kt` |
| ngrok 인터스티셜 영구 우회 | `shouldInterceptRequest`에서 ngrok 호스트로 가는 모든 GET 요청에 `ngrok-skip-browser-warning: true` 헤더 자동 부착 (CSS/JS/이미지 포함) |
| 카메라/갤러리 업로드 | `onShowFileChooser` + `FileProvider` |
| 사용자 식별 쿠키 | `CookieManager.setCookie("fg_user=<phone>")` — WebView 로드 전에 셋 |
| 메뉴 (재로드 / 로그아웃) | 뒤로가기 키 길게 눌러 호출 |

### 주의
- 미니멈 SDK 26 (Android 8.0), 타겟 SDK 34
- HTTP cleartext 허용 (`network_security_config.xml`) — 사설망 IP 접근용. 운영 전 비활성 검토
- 디버그 키로 자체 서명된 debug APK. Play Store 배포 시 별도 keystore + release 빌드 필요

---

## 📁 파일 / 디렉터리 구조

```
ver3/
├── app/                          ← Next.js App Router
│   ├── _components/              ← AppBar, BottomTabBar, ManualAddCard, WebcamCapture, ThemeToggle
│   ├── api/
│   │   ├── auth/
│   │   │   ├── login/route.ts          ← 전화번호 → fg_user 쿠키
│   │   │   ├── logout/route.ts
│   │   │   ├── send-code/route.ts      ← (대기) SMS 코드 발급 — 데모 모드
│   │   │   └── verify-code/route.ts    ← (대기) SMS 코드 검증
│   │   ├── budget/route.ts             ← 가계부
│   │   ├── eco/summary/route.ts        ← 에코 임팩트 집계
│   │   ├── expiring/route.ts           ← 임박 식재료
│   │   ├── expiry/suggest/route.ts     ← 직접 입력 식재료 추천
│   │   ├── health/route.ts
│   │   ├── inventory/
│   │   │   ├── route.ts                ← 재고 CRUD
│   │   │   ├── all/route.ts            ← 전체 초기화
│   │   │   └── consume/route.ts        ← 소진/폐기
│   │   ├── meta/route.ts               ← VLM 상태 + 통계
│   │   ├── recipes/route.ts            ← 레시피 추천
│   │   └── recognize/route.ts          ← 사진 인식 (multipart)
│   ├── eco/page.tsx
│   ├── fridge/page.tsx
│   ├── login/page.tsx                  ← 로그인 화면
│   ├── recipes/page.tsx
│   ├── settings/page.tsx               ← 계정 정보 + 로그아웃 + 데이터 초기화
│   ├── globals.css
│   ├── layout.tsx
│   └── page.tsx                        ← 홈 (사진 등록 + 알림)
├── android/                            ← Kotlin/Gradle APK 래퍼
│   ├── app/
│   │   ├── build.gradle.kts
│   │   ├── proguard-rules.pro
│   │   └── src/main/
│   │       ├── AndroidManifest.xml
│   │       ├── java/com/freshguard/app/
│   │       │   ├── MainActivity.kt
│   │       │   ├── LoginActivity.kt
│   │       │   ├── AppConfig.kt        ← SERVER_URL 하드코딩
│   │       │   └── ApiClient.kt
│   │       └── res/                    ← 레이아웃, 아이콘, strings
│   ├── build.gradle.kts
│   ├── settings.gradle.kts
│   ├── gradle/
│   └── gradlew
├── data/                               ← 사용자 데이터 (git ignored)
│   └── users/<phone>/{inventory,consume_log,budget}.json
├── lib/
│   ├── auth.ts                         ← 인증번호 메모리 스토어 (대기 중)
│   ├── expiryDb.ts                     ← CSV 마스터 DB 로더
│   ├── expirySuggest.ts                ← VLM + 화이트리스트 폴백
│   ├── foodAllowlist.ts                ← VLM이 자주 거부하는 식품 화이트리스트
│   ├── foodIcon.ts                     ← 식재료 이모지 매핑
│   ├── inventory.ts                    ← 사용자 데이터 read/write (user-scope)
│   ├── recipe.ts                       ← VLM 레시피 호출 + 한국어 후처리
│   ├── types.ts
│   ├── userScope.ts                    ← 쿠키에서 fg_user 추출
│   ├── vlm.ts                          ← 이미지 정규화 + VLM 인식 위임
│   └── vlmServer.ts                    ← VLM 4개 엔드포인트 호출
├── middleware.ts                       ← 로그인 게이트
├── expiry_db_utf8.csv                  ← 식품 마스터 데이터 (식약처 + USDA)
├── next.config.mjs
├── package.json
└── tsconfig.json
```

---

## 🍽️ 식품 인식 / 허용 범위

VLM이 한국식 식재료에는 강하지만 외국·가공·특수 식품을 `is_food: false`로 거부하는 경우가 많습니다. 클라이언트가 `lib/foodAllowlist.ts`에서 자체 화이트리스트로 한 번 더 보정합니다.

**현재 화이트리스트에 등록된 카테고리 (총 80+ 항목):**
- **가공 육류** — 하몽, 프로슈토, 살라미, 페퍼로니, 초리조, 베이컨, 햄, 소시지, 푸아그라
- **치즈** — 모차렐라, 리코타, 마스카포네, 까망베르, 브리, 페타, 고다, 체다, 그뤼에르, 파르메산
- **해산물 가공** — 캐비어, 안초비, 훈제연어, 명란, 어묵, 게맛살
- **외국 채소·과일** — 아보카도, 망고, 파파야, 용과, 두리안, 트러플, 아티초크, 케일, 루꼴라, 비트, 콜라비
- **발효식품 / 절임** — 사우어크라우트, 김치, 단무지, 장아찌, 피클, 올리브
- **조미·소스** — 발사믹, 올리브유, 참기름, 들기름, 마요네즈, 케첩, 스리라차, 굴소스, 두반장
- **즉석/가공** — 파스타, 스파게티, 라자냐, 피자, 햄버거, 샌드위치, 또띠야, 베이글, 크루아상
- **음료/주류** — 와인, 샴페인, 사케, 막걸리, 맥주

매칭은 정확 일치 → 부분 일치 순. "이베리코 하몽" 같은 변형 입력도 잡힙니다. 화이트리스트에 추가하려면 `lib/foodAllowlist.ts`의 `FOOD_ALLOWLIST` 객체에 키 + 카테고리 + 보관 방법 + 기본 유통기한을 추가하면 됩니다.

처리 순서:
1. 화이트리스트 정확/부분 일치 → 즉시 식품으로 인정 (VLM 호출 안 함)
2. VLM `/v1/expiry/suggest` 호출 → `is_food: true`면 채택
3. VLM이 `is_food: false`로 거부 → 화이트리스트 재확인 (안전망)
4. 모두 실패 → 기본값(냉장, 7일) 또는 "식품이 아닙니다"

---

## 🌱 에코 임팩트

소비/폐기 로그에서 다음을 집계 (`/eco`):
- 음식물 절감 (kg)
- CO₂ 절감 (kg)
- 절약 금액 (원)
- 폐기 비용 (원, 음식물 종량제 봉투 기준 130원/kg)
- 카테고리별 분포
- 7일 추이 차트
- 연속 관리 일수 (streak)
- 마일스톤 8종 (첫 소진, 10/50 소진, 1/5kg 절감, CO₂ 2kg, 3/7일 연속)

---

## ⚠️ 한계 / 운영 전 점검

| 항목 | 현재 상태 | 운영 시 |
|---|---|---|
| 인증 | 전화번호만 (검증 없음) | SMS 게이트웨이 연동 + verify 코드 활성화 |
| DB | JSON 파일 (전화번호별 폴더) | 동시성·트랜잭션 필요 시 SQLite/Postgres |
| 트래픽 | ngrok 무료 (rate limit + 인터스티셜) | 자체 도메인 + HTTPS / Cloudflare Tunnel / 호스팅 |
| HTTP cleartext | 허용 (`usesCleartextTraffic="true"`) | 운영 비활성, HTTPS 전용 |
| 이미지 | 메모리 처리만, 디스크 미저장 | (운영도 동일 유지 권장) |

---

## 📦 ver2 → ver3 변경 요약

- `lib/vlmServer.ts` — 원격 VLM 서버 단일 진입점.
- `lib/vlm.ts` — 로컬 Ollama Moondream 제거, 이미지 정규화 후 vlmServer로 위임.
- `lib/recipe.ts` — 로컬 qwen 제거, vlmServer로 위임 + 한국어 후처리 유지.
- `lib/expirySuggest.ts` — DB 즉답 → 원격 VLM → 화이트리스트 → 기본값 폴백.
- `lib/foodAllowlist.ts` ★ — VLM 거부 보정용 외국·가공·특수 식품 화이트리스트.
- `lib/inventory.ts` ★ — user-scope (전화번호별 폴더).
- `middleware.ts` ★ — 로그인 게이트.
- `app/login/` ★, `app/api/auth/` ★ — 휴대폰 번호 로그인.
- `android/` ★ — Kotlin 기반 안드로이드 APK 래퍼.

---

## 🔒 보안 노트

- 휴대폰 → 워크스테이션 → VLM 서버는 모두 같은 LAN(혹은 ngrok 터널) 가정. 인터넷 노출 시 `FRESHGUARD_VLM_TOKEN` 권장.
- 업로드 이미지는 메모리에만 잠깐 머무름. 디스크 저장 X.
- 사용자 데이터(`data/users/`)는 워크스테이션 디스크에만 저장. 백업/이관은 폴더 통째로 복사하면 됨.
