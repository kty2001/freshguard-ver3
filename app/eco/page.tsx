"use client";
import { useEffect, useState } from "react";
import { categoryColor, categoryEmoji } from "@/lib/foodIcon";

type Milestone = {
  id: string;
  label: string;
  goal: number;
  current: number;
  unit: string;
  achieved: boolean;
};
type Summary = {
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
};

type BudgetEntry = {
  id: string;
  name: string;
  amount_krw: number;
  added_at: string;
};

export default function EcoPage() {
  const [s, setS] = useState<Summary | null>(null);
  const [budget, setBudget] = useState<{ entries: BudgetEntry[]; total: number }>({ entries: [], total: 0 });
  const [showBudgetForm, setShowBudgetForm] = useState(false);
  const [bName, setBName] = useState("");
  const [bAmount, setBAmount] = useState("");

  async function load() {
    const [r1, r2] = await Promise.all([
      fetch("/api/eco/summary").then((r) => r.json()),
      fetch("/api/budget").then((r) => r.json()),
    ]);
    setS(r1);
    setBudget(r2);
  }
  useEffect(() => { load(); }, []);

  async function addBudget() {
    const amount = Number(bAmount);
    if (!bName.trim() || !Number.isFinite(amount) || amount <= 0) return;
    await fetch("/api/budget", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: bName.trim(), amount_krw: amount }),
    });
    setBName(""); setBAmount(""); setShowBudgetForm(false);
    load();
  }

  async function deleteBudget(id: string) {
    if (!confirm("이 지출 항목을 삭제할까요?")) return;
    await fetch(`/api/budget?id=${encodeURIComponent(id)}`, { method: "DELETE" });
    load();
  }

  if (!s) return <p className="muted">불러오는 중...</p>;

  const maxWeek = Math.max(1, ...s.weekly.map((d) => Math.max(d.consumed, d.disposed)));
  const maxCat = Math.max(1, ...s.by_category.map((c) => c.count));
  const achievedCount = s.milestones.filter((m) => m.achieved).length;
  const netSaved = s.money_saved_krw - s.disposal_cost_krw;

  return (
    <>
      <h1>에코 임팩트</h1>
      <p className="muted" style={{ marginTop: 0 }}>
        식재료를 끝까지 잘 쓴 만큼 환경과 지갑이 가벼워져요.
      </p>

      <div className="scroll-x">
        <StatBig label="음식물 절감" value={s.food_waste_kg} unit="kg" tint="rgba(54,211,153,0.18)" />
        <StatBig label="CO₂ 절감" value={s.co2_saved_kg} unit="kg" tint="rgba(96,165,250,0.18)" />
        <StatBig label="순 절약" value={netSaved} unit="원" tint="rgba(250,204,21,0.18)" big />
        <StatBig label="소비/처리" value={s.total_consumed_items} unit={`/${s.total_disposed_items}건`} tint="rgba(167,139,250,0.18)" />
        <StatBig label="연속 관리" value={s.streak_days} unit="일" tint="rgba(251,113,133,0.18)" />
      </div>

      {/* EC-01: 처리 비용 / 절약 금액 분리 표기 */}
      <div className="card">
        <h2 style={{ marginTop: 0 }}>💰 금액 요약</h2>
        <div className="col" style={{ gap: 0 }}>
          <Field label="잘 먹어서 절약한 금액" value={`${s.money_saved_krw.toLocaleString()}원`} tone="ok" />
          <Field
            label="음식물 처리 비용"
            value={`${s.disposal_cost_krw.toLocaleString()}원`}
            tone="warn"
            hint={`kg당 ${process.env.NEXT_PUBLIC_DISPOSAL_PRICE ?? "600"}원 기준`}
          />
          {budget.total > 0 && (
            <Field label="가계부 누적 지출" value={`${budget.total.toLocaleString()}원`} />
          )}
          <Field label="순 절약 (절약 − 처리비)" value={`${netSaved.toLocaleString()}원`} bold />
        </div>
      </div>

      <div className="card">
        <div className="row spread"><h2 style={{ margin: 0 }}>최근 7일</h2><span className="tiny">소비 ▮ / 처리 ▯</span></div>
        <div style={{ display: "flex", alignItems: "flex-end", gap: 6, height: 120, marginTop: 8 }}>
          {s.weekly.map((d) => {
            const today = d.date === todayKey();
            return (
              <div key={d.date} style={{ flex: 1, textAlign: "center" }}>
                <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "center", gap: 2, height: 90 }}>
                  <div style={{
                    background: today ? "var(--accent)" : "var(--panel-2)",
                    width: "45%",
                    height: `${(d.consumed / maxWeek) * 90}px`,
                    borderRadius: 4,
                    minHeight: 2,
                  }} title={`소비 ${d.consumed}`} />
                  <div style={{
                    background: "rgba(245,165,36,0.5)",
                    width: "45%",
                    height: `${(d.disposed / maxWeek) * 90}px`,
                    borderRadius: 4,
                    minHeight: 2,
                  }} title={`처리 ${d.disposed}`} />
                </div>
                <div className="tiny" style={{ marginTop: 6 }}>{d.date.slice(5)}</div>
                <div style={{ fontSize: 11, fontWeight: 600 }}>{d.consumed}/{d.disposed}</div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="card">
        <h2 style={{ marginTop: 0 }}>카테고리별 소비</h2>
        {s.by_category.length === 0 ? (
          <p className="muted">아직 데이터가 없어요.</p>
        ) : (
          <div className="col" style={{ gap: 10 }}>
            {s.by_category.map((c) => (
              <div key={c.category}>
                <div className="row spread" style={{ marginBottom: 4 }}>
                  <div className="row" style={{ gap: 8 }}>
                    <span style={{ fontSize: 16 }}>{categoryEmoji(c.category)}</span>
                    <strong style={{ fontSize: 13 }}>{c.category}</strong>
                  </div>
                  <span className="tiny">{c.count}건 · {c.food_waste_kg}kg</span>
                </div>
                <div style={{ background: "var(--panel-2)", borderRadius: 6, overflow: "hidden", height: 8 }}>
                  <div style={{
                    background: categoryColor(c.category),
                    width: `${(c.count / maxCat) * 100}%`,
                    height: "100%",
                  }} />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* EC-02: 가계부 */}
      <div className="card">
        <div className="row spread">
          <h2 style={{ margin: 0 }}>📒 가계부</h2>
          <button
            className={showBudgetForm ? "btn ghost" : "btn"}
            onClick={() => setShowBudgetForm((v) => !v)}
            style={{ padding: "6px 10px", fontSize: 12, minHeight: 30 }}
          >{showBudgetForm ? "닫기" : "＋ 지출 추가"}</button>
        </div>
        <p className="tiny" style={{ marginTop: 0 }}>
          식재료 구매 금액을 기록하면 절약 금액과 비교할 수 있어요. (선택사항)
        </p>

        {showBudgetForm && (
          <div className="col" style={{ gap: 8, marginTop: 8 }}>
            <input
              className="input" placeholder="품목 이름"
              value={bName} onChange={(e) => setBName(e.target.value)}
            />
            <input
              className="input" type="number" inputMode="numeric" placeholder="금액 (원)"
              value={bAmount} onChange={(e) => setBAmount(e.target.value)}
            />
            <button className="btn lg" onClick={addBudget}>지출 기록</button>
          </div>
        )}

        {budget.entries.length === 0 ? (
          <p className="muted" style={{ marginTop: 10 }}>아직 지출 기록이 없어요.</p>
        ) : (
          <div className="col" style={{ gap: 6, marginTop: 10 }}>
            {budget.entries.slice().reverse().slice(0, 10).map((e) => (
              <div key={e.id} className="row spread" style={{ padding: "6px 0", borderBottom: "1px solid var(--border)" }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>{e.name}</div>
                  <div className="tiny">{e.added_at.slice(0, 10)}</div>
                </div>
                <div className="row" style={{ gap: 8, alignItems: "center" }}>
                  <span style={{ fontSize: 13, fontWeight: 700 }}>{e.amount_krw.toLocaleString()}원</span>
                  <button
                    className="icon-btn"
                    onClick={() => deleteBudget(e.id)}
                    aria-label="delete"
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                      <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                    </svg>
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="card">
        <div className="row spread">
          <h2 style={{ margin: 0 }}>마일스톤</h2>
          <span className="tiny">{achievedCount}/{s.milestones.length} 달성</span>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 8, marginTop: 10 }}>
          {s.milestones.map((m) => {
            const pct = Math.min(100, (m.current / m.goal) * 100);
            return (
              <div key={m.id} style={{
                background: m.achieved ? "rgba(54,211,153,0.12)" : "var(--panel-2)",
                border: `1px solid ${m.achieved ? "var(--accent)" : "var(--border-2)"}`,
                borderRadius: 12,
                padding: 10,
              }}>
                <div className="row spread" style={{ marginBottom: 4 }}>
                  <div style={{ fontSize: 13, fontWeight: 700 }}>{m.label}</div>
                  {m.achieved && <span style={{ fontSize: 14 }}>✅</span>}
                </div>
                <div className="tiny" style={{ marginBottom: 4 }}>{m.current}/{m.goal} {m.unit}</div>
                <div style={{ background: "var(--bg)", borderRadius: 4, height: 5, overflow: "hidden" }}>
                  <div style={{
                    background: m.achieved ? "var(--accent)" : "var(--warn)",
                    width: `${pct}%`, height: "100%",
                  }} />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}

function StatBig({ label, value, unit, tint, big }: {
  label: string; value: number; unit: string; tint: string; big?: boolean;
}) {
  return (
    <div className="stat" style={{ background: tint, border: "1px solid rgba(255,255,255,0.04)", minWidth: big ? 180 : 130 }}>
      <div className="label">{label}</div>
      <div className="value" style={{ fontSize: big ? 26 : 22 }}>
        {value.toLocaleString()}<span className="unit">{unit}</span>
      </div>
    </div>
  );
}

function Field({ label, value, mono, bold, tone, hint }: {
  label: string; value: string;
  mono?: boolean; bold?: boolean;
  tone?: "ok" | "warn";
  hint?: string;
}) {
  return (
    <div className="row spread" style={{ padding: "10px 0", borderBottom: "1px solid var(--border)" }}>
      <div>
        <div className="muted" style={{ fontSize: 13 }}>{label}</div>
        {hint && <div className="tiny">{hint}</div>}
      </div>
      <span style={{
        fontSize: bold ? 15 : 13,
        fontWeight: bold ? 800 : 600,
        color: tone === "ok" ? "var(--accent)" : tone === "warn" ? "var(--warn)" : undefined,
        fontFamily: mono ? "ui-monospace, Menlo, Consolas, monospace" : undefined,
      }}>
        {value}
      </span>
    </div>
  );
}

function todayKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
