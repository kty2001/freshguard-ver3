// VLM이 식품 아닌 것으로 오판하기 쉬운 외국·가공·특수 식품 화이트리스트.
// 매칭되면 VLM 호출을 건너뛰고 즉시 식품으로 인정 + 기본 카테고리/유통기한 부여.

import type { StorageType } from "./types";

export interface AllowlistEntry {
  category: string;     // VALID_CATEGORIES 중 하나
  storage_type: StorageType;
  days: number;
}

// 키는 사용자가 입력할 가능성이 높은 한국어 표기. 정확 일치 → 부분 일치 순으로 매칭.
// 모두 소문자/공백 정규화 후 비교한다.
export const FOOD_ALLOWLIST: Record<string, AllowlistEntry> = {
  // ── 가공 육류 (Charcuterie / Cured Meat)
  "하몽":         { category: "육류 가공", storage_type: "냉장", days: 30 },
  "하몬":         { category: "육류 가공", storage_type: "냉장", days: 30 },
  "프로슈토":     { category: "육류 가공", storage_type: "냉장", days: 30 },
  "살라미":       { category: "육류 가공", storage_type: "냉장", days: 21 },
  "페퍼로니":     { category: "육류 가공", storage_type: "냉장", days: 21 },
  "초리조":       { category: "육류 가공", storage_type: "냉장", days: 14 },
  "베이컨":       { category: "육류 가공", storage_type: "냉장", days: 7 },
  "햄":           { category: "육류 가공", storage_type: "냉장", days: 7 },
  "소세지":       { category: "육류 가공", storage_type: "냉장", days: 7 },
  "소시지":       { category: "육류 가공", storage_type: "냉장", days: 7 },
  "비엔나":       { category: "육류 가공", storage_type: "냉장", days: 7 },
  "푸아그라":     { category: "육류 가공", storage_type: "냉장", days: 14 },

  // ── 치즈
  "모차렐라":     { category: "달걀·유제품", storage_type: "냉장", days: 7 },
  "모짜렐라":     { category: "달걀·유제품", storage_type: "냉장", days: 7 },
  "리코타":       { category: "달걀·유제품", storage_type: "냉장", days: 5 },
  "리코타치즈":   { category: "달걀·유제품", storage_type: "냉장", days: 5 },
  "마스카포네":   { category: "달걀·유제품", storage_type: "냉장", days: 7 },
  "까망베르":     { category: "달걀·유제품", storage_type: "냉장", days: 14 },
  "카망베르":     { category: "달걀·유제품", storage_type: "냉장", days: 14 },
  "브리":         { category: "달걀·유제품", storage_type: "냉장", days: 14 },
  "브리치즈":     { category: "달걀·유제품", storage_type: "냉장", days: 14 },
  "페타":         { category: "달걀·유제품", storage_type: "냉장", days: 14 },
  "페타치즈":     { category: "달걀·유제품", storage_type: "냉장", days: 14 },
  "고다":         { category: "달걀·유제품", storage_type: "냉장", days: 30 },
  "고다치즈":     { category: "달걀·유제품", storage_type: "냉장", days: 30 },
  "에담":         { category: "달걀·유제품", storage_type: "냉장", days: 30 },
  "체다":         { category: "달걀·유제품", storage_type: "냉장", days: 30 },
  "체다치즈":     { category: "달걀·유제품", storage_type: "냉장", days: 30 },
  "그뤼에르":     { category: "달걀·유제품", storage_type: "냉장", days: 60 },
  "파르메산":     { category: "달걀·유제품", storage_type: "냉장", days: 90 },
  "파마산":       { category: "달걀·유제품", storage_type: "냉장", days: 90 },
  "파르미지아노": { category: "달걀·유제품", storage_type: "냉장", days: 90 },

  // ── 해산물 가공
  "캐비어":       { category: "해산물", storage_type: "냉장", days: 14 },
  "안초비":       { category: "해산물", storage_type: "냉장", days: 30 },
  "훈제연어":     { category: "해산물", storage_type: "냉장", days: 7 },
  "훈제장어":     { category: "해산물", storage_type: "냉장", days: 7 },
  "명란":         { category: "해산물", storage_type: "냉장", days: 7 },
  "꼬치명란":     { category: "해산물", storage_type: "냉장", days: 7 },
  "어묵":         { category: "해산물", storage_type: "냉장", days: 14 },
  "게맛살":       { category: "해산물", storage_type: "냉장", days: 14 },

  // ── 외국 채소·과일
  "아보카도":     { category: "과일류", storage_type: "냉장", days: 7 },
  "망고":         { category: "과일류", storage_type: "냉장", days: 7 },
  "파파야":       { category: "과일류", storage_type: "냉장", days: 7 },
  "용과":         { category: "과일류", storage_type: "냉장", days: 7 },
  "두리안":       { category: "과일류", storage_type: "냉장", days: 5 },
  "람부탄":       { category: "과일류", storage_type: "냉장", days: 5 },
  "트러플":       { category: "채소류", storage_type: "냉장", days: 7 },
  "송로버섯":     { category: "채소류", storage_type: "냉장", days: 7 },
  "아티초크":     { category: "채소류", storage_type: "냉장", days: 7 },
  "오크라":       { category: "채소류", storage_type: "냉장", days: 5 },
  "셀러리악":     { category: "채소류", storage_type: "냉장", days: 14 },
  "비트":         { category: "채소류", storage_type: "냉장", days: 14 },
  "비트뿌리":     { category: "채소류", storage_type: "냉장", days: 14 },
  "콜라비":       { category: "채소류", storage_type: "냉장", days: 14 },
  "케일":         { category: "채소류", storage_type: "냉장", days: 7 },
  "루꼴라":       { category: "채소류", storage_type: "냉장", days: 5 },

  // ── 발효식품 / 절임
  "사우어크라우트": { category: "발효식품", storage_type: "냉장", days: 60 },
  "김치":         { category: "발효식품", storage_type: "냉장", days: 30 },
  "단무지":       { category: "발효식품", storage_type: "냉장", days: 30 },
  "장아찌":       { category: "발효식품", storage_type: "냉장", days: 60 },
  "피클":         { category: "발효식품", storage_type: "냉장", days: 60 },
  "올리브":       { category: "발효식품", storage_type: "냉장", days: 60 },

  // ── 조미·소스
  "발사믹":       { category: "조미류", storage_type: "실온", days: 365 },
  "발사믹식초":   { category: "조미류", storage_type: "실온", days: 365 },
  "올리브유":     { category: "조미류", storage_type: "실온", days: 365 },
  "참기름":       { category: "조미류", storage_type: "실온", days: 180 },
  "들기름":       { category: "조미류", storage_type: "냉장", days: 90 },
  "마요네즈":     { category: "조미류", storage_type: "냉장", days: 60 },
  "케첩":         { category: "조미류", storage_type: "냉장", days: 90 },
  "머스타드":     { category: "조미류", storage_type: "냉장", days: 90 },
  "스리라차":     { category: "조미류", storage_type: "냉장", days: 180 },
  "타바스코":     { category: "조미류", storage_type: "실온", days: 365 },
  "쯔유":         { category: "조미류", storage_type: "냉장", days: 90 },
  "굴소스":       { category: "조미류", storage_type: "냉장", days: 90 },
  "두반장":       { category: "조미류", storage_type: "냉장", days: 90 },

  // ── 가공식품 / 즉석
  "파스타":       { category: "곡류", storage_type: "실온", days: 365 },
  "스파게티":     { category: "곡류", storage_type: "실온", days: 365 },
  "라자냐":       { category: "가공식품", storage_type: "냉장", days: 3 },
  "피자":         { category: "가공식품", storage_type: "냉장", days: 3 },
  "햄버거":       { category: "가공식품", storage_type: "냉장", days: 2 },
  "샌드위치":     { category: "가공식품", storage_type: "냉장", days: 2 },
  "타코":         { category: "가공식품", storage_type: "냉장", days: 2 },
  "또띠야":       { category: "곡류", storage_type: "냉장", days: 14 },
  "베이글":       { category: "곡류", storage_type: "냉장", days: 5 },
  "크루아상":     { category: "곡류", storage_type: "실온", days: 2 },
  "잉글리쉬머핀": { category: "곡류", storage_type: "냉장", days: 7 },
  "감자튀김":     { category: "가공식품", storage_type: "냉장", days: 2 },

  // ── 음료 / 알코올
  "와인":         { category: "음료류", storage_type: "실온", days: 365 },
  "샴페인":       { category: "음료류", storage_type: "냉장", days: 365 },
  "사케":         { category: "음료류", storage_type: "냉장", days: 180 },
  "막걸리":       { category: "음료류", storage_type: "냉장", days: 30 },
  "맥주":         { category: "음료류", storage_type: "냉장", days: 90 },
};

function normalize(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, "");
}

export function findInAllowlist(query: string): AllowlistEntry | null {
  const norm = normalize(query);
  if (!norm) return null;
  // 1) 정확 일치 우선
  for (const [key, entry] of Object.entries(FOOD_ALLOWLIST)) {
    if (normalize(key) === norm) return entry;
  }
  // 2) 부분 포함 — 사용자가 "이베리코 하몽" 같이 변형 입력했을 때
  for (const [key, entry] of Object.entries(FOOD_ALLOWLIST)) {
    if (norm.includes(normalize(key))) return entry;
  }
  return null;
}
