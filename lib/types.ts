export type StorageType = "냉장" | "냉동" | "실온";

export interface ExpiryRow {
  source: string;
  food_name: string;
  category: string;
  storage_type: StorageType;
  expiry_days_legacy: number;
  expiry_days_reference: number;
  expiry_days_default: number;
  note: string;
}

export interface InventoryItem {
  id: string;
  name: string;
  display_name: string;
  quantity: number;
  unit: string;
  category?: string;
  storage_type?: StorageType;
  added_at: string;
  expires_at: string;
  expiry_days_used: number;
  source_confidence?: number;
  is_consumed: boolean;
  consumed_at?: string;
  matched_db_key?: string;
  manual?: boolean;
}

export type RemoveKind = "eaten" | "disposed" | "mistake";

export interface ConsumeLog {
  id: string;
  item_id: string;
  name: string;
  category?: string;
  quantity: number;
  consumed_at: string;
  kind: RemoveKind;
  co2_saved_kg: number;
  food_waste_g: number;
  money_saved_krw: number;
  disposal_cost_krw: number;
}

export interface Milestone {
  id: string;
  label: string;
  goal: number;
  current: number;
  unit: string;
  achieved: boolean;
}

export interface EcoSummary {
  total_consumed_items: number;
  total_disposed_items: number;
  co2_saved_kg: number;
  food_waste_kg: number;
  money_saved_krw: number;
  disposal_cost_krw: number;
  budget_spent_krw: number;
  weekly: { date: string; consumed: number; disposed: number }[];
  by_category: { category: string; count: number; food_waste_kg: number; co2_kg: number }[];
  milestones: Milestone[];
  streak_days: number;
}

export interface RecognizedItem {
  label: string;
  quantity: number;
  unit: string;
  confidence: number;
}

export interface BudgetEntry {
  id: string;
  item_id?: string;
  name: string;
  amount_krw: number;
  added_at: string;
  memo?: string;
}
