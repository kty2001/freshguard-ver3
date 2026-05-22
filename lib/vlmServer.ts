// FreshGuard ver3 — 원격 VLM 서버 클라이언트.
//
// ver3 아키텍처:
//   휴대폰(브라우저) → Next.js API 라우트 → 원격 VLM 서버 (다른 컴퓨터)
//
// 단일 VLM이 비전(인식) + 언어(레시피 추천 / 유통기한 추정)을 모두 처리한다.
// 본 모듈이 그 서버를 호출하는 유일한 진입점이다.

import type { RecognizedItem, StorageType } from "./types";

// ============== 환경 변수 ==============
const BASE = (process.env.FRESHGUARD_VLM_URL ?? "http://localhost:8000").replace(/\/$/, "");
const TOKEN = process.env.FRESHGUARD_VLM_TOKEN ?? "";

const TIMEOUT_RECOGNIZE_MS = Number(process.env.VLM_RECOGNIZE_TIMEOUT_MS ?? 60000);
const TIMEOUT_SUGGEST_MS = Number(process.env.VLM_SUGGEST_TIMEOUT_MS ?? 30000);
const TIMEOUT_RECIPES_MS = Number(process.env.VLM_RECIPES_TIMEOUT_MS ?? 90000);

// ============== 공용 헤더/요청 ==============
function authHeaders(): Record<string, string> {
  return TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {};
}

async function postJson<T>(path: string, body: unknown, timeoutMs: number): Promise<T> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`${BASE}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...authHeaders(),
      },
      body: JSON.stringify(body ?? {}),
      signal: ctrl.signal,
    });
    if (!res.ok) {
      const t = await res.text().catch(() => "");
      throw new Error(`VLM ${path} HTTP ${res.status}: ${t.slice(0, 200)}`);
    }
    return (await res.json()) as T;
  } catch (e: any) {
    if (e?.name === "AbortError") {
      throw new Error(`VLM ${path} timeout after ${timeoutMs}ms`);
    }
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

async function postMultipart<T>(path: string, form: FormData, timeoutMs: number): Promise<T> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`${BASE}${path}`, {
      method: "POST",
      headers: { ...authHeaders() },
      body: form,
      signal: ctrl.signal,
    });
    if (!res.ok) {
      const t = await res.text().catch(() => "");
      throw new Error(`VLM ${path} HTTP ${res.status}: ${t.slice(0, 200)}`);
    }
    return (await res.json()) as T;
  } catch (e: any) {
    if (e?.name === "AbortError") {
      throw new Error(`VLM ${path} timeout after ${timeoutMs}ms`);
    }
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

// ============== /v1/recognize ==============
// 입력: multipart 'image' (필수), 'prompt' (선택)
// 출력: { items: RecognizedItem[]; raw?: string; model?: string; elapsed_ms?: number }
export interface RecognizeResponse {
  items: RecognizedItem[];
  raw?: string;
  model?: string;
  elapsed_ms?: number;
}

export async function recognize(imageBuf: Buffer, filename = "upload.jpg"): Promise<RecognizeResponse> {
  const form = new FormData();
  const blob = new Blob([new Uint8Array(imageBuf)], { type: "application/octet-stream" });
  form.append("image", blob, filename);
  const r = await postMultipart<RecognizeResponse & { error?: string }>("/v1/recognize", form, TIMEOUT_RECOGNIZE_MS);
  if (r.error) throw new Error(`VLM 인식 오류: ${r.error}`);
  return {
    items: Array.isArray(r.items) ? r.items : [],
    raw: r.raw,
    model: r.model,
    elapsed_ms: r.elapsed_ms,
  };
}

// ============== /v1/expiry/suggest ==============
export interface ExpirySuggestResponse {
  is_food: boolean;
  name: string;
  category?: string;
  storage_type?: StorageType;
  days: number;
  note?: string;
  model?: string;
  elapsed_ms?: number;
}

export async function suggestExpiry(name: string): Promise<ExpirySuggestResponse> {
  return postJson<ExpirySuggestResponse>("/v1/expiry/suggest", { name }, TIMEOUT_SUGGEST_MS);
}

// ============== /v1/recipes ==============
// 서버는 한국어 출력을 강제해야 한다 (RE-07). 본 모듈은 사후 정리도 수행한다.
export interface RecipeRequestPayload {
  expiring: string[];
  all: string[];
  must_use?: string[];
  allergies?: string[];
}

export interface RecipeSuggestion {
  name: string;
  uses: string[];
  reason: string;
  category?: string;
}

export interface RecipesResponse {
  suggestions: RecipeSuggestion[];
  raw?: string;
  model?: string;
  elapsed_ms?: number;
}

export async function suggestRecipes(payload: RecipeRequestPayload): Promise<RecipesResponse> {
  const r = await postJson<RecipesResponse>("/v1/recipes", payload, TIMEOUT_RECIPES_MS);
  return {
    suggestions: Array.isArray(r.suggestions) ? r.suggestions : [],
    raw: r.raw,
    model: r.model,
    elapsed_ms: r.elapsed_ms,
  };
}

// ============== /v1/health ==============
export interface HealthResponse {
  ok: boolean;
  model?: string;
  uptime_s?: number;
  detail?: string;
}

export async function health(): Promise<HealthResponse & { reachable: boolean; base: string }> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 5000);
  try {
    const res = await fetch(`${BASE}/v1/health`, {
      headers: { ...authHeaders() },
      signal: ctrl.signal,
    });
    if (!res.ok) return { ok: false, reachable: true, base: BASE, detail: `HTTP ${res.status}` };
    const j = (await res.json()) as HealthResponse;
    return { ...j, reachable: true, base: BASE };
  } catch (e: any) {
    return { ok: false, reachable: false, base: BASE, detail: e?.message ?? String(e) };
  } finally {
    clearTimeout(timer);
  }
}

export const VLM_BASE = BASE;
