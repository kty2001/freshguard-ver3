import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { BudgetEntry, ConsumeLog, EcoSummary, InventoryItem, RemoveKind, StorageType } from "./types";
import { co2PerKg, loadExpiryDb, matchExpiry } from "./expiryDb";
import { suggestExpiry } from "./expirySuggest";

const DATA_DIR = path.join(process.cwd(), "data");
const ITEMS_PATH = path.join(DATA_DIR, "inventory.json");
const LOG_PATH = path.join(DATA_DIR, "consume_log.json");
const BUDGET_PATH = path.join(DATA_DIR, "budget.json");

// EC-01: 음식물 처리기 평균 가격 (kg당). 환경부 음식물쓰레기 종량제 평균 ~ 600원/kg.
export const DISPOSAL_COST_PER_KG = Number(
  process.env.DISPOSAL_COST_PER_KG ?? 600
);
const FOOD_VALUE_PER_KG = Number(process.env.FOOD_VALUE_PER_KG ?? 6000);

function ensure() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(ITEMS_PATH)) fs.writeFileSync(ITEMS_PATH, "[]", "utf8");
  if (!fs.existsSync(LOG_PATH)) fs.writeFileSync(LOG_PATH, "[]", "utf8");
  if (!fs.existsSync(BUDGET_PATH)) fs.writeFileSync(BUDGET_PATH, "[]", "utf8");
}

export function readItems(): InventoryItem[] {
  ensure();
  return JSON.parse(fs.readFileSync(ITEMS_PATH, "utf8"));
}

function writeItems(items: InventoryItem[]) {
  ensure();
  fs.writeFileSync(ITEMS_PATH, JSON.stringify(items, null, 2), "utf8");
}

export function readLogs(): ConsumeLog[] {
  ensure();
  const raw: any[] = JSON.parse(fs.readFileSync(LOG_PATH, "utf8"));
  // 마이그레이션: 기존 로그에 kind/disposal_cost가 없으면 보강.
  return raw.map((l) => ({
    kind: (l.kind as RemoveKind) ?? "eaten",
    disposal_cost_krw: l.disposal_cost_krw ?? 0,
    ...l,
  })) as ConsumeLog[];
}

function writeLogs(logs: ConsumeLog[]) {
  ensure();
  fs.writeFileSync(LOG_PATH, JSON.stringify(logs, null, 2), "utf8");
}

export function readBudget(): BudgetEntry[] {
  ensure();
  return JSON.parse(fs.readFileSync(BUDGET_PATH, "utf8"));
}

function writeBudget(entries: BudgetEntry[]) {
  ensure();
  fs.writeFileSync(BUDGET_PATH, JSON.stringify(entries, null, 2), "utf8");
}

export interface AddItemInput {
  display_name: string;
  quantity?: number;
  unit?: string;
  manual_expiry_days?: number;
  manual?: boolean;
  added_at?: string;
  category?: string;
  price_krw?: number;
}

// ver3 정책: 유통기한·카테고리·보관법은 로컬 DB를 사용하지 않고 LLM에 위임.
// manual_expiry_days가 입력되면 그대로 사용, 아니면 suggestExpiry로 LLM 호출.
export async function addItem(input: AddItemInput): Promise<InventoryItem> {
  const items = readItems();

  let days: number;
  let category: string | undefined;
  let storage_type: StorageType = "냉장";
  let normalized_name = input.display_name.trim();

  if (input.manual_expiry_days != null && input.manual_expiry_days > 0) {
    days = input.manual_expiry_days;
    category = input.category;
  } else {
    // 1) 로컬 DB에서 먼저 조회 (즉시 응답, VLM 호출 없음).
    const dbMatch = matchExpiry(input.display_name);
    if (dbMatch.matched && dbMatch.row && dbMatch.row.expiry_days_default > 0) {
      days = dbMatch.row.expiry_days_default;
      category = dbMatch.row.category ?? input.category;
      storage_type = (dbMatch.row.storage_type as StorageType) ?? "냉장";
      if (dbMatch.row.food_name) normalized_name = dbMatch.row.food_name;
    } else {
      // 2) DB에 없는 경우에만 LLM에 위임.
      const r = await suggestExpiry(input.display_name);
      days = r.days > 0 ? r.days : 7;
      category = r.category ?? input.category;
      storage_type = r.storage_type;
      if (r.name && r.name.trim()) normalized_name = r.name.trim();
    }
  }

  const added = input.added_at ? new Date(input.added_at) : new Date();
  const exp = new Date(added.getTime() + days * 24 * 60 * 60 * 1000);

  // FR-04: 카테고리 없는 항목이 '전체' 필터에서 누락 → '기타' 폴백 보장.
  category = category ?? "기타";

  const item: InventoryItem = {
    id: randomUUID(),
    name: normalized_name,
    display_name: input.display_name.trim(),
    quantity: Math.max(1, Math.round(input.quantity ?? 1)),
    unit: input.unit?.trim() || defaultUnit(normalized_name),
    category,
    storage_type,
    added_at: added.toISOString(),
    expires_at: exp.toISOString(),
    expiry_days_used: days,
    is_consumed: false,
    matched_db_key: normalized_name,
    manual: input.manual ?? true,
  };

  items.push(item);
  writeItems(items);

  // EC-02 가계부: 금액 입력이 있으면 함께 기록.
  if (typeof input.price_krw === "number" && input.price_krw > 0) {
    const entries = readBudget();
    entries.push({
      id: randomUUID(),
      item_id: item.id,
      name: item.matched_db_key ?? item.display_name,
      amount_krw: Math.round(input.price_krw),
      added_at: item.added_at,
    });
    writeBudget(entries);
  }

  return item;
}

function defaultUnit(name: string): string {
  if (/(달걀)/.test(name)) return "개";
  if (/(두부)/.test(name)) return "모";
  if (/(우유|주스|음료)/.test(name)) return "팩";
  if (/(대파|쪽파)/.test(name)) return "단";
  return "개";
}

// FR-03: '폐기'와 '잘못 입력 삭제' 분리. 'mistake'는 로그 미적재.
// qty 미지정 시 전체 삭제. 지정 시 해당 개수만 차감(0 이하 되면 삭제).
export function removeItem(id: string, qty?: number): boolean {
  const items = readItems();
  const idx = items.findIndex((i) => i.id === id);
  if (idx < 0) return false;
  if (qty == null) {
    items.splice(idx, 1);
  } else {
    const remove = Math.max(1, Math.round(qty));
    if (remove >= items[idx].quantity) {
      items.splice(idx, 1);
    } else {
      items[idx] = { ...items[idx], quantity: items[idx].quantity - remove };
    }
  }
  writeItems(items);
  return true;
}

// FR-02: 소비/처리 분리 → kind='eaten' | 'disposed' | 'mistake'
// qty 미지정 시 전체 소비(기존 동작). 지정 시 그 개수만 차감하고 로그도 그 개수 기준.
export function consumeItem(
  id: string,
  kind: RemoveKind = "eaten",
  weight_g?: number,
  qty?: number
): ConsumeLog | null {
  const items = readItems();
  const idx = items.findIndex((i) => i.id === id && !i.is_consumed);
  if (idx < 0) return null;
  const it = items[idx];

  const requested = qty == null ? it.quantity : Math.max(1, Math.round(qty));
  const removeQty = Math.min(requested, it.quantity);
  const remainder = it.quantity - removeQty;

  if (kind === "mistake") {
    if (remainder <= 0) {
      items.splice(idx, 1);
    } else {
      items[idx] = { ...it, quantity: remainder };
    }
    writeItems(items);
    return null;
  }

  const consumed_at = new Date().toISOString();
  if (remainder <= 0) {
    items[idx] = { ...it, is_consumed: true, consumed_at };
  } else {
    // 부분 소비: 수량만 줄이고 항목은 활성 유지.
    items[idx] = { ...it, quantity: remainder };
  }
  writeItems(items);

  const db = loadExpiryDb();
  const row = db.find((r) => r.food_name === it.matched_db_key) ?? null;
  const co2pk = co2PerKg(row, it.name);

  // 무게는 차감 개수 기준으로 추정 (전체 무게가 아님).
  const grams = weight_g ?? estimateGrams(it.unit, removeQty);

  // EC-01: 음식물 처리(disposed)일 때 kg당 처리 비용 발생.
  const disposal_cost_krw =
    kind === "disposed" ? Math.round((grams / 1000) * DISPOSAL_COST_PER_KG) : 0;

  // 절감 금액은 잘 먹은 만큼만 적립.
  const money_saved_krw =
    kind === "eaten" ? Math.round((grams / 1000) * FOOD_VALUE_PER_KG) : 0;

  const log: ConsumeLog = {
    id: randomUUID(),
    item_id: it.id,
    name: it.matched_db_key ?? it.display_name,
    category: it.category,
    quantity: removeQty,
    consumed_at,
    kind,
    co2_saved_kg: kind === "eaten" ? +((grams / 1000) * co2pk).toFixed(3) : 0,
    food_waste_g: grams,
    money_saved_krw,
    disposal_cost_krw,
  };

  const logs = readLogs();
  logs.push(log);
  writeLogs(logs);
  return log;
}

function estimateGrams(unit: string, qty: number): number {
  const u = unit.trim();
  const per = (() => {
    switch (u) {
      case "개": return 80;
      case "모": return 300;
      case "단": return 150;
      case "팩": return 1000;
      case "g": return 1;
      case "kg": return 1000;
      case "ml": return 1;
      case "L": return 1000;
      default: return 100;
    }
  })();
  return Math.max(1, per * qty);
}

export function daysUntil(iso: string): number {
  const ms = new Date(iso).getTime() - Date.now();
  return Math.ceil(ms / (24 * 60 * 60 * 1000));
}

export function expiringSoon(threshold = 3): InventoryItem[] {
  return readItems()
    .filter((i) => !i.is_consumed && daysUntil(i.expires_at) <= threshold)
    .sort((a, b) => daysUntil(a.expires_at) - daysUntil(b.expires_at));
}

function computeStreak(logs: ConsumeLog[]): number {
  const eaten = logs.filter((l) => l.kind === "eaten");
  if (eaten.length === 0) return 0;
  const dateKey = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const set = new Set(eaten.map((l) => dateKey(new Date(l.consumed_at))));
  let streak = 0;
  const cur = new Date();
  cur.setHours(0, 0, 0, 0);
  while (set.has(dateKey(cur))) {
    streak++;
    cur.setDate(cur.getDate() - 1);
  }
  return streak;
}

function buildMilestones(
  total: number,
  food_waste_kg: number,
  co2_kg: number,
  streak: number
): import("./types").Milestone[] {
  const m = (
    id: string,
    label: string,
    goal: number,
    current: number,
    unit: string
  ): import("./types").Milestone => ({
    id, label, goal,
    current: +current.toFixed(2),
    unit,
    achieved: current >= goal,
  });
  return [
    m("first_consume", "첫 소진 완료", 1, total, "건"),
    m("ten_items", "10개 소진", 10, total, "건"),
    m("fifty_items", "50개 소진", 50, total, "건"),
    m("waste_1kg", "1kg 음식물 절감", 1, food_waste_kg, "kg"),
    m("waste_5kg", "5kg 음식물 절감", 5, food_waste_kg, "kg"),
    m("co2_2kg", "CO₂ 2kg 절감", 2, co2_kg, "kg"),
    m("streak_3", "3일 연속 관리", 3, streak, "일"),
    m("streak_7", "일주일 연속 관리", 7, streak, "일"),
  ];
}

export function ecoSummary(): EcoSummary {
  const logs = readLogs();
  const eaten = logs.filter((l) => l.kind === "eaten");
  const disposed = logs.filter((l) => l.kind === "disposed");

  const co2 = eaten.reduce((s, l) => s + l.co2_saved_kg, 0);
  const grams = eaten.reduce((s, l) => s + l.food_waste_g, 0);
  const money_saved = eaten.reduce((s, l) => s + l.money_saved_krw, 0);
  const disposal_cost = disposed.reduce((s, l) => s + l.disposal_cost_krw, 0);

  const fmt = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

  const days: { date: string; consumed: number; disposed: number }[] = [];
  for (let d = 6; d >= 0; d--) {
    const day = new Date();
    day.setHours(0, 0, 0, 0);
    day.setDate(day.getDate() - d);
    const next = new Date(day);
    next.setDate(next.getDate() + 1);
    const inDay = (l: ConsumeLog) =>
      new Date(l.consumed_at) >= day && new Date(l.consumed_at) < next;
    days.push({
      date: fmt(day),
      consumed: eaten.filter(inDay).length,
      disposed: disposed.filter(inDay).length,
    });
  }

  const catMap = new Map<
    string,
    { count: number; food_waste_kg: number; co2_kg: number }
  >();
  for (const l of eaten) {
    const k = l.category ?? "기타";
    const v = catMap.get(k) ?? { count: 0, food_waste_kg: 0, co2_kg: 0 };
    v.count += 1;
    v.food_waste_kg += l.food_waste_g / 1000;
    v.co2_kg += l.co2_saved_kg;
    catMap.set(k, v);
  }
  const by_category = Array.from(catMap.entries())
    .map(([category, v]) => ({
      category,
      count: v.count,
      food_waste_kg: +v.food_waste_kg.toFixed(2),
      co2_kg: +v.co2_kg.toFixed(2),
    }))
    .sort((a, b) => b.count - a.count);

  const food_waste_kg = +(grams / 1000).toFixed(2);
  const co2_saved_kg = +co2.toFixed(2);
  const streak = computeStreak(logs);

  const budget_spent_krw = readBudget().reduce((s, b) => s + b.amount_krw, 0);

  return {
    total_consumed_items: eaten.length,
    total_disposed_items: disposed.length,
    co2_saved_kg,
    food_waste_kg,
    money_saved_krw: money_saved,
    disposal_cost_krw: disposal_cost,
    budget_spent_krw,
    weekly: days,
    by_category,
    milestones: buildMilestones(eaten.length, food_waste_kg, co2_saved_kg, streak),
    streak_days: streak,
  };
}
