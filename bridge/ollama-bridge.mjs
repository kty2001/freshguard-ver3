// FreshGuard ver3 — Ollama → VLM HTTP 계약 어댑터
// ver3 README의 4개 엔드포인트(/v1/health, /v1/recognize, /v1/expiry/suggest, /v1/recipes)를
// 로컬 ollama (기본 http://localhost:11434) 에 위임한다.
//
// 실행:
//   OLLAMA_MODEL=openbmb/minicpm-o4.5 node bridge/ollama-bridge.mjs
// 기본 포트: 8000

import http from "node:http";
import { Buffer } from "node:buffer";

const PORT = Number(process.env.PORT ?? 8000);
const OLLAMA = (process.env.OLLAMA_URL ?? "http://localhost:11434").replace(/\/$/, "");
const MODEL = process.env.OLLAMA_MODEL ?? "openbmb/minicpm-o4.5";
const STARTED = Date.now();

// ============== ollama 호출 ==============
async function ollamaGenerate({ prompt, images, format, system, temperature = 0.2, num_predict }) {
  const body = {
    model: MODEL,
    prompt,
    stream: false,
    options: { temperature },
  };
  if (system) body.system = system;
  if (images && images.length) body.images = images;
  if (format) body.format = format;
  if (num_predict) body.options.num_predict = num_predict;

  const res = await fetch(`${OLLAMA}/api/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`ollama HTTP ${res.status}: ${t.slice(0, 300)}`);
  }
  const j = await res.json();
  return j; // { response, ... }
}

// ============== JSON 안전 파싱 ==============
function extractJson(text) {
  if (!text) return null;
  // ```json ... ``` 블록 우선
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) {
    try { return JSON.parse(fence[1].trim()); } catch {}
  }
  // 처음 등장하는 { 부터 매칭되는 } 까지
  const start = text.indexOf("{");
  if (start >= 0) {
    let depth = 0;
    for (let i = start; i < text.length; i++) {
      const c = text[i];
      if (c === "{") depth++;
      else if (c === "}") {
        depth--;
        if (depth === 0) {
          const slice = text.slice(start, i + 1);
          try { return JSON.parse(slice); } catch {}
          break;
        }
      }
    }
  }
  // 배열 추출 시도
  const sa = text.indexOf("[");
  if (sa >= 0) {
    let depth = 0;
    for (let i = sa; i < text.length; i++) {
      const c = text[i];
      if (c === "[") depth++;
      else if (c === "]") {
        depth--;
        if (depth === 0) {
          const slice = text.slice(sa, i + 1);
          try { return JSON.parse(slice); } catch {}
          break;
        }
      }
    }
  }
  return null;
}

// ============== multipart 파서 (최소 구현) ==============
function parseMultipart(buf, boundary) {
  const delim = Buffer.from(`--${boundary}`);
  const parts = [];
  let idx = 0;
  while (idx < buf.length) {
    const start = buf.indexOf(delim, idx);
    if (start < 0) break;
    const next = buf.indexOf(delim, start + delim.length);
    if (next < 0) break;
    // 한 파트 = [start+delim..next] 사이
    let segStart = start + delim.length;
    // CRLF skip
    if (buf[segStart] === 0x0d && buf[segStart + 1] === 0x0a) segStart += 2;
    let segEnd = next;
    // 앞쪽 CRLF 제거
    if (buf[segEnd - 2] === 0x0d && buf[segEnd - 1] === 0x0a) segEnd -= 2;
    const seg = buf.slice(segStart, segEnd);
    // 헤더와 바디 분리
    const headerEnd = seg.indexOf(Buffer.from("\r\n\r\n"));
    if (headerEnd > 0) {
      const headerText = seg.slice(0, headerEnd).toString("utf8");
      const body = seg.slice(headerEnd + 4);
      const headers = {};
      headerText.split(/\r\n/).forEach((line) => {
        const i = line.indexOf(":");
        if (i > 0) headers[line.slice(0, i).trim().toLowerCase()] = line.slice(i + 1).trim();
      });
      parts.push({ headers, body });
    }
    idx = next;
  }
  return parts;
}

function findImagePart(parts) {
  for (const p of parts) {
    const cd = p.headers["content-disposition"] ?? "";
    if (/name="image"/.test(cd) || /image\//.test(p.headers["content-type"] ?? "")) {
      return p;
    }
  }
  return parts[0];
}

// ============== body 수집 ==============
function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

function sendJson(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
    "Access-Control-Allow-Origin": "*",
  });
  res.end(body);
}

// ============== 핸들러: /v1/recognize ==============
async function handleRecognize(req, res) {
  const ct = req.headers["content-type"] ?? "";
  const m = ct.match(/boundary=([^;]+)/);
  if (!m) return sendJson(res, 400, { error: "multipart boundary missing" });
  const boundary = m[1].trim().replace(/^"|"$/g, "");
  const raw = await readBody(req);
  const parts = parseMultipart(raw, boundary);
  const imgPart = findImagePart(parts);
  if (!imgPart) return sendJson(res, 400, { error: "image part not found" });
  const b64 = imgPart.body.toString("base64");

  const system =
    "당신은 한국 가정 냉장고 사진에서 식재료만 추출하는 비전 모델입니다. " +
    "출력은 반드시 JSON 한 덩어리. 예: " +
    "{\"items\":[{\"label\":\"사과\",\"quantity\":2,\"unit\":\"개\",\"confidence\":0.86,\"is_food\":true}]} " +
    "절대 규칙: " +
    "(A) 환각 금지. 사진에 명확히 보이지 않는 것은 절대 추측·추가하지 말 것. " +
    "    '아마 ~일 것 같다', '~로 보인다' 같은 추론은 출력하지 말 것. " +
    "    확실하지 않으면 그 항목을 출력하지 말 것 (confidence가 0.6 미만이면 제외). " +
    "(B) 식재료가 아닌 것은 모두 제외. 다음은 절대 출력하지 말 것: " +
    "    그릇·접시·컵·도마·칼·수저·포크·냉장고 선반·통·뚜껑·비닐봉지·종이상자 등 용기와 도구, " +
    "    상표·로고·문자·숫자, 사람·손·얼굴·옷, 배경·벽·바닥·테이블·식탁보, " +
    "    가구·가전·인테리어·장식, 비식품(휴지·세제·약·화장품). " +
    "    is_food=false 인 항목은 응답에 포함하지 말 것. " +
    "(C) 빈 결과 허용. 사진에 식재료가 전혀 보이지 않거나 식재료를 식별할 수 없으면 " +
    "    반드시 {\"items\":[]} 빈 배열을 반환하라. 억지로 채우지 말 것. " +
    "(D) label은 반드시 한국어 식재료명. 영어·한자·일본어 가나 금지. " +
    "    예: apple→사과, egg→계란, tomato→토마토, milk→우유. " +
    "(E) 같은 식재료가 여러 개 보이면 한 항목으로 합치고 quantity 숫자로 표시. " +
    "    동일 label을 여러 번 반복 출력 금지. " +
    "(F) unit은 개/모/장/포기/g/ml/팩/병 중 적절히. confidence는 사진에서 식별의 확신도(0~1). " +
    "    is_food는 반드시 true로만 출력 (식재료가 아니면 애초에 항목을 만들지 말 것).";

  const prompt =
    "이 사진에서 실제로 보이는 식재료만 추출해 위 형식의 JSON으로 답하세요. " +
    "추측·환각·식재료 외 항목 금지. 식재료가 보이지 않으면 {\"items\":[]}. " +
    "설명·마크다운·코드펜스 없이 JSON 객체 하나만 출력하세요.";

  const t0 = Date.now();
  const r = await ollamaGenerate({
    prompt,
    images: [b64],
    system,
    format: "json",
    temperature: 0.05,
    num_predict: 512,
  });
  const text = (r?.response ?? "").trim();
  const parsed = extractJson(text);
  let items = [];
  if (parsed && Array.isArray(parsed.items)) {
    items = parsed.items
      .map((it) => ({
        label: String(it.label ?? it.name ?? "").trim(),
        quantity: Number(it.quantity ?? it.count ?? 1) || 1,
        unit: String(it.unit ?? "개").trim() || "개",
        confidence: Number(it.confidence ?? 0.7) || 0.7,
        is_food: it.is_food !== false,
      }))
      // 비식품 + 낮은 신뢰도 (≤0.5) 모두 제외. 한국어 라벨 검증은 /api/recognize에서 한 번 더.
      .filter((it) => it.label.length > 0 && it.is_food && it.confidence > 0.5)
      .slice(0, 30);
  }

  sendJson(res, 200, {
    items,
    raw: text,
    model: MODEL,
    elapsed_ms: Date.now() - t0,
  });
}

// ============== 핸들러: /v1/expiry/suggest ==============
async function handleExpirySuggest(req, res) {
  const raw = await readBody(req);
  let body = {};
  try { body = JSON.parse(raw.toString("utf8") || "{}"); } catch {}
  const name = String(body.name ?? "").trim();
  if (!name) return sendJson(res, 400, { error: "name required" });

  const system =
    "당신은 한국 식재료의 표준 보관·유통기한 정보를 답하는 한국어 어시스턴트입니다. " +
    "출력은 반드시 JSON 한 덩어리. 예: " +
    "{\"is_food\":true,\"name\":\"고등어\",\"category\":\"해산물\",\"storage_type\":\"냉장\",\"days\":2,\"note\":\"랩으로 밀봉\"} " +
    "category 화이트리스트: 채소류, 과일류, 육류, 육류 가공, 해산물, 달걀·유제품, 두류·콩류, 가공식품, 음료류, 조미류, 발효식품, 곡류, 기타. " +
    "storage_type: 냉장/냉동/실온 중 하나. days: 1~1825 정수. note: 30자 이내 한국어. " +
    "음식이 아닌 입력(사람 이름, 무의미한 문자열 등)이면 is_food=false, days=0, note=\"식품이 아닙니다\".";

  const prompt = `입력: "${name}"\n위 입력에 대한 JSON을 한 덩어리로만 출력하세요.`;

  const t0 = Date.now();
  const r = await ollamaGenerate({
    prompt,
    system,
    format: "json",
    temperature: 0.1,
    num_predict: 256,
  });
  const text = (r?.response ?? "").trim();
  const parsed = extractJson(text) ?? {};

  sendJson(res, 200, {
    is_food: parsed.is_food !== false,
    name: typeof parsed.name === "string" && parsed.name.trim() ? parsed.name.trim() : name,
    category: typeof parsed.category === "string" ? parsed.category : undefined,
    storage_type: parsed.storage_type === "냉동" || parsed.storage_type === "실온" ? parsed.storage_type : "냉장",
    days: Number(parsed.days) > 0 ? Math.min(1825, Math.round(Number(parsed.days))) : 7,
    note: typeof parsed.note === "string" ? parsed.note.slice(0, 30) : undefined,
    model: MODEL,
    elapsed_ms: Date.now() - t0,
  });
}

// ============== 핸들러: /v1/recipes ==============
async function handleRecipes(req, res) {
  const raw = await readBody(req);
  let body = {};
  try { body = JSON.parse(raw.toString("utf8") || "{}"); } catch {}

  const expiring = Array.isArray(body.expiring) ? body.expiring.map(String) : [];
  const all = Array.isArray(body.all) ? body.all.map(String) : [];
  const must_use = Array.isArray(body.must_use) ? body.must_use.map(String) : [];
  const allergies = Array.isArray(body.allergies) ? body.allergies.map(String) : [];

  const system =
    "당신은 한국 가정식 요리 추천 어시스턴트입니다. 반드시 한국어로만 답하세요. " +
    "출력은 JSON 한 덩어리. 예: " +
    "{\"suggestions\":[{\"name\":\"김치찌개\",\"uses\":[\"김치\",\"두부\"],\"reason\":\"임박 2종 활용\",\"category\":\"찌개\"}]} " +
    "규칙: " +
    "(1) 정확히 5개의 메뉴. " +
    "(2) must_use 재료가 있으면 모든 메뉴에 1개 이상 포함. " +
    "(3) 한국어만 사용. 한자·일본어 가나 금지. " +
    "(4) reason은 30자 이내. '분', '인분' 표기 금지. " +
    "(5) category는 [찌개, 국, 볶음, 구이, 조림, 무침, 전·부침, 샐러드, 면, 밥, 반찬] 중 하나. " +
    "(6) uses의 각 항목은 all 또는 expiring 목록 안 재료여야 함.";

  const prompt =
    `expiring(임박): ${JSON.stringify(expiring)}\n` +
    `all(전체 보유): ${JSON.stringify(all)}\n` +
    `must_use(반드시 사용): ${JSON.stringify(must_use)}\n` +
    `allergies(알레르기 제외): ${JSON.stringify(allergies)}\n` +
    "위 정보로 한국 가정식 5개를 JSON 한 덩어리로만 출력하세요.";

  const t0 = Date.now();
  const r = await ollamaGenerate({
    prompt,
    system,
    format: "json",
    temperature: 0.5,
    num_predict: 1024,
  });
  const text = (r?.response ?? "").trim();
  const parsed = extractJson(text) ?? {};

  const VALID = new Set(["찌개", "국", "볶음", "구이", "조림", "무침", "전·부침", "전", "샐러드", "면", "밥", "반찬"]);
  let suggestions = [];
  if (Array.isArray(parsed.suggestions)) {
    suggestions = parsed.suggestions
      .map((s) => ({
        name: String(s?.name ?? "").trim(),
        uses: Array.isArray(s?.uses) ? s.uses.map(String).filter(Boolean).slice(0, 5) : [],
        reason: String(s?.reason ?? "").trim(),
        category: typeof s?.category === "string" && VALID.has(s.category) ? s.category : undefined,
      }))
      .filter((s) => s.name.length > 0)
      .slice(0, 5);
  }

  sendJson(res, 200, {
    suggestions,
    raw: text,
    model: MODEL,
    elapsed_ms: Date.now() - t0,
  });
}

// ============== 핸들러: /v1/health ==============
async function handleHealth(req, res) {
  try {
    const r = await fetch(`${OLLAMA}/api/tags`);
    const j = await r.json();
    const want = MODEL.split(":")[0];
    const found = (j?.models ?? []).some((m) => {
      const n = String(m.name ?? m.model ?? "").split(":")[0];
      return n === want;
    });
    sendJson(res, 200, {
      ok: true,
      model: MODEL,
      model_loaded: found,
      ollama: OLLAMA,
      uptime_s: Math.floor((Date.now() - STARTED) / 1000),
    });
  } catch (e) {
    sendJson(res, 200, { ok: false, model: MODEL, ollama: OLLAMA, detail: String(e?.message ?? e) });
  }
}

// ============== 서버 ==============
const server = http.createServer(async (req, res) => {
  // CORS preflight (개발 편의)
  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type,Authorization",
    });
    res.end();
    return;
  }
  const url = req.url ?? "";
  try {
    if (req.method === "GET" && url === "/v1/health") return await handleHealth(req, res);
    if (req.method === "POST" && url === "/v1/recognize") return await handleRecognize(req, res);
    if (req.method === "POST" && url === "/v1/expiry/suggest") return await handleExpirySuggest(req, res);
    if (req.method === "POST" && url === "/v1/recipes") return await handleRecipes(req, res);
    sendJson(res, 404, { error: "not found", path: url });
  } catch (e) {
    console.error("[ollama-bridge] handler error:", e?.message ?? e);
    try { sendJson(res, 500, { error: String(e?.message ?? e) }); } catch {}
  }
});

process.on("unhandledRejection", (e) => console.error("[ollama-bridge] unhandledRejection:", e));
process.on("uncaughtException", (e) => console.error("[ollama-bridge] uncaughtException:", e));

server.listen(PORT, () => {
  console.log(`[ollama-bridge] listening on http://localhost:${PORT}`);
  console.log(`[ollama-bridge] ollama=${OLLAMA} model=${MODEL}`);
});
