import fs from "node:fs";
import path from "node:path";
import type { ExpiryRow, StorageType } from "./types";

const CSV_PATH = path.join(process.cwd(), "expiry_db_utf8.csv");

let cache: ExpiryRow[] | null = null;

function parseCsv(content: string): ExpiryRow[] {
  const lines = content.split(/\r?\n/).filter((l) => l.trim().length > 0);
  const [headerLine, ...rest] = lines;
  const headers = headerLine.split(",").map((h) => h.trim());
  const rows: ExpiryRow[] = [];
  for (const line of rest) {
    // Note: this CSV has no quoted commas in any field; simple split is sufficient.
    const cols = line.split(",");
    if (cols.length < headers.length) continue;
    const r: any = {};
    headers.forEach((h, i) => (r[h] = cols[i]?.trim() ?? ""));
    rows.push({
      source: r.source,
      food_name: r.food_name,
      category: r.category,
      storage_type: (r.storage_type as StorageType) || "냉장",
      expiry_days_legacy: Number(r.expiry_days_legacy) || 0,
      expiry_days_reference: Number(r.expiry_days_reference) || 0,
      expiry_days_default: Number(r.expiry_days_default) || 0,
      note: r.note || "",
    });
  }
  return rows;
}

export function loadExpiryDb(): ExpiryRow[] {
  if (cache) return cache;
  const text = fs.readFileSync(CSV_PATH, "utf8");
  cache = parseCsv(text);
  return cache;
}

// 한글 식재료명 정규화 (괄호/공백/조사 등 제거)
function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/[()（）\[\]]/g, "")
    .replace(/[·・,/]/g, "");
}

// 별칭 사전: VLM이 흔히 뱉는 라벨 → DB 키
const ALIAS: Record<string, string> = {
  계란: "달걀",
  egg: "달걀",
  eggs: "달걀",
  chickenegg: "달걀",
  milk: "우유",
  cowmilk: "우유",
  tofu: "두부",
  beancurd: "두부",
  carrot: "당근",
  carrots: "당근",
  onion: "양파",
  onions: "양파",
  potato: "감자",
  potatoes: "감자",
  tomato: "토마토",
  tomatoes: "토마토",
  apple: "사과",
  apples: "사과",
  redapple: "사과",
  strawberry: "딸기",
  strawberries: "딸기",
  banana: "바나나",
  bananas: "바나나",
  spinach: "시금치",
  broccoli: "브로콜리",
  mushroom: "버섯",
  mushrooms: "버섯",
  butter: "버터",
  bread: "빵류",
  toast: "빵류",
  ham: "햄",
  sausage: "소시지",
  sausages: "소시지",
  cheese: "치즈(슬라이스)",
  slicedcheese: "치즈(슬라이스)",
  cabbage: "양배추",
  scallion: "대파",
  scallions: "대파",
  greenonion: "대파",
  greenonions: "대파",
  leek: "대파",
  leeks: "대파",
  파: "대파",
  쪽파: "대파",
  대파한단: "대파",
  슬라이스치즈: "치즈(슬라이스)",
  치즈: "치즈(슬라이스)",
  소세지: "소시지",
  요구르트: "발효유",
  요거트: "발효유",
  beef: "소고기(생)",
  rawbeef: "소고기(생)",
  pork: "돼지고기(생)",
  rawpork: "돼지고기(생)",
  chicken: "닭고기(생)",
  rawchicken: "닭고기(생)",
  fish: "생선(흰살)",
  whitefish: "생선(흰살)",
  shrimp: "새우(생)",
  shrimps: "새우(생)",
  prawn: "새우(생)",
  yogurt: "요거트",
  yoghurt: "요거트",
  cucumber: "오이",
  cucumbers: "오이",
  lettuce: "양상추",
  zucchini: "애호박",
  zucchinis: "애호박",
  squash: "애호박",
  bellpepper: "피망",
  pepper: "피망",
  paprika: "파프리카",
  chili: "청양고추",
  chilipepper: "청양고추",
  garlic: "마늘",
  ginger: "생강",
  eggplant: "가지",
  perilla: "깻잎",
  beansprout: "콩나물",
  beansprouts: "콩나물",
  mungbeansprout: "숙주",
  orange: "오렌지",
  oranges: "오렌지",
  tangerine: "귤",
  mandarin: "귤",
  grape: "포도",
  grapes: "포도",
  peach: "복숭아",
  peaches: "복숭아",
  watermelon: "수박",
  blueberry: "블루베리",
  blueberries: "블루베리",
  lemon: "레몬",
  lemons: "레몬",
  salmon: "연어",
  squid: "오징어",
  calamari: "오징어",
  bacon: "베이컨",
  rice: "쌀",
  cookedrice: "쌀",
  ramen: "라면",
  ramyun: "라면",
  kimchi: "김치",
  vinegar: "식초",
  oliveoil: "올리브유",
  sesameoil: "참기름",
  tuna: "참치캔",
  cannedtuna: "참치캔",
};

export interface MatchResult {
  row: ExpiryRow | null;
  matched: boolean;
  normalized_key: string;
}

export function matchExpiry(label: string): MatchResult {
  const db = loadExpiryDb();
  const raw = label.trim();
  const norm = normalize(raw);
  const alias = ALIAS[norm];
  const target = alias ?? raw;
  const targetNorm = normalize(target);

  // 1) exact match on food_name
  let row = db.find((r) => normalize(r.food_name) === targetNorm);
  if (row) return { row, matched: true, normalized_key: row.food_name };

  // 2) substring match (label contains db name or vice versa)
  row = db.find((r) => {
    const fn = normalize(r.food_name);
    return targetNorm.includes(fn) || fn.includes(targetNorm);
  });
  if (row) return { row, matched: true, normalized_key: row.food_name };

  return { row: null, matched: false, normalized_key: target };
}

// 식재료별 탄소 계수 (kgCO2eq / kg) — Poore & Nemecek 2018 기반 단순화 표
// DB의 category로 1차 매핑하고, 특정 키워드는 override.
const CO2_BY_CATEGORY: Record<string, number> = {
  육류: 20,
  "육류 가공": 18,
  해산물: 5,
  "달걀·유제품": 4.5,
  "두류·콩류": 1,
  채소류: 0.4,
  과일류: 0.5,
  가공식품: 3,
  음료류: 1.2,
  조미류: 2,
  발효식품: 1.5,
  곡류: 2.7,
};

const CO2_OVERRIDES: Record<string, number> = {
  "소고기(생)": 60,
  "돼지고기(생)": 7,
  "닭고기(생)": 6,
  "치즈(슬라이스)": 21,
  버터: 12,
  우유: 3,
};

export function co2PerKg(row: ExpiryRow | null, fallbackName?: string): number {
  if (row && CO2_OVERRIDES[row.food_name] != null) return CO2_OVERRIDES[row.food_name];
  if (row && CO2_BY_CATEGORY[row.category] != null) return CO2_BY_CATEGORY[row.category];
  return 2.5; // 평균 식품 추정값
}
