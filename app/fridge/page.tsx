"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { categoryColor, foodEmoji } from "@/lib/foodIcon";
import ManualAddCard from "../_components/ManualAddCard";

type Item = {
  id: string;
  name: string;
  display_name: string;
  matched_db_key?: string;
  category?: string;
  quantity: number;
  unit: string;
  added_at: string;
  expires_at: string;
  expiry_days_used: number;
  days_left: number;
  is_consumed: boolean;
  manual?: boolean;
};

// FR-01: 같은 식재료 + 같은 유통기한(같은 만료일)만 '개수'로 묶음.
//        유통기한이 다르면 별도 항목으로 유지.
type Group = {
  key: string;
  name: string;
  category?: string;
  expires_at: string;
  added_at: string;
  days_left: number;
  total_quantity: number;
  unit: string;
  items: Item[];
  manual: boolean;
};

function tone(d: number): "danger" | "warn" | "ok" {
  if (d <= 1) return "danger";
  if (d <= 3) return "warn";
  return "ok";
}

function groupItems(items: Item[]): Group[] {
  const map = new Map<string, Group>();
  for (const it of items) {
    const name = it.matched_db_key ?? it.display_name;
    const expiryDate = it.expires_at.slice(0, 10);
    const key = `${name}__${expiryDate}`;
    const cur = map.get(key);
    if (cur) {
      cur.total_quantity += it.quantity;
      cur.items.push(it);
      cur.manual = cur.manual && (it.manual ?? false);
    } else {
      map.set(key, {
        key,
        name,
        category: it.category,
        expires_at: it.expires_at,
        added_at: it.added_at,
        days_left: it.days_left,
        total_quantity: it.quantity,
        unit: it.unit,
        items: [it],
        manual: it.manual ?? false,
      });
    }
  }
  return Array.from(map.values()).sort((a, b) => a.days_left - b.days_left);
}

export default function FridgePage() {
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(false);
  const [view, setView] = useState<"grid" | "list">("grid");
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [editing, setEditing] = useState<Group | null>(null);

  async function load() {
    setLoading(true);
    const r = await fetch("/api/inventory");
    const j = await r.json();
    setItems((j.items ?? []).filter((i: Item) => !i.is_consumed));
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  const groups = useMemo(() => groupItems(items), [items]);

  // FR-04: 모든 항목이 카테고리를 가지므로 (수동 입력은 '기타' 폴백), 전체 보기에서 누락되지 않음.
  const categories = useMemo(
    () => Array.from(new Set(items.map((i) => i.category).filter(Boolean))) as string[],
    [items]
  );

  const filtered = useMemo(() => {
    let arr = groups;
    if (query.trim()) {
      const q = query.trim().toLowerCase();
      arr = arr.filter(
        (g) =>
          g.name.toLowerCase().includes(q) ||
          (g.category ?? "").toLowerCase().includes(q)
      );
    }
    if (category) arr = arr.filter((g) => (g.category ?? "기타") === category);
    return arr;
  }, [groups, query, category]);

  const empty = items.length === 0;

  return (
    <>
      <div className="row spread">
        <h1 style={{ margin: 0 }}>냉장고</h1>
        <div className="row" style={{ gap: 6 }}>
          <button
            className={view === "grid" ? "btn" : "btn ghost"}
            onClick={() => setView("grid")}
            style={{ padding: "6px 10px", fontSize: 12, minHeight: 32 }}
          >타일</button>
          <button
            className={view === "list" ? "btn" : "btn ghost"}
            onClick={() => setView("list")}
            style={{ padding: "6px 10px", fontSize: 12, minHeight: 32 }}
          >목록</button>
        </div>
      </div>
      <p className="muted" style={{ marginTop: 0 }}>
        {empty ? "재료가 없어요. 아래에서 직접 추가하거나 홈에서 사진을 찍어보세요." : `${groups.length}종 · 총 ${items.length}항목`}
      </p>

      <div style={{ position: "sticky", top: "calc(var(--header-h))", background: "var(--bg)", paddingBottom: 8, zIndex: 5 }}>
        <input
          className="input"
          placeholder="🔍 식재료/카테고리 검색"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <div className="row" style={{ gap: 6, marginTop: 8, flexWrap: "wrap" }}>
          <button
            className={category === "" ? "btn" : "btn ghost"}
            onClick={() => setCategory("")}
            style={{ padding: "6px 10px", fontSize: 12, minHeight: 30 }}
          >전체</button>
          {categories.map((c) => (
            <button
              key={c}
              className={category === c ? "btn" : "btn ghost"}
              onClick={() => setCategory(c)}
              style={{ padding: "6px 10px", fontSize: 12, minHeight: 30 }}
            >{c}</button>
          ))}
          <button
            className={showAdd ? "btn" : "btn ghost"}
            onClick={() => setShowAdd((v) => !v)}
            style={{ marginLeft: "auto", padding: "6px 10px", fontSize: 12, minHeight: 30 }}
          >{showAdd ? "닫기" : "＋ 추가"}</button>
        </div>
      </div>

      {showAdd && (
        <div className="card">
          <ManualAddCard inline onAdded={() => { load(); }} />
        </div>
      )}

      {loading && <p className="muted">불러오는 중...</p>}

      {empty && !loading && (
        <div className="empty">
          <div className="ico">🧊</div>
          <div>아직 비어있어요</div>
          <Link href="/" className="btn" style={{ marginTop: 14, display: "inline-flex" }}>📸 사진으로 추가</Link>
        </div>
      )}

      {!empty && view === "grid" && (
        <GridView groups={filtered} onSelect={setEditing} />
      )}

      {!empty && view === "list" && (
        <ListView groups={filtered} onSelect={setEditing} />
      )}

      {/* UI-01: 클릭 시 수정 시트 표시 */}
      {editing && (
        <EditSheet
          group={editing}
          onClose={() => setEditing(null)}
          onChanged={() => { load(); setEditing(null); }}
        />
      )}
    </>
  );
}

function GridView({ groups, onSelect }: { groups: Group[]; onSelect: (g: Group) => void }) {
  const byCategory = useMemo(() => {
    const m = new Map<string, Group[]>();
    for (const g of groups) {
      const k = g.category ?? "기타";
      if (!m.has(k)) m.set(k, []);
      m.get(k)!.push(g);
    }
    return Array.from(m.entries())
      .map(([name, list]) => ({ name, items: list }))
      .sort((a, b) => b.items.length - a.items.length);
  }, [groups]);

  return (
    <div className="col" style={{ gap: 14 }}>
      {byCategory.map((c) => (
        <div key={c.name} className="card" style={{ padding: 12 }}>
          <div className="row" style={{ gap: 8, marginBottom: 10 }}>
            <span style={{
              width: 12, height: 12, borderRadius: 4, background: categoryColor(c.name),
            }} />
            <strong style={{ fontSize: 15 }}>{c.name}</strong>
            <span className="tiny">{c.items.length}종</span>
          </div>
          <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(96px, 1fr))",
            gap: 8,
          }}>
            {c.items.map((g) => <Tile key={g.key} group={g} onClick={() => onSelect(g)} />)}
          </div>
        </div>
      ))}
    </div>
  );
}

function ListView({ groups, onSelect }: { groups: Group[]; onSelect: (g: Group) => void }) {
  return (
    <div className="col" style={{ gap: 8 }}>
      {groups.map((g) => {
        const t = tone(g.days_left);
        const dLabel = g.days_left < 0 ? `만료 D+${Math.abs(g.days_left)}` : `D-${g.days_left}`;
        return (
          <button
            key={g.key}
            onClick={() => onSelect(g)}
            className="list-item"
            style={{
              borderColor: t === "danger" ? "rgba(239,68,68,0.45)" : t === "warn" ? "rgba(245,165,36,0.45)" : undefined,
              background: "transparent", textAlign: "left",
            }}
          >
            <div className="ico">{foodEmoji(g.name, g.category)}</div>
            <div className="meta">
              <div className="title">{g.name} <span className="tiny" style={{ marginLeft: 4 }}>×{g.total_quantity}</span></div>
              <div className="sub">
                {(g.category ?? "기타")}
                {g.manual && <span className="badge warn" style={{ marginLeft: 6, fontSize: 10, padding: "1px 6px" }}>수동</span>}
              </div>
            </div>
            <span className={`badge ${t}`}>{dLabel}</span>
          </button>
        );
      })}
    </div>
  );
}

function Tile({ group, onClick }: { group: Group; onClick: () => void }) {
  const d = group.days_left;
  const t = tone(d);
  const borderColor =
    t === "danger" ? "rgba(239,68,68,0.6)" :
    t === "warn" ? "rgba(245,165,36,0.6)" : "var(--border)";
  return (
    <button
      onClick={onClick}
      style={{
        background: "var(--panel-2)",
        border: `1px solid ${borderColor}`,
        borderRadius: 14,
        padding: 12,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 4,
        cursor: "pointer",
        textAlign: "center",
        color: "var(--text)",
        position: "relative",
      }}
      title={`${group.name} · D-${d}`}
    >
      <span style={{ fontSize: 32 }}>{foodEmoji(group.name, group.category)}</span>
      <span style={{ fontSize: 12, fontWeight: 600, lineHeight: 1.2, overflow: "hidden", textOverflow: "ellipsis", maxWidth: "100%", whiteSpace: "nowrap" }}>
        {group.name}
      </span>
      <span className={`badge ${t}`} style={{ fontSize: 10, padding: "1px 7px" }}>
        {d < 0 ? `만료 D+${Math.abs(d)}` : `D-${d}`}
      </span>
      {group.total_quantity > 1 && (
        <span style={{
          position: "absolute", top: 6, right: 6,
          background: "var(--accent)", color: "#0b0f13",
          fontSize: 11, fontWeight: 700,
          borderRadius: 10, padding: "1px 6px",
        }}>×{group.total_quantity}</span>
      )}
    </button>
  );
}

// UI-01 + FR-02/03: 클릭 시 수정 시트. 한 항목씩 '소비/처리/잘못 입력 삭제' 처리.
function EditSheet({ group, onClose, onChanged }: {
  group: Group; onClose: () => void; onChanged: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function action(item: Item, kind: "eaten" | "disposed" | "mistake") {
    if (kind === "mistake" && !confirm("잘못 입력한 항목으로 처리(삭제)할까요?\n에코 통계에는 반영되지 않습니다.")) return;
    setBusy(true); setErr(null);
    try {
      const r = await fetch("/api/inventory/consume", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: item.id, kind }),
      });
      const j = await r.json();
      if (!r.ok && !j.ok) throw new Error(j.error ?? "처리 실패");
      onChanged();
    } catch (e: any) {
      setErr(e.message ?? String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, zIndex: 40,
        background: "rgba(0,0,0,0.5)",
        display: "flex", alignItems: "flex-end", justifyContent: "center",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "var(--panel)", color: "var(--text)",
          width: "100%", maxWidth: 520,
          borderRadius: "16px 16px 0 0",
          padding: 16, maxHeight: "85vh", overflowY: "auto",
          border: "1px solid var(--border)",
          paddingBottom: "calc(16px + env(safe-area-inset-bottom))",
        }}
      >
        <div className="row spread" style={{ marginBottom: 10 }}>
          <div className="row" style={{ gap: 10 }}>
            <span style={{ fontSize: 28 }}>{foodEmoji(group.name, group.category)}</span>
            <div>
              <div style={{ fontSize: 17, fontWeight: 700 }}>{group.name}</div>
              <div className="tiny">{group.category ?? "기타"} · D-{group.days_left} · 총 {group.total_quantity}개</div>
            </div>
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="close">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
              <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
            </svg>
          </button>
        </div>

        <p className="tiny" style={{ marginTop: 0 }}>
          항목별 처리 방식을 선택하세요. 다 먹었다면 ‘소비’, 상해서 버린다면 ‘음식물 처리’, 잘못 입력했다면 ‘잘못 입력 삭제’.
        </p>

        <div className="col" style={{ gap: 8 }}>
          {group.items.map((it) => (
            <div key={it.id} className="card flat" style={{ padding: 10 }}>
              <div className="row spread">
                <div>
                  <div style={{ fontSize: 14, fontWeight: 600 }}>{it.quantity}{it.unit}</div>
                  <div className="tiny">등록 {it.added_at.slice(0, 10)} · 만료 {it.expires_at.slice(0, 10)}</div>
                </div>
              </div>
              <div className="row" style={{ gap: 6, marginTop: 10, flexWrap: "wrap" }}>
                {/* FR-02 */}
                <button
                  className="btn"
                  disabled={busy}
                  onClick={() => action(it, "eaten")}
                  style={{ flex: 1, minHeight: 38, fontSize: 13 }}
                >🍴 소비(다 먹음)</button>
                <button
                  className="btn ghost"
                  disabled={busy}
                  onClick={() => action(it, "disposed")}
                  style={{ flex: 1, minHeight: 38, fontSize: 13 }}
                >🗑️ 음식물 처리</button>
                {/* FR-03: 폐기 카운트와 분리된 '잘못 입력 삭제' */}
                <button
                  className="btn danger"
                  disabled={busy}
                  onClick={() => action(it, "mistake")}
                  style={{ flex: 1, minHeight: 38, fontSize: 13 }}
                >✏️ 잘못 입력 삭제</button>
              </div>
            </div>
          ))}
        </div>

        {err && <p style={{ color: "var(--danger)", marginTop: 10 }}>오류: {err}</p>}
      </div>
    </div>
  );
}
