# 🥬 FreshGuard — ver3 (단일 VLM · 원격 서버)

> ver2의 보완 사항을 그대로 유지하면서 **AI 추론을 다른 컴퓨터의 단일 VLM 서버로 분리**한 버전.

## 🧭 아키텍처

```
[ 휴대폰 / 브라우저 ]                    [ 이 앱 (Next.js, 노트북) ]                  [ VLM 서버 (다른 컴퓨터) ]
       │                                          │                                            │
       │  사진/요청  ─────────────────────▶  /api/recognize, /api/recipes, ...                  │
       │                                          │   ── HTTP ──▶  /v1/recognize, /v1/recipes, /v1/expiry/suggest
       │                                          │                                            │  (단일 VLM이 비전 + 언어 모두 처리)
       │  결과   ◀──────────────────────────  JSON 응답  ◀───────────────────────────  JSON 응답
```

- ver2와 달리 Ollama / Moondream / Qwen 같은 **로컬 모델이 필요 없습니다**.
- VLM 서버 한 대만 실행되면 이 앱은 단순 프록시 + UI.
- 휴대폰에서 같은 Wi-Fi의 노트북 IP로 접속 → 노트북이 VLM 서버에 요청 전달.

## 🚀 빠른 시작

```bash
npm install
cp .env.example .env.local
# .env.local 에서 FRESHGUARD_VLM_URL 을 본인 VLM 서버 주소로 변경
#   예: http://192.168.0.20:8000

npm run dev   # http://localhost:3000

# 휴대폰에서 같은 Wi-Fi로 노트북 IP에 접속
ipconfig getifaddr en0    # macOS
# 예: http://192.168.0.10:3000
```

VLM 서버가 살아있는지 확인:
```bash
curl http://localhost:3000/api/health
```

## 📡 VLM 서버 — 구현해야 할 HTTP 계약

본 앱은 `lib/vlmServer.ts` 한 곳에서만 VLM 서버를 호출합니다.
다른 컴퓨터에서 띄우는 서버는 아래 4개 엔드포인트만 구현하면 됩니다.

인증(선택): `Authorization: Bearer <FRESHGUARD_VLM_TOKEN>` 헤더 검증.

### 1) `GET /v1/health`
```jsonc
// 200 OK
{ "ok": true, "model": "qwen2-vl-7b", "uptime_s": 1234 }
```

### 2) `POST /v1/recognize`  (multipart)
요청:
- `image` (file, required) — 이미 클라이언트에서 EXIF 회전 + longest-side 1024로 정규화된 JPEG.

응답:
```jsonc
{
  "items": [
    { "label": "사과", "quantity": 2, "unit": "개", "confidence": 0.86 },
    { "label": "두부", "quantity": 1, "unit": "모", "confidence": 0.91 }
  ],
  "raw": "사과 2개, 두부 1모이 보입니다.",  // (선택) 모델 원본 출력
  "model": "qwen2-vl-7b",
  "elapsed_ms": 612
}
```
서버는 한국어 식재료명을 그대로 반환하는 것이 가장 좋습니다. `lib/expiryDb.ts`의 `matchExpiry()`가 영어 별칭(apple→사과 등)도 수용하므로 영어도 동작은 함.

### 3) `POST /v1/expiry/suggest`  (JSON)
요청:
```json
{ "name": "고등어" }
```
응답:
```jsonc
{
  "is_food": true,                // false면 클라이언트가 "추가 불가"로 차단 (LM-02)
  "name": "고등어",
  "category": "해산물",            // 카테고리 화이트리스트는 lib/expirySuggest.ts 참고
  "storage_type": "냉장",          // "냉장" | "냉동" | "실온"
  "days": 2,
  "note": "랩으로 밀봉 후 0~3℃ 보관",
  "model": "qwen2-vl-7b",
  "elapsed_ms": 280
}
```
음식이 아닌 입력(예: "민수", "asdf")이면 `is_food: false` + `note: "식품이 아닙니다"` 반환.

### 4) `POST /v1/recipes`  (JSON)
요청:
```json
{
  "expiring": ["김치", "두부", "대파"],
  "all":      ["김치", "두부", "대파", "달걀", "양파"],
  "must_use": ["김치"],
  "allergies": []
}
```
응답:
```jsonc
{
  "suggestions": [
    { "name": "김치 두부찌개", "uses": ["김치","두부","대파"], "reason": "임박 3종 모두 활용", "category": "찌개" },
    // ... 총 5건
  ],
  "raw": "...(선택) 모델 원본 출력...",
  "model": "qwen2-vl-7b",
  "elapsed_ms": 14200
}
```

서버가 지켜야 할 규칙:
- `must_use` 재료가 있으면 모든 메뉴에 반드시 1개 이상 포함.
- 한국어로만. 이유는 30자 이내, '분'·'인분' 표기 금지.
- 카테고리는 `찌개/국/볶음/구이/조림/무침/전·부침/샐러드/면/밥/반찬` 중 하나.
- 정확히 5건. (클라이언트가 더 와도 5건으로 자름)

⚠️ 한국어 정리(가나/한자 제거, '분'·'인분' 표기 삭제)는 클라이언트가 안전망으로 한 번 더 수행합니다.

## 📁 ver2 → ver3 주요 변경점

- `lib/vlmServer.ts` ★ 신규 — 원격 VLM 서버 단일 진입점 (recognize / suggestExpiry / suggestRecipes / health).
- `lib/vlm.ts` — Ollama Moondream 호출 코드 삭제, `vlmServer.recognize` 위임. 이미지 정규화만 담당.
- `lib/recipe.ts` — Ollama qwen 호출 코드 삭제, `vlmServer.suggestRecipes` 위임. 한국어 후처리는 유지.
- `lib/expirySuggest.ts` — DB hit → 원격 VLM → 기본값 폴백.
- `app/api/meta/route.ts` — VLM 서버 URL / health / model 노출.
- `app/api/health/route.ts` ★ 신규 — 휴대폰에서 라우팅 점검용.
- `.env.example` — `OLLAMA_*` 제거, `FRESHGUARD_VLM_URL` / `FRESHGUARD_VLM_TOKEN` 추가.

UI / 데이터 모델은 ver2와 100% 동일합니다 (ver2의 모든 cover.docx 보완 + 다크/라이트 토글 포함).

## 🔒 보안 노트

- 휴대폰 → 노트북 → VLM 서버는 모두 같은 LAN을 가정. 인터넷 노출 시 토큰 권장.
- 업로드 이미지는 노트북·VLM 서버 메모리에만 잠깐 머무름. 디스크 저장 X (서버 구현 시 같은 정책 권장).
