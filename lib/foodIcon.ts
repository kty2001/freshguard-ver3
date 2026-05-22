// 카테고리 / 식재료별 이모지 + 색상 매핑.
// 모바일 UI에서 시각적 분류용.

export interface FoodVisual {
  emoji: string;
  color: string; // CSS color
}

const NAME_MAP: Record<string, string> = {
  사과: "🍎", 딸기: "🍓", 바나나: "🍌", 오렌지: "🍊", 귤: "🍊",
  포도: "🍇", 복숭아: "🍑", 수박: "🍉", 블루베리: "🫐", 레몬: "🍋",
  토마토: "🍅", 당근: "🥕", 감자: "🥔", 양파: "🧅", 마늘: "🧄",
  오이: "🥒", 양상추: "🥬", 상추: "🥬", 양배추: "🥬", 시금치: "🥬",
  브로콜리: "🥦", 버섯: "🍄", 가지: "🍆", 애호박: "🥒", 피망: "🫑",
  파프리카: "🫑", 청양고추: "🌶️", 깻잎: "🌿", 콩나물: "🌱", 숙주: "🌱",
  대파: "🌿", 생강: "🫚",
  달걀: "🥚", 우유: "🥛", 버터: "🧈", 가공유: "🥛",
  "치즈(슬라이스)": "🧀", 요거트: "🍶", 발효유: "🥛", 유산균음료: "🥤",
  두부: "🍱", "두부면·곤약": "🍜",
  "돼지고기(생)": "🥩", "소고기(생)": "🥩", "닭고기(생)": "🍗",
  햄: "🍖", 프레스햄: "🍖", 소시지: "🌭", 베이컨: "🥓", 어묵: "🍢",
  "생선(흰살)": "🐟", 연어: "🐟", "새우(생)": "🦐", 오징어: "🦑",
  빵류: "🍞", 과자류: "🍪", 라면: "🍜", 쌀: "🍚", 참치캔: "🥫",
  김치: "🥬",
  "된장(개봉 후)": "🍯", "고추장(개봉 후)": "🌶️", "간장(개봉 후)": "🫙",
  식초: "🫙", 올리브유: "🫙", 참기름: "🫙",
  과채주스: "🧃",
};

const CATEGORY_MAP: Record<string, FoodVisual> = {
  과일류: { emoji: "🍎", color: "#ef4444" },
  채소류: { emoji: "🥬", color: "#36d399" },
  "두류·콩류": { emoji: "🫘", color: "#a78bfa" },
  "달걀·유제품": { emoji: "🥚", color: "#fde047" },
  육류: { emoji: "🥩", color: "#f87171" },
  "육류 가공": { emoji: "🥓", color: "#fb923c" },
  해산물: { emoji: "🐟", color: "#60a5fa" },
  가공식품: { emoji: "🥫", color: "#94a3b8" },
  음료류: { emoji: "🥤", color: "#22d3ee" },
  조미류: { emoji: "🫙", color: "#facc15" },
  발효식품: { emoji: "🥬", color: "#fb7185" },
  곡류: { emoji: "🌾", color: "#fbbf24" },
  기타: { emoji: "📦", color: "#94a3b8" },
};

export function foodEmoji(name?: string, category?: string): string {
  if (name && NAME_MAP[name]) return NAME_MAP[name];
  if (category && CATEGORY_MAP[category]) return CATEGORY_MAP[category].emoji;
  return "📦";
}

export function categoryColor(category?: string): string {
  if (category && CATEGORY_MAP[category]) return CATEGORY_MAP[category].color;
  return "#94a3b8";
}

export function categoryEmoji(category?: string): string {
  if (category && CATEGORY_MAP[category]) return CATEGORY_MAP[category].emoji;
  return "📦";
}

export const ALL_CATEGORIES = Object.keys(CATEGORY_MAP);
