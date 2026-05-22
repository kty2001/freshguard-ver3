// ver3: 레시피 추천을 원격 VLM 서버에 위임.
// 서버는 한국어로 5개의 한국 가정 메뉴를 추천해야 한다.
// 본 모듈은 서버 응답을 정리(언어 후처리 + 5건 절단)하는 클라이언트.

import type { InventoryItem } from "./types";
import { suggestRecipes as remoteSuggestRecipes } from "./vlmServer";

export interface MenuSuggestion {
  name: string;
  uses: string[];
  reason: string;
  category?: string;
}

export interface RecipeRequest {
  expiring: InventoryItem[];
  all: InventoryItem[];
  must_use?: string[];
  allergies?: string[];
}

export interface RecipeResult {
  suggestions: MenuSuggestion[];
  raw: string;
  model: string;
  elapsed_ms: number;
}

const COUNT = 5;

// RE-07 안전망: 서버 응답이 외국어를 흘려보내도 클라이언트에서 정리.
const KOREAN_FIXES: [RegExp, string][] = [
  [/ずつ/g, "씩"],
  [/사え/g, "사용"],
  [/하여 섞/g, "넣고 섞"],
  [/부여하여/g, "넣어"],
  [/부여한 다음/g, "넣은 다음"],
  [/부여한다/g, "넣는다"],
  [/세개ずつ/g, "세 개씩"],
  [/少许少量/g, "약간"],
  [/少许/g, "약간"],
  [/少量/g, "소량"],
  [/适量/g, "적당량"],
  [/一些/g, "약간"],
  [/一点/g, "조금"],
];

function polishKorean(s: string): string {
  let out = s;
  for (const [re, rep] of KOREAN_FIXES) out = out.replace(re, rep);
  out = out.replace(/[぀-ヿ]+/g, "").replace(/[一-鿿]+/g, "");
  // RE-02/03 표기 제거.
  out = out.replace(/\b\d+\s*분\s*(이내|안)?/g, "").replace(/\d+\s*인분/g, "");
  return out.replace(/\s+/g, " ").trim();
}

function isKorean(s: string): boolean {
  if (!s) return false;
  const kor = (s.match(/[가-힣]/g) ?? []).length;
  return kor / s.length >= 0.3;
}

const VALID_CATS = new Set([
  "찌개", "국", "볶음", "구이", "조림", "무침",
  "전·부침", "전", "샐러드", "면", "밥", "반찬",
]);

function nameOf(it: InventoryItem) {
  return it.matched_db_key ?? it.display_name;
}

export async function suggestMenus(req: RecipeRequest): Promise<RecipeResult> {
  const payload = {
    expiring: req.expiring.map(nameOf),
    all: req.all.map(nameOf),
    must_use: (req.must_use ?? []).filter(Boolean),
    allergies: req.allergies ?? [],
  };

  const t0 = Date.now();
  const r = await remoteSuggestRecipes(payload);

  const suggestions: MenuSuggestion[] = [];
  for (const raw of r.suggestions) {
    if (!raw || typeof raw.name !== "string") continue;
    const name = polishKorean(raw.name);
    if (!name || !isKorean(name)) continue;
    const reason = typeof raw.reason === "string" ? polishKorean(raw.reason) : "";
    const uses = Array.isArray(raw.uses)
      ? raw.uses
          .filter((s) => typeof s === "string")
          .map((s) => polishKorean(s))
          .filter((s) => s.length > 0)
          .slice(0, 5)
      : [];
    const category =
      typeof raw.category === "string" && VALID_CATS.has(raw.category) ? raw.category : undefined;
    suggestions.push({ name, uses, reason, category });
  }

  return {
    suggestions: suggestions.slice(0, COUNT),
    raw: r.raw ?? "",
    model: r.model ?? "vlm-remote",
    elapsed_ms: r.elapsed_ms ?? Date.now() - t0,
  };
}
