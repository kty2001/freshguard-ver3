"""
FreshGuard VLM Server — Ollama 백엔드
엔드포인트: GET /v1/health, POST /v1/recognize, POST /v1/expiry/suggest, POST /v1/recipes
"""

import os
import re
import json
import time
import logging
from typing import Optional, List, Any

import ollama
import uvicorn
from fastapi import FastAPI, File, UploadFile, HTTPException, Depends, Header, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel, field_validator
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger(__name__)

# ============================================================
# 설정
# ============================================================
MODEL = os.environ.get("VLM_MODEL", "qwen2-vl:7b")
TOKEN = os.environ.get("FRESHGUARD_VLM_TOKEN", "")
HOST = os.environ.get("HOST", "0.0.0.0")
PORT = int(os.environ.get("PORT", 8000))

START_TIME = time.time()

CATEGORIES = ["채소", "과일", "육류", "해산물", "유제품", "곡류", "가공식품", "양념/소스", "음료", "기타"]
STORAGE_TYPES = ["냉장", "냉동", "실온"]
RECIPE_CATEGORIES = ["찌개", "국", "볶음", "구이", "조림", "무침", "전·부침", "샐러드", "면", "밥", "반찬"]

MAX_IMAGE_BYTES = 10 * 1024 * 1024  # 10 MB
MAX_NAME_LEN = 100
MAX_LIST_ITEMS = 50
MAX_ITEM_LEN = 50

if not TOKEN:
    logger.warning("FRESHGUARD_VLM_TOKEN 미설정 — 인증 없이 누구나 접근 가능합니다.")

_raw_allowed = os.environ.get("ALLOWED_IPS", "")
ALLOWED_IPS: set[str] = {ip.strip() for ip in _raw_allowed.split(",") if ip.strip()}
if ALLOWED_IPS:
    logger.info(f"IP 화이트리스트 활성화: {ALLOWED_IPS}")
else:
    logger.warning("ALLOWED_IPS 미설정 — 모든 IP에서 접근 가능합니다.")

limiter = Limiter(key_func=get_remote_address)
app = FastAPI(title="FreshGuard VLM Server")
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)


@app.middleware("http")
async def ip_allowlist(request: Request, call_next):
    if ALLOWED_IPS:
        client_ip = request.client.host
        if client_ip not in ALLOWED_IPS:
            logger.warning(f"차단된 접근 시도: {client_ip} -> {request.url.path}")
            return JSONResponse(status_code=403, content={"detail": "Forbidden"})
    return await call_next(request)

# ============================================================
# 유틸
# ============================================================

def check_auth(authorization: Optional[str] = Header(default=None)) -> None:
    if not TOKEN:
        return
    if authorization != f"Bearer {TOKEN}":
        raise HTTPException(status_code=401, detail="Unauthorized")


def extract_json(text: str) -> Any:
    """LLM 응답에서 JSON 추출 — 마크다운 코드블록, 불필요한 전후 텍스트 처리."""
    text = text.strip()

    # 직접 파싱 시도
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass

    # ```json ... ``` 또는 ``` ... ``` 블록
    m = re.search(r"```(?:json)?\s*([\s\S]*?)\s*```", text)
    if m:
        try:
            return json.loads(m.group(1))
        except json.JSONDecodeError:
            pass

    # 텍스트에서 { ... } 블록 추출 (가장 큰 것)
    braces = []
    depth = 0
    start = -1
    for i, ch in enumerate(text):
        if ch == "{":
            if depth == 0:
                start = i
            depth += 1
        elif ch == "}":
            depth -= 1
            if depth == 0 and start != -1:
                braces.append(text[start : i + 1])
                start = -1

    for candidate in sorted(braces, key=len, reverse=True):
        try:
            return json.loads(candidate)
        except json.JSONDecodeError:
            continue

    raise ValueError(f"JSON 추출 실패: {text[:300]}")


def clamp_str(s: str, max_len: int) -> str:
    return str(s)[:max_len]


def clean_reason(reason: str) -> str:
    """분·인분 표기 제거, 30자 제한."""
    reason = re.sub(r"\d+\s*(?:분|인분)", "", reason).strip()
    return reason[:30]

# ============================================================
# /v1/health
# ============================================================

@app.get("/v1/health")
@limiter.limit("30/minute")
def health(request: Request):
    uptime = int(time.time() - START_TIME)
    try:
        result = ollama.list()
        model_list: list = []
        if hasattr(result, "models"):
            model_list = [m.model for m in result.models]
        elif isinstance(result, dict):
            model_list = [m.get("name", "") for m in result.get("models", [])]

        model_ok = any(MODEL.split(":")[0] in name for name in model_list)
        return {
            "ok": model_ok,
            "model": MODEL,
            "uptime_s": uptime,
            "detail": None if model_ok else f"모델 {MODEL} 미확인. 보유: {model_list}",
        }
    except Exception as exc:
        return JSONResponse(
            status_code=503,
            content={"ok": False, "model": MODEL, "uptime_s": uptime, "detail": str(exc)},
        )

# ============================================================
# /v1/recognize
# ============================================================

RECOGNIZE_SYSTEM = (
    "당신은 냉장고 식재료 인식 전문가입니다. "
    "이미지를 보고 보이는 식재료 목록을 정확한 JSON으로만 응답합니다. "
    "절대 JSON 이외의 텍스트를 출력하지 마세요."
)

RECOGNIZE_PROMPT = """이미지에서 보이는 모든 식재료를 식별하세요.
아래 JSON 형식으로만 응답하세요:

{
  "items": [
    {"label": "식재료명(한국어)", "quantity": 수량, "unit": "단위", "confidence": 0.0~1.0}
  ]
}

단위 예시: 개, 봉, 팩, 병, 캔, 모, 줄기, g, ml
식재료가 없으면 items를 빈 배열로 반환하세요."""


@app.post("/v1/recognize")
@limiter.limit("10/minute")
async def recognize(request: Request, image: UploadFile = File(...), _=Depends(check_auth)):
    t0 = time.time()
    image_bytes = await image.read()
    if len(image_bytes) > MAX_IMAGE_BYTES:
        raise HTTPException(status_code=413, detail=f"이미지 크기 초과 (최대 {MAX_IMAGE_BYTES // 1024 // 1024}MB)")

    try:
        response = ollama.chat(
            model=MODEL,
            messages=[
                {"role": "system", "content": RECOGNIZE_SYSTEM},
                {"role": "user", "content": RECOGNIZE_PROMPT, "images": [image_bytes]},
            ],
        )
        raw: str = response.message.content
        data = extract_json(raw)

        validated = []
        for item in data.get("items", []):
            if not isinstance(item, dict) or not item.get("label"):
                continue
            validated.append(
                {
                    "label": clamp_str(item["label"], 40),
                    "quantity": float(item.get("quantity", 1)),
                    "unit": clamp_str(item.get("unit", "개"), 10),
                    "confidence": max(0.0, min(1.0, float(item.get("confidence", 0.8)))),
                }
            )

        return {
            "items": validated,
            "raw": raw,
            "model": MODEL,
            "elapsed_ms": int((time.time() - t0) * 1000),
        }

    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))

# ============================================================
# /v1/expiry/suggest
# ============================================================

class ExpirySuggestRequest(BaseModel):
    name: str

    @field_validator("name")
    @classmethod
    def validate_name(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("name이 비어 있습니다.")
        if len(v) > MAX_NAME_LEN:
            raise ValueError(f"name은 {MAX_NAME_LEN}자 이하여야 합니다.")
        return v


EXPIRY_SYSTEM = (
    "당신은 식품 보관 전문가입니다. "
    "입력된 단어가 식품인지 판단하고 보관 정보를 JSON으로만 응답합니다. "
    "절대 JSON 이외의 텍스트를 출력하지 마세요."
)


@app.post("/v1/expiry/suggest")
@limiter.limit("30/minute")
async def expiry_suggest(request: Request, req: ExpirySuggestRequest, _=Depends(check_auth)):
    t0 = time.time()
    name = req.name

    prompt = f""""{name}"이(가) 식품인지 판단하고, 식품이면 보관 정보를 알려주세요.

아래 JSON 형식으로만 응답하세요:
{{
  "is_food": true,
  "name": "{name}",
  "category": "카테고리",
  "storage_type": "냉장|냉동|실온",
  "days": 정수,
  "note": "보관 방법 간단 설명"
}}

식품이 아닌 경우:
{{
  "is_food": false,
  "name": "{name}",
  "category": null,
  "storage_type": null,
  "days": 0,
  "note": "식품이 아닙니다"
}}

카테고리 목록: {', '.join(CATEGORIES)}"""

    try:
        response = ollama.chat(
            model=MODEL,
            messages=[
                {"role": "system", "content": EXPIRY_SYSTEM},
                {"role": "user", "content": prompt},
            ],
        )
        raw: str = response.message.content
        data = extract_json(raw)

        is_food = bool(data.get("is_food", False))
        if not is_food:
            return {
                "is_food": False,
                "name": name,
                "category": None,
                "storage_type": None,
                "days": 0,
                "note": "식품이 아닙니다",
                "model": MODEL,
                "elapsed_ms": int((time.time() - t0) * 1000),
            }

        storage_type = data.get("storage_type", "냉장")
        if storage_type not in STORAGE_TYPES:
            storage_type = "냉장"

        category = data.get("category", "기타")
        if category not in CATEGORIES:
            category = "기타"

        return {
            "is_food": True,
            "name": data.get("name", name),
            "category": category,
            "storage_type": storage_type,
            "days": max(1, int(data.get("days", 3))),
            "note": clamp_str(data.get("note", ""), 60),
            "model": MODEL,
            "elapsed_ms": int((time.time() - t0) * 1000),
        }

    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))

# ============================================================
# /v1/recipes
# ============================================================

def _validate_str_list(v: List[str], field: str) -> List[str]:
    if len(v) > MAX_LIST_ITEMS:
        raise ValueError(f"{field}은 {MAX_LIST_ITEMS}개 이하여야 합니다.")
    return [s[:MAX_ITEM_LEN] for s in v]


class RecipesRequest(BaseModel):
    expiring: List[str]
    all: List[str]
    must_use: Optional[List[str]] = []
    allergies: Optional[List[str]] = []

    @field_validator("expiring", "all", "must_use", "allergies", mode="before")
    @classmethod
    def validate_lists(cls, v: Any, info: Any) -> List[str]:
        if v is None:
            return []
        return _validate_str_list(list(v), info.field_name)


RECIPES_SYSTEM = (
    "당신은 한국 요리 전문가입니다. "
    "주어진 재료로 만들 수 있는 한국 요리를 JSON으로만 추천합니다. "
    "절대 JSON 이외의 텍스트를 출력하지 마세요."
)


@app.post("/v1/recipes")
@limiter.limit("10/minute")
async def suggest_recipes(request: Request, req: RecipesRequest, _=Depends(check_auth)):
    t0 = time.time()

    must_clause = (
        f"\n- 필수 포함 재료: {', '.join(req.must_use)} — 모든 메뉴에 반드시 1개 이상 사용"
        if req.must_use
        else ""
    )
    allergy_clause = (
        f"\n- 알레르기 제외: {', '.join(req.allergies)}"
        if req.allergies
        else ""
    )

    prompt = f"""다음 조건에 맞는 한국 요리 5가지를 추천하세요.

재료:
- 임박 재료 (우선 사용): {', '.join(req.expiring) or '없음'}
- 전체 보유 재료: {', '.join(req.all) or '없음'}{must_clause}{allergy_clause}

반드시 아래 JSON 형식으로만 응답하세요:
{{
  "suggestions": [
    {{
      "name": "요리명",
      "uses": ["재료1", "재료2"],
      "reason": "추천 이유(30자 이내)",
      "category": "카테고리"
    }}
  ]
}}

규칙:
- 정확히 5가지
- category는 반드시 다음 중 하나: {', '.join(RECIPE_CATEGORIES)}
- 한국어만 사용
- reason은 30자 이내, '분' '인분' 표기 금지
- 임박 재료를 최대한 활용"""

    try:
        response = ollama.chat(
            model=MODEL,
            messages=[
                {"role": "system", "content": RECIPES_SYSTEM},
                {"role": "user", "content": prompt},
            ],
        )
        raw: str = response.message.content
        data = extract_json(raw)

        validated = []
        for s in (data.get("suggestions") or [])[:5]:
            if not isinstance(s, dict) or not s.get("name"):
                continue
            category = s.get("category", "반찬")
            if category not in RECIPE_CATEGORIES:
                category = "반찬"
            validated.append(
                {
                    "name": clamp_str(s["name"], 40),
                    "uses": [str(u) for u in s.get("uses", [])],
                    "reason": clean_reason(str(s.get("reason", ""))),
                    "category": category,
                }
            )

        return {
            "suggestions": validated,
            "raw": raw,
            "model": MODEL,
            "elapsed_ms": int((time.time() - t0) * 1000),
        }

    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))

# ============================================================
# 진입점
# ============================================================

if __name__ == "__main__":
    uvicorn.run(app, host=HOST, port=PORT)
