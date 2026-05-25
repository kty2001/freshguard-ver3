// ver3: 직접 입력 식재료에 대한 유통기한 추정.
// 정책: 로컬 DB(expiry_db_utf8.csv)는 더 이상 유통기한 산정에 사용하지 않음.
// 항상 원격 VLM(LLM의 사전 지식)에 위임. LLM 실패 시에만 기본값으로 폴백.

import type { StorageType } from "./types";
import { suggestExpiry as remoteSuggestExpiry } from "./vlmServer";
import { findInAllowlist } from "./foodAllowlist";

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

  // 0) 클라이언트 화이트리스트 — VLM이 자주 식품 아님으로 오판하는 외국·가공·특수 식품 우선 처리.
  //    여기에 매칭되면 VLM 호출을 건너뛰고 즉시 식품으로 인정.
  const allowlisted = findInAllowlist(trimmed);
  if (allowlisted) {
    return {
      query: trimmed,
      name: trimmed,
      category: allowlisted.category,
      storage_type: allowlisted.storage_type,
      days: allowlisted.days,
      source: "db",
      is_food: true,
      elapsed_ms: Date.now() - t0,
    };
  }

  // 1) 원격 VLM (LLM 사전 지식).
  try {
    const r = await remoteSuggestExpiry(trimmed);
    // LM-02: 서버가 음식 아님으로 판정한 경우 — 화이트리스트 재확인 후 거부.
    if (r.is_food === false) {
      const fallback = findInAllowlist(trimmed);
      if (fallback) {
        return {
          query: trimmed,
          name: trimmed,
          category: fallback.category,
          storage_type: fallback.storage_type,
          days: fallback.days,
          source: "db",
          is_food: true,
          elapsed_ms: Date.now() - t0,
        };
      }
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

  // 2) LLM 호출 실패 또는 유효하지 않은 응답 → 기본값.
  return {
    query: trimmed,
    name: trimmed,
    storage_type: "냉장",
    days: 7,
    source: "default",
    note: "AI 추정 실패 — 기본값 7일",
    is_food: true,
    elapsed_ms: Date.now() - t0,
  };
}
