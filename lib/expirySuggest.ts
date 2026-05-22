// ver3: 직접 입력 식재료에 대한 유통기한 추정 — 원격 VLM 서버 위임.
// 3단계 폴백은 ver2와 동일: DB → 원격 VLM → 기본값.

import type { StorageType } from "./types";
import { matchExpiry } from "./expiryDb";
import { suggestExpiry as remoteSuggestExpiry } from "./vlmServer";

export type SuggestSource = "db" | "llm" | "default" | "rejected";

export interface ExpirySuggestion {
  query: string;
  name: string;
  category?: string;
  storage_type: StorageType;
  days: number;
  note?: string;
  source: SuggestSource;
  matched_db_key?: string;
  is_food: boolean;
  elapsed_ms: number;
}

const VALID_CATEGORIES = new Set([
  "채소류", "과일류", "육류", "육류 가공", "해산물",
  "달걀·유제품", "두류·콩류", "가공식품", "음료류",
  "조미류", "발효식품", "곡류", "기타",
]);

function normalizeStorage(s: any): StorageType {
  return s === "냉동" || s === "실온" ? s : "냉장";
}

function cleanNote(n?: string): string | undefined {
  if (!n) return undefined;
  let s = n
    .replace(/[a-zA-Z]+/g, "")
    .replace(/[一-鿿]+/g, "")
    .replace(/\s+/g, " ")
    .replace(/[.,!?]\s*$/g, "")
    .trim();
  if (!s || s.length < 2) return undefined;
  return s.slice(0, 30);
}

export async function suggestExpiry(query: string): Promise<ExpirySuggestion> {
  const t0 = Date.now();
  const trimmed = query.trim();
  if (!trimmed) {
    return {
      query, name: query, storage_type: "냉장", days: 7,
      source: "default", is_food: true,
      elapsed_ms: Date.now() - t0,
    };
  }

  // 1) DB hit
  const m = matchExpiry(trimmed);
  if (m.row) {
    return {
      query: trimmed,
      name: m.row.food_name,
      category: m.row.category,
      storage_type: m.row.storage_type,
      days: m.row.expiry_days_default,
      note: m.row.note || undefined,
      source: "db",
      matched_db_key: m.row.food_name,
      is_food: true,
      elapsed_ms: Date.now() - t0,
    };
  }

  // 2) 원격 VLM 추정
  try {
    const r = await remoteSuggestExpiry(trimmed);
    // LM-02: 서버가 음식 아님으로 판정한 경우.
    if (r.is_food === false) {
      return {
        query: trimmed,
        name: trimmed,
        storage_type: "냉장",
        days: 0,
        source: "rejected",
        is_food: false,
        note: cleanNote(r.note) ?? "식품이 아닙니다",
        elapsed_ms: Date.now() - t0,
      };
    }
    const days = Number(r.days);
    if (Number.isFinite(days) && days > 0 && days <= 1825) {
      const cat =
        typeof r.category === "string" && VALID_CATEGORIES.has(r.category) ? r.category : undefined;
      return {
        query: trimmed,
        name: typeof r.name === "string" && r.name.trim() ? r.name.trim() : trimmed,
        category: cat,
        storage_type: normalizeStorage(r.storage_type),
        days: Math.min(1825, Math.round(days)),
        note: cleanNote(r.note),
        source: "llm",
        is_food: true,
        elapsed_ms: Date.now() - t0,
      };
    }
  } catch {
    // 서버 호출 실패 → 기본값으로 폴백.
  }

  // 3) fallback
  return {
    query: trimmed,
    name: trimmed,
    storage_type: "냉장",
    days: 7,
    source: "default",
    note: "기본값",
    is_food: true,
    elapsed_ms: Date.now() - t0,
  };
}
